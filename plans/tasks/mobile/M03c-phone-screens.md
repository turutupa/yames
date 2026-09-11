# M03c — Phone screens: settings, drill chart, zen exit, onboarding, dialogs

Size: L. Branch: `mob/m03c-phone-screens`, from `mobile` (M01, M02,
M03a merged). Parallel with M03b (`M03b-phone-navigation-and-sheets.md`);
the two own disjoint files, listed below. Blocks: M05.

## Goal

At 360, 390 and 430 px: every settings row stacks label-over-control at
full width; the drill's climb chart has a phone form; zen can be left
with a visible button and says so; the four onboarding steps fit; the
unsaved-changes dialog and the instrument picker fit. Desktop is
pixel-identical.

## Decisions already made (do not reopen)

From `plans/tasks/mobile/M03-GAPS.md` open questions, decided
2026-09-11 on user-experience grounds:

- **Settings rows stack** at ≤ 480 px: label and description on top,
  control below at full width. Theme cards and toggle groups wrap.
  The settings timeline (the hover-era scroll indicator) does not ship
  on mobile — gate it behind `!IS_MOBILE`.
- **The climb chart becomes a horizontal scroller** that keeps all 16
  steps at a readable cell width, scroll-snaps to the current step, and
  shows a subtle edge fade so it reads as scrollable. Same data, same
  colours; not a new chart.
- **Zen gets a visible exit button** at the top-right under
  `(pointer: coarse)` (M03a already made zen's controls visible on
  touch; you add the button and the copy). The hint string changes so
  a phone user can act on it — on mobile it names the button, on
  desktop it keeps "Double-click or press Esc". Two locale keys, chosen
  by `IS_MOBILE`, in `src/locales/en/zen.json`.
- **Onboarding** on mobile is the four steps M02 left (welcome,
  instrument, sound & look, ready); make them fit, no new steps.
- **Unsaved-changes dialog** buttons stack vertically at ≤ 480 px.
  **Instrument picker modal** loses its `min-width: 480px` on phones.
- **`scripts/css-hover-audit.mjs` joins the scripts**: add
  `"check:css-hover"` to `package.json`. Do not touch CI files.

## Files you own

`src/styles/settings.css`, `src/styles/drill-view.css`,
`src/styles/fullscreen.css`, `src/styles/onboarding.css`, the dialog /
modal stylesheets, `src/containers/settings/**` (layout and the
timeline gate only — do not move sections), `src/containers/drill/DrillClimb.tsx`
and its styles, `src/containers/zen/FullscreenView.tsx`,
`src/containers/onboarding/**`, `src/components/InstrumentPickerModal.tsx`,
`src/components/UnsavedChangesDialog.tsx`, `src/locales/en/zen.json`,
`settings.json`, `onboarding.json`, `package.json` (one script line).

**Not yours** (M03b): `shell.css`, `metronome.css`, `setlist.css`, the
presets stylesheets, `Rail.tsx`, `MainWindow.tsx`, `MeterPresets.tsx`,
`MetronomeView.tsx`, `src/components/presets/**`. Nothing under
`src-tauri/`.

## Why (context you would otherwise lack)

- Read `plans/MOBILE_IMPLEMENTATION_PLAN.md` §1–§3, then
  `plans/tasks/mobile/M03-GAPS.md` in full: ranked #2 and #3 and the
  per-screen notes for settings, drill, zen, onboarding, the two
  dialogs are yours. The "How this was measured" section describes the
  `shots.html` + `src/shots/mockIpc.ts` harness driven through headless
  Edge over CDP with touch emulation; reuse it for before/after shots.
  Do not launch the Tauri app.
- `IS_MOBILE` (`src/platform.ts`) is a build-time constant; read its
  header comment and the M02 composition tests before adding a branch.
  The settings view on mobile already receives no coach / widget /
  hotkeys bundles (M02); the rows you are restyling are the ones that
  remain.
- Every hover rule stays inside `@media (hover: hover)`; touch-target
  sizing under `@media (pointer: coarse)`; safe-area tokens are
  `--safe-*` on `:root` and are live (`viewport-fit=cover` is in
  `index.html`).
- The climb chart's data and step logic live in `DrillClimb.tsx`;
  change presentation, not the plan model (`useDrillPlan`).
- Musicians, not developers, in every string. New strings go in the
  English locale files; other locales fall back automatically.

## Acceptance gate

- Shots at 360 / 390 / 430 (mobile build, touch emulation) for: each
  settings section, drill view with the chart mid-run, zen, all four
  onboarding steps, the unsaved-changes dialog, the instrument picker.
  Committed under `plans/tasks/mobile/m03c/`.
- No horizontal overflow on any of them
  (`document.documentElement.scrollWidth <= innerWidth` asserted).
- Desktop parity: the geometry/colour snapshot method from M03-GAPS
  shows zero differences for settings, drill and zen at 1400×900 with
  `(hover: hover)` / `(pointer: fine)` (the climb chart's entrance
  animation is known noise; say so if it is the only diff).
- `npm run check:css-hover` → 0. `npx tsc --noEmit`, `npx vitest run`,
  `npm run build:mobile` green.
- `git diff --name-only mobile` contains none of M03b's files.

## Report

What was done, exact commands and results, anything not verified,
open questions for M04 (orientation lock) and M05. Commit on your
branch; do not push; do not touch `main`; never run the desktop app.
