//! The drums — a kit is a folder, whether the app ships it or you point at it.
//!
//! `plans/JAM_SOUND.md` is why this module changed shape. The first pass
//! shipped a kit as eight mono files with one sample per drum, and the
//! owner's verdict on it was "very underwhelming": one sample scaled
//! quieter is not a ghost note, identical hits in a row are a machine gun,
//! and an open hat that nothing closes smears across the bar. All three are
//! properties of the BANK, not of the mixer, so they are fixed here.
//!
//! A kit is now a folder with a `kit.json` in it:
//!
//! ```text
//! src-tauri/sounds/kits/<kit>/kit.json
//! src-tauri/sounds/kits/<kit>/<voice>.<layer>.<rr>.wav
//! ```
//!
//! `layer` 1 is the softest stroke and 4 the hardest; `rr` is the round
//! robin, so the same stroke twice in a row is two different recordings.
//! Eleven voices, stereo, at the device's rate, with a per-voice trim the
//! render tool measured and a choke set that says which drum silences which.
//!
//! **One loader for both.** `build.rs` walks the shipped folders and writes
//! `include_bytes!` for every file in them; a folder the musician points at
//! is read off disk. Both arrive here as a list of (file name, bytes) and
//! leave as the same [`KitBank`], so a shipped kit and somebody's own sample
//! pack cannot drift apart in what they support. That is also why adding a
//! kit to the app is adding a folder and touching no Rust at all.
//!
//! Three rules survive from the first pass and still shape everything:
//!
//! * **Nothing here may panic.** A folder can hold a truncated download, a
//!   32-bit-float render, an eight-channel stem or a WAV that is really an
//!   AIFF. Every one of those comes back as a `Result` with a sentence the
//!   UI can put on screen. That is why the decoding is `hound` rather than
//!   the `rodio` the click uses: rodio's WAV path narrows everything to
//!   `i16` and *panics* on a spec it does not implement.
//! * **Decoded once, off the audio thread, handed over like a table.** The
//!   bank is built in the `set_jam` command and carried inside the
//!   `Arc<JamTable>` that names it, so the drums and the samples behind them
//!   arrive together, swap together at the bar line and are retired together
//!   on a thread that may call `free()`.
//! * **Cached by folder and mtime.** The UI re-sends the whole config four
//!   to six times a chorus to keep the bass a bar ahead
//!   (`useJamSession.ts`); decoding a hundred and thirty-two WAVs on each of
//!   those would be a folder read per bar. [`KitCache`] makes all but the
//!   first a stat and an `Arc` clone.

use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::Deserialize;

use crate::engine::resample;

// ---------------------------------------------------------------------------
// The voices
// ---------------------------------------------------------------------------

/// How many drums a kit can have.
pub const KIT_VOICES: usize = 11;

/// One drum of a kit, in the order `plans/tasks/jam-v3/BRIEF.md` fixes.
///
/// Eleven and not eight: `hat_pedal` is the foot that closes the hat,
/// `ride_bell` is the top of a fill on the ride, and the two toms are what a
/// fill is made of. The order is the contract's and is the order a manifest
/// is read in; nothing else depends on it, because a bank is indexed by this
/// enum rather than by a table whose columns have to be kept in step.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum KitVoice {
    Kick,
    Snare,
    Rim,
    Hat,
    HatOpen,
    HatPedal,
    Ride,
    RideBell,
    Crash,
    TomHi,
    TomLo,
}

impl KitVoice {
    /// Every voice, in the contract's order.
    pub const ALL: [KitVoice; KIT_VOICES] = [
        Self::Kick,
        Self::Snare,
        Self::Rim,
        Self::Hat,
        Self::HatOpen,
        Self::HatPedal,
        Self::Ride,
        Self::RideBell,
        Self::Crash,
        Self::TomHi,
        Self::TomLo,
    ];

    /// The `<voice>` half of `<voice>.<layer>.<rr>.wav`, and the key a
    /// manifest names this drum by.
    pub fn file_name(self) -> &'static str {
        match self {
            Self::Kick => "kick",
            Self::Snare => "snare",
            Self::Rim => "rim",
            Self::Hat => "hat",
            Self::HatOpen => "hat_open",
            Self::HatPedal => "hat_pedal",
            Self::Ride => "ride",
            Self::RideBell => "ride_bell",
            Self::Crash => "crash",
            Self::TomHi => "tom_hi",
            Self::TomLo => "tom_lo",
        }
    }

    /// A name from a manifest or a file, or `None`. Case-insensitive,
    /// because a sample pack names its files the way its author felt like
    /// that day and renaming a hundred of them should not be the price of
    /// using one.
    pub fn from_name(name: &str) -> Option<Self> {
        let lower = name.trim().to_ascii_lowercase();
        Self::ALL.into_iter().find(|v| v.file_name() == lower)
    }

    /// This voice as a bit, for the choke masks.
    #[inline]
    pub fn bit(self) -> u16 {
        1 << (self as u16)
    }
}

