use crate::jam::{JamBandState, JamLane, JamTable, JamTick};
use crate::onset::SharedTempoContext;
use crate::state::SharedState;
use crate::timing::{BeatLog, BeatTick};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rodio::Source;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
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

// Embedded click sounds -- 4 kits
const CLICK_HIGH: &[u8] = include_bytes!("../sounds/click_high.wav");
const CLICK_LOW: &[u8] = include_bytes!("../sounds/click_low.wav");
const WOOD_HIGH: &[u8] = include_bytes!("../sounds/wood_high.wav");
const WOOD_LOW: &[u8] = include_bytes!("../sounds/wood_low.wav");
const BEEP_HIGH: &[u8] = include_bytes!("../sounds/beep_high.wav");
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
const SNARE_HIGH: &[u8] = include_bytes!("../sounds/snare_high.wav");
const SNARE_LOW: &[u8] = include_bytes!("../sounds/snare_low.wav");
const CHIME_UP: &[u8] = include_bytes!("../sounds/chime_up.wav");
const CHIME_DOWN: &[u8] = include_bytes!("../sounds/chime_down.wav");

/// The four jam kits, eight voices each — `src-tauri/sounds/KITS.md` has the
/// file list, the measurements and the reasoning behind each kit's character.
///
/// A table rather than thirty-two named constants, and a table rather than
/// thirty-two `SoundId` variants: the row is [`JamKit`] and the column is
/// [`KitVoice`], so the bank decodes them in one loop and [`SoundBank::get`]
/// indexes instead of matching. The order of the columns is the order of
/// `KitVoice`, and `the_kit_table_is_laid_out_the_way_the_voices_are_named`
/// is what stops the two drifting.
///
/// Every file is mono, 16-bit, 44.1 kHz, peak 0.900. The peak is uniform on
/// purpose: the files carry timbre and duration, and the engine carries
/// balance (`LEVEL_GAIN` in `jam.rs`). A voice that should be quieter is
/// turned down here, never shipped quieter.
const KIT_WAVS: [[&[u8]; KIT_VOICES]; KIT_COUNT] = [
    // room — the app's drum kit, in a room. The safe default.
    [
        include_bytes!("../sounds/kit_room_kick.wav"),
        include_bytes!("../sounds/kit_room_snare_hi.wav"),
        include_bytes!("../sounds/kit_room_snare_lo.wav"),
        include_bytes!("../sounds/kit_room_hat.wav"),
        include_bytes!("../sounds/kit_room_hat_open.wav"),
        include_bytes!("../sounds/kit_room_ride.wav"),
        include_bytes!("../sounds/kit_room_rim.wav"),
        include_bytes!("../sounds/kit_room_crash.wav"),
    ],
    // tight — dry and punchy, for funk and sixteenths.
    [
        include_bytes!("../sounds/kit_tight_kick.wav"),
        include_bytes!("../sounds/kit_tight_snare_hi.wav"),
        include_bytes!("../sounds/kit_tight_snare_lo.wav"),
        include_bytes!("../sounds/kit_tight_hat.wav"),
        include_bytes!("../sounds/kit_tight_hat_open.wav"),
        include_bytes!("../sounds/kit_tight_ride.wav"),
        include_bytes!("../sounds/kit_tight_rim.wav"),
        include_bytes!("../sounds/kit_tight_crash.wav"),
    ],
    // brushes — for swing and bossa; the ride carries the time.
    [
        include_bytes!("../sounds/kit_brushes_kick.wav"),
        include_bytes!("../sounds/kit_brushes_snare_hi.wav"),
        include_bytes!("../sounds/kit_brushes_snare_lo.wav"),
        include_bytes!("../sounds/kit_brushes_hat.wav"),
        include_bytes!("../sounds/kit_brushes_hat_open.wav"),
        include_bytes!("../sounds/kit_brushes_ride.wav"),
        include_bytes!("../sounds/kit_brushes_rim.wav"),
        include_bytes!("../sounds/kit_brushes_crash.wav"),
    ],
    // electronic — 808-shaped, hand clap for the snare.
    [
        include_bytes!("../sounds/kit_electronic_kick.wav"),
        include_bytes!("../sounds/kit_electronic_snare_hi.wav"),
        include_bytes!("../sounds/kit_electronic_snare_lo.wav"),
        include_bytes!("../sounds/kit_electronic_hat.wav"),
        include_bytes!("../sounds/kit_electronic_hat_open.wav"),
        include_bytes!("../sounds/kit_electronic_ride.wav"),
        include_bytes!("../sounds/kit_electronic_rim.wav"),
        include_bytes!("../sounds/kit_electronic_crash.wav"),
    ],
];

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
const BEAT_GAIN: f32 = 0.65;

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
fn resample(mono: &[f32], source_sr: u32, target_sr: u32) -> Vec<f32> {
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

/// How many kits [`KIT_WAVS`] holds, and how many voices each one has.
pub const KIT_COUNT: usize = 4;
pub const KIT_VOICES: usize = 8;

/// The peak every kit file carries, and the peak every decoded kit buffer is
/// put back on. `src-tauri/sounds/KITS.md` measures all thirty-two at 0.900;
/// see [`SoundBank::new`] for why the resampler makes this a thing the bank
/// has to restore rather than a thing it can assume.
const KIT_FILE_PEAK: f32 = 0.9;

/// Which drum kit a jam plays. `kit` on the config names one of these; an
/// unknown name is [`JamKit::Room`], which is the kit that sounds like the
/// app already sounds.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum JamKit {
    Room,
    Tight,
    Brushes,
    Electronic,
}

impl JamKit {
    /// Every kit, in the order [`KIT_WAVS`] lists them.
    pub const ALL: [JamKit; KIT_COUNT] = [Self::Room, Self::Tight, Self::Brushes, Self::Electronic];

    /// The name the contract uses (`Jam.kit` in `src/jam/types.ts`).
    pub fn name(self) -> &'static str {
        match self {
            Self::Room => "room",
            Self::Tight => "tight",
            Self::Brushes => "brushes",
            Self::Electronic => "electronic",
        }
    }

    /// Read a kit out of a config. **Unknown names are `room`**, not an
    /// error: a jam saved by a later build that knows more kits must still
    /// play, and the safe default is the one the metronome already sounds
    /// like. Case is ignored, because a hand-edited store is a real thing.
    pub fn from_name(name: &str) -> Self {
        match name.trim().to_ascii_lowercase().as_str() {
            "tight" => Self::Tight,
            "brushes" => Self::Brushes,
            "electronic" => Self::Electronic,
            _ => Self::Room,
        }
    }
}

/// One drum of a kit. The order is the column order of [`KIT_WAVS`].
///
/// `HatOpen` and `Rim` have no lane in `JamPattern` today — no groove in the
/// library plays them. They are decoded and addressable anyway so the groove
/// editor can grow a lane without the engine changing underneath it, which
/// is cheaper than adding two files and two bank entries later.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum KitVoice {
    Kick,
    SnareHi,
    SnareLo,
    Hat,
    HatOpen,
    Ride,
    Rim,
    Crash,
}

impl KitVoice {
    /// Every voice, in the order [`KIT_WAVS`] lists them.
    pub const ALL: [KitVoice; KIT_VOICES] = [
        Self::Kick,
        Self::SnareHi,
        Self::SnareLo,
        Self::Hat,
        Self::HatOpen,
        Self::Ride,
        Self::Rim,
        Self::Crash,
    ];

