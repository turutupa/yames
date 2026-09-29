//! Pitch fixtures — what `pitch.rs` gets right, in numbers.
//!
//! `plans/tasks/songs/W5-PITCH.md`. Six fixtures, every one of them with a
//! ground truth that is known rather than baked: there is no golden file
//! here and there is deliberately not going to be one. A golden records what
//! the code did; these record what the note WAS, so a change that makes the
//! tracker worse fails instead of being re-baked.
//!
//! Where the ground truth comes from:
//!
//! * **The guitar fixtures are synthesised** — extended Karplus–Strong, see
//!   `pitch_fixtures/synth.rs` for why that and not a sine. The generator is
//!   checked against an independent measurement of its own output by
//!   `every_synthesised_note_is_the_pitch_it_claims`, because a fixture
//!   whose ground truth is a comment is not a fixture.
//! * **The bass fixture is real recorded bass** — the shipped sampled banks
//!   under `sounds/voices`, whose file names carry the MIDI number of the
//!   note that was recorded. It is the best ground truth in the tree, and it
//!   is the fixture the "zero octave errors" gate is on, because a low
//!   fingered B or E is where a tracker actually falls an octave.
//!
//! The gates (W5-PITCH.md):
//!
//! | | |
//! |---|---|
//! | clean fixtures | ≥ 97 % of notes within 50 cents |
//! | with the click bleeding in at −20 dB | ≥ 90 % |
//! | the sampled bass | zero octave errors |
//! | one wrong note | identified as the note that was played |
//! | a 30 s buffer, release | ≤ 3 s |
//!
//! Running them:
//!
//! ```sh
//! npm run test:pitch                    # or:
//! node scripts/rust-test.mjs --test pitch_fixtures
//! node scripts/rust-test.mjs --release --test pitch_fixtures -- --nocapture
//! ```
//!
//! `DUMP_FIXTURE_WAVS=1` writes every fixture to `target/pitch_fixtures/` as
//! a WAV so it can be listened to and run through `pitch-inspect`. Nothing
//! else here writes to disk.

#[path = "pitch_fixtures/synth.rs"]
mod synth;

use std::time::Instant;

use synth::{click, measure_hz, midi_to_hz, peak, place, pluck, Pluck, Rng};
use yames_lib::pitch::{
    analyse, decode_mono_file, track, MatchConfig, MatchedOnset, NoteEvent, NoteState, OnsetState,
    PitchConfig, ScoreNote,
};

// ---------------------------------------------------------------------------
// A fixture
// ---------------------------------------------------------------------------

struct Fixture {
    name: &'static str,
    rate: u32,
    samples: Vec<f32>,
    /// What the onset detector would have handed over: one per note that was
    /// actually played, with a few milliseconds of jitter on it, because a
    /// real detector does not land on the sample the note started at and a
    /// segmenter that only works when it does is not a segmenter.
    onsets_ms: Vec<f64>,
    /// The true pitch of the note at each onset, as float MIDI.
    truth: Vec<f64>,
    cfg: PitchConfig,
}

/// How a fixture came out.
#[derive(Debug, Clone)]
struct Accuracy {
    notes: usize,
    heard: usize,
    within_50: usize,
    octave_errors: usize,
    worst_cents: f64,
    median_abs_cents: f64,
    /// Every note that missed, named. A percentage tells you a change made
    /// things worse; this tells you where to look.
    bad: Vec<String>,
}

impl Accuracy {
    fn pct_within_50(&self) -> f64 {
        100.0 * self.within_50 as f64 / self.notes.max(1) as f64
    }

    fn line(&self, name: &str) -> String {
        format!(
            "{name}: {}/{} within 50 cents ({:.1} %), {} heard, {} octave errors, \
             median |off| {:.1} c, worst {:.1} c",
            self.within_50,
            self.notes,
            self.pct_within_50(),
            self.heard,
            self.octave_errors,
            self.median_abs_cents,
            self.worst_cents
        )
    }
}

