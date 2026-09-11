# Mobile task briefs — "Yames on a phone, no coach"

Each `M0N-*.md` file is a self-contained brief for one coding agent
session. Hand a worker exactly one file. The worker must read
`AGENTS.md` and `plans/MOBILE_IMPLEMENTATION_PLAN.md` first; the brief
says what to build, where, and how it is judged.

Scope is fixed by the plan §1: metronome, drills, setlists, zen,
presets, themes, languages, trimmed settings and onboarding. **No coach,
no mic evaluation, no voice, no MIDI, no widget** on mobile. A worker
that finds a reason to keep any of those reports it; it does not keep
them.

## Order and parallelism

```
M00 Android spike (throwaway branch, findings file is the deliverable)
 └─► M01 Rust gates
      └─► M02 frontend gates
           ├─► M03 responsive & touch pass
           └─► M04 Android native plugin      (parallel with M03)
                 └─► M05 Android release       (needs M03 + M04)
                       └─► M06 iOS
                             └─► M07 iOS Bluetooth MIDI (v1.1)
```

**Owner's call on 2026-09-11: go as fast as parallelism allows.** M01,
M02, M03a and M05a do not depend on M00's audio measurement and started
the same day, each in its own worktree. M00 runs alongside them once the
Android tooling is installed. M03 (layout) and M04 wait for M02 and M01
respectively; M05 waits for M03 + M04.

## Branches

- Long-lived feature branch: `mobile` (from `main`).
- One worktree per task on `mob/m0N-short-name`, branched from
  `mobile`. Open a PR against `mobile`, not `main`. Do not merge.
- Worktrees created by the Agent tool may start on a stale branch.
  First command: `git log --oneline -1`; if it is not the tip of
  `mobile`, `git checkout -B mob/m0N-short-name origin/mobile`
  (or the local `mobile`) before touching anything.
- `mobile` merges to `main` once, when Android v1 is releasable.
- Only a commit message starting with `release` cuts a release from
  `main`. Use `chore:` / `refactor:` / `feat(mobile):` for task commits.

## Rules every worker follows

- Surgical edits, no file rewrites (AGENTS.md).
- Desktop must not change behaviour. The `practice-coach` Cargo feature
  is on by default and `IS_MOBILE` is false by default; every desktop
  gate stays green: `bun run tsc --noEmit` → `bun run test` →
  `bun run test:rust` → `bun run test:dsp` → `bun run test:highbpm`.
- Mobile gates, from M01 on:
  `cargo check --manifest-path src-tauri/Cargo.toml --no-default-features --target aarch64-linux-android`
  and, on a Mac, `--target aarch64-apple-ios`.
  From M02 on: `YAMES_MOBILE=1 npm run build && node scripts/check-mobile-bundle.mjs`.
- The click is sacred. Nothing new runs on the cpal callback thread;
  `SharedState` is held no longer than today.
- Route every new Tauri command through `src/ipc.ts` (or
  `src/ipc.desktop.ts` for desktop-only ones, from M02).
- New user-visible strings go in `src/locales/en.json`.
- Strings the user reads never say Rust, Tauri, WebView, APK, or NDK.
  Musicians, not developers.
- `npm run tauri dev` / `tauri android dev` use the owner's real
  settings store on desktop. One dev instance at a time; back the
  store up byte-for-byte and restore it after.
- Report back with: what was done, exact commands and their results,
  which OS and device you ran on, anything you could not verify, and
  open questions. Never say "done" for a gate you did not run.

## Owner's machines and devices

- Android work happens on Windows 11 (MSVC toolchain pinned; see
  AGENTS.md "Building on Windows"). Export `LIBCLANG_PATH` and
  `VULKAN_SDK` as for desktop builds; the Android NDK path goes in
  `NDK_HOME`, the SDK in `ANDROID_HOME`, and a JDK 17 in `JAVA_HOME`.
- `scripts/tauri.mjs` injects `--features coach-llm-vulkan` on Windows.
  For mobile commands set `YAMES_DEV_NO_LLM=1` until M01 teaches the
  wrapper about mobile targets.
- iOS work needs the Mac with Xcode. CI's `macos-latest` runner builds
  iOS for M06.
- The Android test device is the owner's previous phone, available
  after their phone swap. Until then the Android emulator carries all
  build, gating and layout work. Only the audio measurement (M00 step
  6), the screen-off and interruption gates (M04) and zen-effect
  performance need real hardware; a brief that reaches one of those
  without a device says so in its report and stops there. If the phone
  runs a VPN, use `adb reverse tcp:1420 tcp:1420` over USB instead of
  Wi-Fi for `tauri android dev`. An iPhone is needed from M06 on.

## Briefs

| File | Task | Size |
|---|---|---|
| `M00-android-spike.md` | Scaffold, boot on device, measure callback cadence, write findings | M |
| `M01-rust-gates.md` | `practice-coach` feature, `cfg(desktop)`, `TempoContext` extraction, wrapper support | M |
| `M02-frontend-gates.md` | `IS_MOBILE`, lazy subtrees, `ipc.desktop.ts`, `useSession` split, bundle check | L |
| `M03a-css-mechanics-and-survey.md` | Hover audit and wrapping, safe-area tokens, touch targets, phone-width survey | M |
| `M03-responsive-touch.md` | Phone layouts, presets sheet, trimmed onboarding (after M02) | L |
| `M04-android-native.md` | Foreground service, audio focus, wake lock, interruptions | M |
| `M05a-release-prep.md` | Privacy page, store copy, dispatch-only Android CI draft, licence exception text, console checklist | S |
| `M05-android-release.md` | Keystore, signed APK + AAB, Play closed test, website download section | M |
| `M06-ios.md` | `tauri ios init`, AVAudioSession, TestFlight from CI, App Store listing, GPL exception | L |
| `M07-ios-midi.md` | CoreMIDI footswitch on iOS | M |

M00, M01, M02, M03a and M05a are written. M03, M04, M05, M06 and M07
are written when their predecessor merges, from what the predecessor
found.