    /// The `<voice>` half of `kit_<kit>_<voice>.wav`.
    pub fn file_name(self) -> &'static str {
        match self {
            Self::Kick => "kick",
            Self::SnareHi => "snare_hi",
            Self::SnareLo => "snare_lo",
            Self::Hat => "hat",
            Self::HatOpen => "hat_open",
            Self::Ride => "ride",
            Self::Rim => "rim",
            Self::Crash => "crash",
        }
    }
}

// ---------------------------------------------------------------------------
// The bass — a synthesised bank, one buffer per semitone
// ---------------------------------------------------------------------------

/// E1, the bottom of a four-string bass. Mirrors `BASS_MIN_MIDI` in
/// `src/jam/bassline.ts`, which folds every note it writes into this range.
pub const BASS_MIN_MIDI: u8 = 28;
/// G3. High enough for a walking line to breathe, low enough to stay bass.
pub const BASS_MAX_MIDI: u8 = 55;
/// Twenty-eight semitones, E1 to G3 inclusive.
pub const BASS_NOTES: usize = (BASS_MAX_MIDI - BASS_MIN_MIDI + 1) as usize;

/// Concert pitch. Every note in the bank is `440 × 2^((midi − 69) / 12)`.
const BASS_TUNING_HZ: f64 = 440.0;
/// How long one note's buffer is. The cap in the table usually cuts it
/// shorter (see `bass` in `jam.rs`); this is the longest a note can ring.
const BASS_NOTE_SECS: f64 = 0.45;
/// The exponential the body decays on. 0.15 s puts the note 26 dB down by
/// the time the buffer ends, which is where the release taper takes over —
/// a plucked bass, not an organ.
const BASS_DECAY_TAU: f64 = 0.15;
/// A raised-cosine fade-in, so a note that starts mid-waveform is not a
/// click. Two milliseconds is under a tenth of a cycle at E1 and inaudible
/// as a delay; the note still starts on the sample the tick lands on.
const BASS_ATTACK_SECS: f64 = 0.002;
/// The saw-ish attack: how fast the bite dies. 12 ms is a finger on a
/// string, not a synth.
const BASS_BITE_SECS: f64 = 0.012;
/// How much of that bite there is.
const BASS_BITE: f64 = 0.35;
/// A touch of second harmonic, which is what stops a bass being a sine.
/// Under 0.5, so it cannot move a zero crossing and the tuning stays
/// measurable — see `the_bass_bank_is_in_tune`.
const BASS_SECOND_HARMONIC: f64 = 0.22;
/// The last fifth of the buffer is taken to true zero with a raised cosine.
/// Rule 6 of `src-tauri/sounds/KITS.md`: land the decay on zero, do not cut
/// it there. A 4 ms cut at 41 Hz is a sixth of a cycle — an amplitude step,
/// and a DC offset an order of magnitude above everything else.
const BASS_RELEASE_FRACTION: f64 = 0.2;
/// Every note is normalised to this. The same ceiling the kit files hold,
/// for the same reason: the files carry timbre, the engine carries balance.
const BASS_PEAK: f32 = 0.9;

/// One note of the bass, synthesised.
///
/// A sine fundamental with a touch of second harmonic and a short saw-ish
/// attack, decaying exponentially. It has to sit *under* drums, not solo, so
/// it is deliberately plain: everything above the second harmonic is gone
/// within 12 ms, and what is left is a fundamental a guitarist can hear the
/// root of while playing over it.
///
/// The saw is a truncated harmonic series rather than a real ramp. A ramp at
/// 41 Hz has partials past Nyquist at every device rate and would alias into
/// an audible buzz; summing `sin(n·φ)/n` up to a partial count chosen from
/// the note's own frequency cannot. It also keeps the tuning measurable:
/// every component is a sine of an integer multiple of φ, so every one of
/// them is zero where the fundamental is, and the buffer's zero crossings
/// sit exactly on the period. The envelopes are positive scalars and cannot
/// move them either.
///
/// Runs once per note when the bank is built — never on the audio thread.
fn bass_note(midi: u8, sr: u32) -> Vec<f32> {
    let sr_f = sr as f64;
    let freq = BASS_TUNING_HZ * 2f64.powf((midi as f64 - 69.0) / 12.0);
    let len = (BASS_NOTE_SECS * sr_f) as usize;
    if len == 0 || freq <= 0.0 {
        return Vec::new();
    }
    let w = 2.0 * std::f64::consts::PI * freq / sr_f;
    // Band-limited by construction: the highest partial sits at 45% of the
    // sample rate at worst, and twelve is as much bite as a bass wants.
    let partials = ((0.45 * sr_f / freq) as usize).clamp(1, 12);
    let attack = (BASS_ATTACK_SECS * sr_f).max(1.0);
    let release_from = (len as f64 * (1.0 - BASS_RELEASE_FRACTION)) as usize;

    let mut out = vec![0.0f32; len];
    for (i, s) in out.iter_mut().enumerate() {
        let t = i as f64 / sr_f;
        let phase = w * i as f64;
        let mut v = phase.sin() + BASS_SECOND_HARMONIC * (2.0 * phase).sin();
        let bite = (-t / BASS_BITE_SECS).exp();
        if bite > 1e-4 {
            let mut saw = 0.0;
            for n in 1..=partials {
                saw += (phase * n as f64).sin() / n as f64;
            }
            v += BASS_BITE * bite * saw;
        }
        let mut env = (-t / BASS_DECAY_TAU).exp();
        if (i as f64) < attack {
            let x = i as f64 / attack;
            env *= 0.5 - 0.5 * (std::f64::consts::PI * x).cos();
        }
        if i >= release_from && len > release_from {
            let x = (i - release_from) as f64 / (len - release_from) as f64;
            env *= 0.5 + 0.5 * (std::f64::consts::PI * x).cos();
        }
        *s = (v * env) as f32;
    }
    let peak = out.iter().fold(0.0f32, |m, s| m.max(s.abs()));
    if peak > 0.0 {
        let g = BASS_PEAK / peak;
        for s in out.iter_mut() {
            *s *= g;
        }
    }
    out
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
    ChimeUp,
    ChimeDown,
    /// The metronome drum kit's closed hat and crash, un-mixed. They are
    /// decoded for the `drum_accent` premix anyway; naming them lets the
    /// small-speaker tests measure a jam kit against a fixed reference that
    /// predates Jam and does not move when a kit is retuned.
    DrumMetal,
    DrumCrash,
    /// Jam: one voice of one kit (`src-tauri/sounds/KITS.md`). Resolved when
    /// the table is compiled, in the `set_jam` command — never on the audio
    /// thread.
    Kit(JamKit, KitVoice),
    /// Jam: one note of the bass, indexed `midi − BASS_MIN_MIDI`. Out of
    /// range reads as silence rather than a panic; `jam.rs` has already
    /// rejected any pitch that could get here.
    Bass(u8),
}

struct SoundBank {
    click_high: Vec<f32>,
    click_low: Vec<f32>,
    wood_high: Vec<f32>,
    wood_low: Vec<f32>,
    beep_high: Vec<f32>,
    beep_low: Vec<f32>,
    drum_low: Vec<f32>,
    drum_accent: Vec<f32>, // pre-mixed kick + metal hat + crash + body
    snare_low: Vec<f32>,
    snare_high: Vec<f32>,
    chime_up: Vec<f32>,
    chime_down: Vec<f32>,
    /// The metronome kit's hat and crash, un-mixed. The premix needs them
    /// decoded regardless; keeping them addressable costs nothing.
    drum_metal: Vec<f32>,
    drum_crash: Vec<f32>,
    /// The jam kits, `[kit][voice]`, laid out like [`KIT_WAVS`].
    kits: [[Vec<f32>; KIT_VOICES]; KIT_COUNT],
    /// The bass, one buffer per semitone from [`BASS_MIN_MIDI`] up.
    bass: Vec<Vec<f32>>,
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

