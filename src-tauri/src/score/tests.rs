//! Roadmap 2.4 / LP C1+C4 gates.
//!
//! The brief names three fixtures. They are here as tests rather than
//! as JSON beside `tests/highbpm_fixtures/`, because unlike a captured
//! session there is no data to check in: a dotted-eighth-and-sixteenth
//! phrase at 120 BPM is four lines of arithmetic, and writing it out as
//! a file would hide what is being asserted rather than show it. The
//! names below are the fixture names from the brief, so they stay
//! greppable against it:
//!
//!   * `120bpm_dotted8th_16th_phrase` — played right, a note dropped,
//!     a note added.
//!   * a looped two-bar schedule played three times with a different
//!     mistake each pass.
//!   * a schedule with a tempo step at a bar line.

use super::*;
use crate::instrument::Instrument;

/// The gate the brief sets for a phrase played correctly.
const PASS_MARK: f32 = 85.0;

fn weights() -> ScoreWeights {
    Instrument::ElectricGuitar.profile().score_weights
}

/// A beat map at a steady tempo. `quarters` beats, the first at 0 ms.
fn steady(bpm: f64, quarters: usize) -> BeatMap {
    let q = 60_000.0 / bpm;
    BeatMap::from_quarter_times((0..quarters).map(|i| i as f64 * q).collect())
}

fn onset(id: u32, beat: f64) -> ExpectedOnset {
    ExpectedOnset {
        id,
        beat,
        note_ids: vec![id],
        soft: false,
        accent: false,
    }
}

fn played_at(times: &[f64]) -> Vec<PlayedOnset> {
    times
        .iter()
        .map(|&t| PlayedOnset {
            time_ms: t,
            amplitude: 0.6,
            confidence: 1.0,
        })
        .collect()
}

/// The phrase the brief names: a dotted eighth and a sixteenth, over
/// and over. At 120 BPM the quarter is 500 ms, so the notes fall at
/// 0, 375, 500, 875, 1000 … — the dotted eighth is three sixteenths.
fn dotted8th_16th_schedule(bars: u32) -> ScoreSchedule {
    let mut onsets = Vec::new();
    let mut id = 0u32;
    for beat in 0..(bars * 4) {
        onsets.push(onset(id, beat as f64));
        id += 1;
        onsets.push(onset(id, beat as f64 + 0.75));
        id += 1;
    }
    ScoreSchedule {
        length_beats: (bars * 4) as f64,
        onsets,
        loops: false,
    }
}

fn perfect_play(schedule: &ScoreSchedule, beats: &BeatMap) -> Vec<PlayedOnset> {
    schedule
        .onsets
        .iter()
        .filter_map(|o| beats.time_at_beat(o.beat))
        .map(|t| PlayedOnset {
            time_ms: t,
            amplitude: 0.6,
            confidence: 1.0,
        })
        .collect()
}

// ── The beat map ────────────────────────────────────────────────────

#[test]
fn the_beat_map_interpolates_inside_a_beat() {
    let beats = steady(120.0, 5);
    assert!((beats.time_at_beat(0.0).unwrap() - 0.0).abs() < 1e-9);
    assert!((beats.time_at_beat(1.5).unwrap() - 750.0).abs() < 1e-9);
    assert!((beats.time_at_beat(4.0).unwrap() - 2000.0).abs() < 1e-9);
}

#[test]
fn the_beat_map_reads_a_tempo_step_off_the_log_not_off_a_bpm() {
    // Four quarters at 120 BPM (500 ms), then four at 90 (666.7 ms) —
    // a step at the bar line, the only kind of tempo change v1 has.
    // Nothing here is told either number: the times are the log.
    let mut times = vec![0.0, 500.0, 1000.0, 1500.0];
    let slow = 60_000.0 / 90.0;
    for i in 0..4 {
        times.push(2000.0 + i as f64 * slow);
    }
    let beats = BeatMap::from_quarter_times(times);
    assert!((beats.time_at_beat(4.0).unwrap() - 2000.0).abs() < 1e-9);
    assert!((beats.time_at_beat(5.0).unwrap() - (2000.0 + slow)).abs() < 1e-9);
    // And a beat inside the slow bar is interpolated at the slow rate.
    assert!((beats.time_at_beat(4.5).unwrap() - (2000.0 + slow / 2.0)).abs() < 1e-9);
    // The window a note there gets is the slow one.
    assert!((beats.interval_ms_at(4.5) - slow).abs() < 1e-6);
    assert!((beats.interval_ms_at(1.0) - 500.0).abs() < 1e-9);
}

