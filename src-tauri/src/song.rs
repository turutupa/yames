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
use crate::synth::MAX_SONG_TRACKS;
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
    /// Bars of count-in before the FIRST pass, at the tempo and meter of the
    /// bar the first pass begins in.
    pub count_in_bars: u32,
    /// WHERE THE FIRST PASS BEGINS, in the song's own ticks (W37 item 1).
    ///
    /// The playhead. A range says which bars are being practised; this says
    /// where inside them the next press of Play starts, and it is the whole
    /// of "stop is a pause" — a stop leaves the playhead where the music
    /// stopped, and the press after it begins there rather than at the top.
    ///
    /// It moves the CURSOR and nothing else: `pass_samples` is still one whole
    /// pass of the range, so the second time round a loop is whole. A tick
    /// outside the range is held to its nearest edge rather than refused,
    /// because a playhead is a place somebody clicked and clamping it is what
    /// every screen above this already does.
    ///
    /// `serde(default)` so a caller that has nothing to say about it — the
    /// probe, the gate's own fixtures — means "at the top", which is what
    /// every caller meant before this field existed.
    #[serde(default)]
    pub start_tick: u32,
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
    /// The General MIDI instrument the file asks for, 0..=127. Read only by
    /// the [`SongRole::Synth`] lane; the sampled kit, bass and keys are what
    /// they are.
    #[serde(default)]
    pub program: u8,
    /// The part the player opened the file to learn, played as the guide
    /// every tab player has (`W28`). Exactly one track may be, and it is the
    /// only track whose notes are also the notes scoring expects — which is
    /// why it is a flag here rather than a fourth role.
    #[serde(default)]
    pub guide: bool,
    pub notes: Vec<SongNote>,
    /// Bends and slides, as MIDI writes them: 0..=16383 with 8192 at rest,
    /// on the track's own channel. Empty for everything the sampled band
    /// plays, because a recorded bass sample cannot bend.
    #[serde(default)]
    pub bends: Vec<SongBend>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongBend {
    pub tick: u32,
    pub value: u16,
}

/// Who plays a track.
///
/// The first three are Jam's recorded band, which is where they were before
/// W28 and where they sound best: a sampled kit is a kit somebody hit. The
/// fourth is everything else in the file — every guitar, and so the reason
/// the mode exists — through the General MIDI synthesiser in
/// [`crate::synth`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SongRole {
    Drums,
    Bass,
    Keys,
    Synth,
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

/// What the musician wants to hear of the song, per TRACK. 0 is off.
///
/// **Per track since W28, and not per lane.** It was four numbers — a click
/// and Jam's three rows — because those were the only three things a song
/// could play. Now every track in the file sounds, so every track in the file
/// has a fader, and `tracks[n]` is the `n`th entry of [`SongBacking::tracks`].
/// A file with two guitars has two guitar faders, which is the whole of what
/// "the band strip lists every track in the file" means from the engine's
/// side.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongMix {
    pub click: f32,
    /// How loud the COUNT-IN's clicks are, which is a separate dial (W34
    /// item 7).
    ///
    /// The owner, 2026-09-21: *"is the drums playing by default? i've played
    /// tabs with no drums and it still plays them"* — his click's sound is a
    /// kit, and over a song with a band of its own a click ticking through
    /// every bar IS a drummer playing along. So Songs turns the click off by
    /// default when the file has parts of its own, and the song keeps the
    /// time, as it does in every tab player.
    ///
    /// The count-in is the one thing that cannot go with it: it is how you
    /// know when to come in, and a count-in you cannot hear is not one. It
    /// has its own number for that reason — the webview sends the click's own
    /// level here whether or not the click is muted — rather than a flag,
    /// because the audio thread reads a gain and a flag would be a branch.
    ///
    /// `#[serde(default = ...)]` and not `#[serde(default)]`: a webview that
    /// has not been told about this field means "the click's usual level",
    /// and `f32::default()` is silence.
    #[serde(default = "default_click_mix")]
    pub count_in: f32,
    #[serde(default)]
    pub tracks: Vec<f32>,
}

fn default_click_mix() -> f32 {
    DEFAULT_CLICK_MIX
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
            count_in: DEFAULT_CLICK_MIX,
            tracks: Vec::new(),
        }
    }
}