        // The band's own drums. Thirty-two files, decoded at the output
        // rate exactly like everything above; the balance between them is
        // the table's job, not the bank's (`LEVEL_GAIN` in `jam.rs`).
        //
        // This is where the jam's kick used to be synthesised as
        // `drum_high + drum_body`. Four real kicks make that stand-in
        // redundant, and its lesson survives where it belongs: every kit in
        // `KITS.md` carries a mid-band body layer, because a kick with
        // 99.7% of its energy under 120 Hz is inaudible on a laptop however
        // loud the meter says it is. `the_jam_kits_read_on_a_small_speaker`
        // is what holds each of them to it.
        // ...and put each one back on the peak its file carries.
        //
        // THE RESAMPLER IS NOT LEVEL-PRESERVING, AND ON THESE FILES IT IS
        // NOT CLOSE. A windowed sinc rings around a bright transient, and a
        // kit is nothing but bright transients: `tight`'s closed hat lives
        // at 7-15 kHz and peaks at 0.900 in its own 44.1 kHz file, 1.12
        // resampled to 48 kHz. `electronic`'s crash reaches 1.09 at
        // 88.2 kHz. Two things follow, and both are bugs:
        //
        // 1. The same kit is up to 2 dB louder on one device than another,
        //    for no reason the musician can hear or control.
        // 2. `jam.rs` measures a table's worst tick against one reference
        //    bank at `JAM_REFERENCE_SR`, because the output rate is not
        //    knowable in the `set_jam` command. That shortcut is only as
        //    good as the agreement between the rates.
        //
        // Dividing the ringing back out fixes both at once and costs
        // essentially nothing: the overshoot is a sample or two of Gibbs
        // ripple, not loudness, so the energy — which is what KITS.md rule 2
        // says to balance by — barely moves. What it buys is a bank that is
        // the same at every rate, which makes the reference measurement
        // exact rather than approximate.
        let kits: [[Vec<f32>; KIT_VOICES]; KIT_COUNT] = std::array::from_fn(|k| {
            std::array::from_fn(|v| {
                let mut buf = decode_wav(KIT_WAVS[k][v], sr);
                let peak = buf.iter().fold(0.0f32, |m, s| m.max(s.abs()));
                if peak > 0.0 {
                    let g = KIT_FILE_PEAK / peak;
                    for s in buf.iter_mut() {
                        *s *= g;
                    }
                }
                buf
            })
        });

        // And the bass player. Synthesised rather than sampled: 28 notes of
        // recorded bass would be megabytes for a tone whose whole job is to
        // be plain and in tune.
        let bass: Vec<Vec<f32>> = (BASS_MIN_MIDI..=BASS_MAX_MIDI)
            .map(|midi| bass_note(midi, sr))
            .collect();
        debug_assert_eq!(bass.len(), BASS_NOTES, "the bass bank is E1 to G3");

        Self {
            kits,
            bass,
            drum_metal,
            drum_crash,
            click_high: decode_wav(CLICK_HIGH, sr),
            click_low: decode_wav(CLICK_LOW, sr),
            wood_high: decode_wav(WOOD_HIGH, sr),
            wood_low: decode_wav(WOOD_LOW, sr),
            beep_high: decode_wav(BEEP_HIGH, sr),
            beep_low: decode_wav(BEEP_LOW, sr),
            drum_low: decode_wav(DRUM_LOW, sr),
            drum_accent,
            // No premix for this kit: it is synthesised whole, so its accent
            // is already balanced against its beat in the file and there is
            // no summed peak to limit away. That decision was right and was
            // not the reason the first version came out shy — the level was
            // lost inside the files, in a 60 ms plain beat and a snare whose
            // wire tail was cut off at -36 dBFS, not in the mixing.
            snare_low: decode_wav(SNARE_LOW, sr),
            snare_high: decode_wav(SNARE_HIGH, sr),
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
            SoundId::ChimeUp => &self.chime_up,
            SoundId::ChimeDown => &self.chime_down,
            SoundId::DrumMetal => &self.drum_metal,
            SoundId::DrumCrash => &self.drum_crash,
            SoundId::Kit(kit, voice) => &self.kits[kit as usize][voice as usize],
            // A bounds check, not a decision: an out-of-range note is
            // silence on the audio thread rather than a panic in it.
            SoundId::Bass(i) => self.bass.get(i as usize).map_or(&[][..], |v| &v[..]),
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
        }
    }
    fn low_id(self) -> SoundId {
        match self {
            Self::Click => SoundId::ClickLow,
            Self::Wood => SoundId::WoodLow,
            Self::Beep => SoundId::BeepLow,
            Self::Drum => SoundId::DrumLow,
            Self::Snare => SoundId::SnareLow,
        }
    }
}

// ---------------------------------------------------------------------------
// Voice — an active sound playing in the audio callback
// ---------------------------------------------------------------------------

struct Voice {
    sound_id: SoundId,
    position: usize,
    amplitude: f32,
    max_samples: usize, // 0 = no cap (play full buffer)
}

/// Ceiling on simultaneously ringing voices.
///
/// This used to be a `with_capacity(32)` and nothing else, which was fine
/// while the engine spawned exactly one voice per tick. A jam spawns up to
/// seven — five drums, the bass and the crash on the one — and the kick, the
/// snare and the crash all ring out uncapped, so a busy 16th-note groove can
/// legitimately have a couple of dozen alive at once. With the longest kit
/// in the set (`brushes`, a 700 ms crash) the measured worst is 24.
///
/// A headroom figure, not a budget: the `Vec` is allocated once when the
/// audio thread starts, and the jam's spawn — the only one that pushes more
/// than a single voice — is guarded, so even a table nobody could write
/// drops a drum rather than reallocating on the audio thread. The click's
/// own push is left exactly as it was: it adds one voice per tick and the
/// most it can keep alive is under a dozen, so a guard there could only ever
/// be a way to silence a click.
///
/// `the_busiest_plausible_jam_fits_inside_the_preallocated_voices` measures
/// the real number against this one.
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
pub(crate) struct JamHandoff {
    table: Mutex<Option<Arc<JamTable>>>,
    generation: AtomicU64,
}

impl JamHandoff {
    fn new() -> Self {
        Self {
            table: Mutex::new(None),
            generation: AtomicU64::new(0),
        }
    }

    /// Hand the engine a table, or `None` to take the band away and leave
    /// the plain click. Called from `set_jam`, never from the audio thread.
    pub(crate) fn set(&self, table: Option<Arc<JamTable>>) {
        if let Ok(mut slot) = self.table.lock() {
            *slot = table;
        }
        // Bumped after the write, so a callback that sees the new generation
        // is guaranteed to find the new table behind the lock.
        self.generation.fetch_add(1, Ordering::Release);
    }
}

