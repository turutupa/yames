//! Takes — your playing with the band mixed in, kept on this machine.
//!
//! `plans/JAM_MODE.md` §4.4: "Record the take. Opt in, local only, your
//! playing with the band mixed in, listen back, keep the best. Listening back
//! is how improvisers improve."
//!
//! ## The privacy rule, and how this differs from `session_audio.rs`
//!
//! `session_audio.rs` is a diagnostic dump. It is `cfg(debug_assertions)` —
//! a shipped binary physically cannot record with it, there is no runtime
//! override, and that guard is not this module's to touch.
//!
//! A take is the other thing entirely: a FEATURE, present in release builds,
//! that a musician turns on per jam (`Jam.takes` in the contract) and can
//! see, play back and delete. So it is opt-in rather than compiled out, and
//! the rules that make that honest are:
//!
//! * Nothing records until `start_take` is called, and only the UI calls it,
//!   only for a jam whose `takes` flag the user set.
//! * The files are WAVs under the app's own data directory, named after the
//!   jam and the moment. Nothing is uploaded, nothing is analysed, nothing
//!   is deleted by anyone but the user.
//! * `list_takes` shows what is on disk and `delete_take` removes both the
//!   audio and its sidecar. A feature you cannot see the output of is not
//!   opt-in, it is surveillance with a switch.
//!
//! ## Where the audio comes from, and why it is two rings
//!
//! A take is two streams that never meet until the writer thread:
//!
//! * **You** — the mic the onset detector already listens to, captured on the
//!   INPUT thread (`audio_input.rs`), at the input device's rate.
//! * **The band** — the mix the output callback has already rendered, taken
//!   at the point it is written to the device, at the OUTPUT device's rate.
//!
//! Neither thread may allocate, lock or block, so each writes into a
//! preallocated lock-free ring ([`TakeRing`]) that a writer thread drains
//! every few tens of milliseconds, resamples, mixes and writes to disk in
//! chunks. The output callback's ring is handed over through the same
//! generation-counter handoff the jam table uses, and comes back through the
//! same retirement path, for the same reason: the last `Arc` must not be
//! dropped on the audio thread.
//!
//! ## The dry stem, and why a take is two files
//!
//! `plans/SONGS.md` A8: a take is you and the band ALREADY MIXED, and that
//! is the right thing to listen back to and the wrong thing to measure. A
//! pitch tracker handed a mix of a guitar, a bass and a kit is handed a
//! chord it was never built to hear (`pitch.rs`, `plans/SONGS.md` S0.5), so
//! Songs' review needs the player on their own.
//!
//! So the writer keeps a second file beside the mix, `<id>.dry.wav`, holding
//! exactly the mic samples that went into the mix — the same clock, the same
//! round-trip correction, the same length, sample for sample, so a moment in
//! one is the same moment in the other and nothing has to be lined up later.
//! It exists only when there was a mic; a take of the band alone has no dry
//! stem and the record says so.
//!
//! Every rule above applies to it unchanged and that is the point of writing
//! it here rather than anywhere else: same opt-in (there is no second
//! switch — a take is a take), same directory, listed as part of its take
//! rather than as a take of its own, and deleted with it. Nothing uploads
//! it, and nothing analyses it until a player asks for that in the review.
//!
//! ## The band is the clock
//!
//! Two devices, two crystals, no shared clock. Rather than pretend they can
//! be locked together, the writer takes the BAND as the clock: it writes
//! exactly as many samples as the output callback produced, and takes that
//! many resampled mic samples if it has them, silence if it does not. A take
//! is therefore always exactly as long as the band played, a mic that is not
//! running never stalls the file, and the two can drift by a device's clock
//! error over a long take — a few milliseconds over twenty minutes, which is
//! under a hundredth of a beat and nothing anyone can hear.

use std::collections::VecDeque;
use std::fs;
use std::io::{BufWriter, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/// The longest a take may run. `plans/tasks/jam/W14-ENGINE-KEYS-TAKES.md`:
/// twenty minutes, which at 48 kHz 16-bit mono is 115 MB — about as much of
/// a practice session as anyone listens back to, and a bound on what the
/// feature can quietly do to a disk while nobody is watching. The writer
/// stops taking audio there and the take finalises at its cap.
pub const TAKE_MAX_SECS: u64 = 20 * 60;

/// How much audio each ring holds. The writer wakes every
/// [`WRITER_TICK_MS`], so four seconds is two orders of magnitude of slack —
/// enough that a disk stall, a scheduler hiccup or a debugger breakpoint
/// costs nothing, and small enough that the pair is under two megabytes.
const RING_SECS: usize = 4;

/// How often the writer drains the rings. Short enough that the rings never
/// come close to full, long enough that the thread is asleep essentially all
/// the time.
const WRITER_TICK_MS: u64 = 25;

/// How far ahead of the band the mic is allowed to get before the writer
/// starts throwing the oldest of it away.
///
/// The two devices free-run, so one of them is always slightly faster. If it
/// is the input, its queue grows forever; a quarter of a second is far more
/// than any real clock error produces in twenty minutes and still short
/// enough that dropping it cannot be heard as a jump.
const MIC_BACKLOG_SECS: f64 = 0.25;

// ---------------------------------------------------------------------------
// The ring
// ---------------------------------------------------------------------------

/// A single-producer single-consumer ring of samples, allocated once.
///
/// The producer is an audio callback, so it may not allocate, may not block
/// and may not fail loudly: a push into a full ring drops the sample and
/// counts it, which is the only outcome available to a thread that cannot
/// wait. `dropped()` is the honest report of that, and the writer logs it.
///
/// Every slot is an `AtomicU32` holding the sample's bits rather than an
/// `UnsafeCell<f32>`, so the whole thing is safe Rust with no `unsafe` on
/// the audio thread. On every architecture anyone runs this on a relaxed
/// 32-bit store compiles to the same instruction a plain store would; the
/// ordering that actually matters is the release on the write index and the
/// acquire on it in the consumer, and there is one of each per BUFFER, not
/// one per sample.
pub struct TakeRing {
    buf: Vec<AtomicU32>,
    /// `buf.len() - 1`. The capacity is a power of two so the wrap is a mask.
    mask: usize,
    /// Monotonic counts, not indices. `u64` at 192 kHz overflows in three
    /// million years, so the wrap arithmetic below is a formality.
    write: AtomicU64,
    read: AtomicU64,
    dropped: AtomicUsize,
    /// Where the transport was at the FIRST sample the callback ever pushed
    /// into this ring. See [`TakeRing::stamp_start`] — five words, written
    /// once per take, and the reason a take knows when it began.
    start_kind: AtomicU32,
    start_frames: AtomicU64,
    start_a: AtomicU32,
    start_b: AtomicU32,
    start_known: AtomicBool,
}

/// Where the engine's transport was at one instant, in the terms the output
/// callback already has in hand.
///
/// **Samples, not bars.** Turning a sample cursor into a bar and a tick is a
/// walk over the compiled song table, which is exactly the kind of work the
/// callback may not do; what it has is the cursor itself, and the cursor is
/// the exact answer rather than an approximation of one. The walk happens on
/// the writer side, through the function [`TakeStart::position`] hands over —
/// `song::take_position` is the one that exists.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TakeTransport {
    /// Nothing arranged was playing: the plain click, or a stopped transport.
    /// A take begun here has no musical position and says so.
    Free,
    /// A song, `frames` samples into its count-in.
    SongCountIn { frames: u64 },
    /// A song, `frames` samples into pass `pass` of the played range.
    Song { frames: u64, pass: u32 },
    /// A jam, at `bar` of `chorus`, as the engine counts both.
    Jam { bar: u32, chorus: u32 },
}

// The discriminants, spelled out because they cross a pair of atomics.
const TRANSPORT_FREE: u32 = 0;
const TRANSPORT_SONG_COUNT_IN: u32 = 1;
const TRANSPORT_SONG: u32 = 2;
const TRANSPORT_JAM: u32 = 3;

impl TakeRing {
    /// A ring holding at least `samples` samples, rounded up to a power of
    /// two. Allocates — call it on the command thread, never on an audio one.
    pub fn new(samples: usize) -> Self {
        let cap = samples.max(2).next_power_of_two();
        let mut buf = Vec::with_capacity(cap);
        buf.resize_with(cap, || AtomicU32::new(0));
        Self {
            mask: cap - 1,
            buf,
            write: AtomicU64::new(0),
            read: AtomicU64::new(0),
            dropped: AtomicUsize::new(0),
            start_kind: AtomicU32::new(TRANSPORT_FREE),
            start_frames: AtomicU64::new(0),
            start_a: AtomicU32::new(0),
            start_b: AtomicU32::new(0),
            start_known: AtomicBool::new(false),
        }
    }

    /// PRODUCER (an audio callback): say where the transport was at the first
    /// sample of the first buffer pushed into this ring.
    ///
    /// Four relaxed stores of values the callback is already holding, and one
    /// release, ONCE per take — the caller keeps the "not yet stamped" flag in
    /// its own cached state, so the cost on every other buffer of the take is
    /// a bool it has already loaded. No allocation, no lock, no table walk.
    ///
    /// Called BEFORE the buffer it describes is pushed, so a consumer that
    /// can see any samples at all can see this: the push's release on the
    /// write index publishes everything stored before it.
    pub fn stamp_start(&self, at: TakeTransport) {
        let (kind, frames, a, b) = match at {
            TakeTransport::Free => (TRANSPORT_FREE, 0, 0, 0),
            TakeTransport::SongCountIn { frames } => (TRANSPORT_SONG_COUNT_IN, frames, 0, 0),
            TakeTransport::Song { frames, pass } => (TRANSPORT_SONG, frames, pass, 0),
            TakeTransport::Jam { bar, chorus } => (TRANSPORT_JAM, 0, bar, chorus),
        };
        self.start_kind.store(kind, Ordering::Relaxed);
        self.start_frames.store(frames, Ordering::Relaxed);
        self.start_a.store(a, Ordering::Relaxed);
        self.start_b.store(b, Ordering::Relaxed);
        self.start_known.store(true, Ordering::Release);
    }

    /// CONSUMER: what the callback stamped, or `None` if it never did.
    pub fn start_transport(&self) -> Option<TakeTransport> {
        if !self.start_known.load(Ordering::Acquire) {
            return None;
        }
        let frames = self.start_frames.load(Ordering::Relaxed);
        let a = self.start_a.load(Ordering::Relaxed);
        let b = self.start_b.load(Ordering::Relaxed);
        Some(match self.start_kind.load(Ordering::Relaxed) {
            TRANSPORT_SONG_COUNT_IN => TakeTransport::SongCountIn { frames },
            TRANSPORT_SONG => TakeTransport::Song { frames, pass: a },
            TRANSPORT_JAM => TakeTransport::Jam {
                bar: a,
                chorus: b,
            },
            _ => TakeTransport::Free,
        })
    }

    /// How many samples the ring holds.
    pub fn capacity(&self) -> usize {
        self.buf.len()
    }

    /// How many samples the producer had to throw away because the consumer
    /// was not keeping up. Zero on any machine that is not on fire.
    pub fn dropped(&self) -> usize {
        self.dropped.load(Ordering::Relaxed)
    }

    /// PRODUCER (an audio callback): write every `stride`-th sample of an
    /// interleaved buffer.
    ///
    /// One acquire load and one release store for the whole buffer, whatever
    /// its length; the samples themselves are relaxed. Nothing here
    /// allocates, locks or branches on anything but the ring's own fill.
    pub fn push_strided(&self, data: &[f32], stride: usize) {
        self.push_strided_at(data, stride, 0)
    }

    /// The same, starting from `offset` within each frame.
    ///
    /// Which channel a take reads back stopped being a given the moment the
    /// musician could choose a pair of outputs: with the click on outputs
    /// 3-4, channel 0 carries the silence the callback wrote there, and a
    /// take of it is a take of nothing. `engine::take_offset` decides the
    /// number; this walks it. An offset past the end of the buffer reads
    /// nothing rather than panicking.
    pub fn push_strided_at(&self, data: &[f32], stride: usize, offset: usize) {
        let stride = stride.max(1);
        let cap = self.buf.len() as u64;
        let mut w = self.write.load(Ordering::Relaxed);
        let r = self.read.load(Ordering::Acquire);
        let mut free = cap.saturating_sub(w.wrapping_sub(r));
        let mut lost = 0usize;
        let data = match data.get(offset..) {
            Some(d) => d,
            None => &[],
        };
        for s in data.iter().step_by(stride) {
            if free == 0 {
                lost += 1;
                continue;
            }
            self.buf[(w as usize) & self.mask].store(s.to_bits(), Ordering::Relaxed);
            w = w.wrapping_add(1);
            free -= 1;
        }
        self.write.store(w, Ordering::Release);
        if lost > 0 {
            self.dropped.fetch_add(lost, Ordering::Relaxed);
        }
    }

    /// PRODUCER: write a run of mono samples.
    pub fn push(&self, samples: &[f32]) {
        self.push_strided(samples, 1);
    }

    /// CONSUMER (the writer thread): append everything waiting to `out` and
    /// return how much that was.
    pub fn drain_into(&self, out: &mut Vec<f32>) -> usize {
        let r = self.read.load(Ordering::Relaxed);
        let w = self.write.load(Ordering::Acquire);
        let n = w.wrapping_sub(r) as usize;
        out.reserve(n);
        for i in 0..n {
            let slot = ((r.wrapping_add(i as u64)) as usize) & self.mask;
            out.push(f32::from_bits(self.buf[slot].load(Ordering::Relaxed)));
        }
        self.read.store(w, Ordering::Release);
        n
    }

    /// Throw away everything in the ring and forget the drop count.
    ///
    /// Only safe while the producer is stopped — which is exactly when it is
    /// called: `start_take` resets a ring before the flag that lets the
    /// input callback write to it goes up.
    pub fn reset(&self) {
        let w = self.write.load(Ordering::Acquire);
        self.read.store(w, Ordering::Release);
        self.dropped.store(0, Ordering::Relaxed);
    }
}

// ---------------------------------------------------------------------------
// The handoff to the output callback
// ---------------------------------------------------------------------------

/// A take buffer decoded and ready to stream, with the rate it was recorded
/// at. The callback resamples on the fly, because the device it is playing
/// out of today need not be the one the take was recorded through.
#[derive(Clone)]
pub struct TakePlayback {
    pub pcm: Arc<Vec<f32>>,
    pub sample_rate: u32,
}

impl TakePlayback {
    /// How far through the source the callback moves per output frame.
    ///
    /// A take is recorded at whatever the output device was running at THEN
    /// and played back through whatever is running NOW, and those need not
    /// be the same — plug in an interface between recording and listening
    /// and they will not be. One divide when the take starts, one multiply
    /// -add per frame after that.
    #[inline]
    pub(crate) fn step(&self, out_sr: u32) -> f64 {
        self.sample_rate as f64 / out_sr.max(1) as f64
    }

    /// The sample at `pos` (in SOURCE samples), or `None` once the take has
    /// run out — which is what raises `take-playback-ended`.
    ///
    /// Pure, and on the audio thread, so it is the same kind of thing
    /// `jam_play` and `accent_for` in `engine.rs` are: the rule lives here
    /// where it can be tested without a sound card, and the callback calls
    /// it.
    #[inline]
    pub(crate) fn sample_at(&self, pos: f64) -> Option<f32> {
        if pos < 0.0 {
            return Some(0.0);
        }
        let i = pos as usize;
        let pcm = &self.pcm[..];
        match (pcm.get(i), pcm.get(i + 1)) {
            (Some(&a), Some(&b)) => {
                let f = (pos - i as f64) as f32;
                Some(a + (b - a) * f)
            }
            // The last sample has nothing to interpolate towards.
            (Some(&a), None) => Some(a),
            _ => None,
        }
    }
}

/// Something the audio thread has finished with, on its way to a thread that
/// is allowed to free memory.
///
/// Nothing ever READS these fields, and that is the whole design: the value
/// of this enum is that it owns an `Arc` until a thread which may call
/// `free()` drops it. `dead_code` would have it replaced with a unit type,
/// which is the one change that would break it.
#[allow(dead_code)]
enum Retired {
    Ring(Arc<TakeRing>),
    Pcm(Arc<Vec<f32>>),
}

/// How many retired items the command thread may be behind on. A take is
/// started and stopped by hand, so the traffic here is a handful of items a
/// session, not the jam table's several a chorus.
const TAKE_RETIRED_CAP: usize = 8;

/// Where the take's ring and the take being played back wait for the audio
/// thread.
///
/// The same shape [`crate::engine::JamHandoff`] uses, and for the same
/// reasons: the callback may not block to read this and may not allocate, so
/// each half carries a generation counter it compares with one relaxed load
/// per buffer, and only a real change pays for a `try_lock` and an `Arc`
/// clone. Whatever the clone replaces is handed BACK rather than dropped
/// here — dropping the last `Arc<Vec<f32>>` of a twenty-minute take would
/// free a hundred megabytes on the audio thread.
pub struct TakeHandoff {
    record: Mutex<Option<Arc<TakeRing>>>,
    record_generation: AtomicU64,
    play: Mutex<Option<TakePlayback>>,
    play_generation: AtomicU64,
    /// Raised by the audio thread when a playback runs off its own end.
    /// Lowered by the event thread, which is what emits
    /// `take-playback-ended`; an atomic rather than a channel message
    /// because the callback must not allocate and the event loop is already
    /// awake every 50 ms.
    ended: AtomicBool,
    /// Raised by the WRITER thread when a take hits [`TAKE_MAX_SECS`], and
    /// lowered by the event thread, which turns it into `take-capped`. The
    /// same shape as `ended` and for the same reason at the far end: the
    /// event loop is the one thread here that may `emit`.
    capped: AtomicBool,
    retired: Mutex<Vec<Retired>>,
}

/// Shared handle to the take slot. Cloned into the audio thread and into the
/// commands that fill it.
pub type SharedTake = Arc<TakeHandoff>;

impl Default for TakeHandoff {
    fn default() -> Self {
        Self::new()
    }
}

impl TakeHandoff {
    pub fn new() -> Self {
        Self {
            record: Mutex::new(None),
            record_generation: AtomicU64::new(0),
            play: Mutex::new(None),
            play_generation: AtomicU64::new(0),
            ended: AtomicBool::new(false),
            capped: AtomicBool::new(false),
            retired: Mutex::new(Vec::with_capacity(TAKE_RETIRED_CAP)),
        }
    }

    /// Hand the callback somewhere to copy the band into, or `None` to stop
    /// it copying. Command thread only.
    pub fn set_record(&self, ring: Option<Arc<TakeRing>>) {
        self.drain_retired();
        // A take starting is a take that has not hit the cap. Clearing it
        // here rather than on the way out means a cap nobody collected
        // cannot be reported against the NEXT take.
        if ring.is_some() {
            self.capped.store(false, Ordering::Release);
        }
        if let Ok(mut slot) = self.record.lock() {
            *slot = ring;
            // Bumped AFTER the write, so a callback that sees the new
            // generation is guaranteed to find the new value behind the lock.
            drop(slot);
            self.record_generation.fetch_add(1, Ordering::Release);
        }
    }

    /// Hand the callback a take to play, or `None` to stop it. Command
    /// thread only. Clears any stale "it ended" flag, so a playback started
    /// twice does not report the first one's ending against the second.
    pub fn set_play(&self, play: Option<TakePlayback>) {
        self.drain_retired();
        self.ended.store(false, Ordering::Release);
        if let Ok(mut slot) = self.play.lock() {
            *slot = play;
            drop(slot);
            self.play_generation.fetch_add(1, Ordering::Release);
        }
    }

    /// Is the callback still being asked to copy the band somewhere? Only
    /// the tests ask; the commands know from [`TakeSession`].
    #[cfg(test)]
    fn is_recording_into_a_ring(&self) -> bool {
        self.record
            .lock()
            .map(|r| r.is_some())
            .unwrap_or_else(|e| e.into_inner().is_some())
    }

    /// Is a take playing? The commands need it to refuse to start recording
    /// over the top of one.
    pub fn is_playing_back(&self) -> bool {
        self.play
            .lock()
            .map(|p| p.is_some())
            .unwrap_or_else(|e| e.into_inner().is_some())
    }

    /// Event thread: has a playback ended since the last time anyone asked?
    /// Consumes the flag, so the event is emitted exactly once.
    pub fn take_ended(&self) -> bool {
        self.ended.swap(false, Ordering::AcqRel)
    }

