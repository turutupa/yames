# Leg fc1: First Chords' fourteen cues a variant cannot say

Worktree `/home/dgx-delgado/yames-coach-fc1`, branch `coach-fc1`. Logs under `/tmp/coach-fc1/`.
A small content leg: aim for under 120k tokens.

This is item 10 of `plans/tasks/coach/pol1-session-and-today.md`, which pol1 left:

`npm run paths -- check first-chords` prints fourteen `cue.refused` (a cue the variant rewriter
cannot say for one of the Exercise's other keys or positions, so that variant's Take shows no
order). They were written before leg vr1 made the checker list them.

- Reword those cues in `src/paths/specs/first-chords-cues.ts` so every variant can say them: name
  less (the rules: `plans/coach/CUES_GUIDE.md`; `plans/tasks/coach/cues-content.md`, "What the
  first four Paths taught"; `plans/coach/progress/vr1.md` for what the rewriter refuses and why; on
  a chord Path write "the B string", never "B" alone). A cue stays an order a teacher would give,
  48 characters or fewer in every language, no diagnosis, nothing the app did not measure.
- Regenerate, and translate only the changed sentences into the fourteen other languages (the
  scripts in `plans/coach/tools/cues/`; `plans/tasks/coach/cues-prompt.md` shows how the cue legs
  ran them; sonnet helpers). Have one separate sonnet reader proof-read the new English cues
  against the tab before translating.
- Done when `npm run paths -- check` ends with 0 errors on every pack and 0 `cue.refused` for
  First Chords. While you are there, list (do not fix) the count of `cue.refused` on the other
  fifteen Paths in your report.

## Gates

`npm run paths -- check`, tsc, vitest, build (queue jobs). No layout (no screen's shape changes;
the longest cue stays within 48 characters).
