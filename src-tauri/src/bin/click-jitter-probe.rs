//! Audio-safety gate (ROADMAP §1 principle 1, §4) — click-jitter probe.
//!
//! Runs the *real* `MetronomeEngine` on the default output device and
//! measures the output callback from inside itself, optionally while the
//! coach LLM generates continuously on a background thread. The gate:
//!
//!   * p99 callback-to-callback jitter < 1 ms, and
//!   * zero missed beats over the measurement window.
//!
//! Usage:
//!
//! ```text
//!   cargo run --bin click-jitter-probe -- --no-llm
//!   cargo run --features coach-llm --bin click-jitter-probe -- --gguf model.gguf
//!   YAMES_LLM_GPU_LAYERS=0 cargo run --features coach-llm-vulkan \
//!       --bin click-jitter-probe -- --gguf model.gguf
//! ```
//!
//! Flags:
//!
//! ```text
//!   --bpm <n>            default 200
//!   --subdivision <n>    default 4   (200 BPM 16ths = 13.33 ticks/s)
//!   --seconds <n>        default 60  (length of the *measured* window)
//!   --warmup-ms <n>      default 1500 (stream start-up, excluded)
//!   --gguf <path>        loop coach::generate over this model
//!   --no-llm             baseline; no model, no generation thread
//!   --p99-ms <f>         jitter threshold, default 1.0
//!   --json               emit a machine-readable summary line as well
//!   --dump-csv <path>    write the raw per-callback capture for re-analysis
//! ```
//!
//! Exit codes: 0 pass, 1 gate failure, 2 setup/usage error.
//!
//! ## What is being measured, exactly
//!
//! `CallbackProbe` (engine.rs) records, per cpal callback and with no
//! locking or allocation on the audio thread: entry timestamp, frame
//! count, the engine's sample counter, and how many metronome ticks were
//! rendered into that buffer.
//!
//! * **Jitter** — `|Δwall − frames_prev / sample_rate|`. The device
//!   consumes buffers at exactly `frames / sample_rate`, so in a healthy
//!   stream consecutive callback entries are that far apart and the
//!   residual is scheduling noise. This is the number ROADMAP §4 caps.
//! * **Max gap** — largest wall-clock interval between two callbacks. A
//!   gap larger than the device's buffered audio is an audible dropout.
//! * **Missed beats** — the sample counter only advances by frames the
//!   device actually took, so `wall_elapsed − audio_elapsed` is time the
//!   DAC spent without fresh samples. Divided by the tick interval, that
//!   is the number of clicks the user did not hear. Crystal skew between
//!   the audio and system clocks is ~100 ppm (≈6 ms over 60 s), three
//!   orders of magnitude below one 75 ms tick, so it cannot manufacture a
//!   false positive here.
//! * **Dropouts** — callbacks whose gap exceeded twice the buffer period,
//!   i.e. the device provably ran dry. Reported for diagnosis; the gate
//!   is on missed beats, which is what the musician perceives.

use std::process::ExitCode;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use yames_lib::probe::{
    create_beat_log, create_shared_state, CallbackProbe, CallbackSample, MetronomeEngine,
};

/// Pessimistic upper bound on callbacks per second used to size the
/// preallocated arena: 4000/s is a 0.25 ms buffer at 48 kHz, well below
/// anything WASAPI/CoreAudio/ALSA hands out in shared mode.
const MAX_CALLBACKS_PER_SEC: usize = 4000;

struct Args {
    bpm: u16,
    subdivision: u8,
    seconds: u64,
    warmup_ms: u64,
    gguf: Option<String>,
    no_llm: bool,
    p99_ms: f64,
    json: bool,
    dump_csv: Option<String>,
}

impl Default for Args {
    fn default() -> Self {
        Self {
            bpm: 200,
            subdivision: 4,
            seconds: 60,
            warmup_ms: 1500,
            gguf: None,
            no_llm: false,
            p99_ms: 1.0,
            json: false,
            dump_csv: None,
        }
    }
}