    /// Audio thread: say a playback ran off its end.
    pub(crate) fn note_ended(&self) {
        self.ended.store(true, Ordering::Release);
    }

    /// Event thread: has a take hit the cap since the last time anyone
    /// asked? Consumes the flag, so `take-capped` is emitted exactly once.
    pub fn take_capped(&self) -> bool {
        self.capped.swap(false, Ordering::AcqRel)
    }

    /// Writer thread: say a take stopped at [`TAKE_MAX_SECS`].
    fn note_capped(&self) {
        self.capped.store(true, Ordering::Release);
    }

    /// Drop everything the audio thread handed back. Command thread only.
    pub fn drain_retired(&self) {
        if let Ok(mut r) = self.retired.lock() {
            r.clear();
        }
    }

    /// Audio thread: read the recording ring if its generation moved.
    /// Returns `Some(new value)` when it did, `None` when nothing changed or
    /// the lock was busy — in which case the caller leaves its cached
    /// generation alone and the next buffer tries again.
    pub(crate) fn poll_record(&self, seen: &mut u64) -> Option<Option<Arc<TakeRing>>> {
        let gen = self.record_generation.load(Ordering::Acquire);
        if gen == *seen {
            return None;
        }
        let slot = self.record.try_lock().ok()?;
        let incoming = slot.clone();
        drop(slot);
        *seen = gen;
        Some(incoming)
    }

    /// Audio thread: the same for the take being played back.
    pub(crate) fn poll_play(&self, seen: &mut u64) -> Option<Option<TakePlayback>> {
        let gen = self.play_generation.load(Ordering::Acquire);
        if gen == *seen {
            return None;
        }
        let slot = self.play.try_lock().ok()?;
        let incoming = slot.clone();
        drop(slot);
        *seen = gen;
        Some(incoming)
    }

    fn try_retire(&self, item: Retired) -> Result<(), Retired> {
        match self.retired.try_lock() {
            Ok(mut r) if r.len() < r.capacity() => {
                r.push(item);
                Ok(())
            }
            _ => Err(item),
        }
    }
}

/// The audio thread's parking spaces for take buffers it replaced while the
/// retirement slot was busy, flushed once per buffer.
///
/// [`crate::engine::JamRetirement`] for the jam table, applied to this. If
/// even these fill — which needs the user to press play and stop on takes
/// faster than the command thread can take a lock — the buffer is leaked
/// rather than freed here. A few megabytes lost is a price; a `free()` under
/// the mixer is the thing the engine is built to avoid.
pub(crate) struct TakeParking {
    parked: [Option<Retired>; 4],
}

impl TakeParking {
    pub(crate) fn new() -> Self {
        Self {
            parked: [None, None, None, None],
        }
    }

    pub(crate) fn retire_ring(&mut self, handoff: &TakeHandoff, ring: Arc<TakeRing>) {
        self.park(handoff, Retired::Ring(ring));
    }

    pub(crate) fn retire_pcm(&mut self, handoff: &TakeHandoff, pcm: Arc<Vec<f32>>) {
        self.park(handoff, Retired::Pcm(pcm));
    }

    fn park(&mut self, handoff: &TakeHandoff, item: Retired) {
        if let Err(item) = handoff.try_retire(item) {
            match self.parked.iter_mut().find(|s| s.is_none()) {
                Some(slot) => *slot = Some(item),
                None => std::mem::forget(item),
            }
        }
    }

    pub(crate) fn flush(&mut self, handoff: &TakeHandoff) {
        for slot in self.parked.iter_mut() {
            if let Some(item) = slot.take() {
                if let Err(back) = handoff.try_retire(item) {
                    *slot = Some(back);
                    return;
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/// Which transport a take's position is measured against.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TakeMode {
    Song,
    Jam,
}

/// Where the music was when the take's first sample was written.
///
/// `plans/tasks/songs/W15-LIVE-AND-EXACT.md`: the pitch pass has to know the
/// instant the analysed audio starts, relative to the piece. Measuring that
/// from the frontend — `performance.now()` either side of `start_take` —
/// misses the IPC crossing on the way in and the wait for the callback to
/// pick the ring up on the way out, which is tens of milliseconds it can
/// only ever be optimistic by. The writer thread does not have to guess: it
/// takes the band as its clock, so the first chunk of band it sees IS the
/// first sample of the file, and the callback stamped where the transport
/// was when it rendered that chunk.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TakePosition {
    pub mode: TakeMode,
    /// A song: the PLAYED bar — the index into `SongScore.bars`, never the
    /// number printed on the page. A jam: the bar of the form, as the engine
    /// counts them.
    pub bar: u32,
    /// Ticks into the piece at 960 to the quarter, for a song. 0 for a jam,
    /// which has no score to count ticks in.
    pub tick: u32,
    /// Times round the range, from 0 — the contract's `pass`. A jam's chorus,
    /// less one, so the two modes count the same way.
    pub pass: u32,
    /// The first sample landed in the count-in rather than in the music.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub count_in: bool,
    /// Where beat 0 of the FIRST pass sits inside the file, in milliseconds
    /// from the instant it starts — exactly what `analyze_take_pitch` means
    /// by `startOffsetMs`. Negative when the file starts after that beat,
    /// which is the usual case; positive when the take opens in a count-in.
    ///
    /// `None` for a jam, which has no beat 0 to measure from.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_offset_ms: Option<f64>,
}

/// Turn where the transport was into where the music was.
///
/// A function rather than a table, because the table that knows the answer
/// (`song::SongTable`) lives on the command thread and this module has never
/// had to know a song exists — see `useSongTakes.ts` on why that was the
/// finding rather than a shortcut. `start_take` closes over the song the
/// engine is holding and hands the writer this; `song::take_position` is the
/// implementation.
pub type TakePositionSource = Arc<dyn Fn(TakeTransport) -> Option<TakePosition> + Send + Sync>;

/// A recorded take. The mirror of `JamTake` in `src/jam/types.ts`, and the
/// content of the sidecar JSON that sits beside every WAV.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamTake {
    pub id: String,
    pub jam_id: String,
    /// Milliseconds since the epoch, the way every other timestamp the
    /// frontend holds is written.
    pub created_at: u64,
    pub duration_sec: f64,
    /// Absolute path of the WAV.
    pub path: String,
    /// Absolute path of the dry stem, when the take was recorded with a mic
    /// and there is one. `None` for a take of the band alone, and for every
    /// take recorded before this existed.
    ///
    /// Defaulted rather than required, because the sidecars already on
    /// disk do not have it and a take that cannot be read is a take that is
    /// lost. Skipped when empty so those sidecars do not grow a null.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dry_path: Option<String>,
    /// Where the music was when the first sample was written. See
    /// [`TakePosition`].
    ///
    /// Optional, and skipped when absent, for the same two reasons the dry
    /// stem is: every sidecar already on a musician's disk has none, and a
    /// take recorded with neither a song nor a jam on the engine has no
    /// position to record. The frontend keeps its old `performance.now()`
    /// estimate as the fallback for exactly those.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<TakePosition>,
    /// Absolute path of the picture, when the camera was on for this take
    /// (`plans/SONGS.md` A9/A10, `take_video.rs`).
    ///
    /// Read off the disk like the dry stem and for the same reason, never off
    /// the record: the container depends on what the webview could encode that
    /// day, and a sidecar naming a file that is not there is a review that
    /// offers a picture and then cannot show one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video_path: Option<String>,
    /// How big that file is. Off the disk as well — the shelf says what the
    /// feature has cost, and a picture is an order of magnitude more of it
    /// than the sound is.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video_bytes: Option<u64>,
    /// Absolute path of the thumbnail — one frame of the picture, grabbed at
    /// the first downbeat (W25).
    ///
    /// Off the disk like the two above, and for one reason more: a take
    /// recorded before this existed has a picture and no thumbnail, and it is
    /// the directory rather than the sidecar that knows which.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumb_path: Option<String>,
    /// Milliseconds to ADD to a position in the take's audio to get the same
    /// instant in the picture (`plans/SONGS.md` A10).
    ///
    /// The one field here the disk cannot answer, so it is the one the sidecar
    /// is the record of. It is a MEASUREMENT, good to a few tens of
    /// milliseconds and no better — the webview's clock against the engine's,
    /// fitted over a pass's beat events (`src/songs/camera/offset.ts`) — which
    /// is why the review has a nudge beside it and why spike K3 exists.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video_offset_ms: Option<f64>,
    /// What this take is a recording OF (`loopback.rs`).
    ///
    /// The one field here that is a promise rather than a description, which
    /// is why it is written and why the screen shows it for the whole length
    /// of a take rather than only where the switch is. A take made of
    /// everything this computer plays may contain a video call, a
    /// notification or a song in a browser tab, and a musician who comes back
    /// to a shelf of takes a week later has to be able to see which ones
    /// those are.
    ///
    /// Defaulted, because every sidecar already on a disk was written before
    /// there was a choice, and every one of those is Yames and your input.
    #[serde(default)]
    pub sound: TakeSound,
    /// The speaker it listened to, as the operating system names it. `None`
    /// for a take of Yames and your input, which listens to no speaker.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sound_device: Option<String>,
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/// The directory every take lives under, inside the app's own data
/// directory. One subdirectory per jam.
pub const TAKES_DIR: &str = "takes";

/// What goes between a take's id and `.wav` to make its dry stem.
///
/// One name, in one place, because four different things have to agree
/// about it: the writer creates it, `list_takes` has to NOT report it as a
/// take of its own, `delete_take` has to take it with the mix, and
/// `safe_stem` has to refuse an id that ends in it.
pub const DRY_SUFFIX: &str = ".dry";

/// What goes between a take's id and its container to make the picture
/// (`plans/SONGS.md` A10, `take_video.rs`).
///
/// Exactly the dry stem's rule, one file further out: the camera's recording
/// is part of a take, not a take, so it is listed under the take, deleted
/// with the take and refused as an id of its own. It is not a WAV and its
/// extension depends on what the webview could encode, so the two functions
/// below are by stem rather than by name.
pub const VIDEO_SUFFIX: &str = ".video";

/// ...and what goes between it and `.jpg` to make the THUMBNAIL (W25).
///
/// One frame of the picture, grabbed at the first downbeat, so the takes
/// shelf can show what a take is a picture of rather than a row of dates.
/// Exactly the same rule as the other two: part of a take, not a take —
/// listed under it, deleted with it, and refused as an id of its own.
pub const THUMB_SUFFIX: &str = ".thumb";

/// The dry stem that belongs beside a take's WAV.
fn dry_beside(wav: &Path) -> PathBuf {
    let stem = wav.file_stem().map(|s| s.to_string_lossy().into_owned());
    match stem {
        Some(s) => wav.with_file_name(format!("{s}{DRY_SUFFIX}.wav")),
        None => wav.to_path_buf(),
    }
}

/// Is this file a dry stem rather than a take?
///
/// By the stem and not by the length of the name: `1234.dry.wav` has the
/// file stem `1234.dry`, and a take's own id is digits, so the two can
/// never be confused in either direction.
fn is_dry_stem(stem: &str) -> bool {
    stem.ends_with(DRY_SUFFIX)
}

/// Is this file a take's picture rather than a take?
///
/// Same rule as the dry stem: `1234.video.webm` has the file stem
/// `1234.video`, and a take's own id is digits.
pub(crate) fn is_video_stem(stem: &str) -> bool {
    stem.ends_with(VIDEO_SUFFIX)
}

/// Is this file a take's thumbnail rather than a take? Same rule again.
pub(crate) fn is_thumb_stem(stem: &str) -> bool {
    stem.ends_with(THUMB_SUFFIX)
}

/// The thumbnail that belongs beside a take's WAV.
///
/// A name rather than a scan, unlike the picture: this one the app writes
/// itself and it is always a JPEG, so there is no "whatever the webview could
/// encode that day" to look up.
pub(crate) fn thumb_beside(wav: &Path) -> Option<PathBuf> {
    let stem = wav.file_stem()?.to_str()?;
    Some(wav.with_file_name(format!("{stem}{THUMB_SUFFIX}.jpg")))
}

/// The picture that belongs beside a take's WAV, whatever it was encoded as.
///
/// A scan of the directory rather than a name built from a remembered
/// extension: the container is whatever the webview could encode on the day
/// (`take_video.rs`), a machine can gain and lose codecs between one take and
/// the next, and a record that names the file is a record that goes stale the
/// moment the app data directory moves. What is on disk is the truth, which is
/// the same rule `list_takes` already applies to the dry stem.
pub(crate) fn video_beside(wav: &Path) -> Option<PathBuf> {
    let stem = wav.file_stem()?.to_str()?;
    let wanted = format!("{stem}{VIDEO_SUFFIX}");
    let dir = wav.parent()?;
    for entry in fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.file_stem().and_then(|s| s.to_str()) == Some(wanted.as_str()) {
            return Some(path);
        }
    }
    None
}

/// The character rule: what survives of an id on its way to being a name.
///
/// Ids arrive over IPC and a directory name built from unvalidated input is
/// how a feature that writes files becomes a feature that writes ANY file.
/// Only letters, digits, dash, underscore and dot survive; everything else
/// becomes an underscore, `.` and `..` are refused outright, and the result
/// cannot contain a separator, so the path can only ever land inside
/// `takes/`.
fn sanitised(jam_id: &str) -> Result<String, String> {
    let trimmed = jam_id.trim();
    if trimmed.is_empty() {
        return Err("a take needs a jam to belong to".into());
    }
    if trimmed == "." || trimmed == ".." {
        return Err(format!("{trimmed:?} is not a jam id"));
    }
    let safe: String = trimmed
        .chars()
        .take(120)
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect();
    // A name of nothing but dots would still resolve to a directory that is
    // not the one we meant.
    if safe.chars().all(|c| c == '.') {
        return Err(format!("{jam_id:?} is not a jam id"));
    }
    Ok(safe)
}

/// A 64-bit FNV-1a of the RAW id, in hex.
///
/// Not a security hash and not trying to be: the job is to tell two ids
/// apart that the character rule maps onto the same string, and sixteen hex
/// digits of FNV over ids a person typed is far past the point where an
/// accident is thinkable. Written out rather than pulled in because the
/// alternative is a dependency to hash a jam name.
fn id_fingerprint(jam_id: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in jam_id.trim().as_bytes() {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x1000_0000_01b3);
    }
    format!("{hash:016x}")
}

/// A jam id as a directory name.
///
/// The character rule above, plus a fingerprint of the RAW id — because the
/// character rule is not one-to-one. `my jam` and `my/jam` and `my.jam`
/// (and, on the ids the screen actually generates, any pair that differs
/// only where a colon or a space sits) all sanitise to the same string, and
/// two jams sharing a directory means one jam's list showing the other's
/// takes and `delete_take` reaching into a jam nobody named. The
/// fingerprint is of the id as it arrived, so ids that differ at all get
/// different directories, and the readable half is kept in front of it so a
/// musician looking in the folder can still tell what they are looking at.
///
/// The path is still built only from characters the rule allowed, so
/// traversal is blocked exactly as before.
pub fn safe_dir_name(jam_id: &str) -> Result<String, String> {
    let safe = sanitised(jam_id)?;
    Ok(format!("{safe}-{}", id_fingerprint(jam_id)))
}

/// A take id as a file stem. The character rule, and then the id has to be
/// the id it claims to be: the ids this module generates are digits, so
/// anything that had to be sanitised to become a name came from somewhere it
/// should not have, and resolving it to the nearest legal name would be
/// guessing. No fingerprint — a stem that is not the id would make
/// `find_take` unable to find a take by the id the UI holds.
fn safe_stem(id: &str) -> Result<String, String> {
    let s = sanitised(id)?;
    if s != id.trim() {
        return Err(format!("{id:?} is not a take id"));
    }
    // A DRY STEM IS NOT A TAKE AND MAY NOT BE ADDRESSED AS ONE. `1234.dry`
    // survives the character rule intact, so without this it would resolve
    // to `1234.dry.wav` and `delete_take` would take a take's dry stem away
    // while leaving the take, and the row in the list still claiming one.
    // The stem belongs to its take; it is reached through the take's own id
    // and removed with it.
    if is_dry_stem(&s) {
        return Err(format!("{id:?} is not a take id"));
    }
    // AND A PICTURE IS NOT A TAKE EITHER, for the same reason and with one
    // more: `take_video.rs` writes its file under a PENDING name until the
    // take it belongs to has an id, and that name ends in the same suffix. So
    // this one line also stops a half-written recording being addressed,
    // played or deleted as though it were a take of somebody's playing.
    if is_video_stem(&s) {
        return Err(format!("{id:?} is not a take id"));
    }
    // AND NEITHER IS A THUMBNAIL (W25). It is a frame of the same recording
    // and belongs to the same take; it is reached through the take's id and
    // removed with it.
    if is_thumb_stem(&s) {
        return Err(format!("{id:?} is not a take id"));
    }
    Ok(s)
}

/// Where a jam's — or a song's — takes live. `take_video.rs` writes the
/// picture into the same directory, and resolves it through this so there is
/// one idea of where a take's files are and one character rule guarding it.
pub(crate) fn take_dir(app_data: &Path, jam_id: &str) -> Result<PathBuf, String> {
    Ok(takes_root(app_data).join(safe_dir_name(jam_id)?))
}

/// The take with this id, as a path. `take_video.rs`'s, so a picture can only
/// ever be filed beside a take that exists.
pub(crate) fn take_path(app_data: &Path, id: &str) -> Result<PathBuf, String> {
    find_take(app_data, id)
}

fn takes_root(app_data: &Path) -> PathBuf {
    app_data.join(TAKES_DIR)
}

/// Every byte under `takes/`, so the UI can say when the feature has quietly
/// eaten a disk. Missing directory is zero, not an error.
pub fn takes_dir_size(app_data: &Path) -> u64 {
    fn walk(dir: &Path) -> u64 {
        let mut total = 0u64;
        let Ok(entries) = fs::read_dir(dir) else {
            return 0;
        };
        for entry in entries.flatten() {
            match entry.file_type() {
                Ok(t) if t.is_dir() => total += walk(&entry.path()),
                Ok(t) if t.is_file() => total += entry.metadata().map(|m| m.len()).unwrap_or(0),
                _ => {}
            }
        }
        total
    }
    walk(&takes_root(app_data))
}

/// Find a take by id: `takes/<any jam>/<id>.wav`.
///
/// A scan rather than an id that encodes its own directory, because a jam id
/// is the user's and may contain anything at all — an id built by gluing two
/// of them together is an id that can be ambiguous, and a resolution that
/// cannot be ambiguous is worth a directory listing of a folder with a
/// handful of entries in it.
fn find_take(app_data: &Path, id: &str) -> Result<PathBuf, String> {
    let stem = safe_stem(id)?;
    let root = takes_root(app_data);
    let entries = fs::read_dir(&root).map_err(|e| format!("no takes yet ({e})"))?;
    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let wav = entry.path().join(format!("{stem}.wav"));
        if wav.is_file() {
            return Ok(wav);
        }
    }
    Err(format!("there is no take {id} on this machine"))
}

