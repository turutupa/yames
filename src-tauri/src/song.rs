//! The song the engine plays — a tempo map, a range, and the band from the
//! file.
//!
//! `plans/SONGS.md` A1, A4 and A6. A player imports a Guitar Pro or MusicXML
//! file, picks bars 17 to 24, sets 70 %, and plays over the file's own rhythm
//! section. Three things have to be true for that, and all three are why this
//! module exists rather than a few more fields on a jam:
//!
//! * **The tempo and the meter change, and they change on bar lines.** A jam
//!   is one bar of one meter repeated under one BPM the callback reads out of
//!   `AppState` every buffer. A song is a map, and a click that followed it by
//!   recomputing `tick_samples` per buffer would put every step a buffer late
//!   and every loop seam a buffer out.
//! * **The loop is a range of the piece, not a form.** `JamPosition` moves a
//!   bar pointer round a chorus of at most 64 bars, all of them the same
//!   length. A song's loop is a span of sample positions that comes round
//!   exactly, with notes still ringing across the seam.
//! * **The band is the file's**, note by note, at whatever tick the file put
//!   it on — not a row of sixteen cells.
//!
//! So a song is compiled into **sample-indexed tables**, here, on the command
//! thread, at the rate the device opened at, and the callback walks a cursor
//! through them. Every sample position in a [`SongTable`] is an absolute
//! offset from the first sample of the range, so the audio thread's whole job
//! is "is the next event's sample <= where I am?" — no division, no tempo
//! lookup, no meter arithmetic, and nothing that depends on the buffer size.
//!
//! The rules it shares with [`crate::jam`], because they are the engine's
//! rules and not the jam's:
//!
//! * **Nothing happens at trigger time.** The kit, the percussion set and the
//!   melodic banks are decoded here and travel INSIDE the `Arc<SongTable>`
//!   that names them, for the reason `JamTable` carries its own: they arrive
//!   together, swap together, and retire together on a thread that may
//!   `free()`. There is no window in which a table is present and its samples
//!   are not.
//! * **The audio thread never sees a name, a string or a decision.** A drum
//!   arrives as a resolved [`crate::jam::JamSlot`] with its layer, its round
//!   robin, its pan and its choke mask already worked out.
//!
//! What it deliberately does NOT share: the drift. A jam's drums are pushed
//! and pulled a few milliseconds by `jam::drift` because a band that lands
//! perfectly is a machine. A song's band is what the file says, to the sample
//! — the scorer's expected onsets come off the same map, and a drummer three
//! milliseconds early would be three milliseconds the player is measured
//! against and did not hear.

use std::sync::Arc;

use serde::Deserialize;

use crate::engine::{
    accent_mask, group_accent, AccentLevel, SoundId, VoiceLine, BASS_MAX_MIDI, BASS_MIN_MIDI,
    KEYS_MAX_MIDI, KEYS_MIN_MIDI,
};
use crate::jam::{choke_map, voice_layer, voice_slot, JamLane, JamSlot, JamVoices, Voicing};
use crate::kit::{KitBank, KitVoice};
use crate::voices::MelodicBank;

// ---------------------------------------------------------------------------
// The numbers
// ---------------------------------------------------------------------------

/// The ticks-per-quarter the contract fixes. A file that says anything else
/// was not written by our importer, and guessing at it would be guessing at
/// every note position in the piece.
pub const TICKS_PER_QUARTER: u32 = 960;

/// The longest piece the engine will hold.
///
/// Four thousand bars is about three hours of 4/4 at 120, which is longer
/// than any single piece anybody imports and short enough that the tables
/// below stay in the low megabytes. It is a guard against a malformed file,
/// not a product decision.
pub const MAX_BARS: usize = 4096;

/// And the most notes one backing track may carry, for the same reason.
pub const MAX_NOTES: usize = 200_000;

/// How slowly a song may be played, and how fast. The contract's 25..=100:
/// under a quarter speed a recorded note is a different instrument, and over
/// 100 % is not a practice tool, it is a different piece.
pub const MIN_TEMPO_PERCENT: u32 = 25;
pub const MAX_TEMPO_PERCENT: u32 = 100;

/// Bars of count-in the range may be led in with. The contract's 0..=2.
pub const MAX_COUNT_IN_BARS: u32 = 2;

/// The tempo range a map entry may name — the same 20..=300 `set_bpm` clamps
/// the metronome to, because it is the same click.
const MIN_BPM: f64 = 20.0;
const MAX_BPM: f64 = 300.0;

/// The widest bar the click will mark.
///
/// Thirty-two beats. `accent_mask` is a `u32`, so a bar past this could not
/// carry an accent on its later beats at all — and a bar of thirty-three
/// eighths is a file that needs looking at rather than playing.
const MAX_BEATS_PER_BAR: u32 = 32;

/// The subdivision the click may be asked for between the meter's beats. The
/// metronome's own 1..=6.
const MAX_SUBDIVISION: u32 = 6;

/// How much of the gap to the next tick a plain click may ring for.
///
/// The metronome's own `cap_samples = tick_samples × 0.9`, in one place here
/// because a song's gap is different in every bar and the callback works none
/// of it out.
const CLICK_CAP: f64 = 0.9;

/// [`SongTick::bar`] when no song is playing at all.
///
/// A played bar index is an index into `bars`, capped at [`MAX_BARS`], so
/// neither of these two sentinels can collide with one.
pub const NO_SONG_BAR: u32 = u32::MAX;

/// [`SongTick::bar`] for a tick of a song's COUNT-IN.
///
/// A count-in is not a bar of the piece, and the difference between "there is
/// no song" and "there is a song and it has not started" is load-bearing in
/// two places: the tab's cursor must not sit on bar one while somebody counts,
/// and the timing analyzer must not be handed four expected onsets nobody was
/// asked to play. `beat_log` is the only place the analyzer learns where a
/// beat fell, so a count-in beat that reached it would be a note the player is
/// marked down for not playing.
///
/// A sentinel rather than a flag because the beat notification's flag word is
/// FULL — see `engine::pack_small_fields` — and because a bar index that
/// cannot exist says the same thing for nothing.
pub const COUNT_IN_BAR: u32 = u32::MAX - 1;

