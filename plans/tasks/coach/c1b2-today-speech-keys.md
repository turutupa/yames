# Leg c1b2: Today's line, the voice at boundaries, the three coach actions

Worktree `/home/dgx-delgado/yames-coach-c1b2`, branch `coach-c1b2`. Logs under `/tmp/coach-c1b2/`.
Read `plans/tasks/coach/BRIEF.md` first, then `plans/coach/progress/c1b1.md` (the `CoachLine` and
`CoachNote` components and their rules) and `plans/coach/progress/c1a.md` (`lean`, the note's data).
Design: DESIGN.md 6.1 (greetings), 3.1 (the Today, Paths and recap rows), 5.1 (the last table row: the
hotkey and MIDI actions), section 8 (the Today and Voice rows). Mocks: `01-today`, `12-phone-today`.

## What to build

1. **Today's line**, above the plan (mock 01): one sentence that adds what the rows cannot (where, not
   the number). It absorbs "Where you left off". By `SessionPlan.mood`, from stored rows only:
   - `first`: "Your first Session finds where you start. Nothing to prepare."
   - `returning`: where it slipped last time, from the stored Take's `lean` and bars ("In the B-string
     tune, it was the first bar that slipped yesterday. Today starts there."), only when today's plan
     really starts there;
   - `returning`, something earned: a clean tempo that moved and what today does with it;
   - `back` (seven days or more): the days off and the rung today starts under (`rungsToDrop()`);
   - an ungraded player: minutes and tempo, no claim about the playing;
   - nothing to add: no line (the slot is absent, not empty).
   Never a streak, never "you missed a day". "A Songs passage is due" is a later leg (c5a): leave the
   case typed. Pure selection code in `src/coach/todayLine.ts` with a table test over fixture
   histories (including the 500-Take edge, a variant change, a Take marked not fair); the component is
   the `CoachLine` c1b1 built. Every sentence names its window when it speaks of history. On a Step page
   the line appears only when there is something measured to add.
2. **The voice at boundaries** (section 8, Voice): only with Voice on (`coachVoiceMode`), only at
   boundaries: the order on a ready screen, the finding on a result. Never in a count-in or a Take;
   Start stops it at once. It speaks the same translated sentence the screen shows (no second wording),
   through the speech path that exists (`speech_out`, the TTS the old coach uses): **no Rust change**; if
   one seems needed, stop and report. A test that nothing is spoken between `takeStarted` and the
   result, and that a Start during speech cuts it.
3. **Three actions**, bindable to any key or MIDI button (ROADMAP 3.5's ids): `ask-explain-last` (the
   last Take's finding, as one line in the coach's slot, spoken if Voice is on), `ask-what-next` (what
   the big button will do and why, from `bigAction` and the planner's reason), `accept-suggestion`
   (presses the suggestion on screen when there is exactly one; does nothing during a Take). No panel
   opens. Registered in `hotkeys.ts` and the action dispatcher with their scopes
   (`hotkeys.scopes.test`), listed in Settings' bindings like the other actions, unbound by default.
   All three do nothing while a Take runs.
4. Strings in fifteen locales with `plans/COACH_I18N_BRIEF.md`; the English honesty test covers them.

## Hunks you own in shared files

`TodayView.tsx` and its styles, `src/coach/todayLine.ts`, `hotkeys.ts`, the action dispatcher, the
Settings bindings list. In `SessionView.tsx` only what speech needs (prefer subscribing to the bus
outside the view). Legs c1c (the Session's runner and tonal row) and c2a2 (the tools) run beside you.

## Gates

tsc, vitest, build; layout: `today-anchor.spec.ts`, `today-focus.spec.ts`, `planner.spec.ts`,
`phone-learning.spec.ts`, `settings.spec.ts`, and new scenes for Today with the line at 1440, 1024 and a
phone, in German or Russian too (the line wraps, it never truncates); `surface.test` manifest if a
settings key is added; `hotkeys.scopes.test`; the parity `localeKeys` suite.

## Report

As BRIEF "The end of a leg", with the screenshot paths and the table of moods against the sentence each
produced from the fixture histories.
