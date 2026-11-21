# Leg nf1: a Take marked "not fair" is left out of the clean tempo and of milestones

Worktree `/home/dgx-delgado/yames-coach-nf1`, branch `coach-nf1`. Logs under `/tmp/coach-nf1/`.

**The owner's decision** (`~/yames-coach-design-out/OWNER-UPDATES.md`, "owner decisions on the 1k
questions", item 3): *Takes marked "not fair": exclude them from BOTH the clean tempo shown in
Progress and from milestones.* Until now such a Take still counted (`plans/coach/progress/c4b1.md`,
"Decision to confirm"; `progress/c1b2a.md` has a fixture for one in Today's line).

## What to build

1. **Find the ground first and write it into your progress file**: how a Take is marked not fair
   (the field, where it is stored, who sets it), and every place that reads a clean tempo: Progress
   (`cleanTempoOf` and what calls it), the long-view query `list_clean_tempo_spans` in
   `src-tauri/src/db.rs` with `listCleanTempoSpans` in `src/ipc.ts`, `src/session/totals.ts`,
   Today's line (`src/coach/todayLine.ts`), the planner / standing, the Step's pass, the tools'
   `read` answers, the fact cards on `coach` if any quote a clean tempo.
2. **One rule, in TypeScript and in Rust**: a Take marked not fair never counts towards a clean
   tempo **the app shows or quotes**: the clean tempo and ceiling Progress shows, the first and best
   clean tempo of `list_clean_tempo_spans` (milestones will be built on that query in leg c4b2, so
   the query is where "milestones" is decided), Today's line when it quotes a clean tempo, and any
   other sentence that quotes one. A number shown in two places must be the same number.
   An Exercise whose only clean Takes are marked not fair has no clean tempo (not zero).
3. **What you do not change**: whether a Take passes a Step, the planner's choice of the next
   tempo, the standing, what is stored. If one of those reads the same helper you change, keep its
   behaviour as it is (split the helper) and list it under "open points" with what a not-fair Take
   does there today, so the owner can decide. No schema change and no migration: if the mark cannot
   be read where the query runs without one, stop and report.
4. **Tests**: a table test in TypeScript (the fastest clean Take is marked not fair → the shown
   clean tempo is the next one; only not-fair clean Takes → none; unmarking brings it back); the same
   three cases in Rust for the query (keep its plan assertion and its timing test honest); Today's
   line's fixture updated to the decision.
5. No new string is expected. If you find the app saying something that is now false (a hint that
   says every Take counts), fix the sentence in all fifteen locales (sonnet helpers).

## Gates

tsc, vitest, build, `npm run test:rust` (queue jobs); layout by name: `progress`, `today-line`,
plus the spec of any other screen whose number changed.

## Report

`db.rs` is the SQLite store: an independent reviewer reads it before merge. Your "diff for review"
paragraph names every hunk in `db.rs`, `ipc.ts` and any store code.
