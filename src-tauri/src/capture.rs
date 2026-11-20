//! Recording session mode (card #109): practise for half an hour and come away
//! with labelled test data, nothing labelled by hand.
//!
//! **Off unless the player turns it on, local when it is on.** It records the
//! raw microphone (or instrument) input of every Take, whatever else the room
//! held, into the app's own data folder; nothing here sends anything anywhere.
//! Settings says so in those words.
//!
//! While a session is on, every Take of it is kept (no limit of 20, unlike
//! "Keep my last Takes", `take_diagnostics`), in one folder per session:
//! `capture/<YYYYMMDD-HHMMSS>/`, with a `session.json` saying what the rig was.
//! The format is `plans/capture/FORMAT.md`; `tools/corpus/ingest.py` reads it.
//!
//! Where each thing runs:
//! - a Session Take is written on the post-Take thread (`timing.rs`,
//!   `yames-take-notes`), after its grade is published, exactly where the
//!   troubleshooting copy is;
//! - a jam or free play is kept through a tap of its own ([`Capture::free_tap`])
//!   that the onset detector's thread fills like the Take's, cut into segments
//!   and written on a thread of this module (`yames-capture-free`);
//! - the sync chirp is handed to the engine through the coach's speech slot
//!   (`speech_out`), so the callback does what it does for a line of speech:
//!   read samples and add them in. It notes the moment the first sample goes
//!   out with one atomic store.
//!
//! Nothing here runs on an audio thread. The disk is bounded: a warning at
//! [`WARN_BYTES`], and no more writing at the cap the player set.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use crate::take_audio::{SharedTakeAudioTap, TakeAudioTap};

pub const FORMAT: &str = "yames-capture/1";

/// Past this the player is told the session is getting big.
pub const WARN_BYTES: u64 = 5 * 1024 * 1024 * 1024;

/// The cap when the player has not set one.
pub const DEFAULT_CAP_BYTES: u64 = 10 * 1024 * 1024 * 1024;

/// A cap below this is taken as this: a session that stops after one Take is
/// a setting typed wrong.
const MIN_CAP_BYTES: u64 = 256 * 1024 * 1024;

/// A jam or free play is cut this long before its tap would fill.
const FREE_MARGIN_SECS: f64 = 10.0;

/// The sync chirp: two rising log sweeps with a gap, distinctive against a
/// guitar and a click, short enough not to annoy.
pub const CHIRP_F0: f64 = 600.0;
pub const CHIRP_F1: f64 = 7000.0;
pub const CHIRP_SWEEP_S: f64 = 0.15;
pub const CHIRP_GAP_S: f64 = 0.15;
pub const CHIRP_AMP: f32 = 0.35;

/// The chirp at `rate`: sweep, gap, sweep, each sweep with 5 ms fades.
pub fn chirp_pcm(rate: u32) -> Vec<f32> {
    let rate_f = rate.max(1) as f64;
    let n_sweep = (CHIRP_SWEEP_S * rate_f).round() as usize;
    let n_gap = (CHIRP_GAP_S * rate_f).round() as usize;
    let fade = (0.005 * rate_f).round().max(1.0) as usize;
    let k = (CHIRP_F1 / CHIRP_F0).ln();
    let sweep: Vec<f32> = (0..n_sweep)
        .map(|i| {
            let t = i as f64 / rate_f;
            // exponential sweep: phase = 2π f0 T / k (e^{k t / T} - 1)
            let phase = 2.0 * std::f64::consts::PI * CHIRP_F0 * CHIRP_SWEEP_S / k * ((k * t / CHIRP_SWEEP_S).exp() - 1.0);
            let edge = i.min(n_sweep - 1 - i);
            let g = if edge < fade { edge as f64 / fade as f64 } else { 1.0 };
            (phase.sin() * g) as f32 * CHIRP_AMP
        })
        .collect();
    let mut out = Vec::with_capacity(2 * n_sweep + n_gap);
    out.extend_from_slice(&sweep);
    out.resize(n_sweep + n_gap, 0.0);
    out.extend_from_slice(&sweep);
    out
}

fn wall_ms() -> f64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0)
}

