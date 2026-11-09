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
use yames_lib::score::{
    match_attempt, BeatMap, OnsetState, PlayedOnset, ScheduleReport, ScoreSchedule,
};
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
    /// With `alternatingDivisors` set this is bar 0's divisor and the
    /// list takes over from there.
    played_divisor: u8,
    /// Roadmap 1.4 — a player who does not stay on one grid. Bar `i`
    /// is played in `alternatingDivisors[i % len]`. Absent for every
    /// fixture that keeps one feel throughout, which is all of 1.3's.
    #[serde(default)]
    alternating_divisors: Option<Vec<u8>>,
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
    /// The divisor the inference is expected to settle on. Absent when
    /// the fixture never settles on one — see `alternatingDivisors`.
    #[serde(default)]
    expect_divisor: Option<u8>,
    /// Roadmap 1.4's second gate: how often the divisor the analyzer
    /// believes may change, per eight bars. The roadmap's number is 2.
    /// Absent means "not asserted", which is every 1.3 fixture.
    #[serde(default)]
    max_grid_changes_per_8_bars: Option<f64>,
    /// The share of the notes the player actually played that reached
    /// the analyzer at all.
    ///
    /// This is a RATCHET, not a target. A score can stay high while
    /// half the playing is inaudible — the two alternating fixtures are
    /// exactly that case — so the roadmap's score gate alone cannot
    /// tell a matcher that got better from a detector that went deaf.
    /// Each fixture carries the number its run produces today, so the
    /// next change has to say out loud if it makes the hearing worse.
    /// Raise it when the refractory question in the report is settled.
    #[serde(default)]
    min_heard_ratio: Option<f64>,
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
    /// Roadmap 1.4 — how many times `current_divisor()` changed over
    /// the whole replay. This is what the live loop debounces into an
    /// `InferredGridChanged` event, so it is the same number the
    /// roadmap's anti-flapping gate is about.
    grid_changes: u32,
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
    // The divisor of each bar. One entry per bar so a fixture can make
    // the player change feel at a bar line, which is roadmap 1.4's
    // whole subject; a fixture that does not say otherwise plays the
    // same divisor throughout and this is a run of one value.
    let bar_divisors: Vec<u8> = (0..spec.bars)
        .map(|bar| match spec.alternating_divisors.as_ref() {
            Some(list) if !list.is_empty() => list[bar as usize % list.len()].max(1),
            _ => spec.played_divisor.max(1),
        })
        .collect();
    let mut rng = Xorshift64::new(spec.seed);
    let mut played: Vec<u64> = Vec::new();
    // The bar start accumulates rather than being computed from the
    // bar index, so that a fixture on one divisor throughout lands on
    // exactly the timestamps the pre-1.4 harness produced — integer
    // note spacing does not always divide the quarter (a triplet at
    // 120 BPM is 166_666_666 ns, three of which are 2 ns short of the
    // beat), and every golden here was baked with that drift in it.
    let mut bar_start_ns = LEAD_NS;
    for bar in 0..spec.bars {
        let d = bar_divisors[bar as usize];
        let note_ns = quarter_ns / d as u64;
        for i in 0..(4 * d as u64) {
            let nominal = bar_start_ns + i * note_ns;
            if spec.jitter_ms <= 0.0 {
                played.push(nominal);
            } else {
                let jitter_ns = (rng.next_gauss() * spec.jitter_ms * 1_000_000.0) as i64;
                played.push((nominal as i64 + jitter_ns).max(0) as u64);
            }
        }
        bar_start_ns += 4 * d as u64 * note_ns;
    }

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

    // Roadmap 1.4 — what the analyzer believed as each quarter went by.
    // The live loop invents a quarter's missing grid positions when
    // that quarter's own anchor tick comes out of the held buffer, so
    // the divisor in force at that moment is the one those positions
    // are built from. Recording it here is what lets an alternating
    // fixture be scored against the grid the analyzer would actually
    // have used, transition latency and all, rather than against a
    // single divisor that no part of the run was ever on.
    let mut divisor_at_quarter: Vec<u8> = Vec::with_capacity(quarters as usize);
    let mut grid_changes: u32 = 0;
    let mut last_divisor = inference.current_divisor();

    let mut ti = 0usize;
    let mut pi = 0usize;
    while ti < ticks.len() || pi < played.len() {
        let take_tick = match (ticks.get(ti), played.get(pi)) {
            (Some(t), Some(&p)) => t.ts_ns <= p,
            (Some(_), None) => true,
            _ => false,
        };
        let mut took_anchor = false;
        if take_tick {
            inference.update_reference(&ticks[ti]);
            took_anchor = ticks[ti].subdivision_index == 0;
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
        // Order matters and mirrors the loop: refit first, then the
        // quarter's positions are built from what the refit decided.
        if took_anchor {
            divisor_at_quarter.push(inference.current_divisor());
        }
        if inference.current_divisor() != last_divisor {
            last_divisor = inference.current_divisor();
            grid_changes += 1;
        }
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
    //
    // A fixture whose player changes feel has no single divisor to be
    // built from — the run was never on one — so its grid is built
    // quarter by quarter from what the analyzer believed at the time.
    // That is the harsher reading again: a quarter the analyzer had
    // not caught up with yet is scored against the grid it was still
    // on, so transition latency shows up as missed and spurious notes,
    // which is exactly what roadmap 1.4 is asking to be measured.
    let divisor = inference.current_divisor();
    let alternating = spec
        .alternating_divisors
        .as_ref()
        .is_some_and(|l| !l.is_empty());
    let quarter_divisor = |q: u32| -> u8 {
        if alternating {
            divisor_at_quarter
                .get(q as usize)
                .copied()
                .unwrap_or(divisor)
                .max(1)
        } else {
            divisor.max(1)
        }
    };
    let mut positions: Vec<u64> = Vec::new();
    for tick in &ticks {
        let d = quarter_divisor(tick.beat_index);
        // `is_active_tick` reads the inference's own current divisor,
        // which is the right question only when the run has one. Per
        // quarter it is the same arithmetic against that quarter's.
        let on_grid = (tick.subdivision_index as u32 * d as u32) % click_total.max(1) as u32 == 0;
        if on_grid {
            positions.push(tick.ts_ns);
        }
    }
    for q in 0..quarters {
        let d = quarter_divisor(q);
        let offsets = virtual_tick_offsets(click_total, d);
        let step_ns = quarter_ns / d as u64;
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
        grid_changes,
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

        let changes_per_8_bars = played.grid_changes as f64 * 8.0 / spec.bars.max(1) as f64;
        eprintln!(
            "  [{}] divisor {} (expected {:?}), heard {}/{}, {} expected positions, score {}, \
             {} grid changes ({:.2} per 8 bars) (click-keyed: heard {}, score {})",
            spec.name,
            played.divisor,
            spec.expect_divisor,
            played.heard,
            played.played,
            played.expected_positions,
            played.report.score,
            played.grid_changes,
            changes_per_8_bars,
            clicked.heard,
            clicked.report.score,
        );

        if let Some(expected) = spec.expect_divisor {
            if played.divisor != expected {
                failures.push(format!(
                    "[{}] the inference settled on divisor {} but the player was playing {}",
                    spec.name, played.divisor, expected,
                ));
            }
        }
        if let Some(floor) = spec.min_heard_ratio {
            let ratio = played.heard as f64 / played.played.max(1) as f64;
            if ratio < floor - 1e-9 {
                failures.push(format!(
                    "[{}] only {:.3} of the played notes were heard, under the {floor} this \
                     fixture was landed at — the detector is swallowing more than it did",
                    spec.name, ratio,
                ));
            }
        }
        if let Some(limit) = spec.max_grid_changes_per_8_bars {
            if changes_per_8_bars > limit + 1e-9 {
                failures.push(format!(
                    "[{}] the grid the analyzer believes changed {:.2} times per 8 bars, \
                     over the {limit} the roadmap allows — the inference is flapping",
                    spec.name, changes_per_8_bars,
                ));
            }
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

// ---------------------------------------------------------------------------
// Roadmap 2.4 — scored against a known schedule.
//
// `score::tests` asserts the behaviour of the matcher; these assert the
// numbers, on disk, where the next person to touch `match_attempt` can
// re-run them and read the diff. The three the brief names are here:
// the dotted-eighth phrase (right, a note dropped, a note added), the
// looped two-bar schedule with a different mistake each pass, and the
// tempo step at a bar line.
//
// A fixture is a SITUATION, not a baked onset list. It carries the beat
// map as the quarter times the engine would have logged, the schedule as
// the contract has it, and what the player did in beats — turned into
// times through that beat map, which is the only honest way to do it and
// the thing the tempo-step fixture exists to prove. The `expect` block
// is what a human reads; the golden `ScheduleReport` beside it is what
// catches a change nobody meant to make.
// ---------------------------------------------------------------------------

/// A note the player made, said in the frame the score is written in.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayedNoteSpec {
    /// Quarter notes from the start of the played range. On a looping
    /// schedule this keeps counting past `lengthBeats` into pass 1.
    beat: f64,
    /// Human error, on top of where that beat actually fell.
    #[serde(default)]
    offset_ms: f64,
    #[serde(default = "default_amplitude")]
    amplitude: f32,
    #[serde(default = "default_confidence")]
    confidence: f32,
}

fn default_amplitude() -> f32 {
    0.6
}
fn default_confidence() -> f32 {
    1.0
}

/// What the fixture says must be true, in the words the brief uses.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScheduledExpect {
    min_score: Option<f32>,
    max_score: Option<f32>,
    /// Expected-onset ids that must come back a miss, with the pass
    /// they must come back on. Every other onset must be a hit or a
    /// `softAbsent` listed below.
    #[serde(default)]
    misses: Vec<(u32, u32)>,
    #[serde(default)]
    soft_absent: Vec<(u32, u32)>,
    /// Beats the extras must be reported at, with their pass.
    #[serde(default)]
    extras: Vec<(u32, f64)>,
    passes: u32,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScheduledSpec {
    name: String,
    #[allow(dead_code)]
    description: String,
    /// Where the quarter notes actually fell, in ms — the beat log. A
    /// tempo step is a change of spacing in here and nowhere else.
    quarter_times_ms: Vec<f64>,
    schedule: ScoreSchedule,
    played: Vec<PlayedNoteSpec>,
    expect: ScheduledExpect,
}

fn scheduled_fixtures_dir() -> PathBuf {
    fixtures_dir().join("scheduled")
}

fn collect_scheduled_specs() -> Vec<PathBuf> {
    let dir = scheduled_fixtures_dir();
    let mut out = Vec::new();
    if !dir.exists() {
        return out;
    }
    for entry in fs::read_dir(&dir).expect("read highbpm_fixtures/scheduled dir") {
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
fn scheduled_fixtures_hold() {
    let specs = collect_scheduled_specs();
    assert!(
        !specs.is_empty(),
        "No roadmap-2.4 fixtures found in {}",
        scheduled_fixtures_dir().display(),
    );

    let update_mode = std::env::var("UPDATE_FIXTURES")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let weights = Instrument::ElectricGuitar.profile().score_weights;
    let mut failures = Vec::new();

    for spec_path in &specs {
        let raw = fs::read_to_string(spec_path)
            .unwrap_or_else(|e| panic!("read {}: {e}", spec_path.display()));
        let spec: ScheduledSpec = serde_json::from_str(&raw)
            .unwrap_or_else(|e| panic!("parse {}: {e}", spec_path.display()));

        let beats = BeatMap::from_quarter_times(spec.quarter_times_ms.clone());
        let mut played: Vec<PlayedOnset> = spec
            .played
            .iter()
            .map(|p| PlayedOnset {
                time_ms: beats
                    .time_at_beat(p.beat)
                    .unwrap_or_else(|| {
                        panic!(
                            "[{}] beat {} is off the end of the beat log — the fixture's \
                             quarterTimesMs is shorter than what it says was played",
                            spec.name, p.beat,
                        )
                    })
                    + p.offset_ms,
                amplitude: p.amplitude,
                confidence: p.confidence,
            })
            .collect();
        played.sort_by(|a, b| a.time_ms.partial_cmp(&b.time_ms).unwrap());

        let report = match_attempt(&spec.schedule, &beats, &played, &weights);

        eprintln!(
            "  [{}] score {:.1}, {} passes, {} hits, {} misses, {} soft-absent, {} extras",
            spec.name,
            report.score,
            report.passes,
            report
                .results
                .iter()
                .filter(|r| r.state == OnsetState::Hit)
                .count(),
            report
                .results
                .iter()
                .filter(|r| r.state == OnsetState::Miss)
                .count(),
            report
                .results
                .iter()
                .filter(|r| r.state == OnsetState::SoftAbsent)
                .count(),
            report.extras.len(),
        );

        let mut check = |ok: bool, msg: String| {
            if !ok {
                failures.push(format!("[{}] {msg}", spec.name));
            }
        };

        check(
            report.passes == spec.expect.passes,
            format!(
                "played {} times round, the fixture says {}",
                report.passes, spec.expect.passes
            ),
        );
        if let Some(min) = spec.expect.min_score {
            check(
                report.score >= min,
                format!("scored {:.1} against a gate of {min}", report.score),
            );
        }
        if let Some(max) = spec.expect.max_score {
            check(
                report.score <= max,
                format!("scored {:.1}, over its ceiling of {max}", report.score),
            );
        }

        let mut missed: Vec<(u32, u32)> = report
            .results
            .iter()
            .filter(|r| r.state == OnsetState::Miss)
            .map(|r| (r.pass, r.id))
            .collect();
        missed.sort_unstable();
        let mut want_missed = spec.expect.misses.clone();
        want_missed.sort_unstable();
        check(
            missed == want_missed,
            format!("misses were {missed:?}, the fixture says {want_missed:?}"),
        );

        let mut soft: Vec<(u32, u32)> = report
            .results
            .iter()
            .filter(|r| r.state == OnsetState::SoftAbsent)
            .map(|r| (r.pass, r.id))
            .collect();
        soft.sort_unstable();
        let mut want_soft = spec.expect.soft_absent.clone();
        want_soft.sort_unstable();
        check(
            soft == want_soft,
            format!("soft-absent were {soft:?}, the fixture says {want_soft:?}"),
        );

        check(
            report.extras.len() == spec.expect.extras.len(),
            format!(
                "reported {} extras, the fixture says {}",
                report.extras.len(),
                spec.expect.extras.len()
            ),
        );
        for (want_pass, want_beat) in &spec.expect.extras {
            let found = report
                .extras
                .iter()
                .any(|e| e.pass == *want_pass && (e.beat - want_beat).abs() < 1e-6);
            check(
                found,
                format!(
                    "no extra at beat {want_beat} on pass {want_pass}; got {:?}",
                    report
                        .extras
                        .iter()
                        .map(|e| (e.pass, e.beat))
                        .collect::<Vec<_>>()
                ),
            );
        }

        // The golden. Compared through the same parse both sides, for
        // the reason spelled out in `played_grid_fixtures_hold`:
        // serde_json's default float parsing is not bit-exact, and a
        // deviation of 3.8938775510204082 does not survive a round trip
        // unchanged. Every number in here is a float.
        let golden_file = golden_path(spec_path);
        let actual_json =
            serde_json::to_string_pretty(&report).expect("serialize ScheduleReport");
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
        let golden: ScheduleReport = serde_json::from_str(&golden_raw)
            .unwrap_or_else(|e| panic!("parse {}: {e}", golden_file.display()));
        let golden_json =
            serde_json::to_string_pretty(&golden).expect("re-serialize golden ScheduleReport");
        let actual_norm = serde_json::to_string_pretty(
            &serde_json::from_str::<ScheduleReport>(&actual_json)
                .expect("round-trip actual ScheduleReport"),
        )
        .expect("re-serialize actual ScheduleReport");
        if actual_norm != golden_json {
            failures.push(format!(
                "[{}] ScheduleReport drifted.\n  actual:\n{}\n  golden:\n{}",
                spec.name, actual_norm, golden_json,
            ));
        }
    }

    if update_mode {
        return;
    }

    assert!(
        failures.is_empty(),
        "Roadmap-2.4 scheduled-fixture regression(s):\n  - {}",
        failures.join("\n  - "),
    );
}
