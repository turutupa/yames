//! The practice store — ROADMAP 1.1, and the memory the coach stands on.
//!
//! Until now the app remembered thirty sessions in a JSON array inside
//! `settings.json`, and nothing at all about *what* was played. A coach
//! that says "you rush bars 17–20 every time you come back to this" needs
//! more than thirty rows and needs the notes, so history moves into
//! SQLite: one file, `practice.db`, beside the store in the app's data
//! directory.
//!
//! # What is in here
//!
//! * `sessions` / `segments` / `events` — today's `SavedSession` widened
//!   into columns, plus the fields ROADMAP 1.1 reserves for the coach.
//!   The whole `SessionReport` is *also* kept as JSON on the row, and
//!   that JSON is what `get_session_history` hands back: the columns are
//!   for asking questions, the JSON is for answering with exactly the
//!   shape the frontend already knows. Nothing about the wire format
//!   changes when a column is added.
//! * `exercise_ceilings` / `routines` / `routine_runs` — reserved by the
//!   roadmap for the curriculum (2.5, 2.6). Created here so the
//!   migration that creates them is the one that ships, rather than a
//!   second migration against a database full of a user's history.
//! * `scores` / `attempts` / `attempt_onsets` / `attempt_extras` — Songs.
//!   A `scores` row is one imported song (the `SongScore` of the wave's
//!   contract, stored whole); an `attempts` row is one pass at a range of
//!   its bars, with a per-expected-onset verdict beside it.
//!
//! # Rules this module keeps
//!
//! * **It never deletes the user's file.** A database that will not open
//!   — corrupt, or written by a newer build — degrades to *no history*
//!   and a warning on stderr. The file stays exactly where it is, so a
//!   later build (or the user's own backup) can still read it. Losing a
//!   year of practice to a failed `PRAGMA` is not a trade this app makes.
//! * **It never runs on an audio thread**, and the Tauri layer keeps it
//!   off the UI thread as well — see `PracticeStore`.
//! * **The one-time import only reads.** It leaves `evalSessionHistory`
//!   in `settings.json` exactly as it found it, so downgrading to an
//!   older build still finds its history. The single place that array is
//!   ever written after that is `clear_all_sessions`, where the user has
//!   asked for all of it to be gone — see `commands.rs`.

use std::collections::HashMap;
use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::{Condvar, Mutex};
use std::time::Duration;

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::session::{SavedSession, SessionReport};

/// File name of the practice store, inside the app's data directory.
pub const DB_FILE_NAME: &str = "practice.db";

/// Schema version this build writes and understands. A database whose
/// `PRAGMA user_version` is higher was written by a newer Yames: refuse
/// it (see `DbError::Newer`) rather than guess at columns that moved.
pub const SCHEMA_VERSION: i64 = 3;

/// How long a command waits for the store to finish opening before it
/// gives up and answers as though there were no history. Opening is a
/// few milliseconds; the timeout exists so a wedged file on a network
/// drive cannot freeze the app's history tab forever.
const OPEN_WAIT: Duration = Duration::from_secs(5);

/// `meta` key marking the one-time JSON import as done. Set even when the
/// JSON history was empty — "we looked" is the fact worth recording.
const META_JSON_IMPORTED: &str = "jsonHistoryImportedAt";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub enum DbError {
    /// The file exists but is not a database this build can read —
    /// corrupt, truncated, or something else entirely.
    Unreadable(String),
    /// Written by a newer Yames. Never migrated *down*, never deleted.
    Newer { found: i64, expected: i64 },
    /// Everything else: a failed statement, a disk that filled up.
    Sqlite(String),
}

impl fmt::Display for DbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DbError::Unreadable(e) => write!(f, "practice store is not readable: {e}"),
            DbError::Newer { found, expected } => write!(
                f,
                "practice store is version {found}, this build understands {expected} — \
                 leaving it untouched"
            ),
            DbError::Sqlite(e) => write!(f, "practice store failed: {e}"),
        }
    }
}

impl From<rusqlite::Error> for DbError {
    fn from(e: rusqlite::Error) -> Self {
        // `NotADatabase` is what SQLite says about a file whose header is
        // wrong — the corruption case the gate cares about. Everything
        // else is a genuine failure of a statement we wrote.
        if let rusqlite::Error::SqliteFailure(f, _) = &e {
            if f.code == rusqlite::ErrorCode::NotADatabase
                || f.code == rusqlite::ErrorCode::DatabaseCorrupt
            {
                return DbError::Unreadable(e.to_string());
            }
        }
        DbError::Sqlite(e.to_string())
    }
}

pub type DbResult<T> = Result<T, DbError>;

// ---------------------------------------------------------------------------
// Wire types — camelCase, mirrored in `src/ipc.ts`
// ---------------------------------------------------------------------------

/// What `queryHistory` narrows by. Every field is optional; an empty
/// filter is "everything, newest first".
///
/// `since` / `until` are epoch milliseconds, matching `SavedSession.timestamp`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HistoryFilter {
    pub preset_id: Option<String>,
    /// Reserved for the curriculum (ROADMAP 2.2): the exercise a session
    /// was spent on. Nothing writes it yet, so filtering by it matches
    /// nothing — which is the honest answer, not an empty-filter answer.
    pub exercise_key: Option<String>,
    pub instrument: Option<String>,
    pub since: Option<i64>,
    pub until: Option<i64>,
    pub bpm_min: Option<u32>,
    pub bpm_max: Option<u32>,
    pub limit: Option<u32>,
}

/// One row of the song library — everything a list needs, and none of the
/// score itself. `getScore` fetches the notes, `getScoreSource` the file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreSummary {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub source_file: String,
    pub format: String,
    pub track_index: i64,
    pub track_name: String,
    pub imported_at: i64,
    /// What the player calls this song, when they have renamed it. `None`
    /// means "the title it came with" — the library shows `title` then, and
    /// a rename never rewrites what is printed on the page.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// The handful of fields the store lifts out of a `SongScore` so a song
/// can be listed without parsing every note.
///
/// Deliberately *not* the whole contract type: `src-tauri/src/score.rs`
/// (W1b) owns that, and the store has no business forking it. Everything
/// else about the score is kept verbatim in the `json` column and handed
/// back byte for byte.
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ScoreMeta {
    id: String,
    title: String,
    artist: String,
    source: ScoreMetaSource,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ScoreMetaSource {
    file_name: String,
    format: String,
    track_index: i64,
    track_name: String,
}

/// One expected onset's verdict inside an attempt. Mirrors the wave
/// contract's `OnsetResult` field for field (`BRIEF.md`); named for where
/// it is stored so it cannot be confused with the analyzer's own type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttemptOnset {
    /// `ExpectedOnset.id` — an index into the score's schedule.
    pub id: i64,
    /// `"hit"` | `"miss"` | `"softAbsent"`. Stored as text rather than an
    /// enum so a state added by a later scoring pass survives a round
    /// trip through an older build's store.
    pub state: String,
    pub deviation_ms: Option<f64>,
    pub pass: i64,
    /// Whether an accent the page wrote actually came out louder.
    ///
    /// `None` is the honest and the common answer — no accent was written,
    /// the note was not played, the amplitudes around it were unusable — and
    /// is what every row stored before this column existed says. Skipped when
    /// absent so a row with nothing to report does not grow a null on the
    /// wire. Reported and never scored while `LP C3` is open.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accent_heard: Option<bool>,
}

/// A promise the coach made: come back to this passage on this day.
///
/// One per passage — the same song and the same two bar numbers — because
/// pressing "come back to this" twice on the same bars moves the date rather
/// than growing a list. A promise about bars 17–24 is not a promise about
/// bars 17–20; the coach made each of them about something it had judged.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreDue {
    pub score_id: String,
    /// Played-bar indices, inclusive — the numbering the transport takes.
    pub range_start_bar: i64,
    pub range_end_bar: i64,
    /// Days since the Unix epoch, in the player's own local time. `srs.rs`'s
    /// unit: "due today" is a question about a calendar, and an item due at
    /// 09:00 that somebody picks up at 08:45 is due.
    pub due_day: i64,
    /// Why the coach asked, as the finding's own kind. `None` when nothing
    /// said — an older row, or a promise made by hand.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// An onset the player produced that the score did not ask for.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttemptExtra {
    /// Quarter notes from the start of the played range.
    pub beat: f64,
    pub pass: i64,
}

/// One pass at a range of bars of one song.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attempt {
    pub id: String,
    pub score_id: String,
    /// The practice session this attempt belonged to, when there was one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    /// Epoch milliseconds.
    pub started_at: i64,
    /// Inclusive, in played-bar indices (`SongScore.bars[].index`).
    pub range_start_bar: i64,
    pub range_end_bar: i64,
    /// Percentage of the score's own tempo the attempt was played at.
    pub tempo_percent: f64,
    /// Times round the loop.
    pub passes: i64,
    pub score: f64,
    pub hits: i64,
    pub misses: i64,
    pub extras: i64,
    pub mean_dev_ms: f64,
    pub mad_ms: f64,
    /// Recording of the attempt, when the player kept one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub take_path: Option<String>,
    /// Empty unless the query asked for onsets — see `AttemptQuery`.
    #[serde(default)]
    pub onsets: Vec<AttemptOnset>,
    #[serde(default)]
    pub extra_onsets: Vec<AttemptExtra>,
}

/// A range of played bars, inclusive at both ends.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BarRange {
    pub start_bar: i64,
    pub end_bar: i64,
}

/// What `queryAttempts` asks for.
///
/// `bar_range` selects attempts that *overlap* the range rather than ones
/// that match it exactly: a full run-through of the song did cover bars
/// 17–24, and the coach comparing tonight's loop against it should see it.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AttemptQuery {
    pub score_id: String,
    pub bar_range: Option<BarRange>,
    /// Per-onset verdicts are the biggest thing in the store; a list of
    /// attempts does not want them and the timing gate is measured
    /// without them. Ask when you are about to colour a tab.
    pub include_onsets: bool,
    pub limit: Option<u32>,
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