/// The wall clock of a `clock::now_ns` instant, by a pair read together now.
fn wall_ms_of(ns: u64) -> f64 {
    let (now_ns, now_wall) = (crate::clock::now_ns(), wall_ms());
    now_wall + (ns as f64 - now_ns as f64) / 1e6
}

fn platform() -> &'static str {
    if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

/// `YYYYMMDD-HHMMSS` in UTC, from the wall clock: a folder name that sorts.
fn stamp_utc(ms: f64) -> String {
    let secs = (ms / 1000.0).floor() as i64;
    let days = secs.div_euclid(86_400);
    let sod = secs.rem_euclid(86_400);
    // civil from days (Howard Hinnant)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y:04}{m:02}{d:02}-{:02}{:02}{:02}", sod / 3600, sod % 3600 / 60, sod % 60)
}

struct Session {
    dir: PathBuf,
    id: String,
    doc: Value,
    bytes: u64,
    takes: u64,
    cap: u64,
    stopped: bool,
}

impl Session {
    fn save(&mut self) {
        self.doc["takes"] = json!(self.takes);
        self.doc["bytes"] = json!(self.bytes);
        self.doc["capBytes"] = json!(self.cap);
        self.doc["stoppedAtCap"] = json!(self.stopped);
        let tmp = self.dir.join("session.json.tmp");
        let ok = serde_json::to_vec_pretty(&self.doc)
            .map_err(|e| e.to_string())
            .and_then(|b| std::fs::write(&tmp, b).map_err(|e| e.to_string()))
            .and_then(|_| std::fs::rename(&tmp, self.dir.join("session.json")).map_err(|e| e.to_string()));
        if let Err(e) = ok {
            eprintln!("[yames] could not write the recording session's session.json: {e}");
        }
    }
}

/// A jam or free play being kept, segment by segment.
struct FreeRun {
    stop: Arc<AtomicBool>,
    /// Merged into the last segment's sidecar (the key and chord reading).
    extra: Arc<Mutex<Option<Value>>>,
    /// Joined by [`Capture::free_end`]: the last segment is on disk, and the
    /// tap is free, before anything else arms it.
    thread: std::thread::JoinHandle<()>,
}

#[derive(Default)]
pub struct Capture {
    enabled: AtomicBool,
    session: Mutex<Option<Session>>,
    /// What the frontend says the next Take is: its Path, Step, Exercise,
    /// variant, mode. Read once per Take, on the analyzer's thread at its close.
    context: Mutex<Option<Value>>,
    free_tap: OnceLock<SharedTakeAudioTap>,
    free: Mutex<Option<FreeRun>>,
    /// `clock::now_ns` at the end of the last Take written, for a mark.
    last_take_end_ns: AtomicU64,
    /// The folder of the last session that ended, for "Open folder" and
    /// "Zip session" after it.
    last: Mutex<Option<PathBuf>>,
}

static GLOBAL: OnceLock<Capture> = OnceLock::new();

/// The one recording session of the app. A global rather than a piece of
/// Tauri state because the onset detector's thread and the post-Take thread
/// both reach it, and neither has the app handle.
pub fn global() -> &'static Capture {
    GLOBAL.get_or_init(Capture::default)
}

/// What `status` reports to Settings.
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStatus {
    pub active: bool,
    pub session: Option<String>,
    pub dir: Option<String>,
    pub takes: u64,
    pub bytes: u64,
    pub warn_bytes: u64,
    pub cap_bytes: u64,
    pub warn: bool,
    pub stopped: bool,
}

impl Capture {
    pub fn enabled(&self) -> bool {
        self.enabled.load(Ordering::Acquire)
    }

    /// The tap a jam or free play is kept through. The onset detector fills
    /// it whether or not the transport runs, while it is armed.
    pub fn free_tap(&self) -> SharedTakeAudioTap {
        self.free_tap.get_or_init(TakeAudioTap::new).clone()
    }

