# Leg rem, Part 1: can Yames have one opt-in practice reminder? (feasibility, no app code)

Owner decision 8: no notifications by default; one opt-in practice reminder the player sets (DESIGN
12 q8: a time, weekdays, the word "Guitar?", off after three ignored). The rule: nothing uninvited,
no permission prompt nobody asked for.

**Verdict: Part 1 is not clear.** Every option that reaches a player whose app is closed needs at
least one of: a new dependency (or new features of an existing crate), a new permission prompt, or
(Linux) an OS scheduler entry. Part 2 is not built; it waits for the owner's pick below.

Sources are marked: **[repo]** read in this worktree, **[lookup]** read through `web-look` from the
plugin's own source on GitHub (`tauri-apps/plugins-workspace`, branch `v2`) or its docs page,
**[mine]** my own knowledge, not verified tonight.

## What the repo has today [repo]

- No notification plugin: no `tauri-plugin-notification` in `src-tauri/Cargo.toml`, no
  `@tauri-apps/plugin-notification` in `package.json`; nothing in `capabilities/default.json` or
  `mobile.json`. `notify-rust`, `mac-notification-sys` and `objc2-user-notifications` are not in
  `Cargo.lock`.
- **Desktop: closing a window quits the app.** `lib.rs`'s `CloseRequested` handler saves the window
  position, finishes a running Take and calls `exit(0)` "for any window". There is a tray icon
  (Show / Quit menu) but nothing keeps the process alive after a close, and no autostart. So at the
  reminder's time the desktop app is, in the usual case, not running.