/// Where a voice this kit does not have comes from instead.
///
/// The contract's list, and it is a list of MUSICAL substitutions rather
/// than of silences: a kit without a cross-stick still has to play a bossa,
/// and the nearest thing to a cross-stick is the softest snare in the
/// drawer. The gain beside each is what makes the substitution sound like
/// the voice it stands in for rather than like the drum it borrowed.
///
/// `hat_open` is the exception with a shape of its own: it falls back to the
/// closed hat and the LANE caps it at four ticks (`HAT_OPEN_CAP_TICKS` in
/// `jam.rs`), which is what the first pass already did.
///
/// `None` ends a chain: a kit with no kick has no kick, and inventing one
/// out of a tom would be the app playing something nobody recorded.
pub fn fallback_for(voice: KitVoice) -> Option<(KitVoice, u8, f32)> {
    match voice {
        // (voice, layer, gain)
        KitVoice::Rim => Some((KitVoice::Snare, 1, 1.0)),
        KitVoice::HatPedal => Some((KitVoice::Hat, 1, 0.5)),
        KitVoice::RideBell => Some((KitVoice::Ride, 0, 1.0)),
        KitVoice::TomLo => Some((KitVoice::TomHi, 0, 1.0)),
        KitVoice::TomHi => Some((KitVoice::Snare, 2, 0.8)),
        KitVoice::HatOpen => Some((KitVoice::Hat, 0, 1.0)),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// The numbers
// ---------------------------------------------------------------------------

/// The longest one drum may be.
///
/// Three seconds, up from the first pass's two, and the reason is the whole
/// point of this pass: **a crash is its decay** (`plans/JAM_SOUND.md` §2.5).
/// A cymbal cut at two seconds is the loudest tell in a synthesised kit, and
/// a recorded one whose wash is chopped sounds no better than the sine that
/// preceded it. Three seconds carries any crash in a licensed library down
/// to where a band covers it.
///
/// It is a cap and not a rejection because a sample pack's crash is very
/// often a ten-second wash with eight of them below −40 dB, and refusing
/// that folder would be refusing a good kit over a tail nobody hears.
pub const MAX_VOICE_SECS: f64 = 3.0;

/// How long the cut at [`MAX_VOICE_SECS`] takes to reach silence.
///
/// A cap that stopped mid-waveform would leave a step from whatever the
/// sample happened to be doing down to nothing, and a step is a click —
/// audible on every hit of that drum, and worst on a cymbal, which is
/// exactly the voice long enough to be cut. Five milliseconds is shorter
/// than any transient anybody would notice losing and long enough that the
/// edge is inaudible.
const CAP_FADE_SECS: f64 = 0.005;

/// The most audio one kit may declare, in decoded bytes.
///
/// **A sanity check on the folder, not a budget for the decode.** The decode
/// is already bounded by [`MAX_VOICE_SECS`] per file. Ninety-six megabytes
/// is what a four-layer, three-round-robin, eleven-voice stereo kit costs
/// with room to spare — the arithmetic is 132 files, and at half a second
/// each that is 25 MB — and anything far past it is the signature of a
/// folder somebody pointed at their sample library by mistake. Saying so is
/// kinder than silently playing the first three seconds of a hundred songs.
///
/// Up from 64 MB because a kit is stereo now and carries layers: the same
/// drums cost eight bytes a frame where they cost four, and there are up to
/// twelve files per voice where there was one.
pub const MAX_FOLDER_BYTES: u64 = 96 * 1024 * 1024;

/// The peak a folder of somebody's own samples is put on.
///
/// **A target for a folder, and nothing at all for a kit the app ships**,
/// and that difference is the whole difference between a kit somebody
/// measured and a kit somebody found:
///
/// * A shipped kit's levels ARE the recording. A soft layer is quieter than
///   a hard one because that is what a soft stroke is, and `trim_db` in the
///   manifest is the balance the render tool measured between the voices.
///   Touching either here would throw the pass's whole point away and put
///   the ghost note back at the backbeat's level. So a shipped voice is
///   decoded, resampled and trimmed, and its level is left exactly where
///   the render tool put it.
/// * A folder of somebody's own samples has no measured balance, and it may
///   be a quiet render or a hot one. So its voices are scaled so the LOUDEST
///   LAYER of each sits on this — per voice and not per file, so the
///   dynamics between the layers survive.
///
/// **THE PEAK THE SOURCE CARRIED IS THE PEAK THE BANK CARRIES**, whichever
/// branch decided it, and that is a level decision made on the way OUT of
/// the resampler rather than on the way in.
///
/// The resampler is not level-preserving on a bright transient. A windowed
/// sinc rings around one, and a kit is nothing but bright transients:
/// `tight`'s closed hat peaks at 0.900 in its own 44.1 kHz file and 1.12
/// resampled to 48 kHz; `raw`'s, which is brighter still, reaches half as
/// much again. Left alone, the same kit would be a different height on
/// every device, and the one drum that overshot would be the one drum in
/// the band that clipped before anything else was added to it.
///
/// So the ringing is divided back out — the same thing the shipped bank did
/// before these kits became folders, for the same reason. It is not free:
/// the overshoot is a sample or two of Gibbs and the division takes it off
/// the whole voice, so a rate whose ripple was large loses that much ENERGY
/// too. `raw`'s hat is the extreme at 3.6 dB between 44.1 and 48 kHz, and it
/// is extreme because that hat's content sits at the source's own Nyquist,
/// which is where a reconstruction filter has the least to work with. The
/// trade is deliberate: a predictable height on every device, against a
/// brightness that moves on the two brightest voices in the set.
pub const VOICE_PEAK: f32 = 0.9;

/// The bus drive a kit asks for when its manifest does not say.
///
/// See `jam.rs` for what drive does. 1.0 is the recorded kits' number: the
/// saturation is glue, not an effect. `raw` asks for more in its own
/// manifest, because "raw" is what that kit is for.
const DEFAULT_DRIVE: f32 = 1.0;

/// The voices a folder with no manifest chokes, by default.
///
/// A musician's folder carries no `kit.json`, so the one choke relationship
/// every drum kit in the world has is assumed rather than declared: the
/// closed hat and the foot close the open hat. Nothing else is guessed — a
/// choke nobody asked for is a drum going missing.
fn default_choked_by(voice: KitVoice) -> u16 {
    match voice {
        KitVoice::HatOpen => KitVoice::Hat.bit() | KitVoice::HatPedal.bit(),
        _ => 0,
    }
}

// ---------------------------------------------------------------------------
// The manifest
// ---------------------------------------------------------------------------

/// `kit.json`, as the contract spells it.
#[derive(Debug, Clone, Deserialize)]
pub struct KitManifest {
    pub id: String,
    #[serde(default)]
    pub name: String,
    /// Who played it and who recorded it. Shown in Settings › About, which
    /// is what a CC BY licence is paid in.
    #[serde(default)]
    pub credit: String,
    #[serde(default)]
    pub licence: String,
    /// What the render tool says the files are.
    ///
    /// **A description, not the fact.** The loader reads each file's own
    /// header and resamples to whatever the device asked for, so a manifest
    /// that disagrees with its folder changes nothing about what plays — but
    /// it is a render tool that went wrong, and [`check_declaration`] says so
    /// once rather than letting a kit ship half converted.
    #[serde(default)]
    pub rate: u32,
    #[serde(default)]
    pub channels: u16,
    /// How hard this kit is driven into the bus's tanh stage.
    ///
    /// Not in the contract's example manifest, and added rather than
    /// hard-coded: the contract asks for "1.0 for recorded kits and 1.6 for
    /// `raw`", and a number that belongs to one kit belongs in that kit's
    /// own file rather than in a match arm the engine has to grow every time
    /// a kit arrives.
    #[serde(default = "default_drive")]
    pub drive: f32,
    #[serde(default)]
    pub voices: std::collections::HashMap<String, VoiceManifest>,
}

fn default_drive() -> f32 {
    DEFAULT_DRIVE
}

fn default_rr() -> u8 {
    1
}

/// One voice's entry in `kit.json`.
#[derive(Debug, Clone, Deserialize)]
pub struct VoiceManifest {
    /// How many velocity layers, 1..4. Layer 1 is the softest.
    pub layers: u8,
    /// How many round robins per layer, 1..3.
    #[serde(default = "default_rr")]
    pub rr: u8,
    /// The balance the render tool measured, in decibels. Applied once here,
    /// when the bank is built, never per hit.
    #[serde(default)]
    pub trim_db: f32,
    /// Where this drum sits across the stereo picture, −1 hard left to 1
    /// hard right. Absent is centre, which is what a mono file has always
    /// been.
    #[serde(default)]
    pub pan: f32,
    /// The voices whose hit fades this one out over 20 ms.
    #[serde(default)]
    pub choked_by: Vec<String>,
}

/// The largest layer and round-robin numbers the format allows.
///
/// Four layers is what a velocity-switched library ships and more than an
/// ear can tell apart on a drum; three round robins is enough to stop the
/// brain flagging a repetition (`plans/JAM_SOUND.md` §2.3). They are bounds
/// and not preferences: a manifest asking for forty layers would be a
/// hundred megabytes of decode per voice.
pub const MAX_LAYERS: u8 = 4;
pub const MAX_RR: u8 = 3;

// ---------------------------------------------------------------------------
// The bank
// ---------------------------------------------------------------------------

/// One drum, at every layer and every round robin, ready for the audio
/// thread.
///
/// The buffers are stereo INTERLEAVED, at the device's rate: the mixer
/// reads `buf[2 * i]` and `buf[2 * i + 1]` off one cache line rather than
/// chasing two planes, and a mono source was duplicated when the bank was
/// built so the callback never has to ask which it is holding.
#[derive(Clone)]
pub struct VoiceBank {
    /// `layers × rr` buffers, indexed `layer * rr + robin`.
    buffers: Vec<Vec<f32>>,
    layers: u8,
    rr: u8,
    /// The pan, resolved into a pair of gains when the bank was built.
    /// Balance rather than a panning law: centre is (1, 1), so panning a
    /// drum can only take level away from one side and never add it to the
    /// other, and no kit can be made louder by being placed.
    pan_l: f32,
    pan_r: f32,
    /// Which voices' hits fade this one out. A bitmask of [`KitVoice::bit`],
    /// so the audio thread's question is an `&`.
    choked_by: u16,
}

impl VoiceBank {
    /// How many velocity layers this drum has, 1..=[`MAX_LAYERS`].
    #[inline]
    pub fn layers(&self) -> u8 {
        self.layers
    }

    /// How many round robins per layer, 1..=[`MAX_RR`].
    #[inline]
    pub fn rr(&self) -> u8 {
        self.rr
    }
}

/// A whole kit, decoded, resampled, trimmed and ready for the audio thread.
///
/// Voices the kit does not hold are `None`, and `jam.rs` resolves those
/// through [`fallback_for`] when the table is compiled — so a kit with no
/// cross-stick still plays a bossa, out of its own softest snare.
pub struct KitBank {
    /// Which decode this is. Unique for the life of the process, and never
    /// reused.
    ///
    /// It exists because `jam.rs` memoises the four-bar render that measures
    /// a table, and a folder path is not a key for that: replace
    /// `snare.wav` while the app is open and the path is the same, the
    /// samples are not, and the memo would hand back the old snare's peak
    /// forever. Hashing the decode rather than the path means a replaced
    /// file is a different table, which is what it is.
    ///
    /// An `Arc` pointer would nearly work and is the trap: the old bank is
    /// freed when the cache replaces it, and the allocator is entitled to
    /// hand the same address straight back.
    pub id: u64,
    voices: [Option<VoiceBank>; KIT_VOICES],
    /// The rate every buffer above was resampled to. Diagnostics, the cache
    /// key, and the reason a device change re-decodes rather than detuning.
    pub rate: u32,
    /// The kit's own id, name and credit, for the report and the About
    /// screen.
    pub id_name: String,
    pub name: String,
    pub credit: String,
    /// What the kit is licensed under. A CC BY kit is paid for in the About
    /// screen, so the licence travels with the drums rather than being
    /// something somebody has to remember.
    pub licence: String,
    /// How hard this kit is driven into the bus. See [`KitManifest::drive`].
    pub drive: f32,
    /// Which voices were found, with what they were found at. The report
    /// `inspect_kit_folder` puts on screen.
    pub found: Vec<FoundVoice>,
    /// How much audio this bank holds, in bytes. Reported so a kit that is
    /// quietly enormous is visible rather than mysterious.
    pub bytes: usize,
}

/// One line of a kit's report: this drum, at this many layers and round
/// robins.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FoundVoice {
    pub voice: String,
    pub layers: u8,
    pub rr: u8,
}

impl KitBank {
    /// The samples for one drum at one layer and one round robin, stereo
    /// interleaved — or an empty slice when the kit does not hold it.
    ///
    /// A bounds-free read on the audio thread: an empty slice is a voice
    /// that renders nothing, which is what a missing sound should do. The
    /// indices come off a [`crate::jam::JamSlot`] that was resolved when the
    /// table was compiled, so in practice they are always in range; the
    /// `get`s are what make that a property of this line rather than of
    /// arithmetic somewhere else.
    #[inline]
    pub fn sample(&self, voice: u8, layer: u8, robin: u8) -> &[f32] {
        match self.voices.get(voice as usize).and_then(|v| v.as_ref()) {
            Some(v) => v
                .buffers
                .get(layer as usize * v.rr as usize + robin as usize)
                .map_or(&[][..], |b| &b[..]),
            None => &[],
        }
    }

    /// This drum's bank, if the kit has it. Asked when the table is
    /// compiled, never on the audio thread.
    #[inline]
    pub fn voice(&self, v: KitVoice) -> Option<&VoiceBank> {
        self.voices[v as usize].as_ref()
    }

    /// Does this kit hold this drum?
    #[inline]
    pub fn has(&self, v: KitVoice) -> bool {
        self.voices[v as usize].is_some()
    }

    /// The pan gains for a voice, or centre.
    pub fn pan(&self, v: KitVoice) -> (f32, f32) {
        self.voice(v).map_or((1.0, 1.0), |b| (b.pan_l, b.pan_r))
    }

    /// Which voices' hits choke this one.
    pub fn choked_by(&self, v: KitVoice) -> u16 {
        self.voice(v).map_or(0, |b| b.choked_by)
    }
}

#[cfg(test)]
impl KitBank {
    /// A kit with the named voices in it, without a folder.
    ///
    /// For `jam.rs` and `engine.rs`, whose tests are about which SOUND a
    /// lane resolves to and how loud the band comes out, not about decoding:
    /// writing a hundred WAVs to disk to find out that a missing ride falls
    /// back to the ride's own substitute would be testing this module twice
    /// and that one not at all.
    ///
    /// `secs` is the length of every voice, and it is a parameter because
    /// the ceiling tests need it to be. [`MAX_VOICE_SECS`] is far longer
    /// than the longest drum this app ships, and a headroom figure measured
    /// on 50 ms bursts says nothing at all about a folder of three-second
    /// cymbals — the ring-out is the whole reason voices stack.
    ///
    /// The shape is a decaying sine and the frequency differs per voice.
    /// Both matter for the tests that measure a peak: eleven copies of one
    /// steady tone are phase-locked and add coherently, which is a signal no
    /// drum kit is and a fixture no allowance could ever cover.
    ///
    /// One layer and one round robin: a fixture with layers in it would be
    /// this module's job to build and is what `layers_and_round_robins`
    /// covers.
    pub fn for_tests(voices: &[KitVoice], rate: u32, secs: f64) -> Self {
        Self::layered_for_tests(voices, rate, secs, 1, 1)
    }

    /// [`KitBank::for_tests`] with layers and round robins, each one a
    /// different tone so a test can say WHICH buffer played.
    pub fn layered_for_tests(
        voices: &[KitVoice],
        rate: u32,
        secs: f64,
        layers: u8,
        rr: u8,
    ) -> Self {
        let mut slots: [Option<VoiceBank>; KIT_VOICES] = Default::default();
        let mut found = Vec::new();
        let mut bytes = 0;
        for v in voices {
            let n = (secs * rate as f64) as usize;
            let mut buffers = Vec::new();
            for l in 0..layers {
                for r in 0..rr {
                    // A layer is a LEVEL as well as a colour: layer 1 is the
                    // softest stroke, so the fixture is quieter there, the
                    // way a recording is.
                    let level = VOICE_PEAK as f64 * (0.4 + 0.6 * (l as f64 / layers.max(1) as f64));
                    let freq = 60.0 * 1.7f64.powi(*v as i32) * (1.0 + 0.01 * r as f64);
                    let mut buf = vec![0.0f32; n * 2];
                    for i in 0..n {
                        let t = i as f64 / rate as f64;
                        let env = (-t * (10.0f64).ln() / secs.max(1e-6)).exp();
                        let s = (level * env * (2.0 * std::f64::consts::PI * freq * t).sin()) as f32;
                        buf[2 * i] = s;
                        buf[2 * i + 1] = s;
                    }
                    bytes += buf.len() * 4;
                    buffers.push(buf);
                }
            }
            found.push(FoundVoice {
                voice: v.file_name().to_string(),
                layers,
                rr,
            });
            slots[*v as usize] = Some(VoiceBank {
                buffers,
                layers,
                rr,
                pan_l: 1.0,
                pan_r: 1.0,
                choked_by: default_choked_by(*v),
            });
        }
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1 << 32);
        Self {
            id: NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
            voices: slots,
            rate,
            id_name: "fixture".to_string(),
            name: "Fixture".to_string(),
            credit: String::new(),
            licence: String::new(),
            drive: DEFAULT_DRIVE,
            found,
            bytes,
        }
    }
}

