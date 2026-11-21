# Leg c2b1b: fact cards, the other four cards, fourteen locales, the scenes, and the typed-text seam

Worktree `/home/dgx-delgado/yames-coach-c2b1b`, branch `coach-c2b1b`. Logs under `/tmp/coach-c2b1b/`.

The second half of `c2b1-fact-cards-playing.md` (read it whole: its rules, its reading list and its
"Not yours" are yours). c2b1a built the machinery and three cards in English; this half finishes the
parent's item 3, translates everything c2b1a left in English, draws the layout scenes and plugs the
cards into the text box. **Needs c2b1a and t1b2b merged** (both were running when this was written).

Read first: `plans/coach/progress/c2b1a.md` (the exact names: the shapes in `src/coach/ask/intents.ts`,
`cards.ts`, `suggest.ts`, `match.ts`, the card turn kind, `answerCardFor(text)`, and the list "to
translate (c2b1b)") and `plans/coach/progress/t1b2b.md` (`answerTyped(text)` and the name of its
replaceable "next answerer" slot). If a name below differs from what those files say, theirs wins.
Then `progress/c1a.md` (`TakeFacts`, `lean`), `c1b1.md` (the fact line, the bar strip). Design,
read-only: `/home/dgx-delgado/yames-coach-design-out/DESIGN.md` 5.2, 5.3 (row 1 of the topics table),
5.4 (all seven guardrails), 3.6; mocks `08` and `15` (Read the PNGs).

## What to build

1. **Four cards** (parent item 3), each an entry in `intents.ts` with a table test over fixture Takes,
   built the way c2b1a built its three (the app attaches the source; uncertainty by rule):
   - *what changed since the last Take* (`TakeOutcome.previousValue`, the two Takes' measures; "79 →
     87"; on the first Take of an Exercise the card says there is nothing to compare, never a guess);
   - *am I improving* (clean tempo and evenness over a **named window**: "in your last N Takes on
     it"; at most the stored 500-Take window; fewer than three Takes says so);
   - *what the score is made of* (the checks the Exercise grades and the ones it does not:
     `Exercise.notGraded`, `NOT_GRADED`, `decidingCheck()`);
   - *how far the pass mark is*, in the Exercise's own terms. "Even" in milliseconds at this tempo is
     c2b2a's (computed app terms): leave it out here. Never "the bar" for the threshold.
   An ungraded player gets none of the four (`when` false); a Take marked not fair is left out of
   "improving" and "changed", and the card says it left one out.
2. **Chips** for the four through `suggest.ts` (still at most three per place; extend its table test).
3. **The seam**: plug `answerCardFor(text)` into t1b2b's slot so typed English reaches a card after
   the router and before the plain statement. A test: a line the router takes as a command never
   reaches a card; a card question in English typed into the box answers with the card; in any other
   locale typed text does not match (cards are reached there by chip). One hunk in the file t1b2b's
   progress names; nothing else in the send path changes.
4. **Fourteen locales** for every key c2b1a left in English and every key this leg adds, by sonnet
   helpers (four or five locales each) with `plans/COACH_I18N_BRIEF.md`. The English honesty lint
   covers every template (no cause claimed, no praise, "pass mark").
5. **Layout scenes** (parent item 7): a measured card with a `take` block; the premise that contradicts
   a measurement (mock 15); "I didn't measure that"; one of this leg's cards. At 1440 and a phone,
   Ember and Manuscript, one in German or Russian. Pictures only when an env var names the folder
   (`YAMES_SHOT_DIR`; never a fixed `/tmp` path).

## Not yours

The Path, plan and theory cards and the source line that opens what it cites (c2b2a / c2b2b). Search
and the help set (c2ca / c2cb). The router and the command tables (t1b2a / t1b2b: a real defect you
find is fixed with a test and named in the report). A model (c3b). **c2b2a may start once you are
merged, not beside you**: you both extend `intents.ts`, `suggest.ts` and the `ask` locale files.

## Gates

tsc, vitest, build; layout by name: `ask.spec.ts`, `ask-tools.spec.ts`, `coach-session.spec.ts`,
`short-window.spec.ts`, `smooth.spec.ts` (nothing new commits during a Take), your new scenes. The full
layout suite is the orchestrator's (you changed text on screens: say so).

## Report

As the rules block's "The end of the leg": the four cards' table (the question, what it reads, the
answer for one fixture Take, its source); the chips per screen before and after; the seam's diff as a
"diff for review" paragraph (every hunk in `AskPanel.tsx` / `askStore.ts` / `askTools.ts`); the
locales that want a native read; the screenshot paths.