/// Read the takes of one jam, newest first.
///
/// The sidecar JSON is the record; a WAV whose sidecar went missing (a crash
/// between the two writes) is still listed, with what can be read off the
/// file itself. Losing a take because its label was lost would be the worse
/// failure of the two.
pub fn list_takes(app_data: &Path, jam_id: &str) -> Result<Vec<JamTake>, String> {
    let dir = takes_root(app_data).join(safe_dir_name(jam_id)?);
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut out: Vec<JamTake> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("wav") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        // A dry stem is half of the take beside it, not a row of its own.
        if is_dry_stem(stem) {
            continue;
        }
        // And from the file system rather than from the record, for the same
        // reason the path below is: what is on disk is the truth, and a
        // sidecar written before the stem existed would otherwise hide one.
        let dry = dry_beside(&path);
        let dry_path = dry
            .is_file()
            .then(|| dry.to_string_lossy().into_owned());
        // The picture, the same way and for the same reason.
        let video = video_beside(&path);
        let video_bytes = video
            .as_ref()
            .and_then(|p| fs::metadata(p).ok())
            .map(|m| m.len());
        let video_path = video.map(|p| p.to_string_lossy().into_owned());
        // ...and the thumbnail, the same way again.
        let thumb_path = thumb_beside(&path)
            .filter(|p| p.is_file())
            .map(|p| p.to_string_lossy().into_owned());
        let sidecar = path.with_extension("json");
        let record = fs::read_to_string(&sidecar)
            .ok()
            .and_then(|text| serde_json::from_str::<JamTake>(&text).ok());
        out.push(match record {
            Some(mut r) => {
                // The path is rewritten from where the file actually is: an
                // app data directory can move between installs, and a record
                // pointing at the old one would play nothing.
                r.path = path.to_string_lossy().into_owned();
                r.dry_path = dry_path;
                r.video_path = video_path;
                r.video_bytes = video_bytes;
                r.thumb_path = thumb_path;
                // `videoOffsetMs` is NOT overwritten: it is the one thing here
                // the file system cannot answer, and the sidecar is its record.
                r
            }
            None => JamTake {
                id: stem.to_string(),
                jam_id: jam_id.to_string(),
                created_at: created_at_of(&path, stem),
                duration_sec: duration_of(&path),
                path: path.to_string_lossy().into_owned(),
                dry_path,
                // The sidecar is the only place a position was ever written,
                // and this branch is the one where it is gone. The file is
                // still a take; it simply does not know when it began.
                position: None,
                video_path,
                video_bytes,
                thumb_path,
                // Nor where the picture sat against the sound. The review
                // starts the picture level with the sound and offers the
                // nudge, which is the honest state rather than a guess.
                video_offset_ms: None,
                // Same branch, same reason: the sidecar was the only record of
                // what this take was made of, and it is gone. The header says
                // how many channels the file has, which is a hint and not the
                // answer, so this says the honest thing rather than the clever
                // one and calls it the ordinary kind.
                sound: TakeSound::default(),
                sound_device: None,
            },
        });
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

/// When a take with no sidecar was made: its own id is a millisecond
/// timestamp, and the file's mtime is the fallback for one that is not.
fn created_at_of(path: &Path, stem: &str) -> u64 {
    if let Ok(ms) = stem.parse::<u64>() {
        return ms;
    }
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// How long a take is, from the size of the file. 16-bit mono, so the header
/// tells the rate and the rest is two bytes a sample.
///
/// The size comes from the directory entry and the rate from the first 44
/// bytes: nothing else in the file is read. This is called once per take by
/// `list_takes`, for every take that lost its sidecar, while a screen is
/// waiting — and reading the whole file to divide its length by two would
/// mean pulling a hundred megabytes off the disk per row to learn a number
/// the header already carries.
fn duration_of(path: &Path) -> f64 {
    use std::io::Read;
    let Ok(len) = fs::metadata(path).map(|m| m.len()) else {
        return 0.0;
    };
    if len < 44 {
        return 0.0;
    }
    let mut header = [0u8; 44];
    let Ok(mut file) = fs::File::open(path) else {
        return 0.0;
    };
    if file.read_exact(&mut header).is_err() {
        return 0.0;
    }
    duration_from(len, &header)
}

/// The length of a take from its size on disk and its 44-byte header, and
/// from nothing else.
///
/// Split out so the rule can be checked without a file, and so that what is
/// NOT an input is visible: the body never appears here, which is the whole
/// point — a take is two bytes a sample at the rate the header states, and
/// reading a hundred megabytes to count them tells you nothing the size
/// did not.
///
/// The CHANNEL COUNT comes out of the header too, and has to: a take made of
/// everything this computer plays is stereo (`loopback.rs`), so half the
/// files in the folder are two bytes a sample and half are four bytes a
/// frame. Reading the count rather than assuming one is the difference
/// between a shelf that says "1:04" and one that says "2:08" for the same
/// minute of music.
fn duration_from(len: u64, header: &[u8; 44]) -> f64 {
    let ch = u16::from_le_bytes([header[22], header[23]]).max(1) as u64;
    let sr = u32::from_le_bytes([header[24], header[25], header[26], header[27]]);
    if sr == 0 || len < 44 {
        return 0.0;
    }
    (len - 44) as f64 / 2.0 / ch as f64 / sr as f64
}

/// Remove a take: the audio, its dry stem, its picture and its sidecar
/// together. A sidecar with no audio is a label for nothing, and a dry stem
/// or a video left behind is a recording of the player that the screen they
/// deleted it from no longer shows — which is the one outcome an opt-in
/// recording feature may never produce.
pub fn delete_take(app_data: &Path, id: &str) -> Result<(), String> {
    let wav = find_take(app_data, id)?;
    let json = wav.with_extension("json");
    let dry = dry_beside(&wav);
    // The picture first, then the stem, then the mix: every one of these is a
    // recording of a person, and the order is "most private first" so that a
    // disk failure part way through leaves a take the user can press Delete on
    // again rather than an orphan nothing lists. A picture of somebody playing
    // is the one of the three that must never be the thing left behind.
    // The thumbnail is a FRAME of that picture, so it goes with it and goes
    // first — a shelf that still showed somebody's face after they deleted
    // the take would be the same broken promise in miniature.
    if let Some(thumb) = thumb_beside(&wav).filter(|p| p.is_file()) {
        fs::remove_file(&thumb)
            .map_err(|e| format!("could not delete the take's thumbnail: {e}"))?;
    }
    if let Some(video) = video_beside(&wav) {
        fs::remove_file(&video)
            .map_err(|e| format!("could not delete the take's video: {e}"))?;
    }
    if dry.is_file() {
        fs::remove_file(&dry)
            .map_err(|e| format!("could not delete the take's dry stem: {e}"))?;
    }
    fs::remove_file(&wav).map_err(|e| format!("could not delete the take: {e}"))?;
    // The sidecar going missing first is not a failure — the take is gone,
    // which is what was asked for.
    let _ = fs::remove_file(&json);
    Ok(())
}

/// Decode a take into memory, ready to hand to the audio thread.
pub fn load_take(app_data: &Path, id: &str) -> Result<TakePlayback, String> {
    let path = find_take(app_data, id)?;
    let bytes = fs::read(&path).map_err(|e| format!("could not read the take: {e}"))?;
    let (pcm, sample_rate) = decode_wav_bytes(&bytes)?;
    if pcm.is_empty() {
        return Err("that take has no audio in it".into());
    }
    Ok(TakePlayback {
        pcm: Arc::new(pcm),
        sample_rate,
    })
}

/// Decode a 16-bit PCM WAV of one or two channels — the only kinds this
/// module writes.
///
/// Deliberately not `rodio`: these are our own files, the format is fixed,
/// and a reader that knows exactly what it is reading cannot be surprised by
/// a WAV extension nobody meant to support. A file that is not one of ours
/// is refused with a message rather than decoded on a guess.
///
/// **A stereo take comes back folded to mono**, and that is not a loss of the
/// recording: this function exists for one caller, `load_take`, which hands
/// the result to the engine's own playback, and that path mixes ONE sample
/// per frame into a click the musician is playing over. The file on disk
/// keeps both sides, the review plays the file itself, and the clip saved out
/// of it is made from the file — so the only thing that hears the fold is the
/// engine's own "play that take back at me" button, where a stereo image was
/// never going to be audible under a metronome anyway.
fn decode_wav_bytes(bytes: &[u8]) -> Result<(Vec<f32>, u32), String> {
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("that file is not a WAV".into());
    }
    let channels = u16::from_le_bytes([bytes[22], bytes[23]]);
    let sample_rate = u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]);
    let bits = u16::from_le_bytes([bytes[34], bytes[35]]);
    if !(1..=2).contains(&channels) || bits != 16 || sample_rate == 0 {
        return Err(format!(
            "that take is {channels} channel(s) of {bits}-bit at {sample_rate} Hz, and \
             takes are 16-bit, mono or stereo"
        ));
    }
    let data = &bytes[44..];
    let step = channels as usize * 2;
    let mut pcm = Vec::with_capacity(data.len() / step);
    for frame in data.chunks_exact(step) {
        let mut sum = 0f32;
        for s in frame.chunks_exact(2) {
            sum += i16::from_le_bytes([s[0], s[1]]) as f32 / 32767.0;
        }
        pcm.push(sum / channels as f32);
    }
    Ok((pcm, sample_rate))
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/// A WAV being written a chunk at a time.
///
/// The same 44-byte mono 16-bit PCM header `session_audio.rs` writes, built
/// by the same function, patched on `finish` once the sample count is known.
/// A separate writer rather than a shared one because the two have opposite
/// lifetimes: that one is a debug artefact compiled out of release builds,
/// this one is a file the user asked for and will look for later.
struct TakeWavWriter {
    path: PathBuf,
    writer: BufWriter<fs::File>,
    samples: u64,
    sample_rate: u32,
    /// One for the mix and the dry stem, two for a take made of everything
    /// this computer plays. See [`wav_header_16bit`].
    channels: u16,
}

/// The 44-byte header a take's WAV opens with.
///
/// `session_audio::wav_header_mono_16bit` is where this shape came from, and
/// a take that is mono is byte-for-byte what that function writes — asserted
/// by `the_mono_header_is_still_the_one_session_audio_writes`, which is the
/// point of having the assertion rather than the comment. What it could not
/// do is a second channel, and it should not learn to: that module is a
/// debug artefact compiled out of release builds and this is a file a
/// musician will look for later.
///
/// `frames` is FRAMES, not samples — the one place the distinction is worth
/// the extra word, because getting it wrong writes a header claiming twice
/// the audio the file holds and every player then reads past the end.
fn wav_header_16bit(sample_rate: u32, channels: u16, frames: u64) -> [u8; 44] {
    const BITS: u16 = 16;
    let ch = channels.max(1);
    let data_bytes = frames * ch as u64 * 2;
    let chunk_size = (36u64 + data_bytes).min(u32::MAX as u64) as u32;
    let data_size = data_bytes.min(u32::MAX as u64) as u32;

    let mut header = [0u8; 44];
    header[0..4].copy_from_slice(b"RIFF");
    header[4..8].copy_from_slice(&chunk_size.to_le_bytes());
    header[8..12].copy_from_slice(b"WAVE");
    header[12..16].copy_from_slice(b"fmt ");
    header[16..20].copy_from_slice(&16u32.to_le_bytes());
    header[20..22].copy_from_slice(&1u16.to_le_bytes()); // WAVE_FORMAT_PCM
    header[22..24].copy_from_slice(&ch.to_le_bytes());
    header[24..28].copy_from_slice(&sample_rate.to_le_bytes());
    let byte_rate = sample_rate as u64 * ch as u64 * 2;
    header[28..32].copy_from_slice(&(byte_rate as u32).to_le_bytes());
    header[32..34].copy_from_slice(&(ch * (BITS / 8)).to_le_bytes());
    header[34..36].copy_from_slice(&BITS.to_le_bytes());
    header[36..40].copy_from_slice(b"data");
    header[40..44].copy_from_slice(&data_size.to_le_bytes());
    header
}

impl TakeWavWriter {
    fn create(path: &Path, sample_rate: u32) -> std::io::Result<Self> {
        Self::create_with(path, sample_rate, 1)
    }

    fn create_with(path: &Path, sample_rate: u32, channels: u16) -> std::io::Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut file = fs::File::create(path)?;
        file.write_all(&[0u8; 44])?;
        Ok(Self {
            path: path.to_path_buf(),
            writer: BufWriter::with_capacity(64 * 1024, file),
            samples: 0,
            sample_rate,
            channels: channels.max(1),
        })
    }

    fn push(&mut self, samples: &[f32]) -> std::io::Result<()> {
        const CHUNK: usize = 1024;
        let mut buf = [0u8; CHUNK * 2];
        let mut i = 0;
        while i < samples.len() {
            let end = (i + CHUNK).min(samples.len());
            for (j, s) in samples[i..end].iter().enumerate() {
                let v = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
                let b = v.to_le_bytes();
                buf[j * 2] = b[0];
                buf[j * 2 + 1] = b[1];
            }
            self.writer.write_all(&buf[..(end - i) * 2])?;
            i = end;
        }
        self.samples += samples.len() as u64;
        Ok(())
    }

    fn finish(mut self) -> std::io::Result<(PathBuf, u64)> {
        self.writer.flush()?;
        let mut file = self
            .writer
            .into_inner()
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
        let frames = self.samples / self.channels.max(1) as u64;
        let header = wav_header_16bit(self.sample_rate, self.channels, frames);
        file.seek(SeekFrom::Start(0))?;
        file.write_all(&header)?;
        file.sync_all()?;
        Ok((self.path, self.samples))
    }
}

/// A streaming linear resampler.
///
/// Linear and not the engine's windowed sinc on purpose. This runs on a mic
/// signal that is about to be summed under a band and thrown at a listener's
/// ears for a self-assessment, not analysed: the interpolation error on
/// anything a guitar produces is around -78 dB (see
/// `the_take_writer_resamples_within_a_hair` in the tests), which is two
/// orders of magnitude under the noise floor of any room this is recorded
/// in. A sinc kernel would cost thirty-two multiplies a sample to improve a
/// number nobody can hear.
///
/// Streaming, so a take is not one long allocation: the phase and the tail
/// sample survive between chunks, which is the whole difference between this
/// and calling a resampler per chunk (which would put a click at every
/// chunk boundary).
struct LinearResampler {
    /// Input samples per output sample.
    step: f64,
    /// Where in `pending` the next output sample is read from.
    pos: f64,
    pending: Vec<f32>,
}

impl LinearResampler {
    fn new(in_sr: u32, out_sr: u32) -> Self {
        Self {
            step: in_sr.max(1) as f64 / out_sr.max(1) as f64,
            pos: 0.0,
            pending: Vec::new(),
        }
    }

    /// True when the rates match, in which case this is an exact copy and
    /// not an interpolation at all. Asserted by
    /// `matching_rates_are_a_copy_and_not_an_interpolation`, which is the
    /// only caller: the writer does not need to know, it just runs.
    #[cfg(test)]
    fn is_identity(&self) -> bool {
        (self.step - 1.0).abs() < 1e-12
    }

    fn push(&mut self, input: &[f32], out: &mut VecDeque<f32>) {
        if input.is_empty() && self.pending.is_empty() {
            return;
        }
        self.pending.extend_from_slice(input);
        // `pos + 1` because the interpolation reads the sample after the one
        // it lands on; the last input sample is kept for the next chunk.
        while self.pos + 1.0 < self.pending.len() as f64 {
            let i = self.pos as usize;
            let f = (self.pos - i as f64) as f32;
            let a = self.pending[i];
            let b = self.pending[i + 1];
            out.push_back(a + (b - a) * f);
            self.pos += self.step;
        }
        let consumed = self.pos as usize;
        if consumed > 0 {
            self.pending.drain(..consumed);
            self.pos -= consumed as f64;
        }
    }
}

/// Take exactly `n` mic samples — the dry stem's chunk, and the mic half of
/// the mix.
///
/// The band is the clock, so this takes what the band asks for: mic samples
/// while there are any and silence after. Split out from the mix so that
/// the file the review measures and the file the player listens to are the
/// same samples and not two independent walks of the same queue — the one
/// way they could ever drift apart is if two places popped this queue.
fn dry_chunk(mic: &mut VecDeque<f32>, n: usize, out: &mut Vec<f32>) {
    out.clear();
    out.reserve(n);
    for _ in 0..n {
        out.push(mic.pop_front().unwrap_or(0.0));
    }
}

/// Mix one chunk of band and the dry chunk beside it into the samples the
/// take gets.
///
/// Unity on both, clamped once at the end — the band has already been
/// through the mixer's own clamp, and a mic hot enough to push the sum over
/// is a mic the user set too high, which they will hear rather than have
/// silently limited. The DRY stem is not clamped here and must not be: it
/// is the mic exactly as it arrived, which is what a tracker needs and
/// what a clamp would quietly distort.
fn mix_chunk(band: &[f32], dry: &[f32], out: &mut Vec<f32>) {
    out.clear();
    out.reserve(band.len());
    for (i, &b) in band.iter().enumerate() {
        let m = dry.get(i).copied().unwrap_or(0.0);
        out.push((b + m).clamp(-1.0, 1.0));
    }
}

// ---------------------------------------------------------------------------
// Everything this computer plays
// ---------------------------------------------------------------------------

/// Turn a run of interleaved samples from the speaker's own stream into the
/// stereo the take is written in.
///
/// Three jobs, all of them on the writer thread and none of them anywhere
/// near a callback: fold however many channels the device's mix format has
/// down to two ([`crate::loopback::fold_to_stereo`]), move both sides from
/// the device's rate to the take's, and interleave them again.
///
/// A struct rather than a function because two of those jobs have STATE that
/// has to survive between chunks — a resampler's phase, and the tail of a
/// frame that arrived split across two callbacks. Losing either is a click
/// every twenty-five milliseconds.
///
/// It is also the reason the gate can be run without a sound card: feed it a
/// tone at 44.1 kHz stereo, or at 48 kHz in 5.1, and what comes out is what
/// would have gone into the file.
pub(crate) struct LoopbackFold {
    channels: usize,
    /// The beginning of a frame whose remaining samples have not arrived yet.
    /// Never longer than `channels - 1`.
    partial: Vec<f32>,
    left: LinearResampler,
    right: LinearResampler,
    l_out: VecDeque<f32>,
    r_out: VecDeque<f32>,
}

impl LoopbackFold {
    pub(crate) fn new(channels: u16, in_sr: u32, out_sr: u32) -> Self {
        Self {
            channels: channels.max(1) as usize,
            partial: Vec::with_capacity(8),
            left: LinearResampler::new(in_sr, out_sr),
            right: LinearResampler::new(in_sr, out_sr),
            l_out: VecDeque::new(),
            r_out: VecDeque::new(),
        }
    }

    /// Append every whole stereo frame `raw` completes to `out`, interleaved
    /// left-then-right, and return how many FRAMES that was.
    ///
    /// The two sides go through two resamplers rather than one interleaved
    /// one on purpose: an interpolation that walks an interleaved buffer
    /// reads the other channel as the sample after, which is a hard-panned
    /// bleed at every fractional position and exactly the kind of defect
    /// nobody notices until they put on headphones.
    pub(crate) fn push(&mut self, raw: &[f32], out: &mut Vec<f32>) -> usize {
        let ch = self.channels;
        // Frames, from whatever was left over plus what just arrived.
        let mut l_in: Vec<f32> = Vec::with_capacity(raw.len() / ch + 1);
        let mut r_in: Vec<f32> = Vec::with_capacity(raw.len() / ch + 1);
        let mut frame: Vec<f32> = std::mem::take(&mut self.partial);
        for &s in raw {
            frame.push(s);
            if frame.len() == ch {
                let (l, r) = crate::loopback::fold_to_stereo(&frame, ch);
                l_in.push(l);
                r_in.push(r);
                frame.clear();
            }
        }
        self.partial = frame;

        self.left.push(&l_in, &mut self.l_out);
        self.right.push(&r_in, &mut self.r_out);

        let n = self.l_out.len().min(self.r_out.len());
        out.clear();
        out.reserve(n * 2);
        for _ in 0..n {
            // Clamped HERE and only here: the fold can sum a centre channel
            // and a surround into a side that was already near the ceiling,
            // and sixteen bits is where a number has to stop being a number.
            let l = self.l_out.pop_front().unwrap_or(0.0);
            let r = self.r_out.pop_front().unwrap_or(0.0);
            out.push(l.clamp(-1.0, 1.0));
            out.push(r.clamp(-1.0, 1.0));
        }
        n
    }

    /// How many frames are waiting, held back because only one side of the
    /// pair has been resampled far enough yet. The writer's stop condition
    /// reads it so a take does not end a resampler's phase early.
    #[cfg(test)]
    pub(crate) fn pending(&self) -> usize {
        self.l_out.len().min(self.r_out.len())
    }
}

/// Everything [`write_everything_this_computer_plays`] needs. A struct
/// because thirteen positional arguments, six of which are `Arc`s of
/// different things, is a call site nobody can check by reading.
struct EverythingWriter {
    wav: TakeWavWriter,
    /// The speaker's own stream, interleaved.
    ring: Arc<TakeRing>,
    in_sr: u32,
    channels: u16,
    out_sr: u32,
    /// Yames' band. Drained and thrown away — see the loop.
    band: Arc<TakeRing>,
    stop: Arc<AtomicBool>,
    written: Arc<AtomicU64>,
    out_sr_watch: Option<Arc<AtomicU32>>,
    handoff: SharedTake,
    position_slot: Arc<Mutex<Option<TakePosition>>>,
    position_fn: Option<TakePositionSource>,
    path: PathBuf,
}

