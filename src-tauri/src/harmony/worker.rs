//! The free-play worker: one thread, below normal priority, that reads the
//! input ring a tenth of a second at a time, runs the note model over it
//! (`stream.rs`) and keeps an [`Engine`] up to date.
//!
//! It exists only while the player has the setting on and a jam is being
//! listened to. It is not on any real-time path: the ring's lock is held for
//! one `memcpy` of 100 ms of samples into a buffer that is already big enough
//! (the onset thread does the same every 5 ms), the model runs on this
//! thread, and nothing waits for it.
//!
//! **It gives way to a Take.** The app's one note model is shared with the
//! Take's late grade (`model::with_shared`), and a mutex is not a queue with
//! priorities, so the worker asks first ([`paused`]): while a Take's schedule
//! is loaded in the timing analyzer, or the post-Take pass is running or
//! waiting for the model ([`verifier_hold`]), it runs no window and does not
//! touch the ring. The verifier can therefore wait for at most the one window
//! that was already running when it asked. When the pause ends the worker
//! starts again from nothing (a new stream, a new engine): what it heard
//! before a Take is not evidence about what is played after it.
//!
//! **It gives up rather than fall behind.** A device whose model is slower
//! than the music (a poll finds [`BACKLOG_S`] seconds waiting) ends the worker
//! and says so once: `on_reading(None)`, and the page shows nothing.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use super::stream::Stream;
use super::{BeatOut, Chart, ChordReading, Engine, Quality, Reading};
use crate::audio_input::RingBuffer;

const POLL: Duration = Duration::from_millis(100);
/// Seconds of input one poll may find waiting. A poll that finds this much
/// took that long over the windows before it: the worker has been lapped.
const BACKLOG_S: usize = 3;
/// Chords named in a [`Summary`].
const SUMMARY_CHORDS: usize = 4;

/// A count of reasons to keep quiet. `hold` is a guard: the reason lasts as
/// long as the guard does.
pub struct Gate(AtomicUsize);

pub struct Hold<'a>(&'a Gate);

impl Gate {
    pub const fn new() -> Self {
        Self(AtomicUsize::new(0))
    }
    pub fn hold(&self) -> Hold<'_> {
        self.0.fetch_add(1, Ordering::SeqCst);
        Hold(self)
    }
    pub fn held(&self) -> bool {
        self.0.load(Ordering::SeqCst) > 0
    }
}

impl Default for Gate {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for Hold<'_> {
    fn drop(&mut self) {
        self.0 .0.fetch_sub(1, Ordering::SeqCst);
    }
}

static VERIFIER: Gate = Gate::new();
static TAKE_LOADED: AtomicBool = AtomicBool::new(false);

/// Held by the post-Take pass from before it asks for the note model until
/// it is done with it (`timing::start_notes_pass`).
pub fn verifier_hold() -> Hold<'static> {
    VERIFIER.hold()
}

/// The timing analyzer says a Take's schedule was loaded, or cleared.
pub fn set_take_loaded(loaded: bool) {
    TAKE_LOADED.store(loaded, Ordering::SeqCst);
}

/// Whether the app's worker must keep off the model and the ring right now:
/// the post-Take pass has or wants the model, or a Take's schedule is loaded.
/// (A screen that left its schedule loaded keeps the reading off until
/// another clears it: quiet is the safe side of that mistake.)
pub fn paused() -> bool {
    VERIFIER.held() || TAKE_LOADED.load(Ordering::SeqCst)
}

/// What the worker is given to run a window with, and to ask whether it may.
/// The app's are [`Hooks::app`]; tests bring a model of their own.
pub struct Hooks {
    /// Run the next window. `None`: there is no model.
    pub step: Box<dyn FnMut(&mut Stream, &mut Engine) -> Option<Result<bool, String>> + Send>,
    pub paused: Box<dyn Fn() -> bool + Send>,
}

impl Hooks {
    pub fn app() -> Self {
        Self {
            step: Box::new(|stream, engine| crate::detect::model::with_shared(|m| m.map(|m| stream.step(m.as_mut(), engine)))),
            paused: Box::new(paused),
        }
    }
}

