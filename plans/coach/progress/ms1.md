# ms1: the model selector and the resident model

Branch `coach-ms1` (from `f85383ab`; merges cleanly onto `coach` at `e8872e58`, checked with
`git merge-tree`). No Rust changed.

## What landed

- **One owner for the model's life**: `src/hooks/coachLoader.ts` (module state, grown from the old
  loader). The player's choice is `coachBrainTier` (`off | standard | full`), the state is
  `off | notDownloaded | notOnThisDevice | waiting | loading | ready | failed`, and every input
  (choice, disk, Take, startup gate, a load or unload returning) ends in one `reconcile()`.
  - Loads only after the startup gate (`useCoachModelDriver` in `MainWindow`: first frame painted,
    then `requestIdleCallback`, 1.5 s fallback on WebKit), never *starts* while `isPlaying`
    (a Take's click; a load in flight runs on, PLAN decision 4).
  - One call to Rust at a time: a pick or Off during a load, or a pick during an unload, is settled
    when it returns. A failed load is remembered against the tier and the weights on disk and is
    retried only by Retry, a new pick, or new weights. Off unloads, never deletes.
  - Before the disk has been read, only Off unloads (a reloaded webview adopts a model Rust already
    holds via `is_coach_loaded`; that also keeps the parity surface's wrapper with a caller).
  - The ten-minute idle unload, `ensureCoachLoaded`, `scheduleCoachIdleUnload` and `unloadCoach` are gone.
- **Sessions stop owning the model** (`useSession.ts`, reviewed diff): the load in `startSession`,
  the idle unload in `endSession` and the mount-time `isCoachLoaded` query are gone; the hook mirrors
  residency from the loader by subscription. Call order otherwise unchanged. `brainTier` stays in
  `UseSessionOptions` (unread) so `MainWindow` did not change there.
- **A quiet Path Session generates nothing**: tips and drill lines (`modelMaySpeak()`), the load-grace
  wait, and the segment mini-report's `coach_generate` (`useSegmentCoach` `quietRef`) skip the model
  in a quiet session; greeting and summary already did. Chat (the player's own question) is untouched.
- **The selector**: `src/containers/main-window/CoachModelSelector.tsx` (+ `src/styles/coach-model.css`),
  self-contained (no props), mounted at the foot of `CoachCard` on both tabs. The rail is exactly as
  on `coach` (the stopped run's rail placement and `rail.model.*` strings were removed). A `menu` with
  `menuitemradio` rows and `menuitem` actions; arrows / Home / End / Enter / Space / Esc / Tab, roving
  focus, focus back to the button. Opens upward inside `[data-coach-model-bounds]` and below
  `[data-coach-model-ceiling]` (CoachCard marks its root and head; the Ask dock should do the same).
  Rows: Off; "Standard · Qwen3 4B · 2.5 GB"; "Studio · Qwen3 8B · 5.0 GB"; Cloud a typed `null`.
- **Download in the row**, on the existing path: `useCoachDownload` registers a port with the loader
  and publishes the download's state; the selector only calls `startCoachModelDownload` /
  `pauseCoachModelDownload` on a press. A download from the selector does NOT change the choice when
  it finishes (Settings' tier buttons and the wizard still do: their press means "use this").
- Settings → Coach reads the same state (`withLoaderState` replaces the old "loads when you start
  practising" line with on disk / waiting / loading / failed).
- Under 720 px the coach card's inside was pinned to 380 px in a 320 px card (Send was cut); fixed.
  While the window's 22 px download strip is up, the card's foot lifts clear of it.

## The reviewer's six (second pass)

1. **Memory is a warning, never a lock.** `recommended()` no longer gates `loadable` or the row
   state; rows carry `lowMemory` and show "This computer has less memory than this model wants…".
   "Not on this device" is only a build with no model support (or a phone). A fresh install's
   default stays Off. Tests: `coachLoader.test.ts` "too little memory is a warning…", "…still lets a
   model download…"; `CoachModelSelector.test.tsx` "too little memory is a warning in the row".
2. **No Download over any brain on disk**, legacy included (`otherOnDisk` lost its legacy exception;
   `canDownload` needs `why === null`, so a legacy same-tier row points to Settings' "Update brain").
   Tests: "legacy weights on disk are not overwritten…", "a brain file whose tier is unreadable…".
3. **A failed startup probe** sets `probeFailed`: the chosen row reads "failed" with Retry; `probe()`
   runs again on Retry, a pick, or the click stopping. Tests: "a failed startup probe reads as
   failed…", "…asked again when the click stops, never in a loop".
4. **The stored choice first**: `restoreCoachModelChoice` (from `useCoachDownload`'s `storeLoad`,
   also on its rejection) sets `choiceKnown`; no reconcile unloads before it. Tests: "nothing is
   unloaded before the saved choice is read", "a saved Off read late still unloads".
5. **Residency unknown after a double failure**: `residentUnknown`; the next reconcile asks
   `isCoachLoaded` first (an input arriving while it asks is settled after the answer, even a
   throw); Off unloads regardless. Tests: "a failed load and a failed question…", "after a double failure…".
6. **A Path Session holds every load**: `src/hooks/coachLoadGate.ts` (no IPC, so the phone build's
   Session screen stays clean), set by `SessionView` for any run phase but idle and recap. Tests:
   "no load starts while a Path Session is in progress…", "a load already in flight runs on…".

Also: a running download's row says "Downloading" (selector test). Strings: `state.downloading`,
`state.lowMemory` added; `state.update`, `state.otherOnDisk` reworded; `why.ram` removed; all 15 locales.

## Answers the leg asked for

- **One brain or two on disk: one.** Both tiers write `models/brain/model.bin` (+ `tier`, `model.json`).
  While any brain file is on disk (legacy included), the other row offers no Download ("A second
  model on this computer needs a later update; for now, switch in Settings → Coach").
- **coachBrainTier "off"** before: unload only (never delete). Kept as the persisted choice; no new
  key, no migration. Restore accepts only `off | standard | full`.
- **"Fast enough for tips"** (`should_use_model`, `rephrase_p50_ms`) untouched.

## What the download offers, exactly

| Feature | Status |
|---|---|
| Start on a press | yes (`start_model_download`, then the Piper voices, shown as a "voices" step) |
| Progress | yes, a fraction from curl's progress bar (Rust sends no bytes: `downloadedBytes` is 0) |
| Pause / resume | yes, truthfully: Rust's cancel kills curl and keeps the per-URL `.part`; the next start resumes with `-C -`. Labelled Pause / Resume. The paused fraction is remembered only until restart. |
| Cancel (discard the bytes) | **no**: nothing deletes the `.part` except Settings' "Remove models". Not offered. |
| Checksum | **no**: Rust checks only a size floor (`min_brain_bytes`). Not claimed anywhere. |
| Low storage warning | **no**: no free-space figure exists. Not shown. |
| Metered warning | partial: asks first when `navigator.connection` says `cellular` or `saveData` (Chromium / WebView2 only; WebKit has no such API). |

**What ms2 must build**: two tiers side by side on disk (per-tier dirs, `check_model_status` per tier,
load by tier, delete by tier, migrate today's `brain/`); a real cancel that deletes the `.part`; a
SHA-256 check against the published GGUF hashes (no hashing crate today); free space in
`check_model_status` (`statvfs` on unix via `libc`, `GetDiskFreeSpaceExW` needs the windows-sys
`Win32_Storage_FileSystem` feature); bytes in the progress event; a metered check on Windows
(WinRT `NetworkInformation`). Also: the window's own download strip says "Cancel" for what is a pause.

## Gates (logs in /tmp/coach-ms1/)

tsc `tsc.log` green; vitest `vitest.log` 11418 tests green, one file fails to load
(`TabStage.render.test.tsx`: "Denied ID …/yames-coach-build/node_modules/…Bravura.woff2", a linked
`node_modules` outside the worktree; fails the same way in the clean `yames-coach-pm` worktree at
coach's head, `vt-base-tabstage.log`); build `build.log`; `check:mobile-bundle` after `build:mobile`
green; layout `pw-layout.log` 147 passed (rail, short-window, settings, tour, session-polish and the
new coach-model). Screenshots: `/tmp/coach-ms1/shots/{ember,neon,manuscript}-{380,320}-{not-downloaded,downloading,closed}.png`.

## For the next legs

- c2a1: mount `<CoachModelSelector />` at the Ask dock's foot; put `data-coach-model-bounds` on the
  dock and `data-coach-model-ceiling` on its head. On a phone the rows say "not on this device".
- "A Take is running" is approximated by the metronome's `isPlaying` (every Take plays the click).
- ru short states are feminine (agreeing with "модель"); worth a native read.