    /// Start a session under `root` (`<app data>/capture`). `meta` is what the
    /// frontend knows of the rig (device, latency, settings, input rate). A
    /// session already on is ended first. The session's folder.
    pub fn start(&self, root: &Path, meta: Value, cap_bytes: Option<u64>) -> Result<PathBuf, String> {
        self.end();
        let started = wall_ms();
        let mut id = stamp_utc(started);
        let mut dir = root.join(&id);
        // two sessions started inside a second
        let mut n = 1;
        while dir.exists() {
            n += 1;
            id = format!("{}-{n}", stamp_utc(started));
            dir = root.join(&id);
        }
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let cap = cap_bytes.unwrap_or(DEFAULT_CAP_BYTES).max(MIN_CAP_BYTES);
        let get = |k: &str| meta.get(k).cloned().unwrap_or(Value::Null);
        let doc = json!({
            "format": FORMAT,
            "session": id,
            "startedWallMs": started,
            "endedWallMs": null,
            "clock": {"ns": crate::clock::now_ns(), "wallMs": wall_ms()},
            "app": {"version": env!("CARGO_PKG_VERSION"), "platform": platform(), "arch": std::env::consts::ARCH},
            "inputRate": get("inputRate"),
            "outputRate": get("outputRate"),
            "outputLatencyUs": get("outputLatencyUs"),
            "device": get("device"),
            "latency": get("latency"),
            "settings": get("settings"),
            "chirps": [],
            "takes": 0,
            "bytes": 0,
            "warnBytes": WARN_BYTES,
            "capBytes": cap,
            "stoppedAtCap": false,
        });
        let mut s = Session { dir: dir.clone(), id, doc, bytes: 0, takes: 0, cap, stopped: false };
        s.save();
        *self.session.lock().unwrap_or_else(|e| e.into_inner()) = Some(s);
        self.enabled.store(true, Ordering::Release);
        Ok(dir)
    }

    /// End the session: a jam being kept is finished, `endedWallMs` written.
    /// The folder of the session that ended.
    pub fn end(&self) -> Option<PathBuf> {
        // the jam's last segment goes into this session, before it closes
        self.free_end(None);
        self.enabled.store(false, Ordering::Release);
        *self.context.lock().unwrap_or_else(|e| e.into_inner()) = None;
        let mut guard = self.session.lock().unwrap_or_else(|e| e.into_inner());
        let mut s = guard.take()?;
        s.doc["endedWallMs"] = json!(wall_ms());
        s.save();
        *self.last.lock().unwrap_or_else(|e| e.into_inner()) = Some(s.dir.clone());
        Some(s.dir)
    }

    /// The session on now, else the last one that ended.
    pub fn dir_or_last(&self) -> Option<PathBuf> {
        self.dir().or_else(|| self.last.lock().unwrap_or_else(|e| e.into_inner()).clone())
    }