impl SongMix {
    /// The same dials, clamped, as the audio thread reads them.
    ///
    /// `Copy`, seventeen floats, and no allocation: it crosses to the callback
    /// behind its own generation counter exactly the way `JamPosition` does,
    /// so a musician moving a fader changes the next buffer and recompiles
    /// nothing. A fixed array and not the `Vec` it arrives in, because a `Vec`
    /// is a pointer the callback would be following and a `free()` somebody
    /// would have to own.
    pub fn gains(&self) -> SongMixGains {
        let clamp = |v: f32| {
            if v.is_finite() {
                v.clamp(MIX_MIN, MIX_MAX)
            } else {
                1.0
            }
        };
        let mut tracks = [1.0f32; MAX_SONG_TRACKS];
        for (slot, value) in tracks.iter_mut().zip(self.tracks.iter()) {
            *slot = clamp(*value);
        }
        SongMixGains {
            click: clamp(self.click),
            count_in: clamp(self.count_in),
            tracks,
        }
    }
}

/// [`SongMix`], clamped, in the shape the audio thread indexes.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SongMixGains {
    pub click: f32,
    /// The count-in's own level — see [`SongMix::count_in`]. Read only by the
    /// count-in's arm of the frame loop, which is a different branch from the
    /// piece's own ticks and costs nothing to anybody who never counts in.
    pub count_in: f32,
    /// Indexed by the track's position in [`SongBacking::tracks`].
    pub tracks: [f32; MAX_SONG_TRACKS],
}

impl Default for SongMixGains {
    fn default() -> Self {
        SongMix::default().gains()
    }
}

impl SongMixGains {
    /// One track's fader. A track index the mix is too short for is at unity
    /// rather than silent: a band nobody has touched plays.
    #[inline]
    pub fn track(&self, track: u8) -> f32 {
        match self.tracks.get(track as usize) {
            Some(g) => *g,
            None => 1.0,
        }
    }
}

// ---------------------------------------------------------------------------
// The compiled table — what the audio thread reads
// ---------------------------------------------------------------------------

/// Which of Jam's three recorded rows a sampled event came out of.
///
/// Not the fader any more — that is the event's `track` — but still the thing
/// that says which bank a slot was resolved against, which the take's mixdown
/// and the tests both ask.
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
    /// Which fader it answers to: the track's own place in the file.
    pub track: u8,
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
    /// Where the first pass begins — the playhead, resolved (W37 item 1).
    ///
    /// The same four numbers a seek produces, worked out once here so the
    /// audio thread's "back to the top of the range" is four copies out of
    /// the table it is already holding rather than a search. `pass == 0`, so
    /// `play` is the sample itself.
    start: SongSeek,
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
    /// Where the synthesised half of the band arrives from, or `None` for a
    /// song whose every track the sampled band can play.
    ///
    /// **Inside the table** for the reason the kit is: it arrives with the
    /// song, swaps with it, and retires with it down `SongRetirement`, on a
    /// thread that may `free()`. The callback holds an `Arc` and reads frames
    /// somebody else has already made; it never renders and never waits.
    synth: Option<Arc<crate::synth::SynthRing>>,
    /// The same events, for the renderer thread that `commands` starts beside
    /// the table. Not read on the audio thread at all.
    pub synth_score: Option<Arc<crate::synth::SynthScore>>,
    /// How many of `played_notes` the synthesiser plays.
    pub synth_notes: u32,
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

    /// WHERE A PRESS OF PLAY BEGINS (W37 item 1).
    ///
    /// Read on the audio thread, off the table it is already holding, at the
    /// three moments a song starts over. Four copies and no arithmetic: the
    /// playhead was resolved when the piece was compiled, which is what makes
    /// "play starts AT the playhead" cost the callback nothing and makes it
    /// impossible for the first buffer to be at the top of the range and the
    /// second somewhere else.
    #[inline]
    pub fn start(&self) -> SongSeek {
        self.start
    }

    /// The sample a song tick falls on, for a seek posted while the piece is
    /// playing.
    ///
    /// The bar plan's own arithmetic — the same walk `place` does for a note
    /// — so a click on bar 34 and the notes written in bar 34 cannot disagree
    /// about where bar 34 is, whatever the tempo map and the speed did to it.
    /// A tick before the range starts is its first sample; one past the end is
    /// the last sample of the pass.
    pub fn sample_at_tick(&self, tick: u32) -> u64 {
        let Some(first) = self.bars.first() else {
            return 0;
        };
        let mut plan = *first;
        for bar in self.bars.iter() {
            if bar.start_tick <= tick {
                plan = *bar;
            } else {
                break;
            }
        }
        if tick <= plan.start_tick {
            return plan.start_sample;
        }
        let into = (tick - plan.start_tick) as f64 / TICKS_PER_QUARTER as f64 * 60.0 / plan.bpm;
        let at = ((plan.start_seconds + into) * self.rate as f64).round() as u64;
        at.min(self.pass_samples.saturating_sub(1))
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

    /// The synthesised half of the band, for the callback to mix and for the
    /// command thread to point a renderer at.
    #[inline]
    pub fn synth(&self) -> Option<&Arc<crate::synth::SynthRing>> {
        self.synth.as_ref()
    }

    /// Where a seek puts every cursor.
    ///
    /// **The whole of a seek's arithmetic, in one pure function**, so the
    /// callback's job is to copy four numbers out of it and cut what is
    /// ringing — and so the things a seek has to get right can be asserted
    /// without an audio device. Two binary searches over tables that are
    /// already in cache; no allocation, no lock, and no dependence on how far
    /// the seek went.
    ///
    /// `pass` is how many times round the range the transport has been, which
    /// the piece's own clock is counted from — see [`SongSeek::play`].
    pub fn seek(&self, target: u64, pass: u32) -> SongSeek {
        // Clamped, because a seek posted against the table before this one
        // would otherwise put the cursor past the end of this one. A human
        // cannot produce that race; a command and a recompile arriving
        // together can.
        let sample = target.min(self.pass_samples.saturating_sub(1));
        SongSeek {
            sample,
            // The first event AT OR AFTER the target. A click on a bar line
            // hears that bar line's click and that bar's downbeat, which is
            // the one case where "at or after" rather than "after" is the
            // whole of what a player would call working.
            tick_at: self.ticks.partition_point(|t| t.sample < sample),
            band_at: self.band.partition_point(|e| e.sample < sample),
            play: pass as u64 * self.pass_samples + sample,
        }
    }
}