fn parse_args() -> Result<Args, String> {
    let mut a = Args::default();
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < argv.len() {
        // Value-taking flags advance `i` twice; boolean flags once.
        let value = |i: usize| -> Result<&str, String> {
            argv.get(i + 1)
                .map(String::as_str)
                .ok_or_else(|| format!("{} needs a value", argv[i]))
        };
        let num = |i: usize| -> Result<f64, String> {
            let v = value(i)?;
            v.parse::<f64>()
                .map_err(|_| format!("{}: {v:?} is not a number", argv[i]))
        };
        let mut consumed = 2;
        match argv[i].as_str() {
            "--bpm" => a.bpm = num(i)? as u16,
            "--subdivision" => a.subdivision = num(i)? as u8,
            "--seconds" => a.seconds = num(i)? as u64,
            "--warmup-ms" => a.warmup_ms = num(i)? as u64,
            "--p99-ms" => a.p99_ms = num(i)?,
            "--gguf" => a.gguf = Some(value(i)?.to_string()),
            "--dump-csv" => a.dump_csv = Some(value(i)?.to_string()),
            "--no-llm" => {
                a.no_llm = true;
                consumed = 1;
            }
            "--json" => {
                a.json = true;
                consumed = 1;
            }
            "-h" | "--help" => return Err("help".into()),
            other => return Err(format!("unknown flag {other}")),
        }
        i += consumed;
    }
    if a.subdivision == 0 {
        return Err("--subdivision must be >= 1".into());
    }
    if a.bpm == 0 {
        return Err("--bpm must be >= 1".into());
    }
    Ok(a)
}

const USAGE: &str = "\
click-jitter-probe — ROADMAP §4 audio-safety gate

  --bpm <n>          default 200
  --subdivision <n>  default 4
  --seconds <n>      measured window, default 60
  --warmup-ms <n>    excluded stream start-up, default 1500
  --gguf <path>      loop coach::generate over this model (needs
                     --features coach-llm | coach-llm-vulkan | coach-llm-metal)
  --no-llm           baseline run
  --p99-ms <f>       jitter threshold, default 1.0
  --json             also print a one-line JSON summary
  --dump-csv <path>  write the raw per-callback capture for re-analysis

exit 0 = pass, 1 = gate failure, 2 = setup error";

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

fn percentile(sorted: &[f64], q: f64) -> f64 {
    if sorted.is_empty() {
        return f64::NAN;
    }
    // Nearest-rank; with thousands of samples the interpolation choice is
    // noise, and nearest-rank never invents a value the stream did not
    // actually produce.
    let rank = (q * sorted.len() as f64).ceil() as usize;
    sorted[rank.saturating_sub(1).min(sorted.len() - 1)]
}

struct Report {
    callbacks: usize,
    excluded: usize,
    overflow: usize,
    sample_rate: u32,
    median_frames: u32,
    buffer_ms: f64,
    wall_s: f64,
    audio_s: f64,
    jitter_p50: f64,
    jitter_p95: f64,
    jitter_p99: f64,
    jitter_max: f64,
    max_gap_ms: f64,
    dropouts: usize,
    ticks_rendered: u64,
    ticks_expected: f64,
    missed_beats: u64,
}

