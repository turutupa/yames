# Leg c6a: Settings → Coach regrouped, the wizard's coach step, the phone's Settings → Coach

Worktree `/home/dgx-delgado/yames-coach-c6a`, branch `coach-c6a`. Logs under `/tmp/coach-c6a/`.

PLAN's c6, the code half (c6b writes the docs). **Needs merged: c4a2** (Suggestions), **rem2** (the
reminder row), **c3b2a** (what the Answers group says about the model's languages), and every other
leg that adds a row to `CoachSettingsSection.tsx` (check `git log coach -- <file>` and the open legs in
`NEXT-LEGS*.md`): this leg moves every row, so it runs **alone in that file and in
`onboarding/steps/CoachStep.tsx`**. It may run beside c5a1, c5a2, c3b2b, c3d, c6b.

Read: `plans/coach/progress/ms1.md`, `ms2.md` (the tier rows, download / remove / older copy, "not on
this device" on a phone), `c2a2.md` (what Settings → Coach lost and kept: the Beta badge, COA-121),
`c4a1.md`, `c4a2.md`, `rem2.md`. Code: `src/containers/settings/CoachSettingsSection.tsx` (935 lines:
read it in parts), `coachStatus.ts` (the honest status line), `SettingsView.tsx`,
`src/containers/onboarding/steps/CoachStep.tsx` and its test. Design, read-only: `DESIGN.md` 6.6, 8
(the Settings → Coach and Wizard rows), 12 q4 (phones rule-made); BRIEF.md "Owner decisions" (the
selector: on a phone, the Ask sheet's head **and Settings → Coach**). `NEXT-LEGS-s4b.md` judgement
calls 26 to 30.

## The owner's rules where they bite here

- **Nothing proactive in Settings or the wizard** (DESIGN 6.6): no card, no suggestion, no hint
  that pushes a setting.
- **The wizard never pushes the microphone or grading.** The grading question stays its own step.
- **Downloads start only with the player's press**; delete and manage live in Settings → Coach.
- Phones are rule-made only: no model row offers a download or a load there.
- Theme tokens only; every control 44 px on a phone; "the pass mark", never "the bar".

## What to build

1. **Settings → Coach in five groups, in this order** (DESIGN 8), each a heading and its rows, every
   existing row kept with its behaviour and its test (move, never rewrite; one commit per group):
   **Answers** (the tiers with Download / Remove / older copy / Update brain, and the honest status from
   `coachStatus.ts`; one line naming the languages in which this device's model answers free wording,
   from c3b2a's switch: "In its own words in: English, Spanish" or "Answers from your Takes and Paths"),
   **Voice** (voice on / off, the voice's name, the voices download, the jam's spoken cues),
   **Suggestions** (`coach.suggestions`, the practice reminder), **Notebook** (item 2), **In the tools**
   (Scoring mode, Coaching style, Verbosity, "Hear what I play"; the "tools only" tag stays on the
   first three). The Beta badge stays on the section's head.
2. **The Notebook group** (judgement call 27): the lines the player left out (`coach.suppressed`),
   each with its date and "Bring back" (the player's press, an Undo for a few seconds), and the sentence
   that a left-out line comes back by itself after thirty days (DESIGN 6.7); the goal with Edit
   (`coach.goal`, as the Notebook edits it). Empty: "Nothing left out." Nothing here is deleted.
3. **On a phone** (judgement call 28): Answers (the selector's rows saying "not on this device", as
   ms1 left them; no download), Suggestions and Notebook. Voice and In the tools are not shown there
   (DESIGN 8). Tests per group visible per shape.
4. **The wizard's coach step** asks one thing (DESIGN 8): "Should the coach also answer in its own
   words?" with Off and the tiers (size, memory, what each needs, as now), and one sentence of what works
   without a model ("Off still gives you the line, the note, the tools and answers from your Takes and
   Paths."). The press on a tier is the player's press (download and load as ms1 left them). **The
   "Try the listening feature anyway" box leaves this step** (judgement call 29: it asks for an input
   and eight beats, a microphone push in the coach's step): if it has no other home, it is dropped and
   named, not moved somewhere new. `onboarding.coach.what1` ("listens through your audio input and
   scores…") is rewritten to say what the coach does now. On a phone the step says the coach answers from
   Takes and Paths and asks nothing (judgement call 30).
5. **Strings**: new and changed keys in fifteen locales by sonnet helpers with `plans/COACH_I18N_BRIEF.md`;
   keys nobody reads any more go to `DELIBERATELY_REMOVED`.
6. **Layout scenes** (pictures only when `YAMES_SHOT_DIR` is set): Settings → Coach at 1440 and 1024
   in two themes, on a phone, in German; the wizard's coach step at 1024 and on a phone.

## Not yours

The docs (c6b). The selector at the foot of Ask (ms1). What any row does (only where it sits). The
grading step. Rows a later leg adds go into these groups by that leg.

## Gates

tsc, vitest (the parity suites, `i18n.locales.test.ts`, `CoachSettingsSection.*.test.tsx`,
`CoachStep.test.tsx`), build; layout by name: `settings.spec.ts`, `firstrun.spec.ts`, `tour.spec.ts`,
`coach-model.spec.ts`, `phone-tabs.spec.ts`, `phone-header.spec.ts`, `short-window.spec.ts`,
`theme-faces.spec.ts`, your scenes.

## Report

As the rules block's "The end of the leg": the groups and their rows (a table), what moved off the
phone, the wizard's question and what left it, the locales that want a native read, and a "diff for
review" paragraph for `CoachSettingsSection.tsx`, `CoachStep.tsx` and any settings store code.
