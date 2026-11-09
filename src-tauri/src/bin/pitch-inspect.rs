//! Pitch inspector — what `pitch.rs` heard in a file, as a list you can read.
//!
//! The eyeball at the end of the fixture suite. A number in a test says the
//! tracker agreed with the ground truth; this says what it actually thought,
//! note by note, so a failure can be looked at rather than guessed about.
//! It reads a file and prints; it writes nothing and touches no app data.
//!
//! Usage:
//!   cargo run --release --bin pitch-inspect -- <file.wav|file.flac> [options]
//!
//! Options:
//!   --guitar | --bass | --wide   Which range to listen for. Default
//!                                `--wide`, which covers both and is blunter
//!                                in time than either; see `pitch.rs` on why
//!                                the range is a decision.
//!   --onsets <ms,ms,…>           Segment on these instead of on the pitch
//!                                track alone. Without them a repeated note
//!                                at the same pitch is one note.
//!   --frames                     Print every analysis frame as well.
//!
//! A dry stem is what this is meant to be pointed at (`take.rs`): a mix of a
//! player and a band is a chord, and a monophonic tracker will answer about
//! whichever part of it won.

use std::env;
use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Instant;

use yames_lib::pitch::{decode_mono_file, notes_from, track, PitchConfig};

const USAGE: &str = "usage: pitch-inspect <file.wav|file.flac> \
                     [--guitar|--bass|--wide] [--onsets <ms,ms,…>] [--frames]";

fn main() -> ExitCode {
    let mut path: Option<PathBuf> = None;
    let mut cfg = PitchConfig::default();
    let mut range = "wide";
    let mut onsets: Vec<f64> = Vec::new();
    let mut show_frames = false;

    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--guitar" => {
                cfg = PitchConfig::guitar();
                range = "guitar";
            }
            "--bass" => {
                cfg = PitchConfig::bass();
                range = "bass";
            }
            "--wide" => {
                cfg = PitchConfig::default();
                range = "wide";
            }
            "--frames" => show_frames = true,
            "--onsets" => {
                let Some(list) = args.next() else {
                    eprintln!("--onsets wants a comma-separated list of milliseconds");
                    return ExitCode::from(2);
                };
                for part in list.split(',').filter(|s| !s.trim().is_empty()) {
                    match part.trim().parse::<f64>() {
                        Ok(v) => onsets.push(v),
                        Err(_) => {
                            eprintln!("{part:?} is not a number of milliseconds");
                            return ExitCode::from(2);
                        }
                    }
                }
            }
            "-h" | "--help" => {
                println!("{USAGE}");
                return ExitCode::SUCCESS;
            }
            other if other.starts_with('-') => {
                eprintln!("unknown option {other}\n{USAGE}");
                return ExitCode::from(2);
            }
            other => path = Some(PathBuf::from(other)),
        }
    }

    let Some(path) = path else {
        eprintln!("{USAGE}");
        return ExitCode::from(2);
    };

    let (samples, rate) = match decode_mono_file(&path) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::from(2);
        }
    };
    let secs = samples.len() as f64 / rate.max(1) as f64;

    println!("{}", path.display());
    println!(
        "  {secs:.2} s at {rate} Hz, analysed at {} Hz over the {range} range \
         ({:.0}–{:.0} Hz)",
        yames_lib::pitch::ANALYSIS_RATE,
        cfg.fmin_hz,
        cfg.fmax_hz
    );
    println!(
        "  window {:.1} ms, hop {:.1} ms, lags {}–{}, transform {}",
        cfg.window_ms(),
        cfg.hop_ms(),
        cfg.tau_min,
        cfg.tau_max,
        cfg.fft_len
    );

    let started = Instant::now();
    let tr = track(&samples, rate, &cfg);
    let tracked = started.elapsed();
    let notes = notes_from(&tr, &onsets);
    let total = started.elapsed();

    let voiced = tr.frames.iter().filter(|f| f.voiced).count();
    println!(
        "  {} frames, {voiced} voiced — tracked in {:.0} ms, {:.0} ms all in \
         ({:.2}× real time)",
        tr.frames.len(),
        tracked.as_secs_f64() * 1000.0,
        total.as_secs_f64() * 1000.0,
        secs / total.as_secs_f64().max(1e-9)
    );
    if onsets.is_empty() {
        println!("  segmented on the pitch track alone — no onsets were given");
    } else {
        println!("  segmented on {} onsets", onsets.len());
    }
    println!();

    if show_frames {
        println!("    {:>9}  {:>8}  {:>8}  {:>5}  {:>6}", "at", "hz", "midi", "conf", "rms");
        for f in &tr.frames {
            if !f.voiced {
                println!("    {:>8.1}ms  {:>8}  {:>8}  {:>5}  {:>6.4}", f.start_ms, "-", "-", "-", f.rms);
                continue;
            }
            println!(
                "    {:>8.1}ms  {:>8.2}  {:>8.3}  {:>5.2}  {:>6.4}",
                f.start_ms, f.hz, f.midi, f.confidence, f.rms
            );
        }
        println!();
    }

    println!("  {:>4}  {:>10}  {:>9}  {:>6}  {:>5}  {:>6}  conf", "#", "start", "length", "midi", "note", "cents");
    for (i, n) in notes.iter().enumerate() {
        println!(
            "  {:>4}  {:>8.1}ms  {:>7.1}ms  {:>6.2}  {:>5}  {:>+6.1}  {:.2}",
            i + 1,
            n.start_ms,
            n.end_ms - n.start_ms,
            n.midi,
            note_name(n.nearest_midi()),
            n.cents_off_nearest(),
            n.confidence
        );
    }
    if notes.is_empty() {
        println!("  (nothing periodic in it)");
    }
    ExitCode::SUCCESS
}

/// A MIDI number as a musician reads it. Sharps only — this is a debug
/// print, not a key signature.
fn note_name(midi: i32) -> String {
    const NAMES: [&str; 12] = [
        "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
    ];
    if !(0..=127).contains(&midi) {
        return midi.to_string();
    }
    format!("{}{}", NAMES[(midi % 12) as usize], midi / 12 - 1)
}