    /// The folder of the session on now, or of none.
    pub fn dir(&self) -> Option<PathBuf> {
        self.session.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|s| s.dir.clone())
    }

    pub fn status(&self) -> CaptureStatus {
        let guard = self.session.lock().unwrap_or_else(|e| e.into_inner());
        match guard.as_ref() {
            Some(s) => CaptureStatus {
                active: true,
                session: Some(s.id.clone()),
                dir: Some(s.dir.display().to_string()),
                takes: s.takes,
                bytes: s.bytes,
                warn_bytes: WARN_BYTES,
                cap_bytes: s.cap,
                warn: s.bytes >= WARN_BYTES,
                stopped: s.stopped,
            },
            None => CaptureStatus {
                active: false,
                session: None,
                dir: None,
                takes: 0,
                bytes: 0,
                warn_bytes: WARN_BYTES,
                cap_bytes: DEFAULT_CAP_BYTES,
                warn: false,
                stopped: false,
            },
        }
    }

    /// What the next Take is, from the frontend; `None` between Takes.
    pub fn set_context(&self, context: Option<Value>) {
        *self.context.lock().unwrap_or_else(|e| e.into_inner()) = context;
    }

    /// The context for a Take closing now, when a session is on.
    pub fn context_snapshot(&self) -> Option<Value> {
        if !self.enabled() {
            return None;
        }
        Some(self.context.lock().unwrap_or_else(|e| e.into_inner()).clone().unwrap_or(Value::Null))
    }

    /// Note a chirp the engine played (or could not) in `session.json`.
    pub fn add_chirp(&self, chirp: Value) {
        let mut guard = self.session.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(s) = guard.as_mut() {
            if let Some(list) = s.doc["chirps"].as_array_mut() {
                list.push(chirp);
            }
            s.save();
        }
    }

    /// "This one felt off": appended to `marks.jsonl`. Which Take it is for is
    /// the ingest's to say (the Take it fell in, else the last one before it);
    /// a Take written after it with the mark inside its span says so too.
    pub fn mark(&self) -> Result<Value, String> {
        let dir = self.dir().ok_or("no recording session is on")?;
        let ns = crate::clock::now_ns();
        let line = json!({"ns": ns, "wallMs": wall_ms(), "lastTakeEndNs": self.last_take_end_ns.load(Ordering::Acquire)});
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("marks.jsonl")).map_err(|e| e.to_string())?;
        writeln!(f, "{line}").map_err(|e| e.to_string())?;
        Ok(line)
    }

    fn marks_in(dir: &Path, from_ns: u64, to_ns: u64) -> Vec<u64> {
        let Ok(text) = std::fs::read_to_string(dir.join("marks.jsonl")) else { return Vec::new() };
        text.lines()
            .filter_map(|l| serde_json::from_str::<Value>(l).ok())
            .filter_map(|v| v["ns"].as_u64())
            .filter(|ns| *ns >= from_ns && *ns <= to_ns)
            .collect()
    }

    /// Write one Take of the session: the audio and `job` with a `capture`
    /// block filled in. Blocks on the disk; the post-Take thread's or this
    /// module's own thread's job. `None` when nothing was written (no session,
    /// the cap reached, a write that failed). Never panics out.
    pub fn write_take(&self, samples: &[f32], rate: u32, first_ns: u64, mut job: Value) -> Option<String> {
        if !self.enabled() || samples.is_empty() || rate == 0 {
            return None;
        }
        let (dir, id) = {
            let mut guard = self.session.lock().unwrap_or_else(|e| e.into_inner());
            let s = guard.as_mut()?;
            if s.stopped {
                return None;
            }
            // what this Take will cost, before it is written
            let estimate = samples.len() as u64 * 4 + 64 * 1024;
            if s.bytes + estimate > s.cap {
                s.stopped = true;
                s.save();
                eprintln!("[yames] the recording session reached its cap; no more Takes are kept");
                return None;
            }
            (s.dir.clone(), s.id.clone())
        };
        let span_ns = (samples.len() as f64 * 1e9 / rate as f64) as u64;
        let end_ns = first_ns + span_ns;
        if !job.is_object() {
            job = json!({});
        }
        let capture = job.get_mut("capture").filter(|c| c.is_object()).cloned().unwrap_or_else(|| json!({}));
        let mut capture = capture;
        capture["session"] = json!(id);
        capture["rate"] = json!(rate);
        capture["samples"] = json!(samples.len());
        capture["audioStartNs"] = json!(first_ns);
        capture["audioStartWallMs"] = json!(wall_ms_of(first_ns));
        capture["marks"] = json!(Self::marks_in(&dir, first_ns, end_ns));
        job["capture"] = capture;
        let stem = crate::take_diagnostics::next_stem();
        match crate::take_diagnostics::write_pair(&dir, &stem, samples, rate, &mut job) {
            Ok(bytes) => {
                self.last_take_end_ns.store(end_ns, Ordering::Release);
                let mut guard = self.session.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(s) = guard.as_mut().filter(|s| s.id == id) {
                    s.bytes += bytes;
                    s.takes += 1;
                    s.save();
                }
                Some(stem)
            }
            Err(e) => {
                eprintln!("[yames] could not keep the Take in the recording session: {e}");
                None
            }
        }
    }

    /// A jam or free play starts: keep its input through [`Self::free_tap`],
    /// in segments of a little under what the tap holds, until
    /// [`Self::free_end`]. `context` is what it is (kind, jam, bpm).
    /// Allocates the tap's buffer: a command thread's job.
    pub fn free_begin(&'static self, context: Value, input_rate: Option<u32>) -> Result<(), String> {
        if !self.enabled() {
            return Err("no recording session is on".into());
        }
        // the run before this one, finished and written, before the tap is armed again
        self.free_end(None);
        let tap = self.free_tap();
        tap.arm(input_rate);
        let stop = Arc::new(AtomicBool::new(false));
        let extra = Arc::new(Mutex::new(None));
        let run_id = format!("{:x}", crate::clock::now_ns());
        let (stop_t, extra_t, tap_t) = (stop.clone(), extra.clone(), tap.clone());
        let spawned = std::thread::Builder::new().name("yames-capture-free".into()).spawn(move || {
            crate::coach::lower_current_thread_priority();
            let ran = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                free_run(self, &tap_t, input_rate, &stop_t, &extra_t, &context, &run_id);
            }));
            if ran.is_err() {
                eprintln!("[yames] the recording session's jam capture stopped on a panic");
            }
            tap_t.disarm();
        });
        match spawned {
            Ok(thread) => {
                *self.free.lock().unwrap_or_else(|e| e.into_inner()) = Some(FreeRun { stop, extra, thread });
                Ok(())
            }
            Err(e) => {
                tap.disarm();
                Err(e.to_string())
            }
        }
    }

    /// The jam or free play ended. `extra` (the key and chord reading) goes
    /// into its last segment. Waits for that segment to be written (up to a
    /// couple of hundred milliseconds of disk): call it off the main thread.
    pub fn free_end(&self, extra: Option<Value>) {
        let run = self.free.lock().unwrap_or_else(|e| e.into_inner()).take();
        if let Some(run) = run {
            *run.extra.lock().unwrap_or_else(|e| e.into_inner()) = extra;
            run.stop.store(true, Ordering::Release);
            let _ = run.thread.join();
        }
    }

    /// Zip the session folder at `dir` into `out` (stored, not deflated: the
    /// audio is float PCM and the sidecars are small). The zip's path.
    pub fn zip_session(dir: &Path, out: &Path) -> Result<PathBuf, String> {
        use std::io::Write;
        let file = std::fs::File::create(out).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new(std::io::BufWriter::new(file));
        let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored).large_file(true);
        let root = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "session".into());
        let mut stack = vec![dir.to_path_buf()];
        while let Some(d) = stack.pop() {
            let mut entries: Vec<PathBuf> = std::fs::read_dir(&d).map_err(|e| e.to_string())?.filter_map(|e| e.ok().map(|e| e.path())).collect();
            entries.sort();
            for p in entries {
                if p.is_dir() {
                    stack.push(p);
                    continue;
                }
                let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                if name.ends_with(".tmp") {
                    continue;
                }
                let rel = p.strip_prefix(dir).map_err(|e| e.to_string())?;
                let rel = rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>().join("/");
                zip.start_file(format!("{root}/{rel}"), opts).map_err(|e| e.to_string())?;
                let mut f = std::fs::File::open(&p).map_err(|e| e.to_string())?;
                std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
            }
        }
        let mut w = zip.finish().map_err(|e| e.to_string())?;
        w.flush().map_err(|e| e.to_string())?;
        Ok(out.to_path_buf())
    }
}

