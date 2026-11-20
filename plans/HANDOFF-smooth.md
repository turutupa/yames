# Handoff: the smoothness pass (branch `mvp-smooth`, 2026-11-19)

For the agent who picks this up. Owner, 2026-11-19: "the app has to feel
completely flawless and super smooth", without ever hurting the click.

Worktree `~/projects/yames-mvp-smooth`, branch `mvp-smooth` from `revamp`
642b03a1. Evidence in `~/projects/.preview/smooth/` (start with `SUMMARY.md`).
Board card #80 (Personal board, project Yames).

## The one thing that is open: the neck's frame rate during a Take

**Read this before anything else, because the brief asked for it and it did
not happen.** The 3D neck is still held to 30 frames a second during a Take.
Everything to draw it at the display's rate is built, tested and merged-ready,
behind one switch that is off: `NECK_FOLLOWS_DISPLAY` in
`src/stage3d/takeRate.ts`.

It is off because the brief's condition for turning it on was the e2e click
probe ("0 missed beats and jitter within the gate"), and that probe needs a
quiet machine. On 2026-11-19 the DGX Spark was never quiet: the 1-minute load
was between 8 and 96 all afternoon (other agents' layout and e2e suites, and
another user's pytest runs). The runs that were made:

| Take | leg | neck | load (1 min) at start, after | missed beats | allocs/frees | dropped notif. | p99 jitter ms | max ms | PipeWire "yames too slow" |
|---|---|---|---|---|---|---|---|---|---|
| 30 | Xvfb | 3D, frames 43 ms apart | 8.2, 13.3 | 0 | 0/0 | 0 | 1.32 | 4.6 | 0 |
| 30 | GPU X | SVG (no 3D frame drawn) | 13.3, 10.1 | 0 | 0/0 | 0 | 5.24 | 20.8 | 3 |
| 60 | GPU X | 3D, frames 18 ms apart | 14.7, 29.5 | 0 | 0/0 | 0 | 21.72 | 82.6 | 14 |
| 60 | Xvfb | not run (harness calibration failed) | 96.8 | - | - | - | - | - | - |

What that says: the hard gates were 0 every time, and nothing else. The 60
row's jitter is far over the gate, but the load doubled under it and its
Take was not graded as passed (the player heard clicks up to 100 ms late,
which is PipeWire starving, the 14 "too slow"); the 30 row beside it drew no
3D frame, so it is not a control. **It is neither a pass nor a fail for 60.**
Quiet-day reference with the neck at 30: p99 0.374 ms (Xvfb), 0.676 ms (GPU).

Two facts about the probe found on the way, both now in `AGENTS.md`:

- Under Xvfb, WebKitGTK gives the page an animation frame every **43 ms**
  whatever the app asks for. The Xvfb leg cannot show a 60 Hz Take. Only the
  GPU leg (X server on the GB10, page frame 16 to 17 ms) can.
- In one GPU-leg run the neck was the SVG fallback (no 3D frame in three
  Takes) and in the next it was 3D. `info.neck.frames` in `results.json` now
  records the stage's mode, tier, the frame-time guard's verdict and its
  errors, and a later run (load 95) caught it: the guard had called the GB10
  slow. See "Found and not fixed", 2. A run whose `mode` is not `3d` has not
  measured the neck.

**To finish it:**

1. Wait for a quiet machine and run (the binary is built, in
   `~/projects/.target-smooth`; rebuild with `npm run test:e2e:probe` without
   `--no-build` if the tree has moved, since the frontend is inside it):

   ```sh
   ~/projects/.preview/smooth/scripts/probe-ab.sh ~/projects/.preview/smooth/probe 30 60 30 60
   ```

   It waits for load under 6 before each run and skips a run rather than make
   it busy. A copy was left running on 2026-11-19 with a 90-minute wait per
   run; look in `~/projects/.preview/smooth/probe/log.txt` first, it may
   already have the answer.
2. Read the GPU rows of each `summary.md`. The gate (also in `AGENTS.md`):
   0 missed beats, 0 allocs/frees, 0 dropped notifications at 60, and p99 at
   60 no worse than at 30 in the same session. Check `info.neck.frames.mode`
   is `3d` and `neckGapMedianMs` is about 17 at 60 and about 33 at 30, or the
   run measured something else.
3. If it passes: `NECK_FOLLOWS_DISPLAY = true`, put the numbers in the
   commit and in the table in `AGENTS.md`. Tests do not change (they pass the
   switch explicitly; one reads the constant). `stage.spec.ts` and
   `smooth.spec.ts` do not depend on it (SwiftShader is tier 0, held to 30).
4. If it fails: leave it off, write the numbers down, and the neck stays at
   30. The lane and the cursor are unaffected either way.

To feel it on a real machine before the gate (the owner, on Windows or
Android): add `"stage.takeFps": "display"` to the app's `settings.json`.
A number there (`60`) forces that rate for neck, lane and cursor.

Why not just turn it on: the click is the product's one hard rule, the brief
made the probe the condition, and "it is probably fine" is how rules like
that stop being rules. The argument that it IS probably fine, for whoever
decides: the lane and the tab's cursor have always moved at the display's
rate during a Take on Windows, macOS and Android, the audio callback runs on
a real-time thread in another process, and at 60 the neck cost this machine's
main thread about 4% of a core.

## What landed

| Commit | What |
|---|---|
| `test(layout): a frame-time survey…` | `tests/layout/perf.ts`, `smooth-measure.spec.ts`: frame gaps, long tasks, React commits and renders, layouts, animations, per scene; on the GPU with `YAMES_PERF_GL`. |
| `perf(session): a Take stops forcing layouts…` | Level meter pulse without a reflow; the neck overlay reads before it writes; tab strip `Segment`s and `OverviewStrip` no longer redrawn per beat; `ViewTransition` reflows only when it must; no gamepad polling without a gamepad; Tools tile playhead on transform. |
| `feat(stage): one governor for a Take's frame rate…` | `src/stage3d/takeRate.ts` and its users (below). |
| `perf(stage): the 3D engine is built while Today is idle…` | `NeckStage.prewarm`, `useNeckPrewarm`. |
| `perf(shell): the rail, the title bar and the skip link sit out the beat` | `useStableHandlers`, `memo`. |
| `test(layout): smoothness gates` | `tests/layout/smooth.spec.ts`, `stage.spec.ts`. |
| `docs: …` | `AGENTS.md` "Frame rate during a Take, and the smoothness gates", this file, the READMEs. |

### The governor (`src/stage3d/takeRate.ts`)

- `takeRate.fps` is the neck's rate, `takeRate.laneFps` the runway's and the
  tab cursor's. `takeCeiling(hints)` picks 120 or 30 before a Take;
  `TakeRate.sample(gap, expected, work)` trips to 30 during it (a quarter of
  30 frames late, or drawing over half the budget); two trips and it stays.
- `FrameScheduler` learns the display's frame time from its own stamps
  (`DisplayClock`) and runs "uncapped" when the cap is within about a third
  of it (`everyFrame`), so 120 on a 144 Hz display is 144, and on 240 Hz is
  120. Off a Take the cap is `CALM_FPS` = 120 (it was 60, which on a 120 Hz
  display was a timer-spaced 60; it is the display's own beat now).
- **A behaviour change to know about:** the lane and the tab cursor used to
  run at the display's rate everywhere but WebKitGTK. They now also start at
  30 on the governor's other hints (tier 0 or no 3D at all, ≤ 4 cores, ≤ 2 GB,
  reduced motion, data saver, low battery) and fall back to 30 on slow
  frames. On a capable machine nothing changes for them.
- `stage.takeFps` in the store: a number forces all three; `"display"` turns
  the neck's switch on for that machine. Added to the parity manifest on
  purpose. No Settings UI (it would need 15 locales; left as an idea).

## Numbers

Chromium headless, WebGL on the GB10 through ANGLE/Vulkan
(`YAMES_PERF_GL`), dev build (React's dev overhead is in every number),
1400x900 unless it says phone (the phone build at 390x844). Full tables:
`~/projects/.preview/smooth/before-gpu.md`, `after-gpu.md`, `SUMMARY.md`.
The machine was busy for every run, so read differences of 10% as noise.

| What | Before | After |
|---|---|---|
| Neck Take: page frames a second, dropped | 59.9, 0 | 59.8, 0 |
| Neck Take: the neck's frames a second | 27.7 (cap 30) | 27 to 30 as shipped; 59 with the switch on |
| Neck Take: layouts a second | 16.4 | 8.8 to 12.8 |
| Neck Take: `OverviewStrip` renders in 6 s | 84 | follows the notes only |
| Tab Take: `TechMarks` renders in 6 s | 1680 | 96 |
| Tab Take: React render ms a second (dev) | 67 | 47 |
| Runway Take: lane frames per page frame | 1.0 | 1.0 (0.5 held to 30) |
| Long tasks during a running Take (any view, desktop and phone) | 0 | 0 |
| Start from Today: long tasks (longest), dropped frames | 3 (239 ms), 7 | 1 (91 ms), 3 |
| Today <-> Paths, five hops: forced reflow in `ViewTransition` | 62 ms | 0 |
| Settings, Paths, Progress scroll: dropped frames | 0 | 0 |
| Layout shift on first paint (Today) | 0.002 | 0.002 |
| Idle Today: animation frames the app asks for | 60 a second (gamepad poll) | 0 |

What the survey cleared: Settings and Paths scroll without a dropped frame
(the first survey's "Settings drops 12 frames" was Playwright's wheel forcing
a layout per tick); fonts are bundled, `font-display: swap`, and cost 0.002
of layout shift; every CSS animation on the learning side is transform or
opacity (the two that were not, on the Tools tile and the level meter, are
fixed); the view transitions and the Session's controls already share
`--l-ease` and 0.2 s; reduced motion is honoured by the stage, the
transitions, the meter and now the Take's rate.

## Found and not fixed, largest first

1. **The shell re-renders at every beat.** `useMetronome` holds
   `currentBeat` in `MainWindow`'s state, and `useSessionRun`,
   `useLiveNoteLights`, the jam, setlist and songs hooks all take it as an
   argument from there. About nine commits a second through a Take, each
   rendering the 3,200-line window and everything not memoised under it:
   about 50 ms of React a second in a dev build on this machine, of which
   `MainWindow`'s own body is about 10 and the Session's screen about 22.
   No dropped frame on this machine; on a phone at 120 Hz a 5 to 10 ms
   commit is a missed frame of the lane. The fix is a beat store
   (`useSyncExternalStore`) read by the leaves, with `useSessionRun`'s live
   parts moved under `SessionView`. It is a refactor of the two largest
   files in the app with 600 tests on them; not one for the end of a pass.
   What was done instead: the rail, the title bar, the skip link, the
   overview strip and the tab's segments no longer take part.
2. **The frame-time guard takes the 3D neck away from a real GPU on a busy
   machine, for good.** `speed.ts` times five frames once, and a median over
   its budget sets `stage.forceFlat` in the store, kept across restarts. On
   the GB10 the guard reads 1 ms against a budget of 5.9; with the machine
   at load 95 it read 7.0, called the GB10 slow, and the Takes that followed
   were drawn on the SVG neck (`info.neck.frames.guard` in
   `~/projects/.preview/smooth/probe/2-fps30/`). It is very likely what the
   "GPU leg drew no 3D frame" run was too. A player whose machine is busy at
   the first Session (an update installing, a build running) gets the flat
   neck until they find "try 3D again" in Settings. Worth a second opinion
   before it is written to the store: probe again a second later, or do not
   persist a verdict within a few times of the budget. The prewarm makes it
   somewhat better by itself (the guard now runs on an idle Today rather
   than in the frame a Session opens).
3. **Start still has one long task (about 90 ms in a dev build).** The
   engine is ready (prewarm), what is left is the Session screen mounting,
   its first layout, and the note labels' textures (`textures.ts`
   `noteLabel`, about 16 ms). Drawing the labels ahead, or mounting the
   Session screen in two steps, would take it under 50.
4. **A navigation costs about 30 ms of style recalculation** (Today <->
   Paths: 580 KB of CSS, `:has()` selectors on `.main-window`,
   `.main-content` and `.session-page` that re-match on every mutation
   under them). One or two frames at the start of each view's entrance.
5. **The main chunk is 3.5 MB**, about 2 MB of it the fifteen locales. Only
   the active language and English need to be in it. Start-up, not
   smoothness; an idea card.
6. `useTightHead` (`PracticeChrome.tsx`) and `fitScale` (`useFitOneLine.ts`)
   measure by writing a style and reading a width in a loop. They run when a
   label changes, not per beat; they showed up at Start take (17 ms).

## Gates run on the final tree (after `git merge revamp` a342505f)

- `tsc --noEmit`: clean. `npm run build`: clean.
- vitest: 10842 passed; `TabStage.render.test.tsx` fails only in worktrees.
  (Before the merge, at load 90, three tests timed out at 20 s and passed
  alone: `paths/generate`, `session/packs`, `useSessionRun.preview`.)
- layout, `--workers=2`, neck / stage / runway / tabstrip / session* / smooth
  / today* / phone-learning / tour / rail / swap / phone-tabs / phone-header:
  512 passed, 1 failed, and that one was a gate of this pass that turned out
  to move with the machine (layouts counted per commit: 0.16 to 0.55 for one
  build). It was replaced by a check of the read itself ("the level meter
  pulses without reading the layout"), which passes here and fails on
  642b03a1, as do five of the other `smooth.spec.ts` tests.
- **Not run: the e2e probe as a gate, and the e2e Take scenarios.** With the
  machine this busy the harness's own calibration fails ("heard 3 of 8
  pulses") and the headless baseline misses beats with no app running. They
  belong with step 1 at the top. Since the neck's rate during a Take is
  unchanged (the switch is off) and the lane's is unchanged on any machine
  the old code ran at the display's rate, nothing that shipped moved what the
  probe measures; the prewarm happens on Today, not during a Take.
- `global.css` still has `button { transition: all 0.15s }`. Left alone: a
  property list would be the smoother rule, and it needs the phone row-fit
  specs in de, ru and pt at 360 (the coordinator's note of 2026-11-19).

## Cleaning up

- `~/projects/.smooth-base` (the "before" worktree at 642b03a1) has been removed.
- `~/projects/.target-smooth`: the e2e build (2.7 GB). Delete it once
  the probe has been run from it.

## 2026-11-20: the gate passed, the neck follows the display

On a quiet machine (load 0.4 to 1.7), `/tmp/probe-ab-revamp.sh` ran the e2e
probe at 30, 60, 30, 60 and auto on revamp 063f4dd9 (output:
`~/projects/.preview/smooth/beta9-1120-0231/`). On the GB10's X server the
neck's frames were 17 ms apart at 60 and 34 ms at 30; p99 jitter 0.82 / 0.98
ms at 60 against 0.84 / 1.04 ms at 30; zero missed beats, callback
allocations or dropped notifications in every run (the headless probe alone
reads 1.25 to 1.35 ms p99 on this box, so its 1 ms advisory bar is the box's
floor, not the app). `NECK_FOLLOWS_DISPLAY` is now `true`; `takeCeiling` and
the frame-time fallback are unchanged. Owner feel test: card #95.