/// Write a take made of everything this computer plays.
///
/// **What it does NOT do** is as much of the design as what it does: it never
/// touches the microphone, never writes a dry stem, and never mixes Yames'
/// own band in. All three are already in the stream it is reading — the band
/// because Yames played it to this very speaker, the player because his amp
/// simulator played it to the same one. Adding Yames' copy of the band on top
/// would put it in twice, a buffer or so apart, which is a comb filter and
/// not a thicker sound.
///
/// **Yames' band is still drained**, every tick, and thrown away. Two
/// reasons, and neither is the audio: the output callback is copying into
/// that ring whatever this thread does, and a ring nobody drains fills up and
/// starts counting drops — a number the audio-safety gate reads and would
/// then fail on. And the FIRST chunk of it carries the transport stamp, which
/// is how a take knows which bar it opened on, and is as true of this kind of
/// take as of the other.
///
/// **The speaker is the clock here**, where the band is the clock for an
/// ordinary take. It is the same crystal either way — this listens to the
/// device Yames plays through — so the two cannot drift; what changes is that
/// a take is exactly as long as the speaker delivered, with no silence
/// invented to pad it out to what the band rendered.
fn write_everything_this_computer_plays(w: EverythingWriter) {
    let EverythingWriter {
        mut wav,
        ring,
        in_sr,
        channels,
        out_sr,
        band,
        stop,
        written,
        out_sr_watch,
        handoff,
        position_slot,
        position_fn,
        path,
    } = w;

    let mut fold = LoopbackFold::new(channels, in_sr, out_sr);
    let mut raw: Vec<f32> = Vec::with_capacity(in_sr as usize * channels.max(1) as usize);
    let mut band_buf: Vec<f32> = Vec::with_capacity(out_sr as usize);
    let mut stereo: Vec<f32> = Vec::with_capacity(out_sr as usize * 2);
    let cap_frames = TAKE_MAX_SECS * out_sr as u64;
    let mut stamped = false;

    loop {
        let stopping = stop.load(Ordering::Acquire);

        // The same guard the other writer has, for the same reason: past a
        // device change everything would be written at a rate the header does
        // not claim, and the rest of the take would play back sharp with
        // nothing in the file to say so.
        let live_sr = out_sr_watch
            .as_ref()
            .map_or(out_sr, |s| s.load(Ordering::Acquire));
        if live_sr != 0 && live_sr != out_sr {
            eprintln!(
                "[take] {} ends here: the output moved from {out_sr} Hz to {live_sr} Hz mid-take",
                path.display()
            );
            stop.store(true, Ordering::Release);
            break;
        }

        // Yames' band: drained, stamped once, discarded.
        band_buf.clear();
        band.drain_into(&mut band_buf);
        if !band_buf.is_empty() && !stamped {
            stamped = true;
            if let (Some(resolve), Some(at)) = (position_fn.as_ref(), band.start_transport()) {
                if let Ok(mut slot) = position_slot.lock() {
                    *slot = resolve(at);
                }
            }
        }

        raw.clear();
        ring.drain_into(&mut raw);
        let frames = fold.push(&raw, &mut stereo);

        if frames > 0 {
            let already = written.load(Ordering::Relaxed);
            let room = cap_frames.saturating_sub(already) as usize;
            if room == 0 {
                eprintln!(
                    "[take] {} reached the {TAKE_MAX_SECS}s cap and finished there",
                    path.display()
                );
                handoff.set_record(None);
                handoff.note_capped();
                stop.store(true, Ordering::Release);
                break;
            }
            let n = room.min(frames);
            if let Err(e) = wav.push(&stereo[..n * 2]) {
                eprintln!("[take] writing stopped: {e}");
                break;
            }
            written.fetch_add(n as u64, Ordering::Release);
        }

        // A stop only ends the take once the speaker's own stream has run
        // dry — the last two or three buffers of it are the last thing the
        // musician played, and they arrive after the button.
        if stopping && raw.is_empty() && frames == 0 {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(WRITER_TICK_MS));
    }

    let dropped = ring.dropped();
    if dropped > 0 {
        eprintln!(
            "[take] {dropped} samples were dropped: the writer could not keep up with what \
             this computer was playing"
        );
    }
    if let Err(e) = wav.finish() {
        eprintln!("[take] could not finish the WAV: {e}");
    }
}

/// Where a take's sound comes from.
///
/// Two answers, and the screen says which one a take was made with for the
/// whole length of that take — the owner's question when this was proposed
/// was *"so you'll record ALL the audio coming from the pc?"*, and a switch
/// whose answer is not visible afterwards is not an honest answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TakeSound {
    /// Yames' own band with your input mixed under it. What a take has always
    /// been, and the default, because it records the one thing you asked for
    /// and nothing you did not.
    #[default]
    YamesAndInput,
    /// Everything this computer plays: the band, your amp simulator, and
    /// whatever else happened to make a sound. See `loopback.rs`.
    Everything,
}

/// The loopback, handed to the take.
pub struct TakeLoopback {
    /// Interleaved samples, `channels` at a time, at `sample_rate`.
    pub ring: Arc<TakeRing>,
    pub sample_rate: u32,
    pub channels: u16,
    /// The device this is a recording of, for the sidecar and the screen.
    pub device: String,
    /// The open stream, so it closes when the take does and NOT before or
    /// after. `None` only in tests, which fill the ring by hand.
    ///
    /// This field is the whole of "the capture runs between record and stop":
    /// `start` moves it into the take, `stop` drops the take, and dropping
    /// this closes the endpoint. There is no other owner and no other
    /// lifetime it could take.
    pub capture: Option<crate::loopback::LoopbackCapture>,
}

impl std::fmt::Debug for TakeLoopback {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TakeLoopback")
            .field("device", &self.device)
            .field("sample_rate", &self.sample_rate)
            .field("channels", &self.channels)
            .finish()
    }
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

/// A take in flight: the two rings, the thread draining them, and the way to
/// stop it.
struct ActiveTake {
    jam_id: String,
    id: String,
    path: PathBuf,
    /// Where the dry stem is being written, when there is a mic to write.
    dry_path: Option<PathBuf>,
    created_at: u64,
    band_ring: Arc<TakeRing>,
    stop: Arc<AtomicBool>,
    /// Samples the writer has committed, so `stop_take` can report a
    /// duration without reading the file back.
    written: Arc<AtomicU64>,
    out_sr: u32,
    /// Did `start_take` start the input stream itself? If it did, `stop_take`
    /// gives it back — a take is not a reason for the microphone to stay
    /// open for the rest of the session.
    owns_input: bool,
    /// Where the music was when the writer's first chunk of band arrived.
    /// Filled in by the writer, once, and read here when the sidecar is
    /// written. `None` if the take never saw a transport.
    position: Arc<Mutex<Option<TakePosition>>>,
    writer: Option<std::thread::JoinHandle<()>>,
    /// What this take is made of, for the sidecar and the screen.
    sound: TakeSound,
    /// The speaker being listened to, when this is a take of everything this
    /// computer plays.
    sound_device: Option<String>,
    /// The open capture. **Held only here**, so it lives exactly as long as
    /// the take does: `start` moves it in, `stop` drops the `ActiveTake`, and
    /// the drop closes the endpoint. Nothing listens to the speakers before
    /// record or after stop.
    capture: Option<crate::loopback::LoopbackCapture>,
}

/// Everything a take needs to know about the world it is being recorded in.
///
/// A struct rather than eight positional arguments, because half of them are
/// rates and flags that read identically at a call site and swapping two of
/// them would compile.
pub struct TakeStart<'a> {
    pub app_data: &'a Path,
    pub jam_id: &'a str,
    pub handoff: &'a SharedTake,
    /// The input thread's ring and the rate it is filling at, or `None` when
    /// there is no input running — a take with no mic in it is still a take
    /// of the band, so this is a fact recorded rather than a reason to
    /// refuse.
    pub mic: Option<(Arc<TakeRing>, u32)>,
    /// The rate the output device is running at. The take is written at it.
    pub out_sr: u32,
    /// The round trip: output latency plus input latency, in microseconds.
    /// How much of the mic to throw away at the start so the player lands
    /// on the beat they were playing to. See the writer.
    pub round_trip_us: u64,
    /// The engine's live output rate, watched by the writer so a device
    /// change mid-take finishes the take instead of pitch-shifting the rest
    /// of it. `None` in tests that have no engine.
    pub out_sr_watch: Option<Arc<AtomicU32>>,
    /// Did the caller start the input stream for this take?
    pub owns_input: bool,
    /// How to read the transport stamp the callback leaves on the band ring.
    /// `None` in the probe and in the tests that have no transport at all;
    /// the take is then recorded exactly as it always was and its sidecar
    /// simply has no position in it.
    pub position: Option<TakePositionSource>,
    /// Everything this computer plays, when the musician asked for that
    /// instead (`loopback.rs`). `None` is the take Yames has always made.
    ///
    /// When it is `Some`, the microphone above is ignored and no dry stem is
    /// written: this stream already contains the band, the player and
    /// whatever else was making a sound, and mixing Yames' own band under it
    /// would put the same band in twice a few milliseconds apart.
    pub loopback: Option<TakeLoopback>,
}

/// Everything the take commands own. One per app, behind a mutex, on the
/// command thread only.
#[derive(Default)]
pub struct TakeSession {
    active: Option<ActiveTake>,
}

impl TakeSession {
    pub fn is_recording(&self) -> bool {
        self.active.is_some()
    }

    /// The jam a take is being recorded for, if one is.
    pub fn recording_jam(&self) -> Option<&str> {
        self.active.as_ref().map(|a| a.jam_id.as_str())
    }

    /// Did the take that is running start the input stream? Asked by
    /// `stop_take` before it stops the take, because after that there is no
    /// `ActiveTake` left to ask.
    pub fn owns_input(&self) -> bool {
        self.active.as_ref().is_some_and(|a| a.owns_input)
    }

    /// Begin a take. See [`TakeStart`] for what the world has to tell it.
    pub fn start(&mut self, args: TakeStart) -> Result<(), String> {
        let TakeStart {
            app_data,
            jam_id,
            handoff,
            mic,
            out_sr,
            round_trip_us,
            out_sr_watch,
            owns_input,
            position,
            loopback,
        } = args;
        // A take of everything this computer plays has no use for the
        // microphone and no dry stem to put it in: the speaker's own stream
        // already contains the player. Dropping it here rather than at every
        // later `if` means the writer below cannot accidentally mix one in.
        let mic = if loopback.is_some() { None } else { mic };
        if let Some(running) = self.recording_jam() {
            return Err(if running == jam_id {
                "a take is already recording".to_string()
            } else {
                format!("a take is already recording for another jam ({running})")
            });
        }
        if handoff.is_playing_back() {
            return Err("stop the take that is playing before recording another".into());
        }
        if out_sr == 0 {
            return Err("the audio output is not running, so there is no band to record".into());
        }
        let dir_name = safe_dir_name(jam_id)?;
        let created_at = now_ms();
        let id = created_at.to_string();
        let dir = takes_root(app_data).join(&dir_name);
        let path = dir.join(format!("{id}.wav"));
        if path.exists() {
            return Err("a take with this timestamp already exists".into());
        }

        let band_ring = Arc::new(TakeRing::new(out_sr as usize * RING_SECS));
        let stop = Arc::new(AtomicBool::new(false));
        let written = Arc::new(AtomicU64::new(0));

        // Stereo when the take is everything this computer plays, because
        // that is what came out of the speakers and a fold to mono would
        // throw away the one thing a musician notices about an amp
        // simulator's sound. Mono otherwise, exactly as before.
        let take_channels: u16 = if loopback.is_some() { 2 } else { 1 };
        let mut wav = TakeWavWriter::create_with(&path, out_sr, take_channels)
            .map_err(|e| format!("could not open the take for writing: {e}"))?;

        // The dry stem, when and only when there is a mic to put in it. A
        // take of the band alone would otherwise open a second file to write
        // silence into, and the review would find a stem with nothing in it
        // where it should find that there is no stem.
        let dry_path = mic.as_ref().map(|_| dry_beside(&path));
        let mut dry_wav = match &dry_path {
            Some(p) => match TakeWavWriter::create(p, out_sr) {
                Ok(w) => Some(w),
                Err(e) => {
                    // The mix's own file is open and belongs to nobody yet;
                    // a take that never started must not be left on disk.
                    // Closed before it is removed, because Windows refuses
                    // to delete a file somebody still has a handle on.
                    drop(wav);
                    let _ = fs::remove_file(&path);
                    return Err(format!(
                        "could not open the take's dry stem for writing: {e}"
                    ));
                }
            },
            None => None,
        };

        let band_for_writer = band_ring.clone();
        let handoff_for_writer = handoff.clone();
        let stop_for_writer = stop.clone();
        let written_for_writer = written.clone();
        let mic_for_writer = mic.clone();
        let path_for_writer = path.clone();
        let where_it_began: Arc<Mutex<Option<TakePosition>>> = Arc::new(Mutex::new(None));
        let position_for_writer = where_it_began.clone();
        let position_for_writer_fn = position;
        // The capture and the ring part company here: the ring goes to the
        // writer thread, the open stream stays with the take so that closing
        // the take closes the endpoint.
        let (loop_for_writer, capture, sound, sound_device) = match loopback {
            Some(lb) => (
                Some((lb.ring, lb.sample_rate, lb.channels)),
                lb.capture,
                TakeSound::Everything,
                Some(lb.device),
            ),
            None => (None, None, TakeSound::YamesAndInput, None),
        };
        let writer = std::thread::Builder::new()
            .name("yames-take-writer".into())
            .spawn(move || {
                // ---- The other kind of take ----
                //
                // A whole loop of its own rather than a flag threaded through
                // the one below, because almost nothing is shared: there is
                // no microphone to line up, no round trip to correct for, no
                // band to mix in, and the clock is the speaker's rather than
                // the output callback's. Two short readable loops, and the
                // take Yames has always made goes on being exactly the code
                // it was.
                if let Some((ring, in_sr, channels)) = loop_for_writer {
                    write_everything_this_computer_plays(EverythingWriter {
                        wav,
                        ring,
                        in_sr,
                        channels,
                        out_sr,
                        band: band_for_writer,
                        stop: stop_for_writer,
                        written: written_for_writer,
                        out_sr_watch,
                        handoff: handoff_for_writer,
                        position_slot: position_for_writer,
                        position_fn: position_for_writer_fn,
                        path: path_for_writer,
                    });
                    return;
                }
                let mut band_buf: Vec<f32> = Vec::with_capacity(out_sr as usize);
                let mut mic_raw: Vec<f32> = Vec::with_capacity(out_sr as usize);
                let mut mic_ready: VecDeque<f32> = VecDeque::with_capacity(out_sr as usize);
                let mut mixed: Vec<f32> = Vec::with_capacity(out_sr as usize);
                // The mic exactly as it goes into the mix, on its way to the
                // dry stem. Popped once, written twice.
                let mut dry: Vec<f32> = Vec::with_capacity(out_sr as usize);
                let mut resampler = mic_for_writer
                    .as_ref()
                    .map(|(_, in_sr)| LinearResampler::new(*in_sr, out_sr));
                let backlog = (out_sr as f64 * MIC_BACKLOG_SECS) as usize;
                let cap_samples = TAKE_MAX_SECS * out_sr as u64;
                // ---- Lining the mic up with the band ----
                //
                // Two separate offsets, both settled on the first chunk of
                // band that arrives, because that is the moment the take's
                // clock starts and the only moment either can be measured
                // against anything.
                //
                // 1. THE HEAD START. `begin_take_capture` runs before
                //    `session.start` has finished creating the file and
                //    handing the callback its ring, so by the time the band
                //    exists the mic ring already holds however long that
                //    took — ten to twenty-five milliseconds of the player
                //    tuning up, which nothing downstream ever absorbed. It
                //    is simply thrown away.
                //
                // 2. THE ROUND TRIP. The player is playing along with what
                //    they HEAR, which is the band a full output latency after
                //    the callback rendered it; their answer then takes an
                //    input latency to reach this thread. So the mic samples
                //    in hand at any moment are a response to band audio one
                //    round trip older than the band audio being written
                //    beside them, and mixing them as they come would put
                //    every note the musician played late by that much. The
                //    fix is to advance the mic — drop a round trip of it —
                //    which is exactly as much as it is behind.
                //
                //    A take therefore opens with a round trip of band with
                //    no mic under it, which is honest: the player had not
                //    heard anything yet.
                //
                //    The figure is under-measured rather than over: the
                //    input side is one driver buffer, with the converter and
                //    the bus unaccounted for (see
                //    `AudioInput::input_latency_us`). Being a little short
                //    leaves the player fractionally late, which is the right
                //    way round to be wrong — over-correcting would put their
                //    answer AHEAD of the beat they answered.
                let round_trip_samples =
                    (round_trip_us.saturating_mul(out_sr as u64) / 1_000_000) as usize;
                let mut band_started = false;
                let mut mic_skip = 0usize;

                loop {
                    let stopping = stop_for_writer.load(Ordering::Acquire);
                    // THE DEVICE CHANGED UNDER THE TAKE. Everything from
                    // here on would be rendered at a rate the file's header
                    // does not claim, so the rest of the take would play
                    // back at the wrong pitch with nothing in the file to
                    // say so. The honest guard is to finish here: what was
                    // recorded before the change is exactly what it says it
                    // is, and the musician gets a take that ends where the
                    // device did rather than one that goes sharp halfway
                    // through.
                    let live_sr = out_sr_watch
                        .as_ref()
                        .map_or(out_sr, |w| w.load(Ordering::Acquire));
                    if live_sr != 0 && live_sr != out_sr {
                        eprintln!(
                            "[take] {} ends here: the output moved from {out_sr} Hz to \
                             {live_sr} Hz mid-take",
                            path_for_writer.display()
                        );
                        stop_for_writer.store(true, Ordering::Release);
                        break;
                    }
                    band_buf.clear();
                    band_for_writer.drain_into(&mut band_buf);
                    if let (Some((ring, _)), Some(rs)) = (mic_for_writer.as_ref(), &mut resampler) {
                        mic_raw.clear();
                        ring.drain_into(&mut mic_raw);
                        rs.push(&mic_raw, &mut mic_ready);
                        // The mic's own clock is not the band's. If it runs
                        // ahead, throw the oldest away rather than let the
                        // queue grow for twenty minutes.
                        let over = mic_ready.len().saturating_sub(backlog);
                        if over > 0 {
                            mic_ready.drain(..over);
                            // Those were the oldest, which is what the
                            // alignment skip below wanted thrown away too.
                            mic_skip = mic_skip.saturating_sub(over);
                        }
                    }

                    if !band_buf.is_empty() {
                        if !band_started {
                            // The first band ever seen: the take's clock
                            // starts here. See the two offsets above.
                            band_started = true;
                            mic_ready.clear();
                            mic_skip = round_trip_samples;
                            // AND SO DOES THE MUSIC'S. This chunk begins with
                            // the first sample the callback ever pushed, so
                            // the stamp it left with it is where the piece
                            // was at sample zero of the file — not where it
                            // is now, twenty-five milliseconds later, and
                            // not where the frontend guessed it would be
                            // before `start_take` had returned.
                            if let Some(resolve) = position_for_writer_fn.as_ref() {
                                if let Some(at) = band_for_writer.start_transport() {
                                    if let Ok(mut slot) = position_for_writer.lock() {
                                        *slot = resolve(at);
                                    }
                                }
                            }
                        }
                        if mic_skip > 0 {
                            let n = mic_skip.min(mic_ready.len());
                            mic_ready.drain(..n);
                            mic_skip -= n;
                        }
                        let already = written_for_writer.load(Ordering::Relaxed);
                        let room = cap_samples.saturating_sub(already) as usize;
                        if room == 0 {
                            // THE CAP FINISHES THE TAKE; it does not go on
                            // quietly throwing audio away. Before this the
                            // writer sat in its loop with the band still
                            // being copied into a ring nobody was draining,
                            // and the only sign the user got was that the
                            // file had stopped growing — no message, and a
                            // stop button that appeared to work for as long
                            // as they left it.
                            eprintln!(
                                "[take] {} reached the {TAKE_MAX_SECS}s cap and finished there",
                                path_for_writer.display()
                            );
                            // The callback stops copying, so nothing fills a
                            // ring with no consumer and the drop counter
                            // below does not accuse the writer of falling
                            // behind when it had simply finished.
                            handoff_for_writer.set_record(None);
                            // The event loop turns this into `take-capped`;
                            // the writer may not `emit` any more than the
                            // audio thread may.
                            handoff_for_writer.note_capped();
                            // And the flag `stop_take` reads, so a stop that
                            // arrives afterwards finds a take already done
                            // rather than one it has to ask to finish.
                            stop_for_writer.store(true, Ordering::Release);
                            break;
                        }
                        let n = room.min(band_buf.len());
                        // ONE POP OF THE MIC QUEUE, TWO FILES. The stem is
                        // written before the mix so that a stem which stops
                        // short (a disk that filled) is the failure rather
                        // than a stem that claims samples the mix never got.
                        dry_chunk(&mut mic_ready, n, &mut dry);
                        let dry_failed = dry_wav
                            .as_mut()
                            .and_then(|w| w.push(&dry).err())
                            .is_some();
                        if dry_failed {
                            // The take itself is not lost over this: the mix
                            // keeps going and the stem ends where it ended.
                            // But it is FINISHED rather than abandoned — a
                            // WAV dropped mid-write still has forty-four
                            // bytes of zeroes where its header goes, and a
                            // stem the decoder refuses is worse beside a good
                            // take than a short one that plays.
                            if let Some(w) = dry_wav.take() {
                                eprintln!(
                                    "[take] the dry stem of {} stopped early",
                                    path_for_writer.display()
                                );
                                if let Err(e) = w.finish() {
                                    eprintln!("[take] and could not be closed: {e}");
                                }
                            }
                        }
                        mix_chunk(&band_buf[..n], &dry, &mut mixed);
                        if let Err(e) = wav.push(&mixed) {
                            eprintln!("[take] writing stopped: {e}");
                            break;
                        }
                        written_for_writer.fetch_add(mixed.len() as u64, Ordering::Release);
                    }

                    if stopping && band_buf.is_empty() {
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(WRITER_TICK_MS));
                }

                let dropped = band_for_writer.dropped()
                    + mic_for_writer.as_ref().map_or(0, |(r, _)| r.dropped());
                if dropped > 0 {
                    eprintln!(
                        "[take] {dropped} samples were dropped: the writer could not keep up \
                         with the audio threads"
                    );
                }
                if let Err(e) = wav.finish() {
                    eprintln!("[take] could not finish the WAV: {e}");
                }
                if let Some(w) = dry_wav {
                    if let Err(e) = w.finish() {
                        eprintln!("[take] could not finish the dry stem: {e}");
                    }
                }
            })
            .map_err(|e| {
                // The writer owned the open files and has just been dropped
                // with them, leaving a 44-byte WAV of nothing. A take that
                // never started must not appear in the list.
                let _ = fs::remove_file(&path);
                if let Some(p) = &dry_path {
                    let _ = fs::remove_file(p);
                }
                format!("could not start the take writer: {e}")
            })?;

        // Only now does anything start recording: the ring the callback is
        // about to write into has a thread draining it, and the file it
        // drains to is open.
        handoff.set_record(Some(band_ring.clone()));

        self.active = Some(ActiveTake {
            jam_id: jam_id.to_string(),
            id,
            path,
            dry_path,
            created_at,
            band_ring,
            stop,
            written,
            out_sr,
            owns_input,
            position: where_it_began,
            writer: Some(writer),
            sound,
            sound_device,
            capture,
        });
        Ok(())
    }

