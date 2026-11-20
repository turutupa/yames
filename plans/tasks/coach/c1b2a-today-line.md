# Leg c1b2a: Today's line

Worktree `/home/dgx-delgado/yames-coach-c1b2a`, branch `coach-c1b2a`. Logs under `/tmp/coach-c1b2a/`.

The first half of what session 1 briefed as `c1b2-today-speech-keys.md`, split so each half stays under
250k tokens. **Read that file first**: its reading list (BRIEF, `progress/c1b1.md`, `progress/c1a.md`,
DESIGN 6.1, 3.1, section 8's Today row, mocks `01-today` and `12-phone-today`) is yours. Also
`plans/coach/progress/c2a2.md`: the old greeting (`greeting.ts`) was deleted with the old Start button
because this line replaces it; its four tiers are in git history if you want to see what it said.

## Yours

Item 1 of `c1b2-today-speech-keys.md`, whole: **Today's line** above the plan, by `SessionPlan.mood`,
from stored rows only; pure selection code in `src/coach/todayLine.ts` with its table test over fixture
histories (the 500-Take edge, a variant change, a Take marked not fair); the component is the
`CoachLine` c1b1 built; it absorbs "Where you left off"; on a Step page a line only when there is
something measured to add; the slot is absent when there is nothing to add. The whole line opens Ask
(as c2a1 wired the Session's line: a computer only; on a phone nothing under 44 px is a target).
Item 4 for these strings: fifteen locales with `plans/COACH_I18N_BRIEF.md`; the English honesty test
covers them.

The rules that decide whether a sentence may exist:
- Every sentence is a measured fact from a stored row, or a statement of what today's plan does. Never
  a streak, never "you missed a day", never praise for showing up, nothing about the microphone.
- A sentence that speaks of history names its window ("yesterday", "last Session", "in the last seven
  days").
- "It slipped there; today starts there" is said only when today's plan really starts there.
- An ungraded player gets minutes and tempo, no claim about the playing.
- Where the line would only repeat what the plan's rows already say, there is no line.

## Not yours

The voice at boundaries and the three hotkey actions (leg c1b2b). "A Songs passage is due" (c5a: leave
the case typed). The proactive card slot under the plan (c4b).

## Hunks you own in shared files

`TodayView.tsx` and its styles, `src/coach/todayLine.ts`, the Step page's line, the locale files (your
keys only). Another leg may be adding keys to the locale files at the same time: add yours in one block
per file so a merge is mechanical.

## Gates

tsc, vitest, build; layout by name: `today-anchor.spec.ts`, `today-focus.spec.ts`, `planner.spec.ts`,
`phone-learning.spec.ts`, `short-window.spec.ts`, and new scenes for Today with the line at 1440, 1024
and a phone, in German or Russian too (the line wraps, it never truncates), in Ember and Manuscript;
the parity `localeKeys` suite. The full layout suite is the orchestrator's, after 8 PM Pacific on a
weekday (run it yourself if your gates start after 8 PM).

## Report

As the rules block's "The end of the leg", with the screenshot paths and the table of moods against the
sentence each produced from the fixture histories.
