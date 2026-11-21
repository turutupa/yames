# Leg c2b2a: fact cards from the Path, the plan and theory, in English, as code with tests

Worktree `/home/dgx-delgado/yames-coach-c2b2a`, branch `coach-c2b2a`. Logs under `/tmp/coach-c2b2a/`.

The first half of `c2b2-fact-cards-path-plan-theory.md` (read it whole: its reading list, its rules and
its "Not yours" are yours; the parent stays as the record). Split the way c2b1 was: this half builds
the parent's items 1 to 4 and 6 **in English only**, with unit tests and no layout scene. c2b2b (next)
does the source line that opens what it cites, the fourteen locales and the scenes.
**Needs c2b1b merged** (you extend the same `intents.ts`, `suggest.ts` and `ask` locale files).

Read first: `plans/coach/progress/c2b1a.md` and `c2b1b.md` (the machinery: how a shape is added, how
the source is attached, the matcher, the chips' chooser), `t1a2.md` (`test_out`, `set_minutes` and how
a proposal is made: you end a card in one, you never act), `t1a1.md` (`show_scale`, `show_chord`),
`c4c.md` (`cueFor`). Design, read-only: `DESIGN.md` 5.3 (rows 2 to 5 of the topics table), 5.4, 4.3,
9.1 (the "Teaching text", "The next action" and "Standing" rows); mock `08`.

## What to build

1. **The Exercise and the Step** (parent item 1): "what is this for", "what should I try", "how do I
   play it", "what is graded here and what is not". The pack's own text in the player's language
   (`exerciseWords`, the variant played) and the cues; **quoted, never paraphrased**; source "From the
   Path · Step N". A test that every quoted string is byte-equal to the pack's.
2. **The plan** (item 2): "why this", "why this tempo", "what's next", "can I skip ahead", "I have 5
   minutes", "when does this come back", from `Reason` / `reasonLine()`, `tempoFor()`, `bigAction`,
   `testOutSteps`, the minutes picker, the review schedule; source "The app". Where the honest answer
   is an action the card ends in that tool's **proposal** (`test_out`, `set_minutes`), issued through
   the runner like every other proposal: a test that building the card changes nothing.
3. **Theory** (item 3): "what fits over F", "show me the next position", "what notes are in this
   chord", from `src/jam/harmony.ts`, `scales.ts`, `src/paths/theory.ts`, as `fretboard` and
   `chordShape` blocks through `show_scale` / `show_chord`; source "Worked out by the app". Arguments
   are closed sets (roots, scale and chord names); an unknown one is "I don't know" with the nearest
   thing the app does know (guardrail 3).
4. **The app's computed terms** (item 4): "what does 85% even mean" answered in milliseconds at this
   tempo for this Exercise; "what is a clean tempo" with the player's own number; "why didn't that
   count" if c2b1a did not already cover it (check; do not duplicate). The **written** help entries are
   c2cb's: leave them out.
5. **Chips and matching** (item 6): the new shapes in `suggest.ts` (still at most three per place; the
   table test per screen extended) and English entries in the matcher with near-misses; a line the
   router takes as a command still never matches a card (the existing test covers the new entries).
6. Strings: English only; put every new key in all fifteen locale files with the English text, so
   `i18n.locales.test.ts` stays green, and list them in `progress/c2b2a.md` under "to translate
   (c2b2b)". The English honesty lint covers every template.

## Not yours

Tapping a source line (c2b2b). Locales other than English and layout scenes (c2b2b). Search and the
help set, `explain_screen` (c2ca / c2cb). Jam's and Songs' own cards (c5a). A model (c3b).

## Gates

tsc, vitest, build; layout by name `ask.spec.ts`, `ask-tools.spec.ts` (the thread shows new answer
kinds; no new scene yet).

## Report

As the rules block's "The end of the leg": the table of shapes added (question, what it reads, the
answer on one fixture, its source, the proposal it ends in if any), the chips per screen, the keys left
in English, and a "diff for review" paragraph for any hunk outside `src/coach/ask/`.