    /// Finish the take and write its sidecar. `None` when nothing was
    /// recording, which is not an error: a stop with no take running is what
    /// a UI sends when the user pressed stop twice.
    /// Samples the writer has committed so far. Tests wait on this instead
    /// of on the clock, because a loaded machine schedules the writer when
    /// it likes and a sleep only ever guessed.
    #[cfg(test)]
    fn written_samples(&self) -> u64 {
        self.active
            .as_ref()
            .map_or(0, |a| a.written.load(Ordering::Acquire))
    }

    /// Has the writer decided the take is over (the cap, a device change)?
    #[cfg(test)]
    fn writer_finished(&self) -> bool {
        self.active
            .as_ref()
            .map_or(true, |a| a.stop.load(Ordering::Acquire))
    }

    pub fn stop(&mut self, handoff: &SharedTake) -> Result<Option<JamTake>, String> {
        let Some(mut active) = self.active.take() else {
            return Ok(None);
        };
        // The callback stops writing FIRST, so the writer's last drain is
        // the last of the audio and nothing arrives after the file is shut.
        handoff.set_record(None);
        active.stop.store(true, Ordering::Release);
        if let Some(handle) = active.writer.take() {
            let _ = handle.join();
        }
        handoff.drain_retired();

        let samples = active.written.load(Ordering::Acquire);
        let duration_sec = samples as f64 / active.out_sr.max(1) as f64;
        let record = JamTake {
            id: active.id.clone(),
            jam_id: active.jam_id.clone(),
            created_at: active.created_at,
            duration_sec,
            path: active.path.to_string_lossy().into_owned(),
            // Only if it is actually there: the writer gives the stem up
            // rather than the take when a disk goes wrong, and a record
            // naming a file that is not there is a review that cannot
            // explain itself.
            dry_path: active
                .dry_path
                .as_ref()
                .filter(|p| p.is_file())
                .map(|p| p.to_string_lossy().into_owned()),
            // The writer has been joined, so whatever it captured on its
            // first chunk of band is final.
            position: active
                .position
                .lock()
                .map(|p| *p)
                .unwrap_or_else(|e| *e.into_inner()),
            // The picture is the webview's, and it is still being written when
            // this runs: `take_video_finish` files it under this take's id and
            // patches this very sidecar afterwards. So the record the engine
            // hands back says there is no video, which is true at this instant,
            // and the shelf learns otherwise from the disk on its next read.
            video_path: None,
            video_bytes: None,
            // ...and no thumbnail either: the frame is grabbed by the
            // webview from the preview and written after the take is named.
            thumb_path: None,
            video_offset_ms: None,
            sound: active.sound,
            sound_device: active.sound_device.clone(),
        };
        // The endpoint goes back to the operating system HERE, the moment the
        // writer has been joined and the file is closed — not when the screen
        // gets round to noticing. Nothing is listening to the speakers between
        // one take and the next.
        if let Some(mut capture) = active.capture.take() {
            capture.stop();
        }

        // An empty take is a take of nothing — the user pressed record and
        // stop without the band playing. Keeping a 44-byte WAV in the list
        // would be a row that plays silence — and a dry stem with no take
        // beside it is worse than that: a recording of the player that
        // nothing in the app lists or can delete.
        if samples == 0 {
            let _ = fs::remove_file(&active.path);
            if let Some(p) = &active.dry_path {
                let _ = fs::remove_file(p);
            }
            return Ok(None);
        }

        let sidecar = active.path.with_extension("json");
        match serde_json::to_string_pretty(&record) {
            Ok(text) => {
                if let Err(e) = fs::write(&sidecar, text) {
                    // The audio is on disk and that is the part that matters;
                    // `list_takes` rebuilds a record from the file itself.
                    eprintln!("[take] could not write the sidecar: {e}");
                }
            }
            Err(e) => eprintln!("[take] could not serialise the take record: {e}"),
        }
        let _ = active.band_ring;
        Ok(Some(record))
    }
}