/// Shared handle to the engine's jam slot. Cloned into the audio thread and
/// into the Tauri command that fills it.
pub(crate) type SharedJam = Arc<JamHandoff>;

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
///   `counting_in` is false there.
/// * **The speed ramp.** A drill ramps the *click*; while `ramp_active` the
///   table is ignored on purpose. Playing a groove through a tempo ramp is
///   Jam 2, and doing it by accident today would mean a drill whose bar
///   length and the table's disagree every few steps.
/// * **A bar the table was not written for.** The UI sets subdivision and
///   beat groups BEFORE calling `set_jam` (`plans/tasks/jam/BRIEF.md`); when
///   it has not, the engine plays the click rather than guessing which
///   column of the table is which beat.
#[allow(clippy::too_many_arguments)]
fn jam_play(
    table: Option<&JamTable>,
    counting_in: bool,
    ramp_active: bool,
    beats_per_measure: u32,
    subdivision: u32,
    measure_beat: u32,
    sub_count: u32,
    jam_bar: u32,
) -> JamPlay<'_> {
    let table = match table {
        Some(t) if !counting_in && !ramp_active => t,
        _ => return JamPlay::Click,
    };
    if table.ticks_per_bar() != beats_per_measure.saturating_mul(subdivision) {
        return JamPlay::Mismatch;
    }
    match table.tick(measure_beat * subdivision + sub_count, jam_bar) {
        Some(t) => JamPlay::Band(t),
        // Unreachable given the width check above; a bar the engine cannot
        // index is a click, never a panic on the audio thread.
        None => JamPlay::Mismatch,
    }
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
    /// Set on the buffer that picked up a new table (or dropped one), so the
    /// tick loop can put the form back to bar 0 / chorus 1.
    jam_changed: bool,
}