fn analyse(
    all: &[CallbackSample],
    sample_rate: u32,
    overflow: usize,
    window_start_ns: u64,
    tick_interval_s: f64,
) -> Result<Report, String> {
    let w: Vec<CallbackSample> = all
        .iter()
        .copied()
        .filter(|s| s.entry_ns >= window_start_ns)
        .collect();
    if w.len() < 3 {
        return Err(format!(
            "only {} callbacks in the measurement window — did the stream start?",
            w.len()
        ));
    }

    let sr = sample_rate as f64;
    let mut abs_jitter_ms: Vec<f64> = Vec::with_capacity(w.len());
    let mut max_gap_ms = 0.0f64;
    let mut dropouts = 0usize;

    for pair in w.windows(2) {
        let (a, b) = (pair[0], pair[1]);
        let delta_ms = (b.entry_ns.saturating_sub(a.entry_ns)) as f64 / 1e6;
        // The device drains the buffer `a` just filled at exactly
        // frames/sample_rate, so that is when `b` is due.
        let expected_ms = a.frames as f64 / sr * 1000.0;
        abs_jitter_ms.push((delta_ms - expected_ms).abs());
        if delta_ms > max_gap_ms {
            max_gap_ms = delta_ms;
        }
        if expected_ms > 0.0 && delta_ms > 2.0 * expected_ms {
            dropouts += 1;
        }
    }
    abs_jitter_ms.sort_by(|x, y| x.partial_cmp(y).unwrap());

    let first = w[0];
    let last = w[w.len() - 1];
    let wall_s = (last.entry_ns - first.entry_ns) as f64 / 1e9;
    let audio_s = (last.sample_pos.saturating_sub(first.sample_pos)) as f64 / sr;
    let ticks_rendered: u64 = w.iter().map(|s| s.ticks as u64).sum();
    let ticks_expected = wall_s / tick_interval_s;
    // Time the DAC had no fresh samples, in ticks. Negative (audio clock
    // running fast) floors at zero.
    let missed_beats = (((wall_s - audio_s) / tick_interval_s).floor()).max(0.0) as u64;

    let mut frames: Vec<u32> = w.iter().map(|s| s.frames).collect();
    frames.sort_unstable();
    let median_frames = frames[frames.len() / 2];

    Ok(Report {
        callbacks: w.len(),
        excluded: all.len() - w.len(),
        overflow,
        sample_rate,
        median_frames,
        buffer_ms: median_frames as f64 / sr * 1000.0,
        wall_s,
        audio_s,
        jitter_p50: percentile(&abs_jitter_ms, 0.50),
        jitter_p95: percentile(&abs_jitter_ms, 0.95),
        jitter_p99: percentile(&abs_jitter_ms, 0.99),
        jitter_max: abs_jitter_ms.last().copied().unwrap_or(f64::NAN),
        max_gap_ms,
        dropouts,
        ticks_rendered,
        ticks_expected,
        missed_beats,
    })
}

// ---------------------------------------------------------------------------
// LLM load generator
// ---------------------------------------------------------------------------

/// A realistic mini-report context — same shape `miniReport.ts` builds.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
const LLM_CONTEXT: &str = "\
Accuracy: 78
SignedDev: -6.4
HitCompleteness: 0.81
Longest clean streak: 12
Tempo: 200 BPM, 16th notes
Give the player one concrete thing to fix.";

/// Only constructed on `coach-llm` builds; the default build's `start_llm`
/// always errors, so every field would otherwise read as dead code.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
struct LlmRun {
    handle: Option<std::thread::JoinHandle<()>>,
    generations: Arc<AtomicU64>,
    failures: Arc<AtomicU64>,
    backend: String,
    load_secs: f64,
}

#[cfg(feature = "coach-llm")]
fn start_llm(path: &str, stop: Arc<AtomicBool>) -> Result<LlmRun, String> {
    use std::time::Instant;
    use yames_lib::probe::{generate, load_model, with_below_normal_priority, CoachEngine};

    let p = std::path::PathBuf::from(path);
    if !p.exists() {
        return Err(format!("--gguf: no such file: {path}"));
    }

    let backend = if cfg!(feature = "coach-llm-vulkan") {
        "vulkan"
    } else if cfg!(feature = "coach-llm-metal") {
        "metal"
    } else {
        "cpu"
    };
    let gpu_layers = std::env::var("YAMES_LLM_GPU_LAYERS").unwrap_or_else(|_| "(unset)".into());
    eprintln!("[probe] loading {path} (backend={backend}, YAMES_LLM_GPU_LAYERS={gpu_layers})");

    // Load before the metronome starts: the gate is about *generation*
    // disturbing the click, and a 60 s window that begins mid-load would
    // measure a different thing every run.
    let started = Instant::now();
    let mut engine = CoachEngine::new();
    load_model(&mut engine, &p)?;
    let load_secs = started.elapsed().as_secs_f64();
    eprintln!("[probe] model loaded in {load_secs:.1}s");

    let generations = Arc::new(AtomicU64::new(0));
    let failures = Arc::new(AtomicU64::new(0));
    let gens = generations.clone();
    let fails = failures.clone();

    let handle = std::thread::Builder::new()
        .name("probe-llm".into())
        .spawn(move || {
            // Same scheduling policy `coach_generate` uses in the app
            // (ROADMAP §3) — measuring a normal-priority thread would not
            // be measuring the shipping behaviour.
            with_below_normal_priority(|| {
                while !stop.load(Ordering::Relaxed) {
                    match generate(&engine, LLM_CONTEXT) {
                        Ok(_) => {
                            gens.fetch_add(1, Ordering::Relaxed);
                        }
                        Err(e) => {
                            fails.fetch_add(1, Ordering::Relaxed);
                            eprintln!("[probe] generation failed: {e}");
                        }
                    }
                }
            });
        })
        .map_err(|e| format!("failed to spawn LLM thread: {e}"))?;

    Ok(LlmRun {
        handle: Some(handle),
        generations,
        failures,
        backend: backend.to_string(),
        load_secs,
    })
}

