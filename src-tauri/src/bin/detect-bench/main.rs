//! `detect-bench`: every detection number Yames claims, measured through the
//! production code path, the same way every time.
//!
//!   detect-bench run    the bench: per technique x per capture chain, JSON
//!                       and Markdown out, and `--check` against a committed
//!                       baseline
//!   detect-bench replay one recording (a WAV, or a Take the app kept) through
//!                       the same path, as JSON and a page to look at
//!   detect-bench render the synthetic Takes written out as WAVs with sidecars
//!   detect-bench cost   the note model's CPU time per minute of audio
//!
//! `plans/detection/MEASURE.md` is the manual. `npm run detect:bench -- ...`
//! is this binary built in release with the note model on.

mod cases;
mod eval;
mod harness;
mod replay;
mod synth;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use serde_json::json;
use yames_lib::detect::model;
use yames_lib::pitch::{decode_mono_file, ScoreNote};
use yames_lib::score::verify::NoteDetail;

use cases::{Case, Mode, Source, TakeMeta};
use harness::{run_take, Job, Options};

const USAGE: &str = "\
usage:
  detect-bench run [--fast | --full] [--chains a,b,..] [--dir <folder>]... [--only <substr>]
                   [--out <dir>] [--notes] [--jobs N] [--no-model]
                   [--check] [--update-baseline] [--baseline <file>]
  detect-bench replay <audio> [--job <sidecar.json>] [--out <dir>] [--no-model]
  detect-bench render <out-dir> [--fast | --full] [--chains a,b,..] [--only <substr>]
  detect-bench cost [--seconds N]
";

struct Args(Vec<String>);

impl Args {
    fn flag(&mut self, name: &str) -> bool {
        match self.0.iter().position(|a| a == name) {
            Some(i) => {
                self.0.remove(i);
                true
            }
            None => false,
        }
    }
    fn value(&mut self, name: &str) -> Option<String> {
        let i = self.0.iter().position(|a| a == name)?;
        if i + 1 >= self.0.len() {
            return None;
        }
        self.0.remove(i);
        Some(self.0.remove(i))
    }
    fn values(&mut self, name: &str) -> Vec<String> {
        let mut out = Vec::new();
        while let Some(v) = self.value(name) {
            out.push(v);
        }
        out
    }
}

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("."))
}

fn job_of(meta: &TakeMeta) -> Job {
    Job {
        audio: String::new(),
        bpm: meta.bpm,
        first_beat_ms: meta.lead_s * 1000.0,
        beats_per_bar: Some(meta.beats_per_bar.round().max(1.0) as u32),
        quarters_ms: Vec::new(),
        instrument: None,
        schedule: Some(meta.schedule.clone()),
        pitches: meta.truth.iter().map(|n| ScoreNote { id: n.note_id, midi: n.midi_written }).collect(),
        details: meta
            .truth
            .iter()
            .map(|n| NoteDetail {
                id: n.note_id,
                dur_beats: n.dur * meta.bpm / 60.0,
                bend: n.bend_written,
                string: n.string,
                // the bench marks the slid-TO note; the app's DSL marks the one it leaves
                tech: n.tech.iter().filter(|t| *t != "slide" && *t != "dead").cloned().collect(),
                bend_shape: (n.bend_written > 0.0 && n.release).then_some(yames_lib::score::curves::BendShape::Release),
            })
            .collect::<Vec<_>>()
            .pipe(|d| mark_slides(meta, d)),
        pass_bars: meta.pass_bars.clone(),
        input_frames: None,
        subdivision: None,
    }
}

trait Pipe: Sized {
    fn pipe<R>(self, f: impl FnOnce(Self) -> R) -> R {
        f(self)
    }
}
impl<T> Pipe for T {}

/// Put the `slide` mark where the app's own notes carry it: on the note the
/// slide LEAVES (the previous note on the same string).
fn mark_slides(meta: &TakeMeta, mut details: Vec<NoteDetail>) -> Vec<NoteDetail> {
    let mut last_on_string: BTreeMap<u8, usize> = BTreeMap::new();
    for (i, n) in meta.truth.iter().enumerate() {
        if n.legato && n.tech.iter().any(|t| t == "slide") {
            if let Some(p) = last_on_string.get(&n.string) {
                details[*p].tech.push("slide".into());
            }
        }
        last_on_string.insert(n.string, i);
    }
    details
}