/// The chord a page may show: the engine's chord per beat, held until the
/// beats agree on another.
///
/// A beat's chord is right 84% of the time when the player strums and 30%
/// when they play a line (`PROGRESS.md`, M7), and the wrong ones in a line
/// come one beat at a time. So a chord is shown once two beats running named
/// it, stays while single beats disagree or say nothing, and goes when two
/// beats running had no chord. A chart's chord is the chart's: shown at once.
#[derive(Default)]
struct Shown {
    shown: Option<ChordReading>,
    last: Option<ChordReading>,
    quiet: u32,
}

impl Shown {
    fn same(a: &ChordReading, b: &ChordReading) -> bool {
        a.root == b.root && a.quality.map(Quality::is_minor) == b.quality.map(Quality::is_minor) && a.from_chart == b.from_chart
    }

    fn beat(&mut self, chord: Option<&ChordReading>) {
        match chord {
            None => {
                self.quiet += 1;
                self.last = None;
                if self.quiet >= 2 {
                    self.shown = None;
                }
            }
            Some(c) => {
                self.quiet = 0;
                if c.from_chart || self.last.as_ref().is_some_and(|l| Self::same(l, c)) {
                    self.shown = Some(c.clone());
                }
                self.last = Some(c.clone());
            }
        }
    }
}

/// One chord of a [`Summary`].
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChordHeard {
    pub root: u8,
    pub quality: Option<Quality>,
    /// Beats it was the shown chord.
    pub beats: u32,
}

/// What the page is sent while the worker listens.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Live {
    #[serde(flatten)]
    pub reading: Reading,
    /// The chord to show, or none ("couldn't tell"). `reading.chord` is the
    /// engine's newest beat, for tools.
    pub shown_chord: Option<ChordReading>,
}

/// What a stretch of free play came to, for the recap's one line.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub reading: Reading,
    /// The chords heard (never a chart's), most beats first, at most
    /// [`SUMMARY_CHORDS`]; a chord shown for under a tenth of the beats that
    /// had one is left out.
    pub chords: Vec<ChordHeard>,
    /// Beats that had a shown chord, and beats in all.
    pub chord_beats: u32,
    pub beats: u32,
}

/// Beats per shown chord, as they close.
#[derive(Default)]
struct Heard {
    shown: Shown,
    counts: Vec<ChordHeard>,
    chord_beats: u32,
    beats: u32,
}

impl Heard {
    fn beat(&mut self, b: &BeatOut) {
        self.shown.beat(b.chord.as_ref());
        self.beats += 1;
        let Some(c) = self.shown.shown.as_ref().filter(|c| !c.from_chart) else { return };
        self.chord_beats += 1;
        match self.counts.iter_mut().find(|h| h.root == c.root && h.quality == c.quality) {
            Some(h) => h.beats += 1,
            None => self.counts.push(ChordHeard { root: c.root, quality: c.quality, beats: 1 }),
        }
    }

    fn summary(&self, reading: Reading) -> Summary {
        let mut chords: Vec<ChordHeard> = self.counts.iter().filter(|h| h.beats * 10 >= self.chord_beats.max(1) && h.beats >= 2).cloned().collect();
        chords.sort_by(|a, b| b.beats.cmp(&a.beats).then(a.root.cmp(&b.root)));
        chords.truncate(SUMMARY_CHORDS);
        Summary { reading, chords, chord_beats: self.chord_beats, beats: self.beats }
    }
}

#[derive(Default)]
struct Shared {
    /// Bar lines not yet given to the engine: `clock::now_ns`, bar, beat seconds.
    marks: Vec<(u64, u32, f64)>,
    summary: Option<Summary>,
}

pub struct Worker {
    alive: Arc<AtomicBool>,
    shared: Arc<Mutex<Shared>>,
    handle: Option<JoinHandle<()>>,
}

/// The app's one worker, or none.
pub type SharedHarmony = Mutex<Option<Worker>>;

