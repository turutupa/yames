# W28 — grooves written like a drummer, and the data for the new kits

Branch `jam-v3-w28-grooves-dynamics` from `jam-v3`. Read the shared
BRIEF's contract first. Area: `src/jam/**`, `src/locales/*/jam.json` and
`src/locales/*/settings.json` (all fifteen), the kit list in
`src/containers/jam/KitPicker.tsx`, a credits line in Settings › About,
and tests. No `src-tauri/`, no sheets, no motion, no `ChordSheet`.

## 1. The contract in TypeScript

- `JamLevel` = `0 | 1 | 2 | 3 | 4`; `JamPattern` gains optional `tomHi`
  and `tomLo` rows; `compileJam` passes them as `tom_hi` / `tom_lo` and
  passes `snare_ghost_is_rim` from the groove's `snareGhostIsRim` flag.
- `JamKit` gains `"club"` and `"studio"`; `KitPicker` lists them first
  with a one-line description each ("a jazz house kit, recorded live in a
  Boston club", "a studio kit from jazz to rock") and the five
  synthesised ones after, unchanged. Locale keys `jam.kit.club`,
  `jam.kit.studio` and their descriptions in fifteen languages.
- The groove editor: cells cycle off → hit → accent → peak → ghost → off;
  peak is drawn as the accent with a ring; the two tom rows appear in the
  editor only for grooves and custom grooves that have them, with a
  "+ toms" affordance to add them.
- `intensity.ts`: Loud raises accents to peak on the backbeat every fourth
  bar and keeps the open-hat move; Soft turns peaks to accents.

## 2. Every groove, rewritten with dynamics

Twenty-five grooves in `grooves.ts`. For each, in the reference card's
spirit (`plans/JAM_REFERENCES.md`), with the five levels:

- **Hats alternate.** Eighths: accent on the beat, hit off the beat.
  Sixteenths: accent / ghost / hit / ghost. Shuffle and swing: accent on
  the beat, hit on the skip note. Never a row of one level.
- **Ghost notes** on the snare where the style has them (funk, half-time,
  shuffle, second line, New Orleans, boom bap): between the backbeats,
  level 3, never on the backbeat.
- **The backbeat is an accent**; the last backbeat of a chorus's final
  bar is a **peak**.
- **Crash** at peak on bar one of a chorus (when `crashOnOne`), and a
  crash lane hit at accent where the style crashes mid-form (rock
  variations, hard rock at the half).
- **Fills** use the tom rows: a fill ramps hit → accent → peak across its
  last beat, moving snare → tom_hi → tom_lo, and the bar after opens on a
  crash at peak. Every groove's fill rewritten with that shape in its own
  subdivision; half-time and ballads get a shorter fill.
- **Bossa, ballad, cha-cha** set `snareGhostIsRim: true` and write their
  cross-stick pattern on the snare lane at level 3.
- Kick dynamics: the downbeat kick is an accent, the "and" kicks are hits;
  double kick alternates accent / hit.

Tests: every groove has at least two levels on its hat row; every fill
ends on a peak; no ghost on a backbeat; every `tomHi`/`tomLo` row is the
bar's length; the compile test proves level 4 and the tom rows reach the
config; the existing tick-count invariants hold.

## 3. The vibes point at the recorded kits

In `vibes.ts` bundles and variations: Rock, Hard rock, Pop, Country,
Blues and Metal use `studio`; Jazz, Latin and Funk use `club`; the
Electronic kit stays where a variation chose it. The vibe tiles' third
line (kit name) updates itself from the id.

## 4. Credits

A "Sounds" paragraph in Settings › About: "The Club kit is Virtuosity
Drums by Versilian Studios and Karoryfer Samples, performed by Austin
McMahon (public domain). The Studio kit is DRSKit by the DrumGizmo
project (CC BY 4.0)." Locale keys in fifteen files, translated; the
names and licence ids stay as they are. If About has no natural place
for it, put it under the existing licence or acknowledgements block.

## Gates
`npx tsc --noEmit`, `npx vitest run` (whole suite, i18n contract test
included; restore the onboarding snapshot after). Report the export list
of every changed module, every locale key added, and the grooves table
(name, levels used on each lane, fill shape).
