# Leg rem: the one opt-in practice reminder: feasibility first, then (only if clear) Settings → Coach

Worktree `/home/dgx-delgado/yames-coach-rem`, branch `coach-rem`. Logs under `/tmp/coach-rem/`.

Owner decision 8 (`plans/tasks/coach/BRIEF.md`): **no notifications by default; one opt-in practice
reminder the player sets themselves.** DESIGN 12 q8 describes it: a time, weekdays, the word
"Guitar?", off after three ignored. Nothing else ever notifies (PLAN, "Not in this plan"). **Part 1
needs nothing merged and edits no app file: it can start at once.** Part 2 needs c4a2 merged (the
coach's stored keys and Settings → Coach's "Suggestions" row are its neighbours; c6 regroups that
section later).

## Part 1: feasibility (always; report before building anything)

Answer each with evidence (the code, `Cargo.toml`, `package.json`, `src-tauri/capabilities/`,
`src-tauri/gen/android/app/src/main/AndroidManifest.xml`, and the plugin's documentation through
`~/.local/bin/web-look`, no project data in a query). Known when this was written: **the repo has no
notification plugin** (no `tauri-plugin-notification` in `Cargo.toml` or `package.json`) and the
Android manifest asks for no notification permission.

1. **Desktop (Windows, macOS, Linux)**: can Tauri 2 show a notification at a set time **while the app
   is closed**? (Is scheduling mobile-only in the plugin? Would it need the app running in the
   background, a tray, autostart, or an OS scheduler entry? Each of those is a new behaviour the player
   did not ask for.) While the app is open, a reminder is pointless: say so.
2. **macOS**: does the first notification raise the system's permission prompt? (It does for most
   apps: then the prompt must come from the player's own press on "Remind me", never at startup.)
3. **Android**: API 33+ needs the `POST_NOTIFICATIONS` runtime permission; exact alarms need
   `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` (Play policy restricts the second). What does the plugin
   use for a scheduled notification, and which permissions does it add to the merged manifest?
4. **iOS** is not shipped: say "not checked".
5. **Dependencies**: the crate and the npm package it needs. **A leg may not run `npm install`** and
   should not add a crate on its own: adding either is the owner's decision.
6. **"Off after three ignored"**: can the app know a reminder was ignored (no tap within N hours) with
   the app closed? If not, the nearest honest rule ("three reminders in a row with no Session that
   day").

**Stop and report after Part 1 if any answer is "a new permission prompt nobody asked for", "a new
dependency", or "a background process or autostart".** Write `plans/coach/progress/rem.md` with the
table (platform × what works × what it costs: permission, dependency, background), your
recommendation, and the exact question for the owner; commit; report. Do not build Part 2.
A permission prompt raised **only by the player's own press** on "Remind me" is not "nobody asked for":
record it as an option for the owner, do not decide it.

## Part 2: the setting (only if Part 1 is clear, or the orchestrator relaunches you with the owner's word)

1. Settings → Coach: "Practice reminder: Off / On", a time, weekdays; stored as one key
   (`coach.reminder`: `{ on, time, days, ignored }`) added to the settings manifest (**R**: the
   settings store). Off by default; nothing asks the player to turn it on (no card, no chip, no hint).
2. The reminder's text is the one word "Guitar?" in each locale (no count, no streak, no "you missed a
   day"); tapping it opens Today. Off after three ignored, by Part 1's rule, with Settings saying why it
   went off.
3. Fifteen locales; a layout scene of the Settings row (1440 and a phone).

## Not yours

Any other notification. Settings → Coach's regrouping (c6). The Suggestions row (c4a2).

## Gates

Part 1: none (a report). Part 2: tsc, vitest (parity suites), build, `npm run test:rust` if Rust
changed, layout `settings.spec.ts` and your scene.

## Report

As the rules block's "The end of the leg": Part 1's table and the question for the owner; Part 2's
diff for review if it was built.