/// How loud each lane of a song's band is before the musician's own mix.
///
/// The drums carry no trim: they are the kit's own recordings at the kit's
/// own balance, which is what `jam::voice_slot` hands back and what the jam
/// plays at mix 1.0. The bass and the keys carry the jam's trims for the one
/// reason those exist — a synthesised recipe and a recorded bank have to land
/// at the same level as each other, and the number that makes that true was
/// measured once and belongs in one place.
const SONG_KEYS_TRIM: f32 = crate::jam::KEYS_TRIM;

/// The most a per-lane mix dial may be set to, and the least. The jam's
/// `MIX_MIN` / `MIX_MAX`, because it is the same dial doing the same thing.
pub const MIX_MIN: f32 = 0.0;
pub const MIX_MAX: f32 = 1.5;

/// HOW MUCH TRANSIENT A SONG'S BAND MAY PUT ON ONE INSTANT.
///
/// A jam is normalised by RENDERING four bars of it and measuring the loudest
/// sample (`jam::worst_bar_peak`, held to `JAM_SAFETY_CLAMP`). That is the
/// right answer and it is not available here: a jam is four bars and a song is
/// up to four thousand, and rendering the piece to find out how loud it is
/// would put seconds of audio work on a button press.
///
/// So a song is measured the cheap way, and the cheap way is good enough
/// because of WHERE a band actually peaks. A mixer's worst moment is not the
/// sum of everything ringing — decays are out of phase and mostly cancel — it
/// is the instant several TRANSIENTS land together: a kick, a crash, a bass
/// note and the bottom of a chord all on the same downbeat. Those are onsets
/// with known gains, and [`SONG_TRANSIENT_WINDOW_MS`] apart at most, so the
/// worst of them is a sliding window over a list that is already sorted.
///
/// **A SONG SHARES ITS HEADROOM WITH THE CLICK, AND A JAM DOES NOT.** That is
/// the whole reason this number is lower than it looks like it should be. A
/// jam REPLACES the metronome — `jam_play` returns the band and the click
/// branch never runs — so a jam may have all of full scale to itself. A song
/// plays UNDER the click, because the click following the tempo map is half
/// of what a song is for, and the two land on the same downbeat.
///
/// 0.60 was measured against the twelve-bar arrangement in
/// `a_song_plays_its_map_across_a_tempo_step_and_a_loop_seam` — a kick, a
/// bass note and a chord on every bar line with a cymbal still washing over
/// them, which is an ordinary rock chart rather than a pathological one. The
/// measurements, all at volume 0.8 and both speeds:
///
/// ```text
/// ceiling 1.05 -> band 0.885, + click 0.326 = 1.43   the mixer clamps
/// ceiling 0.75 -> band 0.741, + click 0.326 = 1.00   nothing to spare
/// ceiling 0.60 -> band 0.618, + click 0.326 = 0.88   what ships
/// ```
/// (100 %; at 50 % the same arrangement renders 0.589 and 0.80.)
///
/// It carries more margin than the sum of transients suggests it needs, and
/// deliberately: the window below sees onsets that COINCIDE, and the thing it
/// cannot see is a six-hundred-millisecond cymbal still washing under the
/// next downbeat's kick. The margin is what covers that, and the numbers
/// above are what say how much is enough.
///
/// The bus is inside those numbers too. `DrumBus` at drive 1.0 is
/// `tanh(x)/tanh(1)`, which is a gain of about 1.31 on a quiet signal — so a
/// ceiling measured before it is not the level anybody hears, and calibrating
/// against the rendered peak rather than against the arithmetic is the only
/// honest way to pick it.
///
/// The cost is that a song's band is a few decibels under a jam's. That is
/// the right way round — the jam is the band and the song is the piece you
/// are reading — and it is not a ceiling on the musician: the drums, bass and
/// keys dials go to [`MIX_MAX`], so turning the click off and the band up is
/// a jam's level back, on purpose rather than by accident.
///
/// Like the jam's clamp this only ever scales DOWN, and only a band that
/// exceeds it: a sparse arrangement keeps its own level exactly.
const SONG_TRANSIENT_CEILING: f32 = 0.60;

/// How close two onsets have to be before they count as the same instant.
///
/// Eight milliseconds. Long enough to catch a kick and a bass note a
/// programmer wrote on the same beat and a sampler placed a few frames apart;
/// short enough that two sixteenths at 300 BPM (50 ms) are still two events.
const SONG_TRANSIENT_WINDOW_MS: f64 = 8.0;

// ---------------------------------------------------------------------------
// The wire — what the importer sends
// ---------------------------------------------------------------------------

