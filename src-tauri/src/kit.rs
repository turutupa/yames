//! Your own drums — a kit that is a folder on this machine.
//!
//! `plans/JAM_UX_DECISIONS.md` B3: "a kit can be a folder of WAVs you point
//! the app at… Loaded from disk, never shipped, so the license rule holds
//! and a player with a good sample pack gets a real drummer."
//!
//! Three things follow from "never shipped", and they shape this whole
//! module:
//!
//! * **The files are the user's, so nothing here may panic.** A folder can
//!   hold a truncated download, a 32-bit-float render, an eight-channel stem
//!   or a WAV that is really an AIFF. Every one of those comes back as a
//!   `Result` with a sentence the UI can put on screen. That is why the
//!   decoding here is `hound` rather than the `rodio` the embedded sounds
//!   use: rodio's WAV path narrows everything to `i16` and *panics* on a
//!   spec it does not implement, which for a file the user chose is a crash
//!   rather than a message.
//! * **They are decoded once, off the audio thread, and handed over like a
//!   table.** [`CustomBank`] is built in the `set_jam` command and carried
//!   inside the `Arc<JamTable>` that names it, so the drums and the bank
//!   holding them arrive together, are swapped together at the bar line and
//!   are retired together on a thread that may call `free()`.
//! * **They are cached by folder and mtime.** The UI re-sends the whole
//!   config four to six times a chorus to keep the bass a bar ahead
//!   (`useJamSession.ts`); decoding eight WAVs on each of those would be a
//!   folder read per bar. [`KitCache`] makes all but the first a stat of
//!   eight files and an `Arc` clone.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use crate::engine::{resample, KitVoice, KIT_VOICES};

/// The eight file names a kit folder may hold, and the voice each one
/// replaces. Mirrors the list in `JamEngineConfig.customKit`
/// (`src/jam/types.ts`) — and note `snare` / `snare_soft` rather than the
/// engine's `snare_hi` / `snare_lo`: a musician's sample pack is named the
/// way a drummer talks, and the accent is the same drum hit harder (rule 4
/// of `src-tauri/sounds/KITS.md`).
pub const KIT_FILES: [(&str, KitVoice); KIT_VOICES] = [
    ("kick", KitVoice::Kick),
    ("snare", KitVoice::SnareHi),
    ("snare_soft", KitVoice::SnareLo),
    ("hat", KitVoice::Hat),
    ("hat_open", KitVoice::HatOpen),
    ("ride", KitVoice::Ride),
    ("rim", KitVoice::Rim),
    ("crash", KitVoice::Crash),
];

/// The longest one drum may be.
///
/// Two seconds is longer than the longest shipped voice (`brushes`' crash
/// runs 700 ms) and long enough for any real cymbal sample to say what it
/// has to say. It is a cap and not a rejection because a sample pack's
/// crash is very often a ten-second wash with eight of them below −40 dB,
/// and refusing that folder would be refusing a good kit over a tail nobody
/// hears under a band.
///
/// It is also the bound on everything `set_jam` pays for a folder. See
/// [`MAX_FOLDER_BYTES`].
pub const MAX_VOICE_SECS: f64 = 2.0;

/// How long the cut at [`MAX_VOICE_SECS`] takes to reach silence.
///
/// A cap that stopped mid-waveform would leave a step from whatever the
/// sample happened to be doing at two seconds down to nothing, and a step is
/// a click — audible on every hit of that drum, and worse on a cymbal, which
/// is exactly the voice long enough to be cut. Five milliseconds is shorter
/// than any transient anybody would notice losing and long enough that the
/// edge is inaudible.
const CAP_FADE_SECS: f64 = 0.005;

/// The most audio one folder may declare, in decoded bytes.
///
/// **This is a sanity check on the folder, not a budget for the decode.**
/// The decode is already bounded by [`MAX_VOICE_SECS`]: `decode_mono` stops
/// reading at two seconds *at the source rate*, before a sample past it is
/// touched, so eight ten-minute stems cost the same as eight one-second hits
/// and no folder can make `set_jam` take longer than eight voices' worth of
/// two seconds. What this cap is for is INTENT — sixty-four megabytes is
/// about two and a half minutes of 44.1 kHz mono per voice across all eight,
/// which is far more than a drum and is the signature of a folder somebody
/// pointed at their sample library by mistake. Saying so is kinder than
/// silently playing the first two seconds of eight songs.
///
/// Measured on the files' own headers, so the answer arrives before any
/// decoding rather than after it.
pub const MAX_FOLDER_BYTES: u64 = 64 * 1024 * 1024;

/// The peak every decoded voice is put on.
///
/// The same 0.900 the shipped kit files carry, and for the same reason
/// (`src-tauri/sounds/KITS.md`): the files carry timbre, the engine carries
/// balance. Without it a quiet sample pack would be a band you cannot hear
/// and a hot one would drive the table's normalisation into the floor —
/// and, worse, the two would need different `LEVEL_GAIN`s to sound the same.
///
/// It is also what lets `jam.rs` measure a table that uses these voices
/// against the reference bank at [`crate::engine::JAM_REFERENCE_SR`]: a
/// buffer normalised after resampling is the same height at every rate, so
/// a peak measured at 48 kHz is the peak the device will render.
pub const VOICE_PEAK: f32 = 0.9;

// ---------------------------------------------------------------------------
// The bank
// ---------------------------------------------------------------------------

/// A folder of drums, decoded, resampled and ready for the audio thread.
///
/// Voices the folder did not hold are `None`, and `jam.rs` resolves those
/// back to the built-in kit named in `kit` when the table is compiled — so
/// a folder with nothing but a kick and a snare in it is a real kit with a
/// borrowed hat, not a band with two drums.
pub struct CustomBank {
    /// Which decode this is. Unique for the life of the process, and never
    /// reused.
    ///
    /// It exists because `jam.rs` memoises the four-bar render that
    /// normalises a table, and a folder path is not a key for that: replace
    /// `snare.wav` while the app is open and the path is the same, the
    /// samples are not, and the memo would hand back the old snare's peak
    /// forever. Hashing the decode rather than the path means a replaced
    /// file is a different table, which is what it is.
    ///
    /// An `Arc` pointer would nearly work and is the trap: the old bank is
    /// freed when the cache replaces it, and the allocator is entitled to
    /// hand the same address straight back.
    pub id: u64,
    voices: [Option<Vec<f32>>; KIT_VOICES],
    /// The rate every buffer above was resampled to. Diagnostics, the cache
    /// key, and the reason a device change re-decodes rather than detuning.
    ///
    /// The re-decode is FORCED, not hoped for: [`KitCache`] keys on this
    /// rate, but nothing would make the app ask again while a table that
    /// already holds a bank keeps playing, and that table's drums would be
    /// a semitone and a half out on the new device. So
    /// `MetronomeEngine::set_device` takes a table with a bank in it away
    /// (`JamHandoff::drop_custom_kit`); the click plays until the next
    /// bar-ahead `set_jam`, which is at most a bar, and that send decodes
    /// the folder again at the rate the new device actually opened at.
    pub rate: u32,
    /// Which of [`KIT_FILES`] were found, in that order.
    pub found: Vec<&'static str>,
    /// How much audio this bank actually holds, in bytes. Reported so a
    /// folder that is quietly enormous is visible rather than mysterious.
    pub bytes: usize,
}

