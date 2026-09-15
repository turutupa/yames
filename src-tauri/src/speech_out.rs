//! Where the coach's voice waits for the audio thread.
//!
//! The coach used to speak through a stream of its own — rodio opened the
//! device a second time, on the device's default config, and played the
//! line. That worked, and it was wrong for one reason: rodio 0.19 offers no
//! say in which outputs it writes to. A musician who has put the click on
//! outputs 3-4 and their v-drums on 1-2 would get the click where they asked
//! for it and the coach in the drummer's monitors, out of a second stream
//! they never chose.
//!
//! So the coach goes through the metronome's own stream. One device, one
//! stream, one pair of outputs for everything the app plays. The shape is
//! [`crate::take::TakeHandoff`]'s, and for the same reasons: the callback
//! may not block to read this and may not allocate, so the slot carries a
//! generation counter it compares with one relaxed load per buffer, and
//! whatever a change replaces is handed BACK rather than dropped on the
//! audio thread.
//!
//! Everything expensive happens before the clip gets here. The WAV is
//! decoded, folded to mono, resampled to the device's rate and scaled to the
//! coach's volume on the thread that asked for the speech; the callback does
//! nothing but read samples and add them in.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

/// A line of speech, ready for the callback: mono, at the device's rate,
/// already at the coach's volume.
#[derive(Clone)]
pub struct SpeechClip {
    pub pcm: Arc<Vec<f32>>,
}

/// Something the audio thread has finished with, on its way to a thread
/// that is allowed to free memory. Nothing reads it; owning the `Arc` until
/// `drain_retired` runs is the entire job. See `take::Retired`.
#[allow(dead_code)]
enum Retired {
    Pcm(Arc<Vec<f32>>),
}

/// How many retired clips the speaking thread may be behind on. A line of
/// coaching is a second or two of audio and they do not overlap — one in
/// flight and one being cut off is the whole traffic.
const SPEECH_RETIRED_CAP: usize = 4;

pub struct SpeechHandoff {
    clip: Mutex<Option<SpeechClip>>,
    generation: AtomicU64,
    /// Raised by the audio thread when a line runs off its own end, lowered
    /// by the thread that is waiting for it. An atomic and not a channel
    /// because the callback must not allocate, and the waiter is already
    /// awake every 20 ms.
    done: AtomicBool,
    retired: Mutex<Vec<Retired>>,
}

/// Shared handle to the speech slot: cloned into the audio thread and into
/// whatever is speaking.
pub type SharedSpeech = Arc<SpeechHandoff>;

/// As much of the engine's open stream as speech needs: where to leave a
/// line, and what rate to resample it to.
#[derive(Clone)]
pub struct SpeechOut {
    pub handoff: SharedSpeech,
    pub sample_rate: u32,
}

/// Hand-written rather than derived: `TtsSnapshot` is `Debug`, and the only
/// thing worth printing here is the rate. Deriving would put a minute of
/// samples in a log line.
impl std::fmt::Debug for SpeechOut {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SpeechOut")
            .field("sample_rate", &self.sample_rate)
            .finish_non_exhaustive()
    }
}

impl Default for SpeechHandoff {
    fn default() -> Self {
        Self::new()
    }
}

impl SpeechHandoff {
    pub fn new() -> Self {
        Self {
            clip: Mutex::new(None),
            generation: AtomicU64::new(0),
            done: AtomicBool::new(false),
            retired: Mutex::new(Vec::with_capacity(SPEECH_RETIRED_CAP)),
        }
    }

    /// Speaking thread: hand the callback a line to say, or `None` to cut
    /// one off. Clears any stale "it finished" flag, so a line started
    /// straight after an interrupted one cannot collect the old one's
    /// ending.
    pub fn set_clip(&self, clip: Option<SpeechClip>) {
        self.drain_retired();
        self.done.store(false, Ordering::Release);
        if let Ok(mut slot) = self.clip.lock() {
            *slot = clip;
            // Bumped AFTER the write, so a callback that sees the new
            // generation is guaranteed to find the new value behind the
            // lock.
            drop(slot);
            self.generation.fetch_add(1, Ordering::Release);
        }
    }

    /// Speaking thread: has the line finished since anyone last asked?
    /// Consumes the flag.
    pub fn finished(&self) -> bool {
        self.done.swap(false, Ordering::AcqRel)
    }

    /// Audio thread: say a line ran off its end.
    pub(crate) fn note_done(&self) {
        self.done.store(true, Ordering::Release);
    }

    /// Audio thread: read the slot if its generation moved. `Some(new
    /// value)` when it did; `None` when nothing changed or the lock was
    /// busy — in which case the caller leaves its cached generation alone
    /// and the next buffer tries again.
    pub(crate) fn poll(&self, seen: &mut u64) -> Option<Option<SpeechClip>> {
        let gen = self.generation.load(Ordering::Acquire);
        if gen == *seen {
            return None;
        }
        let slot = self.clip.try_lock().ok()?;
        *seen = gen;
        Some(slot.clone())
    }

    /// Audio thread: give a finished clip back rather than dropping it.
    /// Dropping the last `Arc` of a minute of speech would free it here.
    /// A full retirement list is not an error — it means the speaking
    /// thread has not come back yet, and the clip waits one more buffer.
    pub(crate) fn retire(&self, pcm: Arc<Vec<f32>>) {
        if let Ok(mut r) = self.retired.try_lock() {
            if r.len() < SPEECH_RETIRED_CAP {
                r.push(Retired::Pcm(pcm));
            }
        }
    }

