# Yames — Agent notes

Quick reference for Claude / Wibey / other coding agents working in this repo.

## Tech stack

- **Frontend**: React 18 + TypeScript + Vite 6
- **Desktop shell**: Tauri 2 (Rust backend in `src-tauri/`)
- **Package manager**: project uses **bun** locally, but Tauri's
  `beforeDevCommand` / `beforeBuildCommand` invoke **npm** (see
  `src-tauri/tauri.conf.json`)
- **Test runner**: Vitest (`bun run test`) + cargo (`bun run test:rust`) +
  Playwright for layout (`npm run test:layout`, see `tests/layout/README.md`)

## Running the app

The full desktop app boots through Tauri. Don't try to verify with `vite`
alone — that only spins the web view and misses any Rust-side breakage.

```sh
# From a non-interactive shell (no nvm / cargo on PATH by default):
export PATH="$HOME/.nvm/versions/node/v20.15.1/bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
npm run tauri dev
```

Notes:
- The first cold compile of the Rust crate takes ~1–2 minutes; incremental
  rebuilds are seconds.
- `bun run tauri dev` works too, but Tauri's `beforeDevCommand` shells out
  to `npm run dev`, so `npm` must still be on PATH.
- A successful boot logs `App listening on …` and opens the window. Look
  for `error[`, `error:`, `panic`, or `FAILED` in the output to detect
  breakage.

## Building with the coach LLM

`default = []`, so a plain build has **no** LLM — `coach.rs` runs the
template engine. Turn it on with exactly one Cargo feature:

| Feature | Backend | Use |
|---|---|---|
| `coach-llm` | CPU only | dev machines, CI fallback, the jitter probe |
| `coach-llm-metal` | Metal | shipping macOS |
| `coach-llm-vulkan` | Vulkan | shipping Windows + Linux |

The GPU features imply `coach-llm`; never enable two backends at once.
The inference worker asks for all layers on a GPU build and llama.cpp
keeps them on the CPU when it finds no usable device, so one binary serves
both — set `YAMES_LLM_GPU_LAYERS=0` to put every **layer** on the CPU on a
GPU build.

**That is not a CPU-only switch, whatever it looks like.** T06 measured it:
a `coach-llm-vulkan` binary with `YAMES_LLM_GPU_LAYERS=0` still registers
the Vulkan backend and still allocates a 630 MiB compute buffer, because
the backend is chosen at compile time and the variable only moves layers.
A run that must have no GPU in it at all — the CPU row of the audio-safety
gate, or a machine whose driver is the thing under suspicion — needs a
binary built with plain `coach-llm`.

The model, its `LlamaContext` and the llama.cpp backend live on a single
long-lived thread (`coach::llm::LlmWorker`), demoted to below-normal
priority once at spawn. Do not move inference back onto the tokio
blocking pool: `LlamaContext` is not `Send`, `LlamaBackend::init()` is a
process-wide one-shot, and lowering a pool thread's priority per call
cannot be undone on Linux.

```sh
cargo build --manifest-path src-tauri/Cargo.toml --features coach-llm-metal   # macOS
cargo build --manifest-path src-tauri/Cargo.toml --features coach-llm-vulkan  # Windows / Linux
```

`npm run tauri dev` and `npm run tauri build` pick the right one for the
host automatically — `scripts/tauri.mjs` injects it unless you pass
`--features` yourself. That matters because `default = []`: without a
feature flag `coach::llm_compiled()` is false, the wizard greys out both
brain tiers ("this build can't run a model"), and the entire coach path
goes untested while every shipped binary has it. Set `YAMES_DEV_NO_LLM=1`
to skip the injection when you are only touching the frontend and do not
want to pay the llama.cpp compile. On Windows the wrapper also exports
`CMAKE_GENERATOR=Ninja` and a short `CARGO_TARGET_DIR` when they are
unset, for the MAX_PATH reasons below. CI is unaffected: `release.yml`
runs `tauriScript: npx tauri` with its own explicit `--features`.

Prerequisites beyond the usual Rust + cmake (aubio already needs cmake):

