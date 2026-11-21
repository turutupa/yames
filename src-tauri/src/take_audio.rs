//! A Session Take's input audio, kept for the pitch pass (`score::notes`).
//!
//! **Not the audio callback.** The input callback writes the ring
//! (`audio_input::RingBuffer`) as it always has and knows nothing of this. The
//! onset detector's thread already copies everything new out of that ring
//! every 5 ms; while a Take whose pass bars name `noteIdentity` is loaded, it
//! copies the same samples once more, into a buffer allocated here before the
//! Take on a command thread. On the detector's thread, which runs at real-time
//! priority, this never allocates, never frees and never blocks: one atomic
//! load when nothing is armed, a `try_lock` and two `memcpy`s into capacity
//! that already exists when something is. A full buffer stops taking audio;
//! it never grows.
//!
//! The clock: the newest sample of a pull is taken to have arrived at the
//! moment of the pull, which is the rule `onset::OnsetCore::process` stamps
//! its hops by. So sample `i` is at `first_ns + i / rate`, on the same
//! `clock::now_ns` the onsets are on.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use crate::audio_input::RingBuffer;
use crate::take::{TakeHandoff, TakePlayback};

/// The longest Take kept. A Session Take is at most sixteen bars, which is
/// 96 s at 40 BPM; past this the buffer stops and later notes are not checked.
pub const MAX_TAKE_SECS: f64 = 120.0;

/// Never more than this many samples, whatever the device's rate: 24 MB.
const MAX_SAMPLES: usize = 6_000_000;

/// The most one pull copies. The detector wakes every 5 ms; a stall longer
/// than this loses audio, and the Take's clock with it (see `gap`).
const SCRATCH_SECS: f64 = 0.5;

/// What a finished capture hands the pitch pass.
#[derive(Debug)]
pub struct CapturedAudio {
    pub samples: Vec<f32>,
    pub rate: u32,
    /// `clock::now_ns` of `samples[0]`.
    pub first_ns: u64,
    /// How far the detector's onset stamps sit behind the attacks in these
    /// samples (`OnsetCore::detection_delay_ns`).
    pub detection_delay_ns: u64,
}

#[derive(Default)]
struct TapState {
    rate: u32,
    detection_delay_ns: u64,
    samples: Vec<f32>,
    scratch: Vec<f32>,
    cursor: Option<usize>,
    first_ns: Option<u64>,
    /// Stopped taking audio: the transport stopped, the buffer filled, or the
    /// capture was handed over.
    frozen: bool,
    /// A pull fell so far behind that audio was skipped: the clock no longer
    /// holds, and the capture is not used.
    gap: bool,
}

/// One per timing analyzer, shared with the onset detector's thread.
#[derive(Default)]
pub struct TakeAudioTap {
    armed: AtomicBool,
    state: Mutex<TapState>,
}

pub type SharedTakeAudioTap = Arc<TakeAudioTap>;

impl TakeAudioTap {
    pub fn new() -> SharedTakeAudioTap {
        Arc::new(Self::default())
    }

    /// The input's sample rate, from the detector thread as it starts.
    pub fn set_rate(&self, rate: u32) {
        if let Ok(mut s) = self.state.lock() {
            s.rate = rate;
        }
    }

    /// The detector's delay, from its thread as it starts: what the pitch
    /// pass takes off an onset's stamp to find the attack in these samples.
    pub fn set_detection_delay_ns(&self, delay_ns: u64) {
        if let Ok(mut s) = self.state.lock() {
            s.detection_delay_ns = delay_ns;
        }
    }

    /// Get ready to keep the next Take. Allocates, so a command thread's job.
    /// `device_rate` is the input's rate when the caller knows it; otherwise
    /// the last rate the detector reported, or 48 kHz.
    ///
    /// The buffers are written through once here, then emptied: a fresh
    /// allocation is only address space until something touches it, and the
    /// first touch of each page (a fault, and on Linux a transparent huge
    /// page zeroed) would otherwise land in `pull`, on the detector's thread,
    /// with the ring's lock held, where the input callback's `try_lock` would
    /// miss and drop a buffer.
    pub fn arm(&self, device_rate: Option<u32>) {
        let (stored, detection_delay_ns) = {
            let s = self.state.lock().unwrap();
            (s.rate, s.detection_delay_ns)
        };
        let rate = device_rate.filter(|r| *r > 0).unwrap_or(if stored > 0 { stored } else { 48_000 });
        let cap = ((rate as f64 * MAX_TAKE_SECS) as usize).min(MAX_SAMPLES);
        let prefaulted = |n: usize| {
            let mut v: Vec<f32> = Vec::with_capacity(n);
            v.resize(n, 0.0);
            v.clear();
            v
        };
        // Allocated and touched before the lock, so the detector's `try_lock`
        // is never kept waiting on a page fault either.
        let fresh = TapState {
            rate,
            detection_delay_ns,
            samples: prefaulted(cap),
            scratch: prefaulted((rate as f64 * SCRATCH_SECS) as usize),
            ..TapState::default()
        };
        let old = std::mem::replace(&mut *self.state.lock().unwrap(), fresh);
        self.armed.store(true, Ordering::Release);
        drop(old);
    }

    /// Nothing to keep. Frees, so a command thread's job too.
    pub fn disarm(&self) {
        self.armed.store(false, Ordering::Release);
        let old = {
            let mut s = self.state.lock().unwrap();
            let (rate, detection_delay_ns) = (s.rate, s.detection_delay_ns);
            std::mem::replace(
                &mut *s,
                TapState {
                    rate,
                    detection_delay_ns,
                    ..TapState::default()
                },
            )
        };
        // Freed outside the lock.
        drop(old);
    }

