//! The click-jitter probe, inside the real app (`plans/tasks/mvp/PLAN.md`, M3).
//!
//! `click-jitter-probe` runs the engine headless, so it cannot see what the
//! webview costs the machine: the 3D neck, the layout, the GPU process. This
//! arms the same [`CallbackProbe`] in the app itself and writes the same four
//! numbers the probe gates on.
//!
//! **Off unless asked for, and then nothing new on the audio thread.** With
//! `YAMES_CALLBACK_PROBE` unset the app builds its engine with
//! `MetronomeEngine::new`, exactly as before. Set, it uses
//! `MetronomeEngine::new_with_probe`, the constructor the headless probe uses;
//! the callback is the same code either way. Everything here runs on the
//! command thread or at quit.
//!
//! | Variable | Meaning |
//! |---|---|
//! | `YAMES_CALLBACK_PROBE=1` | arm the probe |
//! | `YAMES_CALLBACK_PROBE_OUT` | where the JSON report goes (default `$TMPDIR/yames-callback-probe.json`); the raw capture goes beside it as `.csv` |
//! | `YAMES_CALLBACK_PROBE_SECONDS` | how much playing the arena holds (default 1800 s); past it, `overflow` counts what was dropped |
//!
//! The report is written when the main window closes, and on demand through
//! the `callback_probe_report` command (which is how `tests/e2e` reads it
//! without having to quit).
//!
//! **Allocations need a build feature, not only the variable.** Counting them
//! takes a `#[global_allocator]`, and the shipping app must not have one, so
//! `main.rs` installs [`crate::alloc_probe::CountingAlloc`] only under
//! `--features callback-probe-alloc`. Without it the report says
//! `"allocs_counted": false` and the two allocation numbers are `null`.
//!
//! ## How this differs from the headless probe's analysis
//!
//! The headless probe plays one click for a minute. The app starts and stops:
//! every Take, every warm-up, every press of Play is a new run, and the
//! engine's sample counter starts again from zero on each. So the capture is
//! cut into **runs** wherever the counter does not continue from the buffer
//! before it, and each number is worked out inside runs and then pooled:
//!
//! * **jitter**: `|Δwall − frames/sr|` between consecutive buffers of one run,
//!   all runs pooled, nearest-rank percentiles (as the probe);
//! * **missed beats**: per run, `floor((wall − audio) / tick)`, with the
//!   run's own tick interval (`audio seconds / ticks rendered`), summed. A run
//!   that rendered fewer than two ticks (a song or jam drawing no click) is
//!   measured with the fastest tick the app can play, 50 ms, which can only
//!   over-count;
//! * **callback allocations / frees** and **dropped notifications**: whole
//!   process, as the probe.
//!
//! The first 1.5 s after the first captured buffer are left out, as the probe
//! leaves out its stream start-up.

use std::sync::{Arc, OnceLock};

use crate::engine::{CallbackProbe, CallbackSample};

pub const ENV_FLAG: &str = "YAMES_CALLBACK_PROBE";
pub const ENV_OUT: &str = "YAMES_CALLBACK_PROBE_OUT";
pub const ENV_SECONDS: &str = "YAMES_CALLBACK_PROBE_SECONDS";

/// What the headless probe sizes for is 4000 callbacks a second, a 0.25 ms
/// buffer. An app left open for half an hour would make that 170 MB, so the
/// app sizes for 1000 a second (a 1 ms buffer at 48 kHz, still below what any
/// shared-mode device hands out) and reports overflow if it was wrong.
const CALLBACKS_PER_SEC: usize = 1000;
const DEFAULT_SECONDS: usize = 1800;
const WARMUP_NS: u64 = 1_500_000_000;
/// A run with no click in it is measured against this, the shortest tick the
/// app plays (300 BPM sixteenths), so it can only over-count a missed beat.
const FASTEST_TICK_S: f64 = 0.05;

static PROBE: OnceLock<Arc<CallbackProbe>> = OnceLock::new();

/// The probe the engine should be built with, when the variable asks for one.
/// Called once, at setup.
pub fn from_env() -> Option<Arc<CallbackProbe>> {
    if std::env::var(ENV_FLAG).ok().as_deref() != Some("1") {
        return None;
    }
    let seconds = std::env::var(ENV_SECONDS)
        .ok()
        .and_then(|s| s.parse::<usize>().ok())
        .filter(|&s| s > 0)
        .unwrap_or(DEFAULT_SECONDS);
    let probe = PROBE
        .get_or_init(|| Arc::new(CallbackProbe::new(seconds * CALLBACKS_PER_SEC)))
        .clone();
    eprintln!(
        "[probe] callback probe ARMED: {} callbacks of room, report to {}{}",
        probe.capacity(),
        out_path(),
        if cfg!(feature = "callback-probe-alloc") {
            ", allocations counted"
        } else {
            ", allocations NOT counted (build with --features callback-probe-alloc)"
        }
    );
    Some(probe)
}