/// Now, in milliseconds since the epoch — the shape every timestamp the
/// frontend holds is written in.
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `TakeStart` with the plain answers: no round trip to correct, no
    /// engine to watch, and an input the take did not open. The tests that
    /// care about one of those pass it explicitly.
    fn plain<'a>(
        root: &'a Path,
        jam: &'a str,
        handoff: &'a SharedTake,
        mic: Option<(Arc<TakeRing>, u32)>,
        out_sr: u32,
    ) -> TakeStart<'a> {
        TakeStart {
            app_data: root,
            jam_id: jam,
            handoff,
            mic,
            out_sr,
            round_trip_us: 0,
            out_sr_watch: None,
            owns_input: false,
            position: None,
            loopback: None,
        }
    }

    fn tmp_dir(name: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "yames-take-test-{}-{}",
            name,
            crate::clock::now_ns()
        ));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        base
    }

    /// Poll a fact until it is true, or give up.
    ///
    /// The deadline is a HANG-CATCHER and not a performance gate: what is
    /// being waited for takes the writer thread a few milliseconds, and the
    /// only thing a failure here can mean is that it never happened at all.
    /// It was four seconds, which is a number a laptop running four workers
    /// and a cargo build can reach without anything being wrong — and a test
    /// that fails because somebody else was compiling is a test that gets
    /// deleted. Sixty seconds is still three orders of magnitude past the
    /// work, and a thread that never wrote never will.
    fn wait_until(what: &str, mut ready: impl FnMut() -> bool) {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);
        while !ready() {
            assert!(
                std::time::Instant::now() < deadline,
                "waited a minute for {what} — it is not slow, it never happened"
            );
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
    }

    // ---- The ring ----

    #[test]
    fn the_ring_gives_back_what_was_put_in_it() {
        let ring = TakeRing::new(64);
        ring.push(&[0.25, -0.5, 0.75]);
        let mut out = Vec::new();
        assert_eq!(ring.drain_into(&mut out), 3);
        assert_eq!(out, vec![0.25, -0.5, 0.75]);
        // And the ring is empty again, not repeating itself.
        out.clear();
        assert_eq!(ring.drain_into(&mut out), 0);
    }

    #[test]
    fn the_ring_takes_one_channel_of_an_interleaved_buffer() {
        let ring = TakeRing::new(64);
        // Stereo, the same sample duplicated across channels the way the
        // callback writes it.
        ring.push_strided(&[1.0, 1.0, 2.0, 2.0, 3.0, 3.0], 2);
        let mut out = Vec::new();
        ring.drain_into(&mut out);
        assert_eq!(out, vec![1.0, 2.0, 3.0]);
    }

    #[test]
    fn the_ring_wraps_round_and_stays_in_order() {
        let ring = TakeRing::new(8);
        let mut out = Vec::new();
        // Five rounds of six samples through an eight-sample ring: every one
        // of them has to come out, in order, because the consumer keeps up.
        let mut expected = Vec::new();
        for round in 0..5 {
            let chunk: Vec<f32> = (0..6).map(|i| (round * 6 + i) as f32).collect();
            ring.push(&chunk);
            expected.extend_from_slice(&chunk);
            ring.drain_into(&mut out);
        }
        assert_eq!(out, expected);
        assert_eq!(ring.dropped(), 0);
    }

    #[test]
    fn a_ring_nobody_drains_drops_rather_than_overwrites() {
        // The producer is an audio callback: it cannot wait and it cannot
        // grow the buffer, so the only honest thing left is to drop and say
        // so. What it must NOT do is overwrite samples the consumer has not
        // read, which would corrupt the take rather than shorten it.
        let ring = TakeRing::new(4);
        ring.push(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
        assert_eq!(ring.dropped(), 2);
        let mut out = Vec::new();
        ring.drain_into(&mut out);
        assert_eq!(out, vec![1.0, 2.0, 3.0, 4.0], "the oldest survive intact");
    }

    #[test]
    fn resetting_a_ring_forgets_everything_including_the_drops() {
        let ring = TakeRing::new(4);
        ring.push(&[1.0, 2.0, 3.0, 4.0, 5.0]);
        assert_eq!(ring.dropped(), 1);
        ring.reset();
        assert_eq!(ring.dropped(), 0);
        let mut out = Vec::new();
        assert_eq!(ring.drain_into(&mut out), 0);
    }

    #[test]
    fn the_ring_carries_a_second_of_audio_between_two_real_threads() {
        // The shape the take actually runs in: one thread pushing in
        // callback-sized buffers, one draining on a timer, and every sample
        // arriving exactly once and in order.
        let ring = Arc::new(TakeRing::new(48_000 * RING_SECS));
        let producer = ring.clone();
        let total = 48_000usize;
        let handle = std::thread::spawn(move || {
            let mut n = 0usize;
            while n < total {
                let chunk: Vec<f32> = (n..(n + 480).min(total)).map(|i| i as f32).collect();
                producer.push(&chunk);
                n += chunk.len();
                std::thread::sleep(std::time::Duration::from_micros(200));
            }
        });
        let mut out: Vec<f32> = Vec::with_capacity(total);
        while out.len() < total {
            ring.drain_into(&mut out);
            std::thread::sleep(std::time::Duration::from_millis(1));
        }
        handle.join().unwrap();
        ring.drain_into(&mut out);
        assert_eq!(ring.dropped(), 0, "a four-second ring should never overflow");
        assert_eq!(out.len(), total);
        for (i, v) in out.iter().enumerate() {
            assert_eq!(*v, i as f32, "sample {i} came out of order");
        }
    }

    // ---- The resampler ----

    fn sine(freq: f64, sr: u32, secs: f64) -> Vec<f32> {
        let n = (sr as f64 * secs) as usize;
        (0..n)
            .map(|i| ((i as f64 / sr as f64) * freq * std::f64::consts::TAU).sin() as f32)
            .collect()
    }

    #[test]
    fn the_take_writer_resamples_within_a_hair() {
        // The case the brief names: a 44.1 kHz mic against a 48 kHz output.
        const IN_SR: u32 = 44_100;
        const OUT_SR: u32 = 48_000;
        const FREQ: f64 = 440.0;
        let input = sine(FREQ, IN_SR, 0.5);
        let mut rs = LinearResampler::new(IN_SR, OUT_SR);
        let mut out: VecDeque<f32> = VecDeque::new();
        // Pushed in callback-sized chunks, because a resampler that is only
        // correct when handed the whole signal at once is no use here.
        for chunk in input.chunks(512) {
            rs.push(chunk, &mut out);
        }
        let got: Vec<f32> = out.into_iter().collect();

        // The right amount of audio came out: half a second at the output
        // rate, to within the tail the resampler is still holding.
        let want_len = (OUT_SR as f64 * 0.5) as usize;
        assert!(
            (got.len() as i64 - want_len as i64).abs() <= 4,
            "0.5 s of 44.1 kHz should be {want_len} samples at 48 kHz, got {}",
            got.len()
        );

        // And it is the same tone. Compared against an ideal 440 Hz sine at
        // the output rate, skipping the first and last few samples where the
        // phase reference and the interpolation tail disagree by a fraction
        // of a sample.
        let ideal = sine(FREQ, OUT_SR, 0.5);
        let from = 64;
        let to = got.len().min(ideal.len()) - 64;
        let mut err = 0.0f64;
        let mut sig = 0.0f64;
        for i in from..to {
            let d = (got[i] - ideal[i]) as f64;
            err += d * d;
            sig += (ideal[i] as f64) * (ideal[i] as f64);
        }
        let rms = (err / (to - from) as f64).sqrt();
        let db = 10.0 * (err / sig.max(1e-30)).log10();
        eprintln!("[take] 44.1 -> 48 kHz resampling error: {rms:.6} RMS, {db:.1} dB");
        assert!(
            rms < 0.005,
            "the resampler is {rms:.6} RMS off a 440 Hz tone ({db:.1} dB), which is \
             audible"
        );
    }

    #[test]
    fn matching_rates_are_a_copy_and_not_an_interpolation() {
        let mut rs = LinearResampler::new(48_000, 48_000);
        assert!(rs.is_identity());
        let input: Vec<f32> = (0..1000).map(|i| (i as f32) / 1000.0).collect();
        let mut out: VecDeque<f32> = VecDeque::new();
        for chunk in input.chunks(97) {
            rs.push(chunk, &mut out);
        }
        let got: Vec<f32> = out.into_iter().collect();
        // Everything but the sample still held for the next chunk.
        assert_eq!(got.len(), input.len() - 1);
        for (i, v) in got.iter().enumerate() {
            assert_eq!(*v, input[i], "sample {i} was changed by a resampler that should \
                                      not have run");
        }
    }

    #[test]
    fn downsampling_a_mic_that_runs_faster_than_the_output() {
        // 48 kHz mic, 44.1 kHz output — the other way round, which is the
        // case a linear interpolator is worse at because it does not
        // band-limit. At 440 Hz there is nothing above the new Nyquist to
        // alias, which is why this is still fine for a take.
        let input = sine(440.0, 48_000, 0.25);
        let mut rs = LinearResampler::new(48_000, 44_100);
        let mut out: VecDeque<f32> = VecDeque::new();
        for chunk in input.chunks(256) {
            rs.push(chunk, &mut out);
        }
        let got: Vec<f32> = out.into_iter().collect();
        let want = (44_100.0 * 0.25) as usize;
        assert!(
            (got.len() as i64 - want as i64).abs() <= 4,
            "expected about {want} samples, got {}",
            got.len()
        );
        let ideal = sine(440.0, 44_100, 0.25);
        let to = got.len().min(ideal.len()) - 64;
        let err: f64 = (64..to)
            .map(|i| ((got[i] - ideal[i]) as f64).powi(2))
            .sum::<f64>()
            / (to - 64) as f64;
        assert!(err.sqrt() < 0.005, "downsampling is {} RMS off", err.sqrt());
    }

    // ---- The mix ----

    /// The writer's two lines, as one call, the way the loop does it.
    fn mix(band: &[f32], mic: &mut VecDeque<f32>) -> (Vec<f32>, Vec<f32>) {
        let (mut dry, mut out) = (Vec::new(), Vec::new());
        dry_chunk(mic, band.len(), &mut dry);
        mix_chunk(band, &dry, &mut out);
        (out, dry)
    }

    #[test]
    fn the_take_is_the_mic_and_the_band_at_unity() {
        let band = [0.25f32, -0.25, 0.5];
        let mut mic: VecDeque<f32> = VecDeque::from(vec![0.25f32, 0.25, -0.5]);
        let (out, _) = mix(&band, &mut mic);
        assert_eq!(out, vec![0.5, 0.0, 0.0]);
    }

    #[test]
    fn the_band_is_the_clock_and_a_missing_mic_is_silence() {
        // A mic that has not started, or has fallen behind, must not stretch
        // or stall the take: the band's own length is the take's length.
        let band = [0.1f32, 0.2, 0.3, 0.4];
        let mut mic: VecDeque<f32> = VecDeque::from(vec![0.5f32]);
        let (out, dry) = mix(&band, &mut mic);
        assert_eq!(out.len(), 4);
        assert!((out[0] - 0.6).abs() < 1e-6);
        assert_eq!(&out[1..], &[0.2, 0.3, 0.4]);
        // And the stem is the same length, silence-padded, so the two files
        // stay sample-for-sample.
        assert_eq!(dry, vec![0.5, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn a_hot_mic_over_a_loud_band_clamps_rather_than_wrapping() {
        let band = [0.9f32, -0.9];
        let mut mic: VecDeque<f32> = VecDeque::from(vec![0.9f32, -0.9]);
        let (out, dry) = mix(&band, &mut mic);
        assert_eq!(out, vec![1.0, -1.0]);
        // THE STEM IS NOT CLAMPED. The mix is what you listen to and a
        // clamp there is honest; the stem is what a tracker measures and a
        // clamp there is a waveform nobody played.
        assert_eq!(dry, vec![0.9, -0.9]);
    }

    #[test]
    fn the_mic_queue_is_popped_once_for_both_files() {
        // The one way the stem and the mix could ever drift apart is two
        // places popping this queue. They are handed the same `dry`.
        let band = [0.0f32; 5];
        let mut mic: VecDeque<f32> = VecDeque::from(vec![1.0f32, 2.0, 3.0, 4.0, 5.0, 6.0]);
        let (out, dry) = mix(&band, &mut mic);
        assert_eq!(dry, vec![1.0, 2.0, 3.0, 4.0, 5.0]);
        assert_eq!(out.len(), 5);
        assert_eq!(mic.len(), 1, "only the band's worth may be taken");
    }

    // ---- The WAV ----

    #[test]
    fn a_take_is_a_wav_that_reads_back_as_what_was_written() {
        let dir = tmp_dir("roundtrip");
        let path = dir.join("42.wav");
        let mut w = TakeWavWriter::create(&path, 48_000).unwrap();
        let tone = sine(440.0, 48_000, 0.1);
        for chunk in tone.chunks(333) {
            w.push(chunk).unwrap();
        }
        let (written, samples) = w.finish().unwrap();
        assert_eq!(written, path);
        assert_eq!(samples as usize, tone.len());

        let bytes = fs::read(&path).unwrap();
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(bytes.len(), 44 + tone.len() * 2);
        let (pcm, sr) = decode_wav_bytes(&bytes).unwrap();
        assert_eq!(sr, 48_000);
        assert_eq!(pcm.len(), tone.len());
        // 16-bit quantisation, so the tolerance is one LSB and not zero.
        for (i, (a, b)) in pcm.iter().zip(tone.iter()).enumerate() {
            assert!(
                (a - b).abs() < 1.0 / 32767.0 * 2.0,
                "sample {i}: {a} came back for {b}"
            );
        }
    }

    #[test]
    fn a_file_that_is_not_one_of_ours_is_refused_rather_than_guessed_at() {
        assert!(decode_wav_bytes(b"not a wav at all, not even close").is_err());
        // Stereo used to be refused here, and is now one of ours: a take of
        // everything this computer plays keeps both sides (W30,
        // `a_stereo_take_plays_back_through_the_engine_as_one_signal`). What
        // is still refused is everything past two — nothing writes a
        // six-channel take, so a file claiming to be one is a file from
        // somewhere else, and guessing at its layout is how you play
        // somebody's surround mix back as a chipmunk.
        let mut surround = wav_header_16bit(48_000, 6, 1).to_vec();
        surround.extend_from_slice(&[0u8; 12]);
        let err = decode_wav_bytes(&surround).expect_err("six channels is not a take");
        assert!(err.contains("mono or stereo"), "{err}");
        // And so is a bit depth we never write.
        let mut deep = wav_header_16bit(48_000, 1, 1).to_vec();
        deep[34] = 24;
        deep.extend_from_slice(&[0u8; 4]);
        assert!(decode_wav_bytes(&deep).is_err());
    }

    // ---- The names on disk ----

    #[test]
    fn a_jam_id_cannot_write_outside_the_takes_directory() {
        for bad in ["../../etc", "a/b", "a\\b", ".", "..", "   ", ""] {
            match safe_dir_name(bad) {
                Ok(name) => {
                    assert!(
                        !name.contains('/') && !name.contains('\\') && name != ".." && name != ".",
                        "{bad:?} became {name:?}, which is a path and not a name"
                    );
                }
                Err(_) => {}
            }
        }
        // The readable half is still the id, so a musician looking in the
        // folder can tell what they are looking at.
        assert!(safe_dir_name("jam-17a3f").unwrap().starts_with("jam-17a3f-"));
        assert!(safe_dir_name("../../etc").unwrap().starts_with(".._.._etc-"));
        assert!(safe_dir_name("").is_err());
        assert!(safe_dir_name("..").is_err());
    }

    /// TWO JAMS MUST NOT SHARE A TAKES DIRECTORY.
    ///
    /// The bug this pins: the character rule maps everything it does not
    /// like onto `_`, and that is not one-to-one. Two jams whose ids differ
    /// only where a space or a slash or a colon sits landed in the same
    /// folder, so one jam listed the other jam's takes — and `delete_take`,
    /// which scans every jam directory for the id, would reach into a jam
    /// nobody had named.
    #[test]
    fn two_jam_ids_cannot_collapse_onto_one_takes_directory() {
        let colliding = [
            ("my jam", "my/jam"),
            ("a:b", "a b"),
            ("set_1", "set 1"),
            ("x?y", "x*y"),
        ];
        for (a, b) in colliding {
            let (na, nb) = (safe_dir_name(a).unwrap(), safe_dir_name(b).unwrap());
            assert_eq!(
                sanitised(a).unwrap(),
                sanitised(b).unwrap(),
                "{a:?} and {b:?} should be the pair the character rule confuses"
            );
            assert_ne!(na, nb, "{a:?} and {b:?} both became {na:?}");
            // And still a name, not a path.
            for n in [&na, &nb] {
                assert!(!n.contains('/') && !n.contains('\\') && !n.contains(".."));
            }
        }

        // The same id twice is the same directory, or a take saved today
        // would be in a folder nobody looks in tomorrow.
        assert_eq!(safe_dir_name("blues").unwrap(), safe_dir_name("blues").unwrap());
        assert_eq!(safe_dir_name(" blues ").unwrap(), safe_dir_name("blues").unwrap());
    }

    /// A SONG'S ID IS A TAKE KEY, AND THIS MODULE NEEDED NOTHING FOR IT.
    ///
    /// Songs records takes too (`W14-MOUNTING.md` item 2) and files them under
    /// the song's id rather than a jam's. Nothing here has to change for that,
    /// and this is the assertion that says so rather than leaving it to be
    /// rediscovered: the id is an OPAQUE string everywhere in this file, and
    /// `src/songs/import.ts`'s `songId` is sixteen lowercase hex characters,
    /// which the character rule passes through untouched.
    ///
    /// The half that is worth a test rather than a comment is the last line:
    /// a song and a jam can never share a folder unless a player has named a
    /// jam with sixteen hex digits, and even then they would have to be the
    /// SAME sixteen.
    #[test]
    fn a_song_id_is_a_take_key_this_module_already_accepts() {
        // Two ids of the shape `songId` mints, from the fixtures' own hashes.
        for id in ["1c0f3a9b7e2d4506", "00000000ffffffff"] {
            let name = safe_dir_name(id).expect("a song id is a take key");
            assert_eq!(sanitised(id).unwrap(), id, "{id:?} was rewritten on the way in");
            assert!(name.starts_with(&format!("{id}-")), "{id:?} became {name:?}");
            assert!(!name.contains('/') && !name.contains('\\') && !name.contains(".."));
            // And addressable as a take id too, which is what `delete_take`
            // and `play_take` take — the stem rule refuses anything it had to
            // change, and this changed nothing.
            assert_eq!(safe_stem(id).unwrap(), id);
        }
        assert_ne!(
            safe_dir_name("1c0f3a9b7e2d4506").unwrap(),
            safe_dir_name("blues").unwrap(),
        );
    }

    /// End to end: two jams whose ids the character rule confuses keep their
    /// own takes, and neither can see the other's.
    #[test]
    fn takes_of_two_confusable_jams_do_not_mix() {
        let root = tmp_dir("collide");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        for jam in ["my jam", "my/jam"] {
            let mut session = TakeSession::default();
            session
                .start(plain(&root, jam, &handoff, None, 48_000))
                .expect("start");
            let ring = {
                let mut seen = 0u64;
                handoff.poll_record(&mut seen).unwrap().unwrap()
            };
            for _ in 0..6 {
                ring.push(&[0.3f32; 480]);
                std::thread::sleep(std::time::Duration::from_millis(2));
            }
            session.stop(&handoff).unwrap().expect("a take");
        }
        assert_eq!(list_takes(&root, "my jam").unwrap().len(), 1);
        assert_eq!(list_takes(&root, "my/jam").unwrap().len(), 1);
        assert_ne!(
            list_takes(&root, "my jam").unwrap()[0].path,
            list_takes(&root, "my/jam").unwrap()[0].path,
            "each jam keeps its own take"
        );
    }

    #[test]
    fn a_take_id_has_to_be_the_id_it_claims_to_be() {
        // Ids this module writes are milliseconds. Anything that had to be
        // sanitised to become a name was not one of ours, and resolving it
        // to the nearest legal name would be guessing.
        assert!(safe_stem("1757640000000").is_ok());
        assert!(safe_stem("../secrets").is_err());
        assert!(safe_stem("a/b").is_err());
    }

    // ---- Listing, deleting ----

    fn write_take(root: &Path, jam: &str, id: &str, secs: f64) -> PathBuf {
        // Through `safe_dir_name`, not the raw id: that is where the takes
        // of a jam actually live, and a helper that guessed at the layout
        // would keep passing while the real one moved.
        let dir = root.join(TAKES_DIR).join(safe_dir_name(jam).unwrap());
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{id}.wav"));
        let mut w = TakeWavWriter::create(&path, 48_000).unwrap();
        w.push(&vec![0.0f32; (48_000.0 * secs) as usize]).unwrap();
        w.finish().unwrap();
        let record = JamTake {
            id: id.to_string(),
            jam_id: jam.to_string(),
            created_at: id.parse().unwrap_or(0),
            duration_sec: secs,
            path: path.to_string_lossy().into_owned(),
            dry_path: None,
            position: None,
            video_path: None,
            video_bytes: None,
            thumb_path: None,
            video_offset_ms: None,
            sound: TakeSound::default(),
            sound_device: None,
        };
        fs::write(
            path.with_extension("json"),
            serde_json::to_string(&record).unwrap(),
        )
        .unwrap();
        path
    }

    #[test]
    fn the_takes_of_a_jam_come_back_newest_first() {
        let root = tmp_dir("list");
        write_take(&root, "blues", "1000", 1.0);
        write_take(&root, "blues", "3000", 2.0);
        write_take(&root, "blues", "2000", 1.5);
        write_take(&root, "bossa", "9000", 1.0);

        let takes = list_takes(&root, "blues").unwrap();
        assert_eq!(
            takes.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
            vec!["3000", "2000", "1000"]
        );
        assert!(takes.iter().all(|t| t.jam_id == "blues"));
        // A jam with no takes is an empty list, not an error.
        assert!(list_takes(&root, "nothing-here").unwrap().is_empty());
    }

    #[test]
    fn a_take_whose_label_was_lost_is_still_listed() {
        let root = tmp_dir("orphan");
        let path = write_take(&root, "blues", "1757640000000", 2.0);
        fs::remove_file(path.with_extension("json")).unwrap();
        let takes = list_takes(&root, "blues").unwrap();
        assert_eq!(takes.len(), 1, "losing the sidecar must not lose the take");
        assert_eq!(takes[0].id, "1757640000000");
        assert_eq!(takes[0].created_at, 1_757_640_000_000);
        assert!(
            (takes[0].duration_sec - 2.0).abs() < 0.01,
            "the length should be read off the file: {}",
            takes[0].duration_sec
        );
    }

    /// THE LENGTH OF A TAKE IS READ, NOT COUNTED.
    ///
    /// The bug this pins: `duration_of` pulled the whole WAV into memory to
    /// divide its length by two. `list_takes` calls it once for every take
    /// that lost its sidecar, with a screen waiting — twenty minutes at
    /// 48 kHz is 115 MB, so a directory of those was a hundred megabytes a
    /// row off the disk to learn a number the first 44 bytes already carry.
    ///
    /// The rule is a function of the size on disk and the header. The body
    /// is not one of its arguments, which is the part that could not have
    /// been true before.
    #[test]
    fn the_length_of_a_take_comes_from_its_size_and_its_header() {
        let h = crate::session_audio::wav_header_mono_16bit(48_000, 0);

        // Two seconds: 48000 samples a second, two bytes each, plus header.
        assert!((duration_from(44 + 48_000 * 2 * 2, &h) - 2.0).abs() < 1e-9);
        // The same header over a twenty-minute file, which is the size that
        // made reading the body expensive.
        let twenty = 44 + 48_000u64 * 2 * TAKE_MAX_SECS;
        assert!((duration_from(twenty, &h) - TAKE_MAX_SECS as f64).abs() < 1e-9);

        // A header at another rate, same size, is another length.
        let h44 = crate::session_audio::wav_header_mono_16bit(44_100, 0);
        assert!((duration_from(44 + 44_100 * 2, &h44) - 1.0).abs() < 1e-9);

        // Nothing at all, and a header that says 0 Hz, are zero rather than
        // a divide by nothing.
        assert_eq!(duration_from(0, &h), 0.0);
        assert_eq!(duration_from(1_000_000, &[0u8; 44]), 0.0);
    }

    #[test]
    fn deleting_a_take_removes_the_audio_and_its_label() {
        let root = tmp_dir("delete");
        let path = write_take(&root, "blues", "1000", 1.0);
        let sidecar = path.with_extension("json");
        assert!(path.exists() && sidecar.exists());
        delete_take(&root, "1000").unwrap();
        assert!(!path.exists(), "the audio should be gone");
        assert!(!sidecar.exists(), "and so should its label");
        // And deleting it again says so rather than pretending.
        assert!(delete_take(&root, "1000").is_err());
    }

    // ---- The dry stem ----

    /// Write a dry stem beside a take the way the writer would.
    fn write_dry(take: &Path, secs: f64) -> PathBuf {
        let path = dry_beside(take);
        let mut w = TakeWavWriter::create(&path, 48_000).unwrap();
        w.push(&vec![0.5f32; (48_000.0 * secs) as usize]).unwrap();
        w.finish().unwrap();
        path
    }

    #[test]
    fn a_dry_stem_is_listed_as_part_of_its_take_and_not_as_a_take() {
        let root = tmp_dir("dry-list");
        let take = write_take(&root, "blues", "1000", 0.5);
        let dry = write_dry(&take, 0.5);
        let listed = list_takes(&root, "blues").unwrap();
        assert_eq!(listed.len(), 1, "the stem must not be a row of its own");
        assert_eq!(listed[0].id, "1000");
        assert_eq!(listed[0].dry_path.as_deref(), Some(&*dry.to_string_lossy()));
    }

    #[test]
    fn a_take_with_no_stem_beside_it_says_so() {
        let root = tmp_dir("dry-absent");
        write_take(&root, "blues", "1000", 0.5);
        let listed = list_takes(&root, "blues").unwrap();
        assert_eq!(listed[0].dry_path, None);
    }

    /// A SIDECAR WRITTEN BEFORE THE STEM EXISTED MUST NOT HIDE ONE.
    ///
    /// Every take already on a musician's disk has a sidecar with no
    /// `dryPath` in it. The list reads that field off the FILE SYSTEM and
    /// not off the record for exactly this reason — and `dryPath` is
    /// `#[serde(default)]` so the old records still parse at all.
    #[test]
    fn the_list_reads_the_stem_off_the_disk_and_not_off_the_record() {
        let root = tmp_dir("dry-old-record");
        let take = write_take(&root, "blues", "1000", 0.5);
        let dry = write_dry(&take, 0.5);
        let text = fs::read_to_string(take.with_extension("json")).unwrap();
        assert!(!text.contains("dryPath"), "the helper writes an old sidecar");
        let listed = list_takes(&root, "blues").unwrap();
        assert_eq!(listed[0].dry_path.as_deref(), Some(&*dry.to_string_lossy()));
    }

    /// A RECORDING OF THE PLAYER MAY NOT SURVIVE THE TAKE IT BELONGS TO.
    ///
    /// Nothing in the app lists a stem on its own, so one left behind by a
    /// delete is audio of somebody playing that they cannot see and cannot
    /// remove. That is the one thing an opt-in recording feature is not
    /// allowed to do.
    #[test]
    fn deleting_a_take_takes_its_dry_stem_with_it() {
        let root = tmp_dir("dry-delete");
        let take = write_take(&root, "blues", "1000", 0.5);
        let dry = write_dry(&take, 0.5);
        assert!(dry.exists());
        delete_take(&root, "1000").unwrap();
        assert!(!take.exists());
        assert!(!dry.exists(), "the dry stem outlived the take it belongs to");
    }

    #[test]
    fn a_dry_stem_cannot_be_addressed_as_a_take_of_its_own() {
        let root = tmp_dir("dry-address");
        let take = write_take(&root, "blues", "1000", 0.5);
        let dry = write_dry(&take, 0.5);
        // Deleting "1000.dry" must not take the stem out from under the
        // take, leaving a row in the list claiming one that is not there.
        assert!(delete_take(&root, "1000.dry").is_err());
        assert!(dry.exists());
        assert!(load_take(&root, "1000.dry").is_err());
        assert!(take.exists());
    }

    // ---- The thumbnail (W25) ----

    /// One frame of the picture, beside the take, the way the webview writes
    /// it. The bytes are not a JPEG and nothing here decodes one: what is
    /// being tested is that a file with this NAME is part of its take.
    fn write_thumb(take: &Path) -> PathBuf {
        let path = thumb_beside(take).unwrap();
        fs::write(&path, b"a frame").unwrap();
        path
    }

    #[test]
    fn a_thumbnail_is_listed_as_part_of_its_take_and_not_as_a_take() {
        let root = tmp_dir("thumb-list");
        let take = write_take(&root, "blues", "1000", 0.5);
        let thumb = write_thumb(&take);
        let listed = list_takes(&root, "blues").unwrap();
        assert_eq!(listed.len(), 1, "the frame must not be a row of its own");
        assert_eq!(
            listed[0].thumb_path.as_deref(),
            Some(&*thumb.to_string_lossy())
        );
    }

    /// Off the DISK and not off the record, like the stem and the picture:
    /// every take already on a musician's disk was recorded before
    /// thumbnails existed, and a sidecar with no `thumbPath` in it must not
    /// hide one written later.
    #[test]
    fn a_take_with_no_frame_beside_it_says_so() {
        let root = tmp_dir("thumb-absent");
        write_take(&root, "blues", "1000", 0.5);
        assert_eq!(list_takes(&root, "blues").unwrap()[0].thumb_path, None);
    }

    /// A FRAME OF THE PLAYER MAY NOT SURVIVE THE TAKE IT BELONGS TO.
    ///
    /// The same rule as the picture it was cut from, and the same reason: a
    /// shelf that still showed somebody's face after they deleted the take
    /// is the promise broken in miniature.
    #[test]
    fn deleting_a_take_takes_its_thumbnail_with_it() {
        let root = tmp_dir("thumb-delete");
        let take = write_take(&root, "blues", "1000", 0.5);
        let thumb = write_thumb(&take);
        assert!(thumb.exists());
        delete_take(&root, "1000").unwrap();
        assert!(!thumb.exists(), "the frame outlived the take it belongs to");
    }

    #[test]
    fn a_thumbnail_cannot_be_addressed_as_a_take_of_its_own() {
        let root = tmp_dir("thumb-address");
        let take = write_take(&root, "blues", "1000", 0.5);
        let thumb = write_thumb(&take);
        assert!(delete_take(&root, "1000.thumb").is_err());
        assert!(thumb.exists());
        assert!(load_take(&root, "1000.thumb").is_err());
        assert!(take.exists());
    }

    #[test]
    fn the_size_on_disk_counts_the_stem_as_well_as_the_take() {
        let root = tmp_dir("dry-size");
        let take = write_take(&root, "blues", "1000", 1.0);
        let before = takes_dir_size(&root);
        write_dry(&take, 1.0);
        let after = takes_dir_size(&root);
        assert!(
            after > before + 90_000,
            "a second of 16-bit 48 kHz is 96 kB; the size went {before} → {after}"
        );
    }

    #[test]
    fn a_take_is_found_whichever_jam_it_belongs_to() {
        let root = tmp_dir("find");
        write_take(&root, "blues", "1000", 0.5);
        write_take(&root, "bossa", "2000", 0.5);
        assert!(load_take(&root, "1000").is_ok());
        assert!(load_take(&root, "2000").is_ok());
        assert!(load_take(&root, "3000").is_err());
    }

    #[test]
    fn a_take_loads_at_the_rate_it_was_recorded_at() {
        let root = tmp_dir("load");
        let dir = root.join(TAKES_DIR).join("blues");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("1000.wav");
        let mut w = TakeWavWriter::create(&path, 44_100).unwrap();
        w.push(&sine(220.0, 44_100, 0.2)).unwrap();
        w.finish().unwrap();
        let play = load_take(&root, "1000").unwrap();
        assert_eq!(play.sample_rate, 44_100);
        assert_eq!(play.pcm.len(), (44_100.0 * 0.2) as usize);
    }

    #[test]
    fn the_directory_size_is_every_take_of_every_jam() {
        let root = tmp_dir("size");
        assert_eq!(takes_dir_size(&root), 0, "no takes is no bytes");
        write_take(&root, "blues", "1000", 1.0);
        write_take(&root, "bossa", "2000", 1.0);
        let size = takes_dir_size(&root);
        // Two seconds of 48 kHz 16-bit mono is 192,000 bytes plus headers
        // and two small sidecars.
        assert!(
            size > 192_000 && size < 200_000,
            "two one-second takes came to {size} bytes"
        );
    }

    // ---- The playback voice ----

    fn playback(pcm: Vec<f32>, sr: u32) -> TakePlayback {
        TakePlayback {
            pcm: Arc::new(pcm),
            sample_rate: sr,
        }
    }

    #[test]
    fn a_take_played_at_its_own_rate_is_the_samples_it_was_written_from() {
        let play = playback(vec![0.0, 0.25, 0.5, 0.75], 48_000);
        assert_eq!(play.step(48_000), 1.0);
        for (i, want) in [0.0f32, 0.25, 0.5, 0.75].iter().enumerate() {
            assert_eq!(play.sample_at(i as f64), Some(*want), "sample {i}");
        }
    }

    #[test]
    fn a_take_recorded_on_another_device_plays_at_the_right_speed() {
        // Recorded through a 44.1 kHz interface, played out of a 48 kHz
        // laptop. Without the step this comes out a semitone and a half
        // sharp, which is the kind of wrong a guitarist notices instantly.
        let play = playback(vec![0.0; 4], 44_100);
        let step = play.step(48_000);
        assert!(
            (step - 44_100.0 / 48_000.0).abs() < 1e-12,
            "the source advances slower than the output: {step}"
        );
        // And the other way round.
        let other = playback(vec![0.0; 4], 96_000);
        assert!((other.step(48_000) - 2.0).abs() < 1e-12);
    }

    #[test]
    fn the_playback_voice_interpolates_between_samples() {
        let play = playback(vec![0.0, 1.0], 48_000);
        assert_eq!(play.sample_at(0.0), Some(0.0));
        assert_eq!(play.sample_at(0.5), Some(0.5));
        assert!((play.sample_at(0.25).unwrap() - 0.25).abs() < 1e-6);
    }

    #[test]
    fn a_take_that_has_run_out_says_so_rather_than_looping_or_panicking() {
        let play = playback(vec![0.1, 0.2, 0.3], 48_000);
        // The last sample has nothing to interpolate towards and is played
        // as itself.
        assert_eq!(play.sample_at(2.0), Some(0.3));
        assert_eq!(play.sample_at(2.5), Some(0.3));
        // Past the end is the end — and `None` is what raises
        // `take-playback-ended`, so it has to arrive exactly once the audio
        // is gone and not a buffer early.
        assert_eq!(play.sample_at(3.0), None);
        assert_eq!(play.sample_at(1_000_000.0), None);
    }

    #[test]
    fn an_empty_take_ends_on_its_first_frame_instead_of_hanging() {
        let play = playback(Vec::new(), 48_000);
        assert_eq!(play.sample_at(0.0), None);
    }

    #[test]
    fn a_whole_take_streams_out_at_the_length_it_should() {
        // What the callback does, frame by frame, until the take says it is
        // over: 0.1 s recorded at 44.1 kHz should take 0.1 s to play out of
        // a 48 kHz device, which is 4800 frames and not 4410.
        const OUT_SR: u32 = 48_000;
        let source = sine(440.0, 44_100, 0.1);
        let play = playback(source, 44_100);
        let step = play.step(OUT_SR);
        let mut pos = 0.0f64;
        let mut frames = 0usize;
        while play.sample_at(pos).is_some() {
            pos += step;
            frames += 1;
            assert!(frames < 100_000, "the playback never ended");
        }
        let want = (OUT_SR as f64 * 0.1) as usize;
        assert!(
            (frames as i64 - want as i64).abs() <= 2,
            "0.1 s of 44.1 kHz took {frames} frames at 48 kHz, and should take {want}"
        );
    }

    // ---- The handoff ----

    #[test]
    fn the_ring_crosses_to_the_audio_thread_behind_its_own_generation() {
        let handoff = TakeHandoff::new();
        let mut seen = 0u64;
        // Nothing has changed, so the callback does not even take the lock.
        assert!(handoff.poll_record(&mut seen).is_none());

        handoff.set_record(Some(Arc::new(TakeRing::new(16))));
        let got = handoff.poll_record(&mut seen).expect("a change");
        assert!(got.is_some());
        assert!(
            handoff.poll_record(&mut seen).is_none(),
            "the same ring must not be handed over twice"
        );

        handoff.set_record(None);
        let gone = handoff.poll_record(&mut seen).expect("a change");
        assert!(gone.is_none());
    }

    #[test]
    fn an_ended_playback_is_reported_once_and_only_once() {
        let handoff = TakeHandoff::new();
        assert!(!handoff.take_ended());
        handoff.note_ended();
        assert!(handoff.take_ended(), "the event thread should see it");
        assert!(!handoff.take_ended(), "and not see it a second time");
    }

    #[test]
    fn starting_a_playback_clears_a_previous_ones_ending() {
        // Otherwise pressing play on a second take immediately emits the
        // first one's `take-playback-ended` and the UI puts the controls
        // back while it is still playing.
        let handoff = TakeHandoff::new();
        handoff.note_ended();
        handoff.set_play(Some(TakePlayback {
            pcm: Arc::new(vec![0.0; 10]),
            sample_rate: 48_000,
        }));
        assert!(!handoff.take_ended());
        assert!(handoff.is_playing_back());
        handoff.set_play(None);
        assert!(!handoff.is_playing_back());
    }

    #[test]
    fn the_audio_thread_never_drops_the_last_reference_to_a_take() {
        // A twenty-minute take is a hundred megabytes; the last `Arc` to it
        // must be dropped somewhere `free()` is allowed.
        let handoff = TakeHandoff::new();
        let mut parking = TakeParking::new();
        let pcm = Arc::new(vec![0.0f32; 1024]);
        let watch = Arc::downgrade(&pcm);
        parking.retire_pcm(&handoff, pcm);
        assert!(
            watch.upgrade().is_some(),
            "retiring must not free it on the spot"
        );
        handoff.drain_retired();
        assert!(
            watch.upgrade().is_none(),
            "and the command thread's drain is what does"
        );
    }

    #[test]
    fn a_busy_retirement_slot_parks_rather_than_freeing() {
        let handoff = TakeHandoff::new();
        let mut parking = TakeParking::new();
        let pcm = Arc::new(vec![0.0f32; 8]);
        let watch = Arc::downgrade(&pcm);
        // The command thread is holding the lock, the way it is for the
        // instant it drains.
        let held = handoff.retired.lock().unwrap();
        parking.retire_pcm(&handoff, pcm);
        assert!(watch.upgrade().is_some(), "parked, not freed");
        drop(held);
        parking.flush(&handoff);
        handoff.drain_retired();
        assert!(watch.upgrade().is_none());
    }

    // ---- The session ----

    #[test]
    fn a_take_records_the_band_and_the_mic_into_one_file() {
        let root = tmp_dir("session");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mic = Arc::new(TakeRing::new(48_000 * RING_SECS));
        let mut session = TakeSession::default();
        session
            .start(plain(&root, "blues", &handoff, Some((mic.clone(), 48_000)), 48_000))
            .expect("start");
        assert!(session.is_recording());
        assert_eq!(session.recording_jam(), Some("blues"));

        // Play the part of the audio threads: the callback pushes the band
        // in, the input thread pushes the mic in, in buffer-sized chunks.
        let band_ring = {
            let mut seen = 0u64;
            handoff
                .poll_record(&mut seen)
                .expect("the ring reached the audio thread")
                .expect("and it is a ring")
        };
        // LET THE WRITER'S CLOCK START BEFORE MEASURING ANYTHING. Its first
        // sight of the band is the moment it throws the mic's head start
        // away, and on a loaded machine every push below can land before its
        // first twenty-five millisecond tick — in which case that one tick
        // sees the whole take, clears the whole mic, and writes a file of
        // band with no player in it. That is correct behaviour on a wrong
        // input, and it used to make this test fail at random on a busy box.
        // Waiting on a fact the writer publishes, rather than on the clock,
        // pins it.
        band_ring.push(&[0.25f32; 480]);
        mic.push(&[0.25f32; 480]);
        wait_until("the writer started the take", || {
            session.written_samples() > 0
        });
        for _ in 0..40 {
            band_ring.push(&[0.25f32; 480]);
            mic.push(&[0.25f32; 480]);
            std::thread::sleep(std::time::Duration::from_millis(2));
        }

        let take = session.stop(&handoff).expect("stop").expect("a take");
        assert_eq!(take.jam_id, "blues");
        assert!(!session.is_recording());

        let bytes = fs::read(&take.path).unwrap();
        let (pcm, sr) = decode_wav_bytes(&bytes).unwrap();
        assert_eq!(sr, 48_000);
        // Forty-one chunks: the one that started the writer's clock, and the
        // forty pushed after it.
        assert_eq!(pcm.len(), 41 * 480, "every band sample should be in the file");
        assert!(
            (take.duration_sec - (41.0 * 480.0 / 48_000.0)).abs() < 0.01,
            "the take is {} s",
            take.duration_sec
        );
        // Band 0.25 plus mic 0.25 at unity, allowing for the resampler's
        // one-sample tail at the very start. Sampled from the middle, well
        // past the head start the writer discarded.
        let mid = pcm[pcm.len() / 2];
        assert!(
            (mid - 0.5).abs() < 0.01,
            "the mic and the band should sum to 0.5, got {mid}"
        );
        // And it is listed, with a sidecar.
        let listed = list_takes(&root, "blues").unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, take.id);
        assert!(Path::new(&take.path).with_extension("json").exists());
    }

    /// THE DRY STEM IS THE PLAYER ALONE, ON THE TAKE'S OWN CLOCK.
    ///
    /// `plans/SONGS.md` A8. The review's pitch pass (`pitch.rs`) is
    /// monophonic and cannot be handed a mix; it needs the mic, at the same
    /// length and at the same moments as the take beside it, so a note found
    /// at 3.2 s in the stem is the note at 3.2 s in the take.
    #[test]
    fn the_writer_keeps_the_player_alone_beside_the_mix() {
        let root = tmp_dir("dry-session");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mic = Arc::new(TakeRing::new(48_000 * RING_SECS));
        let mut session = TakeSession::default();
        session
            .start(plain(&root, "blues", &handoff, Some((mic.clone(), 48_000)), 48_000))
            .expect("start");
        let band_ring = {
            let mut seen = 0u64;
            handoff.poll_record(&mut seen).unwrap().unwrap()
        };
        // The writer's clock starts on the first band it sees, and that is
        // when the mic's head start is discarded — see
        // `a_take_records_the_band_and_the_mic_into_one_file` on why this is
        // waited for rather than slept through.
        band_ring.push(&[0.25f32; 480]);
        mic.push(&[0.5f32; 480]);
        wait_until("the writer started the take", || {
            session.written_samples() > 0
        });
        // Band at 0.25, player at 0.5. The mix is 0.75; the stem is 0.5 and
        // nothing else.
        for _ in 0..40 {
            band_ring.push(&[0.25f32; 480]);
            mic.push(&[0.5f32; 480]);
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
        let take = session.stop(&handoff).expect("stop").expect("a take");

        let dry_path = take.dry_path.clone().expect("a take with a mic has a stem");
        let (mix, mix_sr) = decode_wav_bytes(&fs::read(&take.path).unwrap()).unwrap();
        let (dry, dry_sr) = decode_wav_bytes(&fs::read(&dry_path).unwrap()).unwrap();

        // SAMPLE FOR SAMPLE, OR THE TWO CANNOT BE READ AGAINST EACH OTHER.
        assert_eq!(dry_sr, mix_sr);
        assert_eq!(dry.len(), mix.len(), "the stem is not the take's length");

        let mid = dry.len() / 2;
        assert!(
            (dry[mid] - 0.5).abs() < 0.01,
            "the stem should be the mic alone, got {}",
            dry[mid]
        );
        assert!((mix[mid] - 0.75).abs() < 0.01, "the mix should have both");
        // Not one sample of the band anywhere in it: if the stem carried the
        // band at all, the tracker would be handed a chord.
        let banded = dry.iter().filter(|v| (**v - 0.75).abs() < 0.02).count();
        assert_eq!(banded, 0, "{banded} samples of the band are in the dry stem");

        // And it is the take's, not a take of its own.
        let listed = list_takes(&root, "blues").unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].dry_path.as_deref(), Some(dry_path.as_str()));
    }

    /// WHAT THE MIC HEARD BEFORE THE BAND EXISTED IS NOT IN THE TAKE.
    ///
    /// The bug this pins: `start_take` turns the mic on and only then
    /// creates the file and hands the callback its ring. Ten to twenty-five
    /// milliseconds pass in between, and every one of them was already in
    /// the mic ring when the band's first sample arrived — so the file
    /// opened with the player tuning up, laid over bar one, and every note
    /// after it sat that far ahead of the band for the whole take. Nothing
    /// downstream absorbed it: the band is the clock, so the offset never
    /// closed.
    #[test]
    fn the_mic_that_arrived_before_the_band_is_not_in_the_take() {
        let root = tmp_dir("head-start");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mic = Arc::new(TakeRing::new(48_000 * RING_SECS));
        let mut session = TakeSession::default();
        session
            .start(plain(&root, "blues", &handoff, Some((mic.clone(), 48_000)), 48_000))
            .expect("start");
        let band_ring = {
            let mut seen = 0u64;
            handoff.poll_record(&mut seen).unwrap().unwrap()
        };

        // A tenth of a second of mic before the band exists — the tuning-up
        // the head start captures. Marked -1.0 so it is unmistakable.
        mic.push(&vec![-1.0f32; 4_800]);
        std::thread::sleep(std::time::Duration::from_millis(WRITER_TICK_MS * 3));

        // Now the band starts, and the player plays with it.
        for _ in 0..20 {
            band_ring.push(&[0.25f32; 480]);
            mic.push(&[0.5f32; 480]);
            std::thread::sleep(std::time::Duration::from_millis(WRITER_TICK_MS));
        }

        let take = session.stop(&handoff).unwrap().expect("a take");
        let (pcm, _) = decode_wav_bytes(&fs::read(&take.path).unwrap()).unwrap();
        // 0.25 band over -1.0 mic is -0.75. Not one sample of the file may
        // be it.
        let head_start = pcm.iter().filter(|v| (**v + 0.75).abs() < 0.02).count();
        assert_eq!(
            head_start, 0,
            "{head_start} samples of what the mic heard before the band existed"
        );
        // And the player IS in the take: 0.25 over 0.5 is 0.75.
        let together = pcm.iter().filter(|v| (**v - 0.75).abs() < 0.02).count();
        assert!(together > 1_000, "only {together} samples have the mic in them");
    }

    /// THE TAKE PULLS THE MIC FORWARD BY THE ROUND TRIP.
    ///
    /// The bug this pins: nothing subtracted the round trip at all. The
    /// player plays along with what they HEAR, which is the band one output
    /// latency after the callback rendered it, and their answer takes an
    /// input latency to reach the writer — so every note they played landed
    /// in the file that far behind the beat it answered, and a take recorded
    /// to tell you whether you rush or drag said you dragged.
    ///
    /// A take therefore opens with a round trip of band and no mic under it,
    /// which is the honest picture: the player had not heard anything yet.
    #[test]
    fn the_take_pulls_the_mic_forward_by_the_round_trip() {
        let root = tmp_dir("round-trip");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mic = Arc::new(TakeRing::new(48_000 * RING_SECS));
        let mut session = TakeSession::default();
        // 50 ms at 48 kHz is 2400 samples of mic to throw away.
        let round_trip_us = 50_000u64;
        let skipped = (round_trip_us * 48_000 / 1_000_000) as usize;
        session
            .start(TakeStart {
                round_trip_us,
                ..plain(&root, "blues", &handoff, Some((mic.clone(), 48_000)), 48_000)
            })
            .expect("start");
        let band_ring = {
            let mut seen = 0u64;
            handoff.poll_record(&mut seen).unwrap().unwrap()
        };

        // Band and mic in lockstep, one writer tick at a time so the mic
        // queue never runs long enough for the backlog trim to have an
        // opinion.
        for _ in 0..24 {
            band_ring.push(&[0.25f32; 480]);
            mic.push(&[0.5f32; 480]);
            std::thread::sleep(std::time::Duration::from_millis(WRITER_TICK_MS));
        }

        let take = session.stop(&handoff).unwrap().expect("a take");
        let (pcm, _) = decode_wav_bytes(&fs::read(&take.path).unwrap()).unwrap();
        let band_alone = pcm.iter().filter(|v| (**v - 0.25).abs() < 0.02).count();
        let together = pcm.iter().filter(|v| (**v - 0.75).abs() < 0.02).count();
        assert!(
            band_alone >= skipped,
            "the take should open with {skipped} samples of band the player had not heard \
             yet, and it has {band_alone}"
        );
        assert!(together > 3_000, "and then the player: {together} samples");
    }

    /// AN OUTPUT DEVICE CHANGE ENDS THE TAKE INSTEAD OF DETUNING IT.
    ///
    /// The bug this pins: the WAV's header says the rate the device was
    /// running at when the take started, and the writer went on filling it
    /// after the engine reopened on another device. Everything past the
    /// change played back at the wrong speed and the file said nothing
    /// about it — a take that goes sharp halfway through with no way to
    /// know why. The simplest honest guard is to stop: what was recorded
    /// before the change is exactly what the header claims.
    #[test]
    fn a_device_change_finishes_the_take_rather_than_detuning_the_rest() {
        let root = tmp_dir("device-change");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let watch = Arc::new(AtomicU32::new(48_000));
        let mut session = TakeSession::default();
        session
            .start(TakeStart {
                out_sr_watch: Some(watch.clone()),
                ..plain(&root, "blues", &handoff, None, 48_000)
            })
            .expect("start");
        let band_ring = {
            let mut seen = 0u64;
            handoff.poll_record(&mut seen).unwrap().unwrap()
        };

        for _ in 0..10 {
            band_ring.push(&[0.5f32; 480]);
        }
        // Wait for the writer to have committed all of it. On the clock this
        // was a guess that lost under a loaded test run: the writer had
        // drained only part of the ring when the rate moved, and the file
        // came up short of what the test had pushed.
        wait_until("the writer commits the band", || session.written_samples() >= 4_800);

        // The user plugs in an interface that runs at 44.1 kHz.
        watch.store(44_100, Ordering::Release);
        wait_until("the writer notices the device change", || session.writer_finished());

        // The callback carries on for a moment before anyone stops it; none
        // of it may reach the file.
        for _ in 0..10 {
            band_ring.push(&[0.5f32; 480]);
        }

        let take = session.stop(&handoff).unwrap().expect("a take");
        let (pcm, sr) = decode_wav_bytes(&fs::read(&take.path).unwrap()).unwrap();
        assert_eq!(sr, 48_000, "the take is what its header says it is");
        assert_eq!(
            pcm.len(),
            4_800,
            "the take should end at the device change, and it is {} samples",
            pcm.len()
        );
    }

    /// A take remembers whether it opened the microphone, because
    /// `stop_take` has to know whether to close it and by then there is no
    /// take left to ask.
    #[test]
    fn a_take_remembers_whether_it_opened_the_microphone() {
        let root = tmp_dir("owns-input");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mut session = TakeSession::default();
        assert!(!session.owns_input(), "nothing is recording");

        session
            .start(TakeStart {
                owns_input: true,
                ..plain(&root, "blues", &handoff, None, 48_000)
            })
            .expect("start");
        assert!(session.owns_input());
        let _ = session.stop(&handoff);
        assert!(!session.owns_input(), "and it is gone with the take");

        // An input somebody else already had open is not the take's to close.
        session
            .start(plain(&root, "blues2", &handoff, None, 48_000))
            .expect("start");
        assert!(!session.owns_input());
        let _ = session.stop(&handoff);
    }

    #[test]
    fn a_take_of_nothing_is_not_kept() {
        let root = tmp_dir("empty");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mut session = TakeSession::default();
        session
            .start(plain(&root, "blues", &handoff, None, 48_000))
            .unwrap();
        // Nothing is pushed: the user pressed record and stop with the band
        // stopped.
        assert!(session.stop(&handoff).unwrap().is_none());
        assert!(list_takes(&root, "blues").unwrap().is_empty());
    }

    /// A TAKE OF NOTHING LEAVES NO STEM EITHER. With a mic open the stem
    /// file is created at `start`, so the empty-take path has to remove
    /// both — otherwise pressing record and stop by accident leaves a
    /// recording of the room that nothing in the app lists.
    #[test]
    fn a_take_of_nothing_leaves_no_dry_stem_behind() {
        let root = tmp_dir("empty-dry");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mic = Arc::new(TakeRing::new(48_000 * RING_SECS));
        let mut session = TakeSession::default();
        session
            .start(plain(&root, "blues", &handoff, Some((mic, 48_000)), 48_000))
            .unwrap();
        assert!(session.stop(&handoff).unwrap().is_none());
        assert!(list_takes(&root, "blues").unwrap().is_empty());
        let dir = root.join(TAKES_DIR).join(safe_dir_name("blues").unwrap());
        let left: Vec<PathBuf> = fs::read_dir(&dir)
            .map(|d| d.flatten().map(|e| e.path()).collect())
            .unwrap_or_default();
        assert!(left.is_empty(), "{left:?} was left behind");
    }

    #[test]
    fn a_take_with_no_mic_is_still_a_take_of_the_band() {
        let root = tmp_dir("no-mic");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mut session = TakeSession::default();
        session
            .start(plain(&root, "blues", &handoff, None, 48_000))
            .unwrap();
        let band_ring = {
            let mut seen = 0u64;
            handoff.poll_record(&mut seen).unwrap().unwrap()
        };
        for _ in 0..10 {
            band_ring.push(&[0.5f32; 480]);
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
        let take = session.stop(&handoff).unwrap().expect("a take");
        let (pcm, _) = decode_wav_bytes(&fs::read(&take.path).unwrap()).unwrap();
        assert_eq!(pcm.len(), 4800);
        assert!((pcm[100] - 0.5).abs() < 0.01, "the band alone, at its own level");
        // AND NO STEM AT ALL, rather than a stem of silence. A review handed
        // an empty stem would report that the player played nothing; handed
        // no stem, it knows there is nothing to measure.
        assert_eq!(take.dry_path, None);
        assert!(!dry_beside(Path::new(&take.path)).exists());
    }

    /// A TAKE NOBODY STOPPED IS NOT A TAKE, WHICH IS WHY QUITTING HAS TO
    /// STOP ONE.
    ///
    /// The WAV is opened with 44 bytes of zeroes where the header goes and
    /// patched with the real length only when the writer finishes; the
    /// sidecar with the record is written after that. So a take still
    /// running when the process ends is a file the decoder refuses and a row
    /// the list shows as zero seconds long — an hour of playing that cannot
    /// be listened back to, which is the whole point of the feature.
    ///
    /// This is the stake behind the window-close handler in `lib.rs`, which
    /// now finishes an active take before `exit(0)`. `exit(0)` is not a
    /// `Drop`: nothing else would have run.
    #[test]
    fn a_take_is_only_readable_once_something_stops_it() {
        let root = tmp_dir("quit");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mut session = TakeSession::default();
        session
            .start(plain(&root, "blues", &handoff, None, 48_000))
            .expect("start");
        let band_ring = {
            let mut seen = 0u64;
            handoff.poll_record(&mut seen).unwrap().unwrap()
        };
        for _ in 0..8 {
            band_ring.push(&[0.4f32; 480]);
            std::thread::sleep(std::time::Duration::from_millis(WRITER_TICK_MS));
        }

        // On disk right now — which is what quitting without stopping would
        // leave behind.
        let dir = root.join(TAKES_DIR).join(safe_dir_name("blues").unwrap());
        let path = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .find(|p| p.extension().and_then(|e| e.to_str()) == Some("wav"))
            .expect("the take is being written");
        assert!(
            decode_wav_bytes(&fs::read(&path).unwrap()).is_err(),
            "an unfinished take is 44 bytes of zeroes where the header goes"
        );
        assert_eq!(duration_of(&path), 0.0, "and it reads as no time at all");
        assert!(
            !path.with_extension("json").exists(),
            "and it has no record beside it"
        );

        // Stopping it is what makes it a take — the header patched, the
        // sidecar written, the audio readable.
        let take = session.stop(&handoff).unwrap().expect("a take");
        let (pcm, sr) = decode_wav_bytes(&fs::read(&take.path).unwrap()).unwrap();
        assert_eq!(sr, 48_000);
        assert!(!pcm.is_empty());
        assert!(Path::new(&take.path).with_extension("json").exists());
        assert!(take.duration_sec > 0.0);
    }

    #[test]
    fn a_second_take_is_refused_while_one_is_running() {
        let root = tmp_dir("double");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mut session = TakeSession::default();
        session
            .start(plain(&root, "blues", &handoff, None, 48_000))
            .unwrap();
        let err = session
            .start(plain(&root, "blues", &handoff, None, 48_000))
            .expect_err("one at a time");
        assert!(err.contains("already recording"), "{err}");
        let _ = session.stop(&handoff);
    }

    #[test]
    fn recording_over_a_playback_is_refused_with_something_to_show_the_user() {
        let root = tmp_dir("over-playback");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        handoff.set_play(Some(TakePlayback {
            pcm: Arc::new(vec![0.0; 10]),
            sample_rate: 48_000,
        }));
        let mut session = TakeSession::default();
        let err = session
            .start(plain(&root, "blues", &handoff, None, 48_000))
            .expect_err("not while a take is playing");
        assert!(err.contains("stop the take"), "{err}");
    }

    #[test]
    fn stopping_when_nothing_is_recording_is_not_an_error() {
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mut session = TakeSession::default();
        assert!(session.stop(&handoff).unwrap().is_none());
    }

    #[test]
    fn a_take_stops_growing_at_the_cap() {
        // Twenty minutes at 48 kHz would take twenty minutes to prove, so
        // the arithmetic the writer does is checked at a rate that makes the
        // cap arrive immediately: at 4 samples a second the cap is
        // `TAKE_MAX_SECS * 4` samples.
        let root = tmp_dir("cap");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mut session = TakeSession::default();
        session
            .start(plain(&root, "blues", &handoff, None, 4))
            .unwrap();
        let band_ring = {
            let mut seen = 0u64;
            handoff.poll_record(&mut seen).unwrap().unwrap()
        };
        let cap = (TAKE_MAX_SECS * 4) as usize;
        // Twice the cap, in chunks the ring can hold.
        let mut sent = 0usize;
        while sent < cap * 2 {
            let n = (cap * 2 - sent).min(band_ring.capacity() / 2);
            band_ring.push(&vec![0.5f32; n]);
            sent += n;
            std::thread::sleep(std::time::Duration::from_millis(WRITER_TICK_MS + 5));
        }
        // THE CAP FINISHES THE TAKE AND SAYS SO. Before this the writer
        // set a `capped` local, logged once and went on looping: the file
        // stopped growing, the callback went on copying the band into a ring
        // with no consumer, and the user was told nothing at all. The screen
        // now hears `take-capped` — this is the flag the event loop turns
        // into it — and the take is already finalised when it does.
        let mut waited = 0;
        while !handoff.take_capped() && waited < 200 {
            std::thread::sleep(std::time::Duration::from_millis(WRITER_TICK_MS));
            waited += 1;
        }
        assert!(waited < 200, "the cap should have raised the flag");
        // Consumed, so the screen is told once and not on every pass.
        assert!(!handoff.take_capped(), "and only once");
        // And the callback was told to stop copying, so nothing is still
        // filling a ring nobody drains.
        assert!(
            !handoff.is_recording_into_a_ring(),
            "the cap should have taken the ring away from the callback"
        );

        let take = session.stop(&handoff).unwrap().expect("a take");
        let (pcm, _) = decode_wav_bytes(&fs::read(&take.path).unwrap()).unwrap();
        assert_eq!(pcm.len(), cap, "the take should stop exactly at the cap");
        assert!(
            (take.duration_sec - TAKE_MAX_SECS as f64).abs() < 0.01,
            "a capped take is {TAKE_MAX_SECS} s, not {}",
            take.duration_sec
        );
    }

    /// A NEW TAKE DOES NOT INHERIT THE LAST ONE'S CAP.
    #[test]
    fn a_take_starting_clears_a_cap_nobody_collected() {
        let handoff = TakeHandoff::new();
        handoff.note_capped();
        handoff.set_record(Some(Arc::new(TakeRing::new(16))));
        assert!(
            !handoff.take_capped(),
            "the new take is twenty minutes from its own cap"
        );
        // And taking the ring away is not itself a cap.
        handoff.note_capped();
        handoff.set_record(None);
        assert!(handoff.take_capped(), "the cap still has to be reported");
    }
    // ---- Everything this computer plays (W30) ----

    /// Read a take's WAV back: (channels, sample rate, interleaved samples).
    fn read_take_wav(path: &Path) -> (u16, u32, Vec<f32>) {
        let bytes = fs::read(path).expect("the take is on disk");
        assert!(bytes.len() >= 44, "a take has a header");
        assert_eq!(&bytes[0..4], b"RIFF");
        let channels = u16::from_le_bytes([bytes[22], bytes[23]]);
        let sr = u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]);
        let bits = u16::from_le_bytes([bytes[34], bytes[35]]);
        assert_eq!(bits, 16);
        // The header's own `data` size has to agree with the bytes that are
        // actually there: a stereo header over a mono body is the defect this
        // whole change could have introduced, and it plays as a chipmunk.
        let declared = u32::from_le_bytes([bytes[40], bytes[41], bytes[42], bytes[43]]) as usize;
        assert_eq!(
            declared,
            bytes.len() - 44,
            "the header claims {declared} bytes of audio and the file holds {}",
            bytes.len() - 44
        );
        let pcm = bytes[44..]
            .chunks_exact(2)
            .map(|b| i16::from_le_bytes([b[0], b[1]]) as f32 / 32767.0)
            .collect();
        (channels, sr, pcm)
    }

    /// The frequency of a run of samples, from its zero crossings.
    ///
    /// Crude and exactly right for this: the question a resampler has to
    /// answer is "is it still the same note", and a tone that came out at
    /// 44.1/48ths of its pitch would be off by two whole tones, which no
    /// measurement this rough could miss.
    fn pitch_of(samples: &[f32], sr: u32) -> f64 {
        let mut crossings = 0usize;
        for pair in samples.windows(2) {
            if pair[0] <= 0.0 && pair[1] > 0.0 {
                crossings += 1;
            }
        }
        if samples.len() < 2 {
            return 0.0;
        }
        crossings as f64 * sr as f64 / samples.len() as f64
    }

    /// Start a take of everything this computer plays, push `raw` into its
    /// ring, and hand back the finished record.
    fn take_of_everything(
        name: &str,
        raw: &[f32],
        in_sr: u32,
        channels: u16,
        out_sr: u32,
    ) -> (PathBuf, JamTake) {
        let root = tmp_dir(name);
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let ring = Arc::new(TakeRing::new(raw.len().next_power_of_two().max(1024)));
        let mut session = TakeSession::default();
        session
            .start(TakeStart {
                app_data: &root,
                jam_id: "loopback",
                handoff: &handoff,
                mic: None,
                out_sr,
                round_trip_us: 0,
                out_sr_watch: None,
                owns_input: false,
                position: None,
                loopback: Some(TakeLoopback {
                    ring: ring.clone(),
                    sample_rate: in_sr,
                    channels,
                    device: "a test speaker".into(),
                    // No stream: the ring is filled by hand, which is the
                    // whole point of the field being optional.
                    capture: None,
                }),
            })
            .expect("the take starts");

        // Yames' own band, so the writer has something to stamp and something
        // to drain. None of it reaches the file.
        let band = {
            let mut seen = 0u64;
            handoff.poll_record(&mut seen).unwrap().unwrap()
        };
        band.stamp_start(TakeTransport::Jam { bar: 2, chorus: 1 });
        band.push(&vec![0.5f32; out_sr as usize / 10]);

        ring.push(raw);
        let frames_in = raw.len() / channels.max(1) as usize;
        let expect = (frames_in as u64 * out_sr as u64) / in_sr.max(1) as u64;
        // Nine tenths, because the resampler holds a sample back and the
        // writer wakes on a timer: the exact length is asserted on the file.
        wait_until("the loopback take to be written", || {
            session.written_samples() >= expect * 9 / 10
        });
        let take = session
            .stop(&handoff)
            .expect("the take stops")
            .expect("there is a take");
        (root, take)
    }

    #[test]
    fn everything_this_computer_plays_becomes_a_stereo_take_at_the_engines_rate() {
        // A stereo speaker running at 44.1 kHz under an engine at 48 kHz: the
        // rates differ, so this is the resampling path and not a copy.
        let tone = sine(440.0, 44_100, 0.5);
        let mut raw = Vec::with_capacity(tone.len() * 2);
        for s in &tone {
            raw.push(*s);
            // The right side is the same note, half as loud, so a fold that
            // collapsed the two or crossed them would be visible.
            raw.push(*s * 0.5);
        }
        let (_root, take) = take_of_everything("lb-44", &raw, 44_100, 2, 48_000);

        let (ch, sr, pcm) = read_take_wav(Path::new(&take.path));
        assert_eq!(ch, 2, "a take of the speakers keeps both sides");
        assert_eq!(sr, 48_000, "written at the rate the engine is running");

        let frames = pcm.len() / 2;
        let want = (tone.len() as f64 * 48_000.0 / 44_100.0) as usize;
        assert!(
            frames.abs_diff(want) < 64,
            "half a second at 44.1 kHz is {want} frames at 48 kHz, got {frames}"
        );

        let left: Vec<f32> = pcm.iter().step_by(2).copied().collect();
        let right: Vec<f32> = pcm.iter().skip(1).step_by(2).copied().collect();
        let hz = pitch_of(&left, 48_000);
        assert!(
            (hz - 440.0).abs() < 5.0,
            "the note has to survive the rate change: got {hz} Hz"
        );
        let peak_l = left.iter().fold(0f32, |a, b| a.max(b.abs()));
        let peak_r = right.iter().fold(0f32, |a, b| a.max(b.abs()));
        assert!(peak_l > 0.9, "the left side is the loud one: {peak_l}");
        assert!(
            (peak_r - 0.5).abs() < 0.05,
            "and the right side stayed half as loud: {peak_r}"
        );

        // The record says what it is a recording of, which is the promise.
        assert_eq!(take.sound, TakeSound::Everything);
        assert_eq!(take.sound_device.as_deref(), Some("a test speaker"));
        // And half a second is half a second, however many channels it took.
        assert!(
            (take.duration_sec - 0.5).abs() < 0.02,
            "duration {}",
            take.duration_sec
        );
    }

    #[test]
    fn a_surround_speaker_folds_down_to_the_same_stereo_take() {
        // 48 kHz 5.1 — no rate change, six channels. Front left carries the
        // note; the centre and the surrounds carry silence, so the fold is
        // measured rather than merely survived.
        let tone = sine(220.0, 48_000, 0.4);
        let mut raw = Vec::with_capacity(tone.len() * 6);
        for s in &tone {
            raw.extend_from_slice(&[*s, *s * 0.5, 0.0, 0.9, 0.0, 0.0]);
        }
        let (_root, take) = take_of_everything("lb-51", &raw, 48_000, 6, 48_000);

        let (ch, sr, pcm) = read_take_wav(Path::new(&take.path));
        assert_eq!(ch, 2);
        assert_eq!(sr, 48_000);
        let frames = pcm.len() / 2;
        assert!(
            frames.abs_diff(tone.len()) < 64,
            "no rate change, so the length is the length: {frames} vs {}",
            tone.len()
        );
        let left: Vec<f32> = pcm.iter().step_by(2).copied().collect();
        let hz = pitch_of(&left, 48_000);
        assert!((hz - 220.0).abs() < 5.0, "got {hz} Hz");
        // The LFE was the loudest channel in the file and must not be in the
        // fold: a left side over 1.0 would have clamped and flattened.
        let peak_l = left.iter().fold(0f32, |a, b| a.max(b.abs()));
        assert!(
            (peak_l - 1.0).abs() < 0.02,
            "front left, and nothing else: {peak_l}"
        );
    }

    #[test]
    fn a_take_of_everything_has_no_dry_stem_and_never_opens_the_microphone() {
        // The microphone is handed over and has to be ignored: the player is
        // already in the speaker's stream, and a second copy of them would be
        // the same performance twice, a round trip apart.
        let mic = Arc::new(TakeRing::new(4096));
        mic.push(&vec![0.75f32; 2048]);

        let root = tmp_dir("lb-nomic");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let ring = Arc::new(TakeRing::new(65_536));
        let mut session = TakeSession::default();
        session
            .start(TakeStart {
                app_data: &root,
                jam_id: "loopback",
                handoff: &handoff,
                mic: Some((mic.clone(), 48_000)),
                out_sr: 48_000,
                round_trip_us: 0,
                out_sr_watch: None,
                owns_input: false,
                position: None,
                loopback: Some(TakeLoopback {
                    ring: ring.clone(),
                    sample_rate: 48_000,
                    channels: 2,
                    device: "a test speaker".into(),
                    capture: None,
                }),
            })
            .expect("the take starts");
        ring.push(&vec![0.25f32; 4_800 * 2]);
        wait_until("the take to be written", || {
            session.written_samples() >= 4_000
        });
        let take = session.stop(&handoff).unwrap().unwrap();

        assert!(
            take.dry_path.is_none(),
            "there is no channel the player is alone on, so there is no stem"
        );
        assert!(
            !dry_beside(Path::new(&take.path)).exists(),
            "and nothing was written where one would go"
        );
        let (_ch, _sr, pcm) = read_take_wav(Path::new(&take.path));
        let peak = pcm.iter().fold(0f32, |a, b| a.max(b.abs()));
        assert!(
            (peak - 0.25).abs() < 0.02,
            "only the speaker is in the file: {peak}"
        );
        drop(root);
    }

    #[test]
    fn the_mono_header_is_still_the_one_session_audio_writes() {
        // The one assertion that keeps a second WAV header honest: for the
        // take Yames has always made, this module writes the same forty-four
        // bytes it always did, byte for byte.
        for (sr, frames) in [(48_000u32, 0u64), (44_100, 1), (22_050, 123_456)] {
            assert_eq!(
                wav_header_16bit(sr, 1, frames),
                crate::session_audio::wav_header_mono_16bit(sr, frames),
                "the mono header drifted at {sr} Hz / {frames} frames"
            );
        }
    }

    #[test]
    fn a_stereo_takes_length_is_read_off_its_own_header() {
        // Two bytes a sample and two samples a frame: a stereo take that was
        // measured as if it were mono would read twice as long, and the shelf
        // would say so.
        let one_second_stereo = wav_header_16bit(48_000, 2, 48_000);
        let len = 44 + 48_000 * 2 * 2;
        assert!((duration_from(len, &one_second_stereo) - 1.0).abs() < 1e-9);
        let one_second_mono = wav_header_16bit(48_000, 1, 48_000);
        let len = 44 + 48_000 * 2;
        assert!((duration_from(len, &one_second_mono) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn a_stereo_take_plays_back_through_the_engine_as_one_signal() {
        // `load_take` feeds the engine's own callback, which mixes one sample
        // per frame. A stereo file has to fold rather than be refused — and
        // it has to fold, not be read as twice as many mono samples, which
        // would play back an octave-ish too fast and half again too long.
        let mut bytes = wav_header_16bit(48_000, 2, 3).to_vec();
        for (l, r) in [(1.0f32, 0.0f32), (0.5, 0.5), (-1.0, 1.0)] {
            for v in [l, r] {
                bytes.extend_from_slice(&((v * 32767.0) as i16).to_le_bytes());
            }
        }
        let (pcm, sr) = decode_wav_bytes(&bytes).expect("a stereo take decodes");
        assert_eq!(sr, 48_000);
        assert_eq!(pcm.len(), 3, "three frames, not six samples");
        assert!((pcm[0] - 0.5).abs() < 1e-3);
        assert!((pcm[1] - 0.5).abs() < 1e-3);
        assert!(pcm[2].abs() < 1e-3, "hard-panned opposites cancel");
    }

    #[test]
    fn the_fold_keeps_its_place_when_a_frame_arrives_split_in_two() {
        // A callback boundary can land in the middle of a 5.1 frame. Losing
        // the tail would rotate every channel afterwards by one — the centre
        // would become the left, quietly, for the rest of the take.
        let mut fold = LoopbackFold::new(6, 48_000, 48_000);
        let mut out = Vec::new();
        let mut left: Vec<f32> = Vec::new();
        // A ramp in the front-left channel and nothing anywhere else — inside
        // full scale, because the fold clamps on its way out and a ramp of
        // 1, 2, 3 would come back as 1, 1, 1 and prove nothing. Two and a
        // half frames, then the tail and two more.
        fold.push(
            &[
                0.1, 0.0, 0.0, 0.0, 0.0, 0.0, // frame 1
                0.2, 0.0, 0.0, 0.0, 0.0, 0.0, // frame 2
                0.3, 0.0, 0.0, // frame 3, cut in half by the callback
            ],
            &mut out,
        );
        left.extend(out.iter().step_by(2));
        // The rest of frame 3, then two whole ones.
        fold.push(
            &[
                0.0, 0.0, 0.0, // the tail of frame 3
                0.4, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0,
            ],
            &mut out,
        );
        left.extend(out.iter().step_by(2));
        // Every front-left sample, in order and none of them rotated into a
        // neighbouring channel. The resampler holds the last one back, which
        // is why this is a prefix rather than an equality.
        let want = [0.1f32, 0.2, 0.3, 0.4, 0.5];
        assert!(left.len() >= 4, "got {left:?}");
        for (i, v) in left.iter().enumerate() {
            assert!(
                (v - want[i]).abs() < 1e-6,
                "sample {i} of {left:?} should be {}",
                want[i]
            );
        }
    }
}