/// The body of a jam's capture thread: cut a segment a little before the tap
/// fills (at the rate it was armed at), write it, re-arm, until `stop`.
fn free_run(
    me: &Capture,
    tap: &SharedTakeAudioTap,
    input_rate: Option<u32>,
    stop: &AtomicBool,
    extra: &Mutex<Option<Value>>,
    context: &Value,
    run_id: &str,
) {
    let mut segment = 0u32;
    let mut since = Instant::now();
    loop {
        std::thread::sleep(Duration::from_millis(200));
        let stopping = stop.load(Ordering::Acquire);
        let cut_at = TakeAudioTap::max_secs(tap.rate()) - FREE_MARGIN_SECS;
        let full = since.elapsed().as_secs_f64() >= cut_at.max(5.0);
        if !stopping && !full {
            continue;
        }
        let audio = tap.capture();
        // the session reached its cap: no point holding a buffer for it
        let capped = me.status().stopped || !me.enabled();
        if !stopping && !capped {
            // the next segment: a few milliseconds of audio fall between the
            // two while the buffer is made
            tap.arm(input_rate);
            since = Instant::now();
        }
        if let Some(a) = audio {
            let mut ctx = context.clone();
            if !ctx.is_object() {
                ctx = json!({});
            }
            let kind = ctx.get("kind").and_then(|k| k.as_str()).unwrap_or("freeplay").to_string();
            let mut job = json!({
                "audio": "",
                "bpm": ctx.get("bpm").cloned().unwrap_or(Value::Null),
                "capture": {
                    "kind": kind,
                    "mode": "ungraded",
                    "context": ctx,
                    "segment": segment,
                    "last": stopping,
                    "runId": run_id,
                    "detectionDelayMs": a.detection_delay_ns as f64 / 1e6,
                },
            });
            if stopping {
                if let Some(x) = extra.lock().unwrap_or_else(|e| e.into_inner()).take() {
                    job["heard"] = x;
                }
            }
            me.write_take(&a.samples, a.rate, a.first_ns, job);
            segment += 1;
        }
        if stopping || capped {
            return;
        }
    }
}