    /// Whether a capture is armed: one atomic load. The detector reads it
    /// before taking the ring's lock for a tap that runs whether or not the
    /// transport does (`capture::Capture::free_tap`).
    pub fn is_armed(&self) -> bool {
        self.armed.load(Ordering::Acquire)
    }

    /// The rate the tap is armed at (or the last the detector reported).
    /// Takes the state's lock: not for the detector's thread.
    pub fn rate(&self) -> u32 {
        self.state.lock().map(|s| s.rate).unwrap_or(0)
    }

    /// How many seconds one capture holds at `rate`: [`MAX_TAKE_SECS`], or
    /// less at a rate where [`MAX_SAMPLES`] comes first.
    pub fn max_secs(rate: u32) -> f64 {
        MAX_TAKE_SECS.min(MAX_SAMPLES as f64 / rate.max(1) as f64)
    }

    /// The detector's thread, with the ring's lock held: copy what is new.
    pub fn pull(&self, ring: &RingBuffer, now_ns: u64) {
        if !self.armed.load(Ordering::Acquire) {
            return;
        }
        let Ok(mut guard) = self.state.try_lock() else {
            // Taken by a command thread for a moment. The cursor has not
            // moved, so the next pull catches up.
            return;
        };
        let s = &mut *guard;
        if s.frozen || s.gap || s.rate == 0 {
            return;
        }
        let Some(cursor) = s.cursor.as_mut() else {
            s.cursor = Some(ring.write_pos());
            return;
        };
        let new = ring.pending_since(*cursor);
        if new == 0 {
            return;
        }
        // More than one pull takes: the detector stalled, audio would be
        // skipped, and the clock with it.
        if new > s.scratch.capacity() {
            s.gap = true;
            return;
        }
        // The buffer is full: stop, rather than keep a slice of the end with
        // a hole before it.
        if new > s.samples.capacity() - s.samples.len() {
            s.frozen = true;
            return;
        }
        s.scratch.clear();
        ring.read_since(cursor, &mut s.scratch, new);
        let new = s.scratch.len();
        if s.first_ns.is_none() {
            let back = (new as f64 * 1e9 / s.rate as f64) as u64;
            s.first_ns = Some(now_ns.saturating_sub(back));
        }
        s.samples.extend_from_slice(&s.scratch);
        if s.samples.len() == s.samples.capacity() {
            s.frozen = true;
        }
    }

    /// The detector's thread: the transport stopped. A capture that started
    /// stops here; one that has not started waits for the transport.
    pub fn idle(&self) {
        if !self.armed.load(Ordering::Acquire) {
            return;
        }
        if let Ok(mut s) = self.state.try_lock() {
            if s.first_ns.is_some() {
                s.frozen = true;
            } else {
                // Not started: the ring moves on without us while stopped.
                s.cursor = None;
            }
        }
    }

    /// Stop taking audio and hand over what was kept, once: the tap is
    /// disarmed by it, so a second close before the next Take is loaded gets
    /// `None` and no second pass over the same audio. `None` when nothing
    /// usable was kept.
    pub fn capture(&self) -> Option<CapturedAudio> {
        if !self.armed.swap(false, Ordering::AcqRel) {
            return None;
        }
        let mut s = self.state.lock().ok()?;
        s.frozen = true;
        if s.gap {
            return None;
        }
        let first_ns = s.first_ns?;
        Some(CapturedAudio {
            samples: std::mem::take(&mut s.samples),
            rate: s.rate,
            first_ns,
            detection_delay_ns: s.detection_delay_ns,
        })
    }
}

// ---------------------------------------------------------------------------
// The last heard Take, kept for "Hear bar N" (c5b1)
// ---------------------------------------------------------------------------
//
// The pitch pass used to free a Take's audio the moment its grade was
// published. It now moves it into one slot instead: the LAST heard Take, in
// RAM only (never on disk, never in an event), replaced by the next Take's,
// emptied when the input stops (`stop_evaluation`) or on `forget_heard_take`.
// A Take the tap never kept (input off, MIDI, a pull gap, no capture) puts
// nothing here, and the answer to "is it held?" is simply no.
//
// **Not the audio callback either.** The slot is touched by the notes thread
// (`timing::start_notes_pass`) and by command threads, never by the detector
// or the output callback. A bar is played back through the jam's listen-back
// path, `take::TakeHandoff::set_play`, unchanged: the callback sees a
// `TakePlayback` like any other and retires it through `TakeParking`.

/// How far before a bar's downbeat a hear-back starts: an attack the player
/// put a little early is still in it.
pub const HEAR_LEAD_MS: f64 = 150.0;
/// How far past the bar's end it runs: the last note's ring, and the input's
/// round trip, which puts every attack a little after the beat it was played to.
pub const HEAR_TAIL_MS: f64 = 300.0;
/// A short fade at each cut edge, so the slice does not start or stop with a
/// click of its own. Not a gain: the level is the input's, as it was heard.
const HEAR_FADE_MS: f64 = 5.0;

/// `HeardTakeSlot::playing` when no hear-back is in the take slot.
/// Generations count up from 0 one `set_play` at a time and never reach it.
const NO_HEAR: u64 = u64::MAX;

/// One heard Take: its audio and where its bars fall in it.
#[derive(Debug)]
pub struct HeardTake {
    /// The Take's `notes_serial`, which its grade carries to the frontend.
    pub serial: u64,
    pub samples: Vec<f32>,
    pub rate: u32,
    /// `clock::now_ns` of `samples[0]`.
    pub first_ns: u64,
    /// Bar `k` of the Take (1-based, after the count-in) is `bars[k - 1]`: the
    /// sample it opens on and the one the next bar opens on. Only bars wholly
    /// inside the audio, from bar 1 on without a hole.
    pub bars: Vec<(usize, usize)>,
}

