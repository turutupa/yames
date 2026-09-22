# W7 — Blocks: the coach answers in components

Branch `songs-w7-blocks`. Size L. Your spec is `plans/COACH_UX.md` D3 (the
owner's idea, 2026-09-20), read with A4–A5 and B1–B3. Frontend only, new
folder `src/coach/blocks/`. No Rust, no model, no new dependency.

## Deliverable

- **The catalogue**, `src/coach/blocks/types.ts`: a discriminated union
  `CoachBlock` = `text` · `fretboard` · `chordShape` · `tabExcerpt` ·
  `progress` · `take` · `compare` · `action`, and `CoachAnswer = { blocks:
  CoachBlock[] }`. **Blocks carry references, never content**: a chord by
  name and shape index, a scale by root and name with an optional
  position, bars of a score by score id and bar range with an optional
  attempt id, an action by kind and parameters (`loopBars`, `ramp`,
  `clickSubdivision`, `loadPreset`, `loadJam`, `comeBack`). No block has a
  field a fret number, a note list or a colour could be typed into.
- **The schema**, generated from one source of truth so it cannot drift:
  a JSON Schema for `CoachAnswer` (for a hosted model) and a GBNF grammar
  for llama.cpp (for a local one), both emitted by a script and checked in,
  with a vitest that fails if either is stale. Keep the grammar small:
  bounded array lengths (≤ 6 blocks), bounded strings, enums wherever a
  value is one of a set (chord qualities and scale names come from the
  existing theory code, see below).
- **Validation and resolution**, `resolve.ts`: parse unknown JSON into a
  `CoachAnswer`, dropping any block whose reference does not resolve
  (unknown chord, shape index out of range, bars outside the score) — it
  renders as nothing, never as a guess — and reporting what was dropped.
- **The renderer**, `CoachBlocks.tsx`: draws an answer anywhere the coach
  speaks. Reuse what exists rather than drawing anything again: the chord
  diagrams (`src/components/chords/`), the neck from Jam's cheat sheet,
  the theory in `src/jam/` (`harmony.ts`, `chordShapes.ts`, `diatonic.ts`,
  `cheatSheet.ts`). Where a component's props cannot be driven by a block
  as it stands, give it a thin adapter; do not fork it. `tabExcerpt`,
  `take` and `compare` depend on work in flight (W4's tab, the review
  wave): define their blocks and resolution fully, and render them through
  a small slot interface with a placeholder implementation, so the real
  components plug in without touching the renderer.
- **Actions** go through a single `onAction(action)` callback; wire
  `loadPreset`/`loadJam`/`clickSubdivision` to what `useActionDispatcher`
  and the existing hooks already do, leave `loopBars`/`ramp` for the Songs
  wave behind the same callback.
- A story-like harness, `src/coach/blocks/gallery.tsx` behind a dev-only
  route or flag, showing every block in every one of the 13 themes, for
  the owner to look at in the morning. Do not link it from the app's UI.
- Strings through i18n, all 15 locales (English fallback is fine).

## Gates

build; vitest (schema freshness, resolution drops bad references and
keeps good ones, every block renders, actions fire once, a 6-block answer
fits the coach card at the minimum window size); layout tests for the
gallery at the two narrowest widths. Follow `plans/UI_DECISIONS.md` and
the owner's rules in it: container queries over media queries inside
cards, portalled menus, nothing important behind a toggle.

## Not yours

`src/coach/*.ts` that already exists (W8 is in there tonight),
`src/songs/**` and `src/containers/songs/**` (W4), any Rust.
