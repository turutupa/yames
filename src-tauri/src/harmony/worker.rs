//! The free-play worker: one thread, below normal priority, that reads the
//! input ring a tenth of a second at a time, runs the note model over it
//! (`stream.rs`) and keeps an [`Engine`] up to date.
//!
//! It exists only while the player has the setting on and a jam is being
//! listened to. It is not on any real-time path: the ring's lock is held for
//! one `memcpy` of 100 ms of samples (the onset thread does the same every
//! 5 ms), the model runs on this thread, and nothing waits for it. The app's
//! one note model is shared with the Take's late grade (`model::with_shared`),
//! so the two queue; a jam and a graded Take do not run together.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use super::stream::Stream;
use super::{Chart, Engine, Reading};
use crate::audio_input::RingBuffer;

const POLL: Duration = Duration::from_millis(100);

#[derive(Default)]
struct Shared {
    /// Bar lines not yet given to the engine: `clock::now_ns`, bar, beat seconds.
    marks: Vec<(u64, u32, f64)>,
    reading: Option<Reading>,
}

pub struct Worker {
    alive: Arc<AtomicBool>,
    shared: Arc<Mutex<Shared>>,
    handle: Option<JoinHandle<()>>,
}

/// The app's one worker, or none.
pub type SharedHarmony = Mutex<Option<Worker>>;

impl Worker {
    /// Start listening on `ring` (at `rate`). `on_reading` is called on the
    /// worker's thread whenever the reading changed.
    pub fn start(ring: Arc<Mutex<RingBuffer>>, rate: u32, chart: Option<Chart>, beat_s: f64, on_reading: impl Fn(&Reading) + Send + 'static) -> Result<Self, String> {
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
                    run(&alive_t, &shared_t, &ring, rate, chart, beat_s, &on_reading);
                }));
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

    /// Stop, and hand back the last reading.
    pub fn stop(mut self) -> Option<Reading> {
        self.alive.store(false, Ordering::SeqCst);
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
        self.shared.lock().ok().and_then(|s| s.reading.clone())
    }
}

impl Drop for Worker {
    fn drop(&mut self) {
        self.alive.store(false, Ordering::SeqCst);
    }
}

fn run(alive: &AtomicBool, shared: &Mutex<Shared>, ring: &Mutex<RingBuffer>, rate: u32, chart: Option<Chart>, beat_s: f64, on_reading: &dyn Fn(&Reading)) {
    let mut engine = Engine::new(chart);
    engine.set_beat_seconds(beat_s);
    let mut stream = Stream::new(rate);
    let mut fresh: Vec<f32> = Vec::with_capacity(rate as usize);
    let mut cursor: Option<usize> = None;
    let mut t0_ns = 0u64;
    let mut last: Option<Reading> = None;
    let publish = |engine: &Engine, last: &mut Option<Reading>| {
        let reading = engine.reading();
        // `heard_s` moves on every window: not a change worth an event
        let same = last.as_ref().is_some_and(|l| Reading { heard_s: 0.0, ..l.clone() } == Reading { heard_s: 0.0, ..reading.clone() });
        if let Ok(mut s) = shared.lock() {
            s.reading = Some(reading.clone());
        }
        if !same {
            on_reading(&reading);
            *last = Some(reading);
        }
    };
    publish(&engine, &mut last);
    while alive.load(Ordering::SeqCst) {
        thread::sleep(POLL);
        {
            let Ok(r) = ring.lock() else { return };
            let c = cursor.get_or_insert_with(|| {
                t0_ns = crate::clock::now_ns();
                r.write_pos()
            });
            r.read_since(c, &mut fresh, rate as usize * 3);
        }
        stream.push(&fresh);
        fresh.clear();
        if let Ok(mut s) = shared.lock() {
            for (ns, bar, beat) in s.marks.drain(..) {
                engine.mark_bar(ns.saturating_sub(t0_ns) as f64 / 1e9, bar, beat);
            }
        }
        while stream.ready() && alive.load(Ordering::SeqCst) {
            let stepped = crate::detect::model::with_shared(|m| m.map(|m| stream.step(m.as_mut(), &mut engine)));
            match stepped {
                Some(Ok(true)) => publish(&engine, &mut last),
                Some(Ok(false)) => break,
                // no model in this build, or it failed: nothing to read notes with
                Some(Err(_)) | None => return,
            }
            // the reports are for tools; here they would only pile up
            engine.take_beats();
            engine.take_verdicts();
        }
    }
}