    /// Speaking thread: drop everything the audio thread handed back.
    pub fn drain_retired(&self) {
        if let Ok(mut r) = self.retired.lock() {
            r.clear();
        }
    }
}

/// Mix a line of speech into a buffer, on the chosen pair of outputs.
///
/// Added over what is already there rather than replacing it, because the
/// coach speaks over a dimmed metronome — `commands::tts_speak` turns the
/// click down for the length of the line and back up after, and that dim is
/// the mix. Clamped per sample, the same way the click bus is.
///
/// Returns true when the line ran out inside this buffer, which is what
/// raises the "finished" flag exactly once.
///
/// `pair` has already been through `engine::effective_pair`, so the writes
/// are in range. Nothing here allocates, locks or branches on anything
/// behind a lock.
#[inline]
pub(crate) fn mix_speech(
    data: &mut [f32],
    channels: usize,
    pair: usize,
    frames: usize,
    pcm: &[f32],
    pos: &mut usize,
) -> bool {
    for f in 0..frames {
        let v = match pcm.get(*pos) {
            Some(&v) => v,
            // Nothing left. The rest of the buffer is whatever the click
            // put there, untouched.
            None => return true,
        };
        *pos += 1;
        let base = f * channels;
        if channels == 1 {
            data[base] = (data[base] + v).clamp(-1.0, 1.0);
        } else {
            let l = base + 2 * pair;
            data[l] = (data[l] + v).clamp(-1.0, 1.0);
            data[l + 1] = (data[l + 1] + v).clamp(-1.0, 1.0);
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clip(n: usize) -> SpeechClip {
        SpeechClip {
            pcm: Arc::new(vec![0.5; n]),
        }
    }

    #[test]
    fn the_callback_only_pays_for_a_change() {
        let h = SpeechHandoff::new();
        let mut seen = 0u64;
        // Nothing has been said yet, so nothing to read.
        assert!(h.poll(&mut seen).is_none());
        h.set_clip(Some(clip(4)));
        let got = h.poll(&mut seen).expect("a new line must be picked up");
        assert!(got.is_some());
        // ...and the buffer after that reads nothing at all.
        assert!(h.poll(&mut seen).is_none());
    }

    #[test]
    fn a_new_line_clears_the_old_ones_ending() {
        let h = SpeechHandoff::new();
        h.note_done();
        h.set_clip(Some(clip(2)));
        assert!(
            !h.finished(),
            "a line just started cannot have finished already"
        );
    }

    #[test]
    fn an_ending_is_collected_exactly_once() {
        let h = SpeechHandoff::new();
        h.note_done();
        assert!(h.finished());
        assert!(!h.finished(), "the ending was reported twice");
    }

    #[test]
    fn speech_lands_on_the_chosen_pair_and_nowhere_else() {
        // Four outputs, the coach on 3-4.
        let mut data = vec![0.0f32; 4 * 3];
        let pcm = [0.25f32, 0.25, 0.25];
        let mut pos = 0usize;
        assert!(!mix_speech(&mut data, 4, 1, 3, &pcm, &mut pos));
        for f in 0..3 {
            assert_eq!(data[f * 4], 0.0, "outputs 1-2 must be left alone");
            assert_eq!(data[f * 4 + 1], 0.0, "outputs 1-2 must be left alone");
            assert_eq!(data[f * 4 + 2], 0.25);
            assert_eq!(data[f * 4 + 3], 0.25);
        }
        assert_eq!(pos, 3);
    }

    #[test]
    fn speech_adds_to_the_click_rather_than_replacing_it() {
        let mut data = vec![0.5f32; 4];
        let pcm = [0.25f32, 0.25];
        let mut pos = 0usize;
        mix_speech(&mut data, 2, 0, 2, &pcm, &mut pos);
        assert_eq!(data, vec![0.75, 0.75, 0.75, 0.75]);
    }

    #[test]
    fn a_line_running_out_mid_buffer_is_reported_once() {
        let mut data = vec![0.0f32; 2 * 4];
        let pcm = [0.25f32, 0.25];
        let mut pos = 0usize;
        // Four frames asked for, two samples left.
        assert!(mix_speech(&mut data, 2, 0, 4, &pcm, &mut pos));
        assert_eq!(pos, 2);
        assert_eq!(data[4], 0.0, "the rest of the buffer stays as it was");
        // ...and asking again from the same position says so straight away.
        assert!(mix_speech(&mut data, 2, 0, 4, &pcm, &mut pos));
    }

    #[test]
    fn a_mono_device_hears_the_coach_too() {
        let mut data = vec![0.0f32; 3];
        let pcm = [0.5f32, 0.5, 0.5];
        let mut pos = 0usize;
        mix_speech(&mut data, 1, 0, 3, &pcm, &mut pos);
        assert_eq!(data, vec![0.5, 0.5, 0.5]);
    }

    #[test]
    fn speech_never_leaves_the_rails() {
        let mut data = vec![0.9f32; 2];
        let pcm = [0.9f32];
        let mut pos = 0usize;
        mix_speech(&mut data, 2, 0, 1, &pcm, &mut pos);
        assert_eq!(data, vec![1.0, 1.0], "the sum has to be clamped");
    }
}
