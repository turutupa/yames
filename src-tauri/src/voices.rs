//! The melodic voices — a bank is a folder of notes.
//!
//! `plans/JAM_KILLER.md` §A2 is why this module exists. The drums became a
//! band in the third pass and the bass and the keys did not: they are still
//! the sines the drums were, and the owner's verdict on a synthesised kit
//! ("very underwhelming") applies to a synthesised bass for the same
//! reasons. What replaces them is what replaced the drums — recordings, in a
//! folder, with velocity layers and round robins:
//!
//! ```text
//! src-tauri/sounds/voices/<voice>/voice.json
//! src-tauri/sounds/voices/<voice>/<midi>.<layer>.<rr>.wav
//! ```
//!
//! `<midi>` is the MIDI number of the note that was recorded, and a bank
//! does not have to hold every note: twelve samples across a bass's two
//! octaves is what a library ships, and the notes between them are BUILT
//! HERE, at bank build, by resampling the nearest one. That is the whole of
//! what a sampler does, and the two rules it has to obey are the two this
//! module is written around.
//!
//! * **Nothing happens at trigger time.** A note the band can ask for is a
//!   buffer that already exists when the table reaches the audio thread. The
//!   callback indexes; it never stretches, allocates or decides. The bank is
//!   built in `set_jam`, on the command thread, and travels inside the
//!   `Arc<JamTable>` that names it — the same handoff the drums use, for the
//!   same reason: the notes and the table that names them arrive together,
//!   swap together at the bar line, and retire together on a thread that may
//!   `free()`.
//! * **One decoder, one resampler.** Everything here goes through `kit.rs`:
//!   the WAV reader that handles every depth a folder can hold without
//!   panicking, and the tabulated windowed sinc that made a kit decode in
//!   112 ms instead of 2.2 seconds. A second copy of either would be a
//!   second place for them to be wrong.
//!
//! The level rule is the kit's rule, which changed in the pass before this
//! one: **a note's level is decided on its file, not on the resampler's
//! ringing.** A bank a tool measured carries the balance the tool measured,
//! `trim_db` is applied once here, and nothing is normalised on the way out
//! — see `kit::VOICE_PEAK` for why dividing by a post-resampler peak is a
//! rate-dependent lie.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::Deserialize;

use crate::kit::{decode_capped, Entry, Resampler, ShippedKit, Source, SHIPPED_VOICES};

// ---------------------------------------------------------------------------
// The numbers
// ---------------------------------------------------------------------------

/// The longest one note may be.
///
/// Four seconds, where a drum is three, and the extra second is a bass note
/// under a ballad: a drum is a transient and a decay, and a melodic note is
/// as long as the player held it. It is a cap and not a rejection for the
/// same reason the drum's is — a library's own render very often carries a
/// tail nobody hears, and refusing the folder over it would be refusing a
/// good bank.
pub const MAX_NOTE_SECS: f64 = 4.0;

/// The most audio one melodic bank may declare, in decoded bytes.
///
/// A sanity check on the folder, not a budget for the decode, exactly as
/// `kit::MAX_FOLDER_BYTES` is. The arithmetic: a bass at three layers, two
/// round robins and a sample every three semitones is sixty files, and at
/// two seconds of mono 48 kHz each that is 23 MB decoded. Ninety-six
/// megabytes is far past any bank a tool would render and near enough to
/// catch a folder somebody pointed at their sample library.
pub const MAX_BANK_BYTES: u64 = 96 * 1024 * 1024;

/// How far a note may be from the sample it is built out of.
///
/// Three semitones either way, from the contract. Past that a resampled note
/// stops being the instrument: the formants move with the pitch, so a bass
/// stretched a fifth sounds like a smaller bass played through a smaller
/// speaker, and a Rhodes stretched the same way sounds like a toy.
///
/// It is a property of the BANK — a `notes` list with a gap wider than six
/// semitones cannot be covered — so the engine cannot fix it by choosing
/// differently. What it does instead is what a manifest that lies gets
/// everywhere else here: the nearest sample is still used, because a note
/// somebody asked for should sound, and the gap is said out loud once so a
/// render that came out sparse is visible rather than mysterious.
pub const MAX_STRETCH_SEMITONES: i32 = 3;