- **Android already declares `POST_NOTIFICATIONS`**, in the in-house plugin's manifest
  (`src-tauri/plugins/yames-mobile/android/src/main/AndroidManifest.xml`, merged into the app's), for
  the foreground service's shade row while the click plays. It is asked at most once, at a calm
  moment, and only after the app went to the background mid-click (`maybeAskForNotifications` in
  `YamesMobilePlugin.kt`). The app manifest (`gen/android/.../AndroidManifest.xml`) adds only
  `INTERNET`. No `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED` or `WAKE_LOCK`.
  `targetSdk 36`, `minSdk 24`. The plugin already has Kotlin, a notification channel
  (`ClickService.kt`, `IMPORTANCE_LOW`) and `androidx.core`: an alarm + receiver can live there
  without a new library.
- On Windows `windows = 0.61` (features `Win32_Foundation` only) and `windows-sys` are direct
  dependencies; on Linux `zbus` is already in the graph (single-instance).

## The official plugin, `tauri-plugin-notification` v2 [lookup]

- **Scheduling is mobile-only in practice.** `src/desktop.rs` builds a `notify_rust::Notification`
  and shows it at once; the word "schedule" does not appear in the file. A scheduled notification on
  desktop would need the app running at that time and a timer of our own.
- Desktop `request_permission` / `permission_state` always answer `Granted` without prompting.
- Windows: "only works for installed apps; shows PowerShell's name and icon in development" (docs).
- **Android: its library manifest adds `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `POST_NOTIFICATIONS`**
  and a boot receiver (`LocalNotificationRestoreReceiver`, `BOOT_COMPLETED` / `LOCKED_BOOT_COMPLETED`
  / `QUICKBOOT_POWERON`, `directBootAware`). Scheduling uses `AlarmManager`: `setExact` /
  `setExactAndAllowWhileIdle` when `canScheduleExactAlarms()`, otherwise inexact `set` /
  `setAndAllowWhileIdle`. It declares neither exact-alarm permission, so on Android 12+ it falls back
  to inexact alarms, which is fine for "Guitar?". The boot receiver and two install-time permissions
  arrive with the package whether or not the player ever sets a reminder.
- Adding it = a crate (pulls `notify-rust`; on macOS `mac-notification-sys`, on Windows a WinRT
  toast crate [mine]) and an npm package. Both are the owner's decision.

## The table

| Platform | App closed at the set time: what can deliver "Guitar?" | Permission prompt | New dependency | Background / at boot |
|---|---|---|---|---|
| **Windows** | An OS-held **scheduled toast** (`ToastNotifier::AddToSchedule`, WinRT) survives the app's exit [mine]. The official plugin cannot (shows at once only) [lookup]. | None; Windows does not ask (Focus Assist may hide it) [mine] | New **features** of the existing `windows` crate (`UI_Notifications`, `Data_Xml_Dom`), likely no new package [mine]; or the plugin (new crate + npm) | None |
| **macOS** | An OS-held **`UNUserNotificationCenter` calendar trigger** fires with the app closed [mine]. The plugin cannot (shows at once only) [lookup]. | **Yes**: the system "Allow notifications?" sheet, raised by `requestAuthorization` (or by the first notification) [mine]. Must come from the player's press on "Remind me", never at startup | **New crate** (`objc2-user-notifications`, not in the lock) [repo + mine]; signed bundle needed [mine] | None |
| **Linux** | **Nothing OS-held.** The freedesktop notification spec has no scheduling [mine]; it would take a systemd user timer, an XDG autostart entry or a resident process | None (D-Bus, no prompt) [mine] | `notify-rust` via the plugin, or `zbus` already in the graph [repo] | **Yes**: an OS scheduler entry or a background process: ruled out by the rule |
| **Android** | `AlarmManager` inexact alarm (`setAndAllowWhileIdle`) + a `BroadcastReceiver` that posts the notification, in `yames-mobile` (Kotlin, no new library) [repo + mine]; or the official plugin [lookup] | **Yes on Android 13+** unless already granted: `POST_NOTIFICATIONS`, already declared [repo]; must come from the player's press | None for the in-house route; crate + npm for the plugin | Alarms are **cleared on reboot** [mine]: without `RECEIVE_BOOT_COMPLETED` (a new install-time permission and a boot receiver, which the plugin adds) the next reminder waits until the app is opened again |
| **iOS** | not checked (not shipped) | | | |

While the app is open, a system notification is pointless (the player is in the app): on every
option, the app cancels or skips that day's notification when the app is open at the set time and
Today says it instead.

## "Off after three ignored": what can be known with the app closed

The app cannot reliably know a notification was ignored while it is closed (on desktop a tap on a
toast of an unpackaged app relaunches it at best; no "dismissed" event reaches a closed app) [mine].
**The honest rule: hold at most the next three reminders.** Each time the app is opened (or a Session
ends), it cancels what is pending and schedules the next three reminder days. If the player opens the
app on none of them, the queue runs dry by itself after the third: that is "off after three
ignored", enforced by the OS, with nothing running. When the app is next opened after the third
reminder's day with no Session since, it sets `coach.reminder.on = false` and Settings → Coach says
why ("Turned off after three reminders without practice"). Rule in words: **three reminders in a row
with no Session in between.**

## Options

**A. In-app only (no notification at all).** On a reminder day, after the set time, if there has
been no Session that day, Today's first line says "Guitar?" when the app is opened (or is already
open as the time passes). Off after three such days with no Session. Costs: nothing; no dependency,
no permission, no background, every platform alike (Linux included). Weakness: it only reaches a
player who opens the app, which is the player who needs it least.

**B. In-app everywhere + OS-held notifications where the OS holds them, written in-house.**
Android: alarm + receiver in `yames-mobile` (Kotlin, `POST_NOTIFICATIONS` already declared; the
prompt raised only by the player's press on "Remind me"; no boot receiver, so after a reboot the
next reminder waits until the app is opened). Windows: a scheduled toast through new features of the
existing `windows` crate (no prompt; installed builds only). macOS: needs a new crate and the
system prompt on the press. Linux: in-app only (option A). Costs: Cargo features (Windows) and one
new crate (macOS) for the owner to approve; a Rust leg that touches `lib.rs` plus a Kotlin leg;
one runtime prompt on Android 13+ and on macOS, each raised only by the player's own press.
A smaller B: **Android only** (no new dependency at all) + option A on desktop.

**C. The official `tauri-plugin-notification`.** Covers Android scheduling; on desktop it only shows
at once, so a closed app still gets nothing and Linux/Windows/macOS fall back to A anyway. Costs: a
new crate and npm package, and on Android a boot receiver + `RECEIVE_BOOT_COMPLETED` + `WAKE_LOCK`
that every install gets, reminder or not. Not recommended: it pays the most and adds the uninvited
parts.

## Recommendation

**A now, and the Android part of B when the owner says yes.** A meets decision 8 with nothing
uninvited and can be built in Part 2 at once (Settings → Coach row, `coach.reminder` key, Today's
line, fifteen locales). The Android alarm needs no new dependency and no new manifest permission;
its only cost is the `POST_NOTIFICATIONS` prompt on Android 13+, raised by the player's press on
"Remind me" (and skipped if the click's shade row already got the answer). Windows and macOS
OS-held reminders are worth a later look only if players ask: each needs a dependency decision, and
macOS a signed bundle to test.

## The question for the owner

1. Is **option A** (the reminder lives in the app: Today says "Guitar?" when opened after the set
   time) acceptable as the whole of decision 8, or only as the desktop half?
2. On **Android**, may the player's own press on "Remind me" raise the system's notification
   prompt (Android 13+), for an in-house alarm in `yames-mobile`? (No new dependency, no new
   manifest permission; after a reboot the next reminder waits for the app to be opened, unless you
   also allow `RECEIVE_BOOT_COMPLETED`.)
3. Windows scheduled toasts (new `windows` crate features) and macOS (new crate
   `objc2-user-notifications`, a prompt on the press): now, later, or never?

## Next leg must know

- Key `coach.reminder` (`{ on, time, days, ignored }`) per the brief; with the three-pending rule,
  `ignored` counts reminder days passed with no Session, reset by any Session.
- Part 2 also needs c4a2 merged (the Suggestions row is the neighbour in Settings → Coach).
- Facts marked [mine] (WinRT scheduled toasts for an NSIS-installed app, the macOS prompt's timing,
  alarms cleared on reboot) should be checked on the device before a leg builds on them.