impl Worker {
    /// Start listening on `ring` (at `rate`) with the app's model and the
    /// app's pauses. `on_reading` is called on the worker's thread whenever
    /// what a page would show changed, and with `None` once if the worker
    /// ends by itself (no model, a model too slow, a failure).
    pub fn start(ring: Arc<Mutex<RingBuffer>>, rate: u32, chart: Option<Chart>, beat_s: f64, on_reading: impl Fn(Option<&Live>) + Send + 'static) -> Result<Self, String> {
        Self::start_with(ring, rate, chart, beat_s, Hooks::app(), on_reading)
    }

    pub fn start_with(ring: Arc<Mutex<RingBuffer>>, rate: u32, chart: Option<Chart>, beat_s: f64, mut hooks: Hooks, on_reading: impl Fn(Option<&Live>) + Send + 'static) -> Result<Self, String> {
        let alive = Arc::new(AtomicBool::new(true));
        let shared = Arc::new(Mutex::new(Shared::default()));
        let (alive_t, shared_t) = (alive.clone(), shared.clone());
        let handle = thread::Builder::new()
            .name("yames-harmony".into())
            .spawn(move || {
                crate::coach::lower_current_thread_priority();
                // A panic in the model retires it (`with_shared`) and ends
                // this thread; the jam goes on without a reading.
                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    run(&alive_t, &shared_t, &ring, rate, chart, beat_s, &mut hooks, &on_reading);
                }));
                // stopped by its owner, or ended by itself: then say so
                if alive_t.swap(false, Ordering::SeqCst) {
                    on_reading(None);
                }
            })
            .map_err(|e| format!("could not start the harmony worker: {e}"))?;
        Ok(Self { alive, shared, handle: Some(handle) })
    }

    /// Bar `bar` of the form starts now.
    pub fn mark_bar(&self, bar: u32, beat_s: f64) {
        if let Ok(mut s) = self.shared.lock() {
            if s.marks.len() < 256 {
                s.marks.push((crate::clock::now_ns(), bar, beat_s));
            }
        }
    }

    /// Whether the thread is still listening (it may have ended by itself).
    pub fn is_alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }

    /// Stop, and hand back what it heard. Waits for the window that is
    /// running, if one is: never call it from a real-time thread.
    pub fn stop(mut self) -> Option<Summary> {
        self.alive.store(false, Ordering::SeqCst);
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
        self.shared.lock().ok().and_then(|s| s.summary.clone())
    }
}

impl Drop for Worker {
    fn drop(&mut self) {
        self.alive.store(false, Ordering::SeqCst);
    }
}

/// One stretch of listening: from the first poll, or from the end of a pause.
struct Listening {
    engine: Engine,
    stream: Stream,
    heard: Heard,
    cursor: Option<usize>,
    t0_ns: u64,
}

impl Listening {
    fn new(rate: u32, chart: Option<Chart>, beat_s: f64) -> Self {
        let mut engine = Engine::new(chart);
        engine.set_beat_seconds(beat_s);
        Self { engine, stream: Stream::new(rate), heard: Heard::default(), cursor: None, t0_ns: 0 }
    }

    fn live(&self) -> Live {
        Live { reading: self.engine.reading(), shown_chord: self.heard.shown.shown.clone() }
    }
}

