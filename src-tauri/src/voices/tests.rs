//! What a melodic bank is, and what the loader owes the tool that renders
//! one.
//!
//! Every test here writes real WAVs to a real disk, exactly as `kit/tests.rs`
//! does and for the same reason: this module exists to read files it did not
//! write, and a fake filesystem would test the fake.

use super::*;
use hound::{SampleFormat, WavSpec, WavWriter};

/// A directory of its own, removed when the test drops it.
struct Scratch(PathBuf);

impl Scratch {
    fn new(what: &str) -> Self {
        let dir = std::env::temp_dir().join(format!(
            "yames-voice-{what}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("a scratch directory");
        Self(dir)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// The frequency of a MIDI note, at concert pitch.
fn hz(midi: u8) -> f64 {
    440.0 * 2f64.powf((midi as f64 - 69.0) / 12.0)
}

/// One sampled note: a sine at its own pitch, so a test can ask what came
/// out of the resampler and get an answer in hertz.
///
/// A sine rather than a bass, because what these tests are about is the
/// BUILDER — and a sine is the one signal whose transposition can be stated
/// as a number rather than described.
///
/// **It starts and ends on zero, with a raised cosine over five
/// milliseconds at each end**, and that is not decoration: it is rule 6 of
/// `src-tauri/sounds/KITS.md` and the format's own "first and last sample on
/// zero". A buffer that stops mid-waveform is a step, a windowed sinc rings
/// around a step by up to nine per cent, and the ringing lands in a
/// different place at every rate — so a fixture that ended anywhere would
/// have this module's level tests measuring a fault in the fixture.
#[allow(clippy::too_many_arguments)]
fn write_note(dir: &Path, midi: u8, layer: u8, robin: u8, sr: u32, secs: f64, amp: f64) {
    let spec = WavSpec {
        channels: 1,
        sample_rate: sr,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };
    let path = dir.join(format!("{midi}.{layer}.{robin}.wav"));
    let mut w = WavWriter::create(&path, spec).expect("a writable WAV");
    let freq = hz(midi);
    // A whole number of cycles, so the last sample is the zero the first one
    // was.
    let period = sr as f64 / freq;
    let frames = ((secs * sr as f64 / period).round().max(1.0) * period) as usize;
    let fade = ((0.005 * sr as f64) as usize).min(frames / 2).max(1);
    for i in 0..frames {
        let mut v = amp * (2.0 * std::f64::consts::PI * freq * i as f64 / sr as f64).sin();
        // The raised cosine, in and out, so the slope lands on zero too.
        let ramp = |x: f64| 0.5 - 0.5 * (std::f64::consts::PI * x.clamp(0.0, 1.0)).cos();
        if i < fade {
            v *= ramp(i as f64 / fade as f64);
        }
        if i + fade >= frames {
            v *= ramp((frames - 1 - i) as f64 / fade as f64);
        }
        w.write_sample((v * 32767.0).round().clamp(-32768.0, 32767.0) as i16)
            .unwrap();
    }
    w.finalize().expect("a finalised WAV");
}

/// A whole bank folder: a manifest and one file per note, layer and robin.
///
/// The layers carry different LEVELS, the way a recording does — a soft
/// stroke is quieter as well as different — so a test can say which layer
/// played by measuring one.
fn write_bank(dir: &Path, notes: &[u8], layers: u8, rr: u8, release_ms: f32, trim_db: f32) {
    let manifest = format!(
        r#"{{ "id": "bass_fingered", "name": "Fingered bass",
              "credit": "a sine, written by a test", "licence": "CC0-1.0",
              "rate": 48000, "channels": 1, "layers": {layers}, "rr": {rr},
              "trim_db": {trim_db}, "release_ms": {release_ms},
              "notes": {notes:?} }}"#
    );
    std::fs::write(dir.join("voice.json"), manifest).expect("a writable manifest");
    for &n in notes {
        for l in 1..=layers {
            for r in 1..=rr {
                // Layer 1 at 0.30, the top layer at 0.90 — a bank's own
                // dynamics, which nothing here is allowed to flatten.
                let amp = 0.30 + 0.60 * ((l - 1) as f64 / (layers.max(2) - 1) as f64);
                // And a round robin that is a different LENGTH, so "which
                // recording played" is a question with an answer.
                let secs = 0.5 + 0.1 * (r - 1) as f64;
                write_note(dir, n, l, r, 48_000, secs, amp);
            }
        }
    }
}

/// The frequency of a buffer, from its upward zero crossings. The same
/// measurement `kit/tests.rs` makes, and honest here for the same reason: a
/// resampled sine is still a sine.
fn frequency_of(buf: &[f32], sr: u32) -> f64 {
    let from = (0.020 * sr as f64) as usize;
    let to = buf.len().saturating_sub((0.020 * sr as f64) as usize);
    let (mut first, mut last, mut count) = (f64::NAN, f64::NAN, 0usize);
    for i in from + 1..to {
        let (a, b) = (buf[i - 1] as f64, buf[i] as f64);
        if a <= 0.0 && b > 0.0 {
            let t = (i - 1) as f64 + (-a) / (b - a);
            if count == 0 {
                first = t;
            }
            last = t;
            count += 1;
        }
    }
    assert!(count >= 3, "only {count} zero crossings to measure");
    sr as f64 / ((last - first) / (count - 1) as f64)
}

fn peak(buf: &[f32]) -> f32 {
    buf.iter().fold(0.0f32, |m, s| m.max(s.abs()))
}

/// How far apart two pitches are, in cents.
fn cents(got: f64, want: f64) -> f64 {
    1200.0 * (got / want).log2()
}

// ---------------------------------------------------------------------------
// The pitches between the samples
// ---------------------------------------------------------------------------

/// THE PITCHES BETWEEN THE SAMPLES ARE IN TUNE.
///
/// The claim the whole module rests on: a bank holds twelve notes and the
/// band asks for twenty-eight, so most of what a musician hears was built
/// here by resampling. If that is a few cents out, the bass is a bass that
/// cannot be played with.
///
/// It is not free. A ratio between two sample rates is rational and can be
/// tabulated exactly; a semitone is `2^(1/12)` and cannot, so the kernel
/// works off the best rational approximation there is at a bounded
/// denominator (`kit::best_rational`). What that costs is measured here
/// rather than reasoned about — and the gate is a tenth of a cent, which is
/// two orders of magnitude finer than anybody's ear and four finer than a
/// guitar tuner's own tolerance.
#[test]
fn the_pitches_between_the_samples_are_in_tune() {
    let scratch = Scratch::new("in-tune");
    // The contract's own example, trimmed to the bass's range: gaps of two
    // and three semitones, which is what a library ships.
    let notes = [28u8, 31, 33, 36, 40, 43, 45, 48, 52, 55];
    write_bank(scratch.path(), &notes, 1, 1, 60.0, 0.0);
    let bank = load(scratch.path(), 48_000, 28, 55).unwrap();

    let mut worst = 0.0f64;
    for midi in 28u8..=55 {
        let buf = bank.sample(midi - 28, 0, 0);
        assert!(!buf.is_empty(), "MIDI {midi} was not built");
        let off = cents(frequency_of(buf, 48_000), hz(midi));
        if off.abs() > worst.abs() {
            worst = off;
        }
        assert!(
            off.abs() < 0.1,
            "MIDI {midi} came out {off:+.3} cents from where it should be"
        );
    }
    eprintln!("[voices] the worst-tuned note of the bank is {worst:+.4} cents out");
    assert!(
        bank.worst_stretch <= MAX_STRETCH_SEMITONES,
        "this bank's own notes should cover its range within \
         {MAX_STRETCH_SEMITONES} semitones, and the worst was {}",
        bank.worst_stretch
    );
}

/// ...and at a rate the device chose rather than the one the files were
/// rendered at. The pitch and the conversion are one walk, so a bank on a
/// 44.1 kHz device has to be the same instrument at the same pitches.
#[test]
fn a_bank_is_in_tune_at_every_rate_a_device_hands_out() {
    let scratch = Scratch::new("rates");
    write_bank(scratch.path(), &[40, 43, 46], 1, 1, 60.0, 0.0);
    for rate in [44_100u32, 48_000, 88_200, 96_000] {
        let bank = load(scratch.path(), rate, 40, 46).unwrap();
        for midi in 40u8..=46 {
            let off = cents(frequency_of(bank.sample(midi - 40, 0, 0), rate), hz(midi));
            assert!(
                off.abs() < 0.1,
                "at {rate} Hz, MIDI {midi} is {off:+.3} cents out"
            );
        }
    }
}

/// A note is built from the NEAREST sample, and never from further than the
/// contract allows when the bank's own notes are dense enough.
#[test]
fn a_note_is_built_from_the_nearest_sample() {
    let scratch = Scratch::new("nearest");
    // Two samples, six semitones apart: every note between them is within
    // three of one of them, and the middle one is a tie.
    write_bank(scratch.path(), &[40, 46], 1, 1, 60.0, 0.0);
    let bank = load(scratch.path(), 48_000, 40, 46).unwrap();
    assert_eq!(bank.worst_stretch, 3);

    // A tie goes to the LOWER sample, which is the note being stretched UP:
    // a recording slowed down loses the brightness it was played with.
    // MIDI 43's buffer is therefore 40's, resampled up three semitones —
    // shorter than the source, where 46's would have been longer.
    let source = bank.sample(0, 0, 0).len() as f64;
    let middle = bank.sample(3, 0, 0).len() as f64;
    assert!(
        middle < source,
        "MIDI 43 is {middle} samples against its source's {source}; a tie went \
         to the higher sample and slowed it down"
    );
    let ratio = source / middle;
    assert!(
        (ratio - 2f64.powf(3.0 / 12.0)).abs() < 0.01,
        "MIDI 43 was built at a ratio of {ratio}, and three semitones is \
         {}",
        2f64.powf(3.0 / 12.0)
    );
}

/// A bank whose notes leave a gap still plays — and says so once.
#[test]
fn a_gap_in_the_notes_is_covered_and_reported() {
    let scratch = Scratch::new("gap");
    write_bank(scratch.path(), &[40], 1, 1, 60.0, 0.0);
    let bank = load(scratch.path(), 48_000, 28, 55).unwrap();
    assert!(bank.worst_stretch > MAX_STRETCH_SEMITONES);
    // Every note still exists: a gap is a render to fix, not a silence to
    // ship.
    for midi in 28u8..=55 {
        assert!(
            !bank.sample(midi - 28, 0, 0).is_empty(),
            "MIDI {midi} is silent"
        );
    }
}

// ---------------------------------------------------------------------------
// Levels, layers and round robins
// ---------------------------------------------------------------------------

/// A NOTE'S LEVEL IS DECIDED ON ITS FILE.
///
/// The rule `kit.rs` moved to in the pass before this one, applied to a
/// melodic bank: what a tool measured is what plays, the resampler's ringing
/// is not divided back out, and `trim_db` is the only thing on top. A bank
/// whose layers carry a bank's own dynamics keeps them.
#[test]
fn a_notes_level_is_its_files_level_and_the_trim_on_top() {
    let scratch = Scratch::new("levels");
    write_bank(scratch.path(), &[40, 43, 46], 3, 1, 60.0, 0.0);
    let bank = load(scratch.path(), 48_000, 40, 46).unwrap();

    // A sampled note, untouched by any resampling: exactly what the file
    // carried, to the quantiser's own last bit.
    for (layer, want) in [(0u8, 0.30f32), (1, 0.60), (2, 0.90)] {
        let got = peak(bank.sample(0, layer, 0));
        assert!(
            (got - want).abs() < 0.002,
            "layer {layer} of a sampled note peaks at {got} and its file at {want}"
        );
    }
    // The dynamics survive into the notes that were BUILT, which is the
    // half a normalisation would have flattened.
    let soft = peak(bank.sample(2, 0, 0));
    let hard = peak(bank.sample(2, 2, 0));
    assert!(
        hard / soft > 2.5,
        "a built note's soft layer is {soft} against its hard layer's {hard}; \
         the bank's own dynamics did not survive being resampled"
    );

    // And the trim moves the whole bank by exactly what it says.
    let trimmed = {
        let dir = Scratch::new("levels-trim");
        write_bank(dir.path(), &[40, 43, 46], 3, 1, 60.0, -6.0);
        let b = load(dir.path(), 48_000, 40, 46).unwrap();
        peak(b.sample(0, 2, 0))
    };
    let ratio = 20.0 * (trimmed / peak(bank.sample(0, 2, 0))).log10();
    assert!(
        (ratio + 6.0).abs() < 0.1,
        "a −6 dB trim moved the bank by {ratio:+.2} dB"
    );
}

/// Layers and round robins are real: `layers × rr` different recordings per
/// note, and the loader keeps them apart.
#[test]
fn a_bank_holds_every_layer_and_every_round_robin() {
    let scratch = Scratch::new("layers");
    write_bank(scratch.path(), &[40], 3, 2, 60.0, 0.0);
    let bank = load(scratch.path(), 48_000, 40, 40).unwrap();
    assert_eq!(bank.layers(), 3);
    assert_eq!(bank.rr(), 2);
    for l in 0..3u8 {
        // The fixture makes round robin 2 a tenth of a second longer, so
        // "a different recording" is a fact rather than a hope.
        let a = bank.sample(0, l, 0).len();
        let b = bank.sample(0, l, 1).len();
        assert!(
            b > a,
            "layer {l}: both round robins are {a} samples, so one is a copy"
        );
    }
}

/// A layer the folder does not hold is filled from the nearest one it does,
/// preferring the softer on a tie — the kit's rule, so a half-rendered bank
/// plays every level rather than three levels and a silence.
#[test]
fn a_missing_layer_is_filled_from_the_nearest_one() {
    let scratch = Scratch::new("fill");
    // Declare three layers and render only the softest and the hardest.
    write_bank(scratch.path(), &[40], 3, 1, 60.0, 0.0);
    std::fs::remove_file(scratch.path().join("40.2.1.wav")).unwrap();
    let bank = load(scratch.path(), 48_000, 40, 40).unwrap();
    assert_eq!(bank.layers(), 3);
    let soft = peak(bank.sample(0, 0, 0));
    let middle = peak(bank.sample(0, 1, 0));
    assert!(!bank.sample(0, 1, 0).is_empty(), "the middle layer is silent");
    assert!(
        (middle - soft).abs() < 0.002,
        "the missing middle layer came out at {middle} and the softer \
         neighbour it should have borrowed is {soft}"
    );
}

// ---------------------------------------------------------------------------
// What a folder can do wrong
// ---------------------------------------------------------------------------

/// Every failure is a sentence, and none of them is a panic. A folder can
/// hold anything at all; this module's promise is that it says so.
#[test]
fn a_folder_that_is_wrong_is_a_sentence() {
    let scratch = Scratch::new("wrong");
    // No manifest at all.
    assert!(load(scratch.path(), 48_000, 40, 46).is_err());

    // A manifest that is not JSON.
    std::fs::write(scratch.path().join("voice.json"), "{ nope").unwrap();
    let e = load(scratch.path(), 48_000, 40, 46).unwrap_err();
    assert!(e.contains("did not parse"), "{e}");

    // A manifest with no notes in it.
    std::fs::write(
        scratch.path().join("voice.json"),
        r#"{ "id": "x", "layers": 1, "rr": 1, "notes": [] }"#,
    )
    .unwrap();
    let e = load(scratch.path(), 48_000, 40, 46).unwrap_err();
    assert!(e.contains("names no notes"), "{e}");

    // A manifest whose notes never arrived as files.
    std::fs::write(
        scratch.path().join("voice.json"),
        r#"{ "id": "x", "layers": 1, "rr": 1, "notes": [40] }"#,
    )
    .unwrap();
    let e = load(scratch.path(), 48_000, 40, 46).unwrap_err();
    assert!(e.contains("no notes"), "{e}");

    // A truncated download.
    std::fs::write(scratch.path().join("40.1.1.wav"), b"RIFFnope").unwrap();
    let e = load(scratch.path(), 48_000, 40, 46).unwrap_err();
    assert!(e.contains("could not be opened as a WAV"), "{e}");
}

/// A range nobody could ask for is refused rather than allocated.
#[test]
fn a_range_that_is_backwards_is_refused() {
    let scratch = Scratch::new("range");
    write_bank(scratch.path(), &[40], 1, 1, 60.0, 0.0);
    assert!(load(scratch.path(), 48_000, 55, 40).is_err());
}

/// The size cap is read off the headers, before a sample is decoded.
#[test]
fn a_bank_that_is_enormous_is_refused_before_it_is_decoded() {
    let scratch = Scratch::new("cap");
    write_bank(scratch.path(), &[40, 43], 1, 1, 60.0, 0.0);
    // Two half-second mono notes at 48 kHz is 192 kB decoded.
    assert!(load_capped(scratch.path(), 48_000, 40, 43, 1024).is_err());
    assert!(load_capped(scratch.path(), 48_000, 40, 43, 1024 * 1024).is_ok());
}

/// A note longer than the cap is CUT, not refused — a library's own render
/// very often carries a tail nobody hears.
#[test]
fn a_note_longer_than_the_cap_is_cut_rather_than_refused() {
    let scratch = Scratch::new("long");
    std::fs::write(
        scratch.path().join("voice.json"),
        r#"{ "id": "x", "layers": 1, "rr": 1, "notes": [40] }"#,
    )
    .unwrap();
    write_note(scratch.path(), 40, 1, 1, 48_000, MAX_NOTE_SECS + 3.0, 0.9);
    let bank = load(scratch.path(), 48_000, 40, 40).unwrap();
    let got = bank.sample(0, 0, 0).len();
    let want = (MAX_NOTE_SECS * 48_000.0) as usize;
    assert!(
        got <= want + 32 && got + 32 >= want,
        "a {:.0} s note came out {got} samples and the cap is {want}",
        MAX_NOTE_SECS + 3.0
    );
}

/// The cache re-uses a build rather than paying for one on every bar-ahead
/// send — and notices a file that changed underneath it.
#[test]
fn the_cache_re_uses_a_build_and_notices_a_replaced_file() {
    let scratch = Scratch::new("cache");
    write_bank(scratch.path(), &[40, 43], 1, 1, 60.0, 0.0);
    let cache = VoiceCache::default();
    let a = cache.get_or_load(scratch.path(), 48_000, 40, 43).unwrap();
    let b = cache.get_or_load(scratch.path(), 48_000, 40, 43).unwrap();
    assert!(Arc::ptr_eq(&a, &b), "the second send rebuilt the bank");
    assert_eq!(a.id, b.id);

    // A different rate is a different bank, or every device would play the
    // one it was not opened at.
    let other = cache.get_or_load(scratch.path(), 44_100, 40, 43).unwrap();
    assert!(!Arc::ptr_eq(&a, &other));

    // ...and a file replaced on disk while the app is open is a different
    // bank too. The stamp is nanoseconds, because two renders inside the
    // same second is most of them.
    std::thread::sleep(std::time::Duration::from_millis(5));
    write_note(scratch.path(), 40, 1, 1, 48_000, 0.9, 0.5);
    let after = cache.get_or_load(scratch.path(), 48_000, 40, 43).unwrap();
    assert!(
        !Arc::ptr_eq(&a, &after),
        "the cache kept playing the note that was replaced"
    );
}

/// A bank built at a rate is the same bank at every other rate: the same
/// instrument, the same levels, the same length in SECONDS.
#[test]
fn a_bank_is_the_same_bank_at_every_rate() {
    let scratch = Scratch::new("same");
    write_bank(scratch.path(), &[40, 43], 2, 1, 60.0, 0.0);
    let reference = load(scratch.path(), 48_000, 40, 43).unwrap();
    for rate in [44_100u32, 88_200, 96_000] {
        let bank = load(scratch.path(), rate, 40, 43).unwrap();
        for note in 0..4u8 {
            for layer in 0..2u8 {
                let a = reference.sample(note, layer, 0);
                let b = bank.sample(note, layer, 0);
                let secs_a = a.len() as f64 / 48_000.0;
                let secs_b = b.len() as f64 / rate as f64;
                assert!(
                    (secs_a - secs_b).abs() < 0.002,
                    "note {note} layer {layer} is {secs_a:.4} s at 48 kHz and \
                     {secs_b:.4} s at {rate} Hz"
                );
                let db = 20.0 * (peak(b) / peak(a)).log10();
                assert!(
                    db.abs() < 0.5,
                    "note {note} layer {layer} is {db:+.2} dB different at {rate} Hz"
                );
            }
        }
    }
}

/// The release the mixer fades over is the manifest's, in frames at the
/// rate the device opened at.
#[test]
fn the_release_arrives_as_frames_at_the_devices_rate() {
    let scratch = Scratch::new("release");
    write_bank(scratch.path(), &[40], 1, 1, 60.0, 0.0);
    assert_eq!(
        load(scratch.path(), 48_000, 40, 40).unwrap().release_frames,
        (0.060 * 48_000.0) as u32
    );
    assert_eq!(
        load(scratch.path(), 44_100, 40, 40).unwrap().release_frames,
        (0.060 * 44_100.0) as u32
    );
    // And a manifest asking for a release longer than a note is clamped
    // rather than believed.
    let long = Scratch::new("release-long");
    write_bank(long.path(), &[40], 1, 1, 10_000.0, 0.0);
    let bank = load(long.path(), 48_000, 40, 40).unwrap();
    assert_eq!(bank.release_frames, (MAX_RELEASE_MS / 1000.0 * 48_000.0) as u32);
}

/// BUILDING A BANK IS QUICK ENOUGH TO RUN ON THE COMMAND THREAD.
///
/// `set_jam` is synchronous and on the main thread, and the UI sends four to
/// six a chorus — so a bank that took a second to build would be a second of
/// the window not repainting on the first send of every jam. The contract's
/// own shape: a 3 × 2 bank of twelve sampled notes, built across the bass's
/// twenty-eight.
///
/// A wall clock on a shared machine is a fact about the machine, so the
/// NUMBER is what this test is for — it is printed, and the report quotes
/// it. The measurement on the owner's laptop: **106 ms in a release build**,
/// which is the number that matters because it is the build a musician runs,
/// and which sits beside the kit decode's own 112 ms.
///
/// The gate is a ceiling on a catastrophe rather than a benchmark, and it
/// differs by build for one reason: a debug build of this loop is fifteen
/// times slower — thirty-two multiply-adds an output sample, every one of
/// them bounds-checked and none of them inlined — and it runs alongside the
/// rest of a threaded suite. A gate tight enough to mean anything in release
/// would be a test that fails on a busy laptop and says nothing.
#[test]
fn a_melodic_bank_is_quick_enough_to_build_on_the_command_thread() {
    let scratch = Scratch::new("speed");
    let notes = [28u8, 31, 33, 36, 40, 43, 45, 48, 52, 55, 57, 60];
    write_bank(scratch.path(), &notes, 3, 2, 60.0, 0.0);
    let began = std::time::Instant::now();
    let bank = load(scratch.path(), 48_000, 28, 55).unwrap();
    let ms = began.elapsed().as_secs_f64() * 1000.0;
    eprintln!(
        "[voices] a {}×{} bank of {} sampled notes built {} notes in {ms:.0} ms \
         ({:.1} MB)",
        bank.layers(),
        bank.rr(),
        notes.len(),
        bank.notes(),
        bank.bytes as f64 / (1024.0 * 1024.0),
    );
    let ceiling = if cfg!(debug_assertions) { 8000.0 } else { 500.0 };
    assert!(
        ms < ceiling,
        "building a melodic bank took {ms:.0} ms on the command thread, \
         against a ceiling of {ceiling:.0}"
    );
}

/// THE CONTINUED FRACTION IS THE BEST APPROXIMATION THERE IS.
///
/// What the tuning above rests on, as arithmetic rather than as audio: an
/// exact ratio comes back exactly, and an irrational one comes back closer
/// than any other fraction with a denominator that small.
#[test]
fn the_rational_approximation_is_exact_when_it_can_be() {
    use crate::kit::best_rational;
    assert_eq!(best_rational(160.0 / 147.0, 4096), (160, 147));
    assert_eq!(best_rational(2.0, 4096), (2, 1));
    assert_eq!(best_rational(1.0, 4096), (1, 1));

    for steps in 1..=3i32 {
        let want = 2f64.powf(steps as f64 / 12.0);
        let (p, q) = best_rational(want, 1024);
        let got = p as f64 / q as f64;
        assert!(q <= 1024);
        // Nothing with a smaller denominator does better.
        for d in 1..=1024u64 {
            let n = (want * d as f64).round().max(1.0) as u64;
            assert!(
                (n as f64 / d as f64 - want).abs() >= (got - want).abs() - 1e-15,
                "{n}/{d} beats {p}/{q} for 2^({steps}/12)"
            );
        }
        eprintln!(
            "[voices] {steps} semitone(s) is {p}/{q}, which is {:+.5} cents out",
            1200.0 * (got / want).log2()
        );
    }
}

/// EVERY BANK THE APP SHIPS DECODES FROM ITS OWN FOLDER, AND IS IN TUNE.
///
/// The kits have this test; the melodic banks did not, and the only proof
/// the four recorded voices loaded was sixteen other tests failing when
/// they arrived. Each shipped folder is loaded at 48 kHz over the range the
/// band asks for, has at least two layers, and one sampled note measures
/// at its own pitch within five cents.
#[test]
fn every_shipped_bank_decodes_from_its_own_folder() {
    let ids = super::shipped_ids();
    assert!(!ids.is_empty(), "no melodic banks are shipped");
    for id in ids {
        let index = super::shipped_index(&id).unwrap();
        let (low, high) = if id.starts_with("bass_") {
            (crate::engine::BASS_MIN_MIDI, crate::engine::BASS_MAX_MIDI)
        } else {
            (48u8, 84u8)
        };
        let bank = super::load_shipped(index, 48_000, low, high)
            .unwrap_or_else(|e| panic!("{id} did not load: {e}"));
        assert!(bank.layers() >= 2, "{id} has {} layer(s)", bank.layers());
        assert!(bank.notes() > 0, "{id} has no notes");
        let mid = ((low as u16 + high as u16) / 2) as u8;
        // `sample` takes the index a table stores, which is `midi - low`.
        let buf = bank.sample(mid - bank.low(), 0, 0);
        assert!(!buf.is_empty(), "{id} has nothing at MIDI {mid}");
        // Not `frequency_of`: a recorded bass carries harmonics that add
        // zero crossings, and a crossing count reads a fingered F2 a major
        // third sharp. The period is found where the note best matches a
        // copy of itself, searched a quarter tone either side of the pitch
        // the bank claims.
        // On the SUSTAIN, past the first quarter second: a plucked upright's
        // attack reads twenty cents flat to any estimator while the string
        // settles, and the note the ear tunes to is the one that follows.
        let sustain = &buf[buf.len().min(12_000)..buf.len().min(36_000)];
        let got = frequency_by_autocorrelation(sustain, 48_000, hz(mid));
        let off = cents(got, hz(mid));
        assert!(
            off.abs() < 5.0,
            "{id} at MIDI {mid} sounds {got:.2} Hz, {off:+.1} cents out"
        );
    }
}

/// The fundamental of `buf` near `expect` Hz: the lag within a quarter tone
/// of the expected period that maximises the normalised autocorrelation
/// over the first half second, refined by a parabola through its
/// neighbours.
fn frequency_by_autocorrelation(buf: &[f32], sr: u32, expect: f64) -> f64 {
    let n = buf.len().min(sr as usize / 2);
    let x = &buf[..n];
    let period = sr as f64 / expect;
    let (lo, hi) = ((period / 1.03).floor() as usize, (period * 1.03).ceil() as usize);
    let energy: f64 = x.iter().map(|v| (*v as f64) * (*v as f64)).sum();
    assert!(energy > 0.0, "silence");
    let score = |lag: usize| -> f64 {
        if lag == 0 || lag >= n {
            return f64::MIN;
        }
        let mut acc = 0.0f64;
        for i in lag..n {
            acc += x[i] as f64 * x[i - lag] as f64;
        }
        acc / energy
    };
    let mut best = (f64::MIN, lo);
    for lag in lo..=hi {
        let sc = score(lag);
        if sc > best.0 {
            best = (sc, lag);
        }
    }
    let (l, r) = (score(best.1 - 1), score(best.1 + 1));
    let denom = l - 2.0 * best.0 + r;
    let refine = if denom.abs() > 1e-12 { 0.5 * (l - r) / denom } else { 0.0 };
    sr as f64 / (best.1 as f64 + refine)
}


/// See `kit::tests::one_key_decodes_once_however_many_threads_ask`: the
/// same rule for the melodic banks, whose ids the bass signature hashes.
#[test]
fn one_voice_key_builds_once_however_many_threads_ask() {
    if super::shipped_ids().is_empty() {
        eprintln!("[voices] no shipped banks, nothing to check");
        return;
    }
    let cache = std::sync::Arc::new(super::VoiceCache::default());
    let threads: Vec<_> = (0..6)
        .map(|_| {
            let cache = cache.clone();
            std::thread::spawn(move || cache.shipped(0, 48_000, 28, 55).unwrap().id)
        })
        .collect();
    let ids: Vec<u64> = threads.into_iter().map(|t| t.join().unwrap()).collect();
    assert!(ids.windows(2).all(|w| w[0] == w[1]), "one bank, ids {ids:?}");
    let first = ids[0];
    // As many other keys as the cache holds push the first out, whatever the
    // capacity is. One-note ranges, so the filler builds cost a fraction of a
    // second each.
    for note in 40u8..40 + super::CACHE_ENTRIES as u8 {
        cache.shipped(0, 48_000, note, note).unwrap();
    }
    assert!(
        !cache
            .entries
            .lock()
            .unwrap()
            .iter()
            .any(|(k, _)| *k == super::Key::Shipped(0, 48_000, 28, 55)),
        "a full cache's worth of builds later, the first is gone"
    );
    let again = cache.shipped(0, 48_000, 28, 55).unwrap().id;
    assert_eq!(first, again, "evicted and rebuilt, it is the same bank");
}

/// CLEARING THE CACHE LETS GO, AND CHANGES NO BASS PLAYER.
///
/// The voice half of `kit::tests::a_cleared_cache_lets_go_and_the_kit_comes_
/// back_the_same`, and there for the same two reasons: a phone's release
/// (`commands::release_jam_sounds`, M10) has to actually free the banks, and
/// the bank that comes back afterwards has to be the same bank as far as the
/// bar-line handshake is concerned.
#[test]
fn a_cleared_voice_cache_lets_go_and_the_bank_comes_back_the_same() {
    if super::shipped_ids().is_empty() {
        eprintln!("[voices] no shipped banks, nothing to check");
        return;
    }
    let cache = super::VoiceCache::default();
    let before = cache.shipped(0, 48_000, 28, 55).unwrap().id;
    assert_eq!(cache.len(), 1, "one bank built is one entry");
    cache.clear();
    assert_eq!(cache.len(), 0, "the release holds nothing back");
    let after = cache.shipped(0, 48_000, 28, 55).unwrap().id;
    assert_eq!(before, after, "cleared and rebuilt, it is the same bank");
}
