//! P4: a `practice.db` as this release wrote it still opens, with every row.
//!
//! `tests/parity_fixtures/practice_v4.db` is a frozen schema-4 file, committed as
//! bytes. The migration tests in `db.rs` generate their old databases in code, so
//! they would move with the code. This one cannot: the revamp may add migrations,
//! but this file must go on opening, and it must lose no table, column or row.
//!
//! It is written by this code at schema 4 rather than by an installed v1.2.2, which
//! has the same schema. Bake it again only if it is genuinely wrong, never to make
//! a test pass:
//!
//!   UPDATE_FIXTURES=1 node scripts/rust-test.mjs --test parity_store

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Once;

use rusqlite::Connection;
use yames_lib::db::{Attempt, AttemptExtra, AttemptOnset, AttemptQuery, Db, DbError, ScoreDue};
use yames_lib::session::SavedSession;

const SESSION_ID: &str = "session-from-v4";
const SCORE_ID: &str = "score-from-v4";
const ATTEMPT_ID: &str = "attempt-from-v4";

/// The twelve tables of section 4.1, at schema 4.
const TABLES: [&str; 12] = [
    "attempt_extras",
    "attempt_onsets",
    "attempts",
    "events",
    "exercise_ceilings",
    "meta",
    "routine_runs",
    "routines",
    "score_due",
    "scores",
    "segments",
    "sessions",
];

fn fixture_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/parity_fixtures/practice_v4.db")
}

/// The frozen file, baked first if asked for. Tests run in parallel, hence `Once`.
fn fixture() -> PathBuf {
    static BAKE: Once = Once::new();
    BAKE.call_once(|| {
        if std::env::var("UPDATE_FIXTURES").is_ok() {
            bake();
        }
    });
    fixture_path()
}

