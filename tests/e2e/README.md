# tests/e2e: the real app, end to end, on Linux

The built app (not Vite, not a mock engine) run with no screen and no guitar:
a virtual display, a virtual sound card, a synthesised guitarist who listens
to the click, and WebDriver pressing the buttons. It answers the questions the
unit and layout suites cannot: does a Take recorded through a real input,
graded by the real scorer and saved in the real store, come back after a
restart; and does the click hold while the 3D neck draws.

```sh
npm run test:e2e                         # build, then placement, session, relaunch, two-paths, warmup, four-fingers, gpu-info
npm run test:e2e -- --no-build           # use the binary already built
npm run test:e2e:probe                   # the click with the neck vs the headless probe
node tests/e2e/run.mjs --help
```

Exit 0 when every check passes, 1 when one fails, 2 for a setup error.
Results (`results.json`), screenshots of every result screen and the in-app
probe reports land in the `--out` directory (a temp dir by default, printed at
the end).

## What it covers

| Scenario | What happens | Checks |
|---|---|---|
| `placement` | A fresh profile (no Path started). Today, 5 minutes, Start. The planner puts a new player on the first Path, Shred (`FIRST_PATH_ID`), and a new Path's first block is placement: "Open A, sixteenths" at its first rung, 60 BPM. A good easy Take, then Exit. | Today says "First session · finds where you start". The Session is placement on Shred's first Exercise at the first rung. The Take passes and is saved on `shred`; the next Take offered is at the pass tempo (110). The pass-tempo Take is not played, so the Sessions after this one stay on Step 1. |
| `session` | The second Session (after `placement`; run alone it plays `placement` first). Today, 5 minutes, Start: an ordinary focus block on Shred's first Exercise. A good take, then Go again with a sloppy one, then a silent one, then one whose first bar is fluffed (80 ms of scatter) and the rest good. Exit. | Not placement. Good: "PASS BAR MET", a `path_takes` row passed and caught, `countsForCleanTempo`, the clean tempo stored at the Take's tempo. Sloppy: "THE BAR IS 90% / Evenness was …" (the Exercise's own evenness bar), row caught and not passed, the evenness check not held, the clean tempo unmoved. Silent: "I didn't catch enough", row not caught. Fluffed first bar: the Take ran its `takeBarsOf` bars (10), "PASS BAR MET", `countsForCleanTempo` with `heldBars` ≥ 8 starting after bar 0, and the clean tempo moved up to its tempo (the Take's two bars of slack, owner 2026-11-17). |
| `relaunch` | Quit with the window's Close, start the app again on the same profile. | Today no longer plans a first Session; Progress shows the Exercise and its clean tempo. |
| `warmup` | Today, 10 minutes, Start: the warm-up. Slower on its ready screen, Start, Pause, Faster while paused, Resume, Space, Restart, the Next link, then Back to the warm-up from the next step, and Exit. No Take is saved. | Slower takes 5 BPM off and the click plays at it; Pause stops the click and holds the clock; Resume plays again at the new tempo with the clock running; Space pauses rather than skipping; Restart fills the clock and plays; Next moves on with the click stopped and the warm-up's pip marked skipped; the next step goes back to the warm-up; Exit reaches Today. |
| `two-paths` | Paths, Alternate Picking, Subscribe. Today, 20 minutes: the plan is read, then Start, and the Session is walked through (past the warm-up, one good Take on each Exercise it reaches, Move on past "Go again") until both Paths have a Take in it. | Today's "Running" line names both Paths; the plan has a block from each, Alternate Picking's as placement ("Find your level"); the Session saved Takes on both `shred` and `alternate-picking`, and every good Take passed. |
| `four-fingers` | Paths, Alternate Picking, Step 1, "Four fingers, one string", Play this, Faster to 80 BPM, a good take. | The Take is at 80, passes, and the clean tempo 80 is stored. |
| `blues-band` | Paths, Blues and Pentatonics, "A on every downbeat" (a Texas shuffle: drums and bass under the Take, `src/session/takeBand.ts`). The band starts off (the virtual input is a "microphone" to the app); the player puts it at 0.8. Good, sloppy 35 ms, sloppy 80 ms and wrong-notes takes over the band, then good, 35 and 80 ms again with the band at 0 in a fresh launch, as the control. The player keeps time with the drummer after the count-in (`playOverBand`): the click is off under a band. `--bleed <dB>` also loops the app's output back into its input. | The band starts off on a microphone; the good take passes and stores its clean tempo; the player heard the band's beats; the 80 ms take and the wrong notes fail. The 35 ms take and the control are recorded (results in `plans/revamp/GRADING_LIMITS.md`, "Over the band"). |
| `gpu-info` | `webkit://gpu`, the GL libraries mapped into the app, and what the page's WebGL says its renderer is. | Recorded, not checked. Under Xvfb WebKit reports policy "never" (software compositing) but WebGL still runs on the GPU through NVIDIA's EGL; with `--gpu`, policy "always". |
| `neck` | Four fingers, three good Takes back to back (60, 70, 80 BPM) with the neck on screen and the in-app probe armed. | Every Take passes; the probe's hard gates (missed beats, callback allocations/frees, dropped notifications) are 0; p99 jitter < 1 ms is advisory, as in `AGENTS.md`. Also records which neck was drawn (WebGL2 canvas or not), CPU cores per process while playing, and whether `nvidia-smi` lists the web process. |
| `baseline` | `click-jitter-probe --no-llm` in the same PipeWire, for comparison. | The same gates. |
| `restart` | Not in the default set. In one launch: Today, Start, Exit, Start at once; Exit, then a Step's Play this; a tab hotkey (Metronome) out of a Session and Today's hotkey back, Start; Settings opened and closed mid-Session; Exit, Tools, back, Start. A good take after each. | Every one of those takes is heard and passes (B1, 2026-11-16: a Session started again in the same run heard nothing). |
| `wrong-notes` | Not in the default set. Alternate Picking, "A minor up one string" (names `noteIdentity`), Play this: a good take, then three takes with every other note a semitone sharp, on the clean virtual input with no band. | Right notes are measured (`pass.notes.status` "measured") on every take; the good one passes; each wrong one fails on right notes (B2: one passed with `notRun`). |

Every launch has the in-app click probe armed (below), so `placement`,
`session`, `two-paths` and `four-fingers` also leave a probe report of a real
Session with the neck drawing.

The scenarios share one profile and run in the order above: `session` and
`relaunch` read what `placement` left, and `two-paths` needs the first Path
started. Which Exercise a Session screen is on is read off the screen
(`exerciseOnScreen` in `lib/exercises.mjs`) and looked up in the shipped packs,
so a change to the planner's choice moves the Take rather than failing to find
it.

## How it is put together

- **A profile of its own.** `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
  `XDG_CACHE_HOME` and `XDG_RUNTIME_DIR` all point into one `mkdtemp`. The
  app's store and `practice.db` are under `$XDG_DATA_HOME/com.yames.metronome`.
  The owner's profile, audio server and display are never touched. The
  settings are seeded as a returning player who finished setup
  (`onboarding.version`, `onboarding.completedAt`), so the app opens on Today;
  the first-run wizard is M1's and not tested here.
- **Display.** `Xvfb` by default. `--gpu` starts `Xorg` on the NVIDIA GPU with
  no monitor (`AllowEmptyInitialConfiguration`, a virtual 1280x1024 screen),
  which needs passwordless sudo and the NVIDIA Xorg driver. With it the app is
  started with the `render` group (via `sudo setpriv`, as a desktop seat's ACL
  would give), and with `WEBKIT_DMABUF_RENDERER_FORCE_SHM=1`: WebKit's DMABuf
  renderer otherwise asks the KMS node for dumb buffers, which only the X
  server may make, and WebGL then has no context at all.
- **Sound.** A private `dbus-daemon`, `pipewire`, `wireplumber` and
  `pipewire-pulse`, with two null sinks: `yames_out` (the default sink, the
  app's output) and `guitar` (its monitor is the default source, the app's
  input). cpal opens ALSA's `default`, which PipeWire's ALSA plugin routes to
  them. With passwordless sudo the PipeWire data-loop threads (the daemons'
  and the plugin's inside the app) are put at `SCHED_FIFO` 88, which is what
  rtkit does on a desktop; without it a busy machine stalls the graph and the
  stall reads as the app's fault. The app's own cpal threads are left alone:
  cpal does not promote them on Linux, and the probe should measure that.
- **The guitarist** (`lib/player.mjs`). Takes are rendered from the shipped
  packs (`src/paths/packs/shred.json`, `alternate-picking.json`), one Karplus-Strong pluck
  per note at the right pitch, for `takeBarsOf` bars: "good" is 1.5 ms of
  scatter, "sloppy" 35 ms (clipped at 70), "fluffed" the first bar at 80 ms
  (clipped at 160) and the rest at 1.5, "silent" nothing.
- **Lining the take up with the transport.** The player records
  `yames_out.monitor` and plays into `guitar` with `pacat`, fed on its own
  clock with a fixed lead. Before the run it measures, with a pulse, how long a
  sample takes from being written to `guitar` to being caught on its monitor,
  and takes that off every note. It then does what a player does: the first
  four clicks after Start take are the count-in, and every click it hears
  places the notes of the next beat, one beat ahead, at the median spacing of
  the last few clicks. So the notes go into the guitar sink when the click
  went into the output sink; what is left is the app's own input and output
  latency, which is what the scorer's lag estimate exists to remove. Because
  it follows the click, a stall in the app's output makes the take late with
  it, as it would a person, and shows up in the probe rather than as a
  sloppy take. (An earlier version predicted the whole take from the
  count-in; on a busy machine the app's clock drifted from PipeWire's and a
  good take came out 70 ms early by the end.)
- **The UI** is driven through `tauri-driver` and `WebKitWebDriver` with a
  small W3C client over `fetch` (`lib/webdriver.mjs`); buttons are found by
  their text, as a player would. The store is read with `node:sqlite`.

## Requirements (Ubuntu 24.04)

```sh
sudo apt-get install -y xvfb x11-utils webkit2gtk-driver pulseaudio-utils \
  pipewire pipewire-pulse wireplumber pipewire-alsa dbus
cargo install tauri-driver --locked
```

Node 22.5 or later (`node:sqlite`). The Tauri build dependencies as for any
build. `--gpu` also needs `xserver-xorg-video-nvidia-*` and passwordless sudo.

## Known bugs it finds (2026-11-16)

1. **A Take never ends by itself** (and neither does a non-looping song, or a
   jam whose form ends). `engine.rs`, the event loop's park branch: it reads
   `playing` after `park_timeout`. The audio thread pushes the end
   notification, which unparks the loop, and then lowers `playing`; the woken
   loop sees the flag down and `drain()`s the notification that woke it.
   `is_playing` stays true, `jam-ended` never fires, and the Session sits on
   "End take" after the last bar. Every run of `session` reproduces it on
   `revamp`; the fix (read the flag before parking, drain only if it was down
   on both sides) is on branch `mvp-e2e-song-end`, and with it the Take ends
   within 100 ms. Until it is merged, the suite presses End take itself, the
   bar it stopped in is not counted, and the clean-tempo checks fail.
2. **The stage cannot tell a software renderer on WebKitGTK.** WebKitGTK
   masks `WEBGL_debug_renderer_info` and answers "Apple GPU" whatever draws, so
   `isSoftwareRenderer` in `src/stage3d/webgl.ts` can never match on Linux and
   the 3D neck is never refused there, llvmpipe or not. (Here it happens not to
   matter: even under Xvfb, WebKit's WebGL goes through NVIDIA's EGL and
   `nvidia-smi` lists the web process; only the compositing is in software.
   A tester on a VM or without GPU drivers would get the neck on llvmpipe.)

## Measuring the click with the neck

```sh
npm run test:e2e:probe            # = bash tests/e2e/probe.sh; add -- --no-build to skip the build
```

Runs the headless `click-jitter-probe` (60 s) and the app with the neck for
three Takes on Xvfb, then, when there is an NVIDIA GPU and passwordless sudo,
the same three Takes on an X server on the GPU. Writes `summary.md` (one row
per run: the four numbers, CPU per process while playing, the load average)
and `load.txt` (`uptime` and the top CPU users before and after each part).
The numbers are a gate result only on a quiet machine; the load is beside
them so a reader can tell.

## The in-app click probe

`YAMES_CALLBACK_PROBE=1` makes the app build its engine the way the headless
`click-jitter-probe` does (`src-tauri/src/app_probe.rs`). It writes the same
four numbers to `YAMES_CALLBACK_PROBE_OUT` (JSON, raw capture beside it as
`.csv`) when the main window closes, or now through the
`callback_probe_report` command. The allocation count needs a build with
`--features callback-probe-alloc` (the suite's build has it); without the
feature the report says `"allocs_counted": false`. The app starts and stops
the transport, so the capture is cut into runs where the engine's sample
counter starts again, and jitter and missed beats are worked out inside runs.