fn audio_of(case: &Case) -> Result<(Vec<f32>, u32), String> {
    match &case.source {
        Source::Synth { notes, seed } => {
            let dry = synth::render_strings(notes, case.meta.seconds, *seed);
            Ok((synth::capture(&dry, &case.meta.chain, *seed)?, synth::SR))
        }
        Source::File(path) => decode_mono_file(path),
    }
}

fn collect_cases(args: &mut Args) -> Result<(Vec<Case>, String, Vec<String>), String> {
    let full = args.flag("--full");
    let _ = args.flag("--fast");
    let chains: Vec<String> = match args.value("--chains") {
        Some(c) => c.split(',').map(|s| s.to_string()).collect(),
        None => synth::CHAINS.iter().map(|s| s.to_string()).collect(),
    };
    let only = args.value("--only");
    let dirs = args.values("--dir");
    let mut cases = Vec::new();
    let mode_name;
    if dirs.is_empty() {
        mode_name = if full { "full" } else { "fast" }.to_string();
        let packs = repo_root().join("src/paths/packs");
        cases = cases::synthetic(&packs, &Mode { fast: !full, chains: chains.clone() })?;
        if let Some(o) = &only {
            cases.retain(|c| c.meta.name.contains(o.as_str()));
        }
    } else {
        mode_name = "recordings".to_string();
        for d in &dirs {
            cases.extend(cases::from_dir(Path::new(d), only.as_deref())?);
        }
    }
    let mut seen: Vec<String> = Vec::new();
    for c in &cases {
        if !seen.contains(&c.meta.chain) {
            seen.push(c.meta.chain.clone());
        }
    }
    Ok((cases, mode_name, seen))
}