pub fn armed() -> bool {
    PROBE.get().is_some()
}

fn out_path() -> String {
    std::env::var(ENV_OUT).unwrap_or_else(|_| {
        std::env::temp_dir()
            .join("yames-callback-probe.json")
            .to_string_lossy()
            .into_owned()
    })
}

fn percentile(sorted: &[f64], q: f64) -> f64 {
    if sorted.is_empty() {
        return f64::NAN;
    }
    let rank = (q * sorted.len() as f64).ceil() as usize;
    sorted[rank.saturating_sub(1).min(sorted.len() - 1)]
}

/// JSON has no NaN.
fn num(x: f64) -> serde_json::Value {
    if x.is_finite() {
        serde_json::json!((x * 1e5).round() / 1e5)
    } else {
        serde_json::Value::Null
    }
}

/// Cut the capture into runs: a buffer belongs to the run before it when the
/// engine's sample counter carries straight on from it.
fn runs(samples: &[CallbackSample]) -> Vec<&[CallbackSample]> {
    let mut out = Vec::new();
    let mut start = 0;
    for i in 1..samples.len() {
        let (a, b) = (samples[i - 1], samples[i]);
        if b.sample_pos != a.sample_pos + a.frames as u64 {
            out.push(&samples[start..i]);
            start = i;
        }
    }
    if start < samples.len() {
        out.push(&samples[start..]);
    }
    out
}

/// The report, as JSON. `dropped_notifications` comes from the engine.
pub fn report(probe: &CallbackProbe, dropped_notifications: u64) -> serde_json::Value {
    // Read while the stream may still be running: every slot is an atomic, so
    // this is sound, and a slot counted but not yet written reads as zero and
    // is left out.
    analyse(
        probe.snapshot(),
        probe.sample_rate(),
        probe.overflow(),
        dropped_notifications,
        crate::alloc_probe::counts(),
    )
}

/// [`report`], on a capture already read.
fn analyse(
    snapshot: Vec<CallbackSample>,
    sample_rate: u32,
    overflow: usize,
    dropped_notifications: u64,
    allocs: Option<(u64, u64, u64)>,
) -> serde_json::Value {
    let all: Vec<CallbackSample> = snapshot.into_iter().filter(|s| s.entry_ns != 0).collect();
    let sr = sample_rate as f64;
    let window_start = all.first().map(|s| s.entry_ns + WARMUP_NS).unwrap_or(0);
    let measured: Vec<CallbackSample> =
        all.iter().copied().filter(|s| s.entry_ns >= window_start).collect();

    let mut jitter: Vec<f64> = Vec::with_capacity(measured.len());
    let mut max_gap_ms = 0.0f64;
    let mut dropouts = 0usize;
    let mut missed_beats = 0u64;
    let mut deficit_ms = 0.0f64;
    let mut wall_s_total = 0.0f64;
    let mut ticks_total = 0u64;
    let all_runs = if sr > 0.0 { runs(&measured) } else { Vec::new() };
    for run in &all_runs {
        for pair in run.windows(2) {
            let (a, b) = (pair[0], pair[1]);
            let delta_ms = b.entry_ns.saturating_sub(a.entry_ns) as f64 / 1e6;
            let expected_ms = a.frames as f64 / sr * 1000.0;
            jitter.push((delta_ms - expected_ms).abs());
            max_gap_ms = max_gap_ms.max(delta_ms);
            if expected_ms > 0.0 && delta_ms > 2.0 * expected_ms {
                dropouts += 1;
            }
        }
        let (first, last) = (run[0], run[run.len() - 1]);
        let wall_s = (last.entry_ns - first.entry_ns) as f64 / 1e9;
        let audio_s = (last.sample_pos - first.sample_pos) as f64 / sr;
        let ticks: u64 = run.iter().map(|s| s.ticks as u64).sum();
        let tick_s = if ticks >= 2 { audio_s / ticks as f64 } else { FASTEST_TICK_S };
        let behind = (wall_s - audio_s).max(0.0);
        missed_beats += (behind / tick_s).floor() as u64;
        deficit_ms += behind * 1000.0;
        wall_s_total += wall_s;
        ticks_total += ticks;
    }
    jitter.sort_by(|x, y| x.partial_cmp(y).unwrap());
    let mut frames: Vec<u32> = measured.iter().map(|s| s.frames).collect();
    frames.sort_unstable();
    let median_frames = frames.get(frames.len() / 2).copied().unwrap_or(0);

    let p99 = percentile(&jitter, 0.99);
    let enough = jitter.len() >= 100;
    serde_json::json!({
        "callbacks": measured.len(),
        "excluded_startup": all.len() - measured.len(),
        "overflow": overflow,
        "runs": all_runs.len(),
        "played_s": num(wall_s_total),
        "ticks_rendered": ticks_total,
        "sample_rate": sample_rate,
        "median_frames": median_frames,
        "buffer_ms": num(if sr > 0.0 { median_frames as f64 / sr * 1000.0 } else { f64::NAN }),
        "jitter_p50_ms": num(percentile(&jitter, 0.50)),
        "jitter_p95_ms": num(percentile(&jitter, 0.95)),
        "jitter_p99_ms": num(p99),
        "jitter_max_ms": num(jitter.last().copied().unwrap_or(f64::NAN)),
        "max_gap_ms": num(max_gap_ms),
        "dropouts": dropouts,
        "missed_beats": missed_beats,
        "audio_behind_wall_ms": num(deficit_ms),
        "allocs_counted": allocs.is_some(),
        "callback_allocs": allocs.map(|a| a.0),
        "callback_alloc_bytes": allocs.map(|a| a.1),
        "callback_frees": allocs.map(|a| a.2),
        "dropped_notifications": dropped_notifications,
        "gate": {
            "enough_callbacks": enough,
            "p99_under_1ms": enough && p99 < 1.0,
            "missed_beats_zero": missed_beats == 0,
            "callback_allocs_zero": allocs.map(|a| a.0 == 0 && a.2 == 0),
            "dropped_notifications_zero": dropped_notifications == 0,
        },
    })
}