/// v1 — everything ROADMAP 1.1 names, plus the Songs tables this wave
/// needs. One migration because there has never been a shipped schema to
/// migrate *from*; the JSON history is imported, not migrated.
const MIGRATION_V1: &str = r#"
CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- One practice session. The typed columns answer questions; `report_json`
-- is the `SessionReport` exactly as the frontend wrote it, and is what
-- comes back out, so the wire shape can never drift from the columns.
CREATE TABLE sessions (
    id                    TEXT PRIMARY KEY,
    started_at            INTEGER NOT NULL,
    ended_at              INTEGER,
    instrument            TEXT,
    preset_id             TEXT,
    preset_name           TEXT,
    exercise_key          TEXT,
    bpm_start             INTEGER NOT NULL,
    bpm_end               INTEGER,
    time_signature        INTEGER,
    subdivision           INTEGER,
    beat_groups           TEXT,
    score                 INTEGER,
    ic                    REAL,
    ga                    REAL,
    hc                    REAL,
    oe                    REAL,
    mean_dev_ms           REAL,
    mad_ms                REAL,
    calibration_offset_ms REAL,
    play_mode             TEXT,
    narrative             TEXT,
    log_path              TEXT,
    report_json           TEXT NOT NULL,
    segments_json         TEXT
);
CREATE INDEX sessions_started_at ON sessions(started_at DESC);
CREATE INDEX sessions_preset     ON sessions(preset_id, started_at DESC);
CREATE INDEX sessions_instrument ON sessions(instrument, started_at DESC);
CREATE INDEX sessions_bpm        ON sessions(bpm_start, started_at DESC);

CREATE TABLE segments (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id           TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    idx                  INTEGER NOT NULL,
    start_ms             INTEGER,
    end_ms               INTEGER,
    bpm                  INTEGER,
    end_bpm              INTEGER,
    mode                 TEXT,
    inferred_divisor     INTEGER,
    divisor_confidence   REAL,
    score                REAL,
    ic                   REAL,
    ga                   REAL,
    hc                   REAL,
    oe                   REAL,
    end_reason           TEXT,
    interval_errors_json TEXT
);
CREATE INDEX segments_session ON segments(session_id, idx);

-- ROADMAP 2.5 — the tempo a player owns per exercise, and when to ask
-- for it again. Nothing writes these yet.
CREATE TABLE exercise_ceilings (
    instrument       TEXT NOT NULL,
    exercise_key     TEXT NOT NULL,
    comfortable_bpm  INTEGER,
    peak_bpm         INTEGER,
    last_practiced   INTEGER,
    next_review_due  INTEGER,
    ease             REAL,
    interval_days    REAL,
    reps             INTEGER,
    PRIMARY KEY (instrument, exercise_key)
);
CREATE INDEX exercise_ceilings_due ON exercise_ceilings(next_review_due);

-- ROADMAP 2.6.
CREATE TABLE routines (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    json       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    source     TEXT
);
CREATE TABLE routine_runs (
    id                TEXT PRIMARY KEY,
    routine_id        TEXT REFERENCES routines(id) ON DELETE CASCADE,
    session_id        TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    step_results_json TEXT
);
CREATE INDEX routine_runs_routine ON routine_runs(routine_id);

-- Coach utterances, interventions, chips (ROADMAP 3.4).
CREATE TABLE events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    ts_ms        INTEGER NOT NULL,
    kind         TEXT NOT NULL,
    payload_json TEXT
);
CREATE INDEX events_session ON events(session_id, ts_ms);

-- One imported song. `json` is the whole `SongScore`; the columns beside
-- it are only what a library list shows.
CREATE TABLE scores (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    artist      TEXT NOT NULL,
    source_file TEXT NOT NULL,
    format      TEXT NOT NULL,
    track_index INTEGER NOT NULL,
    track_name  TEXT NOT NULL,
    imported_at INTEGER NOT NULL,
    json        TEXT NOT NULL
);
CREATE INDEX scores_imported_at ON scores(imported_at DESC);

CREATE TABLE attempts (
    id              TEXT PRIMARY KEY,
    score_id        TEXT NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
    session_id      TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    started_at      INTEGER NOT NULL,
    range_start_bar INTEGER NOT NULL,
    range_end_bar   INTEGER NOT NULL,
    tempo_percent   REAL NOT NULL,
    passes          INTEGER NOT NULL,
    score           REAL NOT NULL,
    hits            INTEGER NOT NULL,
    misses          INTEGER NOT NULL,
    extras          INTEGER NOT NULL,
    mean_dev_ms     REAL NOT NULL,
    mad_ms          REAL NOT NULL,
    take_path       TEXT
);
-- "Every attempt at bars 17–24 of this song, oldest first."
CREATE INDEX attempts_score_range
    ON attempts(score_id, range_start_bar, range_end_bar, started_at);
CREATE INDEX attempts_session ON attempts(session_id);

CREATE TABLE attempt_onsets (
    attempt_id   TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    onset_id     INTEGER NOT NULL,
    pass         INTEGER NOT NULL,
    state        TEXT NOT NULL,
    deviation_ms REAL
);
CREATE INDEX attempt_onsets_attempt ON attempt_onsets(attempt_id, pass, onset_id);
-- "This note's history" — every verdict this expected onset ever got.
CREATE INDEX attempt_onsets_onset ON attempt_onsets(onset_id, attempt_id);

CREATE TABLE attempt_extras (
    attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    pass       INTEGER NOT NULL,
    beat       REAL NOT NULL
);
CREATE INDEX attempt_extras_attempt ON attempt_extras(attempt_id, pass);
"#;

/// v2 — the two things a song carries that are not part of its score.
///
/// The library used to live in `songs.json` beside the settings, and it kept
/// three fields the `SongScore` contract has no room for: the name the player
/// gave the song, and the bytes of the file it came from. The name is not the
/// score's `title` — renaming a song in the library must not rewrite the
/// title printed on the page — and the bytes are how the tab is drawn at all
/// (`SONGS.md` A2: alphaTab engraves from the source, and a score knows every
/// note's tick and fret but not how the page was laid out).
///
/// Columns and not extra keys inside `json`, because that column is a
/// `SongScore` and `score.rs` is the contract for what one is. Anything the
/// store needs to know that the contract does not carry belongs beside it.
///
/// A separate migration, and migration one is left exactly as it shipped:
/// v1 databases exist on this machine already.
const MIGRATION_V2: &str = r#"
ALTER TABLE scores ADD COLUMN display_name TEXT;
ALTER TABLE scores ADD COLUMN source_b64   TEXT;
"#;

/// v3 — what the coach heard, and what it promised.
///
/// Two things, both of which had nowhere to live and were being kept
/// somewhere that could not hold them.
///
/// `attempt_onsets.accent_heard` is the scorer's own verdict on an accent the
/// page wrote (`score.rs`, `ACCENT_LOUDER_BY`): `1` it came out louder, `0` it
/// did not, and NULL when there was nothing to say — no accent written, the
/// note was not played, the amplitudes around it were unusable. Nullable for
/// that reason and not for the storage: "I did not hear it" and "there was
/// nothing to hear" are different facts and a review that drew a quiet mark
/// for the second would be accusing a player of missing an accent nobody
/// wrote. Every row already on disk is NULL, which is exactly right — the
/// store did not keep accents when they were written.
///
/// `score_due` is "come back to this" (`COACH_UX.md` A5). It was four keys in
/// `settings.json`, which `src/songs/due.ts` said at the time was where it
/// belonged until there was a schema; this is the schema. One promise per
/// passage, so the primary key is the passage: pressing the button twice on
/// the same bars moves the date rather than growing a list nobody asked for,
/// and the database enforces that rather than the frontend remembering to.
/// `reason` is why the coach asked — the finding's own kind — so the
/// notebook (C1) can one day say what the promise was about rather than only
/// when it falls due.
///
/// Its own migration. One and two are left exactly as they shipped: v1 and v2
/// databases exist on this machine already.
const MIGRATION_V3: &str = r#"
ALTER TABLE attempt_onsets ADD COLUMN accent_heard INTEGER;

CREATE TABLE score_due (
    score_id        TEXT NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
    range_start_bar INTEGER NOT NULL,
    range_end_bar   INTEGER NOT NULL,
    due_day         INTEGER NOT NULL,
    reason          TEXT,
    PRIMARY KEY (score_id, range_start_bar, range_end_bar)
);
-- "What is due today or overdue", which is the only question the library asks.
CREATE INDEX score_due_day ON score_due(due_day);
"#;

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

pub struct Db {
    conn: Connection,
    path: PathBuf,
}

