# Leg t1b1: the tools in the Ask panel: receipts, proposals, undo, "that one is yours", chips

Worktree `/home/dgx-delgado/yames-coach-t1b1`, branch `coach-t1b1`. Logs under `/tmp/coach-t1b1/`.

PLAN's leg t1b is split in two so each half stays under 250k tokens: this one draws what a tool does
in the Ask panel and makes every tool reachable by a chip; t1b2 adds typed commands.

Read: `plans/tasks/coach/BRIEF.md` ("Owner decisions": the sorting of tools is binding);
`plans/coach/progress/t1a1.md` and `t1a2.md` (the machinery: how a caller builds the context, runs a
tool, shows a proposal, confirms, undoes; the receipt and proposal keys they propose);
`plans/coach/progress/c2a1.md` (the Ask panel: `AskPanel`, `askStore`, `useCoachPanel`, the dock, the
drawer, the sheet) and `c2a2.md` (Ask is only Ask now). Design, read-only:
`/home/dgx-delgado/yames-coach-design-out/DESIGN.md` section 13 ("In the Ask panel") and 3.6 (the
components' rules), `TOOLS.md` 2.1, 2.3 and 2.5, mock `16` (`mocks/shots/16-*.png`; look at it with the
Read tool: the mocks fix the look) and mock `08` for the panel around it.

## What to build

1. **A receipt** in Ask's thread, written by the app from what happened: one line, a translated
   template filled with real names ("Opened Alternate Picking · Step 7: Crossing two strings"), its
   source as the app's own words (not "Measured", not "General advice": the app did something), and
   the way back as a small tonal button ("Back to Today") that runs the tool's undo once. After the
   undo the receipt says it was undone. No sentence is assembled in code: keys and arguments.
2. **A proposal**: what will happen, in the tool's own data (the plan as it would be, the rung, the
   Exercise by title, what will stop sounding, "this cannot be undone here" where the tool says so),
   one **tonal** button with a verb, and "Not now". Nothing happens until the press. A proposal that
   is no longer valid when pressed (the context moved on) says so and does nothing. An answer never
   contains the page's solid button (DESIGN 3.6).
3. **"Which one?"**: the choices a tool returns, as chips; a press runs that call.
4. **"That one is yours"**: for anything on the never-list (the microphone and input, audio devices,
   grading, recording, deleting, unfollowing, downloads and the model selector, grades), one line that
   says the coach does not do that, and a chip that shows where the control is (opens the screen or the
   Settings section through `go_to` / `open_settings`, and points at it if the app has a way to: the
   tour's spotlight, a focus ring). It never performs the action. A table test: each never-list item
   has its line and its "show me" target, and no tool call.
5. **Every tool by a chip.** Ask's empty state and the row above the text box offer chips for the
   tools that make sense where the player is (`when(ctx)` decides; at most a handful, chosen by a small
   pure function with a table test per screen): "Start today's Session", "Open the next Step", "Slower",
   "Loop the first bar", "Show me in Settings"… A chip press is a tool call through the runner, like
   any other. During a Take there are none (Ask is not available then).
6. **Undo for a few seconds** after a confirmed change that can be undone (TOOLS 2.3), in the receipt.
7. **Strings in fifteen locales** with `plans/COACH_I18N_BRIEF.md` (sonnet helpers): the receipt,
   proposal, choice and "yours" keys t1a1 and t1a2 proposed (rename where the UI shows a better shape,
   and say so). The English honesty lint covers them.
8. **On a phone** the same, in the sheet: every target at least 44 px.

## Rules that decide the look

Theme tokens only; tonal buttons; no meaning by colour alone; text wraps, chips take two balanced
lines; the coach's colour only on its glyph and the 3 px rule; a receipt is quiet (it is a record, not
a celebration). Nothing here runs or renders during a Take.

## Not yours

Typed commands and `ask/router.ts` (t1b2). The fact cards (`read` tools' answers beyond what t1a
built: c2b). A model. New tools. The registry's shape.

## Shared files

`AskPanel.tsx`, `askStore.ts`, `ask.css`, the locale files (your keys in one block per file). Another
leg may be adding keys to the locale files at the same time.

## Gates

tsc, vitest, build; `npm run check:mobile-bundle` if the phone build's cut is touched; layout by name:
`ask.spec.ts`, `coach-model.spec.ts`, `smooth.spec.ts`, `short-window.spec.ts`, `phone-learning.spec.ts`,
and new scenes: a receipt with its way back, a receipt undone, a proposal, "Which one?", "that one is
yours", the chips in the empty state; at 1440, 1024 and a phone; in Ember, Neon and Manuscript; one
scene in German or Russian (long words wrap). Screenshots under `/tmp/coach-t1b1/shots/`. The full
layout suite is the orchestrator's on a weekday before 8 PM Pacific (run it yourself after 8 PM or at
a weekend).

## Report

As the rules block's "The end of the leg", with the screenshot paths, the table of chips per screen,
and the never-list table (item, the line, where "show me" goes).
