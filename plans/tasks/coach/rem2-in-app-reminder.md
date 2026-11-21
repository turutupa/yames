# Leg rem2: the practice reminder, in the app only (Settings → Coach; one line on Today)

Worktree `/home/dgx-delgado/yames-coach-rem2`, branch `coach-rem2`. Logs under `/tmp/coach-rem2/`.
A small leg: aim for under 150k tokens.

**This brief replaces Part 2 of `rem-practice-reminder.md`** (that file stays as it is; its Part 1 is
done, `plans/coach/progress/rem.md`). The owner's decision 2 of 2026-11-20 (OWNER-UPDATES, "owner
decisions on the 1k questions"): *in-app only (Today mentions it on a reminder day). No new
notification dependency, no Android notification prompt for now.* That is rem.md's option A.
**Needs c4a1 and c4a2 merged** (the coach's key module `src/coach/store.ts` or wherever c4a1 put it;
the Suggestions row, the reminder's neighbour). **R**: it adds a key to the settings store.

Read: `progress/rem.md` (option A, the "three ignored" section), `c4a1.md` (how a coach key is read,
written, defaulted and added to the manifest), `c4a2.md` (the Suggestions row), `c1b2a.md` and
`src/coach/todayLine.ts` (Today's line: its cases, its register), `hd1.md` if merged (Today's header).
Design, read-only: `DESIGN.md` 6.1, 6.6, 12 q8. `NEXT-LEGS-s4b.md` judgement calls 20 to 25.

## The owner's rules where they bite here

- **Off by default; nothing ever asks the player to turn it on**: no card, hint, tour stop, wizard step
  or Ask chip names it. Only the player's own press in Settings → Coach turns it on.
- **No notification, no permission, no dependency, nothing in the background.** No plugin, no Kotlin,
  no `lib.rs`, no OS scheduler. If a step seems to need one, stop and report.
- **The coach never changes a setting without a press**, so nothing turns the reminder off by itself
  (item 4).
- The line is a fact: no streak, no count of days, no "you missed", no exclamation, no question to
  the player about their discipline.

## What to build

1. **The key** `coach.reminder` = `{ on: boolean, time: "HH:MM", days: number[] }` (0 = Sunday, local
   time), through c4a1's typed reader / writer: a missing or malformed value reads as off, never throws
   (a test per malformed shape); added to the settings manifest (`src/test/parity/surface.test.ts`;
   regenerate with `UPDATE_PARITY_MANIFEST=1` rather than hand-merging if another leg moved it).
   Turning it on the first time fills `time: "18:00"` and all seven days (judgement call 22).
2. **`src/coach/reminder.ts` (new, pure)**: `reminderLine(reminder, now, practisedDays)` → a `Line` or
   null. It says something only when the reminder is on, today is one of its days, `now` is at or past
   the time, there is **no Session today**, and item 4's quiet rule does not hold. "A Session today"
   means a stored Take of a Path Session, or a saved tool run, dated today (judgement call 21; if tool
   runs are not cheaply readable on Today, Path Takes only, and say so). A table test: off; not a
   reminder day; before the time; a Session already today; after the time with none; the minute
   boundary; the locale's midnight; a day-list of one.
3. **Today says it** in one line above Today's line (not instead of it: the measured line still shows),
   in `TodayView.tsx`, read once when Today mounts and once at the set time by one `setTimeout` while
   Today is mounted (no interval, nothing per beat; Today is not on screen during a Take). English
   proposed, in the register of Today's line (judgement call 20): **"Your reminder: guitar at 18:00."**
   (`{{time}}` in the locale's own time format, `Intl.DateTimeFormat`). Rule-made, so it shows on a
   phone as on a computer.
4. **"Off after three ignored", in-app** (judgement call 23): the app may not switch the setting off
   (that is a change without a press). Instead, **Today stops mentioning it** when the last three
   reminder days whose time had passed all went by with no Session; the setting stays On, nothing is
   stored for this (it is computed from the Takes), and the first Session after that brings the line
   back on the next reminder day. Settings → Coach says so under the row while it holds: "Today has
   stopped mentioning it: three reminder days went by without a Session. It starts again after your
   next Session." A test for the rule (two days: still said; three: quiet; a Session: said again).
5. **Settings → Coach row** beside Suggestions (c6 regroups later): "Practice reminder" with Off / On
   (the section's existing two-way control), and when On a time input and seven weekday toggles in the
   locale's order (first day of the week as c4b1 used it); every control 44 px on a phone. The hint:
   "Today mentions it after this time on these days, if you have not practised yet. There is no
   notification." Shown on a phone too (judgement call 24).
6. **Fifteen locales** for the new keys by sonnet helpers with `plans/COACH_I18N_BRIEF.md` (tell them:
   a fact, not a greeting, no exclamation; "Session" as the locale already says it).
7. **Layout scenes** (pictures only when `YAMES_SHOT_DIR` is set): Today with the line (1440 dock open,
   1024, a phone), the Settings row on and off, one German, one Manuscript.

## Not yours

OS notifications of any kind (decided out by the owner); the Android prompt; the wizard; Settings →
Coach's regrouping (c6a); Today's header (hd1); Today's measured line (`todayLine.ts`'s cases).

## Gates

tsc, vitest (the parity suites and `i18n.locales.test.ts` included), build; layout by name:
`today-line.spec.ts`, `settings.spec.ts`, `phone-learning.spec.ts`, `short-window.spec.ts`,
`smooth.spec.ts`, your scenes.

## Report

As the rules block's "The end of the leg": the key's shape and default, the line's English and its
conditions, the quiet rule as built, the locales that want a native read, the screenshot paths, and a
**diff for review** paragraph for the settings store code, the manifest, `CoachSettingsSection.tsx`
and `TodayView.tsx`.