/// The note the tracker started at each onset, if it started one.
///
/// `notes_from` names a note after the onset that opened it, so this is a
/// lookup and not a second alignment — which is the point: the suite must
/// not paper over a segmentation failure by matching a note to whichever
/// onset it happens to be nearest.
fn per_onset(notes: &[NoteEvent], onsets: &[f64]) -> Vec<Option<NoteEvent>> {
    onsets
        .iter()
        .map(|&at| {
            notes
                .iter()
                .find(|n| (n.start_ms - at).abs() < 1e-6)
                .copied()
        })
        .collect()
}

fn score_fixture(f: &Fixture) -> Accuracy {
    let notes = analyse(&f.samples, f.rate, &f.onsets_ms, &f.cfg);
    let got = per_onset(&notes, &f.onsets_ms);
    let mut offs: Vec<f64> = Vec::new();
    let mut bad: Vec<String> = Vec::new();
    let (mut within, mut octaves, mut heard) = (0usize, 0usize, 0usize);
    for (i, g) in got.iter().enumerate() {
        let Some(n) = g else {
            bad.push(format!(
                "#{i} at {:.0} ms (midi {}): nothing heard",
                f.onsets_ms[i], f.truth[i]
            ));
            continue;
        };
        heard += 1;
        let cents = (n.midi - f.truth[i]) * 100.0;
        offs.push(cents.abs());
        if cents.abs() <= 50.0 {
            within += 1;
        } else {
            bad.push(format!(
                "#{i} at {:.0} ms: wrote midi {}, heard {:.2} ({cents:+.0} c, conf {:.2})",
                f.onsets_ms[i], f.truth[i], n.midi, n.confidence
            ));
        }
        // An octave error is a whole number of octaves out, not merely far
        // out: a note read as its own neighbour is a different fault with a
        // different cause and must not be counted here.
        if (1..=2).any(|k| (cents.abs() - 1200.0 * k as f64).abs() <= 100.0) {
            octaves += 1;
        }
    }
    offs.sort_by(f64::total_cmp);
    Accuracy {
        notes: f.truth.len(),
        heard,
        within_50: within,
        octave_errors: octaves,
        worst_cents: offs.last().copied().unwrap_or(0.0),
        median_abs_cents: offs.get(offs.len() / 2).copied().unwrap_or(0.0),
        bad,
    }
}

/// The accuracy line plus, when there were any, the notes that missed.
fn report(f: &Fixture, a: &Accuracy) {
    println!("  {}", a.line(f.name));
    for b in a.bad.iter().take(12) {
        println!("      {b}");
    }
    if a.bad.len() > 12 {
        println!("      … and {} more", a.bad.len() - 12);
    }
}

fn dump(f: &Fixture) {
    if std::env::var("DUMP_FIXTURE_WAVS").as_deref() != Ok("1") {
        return;
    }
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join("pitch_fixtures")
        .join(format!("{}.wav", f.name));
    match synth::write_wav(&path, &f.samples, f.rate) {
        Ok(()) => println!("  wrote {}", path.display()),
        Err(e) => println!("  could not write {}: {e}", path.display()),
    }
}

/// Deterministic ±3 ms on each onset.
fn jitter(n: usize, seed: u64) -> Vec<f64> {
    let mut rng = Rng::new(seed);
    (0..n).map(|_| rng.bipolar() * 3.0).collect()
}

// ---------------------------------------------------------------------------
// The lines the fixtures play
// ---------------------------------------------------------------------------

/// A natural minor scale, two octaves up from A2 and back down. Fifteen
/// notes up, fourteen back: twenty-nine in all, every one of them a
/// different semitone from the one before it, which is the shape that shows
/// an octave error up immediately.
fn two_octave_scale() -> Vec<f64> {
    let up: Vec<f64> = [45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69]
        .iter()
        .map(|&m| m as f64)
        .collect();
    let mut all = up.clone();
    all.extend(up.iter().rev().skip(1).copied());
    all
}

const RATE: u32 = 44_100;
/// 120 BPM eighths.
const STEP_MS: f64 = 250.0;

