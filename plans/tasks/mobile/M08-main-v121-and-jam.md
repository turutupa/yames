# M08 — The phone gets everything the desktop got since v1.1.0, the band included

Size: L. Branch: `mob/m08-main-v121`, from the tip of `mobile`.
Written 2026-09-20. Read `AGENTS.md`, `plans/MOBILE_IMPLEMENTATION_PLAN.md`,
`plans/tasks/mobile/README.md`, `M04-FINDINGS.md` and `M05-FINDINGS.md`
first. Then `plans/JAM_MODE.md` on `main` (`git show main:plans/JAM_MODE.md`).

## Why

`mobile` stopped on 2026-09-11 with Android v1 complete on the emulator.
Since then `main` went from v1.1.0 to v1.2.1: 358 commits, almost all of
them **Jam** — a backing band (drums, bass, keys) as its own rail mode,
with 438 sound files (29.6 MiB of FLAC, `include_bytes!` through
`kit.rs`). A mobile release cut from today's `mobile` would ship a
different, older app than the desktop one, and every day the merge gets
harder. This task is that merge, done once and proven.

## Decision this brief carries (orchestrator's, flagged to the owner)

**Jam ships on the phone.** The plan's own §5 says the desktop
differentiators (footswitch, widget, coach) are exactly what does not
ship on mobile; a band in your pocket is the one thing a store full of
metronomes does not have. So: Jam's engine compiles and runs on Android,
its tab is in the bottom bar. **This task makes it run; it does not make
it pretty** — Jam's phone layout is M09. If the owner overrules, the
fallback is a build-time gate on the tab and nothing here is wasted. If
you find a *technical* reason Jam cannot run on a phone (the callback
cannot keep up, memory, the APK cannot hold it), measure it, report it,
and stop short of gating it yourself.

What stays cut, unchanged: coach, mic evaluation, voice, MIDI, widget,
updater. Anything in Jam that leans on one of those (a coach role in a
jam, a MIDI footswitch binding for Jam actions, a folder picker for a
custom kit the musician points at) is cut on mobile the same way the
rest is: target-conditional in Rust, `IS_MOBILE` / `ipc.desktop.ts` in
the frontend, and **absent from the mobile bundle** — extend
`scripts/check-mobile-bundle.mjs` if Jam brought a new desktop-only
string worth guarding.

## The merge

`git merge main` on your branch. A dry run on 2026-09-20 conflicted in
27 files:

- `src-tauri/Cargo.toml`, `src-tauri/src/engine.rs`, `commands.rs`,
  `lib.rs` — **the hard ones.** `mobile` has M01's target-conditional
  dependencies and M04's direct-Oboe output arm; `main` has Jam's mixer,
  `warm_jam`, the device-rate probe and preloading (see memory of the
  main-thread freeze fix, commits 7bdb6eb and 932c32b on `main`). Both
  sides must survive. On Android the output stream is M04's `oboe`
  stream, not cpal: whatever Jam asks cpal for (device rate, device
  probe, output device change) needs an Android answer — the rate the
  Oboe stream was granted, no probe, system routing. Nothing new runs
  in the audio callback on either platform beyond what `main` already
  runs there. **The click is sacred**; so is the band's timing.
- `src/ipc.ts` — `mobile` split it (`ipc.desktop.ts`); `main` added
  Jam's commands to the unsplit file. Jam's commands go in `ipc.ts`;
  anything desktop-only `main` added (updater, winget, widget, MIDI)
  goes in `ipc.desktop.ts`. The updater fix of v1.2.1
  (`fix(settings): the banner stops overlapping, and the check comes
  back`) lands on the desktop side only.
- `MainWindow.tsx`, `SettingsView.tsx`, `AboutSection.tsx`,
  `DevicesSettingsSection.tsx`, `shell.css`, `setlist.css` — keep
  `mobile`'s phone navigation (bottom tab bar, sheets, safe-area
  tokens, hover wrapping) and `main`'s Jam wiring. Jam gets a tab in
  the bottom bar with a short `mobileTabs.*` label in all 15 locales
  (read M03d's notes first: "Metro" was the subway in Spanish, "Tempo"
  meant speed in de/nl/tr — pick words a musician would say).
- 15 × `src/locales/*/shell.json` — both sides appended keys. Union,
  `mobile`'s keys after `main`'s, valid JSON, no key lost. Script it;
  do not hand-edit fifteen files.
- `docs/index.html` — take `main`'s page and re-apply `mobile`'s one
  addition (the Android row in the download section). Do not invent
  new site copy.