impl std::fmt::Debug for KitBank {
    /// Without this the `Debug` on `JamTable` would print several megabytes
    /// of samples the first time anyone `dbg!`ed a table.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("KitBank")
            .field("id", &self.id)
            .field("kit", &self.id_name)
            .field("rate", &self.rate)
            .field("found", &self.found)
            .field("bytes", &self.bytes)
            .finish()
    }
}

// ---------------------------------------------------------------------------
// The kits the app ships
// ---------------------------------------------------------------------------

/// One shipped kit, as `build.rs` wrote it: the manifest's text and every
/// WAV beside it, keyed by lower-cased file name.
pub struct ShippedKit {
    pub manifest: &'static str,
    pub files: &'static [(&'static str, &'static [u8])],
}

include!(concat!(env!("OUT_DIR"), "/kits_generated.rs"));

/// Every shipped manifest, parsed once.
///
/// `set_jam` arrives four to six times a chorus and every one of them asks
/// which kit a name means; parsing five JSON files each time would be a
/// hundred microseconds of nothing, several times a bar, forever.
///
/// A manifest that does not parse is DROPPED rather than fatal, and the app
/// is left with the kits that do. A build whose `sounds/kits` is half
/// written should start and say which kits it has, not refuse to run.
/// Each entry is (which `SHIPPED_KITS` row, its parsed manifest), so a kit
/// that did not parse leaves no gap in the numbering the rest of the app
/// uses.
fn manifests() -> &'static [(usize, KitManifest)] {
    static PARSED: std::sync::OnceLock<Vec<(usize, KitManifest)>> = std::sync::OnceLock::new();
    PARSED.get_or_init(|| {
        SHIPPED_KITS
            .iter()
            .enumerate()
            .filter_map(|(i, k)| match parse_manifest(k.manifest) {
                Ok(m) => Some((i, m)),
                Err(e) => {
                    eprintln!("[kit] a shipped kit.json did not parse and was skipped: {e}");
                    None
                }
            })
            .collect()
    })
}

