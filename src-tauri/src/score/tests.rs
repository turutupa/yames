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

    // LP C3, per note. Played flat, every written accent is reported as
    // one that did not come out; dug in, every one of them did. Either
    // way the score is the same number, which is the whole point of
    // "reported, not scored".
    let verdicts = |r: &ScheduleReport| -> (usize, usize) {
        let heard = r
            .results
            .iter()
            .filter(|x| x.accent_heard == Some(true))
            .count();
        let not = r
            .results
            .iter()
            .filter(|x| x.accent_heard == Some(false))
            .count();
        (heard, not)
    };
    let written = schedule.onsets.iter().filter(|o| o.accent).count();
    assert_eq!(
        verdicts(&flat),
        (0, written),
        "played flat, no accent should have been heard",
    );
    assert_eq!(
        verdicts(&shaped),
        (written, 0),
        "dug in, every written accent should have been heard",
    );
    // And a note nobody wrote an accent on never gets a verdict.
    assert!(
        shaped
            .results
            .iter()
            .filter(|r| !schedule.onsets[r.id as usize].accent)
            .all(|r| r.accent_heard.is_none()),
        "a plain note was given an accent verdict",
    );
}

#[test]
fn an_accent_nobody_played_gets_no_verdict_rather_than_a_guess() {
    // An accent on a note that was never played, and an accent whose
    // neighbours were never played. Neither has anything to compare, so
    // neither may answer — a `false` here would read to the player as
    // "you did not accent that", about a note they never reached.
    let mut schedule = dotted8th_16th_schedule(4);
    schedule.onsets[4].accent = true;
    schedule.onsets[10].accent = true;
    let beats = steady(120.0, 20);

    let played: Vec<PlayedOnset> = schedule
        .onsets
        .iter()
        .filter(|o| ![4, 9, 11].contains(&o.id))
        .filter_map(|o| beats.time_at_beat(o.beat))
        .map(|t| PlayedOnset {
            time_ms: t,
            amplitude: 0.6,
            confidence: 1.0,
        })
        .collect();

    let report = match_attempt(&schedule, &beats, &played, &weights());
    let verdict = |id: u32| report.results.iter().find(|r| r.id == id).unwrap().accent_heard;
    assert_eq!(verdict(4), None, "an accent that was never played answered");
    assert_eq!(
        verdict(10),
        None,
        "an accent with no played neighbour answered",
    );
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
        accent_heard: None,
    };
    let json = serde_json::to_string(&result).unwrap();
    assert!(json.contains("\"state\":\"softAbsent\""), "{json}");
    assert!(json.contains("\"deviationMs\":null"), "{json}");
    // LP C3's field is additive: with nothing to say it is not on the
    // wire at all, so a review written against the pre-accent contract
    // sees exactly what it saw before.
    assert!(!json.contains("accentHeard"), "{json}");

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

// ──────────────────────────────────────────────────────────────────────
// `plans/SONGS.md` A7 — the verdict that arrives while you are playing
// ──────────────────────────────────────────────────────────────────────

/// A schedule of straight sixteenths, `bars` bars of 4/4.
fn sixteenths(bars: u32, loops: bool) -> ScoreSchedule {
    let mut onsets = Vec::new();
    for i in 0..(bars * 16) {
        onsets.push(onset(i, i as f64 * 0.25));
    }
    ScoreSchedule {
        length_beats: (bars * 4) as f64,
        onsets,
        loops,
    }
}

/// Replay a pass into a run at the rate the analyzer actually sweeps, and
/// collect every verdict that came out, in order.
///
/// Deliberately a replay rather than a thread: the sweep is a pure function
/// of the beat map, the notes and the clock, so making the clock a variable
/// is what lets the assertions below be about the RULE. That it runs on the
/// analyzer's own thread, off real events, is
/// `timing.rs`'s `sixteenths_light_one_by_one_while_the_pass_is_running`.
///
/// The sweep clock deliberately does not line up with the music: the
/// analyzer wakes on its own 5 ms tick and the notes fall where they fall.
fn replay(
    run: &mut ScheduleRun,
    quarter_ms: f64,
    quarters: usize,
    played: &[PlayedOnset],
    until_ms: f64,
) -> Vec<LiveOnset> {
    let mut out: Vec<LiveOnset> = Vec::new();
    let mut next_beat = 0usize;
    let mut next_note = 0usize;
    let mut now = 0.0f64;
    while now <= until_ms {
        while next_beat < quarters && next_beat as f64 * quarter_ms <= now {
            run.note_quarter(next_beat == 0, next_beat as f64 * quarter_ms);
            next_beat += 1;
        }
        while next_note < played.len() && played[next_note].time_ms <= now {
            run.note_onset(played[next_note]);
            next_note += 1;
        }
        run.settle(now, &mut out);
        now += LIVE_SWEEP_MS;
    }
    out
}

