# Leg c2b2b: the source line opens what it cites; fourteen locales; the scenes

Worktree `/home/dgx-delgado/yames-coach-c2b2b`, branch `coach-c2b2b`. Logs under `/tmp/coach-c2b2b/`.

The second half of `c2b2-fact-cards-path-plan-theory.md` (read it: items 5 and 7 and its gates are
yours). **Needs c2b2a merged.** Read first `plans/coach/progress/c2b2a.md` (the shapes added, the keys
"to translate (c2b2b)"), then `c2b1a.md` / `c2b1b.md` (how a card turn and its source line are drawn),
`t1a1.md` (`open_step`, its receipt and `return_to`). Design, read-only: `DESIGN.md` 3.6 (the Source
row), 3.3 (the drawer in a Session), 5.4; mocks `08`, `15`.

## What to build

1. **Tapping a source line opens what it cites** (parent item 5; owed since c1b1):
   - "Measured · Take 2" opens that Take's review;
   - "From the Path · Step 2" opens the Step through `open_step` (its receipt and its way back);
   - "Worked out by the app" and "General advice" open a one-line explanation of what the label means
     (a turn in Ask; no navigation);
   - **in a Session nothing navigates away from the Session**: the source opens in Ask (the Take's
     review as a card, the Step's text quoted);
   - on a phone only where the line is a 44 px target; otherwise it is not a target (a test on the
     rendered element, as c2a1 did for the bar cells);
   - nothing here is reachable during a Take (Ask is not mounted then: keep it so).
   A unit test per label (what the press calls), and one that a press in a Session calls no `go` tool.
2. **Fourteen locales** for every key c2b2a left in English and every key this leg adds, by sonnet
   helpers with `plans/COACH_I18N_BRIEF.md`. Theory terms (scale and chord names, "position") use the
   words each locale's Jam and Paths screens already use: give the helpers those files.
3. **Layout scenes** (parent item 7): a Path passage quoted; a plan card ending in a proposal; a
   fretboard answer; a source line pressed in a Session (the answer opens in Ask, the Session stays).
   At 1440 and a phone, Ember and Manuscript, one in German or Russian. Pictures only when
   `YAMES_SHOT_DIR` is set.

## Not yours

The shapes and their logic (c2b2a: a defect you find is fixed with a test and named). Search and the
help set (c2ca / c2cb). Jam's and Songs' cards (c5a). A model (c3b).

## Parallel note

c2cb also edits `AskPanel.tsx` (the help answers' turn) and the `ask` locale files. Run c2cb after you
merge, or give it its own namespace file (`help.json`) and keep your hunks in `AskPanel.tsx` to the
source line's press handler.

## Gates

tsc, vitest, build; layout by name: `ask.spec.ts`, `ask-tools.spec.ts`, `coach-session.spec.ts`,
`short-window.spec.ts`, `smooth.spec.ts`, `neck.spec.ts` if the Session's ready screen gained height
(its 620×780 margin is thin), your new scenes. The full layout suite is the orchestrator's.

## Report

As the rules block's "The end of the leg": what each source label opens, on a computer and a phone, in
and out of a Session; the locales that want a native read; the screenshot paths; a "diff for review"
paragraph naming every hunk in `AskPanel.tsx`, `askStore.ts` and the Session's files.