/// Write the report (and the raw capture beside it). Returns the report.
pub fn write(dropped_notifications: u64) -> Result<serde_json::Value, String> {
    let probe = PROBE
        .get()
        .ok_or_else(|| format!("the callback probe is off ({ENV_FLAG}=1 arms it)"))?;
    let value = report(probe, dropped_notifications);
    let path = out_path();
    let text = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("could not write {path}: {e}"))?;

    let mut csv = String::from("entry_ns,frames,sample_pos,ticks\n");
    for s in probe.snapshot() {
        csv.push_str(&format!("{},{},{},{}\n", s.entry_ns, s.frames, s.sample_pos, s.ticks));
    }
    let csv_path = match path.strip_suffix(".json") {
        Some(stem) => format!("{stem}.csv"),
        None => format!("{path}.csv"),
    };
    let _ = std::fs::write(&csv_path, csv);
    eprintln!("[probe] callback probe report written to {path}");
    Ok(value)
}

/// The report, now, without quitting. Errors when the probe is off.
#[tauri::command]
pub fn callback_probe_report(
    engine: tauri::State<'_, crate::commands::EngineState>,
) -> Result<serde_json::Value, String> {
    let dropped = engine
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .dropped_notifications();
    write(dropped)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(entry_ms: f64, frames: u32, sample_pos: u64, ticks: u32) -> CallbackSample {
        CallbackSample {
            entry_ns: (entry_ms * 1e6) as u64,
            frames,
            sample_pos,
            ticks,
        }
    }

    #[test]
    fn a_new_run_starts_where_the_counter_starts_again() {
        let samples = [
            s(0.0, 480, 0, 1),
            s(10.0, 480, 480, 0),
            s(20.0, 480, 960, 0),
            // Stopped, and played again: the counter is back at zero.
            s(5000.0, 480, 0, 1),
            s(5010.0, 480, 480, 0),
        ];
        let cut = runs(&samples);
        assert_eq!(cut.iter().map(|r| r.len()).collect::<Vec<_>>(), vec![3, 2]);
    }

    #[test]
    fn the_gap_between_runs_is_not_jitter_or_a_missed_beat() {
        // Two runs of 10 ms buffers, perfectly on time, 5 s apart, after the
        // 1.5 s the analysis leaves out.
        let mut capture = vec![s(1.0, 480, 0, 0)];
        let mut t = 2000.0;
        for _ in 0..2 {
            let mut pos = 0u64;
            for i in 0..20 {
                capture.push(s(t, 480, pos, u32::from(i % 5 == 0)));
                pos += 480;
                t += 10.0;
            }
            t += 5000.0;
        }
        let v = analyse(capture, 48_000, 0, 0, Some((0, 0, 0)));
        assert_eq!(v["runs"], 2);
        assert_eq!(v["missed_beats"], 0);
        assert!(v["jitter_p99_ms"].as_f64().unwrap() < 0.01);
        assert!(v["max_gap_ms"].as_f64().unwrap() < 10.1);
    }

    #[test]
    fn a_run_that_falls_behind_its_audio_misses_beats() {
        // 100 ms of audio played over 600 ms of wall: half a second the DAC
        // had nothing. Two ticks in 100 ms of audio is a 50 ms tick, so that
        // is ten clicks nobody heard.
        let mut capture = vec![s(1.0, 480, 0, 0)];
        let mut t = 2000.0;
        let mut pos = 0u64;
        for i in 0..11 {
            capture.push(s(t, 480, pos, u32::from(i % 10 == 0)));
            pos += 480;
            t += if i == 5 { 510.0 } else { 10.0 };
        }
        let v = analyse(capture, 48_000, 0, 0, None);
        assert_eq!(v["missed_beats"], 10);
        assert_eq!(v["dropouts"], 1);
        assert_eq!(v["allocs_counted"], false);
        assert!(v["callback_allocs"].is_null());
    }
}
