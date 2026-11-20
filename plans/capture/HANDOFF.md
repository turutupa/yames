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
