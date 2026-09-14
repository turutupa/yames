//! What a kit folder is, and what the loader owes the person who made it.
//!
//! Every test here writes real WAVs to a real disk, on purpose: this module
//! exists to read files it did not write, and a fake filesystem would test
//! the fake.

use super::*;
use hound::{SampleFormat, WavSpec, WavWriter};

/// A directory of its own, removed when the test drops it.
struct Scratch(PathBuf);

impl Scratch {
    fn new(what: &str) -> Self {
        // The thread id keeps two tests running at once out of each other's
        // folder; `cargo test` is threaded by default.
        let dir = std::env::temp_dir().join(format!(
            "yames-kit-{what}-{}-{:?}",
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

/// `freq` Hz for `secs` seconds, at `sr`, in whatever the spec asks for.
///
/// A sine rather than a drum because the point of these tests is the
/// DECODER, and a sine is the one signal whose resampling error can be
/// stated as a number.
#[allow(clippy::too_many_arguments)]
fn write_sine(
    path: &Path,
    sr: u32,
    channels: u16,
    bits: u16,
    float: bool,
    freq: f64,
    secs: f64,
    amp: f64,
) {
    let spec = WavSpec {
        channels,
        sample_rate: sr,
        bits_per_sample: bits,
        sample_format: if float {
            SampleFormat::Float
        } else {
            SampleFormat::Int
        },
    };
    let mut w = WavWriter::create(path, spec).expect("a writable WAV");
    let frames = (secs * sr as f64) as usize;
    let full = (1i64 << (bits - 1)) as f64;
    for i in 0..frames {
        let v = amp * (2.0 * std::f64::consts::PI * freq * i as f64 / sr as f64).sin();
        for _ in 0..channels {
            if float {
                w.write_sample(v as f32).unwrap();
            } else {
                // −(2^(b−1)) .. 2^(b−1)−1, clamped so full scale cannot wrap
                // round to the other end.
                let q = (v * full).round().clamp(-full, full - 1.0) as i32;
                w.write_sample(q).unwrap();
            }
        }
    }
    w.finalize().expect("a finalised WAV");
}

/// The left channel of a decoded voice, at layer and round robin 1.
fn left(bank: &KitBank, v: KitVoice) -> Vec<f32> {
    let buf = bank.sample(v as u8, 0, 0);
    (0..buf.len() / 2).map(|i| buf[2 * i]).collect()
}

/// The frequency of a buffer, from its upward zero crossings — the same
/// measurement `engine.rs` uses on the pitched banks, and honest here for
/// the same reason: a resampled sine is still a sine.
fn frequency_of(buf: &[f32], sr: u32) -> f64 {
    // Skip the first and last few milliseconds: the resampler's kernel hangs
    // off both ends of the source and rings there.
    let from = (0.010 * sr as f64) as usize;
    let to = buf.len().saturating_sub((0.010 * sr as f64) as usize);
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

// ---------------------------------------------------------------------------
// The kits the app ships
// ---------------------------------------------------------------------------

/// EVERY SHIPPED FOLDER LOADS, AND ADDING ONE IS ADDING A FOLDER.
///
/// The list is not written down anywhere in Rust any more — `build.rs` walks
/// `sounds/kits/*/kit.json` — so this is what says the walk found something,
/// that every manifest parses, and that every file each one names decodes.
/// A kit folder half-written is a kit the app must say something about, and
/// this is where it says it.
#[test]
fn every_kit_the_app_ships_decodes_from_its_own_folder() {
    let ids = shipped_ids();
    assert!(
        ids.len() >= 5,
        "build.rs found {ids:?}, and the app ships at least room, tight, \
         brushes, electronic and raw"
    );
    for expected in ["room", "tight", "brushes", "electronic", "raw"] {
        assert!(
            ids.iter().any(|i| i == expected),
            "{expected} is missing from {ids:?}"
        );
    }
    for (i, id) in ids.iter().enumerate() {
        let bank = load_shipped(i, 48_000).unwrap_or_else(|e| panic!("{id} did not load: {e}"));
        assert_eq!(bank.rate, 48_000);
        assert_eq!(&bank.id_name, id);
        // The eight voices the synthesised kits have. The other three come
        // from the fallbacks in `jam.rs`.
        for v in [
            KitVoice::Kick,
            KitVoice::Snare,
            KitVoice::Rim,
            KitVoice::Hat,
            KitVoice::HatOpen,
            KitVoice::Ride,
            KitVoice::Crash,
        ] {
            assert!(bank.has(v), "{id} has no {}", v.file_name());
        }
        // And the snare has LAYERS: the pair `snare_lo` and `snare_hi`
        // became for the synthesised kits, or the four a recorded kit
        // carries — two layers of one drum rather than two drums, either way.
        let snare = bank.voice(KitVoice::Snare).expect("a snare");
        assert!(snare.layers() >= 2, "{id}'s snare lost a layer in the move");
        assert_ne!(
            bank.sample(KitVoice::Snare as u8, 0, 0),
            bank.sample(KitVoice::Snare as u8, 1, 0),
            "{id} plays one snare at both layers"
        );
    }
}

/// A KIT IS NOT LOUDER ON ONE DEVICE THAN ANOTHER.
///
/// The resampler is not level-preserving on a bright transient — a windowed
/// sinc rings around one, and a kit is nothing but bright transients:
/// `tight`'s closed hat peaks at 0.900 in its own 44.1 kHz file and 1.12
/// resampled to 48 kHz; the Club hat, 0.900 at 48 kHz, reaches 1.28 at 96.
/// The loader once divided every voice by that post-resample peak, and
/// that made the Club kit 3 dB quieter on a 96 kHz device than on a 48 kHz
/// one — the same kit at a different level for no reason the musician can
/// hear or control. So the level is decided on the SOURCE peak, the
/// overshoot is left as the reconstruction it is, and what this test holds
/// is what "the same" means: ENERGY, within a decibel of the file's own
/// rate, and a peak that is ringing rather than a level.
#[test]
fn a_shipped_kit_is_the_same_height_at_every_rate() {
    let energy =
        |s: &[f32], rate: u32| s.iter().map(|x| (x * x) as f64).sum::<f64>() / rate as f64;
    // A synthesised kit at its 44.1 kHz and a recorded one at its 48: the
    // bank built AT the files' own rate is the one nothing was resampled
    // for, and the one the others are held to.
    for (id, native_rate) in [("room", 44_100u32), ("club", 48_000u32)] {
        let index = shipped_index(id).expect(id);
        let native = load_shipped(index, native_rate).expect("loads at its own rate");
        for rate in [44_100, 48_000, 88_200, 96_000] {
            let bank = load_shipped(index, rate).expect("the kit loads");
            for v in KitVoice::ALL {
                let Some(voice) = bank.voice(v) else { continue };
                for l in 0..voice.layers() {
                    for r in 0..voice.rr() {
                        let here = bank.sample(v as u8, l, r);
                        let there = native.sample(v as u8, l, r);
                        let p = peak(here);
                        assert!(
                            p <= 1.5,
                            "{id} {} layer {l} at {rate} Hz peaks at {p}, which is a level, \
                             not ringing",
                            v.file_name()
                        );
                        let apart =
                            10.0 * (energy(here, rate) / energy(there, native_rate)).log10();
                        assert!(
                            apart.abs() < 1.0,
                            "{id} {} layer {l} carries {apart:+.2} dB at {rate} Hz against \
                             {native_rate}",
                            v.file_name()
                        );
                    }
                }
            }
        }
    }
}

/// THE SHIPPED KITS ARE NOT NORMALISED, AND THAT IS THE POINT.
///
/// A shipped kit's levels ARE the recording: a soft layer is quieter than a
/// hard one because that is what a soft stroke is. Normalising each voice
/// here would put the ghost note back at the backbeat's level, which is the
/// thing this pass exists to fix.
///
/// The five synthesised kits happen to carry every file at 0.900, so the
/// test that says "nothing was normalised" is the one that says the SNARE's
/// two layers still measure the same — a normaliser would have left them
/// both at 0.900 too, so the honest check is that the trims and the clamp
/// did not move anything that was already inside.
#[test]
fn a_shipped_kit_keeps_the_levels_its_files_carry() {
    let raw = shipped_index("raw").expect("the raw kit");
    let bank = load_shipped(raw, 44_100).expect("the raw kit loads");
    // At the files' own rate nothing is resampled, so nothing can have been
    // clamped, so every voice is at exactly the peak `KITS.md` measured.
    for v in [KitVoice::Kick, KitVoice::Snare, KitVoice::Crash] {
        let p = peak(bank.sample(v as u8, 0, 0));
        assert!(
            (p - 0.9).abs() < 1e-3,
            "{} came out at {p} and its file is at 0.900",
            v.file_name()
        );
    }
    // And `raw` asks the bus for more drive than the rest, out of its own
    // manifest rather than out of a match arm in the engine.
    assert!(
        bank.drive > 1.0,
        "raw asked the bus for {} and it is the kit that wants driving",
        bank.drive
    );
    let room = load_shipped(shipped_index("room").unwrap(), 44_100).unwrap();
    assert_eq!(room.drive, 1.0, "an acoustic kit asks for glue, not fuzz");
}

/// The hats sit where a right-handed drummer's hats are, and everything that
/// carries the pulse is down the middle.
///
/// And a pan can only ever take level AWAY: `pan_l`/`pan_r` are a balance
/// and not a panning law, so no kit can be made louder by being placed —
/// which is what lets the safety clamp measure a stereo render at all.
#[test]
fn the_pan_places_a_drum_and_never_raises_it() {
    let bank = load_shipped(shipped_index("room").unwrap(), 48_000).unwrap();
    let (l, r) = bank.pan(KitVoice::Hat);
    assert!(r > l, "the hats came out left of centre: {l} / {r}");
    assert!(l <= 1.0 && r <= 1.0, "a pan raised a drum: {l} / {r}");
    assert_eq!(bank.pan(KitVoice::Kick), (1.0, 1.0), "the kick is centred");
    assert_eq!(bank.pan(KitVoice::Snare), (1.0, 1.0), "so is the snare");
}

/// The manifest says what closes the open hat, and the loader believes it.
#[test]
fn the_open_hat_is_choked_by_the_stick_and_the_foot() {
    let bank = load_shipped(shipped_index("room").unwrap(), 48_000).unwrap();
    let by = bank.choked_by(KitVoice::HatOpen);
    assert!(by & KitVoice::Hat.bit() != 0, "the stick does not close it");
    assert!(by & KitVoice::HatPedal.bit() != 0, "the foot does not either");
    assert_eq!(
        bank.choked_by(KitVoice::Crash),
        0,
        "a crash is its decay and nothing in a kit stops it"
    );
    assert_eq!(bank.choked_by(KitVoice::Kick), 0);
}

// ---------------------------------------------------------------------------
// The manifest
// ---------------------------------------------------------------------------

/// The contract's own `kit.json`, parsed. If this drifts, `club` and
/// `studio` arrive as folders the app cannot read.
#[test]
fn the_contracts_manifest_parses_field_for_field() {
    let text = r#"{
      "id": "Club",
      "name": "Club",
      "credit": "Virtuosity Drums — Versilian Studios and Karoryfer Samples",
      "licence": "CC0-1.0",
      "rate": 48000,
      "channels": 2,
      "voices": {
        "kick":     { "layers": 4, "rr": 3, "trim_db": 0.0 },
        "hat_open": { "layers": 3, "rr": 2, "trim_db": 0.0, "choked_by": ["hat", "hat_pedal"] },
        "tom_lo":   { "layers": 3, "rr": 2, "trim_db": -2.0, "pan": -0.4 }
      }
    }"#;
    let m = parse_manifest(text).expect("the contract's manifest parses");
    // Lower-cased on the way in, because a kit is named by its id and a
    // hand-edited manifest is a real thing.
    assert_eq!(m.id, "club");
    assert_eq!(m.rate, 48_000);
    // No `drive` in the contract's example, so it is the recorded kits'
    // number and the manifest does not have to say so.
    assert_eq!(m.drive, 1.0);
    let kick = &m.voices["kick"];
    assert_eq!((kick.layers, kick.rr, kick.trim_db, kick.pan), (4, 3, 0.0, 0.0));
    assert_eq!(m.voices["hat_open"].choked_by, vec!["hat", "hat_pedal"]);
    assert_eq!(m.voices["tom_lo"].trim_db, -2.0);
    assert_eq!(m.voices["tom_lo"].pan, -0.4);
}

/// A manifest naming a drum this app does not have is a SENTENCE, not a
/// silent omission: a render tool that wrote `floor_tom` should be told,
/// rather than shipping a kit with a voice nobody can reach.
#[test]
fn a_manifest_that_names_a_drum_nobody_has_says_which() {
    let err = parse_manifest(r#"{"id":"x","rate":48000,"channels":2,"voices":{"floor_tom":{"layers":2}}}"#)
        .expect_err("floor_tom is not a voice");
    assert!(err.contains("floor_tom"), "{err:?}");
    assert!(err.contains("tom_lo"), "the message has to list what a kit has: {err:?}");
}

/// Layers and round robins are BOUNDS, not preferences. A manifest asking
/// for forty layers would be a hundred megabytes of decode per voice.
#[test]
fn a_manifest_asking_for_too_much_is_clamped_rather_than_refused() {
    let m = parse_manifest(
        r#"{"id":"x","rate":48000,"channels":2,"voices":{"kick":{"layers":40,"rr":90}}}"#,
    )
    .expect("a silly manifest still loads");
    assert_eq!(m.voices["kick"].layers, MAX_LAYERS);
    assert_eq!(m.voices["kick"].rr, MAX_RR);
}

/// A manifest with no id is not a kit: everything that names one — the
/// config, the picker, the cache — names it by its id.
#[test]
fn a_manifest_with_no_id_is_refused() {
    assert!(parse_manifest(r#"{"rate":48000,"channels":2,"voices":{}}"#).is_err());
    assert!(parse_manifest("not json at all").is_err());
}

// ---------------------------------------------------------------------------
// Names, layers and round robins in a folder
// ---------------------------------------------------------------------------

/// THE CONTRACT'S FILE NAMES, ALL THREE FORMS AND THE ONE ALIAS.
#[test]
fn the_file_names_mean_what_the_contract_says_they_mean() {
    // The plain form, in a folder with no `snare_soft` in it.
    assert_eq!(
        parse_file_name("snare", false),
        Some((KitVoice::Snare, 1, 1))
    );
    assert_eq!(parse_file_name("snare.3", false), Some((KitVoice::Snare, 3, 1)));
    assert_eq!(
        parse_file_name("snare.3.2", false),
        Some((KitVoice::Snare, 3, 2))
    );
    assert_eq!(
        parse_file_name("hat_open.2.1", false),
        Some((KitVoice::HatOpen, 2, 1))
    );
    // `snare_soft` is layer 1 — and in a folder that has one, the plain
    // `snare.wav` is the HARDER stroke, which is the pair that folder
    // always meant. See `parse_file_name`.
    assert_eq!(
        parse_file_name("snare_soft", true),
        Some((KitVoice::Snare, 1, 1))
    );
    assert_eq!(parse_file_name("snare", true), Some((KitVoice::Snare, 2, 1)));
    // And nothing else is a drum.
    assert_eq!(parse_file_name("guitar-loop", false), None);
    assert_eq!(parse_file_name("snare.9", false), None, "nine layers");
    assert_eq!(parse_file_name("snare.1.9", false), None, "nine round robins");
    assert_eq!(parse_file_name("snare.1.1.1", false), None, "one dot too many");
}

/// A FOLDER'S LAYERS AND ROUND ROBINS REACH THE BANK, AND THE GAPS ARE
/// FILLED FROM THE NEAREST LAYER.
///
/// The contract: "Missing layers are filled from the nearest present layer."
/// A pack with a soft and a hard snare and nothing between should play four
/// levels, not two and two silences.
#[test]
fn layers_and_round_robins() {
    let scratch = Scratch::new("layers");
    // Layers 1 and 4 only, with two round robins on layer 1 and one on 4.
    for (name, freq) in [
        ("snare.1.1", 200.0),
        ("snare.1.2", 210.0),
        ("snare.4.1", 400.0),
    ] {
        write_sine(
            &scratch.path().join(format!("{name}.wav")),
            48_000,
            1,
            16,
            false,
            freq,
            0.1,
            0.5,
        );
    }
    let bank = load(scratch.path(), 48_000).expect("the folder loads");
    let snare = bank.voice(KitVoice::Snare).expect("a snare");
    assert_eq!((snare.layers(), snare.rr()), (4, 2));

    // The tones say which buffer went where. Layers 1 and 2 are nearest to
    // layer 1; layers 3 and 4 are nearest to layer 4 — and on a tie the
    // SOFTER one wins, because a stroke you do not have is better played
    // quieter than louder.
    let f = |l: u8, r: u8| frequency_of(&{
        let b = bank.sample(KitVoice::Snare as u8, l, r);
        (0..b.len() / 2).map(|i| b[2 * i]).collect::<Vec<f32>>()
    }, 48_000);
    assert!((f(0, 0) - 200.0).abs() < 2.0, "layer 1 rr 1 is {}", f(0, 0));
    assert!((f(0, 1) - 210.0).abs() < 2.0, "layer 1 rr 2 is {}", f(0, 1));
    assert!((f(1, 0) - 200.0).abs() < 2.0, "layer 2 filled from {}", f(1, 0));
    assert!((f(2, 0) - 400.0).abs() < 4.0, "layer 3 filled from {}", f(2, 0));
    assert!((f(3, 0) - 400.0).abs() < 4.0, "layer 4 is {}", f(3, 0));
    // Layer 4 has one round robin of its own, so its second is its first
    // rather than a silence.
    assert!((f(3, 1) - 400.0).abs() < 4.0, "layer 4 rr 2 is {}", f(3, 1));

    // And `inspect` says the same thing without opening a file.
    let seen = inspect(scratch.path()).expect("the folder is readable");
    let snare = seen
        .found
        .iter()
        .find(|v| v.voice == "snare")
        .expect("a snare in the report");
    assert_eq!((snare.layers, snare.rr), (4, 2));
    assert!(seen.missing.contains(&"kick".to_string()));
}

/// THE FOLDER A MUSICIAN IS MOST LIKELY TO TRY FIRST.
///
/// A kick and a snare, plain names, no layers. It has to be a real kit: one
/// layer that every level reaches, so a groove written at level 1 and a
/// groove written at level 3 both play the snare rather than one of them
/// playing nothing.
#[test]
fn a_kick_and_a_snare_with_plain_names_are_a_kit() {
    let scratch = Scratch::new("plain");
    write_sine(&scratch.path().join("kick.wav"), 48_000, 1, 16, false, 80.0, 0.15, 0.5);
    write_sine(&scratch.path().join("Snare.WAV"), 48_000, 1, 16, false, 250.0, 0.15, 0.5);
    let bank = load(scratch.path(), 48_000).expect("the folder loads");
    assert!(bank.has(KitVoice::Kick) && bank.has(KitVoice::Snare));
    assert!(!bank.has(KitVoice::Hat), "a hat appeared from nowhere");
    let snare = bank.voice(KitVoice::Snare).expect("a snare");
    assert_eq!((snare.layers(), snare.rr()), (1, 1));
    // Every layer index resolves to the one buffer there is — the clamp in
    // `jam::resolve_voice` is what does it, and `sample` answers whatever it
    // is asked without a bounds surprise.
    assert!(!bank.sample(KitVoice::Snare as u8, 0, 0).is_empty());
    // And a folder with no manifest still knows the one choke every kit
    // has — asked of a folder that HAS an open hat, because a voice the kit
    // does not hold chokes nothing by definition.
    write_sine(
        &scratch.path().join("hat_open.wav"),
        48_000,
        1,
        16,
        false,
        9000.0,
        0.3,
        0.5,
    );
    let bank = load(scratch.path(), 48_000).expect("the folder loads");
    assert_eq!(
        bank.choked_by(KitVoice::HatOpen),
        KitVoice::Hat.bit() | KitVoice::HatPedal.bit(),
        "a folder with no kit.json still gets the one choke every kit has"
    );
    assert_eq!(bank.choked_by(KitVoice::Kick), 0);
}

/// The pair a folder from before this pass has: `snare.wav` and
/// `snare_soft.wav`, which the second pass mapped to `snare_hi` and
/// `snare_lo`. They have to stay two different strokes of one drum.
#[test]
fn a_folder_from_before_this_pass_keeps_its_snare_pair() {
    let scratch = Scratch::new("legacy");
    write_sine(&scratch.path().join("snare.wav"), 48_000, 1, 16, false, 250.0, 0.15, 0.5);
    write_sine(
        &scratch.path().join("snare_soft.wav"),
        48_000,
        1,
        16,
        false,
        180.0,
        0.15,
        0.5,
    );
    let bank = load(scratch.path(), 48_000).expect("the folder loads");
    let snare = bank.voice(KitVoice::Snare).expect("a snare");
    assert_eq!(snare.layers(), 2, "the pair collapsed into one layer");
    // Layer 1 is the SOFT one — `snare_soft.wav` — and layer 2 the harder.
    let soft = frequency_of(&{
        let b = bank.sample(KitVoice::Snare as u8, 0, 0);
        (0..b.len() / 2).map(|i| b[2 * i]).collect::<Vec<f32>>()
    }, 48_000);
    assert!(
        (soft - 180.0).abs() < 2.0,
        "layer 1 came out at {soft} Hz and snare_soft.wav is 180"
    );
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/// THE FORMAT A SAMPLE PACK ACTUALLY SHIPS IN.
///
/// 24-bit stereo at 44.1 kHz is what a drum library is, and every step
/// between that and what the audio thread reads is a place to be wrong: the
/// bit depth (24-bit read as 16 is a quarter of the level), the rate (a
/// missing resample is a semitone and a half sharp), the channels (a fold to
/// mono would throw away the room the recording was made in), and the peak.
#[test]
fn a_stereo_24_bit_44_kilohertz_file_stays_stereo_at_the_output_rate() {
    let scratch = Scratch::new("format");
    let path = scratch.path().join("kick.wav");
    // Left is one tone and right is another, so a fold to mono or a swapped
    // channel is visible rather than a matter of opinion.
    let spec = WavSpec {
        channels: 2,
        sample_rate: 44_100,
        bits_per_sample: 24,
        sample_format: SampleFormat::Int,
    };
    let mut w = WavWriter::create(&path, spec).unwrap();
    let full = (1i64 << 23) as f64;
    for i in 0..22_050 {
        let t = i as f64 / 44_100.0;
        let l = 0.4 * (2.0 * std::f64::consts::PI * 220.0 * t).sin();
        let r = 0.4 * (2.0 * std::f64::consts::PI * 330.0 * t).sin();
        w.write_sample((l * full) as i32).unwrap();
        w.write_sample((r * full) as i32).unwrap();
    }
    w.finalize().unwrap();

    let bank = load(scratch.path(), 48_000).expect("the folder loads");
    assert_eq!(bank.rate, 48_000);
    let buf = bank.sample(KitVoice::Kick as u8, 0, 0);
    let frames = buf.len() / 2;

    // Half a second at the OUTPUT rate, within a sample or two of the
    // resampler's rounding.
    assert!(
        (frames as i64 - 24_000).abs() <= 2,
        "half a second at 48 kHz is 24000 frames, not {frames}"
    );
    // Still 220 and 330 Hz. Played at its own rate on a 48 kHz device it
    // would be a semitone and a half sharp, and unmistakable.
    let l: Vec<f32> = (0..frames).map(|i| buf[2 * i]).collect();
    let r: Vec<f32> = (0..frames).map(|i| buf[2 * i + 1]).collect();
    for (got, want) in [(frequency_of(&l, 48_000), 220.0), (frequency_of(&r, 48_000), 330.0)] {
        let cents = 1200.0 * (got / want as f64).log2();
        assert!(cents.abs() < 1.0, "{got:.3} Hz against {want} — {cents:.3} cents");
    }
    // And on the peak the engine balances against: a folder has no measured
    // balance, so its loudest layer sits on 0.900 whatever the render's own
    // level was.
    assert!((peak(buf) - VOICE_PEAK).abs() < 1e-3, "the kick peaks at {}", peak(buf));
}

/// A mono file plays out of both sides. The mixer never asks how many
/// channels a buffer has, so this is where it is made true.
#[test]
fn a_mono_file_is_centred_rather_than_left() {
    let scratch = Scratch::new("mono");
    write_sine(&scratch.path().join("kick.wav"), 48_000, 1, 16, false, 80.0, 0.1, 0.5);
    let bank = load(scratch.path(), 48_000).unwrap();
    let buf = bank.sample(KitVoice::Kick as u8, 0, 0);
    for i in 0..buf.len() / 2 {
        assert_eq!(buf[2 * i], buf[2 * i + 1], "frame {i} came out off centre");
    }
}

/// Sixteen-bit, thirty-two-bit float and eight-bit all arrive as the same
/// drum. The depth is the file's business and none of the band's.
#[test]
fn every_depth_a_wav_can_be_decodes_to_the_same_sound() {
    let mut decoded = Vec::new();
    for (name, bits, float) in [("d16", 16u16, false), ("d32f", 32, true), ("d8", 8, false)] {
        let scratch = Scratch::new(name);
        write_sine(&scratch.path().join("hat.wav"), 48_000, 1, bits, float, 220.0, 0.2, 0.5);
        let bank = load(scratch.path(), 48_000).expect("the folder loads");
        decoded.push((name, left(&bank, KitVoice::Hat)));
    }
    let (_, reference) = &decoded[0];
    for (name, buf) in decoded.iter().skip(1) {
        assert_eq!(buf.len(), reference.len(), "{name} came out a different length");
        // Eight-bit is coarse — a 255-step quantiser is 48 dB of
        // signal-to-noise and no more — so the tolerance is the format's own
        // and not the decoder's.
        let worst = buf
            .iter()
            .zip(reference.iter())
            .fold(0.0f32, |m, (a, b)| m.max((a - b).abs()));
        assert!(worst < 0.01, "{name} differs from 16-bit by {worst}");
    }
}

/// WHAT THE RESAMPLER COSTS, AS A NUMBER.
///
/// 44.1 kHz to 48 is the conversion nearly every user's kit will go through,
/// and "it sounds fine" is not a measurement. What is asserted is the error
/// floor, which is what says the windowed sinc in `engine.rs` is doing its
/// job rather than dropping samples. Measured around −122 dB RMS; the gate
/// is −45 dB, two orders of magnitude looser, so it catches a resampler that
/// was replaced or removed rather than one that was tuned.
#[test]
fn the_decoder_resamples_44_kilohertz_to_48_within_a_measurable_error() {
    let scratch = Scratch::new("resample");
    write_sine(&scratch.path().join("snare.wav"), 44_100, 1, 24, false, 220.0, 0.5, 0.8);
    let bank = load(scratch.path(), 48_000).expect("the folder loads");
    let got = left(&bank, KitVoice::Snare);

    let want: Vec<f32> = (0..got.len())
        .map(|i| {
            (VOICE_PEAK as f64 * (2.0 * std::f64::consts::PI * 220.0 * i as f64 / 48_000.0).sin())
                as f32
        })
        .collect();

    // The steady part only. The kernel hangs off both ends of the source,
    // which is a real artefact of a finite file and not a resampling error.
    let skip = 480;
    let (mut err, mut sig) = (0.0f64, 0.0f64);
    for i in skip..got.len() - skip {
        let d = (got[i] - want[i]) as f64;
        err += d * d;
        sig += (want[i] as f64) * (want[i] as f64);
    }
    let db = 10.0 * (err / sig.max(1e-30)).log10();
    eprintln!("[kit] 44.1 kHz -> 48 kHz resampling error: {db:.1} dB RMS");
    assert!(db < -45.0, "the resampler leaves {db:.1} dB of error against the signal");
}

/// A long sample is CUT, not refused — and the cut FADES.
///
/// See [`MAX_VOICE_SECS`] and `CAP_FADE_SECS`. Three seconds now, because a
/// crash is its decay; the fixture is a six-second sine at full level, so at
/// the cap the waveform is still going and without the ramp the buffer would
/// end on a step, which is a click on every hit of that cymbal.
#[test]
fn a_long_sample_is_capped_rather_than_rejected() {
    let scratch = Scratch::new("long");
    write_sine(&scratch.path().join("crash.wav"), 48_000, 1, 16, false, 440.0, 6.0, 0.5);
    let bank = load(scratch.path(), 48_000).expect("a long crash is still a crash");
    let buf = left(&bank, KitVoice::Crash);
    let len = buf.len();
    assert!(
        (len as i64 - 144_000).abs() <= 2,
        "six seconds of crash came out as {len} samples and the cap is three seconds"
    );
    // The cut is silent. A 440 Hz sine at 48 kHz crosses zero every 55
    // samples, so a buffer that simply STOPPED would end somewhere on the
    // cycle — 0.9 at worst and a couple of tenths on average.
    assert!(
        buf[len - 1].abs() < 0.01,
        "the capped crash ends at {}, which is a step and therefore a click",
        buf[len - 1].abs()
    );
    // And the ramp is only the ramp: the cycle before it starts is still the
    // drum at full height, so the fade took five milliseconds and not fifty.
    let fade = (CAP_FADE_SECS * 48_000.0) as usize;
    let before = peak(&buf[len - fade - 120..len - fade]);
    assert!(before > 0.5, "the cycle before the fade peaks at {before}");
}

/// A sample that ENDS on its own is not faded. The ramp is what the cap owes
/// the musician for cutting their file; a file the cap never touched is
/// their own decision about where the drum stops.
#[test]
fn a_short_sample_keeps_the_ending_the_musician_gave_it() {
    let scratch = Scratch::new("short");
    // A quarter of a second, ending mid-cycle at full amplitude on purpose.
    write_sine(&scratch.path().join("rim.wav"), 48_000, 1, 16, false, 440.0, 0.25, 0.5);
    let bank = load(scratch.path(), 48_000).expect("the folder loads");
    let buf = left(&bank, KitVoice::Rim);
    let tail = peak(&buf[buf.len() - 60..]);
    assert!(tail > 0.5, "an uncapped file came back faded; its last cycle peaks at {tail}");
}

/// WHAT A FOLDER CAN COST `set_jam`, AS A NUMBER.
///
/// [`MAX_FOLDER_BYTES`] is a sanity check on intent and NOT the bound on the
/// work. `decode_stereo` stops at [`MAX_VOICE_SECS`] at the source rate, so
/// enormous files decode to exactly the same three-second buffers small ones
/// would, and `set_jam` cannot be made slower by pointing it at a bigger
/// folder. It matters because `set_jam` is synchronous: "how much work can a
/// folder ask for" is the same question as "how long can the window be
/// busy".
#[test]
fn no_folder_can_cost_more_than_the_cap_however_long_its_files_are() {
    let scratch = Scratch::new("bounded");
    for v in KitVoice::ALL {
        // Three times the cap each, at a rate above the output's.
        write_sine(
            &scratch.path().join(format!("{}.wav", v.file_name())),
            96_000,
            1,
            16,
            false,
            300.0,
            MAX_VOICE_SECS * 3.0,
            0.5,
        );
    }
    let bank = load(scratch.path(), 48_000).expect("eleven long drums are still a kit");
    let ceiling = (MAX_VOICE_SECS * 48_000.0) as usize + 2;
    for v in KitVoice::ALL {
        let frames = bank.sample(v as u8, 0, 0).len() / 2;
        assert!(
            frames <= ceiling,
            "{} decoded to {frames} frames against a cap of {ceiling}",
            v.file_name()
        );
    }
    assert!(
        bank.bytes <= KIT_VOICES * ceiling * 8,
        "the folder decoded to {} bytes, over eleven voices' worth of the cap",
        bank.bytes
    );
}

/// A folder of far too much audio is refused with a sentence, before a
/// single sample is read.
#[test]
fn a_folder_of_too_much_audio_is_refused_with_a_message() {
    let scratch = Scratch::new("huge");
    // One second at 48 kHz is 384 kB decoded as stereo, so a cap of 64 kB is
    // over it six times. Same code path, three orders of magnitude less
    // disk — see `load_capped`.
    write_sine(&scratch.path().join("kick.wav"), 48_000, 1, 16, false, 80.0, 1.0, 0.5);
    let err = load_capped(scratch.path(), 48_000, 64 * 1024)
        .expect_err("a folder over the cap must be refused");
    assert!(err.contains("capped at"), "the refusal has to say what the cap is: {err:?}");
    assert!(load_capped(scratch.path(), 48_000, MAX_FOLDER_BYTES).is_ok());
}

/// The published caps are the ones the app uses. `load_capped` exists for
/// the test above; this is what stops it drifting away from `load`.
#[test]
fn the_cap_the_app_actually_uses_is_the_published_one() {
    assert_eq!(MAX_FOLDER_BYTES, 96 * 1024 * 1024);
    assert_eq!(MAX_VOICE_SECS, 3.0);
}

/// A folder with none of the voice names says so, rather than quietly
/// handing back a bank with nothing in it — which would look exactly like
/// the feature not working.
#[test]
fn a_folder_with_no_drums_in_it_says_so() {
    let scratch = Scratch::new("empty");
    write_sine(&scratch.path().join("guitar-loop.wav"), 48_000, 1, 16, false, 440.0, 0.2, 0.5);
    let err = load(scratch.path(), 48_000).expect_err("nothing here is a drum");
    assert!(err.contains("kick"), "the message has to name the files it wanted: {err:?}");
    assert!(err.contains("tom_lo"), "including the new ones: {err:?}");
}

/// A file that is not a WAV is a message, not a panic. This is the whole
/// reason the decoding here is `hound` and not `rodio`.
#[test]
fn a_file_that_is_not_really_a_wav_is_refused_rather_than_crashing() {
    let scratch = Scratch::new("junk");
    std::fs::write(scratch.path().join("kick.wav"), b"ID3\x04\x00not a wav at all").unwrap();
    let err = load(scratch.path(), 48_000).expect_err("that is not a WAV");
    assert!(err.contains("kick.wav"), "the message has to name the file: {err:?}");
}

/// `Kick.wav` is a kick. A sample pack names its files the way its author
/// felt like that day, and renaming a hundred files should not be the price
/// of using one.
#[test]
fn the_names_are_matched_whatever_case_they_are_in() {
    let scratch = Scratch::new("case");
    for name in ["Kick.WAV", "TOM_HI.wav", "Hat_Open.Wav", "Ride_Bell.2.1.WAV"] {
        write_sine(&scratch.path().join(name), 48_000, 1, 16, false, 300.0, 0.1, 0.5);
    }
    let seen = inspect(scratch.path()).expect("the folder is readable");
    assert_eq!(seen.voices, vec!["kick", "hat_open", "ride_bell", "tom_hi"]);
    assert!(seen.missing.contains(&"ride".to_string()));
    assert_eq!(seen.voices.len() + seen.missing.len(), KIT_VOICES);

    let bank = load(scratch.path(), 48_000).expect("the folder loads");
    assert!(bank.has(KitVoice::Kick) && bank.has(KitVoice::TomHi));
    assert!(bank.has(KitVoice::HatOpen) && bank.has(KitVoice::RideBell));
    // And the ones that are not there are not there — `jam.rs` is what turns
    // those into the fallbacks.
    assert!(!bank.has(KitVoice::Ride));
    assert!(bank.sample(KitVoice::Ride as u8, 0, 0).is_empty());
}

// ---------------------------------------------------------------------------
// Borrowing, and the cache
// ---------------------------------------------------------------------------

/// A FOLDER IS A KIT WITH A KIT BEHIND IT.
///
/// A musician who drops a kick and a snare they like into a folder has a
/// real kit whose hats come from the app, not a band with two drums. The
/// borrowing happens once, on the command thread, and what comes out is ONE
/// bank — so the audio thread reads one kit and never asks which half a drum
/// came from.
#[test]
fn a_folder_borrows_the_voices_it_does_not_have() {
    let scratch = Scratch::new("borrow");
    write_sine(&scratch.path().join("kick.wav"), 48_000, 1, 16, false, 80.0, 0.15, 0.5);
    let own = Arc::new(load(scratch.path(), 48_000).expect("the folder loads"));
    let behind = Arc::new(load_shipped(shipped_index("room").unwrap(), 48_000).unwrap());
    let merged = with_fallback(&own, &behind);

    assert!(merged.has(KitVoice::Kick) && merged.has(KitVoice::Hat));
    // The kick is the MUSICIAN'S, not the borrowed one.
    assert_eq!(
        merged.sample(KitVoice::Kick as u8, 0, 0),
        own.sample(KitVoice::Kick as u8, 0, 0),
        "the folder's own kick was replaced by the app's"
    );
    assert_eq!(
        merged.sample(KitVoice::Hat as u8, 0, 0),
        behind.sample(KitVoice::Hat as u8, 0, 0),
        "the borrowed hat is not the one it was borrowed from"
    );
    // A DIFFERENT DECODE, and it has to be: the memo in `jam.rs` keys a
    // four-bar measurement on this number, and a folder played over `room`
    // and the same folder played over `brushes` are two different bands.
    assert_ne!(merged.id, own.id);
    assert_ne!(merged.id, behind.id);
    // A kit that already holds all eleven borrows nothing and costs a
    // refcount bump.
    let full = Arc::new(KitBank::for_tests(&KitVoice::ALL, 48_000, 0.05));
    assert!(
        Arc::ptr_eq(&with_fallback(&full, &behind), &full),
        "a kit with all eleven voices borrowed something anyway"
    );
    // And it really does hand a voice over when there is one to hand: the
    // folder above has one kick, so borrowing `full` gives it ten more.
    let rich = with_fallback(&own, &full);
    assert!(rich.has(KitVoice::TomLo) && rich.has(KitVoice::RideBell));
    assert_eq!(
        rich.sample(KitVoice::Kick as u8, 0, 0),
        own.sample(KitVoice::Kick as u8, 0, 0),
        "the folder's own kick was replaced by the one it borrowed from"
    );
    // Borrowing is not inventing: `room` has no toms either, so the merge
    // at the top of this test still has none. `jam.rs`'s fallback chain is
    // what covers those.
    assert!(!merged.has(KitVoice::TomHi));
}

/// THE BAR-AHEAD SEND MUST NOT RE-DECODE THE KIT.
///
/// The UI re-sends the whole config four to six times a chorus to keep the
/// bass a bar ahead. Without the cache each of those would read and resample
/// every WAV in the kit — which for a recorded kit is a hundred and
/// thirty-two files, per bar, for the whole time a jam is playing.
///
/// Measured on the bank's own identity rather than on a timer: the same kit
/// must hand back the SAME decode, and a changed file must not.
#[test]
fn the_cache_hands_back_the_same_decode_until_a_file_changes() {
    let scratch = Scratch::new("cache");
    let kick = scratch.path().join("kick.wav");
    write_sine(&kick, 48_000, 1, 16, false, 80.0, 0.2, 0.5);

    let cache = KitCache::default();
    let first = cache.get_or_load(scratch.path(), 48_000).unwrap();
    for _ in 0..6 {
        let again = cache.get_or_load(scratch.path(), 48_000).unwrap();
        assert_eq!(first.id, again.id, "a repeated send re-decoded the folder");
        assert!(Arc::ptr_eq(&first, &again), "and handed back a different bank");
    }
    assert!(cache.is_holding(scratch.path(), 48_000));

    // A SHIPPED KIT IS CACHED TOO, and separately: every jam now decodes one,
    // so a bar-ahead send that re-read `room` would be the same folder read
    // per bar with nobody's folder involved at all.
    let room = shipped_index("room").unwrap();
    let a = cache.shipped(room, 48_000).unwrap();
    let b = cache.shipped(room, 48_000).unwrap();
    assert!(Arc::ptr_eq(&a, &b), "the shipped kit was decoded twice");
    // ...and the folder is still held, because the cache keeps more than one.
    assert!(cache.is_holding(scratch.path(), 48_000));

    // A DIFFERENT OUTPUT RATE IS A DIFFERENT BANK. The samples are resampled
    // to the device's rate, so a device change has to re-decode or the drums
    // come out at the wrong pitch.
    let other = cache.get_or_load(scratch.path(), 44_100).unwrap();
    assert_ne!(first.id, other.id, "44.1 kHz reused the 48 kHz decode");
    assert_eq!(other.rate, 44_100);
    assert_ne!(cache.shipped(room, 44_100).unwrap().id, a.id);

    // AND A REPLACED FILE IS A DIFFERENT BANK. Keyed on the path alone, the
    // app would keep playing yesterday's kick until it restarted. The size
    // changes as well as the mtime, deliberately: a filesystem whose
    // timestamps are whole seconds would otherwise make this test depend on
    // how fast the machine is.
    write_sine(&kick, 48_000, 1, 16, false, 90.0, 0.35, 0.5);
    let after = cache.get_or_load(scratch.path(), 48_000).unwrap();
    assert_ne!(
        first.id, after.id,
        "the kick was replaced on disk and the cache kept the old one"
    );
}

/// THE CACHE KEY KEEPS THE NANOSECONDS.
///
/// Truncated to whole seconds, the two times below are the same number — and
/// a snare re-bounced and dropped in the folder within a second of the last
/// one, at the same length, would keep playing the old sound until the app
/// restarted.
#[test]
fn a_file_replaced_within_the_same_second_is_a_different_key() {
    let base = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_757_000_000);
    assert_ne!(
        stamp(Some(base)),
        stamp(Some(base + std::time::Duration::from_millis(1))),
        "a millisecond apart is a different file, and whole seconds cannot see it"
    );
    assert_ne!(
        stamp(Some(base)),
        stamp(Some(base + std::time::Duration::from_nanos(100))),
        "NTFS timestamps tick every 100 ns, so that is the resolution to keep"
    );
    // A filesystem that reports no time at all falls back on the path, the
    // rate and the size rather than panicking.
    assert_eq!(stamp(None), 0);
}

/// HOW LONG A RECORDED KIT TAKES TO LOAD, AS A NUMBER.
///
/// `set_jam` is synchronous and runs on the main thread, so the first send of
/// a jam holds the window for exactly as long as this takes.
///
/// **The gate is a debug-build canary, not the shipped figure.** `cargo test`
/// builds unoptimised, and hound's per-sample iterator is where the time
/// goes: the same decode measures about eight times faster with optimisation
/// on, which is what the app runs. So the number to quote is the one from
/// `--release` and the number to gate on is the one that catches a decode
/// that went quadratic. Both are printed.
#[test]
fn the_decode_is_quick_enough_to_run_on_the_command_thread() {
    let scratch = Scratch::new("timing");
    // Four layers, three round robins, eleven voices, stereo at 48 kHz: the
    // shape `club` and `studio` arrive in. Short hits, because the length is
    // the render tool's business and this is about the count.
    for v in KitVoice::ALL {
        for l in 1..=4 {
            for r in 1..=3 {
                write_sine(
                    &scratch.path().join(format!("{}.{l}.{r}.wav", v.file_name())),
                    48_000,
                    2,
                    16,
                    false,
                    200.0 + 10.0 * (l * 3 + r) as f64,
                    0.3,
                    0.5,
                );
            }
        }
    }
    let start = std::time::Instant::now();
    let bank = load(scratch.path(), 48_000).expect("a 4 x 3 stereo kit loads");
    let millis = start.elapsed().as_secs_f64() * 1000.0;
    eprintln!(
        "[kit] a 4 x 3 stereo kit at 48 kHz ({} voices, {} files, {:.1} MB decoded): {:.0} ms",
        bank.found.len(),
        KIT_VOICES * 12,
        bank.bytes as f64 / (1024.0 * 1024.0),
        millis
    );
    // ...and the same kit onto a device that is not at its own rate, which
    // is the expensive path and the one a musician's own folder usually
    // takes: the same decode plus a thirty-two-tap windowed sinc over every
    // sample of every file.
    let started = std::time::Instant::now();
    load(scratch.path(), 44_100).expect("a 4 x 3 stereo kit resamples");
    let resampled = started.elapsed().as_secs_f64() * 1000.0;
    eprintln!("[kit] the same kit onto a 44.1 kHz device: {resampled:.0} ms");
    assert_eq!(bank.found.len(), KIT_VOICES);
    for v in KitVoice::ALL {
        let voice = bank.voice(v).expect("every voice");
        assert_eq!((voice.layers(), voice.rr()), (4, 3));
    }
    let gate = if cfg!(debug_assertions) { 12_000.0 } else { 1_500.0 };
    for (what, took) in [("at its own rate", millis), ("resampled", resampled)] {
        assert!(
            took < gate,
            "a 4 x 3 stereo kit took {took:.0} ms to decode {what}, against a gate \
             of {gate:.0} — that is not a window anybody would call responsive, and \
             it is far enough over to be a decode that went quadratic"
        );
    }
    // THE RESAMPLE IS NOT AN ORDER OF MAGNITUDE. It was, before the kernel
    // stopped being recomputed for every output sample: 60 ms became 2.2
    // seconds, on the main thread, with the window not repainting. See
    // `Resampler`.
    assert!(
        resampled < millis.max(1.0) * 8.0,
        "resampling cost {resampled:.0} ms against {millis:.0} ms without it, \
         which is the per-sample kernel back again"
    );
}