impl Db {
    /// Open (creating if absent), check the version, migrate to
    /// `SCHEMA_VERSION`. Never deletes, never truncates, never downgrades.
    pub fn open(path: &Path) -> DbResult<Db> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| DbError::Sqlite(format!("create {}: {e}", parent.display())))?;
        }
        let conn = Connection::open(path).map_err(DbError::from)?;
        Db::from_connection(conn, path.to_path_buf())
    }

    /// In-memory store. Tests only — and the reason every query in this
    /// module takes a connection rather than an `AppHandle`.
    #[cfg(test)]
    pub fn open_in_memory() -> DbResult<Db> {
        let conn = Connection::open_in_memory().map_err(DbError::from)?;
        Db::from_connection(conn, PathBuf::from(":memory:"))
    }

    fn from_connection(conn: Connection, path: PathBuf) -> DbResult<Db> {
        conn.busy_timeout(Duration::from_secs(5))
            .map_err(DbError::from)?;
        // WAL so a long read (the coach rolling up a year) never blocks the
        // write that ends a session. `journal_mode` answers with a row, so
        // it cannot go through `pragma_update`.
        //
        // An in-memory database refuses WAL; that is not a failure worth
        // returning, so the result is read and dropped.
        let _: Result<String, _> = conn.query_row("PRAGMA journal_mode=WAL", [], |r| r.get(0));
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(DbError::from)?;

        // The first read of the file's header. A corrupt file fails here,
        // before anything has been written to it.
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .map_err(DbError::from)?;

        if version > SCHEMA_VERSION {
            return Err(DbError::Newer {
                found: version,
                expected: SCHEMA_VERSION,
            });
        }

        let mut db = Db { conn, path };
        db.migrate(version)?;
        Ok(db)
    }

    fn migrate(&mut self, from: i64) -> DbResult<()> {
        if from >= SCHEMA_VERSION {
            return Ok(());
        }
        let tx = self.conn.transaction().map_err(DbError::from)?;
        if from < 1 {
            tx.execute_batch(MIGRATION_V1).map_err(DbError::from)?;
        }
        if from < 2 {
            tx.execute_batch(MIGRATION_V2).map_err(DbError::from)?;
        }
        if from < 3 {
            tx.execute_batch(MIGRATION_V3).map_err(DbError::from)?;
        }
        // `user_version` is a pragma, not a statement, so it is set on the
        // connection rather than inside the batch — but still before the
        // commit, so a failure halfway leaves the file at its old version
        // with none of the new tables.
        tx.pragma_update(None, "user_version", SCHEMA_VERSION)
            .map_err(DbError::from)?;
        tx.commit().map_err(DbError::from)?;
        Ok(())
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// What SQLite says it will do with a statement. Tests only — it is
    /// how the index gate asserts something a busy machine cannot spoil.
    #[cfg(test)]
    fn explain(&self, sql: &str, args: &[Box<dyn rusqlite::ToSql>]) -> String {
        let params: Vec<&dyn rusqlite::ToSql> = args.iter().map(|b| b.as_ref()).collect();
        let mut stmt = self
            .conn
            .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
            .expect("the plan of a statement we wrote");
        let rows = stmt
            .query_map(params.as_slice(), |r| r.get::<_, String>(3))
            .expect("plan rows");
        rows.map(|r| r.expect("a plan row"))
            .collect::<Vec<_>>()
            .join(" | ")
    }

    // -- meta -------------------------------------------------------------

    fn meta_get(&self, key: &str) -> DbResult<Option<String>> {
        self.conn
            .query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0))
            .optional()
            .map_err(DbError::from)
    }

    fn meta_set(&self, key: &str, value: &str) -> DbResult<()> {
        self.conn
            .execute(
                "INSERT INTO meta(key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                rusqlite::params![key, value],
            )
            .map_err(DbError::from)?;
        Ok(())
    }

    // -- sessions ---------------------------------------------------------

    /// Write one session. Re-saving the same id replaces the row (and its
    /// segments): the frontend saves a session once, but a retry after a
    /// failed save must not produce two of it.
    ///
    /// `instrument` comes from the app's current state — `SavedSession`
    /// has never carried one, and adding a field to it would change a wire
    /// shape this wave promised not to touch.
    pub fn save_session(&mut self, session: &SavedSession, instrument: Option<&str>) -> DbResult<()> {
        let report_json =
            serde_json::to_string(&session.report).map_err(|e| DbError::Sqlite(e.to_string()))?;
        let segments_json = match &session.segments {
            Some(v) => Some(serde_json::to_string(v).map_err(|e| DbError::Sqlite(e.to_string()))?),
            None => None,
        };
        let r = &session.report;
        let play_mode = r
            .play_mode
            .and_then(|m| serde_json::to_value(m).ok())
            .and_then(|v| v.as_str().map(str::to_string));

        let tx = self.conn.transaction().map_err(DbError::from)?;
        tx.execute(
            "INSERT INTO sessions (
                 id, started_at, ended_at, instrument, preset_id, preset_name, exercise_key,
                 bpm_start, bpm_end, time_signature, subdivision, beat_groups, score,
                 ic, ga, hc, oe, mean_dev_ms, mad_ms, calibration_offset_ms,
                 play_mode, narrative, log_path, report_json, segments_json
             ) VALUES (
                 ?1, ?2, NULL, ?3, ?4, ?5, NULL,
                 ?6, ?6, ?7, ?8, NULL, ?9,
                 ?10, ?11, ?12, ?13, ?14, ?15, NULL,
                 ?16, NULL, NULL, ?17, ?18
             )
             ON CONFLICT(id) DO UPDATE SET
                 started_at = excluded.started_at,
                 instrument = excluded.instrument,
                 preset_id = excluded.preset_id,
                 preset_name = excluded.preset_name,
                 bpm_start = excluded.bpm_start,
                 bpm_end = excluded.bpm_end,
                 time_signature = excluded.time_signature,
                 subdivision = excluded.subdivision,
                 score = excluded.score,
                 ic = excluded.ic, ga = excluded.ga, hc = excluded.hc, oe = excluded.oe,
                 mean_dev_ms = excluded.mean_dev_ms,
                 mad_ms = excluded.mad_ms,
                 play_mode = excluded.play_mode,
                 report_json = excluded.report_json,
                 segments_json = excluded.segments_json",
            rusqlite::params![
                session.id,
                session.timestamp as i64,
                instrument,
                session.preset_id,
                session.preset_name,
                session.bpm as i64,
                session.time_signature as i64,
                r.subdivision as i64,
                r.score as i64,
                r.interval_consistency,
                r.grid_alignment,
                r.hit_completeness,
                r.onset_efficiency,
                r.mean_deviation_ms,
                r.mean_abs_deviation_ms,
                play_mode,
                report_json,
                segments_json,
            ],
        )
        .map_err(DbError::from)?;

        // Segments are rewritten wholesale on a re-save; they are derived
        // from the same payload, so there is nothing to preserve.
        tx.execute("DELETE FROM segments WHERE session_id = ?1", [&session.id])
            .map_err(DbError::from)?;
        if let Some(segments) = session.segments.as_ref().and_then(|v| v.as_array()) {
            let mut stmt = tx
                .prepare(
                    "INSERT INTO segments (
                         session_id, idx, start_ms, end_ms, bpm, end_bpm, mode,
                         inferred_divisor, divisor_confidence, score, ic, ga, hc, oe,
                         end_reason, interval_errors_json
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, NULL, NULL, ?7, ?8, ?9, ?10, ?11, NULL, NULL)",
                )
                .map_err(DbError::from)?;
            for (idx, seg) in segments.iter().enumerate() {
                let rep = seg.get("report");
                let num = |key: &str| rep.and_then(|r| r.get(key)).and_then(|v| v.as_f64());
                stmt.execute(rusqlite::params![
                    session.id,
                    idx as i64,
                    seg.get("startTime").and_then(|v| v.as_f64()),
                    seg.get("endTime").and_then(|v| v.as_f64()),
                    seg.get("bpm").and_then(|v| v.as_i64()),
                    seg.get("mode").and_then(|v| v.as_str()),
                    num("score"),
                    num("intervalConsistency"),
                    num("gridAlignment"),
                    num("hitCompleteness"),
                    num("onsetEfficiency"),
                ])
                .map_err(DbError::from)?;
            }
        }
        tx.commit().map_err(DbError::from)?;
        Ok(())
    }

    /// Newest first, capped at `limit`. The shape `get_session_history`
    /// has always returned.
    pub fn session_history(&self, limit: usize) -> DbResult<Vec<SavedSession>> {
        self.query_history(&HistoryFilter {
            limit: Some(limit as u32),
            ..Default::default()
        })
    }

    /// Narrowed history, newest first. Returns whole `SavedSession`s so
    /// `presetAwareness.ts` and the coach can be fed rows without knowing
    /// anything about SQL.
    pub fn query_history(&self, filter: &HistoryFilter) -> DbResult<Vec<SavedSession>> {
        let (sql, args) = history_sql(filter);
        let mut stmt = self.conn.prepare(&sql).map_err(DbError::from)?;
        let params: Vec<&dyn rusqlite::ToSql> = args.iter().map(|b| b.as_ref()).collect();
        let rows = stmt
            .query_map(params.as_slice(), |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<String>>(7)?,
                ))
            })
            .map_err(DbError::from)?;

        let mut out = Vec::new();
        for row in rows {
            let (id, ts, bpm, sig, preset_id, preset_name, report_json, segments_json) =
                row.map_err(DbError::from)?;
            // A row whose report will not parse is skipped, not fatal: one
            // unreadable session must not blank the whole history.
            let Ok(report) = serde_json::from_str::<SessionReport>(&report_json) else {
                eprintln!("[store] session {id} has an unreadable report — skipping it");
                continue;
            };
            out.push(SavedSession {
                id,
                timestamp: ts.max(0) as u64,
                bpm: bpm.clamp(0, u16::MAX as i64) as u16,
                time_signature: sig.clamp(0, u8::MAX as i64) as u8,
                report,
                preset_id,
                preset_name,
                segments: segments_json.and_then(|s| serde_json::from_str(&s).ok()),
            });
        }
        Ok(out)
    }

    pub fn delete_session(&self, id: &str) -> DbResult<()> {
        self.conn
            .execute("DELETE FROM sessions WHERE id = ?1", [id])
            .map_err(DbError::from)?;
        Ok(())
    }

    /// "Forget what I played." Sessions, their segments and events, and
    /// every attempt at a song — all of it practice history.
    ///
    /// The song library survives: an imported score is a file the player
    /// brought, closer to a preset than to a record of a Tuesday, and
    /// deleting it here would be a surprise nobody asked for.
    pub fn clear_all_sessions(&mut self) -> DbResult<()> {
        let tx = self.conn.transaction().map_err(DbError::from)?;
        // `attempt_onsets` / `attempt_extras` / `segments` / `events` go
        // with their parents through ON DELETE CASCADE.
        tx.execute("DELETE FROM attempts", []).map_err(DbError::from)?;
        tx.execute("DELETE FROM sessions", []).map_err(DbError::from)?;
        tx.commit().map_err(DbError::from)?;
        Ok(())
    }

    // -- the one-time import ---------------------------------------------

    /// Fold the `evalSessionHistory` array from `settings.json` into the
    /// store, once.
    ///
    /// Idempotent twice over: it does nothing at all if the `meta` flag is
    /// already set, and every insert is an `INSERT OR IGNORE` on the
    /// session id, so even a flag lost to a crash mid-import cannot
    /// duplicate a session. Returns how many rows it added.
    ///
    /// The caller passes the parsed array. Nothing here reads or writes
    /// `settings.json` — the JSON stays exactly as it was.
    pub fn import_json_history(&mut self, sessions: &[SavedSession]) -> DbResult<usize> {
        if self.meta_get(META_JSON_IMPORTED)?.is_some() {
            return Ok(0);
        }
        let mut added = 0usize;
        for session in sessions {
            let existing: Option<i64> = self
                .conn
                .query_row("SELECT 1 FROM sessions WHERE id = ?1", [&session.id], |r| {
                    r.get(0)
                })
                .optional()
                .map_err(DbError::from)?;
            if existing.is_some() {
                continue;
            }
            // The JSON history never carried an instrument.
            self.save_session(session, None)?;
            added += 1;
        }
        self.meta_set(
            META_JSON_IMPORTED,
            &crate::clock::now_ns().to_string(),
        )?;
        Ok(added)
    }

    /// Whether the one-time import has already run.
    pub fn json_history_imported(&self) -> bool {
        self.meta_get(META_JSON_IMPORTED)
            .ok()
            .flatten()
            .is_some()
    }

    // -- songs ------------------------------------------------------------

    /// Store a `SongScore` whole. Re-importing the same song (same id —
    /// the contract makes it a hash of the source bytes and the track)
    /// replaces it and keeps every attempt at it, because it is the same
    /// song: the id is what "same" means.
    ///
    /// `name` is what the player calls it and `source_b64` the bytes of the
    /// file it was read from, both optional and both `COALESCE`d on a
    /// re-import: a caller that passes `None` is saying nothing about that
    /// field, not asking for it to be cleared. Re-importing a file the
    /// player has renamed therefore keeps the name, which is the behaviour
    /// the library has always had.
    pub fn save_score(
        &self,
        score: &serde_json::Value,
        name: Option<&str>,
        source_b64: Option<&str>,
        imported_at: i64,
    ) -> DbResult<String> {
        let meta: ScoreMeta = serde_json::from_value(score.clone())
            .map_err(|e| DbError::Sqlite(format!("score is not a SongScore: {e}")))?;
        if meta.id.trim().is_empty() {
            return Err(DbError::Sqlite("score has no id".into()));
        }
        let json = serde_json::to_string(score).map_err(|e| DbError::Sqlite(e.to_string()))?;
        self.conn
            .execute(
                "INSERT INTO scores (id, title, artist, source_file, format,
                                     track_index, track_name, imported_at, json,
                                     display_name, source_b64)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                 ON CONFLICT(id) DO UPDATE SET
                     title = excluded.title, artist = excluded.artist,
                     source_file = excluded.source_file, format = excluded.format,
                     track_index = excluded.track_index, track_name = excluded.track_name,
                     imported_at = excluded.imported_at, json = excluded.json,
                     display_name = COALESCE(excluded.display_name, scores.display_name),
                     source_b64 = COALESCE(excluded.source_b64, scores.source_b64)",
                rusqlite::params![
                    meta.id,
                    meta.title,
                    meta.artist,
                    meta.source.file_name,
                    meta.source.format,
                    meta.source.track_index,
                    meta.source.track_name,
                    imported_at,
                    json,
                    name,
                    source_b64,
                ],
            )
            .map_err(DbError::from)?;
        Ok(meta.id)
    }

    /// The library, most recently imported first.
    pub fn list_scores(&self) -> DbResult<Vec<ScoreSummary>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, title, artist, source_file, format, track_index, track_name,
                        imported_at, display_name
                 FROM scores ORDER BY imported_at DESC, title ASC",
            )
            .map_err(DbError::from)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(ScoreSummary {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    artist: r.get(2)?,
                    source_file: r.get(3)?,
                    format: r.get(4)?,
                    track_index: r.get(5)?,
                    track_name: r.get(6)?,
                    imported_at: r.get(7)?,
                    name: r.get(8)?,
                })
            })
            .map_err(DbError::from)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(DbError::from)
    }

    pub fn get_score(&self, id: &str) -> DbResult<Option<serde_json::Value>> {
        let json: Option<String> = self
            .conn
            .query_row("SELECT json FROM scores WHERE id = ?1", [id], |r| r.get(0))
            .optional()
            .map_err(DbError::from)?;
        match json {
            Some(j) => Ok(Some(
                serde_json::from_str(&j).map_err(|e| DbError::Sqlite(e.to_string()))?,
            )),
            None => Ok(None),
        }
    }

    /// The bytes of the file a song was read from, base64.
    ///
    /// Its own query and not a field on the summary or the score: it is the
    /// biggest thing on the row, the list never wants it, and the contract
    /// type has no room for it. `None` both for a song nobody kept the file
    /// for and for a song that is not there — the caller's next move is the
    /// same either way, which is to draw no tab.
    pub fn get_score_source(&self, id: &str) -> DbResult<Option<String>> {
        self.conn
            .query_row("SELECT source_b64 FROM scores WHERE id = ?1", [id], |r| {
                r.get::<_, Option<String>>(0)
            })
            .optional()
            .map(|found| found.flatten())
            .map_err(DbError::from)
    }

    /// Delete a song, and with it every attempt at it (cascade).
    pub fn delete_score(&self, id: &str) -> DbResult<()> {
        self.conn
            .execute("DELETE FROM scores WHERE id = ?1", [id])
            .map_err(DbError::from)?;
        Ok(())
    }

    // -- attempts ---------------------------------------------------------

    /// Write one attempt with its per-onset verdicts. Replaces an attempt
    /// of the same id, verdicts included.
    pub fn save_attempt(&mut self, attempt: &Attempt) -> DbResult<()> {
        let tx = self.conn.transaction().map_err(DbError::from)?;
        tx.execute(
            "INSERT INTO attempts (
                 id, score_id, session_id, started_at, range_start_bar, range_end_bar,
                 tempo_percent, passes, score, hits, misses, extras, mean_dev_ms, mad_ms, take_path
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
             ON CONFLICT(id) DO UPDATE SET
                 score_id = excluded.score_id, session_id = excluded.session_id,
                 started_at = excluded.started_at,
                 range_start_bar = excluded.range_start_bar,
                 range_end_bar = excluded.range_end_bar,
                 tempo_percent = excluded.tempo_percent, passes = excluded.passes,
                 score = excluded.score, hits = excluded.hits, misses = excluded.misses,
                 extras = excluded.extras, mean_dev_ms = excluded.mean_dev_ms,
                 mad_ms = excluded.mad_ms, take_path = excluded.take_path",
            rusqlite::params![
                attempt.id,
                attempt.score_id,
                attempt.session_id,
                attempt.started_at,
                attempt.range_start_bar,
                attempt.range_end_bar,
                attempt.tempo_percent,
                attempt.passes,
                attempt.score,
                attempt.hits,
                attempt.misses,
                attempt.extras,
                attempt.mean_dev_ms,
                attempt.mad_ms,
                attempt.take_path,
            ],
        )
        .map_err(DbError::from)?;
        tx.execute(
            "DELETE FROM attempt_onsets WHERE attempt_id = ?1",
            [&attempt.id],
        )
        .map_err(DbError::from)?;
        tx.execute(
            "DELETE FROM attempt_extras WHERE attempt_id = ?1",
            [&attempt.id],
        )
        .map_err(DbError::from)?;
        {
            let mut stmt = tx
                .prepare(
                    "INSERT INTO attempt_onsets
                         (attempt_id, onset_id, pass, state, deviation_ms, accent_heard)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                )
                .map_err(DbError::from)?;
            for o in &attempt.onsets {
                stmt.execute(rusqlite::params![
                    attempt.id,
                    o.id,
                    o.pass,
                    o.state,
                    o.deviation_ms,
                    o.accent_heard,
                ])
                .map_err(DbError::from)?;
            }
        }
        {
            let mut stmt = tx
                .prepare("INSERT INTO attempt_extras (attempt_id, pass, beat) VALUES (?1, ?2, ?3)")
                .map_err(DbError::from)?;
            for e in &attempt.extra_onsets {
                stmt.execute(rusqlite::params![attempt.id, e.pass, e.beat])
                    .map_err(DbError::from)?;
            }
        }
        tx.commit().map_err(DbError::from)?;
        Ok(())
    }

    /// Attempts at a song, **oldest first** — the order the question
    /// "how has this range gone over time" wants to be answered in.
    pub fn query_attempts(&self, query: &AttemptQuery) -> DbResult<Vec<Attempt>> {
        let (sql, args) = attempts_sql(query);
        let mut stmt = self.conn.prepare(&sql).map_err(DbError::from)?;
        let params: Vec<&dyn rusqlite::ToSql> = args.iter().map(|b| b.as_ref()).collect();
        let rows = stmt
            .query_map(params.as_slice(), |r| {
                Ok(Attempt {
                    id: r.get(0)?,
                    score_id: r.get(1)?,
                    session_id: r.get(2)?,
                    started_at: r.get(3)?,
                    range_start_bar: r.get(4)?,
                    range_end_bar: r.get(5)?,
                    tempo_percent: r.get(6)?,
                    passes: r.get(7)?,
                    score: r.get(8)?,
                    hits: r.get(9)?,
                    misses: r.get(10)?,
                    extras: r.get(11)?,
                    mean_dev_ms: r.get(12)?,
                    mad_ms: r.get(13)?,
                    take_path: r.get(14)?,
                    onsets: Vec::new(),
                    extra_onsets: Vec::new(),
                })
            })
            .map_err(DbError::from)?;
        let mut out = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(DbError::from)?;

        if query.include_onsets && !out.is_empty() {
            self.attach_onsets(&mut out)?;
        }
        Ok(out)
    }

    /// Load the per-onset verdicts for a page of attempts in two
    /// statements rather than two per attempt.
    fn attach_onsets(&self, attempts: &mut [Attempt]) -> DbResult<()> {
        let ids: Vec<String> = attempts.iter().map(|a| a.id.clone()).collect();
        let placeholders = vec!["?"; ids.len()].join(",");
        let params: Vec<&dyn rusqlite::ToSql> =
            ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();

        let mut onsets: HashMap<String, Vec<AttemptOnset>> = HashMap::new();
        {
            let sql = format!(
                "SELECT attempt_id, onset_id, pass, state, deviation_ms, accent_heard
                 FROM attempt_onsets
                 WHERE attempt_id IN ({placeholders}) ORDER BY pass ASC, onset_id ASC"
            );
            let mut stmt = self.conn.prepare(&sql).map_err(DbError::from)?;
            let rows = stmt
                .query_map(params.as_slice(), |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        AttemptOnset {
                            id: r.get(1)?,
                            pass: r.get(2)?,
                            state: r.get(3)?,
                            deviation_ms: r.get(4)?,
                            accent_heard: r.get(5)?,
                        },
                    ))
                })
                .map_err(DbError::from)?;
            for row in rows {
                let (attempt_id, onset) = row.map_err(DbError::from)?;
                onsets.entry(attempt_id).or_default().push(onset);
            }
        }

        let mut extras: HashMap<String, Vec<AttemptExtra>> = HashMap::new();
        {
            let sql = format!(
                "SELECT attempt_id, pass, beat FROM attempt_extras
                 WHERE attempt_id IN ({placeholders}) ORDER BY pass ASC, beat ASC"
            );
            let mut stmt = self.conn.prepare(&sql).map_err(DbError::from)?;
            let rows = stmt
                .query_map(params.as_slice(), |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        AttemptExtra {
                            pass: r.get(1)?,
                            beat: r.get(2)?,
                        },
                    ))
                })
                .map_err(DbError::from)?;
            for row in rows {
                let (attempt_id, extra) = row.map_err(DbError::from)?;
                extras.entry(attempt_id).or_default().push(extra);
            }
        }

        for attempt in attempts.iter_mut() {
            attempt.onsets = onsets.remove(&attempt.id).unwrap_or_default();
            attempt.extra_onsets = extras.remove(&attempt.id).unwrap_or_default();
        }
        Ok(())
    }

    // -- come back to this -------------------------------------------------

    /// Write a promise down, or move the day of one already made.
    ///
    /// Upsert on the passage rather than insert, because the passage is what
    /// a promise is about: the coach asking twice about bars 17–24 means the
    /// second date, not two reminders.
    pub fn save_due(&mut self, due: &ScoreDue) -> DbResult<()> {
        self.conn
            .execute(
                "INSERT INTO score_due
                     (score_id, range_start_bar, range_end_bar, due_day, reason)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(score_id, range_start_bar, range_end_bar) DO UPDATE SET
                     due_day = excluded.due_day, reason = excluded.reason",
                rusqlite::params![
                    due.score_id,
                    due.range_start_bar,
                    due.range_end_bar,
                    due.due_day,
                    due.reason,
                ],
            )
            .map(|_| ())
            .map_err(DbError::from)
    }

    /// Every promise on file, the soonest due first.
    ///
    /// The whole list rather than "what is due today": the caller knows what
    /// day it is in the player's own timezone and the database does not, and
    /// a store that decided would be deciding in UTC.
    pub fn list_due(&self) -> DbResult<Vec<ScoreDue>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT score_id, range_start_bar, range_end_bar, due_day, reason
                 FROM score_due ORDER BY due_day ASC, score_id ASC",
            )
            .map_err(DbError::from)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(ScoreDue {
                    score_id: r.get(0)?,
                    range_start_bar: r.get(1)?,
                    range_end_bar: r.get(2)?,
                    due_day: r.get(3)?,
                    reason: r.get(4)?,
                })
            })
            .map_err(DbError::from)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(DbError::from)
    }

    /// Forget one — the player played it, or does not want the reminder.
    pub fn clear_due(&mut self, score_id: &str, start_bar: i64, end_bar: i64) -> DbResult<()> {
        self.conn
            .execute(
                "DELETE FROM score_due
                 WHERE score_id = ?1 AND range_start_bar = ?2 AND range_end_bar = ?3",
                rusqlite::params![score_id, start_bar, end_bar],
            )
            .map(|_| ())
            .map_err(DbError::from)
    }
}

