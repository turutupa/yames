# M10 — The band costs a phone memory only when it is playing

Size: M. Branch: `mob/m10-band-memory`, from the tip of `mobile` (it
must contain `merge(mob/m08-main-v121)`). Written 2026-09-20. Read the
last section of `plans/tasks/mobile/M08-JAM-GAPS.md` first ("One thing
that is not layout"), then the history of the desktop freeze this warm
exists for: `git log --format=%B -1 7bdb6eb` and `932c32b` (decoding the
band on the main thread froze the window; `warm_jam` decodes ahead of
time on its own thread and probes the device rate).

## The problem, measured by M08

Release APK, Pixel 6 AVD, `dumpsys meminfo`: 87.5 MB PSS six seconds
after launch, **455 MB twenty seconds later**, because
`useJamSession.ts` (~line 643, `warmJam({ configs })`) decodes every
distinct sound set the saved library names, 2.5 s after the jams load.
A musician who opened the app for a metronome pays 342 MB for fifty
jams they did not ask for. On a phone that is what gets a backgrounded
app killed — the one thing M04's foreground service exists to prevent.
Playing itself costs nothing and leaks nothing.

## What to build — on a phone only; the desktop keeps today's behaviour exactly

1. **Nothing is decoded until the player goes to Jam.** On `IS_MOBILE`
   the launch-time library warm does not run. Entering the Jam tab (or
   a setlist reaching a jam step — check how `useSetlistRunner` hands a
   jam step over, one step AHEAD is when to warm) warms **the loaded
   jam's own sound sets and nothing else**: its kit, its bass voice,
   its keys voice. The decode stays off the main thread and off the
   audio thread, as today; Play pressed before it finishes must behave
   as the desktop does in that race (find out what that is and say).
2. **Changing the kit or a voice in setup** warms the new one and lets
   the old one go. The pickers' own `warmJam({ kits: true })` /
   `{ bassVoices: true }` / `{ keysVoices: true }` calls
   (`KitPicker.tsx`, `JamSetupSheet.tsx`) warm EVERY kit / voice so the
   audition is instant; on a phone warm on selection instead, and
   accept a short, visible "loading" on the row being auditioned over
   300 MB. Measure how long one kit takes to decode on the emulator's
   release build and put the number in the report; if it is under
   ~150 ms nobody needs a spinner.
3. **The cache has a ceiling on a phone.** Whatever holds the decoded
   sets in Rust (the managed caches `warm_jam` fills) gets a mobile-only
   budget — sets not used by the loaded jam are dropped when a new jam
   is loaded, and everything is dropped when the app has been in the
   background AND stopped for a while (Android's `onTrimMemory` through
   the plugin is the honest signal; a timer is the fallback). Never
   drop anything while the band is playing, and never free on the audio
   thread: the callback holds `Arc`s, the drop happens wherever the last
   non-callback owner lets go — prove that with the alloc probe's free
   counter, which must stay at zero in the callback.
4. **Look at what the buffers are.** `kit.rs` decodes to interleaved
   stereo `f32` at the device rate. 29.6 MiB of FLAC becoming 342 MB
   says most of the cost is format, not content. Do NOT change the
   sample format or the mixer in this task — but measure and report
   what one loaded jam costs after items 1–3 (expect tens of MB), and
   if a single jam is still over ~80 MB, say what the cheapest next
   step would be (mono sources kept mono, i16 storage with conversion
   in the voice, shorter tails) with numbers, as a proposal only.

Desktop: `IS_MOBILE` is false, the Rust budget is `cfg(mobile)` (or
`target_os = "android"` / `"ios"` — follow what M01 established), and
every desktop test and the jam freeze's own regression tests stay green
untouched. If you find the desktop would ALSO benefit (a 50-jam library
on an 8 GB laptop), say so in the report; do not do it.

## Gates

- `npm run build`, `npm run test`, `npm run test:rust`
  (`CARGO_TARGET_DIR='C:\yt-m10'`, only via `node scripts/rust-test.mjs`,
  never two cargo runs at once in one target dir), `npm run test:dsp`,
  `npm run test:highbpm`, `npm run test:layout` (`--workers=2`).
- `DOCS_RS=1 cargo check --manifest-path src-tauri/Cargo.toml --lib
  --target aarch64-linux-android`; `YAMES_MOBILE=1 npm run build && node
  scripts/check-mobile-bundle.mjs`.
- **The emulator is yours alone** (AVD `yames_phone`; environment block
  in `M08-main-v121-and-jam.md`; build a release APK, sign it with a
  throwaway key you delete in the same script, as M08 did — never a
  real key). The table M08 made, made again: PSS and native heap at 6 s,
  at 30 s on the metronome tab without ever opening Jam (**must stay
  under ~110 MB**), after entering Jam with one jam loaded, with the
  band playing, after loading a second jam with a different kit (the
  first kit's memory comes back), after five minutes. Play still
  returns in tens of milliseconds once warm. The click-alone 120-ticks-
  in-60-s gate still passes.
- **Do not touch the physical phone attached to this machine**
  (`adb devices` shows a Pixel 8a, serial 44031JEKB04073). It is the
  owner's. Every adb command names the emulator with `-s emulator-5554`
  (or whatever serial the AVD gets) — a bare `adb install` with two
  devices attached fails, and `-d` would hit the phone.

## Rules

`git checkout -B mob/m10-band-memory mobile` first;
`rustup override set stable-x86_64-pc-windows-msvc`; `node_modules` by
robocopy **from PowerShell** from `C:\Users\alber\Dev\yames-mobile`;
never push, never merge, never start the desktop app, `tauri dev` or
`tauri android dev`; explicit `git add` paths; the click is sacred;
new strings in 15 locales appended at the end of their namespace;
commits end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
Stay out of Jam's CSS and view components beyond the two picker call
sites named above: M09 is laying Jam out for a phone in them.

## Report

The memory table before/after, decode time for one kit, what happens
when Play beats the warm, where frees happen, the desktop left
untouched (how you know), the proposal from item 4 if one is needed,
final commit, worktree path.