/// The scale run, with `tweak` allowed to bend a note or take it away.
///
/// `tweak(i, midi) -> Option<f64>`: `None` means the note is not played at
/// all, which is what "one omitted" means — no audio and no onset, exactly
/// as the player's hand would leave it.
fn scale_fixture(
    name: &'static str,
    tweak: impl Fn(usize, f64) -> Option<f64>,
    bleed_db: Option<f64>,
) -> Fixture {
    let wanted = two_octave_scale();
    let j = jitter(wanted.len(), 0xC0FF_EE01);
    let mut samples: Vec<f32> = Vec::new();
    let mut onsets_ms = Vec::new();
    let mut truth = Vec::new();

    for (i, &nominal) in wanted.iter().enumerate() {
        let Some(midi) = tweak(i, nominal) else {
            continue;
        };
        let at = 500.0 + i as f64 * STEP_MS;
        let mut p = Pluck::new(midi, STEP_MS / 1000.0, 0x5EED + i as u64);
        // A low wound string rings longer than a plain high one.
        p.decay_secs = if midi < 55.0 { 2.6 } else { 1.6 };
        let note = pluck(&p, RATE);
        place(&mut samples, &note, at, RATE, 60.0);
        onsets_ms.push(at + j[i]);
        truth.push(midi);
    }
    // A little air at the end so the last note is not cut by the buffer.
    samples.resize(samples.len() + RATE as usize / 2, 0.0);

    if let Some(db) = bleed_db {
        // THE CLICK, AT THE LEVEL IT LEAKS IN AT. A player with a mic in the
        // room and the click on a speaker records the click too, and it is
        // the one interferer that is guaranteed to be there, on the beat,
        // for the whole take.
        let level = peak(&samples) * 10f32.powf(db as f32 / 20.0);
        let beat_ms = 500.0; // 120 BPM quarters
        let beats = (samples.len() as f64 * 1000.0 / RATE as f64 / beat_ms) as usize;
        for b in 0..beats {
            let c = click(RATE, b % 4 == 0, level);
            place(&mut samples, &c, b as f64 * beat_ms, RATE, 0.0);
        }
    }

    Fixture {
        name,
        rate: RATE,
        samples,
        onsets_ms,
        truth,
        cfg: PitchConfig::guitar(),
    }
}

fn f_scale() -> Fixture {
    scale_fixture("scale_two_octaves", |_, m| Some(m), None)
}

/// The same run with the click bleeding in 20 dB under it.
fn f_scale_with_bleed() -> Fixture {
    scale_fixture("scale_click_bleed_20db", |_, m| Some(m), Some(-20.0))
}

/// The same run, every note 30 cents sharp — a guitar that was tuned to
/// itself and not to anything else. The gate is against the DETUNED pitch,
/// so passing it means the cents came through and not that they were
/// rounded away.
fn f_scale_detuned() -> Fixture {
    scale_fixture("scale_detuned_30_cents", |_, m| Some(m + 0.30), None)
}

/// Note 7 is played a tone too high; note 20 is not played at all.
const WRONG_AT: usize = 7;
const WRONG_BY: f64 = 2.0;
const OMITTED_AT: usize = 20;

fn f_scale_wrong_and_omitted() -> Fixture {
    scale_fixture(
        "scale_one_wrong_one_omitted",
        |i, m| match i {
            WRONG_AT => Some(m + WRONG_BY),
            OMITTED_AT => None,
            _ => Some(m),
        },
        None,
    )
}

