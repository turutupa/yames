# c2b1d: the second review's fixes to the fact cards (review `c2b1c-review.md`)

Branch `coach-c2b1a` (the existing worktree). The rule: a card states only what was measured; no
cause, no advice, no whole-Take claim that only some bars show; "I didn't measure that" is allowed.

## The table: every sentence a card can say

`T` = the Take number; "place" = the note's place (`takeNote` `choosePlace`); "lean" = the per-bar
lean of the stored row, else of the review (`takeLean`, relative to the Take's median). "Changed"
names the finding. 65 `ask.card.*` strings (plural forms counted), 27 new or rewritten, one removed
(the old `count.notCaught` string), plus the reused `session.note.place.*` / `lastTake*` lines.

| Key (`ask.card.` …) | Picked by | Reads | True for | Status |
|---|---|---|---|---|
| `chips`, `chip.where/lean/count` | `AskPanel` chip row | `cardsHere` | labels, no claim | ok |
| `canAnswer.ungraded` | `askUngradedHere` | `grading`, `run.ungraded` | grading off or ungraded Session | ok |
| `tooShort`(`_other`) | `unmeasuredTake`, where/lean | `barsPlayed` | verdict `tooShort` | ok |
| `slip.none` | `whereSlipped`, no place, strip present | strip | no cell missed (`choosePlace` null only then) | ok |
| `slip.noBars` | `whereSlipped`, no strip | `perBar` absent | no bar-by-bar data | ok; below the pass mark it now follows a `below.*` lead (L3) |
| `lean.premise.early/late` | `earlyOrLate`, premise ≠ way | every leaning bar + the note's direction | only when ALL agree (H2) | **changed (code)** |
| `lean.premiseNone.early/late` | premise, nothing leaning, ≥1 measured bar | lean | no measured bar past the threshold | **changed (code: needs a measured bar, M1)** |
| `lean.bar.early/late` | each leaning bar outside the place | lean | that bar's mean vs the Take's median | ok |
| `lean.none` | nothing to say otherwise | lean, measured count | none of the N measured bars past the threshold, relative | **rewritten (M1)** |
| `lean.notMeasured` | no direction and 0 measured bars | lean | all-null or no lean | **rewritten + code (M1)** |
| `direction.*` (6) | place with a direction | `note.direction` (relative to the median) | relative, not "landed late" | **new** (was the note's "landed") |
| `below.plain` | below, no missed deciding check | verdict | below the pass mark | **new** |
| `below.even/evenSome/heard/extras/accents/notes` | below, deciding check missed | `decidingCheck`, `displayValue/Bar`, heard/expected | the number and the pass mark only | **new (L2: the note's "watch the frets", "keep the idle strings quiet", "it's the spacing" are not reused)** |
| `count.passed` | verdict `passed` | bpm | passed | ok |
| `count.below` | verdict `belowBar` | bpm | "is kept, below the pass mark" | **rewritten (F11)** |
| `count.notCaught.nothingHeard/tooFewHeard/tooManyExtras/lowConfidence` | `notCaughtLine` | `measures.noCatchReason` (`score.rs` `didnt_catch_enough`) | that reason only; no hint after it | **new (H1)** |
| `count.notCaught.unknown` | reason absent / not known | – | "I couldn't grade Take T." | **new (H1)** |
| `count.tooShort`(`_other`) | why card, tooShort | barsPlayed | verdict tooShort | ok |
| `count.notClean` | passed, no clean tempo, held < 8 | `pass.heldBars`, strip | only when no bar inside the run is crossed (`heldStretchUncrossed`) | **changed (code, L1)** |
| `count.notCleanPlain` | held unknown, or the run has a crossed bar | – | held < 8 by the scorer | ok |
| `count.unfair` | stored `fair: "no"` | row | the player's mark | ok |
| `count.pitchGraded` | metric `pitch`, a `noteIdentity` pass mark | Exercise | graded | ok |
| `count.pitchNotGraded` + `count.rightNotes` / `count.notesUnchecked` | pitch not graded but the note measured or tried it | note facts | was "I didn't measure that", false beside a measured share | **new** |
| `count.ungraded.eyes/chosen/inputOff/gradingOff` | `outcome.ungraded` / grading off | outcome | the player's reason | ok |
| `count.ungraded.selfChecked` | `grading: selfChecked` | Exercise | self-checked | ok |
| `count.ungraded.selfCheckedTempo` | `graded` Exercise, rung self-checked | rung | that tempo | ok |
| `count.ungraded.practiceOnly` | `grading: practiceOnly` | Exercise | "practice only, not graded" (the Exercise card's words, `session.paths.practiceOnly`) | **new (M2)** |
| `count.ungraded.landings` | `grading: landings` | Exercise | "isn't graded yet" (`session.paths.notGradedYet`) | **new (M2)** |
| `notMeasured.pitch` | pitch, not graded, nothing measured | Exercise | "isn't part of this Exercise's grade" | **rewritten** ("times your notes" was not always true) |
| `notMeasured.*` (8 others) | metric questions | – | rules about what sound can tell | ok |
| `notNow.noTake`, `notNow.ungraded` | no Take here / ungraded | ctx | as said | ok |

## The other findings

- **M3** `match.ts`: `NAMED_OTHER` (warm-up, Step, Path, Exercise, song parts…) keeps a take-reading
  card off; `NOT_MY_TIMING` takes "is/was my click/metronome …", "behind everyone", "sounds late",
  latency; `ABOUT_ME` has `does|do` again ("Where does it slip?"), and "Which bar was off?";
  `WHY_ABOUT_TAKE` takes "why didn't I …" and "how come that didn't …". All in `match.test.ts`.
- **M4** `answerCardFor` checks `lastTakeHere(ctx)` (or a metric question with an Exercise) before
  the card runs: null and nothing written, grading on or off.
- **L4** the near-misses use "my"; H2 has a fixture where the place is late and bar 1 early;
  `useAskHost.test.tsx` checks the panel's `contextText` is `askModelContext` over the host's sources.
- **F8** (a Take not yet saved): `lastTakeHere` is null, so no card and no chip, unless the variant is
  known: a stored row, an Exercise with no variants, or the Take's own result screen (the variant is
  changed only from the ready screen, `runner.ts` `setVariant`).
- **F10** the cap of four in Ask stands; `suggest.ts`'s header and the brief now say so.

## Gates (after merging `coach`; logs under `/tmp/coach-c2b1d/`)

- `npx tsc --noEmit`: pass (job coach-c2b1d-tsc-2).
- `npm run test` (full): 48862 passed, 10 skipped; the only failing file is the known
  `TabStage.render.test.tsx` (symlink). Before the merge, a targeted run had one `ToolCoach.test.tsx`
  failure that passed on `coach` and in the full run (a flake).
- `npm run build`: pass.
- Layout `ask`, `ask-tools`, `ask-typed`, `coach-session`: 61 passed, 52 skipped. `smooth.spec.ts`
  is the orchestrator's (nothing a Take renders changed).

## For c2b1b

The 27 new or rewritten strings are English in all fourteen other locales. None uses `count`, so
no new plural forms. `direction.*` takes `{{note}}` and `{{fret}}` like the note's own lines.
