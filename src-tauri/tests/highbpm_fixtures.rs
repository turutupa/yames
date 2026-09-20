//! Layer-2 raw-onset regression fixtures for the high-BPM range (80–180 BPM).
//!
//! Exercises the full `match_and_score` pipeline (onset → beat matching →
//! `SessionReport`) with electric-guitar profile across 9 synthetic fixture
//! inputs. This sits one layer deeper than `dsp_fixtures`, which starts from
//! already-matched `BeatFeedback` values.
//!
//! Adding a fixture
//! ----------------
//! 1. Add a new `<name>.input.json` in `tests/highbpm_fixtures/` with the
//!    shape produced by `cargo run --bin seed-highbpm-fixtures` (or hand-craft
//!    one following the schema in `src/bin/seed-highbpm-fixtures.rs`).
//! 2. Run `UPDATE_FIXTURES=1 cargo test --test highbpm_fixtures` once. The
//!    harness writes `<name>.golden.json` containing the serialized
//!    `SessionReport`. Commit both files.
//! 3. Subsequent runs compare actual vs golden and fail on any drift.
//!
//! Accepting an intentional scoring change
//! ----------------------------------------
//! Re-run with `UPDATE_FIXTURES=1` and review the diff. The diff is the
//! audit trail for any matcher or scoring formula change.

//! The `played/` subdirectory
//! ---------------------------
//! Roadmap 1.3 fixtures. Those inputs are a *spec* — a click, a rhythm
//! played over it, a tempo — rather than a baked onset list, and the
//! harness drives the shipped refractory gate and the shipped grid
//! inference over them before it scores anything. See
//! `played_grid_fixtures_hold` below.

use std::fs;
use std::path::{Path, PathBuf};

use yames_lib::instrument::Instrument;
use yames_lib::session::SessionReport;
use yames_lib::session_log::{match_and_score, DetectedOnset, ExpectedBeat, Xorshift64};
use yames_lib::timing::{
    virtual_tick_offsets, BeatTick, GateDecision, RefractoryGate, RhythmInference, TempoContext,
};

/// On-disk shape of `tests/highbpm_fixtures/<name>.input.json`.
/// Must stay in sync with `FixtureInput` in `src/bin/seed-highbpm-fixtures.rs`.
#[derive(serde::Deserialize)]
struct FixtureInput {
    name: String,
    #[allow(dead_code)]
    description: String,
    #[allow(dead_code)]
    bpm: u16,
    #[allow(dead_code)]
    beats: u32,
    onsets: Vec<DetectedOnset>,
    expected: Vec<ExpectedBeat>,
}

fn fixtures_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("highbpm_fixtures")
}

fn collect_input_files() -> Vec<PathBuf> {
    let dir = fixtures_dir();
    let mut out = Vec::new();
    if !dir.exists() {
        return out;
    }
    for entry in fs::read_dir(&dir).expect("read highbpm_fixtures dir") {
        let entry = entry.expect("read dir entry");
        let path = entry.path();
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if name.ends_with(".input.json") {
            out.push(path);
        }
    }
    // Stable ordering so test output is grep-able across runs.
    out.sort();
    out
}

fn golden_path(input_path: &Path) -> PathBuf {
    let stem = input_path
        .file_name()
        .and_then(|n| n.to_str())
        .expect("input filename")
        .trim_end_matches(".input.json");
    input_path.with_file_name(format!("{stem}.golden.json"))
}

