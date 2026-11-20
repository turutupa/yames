# Leg c2b1: fact cards, first half: the machinery, and the cards about your playing

Worktree `/home/dgx-delgado/yames-coach-c2b1`, branch `coach-c2b1`. Logs under `/tmp/coach-c2b1/`.

PLAN's leg c2b (about fifty question shapes the app can answer with no model) is split in two so each
half stays under 250k tokens: this one builds the machinery and the cards answered from a Take; c2b2
adds the cards answered from the Path, the plan and the theory code.

Read: `plans/tasks/coach/BRIEF.md` ("Owner decisions"); `plans/coach/progress/c0.md` (`CoachContext`),
`c1a.md` (`takeNote`, `lean`, `heardIt`, the facts a Take keeps), `c1b1.md` (`CoachNote`, the fact line,
the bar strip), `c2a1.md` (the Ask panel), `t1a1.md` and `t1a2.md` (the registry: a fact card is a
`read` tool of the same list), `t1b1.md` (how Ask shows a tool's result and its chips), `t1b2.md` if it
exists (the typed-command router: it runs before you). Design, read-only:
`/home/dgx-delgado/yames-coach-design-out/DESIGN.md` 5.2, 5.3 (the table of topics), 5.4 (the
guardrails, all seven), 3.6 (question chip, source line, fact line), 9.1 (what the coach reads); mocks
`08` and `15` (look at the PNGs: mock 15 is the premise that contradicts a measurement).

## What to build

1. **`src/coach/ask/intents.ts`**: the question shapes as plain data, each one a `read` tool in the
   registry (name, arguments as closed sets, `when(ctx)`: a card about the last Take exists only when
   there is one). Written so c2b2 adds shapes by adding entries.
2. **`src/coach/ask/cards.ts`**: pure code from `CoachContext` (and stored Takes where the card needs
   history) to a `CoachAnswer` of the existing blocks (`src/coach/blocks`): text from locale templates
   filled with measured values, `take`, `compare`, `progress`, `tabExcerpt` blocks by reference. **The
   app attaches the source** ("Measured · Take 2"); a text block without a source is not rendered in
   Ask (guardrail 2: make that a test).
3. **The cards about your playing** (DESIGN 5.3's first row), each with a table test over fixture
   Takes: where did it slip; early or late (the lean, by bars); what changed since the last Take; am I
   improving (clean tempo and evenness over a named window); why did that not count (a Take not
   caught, a Take marked not fair, a metric the Exercise does not grade); what the score is made of;
   how far the pass mark is, in the Exercise's own terms ("even" answered in milliseconds at this
   tempo is c2b2's with the help set: leave it typed).
   - **A premise that contradicts a measurement is answered first** (mock 15): the player asks about
     rushing, the Take says late: the card says what was measured, then answers.
   - **Uncertainty by rule** (guardrail 3): "I didn't measure that" for a metric the Exercise does not
     grade, a Take not caught, a stored Take asked about single notes. Never a guess, never a blocker.
   - An ungraded player gets no card about quality: the shapes' `when` is false, and Ask says what it
     can answer instead.
4. **`src/coach/ask/suggest.ts`**: which question chips to offer where (on the result's note, on the
   ready note, in Ask's empty state, above the text box), at most three, by a pure function of the
   context with a table test. A chip is one question shape; pressing it asks and answers in Ask. The
   chips c1b1 and c2a2 already show keep working, now through this.
5. **Typed English reaches the cards by matching** (DESIGN 5.3, engine 2): a small matcher from typed
   English to a shape, after the command router and only on a clear match; a table test of questions
   that must match and near-misses that must not. Other languages reach the cards by chip.
6. **Strings**: `src/locales/<lng>/ask.json` (or the file Ask's strings already live in) in fifteen
   locales with `plans/COACH_I18N_BRIEF.md`; the English honesty lint covers every template (no cause
   claimed, no praise, the pass mark never "the bar").
7. Layout: one new scene per kind of answer (a measured card with a `take` block; the premise
   contradiction; "I didn't measure that"), at 1440 and a phone, Ember and Manuscript, one in German or
   Russian.

## Not yours

The cards from the Path, the plan and theory, and "tapping a source line opens what it cites" (c2b2).
Search and the help set (c2c). A model (c3b). New tools that act.

## Gates

tsc, vitest, build; layout by name: `ask.spec.ts`, `coach-session.spec.ts`, `short-window.spec.ts`,
`smooth.spec.ts` (nothing new commits during a Take), your new scenes. The full layout suite is the
orchestrator's on a weekday before 8 PM Pacific (run it yourself after 8 PM or at a weekend).

## Report

As the rules block's "The end of the leg", with the table of shapes (the question, what it reads, the
answer for one fixture Take, its source), the chips per screen, and the screenshot paths.