impl CustomBank {
    /// The samples for one drum, or an empty slice when the folder did not
    /// hold it.
    ///
    /// A bounds-free read on the audio thread: an empty slice is a voice
    /// that renders nothing, which is what a missing sound should do.
    #[inline]
    pub fn voice(&self, v: KitVoice) -> &[f32] {
        self.voices[v as usize].as_deref().unwrap_or(&[])
    }

    /// Did the folder hold this drum? Asked once per lane when the table is
    /// compiled, never on the audio thread.
    #[inline]
    pub fn has(&self, v: KitVoice) -> bool {
        self.voices[v as usize].is_some()
    }
}

/// A folder with one half of the snare pair in it has both.
///
/// THIS IS THE DIFFERENCE BETWEEN A KIT AND A KIT WITH NO BACKBEAT.
/// [`KIT_FILES`] maps `snare.wav` to `snare_hi` and `snare_soft.wav` to
/// `snare_lo`, and `jam::slot_for` reaches for `snare_hi` only on an ACCENT
/// (level 2). Most of the library writes its backbeat at level 1, which is
/// `snare_lo` — so a folder holding nothing but `kick.wav` and `snare.wav`,
/// which is the folder a musician is most likely to try first, played its
/// kick from the folder and its snare from the built-in kit on nearly every
/// groove in the app. Two drums that do not match, and no way to tell why.
///
/// The fix is rule 4 of `src-tauri/sounds/KITS.md` applied to somebody
/// else's samples: the accent is the same drum hit harder, so half a pair is
/// a whole pair. A folder with only the loud one uses it for the ghosts too
/// (the level gain is what makes a ghost a ghost); a folder with only the
/// soft one uses it for the backbeat. A folder with both keeps both, and
/// [`CustomBank::found`] keeps reporting the FILES, so `inspect` and the
/// screen still say honestly which of the eight are on disk.
fn alias_snare_pair(voices: &mut [Option<Vec<f32>>; KIT_VOICES]) {
    for (from, to) in [
        (KitVoice::SnareHi, KitVoice::SnareLo),
        (KitVoice::SnareLo, KitVoice::SnareHi),
    ] {
        if voices[to as usize].is_none() {
            if let Some(buf) = voices[from as usize].clone() {
                voices[to as usize] = Some(buf);
            }
        }
    }
}

#[cfg(test)]
impl CustomBank {
    /// A bank with the named voices in it, without a folder.
    ///
    /// For `jam.rs`, whose tests are about which SOUND a lane resolves to
    /// and not about decoding: writing eight WAVs to disk to find out that
    /// a missing ride falls back to the built-in one would be testing this
    /// module twice and that one not at all.
    ///
    /// `secs` is the length of every voice, and it is a parameter because
    /// the ceiling tests need it to be. [`MAX_VOICE_SECS`] is nearly three
    /// times the longest drum this app ships (`brushes`' 700 ms crash), and
    /// a headroom figure measured on 50 ms bursts says nothing at all about
    /// a folder of two-second cymbals — the ring-out is the whole reason
    /// voices stack. Pass [`MAX_VOICE_SECS`] to ask the hard question and a
    /// short burst when the test is about which sound came out.
    ///
    /// The shape is a decaying sine, and the frequency differs per voice.
    /// Both matter for the tests that measure a peak: eight copies of one
    /// steady tone are phase-locked and add coherently, which is a signal no
    /// drum kit is and a fixture no allowance could ever cover.
    pub fn for_tests(voices: &[KitVoice], rate: u32, secs: f64) -> Self {
        let mut slots: [Option<Vec<f32>>; KIT_VOICES] = Default::default();
        for v in voices {
            // Peaked on the bank's own peak, so a table compiled against it
            // normalises the way a real folder would; decaying to a tenth of
            // that by the end, which is roughly what a cymbal does over its
            // audible tail.
            let n = (secs * rate as f64) as usize;
            let freq = 60.0 * 1.7f64.powi(*v as i32);
            slots[*v as usize] = Some(
                (0..n)
                    .map(|i| {
                        let t = i as f64 / rate as f64;
                        let env = (-t * (10.0f64).ln() / secs.max(1e-6)).exp();
                        (VOICE_PEAK as f64
                            * env
                            * (2.0 * std::f64::consts::PI * freq * t).sin())
                            as f32
                    })
                    .collect(),
            );
        }
        alias_snare_pair(&mut slots);
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1 << 32);
        Self {
            id: NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
            bytes: slots.iter().flatten().map(|v| v.len() * 4).sum(),
            voices: slots,
            rate,
            found: Vec::new(),
        }
    }
}

impl std::fmt::Debug for CustomBank {
    /// Without this the `Debug` on `JamTable` would print several megabytes
    /// of samples the first time anyone `dbg!`ed a table.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CustomBank")
            .field("id", &self.id)
            .field("rate", &self.rate)
            .field("found", &self.found)
            .field("bytes", &self.bytes)
            .finish()
    }
}

// ---------------------------------------------------------------------------
// Looking at a folder without decoding it
// ---------------------------------------------------------------------------

/// What a kit folder holds. The Rust half of `inspectKitFolder` in
/// `src/ipc.ts`.
#[derive(Debug, Clone, serde::Serialize)]
pub struct KitFolder {
    /// Which of [`KIT_FILES`] were found, in that order.
    pub voices: Vec<String>,
    /// And which were not — the ones that will come from the built-in kit.
    pub missing: Vec<String>,
}

