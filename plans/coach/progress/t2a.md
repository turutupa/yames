# t2a: `buildCustomExercise(recipe)`, on the Paths generator

Branch `coach-t2a`. Brief `plans/tasks/coach/t2a-custom-exercise-generator.md`.

## What landed

| File | What |
|---|---|
| `src/paths/custom.ts` (new) | The `Recipe` type (closed sets, `v: 1`), `buildCustomExercise`, `nextRecipe`, `recipeProblem`, `recipeKey` / `customExerciseId`, `positionsFor`, `resolvePosition`, `customPathDoc`, `customIssues`. |
| `src/paths/customGrid.ts` (new) | The test grid (8,880 recipes), `fixtureRuns`, `customScheduleFixtures`. |
| `src/paths/custom.test.ts` (new) | The grid (every 7th recipe, ~1,270), mock 17, the chips, the refusals, ids, the fixture is current. |
| `scripts/custom-exercises.mjs` (new) | `gen` (writes the fixture), `check`, `report` (grid counts, timing). |
| `src-tauri/tests/path_fixtures/custom_schedules.jsonl` (new) | 155 schedules: per music, grid and direction, the first grid recipe that builds. |
| `src-tauri/tests/path_exercises.rs` | `rows_from`; `custom_rows`; one test: every custom schedule scores all hits with 2 ms jitter, evenness >= 0.85, no soft onsets, a dropped note is a miss. Test-only. |

No pack, spec, overlay, generator or validator file changed.

## The recipe

A union by `shape`, every field from a closed set:

- `box` (root, `minorPentatonic | majorPentatonic | blues`, `strings?`): `boxCells`, boxes 1 to 5 an octave down,
  as written and up; a major pentatonic is its relative minor's box.
- `threePerString` (root, `major | naturalMinor | harmonicMinor | dorian | mixolydian`, `strings?` >= 2): `threeNpsCells`.
- `arpeggio` (root, `maj min dim aug 7 maj7 m7 m7b5 dim7`, `strings?` >= 3): `arpeggioCells`, one chord tone a string.
- `oneString` (root, any of the eight scales, `string?` default 6): `oneStringClimb`, groups of three scale steps,
  a step higher each group, the last ending an octave up.
- `chromatic` (`strings?`, no key): `acrossStrings` with the 1-2-3-4 cell.
- Common: `position` (0 to 15, or `"root"`), `subdivision` (`quarters | eighths | eighthTriplets | sixteenths`),
  `bars` (1 to 8), `direction` (`up | down | upAndBack`, through `sequenced`), `v: 1`.

Sweeps: left out. `sweepLoop`'s arguments are nameable (a chord, the strings, a fret), but a sweep brings the sweep
pick plan, legato and slides, and the `sweepTiming` profile; v1 keeps to picked notes graded on timing and notes heard.
An `arpeggio` recipe plays the same notes picked.

## Rules of the build (decisions)

- **Position** is the fret of the first note on the recipe's lowest string (box 1 of A minor is "5", as mock 17
  says it). A fret where the shape does not start is refused, never moved to the nearest one.
- **Length**: the shape (after the direction) is played whole as many times as the bars hold; the last note is held
  to the bar line (`hold`, as the blues Path's box line). If one pass does not fit: `tooManyNotes`; if a bar or
  more would be left empty: `tooFewNotes`.
- **Loops** only `upAndBack` (it walks into its own start); `up` and `down` would leap from top to bottom.
- **The hand**: `CUSTOM_REACH_LEVEL = "intermediate"`, shifts allowed (the generator writes "stays" when it does
  not move). The index starts under the first note (not the bar's lowest fret, which is wrong for `down`).
- **Tempo**: pass = min(quarters 120 / eighths 100 / triplets 90 / sixteenths 80, the fastest a fingering exists
  for, floored to 5); rungs `paceLadder(pass, pass, min(60, pass))`, so the first rung is 60 (mock 17) or the
  pace rule's 0.6 of the pass when higher (quarters: 70). A pass under 40: `unreachable`.
- **Grading**: profile `timing` (evenness, notes heard, extras, clean tempo), its default pass marks; `notGraded`
  derived as for any pack Exercise. No note identity.
- **Validated** in a one-Exercise Path (`customPathDoc`): every rule except `progress.exerciseCount` and
  `level.missing` (`PATH_ONLY_RULES`), which are about a Path's shape, not the Exercise.
- **Id**: `my.<key>`, the key every field in one order, `"root"` resolved, defaults written out:
  `my.v1-box-a-minorpentatonic-s61-f5-eighths-3b-upandback`. No pack has a Step `my` (tested).
- **Text**: the Exercise carries short placeholder English (title is `My exercise <key>`): no locale strings in
  this leg. t2b / t2c show the recipe through `summary` and locale templates, not these fields.

## Numbers

- Grid (all 8,880, `node scripts/custom-exercises.mjs report`): built 3,278; tooManyNotes 2,009; noShapeHere 1,980;
  tooFewNotes 1,073; outOfRange 540; unreachable 0; notValid 0.
- `unreachable` cannot fire for these shapes today: with shifts allowed the longest shift is about 190 ms, and the
  slowest pass is 40 BPM. It stays as a refusal for a later shape.
- Time to build one recipe (node on the DGX, 300 built recipes timed alone): median 4.1 ms, p90 15.8 ms (two
  generator passes and the validator). A refusal before the build is under a millisecond.

## Gates (logs under `/tmp/coach-t2a/`)

- tsc: pass (job coach-t2a-tsc-2).
- vitest `src/paths/custom.test.ts`: 13 passed. Full `npm run test`: 31,116 tests passed, 415 of 416 files; the one
  file is the known `TabStage.render.test.tsx` (symlink), plus one "Timeout calling onTaskUpdate" under load
  (`vitest.log`).
- `npm run build`: pass.
- `npm run paths -- check`: exit 0, unchanged; no diff under `src/paths/packs/`.
- `node scripts/rust-test.mjs --test path_exercises`: 12 passed, the new custom test among them (`rust-test.mjs`
  `--lib` is what `npm run test:rust` runs, and it does not run this harness).
- `npm run test:rust` (`--lib`): 1,220 passed, 1 failed: `harmony::worker::tests::lapped_by_more_than_the_whole_ring_it_still_gives_up`
  ("waited 20s for the worker to end") under load; re-run alone it passes. This leg changes no `src-tauri/src` file.

## For t2b and t2c

- `buildCustomExercise(recipe) -> { ok: true, exercise, summary } | { ok: false, why }`; store the recipe, not the
  notes; rebuild on load (`v` decides).
- `why`: `badRecipe {field}`, `noShapeHere {nearest}`, `outOfRange`, `tooManyNotes {needsBars}`,
  `tooFewNotes {fillsBars}`, `unreachable {maxBpm}`, `notValid {rules}` (never reached by the grid), and from
  `nextRecipe` only `atLimit`.
- `nextRecipe(recipe, { change: "subdivision", to } | nextPosition | previousPosition | moreBars | fewerBars |
  otherDirection)` returns the next recipe built, or why not (`recipe: null` when there is no such change).
  Hide a chip whose result is `atLimit`.
- `summary`: shape, root, scale, chord, position, handFret, strings, subdivision, bars, direction, firstNote
  (string, fret, midi, spelled name), notesPerPass, passes, startBpm, passBpm.
- The tool's arguments (`shape`, `root?`, `scale?`, `position?`, `subdivision?`, `bars?`) map onto the recipe; the
  tool's `scale` is the recipe's `chord` for an arpeggio. `recipeProblem(anything)` checks a recipe from outside.