#[test]
fn the_beat_map_inverts_itself() {
    let beats = steady(120.0, 9);
    for &b in &[0.0_f64, 0.25, 1.0, 3.75, 7.5] {
        let t = beats.time_at_beat(b).unwrap();
        assert!(
            (beats.beat_at_time(t).unwrap() - b).abs() < 1e-6,
            "beat {b} did not survive the round trip",
        );
    }
}

#[test]
fn a_note_before_the_first_beat_reads_as_a_negative_beat() {
    // The count-in. The review has to be able to say "you came in
    // early", which it cannot do if this clamps to zero.
    let beats = steady(120.0, 5);
    assert!(beats.beat_at_time(-250.0).unwrap() < 0.0);
}

// ── 120bpm_dotted8th_16th_phrase ────────────────────────────────────

#[test]
fn dotted8th_16th_phrase_played_right_clears_the_gate() {
    let schedule = dotted8th_16th_schedule(4);
    let beats = steady(120.0, 20);
    let played = perfect_play(&schedule, &beats);

    let report = match_attempt(&schedule, &beats, &played, &weights());

    assert_eq!(report.results.len(), schedule.onsets.len());
    assert!(
        report.results.iter().all(|r| r.state == OnsetState::Hit),
        "a clean pass reported something other than a hit",
    );
    assert!(report.extras.is_empty(), "a clean pass invented an extra");
    assert!(
        report.score >= PASS_MARK,
        "scored {} against a gate of {PASS_MARK}",
        report.score,
    );
}

#[test]
fn dotted8th_16th_phrase_survives_human_jitter() {
    // ±6 ms, deterministic, alternating so it is not a constant offset
    // the interval component would forgive outright.
    let schedule = dotted8th_16th_schedule(4);
    let beats = steady(120.0, 20);
    let played: Vec<PlayedOnset> = perfect_play(&schedule, &beats)
        .into_iter()
        .enumerate()
        .map(|(i, mut p)| {
            p.time_ms += [-6.0, 3.0, 5.0, -2.0, 0.0][i % 5];
            p
        })
        .collect();

    let report = match_attempt(&schedule, &beats, &played, &weights());
    assert!(report.results.iter().all(|r| r.state == OnsetState::Hit));
    assert!(
        report.score >= PASS_MARK,
        "scored {} against a gate of {PASS_MARK}",
        report.score,
    );
}

#[test]
fn dotted8th_16th_phrase_flags_the_dropped_note_by_its_own_id() {
    // The whole reason alignment is here. Drop note 9 and play the
    // rest correctly: nearest-neighbour would slide every note after
    // it into its predecessor's slot and report a wall of mistakes.
    let schedule = dotted8th_16th_schedule(4);
    let beats = steady(120.0, 20);
    let dropped_id = 9u32;
    let played: Vec<PlayedOnset> = schedule
        .onsets
        .iter()
        .filter(|o| o.id != dropped_id)
        .filter_map(|o| beats.time_at_beat(o.beat))
        .map(|t| PlayedOnset {
            time_ms: t,
            amplitude: 0.6,
            confidence: 1.0,
        })
        .collect();

    let report = match_attempt(&schedule, &beats, &played, &weights());

    let missed: Vec<u32> = report
        .results
        .iter()
        .filter(|r| r.state == OnsetState::Miss)
        .map(|r| r.id)
        .collect();
    assert_eq!(
        missed,
        vec![dropped_id],
        "the drop was reported as {} misses",
        missed.len(),
    );
    assert!(
        report.extras.is_empty(),
        "dropping a note should not produce an extra",
    );
    // Everybody else is still a hit, and still exactly on time.
    for r in report.results.iter().filter(|r| r.id != dropped_id) {
        assert_eq!(r.state, OnsetState::Hit, "note {} lost its hit", r.id);
        assert!(r.deviation_ms.unwrap().abs() < 1e-6, "note {} drifted", r.id);
    }
}

