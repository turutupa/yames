# W37 — the percussionist's parts, and the row on the screen

Branch `jam-v5-w37-perc-data` from `jam-v5`. Read the shared BRIEF's
contract, `plans/tasks/jam-v3/W28-GROOVES-DYNAMICS.md` §2 (the dynamics
rules every row obeys), `plans/JAM_REFERENCES.md`, then `src/jam/types.ts`,
`compile.ts`, `arrangement.ts`, `grooves.ts` (115 grooves, nine families),
`vibes.ts`, `intensity.ts`, the band row `src/containers/jam/BandLanes.tsx`,
and the editor under `src/containers/jam/editor/`. Area per the BRIEF's
table.

## Build
1. **Types and compile.** The ten optional rows on `JamPattern`;
   `band.perc?`, `mix.perc`; `compileJam` passes rows, flag and mix;
   `bandMoment` gains `perc` per the contract and `compileJam` applies
   it (rows kept in a breakdown, dropped in stop-time and when drums are
   off); `intensity.ts` alternates a shaker or cabasa row like a hat row
   (accent / hit on eighths, accent / ghost / hit / ghost on sixteenths)
   and leaves the rest.
2. **The parts.** Percussion rows on every groove the contract names,
   authored against the reference cards and the style's actual
   percussion practice (a son clave is 3-2 or 2-3 and the groove says
   which; a tumbao's open tones fall on the "and" of 4 and on 4; a
   martillo is eight strokes with the accent on the open low bongo; a
   tambourine on 2 and 4 is an accent with a ghost shake before it on
   sixteenth grooves). A comment per groove on what the percussionist is
   doing. Grooves the contract says get nothing get a one-line comment
   saying so. Tests: every percussion row is the bar's length; no
   percussion row is a single level; the clave rows are one of the two
   clave patterns; the counts per family match the contract's list.
3. **Vibes.** `band.perc` on the bundles: latin, funk, pop and their
   variations true (except where a variation is a kit-less programmed
   beat, where it stays true with shaker only), world true, everything
   else false; `applyVibe` sets it; `startingBand` unchanged.
4. **The row.** `BandLanes` gains **Percussion** after Keys: the same
   mute and level as the others, its own glyph, a one-line description
   from the groove ("shaker and congas", "tambourine"); shown when the
   groove has any percussion row or the jam's `band.perc` is set. The
   setup sheet's THE BAND group gets the matching switch and slider.
5. **The editor.** A "+ percussion" affordance that reveals the rows the
   groove uses, plus a picker to add one of the ten; rows removed when
   emptied. The glyph on the groove cards ignores percussion.
6. **Locales.** Every new string (the ten voice names, "Percussion",
   descriptions) in all fifteen files, in each language's percussion
   vocabulary.

## Gates
`npx tsc --noEmit`, `npx vitest run` (whole suite; restore the onboarding
snapshot). Report the per-family table of which grooves got what, every
locale key, gate counts, branch and final commit.
