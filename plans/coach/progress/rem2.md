# Leg rem2: the practice reminder, in the app only

Brief: `plans/tasks/coach/rem2-in-app-reminder.md`. Branch `coach-rem2`. Logs `/tmp/coach-rem2/`.

## Built

- `coach.reminder` in `src/coach/store.ts` (the fifth key, same pattern): `{ on, time: "HH:MM", days: 0..6, since }`.
  Missing or malformed reads as off (`REMINDER_OFF`: off, 18:00, all seven days = what the first On fills);
  a present value of the wrong shape makes the key "unreadable" (F6); `saveReminder` is the row's press only,
  refused before the load, allowed over an unreadable value (a whole value, as Suggestions), keeps unknown
  fields of the stored object. `since` (the press that turned it on) is the one addition to the brief's shape:
  without it the quiet rule would count reminder days from before the player turned it on, and a player
  coming back after two weeks would never see the line. Manifest: `coach.reminder` added.
- `src/coach/reminder.ts` (pure): `reminderLine`, `reminderQuiet`, `practisedFrom`, `reminderDueLaterToday`,
  `reminderTimeText` (Intl). `src/coach/useReminder.ts`: the store hook and the Session-days read
  (`listPathTakes(500)` + `getSessionHistory()` once at mount and once at the time, one setTimeout; nothing
  read while off; a failed read says nothing).
- Today: `src/containers/session/TodayReminder.tsx`, two one-line hunks in `TodayView.tsx` (above the
  measured line, desktop and phone).
- Settings: `CoachReminderRow.tsx` beside Suggestions; on a phone (no Coach section there) a section
  `#settings-coach-reminder` with the row alone, in `SettingsView.tsx`.
- English in `locales/en/notebook.json` `notebook.reminder.*`.
- Shots: `?reminder=on` in `src/shots/mockIpc.ts`.

- Phone: a phone's Settings never names the coach (`mobileComposition.test.tsx`), so the phone section
  is titled "Practice reminder" (`#settings-coach-reminder`), not "Coach".
- Locales: 14 by a sonnet helper. Native read wanted: es/it/pt-BR/pl/ru (preposition before a time like
  1:00), de (um + 12-hour), ja/ko (loanword for "reminder", since 通知/알림 mean notification), vi ("Ngày"
  for Days), nl (pronoun for herinnering), zh (quiet says "no practice" rather than Session).
- Tests: `src/coach/reminder.test.ts` (table, midnight, quiet rule), `store.test.ts` (reminder block, one
  test per malformed shape), `src/containers/settings/CoachReminderRow.test.tsx` (row + Today line).
  Layout: `tests/layout/reminder.spec.ts`.

## Gates

- tsc 0; `npm run build` 0; `npm run test`: 2 files failed: TabStage.render (known symlink one) and
  mobileComposition (fixed, see above; re-run green). SupportSection failed once in a loaded re-run and
  passed alone (load flake, not touched here).
- Layout (first run, box at the queue's limit): today-line, settings, short-window green; reminder's
  phone-settings scene could not build through `settings-update` on a phone (fixed: through the tab);
  smooth.spec 4 long-task failures and phone-learning:374 (2 px) under load: re-run queued.