/// Every `*.wav` in `dir`, as a map from lower-cased stem to full path.
///
/// Read once and matched case-insensitively, because a sample pack ships
/// `Kick.wav` as often as `kick.wav` and a musician should not have to
/// rename eight files to find out whether their kit works.
fn wavs_in(dir: &Path) -> Result<std::collections::HashMap<String, PathBuf>, String> {
    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("could not read {}: {e}", dir.display()))?;
    let mut out = std::collections::HashMap::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_wav = path
            .extension()
            .map(|e| e.to_string_lossy().to_ascii_lowercase() == "wav")
            .unwrap_or(false);
        if !is_wav {
            continue;
        }
        if let Some(stem) = path.file_stem() {
            out.insert(stem.to_string_lossy().to_ascii_lowercase(), path);
        }
    }
    Ok(out)
}

/// Which of the eight voices this folder holds, without decoding a sample.
///
/// The UI calls this while the musician is still choosing, so it must be a
/// directory listing and nothing more: opening eight WAVs to answer "is
/// there a ride in here" would put a disk read in front of a hover.
pub fn inspect(dir: &Path) -> Result<KitFolder, String> {
    let found = wavs_in(dir)?;
    let mut voices = Vec::new();
    let mut missing = Vec::new();
    for (name, _) in KIT_FILES {
        if found.contains_key(name) {
            voices.push(name.to_string());
        } else {
            missing.push(name.to_string());
        }
    }
    Ok(KitFolder { voices, missing })
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/// One WAV, folded to mono, at its own rate.
///
/// Handles what a musician's folder actually contains: 8-, 16-, 24- and
/// 32-bit PCM and 32-bit float, any channel count, any rate. Anything else
/// comes back as a message rather than a panic.
///
/// [`MAX_VOICE_SECS`] is applied HERE, at the source rate and before a
/// sample past it is read, so a ten-second crash costs two seconds of
/// decoding and two seconds of sinc rather than ten of each — and no folder,
/// whatever is in it, can make `set_jam` do more work than eight voices'
/// worth of two seconds.
///
/// A sample that WAS cut is faded out over [`CAP_FADE_SECS`] on the way, so
/// the cap is a decision about length and not a click. See [`MAX_VOICE_SECS`].
fn decode_mono(path: &Path) -> Result<(Vec<f32>, u32), String> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string());
    let mut reader = hound::WavReader::open(path)
        .map_err(|e| format!("{name} could not be opened as a WAV: {e}"))?;
    let spec = reader.spec();
    let channels = spec.channels.max(1) as usize;
    if spec.sample_rate == 0 {
        return Err(format!("{name} claims a sample rate of zero"));
    }

    let max_frames = (MAX_VOICE_SECS * spec.sample_rate as f64) as usize;
    // `duration()` is frames, from the header, before anything is read: it
    // is how the fade below knows whether the cap actually cut anything.
    let file_frames = reader.duration() as usize;
    let want = max_frames.max(1).saturating_mul(channels);
    // The interleaved samples, as f32 in −1..1. `samples::<i32>()` reads any
    // integer width hound supports, so one arm covers 8, 16, 24 and 32-bit.
    let raw: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => {
            if spec.bits_per_sample != 32 {
                return Err(format!(
                    "{name} is {}-bit float, and only 32-bit float is a thing WAV \
                     files really are",
                    spec.bits_per_sample
                ));
            }
            reader
                .samples::<f32>()
                .take(want)
                .collect::<Result<Vec<f32>, _>>()
                .map_err(|e| format!("{name} stopped decoding partway through: {e}"))?
        }
        hound::SampleFormat::Int => {
            let bits = spec.bits_per_sample;
            if !(1..=32).contains(&bits) {
                return Err(format!("{name} is {bits}-bit, which is not a WAV depth"));
            }
            // 2^(bits−1) — the magnitude of the most negative sample, which
            // is the divisor that puts full scale exactly on 1.0.
            let full = (1i64 << (bits - 1)) as f32;
            reader
                .samples::<i32>()
                .take(want)
                .map(|s| s.map(|v| v as f32 / full))
                .collect::<Result<Vec<f32>, _>>()
                .map_err(|e| format!("{name} stopped decoding partway through: {e}"))?
        }
    };
    if raw.is_empty() {
        return Err(format!("{name} holds no audio at all"));
    }

    // Fold to mono. An average rather than a sum: summing a stereo file
    // makes it 6 dB louder than a mono one, and the normalisation below
    // would then quietly undo the difference on the peak while leaving it
    // in the energy.
    let mut mono: Vec<f32> = if channels >= 2 {
        raw.chunks(channels)
            .map(|frame| frame.iter().sum::<f32>() / channels as f32)
            .collect()
    } else {
        raw
    };

    // THE CAP IS A DECISION ABOUT LENGTH, NOT A CLICK.
    //
    // Two seconds into a ten-second cymbal wash the waveform is still going,
    // often near the top of a cycle, and stopping there leaves a step
    // straight down to nothing. A step is broadband: it is a tick on every
    // hit of that drum, it survives the resampler and the normalisation, and
    // it is loudest on exactly the voice that gets cut. Five milliseconds of
    // linear ramp costs nothing anybody can hear and removes it.
    //
    // Only when the file WAS cut. A sample that simply ends where it ends is
    // the musician's own decision and is left alone.
    if file_frames > max_frames {
        let fade = ((CAP_FADE_SECS * spec.sample_rate as f64) as usize).min(mono.len());
        if fade > 1 {
            let start = mono.len() - fade;
            for (i, s) in mono[start..].iter_mut().enumerate() {
                *s *= 1.0 - (i as f32 / (fade - 1) as f32);
            }
        }
    }
    Ok((mono, spec.sample_rate))
}

/// Decode a folder into a bank at `rate`.
///
/// Runs on the command thread, in `set_jam`, and never on the audio thread.
/// Every error is a sentence the UI can show; a folder with none of the
/// eight names in it is one of them, because silently falling back to the
/// built-in kit would look exactly like the feature not working.
pub fn load(dir: &Path, rate: u32) -> Result<CustomBank, String> {
    load_capped(dir, rate, MAX_FOLDER_BYTES)
}

