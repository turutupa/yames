# c1a: the note's brain (takeNote, rounds, lean, heardIt)

Branch `coach-c1a`. Pure TypeScript; no component, no locale strings, no Rust, no visible change.

## What landed

- `src/coach/rounds.ts` (+ test): `foldBar` (played bar from 0, optional count-in, to round and pattern
  bar from 1), `roundsIn` (a partial last round counts), `roundsOfPatternBar`, `patternBarsOf`,
  `spotKey(variantSeed, patternBar)`, `countRounds` (slipped rounds per pattern bar from the bar strip; a
  "thin" bar judges nothing), `deviationsByBar`, `leanPerPatternBar`, `takeLean`.
- `src/coach/takeNote.ts` (+ test): `takeNote(outcome, review, earlier, exercise, context?)` returning a
  `TakeNote` of typed parts and `Line`s (i18n key + arguments). Wraps `takeLine()` / `decidingCheck()` /
  `notCaughtHint()` / `barStrip()`; decides nothing about the grade.
- `src/session/progress.ts`: `TakeFacts.lean`, `TakeFacts.heardIt`, `leanOf`, `heardItOf`, `withHeardIt`.
- `src/session/exportData.ts` (+ test): `heardIt` and `leans` lists in the export.
- `src/containers/session/hooks/useSessionRun.ts`: two hunks. `lean` is computed with `takeLean` where the
  Take's facts are built for `savePathTake`; `answerHeardIt(takeId, "yes" | "notYet")` re-saves the row
  like `answerFair` and is returned with the other actions. Nothing calls it yet (c1b1 / the Session).
- `src/session/coachWords.ts`: `barStrip` takes `Pick<TakeMeasures, "perBar" | "pass">` so a stored
  Take's facts can be stripped too (type-only widening).

## Decisions

- `context` (4th-and-a-half argument): `TakeOutcome` carries neither the variant nor the Session start, so
  `takeNote` takes `{ variantSeed, session, noteVerdicts }`. Without `session`, "once a Session" and the
  repeat count fall back to `takeNumber`.
- `lean` is `Array<number | null>`, not `number[]`: a pattern bar with no heard note is `null`, never a
  made-up 0. Rounded whole ms, positive = late, relative to the Take's median deviation.
- Direction: from the heard notes of the cells that slipped at the place (>= 4 notes, |mean| over
  `findings.rs`'s bias threshold mirrored as `biasThresholdMs`, 65% on one side), else from a `rushing` /
  `dragging` finding that covers those pattern bars and is NOT the whole Take. When the notes are there
  and do not lean, the engine is not asked to overrule them. `fallsApart` names a round, never a direction.
  The note named with it ("its open Bs") only when two thirds of the leaning onsets are one single note.
- Place: the strip's slipped pattern bars, preferring the one the headline finding points at, then the
  one that slipped last Take, then the most rounds. Neighbours that slipped on the same rounds are one
  place (`bars`); every bar of the tune slipping together is `bars` over the whole tune.
- Repeat: counts back over this Session's graded Takes of the same variant at the same tempo whose same
  pattern bar slipped; `goingDown` forces row 3. Only below the pass mark. `onceMoreHere` = passed and
  `sameSpot` (P1's condition, reported only).
- `tooEasy`: this Session's first Take on the Exercise passed with >= 8 points on its narrowest met check
  (a check at 100% is not a limit), and the previous Session's first Take did too.
- `tuningSuspected`: >= 3 wrong notes, >= 75% off the same way. Set only; no line (owner decision 9).
- Ungraded: no place, strip, direction, facts or history. `listenFor` points at `selfCheck[0]` else
  `coachLine` else null (no generic quiz). "Not yet" twice -> `loopFirst`; "Yes" twice -> `tryBpm` =
  `rungAbove`.

## The parts and the keys c1b1 must write (none exist in the locales yet)

| Part | Key | Arguments |
|---|---|---|
| lead | existing `session.coach.*` from `takeLine` | bpm, heard, expected, missed, bars, extras (+ value, bar below) |
| hint (notCaught) | existing `session.noCatch.*` | none |
| findingLine | `session.note.finding.ceiling` | holds, breaks (BPM) |
| placeLine | `session.note.place.slipped.{bar,bars,loop,fromRound}`, `session.note.place.caught.{bar,bars,loop}` | bar (pattern bar), from, to, slipped = count (rounds), of (rounds), round (fromRound only) |
| lastTakeLine | `session.note.place.lastTake` / `session.note.place.lastTakeHeld` | before = count / none |
| directionLine | `session.note.direction.{early,late}`, `.{early,late}Open`, `.{early,late}Note` | none / midi, string, fret |
| historyLines | `session.note.history.newClean` / `.tooEasy` / `.goingDown` / `.stuck`; `.closer` | bpm; from, to (percent) |
| repeatLine | `session.note.repeat.leaveIt` | none |
| facts[] | `session.note.fact.heard`, `.noExtras`, `.extras`, `.rightNotes`, `.notesUnchecked.{notRun,tooFast,tooFew,notesRing,octaveUnsure}`, `.legato`, `.bends`, `.vibrato` | heard, expected; -; count; value, base; -; sounded, due; onPitch, flat, sharp, due; present, due |
| strip.label | `session.note.strip.held` / `.roundEvery` / `.plain` | count |
| ungraded | `session.note.ungraded.notListening`, `.didThey`, `.tryFaster` | -, -, bpm |

Each fact carries a `mark` (`check` / `cross` / `dash` / `none`); each strip cell carries `n`, `state`,
`round`, `patternBar`, `spot`. "bar" in these keys is always a bar of music, never the pass mark. The
ordinal for "the tune's first bar" (`bar: 1`) is the locale's job (ICU `selectordinal`).

## What the design got wrong about the code

- `TakeOutcome` has no variant or Session: hence `context`.
- `findings.rs` bars are played bars from 0 and the Session's count-in is in the transport, not the score:
  no count-in offset is needed for a Session Take (`foldBar` keeps a `countInBars` argument anyway).
- DESIGN's `TakeFacts.lean?: number[]` would force a 0 for an unheard bar: it is `(number | null)[]`.
- DESIGN 4.2 "Check your tuning first." is withdrawn by owner decision 9; only `tuningSuspected` remains.
- `noteVerdicts` are not in `TakeOutcome` or the review the hook holds; whoever wires the note in must
  pass them for `tuningSuspected` to ever be true.

## Gates

- `npx tsc --noEmit`: pass (`/tmp/coach-c1a/tsc.log`).
- `npm run test`: 11435 tests pass; 1 file fails to load, `src/containers/songs/TabStage.render.test.tsx`,
  `Denied ID .../yames-coach-build/node_modules/@coderline/alphatab/dist/font/Bravura.woff2?url`: Vite's
  fs guard refusing the symlinked `node_modules` outside the worktree. Nothing in this branch is in its
  import graph; the same error is in many earlier worktree runs' logs on this machine
  (`/tmp/*vitest*.log`). `/tmp/coach-c1a/vitest.log`, `/tmp/coach-c1a/vitest-tabstage.log`.
- `npm run build`: pass (`/tmp/coach-c1a/build.log`).

## Next

c1b1 draws the note from `TakeNote` and writes the keys above into all fifteen locales; the Session must
pass `context` and call `answerHeardIt`. P1 / P2 read `onceMoreHere` and `repeat`.
