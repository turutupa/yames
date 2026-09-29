# Songs pre-merge fixes — shared brief (wave `songs-premerge`)

Written 2026-09-29 by the orchestrator. `songs-v1` is about to merge to
`main` (draft PR #57, CI green on all four platforms). Two read-only
reviews ran against `songs-v1` at `6d849559` before that merge — one of the
real-time audio path, one of the SQLite store and the file/IPC boundaries.
Every finding below was traced to lines by the reviewer, and the blocker
and the three store findings were re-checked by the orchestrator. This
wave fixes them. **Nothing else.** No refactors, no new features, no
"while I was here".

## Base and branches

- Base: `songs-v1` (the commit that adds this file, or later).
- `W38` → branch `songs-w38-audio-fixes`
- `W39` → branch `songs-w39-store-fixes`
- `git checkout -B <branch> songs-v1` in your worktree before anything
  else.

## Environment (Windows, this machine)

```sh
export PATH="$HOME/.nvm/versions/node/v20.15.1/bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
export LIBCLANG_PATH="C:/Program Files/LLVM/bin"
export CARGO_TARGET_DIR="C:/yt-w38"   # W39: C:/yt-w39 — never share a target dir
```

`node_modules`: your worktree has none. Make a junction to the Songs
integration checkout's (it has the tab library and the synth deps; the main
checkout's may not):

```sh
cmd //c mklink /J node_modules "C:\Users\alber\Dev\yames-songs\node_modules"
```

Never `npm install` / `bun install`. Never delete `node_modules` — it is a
link; the orchestrator unlinks it.

Do not start the app (`tauri dev`) or a dev server. A Yames instance from
the Songs checkout is open on this machine and uses port 1420 and the
owner's real settings.

## Ownership — disjoint by file, and inside `commands.rs` by function

| Area | W38 audio | W39 store |
|---|---|---|
| `src-tauri/src/synth.rs`, `synth/tests.rs` | ✔ | |
| `src-tauri/src/engine.rs` | ✔ | |
| `src-tauri/src/take.rs`, `loopback.rs` | ✔ | |
| `src-tauri/src/bin/click-jitter-probe.rs` | ✔ | |
| `src/hooks/useSongEngine.ts` (only if a finding needs it) | ✔ | |
| `commands.rs`: `jam_rate`, song load / clear / seek commands, `check_take_sound`, `start_take` | ✔ | |
| `src-tauri/src/db.rs`, `session_log.rs`, `session.rs` | | ✔ |
| `src-tauri/src/lib.rs`, `downloads.rs`, `camera_permission.rs` | | ✔ |
| `src/hooks/useSession.ts` and where the "history not kept" notice is shown | | ✔ |
| `commands.rs`: store open / JSON import / `save_session`, `take_video_*`, `take_thumb_write`, `clip_save_*`, `start_download_watch`, pending-open commands | | ✔ |

Anything outside your column: report it, do not edit it. `commands.rs` is
shared — keep your hunks inside your functions so the two branches merge
as text.

## Gates (run quietly — full logs to your scratchpad, summary + last 40 lines on failure)

Both: `npm run test:rust` (never bare `cargo test --lib`), and
`npx tsc --noEmit` if you touched TypeScript.
W38 also: `npm run test:dsp`, `npm run test:highbpm`, `npm run test:pitch`.
W39 also: `npm run test` (vitest) and `npm run build`.

Every fix lands with a test that fails before it and passes after, unless
the brief says why that is impossible. Wall-clock tests are not acceptable
(they were a night of flakes once): measure shape, count frames, drive the
ring by hand.

The jitter probe needs a quiet machine; two workers building at once is
not one. W38 extends the probe and checks it runs; the orchestrator takes
the numbers afterwards.

## Commits and report

Conventional prefixes (`fix(songs):`, `fix(store):`…), plain words, small
steps. End each commit with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Final report: per finding — fixed / not fixed and why, the test that
proves it, the commit. Then gate numbers. Under 400 words; the owner may
read it on a phone. Never push, merge, or open a PR.