fn run(mut args: Args) -> Result<ExitCode, String> {
    let check = args.flag("--check");
    let update = args.flag("--update-baseline");
    let want_notes = args.flag("--notes");
    let no_model = args.flag("--no-model");
    let jobs: usize = args.value("--jobs").and_then(|v| v.parse().ok()).unwrap_or_else(|| (std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4) / 2).clamp(1, 8));
    let out_dir = args.value("--out").map(PathBuf::from);
    let baseline_arg = args.value("--baseline").map(PathBuf::from);
    let (cases, mode_name, chains) = collect_cases(&mut args)?;
    if let Some(extra) = args.0.first() {
        return Err(format!("unknown argument `{extra}`\n{USAGE}"));
    }
    if cases.is_empty() {
        return Err("no Takes to run".into());
    }
    let has_model = model::compiled() && !no_model;
    if !has_model {
        eprintln!("note: running WITHOUT the note model (build with `--features detect-ort`, or drop `--no-model`); verifier metrics are left out");
    }
    let out_dir = out_dir.unwrap_or_else(|| repo_root().join(".detect-bench").join(&mode_name));
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("{}: {e}", out_dir.display()))?;

    let started = std::time::Instant::now();
    let next = AtomicUsize::new(0);
    let results: Mutex<Vec<(usize, Vec<eval::Row>, eval::TakeRow)>> = Mutex::new(Vec::new());
    let failure: Mutex<Option<String>> = Mutex::new(None);
    std::thread::scope(|scope| {
        for _ in 0..jobs.min(cases.len()) {
            scope.spawn(|| {
                let mut model = if has_model {
                    match model::load() {
                        Ok(m) => Some(m),
                        Err(e) => {
                            *failure.lock().unwrap() = Some(format!("the note model did not load: {e}"));
                            return;
                        }
                    }
                } else {
                    None
                };
                loop {
                    let i = next.fetch_add(1, Ordering::SeqCst);
                    if i >= cases.len() || failure.lock().unwrap().is_some() {
                        break;
                    }
                    let case = &cases[i];
                    let (samples, rate) = match audio_of(case) {
                        Ok(a) => a,
                        Err(e) => {
                            *failure.lock().unwrap() = Some(format!("{}: {e}", case.meta.name));
                            break;
                        }
                    };
                    let job = job_of(&case.meta);
                    let out = run_take(&samples, rate, &job, model.as_mut(), &Options { keep_track: false });
                    let (rows, take) = eval::rows(&case.meta, &out);
                    let mut r = results.lock().unwrap();
                    r.push((i, rows, take));
                    if r.len() % 50 == 0 {
                        eprintln!("{}/{} Takes after {:.0} s", r.len(), cases.len(), started.elapsed().as_secs_f64());
                    }
                }
            });
        }
    });
    if let Some(e) = failure.into_inner().unwrap() {
        return Err(e);
    }
    let mut results = results.into_inner().unwrap();
    results.sort_by_key(|r| r.0);
    let rows: Vec<eval::Row> = results.iter().flat_map(|r| r.1.iter().cloned()).collect();
    let takes: Vec<eval::TakeRow> = results.iter().map(|r| r.2.clone()).collect();
    let metrics = eval::metrics(&rows, &takes, has_model);

    let about = json!({
        "mode": mode_name,
        "takes": takes.len(),
        "notes": rows.len(),
        "chains": chains,
        "noteModel": if has_model { "basic-pitch icassp-2022 on onnxruntime (ort)" } else { "none" },
    });
    let doc = json!({ "about": about, "metrics": metrics, "takes": takes });
    let write = |name: &str, body: String| -> Result<(), String> {
        let p = out_dir.join(name);
        std::fs::write(&p, body).map_err(|e| format!("{}: {e}", p.display()))
    };
    write("results.json", serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())?)?;
    write("results.md", eval::markdown(&about, &metrics, &takes, &chains, has_model))?;
    if want_notes {
        let mut body = String::new();
        for r in &rows {
            body.push_str(&serde_json::to_string(r).map_err(|e| e.to_string())?);
            body.push('\n');
        }
        write("notes.jsonl", body)?;
    }
    eprintln!("{} Takes, {} notes in {:.0} s -> {}", takes.len(), rows.len(), started.elapsed().as_secs_f64(), out_dir.display());

    let baseline_path = baseline_arg.unwrap_or_else(|| repo_root().join("plans/detection/baselines").join(format!("{mode_name}{}.json", if has_model { "" } else { "-no-model" })));
    if update {
        let base = eval::Baseline { about: about.clone(), metrics: metrics.clone() };
        if let Some(parent) = baseline_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        // one metric a line, four decimals: a diff of this file reads as a list of what moved
        let mut body = format!("{{\n\"about\": {},\n\"metrics\": {{\n", base.about);
        let n = base.metrics.len();
        for (i, (k, m)) in base.metrics.iter().enumerate() {
            let better = serde_json::to_string(&m.better).map_err(|e| e.to_string())?;
            body.push_str(&format!("{}: {{\"value\": {:.4}, \"n\": {}, \"better\": {}}}{}\n", serde_json::to_string(k).map_err(|e| e.to_string())?, m.value, m.n, better, if i + 1 < n { "," } else { "" }));
        }
        body.push_str("}\n}\n");
        std::fs::write(&baseline_path, body).map_err(|e| format!("{}: {e}", baseline_path.display()))?;
        eprintln!("baseline written: {}", baseline_path.display());
    }
    if check {
        let raw = std::fs::read_to_string(&baseline_path).map_err(|e| format!("{}: {e} (run with --update-baseline to make one)", baseline_path.display()))?;
        let base: eval::Baseline = serde_json::from_str(&raw).map_err(|e| format!("{}: {e}", baseline_path.display()))?;
        let outcome = eval::check(&metrics, &base);
        for line in &outcome.improvements {
            println!("better   {line}");
        }
        for key in &outcome.missing {
            println!("missing  {key}: in the baseline, not measured by this run");
        }
        for line in &outcome.regressions {
            println!("WORSE    {line}");
        }
        let gated = base.metrics.values().filter(|m| m.better != eval::Better::Info).count();
        println!(
            "{} gated metrics against {}: {} worse, {} better, {} missing",
            gated,
            baseline_path.display(),
            outcome.regressions.len(),
            outcome.improvements.len(),
            outcome.missing.len()
        );
        if !outcome.regressions.is_empty() || !outcome.missing.is_empty() {
            return Ok(ExitCode::from(1));
        }
        if !outcome.improvements.is_empty() {
            println!("(improvements are not failures; re-run with --update-baseline to keep them)");
        }
    }
    Ok(ExitCode::SUCCESS)
}

