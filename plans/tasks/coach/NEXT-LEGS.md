# The next legs: order, what runs beside what, shared files, R flags, gates

Written 2026-11-20 by the brief-writer (branch `coach-briefs`). Every brief here obeys the size rule
(machinery in English first, then locales and scenes) and names its worktree
`/home/dgx-delgado/yames-coach-<leg>`, branch `coach-<leg>`, logs `/tmp/coach-<leg>/`. **R** = the
orchestrator's independent reviewer reads the diff before merge.

## The legs

| Leg | Brief | Needs merged first | May run beside | Shares files with | R | Gates beyond tsc / vitest / build |
|---|---|---|---|---|---|---|
| t1b2b | `t1b2b-tables-and-wiring.md` (running) | t1b2a | c2b1a | c2b1a: `AskPanel.tsx` (t1b2b owns the send path) | diff read (AskPanel) | `ask`, `ask-tools`, `smooth`, `short-window`, its scene |
| c2b1a | `c2b1a-fact-card-machinery.md` (running) | t1a, t1b1 | t1b2b | as above | diff read (Ask store) | `ask`, `ask-tools`, `coach-session`, `smooth` |
| pol1 | `pol1-session-and-today.md` | – | everything outside the Session / Today | `useSessionRun.ts` (only if an item needs it), `coach.css`, `session` locales | if `useSessionRun.ts` changed | 9 specs named; `paths -- check` (item 10) |
| c2ca | `c2ca-search.md` | t1b2b | c2b1b, c4*, t2*, c3b1 | none (pure `src/coach/ask/search.ts`) | – | none (no layout) |
| c2b1b | `c2b1b-fact-cards-rest.md` | c2b1a, t1b2b | c2ca, c4a1, c4b1, t2a, t2b, rem 1 | `intents.ts`, `suggest.ts`, `ask` locales, the slot in `AskPanel.tsx` | diff read (seam) | `ask`, `ask-tools`, `coach-session`, `short-window`, `smooth`, scenes |
| c2b2a | `c2b2a-path-plan-theory-cards.md` | c2b1b | c4a2 (own namespace), c2ca, t2*, c4b* | `intents.ts`, `suggest.ts`, `match.ts`, `ask` locales | – | `ask`, `ask-tools` |
| c2b2b | `c2b2b-sources-locales-scenes.md` | c2b2a | c3b1, c4b*, t2a/b | `AskPanel.tsx` (source line), `ask` locales | diff read (AskPanel) | + `coach-session`, `short-window`, `smooth`, `neck`, scenes |
| c2cb (+ c2cc) | `c2cb-help-set.md` | c2ca, c2b2b | c3b1, c4b*, t2a/b | `AskPanel.tsx` (slot chain, placeholder), `help.json` (new) | diff read (AskPanel) | `ask`, `ask-tools`, `short-window`, `phone-header`, scenes |
| pol2 | `pol2-tools-and-ask.md` | t1b2b, c2b1a; run after c2cb | non-Ask legs only | every Ask file; `useToolListen.ts`; `useSession.ts` (a comment; item 5) | **R** if `useSession.ts` changes | 8 specs named |
| c4a1 | `c4a1-tendencies-and-stored-keys.md` | – | any leg | the settings code, the parity manifest | **R** (settings store) | parity suites |
| c4a2 | `c4a2-notebook-and-goal.md` | c4a1 | c2b2a (it edits no `AskPanel.tsx`) | `AskPanel.tsx` head, `ask.css`, `askStore.ts`, `CoachSettingsSection.tsx` | diff read | `ask`, `ask-tools`, `coach-model`, `phone-header`, `settings`, `short-window`, `smooth`, scenes |
| c4b1 | `c4b1-long-view-and-totals.md` | – | any leg | `ipc.ts`, `src/test/mocks.ts`, the parity manifest, `ProgressView.tsx` (the move) | **R** (`db.rs`, Rust) | `test:rust`, parity suites |
| c4b2 (+ c4b3) | `c4b2-weekly-plateaus-milestones.md` | c4a1, c4a2, c4b1 | t2a/b, c3b1, c2cb | `intents.ts` (one entry), `ProgressView.tsx`, `TodayView.tsx`, `PathsView.tsx`, `Rail.tsx` | **R** if `planner.ts` / `useSessionRun.ts` change | `progress`, `rail`, `phone-learning`, `today-line`, `coach-session`, `short-window`, `smooth`, scenes |
| t2a | `t2a-custom-exercise-generator.md` | – | any leg | `src-tauri/tests/path_exercises.rs` (test harness only) | – | `test:rust`; `paths -- check` unchanged |
| t2b | `t2b-recipe-store-and-list.md` | t2a | Ask legs (not c4b2: both edit `PathsView.tsx`) | `PathsView.tsx`, the parity manifest | **R** (store; saving Takes) | Paths specs, `phone-learning`, `short-window`, scenes |
| t2c / t2d | `t2c-make-exercise-tool.md` (one file, two legs) | t2b; t2d after t2c | non-Ask legs | every Ask file, `commands/*.json`, `commandTable.ts`; t2d `planner.ts` | t2d **R** if planner / runner change | t2c `ask`, `ask-tools`; t2d + Paths, `today-*`, scenes |
| rem | `rem-practice-reminder.md` | Part 1 nothing; Part 2 c4a2 | Part 1 any leg | Part 2: `CoachSettingsSection.tsx`, the parity manifest | Part 2 **R** (settings store) | Part 1 none (a report) |
| c3b1 | `c3b1-tool-test-set-and-harness.md` | t1b2b, c2b1b, c2b2a | any non-Ask leg; c2b2b, c2cb | `Cargo.toml` (a `[[bin]]`), `src/coach/ask/` (new files only) | – | `test:rust` |