/// Every shipped kit's id, in the order `build.rs` found them (sorted, so
/// it is the same list on every machine).
///
/// The list a kit picker asks for. Nothing in the engine needs it — a config
/// names a kit and [`shipped_index`] finds it — so today it is the tests
/// that walk every kit the app ships, which is what they should be doing
/// now that the list is a directory rather than a table.
#[allow(dead_code)]
pub fn shipped_ids() -> Vec<String> {
    manifests().iter().map(|(_, m)| m.id.clone()).collect()
}

/// How many kits the app ships.
pub fn shipped_count() -> usize {
    manifests().len()
}

/// Which shipped kit a config's `kit` field names, or `None`.
pub fn shipped_index(name: &str) -> Option<usize> {
    let want = name.trim().to_ascii_lowercase();
    manifests().iter().position(|(_, m)| m.id == want)
}

/// The manifest of a shipped kit, by index.
pub fn shipped_manifest(index: usize) -> Option<&'static KitManifest> {
    manifests().get(index).map(|(_, m)| m)
}

/// Does a kit's manifest describe the files beside it?
///
/// Not fatal, and it cannot be: the loader reads every file's own header, so
/// a manifest that lies changes nothing about what plays. What it means is
/// that the render tool wrote one thing and produced another, and a kit
/// arriving half converted is worth a line on the console rather than a
/// silence. Called once per kit, when it is first decoded.
fn check_declaration(manifest: &KitManifest, rate: u32, channels: u16) {
    if manifest.rate != 0 && manifest.rate != rate {
        eprintln!(
            "[kit] {} says its files are {} Hz and they are {rate} Hz",
            manifest.id, manifest.rate
        );
    }
    if manifest.channels != 0 && manifest.channels != channels {
        eprintln!(
            "[kit] {} says its files are {}-channel and they are {channels}-channel",
            manifest.id, manifest.channels
        );
    }
}

/// Parse a `kit.json`. Every failure is a sentence, never a panic.
pub fn parse_manifest(text: &str) -> Result<KitManifest, String> {
    let mut m: KitManifest =
        serde_json::from_str(text).map_err(|e| format!("kit.json did not parse: {e}"))?;
    if m.id.trim().is_empty() {
        return Err("kit.json has no id, and a kit is named by its id".to_string());
    }
    m.id = m.id.trim().to_ascii_lowercase();
    if m.name.trim().is_empty() {
        m.name = m.id.clone();
    }
    if !m.drive.is_finite() || m.drive <= 0.0 {
        m.drive = DEFAULT_DRIVE;
    }
    for (name, v) in m.voices.iter_mut() {
        if KitVoice::from_name(name).is_none() {
            return Err(format!(
                "kit.json names a voice called {name:?}, and a kit has {}",
                KitVoice::ALL
                    .iter()
                    .map(|v| v.file_name())
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }
        v.layers = v.layers.clamp(1, MAX_LAYERS);
        v.rr = v.rr.clamp(1, MAX_RR);
        if !v.trim_db.is_finite() {
            v.trim_db = 0.0;
        }
        v.pan = if v.pan.is_finite() {
            v.pan.clamp(-1.0, 1.0)
        } else {
            0.0
        };
    }
    Ok(m)
}

/// Decode a shipped kit at `rate`.
///
/// The bytes are in the binary, so there is no disk to read and no error a
/// user can cause — but the same code path runs, because a shipped kit that
/// took a different road to the audio thread than a custom one is a shipped
/// kit whose bugs nobody's folder ever finds.
pub fn load_shipped(index: usize, rate: u32) -> Result<KitBank, String> {
    let (row, manifest) = manifests()
        .get(index)
        .ok_or_else(|| format!("there is no shipped kit number {index}"))?;
    let kit = &SHIPPED_KITS[*row];
    let manifest = manifest.clone();
    let entries: Vec<Entry> = kit
        .files
        .iter()
        .map(|(name, bytes)| Entry {
            name: (*name).to_string(),
            source: Source::Bytes(bytes),
        })
        .collect();
    build_bank(entries, rate, Some(manifest), false)
}

// ---------------------------------------------------------------------------
// Looking at a folder without decoding it
// ---------------------------------------------------------------------------

/// What a kit folder holds. The Rust half of `inspectKitFolder` in
/// `src/ipc.ts`.
///
/// `voices` and `missing` keep the shape the second pass shipped, so the
/// screen that reads them does not have to change to keep working; `found`
/// is what this pass adds — the same voices, with the layers and round
/// robins the folder actually has, which is the difference between "there
/// is a snare in here" and "there are four snares in here".
#[derive(Debug, Clone, serde::Serialize)]
pub struct KitFolder {
    /// Which voices were found, in [`KitVoice::ALL`] order.
    pub voices: Vec<String>,
    /// And which were not — the ones the fallbacks will cover.
    pub missing: Vec<String>,
    /// Each found voice with its layers and round robins.
    pub found: Vec<FoundVoice>,
}

/// Every `*.wav` in `dir`, as (lower-cased stem, path).
fn wavs_in(dir: &Path) -> Result<Vec<(String, PathBuf)>, String> {
    let entries =
        std::fs::read_dir(dir).map_err(|e| format!("could not read {}: {e}", dir.display()))?;
    let mut out = Vec::new();
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
            out.push((stem.to_string_lossy().to_ascii_lowercase(), path));
        }
    }
    // Sorted, so a folder is read in the same order twice and the "which
    // file won" question below has one answer rather than the filesystem's.
    out.sort();
    Ok(out)
}

/// Which drum a file name in a folder means, as (voice, layer, round robin).
///
/// The contract's naming, and today's names still work:
///
/// ```text
/// snare.wav        snare, layer 1, round robin 1   (the plain form)
/// snare.3.wav      snare, layer 3, round robin 1
/// snare.3.2.wav    snare, layer 3, round robin 2
/// snare_soft.wav   snare, layer 1                  (folders from before this pass)
/// ```
///
/// **`snare_soft.wav` is why the plain form is not always layer 1.** Before
/// this pass a folder said `snare.wav` for the backbeat and
/// `snare_soft.wav` for the ghosts, and both are layer names now. Read
/// literally, the two would land on the same layer and one would win. So
/// when a folder holds `snare_soft.wav`, a plain `snare.wav` is the HARDER
/// stroke and goes to layer 2, which is exactly the pair that folder always
/// meant. A folder without `snare_soft.wav` reads `snare.wav` as layer 1 and
/// the layer filling covers the rest.
fn parse_file_name(stem: &str, has_snare_soft: bool) -> Option<(KitVoice, u8, u8)> {
    let mut parts = stem.split('.');
    let head = parts.next()?;
    // `snare_soft` is the one alias, and it is the one folders in the wild
    // already use.
    let (voice, base_layer) = if head == "snare_soft" {
        (KitVoice::Snare, 1)
    } else {
        let v = KitVoice::from_name(head)?;
        let base = if v == KitVoice::Snare && has_snare_soft {
            2
        } else {
            1
        };
        (v, base)
    };
    let layer = match parts.next() {
        Some(s) => s.parse::<u8>().ok()?,
        None => base_layer,
    };
    let robin = match parts.next() {
        Some(s) => s.parse::<u8>().ok()?,
        None => 1,
    };
    if parts.next().is_some() {
        return None;
    }
    if !(1..=MAX_LAYERS).contains(&layer) || !(1..=MAX_RR).contains(&robin) {
        return None;
    }
    Some((voice, layer, robin))
}