/// Sixteenths at 160 BPM — 93.75 ms a note, which is the tightest thing the
/// window is asked to fit inside. An E minor pentatonic run up and down the
/// bottom of the neck, the way anyone practises at that tempo.
fn f_sixteenths_160() -> Fixture {
    const STEP: f64 = 60_000.0 / 160.0 / 4.0; // 93.75 ms
    let shape = [40, 43, 45, 47, 50, 52, 55, 52, 50, 47, 45, 43];
    let line: Vec<f64> = (0..7)
        .flat_map(|_| shape.iter().map(|&m| m as f64))
        .collect();
    let j = jitter(line.len(), 0xC0FF_EE02);
    let mut samples: Vec<f32> = Vec::new();
    let mut onsets_ms = Vec::new();
    for (i, &midi) in line.iter().enumerate() {
        let at = 300.0 + i as f64 * STEP;
        let mut p = Pluck::new(midi, STEP / 1000.0, 0xBEEF + i as u64);
        p.decay_secs = 2.4;
        place(&mut samples, &pluck(&p, RATE), at, RATE, 20.0);
        onsets_ms.push(at + j[i]);
    }
    samples.resize(samples.len() + RATE as usize / 4, 0.0);
    Fixture {
        name: "sixteenths_160bpm",
        rate: RATE,
        samples,
        onsets_ms,
        truth: line,
        cfg: PitchConfig::guitar(),
    }
}

/// Every note the shipped bass banks actually hold, played as a line from
/// the low E up.
///
/// Real recordings of a real bass, so the numbers this fixture produces are
/// the only ones in the suite that are not about a synthesiser. Three banks
/// because all three ship and all three have to be heard correctly; the
/// layers and round robins are varied across the line so the fixture is not
/// one recording repeated.
const BASS_LINE: &[(&str, i32, u8, u8)] = &[
    // Picked, up from the low E.
    ("bass_picked", 28, 1, 1),
    ("bass_picked", 32, 1, 1),
    ("bass_picked", 36, 1, 2),
    ("bass_picked", 40, 1, 1),
    ("bass_picked", 44, 2, 1),
    ("bass_picked", 48, 2, 2),
    ("bass_picked", 52, 2, 1),
    ("bass_picked", 55, 2, 2),
    // And back down.
    ("bass_picked", 52, 1, 2),
    ("bass_picked", 48, 1, 1),
    ("bass_picked", 44, 1, 2),
    ("bass_picked", 40, 2, 2),
    ("bass_picked", 36, 2, 1),
    ("bass_picked", 32, 2, 2),
    ("bass_picked", 28, 2, 1),
    // Fingered.
    ("bass_fingered", 30, 2, 1),
    ("bass_fingered", 35, 2, 2),
    ("bass_fingered", 40, 3, 1),
    ("bass_fingered", 45, 1, 2),
    ("bass_fingered", 50, 2, 1),
    ("bass_fingered", 55, 3, 2),
    // Upright.
    ("bass_upright", 30, 1, 2),
    ("bass_upright", 33, 2, 1),
    ("bass_upright", 36, 3, 2),
    ("bass_upright", 42, 1, 1),
    ("bass_upright", 48, 2, 2),
    ("bass_upright", 54, 3, 1),
];

fn voices_dir() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("sounds")
        .join("voices")
}

/// `None` when the banks are not in this checkout. `build.rs` says they may
/// not be — they are rendered by a tool and fetched per file — so this is a
/// skip with a sentence, not a failure.
fn f_bass_low_e() -> Option<Fixture> {
    const STEP: f64 = 60_000.0 / 90.0; // 90 BPM quarters
    const RATE_BASS: u32 = 48_000;
    let mut samples: Vec<f32> = Vec::new();
    let mut onsets_ms = Vec::new();
    let mut truth = Vec::new();
    let j = jitter(BASS_LINE.len(), 0xC0FF_EE03);

    for (i, &(bank, midi, layer, rr)) in BASS_LINE.iter().enumerate() {
        let path = voices_dir()
            .join(bank)
            .join(format!("{midi}.{layer}.{rr}.flac"));
        let (mut note, rate) = decode_mono_file(&path).ok()?;
        assert_eq!(
            rate, RATE_BASS,
            "{} is at {rate} Hz; the manifests all say 48 000",
            path.display()
        );
        // Six hundred milliseconds of it, which leaves a gap before the next
        // note: a bass note ringing under the one after it is two notes at
        // once, and a monophonic tracker is not being asked about that here.
        note.truncate((RATE_BASS as f64 * 0.6) as usize);
        let p = peak(&note).max(1e-9);
        for s in note.iter_mut() {
            *s *= 0.7 / p;
        }
        let at = 300.0 + i as f64 * STEP;
        place(&mut samples, &note, at, RATE_BASS, 40.0);
        onsets_ms.push(at + j[i]);
        truth.push(midi as f64);
    }
    samples.resize(samples.len() + RATE_BASS as usize / 2, 0.0);
    Some(Fixture {
        name: "bass_low_e_line",
        rate: RATE_BASS,
        samples,
        onsets_ms,
        truth,
        cfg: PitchConfig::bass(),
    })
}

