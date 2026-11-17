# M03b — Phone navigation and sheets

Size: L. Branch: `mob/m03b-phone-nav`, from `mobile` (M01, M02, M03a
merged). Parallel with M03c (`M03c-phone-screens.md`); the two own
disjoint files, listed below. Blocks: M05.

## Goal

At 360, 390 and 430 px the beat view, the preset / setlist library and
the meter picker are usable with a thumb: a bottom tab bar replaces the
side rail, the library opens as a bottom sheet with a scrim, the meter
picker is a sheet or a wrapping grid that fits, and the meter row no
longer runs off the right edge. Desktop is pixel-identical.

## Decisions already made (do not reopen)

From `plans/tasks/mobile/M03-GAPS.md` open questions, decided
2026-09-11 on user-experience grounds:

- **The rail becomes a bottom tab bar on mobile**: Beat, Drill,
  Setlist, Settings. Thumb-reachable, conventional, and it returns
  68 px of width to every screen. The rail's collapse button, action
  dot and coach row do not exist on mobile (M02 already gated the coach
  row).
- **The library is a bottom sheet** (presets in Beat / Drill mode,
  setlists in Setlist mode — same sheet, different header, as today's
  sidebar already does). Scrim behind it, drag-handle at the top,
  swipe-down or scrim-tap to dismiss, ~85 % viewport height max. Opened
  from a button in the beat view header where the sidebar toggle is
  today.
- **The meter picker is a sheet too**, using the same sheet primitive,
  with the time-signature options as a wrapping grid. The sound picker
  dropdown fits and stays as it is.
- **`viewport-fit=cover`** is already in `index.html` (M02), so M03a's
  safe-area tokens are live; the tab bar pads with `--safe-bottom`.
- Landscape is out of v1; the orientation lock lives in the Android
  manifest (M04), not here.

## Files you own

`src/containers/main-window/Rail.tsx` (or a new
`MobileTabBar.tsx` next to it and an `IS_MOBILE` branch in
`MainWindow.tsx` — keep the desktop `Rail` untouched),
`src/containers/main-window/MainWindow.tsx` (composition only, the
`IS_MOBILE` branches for tab bar and sheet),
`src/components/presets/**`, `src/containers/metronome/MeterPresets.tsx`,
`src/containers/metronome/MetronomeView.tsx` (meter row only), a new
`src/components/Sheet.tsx` primitive, `src/styles/shell.css`,
`src/styles/metronome.css`, `src/styles/setlist.css`, the presets
stylesheet(s), and a new `src/styles/sheet.css`. Locale keys you add go
in `src/locales/en/shell.json` / `metronome.json`.

**Not yours** (M03c): `settings.css`, `drill-view.css`, `fullscreen.css`,
`onboarding.css`, `SettingsView.tsx`, `DrillClimb.tsx`,
`FullscreenView.tsx`, onboarding, `InstrumentPickerModal`,
`UnsavedChangesDialog`. Nothing under `src-tauri/`.

## Why (context you would otherwise lack)

- Read `plans/MOBILE_IMPLEMENTATION_PLAN.md` §1–§3, then
  `plans/tasks/mobile/M03-GAPS.md` in full — it has the measurements,
  the screenshots (`plans/tasks/mobile/m03a/`) and a "How this was
  measured" section describing the `shots.html` + `src/shots/mockIpc.ts`
  harness driven through headless Edge over CDP with touch emulation.
  Reuse that harness for your own before/after shots; do not launch the
  Tauri app.
- `IS_MOBILE` (`src/platform.ts`) is a build-time constant; branches
  on it fold away. Desktop-only code stays out of the mobile bundle
  only if it sits behind `if (!IS_MOBILE)` or a ternary — read the
  header comment in `platform.ts` and the M02 composition tests
  (`src/mobileComposition*.test.tsx`) before adding a branch.
- Every hover rule must stay inside `@media (hover: hover)`;
  `node scripts/css-hover-audit.mjs` is a gate. Touch-target sizing
  lives under `@media (pointer: coarse)`. Safe-area tokens are
  `--safe-top/right/bottom/left` on `:root`.
- Ranked #1, #4 and #5 in the gaps document are yours. #5 (meter row)
  may mostly resolve once the rail's 68 px come back; measure before
  restructuring.
- Musicians, not developers, in every string.

## Acceptance gate

- Shots at 360 / 390 / 430 (mobile build, touch emulation) for: beat
  view, library sheet open (presets and setlists), meter sheet open,
  each tab selected. Committed under `plans/tasks/mobile/m03b/`.
- Nothing in those shots is cut off or outside the viewport
  (`document.documentElement.scrollWidth <= innerWidth` asserted in
  the harness for each screen).
- Desktop parity: the geometry/colour snapshot method from M03-GAPS
  ("How this was measured") shows zero differences for metronome and
  setlist views at 1400×900 with `(hover: hover)` / `(pointer: fine)`.
- `node scripts/css-hover-audit.mjs` → 0. `npx tsc --noEmit`,
  `npx vitest run`, `npm run build:mobile` (includes the bundle check)
  all green. Rail tests unchanged and green.
- `git diff --name-only mobile` contains none of M03c's files.

## Report

What was done, the sheet primitive's API, exact commands and results,
anything not verified, open questions for M05. Commit on your branch;
do not push; do not touch `main`; never run the desktop app.
