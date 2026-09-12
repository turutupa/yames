# M03c — the screens, after

Shots of every screen M03c owns, at 360×800, 390×844 and 430×932, taken
from the **mobile build** (`YAMES_MOBILE=1`) in a headless Edge with
`Emulation.setDeviceMetricsOverride({ mobile: true })` and touch emulation
on — so `(pointer: coarse)` and `(hover: none)` are what the page matched.
Same method as `../m03a/`, which is what these are the "after" of.

Two caveats on reading them, both M03b's work and not this task's:

- **The 68px icon rail and the titlebar are still in the frame.** They do
  not ship on a phone, and M03b replaces the rail with a bottom tab bar.
  Every screen here therefore has ~68px more width and ~38px more height
  coming to it than the pictures show.
- The beat view visible *behind* the wizard overlay still overflows
  (`.meter-head`, `.accent-control`). That is M03-GAPS ranked #5, M03b's.

## Reproducing

M03e (2026-09-11) folded this task's own driver and M03b's into one tool,
`scripts/mobile-shots.mjs` at the repo root — the shots and the desktop
parity probe are both there now:

```sh
node scripts/mobile-shots.mjs                          # every screen, 360/390/430
node scripts/mobile-shots.mjs --only settings-general   # one screen
node scripts/mobile-shots.mjs --parity before.json      # desktop geometry snapshot
node scripts/mobile-shots.mjs --parity after.json       # ... again, after a change
node scripts/mobile-shots.mjs --parity-compare before.json after.json
```

The desktop parity mode writes a geometry-and-colour snapshot of settings,
drill, zen, the wizard, the unsaved dialog and the instrument picker at
1400×900 with a fine pointer; run it on the base revision and again after,
and `--parity-compare` diffs the two.

Known noise in the desktop snapshot, demonstrated by running it twice on
one unchanged tree: `.voice-wave__bar` in the coach settings section (a
permanently-running animation, heights differ by ~0.01px) and which
`.drill-dot` carries the `active` class at the instant the transport
stops. Nothing else moved between the base revision and this branch.

## The overflow assertion

`documentElement.scrollWidth <= innerWidth` proves very little here: the
app sets `overflow: hidden` on html and body, so a control pushed off the
right edge is clipped rather than scrolled and the document stays 360 wide
while the control is unreachable. The probe asserts per element instead —
no box may cross the viewport edge unless a deliberate horizontal scroller
(`overflow-x: auto|scroll` with the vertical axis clipped, which is the
climb chart and nothing else) sits between it and the root.

## After M03b merges

Checked on a throwaway merge of `mobile` (M03b's tab bar and sheets) into
this branch: `tsc --noEmit`, `vitest run`, `check:css-hover` and
`build:mobile` all pass, and every screen here still fits at all three
widths with the rail gone and the bottom tab bar in its place — the
settings card gets the 68px back and reads better for it.

One thing breaks, and it is the harness, not a layout: `src/shots/main.tsx`
enters Zen by clicking `[data-tour="zen-widget"]`, which the tab bar does
not carry (its Zen tab is `.mobile-tab-zen`). So `?shot=zen` never reports
ready on a merged mobile build, and the zen pictures here were taken before
the merge. Whoever runs this next should drive Zen from the metronome shot
by clicking either control — a two-line change in `src/shots/main.tsx`,
which is a shared file no M03 task owned.

## `dialogs.html`

The unsaved-changes dialog and the instrument picker cannot be reached
from `shots.html` — M03-GAPS surveyed both by reading the CSS, which is
how `min-width: 480px` survived to this task. This folder's own
`dialogs.html` + `dialogs.tsx` used to mount the two components against
the app's own stylesheets and i18n; M03e moved that pair to
`src/shots/dialogs.html` (and `dialogs.tsx`) so `mobile-shots.mjs` can
reach them alongside every other screen. Like `shots.html`, they are not
part of the app: `vite build` is given `index.html` as its only input,
and nothing under `src/` imports them.