/// Why a hear-back was not started. The frontend shows nothing for any of them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HearRefused {
    /// No Take is held, or the one held is not the Take asked about.
    NotHeld,
    /// Bar 0, a range backwards, or a bar the audio does not hold.
    NoSuchBar,
}

impl std::fmt::Display for HearRefused {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            HearRefused::NotHeld => "that Take's audio is not held",
            HearRefused::NoSuchBar => "that Take holds no such bar",
        })
    }
}

impl HeardTake {
    /// A capture and the Take's complete bars in wall ms
    /// (`ScheduleRun::bar_spans_ms`), with `samples[0]` at `start_ms` on the
    /// same wall clock. The notes thread's job: the buffer is shrunk to what
    /// the Take used (the tap sized it for `MAX_TAKE_SECS`), which copies it
    /// once and frees the rest here.
    pub fn new(serial: u64, audio: CapturedAudio, start_ms: f64, bars_ms: &[(f64, f64)]) -> Self {
        let mut samples = audio.samples;
        samples.shrink_to_fit();
        let rate = audio.rate;
        let at = |ms: f64| ((ms - start_ms) * rate as f64 / 1000.0).round();
        let mut bars = Vec::with_capacity(bars_ms.len());
        for &(open, close) in bars_ms {
            let (a, b) = (at(open), at(close));
            if a < 0.0 || b > samples.len() as f64 || b <= a {
                break;
            }
            bars.push((a as usize, b as usize));
        }
        Self { serial, samples, rate, first_ns: audio.first_ns, bars }
    }

    /// What it costs in memory: its buffer, at four bytes a sample.
    pub fn bytes(&self) -> usize {
        self.samples.capacity() * std::mem::size_of::<f32>()
    }

    /// The samples bars `from_bar..=to_bar` cover (1-based), with
    /// [`HEAR_LEAD_MS`] before and [`HEAR_TAIL_MS`] after, as far as the
    /// audio goes.
    pub fn span(&self, from_bar: u32, to_bar: u32) -> Result<std::ops::Range<usize>, HearRefused> {
        if from_bar == 0 || to_bar < from_bar || to_bar as usize > self.bars.len() {
            return Err(HearRefused::NoSuchBar);
        }
        let lead = (HEAR_LEAD_MS * self.rate as f64 / 1000.0) as usize;
        let tail = (HEAR_TAIL_MS * self.rate as f64 / 1000.0) as usize;
        let start = self.bars[from_bar as usize - 1].0.saturating_sub(lead);
        let end = (self.bars[to_bar as usize - 1].1 + tail).min(self.samples.len());
        Ok(start..end)
    }
}

/// The Take's bar lines where its audio has them, for [`HeardTake::new`]
/// (c5b1b, review L4): `ScheduleRun::bar_spans_ms` moved by the Take's
/// calibrated offset (`TakeCalibration::offset_ms`, its input's latency as
/// the grader measured it) less the detector's delay: the same shift
/// `score::notes::lookups` gives every expected attack before it looks in
/// the audio. Without a grade (the pass failed) they stay where the beat map
/// has them. The notes thread's arithmetic; no lock.
pub fn bars_as_heard(bars_ms: &[(f64, f64)], offset_ms: Option<f64>, detection_delay_ms: f64) -> Vec<(f64, f64)> {
    let shift = offset_ms.map_or(0.0, |offset| offset - detection_delay_ms);
    bars_ms.iter().map(|&(open, close)| (open + shift, close + shift)).collect()
}

/// The copy a hear-back plays, faded in and out at its edges.
fn faded_copy(samples: &[f32], rate: u32) -> Vec<f32> {
    let mut out = samples.to_vec();
    let fade = ((HEAR_FADE_MS * rate as f64 / 1000.0) as usize).min(out.len() / 2);
    let n = out.len();
    for i in 0..fade {
        let g = i as f32 / fade as f32;
        out[i] *= g;
        out[n - 1 - i] *= g;
    }
    out
}

/// A hear-back's copy, cut and ready for the take slot.
pub struct HearSlice {
    pub pcm: Vec<f32>,
    pub rate: u32,
    /// The slot's epoch when the copy was cut, read under the same lock: a
    /// forget since (the input stopped) refuses the hand-over (c5b1c, L3).
    epoch: u64,
}

impl HearSlice {
    pub fn length_ms(&self) -> u64 {
        (self.pcm.len() as f64 * 1000.0 / self.rate.max(1) as f64).round() as u64
    }
}

/// What `hear_take` answers: the playback's generation (the number
/// `take-playback-ended` will carry) and how long it runs.
#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HearBack {
    pub generation: u64,
    pub length_ms: u64,
}

/// What `heard_take` answers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeldTake {
    pub held: bool,
    /// Complete bars of the Take held, from bar 1. 0 when not held.
    pub bars: u32,
}

/// The one "last heard Take" slot, and the hear-back it is playing.
pub struct HeardTakeSlot {
    take: Mutex<Option<HeardTake>>,
    /// Moved by every [`Self::forget`], under `take`'s lock. A pass that read
    /// it before a forget cannot keep its audio after one: the input stopped
    /// while the pitch pass was running, and nothing outlives that.
    epoch: AtomicU64,
    /// The `set_play` generation of the hear-back in the take slot, or
    /// [`NO_HEAR`]. Only that playback is ever stopped from here.
    playing: AtomicU64,
}

pub type SharedHeardTake = Arc<HeardTakeSlot>;

impl HeardTakeSlot {
    pub fn new() -> SharedHeardTake {
        Arc::new(Self { take: Mutex::new(None), epoch: AtomicU64::new(0), playing: AtomicU64::new(NO_HEAR) })
    }