- **All platforms**: cmake, a C/C++ compiler, and `libclang` for bindgen
  (`LIBCLANG_PATH` must point at the directory holding `libclang.dll` /
  `.so` / `.dylib`).
- **macOS**: Xcode command line tools. Metal needs nothing extra.
- **Windows**: the MSVC toolchain (`stable-x86_64-pc-windows-msvc` plus
  VS Build Tools) and the LunarG Vulkan SDK (`VULKAN_SDK` set,
  `%VULKAN_SDK%\Bin` on PATH for `glslc.exe`). MSVC is **required** for
  the LLM features: on `x86_64-pc-windows-gnu` the `cmake` crate falls
  back to the MSYS Makefiles generator and `llama-cpp-sys-2`'s build
  script then panics on `assert_ne!(llama_libs.len(), 0)` because the
  install step lays the libraries out where it does not look. The
  default (no-LLM) build still works fine on GNU.
  Build from a short path, or set `CARGO_TARGET_DIR` to one: llama.cpp's
  CMake TryCompile tree pushes the default `src-tauri/target/...` past
  MAX_PATH and MSBuild's CL tracker then fails with
  `MSB6003 ... cmTC_*.tlog` not found.
  With `CMAKE_GENERATOR=Ninja`, **`ninja.exe` must be on PATH** — use the
  copy shipped with VS Build Tools
  (`…\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja`),
  never w64devkit's. If it is missing, cmake caches
  `CMAKE_MAKE_PROGRAM-NOTFOUND` and every later build fails with an empty
  build-tool name (`CMake Error: Generator: build tool execution failed,
  command was:  -j 16 install`) even after ninja is added, because the
  configure step is skipped. Delete
  `$CARGO_TARGET_DIR/debug/build/llama-cpp-sys-2-*/` to recover.
- **Linux**: `libvulkan-dev`, `glslc` (shaderc), `libclang-dev`, cmake.

Smoke test — skipped when the env var is unset, so it is safe in CI:

```sh
YAMES_TEST_GGUF=/path/to/tiny.gguf \
  node scripts/rust-test.mjs --features coach-llm --lib
```

The wrapper, not a bare `cargo test --lib` — on Windows the unit-test
harness will not load without the manifest it supplies (see the Windows
section below).

## Fast validation chain (no app boot)

After a refactor / surgical edit, run these in order — they catch the
overwhelming majority of breakage without paying the Rust compile cost:

```sh
$HOME/.local/bin/bun run tsc --noEmit   # strict TS, no emit
$HOME/.local/bin/bun run test           # Vitest unit suite
$HOME/.local/bin/bun run build          # tsc + vite production build
```

**If you touched a stylesheet or the shape of a screen, add
`npm run test:layout`.** Vitest runs in happy-dom, which computes no geometry
— every element there is zero by zero — so "the control is outside its row"
and "the menu opens off the edge of the window" are invisible to all four
thousand unit tests. Both of those shipped. The layout suite drives the real
UI in a real browser at four window widths and measures the rectangles; it
takes about ninety seconds. See `tests/layout/README.md`.

Only once these are green should you spin up `tauri dev` to verify the app
actually opens.

## Repo layout (top-level `src/`)

- `containers/main-window/` — the app shell (`MainWindow`, header,
  floating play button, theme effects, share menu) and its dedicated
  hooks under `containers/main-window/hooks/`.
- `containers/metronome/` — the metronome screen (`MetronomeView`).
- `containers/drill/` — drill / speed-ramp tab.
- `containers/pocket-check/` — track-evaluation tab.
- `containers/practice-coach/` — coach card, feed, history, session
  detail.
- `containers/settings/` — settings overlay + all section components,
  modals, and `SettingsView` composition.
- `containers/zen/` — fullscreen / zen-mode view + transition.
- `components/` — reusable presentational components.
  - `components/presets/` — `PresetSidebar`, `PresetSaveBar` (used by
    multiple containers).
- `hooks/` — app-wide custom hooks (metronome, MIDI, gamepad, drag, tap
  tempo, keybindings, evaluation, session, etc.).
- `ipc.ts` — single typed wrapper around all Tauri `invoke` / `listen`
  calls. Always route IPC through here, never inline.

## Refactor conventions