#[allow(clippy::too_many_arguments)]
fn run(alive: &AtomicBool, shared: &Mutex<Shared>, ring: &Mutex<RingBuffer>, rate: u32, chart: Option<Chart>, beat_s: f64, hooks: &mut Hooks, on_reading: &dyn Fn(Option<&Live>)) {
    let backlog = rate as usize * BACKLOG_S;
    let mut l = Listening::new(rate, chart.clone(), beat_s);
    // big enough for the most `read_since` hands over: no growing it while
    // the ring is locked
    let mut fresh: Vec<f32> = Vec::with_capacity(backlog);
    let mut last: Option<Live> = None;
    let mut was_paused = false;
    let publish = |l: &Listening, last: &mut Option<Live>| {
        let live = l.live();
        if let Ok(mut s) = shared.lock() {
            s.summary = Some(l.heard.summary(live.reading.clone()));
        }
        // `heard_s` moves on every window, and the tally on every note: not
        // changes a page shows
        let shows = |v: &Live| (v.reading.key_state, v.reading.key, v.shown_chord.clone());
        if last.as_ref().map(shows) != Some(shows(&live)) {
            on_reading(Some(&live));
            *last = Some(live);
        }
    };
    publish(&l, &mut last);
    while alive.load(Ordering::SeqCst) {
        thread::sleep(POLL);
        if (hooks.paused)() {
            was_paused = true;
            continue;
        }
        if was_paused {
            was_paused = false;
            l = Listening::new(rate, chart.clone(), beat_s);
            if let Ok(mut s) = shared.lock() {
                s.marks.clear();
            }
            publish(&l, &mut last);
        }
        {
            let Ok(r) = ring.lock() else { return };
            let c = l.cursor.get_or_insert_with(|| {
                l.t0_ns = crate::clock::now_ns();
                r.write_pos()
            });
            r.read_since(c, &mut fresh, backlog);
        }
        if fresh.len() >= backlog {
            eprintln!("[yames] the free-play reading stopped: the note model is slower than the music on this device");
            return;
        }
        l.stream.push(&fresh);
        fresh.clear();
        if let Ok(mut s) = shared.lock() {
            for (ns, bar, beat) in s.marks.drain(..) {
                l.engine.mark_bar(ns.saturating_sub(l.t0_ns) as f64 / 1e9, bar, beat);
            }
        }
        // One window at a time, asking before each: a verifier that wants
        // the model waits for no more than the window already running.
        while l.stream.ready() && alive.load(Ordering::SeqCst) && !(hooks.paused)() {
            match (hooks.step)(&mut l.stream, &mut l.engine) {
                Some(Ok(true)) => {}
                Some(Ok(false)) => break,
                // no model in this build, or it failed: nothing to read notes with
                Some(Err(_)) | None => return,
            }
            for b in l.engine.take_beats() {
                l.heard.beat(&b);
            }
            // the verdicts are for tools; here they would only pile up
            l.engine.take_verdicts();
            publish(&l, &mut last);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::detect::model::{NoteModel, WindowOut, FRAME_HOP, PITCHES, WINDOW_FRAMES, WINDOW_SAMPLES};
    use std::sync::atomic::AtomicU32;
    use std::time::Instant;

    const RATE: u32 = 22_050;

    /// A model that hears a C major chord wherever the window is loud, and
    /// counts the windows it was given. `slow` is how long a window takes.
    struct Triad {
        windows: Arc<AtomicU32>,
        slow: Duration,
    }

    impl NoteModel for Triad {
        fn infer(&mut self, window: &[f32]) -> Result<WindowOut, String> {
            self.windows.fetch_add(1, Ordering::SeqCst);
            thread::sleep(self.slow);
            let mut note = vec![0.0; WINDOW_FRAMES * PITCHES];
            let mut onset = vec![0.0; WINDOW_FRAMES * PITCHES];
            let loud = |f: usize| window[(f * FRAME_HOP).min(WINDOW_SAMPLES - 1)..((f + 1) * FRAME_HOP).min(WINDOW_SAMPLES)].iter().any(|v| v.abs() > 0.5);
            for f in 0..WINDOW_FRAMES {
                if loud(f) {
                    for midi in [48usize, 52, 55, 60] {
                        note[f * PITCHES + midi - 21] = 0.9;
                        if f > 0 && !loud(f - 1) {
                            onset[f * PITCHES + midi - 21] = 0.9;
                        }
                    }
                }
            }
            Ok(WindowOut { note, onset })
        }
        fn runtime(&self) -> &'static str {
            "test"
        }
    }

    fn ring() -> Arc<Mutex<RingBuffer>> {
        Arc::new(Mutex::new(RingBuffer::new(RATE as usize * 4)))
    }

    /// Strums every half second: a tone for 0.4 s, quiet for 0.1 s.
    fn strums(from: usize, n: usize) -> Vec<f32> {
        (from..from + n).map(|i| if (i % (RATE as usize / 2)) < RATE as usize * 2 / 5 { 0.9 * (i as f32 * 2.0 * std::f32::consts::PI * 440.0 / RATE as f32).sin() } else { 0.0 }).collect()
    }

    /// What an input callback does: every 5 ms, `try_lock` and write what is
    /// due, or drop it. Returns (writes, buffers turned away).
    fn callback(ring: Arc<Mutex<RingBuffer>>, stop: Arc<AtomicBool>) -> JoinHandle<(u32, u32)> {
        thread::spawn(move || {
            let (start, mut written, mut writes, mut turned_away) = (Instant::now(), 0usize, 0u32, 0u32);
            while !stop.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(5));
                let due = (start.elapsed().as_secs_f64() * RATE as f64) as usize;
                let block = strums(written, due - written);
                writes += 1;
                match ring.try_lock() {
                    Ok(mut r) => r.write(&block),
                    Err(_) => turned_away += 1,
                }
                written = due;
            }
            (writes, turned_away)
        })
    }

    fn hooks(model: Arc<Mutex<Triad>>, gate: Arc<Gate>) -> Hooks {
        Hooks {
            step: Box::new(move |stream, engine| Some(stream.step(&mut *model.lock().unwrap(), engine))),
            paused: Box::new(move || gate.held()),
        }
    }

    fn wait_until(what: &str, limit: Duration, mut done: impl FnMut() -> bool) {
        let start = Instant::now();
        while !done() {
            assert!(start.elapsed() < limit, "waited {limit:?} for {what}");
            thread::sleep(Duration::from_millis(10));
        }
    }

    #[test]
    fn it_reads_the_ring_reports_and_does_not_turn_the_callback_away() {
        let (ring, windows) = (ring(), Arc::new(AtomicU32::new(0)));
        let model = Arc::new(Mutex::new(Triad { windows: windows.clone(), slow: Duration::from_millis(5) }));
        let seen: Arc<Mutex<Vec<Option<Live>>>> = Arc::default();
        let seen_t = seen.clone();
        let worker = Worker::start_with(ring.clone(), RATE, None, 0.5, hooks(model, Arc::default()), move |l| seen_t.lock().unwrap().push(l.cloned())).unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let cb = callback(ring, stop.clone());
        wait_until("six windows", Duration::from_secs(20), || windows.load(Ordering::SeqCst) >= 6);
        stop.store(true, Ordering::SeqCst);
        let (writes, turned_away) = cb.join().unwrap();
        assert!(worker.is_alive());
        let summary = worker.stop().expect("a summary");
        assert!(summary.reading.heard_s > 1.5, "{summary:?}");
        assert!(summary.beats >= 2, "{summary:?}");
        // the first report is "listening"; none is the worker giving up
        let seen = seen.lock().unwrap();
        assert!(matches!(seen.first(), Some(Some(l)) if l.reading.key_state == crate::harmony::KeyState::Listening), "{seen:?}");
        assert!(seen.iter().all(Option::is_some));
        // the worker's lock is one copy every 100 ms: the callback's
        // `try_lock` all but never meets it
        assert!(turned_away * 50 <= writes, "{turned_away} of {writes} buffers turned away");
    }

    #[test]
    fn a_strummed_chord_is_shown_and_counted_in_the_summary() {
        let (ring, windows) = (ring(), Arc::new(AtomicU32::new(0)));
        let model = Arc::new(Mutex::new(Triad { windows: windows.clone(), slow: Duration::ZERO }));
        let shown: Arc<Mutex<Vec<Option<u8>>>> = Arc::default();
        let shown_t = shown.clone();
        let worker = Worker::start_with(ring.clone(), RATE, None, 0.5, hooks(model, Arc::default()), move |l| shown_t.lock().unwrap().push(l.and_then(|l| l.shown_chord.as_ref().map(|c| c.root)))).unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let cb = callback(ring, stop.clone());
        wait_until("a chord shown", Duration::from_secs(30), || shown.lock().unwrap().iter().any(|c| *c == Some(0)));
        // and a few more beats of it: one beat of a chord is not in a summary
        let then = windows.load(Ordering::SeqCst);
        wait_until("four more windows", Duration::from_secs(30), || windows.load(Ordering::SeqCst) >= then + 4);
        stop.store(true, Ordering::SeqCst);
        cb.join().unwrap();
        let summary = worker.stop().expect("a summary");
        assert!(shown.lock().unwrap().iter().all(|c| c.is_none() || *c == Some(0)), "only C was played: {shown:?}");
        assert!(summary.chords.len() == 1 && summary.chords[0].root == 0 && summary.chord_beats >= 1, "{summary:?}");
    }

    #[test]
    fn while_paused_no_window_runs_and_it_starts_again_from_nothing() {
        let (ring, windows, gate) = (ring(), Arc::new(AtomicU32::new(0)), Arc::new(Gate::new()));
        let model = Arc::new(Mutex::new(Triad { windows: windows.clone(), slow: Duration::ZERO }));
        let hold = gate.hold();
        let worker = Worker::start_with(ring.clone(), RATE, None, 0.5, hooks(model, gate.clone()), |_| {}).unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let cb = callback(ring, stop.clone());
        thread::sleep(Duration::from_millis(2500));
        assert_eq!(windows.load(Ordering::SeqCst), 0, "a window ran while a Take had the model");
        let resumed = Instant::now();
        drop(hold);
        wait_until("a window after the pause", Duration::from_secs(20), || windows.load(Ordering::SeqCst) >= 1);
        // from nothing: the 2.5 s that went by during the pause were not read
        // (a window needs about a second of input after the pause ended)
        assert!(resumed.elapsed() > Duration::from_millis(600), "{:?}", resumed.elapsed());
        stop.store(true, Ordering::SeqCst);
        cb.join().unwrap();
        let summary = worker.stop().expect("a summary");
        assert!(summary.reading.heard_s < resumed.elapsed().as_secs_f64() + 0.2, "{summary:?}");
    }

    #[test]
    fn a_verifier_that_asks_for_the_model_waits_for_one_window_at_most() {
        let (ring, windows, gate) = (ring(), Arc::new(AtomicU32::new(0)), Arc::new(Gate::new()));
        let model = Arc::new(Mutex::new(Triad { windows: windows.clone(), slow: Duration::from_millis(60) }));
        let worker = Worker::start_with(ring.clone(), RATE, None, 0.5, hooks(model.clone(), gate.clone()), |_| {}).unwrap();
        // let it take its first look at the ring, then hand it 2.8 s at once:
        // five windows to run back to back, 60 ms each
        thread::sleep(Duration::from_millis(400));
        ring.lock().unwrap().write(&strums(0, RATE as usize * 28 / 10));
        wait_until("the first window", Duration::from_secs(20), || windows.load(Ordering::SeqCst) >= 1);
        // the verifier: say so, then take the model
        let hold = gate.hold();
        let asked_at = windows.load(Ordering::SeqCst);
        {
            let _model = model.lock().unwrap();
            assert!(windows.load(Ordering::SeqCst) <= asked_at + 1, "more than the window already running went ahead of the verifier");
            thread::sleep(Duration::from_millis(150));
        }
        // and between two uses of the model in one pass
        thread::sleep(Duration::from_millis(300));
        let during = windows.load(Ordering::SeqCst);
        assert!(during <= asked_at + 1, "{during} windows, {asked_at} when the verifier asked");
        drop(hold);
        // paused, so it starts again from nothing: fresh input, a new window
        ring.lock().unwrap().write(&strums(0, RATE as usize / 10));
        thread::sleep(Duration::from_millis(400));
        ring.lock().unwrap().write(&strums(0, RATE as usize * 2));
        wait_until("a window after the verifier", Duration::from_secs(20), || windows.load(Ordering::SeqCst) > during);
        worker.stop();
    }

    #[test]
    fn with_no_model_it_says_so_once_and_ends() {
        let ring = ring();
        let ended = Arc::new(AtomicU32::new(0));
        let ended_t = ended.clone();
        let hooks = Hooks { step: Box::new(|_, _| None), paused: Box::new(|| false) };
        let worker = Worker::start_with(ring.clone(), RATE, None, 0.5, hooks, move |l| {
            if l.is_none() {
                ended_t.fetch_add(1, Ordering::SeqCst);
            }
        })
        .unwrap();
        thread::sleep(Duration::from_millis(400));
        ring.lock().unwrap().write(&strums(0, RATE as usize * 2));
        wait_until("the worker to end", Duration::from_secs(20), || !worker.is_alive());
        worker.stop();
        assert_eq!(ended.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn lapped_by_the_input_it_gives_up() {
        let (ring, windows) = (ring(), Arc::new(AtomicU32::new(0)));
        let model = Arc::new(Mutex::new(Triad { windows, slow: Duration::ZERO }));
        let ended = Arc::new(AtomicBool::new(false));
        let ended_t = ended.clone();
        let worker = Worker::start_with(ring.clone(), RATE, None, 0.5, hooks(model, Arc::default()), move |l| ended_t.store(l.is_none(), Ordering::SeqCst)).unwrap();
        thread::sleep(Duration::from_millis(400));
        // three and a half seconds between two polls: it was not polling
        ring.lock().unwrap().write(&strums(0, RATE as usize * 7 / 2));
        wait_until("the worker to end", Duration::from_secs(20), || !worker.is_alive());
        assert!(ended.load(Ordering::SeqCst));
        worker.stop();
    }

    fn chord(root: u8) -> ChordReading {
        ChordReading { root, quality: Some(Quality::Maj), label: None, from_chart: false, mask: 0 }
    }

    #[test]
    fn a_chord_is_shown_after_two_beats_and_kept_through_one_stray_beat() {
        let mut s = Shown::default();
        let root = |s: &Shown| s.shown.as_ref().map(|c| c.root);
        s.beat(Some(&chord(0)));
        assert_eq!(root(&s), None, "one beat is not a chord yet");
        s.beat(Some(&chord(0)));
        assert_eq!(root(&s), Some(0));
        s.beat(Some(&chord(7)));
        assert_eq!(root(&s), Some(0), "one beat of another chord");
        s.beat(Some(&chord(7)));
        assert_eq!(root(&s), Some(7));
        s.beat(None);
        assert_eq!(root(&s), Some(7), "one beat it couldn't tell");
        s.beat(None);
        assert_eq!(root(&s), None);
        // a line: single beats, each another chord, never shown
        for r in [0, 5, 9, 2] {
            s.beat(Some(&chord(r)));
            s.beat(None);
            assert_eq!(root(&s), None);
        }
        // a chart's chord is the chart's
        s.beat(Some(&ChordReading { from_chart: true, ..chord(4) }));
        assert_eq!(root(&s), Some(4));
    }

    #[test]
    fn the_summary_names_the_chords_heard_most_and_leaves_out_the_stray_ones() {
        let mut h = Heard::default();
        let mut beat = |c: Option<u8>| h.beat(&BeatOut { t0: 0.0, t1: 0.5, chord: c.map(chord), leading: None, key_state: crate::harmony::KeyState::Listening });
        for (root, beats) in [(0u8, 16), (9, 10), (5, 12), (7, 9), (2, 3), (4, 1)] {
            for _ in 0..beats {
                beat(Some(root));
            }
        }
        beat(None);
        beat(None);
        let s = h.summary(Engine::new(None).reading());
        assert_eq!(s.chords.iter().map(|c| c.root).collect::<Vec<_>>(), vec![0, 5, 9, 7]);
        assert_eq!(s.beats, 53);
        assert!(s.chord_beats >= 46 && s.chord_beats <= 51, "{s:?}");
    }

    #[test]
    fn a_gate_is_held_as_long_as_any_hold_lives() {
        let g = Gate::new();
        assert!(!g.held());
        let (a, b) = (g.hold(), g.hold());
        drop(a);
        assert!(g.held());
        drop(b);
        assert!(!g.held());
    }
}
