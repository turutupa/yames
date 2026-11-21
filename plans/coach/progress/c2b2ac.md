# c2b2ac: the second read's fixes to the Path / plan / theory cards (M1, M2, the relay decision, L1-L6)

Branch `coach-c2b2a` (fix leg, same worktree). Base before the first commit: `fa02b3a3`. Review: `/tmp/coach-orch/c2b2ab-review.md`.
Diff of this leg's own commits (not the merge): `/tmp/coach-orch/c2b2ac-fix.diff`.

## Findings and fixes (tests in `pathCards.test.ts` PC, `choicePrompt.test.ts` CP)

| Finding | Fix | Test (fails on the old code) |
|---|---|---|
| M1 `scalesNone` false (G7#9: the app's half-whole diminished holds it) | says what was checked: `theory.scalesNoneMinor` / `scalesNoneMajor`, "In {{root}} minor/major, none of the scales the app picks for {{chord}} has every note of the chord in it." (`scalesNone` removed) | PC "G7#9: none of the scales the app picks for it in C minor…" (key, values, English, the major sentence) |
| M2 three words of the note in the prompt | `short` on every `FactCardTool` (hand-written, at most six words, distinct), carried by `EVAL_CARDS`; past the 300-token share EVERY card (the seven Take cards too) is `id(args): short`; a card without one (a test's) keeps three words | CP "every card is in the prefix, by its hand-written short line" (every id, at most six words, pairwise distinct, each line `id: short`, the budgets) |
| Relay 2026-11-21: no grading chosen | `passMarkMs` first: a player who CHOSE no grading (`grading: "off"`, or the Session's `ungraded` `gradingOff` / `chosen`) gets one line `term.noPassMarkSet` naming Settings > Practice > "Grade my playing" > "Grade me" (all three checked to exist); input off / "for your eyes" are not that player and still get the pass mark. `cleanTempo` for the same player: the rule, then the same line | PC "a player who chose no grading asks about a pass mark" (grading off + 85, through `runFactCard` too; "Just play" chosen; input off not; the Settings names) and "my own exercises and a player without grading" |
| L1 key renamed enharmonically | `nameAbove` gives `{ letter, app }`: the sentence and the scale rows say the letter name (Cb, Fb, Bbb), `show_scale` takes the app's (B, E, A) | PC BY_LETTER rows by hand: Gb7 (V of Cb major, Gb Mixolydian), Bbdim (vii of Cb major), Gbm7b5 (ii of Fb minor), Abdim7 (vii of Bbb minor); "Gb7 … of Cb major" in English |
| L3 model-facing notes | `plan_why` / `plan_next`: "this Session's plan"; `scale_fits`: "The scales the app picks over a chord in a key it names, only those holding every note of the chord, spelled; the first drawn." `plan_minutes` keeps "today's plan": that card IS about Today's lengths, outside a Session | – (notes) |
| L4 two checks at one percentage | every check at the asked % named: `term.accentsMark`, `term.notesMark` (new) beside `heardMark`; a check with no sentence beside a named one: `term.markAlso` | PC "two checks at the same 90%", "right notes and a check with no sentence at the same 80%", "60%" (accents now named; an unknown check still no card) |
| L5 `noteOf` Path | falls back to `pathIdHere` (the running step's Path). `runningPlan` / `planStepHere` / `pathIdHere` moved to `cards.ts` (pathCards imports and re-exports `planStepHere`). Can a result-screen Take lack a stored row? Not in practice: `useSessionRun.ts` builds the row and the outcome (`takeId: row.id`, :1419) in one handler and puts the row in progress in the same update (:1444, :1490). The fallback is defensive | PC M3 test, extended: no Path, no stored row, the plan step's Path: repeat 2 (old code: 1) |
| L6 | hand number: 0.75 at 125 ms = 19 ms (window 50, k 25, σ = 25·√(−2 ln 0.75)); `planReturn` run with the review due in three hours: count 1 | PC "the evenness formula…", "planReturn with the review due three hours from now" |
| L2 | kept: `useAskHost`'s plan getter returns Today's plan on Today (`view === "today"`), so the choice facts carry Today's part titles there, as the eval world sends (`evalRun.ts:191`). Path titles only, no findings | – |

## The prefix CHANGED (the router must be re-rendered and re-measured)

`choicePrefix(catalogue, EVAL_CARDS)`: **1384 tokens** (tools and format 1090, the twenty cards 292 of 300); before this leg 1361
(cards 269, three words each). The cards section's text changed for all twenty cards. The router's training data
(`src/coach/train/render.ts`) and the stock eval (`evalRun.ts`) build their prefix from the same `choicePrefix`, so both
must be rendered again: the orchestrator's own leg. No file under `evals/coach/train/` was touched and no fixture was
regenerated: the choice grammar takes ids and arguments only, which did not change (`grammar.test.ts` passes on the
fixture as it is), so no Rust fixture changed and `npm run test:rust` is not owed.

## Strings (English in all fifteen `ask.json`; c2b2b translates)

Removed: `theory.scalesNone`. New: `theory.scalesNoneMajor`, `theory.scalesNoneMinor`, `term.noPassMarkSet`,
`term.accentsMark`, `term.notesMark`, `term.markAlso`.

## Merge of `coach` and gates

`git merge coach` (lf1, c4b2, c3d2): clean; `cards.ts` auto-merged (coach's `variantIndexOf`). t2c was not on `coach` yet.

Gates, on the branch after the merge (logs: `job logs <name>`):

- tsc pass (`coach-c2b2ac-tsc-3`); build pass (`coach-c2b2ac-build`); `npm run paths -- check` pass (`coach-c2b2ac-paths`).
- vitest (`coach-c2b2ac-test`): 50829 passed, 10 skipped, 3 failed + the known `TabStage.render.test.tsx` load failure.
  The three (`ToolCoach.test.tsx` x2, `useSessionRun.startPath.test.tsx` x1) touch nothing of this leg and pass alone on
  the same tree (`coach-c2b2ac-vt-3`): timing tests under the queue's load.
- Targeted (`coach-c2b2ac-vt-2`, before the merge): pathCards, choicePrompt, model, intents, cards, grammar, `src/coach/train`: 1192 passed.
- Layout `ask`, `ask-tools`, `ask-cards` (`coach-c2b2ac-layout`): 39 passed, 2 timed out at 30 s (ask-tools "Slower's
  chip", ask-cards "at 1440, Manuscript"); re-run of the two specs (`coach-c2b2ac-layout-2`): 23 passed.
- `npm run test:rust`: not owed (no fixture under `src-tauri` changed).
