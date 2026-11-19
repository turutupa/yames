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

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::audio_input::RingBuffer;

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
}