#[cfg(not(feature = "coach-llm"))]
fn start_llm(_path: &str, _stop: Arc<AtomicBool>) -> Result<LlmRun, String> {
    Err("this binary was built without the coach-llm feature — rebuild with \
         `--features coach-llm` (or coach-llm-vulkan / coach-llm-metal), \
         or pass --no-llm"
        .into())
}

// ---------------------------------------------------------------------------

fn main() -> ExitCode {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            if e != "help" {
                eprintln!("error: {e}\n");
            }
            eprintln!("{USAGE}");
            return if e == "help" {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(2)
            };
        }
    };

    if args.gguf.is_some() && args.no_llm {
        eprintln!("error: --gguf and --no-llm are mutually exclusive");
        return ExitCode::from(2);
    }
    if args.gguf.is_none() && !args.no_llm {
        eprintln!("error: pass either --gguf <path> or --no-llm");
        return ExitCode::from(2);
    }

    let tick_interval_s = 60.0 / args.bpm as f64 / args.subdivision as f64;
    let total_s = args.seconds + args.warmup_ms.div_ceil(1000);

    // ---- LLM first, so the model is warm before the window opens ----
    let stop = Arc::new(AtomicBool::new(false));
    let mut llm: Option<LlmRun> = None;
    if let Some(ref path) = args.gguf {
        match start_llm(path, stop.clone()) {
            Ok(run) => llm = Some(run),
            Err(e) => {
                eprintln!("error: {e}");
                return ExitCode::from(2);
            }
        }
    }

    // ---- Engine ----
    let capacity = (total_s as usize + 2) * MAX_CALLBACKS_PER_SEC;
    let cb_probe = Arc::new(CallbackProbe::new(capacity));
    let beat_log = create_beat_log();
    let state = create_shared_state();
    {
        let mut s = state.lock().unwrap();
        s.bpm = args.bpm;
        s.subdivision = args.subdivision;
        s.is_playing = true;
        // A 4/4 bar keeps the accent pattern (and therefore the voice mix)
        // representative; nothing here changes tick spacing.
        s.beat_groups = vec![4];
    }

    let mut engine = MetronomeEngine::new_with_probe(beat_log, cb_probe.clone());
    engine.start_headless(state);

    eprintln!(
        "[probe] {} BPM / subdivision {} ({:.1} ticks/s, {:.2} ms apart), warmup {} ms, window {} s",
        args.bpm,
        args.subdivision,
        1.0 / tick_interval_s,
        tick_interval_s * 1000.0,
        args.warmup_ms,
        args.seconds,
    );

    std::thread::sleep(Duration::from_millis(args.warmup_ms));
    let window_start_ns = yames_lib::probe::now_ns();
    std::thread::sleep(Duration::from_secs(args.seconds));

    engine.shutdown();
    stop.store(true, Ordering::Relaxed);

    let samples = cb_probe.snapshot();
    let sample_rate = cb_probe.sample_rate();
    let overflow = cb_probe.overflow();

    // Joining can take one generation (up to a few seconds); do it after
    // the audio measurement is already captured.
    let llm_summary = llm.take().map(|mut run| {
        if let Some(h) = run.handle.take() {
            let _ = h.join();
        }
        (
            run.backend,
            run.load_secs,
            run.generations.load(Ordering::Relaxed),
            run.failures.load(Ordering::Relaxed),
        )
    });

    if sample_rate == 0 {
        eprintln!("error: the audio stream never started (no output device?)");
        return ExitCode::from(2);
    }

    if let Some(ref path) = args.dump_csv {
        // Raw capture, so a run can be re-analysed without re-running it
        // (and so a surprising percentile can be traced to real samples
        // rather than argued about).
        let mut out = String::with_capacity(samples.len() * 40);
        out.push_str("entry_ns,frames,sample_pos,ticks,in_window\n");
        for s in &samples {
            out.push_str(&format!(
                "{},{},{},{},{}\n",
                s.entry_ns,
                s.frames,
                s.sample_pos,
                s.ticks,
                u8::from(s.entry_ns >= window_start_ns)
            ));
        }
        match std::fs::write(path, out) {
            Ok(()) => eprintln!("[probe] wrote {} callbacks to {path}", samples.len()),
            Err(e) => eprintln!("[probe] could not write {path}: {e}"),
        }
    }

    let report = match analyse(
        &samples,
        sample_rate,
        overflow,
        window_start_ns,
        tick_interval_s,
    ) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("error: {e}");
            return ExitCode::from(2);
        }
    };

    // ---- Output ----
    let mode = match &llm_summary {
        None => "baseline (--no-llm)".to_string(),
        Some((backend, _, _, _)) => format!(
            "LLM backend={backend} YAMES_LLM_GPU_LAYERS={}",
            std::env::var("YAMES_LLM_GPU_LAYERS").unwrap_or_else(|_| "(unset)".into())
        ),
    };

    println!("\n=== click-jitter-probe ===");
    println!("mode              {mode}");
    if let Some((_, load_secs, gens, fails)) = &llm_summary {
        println!("model load        {load_secs:.1} s");
        println!("generations       {gens} completed, {fails} failed");
    }
    println!(
        "stream            {} Hz, {} frames/callback ({:.2} ms)",
        report.sample_rate, report.median_frames, report.buffer_ms
    );
    println!(
        "window            {:.2} s wall / {:.2} s audio, {} callbacks ({} start-up excluded)",
        report.wall_s, report.audio_s, report.callbacks, report.excluded
    );
    if report.overflow > 0 {
        println!("arena overflow    {} callbacks DROPPED", report.overflow);
    }
    println!(
        "ticks             {} rendered, {:.1} expected",
        report.ticks_rendered, report.ticks_expected
    );
    println!("--- callback-to-callback jitter (|Δwall − buffer period|) ---");
    println!("p50               {:.4} ms", report.jitter_p50);
    println!("p95               {:.4} ms", report.jitter_p95);
    println!("p99               {:.4} ms", report.jitter_p99);
    println!("max               {:.4} ms", report.jitter_max);
    println!("max gap           {:.4} ms", report.max_gap_ms);
    println!("dropouts (>2×buf) {}", report.dropouts);
    println!("missed beats      {}", report.missed_beats);

    let jitter_ok = report.jitter_p99 < args.p99_ms;
    let beats_ok = report.missed_beats == 0;
    let arena_ok = report.overflow == 0;
    println!("--- gate (ROADMAP §4) ---");
    println!(
        "p99 < {:.2} ms      {}",
        args.p99_ms,
        if jitter_ok { "PASS" } else { "FAIL" }
    );
    println!(
        "missed beats = 0  {}",
        if beats_ok { "PASS" } else { "FAIL" }
    );
    if !arena_ok {
        println!("arena overflow    FAIL (statistics are truncated)");
    }

    if args.json {
        println!(
            "JSON {{\"mode\":\"{}\",\"sample_rate\":{},\"frames\":{},\"callbacks\":{},\
\"p50_ms\":{:.5},\"p95_ms\":{:.5},\"p99_ms\":{:.5},\"max_ms\":{:.5},\
\"max_gap_ms\":{:.5},\"dropouts\":{},\"missed_beats\":{},\"pass\":{}}}",
            mode,
            report.sample_rate,
            report.median_frames,
            report.callbacks,
            report.jitter_p50,
            report.jitter_p95,
            report.jitter_p99,
            report.jitter_max,
            report.max_gap_ms,
            report.dropouts,
            report.missed_beats,
            jitter_ok && beats_ok && arena_ok
        );
    }

    if jitter_ok && beats_ok && arena_ok {
        println!("\nRESULT PASS");
        ExitCode::SUCCESS
    } else {
        println!("\nRESULT FAIL");
        ExitCode::from(1)
    }
}