/// Where the song is in time: the tempo map, the unrolled bars, the range
/// being played and how fast.
///
/// `plans/tasks/songs/W9-ENGINE-SONG.md` fixes this shape. `bars` is already
/// UNROLLED — repeats and endings expanded — so bar `n` is the `n`th bar that
/// is played and the range is a pair of indices into it.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongTransport {
    pub ticks_per_quarter: u32,
    /// Step changes, on bar lines, the first at or before tick 0. Quarter
    /// notes per minute, which is what every file format means by a tempo.
    pub tempo_map: Vec<SongTempo>,
    pub bars: Vec<SongBar>,
    /// Inclusive, in played-bar indices.
    pub range: SongRange,
    pub loops: bool,
    pub tempo_percent: u32,
    /// Bars of count-in before the FIRST pass, at the range's first tempo and
    /// meter.
    pub count_in_bars: u32,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongTempo {
    pub tick: u32,
    pub bpm: f64,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongBar {
    pub start_tick: u32,
    pub length_ticks: u32,
    pub numerator: u32,
    pub denominator: u32,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongRange {
    pub start_bar: u32,
    pub end_bar: u32,
}

/// The file's own rhythm section. `None` is a song the engine only clicks to.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongBacking {
    pub tracks: Vec<SongTrack>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongTrack {
    pub role: SongRole,
    #[serde(default)]
    pub name: String,
    pub notes: Vec<SongNote>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SongRole {
    Drums,
    Bass,
    Keys,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongNote {
    pub tick: u32,
    pub dur_ticks: u32,
    /// A drum track's MIDI number is a GENERAL MIDI PERCUSSION number, which
    /// is what Guitar Pro writes; see [`gm_drum`]. A bass or keys track's is
    /// the pitch.
    pub midi: u8,
    /// How hard, 0..=1. A value above 1 is read as a raw MIDI 0..=127
    /// velocity and scaled — a normalised velocity cannot be 1.4, and an
    /// importer that sent the raw number should play rather than be silently
    /// flattened to full volume on every note.
    pub velocity: f32,
}

/// What the musician wants to hear of the song, per lane. 0 is off.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongMix {
    pub click: f32,
    pub drums: f32,
    pub bass: f32,
    pub keys: f32,
}

/// How loud the click is over a song before the musician touches anything.
///
/// **Not 1.0, and that is a decision about both the ear and the headroom.**
/// A metronome at full scale is the loudest thing the engine makes, and over
/// a piece you are reading it does not want to be: the band is the reference
/// and the click is the ruler beside it. It is also half of what keeps the
/// sum under the mixer's clamp on a downbeat where an accent and a kick land
/// together — see [`SONG_TRANSIENT_CEILING`] for the other half and for the
/// measurement.
///
/// A musician who wants the old click back has the dial; one who wants no
/// click at all has 0, which is what playing to the band alone is.
const DEFAULT_CLICK_MIX: f32 = 0.45;

impl Default for SongMix {
    fn default() -> Self {
        Self {
            click: DEFAULT_CLICK_MIX,
            drums: 1.0,
            bass: 1.0,
            keys: 1.0,
        }
    }
}

impl SongMix {
    /// The same dials, clamped, as the audio thread reads them.
    ///
    /// `Copy`, four floats, and no allocation: it crosses to the callback
    /// behind its own generation counter exactly the way `JamPosition` does,
    /// so a musician moving a fader changes the next buffer and recompiles
    /// nothing.
    pub fn gains(self) -> SongMixGains {
        let clamp = |v: f32| {
            if v.is_finite() {
                v.clamp(MIX_MIN, MIX_MAX)
            } else {
                1.0
            }
        };
        SongMixGains {
            click: clamp(self.click),
            lanes: [clamp(self.drums), clamp(self.bass), clamp(self.keys)],
        }
    }
}

/// [`SongMix`], clamped, in the shape the audio thread indexes.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SongMixGains {
    pub click: f32,
    /// Indexed by [`SongLane`].
    pub lanes: [f32; 3],
}

impl Default for SongMixGains {
    fn default() -> Self {
        SongMix::default().gains()
    }
}

impl SongMixGains {
    #[inline]
    pub fn lane(&self, lane: SongLane) -> f32 {
        self.lanes[lane as usize]
    }
}

// ---------------------------------------------------------------------------
// The compiled table — what the audio thread reads
// ---------------------------------------------------------------------------

/// Which of the band's three rows an event belongs to. The index into
/// [`SongMixGains::lanes`], and the only thing the mix has to ask.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum SongLane {
    Drums = 0,
    Bass = 1,
    Keys = 2,
}

/// One click of the song, at the sample it lands on.
///
/// Everything the beat notification needs is in here, because the callback
/// must not compute any of it: the accent tier, the bar-local position, the
/// beat interval the timing analyzer scores against, and where in the song
/// the tick is.
#[derive(Debug, Clone, Copy)]
pub struct SongTick {
    /// Samples from the first sample of the range — or of the count-in, for a
    /// tick in [`SongTable::count_in`].
    pub sample: u64,
    /// Which played bar, as an index into the transport's `bars`.
    /// [`COUNT_IN_BAR`] through the count-in.
    pub bar: u32,
    /// The song tick this lands on, in the song's own ticks. 0 through the
    /// count-in.
    pub tick: u32,
    /// Beats from the start of the pass. What `BeatEvent::beat` carries.
    pub beat: u32,
    /// 0-based beat within its bar.
    pub measure_beat: u32,
    /// Which subdivision of that beat, 0-based. 0 is the beat itself.
    pub sub: u32,
    /// The meter's numerator for this bar.
    pub beats_per_bar: u8,
    /// How finely the beat is divided. The app's own subdivision, taken when
    /// the song was compiled.
    pub subdivision_total: u8,
    /// [`AccentLevel`] as a `u8`, from the bar's meter. The musician's accent
    /// MODE is applied on the audio thread, because it is a live setting.
    pub accent: u8,
    /// How long this beat is, in milliseconds. `TimingAnalyzer`'s window is
    /// computed from it, so it is the song's beat and not `AppState::bpm`.
    pub interval_ms: f64,
    /// How long a plain beat or a subdivision click may ring, in frames.
    ///
    /// The metronome's own rule — nine tenths of the gap to the next tick, so
    /// a click cannot still be sounding when the one after it starts — worked
    /// out here because a song's gap is different in every bar. An ACCENT is
    /// uncapped, exactly as it is on the click, and never reads this.
    pub cap_samples: u32,
    /// Is this the last tick of its bar? What `barJustCompleted` means.
    pub bar_complete: bool,
}

/// One note of the band, at the sample it lands on.
#[derive(Debug, Clone, Copy)]
pub struct SongEvent {
    /// Samples from the first sample of the range.
    pub sample: u64,
    /// The drum or the note, resolved: its layer, its round robin, its pan
    /// and its choke mask were all decided here.
    pub slot: JamSlot,
    /// How long it sounds, in FRAMES, or 0 to play the sample out.
    ///
    /// Frames and not ticks, which is what `JamSlot::cap_ticks` carries: a
    /// jam's tick length is the one number the callback always has, and a
    /// song's is different in every bar. Resolving it here is what makes a
    /// tempo step cost the callback nothing.
    pub cap_samples: u32,
    pub lane: SongLane,
}

/// One played bar, as the transport and the UI see it.
#[derive(Debug, Clone, Copy)]
pub struct SongBarPlan {
    /// Index into the transport's `bars`.
    pub index: u32,
    /// Its first sample, from the start of the range.
    pub start_sample: u64,
    /// The same instant in seconds, unrounded.
    ///
    /// Both, and that is the point: `start_sample` is what the loop seam and
    /// the tempo step are measured against, and this is what the band's notes
    /// are placed from. Deriving the second from the first would put every
    /// note up to half a sample out before its own rounding, which is how a
    /// "within one sample" promise becomes a two-sample answer.
    pub start_seconds: f64,
    /// Its first tick, in the song's own ticks.
    pub start_tick: u32,
    pub numerator: u32,
    pub denominator: u32,
    /// The tempo in force, already through `tempoPercent`.
    pub bpm: f64,
}

/// What the audio thread reads. Immutable once compiled; the callback holds
/// an `Arc` and swaps in a new one when the generation counter moves, exactly
/// as it does for a jam.
#[derive(Debug)]
pub struct SongTable {
    /// Every click of one pass, sorted by sample.
    ticks: Vec<SongTick>,
    /// Every note of the band in one pass, sorted by sample. Two notes on the
    /// same sample are two entries; the callback fires until the next one is
    /// in the future.
    band: Vec<SongEvent>,
    /// The count-in, if the range asked for one. Sample offsets are from the
    /// start of the COUNT-IN, and it plays before the first pass only.
    count_in: Vec<SongTick>,
    count_in_samples: u64,
    /// How long one pass of the range is. The loop seam, to the sample.
    pass_samples: u64,
    loops: bool,
    bars: Vec<SongBarPlan>,
    /// How hard the kit asks to be driven into the bus, and the reciprocal
    /// that keeps the curve through 1.0. The jam's two numbers, for the same
    /// bus.
    pub bus_drive: f32,
    pub bus_shape: f32,
    /// The drums, the percussion set and the melodic banks. INSIDE the table,
    /// for every reason `JamTable` carries its own.
    bank: Arc<KitBank>,
    perc: Option<Arc<KitBank>>,
    voices: JamVoices,
    /// The rate every buffer in there was built at. A device change makes the
    /// command thread compile again rather than play the song a semitone out.
    pub rate: u32,
    /// How many backing notes named something this engine has no voice for —
    /// a General MIDI percussion number outside the map, or a pitch no bank
    /// covers. Diagnostics: a file that came out thin is visible rather than
    /// mysterious.
    pub dropped_notes: u32,
    /// How many notes were compiled, across all three lanes.
    pub played_notes: u32,
    /// What the band had to be scaled by so its busiest instant does not
    /// clip: 1.0 for most arrangements, less for a dense one. See
    /// [`SONG_TRANSIENT_CEILING`]. Diagnostics — the audio thread never reads
    /// it, because it is already in every slot's gain.
    pub band_trim: f32,
}

impl SongTable {
    /// The clicks of one pass. Read on the audio thread off a table it is
    /// already holding.
    #[inline]
    pub fn ticks(&self) -> &[SongTick] {
        &self.ticks
    }

    /// The band's notes in one pass.
    #[inline]
    pub fn band(&self) -> &[SongEvent] {
        &self.band
    }

    /// The count-in's clicks — empty when the range asked for none.
    #[inline]
    pub fn count_in(&self) -> &[SongTick] {
        &self.count_in
    }

    /// How long the count-in is. 0 when there is none.
    #[inline]
    pub fn count_in_samples(&self) -> u64 {
        self.count_in_samples
    }

    /// How long one pass of the range is, in frames.
    #[inline]
    pub fn pass_samples(&self) -> u64 {
        self.pass_samples
    }

    /// Does the range come round again when it ends?
    #[inline]
    pub fn loops(&self) -> bool {
        self.loops
    }

    #[inline]
    pub fn kit_bank(&self) -> &KitBank {
        &self.bank
    }

    #[inline]
    pub fn perc_bank(&self) -> Option<&KitBank> {
        self.perc.as_deref()
    }

    #[inline]
    pub fn voice_bank(&self, line: VoiceLine) -> Option<&MelodicBank> {
        match line {
            VoiceLine::Bass => self.voices.bass.as_deref(),
            VoiceLine::Keys => self.voices.keys.as_deref(),
        }
    }

    /// The played bars of the range, in order. Diagnostics and tests; the
    /// audio thread reads `ticks` and nothing else.
    #[inline]
    pub fn bars(&self) -> &[SongBarPlan] {
        &self.bars
    }
}

// ---------------------------------------------------------------------------
// General MIDI percussion -> the kit's voices
// ---------------------------------------------------------------------------

/// Which of the kit's drums a General MIDI percussion number means, or `None`
/// for one this engine has no voice for.
///
/// Guitar Pro writes GM percussion numbers, so this is the one place a
/// drum track's note becomes a drum. The map is the contract's
/// (`plans/tasks/songs/W9-ENGINE-SONG.md`), and the rule for everything not
/// in it is the contract's too: **dropped and counted**, never approximated
/// onto a drum somebody did not write.
///
/// Two substitutions are in the list and are worth saying out loud, because
/// they are judgements rather than identities:
///
/// * **The six toms map onto two.** GM has six (41, 43, 45, 47, 48, 50, low
///   to high) and a kit has a high one and a low one. The bottom three go
///   low and the top three go high, which keeps a tom fill descending.
/// * **Maracas (70) plays the shaker.** They are the same gesture and the
///   same place in a band; the set has no maracas and never will.
///
/// What is deliberately NOT here: hand clap (39), the Chinese cymbal (52),
/// the splash (55), the vibraslap (58), the triangles, the whistles, the
/// cuica and the surdo. There is no voice that is those things, and a clap
/// played on a snare is a different arrangement.
pub fn gm_drum(note: u8) -> Option<KitVoice> {
    Some(match note {
        35 | 36 => KitVoice::Kick,
        37 => KitVoice::Rim,
        38 | 40 => KitVoice::Snare,
        42 => KitVoice::Hat,
        44 => KitVoice::HatPedal,
        46 => KitVoice::HatOpen,
        41 | 43 | 45 => KitVoice::TomLo,
        47 | 48 | 50 => KitVoice::TomHi,
        49 | 57 => KitVoice::Crash,
        51 | 59 => KitVoice::Ride,
        53 => KitVoice::RideBell,
        // ---- The percussionist's set ----
        54 => KitVoice::Tambourine,
        56 => KitVoice::Cowbell,
        60 => KitVoice::BongoHi,
        61 => KitVoice::BongoLo,
        62 | 63 => KitVoice::CongaHi,
        64 => KitVoice::CongaLo,
        69 => KitVoice::Cabasa,
        70 | 82 => KitVoice::Shaker,
        73 | 74 => KitVoice::Guiro,
        75 => KitVoice::Claves,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// Compiling
// ---------------------------------------------------------------------------

/// Everything a song needs decoded before it can be compiled — the same three
/// things a jam needs, out of the same caches, at the same rate.
pub struct SongSounds {
    pub bank: Arc<KitBank>,
    pub perc: Option<Arc<KitBank>>,
    pub voices: JamVoices,
}

/// Compile a song into the tables the callback walks.
///
/// Runs on the command thread, in `load_song` and `set_song_range`, and never
/// on the audio thread. Everything that divides, looks up a tempo, resolves a
/// drum or subtracts a MIDI number happens here, once.
///
/// `subdivision` is how finely the click divides the meter's beat — the app's
/// own 1..=6, read off `AppState` when the command ran. It is baked in rather
/// than read per buffer because the ticks are a table: changing it recompiles
/// the song, which is what `set_song_range` is for.
///
/// A transport that does not check out is rejected whole, with a sentence the
/// caller can show. Half a song is worse than no song.
pub fn compile(
    transport: &SongTransport,
    backing: Option<&SongBacking>,
    sounds: SongSounds,
    rate: u32,
    subdivision: u32,
) -> Result<SongTable, String> {
    let plan = plan_range(transport, rate, subdivision)?;
    let SongSounds { bank, perc, voices } = sounds;

    let mut table = SongTable {
        ticks: plan.ticks,
        band: Vec::new(),
        count_in: plan.count_in,
        count_in_samples: plan.count_in_samples,
        pass_samples: plan.pass_samples,
        loops: transport.loops,
        bars: plan.bars,
        bus_drive: bank.drive,
        bus_shape: 1.0 / bank.drive.tanh(),
        bank,
        perc,
        voices,
        rate,
        dropped_notes: 0,
        played_notes: 0,
        band_trim: 1.0,
    };

    if let Some(backing) = backing {
        compile_backing(&mut table, transport, backing, rate)?;
        // Sorted once, here, so the callback's cursor is a walk and not a
        // search. `sort_by_key` is stable, so two notes on the same sample
        // keep the order the file gave them — which is the order a chord's
        // notes were written in, and the order a take records them in.
        table.band.sort_by_key(|e| e.sample);
        table.band_trim = hold_the_band_down(&mut table.band, rate);
    }
    Ok(table)
}

/// Scale the whole band down if its busiest instant would clip, and leave it
/// alone if it would not. Returns what it did, for the report.
///
/// See [`SONG_TRANSIENT_CEILING`] for why this is a sliding window over
/// onsets rather than a render of the piece, and why that is enough.
fn hold_the_band_down(band: &mut [SongEvent], rate: u32) -> f32 {
    let window = (SONG_TRANSIENT_WINDOW_MS / 1000.0 * rate as f64) as u64;
    let mut worst = 0.0f32;
    let mut sum = 0.0f32;
    let mut from = 0usize;
    // `band` is sorted by sample, so the window only ever moves forward: one
    // pass, two cursors, and no allocation.
    for to in 0..band.len() {
        sum += band[to].slot.gain;
        while band[to].sample - band[from].sample > window {
            sum -= band[from].slot.gain;
            from += 1;
        }
        worst = worst.max(sum);
    }
    if !(worst > SONG_TRANSIENT_CEILING) {
        return 1.0;
    }
    let trim = SONG_TRANSIENT_CEILING / worst;
    for e in band.iter_mut() {
        e.slot.gain *= trim;
    }
    eprintln!(
        "[song] the band's busiest instant summed to {worst:.2} and was held down to \
         {SONG_TRANSIENT_CEILING:.2} ({:.1} dB)",
        20.0 * trim.log10()
    );
    trim
}

/// Everything `plan_range` works out about the transport, before a note of
/// the band is looked at.
#[derive(Debug)]
struct RangePlan {
    ticks: Vec<SongTick>,
    count_in: Vec<SongTick>,
    count_in_samples: u64,
    pass_samples: u64,
    bars: Vec<SongBarPlan>,
}

/// The transport, checked and turned into samples.
///
/// **Where the one-sample promise is kept.** Every position is computed as
/// `round(seconds × rate)` from a seconds value accumulated in `f64` across
/// whole bars — never by adding a rounded bar length to a rounded bar
/// position, which is how a tempo step ends up a sample out by bar forty and
/// a loop seam ends up a sample short every time round.
fn plan_range(
    transport: &SongTransport,
    rate: u32,
    subdivision: u32,
) -> Result<RangePlan, String> {
    if transport.ticks_per_quarter != TICKS_PER_QUARTER {
        return Err(format!(
            "the song says {} ticks to a quarter note, and the engine plays {}",
            transport.ticks_per_quarter, TICKS_PER_QUARTER
        ));
    }
    if rate == 0 {
        return Err("the audio output is not running, so there is no rate to build a song at"
            .to_string());
    }
    if transport.bars.is_empty() {
        return Err("the song has no bars in it".to_string());
    }
    if transport.bars.len() > MAX_BARS {
        return Err(format!(
            "the song is {} bars and the engine holds {MAX_BARS}",
            transport.bars.len()
        ));
    }
    if transport.tempo_map.is_empty() {
        return Err("the song has no tempo at all".to_string());
    }
    for (i, t) in transport.tempo_map.iter().enumerate() {
        if !t.bpm.is_finite() || !(MIN_BPM..=MAX_BPM).contains(&t.bpm) {
            return Err(format!(
                "tempoMap entry {i} is {} BPM, and the engine plays {MIN_BPM} to {MAX_BPM}",
                t.bpm
            ));
        }
    }
    if transport.tempo_map[0].tick > transport.bars[0].start_tick {
        return Err("the song's first tempo starts after its first bar".to_string());
    }
    // Sorted, because the lookup below walks it once per bar and a map out of
    // order would hand a bar the wrong tempo in silence.
    if transport
        .tempo_map
        .windows(2)
        .any(|w| w[1].tick < w[0].tick)
    {
        return Err("the song's tempo map is not in order".to_string());
    }
    let percent = transport.tempo_percent;
    if !(MIN_TEMPO_PERCENT..=MAX_TEMPO_PERCENT).contains(&percent) {
        return Err(format!(
            "the song is set to {percent} % and the range is \
             {MIN_TEMPO_PERCENT} to {MAX_TEMPO_PERCENT}"
        ));
    }
    if transport.count_in_bars > MAX_COUNT_IN_BARS {
        return Err(format!(
            "the count-in is {} bars and the most is {MAX_COUNT_IN_BARS}",
            transport.count_in_bars
        ));
    }
    let subdivision = subdivision.clamp(1, MAX_SUBDIVISION);

    let last = transport.bars.len() as u32 - 1;
    let (start, end) = (transport.range.start_bar, transport.range.end_bar);
    if start > end {
        return Err(format!(
            "the range is bars {start} to {end}, which is no range at all"
        ));
    }
    if end > last {
        return Err(format!(
            "the range ends at bar {end} and the song is {} bars long",
            transport.bars.len()
        ));
    }
    for (i, bar) in transport.bars.iter().enumerate() {
        if bar.numerator < 1 || bar.numerator > MAX_BEATS_PER_BAR {
            return Err(format!(
                "bar {i} is {}/{}, and a bar the click can mark is 1 to \
                 {MAX_BEATS_PER_BAR} beats",
                bar.numerator, bar.denominator
            ));
        }
        if !matches!(bar.denominator, 1 | 2 | 4 | 8 | 16 | 32) {
            return Err(format!(
                "bar {i} is {}/{}, and the denominator is a power of two up to 32",
                bar.numerator, bar.denominator
            ));
        }
        if bar.length_ticks == 0 {
            return Err(format!("bar {i} is no ticks long"));
        }
    }

    // ---- One pass of the range ----
    let mut ticks: Vec<SongTick> = Vec::new();
    let mut bars: Vec<SongBarPlan> = Vec::with_capacity((end - start + 1) as usize);
    let mut seconds = 0.0f64;
    let mut beat_index = 0u32;
    // Where in `tempo_map` the walk has reached. The map is sorted and the
    // bars are in order, so this only ever moves forward: one pass over both,
    // rather than a search per bar.
    let mut tempo_at = 0usize;

    for index in start..=end {
        let bar = transport.bars[index as usize];
        while tempo_at + 1 < transport.tempo_map.len()
            && transport.tempo_map[tempo_at + 1].tick <= bar.start_tick
        {
            tempo_at += 1;
        }
        let bpm = transport.tempo_map[tempo_at].bpm * percent as f64 / 100.0;
        let groups = meter_groups(bar.numerator, bar.denominator);
        let mask = accent_mask(&groups);
        // A beat of this meter, in seconds: a quarter note is `60/bpm`, and
        // the beat is `4/denominator` of one.
        let beat_secs = 60.0 / bpm * 4.0 / bar.denominator as f64;
        let tick_secs = beat_secs / subdivision as f64;
        // The TICKS this bar spans in the song's own units, which is what the
        // band's notes are placed against — the meter's, not the file's
        // `lengthTicks`, when the two disagree. They should not; the file's
        // is what the bar actually holds and is what the notes were written
        // in, so it is what the bar lasts.
        let bar_secs = bar.length_ticks as f64 / TICKS_PER_QUARTER as f64 * 60.0 / bpm;
        // The beat this bar's own grid puts on each tick, in the song's
        // ticks: `ticksPerQuarter × 4 / denominator`, divided again.
        let ticks_per_beat = TICKS_PER_QUARTER as f64 * 4.0 / bar.denominator as f64;

        bars.push(SongBarPlan {
            index,
            start_sample: (seconds * rate as f64).round() as u64,
            start_seconds: seconds,
            start_tick: bar.start_tick,
            numerator: bar.numerator,
            denominator: bar.denominator,
            bpm,
        });

        for beat in 0..bar.numerator {
            for sub in 0..subdivision {
                let at = seconds + beat as f64 * beat_secs + sub as f64 * tick_secs;
                let level = if sub == 0 {
                    group_accent(mask, beat)
                } else {
                    AccentLevel::None
                };
                ticks.push(SongTick {
                    sample: (at * rate as f64).round() as u64,
                    bar: index,
                    tick: bar.start_tick
                        + (beat as f64 * ticks_per_beat
                            + sub as f64 * ticks_per_beat / subdivision as f64)
                            .round() as u32,
                    beat: beat_index + beat,
                    measure_beat: beat,
                    sub,
                    beats_per_bar: bar.numerator.min(255) as u8,
                    subdivision_total: subdivision as u8,
                    accent: level as u8,
                    interval_ms: beat_secs * 1000.0,
                    cap_samples: (tick_secs * CLICK_CAP * rate as f64) as u32,
                    bar_complete: beat + 1 == bar.numerator && sub + 1 == subdivision,
                });
            }
        }
        beat_index += bar.numerator;
        seconds += bar_secs;
    }
    let pass_samples = (seconds * rate as f64).round() as u64;
    if pass_samples == 0 {
        return Err("the range is no time at all".to_string());
    }

    // ---- The count-in ----
    //
    // The range's FIRST tempo and meter, whatever the bars after it do: a
    // count-in is somebody counting you into the first bar, and counting it
    // in the meter of bar three would be counting you into the wrong piece.
    //
    // It is the song's own, and not `AppState::count_in`: the engine's
    // count-in counts beats at `AppState::bpm`, which is not this song's
    // tempo and knows nothing about a 7/8. `load_song` clears that one so the
    // two cannot both run.
    let first = &bars[0];
    let mut count_in: Vec<SongTick> = Vec::new();
    let mut count_in_samples = 0u64;
    if transport.count_in_bars > 0 {
        let groups = meter_groups(first.numerator, first.denominator);
        let mask = accent_mask(&groups);
        let beat_secs = 60.0 / first.bpm * 4.0 / first.denominator as f64;
        let tick_secs = beat_secs / subdivision as f64;
        let mut at = 0.0f64;
        let mut beat = 0u32;
        for _ in 0..transport.count_in_bars {
            for b in 0..first.numerator {
                for sub in 0..subdivision {
                    let when = at + b as f64 * beat_secs + sub as f64 * tick_secs;
                    let level = if sub == 0 {
                        group_accent(mask, b)
                    } else {
                        AccentLevel::None
                    };
                    count_in.push(SongTick {
                        sample: (when * rate as f64).round() as u64,
                        bar: COUNT_IN_BAR,
                        tick: 0,
                        beat: beat + b,
                        measure_beat: b,
                        sub,
                        beats_per_bar: first.numerator.min(255) as u8,
                        subdivision_total: subdivision as u8,
                        accent: level as u8,
                        interval_ms: beat_secs * 1000.0,
                        cap_samples: (tick_secs * CLICK_CAP * rate as f64) as u32,
                        bar_complete: b + 1 == first.numerator && sub + 1 == subdivision,
                    });
                }
            }
            beat += first.numerator;
            at += first.numerator as f64 * beat_secs;
        }
        count_in_samples = (at * rate as f64).round() as u64;
    }

    Ok(RangePlan {
        ticks,
        count_in,
        count_in_samples,
        pass_samples,
        bars,
    })
}

/// How a meter groups, for the click's accents.
///
/// The beat-group machinery the metronome already has, handed a meter instead
/// of a musician's edit: bit 0 of the mask is the bar's own opening and every
/// other set bit is a group start inside it, which is exactly the Strong /
/// Medium tier `plans/CLICK_ACCENTS.md` describes.
///
/// **A compound meter groups in threes and everything else does not.** 6/8,
/// 9/8 and 12/8 are two, three and four dotted-quarter beats and a click that
/// marked all six eighths equally would be a click in 6/4. Every other meter
/// is one group: the downbeat is marked and nothing else is, because where a
/// 7/8 divides — 2+2+3 or 3+2+2 — is a decision about the music that no file
/// records and the engine must not invent. The musician can still hear it:
/// the meter editor is theirs, and a song's bar accents are a floor, not a
/// ceiling.
fn meter_groups(numerator: u32, denominator: u32) -> Vec<u8> {
    if denominator == 8 && numerator > 3 && numerator % 3 == 0 {
        return vec![3u8; (numerator / 3) as usize];
    }
    vec![numerator.min(255) as u8]
}

/// The file's rhythm section, into sample-indexed events.
fn compile_backing(
    table: &mut SongTable,
    transport: &SongTransport,
    backing: &SongBacking,
    rate: u32,
) -> Result<(), String> {
    for track in backing.tracks.iter() {
        if track.notes.len() > MAX_NOTES {
            return Err(format!(
                "the {} track has {} notes and the engine holds {MAX_NOTES}",
                track.name,
                track.notes.len()
            ));
        }
    }
    let chokes = choke_map(&table.bank);
    let voicing = Voicing {
        bank: &table.bank,
        perc: table.perc.as_deref(),
        chokes,
        ghost_is_rim: false,
        // The musician's dials are applied on the audio thread, live, so a
        // fader move does not recompile the piece. Here every lane is at
        // unity and the slot carries the arrangement's own level.
        mix: 1.0,
        mix_perc: 1.0,
    };
    let bass_bank = table.voices.bass.clone();
    let keys_bank = table.voices.keys.clone();

    let mut dropped = 0u32;
    let mut played = 0u32;
    let mut events: Vec<SongEvent> = Vec::new();

    for track in backing.tracks.iter() {
        for note in track.notes.iter() {
            let Some((sample, cap_samples)) = place(table, transport, note, rate) else {
                // A note outside the range is not a note that was dropped for
                // want of a voice — it is a note of a bar nobody asked to
                // play — so it is not counted against the file.
                continue;
            };
            let velocity = velocity_of(note.velocity);
            let made = match track.role {
                SongRole::Drums => drum_slot(&voicing, note.midi, velocity),
                SongRole::Bass => melodic_slot(
                    VoiceLine::Bass,
                    note.midi,
                    velocity,
                    bass_bank.as_deref(),
                ),
                SongRole::Keys => melodic_slot(
                    VoiceLine::Keys,
                    note.midi,
                    velocity,
                    keys_bank.as_deref(),
                ),
            };
            match made {
                Some(slot) => {
                    played += 1;
                    events.push(SongEvent {
                        sample,
                        slot,
                        cap_samples,
                        lane: match track.role {
                            SongRole::Drums => SongLane::Drums,
                            SongRole::Bass => SongLane::Bass,
                            SongRole::Keys => SongLane::Keys,
                        },
                    });
                }
                None => dropped += 1,
            }
        }
    }
    if dropped > 0 {
        eprintln!(
            "[song] {dropped} note(s) of the backing named something this band has no \
             voice for and were dropped; {played} play"
        );
    }
    table.band = events;
    table.dropped_notes = dropped;
    table.played_notes = played;
    Ok(())
}

/// Where a note lands, and how long it sounds — or `None` when its tick is
/// outside the range being played.
///
/// A note that STARTS before the range starts is not played at all, even when
/// its duration would carry it in: it is a note somebody already struck, and
/// beginning it late is a different note.
fn place(
    table: &SongTable,
    transport: &SongTransport,
    note: &SongNote,
    rate: u32,
) -> Option<(u64, u32)> {
    // The played bar this tick is in. `bars` is in order and small; a binary
    // search keeps a ten-thousand-note track linear-ish rather than
    // quadratic.
    let at = match table
        .bars
        .binary_search_by(|b| b.start_tick.cmp(&note.tick))
    {
        Ok(i) => i,
        Err(0) => return None,
        Err(i) => i - 1,
    };
    let plan = table.bars[at];
    let bar = transport.bars[plan.index as usize];
    if note.tick >= bar.start_tick + bar.length_ticks {
        // Past the end of the last bar of the range — or in a bar the range
        // does not include, which for a range that is not a prefix is the
        // same answer.
        return None;
    }
    let into_bar = (note.tick - bar.start_tick) as f64 / TICKS_PER_QUARTER as f64 * 60.0
        / plan.bpm;
    let sample = ((plan.start_seconds + into_bar) * rate as f64).round() as u64;
    // The note's own length, at the tempo of the bar it started in. A note
    // held across a tempo step is a fraction of a beat out at its far end,
    // which is a release moving by milliseconds and is not worth a second
    // walk of the map.
    let dur_secs = note.dur_ticks as f64 / TICKS_PER_QUARTER as f64 * 60.0 / plan.bpm;
    let cap = (dur_secs * rate as f64).round() as u32;
    Some((sample, cap))
}

/// A note's velocity as a level, 0..=1.
///
/// Above 1 is read as a raw MIDI 0..=127 number. See [`SongNote::velocity`].
fn velocity_of(v: f32) -> f32 {
    if !v.is_finite() || v <= 0.0 {
        return 0.0;
    }
    if v > 1.0 {
        (v / 127.0).min(1.0)
    } else {
        v
    }
}

/// One General MIDI percussion number as a slot of the loaded kit, or `None`
/// when neither the kit nor the percussion set has that voice.
fn drum_slot(voicing: &Voicing, gm: u8, velocity: f32) -> Option<JamSlot> {
    let voice = gm_drum(gm)?;
    // 1-based, as `voice_slot` takes it: the layer the velocity reaches, or
    // the voice's own top when it has fewer.
    let bank = if voice.is_perc() {
        voicing.perc?.voice(voice)
    } else {
        voicing.bank.voice(voice)
    };
    // A voice the kit does not hold is not a dropped note: `voice_slot` walks
    // the contract's fallbacks — a kit with no cross-stick plays its softest
    // snare — and only a chain that runs out is silence.
    let layers = bank.map_or(3, |b| b.layers());
    let layer = voice_layer(velocity, layers) + 1;
    voice_slot(
        voicing,
        voice,
        layer,
        drum_lane(voice),
        velocity,
        // A DRUM PLAYS OUT. A jam caps its hats because it writes a hat on
        // every eighth and a wash is what that sounds like uncapped; a song's
        // drum track carries the strokes somebody actually played, and the
        // choke map is what closes the open hat. `SongEvent::cap_samples`
        // carries the length instead, in frames.
        0.0,
        // The dots mark the click's own accents while a song plays — the
        // meter is what the player is reading — so no drum lights one.
        false,
    )
}

/// Which lane a drum belongs to, for the practice windows and for `is_perc`.
///
/// A song has no trading bars, so this is only ever read as "is this the
/// percussionist?" — but a slot with the wrong lane is a slot that would
/// behave oddly the day one does.
///
/// The cross-stick and the ride bell have no lane of their own: `JamPattern`
/// writes them as a ghost on the snare row and a level on the ride row, so
/// they are those lanes here too. That is the same answer a jam gives.
fn drum_lane(voice: KitVoice) -> JamLane {
    match voice {
        KitVoice::Kick => JamLane::Kick,
        KitVoice::Snare | KitVoice::Rim => JamLane::Snare,
        KitVoice::Hat => JamLane::Hat,
        KitVoice::HatOpen => JamLane::HatOpen,
        KitVoice::HatPedal => JamLane::HatPedal,
        KitVoice::Ride | KitVoice::RideBell => JamLane::Ride,
        KitVoice::Crash => JamLane::Crash,
        KitVoice::TomHi => JamLane::TomHi,
        KitVoice::TomLo => JamLane::TomLo,
        KitVoice::Shaker => JamLane::Shaker,
        KitVoice::Tambourine => JamLane::Tambourine,
        KitVoice::Cowbell => JamLane::Cowbell,
        KitVoice::Cabasa => JamLane::Cabasa,
        KitVoice::Claves => JamLane::Claves,
        KitVoice::Guiro => JamLane::Guiro,
        KitVoice::CongaHi => JamLane::CongaHi,
        KitVoice::CongaLo => JamLane::CongaLo,
        KitVoice::BongoHi => JamLane::BongoHi,
        KitVoice::BongoLo => JamLane::BongoLo,
    }
}

/// One pitched note of the bass or the keys, folded by octaves into the range
/// its bank covers.
///
/// **Octaves and not a clamp.** A bass part written for a five-string goes
/// below E1 and the bank stops there; playing the whole of it on the bottom
/// note would be a drone where the line was. An octave up is the same note,
/// which is what a four-string player does with that part anyway.
fn melodic_slot(
    line: VoiceLine,
    midi: u8,
    velocity: f32,
    bank: Option<&MelodicBank>,
) -> Option<JamSlot> {
    let (low, high, trim) = match line {
        VoiceLine::Bass => (
            BASS_MIN_MIDI,
            BASS_MAX_MIDI,
            crate::jam::BASS_VOICE_TRIM[crate::engine::BassVoice::Fingered as usize],
        ),
        VoiceLine::Keys => (
            KEYS_MIN_MIDI,
            KEYS_MAX_MIDI,
            SONG_KEYS_TRIM * crate::jam::KEYS_VOICE_TRIM[crate::engine::KeysVoice::Epiano as usize],
        ),
    };
    let midi = fold_into(midi, low, high)?;
    let layer = bank.map_or(0, |b| voice_layer(velocity, b.layers()));
    let (sound, rr, release) = match bank {
        Some(b) => (
            SoundId::Voice {
                line,
                note: midi.saturating_sub(b.low()),
                layer,
                robin: 0,
            },
            b.rr(),
            b.release_frames,
        ),
        None => (
            match line {
                VoiceLine::Bass => SoundId::Bass(crate::engine::BassVoice::Fingered, midi - low),
                VoiceLine::Keys => SoundId::Keys(crate::engine::KeysVoice::Epiano, midi - low),
            },
            1,
            0,
        ),
    };
    Some(JamSlot {
        sound,
        gain: velocity * trim,
        // Carried in frames on the event instead; see `SongEvent::cap_samples`.
        cap_ticks: 0.0,
        lane: match line {
            VoiceLine::Bass => JamLane::Bass,
            VoiceLine::Keys => JamLane::Keys,
        },
        accent: false,
        pan_l: 1.0,
        pan_r: 1.0,
        rr,
        voice: crate::jam::NOT_A_DRUM,
        choked_by: 0,
        chokes: 0,
        release,
    })
}

/// `midi`, moved by whole octaves until it is inside `low..=high`, or `None`
/// when no octave of it fits — which needs a range under twelve semitones and
/// cannot happen for either bank.
fn fold_into(midi: u8, low: u8, high: u8) -> Option<u8> {
    let mut n = midi as i32;
    let (lo, hi) = (low as i32, high as i32);
    // Bounded rather than a `while true`: 128 semitones is at most eleven
    // octaves, and a loop on the command thread that cannot end is still a
    // loop that cannot end.
    for _ in 0..16 {
        if n < lo {
            n += 12;
        } else if n > hi {
            n -= 12;
        } else {
            return Some(n as u8);
        }
    }
    None
}

#[cfg(test)]
mod tests;
