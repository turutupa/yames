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
    /// Raised when the stream the line was going out of is being torn down —
    /// a device change, or a pair the open stream is too narrow for. The
    /// speaking thread turns it into `Interrupted` rather than waiting out a
    /// completion that is never coming.
    cut: AtomicBool,
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
            cut: AtomicBool::new(false),
            retired: Mutex::new(Vec::with_capacity(SPEECH_RETIRED_CAP)),
        }
    }

    /// Speaking thread: hand the callback a line to say, or `None` to cut
    /// one off. Clears any stale "it finished" flag, so a line started
    /// straight after an interrupted one cannot collect the old one's
    /// ending.
    /// Deliberately does NOT clear `cut`. A device change can land while
    /// the WAV is still being decoded — before the clip ever reaches this
    /// slot — and clearing here would swallow it, leaving a line resampled
    /// for the old device's rate to play out in full on the new one.
    /// Clearing a stale cut is the speaking thread's job, once, before it
    /// starts; see `tts::play_wav_path`.
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

    /// Command thread: the stream this line was going out of is going away.
    ///
    /// Take the line back and say why. A line already resampled for the old
    /// device's rate would play flat or sharp on the new one, and half of it
    /// at the wrong speed is worse than none of it — the same reasoning
    /// `MetronomeEngine::set_device` gives for dropping a kit decoded at the
    /// old rate. The speaking thread reports `Interrupted`, which is not an
    /// error: the musician asked for the device change.
    pub fn cut(&self) {
        if let Ok(mut slot) = self.clip.lock() {
            *slot = None;
            drop(slot);
            self.generation.fetch_add(1, Ordering::Release);
        }
        self.cut.store(true, Ordering::Release);
    }

    /// Speaking thread: was the line taken away by a restart? Consumes the
    /// flag, so one restart cuts one line.
    pub fn was_cut(&self) -> bool {
        self.cut.swap(false, Ordering::AcqRel)
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

    /// Audio thread: try to give a finished clip back rather than dropping
    /// it — dropping the last `Arc` of a minute of speech would `free()`
    /// under the mixer.
    ///
    /// `Err(item)` when the list is busy or full, and the caller MUST keep
    /// what comes back: letting it fall out of scope here is the free this
    /// exists to prevent. [`SpeechParking`] is where it waits.
    fn try_retire(&self, pcm: Arc<Vec<f32>>) -> Result<(), Arc<Vec<f32>>> {
        match self.retired.try_lock() {
            Ok(mut r) if r.len() < SPEECH_RETIRED_CAP => {
                r.push(Retired::Pcm(pcm));
                Ok(())
            }
            _ => Err(pcm),
        }
    }

    /// Speaking thread: drop everything the audio thread handed back.
    pub fn drain_retired(&self) {
        if let Ok(mut r) = self.retired.lock() {
            r.clear();
        }
    }
}

/// The audio thread's parking spaces for lines it finished with while the
/// retirement list was busy, flushed once per buffer.
///
/// [`crate::take::TakeParking`] applied to speech, and for the same reason:
/// `try_retire` can refuse, and a refused `Arc` that falls out of scope on
/// the audio thread is exactly the `free()` under the mixer the engine is
/// built to avoid. Two spaces rather than four — lines of coaching do not
/// overlap, so one being cut off while another is handed over is already
/// more traffic than this ever sees. If even these fill, the buffer is
/// LEAKED rather than freed here: a few hundred kilobytes lost is a price,
/// a `free()` in the callback is not.
pub(crate) struct SpeechParking {
    parked: [Option<Arc<Vec<f32>>>; 2],
}

impl SpeechParking {
    pub(crate) fn new() -> Self {
        Self { parked: [None, None] }
    }

    pub(crate) fn retire(&mut self, handoff: &SpeechHandoff, pcm: Arc<Vec<f32>>) {
        if let Err(pcm) = handoff.try_retire(pcm) {
            match self.parked.iter_mut().find(|s| s.is_none()) {
                Some(slot) => *slot = Some(pcm),
                None => std::mem::forget(pcm),
            }
        }
    }

    pub(crate) fn flush(&mut self, handoff: &SpeechHandoff) {
        for slot in self.parked.iter_mut() {
            if let Some(pcm) = slot.take() {
                if let Err(back) = handoff.try_retire(pcm) {
                    *slot = Some(back);
                    return;
                }
            }
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
    fn a_line_taken_back_by_a_restart_says_so_once() {
        let h = SpeechHandoff::new();
        h.set_clip(Some(clip(64)));
        assert!(!h.was_cut());
        h.cut();
        assert!(h.was_cut(), "a restart has to be reportable");
        assert!(!h.was_cut(), "one restart cuts one line");
        let mut seen = 0u64;
        assert!(
            matches!(h.poll(&mut seen), Some(None)),
            "and the callback is told to go quiet on its next buffer"
        );
    }

    #[test]
    fn a_cut_survives_the_clip_that_arrives_after_it() {
        // The ordering bug this pins down: a device change lands while the
        // WAV is still being decoded, so it is raised BEFORE the clip
        // reaches the slot. `set_clip` used to clear the flag, and a line
        // resampled for the old device's rate then played out in full on
        // the new one. Only the speaking thread clears it, once, before it
        // starts — which is `was_cut`'s consuming swap.
        let h = SpeechHandoff::new();
        h.cut();
        h.set_clip(Some(clip(8)));
        assert!(
            h.was_cut(),
            "a device change during the decode was swallowed"
        );
        assert!(
            !h.was_cut(),
            "and having been collected, it does not cut the next line too"
        );
    }

    #[test]
    fn a_clip_the_retirement_list_refuses_is_parked_not_freed() {
        // The bug: `retire` dropped the `Arc` when `try_retire` said no,
        // which is a `free()` on the audio thread — the one thing the
        // handoff exists to prevent.
        let h = SpeechHandoff::new();
        // Fill the list, so the next hand-back is refused.
        for _ in 0..SPEECH_RETIRED_CAP {
            assert!(h.try_retire(Arc::new(vec![0.0; 4])).is_ok());
        }
        let pcm = Arc::new(vec![0.25f32; 512]);
        let watch = Arc::downgrade(&pcm);
        let mut parking = SpeechParking::new();
        parking.retire(&h, pcm);
        assert!(
            watch.upgrade().is_some(),
            "the buffer was freed on the audio thread"
        );

        // The speaking thread comes back; the parked clip goes where it
        // was always headed.
        h.drain_retired();
        parking.flush(&h);
        assert!(watch.upgrade().is_some(), "still owned, now by the list");
        h.drain_retired();
        assert!(
            watch.upgrade().is_none(),
            "and freed on the thread that is allowed to free it"
        );
    }

    #[test]
    fn parking_that_overflows_leaks_rather_than_frees() {
        // Needs the speaking thread to be gone for six hand-backs running,
        // which no real sequence produces. A few hundred kilobytes lost is
        // a price; a `free()` under the mixer is not.
        let h = SpeechHandoff::new();
        for _ in 0..SPEECH_RETIRED_CAP {
            assert!(h.try_retire(Arc::new(vec![0.0; 4])).is_ok());
        }
        let mut parking = SpeechParking::new();
        let watched: Vec<_> = (0..3)
            .map(|_| {
                let pcm = Arc::new(vec![0.1f32; 16]);
                let w = Arc::downgrade(&pcm);
                parking.retire(&h, pcm);
                w
            })
            .collect();
        for w in &watched {
            assert!(w.upgrade().is_some(), "something was freed on the callback");
        }
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
