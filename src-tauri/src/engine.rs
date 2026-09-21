use crate::jam::{
    JamBandState, JamLane, JamPosition, JamSlot, JamTable, JamTick, DRIFT_MAX_SECS,
};
use crate::onset::SharedTempoContext;
use crate::speech_out::{mix_speech, SharedSpeech, SpeechClip, SpeechHandoff, SpeechOut};
use crate::state::SharedState;
use crate::take::SharedTake;
use crate::timing::{BeatLog, BeatTick};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rodio::Source;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

// ---------------------------------------------------------------------------
// CoreAudio output latency query (macOS)
// ---------------------------------------------------------------------------

/// Find a CoreAudio device ID by name.
#[cfg(target_os = "macos")]
fn find_coreaudio_device_by_name(target_name: &str) -> Option<u32> {
    use coreaudio_sys::*;
    use std::mem;
    use std::ptr;

    unsafe {
        let prop = AudioObjectPropertyAddress {
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain,
        };
        let mut size: u32 = 0;
        let status = AudioObjectGetPropertyDataSize(
            kAudioObjectSystemObject,
            &prop,
            0,
            ptr::null(),
            &mut size,
        );
        if status != 0 {
            return None;
        }

        let count = size as usize / mem::size_of::<AudioDeviceID>();
        let mut device_ids = vec![0 as AudioDeviceID; count];
        let status = AudioObjectGetPropertyData(
            kAudioObjectSystemObject,
            &prop,
            0,
            ptr::null(),
            &mut size,
            device_ids.as_mut_ptr() as *mut _,
        );
        if status != 0 {
            return None;
        }

        for &did in &device_ids {
            let name_prop = AudioObjectPropertyAddress {
                mSelector: kAudioObjectPropertyName,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain,
            };
            let mut cf_name: core_foundation_sys::string::CFStringRef = ptr::null();
            let mut name_size = mem::size_of::<core_foundation_sys::string::CFStringRef>() as u32;
            let status = AudioObjectGetPropertyData(
                did,
                &name_prop,
                0,
                ptr::null(),
                &mut name_size,
                &mut cf_name as *mut _ as *mut _,
            );
            if status != 0 || cf_name.is_null() {
                continue;
            }

            let len = core_foundation_sys::string::CFStringGetLength(cf_name);
            let mut buf = vec![0u8; (len * 4) as usize + 1];
            let ok = core_foundation_sys::string::CFStringGetCString(
                cf_name,
                buf.as_mut_ptr() as *mut _,
                buf.len() as isize,
                core_foundation_sys::string::kCFStringEncodingUTF8,
            );
            core_foundation_sys::base::CFRelease(cf_name as *const _);
            if ok == 0 {
                continue;
            }

            let rust_name = std::ffi::CStr::from_ptr(buf.as_ptr() as *const _).to_string_lossy();
            if rust_name == target_name {
                return Some(did);
            }
        }
    }
    None
}

/// Query the total output latency of an audio device in frames.
/// If `device_name` is provided, finds that device; otherwise queries the default.
/// Returns device_latency + safety_offset + stream_latency.
#[cfg(target_os = "macos")]
fn query_coreaudio_output_latency_frames(device_name: Option<&str>) -> Option<u32> {
    use coreaudio_sys::*;
    use std::mem;
    use std::ptr;

    unsafe {
        let mut size: u32;

        let device_id = if let Some(name) = device_name {
            find_coreaudio_device_by_name(name)?
        } else {
            // Get the default output device
            let property_address = AudioObjectPropertyAddress {
                mSelector: kAudioHardwarePropertyDefaultOutputDevice,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain,
            };
            let mut did: AudioDeviceID = kAudioObjectUnknown;
            size = mem::size_of::<AudioDeviceID>() as u32;
            let status = AudioObjectGetPropertyData(
                kAudioObjectSystemObject,
                &property_address,
                0,
                ptr::null(),
                &mut size,
                &mut did as *mut _ as *mut _,
            );
            if status != 0 || did == kAudioObjectUnknown {
                return None;
            }
            did
        };

        let mut total_frames: u32 = 0;

        // 2. Device latency (kAudioDevicePropertyLatency)
        let prop = AudioObjectPropertyAddress {
            mSelector: kAudioDevicePropertyLatency,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain,
        };
        let mut latency: u32 = 0;
        size = mem::size_of::<u32>() as u32;
        let status = AudioObjectGetPropertyData(
            device_id,
            &prop,
            0,
            ptr::null(),
            &mut size,
            &mut latency as *mut _ as *mut _,
        );
        if status == 0 {
            total_frames += latency;
        }

        // 3. Safety offset (kAudioDevicePropertySafetyOffset)
        let prop = AudioObjectPropertyAddress {
            mSelector: kAudioDevicePropertySafetyOffset,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain,
        };
        let mut safety: u32 = 0;
        size = mem::size_of::<u32>() as u32;
        let status = AudioObjectGetPropertyData(
            device_id,
            &prop,
            0,
            ptr::null(),
            &mut size,
            &mut safety as *mut _ as *mut _,
        );
        if status == 0 {
            total_frames += safety;
        }

        // 4. Stream latency (kAudioStreamPropertyLatency on the first output stream)
        let prop = AudioObjectPropertyAddress {
            mSelector: kAudioDevicePropertyStreams,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain,
        };
        let mut stream_size: u32 = 0;
        let status =
            AudioObjectGetPropertyDataSize(device_id, &prop, 0, ptr::null(), &mut stream_size);
        if status == 0 && stream_size >= mem::size_of::<AudioStreamID>() as u32 {
            let count = stream_size as usize / mem::size_of::<AudioStreamID>();
            let mut streams = vec![0 as AudioStreamID; count];
            let status = AudioObjectGetPropertyData(
                device_id,
                &prop,
                0,
                ptr::null(),
                &mut stream_size,
                streams.as_mut_ptr() as *mut _,
            );
            if status == 0 && !streams.is_empty() {
                let stream_prop = AudioObjectPropertyAddress {
                    mSelector: kAudioStreamPropertyLatency,
                    mScope: kAudioObjectPropertyScopeGlobal,
                    mElement: kAudioObjectPropertyElementMain,
                };
                let mut stream_latency: u32 = 0;
                size = mem::size_of::<u32>() as u32;
                let status = AudioObjectGetPropertyData(
                    streams[0],
                    &stream_prop,
                    0,
                    ptr::null(),
                    &mut size,
                    &mut stream_latency as *mut _ as *mut _,
                );
                if status == 0 {
                    total_frames += stream_latency;
                }
            }
        }

        Some(total_frames)
    }
}

#[cfg(not(target_os = "macos"))]
fn query_coreaudio_output_latency_frames(_device_name: Option<&str>) -> Option<u32> {
    None
}

// Embedded click sounds -- 8 kits, THREE STROKES EACH.
//
// A bar of 6/8 has a beat one, a beat four and four plain beats, and until
// 2026-09-15 the first two were one file at two volumes. The owner listened
// to that and heard nothing: the same transient 2 dB down, passing once a
// bar, is under the ear's threshold. A real metronome marks three levels with
// three SOUNDS, because pitch and timbre are what the ear separates. So every
// preset now ships a middle stroke of its own instrument —
// `plans/CLICK_ACCENTS.md` Part 1 has the decision and the per-kit table,
// `scripts/sounds/render_click.py` the five recorded ones,
// `scripts/sounds/rebuild.py` point 7 the two synthesised ones, and
// `SoundKit::mid_id` the wiring. `DrumMid` is the exception and is mixed
// below, exactly as `DrumAccent` is.
const CLICK_HIGH: &[u8] = include_bytes!("../sounds/click_high.wav");
/// Click's middle: the same sine tick at 980 Hz, the geometric mean of the
/// 1200 above and the 800 below, damped at 140/s rather than 80 so that it
/// carries less weight at a peak the convention fixes. `rebuild.py`.
const CLICK_MID: &[u8] = include_bytes!("../sounds/click_mid.wav");
const CLICK_LOW: &[u8] = include_bytes!("../sounds/click_low.wav");
/// RECORDED since 2026-09-14, where it used to be a pair of synthesised
/// blocks: Virtuosity's small woodblock over its big one, cut by
/// `scripts/sounds/render_click.py`, which is the generator of record for
/// this pair and for the four below. `rebuild.py` no longer claims them.
const WOOD_HIGH: &[u8] = include_bytes!("../sounds/wood_high.wav");
/// Wood's middle: the SAME small block as the downbeat, struck at vl3 and cut
/// exactly as the downbeat is — same trim floor, same fade, same 250 ms. The
/// level is the file's peak, 0.814. It was the trim for a day, at -22 dB, and
/// that gated the stroke: the fade began while the block was still at 8-10%
/// of full scale and took it to nothing in 12 ms, where the downbeat rings on
/// for another 180. Virtuosity Drums, CC0.
const WOOD_MID: &[u8] = include_bytes!("../sounds/wood_mid.wav");
const WOOD_LOW: &[u8] = include_bytes!("../sounds/wood_low.wav");
const BEEP_HIGH: &[u8] = include_bytes!("../sounds/beep_high.wav");
/// Beep's middle: 760 Hz between 880 and 660, damped at 53/s rather than 30
/// for the reason `CLICK_MID` is damped at 140. `rebuild.py`.
const BEEP_MID: &[u8] = include_bytes!("../sounds/beep_mid.wav");
const BEEP_LOW: &[u8] = include_bytes!("../sounds/beep_low.wav");
const DRUM_HIGH: &[u8] = include_bytes!("../sounds/drum_high.wav");
const DRUM_LOW: &[u8] = include_bytes!("../sounds/drum_low.wav");
const DRUM_METAL: &[u8] = include_bytes!("../sounds/drum_metal.wav");
const DRUM_CRASH: &[u8] = include_bytes!("../sounds/drum_crash.wav");
/// The mid-band layer the drum accent was missing. See `drum_body` in
/// `scripts/sounds/rebuild.py` for why a 6 ms transient could not do this job.
const DRUM_BODY: &[u8] = include_bytes!("../sounds/drum_body.wav");
/// The second kit: ONE snare drum at two dynamics, with a kick under the
/// accent. Both are synthesised whole, so their balance is fixed in the files.
///
/// This kit has been wrong twice, in two different ways, and both are worth
/// knowing before touching it.
///
/// It was a backbeat over a SIDE-STICK, and the owner's verdict was "super
/// underwhelming — I was expecting to feel it and all I got was a shy sound".
/// The side-stick was 60 ms of 780 Hz wood — three beats in four that sounded
/// like the `wood` kit and carried a quarter of `drum_low`'s energy.
///
/// The side-stick became a MID TOM, which fixed the level and left a musical
/// problem: "the 'big' accent on snare really sounds out of place compared to
/// the normal snare beats". A bar played snare, tom, tom, tom — two
/// instruments alternating, which is a drum fill and not a pulse. The plain
/// beat is now the same snare struck softly, which is what a metronome accent
/// has always been: the same drum hit harder. See `_snare` and `snare_low` in
/// `scripts/sounds/rebuild.py` for the measurements and what it cost.
///
/// AND IT IS A RECORDING NOW — the Studio kit's own snare, hardest layer over
/// softest, folded to mono by `scripts/sounds/render_click.py`. Everything
/// above still holds and is why the recording is the same drum twice rather
/// than two drums; the synthesis those three rejections produced is kept in
/// `rebuild.py`, unreachable, as the record of what it cost to learn.
const SNARE_HIGH: &[u8] = include_bytes!("../sounds/snare_high.wav");
/// And the middle of its bar is the same drum a third time: Studio's layer 3,
/// driven at 1.1 where the accent is driven at 1.5 and the beat at 0.8, and
/// peaking at 0.921 rather than a convention. Layer 2 is the more distinct
/// sound of the two candidates and is the LOUDEST of this drum's four layers,
/// so at any peak that puts it under the downbeat on a laptop it sits OVER
/// the downbeat K-weighted. `render_click.py`'s `snare_mid` has the numbers.
/// DRSKit via the Studio kit, CC BY 4.0.
const SNARE_MID: &[u8] = include_bytes!("../sounds/snare_mid.wav");
const SNARE_LOW: &[u8] = include_bytes!("../sounds/snare_low.wav");
/// A drummer's count-off: a stick-shot off the rim for the accent and a
/// cross-stick for the beat, both out of Virtuosity's snare. The jam's
/// count-in plays these same two files, so being counted in and practising to
/// Sticks are the same sound (`JamCountInSound::Sticks`).
const STICKS_HIGH: &[u8] = include_bytes!("../sounds/sticks_high.wav");
/// The middle is the same stick-shot played at vl3 — a drummer's secondary
/// accent is the same stroke with less arm behind it. vl4 was the other
/// candidate and measured LOUDER than the downbeat once normalised, which is
/// `render_click.py`'s "a hard stroke is quieter" arriving where it was least
/// wanted. Virtuosity Drums, CC0.
const STICKS_MID: &[u8] = include_bytes!("../sounds/sticks_mid.wav");
const STICKS_LOW: &[u8] = include_bytes!("../sounds/sticks_low.wav");
/// One cowbell at two dynamics — the hard layer and the middle one. The
/// library's softest is 26 dB down and is a fingertip on the lip of the bell,
/// which at the beat's peak is a tick with a room behind it.
const COWBELL_HIGH: &[u8] = include_bytes!("../sounds/cowbell_high.wav");
/// The library's three dynamics, one per tier — and the preset where the
/// peak had to stop being a convention. Its strokes are 26 dB apart in the
/// library and under 1.5 dB apart once each is normalised, because a bell's
/// peak is one clang and its loudness is the ring after it: the SOFTEST
/// stroke at the beat's usual 0.900 came back 1.26 dB LOUDER than the hardest
/// at 0.970. So the peaks are solved for from the ladder backwards — 0.970,
/// 0.771 and 0.763, 2.1 dB a step through the band a laptop radiates.
///
/// `COWBELL_LOW` is therefore the one pre-existing click file this pass
/// re-cut: it was the middle dynamic and is the fingertip tap now. A middle
/// built out of the DOWNBEAT'S stroke at a distant mic blend was tried first
/// and measured better on every number that has a number — 2.49 dB under,
/// spectral distance 0.43 where three dynamics of one bell manage 0.11 — and
/// was the wrong sound: 13.3% of its energy over 5.6 kHz against the
/// downbeat's 4.2%, and 42 ms longer than it. `render_click.py`'s
/// `cowbell_mid` has the whole table. Virtuosity Drums, CC0.
const COWBELL_MID: &[u8] = include_bytes!("../sounds/cowbell_mid.wav");
const COWBELL_LOW: &[u8] = include_bytes!("../sounds/cowbell_low.wav");
/// The RECORDED answer to [`SoundKit::Drum`], and built the way that one is so
/// the owner can put the two side by side: a kick under a struck head for the
/// accent, a closed hat for the beat. The difference is where the summing and
/// the saturation happen — `drum_accent` is mixed in [`SoundBank::new`] from
/// three shipped files, and this arrives already summed and already through
/// the same tanh curve, because there is nothing about it left for the engine
/// to retune. See `render_click.py`.
const KIT_HIGH: &[u8] = include_bytes!("../sounds/kit_high.wav");
/// And its middle is the backbeat with no kick under it: Studio's snare at
/// layer 3, alone. 6/8 on a kit is kick on one, snare on four, hats between,
/// so what the middle of the bar is missing is the kick — a huge thing to
/// hear and almost nothing to measure, because a 200 Hz-4 kHz band-pass
/// cannot see a kick at all. At the middles' usual peak that left it 0.83 dB
/// under its own downbeat, which is the half-decibel the owner already
/// listened to and could not hear, so the file's peak carries it the rest of
/// the way: 0.807, and 2.06 dB under. DRSKit via the Studio kit, CC BY 4.0.
const KIT_MID: &[u8] = include_bytes!("../sounds/kit_mid.wav");
const KIT_LOW: &[u8] = include_bytes!("../sounds/kit_low.wav");
const CHIME_UP: &[u8] = include_bytes!("../sounds/chime_up.wav");
const CHIME_DOWN: &[u8] = include_bytes!("../sounds/chime_down.wav");

// ---------------------------------------------------------------------------
// Sound decoding
// ---------------------------------------------------------------------------

/// Decode an embedded WAV to mono f32 samples resampled to `target_sr`.
/// How loud a plain beat is against an accent, which always plays at 1.0.
///
/// This was 0.75. Measured, that put the accent only 1.6 to 2.2 dB above the
/// beat for click, wood and beep — the samples themselves are very slightly
/// *quieter* on the accent, so the engine's gain was doing all the work and
/// not quite enough of it. A downbeat you have to listen for is not a
/// downbeat. 0.65 puts the difference at 3 to 4 dB, which is where an accent
/// reads without shouting.
pub(crate) const BEAT_GAIN: f32 = 0.65;

/// How loud a MIDDLE accent is — the second and later group starts of a bar,
/// the stroke that gives 6/8 a beat one and a beat four that are not the same
/// event (`plans/CLICK_ACCENTS.md`).
///
/// **1.0, and that is not a bug.** This was 0.80: the accent file, quieter.
/// The owner listened to it and heard nothing, and was right — 1.94 dB off a
/// transient that passes once a bar is under what an ear reports. A real
/// metronome marks three levels with three SOUNDS, so every preset ships a
/// middle stroke of its own instrument now, and the level lives in that
/// file's peak (0.930, between the accent's 0.970 and the beat's 0.900) and
/// in how the stroke was cut. `SoundKit::mid_id` names the files;
/// `scripts/sounds/render_click.py`'s header explains why the peak alone
/// builds no ladder and what does.
///
/// THE CONSTANT STAYS, at 1.0, because a tuning should be one line. If the
/// middles come back too loud or too soft ACROSS EVERY KIT AT ONCE, this is
/// the number to move; if one kit is wrong, the recipe row for that kit's
/// `_mid` file is the place, because that is where a per-kit answer can
/// actually be given. Moving this trades against the whole table on
/// `every_medium_accent_sits_between_its_strong_and_its_beat`, which is
/// printed for exactly that conversation.
const MEDIUM_GAIN: f32 = 1.0;

/// Subdivisions, quieter again. Kept at the same ratio to `BEAT_GAIN` it had
/// at 0.75/0.35, so lifting the accent does not also raise the ticks between
/// beats relative to the beats themselves.
const SUB_GAIN: f32 = 0.30;

/// Resample `mono` from `source_sr` to `target_sr` with a windowed sinc.
    //
    // This was linear interpolation, which is a poor low-pass: it dulls the
    // transient and folds imaging back into the audible band. It matters here
    // because the samples ship at 44.1 kHz and most output devices run at 48,
    // so nearly every user hears a resampled click rather than the file — and
    // the brightest sounds, the ones carrying the attack, suffer the most.
    //
    // Cost is irrelevant: this runs once per sound when the bank is built, on
    // the setup path, never on the audio thread. A 25 ms click at 44.1 kHz is
    // about a thousand samples.
    // Half-width in source samples. 16 is well past the point where the
    // stop-band of a Blackman-windowed sinc stops being the limiting factor.
    // Downsampling has to band-limit to the NEW Nyquist, or it aliases.
                // sinc, scaled to the cutoff
                // Blackman window over the whole kernel
            // Normalising by the taps actually used keeps the level steady at
            // the edges, where half the kernel hangs off the end of the sample.
pub(crate) fn resample(mono: &[f32], source_sr: u32, target_sr: u32) -> Vec<f32> {
    if source_sr == target_sr {
        return mono.to_vec();
    }
    let ratio = target_sr as f64 / source_sr as f64;
    let out_len = (mono.len() as f64 * ratio).ceil() as usize;

    const HALF: i64 = 16;
    let cutoff = if ratio < 1.0 { ratio } else { 1.0 };

    (0..out_len)
        .map(|i| {
            let pos = i as f64 / ratio;
            let centre = pos.floor() as i64;
            let mut acc = 0.0f64;
            let mut norm = 0.0f64;
            for k in (centre - HALF + 1)..=(centre + HALF) {
                let x = pos - k as f64;
                let sinc = if x.abs() < 1e-9 {
                    cutoff
                } else {
                    (std::f64::consts::PI * cutoff * x).sin() / (std::f64::consts::PI * x)
                };
                let w = {
                    let t = (x + HALF as f64) / (2.0 * HALF as f64);
                    if !(0.0..=1.0).contains(&t) {
                        0.0
                    } else {
                        0.42 - 0.5 * (2.0 * std::f64::consts::PI * t).cos()
                            + 0.08 * (4.0 * std::f64::consts::PI * t).cos()
                    }
                };
                let tap = sinc * w;
                if k >= 0 {
                    if let Some(s) = mono.get(k as usize) {
                        acc += *s as f64 * tap;
                    }
                }
                norm += tap;
            }
            if norm.abs() > 1e-9 {
                (acc / norm) as f32
            } else {
                0.0
            }
        })
        .collect()
}

fn decode_wav(wav_bytes: &'static [u8], target_sr: u32) -> Vec<f32> {
    let cursor = Cursor::new(wav_bytes);
    let decoder = rodio::Decoder::new(cursor).expect("Failed to decode embedded WAV");
    let source_sr = decoder.sample_rate();
    let source_ch = decoder.channels() as usize;
    let raw: Vec<f32> = decoder.convert_samples::<f32>().collect();

    // Down-mix to mono
    let mono: Vec<f32> = if source_ch >= 2 {
        raw.chunks(source_ch)
            .map(|frame| frame.iter().sum::<f32>() / source_ch as f32)
            .collect()
    } else {
        raw
    };

    if source_sr == target_sr {
        return mono;
    }

    resample(&mono, source_sr, target_sr)
}

// ---------------------------------------------------------------------------
// Sound bank — all sounds pre-decoded at the output sample rate
// ---------------------------------------------------------------------------

/// The drums, their names and the banks behind them live in
/// [`crate::kit`] now: a kit is a folder with a manifest, `build.rs` walks
/// the shipped ones, and adding a kit is adding a folder rather than a
/// column in a table here. Re-exported so the rest of the engine, the
/// probe and the tests keep naming them where they always did.
pub use crate::kit::KitVoice;

/// Which drum kit a jam plays.
///
/// **An index and no longer an enum.** Five kits were five variants and a
/// `match`; the recorded kits arrive as folders somebody drops into
/// `sounds/kits` (`plans/JAM_SOUND.md` §5), and an enum would mean a Rust
/// change for each one — which is exactly the friction this pass removes.
/// The index is into the list `build.rs` generated, sorted, so it is the
/// same list on every machine.
///
/// It survives only to name a kit between the config and the loader. The
/// audio thread never sees one: by the time a table reaches the callback it
/// carries the decoded [`crate::kit::KitBank`] itself.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct JamKit(pub usize);

impl JamKit {
    /// Every kit the app ships, in the order the picker shows them.
    pub fn all() -> Vec<JamKit> {
        (0..crate::kit::shipped_count()).map(JamKit).collect()
    }

    /// The kit that sounds like the app already sounds, and the answer to
    /// every name nobody recognises.
    pub fn fallback() -> Self {
        Self(crate::kit::shipped_index("room").unwrap_or(0))
    }

    /// The name the contract uses (`Jam.kit` in `src/jam/types.ts`), which
    /// is the folder's own name.
    pub fn name(self) -> &'static str {
        crate::kit::shipped_manifest(self.0).map_or("room", |m| m.id.as_str())
    }

    /// Read a kit out of a config. **Unknown names are the fallback**, not
    /// an error: a jam saved by a later build that knows more kits must
    /// still play, and the safe default is the one the metronome already
    /// sounds like. Case is ignored, because a hand-edited store is a real
    /// thing.
    pub fn from_name(name: &str) -> Self {
        crate::kit::shipped_index(name).map_or_else(Self::fallback, Self)
    }
}

// ---------------------------------------------------------------------------
// The pitched voices — one synthesised bank per voice, per semitone
// ---------------------------------------------------------------------------
//
// EVERY PARTIAL IN THIS SECTION IS `sin(n · φ)` AND EVERY ENVELOPE IS
// POSITIVE. That is not a stylistic preference, it is what makes the tuning
// of nine instruments measurable rather than asserted.
//
// A sine of an integer multiple of the fundamental's phase is zero wherever
// the fundamental is, and multiplying by a positive scalar cannot move a
// zero crossing. So however elaborate a recipe gets — a slap's snap, an
// organ's drawbars, a pad's filter — the buffer's upward zero crossings
// still sit exactly on the fundamental's period, and
// `the_bass_bank_is_in_tune` / `the_keys_bank_is_in_tune` can read the pitch
// straight off the samples.
//
// Two things follow, and both are rules rather than suggestions:
//
// * **No noise layers.** A picked bass's click and a slap's snap are BANDS
//   OF HIGH HARMONICS with a very short decay, not filtered noise. They
//   sound the same and they cannot move a crossing.
// * **No time-domain filters.** "A saw through a low-pass" is built as a
//   harmonic series whose amplitudes carry the filter's MAGNITUDE response
//   ([`one_pole_magnitude`]). A real one-pole would also carry its phase
//   response, which shifts every partial by a different amount and turns
//   the tuning measurement into a guess.
//
// Nothing here runs on the audio thread: a bank is built once, when a
// device opens, and the voice a jam plays is chosen when the table is
// compiled.

/// Concert pitch. Every note in every bank is `440 × 2^((midi − 69) / 12)`.
const TUNING_HZ: f64 = 440.0;

/// The peak every note of every bank is normalised to — the same ceiling
/// the kit files carry, for the same reason: **the banks carry timbre, the
/// engine carries balance**. What holds a slap bass down against a fingered
/// one is `BASS_VOICE_TRIM` in `jam.rs`, not a quieter bank.
const VOICE_PEAK: f32 = 0.9;

/// The highest partial any recipe is allowed to place, as a fraction of the
/// sample rate. Anything at or above this is dropped rather than aliased —
/// a clav's eighth harmonic at the top of the keys range is 8.4 kHz, which
/// is fine at 44.1 kHz and would fold back at 16.
const PARTIAL_CEILING: f64 = 0.45;

/// A raised-cosine fade from 0 to 1 over `x ∈ [0, 1]`. Positive throughout,
/// so it can be used as an envelope without touching a zero crossing.
#[inline]
fn fade_in(x: f64) -> f64 {
    0.5 - 0.5 * (std::f64::consts::PI * x.clamp(0.0, 1.0)).cos()
}

/// The same curve the other way up: 1 down to 0.
#[inline]
fn fade_out(x: f64) -> f64 {
    0.5 + 0.5 * (std::f64::consts::PI * x.clamp(0.0, 1.0)).cos()
}

/// The magnitude response of a one-pole low-pass at `cutoff`, evaluated at
/// `freq`. Magnitude only — see the section note on why the phase is thrown
/// away deliberately.
#[inline]
fn one_pole_magnitude(freq: f64, cutoff: f64) -> f64 {
    1.0 / (1.0 + (freq / cutoff).powi(2)).sqrt()
}

/// One partial of a recipe: which harmonic, how loud, and how fast it dies.
///
/// `tau` is the exponential the partial decays on, in seconds; [`HELD`]
/// means it does not decay at all, which is what an organ drawbar does.
#[derive(Clone, Copy)]
struct Partial {
    n: u32,
    amp: f64,
    tau: f64,
}

/// A partial — or a whole note — that holds its level until the release.
const HELD: f64 = f64::MAX;

/// Sum a recipe's partials at one instant.
///
/// `phase` is `2π·f0·t` with `t` in seconds from the start of the note.
/// `top` is the highest harmonic this sample rate can carry; above it a
/// partial is dropped rather than folded back into the audible band.
#[inline]
fn partials_at(recipe: &[Partial], phase: f64, t: f64, top: u32) -> f64 {
    let mut v = 0.0;
    for p in recipe {
        if p.n > top {
            continue;
        }
        let a = if p.tau == HELD {
            p.amp
        } else {
            p.amp * (-t / p.tau).exp()
        };
        // Below a millionth of full scale a partial is arithmetic, not
        // sound; skipping it is what keeps a fourteen-partial slap from
        // costing fourteen sines for the whole of its tail.
        if a.abs() < 1e-6 {
            continue;
        }
        v += a * (p.n as f64 * phase).sin();
    }
    v
}

/// Everything one voice's note needs, so the nine recipes below are data
/// and there is one synthesiser rather than nine.
struct Recipe {
    /// How long the buffer is, in seconds. The table's cap usually cuts a
    /// note shorter; this is the longest it can ring.
    secs: f64,
    /// The fade-in at the front, in seconds. Two milliseconds is "does not
    /// click"; a hundred and eighty is a pad swelling.
    attack_secs: f64,
    /// The exponential the whole note decays on, or [`HELD`] for a voice
    /// that sustains until its release.
    body_tau: f64,
    /// How much of the tail is taken to true zero with a raised cosine.
    /// Rule 6 of `src-tauri/sounds/KITS.md`: land the decay on zero, do not
    /// cut it there.
    release_fraction: f64,
    /// The harmonics that make up the tone.
    partials: &'static [Partial],
    /// A one-pole low-pass applied to the partials' AMPLITUDES, as a
    /// multiple of the note's own fundamental — so the filter tracks the
    /// pitch instead of making the bottom of the range muddy and the top
    /// thin — clamped to the Hz range that follows it. `None` is no filter.
    filter: Option<(f64, f64, f64)>,
}

/// One note of one voice.
///
/// Runs once per note when a bank is built — never on the audio thread.
fn voice_note(recipe: &Recipe, midi: u8, sr: u32) -> Vec<f32> {
    let sr_f = sr as f64;
    let freq = TUNING_HZ * 2f64.powf((midi as f64 - 69.0) / 12.0);
    let len = (recipe.secs * sr_f) as usize;
    if len == 0 || freq <= 0.0 {
        return Vec::new();
    }
    let w = 2.0 * std::f64::consts::PI * freq / sr_f;
    let attack = (recipe.attack_secs * sr_f).max(1.0);
    let release_from = (len as f64 * (1.0 - recipe.release_fraction)) as usize;
    // The highest harmonic this rate can carry without folding back.
    let top = ((PARTIAL_CEILING * sr_f / freq) as u32).max(1);

    // The filter, resolved into per-partial gains once rather than per
    // sample. A one-pole's magnitude does not change with time, so this is
    // the whole of it.
    let filtered: Vec<Partial> = match recipe.filter {
        Some((mult, lo, hi)) => {
            let cutoff = (freq * mult).clamp(lo, hi);
            recipe
                .partials
                .iter()
                .map(|p| Partial {
                    amp: p.amp * one_pole_magnitude(freq * p.n as f64, cutoff),
                    ..*p
                })
                .collect()
        }
        None => recipe.partials.to_vec(),
    };

    let mut out = vec![0.0f32; len];
    for (i, s) in out.iter_mut().enumerate() {
        let t = i as f64 / sr_f;
        let phase = w * i as f64;
        let v = partials_at(&filtered, phase, t, top);
        let mut env = if recipe.body_tau == HELD {
            1.0
        } else {
            (-t / recipe.body_tau).exp()
        };
        if (i as f64) < attack {
            env *= fade_in(i as f64 / attack);
        }
        if i >= release_from && len > release_from {
            env *= fade_out((i - release_from) as f64 / (len - release_from) as f64);
        }
        *s = (v * env) as f32;
    }
    let peak = out.iter().fold(0.0f32, |m, s| m.max(s.abs()));
    if peak > 0.0 {
        let g = VOICE_PEAK / peak;
        for s in out.iter_mut() {
            *s *= g;
        }
    }
    out
}

// ---------------------------------------------------------------------------
// The bass — five voices, twenty-eight notes each
// ---------------------------------------------------------------------------

/// E1, the bottom of a four-string bass. Mirrors `BASS_MIN_MIDI` in
/// `src/jam/bassline.ts`, which folds every note it writes into this range.
pub const BASS_MIN_MIDI: u8 = 28;
/// G3. High enough for a walking line to breathe, low enough to stay bass.
pub const BASS_MAX_MIDI: u8 = 55;
/// Twenty-eight semitones, E1 to G3 inclusive.
pub const BASS_NOTES: usize = (BASS_MAX_MIDI - BASS_MIN_MIDI + 1) as usize;

/// How many bass voices there are. `JamBassVoice` in `src/jam/types.ts` is
/// the same five words.
pub const BASS_VOICE_COUNT: usize = 5;

/// Which bass the band has. `bassVoice` on the config names one of these;
/// an unknown name is [`BassVoice::Fingered`], for the reason an unknown kit
/// is `room` — a jam saved by a later build that knows more voices must
/// still play.
///
/// **The audio thread never sees one of these as a name.** It is resolved
/// into the `SoundId` when the table is compiled, in the `set_jam` command,
/// exactly as a kit is.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum BassVoice {
    /// The pluck the first pass shipped, with a little more attack on it.
    Fingered,
    /// A plectrum: a sharp click, a faster decay, more second harmonic.
    Picked,
    /// A double bass — soft attack, thump, short sustain, low-passed.
    Upright,
    /// Thumb and pop: a bright transient, a snap, then nothing.
    Slap,
    /// A saw through a low-pass, held. The one bass voice that sustains.
    Synth,
}

impl BassVoice {
    /// Every voice, in the order the bank stores them.
    pub const ALL: [BassVoice; BASS_VOICE_COUNT] = [
        Self::Fingered,
        Self::Picked,
        Self::Upright,
        Self::Slap,
        Self::Synth,
    ];

    /// The name the contract uses (`JamBassVoice` in `src/jam/types.ts`).
    pub fn name(self) -> &'static str {
        match self {
            Self::Fingered => "fingered",
            Self::Picked => "picked",
            Self::Upright => "upright",
            Self::Slap => "slap",
            Self::Synth => "synth",
        }
    }

    /// Read a voice out of a config. Unknown names are `fingered`; case is
    /// ignored, because a hand-edited store is a real thing.
    pub fn from_name(name: &str) -> Self {
        match name.trim().to_ascii_lowercase().as_str() {
            "picked" => Self::Picked,
            "upright" => Self::Upright,
            "slap" => Self::Slap,
            "synth" => Self::Synth,
            _ => Self::Fingered,
        }
    }

    fn recipe(self) -> &'static Recipe {
        match self {
            Self::Fingered => &FINGERED,
            Self::Picked => &PICKED,
            Self::Upright => &UPRIGHT,
            Self::Slap => &SLAP,
            Self::Synth => &SYNTH_BASS,
        }
    }
}

/// The pluck the first pass shipped, with more finger on it.
///
/// A sine fundamental, a touch of second harmonic, and a short saw-ish bite
/// that is gone in a few hundredths of a second. The bite is a truncated
/// harmonic series rather than a real ramp: a ramp at 41 Hz has partials
/// past Nyquist at every device rate and would buzz.
static FINGERED: Recipe = Recipe {
    secs: 0.45,
    attack_secs: 0.002,
    body_tau: 0.15,
    release_fraction: 0.2,
    partials: &[
        Partial { n: 1, amp: 1.0, tau: HELD },
        Partial { n: 2, amp: 0.22, tau: HELD },
        // The bite: a truncated saw, `BITE / n` on every partial including
        // the fundamental, exactly as the first pass built it — the same
        // series, one entry per harmonic instead of a loop.
        //
        // 0.42 over 14 ms, where the first pass had 0.35 over 12. That is
        // the whole of "a little more attack" (B9), and it is deliberately
        // the smallest change that could be: the fingered bass is what
        // every jam already saved on this machine plays, so it has to still
        // be recognisably the same instrument.
        Partial { n: 1, amp: 0.420, tau: 0.014 },
        Partial { n: 2, amp: 0.210, tau: 0.014 },
        Partial { n: 3, amp: 0.140, tau: 0.014 },
        Partial { n: 4, amp: 0.105, tau: 0.014 },
        Partial { n: 5, amp: 0.084, tau: 0.014 },
        Partial { n: 6, amp: 0.070, tau: 0.014 },
        Partial { n: 7, amp: 0.060, tau: 0.014 },
        Partial { n: 8, amp: 0.053, tau: 0.014 },
        Partial { n: 9, amp: 0.047, tau: 0.014 },
        Partial { n: 10, amp: 0.042, tau: 0.014 },
        Partial { n: 11, amp: 0.038, tau: 0.014 },
        Partial { n: 12, amp: 0.035, tau: 0.014 },
    ],
    filter: None,
};


/// A plectrum. Everything the finger does, faster and harder.
///
/// The click is a band of high harmonics with a six-millisecond decay —
/// audibly a pick hitting a wound string, mathematically still `sin(n·φ)`,
/// so the tuning stays measurable. The body dies in 110 ms rather than 150,
/// which is what makes a picked line articulate instead of blurred.
static PICKED: Recipe = Recipe {
    secs: 0.38,
    attack_secs: 0.001,
    body_tau: 0.11,
    release_fraction: 0.2,
    partials: &[
        Partial { n: 1, amp: 1.0, tau: HELD },
        Partial { n: 2, amp: 0.30, tau: HELD },
        Partial { n: 3, amp: 0.14, tau: 0.030 },
        // The click.
        Partial { n: 6, amp: 0.22, tau: 0.006 },
        Partial { n: 7, amp: 0.22, tau: 0.006 },
        Partial { n: 8, amp: 0.20, tau: 0.006 },
        Partial { n: 9, amp: 0.18, tau: 0.005 },
        Partial { n: 10, amp: 0.17, tau: 0.005 },
        Partial { n: 11, amp: 0.15, tau: 0.005 },
        Partial { n: 12, amp: 0.14, tau: 0.004 },
        Partial { n: 13, amp: 0.12, tau: 0.004 },
        Partial { n: 14, amp: 0.11, tau: 0.004 },
        Partial { n: 15, amp: 0.10, tau: 0.004 },
        Partial { n: 16, amp: 0.09, tau: 0.003 },
    ],
    filter: None,
};

/// A double bass. Gut, not steel.
///
/// A twelve-millisecond fade-in is the finger pulling the string rather than
/// striking it; the low-pass at two and a half times the fundamental takes
/// nearly everything above the second harmonic away, which is what makes it
/// a thump with a pitch instead of a note with an edge. Short sustain: a
/// hundred milliseconds, so a walking line is a series of thumps and not a
/// drone.
static UPRIGHT: Recipe = Recipe {
    secs: 0.32,
    attack_secs: 0.012,
    body_tau: 0.10,
    release_fraction: 0.25,
    partials: &[
        Partial { n: 1, amp: 1.0, tau: HELD },
        Partial { n: 2, amp: 0.34, tau: 0.060 },
        Partial { n: 3, amp: 0.18, tau: 0.035 },
        Partial { n: 4, amp: 0.10, tau: 0.025 },
        Partial { n: 5, amp: 0.06, tau: 0.020 },
    ],
    // 2.5 × the fundamental, held between 110 and 400 Hz: the top of the
    // range would otherwise get a filter five times higher than the bottom
    // and stop being the same instrument.
    filter: Some((2.5, 110.0, 400.0)),
};

/// Thumb and pop.
///
/// Two transients rather than one, because that is what the technique is: a
/// very bright three-millisecond crack as the thumb drives the string onto
/// the fretboard, a twenty-five-millisecond snap in the upper mids as it
/// comes back off, and a body that is gone in ninety. Nothing here
/// sustains; a slap line is percussion with pitches.
static SLAP: Recipe = Recipe {
    secs: 0.36,
    attack_secs: 0.001,
    body_tau: 0.09,
    release_fraction: 0.2,
    partials: &[
        Partial { n: 1, amp: 1.0, tau: HELD },
        Partial { n: 2, amp: 0.26, tau: 0.070 },
        // The snap.
        Partial { n: 3, amp: 0.34, tau: 0.025 },
        Partial { n: 4, amp: 0.30, tau: 0.025 },
        Partial { n: 5, amp: 0.26, tau: 0.022 },
        Partial { n: 6, amp: 0.22, tau: 0.022 },
        Partial { n: 7, amp: 0.20, tau: 0.020 },
        // The crack.
        Partial { n: 10, amp: 0.26, tau: 0.003 },
        Partial { n: 12, amp: 0.24, tau: 0.003 },
        Partial { n: 14, amp: 0.22, tau: 0.003 },
        Partial { n: 16, amp: 0.20, tau: 0.0025 },
        Partial { n: 18, amp: 0.18, tau: 0.0025 },
        Partial { n: 20, amp: 0.16, tau: 0.002 },
    ],
    filter: None,
};

/// A saw through a low-pass, held.
///
/// The one bass voice that does not die on its own: the envelope decays over
/// six hundred milliseconds rather than a hundred and fifty, so a synth bass
/// under a pop groove is a line and not a series of plucks. The table's cap
/// still ends the note where the next one starts, which is what stops it
/// becoming a drone.
static SYNTH_BASS: Recipe = Recipe {
    secs: 0.55,
    attack_secs: 0.004,
    body_tau: 0.35,
    release_fraction: 0.2,
    partials: &[
        Partial { n: 1, amp: 1.0, tau: HELD },
        Partial { n: 2, amp: 0.500, tau: HELD },
        Partial { n: 3, amp: 0.333, tau: HELD },
        Partial { n: 4, amp: 0.250, tau: HELD },
        Partial { n: 5, amp: 0.200, tau: HELD },
        Partial { n: 6, amp: 0.167, tau: HELD },
        Partial { n: 7, amp: 0.143, tau: HELD },
        Partial { n: 8, amp: 0.125, tau: HELD },
        Partial { n: 9, amp: 0.111, tau: HELD },
        Partial { n: 10, amp: 0.100, tau: HELD },
        Partial { n: 11, amp: 0.091, tau: HELD },
        Partial { n: 12, amp: 0.083, tau: HELD },
    ],
    // The filter IS the voice, and it is set LOW on purpose. A saw with
    // nothing over it is a buzz, and a buzz is not a bass: measured through
    // the small-speaker band-pass, this recipe with the cutoff at four times
    // the fundamental came out **+14.9 dB** against the fingered bass, which
    // is not a voice that needs trimming, it is the wrong instrument. At
    // twice the fundamental only the first two harmonics survive at any
    // strength, which is the round synth bass a pop record has — and it
    // lands close enough to the others that `BASS_VOICE_TRIM` is a balance
    // rather than a rescue.
    filter: Some((2.0, 120.0, 500.0)),
};

/// One note of the bass, in one voice.
fn bass_note(voice: BassVoice, midi: u8, sr: u32) -> Vec<f32> {
    voice_note(voice.recipe(), midi, sr)
}

// ---------------------------------------------------------------------------
// The keys — four voices, thirty-seven notes each
// ---------------------------------------------------------------------------

/// C3, the bottom of the comping range. Mirrors the range `JamKeysLine`
/// promises in `src/jam/types.ts`: a voicing is four MIDI notes in 48..=84.
pub const KEYS_MIN_MIDI: u8 = 48;
/// C6. Above this a comping voice stops being harmony and starts being a
/// melody competing with the one you are playing.
pub const KEYS_MAX_MIDI: u8 = 84;
/// Thirty-seven semitones, C3 to C6 inclusive — three octaves.
pub const KEYS_NOTES: usize = (KEYS_MAX_MIDI - KEYS_MIN_MIDI + 1) as usize;

/// How many keys voices there are. `JamKeysVoice` in `src/jam/types.ts` is
/// the same four words.
pub const KEYS_VOICE_COUNT: usize = 4;

/// Who is on the keys. Resolved into the `SoundId` when the table is
/// compiled, like the bass and the kit; unknown names are `epiano`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum KeysVoice {
    /// The electric piano the first pass shipped.
    Epiano,
    /// Drawbars, no decay, and the click a tonewheel makes on the key.
    Organ,
    /// Very short, very bright, percussive.
    Clav,
    /// Slow attack, long release, filtered.
    Pad,
}

impl KeysVoice {
    /// Every voice, in the order the bank stores them.
    pub const ALL: [KeysVoice; KEYS_VOICE_COUNT] =
        [Self::Epiano, Self::Organ, Self::Clav, Self::Pad];

    /// The name the contract uses (`JamKeysVoice` in `src/jam/types.ts`).
    pub fn name(self) -> &'static str {
        match self {
            Self::Epiano => "epiano",
            Self::Organ => "organ",
            Self::Clav => "clav",
            Self::Pad => "pad",
        }
    }

    /// Unknown names are `epiano`, case ignored.
    pub fn from_name(name: &str) -> Self {
        match name.trim().to_ascii_lowercase().as_str() {
            "organ" => Self::Organ,
            "clav" => Self::Clav,
            "pad" => Self::Pad,
            _ => Self::Epiano,
        }
    }

    fn recipe(self) -> &'static Recipe {
        match self {
            Self::Epiano => &EPIANO,
            Self::Organ => &ORGAN,
            Self::Clav => &CLAV,
            Self::Pad => &PAD,
        }
    }
}

/// The electric piano the first pass shipped, unchanged.
///
/// A sine fundamental with a touch of second and third harmonic that decay
/// faster than it does — bright for a moment, then a tone, which is the
/// whole character of a struck string. Three milliseconds of attack: a
/// struck note rather than an organ stop, short enough that the chord still
/// lands on the tick.
static EPIANO: Recipe = Recipe {
    secs: 0.70,
    attack_secs: 0.003,
    // A third of the buffer, which puts the note 26 dB down by the time the
    // release taper takes over.
    body_tau: 0.70 / 3.0,
    release_fraction: 0.2,
    partials: &[
        Partial { n: 1, amp: 1.0, tau: HELD },
        // Halves and thirds of the body's own decay.
        Partial { n: 2, amp: 0.30, tau: 0.70 / 6.0 },
        Partial { n: 3, amp: 0.15, tau: 0.70 / 9.0 },
    ],
    filter: None,
};

/// A tonewheel organ.
///
/// Drawbars rather than a decaying harmonic series: 8', 4', 2⅔', 2' and the
/// mixtures above them, all of them HELD, because an organ does not decay —
/// it is on until you take your hand off. That is why this buffer is 1.2 s
/// where the electric piano's is 0.7: the note has to hold a half-bar chord
/// at a hundred and twenty, and the table's cap is what should end it, not
/// the sample running out.
///
/// The click is the tonewheel contact bouncing, which on a real one is a
/// broadband tick lasting about four milliseconds. Here it is the top of the
/// drawbar series with a four-millisecond decay: the same sound, and one
/// that cannot move a zero crossing.
static ORGAN: Recipe = Recipe {
    secs: 1.20,
    attack_secs: 0.002,
    body_tau: HELD,
    release_fraction: 0.15,
    partials: &[
        Partial { n: 1, amp: 1.0, tau: HELD },
        Partial { n: 2, amp: 0.55, tau: HELD },
        Partial { n: 3, amp: 0.40, tau: HELD },
        Partial { n: 4, amp: 0.30, tau: HELD },
        Partial { n: 6, amp: 0.18, tau: HELD },
        Partial { n: 8, amp: 0.12, tau: HELD },
        // The key click.
        Partial { n: 10, amp: 0.30, tau: 0.004 },
        Partial { n: 12, amp: 0.28, tau: 0.004 },
        Partial { n: 14, amp: 0.25, tau: 0.003 },
        Partial { n: 16, amp: 0.22, tau: 0.003 },
    ],
    filter: None,
};

/// A clavinet. A plucked string with a pickup under it.
///
/// Two hundred and twenty milliseconds end to end, which is the point: a
/// clav part is rhythm, and a clav that rings is a harpsichord. Bright all
/// the way up the series, with the upper partials dying first, so a chord
/// speaks and is gone before the next sixteenth.
static CLAV: Recipe = Recipe {
    secs: 0.22,
    attack_secs: 0.001,
    body_tau: 0.09,
    release_fraction: 0.25,
    partials: &[
        Partial { n: 1, amp: 1.0, tau: HELD },
        Partial { n: 2, amp: 0.62, tau: 0.070 },
        Partial { n: 3, amp: 0.48, tau: 0.050 },
        Partial { n: 4, amp: 0.36, tau: 0.035 },
        Partial { n: 5, amp: 0.28, tau: 0.025 },
        Partial { n: 6, amp: 0.22, tau: 0.020 },
        Partial { n: 7, amp: 0.17, tau: 0.015 },
        Partial { n: 8, amp: 0.13, tau: 0.012 },
    ],
    filter: None,
};

/// A pad. The voice that is not supposed to be noticed.
///
/// A hundred and eighty milliseconds of attack means it never marks a beat —
/// which is the point, and the reason a pad under a bossa or a pop groove
/// does not fight the drummer. Nearly half the buffer is release, so it
/// fades rather than stops. Filtered at twice the fundamental, so what is
/// left is warmth rather than harmony you have to listen past.
static PAD: Recipe = Recipe {
    secs: 1.40,
    attack_secs: 0.180,
    body_tau: HELD,
    release_fraction: 0.45,
    partials: &[
        Partial { n: 1, amp: 1.0, tau: HELD },
        Partial { n: 2, amp: 0.45, tau: HELD },
        Partial { n: 3, amp: 0.28, tau: HELD },
        Partial { n: 4, amp: 0.18, tau: HELD },
        Partial { n: 5, amp: 0.12, tau: HELD },
        Partial { n: 6, amp: 0.08, tau: HELD },
    ],
    filter: Some((2.0, 200.0, 1400.0)),
};

/// One note of the keys, in one voice.
fn keys_note(voice: KeysVoice, midi: u8, sr: u32) -> Vec<f32> {
    voice_note(voice.recipe(), midi, sr)
}

/// Which of the band's two melodic lines a recorded note belongs to.
///
/// Two banks travel in a table — the bass's and the keys' — and a slot has
/// to say which of them its note came out of. It is also the round robin's
/// seed, so the bass and a chord landing on the same tick do not step to the
/// same recording together.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum VoiceLine {
    Bass,
    Keys,
}

/// Public for `jam.rs`: a jam table is compiled off the audio thread and
/// stores the sound each drum plays, so the identifier travels with the
/// table — including out through the `probe` facade, which is what makes
/// `pub(crate)` too narrow. The bank itself stays private.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum SoundId {
    ClickHigh,
    ClickLow,
    WoodHigh,
    WoodLow,
    BeepHigh,
    BeepLow,
    DrumLow,
    DrumAccent,
    SnareLow,
    SnareHigh,
    /// The middle strokes, one per kit, added 2026-09-15. A bar's beat four
    /// plays these where it used to play the downbeat's file at 80 % — see
    /// [`MEDIUM_GAIN`] for why that was not enough and [`SoundKit::mid_id`]
    /// for the table.
    ///
    /// `DrumMid` is the only one with no file behind it: it is mixed in
    /// [`SoundBank::new`] from the kick and the body, which is `DrumAccent`
    /// with the cymbals taken out, for the same reason `DrumAccent` is mixed
    /// there — the balance of layers that all ship separately is the engine's
    /// to decide and can be retuned without a re-render.
    ClickMid,
    WoodMid,
    BeepMid,
    DrumMid,
    SnareMid,
    SticksMid,
    CowbellMid,
    KitMid,
    /// The three presets added 2026-09-14, all of them recordings. They are
    /// plain buffers in the [`SoundBank`] exactly as the five before them are
    /// — a click is a click, whatever it was cut from.
    ///
    /// `SticksLow` is also the jam's count-in, which is the one of these the
    /// audio thread reaches by a second road; see `jam.rs`.
    SticksHigh,
    SticksLow,
    CowbellHigh,
    CowbellLow,
    KitHigh,
    KitLow,
    ChimeUp,
    ChimeDown,
    /// The metronome drum kit's closed hat and crash, un-mixed. They are
    /// decoded for the `drum_accent` premix anyway; naming them lets the
    /// small-speaker tests measure a jam kit against a fixed reference that
    /// predates Jam and does not move when a kit is retuned.
    DrumMetal,
    DrumCrash,
    /// Jam: one note of a RECORDED melodic bank — the bass or the keys —
    /// at one velocity layer and one round robin.
    ///
    /// The melodic twin of [`SoundId::Band`], and it is a separate variant
    /// for exactly the same reason. A bank of recordings is decoded when a
    /// jam names it, long after the device opened and at a depth (twenty-
    /// eight notes, three layers, two round robins) nobody would pay for on
    /// a device change — so it cannot live in the [`SoundBank`], and it
    /// travels INSIDE the `Arc<JamTable>` that names it instead. Its notes
    /// and the table arrive together and retire together.
    ///
    /// `note` is the index the table stored, `midi − bank.low()`. `robin` is
    /// decided on the tick, not here, exactly as a drum's is.
    Voice {
        line: VoiceLine,
        note: u8,
        layer: u8,
        robin: u8,
    },
    /// Jam: one note of one SYNTHESISED bass voice, indexed
    /// `midi − BASS_MIN_MIDI`. Out of range reads as silence rather than a
    /// panic; `jam.rs` has already rejected any pitch that could get here.
    ///
    /// What a voice plays when no recorded bank ships for it — `synth`
    /// always, and the other four until their folders arrive.
    Bass(BassVoice, u8),
    /// Jam: one note of one keys voice, indexed `midi − KEYS_MIN_MIDI`. A
    /// voicing spawns one of these per note. Out of range reads as silence,
    /// for the same reason the bass does.
    Keys(KeysVoice, u8),
    /// Jam: one drum of the LOADED KIT, at one velocity layer and one round
    /// robin — `voice` indexes [`KitVoice`], the other two index that
    /// voice's bank.
    ///
    /// **The only `SoundId` the [`SoundBank`] cannot answer**, and after
    /// this pass that is true of every drum rather than only of a folder the
    /// musician chose. The bank is built when a device opens; a kit is
    /// decoded when a jam names it, which is long afterwards and at a depth
    /// (eleven voices, four layers, three round robins, stereo) nobody would
    /// pay for on a device change. So the drums travel INSIDE the
    /// `Arc<JamTable>` that names them — see [`jam_sample`], which is what
    /// the audio thread actually calls. They arrive together and retire
    /// together, and there is no window in which one is present without the
    /// other.
    ///
    /// `robin` is decided on the tick, not here: the table stores the voice,
    /// the layer and how many round robins there are, and the callback works
    /// out which one this bar and this tick get. See `jam.rs`.
    Band { voice: u8, layer: u8, robin: u8 },
}

struct SoundBank {
    click_high: Vec<f32>,
    click_mid: Vec<f32>,
    click_low: Vec<f32>,
    wood_high: Vec<f32>,
    wood_mid: Vec<f32>,
    wood_low: Vec<f32>,
    beep_high: Vec<f32>,
    beep_mid: Vec<f32>,
    beep_low: Vec<f32>,
    drum_low: Vec<f32>,
    drum_accent: Vec<f32>, // pre-mixed kick + metal hat + crash + body
    drum_mid: Vec<f32>,    // and the same premix with the CRASH taken out
    snare_low: Vec<f32>,
    snare_mid: Vec<f32>,
    snare_high: Vec<f32>,
    sticks_high: Vec<f32>,
    sticks_mid: Vec<f32>,
    sticks_low: Vec<f32>,
    cowbell_high: Vec<f32>,
    cowbell_mid: Vec<f32>,
    cowbell_low: Vec<f32>,
    kit_high: Vec<f32>,
    kit_mid: Vec<f32>,
    kit_low: Vec<f32>,
    chime_up: Vec<f32>,
    chime_down: Vec<f32>,
    /// The metronome kit's hat and crash, un-mixed. The premix needs them
    /// decoded regardless; keeping them addressable costs nothing.
    drum_metal: Vec<f32>,
    drum_crash: Vec<f32>,
    /// The bass, `[voice][semitone from BASS_MIN_MIDI]`, laid out in the
    /// order [`BassVoice::ALL`] lists them.
    bass: [Vec<Vec<f32>>; BASS_VOICE_COUNT],
    /// The comping keys, `[voice][semitone from KEYS_MIN_MIDI]`, laid out in
    /// the order [`KeysVoice::ALL`] lists them.
    keys: [Vec<Vec<f32>>; KEYS_VOICE_COUNT],
}

impl SoundBank {
    fn new(sr: u32) -> Self {
        let drum_high = decode_wav(DRUM_HIGH, sr);
        let drum_metal = decode_wav(DRUM_METAL, sr);
        let drum_crash = decode_wav(DRUM_CRASH, sr);
        let drum_body = decode_wav(DRUM_BODY, sr);

        // Pre-mix the drum accent.
        //
        // The owner's report was that the accent is not dominant enough, and
        // measurement agreed in the worst way: through a 200 Hz–4 kHz
        // band-pass — roughly what a laptop speaker radiates — the accent was
        // 0.5 dB QUIETER than the plain beat it is supposed to mark, and
        // 2.1 dB quieter A-weighted. It only ever measured louder broadband,
        // on sub-bass nobody's laptop can reproduce.
        //
        // Two things were wrong, and both are fixed here.
        //
        // 1. The kick was setting a ceiling it could not be heard through.
        //    It carries 99.7% of its energy below 120 Hz, yet its peak drove
        //    the normalisation that scaled the metal and crash — the layers a
        //    small speaker CAN reproduce — down by 2.3 dB. Its gain drops
        //    from 1.0 to 0.7 and the two audible layers come up to meet it.
        //
        // 2. There was no mid-band content to raise. `drum_body` is the new
        //    55 ms layer that supplies it; an earlier attempt added a 6 ms
        //    beater transient carrying 0.45% of the kick's energy, which
        //    raised the peak without raising the loudness and moved the
        //    measured accent by 0.1 dB.
        let max_len = drum_high
            .len()
            .max(drum_metal.len())
            .max(drum_crash.len())
            .max(drum_body.len());
        let mut drum_accent = vec![0.0f32; max_len];
        for (i, s) in drum_high.iter().enumerate() {
            drum_accent[i] += s * 0.70;
        }
        for (i, s) in drum_metal.iter().enumerate() {
            drum_accent[i] += s * 0.70;
        }
        for (i, s) in drum_crash.iter().enumerate() {
            drum_accent[i] += s * 0.45;
        }
        for (i, s) in drum_body.iter().enumerate() {
            drum_accent[i] += s;
        }

        // Four samples summed peak well above full scale — 1.68 as measured —
        // so without limiting the accent clipped on every downbeat once the
        // user's volume passed about 0.58.
        //
        // This used to divide the whole buffer by its peak, which is what a
        // peak meter wants and not what an ear wants: it threw away 2.3 dB of
        // everything to make room for one subsonic spike. A tanh curve holds
        // the same ceiling while keeping that loudness, and the harmonics it
        // folds out of the kick's fundamental land at 100–300 Hz, where a
        // laptop speaker starts working. Drive 1.0 measures 19 dB below the
        // signal — saturation a drum wears well, not distortion.
        //
        // Net, against the plain beat: −0.5 dB → +5.6 dB band-limited,
        // −2.1 dB → +2.7 dB A-weighted. Peak is unchanged at 0.97.
        //
        // This runs once when the bank is built, never on the audio thread.
        const DRIVE: f32 = 1.0;
        let shape = DRIVE.tanh();
        for s in drum_accent.iter_mut() {
            *s = (*s * DRIVE).tanh() / shape;
        }
        let peak = drum_accent.iter().fold(0.0f32, |m, s| m.max(s.abs()));
        if peak > 0.97 {
            let g = 0.97 / peak;
            for s in drum_accent.iter_mut() {
                *s *= g;
            }
        }

        // And the middle of the bar, mixed here for the same reasons and out
        // of three of the same four layers: THE KICK, THE HAT AND THE BODY.
        // The crash is the only thing held back.
        //
        // 6/8 on a kit is a kick on one, a snare on four and hats between, and
        // what says "one" on this kit is the CRASH — so what says "four" is
        // the same stroke with the crash taken off it. That is a bigger
        // difference to hear than any gain, which is the whole argument of
        // this pass, and it is nearly invisible to the band-pass the tests
        // measure through: the kick carries 99.7% of its energy under 120 Hz.
        //
        // THE HAT USED TO COME OFF TOO, and that was the bug the owner
        // reported. The comment here said "the cymbal" and the code took both
        // cymbals, which left the middle as kick-plus-body and nothing else.
        // Measured in absolute terms rather than as a share of a mix the kick
        // dominates — which reads 0.0% either way and hides it — the 6-16 kHz
        // octave of that stroke sat 16.45 dB under the downbeat's and 15.68 dB
        // under the PLAIN BEAT's. It was the one event in the bar with no top
        // at all, between two bright ones, and it did not read as a middle: it
        // read as a downbeat with a blanket over it.
        //
        // 0.30 OF THE HAT AND NOT THE DOWNBEAT'S 0.70, and the ceiling is not
        // the level gates — it is
        // `a_middle_stroke_is_a_different_sound_from_both_its_siblings`. At
        // 0.70 this premix is the downbeat with a crash lifted off it, and at
        // a twelfth of an octave that measures 0.18 from the downbeat against
        // a floor of 0.25: the same file at another volume, which is the one
        // thing this whole tier exists not to be. The two ends of the knob
        // trade against each other monotonically — more hat is more top and
        // less colour of its own — and 0.30 is where the top octave has come
        // up 7.5 dB (to 8.21 under the plain beat, from 15.68) while the
        // distance is still 0.44, inside the 0.42 seven of the eight presets
        // clear.
        //
        // PEAK 0.92 AND NOT 0.930, which is the small part. The hat is audible
        // to the band-pass where the kick is not, so putting any of it back
        // raises what the gate can hear and the level comes down to meet it —
        // the trade `kit_mid` makes at 0.807 for the same reason, and why
        // `peak` is a per-file number rather than a convention. The four
        // margins land +1.87 / +1.76 band-limited and +1.69 / +2.14 K-weighted
        // at 44 100, against the old mix's +1.80 / +1.83 / +1.69 / +2.14. The
        // stroke changed; the ladder did not.
        //
        // Runs once when the bank is built, on the setup path, never on the
        // audio thread.
        let mid_len = drum_high.len().max(drum_metal.len()).max(drum_body.len());
        let mut drum_mid = vec![0.0f32; mid_len];
        for (i, s) in drum_high.iter().enumerate() {
            drum_mid[i] += s * 0.70;
        }
        for (i, s) in drum_metal.iter().enumerate() {
            drum_mid[i] += s * 0.30;
        }
        for (i, s) in drum_body.iter().enumerate() {
            drum_mid[i] += s;
        }
        for s in drum_mid.iter_mut() {
            *s = (*s * DRIVE).tanh() / shape;
        }
        let mid_peak = drum_mid.iter().fold(0.0f32, |m, s| m.max(s.abs()));
        if mid_peak > 0.0 {
            let g = 0.92 / mid_peak;
            for s in drum_mid.iter_mut() {
                *s *= g;
            }
        }

        // And the bass player — five of them, because a fingered bass under
        // a blues and a slap under a funk groove are different instruments
        // and not the same instrument at different volumes
        // (`plans/JAM_UX_DECISIONS.md` B9).
        //
        // Synthesised rather than sampled: 28 notes × 5 voices of recorded
        // bass would be tens of megabytes of files for tones whose whole job
        // is to be plain and in tune. Built here, once, when the device
        // opens — never on the audio thread, and never per jam.
        // ...and whoever is on the keys, four of them for the same reason,
        // three octaves each rather than the bass's two and a bit, because a
        // voicing is four notes that have to fit between the bass and you.
        //
        // NINE THREADS, ONE PER VOICE, BECAUSE THIS IS THE DELAY BEFORE THE
        // FIRST CLICK. Building all nine in sequence measures 646 ms of the
        // 964 a whole bank costs on the owner's laptop
        // (`the_pitched_banks_cost_what_they_are_documented_to_cost`), and
        // this runs every time an audio device opens — at start-up, and
        // again whenever the musician changes output. Two hundred and
        // eighty-eight independent buffers is the easiest parallel problem
        // there is, and the longest single voice (the pad, at 1.4 s a note)
        // sets the floor.
        //
        // Safe to do here and nowhere near the callback: the stream has not
        // been built yet, let alone started, so these threads compete with
        // nothing that has a deadline. `scope` is what lets them borrow
        // `sr` and end before this function returns.
        let (bass, keys) = std::thread::scope(|scope| {
            let bass_jobs: Vec<_> = BassVoice::ALL
                .iter()
                .map(|&voice| {
                    scope.spawn(move || {
                        (BASS_MIN_MIDI..=BASS_MAX_MIDI)
                            .map(|midi| bass_note(voice, midi, sr))
                            .collect::<Vec<Vec<f32>>>()
                    })
                })
                .collect();
            let keys_jobs: Vec<_> = KeysVoice::ALL
                .iter()
                .map(|&voice| {
                    scope.spawn(move || {
                        (KEYS_MIN_MIDI..=KEYS_MAX_MIDI)
                            .map(|midi| keys_note(voice, midi, sr))
                            .collect::<Vec<Vec<f32>>>()
                    })
                })
                .collect();
            let mut bass_jobs = bass_jobs.into_iter();
            let mut keys_jobs = keys_jobs.into_iter();
            // Collected back in the order they were spawned, which is the
            // order `BassVoice::ALL` and `KeysVoice::ALL` list them — and
            // therefore the order `SoundBank::get` indexes them by.
            let bass: [Vec<Vec<f32>>; BASS_VOICE_COUNT] = std::array::from_fn(|_| {
                bass_jobs
                    .next()
                    .expect("one job per voice")
                    .join()
                    .expect("synthesising a bass note cannot fail")
            });
            let keys: [Vec<Vec<f32>>; KEYS_VOICE_COUNT] = std::array::from_fn(|_| {
                keys_jobs
                    .next()
                    .expect("one job per voice")
                    .join()
                    .expect("synthesising a keys note cannot fail")
            });
            (bass, keys)
        });
        debug_assert!(
            bass.iter().all(|v| v.len() == BASS_NOTES),
            "every bass voice is E1 to G3"
        );
        debug_assert!(
            keys.iter().all(|v| v.len() == KEYS_NOTES),
            "every keys voice is C3 to C6"
        );

        Self {
            bass,
            keys,
            drum_metal,
            drum_crash,
            click_high: decode_wav(CLICK_HIGH, sr),
            click_mid: decode_wav(CLICK_MID, sr),
            click_low: decode_wav(CLICK_LOW, sr),
            wood_high: decode_wav(WOOD_HIGH, sr),
            wood_mid: decode_wav(WOOD_MID, sr),
            wood_low: decode_wav(WOOD_LOW, sr),
            beep_high: decode_wav(BEEP_HIGH, sr),
            beep_mid: decode_wav(BEEP_MID, sr),
            beep_low: decode_wav(BEEP_LOW, sr),
            drum_low: decode_wav(DRUM_LOW, sr),
            drum_accent,
            drum_mid,
            // No premix for this kit: it is synthesised whole, so its accent
            // is already balanced against its beat in the file and there is
            // no summed peak to limit away. That decision was right and was
            // not the reason the first version came out shy — the level was
            // lost inside the files, in a 60 ms plain beat and a snare whose
            // wire tail was cut off at -36 dBFS, not in the mixing.
            snare_low: decode_wav(SNARE_LOW, sr),
            snare_mid: decode_wav(SNARE_MID, sr),
            snare_high: decode_wav(SNARE_HIGH, sr),
            // And no premix for any of these three either, for a reason the
            // snare kit's comment above only half covers: they are
            // recordings, so their balance is not merely fixed in the file,
            // it is the only thing in the file. `kit_high` is two strokes
            // summed and saturated, and both of those happened in
            // `render_click.py` where the peak they land on can be measured
            // against the same filters this file's tests use.
            sticks_high: decode_wav(STICKS_HIGH, sr),
            sticks_mid: decode_wav(STICKS_MID, sr),
            sticks_low: decode_wav(STICKS_LOW, sr),
            cowbell_high: decode_wav(COWBELL_HIGH, sr),
            cowbell_mid: decode_wav(COWBELL_MID, sr),
            cowbell_low: decode_wav(COWBELL_LOW, sr),
            kit_high: decode_wav(KIT_HIGH, sr),
            kit_mid: decode_wav(KIT_MID, sr),
            kit_low: decode_wav(KIT_LOW, sr),
            chime_up: decode_wav(CHIME_UP, sr),
            chime_down: decode_wav(CHIME_DOWN, sr),
        }
    }

    fn get(&self, id: SoundId) -> &[f32] {
        match id {
            SoundId::ClickHigh => &self.click_high,
            SoundId::ClickLow => &self.click_low,
            SoundId::WoodHigh => &self.wood_high,
            SoundId::WoodLow => &self.wood_low,
            SoundId::BeepHigh => &self.beep_high,
            SoundId::BeepLow => &self.beep_low,
            SoundId::DrumLow => &self.drum_low,
            SoundId::DrumAccent => &self.drum_accent,
            SoundId::SnareLow => &self.snare_low,
            SoundId::SnareHigh => &self.snare_high,
            SoundId::ClickMid => &self.click_mid,
            SoundId::WoodMid => &self.wood_mid,
            SoundId::BeepMid => &self.beep_mid,
            SoundId::DrumMid => &self.drum_mid,
            SoundId::SnareMid => &self.snare_mid,
            SoundId::SticksMid => &self.sticks_mid,
            SoundId::CowbellMid => &self.cowbell_mid,
            SoundId::KitMid => &self.kit_mid,
            SoundId::SticksHigh => &self.sticks_high,
            SoundId::SticksLow => &self.sticks_low,
            SoundId::CowbellHigh => &self.cowbell_high,
            SoundId::CowbellLow => &self.cowbell_low,
            SoundId::KitHigh => &self.kit_high,
            SoundId::KitLow => &self.kit_low,
            SoundId::ChimeUp => &self.chime_up,
            SoundId::ChimeDown => &self.chime_down,
            SoundId::DrumMetal => &self.drum_metal,
            SoundId::DrumCrash => &self.drum_crash,
            // A bounds check, not a decision: an out-of-range note is
            // silence on the audio thread rather than a panic in it.
            SoundId::Bass(voice, i) => self.bass[voice as usize]
                .get(i as usize)
                .map_or(&[][..], |v| &v[..]),
            SoundId::Keys(voice, i) => self.keys[voice as usize]
                .get(i as usize)
                .map_or(&[][..], |v| &v[..]),
            // Not the bank's to answer — see the variants. The audio thread
            // goes through `jam_sample`, which has the loaded table's own
            // kit and melodic banks; anything else asking is asking the
            // wrong object, and silence is the answer that cannot make a
            // noise nobody meant.
            SoundId::Band { .. } | SoundId::Voice { .. } => &[],
        }
    }
}

/// The sample rate `jam.rs` measures a table's worst tick against.
///
/// A jam is compiled in the `set_jam` command, which runs long before (and
/// independently of) the audio thread, so the output device's rate is not
/// knowable there. Peaks move by a fraction of a percent across rates —
/// `the_jam_reference_bank_matches_the_real_one` holds that claim to a
/// number — so one reference bank is enough to measure a tick with.
pub(crate) const JAM_REFERENCE_SR: u32 = 48_000;

/// The decoded sample behind a jam slot, at [`JAM_REFERENCE_SR`]. Built once
/// per process, on the first `set_jam`, never on the audio thread.
pub(crate) fn jam_reference_sample(id: SoundId) -> &'static [f32] {
    static BANK: std::sync::OnceLock<SoundBank> = std::sync::OnceLock::new();
    BANK.get_or_init(|| SoundBank::new(JAM_REFERENCE_SR)).get(id)
}

/// The samples behind a slot the band is playing: the click's own bank for
/// everything the metronome makes, the loaded table's own kit for a drum.
///
/// The one place `SoundId::Band` is answered, and the reason it can be
/// answered on the audio thread without a lock or an allocation: the kit
/// travels INSIDE the `Arc<JamTable>` that names it. Whatever table the
/// callback is reading, the drums it names and the samples they came from
/// are the same object, so there is no ordering to get wrong and nothing to
/// look up.
///
/// A drum with no table behind it renders silence rather than a wrong one.
/// That happens for exactly one thing: a cymbal still ringing when the
/// musician unloads the jam, which now stops where it used to ring out. A
/// quarter-second of decay against never resolving a dangling sound on the
/// audio thread is the trade, and it is the right way round.
///
/// **The slice it returns for a drum is INTERLEAVED STEREO** and every other
/// slice is mono. The caller knows which it asked for — `Voice::band` says
/// so — and that is why the mixer, and not this function, does the indexing.
#[inline]
fn jam_sample<'a>(bank: &'a SoundBank, band: BandBanks<'a>, id: SoundId) -> &'a [f32] {
    match id {
        // THE VOICE INDEX SAYS WHICH BANK, and that is the whole of the
        // percussionist on the audio thread. The contract numbers the ten
        // percussion voices after the eleven drums, so a slot already
        // carries the answer and no second field, no second variant and no
        // lookup is needed: one comparison on a byte, and the shaker comes
        // out of the set while the snare comes out of the kit.
        SoundId::Band { voice, layer, robin } => {
            let from = if (voice as usize) >= crate::kit::DRUM_VOICES {
                band.perc
            } else {
                band.kit
            };
            from.map_or(&[][..], |c| c.sample(voice, layer, robin))
        }
        SoundId::Voice {
            line,
            note,
            layer,
            robin,
        } => band
            .melodic(line)
            .map_or(&[][..], |b| b.sample(note, layer, robin)),
        other => bank.get(other),
    }
}

/// The banks a loaded table carries: the drums, and the recorded bass and
/// keys when the jam names voices that ship one.
///
/// A borrowed `Copy` view taken once per buffer off the table the callback
/// is already holding — three `Option` reads, no lock, no lookup, nothing to
/// get out of step with the table that names them. The mixer passes it down
/// by value.
#[derive(Clone, Copy, Default)]
struct BandBanks<'a> {
    kit: Option<&'a crate::kit::KitBank>,
    /// The percussionist's set. `None` is a band without one, and every
    /// percussion voice then renders silence — which cannot happen in
    /// practice, because a table with no set compiles no percussion slots,
    /// and is the right answer if it ever does.
    perc: Option<&'a crate::kit::KitBank>,
    bass: Option<&'a crate::voices::MelodicBank>,
    keys: Option<&'a crate::voices::MelodicBank>,
}

impl<'a> BandBanks<'a> {
    /// What this table plays out of, or nothing at all with no band.
    #[inline]
    fn of(table: Option<&'a JamTable>) -> Self {
        match table {
            Some(t) => Self {
                kit: Some(t.kit_bank()),
                perc: t.perc_bank(),
                bass: t.voice_bank(VoiceLine::Bass),
                keys: t.voice_bank(VoiceLine::Keys),
            },
            None => Self::default(),
        }
    }

    /// What a SONG plays out of. The same three reads off the other table —
    /// a song carries its kit, its percussion set and its melodic banks
    /// inside itself for every reason a jam does.
    #[inline]
    fn of_song(table: &'a crate::song::SongTable) -> Self {
        Self {
            kit: Some(table.kit_bank()),
            perc: table.perc_bank(),
            bass: table.voice_bank(VoiceLine::Bass),
            keys: table.voice_bank(VoiceLine::Keys),
        }
    }

    #[inline]
    fn melodic(&self, line: VoiceLine) -> Option<&'a crate::voices::MelodicBank> {
        match line {
            VoiceLine::Bass => self.bass,
            VoiceLine::Keys => self.keys,
        }
    }

    /// Is there a band at all? The bus runs only when there is — with no
    /// table loaded the metronome pays for none of it.
    #[inline]
    fn any(&self) -> bool {
        self.kit.is_some()
    }

    /// A kit and nothing else. Tests, which are about which SAMPLE a slot
    /// resolves to rather than about a whole table.
    #[cfg(test)]
    fn only_kit(kit: &'a crate::kit::KitBank) -> Self {
        Self {
            kit: Some(kit),
            ..Self::default()
        }
    }
}

// ---------------------------------------------------------------------------
// Sound kit mapping
// ---------------------------------------------------------------------------

/// Which beats carry the accent.
///
/// Parsed from `AppState::accent_mode` when the cached params are refreshed,
/// so the audio thread compares an integer rather than a string once per beat.
#[derive(Clone, Copy, PartialEq)]
enum AccentMode {
    /// Where each beat group opens — the default, and what the meter means.
    Groups,
    /// Every beat. Useful for hearing a bar as flat pulses rather than a shape.
    All,
    /// None at all: every click identical.
    None,
}

impl AccentMode {
    fn from_str(s: &str) -> Self {
        match s {
            "all" => Self::All,
            "none" => Self::None,
            _ => Self::Groups,
        }
    }
}

/// How hard this tick is accented.
///
/// An accent used to be one bit, and a bar of 6/8 was therefore two bars of
/// 3/4: beats one and four opened a group, both got the same click at the
/// same volume, and nothing in the sound said which of them started the bar.
/// That is issue 52's complaint, and it holds for 9/8, 12/8, 7/8, 5/4 and
/// 8/8 as well. `plans/CLICK_ACCENTS.md` has the decision.
///
/// **The numbers are the loudness order**, low to high, and the frontend's
/// `BeatEvent.accentLevel` is this cast to `u8` — so `level > 0` is "is this
/// accented at all", which is what the old `is_accent` bool meant and what
/// every consumer of it still reads. Nothing sorts on these, but a player
/// reading `2 = quiet` would be the kind of surprise that outlives whoever
/// wrote it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub(crate) enum AccentLevel {
    /// A plain beat, or a subdivision tick. The beat click.
    None = 0,
    /// A group start that is not the bar's: the kit's MIDDLE STROKE, its own
    /// file, at [`MEDIUM_GAIN`]. A bar's middle.
    Medium = 1,
    /// Beat one, "every beat", the ramp's bar line: the accent click at full
    /// volume, exactly as loud as every accent was before there were tiers.
    Strong = 2,
}

impl AccentLevel {
    /// Whether anything accented happened here — the old one-bit question.
    #[inline]
    fn is_accent(self) -> bool {
        self != Self::None
    }

    /// The gain this tier plays at. `None` never reaches the voice spawn, and
    /// answers 0.0 rather than panicking so that a future caller cannot make a
    /// silent bug out of an exhaustive match.
    ///
    /// Strong and Medium both answer 1.0 since the middle became a file of its
    /// own — which is NOT the same as saying they are equally loud. They are
    /// different recordings, cut to different peaks and different weights;
    /// [`MEDIUM_GAIN`] says why the level moved out of this function and into
    /// the file, and `SoundKit::mid_id` is where the difference actually is.
    #[inline]
    fn gain(self) -> f32 {
        match self {
            Self::None => 0.0,
            Self::Medium => MEDIUM_GAIN,
            Self::Strong => 1.0,
        }
    }
}

#[derive(Clone, Copy, PartialEq)]
enum SoundKit {
    Click,
    Wood,
    Beep,
    /// Kick, hi-hat and crash. The bright one.
    Drum,
    /// One snare drum at two dynamics, with a kick under the accent. The same
    /// idea as `Drum` with the metal taken out — the owner asked for a second
    /// kit that sounds like drums rather than like cymbals. Every voice in it
    /// is a struck head, which is the point: nothing here rings like a cymbal.
    ///
    /// Unlike `Drum`, whose accent and beat are different instruments (kick
    /// and hi-hat), this kit's two sounds are the SAME drum played harder and
    /// softer. That is deliberate and it is what the accent test numbers
    /// below are shaped by: two dynamics of one drum cannot pull as far apart
    /// as two different instruments can, and should not need to.
    Snare,
    /// A drummer counting a band off: a stick-shot for the accent, a
    /// cross-stick for the beat. The quietest preset here on purpose — it is
    /// two sticks and a rim — and the only one that is also something else,
    /// because `JamCountInSound::Sticks` plays the same two files.
    Sticks,
    /// One cowbell, hard and soft. Nothing else in the list cuts through a
    /// loud room the way a bell does, which is the whole reason it is here.
    Cowbell,
    /// The recorded twin of [`Self::Drum`] — kick and snare under the accent,
    /// closed hat on the beat — added so the owner can hold a recording
    /// against the synthesis by ear rather than by argument. Both stay: this
    /// is not a replacement, and the numbers do not say which one is better.
    Kit,
}

impl SoundKit {
    /// `sound_type` is persisted as a free string, so a store written by a
    /// newer build — or a corrupted one — can name a kit this build has never
    /// heard of. Falling through to Click keeps the metronome audible instead
    /// of silent, which is the only failure mode that matters here.
    fn from_str(s: &str) -> Self {
        match s {
            "wood" => Self::Wood,
            "beep" => Self::Beep,
            "drum" => Self::Drum,
            "snare" => Self::Snare,
            "sticks" => Self::Sticks,
            "cowbell" => Self::Cowbell,
            "kit" => Self::Kit,
            _ => Self::Click,
        }
    }
    fn high_id(self) -> SoundId {
        match self {
            Self::Click => SoundId::ClickHigh,
            Self::Wood => SoundId::WoodHigh,
            Self::Beep => SoundId::BeepHigh,
            Self::Drum => SoundId::DrumAccent,
            Self::Snare => SoundId::SnareHigh,
            Self::Sticks => SoundId::SticksHigh,
            Self::Cowbell => SoundId::CowbellHigh,
            Self::Kit => SoundId::KitHigh,
        }
    }
    /// The MIDDLE stroke — what a bar's second and later group starts play.
    ///
    /// A third file per kit rather than the downbeat's at a lower gain, for
    /// the reason [`MEDIUM_GAIN`] gives at length: the owner heard the gain
    /// version and heard nothing. Every one of these is the same instrument
    /// as the downbeat played differently — a softer velocity of the same
    /// stroke (sticks, wood, snare, cowbell), the same premix with the
    /// cymbals taken out (drum), the backbeat without its kick (kit), a third
    /// pitch of the same tone (click, beep).
    ///
    /// The fallback kit is Click, as it is for `high_id` and `low_id`, so a
    /// store naming a kit this build has never heard of still gets a bar with
    /// a middle rather than a silent beat four.
    fn mid_id(self) -> SoundId {
        match self {
            Self::Click => SoundId::ClickMid,
            Self::Wood => SoundId::WoodMid,
            Self::Beep => SoundId::BeepMid,
            Self::Drum => SoundId::DrumMid,
            Self::Snare => SoundId::SnareMid,
            Self::Sticks => SoundId::SticksMid,
            Self::Cowbell => SoundId::CowbellMid,
            Self::Kit => SoundId::KitMid,
        }
    }
    fn low_id(self) -> SoundId {
        match self {
            Self::Click => SoundId::ClickLow,
            Self::Wood => SoundId::WoodLow,
            Self::Beep => SoundId::BeepLow,
            Self::Drum => SoundId::DrumLow,
            Self::Snare => SoundId::SnareLow,
            Self::Sticks => SoundId::SticksLow,
            Self::Cowbell => SoundId::CowbellLow,
            Self::Kit => SoundId::KitLow,
        }
    }

    /// Every kit the menu offers, in the order it offers them. The tests walk
    /// this rather than a list of their own, so a kit added to the enum and
    /// forgotten in a test is a compile error in one place instead of a green
    /// run that measured four of five.
    #[cfg(test)]
    const ALL: [(&'static str, Self); 8] = [
        ("click", Self::Click),
        ("sticks", Self::Sticks),
        ("wood", Self::Wood),
        ("beep", Self::Beep),
        ("drum", Self::Drum),
        ("kit", Self::Kit),
        ("snare", Self::Snare),
        ("cowbell", Self::Cowbell),
    ];
}

// ---------------------------------------------------------------------------
// Voice — an active sound playing in the audio callback
// ---------------------------------------------------------------------------

struct Voice {
    sound_id: SoundId,
    /// How far into the sample this voice is, in FRAMES. A click's buffer is
    /// mono, so a frame is a sample; a drum's is interleaved stereo, so a
    /// frame is two. The mixer knows which from [`Voice::band`].
    position: usize,
    /// Frames still to wait before this voice starts at all.
    ///
    /// The push and pull a drummer plays with (`plans/JAM_SOUND.md` §2.6):
    /// nought to three milliseconds, hashed from the bar, the tick and the
    /// drum, so it is the same every time round and different on every hit.
    /// The click never has one.
    delay: u32,
    /// The gain into the left and the right of the bus. Two rather than one
    /// because a kit in a room is stereo and a drum has a place in it; the
    /// pan was resolved into this pair when the table was compiled.
    amp_l: f32,
    amp_r: f32,
    max_samples: usize, // 0 = no cap (play full buffer), in frames
    /// Which drum this is, as a [`KitVoice`] index, or [`NOT_A_DRUM`].
    /// Read only to answer the choke.
    voice: u8,
    /// The choke, once it has started: frames left of the fade and how long
    /// the fade is. `fade_len` of nought means nothing is fading.
    fade_left: u32,
    fade_len: u32,
    /// Does this voice go through the drum bus?
    ///
    /// **The click does not, and that is the rule this field exists for.**
    /// Its timing and its path are unchanged by everything in this pass: it
    /// is summed, mono, exactly where it always was, and the band is
    /// saturated, compressed and panned around it.
    band: bool,
    /// Is this voice's buffer INTERLEAVED STEREO?
    ///
    /// A ROUTING QUESTION AND A LAYOUT QUESTION ARE NOT THE SAME QUESTION,
    /// and for one pass they shared a field. `band` was read as both — "goes
    /// through the bus" and "is a pair of samples per frame" — which is true
    /// of a drum and false of the bass, the keys and a recorded melodic
    /// note, all of which are mono and all of which go through the bus.
    /// Read as a pair, a mono buffer is decimated by two: the bass came out
    /// an OCTAVE UP and half as long, on every jam, and every test that
    /// measured it measured energy in a window or a slot's own buffer, so
    /// none of them could see it. `a_bass_note_sounds_at_the_pitch_it_was_
    /// written_at` is the one that can.
    ///
    /// It is the same rule `jam::worst_bar_peak` already used to measure a
    /// table — `matches!(slot.sound, SoundId::Band { .. })` — so the clamp
    /// and the mixer now agree about what the band is.
    stereo: bool,
    /// How many frames of fade-out this voice ends its CAP with.
    ///
    /// A synthesised note carries its own release inside the buffer and the
    /// table's cap lands wherever it lands, which is inaudible because the
    /// recipes end quietly. A RECORDING does not: a bass note cut where the
    /// next chord starts is a step from whatever the string was doing
    /// straight down to nothing, and that is a click on every note of every
    /// walking line. So a melodic bank names its own release
    /// (`voices::MelodicBank::release_frames`) and this is it, in frames at
    /// the device's rate.
    ///
    /// Nought for everything else, which is every voice the engine had
    /// before recorded banks: the click, the count-in, the drums and the
    /// synthesised bass and keys.
    release: u32,
}

/// [`Voice::voice`] for everything that is not a drum — the click, the
/// count-in, the bass, the keys. Outside the range of any [`KitVoice`], so
/// no choke mask can name it.
use crate::jam::NOT_A_DRUM;

impl Voice {
    /// A voice of the CLICK: mono, centred, no drift, no choke, and it does
    /// not go through the drum bus.
    ///
    /// The metronome's own path, written once so the six places that spawn
    /// one cannot drift apart — and so that "the click is unchanged" is a
    /// property of this function rather than of six struct literals.
    #[inline]
    fn click(sound_id: SoundId, amplitude: f32, max_samples: usize) -> Self {
        Self {
            sound_id,
            position: 0,
            delay: 0,
            amp_l: amplitude,
            amp_r: amplitude,
            max_samples,
            voice: NOT_A_DRUM,
            fade_left: 0,
            fade_len: 0,
            band: false,
            stereo: false,
            release: 0,
        }
    }
}

impl Voice {
    /// The choke's gain: 1.0 until something silenced this drum, then a
    /// linear ramp to nothing over [`CHOKE_FADE_SECS`].
    #[inline]
    fn choke_gain(&self) -> f32 {
        if self.fade_len == 0 {
            1.0
        } else {
            self.fade_left as f32 / self.fade_len as f32
        }
    }

    /// The release: 1.0 until this voice is within [`Voice::release`] frames
    /// of the end of its cap, then a raised cosine down to nothing.
    ///
    /// A raised cosine and not the linear ramp the choke uses, and the
    /// difference is what the two are for. A choke is a cymbal being stopped
    /// by a stick — twenty milliseconds, and the corner at the top of it is
    /// inside the noise of the hit that caused it. A release is a note
    /// ending because the chord changed, three times as long, on a sustained
    /// tone with nothing to hide a corner behind: `0.5 + 0.5·cos(πx)` leaves
    /// the note at zero slope and reaches silence at zero slope, which is
    /// what "it stopped" sounds like instead of "something turned it down".
    ///
    /// The cost is one `cos` per frame per RELEASING voice — never for a
    /// drum, the click or a synthesised note, all of which return on the
    /// first comparison. At most nine voices can be releasing at once (a
    /// four-note voicing, the one before it still fading, and the bass), and
    /// the jitter probe is what says that is affordable rather than this
    /// sentence.
    #[inline]
    fn release_gain(&self) -> f32 {
        if self.release == 0 || self.max_samples == 0 {
            return 1.0;
        }
        let from = self.max_samples.saturating_sub(self.release as usize);
        if self.position < from {
            return 1.0;
        }
        let x = (self.position - from) as f32 / self.release as f32;
        0.5 + 0.5 * (std::f32::consts::PI * x.min(1.0)).cos()
    }

    /// Has this voice finished — run off the end of its sample, or been
    /// choked all the way down?
    #[inline]
    fn done(&self, frames: usize) -> bool {
        if self.fade_len > 0 && self.fade_left == 0 {
            return true;
        }
        let limit = if self.max_samples > 0 {
            self.max_samples.min(frames)
        } else {
            frames
        };
        self.position >= limit
    }
}

/// One slot of the table, spawned: the round robin chosen, the drift
/// applied, the pan resolved and whatever it chokes already fading.
///
/// **Everything here is arithmetic on integers and floats the caller is
/// already holding.** No allocation, no lock, no branch on anything behind a
/// pointer. The round robin is a modulo and the drift is a SplitMix hash
/// (`jam.rs`), both of them functions of the bar, the tick and the drum — so
/// the same bar of the same jam plays the same drums every time round, and a
/// take is reproducible.
///
/// The choke walks the ringing voices once, at the tick, and sets a counter
/// on anything this drum silences. That is bounded by `MAX_VOICES` and
/// happens once per hit rather than once per sample.
#[allow(clippy::too_many_arguments)]
#[inline]
fn spawn_band_voice(
    voices: &mut Vec<Voice>,
    slot: &crate::jam::JamSlot,
    volume: f32,
    bar: u32,
    tick: u32,
    ticks_per_bar: u32,
    tick_samples: u64,
    drift_frames: u32,
    choke_frames: u32,
) {
    if voices.len() >= MAX_VOICES {
        return;
    }
    let sound_id = match slot.sound {
        SoundId::Band { voice, layer, .. } => SoundId::Band {
            voice,
            layer,
            robin: crate::jam::round_robin(bar, ticks_per_bar, tick, slot.voice, slot.rr),
        },
        // A recorded note cycles its round robins the way a drum does, and
        // out of the same formula — so the same bar of the same jam plays
        // the same recordings every time round and a take is reproducible.
        // The line is the seed, so the bass and a chord landing together do
        // not step to the same recording together.
        SoundId::Voice {
            line, note, layer, ..
        } => SoundId::Voice {
            line,
            note,
            layer,
            robin: crate::jam::round_robin(bar, ticks_per_bar, tick, line as u8, slot.rr),
        },
        other => other,
    };
    // The drift. The bass and the keys get none: a walking line that pushed
    // and pulled against the drummer would be two people disagreeing rather
    // than one person playing.
    let (wobble, late) = if slot.voice == NOT_A_DRUM {
        (1.0, 0.0)
    } else {
        crate::jam::drift(bar, tick, slot.voice)
    };
    // AND THE KICK ON THE ONE IS NEVER LATE. The downbeat is where the band
    // agrees it is; a drummer who pushed that would be a drummer nobody
    // could play with.
    let on_the_one = tick == 0 && slot.voice == KitVoice::Kick as u8;
    let delay = if on_the_one {
        0
    } else {
        (late * drift_frames as f32) as u32
    };
    let gain = slot.gain * wobble * volume;

    choke_ringing(voices, slot.chokes, choke_frames);

    voices.push(Voice {
        sound_id,
        position: 0,
        delay,
        amp_l: gain * slot.pan_l,
        amp_r: gain * slot.pan_r,
        max_samples: if slot.cap_ticks > 0.0 {
            (tick_samples as f32 * slot.cap_ticks) as usize
        } else {
            0
        },
        voice: slot.voice,
        fade_left: 0,
        fade_len: 0,
        band: true,
        // A drum is a pair of samples a frame; the bass, the keys and a
        // recorded melodic note are one. See `Voice::stereo`.
        stereo: matches!(sound_id, SoundId::Band { .. }),
        // A recorded note fades rather than stopping where the cap lands.
        // The table resolved it when the bank was built; the callback
        // copies a number. See `Voice::release`.
        release: slot.release,
    });
}

/// What a hit silences: start the fade on every ringing voice this one closes.
///
/// The manifest said which drums close which (`choked_by`); `jam.rs` inverted
/// it into `chokes` when the table was compiled, so this is a mask test per
/// ringing voice and no more. Bounded by `MAX_VOICES` and run once per hit
/// rather than once per sample.
///
/// On its own so that a jam's slot and a song's event, which are spawned
/// differently in every other respect, cannot end up choking differently.
#[inline]
fn choke_ringing(voices: &mut [Voice], chokes: u32, choke_frames: u32) {
    if chokes == 0 {
        return;
    }
    for v in voices.iter_mut() {
        if v.band && v.voice != NOT_A_DRUM && (chokes & (1u32 << v.voice)) != 0 {
            // Already fading: leave the shorter fade alone rather than
            // restarting it, so two closed hats in a row do not make the open
            // one last longer than one would.
            if v.fade_len == 0 {
                v.fade_len = choke_frames.max(1);
                v.fade_left = v.fade_len;
            }
        }
    }
}

/// One note of a SONG's band, spawned.
///
/// [`spawn_band_voice`]'s twin, and the differences between them are the
/// difference between a jam and a song:
///
/// * **No drift.** A jam's drums are pushed and pulled a few milliseconds
///   because a band that lands perfectly is a machine. A song's band is where
///   the file put it, to the sample — the scorer's expected onsets come off
///   the same map, and a drummer three milliseconds early is three
///   milliseconds the player is measured against and did not hear.
/// * **No round robin decided here.** A song's bar and tick are known when the
///   table is compiled, so the robin is already in the `SoundId`. There is
///   nothing left to work out.
/// * **The cap is in FRAMES, not ticks.** A jam's tick length is the one
///   number the callback always has; a song's is different in every bar, so
///   the length of the note was resolved when the table was built.
///
/// What they share is everything that matters on this thread: no allocation,
/// no lock, the same guard against `MAX_VOICES`, and the same choke walk.
#[inline]
fn spawn_song_voice(
    voices: &mut Vec<Voice>,
    event: &crate::song::SongEvent,
    gain: f32,
    choke_frames: u32,
) {
    if voices.len() >= MAX_VOICES {
        return;
    }
    let slot = &event.slot;
    choke_ringing(voices, slot.chokes, choke_frames);
    voices.push(Voice {
        sound_id: slot.sound,
        position: 0,
        delay: 0,
        amp_l: gain * slot.pan_l,
        amp_r: gain * slot.pan_r,
        max_samples: event.cap_samples as usize,
        voice: slot.voice,
        fade_left: 0,
        fade_len: 0,
        band: true,
        // A drum is a pair of samples a frame; the bass, the keys and a
        // recorded melodic note are one. See `Voice::stereo`.
        stereo: matches!(slot.sound, SoundId::Band { .. }),
        release: slot.release,
    });
}

/// One click of a song, spawned.
///
/// The metronome's own three cases, in the metronome's own words — an accent
/// rings out uncapped at its tier's gain, a beat and a subdivision tick play
/// the kit's low sound capped at nine tenths of the gap to the next one. What
/// is different is only where the numbers came from: the tier off the bar's
/// meter and the cap off the bar's tempo, both decided when the song was
/// compiled, because a song's gap is different in every bar.
///
/// It goes down `Voice::click`, which is the metronome's own path: mono,
/// centred, outside the drum bus, summed exactly where the click has always
/// been summed. A song does not move the click.
#[inline]
fn spawn_song_click(
    voices: &mut Vec<Voice>,
    tick: &crate::song::SongTick,
    level: AccentLevel,
    kit: SoundKit,
    volume: f32,
) {
    // Guarded like every other push. See `MAX_VOICES`.
    if voices.len() >= MAX_VOICES {
        return;
    }
    let (sound, gain, cap) = match level {
        AccentLevel::Strong => (kit.high_id(), level.gain(), 0),
        AccentLevel::Medium => (kit.mid_id(), level.gain(), 0),
        AccentLevel::None => (
            kit.low_id(),
            if tick.sub == 0 { BEAT_GAIN } else { SUB_GAIN },
            tick.cap_samples as usize,
        ),
    };
    voices.push(Voice::click(sound, gain * volume, cap));
}

/// One click of a song, as the event loop will read it.
///
/// Every field comes off the compiled tick, which is the point: the callback
/// works out the timestamp and nothing else. `expected_interval_ms` is the
/// SONG's beat and not `AppState::bpm` — `TimingAnalyzer` sizes its matching
/// window from it, and a window built on the metronome screen's tempo while a
/// song plays at 70 % would be half the width the player is entitled to.
///
/// Pure, so the shape of a song's beat event can be tested without a device.
#[inline]
fn song_notification(
    tick: &crate::song::SongTick,
    session: u64,
    ts_ns: u64,
    delay_us: u64,
    level: AccentLevel,
    pass: u32,
) -> BeatNotification {
    BeatNotification {
        session,
        beat: tick.beat,
        measure_beat: tick.measure_beat,
        subdivision: tick.sub,
        subdivision_total: tick.subdivision_total.max(1),
        is_downbeat: tick.sub == 0,
        accent: level as u8,
        beats_per_bar: tick.beats_per_bar.max(1),
        ts_ns,
        expected_interval_ms: tick.interval_ms,
        // A SONG'S COUNT-IN IS NOT `AppState::count_in`, and these two flags
        // are what would tangle them. The engine's count-in counts beats at
        // the metronome's tempo and knows nothing about a 7/8 at 70 %; the
        // song's is in its own table at its own tempo, and `load_song` clears
        // the other one so only one of them can ever be running. The event
        // loop tells them apart by `song_bar` — see `song::COUNT_IN_BAR`.
        is_warmup_beat: false,
        is_warmup_transition: false,
        bar_just_completed: tick.bar_complete,
        delay_us,
        // There is no form and no band state while a song plays: the
        // contract's values for "there is no jam".
        jam_bar: 0,
        jam_chorus: 1,
        jam_band_state: JamBandState::Full,
        jam_bar_mismatch: false,
        song_bar: tick.bar,
        song_tick: tick.tick,
        song_pass: pass,
        jam_form_ended: false,
    }
}

/// How long a choke takes.
///
/// A drummer's open hat is closed by the next stick or the next foot, and
/// twenty milliseconds is what that sounds like: fast enough to be the
/// closing rather than a fade, slow enough not to be a click of its own.
/// `plans/JAM_SOUND.md` §2.4 — before this, an open hat rang across every
/// off-beat into the next beat, which is worst at Loud, where the grooves
/// use open hats most.
const CHOKE_FADE_SECS: f32 = 0.020;

// ---------------------------------------------------------------------------
// The drum bus
// ---------------------------------------------------------------------------

/// What makes the band sound like one kit rather than like a sum of drums.
///
/// `plans/JAM_SOUND.md` §2.7: dry hits summed are thin, and the reason the
/// jam played 9–13 dB below the metronome's own drum accent was that the
/// table was scaled so its busiest possible tick could never reach the
/// ceiling — every groove in the library paying for the loudest one nobody
/// writes. The scaling goes (`jam.rs` keeps it only as a safety clamp) and
/// this takes over: a tanh stage for the edge a recording has, then a peak
/// compressor for the glue, then the sum into the output.
///
/// **Fixed cost, and it never sees the click.** Every coefficient is worked
/// out when the stream opens or when a table arrives, so the per-sample work
/// is two `tanh`s, a comparison, a one-pole and — only while the band is
/// over the threshold — one `powf`. No branches on the table, no lookups, no
/// allocation. The click is summed after it, untouched, exactly where it was
/// before any of this existed.
struct DrumBus {
    /// How hard the band is pushed into the tanh. The kit's own number:
    /// 1.0 for a recording, more for a kit that is meant to sound driven.
    drive: f32,
    /// `1 / tanh(drive)`, so the curve passes through 1.0 at 1.0 — a
    /// full-scale sum comes out at full scale and not above it.
    shape: f32,
    /// One-pole coefficients for the envelope, from the device's rate.
    attack: f32,
    release: f32,
    /// Where the compressor starts working, −6 dBFS.
    threshold: f32,
    /// `1 − 1/ratio`, the exponent that turns "how far over" into "how much
    /// to take off" in one `powf` rather than two logarithms.
    slope: f32,
    /// The detector, between samples. The only state there is.
    env: f32,
}

/// The compressor's numbers, from the contract.
const BUS_ATTACK_SECS: f32 = 0.005;
const BUS_RELEASE_SECS: f32 = 0.080;
/// −6 dBFS.
const BUS_THRESHOLD: f32 = 0.5;
const BUS_RATIO: f32 = 3.0;

impl DrumBus {
    fn new(sr: u32) -> Self {
        let coefficient = |secs: f32| {
            // The usual one-pole: the fraction of the way to the target one
            // sample covers, so the envelope reaches 63% of a step in `secs`.
            let n = (secs * sr as f32).max(1.0);
            1.0 - (-1.0 / n).exp()
        };
        Self {
            drive: 1.0,
            shape: 1.0 / 1.0f32.tanh(),
            attack: coefficient(BUS_ATTACK_SECS),
            release: coefficient(BUS_RELEASE_SECS),
            threshold: BUS_THRESHOLD,
            slope: 1.0 - 1.0 / BUS_RATIO,
            env: 0.0,
        }
    }

    /// The kit decides the drive, so this moves when a table does — once, on
    /// the buffer where the table changed, and never per sample.
    #[inline]
    fn set_drive(&mut self, drive: f32, shape: f32) {
        self.drive = drive;
        self.shape = shape;
    }

    /// One stereo frame of the band, saturated and compressed.
    #[inline]
    fn process(&mut self, l: f32, r: f32) -> (f32, f32) {
        let l = (l * self.drive).tanh() * self.shape;
        let r = (r * self.drive).tanh() * self.shape;
        // Peak rather than RMS, and one detector for both sides: a
        // compressor that moved the channels independently would wander the
        // stereo image every time the snare landed.
        let peak = l.abs().max(r.abs());
        let c = if peak > self.env {
            self.attack
        } else {
            self.release
        };
        self.env += (peak - self.env) * c;
        // A COMPRESSOR THAT LAGS LETS THROUGH THE SAMPLE IT EXISTS FOR.
        //
        // Five milliseconds of attack is what makes this glue rather than a
        // limiter: a snare keeps its crack because the detector is still
        // catching up when the transient lands. But the tanh above only
        // asymptotes at `1 / tanh(drive)` — 1.31 at drive 1.0 — so a band
        // arriving at the safety clamp puts 1.31 into the output for those
        // five milliseconds, and what happens next is the mixer's hard
        // clamp, which is a square wave and the sound of failure.
        //
        // So the detector never lags behind a sample that is ALREADY over
        // full scale. Below full scale the attack is the attack and the
        // transients are intact; at or above it the envelope jumps, which is
        // what every limiter does and is inaudible next to clipping. The
        // release is unchanged, so the recovery is still 80 ms of the
        // compressor breathing rather than a gate.
        if peak > 1.0 && peak > self.env {
            self.env = peak;
        }
        if self.env > self.threshold {
            let g = (self.threshold / self.env).powf(self.slope);
            (l * g, r * g)
        } else {
            (l, r)
        }
    }
}

/// Ceiling on simultaneously ringing voices.
///
/// This used to be a `with_capacity(32)` and nothing else, which was fine
/// while the engine spawned exactly one voice per tick. A jam spawns up to
/// TWELVE — six drums, the bass, four notes of a keys voicing and the crash
/// on the one — and the kick, the snare, the crash and every keys note ring
/// out for most of a bar, so a busy 16th-note groove with a chord on every
/// eighth can legitimately have dozens alive at once. With the longest kit
/// in the set (`brushes`, a 700 ms crash) over a 700 ms keys tail, the
/// measured worst is well inside this.
///
/// A FOLDER OF THE MUSICIAN'S OWN DRUMS IS THE HARD CASE, and it is the one
/// this number now has to answer for. A custom voice may be
/// `kit::MAX_VOICE_SECS` long — nearly three times the longest drum the app
/// ships — and the kick, the snare and the crash are the lanes that are not
/// capped at all, so at 300 BPM sixteenths (a 50 ms tick) each of them can
/// keep forty copies alive out of one lane. Three uncapped lanes on every
/// tick is a hundred and twenty, plus the capped lanes, the crash on the
/// one, the bass and four keys notes. That is the arithmetic; the
/// measurement is `a_folder_of_two_second_drums_stays_under_the_ceiling`,
/// which renders it rather than reasoning about it.
///
/// A headroom figure, not a budget: the `Vec` is allocated once when the
/// audio thread starts, and EVERY push into it is guarded, so even a table
/// nobody could write drops a drum rather than reallocating on the audio
/// thread. The click's own push is guarded too. It adds one voice per tick
/// and the most it can keep alive is under a dozen, so the guard can never
/// fire on any input the engine accepts — but "can never fire" is a claim
/// about arithmetic somewhere else, and a `Vec::push` that grows is a
/// `malloc` in the callback, which is the one thing this engine is built not
/// to do.
///
/// `the_busiest_groove_never_makes_the_mixer_clamp` is what measures the
/// real number against this one: it renders every kit across the whole
/// tempo range and every sample rate a device hands out, and asserts the
/// live voice count stays under the ceiling.
const MAX_VOICES: usize = 256;

// ---------------------------------------------------------------------------
// Jam — the band the engine plays instead of the click
// ---------------------------------------------------------------------------

/// Where a compiled jam table waits for the audio thread.
///
/// The callback may not block on this and may not allocate to read it, so
/// `generation` carries the news: it is bumped whenever the table changes,
/// the callback compares one relaxed load per buffer, and only on a change
/// does it `try_lock` and clone the `Arc` — a refcount bump, not an
/// allocation. The same shape `accent_mask` uses: decide off the audio
/// thread, hand over a finished value.
pub struct JamHandoff {
    table: Mutex<Option<Arc<JamTable>>>,
    generation: AtomicU64,
    /// Where the form goes next — a jump, a loop, or neither. Handed over
    /// exactly the way the table is, behind its own generation counter, and
    /// for the same reason: one relaxed load per buffer on the common path,
    /// a `try_lock` only when something actually moved.
    ///
    /// It needs no retirement path at all. [`JamPosition`] is `Copy` and
    /// owns nothing, so the callback takes a snapshot out of the lock and
    /// there is no last reference to drop on the audio thread.
    position: Mutex<JamPosition>,
    position_generation: AtomicU64,
    /// How many bars the form of the table currently handed over has, or
    /// [`NO_FORM`] before there is one.
    ///
    /// Here so that [`JamHandoff::set`] can tell a NEW FORM from the SAME
    /// FORM ARRIVING AGAIN. The bar-ahead bass and keys send a fresh table
    /// on almost every bar line, and re-checking the position against each
    /// of them threw away a jump the musician had just asked for: press the
    /// footswitch in the window between two bass sends and the jump was
    /// gone, the band carried on, and the marker on the timeline never
    /// cleared. A form that is the same length has the same bar numbers, so
    /// there is nothing to re-check and the position is left alone.
    last_form_bars: AtomicI64,
    /// Tables the audio thread has finished with, parked here so the LAST
    /// reference is dropped on a thread that may free memory. The callback
    /// never drops a table: dropping the last `Arc<JamTable>` frees its
    /// `Vec`s, and with the bar-ahead bass a table is replaced several times
    /// a chorus, at the bar line. Capacity is reserved once and never grown.
    retired: Mutex<Vec<Arc<JamTable>>>,
}

/// How many replaced tables the command thread can be behind on before the
/// audio thread has to park them itself. Sixteen is a whole chorus of
/// bar-ahead sends with nobody draining.
const JAM_RETIRED_CAP: usize = 16;

/// [`JamHandoff::last_form_bars`] when no table is loaded. A real form is
/// 1..=64 bars, so -1 cannot collide with one.
const NO_FORM: i64 = -1;

impl JamHandoff {
    fn new() -> Self {
        Self {
            table: Mutex::new(None),
            generation: AtomicU64::new(0),
            position: Mutex::new(JamPosition::default()),
            position_generation: AtomicU64::new(0),
            last_form_bars: AtomicI64::new(NO_FORM),
            retired: Mutex::new(Vec::with_capacity(JAM_RETIRED_CAP)),
        }
    }

    /// Hand the engine a table, or `None` to take the band away and leave
    /// the plain click. Called from `set_jam`, never from the audio thread.
    pub fn set(&self, table: Option<Arc<JamTable>>) {
        // Free what the audio thread has handed back, here, where freeing
        // is allowed.
        self.drain_retired();
        // A new form is a new set of bar numbers, so the position it was
        // aimed at is re-checked against it — the jump dropped, the loop
        // kept only while it still fits. Worked out here rather than on the
        // audio thread because it is a question about the table, and the
        // command thread is the one holding it.
        let form_bars = table.as_ref().map(|t| t.form_bars());
        if let Ok(mut slot) = self.table.lock() {
            *slot = table;
            // Bumped after the write, so a callback that sees the new
            // generation is guaranteed to find the new table behind the lock
            // — and only after a write that happened.
            drop(slot);
            self.generation.fetch_add(1, Ordering::Release);
        }
        // ...but only when the form actually changed LENGTH. `set_jam` is
        // also the bar-ahead bass and keys send, which arrives on almost
        // every bar line with the same twelve bars it had before; a jump
        // waiting for the next bar line has to survive that, or a footswitch
        // pressed in the wrong tenth of a second does nothing at all. Same
        // number of bars, same bar numbers, nothing to re-check.
        let encoded = form_bars.map_or(NO_FORM, i64::from);
        if self.last_form_bars.swap(encoded, Ordering::AcqRel) != encoded {
            self.reposition(|p| p.for_table(form_bars), false);
        }
    }

    /// Hand the audio thread somewhere to be at the next bar line. Called
    /// from `set_jam_position`, never from the audio thread.
    ///
    /// Always bumps, even when the position reads the same as the one
    /// already stored. The audio thread CONSUMES a jump — it takes it out of
    /// its own copy at the bar line and this one is not told — so "jump to
    /// bar 9" pressed twice in a row is two jumps, and a generation that did
    /// not move would swallow the second.
    pub fn set_position(&self, position: JamPosition) {
        self.reposition(|_| position, true);
    }

    /// The position the engine is holding, for a command that has to check
    /// a new one against it.
    pub fn position(&self) -> JamPosition {
        self.position
            .lock()
            .map(|p| *p)
            .unwrap_or_else(|e| *e.into_inner())
    }

    /// Rewrite the position and tell the audio thread. The bump comes after
    /// the write for the same reason the table's does: a callback that sees
    /// the new generation must find the new value behind the lock.
    ///
    /// `always` is false for the housekeeping [`JamHandoff::set`] does on
    /// every table — and the UI sends four to six of those a chorus for the
    /// bar-ahead bass. Waking the callback each time to hand it the position
    /// it already has would be a cost with nothing on the other side of it.
    fn reposition(&self, f: impl FnOnce(JamPosition) -> JamPosition, always: bool) {
        if let Ok(mut slot) = self.position.lock() {
            let next = f(*slot);
            if !always && next == *slot {
                return;
            }
            *slot = next;
            drop(slot);
            self.position_generation.fetch_add(1, Ordering::Release);
        }
    }

    /// A DEVICE CHANGE TAKES A FOLDER'S DRUMS AWAY. Command thread only;
    /// returns whether it took anything.
    ///
    /// A table survives a device change on purpose — switch headphones
    /// mid-jam and the band is still there (see
    /// [`MetronomeEngine::set_jam_table`]) — and that used to be right for
    /// every table but one. It is now right for none of them, and the reason
    /// is that this pass moved the shipped kits out of the `SoundBank`.
    ///
    /// Every kit is decoded and resampled once, on the command thread, at
    /// the rate the device that was open at the time reported, and it is
    /// baked into the table. Play that on a 44.1 kHz device after a 48 kHz
    /// one and every drum is a semitone and a half flat, for as long as the
    /// jam is loaded, with nothing to tell the musician why.
    ///
    /// `kit::KitCache` keys on the rate, so the fix is only to make the app
    /// ASK again. Taking the table away does that: the plain click plays,
    /// and the next bar-ahead `set_jam` — at most a bar later, and the UI
    /// sends four to six a chorus — decodes the kit at the rate the new
    /// device actually opened at and hands the band back in tune. A bar of
    /// click is a smaller lie than a chorus of flat drums.
    pub(crate) fn drop_kit(&self) -> bool {
        let holds = self
            .table
            .lock()
            .map(|t| t.as_deref().is_some())
            .unwrap_or(false);
        if holds {
            self.set(None);
        }
        holds
    }

    /// Drop every retired table. Command thread only.
    pub(crate) fn drain_retired(&self) {
        if let Ok(mut r) = self.retired.lock() {
            r.clear();
        }
    }

    /// Audio thread: hand back a table it no longer reads. Never blocks and
    /// never allocates; when the slot is busy or full the table comes back
    /// in `Err` for the caller to park.
    fn try_retire(&self, table: Arc<JamTable>) -> Result<(), Arc<JamTable>> {
        match self.retired.try_lock() {
            Ok(mut r) if r.len() < r.capacity() => {
                r.push(table);
                Ok(())
            }
            _ => Err(table),
        }
    }
}

/// The audio thread's own parking spaces, for tables it replaced while the
/// retirement slot was busy. Flushed once per buffer. If even these are
/// full — five replacements landing inside the one moment the command
/// thread holds the retirement lock — the table is leaked rather than freed
/// here: memory lost is a price, a `free()` on the audio thread is the thing
/// the whole engine is built to avoid.
///
/// **What "leaked" costs is no longer a few kilobytes.** A table used to be
/// its own ticks and nothing else; one that names a folder of the
/// musician's drums carries the decoded samples too, up to
/// `kit::MAX_FOLDER_BYTES` — sixty-four megabytes — because the drums and
/// the table that names them are deliberately one object, swapped and
/// retired together (see `kit.rs`). The trade does not change: the audio
/// thread still must not free, and this path still needs five retirements
/// to collide inside one held lock, which has never been observed. But the
/// number is worth writing down, because "a few kilobytes" would make it
/// look like a path nobody has to care about, and a repeat of it would be a
/// folder's worth of memory each time.
struct JamRetirement {
    parked: [Option<Arc<JamTable>>; 4],
}

impl JamRetirement {
    fn new() -> Self {
        Self {
            parked: [None, None, None, None],
        }
    }

    fn retire(&mut self, handoff: &JamHandoff, table: Arc<JamTable>) {
        if let Err(table) = handoff.try_retire(table) {
            match self.parked.iter_mut().find(|s| s.is_none()) {
                Some(slot) => *slot = Some(table),
                None => std::mem::forget(table),
            }
        }
    }

    fn flush(&mut self, handoff: &JamHandoff) {
        for slot in self.parked.iter_mut() {
            if let Some(table) = slot.take() {
                if let Err(back) = handoff.try_retire(table) {
                    *slot = Some(back);
                    return;
                }
            }
        }
    }
}

/// WHICH DECODE a table's drums came from, or `None` when it has no band.
///
/// `KitBank::id` and not the kit's name or the folder's path: a musician who
/// replaces `snare.wav` while the app is open has the same path and a
/// different drum, and the whole reason that id exists is that the path
/// cannot tell the two apart (see `kit.rs`).
///
/// Used on the audio thread, on the one buffer where a table changes, to
/// answer "are the drums still ringing the same drums?".
#[inline]
fn bank_id(table: Option<&JamTable>) -> Option<u64> {
    table.map(|t| t.kit_bank().id)
}

/// A DRUM STILL RINGING OUT OF THE OLD KIT IS A CLICK IN THE NEW ONE.
///
/// A [`Voice`] is a [`SoundId`] and an offset, and `SoundId::Band` names a
/// DRUM rather than a decode: the samples behind it are whichever kit the
/// table the callback is holding carries. So a crash 200 ms into its wash
/// when the musician changes kit — or replaces `crash.wav` on disk, which is
/// the same thing to the cache — does not stop. It carries on at frame 9 600
/// of somebody else's cymbal, which is a step from one waveform straight to
/// another in the middle of a note. That is a click, and on a crash it is a
/// loud one.
///
/// Stopping those voices is the honest answer: the drum they were playing no
/// longer exists. Everything from the `SoundBank` — the click, the count-in,
/// the bass, the keys — rings on untouched, because their buffers did not
/// move.
///
/// Audio-thread safe: `Vec::retain` keeps its allocation and [`Voice`] owns
/// nothing, so this is a memmove and no more.
#[inline]
fn stop_voices_on_kit_change(voices: &mut Vec<Voice>, before: Option<u64>, after: Option<u64>) {
    if before == after {
        return;
    }
    voices.retain(|v| !v.band || !matches!(v.sound_id, SoundId::Band { .. }));
}

/// What the band does on `bar`, or `Full` with no band.
#[inline]
fn band_state_of(table: Option<&JamTable>, bar: u32) -> JamBandState {
    table.map_or(JamBandState::Full, |t| t.band_state(bar))
}

/// Shared handle to the engine's jam slot. Cloned into the audio thread and
/// into the Tauri command that fills it.
pub type SharedJam = Arc<JamHandoff>;

// ---------------------------------------------------------------------------
// Song — the imported piece the engine plays instead of the click or the band
// ---------------------------------------------------------------------------

/// Where a compiled song waits for the audio thread.
///
/// [`JamHandoff`]'s shape, and deliberately so: one relaxed load per buffer on
/// the common path, a `try_lock` and an `Arc` clone only when the generation
/// moves, and a retirement list so the LAST reference to a table — which
/// carries a decoded kit and two melodic banks, tens of megabytes — is dropped
/// on a thread that may call `free()`.
///
/// What it does NOT carry is a position. A jam's `JamPosition` is a jump and a
/// loop pending at the next bar line; a song's loop is baked into the table it
/// is part of, because the range decides how long a pass is and how long a
/// pass is decides where every sample in the table sits. Changing the range
/// recompiles — that is what `set_song_range` does — and the audio thread
/// swaps the whole thing at once rather than holding two ideas of where the
/// seam is.
///
/// The mix is the exception, and it is here for exactly the reason
/// `JamPosition` is on the jam: it is `Copy`, it owns nothing, and a musician
/// moving a fader must not pay for a recompile of the piece.
pub struct SongHandoff {
    table: Mutex<Option<Arc<crate::song::SongTable>>>,
    generation: AtomicU64,
    mix: Mutex<crate::song::SongMixGains>,
    mix_generation: AtomicU64,
    retired: Mutex<Vec<Arc<crate::song::SongTable>>>,
}

/// How many replaced songs the command thread can be behind on. A song is
/// replaced when the range, the speed or the mix of lanes changes, which is a
/// button press rather than a bar line — four is generous.
const SONG_RETIRED_CAP: usize = 4;

impl SongHandoff {
    fn new() -> Self {
        Self {
            table: Mutex::new(None),
            generation: AtomicU64::new(0),
            mix: Mutex::new(crate::song::SongMixGains::default()),
            mix_generation: AtomicU64::new(0),
            retired: Mutex::new(Vec::with_capacity(SONG_RETIRED_CAP)),
        }
    }

    /// Hand the engine a song, or `None` to take it away. Called from
    /// `load_song` / `clear_song`, never from the audio thread.
    pub fn set(&self, table: Option<Arc<crate::song::SongTable>>) {
        // Free what the audio thread has handed back, here, where freeing is
        // allowed.
        self.drain_retired();
        if let Ok(mut slot) = self.table.lock() {
            *slot = table;
            // Bumped after the write, so a callback that sees the new
            // generation is guaranteed to find the new table behind the lock.
            drop(slot);
            self.generation.fetch_add(1, Ordering::Release);
        }
    }

    /// Move a fader. Applies on the next buffer; nothing is recompiled.
    pub fn set_mix(&self, mix: crate::song::SongMixGains) {
        if let Ok(mut slot) = self.mix.lock() {
            if *slot == mix {
                return;
            }
            *slot = mix;
            drop(slot);
            self.mix_generation.fetch_add(1, Ordering::Release);
        }
    }

    /// The mix the engine is holding, for a command that has to report it.
    pub fn mix(&self) -> crate::song::SongMixGains {
        self.mix
            .lock()
            .map(|m| *m)
            .unwrap_or_else(|e| *e.into_inner())
    }

    /// The song the engine is holding, for a command that has to read the
    /// piece rather than change it — `start_take` is the one, which closes
    /// over it so the take's writer can say which bar the recording opens on.
    /// Command thread only; the audio thread has its own `Arc` already.
    pub fn table(&self) -> Option<Arc<crate::song::SongTable>> {
        self.table
            .lock()
            .map(|t| t.clone())
            .unwrap_or_else(|e| e.into_inner().clone())
    }

    /// Is a song loaded at all? Asked by the commands that have to stop one
    /// mode before starting another.
    pub fn is_loaded(&self) -> bool {
        self.table
            .lock()
            .map(|t| t.is_some())
            .unwrap_or(false)
    }

    /// Drop every retired song. Command thread only.
    pub(crate) fn drain_retired(&self) {
        if let Ok(mut r) = self.retired.lock() {
            r.clear();
        }
    }

    /// Audio thread: hand back a table it no longer reads. Never blocks and
    /// never allocates; a busy or full slot hands the table back in `Err` for
    /// the caller to park.
    fn try_retire(&self, table: Arc<crate::song::SongTable>) -> Result<(), Arc<crate::song::SongTable>> {
        match self.retired.try_lock() {
            Ok(mut r) if r.len() < r.capacity() => {
                r.push(table);
                Ok(())
            }
            _ => Err(table),
        }
    }
}

/// The audio thread's own parking spaces for replaced songs. [`JamRetirement`]
/// applied to the other table, with the same rule at the end of it: if even
/// these are full the table is leaked rather than freed here, because a
/// `free()` on the audio thread is the thing the engine is built to avoid.
struct SongRetirement {
    parked: [Option<Arc<crate::song::SongTable>>; 2],
}

impl SongRetirement {
    fn new() -> Self {
        Self { parked: [None, None] }
    }

    fn retire(&mut self, handoff: &SongHandoff, table: Arc<crate::song::SongTable>) {
        if let Err(table) = handoff.try_retire(table) {
            match self.parked.iter_mut().find(|s| s.is_none()) {
                Some(slot) => *slot = Some(table),
                None => std::mem::forget(table),
            }
        }
    }

    fn flush(&mut self, handoff: &SongHandoff) {
        for slot in self.parked.iter_mut() {
            if let Some(table) = slot.take() {
                if let Err(back) = handoff.try_retire(table) {
                    *slot = Some(back);
                    return;
                }
            }
        }
    }
}

/// Shared handle to the engine's song slot.
pub type SharedSong = Arc<SongHandoff>;

/// WHICH DECODE a song's drums came from, or `None` with no song. [`bank_id`]
/// for the other table, and it answers the same question for the same reason:
/// a drum still ringing out of a kit the table no longer carries is a click.
#[inline]
fn song_bank_id(table: Option<&crate::song::SongTable>) -> Option<u64> {
    table.map(|t| t.kit_bank().id)
}

/// How hard a song's click marks this tick, once the musician's accent MODE
/// has had its say.
///
/// The tier in the table is the meter's: it was worked out when the song was
/// compiled, because a bar's grouping cannot change under it. "Every beat" and
/// "no accents" are live settings on the metronome screen, and a song is still
/// the metronome — so they are applied here, on the tick, out of a `u8` the
/// callback is already holding.
///
/// Pure, on the audio thread, for the reason [`accent_for`] is.
#[inline]
fn song_accent(mode: AccentMode, compiled: u8, is_downbeat: bool) -> AccentLevel {
    match mode {
        AccentMode::None => AccentLevel::None,
        AccentMode::All => {
            if is_downbeat {
                AccentLevel::Strong
            } else {
                AccentLevel::None
            }
        }
        AccentMode::Groups => match compiled {
            x if x == AccentLevel::Strong as u8 => AccentLevel::Strong,
            x if x == AccentLevel::Medium as u8 => AccentLevel::Medium,
            _ => AccentLevel::None,
        },
    }
}

/// What sounds on one tick.
#[derive(Debug, PartialEq)]
enum JamPlay<'a> {
    /// The plain click, exactly as before Jam existed.
    Click,
    /// A jam is loaded, but its bar is not the bar this engine is playing.
    /// The click sounds and the engine says so once.
    Mismatch,
    /// The band.
    Band(&'a JamTick),
}

/// Does the band play this tick, and if so what?
///
/// Pure so the rules can be tested without an audio device — the same reason
/// [`accent_for`] is pure, and the same place in the callback.
///
/// Three things hand the tick back to the click, and each is a decision made
/// somewhere else:
///
/// * **The count-in.** `arm_count_in`'s beeps own those beats. The band comes
///   in on the transition tick, which is beat 0 of the real thing, so
///   `counting_in` is false there. **Except for the pickup**, which is the
///   one thing the band plays before bar one — see `pickup` below.
/// * **The speed ramp.** A drill ramps the *click*; while `ramp_active` the
///   table is ignored on purpose. Playing a groove through a tempo ramp is
///   Jam 2, and doing it by accident today would mean a drill whose bar
///   length and the table's disagree every few steps.
/// * **A bar the table was not written for.** The UI sets subdivision and
///   beat groups BEFORE calling `set_jam` (`plans/tasks/jam/BRIEF.md`); when
///   it has not, the engine plays the click rather than guessing which
///   column of the table is which beat.
///
/// And ONE thing takes a tick off the count-in and gives it to the band:
///
/// * **The pickup.** `pickup` is true on every tick of the last beat the
///   count-in would have sounded, and only when a table asked to be played in
///   ([`JamTable::pickup_tick`]). The band plays the fill's last beat there
///   and the count-in is silent for it, which is a drummer counting three and
///   playing the fourth. A table with no pickup row answers `Click` and the
///   count-in sounds exactly as it always has — the whole rule is that
///   lookup, so a jam that did not ask for a pickup cannot get one.
#[allow(clippy::too_many_arguments)]
fn jam_play(
    table: Option<&JamTable>,
    counting_in: bool,
    pickup: bool,
    ramp_active: bool,
    beats_per_measure: u32,
    subdivision: u32,
    measure_beat: u32,
    sub_count: u32,
    jam_bar: u32,
) -> JamPlay<'_> {
    let table = match table {
        // The pickup is inside the count-in, so it is asked FIRST: after the
        // count-in's own arm, and still never over a drill's ramp.
        Some(t) if !ramp_active && (pickup || !counting_in) => t,
        _ => return JamPlay::Click,
    };
    if table.ticks_per_bar() != beats_per_measure.saturating_mul(subdivision) {
        return JamPlay::Mismatch;
    }
    if pickup {
        // A table with no pickup hands the beat back to the count-in, which
        // is the difference between "this jam has no pickup" and "this jam
        // has a silent one".
        return match table.pickup_tick(sub_count) {
            Some(t) => JamPlay::Band(t),
            None => JamPlay::Click,
        };
    }
    match table.tick(measure_beat * subdivision + sub_count, jam_bar) {
        Some(t) => JamPlay::Band(t),
        // Unreachable given the width check above; a bar the engine cannot
        // index is a click, never a panic on the audio thread.
        None => JamPlay::Mismatch,
    }
}

/// Is this count-in beat the PICKUP — the last beat before bar one?
///
/// Pure, and beside [`jam_play`] for the reason [`accent_for`] is: it is a
/// rule, it runs on the audio thread, and it has to be testable without a
/// sound card.
///
/// The arithmetic is the whole of it, and it is settled the moment the
/// count-in is armed. A count-in of `beats` beats sounds `beats - 1` of them
/// and hands the last one to bar one — that is what `arm_count_in` means by
/// "the last of them becomes beat 0 of what follows" — so the pickup is the
/// beat before that: the last one the count-in actually plays, whether the
/// count is two bars, one bar, or shorter than a bar.
///
/// ASKED ON A DOWNBEAT AND ONLY ON A DOWNBEAT. `warmup_count` is beats DONE,
/// and the event thread counts a beat done as soon as its downbeat is
/// reported — several buffers before the beat is over — so on the later ticks
/// of the pickup beat this would answer "no". A fill cut into sixteenths is a
/// whole beat of ticks, so the tick loop asks here once and latches the
/// answer for the beat (`jam_in_pickup`). `is_last_warmup` never needed that
/// because it is a question about a downbeat.
#[inline]
fn is_pickup_beat(warming_up: bool, warmup_count: u8, warmup_beats: u8) -> bool {
    warming_up
        // Not bar one: that beat belongs to the form, and this is the same
        // test `is_last_warmup` makes in the tick loop.
        && warmup_count.saturating_add(1) < warmup_beats
        // The one before it.
        && warmup_count.saturating_add(2) >= warmup_beats
}

/// Does the tick about to sound still belong to the bar a HELD meter was
/// posted on?
///
/// Pure, and beside [`is_pickup_beat`] for the same reason: it is a rule, it
/// runs on the audio thread, and it has to be testable without a sound card.
///
/// A setlist's switch is posted at a bar line — the beat notification for
/// that tick leaves the callback BEFORE the tick is heard, so "posted at bar
/// line N" is the literal truth even though the engine has already worked
/// that tick out. What it cannot do is un-sound it; what it can do is give
/// the new meter to the bar that line opened, which is where the player
/// hears the change begin.
///
/// So the held meter lands on the first tick that is still inside that bar's
/// FIRST BEAT — `measure_beat` 0, any subdivision of it, plus the whole-beat
/// tick of beat 1, which is the earliest the callback can see a change posted
/// on an unsubdivided click. It lands WITHOUT touching `measure_beat`: the
/// bar keeps the downbeat it already sounded and simply runs to its new
/// length, which is why the seam has no stub bar in it.
///
/// Anything later — a slow round trip, a change posted mid-bar — is not that
/// bar's any more and waits for `measure_beat` to wrap to 0, so the bar in
/// progress finishes at its old length. Either way the bar line never moves,
/// and the engine stays the one place that decides where a bar begins.
#[inline]
fn held_meter_due(measure_beat: u32, sub_count: u32) -> bool {
    measure_beat == 0 || (measure_beat == 1 && sub_count == 0)
}

/// Move the form on by one bar: 0-based bar within the chorus, 1-based
/// chorus. `form_bars` is validated to 1..=64 when the table is compiled, so
/// this cannot spin and cannot divide by nothing.
#[inline]
fn advance_form(jam_bar: u32, jam_chorus: u32, form_bars: u32) -> (u32, u32) {
    let next = jam_bar + 1;
    if next >= form_bars.max(1) {
        (0, jam_chorus.saturating_add(1))
    } else {
        (next, jam_chorus)
    }
}

/// Where the form goes at a bar line, with a jump or a loop in play.
///
/// Pure, for the same reason [`jam_play`] and [`accent_for`] are: this is
/// the rule, it runs on the audio thread, and it has to be testable without
/// a sound card. It returns the position AND what is left of the command,
/// because a jump is consumed by being used and the callback has to know.
///
/// The order is the order a musician would say it in:
///
/// 1. **A jump wins over the advance.** Press "go to the bridge" during bar
///    3 and the next bar is the bridge, not bar 4. The chorus does not
///    change: you have not been round the form, you have moved inside it.
/// 2. **The loop catches whatever comes out.** If the new bar is outside
///    `start..=end` the form goes back to `start`. That applies to a jump
///    as well as to an advance: while a loop is set, the loop is where the
///    form lives, and a jump outside it would last exactly one bar before
///    being pulled back anyway. A UI that wants to leave the loop sends
///    `loop: null` in the same command.
/// 3. **A wrap the loop catches is not a chorus.** Looping the last four
///    bars of a twelve-bar form crosses the top of the form every time
///    round, and counting each of those as a chorus would have the
///    transport reading "chorus 40" after ten minutes on a turnaround.
///    A loop that spans the whole form is not caught — bar 0 is inside it
///    — so playing the form on repeat still counts choruses, which is the
///    same thing it did before loops existed.
fn next_form_position(
    jam_bar: u32,
    jam_chorus: u32,
    form_bars: u32,
    position: JamPosition,
) -> (u32, u32, JamPosition) {
    let form_bars = form_bars.max(1);
    let mut left = position;
    // A jump past the end of the form cannot happen — `validate_position`
    // refuses it against the table that is loaded — but the audio thread
    // clamps rather than trusts, because the alternative is reading past
    // the band-state table.
    let (mut bar, mut chorus) = match left.jump.take() {
        Some(j) => (j.min(form_bars - 1), jam_chorus),
        None => advance_form(jam_bar, jam_chorus, form_bars),
    };
    if let Some((start, end)) = left.loop_bars {
        if bar < start || bar > end {
            bar = start.min(form_bars - 1);
            // The advance that wrapped is the one being undone.
            chorus = jam_chorus;
        }
    }
    (bar, chorus, left)
}

/// Does a position the musician just sent cancel a pending ending?
///
/// A jam whose bar carries `endsForm` stops when that bar completes —
/// unless somebody reached for the footswitch first. A jump or a loop asked
/// for during the bar is somebody saying they are not finished, and the app
/// stopping under their hand would be the app deciding it knew better.
///
/// A command that names NEITHER is asking for neither: `{ jumpTo: null,
/// loop: null }` clears a loop, and clearing a loop on the last bar of a
/// song is not a reason to play another chorus. That is also what keeps the
/// housekeeping [`JamHandoff::set`] does on a new form out of it — that only
/// ever takes a jump or a loop AWAY.
///
/// Pure, and on the audio thread, for the reason [`jam_play`] and
/// [`next_form_position`] are: the rule is testable without a sound card.
#[inline]
fn position_cancels_an_ending(position: JamPosition) -> bool {
    position.jump.is_some() || position.loop_bars.is_some()
}

/// What the band does on a bar the form is being PUT at rather than moved
/// to — the restart's other half, and the clamp that keeps a bar number
/// nobody computed here out of the band-state table.
#[inline]
fn form_at(table: Option<&JamTable>, bar: u32) -> (u32, JamBandState) {
    let bar = match table {
        Some(t) => bar.min(t.form_bars().saturating_sub(1)),
        None => 0,
    };
    (bar, band_state_of(table, bar))
}

/// Put the form back to the top, and say what the band does there — and
/// what is left of the position afterwards.
///
/// The top is, in the order a musician would say it:
///
/// 1. **The pending jump, if there is one** — and it is CONSUMED here. This
///    is what the screen already says out loud: `useJamSession.ts` documents
///    `currentBar` while stopped as "the one the next press of play will
///    start on, which is the pending jump if there is one". Before this the
///    engine disagreed with the drawing: it started at the top of the loop,
///    left the jump pending, and the bar line at the end of bar 1 then took
///    it — so pressing play after picking a bar gave you one wrong bar
///    first.
/// 2. **The first bar of the loop**, when one is set: press stop and play
///    again with the turnaround looped and you want the turnaround, not one
///    bar of the head first.
/// 3. **Bar 0.**
///
/// The caller decides whether the consumption sticks: while the transport is
/// STOPPED this runs every buffer, only to say where play would start, and
/// there the leftover is thrown away. It is stored back at the moments the
/// transport actually starts.
///
/// With no band at all it is bar 0 and `Full`, which is what the contract
/// says `formBar` and `bandState` mean on a plain click.
#[inline]
fn form_restart(
    table: Option<&JamTable>,
    position: JamPosition,
) -> (u32, JamBandState, JamPosition) {
    let mut left = position;
    let target = match left.jump.take() {
        Some(j) => j,
        None => left.loop_bars.map_or(0, |(start, _)| start),
    };
    let (bar, state) = form_at(table, target);
    (bar, state, left)
}

// ---------------------------------------------------------------------------
// Cached parameters (snapshot from SharedState, read once per buffer)
// ---------------------------------------------------------------------------

struct CachedParams {
    bpm: u16,
    subdivision: u8,
    volume: f32,
    kit: SoundKit,
    /// Mirror of `SharedState::beat_groups`. Allocated once with
    /// capacity `MAX_BEAT_GROUPS` and only ever refilled in place —
    /// the audio callback must never allocate.
    beat_groups: Vec<u8>,
    /// Bit per bar-local beat position that starts a group (= is
    /// accented). Rebuilt only when `beat_groups` actually changes so
    /// the per-beat accent test is a single bit-and.
    accent_mask: u32,
    accent_mode: AccentMode,
    /// `beat_groups.iter().sum()`, precomputed alongside `accent_mask`.
    beat_groups_total: u32,
    beat_groups_changed: bool,
    /// A meter posted AT A BAR LINE, waiting for the bar line it was posted
    /// on. Allocated once with capacity `MAX_BEAT_GROUPS` and only ever
    /// refilled in place, exactly like `beat_groups` — see `held_meter_due`.
    held_beat_groups: Vec<u8>,
    /// True while `held_beat_groups` holds a change not yet made current.
    beat_groups_held: bool,
    ramp_active: bool,
    ramp_beats_per_bar: u8,
    ramp_warming_up: bool,
    warmup_count: u8,
    warmup_beats: u8,
    /// The band, when a jam is loaded. Cloned out of the shared slot only
    /// when `jam_generation` moves — an `Arc` clone is a refcount bump, and
    /// the callback does not do even that on a buffer where nothing changed.
    jam: Option<Arc<JamTable>>,
    /// A table that arrived mid-bar and differs from `jam` only in its bass
    /// line. Held here until the bar line, then made current — the engine's
    /// half of the bar-ahead handshake the UI's `useJamSession.ts` describes.
    /// See `jam::swap_defers`.
    jam_pending: Option<Arc<JamTable>>,
    jam_generation: u64,
    /// Where the form goes at the next bar line. A snapshot of the shared
    /// slot, taken only when its generation moves. The callback OWNS this
    /// copy: consuming a jump means clearing it here, and the command
    /// thread's copy is deliberately not told, so a repeat of the same jump
    /// arrives as a new generation rather than as a value that looks
    /// unchanged.
    jam_position: JamPosition,
    jam_position_generation: u64,
    /// Set on the buffer that picked up a new table (or dropped one), so the
    /// tick loop can put the form back to bar 0 / chorus 1.
    jam_changed: bool,
    /// What the count-in beats play: `None` is the beep the drill has always
    /// used, `Some(slot)` is the kit's sticks. Read off the table WHENEVER
    /// THE TABLE CHANGES and never per tick — that is the whole reason it is
    /// a field here rather than a call into `cached.jam` in the tick loop.
    count_in_slot: Option<crate::jam::JamSlot>,
    /// THE SONG, when one is loaded. Cloned out of the shared slot only when
    /// `song_generation` moves, exactly as the jam is — and when one is here
    /// the jam does not play at all: a song is its own engine mode, and
    /// `load_song` takes the band away on the command thread before the table
    /// ever arrives.
    song: Option<Arc<crate::song::SongTable>>,
    song_generation: u64,
    /// Set on the buffer that picked a new song up (or dropped one), so the
    /// tick loop can put the cursor back to the top of the range.
    song_changed: bool,
    /// The musician's faders. `Copy`, four floats, behind their own
    /// generation counter — the same handshake `jam_position` uses, for the
    /// same reason: a fader move must not recompile the piece.
    song_mix: crate::song::SongMixGains,
    song_mix_generation: u64,
    /// Where the band is copied while a take records, or `None`. Cloned out
    /// of the shared slot only when its generation moves.
    take_record: Option<Arc<crate::take::TakeRing>>,
    take_record_generation: u64,
    /// Does the ring above still need to be told where the transport was?
    ///
    /// Raised when a ring arrives, lowered by the one buffer that stamps it.
    /// A plain bool in the callback's own cached state, so the cost on every
    /// other buffer of a take is a branch on a value already in a register —
    /// the stamp itself is four relaxed stores, once, of numbers the frame
    /// loop is about to use anyway. See `take::TakeRing::stamp_start`.
    take_stamp_pending: bool,
    /// The take being played back, if one is: the samples, the rate they
    /// were recorded at, and how far through them the callback is.
    take_play: Option<crate::take::TakePlayback>,
    take_play_generation: u64,
    /// Position in `take_play.pcm`, in SOURCE samples, as a float — the take
    /// was recorded through whatever device was there then and is being
    /// played out of whatever is there now, so the step is a ratio.
    take_play_pos: f64,
    /// Has THIS playback already been reported as finished?
    ///
    /// A take that has run out keeps running out: the buffer after it, and
    /// every buffer after that, reads past the end and would raise the
    /// "it ended" flag again, and the event loop's 50 ms pass would emit
    /// `take-playback-ended` twenty times a second until the user pressed
    /// stop. The flag on the handoff is consumed by the reader, so it cannot
    /// answer "have I said this already?" — only the callback knows which
    /// playback it is on, so the latch lives here beside `take_play_pos` and
    /// is cleared where that is, when a new take is installed.
    take_play_ended: bool,
    /// The line the coach is saying, if one is. Mono, already at this
    /// device's rate and already at the coach's volume — see `speech_out`.
    speech: Option<SpeechClip>,
    speech_generation: u64,
    /// How far through that line the callback is, in samples. A plain index
    /// and not a float like `take_play_pos`, because a line of speech is
    /// resampled to this device's rate before it ever gets here: the
    /// thread that asked for it had nothing else to do while Piper ran.
    speech_pos: usize,
}

/// The count-in sound a table asks for, or the beep when there is no table.
///
/// One line, called at each of the (three) places `cached.jam` is assigned,
/// so the decision is made when the table changes and nowhere else.
#[inline]
fn count_in_slot_of(table: Option<&JamTable>) -> Option<crate::jam::JamSlot> {
    table.and_then(|t| t.count_in_slot())
}

/// Should a buffer that ran off the end of a take raise the "it ended" flag?
///
/// The first one does; the ones after it do not. Once playback has run out
/// it STAYS run out — `sample_at` returns `None` for every buffer after,
/// forever, and the event loop wakes every 50 ms — so without the latch the
/// UI is told the take finished twenty times a second until somebody
/// presses stop. `already` is the callback's own copy, cleared when a new
/// take is installed, because the flag on the handoff is consumed by the
/// reader and cannot answer "have I said this already?".
///
/// Pure, and on the audio thread, for the reason [`jam_play`] and
/// [`accent_for`] are: the rule is testable without a sound card.
#[inline]
fn should_report_take_end(ran_out: bool, already: &mut bool) -> bool {
    if !ran_out || *already {
        return false;
    }
    *already = true;
    true
}

/// How hard should this tick be accented — [`AccentLevel`]?
///
/// Pure so it can be unit-tested without an audio device.
///
/// **Which beats are strong and which are middling**: under `Groups`, the
/// first set bit of `accent_mask` — beat one, the bar's own opening — is
/// Strong, and every other group start is Medium. `All` is every beat Strong,
/// unchanged in sound from before the tier existed, because a player who
/// asked for flat pulses asked for flat pulses. `None` is none. A ramp
/// accents its own bar line Strong, and has no middle to mark. FREE mode is
/// one group of N, so its beat 0 is Strong and nothing else accents at all.
/// **A subdivision tick is never an accent of any kind**, which is the
/// `is_downbeat` in every branch below.
///
/// FREE mode is checked **first**: it means "N equal beats, no accent
/// structure", and that has to hold everywhere — including while the drill's
/// speed ramp is active, which otherwise imposes its own
/// `ramp_beats_per_bar` bar accent (N1 on PR #11).
///
/// The grouped case takes a precomputed `accent_mask` rather than the
/// `beat_groups` slice: this runs on the audio thread once per beat, and
/// rebuilding a `HashSet` there allocated on every single click. The mask
/// is rebuilt only when the grouping actually changes — see
/// [`accent_mask`] and `CachedParams::accent_mask`.
///
/// THE TIER COSTS NOTHING the bit test did not. It is the same mask and one
/// more instruction on it — `trailing_zeros`, which is where the first group
/// start is — so nothing was added to `CachedParams` and nothing on the audio
/// thread got bigger. A second mask or a level array would have been the
/// obvious shape and would have had to be kept in step with this one.
fn accent_for(
    mode: AccentMode,
    ramp_active: bool,
    ramp_beats_per_bar: u8,
    accent_mask: u32,
    is_downbeat: bool,
    beat_count: u32,
    measure_beat: u32,
) -> AccentLevel {
    // The mode comes first, because it is the user saying what they want to
    // hear and everything below is a rule about where accents fall by default.
    match mode {
        AccentMode::None => return AccentLevel::None,
        // Every beat, whatever the meter, the grouping, or a running ramp.
        AccentMode::All => {
            return if is_downbeat {
                AccentLevel::Strong
            } else {
                AccentLevel::None
            }
        }
        AccentMode::Groups => {}
    }
    // FREE mode used to short-circuit to `false` here, because before the
    // accent control existed it was the only way to hear a bar with no accents
    // at all. `AccentMode::None` is that now, and the special case had become a
    // bug: a player on FREE with "Group starts" selected got silence and an
    // unlit first dot, which reads as broken rather than as a rule.
    //
    // Nothing replaces it, because nothing needs to. FREE mode is one group of
    // N beats — `collapse_to_free` enforces that on the way in and
    // `restore_beat_groups` repairs any store that says otherwise — so its mask
    // is exactly `{0}` and the line below already accents the first beat and
    // only the first beat.
    if ramp_active {
        let bpb = if ramp_beats_per_bar >= 2 {
            ramp_beats_per_bar as u32
        } else {
            4
        };
        // A ramp's bar is a count, not a grouping: it has a first beat and no
        // middle, so the one accent it has is the strong one.
        return if is_downbeat && (beat_count % bpb) == 0 {
            AccentLevel::Strong
        } else {
            AccentLevel::None
        };
    }
    if !is_downbeat {
        return AccentLevel::None;
    }
    group_accent(accent_mask, measure_beat)
}

/// How hard a BEAT is marked under a grouping — the last three lines of
/// [`accent_for`], on their own so a song can ask the same question.
///
/// The bar's own opening against a group's inside it. `trailing_zeros` is the
/// lowest set bit and so the first group start; on an empty mask it answers
/// 32, which `mask_has_accent` refuses.
///
/// A subdivision tick is never an accent, and that rule stays with the
/// callers: this is only ever asked about a beat.
#[inline]
pub(crate) fn group_accent(accent_mask: u32, measure_beat: u32) -> AccentLevel {
    if !mask_has_accent(accent_mask, measure_beat) {
        return AccentLevel::None;
    }
    if accent_mask.trailing_zeros() == measure_beat {
        AccentLevel::Strong
    } else {
        AccentLevel::Medium
    }
}

/// Upper bound on the number of groups (`validate_beat_groups`).
/// Used to pre-size the callback's `beat_groups` mirror.
const MAX_BEAT_GROUPS: usize = 6;

/// Bitmask of the bar-local positions that carry an accent — one bit
/// per beat, bit `n` set when beat `n` opens a group.
///
/// `validate_beat_groups` caps the bar at 16 beats, so every position
/// fits in a `u32` with room to spare; positions past bit 31 (only
/// reachable from unvalidated input) are dropped rather than shifting
/// out of range.
pub(crate) fn accent_mask(groups: &[u8]) -> u32 {
    let mut mask = 0u32;
    let mut cursor = 0u32;
    for &g in groups {
        if cursor >= 32 {
            break;
        }
        mask |= 1u32 << cursor;
        cursor += g as u32;
    }
    mask
}

/// Is the bar-local position `beat` accented under `mask`?
#[inline]
fn mask_has_accent(mask: u32, beat: u32) -> bool {
    beat < 32 && (mask & (1u32 << beat)) != 0
}

// ---------------------------------------------------------------------------
// Beat notification — audio callback -> event thread
// ---------------------------------------------------------------------------

struct BeatNotification {
    session: u64,
    beat: u32,
    measure_beat: u32, // bar-local position (0..beats_per_measure), resets on group change
    subdivision: u32,
    /// Path B — user-configured subdivision count (1, 2, 3, 4, 6).
    /// Mirrored to BeatTick so the matcher's rhythm-inference can map
    /// each tick to its phase within the beat.
    subdivision_total: u8,
    is_downbeat: bool,
    /// How hard this tick is accented — [`AccentLevel`] as a `u8`, so
    /// 0 none, 1 a group start inside the bar, 2 the bar's own opening.
    /// Mirrored to `BeatEvent` so the UI never has to re-derive accent
    /// positions from `beat_groups`.
    accent: u8,
    /// Beats per bar the engine used to wrap `measure_beat` for this
    /// tick — ramp `beats_per_bar` while the ramp is active, else the
    /// meter total.
    beats_per_bar: u8,
    ts_ns: u64,
    expected_interval_ms: f64,
    is_warmup_beat: bool,
    is_warmup_transition: bool, // last warmup beat = first real beat (beat 0)
    bar_just_completed: bool,
    delay_us: u64, // output latency — how long to wait before emitting visual event
    /// Where this tick sits in a jam's form: 0-based bar within the chorus,
    /// 1-based chorus. 0 and 1 when no jam is loaded, which is what the
    /// contract says `formBar` / `chorus` mean on a plain click.
    jam_bar: u32,
    jam_chorus: u32,
    /// What the band is doing on this bar — `Full` whenever no jam is
    /// loaded. Constant across the bar by construction: it is read off the
    /// table with `jam_bar`, and `jam_bar` only moves at a bar line.
    jam_band_state: JamBandState,
    /// A jam is loaded but its bar is not the engine's bar, so the click
    /// played instead. True only on the first such tick after a table
    /// arrives — the event thread says so once, not thirteen times a second.
    jam_bar_mismatch: bool,
    /// Which time round the range this is, from 0. 0 with no song, and 0
    /// through a count-in.
    ///
    /// A COUNT AND NOT A "DID IT JUST LOOP" BIT, and the reason is the
    /// contract: `OnsetResult.pass` and `ExtraOnset.pass` in
    /// `plans/tasks/songs/BRIEF.md` are "times round a loop, from 0", and the
    /// engine is the only thing that knows. Deriving it in the frontend from a
    /// bar number that comes round would be a second implementation of a
    /// number that has to agree with the one the scorer keeps.
    song_pass: u32,
    /// WHICH PLAYED BAR OF THE SONG this tick is in, or
    /// [`crate::song::NO_SONG_BAR`] when no song is playing — and through a
    /// song's count-in, which is not a bar of the piece.
    ///
    /// An index into the transport's `bars`, so it survives a range: loop bars
    /// 17 to 24 and the first tick of every pass says 17, not 0. The tab's
    /// cursor hangs off it, and so does the scorer's idea of which pass it is
    /// scoring.
    song_bar: u32,
    /// And where in the song's own ticks it landed, 960 to the quarter. 0 with
    /// no song. The pair is what makes a beat event addressable back into the
    /// score: a bar and an offset inside it.
    song_tick: u32,
    /// The bar that just completed carried `endsForm`, and the band has
    /// stopped.
    ///
    /// The audio thread has ALREADY lowered the transport flag by the time
    /// this arrives — the band must stop on the downbeat, and the event
    /// thread sleeps the output latency before it does anything. What is
    /// left for the event thread is the half that needs a lock: the app
    /// state, and the word.
    jam_form_ended: bool,
}

// ---------------------------------------------------------------------------
// The beat queue — callback to event loop, preallocated
// ---------------------------------------------------------------------------

/// How many [`BeatNotification`]s the output callback may be ahead of the
/// event loop.
///
/// **A dropped notification is not cosmetic.** `beat_log` is the only place
/// [`crate::timing::TimingAnalyzer`] learns where a beat fell, so a
/// notification the queue throws away is a beat the matcher never sees and a
/// score the player did not earn (learned 2026-09-04). The drop path below
/// exists because a full queue leaves an audio callback no other move — not
/// because dropping is acceptable. So the queue is sized for the worst case
/// the app can produce, several times over.
///
/// The worst case is bounded and small. `set_bpm` clamps the tempo to
/// 20..=300 and `set_subdivision` clamps the resolution to 1..=6, so the
/// fastest tick stream the engine can ever produce is 300 BPM sextuplets:
/// **30 ticks a second**, one every 33 ms. 512 slots is **seventeen seconds**
/// of that. The event loop wakes on every push and in any case at least every
/// 50 ms, and the longest thing it does per notification is one
/// `thread::sleep(delay_us)` of an output latency — a few milliseconds. For
/// this to overflow the event thread would have to be off the CPU for
/// seventeen seconds, which is not a full queue, it is a hung machine.
///
/// The cost is the memory: thirteen parallel arrays, 56 bytes a slot, ~29 KB,
/// allocated once when the audio thread starts and never grown.
const BEAT_QUEUE_SLOTS: usize = 512;

/// The preallocated, lock-free hand-off from the cpal output callback to the
/// engine's event loop.
///
/// It replaces a `std::sync::mpsc::channel`, which was the wrong shape twice
/// over — and both faults were on the audio thread, once per metronome tick:
///
/// * **It allocated.** std's unbounded channel stores messages in blocks of
///   31 and `Box`es a new one when the current block fills
///   (`sync/mpmc/list.rs::start_send`). At 200 BPM sixteenths that is a
///   `malloc` under the mixer every 2.3 seconds.
/// * **It took a lock.** Every send ends in `self.receivers.notify()`, which
///   locks a `Mutex` whenever a receiver is registered as sleeping
///   (`sync/mpmc/waker.rs::SyncWaker::notify`) — and the event loop slept in
///   `recv_timeout` between beats, so it was registered essentially always.
///   A `Mutex` shared with a lower-priority thread, acquired from a
///   `THREAD_PRIORITY_TIME_CRITICAL` callback, is a priority inversion: the
///   click waits on the UI thread. T06 saw exactly the symptom — promoting
///   the *event loop* improved *callback* jitter, which only makes sense if
///   the callback depends on the loop.
///
/// The shape is [`crate::take::TakeRing`]'s, applied to a struct: one writer
/// (the audio thread), one reader (the event loop), a power-of-two ring of
/// preallocated slots, and monotonic `write` / `read` counts. A push is an
/// acquire load, thirteen relaxed stores and one release store; there is no
/// `unsafe` anywhere in it, because each field of a slot is its own atomic
/// exactly the way [`CallbackProbe`] stores its arena. The nine small fields
/// travel together in one `u32` — see [`pack_small_fields`], and note before
/// adding a field that that word is full.
pub struct BeatQueue {
    session: Box<[AtomicU64]>,
    ts_ns: Box<[AtomicU64]>,
    delay_us: Box<[AtomicU64]>,
    /// `expected_interval_ms` as `f64::to_bits`. Stored as bits for the same
    /// reason `TakeRing` stores samples as bits: an `AtomicF64` does not
    /// exist, and the alternative is `unsafe`.
    interval_bits: Box<[AtomicU64]>,
    beat: Box<[AtomicU32]>,
    measure_beat: Box<[AtomicU32]>,
    subdivision: Box<[AtomicU32]>,
    jam_bar: Box<[AtomicU32]>,
    jam_chorus: Box<[AtomicU32]>,
    /// WHERE IN THE SONG. Three words of their own and not three more bits of
    /// `small`, because `small` is FULL: nine fields, 24 + 2 + 6, exactly 32.
    /// The next worker who needs a flag has to add a word here too, or repack
    /// [`pack_small_fields`] and `unpack_small_fields` together.
    song_bar: Box<[AtomicU32]>,
    song_tick: Box<[AtomicU32]>,
    song_pass: Box<[AtomicU32]>,
    small: Box<[AtomicU32]>,
    /// `slots - 1`; the capacity is a power of two so the wrap is a mask.
    mask: usize,
    /// Monotonic counts, not indices — a `u64` of 30-a-second ticks outlasts
    /// the solar system, so the wrapping arithmetic is a formality.
    write: AtomicU64,
    read: AtomicU64,
    /// Beats the callback had to throw away. Shared with the engine so it
    /// survives the audio thread that recorded it: a device change spawns a
    /// new thread and a new queue, and a diagnostic that reset itself there
    /// would be a diagnostic nobody could trust.
    dropped: Arc<AtomicU64>,
}

/// The nine small fields of a [`BeatNotification`], in one word.
///
/// Three `u8`s, a three-valued enum and six flags: 24 + 2 + 6 = exactly 32
/// bits, which is why this is one array rather than nine.
/// `the_small_fields_survive_the_round_trip` is the test that says the layout
/// and [`unpack_small_fields`] still agree.
///
/// **THE WORD IS FULL.** Exactly 32 bits are spoken for, so the song's
/// position travels in three `u32` arrays of its own rather than in here (see
/// `BeatQueue::song_bar`). A worker who needs one more flag has the same two
/// choices that pass had: another array, or narrowing one of the three `u8`s
/// — `subdivision_total` is 1..=6 and `accent` is 0..=2, so there are bits to
/// be had, at the cost of a packing nobody can read at a glance.
#[inline]
fn pack_small_fields(n: &BeatNotification) -> u32 {
    let state: u32 = match n.jam_band_state {
        JamBandState::Full => 0,
        JamBandState::HatsOnly => 1,
        JamBandState::Silent => 2,
    };
    n.subdivision_total as u32
        | (n.accent as u32) << 8
        | (n.beats_per_bar as u32) << 16
        | state << 24
        | (n.is_downbeat as u32) << 26
        | (n.is_warmup_beat as u32) << 27
        | (n.is_warmup_transition as u32) << 28
        | (n.bar_just_completed as u32) << 29
        | (n.jam_bar_mismatch as u32) << 30
        | (n.jam_form_ended as u32) << 31
}

/// The inverse of [`pack_small_fields`], on the event thread.
#[inline]
fn unpack_small_fields(w: u32) -> (u8, u8, u8, JamBandState, [bool; 6]) {
    let state = match (w >> 24) & 0b11 {
        0 => JamBandState::Full,
        1 => JamBandState::HatsOnly,
        // Only 0, 1 and 2 are ever written; a third value would be a bug in
        // `pack_small_fields`, and silence is the safest thing to guess.
        _ => JamBandState::Silent,
    };
    (
        (w & 0xFF) as u8,
        ((w >> 8) & 0xFF) as u8,
        ((w >> 16) & 0xFF) as u8,
        state,
        [
            w & (1 << 26) != 0,
            w & (1 << 27) != 0,
            w & (1 << 28) != 0,
            w & (1 << 29) != 0,
            w & (1 << 30) != 0,
            w & (1 << 31) != 0,
        ],
    )
}

impl BeatQueue {
    /// Allocate `slots` (rounded up to a power of two) worth of room, and
    /// share `dropped` with whoever reports it. Call it on the thread that
    /// sets the audio thread up — never from a callback.
    fn new(slots: usize, dropped: Arc<AtomicU64>) -> Self {
        let cap = slots.max(2).next_power_of_two();
        let u64s = || {
            (0..cap)
                .map(|_| AtomicU64::new(0))
                .collect::<Vec<_>>()
                .into_boxed_slice()
        };
        let u32s = || {
            (0..cap)
                .map(|_| AtomicU32::new(0))
                .collect::<Vec<_>>()
                .into_boxed_slice()
        };
        Self {
            session: u64s(),
            ts_ns: u64s(),
            delay_us: u64s(),
            interval_bits: u64s(),
            beat: u32s(),
            measure_beat: u32s(),
            subdivision: u32s(),
            jam_bar: u32s(),
            jam_chorus: u32s(),
            song_bar: u32s(),
            song_tick: u32s(),
            song_pass: u32s(),
            small: u32s(),
            mask: cap - 1,
            write: AtomicU64::new(0),
            read: AtomicU64::new(0),
            dropped,
        }
    }

    fn capacity(&self) -> usize {
        self.session.len()
    }

    /// PRODUCER (the cpal output callback): queue one tick.
    ///
    /// Returns false when the queue is full, having counted the loss — the
    /// only outcome available to a thread that may not wait. See
    /// [`BEAT_QUEUE_SLOTS`] for why that cannot happen at any tempo the app
    /// can be set to.
    ///
    /// Allocates nothing, locks nothing and branches on nothing but the
    /// queue's own fill.
    #[inline]
    fn push(&self, n: &BeatNotification) -> bool {
        let w = self.write.load(Ordering::Relaxed);
        let r = self.read.load(Ordering::Acquire);
        if w.wrapping_sub(r) >= self.capacity() as u64 {
            self.dropped.fetch_add(1, Ordering::Relaxed);
            return false;
        }
        let i = (w as usize) & self.mask;
        self.session[i].store(n.session, Ordering::Relaxed);
        self.ts_ns[i].store(n.ts_ns, Ordering::Relaxed);
        self.delay_us[i].store(n.delay_us, Ordering::Relaxed);
        self.interval_bits[i].store(n.expected_interval_ms.to_bits(), Ordering::Relaxed);
        self.beat[i].store(n.beat, Ordering::Relaxed);
        self.measure_beat[i].store(n.measure_beat, Ordering::Relaxed);
        self.subdivision[i].store(n.subdivision, Ordering::Relaxed);
        self.jam_bar[i].store(n.jam_bar, Ordering::Relaxed);
        self.jam_chorus[i].store(n.jam_chorus, Ordering::Relaxed);
        self.song_bar[i].store(n.song_bar, Ordering::Relaxed);
        self.song_tick[i].store(n.song_tick, Ordering::Relaxed);
        self.song_pass[i].store(n.song_pass, Ordering::Relaxed);
        self.small[i].store(pack_small_fields(n), Ordering::Relaxed);
        // The release is what publishes the thirteen stores above to the
        // reader's acquire. One per tick, not one per field.
        self.write.store(w.wrapping_add(1), Ordering::Release);
        true
    }

    /// CONSUMER (the engine's event loop): the oldest tick, or `None` when
    /// the callback has not produced one since the last call.
    fn pop(&self) -> Option<BeatNotification> {
        let r = self.read.load(Ordering::Relaxed);
        let w = self.write.load(Ordering::Acquire);
        if r == w {
            return None;
        }
        let i = (r as usize) & self.mask;
        let (subdivision_total, accent, beats_per_bar, jam_band_state, flags) =
            unpack_small_fields(self.small[i].load(Ordering::Relaxed));
        let n = BeatNotification {
            session: self.session[i].load(Ordering::Relaxed),
            beat: self.beat[i].load(Ordering::Relaxed),
            measure_beat: self.measure_beat[i].load(Ordering::Relaxed),
            subdivision: self.subdivision[i].load(Ordering::Relaxed),
            subdivision_total,
            is_downbeat: flags[0],
            accent,
            beats_per_bar,
            ts_ns: self.ts_ns[i].load(Ordering::Relaxed),
            expected_interval_ms: f64::from_bits(self.interval_bits[i].load(Ordering::Relaxed)),
            is_warmup_beat: flags[1],
            is_warmup_transition: flags[2],
            bar_just_completed: flags[3],
            delay_us: self.delay_us[i].load(Ordering::Relaxed),
            jam_bar: self.jam_bar[i].load(Ordering::Relaxed),
            jam_chorus: self.jam_chorus[i].load(Ordering::Relaxed),
            jam_band_state,
            jam_bar_mismatch: flags[4],
            song_bar: self.song_bar[i].load(Ordering::Relaxed),
            song_tick: self.song_tick[i].load(Ordering::Relaxed),
            song_pass: self.song_pass[i].load(Ordering::Relaxed),
            jam_form_ended: flags[5],
        };
        // Released only after the slot has been read out, so the producer
        // cannot overwrite it underneath this.
        self.read.store(r.wrapping_add(1), Ordering::Release);
        Some(n)
    }

    /// CONSUMER: throw away everything waiting.
    ///
    /// The event loop does this while the transport is stopped — ticks that
    /// arrived before a Stop are not news — and it is the one thing the old
    /// `while rx.try_recv().is_ok() {}` did that has to be kept.
    fn drain(&self) {
        let w = self.write.load(Ordering::Acquire);
        self.read.store(w, Ordering::Release);
    }
}

// ---------------------------------------------------------------------------
// Speed ramp logic
// ---------------------------------------------------------------------------

/// Payload emitted after adaptive mode has ALREADY moved the tempo.
///
/// T07 — the engine decides, the model only narrates. `decision` and
/// `new_bpm` describe the move the engine just made; the frontend
/// comments on it and must never change it.
///
/// `current_bpm` is the tempo the evaluated round was played at (i.e.
/// *before* this step); `new_bpm` is the tempo the drill continues at.
#[derive(Debug, Clone, serde::Serialize)]
pub struct AdaptiveEvalRequest {
    #[serde(rename = "currentBpm")]
    pub current_bpm: u16,
    #[serde(rename = "newBpm")]
    pub new_bpm: u16,
    #[serde(rename = "startBpm")]
    pub start_bpm: u16,
    #[serde(rename = "targetBpm")]
    pub target_bpm: u16,
    #[serde(rename = "accuracyPct")]
    pub accuracy_pct: u32,
    pub aggressiveness: String,
    #[serde(rename = "currentStep")]
    pub current_step: u16,
    /// "up" | "hold" | "down" — the move the engine already applied.
    pub decision: String,
}

/// Direction the adaptive drill takes for `score`, given the
/// thresholds from [`adaptive_thresholds`]. Pure so the boundary
/// behaviour is unit-testable: `>= up` goes up, `<= down` goes down,
/// everything between holds.
fn adaptive_direction(score: u32, up_thresh: u32, down_thresh: u32) -> &'static str {
    if score >= up_thresh {
        "up"
    } else if score <= down_thresh {
        "down"
    } else {
        "hold"
    }
}

/// Returns (up_threshold, down_threshold, step_up_bpm, step_down_bpm) for adaptive mode.
fn adaptive_thresholds(
    aggressiveness: &str,
    increment: u16,
    decrement: u16,
) -> (u32, u32, u16, u16) {
    match aggressiveness {
        "conservative" => (80, 40, increment.max(2).min(3), decrement.max(2).min(3)),
        "aggressive" => (60, 25, increment.max(5).min(10), decrement.max(3).min(5)),
        _ /* moderate */ => (70, 35, increment.max(3).min(5), decrement.max(2).min(4)),
    }
}

/// Advance the speed ramp by one step. Returns (new_bpm, new_direction, is_done).
///
/// A target BELOW the start is a descending drill, and is exactly as valid as
/// an ascending one: "play it at 120 and work down to 80 until it is clean" is
/// a real exercise, and the app used to refuse to express it — the target was
/// clamped to a floor of the start tempo, so it could not be set.
///
/// So this function stopped thinking in "up" and "down" and started thinking
/// in OUT (toward the target) and BACK (toward the start). The `direction`
/// string is still literally "up" or "down" — it is persisted and it crosses
/// to the frontend — but which of the two means "keep going" is now read off
/// the plan instead of assumed. For an ascending drill every branch below
/// resolves to exactly what it did before.
fn advance_ramp(
    current_bpm: u16,
    direction: &str,
    start_bpm: u16,
    target_bpm: u16,
    increment: u16,
    decrement: u16,
    mode: &str,
    cyclic: bool,
) -> (u16, String, bool) {
    let descending = target_bpm < start_bpm;
    let out = if descending { "down" } else { "up" };
    let back = if descending { "up" } else { "down" };

    // One step toward the target, never past it and never outside the
    // engine's range.
    let toward_target = |bpm: u16, by: u16| -> u16 {
        if descending {
            bpm.saturating_sub(by).max(target_bpm).max(20)
        } else {
            bpm.saturating_add(by).min(target_bpm).min(300)
        }
    };
    // One step back toward the start, never past it.
    let toward_start = |bpm: u16, by: u16| -> u16 {
        if descending {
            bpm.saturating_add(by).min(start_bpm).min(300)
        } else {
            bpm.saturating_sub(by).max(start_bpm).max(20)
        }
    };
    let at_target = |bpm: u16| {
        if descending {
            bpm <= target_bpm
        } else {
            bpm >= target_bpm
        }
    };
    let at_start = |bpm: u16| {
        if descending {
            bpm >= start_bpm
        } else {
            bpm <= start_bpm
        }
    };

    match mode {
        "zigzag" => {
            if direction == out {
                let new_bpm = toward_target(current_bpm, increment);
                if at_target(new_bpm) {
                    (target_bpm, out.to_string(), true)
                } else {
                    (new_bpm, back.to_string(), false)
                }
            } else {
                let new_bpm = toward_start(current_bpm, decrement);
                (new_bpm, out.to_string(), false)
            }
        }
        _ => {
            if direction == out {
                let new_bpm = toward_target(current_bpm, increment);
                if at_target(new_bpm) {
                    if cyclic {
                        (target_bpm, back.to_string(), false)
                    } else {
                        (target_bpm, out.to_string(), true)
                    }
                } else {
                    (new_bpm, out.to_string(), false)
                }
            } else if !cyclic {
                // Travelling BACK on a drill that was never asked to come
                // back. The owner hit this: "Up and down" was off and the
                // ramp turned round at the target anyway.
                //
                // This branch used to descend without ever consulting
                // `cyclic` — the flag was read only where the ramp DECIDES to
                // turn round, so anything else that set the direction to back
                // (a jump into the last step via `start_speed_ramp_from`, or a
                // direction left over in a persisted ramp) sent a one-way
                // drill down and then up again, forever.
                //
                // A one-way drill has nowhere to go from the target. Finish.
                (target_bpm, out.to_string(), true)
            } else {
                let new_bpm = toward_start(current_bpm, increment);
                if at_start(new_bpm) {
                    (start_bpm, out.to_string(), false)
                } else {
                    (new_bpm, back.to_string(), false)
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// BeatEvent — emitted to the frontend
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
pub struct BeatEvent {
    pub beat: u32,
    #[serde(rename = "measureBeat")]
    pub measure_beat: u32,
    pub subdivision: u32,
    #[serde(rename = "isDownbeat")]
    pub is_downbeat: bool,
    /// How hard the engine accented this tick: 0 not at all, 1 a group start
    /// inside the bar (the middle of a 6/8), 2 the bar's own opening. The UI
    /// reads this instead of re-deriving group starts from `beatGroups`.
    #[serde(rename = "accentLevel")]
    pub accent: u8,
    /// `accentLevel > 0`, on the wire because it used to be the only thing
    /// on the wire. Kept for one release so that nothing reading the old
    /// field — a hot-reloaded frontend against a newer binary, a consumer
    /// nobody has grepped — silently loses its accents; `src/types.ts`
    /// deprecates it in the same words. The engine is the only writer, so
    /// the two can never disagree.
    #[serde(rename = "isAccent")]
    pub is_accent: bool,
    /// Where this tick sits in a jam's form (`plans/JAM_MODE.md`).
    /// `formBar` is the 0-based bar within the chorus, `chorus` is 1-based.
    /// 0 and 1 when no jam is loaded. See `BeatEvent` in `src/types.ts`.
    #[serde(rename = "formBar")]
    pub form_bar: u32,
    pub chorus: u32,
    /// What the band is doing on this bar: "full", "hatsOnly" (a trade —
    /// your bars) or "silent" (a drop-out). "full" when no jam is loaded.
    /// The engine decides it, not the UI: it lands on the bar line here and
    /// nowhere else. See `src/jam/practice.ts` for the same rule drawn.
    #[serde(rename = "bandState")]
    pub band_state: JamBandState,
    /// WHERE IN THE SONG, when one is playing: the played bar (an index into
    /// the transport's `bars`, so it is the piece's bar and not the range's),
    /// the tick inside it at 960 to the quarter, and which time round the
    /// range this is, from 0.
    ///
    /// `songBar` is `null` when no song is playing and through a song's
    /// count-in — which is not a bar of the piece, and a cursor that sat on
    /// bar one for four beats before the music started would be a cursor
    /// lying about where the player is.
    #[serde(rename = "songBar")]
    pub song_bar: Option<u32>,
    #[serde(rename = "songTick")]
    pub song_tick: u32,
    #[serde(rename = "songPass")]
    pub song_pass: u32,
    /// This tick is a song's count-in: the click is running, the piece has
    /// not started, and `songBar` is `null` for that reason rather than
    /// because no song is loaded.
    #[serde(rename = "songCountIn")]
    pub song_count_in: bool,
}

// ---------------------------------------------------------------------------
// Audio output device listing
// ---------------------------------------------------------------------------

/// Bluetooth device name patterns (case-insensitive matching).
const BLUETOOTH_PATTERNS: &[&str] = &[
    "airpods",
    "bluetooth",
    "beats",
    "bose",
    "jabra",
    "jbl",
    "sony wh-",
    "sony wf-",
    "sennheiser momentum",
    "galaxy buds",
    "pixel buds",
    "powerbeats",
    "marshall",
    "skullcandy",
    "anker",
    "soundcore",
    "marshall major",
    "marshall minor",
    "tozo",
    "nothing ear",
];

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AudioOutputDevice {
    pub name: String,
    #[serde(rename = "isDefault")]
    pub is_default: bool,
    #[serde(rename = "isBluetooth")]
    pub is_bluetooth: bool,
    /// How many outputs this device has, at its widest.
    ///
    /// The MAX across every supported config, not the default one, for the
    /// reason `audio_input.rs::list_devices` gives on the way in: an
    /// interface's extra outputs are routinely absent from the default
    /// config and present in the supported list, and a screen that asks the
    /// default config would offer a four-output interface two outputs.
    pub channels: u16,
}

/// How many outputs a pair needs from the stream. Pairs are 0-based, so
/// pair 0 ("Outputs 1-2") needs two and pair 1 ("Outputs 3-4") needs four.
#[inline]
pub(crate) fn outputs_needed(pair: u16) -> u16 {
    pair.saturating_mul(2).saturating_add(2)
}

/// Does `pair` fit a buffer this wide?
///
/// Asked once per buffer rather than trusted from setup, because a device
/// that CLAIMS four outputs and delivers two is a real device — see the
/// two-attempt clamp in `audio_input.rs::start_playback`, which is the same
/// trap on the way in. Writing past the end of a frame would be a panic on
/// the audio thread.
#[inline]
pub(crate) fn pair_fits(pair: u16, channels: usize) -> bool {
    channels >= outputs_needed(pair) as usize
}

/// The pair actually written to: the one the musician chose when it fits,
/// and the first pair when it does not. Two ALU ops, on the audio thread.
///
/// A mono device is not this function's business — folding the two sides
/// into one output is a decision about the mix, and the callers make it
/// before they get here.
#[inline]
pub(crate) fn effective_pair(pair: u16, channels: usize) -> u16 {
    if pair_fits(pair, channels) {
        pair
    } else {
        0
    }
}

/// The narrowest stream at `sr` that can carry `pair`, or `None` when
/// nothing the device offers is wide enough.
///
/// `candidates` is `(channels, min_sample_rate, max_sample_rate)` — what
/// `supported_output_configs()` yields once the ranges are unwrapped. The
/// shape mirrors the input side's widening, down to preferring the FEWEST
/// channels that satisfy the request: opening eight outputs to use two of
/// them asks the interface for work nobody wants done.
///
/// Same rate as the default config, always. A device will happily offer a
/// wider config at a rate it is not running at, and taking it would mean
/// every sound in the bank decoded for the wrong clock.
pub(crate) fn channels_for_pair(
    pair: u16,
    default_channels: u16,
    sr: u32,
    candidates: impl Iterator<Item = (u16, u32, u32)>,
) -> Option<u16> {
    let needed = outputs_needed(pair);
    if needed <= default_channels {
        return Some(default_channels);
    }
    candidates
        .filter(|&(ch, min, max)| ch >= needed && min <= sr && max >= sr)
        .map(|(ch, _, _)| ch)
        .min()
}

/// Write one frame to the chosen pair, and silence everywhere else.
///
/// The musician picked a pair of outputs and that is where the app plays.
/// A church drummer running v-drums into 1-2 and the click into 3-4 needs
/// the other outputs left ALONE, so this zeroes the frame first rather than
/// broadcasting the way the old `ch % 2` write did.
///
/// `l` and `r` arrive clamped. `pair` has already been through
/// [`effective_pair`], so the two writes are in range; the slice is taken
/// once, which is one bounds check for the whole frame instead of one per
/// channel.
#[inline]
pub(crate) fn write_pair(
    data: &mut [f32],
    base: usize,
    channels: usize,
    pair: usize,
    l: f32,
    r: f32,
) {
    debug_assert!(channels >= 2 * pair + 2, "the pair does not fit the frame");
    let frame = &mut data[base..base + channels];
    for s in frame.iter_mut() {
        *s = 0.0;
    }
    frame[2 * pair] = l;
    frame[2 * pair + 1] = r;
}

/// How long anything waits for the output device to open. Enumerating
/// devices, decoding the sound bank and opening the stream is the slow part
/// of the first Play, and it is the same slow part on the first coach line.
const SPEECH_STREAM_WAIT: Duration = AUDIO_SETUP_TIMEOUT;

/// Everything the coach's voice needs from the engine, in a handle that can
/// be polled with the engine mutex released. See
/// [`MetronomeEngine::speech_slots`].
#[derive(Clone)]
pub struct SpeechSlots {
    alive: Arc<AtomicBool>,
    sample_rate: Arc<AtomicU32>,
    stream_channels: Arc<AtomicU32>,
    handoff: SharedSpeech,
}

impl SpeechSlots {
    /// The open stream, or `None`.
    ///
    /// Three conditions, and all three earn their place. `alive` is per
    /// spawn, so a thread that failed or exited answers `None` even though
    /// the rate it published is still sitting there — the bug this rule
    /// exists for is a device that opened once and then went away
    /// (unplugged, or held exclusively by another app on WASAPI), where a
    /// rate-only check handed the coach a slot nothing was reading and the
    /// blocking thread waited for a completion that could never arrive,
    /// with the metronome left dimmed behind it. `stream_channels` is
    /// published only after the stream is up and cleared before every
    /// spawn, so a thread that is still opening answers `None` rather than
    /// the LAST stream's rate. And the rate itself is what the line is
    /// resampled to.
    pub fn out(&self) -> Option<SpeechOut> {
        if !self.alive.load(Ordering::SeqCst) {
            return None;
        }
        if self.stream_channels.load(Ordering::Acquire) == 0 {
            return None;
        }
        match self.sample_rate.load(Ordering::Acquire) {
            0 => None,
            sr => Some(SpeechOut {
                handoff: self.handoff.clone(),
                sample_rate: sr,
            }),
        }
    }

    /// Wait for the stream to come up, up to [`SPEECH_STREAM_WAIT`].
    ///
    /// `None` means the device would not open — the audio thread has
    /// already said so through `audio-error`, and the caller's job is to
    /// let the speech fail cleanly rather than wait on it forever. Call
    /// this with the engine mutex RELEASED; polling every 10 ms rather than
    /// rendezvousing on the setup channel because that channel answers the
    /// spawn, and this may be looking at a thread somebody else started.
    pub fn wait_for_stream(&self) -> Option<SpeechOut> {
        let deadline = std::time::Instant::now() + SPEECH_STREAM_WAIT;
        loop {
            if let Some(out) = self.out() {
                return Some(out);
            }
            // A thread that is not even alive is not on its way up: either
            // it never spawned or it has already failed. Nothing to wait for.
            if !self.alive.load(Ordering::SeqCst) {
                return None;
            }
            if std::time::Instant::now() >= deadline {
                return None;
            }
            thread::sleep(Duration::from_millis(10));
        }
    }
}

/// What `set_output_pair` has to do to give the musician the pair they
/// asked for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PairAction {
    /// Store the pair and get on with it. Either nothing is running (the
    /// next stream to open will read it), or the open stream is already
    /// wide enough — which is the case that matters, because it means the
    /// click moves without stopping.
    StoreOnly,
    /// Reopen the device. The channel count is fixed when a stream is
    /// built, so a stream too narrow for the pair cannot be widened.
    Restart,
}

/// The decision, from the two things the engine knows about its audio
/// thread: whether one is running, and how wide the stream it opened is
/// (0 until the stream is actually up).
///
/// The middle case is the one that bit: a thread that is ALIVE but has not
/// published a width yet is still opening, and it read the pair on its way
/// up — before the musician changed it. Storing the new pair and returning
/// would leave the picker saying 3-4 over a stream that opened at its
/// default width with nothing to correct it, because no fallback fires when
/// nothing was asked for. Press Play and pick Outputs 3-4 half a second
/// later and that is exactly the race. It restarts instead.
pub(crate) fn pair_action(alive: bool, stream_channels: usize, pair: u16) -> PairAction {
    if !alive {
        return PairAction::StoreOnly;
    }
    if stream_channels == 0 {
        return PairAction::Restart;
    }
    if pair_fits(pair, stream_channels) {
        return PairAction::StoreOnly;
    }
    PairAction::Restart
}

/// Which channel of an interleaved buffer a take reads back.
///
/// The pair's LEFT, because that is where the click and the band were just
/// written — on outputs 3-4, channel 0 holds the silence this callback put
/// there, and a take of channel 0 would be twenty minutes of nothing. A
/// mono device has one channel and it is the only answer.
#[inline]
pub(crate) fn take_offset(channels: usize, pair: usize) -> usize {
    if channels == 1 {
        0
    } else {
        2 * pair
    }
}

/// The rate a stream on this device WOULD open at, asked of the device
/// without opening one — the same lookup and the same `default_output_config`
/// the audio thread's setup uses, minus the logging.
///
/// Why it exists: a jam loaded before Play used to be built at
/// [`JAM_REFERENCE_SR`] because no stream had told anyone its rate yet, and
/// then built AGAIN at the real rate on the first Play — every kit and voice
/// decoded twice, on a machine at 44 100. Asking the device first makes the
/// first build the one that plays.
///
/// A device query, so never under the engine's lock and never on the main
/// thread. `None` when there is no device or it will not say.
pub fn probe_output_rate(device_name: Option<&str>) -> Option<u32> {
    let host = cpal::default_host();
    let device = match device_name {
        Some(name) => host
            .output_devices()
            .ok()
            .and_then(|mut devs| devs.find(|d| d.name().ok().as_deref() == Some(name)))
            .or_else(|| host.default_output_device()),
        None => host.default_output_device(),
    }?;
    device.default_output_config().ok().map(|c| c.sample_rate().0)
}

/// List all available audio output devices.
pub fn list_output_devices() -> Vec<AudioOutputDevice> {
    let host = cpal::default_host();
    let default_name = host
        .default_output_device()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();

    let mut devices = Vec::new();
    if let Ok(output_devices) = host.output_devices() {
        for device in output_devices {
            if let Ok(name) = device.name() {
                let lower = name.to_lowercase();
                let is_bluetooth = BLUETOOTH_PATTERNS.iter().any(|p| lower.contains(p))
                    || is_bluetooth_transport(&name);
                // Max across the supported configs, falling back to the
                // default one — see the field's own note, and the identical
                // walk in `audio_input.rs::list_devices`.
                let channels = device
                    .supported_output_configs()
                    .ok()
                    .and_then(|cfgs| cfgs.map(|c| c.channels()).max())
                    .unwrap_or_else(|| {
                        device
                            .default_output_config()
                            .map(|c| c.channels())
                            .unwrap_or(0)
                    });
                devices.push(AudioOutputDevice {
                    is_default: name == default_name,
                    is_bluetooth,
                    channels,
                    name,
                });
            }
        }
    }
    devices
}

/// Get the number of audio output devices cheaply via CoreAudio (no cpal, no stream interference).
#[cfg(target_os = "macos")]
fn poll_device_count() -> usize {
    use coreaudio_sys::*;
    use std::mem;
    unsafe {
        let prop = AudioObjectPropertyAddress {
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain,
        };
        let mut size: u32 = 0;
        let status = AudioObjectGetPropertyDataSize(
            kAudioObjectSystemObject,
            &prop,
            0,
            std::ptr::null(),
            &mut size,
        );
        if status != 0 {
            return 0;
        }
        (size as usize) / mem::size_of::<AudioDeviceID>()
    }
}

#[cfg(not(target_os = "macos"))]
fn poll_device_count() -> usize {
    let host = cpal::default_host();
    host.output_devices().map(|d| d.count()).unwrap_or(0)
}

/// Start a background thread that polls for audio device changes
/// and emits "audio-devices-changed" / "audio-input-devices-changed" when the list changes.
/// Uses a lightweight name-only check; only does the full enumeration
/// (with BT detection) when the device list actually changes.
pub fn start_audio_device_polling(app_handle: AppHandle) {
    thread::spawn(move || {
        let mut last_count = poll_device_count();
        loop {
            thread::sleep(Duration::from_secs(5));
            let current_count = poll_device_count();
            if current_count != last_count {
                // Device count changed — do the full enumeration with BT detection
                // (only hits cpal when devices actually change, not every poll)
                let devices = list_output_devices();
                let _ = app_handle.emit("audio-devices-changed", &devices);
                let input_devices = crate::audio_input::AudioInput::list_devices();
                let _ = app_handle.emit("audio-input-devices-changed", &input_devices);
                last_count = current_count;
            }
        }
    });
}

/// Check if a device uses Bluetooth transport via CoreAudio properties.
#[cfg(target_os = "macos")]
fn is_bluetooth_transport(device_name: &str) -> bool {
    use coreaudio_sys::*;
    use std::mem;
    use std::ptr;

    unsafe {
        // Find the device by name and check its transport type
        let prop = AudioObjectPropertyAddress {
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain,
        };
        let mut size: u32 = 0;
        let status = AudioObjectGetPropertyDataSize(
            kAudioObjectSystemObject,
            &prop,
            0,
            ptr::null(),
            &mut size,
        );
        if status != 0 {
            return false;
        }

        let count = size as usize / mem::size_of::<AudioDeviceID>();
        let mut device_ids = vec![0 as AudioDeviceID; count];
        let status = AudioObjectGetPropertyData(
            kAudioObjectSystemObject,
            &prop,
            0,
            ptr::null(),
            &mut size,
            device_ids.as_mut_ptr() as *mut _,
        );
        if status != 0 {
            return false;
        }

        for &did in &device_ids {
            // Get device name
            let name_prop = AudioObjectPropertyAddress {
                mSelector: kAudioObjectPropertyName,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain,
            };
            let mut cf_name: core_foundation_sys::string::CFStringRef = ptr::null();
            let mut name_size = mem::size_of::<core_foundation_sys::string::CFStringRef>() as u32;
            let status = AudioObjectGetPropertyData(
                did,
                &name_prop,
                0,
                ptr::null(),
                &mut name_size,
                &mut cf_name as *mut _ as *mut _,
            );
            if status != 0 || cf_name.is_null() {
                continue;
            }

            // Convert CFString to Rust string
            let len = core_foundation_sys::string::CFStringGetLength(cf_name);
            let mut buf = vec![0u8; (len * 4) as usize + 1];
            let ok = core_foundation_sys::string::CFStringGetCString(
                cf_name,
                buf.as_mut_ptr() as *mut _,
                buf.len() as isize,
                core_foundation_sys::string::kCFStringEncodingUTF8,
            );
            core_foundation_sys::base::CFRelease(cf_name as *const _);
            if ok == 0 {
                continue;
            }
            let rust_name = std::ffi::CStr::from_ptr(buf.as_ptr() as *const _)
                .to_string_lossy()
                .to_string();

            if rust_name != device_name {
                continue;
            }

            // Check transport type
            let transport_prop = AudioObjectPropertyAddress {
                mSelector: kAudioDevicePropertyTransportType,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain,
            };
            let mut transport: u32 = 0;
            let mut t_size = mem::size_of::<u32>() as u32;
            let status = AudioObjectGetPropertyData(
                did,
                &transport_prop,
                0,
                ptr::null(),
                &mut t_size,
                &mut transport as *mut _ as *mut _,
            );
            if status == 0 && transport == kAudioDeviceTransportTypeBluetooth {
                return true;
            }
            // Also check for BluetoothLE
            if status == 0 && transport == kAudioDeviceTransportTypeBluetoothLE {
                return true;
            }
            break;
        }
    }
    false
}

#[cfg(not(target_os = "macos"))]
fn is_bluetooth_transport(_device_name: &str) -> bool {
    false
}

// ---------------------------------------------------------------------------
// Callback timing probe (ROADMAP §4 audio-safety gate)
// ---------------------------------------------------------------------------

/// One cpal output callback, as observed from inside it.
#[derive(Debug, Clone, Copy)]
pub struct CallbackSample {
    /// `clock::now_ns()` read at the very top of the callback.
    pub entry_ns: u64,
    /// Frames this callback was asked to fill.
    pub frames: u32,
    /// Engine sample counter at callback entry — i.e. audio-clock time.
    /// Only advances by frames the device actually consumed, so comparing
    /// it against `entry_ns` exposes buffers that never made it out.
    pub sample_pos: u64,
    /// Metronome ticks (beats *and* subdivisions) rendered in this buffer.
    pub ticks: u32,
}

/// Preallocated, lock-free sink for cpal callback timings.
///
/// Exists so `click-jitter-probe` can measure the real output callback
/// without changing how it behaves. Constraints, in priority order:
///
/// * **The callback must not allocate, lock or block.** Every slot is
///   allocated up front by the probe; writing one is a single `fetch_add`
///   plus three relaxed stores. There is exactly one writer (the audio
///   thread) and readers only run after the stream is torn down.
/// * **The app must not pay for it.** `MetronomeEngine::new` leaves
///   `callback_probe` as `None`, so a shipping build costs one null check
///   per buffer and nothing per beat.
/// * **Overflow must be visible, not silent.** Pushes past `capacity` are
///   dropped, but `written` keeps counting so `overflow()` can report them
///   and the probe can refuse to publish truncated statistics.
pub struct CallbackProbe {
    entry_ns: Box<[AtomicU64]>,
    frames: Box<[AtomicU32]>,
    sample_pos: Box<[AtomicU64]>,
    ticks: Box<[AtomicU32]>,
    /// Total pushes attempted, including any beyond `capacity`.
    written: AtomicUsize,
    /// Output sample rate, published by the engine thread before the stream
    /// is built. 0 until then.
    sample_rate: AtomicU32,
}

impl CallbackProbe {
    /// Allocate room for `capacity` callbacks. The probe sizes this from
    /// the run length and a pessimistic callback rate; see the binary.
    pub fn new(capacity: usize) -> Self {
        let alloc_u64 = || {
            (0..capacity)
                .map(|_| AtomicU64::new(0))
                .collect::<Vec<_>>()
                .into_boxed_slice()
        };
        let alloc_u32 = || {
            (0..capacity)
                .map(|_| AtomicU32::new(0))
                .collect::<Vec<_>>()
                .into_boxed_slice()
        };
        Self {
            entry_ns: alloc_u64(),
            frames: alloc_u32(),
            sample_pos: alloc_u64(),
            ticks: alloc_u32(),
            written: AtomicUsize::new(0),
            sample_rate: AtomicU32::new(0),
        }
    }

    pub fn capacity(&self) -> usize {
        self.entry_ns.len()
    }

    /// Output sample rate the engine opened the device at, or 0 if the
    /// stream never started.
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate.load(Ordering::Acquire)
    }

    /// Callbacks dropped because the preallocated arena filled up.
    pub fn overflow(&self) -> usize {
        self.written
            .load(Ordering::Acquire)
            .saturating_sub(self.capacity())
    }

    /// Read the recorded callbacks. Call only after the stream is stopped —
    /// there is no synchronisation with an in-flight callback beyond the
    /// acquire on `written`.
    pub fn snapshot(&self) -> Vec<CallbackSample> {
        let n = self.written.load(Ordering::Acquire).min(self.capacity());
        (0..n)
            .map(|i| CallbackSample {
                entry_ns: self.entry_ns[i].load(Ordering::Relaxed),
                frames: self.frames[i].load(Ordering::Relaxed),
                sample_pos: self.sample_pos[i].load(Ordering::Relaxed),
                ticks: self.ticks[i].load(Ordering::Relaxed),
            })
            .collect()
    }

    fn set_sample_rate(&self, sr: u32) {
        self.sample_rate.store(sr, Ordering::Release);
    }

    /// Audio-thread hot path. Returns the slot index so the tick counter
    /// can be bumped later in the same buffer, or `None` once full.
    #[inline]
    fn record(&self, entry_ns: u64, frames: u32, sample_pos: u64) -> Option<usize> {
        let i = self.written.fetch_add(1, Ordering::Release);
        if i >= self.capacity() {
            return None;
        }
        self.entry_ns[i].store(entry_ns, Ordering::Relaxed);
        self.frames[i].store(frames, Ordering::Relaxed);
        self.sample_pos[i].store(sample_pos, Ordering::Relaxed);
        self.ticks[i].store(0, Ordering::Relaxed);
        Some(i)
    }

    /// Audio-thread hot path — one tick rendered into slot `i`.
    #[inline]
    fn note_tick(&self, i: usize) {
        self.ticks[i].fetch_add(1, Ordering::Relaxed);
    }
}

/// Where the engine's event loop sends UI events.
///
/// The desktop app passes a real `AppHandle`. `click-jitter-probe` runs the
/// same engine with no Tauri application at all, so the handle is optional
/// and every emit becomes a no-op. The method signature mirrors
/// `Emitter::emit` precisely so the ~11 call sites in the event loop are
/// untouched by the probe's existence.
#[derive(Clone)]
struct EventSink(Option<AppHandle>);

impl EventSink {
    fn emit<S: serde::Serialize + Clone>(
        &self,
        event: &str,
        payload: S,
    ) -> Result<(), tauri::Error> {
        match self.0 {
            Some(ref h) => h.emit(event, payload),
            None => Ok(()),
        }
    }
}

// ---------------------------------------------------------------------------
// Audio thread exit — the engine's only way back to a startable state
// ---------------------------------------------------------------------------

/// How long `start_headless` waits for the audio thread to report whether the
/// output stream actually came up.
///
/// Only the headless path waits. `click-jitter-probe` has no UI and must not
/// start measuring against a stream that never opened, so a synchronous
/// answer is worth a bounded stall there. The app does **not** wait: `start`
/// is reached from synchronous Tauri commands, which Tauri v2 runs on the
/// main thread, so any wait at all is a frozen window — and the first Play
/// after launch is exactly when the wait is longest, because the audio thread
/// still has to enumerate devices, decode the sound bank and open the device.
/// The app does not need the answer anyway: `AudioThreadExit::fail` corrects
/// the transport and emits `audio-error` + `state-changed` on its own, and
/// the UI renders playback from that state rather than from this call.
const AUDIO_SETUP_TIMEOUT: Duration = Duration::from_millis(2000);

/// Whether `ensure_thread` waits for the audio thread's setup verdict.
enum SetupWait {
    /// Return as soon as the thread is spawned. The app path — see
    /// `AUDIO_SETUP_TIMEOUT`.
    No,
    /// Block until the stream is up, the device gives up, or the timeout
    /// expires. Only `start_headless`.
    UpTo(Duration),
}

/// Clears the engine's `alive` / `playing` flags however the audio thread
/// leaves — clean shutdown, no output device, a config the backend refuses,
/// a stream that will not build, or a panic on the thread itself.
///
/// `ensure_thread` raises `alive` *before* it spawns, so that two presses of
/// Play cannot race two audio threads onto one device. That makes the thread
/// the only place `alive` can be lowered again, and it used to be lowered on
/// exactly one path: the clean one. Every failure path just `return`ed, so a
/// single `build_output_stream` error left `alive` stuck true — and from then
/// on `ensure_thread` short-circuited, `start` only flipped `playing`, and the
/// metronome could not be started again for the life of the process, on any
/// tab, with the reason visible nowhere but stderr. That is the regression
/// this type exists to make impossible: the flags come down in `Drop`, so no
/// future early return can forget them.
///
/// The flags are each thread's *own*: `ensure_thread` installs a fresh pair of
/// `Arc`s per spawn, so a thread that is still unwinding can never clear the
/// flags of the thread that replaced it.
struct AudioThreadExit {
    alive: Arc<AtomicBool>,
    playing: Arc<AtomicBool>,
    state: SharedState,
    sink: EventSink,
    /// Cleared alongside the transport when setup fails, so the onset
    /// detector stops gating analysis on a click track that is not playing.
    /// `None` for `click-jitter-probe`, which runs no detector.
    tempo: Option<SharedTempoContext>,
    /// Answers the `start` call that spawned this thread. Taken once —
    /// by `ready`, by `fail`, or by `Drop` if the thread died without
    /// saying anything (a panic), so `start` can never hang on it.
    setup: Option<mpsc::SyncSender<Result<(), String>>>,
}

impl AudioThreadExit {
    fn new(
        alive: Arc<AtomicBool>,
        playing: Arc<AtomicBool>,
        state: SharedState,
        sink: EventSink,
        tempo: Option<SharedTempoContext>,
        setup: mpsc::SyncSender<Result<(), String>>,
    ) -> Self {
        Self {
            alive,
            playing,
            state,
            sink,
            tempo,
            setup: Some(setup),
        }
    }

    /// The stream is up and running; `start` may report success.
    fn ready(&mut self) {
        if let Some(tx) = self.setup.take() {
            let _ = tx.send(Ok(()));
        }
    }

    /// Setup failed. Lowers `alive` *before* answering `start`, so the very
    /// next press of Play spawns a fresh thread and re-tries the device
    /// instead of short-circuiting on a flag this dead thread left behind.
    ///
    /// This is also the only correction the app gets: `start` no longer waits
    /// for a verdict, so every caller has already recorded playback by the
    /// time this runs. Whatever the transport must stop claiming has to be
    /// undone here, and this write is always the last one — the command wrote
    /// its optimistic state before the spawn that led here.
    fn fail(&mut self, reason: String) {
        self.alive.store(false, Ordering::SeqCst);
        self.playing.store(false, Ordering::SeqCst);
        eprintln!("[yames] audio output unavailable: {reason}");
        // The transport must stop claiming to play. Without this the button
        // sits on "Stop" over silence and the user's only clue is a line on
        // stderr they will never see.
        let snapshot = {
            // Never panic inside a path that also runs from `Drop`.
            let mut s = self.state.lock().unwrap_or_else(|e| e.into_inner());
            s.is_playing = false;
            // A drill cannot be running either — there is no click to run it
            // against — and `start_speed_ramp` raised this before spawning.
            s.speed_ramp.active = false;
            s.clone()
        };
        // D2 — no click track, so the onset detector must not go on matching
        // incoming audio against a beat grid that is not being played.
        if let Some(ref tempo) = self.tempo {
            tempo.set_playing(false);
        }
        let _ = self.sink.emit("audio-error", reason.clone());
        let _ = self.sink.emit("state-changed", &snapshot);
        if let Some(tx) = self.setup.take() {
            let _ = tx.send(Err(reason));
        }
    }
}

impl Drop for AudioThreadExit {
    fn drop(&mut self) {
        self.alive.store(false, Ordering::SeqCst);
        self.playing.store(false, Ordering::SeqCst);
        // Reached only when the thread neither succeeded nor reported a
        // failure — i.e. it panicked. `start` is still blocked on the
        // channel; unblock it rather than make the UI wait out the timeout.
        if let Some(tx) = self.setup.take() {
            let _ = tx.send(Err("audio thread stopped unexpectedly".to_string()));
        }
    }
}

// ---------------------------------------------------------------------------
// MetronomeEngine — cpal-direct, sample-accurate timing
// ---------------------------------------------------------------------------

pub struct MetronomeEngine {
    alive: Arc<AtomicBool>,
    playing: Arc<AtomicBool>,
    thread_handle: Option<thread::JoinHandle<()>>,
    beat_log: BeatLog,
    device_name: Option<String>,
    /// Which pair of the device's outputs everything the app plays comes
    /// out of. 0-based: 0 is "Outputs 1-2", 1 is "Outputs 3-4".
    ///
    /// An atomic and not a field behind the engine's mutex, because the
    /// callback reads it once per buffer and the click is sacred: one
    /// relaxed load, no lock, nothing to allocate. It lives on the engine
    /// rather than on one stream so it survives a device change, the way
    /// the jam table does.
    output_pair: Arc<AtomicU32>,
    /// How wide the open stream actually is, or 0 before one opens.
    ///
    /// Published by the audio thread, read by `set_output_pair`, which is
    /// the whole reason a pair that fits the stream changes nothing: only
    /// the stream knows how many outputs it really got.
    stream_channels: Arc<AtomicU32>,
    /// Where the coach's voice waits for the callback. See `speech_out`.
    speech: SharedSpeech,
    /// Shared adaptive accuracy score (0-100), updated by timing analyzer callback
    adaptive_score: Arc<AtomicU32>,
    /// Callback timing sink. `None` in the app — only `click-jitter-probe`
    /// ever sets it (`new_with_probe`), so the shipping build's cpal
    /// callback pays a single `Option` check per buffer and nothing else.
    callback_probe: Option<Arc<CallbackProbe>>,
    /// D2 gate for the onset detector. The audio thread clears it when the
    /// output device will not open, because `start` no longer waits long
    /// enough for the command to learn that and clear it itself. `None` for
    /// `click-jitter-probe`, which runs no detector.
    tempo_ctx: Option<SharedTempoContext>,
    /// The band. Lives on the engine rather than in `AppState` because the
    /// UI owns the jam *record* and the engine only ever holds the compiled
    /// table — nothing about a jam belongs in the state blob that crosses to
    /// the frontend on every change.
    jam: SharedJam,
    /// The song, for the same reasons the band is on the engine rather than on
    /// one cpal stream: the UI owns the imported FILE, the engine holds only
    /// the compiled table, and the table has to survive a device change the
    /// way everything else in the audio path does.
    ///
    /// It does not survive it silently. A song's kit and banks are decoded at
    /// the rate the device was running at, so `set_device` takes the song away
    /// exactly as it takes a folder's drums away — see `set_device`.
    song: SharedSong,
    /// Where a take waits to be recorded into or played back. On the engine
    /// for the reason the band is: it belongs to the audio path, survives a
    /// device change, and has no business in the state blob that crosses to
    /// the frontend on every change.
    take: SharedTake,
    /// The rate the audio thread opened its device at, 0 before it has. The
    /// take is written at the output rate and the take commands run on the
    /// command thread, so the number has to be readable from there.
    sample_rate: Arc<AtomicU32>,
    /// How far ahead of the speakers the callback is working, in
    /// microseconds: one buffer plus whatever the device says it holds. 0
    /// before a stream has run.
    ///
    /// The callback has always computed this to timestamp beats. It is
    /// published because the take needs it too: the mic hears the band
    /// through the speakers, so the player's response arrives at the writer
    /// a round trip late, and only the callback knows how long its buffer
    /// is. One relaxed store a buffer, which is one instruction and no lock.
    output_latency_us: Arc<AtomicU64>,
    /// Beats the output callback could not hand to the event loop because
    /// [`BeatQueue`] was full.
    ///
    /// **This number must be zero.** It is not a dropped frame or a missed
    /// repaint: `beat_log` is the only source `TimingAnalyzer` has for where
    /// a beat fell, so every count here is an expected onset the matcher
    /// never gets to pair and a score the player did not earn. It lives on
    /// the engine rather than inside the queue so it survives the audio
    /// thread — a device change builds a new queue, and a counter that reset
    /// there would be a counter nobody could believe.
    dropped_notifications: Arc<AtomicU64>,
    /// Test-only: make the audio thread fail its setup without touching a
    /// real device, so the recovery path above can be exercised on a build
    /// machine that has a perfectly good sound card.
    #[cfg(test)]
    force_setup_failure: bool,
}

impl MetronomeEngine {
    pub fn new(beat_log: BeatLog) -> Self {
        Self {
            alive: Arc::new(AtomicBool::new(false)),
            playing: Arc::new(AtomicBool::new(false)),
            thread_handle: None,
            beat_log,
            device_name: None,
            output_pair: Arc::new(AtomicU32::new(0)),
            stream_channels: Arc::new(AtomicU32::new(0)),
            speech: Arc::new(SpeechHandoff::new()),
            adaptive_score: Arc::new(AtomicU32::new(0)),
            callback_probe: None,
            tempo_ctx: None,
            jam: Arc::new(JamHandoff::new()),
            song: Arc::new(SongHandoff::new()),
            take: Arc::new(crate::take::TakeHandoff::new()),
            sample_rate: Arc::new(AtomicU32::new(0)),
            output_latency_us: Arc::new(AtomicU64::new(0)),
            dropped_notifications: Arc::new(AtomicU64::new(0)),
            #[cfg(test)]
            force_setup_failure: false,
        }
    }

    /// Beats the output callback had to throw away because the event loop
    /// had not drained [`BeatQueue`].
    ///
    /// Cumulative for the life of the engine, across device changes. Any
    /// value but zero is a scoring defect, not a performance note — see the
    /// field. `click-jitter-probe` fails a run on it, and the event loop
    /// says so on the console the moment it moves.
    pub fn dropped_notifications(&self) -> u64 {
        self.dropped_notifications.load(Ordering::Relaxed)
    }

    /// Load a jam, or `None` to take the band away.
    ///
    /// The table lives on the engine rather than on one cpal stream, so it
    /// survives a device change and a restart: switch headphones mid-jam and
    /// the band is still there. `pub` because the click-jitter probe calls
    /// it directly — it runs the engine headless, with no command surface.
    pub fn set_jam_table(&self, table: Option<Arc<JamTable>>) {
        self.jam.set(table);
    }

    /// Move the form: a jump, a loop, or neither. Applied at the next bar
    /// line by the audio thread; nothing happens here but the handover.
    pub fn set_jam_position(&self, position: JamPosition) {
        self.jam.set_position(position);
    }

    /// How many bars a chorus of the loaded jam is, or `None` with no band.
    /// `set_jam_position` checks a jump and a loop against this before it
    /// accepts them, so a bar that does not exist is refused with a message
    /// instead of clamped in silence.
    pub fn jam_form_bars(&self) -> Option<u32> {
        self.jam
            .table
            .lock()
            .ok()
            .and_then(|t| t.as_ref().map(|t| t.form_bars()))
    }

    /// Load a song, or `None` to take it away.
    ///
    /// The table lives on the engine rather than on one cpal stream for the
    /// reason the jam's does. `pub` because the click-jitter probe calls it
    /// directly — it runs the engine headless, with no command surface.
    pub fn set_song_table(&self, table: Option<Arc<crate::song::SongTable>>) {
        self.song.set(table);
    }

    /// Move the song's faders. Applied on the next buffer; nothing is
    /// recompiled and nothing waits for a bar line, because a level is not a
    /// musical event.
    pub fn set_song_mix(&self, mix: crate::song::SongMixGains) {
        self.song.set_mix(mix);
    }

    /// The faders as they stand.
    pub fn song_mix(&self) -> crate::song::SongMixGains {
        self.song.mix()
    }

    /// Is a song loaded? What `set_jam` asks before it takes the other mode
    /// over.
    pub fn song_loaded(&self) -> bool {
        self.song.is_loaded()
    }

    /// The song handoff itself, for the probe's `--song`, which installs a
    /// table into a running stream.
    pub fn song_handoff(&self) -> SharedSong {
        self.song.clone()
    }

    /// The handoff itself, for the click-jitter probe's `--jam-swap`, which
    /// replaces the table from another thread while the stream runs — the
    /// one path a table installed before the stream opens never exercises.
    pub fn jam_handoff(&self) -> SharedJam {
        self.jam.clone()
    }

    /// The take slot: where `start_take` hands the callback a ring to copy
    /// the band into, and `play_take` hands it a take to stream.
    pub fn take_handoff(&self) -> SharedTake {
        self.take.clone()
    }

    /// The rate the audio thread is actually running at, or `None` before it
    /// opens a device.
    ///
    /// A take is written at the output rate, so the command that starts one
    /// has to know it — and it is a property of the device that opened, not
    /// of anything the app chose.
    pub fn output_sample_rate(&self) -> Option<u32> {
        match self.sample_rate.load(Ordering::Acquire) {
            0 => None,
            sr => Some(sr),
        }
    }

    /// The same number, as the slot it lives in, so a thread that outlives
    /// one command can WATCH it.
    ///
    /// The take writer holds this: a take is written at the rate the device
    /// was running at when it started, and if the device changes underneath
    /// it the rest of the file would be at the wrong speed. Watching a slot
    /// is how it notices without asking the engine anything.
    pub fn output_sample_rate_handle(&self) -> Arc<AtomicU32> {
        self.sample_rate.clone()
    }

    /// How far ahead of the speakers the callback is working, in
    /// microseconds, or 0 before a stream has run. Half of the round trip a
    /// take has to pull the mic back by; the other half is the input side.
    pub fn output_latency_us(&self) -> u64 {
        self.output_latency_us.load(Ordering::Acquire)
    }

    /// Hand the engine the same `TempoContext` the commands mirror into, so
    /// a failed device open can clear the onset detector's playing gate from
    /// the audio thread. Called once, at app setup.
    pub fn set_tempo_context(&mut self, tempo_ctx: SharedTempoContext) {
        self.tempo_ctx = Some(tempo_ctx);
    }

    /// Test-only constructor: the audio thread spawns, refuses to open a
    /// device, and takes the failure path. Used to prove that a failed
    /// setup still leaves the engine startable.
    #[cfg(test)]
    fn new_with_forced_setup_failure(beat_log: BeatLog) -> Self {
        let mut engine = Self::new(beat_log);
        engine.force_setup_failure = true;
        engine
    }

    /// Build an engine whose output callback records its own timings into
    /// `probe`. Used only by `click-jitter-probe` (ROADMAP §4 audio-safety
    /// gate); the app uses `new`, which leaves the sink off.
    pub fn new_with_probe(beat_log: BeatLog, probe: Arc<CallbackProbe>) -> Self {
        // Not `..Self::new(beat_log)`: `MetronomeEngine` implements `Drop`,
        // so functional-update syntax cannot move fields out of it.
        let mut engine = Self::new(beat_log);
        engine.callback_probe = Some(probe);
        engine
    }

    /// Set the output device. If the engine is running, it will be restarted.
    /// The engine is left in a startable state whatever happens, and a device
    /// that will not open reports itself through `AudioThreadExit` — which
    /// also puts the transport back, so a failed switch cannot leave the
    /// button on "Stop" over silence.
    pub fn set_device(
        &mut self,
        name: Option<String>,
        state: SharedState,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        eprintln!("[yames] Setting audio output device: {:?}", name);
        let was_playing = self.playing.load(Ordering::SeqCst);
        // A table built on a folder of the musician's own drums was decoded
        // at the OLD device's rate and would play flat or sharp on the new
        // one. Taking it away makes the next bar-ahead `set_jam` decode it
        // again at the rate this device opens at; see
        // `JamHandoff::drop_custom_kit`, which is where the reasoning lives.
        // Every other table survives the change, which is the promise
        // `set_jam_table` makes.
        if self.jam.drop_kit() {
            eprintln!(
                "[yames] the jam's drums came from a folder and were decoded for the \
                 old device; the band returns on the next bar"
            );
        }
        // AND THE SONG, for the same reason and with less to soften it.
        //
        // A song carries a decoded kit, a percussion set and two melodic banks,
        // every one of them resampled to the rate the old device reported —
        // and unlike a jam, nothing sends it again a bar later: there is no
        // bar-ahead handshake for a song, because a song does not change from
        // bar to bar. So this is where it stops, and the UI has to load it
        // again at the new rate. A silent song is a smaller lie than a whole
        // piece a semitone and a half flat, and `song-dropped` is how the
        // screen is told rather than left wondering.
        if self.song.is_loaded() {
            self.song.set(None);
            eprintln!(
                "[yames] the song was decoded for the old device and has been taken \
                 away; load it again to play it on this one"
            );
            let _ = app_handle.emit("song-dropped", ());
        }
        self.device_name = name;
        // Fully tear down the old thread/stream
        self.shutdown();
        // Create fresh atomics so the old cpal callback (if still lingering
        // in CoreAudio) can never be reactivated by a shared flag. `playing`
        // carries the old state across *before* the spawn rather than being
        // restored after it: `ensure_thread` no longer waits, so a device
        // that fails instantly would otherwise have its `playing = false`
        // overwritten by a restore running a moment later.
        self.alive = Arc::new(AtomicBool::new(false));
        self.playing = Arc::new(AtomicBool::new(was_playing));
        // Brief pause to let CoreAudio fully release the old device
        thread::sleep(Duration::from_millis(100));
        // Restart on the new device
        self.ensure_thread(state, Some(app_handle), SetupWait::No)
    }

    /// Set the device name without restarting (for startup/restore).
    pub fn set_device_name(&mut self, name: Option<String>) {
        self.device_name = name;
    }

    /// Get the current output device name.
    pub fn device_name(&self) -> Option<&str> {
        self.device_name.as_deref()
    }

    /// Set the pair without touching the stream — for startup restore and
    /// for the moment before a device change, where the pair stored against
    /// the device being switched TO has to be in place before the new
    /// stream picks its config. Mirrors `set_device_name`.
    pub fn set_output_pair_name_only(&self, pair: u16) {
        self.output_pair.store(pair as u32, Ordering::Release);
    }

    /// Which pair the app is playing on, 0-based.
    pub fn output_pair(&self) -> u16 {
        self.output_pair.load(Ordering::Acquire) as u16
    }

    /// Move the click, the band, the takes and the coach to another pair of
    /// the device's outputs. Returns the pair actually in effect.
    ///
    /// **A pair that fits the open stream restarts nothing.** That is the
    /// whole point of the atomic: the metronome keeps its place, the band
    /// keeps its bar, and the next buffer simply lands two channels further
    /// along. Only a pair the open stream is too narrow for costs a restart
    /// — and then the thread goes down and comes back the way `set_device`
    /// does it, because the channel count is fixed when the stream is built.
    ///
    /// A restart cannot answer synchronously (the device takes as long as it
    /// takes, and waiting here is a frozen window — see `start`), so the
    /// answer here is the pair the engine will TRY. If the device turns out
    /// to deliver fewer outputs than it advertised, the audio thread lowers
    /// the pair itself and says so with `audio-output-pair-fallback`; the
    /// screen listens for that and corrects.
    pub fn set_output_pair(
        &mut self,
        pair: u16,
        state: SharedState,
        app_handle: AppHandle,
    ) -> u16 {
        let alive = self.alive.load(Ordering::SeqCst);
        let open = self.stream_channels.load(Ordering::Acquire) as usize;
        // Stored first, whatever happens next: a restart reads it on the way
        // up, and a stream that already fits reads it on the next buffer.
        self.output_pair.store(pair as u32, Ordering::Release);
        if pair_action(alive, open, pair) == PairAction::StoreOnly {
            if alive {
                eprintln!(
                    "[yames] the click moved to outputs {}-{}",
                    2 * pair + 1,
                    2 * pair + 2
                );
            }
            return pair;
        }
        eprintln!(
            "[yames] outputs {}-{} need a stream this one is not ({} outputs open); \
             reopening the device",
            2 * pair + 1,
            2 * pair + 2,
            open
        );
        let was_playing = self.playing.load(Ordering::SeqCst);
        self.shutdown();
        // Fresh atomics, for the reason `set_device` gives.
        self.alive = Arc::new(AtomicBool::new(false));
        self.playing = Arc::new(AtomicBool::new(was_playing));
        thread::sleep(Duration::from_millis(100));
        if let Err(e) = self.ensure_thread(state, Some(app_handle), SetupWait::No) {
            eprintln!("[yames] reopening the device for a new pair of outputs failed: {e}");
        }
        pair
    }

    /// The slots the coach's voice needs, pollable **without the engine
    /// mutex**. Take it under the lock, use it outside.
    ///
    /// The lock matters because the wait for a device to open is up to
    /// `AUDIO_SETUP_TIMEOUT`, and every synchronous Tauri command — Play,
    /// the tempo, the output pair — runs on the main thread and would queue
    /// behind it. A click on Play during the first coach line would freeze
    /// the window, which is the very thing `start`'s doc comment forbids.
    ///
    /// Taken AFTER the spawn rather than before: `ensure_thread` installs a
    /// fresh `alive` per spawn, so a snapshot taken earlier would be
    /// watching the flag of a thread that is already gone.
    pub fn speech_slots(&self) -> SpeechSlots {
        SpeechSlots {
            alive: self.alive.clone(),
            sample_rate: self.sample_rate.clone(),
            stream_channels: self.stream_channels.clone(),
            handoff: self.speech.clone(),
        }
    }

    /// Where the coach's voice is left for the callback, and the rate to
    /// resample it to — or `None` when there is nowhere for speech to come
    /// out of, which is the one honest answer and the one the caller knows
    /// how to report.
    ///
    /// See `speech_out` for why the coach goes through the metronome's own
    /// stream rather than a second one of its own.
    pub fn speech_out(&self) -> Option<SpeechOut> {
        self.speech_slots().out()
    }

    /// Get the output device opening if it is not open already, so the coach
    /// has somewhere to speak from before the musician has pressed Play once.
    ///
    /// Returns as soon as the thread is on its way — it does NOT wait for
    /// the device, because this runs with the engine mutex held. The wait
    /// belongs outside the lock, on `SpeechSlots::wait_for_stream`.
    pub fn start_audio_thread(
        &mut self,
        state: SharedState,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        self.ensure_thread(state, Some(app_handle), SetupWait::No)
    }

    /// Get a clone of the adaptive score Arc for external updates.
    pub fn adaptive_score(&self) -> Arc<AtomicU32> {
        self.adaptive_score.clone()
    }

    /// Ensure the audio thread is running (opens audio device once).
    ///
    /// `app_handle` is `None` only for `click-jitter-probe`, which runs the
    /// engine outside a Tauri application; the event loop then emits into
    /// an `EventSink` that discards. Everything else — timing, the beat
    /// log, the ramp state machine — is identical either way.
    /// With `SetupWait::UpTo`, returns `Err` when the audio thread could not
    /// open the output stream. With `SetupWait::No` it returns as soon as the
    /// thread is spawned and the verdict arrives later, out of band, through
    /// `AudioThreadExit`. A thread that is already running is `Ok` either
    /// way — there is nothing to wait for.
    fn ensure_thread(
        &mut self,
        state: SharedState,
        app_handle: Option<AppHandle>,
        wait: SetupWait,
    ) -> Result<(), String> {
        if self.alive.load(Ordering::SeqCst) {
            return Ok(());
        }

        // A *fresh* flag per spawn, not `store(true)` on the shared one. The
        // outgoing thread may still be unwinding — `AudioThreadExit::fail`
        // lowers `alive` before the thread has actually returned, so its
        // `Drop` runs after this call can already have spawned a replacement.
        // Sharing one `Arc` would let that dying thread's `Drop` clear the
        // live thread's flag, ending its event loop and dropping the stream:
        // silence, with `start` having reported success. Same idiom as
        // `set_device`.
        self.alive = Arc::new(AtomicBool::new(true));
        // No stream yet, whatever the last one was. Written HERE, on the
        // command thread and before the spawn, rather than by the outgoing
        // thread: a thread that is unwinding must never write a slot the
        // thread replacing it has already filled, which is the reason
        // `alive` is a fresh `Arc` per spawn. The new thread republishes
        // this once its stream is actually up.
        //
        // Two readers depend on the zero. `set_output_pair` reads it as
        // "still opening, so the pair it read on the way up is stale —
        // reopen"; `SpeechSlots::out` reads it as "no stream, so there is
        // nowhere for the coach to speak".
        self.stream_channels.store(0, Ordering::Release);
        let alive = self.alive.clone();
        let playing = self.playing.clone();
        let beat_log = self.beat_log.clone();
        let device_name = self.device_name.clone();
        let adaptive_score = self.adaptive_score.clone();
        let callback_probe = self.callback_probe.clone();
        let jam_shared = self.jam.clone();
        let song_shared = self.song.clone();
        let take_shared = self.take.clone();
        let take_event = self.take.clone();
        let take_sr_out = self.sample_rate.clone();
        let output_pair = self.output_pair.clone();
        let stream_channels_pub = self.stream_channels.clone();
        let speech_shared = self.speech.clone();
        let out_latency_pub = self.output_latency_us.clone();
        let dropped_notifications = self.dropped_notifications.clone();
        let app_handle = EventSink(app_handle);
        #[cfg(test)]
        let force_setup_failure = self.force_setup_failure;
        // Rendezvous for the setup outcome. Bounded at 1 and never waited on
        // by the sender, so the audio thread does not block on it even when
        // the receiver is dropped unread (which is what `SetupWait::No` does).
        let (setup_tx, setup_rx) = mpsc::sync_channel::<Result<(), String>>(1);

        let exit_alive = alive.clone();
        let exit_playing = playing.clone();
        let exit_state = state.clone();
        let exit_sink = app_handle.clone();
        let exit_tempo = self.tempo_ctx.clone();
        // The event loop's own handle, for a jam that ends its own form:
        // that is a stop, and a stop takes the onset detector's playing gate
        // down with it.
        let end_tempo = self.tempo_ctx.clone();
        let handle = thread::spawn(move || {
            // Lowers `alive` / `playing` however this thread leaves, and
            // answers `start` exactly once. See `AudioThreadExit`.
            let mut exit = AudioThreadExit::new(
                exit_alive,
                exit_playing,
                exit_state,
                exit_sink,
                exit_tempo,
                setup_tx,
            );

            #[cfg(test)]
            if force_setup_failure {
                exit.fail("forced setup failure (test)".to_string());
                return;
            }

            // ---- cpal setup ----
            let host = cpal::default_host();
            let device = if let Some(ref name) = device_name {
                // Log available devices for debugging
                if let Ok(devs) = host.output_devices() {
                    let names: Vec<String> = devs.filter_map(|d| d.name().ok()).collect();
                    eprintln!("[yames] Available output devices: {:?}", names);
                    eprintln!("[yames] Looking for: {:?}", name);
                }
                // Try to find the requested device by name
                host.output_devices()
                    .ok()
                    .and_then(|mut devs| {
                        devs.find(|d| d.name().ok().as_deref() == Some(name.as_str()))
                    })
                    .or_else(|| {
                        eprintln!(
                            "[yames] Device '{}' not found, falling back to default",
                            name
                        );
                        host.default_output_device()
                    })
            } else {
                host.default_output_device()
            };
            let device = match device {
                Some(d) => {
                    eprintln!(
                        "[yames] Using audio output device: {:?}",
                        d.name().unwrap_or_default()
                    );
                    d
                }
                None => {
                    exit.fail("no audio output device found".to_string());
                    return;
                }
            };
            let supported = match device.default_output_config() {
                Ok(c) => c,
                Err(e) => {
                    exit.fail(format!("output device has no usable config: {e}"));
                    return;
                }
            };

            let sample_rate = supported.sample_rate().0;
            let default_channels = supported.channels();
            let mut config: cpal::StreamConfig = supported.into();

            // ---- The pair of outputs the musician chose ----
            //
            // A four-output interface routinely hands `default_output_config`
            // two channels and keeps the other two in the supported list, so
            // a click asked for outputs 3-4 has to go looking for a config
            // wide enough to carry it. Same walk as the input side's
            // loopback widening in `audio_input.rs::start`, at the SAME rate
            // as the default config — a wider config at another rate would
            // mean every sound in the bank decoded against the wrong clock.
            //
            // A config that is not on offer is not a failure: the stream
            // opens at the default width and the callback puts the click on
            // outputs 1-2, which is audible and honest. `audio-output-pair-
            // fallback`, below, is how the screen hears about it.
            let requested_pair = output_pair.load(Ordering::Acquire) as u16;
            if !pair_fits(requested_pair, default_channels as usize) {
                match device.supported_output_configs().ok().and_then(|cfgs| {
                    channels_for_pair(
                        requested_pair,
                        default_channels,
                        sample_rate,
                        cfgs.map(|c| {
                            (c.channels(), c.min_sample_rate().0, c.max_sample_rate().0)
                        }),
                    )
                }) {
                    Some(wider) => {
                        eprintln!(
                            "[yames] outputs {}-{} asked for: opening {} outputs at {} Hz \
                             (the default config offered {})",
                            2 * requested_pair + 1,
                            2 * requested_pair + 2,
                            wider,
                            sample_rate,
                            default_channels
                        );
                        config.channels = wider;
                    }
                    None => {
                        eprintln!(
                            "[yames] this device offers nothing wide enough for outputs \
                             {}-{} at {} Hz; the click stays on outputs 1-2",
                            2 * requested_pair + 1,
                            2 * requested_pair + 2,
                            sample_rate
                        );
                    }
                }
            }
            // Pre-flight a widened config before the real stream is built
            // around it. The channel count is baked into the callback, so
            // there is no second attempt once that closure exists — and a
            // device that advertises a config it will not open is exactly
            // the shape `audio_input.rs::start_playback` guards against with
            // its two-attempt clamp. Built silent and dropped straight away,
            // on the setup path, never concurrently with the real one.
            if config.channels != default_channels {
                let preflight = device.build_output_stream(
                    &config,
                    move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                        for s in data.iter_mut() {
                            *s = 0.0;
                        }
                    },
                    |_| {},
                    None,
                );
                match preflight {
                    Ok(s) => {
                        drop(s);
                        // The same hundred milliseconds `set_device` waits
                        // after tearing a stream down, and for the same
                        // reason: CoreAudio does not release a device the
                        // instant the last reference goes, and the real
                        // stream is about to ask the same device for more
                        // channels. Paid only when a widened config was
                        // worth trying at all — a laptop never reaches
                        // this branch, and an interface pays it once, when
                        // the stream opens.
                        thread::sleep(Duration::from_millis(100));
                    }
                    Err(e) => {
                        eprintln!(
                            "[yames] this device would not open {} outputs ({e}); \
                             the click stays on outputs 1-2",
                            config.channels
                        );
                        config.channels = default_channels;
                    }
                }
            }
            let channels = config.channels as usize;
            // What the callback will actually be handed. A pair the stream
            // turned out to be too narrow for becomes the first pair, and
            // the screen is told so below.
            let effective_pair_now = effective_pair(requested_pair, channels);

            // Pre-decode all sounds at the output sample rate
            let sounds = SoundBank::new(sample_rate);

            // Callback -> event thread. Preallocated here, on the setup path,
            // and never grown: see `BeatQueue` for what the channel this
            // replaced was doing on the audio thread, and `BEAT_QUEUE_SLOTS`
            // for why a drop cannot happen at any tempo the app allows.
            let beats = Arc::new(BeatQueue::new(
                BEAT_QUEUE_SLOTS,
                dropped_notifications.clone(),
            ));
            let beats_cb = beats.clone();
            // And the thread to wake when something is in it. THIS thread:
            // the closure below is built here and runs on the device's
            // thread, so `current()` is the event loop's handle, taken once
            // rather than looked up per beat.
            //
            // `Thread::unpark` is the one hand-off that is safe FROM an audio
            // callback: on every platform Yames ships to it is a single
            // atomic swap, and it only reaches the kernel when the loop is
            // genuinely asleep (std `sys/sync/thread_parking`: futex on
            // Windows and Linux, a dispatch semaphore on Apple). It also
            // leaves a token behind when the loop is awake, so a wake can
            // never be missed and there is no flag to keep in step.
            let event_thread = thread::current();

            // Event thread -> callback: pending chime sound
            let pending_chime: Arc<Mutex<Option<SoundId>>> = Arc::new(Mutex::new(None));
            let pending_chime_cb = pending_chime.clone();

            let playing_cb = playing.clone();
            let state_cb = state.clone();
            // The pair, for the callback. One relaxed load per buffer — not
            // per frame, not behind a lock — which is what lets the musician
            // move the click from 1-2 to 3-4 without the metronome so much
            // as blinking.
            let pair_cb = output_pair.clone();
            let speech_cb = speech_shared.clone();
            let sr = sample_rate;

            // The rate a take is written at. Published before the stream
            // opens rather than after, so a `start_take` racing the first
            // buffer finds a rate rather than nothing.
            take_sr_out.store(sample_rate, Ordering::Release);

            // Audio-safety probe (ROADMAP §4). `None` in the app.
            if let Some(ref p) = callback_probe {
                p.set_sample_rate(sample_rate);
            }
            let probe_cb = callback_probe.clone();

            // Query CoreAudio for the real output latency (device + safety + stream).
            // This auto-adapts to the user's selected device.
            let device_latency_frames =
                query_coreaudio_output_latency_frames(device_name.as_deref()).unwrap_or(0);
            let device_latency_us = (device_latency_frames as u64 * 1_000_000) / sr as u64;
            eprintln!(
                "[yames] CoreAudio output latency: {} frames ({:.1}ms) + buffer",
                device_latency_frames,
                device_latency_frames as f64 / sr as f64 * 1000.0
            );
            let device_latency_us_cb = device_latency_us;

            // ---- Callback-local mutable state ----
            let mut voices: Vec<Voice> = Vec::with_capacity(MAX_VOICES);
            // The band's own bus: built here, at the device's rate, so every
            // coefficient in it is fixed before the first buffer. See
            // `DrumBus`. It processes the band and never the click.
            let mut bus = DrumBus::new(sr);
            // A choke, in frames at this device's rate. Worked out once here
            // rather than per hit.
            let choke_frames = (CHOKE_FADE_SECS * sr as f32) as u32;
            // Three milliseconds of push and pull, as frames. See
            // `Voice::delay`.
            let drift_frames = (DRIFT_MAX_SECS * sr as f32) as u32;
            let mut sample_counter: u64 = 0;
            let mut next_beat_sample: u64 = 0;
            let mut beat_count: u32 = 0;
            let mut sub_count: u32 = 0;
            let mut measure_beat: u32 = 0;
            // Where the band is in the form. 0-based bar, 1-based chorus —
            // "bar 3 of 12, chorus 2" is what the transport reads out.
            let mut jam_bar: u32 = 0;
            let mut jam_chorus: u32 = 1;
            // Where THIS press of play put the form. Remembered because the
            // count-in restarts the form a second time when it hands over —
            // and by then the pending jump that decided the bar has been
            // consumed, so recomputing it would land on the top of the loop
            // instead of where the musician pointed.
            let mut jam_start_bar: u32 = 0;
            // Decided at the bar line and held for the bar, so a practice
            // window or an edit landing mid-bar cannot change what the band
            // is doing under a bar that has already started.
            let mut jam_bar_state: JamBandState = JamBandState::Full;
            // The form length the counters belong to. A table that changes
            // while playing but keeps its form length keeps its place.
            let mut jam_form_bars: u32 = 0;
            // Has somebody moved the form during the bar under way?
            //
            // A jam that ends its form stops when the bar carrying
            // `endsForm` completes — unless the musician asked for a jump or
            // a loop first, which says they are not finished. Cleared at
            // every bar line, so the cancellation covers the bar it arrived
            // in and no more.
            let mut jam_ending_cancelled = false;
            // Is the next downbeat the one the song ends on? Raised at the
            // bar line of a bar carrying `endsForm` and spent one tick
            // later — see the tick loop for why it is not spent where it is
            // raised.
            let mut jam_ending_armed = false;
            // Is the beat under way the PICKUP — the count-in beat the
            // drummer plays instead of counting?
            //
            // Decided once, at that beat's downbeat, and held for the rest of
            // it, because the number it is decided from moves underneath a
            // beat. `warmup_count` is beats DONE, and the event thread counts
            // this beat as done the moment its downbeat is reported — several
            // buffers before the beat is over. `is_last_warmup` never noticed
            // because it only ever asks on a downbeat; a pickup is a whole
            // beat of a fill, sixteenths and all, so it has to ask on every
            // tick and get the same answer. One bool, beside the two above.
            let mut jam_in_pickup = false;
            let mut jam_retire = JamRetirement::new();
            // ---- Where the song is ----
            //
            // A CURSOR AND NOT A CLOCK. Everything about a song's timing was
            // worked out when it was compiled, so these six numbers are the
            // whole of the transport on this thread: how many frames into the
            // pass we are, whether we are still counting in, which time round
            // the range this is, and how far each of the three tables' walks
            // has got. No tempo, no meter, no division.
            let mut song_pos: u64 = 0;
            // The count-in leads into the FIRST pass and no other. Raised when
            // a song starts or is loaded, lowered the moment it is spent; a
            // song with no count-in spends it on its own first frame, which is
            // why there is no separate "has it got one" flag.
            let mut song_counting_in = false;
            let mut song_pass: u32 = 0;
            let mut song_tick_at: usize = 0;
            let mut song_band_at: usize = 0;
            let mut song_count_in_at: usize = 0;
            let mut song_retire = SongRetirement::new();
            let mut take_retire = crate::take::TakeParking::new();
            let mut speech_retire = crate::speech_out::SpeechParking::new();
            // One report per loaded table, not one per tick.
            let mut jam_mismatch_reported = false;
            let mut was_playing = false;
            let mut session: u64 = 0;
            // Pre-size so refilling `beat_groups` in the callback never
            // reallocates (validated input is at most MAX_BEAT_GROUPS).
            let mut initial_groups: Vec<u8> = Vec::with_capacity(MAX_BEAT_GROUPS);
            initial_groups.push(4);
            let mut cached = CachedParams {
                bpm: 120,
                subdivision: 1,
                volume: 0.8,
                kit: SoundKit::Click,
                accent_mask: accent_mask(&initial_groups),
                accent_mode: AccentMode::Groups,
                beat_groups_total: 4,
                beat_groups: initial_groups,
                beat_groups_changed: false,
                held_beat_groups: Vec::with_capacity(MAX_BEAT_GROUPS),
                beat_groups_held: false,
                ramp_active: false,
                ramp_beats_per_bar: 4,
                ramp_warming_up: false,
                warmup_count: 0,
                warmup_beats: 4,
                jam: None,
                jam_generation: 0,
                jam_changed: false,
                jam_pending: None,
                jam_position: JamPosition::default(),
                jam_position_generation: 0,
                count_in_slot: None,
                song: None,
                song_generation: 0,
                song_changed: false,
                song_mix: crate::song::SongMixGains::default(),
                song_mix_generation: 0,
                take_record: None,
                take_record_generation: 0,
                take_stamp_pending: false,
                take_play: None,
                take_play_generation: 0,
                take_play_pos: 0.0,
                take_play_ended: false,
                speech: None,
                speech_generation: 0,
                speech_pos: 0,
            };

            // ---- Build output stream ----
            let stream = device.build_output_stream(
                &config,
                move |data: &mut [f32], _info: &cpal::OutputCallbackInfo| {
                    let frames = data.len() / channels;

                    // Which pair of outputs everything this buffer plays
                    // goes to. ONE relaxed load for the whole buffer, then
                    // clamped: the load is how a musician changes pair
                    // without the click stopping, and the clamp is how a
                    // device that delivered fewer outputs than it promised
                    // gets the click on 1-2 instead of a panic. Neither
                    // allocates, locks, or looks anything up.
                    let pair = effective_pair(pair_cb.load(Ordering::Relaxed) as u16, channels)
                        as usize;

                    // Audio-safety probe: timestamp the callback *entry*,
                    // before any work, so callback-to-callback jitter is
                    // measured at the point the OS handed us the buffer.
                    // The value is only committed further down, once we
                    // know this buffer is actually rendering the click —
                    // silent buffers reset `sample_counter`, which would
                    // make the audio-clock delta meaningless. `None` in
                    // the app, where this costs one null check per buffer.
                    let probe_entry_ns = match probe_cb {
                        Some(_) => crate::clock::now_ns(),
                        None => 0,
                    };

                    // Audio-safety probe, the half the timings cannot see.
                    // Entry-to-entry gaps do not show an allocation inside a
                    // buffer unless it is slow enough to push the NEXT
                    // callback late, and a warm heap is fast — which is
                    // exactly when "the callback must not allocate" stops
                    // being tested. This raises a thread-local for the body
                    // of the callback and lowers it at every exit, including
                    // the two early returns below; `click-jitter-probe`
                    // installs a counting allocator that reads it and fails
                    // the run on a single `malloc` or `free`. `None` in the
                    // app, where it is the null check already paid above.
                    let _alloc_span = probe_cb
                        .as_ref()
                        .map(|_| crate::alloc_probe::Span::new());

                    // Output latency compensation.
                    // CoreAudio device/safety/stream latency + one buffer of
                    // buffering (the buffer we're currently writing into hasn't
                    // reached the DAC yet).
                    let buffer_us = (frames as u64 * 1_000_000) / sr as u64;
                    let output_latency_us = buffer_us + device_latency_us_cb;
                    // Published for the take writer, which has to know how
                    // late the mic's version of the band is. One relaxed
                    // store: no lock, no allocation, no branch.
                    out_latency_pub.store(output_latency_us, Ordering::Relaxed);

                    let is_playing = playing_cb.load(Ordering::Relaxed);

                    // Snapshot params from shared state (non-blocking)
                    if let Ok(s) = state_cb.try_lock() {
                        let eff_bpm = if s.speed_ramp.active {
                            s.speed_ramp.current_bpm
                        } else {
                            s.bpm
                        };
                        cached.bpm = eff_bpm;
                        // A drill used to be pinned to quarter notes here,
                        // whatever the metronome screen said. It carries its
                        // own subdivision now: the exercise where a player
                        // most wants a subdivided pulse -- climbing a passage
                        // one step at a time -- was the one place they could
                        // not have one. `.max(1)` because a zero would divide
                        // the beat into nothing on the audio thread.
                        cached.subdivision = if s.speed_ramp.active {
                            s.speed_ramp.subdivision.max(1)
                        } else {
                            s.subdivision
                        };
                        cached.volume = s.volume;
                        cached.kit = SoundKit::from_str(&s.sound_type);
                        cached.accent_mode = AccentMode::from_str(&s.accent_mode);
                        // Compare slices — cloning here would allocate on
                        // every output buffer. Refill in place (capacity
                        // is pre-reserved) and rebuild the accent mask +
                        // bar length only on an actual change.
                        if s.beat_groups.as_slice() != cached.beat_groups.as_slice() {
                            // A meter posted AT A BAR LINE — the setlist's
                            // switch, and nothing else — is HELD here and
                            // made current by the tick loop, at the bar line
                            // it was posted on. See `held_meter_due`. The
                            // hold is only meaningful while the click is
                            // running: stopped, there is no bar to wait for
                            // and a held meter would be a meter the next
                            // press of play would not have.
                            if s.beat_groups_at_bar_line && is_playing {
                                if s.beat_groups.as_slice()
                                    != cached.held_beat_groups.as_slice()
                                {
                                    cached.held_beat_groups.clear();
                                    cached.held_beat_groups.extend_from_slice(&s.beat_groups);
                                }
                                // Posted twice before the bar line: the last
                                // one is the one that plays.
                                cached.beat_groups_held = true;
                            } else {
                                cached.beat_groups.clear();
                                cached.beat_groups.extend_from_slice(&s.beat_groups);
                                cached.accent_mask = accent_mask(&cached.beat_groups);
                                cached.beat_groups_total =
                                    cached.beat_groups.iter().map(|&g| g as u32).sum();
                                cached.beat_groups_changed = true;
                                cached.beat_groups_held = false;
                            }
                        }
                        cached.ramp_active = s.speed_ramp.active;
                        cached.ramp_beats_per_bar = s.speed_ramp.beats_per_bar;
                        // No `speed_ramp.active` here any more: a count-in is
                        // the engine's, not the drill's, so a setlist step can
                        // ask for one between steps (U9.5). `beats == 0` is the
                        // resting state, which is what keeps a plain Play from
                        // counting itself in.
                        let warming = s.count_in.done < s.count_in.beats;
                        cached.ramp_warming_up = warming;
                        cached.warmup_count = s.count_in.done;
                        cached.warmup_beats = s.count_in.beats;
                    }

                    // ---- The band ----
                    //
                    // One relaxed load per buffer on the common path, where
                    // nothing changed. Only a real change pays for a
                    // `try_lock` and an `Arc` clone, and a failed `try_lock`
                    // simply leaves the generation unrecorded so the next
                    // buffer tries again — the audio thread never waits on
                    // the thread that compiled the table.
                    let gen = jam_shared.generation.load(Ordering::Acquire);
                    if gen != cached.jam_generation {
                        if let Ok(slot) = jam_shared.table.try_lock() {
                            let incoming = slot.clone();
                            drop(slot);
                            cached.jam_generation = gen;
                            // Whatever this replaces is handed back, never
                            // dropped here: the last reference to a table
                            // frees memory, and this is the audio thread.
                            if let Some(old) = cached.jam_pending.take() {
                                jam_retire.retire(&jam_shared, old);
                            }
                            // The UI posts the next bar's bass on this bar's
                            // downbeat. Same drummer, different bass: hold it
                            // for the bar line. Anything else plays now.
                            if crate::jam::swap_defers(
                                cached.jam.as_deref(),
                                incoming.as_deref(),
                                is_playing,
                                cached.ramp_warming_up,
                            ) {
                                cached.jam_pending = incoming;
                            } else {
                                // Which folder the drums still ringing came
                                // out of, before and after. A different one
                                // stops them; see
                                // `stop_voices_on_kit_change`.
                                let before = bank_id(cached.jam.as_deref());
                                let after = bank_id(incoming.as_deref());
                                if let Some(old) = cached.jam.take() {
                                    jam_retire.retire(&jam_shared, old);
                                }
                                cached.jam = incoming;
                                stop_voices_on_kit_change(&mut voices, before, after);
                                // The kit decides how hard the bus is
                                // driven. Two floats, copied on the one
                                // buffer where the table changed — the
                                // `tanh` behind `bus_shape` was computed
                                // when the table was compiled.
                                match cached.jam.as_deref() {
                                    Some(t) => bus.set_drive(t.bus_drive, t.bus_shape),
                                    None => bus.set_drive(1.0, 1.0 / 1.0f32.tanh()),
                                }
                                cached.jam_changed = true;
                                cached.count_in_slot =
                                    count_in_slot_of(cached.jam.as_deref());
                            }
                        }
                    }
                    // Cheap when nothing is parked, which is always, unless
                    // the command thread was mid-drain at the wrong moment.
                    jam_retire.flush(&jam_shared);

                    // ---- The song ----
                    //
                    // The same handshake, and it has to be the same: one
                    // relaxed load per buffer, a `try_lock` and an `Arc` clone
                    // only when something changed, and whatever it replaces
                    // handed BACK rather than dropped here — a song carries a
                    // decoded kit and two melodic banks, so dropping the last
                    // reference under the mixer would be tens of megabytes of
                    // `free()` on the audio thread.
                    //
                    // No bar-line deferral, unlike a jam. A jam is swapped
                    // four to six times a chorus by the bar-ahead bass
                    // handshake, and the whole point of `swap_defers` is that
                    // the drummer does not change under a bar. A song arrives
                    // when somebody presses a button, is the whole piece, and
                    // brings its own idea of where every sample sits — there
                    // is nothing to line it up with.
                    let song_gen = song_shared.generation.load(Ordering::Acquire);
                    if song_gen != cached.song_generation {
                        if let Ok(slot) = song_shared.table.try_lock() {
                            let incoming = slot.clone();
                            drop(slot);
                            cached.song_generation = song_gen;
                            let before = song_bank_id(cached.song.as_deref());
                            let after = song_bank_id(incoming.as_deref());
                            if let Some(old) = cached.song.take() {
                                song_retire.retire(&song_shared, old);
                            }
                            cached.song = incoming;
                            stop_voices_on_kit_change(&mut voices, before, after);
                            // The kit decides how hard the bus is driven, and
                            // a song that just arrived may carry a different
                            // one. Two floats on the one buffer it changed —
                            // the `tanh` was computed when the table was
                            // compiled. With no song and no jam the bus goes
                            // back to unity, which is what the metronome runs
                            // at and what `DrumBus::new` starts at.
                            match (cached.song.as_deref(), cached.jam.as_deref()) {
                                (Some(s), _) => bus.set_drive(s.bus_drive, s.bus_shape),
                                (None, Some(t)) => bus.set_drive(t.bus_drive, t.bus_shape),
                                (None, None) => bus.set_drive(1.0, 1.0 / 1.0f32.tanh()),
                            }
                            cached.song_changed = true;
                        }
                    }
                    song_retire.flush(&song_shared);

                    // And the faders. `Copy`, owns nothing, no retirement path
                    // — the shape `jam_position` uses, for the same reason.
                    let mix_gen = song_shared.mix_generation.load(Ordering::Acquire);
                    if mix_gen != cached.song_mix_generation {
                        if let Ok(m) = song_shared.mix.try_lock() {
                            cached.song_mix = *m;
                            drop(m);
                            cached.song_mix_generation = mix_gen;
                        }
                    }

                    // ---- Where the form goes next ----
                    //
                    // The same handshake the table uses — one relaxed load
                    // per buffer, a `try_lock` only when something moved —
                    // and simpler at the far end: the value is `Copy` and
                    // owns nothing, so a change is a read out of the lock
                    // with no old value to hand back and no retirement path
                    // to run. A failed `try_lock` leaves the generation
                    // unrecorded and the next buffer tries again.
                    let pos_gen = jam_shared.position_generation.load(Ordering::Acquire);
                    if pos_gen != cached.jam_position_generation {
                        if let Ok(p) = jam_shared.position.try_lock() {
                            cached.jam_position = *p;
                            drop(p);
                            cached.jam_position_generation = pos_gen;
                            // Somebody moving the form is somebody who is
                            // not finished. See `position_cancels_an_ending`.
                            jam_ending_cancelled |=
                                position_cancels_an_ending(cached.jam_position);
                        }
                    }

                    // ---- The take ----
                    //
                    // The same handshake the band uses, twice: one relaxed
                    // load per buffer each for "is a take recording?" and
                    // "is a take playing?", a `try_lock` only when one of
                    // them moved, and whatever the change replaces handed
                    // BACK rather than dropped here. Dropping the last
                    // `Arc<Vec<f32>>` of a twenty-minute take would free a
                    // hundred megabytes under the mixer.
                    if let Some(incoming) =
                        take_shared.poll_record(&mut cached.take_record_generation)
                    {
                        if let Some(old) = cached.take_record.take() {
                            take_retire.retire_ring(&take_shared, old);
                        }
                        // A new ring has never been told where the piece is.
                        // Raised even for `None` so a take that is taken away
                        // leaves nothing armed behind it.
                        cached.take_stamp_pending = incoming.is_some();
                        cached.take_record = incoming;
                    }
                    if let Some(incoming) = take_shared.poll_play(&mut cached.take_play_generation)
                    {
                        if let Some(old) = cached.take_play.take() {
                            take_retire.retire_pcm(&take_shared, old.pcm);
                        }
                        cached.take_play = incoming;
                        cached.take_play_pos = 0.0;
                        // A new take (or none) is a new playback, and the
                        // next time IT runs out is news again.
                        cached.take_play_ended = false;
                    }
                    take_retire.flush(&take_shared);
                    speech_retire.flush(&speech_cb);

                    // ---- What the coach is saying ----
                    //
                    // Same shape as the take slot above and for the same
                    // reasons: one relaxed load a buffer, and a clip this
                    // replaces is handed BACK rather than freed here. See
                    // `speech_out`. The mixing itself happens at every exit
                    // from this callback, because the coach talks over a
                    // stopped metronome far more often than a running one.
                    if let Some(incoming) = speech_cb.poll(&mut cached.speech_generation) {
                        if let Some(old) = cached.speech.take() {
                            speech_retire.retire(&speech_cb, old.pcm);
                        }
                        cached.speech = incoming;
                        cached.speech_pos = 0;
                    }

                    // The coach's voice, mixed in over whatever this buffer
                    // ended up carrying — the click and the band while the
                    // metronome runs (turned down for the length of the
                    // line by `commands::tts_speak`), silence while it does
                    // not, and a take while one is playing back.
                    //
                    // A macro and not a function because it has to reach
                    // `cached`, `data`, `pair` and `frames` at three
                    // different exits from this callback, and a closure
                    // holding all four would borrow the buffer for the
                    // length of the buffer. The work itself is
                    // `speech_out::mix_speech`, which is where the rule
                    // lives and where it is tested.
                    macro_rules! mix_in_the_coach {
                        () => {
                            let ran_out = match cached.speech {
                                Some(ref clip) => mix_speech(
                                    data,
                                    channels,
                                    pair,
                                    frames,
                                    &clip.pcm,
                                    &mut cached.speech_pos,
                                ),
                                None => false,
                            };
                            if ran_out {
                                // Once per line: the clip goes back to the
                                // speaking thread in the same breath, so the
                                // buffer after this one has nothing to read
                                // and cannot report the ending twice.
                                speech_cb.note_done();
                                if let Some(old) = cached.speech.take() {
                                    speech_retire.retire(&speech_cb, old.pcm);
                                }
                            }
                        };
                    }

                    // BACK TO THE TOP OF THE RANGE.
                    //
                    // Six assignments, at the three moments a song starts
                    // over: a press of Play, a song arriving or being taken
                    // away, and the transport stopped. A macro rather than a
                    // function because every one of them is a local of this
                    // closure — a function would need six `&mut`s and would
                    // read worse than the thing it replaced.
                    //
                    // `song_counting_in` starts TRUE whether or not the song
                    // has a count-in: a song with none spends it on its own
                    // first frame, where the seam check below finds a
                    // count-in of nought samples already over. One flag, and
                    // no second one asking whether there is anything to count.
                    macro_rules! song_from_the_top {
                        () => {{
                            song_pos = 0;
                            song_pass = 0;
                            song_tick_at = 0;
                            song_band_at = 0;
                            song_count_in_at = 0;
                            song_counting_in = true;
                        }};
                    }

                    // A song that arrived, or one that was taken away.
                    //
                    // Handled here rather than beside the pickup above for
                    // one plain reason: the macro has to be declared before
                    // anything uses it. And it belongs BEFORE the transport
                    // gate, so a song loaded while the metronome is stopped
                    // is already at the top of its range when Play is
                    // pressed, rather than being put there by the first
                    // buffer of playback.
                    if cached.song_changed {
                        cached.song_changed = false;
                        song_from_the_top!();
                    }

                    // ---- A take playing back ----
                    //
                    // BEFORE the `is_playing` gate, because listening back
                    // is something you do with the band stopped — and the
                    // band and the click are both silent while it runs, so
                    // this branch is the whole output. Streamed straight out
                    // of the decoded buffer with a linear step, because the
                    // take was recorded through whatever device was there
                    // then and is coming out of whatever is there now.
                    if let Some(ref play) = cached.take_play {
                        let step = play.step(sr);
                        let mut ended = false;
                        for frame_idx in 0..frames {
                            let v = match play.sample_at(cached.take_play_pos) {
                                Some(v) => v,
                                None => {
                                    ended = true;
                                    0.0
                                }
                            };
                            let out = (v * cached.volume).clamp(-1.0, 1.0);
                            // Out of the same pair of outputs as everything
                            // else: a take recorded on outputs 3-4 is
                            // listened back on outputs 3-4. The take is
                            // mono, so both sides of the pair get it.
                            let base = frame_idx * channels;
                            if channels == 1 {
                                data[base] = out;
                            } else {
                                write_pair(data, base, channels, pair, out, out);
                            }
                            cached.take_play_pos += step;
                        }
                        if should_report_take_end(ended, &mut cached.take_play_ended) {
                            // Once per playback, not once per buffer. The
                            // event thread emits `take-playback-ended`;
                            // saying it here would mean an `emit` on the
                            // audio thread, which locks and allocates.
                            take_shared.note_ended();
                        }
                        // The transport is where it was; the band starts
                        // from the top when the listening is over.
                        if was_playing {
                            voices.clear();
                            was_playing = false;
                        }
                        sample_counter = 0;
                        next_beat_sample = 0;
                        beat_count = 0;
                        sub_count = 0;
                        measure_beat = 0;
                        mix_in_the_coach!();
                        return;
                    }

                    // ---- Not playing: silence ----
                    if !is_playing {
                        // A bass that was waiting for a bar line that never
                        // came is the right one to start from next time.
                        if let Some(p) = cached.jam_pending.take() {
                            if let Some(old) = cached.jam.take() {
                                jam_retire.retire(&jam_shared, old);
                            }
                            cached.jam = Some(p);
                            cached.jam_changed = true;
                            cached.count_in_slot = count_in_slot_of(cached.jam.as_deref());
                        }
                        for s in data.iter_mut() {
                            *s = 0.0;
                        }
                        // A take running while the band is stopped records
                        // the silence, and has to: the band is the take's
                        // clock, so a buffer the callback did not report is
                        // a buffer of mic audio that would slide forward
                        // against everything after it.
                        if let Some(ref ring) = cached.take_record {
                            // AND A TAKE THAT BEGINS HERE BEGINS NOWHERE.
                            // The transport is stopped, so the first sample
                            // of the file is at no position in any piece —
                            // whatever is loaded, the silence in front of the
                            // count-in could be seconds long. Saying `Free`
                            // is what makes the sidecar have no position at
                            // all, which is the truth; the frontend's own
                            // estimate is the fallback for exactly this.
                            if cached.take_stamp_pending {
                                cached.take_stamp_pending = false;
                                ring.stamp_start(crate::take::TakeTransport::Free);
                            }
                            ring.push_strided_at(data, channels, take_offset(channels, pair));
                        }
                        if was_playing {
                            voices.clear();
                            was_playing = false;
                        }
                        sample_counter = 0;
                        next_beat_sample = 0;
                        beat_count = 0;
                        sub_count = 0;
                        measure_beat = 0;
                        // A PEEK, not a consumption: this runs on every
                        // buffer the transport is stopped for, and all it is
                        // doing is saying where the next press of play would
                        // start. Spending the jump here would spend it
                        // several thousand times a second and leave nothing
                        // for the press itself.
                        let (bar, state, _) =
                            form_restart(cached.jam.as_deref(), cached.jam_position);
                        jam_bar = bar;
                        jam_chorus = 1;
                        jam_bar_state = state;
                        jam_start_bar = bar;
                        // And the song waits at the top of its range, counted
                        // in again. Unlike the jam's peek above there is
                        // nothing to work out — where a song starts is where
                        // the range starts, always.
                        song_from_the_top!();
                        // The usual case for the coach: a stopped metronome
                        // and a tip between exercises. Mixed AFTER the take
                        // ring above, so a take is the band and the player,
                        // never the coaching over the top of them.
                        mix_in_the_coach!();
                        return;
                    }

                    // ---- Just started playing ----
                    if !was_playing {
                        was_playing = true;
                        session += 1;
                        sample_counter = 0;
                        next_beat_sample = 0;
                        beat_count = 0;
                        sub_count = 0;
                        measure_beat = 0;
                        // Press play and the band starts where the screen
                        // said it would: the bar the musician picked, else
                        // the top of the loop, else the top of the form. The
                        // jump is SPENT here — the press of play is what it
                        // was waiting for.
                        let (bar, state, left) =
                            form_restart(cached.jam.as_deref(), cached.jam_position);
                        cached.jam_position = left;
                        jam_bar = bar;
                        jam_chorus = 1;
                        jam_bar_state = state;
                        jam_start_bar = bar;
                        jam_mismatch_reported = false;
                        // A press of Play is a new tune. An ending armed by
                        // the last one — which is how the transport went
                        // down in the first place — must not stop this one
                        // on its first tick.
                        jam_ending_armed = false;
                        jam_ending_cancelled = false;
                        // And a pickup held over from the last one. The first
                        // tick of a press of Play is a downbeat, so this
                        // would be decided again a moment later anyway — but
                        // a latch nobody clears is a latch somebody has to
                        // reason about.
                        jam_in_pickup = false;
                        // A press of Play is a new pass of the song, counted
                        // in from the top of the range.
                        song_from_the_top!();
                        voices.clear();
                    }

                    // A jam arriving (or being taken away) puts the form back
                    // to the top: bar 1 of chorus 1 is where a band starts.
                    if cached.jam_changed {
                        cached.jam_changed = false;
                        jam_mismatch_reported = false;
                        // A band arriving while stopped, or a form of a
                        // different length, starts at the top. A band that
                        // changes while playing and keeps its form length
                        // keeps its place: turning trading on at bar 9 is
                        // not a reason to go back to bar 1, and the state
                        // for the bar under way is not re-decided.
                        let next_form = cached.jam.as_ref().map_or(0, |t| t.form_bars());
                        if !is_playing || next_form != jam_form_bars {
                            let (bar, state, left) =
                                form_restart(cached.jam.as_deref(), cached.jam_position);
                            cached.jam_position = left;
                            jam_bar = bar;
                            jam_chorus = 1;
                            jam_bar_state = state;
                            jam_start_bar = bar;
                        }
                        jam_form_bars = next_form;
                    }

                    // Audio-safety probe: commit this buffer's entry time,
                    // now that `sample_counter` is the live audio clock.
                    let probe_slot = match probe_cb {
                        Some(ref p) => p.record(probe_entry_ns, frames as u32, sample_counter),
                        None => None,
                    };

                    // ---- Where a take that starts now starts ----
                    //
                    // HERE, above the frame loop, and not beside the ring
                    // push at the bottom: this is the only point in the
                    // buffer where `song_pos`, `song_pass` and
                    // `song_counting_in` still describe its FIRST sample.
                    // The loop moves the cursor a frame at a time and can
                    // cross a loop seam on the way, so read at the bottom
                    // they describe the buffer's end — a bar and a bit out
                    // on a small range, and the wrong pass across a seam.
                    //
                    // The cost on every buffer of every take after the first
                    // is this branch on a bool the callback already holds.
                    // The stamp itself happens once and is four relaxed
                    // stores; nothing is allocated, locked or looked up.
                    if cached.take_stamp_pending {
                        if let Some(ref ring) = cached.take_record {
                            cached.take_stamp_pending = false;
                            ring.stamp_start(if cached.song.is_some() {
                                if song_counting_in {
                                    crate::take::TakeTransport::SongCountIn { frames: song_pos }
                                } else {
                                    crate::take::TakeTransport::Song {
                                        frames: song_pos,
                                        pass: song_pass,
                                    }
                                }
                            } else if cached.jam.is_some() {
                                crate::take::TakeTransport::Jam {
                                    bar: jam_bar,
                                    chorus: jam_chorus,
                                }
                            } else {
                                // The plain click. There is no arranged
                                // material, so there is no position in one.
                                crate::take::TakeTransport::Free
                            });
                        }
                    }

                    // ---- Check for pending chime from event thread ----
                    if let Ok(mut chime) = pending_chime_cb.try_lock() {
                        // Guarded like every other push: a chime that cannot
                        // fit is a chime nobody hears, which is better than
                        // a reallocation under the mixer. See `MAX_VOICES`.
                        if let Some(chime_id) = chime.take().filter(|_| voices.len() < MAX_VOICES) {
                            voices.push(Voice::click(chime_id, 0.4 * cached.volume, 0));
                        }
                    }

                    // ---- Timing ----
                    let subdivision = cached.subdivision as u32;
                    let beat_duration_secs = 60.0 / cached.bpm as f64;
                    let tick_duration_secs = beat_duration_secs / subdivision as f64;
                    let tick_samples = (tick_duration_secs * sr as f64) as u64;
                    let cap_samples = (tick_samples as f64 * 0.9) as usize;

                    // Did the form end inside THIS buffer?
                    //
                    // Once it has, no further tick of this buffer sounds and
                    // nothing is ringing: the band stops on the downbeat it
                    // said it would, not a buffer and a bit later. The
                    // transport flag is already false by then, so the next
                    // buffer takes the silent path at the top.
                    let mut form_ended_here = false;

                    // IS A SONG PLAYING? Asked once, here, because the answer
                    // cannot change inside a buffer — the table is picked up
                    // above the transport gate — and because the per-frame
                    // branch below has to be a straight `if / else if`: the
                    // song's arm borrows `cached.song`, the click's arm
                    // MUTATES `cached`, and the two only coexist when each
                    // borrow begins and ends inside its own arm.
                    let song_active = cached.song.is_some();
                    // Did the song run off the end of a range that does not
                    // loop, inside THIS buffer? `form_ended_here`'s twin, and
                    // the same rule: once it has, no further event of this
                    // buffer sounds.
                    let mut song_ended_here = false;

                    // ---- Per-frame processing ----
                    for frame_idx in 0..frames {
                        // ---- The song, if there is one ----
                        //
                        // THE WHOLE TRANSPORT, and it is two comparisons and a
                        // walk. Everything a tempo map, a meter and a range
                        // mean was turned into sample positions on the command
                        // thread (`song.rs`), so what is left here is "have we
                        // reached the end of the section?" and "is the next
                        // event's sample behind us?". Nothing divides, nothing
                        // looks a tempo up, and nothing depends on how long
                        // the buffer is — which is what makes a tempo step
                        // land on its bar line to the sample rather than to
                        // the nearest buffer.
                        if song_active {
                            if let Some(song) = cached.song.as_deref() {
                                // IS THIS THE FRAME THE PIECE ENDED ON?
                                //
                                // Not `song_ended_here`, which stays up for
                                // the rest of the buffer so nothing further
                                // sounds. The end is one event and has to be
                                // reported once: without this the block below
                                // would push a notification on every
                                // remaining frame of the buffer — up to a
                                // whole buffer's worth of them, which is the
                                // one way the engine can fill its own beat
                                // queue.
                                let mut ends_here = false;
                                // ---- The seam ----
                                //
                                // Checked BEFORE this frame's events and after
                                // the frame before it advanced the cursor, so
                                // the first tick of a pass and the last frame
                                // of the one before it are adjacent samples
                                // with nothing between them.
                                if !song_ended_here && song_counting_in {
                                    if song_pos >= song.count_in_samples() {
                                        // Spent, and it is spent for the whole
                                        // of this song: a count-in leads into
                                        // the first pass and a loop comes
                                        // round without one, which is what
                                        // being counted in means.
                                        song_pos = 0;
                                        song_counting_in = false;
                                    }
                                } else if !song_ended_here && song_pos >= song.pass_samples() {
                                    if song.loops() {
                                        // AND NOTHING IS CUT SHORT. The
                                        // cursors go back and the voices do
                                        // not: a chord still ringing at the
                                        // end of bar 24 rings on into bar 17,
                                        // which is what a loop pedal does and
                                        // what a bar line that cleared the
                                        // mixer would not.
                                        song_pos = 0;
                                        song_tick_at = 0;
                                        song_band_at = 0;
                                        song_pass = song_pass.saturating_add(1);
                                    } else {
                                        song_ended_here = true;
                                        ends_here = true;
                                    }
                                }

                                if ends_here {
                                    // THE PIECE IS OVER.
                                    //
                                    // The same shape a jam's form ending has,
                                    // and for the same reasons: the transport
                                    // flag goes down HERE, on the audio
                                    // thread, because the event loop sleeps
                                    // the output latency before it says
                                    // anything and a band playing through
                                    // that would overrun the end of the song.
                                    // The event thread's half is the state and
                                    // the word, which is where a `lock()` and
                                    // an `emit` belong.
                                    //
                                    // It rides out on `jam_form_ended`, which
                                    // is the engine's "the arranged thing has
                                    // finished" and already means exactly this
                                    // to the event loop and to the UI. A
                                    // second flag would be a second thing for
                                    // every consumer to learn.
                                    let frame_delay_us =
                                        (frame_idx as u64 * 1_000_000) / sr as u64;
                                    let total_delay_us = output_latency_us + frame_delay_us;
                                    let notif = BeatNotification {
                                        session,
                                        beat: 0,
                                        measure_beat: 0,
                                        subdivision: 0,
                                        subdivision_total: 1,
                                        is_downbeat: false,
                                        accent: 0,
                                        beats_per_bar: 1,
                                        ts_ns: crate::clock::now_ns() + total_delay_us * 1000,
                                        expected_interval_ms: 0.0,
                                        is_warmup_beat: false,
                                        is_warmup_transition: false,
                                        bar_just_completed: false,
                                        delay_us: total_delay_us,
                                        jam_bar: 0,
                                        jam_chorus: 1,
                                        jam_band_state: JamBandState::Full,
                                        jam_bar_mismatch: false,
                                        song_bar: crate::song::NO_SONG_BAR,
                                        song_tick: 0,
                                        song_pass,
                                        jam_form_ended: true,
                                    };
                                    if beats_cb.push(&notif) {
                                        event_thread.unpark();
                                    }
                                    playing_cb.store(false, Ordering::SeqCst);
                                    // Nothing rings across the end of the
                                    // piece: the buffer after this one takes
                                    // the silent path and would write zeros
                                    // over a decay anyway, so letting it ring
                                    // here would be a tail whose length was
                                    // whatever the buffer size happened to be.
                                    voices.clear();
                                } else if song_ended_here {
                                    // The rest of the buffer after the piece
                                    // ended: nothing sounds, nothing is
                                    // reported. The cursors are already at the
                                    // end of their tables, so the walks below
                                    // would find nothing anyway — this says so
                                    // rather than relying on it.
                                } else if song_counting_in {
                                    // The count-in's clicks. No band: the
                                    // count leads into the music, it is not
                                    // part of it.
                                    while let Some(t) = song.count_in().get(song_count_in_at) {
                                        if t.sample > song_pos {
                                            break;
                                        }
                                        song_count_in_at += 1;
                                        let frame_delay_us =
                                            (frame_idx as u64 * 1_000_000) / sr as u64;
                                        let total_delay_us = output_latency_us + frame_delay_us;
                                        let level = song_accent(
                                            cached.accent_mode,
                                            t.accent,
                                            t.sub == 0,
                                        );
                                        spawn_song_click(
                                            &mut voices,
                                            t,
                                            level,
                                            cached.kit,
                                            cached.volume * cached.song_mix.click,
                                        );
                                        let notif = song_notification(
                                            t,
                                            session,
                                            crate::clock::now_ns() + total_delay_us * 1000,
                                            total_delay_us,
                                            level,
                                            song_pass,
                                        );
                                        if beats_cb.push(&notif) {
                                            event_thread.unpark();
                                        }
                                        if let (Some(ref p), Some(slot)) = (&probe_cb, probe_slot) {
                                            p.note_tick(slot);
                                        }
                                    }
                                } else {
                                    // The click, on the song's own grid.
                                    while let Some(t) = song.ticks().get(song_tick_at) {
                                        if t.sample > song_pos {
                                            break;
                                        }
                                        song_tick_at += 1;
                                        let frame_delay_us =
                                            (frame_idx as u64 * 1_000_000) / sr as u64;
                                        let total_delay_us = output_latency_us + frame_delay_us;
                                        let level = song_accent(
                                            cached.accent_mode,
                                            t.accent,
                                            t.sub == 0,
                                        );
                                        spawn_song_click(
                                            &mut voices,
                                            t,
                                            level,
                                            cached.kit,
                                            cached.volume * cached.song_mix.click,
                                        );
                                        let notif = song_notification(
                                            t,
                                            session,
                                            crate::clock::now_ns() + total_delay_us * 1000,
                                            total_delay_us,
                                            level,
                                            song_pass,
                                        );
                                        if beats_cb.push(&notif) {
                                            event_thread.unpark();
                                        }
                                        // Audio-safety probe: one audible tick
                                        // rendered into this buffer, counted
                                        // on the audio clock exactly as the
                                        // click's own ticks are.
                                        if let (Some(ref p), Some(slot)) = (&probe_cb, probe_slot) {
                                            p.note_tick(slot);
                                        }
                                    }
                                    // And the band. Two notes on the same
                                    // sample are two entries, so this walks
                                    // until the next one is in the future
                                    // rather than firing one per frame.
                                    while let Some(e) = song.band().get(song_band_at) {
                                        if e.sample > song_pos {
                                            break;
                                        }
                                        song_band_at += 1;
                                        spawn_song_voice(
                                            &mut voices,
                                            e,
                                            e.slot.gain
                                                * cached.volume
                                                * cached.song_mix.lane(e.lane),
                                            choke_frames,
                                        );
                                    }
                                }
                            }
                        } else if !form_ended_here && sample_counter >= next_beat_sample {
                            // THIS IS THE DOWNBEAT THE FORM ENDED ON.
                            //
                            // "The form", and every "song" in the jam comments
                            // below means a TUNE rather than an imported
                            // piece: this arm is the click and the band, and
                            // it does not run at all while a `song::SongTable`
                            // is loaded. The two are different engine modes
                            // and the word was here first.
                            //
                            // Armed at the bar line a tick ago, fired here,
                            // where the next bar would have begun. The tick
                            // is walked through to the end anyway — the
                            // notification is what carries the news, and the
                            // voices this tick spawns are taken back below
                            // before a sample of them is mixed, so nothing
                            // of the bar that never started is heard.
                            let form_ends_now = jam_ending_armed;
                            jam_ending_armed = false;

                            // If beat_groups changed mid-play, reset bar BEFORE
                            // is_downbeat is computed so this tick IS the new beat 0.
                            if cached.beat_groups_changed {
                                measure_beat = 0;
                                sub_count = 0; // force current tick to be a downbeat
                                cached.beat_groups_changed = false;
                                // The bar just changed length, so the form
                                // starts again with it — and the table is
                                // very likely the wrong width now, which the
                                // mismatch check below will say out loud.
                                let (bar, state, left) =
                                    form_restart(cached.jam.as_deref(), cached.jam_position);
                                cached.jam_position = left;
                                jam_bar = bar;
                                jam_chorus = 1;
                                jam_bar_state = state;
                                jam_start_bar = bar;
                                jam_mismatch_reported = false;
                            }

                            // And the OTHER kind of meter change: one the
                            // setlist posted at a bar line, held since the
                            // buffer that saw it. It takes the bar it was
                            // posted on rather than restacking the grid one
                            // beat late — `measure_beat` is deliberately left
                            // alone, so the bar that opened at the switch
                            // keeps its downbeat and runs to the new meter's
                            // length. No stub bar, and no bar of the new step
                            // spent on it. See `held_meter_due`.
                            //
                            // A compare, a copy into capacity reserved when
                            // the stream was built, and two integer sums over
                            // at most six groups — the click stays sacred.
                            if cached.beat_groups_held
                                && held_meter_due(measure_beat, sub_count)
                            {
                                cached.beat_groups.clear();
                                cached
                                    .beat_groups
                                    .extend_from_slice(&cached.held_beat_groups);
                                cached.accent_mask = accent_mask(&cached.beat_groups);
                                cached.beat_groups_total =
                                    cached.beat_groups.iter().map(|&g| g as u32).sum();
                                cached.beat_groups_held = false;
                                // The form restarts with the meter and at the
                                // same bar line it does, exactly as the
                                // immediate branch above restarts it.
                                let (bar, state, left) =
                                    form_restart(cached.jam.as_deref(), cached.jam_position);
                                cached.jam_position = left;
                                jam_bar = bar;
                                jam_chorus = 1;
                                jam_bar_state = state;
                                jam_start_bar = bar;
                                jam_mismatch_reported = false;
                            }

                            let is_downbeat = sub_count == 0;

                            // Warmup transition detection
                            let is_warmup_beat = cached.ramp_warming_up && is_downbeat;
                            let is_last_warmup =
                                is_warmup_beat && cached.warmup_count + 1 >= cached.warmup_beats;
                            let mut is_warmup_transition = false;

                            if is_last_warmup {
                                // Last warmup beat becomes beat 0 of real playback
                                beat_count = 0;
                                sub_count = 0;
                                measure_beat = 0;
                                is_warmup_transition = true;
                                // ...and back to the bar this press of play
                                // started on. The count-in beeps over the top
                                // of nothing, but its bar lines have moved
                                // the form on and one of them may have spent
                                // the jump, so the bar is the one remembered
                                // at the press rather than one worked out
                                // again from a position that is now empty.
                                let (bar, state) =
                                    form_at(cached.jam.as_deref(), jam_start_bar);
                                jam_bar = bar;
                                jam_chorus = 1;
                                jam_bar_state = state;
                            }

                            // Bar length the engine wraps `measure_beat`
                            // against — the ramp owns it while active,
                            // otherwise it is the meter total (which in
                            // FREE mode is the single collapsed group).
                            let beats_per_measure: u32 = if cached.ramp_active {
                                if cached.ramp_beats_per_bar >= 2 {
                                    cached.ramp_beats_per_bar as u32
                                } else {
                                    4
                                }
                            } else if cached.beat_groups_total >= 1 {
                                cached.beat_groups_total
                            } else {
                                4
                            };

                            // Determine accent. A handful of integer ops
                            // — no allocation, no set build, per the
                            // "click is sacred" rule. The tier added one
                            // `trailing_zeros` to that handful and nothing
                            // else; see `accent_for`.
                            let accent_level = accent_for(
                                cached.accent_mode,
                                cached.ramp_active,
                                cached.ramp_beats_per_bar,
                                cached.accent_mask,
                                is_downbeat,
                                beat_count,
                                measure_beat,
                            );

                            // ---- The band, if there is one ----
                            //
                            // A jam is a lookup, not a second clock: this
                            // tick was going to be played anyway, and all
                            // that changes is which drums sound on it. The
                            // rules live in `jam_play`, which is pure.
                            let counting_in = cached.ramp_warming_up && !is_last_warmup;
                            // THE PICKUP. The one beat of the count-in the
                            // drummer plays rather than counts — whether
                            // there is anything to play is `jam_play`'s
                            // question, and whether the table asked for one
                            // was settled when it was compiled. Here it is
                            // three integer comparisons on numbers the
                            // callback is already holding, ON THE DOWNBEAT
                            // and held from there: see `jam_in_pickup`.
                            if is_downbeat {
                                jam_in_pickup = is_pickup_beat(
                                    cached.ramp_warming_up,
                                    cached.warmup_count,
                                    cached.warmup_beats,
                                );
                            }
                            let is_pickup = jam_in_pickup && cached.ramp_warming_up;
                            // Where in the bar this tick is. The round robin
                            // and the drift are both functions of it, and it
                            // is the same arithmetic `jam_play` indexes the
                            // table with.
                            let jam_tick_index = measure_beat * subdivision + sub_count;
                            let mut jam_mismatch = false;
                            // Whether anything the band ACTUALLY played on
                            // this tick was an accent. Not the table's own
                            // `is_accent`: on a trading bar the snare is not
                            // sounding, and a dot flashing on a backbeat
                            // nobody can hear is a lie about where the band
                            // is.
                            let mut jam_accent = false;
                            let jam_tick = match jam_play(
                                cached.jam.as_deref(),
                                counting_in,
                                is_pickup,
                                cached.ramp_active,
                                beats_per_measure,
                                subdivision,
                                measure_beat,
                                sub_count,
                                jam_bar,
                            ) {
                                JamPlay::Band(t) => Some(t),
                                JamPlay::Mismatch => {
                                    // Once per loaded table, not once per
                                    // tick. The event thread does the saying.
                                    if !jam_mismatch_reported {
                                        jam_mismatch_reported = true;
                                        jam_mismatch = true;
                                    }
                                    None
                                }
                                JamPlay::Click => None,
                            };

                            // What the band is doing on THIS bar. Read off
                            // the table with `jam_bar`, which only moves at
                            // a bar line, so the state cannot change under
                            // a bar however busy the tick grid is — that is
                            // the whole point of deciding it here and not
                            // in the UI. `Full` whenever no jam is loaded.
                            //
                            // And `Full` on the pickup, which is not a bar of
                            // the form at all: the count-in's bar lines move
                            // the form on while nothing is playing, so the
                            // state sitting in `jam_bar_state` at that moment
                            // belongs to whatever bar the counter happened to
                            // land on — a trading bar or a drop-out window
                            // that would swallow the one gesture the drummer
                            // makes before the tune.
                            let band_state = if is_pickup {
                                JamBandState::Full
                            } else if cached.jam.is_some() {
                                jam_bar_state
                            } else {
                                JamBandState::Full
                            };
                            // A band with no hat lane keeps its bass on your
                            // bars instead: a drummer's band has no drums.
                            let trade_keeps = if cached.jam.as_ref().map_or(true, |t| t.has_hat()) {
                                JamLane::Hat
                            } else {
                                JamLane::Bass
                            };

                            // Spawn voice for this beat
                            if let Some(tick) = jam_tick {
                                // A drop-out bar spawns nothing at all — not
                                // the band and not the click either. The
                                // window is there to leave silence for the
                                // musician to fill and for the mic to score
                                // honestly; a metronome ticking through it
                                // would defeat both.
                                let mut accent_heard = false;
                                if band_state != JamBandState::Silent {
                                    for slot in tick.slots() {
                                        // Your bars in a trade: the hat lane
                                        // keeps the time and nothing else
                                        // plays, bass included.
                                        //
                                        // AND THE PERCUSSIONIST, who keeps
                                        // going when the hats do
                                        // (`plans/tasks/jam-v5/BRIEF.md`).
                                        // In a breakdown the kit drops to
                                        // kick and hats while the shaker and
                                        // the congas hold the time, which is
                                        // what somebody standing next to the
                                        // drummer actually does — and it is
                                        // the difference between a bar that
                                        // opens up and a bar that falls
                                        // over. Asked off the lane, which
                                        // the slot already carries for
                                        // exactly this question.
                                        if band_state == JamBandState::HatsOnly
                                            && slot.lane != trade_keeps
                                            && !slot.lane.is_perc()
                                        {
                                            continue;
                                        }
                                        if voices.len() >= MAX_VOICES {
                                            break;
                                        }
                                        accent_heard |= slot.accent;
                                        spawn_band_voice(
                                            &mut voices,
                                            slot,
                                            cached.volume,
                                            jam_bar,
                                            jam_tick_index,
                                            beats_per_measure * subdivision,
                                            tick_samples,
                                            drift_frames,
                                            choke_frames,
                                        );
                                    }
                                }
                                // The crash that says "top of the form". Bar
                                // 0 of a chorus is always `Full` — a
                                // drop-out never opens on it and a trade
                                // always starts with the band — but the
                                // state is checked rather than assumed.
                                //
                                // Never on the pickup, whose tick 0 can land
                                // on `measure_beat` 0 when the count-in is a
                                // couple of beats long. A crash on the way IN
                                // to the tune is the cymbal that answers the
                                // pickup arriving a beat before the pickup.
                                if !is_pickup
                                    && measure_beat == 0
                                    && sub_count == 0
                                    && jam_bar == 0
                                    && band_state == JamBandState::Full
                                {
                                    if let Some(slot) = cached
                                        .jam
                                        .as_ref()
                                        .and_then(|t| t.crash_on_one())
                                        .filter(|_| voices.len() < MAX_VOICES)
                                    {
                                        accent_heard = true;
                                        // The crash on the one rings out
                                        // whatever its lane says, which is
                                        // why it is spawned with no cap and
                                        // on tick 0 of the bar it opens.
                                        spawn_band_voice(
                                            &mut voices,
                                            &JamSlot {
                                                cap_ticks: 0.0,
                                                ..slot
                                            },
                                            cached.volume,
                                            jam_bar,
                                            0,
                                            beats_per_measure * subdivision,
                                            tick_samples,
                                            drift_frames,
                                            choke_frames,
                                        );
                                    }
                                }
                                jam_accent = accent_heard;
                            } else if accent_level.is_accent() && !cached.ramp_warming_up {
                                // Accent: full ring-out, no duration cap.
                                // Guarded like every other push — see
                                // `MAX_VOICES`; the click cannot reach it,
                                // and the guard is what makes that a fact
                                // about this line rather than about a sum
                                // computed somewhere else.
                                //
                                // TWO SOUNDS, NOT ONE SOUND AT TWO VOLUMES.
                                // This used to spawn `high_id()` at
                                // `MEDIUM_GAIN` for a bar's middle, and the
                                // owner listened to that and heard nothing:
                                // the same transient a couple of decibels
                                // down, passing once a bar, is under what an
                                // ear reports. Every kit ships a middle
                                // stroke of its own now — see `mid_id` — and
                                // the level lives in that file.
                                //
                                // One more id lookup than before and nothing
                                // else: a `match` over a `Copy` enum, the
                                // same shape the beat and the sub-tick have
                                // always had. No allocation, no lock, no
                                // branch that depends on anything but this
                                // tick's level.
                                //
                                // It rings out uncapped like the strong one:
                                // it is the same gesture, and capping it
                                // would make it a different kind of click
                                // rather than a lighter one.
                                if voices.len() < MAX_VOICES {
                                    let sound = if accent_level == AccentLevel::Strong {
                                        cached.kit.high_id()
                                    } else {
                                        cached.kit.mid_id()
                                    };
                                    voices.push(Voice::click(
                                        sound,
                                        accent_level.gain() * cached.volume,
                                        0,
                                    ));
                                }
                            } else if cached.ramp_warming_up && !is_last_warmup {
                                // The count-in. Which sound it makes was
                                // decided when the table arrived, not here:
                                // `count_in_slot` is `None` for the beep the
                                // drill has always used and `Some` for the
                                // loaded kit's sticks.
                                //
                                // Sticks are a drummer counting, so they land
                                // ON THE BEATS and nowhere else. The beep
                                // keeps every tick it has always had — the
                                // drill's count-in is not this task's to
                                // change, and a jam that has not asked for
                                // sticks must sound exactly as it did.
                                match cached.count_in_slot {
                                    Some(slot) if is_downbeat => {
                                        // A CLICK, and no longer a band
                                        // voice. The sticks used to be the
                                        // loaded kit's cross-stick, which
                                        // lives in the table and arrives
                                        // interleaved and panned; they are
                                        // `sticks_low` out of the
                                        // `SoundBank` now — the same file
                                        // the Sticks preset plays — so this
                                        // goes down the metronome's own path
                                        // like every other click, mono and
                                        // centred and outside the drum bus.
                                        //
                                        // No drift and no round robin, which
                                        // used to be a decision and is now
                                        // simply what the sound is: a
                                        // count-in is four identical clicks
                                        // of wood, which is what counting
                                        // sounds like.
                                        if voices.len() < MAX_VOICES {
                                            voices.push(Voice::click(
                                                slot.sound,
                                                slot.gain * cached.volume,
                                                0,
                                            ));
                                        }
                                    }
                                    // A sticks count-in is silent between the
                                    // beats: four clicks, not sixteen.
                                    Some(_) => {}
                                    None => {
                                        if voices.len() < MAX_VOICES {
                                            voices.push(Voice::click(
                                                SoundId::BeepHigh,
                                                0.6 * cached.volume,
                                                cap_samples,
                                            ));
                                        }
                                    }
                                }
                            } else {
                                // Regular / subdivision
                                let (sid, amp) = if is_downbeat {
                                    (cached.kit.low_id(), BEAT_GAIN)
                                } else {
                                    (cached.kit.low_id(), SUB_GAIN)
                                };
                                if voices.len() < MAX_VOICES {
                                    voices.push(Voice::click(
                                        sid,
                                        amp * cached.volume,
                                        cap_samples,
                                    ));
                                }
                            }

                            // Capture current beat/sub for notification
                            // Compute delay: output latency + position within buffer
                            let frame_delay_us = (frame_idx as u64 * 1_000_000) / sr as u64;
                            let total_delay_us = output_latency_us + frame_delay_us;
                            let ts_ns = crate::clock::now_ns() + total_delay_us * 1000; // adjusted to play time
                            let notif_beat = beat_count;
                            let notif_sub = sub_count;
                            let notif_measure_beat = measure_beat; // capture BEFORE counter advance
                            // Where in the form this tick was, not where the
                            // next one will be.
                            let notif_jam_bar = jam_bar;
                            let notif_jam_chorus = jam_chorus;
                            // While the band plays, a tick is accented when
                            // any drum on it is — so the UI's dots flash on
                            // the kick and the backbeat rather than on the
                            // meter's group starts, which nothing is playing.
                            //
                            // A band's accent has no middle tier: the table
                            // says a drum is an accent or it does not, so it
                            // reports Strong or nothing and the dots flash
                            // exactly as they did before the tier existed.
                            // The meter's tiers are the click's.
                            let notif_accent: u8 = match jam_tick {
                                Some(_) => {
                                    if jam_accent {
                                        AccentLevel::Strong as u8
                                    } else {
                                        AccentLevel::None as u8
                                    }
                                }
                                None => accent_level as u8,
                            };
                            // "full" whenever the band is not the thing
                            // playing — no jam, the count-in, a drill ramp,
                            // a table that does not fit the bar. The
                            // contract's value for "there is no band".
                            let notif_band_state = match jam_tick {
                                Some(_) => band_state,
                                None => JamBandState::Full,
                            };

                            // Advance counters
                            let mut bar_complete = false;
                            sub_count += 1;
                            if sub_count >= subdivision {
                                sub_count = 0;
                                beat_count += 1;
                                measure_beat += 1;
                                if measure_beat >= beats_per_measure {
                                    measure_beat = 0;
                                    bar_complete = true;
                                }
                            }
                            // The form moves with the bar — and only when a
                            // jam is loaded, so a plain click keeps
                            // reporting bar 0 of chorus 1 as the contract
                            // says it must.
                            if bar_complete {
                                // DOES THE FORM END AT THE NEXT DOWNBEAT?
                                // Asked of the table that played THIS bar,
                                // before the held one takes over — the bar
                                // that carries `endsForm` is the bar that
                                // just finished, not the one arriving.
                                //
                                // ARMED HERE AND FIRED A TICK LATER, and the
                                // difference is the last sixteenth of the
                                // song. `bar_complete` is raised after the
                                // bar's LAST TICK HAS BEEN SPAWNED and
                                // before a sample of it has been rendered;
                                // stopping here would spawn that tick and
                                // take it straight back, and a tune would
                                // end one tick before its end. So the flag
                                // waits for the tick that would have been
                                // the next downbeat, which is where the
                                // silence belongs.
                                //
                                // A jump or a loop the musician asked for
                                // during the bar cancels it: somebody
                                // reaching for the footswitch on the last
                                // bar of the last chorus is somebody who is
                                // not finished, and stopping under their
                                // hand would be the app deciding it knew
                                // better.
                                //
                                // AND ONLY A BAR THE BAND ACTUALLY PLAYED
                                // CAN END THE FORM. `jam_tick` is the tick
                                // that just sounded out of the table, so it
                                // is `None` through a count-in, through a
                                // drill's ramp and over a table whose bar is
                                // not this engine's bar — see `jam_play`,
                                // and `the_count_in_and_the_ramp_keep_the_
                                // click` for the three cases as a test.
                                // Without it a one-bar song would end on the
                                // count-in's own bar line, before a note of
                                // it had been played.
                                //
                                // AND THE PICKUP IS NOT A BAR THE BAND
                                // PLAYED. It is one beat, before the form
                                // starts, and with a count-in whose length is
                                // not a whole number of bars it can be the
                                // last tick of the count-in's own bar — which
                                // without this would be a bar the band
                                // "played", and a song that ended on it.
                                jam_ending_armed = jam_tick.is_some()
                                    && !is_pickup
                                    && !jam_ending_cancelled
                                    && cached.jam.as_deref().is_some_and(|t| t.ends_form());
                                jam_ending_cancelled = false;
                                // The bar line: the held table becomes the
                                // one the next tick reads.
                                //
                                // Everything the immediate branch does is
                                // done here too, and after `applyAt` that is
                                // no longer belt and braces. A table used to
                                // be HELD only when its `drums_signature`
                                // matched the one playing — same drums, same
                                // decode, so nothing ringing had to stop and
                                // the bus kept its drive. An arrangement
                                // asks for the bar line whatever changed, so
                                // the drums, the kit, the folder and the
                                // drive can all move across this line.
                                if let Some(p) = cached.jam_pending.take() {
                                    let before = bank_id(cached.jam.as_deref());
                                    let after = bank_id(Some(&p));
                                    if let Some(old) = cached.jam.take() {
                                        jam_retire.retire(&jam_shared, old);
                                    }
                                    bus.set_drive(p.bus_drive, p.bus_shape);
                                    jam_form_bars = p.form_bars();
                                    cached.jam = Some(p);
                                    stop_voices_on_kit_change(&mut voices, before, after);
                                    cached.count_in_slot =
                                        count_in_slot_of(cached.jam.as_deref());
                                }
                                // Then where the form goes: a jump the
                                // musician asked for, otherwise the next
                                // bar, and the loop over the top of either.
                                // Every form change lands here, on the bar
                                // line, and nowhere else — which is why a
                                // footswitch pressed halfway through a bar
                                // finishes the bar first.
                                //
                                // A jump or a loop with no table loaded
                                // falls through this block untouched: there
                                // is no form to move through, and the
                                // position waits for one.
                                if let Some(ref t) = cached.jam {
                                    let (b, c, left) = next_form_position(
                                        jam_bar,
                                        jam_chorus,
                                        t.form_bars(),
                                        cached.jam_position,
                                    );
                                    cached.jam_position = left;
                                    jam_bar = b;
                                    jam_chorus = c;
                                    jam_bar_state = t.band_state(b);
                                }
                            }

                            // INTO THE QUEUE, AND THEN WAKE THE LOOP.
                            //
                            // Built on the stack and copied field by field
                            // into a slot that was allocated when the stream
                            // opened. A full queue is the one case with no
                            // good answer — a callback may not wait — so it
                            // is counted and reported rather than passed off
                            // as a dropped frame: the analyzer scores the
                            // player against `beat_log`, and a beat that
                            // never reaches it is a beat the player is
                            // marked down for not playing. See
                            // `BEAT_QUEUE_SLOTS` for why it cannot fill.
                            let notif = BeatNotification {
                                session,
                                beat: notif_beat,
                                measure_beat: notif_measure_beat,
                                subdivision: notif_sub,
                                subdivision_total: subdivision.clamp(1, 255) as u8,
                                is_downbeat,
                                accent: notif_accent,
                                beats_per_bar: beats_per_measure.clamp(1, 255) as u8,
                                ts_ns,
                                expected_interval_ms: beat_duration_secs * 1000.0,
                                is_warmup_beat,
                                is_warmup_transition,
                                bar_just_completed: bar_complete,
                                delay_us: total_delay_us,
                                jam_bar: notif_jam_bar,
                                jam_chorus: notif_jam_chorus,
                                jam_band_state: notif_band_state,
                                jam_bar_mismatch: jam_mismatch,
                                // No song on this path by construction — this
                                // arm only runs when `song_active` is false.
                                song_bar: crate::song::NO_SONG_BAR,
                                song_tick: 0,
                                song_pass: 0,
                                jam_form_ended: form_ends_now,
                            };
                            if beats_cb.push(&notif) {
                                event_thread.unpark();
                            }

                            // AND THE TUNE ENDS.
                            //
                            // The transport flag goes down HERE, on the
                            // audio thread, on the downbeat the form ended
                            // on — not on the event thread, which sleeps the
                            // output latency before it says anything and
                            // would leave a bar of band playing after the
                            // end of the song. The event thread's half is
                            // the state and the word (`jam-ended`), which is
                            // where a `lock()` and an `emit` belong.
                            //
                            // It is the same atomic `stop` writes, so this
                            // is a stop and not a special case: the next
                            // buffer takes the silent path at the top, the
                            // stream stays open, and the next press of Play
                            // starts the form again.
                            if form_ends_now {
                                form_ended_here = true;
                                playing_cb.store(false, Ordering::SeqCst);
                                // Nothing rings across the end, and nothing
                                // of the bar that never started is heard: a
                                // stop clears the voices, and so does this.
                                // `Vec::clear` keeps its allocation and a
                                // `Voice` owns nothing, so it is a length
                                // written to zero.
                                voices.clear();
                            }

                            // Audio-safety probe: one audible tick rendered
                            // into this buffer. Counting here (rather than
                            // from the event thread) keeps the count on the
                            // audio clock, which is what "missed beats"
                            // has to be measured against.
                            if let (Some(ref p), Some(slot)) = (&probe_cb, probe_slot) {
                                p.note_tick(slot);
                            }

                            next_beat_sample = sample_counter + tick_samples;
                        }

                        // ---- Mix all active voices ----
                        //
                        // TWO SUMS, AND THE CLICK IS THE ONE THAT DOES NOT
                        // MOVE. The band goes into a stereo pair and through
                        // the drum bus; the click is summed mono, exactly
                        // where it always was, and added afterwards. Its
                        // path, its timing and its level are the same lines
                        // they were before Jam existed, which is the rule
                        // this whole pass was built under.
                        //
                        // `band` is the drums and the recorded melodic notes
                        // the loaded table carries. Read off `cached.jam`
                        // rather than looked up: they are fields of the
                        // table the callback is already holding, so it costs
                        // three `Option` reads per frame and cannot be out
                        // of step with the slots that name them.
                        //
                        // THE SONG'S TABLE WINS when there is one, and there
                        // is never both: `load_song` takes the band away on
                        // the command thread and `set_jam` clears the song.
                        // The order here is what makes that a fact about this
                        // line rather than a promise two commands are keeping.
                        let band = match cached.song.as_deref() {
                            Some(s) => BandBanks::of_song(s),
                            None => BandBanks::of(cached.jam.as_deref()),
                        };
                        let mut click = 0.0f32;
                        let mut band_l = 0.0f32;
                        let mut band_r = 0.0f32;
                        for voice in voices.iter_mut() {
                            // The drift's push and pull: a few milliseconds
                            // of nothing before the drum speaks.
                            if voice.delay > 0 {
                                voice.delay -= 1;
                                continue;
                            }
                            let buf = jam_sample(&sounds, band, voice.sound_id);
                            // A drum is interleaved stereo, so a frame is
                            // two samples; everything else is one. See
                            // `Voice::stereo` — this used to ask `band`,
                            // which is a different question.
                            let frames = if voice.stereo {
                                buf.len() / 2
                            } else {
                                buf.len()
                            };
                            let limit = if voice.max_samples > 0 {
                                voice.max_samples.min(frames)
                            } else {
                                frames
                            };
                            if voice.position < limit {
                                if voice.band {
                                    // The choke is a drum being stopped; the
                                    // release is a note ending. A voice
                                    // never has both, and both are 1.0 for
                                    // everything the engine had before
                                    // recorded banks.
                                    let choke = voice.choke_gain() * voice.release_gain();
                                    let (l, r) = if voice.stereo {
                                        (buf[2 * voice.position], buf[2 * voice.position + 1])
                                    } else {
                                        (buf[voice.position], buf[voice.position])
                                    };
                                    band_l += l * voice.amp_l * choke;
                                    band_r += r * voice.amp_r * choke;
                                } else {
                                    click += buf[voice.position] * voice.amp_l;
                                }
                            }
                            if voice.band && voice.fade_left > 0 {
                                voice.fade_left -= 1;
                            }
                            voice.position += 1;
                        }

                        // The bus, and ONLY when there is a band. With no
                        // table loaded the metronome pays for none of this:
                        // not the tanh, not the detector, not the branch on
                        // a threshold. See `DrumBus`.
                        let (bus_l, bus_r) = if band.any() {
                            bus.process(band_l, band_r)
                        } else {
                            (0.0, 0.0)
                        };

                        // Write out. A stereo device gets the band where the
                        // kit was placed; a mono one gets both sides folded,
                        // which is the same band without the room.
                        //
                        // On anything wider, the two sides go to the pair
                        // the musician chose and every other output is left
                        // silent — this used to broadcast L and R across all
                        // of them, which is the one thing a drummer running
                        // v-drums into outputs 1-2 cannot have. See
                        // `write_pair`.
                        let base = frame_idx * channels;
                        if channels == 1 {
                            data[base] = (click + (bus_l + bus_r) * 0.5).clamp(-1.0, 1.0);
                        } else {
                            let l = (click + bus_l).clamp(-1.0, 1.0);
                            let r = (click + bus_r).clamp(-1.0, 1.0);
                            write_pair(data, base, channels, pair, l, r);
                        }

                        sample_counter += 1;
                        // AND THE SONG'S CURSOR, by exactly one frame, at the
                        // bottom of the frame that used it. One add, no
                        // borrow of `cached`, and the wrap is the seam check
                        // at the top of the NEXT frame — which is what makes
                        // the last sample of a pass and the first sample of
                        // the one after it adjacent rather than a frame
                        // apart.
                        if song_active {
                            song_pos += 1;
                        }
                    }

                    // ---- The take, if one is recording ----
                    //
                    // The band exactly as the device is about to hear it,
                    // taken once per buffer rather than once per frame: a
                    // strided read of what was just written costs one
                    // acquire load and one release store for the whole
                    // buffer, and the ring can neither allocate nor block.
                    //
                    // Read from the PAIR'S left channel, not channel 0 — on
                    // outputs 3-4 channel 0 is the silence this callback
                    // just wrote there, and a take of it would be a take of
                    // nothing.
                    if let Some(ref ring) = cached.take_record {
                        ring.push_strided_at(data, channels, take_offset(channels, pair));
                    }

                    // Remove finished voices (once per buffer) — run off
                    // the end of the sample, or choked all the way down.
                    let band = BandBanks::of(cached.jam.as_deref());
                    voices.retain(|v| {
                        let buf = jam_sample(&sounds, band, v.sound_id);
                        let frames = if v.stereo { buf.len() / 2 } else { buf.len() };
                        !v.done(frames)
                    });

                    // The coach over a running metronome: a mid-session tip
                    // while the click is dimmed. After the take ring, for
                    // the reason the stopped path gives.
                    mix_in_the_coach!();
                },
                |err| {
                    eprintln!("Audio stream error: {}", err);
                },
                None,
            );

            let stream = match stream {
                Ok(s) => s,
                Err(e) => {
                    // The one observed in the wild: WASAPI answers
                    // AUDCLNT_E_DEVICE_IN_USE (0x8889000A) when the endpoint
                    // is already held exclusively, which on Windows is any
                    // second client on some Realtek configurations.
                    exit.fail(format!("could not open the audio output stream: {e}"));
                    return;
                }
            };

            if let Err(e) = stream.play() {
                exit.fail(format!("could not start the audio output stream: {e}"));
                return;
            }

            // Past this point there is a live stream, so `start` may report
            // success; the guard's `Drop` still lowers the flags when the
            // loop below ends.
            exit.ready();

            // How wide the stream really is, published only now that there
            // IS one — `set_output_pair` reads it to decide whether a new
            // pair fits without reopening the device.
            stream_channels_pub.store(channels as u32, Ordering::Release);

            // The musician asked for a pair this device would not give.
            // Correct the stored pair here rather than leaving the callback
            // to clamp it every buffer in silence, and tell the screen, so
            // the dropdown shows where the click actually is and says why.
            if effective_pair_now != requested_pair {
                output_pair.store(effective_pair_now as u32, Ordering::Release);
                let _ = app_handle.emit("audio-output-pair-fallback", effective_pair_now);
            }

            // THE EVENT LOOP RUNS AT NORMAL PRIORITY, and that is a decision
            // rather than an omission.
            //
            // T06 (2026-09-02) promoted it to real time because doing so
            // improved *callback* jitter under CPU inference — 1.2-2.3 ms
            // down to 0.49-1.19 ms. That only ever made sense because the
            // callback DEPENDED on this loop: it pushed every beat into a
            // `std::sync::mpsc` channel whose send allocated every 31
            // messages and locked the receiver's waker every time (see
            // `BeatQueue`). Promoting the consumer shortened the lock the
            // producer was waiting on. It treated the symptom.
            //
            // The queue below shares nothing with the callback but two
            // atomics, so there is nothing left to invert — and what this
            // loop does per beat is exactly what a real-time thread must not:
            // `state.lock().unwrap()`, `app_handle.emit` (which allocates and
            // serialises), and a `thread::sleep` of the output latency.
            // Promoting all of that on a two-core machine is a UI thread
            // holding a lock above the scheduler's other work.
            //
            // AND IT WAS MEASURED, not assumed. Ten 60 s runs on
            // 2026-09-20, alternating promoted and not, eight of them on the
            // busiest path the engine has — 240 BPM sixteenths, every lane,
            // a table swapped in from another thread every 350 ms, a form
            // jump every 2 s and a take being written to disk underneath:
            //
            //   p99 jitter, normal:     5.58  10.95  4.56  6.09 ms
            //   p99 jitter, real-time:  95.10  8.13  3.22  8.15 ms
            //   click only, normal 2.21 ms / 4 dropouts; real-time 7.11 ms
            //   / 16 dropouts / 5 missed beats
            //
            // The distributions sit on top of each other and the two worst
            // runs in the whole set are both promoted ones. There is no
            // number here that buys the promotion its keep. (The box was at
            // 100% with up to sixteen `rustc` on it the whole time, so none
            // of these are the absolute figures ROADMAP §4 asks for — but
            // heavy CPU load is exactly the condition the promotion was
            // introduced to survive, and it did not help under it.)
            //
            // What did not move at all, in any of the ten: zero allocations
            // and zero frees inside the callback, and zero dropped
            // notifications.
            //
            // The analyzer's own promotion (`onset.rs`) is a different
            // thread and a different question; this changes nothing there.

            // ---- Event loop (also keeps the cpal Stream alive) ----
            let mut pending_ramp_advance = false;
            let mut current_session: u64 = 0;
            // The last drop count this loop said out loud, so a queue that
            // overflows is reported when it happens and not once a beat
            // forever after.
            let mut dropped_said: u64 = 0;

            while alive.load(Ordering::SeqCst) {
                // A BEAT THE CALLBACK COULD NOT HAND OVER.
                //
                // Said here because this is the thread that may print, and
                // said at all because it is not a cosmetic loss: `beat_log`
                // below is the only place the matcher learns where a beat
                // fell, so every one of these is an expected onset the score
                // is missing. One relaxed load per pass.
                let dropped_now = dropped_notifications.load(Ordering::Relaxed);
                if dropped_now != dropped_said {
                    eprintln!(
                        "[yames] BEAT QUEUE OVERFLOW: {} notification(s) dropped in total \
                         ({} since the last report). The timing analyzer scores against \
                         these, so this session's numbers are low by however many beats \
                         it never saw. The event thread was off the CPU for more than \
                         {} ticks.",
                        dropped_now,
                        dropped_now - dropped_said,
                        BEAT_QUEUE_SLOTS,
                    );
                    dropped_said = dropped_now;
                }
                // A take that ran off its own end. Checked here, at the top
                // of every pass — including the timeout pass, which is the
                // only one that runs while a take plays with the band
                // stopped — because the audio thread cannot emit: an
                // `emit` locks and allocates.
                if take_event.take_ended() {
                    let _ = app_handle.emit("take-playback-ended", ());
                }
                // And a take that ran into the twenty-minute cap. Raised by
                // the WRITER thread rather than the callback, but read here
                // for the same reason: this is the thread that may emit.
                if take_event.take_capped() {
                    let _ = app_handle.emit("take-capped", ());
                }
                // The callback unparks this thread on every push, so the
                // common path is: park, wake, take the beat. The 50 ms is a
                // backstop and the pace of the two take flags above — it is
                // the same 50 ms `recv_timeout` used, and nothing about the
                // engine's timing depends on it, because the tick's play
                // time was stamped inside the callback (`ts_ns`).
                //
                // There is no `Disconnected` arm any more and nothing is
                // lost with it: the sender lived in the stream, the stream is
                // dropped after this loop, so the channel could only
                // disconnect once the loop had already ended. `alive` is what
                // ends it, as it always really was.
                let notif = match beats.pop() {
                    Some(n) => n,
                    None => {
                        thread::park_timeout(Duration::from_millis(50));
                        // Ticks that landed while the transport was stopped
                        // are stale. Same rule, same place in the pass, as
                        // the `try_recv` drain this replaces.
                        if !playing.load(Ordering::Relaxed) {
                            beats.drain();
                        }
                        continue;
                    }
                };

                if !alive.load(Ordering::SeqCst) {
                    break;
                }

                // A jam whose bar is not the engine's bar. The audio thread
                // raises this once per loaded table and the click keeps
                // playing; saying it here rather than there keeps `eprintln!`
                // — which locks and allocates — off the audio thread.
                if notif.jam_bar_mismatch {
                    eprintln!(
                        "[yames] jam table ignored: its bar is not this engine's bar \
                         ({} beats x subdivision {}). The UI must set subdivision and \
                         beat groups before set_jam. Playing the click.",
                        notif.beats_per_bar, notif.subdivision_total
                    );
                }

                // ---- The tune ended ----
                //
                // The band has already stopped: the audio thread lowered the
                // transport flag on the downbeat, because everything below
                // here sleeps the output latency first and a band that
                // played on through it would overrun the end of the song.
                // What is left is the half that needs a lock and a window:
                // the app state a press of Stop would have written, and the
                // one word the UI is waiting for.
                //
                // Checked BEFORE the session gate, because the stop is what
                // ends the session and a notification that arrived with it
                // is not stale.
                if notif.jam_form_ended {
                    {
                        let mut s = state.lock().unwrap();
                        s.is_playing = false;
                        // A stop spends the count-in, whichever door it came
                        // through — and an ending is a door. Without this
                        // the next press of Play counts out the beats a jam
                        // armed before the song finished itself.
                        s.count_in = crate::state::CountIn::default();
                        let sc = s.clone();
                        drop(s);
                        let _ = app_handle.emit("state-changed", &sc);
                    }
                    // The onset detector gates on this: left true, it would
                    // go on scoring a room with no click in it.
                    if let Some(ref t) = end_tempo {
                        t.set_playing(false);
                    }
                    // No payload. "The song is over" is the whole message;
                    // where it ended is on the last `beat` event, which the
                    // UI already has.
                    let _ = app_handle.emit("jam-ended", ());
                    // And no `beat` for this one. The tick this notification
                    // rode in on is the downbeat the song did NOT play — it
                    // made no sound, and a playhead moved onto a bar nobody
                    // heard would be the screen disagreeing with the room.
                    continue;
                }

                // Session tracking — ignore stale notifications from previous
                // play sessions
                if notif.session < current_session {
                    continue;
                }
                if notif.session > current_session {
                    current_session = notif.session;
                    pending_ramp_advance = false;
                }

                // ---- Warmup beats (not the transition) ----
                if notif.is_warmup_beat && !notif.is_warmup_transition {
                    let mut s = state.lock().unwrap();
                    s.count_in.done = s.count_in.done.saturating_add(1);
                    let sc = s.clone();
                    drop(s);
                    let _ = app_handle.emit("state-changed", &sc);
                    continue;
                }

                // ---- Warmup transition (last warmup beat = beat 0) ----
                if notif.is_warmup_transition {
                    let mut s = state.lock().unwrap();
                    // Spent: this beat IS beat 0 of the real thing. Cleared
                    // rather than counted up to, so nothing counts in again
                    // until something arms it.
                    s.count_in.beats = 0;
                    s.count_in.done = 0;
                    let sc = s.clone();
                    drop(s);
                    let _ = app_handle.emit("state-changed", &sc);
                    pending_ramp_advance = false;
                    // Fall through to emit beat event for beat 0
                }

                // A SONG'S COUNT-IN.
                //
                // The click sounds and the screen sees it — somebody counting
                // you in is something to watch — and that is all it does. No
                // `beat_log`: that queue is where `TimingAnalyzer` learns
                // where a beat fell, so a count-in beat in it is an expected
                // onset the player is marked down for not playing, four times
                // at the top of every session. And no ramp bookkeeping, for
                // the same reason a warmup beat skips it: the count is not a
                // bar of anything.
                //
                // Told apart from "no song at all" by the bar, not a flag; see
                // `song::COUNT_IN_BAR`.
                let song_counting_in = notif.song_bar == crate::song::COUNT_IN_BAR;

                // ---- Emit beat event ----
                // Sleep for the output latency so the visual fires when the
                // audio actually reaches the speakers, not when the callback
                // writes samples into the buffer.
                thread::sleep(Duration::from_micros(notif.delay_us));
                let _ = app_handle.emit(
                    "beat",
                    &BeatEvent {
                        beat: notif.beat,
                        measure_beat: notif.measure_beat,
                        subdivision: notif.subdivision,
                        is_downbeat: notif.is_downbeat,
                        accent: notif.accent,
                        // Derived here and nowhere else, so the two fields on
                        // the wire cannot drift: `isAccent` has always meant
                        // "was this tick accented at all".
                        is_accent: notif.accent > 0,
                        form_bar: notif.jam_bar,
                        chorus: notif.jam_chorus,
                        band_state: notif.jam_band_state,
                        // `null` for both sentinels — no song, and a song that
                        // has not started — and the boolean beside it says
                        // which. Derived here and nowhere else, so the wire
                        // cannot disagree with itself.
                        song_bar: match notif.song_bar {
                            crate::song::NO_SONG_BAR | crate::song::COUNT_IN_BAR => None,
                            bar => Some(bar),
                        },
                        song_tick: notif.song_tick,
                        song_pass: notif.song_pass,
                        song_count_in: song_counting_in,
                    },
                );
                if song_counting_in {
                    continue;
                }

                // ---- Log BeatTick (Path B — every tick, not just downbeats) ----
                //
                // Pre-Path-B this gate emitted only `is_downbeat` ticks,
                // which meant the matcher only ever saw quarter notes —
                // even when the user had selected 8ths / 16ths and was
                // playing on them. Every off-beat onset then counted as
                // spurious (see session 1779004784: 80 BPM 16ths, 303
                // spurious onsets, score crashed to 28/100). Path B
                // pushes every tick AND tags it with `subdivision_index`
                // / `subdivision_total` so the matcher's
                // `RhythmInference` can pick the actual grid the user
                // is playing and score against THAT.
                if let Ok(mut log) = beat_log.lock() {
                    log.push_back(BeatTick {
                        ts_ns: notif.ts_ns,
                        beat_index: notif.beat,
                        is_downbeat: notif.is_downbeat,
                        expected_interval_ms: notif.expected_interval_ms,
                        subdivision_index: notif.subdivision.min(255) as u8,
                        subdivision_total: notif.subdivision_total.max(1),
                        beats_per_bar: notif.beats_per_bar.max(1),
                    });
                    // 64 quarters worth of ticks = up to 64 × 6 = 384
                    // entries at the highest configured subdivision.
                    // Bump the cap so a brief stall in the matcher
                    // loop doesn't lose subdivision-tick coverage.
                    while log.len() > 384 {
                        log.pop_front();
                    }
                }

                // ---- Ramp advance (process pending BEFORE checking bar completion) ----
                if notif.is_downbeat && pending_ramp_advance {
                    pending_ramp_advance = false;
                    let should_advance = {
                        let s = state.lock().unwrap();
                        s.speed_ramp.active && !s.speed_ramp.completed
                    };
                    if should_advance {
                        let mut s = state.lock().unwrap();
                        s.speed_ramp.bars_in_step += 1;

                        if s.speed_ramp.bars_in_step >= s.speed_ramp.bars_per_step {
                            s.speed_ramp.bars_in_step = 0;

                            if s.speed_ramp.mode == "adaptive" {
                                let score = adaptive_score.load(Ordering::Relaxed);
                                let (up_thresh, down_thresh, step_up, step_down) =
                                    adaptive_thresholds(
                                        &s.speed_ramp.aggressiveness,
                                        s.speed_ramp.increment,
                                        s.speed_ramp.decrement,
                                    );

                                // T07 — the direction is ALWAYS the engine's
                                // own threshold decision. The coach model
                                // used to be able to override this via an
                                // atomic; it can now only comment on the
                                // move after the fact.
                                let direction = adaptive_direction(score, up_thresh, down_thresh);

                                let prev_bpm = s.speed_ramp.current_bpm;
                                let target = s.speed_ramp.target_bpm;
                                let no_ceiling = target >= 300;
                                let mut completed = false;

                                if direction == "up" {
                                    let new_bpm =
                                        s.speed_ramp.current_bpm.saturating_add(step_up).min(300);
                                    if !no_ceiling && new_bpm >= target {
                                        s.speed_ramp.current_bpm = target;
                                        s.speed_ramp.completed = true;
                                        s.speed_ramp.active = false;
                                        s.is_playing = false;
                                        completed = true;
                                    } else {
                                        s.speed_ramp.current_bpm = new_bpm;
                                        s.speed_ramp.current_step += 1;
                                    }
                                    if let Ok(mut c) = pending_chime.lock() {
                                        *c = Some(SoundId::ChimeUp);
                                    }
                                } else if direction == "down" && prev_bpm > s.speed_ramp.start_bpm {
                                    let new_bpm = s
                                        .speed_ramp
                                        .current_bpm
                                        .saturating_sub(step_down)
                                        .max(s.speed_ramp.start_bpm);
                                    s.speed_ramp.current_bpm = new_bpm;
                                    s.speed_ramp.current_step += 1;
                                    if new_bpm < prev_bpm {
                                        if let Ok(mut c) = pending_chime.lock() {
                                            *c = Some(SoundId::ChimeDown);
                                        }
                                    }
                                }
                                // else: hold — no BPM change

                                // Emit events
                                let rc = s.speed_ramp.clone();
                                // Report the EFFECTIVE move, not the raw
                                // threshold direction: "down" at the start
                                // BPM (or "up" already clamped at 300)
                                // leaves the tempo where it was, and the
                                // coach must not narrate a step that never
                                // happened.
                                let new_bpm = s.speed_ramp.current_bpm;
                                let effective = if new_bpm > prev_bpm {
                                    "up"
                                } else if new_bpm < prev_bpm {
                                    "down"
                                } else {
                                    "hold"
                                };
                                let eval_req = AdaptiveEvalRequest {
                                    current_bpm: prev_bpm,
                                    new_bpm,
                                    start_bpm: s.speed_ramp.start_bpm,
                                    target_bpm: s.speed_ramp.target_bpm,
                                    accuracy_pct: score,
                                    aggressiveness: s.speed_ramp.aggressiveness.clone(),
                                    current_step: s.speed_ramp.current_step,
                                    decision: effective.to_string(),
                                };
                                let sc = s.clone();
                                drop(s);
                                if completed {
                                    playing.store(false, Ordering::SeqCst);
                                }
                                let _ = app_handle.emit("ramp-step", &rc);
                                let _ = app_handle.emit("state-changed", &sc);
                                // Ask the model for the next decision (non-blocking)
                                if !completed {
                                    let _ = app_handle.emit("adaptive-eval", &eval_req);
                                }
                            } else {
                                let prev_bpm = s.speed_ramp.current_bpm;
                                let (new_bpm, new_dir, done) = advance_ramp(
                                    s.speed_ramp.current_bpm,
                                    &s.speed_ramp.direction,
                                    s.speed_ramp.start_bpm,
                                    s.speed_ramp.target_bpm,
                                    s.speed_ramp.increment,
                                    s.speed_ramp.decrement,
                                    &s.speed_ramp.mode,
                                    s.speed_ramp.cyclic,
                                );

                                if done && new_bpm == s.speed_ramp.current_bpm {
                                    // Already at target — truly done
                                    s.speed_ramp.completed = true;
                                    s.speed_ramp.active = false;
                                    s.is_playing = false;
                                    let sc = s.clone();
                                    let rc = s.speed_ramp.clone();
                                    drop(s);
                                    playing.store(false, Ordering::SeqCst);
                                    let _ = app_handle.emit("ramp-step", &rc);
                                    let _ = app_handle.emit("state-changed", &sc);
                                } else {
                                    // Advance step (even if done — play target step first)
                                    s.speed_ramp.current_step += 1;
                                    s.speed_ramp.current_bpm = new_bpm;
                                    s.speed_ramp.direction = new_dir;
                                    let rc = s.speed_ramp.clone();
                                    let sc = s.clone();
                                    drop(s);

                                    // Queue directional chime
                                    let chime = if new_bpm < prev_bpm {
                                        SoundId::ChimeDown
                                    } else {
                                        SoundId::ChimeUp
                                    };
                                    if let Ok(mut c) = pending_chime.lock() {
                                        *c = Some(chime);
                                    }

                                    let _ = app_handle.emit("ramp-step", &rc);
                                    let _ = app_handle.emit("state-changed", &sc);
                                }
                            }
                        } else {
                            let sc = s.clone();
                            drop(s);
                            let _ = app_handle.emit("state-changed", &sc);
                        }
                    }
                }

                // Mark bar completion for deferred advance on the next bar's first beat
                if notif.bar_just_completed {
                    pending_ramp_advance = true;
                }
            }

            // Stream is dropped here, stopping audio
            drop(stream);
        });

        self.thread_handle = Some(handle);

        let timeout = match wait {
            // Nothing to wait for. `setup_rx` drops here; the thread's send
            // then fails harmlessly and it reports the outcome to the UI
            // itself through `AudioThreadExit`.
            SetupWait::No => return Ok(()),
            SetupWait::UpTo(d) => d,
        };

        // Wait for the thread to say whether it got a stream. Only the
        // headless path does this: `click-jitter-probe` has no UI to correct
        // afterwards and must not start measuring a stream that never opened.
        match setup_rx.recv_timeout(timeout) {
            Ok(Ok(())) => Ok(()),
            Ok(Err(e)) => Err(e),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                Err("audio output device did not respond".to_string())
            }
            // The thread is gone without a word; `AudioThreadExit` has
            // already lowered the flags, so the next Play tries again.
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                Err("audio thread stopped unexpectedly".to_string())
            }
        }
    }

    /// Start playing. Returns as soon as the audio thread is on its way —
    /// it does **not** wait for the output device, because this is reached
    /// from a synchronous Tauri command and waiting there freezes the window
    /// for exactly as long as the device takes (see `AUDIO_SETUP_TIMEOUT`).
    ///
    /// A device that will not open is not silently swallowed: the audio
    /// thread puts the transport back and emits `audio-error` plus a truthful
    /// `state-changed` from `AudioThreadExit::fail`, which is what the UI
    /// actually renders. `Ok` therefore means "the engine is trying", not
    /// "sound is coming out".
    pub fn start(&mut self, state: SharedState, app_handle: AppHandle) -> Result<(), String> {
        // Before the spawn, not after: the thread can fail and lower this at
        // any moment once `ensure_thread` returns, and a raise running after
        // that correction would put the engine back to claiming playback.
        self.playing.store(true, Ordering::SeqCst);
        self.ensure_thread(state, Some(app_handle), SetupWait::No)
    }

    /// Start the engine with no Tauri application attached — the audio path
    /// and the event loop run exactly as they do in the app, but UI events
    /// go nowhere. Only `click-jitter-probe` uses this.
    ///
    /// Unlike `start` this *does* wait for the setup verdict: there is no UI
    /// to correct after the fact, and the probe must not begin timing a
    /// stream that never opened. `Err` means no sound is coming out.
    pub fn start_headless(&mut self, state: SharedState) -> Result<(), String> {
        self.ensure_thread(state, None, SetupWait::UpTo(AUDIO_SETUP_TIMEOUT))?;
        self.playing.store(true, Ordering::SeqCst);
        Ok(())
    }

    pub fn stop(&mut self) {
        self.playing.store(false, Ordering::SeqCst);
    }

    /// Fully stop playback and tear down the audio thread.
    pub fn shutdown(&mut self) {
        self.playing.store(false, Ordering::SeqCst);
        self.alive.store(false, Ordering::SeqCst);
        // No stream, so no width. Cleared here rather than left behind, so
        // nothing decides a pair fits a stream that is gone.
        self.stream_channels.store(0, Ordering::Release);
        // A line of coaching in flight was decoded for THIS device's rate
        // and is half-spoken. Take it back rather than let the next stream
        // replay it from the top at the wrong speed; the speaking thread
        // reports `Interrupted`, which is what a device change is.
        self.speech.cut();
        if let Some(handle) = self.thread_handle.take() {
            // The event loop sleeps in `park_timeout` between beats now, so
            // it is woken rather than waited out: without this the join
            // costs up to the 50 ms backstop on every device change.
            handle.thread().unpark();
            let _ = handle.join();
        }
    }

    pub fn is_running(&self) -> bool {
        self.playing.load(Ordering::SeqCst)
    }
}

impl Drop for MetronomeEngine {
    fn drop(&mut self) {
        self.playing.store(false, Ordering::SeqCst);
        self.alive.store(false, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            // See `shutdown`: the loop is asleep in `park_timeout` and is
            // woken rather than waited out.
            handle.thread().unpark();
            let _ = handle.join();
        }
    }
}

#[cfg(test)]
mod tests {

    // ─── Accents ─────────────────────────────────────────────────────────

    /// "none" silences the accent everywhere, including the case that has
    /// its own rule — a running ramp.
    #[test]
    fn accent_none_means_none() {
        for ramp in [false, true] {
            for beat in 0..8u32 {
                assert_eq!(
                    accent_for(
                        AccentMode::None,
                        ramp,
                        4,
                        accent_mask(&[3, 2, 2]),
                        true,
                        beat,
                        beat
                    ),
                    AccentLevel::None,
                    "ramp={ramp} beat={beat}"
                );
            }
        }
    }

    /// "all" accents every beat of the bar, whatever the grouping says —
    /// and every one of them STRONG. This is the mode for players who want a
    /// flat pulse and to feel the bar themselves, so the tier must not reach
    /// it: "every beat" that quietly made five of seven beats a middle accent
    /// would be a shape, which is the thing this mode exists to remove.
    #[test]
    fn accent_all_means_every_beat_and_all_of_them_strong() {
        let mask = accent_mask(&[3, 2, 2]);
        for beat in 0..7u32 {
            assert_eq!(
                accent_for(AccentMode::All, false, 4, mask, true, beat, beat),
                AccentLevel::Strong,
                "beat {beat}"
            );
        }
        // Still only on the beat itself — a subdivision tick is not a beat.
        assert_eq!(
            accent_for(AccentMode::All, false, 4, mask, false, 0, 0),
            AccentLevel::None
        );
    }

    /// "all" reaches the case that overrides the grouping, because a player
    /// who asked for every beat means every beat.
    #[test]
    fn accent_all_overrides_the_ramp() {
        assert_eq!(
            accent_for(AccentMode::All, true, 4, 0, true, 3, 3),
            AccentLevel::Strong,
            "mid-ramp"
        );
    }

    /// The default accents the same beats it always did — and now says how
    /// hard. 3+2+2 opens three groups; the first of them is the bar's.
    #[test]
    fn accent_groups_marks_the_bar_strong_and_its_middles_medium() {
        let mask = accent_mask(&[3, 2, 2]);
        for beat in 0..7u32 {
            let expected = match beat {
                0 => AccentLevel::Strong,
                3 | 5 => AccentLevel::Medium,
                _ => AccentLevel::None,
            };
            assert_eq!(
                accent_for(AccentMode::Groups, false, 4, mask, true, beat, beat),
                expected,
                "beat {beat} of 3+2+2"
            );
        }
    }

    /// The meters issue 52 is actually about, one assertion each.
    ///
    /// 6/8 as 3+3 is the reporter's bar: two accents, and until this tier
    /// they were the same accent, which is why a bar of it was two bars of
    /// 3/4. 6/8 as 2+2+2 is the duple feel the reporter may have meant —
    /// three group starts, one bar. 3/4 has no middle to mark and must not
    /// grow one; 12/8 has three of them.
    #[test]
    fn a_bar_of_six_eight_finally_has_a_middle() {
        let level = |groups: &[u8], beat: u32| {
            accent_for(
                AccentMode::Groups,
                false,
                4,
                accent_mask(groups),
                true,
                beat,
                beat,
            )
        };
        use AccentLevel::{Medium, None as Flat, Strong};

        // 3/4 — one group, one accent, no change of any kind.
        assert_eq!(
            (0..3).map(|b| level(&[3], b)).collect::<Vec<_>>(),
            vec![Strong, Flat, Flat]
        );
        // 6/8 as 3+3 — THE BUG REPORT. Beat four is now a middle, not a
        // second downbeat.
        assert_eq!(
            (0..6).map(|b| level(&[3, 3], b)).collect::<Vec<_>>(),
            vec![Strong, Flat, Flat, Medium, Flat, Flat]
        );
        // 6/8 as 2+2+2 — the duple feel, reachable from the meter row.
        assert_eq!(
            (0..6).map(|b| level(&[2, 2, 2], b)).collect::<Vec<_>>(),
            vec![Strong, Flat, Medium, Flat, Medium, Flat]
        );
        // 7/8 as 3+2+2.
        assert_eq!(
            (0..7).map(|b| level(&[3, 2, 2], b)).collect::<Vec<_>>(),
            vec![Strong, Flat, Flat, Medium, Flat, Medium, Flat]
        );
        // 12/8 — four groups, three middles.
        assert_eq!(
            (0..12).map(|b| level(&[3, 3, 3, 3], b)).collect::<Vec<_>>(),
            vec![
                Strong, Flat, Flat, Medium, Flat, Flat, Medium, Flat, Flat, Medium, Flat, Flat
            ]
        );
    }

    /// Exactly one beat in a bar may be Strong, in every meter the app can
    /// reach and under every mode but "every beat". A bar with two strong
    /// beats is the bug this whole tier exists to fix, so it is asserted
    /// over the fixture list rather than over the two meters that inspired
    /// it.
    #[test]
    fn a_bar_has_exactly_one_strong_beat() {
        for groups in ALL_METERS {
            let mask = accent_mask(groups);
            let total: u32 = groups.iter().map(|&g| g as u32).sum();
            let strong = (0..total)
                .filter(|&b| {
                    accent_for(AccentMode::Groups, false, 4, mask, true, b, b)
                        == AccentLevel::Strong
                })
                .collect::<Vec<_>>();
            assert_eq!(strong, vec![0], "groups {groups:?}");
        }
    }

    /// The level and the old bit agree about WHERE, so nothing that only
    /// asks "was this accented" changed behaviour when the tier arrived.
    /// `BeatEvent.isAccent` is that question, still on the wire.
    #[test]
    fn a_middle_accent_is_still_an_accent() {
        for groups in ALL_METERS {
            let mask = accent_mask(groups);
            let total: u32 = groups.iter().map(|&g| g as u32).sum();
            for beat in 0..total {
                let level = accent_for(AccentMode::Groups, false, 4, mask, true, beat, beat);
                assert_eq!(
                    level.is_accent(),
                    mask_has_accent(mask, beat),
                    "groups {groups:?}, beat {beat}"
                );
            }
        }
    }

    /// ONE REPORT PER TICK, IN ORDER, AND THE TIER CHANGES NEITHER.
    ///
    /// `BeatNotification` is what feeds `beat_log`, and `beat_log` is the
    /// TimingAnalyzer's only source of beat positions — a notification
    /// dropped or reordered is a session that scores against the wrong grid.
    /// The callback sends one unconditionally at the end of every tick and
    /// this pass did not touch that line, so what is asserted here is the
    /// thing that DID change: the accent the tick reports.
    ///
    /// A bar of 6/8 in triplets, tick by tick as the callback walks it.
    /// Eighteen ticks, six of them beats, two of those accented — and the
    /// twelve ticks between the beats report nothing, which is the rule a
    /// third tier could most easily have broken.
    #[test]
    fn a_bar_reports_one_accent_level_per_tick_and_in_order() {
        let groups = [3u8, 3];
        let mask = accent_mask(&groups);
        let subdivision = 3u32;
        let beats = 6u32;

        let mut reported = Vec::new();
        for beat in 0..beats {
            for sub in 0..subdivision {
                // The callback's own two lines: `is_downbeat` is "this tick
                // is on the beat", and the level is asked once per tick.
                let is_downbeat = sub == 0;
                reported.push(
                    accent_for(AccentMode::Groups, false, 4, mask, is_downbeat, beat, beat) as u8,
                );
            }
        }

        assert_eq!(
            reported.len() as u32,
            beats * subdivision,
            "one report per tick, no more and no fewer"
        );
        assert_eq!(
            reported,
            vec![
                2, 0, 0, // one
                0, 0, 0, // two
                0, 0, 0, // three
                1, 0, 0, // FOUR — the middle of the bar
                0, 0, 0, // five
                0, 0, 0, // six
            ]
        );
    }

    /// The wire, as the frontend reads it. `accentLevel` is the number and
    /// `isAccent` is the old question about it, and `src/types.ts` says the
    /// same thing in TypeScript.
    #[test]
    fn a_beat_event_carries_the_level_and_the_old_bit() {
        let event = |accent: u8| {
            let e = BeatEvent {
                beat: 0,
                measure_beat: 0,
                subdivision: 0,
                is_downbeat: true,
                accent,
                is_accent: accent > 0,
                form_bar: 0,
                chorus: 1,
                band_state: JamBandState::Full,
                song_bar: None,
                song_tick: 0,
                song_pass: 0,
                song_count_in: false,
            };
            serde_json::to_value(&e).expect("a beat event serialises")
        };
        for (accent, expected_bit) in [(0u8, false), (1, true), (2, true)] {
            let v = event(accent);
            assert_eq!(v["accentLevel"], serde_json::json!(accent));
            assert_eq!(v["isAccent"], serde_json::json!(expected_bit));
        }
        // And with no song, the song fields are the contract's "there is no
        // song": a null bar, nothing else set.
        let v = event(0);
        assert_eq!(v["songBar"], serde_json::json!(null));
        assert_eq!(v["songTick"], serde_json::json!(0));
        assert_eq!(v["songPass"], serde_json::json!(0));
        assert_eq!(v["songCountIn"], serde_json::json!(false));
    }

    /// The wire while a SONG plays, and the difference between the two
    /// reasons `songBar` can be null.
    #[test]
    fn a_beat_event_says_where_in_the_song_it_is() {
        let of = |bar: u32| {
            let count_in = bar == crate::song::COUNT_IN_BAR;
            let e = BeatEvent {
                beat: 3,
                measure_beat: 3,
                subdivision: 0,
                is_downbeat: true,
                accent: 0,
                is_accent: false,
                form_bar: 0,
                chorus: 1,
                band_state: JamBandState::Full,
                song_bar: match bar {
                    crate::song::NO_SONG_BAR | crate::song::COUNT_IN_BAR => None,
                    b => Some(b),
                },
                song_tick: 2880,
                song_pass: 2,
                song_count_in: count_in,
            };
            serde_json::to_value(&e).expect("a beat event serialises")
        };
        let playing = of(17);
        assert_eq!(playing["songBar"], serde_json::json!(17));
        assert_eq!(playing["songTick"], serde_json::json!(2880));
        assert_eq!(playing["songPass"], serde_json::json!(2));
        assert_eq!(playing["songCountIn"], serde_json::json!(false));

        let counting = of(crate::song::COUNT_IN_BAR);
        assert_eq!(counting["songBar"], serde_json::json!(null));
        assert_eq!(
            counting["songCountIn"],
            serde_json::json!(true),
            "a song that has not started is not the same as no song"
        );

        let none = of(crate::song::NO_SONG_BAR);
        assert_eq!(none["songBar"], serde_json::json!(null));
        assert_eq!(none["songCountIn"], serde_json::json!(false));
    }

    /// The gains, in the order the ear has to hear them. `Strong` is 1.0
    /// because an accent always played at 1.0 and this tier did not make the
    /// downbeat quieter — it made a second, lighter one.
    ///
    /// AND MEDIUM IS 1.0 TOO, WHICH IS THE POINT AND NOT A HOLE IN THIS TEST.
    /// A middle accent was the downbeat's own file at 0.80 and the owner
    /// heard nothing; it is a different file now and the level lives in that
    /// file's peak and in how the stroke was cut. So the loudness order this
    /// test is named for cannot be checked here any more — it is checked
    /// where it now lives, on
    /// `every_medium_accent_sits_between_its_strong_and_its_beat`, against
    /// the actual buffers and through the band a laptop radiates. What is
    /// still true here is that neither accent is attenuated and that both
    /// stand over the plain beat, which is what these three constants say.
    #[test]
    fn the_three_tiers_come_in_loudness_order() {
        assert_eq!(AccentLevel::Strong.gain(), 1.0);
        assert_eq!(AccentLevel::Medium.gain(), MEDIUM_GAIN);
        assert!(AccentLevel::Medium.gain() > BEAT_GAIN);
        assert!(AccentLevel::Medium.gain() <= AccentLevel::Strong.gain());
        assert_eq!(AccentLevel::None.gain(), 0.0);
        // And the numbers the frontend reads, which sort the same way.
        assert_eq!(AccentLevel::None as u8, 0);
        assert_eq!(AccentLevel::Medium as u8, 1);
        assert_eq!(AccentLevel::Strong as u8, 2);
    }

    /// Every kit answers a middle stroke, and it is nobody else's file.
    ///
    /// The cheapest possible guard against the mistake this whole pass was
    /// written to undo: a `mid_id` arm copied from `high_id` and not edited
    /// would rebuild the bug — a bar whose middle is its downbeat — and
    /// nothing else here would notice, because the buffers would measure
    /// perfectly in order with each other.
    #[test]
    fn every_kit_has_a_middle_of_its_own() {
        for (name, kit) in SoundKit::ALL {
            assert!(
                kit.mid_id() != kit.high_id(),
                "{name}'s middle is its downbeat's file again"
            );
            assert!(
                kit.mid_id() != kit.low_id(),
                "{name}'s middle is its plain beat's file"
            );
        }
        // And the kit a store cannot name — `from_str` falls through to Click
        // so that a bar out of a newer build still has three levels.
        assert!(SoundKit::from_str("no such kit").mid_id() == SoundId::ClickMid);
    }

    #[test]
    fn accent_mode_parses_and_falls_back() {
        assert!(AccentMode::from_str("all") == AccentMode::All);
        assert!(AccentMode::from_str("none") == AccentMode::None);
        assert!(AccentMode::from_str("groups") == AccentMode::Groups);
        // Anything else sounds ordinary rather than erroring — it crosses from
        // the frontend as a string.
        assert!(AccentMode::from_str("") == AccentMode::Groups);
        assert!(AccentMode::from_str("every-other-tuesday") == AccentMode::Groups);
    }

    // ─── The count-in ────────────────────────────────────────────────────

    /// It used to be gated on `speed_ramp.active`, so only a drill could have
    /// one. These lock the new contract: armed by whoever wants it, resting at
    /// zero, and never left armed by a stop.
    #[test]
    fn a_count_in_rests_disarmed() {
        let c = crate::state::CountIn::default();
        assert_eq!(c.beats, 0, "a fresh state must not count anything in");
        assert!(
            c.done >= c.beats,
            "with no beats armed the engine must read this as not counting in"
        );
    }

    #[test]
    fn a_count_in_is_over_when_it_has_been_counted() {
        // The engine's test is `done < beats`; walk it.
        let mut c = crate::state::CountIn { beats: 4, done: 0 };
        for expected in [true, true, true, true] {
            assert_eq!(c.done < c.beats, expected, "at done={}", c.done);
            c.done += 1;
        }
        assert!(!(c.done < c.beats), "four of four beats must end it");
    }

    #[test]
    fn a_ramp_seeds_its_count_in_from_its_own_setting() {
        // The drill still owns *whether* to count in; the engine owns the
        // counting. Both must agree at the moment a ramp starts.
        let ramp = crate::state::SpeedRamp::default();
        let seeded = crate::state::CountIn {
            beats: ramp.warmup_beats,
            done: 0,
        };
        assert_eq!(seeded.beats, ramp.warmup_beats);
        assert_eq!(seeded.done, 0, "a restarted ramp counts in from the top");
    }

    #[test]
    fn count_in_off_means_off() {
        // `warmupBeats: 0` is how the drill's Count-in switch says no. It has
        // to survive being copied into the engine's count-in as "not armed",
        // or turning the switch off would silently do nothing.
        let ramp = crate::state::SpeedRamp {
            warmup_beats: 0,
            ..Default::default()
        };
        let seeded = crate::state::CountIn {
            beats: ramp.warmup_beats,
            done: 0,
        };
        assert!(!(seeded.done < seeded.beats), "0 beats must not count in");
    }

    // ─── Sound bank ──────────────────────────────────────────────────────

    // -----------------------------------------------------------------
    // The pair of outputs the app plays on
    // -----------------------------------------------------------------
    //
    // The machine these run on has two outputs and a laptop speaker. What
    // they prove is the arithmetic and the routing — that the pair lands
    // where it should, that the other outputs stay silent, that a stream
    // too narrow for the pair falls back rather than panics, and that the
    // take reads back the channel the click was written to. What they
    // cannot prove is that a real four-output interface exposes all four
    // in one device and opens them at one rate; only the interface can
    // say that.

    #[test]
    fn a_pair_needs_two_outputs_for_itself_and_two_for_every_pair_below_it() {
        assert_eq!(outputs_needed(0), 2, "Outputs 1-2");
        assert_eq!(outputs_needed(1), 4, "Outputs 3-4");
        assert_eq!(outputs_needed(2), 6, "Outputs 5-6");
    }

    #[test]
    fn a_pair_fits_only_a_buffer_wide_enough_to_hold_it() {
        assert!(pair_fits(0, 2));
        assert!(!pair_fits(0, 1), "a mono device holds no pair");
        assert!(!pair_fits(1, 2), "outputs 3-4 do not fit a stereo stream");
        assert!(pair_fits(1, 4));
        assert!(pair_fits(1, 6));
        assert!(!pair_fits(2, 4));
        assert!(pair_fits(2, 6));
    }

    #[test]
    fn a_pair_the_stream_cannot_hold_becomes_the_first_pair() {
        assert_eq!(effective_pair(1, 4), 1, "a pair that fits is left alone");
        assert_eq!(
            effective_pair(1, 2),
            0,
            "a device that delivered two outputs plays on 1-2, not off the end"
        );
        assert_eq!(effective_pair(7, 8), 0);
        assert_eq!(effective_pair(3, 8), 3);
    }

    #[test]
    fn the_click_lands_on_the_chosen_pair_and_nowhere_else() {
        // Six outputs, three frames, the click on 5-6.
        let mut data = vec![9.0f32; 6 * 3];
        for f in 0..3 {
            write_pair(&mut data, f * 6, 6, 2, 0.5, -0.5);
        }
        for f in 0..3 {
            let frame = &data[f * 6..f * 6 + 6];
            assert_eq!(
                &frame[..4],
                &[0.0, 0.0, 0.0, 0.0],
                "outputs 1-4 must be left silent"
            );
            assert_eq!(frame[4], 0.5, "left of the pair");
            assert_eq!(frame[5], -0.5, "right of the pair");
        }
    }

    #[test]
    fn every_pair_of_a_four_output_interface_gets_the_click() {
        for pair in 0..2usize {
            let mut data = vec![0.0f32; 4 * 2];
            for f in 0..2 {
                write_pair(&mut data, f * 4, 4, pair, 1.0, -1.0);
            }
            for f in 0..2 {
                for ch in 0..4 {
                    let want = if ch == 2 * pair {
                        1.0
                    } else if ch == 2 * pair + 1 {
                        -1.0
                    } else {
                        0.0
                    };
                    assert_eq!(
                        data[f * 4 + ch],
                        want,
                        "pair {pair}, frame {f}, output {}",
                        ch + 1
                    );
                }
            }
        }
    }

    #[test]
    fn a_stereo_device_is_written_the_way_it_always_was() {
        // The default case, and the one every existing user is on: pair 0
        // on two outputs is L then R, frame after frame.
        let mut data = vec![0.0f32; 2 * 3];
        for f in 0..3 {
            write_pair(&mut data, f * 2, 2, 0, 0.25, 0.75);
        }
        assert_eq!(data, vec![0.25, 0.75, 0.25, 0.75, 0.25, 0.75]);
    }

    #[test]
    fn a_widened_buffer_holds_as_many_frames_as_the_callback_writes() {
        // The trap `audio_input.rs` documents: divide a buffer by the wrong
        // channel count and the cursor advances at the wrong speed. This
        // runs the real mix write over a whole six-output buffer with a
        // signal that says which frame it came from, then counts the frames
        // back out of what was written — so a write that strode wrong, or a
        // frame count that disagreed with the stream's width, shows up as a
        // missing or misplaced sample rather than as arithmetic agreeing
        // with itself.
        const CHANNELS: usize = 6;
        const FRAMES: usize = 128;
        let mut data = vec![-1.0f32; CHANNELS * FRAMES];
        let frames = data.len() / CHANNELS;
        assert_eq!(frames, FRAMES);
        for f in 0..frames {
            // A ramp, so every frame is distinguishable from its neighbours.
            let v = f as f32 / FRAMES as f32;
            write_pair(&mut data, f * CHANNELS, CHANNELS, 2, v, -v);
        }
        // Read it back the way the take recorder does, off the pair's left.
        let recovered: Vec<f32> = data
            .iter()
            .skip(take_offset(CHANNELS, 2))
            .step_by(CHANNELS)
            .copied()
            .collect();
        assert_eq!(recovered.len(), FRAMES, "a frame went missing");
        for (f, &v) in recovered.iter().enumerate() {
            assert_eq!(v, f as f32 / FRAMES as f32, "frame {f} is not its own");
        }
        // ...and nothing was left over from the fill on outputs 1-4.
        for f in 0..frames {
            for ch in 0..4 {
                assert_eq!(data[f * CHANNELS + ch], 0.0, "output {} spoke", ch + 1);
            }
        }
    }

    #[test]
    fn the_config_search_takes_the_narrowest_stream_that_carries_the_pair() {
        // A device offering 2, 4 and 8 outputs at 48 kHz, asked for 3-4.
        let offered = [(2u16, 44_100u32, 48_000u32), (4, 44_100, 48_000), (8, 48_000, 48_000)];
        assert_eq!(
            channels_for_pair(1, 2, 48_000, offered.iter().copied()),
            Some(4),
            "eight outputs would be opened to use two of them"
        );
    }

    #[test]
    fn the_config_search_will_not_change_the_rate_to_get_the_pair() {
        // The wide config is 96 kHz only, and the device is running at 48.
        // Taking it would mean every sound in the bank decoded against the
        // wrong clock.
        let offered = [(2u16, 48_000u32, 48_000u32), (8, 96_000, 96_000)];
        assert_eq!(channels_for_pair(1, 2, 48_000, offered.iter().copied()), None);
    }

    #[test]
    fn a_pair_the_default_config_already_carries_needs_no_search() {
        let offered = [(8u16, 48_000u32, 48_000u32)];
        assert_eq!(
            channels_for_pair(1, 4, 48_000, offered.iter().copied()),
            Some(4),
            "the default config already had four outputs"
        );
    }

    #[test]
    fn a_device_with_nothing_wide_enough_falls_back_cleanly() {
        // A laptop. Nothing on offer carries outputs 3-4, and the answer is
        // `None` rather than a panic or a guess — the caller opens the
        // default config and the callback clamps to pair 0.
        let offered = [(2u16, 44_100u32, 48_000u32)];
        assert_eq!(channels_for_pair(1, 2, 48_000, offered.iter().copied()), None);
        assert_eq!(
            effective_pair(1, 2),
            0,
            "and the click is audible on 1-2 rather than silent"
        );
    }

    #[test]
    fn a_take_reads_back_the_pair_the_click_was_written_to() {
        assert_eq!(take_offset(2, 0), 0);
        assert_eq!(take_offset(4, 1), 2, "outputs 3-4 live at index 2");
        assert_eq!(take_offset(6, 2), 4);
        assert_eq!(take_offset(1, 0), 0, "a mono device has one channel");
    }

    #[test]
    fn a_take_on_outputs_three_and_four_is_not_silence() {
        // Write a click to 3-4 of a four-output buffer, then read it back
        // the way the callback does. Channel 0 is the silence this write
        // left there, so a take of it would be a take of nothing — which
        // is the bug this offset exists to prevent.
        let frames = 8usize;
        let mut data = vec![0.0f32; 4 * frames];
        for f in 0..frames {
            write_pair(&mut data, f * 4, 4, 1, 0.5, 0.5);
        }
        let ring = crate::take::TakeRing::new(64);
        ring.push_strided_at(&data, 4, take_offset(4, 1));
        let mut out = Vec::new();
        assert_eq!(ring.drain_into(&mut out), frames);
        assert!(
            out.iter().all(|&s| s == 0.5),
            "the take recorded {out:?} instead of the click"
        );

        // ...and the old read, for contrast: channel 0 is silent.
        let ring0 = crate::take::TakeRing::new(64);
        ring0.push_strided(&data, 4);
        let mut out0 = Vec::new();
        ring0.drain_into(&mut out0);
        assert!(out0.iter().all(|&s| s == 0.0));
    }

    #[test]
    fn a_pair_the_open_stream_already_holds_stops_nothing() {
        // The case that matters: four outputs open, asked for 3-4. The
        // callback picks the new pair up on its next buffer, so the click
        // does not miss a beat and the band keeps its bar.
        assert_eq!(pair_action(true, 4, 1), PairAction::StoreOnly);
        assert_eq!(pair_action(true, 8, 3), PairAction::StoreOnly);
        assert_eq!(pair_action(true, 2, 0), PairAction::StoreOnly);
    }

    #[test]
    fn a_pair_wider_than_the_open_stream_reopens_the_device() {
        // The channel count is fixed when a stream is built, so this one
        // has to go.
        assert_eq!(pair_action(true, 2, 1), PairAction::Restart);
        assert_eq!(pair_action(true, 4, 2), PairAction::Restart);
    }

    #[test]
    fn a_pair_chosen_while_the_device_is_still_opening_reopens_it() {
        // The regression: `alive` goes up at the spawn, but the width is
        // published only once the stream is actually running, and the
        // thread read the pair on its way past. Press Play and pick
        // Outputs 3-4 half a second later and the store-only branch would
        // leave the picker saying 3-4 over a stream that opened at its
        // default width — with no fallback to correct it, because nothing
        // was asked for at open time.
        assert_eq!(pair_action(true, 0, 1), PairAction::Restart);
        assert_eq!(
            pair_action(true, 0, 0),
            PairAction::Restart,
            "even outputs 1-2: the thread may have read a WIDER pair on its way up"
        );
    }

    #[test]
    fn a_pair_chosen_with_nothing_running_is_just_remembered() {
        // Nothing to restart, and the next stream to open reads it and
        // goes looking for a config that carries it.
        assert_eq!(pair_action(false, 0, 1), PairAction::StoreOnly);
        assert_eq!(
            pair_action(false, 4, 1),
            PairAction::StoreOnly,
            "a width left behind by a thread that has exited is not a stream"
        );
    }

    #[test]
    fn the_coach_has_nowhere_to_speak_until_a_stream_is_up() {
        // The bug: a rate is published once per stream and never cleared,
        // so an engine whose device opened once and then went away still
        // answered with a slot nothing was reading — and `play_wav_path`
        // waited on it for a completion that could not arrive, with the
        // metronome dimmed behind it.
        let mut engine = MetronomeEngine::new(crate::timing::create_beat_log());
        assert!(
            engine.speech_out().is_none(),
            "nothing has opened a device yet"
        );

        // Pretend a stream ran: a rate and a width, both published.
        engine.sample_rate.store(48_000, Ordering::Release);
        engine.stream_channels.store(4, Ordering::Release);
        engine.alive.store(true, Ordering::SeqCst);
        assert!(engine.speech_out().is_some(), "a live stream is speakable");

        // ...and then the device went away.
        engine.shutdown();
        assert!(
            engine.speech_out().is_none(),
            "the rate is still there, but there is no stream behind it"
        );
    }

    #[test]
    fn a_stream_that_is_still_opening_is_not_a_place_to_speak() {
        let mut engine = MetronomeEngine::new(crate::timing::create_beat_log());
        // What `ensure_thread` leaves behind between the spawn and `ready`:
        // alive up, a rate from the LAST stream, no width yet.
        engine.sample_rate.store(44_100, Ordering::Release);
        engine.stream_channels.store(0, Ordering::Release);
        engine.alive.store(true, Ordering::SeqCst);
        assert!(
            engine.speech_out().is_none(),
            "resampling to the old device's rate is worse than saying no"
        );
    }

    #[test]
    fn waiting_for_a_stream_gives_up_when_nothing_is_coming() {
        // No thread was ever spawned, so there is nothing to wait for and
        // the answer must be immediate rather than the full timeout.
        let engine = MetronomeEngine::new(crate::timing::create_beat_log());
        let slots = engine.speech_slots();
        let started = std::time::Instant::now();
        assert!(slots.wait_for_stream().is_none());
        assert!(
            started.elapsed() < SPEECH_STREAM_WAIT,
            "a dead engine made the coach wait out the whole device timeout"
        );
    }

    #[test]
    fn a_device_change_takes_the_line_in_flight_back() {
        // A line decoded at the old device's rate would play flat or sharp
        // on the new one, and the callback's position resets with the
        // thread — so half of it would be replayed at the wrong speed.
        // `shutdown` cuts it instead, and the speaking thread reports
        // `Interrupted`, which is what a device change is.
        let mut engine = MetronomeEngine::new(crate::timing::create_beat_log());
        let speech = engine.speech.clone();
        speech.set_clip(Some(crate::speech_out::SpeechClip {
            pcm: Arc::new(vec![0.5; 128]),
        }));
        assert!(!speech.was_cut());
        engine.shutdown();
        assert!(speech.was_cut(), "the line was left to replay on the new stream");
        let mut seen = 0u64;
        assert!(
            matches!(speech.poll(&mut seen), Some(None)),
            "and the callback is told to go quiet"
        );
    }

    /// A 44.1 kHz sine, resampled to 48 k, must come out at the same level and
    /// the same frequency. Linear interpolation — what this replaced — loses
    /// height on every peak it lands between, and the loss grows with
    /// frequency, which is exactly where a click's character lives.
    #[test]
    fn resampler_keeps_a_tone_intact() {
        for freq in [440.0f64, 2000.0, 6000.0] {
            let src: Vec<f32> = (0..4410)
                .map(|i| (2.0 * std::f64::consts::PI * freq * i as f64 / 44100.0).sin() as f32)
                .collect();
            let out = resample(&src, 44100, 48000);

            // Ignore the kernel's reach at either end.
            let body = &out[64..out.len() - 64];
            let peak = body.iter().fold(0.0f32, |m, s| m.max(s.abs()));
            assert!(
                (peak - 1.0).abs() < 0.02,
                "{freq} Hz came out at {peak}, expected ~1.0"
            );

            // Zero crossings give the frequency without an FFT.
            let crossings = body.windows(2).filter(|w| w[0] <= 0.0 && w[1] > 0.0).count();
            let expected = freq * body.len() as f64 / 48000.0;
            assert!(
                (crossings as f64 - expected).abs() / expected < 0.02,
                "{freq} Hz: {crossings} crossings, expected about {expected:.0}"
            );
        }
    }

    /// Downsampling must band-limit to the new Nyquist. Without the cutoff
    /// term this aliases: content above the target's Nyquist folds back down
    /// and lands somewhere audible.
    #[test]
    fn resampler_does_not_alias_when_going_down() {
        // 18 kHz has nowhere to go at 24 kHz output — it must be filtered out,
        // not folded to 6 kHz.
        let src: Vec<f32> = (0..4410)
            .map(|i| (2.0 * std::f64::consts::PI * 18000.0 * i as f64 / 44100.0).sin() as f32)
            .collect();
        let out = resample(&src, 44100, 24000);
        let body = &out[64..out.len() - 64];
        let rms = (body.iter().map(|s| (s * s) as f64).sum::<f64>() / body.len() as f64).sqrt();
        assert!(rms < 0.1, "18 kHz survived a downsample to 24 kHz at rms {rms}");
    }

    /// Silence in, silence out — the normalisation must not divide by nothing.
    #[test]
    fn resampler_survives_silence_and_emptiness() {
        assert!(resample(&[], 44100, 48000).is_empty());
        let quiet = resample(&vec![0.0f32; 128], 44100, 48000);
        assert!(quiet.iter().all(|s| s.abs() < 1e-6));
    }

    /// The drum accent is four samples summed. Unscaled they peak at about
    /// 1.68, so every downbeat clipped once the user's volume passed ~0.58.
    #[test]
    fn drum_accent_leaves_headroom() {
        let bank = SoundBank::new(48000);
        for (name, buf) in [
            ("drum accent", &bank.drum_accent),
            ("snare accent", &bank.snare_high),
        ] {
            let peak = buf.iter().fold(0.0f32, |m, s| m.max(s.abs()));
            assert!(peak <= 0.971, "{name} peaks at {peak}, which clips");
            assert!(peak > 0.5, "{name} is suspiciously quiet at {peak}");
        }
        // And the middle of the drum kit's bar, which is the other premix
        // built in `SoundBank::new`.
        //
        // EXACTLY 0.92 AT ANY RATE, where the seven middles that are files are
        // allowed a little over. Those are decoded and then resampled, and a
        // windowed sinc overshoots around a transient; this one is mixed from
        // buffers that have ALREADY been resampled and is normalised
        // afterwards, so the number below is the number, not a window.
        //
        // It was 0.930 until 2026-09-15, when the hat went back into the mix
        // and the level had to come down to pay for it. The two move together
        // and always will: the hat is audible to the band-pass the middle is
        // measured through and the kick is not, so any change to how much
        // cymbal this premix carries is a change to what it may peak at.
        // `SoundBank::new` has the arithmetic.
        let mid_peak = bank.drum_mid.iter().fold(0.0f32, |m, s| m.max(s.abs()));
        assert!(
            (mid_peak - 0.92).abs() < 1e-4,
            "the drum kit's middle peaks at {mid_peak}, not the 0.92 it is set to"
        );
    }

    /// Energy through a 200 Hz–4 kHz band-pass: roughly the band a laptop
    /// speaker actually radiates.
    ///
    /// FOUR cascaded one-pole high-pass sections, not one. That is the whole
    /// difficulty of this measurement and it is worth being explicit about:
    /// the drum kick carries 99.7% of its energy below 120 Hz, so a gentle
    /// 6 dB/octave roll-off still passes enough of it to swamp everything
    /// else and report the accent as louder no matter what. At 24 dB/octave
    /// the sub-bass is genuinely gone, and the number tracks a proper
    /// Butterworth band-pass to within 0.05 dB on these samples.
    ///
    /// Each section needs its OWN state. Scaling a single section's output
    /// four times is a gain, not a filter — the mistake is easy to make and
    /// silently turns this test green.
    fn laptop_band_energy(buf: &[f32], sr: u32) -> f64 {
        const HP: usize = 4;
        const LP: usize = 2;
        let hp_a = 1.0 / (1.0 + 2.0 * std::f64::consts::PI * 200.0 / sr as f64);
        let lp_a = 2.0 * std::f64::consts::PI * 4000.0 / sr as f64;
        let (mut prev_in, mut prev_out, mut lp) = ([0.0f64; HP], [0.0f64; HP], [0.0f64; LP]);
        let mut energy = 0.0f64;
        for &s in buf {
            let mut v = s as f64;
            for k in 0..HP {
                let out = hp_a * (prev_out[k] + v - prev_in[k]);
                prev_in[k] = v;
                prev_out[k] = out;
                v = out;
            }
            for k in 0..LP {
                lp[k] += lp_a * (v - lp[k]);
                v = lp[k];
            }
            energy += v * v;
        }
        energy
    }

    /// Energy above 120 Hz — the band a laptop speaker radiates, for the two
    /// instruments that live below it.
    ///
    /// [`laptop_band_energy`] starts at 200 Hz, and that is right for a drum:
    /// it is what stops the kick's sub-bass from swamping a comparison of
    /// transients. It is WRONG FOR A BASS, and wrong in a way that hid this
    /// whole pass. A bass runs E1 to G3 (41 to 196 Hz), so a 200 Hz corner
    /// measures a bass's harmonics and not one of its fundamentals — and two
    /// basses that agree in their harmonics can be eight decibels apart in
    /// the octave a listener hears the note in. `every_bass_voice_lands_at_
    /// the_same_level` passed for a year on that band while an eight-bar line
    /// measured above 120 Hz put the five voices ten decibels apart
    /// (`plans/tasks/songs/W17-JAM-MIX.md`).
    ///
    /// 120 Hz is the brief's number and it is where a laptop's driver gives
    /// up; the same four cascaded sections, for the same reason they are four
    /// there — at 6 dB an octave the sub-bass is still in the answer.
    ///
    /// No low-pass: this is the band that reaches the ear, all of it, which
    /// is also exactly what `ffmpeg -af highpass=f=120,ebur128` measured when
    /// the trims below were derived. A ceiling here and none there would be
    /// two different numbers wearing one name.
    fn above_120_energy(buf: &[f32], sr: u32) -> f64 {
        const HP: usize = 4;
        let a = 1.0 / (1.0 + 2.0 * std::f64::consts::PI * 120.0 / sr as f64);
        let (mut prev_in, mut prev_out) = ([0.0f64; HP], [0.0f64; HP]);
        let mut energy = 0.0f64;
        for &s in buf {
            let mut v = s as f64;
            for k in 0..HP {
                let out = a * (prev_out[k] + v - prev_in[k]);
                prev_in[k] = v;
                prev_out[k] = out;
                v = out;
            }
            energy += v * v;
        }
        energy
    }

    /// THE ACCENT MUST BE LOUDER ON THE SPEAKER PEOPLE ACTUALLY USE.
    ///
    /// This is the test that was missing. The drum accent measured +7.8 dB
    /// broadband and was shipped as correct, but essentially all of that was
    /// sub-120 Hz kick: band-limited to what a laptop radiates it was 0.5 dB
    /// QUIETER than the plain beat, so on the machine the owner practises on
    /// the downbeat was the quietest thing in the bar. A broadband check
    /// cannot see that, and did not.
    ///
    /// Measured through `laptop_band_energy`: the old drum premix scores
    /// -0.46 dB and fails. Today every kit sits between +3.67 and +4.58 —
    ///
    ///     drum   +3.67      sticks +4.18      kit     +4.36
    ///     snare  +4.01      wood   +4.19      cowbell +4.50
    ///     click  +4.24      beep   +4.58
    ///
    /// — so a 2 dB floor has real room on both sides rather than being fitted
    /// to today's mix. The three recordings added 2026-09-14 were tuned INTO
    /// that spread rather than to the widest margin their sources allowed,
    /// for the reason the next paragraph spends four rejections making.
    ///
    /// NOTE that passing this is not the same as sounding good, and the
    /// snare kit is the proof THREE TIMES OVER. Its first version passed at
    /// +4.89 and was rejected as shy. Its second scored +6.39 — the widest
    /// margin of any kit — and was rejected again, because the margin was
    /// bought by making the plain beat a different instrument from the
    /// accent: a mid tom, whose loudness sat under the 200 Hz this filter
    /// starts at. Its third scored +5.78 with both sounds finally being the
    /// same drum, and was rejected a third time — "the accent is
    /// disproportionally loud and noisy" — because a margin 1.2 dB wider
    /// than the loudest other kit is not an accent, it is a shout. At +4.24
    /// it is in the middle of the pack, which is where it belongs.
    ///
    /// Three rejections, and the score went UP, then down, then down again.
    /// That is the whole lesson of this test: it is a floor, not a target.
    ///
    /// So a ratio says the accent beats its own beat. It does not say either
    /// of them is loud enough to feel — that is
    /// `the_snare_kit_is_not_quieter_than_the_drum_kit` — and it does not say
    /// they belong in the same bar as each other, which no assertion here
    /// checks and which needed the owner's ears both times.
    #[test]
    fn every_accent_is_louder_than_its_beat_on_a_small_speaker() {
        let sr = 48000;
        let bank = SoundBank::new(sr);
        // Every kit the UI offers, named so a failure says which one broke.
        for (name, kit) in SoundKit::ALL {
            let accent = laptop_band_energy(bank.get(kit.high_id()), sr);
            let beat =
                laptop_band_energy(bank.get(kit.low_id()), sr) * (BEAT_GAIN * BEAT_GAIN) as f64;
            let db = 10.0 * (accent / beat.max(1e-30)).log10();
            assert!(
                db > 2.0,
                "{name}: accent is only {db:.2} dB over its beat through a 200 Hz-4 kHz \
                 band-pass. Under about 2 dB it does not read as an accent on a laptop, \
                 which is the speaker that matters."
            );
        }

        // ...and every jam kit, by the same measurement and the same floor.
        //
        // A jam's backbeat is the snare's HARD LAYER at `LEVEL_GAIN[2]` and
        // its ghost the SOFT LAYER at `LEVEL_GAIN[3]`, which since this pass
        // are two different recordings rather than one file at two volumes.
        // The five synthesised kits carry both (`snare_lo` became layer 1
        // and `snare_hi` layer 2), so the claim is the same claim it always
        // was and the arithmetic reaches it through the bank rather than
        // through two `SoundId`s.
        //
        // Layer 1 is deliberately NOT a quieter file: it is the same drum
        // struck softly, at the same 0.900 peak, and the level gain does the
        // rest (rule 4 of KITS.md). A kit that passed this by shipping a
        // quiet file would be the snare kit's mistake all over again.
        for id in crate::kit::shipped_ids() {
            let kit = crate::kit::load_shipped(crate::kit::shipped_index(&id).unwrap(), sr)
                .expect("a shipped kit decodes");
            let layer = |l: u8| {
                let buf = kit.sample(KitVoice::Snare as u8, l, 0);
                let mono: Vec<f32> = (0..buf.len() / 2)
                    .map(|i| (buf[2 * i] + buf[2 * i + 1]) * 0.5)
                    .collect();
                laptop_band_energy(&mono, sr)
            };
            let accent = layer(1) * (crate::jam::LEVEL_GAIN[2] * crate::jam::LEVEL_GAIN[2]) as f64;
            let ghost = layer(0) * (crate::jam::LEVEL_GAIN[3] * crate::jam::LEVEL_GAIN[3]) as f64;
            let db = 10.0 * (accent / ghost.max(1e-30)).log10();
            assert!(
                db > 2.0,
                "{id}: the backbeat is only {db:.2} dB over a ghost through a \
                 200 Hz-4 kHz band-pass, which does not read as an accent on a laptop"
            );
        }
    }

    /// THE MIDDLE OF THE BAR MUST SIT BETWEEN ITS ENDS, ON THE SAME SPEAKER.
    ///
    /// The sibling above says an accent beats its own beat. This says the
    /// tier in between is genuinely in between: a 6/8's beat four louder than
    /// its beat two and quieter than its beat one, through the band a laptop
    /// actually radiates. Measured the same way and for the same reason —
    /// broadband arithmetic said the drum kit's accent was fine when it was
    /// half a decibel quieter than the beat it marked.
    ///
    /// THESE ARE THREE FILES NOW AND WERE ONE FILE AT TWO VOLUMES. The first
    /// version of this tier played the downbeat's own sample at
    /// `MEDIUM_GAIN` = 0.80 and measured a tidy 1.94 dB under it for every
    /// kit; the owner listened and heard nothing, which is the honest answer
    /// about a transient that passes once a bar. `MEDIUM_GAIN` is 1.0 and the
    /// level lives in `<kit>_mid.wav`, so the numbers below are eight
    /// separate cuts rather than one arithmetic identity — which is exactly
    /// why they have to be printed.
    ///
    /// Measured at 48 kHz, each kit against its own beat at `BEAT_GAIN`:
    ///
    ///     kit      strong   middle   beat   strong-mid  mid-beat   K-weighted
    ///     click    +4.24    +2.08    0.00      2.16       2.08     2.34 / 2.15
    ///     sticks   +4.18    +2.16    0.00      2.01       2.16     1.98 / 3.56
    ///     wood     +4.19    +2.10    0.00      2.09       2.10     2.05 / 1.98
    ///     beep     +4.58    +2.30    0.00      2.28       2.30     2.16 / 2.07
    ///     drum     +3.67    +2.08    0.00      1.59       2.08     1.56 / 2.25
    ///     kit      +4.36    +2.30    0.00      2.07       2.30     2.96 / 1.70
    ///     snare    +4.01    +1.95    0.00      2.05       1.95     2.13 / 2.14
    ///     cowbell  +4.20    +2.10    0.00      2.10       2.10     1.88 / 2.56
    ///
    /// The first four columns are dB through the 200 Hz-4 kHz band-pass, each
    /// kit against its own beat, which is why the beat column is zero by
    /// construction. The last is strong-over-middle and middle-over-beat
    /// K-WEIGHTED — a different question, asserted separately below, and the
    /// one that decided which layer of the Studio snare `kit`'s middle is.
    ///
    /// EACH MIDDLE IS AIMED AT THE GEOMETRIC CENTRE OF ITS OWN SPAN, which is
    /// a change of policy from the 0.80 version and is what the third file
    /// buys.
    /// That version gave the bigger share to strong-against-medium, because
    /// the two were the same file and level was the only cue; now they are
    /// different strokes and the ear gets timbre as well on both sides, so
    /// there is no reason left to favour either gap. Equal margins also
    /// maximise the smaller of the two, which is the one that fails first.
    /// Seven of the eight land within 0.1 dB of that centre at the rate the
    /// files ship at. Drum is the exception and misses low: it is the one
    /// preset whose middle and downbeat are both PREMIXES, built here rather
    /// than cut, so the peak that places the others is set in
    /// `SoundBank::new` against a downbeat that has two more layers in it.
    ///
    /// EVERY NUMBER IN THE TABLE ABOVE IS AT 48 kHz, which is what this test
    /// builds and what most devices run. The recipe in `render_click.py`
    /// quotes the same margins at 44 100, the rate the files ship at, and the
    /// two differ by up to 0.2 dB — drum reads 1.62 dB here and 1.83 there.
    /// That is the resampler, it has always been there (`rebuild.py` point 6
    /// says the same about its own numbers), and it is why a margin quoted
    /// anywhere in this repository says which rate it was taken at.
    ///
    /// SO WHY IS THE FLOOR 1.5 AND NOT 2.0. Because the span is what it is:
    /// no kit here stands more than 4.58 dB over its own beat, and the drum
    /// kit stands 3.67, so a middle placed perfectly can be at most 1.83 dB
    /// from each end of that one. A 2.0 dB floor is not a strict test, it is
    /// an arithmetic impossibility for two of the eight kits, and raising the
    /// accent margins to make room would be the snare kit's third rejection
    /// all over again ("disproportionally loud"). 1.5 clears every kit with
    /// room, and it is a real raise on the 1.0 the gain version was held to.
    ///
    /// AND THERE IS NO PER-KIT EXCEPTION, which there was for a day and
    /// should not have been. `kit`'s middle is its backbeat with the KICK
    /// TAKEN OUT — the largest musical difference in this table and, at the
    /// peak every middle used to be given, very nearly the smallest measured
    /// one, because this filter starts at 200 Hz and a kick carries 99.7% of
    /// its energy below 120. It measured 0.83 dB under its downbeat and was
    /// allowed through on the K-weighted number, which does hear a kick and
    /// read 1.73 dB.
    ///
    /// That was the wrong call and the band-pass was right. On a laptop the
    /// kick is not merely invisible to the filter, it is GONE, so what the
    /// owner would have heard on beat four of a 6/8 is a snare 0.83 dB under
    /// the snare on beat one — which is the experiment that has already been
    /// run, and which he could not hear. The file carries it now: `kit_mid`
    /// peaks at 0.807 rather than 0.930, and clears the same 1.5 dB every
    /// other preset does.
    ///
    /// The margins are floors, not targets. Everything
    /// `every_accent_is_louder_than_its_beat_on_a_small_speaker` says about
    /// that holds here, and it cost three rejections to learn once already.
    #[test]
    fn every_medium_accent_sits_between_its_strong_and_its_beat() {
        let sr = 48000;
        let bank = SoundBank::new(sr);
        for (name, kit) in SoundKit::ALL {
            let high = laptop_band_energy(bank.get(kit.high_id()), sr);
            let mid = laptop_band_energy(bank.get(kit.mid_id()), sr);
            let low = laptop_band_energy(bank.get(kit.low_id()), sr);
            // The three things a bar of 6/8 makes, as the callback spawns
            // them: the accent file at 1.0, the middle file at MEDIUM_GAIN,
            // and the beat file at BEAT_GAIN. Energy, so the gains square.
            let strong = high;
            let medium = mid * (MEDIUM_GAIN * MEDIUM_GAIN) as f64;
            let beat = low * (BEAT_GAIN * BEAT_GAIN) as f64;

            // AND THE SAME THREE THROUGH THE LOUDNESS FILTER. The band-pass
            // above answers "will a laptop reproduce this"; K-weighting
            // answers "is it loud", and a musician on headphones is a
            // musician. The two disagree, and they disagreed in the worst
            // direction: the snare kit's middle was Studio's layer 2 for an
            // afternoon — the more distinct sound of the two candidates, and
            // the LOUDEST of that drum's four layers — and at the peak that
            // put it 1.99 dB under its downbeat on a laptop it sat 0.86 dB
            // OVER it here. No peak fixes that; the level that satisfies this
            // filter leaves 0.13 dB over the plain beat on the other one.
            // Both presets built from the Studio snare are layer 3 because of
            // this assertion.
            let k_strong = k_weighted_energy(bank.get(kit.high_id()), sr);
            let k_medium =
                k_weighted_energy(bank.get(kit.mid_id()), sr) * (MEDIUM_GAIN * MEDIUM_GAIN) as f64;
            let k_beat =
                k_weighted_energy(bank.get(kit.low_id()), sr) * (BEAT_GAIN * BEAT_GAIN) as f64;
            let k_strong_over_medium = 10.0 * (k_strong / k_medium.max(1e-30)).log10();
            let k_medium_over_beat = 10.0 * (k_medium / k_beat.max(1e-30)).log10();

            let strong_over_beat = 10.0 * (strong / beat.max(1e-30)).log10();
            let medium_over_beat = 10.0 * (medium / beat.max(1e-30)).log10();
            let strong_over_medium = 10.0 * (strong / medium.max(1e-30)).log10();
            // Printed, not just asserted: the table in the doc comment above
            // is this line, and a kit re-cut a year from now should be able
            // to reproduce it with `--nocapture` rather than by reading the
            // source of the assertion.
            println!(
                "{name:>8}  strong {strong_over_beat:+.2}  middle {medium_over_beat:+.2}  \
                 beat +0.00  (strong-middle {strong_over_medium:.2})  \
                 K-weighted {k_strong_over_medium:.2} / {k_medium_over_beat:.2}"
            );

            assert!(
                medium_over_beat > 1.5,
                "{name}: a middle stroke is only {medium_over_beat:.2} dB over the plain \
                 beat through a 200 Hz-4 kHz band-pass. Below about 1.5 dB the bar's \
                 middle stops being a middle and becomes a beat, which is the bug this \
                 tier fixes."
            );
            assert!(
                strong_over_medium > 1.5,
                "{name}: the bar's opening is only {strong_over_medium:.2} dB over its \
                 middles. They are different files, so timbre helps — but a bar of 6/8 \
                 whose one and whose four weigh the same is two bars of 3/4 again, \
                 which is the bar the owner listened to and could not hear."
            );
            assert!(
                k_strong_over_medium > 1.0 && k_medium_over_beat > 1.0,
                "{name}: K-weighted, the middle stands {k_strong_over_medium:.2} dB under \
                 its downbeat and {k_medium_over_beat:.2} dB over its plain beat. A middle \
                 that is in order on a laptop and out of order on headphones is not in \
                 order. The floor is lower than the band-pass's 1.5 because this filter \
                 hears the sub-bass a laptop cannot, and a kick under a downbeat is \
                 loudness the middle is deliberately without."
            );
            // And the ordering itself, said plainly rather than left to be
            // inferred from two margins.
            assert!(
                strong > medium && medium > beat,
                "{name}: the three tiers are out of order — strong {strong:.4e}, \
                 medium {medium:.4e}, beat {beat:.4e}"
            );
        }
    }

    /// K-weighted energy: the loudness filter from ITU-R BS.1770, which is
    /// what a LUFS meter measures through and what `laptop_band_energy` is
    /// not.
    ///
    /// The two are needed for different questions and the snare kit is the
    /// proof. Band-limited, the rejected kit and the drum kit were within
    /// 0.2 dB of each other — the side-stick's 780 Hz wood sits right in the
    /// middle of a 200 Hz-4 kHz pass-band, so it measured fine there while
    /// carrying a quarter of `drum_low`'s energy. K-weighting is a gentle
    /// high-frequency shelf over a 38 Hz high-pass, so it hears the whole
    /// sound the way an ear weights it rather than through a keyhole, and it
    /// put the same two kits 2.7 dB apart. Band-limiting answers "will a
    /// laptop reproduce this"; K-weighting answers "is it loud".
    ///
    /// Two biquads, direct form 1, `f64` throughout. Test-only code, so the
    /// cost of the state array does not matter; the coefficients are the
    /// standard bilinear-transform designs the specification gives.
    fn k_weighted_energy(buf: &[f32], sr: u32) -> f64 {
        let sr = sr as f64;
        let tau = 2.0 * std::f64::consts::PI;
        // Stage 1 — the "head" shelf: +4 dB above ~1.7 kHz.
        let (g, q, fc) = (3.99984385397f64, 0.7071752369554196f64, 1681.9744509555319f64);
        let (amp, w0) = (10f64.powf(g / 40.0), tau * fc / sr);
        let (alpha, c, sa) = (w0.sin() / (2.0 * q), w0.cos(), amp.sqrt());
        let a0 = (amp + 1.0) - (amp - 1.0) * c + 2.0 * sa * alpha;
        let shelf = (
            [
                amp * ((amp + 1.0) + (amp - 1.0) * c + 2.0 * sa * alpha) / a0,
                -2.0 * amp * ((amp - 1.0) + (amp + 1.0) * c) / a0,
                amp * ((amp + 1.0) + (amp - 1.0) * c - 2.0 * sa * alpha) / a0,
            ],
            [
                2.0 * ((amp - 1.0) - (amp + 1.0) * c) / a0,
                ((amp + 1.0) - (amp - 1.0) * c - 2.0 * sa * alpha) / a0,
            ],
        );
        // Stage 2 — the 38 Hz high-pass, so subsonics cannot count as loud.
        let (q, fc) = (0.5003270373238773f64, 38.13547087602444f64);
        let w0 = tau * fc / sr;
        let (alpha, c) = (w0.sin() / (2.0 * q), w0.cos());
        let a0 = 1.0 + alpha;
        let hp = (
            [(1.0 + c) / 2.0 / a0, -(1.0 + c) / a0, (1.0 + c) / 2.0 / a0],
            [-2.0 * c / a0, (1.0 - alpha) / a0],
        );

        let mut state = [[0.0f64; 4]; 2];
        let mut energy = 0.0f64;
        for &s in buf {
            let mut v = s as f64;
            for (i, (b, a)) in [shelf, hp].iter().enumerate() {
                let st = &mut state[i];
                let y = b[0] * v + b[1] * st[0] + b[2] * st[1] - a[0] * st[2] - a[1] * st[3];
                st[1] = st[0];
                st[0] = v;
                st[3] = st[2];
                st[2] = y;
                v = y;
            }
            energy += v * v;
        }
        energy
    }

    /// THE OTHER HALF OF THE ACCENT TEST: loud enough to feel, not just
    /// louder than itself.
    ///
    /// "The snare does not sound at all like the drums of a drum kit, it's
    /// super underwhelming — I was expecting to feel it and all I got was a
    /// shy sound." That kit passed every assertion in this file. It peaked
    /// at 0.970 and its accent stood +4.89 dB over its own beat, and it was
    /// still the quietest thing the app could play: a whole bar of it
    /// measured -24.9 LUFS against the drum kit's -22.0, because a ratio
    /// between two quiet sounds is still quiet.
    ///
    /// Almost all of the gap was the PLAIN BEAT, which is three of every
    /// four events in a bar: 60 ms and 29 energy units against `drum_low`'s
    /// 130 ms and 106. So this measures a bar — one accent plus three beats
    /// at `BEAT_GAIN` — and holds the snare kit against the drum kit, the
    /// one the owner has actually signed off. Only those two: they are both
    /// drum kits, so it is a fair comparison, where `click` (a 20 ms burst
    /// with all of its energy in-band) is not.
    ///
    /// The rejected kit scores -2.71 dB here. The tom that replaced it scored
    /// +0.89, and the soft snare stroke that replaced the tom scores +1.19 —
    /// so making the kit COHERENT did not cost it loudness, which was the
    /// thing to be careful about. It would have been easy to fix "the accent
    /// sounds out of place" by pulling the accent down to the tom's weight
    /// and ship the shy kit for a third time; this number is what stops that.
    ///
    /// The two sub-assertions below are the ones with the teeth: the rejected
    /// side-stick fails both of them outright.
    #[test]
    fn the_snare_kit_is_not_quieter_than_the_drum_kit() {
        let sr = 48000;
        let bank = SoundBank::new(sr);
        let bar = |kit: SoundKit| {
            let g = (BEAT_GAIN * BEAT_GAIN) as f64;
            k_weighted_energy(bank.get(kit.high_id()), sr)
                + 3.0 * k_weighted_energy(bank.get(kit.low_id()), sr) * g
        };
        let db = 10.0 * (bar(SoundKit::Snare) / bar(SoundKit::Drum)).log10();
        assert!(
            db > 0.0,
            "a bar of the snare kit is {db:.2} dB against a bar of the drum kit. \
             The drum kit is the one the owner accepted, so anything below it is \
             the shy kit shipping again."
        );

        // And the specific thing that made it shy: the plain beat was a tick.
        // A drum has a body, so it has a length and it has energy.
        //
        // Plain energy here, neither weighting: the question is whether there
        // is a drum's worth of sound in the file at all, and both weightings
        // would be answering a different one. `drum_low` is a hi-hat with 71%
        // of its energy above 6 kHz, so K-weighting's treble shelf flatters it
        // against a struck head and the band-pass throws most of it away —
        // the two sounds are only comparable on how much of them there is.
        //
        // The beat is 127 units here against `drum_low`'s 106, down from the
        // tom's 156. That drop is deliberate and is the price of coherence:
        // the tom got its energy from a 165 Hz sine that the accent had no
        // equivalent of, and a beat made of the same drum as the accent has
        // to be held down by LEVEL instead. What matters is that it is still
        // a drum's worth of sound, which is what this asserts.
        let beat = bank.get(SoundKit::Snare.low_id());
        let ms = beat.len() as f64 * 1000.0 / sr as f64;
        assert!(ms > 100.0, "the snare kit's beat is {ms:.0} ms, which is a tick");
        let energy = |b: &[f32]| b.iter().map(|s| (s * s) as f64).sum::<f64>();
        let vs = 10.0 * (energy(beat) / energy(bank.get(SoundId::DrumLow))).log10();
        assert!(
            vs > 0.0,
            "the snare kit's beat carries {vs:.2} dB against `drum_low`. That is \
             where the last version's shyness lived: 60 ms of side-stick, 5.6 dB \
             down, under three beats out of every four."
        );
    }

    /// A store written by a newer build can name a kit this one has never
    /// heard of. It must fall back to something audible, not go silent.
    #[test]
    fn an_unknown_sound_type_falls_back_to_a_real_kit() {
        for s in ["", "drum2", "Snare", "kit-from-the-future", "🥁"] {
            let kit = SoundKit::from_str(s);
            assert!(kit == SoundKit::Click, "{s:?} should fall back to Click");
            let bank = SoundBank::new(48000);
            assert!(!bank.get(kit.high_id()).is_empty());
            assert!(!bank.get(kit.low_id()).is_empty());
        }
        // And the kits that do exist must keep resolving to themselves — all
        // eight of them, by the same names the menu and `SOUND_TYPES` use.
        for (name, kit) in SoundKit::ALL {
            assert!(
                SoundKit::from_str(name) == kit,
                "{name:?} does not resolve to its own kit"
            );
        }
    }

    /// Every kit answers with THREE buffers, and the recorded ones peak where
    /// `render_click.py` says it left them.
    ///
    /// `drum_accent_leaves_headroom` makes this claim for the two accents it
    /// knows about; this makes it for all eight kits and from the other
    /// side as well, because a kit whose BEAT arrived at full scale would
    /// clip on three events in four and no assertion here used to see it.
    ///
    /// AND THE MIDDLES ARE HELD TO THE PEAK THEIR OWN RECIPE ROW STATES,
    /// which is not one number any more. `render_click.py` solves each middle's
    /// peak for the level it has to sit at rather than assuming a convention,
    /// so they ship at 0.930 (click, beep, sticks), 0.921 (snare), 0.814
    /// (wood), 0.807 (kit) and 0.771 (cowbell), and drum's is mixed to 0.930
    /// in `SoundBank::new`. The window is 2.5% either side, and it is that wide
    /// because THE RESAMPLER MOVES A PEAK BOTH WAYS. Read at 48 kHz, click's
    /// middle comes back 1.7% HIGH — a windowed sinc rings around a transient
    /// — and cowbell's comes back 1.5% LOW, because a bell's peak is one
    /// sample and at 48/44.1 no output sample lands on it. Those two are the
    /// extremes of the eight; the rest are inside half a per cent.
    ///
    /// It is still a useful bound: what this catches is a file normalised to
    /// the WRONG target, which means 0.930 where 0.771 was meant, and that is
    /// 21%. A file swapped for another kit's is the hash test's job, not
    /// this one's.
    ///
    /// COWBELL'S PLAIN BEAT IS AT 0.763 AND THE FLOOR STAYS AT 0.5. It is the
    /// one beat in the app that is deliberately far under 0.900, because that
    /// preset's three strokes are three dynamics of one bell and the softest
    /// of them, normalised, is the LOUDEST of the three. Raising the floor to
    /// fence the others in would fence this one out for being correct.
    ///
    /// THE CEILING IS 0.98 AND NOT THE 0.970 THE FILES CARRY, because this
    /// measures the buffer AFTER the resampler and a windowed sinc overshoots.
    /// The files ship at 44 100 and most devices run at 48 000, so nearly
    /// every buffer here has been through `resample`: a 0.970 file arrives at
    /// up to 0.9731, which is the interpolator ringing around a transient and
    /// not a level anybody chose. 0.98 is past every one of them and still
    /// leaves the two per cent of headroom that is the point of 0.970.
    ///
    /// AND BEEP IS ALREADY OVER FULL SCALE, which this test found and did not
    /// cause. `beep_high` is a synthesised tone sitting at 0.9872 in the file
    /// — the only one of the sixteen normalised that high — and at 48 000 it
    /// arrives at 1.0019. It is 0.17 dB and it has been true since the beep
    /// was synthesised, so it is recorded here rather than fixed: this pass
    /// was asked to leave Click, Beep and Drum alone, and the fix is a
    /// re-render of one file, not a change to anything here. The exception is
    /// named rather than the ceiling loosened, so the other seven keep a
    /// bound that would catch a real regression.
    ///
    /// The floor has teeth too: 0.5 catches a file that was normalised to the
    /// wrong target or truncated to a tail, which is exactly what a bad
    /// re-render of `render_click.py` would produce.
    #[test]
    fn every_kit_has_three_buffers_and_none_of_them_clips() {
        let bank = SoundBank::new(48000);
        // What `render_click.py`'s recipe says each middle is normalised to,
        // in `SoundKit::ALL` order. Kept here rather than derived so that a
        // recipe row edited without a re-render, or re-rendered without the
        // row being read, fails loudly in one place.
        let mid_peaks = [
            ("click", 0.930f32),
            ("sticks", 0.930),
            ("wood", 0.814),
            ("beep", 0.930),
            // Both re-cut 2026-09-15 and both for the same complaint. Drum's
            // is a premix and its number lives in `SoundBank::new`; snare's is
            // the last row of `render_click.py`.
            ("drum", 0.920),
            ("kit", 0.807),
            ("snare", 0.800),
            ("cowbell", 0.771),
        ];
        for (name, kit) in SoundKit::ALL {
            let ceiling = if name == "beep" { 1.002 } else { 0.98 };
            let want_mid = mid_peaks
                .iter()
                .find(|(n, _)| *n == name)
                .expect("every kit states its middle's peak")
                .1;
            for (which, id) in [
                ("accent", kit.high_id()),
                ("middle", kit.mid_id()),
                ("beat", kit.low_id()),
            ] {
                let buf = bank.get(id);
                assert!(!buf.is_empty(), "{name}'s {which} decoded to nothing");
                let peak = buf.iter().fold(0.0f32, |m, s| m.max(s.abs()));
                assert!(
                    peak <= ceiling,
                    "{name}'s {which} peaks at {peak}, over the {ceiling} this kit is allowed"
                );
                assert!(peak > 0.5, "{name}'s {which} is suspiciously quiet at {peak}");
                if which == "middle" {
                    assert!(
                        (peak - want_mid).abs() < want_mid * 0.025,
                        "{name}'s middle peaks at {peak}, not the {want_mid} its recipe \
                         row states"
                    );
                }
            }
        }
    }

    /// EVERY CLICK FILE IS PINNED, AND THE ONES THE OWNER HAS HEARD DO NOT
    /// CHANGE.
    ///
    /// Adding a middle stroke to every kit touched two generators and a
    /// recipe table, and the way that goes wrong is silent: `render_click.py`
    /// draws its dither from ONE generator in table order, so a row inserted
    /// beside its siblings rather than appended re-dithers every file below
    /// it — new bytes, the same measurements, nothing to see. So the bytes
    /// are pinned here, on the `include_bytes!` constants themselves, which
    /// is what actually ships rather than what happens to be in the working
    /// tree.
    ///
    /// `sticks_low` is the one with a second job: `JamCountInSound::Sticks`
    /// plays it for the jam's count-in (`jam.rs`), so a change there would
    /// alter how a band is counted in as well as how the Sticks preset
    /// sounds, and the owner has been listening to both since 2026-09-14.
    ///
    /// The eight added on 2026-09-15 are pinned too, for the second half of
    /// the same reason: the dither coupling cuts both ways, and a middle
    /// re-rendered on its own from the command line comes out audibly
    /// identical and byte-for-byte different from the one in the tree. The
    /// generator says so in its usage block; this is what notices.
    ///
    /// `cowbell_low` is the ONE pre-existing file this pass deliberately
    /// re-cut — the preset went from two dynamics of the bell to three, so
    /// what was its plain beat is its middle now and the fingertip tap became
    /// the beat. Its number below is new on purpose.
    ///
    /// FNV-1a rather than a real digest, because the crate has no hash
    /// dependency and does not need one: this is a regression guard against
    /// a re-render, not a defence against anybody. A one-bit change moves it.
    ///
    /// When a file here is DELIBERATELY re-cut, print the new number from
    /// this test's failure and say in the commit message what the owner
    /// heard that asked for it.
    #[test]
    fn the_shipped_click_files_are_the_ones_that_were_heard() {
        fn fnv1a(bytes: &[u8]) -> u64 {
            let mut h: u64 = 0xcbf2_9ce4_8422_2325;
            for &b in bytes {
                h ^= b as u64;
                h = h.wrapping_mul(0x0000_0100_0000_01b3);
            }
            h
        }
        for (name, bytes, want) in [
            ("click_high", CLICK_HIGH, 0xf025_7547_868f_d3a8u64),
            ("click_low", CLICK_LOW, 0x0b46_5c3a_0355_8e8c),
            ("wood_high", WOOD_HIGH, 0x8549_cc66_51d4_bd19),
            ("wood_low", WOOD_LOW, 0x5deb_cc73_b132_dee6),
            ("beep_high", BEEP_HIGH, 0x69b9_b936_3ce6_5fc8),
            ("beep_low", BEEP_LOW, 0x0234_e771_caed_febf),
            ("drum_high", DRUM_HIGH, 0xb3c0_e25f_7ab0_fb01),
            ("drum_low", DRUM_LOW, 0xb089_227f_6d5e_59a2),
            ("drum_metal", DRUM_METAL, 0x4b88_8e13_8797_eabb),
            ("drum_crash", DRUM_CRASH, 0x9fbc_05a8_8bfb_37f5),
            ("drum_body", DRUM_BODY, 0x368f_dc63_f27c_6d88),
            ("snare_high", SNARE_HIGH, 0x0840_3a28_7462_14a5),
            ("snare_low", SNARE_LOW, 0x8864_635d_aeb6_d4d4),
            ("sticks_high", STICKS_HIGH, 0x29c7_ea73_e73e_56db),
            ("sticks_low", STICKS_LOW, 0xc356_a3dc_09a7_3768),
            ("cowbell_high", COWBELL_HIGH, 0xacba_363a_662e_fb74),
            // RE-CUT 2026-09-15, and the only one. See the doc comment.
            ("cowbell_low", COWBELL_LOW, 0x9611_0d67_b5a5_2b43),
            ("kit_high", KIT_HIGH, 0xebde_82ae_e54c_6edb),
            ("kit_low", KIT_LOW, 0xebdf_4250_ca3b_c9f8),
            // And the eight cut on 2026-09-15.
            ("click_mid", CLICK_MID, 0x1e40_7e31_d6e8_19b1),
            ("beep_mid", BEEP_MID, 0x2fa8_cc0b_9d29_0c05),
            ("wood_mid", WOOD_MID, 0xc656_9ba4_f959_dc94),
            // RE-CUT 2026-09-15: the rim and the head, not layer 3. See
            // `render_click.py`'s last row.
            ("snare_mid", SNARE_MID, 0x3a05_e186_5e8b_fd3c),
            ("sticks_mid", STICKS_MID, 0xb623_109d_4d6d_d6ce),
            ("cowbell_mid", COWBELL_MID, 0x6ab9_1578_146b_48e8),
            ("kit_mid", KIT_MID, 0x07da_8c40_a306_6e65),
        ] {
            let got = fnv1a(bytes);
            assert_eq!(
                got, want,
                "{name} is not the file that shipped: 0x{got:016x}, pinned 0x{want:016x}"
            );
        }
    }

    /// A radix-2 FFT, iterative, in place. Test-only, so the allocation and
    /// the `f64` are free; `semitone_bands` is the only caller and it pads to
    /// a power of two first.
    fn fft(re: &mut [f64], im: &mut [f64]) {
        let n = re.len();
        debug_assert!(n.is_power_of_two() && im.len() == n);
        let mut j = 0usize;
        for i in 1..n {
            let mut bit = n >> 1;
            while j & bit != 0 {
                j ^= bit;
                bit >>= 1;
            }
            j |= bit;
            if i < j {
                re.swap(i, j);
                im.swap(i, j);
            }
        }
        let mut len = 2usize;
        while len <= n {
            let ang = -2.0 * std::f64::consts::PI / len as f64;
            let (wr, wi) = (ang.cos(), ang.sin());
            let mut i = 0usize;
            while i < n {
                let (mut cr, mut ci) = (1.0f64, 0.0f64);
                for k in 0..len / 2 {
                    let (ur, ui) = (re[i + k], im[i + k]);
                    let (xr, xi) = (re[i + k + len / 2], im[i + k + len / 2]);
                    let (vr, vi) = (xr * cr - xi * ci, xr * ci + xi * cr);
                    re[i + k] = ur + vr;
                    im[i + k] = ui + vi;
                    re[i + k + len / 2] = ur - vr;
                    im[i + k + len / 2] = ui - vi;
                    let nr = cr * wr - ci * wi;
                    ci = cr * wi + ci * wr;
                    cr = nr;
                }
                i += len;
            }
            len <<= 1;
        }
    }

    /// The buffer's energy split into SEMITONE-WIDE bands from 80 Hz up, each
    /// as a fraction of the whole — so the vector says what the sound is made
    /// of and nothing at all about how loud it is.
    ///
    /// A semitone and not an octave, because two of the eight presets are
    /// distinguished by PITCH and nothing else: click's three strokes are
    /// 1200, 980 and 800 Hz and beep's are 880, 760 and 660, and an
    /// octave-band vector puts all three beeps in one bucket and reports them
    /// as the same sound. At a twelfth of an octave a minor third is four
    /// bands and the measure sees what a musician hears.
    ///
    /// 88 bands, so the top edge is 80 Hz x 2^(88/12) = 12.9 kHz. Above that
    /// is cymbal air that no click decision has ever turned on, and every
    /// buffer here has been through a resampler whose own behaviour up there
    /// is not what this is trying to measure.
    fn semitone_bands(buf: &[f32], sr: u32) -> Vec<f64> {
        const BANDS: usize = 88;
        let n = buf.len().next_power_of_two().max(2);
        let mut re: Vec<f64> = buf.iter().map(|&s| s as f64).collect();
        re.resize(n, 0.0);
        let mut im = vec![0.0f64; n];
        fft(&mut re, &mut im);
        let mut out = vec![0.0f64; BANDS];
        let bin_hz = sr as f64 / n as f64;
        for k in 0..n / 2 {
            let f = k as f64 * bin_hz;
            if f < 80.0 {
                continue;
            }
            let b = ((f / 80.0).log2() * 12.0).floor() as isize;
            if b < 0 || b as usize >= BANDS {
                continue;
            }
            out[b as usize] += re[k] * re[k] + im[k] * im[k];
        }
        let total: f64 = out.iter().sum();
        if total > 0.0 {
            for v in out.iter_mut() {
                *v /= total;
            }
        }
        out
    }

    /// How far apart two sounds are in colour, level divided out: the L1
    /// distance between their `semitone_bands` vectors. Zero means one is a
    /// scaled copy of the other; two is the most two sounds can differ.
    fn spectral_distance(a: &[f32], b: &[f32], sr: u32) -> f64 {
        let (x, y) = (semitone_bands(a, sr), semitone_bands(b, sr));
        x.iter().zip(y.iter()).map(|(p, q)| (p - q).abs()).sum()
    }

    /// A MIDDLE STROKE IS NEVER A SCALED COPY OF A SIBLING.
    ///
    /// The point of the whole pass. "The same click 2 dB quieter is below
    /// what a musician notices on a transient" — so the file that marks a
    /// bar's middle has to be a different SOUND, and this is the assertion
    /// that it is, with the level taken out of the measurement so that the
    /// only thing left to measure is what it is made of.
    ///
    /// Measured at 48 kHz, L1 distance between semitone-band energy
    /// fractions:
    ///
    ///     kit      middle-strong   middle-beat   (strong-beat, for scale)
    ///     click        1.81            1.76            1.93
    ///     sticks       0.42            1.14            1.12
    ///     wood         0.61            0.86            0.56
    ///     beep         1.87            1.82            1.95
    ///     drum         0.44            1.43            1.05
    ///     kit          0.75            1.44            1.52
    ///     snare        0.50            0.46            0.53
    ///     cowbell      0.11            0.27            0.31
    ///
    /// THE FLOOR IS 0.25 AND IT IS A FLOOR. A scaled copy measures exactly
    /// 0.0, which is what the 0.80-gain version of this tier would have
    /// scored for all eight kits, so any real number here passes the literal
    /// claim and the floor exists to stop a lazy re-cut. Seven of the eight
    /// clear it by 0.17 or better, and the brief expected the trouble to be
    /// snare and sticks, where the middle is the same drum played softer. It
    /// is not: a softer stroke on a real drum is not the same spectrum
    /// quieter — fewer wires are thrown, less crack comes off the head — and
    /// at a twelfth of an octave this sees that.
    ///
    /// `kit` could have scored higher still — Studio's layer 2 stands 0.94
    /// from its downbeat where the layer 3 that ships stands 0.75 — and could
    /// not be given a level that survived the loudness filter. See
    /// `every_medium_accent_sits_between_its_strong_and_its_beat`: a more
    /// distinct sound at the wrong weight is not a middle stroke.
    ///
    /// SNARE AND DRUM WERE RE-CUT ON 2026-09-15 AND NEITHER MOVED BECAUSE OF
    /// THIS NUMBER. Snare's middle was layer 3 against a layer 4 downbeat and
    /// scored a respectable 0.56 while sounding, to the owner, like the
    /// downbeat turned down — which is what those two layers are: normalised
    /// they differ by 0.38 dB of RMS. It is the rim and the head now and
    /// scores 0.50, LOWER, and is not remotely the same stroke. Drum went the
    /// other way: its middle had the hat put back, which fixed a top octave
    /// 15.68 dB under the plain beat's and cost 0.08 here. This measure earns
    /// its keep by catching a lazy re-cut, and it did — the first attempt put
    /// the hat back at the downbeat's full 0.70 and landed at 0.18, which is
    /// the same file at another volume and is why the hat ships at 0.30. What
    /// it cannot do is tell you which of two real differences is the right
    /// one.
    ///
    /// COWBELL IS NAMED AT 0.10, AND IT IS A BELL. Its three strokes are
    /// three dynamics of one instrument, and a bell's partials are its
    /// geometry: they do not move with how hard it is struck. So the
    /// normalised spectra of v3, v2 and v1 sit 0.11 and 0.27 apart and there
    /// is nothing a harder stroke could have done about it. What DOES
    /// separate them is where the energy sits in TIME, which this measure
    /// throws away along with the level — 51.5%, 47.4% and 33.0% of each
    /// stroke's energy lands in its first 15 ms, so a harder stroke is more
    /// clang and less ring. That plus 2.1 dB a step is what a cowbell has.
    ///
    /// The alternative was built and rejected, and it is worth knowing why a
    /// better number lost. For a day this middle was the DOWNBEAT'S stroke
    /// through a distant mic blend, which scored 0.43 here — four times the
    /// margin — and was the wrong sound: 13.3% of its energy over 5.6 kHz
    /// against the downbeat's 4.2%, a centroid of 1788 Hz against 1042, and
    /// 42 ms longer. It did not read as the same bell struck differently. A
    /// measure is not a target, and this one least of all: it says a middle
    /// is not a scaled copy, and it cannot say the difference is the right
    /// one.
    ///
    /// What this does NOT say is that the difference is the RIGHT one. A
    /// middle that measured 1.9 from both siblings and sounded like a
    /// different instrument would pass this and fail a musician. That is the
    /// owner's ear on `scripts/sounds/ab_click.html`, as it was for the
    /// snare kit three times.
    #[test]
    fn a_middle_stroke_is_a_different_sound_from_both_its_siblings() {
        let sr = 48000;
        let bank = SoundBank::new(sr);
        for (name, kit) in SoundKit::ALL {
            let (high, mid, low) = (
                bank.get(kit.high_id()),
                bank.get(kit.mid_id()),
                bank.get(kit.low_id()),
            );
            let from_strong = spectral_distance(mid, high, sr);
            let from_beat = spectral_distance(mid, low, sr);
            println!(
                "{name:>8}  middle-strong {from_strong:.2}  middle-beat {from_beat:.2}  \
                 (strong-beat {:.2})",
                spectral_distance(high, low, sr)
            );
            // Cowbell is named, with its numbers and its reason, in the doc
            // comment above. Nothing else may claim the exception.
            let floor = if name == "cowbell" { 0.10 } else { 0.25 };
            for (which, d) in [("downbeat", from_strong), ("plain beat", from_beat)] {
                assert!(
                    d > floor,
                    "{name}: the middle stroke is {d:.2} away from the {which} in \
                     semitone-band energy fractions, which is close enough to be the \
                     same file at another volume — and the same file at another volume \
                     is the thing the owner listened to and could not hear."
                );
            }
        }
    }

    /// Where a stroke starts, in milliseconds: the first sample within 30 dB
    /// of the file's own peak. Level-independent by construction, which is
    /// what lets three files at three peaks be compared.
    fn onset_ms(buf: &[f32], sr: u32) -> f64 {
        let peak = buf.iter().fold(0.0f32, |m, s| m.max(s.abs()));
        let thresh = peak * 10f32.powf(-30.0 / 20.0);
        let i = buf.iter().position(|s| s.abs() >= thresh).unwrap_or(0);
        1000.0 * i as f64 / sr as f64
    }

    /// THE MIDDLE MUST NOT FLAM AGAINST THE DOWNBEAT.
    ///
    /// A metronome's three levels have to land in the same place. If a kit's
    /// middle stroke reaches full level later than its downbeat does, the bar
    /// has two different ideas of where a beat is, and at 200 bpm a
    /// millisecond of that is audible as a limp.
    ///
    /// Measured at 44 100 — the rate the files ship at, so the resampler's
    /// pre-ringing is not smearing the thing being measured:
    ///
    ///     kit      downbeat   middle   beat    middle vs downbeat   spread
    ///     click      0.02      0.02    0.02          0.00            0.00
    ///     sticks     2.13      2.24    2.86          0.11            0.73
    ///     wood       2.02      2.02    2.00          0.00            0.02
    ///     beep       0.11      0.14    0.14          0.02            0.02
    ///     drum       0.00      0.00    0.00          0.00            0.00
    ///     kit        0.25      0.39    0.45          0.14            0.20
    ///     snare      0.25      0.36    0.54          0.11            0.29
    ///     cowbell    0.75      0.70    0.75          0.05            0.05
    ///
    /// TWO CLAIMS, AND THE FIRST IS THE ONE THAT MATTERS. Every middle lands
    /// within 0.5 ms of its own downbeat, and that is entirely a fact about
    /// the files this pass cut: the worst is 0.14 ms, under a third of the
    /// window.
    ///
    /// The second is the spread across all three, held at 1.0 ms rather than
    /// the 0.5 the first claim gets, BECAUSE THE PAIRS ALREADY SHIPPED WIDER
    /// THAN THAT. Sticks is a stick-shot against a CROSS-STICK — two
    /// different articulations off two different parts of the drum — and its
    /// beat comes in 0.73 ms after its accent. That file is frozen
    /// (`the_shipped_click_files_are_the_ones_that_were_heard`: the jam's
    /// count-in plays it), and nothing here would be improved by pretending
    /// otherwise. 1.0 ms is past today's worst pair with room and still tight
    /// enough that a middle cut from the wrong end of a sample would fail.
    ///
    /// AND NOT "WITHIN 1 ms OF SAMPLE 0", which is what the plan asked for
    /// and which is not true of the files the app ships: wood comes in at
    /// 2.0 ms and sticks at 2.1, because `render_click.py` trims those two at
    /// a -40 and a -45 dB floor and this measures at -30, so what sits in
    /// front is the bottom of the instrument's own attack. It is the same
    /// 2 ms on all three strokes of those kits, so nothing flams; an absolute
    /// assertion would only have frozen a rendering detail.
    #[test]
    fn a_kits_three_strokes_start_together() {
        let sr = 44100;
        let bank = SoundBank::new(sr);
        for (name, kit) in SoundKit::ALL {
            let high = onset_ms(bank.get(kit.high_id()), sr);
            let mid = onset_ms(bank.get(kit.mid_id()), sr);
            let low = onset_ms(bank.get(kit.low_id()), sr);
            let spread = high.max(mid).max(low) - high.min(mid).min(low);
            let flam = (mid - high).abs();
            println!(
                "{name:>8}  downbeat {high:.2} ms  middle {mid:.2}  beat {low:.2}  \
                 (middle vs downbeat {flam:.2}, spread {spread:.2})"
            );
            assert!(
                flam < 0.5,
                "{name}: the middle stroke starts {flam:.2} ms from the downbeat. A bar \
                 whose one and whose four do not land in the same place is a bar with a \
                 limp in it."
            );
            assert!(
                spread < 1.0,
                "{name}: the three strokes start {spread:.2} ms apart"
            );
        }
    }

    /// An accent plays at 1.0. These are what it is measured against, and the
    /// ordering is the whole point: accent, then beat, then the ticks between.
    #[test]
    fn accent_reads_louder_than_the_beat_it_marks() {
        assert!(BEAT_GAIN < 1.0);
        assert!(SUB_GAIN < BEAT_GAIN);
        let accent_db = 20.0 * (1.0f32 / BEAT_GAIN).log10();
        assert!(
            (3.0..=4.5).contains(&accent_db),
            "accent sits {accent_db:.1} dB over the beat; under 3 it is not heard \
             as an accent and over 4.5 it shouts"
        );
    }

    /// Every sample ends in silence. A file truncated mid-decay steps to zero,
    /// and that step is a click — a second one, on every beat. Five of the ten
    /// did this before `scripts/sounds/rebuild.py`, the worst at -20 dBFS.
    #[test]
    fn no_sample_ends_mid_decay() {
        let bank = SoundBank::new(44100);
        let named: [(&str, &Vec<f32>); 24] = [
            ("click_high", &bank.click_high),
            ("click_low", &bank.click_low),
            ("wood_high", &bank.wood_high),
            ("wood_low", &bank.wood_low),
            ("beep_high", &bank.beep_high),
            ("beep_low", &bank.beep_low),
            ("drum_low", &bank.drum_low),
            ("snare_low", &bank.snare_low),
            ("snare_high", &bank.snare_high),
            // The recorded six. A recording is the case this test was written
            // for — the five originals were truncated mid-decay when they
            // arrived, and `render_click.py` lands every tail it cuts, which
            // is a claim and not a guarantee until something checks it.
            ("sticks_high", &bank.sticks_high),
            ("sticks_low", &bank.sticks_low),
            ("cowbell_high", &bank.cowbell_high),
            ("cowbell_low", &bank.cowbell_low),
            ("kit_high", &bank.kit_high),
            ("kit_low", &bank.kit_low),
            // And the seven middle strokes. Five are cut by the same
            // `render_click.py` as the recordings above; `click_mid` and
            // `beep_mid` come out of `rebuild.py`'s synthesis stage and get
            // the same 4 ms tail fade their own siblings got, which is a
            // claim and not a guarantee until something checks it.
            ("click_mid", &bank.click_mid),
            ("wood_mid", &bank.wood_mid),
            ("beep_mid", &bank.beep_mid),
            ("snare_mid", &bank.snare_mid),
            ("sticks_mid", &bank.sticks_mid),
            ("cowbell_mid", &bank.cowbell_mid),
            ("kit_mid", &bank.kit_mid),
            // And the two PREMIXES, which are the only buffers here that no
            // file is responsible for. `drum_accent` has been missing from
            // this list since the list was written: it is four samples summed
            // and then saturated, and the sum is as long as its longest layer,
            // so a layer that grew would leave the others' silence at the end
            // — or, saturated, would not. Nothing checked.
            ("drum_accent", &bank.drum_accent),
            ("drum_mid", &bank.drum_mid),
        ];
        for (name, buf) in named {
            let tail = buf.last().copied().unwrap_or(0.0).abs();
            assert!(tail < 0.002, "{name} ends at {tail}, which clicks");
        }
    }
    use super::*;
    use std::collections::HashSet;

    /// Reference implementation the audio callback used to run on every
    /// beat. Kept here only so `accent_mask` can be proved equivalent to
    /// it — the hot path must not build a set.
    fn compute_group_accents(groups: &[u8]) -> HashSet<u32> {
        let mut set = HashSet::new();
        let mut cursor = 0u32;
        for &g in groups {
            set.insert(cursor);
            cursor += g as u32;
        }
        set
    }

    /// Every METER_PRESETS entry plus every METER_VARIANTS entry from
    /// `src/constants/metronome.ts`, and the 2/4 preset added alongside.
    const ALL_METERS: &[&[u8]] = &[
        // METER_PRESETS
        &[4],
        &[3],
        &[2],
        &[3, 2],
        &[3, 3],
        &[3, 2, 2],
        &[3, 2, 3],
        &[3, 3, 3],
        &[3, 3, 3, 3],
        // METER_VARIANTS
        &[2, 3],
        &[2, 2, 2],
        &[2, 2, 3],
        &[2, 3, 2],
        &[3, 3, 2],
        &[2, 3, 3],
        // edges the validator still accepts
        &[1],
        &[16],
        &[1, 1, 1, 1, 1, 1],
        &[8, 8],
    ];

    #[test]
    fn accent_mask_matches_the_set_implementation() {
        for groups in ALL_METERS {
            let set = compute_group_accents(groups);
            let mask = accent_mask(groups);
            let total: u32 = groups.iter().map(|&g| g as u32).sum();
            for beat in 0..total.max(1) {
                assert_eq!(
                    mask_has_accent(mask, beat),
                    set.contains(&beat),
                    "groups {groups:?}, beat {beat}"
                );
            }
        }
    }

    #[test]
    fn accent_mask_marks_exactly_one_bit_per_group() {
        for groups in ALL_METERS {
            assert_eq!(
                accent_mask(groups).count_ones() as usize,
                groups.len(),
                "groups {groups:?}"
            );
        }
        // Beat 0 always accents — it opens the first group.
        assert!(mask_has_accent(accent_mask(&[3, 2, 2]), 0));
        assert!(mask_has_accent(accent_mask(&[3, 2, 2]), 3));
        assert!(mask_has_accent(accent_mask(&[3, 2, 2]), 5));
        assert!(!mask_has_accent(accent_mask(&[3, 2, 2]), 1));
        assert!(!mask_has_accent(accent_mask(&[3, 2, 2]), 6));
    }

    #[test]
    fn accent_mask_is_bounded_for_pathological_input() {
        // Not reachable through `validate_beat_groups`, but the shift
        // must never be UB if it ever were.
        let mask = accent_mask(&[255, 255, 255]);
        assert!(mask_has_accent(mask, 0));
        assert!(!mask_has_accent(mask, 255));
    }

    // -----------------------------------------------------------------
    // The seam between two meters
    // -----------------------------------------------------------------

    /// One tick, as the walk below reports it.
    #[derive(Debug, PartialEq, Eq, Clone, Copy)]
    struct WalkTick {
        measure_beat: u32,
        sub_count: u32,
        accent: AccentLevel,
    }

    impl WalkTick {
        fn opens_a_bar(&self) -> bool {
            self.measure_beat == 0 && self.sub_count == 0
        }
    }

    /// The tick loop's METER bookkeeping, and nothing else.
    ///
    /// The callback is a closure inside a `cpal` stream, so it cannot be
    /// driven from a test. This is the same arithmetic written out once:
    /// the snapshot's hold-or-apply, [`held_meter_due`], the accent, and the
    /// `measure_beat` wrap that closes a tick. Every decision calls the real
    /// function rather than paraphrasing it, so a change to the rule that
    /// did not mean to change the seam fails here.
    struct MeterWalk {
        groups: Vec<u8>,
        mask: u32,
        total: u32,
        held: Vec<u8>,
        is_held: bool,
        /// The immediate branch's "restack at the next tick".
        changed: bool,
        measure_beat: u32,
        sub_count: u32,
        subdivision: u32,
    }

    impl MeterWalk {
        fn new(groups: &[u8], subdivision: u32) -> Self {
            Self {
                groups: groups.to_vec(),
                mask: accent_mask(groups),
                total: groups.iter().map(|&g| g as u32).sum(),
                held: Vec::new(),
                is_held: false,
                changed: false,
                measure_beat: 0,
                sub_count: 0,
                subdivision,
            }
        }

        /// What the snapshot block does with a meter arriving while playing.
        fn post(&mut self, groups: &[u8], at_bar_line: bool) {
            if groups == self.groups.as_slice() {
                return;
            }
            if at_bar_line {
                self.held.clear();
                self.held.extend_from_slice(groups);
                self.is_held = true;
            } else {
                self.groups.clear();
                self.groups.extend_from_slice(groups);
                self.mask = accent_mask(&self.groups);
                self.total = self.groups.iter().map(|&g| g as u32).sum();
                self.changed = true;
                self.is_held = false;
            }
        }

        fn tick(&mut self) -> WalkTick {
            if self.changed {
                self.measure_beat = 0;
                self.sub_count = 0;
                self.changed = false;
            }
            if self.is_held && held_meter_due(self.measure_beat, self.sub_count) {
                self.groups = self.held.clone();
                self.mask = accent_mask(&self.groups);
                self.total = self.groups.iter().map(|&g| g as u32).sum();
                self.is_held = false;
            }
            let is_downbeat = self.sub_count == 0;
            let out = WalkTick {
                measure_beat: self.measure_beat,
                sub_count: self.sub_count,
                accent: accent_for(
                    AccentMode::Groups,
                    false,
                    4,
                    self.mask,
                    is_downbeat,
                    self.measure_beat,
                    self.measure_beat,
                ),
            };
            self.sub_count += 1;
            if self.sub_count >= self.subdivision {
                self.sub_count = 0;
                self.measure_beat += 1;
                if self.measure_beat >= self.total.max(1) {
                    self.measure_beat = 0;
                }
            }
            out
        }

        /// Walk `n` ticks and hand back the whole beats among them.
        fn beats(&mut self, n: usize) -> Vec<WalkTick> {
            (0..n).map(|_| self.tick()).filter(|t| t.sub_count == 0).collect()
        }
    }

    /// Bar lengths, in whole beats, from a stream of whole-beat ticks.
    /// The last bar is dropped: it has not finished, so its length is not
    /// a fact yet.
    fn bar_lengths(beats: &[WalkTick]) -> Vec<usize> {
        let mut bars: Vec<usize> = Vec::new();
        for t in beats {
            if t.opens_a_bar() {
                bars.push(1);
            } else if let Some(last) = bars.last_mut() {
                *last += 1;
            }
        }
        bars.pop();
        bars
    }

    #[test]
    fn a_held_meter_belongs_to_the_bar_it_was_posted_on() {
        // Inside the bar's first beat, whatever subdivision of it.
        assert!(held_meter_due(0, 0));
        assert!(held_meter_due(0, 3));
        // The whole-beat tick of beat 1 — the earliest an unsubdivided
        // click can see a change posted on the bar line before it.
        assert!(held_meter_due(1, 0));
        // And nothing after that: the bar has sounded a second whole beat,
        // so the change waits for the next bar line.
        assert!(!held_meter_due(1, 1));
        assert!(!held_meter_due(2, 0));
        assert!(!held_meter_due(6, 3));
    }

    #[test]
    fn a_setlist_switch_from_four_four_to_seven_eight_leaves_no_stub_bar() {
        // Two bars of 4/4 and then the bar line that opens the third, which
        // is where the runtime lands the switch. The post happens AFTER that
        // tick, because the config only leaves the UI once the notification
        // for it has — which is the whole reason the stub bar existed.
        let mut w = MeterWalk::new(&[4], 1);
        let mut beats = w.beats(9);
        w.post(&[2, 2, 3], true);
        beats.extend(w.beats(21));

        // 4, 4, then sevens. The one-beat bar this test exists for would
        // show up as a `1` between them.
        assert_eq!(bar_lengths(&beats), vec![4, 4, 7, 7, 7]);
        // The switch's bar line is the new meter's bar one: the tick right
        // after the post opens a bar and carries the bar's own accent.
        assert_eq!(beats[8].measure_beat, 0);
        assert_eq!(beats[8].accent, AccentLevel::Strong);
        // And 2+2+3 is audible inside it — a group start is an accent and
        // not a bar line.
        assert_eq!(beats[10].accent, AccentLevel::Medium);
        assert_eq!(beats[12].accent, AccentLevel::Medium);
        assert_eq!(beats[11].accent, AccentLevel::None);
    }

    #[test]
    fn a_setlist_switch_from_seven_eight_to_four_four_leaves_no_stub_bar() {
        let mut w = MeterWalk::new(&[2, 2, 3], 1);
        let mut beats = w.beats(15);
        w.post(&[4], true);
        beats.extend(w.beats(12));
        assert_eq!(bar_lengths(&beats), vec![7, 7, 4, 4, 4]);
        assert_eq!(beats[14].measure_beat, 0);
        assert_eq!(beats[14].accent, AccentLevel::Strong);
    }

    #[test]
    fn a_held_meter_lands_with_sixteenths_running() {
        // Sixteenths on a quarter. Two bars of 4/4 and the bar line that
        // opens the third, then one sixteenth of lag before the meter turns
        // up — which is where a real round trip puts it.
        let mut w = MeterWalk::new(&[4], 4);
        let mut beats = w.beats(33);
        w.tick();
        w.post(&[2, 2, 3], true);
        beats.extend(w.beats(4 * 21));
        // The lagging tick is a subdivision, so the whole-beat stream is
        // unbroken: the bar it belongs to is seven beats long.
        assert_eq!(bar_lengths(&beats)[..4], [4, 4, 7, 7]);
    }

    #[test]
    fn the_last_meter_posted_before_the_bar_line_is_the_one_that_plays() {
        let mut w = MeterWalk::new(&[4], 1);
        let mut beats = w.beats(9);
        w.post(&[3], true);
        w.post(&[2, 2, 3], true);
        beats.extend(w.beats(7));
        assert_eq!(bar_lengths(&beats), vec![4, 4, 7]);
    }

    #[test]
    fn a_held_meter_that_arrives_mid_bar_lets_the_bar_finish() {
        // A slow round trip: the meter turns up two beats into a 4/4 bar.
        // That bar is not the one it was posted on any more, so it plays out
        // at its old length and the new meter opens the next one.
        let mut w = MeterWalk::new(&[4], 1);
        let mut beats = w.beats(6);
        w.post(&[2, 2, 3], true);
        beats.extend(w.beats(17));
        assert_eq!(bar_lengths(&beats), vec![4, 4, 7, 7]);
    }

    #[test]
    fn a_meter_changed_by_hand_still_restarts_the_bar_at_once() {
        // The metronome screen, mid-bar, with no `at_bar_line`: the bar
        // restarts under the player's fingers, which is what dragging 4/4 to
        // 3/4 is asking for. Unchanged, and the reason the setlist's change
        // needed a flag of its own.
        let mut w = MeterWalk::new(&[4], 1);
        let mut beats = w.beats(6);
        w.post(&[3], false);
        beats.extend(w.beats(7));
        // The 4/4 bar in progress is cut to two beats — today's behaviour.
        assert_eq!(bar_lengths(&beats), vec![4, 2, 3, 3]);
        assert_eq!(beats[6].measure_beat, 0);
        assert_eq!(beats[6].accent, AccentLevel::Strong);
    }

    #[test]
    fn adaptive_thresholds_conservative_clamps_steps() {
        let (up, down, step_up, step_down) = adaptive_thresholds("conservative", 1, 1);
        assert_eq!(up, 80);
        assert_eq!(down, 40);
        assert!(step_up >= 2 && step_up <= 3);
        assert!(step_down >= 2 && step_down <= 3);
    }

    #[test]
    fn adaptive_thresholds_aggressive_has_lower_bar() {
        let (up_aggr, down_aggr, _, _) = adaptive_thresholds("aggressive", 5, 3);
        let (up_cons, down_cons, _, _) = adaptive_thresholds("conservative", 5, 3);
        // Aggressive promotes earlier than conservative
        assert!(up_aggr < up_cons);
        assert!(down_aggr < down_cons);
    }

    #[test]
    fn adaptive_thresholds_moderate_is_default() {
        let (up_mod, _, _, _) = adaptive_thresholds("moderate", 5, 3);
        let (up_unknown, _, _, _) = adaptive_thresholds("not-a-mode", 5, 3);
        assert_eq!(
            up_mod, up_unknown,
            "unknown mode should fall through to moderate"
        );
    }

    /// T07 — every aggressiveness value returns sane, ordered
    /// thresholds and steps. Guards the table itself: the drill's whole
    /// behaviour hangs off these six numbers now that no model decision
    /// can override them.
    #[test]
    fn adaptive_thresholds_all_modes_are_well_formed() {
        for mode in ["conservative", "moderate", "aggressive", "not-a-mode"] {
            let (up, down, step_up, step_down) = adaptive_thresholds(mode, 5, 3);
            assert!(
                up > down,
                "{mode}: up threshold {up} must sit above down threshold {down}"
            );
            assert!(up <= 100, "{mode}: up threshold {up} must be reachable");
            assert!(step_up >= 1, "{mode}: step up must move the tempo");
            assert!(step_down >= 1, "{mode}: step down must move the tempo");
        }
        // Step clamping is per-mode: a huge configured increment is
        // capped, a tiny one is floored.
        let (_, _, big_up, _) = adaptive_thresholds("aggressive", 99, 99);
        assert_eq!(big_up, 10, "aggressive caps the step up at 10 BPM");
        let (_, _, small_up, _) = adaptive_thresholds("moderate", 1, 1);
        assert_eq!(small_up, 3, "moderate floors the step up at 3 BPM");
    }

    /// T07 — boundary scores. `>= up` goes up, `<= down` goes down,
    /// strictly between holds. The thresholds are inclusive on both
    /// ends, so the exact boundary score must move the tempo.
    #[test]
    fn adaptive_direction_boundary_scores() {
        for mode in ["conservative", "moderate", "aggressive"] {
            let (up, down, _, _) = adaptive_thresholds(mode, 5, 3);
            assert_eq!(adaptive_direction(up, up, down), "up", "{mode}: at up");
            assert_eq!(
                adaptive_direction(up - 1, up, down),
                "hold",
                "{mode}: just below up"
            );
            assert_eq!(
                adaptive_direction(down, up, down),
                "down",
                "{mode}: at down"
            );
            assert_eq!(
                adaptive_direction(down + 1, up, down),
                "hold",
                "{mode}: just above down"
            );
            assert_eq!(adaptive_direction(100, up, down), "up", "{mode}: perfect");
            assert_eq!(adaptive_direction(0, up, down), "down", "{mode}: zero");
        }
    }

    #[test]
    fn advance_ramp_linear_up_increments_until_target() {
        // start=80, target=100, increment=5, mode=linear, going up
        let (bpm, dir, done) = advance_ramp(80, "up", 80, 100, 5, 3, "linear", false);
        assert_eq!(bpm, 85);
        assert_eq!(dir, "up");
        assert!(!done);
    }

    #[test]
    fn advance_ramp_linear_reaches_target_and_marks_done() {
        // Last step lands on target with non-cyclic
        let (bpm, _, done) = advance_ramp(98, "up", 80, 100, 5, 3, "linear", false);
        assert_eq!(bpm, 100, "Should clamp at target");
        assert!(done, "Non-cyclic ramp should be done when reaching target");
    }

    #[test]
    fn advance_ramp_cyclic_flips_direction_at_target() {
        let (bpm, dir, done) = advance_ramp(98, "up", 80, 100, 5, 3, "linear", true);
        assert_eq!(bpm, 100);
        assert_eq!(dir, "down");
        assert!(!done, "Cyclic ramps never finish at target");
    }

    #[test]
    fn advance_ramp_zigzag_oscillates() {
        // Zigzag: up by increment, then down by decrement, alternating
        let (bpm1, dir1, done1) = advance_ramp(100, "up", 80, 200, 10, 5, "zigzag", false);
        assert_eq!(bpm1, 110);
        assert_eq!(dir1, "down", "Zigzag flips direction every step");
        assert!(!done1);

        let (bpm2, dir2, _) = advance_ramp(110, "down", 80, 200, 10, 5, "zigzag", false);
        assert_eq!(bpm2, 105);
        assert_eq!(dir2, "up");
    }

    #[test]
    fn advance_ramp_zigzag_caps_at_target() {
        let (bpm, _, done) = advance_ramp(198, "up", 80, 200, 10, 5, "zigzag", false);
        assert_eq!(bpm, 200);
        assert!(done);
    }

    #[test]
    fn advance_ramp_clamps_at_300_bpm() {
        let (bpm, _, _) = advance_ramp(298, "up", 80, 350, 10, 5, "linear", false);
        assert_eq!(bpm, 300, "BPM should be hard-clamped at 300");
    }

    // -----------------------------------------------------------------
    // Descending drills — a target below the start
    // -----------------------------------------------------------------

    /// "Play it at 120 and work down to 80 until it is clean" is a real
    /// exercise, and the app could not express it: the target was clamped to
    /// a floor of the start tempo, so it could not be typed. `advance_ramp`
    /// reads the travel direction off the plan now.
    #[test]
    fn advance_ramp_linear_descends_toward_a_lower_target() {
        let (bpm, dir, done) = advance_ramp(120, "down", 120, 80, 5, 3, "linear", false);
        assert_eq!(bpm, 115);
        assert_eq!(dir, "down", "keep going toward the target");
        assert!(!done);
    }

    /// The owner's report: "when it reaches target, it's doing the 'and down'
    /// regardless of whether Up and down is enabled — I had it disabled and it
    /// still did it."
    ///
    /// `cyclic` was consulted only at the moment the ramp decides to turn
    /// round. The branch that actually TRAVELS back never looked at it, so any
    /// other route into a backward direction — jumping into the last step with
    /// `start_speed_ramp_from`, or a direction left over in a persisted ramp —
    /// sent a one-way drill down to the start and up again, forever.
    #[test]
    fn a_one_way_drill_never_travels_back_however_it_got_pointed_that_way() {
        // Pointed backwards mid-climb, cyclic off: it finishes rather than
        // descending. Every tempo between start and target, so this cannot
        // pass by landing on an edge case.
        for bpm in [85u16, 90, 95, 100] {
            let (new_bpm, dir, done) = advance_ramp(bpm, "down", 80, 100, 5, 3, "linear", false);
            assert_eq!(new_bpm, 100, "from {bpm}: a one-way drill ends at its target");
            assert_eq!(dir, "up", "from {bpm}: and never faces back");
            assert!(done, "from {bpm}: it is finished");
        }
        // The same input WITH the round trip asked for still comes back down,
        // so the assertion above is about `cyclic` and not about the branch
        // being unreachable.
        let (new_bpm, dir, done) = advance_ramp(95, "down", 80, 100, 5, 3, "linear", true);
        assert_eq!(new_bpm, 90);
        assert_eq!(dir, "down");
        assert!(!done);
    }

    /// The descending twin: a one-way drill that runs 120 down to 80 must not
    /// climb back to 120 either.
    #[test]
    fn a_one_way_descending_drill_never_climbs_back() {
        let (new_bpm, dir, done) = advance_ramp(95, "up", 120, 80, 5, 3, "linear", false);
        assert_eq!(new_bpm, 80, "it ends at its target");
        assert_eq!(dir, "down", "still facing the way it was going");
        assert!(done);
    }

    /// Zigzag travels back by definition — that is the shape — and `cyclic`
    /// has nothing to do with it. Kept so the fix above cannot be widened
    /// into the branch next door.
    #[test]
    fn zigzag_still_backs_off_with_cyclic_off() {
        let (new_bpm, dir, done) = advance_ramp(110, "down", 80, 200, 10, 5, "zigzag", false);
        assert_eq!(new_bpm, 105, "the back-off is by `decrement`");
        assert_eq!(dir, "up");
        assert!(!done);
    }

    #[test]
    fn advance_ramp_descending_stops_on_the_target_not_past_it() {
        // 83 - 5 would be 78, four below the goal. It lands on 80 and ends.
        let (bpm, _, done) = advance_ramp(83, "down", 120, 80, 5, 3, "linear", false);
        assert_eq!(bpm, 80);
        assert!(done);
    }

    #[test]
    fn advance_ramp_descending_cyclic_turns_round_and_climbs_home() {
        let (bpm, dir, done) = advance_ramp(85, "down", 120, 80, 5, 3, "linear", true);
        assert_eq!(bpm, 80);
        assert_eq!(dir, "up", "a cyclic descent comes back UP to the start");
        assert!(!done, "cyclic never finishes at the target");
        // ...and the way home stops at the start rather than overshooting it.
        let (bpm, dir, _) = advance_ramp(118, "up", 120, 80, 5, 3, "linear", true);
        assert_eq!(bpm, 120);
        assert_eq!(dir, "down");
    }

    #[test]
    fn advance_ramp_descending_zigzag_backs_off_upward() {
        // Out is down by `increment`; the back-off is up by `decrement`.
        let (bpm, dir, _) = advance_ramp(120, "down", 120, 80, 5, 3, "zigzag", false);
        assert_eq!(bpm, 115);
        assert_eq!(dir, "up", "next step backs off toward the start");
        let (bpm, dir, _) = advance_ramp(115, "up", 120, 80, 5, 3, "zigzag", false);
        assert_eq!(bpm, 118);
        assert_eq!(dir, "down");
        // The back-off never climbs past the tempo the drill started at.
        let (bpm, _, _) = advance_ramp(119, "up", 120, 80, 5, 3, "zigzag", false);
        assert_eq!(bpm, 120);
    }

    #[test]
    fn an_ascending_drill_is_untouched_by_all_of_that() {
        // The whole point of expressing this as out/back is that the old
        // behaviour falls out of it unchanged. Walk a full ascent.
        let mut bpm = 80u16;
        let mut dir = "up".to_string();
        let mut seen = vec![bpm];
        for _ in 0..10 {
            let (next, d, done) = advance_ramp(bpm, &dir, 80, 100, 5, 3, "linear", false);
            bpm = next;
            dir = d;
            seen.push(bpm);
            if done {
                break;
            }
        }
        assert_eq!(seen, vec![80, 85, 90, 95, 100]);
    }

    #[test]
    fn advance_ramp_down_floors_at_20_bpm() {
        // Cyclic, because that is now the only legitimate way for a linear
        // ramp to be travelling back — a one-way drill finishes at its target
        // instead. This test is about the 20 BPM floor holding when a plan
        // names a start below it, and it used to reach the descent through a
        // non-cyclic ramp, which no longer descends at all.
        let (bpm, _, _) = advance_ramp(22, "down", 10, 100, 5, 3, "linear", true);
        assert_eq!(bpm, 20, "BPM should floor at 20");
    }

    // -----------------------------------------------------------------
    // FREE mode — accent decision (PR #11, F8 / N1)
    // -----------------------------------------------------------------

    #[test]
    fn free_mode_accents_the_first_beat_and_only_the_first() {
        // FREE mode used to return false here unconditionally. The owner hit
        // the consequence: on FREE with "Group starts" selected, beat one was
        // neither heard nor lit, while "Every beat" and "None" both behaved.
        //
        // FREE mode is one group of N — `collapse_to_free` guarantees it — so
        // the group opens once, at beat 0. Walk the whole 16-beat maximum on
        // and off the quarter-note grid; exactly one position may accent.
        //
        // And the one accent it has is STRONG. A FREE bar has no middle to
        // mark — that is what choosing FREE says — so the tier must not
        // invent one.
        for n in [1u8, 4, 7, 16] {
            let mask = accent_mask(&[n]);
            for beat in 0..u32::from(n) {
                for is_downbeat in [true, false] {
                    let expected = if is_downbeat && beat == 0 {
                        AccentLevel::Strong
                    } else {
                        AccentLevel::None
                    };
                    assert_eq!(
                        accent_for(AccentMode::Groups, false, 4, mask, is_downbeat, beat, beat),
                        expected,
                        "free bar of {n}: beat {beat} (downbeat={is_downbeat})"
                    );
                }
            }
        }
    }

    #[test]
    fn free_mode_takes_the_speed_ramp_bar_accent_like_any_meter() {
        // N1 used to say FREE mode outranked the ramp's own bar accent. With
        // the free-mode branch gone there is nothing left to outrank it: a
        // drill accents beat 0 of every ramp bar whatever the meter is.
        //
        // A ramp's bar is a count of beats with a line drawn every `bpb`, not
        // a grouping — so what it accents is Strong and it has no middle.
        for beat in 0..16u32 {
            let expected = if beat % 4 == 0 {
                AccentLevel::Strong
            } else {
                AccentLevel::None
            };
            assert_eq!(
                accent_for(AccentMode::Groups, true, 4, accent_mask(&[16]), true, beat, beat),
                expected,
                "ramp bar accent wrong at beat {beat}"
            );
        }
    }

    #[test]
    fn grouped_mode_accents_each_group_downbeat() {
        // Control case: with no ramp running, 3+2+2 accents bar positions
        // 0, 3 and 5.
        let groups = [3u8, 2, 2];
        for pos in 0..7u32 {
            let expected = match pos {
                0 => AccentLevel::Strong,
                3 | 5 => AccentLevel::Medium,
                _ => AccentLevel::None,
            };
            assert_eq!(
                accent_for(AccentMode::Groups, false, 4, accent_mask(&groups), true, pos, pos),
                expected,
                "grouped accent wrong at bar position {pos}"
            );
        }
    }

    #[test]
    fn accent_never_fires_off_the_quarter_note_grid() {
        // `is_downbeat == false` means a subdivision tick — never an accent
        // of ANY tier. A middle accent on the "and" of three would be a
        // second grid the player never asked for.
        for mode in [AccentMode::Groups, AccentMode::All, AccentMode::None] {
            for ramp in [false, true] {
                for groups in ALL_METERS {
                    let mask = accent_mask(groups);
                    let total: u32 = groups.iter().map(|&g| g as u32).sum();
                    for beat in 0..total {
                        assert_eq!(
                            accent_for(mode, ramp, 4, mask, false, beat, beat),
                            AccentLevel::None,
                            "a sub-tick accented: groups {groups:?}, beat {beat}, ramp={ramp}"
                        );
                    }
                }
            }
        }
    }

    // -----------------------------------------------------------------
    // Audio-thread failure recovery
    //
    // The regression these cover: on 2026-09-03 the metronome stopped
    // starting on the owner's Windows box, on every tab, for the whole
    // life of the process. WASAPI answered `build_output_stream` with
    // AUDCLNT_E_DEVICE_IN_USE (0x8889000A) because the endpoint was
    // already held; the audio thread printed one line to stderr and
    // `return`ed, leaving `alive` — raised by `ensure_thread` before the
    // spawn — stuck true forever. Every later `ensure_thread` then
    // short-circuited, `start` still flipped `playing`, and the UI
    // happily showed "Stop" over silence.
    // -----------------------------------------------------------------

    /// Waits for a condition the audio thread satisfies asynchronously.
    fn eventually(mut cond: impl FnMut() -> bool) -> bool {
        for _ in 0..200 {
            if cond() {
                return true;
            }
            thread::sleep(Duration::from_millis(10));
        }
        false
    }

    #[test]
    fn a_failed_audio_setup_leaves_the_engine_startable_again() {
        let mut engine =
            MetronomeEngine::new_with_forced_setup_failure(crate::timing::create_beat_log());
        let state = crate::state::create_shared_state();

        // First press of Play: the device will not open, and the caller is
        // told so rather than being left to assume it worked.
        let first = engine.start_headless(state.clone());
        assert!(first.is_err(), "a failed setup must not report success");

        // The flag `ensure_thread` raised before spawning has to come back
        // down, or nothing can ever spawn an audio thread again.
        assert!(
            !engine.alive.load(Ordering::SeqCst),
            "`alive` stayed true after a failed setup — the engine is wedged"
        );
        assert!(
            !engine.is_running(),
            "the engine must not claim to be running with no stream"
        );

        // Second press: this must actually spawn and re-try the device.
        // A short-circuit on the stale `alive` would return `Ok` — that is
        // exactly the bug, so a second `Err` is the proof of a retry.
        let second = engine.start_headless(state);
        assert!(
            second.is_err(),
            "the second Play short-circuited instead of re-trying the device"
        );
    }

    #[test]
    fn each_audio_thread_gets_its_own_alive_flag() {
        // `fail` lowers `alive` *before* the audio thread has returned, so
        // that thread's `Drop` can run after `ensure_thread` has already
        // spawned a replacement. If the two shared one flag, the dying
        // thread's `Drop` would end the live thread's event loop and drop
        // its stream: silence, with `start` having reported success. Every
        // spawn must install its own flag.
        let mut engine =
            MetronomeEngine::new_with_forced_setup_failure(crate::timing::create_beat_log());
        let state = crate::state::create_shared_state();

        let _ = engine.start_headless(state.clone());
        let first = engine.alive.clone();
        let _ = engine.start_headless(state);
        let second = engine.alive.clone();

        assert!(
            !Arc::ptr_eq(&first, &second),
            "the replacement audio thread reused the dead thread's `alive` flag"
        );
    }

    #[test]
    fn the_app_path_does_not_wait_for_the_output_device() {
        // What `start` uses. It must answer without waiting for a verdict
        // the audio thread has not produced yet, because on the app path
        // that wait happens on the Tauri main thread and is a frozen window.
        let mut engine =
            MetronomeEngine::new_with_forced_setup_failure(crate::timing::create_beat_log());
        let state = crate::state::create_shared_state();
        state.lock().unwrap().is_playing = true;

        assert!(
            engine
                .ensure_thread(state.clone(), None, SetupWait::No)
                .is_ok(),
            "the non-waiting path must report that the engine is trying"
        );

        // The verdict still arrives — out of band, from the audio thread —
        // so the engine ends up startable and the transport stops lying.
        assert!(
            eventually(|| !engine.alive.load(Ordering::SeqCst)),
            "`alive` never came down, so nothing could ever start again"
        );
        assert!(
            eventually(|| !state.lock().unwrap().is_playing),
            "the transport was left claiming playback with no audio stream"
        );
    }

    #[test]
    fn a_failed_audio_setup_stops_the_transport_claiming_playback() {
        let state = crate::state::create_shared_state();
        {
            let mut s = state.lock().unwrap();
            s.is_playing = true;
            s.speed_ramp.active = true;
        }
        let alive = Arc::new(AtomicBool::new(true));
        let playing = Arc::new(AtomicBool::new(true));
        let tempo: SharedTempoContext = Arc::new(crate::onset::TempoContext::new(120, 1));
        tempo.set_playing(true);
        let (tx, rx) = mpsc::sync_channel::<Result<(), String>>(1);

        {
            let mut exit = AudioThreadExit::new(
                alive.clone(),
                playing.clone(),
                state.clone(),
                EventSink(None),
                Some(tempo.clone()),
                tx,
            );
            exit.fail("could not open the audio output stream: 0x8889000A".to_string());
        }

        assert!(!alive.load(Ordering::SeqCst), "`alive` must come down");
        assert!(!playing.load(Ordering::SeqCst), "`playing` must come down");
        {
            let s = state.lock().unwrap();
            assert!(
                !s.is_playing,
                "the transport must not report playback with no audio stream"
            );
            assert!(
                !s.speed_ramp.active,
                "a drill cannot be running with no audio stream"
            );
        }
        assert!(
            !tempo.is_playing(),
            "the onset detector was left gating on a click track that never started"
        );
        match rx.try_recv() {
            Ok(Err(reason)) => assert!(reason.contains("0x8889000A")),
            other => panic!("`start` was not told why setup failed: {other:?}"),
        }
    }

    #[test]
    fn an_audio_thread_that_dies_without_a_word_still_unblocks_start() {
        // A panic on the audio thread takes the `Drop` path only. `start`
        // must be answered anyway, and the flags must still come down, or
        // one panic would wedge the metronome exactly like a failed setup.
        let state = crate::state::create_shared_state();
        let alive = Arc::new(AtomicBool::new(true));
        let playing = Arc::new(AtomicBool::new(true));
        let (tx, rx) = mpsc::sync_channel::<Result<(), String>>(1);

        drop(AudioThreadExit::new(
            alive.clone(),
            playing.clone(),
            state,
            EventSink(None),
            None,
            tx,
        ));

        assert!(!alive.load(Ordering::SeqCst));
        assert!(!playing.load(Ordering::SeqCst));
        assert!(matches!(rx.try_recv(), Ok(Err(_))));
    }

    #[test]
    fn a_started_stream_reports_success_and_leaves_the_transport_alone() {
        let state = crate::state::create_shared_state();
        state.lock().unwrap().is_playing = true;
        let alive = Arc::new(AtomicBool::new(true));
        let playing = Arc::new(AtomicBool::new(true));
        let tempo: SharedTempoContext = Arc::new(crate::onset::TempoContext::new(120, 1));
        tempo.set_playing(true);
        let (tx, rx) = mpsc::sync_channel::<Result<(), String>>(1);

        let mut exit = AudioThreadExit::new(
            alive.clone(),
            playing.clone(),
            state.clone(),
            EventSink(None),
            Some(tempo.clone()),
            tx,
        );
        exit.ready();

        assert!(matches!(rx.try_recv(), Ok(Ok(()))));
        assert!(
            state.lock().unwrap().is_playing,
            "a working stream must not rewrite the transport"
        );
        assert!(
            tempo.is_playing(),
            "a working stream must not close the onset detector's gate"
        );
        // The flags only come down when the thread actually ends.
        assert!(alive.load(Ordering::SeqCst));
        drop(exit);
        assert!(!alive.load(Ordering::SeqCst));
    }

    // ─── Jam — the band on the tick grid ─────────────────────────────────

    use crate::jam::{
        compile_synth as compile_jam, JamBassLine, JamConfig, JamDropOut, JamPattern, JamPracticeConfig,
        JamTable, JamTrade,
    };

    /// A 4/4 rock bar at SIXTEENTHS: kick on 1 and 3, snare on 2 and 4, hat
    /// on every eighth. Sixteen ticks, so tick 0 is the one and tick 4 is
    /// the backbeat — the shape `plans/tasks/jam/BRIEF.md` names.
    fn rock_16ths() -> JamConfig {
        JamConfig {
            ticks_per_beat: 4,
            beats_per_bar: 4,
            bar: JamPattern {
                hat_open: Vec::new(),
                kick: vec![1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
                snare: vec![0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0],
                hat: vec![1, 0, 3, 0, 1, 0, 3, 0, 1, 0, 3, 0, 1, 0, 3, 0],
                ride: vec![0; 16],
                crash: vec![0; 16],
                ..Default::default()
            },
            fill: None,
            form_bars: 4,
            crash_on_one: false,
            intensity: 1.0,
            kit: "room".to_string(),
            bass: None,
            practice: None,
            fill_every: None,
            keys: None,
            mix: None,
            count_in_sound: None,
            bass_voice: None,
            keys_voice: None,
            custom_kit: None,
            ..Default::default()
        }
    }

    struct JamRender {
        samples: Vec<f32>,
        /// The right side. The band is stereo now, so a kit whose hats are
        /// placed renders two different things.
        #[allow(dead_code)]
        right: Vec<f32>,
        /// The peak BEFORE the mixer's clamp, which is the only way to see
        /// whether a table would have clipped.
        peak: f32,
        max_voices: usize,
    }

    /// A miniature of the callback's mixer: spawn a table's voices tick by
    /// tick, let them ring across ticks, sum them, and put the band through
    /// its own bus.
    ///
    /// Deliberately a copy of the callback's arithmetic rather than a shared
    /// helper. A change in the callback that this does not follow shows up
    /// as a failing assertion instead of as a test that quietly moved with
    /// the bug.
    ///
    /// `samples` is the LEFT side, and `peak` is the worst of both — the
    /// band is stereo now, and a test that measured one channel of a kit
    /// whose hats are panned would be measuring the wrong height.
    fn render_jam(
        table: &JamTable,
        bank: &SoundBank,
        bars: u32,
        tick_samples: usize,
        volume: f32,
    ) -> JamRender {
        render_jam_at(table, bank, bars, tick_samples, volume, 48_000, true)
    }

    /// [`render_jam`] with the device rate the drift and the choke are
    /// measured in, and a switch for the bus.
    ///
    /// The bus off is how a test asks what the BAND rendered — which is the
    /// number `jam.rs`'s safety clamp is about, and the one a level claim
    /// has to be made on before a compressor has had its say.
    #[allow(clippy::too_many_arguments)]
    fn render_jam_at(
        table: &JamTable,
        bank: &SoundBank,
        bars: u32,
        tick_samples: usize,
        volume: f32,
        sr: u32,
        with_bus: bool,
    ) -> JamRender {
        let total = bars as usize * table.ticks_per_bar() as usize * tick_samples;
        let mut left = vec![0.0f32; total];
        let mut right = vec![0.0f32; total];
        let mut voices: Vec<Voice> = Vec::new();
        let mut max_voices = 0usize;
        let mut jam_bar = 0u32;
        let mut pos = 0usize;
        let mut bus = DrumBus::new(sr);
        bus.set_drive(table.bus_drive, table.bus_shape);
        let choke_frames = (CHOKE_FADE_SECS * sr as f32) as u32;
        let drift_frames = (DRIFT_MAX_SECS * sr as f32) as u32;
        let kit = BandBanks::of(Some(table));
        for _ in 0..bars {
            for t in 0..table.ticks_per_bar() {
                if let Some(tick) = table.tick(t, jam_bar) {
                    for slot in tick.slots() {
                        spawn_band_voice(
                            &mut voices,
                            slot,
                            volume,
                            jam_bar,
                            t,
                            table.ticks_per_bar(),
                            tick_samples as u64,
                            drift_frames,
                            choke_frames,
                        );
                    }
                    if t == 0 && jam_bar == 0 {
                        if let Some(slot) = table.crash_on_one() {
                            spawn_band_voice(
                                &mut voices,
                                &JamSlot {
                                    cap_ticks: 0.0,
                                    ..slot
                                },
                                volume,
                                jam_bar,
                                0,
                                table.ticks_per_bar(),
                                tick_samples as u64,
                                drift_frames,
                                choke_frames,
                            );
                        }
                    }
                }
                max_voices = max_voices.max(voices.len());
                for _ in 0..tick_samples {
                    let mut l = 0.0f32;
                    let mut r = 0.0f32;
                    for v in voices.iter_mut() {
                        if v.delay > 0 {
                            v.delay -= 1;
                            continue;
                        }
                        // `jam_sample` and not `bank.get`, so this harness
                        // resolves a drum exactly the way the callback does.
                        let buf = jam_sample(bank, kit, v.sound_id);
                        let frames = if v.stereo { buf.len() / 2 } else { buf.len() };
                        let limit = if v.max_samples > 0 {
                            v.max_samples.min(frames)
                        } else {
                            frames
                        };
                        if v.position < limit {
                            let g = v.choke_gain();
                            let (sl, sr) = if v.stereo {
                                (buf[2 * v.position], buf[2 * v.position + 1])
                            } else {
                                (buf[v.position], buf[v.position])
                            };
                            if v.band {
                                l += sl * v.amp_l * g;
                                r += sr * v.amp_r * g;
                            } else {
                                l += sl * v.amp_l;
                                r += sr * v.amp_r;
                            }
                        }
                        if v.band && v.fade_left > 0 {
                            v.fade_left -= 1;
                        }
                        v.position += 1;
                    }
                    let (l, r) = if with_bus { bus.process(l, r) } else { (l, r) };
                    left[pos] = l;
                    right[pos] = r;
                    pos += 1;
                }
                voices.retain(|v| {
                    let buf = jam_sample(bank, kit, v.sound_id);
                    let frames = if v.stereo { buf.len() / 2 } else { buf.len() };
                    !v.done(frames)
                });
            }
            let (b, _) = advance_form(jam_bar, 1, table.form_bars());
            jam_bar = b;
        }
        let peak = left
            .iter()
            .chain(right.iter())
            .fold(0.0f32, |m, s| m.max(s.abs()));
        JamRender {
            samples: left,
            right,
            peak,
            max_voices,
        }
    }

    /// AN AUDITION, NOT A CHECK (2026-09-16).
    ///
    /// The bass and keys players are judged by ear. `YAMES_BAND_DEMO` names a
    /// folder of `<name>.json` files written by `scripts/sounds/band_demo.ts`
    /// — one compiled config per bar, as the app sends them — and each becomes
    /// `<name>.wav` beside it: the shipped kits and recorded voices, through
    /// this module's copy of the callback's mixer, with the notes left ringing
    /// across the bar lines the way the engine leaves them. Skipped without
    /// the variable, and `#[ignore]` so it never runs in the suite.
    #[test]
    #[ignore]
    fn render_band_demos() {
        #[derive(serde::Deserialize)]
        struct Demo {
            bpm: f32,
            bars: Vec<crate::jam::JamConfig>,
        }
        let Ok(dir) = std::env::var("YAMES_BAND_DEMO") else {
            eprintln!("YAMES_BAND_DEMO is not set; nothing to render");
            return;
        };
        let sr = 44_100u32;
        let bank = SoundBank::new(sr);
        let kits = crate::kit::KitCache::default();
        let voices = crate::voices::VoiceCache::default();
        let mut entries: Vec<_> = std::fs::read_dir(&dir)
            .expect("the demo folder")
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
            .collect();
        entries.sort();
        for path in entries {
            let demo: Demo =
                serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
            let tables: Vec<JamTable> = demo
                .bars
                .iter()
                .map(|cfg| {
                    let kit = kits.shipped(JamKit::from_name(&cfg.kit).0, sr).unwrap();
                    let v = crate::jam::resolve_voices(cfg, &voices, sr).unwrap();
                    crate::jam::compile_with_voices(cfg, kit, v).unwrap()
                })
                .collect();
            let tpb = demo.bars[0].ticks_per_beat.max(1) as f32;
            let tick_samples = (60.0 / demo.bpm / tpb * sr as f32).round() as usize;
            let (left, right) = render_sequence(&tables, &bank, tick_samples, 0.8, sr);
            let wav = path.with_extension("wav");
            let spec = hound::WavSpec {
                channels: 2,
                sample_rate: sr,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            };
            let mut w = hound::WavWriter::create(&wav, spec).unwrap();
            for (l, r) in left.iter().zip(right.iter()) {
                w.write_sample((l.clamp(-1.0, 1.0) * 32767.0) as i16).unwrap();
                w.write_sample((r.clamp(-1.0, 1.0) * 32767.0) as i16).unwrap();
            }
            w.finalize().unwrap();
            let peak = left.iter().chain(right.iter()).fold(0.0f32, |m, s| m.max(s.abs()));
            // What the table measured of itself, worst bar of the eight. A
            // demo that solos one lane is only comparable with the demo that
            // solos another if NEITHER was scaled by `JAM_SAFETY_CLAMP` —
            // that normalisation is worked out per table, so a loud one would
            // be quiet here for a reason that has nothing to do with the
            // voice. The two numbers being equal is what says it did not.
            let (before, after) = tables.iter().fold((0.0f32, 0.0f32), |m, t| {
                (m.0.max(t.peak_before), m.1.max(t.peak_after))
            });
            println!(
                "{} -> {} bars, peak {peak:.3}, table {before:.3} before the clamp and {after:.3} after",
                wav.display(),
                tables.len()
            );
        }
    }

    /// [`render_jam_at`] over a SEQUENCE of tables, one per bar, with the
    /// voices carried across the bar lines — what the engine does when the
    /// bar-ahead handshake swaps a table in at the downbeat.
    fn render_sequence(
        tables: &[JamTable],
        bank: &SoundBank,
        tick_samples: usize,
        volume: f32,
        sr: u32,
    ) -> (Vec<f32>, Vec<f32>) {
        let mut left = Vec::new();
        let mut right = Vec::new();
        let mut voices: Vec<Voice> = Vec::new();
        let mut jam_bar = 0u32;
        let mut bus = DrumBus::new(sr);
        let choke_frames = (CHOKE_FADE_SECS * sr as f32) as u32;
        let drift_frames = (DRIFT_MAX_SECS * sr as f32) as u32;
        for (index, table) in tables.iter().enumerate() {
            bus.set_drive(table.bus_drive, table.bus_shape);
            let kit = BandBanks::of(Some(table));
            for t in 0..table.ticks_per_bar() {
                if let Some(tick) = table.tick(t, jam_bar) {
                    for slot in tick.slots() {
                        spawn_band_voice(
                            &mut voices,
                            slot,
                            volume,
                            jam_bar,
                            t,
                            table.ticks_per_bar(),
                            tick_samples as u64,
                            drift_frames,
                            choke_frames,
                        );
                    }
                    if t == 0 && index == 0 {
                        if let Some(slot) = table.crash_on_one() {
                            spawn_band_voice(
                                &mut voices,
                                &JamSlot { cap_ticks: 0.0, ..slot },
                                volume,
                                jam_bar,
                                0,
                                table.ticks_per_bar(),
                                tick_samples as u64,
                                drift_frames,
                                choke_frames,
                            );
                        }
                    }
                }
                for _ in 0..tick_samples {
                    let mut l = 0.0f32;
                    let mut r = 0.0f32;
                    for v in voices.iter_mut() {
                        if v.delay > 0 {
                            v.delay -= 1;
                            continue;
                        }
                        let buf = jam_sample(bank, kit, v.sound_id);
                        let frames = if v.stereo { buf.len() / 2 } else { buf.len() };
                        let limit = if v.max_samples > 0 { v.max_samples.min(frames) } else { frames };
                        if v.position < limit {
                            let g = v.choke_gain();
                            let (sl, sr) = if v.stereo {
                                (buf[2 * v.position], buf[2 * v.position + 1])
                            } else {
                                (buf[v.position], buf[v.position])
                            };
                            if v.band {
                                l += sl * v.amp_l * g;
                                r += sr * v.amp_r * g;
                            } else {
                                l += sl * v.amp_l;
                                r += sr * v.amp_r;
                            }
                        }
                        if v.band && v.fade_left > 0 {
                            v.fade_left -= 1;
                        }
                        v.position += 1;
                    }
                    let (l, r) = bus.process(l, r);
                    left.push(l);
                    right.push(r);
                }
                voices.retain(|v| {
                    let buf = jam_sample(bank, kit, v.sound_id);
                    let frames = if v.stereo { buf.len() / 2 } else { buf.len() };
                    !v.done(frames)
                });
            }
            let (b, _) = advance_form(jam_bar, 1, table.form_bars());
            jam_bar = b;
        }
        (left, right)
    }

    // ─── Songs — the engine plays an imported piece ──────────────────────

    use crate::song::{
        SongBacking, SongBar, SongLane, SongMixGains, SongNote, SongRange, SongRole, SongSounds,
        SongTable, SongTempo, SongTrack, SongTransport, TICKS_PER_QUARTER,
    };

    /// THE TWELVE-BAR SONG THE GATE IS ABOUT.
    ///
    /// Twelve bars of 4/4 at 120 with a 7/8 at bar 4 and a step to 90 on the
    /// bar line of bar 5 — the three things a tempo map has to survive, in one
    /// piece, so a test that only ever saw one meter at one tempo cannot pass
    /// this by accident.
    fn gate_song() -> SongTransport {
        let mut bars = Vec::new();
        let mut tick = 0u32;
        for i in 0..12u32 {
            let (num, den) = if i == 4 { (7u32, 8u32) } else { (4, 4) };
            let len = TICKS_PER_QUARTER * 4 / den * num;
            bars.push(SongBar {
                start_tick: tick,
                length_ticks: len,
                numerator: num,
                denominator: den,
            });
            tick += len;
        }
        SongTransport {
            tempo_map: vec![
                SongTempo { tick: 0, bpm: 120.0 },
                SongTempo {
                    tick: bars[5].start_tick,
                    bpm: 90.0,
                },
            ],
            ticks_per_quarter: TICKS_PER_QUARTER,
            bars,
            range: SongRange {
                start_bar: 0,
                end_bar: 11,
            },
            loops: false,
            tempo_percent: 100,
            count_in_bars: 0,
        }
    }

    /// A rhythm section for it: a kick on every bar line, a snare halfway
    /// through every bar, a bass note on every beat, and a chord per bar held
    /// for a bar and a half — the last of which is there so a note is still
    /// ringing when the loop comes round.
    fn gate_backing(t: &SongTransport) -> SongBacking {
        let mut drums = Vec::new();
        let mut bass = Vec::new();
        let mut keys = Vec::new();
        for bar in t.bars.iter() {
            let beat_ticks = TICKS_PER_QUARTER * 4 / bar.denominator;
            drums.push(SongNote {
                tick: bar.start_tick,
                dur_ticks: beat_ticks,
                midi: 36,
                velocity: 0.9,
            });
            drums.push(SongNote {
                tick: bar.start_tick + bar.length_ticks / 2,
                dur_ticks: beat_ticks,
                midi: 38,
                velocity: 0.7,
            });
            // A CRASH ON THE LAST THIRTY-SECOND OF THE BAR, and it is there
            // for the seam rather than for the music.
            //
            // Nothing else in this arrangement survives one. The room kit's
            // kick and snare are 150 ms, its ride 350 and its crash 600; the
            // synthesised bass is about 150 and the electric piano 700. A
            // beat of this song is 667 ms at 100 % and 1333 at 50 %, so a
            // cymbal even half a beat before the bar line has finished
            // washing by the time the loop comes round at the slower speed —
            // and the "nothing was cut short" check below would have been
            // passing over silence, which is the one way this gate could lie.
            // A thirty-second in is 83 ms at 100 % and 167 at 50 %, so the
            // crash is still sounding across the seam at both.
            drums.push(SongNote {
                tick: bar.start_tick + bar.length_ticks - beat_ticks / 8,
                dur_ticks: beat_ticks * 4,
                midi: 49,
                velocity: 0.8,
            });
            for b in 0..bar.numerator {
                bass.push(SongNote {
                    tick: bar.start_tick + b * beat_ticks,
                    dur_ticks: beat_ticks,
                    midi: 40,
                    velocity: 0.8,
                });
            }
            keys.push(SongNote {
                tick: bar.start_tick,
                // A bar and a half, so the last chord of a range runs past
                // the seam and has to be allowed to ring across it.
                dur_ticks: bar.length_ticks + bar.length_ticks / 2,
                midi: 60,
                velocity: 0.6,
            });
        }
        SongBacking {
            tracks: vec![
                SongTrack {
                    role: SongRole::Drums,
                    name: "drums".into(),
                    notes: drums,
                },
                SongTrack {
                    role: SongRole::Bass,
                    name: "bass".into(),
                    notes: bass,
                },
                SongTrack {
                    role: SongRole::Keys,
                    name: "keys".into(),
                    notes: keys,
                },
            ],
        }
    }

    /// The drums and banks a song plays out of, built for a test at `sr`.
    /// The shipped kit, and no recorded voices — the synthesised recipes are
    /// what a checkout without the voice folders plays, and this gate is
    /// about sample positions rather than about timbre.
    fn gate_sounds(sr: u32) -> SongSounds {
        let kits = crate::kit::KitCache::default();
        SongSounds {
            bank: kits
                .shipped(JamKit::fallback().0, sr)
                .expect("the fallback kit decodes"),
            perc: kits.perc(0, sr).ok(),
            voices: crate::jam::JamVoices::default(),
        }
    }

    /// Where the map says each bar of a range starts, in seconds, worked out
    /// from the transport and NOT from the compiled table.
    ///
    /// The whole value of the gate is that the two are computed twice and
    /// agree; a helper that read `SongBarPlan::start_seconds` would be the
    /// table agreeing with itself.
    fn map_bar_seconds(t: &SongTransport) -> Vec<f64> {
        let mut out = Vec::new();
        let mut seconds = 0.0f64;
        for i in t.range.start_bar..=t.range.end_bar {
            let bar = t.bars[i as usize];
            let bpm = t
                .tempo_map
                .iter()
                .filter(|e| e.tick <= bar.start_tick)
                .last()
                .map(|e| e.bpm)
                .unwrap_or(120.0)
                * t.tempo_percent as f64
                / 100.0;
            out.push(seconds);
            seconds += bar.length_ticks as f64 / TICKS_PER_QUARTER as f64 * 60.0 / bpm;
        }
        out
    }

    /// Every click of one pass, in frames, straight off the map.
    fn map_click_frames(t: &SongTransport, sr: u32, subdivision: u32) -> Vec<u64> {
        let starts = map_bar_seconds(t);
        let mut out = Vec::new();
        for (n, i) in (t.range.start_bar..=t.range.end_bar).enumerate() {
            let bar = t.bars[i as usize];
            let bpm = t
                .tempo_map
                .iter()
                .filter(|e| e.tick <= bar.start_tick)
                .last()
                .map(|e| e.bpm)
                .unwrap_or(120.0)
                * t.tempo_percent as f64
                / 100.0;
            let beat = 60.0 / bpm * 4.0 / bar.denominator as f64;
            for b in 0..bar.numerator {
                for sub in 0..subdivision {
                    let at = starts[n]
                        + b as f64 * beat
                        + sub as f64 * beat / subdivision as f64;
                    out.push((at * sr as f64).round() as u64);
                }
            }
        }
        out
    }

    /// And every backing onset of one pass, sorted, straight off the map.
    fn map_onset_frames(t: &SongTransport, backing: &SongBacking, sr: u32) -> Vec<u64> {
        let starts = map_bar_seconds(t);
        let mut out = Vec::new();
        for track in backing.tracks.iter() {
            for note in track.notes.iter() {
                let Some((n, i)) = (t.range.start_bar..=t.range.end_bar)
                    .enumerate()
                    .find(|(_, i)| {
                        let bar = t.bars[*i as usize];
                        note.tick >= bar.start_tick
                            && note.tick < bar.start_tick + bar.length_ticks
                    })
                else {
                    continue;
                };
                let bar = t.bars[i as usize];
                let bpm = t
                    .tempo_map
                    .iter()
                    .filter(|e| e.tick <= bar.start_tick)
                    .last()
                    .map(|e| e.bpm)
                    .unwrap_or(120.0)
                    * t.tempo_percent as f64
                    / 100.0;
                let into = (note.tick - bar.start_tick) as f64 / TICKS_PER_QUARTER as f64
                    * 60.0
                    / bpm;
                out.push(((starts[n] + into) * sr as f64).round() as u64);
            }
        }
        out.sort_unstable();
        out
    }

    /// What one render of a song came out as.
    struct SongRender {
        /// The frame each click fired on, and which played bar it said it was
        /// in.
        clicks: Vec<(u64, u32)>,
        /// The frame each backing onset fired on, and which lane it was.
        onsets: Vec<(u64, SongLane)>,
        /// How many voices were still ringing at the instant the loop came
        /// round, before anything of the new pass was spawned. Zero would
        /// mean the seam cut the band off.
        ringing_at_seam: usize,
        /// How many passes the render got through.
        passes: u32,
        /// How many times the end of the piece was REPORTED. The engine
        /// pushes a beat notification on it, so anything but one is either a
        /// song that never ended or one that told the event loop it had
        /// ended once a frame until the buffer ran out.
        endings: u32,
        /// The loudest sample of the whole mix, before the clamp — the only
        /// way to see whether the callback would have clipped.
        peak: f32,
        /// And the two halves of it. The click is summed mono and added after
        /// the bus; the band goes through it. Kept apart because the answer
        /// to "too loud" is a different dial for each.
        click_peak: f32,
        band_peak: f32,
        max_voices: usize,
    }

    /// A miniature of the callback's SONG path: the seam check at the top of
    /// the frame, the two cursor walks, the mixer, the cursor advance at the
    /// bottom.
    ///
    /// Deliberately a copy of the callback's arithmetic rather than a shared
    /// helper, for the reason `render_jam` is one: a change in the callback
    /// that this does not follow shows up as a failing assertion instead of
    /// as a test that quietly moved with the bug.
    fn render_song(table: &SongTable, bank: &SoundBank, frames: usize, sr: u32) -> SongRender {
        let mut voices: Vec<Voice> = Vec::new();
        let mut bus = DrumBus::new(sr);
        bus.set_drive(table.bus_drive, table.bus_shape);
        let choke_frames = (CHOKE_FADE_SECS * sr as f32) as u32;
        let banks = BandBanks::of_song(table);
        let kit = SoundKit::Click;
        let mix = SongMixGains::default();
        let volume = 0.8f32;

        let mut out = SongRender {
            clicks: Vec::new(),
            onsets: Vec::new(),
            ringing_at_seam: 0,
            passes: 0,
            endings: 0,
            peak: 0.0,
            click_peak: 0.0,
            band_peak: 0.0,
            max_voices: 0,
        };
        let mut pos: u64 = 0;
        let mut counting_in = true;
        let mut tick_at = 0usize;
        let mut band_at = 0usize;
        let mut ci_at = 0usize;
        let mut ended = false;
        let mut seen_seam = false;

        for frame in 0..frames as u64 {
            // `ends_here` is the FRAME the piece ended on and `ended` is
            // every frame after it — the callback's own two flags, copied
            // because the difference between them is a beat notification
            // pushed once and one pushed on every remaining frame of the
            // buffer, and the second fills the queue.
            let mut ends_here = false;
            if !ended && counting_in {
                if pos >= table.count_in_samples() {
                    pos = 0;
                    counting_in = false;
                }
            } else if !ended && pos >= table.pass_samples() {
                if table.loops() {
                    if !seen_seam {
                        seen_seam = true;
                        out.ringing_at_seam = voices.len();
                    }
                    pos = 0;
                    tick_at = 0;
                    band_at = 0;
                    out.passes += 1;
                } else {
                    ended = true;
                    ends_here = true;
                }
            }
            if ends_here {
                out.endings += 1;
                voices.clear();
            }
            if !ended {
                let ticks: &[crate::song::SongTick] = if counting_in {
                    table.count_in()
                } else {
                    table.ticks()
                };
                let cursor = if counting_in { &mut ci_at } else { &mut tick_at };
                while let Some(t) = ticks.get(*cursor) {
                    if t.sample > pos {
                        break;
                    }
                    *cursor += 1;
                    let level = song_accent(AccentMode::Groups, t.accent, t.sub == 0);
                    spawn_song_click(&mut voices, t, level, kit, volume * mix.click);
                    out.clicks.push((frame, t.bar));
                }
                if !counting_in {
                    while let Some(e) = table.band().get(band_at) {
                        if e.sample > pos {
                            break;
                        }
                        band_at += 1;
                        spawn_song_voice(
                            &mut voices,
                            e,
                            e.slot.gain * volume * mix.lane(e.lane),
                            choke_frames,
                        );
                        out.onsets.push((frame, e.lane));
                    }
                }
            }
            out.max_voices = out.max_voices.max(voices.len());

            // ---- The mixer, exactly as the callback runs it ----
            let mut click = 0.0f32;
            let mut band_l = 0.0f32;
            let mut band_r = 0.0f32;
            for v in voices.iter_mut() {
                if v.delay > 0 {
                    v.delay -= 1;
                    continue;
                }
                let buf = jam_sample(bank, banks, v.sound_id);
                let len = if v.stereo { buf.len() / 2 } else { buf.len() };
                let limit = if v.max_samples > 0 {
                    v.max_samples.min(len)
                } else {
                    len
                };
                if v.position < limit {
                    if v.band {
                        let g = v.choke_gain() * v.release_gain();
                        let (l, r) = if v.stereo {
                            (buf[2 * v.position], buf[2 * v.position + 1])
                        } else {
                            (buf[v.position], buf[v.position])
                        };
                        band_l += l * v.amp_l * g;
                        band_r += r * v.amp_r * g;
                    } else {
                        click += buf[v.position] * v.amp_l;
                    }
                }
                if v.band && v.fade_left > 0 {
                    v.fade_left -= 1;
                }
                v.position += 1;
            }
            let (bus_l, bus_r) = if banks.any() {
                bus.process(band_l, band_r)
            } else {
                (0.0, 0.0)
            };
            out.peak = out
                .peak
                .max((click + bus_l).abs())
                .max((click + bus_r).abs());
            out.click_peak = out.click_peak.max(click.abs());
            out.band_peak = out.band_peak.max(bus_l.abs()).max(bus_r.abs());

            voices.retain(|v| {
                let buf = jam_sample(bank, banks, v.sound_id);
                let len = if v.stereo { buf.len() / 2 } else { buf.len() };
                !v.done(len)
            });
            pos += 1;
        }
        out
    }

    /// THE GATE (`plans/tasks/songs/W9-ENGINE-SONG.md`).
    ///
    /// Twelve bars with a 7/8 and a tempo step, looping bars 3 to 6 twice, at
    /// 100 % and at 50 %: every click and every backing onset lands where the
    /// map says, to within one sample, across the step and across the seam.
    ///
    /// Three claims, and they are separate on purpose:
    ///
    /// 1. **The compiler agrees with the map.** Every sample position in the
    ///    table is re-derived here from the transport, by arithmetic that
    ///    shares no code with `song.rs`.
    /// 2. **The callback agrees with the compiler.** Every event fires on the
    ///    frame the table put it on, first time round and again after the
    ///    seam.
    /// 3. **Nothing is cut short at the seam.** The chord from the last bar
    ///    of the range is still ringing when the first bar comes back.
    #[test]
    fn a_song_plays_its_map_across_a_tempo_step_and_a_loop_seam() {
        let sr = 44_100u32;
        let bank = SoundBank::new(sr);
        for percent in [100u32, 50] {
            let mut t = gate_song();
            // Bars 3 to 6: a 4/4, the 7/8, and the two bars after the step.
            t.range = SongRange {
                start_bar: 3,
                end_bar: 6,
            };
            t.loops = true;
            t.tempo_percent = percent;
            let backing = gate_backing(&t);
            let table = crate::song::compile(&t, Some(&backing), gate_sounds(sr), sr, 1)
                .expect("the gate's song compiles");

            // ---- 1. The compiler against the map ----
            let want_clicks = map_click_frames(&t, sr, 1);
            assert_eq!(
                table.ticks().len(),
                want_clicks.len(),
                "{percent} %: one tick per beat of the range and no others"
            );
            for (i, (got, want)) in table
                .ticks()
                .iter()
                .map(|x| x.sample)
                .zip(want_clicks.iter().copied())
                .enumerate()
            {
                assert!(
                    got.abs_diff(want) <= 1,
                    "{percent} %: click {i} compiled at {got}, the map says {want}"
                );
            }
            let want_onsets = map_onset_frames(&t, &backing, sr);
            let got_onsets: Vec<u64> = table.band().iter().map(|e| e.sample).collect();
            assert_eq!(
                got_onsets.len(),
                want_onsets.len(),
                "{percent} %: one event per note inside the range"
            );
            for (i, (got, want)) in got_onsets.iter().zip(want_onsets.iter()).enumerate() {
                assert!(
                    got.abs_diff(*want) <= 1,
                    "{percent} %: onset {i} compiled at {got}, the map says {want}"
                );
            }
            // THE STEP IS ON THE BAR LINE. Bar 6 is the second bar after the
            // step, so its length is a whole bar of 4/4 at 90 × percent.
            let bars = table.bars();
            let at_90 =
                (4.0 * 60.0 / (90.0 * percent as f64 / 100.0) * sr as f64).round() as u64;
            assert_eq!(
                table.pass_samples() - bars[3].start_sample,
                at_90,
                "{percent} %: the last bar of the range is a bar at the new tempo"
            );

            // ---- 2. The callback against the compiler ----
            //
            // Two whole passes and a little of a third, so the seam is
            // crossed with the render still running.
            let frames = (table.pass_samples() * 2 + sr as u64 / 4) as usize;
            let r = render_song(&table, &bank, frames, sr);
            assert!(r.passes >= 1, "{percent} %: the range came round");
            let pass = table.pass_samples();
            let per_pass = table.ticks().len();
            for (i, (frame, bar)) in r.clicks.iter().enumerate() {
                let round = (i / per_pass) as u64;
                let tick = &table.ticks()[i % per_pass];
                assert_eq!(
                    *frame,
                    tick.sample + round * pass,
                    "{percent} %: click {i} fired late or early across the seam"
                );
                assert_eq!(*bar, tick.bar, "{percent} %: and in the wrong bar");
            }
            let per_pass_onsets = table.band().len();
            for (i, (frame, lane)) in r.onsets.iter().enumerate() {
                let round = (i / per_pass_onsets) as u64;
                let event = &table.band()[i % per_pass_onsets];
                assert_eq!(
                    *frame,
                    event.sample + round * pass,
                    "{percent} %: onset {i} fired late or early across the seam"
                );
                assert_eq!(*lane, event.lane);
            }
            assert!(
                r.clicks.len() > per_pass,
                "{percent} %: the second pass played too"
            );
            assert!(
                r.onsets.len() > per_pass_onsets,
                "{percent} %: and its band did"
            );

            // ---- 3. Nothing is cut short ----
            assert!(
                r.ringing_at_seam > 0,
                "{percent} %: the loop came round over silence — a voice was cut \
                 at the bar line"
            );
            // And the band does not clip. A song is not normalised the way a
            // jam is (`jam::worst_bar_peak`); what holds it down is the kit's
            // own balance, the bus and the mixer's clamp, so the number is
            // worth a look rather than an assumption.
            println!(
                "{percent} %: peak {:.3} (click {:.3} + band {:.3}), {} voices at worst",
                r.peak, r.click_peak, r.band_peak, r.max_voices
            );
            assert!(
                r.peak <= 1.0,
                "{percent} %: the song rendered at {:.3} (click {:.3} + band {:.3}), \
                 which the mixer would clamp",
                r.peak,
                r.click_peak,
                r.band_peak
            );
            assert!(
                r.max_voices < MAX_VOICES,
                "{percent} %: {} voices, and the mixer holds {MAX_VOICES}",
                r.max_voices
            );
        }
    }

    /// THE GATE for `plans/tasks/songs/W15-LIVE-AND-EXACT.md` item 2: a click
    /// at a known tick, and the sidecar's position puts it within one output
    /// buffer of where it actually is in the file.
    ///
    /// The whole of what item 2 is about is one number: the file's first
    /// sample is at SOME position in the piece, and everything the pitch pass
    /// does afterwards is measured from it. So this runs the real take
    /// session, with the real writer thread and the real resolver, over a
    /// real compiled song, and then goes and finds the click in the WAV.
    ///
    /// **The band here is impulses, not a mix.** Whether the mixer puts a
    /// click on the sample the table says is
    /// `a_song_plays_its_map_across_a_tempo_step_and_a_loop_seam`'s subject
    /// and is already proved above; what is under test here is the
    /// bookkeeping, and an impulse is the easiest thing in the world to
    /// locate in a file.
    #[test]
    fn a_take_records_the_bar_and_the_tick_it_opened_on() {
        let sr = 48_000u32;
        // Bars 3 to 6 of the gate song: a 4/4, the 7/8, and the two bars
        // after the tempo step. A take that opens inside this cannot be
        // right by accident — the bar it lands in is not the first, its
        // meter is not the range's, and its tempo is not the opening one.
        let mut t = gate_song();
        t.range = SongRange {
            start_bar: 3,
            end_bar: 6,
        };
        t.loops = true;
        t.count_in_bars = 0;
        let table = Arc::new(
            crate::song::compile(&t, None, gate_sounds(sr), sr, 1).expect("the gate's song"),
        );

        // The click to go looking for, and where the take opens: a hundred
        // and one samples before it, which is nothing like a buffer boundary
        // and nothing like a bar line.
        let target = table.ticks()[5];
        const LEAD_IN: u64 = 101;
        let begin = target.sample - LEAD_IN;
        // Two passes in, so `pass` has to be carried rather than assumed 0.
        const PASS: u32 = 2;

        let root = std::env::temp_dir().join(format!(
            "yames-take-position-{}",
            crate::clock::now_ns()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("a directory to record into");

        let handoff: SharedTake = Arc::new(crate::take::TakeHandoff::new());
        let mut session = crate::take::TakeSession::default();
        let for_resolver = table.clone();
        session
            .start(crate::take::TakeStart {
                app_data: &root,
                jam_id: "song-position",
                handoff: &handoff,
                mic: None,
                out_sr: sr,
                round_trip_us: 0,
                out_sr_watch: None,
                owns_input: false,
                // The same closure `start_take` builds, over the same table.
                position: Some(Arc::new(move |at| {
                    crate::song::take_position(Some(&for_resolver), at)
                })),
            })
            .expect("the take starts");
        let ring = {
            let mut seen = 0u64;
            handoff
                .poll_record(&mut seen)
                .expect("the callback is handed a ring")
                .expect("and it is not None")
        };

        // ---- The callback's own two lines, in order ----
        //
        // Stamp where the transport is at the FIRST sample of the first
        // buffer, then push that buffer. Everything after it is just audio.
        ring.stamp_start(crate::take::TakeTransport::Song {
            frames: begin,
            pass: PASS,
        });
        const BUFFER: usize = 512;
        let total = (LEAD_IN as usize) + BUFFER * 8;
        let mut band = vec![0.0f32; total];
        // Every click of the pass that falls inside what is recorded, on the
        // sample the compiled table put it on.
        for tick in table.ticks() {
            if tick.sample >= begin && ((tick.sample - begin) as usize) < total {
                band[(tick.sample - begin) as usize] = 0.75;
            }
        }
        for chunk in band.chunks(BUFFER) {
            ring.push(chunk);
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        // The writer drains every 25 ms; give it a few of those before the
        // stop takes the ring away.
        std::thread::sleep(std::time::Duration::from_millis(150));
        let take = session
            .stop(&handoff)
            .expect("the take stops")
            .expect("and there is something in it");

        // ---- 1. The sidecar says where the music was ----
        let at = take.position.expect("the sidecar records a position");
        assert_eq!(at.mode, crate::take::TakeMode::Song);
        assert_eq!(at.pass, PASS, "and which time round the range it was");
        assert!(!at.count_in);
        assert_eq!(
            at.bar, target.bar,
            "the take opened 101 samples before a click in bar {}, and the \
             sidecar says bar {}",
            target.bar, at.bar
        );
        // A hundred and one samples at 48 kHz is two milliseconds, so the
        // tick is just short of the click's own.
        assert!(
            at.tick <= target.tick && target.tick - at.tick < 20,
            "the take opened two milliseconds before tick {} and the sidecar \
             says tick {}",
            target.tick,
            at.tick
        );

        // ---- 2. And that position finds the click in the file ----
        let offset_ms = at
            .start_offset_ms
            .expect("a song's position carries the offset the pitch pass needs");
        let played = crate::take::load_take(&root, &take.id).expect("the take reads back");
        let found = played
            .pcm
            .iter()
            .position(|s| s.abs() > 0.5)
            .expect("the click is in the file") as f64;
        // Where the sidecar SAYS it should be: beat 0 of pass 0 sits
        // `offset_ms` into the file, and the click is `target.sample` past
        // that in its own pass.
        let origin = offset_ms / 1000.0 * sr as f64;
        let want = target.sample as f64
            + PASS as f64 * table.pass_samples() as f64
            + origin;
        assert!(
            (found - want).abs() <= BUFFER as f64,
            "the sidecar puts the click at sample {want} of the file and it is \
             actually at {found} — {} samples out, and one buffer is {BUFFER}",
            (found - want).abs()
        );
        // Belt and braces: it is where the arithmetic said, to the sample.
        assert_eq!(found as u64, LEAD_IN, "the impulse was written where it was placed");

        let _ = std::fs::remove_dir_all(&root);
    }

    /// The other two things the writer can be handed, and what they resolve
    /// to: a take that opens inside a count-in, and a take over a jam.
    #[test]
    fn a_count_in_and_a_jam_resolve_to_what_they_are() {
        use crate::take::{TakeMode, TakeTransport};
        let sr = 48_000u32;
        let mut t = gate_song();
        t.range = SongRange {
            start_bar: 3,
            end_bar: 6,
        };
        t.count_in_bars = 1;
        let table =
            crate::song::compile(&t, None, gate_sounds(sr), sr, 1).expect("the gate's song");
        assert!(table.count_in_samples() > 0, "the range asked to be counted in");

        // Half way through the count-in. The piece has not started, so the
        // position is the top of the range and the offset is POSITIVE: beat
        // 0 is still to come, that far into the file.
        let half = table.count_in_samples() / 2;
        let at = crate::song::take_position(Some(&table), TakeTransport::SongCountIn {
            frames: half,
        })
        .expect("a count-in has a position");
        assert_eq!(at.mode, TakeMode::Song);
        assert!(at.count_in, "and it says the piece had not started");
        assert_eq!(at.bar, 3, "the top of the range is where a count-in leads");
        assert_eq!(at.tick, table.bars()[0].start_tick);
        assert_eq!(at.pass, 0);
        let want_ms = (table.count_in_samples() - half) as f64 / sr as f64 * 1000.0;
        assert!(
            (at.start_offset_ms.expect("an offset") - want_ms).abs() < 0.001,
            "beat 0 is {want_ms} ms into the file and the sidecar says {:?}",
            at.start_offset_ms
        );

        // A jam needs no table at all: its bar IS its position, and there is
        // no beat 0 of a range for an offset to be measured from.
        let jam = crate::song::take_position(None, TakeTransport::Jam { bar: 5, chorus: 3 })
            .expect("a jam has a position");
        assert_eq!(jam.mode, TakeMode::Jam);
        assert_eq!(jam.bar, 5);
        assert_eq!(jam.tick, 0);
        assert_eq!(jam.pass, 2, "a chorus counts from one and a pass from zero");
        assert!(jam.start_offset_ms.is_none());

        // And a song stamp with no table to read it against answers nothing
        // rather than guessing — the song was taken off the engine.
        assert!(crate::song::take_position(
            None,
            TakeTransport::Song { frames: 100, pass: 0 }
        )
        .is_none());
    }

    /// A take begun with the transport stopped has no position in any piece,
    /// and the sidecar says nothing rather than guessing.
    ///
    /// This is the case the frontend's own `performance.now()` estimate still
    /// exists for (`useSongTakes.ts`): arm the take, then press play, and the
    /// file opens on however many seconds of silence the player took.
    #[test]
    fn a_take_that_began_before_the_music_records_no_position() {
        let sr = 48_000u32;
        let root = std::env::temp_dir()
            .join(format!("yames-take-no-position-{}", crate::clock::now_ns()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("a directory to record into");

        let handoff: SharedTake = Arc::new(crate::take::TakeHandoff::new());
        let mut session = crate::take::TakeSession::default();
        session
            .start(crate::take::TakeStart {
                app_data: &root,
                jam_id: "stopped",
                handoff: &handoff,
                mic: None,
                out_sr: sr,
                round_trip_us: 0,
                out_sr_watch: None,
                owns_input: false,
                position: Some(Arc::new(|at| crate::song::take_position(None, at))),
            })
            .expect("the take starts");
        let ring = {
            let mut seen = 0u64;
            handoff.poll_record(&mut seen).unwrap().unwrap()
        };
        ring.stamp_start(crate::take::TakeTransport::Free);
        for _ in 0..8 {
            ring.push(&[0.4f32; 512]);
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
        let take = session.stop(&handoff).unwrap().expect("a take");
        assert!(
            take.position.is_none(),
            "a take with no transport under it must record no position: {:?}",
            take.position
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    /// A count-in leads into the FIRST pass and no other, at the range's own
    /// tempo and meter — and it is not a bar of the piece, which is what the
    /// timing analyzer depends on (`song::COUNT_IN_BAR`).
    #[test]
    fn a_count_in_plays_once_and_is_not_part_of_the_song() {
        let sr = 44_100u32;
        let bank = SoundBank::new(sr);
        let mut t = gate_song();
        t.range = SongRange {
            start_bar: 5,
            end_bar: 6,
        };
        t.loops = true;
        t.count_in_bars = 1;
        let backing = gate_backing(&t);
        let table = crate::song::compile(&t, Some(&backing), gate_sounds(sr), sr, 1)
            .expect("the counted-in song compiles");

        // One bar of 4/4 at 90.
        assert_eq!(table.count_in().len(), 4);
        let frames = (table.count_in_samples() + table.pass_samples() * 2) as usize;
        let r = render_song(&table, &bank, frames, sr);

        let counted: Vec<u64> = r
            .clicks
            .iter()
            .filter(|(_, bar)| *bar == crate::song::COUNT_IN_BAR)
            .map(|(f, _)| *f)
            .collect();
        assert_eq!(counted.len(), 4, "the count-in plays once, not once a pass");
        let beat = (60.0 / 90.0 * sr as f64).round() as u64;
        for (i, f) in counted.iter().enumerate() {
            assert!(
                f.abs_diff(i as u64 * beat) <= 1,
                "count-in beat {i} landed at {f}, and a beat at 90 is {beat} frames"
            );
        }
        // And the piece starts the sample after the count-in ends.
        let first = r
            .clicks
            .iter()
            .find(|(_, bar)| *bar != crate::song::COUNT_IN_BAR)
            .expect("the song starts");
        assert_eq!(first.0, table.count_in_samples());
        assert_eq!(first.1, 5, "on the range's first bar, not the song's");
        assert!(r.passes >= 1, "and it comes round");
    }

    /// A range that does not loop stops at the end of its last bar, and
    /// nothing of it plays after that.
    #[test]
    fn a_song_that_does_not_loop_stops_where_it_ends() {
        let sr = 44_100u32;
        let bank = SoundBank::new(sr);
        let mut t = gate_song();
        t.range = SongRange {
            start_bar: 0,
            end_bar: 1,
        };
        t.loops = false;
        let backing = gate_backing(&t);
        let table = crate::song::compile(&t, Some(&backing), gate_sounds(sr), sr, 1)
            .expect("the short song compiles");
        let frames = (table.pass_samples() * 2) as usize;
        let r = render_song(&table, &bank, frames, sr);
        assert_eq!(r.passes, 0);
        assert_eq!(r.clicks.len(), table.ticks().len(), "one pass of clicks");
        assert_eq!(r.onsets.len(), table.band().len(), "and one of the band");
        assert!(r.clicks.iter().all(|(f, _)| *f < table.pass_samples()));
        // AND IT SAYS SO EXACTLY ONCE.
        //
        // The end of a song rides out on a beat notification, and the flag
        // that stops the rest of the buffer sounding stays up for the rest of
        // the buffer — so an ending keyed on THAT rather than on the frame it
        // happened would push one notification per remaining frame, up to a
        // whole buffer of them into a queue sized for seventeen seconds of
        // ticks. It did, before this assertion existed.
        assert_eq!(r.endings, 1, "the piece ends once, not once a frame");
    }

    /// The faders are the audio thread's and apply live: the same table,
    /// rendered twice, at two mixes.
    #[test]
    fn a_lane_turned_down_is_a_lane_turned_down() {
        let sr = 44_100u32;
        let mut t = gate_song();
        t.range = SongRange {
            start_bar: 0,
            end_bar: 1,
        };
        let backing = gate_backing(&t);
        let table = crate::song::compile(&t, Some(&backing), gate_sounds(sr), sr, 1)
            .expect("the song compiles");
        let full = SongMixGains::default();
        let off = crate::song::SongMix {
            click: 1.0,
            drums: 0.0,
            bass: 0.0,
            keys: 0.0,
        }
        .gains();
        assert_eq!(off.lane(SongLane::Drums), 0.0);
        assert_eq!(full.lane(SongLane::Drums), 1.0);
        // The table is untouched by either: the dials are applied where the
        // voice is spawned, which is what makes a fader move cost nothing.
        let before: Vec<f32> = table.band().iter().map(|e| e.slot.gain).collect();
        assert!(before.iter().all(|g| *g > 0.0));
    }

    /// How much of a sound's energy sits under 150 Hz.
    ///
    /// Four cascaded one-pole sections, each with its own state, for the
    /// same reason `laptop_band_energy` needs four: at 6 dB/octave a snare's
    /// 200 Hz fundamental still walks straight through and every drum
    /// measures as a kick. `1 - laptop_band_energy/total` does not answer
    /// this question either — that ratio counts everything ABOVE 4 kHz as
    /// well, which is where a snare's wires live, so a kick and a snare come
    /// out 0.97 and 0.89 and the test proves nothing.
    fn low_band_share(buf: &[f32], sr: u32) -> f64 {
        let total: f64 = buf.iter().map(|s| (s * s) as f64).sum();
        if total <= 0.0 {
            return 0.0;
        }
        const LP: usize = 4;
        let a = 2.0 * std::f64::consts::PI * 150.0 / sr as f64;
        let mut state = [0.0f64; LP];
        let mut low = 0.0f64;
        for &s in buf {
            let mut v = s as f64;
            for k in 0..LP {
                state[k] += a * (v - state[k]);
                v = state[k];
            }
            low += v * v;
        }
        low / total
    }

    /// THE ONE AND THE BACKBEAT.
    ///
    /// A rock groove has to put a bass drum on the one and a snare on two,
    /// and it has to be the *sounds* that land there, not just the right
    /// slots in a table: every voice here comes out of a kit file, and a
    /// bank entry that decoded to nothing would pass every check in
    /// `jam.rs` and play silence.
    #[test]
    fn a_rock_groove_puts_a_kick_on_the_one_and_a_snare_on_the_backbeat() {
        let sr = 48000;
        let bank = SoundBank::new(sr);
        let table = compile_jam(&rock_16ths()).unwrap();

        let one = table.tick(0, 0).unwrap();
        assert!(
            one.slots().iter().any(|s| s.lane == JamLane::Kick),
            "tick 0 must carry the kick"
        );
        let four = table.tick(4, 0).unwrap();
        assert!(
            four.slots().iter().any(|s| s.lane == JamLane::Snare),
            "tick 4 must carry the snare"
        );
        assert!(
            !four.slots().iter().any(|s| s.lane == JamLane::Kick),
            "the backbeat is not a kick"
        );
        assert!(four.is_accent(), "a level-2 backbeat must flash the dot");
        assert!(!one.is_accent(), "a level-1 kick must not");

        // 240 BPM sixteenths at 48 kHz.
        let tick_samples = 3000;
        let r = render_jam(&table, &bank, 1, tick_samples, 1.0);

        // Both ticks make a sound at all.
        let window = |t: usize| &r.samples[t * tick_samples..(t + 1) * tick_samples];
        for t in [0usize, 4] {
            let e: f64 = window(t).iter().map(|s| (s * s) as f64).sum();
            assert!(
                e > 1.0,
                "tick {t} rendered {e} energy — the bank gave it nothing"
            );
        }

        // And they are the right instruments. Measured on the samples
        // themselves, not on the rendered windows: the kick rings out — it
        // is supposed to — so by tick 4 its tail is still in the buffer and
        // a window comparison would be measuring the kick twice.
        let room = crate::jam::reference_bank("room").unwrap();
        let mono = |v: KitVoice, l: u8| {
            let buf = room.sample(v as u8, l, 0);
            (0..buf.len() / 2)
                .map(|i| (buf[2 * i] + buf[2 * i + 1]) * 0.5)
                .collect::<Vec<f32>>()
        };
        let kick_low = low_band_share(&mono(KitVoice::Kick, 0), sr);
        let snare_low = low_band_share(&mono(KitVoice::Snare, 1), sr);
        assert!(
            kick_low > snare_low + 0.3,
            "the kick has {kick_low:.2} of its energy under 150 Hz and the snare \
             {snare_low:.2}; those are not a kick and a snare"
        );
    }

    /// A fill belongs at the end of the chorus and nowhere else. Getting
    /// this wrong is the difference between a band and a drum machine
    /// falling downstairs.
    #[test]
    fn the_fill_plays_on_the_last_bar_of_the_chorus_and_not_before() {
        let mut cfg = rock_16ths();
        cfg.form_bars = 4;
        let mut fill = cfg.bar.clone();
        fill.kick = vec![0; 16];
        fill.snare = vec![2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1];
        cfg.fill = Some(fill);
        let table = compile_jam(&cfg).unwrap();

        let kick_on_one = |bar: u32| {
            table
                .tick(0, bar)
                .unwrap()
                .slots()
                .iter()
                .any(|s| s.lane == JamLane::Kick)
        };
        assert!(kick_on_one(0), "bar 1 of 4 is the groove");
        assert!(kick_on_one(1), "bar 2 of 4 is the groove");
        assert!(kick_on_one(2), "bar 3 of 4 is the groove");
        assert!(!kick_on_one(3), "bar 4 of 4 is the fill");

        // And it is audibly busier, rendered: the fill has a snare on every
        // sixteenth where the groove has two in the whole bar.
        // Measured through the band a laptop radiates, not broadband. A
        // fill is fourteen extra snares where the groove had two kicks, and
        // a kick carries almost all of its energy below 120 Hz: broadband
        // the swap reads as only 28% busier, which is the same trap the
        // original drum accent fell into (`laptop_band_energy`). On the
        // speaker the musician is actually listening through it is not
        // close.
        let bank = SoundBank::new(48000);
        let tick_samples = 3000;
        let r = render_jam(&table, &bank, 4, tick_samples, 1.0);
        let bar_len = 16 * tick_samples;
        let energy =
            |b: usize| laptop_band_energy(&r.samples[b * bar_len..(b + 1) * bar_len], 48000);
        assert!(
            energy(3) > energy(0) * 1.5,
            "the fill bar ({:.0}) is not busier than the groove ({:.0}) on a small \
             speaker",
            energy(3),
            energy(0)
        );
    }

    /// `formBar` and `chorus` are what the transport reads out — "bar 9 of
    /// 12, chorus 2" — so they have to survive the wrap.
    #[test]
    fn the_form_wraps_from_the_last_bar_to_the_top_of_the_next_chorus() {
        let (mut bar, mut chorus) = (0u32, 1u32);
        let mut seen = Vec::new();
        // Two full choruses of a 4-bar form, one bar at a time.
        for _ in 0..8 {
            seen.push((bar, chorus));
            let (b, c) = advance_form(bar, chorus, 4);
            bar = b;
            chorus = c;
        }
        assert_eq!(
            seen,
            vec![
                (0, 1),
                (1, 1),
                (2, 1),
                (3, 1),
                (0, 2),
                (1, 2),
                (2, 2),
                (3, 2)
            ]
        );
        assert_eq!((bar, chorus), (0, 3), "the ninth bar opens chorus 3");

        // A one-bar form is a new chorus every bar, and never bar 1.
        assert_eq!(advance_form(0, 1, 1), (0, 2));

        // A zero-bar form cannot exist — `compile` rejects it — but the
        // audio thread must not spin on one if it ever arrived.
        assert_eq!(advance_form(0, 1, 0), (0, 2));
    }

    // -----------------------------------------------------------------
    // Moving through the form: jump and loop
    // -----------------------------------------------------------------

    fn at(bar: u32) -> JamPosition {
        JamPosition {
            jump: Some(bar),
            loop_bars: None,
        }
    }

    fn looping(start: u32, end: u32) -> JamPosition {
        JamPosition {
            jump: None,
            loop_bars: Some((start, end)),
        }
    }

    /// SKIP TO THE BRIDGE, AND ARRIVE ON THE BAR LINE.
    ///
    /// A jump replaces the advance, so the bar after bar 3 is wherever you
    /// asked for. It does not touch the chorus — you have moved inside the
    /// form, not been round it — and it happens once.
    #[test]
    fn a_jump_lands_on_the_next_bar_line_and_is_spent() {
        let (bar, chorus, left) = next_form_position(3, 2, 12, at(8));
        assert_eq!((bar, chorus), (8, 2), "bar 9 of chorus 2, not bar 5");
        assert_eq!(left, JamPosition::default(), "the jump is spent");

        // The bar after that is the ordinary next one.
        let (bar, chorus, _) = next_form_position(bar, chorus, 12, left);
        assert_eq!((bar, chorus), (9, 2));
    }

    #[test]
    fn a_jump_to_the_top_of_the_form_does_not_invent_a_chorus() {
        // Going back to bar 1 is the musician taking the form from the top
        // again, not the band completing a chorus. The transport would read
        // "chorus 7" after six restarts if this counted.
        let (bar, chorus, _) = next_form_position(5, 3, 12, at(0));
        assert_eq!((bar, chorus), (0, 3));
    }

    /// LOOP THE TURNAROUND.
    ///
    /// The last four bars of a twelve-bar blues, round and round: the
    /// advance out of bar 12 wraps to bar 1, the loop catches it and puts it
    /// on bar 9 — and the wrap it caught is not a chorus, because the form
    /// was never played through.
    #[test]
    fn a_loop_holds_the_form_inside_it_and_does_not_count_choruses() {
        let l = looping(8, 11);
        let mut bar = 8u32;
        let mut chorus = 2u32;
        let mut seen = Vec::new();
        for _ in 0..9 {
            seen.push(bar);
            let (b, c, left) = next_form_position(bar, chorus, 12, l);
            assert_eq!(left, l, "a loop is not consumed by being used");
            bar = b;
            chorus = c;
        }
        assert_eq!(seen, vec![8, 9, 10, 11, 8, 9, 10, 11, 8]);
        assert_eq!(chorus, 2, "two times round a turnaround is not two choruses");
    }

    #[test]
    fn a_loop_that_is_the_whole_form_still_counts_choruses() {
        // Looping bars 1-12 of a twelve-bar form is just playing the form,
        // and the transport has to go on counting: bar 12 wraps to bar 1,
        // which is inside the loop, so nothing is caught and nothing is
        // undone.
        let (bar, chorus, _) = next_form_position(11, 4, 12, looping(0, 11));
        assert_eq!((bar, chorus), (0, 5));
    }

    #[test]
    fn a_loop_that_does_not_reach_the_end_never_wraps_at_all() {
        // Bars 1-4 of a twelve-bar form: the advance out of bar 4 gives bar
        // 5, which the loop catches. No wrap happened, so there is no
        // chorus to undo either way.
        let (bar, chorus, _) = next_form_position(3, 6, 12, looping(0, 3));
        assert_eq!((bar, chorus), (0, 6));
    }

    #[test]
    fn a_loop_of_one_bar_repeats_that_bar() {
        let (bar, chorus, _) = next_form_position(5, 1, 12, looping(5, 5));
        assert_eq!((bar, chorus), (5, 1));
    }

    /// While a loop is set, the loop is where the form lives — so a jump
    /// that would land outside it goes to the top of the loop instead. A UI
    /// that means "leave the loop" sends `loop: null` in the same command,
    /// which is why the contract carries both halves at once.
    #[test]
    fn a_jump_outside_a_loop_lands_at_the_top_of_the_loop() {
        let pos = JamPosition {
            jump: Some(1),
            loop_bars: Some((8, 11)),
        };
        let (bar, chorus, left) = next_form_position(9, 3, 12, pos);
        assert_eq!((bar, chorus), (8, 3));
        assert_eq!(left.jump, None, "the jump is still spent");
        assert_eq!(left.loop_bars, Some((8, 11)), "the loop is still set");

        // Inside the loop, a jump is exactly a jump.
        let inside = JamPosition {
            jump: Some(10),
            loop_bars: Some((8, 11)),
        };
        let (bar, _, _) = next_form_position(8, 3, 12, inside);
        assert_eq!(bar, 10);
    }

    /// The command is checked against the form before it ever reaches the
    /// audio thread, so these cannot arrive — but the callback indexes the
    /// band-state table with what comes out of here, and it clamps rather
    /// than trusting a number it did not compute.
    #[test]
    fn a_bar_the_form_does_not_have_is_clamped_not_indexed() {
        let (bar, _, _) = next_form_position(0, 1, 4, at(99));
        assert_eq!(bar, 3);
        let (bar, _, _) = next_form_position(0, 1, 4, looping(99, 200));
        assert_eq!(bar, 3);
        // A form of no bars cannot exist and must not underflow the clamp.
        let (bar, _, _) = next_form_position(0, 1, 0, at(7));
        assert_eq!(bar, 0);
    }

    /// PRESS PLAY WITH A LOOP SET AND YOU GET THE LOOP.
    ///
    /// The top of the form is the top of the loop when there is one:
    /// hearing one bar of the head before the turnaround grabs you is not
    /// what "loop the turnaround" means. With no band at all it is bar 0 and
    /// `Full`, which is what the contract says `formBar` and `bandState`
    /// mean on a plain click.
    #[test]
    fn starting_again_starts_at_the_top_of_the_loop() {
        let mut cfg = practising_band();
        cfg.practice = Some(JamPracticeConfig {
            drop_out: None,
            trade: Some(JamTrade {
                band_bars: 4,
                you_bars: 4,
            }),
        });
        let table = compile_jam(&cfg).unwrap();

        let (bar, state, _) = form_restart(Some(&table), JamPosition::default());
        assert_eq!((bar, state), (0, JamBandState::Full));

        // Bars 5-8 of a twelve-bar form are the four you play in a 4/4
        // trade, so restarting into the loop has to restart into that state
        // as well — the band state is read off the bar, not assumed.
        let (bar, state, _) = form_restart(Some(&table), looping(4, 7));
        assert_eq!((bar, state), (4, JamBandState::HatsOnly));

        // A loop that outran its form cannot index past the end.
        let (bar, state, _) = form_restart(Some(&table), looping(40, 47));
        assert_eq!((bar, state), (11, table.band_state(11)));

        // No band: bar 0, full, whatever the position says.
        let (bar, state, _) = form_restart(None, looping(4, 7));
        assert_eq!(
            (bar, state),
            (0, JamBandState::Full),
            "the contract's values for a plain click"
        );
    }

    /// PRESS PLAY WITH A BAR PICKED AND YOU START ON THAT BAR.
    ///
    /// The bug this pins: a restart went to the top of the loop (or bar 0)
    /// and left the jump pending, so the bar line at the END of the first
    /// bar was what finally took it. You picked the bridge, pressed play,
    /// and heard one bar of the head first.
    ///
    /// The screen already states the rule this now follows —
    /// `useJamSession.ts` on `currentBar`: "while stopped, the one the next
    /// press of play will start on, which is the pending jump if there is
    /// one." The engine agrees with the drawing now.
    #[test]
    fn starting_again_starts_on_the_bar_that_was_picked() {
        let mut cfg = practising_band();
        cfg.form_bars = 12;
        cfg.practice = Some(JamPracticeConfig {
            drop_out: None,
            trade: Some(JamTrade {
                band_bars: 4,
                you_bars: 4,
            }),
        });
        let table = compile_jam(&cfg).unwrap();

        // A jump on its own: bar 8, and the band state read off bar 8.
        let (bar, state, left) = form_restart(Some(&table), at(8));
        assert_eq!(bar, 8);
        assert_eq!(state, table.band_state(8));
        assert_eq!(left.jump, None, "the press of play is what it waited for");

        // A jump WITH a loop set: the jump wins. The musician asked for that
        // bar after setting the loop, so it is the newer instruction.
        let picked = JamPosition {
            jump: Some(2),
            loop_bars: Some((8, 11)),
        };
        let (bar, _, left) = form_restart(Some(&table), picked);
        assert_eq!(bar, 2, "the bar that was picked, not the top of the loop");
        assert_eq!(left.loop_bars, Some((8, 11)), "and the loop is still set");

        // No jump: the top of the loop, exactly as before.
        let (bar, _, _) = form_restart(Some(&table), looping(8, 11));
        assert_eq!(bar, 8);

        // A jump past the end of the form is clamped, not indexed — the
        // command surface refuses those, and the audio thread does not
        // trust a number it did not compute.
        let (bar, _, _) = form_restart(Some(&table), at(99));
        assert_eq!(bar, 11);
    }

    /// A TAKE THAT FINISHED SAYS SO ONCE.
    ///
    /// The bug this pins: the callback raised the "it ended" flag on every
    /// buffer after the take ran out, and the event loop's 50 ms pass turned
    /// each one into a `take-playback-ended`, so the UI was told the take
    /// had finished twenty times a second for as long as it was left alone.
    /// Running out is not an event that happens once by itself — it is a
    /// state the playback stays in — so the "once" has to be a latch.
    #[test]
    fn a_take_that_ran_out_is_only_reported_once() {
        let play = crate::take::TakePlayback {
            pcm: std::sync::Arc::new(vec![0.1f32; 8]),
            sample_rate: 48_000,
        };
        let mut pos = 0.0f64;
        let mut ended_latch = false;
        let mut reports = 0;
        // Two hundred buffers of eight frames each: the first few are the
        // take, and every one after it reads past the end.
        for _ in 0..200 {
            let mut ran_out = false;
            for _ in 0..8 {
                if play.sample_at(pos).is_none() {
                    ran_out = true;
                }
                pos += play.step(48_000);
            }
            if should_report_take_end(ran_out, &mut ended_latch) {
                reports += 1;
            }
        }
        assert_eq!(reports, 1, "one ending, not one per buffer");

        // And a new take installed clears the latch — the callback does that
        // where it resets `take_play_pos` — so the NEXT one can end too.
        ended_latch = false;
        assert!(should_report_take_end(true, &mut ended_latch));
        assert!(!should_report_take_end(true, &mut ended_latch));
    }

    /// The handoff, end to end, without a sound card: the command thread
    /// hands a position over, the generation moves, and the value that comes
    /// back out is the one that went in.
    #[test]
    fn a_position_crosses_to_the_audio_thread_behind_its_own_generation() {
        let handoff = JamHandoff::new();
        let start = handoff.position_generation.load(Ordering::Acquire);
        assert_eq!(handoff.position(), JamPosition::default());

        handoff.set_position(looping(4, 7));
        assert_eq!(handoff.position(), looping(4, 7));
        let after_loop = handoff.position_generation.load(Ordering::Acquire);
        assert!(after_loop > start);

        // The SAME command again still moves the generation. The audio
        // thread consumes a jump out of its own copy and never tells this
        // side, so "jump to bar 9" pressed twice has to arrive twice.
        let jump = JamPosition {
            jump: Some(8),
            loop_bars: Some((4, 7)),
        };
        handoff.set_position(jump);
        let once = handoff.position_generation.load(Ordering::Acquire);
        handoff.set_position(jump);
        assert!(
            handoff.position_generation.load(Ordering::Acquire) > once,
            "a repeated jump is a second jump, not a no-op"
        );
    }

    /// A table arriving re-checks the position against the form it brings.
    #[test]
    fn a_new_table_rewrites_the_position_it_was_aimed_at() {
        let handoff = JamHandoff::new();
        handoff.set_position(JamPosition {
            jump: Some(9),
            loop_bars: Some((8, 11)),
        });
        // A twelve-bar form: the loop still fits, the jump is stale.
        let mut twelve = practising_band();
        twelve.form_bars = 12;
        handoff.set(Some(Arc::new(compile_jam(&twelve).unwrap())));
        assert_eq!(handoff.position(), looping(8, 11));

        // Then a four-bar loop form, which has no bar 9 to loop to.
        let mut four = practising_band();
        four.form_bars = 4;
        handoff.set(Some(Arc::new(compile_jam(&four).unwrap())));
        assert_eq!(handoff.position(), JamPosition::default());
    }

    /// THE BAR-AHEAD BASS MUST NOT SWALLOW A FOOTSWITCH.
    ///
    /// The bug this pins: `set_jam` is not only "load a jam". It is also the
    /// bar-ahead send the UI posts on almost every bar line so the bass and
    /// the keys know next bar's chord — four to six a chorus. Each one ended
    /// with the position being re-checked against the new table, and the
    /// re-check drops a pending jump unconditionally, so a jump asked for in
    /// the window between two of those sends was thrown away before the bar
    /// line it was waiting for: the band played straight on and the marker
    /// the UI had drawn never cleared.
    ///
    /// The same twelve bars arriving again is not a new set of bar numbers.
    #[test]
    fn a_bar_ahead_table_of_the_same_length_keeps_a_pending_jump() {
        let handoff = JamHandoff::new();
        let mut cfg = practising_band();
        cfg.form_bars = 12;
        let table = || Some(Arc::new(compile_jam(&cfg).unwrap()));

        handoff.set(table());
        handoff.set_position(JamPosition {
            jump: Some(9),
            loop_bars: Some((8, 11)),
        });
        let before = handoff.position_generation.load(Ordering::Acquire);

        // A chorus of bar-ahead sends, all twelve bars long.
        for _ in 0..6 {
            handoff.set(table());
        }
        assert_eq!(
            handoff.position().jump,
            Some(9),
            "the jump was still waiting for its bar line"
        );
        assert_eq!(handoff.position().loop_bars, Some((8, 11)));
        assert_eq!(
            handoff.position_generation.load(Ordering::Acquire),
            before,
            "and the callback was not woken to be handed what it already has"
        );

        // A form of a DIFFERENT length is a different set of bar numbers,
        // and there the jump still goes: bar 9 of an eight-bar loop is not
        // the bar anybody pointed at.
        let mut eight = practising_band();
        eight.form_bars = 8;
        handoff.set(Some(Arc::new(compile_jam(&eight).unwrap())));
        assert_eq!(handoff.position().jump, None);

        // And taking the band away is a change too.
        handoff.set_position(JamPosition {
            jump: Some(3),
            loop_bars: None,
        });
        handoff.set(None);
        assert_eq!(handoff.position().jump, None);
    }

    // -----------------------------------------------------------------
    // `applyAt` and `endsForm` — the arrangement's two engine additions
    // -----------------------------------------------------------------

    /// The callback's table handshake, walked on the tick grid.
    ///
    /// Deliberately a copy of the callback's order of operations rather than
    /// a shared helper, for the same reason `render_jam` is one: a change in
    /// the callback that this does not follow shows up as a failing
    /// assertion instead of as a harness that quietly moved with it. The
    /// order it copies is the one that matters — a table is picked up at the
    /// TOP of a buffer, `swap_defers` decides whether it plays or waits, and
    /// a waiting one becomes current at the bar line, after the bar's last
    /// tick has already been read.
    ///
    /// `sends` is `(bar, tick, table)`: a `set_jam` landing just before that
    /// tick would have been played. What comes back is, per bar and per
    /// tick, which lanes the band actually sounded — which is what "plays on
    /// the NEXT downbeat and not this one" is a claim about.
    fn play_the_handshake(
        initial: &Arc<JamTable>,
        sends: &[(u32, u32, Arc<JamTable>)],
        bars: u32,
    ) -> Vec<Vec<Vec<JamLane>>> {
        let ticks = initial.ticks_per_bar();
        let mut current: Option<Arc<JamTable>> = Some(initial.clone());
        let mut pending: Option<Arc<JamTable>> = None;
        let mut jam_bar = 0u32;
        let mut out = Vec::new();
        for bar in 0..bars {
            let mut played = Vec::new();
            for tick in 0..ticks {
                // The top of a buffer: whatever `set_jam` handed over.
                if let Some((_, _, t)) = sends.iter().find(|(b, k, _)| *b == bar && *k == tick) {
                    let incoming = Some(t.clone());
                    if crate::jam::swap_defers(
                        current.as_deref(),
                        incoming.as_deref(),
                        true,
                        false,
                    ) {
                        pending = incoming;
                    } else {
                        current = incoming;
                    }
                }
                played.push(
                    current
                        .as_deref()
                        .and_then(|t| t.tick(tick, jam_bar))
                        .map(|t| t.slots().iter().map(|s| s.lane).collect::<Vec<_>>())
                        .unwrap_or_default(),
                );
            }
            // The bar line: the held table becomes the one the next tick
            // reads, and then the form moves.
            if let Some(p) = pending.take() {
                current = Some(p);
            }
            if let Some(ref t) = current {
                let (b, _, _) =
                    next_form_position(jam_bar, 1, t.form_bars(), JamPosition::default());
                jam_bar = b;
            }
            out.push(played);
        }
        out
    }

    /// Which ticks of a bar had a kick on them.
    fn kicks_on(bar: &[Vec<JamLane>]) -> Vec<usize> {
        bar.iter()
            .enumerate()
            .filter(|(_, lanes)| lanes.contains(&JamLane::Kick))
            .map(|(i, _)| i)
            .collect()
    }

    /// A four-on-the-floor bar and a bar with the kick on the ANDs — two
    /// grooves an ear tells apart on the first tick.
    fn kick_on(ticks: &[usize]) -> JamConfig {
        let mut cfg = rock_16ths();
        cfg.form_bars = 4;
        cfg.bar.kick = vec![0; 16];
        for &t in ticks {
            cfg.bar.kick[t] = 2;
        }
        cfg.bar.snare = vec![0; 16];
        cfg.bar.hat = vec![0; 16];
        cfg
    }

    /// A BAR-LINE TABLE PLAYS ON THE NEXT DOWNBEAT AND NOT ON THIS ONE.
    ///
    /// The whole of `applyAt`, measured where it has to be true: the tick
    /// grid. The arrangement's sender posts the next bar's groove ON this
    /// bar's downbeat — a breakdown dropping to the hats, a stop-time bar, a
    /// fill scaled to the dynamics — and every one of those is a change to
    /// the DRUMS, which the old rule played at once. That put next bar's
    /// drummer a bar early, on every bar of every arrangement.
    ///
    /// So the same send is run twice, differing in one field, and what is
    /// asserted is which ticks the kick landed on.
    #[test]
    fn a_bar_line_table_sent_at_the_downbeat_plays_on_the_next_downbeat() {
        let four_on_the_floor = Arc::new(compile_jam(&kick_on(&[0, 4, 8, 12])).unwrap());
        let mut next_bar = kick_on(&[2, 6, 10, 14]);

        // Sent at tick 0 of bar 1, asking for the bar line.
        next_bar.apply_at = Some(crate::jam::ApplyAt::BarLine);
        let waits = Arc::new(compile_jam(&next_bar).unwrap());
        let played = play_the_handshake(
            &four_on_the_floor,
            &[(1, 0, waits)],
            4,
        );
        assert_eq!(kicks_on(&played[0]), vec![0, 4, 8, 12], "bar 0, untouched");
        assert_eq!(
            kicks_on(&played[1]),
            vec![0, 4, 8, 12],
            "the bar the table arrived in is the drummer who was already playing it"
        );
        assert_eq!(
            kicks_on(&played[2]),
            vec![2, 6, 10, 14],
            "and the next downbeat is where the new drummer comes in"
        );

        // The same send without `applyAt`, which is a musician turning a
        // dial: heard on the next tick, mid-bar, exactly as before.
        next_bar.apply_at = None;
        let now = Arc::new(compile_jam(&next_bar).unwrap());
        let played = play_the_handshake(&four_on_the_floor, &[(1, 0, now)], 4);
        assert_eq!(kicks_on(&played[0]), vec![0, 4, 8, 12]);
        assert_eq!(
            kicks_on(&played[1]),
            vec![2, 6, 10, 14],
            "a change with no `applyAt` on it still plays at once"
        );
    }

    /// ...and a table that arrives mid-bar asking for the bar line waits for
    /// the END of that bar, not for the tick after it. The rest of the bar
    /// is the drummer who started it.
    #[test]
    fn a_bar_line_table_sent_mid_bar_finishes_the_bar_first() {
        let four_on_the_floor = Arc::new(compile_jam(&kick_on(&[0, 4, 8, 12])).unwrap());
        let mut next_bar = kick_on(&[2, 6, 10, 14]);
        next_bar.apply_at = Some(crate::jam::ApplyAt::BarLine);
        let waits = Arc::new(compile_jam(&next_bar).unwrap());
        let played = play_the_handshake(&four_on_the_floor, &[(0, 5, waits)], 3);
        assert_eq!(
            kicks_on(&played[0]),
            vec![0, 4, 8, 12],
            "the bar it landed in finished the way it started"
        );
        assert_eq!(kicks_on(&played[1]), vec![2, 6, 10, 14]);
    }

    /// The callback's frame loop, ending included, into a real take ring.
    ///
    /// A copy of the callback's arithmetic for the same reason `render_jam`
    /// is one — and this one has to carry the part `render_jam` does not:
    /// BUFFERS. The ending is a decision made inside a buffer, at a tick
    /// that is very unlikely to be a buffer boundary, and what happens to
    /// the rest of that buffer is the whole question a take asks. So this
    /// runs a fixed buffer size across the bar line, pushes every buffer
    /// into the ring the way the callback does, and lowers the transport
    /// flag where the callback lowers it.
    ///
    /// `bars` is ONE TABLE PER BAR OF THE FORM, which is what the bar-ahead
    /// sender actually produces: the same band all the way round, and
    /// `endsForm` on the last bar only. It is also what makes this a
    /// comparison — the same run with a plain table in the last slot is the
    /// band that does not stop.
    ///
    /// Returns the drained ring and the frame the form ended on.
    #[allow(clippy::too_many_arguments)]
    fn take_of_a_band(
        bars: &[&JamTable],
        bank: &SoundBank,
        sr: u32,
        tick_samples: u64,
        buffer_frames: usize,
        buffers: usize,
    ) -> (Vec<f32>, Option<usize>) {
        let table = bars[0];
        let ring = crate::take::TakeRing::new(buffer_frames * buffers + 1);
        let mut voices: Vec<Voice> = Vec::new();
        let mut bus = DrumBus::new(sr);
        bus.set_drive(table.bus_drive, table.bus_shape);
        let choke_frames = (CHOKE_FADE_SECS * sr as f32) as u32;
        let drift_frames = (DRIFT_MAX_SECS * sr as f32) as u32;
        let ticks_per_bar = table.ticks_per_bar();
        let kit = BandBanks::of(Some(table));

        let mut data = vec![0.0f32; buffer_frames];
        let mut sample_counter = 0u64;
        let mut next_beat_sample = 0u64;
        let mut tick_index = 0u32;
        let mut jam_bar = 0u32;
        let mut playing = true;
        let mut armed = false;
        let mut ended_at: Option<usize> = None;
        let mut frames_written = 0usize;

        for _ in 0..buffers {
            if !playing {
                // The callback's silent path: zeroes out, and the ring gets
                // them, because the band is the take's clock.
                data.iter_mut().for_each(|s| *s = 0.0);
                ring.push_strided(&data, 1);
                frames_written += buffer_frames;
                continue;
            }
            let mut form_ended_here = false;
            for frame in 0..buffer_frames {
                if !form_ended_here && sample_counter >= next_beat_sample {
                    // Armed a tick ago, spent here — the callback's order.
                    let form_ends_now = armed;
                    armed = false;
                    // Whichever table the bar-ahead sender put on this bar.
                    let playing_table = bars[jam_bar as usize % bars.len()];
                    // Did the BAND play this tick? The callback asks
                    // `jam_play`, which answers `Click` through a count-in
                    // and a ramp; here there is neither, so the table is the
                    // whole of the question.
                    let band_played = playing_table.tick(tick_index, jam_bar).is_some();
                    if let Some(tick) = playing_table.tick(tick_index, jam_bar) {
                        for slot in tick.slots() {
                            spawn_band_voice(
                                &mut voices,
                                slot,
                                1.0,
                                jam_bar,
                                tick_index,
                                ticks_per_bar,
                                tick_samples,
                                drift_frames,
                                choke_frames,
                            );
                        }
                    }
                    tick_index += 1;
                    if tick_index >= ticks_per_bar {
                        tick_index = 0;
                        // The bar line, in the callback's order: the ending
                        // is asked of the table that played THIS bar, then
                        // the form moves.
                        armed = band_played && playing_table.ends_form();
                        let (b, _, _) = next_form_position(
                            jam_bar,
                            1,
                            table.form_bars(),
                            JamPosition::default(),
                        );
                        jam_bar = b;
                    }
                    next_beat_sample = sample_counter + tick_samples;
                    if form_ends_now {
                        form_ended_here = true;
                        playing = false;
                        voices.clear();
                        ended_at = Some(frames_written + frame);
                    }
                }
                let mut band_l = 0.0f32;
                let mut band_r = 0.0f32;
                for v in voices.iter_mut() {
                    if v.delay > 0 {
                        v.delay -= 1;
                        continue;
                    }
                    let buf = jam_sample(bank, kit, v.sound_id);
                    let n = if v.stereo { buf.len() / 2 } else { buf.len() };
                    let limit = if v.max_samples > 0 {
                        v.max_samples.min(n)
                    } else {
                        n
                    };
                    if v.position < limit {
                        let g = v.choke_gain();
                        let (l, r) = if v.stereo {
                            (buf[2 * v.position], buf[2 * v.position + 1])
                        } else {
                            (buf[v.position], buf[v.position])
                        };
                        band_l += l * v.amp_l * g;
                        band_r += r * v.amp_r * g;
                    }
                    if v.fade_left > 0 {
                        v.fade_left -= 1;
                    }
                    v.position += 1;
                }
                let (l, r) = bus.process(band_l, band_r);
                data[frame] = ((l + r) * 0.5).clamp(-1.0, 1.0);
                sample_counter += 1;
            }
            voices.retain(|v| {
                let buf = jam_sample(bank, kit, v.sound_id);
                let n = if v.stereo { buf.len() / 2 } else { buf.len() };
                !v.done(n)
            });
            ring.push_strided(&data, 1);
            frames_written += buffer_frames;
        }
        let mut out = Vec::new();
        ring.drain_into(&mut out);
        (out, ended_at)
    }

    /// AN ENDING DURING A TAKE LEAVES A WHOLE TAKE.
    ///
    /// The risk the ending carries: a transport that goes down as soon as
    /// the engine knows the song is over takes the last bar of the recording
    /// with it, and a musician who played a whole chorus gets back all of it
    /// but the end. So the ending is decided on the audio thread, at the bar
    /// line, with the bar already rendered — and the way to say that as a
    /// fact is to record the same band twice, once with the ending honoured
    /// and once without, and compare.
    ///
    /// Bit for bit up to the last downbeat, then silence. Nothing of the
    /// song is missing and nothing of the band leaks past its end.
    #[test]
    fn an_ending_during_a_take_leaves_a_whole_take() {
        let sr = 48_000u32;
        let bank = SoundBank::new(sr);
        let mut cfg = rock_16ths();
        cfg.form_bars = 4;
        // A hit on the last tick of the bar, so "the last bar is all there"
        // is a claim about the last tick and not about the last downbeat.
        cfg.bar.snare[15] = 2;
        let plain = compile_jam(&cfg).unwrap();
        // The bar-ahead sender's last bar, and the only thing about it that
        // differs: `endsForm` says nothing about what the band plays, so the
        // two runs below are the same band bar for bar.
        cfg.ends_form = Some(true);
        cfg.apply_at = Some(crate::jam::ApplyAt::BarLine);
        let last = compile_jam(&cfg).unwrap();

        // 120 BPM sixteenths, and a buffer that is not a whole number of
        // ticks: 256 frames against a 6 000-frame tick, so the bar line
        // lands inside a buffer rather than on the edge of one.
        let tick_samples = (sr as u64) * 60 / 120 / 4;
        let bar_frames = tick_samples as usize * plain.ticks_per_bar() as usize;
        let buffer_frames = 256usize;
        // Eight bars' worth of buffers: twice the form, so the ending has a
        // second chorus to fail to stop.
        let buffers = (bar_frames * 8).div_ceil(buffer_frames);

        let ending = [&plain, &plain, &plain, &last];
        let looping = [&plain, &plain, &plain, &plain];
        let (ended, at) =
            take_of_a_band(&ending, &bank, sr, tick_samples, buffer_frames, buffers);
        let (whole, none) =
            take_of_a_band(&looping, &bank, sr, tick_samples, buffer_frames, buffers);
        assert_eq!(none, None, "the control run must not stop");

        let at = at.expect("the form ended");
        assert_eq!(
            at,
            bar_frames * plain.form_bars() as usize,
            "the song ended somewhere other than the downbeat after its last bar"
        );

        // Every sample of the song is the one the band would have played.
        assert_eq!(ended.len(), whole.len());
        for i in 0..at {
            assert_eq!(
                ended[i], whole[i],
                "the take and the band disagree at frame {i} of {at}"
            );
        }
        // And the last bar is really in it, not a bar of decay.
        let last_bar: f64 = ended[at - bar_frames..at]
            .iter()
            .map(|s| (s * s) as f64)
            .sum();
        let last_tick: f64 = ended[at - tick_samples as usize..at]
            .iter()
            .map(|s| (s * s) as f64)
            .sum();
        assert!(last_bar > 1.0, "the last bar of the take is silent");
        assert!(
            last_tick > 0.01,
            "the take stops before the last tick of the last bar"
        );
        // Nothing after the end of the song.
        for (i, s) in ended[at..].iter().enumerate() {
            assert_eq!(*s, 0.0, "the band played on {i} frames past the end");
        }
    }

    /// A MUSICIAN WHO MOVES THE FORM IS NOT FINISHED.
    ///
    /// The rule that keeps a song from stopping under somebody's hand: a
    /// jump or a loop asked for during the last bar cancels its ending. A
    /// command that names neither is asking for neither — clearing a loop is
    /// not a request for another chorus — which is also what keeps the
    /// housekeeping a new table does out of it, since that only ever takes a
    /// jump or a loop away.
    #[test]
    fn a_jump_or_a_loop_cancels_an_ending_and_clearing_one_does_not() {
        assert!(position_cancels_an_ending(at(8)), "a jump");
        assert!(position_cancels_an_ending(looping(4, 7)), "a loop");
        assert!(
            position_cancels_an_ending(JamPosition {
                jump: Some(2),
                loop_bars: Some((0, 3)),
            }),
            "both at once"
        );
        assert!(
            !position_cancels_an_ending(JamPosition::default()),
            "`{{ jumpTo: null, loop: null }}` clears a loop and asks for nothing"
        );
    }

    /// A ONE-BAR TUNE ENDS AFTER ITS ONE BAR.
    ///
    /// The smallest case, and the one that catches an ending fired where it
    /// is armed rather than a tick later: with a single bar there is no
    /// earlier bar for the mistake to hide in, and the stop lands either on
    /// the downbeat or a sixteenth before it.
    #[test]
    fn a_form_that_ends_does_not_come_round_again() {
        let sr = 48_000u32;
        let bank = SoundBank::new(sr);
        let mut cfg = rock_16ths();
        cfg.form_bars = 1;
        cfg.ends_form = Some(true);
        let table = compile_jam(&cfg).unwrap();
        let tick_samples = (sr as u64) * 60 / 120 / 4;
        let bar_frames = tick_samples as usize * table.ticks_per_bar() as usize;
        let buffers = (bar_frames * 3).div_ceil(256);
        let (_, at) = take_of_a_band(&[&table], &bank, sr, tick_samples, 256, buffers);
        assert_eq!(at, Some(bar_frames));
    }

    /// A LOCK THAT PANICKED MUST NOT LOOK LIKE A TABLE THAT ARRIVED.
    ///
    /// The generation counter is the audio thread's only evidence that the
    /// slot behind it changed. Bumping it on a lock that could not be taken
    /// would send the callback to `try_lock` a poisoned mutex, find nothing,
    /// and record a generation for a write that never happened — after
    /// which the real next table would look like no change at all.
    #[test]
    fn a_poisoned_handoff_leaves_the_generation_where_it_was() {
        let handoff = Arc::new(JamHandoff::new());
        let table = Arc::new(compile_jam(&rock_16ths()).unwrap());
        handoff.set(Some(table));
        let good = handoff.generation.load(Ordering::Acquire);
        let good_pos = handoff.position_generation.load(Ordering::Acquire);

        // Poison both slots the way a panic inside the lock would.
        let h = handoff.clone();
        let _ = std::thread::spawn(move || {
            let _g = h.table.lock().unwrap();
            panic!("poisoning the table slot");
        })
        .join();
        let h = handoff.clone();
        let _ = std::thread::spawn(move || {
            let _g = h.position.lock().unwrap();
            panic!("poisoning the position slot");
        })
        .join();
        assert!(handoff.table.lock().is_err() && handoff.position.lock().is_err());

        handoff.set(None);
        handoff.set_position(looping(1, 2));
        assert_eq!(
            handoff.generation.load(Ordering::Acquire),
            good,
            "no write happened, so no news was announced"
        );
        assert_eq!(handoff.position_generation.load(Ordering::Acquire), good_pos);
    }

    /// THE RULE THE CONTRACT ENCODES.
    ///
    /// The UI sets subdivision and beat groups before it calls `set_jam`.
    /// When it has not, the engine plays the click: guessing which column
    /// of the table is which beat would put the band in the wrong place,
    /// which is far worse than a plain metronome.
    #[test]
    fn a_table_that_does_not_fit_the_bar_plays_the_click() {
        let table = compile_jam(&rock_16ths()).unwrap();
        assert_eq!(table.ticks_per_bar(), 16);

        // 4 beats x 4 ticks = 16. The band plays.
        assert!(matches!(
            jam_play(Some(&table), false, false, false, 4, 4, 0, 0, 0),
            JamPlay::Band(_)
        ));

        // Same bar, eighth notes: 8 ticks, not 16.
        assert_eq!(
            jam_play(Some(&table), false, false, false, 4, 2, 0, 0, 0),
            JamPlay::Mismatch
        );
        // Same resolution, a 3/4 bar: 12 ticks, not 16.
        assert_eq!(
            jam_play(Some(&table), false, false, false, 3, 4, 0, 0, 0),
            JamPlay::Mismatch
        );
        // And a meter wide enough to overflow the product.
        assert_eq!(
            jam_play(Some(&table), false, false, false, u32::MAX, 4, 0, 0, 0),
            JamPlay::Mismatch
        );
    }

    /// The count-in and the speed ramp each own the click while they run.
    #[test]
    fn the_count_in_and_the_ramp_keep_the_click() {
        let table = compile_jam(&rock_16ths()).unwrap();
        assert_eq!(
            jam_play(Some(&table), true, false, false, 4, 4, 0, 0, 0),
            JamPlay::Click,
            "the count-in beeps; the band waits"
        );
        assert_eq!(
            jam_play(Some(&table), false, false, true, 4, 4, 0, 0, 0),
            JamPlay::Click,
            "a drill ramps the click. Combining the two is Jam 2"
        );
        assert_eq!(
            jam_play(None, false, false, false, 4, 4, 0, 0, 0),
            JamPlay::Click,
            "no jam, no band"
        );
        // AND THESE THREE ARE ALSO WHAT STOPS A SONG ENDING BEFORE IT
        // STARTS. The tick loop arms an `endsForm` ending only on a bar the
        // band actually played, and "actually played" is this function
        // answering `Band` — so a one-bar song cannot end on the count-in's
        // own bar line, which it would otherwise reach before a note of it
        // had sounded.
        assert!(matches!(
            jam_play(Some(&table), false, false, false, 4, 4, 0, 0, 0),
            JamPlay::Band(_)
        ));
    }

    /// `rock_16ths`, with a tom fill and the pickup switched on: the fixture
    /// for a jam whose drummer plays it in.
    fn rock_16ths_played_in() -> JamConfig {
        let mut cfg = rock_16ths();
        let mut fill = cfg.bar.clone();
        fill.kick = vec![0; 16];
        fill.snare = vec![0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0];
        fill.hat = vec![1; 16];
        fill.tom_hi = vec![0; 16];
        fill.tom_lo = vec![0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 4];
        cfg.fill = Some(fill);
        cfg.pickup = Some(true);
        cfg
    }

    /// THE PICKUP, THROUGH THE SAME FUNCTION EVERY OTHER TICK GOES THROUGH.
    ///
    /// Three clicks and a fill: the beats of the count-in before the last one
    /// are the click they have always been, and the last one is the band.
    #[test]
    fn the_last_beat_of_the_count_in_is_the_band_when_a_jam_asks_to_be_played_in() {
        let table = compile_jam(&rock_16ths_played_in()).unwrap();
        assert!(table.has_pickup());

        // The count-in's earlier beats. `pickup` is false on every tick of
        // them, and the answer is the click.
        for sub in 0..4u32 {
            assert_eq!(
                jam_play(Some(&table), true, false, false, 4, 4, 0, sub, 0),
                JamPlay::Click,
                "tick {sub} of a beat that is still being counted"
            );
        }

        // And the pickup beat, every tick of it, out of the fill's last beat.
        for sub in 0..4u32 {
            match jam_play(Some(&table), true, true, false, 4, 4, 0, sub, 0) {
                JamPlay::Band(tick) => {
                    let expected = table.pickup_tick(sub).unwrap();
                    assert_eq!(
                        tick, expected,
                        "tick {sub} of the pickup read the wrong cell"
                    );
                    assert!(
                        !tick.slots().iter().any(|s| s.lane == JamLane::Hat),
                        "tick {sub} of the pickup kept a hat"
                    );
                }
                other => panic!("tick {sub} of the pickup gave {other:?}"),
            }
        }
        // The floor tom is in there — this is a fill, not a beep.
        assert!(table
            .pickup_tick(3)
            .unwrap()
            .slots()
            .iter()
            .any(|s| s.lane == JamLane::TomLo));
    }

    /// A jam that did not ask to be played in cannot be, and neither can a
    /// drill: the pickup is a table's own answer, and a ramp still owns the
    /// click whatever the count-in is doing.
    #[test]
    fn nobody_is_played_in_who_did_not_ask() {
        let plain = compile_jam(&rock_16ths()).unwrap();
        assert!(!plain.has_pickup());
        assert_eq!(
            jam_play(Some(&plain), true, true, false, 4, 4, 0, 0, 0),
            JamPlay::Click,
            "no pickup row means the count-in keeps the beat"
        );

        let played_in = compile_jam(&rock_16ths_played_in()).unwrap();
        assert_eq!(
            jam_play(Some(&played_in), true, true, true, 4, 4, 0, 0, 0),
            JamPlay::Click,
            "a drill ramps the click, pickup or no pickup"
        );
        assert_eq!(
            jam_play(None, true, true, false, 4, 4, 0, 0, 0),
            JamPlay::Click,
            "no jam, no band, and nothing to be played in by"
        );
        // And a table that does not fit the bar is a mismatch on the pickup
        // for the same reason it is on every other tick: the engine will not
        // guess which column of the row is which tick.
        assert_eq!(
            jam_play(Some(&played_in), true, true, false, 4, 2, 0, 0, 0),
            JamPlay::Mismatch
        );
    }

    /// WHICH BEAT THE PICKUP IS, AND THE TAKE BOUNDARY.
    ///
    /// A count-in of `beats` beats sounds `beats - 1` of them and hands the
    /// last to bar one. The pickup is the beat before that — so it is always
    /// inside the count-in and never the beat the form starts on, which is
    /// what keeps it out of a take: a take starts when the count-in is spent,
    /// and the count-in is not spent until the beat AFTER the pickup.
    #[test]
    fn the_pickup_is_the_last_beat_the_count_in_plays_and_never_bar_one() {
        // One bar of 4/4, as the setup sheet offers it: beats 0, 1 and 2 are
        // counted, beat 2 is the pickup, and beat 3 is the downbeat.
        assert!(!is_pickup_beat(true, 0, 4));
        assert!(!is_pickup_beat(true, 1, 4));
        assert!(is_pickup_beat(true, 2, 4));
        assert!(
            !is_pickup_beat(true, 3, 4),
            "beat 3 is bar one, not a pickup"
        );

        // Two bars of 4/4: the same rule, one bar later.
        assert!(is_pickup_beat(true, 6, 8));
        for done in 0..6u8 {
            assert!(
                !is_pickup_beat(true, done, 8),
                "beat {done} is still a count"
            );
        }

        // Shorter than a bar — a three-beat count-in, or the shortest one
        // there is — and the pickup is still its last beat.
        assert!(is_pickup_beat(true, 1, 3));
        assert!(is_pickup_beat(true, 0, 2));

        // Nothing at all: a count-in of one beat IS bar one, and a count-in
        // of none is not running.
        assert!(!is_pickup_beat(true, 0, 1));
        assert!(!is_pickup_beat(true, 0, 0));
        assert!(!is_pickup_beat(false, 2, 4), "no count-in, no pickup");

        // AND WHY THE TICK LOOP LATCHES IT. The beat is counted DONE as soon
        // as its downbeat is reported, so a beat that was the pickup on its
        // first tick is not the pickup any more a few buffers later. On a
        // groove in sixteenths that would be one cell of the fill and three
        // beeps, which is why `jam_in_pickup` holds the downbeat's answer.
        assert!(is_pickup_beat(true, 2, 4), "asked on the downbeat");
        assert!(
            !is_pickup_beat(true, 3, 4),
            "and asked again once it is counted"
        );

        // THE TAKE BOUNDARY, as a property rather than an example: over every
        // count-in the engine can be armed with, the pickup is never the beat
        // that becomes bar one, and there is at most one of it.
        for beats in 0..=8u8 {
            let pickups = (0..=8u8).filter(|&done| is_pickup_beat(true, done, beats));
            assert!(
                pickups.clone().count() <= 1,
                "{beats} beats gave more than one pickup"
            );
            for done in pickups {
                assert!(
                    done + 1 < beats,
                    "the pickup at {done} of {beats} IS bar one, so it would be in the take"
                );
            }
        }
    }

    /// Every tick of the bar reaches the column it should.
    #[test]
    fn every_tick_of_the_bar_maps_to_a_column_of_the_table() {
        let table = compile_jam(&rock_16ths()).unwrap();
        for beat in 0..4u32 {
            for sub in 0..4u32 {
                match jam_play(Some(&table), false, false, false, 4, 4, beat, sub, 0) {
                    JamPlay::Band(t) => {
                        let expected = table.tick(beat * 4 + sub, 0).unwrap();
                        assert_eq!(t, expected, "beat {beat} sub {sub} read the wrong column");
                    }
                    other => panic!("beat {beat} sub {sub} gave {other:?}"),
                }
            }
        }
    }

    /// A full band, every lane, every kit, all four levels of the config —
    /// `jam.rs`'s fixture for the loudest thing the library can hold, minus
    /// the crash lane, which the groove editor cannot write.
    fn busy_band(kit: JamKit, lawnmower: bool) -> JamConfig {
        JamConfig {
            ticks_per_beat: 4,
            beats_per_bar: 4,
            bar: if lawnmower {
                JamPattern {
                    kick: vec![2; 16],
                    snare: vec![2; 16],
                    hat: vec![2; 16],
                    // The open hat is a row of the pattern too (B5), and it
                    // is the row that rings: every other lane the editor can
                    // fill is either a transient or capped at 0.9 of a tick.
                    hat_open: vec![2; 16],
                    ride: vec![2; 16],
                    crash: vec![2; 16],
                    ..Default::default()
                }
            } else {
                // Busy, and something a person might actually play: the
                // jitter probe's groove, with the wash on the last
                // sixteenth of each beat where a drummer would open it.
                JamPattern {
                    kick: vec![2, 0, 0, 1, 1, 0, 1, 0, 2, 0, 0, 1, 1, 0, 1, 0],
                    snare: vec![0, 0, 3, 0, 2, 0, 0, 3, 0, 3, 0, 0, 2, 0, 3, 1],
                    hat: vec![1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3],
                    hat_open: vec![0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
                    ride: vec![1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
                    crash: vec![0; 16],
                    ..Default::default()
                }
            },
            fill: None,
            form_bars: 4,
            crash_on_one: true,
            intensity: 1.5,
            kit: kit.name().to_string(),
            bass: Some(JamBassLine {
                pitches: vec![40, 45, 47, 52, 40, 45, 47, 52, 38, 43, 45, 50, 38, 43, 45, 50],
                gain: 1.5,
                ..Default::default()
            }),
            practice: None,
            fill_every: None,
            // And a comping voice over the top of all of it: a four-note
            // chord on every eighth is nobody's piano part, it is the
            // maximum the table can ask the mixer for on the one lane that
            // SUSTAINS. The drums are transients that get out of each
            // other's way; four notes ringing for 700 ms do not.
            keys: Some(crate::jam::JamKeysLine {
                voicings: (0..16)
                    .map(|t| {
                        if t % 2 == 0 {
                            vec![55, 60, 64, 67]
                        } else {
                            Vec::new()
                        }
                    })
                    .collect(),
                gain: 1.5,
                ..Default::default()
            }),
            mix: Some(crate::jam::JamMix {
                drums: 1.5,
                bass: 1.5,
                keys: 1.5,
                perc: 1.0,
            }),
            count_in_sound: None,
            bass_voice: None,
            keys_voice: None,
            custom_kit: None,
            ..Default::default()
        }
    }


    /// A PERCUSSIONIST ON EVERY TICK STILL DOES NOT REACH THE CLAMP.
    ///
    /// The ceiling test the percussionist has to pass, and it is a harder
    /// question than the drums': a kit has three lanes a groove can write on
    /// every tick and leave ringing, and this adds ten more rows on top of
    /// the lawnmower — every percussion voice, on every sixteenth, under a
    /// band that was already the worst bar the table can describe.
    ///
    /// Both claims, the same two the drums answer:
    ///
    /// * the band does not reach the mixer's clamp, so nobody hears a square
    ///   wave;
    /// * the voice count stays inside the preallocated [`MAX_VOICES`], so
    ///   the callback never reallocates. This is the one the caps in
    ///   `jam.rs` exist for — ten uncapped percussion rows at 300 BPM
    ///   sixteenths would be four hundred voices out of a mixer that holds
    ///   two hundred and fifty-six.
    ///
    /// Its own set and its own kit rather than the shipped ones, both at the
    /// loader's length cap: `sounds/perc` is a folder a checkout may not
    /// have, and a ceiling test that silently measured a band with no
    /// percussion in it would be worse than no test.
    #[test]
    fn a_percussionist_on_every_tick_stays_under_the_ceiling() {
        const SHIPPED_VOLUME: f32 = 0.8;
        let reference = SoundBank::new(JAM_REFERENCE_SR);
        let others: Vec<(u32, SoundBank)> = [44100u32, 96000]
            .into_iter()
            .map(|sr| (sr, SoundBank::new(sr)))
            .collect();
        // Every voice at the cap — the longest a folder is allowed to hold,
        // which is what stacks.
        let kit = std::sync::Arc::new(crate::kit::KitBank::for_tests(
            &KitVoice::DRUMS,
            JAM_REFERENCE_SR,
            crate::kit::MAX_VOICE_SECS,
        ));
        let set = std::sync::Arc::new(crate::kit::KitBank::for_tests(
            &KitVoice::PERC,
            JAM_REFERENCE_SR,
            crate::kit::MAX_VOICE_SECS,
        ));

        let mut cfg = busy_band(JamKit::fallback(), true);
        let all = vec![2u8; 16];
        cfg.bar = crate::jam::JamPattern {
            shaker: all.clone(),
            tambourine: all.clone(),
            cowbell: all.clone(),
            cabasa: all.clone(),
            claves: all.clone(),
            guiro: all.clone(),
            conga_hi: all.clone(),
            conga_lo: all.clone(),
            bongo_hi: all.clone(),
            bongo_lo: all.clone(),
            ..cfg.bar.clone()
        };
        cfg.mix = Some(crate::jam::JamMix {
            drums: 1.5,
            bass: 1.5,
            keys: 1.5,
            // The percussionist as loud as the contract lets anybody be.
            perc: 1.5,
        });
        let table = crate::jam::compile_with_perc(&cfg, kit, Some(set)).unwrap();
        assert!(
            table.perc_bank().is_some(),
            "the table did not carry the set this test is about"
        );
        // Ten rows on every tick, and they are really in the table.
        assert_eq!(
            table
                .tick(0, 0)
                .expect("tick 0")
                .slots()
                .iter()
                .filter(|s| s.lane.is_perc())
                .count(),
            10,
            "the percussion rows did not reach the table"
        );

        let mut worst_voices = 0usize;
        let mut check = |bpm: u32, sr: u32, bank: &SoundBank| {
            let tick_samples = (sr as f64 * 60.0 / bpm as f64 / 4.0) as usize;
            let r = render_jam_at(&table, bank, 2, tick_samples, SHIPPED_VOLUME, sr, true);
            assert!(
                r.peak <= 1.0,
                "a percussionist on every tick at {bpm} BPM / {sr} Hz rendered \
                 {:.3}, so the mixer clamped and the user heard a square wave",
                r.peak
            );
            worst_voices = worst_voices.max(r.max_voices);
            assert!(
                r.max_voices < MAX_VOICES,
                "{} voices alive at {bpm} BPM / {sr} Hz, against {MAX_VOICES} \
                 preallocated — the callback would have reallocated on the \
                 audio thread",
                r.max_voices
            );
        };
        for bpm in [20u32, 60, 120, 200, 300] {
            check(bpm, JAM_REFERENCE_SR, &reference);
        }
        for (sr, bank) in others.iter() {
            check(300, *sr, bank);
        }
        eprintln!("[perc] worst voice count with ten rows on every tick: {worst_voices}");
    }

    /// THE BAND THAT WOULD HAVE CLIPPED, RENDERED.
    ///
    /// `jam.rs` normalises a table against four bars it renders at
    /// [`JAM_REFERENCE_SR`] and the fastest tick the engine can produce.
    /// This renders the result through the real bank, at every rate a device
    /// hands out and across the whole tempo range — which is the part the
    /// compile-time measurement cannot see, because overlapping copies of a
    /// drum interfere and whether they add or cancel depends on the tempo.
    ///
    /// Two claims, and they are different claims:
    ///
    /// * A **playable** groove — the jitter probe's, with a walking bass
    ///   under it — never reaches the clamp, at any tempo, any rate, any
    ///   kit, at FULL volume.
    /// * The groove editor's extreme — every lane accented on every
    ///   sixteenth — never reaches it at the volume the app ships at.
    ///   Holding it at full volume too would cost every groove in the
    ///   library 1.9 dB, which is the wrong trade; see
    ///   `INTERFERENCE_ALLOWANCE` in `jam.rs`.
    #[test]
    fn the_busiest_groove_never_makes_the_mixer_clamp() {
        // The default in `CachedParams`, and what the app ships at.
        const SHIPPED_VOLUME: f32 = 0.8;
        // The tempo sweep runs at one rate and the rate sweep at three
        // tempos, rather than both at once: the two effects are independent
        // and the product is thousands of four-bar renders.
        let reference = SoundBank::new(JAM_REFERENCE_SR);
        for kit in JamKit::all() {
            for (lawnmower, volume) in [(false, 1.0f32), (true, SHIPPED_VOLUME)] {
                let table = compile_jam(&busy_band(kit, lawnmower)).unwrap();
                let check = |bank: &SoundBank, bpm: u32, sr: u32| {
                    let tick_samples = (sr as f64 * 60.0 / bpm as f64 / 4.0) as usize;
                    let r = render_jam_at(&table, bank, 2, tick_samples, volume, sr, true);
                    assert!(
                        r.peak <= 1.0,
                        "{} at {bpm} BPM / {sr} Hz rendered a peak of {:.3} at volume \
                         {volume}, so the mixer clamped and the user heard a square wave",
                        kit.name(),
                        r.peak
                    );
                    assert!(
                        r.max_voices < MAX_VOICES,
                        "{} kept {} voices alive at once against a ceiling of {}; the \
                         callback would have dropped drums",
                        kit.name(),
                        r.max_voices,
                        MAX_VOICES
                    );
                };
                // Every tempo the metronome offers, in steps fine enough to
                // land inside the interference humps: they are a few BPM
                // wide at the top of the range.
                for bpm in (40..=300).step_by(5) {
                    check(&reference, bpm, JAM_REFERENCE_SR);
                }
                // And every rate a real device hands out, at the tempos
                // where the band is densest.
                for sr in [22050u32, 44100, 88200, 96000] {
                    let bank = SoundBank::new(sr);
                    for bpm in [120u32, 240, 300] {
                        check(&bank, bpm, sr);
                    }
                }
            }
        }
    }

    /// A FOLDER OF TWO-SECOND DRUMS, RENDERED — the ceiling's hardest case,
    /// and the one nothing measured until now.
    ///
    /// `INTERFERENCE_ALLOWANCE` in `jam.rs` was measured on the shipped
    /// kits, whose longest voice is `brushes`' 700 ms crash, and the test
    /// named for custom kits ran on 50 ms fixtures. `kit::MAX_VOICE_SECS` is
    /// two seconds, and the kick, the snare and the crash are not capped at
    /// all — so a musician who points Yames at a folder of real cymbals gets
    /// nearly three times the ring-out every published number was taken
    /// against. At 300 BPM sixteenths a tick is 50 ms, so one uncapped lane
    /// on every tick keeps forty copies of the same drum alive.
    ///
    /// Two claims, the same two the shipped kits answer: the band does not
    /// reach the mixer's clamp, and the voice count stays inside the
    /// preallocated `MAX_VOICES` so the callback never has to reallocate.
    /// Both across the whole tempo range and every rate a device hands out.
    #[test]
    fn a_folder_of_two_second_drums_stays_under_the_ceiling() {
        const SHIPPED_VOLUME: f32 = 0.8;
        // Built once and shared by both grooves: a `SoundBank` decodes every
        // shipped kit file at its rate, and four of them is most of what
        // this test would otherwise cost.
        let reference = SoundBank::new(JAM_REFERENCE_SR);
        let others: Vec<(u32, SoundBank)> = [22050u32, 44100, 96000]
            .into_iter()
            .map(|sr| (sr, SoundBank::new(sr)))
            .collect();
        for (lawnmower, volume) in [(false, 1.0f32), (true, SHIPPED_VOLUME)] {
            // Every voice at the cap, decoded at the reference rate — the
            // rate `worst_bar_peak` measures at, so what this renders is
            // exactly what the normalisation thought it was scaling.
            // THE DRUMS: this is the test named for a folder somebody
            // points Yames at, and such a folder is a drum kit. The
            // percussionist's ceiling is its own test, above, because it is
            // a harder question and a different set.
            let folder = std::sync::Arc::new(crate::kit::KitBank::for_tests(
                &KitVoice::DRUMS,
                JAM_REFERENCE_SR,
                crate::kit::MAX_VOICE_SECS,
            ));
            let cfg = busy_band(JamKit::fallback(), lawnmower);
            let table = crate::jam::compile_with_kit(&cfg, folder.clone()).unwrap();
            assert_eq!(table.kit_bank().id, folder.id);

            let mut worst_voices = 0usize;
            let mut check = |bpm: u32, sr: u32, bank: &SoundBank| {
                let tick_samples = (sr as f64 * 60.0 / bpm as f64 / 4.0) as usize;
                let r = render_jam_at(&table, bank, 2, tick_samples, volume, sr, true);
                assert!(
                    r.peak <= 1.0,
                    "three-second custom drums at {bpm} BPM / {sr} Hz rendered {:.3} at \
                     volume {volume}, so the mixer clamped and the user heard a \
                     square wave",
                    r.peak
                );
                assert!(
                    r.max_voices < MAX_VOICES,
                    "two-second custom drums kept {} voices alive at once against a \
                     ceiling of {MAX_VOICES}; the callback would have dropped drums",
                    r.max_voices
                );
                worst_voices = worst_voices.max(r.max_voices);
            };
            for bpm in (40..=300).step_by(20) {
                check(bpm, JAM_REFERENCE_SR, &reference);
            }
            for (sr, bank) in others.iter() {
                for bpm in [120u32, 300] {
                    check(bpm, *sr, bank);
                }
            }
            eprintln!(
                "[jam] two-second custom kit, {}: {worst_voices} voices at once \
                 against a ceiling of {MAX_VOICES}",
                if lawnmower { "every lane every tick" } else { "a playable groove" }
            );
        }
    }

    /// The voice ceiling is preallocated, so exceeding it would mean the
    /// audio thread reallocating mid-buffer. The busiest thing the jitter
    /// probe can ask for has to fit inside it with room to spare.
    #[test]
    fn the_busiest_plausible_jam_fits_inside_the_preallocated_voices() {
        let bank = SoundBank::new(48000);
        let cfg = JamConfig {
            ticks_per_beat: 4,
            beats_per_bar: 4,
            bar: JamPattern {
                hat_open: Vec::new(),
                kick: vec![1; 16],
                snare: vec![2; 16],
                hat: vec![1; 16],
                ride: vec![1; 16],
                crash: vec![0; 16],
                ..Default::default()
            },
            fill: None,
            form_bars: 4,
            crash_on_one: true,
            intensity: 1.25,
            kit: "room".to_string(),
            bass: None,
            practice: None,
            fill_every: None,
            keys: None,
            mix: None,
            count_in_sound: None,
            bass_voice: None,
            keys_voice: None,
            custom_kit: None,
            ..Default::default()
        };
        let table = compile_jam(&cfg).unwrap();
        for bpm in [40.0f64, 120.0, 300.0] {
            let tick_samples = (48000.0 * 60.0 / bpm / 4.0) as usize;
            let r = render_jam(&table, &bank, 4, tick_samples, 1.0);
            assert!(
                r.max_voices < MAX_VOICES,
                "{bpm} BPM kept {} voices alive against a ceiling of {}",
                r.max_voices,
                MAX_VOICES
            );
        }
    }

    /// EVERY KIT HAS TO BE AUDIBLE ON THE SPEAKER PEOPLE ACTUALLY USE.
    ///
    /// This is the measurement that caught the original drum accent: it
    /// scored +7.8 dB broadband and was 0.5 dB QUIETER than its own plain
    /// beat through the band a laptop radiates, because essentially all of
    /// it was sub-120 Hz kick. Every kick in `KITS.md` carries a mid-band
    /// body layer for that reason, and this is what says it is still there
    /// — in every kit the app ships, and in whatever the next one arrives
    /// with, because the list is now whatever folders are in `sounds/kits`.
    ///
    /// The floor is −12 dB against the kit's own hat, not 0: a kick is
    /// allowed to be felt more than heard, but not to vanish. `brushes` is
    /// the widest at +5.06 dB in `KITS.md` and `electronic` the narrowest at
    /// +2.55, both measured file to file with no engine gain — so a floor
    /// down at −12 has real room and is not fitted to today's kits.
    #[test]
    fn the_jam_kits_read_on_a_small_speaker() {
        let sr = 48000;
        for id in crate::kit::shipped_ids() {
            let kit = crate::kit::load_shipped(crate::kit::shipped_index(&id).unwrap(), sr)
                .unwrap_or_else(|e| panic!("{id} did not decode: {e}"));
            let mono = |v: KitVoice| {
                let buf = kit.sample(v as u8, 0, 0);
                (0..buf.len() / 2)
                    .map(|i| (buf[2 * i] + buf[2 * i + 1]) * 0.5)
                    .collect::<Vec<f32>>()
            };
            for voice in KitVoice::ALL {
                let Some(bank) = kit.voice(voice) else {
                    // The five synthesised kits have no toms, pedal or bell;
                    // `jam.rs` covers those with the fallbacks.
                    continue;
                };
                for l in 0..bank.layers() {
                    let buf = kit.sample(voice as u8, l, 0);
                    assert!(
                        !buf.is_empty(),
                        "{id}'s {} layer {l} decoded to nothing",
                        voice.file_name()
                    );
                }
            }

            // The kick against this kit's own hat, through a laptop.
            let k = laptop_band_energy(&mono(KitVoice::Kick), sr);
            let hat = laptop_band_energy(&mono(KitVoice::Hat), sr);
            let db = 10.0 * (k / hat.max(1e-30)).log10();
            assert!(
                db > -12.0,
                "{id}'s kick is {db:.2} dB against its own hat through a 200 Hz-4 kHz \
                 band-pass, which is a thump nobody will feel"
            );
        }
    }

    /// THE FOLDER IS THE TABLE NOW, AND THE FILES ARE READ BACK OFF DISK.
    ///
    /// `KIT_WAVS` used to be thirty-two `include_bytes!` lines whose column
    /// order had to match `KitVoice`, and a swap would have been silent — a
    /// kick where a crash should be, every table, every kit. `build.rs`
    /// writes that table now, from the folder names, so what has to be
    /// checked is that the folder on disk and the bank in the binary hold
    /// the same drums.
    #[test]
    fn every_kit_folder_on_disk_reaches_the_binary() {
        for (i, id) in crate::kit::shipped_ids().iter().enumerate() {
            let dir = std::path::Path::new("sounds/kits").join(id);
            let seen = crate::kit::inspect(&dir)
                .unwrap_or_else(|e| panic!("sounds/kits/{id} is not readable: {e}"));
            let embedded = crate::kit::load_shipped(i, JAM_REFERENCE_SR)
                .unwrap_or_else(|e| panic!("{id} did not decode: {e}"));
            let mut from_disk: Vec<String> =
                embedded.found.iter().map(|v| v.voice.clone()).collect();
            from_disk.sort();
            let mut on_disk = seen.voices.clone();
            on_disk.sort();
            assert_eq!(
                from_disk, on_disk,
                "sounds/kits/{id} holds {on_disk:?} and the binary carries {from_disk:?}"
            );
            for v in embedded.found.iter() {
                let there = seen
                    .found
                    .iter()
                    .find(|f| f.voice == v.voice)
                    .unwrap_or_else(|| panic!("{id}: {} vanished", v.voice));
                assert_eq!(
                    (v.layers, v.rr),
                    (there.layers, there.rr),
                    "{id}'s {} is {}x{} on disk and {}x{} in the binary",
                    v.voice,
                    there.layers,
                    there.rr,
                    v.layers,
                    v.rr
                );
            }
        }
    }

    /// A FILL OF TOMS AT THE TOP LEVEL REACHES THE MIXER.
    ///
    /// Two new lanes and a new level, walked the whole way: `jam_play` picks
    /// the tick out of the table the fill bar names, the callback's own
    /// spawn turns each slot into a ringing voice, and the mixer renders it.
    /// Every step between the groove and the speaker is a place a lane the
    /// engine did not know about would go quietly missing.
    #[test]
    fn a_fill_of_toms_at_the_top_level_is_heard_through_jam_play() {
        let sr = 48_000u32;
        let bank = SoundBank::new(sr);
        let mut cfg = rock_16ths();
        cfg.form_bars = 2;
        // A fill that is nothing but toms, ramping to the peak — which is
        // what `plans/JAM_SOUND.md` §2.9 asks a fill to be.
        cfg.fill = Some(crate::jam::JamPattern {
            kick: vec![0; 16],
            snare: vec![0; 16],
            hat: vec![0; 16],
            ride: vec![0; 16],
            crash: vec![0; 16],
            tom_hi: vec![1, 0, 2, 0, 3, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            tom_lo: vec![0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0],
            ..Default::default()
        });
        // A kit with real toms, so the lanes are not resolving through the
        // fallback chain — that is a different test.
        let kit = std::sync::Arc::new(crate::kit::KitBank::layered_for_tests(
            &[
                KitVoice::Kick,
                KitVoice::Snare,
                KitVoice::Hat,
                KitVoice::TomHi,
                KitVoice::TomLo,
                KitVoice::Crash,
            ],
            sr,
            0.08,
            4,
            1,
        ));
        let table = crate::jam::compile_with_kit(&cfg, kit).unwrap();

        // `jam_play` hands back the FILL's tick on bar 1 of a two-bar form,
        // and the groove's on bar 0 — which is the only way a tom lane
        // written into a fill ever reaches the callback.
        let tick_of = |bar: u32, tick: u32| match jam_play(Some(&table), false, false, false, 4, 4, tick / 4, tick % 4, bar) {
            JamPlay::Band(t) => t,
            other => panic!("bar {bar} tick {tick} came back as {other:?}"),
        };
        let toms = |bar: u32, tick: u32| {
            tick_of(bar, tick)
                .slots()
                .iter()
                .filter(|s| matches!(s.lane, JamLane::TomHi | JamLane::TomLo))
                .count()
        };
        assert_eq!(toms(0, 6), 0, "the groove has no toms");
        assert_eq!(toms(1, 6), 1, "the fill's high tom did not reach jam_play");
        assert_eq!(toms(1, 14), 1, "nor its floor tom");

        // The ramp is four different strokes, not one at four volumes: the
        // LAYER climbs with the level, which is the whole point of the fifth
        // one.
        let layers: Vec<u8> = [0u32, 2, 4, 6]
            .iter()
            .map(|t| {
                let slot = tick_of(1, *t).slots()[0];
                match slot.sound {
                    SoundId::Band { layer, .. } => layer,
                    other => panic!("a tom came out as {other:?}"),
                }
            })
            .collect();
        assert_eq!(layers, vec![1, 2, 0, 3], "the ramp is {layers:?}");

        // And it renders. Both halves of the fill bar make a sound, and the
        // groove bar does not put toms into them.
        let tick_samples = 3000;
        let r = render_jam(&table, &bank, 2, tick_samples, 1.0);
        let energy = |t: usize| -> f64 {
            r.samples[t * tick_samples..(t + 1) * tick_samples]
                .iter()
                .map(|s| (s * s) as f64)
                .sum()
        };
        // Bar 1 starts at tick 16.
        assert!(energy(16 + 6) > 1.0, "the high tom rendered nothing");
        assert!(energy(16 + 14) > 1.0, "the floor tom rendered nothing");
    }

    // -----------------------------------------------------------------
    // The drum bus
    // -----------------------------------------------------------------

    /// THE NUMBER THIS WHOLE PASS EXISTS FOR.
    ///
    /// `plans/JAM_SOUND.md` §1: "the jam's drums play 9–13 dB quieter than
    /// the metronome's own Drum accent, because the band is peak-scaled so
    /// the busiest possible sample never reaches the ceiling". Every groove
    /// in the library paid, on every hit, for the one pattern nobody writes.
    ///
    /// So the comparison is the one the owner made: a rock groove at normal
    /// intensity, through the band's own path, against ONE hit of the
    /// metronome's Drum accent through the click's path, both at the same
    /// volume and both through the 200 Hz-4 kHz band a laptop radiates —
    /// which is the speaker this gets practised on.
    ///
    /// Measured per second over the same window, so a band that is playing
    /// eight hits a bar is not rewarded for having more of them: what is
    /// compared is how loud the two things are, which is what an ear
    /// compares.
    #[test]
    fn the_band_is_not_quieter_than_the_metronome_it_replaces() {
        let sr = 48_000u32;
        let bank = SoundBank::new(sr);
        // 120 BPM sixteenths: a bar is two seconds.
        let tick_samples = (sr as f64 * 60.0 / 120.0 / 4.0) as usize;
        let table = compile_jam(&rock_16ths()).unwrap();
        let r = render_jam_at(&table, &bank, 2, tick_samples, 1.0, sr, true);
        let window = r.samples.len();
        let band = laptop_band_energy(&r.samples, sr) / window as f64;

        // The metronome's own accent, on the beat, over the same window:
        // one downbeat every four ticks, which is what the click plays.
        let accent = bank.get(SoundId::DrumAccent);
        let mut click = vec![0.0f32; window];
        let mut at = 0usize;
        while at < window {
            for (i, v) in accent.iter().enumerate() {
                if at + i < window {
                    click[at + i] += v;
                }
            }
            at += tick_samples * 4;
        }
        let metronome = laptop_band_energy(&click, sr) / window as f64;

        let db = 10.0 * (band / metronome.max(1e-30)).log10();
        eprintln!(
            "[jam] a rock groove against the metronome's Drum accent: {db:+.1} dB \
             (was -9 to -13 before this pass)"
        );
        assert!(
            db > -6.0,
            "the band is {db:.1} dB under the metronome's own accent, and the \
             whole point of this pass was that it was 9 to 13"
        );
        // ...and not the other way round either: a band that shouted over
        // the click it replaces would be a different complaint.
        assert!(db < 12.0, "the band is {db:.1} dB OVER the metronome's accent");
    }


    /// A FULL-SCALE SUM COMES OUT AT FULL SCALE AND NEVER ABOVE IT.
    ///
    /// The tanh stage is a soft clipper normalised to pass through 1.0:
    /// `tanh(x·d)/tanh(d)`. Under full scale it is nearly a straight line —
    /// which is what makes it glue rather than an effect — at full scale it
    /// is exactly unity, and above it the curve bends rather than breaking.
    #[test]
    fn the_bus_passes_full_scale_at_full_scale_and_bends_above_it() {
        for drive in [1.0f32, 1.6] {
            let shape = 1.0 / drive.tanh();
            let curve = |x: f32| (x * drive).tanh() * shape;
            assert!((curve(1.0) - 1.0).abs() < 1e-5, "drive {drive} is not unity at 1.0");
            assert!(curve(0.0).abs() < 1e-9);
            // Monotone, and never over 1.0 anywhere below it.
            let mut last = 0.0f32;
            for i in 0..=1000 {
                let x = i as f32 / 1000.0;
                let y = curve(x);
                assert!(y >= last, "the curve turned back at {x}");
                assert!(y <= 1.0 + 1e-5, "drive {drive} reaches {y} at {x}");
                last = y;
            }
            // ...and it bends: a drive that did nothing would be a straight
            // line, and 0.5 in would come out at 0.5.
            assert!(
                curve(0.5) > 0.5,
                "drive {drive} is a wire, not a saturator: 0.5 -> {}",
                curve(0.5)
            );
        }
        // A HARDER DRIVE BENDS HARDER, which is what `raw` asks for.
        let soft = (0.5f32 * 1.0).tanh() / 1.0f32.tanh();
        let hard = (0.5f32 * 1.6).tanh() / 1.6f32.tanh();
        assert!(hard > soft, "raw's drive is doing nothing: {hard} against {soft}");
    }

    /// THE BAND ARRIVING AT THE SAFETY CLAMP COMES OUT UNDER FULL SCALE.
    ///
    /// `jam.rs` lets a table render up to 2.5 before the bus, because the bus
    /// is what holds it down — that is the whole trade this pass makes. So
    /// the bus has to actually hold it: fed a steady 2.5 it must settle well
    /// inside full scale, and it must get there in the five milliseconds its
    /// attack promises rather than clipping on the way.
    #[test]
    fn the_bus_holds_the_safety_clamp_under_full_scale() {
        let sr = 48_000u32;
        for drive in [1.0f32, 1.6] {
            let mut bus = DrumBus::new(sr);
            bus.set_drive(drive, 1.0 / drive.tanh());
            let mut worst = 0.0f32;
            let mut settled = 0.0f32;
            // A quarter of a second of a full-scale-and-a-half band, which
            // is the busiest thing the clamp allows.
            for i in 0..sr / 4 {
                let (l, r) = bus.process(2.5, -2.5);
                worst = worst.max(l.abs()).max(r.abs());
                if i > sr / 8 {
                    settled = l.abs();
                }
            }
            eprintln!(
                "[bus] drive {drive}: 2.5 in, worst {worst:.3}, settled {settled:.3}"
            );
            assert!(
                worst <= 1.0,
                "drive {drive} let {worst:.3} through, so the mixer clamped"
            );
            assert!(
                settled < 0.8,
                "drive {drive} settles at {settled:.3}, which is not a compressor"
            );
            // And it is not a gate: the band is still most of full scale.
            assert!(settled > 0.4, "drive {drive} settles at {settled:.3}, a whisper");
        }
    }

    /// A QUIET BAND GOES THROUGH UNTOUCHED.
    ///
    /// Below −6 dBFS the compressor is not working, so a ballad at soft
    /// intensity is the groove as it was written plus a little saturation —
    /// which is the point of a threshold.
    #[test]
    fn the_bus_leaves_a_quiet_band_alone() {
        let mut bus = DrumBus::new(48_000);
        let mut worst = 0.0f32;
        for _ in 0..4_800 {
            let (l, _) = bus.process(0.3, 0.3);
            // The tanh lifts it a little — that is the saturation — and the
            // compressor does nothing at all.
            worst = worst.max((l - 0.3f32.tanh() / 1.0f32.tanh()).abs());
        }
        assert!(worst < 1e-5, "the compressor moved a band under the threshold by {worst}");
    }

    /// THE CLICK DOES NOT GO THROUGH ANY OF THIS.
    ///
    /// Its timing and its path are unchanged by every line of this pass: it
    /// is summed mono, where it always was, and added after the bus. A
    /// `Voice::click` is what carries that, and this is what says it does.
    #[test]
    fn the_click_is_not_a_band_voice() {
        let v = Voice::click(SoundId::ClickHigh, 0.8, 0);
        assert!(!v.band, "the click went through the drum bus");
        assert_eq!(v.amp_l, v.amp_r, "the click was panned");
        assert_eq!(v.delay, 0, "the click drifted");
        assert_eq!(v.fade_len, 0, "the click can be choked");
        assert_eq!(v.voice, NOT_A_DRUM, "the click is a drum");
    }

    // -----------------------------------------------------------------
    // The choke
    // -----------------------------------------------------------------

    /// A CLOSED HAT FADES THE OPEN ONE OUT OVER TWENTY MILLISECONDS.
    ///
    /// `plans/JAM_SOUND.md` §2.4: before this, an open hat rang across every
    /// off-beat into the next beat, which is worst at Loud where the grooves
    /// use open hats most. On the audio thread the choke is a flag and a
    /// counter on the ringing voice and nothing else — no allocation, no
    /// second pass, no lookup.
    #[test]
    fn a_closed_hat_fades_the_open_one_out_over_twenty_milliseconds() {
        let sr = 48_000u32;
        let choke = (CHOKE_FADE_SECS * sr as f32) as u32;
        let mut cfg = rock_16ths();
        cfg.bar.hat = vec![0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        cfg.bar.hat_open = vec![1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        cfg.bar.kick = vec![0; 16];
        cfg.bar.snare = vec![0; 16];
        cfg.bar.ride = vec![0; 16];
        let table = compile_jam(&cfg).unwrap();

        let open = table
            .tick(0, 0)
            .unwrap()
            .slots()
            .iter()
            .find(|s| s.lane == JamLane::HatOpen)
            .copied()
            .expect("an open hat on tick 0");
        let hat = table
            .tick(4, 0)
            .unwrap()
            .slots()
            .iter()
            .find(|s| s.lane == JamLane::Hat)
            .copied()
            .expect("a closed hat on tick 4");

        let mut voices = Vec::new();
        spawn_band_voice(&mut voices, &open, 1.0, 0, 0, 16, 3000, 0, choke);
        assert_eq!(voices.len(), 1);
        assert_eq!(voices[0].fade_len, 0, "nothing has closed it yet");
        assert_eq!(voices[0].choke_gain(), 1.0);

        // The stick lands. The wash starts fading and the hat does not.
        spawn_band_voice(&mut voices, &hat, 1.0, 0, 4, 16, 3000, 0, choke);
        assert_eq!(voices.len(), 2);
        assert_eq!(voices[0].fade_len, choke, "the closed hat did not close the wash");
        assert_eq!(voices[0].fade_left, choke);
        assert_eq!(voices[1].fade_len, 0, "the hat choked itself");

        // A LINEAR RAMP TO NOTHING, and then the voice is finished — which
        // is what `retain` reads, so a choked drum stops costing the mixer
        // anything at all.
        let mut seen = Vec::new();
        for _ in 0..choke {
            seen.push(voices[0].choke_gain());
            voices[0].fade_left -= 1;
        }
        assert!((seen[0] - 1.0).abs() < 1e-6);
        assert!(seen.windows(2).all(|w| w[1] < w[0]), "the fade is not monotone");
        // One step short of nothing, because the ramp is `left / len` and
        // the voice is retired on the sample after the last one it played.
        assert!(
            *seen.last().unwrap() <= 1.5 / choke as f32,
            "the fade ends at {}",
            seen.last().unwrap()
        );
        assert!(voices[0].done(1_000_000), "a choked voice never finishes");

        // A SECOND STICK DOES NOT RESTART THE FADE. Two closed hats in a row
        // must not make the open one last longer than one would.
        let mut voices = Vec::new();
        spawn_band_voice(&mut voices, &open, 1.0, 0, 0, 16, 3000, 0, choke);
        spawn_band_voice(&mut voices, &hat, 1.0, 0, 4, 16, 3000, 0, choke);
        voices[0].fade_left = choke / 2;
        spawn_band_voice(&mut voices, &hat, 1.0, 0, 8, 16, 3000, 0, choke);
        assert_eq!(voices[0].fade_left, choke / 2, "the second stick restarted the fade");
    }

    /// NOTHING ELSE IS CHOKED.
    ///
    /// A crash is its decay, and a kick that stopped when the next hat
    /// landed would be a band with no bottom. The mask is what makes that a
    /// fact about the data rather than about the loop.
    #[test]
    fn a_hat_does_not_silence_the_rest_of_the_kit() {
        let sr = 48_000u32;
        let choke = (CHOKE_FADE_SECS * sr as f32) as u32;
        let mut cfg = rock_16ths();
        cfg.crash_on_one = true;
        let table = compile_jam(&cfg).unwrap();
        let hat = table
            .tick(0, 0)
            .unwrap()
            .slots()
            .iter()
            .find(|s| s.lane == JamLane::Hat)
            .copied()
            .expect("a hat on tick 0");

        let mut voices = Vec::new();
        for tick in 0..16u32 {
            if let Some(t) = table.tick(tick, 0) {
                for slot in t.slots() {
                    spawn_band_voice(&mut voices, slot, 1.0, 0, tick, 16, 3000, 0, choke);
                }
            }
        }
        if let Some(crash) = table.crash_on_one() {
            spawn_band_voice(&mut voices, &crash, 1.0, 0, 0, 16, 3000, 0, choke);
        }
        spawn_band_voice(&mut voices, &hat, 1.0, 0, 15, 16, 3000, 0, choke);

        for v in voices.iter() {
            if v.voice == KitVoice::HatOpen as u8 {
                continue;
            }
            assert_eq!(
                v.fade_len, 0,
                "voice {} was choked and nothing in a kit chokes it",
                v.voice
            );
        }
    }

    /// THE DRIFT REACHES THE VOICE, AND THE KICK ON THE ONE NEVER MOVES.
    ///
    /// The downbeat is where the band agrees it is. A drummer who pushed
    /// that would be a drummer nobody could play with — so every other hit
    /// gets nought to three milliseconds and the kick on tick 0 gets none.
    #[test]
    fn the_drift_pushes_every_hit_but_the_kick_on_the_one() {
        let sr = 48_000u32;
        let drift_frames = (crate::jam::DRIFT_MAX_SECS * sr as f32) as u32;
        let mut cfg = rock_16ths();
        cfg.bar.kick = vec![2; 16];
        let table = compile_jam(&cfg).unwrap();

        let mut late = Vec::new();
        for bar in 0..4u32 {
            for tick in 0..16u32 {
                let mut voices = Vec::new();
                for slot in table.tick(tick, bar).unwrap().slots() {
                    spawn_band_voice(&mut voices, slot, 1.0, bar, tick, 16, 3000, drift_frames, 960);
                }
                for v in voices.iter() {
                    assert!(
                        v.delay <= drift_frames,
                        "bar {bar} tick {tick} pushed {} frames, past the 3 ms bound",
                        v.delay
                    );
                    if v.voice == KitVoice::Kick as u8 && tick == 0 {
                        assert_eq!(v.delay, 0, "the kick on the one moved, on bar {bar}");
                    }
                    late.push(v.delay);
                }
            }
        }
        // And it is not all zero, which would be the drift missing.
        assert!(late.iter().any(|d| *d > 0), "nothing drifted at all");
        // The gain wanders too, and by no more than the contract's 2%.
        let mut voices = Vec::new();
        let slot = table.tick(1, 0).unwrap().slots()[0];
        spawn_band_voice(&mut voices, &slot, 1.0, 0, 1, 16, 3000, drift_frames, 960);
        let ratio = voices[0].amp_l / (slot.gain * slot.pan_l);
        assert!(
            (1.0 - crate::jam::DRIFT_GAIN..=1.0 + crate::jam::DRIFT_GAIN).contains(&ratio),
            "one hit came out {ratio} of its slot's gain"
        );
    }

    /// A ROUND ROBIN IS CHOSEN ON THE TICK, AND THE TABLE NEVER STORES ONE.
    #[test]
    fn the_round_robin_is_decided_when_the_tick_is_scheduled() {
        let kit = std::sync::Arc::new(crate::kit::KitBank::layered_for_tests(
            &[KitVoice::Kick, KitVoice::Snare, KitVoice::Hat],
            48_000,
            0.05,
            2,
            3,
        ));
        let mut cfg = rock_16ths();
        cfg.bar.hat = vec![1; 16];
        let table = crate::jam::compile_with_kit(&cfg, kit).unwrap();

        // The TABLE says round robin 0 on every tick — the choice is not
        // there to be got wrong.
        for tick in 0..16u32 {
            for slot in table.tick(tick, 0).unwrap().slots() {
                if let SoundId::Band { robin, .. } = slot.sound {
                    assert_eq!(robin, 0, "the table stored a round robin");
                }
            }
        }

        // The SPAWN chooses, and a hat on every sixteenth is never the same
        // recording twice in a row.
        let mut last: Option<u8> = None;
        for tick in 0..16u32 {
            let mut voices = Vec::new();
            let slot = table
                .tick(tick, 0)
                .unwrap()
                .slots()
                .iter()
                .find(|s| s.lane == JamLane::Hat)
                .copied()
                .expect("a hat");
            spawn_band_voice(&mut voices, &slot, 1.0, 0, tick, 16, 3000, 0, 960);
            let SoundId::Band { robin, .. } = voices[0].sound_id else {
                panic!("a hat is not a drum");
            };
            assert!(robin < 3);
            if let Some(previous) = last {
                assert_ne!(robin, previous, "tick {tick} repeated round robin {robin}");
            }
            last = Some(robin);
        }
    }

    /// A KIT IS THE SAME KIT ON EVERY DEVICE.
    ///
    /// `jam.rs` renders a table to find out whether it is absurd, and the
    /// bus holds the band down at the other end — both of them against a
    /// kit decoded at whatever rate the device opened at. So a kit that came
    /// out a different height on a 44.1 kHz interface than on a 96 kHz one
    /// would be a band whose level moved when the musician changed
    /// headphones, for no reason they could hear or control.
    ///
    /// **The peak is exact and the energy is close, and that is the trade
    /// `kit::VOICE_PEAK` documents.** A windowed sinc rings around a bright
    /// transient and lifts its peak; the loader divides that back out, which
    /// makes every rate the same height and costs the voice whatever the
    /// ripple was. On most drums that is a fraction of a per cent. On the
    /// two brightest hats in the set — whose content sits at the source
    /// files' own Nyquist, where a reconstruction filter has least to work
    /// with — it reaches 2.9 dB of energy between 44.1 and 48 kHz.
    ///
    /// This is what the shipped bank always did; before these kits became
    /// folders the same division lived in `SoundBank::new`, and the same
    /// hats paid the same price. What is new is that the number is written
    /// down.
    #[test]
    fn a_kit_measures_the_same_at_every_rate_a_device_hands_out() {
        /// Energy per second, so a rate with more samples in it does not
        /// score higher for having them.
        fn energy(buf: &[f32], sr: u32) -> f64 {
            buf.iter().map(|s| (s * s) as f64).sum::<f64>() / sr as f64
        }
        /// How far apart the same drum's ENERGY may measure across rates.
        /// The resampler keeps white noise within a tenth of a dB, so a
        /// whole decibel is generous; it was 3.0 while the loader divided
        /// by the post-resample peak, and that rule cost the Club hat
        /// exactly 3 dB at 96 kHz. The worst is printed.
        const ALLOWED: f64 = 1.0;
        /// ...but only at rates a hi-hat FITS IN.
        ///
        /// At 22.05 kHz the Nyquist is 11 kHz and `brushes`' closed hat
        /// lives at 7-15 kHz, so most of it is above the new Nyquist and the
        /// anti-aliasing filter removes it — which is the filter doing
        /// exactly its job.
        const FULL_BAND_ABOVE: u32 = 40_000;

        let mut worst = (0.0f64, String::new());
        for id in crate::kit::shipped_ids() {
            let index = crate::kit::shipped_index(&id).unwrap();
            let reference = crate::kit::load_shipped(index, JAM_REFERENCE_SR).unwrap();
            for sr in [22050u32, 44100, 88200, 96000] {
                let here = crate::kit::load_shipped(index, sr).unwrap();
                for v in KitVoice::ALL {
                    let Some(bank) = reference.voice(v) else {
                        continue;
                    };
                    // THE HEIGHT IS THE SAME AT EVERY RATE. Exactly, and it
                    // is the one thing the loader promises about a level it
                    // did not measure itself.
                    //
                    // Per VOICE and not per layer, because that is how the
                    // loader scales: one gain for the whole drum, so the
                    // dynamics BETWEEN its layers survive. A layer that is
                    // not the loudest is free to land wherever the ripple
                    // put it relative to the one that is.
                    let voice_peak = |k: &crate::kit::KitBank| {
                        (0..bank.layers())
                            .flat_map(|l| (0..bank.rr()).map(move |r| (l, r)))
                            .flat_map(|(l, r)| k.sample(v as u8, l, r).iter())
                            .fold(0.0f32, |m, s| m.max(s.abs()))
                    };
                    let (va, vb) = (voice_peak(&here), voice_peak(&reference));
                    assert!(vb > 0.0, "{id} {} is silent", v.file_name());
                    // The PEAK is allowed to differ: a windowed sinc rings
                    // around a hard transient, and the overshoot it puts
                    // between two of the file's samples is the waveform a
                    // DAC would have drawn there anyway (the Club hat
                    // reaches 1.28 at 96 kHz, the ride 1.07 at 44.1). A
                    // bank sample over full scale is data, not output: the
                    // lane gains sit well under 1.0 and the band goes
                    // through the bus, whose own test holds the ceiling.
                    // What may not happen is ringing out of all proportion
                    // — and the energy below is what has to match.
                    assert!(
                        va <= 1.5,
                        "{id} {} peaks at {va:.4} at {sr} Hz, which is not ringing, \
                         it is a level",
                        v.file_name()
                    );
                    for l in 0..bank.layers() {
                        let a = here.sample(v as u8, l, 0);
                        let b = reference.sample(v as u8, l, 0);
                        if sr < FULL_BAND_ABOVE {
                            continue;
                        }
                        let (ea, eb) = (energy(a, sr), energy(b, JAM_REFERENCE_SR));
                        let apart = 20.0 * (ea / eb).sqrt().log10();
                        if apart.abs() > worst.0 {
                            worst = (apart.abs(), format!("{id} {} at {sr} Hz", v.file_name()));
                        }
                        assert!(
                            apart.abs() < ALLOWED,
                            "{id} {} layer {l} carries {apart:+.2} dB of energy at \
                             {sr} Hz against {JAM_REFERENCE_SR}",
                            v.file_name()
                        );
                    }
                }
            }
        }
        eprintln!(
            "[kit] the widest a shipped drum's energy moves across rates: {:.2} dB ({})",
            worst.0, worst.1
        );
        // And the synthesised bass, which is built per rate rather than
        // resampled and so has no imaging to overshoot — in the list because
        // if that ever stops being true the safety clamp has to know.
        for sr in [22050u32, 44100, 88200, 96000] {
            let bank = SoundBank::new(sr);
            for voice in BassVoice::ALL {
                for i in 0..BASS_NOTES {
                    let id = SoundId::Bass(voice, i as u8);
                    let here = bank.get(id).iter().fold(0.0f32, |m, s| m.max(s.abs()));
                    let reference = jam_reference_sample(id)
                        .iter()
                        .fold(0.0f32, |m, s| m.max(s.abs()));
                    assert!(reference > 0.0);
                    assert!(
                        here <= reference * 1.02,
                        "{} MIDI {} peaks at {here:.4} at {sr} Hz against {reference:.4}",
                        voice.name(),
                        BASS_MIN_MIDI as usize + i
                    );
                }
            }
        }
    }

    // -----------------------------------------------------------------
    // The bass
    // -----------------------------------------------------------------

    /// The phase of `x` at frequency `f`, over `len` samples from `start`.
    ///
    /// Hann-windowed, because the thing being measured sits next to its own
    /// harmonics: a rectangular window's sidelobes fall off as 1/Δf and an
    /// organ's second drawbar at 0.55 would then leak several percent into
    /// the fundamental's bin and rotate it. Hann's fall as 1/Δf³, which puts
    /// the leak below anything that could move the answer by a hundredth of
    /// a cent.
    ///
    /// The phase reference is the START OF THE BUFFER, not the start of the
    /// block, so two blocks at different offsets are directly comparable —
    /// which is the whole measurement below.
    fn phase_at(x: &[f64], sr: f64, f: f64, start: usize, len: usize) -> f64 {
        let (mut re, mut im) = (0.0f64, 0.0f64);
        let w = 2.0 * std::f64::consts::PI / len as f64;
        for i in 0..len {
            let window = 0.5 - 0.5 * (w * i as f64).cos();
            let t = (start + i) as f64 / sr;
            let v = x[start + i] * window;
            let a = 2.0 * std::f64::consts::PI * f * t;
            re += v * a.cos();
            im -= v * a.sin();
        }
        im.atan2(re)
    }

    /// The fundamental of a pitched buffer, to a small fraction of a cent.
    ///
    /// ZERO CROSSINGS USED TO DO THIS AND THE ORGAN IS WHY THEY NO LONGER
    /// CAN. Counting upward crossings is exact for a waveform that crosses
    /// zero exactly twice a cycle, which every voice the first pass had did:
    /// a sine with a second harmonic under 0.3 has no other crossings to
    /// find. A tonewheel organ's drawbars are 0.55, 0.40 and 0.30, and a
    /// composite like that dips back through zero inside the cycle — so the
    /// count came out doubled and the measurement reported the note an
    /// octave up. It did so at 44.1 kHz and not at 48, which is the worst
    /// kind of wrong: a test that depends on the sample rate for a fact that
    /// does not.
    ///
    /// So the pitch is measured the way a phase-locked loop would. The phase
    /// of the buffer at a candidate frequency is taken over two blocks a
    /// known distance apart, and however far it has drifted between them IS
    /// the frequency error: `Δf = Δφ / 2πΔt`. Three passes with the blocks
    /// further apart each time.
    ///
    /// **The first pass is what keeps this honest.** It is seeded with the
    /// frequency the caller expects, which sounds like assuming the answer
    /// and is not: its blocks are four tenths of a period apart, so the
    /// range it can lock onto is everything from an octave below the guess
    /// to well over an octave above it. An octave slip, an A-435 tuning or
    /// an off-by-one in the note index all land inside that range and are
    /// therefore REPORTED, at their real value, rather than folded back onto
    /// the guess. The later passes only sharpen a number that is already
    /// within a few cents.
    fn fundamental_hz_near(buf: &[f32], sr: u32, guess: f64) -> f64 {
        let sr_f = sr as f64;
        // Past the attack — a click is not a pitch — and no further than the
        // release taper, or the buffer's end for the short voices.
        let from = (0.040 * sr_f) as usize;
        let to = ((0.320 * sr_f) as usize).min(buf.len());
        assert!(
            to > from + (0.020 * sr_f) as usize,
            "only {} samples of steady tone to measure",
            to.saturating_sub(from)
        );
        let mut x: Vec<f64> = buf[from..to].iter().map(|&s| s as f64).collect();
        // A decaying note is not symmetric about zero, and a DC term would
        // sit in every block's window as a phase-free constant.
        let mean = x.iter().sum::<f64>() / x.len() as f64;
        for v in x.iter_mut() {
            *v -= mean;
        }
        let n = x.len();

        let mut f = guess;
        for periods in [0.4f64, 4.0, 40.0] {
            let gap = ((periods / f) * sr_f) as usize;
            // The last pass does not fit for the low notes — forty periods
            // of E1 is a second of audio and a bass note is under half of
            // one. Four periods is already a hundredth of a cent there.
            if gap == 0 || gap * 2 >= n {
                continue;
            }
            let len = n - gap;
            let d = phase_at(&x, sr_f, f, gap, len) - phase_at(&x, sr_f, f, 0, len);
            // Into (−π, π]: a drift of more than half a cycle is outside the
            // pass's capture range by construction.
            let two_pi = 2.0 * std::f64::consts::PI;
            let d = d - two_pi * (d / two_pi).round();
            f += d / (two_pi * (gap as f64 / sr_f));
        }
        f
    }

    /// THE BASS HAS TO BE IN TUNE, OR IT IS WORSE THAN NO BASS.
    ///
    /// A guitarist plays over this. A bass a few cents off is the kind of
    /// wrong that makes people re-tune their own instrument until they give
    /// up. One cent is a twelve-hundredth of an octave — inaudible, and two
    /// orders of magnitude tighter than anything a synthesis mistake would
    /// produce, so this catches an octave slip, an A-435 tuning or an
    /// off-by-one in the note index and stays quiet otherwise.
    /// ALL FIVE OF THEM, which is the point of measuring rather than
    /// asserting: a slap has a fourteen-partial crack on the front of it and
    /// a synth bass is a filtered saw, and neither of those is allowed to
    /// move the pitch by so much as a cent. They cannot, because every
    /// partial in this file is `sin(n·φ)` and every envelope is positive —
    /// and this is what says so about the samples rather than about the
    /// comment.
    #[test]
    fn the_bass_bank_is_in_tune() {
        for sr in [44100u32, 48000] {
            let bank = SoundBank::new(sr);
            for voice in BassVoice::ALL {
                let what = voice.name();
                for i in 0..BASS_NOTES {
                    let midi = BASS_MIN_MIDI + i as u8;
                    let buf = bank.get(SoundId::Bass(voice, i as u8));
                    assert!(!buf.is_empty(), "{what} MIDI {midi} is silent");

                    let want = 440.0 * 2f64.powf((midi as f64 - 69.0) / 12.0);
                    let got = fundamental_hz_near(buf, sr, want);
                    let cents = 1200.0 * (got / want).log2();
                    assert!(
                        cents.abs() < 1.0,
                        "{what} MIDI {midi} at {sr} Hz came out {got:.4} Hz against \
                         {want:.4} — {cents:.3} cents off"
                    );
                }
            }
        }
    }

    /// Twenty-eight notes, E1 to G3, none of them clipping and none of them
    /// a whisper. The peak is the kits' own 0.900 for the same reason: the
    /// files carry timbre, the engine carries balance.
    #[test]
    fn the_bass_bank_is_twenty_eight_clean_notes() {
        assert_eq!(BASS_NOTES, 28);
        assert_eq!(BASS_MIN_MIDI, 28, "E1, the bottom of a four-string bass");
        assert_eq!(BASS_MAX_MIDI, 55, "G3");
        assert_eq!(BassVoice::ALL.len(), BASS_VOICE_COUNT);
        for sr in [22050u32, 44100, 48000, 88200, 96000] {
            let bank = SoundBank::new(sr);
            for voice in BassVoice::ALL {
                let what = voice.name();
                for i in 0..BASS_NOTES {
                    let buf = bank.get(SoundId::Bass(voice, i as u8));
                    let midi = BASS_MIN_MIDI + i as u8;
                    let peak = buf.iter().fold(0.0f32, |m, s| m.max(s.abs()));
                    assert!(
                        peak <= 0.9 + 1e-4,
                        "{what} MIDI {midi} peaks at {peak} at {sr} Hz"
                    );
                    assert!(
                        peak > 0.85,
                        "{what} MIDI {midi} peaks at {peak}, which is not the bank's level"
                    );
                    // Lands on zero rather than being cut there — rule 6 of
                    // KITS.md, and the kicks are why: a step at 41 Hz is a
                    // fifth of a cycle and shows up as DC.
                    let tail = buf[buf.len() - 1].abs();
                    assert!(tail < 1e-5, "{what} MIDI {midi} ends at {tail}");
                    // And starts from it, for the same reason at the other
                    // end. Every voice has a fade-in, even the millisecond
                    // ones a pick and a slap get.
                    assert!(
                        buf[0].abs() < 1e-3,
                        "{what} MIDI {midi} starts at {}, which is a click",
                        buf[0]
                    );
                }
                // Out of range is silence, not a panic on the audio thread.
                assert!(bank.get(SoundId::Bass(voice, BASS_NOTES as u8)).is_empty());
                assert!(bank.get(SoundId::Bass(voice, 255)).is_empty());
            }
        }
    }

    /// WHAT NINE VOICES COST, AND A CEILING ON IT.
    ///
    /// The first pass had one bass and one keys voice; this one has five and
    /// four, and every note of every one of them is a decoded buffer that
    /// lives for as long as the audio device is open. That is a real cost
    /// and it is worth a number rather than a shrug — and worth a ceiling,
    /// because the cheapest way to make it enormous is to give a pad a
    /// ten-second tail without noticing that it is thirty-seven notes long.
    ///
    /// Measured at 48 kHz: **34.4 MB**, of which the keys are 23.8 and the
    /// bass 10.6. The pad (9.5) and the organ (8.1) are three quarters of
    /// the keys' share between them, which is what a voice that sustains
    /// costs — and the clav, which is over in 220 ms, is 1.5. There are two
    /// of these banks in a running app at most: the device's own, and the
    /// 48 kHz reference `jam.rs` measures tables against. The second is
    /// built lazily on the first `set_jam`, so a musician who never opens
    /// Jam pays for neither.
    ///
    /// The ceiling is 48 MB, a third above today, so a recipe can grow a
    /// tail by ear without this test moving — and a recipe that doubles one
    /// trips it.
    ///
    /// The TIME is printed for the same reason and not asserted on, because
    /// a wall clock on a shared machine is a fact about the machine. For the
    /// record, on the owner's laptop in a release build: a whole bank builds
    /// in 530-720 ms, of which the nine pitched voices are about 200 —
    /// they are synthesised nine threads wide, and were 650 ms in a row
    /// before that.
    #[test]
    fn the_pitched_banks_cost_what_they_are_documented_to_cost() {
        let sr = 48_000u32;
        // The build is timed as well as measured. It happens once, on the
        // thread that opens the audio device, so it is a delay before the
        // first click and not a hitch during one — but it is a delay, and a
        // recipe that made it seconds long should be visible here rather
        // than in a bug report about a slow start.
        let began = std::time::Instant::now();
        let bank = SoundBank::new(sr);
        eprintln!(
            "[banks] one whole SoundBank at {sr} Hz took {:.0} ms to build",
            began.elapsed().as_secs_f64() * 1000.0
        );
        let of = |v: &[Vec<f32>]| -> usize { v.iter().map(|n| n.len() * 4).sum() };
        let bass: usize = bank.bass.iter().map(|v| of(v)).sum();
        let keys: usize = bank.keys.iter().map(|v| of(v)).sum();
        let mb = |b: usize| b as f64 / (1024.0 * 1024.0);
        eprintln!(
            "[banks] bass {:.1} MB, keys {:.1} MB, {:.1} MB in total at {sr} Hz",
            mb(bass),
            mb(keys),
            mb(bass + keys)
        );
        for (what, voices) in [("bass", &bank.bass[..]), ("keys", &bank.keys[..])] {
            for (i, v) in voices.iter().enumerate() {
                eprintln!("[banks]   {what} voice {i}: {:.2} MB", mb(of(v)));
            }
        }
        assert!(
            mb(bass + keys) < 48.0,
            "the pitched banks are {:.1} MB, and the budget is 48",
            mb(bass + keys)
        );
    }

    /// FIVE VOICES, NOT FIVE VOLUMES.
    ///
    /// Every note of every bank is normalised to a peak of 0.9, which is the
    /// right thing for a bank and says nothing at all about loudness: a slap
    /// puts a third of its energy where a laptop speaker works and an
    /// upright puts almost none there, so at equal peaks the slap is several
    /// decibels louder. Switching the bass voice would then be switching the
    /// volume, and the musician would go looking for the level control that
    /// had moved on its own.
    ///
    /// `BASS_VOICE_TRIM` in `jam.rs` is what holds them together; this is
    /// what says it still does. Measured through the same 200 Hz-4 kHz
    /// band-pass as every other level claim in this file, one note (E2)
    /// rendered into a common window of one beat at 120 BPM — a common
    /// window because measuring each voice over its own length would reward
    /// the short ones for being short.
    ///
    /// The gate is the brief's 3 dB and not today's fraction of one, so the
    /// recipes can be tuned by ear (`plans/JAM_UX_DECISIONS.md` C2 — the
    /// owner listens) without this test having to move every time.
    #[test]
    fn every_bass_voice_lands_at_the_same_level() {
        let sr = 48000u32;
        let bank = SoundBank::new(sr);
        let tick_samples = (sr as f64 * 60.0 / 120.0 / 4.0) as usize;
        let window = tick_samples * 4;

        let level = |voice: BassVoice| -> f64 {
            let mut cfg = rock_16ths();
            cfg.bar.kick = vec![0; 16];
            cfg.bar.snare = vec![0; 16];
            cfg.bar.hat = vec![0; 16];
            cfg.bass_voice = Some(voice.name().to_string());
            let mut pitches = vec![0u8; 16];
            pitches[0] = 40; // E2, the middle of a bass line.
            cfg.bass = Some(JamBassLine { pitches, gain: 1.0, ..Default::default() });
            let t = compile_jam(&cfg).unwrap();
            let slot = t
                .tick(0, 0)
                .expect("tick 0")
                .slots()
                .iter()
                .find(|s| s.lane == crate::jam::JamLane::Bass)
                .copied()
                .expect("a bass note on tick 0");
            // THE TABLE'S OWN NORMALISATION HAS TO BE UNDONE HERE, or this
            // measures nothing. A table holding one bass note and no drums
            // is scaled so that note reaches the ceiling — which cancels
            // the trim exactly, and made the first version of this test
            // report every voice at its untrimmed level and pass the two
            // that happened to fall under the ceiling. `peak_after /
            // peak_before` IS that scaling, so dividing it back out leaves
            // the voice's own level, which is what the trim is about.
            let undo = t.peak_before / t.peak_after.max(1e-9);
            let buf = bank.get(slot.sound);
            let mut out = vec![0.0f32; window];
            for (o, v) in out.iter_mut().zip(buf.iter()) {
                *o += v * slot.gain * undo;
            }
            above_120_energy(&out, sr)
        };

        // Measured first and judged afterwards, so a failure prints the
        // whole set: "the slap is 6 dB up" is a number to trim by, and the
        // one voice that tripped the assert first is not.
        let reference = level(BassVoice::Fingered);
        let measured: Vec<(BassVoice, f64)> = BassVoice::ALL
            .iter()
            .map(|&v| (v, 10.0 * (level(v) / reference.max(1e-30)).log10()))
            .collect();
        for (voice, db) in measured.iter() {
            eprintln!("[bass] {:8} {db:+.2} dB against fingered", voice.name());
        }
        for &(voice, db) in measured.iter() {
            assert!(
                db.abs() <= 3.0,
                "the {} bass is {db:+.2} dB against the fingered one through a \
                 small speaker; BASS_VOICE_TRIM is what is supposed to stop that",
                voice.name()
            );
        }
    }

    /// A bass line renders energy under the drums, on the ticks it was
    /// written on and not between them.
    #[test]
    fn a_bass_line_lands_on_its_own_ticks_and_stops_at_the_next() {
        let sr = 48000;
        let bank = SoundBank::new(sr);
        let mut cfg = rock_16ths();
        // Roots on the quarters, and nothing else in the bar, so what is
        // measured is the bass and only the bass.
        cfg.bar.kick = vec![0; 16];
        cfg.bar.snare = vec![0; 16];
        cfg.bar.hat = vec![0; 16];
        cfg.bass = Some(JamBassLine {
            pitches: vec![40, 0, 0, 0, 45, 0, 0, 0, 47, 0, 0, 0, 52, 0, 0, 0],
            gain: 1.0,
            ..Default::default()
        });
        let table = compile_jam(&cfg).unwrap();

        // 120 BPM sixteenths: a tick is 125 ms and a note's buffer is 450,
        // so without the cap every note of this line would still be ringing
        // at the end of the bar.
        let tick_samples = sr as usize * 60 / 120 / 4;
        let r = render_jam(&table, &bank, 1, tick_samples, 1.0);
        let window = |t: usize| &r.samples[t * tick_samples..(t + 1) * tick_samples];
        let energy = |t: usize| -> f64 { window(t).iter().map(|s| (s * s) as f64).sum() };

        for t in [0usize, 4, 8, 12] {
            assert!(energy(t) > 100.0, "tick {t} carries no bass at all");
        }
        // THE CAP. Each note is over before the next one starts: the last
        // tick before a new note is the quietest part of the note that owns
        // it, and nothing is left by the time the new root lands.
        for t in [3usize, 7, 11] {
            assert!(
                energy(t) < energy(t - 3) * 0.2,
                "tick {t} still has {:.0} of the {:.0} the note started with; the \
                 walking line is smearing into a chord",
                energy(t),
                energy(t - 3)
            );
        }

        // And it really is bass. Measured against the snare of the same
        // kit rather than against an absolute: `low_band_share` is four
        // cascaded one-poles at 150 Hz, so it takes a bite out of an 82 Hz
        // fundamental too, and what the number means is only visible next
        // to another instrument.
        let bass_low = low_band_share(
            bank.get(SoundId::Bass(BassVoice::Fingered, 40 - BASS_MIN_MIDI)),
            sr,
        );
        let room = crate::jam::reference_bank("room").unwrap();
        let snare = room.sample(KitVoice::Snare as u8, 1, 0);
        let snare_mono: Vec<f32> = (0..snare.len() / 2)
            .map(|i| (snare[2 * i] + snare[2 * i + 1]) * 0.5)
            .collect();
        let snare_low = low_band_share(&snare_mono, sr);
        assert!(
            bass_low > snare_low * 2.0,
            "the bass has {bass_low:.2} of its energy under 150 Hz and the snare \
             {snare_low:.2}; that is not a bass sitting under a drum kit"
        );
    }

    /// A BASS NOTE COMES OUT OF THE MIXER AT THE PITCH IT WAS WRITTEN AT.
    ///
    /// The one claim nothing else in this file makes. Every other bass test
    /// measures a slot's own buffer, or energy in a window, and a note an
    /// octave out passes all of them: it is the same tone with the same
    /// envelope, half as long and twice as fast, and a band-pass at
    /// 200 Hz-4 kHz cannot tell those apart.
    ///
    /// So this one renders the band the way the callback does and counts
    /// zero crossings. E2 is MIDI 40, which is 82.41 Hz, and the fingered
    /// recipe is a fundamental with a fifth of a second harmonic over it
    /// once the bite has died - two crossings a period and nothing else,
    /// which is what makes the count a frequency.
    #[test]
    fn a_bass_note_sounds_at_the_pitch_it_was_written_at() {
        let sr = 48_000u32;
        let bank = SoundBank::new(sr);
        let mut cfg = rock_16ths();
        cfg.bar.kick = vec![0; 16];
        cfg.bar.snare = vec![0; 16];
        cfg.bar.hat = vec![0; 16];
        let mut pitches = vec![0u8; 16];
        pitches[0] = 40; // E2 — 440 × 2^((40 − 69) / 12) = 82.41 Hz.
        cfg.bass = Some(JamBassLine { pitches, gain: 1.0, ..Default::default() });
        let table = compile_jam(&cfg).unwrap();
        // 120 BPM sixteenths, one bar, no bus: the tanh would not move a
        // zero crossing, but a measurement of a pitch should not have a
        // compressor in it either.
        let tick_samples = sr as usize * 60 / 120 / 4;
        let r = render_jam_at(&table, &bank, 1, tick_samples, 1.0, sr, false);

        // From 20 ms in — past the bite, whose twelve harmonics cross zero
        // wherever they like — to where the note has decayed into the noise
        // floor of an f32 sum.
        let from = (0.020 * sr as f64) as usize;
        let to = (0.240 * sr as f64) as usize;
        let (mut first, mut last, mut count) = (f64::NAN, f64::NAN, 0usize);
        for i in from + 1..to {
            let (a, b) = (r.samples[i - 1] as f64, r.samples[i] as f64);
            if a <= 0.0 && b > 0.0 {
                let t = (i - 1) as f64 + (-a) / (b - a);
                if count == 0 {
                    first = t;
                }
                last = t;
                count += 1;
            }
        }
        assert!(count >= 8, "only {count} crossings — that is not a note");
        let hz = sr as f64 / ((last - first) / (count - 1) as f64);
        eprintln!("[bass] E2 rendered through the mixer at {hz:.2} Hz");
        assert!(
            (hz - 82.41).abs() < 1.0,
            "E2 came out of the mixer at {hz:.2} Hz and E2 is 82.41 Hz"
        );
    }

    // -----------------------------------------------------------------
    // The recorded melodic banks
    //
    // `plans/JAM_KILLER.md` §A2: the bass and the keys stop being sines.
    // Until W33's banks arrive there is nothing under `sounds/voices` to
    // play, so the tests below render THE ENGINE'S OWN RECIPES into the
    // format and read them back through the loader.
    //
    // That makes the level claim a tautology today and load-bearing the
    // moment a real folder ships. What it holds to a number is the whole
    // path from a WAV on disk to a slot's gain — the manifest's trim, the
    // layer the line's level reaches for, the voice trim that holds five
    // basses together and the table's own normalisation — so a real bank
    // whose `trim_db` is wrong lands somewhere else, and this says by how
    // much rather than leaving it to an ear.
    // -----------------------------------------------------------------

    /// A folder of WAVs the melodic loader will accept, rendered from
    /// whatever `render` hands back for each note.
    fn write_recipe_bank(dir: &std::path::Path, id: &str, notes: &[u8], render: impl Fn(u8) -> Vec<f32>) {
        std::fs::create_dir_all(dir).expect("a scratch directory");
        std::fs::write(
            dir.join("voice.json"),
            format!(
                r#"{{ "id": "{id}", "name": "{id}", "credit": "a recipe, rendered by a test",
                      "licence": "CC0-1.0", "rate": 48000, "channels": 1,
                      "layers": 1, "rr": 1, "trim_db": 0.0, "release_ms": 60,
                      "notes": {notes:?} }}"#
            ),
        )
        .expect("a writable manifest");
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: JAM_REFERENCE_SR,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        for &midi in notes {
            let mut w = hound::WavWriter::create(dir.join(format!("{midi}.1.1.wav")), spec)
                .expect("a writable WAV");
            for s in render(midi) {
                w.write_sample((s as f64 * 32767.0).round().clamp(-32768.0, 32767.0) as i16)
                    .unwrap();
            }
            w.finalize().expect("a finalised WAV");
        }
    }

    /// A directory of its own, removed when the test drops it.
    struct VoiceScratch(std::path::PathBuf);

    impl VoiceScratch {
        fn new(what: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "yames-recipe-bank-{what}-{}-{:?}",
                std::process::id(),
                std::thread::current().id()
            ));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).expect("a scratch directory");
            Self(dir)
        }
        fn path(&self) -> &std::path::Path {
            &self.0
        }
    }

    impl Drop for VoiceScratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    /// What one line of a table renders into a common window, through the
    /// 200 Hz–4 kHz band-pass a laptop speaker actually radiates.
    ///
    /// The table's own normalisation is undone, exactly as
    /// `every_bass_voice_lands_at_the_same_level` undoes it and for the same
    /// reason: a table holding one line and no drums is scaled so that line
    /// reaches the ceiling, which would cancel every trim this is about and
    /// report two very different banks as identical.
    fn line_energy(table: &JamTable, bank: &SoundBank, lane: crate::jam::JamLane, sr: u32) -> f64 {
        let tick_samples = (sr as f64 * 60.0 / 120.0 / 4.0) as usize;
        let window = tick_samples * 4;
        let undo = table.peak_before / table.peak_after.max(1e-9);
        let banks = BandBanks::of(Some(table));
        let mut out = vec![0.0f32; window];
        for slot in table
            .tick(0, 0)
            .expect("tick 0")
            .slots()
            .iter()
            .filter(|s| s.lane == lane)
        {
            let buf = jam_sample(bank, banks, slot.sound);
            assert!(!buf.is_empty(), "{lane:?} resolved to no sample at all");
            // The callback's own cap arithmetic, and its release: a
            // recorded note fades where the cap lands and a synthesised one
            // does not, and a measurement that ignored that would be
            // measuring a note the mixer never plays.
            let capped = if slot.cap_ticks > 0.0 {
                ((tick_samples as f32 * slot.cap_ticks) as usize).min(buf.len())
            } else {
                buf.len()
            };
            for i in 0..capped.min(window) {
                let release = if slot.release > 0 {
                    let from = capped.saturating_sub(slot.release as usize);
                    if i < from {
                        1.0
                    } else {
                        let x = (i - from) as f32 / slot.release as f32;
                        0.5 + 0.5 * (std::f32::consts::PI * x.min(1.0)).cos()
                    }
                } else {
                    1.0
                };
                out[i] += buf[i] * slot.gain * undo * release;
            }
        }
        laptop_band_energy(&out, sr)
    }

    /// A RECORDED BASS LANDS WHERE THE SYNTHESISED ONE LANDED.
    ///
    /// The level match the brief asks for, and the reason it matters is the
    /// musician rather than the meter: somebody who has been practising to
    /// the fingered bass for a month installs the version with a recording
    /// in it, and the band must not be a different loudness. Every dial they
    /// have set — `bass.gain`, `mix.bass`, the intensity — sits on top of
    /// this, so if the bank arrives three decibels hot, all of them are
    /// three decibels wrong at once.
    ///
    /// Measured on E2, which the bank samples rather than builds: what the
    /// trim is about is LEVEL, and a note transposed three semitones is also
    /// sixteen per cent shorter, which would put a length into a loudness
    /// measurement. The spread across the whole bank is printed underneath
    /// for the same information without the confusion.
    #[test]
    fn a_recorded_bass_lands_where_the_synthesised_one_landed() {
        let sr = JAM_REFERENCE_SR;
        let bank = SoundBank::new(sr);
        let scratch = VoiceScratch::new("bass");
        // The contract's own `notes` list, trimmed to the bass's range.
        let notes: Vec<u8> = vec![28, 31, 33, 36, 40, 43, 45, 48, 52, 55];
        write_recipe_bank(scratch.path(), "bass_fingered", &notes, |midi| {
            bass_note(BassVoice::Fingered, midi, sr)
        });
        let recorded = Arc::new(
            crate::voices::load(scratch.path(), sr, BASS_MIN_MIDI, BASS_MAX_MIDI).unwrap(),
        );

        let jam = |midi: u8| {
            let mut cfg = rock_16ths();
            cfg.bar.kick = vec![0; 16];
            cfg.bar.snare = vec![0; 16];
            cfg.bar.hat = vec![0; 16];
            let mut pitches = vec![0u8; 16];
            pitches[0] = midi;
            cfg.bass = Some(JamBassLine { pitches, gain: 1.0, ..Default::default() });
            cfg
        };
        let kit = crate::jam::reference_bank("room").unwrap();
        let db = |midi: u8| -> f64 {
            let cfg = jam(midi);
            let synth = compile_jam(&cfg).unwrap();
            let played = crate::jam::compile_with_voices(
                &cfg,
                kit.clone(),
                crate::jam::JamVoices {
                    bass: Some(recorded.clone()),
                    keys: None,
                },
            )
            .unwrap();
            // The recording really is the thing being measured.
            assert!(
                matches!(
                    played
                        .tick(0, 0)
                        .unwrap()
                        .slots()
                        .iter()
                        .find(|s| s.lane == crate::jam::JamLane::Bass)
                        .unwrap()
                        .sound,
                    SoundId::Voice { .. }
                ),
                "the table is still playing the recipe"
            );
            let a = line_energy(&synth, &bank, crate::jam::JamLane::Bass, sr);
            let b = line_energy(&played, &bank, crate::jam::JamLane::Bass, sr);
            10.0 * (b / a.max(1e-30)).log10()
        };

        // Printed sampled and built side by side, because the difference
        // between them is the one thing a level match cannot say: a note
        // transposed up three semitones is sixteen per cent shorter, so in a
        // fixed window it carries less energy than a recipe that is the same
        // length at every pitch. That is what a sampler is, not a fault, and
        // seeing it here is what stops somebody trimming a bank to hide it.
        for midi in [28u8, 33, 40, 41, 45, 50, 52, 55] {
            eprintln!(
                "[voices] bass MIDI {midi} ({}): recorded is {:+.2} dB against the recipe",
                if notes.contains(&midi) {
                    "sampled"
                } else {
                    "built  "
                },
                db(midi)
            );
        }
        let at_e2 = db(40);
        assert!(
            at_e2.abs() <= 1.0,
            "a recorded bass at gain 1.0 is {at_e2:+.2} dB against where the \
             synthesised fingered bass landed, and the band is a decibel wide"
        );
    }

    /// ...and the same for the keys against the synthesised electric piano.
    ///
    /// A four-note voicing rather than a note, because that is what the keys
    /// line plays and four notes at once is where a level goes wrong: the
    /// trim that holds a chord under the drummer (`KEYS_TRIM`) is applied
    /// per NOTE, so a bank whose level is off is off four times over.
    #[test]
    fn recorded_keys_land_where_the_synthesised_epiano_landed() {
        let sr = JAM_REFERENCE_SR;
        let bank = SoundBank::new(sr);
        let scratch = VoiceScratch::new("keys");
        // Every third semitone of the comping range, plus the notes of the
        // voicing itself, so the chord is sampled rather than built — see
        // the bass test for why a level claim is made on a sampled note.
        let mut notes: Vec<u8> = (KEYS_MIN_MIDI..=KEYS_MAX_MIDI).step_by(3).collect();
        notes.extend([57u8, 60, 64, 67]);
        notes.sort_unstable();
        notes.dedup();
        write_recipe_bank(scratch.path(), "epiano", &notes, |midi| {
            keys_note(KeysVoice::Epiano, midi, sr)
        });
        let recorded = Arc::new(
            crate::voices::load(scratch.path(), sr, KEYS_MIN_MIDI, KEYS_MAX_MIDI).unwrap(),
        );

        let cfg = comping(1.0);
        let synth = compile_jam(&cfg).unwrap();
        let kit = crate::jam::reference_bank("room").unwrap();
        let played = crate::jam::compile_with_voices(
            &cfg,
            kit,
            crate::jam::JamVoices {
                bass: None,
                keys: Some(recorded),
            },
        )
        .unwrap();
        assert!(
            played
                .tick(0, 0)
                .unwrap()
                .slots()
                .iter()
                .filter(|s| s.lane == crate::jam::JamLane::Keys)
                .all(|s| matches!(s.sound, SoundId::Voice { .. })),
            "the table is still playing the recipe"
        );

        let a = line_energy(&synth, &bank, crate::jam::JamLane::Keys, sr);
        let b = line_energy(&played, &bank, crate::jam::JamLane::Keys, sr);
        let db = 10.0 * (b / a.max(1e-30)).log10();
        eprintln!("[voices] keys: recorded is {db:+.2} dB against the recipe");
        assert!(
            db.abs() <= 1.0,
            "a recorded electric piano at gain 1.0 is {db:+.2} dB against where \
             the synthesised one landed"
        );
    }

    /// WHICH VOICES PLAY A RECORDING, AND WHICH ARE SYNTHESISERS.
    ///
    /// The contract's list, and it is a musical list rather than a technical
    /// one: a fingered bass, a picked one, an upright and a slap are
    /// instruments somebody records, and a Rhodes is one too. A synth bass,
    /// an organ, a clavinet and a pad are synthesisers in real life, so a
    /// recipe for them is not a stand-in for a recording — it is the
    /// instrument.
    #[test]
    fn only_the_voices_somebody_records_have_a_folder() {
        use crate::jam::JamVoices;
        for (voice, folder) in [
            (BassVoice::Fingered, Some("bass_fingered")),
            (BassVoice::Picked, Some("bass_picked")),
            (BassVoice::Upright, Some("bass_upright")),
            (BassVoice::Slap, Some("bass_slap")),
            (BassVoice::Synth, None),
        ] {
            assert_eq!(JamVoices::folder_for_bass(voice), folder, "{voice:?}");
        }
        for (voice, folder) in [
            (KeysVoice::Epiano, Some("epiano")),
            (KeysVoice::Organ, None),
            (KeysVoice::Clav, None),
            (KeysVoice::Pad, None),
        ] {
            assert_eq!(JamVoices::folder_for_keys(voice), folder, "{voice:?}");
        }
    }

    /// A VOICE WITH NO FOLDER PLAYS THE RECIPE, AND THAT IS EVERY VOICE
    /// TODAY.
    ///
    /// The rule that makes this whole feature safe to ship before its
    /// content: no bank means the sound the app has always made. Every jam
    /// already saved on somebody's machine goes through this path.
    #[test]
    fn a_voice_with_no_recorded_bank_plays_the_recipe_it_always_did() {
        let mut cfg = rock_16ths();
        let mut pitches = vec![0u8; 16];
        pitches[0] = 40;
        cfg.bass = Some(JamBassLine { pitches, gain: 1.0, ..Default::default() });
        for name in ["fingered", "picked", "upright", "slap", "synth"] {
            cfg.bass_voice = Some(name.to_string());
            let table = compile_jam(&cfg).unwrap();
            let slot = table
                .tick(0, 0)
                .unwrap()
                .slots()
                .iter()
                .find(|s| s.lane == crate::jam::JamLane::Bass)
                .copied()
                .expect("a bass note");
            assert!(
                matches!(slot.sound, SoundId::Bass(..)),
                "{name} did not resolve to its recipe with no bank shipped"
            );
            assert_eq!(slot.release, 0, "{name}: a recipe needs no release fade");
            assert_eq!(slot.rr, 1, "{name}: a recipe has one recording");
        }
    }

    /// THE LINE'S OWN LEVEL CHOOSES THE LAYER.
    ///
    /// The contract's mapping, and the reason it is the LINE's gain and not
    /// the mix: `bass.gain` is the arrangement saying how hard this chorus
    /// is played, where `mix.bass` is the musician saying how loud they want
    /// the bass in their headphones. A player turning themselves up must not
    /// make the band play harder.
    #[test]
    fn a_melodic_lines_level_chooses_which_layer_it_plays() {
        let sr = JAM_REFERENCE_SR;
        let scratch = VoiceScratch::new("layers");
        let notes: Vec<u8> = vec![40];
        write_recipe_bank(scratch.path(), "bass_fingered", &notes, |midi| {
            bass_note(BassVoice::Fingered, midi, sr)
        });
        // One layer in the folder, three declared: the loader fills the
        // missing ones, so the bank really does have three to choose from.
        let manifest = std::fs::read_to_string(scratch.path().join("voice.json")).unwrap();
        std::fs::write(
            scratch.path().join("voice.json"),
            manifest.replace(r#""layers": 1"#, r#""layers": 3"#),
        )
        .unwrap();
        std::fs::copy(
            scratch.path().join("40.1.1.wav"),
            scratch.path().join("40.2.1.wav"),
        )
        .unwrap();
        std::fs::copy(
            scratch.path().join("40.1.1.wav"),
            scratch.path().join("40.3.1.wav"),
        )
        .unwrap();
        let recorded =
            Arc::new(crate::voices::load(scratch.path(), sr, BASS_MIN_MIDI, 40).unwrap());
        assert_eq!(recorded.layers(), 3);

        let kit = crate::jam::reference_bank("room").unwrap();
        let layer_of = |gain: f32| -> u8 {
            let mut cfg = rock_16ths();
            let mut pitches = vec![0u8; 16];
            pitches[0] = 40;
            cfg.bass = Some(JamBassLine { pitches, gain, ..Default::default() });
            let table = crate::jam::compile_with_voices(
                &cfg,
                kit.clone(),
                crate::jam::JamVoices {
                    bass: Some(recorded.clone()),
                    keys: None,
                },
            )
            .unwrap();
            match table
                .tick(0, 0)
                .unwrap()
                .slots()
                .iter()
                .find(|s| s.lane == crate::jam::JamLane::Bass)
                .unwrap()
                .sound
            {
                SoundId::Voice { layer, .. } => layer,
                other => panic!("the bass resolved to {other:?}"),
            }
        };
        // Soft, normal, loud — and the contract's own boundaries either
        // side, because a mapping is its edges.
        assert_eq!(layer_of(0.5), 0, "the softest the contract allows");
        assert_eq!(layer_of(0.59), 0);
        assert_eq!(layer_of(0.6), 1, "0.6 is the second layer, not the first");
        assert_eq!(layer_of(0.89), 1);
        assert_eq!(layer_of(0.9), 2, "0.9 is the hardest");
        assert_eq!(layer_of(1.5), 2, "the loudest the contract allows");
    }

    // -----------------------------------------------------------------
    // The keys
    // -----------------------------------------------------------------

    /// A jam with a comping voice: one four-note voicing per half bar,
    /// nothing but a snare accent on the backbeat to measure it against.
    ///
    /// The voicings are Am7 and D7 around middle C, which is where a pianist
    /// comps behind a soloist rather than on top of one.
    fn comping(gain: f32) -> JamConfig {
        let mut v: Vec<Vec<u8>> = vec![Vec::new(); 16];
        v[0] = vec![57, 60, 64, 67]; // Am7
        v[8] = vec![50, 54, 57, 60]; // D7
        JamConfig {
            ticks_per_beat: 4,
            beats_per_bar: 4,
            bar: JamPattern {
                hat_open: Vec::new(),
                kick: vec![0; 16],
                snare: vec![0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                hat: vec![0; 16],
                ride: vec![0; 16],
                crash: vec![0; 16],
                ..Default::default()
            },
            fill: None,
            form_bars: 4,
            crash_on_one: false,
            intensity: 1.0,
            kit: "room".to_string(),
            bass: None,
            practice: None,
            fill_every: None,
            keys: Some(crate::jam::JamKeysLine { voicings: v, gain, ..Default::default() }),
            mix: None,
            count_in_sound: None,
            bass_voice: None,
            keys_voice: None,
            custom_kit: None,
            ..Default::default()
        }
    }

    /// Every keys slot on a tick of a compiled table.
    fn keys_on(table: &JamTable, tick: u32) -> Vec<crate::jam::JamSlot> {
        table
            .tick(tick, 0)
            .expect("in the bar")
            .slots()
            .iter()
            .filter(|s| s.lane == crate::jam::JamLane::Keys)
            .copied()
            .collect()
    }

    /// THE KEYS HAVE TO BE IN TUNE, FOR THE REASON THE BASS DOES.
    ///
    /// Worse, in fact: a bass a few cents out is a wobble under the band, a
    /// comping chord a few cents out is four wrong notes at once against the
    /// one you are fretting. Measured the same way and held to the same
    /// cent, and for the same reason it CAN be measured that way — every
    /// component of a keys note is `sin(n·φ)`, so the zero crossings sit on
    /// the fundamental's period whatever the harmonics are doing.
    #[test]
    fn the_keys_bank_is_in_tune() {
        for sr in [44100u32, 48000] {
            let bank = SoundBank::new(sr);
            for voice in KeysVoice::ALL {
                let what = voice.name();
                for i in 0..KEYS_NOTES {
                    let midi = KEYS_MIN_MIDI + i as u8;
                    let buf = bank.get(SoundId::Keys(voice, i as u8));
                    assert!(!buf.is_empty(), "{what} MIDI {midi} is silent");

                    let want = 440.0 * 2f64.powf((midi as f64 - 69.0) / 12.0);
                    let got = fundamental_hz_near(buf, sr, want);
                    let cents = 1200.0 * (got / want).log2();
                    assert!(
                        cents.abs() < 1.0,
                        "{what} MIDI {midi} at {sr} Hz came out {got:.4} Hz against \
                         {want:.4} — {cents:.3} cents off"
                    );
                }
            }
        }
    }

    /// Thirty-seven notes in each of four voices, C3 to C6, none clipping,
    /// none a whisper, each one starting from silence and landing on it.
    ///
    /// The lengths differ on purpose and are checked against the recipes
    /// rather than against one number: a clav that rings is a harpsichord
    /// and an organ that stops is a piano, so 0.22 s and 1.20 s are the
    /// voices and not a mistake.
    #[test]
    fn the_keys_bank_is_thirty_seven_notes_that_ring() {
        let sr = 48000;
        let bank = SoundBank::new(sr);
        assert_eq!(KEYS_NOTES, 37, "C3 to C6 inclusive is thirty-seven notes");
        assert_eq!(KeysVoice::ALL.len(), KEYS_VOICE_COUNT);
        for voice in KeysVoice::ALL {
            let what = voice.name();
            let want_len = (voice.recipe().secs * sr as f64) as usize;
            for i in 0..KEYS_NOTES {
                let midi = KEYS_MIN_MIDI + i as u8;
                let buf = bank.get(SoundId::Keys(voice, i as u8));
                let peak = buf.iter().fold(0.0f32, |m, s| m.max(s.abs()));
                assert!(
                    (peak - VOICE_PEAK).abs() < 1e-4,
                    "{what} MIDI {midi} peaks at {peak}, and the bank normalises \
                     every note to {VOICE_PEAK}"
                );
                assert_eq!(buf.len(), want_len, "{what} MIDI {midi} is the wrong length");
                // Rule 6 of KITS.md: land the decay on zero, do not cut it
                // there. The organ and the pad do not decay at all, so for
                // them this is entirely the release taper's doing — which is
                // exactly the thing worth checking.
                assert!(
                    buf[buf.len() - 1].abs() < 1e-6,
                    "{what} MIDI {midi} ends at {}, which is a click",
                    buf[buf.len() - 1]
                );
                // And an attack at the front, for the same reason at the
                // other end.
                assert!(
                    buf[0].abs() < 1e-3,
                    "{what} MIDI {midi} starts at {}, which is the click the attack \
                     exists to prevent",
                    buf[0]
                );
            }
        }
        // A bank that had slipped an octave would still be in tune and still
        // be the wrong instrument.
        let bottom = 440.0 * 2f64.powf((KEYS_MIN_MIDI as f64 - 69.0) / 12.0);
        assert!(
            (130.0..131.5).contains(&bottom),
            "the bottom note is {bottom:.2} Hz, and C3 is 130.81"
        );
    }

    /// A DRUM REACHES THE MIXER OUT OF THE TABLE'S OWN KIT, AND A MISSING
    /// ONE DOES NOT REACH THE WRONG BANK.
    ///
    /// `jam_sample` is the one function that answers `SoundId::Band`, and it
    /// is a two-line match in the hottest loop in the program, so it is
    /// worth saying out loud what it has to get right: a drum comes from the
    /// table's own kit, everything the metronome makes comes from the
    /// `SoundBank`, and a drum with no kit behind it is SILENT rather than
    /// an index into something else.
    #[test]
    fn a_drum_is_read_from_the_table_and_never_from_the_click_bank() {
        let sr = 48000u32;
        let bank = SoundBank::new(sr);
        let kit = crate::kit::KitBank::for_tests(&[KitVoice::Kick], sr, 0.05);
        let kick = SoundId::Band {
            voice: KitVoice::Kick as u8,
            layer: 0,
            robin: 0,
        };

        let got = jam_sample(&bank, BandBanks::only_kit(&kit), kick);
        assert!(!got.is_empty(), "the kit has a kick and it did not come out");
        assert_eq!(got, kit.sample(KitVoice::Kick as u8, 0, 0));

        // A voice the kit does not hold reads as silence here. `jam.rs` is
        // what makes sure no table ever names one — this is the audio thread
        // refusing to make a noise nobody asked for if it ever does. Same
        // for a layer and a round robin past the end.
        for id in [
            SoundId::Band {
                voice: KitVoice::Ride as u8,
                layer: 0,
                robin: 0,
            },
            SoundId::Band {
                voice: KitVoice::Kick as u8,
                layer: 3,
                robin: 0,
            },
            SoundId::Band {
                voice: KitVoice::Kick as u8,
                layer: 0,
                robin: 2,
            },
            SoundId::Band {
                voice: 200,
                layer: 0,
                robin: 0,
            },
        ] {
            assert!(jam_sample(&bank, BandBanks::only_kit(&kit), id).is_empty(), "{id:?}");
        }
        // And so does a drum with no kit at all, which is the one still
        // ringing when the musician unloads the jam.
        assert!(jam_sample(&bank, BandBanks::default(), kick).is_empty());

        // Everything else is the bank, unchanged, kit or no kit.
        for id in [
            SoundId::ClickHigh,
            SoundId::DrumAccent,
            SoundId::Bass(BassVoice::Slap, 4),
            SoundId::Keys(KeysVoice::Organ, 4),
        ] {
            assert_eq!(jam_sample(&bank, BandBanks::only_kit(&kit), id), bank.get(id));
            assert_eq!(jam_sample(&bank, BandBanks::default(), id), bank.get(id));
        }
    }

    /// A DEVICE CHANGE TAKES A FOLDER'S DRUMS AWAY, AND ONLY A FOLDER'S.
    ///
    /// The samples in a `KitBank` were resampled once, on the command
    /// thread, at the rate the device that was open then handed out. Switch
    /// from a 48 kHz interface to a 44.1 kHz one and every one of those
    /// drums is a semitone and a half flat for as long as the jam stays
    /// loaded, because nothing would otherwise make the app decode the kit
    /// again — `KitCache` keys on the rate, but only a `set_jam` asks it
    /// anything, and a table already playing does not ask.
    ///
    /// **This used to be true of a folder and is now true of every kit**,
    /// because the shipped kits left the audio thread's `SoundBank` this
    /// pass. So the table goes, the plain click plays, and the next
    /// bar-ahead send — at most a bar away — brings the band back in tune.
    #[test]
    fn a_device_change_takes_the_drums_away_so_the_next_send_retunes_them() {
        let cfg = rock_16ths();
        let handoff = JamHandoff::new();

        // A band: it has to go, and the audio thread has to be told.
        let plain = std::sync::Arc::new(crate::jam::compile(&cfg).unwrap());
        handoff.set(Some(plain));
        let before = handoff.generation.load(Ordering::Acquire);
        assert!(handoff.drop_kit(), "a kit decoded for the old device was kept");
        assert!(
            handoff.table.lock().unwrap().is_none(),
            "a kit decoded for the old device is still loaded, and it is out of tune"
        );
        assert!(
            handoff.generation.load(Ordering::Acquire) > before,
            "the table went and the callback was never told"
        );

        // The musician's own folder is no different, which is the point of
        // there being one path.
        let folder = std::sync::Arc::new(crate::kit::KitBank::for_tests(
            &[KitVoice::Kick, KitVoice::Snare],
            48_000,
            0.05,
        ));
        let mine = std::sync::Arc::new(crate::jam::compile_with_kit(&cfg, folder).unwrap());
        handoff.set(Some(mine));
        assert!(handoff.drop_kit());
        assert!(handoff.table.lock().unwrap().is_none());

        // And with nothing loaded at all it is a no-op rather than a panic:
        // a device change with no jam is the common case.
        assert!(!handoff.drop_kit());
        assert_eq!(
            handoff.generation.load(Ordering::Acquire),
            handoff.generation.load(Ordering::Acquire)
        );
    }

    /// A MID-RING KIT CHANGE STOPS THE DRUMS THAT CAME OUT OF THE OLD ONE.
    ///
    /// `SoundId::Band` names a drum and not a decode, so a crash 200 ms into
    /// its wash goes on reading at frame 9 600 — of whatever kit the NEW
    /// table carries. Two waveforms spliced mid-note is a click.
    /// See `stop_voices_on_kit_change`.
    #[test]
    fn changing_the_kit_mid_wash_stops_the_old_kits_drums() {
        let a = std::sync::Arc::new(crate::kit::KitBank::for_tests(
            &[KitVoice::Crash],
            48_000,
            0.05,
        ));
        let b = std::sync::Arc::new(crate::kit::KitBank::for_tests(
            &[KitVoice::Crash],
            48_000,
            0.05,
        ));
        assert_ne!(a.id, b.id, "two decodes are two banks, whatever the path was");

        let cfg = rock_16ths();
        let ta = crate::jam::compile_with_kit(&cfg, a.clone()).unwrap();
        let tb = crate::jam::compile_with_kit(&cfg, b).unwrap();
        let same = crate::jam::compile_with_kit(&cfg, a).unwrap();

        // Mid-wash: a drum, and a bass note that is not one.
        let ringing = || -> Vec<Voice> {
            vec![
                Voice {
                    sound_id: SoundId::Band {
                        voice: KitVoice::Crash as u8,
                        layer: 0,
                        robin: 0,
                    },
                    position: 9_600,
                    delay: 0,
                    amp_l: 1.0,
                    amp_r: 1.0,
                    max_samples: 0,
                    voice: KitVoice::Crash as u8,
                    fade_left: 0,
                    fade_len: 0,
                    band: true,
                    stereo: true,
                    release: 0,
                },
                Voice::click(SoundId::Bass(BassVoice::Fingered, 4), 1.0, 0),
            ]
        };

        // A different kit: its drums stop, everything else rings on.
        let mut voices = ringing();
        stop_voices_on_kit_change(&mut voices, bank_id(Some(&ta)), bank_id(Some(&tb)));
        assert_eq!(
            voices.len(),
            1,
            "a drum from the old kit is still reading, out of the new kit's buffer"
        );
        assert!(!voices.iter().any(|v| v.band));

        // The SAME kit — which is every bar-ahead send of a jam whose kit
        // has not changed — must not cut the cymbal short.
        let mut voices = ringing();
        stop_voices_on_kit_change(&mut voices, bank_id(Some(&ta)), bank_id(Some(&same)));
        assert_eq!(voices.len(), 2, "a bar-ahead send silenced a ringing cymbal");

        // And unloading the jam leaves a drum with no buffer behind it.
        let mut voices = ringing();
        stop_voices_on_kit_change(&mut voices, bank_id(Some(&ta)), bank_id(None));
        assert_eq!(voices.len(), 1);
    }

    /// A band on somebody else's drums renders, tick for tick, where the
    /// groove says.
    ///
    /// The render harness the other jam tests use, pointed at a table whose
    /// kick is a folder's: what it proves is that a `SoundId::Custom` makes
    /// it all the way from `slot_for` through the table, the handoff and
    /// the mixer to a sample in the buffer.
    #[test]
    fn a_jam_on_a_custom_kit_renders_on_the_ticks_it_names() {
        let sr = 48000u32;
        let bank = SoundBank::new(sr);
        let folder = std::sync::Arc::new(crate::kit::KitBank::for_tests(
            &[KitVoice::Kick, KitVoice::Hat],
            sr,
            0.05,
        ));

        let mut cfg = rock_16ths();
        cfg.bar.kick = vec![2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0];
        cfg.bar.snare = vec![0; 16];
        cfg.bar.hat = vec![0; 16];
        let table = crate::jam::compile_with_kit(&cfg, folder.clone()).unwrap();
        assert_eq!(table.kit_bank().id, folder.id);

        let tick_samples = sr as usize * 60 / 120 / 4;
        let r = render_jam(&table, &bank, 1, tick_samples, 1.0);
        let energy = |t: usize| -> f64 {
            r.samples[t * tick_samples..(t + 1) * tick_samples]
                .iter()
                .map(|s| (s * s) as f64)
                .sum()
        };
        assert!(energy(0) > 1.0, "the folder's kick did not sound on tick 0");
        assert!(energy(8) > 1.0, "nor on tick 8");
        assert!(
            energy(4) < energy(0) * 0.05,
            "something is sounding on tick 4, where the groove is empty"
        );
    }

    /// FOUR VOICES, NOT FOUR VOLUMES — the keys' half of
    /// `every_bass_voice_lands_at_the_same_level`, and the organ is why it
    /// is needed.
    ///
    /// An organ does not decay: over a common window it carries several
    /// times an electric piano's energy at the same peak, so at equal trims
    /// picking "organ" in the setup sheet would be picking "louder". Held to
    /// the same 3 dB through the same band-pass, one four-note voicing over
    /// one beat at 120 BPM, against the electric piano the first pass
    /// shipped. `KEYS_VOICE_TRIM` in `jam.rs` is the number this is about.
    ///
    /// It measures the voicing as the TABLE renders it, `KEYS_TRIM` and all,
    /// so what it compares is what a musician would hear when they change
    /// the dropdown and nothing else.
    #[test]
    fn every_keys_voice_lands_at_the_same_level() {
        let sr = 48000u32;
        let bank = SoundBank::new(sr);
        let tick_samples = (sr as f64 * 60.0 / 120.0 / 4.0) as usize;
        let window = tick_samples * 4;

        let level = |voice: KeysVoice| -> f64 {
            let mut cfg = comping(1.0);
            cfg.bar.snare = vec![0; 16];
            cfg.keys_voice = Some(voice.name().to_string());
            let t = compile_jam(&cfg).unwrap();
            // The same correction the bass's version explains.
            let undo = t.peak_before / t.peak_after.max(1e-9);
            let mut out = vec![0.0f32; window];
            for slot in keys_on(&t, 0) {
                let buf = bank.get(slot.sound);
                let limit = if slot.cap_ticks > 0.0 {
                    ((tick_samples as f32 * slot.cap_ticks) as usize).min(buf.len())
                } else {
                    buf.len()
                };
                for (o, v) in out.iter_mut().zip(buf.iter().take(limit)) {
                    *o += v * slot.gain * undo;
                }
            }
            above_120_energy(&out, sr)
        };

        // Measured first, judged afterwards — see the bass's version.
        let reference = level(KeysVoice::Epiano);
        let measured: Vec<(KeysVoice, f64)> = KeysVoice::ALL
            .iter()
            .map(|&v| (v, 10.0 * (level(v) / reference.max(1e-30)).log10()))
            .collect();
        for (voice, db) in measured.iter() {
            eprintln!("[keys] {:8} {db:+.2} dB against epiano", voice.name());
        }
        for &(voice, db) in measured.iter() {
            assert!(
                db.abs() <= 3.0,
                "the {} is {db:+.2} dB against the electric piano through a small \
                 speaker; KEYS_VOICE_TRIM is what is supposed to stop that",
                voice.name()
            );
        }
    }

    /// THE KEYS SIT UNDER THE BAND, OR THEY ARE NOT COMPING.
    ///
    /// A four-note voicing sustained across half a bar against ONE snare
    /// transient is a fight the chord wins on energy alone unless the engine
    /// holds it down — and a comping voice that wins that fight has stopped
    /// being accompaniment. `KEYS_TRIM` in `jam.rs` is the number that holds
    /// it down; this is what says the number still does.
    ///
    /// Measured through the same 200 Hz-4 kHz band-pass every other level
    /// claim in this file uses — a laptop speaker, which is what most of
    /// this gets played on — and over the SAME window for both, one beat at
    /// 120 BPM. A common window is the honest comparison: measuring each
    /// sound over its own length would reward the snare for being short.
    ///
    /// The floor was the 6 dB `plans/tasks/jam/W14-ENGINE-KEYS-TAKES.md`
    /// asks for. **It is 5 dB since 2026-09-20, and the ear is why.**
    ///
    /// The 6 dB was an engineering argument nobody had listened to. The owner
    /// then listened — "what I can hear is mostly drum sound, the keys and
    /// bass is very low in comparison" — and the measurement that matches
    /// what he heard is the one this file could not make: every keys voice
    /// rendered alone for eight bars against the same vibe's kit rendered
    /// alone, above 120 Hz, over four vibes at three intensities. On that,
    /// comping sat 7.5 to 10.7 dB under the kit and as far as 16.7 under in
    /// funk at Loud. `KEYS_TRIM` went up 2.2 dB to put the section on the
    /// brief's own 6 dB in THAT measurement, and a voicing against one snare
    /// accent measures about −5.5 dB once it has.
    ///
    /// So the two numbers are the same contract read against two references,
    /// and the floor here follows the one that was listened to. It is still
    /// a floor: a comping part above it is a comping part that competes with
    /// the backbeat, which is the thing this test exists to forbid.
    #[test]
    fn the_keys_sit_under_the_snare_on_a_small_speaker() {
        let sr = 48000u32;
        let bank = SoundBank::new(sr);
        let table = compile_jam(&comping(1.0)).unwrap();
        // 120 BPM sixteenths: a tick is 125 ms, a beat is 500 ms.
        let tick_samples = (sr as f64 * 60.0 / 120.0 / 4.0) as usize;
        let window = tick_samples * 4;

        // One sound, or a chord of them, rendered on its own into a window
        // of one beat, with the callback's own cap arithmetic.
        let kit = BandBanks::of(Some(&table));
        let render = |slots: &[crate::jam::JamSlot]| -> Vec<f32> {
            let mut out = vec![0.0f32; window];
            for slot in slots {
                let buf = jam_sample(&bank, kit, slot.sound);
                // A drum is interleaved stereo and a keys note is mono, so
                // the drum is folded down the middle to be measured beside
                // one. Panning can only take level away, so this is the
                // honest height rather than a flattering one.
                let mono: Vec<f32> = if matches!(slot.sound, SoundId::Band { .. }) {
                    (0..buf.len() / 2)
                        .map(|i| (buf[2 * i] * slot.pan_l + buf[2 * i + 1] * slot.pan_r) * 0.5)
                        .collect()
                } else {
                    buf.to_vec()
                };
                let limit = if slot.cap_ticks > 0.0 {
                    ((tick_samples as f32 * slot.cap_ticks) as usize).min(mono.len())
                } else {
                    mono.len()
                };
                for (o, v) in out.iter_mut().zip(mono.iter().take(limit)) {
                    *o += v * slot.gain;
                }
            }
            out
        };

        let keys = keys_on(&table, 0);
        assert_eq!(keys.len(), 4, "the voicing should be four notes");
        let snare: Vec<crate::jam::JamSlot> = table
            .tick(4, 0)
            .expect("tick 4")
            .slots()
            .iter()
            .filter(|s| s.lane == crate::jam::JamLane::Snare)
            .copied()
            .collect();
        assert_eq!(snare.len(), 1, "the backbeat should be one snare");

        let k = laptop_band_energy(&render(&keys), sr);
        let s = laptop_band_energy(&render(&snare), sr);
        let db = 10.0 * (k / s.max(1e-30)).log10();
        eprintln!("[keys] a four-note voicing measures {db:.2} dB against the snare accent");
        assert!(
            db <= -5.0,
            "a four-note voicing is {db:.2} dB against the snare accent through a \
             200 Hz-4 kHz band-pass; comping has to sit at least 5 dB under the \
             band, and this is on top of it"
        );
        // And not so far under that the harmony is a rumour.
        assert!(
            db > -30.0,
            "a four-note voicing is {db:.2} dB against the snare accent, which is \
             harmony nobody will hear"
        );
    }

    /// A VOICING RINGS UNTIL THE NEXT ONE, AND STOPS AT THE BAR LINE.
    ///
    /// The bass's rule applied to a chord, and it matters more here: four
    /// notes smeared into the next chord is not a sustain, it is a wrong
    /// chord.
    #[test]
    fn a_voicing_rings_until_the_next_chord_and_no_further() {
        let table = compile_jam(&comping(1.0)).unwrap();
        // Am7 on tick 0 runs to the D7 on tick 8, and no further.
        let first = keys_on(&table, 0);
        assert_eq!(first.len(), 4);
        for s in &first {
            assert_eq!(s.cap_ticks, 8.0, "the first chord should stop at the next");
        }
        // D7 on tick 8 runs to the bar line at tick 16.
        let second = keys_on(&table, 8);
        assert_eq!(second.len(), 4);
        for s in &second {
            assert_eq!(
                s.cap_ticks, 8.0,
                "the last chord should stop at the bar line"
            );
        }
        // And nothing at all on the ticks between.
        for t in [1u32, 4, 7, 9, 15] {
            assert!(
                keys_on(&table, t).is_empty(),
                "tick {t} should be a rest for the keys"
            );
        }
    }

    /// THE COMPING PLAYS THROUGH THE FILL.
    ///
    /// The drummer fills; the band does not stop playing the changes. Same
    /// rule the bass has, checked because the fill is a different table and
    /// a merge that missed it would be silent for one bar in twelve.
    #[test]
    fn the_keys_keep_the_changes_through_a_fill() {
        let mut cfg = comping(1.0);
        cfg.fill = Some(JamPattern {
            hat_open: Vec::new(),
            kick: vec![1; 16],
            snare: vec![1; 16],
            hat: vec![0; 16],
            ride: vec![0; 16],
            crash: vec![0; 16],
            ..Default::default()
        });
        let table = compile_jam(&cfg).unwrap();
        // Bar 3 of a four-bar form is the fill bar.
        let on_fill = table
            .tick(0, 3)
            .expect("tick 0 of the fill")
            .slots()
            .iter()
            .filter(|s| s.lane == crate::jam::JamLane::Keys)
            .count();
        assert_eq!(
            on_fill, 4,
            "the keys should play the chord through the drummer's fill"
        );
    }

    /// A trading bar drops the keys with everything else that is not the
    /// hat. Your four bars are yours; a chord under them is the band still
    /// playing.
    #[test]
    fn your_bars_in_a_trade_have_no_keys_on_them() {
        let mut cfg = comping(1.0);
        cfg.bar.hat = vec![1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
        cfg.form_bars = 8;
        cfg.practice = Some(JamPracticeConfig {
            drop_out: None,
            trade: Some(JamTrade {
                band_bars: 4,
                you_bars: 4,
            }),
        });
        let table = compile_jam(&cfg).unwrap();
        assert_eq!(table.band_state(0), JamBandState::Full);
        assert_eq!(table.band_state(4), JamBandState::HatsOnly);
        // The table still holds the chord on bar 4 — the callback is what
        // drops it, by lane, and `JamLane::Keys` is not the hat.
        let tick = table.tick(0, 4).expect("tick 0 of bar 4");
        let kept = tick
            .slots()
            .iter()
            .filter(|s| s.lane == crate::jam::JamLane::Hat)
            .count();
        let dropped = tick
            .slots()
            .iter()
            .filter(|s| s.lane == crate::jam::JamLane::Keys)
            .count();
        assert_eq!(kept, 1, "the hat keeps the time on your bars");
        assert_eq!(
            dropped, 4,
            "the chord is in the table and the callback's lane filter is what \
             takes it off"
        );
    }

    // -----------------------------------------------------------------
    // The practice windows, rendered
    // -----------------------------------------------------------------

    /// A jam with a bar the whole band plays and a practice window over it.
    /// 12-bar form, drop-out every 8 for 2 and trading fours — the two
    /// facts from the brief in one table.
    fn practising_band() -> JamConfig {
        let mut cfg = rock_16ths();
        cfg.form_bars = 12;
        cfg.bass = Some(JamBassLine {
            pitches: vec![40, 0, 0, 0, 45, 0, 0, 0, 47, 0, 0, 0, 52, 0, 0, 0],
            gain: 1.0,
            ..Default::default()
        });
        cfg
    }

    /// The three states, rendered through the same mixer the callback uses:
    /// a full bar is the band, your bars are hats, a drop-out is silence.
    ///
    /// The table's states and the rendered sound are two different claims
    /// and this is the one that matters — a state the spawn path ignores
    /// would pass every check in `jam.rs` and be inaudible in the app.
    #[test]
    fn the_practice_windows_are_what_the_band_actually_plays() {
        let sr = 48000;
        let bank = SoundBank::new(sr);
        let tick_samples = sr as usize * 60 / 120 / 4;

        let mut cfg = practising_band();
        cfg.practice = Some(JamPracticeConfig {
            drop_out: Some(JamDropOut {
                every_bars: 8,
                bars: 2,
            }),
            trade: Some(JamTrade {
                band_bars: 4,
                you_bars: 4,
            }),
        });
        let table = compile_jam(&cfg).unwrap();

        // The rule, first. The band plays four, you play four (bars 4-7),
        // the band comes back at 8 — except that the drop-out window opens
        // there and takes 8-9 out from under it, and 10-11 are the band's
        // again because the trade's next cycle starts at 8. Both facts from
        // the brief, interleaved, in one form.
        let states: Vec<JamBandState> = (0..12).map(|b| table.band_state(b)).collect();
        assert_eq!(
            states,
            vec![
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::HatsOnly,
                JamBandState::HatsOnly,
                JamBandState::HatsOnly,
                JamBandState::HatsOnly,
                JamBandState::Silent,
                JamBandState::Silent,
                JamBandState::Full,
                JamBandState::Full,
            ]
        );

        // And then what each one sounds like.
        let render_bar = |bar: u32| -> Vec<f32> {
            render_band_bar(&table, &bank, bar, tick_samples)
        };
        let energy = |b: &[f32]| -> f64 { b.iter().map(|s| (s * s) as f64).sum() };

        let full = render_bar(0);
        let silent = render_bar(8);
        let hats = render_bar(4);

        assert!(energy(&full) > 100.0, "the band is not playing bar 0");
        assert_eq!(
            silent.iter().fold(0.0f32, |m, s| m.max(s.abs())),
            0.0,
            "a drop-out bar has to be SILENT — no drums, no bass, and no click \
             either; the whole point of the window is the silence"
        );
        assert!(
            energy(&hats) > 0.0 && energy(&hats) < energy(&full) * 0.2,
            "a trading bar rendered {:.0} against the band's {:.0}; that is not \
             hats only",
            energy(&hats),
            energy(&full)
        );

        // Hats only means the hat lane and NOTHING ELSE, which is a claim
        // about what is missing rather than about how loud what is left is.
        // The kick and the bass are what carry a bar's bottom end and a
        // closed hat has none of it, so if either were still playing the
        // low band would say so. Comparing two renders' levels could not:
        // the per-table normalisation scales a hats-only table differently
        // from a full one, so a level is not a number the two bars share.
        let low = |b: &[f32]| low_band_share(b, sr) * energy(b);
        assert!(
            low(&hats) < low(&full) * 0.01,
            "a trading bar carries {:.1} of energy under 150 Hz against the band's \
             {:.1}; the kick or the bass is still playing through your four",
            low(&hats),
            low(&full)
        );
    }


    /// THE PERCUSSIONIST KEEPS GOING WHEN THE HATS DO.
    ///
    /// The contract's band rule, rendered rather than asserted about a
    /// table: in a breakdown or on your bars in a trade the kit drops to the
    /// hats and the shaker and the congas keep the time. It is the whole
    /// reason the layer earns its place — a bar that drops to a closed hat
    /// alone falls over, and one with a percussionist still in it opens up.
    ///
    /// Three claims, because "kept" and "dropped" are different questions:
    /// the trading bar is quieter than the band, the percussion is still in
    /// it, and the kick and the bass are not.
    #[test]
    fn a_trading_bar_keeps_the_percussionist_and_drops_everything_else() {
        let sr = 48000;
        let bank = SoundBank::new(sr);
        let tick_samples = sr as usize * 60 / 120 / 4;
        let kit = std::sync::Arc::new(crate::kit::KitBank::for_tests(
            &KitVoice::DRUMS,
            JAM_REFERENCE_SR,
            0.2,
        ));
        let set = std::sync::Arc::new(crate::kit::KitBank::for_tests(
            &KitVoice::PERC,
            JAM_REFERENCE_SR,
            0.2,
        ));

        let mut cfg = practising_band();
        cfg.form_bars = 8;
        cfg.practice = Some(JamPracticeConfig {
            drop_out: None,
            trade: Some(JamTrade {
                band_bars: 4,
                you_bars: 4,
            }),
        });
        let sixteen = |v: [u8; 4]| -> Vec<u8> { (0..16).map(|t| v[t % 4]).collect() };
        cfg.bar.shaker = sixteen([2, 1, 1, 1]);
        cfg.bar.conga_hi = sixteen([0, 0, 3, 0]);
        cfg.bar.conga_lo = sixteen([2, 0, 0, 1]);
        let table = crate::jam::compile_with_perc(&cfg, kit, Some(set)).unwrap();
        assert_eq!(table.band_state(0), JamBandState::Full);
        assert_eq!(table.band_state(4), JamBandState::HatsOnly);

        let energy = |b: &[f32]| -> f64 { b.iter().map(|s| (s * s) as f64).sum() };
        let full = render_band_bar(&table, &bank, 0, tick_samples);
        let yours = render_band_bar(&table, &bank, 4, tick_samples);

        assert!(
            energy(&yours) > 0.0 && energy(&yours) < energy(&full),
            "your bars rendered {:.0} against the band's {:.0}",
            energy(&yours),
            energy(&full)
        );

        // The percussion is still there. Measured against the same bar with
        // the percussionist switched off, which is the only honest
        // comparison: a hats-only bar's level says nothing on its own.
        let mut no_perc = cfg.clone();
        no_perc.perc = Some(false);
        let bare = crate::jam::compile_with_perc(
            &no_perc,
            std::sync::Arc::new(crate::kit::KitBank::for_tests(
                &KitVoice::DRUMS,
                JAM_REFERENCE_SR,
                0.2,
            )),
            Some(std::sync::Arc::new(crate::kit::KitBank::for_tests(
                &KitVoice::PERC,
                JAM_REFERENCE_SR,
                0.2,
            ))),
        )
        .unwrap();
        let hats_alone = render_band_bar(&bare, &bank, 4, tick_samples);
        assert!(
            energy(&yours) > energy(&hats_alone) * 1.5,
            "a trading bar with a shaker and two congas in it rendered {:.0} \
             against {:.0} with the percussionist switched off — the \
             percussion is being dropped with the rest of the band",
            energy(&yours),
            energy(&hats_alone)
        );

        // And the kick and the bass are gone. The low band is what they
        // carry and a closed hat has none of it, so this is the claim about
        // what is MISSING rather than about how loud what is left is.
        let low = |b: &[f32]| low_band_share(b, sr) * energy(b);
        assert!(
            low(&yours) < low(&full) * 0.01,
            "your four carry {:.1} of energy under 150 Hz against the band's \
             {:.1}; the kick or the bass is still playing",
            low(&yours),
            low(&full)
        );
    }

    /// One bar of a table, spawned and mixed the way the callback does it,
    /// with the practice window applied. A sibling of [`render_jam`] and
    /// deliberately another copy of the callback's arithmetic rather than a
    /// shared helper, for the same reason: a change in the callback this
    /// does not follow fails an assertion instead of moving with the bug.
    fn render_band_bar(
        table: &JamTable,
        bank: &SoundBank,
        jam_bar: u32,
        tick_samples: usize,
    ) -> Vec<f32> {
        let ticks = table.ticks_per_bar() as usize;
        let state = table.band_state(jam_bar);
        let mut out = vec![0.0f32; ticks * tick_samples];
        let mut voices: Vec<Voice> = Vec::new();
        let mut pos = 0usize;
        for t in 0..ticks {
            if state != JamBandState::Silent {
                if let Some(tick) = table.tick(t as u32, jam_bar) {
                    for slot in tick.slots() {
                        // The callback's filter, and the percussionist is
                        // in it: they keep going when the hats do
                        // (`plans/tasks/jam-v5/BRIEF.md`). A copy of the
                        // callback's line rather than a shared helper, for
                        // the reason this whole function is one.
                        if state == JamBandState::HatsOnly
                            && slot.lane != JamLane::Hat
                            && !slot.lane.is_perc()
                        {
                            continue;
                        }
                        spawn_band_voice(
                            &mut voices,
                            slot,
                            1.0,
                            jam_bar,
                            t as u32,
                            table.ticks_per_bar(),
                            tick_samples as u64,
                            0,
                            (CHOKE_FADE_SECS * 48_000.0) as u32,
                        );
                    }
                    if t == 0 && jam_bar == 0 && state == JamBandState::Full {
                        if let Some(slot) = table.crash_on_one() {
                            spawn_band_voice(
                                &mut voices,
                                &JamSlot {
                                    cap_ticks: 0.0,
                                    ..slot
                                },
                                1.0,
                                jam_bar,
                                0,
                                table.ticks_per_bar(),
                                tick_samples as u64,
                                0,
                                (CHOKE_FADE_SECS * 48_000.0) as u32,
                            );
                        }
                    }
                }
            }
            let kit = BandBanks::of(Some(table));
            for _ in 0..tick_samples {
                let mut mix = 0.0f32;
                for v in voices.iter_mut() {
                    let buf = jam_sample(bank, kit, v.sound_id);
                    let frames = if v.stereo { buf.len() / 2 } else { buf.len() };
                    let limit = if v.max_samples > 0 {
                        v.max_samples.min(frames)
                    } else {
                        frames
                    };
                    if v.position < limit {
                        // Down the middle: what this harness measures is
                        // WHICH LANES sounded, and a stereo fold would make
                        // a placed drum look quieter than it is.
                        mix += if v.stereo {
                            (buf[2 * v.position] * v.amp_l + buf[2 * v.position + 1] * v.amp_r)
                                * 0.5
                        } else {
                            buf[v.position] * v.amp_l
                        };
                    }
                    v.position += 1;
                }
                out[pos] = mix;
                pos += 1;
            }
            voices.retain(|v| {
                let buf = jam_sample(bank, kit, v.sound_id);
                let frames = if v.stereo { buf.len() / 2 } else { buf.len() };
                !v.done(frames)
            });
        }
        out
    }

    /// TWELVE BARS, WRITTEN OUT.
    ///
    /// The engine's rule has to be `src/jam/practice.ts`'s rule, and the
    /// port of it lives in `jam.rs`. This is the end of it the UI sees: the
    /// table the audio thread indexes, one state per bar of the chorus.
    ///
    /// The states below are LITERAL and worked out by hand from the two
    /// windows, not derived from the function that filled the table. This
    /// test used to compare `table.band_state(b)` against
    /// `band_state_for_bar(b, ...)` — which is the function that filled it —
    /// so it could not fail whatever either of them did.
    ///
    /// A twelve-bar form, trading fours, with the band dropping out for two
    /// bars every eight:
    ///
    /// * bars 1-4  — the band plays; the trade's first four.
    /// * bars 5-8  — your four: hats only, and the bass steps out. Bar 8 is
    ///   the fourth of them, so a trade alone would have the band back on
    ///   bar 9.
    /// * bars 9-10 — the drop-out window opens at bar 9 (the first multiple
    ///   of eight inside the chorus, counting from 0) and takes two bars.
    ///   Silence wins over the trade, which is why bar 9 is not the band's.
    /// * bars 11-12 — the band again: the trade's next cycle started at bar
    ///   9, so these are still inside its four.
    #[test]
    fn the_band_state_on_the_beat_event_follows_the_form() {
        use JamBandState::{Full, HatsOnly, Silent};

        let mut cfg = practising_band();
        assert_eq!(cfg.form_bars, 12, "the form these states were read off");
        cfg.practice = Some(JamPracticeConfig {
            drop_out: Some(JamDropOut {
                every_bars: 8,
                bars: 2,
            }),
            trade: Some(JamTrade {
                band_bars: 4,
                you_bars: 4,
            }),
        });
        let table = compile_jam(&cfg).unwrap();

        let expected = [
            Full, Full, Full, Full, // bars 1-4: the band's four
            HatsOnly, HatsOnly, HatsOnly, HatsOnly, // bars 5-8: yours
            Silent, Silent, // bars 9-10: the drop-out, over the trade
            Full, Full, // bars 11-12
        ];
        let actual: Vec<JamBandState> = (0..12).map(|b| table.band_state(b)).collect();
        assert_eq!(
            actual,
            expected.to_vec(),
            "bar by bar, as a musician would count them"
        );

        // Phase-locked: the same twelve states every chorus, so a silence
        // lands on the same chord every time round. The engine reads the
        // table with the bar WITHIN the chorus, so this is the claim that
        // the table is indexed by that and not by a running bar count.
        for chorus in 1..=4u32 {
            for (bar, want) in expected.iter().enumerate() {
                assert_eq!(
                    table.band_state(bar as u32),
                    *want,
                    "chorus {chorus}, bar {}",
                    bar + 1
                );
            }
        }

        // Drop-out alone, so the trade is not what is being read: bars 9-10
        // silent and everything else the band.
        cfg.practice = Some(JamPracticeConfig {
            drop_out: Some(JamDropOut {
                every_bars: 8,
                bars: 2,
            }),
            trade: None,
        });
        let dropping = compile_jam(&cfg).unwrap();
        assert_eq!(
            (0..12)
                .map(|b| dropping.band_state(b))
                .collect::<Vec<JamBandState>>(),
            vec![
                Full, Full, Full, Full, Full, Full, Full, Full, Silent, Silent, Full, Full,
            ]
        );

        // And trading alone: four and four, from the top of every chorus.
        cfg.practice = Some(JamPracticeConfig {
            drop_out: None,
            trade: Some(JamTrade {
                band_bars: 4,
                you_bars: 4,
            }),
        });
        let trading = compile_jam(&cfg).unwrap();
        assert_eq!(
            (0..12)
                .map(|b| trading.band_state(b))
                .collect::<Vec<JamBandState>>(),
            vec![
                Full, Full, Full, Full, HatsOnly, HatsOnly, HatsOnly, HatsOnly, Full, Full, Full,
                Full,
            ],
            "bar 9 opens the trade's next cycle, so the band is back"
        );

        // The contract's value when there is no jam at all.
        let plain = compile_jam(&rock_16ths()).unwrap();
        assert!((0..4).all(|b| plain.band_state(b) == Full));
    }

    /// THE MEMO MUST NOT LET A BASS LINE THROUGH THE CEILING.
    ///
    /// `set_jam` reuses a normalisation it has already measured rather than
    /// rendering four bars again (`JamGainCache` in `jam.rs`). Everything
    /// `the_busiest_groove_never_makes_the_mixer_clamp` proves about a
    /// freshly compiled table has to stay true of one that came out of the
    /// memo, or the saving is a clipping bug with a stopwatch attached.
    ///
    /// So: two choruses of the bar-ahead handshake through one memo — bass
    /// lines from the quietest and sparsest the contract allows to the
    /// loudest with a note on every sixteenth — and render what comes out of
    /// the second, where every table is a memo hit. Every kit, every rate a
    /// device hands out, across the tempo range, at FULL volume.
    ///
    /// The quiet-then-loud order is the one that used to fail. Keyed on the
    /// drums alone, the loud table borrowed the quiet one's headroom and the
    /// room kit rendered 1.075 at 40 BPM. The key includes the bass now, and
    /// this is what says so in samples rather than in a comment.
    #[test]
    fn the_gain_cache_never_lets_a_changed_bass_reach_the_clamp() {
        use crate::jam::{compile_with, JamGainCache};

        // Quietest and sparsest first, loudest and densest last, because
        // reusing a small measurement for a big table is the dangerous
        // direction and this is the order that would do it.
        let lines: [(f32, Vec<u8>); 4] = [
            (0.5, vec![40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
            (
                1.0,
                vec![28, 0, 0, 0, 33, 0, 0, 0, 30, 0, 0, 0, 35, 0, 0, 0],
            ),
            (
                1.5,
                vec![40, 45, 47, 52, 40, 45, 47, 52, 38, 43, 45, 50, 38, 43, 45, 50],
            ),
            (
                1.5,
                vec![28, 33, 40, 45, 28, 33, 40, 45, 30, 35, 42, 47, 30, 35, 42, 47],
            ),
        ];

        // Built once. Decoding thirty-two kit files and synthesising the
        // bass bank costs far more than the renders do, and nothing in the
        // loop below changes a bank.
        let reference = SoundBank::new(JAM_REFERENCE_SR);
        let rates: Vec<(u32, SoundBank)> = [22050u32, 44100, 88200, 96000]
            .into_iter()
            .map(|sr| (sr, SoundBank::new(sr)))
            .collect();

        for kit in JamKit::all() {
            let cache = JamGainCache::new();
            for round in 0..2 {
                for (gain, pitches) in &lines {
                    let mut cfg = busy_band(kit, false);
                    cfg.bass = Some(JamBassLine {
                        pitches: pitches.clone(),
                        gain: *gain,
                        ..Default::default()
                    });
                    let bank = crate::jam::reference_bank(kit.name()).unwrap();
                    let table =
                        compile_with(&cfg, &cache, bank, None, crate::jam::JamVoices::default())
                            .unwrap();
                    assert_eq!(
                        table.base_peak,
                        compile_jam(&cfg).unwrap().base_peak,
                        "{} round {round} at bass gain {gain} came out of the memo \
                         with a measurement that is not this table's",
                        kit.name()
                    );
                    // The sweep only on the second round, where every table
                    // is a memo hit. The first round is a cold compile, and
                    // `the_busiest_groove_never_makes_the_mixer_clamp`
                    // already sweeps those.
                    if round == 0 {
                        continue;
                    }
                    let check = |bank: &SoundBank, bpm: u32, sr: u32| {
                        let tick_samples = (sr as f64 * 60.0 / bpm as f64 / 4.0) as usize;
                        let r = render_jam(&table, bank, 4, tick_samples, 1.0);
                        assert!(
                            r.peak <= 1.0,
                            "{} at {bpm} BPM / {sr} Hz, bass gain {gain}, rendered \
                             {:.3} out of the memo; the mixer clamped",
                            kit.name(),
                            r.peak
                        );
                    };
                    // Coarser than the sweep in
                    // `the_busiest_groove_never_makes_the_mixer_clamp`, and
                    // for a different reason: that one is hunting the
                    // interference humps, which are a few BPM wide. This one
                    // is asking whether the memo handed over the wrong
                    // table, which is a whole-table error and shows up at
                    // any tempo. 40 BPM is in the ladder on purpose — it is
                    // where the old drums-only key clamped.
                    for bpm in (40u32..=300).step_by(40).chain([300]) {
                        check(&reference, bpm, JAM_REFERENCE_SR);
                    }
                    for (sr, bank) in &rates {
                        for bpm in [120u32, 240, 300] {
                            check(bank, bpm, *sr);
                        }
                    }
                }
            }
        }
    }

    /// Taking the band away leaves exactly the metronome that was there
    /// before Jam existed.
    #[test]
    fn no_jam_means_the_click() {
        for subdivision in [1u32, 2, 3, 4, 6] {
            assert_eq!(
                jam_play(None, false, false, false, 4, subdivision, 0, 0, 0),
                JamPlay::Click
            );
        }
    }

    // ─── The beat queue ──────────────────────────────────────────────────

    use super::{BeatNotification, BeatQueue, BEAT_QUEUE_SLOTS};

    /// A notification with every field set to something distinguishable, so
    /// a field packed into the wrong bits cannot pass by coincidence.
    fn a_notification(n: u64) -> BeatNotification {
        BeatNotification {
            session: 0xDEAD_BEEF_0000_0000 | n,
            beat: 11 + n as u32,
            measure_beat: 3,
            subdivision: 2,
            subdivision_total: 6,
            is_downbeat: true,
            accent: 2,
            beats_per_bar: 7,
            ts_ns: 1_234_567_890_123 + n,
            expected_interval_ms: 200.0 / 3.0,
            is_warmup_beat: false,
            is_warmup_transition: true,
            bar_just_completed: false,
            delay_us: 12_345 + n,
            jam_bar: 9,
            jam_chorus: 4,
            jam_band_state: JamBandState::HatsOnly,
            jam_bar_mismatch: true,
            song_bar: 17,
            song_tick: 2_880 + n as u32,
            song_pass: 5,
            jam_form_ended: false,
        }
    }

    fn assert_same(a: &BeatNotification, b: &BeatNotification) {
        assert_eq!(a.session, b.session);
        assert_eq!(a.beat, b.beat);
        assert_eq!(a.measure_beat, b.measure_beat);
        assert_eq!(a.subdivision, b.subdivision);
        assert_eq!(a.subdivision_total, b.subdivision_total);
        assert_eq!(a.is_downbeat, b.is_downbeat);
        assert_eq!(a.accent, b.accent);
        assert_eq!(a.beats_per_bar, b.beats_per_bar);
        assert_eq!(a.ts_ns, b.ts_ns);
        assert_eq!(a.expected_interval_ms, b.expected_interval_ms);
        assert_eq!(a.is_warmup_beat, b.is_warmup_beat);
        assert_eq!(a.is_warmup_transition, b.is_warmup_transition);
        assert_eq!(a.bar_just_completed, b.bar_just_completed);
        assert_eq!(a.delay_us, b.delay_us);
        assert_eq!(a.jam_bar, b.jam_bar);
        assert_eq!(a.jam_chorus, b.jam_chorus);
        assert_eq!(a.jam_band_state, b.jam_band_state);
        assert_eq!(a.jam_bar_mismatch, b.jam_bar_mismatch);
        assert_eq!(a.song_bar, b.song_bar);
        assert_eq!(a.song_tick, b.song_tick);
        assert_eq!(a.song_pass, b.song_pass);
        assert_eq!(a.jam_form_ended, b.jam_form_ended);
    }

    fn queue(slots: usize) -> (BeatQueue, Arc<AtomicU64>) {
        let dropped = Arc::new(AtomicU64::new(0));
        (BeatQueue::new(slots, dropped.clone()), dropped)
    }

    /// Twenty-two fields go in, twenty-two fields come out. The nine that
    /// share a word are the reason this test exists.
    #[test]
    fn a_notification_survives_the_queue_whole() {
        let (q, dropped) = queue(4);
        let sent = a_notification(0);
        assert!(q.push(&sent));
        let got = q.pop().expect("one in, one out");
        assert_same(&sent, &got);
        assert_eq!(dropped.load(Ordering::Relaxed), 0);
        assert!(q.pop().is_none(), "and nothing behind it");
    }

    /// Every combination of the six flags, the three-valued enum and the
    /// extreme bytes, so a bit shifted into its neighbour is caught.
    ///
    /// **The word is full**: nine fields, 24 + 2 + 6, exactly 32 bits. W9's
    /// song position therefore travels in three `u32` arrays of its own
    /// rather than in here, and the second half of this test is what says so
    /// — it drives the song fields to their extremes ALONGSIDE the packed
    /// ones, so a future repacking that tried to steal a bit for them would
    /// fail here rather than in somebody's session.
    #[test]
    fn the_small_fields_survive_the_round_trip() {
        let (q, _) = queue(64);
        let states = [
            JamBandState::Full,
            JamBandState::HatsOnly,
            JamBandState::Silent,
        ];
        for bits in 0u32..64 {
            for state in states {
                let mut n = a_notification(0);
                n.subdivision_total = 255;
                n.accent = 254;
                n.beats_per_bar = 253;
                n.jam_band_state = state;
                n.is_downbeat = bits & 1 != 0;
                n.is_warmup_beat = bits & 2 != 0;
                n.is_warmup_transition = bits & 4 != 0;
                n.bar_just_completed = bits & 8 != 0;
                n.jam_bar_mismatch = bits & 16 != 0;
                n.jam_form_ended = bits & 32 != 0;
                // The song's three words, at the values that would collide
                // with a flag if anybody ever moved them into `small`: both
                // sentinels, and a full 32 bits of tick and pass.
                n.song_bar = match bits % 3 {
                    0 => crate::song::NO_SONG_BAR,
                    1 => crate::song::COUNT_IN_BAR,
                    _ => bits,
                };
                n.song_tick = u32::MAX - bits;
                n.song_pass = bits.wrapping_mul(0x8000_0001);
                assert!(q.push(&n));
                assert_same(&n, &q.pop().unwrap());
            }
        }
    }

    /// The packing has no room left, and the next worker has to know before
    /// they reach for a bit rather than after.
    #[test]
    fn the_small_word_is_full() {
        // Three `u8`s at 8 bits each, a three-valued enum in 2, six flags.
        assert_eq!(8 * 3 + 2 + 6, 32);
        // Every bit of it moves. The band state's two bits need two
        // notifications to cover, because the enum has three values and not
        // four: `HatsOnly` is 0b01 and `Silent` is 0b10, so neither on its
        // own sets both — which is the only slack in the word, and it is
        // half a bit.
        let all = |state: JamBandState| {
            let mut n = a_notification(0);
            n.subdivision_total = 255;
            n.accent = 255;
            n.beats_per_bar = 255;
            n.jam_band_state = state;
            n.is_downbeat = true;
            n.is_warmup_beat = true;
            n.is_warmup_transition = true;
            n.bar_just_completed = true;
            n.jam_bar_mismatch = true;
            n.jam_form_ended = true;
            super::pack_small_fields(&n)
        };
        assert_eq!(
            all(JamBandState::HatsOnly) | all(JamBandState::Silent),
            u32::MAX,
            "every bit of the word is spoken for"
        );
    }

    /// Order is order: a queue is not a set, and the matcher reads these in
    /// the order the beats were played.
    #[test]
    fn beats_come_back_in_the_order_they_were_played() {
        let (q, _) = queue(8);
        for i in 0..5 {
            assert!(q.push(&a_notification(i)));
        }
        for i in 0..5 {
            assert_eq!(q.pop().unwrap().session, a_notification(i).session);
        }
        assert!(q.pop().is_none());
    }

    /// The wrap. A ring that was only ever filled once would hide an index
    /// that does not come back round.
    #[test]
    fn the_ring_goes_round_more_than_once() {
        let (q, dropped) = queue(4);
        for i in 0..40u64 {
            assert!(q.push(&a_notification(i)), "room, because it is drained");
            assert_eq!(q.pop().unwrap().session, a_notification(i).session);
        }
        assert_eq!(dropped.load(Ordering::Relaxed), 0);
    }

    /// A full queue drops and COUNTS, rather than allocating, blocking or
    /// pretending. The count is what the probe fails on and what the event
    /// loop prints.
    #[test]
    fn a_full_queue_drops_and_says_so() {
        let (q, dropped) = queue(4);
        for i in 0..4 {
            assert!(q.push(&a_notification(i)));
        }
        assert!(!q.push(&a_notification(99)), "the fifth has nowhere to go");
        assert!(!q.push(&a_notification(100)));
        assert_eq!(dropped.load(Ordering::Relaxed), 2);

        // And the four that DID fit are still the four that fit — a full
        // queue keeps the oldest rather than overwriting it, because the
        // matcher needs a run of beats and not the most recent one.
        for i in 0..4 {
            assert_eq!(q.pop().unwrap().session, a_notification(i).session);
        }
        assert!(q.pop().is_none());
    }

    /// A stop throws away what the transport left behind.
    #[test]
    fn draining_empties_it() {
        let (q, _) = queue(8);
        for i in 0..6 {
            assert!(q.push(&a_notification(i)));
        }
        q.drain();
        assert!(q.pop().is_none());
        // And the room comes back, rather than the ring being wedged.
        assert!(q.push(&a_notification(7)));
        assert_eq!(q.pop().unwrap().session, a_notification(7).session);
    }

    /// A capacity that is not a power of two is rounded UP, never down: the
    /// mask arithmetic needs it and the headroom argument must not shrink.
    #[test]
    fn capacity_rounds_up_to_a_power_of_two() {
        let (q, _) = queue(5);
        assert_eq!(q.capacity(), 8);
        let (q, _) = queue(BEAT_QUEUE_SLOTS);
        assert_eq!(q.capacity(), BEAT_QUEUE_SLOTS);
    }

    /// THE OTHER PRE-SIZED BUFFER IN THE CALLBACK, pinned the same way.
    ///
    /// `cached.beat_groups` is refilled in place on every buffer against a
    /// capacity of `MAX_BEAT_GROUPS`, and the only thing keeping that from
    /// being a `realloc` under the mixer is that `set_beat_groups` refuses
    /// more groups than that. There are literally TWO constants called
    /// `MAX_BEAT_GROUPS`, one here and one in `commands.rs`, both 6, with
    /// nothing between them. This is the thing between them: loosen the
    /// validator and this fails rather than the click.
    #[test]
    fn the_validator_cannot_hand_the_callback_more_groups_than_it_reserved() {
        assert_eq!(
            MAX_BEAT_GROUPS,
            crate::commands::MAX_BEAT_GROUPS,
            "the callback reserves one number and the command surface enforces another"
        );
        let longest: Vec<u8> = vec![1; MAX_BEAT_GROUPS];
        assert!(
            crate::commands::validate_beat_groups(&longest).is_ok(),
            "the reservation should not be bigger than what is allowed"
        );
        let one_too_many: Vec<u8> = vec![1; MAX_BEAT_GROUPS + 1];
        assert!(
            crate::commands::validate_beat_groups(&one_too_many).is_err(),
            "a bar of {} groups would reallocate `cached.beat_groups` on the audio thread",
            MAX_BEAT_GROUPS + 1
        );
    }

    /// THE SIZING ARGUMENT, AS A TEST.
    ///
    /// `set_bpm` clamps to 300 and `set_subdivision` to 6, so 30 ticks a
    /// second is the fastest stream the app can produce. The queue must hold
    /// seconds of that, because a dropped notification is a beat the score
    /// is missing — see `BEAT_QUEUE_SLOTS`. Pinned so that anyone shrinking
    /// it has to argue with this rather than with a comment.
    #[test]
    fn the_queue_holds_seconds_of_the_fastest_click_the_app_allows() {
        const TICKS_PER_SEC: usize = 300 / 60 * 6;
        assert_eq!(TICKS_PER_SEC, 30);
        assert!(
            BEAT_QUEUE_SLOTS >= TICKS_PER_SEC * 10,
            "ten seconds is the floor; {BEAT_QUEUE_SLOTS} slots is {} s",
            BEAT_QUEUE_SLOTS / TICKS_PER_SEC
        );
    }

    /// One writer, one reader, both running — the shape the callback and the
    /// event loop actually have. Not a proof of the memory ordering, but it
    /// catches a lost, duplicated or reordered slot, which is what a wrong
    /// index looks like in practice.
    ///
    /// The producer here goes as fast as it can and so DOES fill a 64-slot
    /// queue, which the real callback cannot (`BEAT_QUEUE_SLOTS`); it retries
    /// a refused push rather than losing the beat, so the drop counter climbs
    /// and is not what this test is about. What it is about is that every
    /// beat that went in comes out exactly once and in order.
    #[test]
    fn a_producer_and_a_consumer_agree_on_every_beat() {
        const BEATS: u64 = 20_000;
        let (q, _dropped) = queue(64);
        let q = Arc::new(q);
        let producer = {
            let q = q.clone();
            thread::spawn(move || {
                let mut sent = 0u64;
                while sent < BEATS {
                    if q.push(&a_notification(sent)) {
                        sent += 1;
                    } else {
                        thread::yield_now();
                    }
                }
            })
        };
        let mut want = 0u64;
        while want < BEATS {
            match q.pop() {
                Some(n) => {
                    assert_eq!(n.session, a_notification(want).session, "in order, no gaps");
                    want += 1;
                }
                None => thread::yield_now(),
            }
        }
        producer.join().unwrap();
        assert!(q.pop().is_none(), "and nothing left over");
    }
}
