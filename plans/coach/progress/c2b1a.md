# c2b1a: fact cards, the machinery and three cards, in English

Branch `coach-c2b1a` (from `coach` at `838a3675`). No Rust. English only (the other fourteen
locales carry the English text; list below).

## What landed

| File | What |
|---|---|
| `src/coach/ask/cards.ts` (new) | Pure: `CoachContext` → `FactCard` (sentences as `Line`s + the source the app attaches) or `NoCard` (one line). `whereSlipped`, `earlyOrLate(ctx, premise)`, `whyNotCounted(ctx, what)`. `cardAnswer(card, word)` → the existing blocks through `resolveCoachAnswer({ source })`; `askCardBlocks` drops a text block without a source. Reuses `takeNote()` (same inputs as the Session's note), so a card never contradicts the note. |
| `src/coach/ask/intents.ts` (new) | `FACT_CARDS`: each a player `read` tool of the tools' shape (name, closed enum args, note, `when`, `run`) plus `card`. `cardsHere(ctx)`, `factCardCatalogue()`, `runFactCard(call, ctx)` (the runner's `checkCall`, then the Take, the grading, `when`, then the card). |
| `src/coach/ask/match.ts` (new) | `matchCard(text)`: typed English → `{ tool, args }` only on a clear match (a question, one shape). |
| `src/coach/ask/suggest.ts` (new) | `suggestChips(place, facts)` (pure, ≤ 3) and `cardChipsFor(ctx, place, answered)`. Places: `readyNote`, `resultNote`, `toolNote`, `askEmpty`, `askAbove`. |
| `src/coach/ask/cardFixtures.ts` (new, test-only) | Fixture Takes of "A tune on the B string" (real plan, `gradeTake`), a result-screen context around one. |
| `src/containers/coach/askCards.ts` (new) | `askCard(call, said)`, **`answerCardFor(text)`** (the seam), `askCardChips`, `askUngradedHere`, `lastCardShape`. |
| `src/containers/coach/AskCardTurn.tsx` (new) | The card turn (CoachBlocks + source line) and the "?" question chips. |
| `askStore.ts`, `AskPanel.tsx`, `askTools.ts`, `askContext.ts`, `useAskHost.ts`, `ask.css` | See "Diff for review". |
| `SessionCoach.tsx`, `ToolCoach.tsx` | The notes' chips through `suggestChips` (same chips). |
| `src/locales/*/ask.json` | `ask.card.*` (51 strings) in all fifteen, English text everywhere. |

## The three cards

| Question | Reads | Answer for one fixture Take (Take 2, 90 BPM, below the pass mark, bars 1 and 5 slipped, the tune's bar 1 notes 40 ms late) | Source |
|---|---|---|---|
| Where did it slip? | `takeNote()` place, last Take's count there, direction | "Bar 1 of the tune slipped on 2 of 3 rounds. The notes there landed late." | Measured · Take 2 |
| Was I early or late? (premise from "rushing" / "dragging") | the note's direction; the lean per pattern bar (stored `facts.lean`, else `takeLean(review)`), over `biasThresholdMs(bpm)` | asked "how do I stop rushing": "In Take 2 your notes landed late, not early. Bar 1 of the tune slipped on 2 of 3 rounds. The notes there landed late. Bar 1 of the tune: N ms later than the rest of the Take." | Measured · Take 2 |
| Why didn't that count? (`what`: the Take or a metric) | verdict, `ungraded` why, stored `fair`, the note's lead; `Exercise.passBars` / `notGraded` | not caught: "I didn't measure Take 2: I heard 9 of 60 notes, too few to grade, so it doesn't count against you." + the no-catch hint | Worked out by the app |

## Decisions and why

- **Cards are a list of their own (`FACT_CARDS`), not entries in `COACH_TOOLS`.** Same shape (`read`,
  player, closed args, `when`, `run`), checked by the same `checkCall`; but `router.test.ts` (t1b2b's)
  requires an English command for every tool in `COACH_TOOLS`, and a card is reached by a question.
  `factCardCatalogue()` gives the registry's catalogue shape for a model later.
- **One text block per card** (one source line, as mocks 08 / 15), cut between sentences when it passes
  the catalogue's 240 characters (the resolver drops a longer one).
- **The source**: a card read off a Take is `measured` with its Take number; "I didn't measure that"
  (not caught, ungraded Take, a metric not graded, no note-by-note timing) is `app`, a rule.
- **`when`**: false in a Take, for an ungraded player (grading off or the Session ungraded) and without
  a Take of the Exercise on screen; where / lean need a measured Take (passed or below). Asked anyway
  (typed), a Take not caught gets "I didn't measure that"; an ungraded player gets one line
  (`ask.card.notNow.ungraded`); a metric needs only the Exercise.
- **No card chip on the Session's notes in this leg.** The brief holds the chips the player sees; a new
  chip row on the result note is a layout change its scenes have not measured. The notes' chips
  ("Hear it first", "What should I try?") and the tools' note chips now come from `suggestChips`,
  unchanged. Card chips are in Ask: the empty state and above the text box, before the tool chips, never
  the card the thread just answered.
- **The review in Ask's context**: `useAskHost` now passes the last Take's review (the bus's
  `takeResult`, matched to the last outcome). `contextForModel` already prints its findings line, so a
  model's context gains that line too.

## To translate (c2b1b)

Every key under `ask.card.*` in the fourteen locales other than `en` is the English text:
`chips`, `chip.{where,lean,count}`, `canAnswer.ungraded`, `tooShort`, `slip.{none,noBars}`,
`lean.premise.{early,late}`, `lean.premiseNone.{early,late}`, `lean.bar.{early,late}`, `lean.none`,
`lean.notMeasured`, `count.{passed,below,notCaught,tooShort,unfair,pitchGraded}`,
`count.ungraded.{eyes,chosen,inputOff,gradingOff}`, `notMeasured.{pitch,pickDirection,muting,posture,
tension,handAttribution,fingering,tone,feel}`, `notNow.{noTake,ungraded}`.

## For c2b1b

- **The seam**: `answerCardFor(text): string | null` (`src/containers/coach/askCards.ts`): writes the
  player's turn and the card turn and returns the card turn's id, or returns null and writes nothing.
  Plug it into t1b2b's next-answerer slot.
- A card is added by a name in `CardShape`, a function in `cards.ts`, an entry in `FACT_CARDS`, a chip
  key in `suggest.ts`'s `CARD_CHIP` and its place in `CARD_ORDER`, and patterns in `match.ts`.
- Path Takes have no `take` / `compare` block (those reference Songs attempts): a block for a Path Take
  needs a new reference type.

## Gates

(filled in below as they run)