#[test]
fn all_fixtures_replay_stably() {
    let inputs = collect_input_files();
    assert!(
        !inputs.is_empty(),
        "No fixtures found in {}",
        fixtures_dir().display(),
    );

    let update_mode = std::env::var("UPDATE_FIXTURES")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let profile = Instrument::ElectricGuitar.profile();
    let mut failures = Vec::new();

    for input_path in &inputs {
        let raw = fs::read_to_string(input_path)
            .unwrap_or_else(|e| panic!("read {}: {e}", input_path.display()));
        let fixture: FixtureInput = serde_json::from_str(&raw)
            .unwrap_or_else(|e| panic!("parse {}: {e}", input_path.display()));

        let (_, _, actual) = match_and_score(&fixture.onsets, &fixture.expected, &profile);
        let golden_file = golden_path(input_path);

        if update_mode {
            let pretty = serde_json::to_string_pretty(&actual).expect("serialize SessionReport");
            fs::write(&golden_file, format!("{pretty}\n"))
                .unwrap_or_else(|e| panic!("write {}: {e}", golden_file.display()));
            eprintln!(
                "  UPDATED {}  ({})",
                golden_file
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("<?>"),
                fixture.name,
            );
            continue;
        }

        if !golden_file.exists() {
            failures.push(format!(
                "fixture {} ({}): no golden file at {} — run \
                 `UPDATE_FIXTURES=1 cargo test --test highbpm_fixtures` to create it",
                fixture.name,
                input_path.display(),
                golden_file.display(),
            ));
            continue;
        }

        let golden_raw = fs::read_to_string(&golden_file)
            .unwrap_or_else(|e| panic!("read {}: {e}", golden_file.display()));

        // Parse both sides so we catch deserialization errors early, then
        // compare via re-serialized pretty JSON. This gives byte-identical
        // comparison (the acceptance criterion) while tolerating whitespace
        // differences between how the golden was written and how the current
        // serde_json serializes.
        let golden: SessionReport = serde_json::from_str(&golden_raw)
            .unwrap_or_else(|e| panic!("parse {}: {e}", golden_file.display()));

        let actual_json =
            serde_json::to_string_pretty(&actual).expect("serialize actual SessionReport");
        let golden_json =
            serde_json::to_string_pretty(&golden).expect("serialize golden SessionReport");

        if actual_json != golden_json {
            failures.push(format!(
                "[{}] SessionReport drifted.\n  actual:\n{}\n  golden:\n{}",
                fixture.name, actual_json, golden_json,
            ));
        }
    }

    if update_mode {
        eprintln!(
            "UPDATE_FIXTURES=1 — wrote {} golden file(s). Review the diff before committing.",
            inputs.len(),
        );
        return;
    }

    assert!(
        failures.is_empty(),
        "Layer-2 raw-onset regression(s):\n  - {}",
        failures.join("\n  - "),
    );
}

// ---------------------------------------------------------------------------
// Roadmap 1.3 — the refractory follows the player, and the analyzer
// invents the grid positions the click never played.
//
// These fixtures start one layer below the ones above. Where those hand
// the matcher a finished onset list, these describe a situation — "100
// BPM, the metronome clicks quarters, the player plays 16ths" — and
// replay it through the pieces that actually ship:
//
//   * `TempoContext` + `RefractoryGate`, the detector's decision about
//     which notes are even heard, and
//   * `RhythmInference` + `virtual_tick_offsets`, the analyzer's
//     decision about which positions are expected.
//
// Only then is the result scored, through the same `match_and_score`
// the fixtures above use. So a failure here means one of those two
// decisions moved, which is the whole of 1.3.
//
// Every fixture is replayed twice. `RefractoryKey::Player` is what
// ships. `RefractoryKey::Click` pins the detector back to the click
// alone — the pre-1.3 behaviour — and the fixture declares a ceiling
// that mode must not beat. Without that second run a regression that
// quietly went back to the click would still pass here, because the
// rest of the pipeline would paper over it.
// ---------------------------------------------------------------------------