- **No file rewrites.** Edit surgically. Rewriting a large file has shipped
  broken code before (v0.7.0).
- **Hooks before re-orgs.** When a `*View` or container grows past
  ~600 lines, extract effect-heavy logic into a dedicated hook in
  `containers/<name>/hooks/`. Keep app-wide hooks in `src/hooks/`.
- **Validate after every step.** Run `tsc --noEmit` + tests after each
  extraction — don't batch.
- **Imports**: dedicated hook folders use relative imports
  (`../../../ipc`, `../../../types`, etc.). Run `tsc --noEmit` after
  moving files; TS `noUnusedLocals` will flag any orphaned imports.

## Roadmap & plans

- `plans/ROADMAP.md` is the single active planning document (mission,
  current state, phased work with acceptance gates, non-goals). Read it
  before starting any coach / DSP / curriculum work.
- `plans/archive/DSP_AND_COACH_PLAN.md` is the archived design spec for
  the shipped scoring pipeline — code comments cite it for the *why*.
- `plans/ONBOARDING_PLAN.md` is the first-run / product-polish track
  (wizard, tour, hints, empty states).
- `plans/tasks/<phase>/T0N-*.md` are self-contained briefs, one per
  worker session. If you were handed one, follow it and its README.
- `plans/MOBILE_IMPLEMENTATION_PLAN.md` is out of the current horizon.

## Building on Windows (MSVC — matches CI)

The repo carries a `rustup override` to `stable-x86_64-pc-windows-msvc`
(set 2026-09-02). Do not build Yames with the `-gnu` toolchain: Rust
test binaries fail to start (`STATUS_ENTRYPOINT_NOT_FOUND`,
`TaskDialogIndirect` — no manifest, so comctl32 5.82 is loaded) and the
cdylib link fails (`export ordinal too large`). Both are GNU-only
defects; CI's `windows-latest` uses MSVC.