/// [`load`] with the size cap as an argument.
///
/// Split out for one reason: the test that proves the cap refuses a folder
/// would otherwise have to WRITE sixty-four megabytes of WAV to disk to
/// reach it, which is a slow test of an arithmetic comparison. With the cap
/// as a parameter the same code path is exercised against a few kilobytes,
/// and `the_cap_the_app_actually_uses_is_the_published_one` keeps the
/// number honest.
fn load_capped(dir: &Path, rate: u32, max_bytes: u64) -> Result<CustomBank, String> {
    let files = wavs_in(dir)?;
    let present: Vec<(&'static str, KitVoice, PathBuf)> = KIT_FILES
        .iter()
        .filter_map(|(name, voice)| files.get(*name).map(|p| (*name, *voice, p.clone())))
        .collect();
    if present.is_empty() {
        return Err(format!(
            "{} holds none of kick, snare, snare_soft, hat, hat_open, ride, rim \
             or crash as a .wav",
            dir.display()
        ));
    }

    // ---- The size cap, from the headers, before a single sample is read ----
    let mut declared: u64 = 0;
    for (name, _, path) in present.iter() {
        let reader = hound::WavReader::open(path)
            .map_err(|e| format!("{name}.wav could not be opened as a WAV: {e}"))?;
        // Frames × four bytes: what this file will cost as mono `f32`.
        declared = declared.saturating_add(reader.duration() as u64 * 4);
    }
    if declared > max_bytes {
        return Err(format!(
            "{} is {:.1} MB of audio decoded, and a kit is capped at {:.1} MB — \
             point Yames at a folder of single drum hits rather than at a \
             sample library",
            dir.display(),
            declared as f64 / (1024.0 * 1024.0),
            max_bytes as f64 / (1024.0 * 1024.0),
        ));
    }

    let mut voices: [Option<Vec<f32>>; KIT_VOICES] = Default::default();
    let mut found = Vec::new();
    for (name, voice, path) in present {
        let (mono, src_rate) = decode_mono(&path)?;
        let mut buf = if src_rate == rate {
            mono
        } else {
            resample(&mono, src_rate, rate)
        };

        // Peak-normalise. AFTER the resampler, because the resampler is not
        // level-preserving on a bright transient — the same Gibbs ripple
        // that makes `SoundBank::new` put the shipped kits back on 0.900,
        // and the reason a table's peak measured at one rate is the peak
        // rendered at another.
        let peak = buf.iter().fold(0.0f32, |m, s| m.max(s.abs()));
        if peak <= 0.0 {
            return Err(format!("{name}.wav is silent"));
        }
        let g = VOICE_PEAK / peak;
        for s in buf.iter_mut() {
            *s *= g;
        }

        voices[voice as usize] = Some(buf);
        found.push(name);
    }

    // Half a snare pair is a whole snare pair. `found` is untouched, so the
    // screen still reports the files that are really there — see
    // `alias_snare_pair`, which is where the reasoning lives.
    alias_snare_pair(&mut voices);
    // Counted after the aliasing, so `bytes` is what this bank really holds
    // — a folder with one snare in it carries that snare twice.
    let bytes: usize = voices
        .iter()
        .flatten()
        .map(|v| v.len() * std::mem::size_of::<f32>())
        .sum();

    // One per decode, for the life of the process. Relaxed because nothing
    // is ordered against it: all that is asked of it is that no two banks
    // ever get the same number.
    static NEXT_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
    Ok(CustomBank {
        id: NEXT_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
        voices,
        rate,
        found,
        bytes,
    })
}

// ---------------------------------------------------------------------------
// The cache
// ---------------------------------------------------------------------------

/// What a cached bank was built from: the folder, the rate it was decoded
/// at, and every file's size and modification time.
///
/// The mtimes are the point. A cache keyed on the path alone would keep
/// playing yesterday's snare after the musician replaced the file, and the
/// only way to find out would be to restart the app.
#[derive(PartialEq, Eq)]
struct Key {
    dir: PathBuf,
    rate: u32,
    stamps: Vec<(String, u64, u128)>,
}

/// A modification time as a number, to the NANOSECOND.
///
/// Whole seconds is not enough resolution to be a cache key. Every write
/// this cache has to notice happens while the app is open and the musician
/// is working: render a snare out of a DAW, drop it in the folder, hear it.
/// Two writes inside the same second — which is most of them — carry the
/// same whole-second stamp, and if the file also happens to come out the
/// same length (the same bounce of the same bar, re-EQ'd) the key does not
/// move and the app keeps playing the old snare until it restarts.
///
/// `None` — a filesystem that does not report a modification time — is 0,
/// which makes the key fall back to the path, the rate and the file size.
fn stamp(modified: Option<std::time::SystemTime>) -> u128 {
    modified
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

/// Stat the eight names and build the key. Cheap enough to run on every
/// `set_jam`; a folder read and eight `metadata` calls is microseconds, and
/// it is what makes the bar-ahead sends free.
fn key_for(dir: &Path, rate: u32) -> Result<Key, String> {
    let files = wavs_in(dir)?;
    let mut stamps = Vec::new();
    for (name, _) in KIT_FILES {
        let Some(path) = files.get(name) else {
            continue;
        };
        let meta = std::fs::metadata(path)
            .map_err(|e| format!("could not read {}: {e}", path.display()))?;
        stamps.push((name.to_string(), meta.len(), stamp(meta.modified().ok())));
    }
    Ok(Key {
        dir: dir.to_path_buf(),
        rate,
        stamps,
    })
}

/// The kit folder the app has already decoded.
///
/// One entry, deliberately. The traffic this exists for is the SAME folder
/// arriving four to six times a chorus behind the bar-ahead bass, not a
/// musician alternating between two sample packs; a second entry would
/// double the memory to make an action nobody takes twice a second faster.
#[derive(Default)]
pub struct KitCache {
    // A `Mutex` and not a lock-free anything: this is the command thread's
    // and only the command thread's. The audio thread never sees it — it
    // sees the `Arc<CustomBank>` inside the table it was handed.
    entry: Mutex<Option<(Key, Arc<CustomBank>)>>,
}

impl KitCache {
    /// The bank for this folder at this rate, decoding it only if the
    /// folder, one of its files or the output rate has changed since last
    /// time.
    pub fn get_or_load(&self, dir: &Path, rate: u32) -> Result<Arc<CustomBank>, String> {
        let key = key_for(dir, rate)?;
        if let Ok(slot) = self.entry.lock() {
            if let Some((cached, bank)) = slot.as_ref() {
                if *cached == key {
                    return Ok(bank.clone());
                }
            }
        }
        let bank = Arc::new(load(dir, rate)?);
        if let Ok(mut slot) = self.entry.lock() {
            *slot = Some((key, bank.clone()));
        }
        Ok(bank)
    }

    /// How many times a folder has actually been decoded. Tests only — it is
    /// the only way to say "the bar-ahead send did not re-decode" as a
    /// number rather than as a hope.
    #[cfg(test)]
    pub fn is_holding(&self, dir: &Path, rate: u32) -> bool {
        match (self.entry.lock(), key_for(dir, rate)) {
            (Ok(slot), Ok(key)) => slot.as_ref().is_some_and(|(k, _)| *k == key),
            _ => false,
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use hound::{SampleFormat, WavSpec, WavWriter};

    /// A directory of its own, removed when the test drops it.
    ///
    /// Every test here writes real WAVs to a real disk, on purpose: this
    /// module exists to read files it did not write, and a fake filesystem
    /// would test the fake.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(what: &str) -> Self {
            // The thread id keeps two tests running at once out of each
            // other's folder; `cargo test` is threaded by default.
            let dir = std::env::temp_dir().join(format!(
                "yames-kit-{what}-{}-{:?}",
                std::process::id(),
                std::thread::current().id()
            ));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).expect("a scratch directory");
            Self(dir)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    /// `freq` Hz for `secs` seconds, at `sr`, in whatever the spec asks for.
    ///
    /// A sine rather than a drum because the point of these tests is the
    /// DECODER, and a sine is the one signal whose resampling error can be
    /// stated as a number.
    fn write_sine(
        path: &Path,
        sr: u32,
        channels: u16,
        bits: u16,
        float: bool,
        freq: f64,
        secs: f64,
        amp: f64,
    ) {
        let spec = WavSpec {
            channels,
            sample_rate: sr,
            bits_per_sample: bits,
            sample_format: if float {
                SampleFormat::Float
            } else {
                SampleFormat::Int
            },
        };
        let mut w = WavWriter::create(path, spec).expect("a writable WAV");
        let frames = (secs * sr as f64) as usize;
        let full = (1i64 << (bits - 1)) as f64;
        for i in 0..frames {
            let v = amp * (2.0 * std::f64::consts::PI * freq * i as f64 / sr as f64).sin();
            for _ in 0..channels {
                if float {
                    w.write_sample(v as f32).unwrap();
                } else {
                    // −(2^(b−1)) .. 2^(b−1)−1, clamped so full scale cannot
                    // wrap round to the other end.
                    let q = (v * full).round().clamp(-full, full - 1.0) as i32;
                    w.write_sample(q).unwrap();
                }
            }
        }
        w.finalize().expect("a finalised WAV");
    }

    /// The frequency of a buffer, from its upward zero crossings — the same
    /// measurement `engine.rs` uses on the pitched banks, and honest here
    /// for the same reason: a resampled sine is still a sine.
    fn frequency_of(buf: &[f32], sr: u32) -> f64 {
        // Skip the first and last few milliseconds: the resampler's kernel
        // hangs off both ends of the source and rings there.
        let from = (0.010 * sr as f64) as usize;
        let to = buf.len().saturating_sub((0.010 * sr as f64) as usize);
        let (mut first, mut last, mut count) = (f64::NAN, f64::NAN, 0usize);
        for i in from + 1..to {
            let (a, b) = (buf[i - 1] as f64, buf[i] as f64);
            if a <= 0.0 && b > 0.0 {
                let t = (i - 1) as f64 + (-a) / (b - a);
                if count == 0 {
                    first = t;
                }
                last = t;
                count += 1;
            }
        }
        assert!(count >= 3, "only {count} zero crossings to measure");
        sr as f64 / ((last - first) / (count - 1) as f64)
    }

    /// THE FORMAT A SAMPLE PACK ACTUALLY SHIPS IN.
    ///
    /// 24-bit stereo at 44.1 kHz is what a drum library is, and every step
    /// between that and what the audio thread reads is a place to be wrong:
    /// the bit depth (24-bit read as 16 is a quarter of the level), the
    /// channel fold (a sum rather than an average is 6 dB), the rate (a
    /// missing resample is a semitone and a half sharp), and the peak.
    ///
    /// So all four are checked on one file, and the tone is measured rather
    /// than assumed.
    #[test]
    fn a_stereo_24_bit_44_kilohertz_file_becomes_mono_at_the_output_rate() {
        let scratch = Scratch::new("format");
        write_sine(
            &scratch.path().join("kick.wav"),
            44_100,
            2,
            24,
            false,
            220.0,
            0.5,
            0.4,
        );
        let bank = load(scratch.path(), 48_000).expect("the folder loads");

        assert_eq!(bank.rate, 48_000);
        assert_eq!(bank.found, vec!["kick"]);
        let buf = bank.voice(KitVoice::Kick);

        // Half a second at the OUTPUT rate, within a sample or two of the
        // resampler's rounding.
        let want_len = 24_000;
        assert!(
            (buf.len() as i64 - want_len).abs() <= 2,
            "half a second at 48 kHz is {want_len} samples, not {}",
            buf.len()
        );
        // Still 220 Hz. A file played at its own rate on a 48 kHz device
        // would be 239.5 Hz — a semitone and a half sharp, and unmistakable.
        let got = frequency_of(buf, 48_000);
        let cents = 1200.0 * (got / 220.0f64).log2();
        assert!(
            cents.abs() < 1.0,
            "the resampled tone is {got:.3} Hz against 220 — {cents:.3} cents off"
        );
        // And on the peak the engine balances against, whatever the file's
        // own level was.
        let peak = buf.iter().fold(0.0f32, |m, s| m.max(s.abs()));
        assert!(
            (peak - VOICE_PEAK).abs() < 1e-4,
            "the decoded kick peaks at {peak} and the bank normalises to {VOICE_PEAK}"
        );
    }

    /// WHAT THE RESAMPLER COSTS, AS A NUMBER.
    ///
    /// 44.1 kHz to 48 is the conversion nearly every user's kit will go
    /// through, and "it sounds fine" is not a measurement. A 220 Hz sine is
    /// resampled and compared sample for sample against the same sine
    /// generated at 48 kHz; what is asserted is the error floor, which is
    /// what says the windowed sinc in `engine.rs` is doing its job rather
    /// than dropping samples.
    ///
    /// Measured: **−122.5 dB RMS** against the signal, over the steady part
    /// of the tone — which is the thirty-two-tap Blackman-windowed sinc in
    /// `engine::resample` doing exactly what it is for, and effectively the
    /// f32 floor. The gate is −45 dB, two orders of magnitude looser, so it
    /// catches a resampler that was replaced or removed rather than one
    /// that was tuned.
    #[test]
    fn the_decoder_resamples_44_kilohertz_to_48_within_a_measurable_error() {
        let scratch = Scratch::new("resample");
        write_sine(
            &scratch.path().join("snare.wav"),
            44_100,
            1,
            24,
            false,
            220.0,
            0.5,
            0.8,
        );
        let bank = load(scratch.path(), 48_000).expect("the folder loads");
        let got = bank.voice(KitVoice::SnareHi);

        // The reference: the same tone at the output rate, on the same peak
        // the bank normalises to.
        let want: Vec<f32> = (0..got.len())
            .map(|i| {
                (VOICE_PEAK as f64
                    * (2.0 * std::f64::consts::PI * 220.0 * i as f64 / 48_000.0).sin())
                    as f32
            })
            .collect();

        // The steady part only. The kernel hangs off both ends of the
        // source, which is a real artefact of a finite file and not a
        // resampling error.
        let skip = 480;
        let (mut err, mut sig) = (0.0f64, 0.0f64);
        for i in skip..got.len() - skip {
            let d = (got[i] - want[i]) as f64;
            err += d * d;
            sig += (want[i] as f64) * (want[i] as f64);
        }
        let db = 10.0 * (err / sig.max(1e-30)).log10();
        eprintln!("[kit] 44.1 kHz -> 48 kHz resampling error: {db:.1} dB RMS");
        assert!(
            db < -45.0,
            "the resampler leaves {db:.1} dB of error against the signal"
        );
    }

    /// Sixteen-bit, thirty-two-bit float and eight-bit all arrive as the
    /// same drum. The depth is the file's business and none of the band's.
    #[test]
    fn every_depth_a_wav_can_be_decodes_to_the_same_sound() {
        let mut decoded = Vec::new();
        for (name, bits, float) in [("d16", 16u16, false), ("d32f", 32, true), ("d8", 8, false)] {
            let scratch = Scratch::new(name);
            write_sine(
                &scratch.path().join("hat.wav"),
                48_000,
                1,
                bits,
                float,
                220.0,
                0.2,
                0.5,
            );
            let bank = load(scratch.path(), 48_000).expect("the folder loads");
            decoded.push((name, bank.voice(KitVoice::Hat).to_vec()));
        }
        let (_, reference) = &decoded[0];
        for (name, buf) in decoded.iter().skip(1) {
            assert_eq!(buf.len(), reference.len(), "{name} came out a different length");
            // Eight-bit is coarse — a 255-step quantiser is 48 dB of
            // signal-to-noise and no more — so the tolerance is the format's
            // own and not the decoder's.
            let worst = buf
                .iter()
                .zip(reference.iter())
                .fold(0.0f32, |m, (a, b)| m.max((a - b).abs()));
            assert!(worst < 0.01, "{name} differs from 16-bit by {worst}");
        }
    }

    /// A long sample is CUT, not refused — and the cut FADES.
    ///
    /// See [`MAX_VOICE_SECS`] and [`CAP_FADE_SECS`]. The fixture is a
    /// six-second sine at full level, so two seconds in the waveform is
    /// still going at full amplitude; without the ramp the buffer ends on a
    /// step of whatever the sine happened to be doing, which is a click on
    /// every hit of that cymbal.
    #[test]
    fn a_long_sample_is_capped_rather_than_rejected() {
        let scratch = Scratch::new("long");
        write_sine(
            &scratch.path().join("crash.wav"),
            48_000,
            1,
            16,
            false,
            440.0,
            6.0,
            0.5,
        );
        let bank = load(scratch.path(), 48_000).expect("a long crash is still a crash");
        let buf = bank.voice(KitVoice::Crash);
        let len = buf.len();
        assert!(
            (len as i64 - 96_000).abs() <= 2,
            "six seconds of crash came out as {len} samples and the cap is two seconds"
        );
        // The cut is silent. A 440 Hz sine at 48 kHz crosses zero every 55
        // samples, so a buffer that simply STOPPED would end somewhere on
        // the cycle — 0.9 at worst and a couple of tenths on average.
        let last = buf[len - 1].abs();
        assert!(
            last < 0.01,
            "the capped crash ends at {last}, which is a step and therefore a click"
        );
        // And the ramp is only the ramp: the cycle before it starts is still
        // the drum at full height, so the fade took five milliseconds and
        // not fifty.
        let fade = (CAP_FADE_SECS * 48_000.0) as usize;
        let before = buf[len - fade - 120..len - fade]
            .iter()
            .fold(0.0f32, |m, s| m.max(s.abs()));
        assert!(
            before > 0.5,
            "the cycle before the fade peaks at {before}, so the fade is eating the cymbal"
        );
    }

    /// A sample that ENDS on its own is not faded.
    ///
    /// The ramp is what the cap owes the musician for cutting their file. A
    /// file the cap never touched is their own decision about where the drum
    /// stops, and rewriting its last five milliseconds would be the app
    /// editing samples it was only asked to play.
    #[test]
    fn a_short_sample_keeps_the_ending_the_musician_gave_it() {
        let scratch = Scratch::new("short");
        // A quarter of a second, ending mid-cycle at full amplitude on
        // purpose: 440 Hz at 48 kHz is 109.09 samples a cycle, so 12 000
        // samples is not a whole number of them.
        write_sine(
            &scratch.path().join("rim.wav"),
            48_000,
            1,
            16,
            false,
            440.0,
            0.25,
            0.5,
        );
        let bank = load(scratch.path(), 48_000).expect("the folder loads");
        let buf = bank.voice(KitVoice::Rim);
        let tail = buf[buf.len() - 60..].iter().fold(0.0f32, |m, s| m.max(s.abs()));
        assert!(
            tail > 0.5,
            "an uncapped file came back faded; its last cycle peaks at {tail}"
        );
    }

    /// HALF A SNARE PAIR IS A WHOLE SNARE PAIR.
    ///
    /// The folder a musician is most likely to try first is a kick and a
    /// snare. `snare.wav` is `snare_hi`, and `jam::slot_for` reaches for
    /// `snare_hi` only on an ACCENT — so before this, that folder played its
    /// kick and the built-in kit's snare on every groove in the library that
    /// writes its backbeat at level 1, which is most of them.
    ///
    /// See [`alias_snare_pair`]. `found` still reports the files on disk,
    /// which is what `inspect` and the screen tell the musician.
    #[test]
    fn a_folder_with_one_snare_plays_it_for_both_the_backbeat_and_the_ghosts() {
        let scratch = Scratch::new("snare-hi");
        write_sine(
            &scratch.path().join("snare.wav"),
            48_000,
            1,
            16,
            false,
            250.0,
            0.15,
            0.5,
        );
        let bank = load(scratch.path(), 48_000).expect("the folder loads");
        assert!(bank.has(KitVoice::SnareHi));
        assert!(
            bank.has(KitVoice::SnareLo),
            "a folder with snare.wav in it has no backbeat on a level-1 groove"
        );
        assert_eq!(
            bank.voice(KitVoice::SnareHi),
            bank.voice(KitVoice::SnareLo),
            "the accent is the same drum hit harder (rule 4 of KITS.md)"
        );
        // The FILES are still reported honestly: the folder holds one snare
        // and the screen must not claim two.
        assert_eq!(bank.found, vec!["snare"]);
        let seen = inspect(scratch.path()).expect("the folder is readable");
        assert_eq!(seen.voices, vec!["snare"]);
        assert!(seen.missing.contains(&"snare_soft".to_string()));

        // And the mirror: a folder with only the soft one plays it on the
        // backbeat rather than borrowing a snare that does not match.
        let other = Scratch::new("snare-lo");
        write_sine(
            &other.path().join("snare_soft.wav"),
            48_000,
            1,
            16,
            false,
            250.0,
            0.15,
            0.5,
        );
        let soft = load(other.path(), 48_000).expect("the folder loads");
        assert!(soft.has(KitVoice::SnareHi) && soft.has(KitVoice::SnareLo));
        assert_eq!(soft.found, vec!["snare_soft"]);

        // A folder with BOTH keeps both, which is the whole point of there
        // being two names.
        let pair = Scratch::new("snare-pair");
        write_sine(&pair.path().join("snare.wav"), 48_000, 1, 16, false, 250.0, 0.15, 0.5);
        write_sine(&pair.path().join("snare_soft.wav"), 48_000, 1, 16, false, 180.0, 0.15, 0.5);
        let both = load(pair.path(), 48_000).expect("the folder loads");
        assert_ne!(
            both.voice(KitVoice::SnareHi),
            both.voice(KitVoice::SnareLo),
            "two files in the folder and the app played one of them twice"
        );
    }

    /// WHAT A FOLDER CAN COST `set_jam`, AS A NUMBER.
    ///
    /// [`MAX_FOLDER_BYTES`] is a sanity check on intent and NOT the bound on
    /// the work, and the docs on both constants now say so — this is what
    /// keeps that claim true. `decode_mono` stops at [`MAX_VOICE_SECS`] at
    /// the source rate, so eight enormous files decode to exactly the same
    /// eight two-second buffers eight small ones would, and `set_jam` cannot
    /// be made slower by pointing it at a bigger folder.
    ///
    /// It matters because `set_jam` is a synchronous command: the decode
    /// runs where the caller runs, so "how much work can a folder ask for"
    /// is the same question as "how long can the window be busy".
    #[test]
    fn no_folder_can_cost_more_than_the_cap_however_long_its_files_are() {
        let scratch = Scratch::new("bounded");
        for (name, _) in KIT_FILES {
            // Three times the cap each, at a rate above the output's.
            write_sine(
                &scratch.path().join(format!("{name}.wav")),
                96_000,
                1,
                16,
                false,
                300.0,
                MAX_VOICE_SECS * 3.0,
                0.5,
            );
        }
        let bank = load(scratch.path(), 48_000).expect("eight long drums are still a kit");
        let ceiling = (MAX_VOICE_SECS * 48_000.0) as usize + 2;
        for v in KitVoice::ALL {
            let len = bank.voice(v).len();
            assert!(
                len <= ceiling,
                "{} decoded to {len} samples against a cap of {ceiling}",
                v.file_name()
            );
        }
        assert!(
            bank.bytes <= KIT_VOICES * ceiling * 4,
            "the folder decoded to {} bytes, over eight voices' worth of the cap",
            bank.bytes
        );
    }

    /// THE CACHE KEY KEEPS THE NANOSECONDS.
    ///
    /// See [`stamp`]. Truncated to whole seconds, the two times below are
    /// the same number — and a snare re-bounced and dropped in the folder
    /// within a second of the last one, at the same length, would keep
    /// playing the old sound until the app restarted.
    #[test]
    fn a_file_replaced_within_the_same_second_is_a_different_key() {
        let base = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_757_000_000);
        assert_ne!(
            stamp(Some(base)),
            stamp(Some(base + std::time::Duration::from_millis(1))),
            "a millisecond apart is a different file, and whole seconds cannot see it"
        );
        assert_ne!(
            stamp(Some(base)),
            stamp(Some(base + std::time::Duration::from_nanos(100))),
            "NTFS timestamps tick every 100 ns, so that is the resolution to keep"
        );
        // A filesystem that reports no time at all falls back on the path,
        // the rate and the size rather than panicking.
        assert_eq!(stamp(None), 0);
    }

    /// A folder of far too much audio is refused with a sentence, before a
    /// single sample is read.
    #[test]
    fn a_folder_of_too_much_audio_is_refused_with_a_message() {
        let scratch = Scratch::new("huge");
        // One second at 48 kHz is 192 kB decoded, so a cap of 64 kB is over
        // it three times. Same code path, three orders of magnitude less
        // disk — see `load_capped`.
        write_sine(
            &scratch.path().join("kick.wav"),
            48_000,
            1,
            16,
            false,
            80.0,
            1.0,
            0.5,
        );
        let err = load_capped(scratch.path(), 48_000, 64 * 1024)
            .expect_err("a folder over the cap must be refused");
        assert!(
            err.contains("capped at"),
            "the refusal has to say what the cap is; it said {err:?}"
        );
        // And under the cap the same folder loads, so the message is about
        // the size and not about the folder.
        assert!(load_capped(scratch.path(), 48_000, 64 * 1024 * 1024).is_ok());
    }

    /// The published cap is the one the app uses. `load_capped` exists for
    /// the test above; this is what stops it drifting away from `load`.
    #[test]
    fn the_cap_the_app_actually_uses_is_the_published_one() {
        assert_eq!(MAX_FOLDER_BYTES, 64 * 1024 * 1024);
        assert_eq!(MAX_VOICE_SECS, 2.0);
    }

    /// A folder with none of the eight names says so, rather than quietly
    /// handing back a bank with nothing in it — which would look exactly
    /// like the feature not working.
    #[test]
    fn a_folder_with_no_drums_in_it_says_so() {
        let scratch = Scratch::new("empty");
        write_sine(
            &scratch.path().join("guitar-loop.wav"),
            48_000,
            1,
            16,
            false,
            440.0,
            0.2,
            0.5,
        );
        let err = load(scratch.path(), 48_000).expect_err("nothing here is a drum");
        assert!(err.contains("kick"), "the message has to name the files it wanted: {err:?}");
    }

    /// A file that is not a WAV is a message, not a panic. This is the whole
    /// reason the decoding here is `hound` and not `rodio`.
    #[test]
    fn a_file_that_is_not_really_a_wav_is_refused_rather_than_crashing() {
        let scratch = Scratch::new("junk");
        std::fs::write(scratch.path().join("kick.wav"), b"ID3\x04\x00not a wav at all").unwrap();
        let err = load(scratch.path(), 48_000).expect_err("that is not a WAV");
        assert!(err.contains("kick.wav"), "the message has to name the file: {err:?}");
    }

    /// `Kick.wav` is a kick. A sample pack names its files the way its
    /// author felt like that day, and renaming eight files should not be
    /// the price of using one.
    #[test]
    fn the_names_are_matched_whatever_case_they_are_in() {
        let scratch = Scratch::new("case");
        for name in ["Kick.WAV", "SNARE.wav", "Hat_Open.Wav"] {
            write_sine(&scratch.path().join(name), 48_000, 1, 16, false, 300.0, 0.1, 0.5);
        }
        let seen = inspect(scratch.path()).expect("the folder is readable");
        assert_eq!(seen.voices, vec!["kick", "snare", "hat_open"]);
        assert!(seen.missing.contains(&"ride".to_string()));
        assert_eq!(seen.voices.len() + seen.missing.len(), KIT_VOICES);

        let bank = load(scratch.path(), 48_000).expect("the folder loads");
        assert!(bank.has(KitVoice::Kick) && bank.has(KitVoice::SnareHi));
        assert!(bank.has(KitVoice::HatOpen));
        // And the ones that are not there are not there — `jam.rs` is what
        // turns those back into the built-in kit.
        assert!(!bank.has(KitVoice::Ride));
        assert!(bank.voice(KitVoice::Ride).is_empty());
    }

    /// THE BAR-AHEAD SEND MUST NOT RE-DECODE THE FOLDER.
    ///
    /// The UI re-sends the whole config four to six times a chorus to keep
    /// the bass a bar ahead. Without the cache each of those would read and
    /// resample eight WAVs, which is a folder read per bar for the whole
    /// time a jam is playing.
    ///
    /// Measured on the bank's own identity rather than on a timer: the same
    /// folder must hand back the SAME decode, and a changed file must not.
    #[test]
    fn the_cache_hands_back_the_same_decode_until_a_file_changes() {
        let scratch = Scratch::new("cache");
        let kick = scratch.path().join("kick.wav");
        write_sine(&kick, 48_000, 1, 16, false, 80.0, 0.2, 0.5);

        let cache = KitCache::default();
        let first = cache.get_or_load(scratch.path(), 48_000).unwrap();
        for _ in 0..6 {
            let again = cache.get_or_load(scratch.path(), 48_000).unwrap();
            assert_eq!(first.id, again.id, "a repeated send re-decoded the folder");
            assert!(Arc::ptr_eq(&first, &again), "and handed back a different bank");
        }
        assert!(cache.is_holding(scratch.path(), 48_000));

        // A DIFFERENT OUTPUT RATE IS A DIFFERENT BANK. The samples are
        // resampled to the device's rate, so a device change has to
        // re-decode or the drums come out at the wrong pitch.
        let other = cache.get_or_load(scratch.path(), 44_100).unwrap();
        assert_ne!(first.id, other.id, "44.1 kHz reused the 48 kHz decode");
        assert_eq!(other.rate, 44_100);

        // AND A REPLACED FILE IS A DIFFERENT BANK. Keyed on the path alone,
        // the app would keep playing yesterday's kick until it restarted.
        //
        // The size changes as well as the mtime, deliberately: a filesystem
        // whose timestamps are whole seconds would otherwise make this test
        // depend on how fast the machine is.
        write_sine(&kick, 48_000, 1, 16, false, 90.0, 0.35, 0.5);
        let after = cache.get_or_load(scratch.path(), 48_000).unwrap();
        assert_ne!(
            first.id, after.id,
            "the kick was replaced on disk and the cache kept the old one"
        );
    }

    /// Stereo folds to mono by AVERAGE, not by sum.
    ///
    /// A sum would make every stereo file 6 dB hotter than the mono one
    /// beside it — and the peak normalisation would hide it on the meter
    /// while leaving it in the energy, which is the worst of both.
    #[test]
    fn two_channels_fold_to_their_average() {
        let scratch = Scratch::new("fold");
        let path = scratch.path().join("rim.wav");
        // Left is the tone, right is silence: an average puts the result at
        // half the amplitude, a sum leaves it at full.
        let spec = WavSpec {
            channels: 2,
            sample_rate: 48_000,
            bits_per_sample: 16,
            sample_format: SampleFormat::Int,
        };
        let mut w = WavWriter::create(&path, spec).unwrap();
        for i in 0..4_800 {
            let v = 0.5 * (2.0 * std::f64::consts::PI * 300.0 * i as f64 / 48_000.0).sin();
            w.write_sample((v * 32_768.0) as i16).unwrap();
            w.write_sample(0i16).unwrap();
        }
        w.finalize().unwrap();

        // The bank normalises, so the level itself is gone by the time
        // anyone can look at it; what survives is the SHAPE, and a summed
        // fold would have left the right channel's silence in it as a
        // half-wave. Compare against the same tone folded by hand.
        let bank = load(scratch.path(), 48_000).unwrap();
        let buf = bank.voice(KitVoice::Rim);
        let worst = buf
            .iter()
            .enumerate()
            .map(|(i, &s)| {
                let want = VOICE_PEAK
                    * (2.0 * std::f64::consts::PI * 300.0 * i as f64 / 48_000.0).sin() as f32;
                (s - want).abs()
            })
            .fold(0.0f32, f32::max);
        assert!(worst < 0.01, "the folded channel is off by {worst}");
    }
}
