# M03a — CSS mechanics for touch, and a phone-width survey

Size: M. Branch: `mob/m03a-css-mechanics`, from `mobile`. Feeds M03
(the layout pass, which starts after M02 merges). Parallel-safe with
M01 (`src-tauri/`), M02 (`src/**` except styles), M05a (docs, CI).

**You own `src/styles/**` and nothing else in `src/`.** M02 is
restructuring components at the same time; touching `.tsx` files here
guarantees a conflict.

## Goal

Two deliverables:

1. The CSS is touch-correct without changing how desktop looks: hover
   styling only applies on devices that hover, safe-area insets exist
   as tokens, and interactive controls are not smaller than 44 px on
   touch.
2. `plans/tasks/mobile/M03-GAPS.md`: a screen-by-screen survey of what
   breaks at 360, 390 and 430 px widths, with screenshots, so the M03
   worker starts from a list instead of a guess.

## Why (context you would otherwise lack)

- 16k lines of CSS across `src/styles/`; 214 `:hover` rules; 44
  existing media queries, mostly `max-width: 560px` and
  `prefers-reduced-motion`. The desktop window minimum is 480×780, so
  nothing has ever been looked at below 480.
- Hover rules on touch devices stick after a tap (the element keeps
  its hover state until the next tap elsewhere). The fix is wrapping
  hover-only styling in `@media (hover: hover)`. Rules that combine
  `:hover` with `:focus-visible` or `.active` selectors need the
  hover half split out, not the whole rule wrapped.
- Safe-area insets: define `--safe-top/right/bottom/left` on `:root`
  in `shell.css` as `env(safe-area-inset-*, 0px)` and use them where
  the shell pads its edges. Desktop resolves them to 0, so this is a
  no-op there.
- Touch targets: 44×44 CSS px minimum per platform guidance. Where a
  control is smaller, prefer enlarging the hit area (padding,
  `::before` overlay, `min-height`) over resizing the visual, and only
  inside a `@media (pointer: coarse)` block so desktop density is
  untouched.
- Screens to survey: beat view (metronome figure, BPM control, beat
  stepper, group editor, accent control, meter presets, sound picker),
  drill view (plan line, climb, runs), setlist view (list, step
  sentence, save bar), settings (every section), presets sidebar,
  onboarding wizard (all steps — M02 is cutting some on mobile, survey
  them anyway; it costs nothing), fullscreen / zen, the
  unsaved-changes dialog, instrument picker modal.
- Getting pixels: do **not** run `npm run tauri dev` — the owner is
  releasing today and the desktop store and port 1420 are theirs.
  Run `npx vite --port 1430` and open it in the in-app browser with
  `resize_window` at 360×800, 390×844, 430×932 and the mobile preset.
  IPC calls reject without Tauri, so some views will show empty or
  default state; that is fine for layout. Where a view will not render
  at all without IPC, say so and survey from the CSS and the component
  by reading. Save screenshots under `plans/tasks/mobile/m03a/` as
  `<screen>-<width>.png`.

## Steps

1. Worktree sanity: `git log --oneline -1` is the tip of `mobile`, or
   `git checkout -B mob/m03a-css-mechanics mobile`.
2. Write `scripts/css-hover-audit.mjs`: lists every rule containing
   `:hover` that is not inside an `@media (hover: hover)` block, with
   file and line. Run it, record the count in the report.
3. Wrap or split every listed rule. Re-run the audit: zero. Keep the
   diff reviewable (one commit per stylesheet is fine).
4. Safe-area tokens in `shell.css`; apply to the shell's outer padding
   and any fixed-position bar or toast.
5. Touch-target pass under `@media (pointer: coarse)`.
6. The survey, then `M03-GAPS.md`: per screen and width — what
   overflows, what is cut off, what is unreachable, what needs a
   different component on a phone (the presets sidebar is the known
   one: it becomes a bottom sheet). Rank each item S / M / L for the
   M03 worker.
7. Gates.

## Acceptance gate

- `node scripts/css-hover-audit.mjs` reports zero unwrapped hover rules.
- `bun run tsc --noEmit`, `bun run test` green (CSS-only change; this
  proves nothing imported broke).
- Screenshots exist for every screen that rendered, at three widths.
- `M03-GAPS.md` has an entry for every screen in the list above.
- `git diff --stat main -- src ':!src/styles'` is empty (no component
  edits).

## Report

Counts before/after, screens that could not render in the browser,
exact commands, open questions for M03. Open a PR against `mobile`; do
not merge; do not push to `main`.