#[test]
fn dotted8th_16th_phrase_reports_an_added_note_and_moves_nobody_elses_score() {
    let schedule = dotted8th_16th_schedule(4);
    let beats = steady(120.0, 20);
    let clean = match_attempt(&schedule, &beats, &perfect_play(&schedule, &beats), &weights());

    // An extra note halfway through the second bar, between two
    // expected onsets and inside neither's window.
    let mut played = perfect_play(&schedule, &beats);
    let intruder = beats.time_at_beat(4.4).unwrap();
    played.push(PlayedOnset {
        time_ms: intruder,
        amplitude: 0.6,
        confidence: 1.0,
    });
    played.sort_by(|a, b| a.time_ms.partial_cmp(&b.time_ms).unwrap());

    let report = match_attempt(&schedule, &beats, &played, &weights());

    assert_eq!(report.extras.len(), 1, "the added note was not reported");
    assert!(
        (report.extras[0].beat - 4.4).abs() < 1e-6,
        "the extra was placed at beat {} rather than 4.4",
        report.extras[0].beat,
    );
    // Nobody else's score moved: same states, same deviations.
    assert_eq!(report.results, clean.results);
    // And the only component that moved is the one that is supposed to.
    assert!((report.interval_consistency - clean.interval_consistency).abs() < 1e-6);
    assert!((report.grid_alignment - clean.grid_alignment).abs() < 1e-6);
    assert!((report.hit_completeness - clean.hit_completeness).abs() < 1e-6);
    assert!(report.onset_efficiency < clean.onset_efficiency);
}

// ── A looped two-bar schedule, three passes, three mistakes ─────────

#[test]
fn a_looped_schedule_restarts_but_the_score_does_not() {
    // Two bars of eighths, looping. Pass 0 is clean, pass 1 drops a
    // note, pass 2 adds one. Each mistake must land on its own pass
    // and leave the other two alone — "a loop restarts the schedule
    // but never the score".
    let mut onsets = Vec::new();
    for i in 0..16u32 {
        onsets.push(onset(i, i as f64 * 0.5));
    }
    let schedule = ScoreSchedule {
        onsets,
        length_beats: 8.0,
        loops: true,
    };
    let beats = steady(120.0, 30);

    let dropped_id = 5u32;
    let mut times: Vec<f64> = Vec::new();
    for pass in 0..3u32 {
        let origin = pass as f64 * schedule.length_beats;
        for o in &schedule.onsets {
            if pass == 1 && o.id == dropped_id {
                continue;
            }
            times.push(beats.time_at_beat(origin + o.beat).unwrap());
        }
        if pass == 2 {
            // A note nobody asked for, a quarter of a beat off the grid.
            times.push(beats.time_at_beat(origin + 2.25).unwrap());
        }
    }
    times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let played = played_at(&times);

    let report = match_attempt(&schedule, &beats, &played, &weights());

    assert_eq!(report.passes, 3, "the loop was not counted three times");
    assert_eq!(
        report.results.len(),
        3 * schedule.onsets.len(),
        "every pass must produce a verdict for every note",
    );

    let missed: Vec<(u32, u32)> = report
        .results
        .iter()
        .filter(|r| r.state == OnsetState::Miss)
        .map(|r| (r.pass, r.id))
        .collect();
    assert_eq!(missed, vec![(1, dropped_id)], "the drop landed wrong");

    let extras: Vec<u32> = report.extras.iter().map(|e| e.pass).collect();
    assert_eq!(extras, vec![2], "the extra landed on the wrong pass");
    assert!((report.extras[0].beat - 2.25).abs() < 1e-6);

    // Pass 0 is untouched by either.
    assert!(report
        .results
        .iter()
        .filter(|r| r.pass == 0)
        .all(|r| r.state == OnsetState::Hit));
}

// ── A tempo step at a bar line ──────────────────────────────────────