/// A fixture in `tests/highbpm_fixtures/played/`.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayedSpec {
    name: String,
    #[allow(dead_code)]
    description: String,
    /// Quarter-note tempo of the click.
    bpm: u16,
    /// What the metronome is clicking (1 = quarters, 2 = 8ths, …).
    click_subdivision: u8,
    /// What the player is playing, as a divisor of the quarter note.
    played_divisor: u8,
    /// Bars of 4/4.
    bars: u32,
    /// Gaussian spread applied to each played note, in ms.
    jitter_ms: f32,
    /// Seed for that Gaussian. Fixed per fixture — these are
    /// regression fixtures, not a fuzzer.
    seed: u64,
    /// The gate: what this must score when the detector follows the
    /// player.
    min_score: u32,
    /// The guard: what the same input must NOT beat when the detector
    /// is keyed to the click, as it was before 1.3.
    click_keyed_max_score: u32,
    /// The divisor the inference is expected to settle on.
    expect_divisor: u8,
}

#[derive(Clone, Copy, PartialEq)]
enum RefractoryKey {
    /// What ships after 1.3: the analyzer publishes the divisor it has
    /// locked, and the detector keys its refractory to the finer of
    /// that and the click.
    Player,
    /// Pre-1.3: the detector only ever knew the click.
    Click,
}

/// One replayed pass. `report` is what the fixture is graded on; the
/// counts are what makes a failure diagnosable.
struct Replay {
    report: SessionReport,
    divisor: u8,
    played: usize,
    heard: usize,
    expected_positions: usize,
}

/// Amplitude every synthetic note is given. Constant on purpose: these
/// fixtures are about *when* notes are heard, and a varying amplitude
/// would drag the amplitude-weighted spurious penalty into a test that
/// has nothing to say about it.
const PLAYED_AMPLITUDE: f32 = 0.6;
/// Monotonic lead-in before the first click. The refractory gate
/// anchors at 0 and the live clock never starts there; without a
/// lead-in the first note of every fixture would be judged against an
/// anchor one nanosecond into the session.
const LEAD_NS: u64 = 1_000_000_000;

fn played_fixtures_dir() -> PathBuf {
    fixtures_dir().join("played")
}

