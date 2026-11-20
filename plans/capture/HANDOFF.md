# Recording session mode: handoff (card #109)

State 2026-11-20 ~04:45 PT, branch `mvp-capture` (from revamp 45ebdc2d), not pushed.

## Done (commit 457da734 + docs commit)
- App: `src-tauri/src/capture.rs` (session folder, session.json, write_take, marks,
  free-run segments, zip, sync chirp), `commands/capture.rs` (9 commands),
  hooks in `timing.rs` (post-Take write; `start_capture_only` for rhythm Takes),
  `onset.rs` (second tap, pulled also while the transport is stopped when armed),
  `speech_out.rs` + one stamp in the `engine.rs` callback (chirp start, by slot generation).
- UI: `src/settings/recordingSession.ts`, `containers/settings/RecordingSessionRow.tsx`
  (Support section), `containers/main-window/RecordingPill.tsx` (REC pill, M key),
  `hooks/useFreeCapture.ts`, Take context set in `useSessionRun.ts` before `loadScoreSchedule`.
  15 locales. Android `share_file` in the mobile plugin (Kotlin + permission).
- DGX: `tools/corpus/ingest.py` (`npm run corpus:ingest -- <dir|zip|rtx>`), tests
  `python -m unittest tools.corpus.test_ingest` (8, synthetic phone +1.234 s/+80 ppm: <0.25 ms).
- Format: `plans/capture/FORMAT.md`. Owner guide: `plans/capture/TESTING.md`.
- Gates: tsc, vitest (only TabStage.render fails: Vite "Denied ID" on the symlinked
  node_modules, unrelated), build, test:rust 1155/0, layout settings 14/0 (new row test),
  jitter probe `--capture` (new flag: 30 s Take to disk every 1.5 s + chirp every 4.5 s):
  base 0.95/0.96 ms, capture 0.80/0.53, jam+capture 0.89, song+capture 0.89; 0 missed,
  0 callback allocs, 0 dropped in every run. Logs `~/projects/.preview/capture/jitter/`.
- Review: opus, read-only, 5 confirmed, all fixed + covered by tests.

## Not verified / open
- Never run in the real app (no `tauri dev` allowed): the chirp through WASAPI, a real
  Take's job.json, the pill/M key in the window. First thing on the owner's PC test.
- `countInStartSample` math assumes firstBeatMs = beat 0 (FORMAT.md note).
- Android: `share_file` Kotlin not compiled here; adb `run-as` works only on a debuggable build.
- rtx pull ran once for real (silent, no sessions there yet).
- Songs passes are not captured; MIDI-input Takes with pitches are not (no notes pass).
- Phone m4a: supported since the test-round leg (2026-11-20): `read_recording` decodes
  m4a/aac/mp3/opus through ffmpeg (`$YAMES_FFMPEG`, else `~/tools/ffmpeg/ffmpeg`, a static
  7.0.2 arm64 build from johnvansickle.com, md5 checked, else PATH); without one mp3/opus try
  libsndfile and m4a is skipped with the reason in the report. Tests 10/10 (2 new, m4a AAC 128k).

# Sessions send themselves (card #123), branch `inbox`, not pushed

State 2026-11-20 ~06:30 PT.
- App (test builds only, `inboxOffered()`): `src/settings/testInbox.ts` (pairing, resumable
  4 MB chunk upload by webview `fetch`, states uploaded/waiting/failed, retry on open/online/10 min),
  `containers/settings/TestInboxRow.tsx` under Recording session, 15 locales.
  Rust `src-tauri/src/capture_outbox.rs` + `capture_sessions`, `capture_outbox_{prepare,chunk,clear}`
  (blocking pool; ids checked; chunk read only from the outbox). Android: zip copied to
  `/storage/emulated/0/Documents/Yames/capture` (best effort, Android 11+).
  The token is stored under `yamesInbox.token` (not `yames.*`), and `settingsSnapshot` drops any
  key naming a token/secret/password, so it never reaches session.json.
- DGX: `tools/inbox/server.py` (`npm run inbox:serve|inbox:pair|inbox:test`), systemd --user
  `yames-inbox.service` (copy in tools/inbox/), 127.0.0.1:5646 -> tailnet :8646.
  Inbox `~/projects/.datasets/yames-corpus/inbox/`, ingest logs `~/projects/.preview/corpus/inbox-logs/`.
  After merge: repoint the unit's WorkingDirectory/ExecStart/--repo to ~/projects/yames-revamp.
- `corpus:ingest rtx` also pulls `yames-capture-*.zip` from the phone's shared storage over adb.
- Review (opus, read-only): 4 medium + 6 low confirmed; all fixed with tests except the global
  pairing lockout (kept: tailnet only, 31^10 codes). Uploads are keyed `<session>__<device>`
  (X-Yames-Device, random per install); ingest puts a same-named session from another device at
  `<name>-b`. Server tests 27/0, ingest 10/0.
- Not verified: the real upload from WebView2 / Android WebView (CORS preflight, PNA), the Android
  shared-storage write on the owner's phone. QR pairing not built (paste link instead).