/// Which voices this folder holds, and at what depth, without decoding a
/// sample.
///
/// The UI calls this while the musician is still choosing, so it is a
/// directory listing and nothing more: opening a hundred WAVs to answer "is
/// there a ride in here" would put a disk read in front of a hover.
pub fn inspect(dir: &Path) -> Result<KitFolder, String> {
    let files = wavs_in(dir)?;
    let has_soft = files.iter().any(|(s, _)| s == "snare_soft");
    let mut depth: [Option<(u8, u8)>; KIT_VOICES] = [None; KIT_VOICES];
    for (stem, _) in files.iter() {
        if let Some((voice, layer, robin)) = parse_file_name(stem, has_soft) {
            let slot = &mut depth[voice as usize];
            let (l, r) = slot.unwrap_or((0, 0));
            *slot = Some((l.max(layer), r.max(robin)));
        }
    }
    let mut voices = Vec::new();
    let mut missing = Vec::new();
    let mut found = Vec::new();
    for v in KitVoice::ALL {
        match depth[v as usize] {
            Some((layers, rr)) => {
                voices.push(v.file_name().to_string());
                found.push(FoundVoice {
                    voice: v.file_name().to_string(),
                    layers,
                    rr,
                });
            }
            None => missing.push(v.file_name().to_string()),
        }
    }
    Ok(KitFolder {
        voices,
        missing,
        found,
    })
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/// Where one file's bytes come from: the binary, or the musician's disk.
enum Source {
    Bytes(&'static [u8]),
    File(PathBuf),
}

/// One file on its way into a bank.
struct Entry {
    name: String,
    source: Source,
}

/// One WAV as interleaved stereo, at its own rate.
///
/// Handles what a musician's folder actually contains: 8-, 16-, 24- and
/// 32-bit PCM and 32-bit float, any channel count, any rate. Anything else
/// comes back as a message rather than a panic.
///
/// **Stereo, because a kit in a room is stereo** (`plans/JAM_SOUND.md`
/// §2.8). A mono file is duplicated to both sides here, once, so the mixer
/// never asks how many channels a buffer has. More than two channels are
/// folded to two by averaging the odd and even ones — an eight-channel
/// DrumGizmo stem is not a thing this app plays, but it is a thing somebody
/// will drop in a folder, and half a kit is better than a refusal.
///
/// [`MAX_VOICE_SECS`] is applied HERE, at the source rate and before a
/// sample past it is read, so a ten-second crash costs three seconds of
/// decoding and three of sinc rather than ten of each.
///
/// A sample that WAS cut is faded out over [`CAP_FADE_SECS`] on the way, so
/// the cap is a decision about length and not a click.
fn decode_stereo(name: &str, source: &Source) -> Result<(Vec<f32>, u32), String> {
    let mut reader = match source {
        Source::Bytes(b) => hound::WavReader::new(Cursor::new(*b))
            .map(ReaderKind::Mem)
            .map_err(|e| format!("{name} could not be opened as a WAV: {e}"))?,
        Source::File(p) => hound::WavReader::open(p)
            .map(ReaderKind::Disk)
            .map_err(|e| format!("{name} could not be opened as a WAV: {e}"))?,
    };
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
    let raw = reader.samples(want, name)?;
    if raw.is_empty() {
        return Err(format!("{name} holds no audio at all"));
    }

    // Interleave to exactly two channels. A mono file goes to both sides; a
    // stereo one passes through; anything wider is folded by averaging the
    // even channels into the left and the odd into the right, which for a
    // multi-mic stem is the nearest thing to an overhead pair this module
    // can honestly claim.
    let frames = raw.len() / channels;
    let mut out = vec![0.0f32; frames * 2];
    match channels {
        1 => {
            for (i, s) in raw.iter().take(frames).enumerate() {
                out[2 * i] = *s;
                out[2 * i + 1] = *s;
            }
        }
        2 => out[..frames * 2].copy_from_slice(&raw[..frames * 2]),
        n => {
            for i in 0..frames {
                let frame = &raw[i * n..i * n + n];
                let (mut l, mut r, mut nl, mut nr) = (0.0f32, 0.0f32, 0, 0);
                for (c, s) in frame.iter().enumerate() {
                    if c % 2 == 0 {
                        l += *s;
                        nl += 1;
                    } else {
                        r += *s;
                        nr += 1;
                    }
                }
                out[2 * i] = l / nl.max(1) as f32;
                out[2 * i + 1] = r / nr.max(1) as f32;
            }
        }
    }

    // THE CAP IS A DECISION ABOUT LENGTH, NOT A CLICK. Three seconds into a
    // ten-second cymbal wash the waveform is still going, and stopping there
    // leaves a step straight down to nothing — broadband, on every hit of
    // the one voice long enough to be cut. Only when the file WAS cut: a
    // sample that simply ends where it ends is the musician's own decision.
    if file_frames > max_frames {
        let fade = ((CAP_FADE_SECS * spec.sample_rate as f64) as usize).min(frames);
        if fade > 1 {
            let start = frames - fade;
            for i in 0..fade {
                let g = 1.0 - (i as f32 / (fade - 1) as f32);
                out[2 * (start + i)] *= g;
                out[2 * (start + i) + 1] *= g;
            }
        }
    }
    Ok((out, spec.sample_rate))
}

/// A `hound` reader over bytes or over a file — the same three arms of
/// sample format either way, written once.
enum ReaderKind {
    Mem(hound::WavReader<Cursor<&'static [u8]>>),
    Disk(hound::WavReader<std::io::BufReader<std::fs::File>>),
}

impl ReaderKind {
    fn spec(&self) -> hound::WavSpec {
        match self {
            Self::Mem(r) => r.spec(),
            Self::Disk(r) => r.spec(),
        }
    }

    fn duration(&self) -> u32 {
        match self {
            Self::Mem(r) => r.duration(),
            Self::Disk(r) => r.duration(),
        }
    }

    /// The first `want` interleaved samples, as f32 in −1..1.
    fn samples(&mut self, want: usize, name: &str) -> Result<Vec<f32>, String> {
        let spec = self.spec();
        macro_rules! read {
            ($r:expr) => {
                match spec.sample_format {
                    hound::SampleFormat::Float => {
                        if spec.bits_per_sample != 32 {
                            return Err(format!(
                                "{name} is {}-bit float, and only 32-bit float is a thing \
                                 WAV files really are",
                                spec.bits_per_sample
                            ));
                        }
                        $r.samples::<f32>()
                            .take(want)
                            .collect::<Result<Vec<f32>, _>>()
                            .map_err(|e| format!("{name} stopped decoding partway through: {e}"))?
                    }
                    hound::SampleFormat::Int => {
                        let bits = spec.bits_per_sample;
                        if !(1..=32).contains(&bits) {
                            return Err(format!("{name} is {bits}-bit, which is not a WAV depth"));
                        }
                        // 2^(bits−1) — the magnitude of the most negative
                        // sample, which is the divisor that puts full scale
                        // exactly on 1.0.
                        let full = (1i64 << (bits - 1)) as f32;
                        $r.samples::<i32>()
                            .take(want)
                            .map(|s| s.map(|v| v as f32 / full))
                            .collect::<Result<Vec<f32>, _>>()
                            .map_err(|e| format!("{name} stopped decoding partway through: {e}"))?
                    }
                }
            };
        }
        Ok(match self {
            Self::Mem(r) => read!(r),
            Self::Disk(r) => read!(r),
        })
    }
}

/// A windowed sinc whose kernel is worked out once instead of per sample.
///
/// **THE SAME FILTER `engine::resample` IS, AND IT HAD TO STOP BEING THE
/// SAME CODE.** That one computes thirty-two taps — a `sin`, two `cos` and a
/// division each — for every output sample it produces. That is the right
/// shape for what it is for: a couple of thousand samples of click, once,
/// when a device opens. A recorded kit is a hundred and thirty-two stereo
/// files, and the same arithmetic measured **2.2 seconds** on one — on the
/// main thread, in `set_jam`, with the window not repainting.
///
/// The taps do not actually vary per sample. Between two rates there are
/// only as many distinct sub-sample positions as the denominator of the
/// ratio in lowest terms: 44.1 kHz to 48 is 147/160, so there are a hundred
/// and sixty phases and every output sample is one of them. Computing them
/// once and indexing takes the same decode from 2.2 seconds to **112 ms**,
/// and the filter is tap for tap the one it replaces — the resampling error
/// it leaves against an analytic sine is the same −122.5 dB RMS it was
/// before, which `the_decoder_resamples_44_kilohertz_to_48_within_a_measurable_error`
/// holds it to.
struct Resampler {
    /// `phases × TAPS` taps, already normalised by the sum of their own
    /// phase — which is what keeps the level steady at the edges, where
    /// half the kernel hangs off the end of the sample.
    taps: Vec<f32>,
    /// The ratio in lowest terms: output position `i` sits at `i × num / den`
    /// source samples in.
    num: u64,
    den: u64,
}

/// Half-width in source samples, and the same 16 `engine::resample` uses.
/// Well past the point where the stop-band of a Blackman-windowed sinc stops
/// being the limiting factor.
const HALF: i64 = 16;
const TAPS: usize = (HALF * 2) as usize;

/// Above this many phases the kernel is bigger than the audio. No rate any
/// device hands out comes near it — 44.1 to 96 kHz is 320 — and a device
/// that asked for 48001 Hz gets the straightforward path instead of a
/// twelve-megabyte table.
const MAX_PHASES: u64 = 4096;

impl Resampler {
    fn new(from: u32, to: u32) -> Option<Self> {
        fn gcd(a: u64, b: u64) -> u64 {
            if b == 0 {
                a
            } else {
                gcd(b, a % b)
            }
        }
        let g = gcd(from as u64, to as u64).max(1);
        let (num, den) = (from as u64 / g, to as u64 / g);
        if den > MAX_PHASES {
            return None;
        }
        // Downsampling has to band-limit to the NEW Nyquist, or it aliases.
        let ratio = to as f64 / from as f64;
        let cutoff = if ratio < 1.0 { ratio } else { 1.0 };
        let mut taps = vec![0.0f32; den as usize * TAPS];
        for phase in 0..den as usize {
            let frac = phase as f64 / den as f64;
            let mut row = [0.0f64; TAPS];
            let mut norm = 0.0f64;
            for (j, tap) in row.iter_mut().enumerate() {
                // The distance from this tap to the point being sampled.
                let x = frac + (HALF - 1) as f64 - j as f64;
                let sinc = if x.abs() < 1e-9 {
                    cutoff
                } else {
                    (std::f64::consts::PI * cutoff * x).sin() / (std::f64::consts::PI * x)
                };
                // Blackman, over the whole kernel.
                let t = (x + HALF as f64) / (2.0 * HALF as f64);
                let w = if !(0.0..=1.0).contains(&t) {
                    0.0
                } else {
                    0.42 - 0.5 * (2.0 * std::f64::consts::PI * t).cos()
                        + 0.08 * (4.0 * std::f64::consts::PI * t).cos()
                };
                *tap = sinc * w;
                norm += *tap;
            }
            if norm.abs() > 1e-9 {
                for (j, tap) in row.iter().enumerate() {
                    taps[phase * TAPS + j] = (*tap / norm) as f32;
                }
            }
        }
        Some(Self { taps, num, den })
    }

    /// How many output frames `frames` source frames become.
    fn out_len(&self, frames: usize) -> usize {
        (frames as f64 * self.den as f64 / self.num as f64).ceil() as usize
    }

    /// One interleaved stereo buffer, resampled.
    ///
    /// Both channels through the same walk, because the phase and the window
    /// are the same for both and walking twice would read the kernel twice.
    fn stereo(&self, interleaved: &[f32]) -> Vec<f32> {
        let frames = interleaved.len() / 2;
        let n = self.out_len(frames);
        let mut out = vec![0.0f32; n * 2];
        for i in 0..n {
            let at = i as u64 * self.num;
            let centre = (at / self.den) as i64;
            let row = (at % self.den) as usize * TAPS;
            let first = centre - HALF + 1;
            let (mut l, mut r) = (0.0f32, 0.0f32);
            for j in 0..TAPS {
                let k = first + j as i64;
                if k < 0 || k as usize >= frames {
                    continue;
                }
                let tap = self.taps[row + j];
                l += interleaved[2 * k as usize] * tap;
                r += interleaved[2 * k as usize + 1] * tap;
            }
            out[2 * i] = l;
            out[2 * i + 1] = r;
        }
        out
    }
}

/// Resample an interleaved stereo buffer.
///
/// Channel by channel when the rates are awkward enough that the kernel
/// cannot be tabulated, because [`crate::engine::resample`] is a windowed
/// sinc over one stream and interleaving two through it would be a comb
/// filter rather than a conversion.
fn resample_stereo(interleaved: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to {
        return interleaved.to_vec();
    }
    if let Some(r) = Resampler::new(from, to) {
        return r.stereo(interleaved);
    }
    let frames = interleaved.len() / 2;
    let left: Vec<f32> = (0..frames).map(|i| interleaved[2 * i]).collect();
    let right: Vec<f32> = (0..frames).map(|i| interleaved[2 * i + 1]).collect();
    let l = resample(&left, from, to);
    let r = resample(&right, from, to);
    let n = l.len().min(r.len());
    let mut out = vec![0.0f32; n * 2];
    for i in 0..n {
        out[2 * i] = l[i];
        out[2 * i + 1] = r[i];
    }
    out
}

// ---------------------------------------------------------------------------
// Building a bank
// ---------------------------------------------------------------------------

/// Decode a list of files into a bank at `rate`.
///
/// `manifest` is the shipped kit's `kit.json`, or `None` for a folder of the
/// musician's own samples — which has no manifest, so its layers, round
/// robins, trims and chokes come from the file names and the defaults.
///
/// `normalise` is the difference between a kit somebody measured and a kit
/// somebody found. See [`VOICE_PEAK`].
///
/// Runs on the command thread, in `set_jam`, and never on the audio thread.
fn build_bank(
    entries: Vec<Entry>,
    rate: u32,
    manifest: Option<KitManifest>,
    normalise: bool,
) -> Result<KitBank, String> {
    // ---- Which file is which drum ----
    let has_soft = entries.iter().any(|e| e.name.starts_with("snare_soft."));
    // `[voice][layer][rr]` while the files are being placed. `MAX_LAYERS`
    // and `MAX_RR` wide so a manifest cannot make this allocate per file.
    let mut grid: Vec<Vec<Vec<Option<Vec<f32>>>>> = (0..KIT_VOICES)
        .map(|_| {
            (0..MAX_LAYERS as usize)
                .map(|_| (0..MAX_RR as usize).map(|_| None).collect())
                .collect()
        })
        .collect();

    // The peak each voice carried BEFORE anything was resampled, which is
    // the peak its files carry and the one the bank is put back on. See
    // [`VOICE_PEAK`].
    let mut source_peak = [0.0f32; KIT_VOICES];
    // What the files actually turned out to be, so a manifest that describes
    // something else can be reported. See [`check_declaration`].
    let mut declared_once = false;
    for entry in entries.iter() {
        let stem = entry.name.rsplit_once('.').map_or(&entry.name[..], |(s, _)| s);
        let Some((voice, layer, robin)) = parse_file_name(stem, has_soft) else {
            continue;
        };
        let (mut buf, src_rate) = decode_stereo(&entry.name, &entry.source)?;
        if !declared_once {
            declared_once = true;
            if let Some(ref m) = manifest {
                // Two, because `decode_stereo` has already folded whatever
                // the file was into a pair — the manifest is being checked
                // against the format the loader guarantees, which is the
                // only thing a kit can be described as.
                check_declaration(m, src_rate, 2);
            }
        }
        let before = buf.iter().fold(0.0f32, |m, s| m.max(s.abs()));
        source_peak[voice as usize] = source_peak[voice as usize].max(before);
        if src_rate != rate {
            buf = resample_stereo(&buf, src_rate, rate);
        }
        grid[voice as usize][layer as usize - 1][robin as usize - 1] = Some(buf);
    }

    // ---- Fill the gaps, trim, and place ----
    let mut voices: [Option<VoiceBank>; KIT_VOICES] = Default::default();
    let mut found = Vec::new();
    let mut bytes = 0usize;
    for v in KitVoice::ALL {
        let declared = manifest
            .as_ref()
            .and_then(|m| m.voices.get(v.file_name()).cloned());
        // What the files actually carry, which is what the bank is built
        // from: a manifest saying four layers over a folder holding two is a
        // description that went stale, and the samples are the fact.
        let present: Vec<(usize, usize)> = (0..MAX_LAYERS as usize)
            .flat_map(|l| (0..MAX_RR as usize).map(move |r| (l, r)))
            .filter(|(l, r)| grid[v as usize][*l][*r].is_some())
            .collect();
        if present.is_empty() {
            continue;
        }
        let layers = present.iter().map(|(l, _)| l + 1).max().unwrap_or(1);
        let rr = present.iter().map(|(_, r)| r + 1).max().unwrap_or(1);

        // MISSING LAYERS ARE FILLED FROM THE NEAREST PRESENT ONE, and
        // missing round robins from round robin 1 of their own layer. Both
        // are the contract's rule and both are what a half-filled folder
        // needs: a pack with a soft and a hard snare and nothing between
        // should play four levels, not two and two silences.
        let mut buffers: Vec<Vec<f32>> = Vec::with_capacity(layers * rr);
        for l in 0..layers {
            // The nearest layer that has anything at all, preferring a
            // softer one on a tie — a stroke you do not have is better
            // played quieter than louder.
            let source_layer = (0..layers)
                .filter(|c| (0..rr).any(|r| grid[v as usize][*c][r].is_some()))
                .min_by_key(|c| (c.abs_diff(l), *c))
                .unwrap_or(0);
            for r in 0..rr {
                let take = grid[v as usize][source_layer][r]
                    .clone()
                    .or_else(|| grid[v as usize][source_layer][0].clone())
                    .or_else(|| {
                        (0..rr)
                            .find_map(|k| grid[v as usize][source_layer][k].clone())
                    })
                    .unwrap_or_default();
                buffers.push(take);
            }
        }

        // A drum that decoded to nothing is a message, not a lane that
        // silently stops playing.
        if source_peak[v as usize] <= 0.0 {
            return Err(format!("{} is silent", v.file_name()));
        }
        // A KIT IS THE SAME KIT ON EVERY DEVICE, and what "the same" means
        // is ENERGY. See [`VOICE_PEAK`]: the level is decided on the peak
        // the SOURCE files carried, before the resampler had a chance to
        // ring around a transient, so nothing here depends on the rate the
        // device happened to open at.
        // Where this voice ends up, and it is the same height at every
        // rate. See [`VOICE_PEAK`].
        let target = if normalise {
            // A folder has no measured balance, so its loudest layer goes on
            // the target whatever its render level was.
            VOICE_PEAK
        } else {
            // ...and a shipped kit keeps exactly the height the render tool
            // measured, which is what its own files carry.
            source_peak[v as usize]
        };
        // The peak AFTER the resampler, because that is the buffer the audio
        // thread will read and the ringing is what has to come back out.
        let after = buffers
            .iter()
            .flat_map(|b| b.iter())
            .fold(0.0f32, |m, s| m.max(s.abs()));
        let level = if after > 0.0 { target / after } else { 1.0 };
        // And the balance the render tool measured, on top. `trim_db` is the
        // kit's own business; the LANE trims (a ride sits under a hat) live
        // in `jam.rs`, because they are true of every kit.
        let trim = declared
            .as_ref()
            .map_or(1.0, |d| 10f32.powf(d.trim_db / 20.0));
        let g = level * trim;
        if (g - 1.0).abs() > 1e-6 {
            for b in buffers.iter_mut() {
                for s in b.iter_mut() {
                    *s *= g;
                }
            }
        }

        let pan = declared.as_ref().map_or(0.0, |d| d.pan);
        let choked_by = match declared.as_ref() {
            Some(d) if !d.choked_by.is_empty() => d
                .choked_by
                .iter()
                .filter_map(|n| KitVoice::from_name(n))
                .fold(0u16, |m, c| m | c.bit()),
            // A manifest that says nothing chokes nothing; a folder with no
            // manifest at all gets the one relationship every kit has.
            Some(_) => 0,
            None => default_choked_by(v),
        };

        bytes += buffers.iter().map(|b| b.len() * 4).sum::<usize>();
        found.push(FoundVoice {
            voice: v.file_name().to_string(),
            layers: layers as u8,
            rr: rr as u8,
        });
        voices[v as usize] = Some(VoiceBank {
            buffers,
            layers: layers as u8,
            rr: rr as u8,
            pan_l: 1.0 - pan.max(0.0),
            pan_r: 1.0 + pan.min(0.0),
            choked_by,
        });
    }

    if found.is_empty() {
        return Err("that kit holds no drums at all".to_string());
    }

    // One per decode, for the life of the process. Relaxed because nothing
    // is ordered against it: all that is asked of it is that no two banks
    // ever get the same number.
    static NEXT_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
    let (id_name, name, credit, licence, drive) = match manifest {
        Some(ref m) => (
            m.id.clone(),
            m.name.clone(),
            m.credit.clone(),
            m.licence.clone(),
            m.drive,
        ),
        None => (
            "custom".to_string(),
            "Your kit".to_string(),
            String::new(),
            // A folder on the musician's own machine is theirs, and the app
            // has nothing to say about its licence.
            String::new(),
            DEFAULT_DRIVE,
        ),
    };
    Ok(KitBank {
        id: NEXT_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
        voices,
        rate,
        id_name,
        name,
        credit,
        licence,
        drive,
        found,
        bytes,
    })
}

/// `own` with everything it is missing borrowed from `behind`.
///
/// A FOLDER IS A KIT WITH A KIT BEHIND IT (`plans/JAM_UX_DECISIONS.md` B3):
/// a musician who drops a kick and a snare they like into a folder has a
/// real kit whose hats come from the app, not a band with two drums. The
/// borrowing happens here, once, on the command thread, and what comes out
/// is ONE bank — so the audio thread reads one kit and never asks which half
/// a drum came from, and the fallback chain in `jam.rs` only has to deal
/// with voices neither kit has.
///
/// Returns `own` untouched when it holds everything, which is the common
/// case and costs an `Arc` clone.
pub fn with_fallback(own: &Arc<KitBank>, behind: &Arc<KitBank>) -> Arc<KitBank> {
    if KitVoice::ALL.into_iter().all(|v| own.has(v)) {
        return own.clone();
    }
    let mut voices: [Option<VoiceBank>; KIT_VOICES] = Default::default();
    let mut found = Vec::new();
    let mut bytes = 0usize;
    for v in KitVoice::ALL {
        // The musician's own, or the kit behind it. Never a blend: a snare
        // whose soft layer came from somebody else's drum would be two
        // instruments pretending to be one.
        let take = own.voice(v).or_else(|| behind.voice(v));
        if let Some(b) = take {
            bytes += b.buffers.iter().map(|x| x.len() * 4).sum::<usize>();
            found.push(FoundVoice {
                voice: v.file_name().to_string(),
                layers: b.layers,
                rr: b.rr,
            });
            voices[v as usize] = Some(b.clone());
        }
    }
    static NEXT_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1 << 48);
    Arc::new(KitBank {
        // A DIFFERENT DECODE, and it has to be: the memo in `jam.rs` keys a
        // four-bar measurement on this number, and a folder played over
        // `room` and the same folder played over `brushes` are two different
        // bands that would otherwise share one id.
        id: NEXT_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
        voices,
        rate: own.rate,
        id_name: own.id_name.clone(),
        name: own.name.clone(),
        credit: own.credit.clone(),
        licence: own.licence.clone(),
        // The musician's own drive, not the kit they borrowed from: the
        // folder is the kit, and `raw` lending it a ride should not also
        // lend it a fuzz box.
        drive: own.drive,
        found,
        bytes,
    })
}

/// Decode a folder of the musician's own samples into a bank at `rate`.
///
/// Every error is a sentence the UI can show; a folder with none of the
/// voice names in it is one of them, because silently falling back to a
/// shipped kit would look exactly like the feature not working.
pub fn load(dir: &Path, rate: u32) -> Result<KitBank, String> {
    load_capped(dir, rate, MAX_FOLDER_BYTES)
}

/// [`load`] with the size cap as an argument.
///
/// Split out for one reason: the test that proves the cap refuses a folder
/// would otherwise have to WRITE ninety-six megabytes of WAV to disk to
/// reach it, which is a slow test of an arithmetic comparison.
fn load_capped(dir: &Path, rate: u32, max_bytes: u64) -> Result<KitBank, String> {
    let files = wavs_in(dir)?;
    let has_soft = files.iter().any(|(s, _)| s == "snare_soft");
    let present: Vec<(String, PathBuf)> = files
        .into_iter()
        .filter(|(stem, _)| parse_file_name(stem, has_soft).is_some())
        .collect();
    if present.is_empty() {
        return Err(format!(
            "{} holds none of {} as a .wav",
            dir.display(),
            KitVoice::ALL
                .iter()
                .map(|v| v.file_name())
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    // ---- The size cap, from the headers, before a single sample is read ----
    let mut declared: u64 = 0;
    for (stem, path) in present.iter() {
        let reader = hound::WavReader::open(path)
            .map_err(|e| format!("{stem}.wav could not be opened as a WAV: {e}"))?;
        // Frames × eight bytes: what this file will cost as stereo `f32`.
        declared = declared.saturating_add(reader.duration() as u64 * 8);
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

    let entries: Vec<Entry> = present
        .into_iter()
        .map(|(stem, path)| Entry {
            name: format!("{stem}.wav"),
            source: Source::File(path),
        })
        .collect();
    build_bank(entries, rate, None, true)
}

// ---------------------------------------------------------------------------
// The cache
// ---------------------------------------------------------------------------

/// What a cached bank was built from.
#[derive(PartialEq, Eq)]
enum Key {
    /// A shipped kit, by index and rate. Nothing about it can change while
    /// the app runs — the bytes are in the binary.
    Shipped(usize, u32),
    /// A folder, the rate it was decoded at, and every file's size and
    /// modification time.
    ///
    /// The mtimes are the point. A cache keyed on the path alone would keep
    /// playing yesterday's snare after the musician replaced the file, and
    /// the only way to find out would be to restart the app.
    Folder {
        dir: PathBuf,
        rate: u32,
        stamps: Vec<(String, u64, u128)>,
    },
}

/// A modification time as a number, to the NANOSECOND.
///
/// Whole seconds is not enough resolution to be a cache key. Every write
/// this cache has to notice happens while the app is open and the musician
/// is working: render a snare out of a DAW, drop it in the folder, hear it.
/// Two writes inside the same second — which is most of them — carry the
/// same whole-second stamp, and if the file also happens to come out the
/// same length the key does not move and the app keeps playing the old
/// snare until it restarts.
fn stamp(modified: Option<std::time::SystemTime>) -> u128 {
    modified
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

/// Stat the folder and build the key. Cheap enough to run on every
/// `set_jam`; a folder read and a `metadata` call per file is microseconds,
/// and it is what makes the bar-ahead sends free.
fn key_for(dir: &Path, rate: u32) -> Result<Key, String> {
    let files = wavs_in(dir)?;
    let has_soft = files.iter().any(|(s, _)| s == "snare_soft");
    let mut stamps = Vec::new();
    for (stem, path) in files.iter() {
        if parse_file_name(stem, has_soft).is_none() {
            continue;
        }
        let meta = std::fs::metadata(path)
            .map_err(|e| format!("could not read {}: {e}", path.display()))?;
        stamps.push((stem.clone(), meta.len(), stamp(meta.modified().ok())));
    }
    Ok(Key::Folder {
        dir: dir.to_path_buf(),
        rate,
        stamps,
    })
}

/// How many decodes the cache keeps.
///
/// Three, and each of them earns its place: the kit the jam is playing, the
/// kit it was playing a moment ago (a musician auditioning kits goes back
/// and forth), and one more so a folder does not evict the shipped kit it is
/// being compared against. A fourth would be memory spent on a move nobody
/// makes.
const CACHE_ENTRIES: usize = 3;

/// The kits the app has already decoded.
#[derive(Default)]
pub struct KitCache {
    // A `Mutex` and not a lock-free anything: this is the command thread's
    // and only the command thread's. The audio thread never sees it — it
    // sees the `Arc<KitBank>` inside the table it was handed.
    entries: Mutex<Vec<(Key, Arc<KitBank>)>>,
}

impl KitCache {
    fn cached(&self, key: &Key) -> Option<Arc<KitBank>> {
        let mut slot = self.entries.lock().ok()?;
        let at = slot.iter().position(|(k, _)| k == key)?;
        // Most recently used to the front, so the kit being played survives
        // an audition of two others.
        let entry = slot.remove(at);
        let bank = entry.1.clone();
        slot.insert(0, entry);
        Some(bank)
    }

    fn store(&self, key: Key, bank: Arc<KitBank>) {
        if let Ok(mut slot) = self.entries.lock() {
            slot.insert(0, (key, bank));
            slot.truncate(CACHE_ENTRIES);
        }
    }

    /// One of the kits the app ships, at this rate.
    pub fn shipped(&self, index: usize, rate: u32) -> Result<Arc<KitBank>, String> {
        let key = Key::Shipped(index, rate);
        if let Some(bank) = self.cached(&key) {
            return Ok(bank);
        }
        let bank = Arc::new(load_shipped(index, rate)?);
        self.store(key, bank.clone());
        Ok(bank)
    }

    /// The bank for this folder at this rate, decoding it only if the
    /// folder, one of its files or the output rate has changed since last
    /// time.
    pub fn get_or_load(&self, dir: &Path, rate: u32) -> Result<Arc<KitBank>, String> {
        let key = key_for(dir, rate)?;
        if let Some(bank) = self.cached(&key) {
            return Ok(bank);
        }
        let bank = Arc::new(load(dir, rate)?);
        self.store(key, bank.clone());
        Ok(bank)
    }

    /// Is this folder's decode the one the cache is holding? Tests only — it
    /// is the only way to say "the bar-ahead send did not re-decode" as a
    /// fact rather than as a hope.
    #[cfg(test)]
    pub fn is_holding(&self, dir: &Path, rate: u32) -> bool {
        match (self.entries.lock(), key_for(dir, rate)) {
            (Ok(slot), Ok(key)) => slot.iter().any(|(k, _)| *k == key),
            _ => false,
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests;