// ---------------------------------------------------------------------------
// Statement builders
//
// Separate functions rather than inline text so a test can ask SQLite for
// the *plan* of the very statement that runs in production. A wall clock
// on a machine running six hundred other tests is a measurement of the
// scheduler; "this query uses its index" is a measurement of the query.
// ---------------------------------------------------------------------------

fn history_sql(filter: &HistoryFilter) -> (String, Vec<Box<dyn rusqlite::ToSql>>) {
    let mut sql = String::from(
        "SELECT id, started_at, bpm_start, time_signature, preset_id, preset_name,
                report_json, segments_json
         FROM sessions WHERE 1 = 1",
    );
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut push = |sql: &mut String, clause: &str, v: Box<dyn rusqlite::ToSql>| {
        args.push(v);
        sql.push_str(&format!(" AND {clause} ?{}", args.len()));
    };
    if let Some(v) = &filter.preset_id {
        push(&mut sql, "preset_id =", Box::new(v.clone()));
    }
    if let Some(v) = &filter.exercise_key {
        push(&mut sql, "exercise_key =", Box::new(v.clone()));
    }
    if let Some(v) = &filter.instrument {
        push(&mut sql, "instrument =", Box::new(v.clone()));
    }
    if let Some(v) = filter.since {
        push(&mut sql, "started_at >=", Box::new(v));
    }
    if let Some(v) = filter.until {
        push(&mut sql, "started_at <=", Box::new(v));
    }
    if let Some(v) = filter.bpm_min {
        push(&mut sql, "bpm_start >=", Box::new(v as i64));
    }
    if let Some(v) = filter.bpm_max {
        push(&mut sql, "bpm_start <=", Box::new(v as i64));
    }
    sql.push_str(" ORDER BY started_at DESC, id DESC LIMIT ?");
    sql.push_str(&(args.len() + 1).to_string());
    args.push(Box::new(filter.limit.unwrap_or(u32::MAX) as i64));
    (sql, args)
}

