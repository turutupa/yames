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

```sh
node plans/tasks/mobile/m03c/probe.mjs phone    # the shots + the overflow gate
node plans/tasks/mobile/m03c/probe.mjs desktop --json before.json   # parity
```

`probe.mjs --only <id>` does one screen. The desktop mode writes a
geometry-and-colour snapshot of settings, drill, zen, the wizard, the
unsaved dialog and the instrument picker at 1400×900 with a fine pointer;
run it on the base revision and again after, and `diff` the two.

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

## `dialogs.html`

The unsaved-changes dialog and the instrument picker cannot be reached
from `shots.html` — M03-GAPS surveyed both by reading the CSS, which is
how `min-width: 480px` survived to this task. `dialogs.html` +
`dialogs.tsx` mount the two components against the app's own stylesheets
and i18n. They are not part of the app: `vite build` is given
`index.html` as its only input, and nothing under `src/` imports them.