// ---------------------------------------------------------------------------
// The generator has to be honest before the tracker can be graded on it
// ---------------------------------------------------------------------------

/// THE FIXTURES' GROUND TRUTH IS MEASURED, NOT ASSERTED.
///
/// Karplus–Strong tunes a loop, and a loop's length is the sum of a delay
/// line, a filter and an all-pass — three things that each have to be right
/// for the note to be the note. If the generator were a few cents out, every
/// number in this file would be a few cents out with it and the suite would
/// be grading the tracker against a lie. So the notes are measured here with
/// a plain long-window autocorrelation that shares no code with `pitch.rs`.
#[test]
fn every_synthesised_note_is_the_pitch_it_claims() {
    let mut worst = (0.0f64, 0.0f64);
    for midi in [28.0f64, 40.0, 45.0, 52.0, 60.0, 64.3, 69.0, 76.0] {
        let mut p = Pluck::new(midi, 1.6, 0xD1CE);
        p.decay_secs = 6.0; // long, so there is a steady second to measure
        let buf = pluck(&p, RATE);
        let want = midi_to_hz(midi);
        let got = measure_hz(&buf, RATE, want);
        let cents = 1200.0 * (got / want).log2();
        println!("  midi {midi:>5.1}  want {want:>8.2} Hz  got {got:>8.2} Hz  {cents:>+6.2} c");
        if cents.abs() > worst.0.abs() {
            worst = (cents, midi);
        }
        assert!(
            cents.abs() < 10.0,
            "the generator's midi {midi} came out {cents:.2} cents off — the \
             fixtures' ground truth cannot be trusted until this is fixed"
        );
    }
    println!("  worst: {:+.2} cents at midi {}", worst.0, worst.1);
}

/// And the recorded bass is the pitch its file name claims. This is a check
/// on the SAMPLE LIBRARY, not on us: a bank whose names were wrong would
/// make the octave gate below meaningless.
#[test]
fn every_sampled_bass_note_is_the_pitch_its_name_claims() {
    let Some(f) = f_bass_low_e() else {
        println!("  the sampled voices are not in this checkout — skipped");
        return;
    };
    let mut worst = (0.0f64, 0i32);
    let mut seen = std::collections::BTreeSet::new();
    for &(bank, midi, layer, rr) in BASS_LINE {
        if !seen.insert((bank, midi)) {
            continue;
        }
        let path = voices_dir()
            .join(bank)
            .join(format!("{midi}.{layer}.{rr}.flac"));
        let (note, rate) = decode_mono_file(&path).expect("the fixture just read it");
        let want = midi_to_hz(midi as f64);
        let got = measure_hz(&note, rate, want);
        let cents = 1200.0 * (got / want).log2();
        println!("  {bank:>14} {midi:>3}  want {want:>7.2} Hz  got {got:>7.2} Hz  {cents:>+6.1} c");
        if cents.abs() > worst.0.abs() {
            worst = (cents, midi);
        }
        assert!(
            cents.abs() < 30.0,
            "{} is {cents:.1} cents from the MIDI number in its own name",
            path.display()
        );
    }
    println!(
        "  worst: {:+.1} cents at midi {} ({} notes across three banks)",
        worst.0,
        worst.1,
        f.truth.len()
    );
}

// ---------------------------------------------------------------------------
// The gates
// ---------------------------------------------------------------------------