#[test]
fn a_tempo_step_at_a_bar_line_is_read_off_the_beat_log() {
    // Eighths through four bars; the tempo steps from 120 to 90 at bar
    // 3. Nothing in here is told a BPM — the schedule is in beats and
    // the beat map is where the beats fell. If this module ever starts
    // computing times from a tempo, every note after the step drifts
    // by 40 ms per beat and this fails.
    let mut onsets = Vec::new();
    for i in 0..32u32 {
        onsets.push(onset(i, i as f64 * 0.5));
    }
    let schedule = ScoreSchedule {
        onsets,
        length_beats: 16.0,
        loops: false,
    };

    let fast = 500.0_f64;
    let slow = 60_000.0 / 90.0;
    let mut times: Vec<f64> = Vec::new();
    let mut t = 0.0;
    for q in 0..20 {
        times.push(t);
        t += if q < 8 { fast } else { slow };
    }
    let beats = BeatMap::from_quarter_times(times);

    let played = perfect_play(&schedule, &beats);
    let report = match_attempt(&schedule, &beats, &played, &weights());

    assert!(
        report.results.iter().all(|r| r.state == OnsetState::Hit),
        "{} notes were lost across the tempo step",
        report
            .results
            .iter()
            .filter(|r| r.state != OnsetState::Hit)
            .count(),
    );
    assert!(report.extras.is_empty());
    assert!(
        report.score >= PASS_MARK,
        "scored {} across a tempo step, against a gate of {PASS_MARK}",
        report.score,
    );

    // The window after the step is the slow one: a note 60 ms late at
    // 90 BPM is still inside its window, where at 120 it would not be.
    let mut late = perfect_play(&schedule, &beats);
    for p in late.iter_mut().skip(16) {
        p.time_ms += 60.0;
    }
    let late_report = match_attempt(&schedule, &beats, &late, &weights());
    assert!(
        late_report
            .results
            .iter()
            .skip(16)
            .all(|r| r.state == OnsetState::Hit),
        "a note inside the slow bar's window was scored as a miss",
    );
}

// ── Soft onsets ─────────────────────────────────────────────────────

#[test]
fn an_absent_hammer_on_costs_nothing() {
    // A legato run the detector could not hear. `softAbsent`, and the
    // score is the same as if those notes had never been asked for.
    let mut schedule = dotted8th_16th_schedule(4);
    for o in schedule.onsets.iter_mut().filter(|o| o.id % 2 == 1) {
        o.soft = true;
    }
    let beats = steady(120.0, 20);
    let played: Vec<PlayedOnset> = schedule
        .onsets
        .iter()
        .filter(|o| !o.soft)
        .filter_map(|o| beats.time_at_beat(o.beat))
        .map(|t| PlayedOnset {
            time_ms: t,
            amplitude: 0.6,
            confidence: 1.0,
        })
        .collect();

    let report = match_attempt(&schedule, &beats, &played, &weights());

    assert!(
        report
            .results
            .iter()
            .filter(|r| r.state == OnsetState::Miss)
            .count()
            == 0,
        "an absent soft onset was scored as a miss",
    );
    assert_eq!(
        report
            .results
            .iter()
            .filter(|r| r.state == OnsetState::SoftAbsent)
            .count(),
        schedule.onsets.len() / 2,
    );
    assert!((report.hit_completeness - 1.0).abs() < 1e-6);
    assert!(
        report.score >= PASS_MARK,
        "scored {} — legato was punished",
        report.score,
    );
}

#[test]
fn a_hammer_on_that_was_heard_is_a_hit() {
    let mut schedule = dotted8th_16th_schedule(2);
    for o in schedule.onsets.iter_mut().filter(|o| o.id % 2 == 1) {
        o.soft = true;
    }
    let beats = steady(120.0, 12);
    let report = match_attempt(
        &schedule,
        &beats,
        &perfect_play(&schedule, &beats),
        &weights(),
    );
    assert!(report.results.iter().all(|r| r.state == OnsetState::Hit));
}

// ── The count-in ────────────────────────────────────────────────────

#[test]
fn the_count_in_is_ignored_rather_than_reported_as_extras() {
    // A bar of counting in before beat 0. LP C4: the count-in is not
    // part of the attempt, and a player who strums along to it has not
    // made four mistakes.
    let schedule = dotted8th_16th_schedule(2);
    let beats = steady(120.0, 12);
    let mut played = perfect_play(&schedule, &beats);
    for i in 1..=4 {
        played.insert(
            0,
            PlayedOnset {
                time_ms: -500.0 * i as f64,
                amplitude: 0.6,
                confidence: 1.0,
            },
        );
    }
    played.sort_by(|a, b| a.time_ms.partial_cmp(&b.time_ms).unwrap());

    let report = match_attempt(&schedule, &beats, &played, &weights());
    assert!(
        report.extras.is_empty(),
        "the count-in was reported as {} extras",
        report.extras.len(),
    );
    assert!(report.results.iter().all(|r| r.state == OnsetState::Hit));
}