fn attempts_sql(query: &AttemptQuery) -> (String, Vec<Box<dyn rusqlite::ToSql>>) {
    let mut sql = String::from(
        "SELECT id, score_id, session_id, started_at, range_start_bar, range_end_bar,
                tempo_percent, passes, score, hits, misses, extras, mean_dev_ms, mad_ms,
                take_path
         FROM attempts WHERE score_id = ?1",
    );
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(query.score_id.clone())];
    if let Some(range) = query.bar_range {
        // Overlap, not equality — see `AttemptQuery`.
        args.push(Box::new(range.end_bar));
        args.push(Box::new(range.start_bar));
        sql.push_str(" AND range_start_bar <= ?2 AND range_end_bar >= ?3");
    }
    sql.push_str(" ORDER BY started_at ASC, id ASC LIMIT ?");
    sql.push_str(&(args.len() + 1).to_string());
    args.push(Box::new(query.limit.unwrap_or(u32::MAX) as i64));
    (sql, args)
}

// ---------------------------------------------------------------------------
// The Tauri-side handle
// ---------------------------------------------------------------------------

enum Slot {
    /// The opener is still running. Only ever seen by a command that
    /// arrives in the first few milliseconds of the app's life.
    Opening,
    Ready(Box<Db>),
    /// Corrupt, newer, or a disk that said no. The message is logged once
    /// at open time and kept here so a command can say why.
    Unavailable(String),
}

/// Managed state wrapping the store.
///
/// # Why this is not just a `Mutex<Connection>`
///
/// W2's brief requires that opening, migrating and querying all happen off
/// the UI thread. Tauri runs a non-`async` command on the main thread, so
/// every command that touches the store is declared `#[tauri::command(async)]`
/// and runs on the async runtime's pool instead; the open itself is handed
/// to a background thread at startup so `setup()` — which *is* the main
/// thread — returns without waiting for a disk.
///
/// That leaves a window in which a command can arrive before the file is
/// open. Rather than answer "no history" and be wrong, a command waits on
/// the condvar: it is already on a worker thread, so waiting there costs
/// the UI nothing. The wait is bounded (`OPEN_WAIT`) so a pathological
/// disk degrades to an empty history instead of a frozen tab.
pub struct PracticeStore {
    slot: Mutex<Slot>,
    opened: Condvar,
}

impl Default for PracticeStore {
    fn default() -> Self {
        Self::new()
    }
}

impl PracticeStore {
    pub fn new() -> Self {
        PracticeStore {
            slot: Mutex::new(Slot::Opening),
            opened: Condvar::new(),
        }
    }

    /// Open the database, run `after_open` against it, and only then
    /// publish it. Call from a background thread; every waiting command is
    /// woken when it returns.
    ///
    /// `after_open` is where the one-time JSON import goes. It runs before
    /// the store is visible to any command, so the first `getSessionHistory`
    /// of a fresh install cannot see a half-imported history — and a
    /// `clearAllSessions` cannot race the import and be undone by it.
    pub fn open_at(&self, path: &Path, after_open: impl FnOnce(&mut Db)) {
        let result = Db::open(path);
        let slot = match result {
            Ok(mut db) => {
                after_open(&mut db);
                eprintln!("[store] practice store ready at {}", db.path().display());
                Slot::Ready(Box::new(db))
            }
            Err(e) => {
                // The file is left exactly as it is. A newer build, or the
                // user's own backup, can still read it.
                eprintln!("[store] {e} — this session will have no history");
                Slot::Unavailable(e.to_string())
            }
        };
        *self.slot.lock().unwrap_or_else(|p| p.into_inner()) = slot;
        self.opened.notify_all();
    }

    /// Mark the store as unavailable without trying to open anything —
    /// used when the app cannot even work out where its data directory is.
    pub fn unavailable(&self, why: String) {
        eprintln!("[store] {why} — this session will have no history");
        *self.slot.lock().unwrap_or_else(|p| p.into_inner()) = Slot::Unavailable(why);
        self.opened.notify_all();
    }

    /// Run `f` against the open store. `Err(reason)` when there is none —
    /// callers that read answer with nothing, callers that write say so.
    pub fn with<T>(&self, f: impl FnOnce(&mut Db) -> DbResult<T>) -> Result<T, String> {
        let mut guard = self.slot.lock().unwrap_or_else(|p| p.into_inner());
        if matches!(*guard, Slot::Opening) {
            let (g, timeout) = self
                .opened
                .wait_timeout_while(guard, OPEN_WAIT, |s| matches!(s, Slot::Opening))
                .unwrap_or_else(|p| p.into_inner());
            guard = g;
            if timeout.timed_out() {
                return Err("practice store is still opening".into());
            }
        }
        match &mut *guard {
            Slot::Ready(db) => f(db).map_err(|e| e.to_string()),
            Slot::Unavailable(why) => Err(why.clone()),
            Slot::Opening => Err("practice store is still opening".into()),
        }
    }

    /// Read helper: an unavailable store answers with `fallback` and a
    /// warning rather than an error the frontend has no way to act on.
    pub fn read_or<T>(&self, fallback: T, f: impl FnOnce(&mut Db) -> DbResult<T>) -> T {
        match self.with(f) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[store] read failed ({e}) — answering as though there were no history");
                fallback
            }
        }
    }
}

/// Where the store lives, given the app's data directory.
pub fn db_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(DB_FILE_NAME)
}

pub type SharedPracticeStore = std::sync::Arc<PracticeStore>;