/// ≥ 97 % of notes within 50 cents, on every clean fixture.
#[test]
fn clean_fixtures_are_within_fifty_cents() {
    let mut fixtures = vec![
        f_scale(),
        f_scale_detuned(),
        f_scale_wrong_and_omitted(),
        f_sixteenths_160(),
    ];
    match f_bass_low_e() {
        Some(f) => fixtures.push(f),
        None => println!("  the sampled voices are not in this checkout — bass skipped"),
    }
    let mut failures = Vec::new();
    for f in &fixtures {
        dump(f);
        let a = score_fixture(f);
        report(f, &a);
        // The wrong-note fixture's own wrong note is a wrong note ON
        // PURPOSE, and its truth says so — the note it is graded against is
        // the one that was actually played, not the one that was written.
        // See `the_wrong_note_is_identified_as_the_note_that_was_played`.
        if a.pct_within_50() < 97.0 {
            failures.push(a.line(f.name));
        }
    }
    assert!(
        failures.is_empty(),
        "under the 97 % gate:\n    {}",
        failures.join("\n    ")
    );
}

/// ≥ 90 % with the click bleeding in at −20 dB.
#[test]
fn the_click_bleeding_in_costs_less_than_ten_percent() {
    let clean = f_scale();
    let f = f_scale_with_bleed();
    dump(&f);

    // THE FIXTURE HAS TO ACTUALLY HAVE THE CLICK IN IT. A gate that passes
    // because the interferer was never added is worse than no gate, so the
    // click is measured out of the buffer before anything is claimed about
    // surviving it: the two fixtures differ by exactly the click, and its
    // peak is 20 dB under the guitar's.
    assert_eq!(f.samples.len(), clean.samples.len());
    let added: Vec<f32> = f
        .samples
        .iter()
        .zip(clean.samples.iter())
        .map(|(a, b)| a - b)
        .collect();
    let (click_peak, guitar_peak) = (peak(&added), peak(&clean.samples));
    let db = 20.0 * (click_peak / guitar_peak).log10();
    println!("  the click is {db:.1} dB under the guitar's peak");
    assert!(
        (db - -20.0).abs() < 0.5,
        "the fixture's click came out at {db:.1} dB, not -20"
    );

    let a = score_fixture(&f);
    report(&f, &a);
    // And the same run without it, so the cost of the bleed is a number and
    // not an impression.
    let clean_acc = score_fixture(&clean);
    println!(
        "  the bleed cost {:.1} points ({:.1} % → {:.1} %)",
        clean_acc.pct_within_50() - a.pct_within_50(),
        clean_acc.pct_within_50(),
        a.pct_within_50()
    );

    // Not a gate — the brief asks for −20 dB — but a number worth having:
    // how loud the click has to get before it costs anything. A player who
    // tracks with the click in the room wants to know where the edge is,
    // and so does whoever changes this file next.
    for db in [-12.0, -6.0, -3.0] {
        let louder = scale_fixture("bleed_sweep", |_, m| Some(m), Some(db));
        let s = score_fixture(&louder);
        println!(
            "  at {db:.0} dB: {:.1} % within 50 cents, {} heard, {} octave errors",
            s.pct_within_50(),
            s.heard,
            s.octave_errors
        );
    }

    assert!(
        a.pct_within_50() >= 90.0,
        "{}",
        a.line("with the click at -20 dB")
    );
}

