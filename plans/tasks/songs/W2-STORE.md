# W2 — The store: a coach that remembers

Branch `songs-w2-store`. Size L. Roadmap §6 item 1.1 (read it in full; it
is the spec) plus what Songs and paths need (`LEARNING_PATHS_DECISIONS.md`
B4, `SONGS.md` T-B).

## Deliverable

- `rusqlite` (feature `bundled`) and `src-tauri/src/db.rs` with versioned
  migrations on `PRAGMA user_version`. The database lives beside the
  existing store in the app's data directory. Opening, migrating and every
  query happen off the audio threads and off the UI thread.
- Tables: the roadmap's `sessions`, `segments`, `exercise_ceilings`,
  `routines`, `routine_runs`, `events` — a superset of today's
  `SavedSession` and the `SessionLog` summaries; do not shrink the model.
  Add for this wave:
  - `scores(id TEXT PRIMARY KEY, title, artist, source_file, format,
    track_index, track_name, imported_at, json)` — the `SongScore` of the
    contract, stored whole.
  - `attempts(id, score_id, session_id, started_at, range_start_bar,
    range_end_bar, tempo_percent, passes, score, hits, misses, extras,
    mean_dev_ms, mad_ms, take_path NULL)`.
  - `attempt_onsets(attempt_id, onset_id, pass, state, deviation_ms)` and
    `attempt_extras(attempt_id, pass, beat)`.
  Indexed for "every attempt at bars 17–24 of this song, oldest first" and
  "this note's history", because those two questions are what the coach
  will ask.
- One-time import of the existing JSON history on first open, idempotent,
  leaving the JSON in place untouched. `exportSessionLogs` keeps working;
  diagnostic JSON logs stay as they are.
- IPC: `getSessionHistory`, `saveSession`, `deleteSession`,
  `clearAllSessions` re-implemented on SQLite with unchanged shapes; add
  `queryHistory(filter)` (preset / exercise / instrument / date range / bpm
  band), `saveScore`, `listScores`, `getScore`, `deleteScore`,
  `saveAttempt`, `queryAttempts({ scoreId, barRange? })`. Types in
  `src/ipc.ts`.
- `presetAwareness.ts` keeps its pure functions; feed them rows.

## Gates

Migration test on a fixture history JSON (make one from the shapes in
`session.rs`; never read the owner's real data directory); every
`presetAwareness` and `greeting` vitest case unchanged; a 500-session,
5 000-attempt database answers `queryHistory` and `queryAttempts` in
< 20 ms (assert it in a test, in release mode if debug cannot); a
corrupted or newer-version database degrades to an empty history with a
logged warning and never a crash or a deleted file.

## Not yours

`timing.rs`, `engine.rs`, anything in `src/songs` or the UI. The contract
types for onset results are in `BRIEF.md`; mirror their field names.
