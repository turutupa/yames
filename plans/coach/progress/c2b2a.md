# c2b2a: fact cards from the Path, the plan, theory and the app's terms (English)

Branch `coach-c2b2a` (from `coach` at `a66d04ea`). No Rust. Logs in `/tmp/coach-c2b2a/`.

## What landed

| File | What |
|---|---|
| `src/coach/ask/pathCards.ts` (new) | The thirteen cards, pure: `CoachContext` (+ closed args) to `FactCard` / `NoCard`. |
| `src/coach/ask/pathMatch.ts` (new) | `matchPathCard(s, raw)`: typed English for them (the chord read off the raw text). |
| `src/coach/ask/cards.ts` | `CardShape` gains `PathCardShape`; `FactCard.then?` (a tool call the card ends in); `cardAnswer` cuts a sentence longer than a block between words instead of shortening it with "…" (a quoted Path string is never cut short). |
| `src/coach/ask/intents.ts` | Thirteen entries (`pathEntry`, `readsNoTake: true`); `runFactCard` lets a card that reads no Take answer an ungraded player and say its own "not here". |
| `src/coach/ask/match.ts` | `matchCard` = both tables; one shape across both or no card. The Take table's body is unchanged (renamed `matchTakeCard`). |
| `src/coach/ask/suggest.ts` | `CARD_CHIP` partial (cards needing the player's own words have no chip); `BEFORE_A_TAKE` order (no verdict yet); `AFTER_THE_TAKE` appended to each verdict's order (fills only rows the Take cards leave room in). |
| `src/containers/coach/askCards.ts` | `writeCard` issues `card.then` through `runAskCall` (its own turn: a proposal or a drawing's receipt); typed, a `readsNoTake` card is written only when it is a card. |
| `src/containers/coach/useAskHost.ts` | A `step` getter (the plan step's Step), so "From the Path · Step N" has its N. |
| `src/locales/en/ask.json` | `ask.card.chip.*` (9 new), `ask.card.path.*`, `plan.*`, `theory.*`, `term.*`. |

## Every sentence (the table the reviews hold the cards to)

Source: P = "From the Path · Step N" (`{kind: "path", step}`), A = "The app" / "Worked out by the app" (`{kind: "app"}`).
Tests: `pathCards.test.ts` (PC), `pathMatch.test.ts` (PM), `askCards.test.tsx` (AC).

| Key (`ask.card.` …) | English | Reads | True for | Test |
|---|---|---|---|---|
| `path.quote` | “{{text}}” | `exerciseWords(ctx.exercise, played)` purpose / howTo; `cueFor(played, noteOf(ctx)).cue.say` | the pack's string, byte-equal; the variant played (the Take's stored seed via `lastTakeHere`, else the step's) | PC "what is this for…", "how do I play it…", "what should I try…" |
| `path.purposeIntro` / `purposeNone` | What this Exercise is for, in the Path's words: / The Path gives no purpose… | purpose | purpose empty → None, never filled in | PC "an Exercise with no words of its own" |
| `path.howIntro` / `howNone` | How to play it, in the Path's words: / … no how-to | howTo | as above | same |
| `path.tryMeasured` | The Path's cue for what Take {{take}} measured: | `cueFor` basis `measured` | only when the cue was picked by the Take's note; never for an ungraded player (note not read) | PC "what should I try", "playing without grading" |
| `path.tryGeneral` / `tryNone` | The Path's cue for this Exercise: / The Path has no cue… | basis `general` / none | no cues → None | PC "an Exercise with no cues" |
| `path.noExercise` | There's no Exercise on screen… | ctx.exercise absent | NoCard (typed: next answerer) | PC "no Exercise on screen" |
| `plan.why` + `session.why.*` | Why this part is in today's plan: + the step's own `Reason` (`reasonLine`), and its `context` reason | `ctx.plan.steps[run.stepIndex]` | a running Session only | PC "why this" |
| `plan.tempoPlanned` | This part was planned at {{bpm}} BPM. (+ the reason) | the plan step's `bpm` | as planned | PC "why this tempo" |
| `plan.tempoNow` | It is at {{bpm}} BPM now. | `run.bpm` | only when it differs from the plan (no cause said) | same |
| `plan.tempoNone` | This part has no tempo of its own. | drill step / jam with no bpm | – | – |
| `plan.next` / `nextBpm` / `nextLast` | Next in today's plan: {{title}}[, at {{bpm}} BPM], {{minutes}} min. / This is the last part… | `plan.steps[stepIndex + 1]` | the plan as it stands (not `bigAction`: the big button may say "again") | PC "what's next" |
| `plan.notInPlan` | There's no Session running a plan… | no plan / run | NoCard | PC "no running plan" |
| `plan.skip` | Test out plays one Take at the pass tempo of each graded Exercise of a Step that isn't passed yet (of every one, when all of them are). | `testOutSteps`' rule | then `test_out {}` (the Step the player is on); the proposal says the Step and the count | PC "can I skip ahead"; outside a Session only |
| `plan.skipInSession` | Test out starts from a Step's page… | `inSession` | NoCard | same |
| `plan.minutes` / `minutesSnapped` | Today's plan comes in 5, 10, 15, 20 minutes. / The nearest to {{asked}} minutes is {{to}}. | `PLAN_MINUTES` | then `set_minutes {minutes: to}` | PC "I have 7 minutes", AC "typed 'I have 5 minutes'…nothing changes" |
| `plan.minutesInSession` / `minutesNone` | … can't change / Tell me how many minutes… | `inSession` | NoCard | AC "in a Session…" |
| `plan.returnDays` / `returnDue` | The review schedule brings this Exercise back in {{count}} day(s), at {{bpm}} BPM. / … due for review now, at {{bpm}} BPM. | `reviewStateOf` (`dueAt`, `bpm`), `ctx.now` | passed, no Take marked not fair | PC "passed: the schedule's own day" |
| `plan.returnNotPassed` / `returnUngraded` / `returnMine` | … isn't passed yet / isn't graded / own exercises aren't on a Path | `reviewStateOf` null / grading / path id `my-exercises` | – | PC "not passed", "my own exercises" |
| `plan.returnNotFair` | A Take of this Exercise is marked not fair, and the review schedule doesn't leave it out, so I won't quote it. | `isMarkedNotFair` on `takesOf` | no number said | PC "a Take marked not fair" |
| `theory.chordNotes` | {{chord}} is {{notes}}. | `spellChord`, else `chordNotes` + `noteName` | then `show_chord {chord}` | PC "the notes of F7", "lower case", "no spelling table" |
| `theory.chordUnknown` / `chordUnknownNoRoot` | I don't know the chord “{{asked}}”. Chords I can spell on {{root}}: … / … written like C, Am, G7… | `parseChordName` null | uncertain; nothing drawn | PC "a chord the app cannot read", AC "an unknown chord" |
| `theory.scalesIntroMajor` / `Minor` | Over {{chord}}, taken as the home chord of {{root}} major/minor, the app's jam offers these scales. | `homeKeyOf` (minor third and no major third → minor) | the key assumed is said | PC "what fits over F", "a minor chord…" |
| `theory.scale` | {{root}} {{name}}: {{notes}}. | `scalesForChord`, `spellScale` (else `scaleNotes`) | then `show_scale` for the first | PC "what fits over F" |
| `term.evenMs` | The evenness pass mark here is {{bar}}%: at {{bpm}} BPM, with this Exercise's closest notes {{gap}} ms apart, it allows a spread of about {{ms}} ms around your own average timing. | `passBars` `timingEvenness`; tempo = `run.bpm`, else the Take's, else `passAtBpm`; gap = `buildTake` schedule's smallest onset gap × 60000/bpm; σ = k√(−2 ln p), k = half `tempo_aware_window_ms` (`score.rs` `evenness`) | 4/4-family meters only | PC "the evenness formula agrees with the metric's own note" (0.85 → 14 ms at 125 ms gaps), "what does 85% mean" |
| `term.evenHow` | Evenness is measured around your own average timing, not the click, so a steady lean doesn't lower it. | the MAD around the median in `evenness` | – | – |
| `term.noSuchMark` | No pass mark of this Exercise is {{value}}%. | `passBars` mins ×100 | said first; never matched to a neighbour | PC "a number no pass mark has" |
| `term.evenNone` / `evenNoMs` / `ungradedExercise` | no evenness check / beat isn't a quarter note / not graded | – | no number | PC "no evenness check" |
| `term.clean` | A clean tempo is the tempo of a Take that passes with {{need}} clean bars in a row. | `CLEAN_TEMPO_MIN_BARS` | `heldCleanTempo`'s rule | PC "a clean tempo" |
| `term.cleanYours` / `cleanNone` | Your clean tempo on this Exercise is {{bpm}} BPM. / none yet | `shownCleanTempoOf` (not-fair Takes count in no number) | graded player, graded Exercise, not `my-exercises` | PC "a clean tempo", "held by a Take marked not fair" |
| `term.cleanNotFair` | Takes you marked not fair don't count toward it. | any Take marked not fair | – | same |
| `term.cleanMine` | Your own exercises aren't on a Path… | path id `my-exercises` | no number | PC "my own exercises" |
| `chip.*` (9) | the chip labels | `cardsHere` | – | `suggest.test.ts` |

## To translate (c2b2b)

English text in the fourteen other locales: `ask.card.chip.{purpose,how,try,planWhy,planTempo,planNext,planReturn,passMarkMs,cleanTempo}`,
every key under `ask.card.path.*`, `ask.card.plan.*` (`returnDays` has `_other`), `ask.card.theory.*`, `ask.card.term.*`.
The scale names in `theory.scale` come from `SCALE_NAMES_EN` (English in every language): c2b2b should word them from `SCALES[id].labelKey`.
