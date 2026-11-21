# pol2 handoff: what pol3 takes

Branch `coach-pol2`, worktree `/home/dgx-delgado/yames-coach-pol2`. Status per item and the commits:
`plans/coach/progress/pol2.md` (it also holds the full extras list, copied from
`/tmp/coach-orch/s6/pol2-extras.md`). pol2 stopped at its size limit (about 200k tokens) by plan.

## Not reached, by number

Brief (`plans/tasks/coach/pol2-tools-and-ask.md`):
- **6**: at 1024x700 the tool's line cuts the beat row mid-circle (c2a2). Needs a picture
  (`tests/layout/tool-coach.spec.ts` scenes), a CSS fix, a scene.
- **7**: the header at 620 px with the rail open cuts "Save preset" to "Sa". First check whether it is
  older than c2a2 (`/home/dgx-delgado/yames-coach-base`), then fix and say which.
- **12**: mock 16's "the page marks the row the proposal points at" (Step / Exercise on the page
  showing; theme tokens; no animation during a Take; gone when the proposal is retired); a scene.
- **15, second half**: "play some music" reaches `play_exercise` ("not found"). Make it a near-miss
  (`none`). It needs a word list in the command tables (a generic "music / something" noun list read
  by `parseVerb("start")` in `src/coach/ask/router.ts`), and the tables are leg c5a1b's: do it after
  c5a1b merges, English plus one locale, with a test in `router.test.ts` NEAR_MISSES_NONE.

Extras (`pol2.md`, the list at its foot):
- **A3**: done by t2g (`coach-t2g` db87ad57); check `coach` has it, then tick it.
- **A4**: (a) the plateau's "Rest it till Monday 4:49 AM": the time is deliberate (c4b4 review L11:
  the rest ends at last Take + 48 h). Day-only needs the owner's call or rounding `parkedUntil` up to
  the start of a day (planner side, t2e's file). (b) On Paths at 1160 the suggestion card stops 34 px
  short of the grid's right edge (`.coach-note` 820 px vs the grid ~850; Progress overrides to 980):
  not looked at.
- **A6** (de "1 takt", ordinal fret refusal, L5 cases: `/tmp/coach-orch/t2dc-review.md`), **A7**
  (read "(Bbb sounds the same as A)"), **A8** (leave unless reachable), **A9** (`useHeard.ts` per-run
  holder; L3 note under a live Undo: `/tmp/coach-orch/c5a1c-review.md`; diff for review), **A10**
  (rem2c L3 debounce, L5), **A11** (the LOW list from HANDOFF-S5), **C13** (the flaky tests).

## Notes for pol3

- A2's fourteen locales: three sonnet proof-readers; flagged for a native read in pol2.md.
- AskPanel now takes `place` (MainWindow passes `placeKey(pathsPlace.at)` on Paths).
- `CoachBlocks` draws one source line under consecutive text blocks with the same source.