Prerequisites (all installed on the owner's laptop):
- Visual Studio 2022 Build Tools with the "Desktop development with
  C++" workload (MSVC 14.44 + Windows SDK 10.0.26100). rustc, `cc`
  and cmake find it via vswhere; no `vcvars` needed.
- cmake (aubio-sys, llama-cpp-sys).
- LLVM 17 (`C:\Program Files\LLVM`) for `libclang` — aubio-sys uses
  bindgen 0.58, which rejects clang ≥ 18. Set
  `LIBCLANG_PATH=C:\Program Files\LLVM\bin` (user env var on the
  owner's machine; agent shells do NOT inherit user env — export it).
- Vulkan SDK 1.4.x (`C:\VulkanSDK\<ver>`, `VULKAN_SDK` machine-wide)
  for the `coach-llm-vulkan` feature; `glslc.exe` is in `Bin`.

Fast check that the toolchain is sane (clean target dir, ~3 min):

```sh
LIBCLANG_PATH="C:/Program Files/LLVM/bin" npm run test:rust
```

Use the npm script on Windows, not a bare `cargo test --lib`. The unit-test
harness needs a Common-Controls v6 manifest that only `scripts/rust-test.mjs`
supplies; without it the binary dies at load with
`STATUS_ENTRYPOINT_NOT_FOUND` (0xc0000139) before a single test runs. See
`src-tauri/tests-common-controls-v6.manifest`. `npm run test:dsp` and
`test:highbpm` need nothing special — `src-tauri/build.rs` covers the
integration-test harnesses.

## Audio-safety gate — the click-jitter probe

ROADMAP §1 principle 1 says nothing may add jitter to the metronome, and
§4 makes that testable: **p99 callback-to-callback jitter < 1 ms and zero
missed beats over 60 s while the LLM generates continuously.** Re-run it
whenever a change adds background compute.

```sh
bun run yames:jitter-probe -- --no-llm                  # baseline
# LLM runs need the feature, so call cargo directly:
cargo run --release --manifest-path src-tauri/Cargo.toml \
  --features coach-llm-vulkan --bin click-jitter-probe -- --gguf model.gguf
# Layers on the CPU — but the Vulkan backend is still registered and still
# takes its 630 MiB buffer. A run with no GPU in it needs `--features coach-llm`.
YAMES_LLM_GPU_LAYERS=0 cargo run --release ... --gguf model.gguf
```

The probe runs the real `MetronomeEngine` headless (`start_headless`,
no Tauri app) and times the cpal callback from inside it via
`CallbackProbe` — a preallocated lock-free arena, `None` unless the probe
built the engine, so the shipping callback pays one null check per
buffer. `--dump-csv` writes the raw capture so a run can be re-analysed
without re-running it. Exit 0 = pass, 1 = gate failure, 2 = setup error.

**It gates on four numbers, not one.** Entry-to-entry gaps cannot see an
allocation or a stall *inside* a buffer, so two of the four come from
elsewhere:

| Number | Where it comes from | Gate |
|---|---|---|
| p99 callback jitter | `CallbackProbe` timings | < 1 ms (advisory on a busy box) |
| missed beats | audio clock vs wall clock | 0, hard |
| callback allocations / frees | the probe's own `#[global_allocator]`, armed by `alloc_probe` for the span of the callback body | 0, hard |
| dropped notifications | `MetronomeEngine::dropped_notifications` | 0, hard |

The allocator counts `malloc`, `realloc` **and** `free` made while the
callback body is running, and nothing cpal does around it — the flag covers
our closure, not the whole stream thread, because a `malloc` in the backend
is not a Yames defect. A dropped notification is a *scoring* failure rather
than a timing one: `beat_log` is the only place `TimingAnalyzer` learns
where a beat fell, so one of them is an expected onset the player is
marked down for missing.

Two things the numbers depend on, and one that is not a Yames bug:

- **Other load on the box invalidates a run.** A parallel `cargo test`
  taking six cores pushed the *baseline* p99 from 0.35 ms to 2.46 ms.
  Check the machine is quiet before believing a failure.
- **cpal already runs its WASAPI stream thread at
  `THREAD_PRIORITY_TIME_CRITICAL`** (`cpal-0.15.3/src/host/wasapi/
  stream.rs`). Do not try to "fix" jitter by touching the callback.
- **ggml's threadpool defeats `with_below_normal_priority`.** That helper
  demotes only the calling thread; llama.cpp's worker threads start at
  `THREAD_PRIORITY_NORMAL` and `ggml_thread_apply_priority` explicitly
  disables power throttling on them. llama-cpp-2 0.1.146 exposes no
  `GGML_SCHED_PRIO` knob, so CPU inference is measurably noisier than GPU
  inference.

### What in the output callback must not be touched

`engine.rs`'s cpal output callback is the one function in this repo where
"it works" is not the standard. Before editing it, know these:

- **The beat queue is the only way out of it.** `BeatQueue` is preallocated
  when the stream opens and never grows; a push is an acquire load, thirteen
  relaxed stores and a release store, then one `Thread::unpark`. Do not put
  a channel back — `std::sync::mpsc` allocates a block every 31 messages
  and locks the receiver's waker on every send, which is a `malloc` and a
  priority inversion per tick and is what this replaced.
  **Its packed flag word is full.** `pack_small_fields` spends exactly 32
  bits (three `u8`s, a three-valued enum, six flags), which is why the song's
  position travels in three `u32` arrays of its own rather than in it. A new
  flag needs another array or a narrower packing;
  `the_small_word_is_full` fails loudly either way.
- **There are two schedulers in the frame loop, not one.** A jam is a lookup
  on a tick the click was going to play anyway; a SONG (`song.rs`) is a cursor
  walking a table of absolute sample positions, and while one is loaded the
  click's own `next_beat_sample` branch never runs. The two arms exist as
  `if / else if` rather than a `match` for a borrow reason worth knowing: the
  song's arm borrows `cached.song`, the click's arm mutates `cached`, and NLL
  only allows that when each borrow begins and ends inside its own arm.
- **A song's end is keyed on the frame it happened on, not on the flag that
  stops the buffer.** `song_ended_here` stays up for the rest of the buffer
  so nothing further sounds; `ends_here` is the one frame. Keying the
  notification on the former pushed one per remaining frame — up to a whole
  buffer of them, and as many `jam-ended` emits behind them.
- **Every lock in there is a `try_lock`, and every failure is survivable.**
  The state snapshot, the jam table, the form position, the take slots, the
  coach's clip and the three retirement lists all fail by leaving the
  cached value alone and trying again next buffer. A `lock()` anywhere in
  the callback is a bug however short the critical section looks.
- **The callback never frees.** `JamRetirement`, `SongRetirement`,
  `take::TakeParking` and `speech_out::SpeechParking` exist so the LAST `Arc`
  to a table, a song, a take or a line of speech is dropped on a thread that
  may call `free()`. A new owned value on this path needs the same treatment;
  the probe's allocator counts frees and will fail the run.
- **`voices` and `cached.beat_groups` are sized, not grown.** Every
  `voices.push` is guarded by `voices.len() < MAX_VOICES`; `beat_groups`
  is refilled in place against a capacity of `MAX_BEAT_GROUPS`, which
  `commands::validate_beat_groups` is what keeps honest. Adding a push
  without the guard, or letting a longer grouping through validation, is a
  reallocation under the mixer.
- **The event loop runs at normal priority on purpose** — see the comment
  above it. Do not promote it again without first showing that the callback
  depends on it, which since the queue landed it does not.
- **Re-run the probe.** `--jam-swap --jam-move --jam-take` together is the
  busiest path the engine has: the band on every tick, a live table
  handoff, the form moving, and a take being written to disk underneath.
  **And `--song-loop --song-take`**, which is the other scheduler entirely: a
  tempo map with a step in it, a meter change, a loop seam every few seconds
  with voices ringing across it, and a take over the top. Neither run covers
  the other.

## Frame rate during a Take, and the smoothness gates

Rule 1 of the 3D neck's brief (`plans/tasks/revamp-3d/BRIEF.md`) is "the
click is sacred": the canvas draws on demand, never on a calm screen, and
while a Take runs it must not cost the click anything. For the neck that has
been written as a number since it was built: **30 frames a second at most
during a Take**. The runway's lane and the tab's cursor never had that cap
(they moved on every display frame, 30 only on WebKitGTK). Since 2026-11-19
the three read one governor, `src/stage3d/takeRate.ts`:

- **The lane and the cursor follow the display**, up to 120 frames a second
  (`TAKE_FPS_MAX`; a 144 or 165 Hz display is drawn in full, a 240 Hz one
  every other frame, so the spacing is always even).
- **The neck follows the display too** since 2026-11-20 (`NECK_FOLLOWS_DISPLAY`
  in `takeRate.ts`, on since the gate below passed on a quiet machine: p99
  0.82 and 0.98 ms at 60 against 0.84 and 1.04 ms at 30, zero missed beats,
  allocations or dropped notifications; runs in
  `~/projects/.preview/smooth/beta9-1120-0231/`). Everything below applies to it.
  `"stage.takeFps": "display"` in a machine's settings store turns it on for
  that machine alone (`?takefps=display` in the shot harness).
- **Everything starts at 30 where the machine says it should**
  (`takeCeiling`): a webview that likely composites on the CPU (WebKitGTK,
  which is every Linux build), the stage's lowest quality tier or a machine
  that cannot draw the 3D neck at all (software rendering, old phone GPUs),
  four cores or fewer, 2 GB or less, the player's reduced-motion or data-saver
  setting, a battery at 20% or under while discharging. There is no web API
  for an OS battery-saver switch; that last one is the nearest a webview has.
- **And falls back to 30 during the Take on what the frames do**
  (`TakeRate.sample`): a window of 30 frames in which a quarter came more
  than 1.6 display frames late, or in which drawing took over half the
  frame's budget on the main thread, and the rest of that Take runs at 30.
  Twice, and it stays at 30 until the app is restarted.
- **`stage.takeFps` as a number** forces that rate for all three, past the
  hints and the fallback. No switch in Settings yet. `?takefps=<n>` does the
  same in the shot harness.

**The gate for `NECK_FOLLOWS_DISPLAY`**: the e2e probe with the Take forced
to the display's rate, against the same Take forced to 30, on a quiet
machine (load average under 6): zero missed beats, zero callback
allocations and frees, zero dropped notifications, and p99 jitter no worse
than the 30 run's.

```sh
npm run test:e2e:probe -- --no-build --take-fps 30    # the control
npm run test:e2e:probe -- --no-build --take-fps 60    # the neck at the display's rate
```

`summary.md` names the rate asked for and how far apart the neck's frames
really were (`info.neck.frames` in `results.json`: also the stage's mode, its
tier and the frame-time guard's verdict). Three things to know before
reading a run on the DGX Spark:

- **Only the GPU leg shows a 60 Hz Take.** Under Xvfb, WebKitGTK serves the
  page an animation frame every 43 ms whatever is asked for (measured: the
  neck's frames 43 ms apart at "30" and at "60" alike). On the X server on
  the GB10 the page's frame is 16 to 17 ms, and a Take forced to 60 drew the
  3D neck 18 ms apart (median; tier 2, the guard at 1 ms a frame).
- **A busy machine makes every number meaningless, in both directions.** The
  runs of 2026-11-19, all with other agents' suites running (hard gates 0 in
  every one of them):

  | Take | leg | neck | load (1 min) at start, after | p99 jitter ms | max ms | PipeWire "too slow" |
  |---|---|---|---|---|---|---|
  | 30 | Xvfb | 3D, frames 43 ms apart | 8.2, 13.3 | 1.32 | 4.6 | 0 |
  | 30 | GPU | SVG (no 3D frame drawn) | 13.3, 10.1 | 5.24 | 20.8 | 3 |
  | 60 | GPU | 3D, frames 18 ms apart | 14.7, 29.5 | 21.72 | 82.6 | 14 |
  | 60 | Xvfb | not run: calibration heard 3 of 8 pulses | 96.8 | - | - | - |

  The 60 row is not evidence against 60 (the load doubled under it, and the
  30 row beside it drew no 3D frame at all), and it is not evidence for it.
  For scale, on a quiet day the same probe with the neck at 30 read p99
  0.374 ms on Xvfb and 0.676 ms on the GPU (`plans/HANDOFF-finisher.md`).
- `~/projects/.preview/smooth/scripts/probe-ab.sh <out> 30 60 30 60` runs the
  pair twice, waits for the load to fall under 6 before each run, and skips
  a run rather than make it on a busy machine.

**Before raising, lowering or removing any of these limits, measure**, with
that command. Linux is the only platform the probe runs on, and it is the
one platform the app holds to 30 by itself: a pass here is the gate, and a
Take on Windows, macOS and Android with the switch on is still worth a
player's ear.

The rest of "smooth" is held by the layout suite, and found with it:

- `tests/layout/smooth.spec.ts` fails on a long task during a running Take
  (best of three windows), on the tab's notes or the overview strip being
  redrawn per beat, on the level meter reading the layout to pulse, on the
  lane missing display frames, and on the 3D engine being built in the frame a Session opens on
  (it is built while Today, Paths or Progress sit idle: `NeckStage.prewarm`).
- `tests/layout/smooth-measure.spec.ts` is the survey (frame gaps, long
  tasks, React commits and who rendered, layouts, running animations; with
  `YAMES_PERF_GL` on the machine's GPU). Run it before and after anything
  that touches a per-frame or per-beat path; see `tests/layout/README.md`.
- **The app's shell still re-renders at every beat.** `MainWindow` holds
  `currentBeat` in state and passes it down, so every report from the engine
  (about nine a second in a Take) renders the window. A child spared that
  needs `memo` and props that do not change: `useStableHandlers` wraps a set
  of inline handlers for exactly that (the rail). A new per-beat cost belongs
  in a ref and a direct DOM write, as the runway, the tab's cursor and the
  neck's overlay do it, not in state.
- **Never restart a CSS animation with "class off, read `offsetWidth`, class
  on"** on a screen that is animating: it is a style-and-layout pass over the
  whole screen. Use `el.animate`, or check the class is there first.

## Coaching pipeline — latency tiers

Every coach feature belongs to exactly one tier. When adding pitch analysis,
coach messages, or new DSP features, use this to decide where it fits.

| Tier | Acceptable delay | Trigger | Examples |
|------|-----------------|---------|---------|
| **Real-time** | < 30 ms | Continuous, per audio hop | Onset dots, live timing ring, metronome click sync |
| **Mid-session tip** | 1–3 s | Fires while the user is actively playing | "Dragging the last 8 bars", dead note alert, legato credit |
| **Mid-session report** | 3–8 s | User finishes an exercise — hits Stop on the metronome | Segment mini-report, pitch technique summary for that exercise |
| **Post-session report** | 5–15 s | User ends a full practice session | Full session analysis, bend accuracy, key inference, coach narrative |

Key rules:
- **Real-time tier**: no I/O, no LLM, no model inference — DSP only.
- **Mid-session tips**: no *blocking* inference on the tip path. The
  gatekeeper and the template engine own what the tip says; the model
  may only rephrase it, and only within the 3 s budget on a GPU
  backend. On a CPU-only backend (`BACKEND == "cpu"`) tips skip the LLM
  entirely and ship the template — a CPU generation measured 7–11 s,
  three to four times the whole tier. Enforced in `coach::generate`,
  which takes `GenKind::Tip` and the compile-time backend into account
  before it touches the worker.
- **Mid-session / post-session reports**: correct home for ONNX pitch analysis (Basic-pitch processes a 30 s session in ~3–6 s; user is already reading the timing score — no perceived delay).
- The post-session window is **free real estate**: the coach LLM summary already runs here. Pitch analysis merges into the same report in parallel with zero additional perceived latency.

## Commit / branch hygiene

- Conventional prefixes: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`.
- A commit message starting with `release` triggers a release — that is
  what `release.yml` gates every one of its jobs on. `feat:` and `fix:`
  do not, whatever they say about the change. Pick the prefix that
  matches the actual change scope — don't bump a release for a docs-only
  change.
- Never run destructive git on uncommitted work (`reset --hard`,
  `checkout .`, `restore .`, `clean -fd`). A day of work was lost to
  this on 2026-05-14.

## When a worktree's work is merged, clean up after it

On 2026-09-20 this repo was holding 176 GB it did not need: a 109 GB
`src-tauri/target/debug` in the main checkout, 120 GB of per-worker build
caches from one night, and forty worktrees nobody had looked at since
their branch landed. Whoever merges a branch finishes the job, in the
same session, before saying the work is done:

1. **Only a worktree that is both merged and clean.** Merged means its
   HEAD is an ancestor of the branch it was for (`git merge-base
   --is-ancestor <head> <main|feature-branch>`). Clean means `git status
   --porcelain` is empty, or shows only the two vitest snapshot files and
   `git diff --numstat` on them is empty (a test run rewrites their line
   endings and nothing else). Anything else — uncommitted work, an
   unmerged branch, a long-lived one such as `mobile` — is left exactly
   as it is and named in the report. When in doubt it stays.
2. **Unlink before you remove.** If the worktree's `node_modules` is a
   junction to another checkout's, remove the link first (`cmd /c rmdir
   <path>\node_modules`). Deleting a tree through a junction empties the
   folder it points at.
3. **`git worktree remove <path>`, then `git worktree prune`.** Never
   delete the folder by hand and never delete the branch: the branch is
   the record and costs nothing.
4. **Delete the build caches the work created**: the worktree's own
   `src-tauri/target`, and any short `CARGO_TARGET_DIR` a brief handed
   out (`C:\yt-*`). A worker's cache is 12–15 GB. Check nothing is running
   out of it first. They rebuild; nothing else in them is worth keeping.
5. **Leave what is not a cache.** `C:\yt06models` holds the GGUF models
   the jitter probe and the LLM smoke tests need. Downloads, recordings,
   fixtures and anything under a data directory are never clean-up.
6. **Look at the main checkout's `src-tauri/target` while you are there.**
   Past ~30 GB, delete `target/debug` (keep `release`) when nothing is
   running from it, and say that the next `tauri dev` is a full rebuild.
7. **Say what you freed and what you left**, with sizes, and why each
   thing that was left was left.

An orchestrator running several workers does steps 1–4 for each worker as
its branch is merged and verified, not at the end of the night: ten idle
caches are 120 GB.
