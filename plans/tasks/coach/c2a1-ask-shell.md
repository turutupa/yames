# Leg c2a1: Ask's shell (dock, drawer, sheet)

Worktree `/home/dgx-delgado/yames-coach-c2a1`, branch `coach-c2a1`. Logs under `/tmp/coach-c2a1/`.
Read `plans/tasks/coach/BRIEF.md` first, then `plans/coach/progress/c0.md` (bus, context) and
`plans/coach/progress/ms1.md` (the model selector and the loader: the panel never loads a model).
Design: DESIGN.md sections 3.2, 3.3, 3.6, 5.1, 5.5 (the footer and the states), 7 (what moves where), the
"phone build" row of section 8. Mocks (Ember PNGs, one Manuscript): `02-today-ask`,
`08-ask-conversation`, `11-ready-1024-ask`, `15-phone-ask`.

The old coach is a 380 px panel (`CoachCard`) with a Start button, a Feed and a History tab. This leg
builds the panel that replaces it and moves the conversation into it. The next leg (c2a2) removes Start,
End, Feed and History and deletes `CoachCard`; **after this leg the old panel must still work for the
tools exactly as today**, so nothing is lost between the two merges.

## What to build

1. **`src/containers/coach/AskPanel.tsx`** and **`useCoachPanel.ts`**: one panel, one width (380 px; 320
   under 720 px wide), three shapes by the stylesheets' own breakpoints (DESIGN 3.2):
   - **dock** at 1160 px and wider (pushes the content; Today keeps its one 560 px column from 981 to
     1359 px with the dock open), and over Today from 981 px;
   - **drawer** at 980 px and narrower, on other screens from 981 to 1159 px, and **in a Session at any
     desktop width**;
   - **sheet** on a phone: modal, 92% high, `role="dialog"` with a focus trap, closing on the scrim, a
     swipe down, Back (never leaving the Session) or its close button; with the keyboard up the context
     line and footer hide; in landscape it is the 360 px drawer.
   Dock and drawer are `role="complementary"`; the thread is a `role="log"`.
2. **The drawer in a Session** (DESIGN 3.3, mock 11): it covers the picture, never the controls. While
   it is open the session bar and the action row move in by the panel's width (wrapping if they must), so
   Exit, the clock, the input state and the solid button stay visible. The neck is covered, not resized:
   no canvas reflow, no backdrop blur over the canvas. It closes on anything that sounds or moves the
   picture (Start take, Hear it, Watch, Loop). While focus is in the panel the Session's keys are off:
   Enter sends, Esc closes and returns focus to what opened it, `?` types a question mark. An Exercise
   step's clock keeps running; a timed step (warm-up, jam, finisher) pauses when Ask opens. **Ask is not
   available while a Take runs**: no button in the bar; if the Ask key is pressed, one static label in
   the bar ("Ask opens after this Take") and the panel opens on the result. A `smooth.spec.ts` case: the
   panel commits nothing during a running Take.
3. **Entry points** (DESIGN 5.1): the rail's "Ask the coach" row; the Session bar's Ask pill on ready,
   result and recap; a labelled 44 px **Ask button in the phone header** (`MainHeader`); the
   `toggle-coach` action unchanged; `?` as a real hotkey action (moved out of the listener inside
   `CoachCard`); `onAsk` handlers for the coach line and note components (leg c1b1 builds those with an
   optional `onAsk` prop; export the function they will be given). Songs gets the dock too.
4. **Panel state out of `useSession`**: `cardOpen`, `toggleCard`, `messages`, `sendChat` move to
   `useCoachPanel` (the parity suite `src/test/parity/doors.test.ts` guards `useSession`'s call order; an
   independent reviewer reads this diff: keep it tight). The conversation lives for the app run only.
5. **What the panel holds after this leg** (the fact cards and tools are the next milestone; be honest
   meanwhile):
   - the head: "Ask", the context line "Looking at: …" from `buildCoachContext` (one quiet line; a
     divider in the thread when the screen changes mid-conversation), close;
   - **the model selector at the panel's foot** (owner, 2026-11-20: the bottom of the right-hand coach
     panel is its home): the `CoachModelSelector` leg ms1 built and mounted at the foot of the old
     card, moved to the foot of the dock and the drawer, under the text box, above or beside the
     one-line footer. Its menu opens upward and stays inside the panel. On a phone it sits in the
     sheet's head (the foot is under the keyboard);
   - the thread and the text box: the existing conversation (`sendChat`) as it works today when a model
     is ready. When the selector is Off or no model is ready, the box is still there and the empty state
     says in one sentence what this panel can do now; do not fake an answer. Model output keeps the
     existing guards;
   - the footer, one line, from DESIGN 5.5's table ("Answers from your Takes and Paths. Nothing leaves
     this computer." shaped to what is true after this leg);
   - on a phone: the sheet with the same head and footer, no model, the empty-state sentence. The
     mobile-bundle rule (`scripts/check-mobile-bundle.mjs`) forbids the string `CoachCard`; no new
     component carries that name. Record the amendment ("the line, the note and the rule-made Ask ship
     on phones") in `plans/MOBILE_IMPLEMENTATION_PLAN.md` in one paragraph.
   - the old panel's Feed, History, Start and End stay reachable where they are today until c2a2: the
     simplest honest arrangement is that the tools' screens keep opening the old panel's session
     controls inside the new shell (a "Tools coach" section) for this one leg. Say what you chose.
6. Looks: theme tokens only; the coach's colour on the glyph only; no solid button inside the panel;
   chips as DESIGN 3.6; light theme checked in Manuscript.

## Hunks you own in shared files

`MainWindow.tsx` (the panel's mount and state; you are its one owner in this wave), `Rail.tsx` (the Ask
row's handler only; the selector is ms1's, already merged), `MainHeader.tsx`, `hotkeys.ts` and the action
dispatcher, `useSession.ts` (moving panel state out, nothing else). `SessionView.tsx`: the Ask pill in
the session bar and the "move in by the panel's width" rule only; leg c1b1 is changing the Session's
ready, Take and result bodies at the same time, so keep to the bar and one wrapper class.

## Gates

tsc, vitest, build; `npm run test:layout` in full (the panel changes the shell at every width), with new
scenes: dock at 1440 and 1160, Today with the dock at 1200, the drawer at 1024 × 700 over a Session's
ready screen with Start visible, the drawer over a result, the phone sheet (and with the keyboard up),
landscape; `tour.spec`, `rail.spec`, `short-window.spec`, `phone-header.spec`, `phone-learning.spec`;
the parity suites (`doors`, `surface`, `localeKeys`), `hotkeys.scopes.test`, `mobileComposition.*`,
`npm run check:mobile-bundle`; the new `smooth.spec.ts` case. Screenshots of the new scenes in Ember and
Manuscript under `/tmp/coach-c2a1/shots/`, listed in your report.

## Report

As BRIEF "The end of a leg", with the screenshot paths, the `useSession.ts` diff range for the reviewer,
and exactly what the old panel still does until c2a2.