fn render(mut args: Args) -> Result<ExitCode, String> {
    if args.0.is_empty() {
        return Err(USAGE.into());
    }
    let out_dir = PathBuf::from(args.0.remove(0));
    let (cases, _, _) = collect_cases(&mut args)?;
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    for case in &cases {
        let (samples, rate) = audio_of(case)?;
        let wav = out_dir.join(format!("{}.wav", case.meta.name));
        write_wav(&wav, &samples, rate)?;
        let mut job = job_of(&case.meta);
        job.audio = format!("{}.wav", case.meta.name);
        std::fs::write(out_dir.join(format!("{}.job.json", case.meta.name)), serde_json::to_string(&job).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        std::fs::write(out_dir.join(format!("{}.truth.json", case.meta.name)), serde_json::to_string(&case.meta).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    }
    eprintln!("{} Takes written to {}", cases.len(), out_dir.display());
    Ok(ExitCode::SUCCESS)
}

fn write_wav(path: &Path, samples: &[f32], rate: u32) -> Result<(), String> {
    let spec = hound::WavSpec { channels: 1, sample_rate: rate, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
    let mut w = hound::WavWriter::create(path, spec).map_err(|e| format!("{}: {e}", path.display()))?;
    for s in samples {
        w.write_sample((s.clamp(-1.0, 1.0) * 32767.0) as i16).map_err(|e| e.to_string())?;
    }
    w.finalize().map_err(|e| e.to_string())
}

fn replay_cmd(mut args: Args) -> Result<ExitCode, String> {
    let no_model = args.flag("--no-model");
    let job_path = args.value("--job").map(PathBuf::from);
    let out_dir = args.value("--out").map(PathBuf::from);
    if args.0.len() != 1 {
        return Err(USAGE.into());
    }
    let mut audio = PathBuf::from(&args.0[0]);
    // `replay take.job.json` works too: the sidecar names its audio
    let mut job_path = job_path;
    if audio.extension().and_then(|e| e.to_str()) == Some("json") {
        job_path = Some(audio.clone());
    } else if job_path.is_none() {
        let beside = PathBuf::from(format!("{}.job.json", audio.with_extension("").display()));
        if beside.exists() {
            job_path = Some(beside);
        }
    }
    let job: Job = match &job_path {
        Some(p) => {
            let raw = std::fs::read_to_string(p).map_err(|e| format!("{}: {e}", p.display()))?;
            let job: Job = serde_json::from_str(&raw).map_err(|e| format!("{}: {e}", p.display()))?;
            if audio.extension().and_then(|e| e.to_str()) == Some("json") {
                let named = PathBuf::from(&job.audio);
                audio = if named.is_absolute() { named } else { p.parent().unwrap_or(Path::new(".")).join(named) };
            }
            job
        }
        None => Job { bpm: 120.0, ..Job::default() },
    };
    let (samples, rate) = decode_mono_file(&audio)?;
    let mut loaded = if model::compiled() && !no_model { Some(model::load()?) } else { None };
    let out = run_take(&samples, rate, &job, loaded.as_mut(), &Options { keep_track: true });
    let doc = replay::document(&samples, rate, &job, &out, &audio.display().to_string());
    let out_dir = out_dir.unwrap_or_else(|| audio.parent().unwrap_or(Path::new(".")).to_path_buf());
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let stem = audio.file_stem().and_then(|s| s.to_str()).unwrap_or("take");
    let json_path = out_dir.join(format!("{stem}.replay.json"));
    let html_path = out_dir.join(format!("{stem}.replay.html"));
    std::fs::write(&json_path, serde_json::to_string(&doc).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::write(&html_path, replay::html(&doc)).map_err(|e| e.to_string())?;
    // the short version on stdout
    if let Some(report) = &out.report {
        let g = &report.grade;
        println!("verdict {:?}  due {} heard {} missed {} extra {}  evenness {:?}  lag {:.1} ms", g.verdict, g.due, g.heard, g.missed, g.extra, g.evenness, g.calibration.offset_ms);
        if let Some(p) = &g.pass {
            println!("pass {:?}  not assessed {:?}", p.verdict, p.not_assessed);
        }
        for k in &out.verifier.kinds {
            println!("verifier {:?}: due {} sounded {} not sounded {} wrong {} couldn't tell {}", k.kind, k.due, k.sounded, k.not_sounded, k.wrong, k.unsure);
        }
    } else {
        println!("{} onsets in {:.1} s (no schedule given: free play)", out.detected.onsets.len(), out.seconds);
    }
    println!("{}\n{}", json_path.display(), html_path.display());
    Ok(ExitCode::SUCCESS)
}

/// CPU seconds this thread has used, where the platform says.
fn thread_cpu_s() -> Option<f64> {
    #[cfg(unix)]
    {
        let mut ts = libc::timespec { tv_sec: 0, tv_nsec: 0 };
        // SAFETY: a plain clock read into a local.
        if unsafe { libc::clock_gettime(libc::CLOCK_THREAD_CPUTIME_ID, &mut ts) } == 0 {
            return Some(ts.tv_sec as f64 + ts.tv_nsec as f64 / 1e9);
        }
    }
    None
}

fn cost(mut args: Args) -> Result<ExitCode, String> {
    let seconds: f64 = args.value("--seconds").and_then(|v| v.parse().ok()).unwrap_or(60.0);
    // a minute of the bench's own playing: sixteenths on the DI chain
    let packs = repo_root().join("src/paths/packs");
    let cases = cases::synthetic(&packs, &Mode { fast: true, chains: vec!["di".into()] })?;
    let case = cases.iter().find(|c| c.meta.category == "picked" && c.meta.style == "good").ok_or("no picked Take")?;
    let (one, rate) = audio_of(case)?;
    let mut samples = Vec::new();
    while (samples.len() as f64) < seconds * rate as f64 {
        samples.extend_from_slice(&one);
    }
    samples.truncate((seconds * rate as f64) as usize);
    let mut m = model::load()?;
    let _ = yames_lib::detect::analyse(m.as_mut(), &samples[..rate as usize * 2], rate)?; // warm
    let (c0, w0) = (thread_cpu_s(), std::time::Instant::now());
    let a = yames_lib::detect::analyse(m.as_mut(), &samples, rate)?;
    let (cpu, wall) = (thread_cpu_s().zip(c0).map(|(a, b)| a - b), w0.elapsed().as_secs_f64());
    let per_min = |s: f64| s * 60.0 / a.seconds;
    // The other half of the post-Take pass: the shipped pitch track, which the
    // right-notes pass and the curves share (`score::notes::LateScratch`).
    let t0 = std::time::Instant::now();
    let _ = std::hint::black_box(yames_lib::pitch::track(&samples, rate, &yames_lib::pitch::PitchConfig::guitar()));
    let track_wall = t0.elapsed().as_secs_f64();
    println!("{}", json!({
        "pitchTrackWallSeconds": track_wall,
        "trackerGradeAtSeconds": track_wall,
        "fullGradeAtSeconds": track_wall + wall,
        "runtime": m.runtime(),
        "audioSeconds": a.seconds,
        "wallSeconds": wall,
        "cpuSecondsThisThread": cpu,
        "wallSecondsPerMinuteOfAudio": per_min(wall),
        "cpuSecondsPerMinuteOfAudio": cpu.map(per_min),
        "timesRealTime": a.seconds / wall,
        "note": "resample + model + envelope, one intra-op thread; CPU time is this thread's own, so it holds on a busy machine",
    }));
    Ok(ExitCode::SUCCESS)
}

fn main() -> ExitCode {
    let mut argv: Vec<String> = std::env::args().skip(1).collect();
    if argv.is_empty() {
        eprint!("{USAGE}");
        return ExitCode::from(2);
    }
    let cmd = argv.remove(0);
    let args = Args(argv);
    let result = match cmd.as_str() {
        "run" => run(args),
        "replay" => replay_cmd(args),
        "render" => render(args),
        "cost" => cost(args),
        _ => Err(USAGE.to_string()),
    };
    match result {
        Ok(code) => code,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::from(2)
        }
    }
}