/// Play the sync chirp out of the engine's stream and note when it went out.
/// Blocks for about a second: call it on a thread that may (a command's
/// blocking pool, never an audio thread). `kind` is "start" or "end";
/// `output_latency` is the engine's published latency
/// (`MetronomeEngine::output_latency_handle`). The record written to
/// `session.json`.
///
/// The clip goes into the coach's speech slot. The start is the audio
/// thread's stamp for exactly this clip's slot generation, so a line of the
/// coach handed over meanwhile can neither be mistaken for it nor be cut by
/// it: the slot is emptied afterwards only if it still holds the chirp.
pub fn play_chirp(slots: &crate::engine::SpeechSlots, output_latency: &AtomicU64, kind: &str) -> Value {
    let me = global();
    let seconds = 2.0 * CHIRP_SWEEP_S + CHIRP_GAP_S;
    let base = json!({"kind": kind, "wallMs": wall_ms(), "f0": CHIRP_F0, "f1": CHIRP_F1,
        "seconds": seconds, "amp": CHIRP_AMP,
        "shape": format!("log-sweep x2, {CHIRP_GAP_S} s gap")});
    let record = (|| -> Result<Value, String> {
        let out = slots.wait_for_stream().ok_or("no output stream to play the chirp from")?;
        let handoff = out.handoff.clone();
        // A line of the coach in flight: wait for it, up to 5 s, rather than cut it.
        let deadline = Instant::now() + Duration::from_secs(5);
        while handoff.in_flight() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(20));
        }
        if handoff.in_flight() {
            return Err("the coach is speaking".into());
        }
        let pcm = chirp_pcm(out.sample_rate);
        let samples = pcm.len();
        if let Some(dir) = me.dir() {
            let path = dir.join("chirp.wav");
            if !path.exists() {
                let spec = hound::WavSpec { channels: 1, sample_rate: out.sample_rate, bits_per_sample: 32, sample_format: hound::SampleFormat::Float };
                if let Ok(mut w) = hound::WavWriter::create(&path, spec) {
                    for s in &pcm {
                        let _ = w.write_sample(*s);
                    }
                    let _ = w.finalize();
                }
            }
        }
        let gen = handoff
            .set_clip_gen(Some(crate::speech_out::SpeechClip { pcm: Arc::new(pcm) }))
            .ok_or("the speech slot is unusable")?;
        // picked up within a buffer or two
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut started = None;
        while started.is_none() && Instant::now() < deadline && handoff.generation() == gen {
            std::thread::sleep(Duration::from_millis(5));
            started = handoff.started_ns_of(gen);
        }
        let Some(started) = started else {
            handoff.clear_if_generation(gen);
            return Err("the engine did not play the chirp".into());
        };
        // then the chirp's own length, and a margin
        let until = Instant::now() + Duration::from_secs_f64(seconds + 0.25);
        while Instant::now() < until && handoff.generation() == gen {
            std::thread::sleep(Duration::from_millis(10));
        }
        let cut = handoff.generation() != gen;
        handoff.clear_if_generation(gen);
        let mut r = base.clone();
        r["played"] = json!(true);
        r["cut"] = json!(cut);
        r["playNs"] = json!(started);
        r["wallMs"] = json!(wall_ms_of(started));
        r["rate"] = json!(out.sample_rate);
        r["samples"] = json!(samples);
        r["outputLatencyUs"] = json!(output_latency.load(Ordering::Relaxed));
        Ok(r)
    })();
    let record = record.unwrap_or_else(|e| {
        let mut r = base.clone();
        r["played"] = json!(false);
        r["error"] = json!(e);
        r
    });
    me.add_chirp(record.clone());
    record
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yames-capture-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn the_chirp_is_two_sweeps_with_a_gap_and_stays_under_its_level() {
        let pcm = chirp_pcm(48_000);
        assert_eq!(pcm.len(), 7200 + 7200 + 7200);
        assert!(pcm.iter().all(|v| v.abs() <= CHIRP_AMP + 1e-6));
        assert!(pcm[7200..14400].iter().all(|v| *v == 0.0), "the gap is silent");
        assert!(pcm[..7200].iter().map(|v| v.abs()).fold(0.0, f32::max) > 0.3);
        assert_eq!(pcm[0], 0.0, "faded in");
    }

    #[test]
    fn folder_names_sort_and_read_as_utc() {
        assert_eq!(stamp_utc(0.0), "19700101-000000");
        assert_eq!(stamp_utc(951_782_400_000.0), "20000229-000000", "a leap day");
        // 2026-11-20 11:30:05 UTC
        assert_eq!(stamp_utc(1_795_174_205_000.0), "20261120-113005");
    }

    #[test]
    fn a_session_keeps_every_take_with_its_context_and_stops_at_the_cap() {
        let root = scratch("session");
        let c = Capture::default();
        assert!(c.write_take(&[0.1; 480], 48_000, 1, json!({})).is_none(), "nothing before a session");
        let dir = c.start(&root, json!({"inputRate": 48000, "device": {"input": "DI"}}), Some(1)).unwrap();
        assert!(c.enabled());
        let doc: Value = serde_json::from_slice(&std::fs::read(dir.join("session.json")).unwrap()).unwrap();
        assert_eq!(doc["format"], FORMAT);
        assert_eq!(doc["device"]["input"], "DI");
        assert_eq!(doc["capBytes"], MIN_CAP_BYTES, "a tiny cap is raised to the floor");
        // more than 20, unlike the troubleshooting copy
        for i in 0..25 {
            let job = json!({"bpm": 100 + i, "capture": {"kind": "take", "mode": "graded"}});
            assert!(c.write_take(&[0.25; 480], 48_000, 1_000 + i as u64, job).is_some());
        }
        let wavs = std::fs::read_dir(&dir).unwrap().filter(|e| e.as_ref().unwrap().file_name().to_string_lossy().ends_with(".wav")).count();
        assert_eq!(wavs, 25);
        let st = c.status();
        assert_eq!(st.takes, 25);
        assert!(st.bytes > 25 * 480 * 4);
        let job_name = std::fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).find(|n| n.ends_with(".job.json")).unwrap();
        let job: Value = serde_json::from_slice(&std::fs::read(dir.join(job_name)).unwrap()).unwrap();
        assert_eq!(job["capture"]["mode"], "graded");
        assert_eq!(job["capture"]["rate"], 48_000);
        assert_eq!(job["capture"]["samples"], 480);
        assert!(job["capture"]["audioStartNs"].as_u64().is_some());
        // the cap: a Take that would pass it is not written, and none after it
        let huge = vec![0.0f32; (MIN_CAP_BYTES / 4) as usize];
        assert!(c.write_take(&huge, 48_000, 5, json!({})).is_none());
        assert!(c.status().stopped);
        assert!(c.write_take(&[0.1; 480], 48_000, 6, json!({})).is_none());
        let ended = c.end().unwrap();
        assert_eq!(ended, dir);
        assert!(!c.enabled());
        let doc: Value = serde_json::from_slice(&std::fs::read(dir.join("session.json")).unwrap()).unwrap();
        assert!(doc["endedWallMs"].as_f64().is_some());
        assert_eq!(doc["stoppedAtCap"], true);
        assert_eq!(doc["takes"], 25);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_mark_lands_in_the_take_it_was_pressed_in() {
        let root = scratch("mark");
        let c = Capture::default();
        assert!(c.mark().is_err(), "no session, no mark");
        let dir = c.start(&root, json!({}), None).unwrap();
        let before = crate::clock::now_ns();
        let m = c.mark().unwrap();
        let ns = m["ns"].as_u64().unwrap();
        assert!(ns >= before);
        // a Take whose span covers the mark carries it
        let stem = c.write_take(&vec![0.0; 48_000], 48_000, ns - 1000, json!({})).unwrap();
        let job: Value = serde_json::from_slice(&std::fs::read(dir.join(format!("{stem}.job.json"))).unwrap()).unwrap();
        assert_eq!(job["capture"]["marks"], json!([ns]));
        // one well after it does not
        let stem = c.write_take(&vec![0.0; 480], 48_000, ns + 10_000_000_000, json!({})).unwrap();
        let job: Value = serde_json::from_slice(&std::fs::read(dir.join(format!("{stem}.job.json"))).unwrap()).unwrap();
        assert_eq!(job["capture"]["marks"], json!([]));
        c.end();
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_session_zips_with_its_folder_name_at_the_root() {
        let root = scratch("zip");
        let c = Capture::default();
        let dir = c.start(&root, json!({}), None).unwrap();
        c.write_take(&[0.5; 480], 48_000, 1, json!({})).unwrap();
        std::fs::create_dir_all(dir.join("second")).unwrap();
        std::fs::write(dir.join("second").join("phone.wav"), b"RIFF").unwrap();
        c.end();
        let out = root.join("s.zip");
        Capture::zip_session(&dir, &out).unwrap();
        let mut z = zip::ZipArchive::new(std::fs::File::open(&out).unwrap()).unwrap();
        let id = dir.file_name().unwrap().to_string_lossy().into_owned();
        let names: Vec<String> = (0..z.len()).map(|i| z.by_index(i).unwrap().name().to_string()).collect();
        assert!(names.contains(&format!("{id}/session.json")), "{names:?}");
        assert!(names.contains(&format!("{id}/second/phone.wav")), "{names:?}");
        assert_eq!(names.iter().filter(|n| n.ends_with(".wav")).count(), 2);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_chirps_start_is_its_own_and_a_later_line_is_never_cut() {
        use crate::speech_out::{SpeechClip, SpeechHandoff};
        let h = SpeechHandoff::new();
        let gen = h.set_clip_gen(Some(SpeechClip { pcm: Arc::new(vec![0.1; 10]) })).unwrap();
        assert_eq!(h.started_ns_of(gen), None, "not picked up yet");
        h.note_started(42, gen);
        assert_eq!(h.started_ns_of(gen), Some(42));
        // the coach hands a line over: the chirp's stamp is not the line's
        let line = h.set_clip_gen(Some(SpeechClip { pcm: Arc::new(vec![0.2; 10]) })).unwrap();
        assert_ne!(line, gen);
        h.note_started(99, line);
        assert_eq!(h.started_ns_of(gen), None);
        // and clearing the chirp's slot leaves the line where it is
        h.clear_if_generation(gen);
        assert!(h.in_flight(), "the coach's line was cut");
        h.clear_if_generation(line);
        assert!(!h.in_flight());
    }

    #[test]
    fn a_jam_begun_and_ended_at_once_leaves_the_tap_free() {
        let root = scratch("free");
        // not the app's global: other tests must not see a session on
        let c: &'static Capture = Box::leak(Box::default());
        c.start(&root, json!({}), None).unwrap();
        c.free_begin(json!({"kind": "jam", "bpm": 90}), Some(48_000)).unwrap();
        assert!(c.free_tap().is_armed());
        // a second begin finishes the first (joined) before arming again
        c.free_begin(json!({"kind": "jam", "bpm": 91}), Some(48_000)).unwrap();
        c.free_end(Some(json!({"key": "A minor"})));
        assert!(!c.free_tap().is_armed(), "the run's thread disarmed the tap before free_end returned");
        // nothing was heard (no detector fed the tap), so nothing was written
        let dir = c.end().unwrap();
        let wavs = std::fs::read_dir(&dir).unwrap().filter(|e| e.as_ref().unwrap().file_name().to_string_lossy().ends_with(".wav")).count();
        assert_eq!(wavs, 0);
        let _ = std::fs::remove_dir_all(&root);
    }
}