/// Should this tick be played as an accent (the "high" sound)?
///
/// Pure so it can be unit-tested without an audio device.
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
fn accent_for(
    mode: AccentMode,
    ramp_active: bool,
    ramp_beats_per_bar: u8,
    accent_mask: u32,
    is_downbeat: bool,
    beat_count: u32,
    measure_beat: u32,
) -> bool {
    // The mode comes first, because it is the user saying what they want to
    // hear and everything below is a rule about where accents fall by default.
    match mode {
        AccentMode::None => return false,
        // Every beat, whatever the meter, the grouping, or a running ramp.
        AccentMode::All => return is_downbeat,
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
        return is_downbeat && (beat_count % bpb) == 0;
    }
    is_downbeat && mask_has_accent(accent_mask, measure_beat)
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
fn accent_mask(groups: &[u8]) -> u32 {
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
    /// Whether this tick is accented (opens a group, or is the first
    /// beat of the ramp's bar). Mirrored to `BeatEvent` so the UI never
    /// has to re-derive accent positions from `beat_groups`.
    is_accent: bool,
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
    /// True when the engine accented this tick. The UI reads this
    /// instead of re-deriving group starts from `beatGroups`.
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
                devices.push(AudioOutputDevice {
                    is_default: name == default_name,
                    is_bluetooth,
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
            adaptive_score: Arc::new(AtomicU32::new(0)),
            callback_probe: None,
            tempo_ctx: None,
            jam: Arc::new(JamHandoff::new()),
            #[cfg(test)]
            force_setup_failure: false,
        }
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
        let alive = self.alive.clone();
        let playing = self.playing.clone();
        let beat_log = self.beat_log.clone();
        let device_name = self.device_name.clone();
        let adaptive_score = self.adaptive_score.clone();
        let callback_probe = self.callback_probe.clone();
        let jam_shared = self.jam.clone();
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
            let channels = supported.channels() as usize;
            let config: cpal::StreamConfig = supported.into();

            // Pre-decode all sounds at the output sample rate
            let sounds = SoundBank::new(sample_rate);

            // Callback -> event thread channel
            let (tx, rx) = mpsc::channel::<BeatNotification>();

            // Event thread -> callback: pending chime sound
            let pending_chime: Arc<Mutex<Option<SoundId>>> = Arc::new(Mutex::new(None));
            let pending_chime_cb = pending_chime.clone();

            let playing_cb = playing.clone();
            let state_cb = state.clone();
            let sr = sample_rate;

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
            let mut sample_counter: u64 = 0;
            let mut next_beat_sample: u64 = 0;
            let mut beat_count: u32 = 0;
            let mut sub_count: u32 = 0;
            let mut measure_beat: u32 = 0;
            // Where the band is in the form. 0-based bar, 1-based chorus —
            // "bar 3 of 12, chorus 2" is what the transport reads out.
            let mut jam_bar: u32 = 0;
            let mut jam_chorus: u32 = 1;
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
                ramp_active: false,
                ramp_beats_per_bar: 4,
                ramp_warming_up: false,
                warmup_count: 0,
                warmup_beats: 4,
                jam: None,
                jam_generation: 0,
                jam_changed: false,
                jam_pending: None,
            };

            // ---- Build output stream ----
            let stream = device.build_output_stream(
                &config,
                move |data: &mut [f32], _info: &cpal::OutputCallbackInfo| {
                    let frames = data.len() / channels;

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

                    // Output latency compensation.
                    // CoreAudio device/safety/stream latency + one buffer of
                    // buffering (the buffer we're currently writing into hasn't
                    // reached the DAC yet).
                    let buffer_us = (frames as u64 * 1_000_000) / sr as u64;
                    let output_latency_us = buffer_us + device_latency_us_cb;

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
                            cached.beat_groups.clear();
                            cached.beat_groups.extend_from_slice(&s.beat_groups);
                            cached.accent_mask = accent_mask(&cached.beat_groups);
                            cached.beat_groups_total =
                                cached.beat_groups.iter().map(|&g| g as u32).sum();
                            cached.beat_groups_changed = true;
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
                            cached.jam_generation = gen;
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
                                cached.jam = incoming;
                                cached.jam_pending = None;
                                cached.jam_changed = true;
                            }
                        }
                    }

                    // ---- Not playing: silence ----
                    if !is_playing {
                        // A bass that was waiting for a bar line that never
                        // came is the right one to start from next time.
                        if let Some(p) = cached.jam_pending.take() {
                            cached.jam = Some(p);
                            cached.jam_changed = true;
                        }
                        for s in data.iter_mut() {
                            *s = 0.0;
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
                        jam_bar = 0;
                        jam_chorus = 1;
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
                        // Press play and the band starts at the top of the
                        // form, whatever it was doing last time.
                        jam_bar = 0;
                        jam_chorus = 1;
                        jam_mismatch_reported = false;
                        voices.clear();
                    }

                    // A jam arriving (or being taken away) puts the form back
                    // to the top: bar 1 of chorus 1 is where a band starts.
                    if cached.jam_changed {
                        cached.jam_changed = false;
                        jam_bar = 0;
                        jam_chorus = 1;
                        jam_mismatch_reported = false;
                    }

                    // Audio-safety probe: commit this buffer's entry time,
                    // now that `sample_counter` is the live audio clock.
                    let probe_slot = match probe_cb {
                        Some(ref p) => p.record(probe_entry_ns, frames as u32, sample_counter),
                        None => None,
                    };

                    // ---- Check for pending chime from event thread ----
                    if let Ok(mut chime) = pending_chime_cb.try_lock() {
                        if let Some(chime_id) = chime.take() {
                            voices.push(Voice {
                                sound_id: chime_id,
                                position: 0,
                                amplitude: 0.4 * cached.volume,
                                max_samples: 0,
                            });
                        }
                    }

                    // ---- Timing ----
                    let subdivision = cached.subdivision as u32;
                    let beat_duration_secs = 60.0 / cached.bpm as f64;
                    let tick_duration_secs = beat_duration_secs / subdivision as f64;
                    let tick_samples = (tick_duration_secs * sr as f64) as u64;
                    let cap_samples = (tick_samples as f64 * 0.9) as usize;

                    // ---- Per-frame processing ----
                    for frame_idx in 0..frames {
                        // Beat boundary
                        if sample_counter >= next_beat_sample {
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
                                jam_bar = 0;
                                jam_chorus = 1;
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
                                // ...and bar 1 of chorus 1 of the form. The
                                // count-in beeps over the top of nothing; the
                                // band comes in on this tick.
                                jam_bar = 0;
                                jam_chorus = 1;
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
                            // "click is sacred" rule.
                            let use_accent = accent_for(
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
                            let band_state = match cached.jam {
                                Some(ref t) => t.band_state(jam_bar),
                                None => JamBandState::Full,
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
                                        if band_state == JamBandState::HatsOnly
                                            && slot.lane != JamLane::Hat
                                        {
                                            continue;
                                        }
                                        if voices.len() >= MAX_VOICES {
                                            break;
                                        }
                                        accent_heard |= slot.accent;
                                        voices.push(Voice {
                                            sound_id: slot.sound,
                                            position: 0,
                                            amplitude: slot.gain * cached.volume,
                                            max_samples: if slot.cap_ticks > 0.0 {
                                                (tick_samples as f32 * slot.cap_ticks) as usize
                                            } else {
                                                0
                                            },
                                        });
                                    }
                                }
                                // The crash that says "top of the form". Bar
                                // 0 of a chorus is always `Full` — a
                                // drop-out never opens on it and a trade
                                // always starts with the band — but the
                                // state is checked rather than assumed.
                                if measure_beat == 0
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
                                        voices.push(Voice {
                                            sound_id: slot.sound,
                                            position: 0,
                                            amplitude: slot.gain * cached.volume,
                                            max_samples: 0,
                                        });
                                    }
                                }
                                jam_accent = accent_heard;
                            } else if use_accent && !cached.ramp_warming_up {
                                // Accent: full ring-out, no duration cap
                                voices.push(Voice {
                                    sound_id: cached.kit.high_id(),
                                    position: 0,
                                    amplitude: cached.volume,
                                    max_samples: 0,
                                });
                            } else {
                                // Regular / warmup / subdivision
                                let (sid, amp) = if cached.ramp_warming_up && !is_last_warmup {
                                    (SoundId::BeepHigh, 0.6)
                                } else if is_downbeat {
                                    (cached.kit.low_id(), BEAT_GAIN)
                                } else {
                                    (cached.kit.low_id(), SUB_GAIN)
                                };
                                voices.push(Voice {
                                    sound_id: sid,
                                    position: 0,
                                    amplitude: amp * cached.volume,
                                    max_samples: cap_samples,
                                });
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
                            let notif_accent = match jam_tick {
                                Some(_) => jam_accent,
                                None => use_accent,
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
                                // The bar line: the held table becomes the
                                // one the next tick reads. Same form, same
                                // drums — only the bass bar moved.
                                if let Some(p) = cached.jam_pending.take() {
                                    cached.jam = Some(p);
                                }
                                if let Some(ref t) = cached.jam {
                                    let (b, c) = advance_form(jam_bar, jam_chorus, t.form_bars());
                                    jam_bar = b;
                                    jam_chorus = c;
                                }
                            }

                            let _ = tx.send(BeatNotification {
                                session,
                                beat: notif_beat,
                                measure_beat: notif_measure_beat,
                                subdivision: notif_sub,
                                subdivision_total: subdivision.clamp(1, 255) as u8,
                                is_downbeat,
                                is_accent: notif_accent,
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
                            });

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

                        // Mix all active voices
                        let mut mix = 0.0f32;
                        for voice in voices.iter_mut() {
                            let buf = sounds.get(voice.sound_id);
                            let limit = if voice.max_samples > 0 {
                                voice.max_samples.min(buf.len())
                            } else {
                                buf.len()
                            };
                            if voice.position < limit {
                                mix += buf[voice.position] * voice.amplitude;
                            }
                            voice.position += 1;
                        }

                        // Write to all output channels (mono -> duplicated)
                        let clamped = mix.clamp(-1.0, 1.0);
                        for ch in 0..channels {
                            data[frame_idx * channels + ch] = clamped;
                        }

                        sample_counter += 1;
                    }

                    // Remove finished voices (once per buffer)
                    voices.retain(|v| {
                        let buf = sounds.get(v.sound_id);
                        let limit = if v.max_samples > 0 {
                            v.max_samples.min(buf.len())
                        } else {
                            buf.len()
                        };
                        v.position < limit
                    });
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

            // ROADMAP §0.5 — promote the event loop (not the cpal callback,
            // which the backend already runs at TIME_CRITICAL). Failure is
            // non-fatal: the loop just runs at normal priority.
            let _rt_handle = match audio_thread_priority::promote_current_thread_to_real_time(
                0,
                sample_rate,
            ) {
                Ok(h) => Some(h),
                Err(e) => {
                    eprintln!("[yames] event loop stayed at normal priority: {e}");
                    None
                }
            };

            // ---- Event loop (also keeps the cpal Stream alive) ----
            let mut pending_ramp_advance = false;
            let mut current_session: u64 = 0;

            while alive.load(Ordering::SeqCst) {
                let notif = match rx.recv_timeout(Duration::from_millis(50)) {
                    Ok(n) => n,
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        // Drain stale notifications when not playing
                        if !playing.load(Ordering::Relaxed) {
                            while rx.try_recv().is_ok() {}
                        }
                        continue;
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
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
                        is_accent: notif.is_accent,
                        form_bar: notif.jam_bar,
                        chorus: notif.jam_chorus,
                        band_state: notif.jam_band_state,
                    },
                );

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
        if let Some(handle) = self.thread_handle.take() {
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
                assert!(
                    !accent_for(
                        AccentMode::None,
                        ramp,
                        4,
                        accent_mask(&[3, 2, 2]),
                        true,
                        beat,
                        beat
                    ),
                    "ramp={ramp} beat={beat}"
                );
            }
        }
    }

    /// "all" accents every beat of the bar, whatever the grouping says.
    #[test]
    fn accent_all_means_every_beat() {
        let mask = accent_mask(&[3, 2, 2]);
        for beat in 0..7u32 {
            assert!(
                accent_for(AccentMode::All, false, 4, mask, true, beat, beat),
                "beat {beat}"
            );
        }
        // Still only on the beat itself — a subdivision tick is not a beat.
        assert!(!accent_for(AccentMode::All, false, 4, mask, false, 0, 0));
    }

    /// "all" reaches the case that overrides the grouping, because a player
    /// who asked for every beat means every beat.
    #[test]
    fn accent_all_overrides_the_ramp() {
        assert!(accent_for(AccentMode::All, true, 4, 0, true, 3, 3), "mid-ramp");
    }

    /// The default is unchanged: group openings only.
    #[test]
    fn accent_groups_is_what_it_always_was() {
        let mask = accent_mask(&[3, 2, 2]);
        for beat in 0..7u32 {
            let expected = matches!(beat, 0 | 3 | 5);
            assert_eq!(
                accent_for(AccentMode::Groups, false, 4, mask, true, beat, beat),
                expected,
                "beat {beat} of 3+2+2"
            );
        }
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
    /// drum +3.67, wood +3.74, click +4.24, snare +4.24, beep +4.58 — so a
    /// 2 dB floor has real room on both sides rather than being fitted to
    /// today's mix.
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
        for (name, kit) in [
            ("click", SoundKit::Click),
            ("wood", SoundKit::Wood),
            ("beep", SoundKit::Beep),
            ("drum", SoundKit::Drum),
            ("snare", SoundKit::Snare),
        ] {
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
        // A jam's backbeat is `snare_hi` at `LEVEL_GAIN[2]` and its plain
        // hit is `snare_lo` at `LEVEL_GAIN[1]`, so the gains go in the same
        // way `BEAT_GAIN` does above. `KITS.md` measures the files
        // themselves at +3.13 to +4.84 dB, and the 0.8 hit gain widens each
        // of those by about 1.9 — but the number that matters is the one
        // the musician hears, which is this one.
        //
        // `snare_lo` is deliberately NOT a quieter file: it is the same drum
        // struck softly, at the same 0.900 peak, and the level gain does the
        // rest (rule 4 of KITS.md). A kit that passed this by shipping a
        // quiet file would be the snare kit's mistake all over again.
        for kit in JamKit::ALL {
            let accent = laptop_band_energy(bank.get(SoundId::Kit(kit, KitVoice::SnareHi)), sr)
                * (crate::jam::LEVEL_GAIN[2] * crate::jam::LEVEL_GAIN[2]) as f64;
            let beat = laptop_band_energy(bank.get(SoundId::Kit(kit, KitVoice::SnareLo)), sr)
                * (crate::jam::LEVEL_GAIN[1] * crate::jam::LEVEL_GAIN[1]) as f64;
            let db = 10.0 * (accent / beat.max(1e-30)).log10();
            assert!(
                db > 2.0,
                "{}: the backbeat is only {db:.2} dB over a plain hit through a \
                 200 Hz-4 kHz band-pass, which does not read as an accent on a laptop",
                kit.name()
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
        // And the kits that do exist must keep resolving to themselves.
        assert!(SoundKit::from_str("drum") == SoundKit::Drum);
        assert!(SoundKit::from_str("snare") == SoundKit::Snare);
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
        let named: [(&str, &Vec<f32>); 9] = [
            ("click_high", &bank.click_high),
            ("click_low", &bank.click_low),
            ("wood_high", &bank.wood_high),
            ("wood_low", &bank.wood_low),
            ("beep_high", &bank.beep_high),
            ("beep_low", &bank.beep_low),
            ("drum_low", &bank.drum_low),
            ("snare_low", &bank.snare_low),
            ("snare_high", &bank.snare_high),
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
        for n in [1u8, 4, 7, 16] {
            let mask = accent_mask(&[n]);
            for beat in 0..u32::from(n) {
                for is_downbeat in [true, false] {
                    let expected = is_downbeat && beat == 0;
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
        for beat in 0..16u32 {
            let expected = beat % 4 == 0;
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
            let expected = matches!(pos, 0 | 3 | 5);
            assert_eq!(
                accent_for(AccentMode::Groups, false, 4, accent_mask(&groups), true, pos, pos),
                expected,
                "grouped accent wrong at bar position {pos}"
            );
        }
    }

    #[test]
    fn accent_never_fires_off_the_quarter_note_grid() {
        // `is_downbeat == false` means a subdivision tick — never an accent.
        assert!(!accent_for(AccentMode::Groups, false, 4, accent_mask(&[4]), false, 0, 0));
        assert!(!accent_for(AccentMode::Groups, true, 4, accent_mask(&[4]), false, 0, 0));
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
        band_state_for_bar, compile as compile_jam, JamBassLine, JamConfig, JamDropOut, JamPattern,
        JamPracticeConfig, JamTable, JamTrade,
    };

    /// A 4/4 rock bar at SIXTEENTHS: kick on 1 and 3, snare on 2 and 4, hat
    /// on every eighth. Sixteen ticks, so tick 0 is the one and tick 4 is
    /// the backbeat — the shape `plans/tasks/jam/BRIEF.md` names.
    fn rock_16ths() -> JamConfig {
        JamConfig {
            ticks_per_beat: 4,
            beats_per_bar: 4,
            bar: JamPattern {
                kick: vec![1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
                snare: vec![0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0],
                hat: vec![1, 0, 3, 0, 1, 0, 3, 0, 1, 0, 3, 0, 1, 0, 3, 0],
                ride: vec![0; 16],
                crash: vec![0; 16],
            },
            fill: None,
            form_bars: 4,
            crash_on_one: false,
            intensity: 1.0,
            kit: "room".to_string(),
            bass: None,
            practice: None,
        }
    }

    struct JamRender {
        samples: Vec<f32>,
        /// The peak BEFORE the mixer's clamp, which is the only way to see
        /// whether a table would have clipped.
        peak: f32,
        max_voices: usize,
    }

    /// A miniature of the callback's mixer: spawn a table's voices tick by
    /// tick, let them ring across ticks, sum them.
    ///
    /// Deliberately a copy of the callback's arithmetic rather than a shared
    /// helper. A change in the callback that this does not follow shows up
    /// as a failing assertion instead of as a test that quietly moved with
    /// the bug.
    fn render_jam(
        table: &JamTable,
        bank: &SoundBank,
        bars: u32,
        tick_samples: usize,
        volume: f32,
    ) -> JamRender {
        let total = bars as usize * table.ticks_per_bar() as usize * tick_samples;
        let mut out = vec![0.0f32; total];
        let mut voices: Vec<Voice> = Vec::new();
        let mut max_voices = 0usize;
        let mut jam_bar = 0u32;
        let mut pos = 0usize;
        for _ in 0..bars {
            for t in 0..table.ticks_per_bar() {
                if let Some(tick) = table.tick(t, jam_bar) {
                    for slot in tick.slots() {
                        voices.push(Voice {
                            sound_id: slot.sound,
                            position: 0,
                            amplitude: slot.gain * volume,
                            max_samples: if slot.cap_ticks > 0.0 {
                                (tick_samples as f32 * slot.cap_ticks) as usize
                            } else {
                                0
                            },
                        });
                    }
                    if t == 0 && jam_bar == 0 {
                        if let Some(slot) = table.crash_on_one() {
                            voices.push(Voice {
                                sound_id: slot.sound,
                                position: 0,
                                amplitude: slot.gain * volume,
                                max_samples: 0,
                            });
                        }
                    }
                }
                max_voices = max_voices.max(voices.len());
                for _ in 0..tick_samples {
                    let mut mix = 0.0f32;
                    for v in voices.iter_mut() {
                        let buf = bank.get(v.sound_id);
                        let limit = if v.max_samples > 0 {
                            v.max_samples.min(buf.len())
                        } else {
                            buf.len()
                        };
                        if v.position < limit {
                            mix += buf[v.position] * v.amplitude;
                        }
                        v.position += 1;
                    }
                    out[pos] = mix;
                    pos += 1;
                }
                voices.retain(|v| {
                    let buf = bank.get(v.sound_id);
                    let limit = if v.max_samples > 0 {
                        v.max_samples.min(buf.len())
                    } else {
                        buf.len()
                    };
                    v.position < limit
                });
            }
            let (b, _) = advance_form(jam_bar, 1, table.form_bars());
            jam_bar = b;
        }
        let peak = out.iter().fold(0.0f32, |m, s| m.max(s.abs()));
        JamRender {
            samples: out,
            peak,
            max_voices,
        }
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
        let kick_low = low_band_share(bank.get(SoundId::Kit(JamKit::Room, KitVoice::Kick)), sr);
        let snare_low =
            low_band_share(bank.get(SoundId::Kit(JamKit::Room, KitVoice::SnareHi)), sr);
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
            jam_play(Some(&table), false, false, 4, 4, 0, 0, 0),
            JamPlay::Band(_)
        ));

        // Same bar, eighth notes: 8 ticks, not 16.
        assert_eq!(
            jam_play(Some(&table), false, false, 4, 2, 0, 0, 0),
            JamPlay::Mismatch
        );
        // Same resolution, a 3/4 bar: 12 ticks, not 16.
        assert_eq!(
            jam_play(Some(&table), false, false, 3, 4, 0, 0, 0),
            JamPlay::Mismatch
        );
        // And a meter wide enough to overflow the product.
        assert_eq!(
            jam_play(Some(&table), false, false, u32::MAX, 4, 0, 0, 0),
            JamPlay::Mismatch
        );
    }

    /// The count-in and the speed ramp each own the click while they run.
    #[test]
    fn the_count_in_and_the_ramp_keep_the_click() {
        let table = compile_jam(&rock_16ths()).unwrap();
        assert_eq!(
            jam_play(Some(&table), true, false, 4, 4, 0, 0, 0),
            JamPlay::Click,
            "the count-in beeps; the band waits"
        );
        assert_eq!(
            jam_play(Some(&table), false, true, 4, 4, 0, 0, 0),
            JamPlay::Click,
            "a drill ramps the click. Combining the two is Jam 2"
        );
        assert_eq!(
            jam_play(None, false, false, 4, 4, 0, 0, 0),
            JamPlay::Click,
            "no jam, no band"
        );
    }

    /// Every tick of the bar reaches the column it should.
    #[test]
    fn every_tick_of_the_bar_maps_to_a_column_of_the_table() {
        let table = compile_jam(&rock_16ths()).unwrap();
        for beat in 0..4u32 {
            for sub in 0..4u32 {
                match jam_play(Some(&table), false, false, 4, 4, beat, sub, 0) {
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
                    ride: vec![2; 16],
                    crash: vec![2; 16],
                }
            } else {
                // Busy, and something a person might actually play: the
                // jitter probe's groove.
                JamPattern {
                    kick: vec![2, 0, 0, 1, 1, 0, 1, 0, 2, 0, 0, 1, 1, 0, 1, 0],
                    snare: vec![0, 0, 3, 0, 2, 0, 0, 3, 0, 3, 0, 0, 2, 0, 3, 1],
                    hat: vec![1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3],
                    ride: vec![1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
                    crash: vec![0; 16],
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
            }),
            practice: None,
        }
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
        for kit in JamKit::ALL {
            for (lawnmower, volume) in [(false, 1.0f32), (true, SHIPPED_VOLUME)] {
                let table = compile_jam(&busy_band(kit, lawnmower)).unwrap();
                let check = |bank: &SoundBank, bpm: u32, sr: u32| {
                    let tick_samples = (sr as f64 * 60.0 / bpm as f64 / 4.0) as usize;
                    let r = render_jam(&table, bank, 2, tick_samples, volume);
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
                kick: vec![1; 16],
                snare: vec![2; 16],
                hat: vec![1; 16],
                ride: vec![1; 16],
                crash: vec![0; 16],
            },
            fill: None,
            form_bars: 4,
            crash_on_one: true,
            intensity: 1.25,
            kit: "room".to_string(),
            bass: None,
            practice: None,
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
    /// — in all four kits, and in whatever a fifth one arrives with.
    ///
    /// The floor is −12 dB against the kit's own hat, not 0: a kick is
    /// allowed to be felt more than heard, but not to vanish. `brushes` is
    /// the widest at +5.06 dB in `KITS.md` and `electronic` the narrowest at
    /// +2.55, both measured file to file with no engine gain — so a floor
    /// down at −12 has real room and is not fitted to today's kits.
    #[test]
    fn the_jam_kits_read_on_a_small_speaker() {
        let sr = 48000;
        let bank = SoundBank::new(sr);
        for kit in JamKit::ALL {
            for voice in KitVoice::ALL {
                let buf = bank.get(SoundId::Kit(kit, voice));
                assert!(
                    !buf.is_empty(),
                    "{}'s {} decoded to nothing",
                    kit.name(),
                    voice.file_name()
                );
                let peak = buf.iter().fold(0.0f32, |m, s| m.max(s.abs()));
                assert!(
                    (peak - KIT_FILE_PEAK).abs() < 1e-4,
                    "{}'s {} peaks at {peak}; KITS.md says every file is 0.900 and \
                     the bank puts every one of them back on it",
                    kit.name(),
                    voice.file_name()
                );
            }

            // The kick against this kit's own hat, through a laptop.
            let k = laptop_band_energy(bank.get(SoundId::Kit(kit, KitVoice::Kick)), sr);
            let hat = laptop_band_energy(bank.get(SoundId::Kit(kit, KitVoice::Hat)), sr);
            let db = 10.0 * (k / hat.max(1e-30)).log10();
            assert!(
                db > -12.0,
                "{}'s kick is {db:.2} dB against its own hat through a 200 Hz-4 kHz \
                 band-pass, which is a thump nobody will feel",
                kit.name()
            );
        }
    }

    /// The column order of `KIT_WAVS` and the order of `KitVoice` are the
    /// same list written twice, and the bank indexes one with the other. A
    /// swap would be silent — a kick where a crash should be, every table,
    /// every kit — so the file names are read back off disk and checked.
    #[test]
    fn the_kit_table_is_laid_out_the_way_the_voices_are_named() {
        for (k, kit) in JamKit::ALL.iter().enumerate() {
            for (v, voice) in KitVoice::ALL.iter().enumerate() {
                let path = format!("sounds/kit_{}_{}.wav", kit.name(), voice.file_name());
                let bytes = std::fs::read(&path).unwrap_or_else(|e| panic!("read {path}: {e}"));
                assert_eq!(
                    bytes.len(),
                    KIT_WAVS[k][v].len(),
                    "KIT_WAVS[{k}][{v}] is not {path}"
                );
                assert!(bytes == KIT_WAVS[k][v], "KIT_WAVS[{k}][{v}] is not {path}");
            }
        }
    }

    /// THE NUMBER `JAM_TICK_CEILING` IS BUILT ON.
    ///
    /// `jam.rs` measures a table against a 48 kHz reference bank, because
    /// the output device's rate is not knowable when a jam is compiled in
    /// the `set_jam` command. The device can run at any rate, and the
    /// resampler's sinc overshoots a bright transient: the closed hat peaks
    /// at 0.554 in its own 44.1 kHz file, 0.690 resampled to 48 kHz and
    /// 0.736 resampled to 88.2 kHz.
    ///
    /// So a table normalised against the reference can be up to that much
    /// louder on the user's device, and `JAM_TICK_CEILING` is 0.90 rather
    /// than 0.97 to swallow it. This test is what says 7% is still the
    /// figure — if a resampler change makes it 20%, the ceiling has to move
    /// and the failure says so.
    #[test]
    fn the_jam_reference_bank_matches_the_real_one() {
        /// The margin `JAM_TICK_CEILING` reserves. 0.90 × 1.077 = 0.97.
        const ALLOWED_OVERSHOOT: f32 = 1.077;
        // Every sound a jam table can name: all four kits, every voice, and
        // every note of the bass. The bass is synthesised per rate rather
        // than resampled, so it has no imaging to overshoot — which is
        // exactly why it is in the list: if that ever stops being true the
        // ceiling has to know.
        let mut ids: Vec<(String, SoundId)> = Vec::new();
        for kit in JamKit::ALL {
            for voice in KitVoice::ALL {
                ids.push((
                    format!("{} {}", kit.name(), voice.file_name()),
                    SoundId::Kit(kit, voice),
                ));
            }
        }
        for i in 0..BASS_NOTES {
            ids.push((
                format!("bass MIDI {}", BASS_MIN_MIDI as usize + i),
                SoundId::Bass(i as u8),
            ));
        }

        for sr in [22050u32, 44100, 48000, 88200, 96000] {
            let bank = SoundBank::new(sr);
            for (name, id) in &ids {
                let here = bank.get(*id).iter().fold(0.0f32, |m, s| m.max(s.abs()));
                let reference = jam_reference_sample(*id)
                    .iter()
                    .fold(0.0f32, |m, s| m.max(s.abs()));
                assert!(reference > 0.0, "{name} is silent in the reference bank");
                assert!(
                    here <= reference * ALLOWED_OVERSHOOT,
                    "{name} peaks at {here:.4} at {sr} Hz against {reference:.4} in \
                     the 48 kHz reference — {:.1}% over, and JAM_TICK_CEILING only \
                     leaves {:.1}%",
                    (here / reference - 1.0) * 100.0,
                    (ALLOWED_OVERSHOOT - 1.0) * 100.0
                );
            }
        }
    }

    // -----------------------------------------------------------------
    // The bass
    // -----------------------------------------------------------------

    /// The fundamental of a buffer, in Hz, from its positive-going zero
    /// crossings.
    ///
    /// Zero crossings and not autocorrelation, because for this waveform
    /// they are EXACT rather than merely good: every component of a bass
    /// note is `sin(n·φ)` for an integer `n`, so every one of them is zero
    /// wherever the fundamental is, and the envelopes are positive scalars
    /// that cannot move a zero. Linear interpolation between the samples
    /// either side of a crossing then puts the period well inside a
    /// hundredth of a sample, and the estimate is taken over the whole
    /// window rather than one period.
    ///
    /// The window skips the first 40 ms, where the saw-ish attack is still
    /// audible and its partials could add crossings of their own, and stops
    /// at 300 ms, before the amplitude gets small enough for `f32`
    /// quantisation to invent one.
    fn fundamental_hz(buf: &[f32], sr: u32) -> f64 {
        let from = (0.040 * sr as f64) as usize;
        let to = ((0.300 * sr as f64) as usize).min(buf.len());
        let mut first = f64::NAN;
        let mut last = f64::NAN;
        let mut count = 0usize;
        for i in from + 1..to {
            let (a, b) = (buf[i - 1] as f64, buf[i] as f64);
            if a <= 0.0 && b > 0.0 {
                // Where the line between the two samples crosses zero.
                let t = (i - 1) as f64 + (-a) / (b - a);
                if count == 0 {
                    first = t;
                }
                last = t;
                count += 1;
            }
        }
        assert!(count >= 3, "only {count} zero crossings in the window");
        let period = (last - first) / (count - 1) as f64;
        sr as f64 / period
    }

    /// THE BASS HAS TO BE IN TUNE, OR IT IS WORSE THAN NO BASS.
    ///
    /// A guitarist plays over this. A bass a few cents off is the kind of
    /// wrong that makes people re-tune their own instrument until they give
    /// up. One cent is a twelve-hundredth of an octave — inaudible, and two
    /// orders of magnitude tighter than anything a synthesis mistake would
    /// produce, so this catches an octave slip, an A-435 tuning or an
    /// off-by-one in the note index and stays quiet otherwise.
    #[test]
    fn the_bass_bank_is_in_tune() {
        for sr in [44100u32, 48000] {
            let bank = SoundBank::new(sr);
            for i in 0..BASS_NOTES {
                let midi = BASS_MIN_MIDI + i as u8;
                let buf = bank.get(SoundId::Bass(i as u8));
                assert!(!buf.is_empty(), "MIDI {midi} is silent");

                let want = 440.0 * 2f64.powf((midi as f64 - 69.0) / 12.0);
                let got = fundamental_hz(buf, sr);
                let cents = 1200.0 * (got / want).log2();
                assert!(
                    cents.abs() < 1.0,
                    "MIDI {midi} at {sr} Hz came out {got:.4} Hz against {want:.4} — \
                     {cents:.3} cents off"
                );
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
        for sr in [22050u32, 44100, 48000, 88200, 96000] {
            let bank = SoundBank::new(sr);
            for i in 0..BASS_NOTES {
                let buf = bank.get(SoundId::Bass(i as u8));
                let peak = buf.iter().fold(0.0f32, |m, s| m.max(s.abs()));
                assert!(
                    peak <= 0.9 + 1e-4,
                    "MIDI {} peaks at {peak} at {sr} Hz",
                    BASS_MIN_MIDI + i as u8
                );
                assert!(
                    peak > 0.85,
                    "MIDI {} peaks at {peak}, which is not the bank's level",
                    BASS_MIN_MIDI + i as u8
                );
                // Lands on zero rather than being cut there — rule 6 of
                // KITS.md, and the kicks are why: a step at 41 Hz is a fifth
                // of a cycle and shows up as DC.
                let tail = buf[buf.len() - 1].abs();
                assert!(tail < 1e-5, "MIDI {} ends at {tail}", BASS_MIN_MIDI + i as u8);
            }
            // Out of range is silence, not a panic on the audio thread.
            assert!(bank.get(SoundId::Bass(BASS_NOTES as u8)).is_empty());
            assert!(bank.get(SoundId::Bass(255)).is_empty());
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
        let bass_low = low_band_share(bank.get(SoundId::Bass(40 - BASS_MIN_MIDI)), sr);
        let snare_low =
            low_band_share(bank.get(SoundId::Kit(JamKit::Room, KitVoice::SnareHi)), sr);
        assert!(
            bass_low > snare_low * 2.0,
            "the bass has {bass_low:.2} of its energy under 150 Hz and the snare \
             {snare_low:.2}; that is not a bass sitting under a drum kit"
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
                        if state == JamBandState::HatsOnly && slot.lane != JamLane::Hat {
                            continue;
                        }
                        voices.push(Voice {
                            sound_id: slot.sound,
                            position: 0,
                            amplitude: slot.gain,
                            max_samples: if slot.cap_ticks > 0.0 {
                                (tick_samples as f32 * slot.cap_ticks) as usize
                            } else {
                                0
                            },
                        });
                    }
                    if t == 0 && jam_bar == 0 && state == JamBandState::Full {
                        if let Some(slot) = table.crash_on_one() {
                            voices.push(Voice {
                                sound_id: slot.sound,
                                position: 0,
                                amplitude: slot.gain,
                                max_samples: 0,
                            });
                        }
                    }
                }
            }
            for _ in 0..tick_samples {
                let mut mix = 0.0f32;
                for v in voices.iter_mut() {
                    let buf = bank.get(v.sound_id);
                    let limit = if v.max_samples > 0 {
                        v.max_samples.min(buf.len())
                    } else {
                        buf.len()
                    };
                    if v.position < limit {
                        mix += buf[v.position] * v.amplitude;
                    }
                    v.position += 1;
                }
                out[pos] = mix;
                pos += 1;
            }
            voices.retain(|v| {
                let buf = bank.get(v.sound_id);
                let limit = if v.max_samples > 0 {
                    v.max_samples.min(buf.len())
                } else {
                    buf.len()
                };
                v.position < limit
            });
        }
        out
    }

    /// The engine's own rule has to be `src/jam/practice.ts`'s rule. The
    /// port lives in `jam.rs`; this is the end of it that the UI sees —
    /// every bar of the form carries a state, and it is the same state
    /// every chorus.
    #[test]
    fn the_band_state_on_the_beat_event_follows_the_form() {
        let mut cfg = practising_band();
        cfg.practice = Some(JamPracticeConfig {
            drop_out: Some(JamDropOut {
                every_bars: 8,
                bars: 2,
            }),
            trade: None,
        });
        let table = compile_jam(&cfg).unwrap();
        for chorus in 1..=4u32 {
            for form_bar in 0..12u32 {
                assert_eq!(
                    table.band_state(form_bar),
                    band_state_for_bar(form_bar, 12, cfg.practice.as_ref()),
                    "chorus {chorus}, bar {form_bar}"
                );
            }
        }
        // The contract's value when there is no jam at all.
        let plain = compile_jam(&rock_16ths()).unwrap();
        assert!((0..4).all(|b| plain.band_state(b) == JamBandState::Full));
    }

    /// Taking the band away leaves exactly the metronome that was there
    /// before Jam existed.
    #[test]
    fn no_jam_means_the_click() {
        for subdivision in [1u32, 2, 3, 4, 6] {
            assert_eq!(
                jam_play(None, false, false, 4, subdivision, 0, 0, 0),
                JamPlay::Click
            );
        }
    }
}