/// Replay one spec. Mirrors the live wiring: the detector's gate reads
/// the tempo context, the analyzer pushes every onset the gate emitted
/// (ghosts included — those reach the matcher live too) into the
/// inference, and the inference publishes back what it locked.
fn replay(spec: &PlayedSpec, key: RefractoryKey) -> Replay {
    let profile = Instrument::ElectricGuitar.profile();
    let quarter_ms = 60_000.0 / spec.bpm as f64;
    let quarter_ns = (quarter_ms * 1_000_000.0) as u64;
    let quarters = spec.bars * 4;

    // ── What the player plays ───────────────────────────────────────
    let note_ns = quarter_ns / spec.played_divisor.max(1) as u64;
    let mut rng = Xorshift64::new(spec.seed);
    let played: Vec<u64> = (0..quarters as u64 * spec.played_divisor.max(1) as u64)
        .map(|i| {
            let nominal = LEAD_NS + i * note_ns;
            if spec.jitter_ms <= 0.0 {
                return nominal;
            }
            let jitter_ns = (rng.next_gauss() * spec.jitter_ms * 1_000_000.0) as i64;
            (nominal as i64 + jitter_ns).max(0) as u64
        })
        .collect();

    // ── What the metronome clicks ───────────────────────────────────
    let click_total = spec.click_subdivision.max(1);
    let click_step_ns = quarter_ns / click_total as u64;
    let mut ticks: Vec<BeatTick> = Vec::new();
    for q in 0..quarters {
        for s in 0..click_total {
            ticks.push(BeatTick {
                ts_ns: LEAD_NS + q as u64 * quarter_ns + s as u64 * click_step_ns,
                beat_index: q,
                is_downbeat: s == 0 && q % 4 == 0,
                expected_interval_ms: quarter_ms,
                subdivision_index: s,
                subdivision_total: click_total,
                beats_per_bar: 4,
            });
        }
    }

    // ── Replay the two of them against each other, in time order ────
    let tempo = TempoContext::new(spec.bpm, click_total);
    let mut gate = RefractoryGate::new();
    let mut inference = RhythmInference::new();
    let mut heard: Vec<u64> = Vec::new();

    let mut ti = 0usize;
    let mut pi = 0usize;
    while ti < ticks.len() || pi < played.len() {
        let take_tick = match (ticks.get(ti), played.get(pi)) {
            (Some(t), Some(&p)) => t.ts_ns <= p,
            (Some(_), None) => true,
            _ => false,
        };
        if take_tick {
            inference.update_reference(&ticks[ti]);
            ti += 1;
        } else {
            let ts = played[pi];
            pi += 1;
            let interval_ms = match key {
                RefractoryKey::Player => tempo.detection_interval_ms(),
                RefractoryKey::Click => tempo.subdivision_interval_ms(),
            };
            let decision =
                gate.admit(ts, PLAYED_AMPLITUDE, interval_ms, profile.refractory_floor_ms);
            if decision != GateDecision::Blocked {
                // Ghost-window emissions reach the analyzer live, so
                // they reach the inference here too.
                heard.push(ts);
                inference.push_onset(ts);
            }
        }
        inference.refit();
        // The live loop publishes once per matcher pass rather than
        // once per event; refitting per event only makes the lock
        // arrive marginally sooner, which overstates nothing that
        // matters — the cold-start notes are lost either way.
        if key == RefractoryKey::Player {
            let q = inference.last_beat_interval_ms();
            if inference.is_locked() && q > 0.0 {
                tempo.set_played_interval_ms(Some(inference.effective_interval_ms(q) as f32));
            } else {
                tempo.set_played_interval_ms(None);
            }
        }
    }

    // ── The grid the analyzer would score against ───────────────────
    // Audible ticks that sit on the inferred grid, plus the positions
    // it had to invent. Built from the divisor the run settled on,
    // which is deliberately harsher than the live loop: notes lost
    // during cold start are counted as misses against the full grid
    // rather than quietly falling outside a coarser one.
    let divisor = inference.current_divisor();
    let offsets = virtual_tick_offsets(click_total, divisor);
    let mut positions: Vec<u64> = Vec::new();
    for tick in &ticks {
        if inference.is_active_tick(tick) {
            positions.push(tick.ts_ns);
        }
    }
    let step_ns = quarter_ns / divisor.max(1) as u64;
    for q in 0..quarters {
        let anchor = LEAD_NS + q as u64 * quarter_ns;
        for &j in &offsets {
            positions.push(anchor + step_ns * j as u64);
        }
    }
    positions.sort_unstable();

    let expected: Vec<ExpectedBeat> = positions
        .iter()
        .enumerate()
        .map(|(i, &ts)| ExpectedBeat {
            index: i as u32,
            timestamp_ms: ts / 1_000_000,
            is_accent: i as u32 % (4 * divisor.max(1) as u32) == 0,
            expected_bpm: spec.bpm,
        })
        .collect();

    let onsets: Vec<DetectedOnset> = heard
        .iter()
        .map(|&ts| DetectedOnset {
            timestamp_ms: ts / 1_000_000,
            amplitude: PLAYED_AMPLITUDE,
            centroid: 0.0,
            confidence: 1.0,
        })
        .collect();

    let (_, _, report) = match_and_score(&onsets, &expected, &profile);
    Replay {
        report,
        divisor,
        played: played.len(),
        heard: heard.len(),
        expected_positions: expected.len(),
    }
}

fn collect_played_specs() -> Vec<PathBuf> {
    let dir = played_fixtures_dir();
    let mut out = Vec::new();
    if !dir.exists() {
        return out;
    }
    for entry in fs::read_dir(&dir).expect("read highbpm_fixtures/played dir") {
        let path = entry.expect("read dir entry").path();
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if name.ends_with(".input.json") {
            out.push(path);
        }
    }
    out.sort();
    out
}