`main` also brought `test:layout` (Playwright, `@playwright/test`).
Run `npm install` in your worktree after the merge; do not copy a
`node_modules` that predates it without checking alphaTab is *absent*
(that is the Songs branch's, not yours).

New hover rules: `main` added CSS after M03a wrapped the 204 hover
rules. Re-run M03a's hover audit script over the merged tree and wrap
what Jam added.

## Environment (every shell)

```sh
export ANDROID_HOME=/c/Users/alber/android/sdk
export NDK_HOME=/c/Users/alber/android/sdk/ndk/26.1.10909125
export JAVA_HOME="/c/Users/alber/android/jdk-17.0.20.1+1"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
export CARGO_TARGET_DIR='C:\yt-m08'
```

`rustup override set stable-x86_64-pc-windows-msvc` in the worktree
first (a fresh worktree defaults to the GNU toolchain and dies at link
time). `LIBCLANG_PATH` and `VULKAN_SDK` as AGENTS.md says. Rust tests
only through `node scripts/rust-test.mjs` (`npm run test:rust`), never
two cargo runs at once in the same target dir (LNK1104).

The emulator is yours alone for this task: AVD `yames_phone`. **Never
`tauri android dev` and never `tauri dev`** — ports 1420 and 5311 are
held by the owner's and the orchestrator's dev servers, and the desktop
app shares the owner's real settings store. Build an APK
(`npm run tauri android build -- --debug --target x86_64` or what M05
settled on), `adb install`, drive it over DevTools-on-adb as
`M04-FINDINGS.md` "How to redo this" shows.

## Gates

Desktop, all green, run by you on the merged tree:
`npm run build` · `npm run test` · `npm run test:rust` ·
`npm run test:dsp` · `npm run test:highbpm` · `npm run test:layout`
(`--workers=3`; two other workers are loading this machine, so re-run a
failure alone with `--last-failed --workers=2` before believing it).

Mobile:
1. `DOCS_RS=1 cargo check --manifest-path src-tauri/Cargo.toml --lib --target aarch64-linux-android`
2. `YAMES_MOBILE=1 npm run build && node scripts/check-mobile-bundle.mjs`
3. A real APK builds, installs and boots on the AVD. Report the arm64
   release APK and AAB sizes against M05's 12.8 / 16.3 MiB — the band
   adds about 30 MiB and the owner should see the real number.
4. M04's emulator gates again on the merged build: 120 ticks in 60 s,
   ten minutes screen-off, the call interruption, Back.
5. **Jam on the emulator:** pick a vibe, press play, the band plays in
   time with the click for five minutes, screen off for two of them; a
   call pauses it and it resumes; stopping and starting again does not
   freeze the UI (the desktop freeze was decoding on the main thread —
   prove the preload path runs on Android too, with timestamps from
   logcat). Report memory (`adb shell dumpsys meminfo`) before Jam,
   with Jam playing, and after five minutes — a leak on a phone gets
   the app killed. If the engine has an underrun/overrun counter, its
   value; if Oboe reports xruns (`getXRunCount`), that.
6. `npm run shots:mobile` still runs, and add the Jam tab to its scenes
   at 360 / 390 / 430. **Do not fix what the shots show** beyond what
   makes Jam *operable* (a control off-screen with no way to reach it
   is in scope; ugly is not). Write `plans/tasks/mobile/M08-JAM-GAPS.md`
   in the style of `M03-GAPS.md`: what breaks at each width, with the
   shot beside it. That file is M09's brief-in-waiting.

## Also in scope (small, owned by nobody, from M04's open list)

- `android:screenOrientation="portrait"` in the manifest (plan §1).
- Drop the AndroidTV leanback `uses-feature`.
- The sound-output device picker is not offered on a phone (M04 Q7:
  it is inert there).

One commit each, after the merge commit.

## Rules

Explicit `git add <paths>` only — `git add -A` and `git add .` are
banned. Never push, never merge into `mobile`, never touch `main`,
never start the desktop app. Commit messages say what changed for the
person using it; end each with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
Surgical edits; CRLF files stay CRLF. No keystore, no signing secrets:
the release build uses M05's throwaway debug key path, never a real one.

## Report

Conflict by conflict, what each side wanted and what you kept. Every
gate with its number. What you could not verify. The sizes. The Jam
gaps file. Anything in Jam you cut on mobile and why. If you stop
early, stop at a commit boundary with the tree building, and say where.