#[test]
fn every_sixteenth_gets_its_own_live_verdict() {
    // The whole of A7: a bar of sixteenths played right comes back as
    // sixteen verdicts against sixteen different ids, not as four beats'
    // worth of one verdict smeared over four notes each.
    let schedule = sixteenths(1, false);
    let beats = steady(120.0, 6);
    let played = perfect_play(&schedule, &beats);
    let mut run = ScheduleRun::new(schedule);
    let live = replay(&mut run, 500.0, 6, &played, 4000.0);

    assert_eq!(
        live.len(),
        16,
        "one verdict per expected onset and no more; got {live:?}"
    );
    for (i, v) in live.iter().enumerate() {
        assert_eq!(v.id, i as u32, "verdicts arrive in the order they are played");
        assert_eq!(v.pass, 0);
        assert_eq!(
            v.state,
            OnsetState::Hit,
            "onset {i} was played on the nose and came back {:?}",
            v.state
        );
        assert!(
            v.deviation_ms.is_some_and(|d| d.abs() < 1.0),
            "onset {i} was played on the nose and reports {:?}",
            v.deviation_ms
        );
    }
}

#[test]
fn a_live_verdict_lands_within_a_beat_of_the_note_it_is_about() {
    // The gate's number. An onset settles once its matching window has
    // closed and the detector's own latency has been allowed for, so the
    // wait is a fraction of a sixteenth plus one sweep — comfortably inside
    // the beat the note was played in, which is what "live" has to mean for
    // a page a player is reading.
    let quarter = 500.0;
    let schedule = sixteenths(1, false);
    let beats = steady(120.0, 6);
    let played = perfect_play(&schedule, &beats);
    let mut run = ScheduleRun::new(schedule);

    let mut judged_at: Vec<Option<f64>> = vec![None; 16];
    let mut out: Vec<LiveOnset> = Vec::new();
    let mut next_beat = 0usize;
    let mut next_note = 0usize;
    let mut now = 0.0f64;
    while now <= 8.0 * quarter {
        while next_beat < 6 && next_beat as f64 * quarter <= now {
            run.note_quarter(next_beat == 0, next_beat as f64 * quarter);
            next_beat += 1;
        }
        while next_note < played.len() && played[next_note].time_ms <= now {
            run.note_onset(played[next_note]);
            next_note += 1;
        }
        out.clear();
        run.settle(now, &mut out);
        for v in out.iter() {
            judged_at[v.id as usize] = Some(now);
        }
        now += LIVE_SWEEP_MS;
    }

    for (i, at) in judged_at.iter().enumerate() {
        let at = at.unwrap_or_else(|| panic!("onset {i} never got a live verdict"));
        let played_at = i as f64 * 0.25 * quarter;
        let lag = at - played_at;
        assert!(
            lag <= quarter,
            "onset {i} was played at {played_at} ms and judged at {at} ms — \
             {lag} ms later, which is past the beat it was played in"
        );
    }
}

#[test]
fn a_dropped_note_is_reported_live_as_its_own_id_and_nobody_elses() {
    // The failure `align_pass` exists to avoid, on the live path. Drop one
    // sixteenth out of a bar and every note after it is still a hit; a
    // nearest-neighbour matcher would slide and report nine mistakes for
    // one. The context either side of the settled run is what buys this.
    let schedule = sixteenths(1, false);
    let beats = steady(120.0, 6);
    let mut played = perfect_play(&schedule, &beats);
    played.remove(6);
    let mut run = ScheduleRun::new(schedule);
    let live = replay(&mut run, 500.0, 6, &played, 4000.0);

    let missed: Vec<u32> = live
        .iter()
        .filter(|v| v.state != OnsetState::Hit)
        .map(|v| v.id)
        .collect();
    assert_eq!(missed, vec![6], "one note is missing, and it is note 6");
    assert_eq!(live.len(), 16, "every onset still gets exactly one verdict");
}

