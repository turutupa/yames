# c2b1b: fact cards, the other four cards, the seam, fourteen locales, the scenes

Branch `coach-c2b1b` (from `coach` at `8a08167a`). No Rust. Logs in `/tmp/coach-c2b1b/`.

## What landed

| File | What |
|---|---|
| `src/coach/ask/cards.ts` | Four cards: `whatChanged`, `improving`, `scoreMadeOf`, `passMarkDistance`. `markedNotFair(row)`: the ONE fairness rule the history cards read (the stored row's `fair === "no"`; `whyNotCounted` uses it too). `lean.premiseNone.*` now carries `measured` / `bars`. |
| `src/coach/ask/intents.ts` | Four `FACT_CARDS` entries (the one list of card ids); `cardAboutExercise` (graded, no Take running, an Exercise on screen) for `score_made_of`; `runFactCard` lets `score_made_of` answer with no Take. |
| `src/coach/ask/suggest.ts` | The four chips' keys; `CARD_ORDER` per verdict (below), still three card chips per place. |
| `src/coach/ask/match.ts` | Typed English for the four (`CHANGED`, `IMPROVING`, `MADE_OF`, `DISTANCE`); "since my last Take" is allowed past `OTHER_TAKE`, any other Take named is not. |
| `src/containers/coach/askCards.ts` | `typedCardAnswerer(language)`: `(text) => english && answerCardFor(text) !== null`; `readsSomethingHere` lets `score_made_of` read the Exercise alone. |
| `src/containers/coach/AskPanel.tsx` | The seam: one `useEffect` in `AskConversation` plugs `typedCardAnswerer(() => i18n.language)` into `setAskNextAnswerer` while the panel is mounted (its return unplugs it); two imports widened. Nothing else in the send path. |
| `src/locales/en/ask.json` | The four cards' strings; `lean.premiseNone.*` reworded. |

## Chips in Ask (card chips; the tools' fill the room to four)

| Last Take | Before (c2b1a) | After |
|---|---|---|
| below the pass mark | where, lean, count | where, distance, lean (then changed, count, improving, made of) |
| passed | where, lean | where, changed, lean (then improving, distance, made of) |
| not caught / too short / ungraded | count | count, made of |

No card chip on the Session's notes (unchanged).

## The four cards' sentences (extends c2b1d's table)

`T` = the Take number. "Measured row": a stored Take with `caught`, no `ungraded`, verdict passed or
belowBar. Every row is in `cards.history.test.ts` with the Take for which it would be false if the
code picked it wrongly.

| Key (`ask.card.` …) | Picked by | Reads | True for (test) |
|---|---|---|---|
| `chip.changed/improving/madeOf/distance` | chips | `cardsHere` | labels |
| `history.leftOut`(`_other`) | changed, improving | count of measured rows with `fair: "no"` skipped | a 99% Take marked not fair is never quoted |
| `changed.first` | no measured, fair row before T | `takesOf(path, exercise)` minus T | no row, or only another Exercise's |
| `changed.onlyUnfair` | only unfair rows before T | as above | never "no measured Take" beside unfair ones |
| `changed.thisUnfair` | T's own row `fair: "no"` | stored row | T not compared |
| `changed.sameTempo` / `changed.tempo` | the row compared | `row.bpm`, `outcome.bpm` | 85 then 90: two tempos, never "the same" |
| `changed.metric.even/heard/extras/accents/notes/hold` | stored headline metric + this Take's check on the same metric and the same pass mark | `headlineMetric/Value/Min/Max`, `grade.checks` | stored headline on notes heard: the pair is notes heard, not evenness |
| `changed.noPair` | no check on the same metric and pass mark | as above | pass mark 0.7 then 0.85: nothing set side by side |
| `changed.verdict.bothPassed/bothBelow/nowPassed/nowBelow` | the row's verdict, T's | `facts.verdict`, `grade.verdict` | each pair |
| `improving.tooFew`(`_other`) | < 3 measured fair rows | rows | not caught / ungraded rows not counted |
| `improving.window` / `windowSame`(`_other`) | ≥ 3 | oldest and newest `bpm` | same bpm: never "went from 90 to 90" |
| `improving.clean`(`_other`) / `cleanNone` | every row can say (`newClean`, or the scorer's `countsForCleanTempo`) | rows | a passed row with neither: no count said |
| `improving.even`(`_other`) / `evenNone` | rows with the scorer's evenness check on the Exercise's evenness pass mark, else that headline | rows | no evenness kept: no number |
| `made.intro`(`_other`) + `made.check.even/heard/extras/accents/notes/hold` | `exercise.passBars`, pitch only where graded (`gradesPitch`) | pass marks | `notesWritten` not graded: no "right notes" check |
| `made.clean` | always | `CLEAN_TEMPO_MIN_BARS` | – |
| `made.tempo` | `passAtBpm` not null | Exercise | null: no line |
| `made.ungraded.selfChecked/practiceOnly/landings` | `grading !== "graded"` | Exercise | each mode its own line |
| `made.not.*` (12) | `exercise.notGraded` ids | Exercise | each id listed |
| `distance.short.*` (6) | check `met === false` | `displayValue/Bar`, gap | 79 vs 85: "6 points short"; 84.6 vs 85: "< 1", never "0" |
| `distance.met.*` (6) | check `met === true` | as above | – |
| `distance.unmeasured`(`_other`) | checks with `met === null` | grade | counted, never a number |
| `distance.tempo` | `bpm < passAtBpm` | Exercise | at or above: no line |
| `distance.none` | nothing to say | – | – |

## Decisions

- **Not-fair Takes: one helper, `cards.ts` `markedNotFair`.** It should become nf1's
  `isMarkedNotFair` (`session/progress.ts`) once both are merged; nothing else in this leg reads `fair`.
- **"Improving" says the numbers, never a verdict on the trend** (no "yes, you are improving"): a
  named window, oldest and newest, best.
- **"What changed" compares the stored headline number** (what the result screen showed as "last
  time") with this Take's check on the same metric and pass mark, and always says both tempos.
- **English only in the box**: `typedCardAnswerer` reads `i18n.language` at each send; any other
  language goes on to the model; cards are reached there by chip.