/// The largest layer and round-robin numbers the format allows — the kit's,
/// because a melodic bank is the kit format with a MIDI number where the
/// drum's name is, and a player cannot hear more of either.
pub const MAX_LAYERS: u8 = 4;
pub const MAX_RR: u8 = 3;

/// How long a note takes to reach silence when the line's cap ends it.
///
/// A synthesised note carries its own release inside the buffer and the cap
/// lands wherever it lands, which was inaudible because the recipes end
/// quietly. A RECORDING does not: a bass note cut at the next chord is a
/// step from whatever the string was doing straight down to nothing, which
/// is a click on every note of every walking line. So a bank names its own
/// release and the mixer fades over it. Sixty milliseconds is the contract's
/// default and is what a finger coming off a string sounds like.
const DEFAULT_RELEASE_MS: f32 = 60.0;

/// The longest release a manifest may ask for.
///
/// A quarter of a second. Past that the "release" is the note, and a bank
/// that wanted a long tail should have recorded one — the fade is there to
/// stop a step, not to shape the instrument.
const MAX_RELEASE_MS: f32 = 250.0;

// ---------------------------------------------------------------------------
// The manifest
// ---------------------------------------------------------------------------

/// `voice.json`, as the contract spells it.
#[derive(Debug, Clone, Deserialize)]
pub struct VoiceManifest {
    pub id: String,
    #[serde(default)]
    pub name: String,
    /// Who played it and who recorded it. Shown in Settings › About, which
    /// is what a CC BY licence is paid in — and what a CC0 one is thanked
    /// with.
    #[serde(default)]
    pub credit: String,
    #[serde(default)]
    pub licence: String,
    /// What the render tool says the files are. A description, not the fact:
    /// every file's own header is read and the loader resamples to whatever
    /// the device asked for. See [`check_declaration`].
    #[serde(default)]
    pub rate: u32,
    #[serde(default)]
    pub channels: u16,
    /// How many velocity layers, 1..4. Layer 1 is the softest.
    #[serde(default = "one")]
    pub layers: u8,
    /// How many round robins per layer, 1..3.
    #[serde(default = "one")]
    pub rr: u8,
    /// The balance the render tool measured, in decibels. Applied once here,
    /// when the bank is built, never per note.
    #[serde(default)]
    pub trim_db: f32,
    /// How long a note takes to fade when the line's cap ends it.
    #[serde(default = "default_release")]
    pub release_ms: f32,
    /// Which MIDI notes were actually recorded.
    #[serde(default)]
    pub notes: Vec<u8>,
}

fn one() -> u8 {
    1
}

fn default_release() -> f32 {
    DEFAULT_RELEASE_MS
}

/// Parse a `voice.json`. Every failure is a sentence, never a panic.
pub fn parse_manifest(text: &str) -> Result<VoiceManifest, String> {
    let mut m: VoiceManifest =
        serde_json::from_str(text).map_err(|e| format!("voice.json did not parse: {e}"))?;
    if m.id.trim().is_empty() {
        return Err("voice.json has no id, and a voice is named by its id".to_string());
    }
    m.id = m.id.trim().to_ascii_lowercase();
    if m.name.trim().is_empty() {
        m.name = m.id.clone();
    }
    m.layers = m.layers.clamp(1, MAX_LAYERS);
    m.rr = m.rr.clamp(1, MAX_RR);
    if !m.trim_db.is_finite() {
        m.trim_db = 0.0;
    }
    m.release_ms = if m.release_ms.is_finite() {
        m.release_ms.clamp(0.0, MAX_RELEASE_MS)
    } else {
        DEFAULT_RELEASE_MS
    };
    m.notes.sort_unstable();
    m.notes.dedup();
    if m.notes.is_empty() {
        return Err(format!(
            "{} names no notes, and a bank is the notes it was recorded at",
            m.id
        ));
    }
    Ok(m)
}

/// Does a manifest describe the files beside it?
///
/// Not fatal, and it cannot be: the loader reads every file's own header, so
/// a manifest that lies changes nothing about what plays. What it means is
/// that the render tool wrote one thing and produced another, which is worth
/// a line on the console rather than a silence. The same rule, and the same
/// sentence shape, as `kit::check_declaration`.
fn check_declaration(m: &VoiceManifest, rate: u32, channels: u16) {
    if m.rate != 0 && m.rate != rate {
        eprintln!(
            "[voice] {} says its files are {} Hz and they are {rate} Hz",
            m.id, m.rate
        );
    }
    if m.channels != 0 && m.channels != channels {
        eprintln!(
            "[voice] {} says its files are {}-channel and they are {channels}-channel",
            m.id, m.channels
        );
    }
}