    /// Read before the pitch pass starts; handed back to [`Self::keep`].
    pub fn epoch(&self) -> u64 {
        self.epoch.load(Ordering::Acquire)
    }

    /// The notes thread, after the grade is published: this Take is now the
    /// last one heard. The one it replaces is freed here, outside the lock.
    /// Refused (and `take` freed here too) after a forget since `epoch` was
    /// read, or when a later Take is already held. `true` when kept.
    pub fn keep(&self, take: HeardTake, epoch: u64) -> bool {
        let (old, kept) = {
            let mut slot = self.take.lock().unwrap_or_else(|e| e.into_inner());
            let stale = self.epoch.load(Ordering::Acquire) != epoch
                || slot.as_ref().is_some_and(|held| held.serial > take.serial);
            if stale {
                (Some(take), false)
            } else {
                (slot.replace(take), true)
            }
        };
        drop(old);
        kept
    }

    /// Empty the slot: the input stopped, or `forget_heard_take`. A command
    /// thread's job; the buffer is freed outside the lock. A hear-back already
    /// playing has its own copy and plays on until it ends or is stopped.
    pub fn forget(&self) {
        let old = {
            let mut slot = self.take.lock().unwrap_or_else(|e| e.into_inner());
            self.epoch.fetch_add(1, Ordering::AcqRel);
            slot.take()
        };
        drop(old);
    }

    /// Whether the Take with this serial is held, and how many bars.
    pub fn held(&self, serial: u64) -> HeldTake {
        let slot = self.take.lock().unwrap_or_else(|e| e.into_inner());
        match slot.as_ref().filter(|t| t.serial == serial) {
            Some(t) => HeldTake { held: true, bars: t.bars.len() as u32 },
            None => HeldTake { held: false, bars: 0 },
        }
    }

    /// The memory the held Take costs, in bytes; 0 when none is.
    pub fn held_bytes(&self) -> usize {
        self.take.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map_or(0, HeardTake::bytes)
    }

    /// Cut bars `from_bar..=to_bar` of the Take `serial` out of the slot:
    /// a copy, made on the calling (command) thread.
    pub fn slice(&self, serial: u64, from_bar: u32, to_bar: u32) -> Result<HearSlice, HearRefused> {
        let slot = self.take.lock().unwrap_or_else(|e| e.into_inner());
        let take = slot.as_ref().filter(|t| t.serial == serial).ok_or(HearRefused::NotHeld)?;
        let range = take.span(from_bar, to_bar)?;
        let epoch = self.epoch.load(Ordering::Acquire);
        Ok(HearSlice { pcm: faded_copy(&take.samples[range], take.rate), rate: take.rate, epoch })
    }

    /// Hand a slice to the audio thread through the jam's listen-back path.
    /// The caller holds the app state's lock and has seen the transport
    /// stopped, so a Start (which cuts under the same lock) cannot slip
    /// between the hand-over and the record of its generation.
    ///
    /// Refused when the slot was forgotten since the slice was cut (c5b1c,
    /// review L3: the input stopped, and none of the player's audio may play
    /// or stay in the take slot after that). The epoch is compared, and the
    /// generation recorded, under the held Take's lock, which every forget
    /// takes to move the epoch: a forget either came first (refused here) or
    /// comes after the claim is recorded, and its `clear` then takes the
    /// slice out. Lock order: state (the caller's) → held Take → `retired` /
    /// `play`, the order the review's table already gives; nothing that holds
    /// `retired` or `play` takes the held Take's lock.
    pub fn start(&self, handoff: &TakeHandoff, slice: HearSlice) -> Result<HearBack, String> {
        let length_ms = slice.length_ms();
        let outcome = {
            let _held = self.take.lock().unwrap_or_else(|e| e.into_inner());
            if self.epoch.load(Ordering::Acquire) != slice.epoch {
                Err(slice)
            } else {
                let generation = handoff
                    .set_play(Some(TakePlayback { pcm: Arc::new(slice.pcm), sample_rate: slice.rate }))
                    .ok_or_else(|| "the bar could not be handed to the audio engine".to_string())?;
                self.playing.store(generation, Ordering::Release);
                Ok(generation)
            }
        };
        match outcome {
            Ok(generation) => Ok(HearBack { generation, length_ms }),
            // the copy is freed here, outside the lock
            Err(slice) => {
                drop(slice);
                Err("the input stopped: that Take's audio is no longer held".into())
            }
        }
    }

    /// `stop_hear_take`: stop the hear-back `generation` named, and nothing
    /// else. `true` when it was still in the slot.
    pub fn stop(&self, handoff: &TakeHandoff, generation: u64) -> bool {
        self.stop_with(handoff, generation, || {})
    }

    /// [`Self::stop`], with `between` run after the take slot is emptied and
    /// before the claim is dropped, so a test can put a Start's `cut` there.
    /// The slot is emptied FIRST (c5b1c, review L1): while the claim is
    /// still recorded, a racing `cut` either clears the slot itself or finds
    /// it already empty, and never raises the transport over a hear-back.
    fn stop_with(&self, handoff: &TakeHandoff, generation: u64, between: impl FnOnce()) -> bool {
        if generation == NO_HEAR || self.playing.load(Ordering::Acquire) != generation {
            return false;
        }
        let cleared = handoff.clear_play_if(generation);
        between();
        // a Start's cut or a newer hear-back may have moved it: then it is theirs
        let _ = self.playing.compare_exchange(generation, NO_HEAR, Ordering::AcqRel, Ordering::Acquire);
        handoff.drain_retired();
        cleared
    }

