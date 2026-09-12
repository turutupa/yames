# Jam 1 — the build brief (shared by every worker)

Read this first, then your own file (`W1-ENGINE.md` or `W2-UI.md`). Then
`AGENTS.md` at the repo root, and `plans/JAM_MODE.md` §0–§3 and §6 for what
Jam is and why it is a mode. Do not read the rest of the plan looking for
scope: the scope for today is in this file, and it is smaller than the plan.

## What ships today (Jam 1, first cut)

A new **Jam** mode in the rail, beside Metronome, Setlist and Drill, with its
own library of jams. Loading one and pressing play gives you a drummer on the
tick grid the metronome already runs, a form you can see your place in, a
count-in, and the timing coach underneath, exactly as on the metronome tab.

In:

- The rail entry, the library (list, load, new, rename, delete, reorder),
  six starter jams seeded on first run.
- The jam screen: groove picker (eight grooves), feel (straight, shuffle,
  swing), intensity (soft, normal, loud), form (12-bar blues, 8-bar loop,
  16-bar, AABA 32, one chord, custom bars), fills on/off, count-in, tempo.
- The form timeline: bar N of M, chorus count, the current bar lit, sections
  marked. The transport reads bar / of and chorus while a jam plays.
- The engine: a groove table on the tick grid, a fill on the last bar of the
  chorus, a crash on the one, form and chorus counters in every beat event.
- Hotkey: `tab-4` (mod+4) opens Jam; the rail order becomes Metronome,
  Setlist, Drill, Jam.
- The honesty line on screen: "Headphones keep the score honest."
- Strings in all fifteen locales.

Out (do not build, do not stub in the UI): chords and keys, bass, kits
beyond the one that exists, the groove editor, drop-out bars, trading fours,
tempo trainer, recording, section skipping, anything coach-specific. The
`kit` field exists on the record and is ignored by the engine.

## The contract (already on the branch, do not change without saying so)

- `src/jam/types.ts` — `JamEngineConfig`, `JamPattern`, `JamLevel`, the
  library `Jam` type, form bar counts, intensity gains.
- `src/ipc.ts` — `setJam(config | null)`, `listJams()`, `saveJams(list)`.
- `src/types.ts` — `BeatEvent` gained `formBar` (0-based bar in the chorus)
  and `chorus` (1-based). Both are 0 and 1 when no jam is loaded.

The Rust mirror of `JamEngineConfig` is W1's to write, camelCase via serde,
field for field. The command is `set_jam` taking `config: Option<JamConfig>`.

The rule the contract encodes: **the UI sets the engine's subdivision to
`ticksPerBeat` and its beat groups to `[beatsPerBar]` before calling
`setJam`.** The engine checks `ticksPerBeat × beatsPerBar` against its own bar
length and plays the plain click when they disagree. Nobody guesses.

## Branch policy (the owner's standing rule)

Nothing is ever committed on `main`. The feature branch is **`jam`**. Your
worktree may start on a stale branch: run `git log --oneline -1` first and,
if it is not the tip of `jam`, run `git checkout -B <your-branch> jam`
(W1: `jam/w1-engine`, W2: `jam/w2-ui`). Commit on your branch, small commits
with the repo's message style (`feat(jam): …`, `fix(jam): …`; the subject
says what changed for the user, the body says why). **Do not push. Do not
merge.** The orchestrator reviews, runs the gates independently, and merges
into `jam`.

## Environment

- `node_modules` is missing in a worktree. Copy, never install:
  `robocopy "C:\Users\alber\Dev\yames\node_modules" ".\node_modules" /E /NFL /NDL /NJH /NJS /MT:16`
  (exit code 1 from robocopy means success).
- The Rust toolchain is MSVC by a directory override that covers the
  worktree. `LIBCLANG_PATH` and `VULKAN_SDK` are in the environment; if a
  build says otherwise, export `LIBCLANG_PATH="C:\Program Files\LLVM\bin"`.
- Use the warm target dir so nothing builds cold:
  `export CARGO_TARGET_DIR="C:\Users\alber\Dev\yames\src-tauri\target"`.
  Two workers may share it; cargo serialises on its lock, which is fine.
- Frontend-only runs of the app: `YAMES_DEV_NO_LLM=1 npm run tauri dev`.
  **Only W2 runs the app, and only after the store backup below.** W1 never
  starts the app.
- The app uses the OWNER'S real store at
  `%APPDATA%\com.yames.metronome\settings.json` and port 1420. Before the
  first `tauri dev`: copy the file to your worktree's `.store-backup/` and
  record its SHA-256. After your last run: if the hash changed, restore the
  backup byte for byte. Never restore from remembered values.
- On Windows run `npm run test:rust`, never bare `cargo test --lib` (the
  wrapper supplies a manifest the test harness needs; without it the binary
  dies at load with 0xC0000139).

## Gates (all of them, before you report; paste the tails)

```
npx tsc --noEmit
npm test                       # vitest, includes the locale contract test
npm run test:rust              # cargo test --lib --no-default-features, MSVC
npm run test:dsp
npm run test:highbpm
```

W1 also runs the jitter probe (see W1-ENGINE.md). A gate you could not run
is reported as not run, with the reason; never as passed.

## Report (your final message)

1. Branch and commit list (`git log --oneline jam..HEAD`).
2. Each gate with its result and the last lines of output.
3. What you built, in the words a musician would use.
4. What you did not do, and why.
5. Anything you changed in the contract or in the other worker's area, and
   why (this should be empty).
6. The store hash before and after, if you ran the app.