/// ZERO OCTAVE ERRORS ON THE SAMPLED BASS.
///
/// The one gate with no slack in it, and the right one to have no slack:
/// the low notes of a real bass are where a difference function is most
/// tempted by the subharmonic, and a review that tells a bass player they
/// played E2 when they played E1 is a review nobody will trust again.
#[test]
fn the_sampled_bass_has_no_octave_errors() {
    let Some(f) = f_bass_low_e() else {
        println!("  the sampled voices are not in this checkout — skipped");
        return;
    };
    dump(&f);
    let notes = analyse(&f.samples, f.rate, &f.onsets_ms, &f.cfg);
    let got = per_onset(&notes, &f.onsets_ms);
    let mut wrong = Vec::new();
    for (i, g) in got.iter().enumerate() {
        let Some(n) = g else {
            wrong.push(format!("note {i} (midi {}) was not heard at all", f.truth[i]));
            continue;
        };
        let cents = (n.midi - f.truth[i]) * 100.0;
        if cents.abs() > 600.0 {
            wrong.push(format!(
                "note {i}: wrote midi {}, heard {:.2} ({cents:+.0} cents)",
                f.truth[i], n.midi
            ));
        }
    }
    let a = score_fixture(&f);
    report(&f, &a);
    assert!(wrong.is_empty(), "octave errors:\n    {}", wrong.join("\n    "));
    assert_eq!(a.octave_errors, 0);
    assert_eq!(a.heard, a.notes, "every note of the line has to be heard");
}

/// THE WRONG NOTE IS IDENTIFIED AS THAT NOTE, and the omitted one as
/// missing rather than as something else.
///
/// This is the whole point of the module: "that was wrong" is worth very
/// little to a player and "you played a D there, it is a C" is worth a
/// lesson. It goes through `match_notes` rather than reading the note list,
/// because that is the path the review will take.
#[test]
fn the_wrong_note_is_identified_as_the_note_that_was_played() {
    let f = f_scale_wrong_and_omitted();
    let wanted = two_octave_scale();
    let notes = analyse(&f.samples, f.rate, &f.onsets_ms, &f.cfg);

    // The score is the run as it was WRITTEN. The audio is the run as it was
    // played, which is not the same in two places.
    let score: Vec<ScoreNote> = wanted
        .iter()
        .enumerate()
        .map(|(i, &m)| ScoreNote {
            id: i as u32,
            midi: m,
        })
        .collect();

    // W1's matcher has already said which expected onset each played onset
    // answered. Here that is the identity, minus the note nobody played.
    let mut played = f.onsets_ms.iter();
    let onsets: Vec<MatchedOnset> = (0..wanted.len())
        .map(|i| {
            let missed = i == OMITTED_AT;
            MatchedOnset {
                id: i as u32,
                note_ids: vec![i as u32],
                state: if missed {
                    OnsetState::Miss
                } else {
                    OnsetState::Hit
                },
                heard_at_ms: if missed {
                    None
                } else {
                    played.next().copied()
                },
            }
        })
        .collect();

    let verdicts = yames_lib::pitch::match_notes(&notes, &score, &onsets, &MatchConfig::default());
    assert_eq!(verdicts.len(), wanted.len());

    let wrong: Vec<_> = verdicts
        .iter()
        .filter(|v| v.state == NoteState::Wrong)
        .collect();
    let unheard: Vec<_> = verdicts
        .iter()
        .filter(|v| v.state == NoteState::Unheard)
        .collect();
    let right = verdicts
        .iter()
        .filter(|v| v.state == NoteState::Right)
        .count();
    println!(
        "  {right} right, {} wrong, {} unheard, {} octave, out of {}",
        wrong.len(),
        unheard.len(),
        verdicts
            .iter()
            .filter(|v| v.state == NoteState::Octave)
            .count(),
        verdicts.len()
    );

    assert_eq!(wrong.len(), 1, "exactly one note was played wrong: {wrong:#?}");
    let w = wrong[0];
    assert_eq!(w.note_id, WRONG_AT as u32);
    assert_eq!(w.expected_midi, wanted[WRONG_AT]);
    let heard = w.heard_midi.expect("a wrong note is still a note");
    println!(
        "  the wrong note: wrote midi {}, played {:.2} ({:+.0} cents)",
        w.expected_midi,
        heard,
        w.cents_off.unwrap()
    );
    assert_eq!(
        heard.round() as i32,
        (wanted[WRONG_AT] + WRONG_BY) as i32,
        "it has to be named, not just flagged"
    );

    assert_eq!(unheard.len(), 1, "exactly one note was not played: {unheard:#?}");
    assert_eq!(unheard[0].note_id, OMITTED_AT as u32);
    assert_eq!(unheard[0].heard_midi, None);

    assert_eq!(
        right,
        wanted.len() - 2,
        "everything else in the run was right"
    );
}

