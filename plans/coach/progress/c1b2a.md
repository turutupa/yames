# c1b2a: Today's line

Branch `coach-c1b2a`. Frontend only: no Rust, no store change, nothing on a Take's path.

## What landed

| File | What |
|---|---|
| `src/coach/todayLine.ts` (new) | Pure selection: `todayLine({ plan, progress, paths, now, grading, takesRead })` → `{ kind, lines: Line[] }` or null; `stepLine(...)` for the Step page; `storedPlace` (where a stored Take slipped, from its own per-bar figures via `barStrip` + `countRounds`); `lastSessionOf`, `windowOf`, `todayLineText`. `songDue` is typed, never chosen (c5a). |
| `src/coach/todayLine.test.ts` (new) | The table over fixture histories (below), `storedPlace`, the Step page's line, and the English honesty lint over every `session.today.line.*` string (banned claims, "the bar", streak / missed day / praise / microphone / "!", a window in every history sentence). |
| `TodayView.tsx` | The line (`CoachLine`, testid `today-line`) at the top of the plan column on a computer, under the title on a phone (`IS_MOBILE`). Opens Ask (`askCoach({ about })`) on a computer only. The "Where you left off" card is gone. On a first Session with the line, the kicker is "Your first session" (the line says what it finds). "More below" now shows when the last row is cut by more than 2 % (was 10 %): the line made a list that scrolled by a few pixels with no cue (`planner.spec` 2000x780). |
| `PathsView.tsx` (StepDetail) | The Step page's line (`step-line`) under the goal, only when the last Session's last graded Take on one of the Step's Exercises slipped somewhere. |
| `session.css` | `.session-today-line` (no card, no fill; 18 px; a faint `›` after the sentence via `::after`, so Ask's `about` is the sentence alone), phone order, `.session-step-line`. |
| `coachWords.ts` | `leftOffLine` removed; `src/session/leftOff.test.ts` removed. |
| `useSessionRun.ts` | `TAKES_TO_READ` exported (one word), so the line knows when the store's read may stop inside the last Session. |
| Locales | `session.today.line.*` (28 English strings + plural forms) in all fifteen, in place of the six `leftOff*` keys (listed in `DELIBERATELY_REMOVED`). |
| Scenes | `today-line` (seed `slipped`: `returning` with per-bar figures on the last Take) and `phone-today-line`; `tests/layout/today-line.spec.ts` (1440 and 1024 in Ember and Manuscript, de and ru at 1024, phone in Ember, Manuscript and ru, absent on `today-returning`, the back case). |

## The rules, as code

- Every history sentence is about the player's **last Session** (`sessionKeyOf` of the newest Take) and names its window: earlier today / yesterday / in your last Session (calendar days).
- `first`: no Takes and a placement step in the plan. An ungraded first Session has no placement climb: no line.
- Ungraded (grading off, or a last Session with no graded Take and all Takes ungraded): minutes (bars x metre at the Take's tempo, floored; under one minute, no line) and the last Exercise and tempo; "Same place today." only when the first Exercise step is that Exercise at that tempo. Not said when the read of 500 Takes may have stopped inside that Session.
- `back` (mood back): the last graded Take's headline number ("Last Session, X: 78% even at 80 BPM.") unless it was marked not fair; then the rungs (`rungsToDrop`) only when the first Exercise step is `backEased`.
- `slipped`: the last Session's last graded Take on the plan's first Exercise step (warm-ups are not Exercise steps), not marked not fair, same variant, with a slipped bar: "X: bar 1 of the tune slipped on 2 of 4 rounds yesterday. Today starts there."
- `earned`: a Take of the last Session that raised the clean tempo to what it is now, not marked not fair, on an Exercise the plan has as a review, a climb or a keep: "X: your clean tempo went up to 90 BPM yesterday. Today it goes faster."
- Anything else: null, and the slot is not rendered.

`lean` is not used: it is relative to the Take's median and says which way, not what slipped; the place comes from the stored per-bar figures, the same strip the result's note uses.

## Mood → sentence (the fixture table in `todayLine.test.ts`, en)

| History | Case | Sentence |
|---|---|---|
| no Takes, placement in plan | first | Your first Session finds where you start. Nothing to prepare. |
| no Takes, no placement (ungraded) | - | no line |
| bar 1 slipped yesterday, plan starts there | slipped | A tune on the B string: bar 1 of the tune slipped on 2 of 3 rounds yesterday. Today starts there. |
| same, plan starts elsewhere | - | no line |
| same, variant 1 then, variant 2 today | - | no line |
| same, Take marked not fair | - | no line |
| nothing slipped, nothing earned | - | no line |
| clean tempo raised yesterday, plan climbs | earned | A tune on the B string: your clean tempo went up to 90 BPM yesterday. Today it goes faster. |
| same, raising Take marked not fair | - | no line |
| back after 12 days, eased | back | Last Session, A tune on the B string: 79% even at 90 BPM. Today starts a rung lower than it would have. |
| back after 30 days | back | ... Today starts 3 rungs lower than it would have. |
| grading off, 4 ungraded Takes of 40 bars at 90 yesterday | ungraded | 7 minutes of Takes yesterday, ending with A tune on the B string at 90 BPM. Same place today. |
| 500 ungraded Takes, all in yesterday's Session | - | no line (the read may have stopped inside it) |
| grading off, a graded last Session | ungraded | minutes and tempo only, no % and no place |

## Gates (logs in /tmp/coach-c1b2a/)

- tsc pass (`tsc.log`); build pass (`build.log`).
- vitest full: 13961 passed; 1 test failed, `tokens.test` (a coach-only token used in `session.css`), fixed and re-run green (`vitest-tokens.log`); the known `TabStage.render.test.tsx` cannot load (`vitest.log`).
- Layout: `today-anchor`, `today-focus`, `planner`, `phone-learning`, `short-window`, `today-line`: 372 passed, 1 failed (`planner` 2000x780 "More below"), fixed, `planner` + `today-anchor` re-run 39 passed (`pw-gates.log`, `pw-planner.log`); `ask` + `today-line` 29 passed (`pw-ask.log`).
- **Owed:** the full layout suite (after 8 PM Pacific).

## Open points

- Translators' doubts: "earlier today" in ja / ko / zh, "one run" (`earnedThen.keep`) in every locale, de "Minute Takes" in the ungraded keys, ru pronoun in `earnedThen.climb`. Worth a native read.
- The English ungraded sentence was reworded after translation ("the last one X" → "ending with X"); the other fourteen keep the "the last one" sense, which means the same.
- The mock draws a thin outline around the line; the leg's rule ("no card") won: no border.
