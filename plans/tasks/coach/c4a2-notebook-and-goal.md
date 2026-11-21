# Leg c4a2: the Notebook as Ask's second tab, the goal question; locales; scenes

Worktree `/home/dgx-delgado/yames-coach-c4a2`, branch `coach-c4a2`. Logs under `/tmp/coach-c4a2/`.

PLAN's leg c4a, second half. **Needs c4a1 merged.** It edits Ask's head (`AskPanel.tsx`, `ask.css`,
`askStore.ts`): run it when no card, search or polish leg is working there (see `NEXT-LEGS.md`).

Read first: `plans/coach/progress/c4a1.md` (`tendencies`, `notebookFrom`, the four keys, the strings
"to translate (c4a2)"), `c2a1.md` and `c2a2.md` (Ask's head: c2a1 had "Ask | Tools coach" tabs where
the mock has "Ask | Notebook"; c2a2 removed them; the selector at the panel's foot, the sheet's head on
a phone). Design, read-only: `DESIGN.md` 6.6, 6.7, 3.2 (the three shapes), 5.4 (guardrail 7: the
footer); mock `10` (all four themes are the same layout; Read the Manuscript one) and `17` (the phone
sheet's "Ask | Notebook" switch).

## What to build

1. **The Notebook tab**: "Ask | Notebook" in Ask's head, in all three shapes (dock, drawer, phone
   sheet), as mock 10 and 17 draw it. Two lists and the empty-state sentence (mock 10's: "I need five
   Takes on an Exercise before I say anything here. Leave a line out and I stop using it for 30
   days."). The footer: "Everything here comes from your stored Takes, or is something you typed."
   Built on demand from `notebookFrom` when the tab opens; never per beat; **nothing in a Take** (Ask is
   not mounted then: keep it so). In a Session the tab exists but shows nothing new about the current
   Take (DESIGN 6.6: nothing proactive in a Session).
2. **What I've noticed**: each line with its evidence line ("From 7 Takes · 11 to 19 Nov", dates in
   the locale's format) and a leave-out control (mock 10's bin; label "Leave out", 44 px on a phone).
   Leaving out writes `coach.suppressed` with an Undo for a few seconds (the toast names Settings →
   Coach, DESIGN 6.6). Not a delete of anything stored: the Takes stay.
3. **What you're working toward**: the goal with "You said · date" and Edit (through `set_goal`, the
   one-press tool, so the receipt and undo are the runner's). **Asked once after the first week**
   ("What are you working toward?": a song, a tempo, a style, just playing, or the player's own words),
   as an offer with "Not now", counted in `coach.cards` so it obeys 6.6 (not again for seven days;
   after two dismissals not until asked). Where it is asked: in the Notebook tab and as Today's one
   proactive card if c4b2 has merged; until then the Notebook only. Never in a Session, the wizard or
   Settings.
4. **Settings → Coach: "Suggestions: On / Only when I ask"** (DESIGN 6.6, `coach.suggestions`), one row
   in `CoachSettingsSection.tsx`. c6 regroups that section later: add the row where the section's
   other choices are, nothing more.
5. **Fourteen locales** for c4a1's English keys and this leg's, by sonnet helpers with
   `plans/COACH_I18N_BRIEF.md`. Every noticed-line template keeps its placeholders and names its window.
6. **Layout scenes**: the Notebook with two lines and a goal (1440 with the dock, mock 10), empty, on a
   phone sheet, Ember and Manuscript, one in German or Russian; a leave-out with its Undo. Pictures only
   when `YAMES_SHOT_DIR` is set.

## Not yours

The tendencies' logic and the keys (c4a1: a defect is fixed with a test and named). The weekly
look-back, the Progress dot, milestones (c4b2). Settings → Coach's regrouping (c6). Ask's own thread.

## Gates

tsc, vitest, build; layout by name: `ask.spec.ts`, `ask-tools.spec.ts`, `coach-model.spec.ts` (the
selector at the foot), `phone-header.spec.ts`, `settings.spec.ts`, `short-window.spec.ts`,
`smooth.spec.ts`, your scenes. The full layout suite is the orchestrator's.

## Report

As the rules block's "The end of the leg": the tab in each shape, when the goal is asked and how often
it can return, the locales that want a native read, the screenshot paths, and a "diff for review"
paragraph for `AskPanel.tsx`, `askStore.ts` and the settings section.
