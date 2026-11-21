# Leg c2b1a: fact cards, the machinery and the first three cards, in English

Worktree `/home/dgx-delgado/yames-coach-c2b1a`, branch `coach-c2b1a`. Logs under `/tmp/coach-c2b1a/`.

The first half of `c2b1-fact-cards-playing.md` (read it whole: its rules, its reading list and its
"Not yours" are yours). Split by session 3 because every leg with UI, fifteen locales and layout
scenes ran past 300k tokens. This half builds the machinery end to end for **three** cards, in
**English only**, with unit tests and no layout scene. c2b1b (next) writes the other cards, the
fourteen other locales and the layout scenes on top of it.

## Yours, from the parent brief

- Item 1 (`src/coach/ask/intents.ts`: the shapes as `read` tools of the registry, written so a card
  is added by adding an entry) and item 2 (`src/coach/ask/cards.ts`: `CoachContext` → `CoachAnswer`
  of the existing blocks; **the app attaches the source; a text block without a source is not
  rendered in Ask**, as a test).
- **Three cards** of item 3, each with a table test over fixture Takes: *where did it slip*; *early
  or late* (the lean, by bars), **with the premise that contradicts a measurement answered first**
  (mock 15); *why did that not count* (a Take not caught, a Take marked not fair, a metric the
  Exercise does not grade), which carries the **uncertainty by rule** ("I didn't measure that").
  An ungraded player gets no card about quality (`when` false), and Ask says what it can answer.
- Item 4 (`src/coach/ask/suggest.ts`): the chips' chooser as a pure function with a table test, and
  the chips c1b1 and c2a2 already show moved onto it without changing what the player sees.
- **Reaching a card from Ask**: a chip press asks and answers in the Ask thread (the turn kind,
  drawn with the existing blocks and the source line). Keep the panel change small and say exactly
  which lines of `AskPanel.tsx` / `askStore.ts` you touched. **Leg t1b2b runs beside you and owns
  the text box's send path in `AskPanel.tsx`** (it adds `answerTyped(text)`: the command router
  first, then a slot for "the next answerer", then the plain statement). You do not touch the send
  handler: you add the card turn kind, its drawing and the chips, and you export one function,
  `answerCardFor(text)` (the matcher below plus the card), that c2b1b plugs into t1b2b's slot.
- Item 5 for the three cards only: the matcher from typed English to a shape
  (`src/coach/ask/match.ts`), only on a clear match, with its near-miss table. The typed-command
  router is merged (`src/coach/ask/router.ts`, `plans/coach/progress/t1b2a.md`): do not edit it;
  your matcher is a separate pure function, and a line the router takes as a command must not also
  match a card (a test over the router's command table proves it).
- Strings: **English only**, in the namespace the parent brief names. `i18n.locales.test.ts` demands
  every key in fifteen locales: put the new keys in all fifteen files **with the English text** and
  list them in `plans/coach/progress/c2b1a.md` under "to translate (c2b1b)", so the gate stays green
  and nothing ships half translated without a record. The English honesty lint covers every template.

## Not yours (c2b1b)

The other four cards (what changed since the last Take; am I improving; what the score is made of;
how far the pass mark is), the fourteen translations, the layout scenes. Everything in the parent
brief's "Not yours".

## Gates

tsc, vitest, build; layout by name, because the Ask thread gains a turn kind: `ask.spec.ts`,
`ask-tools.spec.ts`, `coach-session.spec.ts`, `smooth.spec.ts` (nothing new commits during a Take).

## Report

As the rules block's "The end of the leg", with the three cards' table (the question, what it reads,
the answer for one fixture Take, its source), the chips per screen before and after, the seam for
t1b2b, the keys left in English, and a "diff for review" paragraph naming every hunk outside
`src/coach/ask/` (the orchestrator sends the Ask thread and store changes to an independent reader).