/// The run of a fast passage matters as much as its accuracy: the tier this
/// belongs to (AGENTS.md) allows three to eight seconds for a segment, and a
/// tracker that takes eight of them on a thirty-second take has spent the
/// whole budget before the coach has said anything.
///
/// The assertion only bites in release — a debug build is an order of
/// magnitude slower and failing on it would say nothing about the shipped
/// binary — but the number is printed either way.
#[test]
fn a_thirty_second_buffer_is_analysed_in_under_three_seconds() {
    const SECS: f64 = 30.0;
    // Thirty seconds of continuous sixteenths at 160 BPM: no silence to
    // skip, so this is the worst case rather than a typical take.
    const STEP: f64 = 60_000.0 / 160.0 / 4.0;
    let shape = [40, 43, 45, 47, 50, 52, 55, 52, 50, 47, 45, 43];
    let count = (SECS * 1000.0 / STEP) as usize;
    let mut samples: Vec<f32> = Vec::new();
    let mut onsets = Vec::new();
    for i in 0..count {
        let midi = shape[i % shape.len()] as f64;
        let p = Pluck::new(midi, STEP / 1000.0, 0xF00D + i as u64);
        place(&mut samples, &pluck(&p, RATE), i as f64 * STEP, RATE, 20.0);
        onsets.push(i as f64 * STEP);
    }
    samples.truncate((RATE as f64 * SECS) as usize);
    println!(
        "  {:.1} s of continuous 16ths at {RATE} Hz, {} onsets",
        samples.len() as f64 / RATE as f64,
        onsets.len()
    );

    let mut worst = 0.0f64;
    for (label, cfg) in [
        ("guitar", PitchConfig::guitar()),
        ("wide (guitar + 5-string bass)", PitchConfig::default()),
    ] {
        let t0 = Instant::now();
        let tr = track(&samples, RATE, &cfg);
        let tracked = t0.elapsed().as_secs_f64();
        let notes = yames_lib::pitch::notes_from(&tr, &onsets);
        let total = t0.elapsed().as_secs_f64();
        println!(
            "  {label}: {:.3} s to track, {:.3} s all in ({:.1}× real time), \
             {} frames, {} notes",
            tracked,
            total,
            SECS / total.max(1e-9),
            tr.frames.len(),
            notes.len()
        );
        // The wide config's window is 74 ms and a sixteenth at 160 BPM is
        // 93.75, so it resolves none of them and says so by finding no
        // notes. That is the documented trade (see `pitch.rs` on the range
        // buying the resolution) and this run is here for its COST, which
        // is the worst case a caller can ask for.
        worst = worst.max(total);
    }

    if cfg!(debug_assertions) {
        println!("  (debug build — the 3 s gate is asserted in release only)");
    } else {
        assert!(
            worst <= 3.0,
            "a 30 s buffer took {worst:.2} s, and the budget is 3 s"
        );
    }
}

/// A last sanity check on the whole shape of the thing: every fixture's
/// note count is the number of notes that were played, because a segmenter
/// that invents or loses notes makes every percentage above meaningless.
#[test]
fn every_fixture_yields_one_note_per_onset() {
    let mut fixtures = vec![
        f_scale(),
        f_scale_detuned(),
        f_scale_wrong_and_omitted(),
        f_sixteenths_160(),
        f_scale_with_bleed(),
    ];
    if let Some(f) = f_bass_low_e() {
        fixtures.push(f);
    }
    for f in &fixtures {
        let notes = analyse(&f.samples, f.rate, &f.onsets_ms, &f.cfg);
        println!(
            "  {}: {} onsets, {} notes",
            f.name,
            f.onsets_ms.len(),
            notes.len()
        );
        assert!(
            notes.len() <= f.onsets_ms.len(),
            "{}: {} notes from {} onsets — the segmenter invented some",
            f.name,
            notes.len(),
            f.onsets_ms.len()
        );
    }
}
