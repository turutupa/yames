# The layout gates

```bash
npm i                              # once — @playwright/test is a devDependency
npx playwright install chromium    # once — the browser it drives, ~130MB
npm run test:layout                # all of them, about 90 seconds
npm run test:layout:ui             # the same, in Playwright's inspector
```

The browser download is separate from `npm i` and is per machine, not per
checkout; the lockfile is not tracked in this repo, so a fresh clone needs
both lines above before the suite will run.

These are the only tests in the repo that run in a **real browser**, and they
exist for one reason: everything else runs in happy-dom, which computes no
geometry. Every element there is zero pixels by zero pixels, so a row whose
contents run off its right-hand edge measures exactly the same as a row that
fits. Four thousand tests passed while the on/off switch sat outside its row.

So the rule is: **if the bug is "it does not fit", it belongs here. If the bug
is "it does the wrong thing", it belongs in a vitest file**, which is a
hundred times faster and does not need a browser.

## How they work

They drive `shots.html` — the same harness the screenshots use: the real UI
with a mock IPC behind it, one scene per `?shot=`. `tests/layout/fits.ts` has
the shared parts:

- `openShot(page, shot, size)` — builds the scene at 1440px wide (the library
  the harness clicks to load a jam is not there below ~900px), waits for
  `__SHOT_READY__`, then narrows the window to the size under test.
- `fitsOnOneLine(page, selector, where)` — nothing inside a row sticks out of
  it, and nothing has been pushed onto a second line. Both halves matter:
  overflow and wrapping are different failures and this repo has shipped one
  of each.
- `noSidewaysScroll(page, where)` — a horizontal scrollbar is always a bug.

## Adding a scene

If the thing you want to measure is already a screenshot scene, it needs no
setup — pass its id. If it is not, add it to `src/shots/scenarios.ts` and both
the pictures and these tests can reach it.

## When one fails

The failure message names the element and the two numbers that disagree, and
Playwright keeps a screenshot and a trace of the moment under `test-results/`:

```bash
npx playwright show-trace test-results/<the-failing-test>/trace.zip
```

## The server it drives

`playwright.config.ts` starts its own Vite and never reuses one. The port is
derived from the absolute path of the checkout — so two worktrees on one
laptop never ask for the same number, and this worktree always asks for the
same number — and a port that is already answering fails the run out loud
rather than being borrowed. Set `YAMES_LAYOUT_PORT` to pin it.

Its dependency cache is its own as well: `.layout-cache/desktop` and
`.layout-cache/phone` in this checkout (ignored by git, rebuilt when missing),
handed to Vite through `YAMES_VITE_CACHE_DIR`. Vite's default is
`node_modules/.vite`, and a worktree's `node_modules` is a link to the main
checkout's, so every worktree's suite wrote one folder. That cache is keyed on
the checkout's root: each suite that started re-bundled the folder under the
ones already running, whose next lazy import then failed (the 3D neck fell
back to its SVG: "expected 3d, received fallback") or reloaded the page under
a test ("execution context was destroyed"). It read as machine load.

## When the machine is busy

A check that fails only under load is usually reading two things a round trip
apart, or counting on a wall clock. The patterns this suite uses instead:

- **Read what you compare in one task.** `neck.spec.ts` reads the ring, the
  "next" tag and the dots in a single `evaluate` (`READ_OVERLAY`); read one
  call apart, the neck had moved on between them.
- **Sample states, not ticks.** A sample is "NOW moved to another note" or
  "the ring sits on its dot", waited for with `waitForFunction` on the page's
  own frames, not "every 170 ms".
- **Measure the thing itself.** The stage's 30 fps cap is checked on the
  spacing of the frames it drew (`stage.spec.ts`), not on a count over a
  second that a busy machine stretches.
- **Let the app catch up where it is built to.** The tour re-measures on a
  300 ms beat, so its stops are judged inside `toPass`: a spotlight that never
  lands still fails.

## Smoothness

`smooth.spec.ts` is the gate: during a running Take (neck, runway, tab; desktop
and the phone build) no long task in the best of three windows, the tab's notes
and the overview strip not redrawn per beat, no forced layout per note (the
browser's layout counter against React's commits), the lane on every frame the
page gets (or exactly every other, held to 30), and the 3D engine built while
Today is idle rather than in the frame a Session opens on. `stage.spec.ts`
holds the Take's frame-rate rules (`src/stage3d/takeRate.ts`): `?takefps=30`
is spaced 33 ms apart, `?takefps=120` draws on every frame the display gives,
and left alone SwiftShader (the stage's tier 0) is held to 30.

`smooth-measure.spec.ts` is the survey those came from, and how to look for
the next thing. It is skipped unless asked for:

```bash
YAMES_PERF_OUT=/tmp/perf npx playwright test smooth-measure --workers=1
# on the machine's GPU instead of SwiftShader (ANGLE over Vulkan):
YAMES_PERF_GL='--use-angle=vulkan --enable-features=Vulkan --ignore-gpu-blocklist' ...
YAMES_PERF_ONLY=session-playing,paths   # those scenes
YAMES_PERF_TRACE=1     # main-thread time by trace event, and what invalidated style
YAMES_PERF_PROFILE=1   # the functions the window was spent in
```

One JSON per scene (`perf.ts` says what each number is): frame gaps and
dropped frames, long tasks, the neck's and the lane's own frames, React
commits with which components rendered and for how long, running animations,
layouts and style recalcs a second. `--workers=1`, or the scenes measure each
other; and read the load average beside any number that looks wrong.

## Another language

```bash
YAMES_LAYOUT_LOCALE=de npm run test:layout
```

"Does it fit" is a different question in each of the fifteen languages: German
runs about a third longer than English and Russian longer again, so a rail
label, a fader name or a coach's sentence that sits comfortably at 480px in
English can leave the window in either. The variable is passed to the harness
as `?lng=`, which **fails the scene** on a tag it does not have rather than
falling back to English — a run that quietly measured English again would pass
while proving nothing.

English is the default, because it is the shortest and a suite that only ever
ran in the longest language is a suite nobody runs.

Two limits, both deliberate:

- `jam.spec.ts` skips itself outside English. Its scenes are driven by
  pressing Jam's own labels ("set up", "cheat sheet", "edit changes"), which
  are English literals in `src/shots/scenarios.ts`; under another locale the
  buttons stop answering to those names. Songs, the review, the blocks gallery
  and Settings all run in every language.
- A handful of assertions about particular English words (the band's three
  lane names, the picker's track names) relax or skip outside English. What a
  string says is `src/test/i18n.songs-wave.test.ts`'s job; this suite measures
  rectangles.

It was one port for everybody, reused if something was already listening. A
second worktree's dev server then answered, Vite served its `index.html` for
every unknown scene, and the suite measured **another worker's source** while
reporting twenty-four passes and a handful of scenes that "did not build".

## What is not here

No visual-regression snapshots. A pixel-diff of the whole screen fails on a
font update, a theme tweak and a one-pixel shadow, and a gate that cries wolf
is turned off within a month. These assert relationships — inside, beside, on
one line — which change only when something is actually wrong.

Chromium only. This is a Tauri app whose webview is Chromium-family on Windows
and WebKit on macOS, and a suite chasing both would spend its budget on
differences no user of this app will ever see.