// ── Alignment, on its own ───────────────────────────────────────────

#[test]
fn alignment_does_not_slide_when_several_notes_in_a_row_are_dropped() {
    // Three consecutive drops. A matcher that slides would report
    // every note after them as late and then as a miss.
    let schedule = dotted8th_16th_schedule(4);
    let beats = steady(120.0, 20);
    let dropped: Vec<u32> = vec![6, 7, 8];
    let played: Vec<PlayedOnset> = schedule
        .onsets
        .iter()
        .filter(|o| !dropped.contains(&o.id))
        .filter_map(|o| beats.time_at_beat(o.beat))
        .map(|t| PlayedOnset {
            time_ms: t,
            amplitude: 0.6,
            confidence: 1.0,
        })
        .collect();

    let report = match_attempt(&schedule, &beats, &played, &weights());
    let missed: Vec<u32> = report
        .results
        .iter()
        .filter(|r| r.state != OnsetState::Hit)
        .map(|r| r.id)
        .collect();
    assert_eq!(missed, dropped);
    assert!(report.extras.is_empty());
}

#[test]
fn a_note_played_where_nothing_is_due_never_steals_a_slot() {
    // Two expected onsets a beat apart, and a note exactly between
    // them — outside both windows. It is an extra; neither expected
    // onset may claim it.
    let schedule = ScoreSchedule {
        onsets: vec![onset(0, 0.0), onset(1, 1.0)],
        length_beats: 2.0,
        loops: false,
    };
    let beats = steady(120.0, 4);
    let played = played_at(&[0.0, 250.0, 500.0]);

    let report = match_attempt(&schedule, &beats, &played, &weights());
    assert_eq!(report.results.len(), 2);
    assert!(report.results.iter().all(|r| r.state == OnsetState::Hit));
    assert_eq!(report.extras.len(), 1);
    assert!((report.extras[0].beat - 0.5).abs() < 1e-6);
}

#[test]
fn playing_nothing_at_all_is_every_note_missed_and_no_extras() {
    let schedule = dotted8th_16th_schedule(2);
    let beats = steady(120.0, 12);
    let report = match_attempt(&schedule, &beats, &[], &weights());
    assert!(report.results.iter().all(|r| r.state == OnsetState::Miss));
    assert!(report.extras.is_empty());
    assert!((report.hit_completeness - 0.0).abs() < 1e-6);
}

#[test]
fn an_empty_schedule_makes_everything_played_an_extra() {
    let schedule = ScoreSchedule {
        onsets: Vec::new(),
        length_beats: 4.0,
        loops: false,
    };
    let beats = steady(120.0, 6);
    let report = match_attempt(&schedule, &beats, &played_at(&[0.0, 500.0]), &weights());
    assert!(report.results.is_empty());
    assert_eq!(report.extras.len(), 2);
}

// ── Accents: reported, not scored ───────────────────────────────────

#[test]
fn accents_are_reported_and_cost_nothing() {
    let mut schedule = dotted8th_16th_schedule(4);
    for o in schedule.onsets.iter_mut().filter(|o| o.beat.fract() == 0.0) {
        o.accent = true;
    }
    let beats = steady(120.0, 20);

    let flat = match_attempt(&schedule, &beats, &perfect_play(&schedule, &beats), &weights());

    let mut accented = perfect_play(&schedule, &beats);
    for (i, p) in accented.iter_mut().enumerate() {
        if schedule.onsets[i].accent {
            p.amplitude = 0.9;
        }
    }
    let shaped = match_attempt(&schedule, &beats, &accented, &weights());

    // The number moves; the score does not.
    assert!((shaped.score - flat.score).abs() < 1e-4);
    assert!(shaped.accent_agreement.unwrap() > flat.accent_agreement.unwrap());
}