// ---------------------------------------------------------------------------
// The bank
// ---------------------------------------------------------------------------

/// Every note the band can ask for, at every layer and round robin, ready
/// for the audio thread.
///
/// The buffers are MONO at the device's rate, which is what the bass and the
/// keys have always been and what the mixer reads them as — see
/// `engine::Voice::stereo`, which is the field that says so.
pub struct MelodicBank {
    /// Which decode this is. Unique for the life of the process and never
    /// reused, for the reason `KitBank::id` is: a bank is part of a table's
    /// signature, and a folder path cannot tell a replaced file from the
    /// same one.
    pub id: u64,
    /// The rate every buffer was built at. The cache key, and the reason a
    /// device change re-decodes rather than detuning.
    pub rate: u32,
    /// The range the band can ask for, inclusive. Not the range that was
    /// SAMPLED — that is the manifest's `notes`, and everything between them
    /// is in here too.
    low: u8,
    high: u8,
    layers: u8,
    rr: u8,
    /// `notes × layers × rr` buffers, indexed
    /// `((midi − low) × layers + layer) × rr + robin`.
    buffers: Vec<Vec<f32>>,
    /// How long a note takes to fade when the line's cap ends it, in FRAMES
    /// at [`MelodicBank::rate`]. Worked out here so the audio thread reads a
    /// number rather than multiplying a millisecond by a rate per note.
    pub release_frames: u32,
    pub id_name: String,
    pub name: String,
    pub credit: String,
    pub licence: String,
    /// How much audio this bank holds, in bytes.
    pub bytes: usize,
    /// The furthest any note had to be stretched from the sample it was
    /// built out of, in semitones. A bank whose `notes` leave a gap is
    /// visible here rather than only in the ear.
    pub worst_stretch: i32,
}

impl MelodicBank {
    /// The samples for one note, at one layer and one round robin — or an
    /// empty slice for a note this bank was not built for.
    ///
    /// A bounds-free read on the audio thread: an empty slice renders
    /// nothing, which is what a missing sound should do. `note` is the index
    /// the table stored, which is `midi − low` and was worked out when the
    /// table was compiled.
    #[inline]
    pub fn sample(&self, note: u8, layer: u8, robin: u8) -> &[f32] {
        let stride = self.layers as usize * self.rr as usize;
        let at = note as usize * stride + layer as usize * self.rr as usize + robin as usize;
        self.buffers.get(at).map_or(&[][..], |b| &b[..])
    }

    /// The lowest MIDI note this bank was built for. What a table subtracts
    /// to get an index.
    #[inline]
    pub fn low(&self) -> u8 {
        self.low
    }

    /// The highest.
    #[inline]
    pub fn high(&self) -> u8 {
        self.high
    }

    #[inline]
    pub fn layers(&self) -> u8 {
        self.layers
    }

    #[inline]
    pub fn rr(&self) -> u8 {
        self.rr
    }

    /// How many notes the band can ask for.
    #[inline]
    pub fn notes(&self) -> usize {
        (self.high - self.low) as usize + 1
    }
}

impl std::fmt::Debug for MelodicBank {
    /// Without this, `Debug` on a `JamTable` would print several megabytes
    /// of samples the first time anybody `dbg!`ed a table.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MelodicBank")
            .field("id", &self.id)
            .field("voice", &self.id_name)
            .field("rate", &self.rate)
            .field("range", &(self.low, self.high))
            .field("layers", &self.layers)
            .field("rr", &self.rr)
            .field("bytes", &self.bytes)
            .finish()
    }
}

// ---------------------------------------------------------------------------
// The voices the app ships
// ---------------------------------------------------------------------------

/// Every shipped manifest, parsed once.
///
/// A manifest that does not parse is DROPPED rather than fatal, and the app
/// is left with the voices that do — and with the synthesised recipe behind
/// each of them, which is the whole reason a missing bank is not an error.
/// Each entry is (which `SHIPPED_VOICES` row, its parsed manifest).
fn manifests() -> &'static [(usize, VoiceManifest)] {
    static PARSED: std::sync::OnceLock<Vec<(usize, VoiceManifest)>> = std::sync::OnceLock::new();
    PARSED.get_or_init(|| {
        SHIPPED_VOICES
            .iter()
            .enumerate()
            .filter_map(|(i, v)| match parse_manifest(v.manifest) {
                Ok(m) => Some((i, m)),
                Err(e) => {
                    eprintln!("[voice] a shipped voice.json did not parse and was skipped: {e}");
                    None
                }
            })
            .collect()
    })
}

