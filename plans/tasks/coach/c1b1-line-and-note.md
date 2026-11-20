# Leg c1b1: the coach line and the coach note in a Session

Worktree `/home/dgx-delgado/yames-coach-c1b1`, branch `coach-c1b1`. Logs under `/tmp/coach-c1b1/`.
Read `plans/tasks/coach/BRIEF.md` first, then `plans/coach/progress/c0.md` (the bus and the context) and
`plans/coach/progress/c1a.md` (the `TakeNote` data and the keys it proposes), then
`plans/COACH_I18N_BRIEF.md`. Design: DESIGN.md sections 2, 3.4, 3.5, 3.6, 4.1, 4.2, 4.4, the "Voice" row
of section 8 is NOT this leg. Mocks (look at the Ember PNG of each, and one Manuscript for the light
theme): `03-step-ready-graded`, `04-step-ready-ungraded`, `05-take`, `06-result-below`, `07-result-pass`,
`13-phone-take`, `14-phone-result` in `/home/dgx-delgado/yames-coach-design-out/mocks/shots/`.

This is the owner's first sentence: "the coach should be providing feedback as you go". After this leg a
player on a Path Step sees one thing to do before each Take, one fixed order during it, and one finding
with its evidence after it.

## What to build

1. **`src/containers/coach/CoachLine.tsx`, `CoachNote.tsx`, `src/styles/coach.css`.** The rules of DESIGN
   3.6 are the acceptance test: the coach's colour (`--accent-2`) on its glyph and the 3 px left rule of a
   note and nowhere else, the rule never red or green; question chips are a neutral 1 px outline with a
   leading "?"; play chips the same outline with a triangle; text wraps, chips take two balanced lines,
   12 px is the floor, nothing `nowrap` except a number with its unit; shadows and scrims through the
   light-theme tokens; **theme tokens only, no hex, no rgba literal**. The existing learning-side
   `CoachLine` (`session.coach.*`) is the voice to keep: fold it in, do not leave two components with one
   name.
2. **Ready, first Take**: the planner's reason and the Exercise's cue (`reasonLine(step.why)`,
   `exercise.coachLine`), and the honest line once per Exercise per Session (`readyHonestLineKey`). All of
   that exists: this is placement and the slot's rules.
3. **Ready, later Takes** (mock 03): the note. One thing to do as the headline (19 px): until the pack
   field `cues` exists (a later leg), that is the Exercise's `coachLine`, with its source line "From the
   Path · Step N"; then the last Take in one quiet line built from `takeNote()`. Under 760 px of height
   the note is the cue and its chips only, so Start stays on screen.
4. **During a Take** (mocks 05, 13): one order, chosen before the count-in and fixed until the Take ends:
   the cue in its short form (at most 48 characters; if the text is longer, show nothing rather than
   truncate mid-sentence, and say how many Exercises that hits), 24 px on a computer and 20 px on a
   phone, in ink, with a faint glyph, no coach colour. A memoised component rendered once at
   `takeStarted`; it reads no beat and no count. **A new case in `tests/layout/smooth.spec.ts` fails if
   the line or the note commits during a running Take.**
5. **Result** (mocks 06, 07, 14): the note from `takeNote()`: the finding sentence; the bar strip inside
   the note, rounds of the tune set apart, a slipped bar carrying a cross as well as its colour (the
   existing `barStrip` is the data; if the result screen already draws a strip, it moves into the note,
   it is not drawn twice); one fact line with a check, a cross or a dash and the base in words ("98% right
   notes (of 60 I could pitch)"); a dash is never red and never counts. `aria-live="polite"`. A pass is
   not oversold (REVIEW row 1). `notCaught`: "I didn't catch enough. Play it again." and the scorer's
   reason, nothing about the playing. The state lamp on the result line goes (DESIGN section 2): the
   number carries the grade.
6. **Ungraded** (mock 04; DESIGN 4.4): before the Take one thing to listen for, as a question, from
   `exercise.selfCheck` where the author wrote one, else from its cue or `coachLine`; no generic quiz.
   After: "Did they?" Yes / Not yet, nothing pre-selected, kept with the Take (`heardIt`, the action c1a
   added). "I'm not listening" once per Session. Never a suggestion to turn grading on, never a word
   about the microphone.
7. **Recap**: one line: what moved, what comes back when (`outcomes`, `cleanTempoOf`, `dueReviews`,
   `parkedUntil`).
8. **The sentences.** English in `src/locales/en/session.json` (or a new `coach` namespace if the file is
   crowded: say which), written to DESIGN section 2's table from the keys c1a proposed; the fourteen
   other locales through sonnet helpers with `plans/COACH_I18N_BRIEF.md`. A new test runs the English
   honesty lint (`BANNED_CLAIMS`, `src/paths/honesty.ts`) over every new coach key, and fails on
   "the bar" used for the threshold and on any "tuning" sentence (owner decision 9).

## What is not in this leg, and what to do about it

- **Ask does not exist yet** (leg c2a1, running beside you). A "?" chip or a tap on the line that would
  open Ask is rendered only when the component is given an `onAsk` handler; give none here. The one "?"
  chip that works today is "What should I try?", which opens the Exercise's existing How. No dead
  controls, no "coming soon".
- **"Hear bar N: yours, then the demo"** (leg c5b) and **"Loop the first bar"**, P1, P2 (leg c1c): not
  drawn. "Hear it first" on the ready note uses the listen demo that exists.
- **Today's line, speech, hotkeys** are c1b2.
- The buttons stay as `bigAction` decides today. No sentence in the note argues with the button.

## Hunks you own in shared files

`SessionView.tsx`, `RunwayTake.tsx`, `parts.tsx` and the session stylesheets are yours.
`useSessionRun.ts`: read-only for you except what the note needs to subscribe to (prefer the bus). Leg
c2a1 mounts the Ask drawer in the Session and moves the session bar in by the panel's width: leave the
session bar's structure as it is and say in your report where the note and the action row sit in the
DOM, so the two merge.

## Gates

tsc, vitest, build; `npm run test:layout` in full (this leg changes the shape of the Session at every
width: four widths, the de and ru scenes, one light theme, the phone specs); new layout scenes for the
ready note, the Take's order, the result note (below and pass), the ungraded pair, at 1440, 1024 × 700
and a phone; the new `smooth.spec.ts` case; `session-contrast.spec.ts`; the honesty test; the parity
`localeKeys` suite. Screenshots of the new scenes in Ember, Neon and Manuscript saved under
`/tmp/coach-c1b1/shots/` and listed in your report: the orchestrator looks at them against the mocks.

## Report

As BRIEF "The end of a leg", with the screenshot paths and the list of Exercises whose cue is too long
for the Take's order.