/// A scratch copy: opening a store may migrate it, and the fixture stays frozen.
fn scratch_copy(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("yames-parity-{tag}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("practice.db");
    fs::copy(fixture(), &path).unwrap();
    path
}

fn saved_session() -> SavedSession {
    serde_json::from_value(serde_json::json!({
        "id": SESSION_ID,
        "timestamp": 1_767_225_600_000u64,
        "bpm": 96,
        "timeSignature": 4,
        "presetId": "preset-beat",
        "presetName": "Warm up",
        "report": {
            "totalBeats": 480,
            "hitsCount": 400,
            "missCount": 80,
            "skippedBeats": 0,
            "perfectCount": 360,
            "goodCount": 40,
            "okCount": 0,
            "meanDeviationMs": 0.0,
            "stdDeviationMs": 5.0,
            "meanAbsDeviationMs": 4.0,
            "meanIntervalErrorMs": 3.0,
            "grade": "C",
            "score": 70,
            "deviations": [],
            "dynamicsStd": 0.1,
            "meanAmplitude": 0.5,
            "tempoStabilityMs": 3.0,
            "longestStreak": 16,
            "comment": "",
            "insights": [],
            "gridCorrelation": 0.9
        },
        "segments": [{
            "startTime": 1000.0,
            "endTime": 61000.0,
            "bpm": 96,
            "mode": "beat",
            "report": { "score": 70.0 }
        }]
    }))
    .expect("the session in the fixture must deserialize")
}

fn score_json() -> serde_json::Value {
    serde_json::json!({
        "id": SCORE_ID,
        "title": "Song from v4",
        "artist": "Somebody",
        "source": {
            "fileName": "song.gp5",
            "format": "gp5",
            "trackIndex": 2,
            "trackName": "Lead"
        },
        "bars": [{ "index": 0 }, { "index": 1 }]
    })
}

fn attempt() -> Attempt {
    Attempt {
        id: ATTEMPT_ID.into(),
        score_id: SCORE_ID.into(),
        session_id: Some(SESSION_ID.into()),
        started_at: 1_767_225_700_000,
        range_start_bar: 0,
        range_end_bar: 1,
        tempo_percent: 75.0,
        passes: 2,
        score: 81.5,
        hits: 30,
        misses: 2,
        extras: 1,
        mean_dev_ms: 4.0,
        mad_ms: 2.5,
        take_path: None,
        onsets: vec![AttemptOnset {
            id: 7,
            state: "hit".into(),
            deviation_ms: Some(3.5),
            pass: 1,
            accent_heard: None,
        }],
        extra_onsets: vec![AttemptExtra { beat: 1.5, pass: 0 }],
    }
}

fn due() -> ScoreDue {
    ScoreDue {
        score_id: SCORE_ID.into(),
        range_start_bar: 0,
        range_end_bar: 1,
        due_day: 20_500,
        reason: Some("rushing".into()),
    }
}

fn bake() {
    let path = fixture_path();
    let _ = fs::remove_file(&path);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    {
        let mut db = Db::open(&path).unwrap();
        db.save_session(&saved_session(), Some("electric-guitar")).unwrap();
        db.save_score(&score_json(), Some("My name for it"), Some("AAEC"), 1_767_225_650_000)
            .unwrap();
        db.save_attempt(&attempt()).unwrap();
        db.save_due(&due()).unwrap();
    }
    // Fold the write-ahead log in and leave one self-contained file.
    let conn = Connection::open(&path).unwrap();
    let _: String = conn
        .query_row("PRAGMA journal_mode=DELETE", [], |r| r.get(0))
        .unwrap();
    conn.execute_batch("VACUUM").unwrap();
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .unwrap();
    assert_eq!(version, 4, "the fixture is the schema-4 store, by definition");
}

fn user_version(path: &Path) -> i64 {
    Connection::open(path)
        .unwrap()
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .unwrap()
}

/// Every table and its columns.
fn shape(path: &Path) -> BTreeMap<String, BTreeSet<String>> {
    let conn = Connection::open(path).unwrap();
    let mut tables = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .unwrap();
    let names: Vec<String> = tables
        .query_map([], |r| r.get(0))
        .unwrap()
        .map(Result::unwrap)
        .collect();
    names
        .into_iter()
        .map(|table| {
            let mut info = conn.prepare(&format!("PRAGMA table_info({table})")).unwrap();
            let columns: BTreeSet<String> = info
                .query_map([], |r| r.get(1))
                .unwrap()
                .map(Result::unwrap)
                .collect();
            (table, columns)
        })
        .collect()
}

#[test]
fn the_fixture_is_what_it_says() {
    let path = fixture();
    assert!(path.exists(), "missing {}; see the header", path.display());
    assert_eq!(user_version(&path), 4);
    let found = shape(&path);
    for table in TABLES {
        assert!(found.contains_key(table), "the fixture has no `{table}`");
    }
}

#[test]
fn a_v4_store_opens_and_loses_no_table_or_column() {
    let before = shape(&fixture());
    let path = scratch_copy("shape");
    drop(Db::open(&path).expect("a v4 store must open"));
    assert!(user_version(&path) >= 4, "the version must never go down");
    let after = shape(&path);
    for (table, columns) in &before {
        let now = after
            .get(table)
            .unwrap_or_else(|| panic!("the migration dropped `{table}`"));
        let lost: Vec<_> = columns.difference(now).collect();
        assert!(lost.is_empty(), "`{table}` lost columns: {lost:?}");
    }
}

#[test]
fn a_v4_store_keeps_its_session_and_segments() {
    let db = Db::open(&scratch_copy("sessions")).unwrap();
    let history = db.session_history(10).unwrap();
    assert_eq!(history.len(), 1);
    let session = &history[0];
    assert_eq!(session.id, SESSION_ID);
    assert_eq!(session.bpm, 96);
    assert_eq!(session.time_signature, 4);
    assert_eq!(session.preset_id.as_deref(), Some("preset-beat"));
    assert_eq!(session.preset_name.as_deref(), Some("Warm up"));
    assert_eq!(session.report.hits_count, 400);
    let segments = session.segments.as_ref().expect("the session lost its segments");
    assert_eq!(segments.as_array().map(Vec::len), Some(1));
}

#[test]
fn a_v4_store_keeps_its_songs_attempts_and_promises() {
    let db = Db::open(&scratch_copy("songs")).unwrap();

    let scores = db.list_scores().unwrap();
    assert_eq!(scores.len(), 1);
    assert_eq!(scores[0].id, SCORE_ID);
    assert_eq!(scores[0].title, "Song from v4");
    assert_eq!(scores[0].track_name, "Lead");
    assert_eq!(scores[0].name.as_deref(), Some("My name for it"));
    assert!(db.get_score(SCORE_ID).unwrap().is_some());
    assert_eq!(db.get_score_source(SCORE_ID).unwrap().as_deref(), Some("AAEC"));

    let attempts = db
        .query_attempts(&AttemptQuery {
            score_id: SCORE_ID.into(),
            bar_range: None,
            include_onsets: true,
            limit: None,
        })
        .unwrap();
    assert_eq!(attempts.len(), 1);
    let kept = &attempts[0];
    assert_eq!(kept.id, ATTEMPT_ID);
    assert_eq!(kept.session_id.as_deref(), Some(SESSION_ID));
    assert_eq!(kept.score, 81.5);
    assert_eq!(kept.onsets.len(), 1);
    assert_eq!(kept.onsets[0].state, "hit");
    assert_eq!(kept.extra_onsets.len(), 1);

    let promises = db.list_due().unwrap();
    assert_eq!(promises.len(), 1);
    assert_eq!(promises[0].score_id, SCORE_ID);
    assert_eq!(promises[0].reason.as_deref(), Some("rushing"));
}

#[test]
fn opening_it_twice_changes_nothing() {
    let path = scratch_copy("twice");
    drop(Db::open(&path).unwrap());
    let db = Db::open(&path).unwrap();
    assert_eq!(db.session_history(10).unwrap().len(), 1);
    assert_eq!(db.list_scores().unwrap().len(), 1);
}

#[test]
fn a_store_from_a_newer_build_is_refused_and_left_alone() {
    let path = scratch_copy("newer");
    {
        let conn = Connection::open(&path).unwrap();
        conn.pragma_update(None, "user_version", 9_999).unwrap();
    }
    assert!(matches!(Db::open(&path), Err(DbError::Newer { .. })));
    // Not compared byte for byte: opening turns on WAL before it reads the version,
    // which rewrites two header bytes. What matters is that it is still the newer
    // build's store, with its rows.
    assert_eq!(user_version(&path), 9_999, "a refused store keeps its version");
    let conn = Connection::open(&path).unwrap();
    let sessions: i64 = conn
        .query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0))
        .unwrap();
    assert_eq!(sessions, 1, "a refused store keeps its rows");
}

#[test]
fn deleting_a_song_takes_only_that_song_with_it() {
    let path = scratch_copy("delete");
    let db = Db::open(&path).unwrap();
    db.delete_score(SCORE_ID).unwrap();
    assert!(db.list_scores().unwrap().is_empty());
    // The practice history is about the session, not the song.
    assert_eq!(db.session_history(10).unwrap().len(), 1);
}