/// Every shipped voice's id, in the order `build.rs` found them.
#[allow(dead_code)]
pub fn shipped_ids() -> Vec<String> {
    manifests().iter().map(|(_, m)| m.id.clone()).collect()
}

/// Which shipped voice a name means, or `None` — which is the answer until
/// the banks ship, and is what sends `fingered` back to its recipe.
pub fn shipped_index(name: &str) -> Option<usize> {
    let want = name.trim().to_ascii_lowercase();
    manifests().iter().position(|(_, m)| m.id == want)
}

/// Decode a shipped voice at `rate`, for the range `low..=high`.
///
/// The bytes are in the binary, so there is no disk to read — but the same
/// code path runs, because a shipped bank that took a different road to the
/// audio thread than a folder is a shipped bank whose bugs nobody's folder
/// ever finds.
pub fn load_shipped(index: usize, rate: u32, low: u8, high: u8) -> Result<MelodicBank, String> {
    let (row, manifest) = manifests()
        .get(index)
        .ok_or_else(|| format!("there is no shipped voice number {index}"))?;
    let voice: &ShippedKit = &SHIPPED_VOICES[*row];
    let entries: Vec<Entry> = voice
        .files
        .iter()
        .map(|(name, bytes)| Entry {
            name: (*name).to_string(),
            source: Source::Bytes(bytes),
        })
        .collect();
    build_bank(entries, manifest.clone(), rate, low, high)
}

/// Decode a folder of notes at `rate`, for the range `low..=high`.
///
/// The folder must hold a `voice.json`: a melodic bank has no file-name
/// convention that could stand in for one — `notes`, `layers` and `rr` are
/// the manifest's to state, and guessing them from a directory listing would
/// be guessing what a render tool measured.
pub fn load(dir: &Path, rate: u32, low: u8, high: u8) -> Result<MelodicBank, String> {
    load_capped(dir, rate, low, high, MAX_BANK_BYTES)
}

/// [`load`] with the size cap as an argument, so the test that proves the
/// cap refuses a folder does not have to write ninety-six megabytes of WAV.
fn load_capped(
    dir: &Path,
    rate: u32,
    low: u8,
    high: u8,
    max_bytes: u64,
) -> Result<MelodicBank, String> {
    let path = dir.join("voice.json");
    let text = std::fs::read_to_string(&path)
        .map_err(|e| format!("could not read {}: {e}", path.display()))?;
    let manifest = parse_manifest(&text)?;

    let files = wavs_in(dir)?;
    let present: Vec<(String, PathBuf)> = files
        .into_iter()
        .filter(|(stem, _)| parse_file_name(stem).is_some())
        .collect();
    if present.is_empty() {
        return Err(format!(
            "{} holds no notes — a melodic bank is <midi>.<layer>.<rr>.wav",
            dir.display()
        ));
    }

    // The size cap, from the headers, before a single sample is read. Four
    // bytes a frame, because a note is mono.
    let mut declared: u64 = 0;
    for (stem, file) in present.iter() {
        let reader = hound::WavReader::open(file)
            .map_err(|e| format!("{stem}.wav could not be opened as a WAV: {e}"))?;
        declared = declared.saturating_add(reader.duration() as u64 * 4);
    }
    if declared > max_bytes {
        return Err(format!(
            "{} is {:.1} MB of audio decoded, and a voice is capped at {:.1} MB",
            dir.display(),
            declared as f64 / (1024.0 * 1024.0),
            max_bytes as f64 / (1024.0 * 1024.0),
        ));
    }

    let entries: Vec<Entry> = present
        .into_iter()
        .map(|(stem, file)| Entry {
            name: format!("{stem}.wav"),
            source: Source::File(file),
        })
        .collect();
    build_bank(entries, manifest, rate, low, high)
}

