# M06 — iOS: the same app on an iPhone, through TestFlight

Size: L. Branch: `mob/m06-ios`, from `mobile` after M05. **Runs on the
Mac** (Xcode required); CI's `macos-latest` runner builds and uploads.
Needs: an iPhone for the device gates, the owner's Apple Developer
account, and the App Store licence exception settled (`LICENSE-EXCEPTION.md`).

## Goal

A TestFlight build of Yames for iPhone with the same feature set as
Android v1, background audio through `AVAudioSession`, and an App Store
listing ready for review.

## Decisions already made

- Bundle id `com.yames.metronome`, portrait only, iOS 15+ (plan §1).
- No MIDI in v1 (M07 adds CoreMIDI; midir's iOS arm is intact).
- Background audio: `AVAudioSession` category `.playback`, mode
  `.default`, activated when playback starts and deactivated when it
  stops; `UIBackgroundModes: audio` in `Info.plist`. Interruptions via
  `AVAudioSession.interruptionNotification` → the same
  `audio_interrupted` event M04 defined, so the frontend handler is
  shared.
- The cpal CoreAudio backend is used as-is on iOS (it honours the
  session's preferred buffer duration); set
  `setPreferredIOBufferDuration(0.005)` and `setPreferredSampleRate(48000)`
  on the session before the stream opens. If M04 replaced cpal on
  Android with direct Oboe, the iOS path still goes through cpal —
  keep the two behind their own `cfg(target_os)` arms.
- Keep-awake: `UIApplication.shared.isIdleTimerDisabled` from the same
  plugin command M04 defined (`keep_awake`). Open URL:
  `UIApplication.shared.open`.
- The App Store exception text goes into `LICENSE` and the About
  screen legal line **in this task**, once the owner has the PR #8
  author's consent (or has decided to replace that contribution).

## Steps

1. On the Mac: `rustup target add aarch64-apple-ios aarch64-apple-ios-sim`;
   `npm run tauri ios init` (scripts/tauri.mjs sets `YAMES_MOBILE=1`);
   commit `src-tauri/gen/apple` as generated.
2. `cargo check --lib --target aarch64-apple-ios` clean; `tauri ios build`
   for the simulator; boot on the iPhone 15 simulator; the M00 checklist
   (every screen, settings persistence, click audible) repeated there.
   Screenshots under `plans/tasks/mobile/m06/`.
3. Swift half of the `yames-mobile` plugin: `set_background_audio`,
   `keep_awake`, `open_url`, interruption notifications → event.
   `Info.plist`: background mode audio, `NSMicrophoneUsageDescription`
   is **not** needed (no mic in v1) — make sure nothing requests it.
4. Device gates on the iPhone: play, lock the screen, 10 minutes; take
   a call; Control Center volume; silent switch does not silence the
   click (that is what `.playback` is for).
5. Signing: App Store Connect API key as CI secrets
   (`APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_API_KEY_BASE64`),
   distribution certificate and provisioning profile via
   `tauri ios build --export-method app-store-connect`; a new
   `.github/workflows/ios.yml`, `workflow_dispatch` only, uploads to
   TestFlight. The desktop `release.yml` is not touched.
6. App Store Connect: listing from `store-listing.md`, App Privacy
   "Data not collected", screenshots from the simulator at the sizes
   App Store Connect currently requires (check; they change yearly),
   review notes explaining the background-audio entitlement is for
   the metronome click.
7. Licence exception into `LICENSE` and About; the website's download
   section gets a TestFlight link, then the App Store badge after
   approval.

## Acceptance gate

- TestFlight build installable on the owner's iPhone; the four device
  gates in step 4 pass; `ios.yml` runs green.
- Desktop gates unchanged; Android gates unchanged.
- Review submitted, with the submission id in the report.

## Report

What was done, exact commands, device model and iOS version for each
gate, anything not verified, what the owner must do in App Store
Connect. Never push from a worker; never touch `main`.