**Shared by many**: `src/test/parity/` manifest (c4a1, c4b1, t2b, rem 2): the second to merge regenerates
it with `UPDATE_PARITY_MANIFEST=1` rather than hand-merging. The locale files: every leg with strings;
the card legs share `ask.json`, so c2cb (`help.json`) and c4a2 (its own namespace) are given their own.

## Suggested waves

1. Now: t1b2b ‖ c2b1a (running) ‖ pol1 ‖ c4a1 ‖ c4b1 ‖ t2a ‖ rem Part 1 ‖ a cue leg.
2. When t1b2b and c2b1a merge: c2b1b ‖ c2ca ‖ t2b (after t2a) ‖ c4a2 (after c4a1; before c2b1b touches
   the head, or after it: not beside it).
3. c2b2a ‖ c3b1 (after c2b2a merges, or as soon as it does) ‖ c4b2 (after c4a2, c4b1).
4. c2b2b → c2cb (+ c2cc) → **delivery 2** (Ask answers and acts with the selector on Off) → pol2 → t2c → t2d.
5. Then c3b2 (not briefed: measure Qwen3 4B / 8B with c3b1's harness), c3d if the numbers fall short,
   c3c, c5*, c6.

Not briefed and recorded here: **lb1**, `loop_bars`' bars door (`progress/t1a2.md`: `actions.startLoop()`
takes no bars; needs `useSessionRun.ts`, so **R**); c2cc and c4b3 exist only if their parents stop at
170k.

## Judgement calls (the design was silent or could be read two ways; overrule any)

1. c2ca: "the player's Paths" = Paths followed plus Paths with a passed Step; none yet → all sixteen.
2. c2ca: BM25 over `purpose`, `howTo`, `why`, `payoff`; a score floor set from fixtures; top five kept for c3b2.
3. c2cb: help answers are matched in English only (as cards are); every language reaches them by chip
   and `explain_screen`; the engine order is router → cards → help → search → model → plain statement.
4. c2cb: the forty entries = one per screen plus the app's written words; My exercises and the Notebook
   entries only if those legs merged first. Own namespace `help.json`.
5. c2cb / c4b2: a conditional split (c2cc / c4b3) at 170k tokens rather than a fixed split now.
6. c2b1b: "am I improving" needs three Takes and names its window; "what changed" on a first Take says
   there is nothing to compare.
7. c2b2a: the computed app terms are c2b2a's, the written ones c2cb's (the parent brief's line, kept).
8. c2b2b: in a Session every source opens in Ask, never navigates (DESIGN 3.6 does not say; 6.6 implies).
9. c4a1: only tendency kinds the stored `TakeFacts` support; the old tool coach's memory in
   `useSession.ts` is left alone. `coach.cards`' shape and the 6.6 rules are defined in c4a1 for c4b2.
10. c4a2: "after the first week" = seven days after the first Session; the goal is asked in the
    Notebook, and as Today's one card only once c4b2 exists. The Suggestions row goes in now; c6 regroups.
11. c4a2: "Leave out" is not deleting (a never-tool): it stores a suppression and every Take stays.
12. c4b1: the long view reads all Takes, computed as `cleanTempoOf` does; no migration; a needed
    schema change stops the leg. The week starts on the locale's first day.
13. c4b2: "Hear day 1 and day 7" only if both recordings exist (probably not today: no button then);
    plateau buttons are proposals; the planner's own parking is kept; the dot goes once seen.
14. t2a: shapes are the existing templates only; sweeps only if a player can name their arguments.
15. t2b: recipes in the settings store (`myExercises`), not SQLite (DESIGN 9.5 says no new table);
    custom Takes saved under a reserved Path id `mine`, kept out of standing, totals, plan and
    tendencies; not saved at all if that needs a schema change.
16. t2b: Remove on My exercises is the player's control with Undo; the coach never removes.
17. t2c: split into t2c (English) and t2d (locales, Today's part, scenes) in one file; the Today part
    is optional if it needs more than a planner input and one runner hook.
18. rem: stop after Part 1 on any new permission, dependency or background process; a prompt raised
    only by the player's own press is listed as an option for the owner, not decided. Key `coach.reminder`.
19. c3b1: one file per language; at least 20 per language and 60 in en / es / de (PLAN and DESIGN C3b
    both kept); the output object allows a card and `none`; the choice prompt is built in c3b1.
20. c3b1: the set is never generated from the app's templates or tables, and is held out from training
    (hashes recorded); "none" and "which" never count as wrong actions; non-`answered` outcomes are
    their own column.
21. pol2: runs at the end of the Ask chain (it touches every Ask file); `loop_bars` left to lb1.

## Not found in the design

The list of tendency kinds (only two examples, mock 10); the help set's entries (only "about 40");
where recipes are stored and where their Takes go; what "after the first week" counts from; the
reminder beyond DESIGN 12 q8's one line; how help answers are matched outside English.