#[test]
fn played_grid_fixtures_hold() {
    let specs = collect_played_specs();
    assert!(
        !specs.is_empty(),
        "No roadmap-1.3 fixtures found in {}",
        played_fixtures_dir().display(),
    );

    let update_mode = std::env::var("UPDATE_FIXTURES")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let mut failures = Vec::new();

    for spec_path in &specs {
        let raw = fs::read_to_string(spec_path)
            .unwrap_or_else(|e| panic!("read {}: {e}", spec_path.display()));
        let spec: PlayedSpec = serde_json::from_str(&raw)
            .unwrap_or_else(|e| panic!("parse {}: {e}", spec_path.display()));

        let played = replay(&spec, RefractoryKey::Player);
        let clicked = replay(&spec, RefractoryKey::Click);

        eprintln!(
            "  [{}] divisor {} (expected {}), heard {}/{}, {} expected positions, score {} \
             (click-keyed: heard {}, score {})",
            spec.name,
            played.divisor,
            spec.expect_divisor,
            played.heard,
            played.played,
            played.expected_positions,
            played.report.score,
            clicked.heard,
            clicked.report.score,
        );

        if played.divisor != spec.expect_divisor {
            failures.push(format!(
                "[{}] the inference settled on divisor {} but the player was playing {}",
                spec.name, played.divisor, spec.expect_divisor,
            ));
        }
        if played.report.score < spec.min_score {
            failures.push(format!(
                "[{}] scored {} against a gate of {} — {} of {} played notes were heard",
                spec.name, played.report.score, spec.min_score, played.heard, played.played,
            ));
        }
        if clicked.report.score > spec.click_keyed_max_score {
            failures.push(format!(
                "[{}] keyed to the click it scored {}, over the {} ceiling: either the \
                 refractory stopped following the player or this fixture no longer \
                 exercises 1.3 at all",
                spec.name, clicked.report.score, spec.click_keyed_max_score,
            ));
        }

        // Golden the whole report too, so a change nobody meant to make
        // has to be looked at even when it stays inside the bands.
        let golden_file = golden_path(spec_path);
        let actual_json =
            serde_json::to_string_pretty(&played.report).expect("serialize SessionReport");
        if update_mode {
            fs::write(&golden_file, format!("{actual_json}\n"))
                .unwrap_or_else(|e| panic!("write {}: {e}", golden_file.display()));
            eprintln!("  UPDATED {}", golden_file.display());
            continue;
        }
        if !golden_file.exists() {
            failures.push(format!(
                "[{}] no golden at {} — run `UPDATE_FIXTURES=1 node scripts/rust-test.mjs \
                 --test highbpm_fixtures` to create it",
                spec.name,
                golden_file.display(),
            ));
            continue;
        }
        let golden_raw = fs::read_to_string(&golden_file)
            .unwrap_or_else(|e| panic!("read {}: {e}", golden_file.display()));
        let golden: SessionReport = serde_json::from_str(&golden_raw)
            .unwrap_or_else(|e| panic!("parse {}: {e}", golden_file.display()));
        let golden_json =
            serde_json::to_string_pretty(&golden).expect("serialize golden SessionReport");
        // Compare the actual report through the SAME parse the golden
        // has been through. serde_json's default float parsing is not
        // bit-exact (that is what its `float_roundtrip` feature buys,
        // and we do not enable it), so a mean deviation like
        // 3.8938775510204082 comes back one ulp off and re-serializes
        // one digit shorter. The fixtures above never noticed because
        // every float in them is 0.0. Normalising both sides keeps the
        // comparison byte-exact about everything that is actually
        // drift.
        let actual_norm = serde_json::to_string_pretty(
            &serde_json::from_str::<SessionReport>(&actual_json)
                .expect("round-trip actual SessionReport"),
        )
        .expect("re-serialize actual SessionReport");
        if actual_norm != golden_json {
            failures.push(format!(
                "[{}] SessionReport drifted.\n  actual:\n{}\n  golden:\n{}",
                spec.name, actual_norm, golden_json,
            ));
        }
    }

    if update_mode {
        return;
    }

    assert!(
        failures.is_empty(),
        "Roadmap-1.3 played-grid regression(s):\n  - {}",
        failures.join("\n  - "),
    );
}