/// Where a seek leaves the transport. See [`SongTable::seek`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SongSeek {
    /// The new position in the pass, in frames.
    pub sample: u64,
    /// The new index into the table's clicks.
    pub tick_at: usize,
    /// And into the sampled band's notes.
    pub band_at: usize,
    /// The piece's own clock, which the synthesiser's renderer is told, and
    /// which is NOT the position in the pass: it counts every frame of the
    /// piece that has been played, seams included, so the two threads can
    /// never disagree about which time round the range they are on. The
    /// invariant the ordinary advance keeps — `play == pass * pass_samples +
    /// sample` — is what a seek has to keep as well, and this is it.
    pub play: u64,
}

// ---------------------------------------------------------------------------
// Where a take began
// ---------------------------------------------------------------------------

/// Turn the transport stamp the audio callback left on a take's ring into the
/// position the take's sidecar records
/// (`plans/tasks/songs/W15-LIVE-AND-EXACT.md`, item 2).
///
/// Called on the take's WRITER thread, on its first chunk of band, through
/// the function `start_take` hands over. It lives here rather than in
/// `take.rs` because the arithmetic is the compiled table's own — a sample
/// cursor becomes a bar and a tick only against the bar plan that put every
/// sample where it is — and because `take.rs` has never had to know a song
/// exists.
///
/// `table` is the song the engine was holding when the take started. `None`
/// is a jam or free play, and a `Song` stamp with no table to read it against
/// answers `None` rather than guessing — a position nobody can check is worse
/// than no position at all.
pub fn take_position(
    table: Option<&SongTable>,
    at: crate::take::TakeTransport,
) -> Option<crate::take::TakePosition> {
    use crate::take::{TakeMode, TakePosition, TakeTransport};
    match at {
        TakeTransport::Free => None,
        TakeTransport::Jam { bar, chorus } => Some(TakePosition {
            mode: TakeMode::Jam,
            bar,
            tick: 0,
            // A chorus is counted from one and a pass from zero; one subtraction
            // so nothing downstream has to hold two ideas of "which time round".
            pass: chorus.saturating_sub(1),
            count_in: false,
            start_offset_ms: None,
        }),
        TakeTransport::SongCountIn { frames } => {
            let table = table?;
            let first = table.bars().first()?;
            let rate = table.rate.max(1) as f64;
            Some(TakePosition {
                mode: TakeMode::Song,
                bar: first.index,
                tick: first.start_tick,
                pass: 0,
                count_in: true,
                // Beat 0 is still to come: the count-in has
                // `count_in_samples - frames` left to run, and that much of
                // the file is in front of it.
                start_offset_ms: Some(
                    (table.count_in_samples().saturating_sub(frames)) as f64 / rate * 1000.0,
                ),
            })
        }
        TakeTransport::Song { frames, pass } => {
            let table = table?;
            let rate = table.rate.max(1) as f64;
            // The bar this sample is in. A walk rather than a search: it runs
            // once per take, on the writer thread, and a range is at most
            // `MAX_BARS` — four thousand comparisons in the worst case
            // anybody can build, against a thread that is asleep the rest of
            // the time.
            let mut plan = *table.bars().first()?;
            for bar in table.bars() {
                if bar.start_sample <= frames {
                    plan = *bar;
                } else {
                    break;
                }
            }
            // And how far into it, in the song's own ticks. The bar's own
            // tempo, which is the one in force there — reading the range's
            // opening tempo would put every bar after a step in the wrong
            // place, which is the failure `analyze_take_pitch`'s `tempoMap`
            // exists to stop.
            let into_secs = frames.saturating_sub(plan.start_sample) as f64 / rate;
            let quarters = into_secs * plan.bpm / 60.0;
            let tick = plan.start_tick + (quarters * TICKS_PER_QUARTER as f64).round() as u32;
            // Beat 0 of the FIRST pass, which is the origin
            // `analyze_take_pitch` reckons every note from, is this many
            // samples BEHIND the first sample of the file.
            let behind = pass as u64 * table.pass_samples() + frames;
            Some(TakePosition {
                mode: TakeMode::Song,
                bar: plan.index,
                tick,
                pass,
                count_in: false,
                start_offset_ms: Some(-(behind as f64) / rate * 1000.0),
            })
        }
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
    let start_sample = plan.start_sample;
    let SongSounds { bank, perc, voices } = sounds;

    let mut table = SongTable {
        ticks: plan.ticks,
        band: Vec::new(),
        count_in: plan.count_in,
        count_in_samples: plan.count_in_samples,
        start: SongSeek {
            sample: 0,
            tick_at: 0,
            band_at: 0,
            play: 0,
        },
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
        synth: None,
        synth_score: None,
        synth_notes: 0,
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
    // The playhead, resolved against the finished tables — after the band is
    // sorted, because `band_at` is an index into it. `SongTable::seek` is the
    // one piece of arithmetic that says where a position puts every cursor,
    // and a press of Play is a seek to the playhead by another name.
    table.start = table.seek(start_sample, 0);
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
    /// Where the first pass begins — `SongTransport::start_tick`, in frames.
    start_sample: u64,
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

    // ---- Where the first pass begins ----
    //
    // The playhead (W37 item 1). `bars` is in order, so this is a walk to the
    // bar the tick is written in and then the bar's own tempo for the rest of
    // the way — the arithmetic `place` does for a note, because a playhead
    // and a note on the same tick have to land on the same sample.
    let start_bar = {
        let mut at = 0usize;
        for (i, bar) in bars.iter().enumerate() {
            if bar.start_tick <= transport.start_tick {
                at = i;
            } else {
                break;
            }
        }
        at
    };
    let start_sample = {
        let plan = &bars[start_bar];
        if transport.start_tick <= plan.start_tick {
            plan.start_sample
        } else {
            let into = (transport.start_tick - plan.start_tick) as f64
                / TICKS_PER_QUARTER as f64
                * 60.0
                / plan.bpm;
            (((plan.start_seconds + into) * rate as f64).round() as u64)
                .min(pass_samples.saturating_sub(1))
        }
    };

    // ---- The count-in ----
    //
    // The tempo and meter of the bar the first pass BEGINS in, whatever the
    // bars around it do: a count-in is somebody counting you into the bar you
    // are about to play, and counting it in the meter of bar one when you are
    // starting at bar forty would be counting you into the wrong piece. Bar
    // one is still the answer whenever the playhead is at the top, which is
    // most of the time and is what this said before W37.
    //
    // It is the song's own, and not `AppState::count_in`: the engine's
    // count-in counts beats at `AppState::bpm`, which is not this song's
    // tempo and knows nothing about a 7/8. `load_song` and `set_song_range`
    // both clear that one so the two cannot both run.
    let first = &bars[start_bar];
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
        start_sample,
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
    // The synth's half. One MIDI channel per synthesised track, in the order
    // they appear, which is why the file's own channel numbers are not used:
    // two tracks of a Guitar Pro file can share a channel, and two faders
    // cannot.
    let mut synth_events: Vec<crate::synth::SynthEvent> = Vec::new();
    let mut channel_track = [u8::MAX; 16];
    let mut next_channel = 0u8;

    for (index, track) in backing.tracks.iter().enumerate() {
        if index >= MAX_SONG_TRACKS {
            // The seventeenth part and beyond. Named rather than silently
            // dropped, and counted as dropped notes so the screen can say so.
            dropped += track.notes.len() as u32;
            continue;
        }
        let index = index as u8;
        if track.role == SongRole::Synth {
            let channel = claim_channel(&mut next_channel, &mut channel_track, index);
            synth_events.push(crate::synth::SynthEvent {
                sample: 0,
                channel,
                kind: crate::synth::SynthEventKind::Program {
                    program: track.program,
                },
            });
            for note in track.notes.iter() {
                let Some((sample, cap_samples)) = place(table, transport, note, rate) else {
                    continue;
                };
                played += 1;
                let velocity = (note.velocity.clamp(0.0, 1.0) * 127.0).round() as u8;
                synth_events.push(crate::synth::SynthEvent {
                    sample,
                    channel,
                    kind: crate::synth::SynthEventKind::NoteOn {
                        key: note.midi,
                        velocity: velocity.max(1),
                    },
                });
                // `cap_samples` is how long the note is written for, already
                // through the tempo map and the speed — which is where a palm
                // mute and a let-ring became two different lengths, back in
                // the file's own MIDI generation.
                synth_events.push(crate::synth::SynthEvent {
                    sample: sample + cap_samples.max(1) as u64,
                    channel,
                    kind: crate::synth::SynthEventKind::NoteOff { key: note.midi },
                });
            }
            for bend in track.bends.iter() {
                let note = SongNote {
                    tick: bend.tick,
                    dur_ticks: 0,
                    midi: 0,
                    velocity: 1.0,
                };
                let Some((sample, _)) = place(table, transport, &note, rate) else {
                    continue;
                };
                synth_events.push(crate::synth::SynthEvent {
                    sample,
                    channel,
                    kind: crate::synth::SynthEventKind::Bend {
                        value: bend.value.min(16_383),
                    },
                });
            }
            continue;
        }
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
                SongRole::Synth => unreachable!("handled above"),
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
                            SongRole::Keys | SongRole::Synth => SongLane::Keys,
                        },
                        track: index,
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
    table.dropped_notes = dropped;
    table.played_notes = played;
    if !synth_events.is_empty() {
        synth_events.sort_by_key(|e| e.sample);
        table.synth_notes = synth_events
            .iter()
            .filter(|e| matches!(e.kind, crate::synth::SynthEventKind::NoteOn { .. }))
            .count() as u32;
        table.synth = Some(Arc::new(crate::synth::SynthRing::new(rate)));
        table.synth_score = Some(Arc::new(crate::synth::SynthScore {
            events: synth_events,
            pass_samples: table.pass_samples,
            loops: table.loops,
            channel_track,
        }));
    }
    table.band = events;
    Ok(())
}

/// The MIDI channel a synthesised track gets, and the fader it answers to.
///
/// Channel 9 is skipped because it is percussion in every General MIDI set
/// ever written, and a guitar put on it plays a cymbal. Past the fifteen that
/// leaves, tracks share the last channel and so share a fader — which is what
/// MIDI itself does, and is a file with more parts than MIDI has channels.
fn claim_channel(next: &mut u8, map: &mut [u8; 16], track: u8) -> u8 {
    while *next < 16 && (*next == crate::synth::PERCUSSION_CHANNEL || map[*next as usize] != u8::MAX)
    {
        *next += 1;
    }
    let channel = (*next).min(15);
    if map[channel as usize] == u8::MAX {
        map[channel as usize] = track;
    }
    *next = channel.saturating_add(1);
    channel
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