/// Every `*.wav` in `dir`, as (lower-cased stem, path), sorted so a folder
/// reads the same way twice.
fn wavs_in(dir: &Path) -> Result<Vec<(String, PathBuf)>, String> {
    let entries =
        std::fs::read_dir(dir).map_err(|e| format!("could not read {}: {e}", dir.display()))?;
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if !path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("wav"))
        {
            continue;
        }
        if let Some(stem) = path.file_stem() {
            out.push((stem.to_string_lossy().to_ascii_lowercase(), path));
        }
    }
    out.sort();
    Ok(out)
}

/// Which note a file name means, as (midi, layer, round robin).
///
/// ```text
/// 40.wav        MIDI 40, layer 1, round robin 1
/// 40.2.wav      MIDI 40, layer 2, round robin 1
/// 40.2.3.wav    MIDI 40, layer 2, round robin 3
/// ```
///
/// The plain and one-number forms are not in the contract and cost nothing
/// to accept: a bank with one layer and one round robin is a real thing to
/// render, and making somebody write `40.1.1.wav` to say so would be making
/// them write the format's defaults out.
fn parse_file_name(stem: &str) -> Option<(u8, u8, u8)> {
    let mut parts = stem.split('.');
    let midi = parts.next()?.parse::<u8>().ok()?;
    if midi > 127 {
        return None;
    }
    let layer = match parts.next() {
        Some(s) => s.parse::<u8>().ok()?,
        None => 1,
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
    Some((midi, layer, robin))
}

// ---------------------------------------------------------------------------
// Building a bank
// ---------------------------------------------------------------------------

/// One decoded source note, at its own rate.
struct Sampled {
    /// `layers × rr` buffers, mono, indexed `layer * rr + robin`. A layer or
    /// a round robin the folder does not hold is filled from the nearest one
    /// that it does, which is the kit's rule.
    buffers: Vec<Vec<f32>>,
    rate: u32,
}

/// Decode a list of files into a bank, and build every note between them.
///
/// Runs on the command thread, in `set_jam`, and never on the audio thread.
fn build_bank(
    entries: Vec<Entry>,
    manifest: VoiceManifest,
    rate: u32,
    low: u8,
    high: u8,
) -> Result<MelodicBank, String> {
    if low > high {
        return Err(format!(
            "{} was asked for MIDI {low} to {high}, which is no range at all",
            manifest.id
        ));
    }
    let layers = manifest.layers as usize;
    let rr = manifest.rr as usize;

    // ---- Which file is which note ----
    //
    // `[midi][layer][rr]`, sparse in the first index because a bank holds a
    // dozen notes out of a hundred and twenty-eight.
    let mut grid: HashMap<u8, Vec<Vec<Option<Vec<f32>>>>> = HashMap::new();
    let mut rates: HashMap<u8, u32> = HashMap::new();
    let mut declared_once = false;
    for entry in entries.iter() {
        let stem = entry
            .name
            .rsplit_once('.')
            .map_or(&entry.name[..], |(s, _)| s);
        let Some((midi, layer, robin)) = parse_file_name(stem) else {
            continue;
        };
        // A file outside what the manifest declares is a render that went
        // wide; the manifest is what the engine builds from, so it is
        // skipped rather than silently changing the bank's shape.
        if layer as usize > layers || robin as usize > rr {
            continue;
        }
        let (buf, src_rate, src_channels) =
            decode_capped(&entry.name, &entry.source, MAX_NOTE_SECS)?;
        if !declared_once {
            declared_once = true;
            // The FILE's own channel count, not the pair the decoder folds
            // everything into. The contract says a note is mono, so a
            // correct bank declares one channel — and checking that against
            // the decoder's guaranteed two would put a warning on the
            // console for every bank that got it right.
            check_declaration(&manifest, src_rate, src_channels);
        }
        // ...and back to one, because a note is mono. A stereo file is
        // folded rather than refused: a bank rendered in stereo by mistake
        // is a bank, and half of it would be a lie about the instrument.
        let mono: Vec<f32> = (0..buf.len() / 2)
            .map(|i| (buf[2 * i] + buf[2 * i + 1]) * 0.5)
            .collect();
        if mono.is_empty() {
            return Err(format!("{} holds no audio at all", entry.name));
        }
        rates.insert(midi, src_rate);
        grid.entry(midi)
            .or_insert_with(|| vec![vec![None; rr]; layers])[layer as usize - 1]
            [robin as usize - 1] = Some(mono);
    }

    // ---- Fill the layers and round robins the folder did not hold ----
    let mut sampled: HashMap<u8, Sampled> = HashMap::new();
    for (midi, cells) in grid.iter() {
        let has = |l: usize| cells[l].iter().any(|c| c.is_some());
        if !(0..layers).any(has) {
            continue;
        }
        let mut buffers = Vec::with_capacity(layers * rr);
        for l in 0..layers {
            // The nearest layer that holds anything, preferring a SOFTER one
            // on a tie: a stroke you do not have is better played quieter
            // than louder. The kit's rule, and the same sentence.
            let source = (0..layers)
                .filter(|c| has(*c))
                .min_by_key(|c| (c.abs_diff(l), *c))
                .unwrap_or(0);
            for r in 0..rr {
                let take = cells[source][r]
                    .clone()
                    .or_else(|| cells[source].iter().flatten().next().cloned())
                    .unwrap_or_default();
                buffers.push(take);
            }
        }
        sampled.insert(
            *midi,
            Sampled {
                buffers,
                rate: *rates.get(midi).unwrap_or(&rate),
            },
        );
    }
    if sampled.is_empty() {
        return Err(format!("{} holds no notes at all", manifest.id));
    }

    // The notes the bank really has, which is what it is built from: a
    // manifest listing a note whose file never arrived is a description that
    // went stale, and the samples are the fact.
    let mut have: Vec<u8> = sampled.keys().copied().collect();
    have.sort_unstable();

    // ---- Every note the band can ask for ----
    //
    // ONE RESAMPLER PER DISTINCT RATIO, which is what makes this cost
    // milliseconds instead of seconds. The kernel does not vary per output
    // sample — only the sub-sample phase does, and there are as many phases
    // as the ratio's denominator — so it is tabulated once and indexed. Two
    // notes three semitones above their samples share a table; so do all
    // twenty-eight notes of a bank whose rate matches the device's and whose
    // samples land on them.
    let mut kernels: HashMap<i64, Option<Resampler>> = HashMap::new();
    let trim = 10f32.powf(manifest.trim_db / 20.0);
    let mut buffers: Vec<Vec<f32>> = Vec::with_capacity(
        ((high - low) as usize + 1) * layers * rr,
    );
    let mut bytes = 0usize;
    let mut worst_stretch = 0i32;

    for midi in low..=high {
        // The nearest sample, preferring the LOWER one on a tie — a note
        // built by stretching a sample up keeps the brightness the recording
        // had, and one built by slowing a sample down loses it.
        let source = *have
            .iter()
            .min_by_key(|&&s| ((s as i32 - midi as i32).abs(), s))
            .expect("the bank holds at least one note");
        let steps = midi as i32 - source as i32;
        worst_stretch = worst_stretch.max(steps.abs());
        let from = &sampled[&source];
        // Output sample `i` reads source position `i × ratio`: the pitch
        // and the device's rate in one walk, because doing them one after
        // the other would be two passes of sinc for one answer.
        let ratio = 2f64.powf(steps as f64 / 12.0) * from.rate as f64 / rate as f64;
        // Keyed on the ratio to a part in a million, which is far finer than
        // the approximation inside the kernel and coarse enough that two
        // notes asking for the same thing get the same table.
        let key = (ratio * 1.0e6).round() as i64;
        let kernel = kernels
            .entry(key)
            .or_insert_with(|| {
                if (ratio - 1.0).abs() < 1e-9 {
                    None
                } else {
                    Resampler::for_ratio(ratio)
                }
            })
            .as_ref();
        for buf in from.buffers.iter() {
            let out = match kernel {
                Some(k) => k.mono(buf),
                None => buf.clone(),
            };
            // THE LEVEL IS THE FILE'S, and the trim the tool measured is the
            // only thing applied on top. Nothing is normalised here — see
            // the module header, and `kit::VOICE_PEAK` for the measurement
            // that says dividing by a post-resampler peak moves a bank by
            // 3 dB from one device to the next.
            let out = if (trim - 1.0).abs() > 1e-6 {
                out.iter().map(|s| s * trim).collect()
            } else {
                out
            };
            bytes += out.len() * 4;
            buffers.push(out);
        }
    }

    if worst_stretch > MAX_STRETCH_SEMITONES {
        // Said once, not per note. A gap is the render tool's to close.
        eprintln!(
            "[voice] {} has a gap in its notes: something was built {worst_stretch} \
             semitones from its sample, and {MAX_STRETCH_SEMITONES} is as far as a \
             note still sounds like the instrument",
            manifest.id
        );
    }

    static NEXT_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
    Ok(MelodicBank {
        id: NEXT_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
        rate,
        low,
        high,
        layers: layers as u8,
        rr: rr as u8,
        buffers,
        release_frames: (manifest.release_ms / 1000.0 * rate as f32) as u32,
        id_name: manifest.id,
        name: manifest.name,
        credit: manifest.credit,
        licence: manifest.licence,
        bytes,
        worst_stretch,
    })
}

// ---------------------------------------------------------------------------
// The cache
// ---------------------------------------------------------------------------

/// What a cached bank was built from.
#[derive(PartialEq, Eq)]
enum Key {
    /// A shipped voice, by index, rate and the range it was built for.
    /// Nothing about it can change while the app runs.
    Shipped(usize, u32, u8, u8),
    /// A folder, with every file's size and modification time — the same
    /// key `kit::KitCache` uses, and for the same reason: a path alone
    /// would keep playing yesterday's render after somebody replaced it.
    Folder {
        dir: PathBuf,
        rate: u32,
        range: (u8, u8),
        stamps: Vec<(String, u64, u128)>,
    },
}

/// How many decodes the cache keeps.
///
/// Four, and each earns its place: the bass and the keys the jam is playing,
/// and the pair it was playing a moment ago while somebody auditions voices.
const CACHE_ENTRIES: usize = 4;

/// The melodic banks the app has already built.
///
/// `set_jam` arrives four to six times a chorus — the bar-ahead handshake —
/// and building a bank is the expensive part of loading a jam with recorded
/// voices in it. This makes all but the first a stat and an `Arc` clone,
/// exactly as `kit::KitCache` does for the drums.
#[derive(Default)]
pub struct VoiceCache {
    // A `Mutex`, and the command thread's alone. The audio thread never sees
    // it — it sees the `Arc<MelodicBank>` inside the table it was handed.
    entries: Mutex<Vec<(Key, Arc<MelodicBank>)>>,
}

impl VoiceCache {
    fn cached(&self, key: &Key) -> Option<Arc<MelodicBank>> {
        let mut slot = self.entries.lock().ok()?;
        let at = slot.iter().position(|(k, _)| k == key)?;
        let entry = slot.remove(at);
        let bank = entry.1.clone();
        slot.insert(0, entry);
        Some(bank)
    }

    fn store(&self, key: Key, bank: Arc<MelodicBank>) {
        if let Ok(mut slot) = self.entries.lock() {
            slot.insert(0, (key, bank));
            slot.truncate(CACHE_ENTRIES);
        }
    }

    /// One of the voices the app ships, at this rate and over this range.
    pub fn shipped(
        &self,
        index: usize,
        rate: u32,
        low: u8,
        high: u8,
    ) -> Result<Arc<MelodicBank>, String> {
        let key = Key::Shipped(index, rate, low, high);
        if let Some(bank) = self.cached(&key) {
            return Ok(bank);
        }
        let bank = Arc::new(load_shipped(index, rate, low, high)?);
        self.store(key, bank.clone());
        Ok(bank)
    }

    /// The bank for this folder, built only if the folder, one of its files,
    /// the output rate or the range has changed since last time.
    #[allow(dead_code)]
    pub fn get_or_load(
        &self,
        dir: &Path,
        rate: u32,
        low: u8,
        high: u8,
    ) -> Result<Arc<MelodicBank>, String> {
        let key = key_for(dir, rate, low, high)?;
        if let Some(bank) = self.cached(&key) {
            return Ok(bank);
        }
        let bank = Arc::new(load(dir, rate, low, high)?);
        self.store(key, bank.clone());
        Ok(bank)
    }
}

/// Stat the folder and build the key.
fn key_for(dir: &Path, rate: u32, low: u8, high: u8) -> Result<Key, String> {
    let mut stamps = Vec::new();
    for (stem, path) in wavs_in(dir)?.iter() {
        if parse_file_name(stem).is_none() {
            continue;
        }
        let meta = std::fs::metadata(path)
            .map_err(|e| format!("could not read {}: {e}", path.display()))?;
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        stamps.push((stem.clone(), meta.len(), modified));
    }
    Ok(Key::Folder {
        dir: dir.to_path_buf(),
        rate,
        range: (low, high),
        stamps,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests;
