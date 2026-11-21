# Leg pol1: polish, the Session and Today

Worktree `/home/dgx-delgado/yames-coach-pol1`, branch `coach-pol1`. Logs under `/tmp/coach-pol1/`.

The small things earlier legs left "for a polish leg" in `plans/coach/PROGRESS.md`, for the Session
and Today only (the tools and Ask are leg pol2, later: do not touch `src/containers/coach/Ask*`,
`askTools.ts`, `ask.css` or `src/coach/ask/`; two legs are working there now). Each item is small;
do them in this order, one commit each, and stop when your context passes 220k tokens: say which
are left.

Read: `plans/tasks/coach/BRIEF.md` ("Owner decisions"); for each item the progress file named, only
the part about it; `plans/COACH_I18N_BRIEF.md` before changing any sentence. Design, read-only:
`/home/dgx-delgado/yames-coach-design-out/DESIGN.md` 4.2, 4.4, 6.1 and the mocks named below.

## The items

1. **A test must never write to a fixed `/tmp` path** (the owner, 2026-11-20 16:20):
   `tests/layout/today-line.spec.ts` line 11 still defaults to `/tmp/coach-c1b2a/shots`. Pictures
   only when `YAMES_SHOT_DIR` is set (no default; `coach-model.spec.ts` shows the shape: the
   screenshot call is skipped when the variable is unset). Grep every spec once more for a literal
   `/tmp` that is not in a comment.
2. **Today's back-from-a-break sentence** (`progress/c1b2a.md`; DESIGN 6.1): "Last Session, X: 79%
   even at 90 BPM. Today starts a rung lower than it would have." does not name the days away, and
   "than it would have" is unclear. Say the days as a plain fact and the tempo today starts at
   (measured facts only; no "welcome back", no praise). All fifteen locales (sonnet helpers).
3. **One English sentence of Today's line was reworded after translation** ("ending with X"): the
   fourteen other languages keep the older wording (`progress/c1b2a.md`). Bring them in line.
4. **The Step page's line has no layout scene** (`progress/c1b2a.md`): add one to
   `today-line.spec.ts` (1440 and a phone).
5. **Under P1 ("once more here") the row shows both "Up to N" and "Faster"** (`progress/c1c.md`):
   read DESIGN 4.2 on what the row offers after a shaky pass and remove the one that contradicts
   holding the tempo; a unit test for the row's contents in that state.
6. **"10 bars in a row held" above a strip with two crossed bars** (`progress/c1c.md`): find how
   the label is computed against the strip's data; if the fixture is wrong fix the fixture, if the
   label can disagree with the strip on real data fix the label, with a test that the two agree.
7. **The last block's P2 button reads "See how it went"** (`progress/c1c.md`): it should say what
   pressing it does at the end of a Session (read what the recap screen is called in the locales);
   fifteen locales.
8. **The passed chip** (`progress/pm.md`): if any state still reads "Passed · Pass mark 85%" (says
   pass twice), reword it as fix1 did for the other state ("Needs 85%"); otherwise say it is gone.
9. **The neck version of the "Go again" order scene is missing from `smooth.spec.ts`**
   (`progress/c4c.md`): add it beside the runway's.
10. **First Chords: fourteen cues a variant cannot say** (`npm run paths -- check first-chords`
    prints them as `cue.refused` since leg vr1; they were written before the checker listed them):
    reword those cues in `src/paths/specs/first-chords-cues.ts` to name less (the rules are in
    `plans/coach/CUES_GUIDE.md` and `plans/tasks/coach/cues-content.md`, "What the first four
    Paths taught"), regenerate, and translate the changed sentences (the scripts in
    `plans/coach/tools/cues/`). `check` must end with 0 cues a variant cannot say for First Chords.
    This one is content: do it last, and only if you are under 150k tokens; otherwise leave it.

## Not yours

Anything in Ask or the tools (pol2). The voice's known limit under the first click (Rust, the audio
reviewer). `useSession.ts`. New features.

## Gates

tsc, vitest, build; `npm run paths -- check` if item 10 was done; layout by name: `today-line`,
`coach-session`, `coach-loop`, `smooth`, `short-window`, `neck`, `planner`, `today-anchor`,
`today-focus`. The full layout suite is the orchestrator's (it runs after you merge: you changed
text on screens, so say so).

## Report

As the rules block's "The end of the leg": per item done / not needed / left, with the before and
after sentence where one changed; the diff for review if `useSessionRun.ts` changed at all.