pub fn create_shared_practice_store() -> SharedPracticeStore {
    std::sync::Arc::new(PracticeStore::new())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    /// The fixture history — the shapes `session.rs` writes, including one
    /// record from before `presetId` and `segments` existed.
    ///
    /// A fixture rather than the owner's real `settings.json`: a test that
    /// reads a developer's data directory passes on their machine and
    /// nowhere else, and reads a file it has no business opening.
    const FIXTURE_HISTORY: &str = include_str!("../fixtures/session_history.json");

    fn fixture_sessions() -> Vec<SavedSession> {
        serde_json::from_str(FIXTURE_HISTORY).expect("fixture history parses as Vec<SavedSession>")
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yames-store-{tag}-{}", crate::clock::now_ns()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sample_session(id: &str, ts: u64, bpm: u16, preset: Option<&str>) -> SavedSession {
        let mut acc = crate::session::SessionAccumulator::new();
        for _ in 0..16 {
            acc.push(crate::timing::BeatFeedback {
                beat_index: 0,
                deviation_ms: 3.0,
                interval_error_ms: 1.0,
                classification: "perfect".to_string(),
                amplitude: 0.5,
                calibration_offset_ms: 0.0,
                calibration_confidence: 1.0,
                grid_correlation: 0.0,
            });
        }
        SavedSession {
            id: id.to_string(),
            timestamp: ts,
            bpm,
            time_signature: 4,
            report: acc.report(),
            preset_id: preset.map(str::to_string),
            preset_name: preset.map(|p| format!("{p} name")),
            segments: None,
        }
    }

    fn sample_score(id: &str) -> serde_json::Value {
        serde_json::json!({
            "schema": 1,
            "id": id,
            "title": "Blackbird",
            "artist": "The Beatles",
            "source": {
                "fileName": "blackbird.gp5",
                "format": "gp",
                "trackIndex": 0,
                "trackName": "Acoustic"
            },
            "tuning": [64, 59, 55, 50, 45, 40],
            "capo": 0,
            "ticksPerQuarter": 960,
            "tempoMap": [{ "tick": 0, "bpm": 96 }],
            "meterMap": [{ "bar": 0, "numerator": 4, "denominator": 4 }],
            "bars": [],
            "notes": [],
            "sections": []
        })
    }

    fn sample_attempt(id: &str, score_id: &str, started_at: i64, from: i64, to: i64) -> Attempt {
        Attempt {
            id: id.to_string(),
            score_id: score_id.to_string(),
            session_id: None,
            started_at,
            range_start_bar: from,
            range_end_bar: to,
            tempo_percent: 70.0,
            passes: 2,
            score: 81.0,
            hits: 30,
            misses: 2,
            extras: 1,
            mean_dev_ms: -4.5,
            mad_ms: 11.0,
            take_path: None,
            onsets: vec![
                AttemptOnset {
                    id: 0,
                    state: "hit".into(),
                    deviation_ms: Some(-3.0),
                    pass: 0,
                    // An accent the page wrote that did come out louder.
                    accent_heard: Some(true),
                },
                AttemptOnset {
                    id: 1,
                    state: "miss".into(),
                    deviation_ms: None,
                    pass: 0,
                    // Nothing to say: the note was not played at all.
                    accent_heard: None,
                },
                AttemptOnset {
                    id: 2,
                    state: "softAbsent".into(),
                    deviation_ms: None,
                    pass: 1,
                    accent_heard: Some(false),
                },
            ],
            extra_onsets: vec![AttemptExtra {
                beat: 3.5,
                pass: 0,
            }],
        }
    }

    // -- migrations -------------------------------------------------------

    #[test]
    fn a_fresh_database_lands_on_the_current_schema() {
        let db = Db::open_in_memory().unwrap();
        let v: i64 = db
            .conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(v, SCHEMA_VERSION);
        // Every table ROADMAP 1.1 names, plus this wave's.
        for table in [
            "sessions",
            "segments",
            "exercise_ceilings",
            "routines",
            "routine_runs",
            "events",
            "scores",
            "attempts",
            "attempt_onsets",
            "attempt_extras",
            "score_due",
        ] {
            let found: i64 = db
                .conn
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(found, 1, "table {table} is missing");
        }
    }

    #[test]
    fn opening_twice_migrates_once_and_keeps_the_rows() {
        let dir = temp_dir("reopen");
        let path = db_path(&dir);
        {
            let mut db = Db::open(&path).unwrap();
            db.save_session(&sample_session("s1", 1_700_000_000_000, 100, None), None)
                .unwrap();
        }
        let db = Db::open(&path).unwrap();
        assert_eq!(db.session_history(30).unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    // -- the one-time import ---------------------------------------------

    #[test]
    fn fixture_history_imports_and_round_trips_unchanged() {
        let fixtures = fixture_sessions();
        assert!(
            fixtures.len() >= 4,
            "fixture should carry enough sessions to be interesting"
        );
        let mut db = Db::open_in_memory().unwrap();
        let added = db.import_json_history(&fixtures).unwrap();
        assert_eq!(added, fixtures.len());

        let back = db.session_history(100).unwrap();
        assert_eq!(back.len(), fixtures.len());
        // Newest first, exactly as the JSON history was ordered.
        for pair in back.windows(2) {
            assert!(pair[0].timestamp >= pair[1].timestamp, "history is newest-first");
        }
        // Shape is preserved to the byte: the report comes back out of the
        // JSON column, not rebuilt from the typed ones.
        let original = fixtures
            .iter()
            .find(|s| s.id == back[0].id)
            .expect("same ids come back");
        assert_eq!(
            serde_json::to_value(original).unwrap(),
            serde_json::to_value(&back[0]).unwrap()
        );
    }

    #[test]
    fn importing_twice_adds_nothing() {
        let fixtures = fixture_sessions();
        let mut db = Db::open_in_memory().unwrap();
        assert_eq!(db.import_json_history(&fixtures).unwrap(), fixtures.len());
        assert!(db.json_history_imported());
        assert_eq!(db.import_json_history(&fixtures).unwrap(), 0);
        assert_eq!(db.session_history(100).unwrap().len(), fixtures.len());
    }

    #[test]
    fn a_lost_import_flag_still_cannot_duplicate_a_session() {
        // The crash-mid-import case: rows written, flag never set.
        let fixtures = fixture_sessions();
        let mut db = Db::open_in_memory().unwrap();
        db.import_json_history(&fixtures).unwrap();
        db.conn
            .execute("DELETE FROM meta WHERE key = ?1", [META_JSON_IMPORTED])
            .unwrap();
        assert_eq!(db.import_json_history(&fixtures).unwrap(), 0);
        assert_eq!(db.session_history(100).unwrap().len(), fixtures.len());
    }

    #[test]
    fn a_legacy_record_without_preset_or_segments_survives_the_round_trip() {
        let fixtures = fixture_sessions();
        let legacy = fixtures
            .iter()
            .find(|s| s.preset_id.is_none())
            .expect("fixture carries one pre-preset record");
        let mut db = Db::open_in_memory().unwrap();
        db.import_json_history(&fixtures).unwrap();
        let back = db.session_history(100).unwrap();
        let found = back.iter().find(|s| s.id == legacy.id).unwrap();
        assert!(found.preset_id.is_none());
        assert!(found.segments.is_none());
        assert_eq!(found.report.score, legacy.report.score);
    }

    // -- history queries --------------------------------------------------

    #[test]
    fn query_history_narrows_by_preset_bpm_and_date() {
        let mut db = Db::open_in_memory().unwrap();
        db.save_session(&sample_session("a", 1_000, 100, Some("p1")), Some("bass"))
            .unwrap();
        db.save_session(&sample_session("b", 2_000, 140, Some("p1")), Some("bass"))
            .unwrap();
        db.save_session(
            &sample_session("c", 3_000, 140, Some("p2")),
            Some("electric-guitar"),
        )
        .unwrap();

        let by_preset = db
            .query_history(&HistoryFilter {
                preset_id: Some("p1".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(by_preset.len(), 2);
        assert_eq!(by_preset[0].id, "b", "newest first");

        let by_band = db
            .query_history(&HistoryFilter {
                bpm_min: Some(130),
                bpm_max: Some(149),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(by_band.len(), 2);

        let by_date = db
            .query_history(&HistoryFilter {
                since: Some(2_000),
                until: Some(2_999),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(by_date.len(), 1);
        assert_eq!(by_date[0].id, "b");

        let by_instrument = db
            .query_history(&HistoryFilter {
                instrument: Some("bass".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(by_instrument.len(), 2);

        let limited = db
            .query_history(&HistoryFilter {
                limit: Some(1),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(limited.len(), 1);
        assert_eq!(limited[0].id, "c");
    }

    #[test]
    fn deleting_and_clearing_do_what_they_say() {
        let mut db = Db::open_in_memory().unwrap();
        db.save_session(&sample_session("a", 1_000, 100, None), None)
            .unwrap();
        db.save_session(&sample_session("b", 2_000, 100, None), None)
            .unwrap();
        db.save_score(&sample_score("song1"), None, None, 10).unwrap();
        db.save_attempt(&sample_attempt("at1", "song1", 50, 17, 24))
            .unwrap();

        db.delete_session("a").unwrap();
        assert_eq!(db.session_history(30).unwrap().len(), 1);

        db.clear_all_sessions().unwrap();
        assert!(db.session_history(30).unwrap().is_empty());
        assert!(db
            .query_attempts(&AttemptQuery {
                score_id: "song1".into(),
                ..Default::default()
            })
            .unwrap()
            .is_empty());
        // The song the player imported is not practice history.
        assert_eq!(db.list_scores().unwrap().len(), 1);
    }

    #[test]
    fn saving_the_same_session_twice_keeps_one_row() {
        let mut db = Db::open_in_memory().unwrap();
        let s = sample_session("a", 1_000, 100, None);
        db.save_session(&s, None).unwrap();
        db.save_session(&s, None).unwrap();
        assert_eq!(db.session_history(30).unwrap().len(), 1);
    }

    #[test]
    fn segments_are_broken_out_into_their_own_rows() {
        let mut db = Db::open_in_memory().unwrap();
        let mut s = sample_session("a", 1_000, 100, None);
        let report = serde_json::to_value(&s.report).unwrap();
        s.segments = Some(serde_json::json!([
            { "report": report, "bpm": 100, "timeSignature": 4, "startTime": 0, "endTime": 30000 },
            { "report": report, "bpm": 120, "timeSignature": 4, "startTime": 30000, "endTime": 60000, "mode": "jam" }
        ]));
        db.save_session(&s, None).unwrap();

        let rows: i64 = db
            .conn
            .query_row("SELECT count(*) FROM segments WHERE session_id='a'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 2);
        let jam: i64 = db
            .conn
            .query_row("SELECT count(*) FROM segments WHERE mode='jam'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(jam, 1, "a stretch played over the band is marked as one");
        // And the round trip still hands back exactly what was written.
        let back = db.session_history(30).unwrap();
        assert_eq!(
            serde_json::to_value(&s).unwrap(),
            serde_json::to_value(&back[0]).unwrap()
        );
    }

    // -- songs and attempts ----------------------------------------------

    #[test]
    fn a_score_round_trips_whole() {
        let db = Db::open_in_memory().unwrap();
        let score = sample_score("hash-1");
        let id = db
            .save_score(&score, Some("My Blackbird"), Some("QkxL"), 1_700_000_000_000)
            .unwrap();
        assert_eq!(id, "hash-1");
        assert_eq!(db.get_score("hash-1").unwrap().unwrap(), score);

        let list = db.list_scores().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "Blackbird");
        assert_eq!(list[0].format, "gp");
        assert_eq!(list[0].track_name, "Acoustic");
        // The player's name for it is beside the title, not instead of it.
        assert_eq!(list[0].name.as_deref(), Some("My Blackbird"));
        assert_eq!(db.get_score_source("hash-1").unwrap().as_deref(), Some("QkxL"));

        // Re-importing the same file replaces it rather than doubling it, and
        // says nothing about the name or the bytes — so both survive.
        db.save_score(&score, None, None, 1_700_000_000_001).unwrap();
        let list = db.list_scores().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name.as_deref(), Some("My Blackbird"));
        assert_eq!(db.get_score_source("hash-1").unwrap().as_deref(), Some("QkxL"));

        // And a rename is a save that says something about it.
        db.save_score(&score, Some("Verse loop"), None, 1_700_000_000_002)
            .unwrap();
        assert_eq!(
            db.list_scores().unwrap()[0].name.as_deref(),
            Some("Verse loop")
        );

        assert!(db.get_score("nope").unwrap().is_none());
        assert!(db.get_score_source("nope").unwrap().is_none());
    }

    /// A song imported before the library moved out of `songs.json` has no
    /// name and no bytes, and must still list and still open.
    #[test]
    fn a_score_saved_without_a_name_or_its_bytes_is_still_a_song() {
        let db = Db::open_in_memory().unwrap();
        db.save_score(&sample_score("bare"), None, None, 5).unwrap();
        let list = db.list_scores().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, None);
        assert_eq!(db.get_score_source("bare").unwrap(), None);
        assert!(db.get_score("bare").unwrap().is_some());
    }

    /// The v2 columns arrive on a database that already has songs in it, and
    /// nothing in it is lost. This is the upgrade every machine that ran the
    /// first build of this wave will do.
    #[test]
    fn a_v1_database_gains_the_two_columns_and_keeps_its_songs() {
        let conn = Connection::open_in_memory().unwrap();
        // A store exactly as v1 shipped it, songs and all.
        conn.execute_batch(MIGRATION_V1).unwrap();
        conn.pragma_update(None, "user_version", 1).unwrap();
        conn.execute(
            "INSERT INTO scores (id, title, artist, source_file, format,
                                 track_index, track_name, imported_at, json)
             VALUES ('old', 'Blackbird', 'The Beatles', 'b.gp5', 'gp', 0, 'Acoustic', 7, ?1)",
            [sample_score("old").to_string()],
        )
        .unwrap();

        let db = Db::from_connection(conn, PathBuf::from(":memory:")).unwrap();
        let v: i64 = db
            .conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(v, SCHEMA_VERSION);

        let list = db.list_scores().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "Blackbird");
        // Nothing invented for the columns that did not exist.
        assert_eq!(list[0].name, None);
        assert_eq!(db.get_score_source("old").unwrap(), None);
        assert!(db.get_score("old").unwrap().is_some());
    }

    /// The v3 things arrive on a database that already has attempts in it.
    ///
    /// This is the upgrade every machine that ran the earlier builds of this
    /// wave will do, and the fact worth pinning is the NULL: an attempt
    /// scored before the column existed has nothing to say about accents, and
    /// must not come back claiming one was missed.
    #[test]
    fn a_v2_database_gains_the_accents_and_the_promises_and_keeps_its_attempts() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(MIGRATION_V1).unwrap();
        conn.execute_batch(MIGRATION_V2).unwrap();
        conn.pragma_update(None, "user_version", 2).unwrap();
        conn.execute(
            "INSERT INTO scores (id, title, artist, source_file, format,
                                 track_index, track_name, imported_at, json)
             VALUES ('old', 'Blackbird', 'The Beatles', 'b.gp5', 'gp', 0, 'Acoustic', 7, ?1)",
            [sample_score("old").to_string()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO attempts (id, score_id, started_at, range_start_bar, range_end_bar,
                                   tempo_percent, passes, score, hits, misses, extras,
                                   mean_dev_ms, mad_ms)
             VALUES ('a1', 'old', 10, 0, 7, 100, 1, 80, 8, 0, 0, 0, 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO attempt_onsets (attempt_id, onset_id, pass, state, deviation_ms)
             VALUES ('a1', 0, 0, 'hit', -3.0)",
            [],
        )
        .unwrap();

        let mut db = Db::from_connection(conn, PathBuf::from(":memory:")).unwrap();
        let v: i64 = db
            .conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(v, SCHEMA_VERSION);

        let found = db
            .query_attempts(&AttemptQuery {
                score_id: "old".into(),
                include_onsets: true,
                ..Default::default()
            })
            .unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].onsets.len(), 1);
        assert_eq!(
            found[0].onsets[0].accent_heard, None,
            "an attempt scored before the column existed has nothing to say about accents"
        );

        // And the promises table is there and usable on the same database.
        db.save_due(&ScoreDue {
            score_id: "old".into(),
            range_start_bar: 16,
            range_end_bar: 23,
            due_day: 20_000,
            reason: Some("rushing".into()),
        })
        .unwrap();
        assert_eq!(db.list_due().unwrap().len(), 1);
    }

    #[test]
    fn an_accent_that_was_heard_survives_the_store() {
        let mut db = Db::open_in_memory().unwrap();
        db.save_score(&sample_score("s1"), None, None, 1).unwrap();
        db.save_attempt(&sample_attempt("a1", "s1", 100, 0, 7))
            .unwrap();

        let found = db
            .query_attempts(&AttemptQuery {
                score_id: "s1".into(),
                include_onsets: true,
                ..Default::default()
            })
            .unwrap();
        let onsets = &found[0].onsets;
        // Three different things, and the store must not flatten them into
        // two: heard, not heard, and nothing to say.
        assert_eq!(onsets[0].accent_heard, Some(true));
        assert_eq!(onsets[1].accent_heard, None);
        assert_eq!(onsets[2].accent_heard, Some(false));
    }

    /// A row with nothing to report does not grow a `null` on the wire — the
    /// same rule `score.rs` keeps for `OnsetResult`.
    #[test]
    fn an_onset_with_nothing_to_say_about_accents_says_nothing() {
        let quiet = AttemptOnset {
            id: 0,
            state: "hit".into(),
            deviation_ms: Some(1.0),
            pass: 0,
            accent_heard: None,
        };
        let json = serde_json::to_string(&quiet).unwrap();
        assert!(!json.contains("accentHeard"), "{json}");
        let loud = AttemptOnset {
            accent_heard: Some(false),
            ..quiet
        };
        assert!(serde_json::to_string(&loud).unwrap().contains("\"accentHeard\":false"));
    }

    // -- come back to this ------------------------------------------------

    #[test]
    fn one_promise_per_passage_and_the_second_moves_the_day() {
        let mut db = Db::open_in_memory().unwrap();
        db.save_score(&sample_score("s1"), None, None, 1).unwrap();
        let due = |start: i64, end: i64, day: i64| ScoreDue {
            score_id: "s1".into(),
            range_start_bar: start,
            range_end_bar: end,
            due_day: day,
            reason: Some("rushing".into()),
        };

        db.save_due(&due(16, 23, 20_010)).unwrap();
        db.save_due(&due(16, 23, 20_003)).unwrap();
        // A promise about bars 17–24 is not a promise about bars 17–20.
        db.save_due(&due(16, 19, 20_007)).unwrap();

        let all = db.list_due().unwrap();
        assert_eq!(all.len(), 2, "the same passage twice is one promise");
        // Soonest first, which is the order the library reads them in.
        assert_eq!(all[0].due_day, 20_003);
        assert_eq!(all[0].range_end_bar, 23);
        assert_eq!(all[1].due_day, 20_007);

        db.clear_due("s1", 16, 23).unwrap();
        let left = db.list_due().unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].range_end_bar, 19);
    }

    /// Forgetting a song forgets what was promised about it. A reminder to
    /// come back to a piece that is no longer in the library is a mark on a
    /// row that does not exist.
    #[test]
    fn deleting_a_song_takes_its_promises_with_it() {
        let mut db = Db::open_in_memory().unwrap();
        db.save_score(&sample_score("s1"), None, None, 1).unwrap();
        db.save_due(&ScoreDue {
            score_id: "s1".into(),
            range_start_bar: 0,
            range_end_bar: 3,
            due_day: 20_000,
            reason: None,
        })
        .unwrap();
        db.delete_score("s1").unwrap();
        assert_eq!(db.list_due().unwrap().len(), 0);
    }

    #[test]
    fn a_score_that_is_not_a_song_is_refused() {
        let db = Db::open_in_memory().unwrap();
        assert!(db
            .save_score(&serde_json::json!({ "title": "no id here" }), None, None, 1)
            .is_err());
    }

    #[test]
    fn attempts_come_back_oldest_first_and_only_for_the_bars_asked_for() {
        let mut db = Db::open_in_memory().unwrap();
        db.save_score(&sample_score("song1"), None, None, 1).unwrap();
        db.save_attempt(&sample_attempt("late", "song1", 300, 17, 24))
            .unwrap();
        db.save_attempt(&sample_attempt("early", "song1", 100, 17, 24))
            .unwrap();
        db.save_attempt(&sample_attempt("elsewhere", "song1", 200, 40, 48))
            .unwrap();

        let all = db
            .query_attempts(&AttemptQuery {
                score_id: "song1".into(),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(
            all.iter().map(|a| a.id.as_str()).collect::<Vec<_>>(),
            vec!["early", "elsewhere", "late"]
        );

        let ranged = db
            .query_attempts(&AttemptQuery {
                score_id: "song1".into(),
                bar_range: Some(BarRange {
                    start_bar: 17,
                    end_bar: 24,
                }),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(
            ranged.iter().map(|a| a.id.as_str()).collect::<Vec<_>>(),
            vec!["early", "late"]
        );
        assert!(
            ranged[0].onsets.is_empty(),
            "onsets are not loaded unless asked for"
        );
    }

    #[test]
    fn per_onset_verdicts_survive_the_round_trip() {
        let mut db = Db::open_in_memory().unwrap();
        db.save_score(&sample_score("song1"), None, None, 1).unwrap();
        let attempt = sample_attempt("a1", "song1", 100, 17, 24);
        db.save_attempt(&attempt).unwrap();

        let back = db
            .query_attempts(&AttemptQuery {
                score_id: "song1".into(),
                include_onsets: true,
                ..Default::default()
            })
            .unwrap();
        assert_eq!(back.len(), 1);
        assert_eq!(back[0].onsets.len(), 3);
        assert_eq!(back[0].onsets[0].state, "hit");
        assert_eq!(back[0].onsets[0].deviation_ms, Some(-3.0));
        assert_eq!(back[0].onsets[1].state, "miss");
        assert_eq!(back[0].onsets[1].deviation_ms, None);
        assert_eq!(back[0].onsets[2].state, "softAbsent");
        assert_eq!(back[0].onsets[2].pass, 1);
        assert_eq!(back[0].extra_onsets.len(), 1);
        assert_eq!(back[0].extra_onsets[0].beat, 3.5);

        // Re-saving replaces the verdicts rather than appending them.
        db.save_attempt(&attempt).unwrap();
        let again = db
            .query_attempts(&AttemptQuery {
                score_id: "song1".into(),
                include_onsets: true,
                ..Default::default()
            })
            .unwrap();
        assert_eq!(again.len(), 1);
        assert_eq!(again[0].onsets.len(), 3);
    }

    #[test]
    fn deleting_a_song_takes_its_attempts_with_it() {
        let mut db = Db::open_in_memory().unwrap();
        db.save_score(&sample_score("song1"), None, None, 1).unwrap();
        db.save_attempt(&sample_attempt("a1", "song1", 100, 1, 8))
            .unwrap();
        db.delete_score("song1").unwrap();
        let left: i64 = db
            .conn
            .query_row("SELECT count(*) FROM attempt_onsets", [], |r| r.get(0))
            .unwrap();
        assert_eq!(left, 0);
    }

    #[test]
    fn a_note_can_be_asked_for_its_own_history() {
        // The second question the brief says the coach will ask. It is a
        // join over `attempt_onsets(onset_id, …)`; the test is here so the
        // index that makes it cheap cannot be dropped unnoticed.
        let mut db = Db::open_in_memory().unwrap();
        db.save_score(&sample_score("song1"), None, None, 1).unwrap();
        db.save_attempt(&sample_attempt("a1", "song1", 100, 17, 24))
            .unwrap();
        db.save_attempt(&sample_attempt("a2", "song1", 200, 17, 24))
            .unwrap();
        let misses: i64 = db
            .conn
            .query_row(
                "SELECT count(*) FROM attempt_onsets o
                 JOIN attempts a ON a.id = o.attempt_id
                 WHERE a.score_id = ?1 AND o.onset_id = ?2 AND o.state = 'miss'",
                rusqlite::params!["song1", 1i64],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(misses, 2, "note 1 has been missed on both attempts");
    }

    // -- degradation ------------------------------------------------------

    #[test]
    fn a_corrupt_file_degrades_to_no_history_and_is_left_alone() {
        let dir = temp_dir("corrupt");
        let path = db_path(&dir);
        let garbage = b"this is not a database, it is a picture of one";
        std::fs::write(&path, garbage).unwrap();

        let Err(err) = Db::open(&path) else {
            panic!("a corrupt store must not open");
        };
        assert!(
            matches!(err, DbError::Unreadable(_)),
            "expected Unreadable, got {err:?}"
        );

        let store = PracticeStore::new();
        store.open_at(&path, |_| {});
        assert!(
            store
                .read_or(Vec::new(), |db| db.session_history(30))
                .is_empty(),
            "an unopenable store answers with no history"
        );
        assert!(
            store.with(|db| db.save_session(&sample_session("a", 1, 100, None), None)).is_err(),
            "and says so rather than pretending a write worked"
        );

        // The file is exactly as it was. Never deleted, never truncated.
        assert_eq!(std::fs::read(&path).unwrap(), garbage);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_newer_database_is_refused_rather_than_downgraded() {
        let dir = temp_dir("newer");
        let path = db_path(&dir);
        {
            let db = Db::open(&path).unwrap();
            db.conn
                .pragma_update(None, "user_version", SCHEMA_VERSION + 7)
                .unwrap();
        }
        let before = std::fs::metadata(&path).unwrap().len();
        let Err(err) = Db::open(&path) else {
            panic!("a newer store must not open");
        };
        match err {
            DbError::Newer { found, expected } => {
                assert_eq!(found, SCHEMA_VERSION + 7);
                assert_eq!(expected, SCHEMA_VERSION);
            }
            other => panic!("expected Newer, got {other:?}"),
        }
        assert_eq!(
            std::fs::metadata(&path).unwrap().len(),
            before,
            "the file must not be rewritten"
        );

        let store = PracticeStore::new();
        store.open_at(&path, |_| {});
        assert!(store
            .read_or(Vec::new(), |db| db.session_history(30))
            .is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_import_happens_before_any_command_can_see_the_store() {
        // A history that appeared halfway through a read would be a
        // first-launch-only bug nobody could reproduce. The hook runs
        // inside `open_at`, before the slot is published, so the first
        // thing any command can see is the finished history.
        let dir = temp_dir("import-hook");
        let path = db_path(&dir);
        let store = PracticeStore::new();
        let fixtures = fixture_sessions();
        store.open_at(&path, |db| {
            db.import_json_history(&fixtures).unwrap();
        });
        assert_eq!(
            store
                .read_or(Vec::new(), |db| db.session_history(100))
                .len(),
            fixtures.len()
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_store_that_never_opened_answers_instead_of_hanging() {
        let store = PracticeStore::new();
        store.unavailable("no data directory".into());
        assert!(store
            .read_or(Vec::new(), |db| db.session_history(30))
            .is_empty());
    }

    // -- the timing gate --------------------------------------------------

    /// The fastest of `n` runs.
    ///
    /// A single wall-clock sample inside a suite that runs six hundred
    /// other tests in parallel measures the scheduler, not the query —
    /// the first version of this gate was green on its own and red in
    /// the full run, which is the worst kind of test there is. A
    /// scheduling hiccup does not land on all of a handful of runs, so
    /// the fastest of them is the query. The gate stays literal:
    /// "answers in under 20 ms".
    fn fastest_ms(n: usize, mut run: impl FnMut()) -> f64 {
        let mut best = f64::MAX;
        for _ in 0..n {
            let t = Instant::now();
            run();
            best = best.min(t.elapsed().as_secs_f64() * 1000.0);
        }
        best
    }

    /// ROADMAP 1.1's gate, and W2's: 500 sessions and 5 000 attempts, and
    /// both questions the coach asks answered in under 20 ms.
    ///
    /// Two assertions, because the clock alone is not trustworthy on a
    /// shared machine. The plan assertion is the one that actually says
    /// the indexes are doing their job, and it says the same thing on an
    /// idle laptop and a CI runner under load; the clock is the sanity
    /// check on top of it.
    #[test]
    fn a_full_store_answers_both_questions_under_twenty_milliseconds() {
        let mut db = Db::open_in_memory().unwrap();

        // 500 sessions across five presets, five instruments, a year.
        let presets = ["p1", "p2", "p3", "p4", "p5"];
        let instruments = ["electric-guitar", "acoustic-guitar", "bass"];
        {
            let template = sample_session("template", 0, 100, None);
            let report_json = serde_json::to_string(&template.report).unwrap();
            let tx = db.conn.transaction().unwrap();
            {
                let mut stmt = tx
                    .prepare(
                        "INSERT INTO sessions (id, started_at, instrument, preset_id, preset_name,
                                               bpm_start, bpm_end, time_signature, subdivision,
                                               score, mean_dev_ms, mad_ms, report_json)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, 4, 1, ?7, 2.0, 8.0, ?8)",
                    )
                    .unwrap();
                for i in 0..500i64 {
                    stmt.execute(rusqlite::params![
                        format!("s{i}"),
                        1_700_000_000_000i64 + i * 86_400_000,
                        instruments[(i % 3) as usize],
                        presets[(i % 5) as usize],
                        "a preset",
                        60 + (i % 24) * 10,
                        50 + (i % 50),
                        report_json,
                    ])
                    .unwrap();
                }
            }
            tx.commit().unwrap();
        }

        // 5 000 attempts at one song, each with sixteen expected onsets.
        db.save_score(&sample_score("song1"), None, None, 1).unwrap();
        {
            let tx = db.conn.transaction().unwrap();
            {
                let mut attempts = tx
                    .prepare(
                        "INSERT INTO attempts (id, score_id, session_id, started_at,
                                               range_start_bar, range_end_bar, tempo_percent,
                                               passes, score, hits, misses, extras,
                                               mean_dev_ms, mad_ms, take_path)
                         VALUES (?1, 'song1', NULL, ?2, ?3, ?4, 70.0, 1, 80.0, 30, 2, 1, -3.0, 9.0, NULL)",
                    )
                    .unwrap();
                let mut onsets = tx
                    .prepare(
                        "INSERT INTO attempt_onsets (attempt_id, onset_id, pass, state, deviation_ms)
                         VALUES (?1, ?2, 0, 'hit', 4.0)",
                    )
                    .unwrap();
                for i in 0..5_000i64 {
                    let start = (i % 60) + 1;
                    let id = format!("a{i}");
                    attempts
                        .execute(rusqlite::params![id, 1_700_000_000_000i64 + i * 1_000, start, start + 7])
                        .unwrap();
                    for onset in 0..16i64 {
                        onsets.execute(rusqlite::params![id, onset]).unwrap();
                    }
                }
            }
            tx.commit().unwrap();
        }

        let history_filter = HistoryFilter {
            preset_id: Some("p3".into()),
            bpm_min: Some(100),
            bpm_max: Some(160),
            limit: Some(50),
            ..Default::default()
        };
        let attempt_query = AttemptQuery {
            score_id: "song1".into(),
            bar_range: Some(BarRange {
                start_bar: 17,
                end_bar: 24,
            }),
            limit: Some(100),
            ..Default::default()
        };

        // 1. The load-independent half: SQLite reaches both answers
        //    through an index. A full scan of 500 sessions is fast enough
        //    to pass a clock on a quiet machine and is still the bug —
        //    the coach will be asking these questions of a store far
        //    larger than this fixture.
        let (sql, args) = history_sql(&history_filter);
        let plan = db.explain(&sql, &args);
        assert!(
            plan.contains("sessions_preset"),
            "queryHistory should reach the preset's sessions through `sessions_preset`, \
             but SQLite plans to: {plan}"
        );
        let (sql, args) = attempts_sql(&attempt_query);
        let plan = db.explain(&sql, &args);
        assert!(
            plan.contains("attempts_score_range"),
            "queryAttempts should reach a song's attempts through `attempts_score_range`, \
             but SQLite plans to: {plan}"
        );

        // 2. The clock. Warmed once so the first touch of a b-tree is not
        //    what is measured, then the fastest of fifteen runs.
        let _ = db.query_history(&history_filter).unwrap();
        let _ = db.query_attempts(&attempt_query).unwrap();

        let mut history_rows = 0usize;
        let history_ms = fastest_ms(15, || {
            history_rows = db.query_history(&history_filter).unwrap().len();
        });
        let mut attempt_rows = 0usize;
        let attempts_ms = fastest_ms(15, || {
            attempt_rows = db.query_attempts(&attempt_query).unwrap().len();
        });
        assert!(history_rows > 0, "the filter should match something");
        assert!(attempt_rows > 0, "bars 17–24 should have been played");

        // Printed (visible under `--nocapture`) so a run that is merely
        // close to the gate is as obvious as one that fails it.
        eprintln!(
            "[store] gate: queryHistory {history_ms:.2} ms, queryAttempts {attempts_ms:.2} ms \
             (fastest of 15; 500 sessions, 5 000 attempts, 80 000 onsets, debug build)"
        );
        assert!(
            history_ms < 20.0,
            "queryHistory over 500 sessions took {history_ms:.2} ms (gate: < 20 ms)"
        );
        assert!(
            attempts_ms < 20.0,
            "queryAttempts over 5 000 attempts took {attempts_ms:.2} ms (gate: < 20 ms)"
        );
    }
}