    /// A Start: whatever hear-back is in the take slot, playing or finished
    /// (a finished one still holds the slot, and the take branch runs before
    /// the click), is taken out before the transport flag rises. One atomic
    /// swap when there is none. A jam's listen-back is left alone.
    pub fn cut(&self, handoff: &TakeHandoff) -> bool {
        let generation = self.playing.swap(NO_HEAR, Ordering::AcqRel);
        generation != NO_HEAR && handoff.clear_play_if(generation)
    }

    /// The input stopping (`playing_too`: it ends the Session, so a bar
    /// still playing goes too) or `forget_heard_take` (a finished hear-back
    /// only; a playing bar plays out): take the hear-back's slice out of the
    /// take slot, so none of the player's audio stays there and a finished
    /// one no longer stops a jam take from starting (review L1). Then drain
    /// what the audio thread handed back. Command thread; nothing new on the
    /// callback, which retires its own copy on its next buffer as it does
    /// after any cut, for the NEXT drain (the input's stop drains again once
    /// the analyzer has joined). `true` when it cleared the slot.
    pub fn clear(&self, handoff: &TakeHandoff, playing_too: bool) -> bool {
        self.clear_with(handoff, playing_too, || {})
    }

    /// [`Self::clear`], with `between` run after the take slot is emptied and
    /// before the claim is dropped (a test's seam). Slot first, claim second
    /// (c5b1c, review L1): a Start whose `cut` lands between the two finds
    /// the claim, and the slot already empty; one landing before them clears
    /// it itself, and this `clear_play_if` then misses (whichever bumps the
    /// generation first wins). A Start can no longer see no claim while the
    /// hear-back still holds the take slot.
    fn clear_with(&self, handoff: &TakeHandoff, playing_too: bool, between: impl FnOnce()) -> bool {
        let generation = self.playing.load(Ordering::Acquire);
        let mut cleared = false;
        if generation != NO_HEAR && (playing_too || handoff.has_ended(generation)) {
            cleared = handoff.clear_play_if(generation);
            between();
            // a Start's cut, a stop or a newer hear-back may have moved it
            let _ = self.playing.compare_exchange(generation, NO_HEAR, Ordering::AcqRel, Ordering::Acquire);
        }
        handoff.drain_retired();
        cleared
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ring_with(n: usize, from: f32, ring: &mut RingBuffer) {
        let v: Vec<f32> = (0..n).map(|i| from + i as f32).collect();
        ring.write(&v);
    }

    #[test]
    fn keeps_every_sample_in_order_from_the_first_pull_and_stamps_the_first() {
        let tap = TakeAudioTap::new();
        tap.set_rate(1000);
        tap.arm(None);
        let mut ring = RingBuffer::new(4000);
        ring_with(10, 0.0, &mut ring);
        // The first pull only finds its place: what came before is not the Take's.
        tap.pull(&ring, 1_000_000_000);
        ring_with(5, 100.0, &mut ring);
        tap.pull(&ring, 2_000_000_000);
        ring_with(7, 200.0, &mut ring);
        tap.pull(&ring, 2_007_000_000);
        tap.idle();
        ring_with(3, 300.0, &mut ring);
        tap.pull(&ring, 2_010_000_000);
        let got = tap.capture().expect("a capture");
        assert_eq!(got.samples.len(), 12);
        assert_eq!(&got.samples[..5], &[100.0, 101.0, 102.0, 103.0, 104.0]);
        assert_eq!(got.samples[5], 200.0);
        // Five samples at 1 kHz arrived by 2 s: the first was at 1.995 s.
        assert_eq!(got.first_ns, 1_995_000_000);
        // Once: a second close does not grade the same audio again.
        assert!(tap.capture().is_none());
    }

    /// The detector says its delay once, as it starts, and Takes come and go
    /// after that: every capture still carries it.
    #[test]
    fn the_detectors_delay_outlives_arming_and_disarming() {
        let tap = TakeAudioTap::new();
        tap.set_rate(1000);
        tap.set_detection_delay_ns(24_520_833);
        tap.arm(None);
        tap.disarm();
        tap.arm(None);
        let mut ring = RingBuffer::new(4000);
        ring_with(10, 0.0, &mut ring);
        tap.pull(&ring, 1_000_000_000);
        ring_with(5, 100.0, &mut ring);
        tap.pull(&ring, 2_000_000_000);
        let got = tap.capture().expect("a capture");
        assert_eq!(got.detection_delay_ns, 24_520_833);
    }

    #[test]
    fn a_full_buffer_stops_rather_than_grows() {
        let tap = TakeAudioTap::new();
        tap.arm(Some(10)); // 1200 samples of room, 5 a pull
        let mut ring = RingBuffer::new(100);
        tap.pull(&ring, 0);
        for i in 0..400 {
            ring_with(4, 0.0, &mut ring);
            tap.pull(&ring, i);
        }
        let got = tap.capture().unwrap();
        // 300 pulls of 4 fill it exactly; the rest are refused, not squeezed in.
        assert_eq!(got.samples.len(), 1200);
        assert_eq!(got.samples.capacity(), 1200);
        assert!(got.samples.iter().all(|s| *s < 4.0));
    }

    #[test]
    fn a_pull_that_fell_behind_spoils_the_clock_and_nothing_is_handed_over() {
        let tap = TakeAudioTap::new();
        tap.arm(Some(100)); // 50 samples a pull at most
        let mut ring = RingBuffer::new(1000);
        tap.pull(&ring, 0);
        // Exactly one pull's worth is not a gap.
        ring_with(50, 0.0, &mut ring);
        tap.pull(&ring, 1);
        // One sample more than a pull takes is.
        ring_with(51, 0.0, &mut ring);
        tap.pull(&ring, 2);
        assert!(tap.capture().is_none());
    }

    #[test]
    fn exactly_one_pull_of_audio_is_kept_whole() {
        let tap = TakeAudioTap::new();
        tap.arm(Some(100));
        let mut ring = RingBuffer::new(1000);
        tap.pull(&ring, 0);
        ring_with(50, 0.0, &mut ring);
        tap.pull(&ring, 1_000_000_000);
        assert_eq!(tap.capture().unwrap().samples.len(), 50);
    }

    #[test]
    fn the_device_rate_sizes_the_buffer_and_it_is_touched_before_the_take() {
        let tap = TakeAudioTap::new();
        tap.arm(Some(96_000));
        let s = tap.state.lock().unwrap();
        assert_eq!(s.rate, 96_000);
        assert_eq!(s.samples.capacity(), MAX_SAMPLES.min(96_000 * MAX_TAKE_SECS as usize));
        assert!(s.samples.is_empty());
        assert_eq!(s.scratch.capacity(), 48_000);
    }

    #[test]
    fn nothing_is_kept_unless_armed() {
        let tap = TakeAudioTap::new();
        let mut ring = RingBuffer::new(100);
        tap.pull(&ring, 0);
        ring_with(10, 0.0, &mut ring);
        tap.pull(&ring, 1);
        assert!(tap.capture().is_none());
        tap.arm(None);
        tap.disarm();
        assert!(tap.capture().is_none());
    }

    // ---- The last heard Take (c5b1) ----

    /// `secs` of audio at `rate`, sample `i` = `i`, in a buffer with room to
    /// spare as the tap leaves it.
    fn captured(rate: u32, secs: f64) -> CapturedAudio {
        let n = (rate as f64 * secs) as usize;
        let mut samples = Vec::with_capacity(n * 3);
        samples.extend((0..n).map(|i| i as f32));
        CapturedAudio { samples, rate, first_ns: 7, detection_delay_ns: 0 }
    }

    /// Bars of `bar_ms` from `first_ms` on, `n` of them.
    fn bars(first_ms: f64, bar_ms: f64, n: usize) -> Vec<(f64, f64)> {
        (0..n).map(|k| (first_ms + k as f64 * bar_ms, first_ms + (k + 1) as f64 * bar_ms)).collect()
    }

    fn take(serial: u64) -> HeardTake {
        // 1 kHz, 10 s; a one-bar count-in of 2 s, then bars of 2 s from 2 s.
        HeardTake::new(serial, captured(1000, 10.0), 0.0, &bars(2000.0, 2000.0, 4))
    }

    #[test]
    fn a_kept_take_is_shrunk_to_its_length_and_maps_its_bars_after_the_count_in() {
        let t = take(1);
        assert_eq!(t.samples.len(), 10_000);
        assert_eq!(t.samples.capacity(), 10_000, "the tap's spare room was not freed");
        assert_eq!(t.bytes(), 40_000);
        assert_eq!(t.bars, vec![(2000, 4000), (4000, 6000), (6000, 8000), (8000, 10_000)]);
        assert_eq!(t.first_ns, 7);
        // 40 s at 48 kHz, the size the brief names: 7.68 MB and no more.
        let long = HeardTake::new(1, captured(48_000, 40.0), 0.0, &[]);
        assert_eq!(long.bytes(), 7_680_000);
    }

    #[test]
    fn bar_arithmetic_takes_its_margins_and_refuses_what_is_not_there() {
        let t = take(1);
        // bar 1 with the lead and the tail: into the count-in, into bar 2
        assert_eq!(t.span(1, 1), Ok(1850..4300));
        assert_eq!(t.span(2, 3), Ok(3850..8300));
        // the last bar: the tail runs out with the audio
        assert_eq!(t.span(4, 4), Ok(7850..10_000));
        assert_eq!(t.span(0, 1), Err(HearRefused::NoSuchBar));
        assert_eq!(t.span(3, 2), Err(HearRefused::NoSuchBar));
        assert_eq!(t.span(5, 5), Err(HearRefused::NoSuchBar), "a bar past the end");
        assert_eq!(t.span(4, 5), Err(HearRefused::NoSuchBar));
    }

    #[test]
    fn a_short_capture_holds_only_the_bars_wholly_inside_it() {
        // 7 s of audio: bars 1 and 2 end inside it, bar 3 (6-8 s) does not.
        let t = HeardTake::new(1, captured(1000, 7.0), 0.0, &bars(2000.0, 2000.0, 4));
        assert_eq!(t.bars.len(), 2);
        assert_eq!(t.span(3, 3), Err(HearRefused::NoSuchBar));
        // audio that starts after bar 1 opened holds nothing at all
        let late = HeardTake::new(1, captured(1000, 10.0), 2500.0, &bars(2000.0, 2000.0, 4));
        assert!(late.bars.is_empty());
        // and a capture with no complete bar
        assert!(HeardTake::new(1, captured(1000, 1.0), 0.0, &bars(2000.0, 2000.0, 4)).bars.is_empty());
    }

    #[test]
    fn the_slot_keeps_replaces_and_forgets() {
        let slot = HeardTakeSlot::new();
        assert_eq!(slot.held(1), HeldTake { held: false, bars: 0 });
        assert!(slot.keep(take(1), slot.epoch()));
        assert_eq!(slot.held(1), HeldTake { held: true, bars: 4 });
        // replaced by the next
        assert!(slot.keep(take(2), slot.epoch()));
        assert!(!slot.held(1).held);
        assert!(slot.held(2).held);
        // an earlier Take's pass finishing late does not replace a later one
        assert!(!slot.keep(take(1), slot.epoch()));
        assert!(slot.held(2).held);
        // emptied by forget (the input's stop, `forget_heard_take`)
        slot.forget();
        assert!(!slot.held(2).held);
        assert_eq!(slot.held_bytes(), 0);
    }

    #[test]
    fn a_pass_that_outlives_the_inputs_stop_keeps_nothing() {
        let slot = HeardTakeSlot::new();
        let epoch = slot.epoch(); // the pass starts
        slot.forget(); // the input stops while it runs
        assert!(!slot.keep(take(3), epoch));
        assert!(!slot.held(3).held);
    }

    #[test]
    fn a_slice_is_a_faded_copy_of_the_bars_asked_for() {
        let slot = HeardTakeSlot::new();
        assert_eq!(slot.slice(1, 1, 1).err(), Some(HearRefused::NotHeld));
        slot.keep(take(1), slot.epoch());
        assert_eq!(slot.slice(2, 1, 1).err(), Some(HearRefused::NotHeld), "another Take's serial");
        assert_eq!(slot.slice(1, 5, 5).err(), Some(HearRefused::NoSuchBar));
        let s = slot.slice(1, 2, 2).unwrap();
        assert_eq!(s.rate, 1000);
        // bar 2 is 4000..6000: 150 before, 300 after
        assert_eq!(s.pcm.len(), 6300 - 3850);
        assert_eq!(s.length_ms(), 2450);
        // faded at the edges, untouched in the middle
        assert_eq!(s.pcm[0], 0.0);
        assert_eq!(s.pcm[100], 3950.0);
        assert!(s.pcm[s.pcm.len() - 1] < 1.0);
    }

    #[test]
    fn a_start_cuts_its_own_hear_back_and_a_stop_names_it() {
        let handoff = TakeHandoff::new();
        let slot = HeardTakeSlot::new();
        slot.keep(take(1), slot.epoch());
        // nothing to cut: one swap, nothing touched
        assert!(!slot.cut(&handoff));
        let first = slot.start(&handoff, slot.slice(1, 1, 1).unwrap()).unwrap();
        assert_eq!(first.length_ms, 2450);
        assert!(handoff.is_playing_back());
        // a stop for another playback does nothing
        assert!(!slot.stop(&handoff, first.generation + 1));
        assert!(handoff.is_playing_back());
        // a Start clears it, finished or not, and only once
        assert!(slot.cut(&handoff));
        assert!(!handoff.is_playing_back());
        assert!(!slot.cut(&handoff));
        // its own stop clears it
        let second = slot.start(&handoff, slot.slice(1, 2, 2).unwrap()).unwrap();
        assert!(slot.stop(&handoff, second.generation));
        assert!(!handoff.is_playing_back());
        assert!(!slot.stop(&handoff, second.generation), "stopped twice");
    }

    #[test]
    fn a_start_leaves_a_jams_listen_back_alone() {
        let handoff = TakeHandoff::new();
        let slot = HeardTakeSlot::new();
        slot.keep(take(1), slot.epoch());
        slot.start(&handoff, slot.slice(1, 1, 1).unwrap()).unwrap();
        // the jam's screen plays a take over the top
        handoff.set_play(Some(TakePlayback { pcm: Arc::new(vec![0.0; 8]), sample_rate: 48_000 }));
        assert!(!slot.cut(&handoff));
        assert!(handoff.is_playing_back(), "the jam's take was cut");
    }

    #[test]
    fn forgetting_the_take_leaves_a_playing_bar_to_finish() {
        let handoff = TakeHandoff::new();
        let slot = HeardTakeSlot::new();
        slot.keep(take(1), slot.epoch());
        let h = slot.start(&handoff, slot.slice(1, 1, 1).unwrap()).unwrap();
        slot.forget();
        assert!(handoff.is_playing_back());
        assert!(slot.stop(&handoff, h.generation));
    }

    /// c5b1c, review L3: a bar cut before the input's stop is not handed to
    /// the audio thread after it, even when a pass begun during the stop has
    /// kept the same Take again; one cut after it is.
    #[test]
    fn a_slice_cut_before_a_forget_is_refused_after_it() {
        let handoff = TakeHandoff::new();
        let slot = HeardTakeSlot::new();
        slot.keep(take(1), slot.epoch());
        let before = slot.slice(1, 1, 1).unwrap();
        slot.forget();
        assert!(slot.start(&handoff, before).is_err(), "a bar played after the input stopped");
        assert!(!handoff.is_playing_back());
        // a pass that read the new epoch keeps the Take again: still refused
        let before = slot.slice(1, 1, 1);
        assert!(before.is_err(), "nothing held after the forget");
        slot.keep(take(1), slot.epoch());
        let stale = HearSlice { pcm: vec![0.0; 8], rate: 48_000, epoch: slot.epoch() - 1 };
        assert!(slot.start(&handoff, stale).is_err());
        assert!(!handoff.is_playing_back());
        // a bar cut now plays
        let now = slot.slice(1, 1, 1).unwrap();
        assert!(slot.start(&handoff, now).is_ok());
        assert!(handoff.is_playing_back());
    }

    /// c5b1b, review L1: `forget_heard_take` takes a FINISHED hear-back's
    /// slice out of the take slot (a playing one plays out); the input's
    /// stop takes it playing or not. A jam's take is never touched, and the
    /// audio thread's retired copies are drained.
    #[test]
    fn a_forget_clears_a_finished_hear_back_and_the_inputs_stop_any() {
        let handoff = TakeHandoff::new();
        let slot = HeardTakeSlot::new();
        slot.keep(take(1), slot.epoch());
        // nothing in the slot: nothing to clear
        assert!(!slot.clear(&handoff, true));
        // a bar still playing: a forget leaves it to finish
        let h = slot.start(&handoff, slot.slice(1, 1, 1).unwrap()).unwrap();
        assert!(!slot.clear(&handoff, false));
        assert!(handoff.is_playing_back());
        // it runs off its end: now a forget clears it, and a jam take may start
        handoff.note_ended(h.generation);
        assert!(slot.clear(&handoff, false), "a finished bar held the take slot");
        assert!(!handoff.is_playing_back());
        // and once its ending was reported (the event thread got there first)
        let h = slot.start(&handoff, slot.slice(1, 2, 2).unwrap()).unwrap();
        handoff.note_ended(h.generation);
        assert_eq!(handoff.take_ended(), Some(h.generation));
        assert!(slot.clear(&handoff, false));
        assert!(!handoff.is_playing_back());
        // the input's stop takes a bar that is still playing
        slot.start(&handoff, slot.slice(1, 3, 3).unwrap()).unwrap();
        assert!(slot.clear(&handoff, true));
        assert!(!handoff.is_playing_back());
        // never a jam's own take, finished or not
        slot.start(&handoff, slot.slice(1, 1, 1).unwrap()).unwrap();
        let jam = handoff.set_play(Some(TakePlayback { pcm: Arc::new(vec![0.0; 8]), sample_rate: 48_000 })).unwrap();
        handoff.note_ended(jam);
        assert!(!slot.clear(&handoff, true));
        assert!(handoff.is_playing_back(), "the jam's take was cleared");
    }

    /// c5b1c, review L1: a Start whose `cut` lands between a clear's (or a
    /// stop's) two steps raises the transport over an EMPTY take slot, so the
    /// click starts at once rather than behind the player's bar. With the
    /// claim dropped first (the old order), the cut found nothing to cut and
    /// the bar was still in the slot here.
    #[test]
    fn a_start_between_a_clears_two_steps_finds_the_take_slot_empty() {
        let handoff = TakeHandoff::new();
        let slot = HeardTakeSlot::new();
        slot.keep(take(1), slot.epoch());
        for playing_too in [true, false] {
            let h = slot.start(&handoff, slot.slice(1, 1, 1).unwrap()).unwrap();
            if !playing_too {
                handoff.note_ended(h.generation);
            }
            let cleared = slot.clear_with(&handoff, playing_too, || {
                // the Start: engine lock → state lock → cut, then the transport
                slot.cut(&handoff);
                assert!(!handoff.is_playing_back(), "the transport rose over the hear-back");
            });
            assert!(cleared);
            assert!(!handoff.is_playing_back());
            assert!(!slot.cut(&handoff), "the claim outlived the clear");
        }
        // the same for `stop_hear_take`
        let h = slot.start(&handoff, slot.slice(1, 2, 2).unwrap()).unwrap();
        let stopped = slot.stop_with(&handoff, h.generation, || {
            slot.cut(&handoff);
            assert!(!handoff.is_playing_back(), "the transport rose over the hear-back");
        });
        assert!(stopped);
        assert!(!slot.cut(&handoff), "the claim outlived the stop");
        // a cut that got in BEFORE both steps: the clear finds nothing left
        let h = slot.start(&handoff, slot.slice(1, 3, 3).unwrap()).unwrap();
        assert!(slot.cut(&handoff));
        assert!(!slot.clear(&handoff, true));
        assert!(!slot.stop(&handoff, h.generation));
        // and a newer hear-back started between the steps keeps its claim
        let old = slot.start(&handoff, slot.slice(1, 1, 1).unwrap()).unwrap();
        let mut newer = None;
        slot.stop_with(&handoff, old.generation, || {
            newer = Some(slot.start(&handoff, slot.slice(1, 2, 2).unwrap()).unwrap());
        });
        assert!(handoff.is_playing_back());
        assert!(slot.stop(&handoff, newer.unwrap().generation), "the newer hear-back lost its claim");
    }

    /// c5b1b, review L1: what the audio thread retired is drained by a clear.
    #[test]
    fn a_clear_drains_what_the_audio_thread_retired() {
        let handoff = TakeHandoff::new();
        let slot = HeardTakeSlot::new();
        let pcm = Arc::new(vec![0.5f32; 100]);
        let mut parking = crate::take::TakeParking::new();
        parking.retire_pcm(&handoff, pcm.clone());
        assert_eq!(Arc::strong_count(&pcm), 2, "the retired copy is held");
        slot.clear(&handoff, false);
        assert_eq!(Arc::strong_count(&pcm), 1, "the retired copy was not drained");
    }

    /// c5b1b, review L4: the bars are moved where the grader looks for their
    /// attacks: by the calibrated offset less the detector's delay, the shift
    /// `score::notes::lookups` gives a due beat (`due + offset - delay`).
    #[test]
    fn the_bars_are_moved_by_the_calibrated_input_latency() {
        let on_the_map = bars(2000.0, 2000.0, 4);
        // 120 ms of input latency, a detector 20 ms behind its attacks
        let heard = bars_as_heard(&on_the_map, Some(120.0), 20.0);
        assert_eq!(heard[0], (2100.0, 4100.0));
        assert_eq!(heard[3], (8100.0, 10_100.0));
        let t = HeardTake::new(1, captured(1000, 11.0), 0.0, &heard);
        assert_eq!(t.bars[0], (2100, 4100), "bar 1 opens where its downbeat was played");
        assert_eq!(t.span(1, 1), Ok(1950..4400));
        // no grade: the beat map's own lines
        assert_eq!(bars_as_heard(&on_the_map, None, 20.0), on_the_map);
        // an input ahead of the map (a negative offset) moves them earlier
        assert_eq!(bars_as_heard(&on_the_map, Some(-30.0), 0.0)[0], (1970.0, 3970.0));
    }
}
