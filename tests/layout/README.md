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

## What is not here

No visual-regression snapshots. A pixel-diff of the whole screen fails on a
font update, a theme tweak and a one-pixel shadow, and a gate that cries wolf
is turned off within a month. These assert relationships — inside, beside, on
one line — which change only when something is actually wrong.

Chromium only. This is a Tauri app whose webview is Chromium-family on Windows
and WebKit on macOS, and a suite chasing both would spend its budget on
differences no user of this app will ever see.