// ── The wire ────────────────────────────────────────────────────────

#[test]
fn the_wire_shape_is_the_one_the_brief_fixed() {
    let schedule = ScoreSchedule {
        onsets: vec![ExpectedOnset {
            id: 3,
            beat: 1.5,
            note_ids: vec![7, 8],
            soft: true,
            accent: true,
        }],
        length_beats: 4.0,
        loops: true,
    };
    let json = serde_json::to_string(&schedule).unwrap();
    assert!(json.contains("\"lengthBeats\":4.0"), "{json}");
    assert!(json.contains("\"noteIds\":[7,8]"), "{json}");
    assert!(json.contains("\"loops\":true"), "{json}");
    // And it comes back the way it went out.
    let back: ScoreSchedule = serde_json::from_str(&json).unwrap();
    assert_eq!(back, schedule);

    let result = OnsetResult {
        id: 3,
        state: OnsetState::SoftAbsent,
        deviation_ms: None,
        pass: 2,
    };
    let json = serde_json::to_string(&result).unwrap();
    assert!(json.contains("\"state\":\"softAbsent\""), "{json}");
    assert!(json.contains("\"deviationMs\":null"), "{json}");

    let extra = ExtraOnset {
        beat: 2.25,
        pass: 1,
    };
    assert_eq!(
        serde_json::to_string(&extra).unwrap(),
        "{\"beat\":2.25,\"pass\":1}",
    );
}

#[test]
fn a_non_looping_schedule_never_silently_drops_a_note() {
    // An importer that under-declares `lengthBeats` must not cost the
    // player notes they can see on the page. Only a loop needs the
    // length to decide where it wraps.
    let schedule = ScoreSchedule {
        onsets: vec![onset(0, 0.0), onset(1, 1.0), onset(2, 6.0)],
        length_beats: 2.0, // wrong, and deliberately so
        loops: false,
    };
    let beats = steady(120.0, 10);
    let played = perfect_play(&schedule, &beats);
    let report = match_attempt(&schedule, &beats, &played, &weights());
    assert_eq!(report.results.len(), 3, "a note past the declared length vanished");
    assert!(report.results.iter().all(|r| r.state == OnsetState::Hit));
    assert!(report.extras.is_empty());
}

#[test]
fn a_fast_piece_is_judged_on_a_fast_tolerance() {
    // The same playing, the same schedule, two tempos. At 180 BPM a
    // sixteenth is 83 ms and the window around it is tighter than at
    // 120, so a 20 ms wobble that is still "good" at 120 is only "ok"
    // at 180. Judging both on a hard-coded 120 BPM quarter — which this
    // did until the beat map was asked — would flatten that difference
    // away.
    let schedule = dotted8th_16th_schedule(4);
    let wobble = |beats: &BeatMap| -> f32 {
        let played: Vec<PlayedOnset> = perfect_play(&schedule, beats)
            .into_iter()
            .enumerate()
            .map(|(i, mut p)| {
                p.time_ms += if i % 2 == 0 { 20.0 } else { -20.0 };
                p
            })
            .collect();
        match_attempt(&schedule, beats, &played, &weights()).grid_alignment
    };
    let slow = wobble(&steady(120.0, 20));
    let fast = wobble(&steady(180.0, 20));
    assert!(
        fast < slow,
        "the same wobble scored {fast} at 180 BPM and {slow} at 120 — \
         the tolerance is not following the tempo",
    );
}

#[test]
fn the_smallest_gap_is_what_the_detector_should_be_told() {
    // A schedule of sixteenths at 120 BPM: 0.25 of a quarter, 125 ms.
    // That is what the refractory has to allow for, and the score
    // knows it before a note is played.
    let schedule = dotted8th_16th_schedule(2);
    assert!((smallest_gap_beats(&schedule.onsets).unwrap() - 0.25).abs() < 1e-9);
    // A schedule of nothing but whole beats asks for no more than a
    // beat's worth.
    let plain = ScoreSchedule {
        onsets: vec![onset(0, 0.0), onset(1, 1.0), onset(2, 2.0)],
        length_beats: 4.0,
        loops: false,
    };
    assert!((smallest_gap_beats(&plain.onsets).unwrap() - 1.0).abs() < 1e-9);
}
