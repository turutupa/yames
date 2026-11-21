# Leg c6b: the docs say what the coach build built (UI_DECISIONS, COACH_UX, MOBILE plan, TESTING)

Worktree `/home/dgx-delgado/yames-coach-c6b`, branch `coach-c6b`. Logs under `/tmp/coach-c6b/`.
A small, docs-only leg: aim for under 150k tokens. No app file is edited.

PLAN's c6, the docs half. **Best run last in milestone 5** (after c6a, c5a1, c5a2, c3b2b): it describes
what is merged, never what is planned. If launched earlier, it documents what is merged at its start
and lists the rest under "Owed" in its progress file. It may run beside any leg (it shares no file with
code legs; not beside another docs leg in the same four files).

Read: `plans/coach/PROGRESS.md` (the index), the progress files of the legs it documents (grep before
reading: c1b1, c2a1, c2a2, t1a1, t1b1, t1b2b, chip1, c3a, c3b2a, c3b2b, c3c, c4a2, c5a1, c5a2, c6a,
rem2), BRIEF.md "Owner decisions", OWNER-UPDATES.md (newest last). The four files, in parts:
`plans/UI_DECISIONS.md` (U4.1 at line ~261, U4.3 at ~277, U4.4 at ~280, the ROADMAP cross-reference
at ~367), `plans/COACH_UX.md`, `plans/MOBILE_IMPLEMENTATION_PLAN.md`, `TESTING.md` (the repo root's,
not `plans/capture/TESTING.md`). Design, read-only: `DESIGN.md` 3, 7, 8, 12 (q4, q7), 13.

## Rules for what is written

- **Only what is built and merged**, with the file it lives in; a measured number only with where it
  was measured (the machine, the build, the date). Nothing planned is written as if it exists.
- The owner's words where they decided something, dated (OWNER-UPDATES, BRIEF.md).
- "The pass mark", never "the bar"; nothing about tuning. Edit surgically: no rewrite of a whole file;
  a superseded entry is marked superseded and kept, with what replaced it and when.

## What to write

1. **`UI_DECISIONS.md` U4.1: superseded** (owner decision 7 of DESIGN 12, recorded in BRIEF.md): the
   panel no longer takes the centre when the click stops. Write what replaced it: the line and the
   note in the page (`CoachLine.tsx`, `CoachNote.tsx`), Ask as a dock / drawer / phone sheet
   (`AskPanel.tsx`, `ask.css`'s breakpoints), the selector at Ask's foot. Fix the ROADMAP §12 Q5 line
   that says U4.1 answers it.
2. **U4.3: amended**, in DESIGN 13's words as the owner confirmed them: the coach never changes
   anything uninvited, and never starts, stores or spends without the player's press; the three kinds
   (at once with a receipt and Undo / one press / never), with the never-list; the owner's chip
   decision (one press of a chip is the press for a reversible one-step change, with Undo; anything
   multi-step or not undoable is a proposal); a call a model chose from free wording is always a
   proposal in this build. **U4.4**: say that `CoachCard` was deleted (c2a2) and the panel's inside
   was built by the coach build (the entry contradicts the code today).
3. **`COACH_UX.md`**: read it first; mark each section that the build superseded with a one-line
   pointer to what replaced it (DESIGN section and the code), and add one short section "The coach as
   built (2026-11)": where it lives per screen, the answer chain (router → cards → help → search →
   model → plain statement), what works with no model, the model's languages as c3b2b measured them,
   prose (English, labelled), the Notebook, the reminder (in-app only), what is stored (`coach.*` keys).
4. **`MOBILE_IMPLEMENTATION_PLAN.md`**: the mobile cut ("the coach is gone, not greyed out") amended
   and recorded (DESIGN 8, the phone build's row; decision 4): the line, the note and the rule-made Ask
   ship on phones, the labelled Ask button in the header, the selector's rows "not on this device",
   Settings → Coach on a phone as c6a left it, no component named `CoachCard`; what
   `check:mobile-bundle` checks now.
5. **`TESTING.md`**: the gates the coach build added, each with its command and what it proves: the
   click-jitter probe's `--llm-load` and `--llm-cancel` modes (c3a), the tool eval harness
   (`scripts/coach-eval.mjs`, `coach-eval` bin, the held-out set and why it is never used for training),
   the layout specs the build added (`ask`, `ask-tools`, `coach-*`, `today-line`, `tool-coach`, the
   `smooth` cases), the parity manifest's coach keys, `YAMES_SHOT_DIR` for pictures (never a fixed
   `/tmp` path, OWNER-UPDATES 16:20). Not the DGX's job queue (that is this machine's, not the repo's).
6. **A check list in your progress file**: every claim you wrote, with the file or progress note it
   rests on; the orchestrator reads it instead of re-reading the docs.

## Not yours

`AGENTS.md`, `CLAUDE.md`, `plans/ROADMAP.md`, the design folder (read-only), any code or test.

## Gates

None beyond the build's: run nothing heavy (no app file changes). A `git diff --stat` in the report
showing only the four files and your progress file.

## Report

As the rules block's "The end of the leg": what changed in each file (a line each), what you marked
superseded, every contradiction between a doc and the code that you found and did not resolve.