#[test]
fn a_loop_keeps_judging_and_says_which_time_round() {
    // A two-beat loop played three times. Each pass carries its own
    // verdicts with `pass` on them — the contract's rule for the report,
    // and it has to be the same rule live or the page would light one note
    // three times and never say which go it meant.
    let schedule = ScoreSchedule {
        onsets: vec![onset(0, 0.0), onset(1, 0.5), onset(2, 1.0), onset(3, 1.5)],
        length_beats: 2.0,
        loops: true,
    };
    let beats = steady(120.0, 8);
    let mut played = Vec::new();
    for pass in 0..3u32 {
        for o in schedule.onsets.iter() {
            let t = beats
                .time_at_beat(pass as f64 * 2.0 + o.beat)
                .expect("inside the log");
            played.push(PlayedOnset {
                time_ms: t,
                amplitude: 0.6,
                confidence: 1.0,
            });
        }
    }
    let mut run = ScheduleRun::new(schedule);
    let live = replay(&mut run, 500.0, 8, &played, 5000.0);

    let played_passes: Vec<(u32, u32)> = live
        .iter()
        .take(12)
        .map(|v| (v.pass, v.id))
        .collect();
    let want: Vec<(u32, u32)> = (0..3).flat_map(|p| (0..4).map(move |i| (p, i))).collect();
    assert_eq!(
        played_passes, want,
        "three passes of four, each named by the time round"
    );
    assert!(live.iter().take(12).all(|v| v.state == OnsetState::Hit));
    // The click ran on for a fourth time round that nobody played, and the
    // sweep says so rather than stopping when the notes did — a note that is
    // due and does not arrive is a miss, live as well as in the report.
    assert!(
        live.iter().skip(12).all(|v| v.pass == 3 && v.state == OnsetState::Miss),
        "the fourth time round was not played and must read as missed: {:?}",
        &live[12..]
    );
}

#[test]
fn nothing_is_judged_past_the_last_beat_the_engine_reported() {
    // The transport stops mid-phrase. The beat log stops with it, and the
    // sweep stops there too: `BeatMap::time_at_beat` carries the last
    // interval on forever, so a sweep that trusted it would turn "the
    // player pressed stop" into two bars of misses on a page that is no
    // longer moving.
    let schedule = sixteenths(2, false);
    let beats = steady(120.0, 9);
    let played = perfect_play(&schedule, &beats);
    let mut run = ScheduleRun::new(schedule);
    for i in 0..4 {
        run.note_quarter(i == 0, i as f64 * 500.0);
    }
    for p in played.iter().filter(|p| p.time_ms <= 1500.0) {
        run.note_onset(*p);
    }
    // Four quarters of beat log, and then the clock runs on for another
    // nine beats' worth with nothing arriving.
    let mut out: Vec<LiveOnset> = Vec::new();
    let mut now = 0.0f64;
    while now <= 6000.0 {
        run.settle(now, &mut out);
        now += LIVE_SWEEP_MS;
    }
    // Beat 3 is the last one reported, so onset 12 (beat 3.00) is the last
    // that may be judged.
    let furthest = out.iter().map(|v| v.id).max();
    assert_eq!(
        furthest,
        Some(12),
        "the sweep must reach the notes that happened and stop at the last \
         reported beat; it reached {furthest:?}"
    );
    assert!(out.iter().all(|v| v.state == OnsetState::Hit));
}

#[test]
fn the_live_sweep_changes_nothing_about_the_report() {
    // The gate's third clause, and the one that matters most: the
    // end-of-attempt results are the authority and must be exactly what
    // they were before any of this existed. Two identical runs — one swept
    // twenty-five times a second the whole way through, one never swept at
    // all — scored at the end and compared whole.
    let schedule = sixteenths(2, false);
    let beats = steady(120.0, 10);
    let mut played = perfect_play(&schedule, &beats);
    // A pass with something in it to disagree about: a drop, a late note,
    // and one nobody asked for.
    played.remove(11);
    played[4].time_ms += 38.0;
    played.push(PlayedOnset {
        time_ms: 1420.0,
        amplitude: 0.5,
        confidence: 1.0,
    });
    played.sort_by(|a, b| a.time_ms.partial_cmp(&b.time_ms).unwrap());

    let mut swept = ScheduleRun::new(schedule.clone());
    let live = replay(&mut swept, 500.0, 10, &played, 6000.0);
    assert!(!live.is_empty(), "the swept run has to have actually swept");

    let mut quiet = ScheduleRun::new(schedule);
    for i in 0..10 {
        quiet.note_quarter(i == 0, i as f64 * 500.0);
    }
    for p in played.iter() {
        quiet.note_onset(*p);
    }

    let a = swept.report(&weights()).expect("a report");
    let b = quiet.report(&weights()).expect("a report");
    assert_eq!(
        a, b,
        "the live sweep moved the attempt's own verdicts — it may only read"
    );
}

#[test]
fn a_schedule_with_nothing_in_it_settles_nothing() {
    // Free play's shape, reached the other way. `timing.rs` never calls
    // this without a schedule at all, and a schedule of no onsets must go
    // quiet rather than divide by its own length.
    let mut run = ScheduleRun::new(ScoreSchedule {
        onsets: Vec::new(),
        length_beats: 0.0,
        loops: true,
    });
    let mut out: Vec<LiveOnset> = Vec::new();
    for i in 0..8 {
        run.note_quarter(i == 0, i as f64 * 500.0);
    }
    let mut now = 0.0f64;
    while now < 8000.0 {
        run.settle(now, &mut out);
        now += LIVE_SWEEP_MS;
    }
    assert!(out.is_empty(), "nothing was due, so nothing can be judged");
}
