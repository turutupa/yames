# c4b3b: the c4b3 review's fixes, and coach merged in

Branch `coach-c4b3` (worktree `/home/dgx-delgado/yames-coach-c4b3`). Work list: `/tmp/coach-orch/c4b3-review.md`.

## Done

- **Merge of `coach`** (t2c `make_exercise`, c2b2a's thirteen fact cards), commit `eafb70c6`, the
  conflict resolution only: `suggest_path` is now a `readsNoTake` entry (`pathEntry`), last in
  `FACT_CARDS`, short note "which Path to try next"; the runner's `readsNoTake` branch answers it for
  an ungraded player, so c4b3's special case in `runFactCard` is gone. `SUGGEST_PATH` is tried
  before the Path and Take tables in `matchCard`. `choice-grammar.gbnf` regenerated with
  `UPDATE_CHOICE_GRAMMAR=1 npx vitest run src/coach/ask/grammar.test.ts`.
- **H1** `pathSuggest.ts`: "next" only for the first ready Path in the curriculum's order; a Path the
  goal put first with nothing started under it gets `readyGoal` ("matches what you said you are
  working toward, and nothing it builds on is missing"). The goal is quoted whenever it changed the
  pick (the curriculum alone would have put another Path first). The test that pinned the false
  sentence now expects `readyGoal`; a tie test keeps "next" with no quote.
- **L6**: goal words are whole words (plural "s" folded), four letters or more, minus a stop list
  ("want", "play", "guitar", "better", ...). Tested: "I want to play guitar better", "sweeping",
  "a sweepstake" decide nothing; "sweeps" picks Sweep.
- **M1** `milestones.ts`: a Path finished from a chosen Level, with a Step below it not finished,
  says `pathDoneFrom` ("{{path}} is finished from {{level}} on: every Step from there is done").
- **L2**: "your first Exercise passed" is not said after a pass on the player's own exercises (now
  scanned, never itself announced) or when a clean tempo is stored for a Path not loaded.
- **L3**: `stepDoneRest`'s "the others stay in your reviews" only when the planner's count
  (`isExercisePassed`, stored ceiling) equals the fair count; else `stepDone`.
- **M2**: typed "suggest a Path" answers on Paths, Today, Progress and in a Session before its
  first Take (the `readsNoTake` path in `answerCardFor`). The chip is KEPT, offered in Ask's empty
  state and above the box on Paths and Progress only, before a Take (no verdict), last in
  `BEFORE_A_TAKE` so it never pushes out an Exercise's card and stays within the three. Not on
  Today (the label could have gone there too; the work list named Paths and Progress).
- **M3**: `match.test.ts` rows: five that match, "suggest a pathway", "what path am I on?",
  "suggest a tempo" that do not; `MATCHES` feeds the "never also a command" check.
- **L5**: `PathSuggestion.test.tsx` (shown with Suggestions on, the button only calls `onOpen`,
  nothing written; hidden while the setting is unread; hidden under "Only when I ask"; hidden during
  a Take). By reading: in a Session the rail (`session.css`, `.main-body[data-session] > .rail`) and
  the phone's tab bar (`!inSession`) are hidden, so Paths should not be on screen in a Take; the
  component now also returns null while the run's phase is `playing` or `listening`.
- **L4**: checked all sixteen shipped Paths (`/tmp/coach-c4b3/l4-steps.mjs`): no Step without a
  gradable Exercise. No change.
- Locales: `pathDoneFrom`, `readyGoal` in all fifteen `companion.json` (two sonnet translators, one
  sonnet proof-reader: de `readyGoal` and ja `pathDoneFrom` corrected). No new `ask.json` key (the
  chip's label is `companion.pathSuggest.chip`; the short note is English in code).

## For the owner (L1, the orchestrator's decision)

"A card was shown" stays in memory only: nothing is stored without a press. So a milestone (for
example "your first Exercise passed") can show again on a later app run, until the next Session
or its seven days, unless Hide is pressed. That departs from the brief's "each once, stored in
coach.cards" on purpose.

## Choice prompt

`suggest_path`'s short note is "a Path": the cards' share stood at 292 of 300 and the card's line
costs ceil(chars / 3), so "which Path to try next" made it 305. Now 1,397 tokens in all (tools and
format 1,095, the 21 cards 299).

## Gates (on 109e1dca)

- `npx tsc --noEmit`: pass (job coach-c4b3b-tsc).
- `npm run test`: 475 of 476 files, 51,092 tests pass; the one failure is the known
  `TabStage.render.test.tsx` load through the symlink (`/tmp/coach-c4b3/c4b3b-test.log`).
- `npm run build`: pass.
- `npm run test:rust`: 1,278 pass, 1 failed: `harmony::worker::tests::ended_by_the_input_it_says_nothing_more`
  ("waited 20s for a window to be running", a busy machine; this leg touches no Rust). Re-run
  alone (`harmony::worker::tests`, 17 tests): pass. The grammar precheck tests pass
  (`/tmp/coach-c4b3/c4b3b-rust.log`).
- Layout `ask ask-cards rail today-line short-window` with `--lock coach-layout`: 142 passed.
