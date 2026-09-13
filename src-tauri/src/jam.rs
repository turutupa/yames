//! Jam — the band as a lookup table on the tick grid.
//!
//! The whole reason Jam is cheap and safe is that nothing about timing
//! changes (`plans/JAM_MODE.md` §6). Every hit the band plays lands on a tick
//! the metronome was going to play anyway; a rest is an empty column, never a
//! skipped tick. This module owns the two halves of that:
//!
//! * [`JamConfig`] — the serde mirror of `JamEngineConfig` in
//!   `src/jam/types.ts`, validated on receipt so a bad jam is *rejected* with
//!   a message rather than half-applied.
//! * [`JamTable`] — what the audio thread reads. One entry per tick of the
//!   bar, each holding up to six fixed-size `(sound, gain, ring-out)` slots —
//!   five drums and the bass.
//!   No `Vec` per tick, no allocation on the audio thread; the same
//!   discipline `accent_mask` follows. Compiled in the `set_jam` command and
//!   swapped in behind an `Arc`, which the callback only ever clones (a
//!   refcount bump, not an allocation).
//!
//! The contract the UI and the engine share: **the UI sets the engine's
//! subdivision to `ticksPerBeat` and its beat groups to `[beatsPerBar]`
//! before calling `set_jam`.** The engine checks the product against its own
//! bar length on every tick and plays the plain click when they disagree.
//! Nobody guesses. See `plans/tasks/jam/BRIEF.md`.

use serde::{Deserialize, Serialize};

use crate::engine::{
    jam_reference_sample, JamKit, KitVoice, SoundId, BASS_MAX_MIDI, BASS_MIN_MIDI, JAM_REFERENCE_SR,
};

// ---------------------------------------------------------------------------
// Limits — mirrored from src/jam/types.ts
// ---------------------------------------------------------------------------

/// The lanes a `JamPattern` carries: kick, snare, hat, ride, crash.
pub const JAM_PATTERN_LANES: usize = 5;

/// Five drums and the bass. The array on every tick is this wide, so a tick
/// is a fixed-size value the audio thread can read without a bounds surprise
/// or a heap touch.
pub const JAM_MAX_SLOTS: usize = JAM_PATTERN_LANES + 1;

/// `JAM_MAX_FORM_BARS` in `src/jam/types.ts`.
pub const JAM_MAX_FORM_BARS: u32 = 64;

/// The engine caps a bar at 16 beats (`validate_beat_groups`) and the
/// contract caps `ticksPerBeat` at 6, so no legal bar is longer than this.
pub const JAM_MAX_TICKS_PER_BAR: usize = 16 * 6;

/// Legal `ticksPerBeat` values, from the contract's union type.
const TICKS_PER_BEAT: [u32; 5] = [1, 2, 3, 4, 6];

/// Legal `fillEvery` values. 0 is "the last bar of the chorus only", which
/// is what a fill meant before this existed; the UI offers 4 and 8 and
/// nothing else, because a fill every bar or every two is not a fill, it is
/// the groove.
const FILL_EVERY: [u32; 3] = [0, 4, 8];

/// How loud a cell is, by level: 0 off, 1 hit, 2 accent, 3 ghost. Applied
/// *before* intensity and the master volume.
pub const LEVEL_GAIN: [f32; 4] = [0.0, 0.8, 1.0, 0.35];

/// The ride, trimmed.
///
/// Every kit file peaks at 0.900, so the engine carries the balance between
/// them (`src-tauri/sounds/KITS.md`). A ride is three to seven times longer
/// than a closed hat at the same peak, which is several times the energy: at
/// the hat's gain it would sit on top of the groove instead of under it.
/// 0.7 puts the ping where a drummer plays it. It is no longer the stand-in
/// the first pass had — each kit has a real ride now.
const RIDE_TRIM: f32 = 0.7;

/// The hat is capped at 0.9 of a tick, exactly like today's plain beat, so a
/// closed hat stays closed instead of smearing into the next sixteenth.
const HAT_CAP_TICKS: f32 = 0.9;

/// The ride rings three ticks — long enough to read as a wash under the
/// groove, short enough that a 16th-note ride pattern does not stack up.
const RIDE_CAP_TICKS: f32 = 3.0;

/// Peak the busiest tick of a table is allowed to reach, at the loudest
/// intensity the UI offers. A kick, a snare accent and a crash landing
/// together must not turn into a square wave: the mixer clamps, but clamping
/// is the sound of failure, not a plan.
///
/// 0.90 rather than the 0.97 the drum accent holds, because the table is
/// measured at one reference rate (see `JAM_REFERENCE_SR` in `engine.rs`)
/// and the resampler overshoots by up to 7% on the brightest sound in the
/// bank — the closed hat peaks at 0.554 in its own 44.1 kHz file, 0.690
/// resampled to 48 kHz and 0.736 resampled to 88.2 kHz. 0.90 × 1.07 is
/// still inside full scale on every device anyone has.
/// `the_jam_reference_bank_matches_the_real_one` in `engine.rs` is what
/// keeps that 7% honest.
const JAM_TICK_CEILING: f32 = 0.90;

/// The loudest the intensity control goes ("loud" in the contract).
///
/// The normalisation reserves room for it, which is the whole reason
/// intensity still does something on a busy groove. Normalise the table to
/// the ceiling and "loud" has nowhere left to go: soft, normal and loud all
/// come out at the same level, and the control the musician just turned does
/// nothing. So the table is scaled so that *loud* reaches the ceiling, and
/// normal and soft sit below it where they belong.
const JAM_LOUD_INTENSITY: f32 = 1.25;

/// Intensity bounds from the contract (soft 0.7, normal 1.0, loud 1.25).
/// Clamped rather than rejected: a jam saved by a future build with a wider
/// range should still play, just not deafen anyone. Anything above
/// [`JAM_LOUD_INTENSITY`] gets the ceiling and no more, so the range above
/// "loud" is flat rather than clipped.
const INTENSITY_MIN: f32 = 0.5;
const INTENSITY_MAX: f32 = 1.5;

/// `JamBassLine.gain` bounds from the contract. Clamped, never rejected, for
/// the same reason intensity is.
const BASS_GAIN_MIN: f32 = 0.5;
const BASS_GAIN_MAX: f32 = 1.5;

/// The fastest the metronome runs: `set_bpm` clamps to 20..=300. With the
/// contract's `ticksPerBeat` of 6 that is a tick every 33 ms, and a short
/// tick is what makes voices pile up — see [`worst_bar_peak`].
const MAX_BPM: f32 = 300.0;

/// How much further below the ceiling a table is held, to cover the one
/// thing a single render cannot see: overlapping copies of a drum interfere,
/// and whether they add or cancel depends on the tempo.
///
/// The numbers, measured across 40–300 BPM in 5 BPM steps on all four kits
/// at the tempo each table is normalised for:
///
/// * A busy but playable groove — the jitter probe's, sixteen ticks with
///   kick, snare, hats, ride and a walking bass — varies by at most 10%
///   across tempo, and only the electronic kit reaches that.
/// * The groove editor's extreme, every lane accented on every sixteenth,
///   varies by up to 20%, in humps a few BPM wide. Fine enough that a ladder
///   of tempos misses them and only a sweep of hundreds would catch them.
///
/// 1.10 covers everything in the first group at any tempo, any device rate
/// and full volume. The second group can touch the mixer's clamp above about
/// 0.85 volume, and that is the trade being made on purpose: covering it
/// would cost every groove in the library 1.9 dB to protect a pattern that
/// is a lawnmower rather than a beat. `the_busiest_groove_never_makes_the_mixer_clamp`
/// in `engine.rs` holds both halves of that claim to a number.
const INTERFERENCE_ALLOWANCE: f32 = 1.10;

// ---------------------------------------------------------------------------
// The config — serde mirror of JamEngineConfig
// ---------------------------------------------------------------------------

/// One bar, one row per drum. Every array has exactly
/// `beatsPerBar × ticksPerBeat` entries, tick 0 first.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamPattern {
    pub kick: Vec<u8>,
    pub snare: Vec<u8>,
    pub hat: Vec<u8>,
    pub ride: Vec<u8>,
    pub crash: Vec<u8>,
}

impl JamPattern {
    fn lanes(&self) -> [(JamLane, &[u8]); JAM_PATTERN_LANES] {
        [
            (JamLane::Kick, &self.kick),
            (JamLane::Snare, &self.snare),
            (JamLane::Hat, &self.hat),
            (JamLane::Ride, &self.ride),
            (JamLane::Crash, &self.crash),
        ]
    }
}

/// Which row of the table a slot came from.
///
/// It travels all the way to the audio thread because the practice windows
/// need it there: on a trading bar the drums drop to hats only, and "only
/// the hat lane" is a comparison the callback has to be able to make without
/// asking which sound a hat is (the answer differs per kit).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JamLane {
    Kick,
    Snare,
    Hat,
    Ride,
    Crash,
    /// Not a row of `JamPattern` — the bass is its own array in the config
    /// and is merged into the same ticks when the table is compiled, so the
    /// audio thread has one list to walk instead of two.
    Bass,
}

impl JamLane {
    fn name(self) -> &'static str {
        match self {
            Self::Kick => "kick",
            Self::Snare => "snare",
            Self::Hat => "hat",
            Self::Ride => "ride",
            Self::Crash => "crash",
            Self::Bass => "bass",
        }
    }
}

/// What the engine receives from `set_jam`. Field for field, camelCase, the
/// mirror of `JamEngineConfig`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamConfig {
    pub ticks_per_beat: u32,
    pub beats_per_bar: u32,
    /// The groove.
    pub bar: JamPattern,
    /// Played instead of `bar` on the last bar of every chorus, when set.
    #[serde(default)]
    pub fill: Option<JamPattern>,
    /// Bars in one chorus of the form, 1..64.
    pub form_bars: u32,
    /// A crash on tick 0 of bar 0 of every chorus.
    pub crash_on_one: bool,
    /// Gain multiplier on every hit, 0.5..1.5.
    pub intensity: f32,
    /// Which kit plays the lanes: "room", "tight", "brushes", "electronic".
    /// Anything else is "room" — see [`JamKit::from_name`].
    #[serde(default)]
    pub kit: String,
    /// The bass, when the band has one. Absent or null: no bass.
    #[serde(default)]
    pub bass: Option<JamBassLine>,
    /// The practice windows, applied per bar from the engine's own form
    /// counter so they land on bar lines. Absent or null: the band plays
    /// every bar.
    #[serde(default)]
    pub practice: Option<JamPracticeConfig>,
    /// Also play the fill on every bar whose 1-based number within the
    /// chorus is a multiple of this. Absent or 0: the last bar of the chorus
    /// only, which is what a fill has always meant here.
    #[serde(default)]
    pub fill_every: Option<u32>,
}

/// One MIDI note per tick, `0` for a rest, the same length as the drum
/// lanes. The mirror of `JamBassLine` in `src/jam/types.ts`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamBassLine {
    pub pitches: Vec<u8>,
    /// Gain multiplier on the bass voice, 0.5..1.5.
    pub gain: f32,
}

/// The mirror of `JamPracticeConfig` in `src/jam/types.ts`.
///
/// **Phase-locked to the chorus.** Both windows are read off the bar within
/// the chorus and start over at bar 0 of every chorus, so a silence lands on
/// the same chord every time round. `src/jam/practice.ts` is the same rule
/// in TypeScript — it is what draws the timeline, and if the two disagree
/// the drawn band and the heard band disagree. [`band_state_for_bar`] below
/// is the Rust half, and its tests are ported from `practice.test.ts`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamPracticeConfig {
    #[serde(default)]
    pub drop_out: Option<JamDropOut>,
    #[serde(default)]
    pub trade: Option<JamTrade>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamDropOut {
    pub every_bars: u32,
    pub bars: u32,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamTrade {
    pub band_bars: u32,
    pub you_bars: u32,
}

/// What the band is doing on a bar. Mirrored on every `BeatEvent` as
/// `bandState`, and `JamBandState` in `src/jam/types.ts` is the same three
/// words — `camelCase` gives "full", "hatsOnly", "silent".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum JamBandState {
    /// Everything the table says.
    Full,
    /// Your bars in a trade: the hat lane keeps the time and nothing else
    /// plays, bass included.
    HatsOnly,
    /// A drop-out bar. No drums, no bass — and no click either, because the
    /// point of the window is silence.
    Silent,
}

/// What the band does on bar `form_bar` of a chorus.
///
/// Line for line the rule in `src/jam/practice.ts`, and deliberately so: the
/// timeline draws the silence a bar before it arrives, and a band that
/// disagreed with the drawing would be worse than no drawing at all.
///
/// Drop-out: a window of `bars` bars opens at every multiple of `everyBars`
/// within the chorus, but never at bar 0 — the band always gets to state the
/// form first. Trading: from bar 0, `bandBars` bars of band then `youBars`
/// bars of hats, repeating. Drop-out wins where both apply, because silence
/// is the stronger instruction and the one that produces an honest score.
pub fn band_state_for_bar(
    form_bar: u32,
    form_bars: u32,
    practice: Option<&JamPracticeConfig>,
) -> JamBandState {
    let practice = match practice {
        Some(p) => p,
        None => return JamBandState::Full,
    };
    let form_bars = form_bars.max(1);
    let bar = form_bar % form_bars;

    if let Some(d) = practice.drop_out {
        if d.every_bars > 0 && d.bars > 0 && bar >= d.every_bars && bar % d.every_bars < d.bars {
            return JamBandState::Silent;
        }
    }
    if let Some(t) = practice.trade {
        let cycle = t.band_bars.saturating_add(t.you_bars);
        if t.band_bars > 0 && t.you_bars > 0 && cycle > 0 && bar % cycle >= t.band_bars {
            return JamBandState::HatsOnly;
        }
    }
    JamBandState::Full
}

// ---------------------------------------------------------------------------
// Moving through the form — jump and loop
// ---------------------------------------------------------------------------

/// The serde mirror of `JamPositionCommand` in `src/jam/types.ts`.
///
/// One command carries BOTH halves of where the form goes, and it replaces
/// both. Sending `{ jumpTo: 3, loop: null }` leaves the loop off; sending
/// `{ jumpTo: null, loop: { start: 8, end: 11 } }` sets a loop and asks for
/// no jump. That is the contract's "`loop` stays until replaced with null":
/// the *engine* keeps it between commands, and a command that names it
/// `null` is the thing that takes it away.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamPositionCommand {
    /// 0-based bar of the chorus to land on at the next bar line.
    #[serde(default)]
    pub jump_to: Option<u32>,
    /// Bars `start..=end`, 0-based within the chorus.
    ///
    /// Renamed by hand: `rename_all` would make this `loopBars`, and the
    /// contract's field is `loop` — which cannot be a Rust identifier.
    #[serde(default, rename = "loop")]
    pub loop_bars: Option<JamLoop>,
}

/// A loop range from the contract: inclusive at both ends, 0-based.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct JamLoop {
    pub start: u32,
    pub end: u32,
}

/// Where the form goes, as the audio thread reads it.
///
/// `Copy` and eight bytes wide on purpose: the callback takes a snapshot of
/// it behind a `try_lock` when the generation counter moves, and there is
/// nothing to free afterwards — no retirement path, no `Arc`, no allocation.
/// The table has all of that because it owns `Vec`s; this owns nothing.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct JamPosition {
    /// Consumed at the next bar line, then gone.
    pub jump: Option<u32>,
    /// Held until a command replaces it, or a new table makes it impossible.
    pub loop_bars: Option<(u32, u32)>,
}

impl JamPosition {
    /// What is left of this position once a table of `form_bars` bars is
    /// loaded (or `None` for no table at all).
    ///
    /// A pending jump is dropped: "bar 9" of a 12-bar blues and "bar 9" of
    /// an eight-bar loop are not the same place, and a jump the musician
    /// asked for against the old form is a worse answer than no jump. The
    /// loop is kept when it still fits, because a musician looping the
    /// turnaround while they edit the bass line means to keep looping it —
    /// and the bar-ahead bass send is a new table several times a chorus.
    #[must_use]
    pub fn for_table(self, form_bars: Option<u32>) -> Self {
        let loop_bars = match (self.loop_bars, form_bars) {
            (Some((s, e)), Some(n)) if e >= n || s > e => None,
            (keep, _) => keep,
        };
        Self {
            jump: None,
            loop_bars,
        }
    }
}

/// Check a `set_jam_position` command against the form that is loaded.
///
/// `form_bars` is `None` when no jam is loaded, and then nothing can be
/// checked and nothing is refused: the position is stored, ignored while
/// there is no band, and re-checked by [`JamPosition::for_table`] the moment
/// a table arrives. Refusing it instead would mean the order the UI happens
/// to send two commands in decides whether a loop survives.
pub fn validate_position(
    cmd: &JamPositionCommand,
    form_bars: Option<u32>,
) -> Result<JamPosition, String> {
    if let Some(l) = cmd.loop_bars {
        if l.start > l.end {
            return Err(format!(
                "the loop starts at bar {} and ends at bar {}; the start cannot be \
                 after the end",
                l.start + 1,
                l.end + 1
            ));
        }
    }
    if let Some(n) = form_bars {
        if let Some(j) = cmd.jump_to {
            if j >= n {
                return Err(format!(
                    "there is no bar {} to jump to; this form is {n} bars long",
                    j + 1
                ));
            }
        }
        if let Some(l) = cmd.loop_bars {
            if l.end >= n {
                return Err(format!(
                    "the loop ends at bar {}, and this form is {n} bars long",
                    l.end + 1
                ));
            }
        }
    }
    Ok(JamPosition {
        jump: cmd.jump_to,
        loop_bars: cmd.loop_bars.map(|l| (l.start, l.end)),
    })
}

// ---------------------------------------------------------------------------
// The compiled table
// ---------------------------------------------------------------------------

/// One drum, ready to spawn. `cap_ticks` is a ring-out limit in ticks — 0.0
/// means play the sample out, which is what a kick, a snare and a crash all
/// want. The callback turns it into samples with the tick length it already
/// computed, so the cap follows the tempo without anything being recompiled.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct JamSlot {
    pub sound: SoundId,
    pub gain: f32,
    pub cap_ticks: f32,
    /// Which row this came from. The practice windows read it on the audio
    /// thread — "hats only" is a lane, not a sound.
    pub lane: JamLane,
    /// Level 2. Carried per slot rather than only per tick so a trading bar
    /// can flash the dot on what is actually playing.
    pub accent: bool,
}

/// A placeholder for the unused tail of a tick's slot array. Gain 0.0, so
/// even a bug that read past `len` would be silent rather than loud.
const SILENT_SLOT: JamSlot = JamSlot {
    sound: SoundId::Kit(JamKit::Room, KitVoice::Kick),
    gain: 0.0,
    cap_ticks: 0.0,
    lane: JamLane::Kick,
    accent: false,
};

/// Everything the band plays on one tick.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct JamTick {
    slots: [JamSlot; JAM_MAX_SLOTS],
    len: u8,
    accent: bool,
}

impl JamTick {
    const EMPTY: Self = Self {
        slots: [SILENT_SLOT; JAM_MAX_SLOTS],
        len: 0,
        accent: false,
    };

    /// The drums on this tick. A slice of a fixed-size array — no allocation,
    /// nothing to free.
    #[inline]
    pub fn slots(&self) -> &[JamSlot] {
        &self.slots[..self.len as usize]
    }

    /// True when any lane is at level 2 here, which is what makes the UI's
    /// dots flash on the kick and the backbeat.
    #[inline]
    pub fn is_accent(&self) -> bool {
        self.accent
    }

    fn push(&mut self, slot: JamSlot) {
        if (self.len as usize) < JAM_MAX_SLOTS {
            self.slots[self.len as usize] = slot;
            self.len += 1;
        }
        self.accent |= slot.accent;
    }
}

/// What the audio thread reads. Immutable once compiled; the callback holds
/// an `Arc` to it and swaps in a new one when the generation counter moves.
#[derive(Debug)]
pub struct JamTable {
    ticks_per_bar: u32,
    form_bars: u32,
    bar: Vec<JamTick>,
    fill: Option<Vec<JamTick>>,
    /// Play the fill on every bar whose 1-based number in the chorus is a
    /// multiple of this, as well as on the last bar. 0 is the last bar only.
    fill_every: u32,
    /// The crash on the one, already mixed to the table's normalisation.
    /// `None` when the jam did not ask for one, or when the groove's own
    /// crash lane already hits tick 0 — two crashes on the same sample is a
    /// cymbal at double volume, not a bigger cymbal.
    crash_on_one: Option<JamSlot>,
    /// What the band does on each bar of the chorus, worked out once when
    /// the table is compiled. `form_bars` is at most 64, so this is a few
    /// dozen bytes and the audio thread indexes it instead of running the
    /// modulo arithmetic; the state is constant within a bar either way,
    /// which is what "decided at the bar line" means.
    band_states: Vec<JamBandState>,
    /// Which kit the lanes resolved to. Diagnostics and tests only.
    pub kit: JamKit,
    /// Whether any tick of the groove has a hat. A band without one — a
    /// drummer's band, which has no drums at all, or a groove drawn without
    /// hats — keeps its bass on your bars in a trade instead of going dead.
    has_hat: bool,
    /// Everything about the table EXCEPT the bass line, hashed. Two tables
    /// with the same signature are the same drummer under a different bass
    /// bar, and that is the case the audio thread defers to the next bar
    /// line (see [`swap_defers`]).
    drums_signature: u64,
    /// The loudest sample four bars of this band render, before and after
    /// the per-table normalisation, at the fastest tick the engine can
    /// produce. Diagnostics only; the audio thread never reads these.
    pub peak_before: f32,
    pub peak_after: f32,
    /// The same measurement at intensity 1.0 — the number the normalisation
    /// is computed from, and the one [`JamGainCache`] remembers so the next
    /// table with the same drums does not have to render four bars again.
    pub base_peak: f32,
}

impl JamTable {
    /// See the `has_hat` field.
    #[inline]
    pub fn has_hat(&self) -> bool {
        self.has_hat
    }

    /// What the band does on bar `form_bar` of the chorus. Out of range —
    /// which cannot happen, since the caller wraps at `form_bars` — reads as
    /// `Full`, so a bug is a band that plays rather than a panic.
    #[inline]
    pub fn band_state(&self, form_bar: u32) -> JamBandState {
        self.band_states
            .get(form_bar as usize)
            .copied()
            .unwrap_or(JamBandState::Full)
    }

    /// Ticks in one bar of this table: `ticksPerBeat × beatsPerBar`. The
    /// engine compares this against its own `beats_per_measure × subdivision`
    /// and falls back to the plain click when they disagree.
    #[inline]
    pub fn ticks_per_bar(&self) -> u32 {
        self.ticks_per_bar
    }

    /// Bars in one chorus of the form.
    #[inline]
    pub fn form_bars(&self) -> u32 {
        self.form_bars
    }

    /// The crash to add on tick 0 of bar 0 of a chorus, if any.
    #[inline]
    pub fn crash_on_one(&self) -> Option<JamSlot> {
        self.crash_on_one
    }

    /// Does this table have a fill bar?
    #[inline]
    pub fn has_fill(&self) -> bool {
        self.fill.is_some()
    }

    /// Does the fill play on bar `jam_bar` (0-based within the chorus)?
    ///
    /// Always on the last bar of the chorus — that is what a fill is — and,
    /// when `fillEvery` is set, on every bar whose 1-based number in the
    /// chorus is a multiple of it. With `fillEvery` 4 on a 12-bar blues that
    /// is bars 4, 8 and 12 as the musician counts them, which is where a
    /// drummer puts them.
    #[inline]
    pub fn fill_bar(&self, jam_bar: u32) -> bool {
        let counted = jam_bar + 1;
        counted >= self.form_bars || (self.fill_every > 0 && counted % self.fill_every == 0)
    }

    /// What the band plays at `tick_index` of bar `jam_bar` (0-based within
    /// the chorus). The fill replaces the groove on the bars
    /// [`JamTable::fill_bar`] names, when the jam has one.
    ///
    /// `None` only when the tick index is outside the bar, which the caller
    /// has already ruled out by comparing `ticks_per_bar`; it is a bounds
    /// check, not a decision.
    #[inline]
    pub fn tick(&self, tick_index: u32, jam_bar: u32) -> Option<&JamTick> {
        let table = match self.fill {
            Some(ref f) if self.fill_bar(jam_bar) => f,
            _ => &self.bar,
        };
        table.get(tick_index as usize)
    }
}

/// How many measurements the memo remembers.
///
/// One per bar of the longest chorus the contract allows, because that is
/// the shape of the traffic: the bar-ahead handshake sends the SAME handful
/// of bass bars round and round, one per chord of the form, every chorus. A
/// memo this size covers any form the app can hold, so after the first time
/// round nothing is ever measured twice. It costs twelve bytes an entry.
const JAM_GAIN_MEMO: usize = JAM_MAX_FORM_BARS as usize;

/// The normalisations the command thread has already worked out.
///
/// [`compile`] renders four bars of the band to find out how loud it
/// actually is, and that render is the expensive part of loading a jam. It
/// runs on every `set_jam` — and the UI sends one four to six times a
/// chorus, because the bar-ahead bass has to arrive a bar early
/// (`useJamSession.ts`). Those sends walk the same few bass bars round the
/// form again and again, so from the second chorus on, every one of them is
/// asking for a number that has already been measured.
///
/// **The key is the whole table, bass included** ([`render_signature`]) —
/// not the drums alone. Keying on the drums and letting a changed bass share
/// the answer looks safe and is not: measured on the jitter probe's groove,
/// moving `bass.gain` across the range the contract allows (0.5 to 1.5, and
/// the store can hold either) moves the rendered peak of the room kit from
/// 2.08 to 2.95, and changing which note sits under the crash on the one
/// moves it another 8%. Both are far more than the 10%
/// [`INTERFERENCE_ALLOWANCE`] the ceiling holds in reserve. Normalising a
/// loud bass against a quiet one's measurement renders 1.075 at full volume
/// on the room kit, which is the mixer clamping — the exact thing
/// `the_busiest_groove_never_makes_the_mixer_clamp` exists to forbid.
///
/// A hit is therefore the same table, and the number it hands back is the
/// number a cold compile would have produced, bit for bit.
///
/// Two things are deliberately left OUT of the key, because neither can
/// change the measurement:
///
/// * **Intensity.** The table is compiled at 1.0 and rendered at 1.0; the
///   musician's dial is applied afterwards. So dragging the intensity
///   slider re-uses the measurement instead of re-rendering four bars per
///   frame of the drag.
/// * **The practice windows.** They decide which bars the band plays, never
///   what a bar sounds like.
///
/// `the_gain_cache_never_lets_a_changed_bass_reach_the_clamp` in `engine.rs`
/// is what holds that to a number: it renders every kit at every rate and
/// across the tempo range with the memo in play.
pub struct JamGainCache {
    memo: std::sync::Mutex<GainMemo>,
}

/// A ring of remembered measurements. Small and linear on purpose: sixty-four
/// `u64` comparisons on the command thread is nothing, and a `HashMap` here
/// would be a data structure to explain rather than one to read.
struct GainMemo {
    entries: Vec<(u64, f32)>,
    next: usize,
}

impl Default for JamGainCache {
    fn default() -> Self {
        Self::new()
    }
}

impl JamGainCache {
    pub fn new() -> Self {
        Self {
            memo: std::sync::Mutex::new(GainMemo {
                entries: Vec::with_capacity(JAM_GAIN_MEMO),
                next: 0,
            }),
        }
    }

    /// The remembered peak for this exact table, if it has been measured.
    fn get(&self, signature: u64) -> Option<f32> {
        match self.memo.lock() {
            Ok(m) => m
                .entries
                .iter()
                .find(|&&(sig, _)| sig == signature)
                .map(|&(_, peak)| peak),
            // A poisoned memo is a memo miss, never a wrong number: the
            // render is the source of truth and only ever costs time.
            Err(_) => None,
        }
    }

    fn put(&self, signature: u64, peak: f32) {
        if let Ok(mut m) = self.memo.lock() {
            if m.entries.len() < JAM_GAIN_MEMO {
                m.entries.push((signature, peak));
                return;
            }
            let slot = m.next % JAM_GAIN_MEMO;
            m.entries[slot] = (signature, peak);
            m.next = slot + 1;
        }
    }
}

// ---------------------------------------------------------------------------
// Compiling
// ---------------------------------------------------------------------------

/// Validate a config and compile it into the table the audio thread reads.
///
/// Runs in the `set_jam` command — never on the audio thread. A config that
/// does not check out is rejected whole: the engine keeps whatever it had,
/// so a malformed jam can never leave the band half-loaded.
pub fn compile(cfg: &JamConfig) -> Result<JamTable, String> {
    compile_measured(cfg, None)
}

/// [`compile`], reusing the normalisation the same drums produced last time.
///
/// This is the entry point `set_jam` uses. See [`JamGainCache`] for what is
/// being reused and why a changed bass line may share it.
pub fn compile_with(cfg: &JamConfig, cache: &JamGainCache) -> Result<JamTable, String> {
    let signature = render_signature(cfg);
    let remembered = cache.get(signature);
    let table = compile_measured(cfg, remembered)?;
    if remembered.is_none() {
        cache.put(signature, table.base_peak);
    }
    Ok(table)
}

/// `base_peak`, when the caller already knows it, skips the four-bar render.
/// `None` measures it.
fn compile_measured(cfg: &JamConfig, base_peak: Option<f32>) -> Result<JamTable, String> {
    if !TICKS_PER_BEAT.contains(&cfg.ticks_per_beat) {
        return Err(format!(
            "ticksPerBeat is {}, which is not one of {:?}",
            cfg.ticks_per_beat, TICKS_PER_BEAT
        ));
    }
    if cfg.beats_per_bar < 1 || cfg.beats_per_bar > 16 {
        return Err(format!(
            "beatsPerBar is {}, and a bar is 1 to 16 beats",
            cfg.beats_per_bar
        ));
    }
    if cfg.form_bars < 1 || cfg.form_bars > JAM_MAX_FORM_BARS {
        return Err(format!(
            "formBars is {}, and a chorus is 1 to {} bars",
            cfg.form_bars, JAM_MAX_FORM_BARS
        ));
    }
    let fill_every = cfg.fill_every.unwrap_or(0);
    if !FILL_EVERY.contains(&fill_every) {
        return Err(format!(
            "fillEvery is {fill_every}; a fill lands every 4 or 8 bars, or 0 for \
             the end of the chorus only"
        ));
    }

    let ticks = cfg.ticks_per_beat * cfg.beats_per_bar;
    debug_assert!(ticks as usize <= JAM_MAX_TICKS_PER_BAR);

    // Clamped, not rejected. See INTENSITY_MIN.
    let intensity = if cfg.intensity.is_finite() {
        cfg.intensity.clamp(INTENSITY_MIN, INTENSITY_MAX)
    } else {
        1.0
    };

    // Which drums. Resolved here, once, so the audio thread never sees a
    // string and never asks which kit a lane belongs to.
    let kit = JamKit::from_name(&cfg.kit);

    // Compiled at intensity 1.0 and scaled once at the end, so the
    // normalisation below can see the groove's own shape rather than the
    // shape times whatever the musician set the dial to.
    let mut bar = compile_pattern(&cfg.bar, ticks, kit, "bar")?;
    let mut fill = match cfg.fill {
        Some(ref f) => Some(compile_pattern(f, ticks, kit, "fill")?),
        None => None,
    };

    // The bass goes into the same ticks the drums are in — one list for the
    // audio thread to walk — and into the fill as well as the groove: a bass
    // player keeps walking while the drummer plays a fill.
    if let Some(ref line) = cfg.bass {
        let slots = compile_bass(line, ticks)?;
        for (i, slot) in slots.iter().enumerate() {
            if let Some(s) = *slot {
                bar[i].push(s);
                if let Some(ref mut f) = fill {
                    f[i].push(s);
                }
            }
        }
    }

    // The crash on the one. Level 2, because arriving at the top of the form
    // is the loudest thing the band does; the groove's own crash lane keeps
    // whatever level it was written with.
    let mut crash = if cfg.crash_on_one {
        let already = bar
            .first()
            .map(|t| t.slots().iter().any(|s| s.lane == JamLane::Crash))
            .unwrap_or(false);
        if already {
            None
        } else {
            Some(JamSlot {
                sound: SoundId::Kit(kit, KitVoice::Crash),
                gain: LEVEL_GAIN[2],
                cap_ticks: 0.0,
                lane: JamLane::Crash,
                accent: true,
            })
        }
    } else {
        None
    };

    // ---- The loudest sample the band renders, measured rather than
    // guessed ----
    //
    // Summing each sound's *peak* would be an upper bound and a bad one:
    // these transients do not land on the same sample (the kick's peak is
    // milliseconds in, the hat's is immediate), so a peak-sum says a full
    // band tick is three times full scale when the rendered sum is nowhere
    // near that. A table scaled by that bound would be inaudible. So the
    // band is actually rendered, once, here — off the audio thread, only
    // when the jam changes.
    //
    // Unless the caller already knows the answer: the same drums under a
    // different bass bar render the same peak, and the UI sends one of those
    // several times a chorus. See [`JamGainCache`].
    let base_peak = base_peak.unwrap_or_else(|| {
        worst_bar_peak(
            &bar,
            fill.as_deref(),
            crash,
            cfg.form_bars,
            cfg.ticks_per_beat,
        )
    });

    // Scale so that the loudest sample reaches the ceiling at LOUD and not
    // before, then apply the intensity the musician actually chose. A table
    // quiet enough not to need it keeps its level exactly.
    // The ceiling the arithmetic below actually aims at: the published one,
    // minus the room a tempo this render did not see could take.
    let ceiling = JAM_TICK_CEILING / INTERFERENCE_ALLOWANCE;
    let headroom = base_peak * JAM_LOUD_INTENSITY;
    let norm = if headroom > ceiling {
        ceiling / headroom
    } else {
        1.0
    };
    let mut total = norm * intensity;
    // Above "loud" the range goes flat rather than clipping. Nothing the UI
    // can send reaches here; a store written by a future build can.
    if base_peak * total > ceiling {
        total = ceiling / base_peak;
    }
    if total != 1.0 {
        scale(&mut bar, total);
        if let Some(ref mut f) = fill {
            scale(f, total);
        }
        if let Some(ref mut c) = crash {
            c.gain *= total;
        }
    }
    // What the busiest tick would have peaked at with no normalisation, and
    // what it peaks at now.
    let peak_before = base_peak * intensity;
    let peak_after = base_peak * total;

    // One state per bar of the chorus, decided now rather than on the audio
    // thread. Phase-locked, so this is the same list every chorus.
    let band_states: Vec<JamBandState> = (0..cfg.form_bars)
        .map(|b| band_state_for_bar(b, cfg.form_bars, cfg.practice.as_ref()))
        .collect();

    let has_hat = bar
        .iter()
        .any(|t| t.slots().iter().any(|s| s.lane == JamLane::Hat));
    Ok(JamTable {
        ticks_per_bar: ticks,
        form_bars: cfg.form_bars,
        bar,
        fill,
        fill_every,
        crash_on_one: crash,
        band_states,
        kit,
        has_hat,
        drums_signature: drums_signature(cfg),
        peak_before,
        peak_after,
        base_peak,
    })
}

/// A hash of every field of the config except the bass line.
///
/// The UI posts the NEXT bar's bass on the downbeat of the current one
/// (`useJamSession.ts`, "the half of the handshake the engine has to
/// match"), so most configs the engine receives while playing differ from
/// the one it holds only in `bass`. Those must wait for the bar line, or
/// every bar plays the next bar's bass. A config that changes anything else
/// — the groove, the kit, the intensity, the form, the practice windows —
/// is the musician turning a dial, and that applies at once.
fn drums_signature(cfg: &JamConfig) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::Hasher;
    let mut h = DefaultHasher::new();
    hash_drums(cfg, &mut h);
    h.finish()
}

/// Everything that decides what four bars of this band RENDER — the drums
/// and the bass — and nothing that does not.
///
/// The key [`JamGainCache`] remembers a measurement under. It is deliberately
/// a different question from [`drums_signature`]: that one asks "is this the
/// same drummer, so the swap can wait for the bar line?", this one asks "is
/// this the same sound, so the measurement still holds?". The bass answers
/// the second and not the first, which is the whole point of having two.
fn render_signature(cfg: &JamConfig) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    hash_drums(cfg, &mut h);
    match cfg.bass {
        Some(ref b) => {
            true.hash(&mut h);
            b.pitches.hash(&mut h);
            // The clamped value, because that is the one the render uses:
            // two stores holding 2.0 and 3.0 are the same bass at 1.5.
            let gain = if b.gain.is_finite() {
                b.gain.clamp(BASS_GAIN_MIN, BASS_GAIN_MAX)
            } else {
                1.0
            };
            gain.to_bits().hash(&mut h);
        }
        None => false.hash(&mut h),
    }
    h.finish()
}

/// The half both signatures share.
///
/// `intensity` is in here because [`swap_defers`] needs it: turning the band
/// up is a change you have to hear now, not at the next bar line. The memo
/// would not have needed it — the table is compiled and rendered at 1.0 and
/// scaled afterwards, so intensity cannot move the measurement — and it
/// costs one render per intensity. The UI offers three, so the memo holds
/// three entries for the same groove instead of one. That is cheaper than a
/// third signature to explain.
fn hash_drums(cfg: &JamConfig, h: &mut impl std::hash::Hasher) {
    use std::hash::Hash;
    cfg.ticks_per_beat.hash(h);
    cfg.beats_per_bar.hash(h);
    for p in std::iter::once(&cfg.bar).chain(cfg.fill.iter()) {
        p.kick.hash(h);
        p.snare.hash(h);
        p.hat.hash(h);
        p.ride.hash(h);
        p.crash.hash(h);
    }
    cfg.fill.is_some().hash(h);
    // Which bars the fill lands on is the drummer's business, not the bass
    // player's: turning it on has to be heard now, and it changes which bar
    // of the table the loudest tick lives in.
    cfg.fill_every.unwrap_or(0).hash(h);
    cfg.form_bars.hash(h);
    cfg.crash_on_one.hash(h);
    cfg.intensity.to_bits().hash(h);
    format!("{:?}", JamKit::from_name(&cfg.kit)).hash(h);
    match cfg.practice {
        Some(ref p) => {
            true.hash(h);
            match p.drop_out {
                Some(d) => (true, d.every_bars, d.bars).hash(h),
                None => false.hash(h),
            }
            match p.trade {
                Some(t) => (true, t.band_bars, t.you_bars).hash(h),
                None => false.hash(h),
            }
        }
        None => false.hash(h),
    }
}

/// Should the audio thread hold `incoming` until the next bar line instead
/// of playing it now?
///
/// Only when the band is actually playing a table, the new one is the same
/// drummer (same signature, same bar length) and just the bass moved. A
/// table arriving while stopped, during the count-in, while no table is
/// loaded, or with a different groove applies immediately: the first three
/// have no bar line to wait for that matters, and the last is the musician
/// asking for a change they want to hear now.
pub fn swap_defers(
    active: Option<&JamTable>,
    incoming: Option<&JamTable>,
    playing: bool,
    warming_up: bool,
) -> bool {
    if !playing || warming_up {
        return false;
    }
    match (active, incoming) {
        (Some(a), Some(n)) => {
            a.drums_signature == n.drums_signature && a.ticks_per_bar == n.ticks_per_bar
        }
        _ => false,
    }
}

/// The bass line as one optional slot per tick.
///
/// The cap is the whole rule: a note rings until the next note or the end of
/// the bar, whichever comes first. Without it a walking line at any tempo
/// slower than the note's own 450 ms turns into a chord — four roots and a
/// fifth all sounding at once — which is the difference between a bass
/// player and a drone.
fn compile_bass(line: &JamBassLine, ticks: u32) -> Result<Vec<Option<JamSlot>>, String> {
    if line.pitches.len() != ticks as usize {
        return Err(format!(
            "bass.pitches has {} entries, and this bar is {ticks} ticks long",
            line.pitches.len()
        ));
    }
    for (i, &p) in line.pitches.iter().enumerate() {
        if p != 0 && !(BASS_MIN_MIDI..=BASS_MAX_MIDI).contains(&p) {
            return Err(format!(
                "bass.pitches tick {i} is MIDI {p}; the bass runs {BASS_MIN_MIDI} to \
                 {BASS_MAX_MIDI} (E1 to G3), and 0 is a rest"
            ));
        }
    }
    // Clamped, not rejected. See INTENSITY_MIN.
    let gain = if line.gain.is_finite() {
        line.gain.clamp(BASS_GAIN_MIN, BASS_GAIN_MAX)
    } else {
        1.0
    };

    let n = ticks as usize;
    let mut out: Vec<Option<JamSlot>> = vec![None; n];
    for i in 0..n {
        if line.pitches[i] == 0 {
            continue;
        }
        let next = (i + 1..n).find(|&j| line.pitches[j] != 0).unwrap_or(n);
        out[i] = Some(JamSlot {
            sound: SoundId::Bass(line.pitches[i] - BASS_MIN_MIDI),
            gain,
            cap_ticks: (next - i) as f32,
            lane: JamLane::Bass,
            // A bass note is never an accent: the dots mark the drummer's
            // backbeat, and a walking line would have every one of them lit.
            accent: false,
        });
    }
    Ok(out)
}

fn compile_pattern(
    pattern: &JamPattern,
    ticks: u32,
    kit: JamKit,
    what: &str,
) -> Result<Vec<JamTick>, String> {
    let mut out = vec![JamTick::EMPTY; ticks as usize];
    for (lane, cells) in pattern.lanes() {
        if cells.len() != ticks as usize {
            return Err(format!(
                "{what}.{} has {} cells, and this bar is {ticks} ticks long",
                lane.name(),
                cells.len(),
            ));
        }
        for (i, &level) in cells.iter().enumerate() {
            if level > 3 {
                return Err(format!(
                    "{what}.{} tick {i} is level {level}; levels are 0 off, \
                     1 hit, 2 accent, 3 ghost",
                    lane.name()
                ));
            }
            if level == 0 {
                continue;
            }
            if let Some(slot) = slot_for(lane, level, kit) {
                out[i].push(slot);
            }
        }
    }
    Ok(out)
}

/// Lane, level and kit to a sound, a gain and a ring-out. Intensity is NOT
/// applied here: the table is compiled at its own level and scaled once, so
/// the normalisation can measure the groove's shape rather than the shape
/// times whatever the musician set the dial to.
///
/// This is the only place a lane becomes a sound, and it happens in the
/// `set_jam` command. The audio thread receives a `SoundId` and never learns
/// which kit is loaded.
fn slot_for(lane: JamLane, level: u8, kit: JamKit) -> Option<JamSlot> {
    let g = LEVEL_GAIN[level as usize];
    if g <= 0.0 {
        return None;
    }
    let (voice, gain, cap_ticks) = match lane {
        // The kick and the snare are the pulse. They ring out: a kick cut at
        // 0.9 of a sixteenth at 240 BPM is a click, not a drum.
        JamLane::Kick => (KitVoice::Kick, g, 0.0),
        // An accent is the same drum hit harder (rule 4 of KITS.md), which
        // is why `snare_hi` and `snare_lo` share their shell modes in every
        // kit. `snare_lo` is NOT pre-attenuated — the level gain is what
        // makes it a backbeat or a ghost note.
        JamLane::Snare => {
            let voice = if level == 2 {
                KitVoice::SnareHi
            } else {
                KitVoice::SnareLo
            };
            (voice, g, 0.0)
        }
        JamLane::Hat => (KitVoice::Hat, g, HAT_CAP_TICKS),
        JamLane::Ride => (KitVoice::Ride, g * RIDE_TRIM, RIDE_CAP_TICKS),
        JamLane::Crash => (KitVoice::Crash, g, 0.0),
        // The bass has its own array in the config and its own compiler.
        JamLane::Bass => return None,
    };
    Some(JamSlot {
        sound: SoundId::Kit(kit, voice),
        gain,
        cap_ticks,
        lane,
        accent: level == 2,
    })
}

fn scale(ticks: &mut [JamTick], factor: f32) {
    for t in ticks.iter_mut() {
        for s in t.slots[..t.len as usize].iter_mut() {
            s.gain *= factor;
        }
    }
}

/// Render four bars of the band and return the loudest sample in them.
///
/// THIS USED TO MEASURE ONE TICK AT A TIME, AND ONE TICK IS NOT WHAT CLIPS.
///
/// A tick-at-a-time measurement sees only the drums that *start* together.
/// What reaches the mixer is those plus everything still ringing from the
/// ticks before, and with real kit samples that is most of the level: a
/// brushes crash runs 700 ms, a ride 400, a snare 220 — at 300 BPM
/// sixteenths a tick is 50 ms, so a dozen voices are alive at any moment.
/// Measured per tick the busiest editor groove came out at exactly the
/// ceiling and rendered at 1.33, which is a third of a bar of square wave
/// on any machine whose volume is up.
///
/// So the band is rendered the way the callback mixes it, at the fastest
/// tick the engine can produce — [`MAX_BPM`] at this table's own
/// `ticksPerBeat`, because a shorter tick is what stacks voices. A jam
/// played slower than that has more room, never less; a sparse groove
/// stacks nothing and is not scaled at all. The cost lands exactly where it
/// should: on the tables dense enough to need it.
///
/// Four bars, in the order the band plays them around the top of the form:
/// bar 0 with the crash on it, two of the groove, then the bar that plays
/// last in the chorus (the fill, when there is one) and bar 0 again. The
/// crash is measured TWICE on purpose — once cold at the start of playback
/// and once with a bar of ring-out under it — because a tail carries a sign
/// and can subtract as easily as it adds. Measuring only the second was
/// worth 11% of the level on the room kit, in the wrong direction.
///
/// ONE TEMPO IS NOT ENOUGH EITHER, AND NO PRACTICAL NUMBER OF THEM IS.
/// Overlapping copies of a tonal drum interfere, so the rendered peak is not
/// monotone in tempo and not even smooth in it: the room kit's busiest
/// groove renders 1.00 at 300 BPM, 1.00 at 240 and 1.21 at 272. The humps
/// are a few BPM wide, so a ladder of tempos would miss them and a sweep
/// fine enough to catch them is hundreds of renders per jam. That is what
/// [`INTERFERENCE_ALLOWANCE`] is for: measure at the fastest tick, then hold
/// the table that much further down.
///
/// Allocates freely: this is the `set_jam` command thread, once per jam.
fn worst_bar_peak(
    bar: &[JamTick],
    fill: Option<&[JamTick]>,
    crash: Option<JamSlot>,
    form_bars: u32,
    ticks_per_beat: u32,
) -> f32 {
    let ticks = bar.len();
    if ticks == 0 {
        return 0.0;
    }
    let tick_samples =
        (JAM_REFERENCE_SR as f64 * 60.0 / MAX_BPM as f64 / ticks_per_beat.max(1) as f64) as usize;
    if tick_samples == 0 {
        return 0.0;
    }

    // A one-bar form makes the FILL bar 0 as well as the last bar, so the
    // crash lands on the fill's first tick there and on the groove's
    // everywhere else.
    let last = fill.unwrap_or(bar);
    let zero = if form_bars == 1 { last } else { bar };
    let sequence = [zero, bar, last, zero];
    const CRASH_BARS: [usize; 2] = [0, 3];

    let total = sequence.len() * ticks * tick_samples;
    let mut acc = vec![0.0f32; total];
    for (b, bar_ticks) in sequence.iter().enumerate() {
        for (i, t) in bar_ticks.iter().enumerate() {
            let start = (b * ticks + i) * tick_samples;
            let extra = if CRASH_BARS.contains(&b) && i == 0 {
                crash
            } else {
                None
            };
            for slot in t.slots().iter().chain(extra.iter()) {
                let buf = jam_reference_sample(slot.sound);
                // The callback's own arithmetic: `cap_ticks` becomes samples
                // with the tick length, 0.0 means play the sample out.
                let limit = if slot.cap_ticks > 0.0 {
                    ((tick_samples as f32 * slot.cap_ticks) as usize).min(buf.len())
                } else {
                    buf.len()
                };
                let n = limit.min(total.saturating_sub(start));
                for (a, v) in acc[start..start + n].iter_mut().zip(buf.iter()) {
                    *a += v * slot.gain;
                }
            }
        }
    }
    acc.iter().fold(0.0f32, |m, v| m.max(v.abs()))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    mod deferral {
        use super::super::*;

        fn cfg(bass: Option<Vec<u8>>, kit: &str) -> JamConfig {
            let z = vec![0u8; 8];
            let mut kick = z.clone();
            kick[0] = 2;
            JamConfig {
                ticks_per_beat: 2,
                beats_per_bar: 4,
                bar: JamPattern {
                    kick,
                    snare: z.clone(),
                    hat: vec![1u8; 8],
                    ride: z.clone(),
                    crash: z.clone(),
                },
                fill: None,
                form_bars: 12,
                crash_on_one: true,
                intensity: 1.0,
                kit: kit.to_string(),
                bass: bass.map(|pitches| JamBassLine { pitches, gain: 1.0 }),
                practice: None,
                fill_every: None,
            }
        }

        #[test]
        fn a_bass_only_change_waits_for_the_bar_line() {
            let a = compile(&cfg(Some(vec![33, 0, 0, 0, 40, 0, 0, 0]), "room")).unwrap();
            let n = compile(&cfg(Some(vec![38, 0, 0, 0, 45, 0, 0, 0]), "room")).unwrap();
            assert_eq!(a.drums_signature, n.drums_signature);
            assert!(swap_defers(Some(&a), Some(&n), true, false));
        }

        #[test]
        fn a_kit_change_plays_now() {
            let a = compile(&cfg(Some(vec![33, 0, 0, 0, 40, 0, 0, 0]), "room")).unwrap();
            let n = compile(&cfg(Some(vec![33, 0, 0, 0, 40, 0, 0, 0]), "tight")).unwrap();
            assert_ne!(a.drums_signature, n.drums_signature);
            assert!(!swap_defers(Some(&a), Some(&n), true, false));
        }

        #[test]
        fn nothing_waits_while_stopped_counting_in_or_unloaded() {
            let a = compile(&cfg(Some(vec![33, 0, 0, 0, 40, 0, 0, 0]), "room")).unwrap();
            let n = compile(&cfg(Some(vec![38, 0, 0, 0, 45, 0, 0, 0]), "room")).unwrap();
            assert!(!swap_defers(Some(&a), Some(&n), false, false));
            assert!(!swap_defers(Some(&a), Some(&n), true, true));
            assert!(!swap_defers(None, Some(&n), true, false));
            assert!(!swap_defers(Some(&a), None, true, false));
        }
    }

    use super::*;

    /// The room kit's voice for `v`. Most of these tests predate kits and
    /// asserted on a bare `SoundId`; what they were really checking is that
    /// the lane reached the right drum, and "room" is the kit they were
    /// written against.
    fn room(v: KitVoice) -> SoundId {
        SoundId::Kit(JamKit::Room, v)
    }

    /// A 4/4 rock bar at 8ths: kick on 1 and 3, snare on 2 and 4, hat
    /// throughout. The shape every other fixture here is built from.
    fn rock_8ths() -> JamConfig {
        JamConfig {
            ticks_per_beat: 2,
            beats_per_bar: 4,
            bar: JamPattern {
                kick: vec![1, 0, 0, 0, 1, 0, 0, 0],
                snare: vec![0, 0, 2, 0, 0, 0, 2, 0],
                hat: vec![1, 3, 1, 3, 1, 3, 1, 3],
                ride: vec![0; 8],
                crash: vec![0; 8],
            },
            fill: None,
            form_bars: 4,
            crash_on_one: false,
            intensity: 1.0,
            kit: "room".into(),
            bass: None,
            practice: None,
            fill_every: None,
        }
    }

    #[test]
    fn a_valid_groove_compiles_to_the_slots_it_names() {
        let t = compile(&rock_8ths()).expect("the rock groove must compile");
        assert_eq!(t.ticks_per_bar(), 8);
        assert_eq!(t.form_bars(), 4);
        assert!(!t.has_fill());

        // Tick 0: kick + hat, no snare.
        let tick0 = t.tick(0, 0).unwrap();
        assert_eq!(tick0.slots().len(), 2);
        assert_eq!(tick0.slots()[0].sound, room(KitVoice::Kick));
        assert_eq!(tick0.slots()[1].sound, room(KitVoice::Hat));
        assert!(!tick0.is_accent(), "the kick is a hit here, not an accent");

        // Tick 2 is beat 2: the backbeat, an accent, on the high snare.
        let back = t.tick(2, 0).unwrap();
        assert!(back.is_accent(), "a level-2 snare must read as an accent");
        assert!(back.slots().iter().any(|s| s.sound == room(KitVoice::SnareHi)));

        // Tick 1 is a ghosted hat and nothing else.
        let off = t.tick(1, 0).unwrap();
        assert_eq!(off.slots().len(), 1);
        assert_eq!(off.slots()[0].sound, room(KitVoice::Hat));
    }

    /// Hit 0.8, accent 1.0, ghost 0.35 — the contract's levels, as ratios.
    ///
    /// Ratios rather than absolutes because the per-table normalisation
    /// scales the whole table by one number; what the contract fixes is the
    /// shape of the groove, not how far the master fader has been pulled
    /// down to make room for "loud".
    #[test]
    fn levels_map_to_the_gains_the_contract_states() {
        // One lane at a time, so nothing else is in the sum.
        let mut cfg = rock_8ths();
        cfg.bar.kick = vec![1, 2, 3, 0, 0, 0, 0, 0];
        cfg.bar.snare = vec![0; 8];
        cfg.bar.hat = vec![0; 8];
        let t = compile(&cfg).unwrap();

        let gain = |i| t.tick(i, 0).unwrap().slots()[0].gain;
        let accent = gain(1);
        assert!(accent > 0.0, "the accent came out silent");
        assert!(
            (gain(0) / accent - 0.8).abs() < 1e-5,
            "a hit is 0.8 of an accent, got {}",
            gain(0) / accent
        );
        assert!(
            (gain(2) / accent - 0.35).abs() < 1e-5,
            "a ghost is 0.35 of an accent, got {}",
            gain(2) / accent
        );
        assert_eq!(t.tick(3, 0).unwrap().slots().len(), 0, "level 0 is silence");
    }

    /// The ride is its own cymbal now, and it is trimmed under the hat.
    ///
    /// It used to be the closed hat at 0.6 because no ride sample existed.
    /// There are four of them now, and the trim stays for a different
    /// reason: every kit file peaks at 0.900, and a ride is three to seven
    /// times longer than a hat at that peak. Same ceiling, several times the
    /// energy — at the hat's gain the ride would be the loudest thing in the
    /// bar.
    #[test]
    fn the_ride_is_its_own_cymbal_and_sits_under_the_hat() {
        let mut cfg = rock_8ths();
        cfg.bar.kick = vec![0; 8];
        cfg.bar.snare = vec![0; 8];
        cfg.bar.hat = vec![1, 0, 0, 0, 0, 0, 0, 0];
        cfg.bar.ride = vec![0, 1, 0, 0, 0, 0, 0, 0];
        let t = compile(&cfg).unwrap();
        let hat = t.tick(0, 0).unwrap().slots()[0];
        let ride = t.tick(1, 0).unwrap().slots()[0];
        assert_eq!(hat.sound, room(KitVoice::Hat));
        assert_eq!(ride.sound, room(KitVoice::Ride), "the ride is the ride");
        assert!((ride.gain - hat.gain * RIDE_TRIM).abs() < 1e-6);
        assert!(ride.cap_ticks > hat.cap_ticks, "the ride rings longer");
    }

    #[test]
    fn the_kick_and_the_snare_ring_out_and_the_hat_does_not() {
        let t = compile(&rock_8ths()).unwrap();
        for s in t.tick(0, 0).unwrap().slots() {
            match s.lane {
                JamLane::Kick => assert_eq!(s.cap_ticks, 0.0, "a kick must ring out"),
                JamLane::Hat => assert!((s.cap_ticks - 0.9).abs() < 1e-6),
                other => panic!("unexpected lane {other:?} on tick 0"),
            }
        }
        let snare = t.tick(2, 0).unwrap().slots()[0];
        assert_eq!(snare.cap_ticks, 0.0, "a snare must ring out");
    }

    #[test]
    fn a_lane_of_the_wrong_length_is_rejected_whole() {
        let mut cfg = rock_8ths();
        cfg.bar.hat = vec![1, 1, 1, 1]; // half a bar
        let err = compile(&cfg).expect_err("a short lane must be rejected");
        assert!(err.contains("hat"), "the message must name the lane: {err}");
        assert!(err.contains('4'), "and how many cells it had: {err}");

        // And the same rule inside a fill.
        let mut cfg = rock_8ths();
        let mut fill = cfg.bar.clone();
        fill.snare = vec![1; 9];
        cfg.fill = Some(fill);
        let err = compile(&cfg).expect_err("a short fill lane must be rejected");
        assert!(err.contains("fill.snare"), "{err}");
    }

    #[test]
    fn an_impossible_level_or_meter_is_rejected() {
        let mut cfg = rock_8ths();
        cfg.bar.kick[3] = 4;
        assert!(compile(&cfg).is_err(), "level 4 does not exist");

        let mut cfg = rock_8ths();
        cfg.ticks_per_beat = 5;
        assert!(compile(&cfg).is_err(), "5 ticks a beat is not in the contract");

        let mut cfg = rock_8ths();
        cfg.beats_per_bar = 0;
        assert!(compile(&cfg).is_err(), "a bar of no beats");

        for bars in [0u32, JAM_MAX_FORM_BARS + 1] {
            let mut cfg = rock_8ths();
            cfg.form_bars = bars;
            assert!(compile(&cfg).is_err(), "{bars} bars is not a chorus");
        }
    }

    #[test]
    fn intensity_is_clamped_rather_than_obeyed() {
        let kick_gain = |intensity| {
            let mut cfg = rock_8ths();
            cfg.intensity = intensity;
            cfg.bar.kick = vec![2, 0, 0, 0, 0, 0, 0, 0];
            cfg.bar.snare = vec![0; 8];
            cfg.bar.hat = vec![0; 8];
            let t = compile(&cfg).unwrap();
            t.tick(0, 0).unwrap().slots()[0].gain
        };
        // Anything under the floor lands on the floor, anything over the
        // top lands on the top. The range itself is 0.5..1.5.
        assert_eq!(kick_gain(0.05), kick_gain(0.5), "clamped up to 0.5");
        assert_eq!(kick_gain(-3.0), kick_gain(0.5), "a negative jam is still a jam");
        assert_eq!(kick_gain(9.0), kick_gain(1.5), "clamped down to 1.5");
        assert!(
            kick_gain(f32::NAN) > 0.0,
            "a NaN intensity must not silence the band"
        );
        assert!(kick_gain(f32::INFINITY) > 0.0);
    }

    /// INTENSITY HAS TO DO SOMETHING, ON A BUSY GROOVE TOO.
    ///
    /// The first version of the normalisation scaled every table so its
    /// worst tick hit the ceiling, which meant soft, normal and loud all
    /// came out at exactly the same level on any groove busy enough to
    /// trip it: the musician turns the dial and nothing happens. The
    /// ceiling now leaves room for "loud" instead.
    #[test]
    fn soft_normal_and_loud_are_three_different_levels() {
        let peak = |intensity| {
            // Busy enough that the normalisation definitely fires.
            let mut cfg = rock_8ths();
            cfg.intensity = intensity;
            cfg.bar.kick = vec![2; 8];
            cfg.bar.snare = vec![2; 8];
            cfg.bar.hat = vec![2; 8];
            cfg.bar.crash = vec![2; 8];
            compile(&cfg).unwrap().peak_after
        };
        let (soft, normal, loud) = (peak(0.7), peak(1.0), peak(1.25));
        assert!(
            soft < normal && normal < loud,
            "soft {soft:.3}, normal {normal:.3}, loud {loud:.3} — the dial does nothing"
        );
        assert!(
            loud <= JAM_TICK_CEILING + 1e-4,
            "loud peaks at {loud:.3}, over the ceiling"
        );
        // And they are spaced the way the contract says: the ratios survive.
        assert!((normal / soft - 1.0 / 0.7).abs() < 1e-3);
        assert!((loud / normal - 1.25).abs() < 1e-3);
    }

    #[test]
    fn the_fill_replaces_the_groove_only_on_the_last_bar() {
        let mut cfg = rock_8ths();
        cfg.form_bars = 4;
        let mut fill = cfg.bar.clone();
        fill.kick = vec![0; 8];
        fill.snare = vec![2, 1, 2, 1, 2, 1, 2, 1];
        cfg.fill = Some(fill);
        let t = compile(&cfg).unwrap();
        assert!(t.has_fill());

        for bar in 0..3 {
            let has_kick = t
                .tick(0, bar)
                .unwrap()
                .slots()
                .iter()
                .any(|s| s.sound == room(KitVoice::Kick));
            assert!(has_kick, "bar {bar} of 4 is still the groove");
        }
        let last = t.tick(0, 3).unwrap();
        assert!(
            !last.slots().iter().any(|s| s.sound == room(KitVoice::Kick)),
            "the last bar of the chorus is the fill"
        );
    }

    #[test]
    fn the_crash_on_the_one_is_added_once_and_never_doubled() {
        let mut cfg = rock_8ths();
        cfg.crash_on_one = true;
        let t = compile(&cfg).unwrap();
        let crash = t.crash_on_one().expect("the jam asked for a crash");
        assert_eq!(crash.sound, room(KitVoice::Crash));
        assert_eq!(crash.cap_ticks, 0.0, "a crash rings out");

        // A groove that already crashes on tick 0 does not get a second one.
        let mut cfg = rock_8ths();
        cfg.crash_on_one = true;
        cfg.bar.crash = vec![2, 0, 0, 0, 0, 0, 0, 0];
        let t = compile(&cfg).unwrap();
        assert!(
            t.crash_on_one().is_none(),
            "the groove's own crash is already on the one"
        );

        // And nothing is added when the jam did not ask.
        assert!(compile(&rock_8ths()).unwrap().crash_on_one().is_none());
    }

    /// THE BAND THAT WOULD HAVE CLIPPED.
    ///
    /// Kick, snare accent, hat, ride and crash on every tick at intensity
    /// 1.25 is the loudest thing Jam can produce. The mixer clamps, but a
    /// clamped sum is a square wave, and the point of the per-table
    /// normalisation is that the ear never finds out.
    #[test]
    fn the_busiest_band_stays_inside_full_scale() {
        let cfg = JamConfig {
            ticks_per_beat: 4,
            beats_per_bar: 4,
            bar: JamPattern {
                kick: vec![1; 16],
                snare: vec![2; 16],
                hat: vec![1; 16],
                ride: vec![1; 16],
                crash: vec![2; 16],
            },
            fill: None,
            form_bars: 4,
            crash_on_one: true,
            intensity: 1.5,
            kit: "room".into(),
            bass: None,
            practice: None,
            fill_every: None,
        };
        let t = compile(&cfg).unwrap();
        assert!(
            t.peak_before > JAM_TICK_CEILING,
            "this fixture is supposed to be the one that clips; it peaked at {}",
            t.peak_before
        );
        assert!(
            t.peak_after <= JAM_TICK_CEILING + 1e-4,
            "after normalisation the worst tick is {} — still clipping",
            t.peak_after
        );

        // Re-measure the compiled slots rather than trusting the bookkeeping.
        let measured = worst_bar_peak(
            &t.bar,
            t.fill.as_deref(),
            t.crash_on_one(),
            t.form_bars(),
            cfg.ticks_per_beat,
        );
        assert!(
            measured <= JAM_TICK_CEILING + 1e-4,
            "the compiled table still renders a tick at {measured}"
        );

        // Gentle: the groove's own balance survives the scaling.
        let tick = t.tick(0, 0).unwrap();
        let kick = tick.slots().iter().find(|s| s.lane == JamLane::Kick).unwrap();
        let snare = tick
            .slots()
            .iter()
            .find(|s| s.sound == room(KitVoice::SnareHi))
            .unwrap();
        assert!(
            (snare.gain / kick.gain - 1.0 / 0.8).abs() < 1e-4,
            "normalisation must scale the table, not reshape it"
        );
    }

    /// An ordinary groove at normal intensity must stay a loud, present
    /// thing. It is held below the ceiling to leave room for "loud", but
    /// "below the ceiling" must not quietly become "shy" — the mistake the
    /// snare kit made three times over (`engine.rs`).
    #[test]
    fn an_ordinary_groove_is_still_a_loud_groove() {
        let t = compile(&rock_8ths()).unwrap();
        assert!(
            t.peak_after > 0.5,
            "a rock beat at normal intensity peaks at {:.3}, which is a whisper",
            t.peak_after
        );
        assert!(
            t.peak_after <= JAM_TICK_CEILING + 1e-4,
            "a rock beat peaks at {:.3}, over the ceiling",
            t.peak_after
        );
        // A groove quiet enough not to need the headroom keeps its level
        // untouched — the normalisation is not a fader on everything.
        let mut quiet = rock_8ths();
        quiet.bar.kick = vec![3, 0, 0, 0, 0, 0, 0, 0];
        quiet.bar.snare = vec![0; 8];
        quiet.bar.hat = vec![0; 8];
        let q = compile(&quiet).unwrap();
        assert_eq!(
            q.tick(0, 0).unwrap().slots()[0].gain,
            0.35,
            "a lone ghost note needs no headroom and must not be scaled"
        );
    }

    #[test]
    fn a_one_bar_form_is_its_own_fill() {
        let mut cfg = rock_8ths();
        cfg.form_bars = 1;
        let mut fill = cfg.bar.clone();
        fill.kick = vec![0; 8];
        cfg.fill = Some(fill);
        let t = compile(&cfg).unwrap();
        assert!(
            !t.tick(0, 0)
                .unwrap()
                .slots()
                .iter()
                .any(|s| s.sound == room(KitVoice::Kick)),
            "bar 0 of a 1-bar form is also its last bar"
        );
    }

    /// THE CRASH IS MEASURED WHERE IT ACTUALLY LANDS.
    ///
    /// The crash on the one hits bar 0 of the chorus. With a one-bar form
    /// the fill IS bar 0, so it lands on the fill's first tick; with any
    /// longer form it lands on the groove's. Measuring both regardless is
    /// safe and wrong — it throws away level for a bar that never happens —
    /// and measuring only the groove's leaves a one-bar form free to clip.
    #[test]
    fn the_crash_is_measured_against_whichever_bar_is_bar_zero() {
        // A fill far louder on its downbeat than the groove is.
        let with_form = |bars: u32| {
            let mut cfg = rock_8ths();
            cfg.form_bars = bars;
            cfg.crash_on_one = true;
            cfg.bar.kick = vec![1, 0, 0, 0, 0, 0, 0, 0];
            cfg.bar.snare = vec![0; 8];
            cfg.bar.hat = vec![0; 8];
            cfg.fill = Some(JamPattern {
                kick: vec![2; 8],
                snare: vec![2; 8],
                hat: vec![2; 8],
                ride: vec![2; 8],
                crash: vec![0; 8],
            });
            compile(&cfg).unwrap()
        };
        let one = with_form(1);
        let four = with_form(4);
        assert!(
            one.peak_before > four.peak_before,
            "a one-bar form stacks the crash on the fill's downbeat, so it must \
             measure louder than a four-bar form ({:.3} vs {:.3})",
            one.peak_before,
            four.peak_before
        );
        for (name, t) in [("one-bar", &one), ("four-bar", &four)] {
            assert!(
                t.peak_after <= JAM_TICK_CEILING + 1e-4,
                "the {name} form peaks at {:.3}, over the ceiling",
                t.peak_after
            );
        }
    }

    #[test]
    fn a_tick_outside_the_bar_is_a_bounds_check_not_a_panic() {
        let t = compile(&rock_8ths()).unwrap();
        assert!(t.tick(8, 0).is_none());
        assert!(t.tick(u32::MAX, 0).is_none());
    }

    #[test]
    fn the_config_deserialises_from_the_contracts_camel_case() {
        let json = r#"{
            "ticksPerBeat": 2,
            "beatsPerBar": 4,
            "bar": {
              "kick":  [1,0,0,0,1,0,0,0],
              "snare": [0,0,2,0,0,0,2,0],
              "hat":   [1,3,1,3,1,3,1,3],
              "ride":  [0,0,0,0,0,0,0,0],
              "crash": [0,0,0,0,0,0,0,0]
            },
            "fill": null,
            "formBars": 12,
            "crashOnOne": true,
            "intensity": 1.25,
            "kit": "room"
        }"#;
        let cfg: JamConfig = serde_json::from_str(json).expect("the contract must deserialise");
        assert_eq!(cfg.ticks_per_beat, 2);
        assert_eq!(cfg.form_bars, 12);
        assert!(cfg.crash_on_one);
        assert!(cfg.fill.is_none());
        assert_eq!(cfg.kit, "room");
        let t = compile(&cfg).unwrap();
        assert_eq!(t.ticks_per_bar(), 8);
        assert_eq!(t.form_bars(), 12);
    }

    // -----------------------------------------------------------------
    // Kits
    // -----------------------------------------------------------------

    #[test]
    fn every_kit_plays_its_own_drums() {
        // One of each lane, at each level that changes the voice.
        let mut cfg = rock_8ths();
        cfg.bar.kick = vec![1, 0, 0, 0, 0, 0, 0, 0];
        cfg.bar.snare = vec![0, 2, 1, 0, 0, 0, 0, 0];
        cfg.bar.hat = vec![0, 0, 0, 1, 0, 0, 0, 0];
        cfg.bar.ride = vec![0, 0, 0, 0, 1, 0, 0, 0];
        cfg.bar.crash = vec![0, 0, 0, 0, 0, 1, 0, 0];

        for (name, kit) in [
            ("room", JamKit::Room),
            ("tight", JamKit::Tight),
            ("brushes", JamKit::Brushes),
            ("electronic", JamKit::Electronic),
        ] {
            let mut c = cfg.clone();
            c.kit = name.to_string();
            let t = compile(&c).unwrap();
            assert_eq!(t.kit, kit);
            let voice = |tick: u32| t.tick(tick, 0).unwrap().slots()[0].sound;
            assert_eq!(voice(0), SoundId::Kit(kit, KitVoice::Kick), "{name} kick");
            assert_eq!(
                voice(1),
                SoundId::Kit(kit, KitVoice::SnareHi),
                "{name}: an accent is the drum hit harder"
            );
            assert_eq!(
                voice(2),
                SoundId::Kit(kit, KitVoice::SnareLo),
                "{name}: a plain hit is the same drum, softer"
            );
            assert_eq!(voice(3), SoundId::Kit(kit, KitVoice::Hat), "{name} hat");
            assert_eq!(voice(4), SoundId::Kit(kit, KitVoice::Ride), "{name} ride");
            assert_eq!(voice(5), SoundId::Kit(kit, KitVoice::Crash), "{name} crash");
        }
    }

    /// A JAM SAVED BY A LATER BUILD STILL PLAYS.
    ///
    /// The kit is a free-form string on the record, and the record outlives
    /// the build that wrote it. An unknown name is "room" — the kit whose
    /// job is to sound like the app already sounds — and never an error: a
    /// jam that will not load because someone renamed a kit is a worse
    /// failure than a jam that loads with the default drums.
    #[test]
    fn an_unknown_kit_is_the_room_kit() {
        for (name, expected) in [
            ("", JamKit::Room),
            ("ROOM", JamKit::Room),
            (" Tight ", JamKit::Tight),
            ("vibraphone", JamKit::Room),
            ("808", JamKit::Room),
        ] {
            let mut cfg = rock_8ths();
            cfg.kit = name.to_string();
            let t = compile(&cfg).expect("an unknown kit must still compile");
            assert_eq!(t.kit, expected, "kit {name:?}");
        }
    }

    /// Each kit gets its own normalisation, because each kit has its own
    /// worst tick: `brushes` and `electronic` do not sum to the same peak
    /// even playing identical notes.
    #[test]
    fn each_kit_is_normalised_on_its_own_peak() {
        let busy = |kit: &str| {
            let mut cfg = rock_8ths();
            cfg.kit = kit.to_string();
            cfg.intensity = 1.25;
            cfg.bar.kick = vec![2; 8];
            cfg.bar.snare = vec![2; 8];
            cfg.bar.hat = vec![2; 8];
            cfg.bar.crash = vec![2; 8];
            compile(&cfg).unwrap()
        };
        let mut peaks = Vec::new();
        for kit in ["room", "tight", "brushes", "electronic"] {
            let t = busy(kit);
            assert!(
                t.peak_after <= JAM_TICK_CEILING + 1e-4,
                "{kit} peaks at {:.3}, over the ceiling",
                t.peak_after
            );
            assert!(
                t.peak_after > 0.5,
                "{kit} peaks at {:.3}, which is a whisper",
                t.peak_after
            );
            peaks.push(t.peak_before);
        }
        assert!(
            peaks.windows(2).any(|w| (w[0] - w[1]).abs() > 1e-3),
            "all four kits measured the same worst tick ({peaks:?}); one kit is \
             being normalised against another's sounds"
        );
    }

    // -----------------------------------------------------------------
    // The bass
    // -----------------------------------------------------------------

    /// A 16-tick bar of nothing but the bass line handed in.
    fn with_bass(pitches: Vec<u8>) -> JamConfig {
        let n = pitches.len();
        JamConfig {
            ticks_per_beat: 4,
            beats_per_bar: 4,
            bar: JamPattern {
                kick: vec![0; n],
                snare: vec![0; n],
                hat: vec![0; n],
                ride: vec![0; n],
                crash: vec![0; n],
            },
            fill: None,
            form_bars: 4,
            crash_on_one: false,
            intensity: 1.0,
            kit: "room".into(),
            bass: Some(JamBassLine { pitches, gain: 1.0 }),
            practice: None,
            fill_every: None,
        }
    }

    fn bass_at(t: &JamTable, tick: u32) -> Option<JamSlot> {
        t.tick(tick, 0)
            .unwrap()
            .slots()
            .iter()
            .copied()
            .find(|s| s.lane == JamLane::Bass)
    }

    /// A NOTE STOPS WHEN THE NEXT ONE STARTS.
    ///
    /// The buffer is 450 ms long, which at anything under about 130 BPM is
    /// longer than a quarter note. Without the cap a walking line would
    /// sound all four of its notes at once — a chord, not a bass player.
    #[test]
    fn a_bass_note_rings_until_the_next_one() {
        let t = compile(&with_bass(vec![
            40, 0, 0, 0, 45, 0, 0, 0, 47, 0, 0, 0, 52, 0, 0, 0,
        ]))
        .unwrap();
        for tick in [0u32, 4, 8, 12] {
            let s = bass_at(&t, tick).unwrap_or_else(|| panic!("no bass on tick {tick}"));
            assert_eq!(s.cap_ticks, 4.0, "tick {tick} must ring one beat");
            assert!(!s.accent, "a bass note is never an accent");
        }
        for tick in [1u32, 2, 3, 5, 15] {
            assert!(bass_at(&t, tick).is_none(), "tick {tick} is a rest");
        }
    }

    /// ...OR THE END OF THE BAR, WHICHEVER COMES FIRST. A note with nothing
    /// after it must not run into the next bar's downbeat.
    #[test]
    fn the_last_bass_note_stops_at_the_bar_line() {
        let t = compile(&with_bass(vec![
            40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 45,
        ]))
        .unwrap();
        assert_eq!(
            bass_at(&t, 0).unwrap().cap_ticks,
            15.0,
            "a whole-bar note rings to the last tick and no further"
        );
        assert_eq!(
            bass_at(&t, 15).unwrap().cap_ticks,
            1.0,
            "a note on the last tick gets one tick"
        );
    }

    #[test]
    fn a_bass_rest_spawns_nothing_at_all() {
        let t = compile(&with_bass(vec![0; 16])).unwrap();
        for tick in 0..16 {
            assert_eq!(
                t.tick(tick, 0).unwrap().slots().len(),
                0,
                "tick {tick} of an all-rest bar"
            );
        }
    }

    /// The bass keeps walking while the drummer plays a fill. A fill bar
    /// with no bass under it is a hole in the music every chorus.
    #[test]
    fn the_bass_plays_through_the_fill() {
        let mut cfg = with_bass(vec![40, 0, 0, 0, 45, 0, 0, 0, 47, 0, 0, 0, 52, 0, 0, 0]);
        cfg.form_bars = 4;
        cfg.fill = Some(JamPattern {
            kick: vec![0; 16],
            snare: vec![2; 16],
            hat: vec![0; 16],
            ride: vec![0; 16],
            crash: vec![0; 16],
        });
        let t = compile(&cfg).unwrap();
        let on_fill = t
            .tick(0, 3)
            .unwrap()
            .slots()
            .iter()
            .find(|s| s.lane == JamLane::Bass)
            .copied();
        assert_eq!(
            on_fill.map(|s| s.sound),
            Some(SoundId::Bass(40 - BASS_MIN_MIDI)),
            "the last bar of the chorus is the fill, and the bass plays it too"
        );
    }

    #[test]
    fn the_bass_pitch_becomes_the_right_note_of_the_bank() {
        let mut pitches = vec![0u8; 16];
        pitches[0] = BASS_MIN_MIDI;
        pitches[4] = BASS_MAX_MIDI;
        let t = compile(&with_bass(pitches)).unwrap();
        assert_eq!(bass_at(&t, 0).unwrap().sound, SoundId::Bass(0));
        assert_eq!(
            bass_at(&t, 4).unwrap().sound,
            SoundId::Bass(BASS_MAX_MIDI - BASS_MIN_MIDI)
        );
    }

    #[test]
    fn a_bass_line_that_is_not_this_bar_is_rejected_whole() {
        let mut cfg = with_bass(vec![40; 16]);
        cfg.bass = Some(JamBassLine {
            pitches: vec![40; 8],
            gain: 1.0,
        });
        let err = compile(&cfg).expect_err("half a bar of bass must be rejected");
        assert!(err.contains("bass.pitches"), "{err}");
        assert!(
            err.contains('8'),
            "the message must say how many it had: {err}"
        );

        // And a note the bank does not hold.
        for bad in [1u8, BASS_MIN_MIDI - 1, BASS_MAX_MIDI + 1, 127] {
            let mut pitches = vec![0u8; 16];
            pitches[3] = bad;
            let cfg = with_bass(pitches);
            let err = compile(&cfg).unwrap_err();
            assert!(err.contains("tick 3"), "MIDI {bad}: {err}");
        }
    }

    #[test]
    fn the_bass_gain_is_clamped_rather_than_obeyed() {
        let gain_of = |gain: f32| {
            let mut pitches = vec![0u8; 16];
            pitches[0] = 40;
            let mut cfg = with_bass(pitches.clone());
            cfg.bass = Some(JamBassLine { pitches, gain });
            bass_at(&compile(&cfg).unwrap(), 0).unwrap().gain
        };
        assert_eq!(gain_of(0.01), gain_of(0.5), "clamped up to 0.5");
        assert_eq!(gain_of(99.0), gain_of(1.5), "clamped down to 1.5");
        assert!(
            gain_of(f32::NAN) > 0.0,
            "a NaN gain must not silence the bass"
        );
    }

    /// The bass is in the sum the normalisation measures. A root under a
    /// kick is two low-frequency transients on the same sample, which is
    /// exactly the pair most likely to clip.
    #[test]
    fn the_bass_counts_towards_the_worst_tick() {
        let mut cfg = with_bass(vec![40; 16]);
        cfg.bar.kick = vec![2; 16];
        cfg.bar.snare = vec![2; 16];
        cfg.bar.crash = vec![2; 16];
        cfg.intensity = 1.25;
        let with = compile(&cfg).unwrap();
        cfg.bass = None;
        let without = compile(&cfg).unwrap();
        assert!(
            with.peak_before > without.peak_before,
            "the bass did not reach the meter: {:.3} with, {:.3} without",
            with.peak_before,
            without.peak_before
        );
        assert!(
            with.peak_after <= JAM_TICK_CEILING + 1e-4,
            "a band with a bass peaks at {:.3}, over the ceiling",
            with.peak_after
        );
    }

    // -----------------------------------------------------------------
    // The practice windows
    //
    // Ported case for case from `src/jam/practice.test.ts`. These two
    // implementations decide the same thing in two languages: the TypeScript
    // one draws the silence on the timeline a bar before it arrives, this
    // one plays it. If they ever disagree, the drawn band and the heard band
    // disagree, which is worse than having no timeline at all.
    // -----------------------------------------------------------------

    /// `overBars` from `practice.test.ts`: the band's state for a run of
    /// absolute bars, so a test can read the way the brief does —
    /// "bars 8-9 silent". Bar 0 is the first downbeat of the jam.
    fn over_bars(
        count: u32,
        form_bars: u32,
        practice: Option<&JamPracticeConfig>,
    ) -> Vec<JamBandState> {
        (0..count)
            .map(|bar| band_state_for_bar(bar % form_bars, form_bars, practice))
            .collect()
    }

    /// Which absolute bars came back with `state`.
    fn bars_where(states: &[JamBandState], state: JamBandState) -> Vec<u32> {
        states
            .iter()
            .enumerate()
            .filter(|(_, s)| **s == state)
            .map(|(i, _)| i as u32)
            .collect()
    }

    fn drop_out(every_bars: u32, bars: u32) -> JamPracticeConfig {
        JamPracticeConfig {
            drop_out: Some(JamDropOut { every_bars, bars }),
            trade: None,
        }
    }

    fn trade(band_bars: u32, you_bars: u32) -> JamPracticeConfig {
        JamPracticeConfig {
            drop_out: None,
            trade: Some(JamTrade {
                band_bars,
                you_bars,
            }),
        }
    }

    #[test]
    fn drop_out_goes_silent_for_bars_8_and_9_of_every_chorus() {
        // The fact from the brief, and the first case in practice.test.ts.
        // Phase-locked, so the silence falls on the same two bars of the
        // form every time round — which over a 12-bar blues means the same
        // two chords, every chorus.
        let p = drop_out(8, 2);
        let states = over_bars(36, 12, Some(&p));
        assert_eq!(
            bars_where(&states, JamBandState::Silent),
            vec![8, 9, 20, 21, 32, 33]
        );
        assert!(
            states[..8].iter().all(|s| *s == JamBandState::Full),
            "the band states the form before it takes anything away"
        );
    }

    #[test]
    fn drop_out_never_opens_on_bar_0_however_small_every_bars_is() {
        for every in [1u32, 2, 3, 4, 6] {
            let p = drop_out(every, 1);
            let states = over_bars(24, 12, Some(&p));
            assert_eq!(states[0], JamBandState::Full, "everyBars {every}, bar 0");
            assert_eq!(states[12], JamBandState::Full, "everyBars {every}, bar 12");
        }
    }

    #[test]
    fn drop_out_opens_at_every_multiple_and_lasts_as_long_as_asked() {
        let p = drop_out(4, 2);
        assert_eq!(
            bars_where(&over_bars(12, 12, Some(&p)), JamBandState::Silent),
            vec![4, 5, 8, 9]
        );
        let p = drop_out(8, 4);
        assert_eq!(
            bars_where(&over_bars(16, 16, Some(&p)), JamBandState::Silent),
            vec![8, 9, 10, 11]
        );
    }

    #[test]
    fn trading_gives_you_bars_4_to_7_and_brings_the_band_back_at_12() {
        let p = trade(4, 4);
        let states = over_bars(24, 12, Some(&p));
        assert_eq!(
            bars_where(&states, JamBandState::HatsOnly),
            vec![4, 5, 6, 7, 16, 17, 18, 19]
        );
        assert!(
            states[12..16].iter().all(|s| *s == JamBandState::Full),
            "a new chorus starts the cycle over, so bar 12 is the band's again"
        );
    }

    #[test]
    fn trading_always_starts_with_the_band() {
        for bars in [1u32, 2, 4, 8] {
            let p = trade(bars, bars);
            assert_eq!(
                over_bars(32, 16, Some(&p))[0],
                JamBandState::Full,
                "trading {bars}: you never open a chorus cold"
            );
        }
    }

    #[test]
    fn trading_does_twos_and_eights_and_uneven_pairs() {
        let p = trade(2, 2);
        assert_eq!(
            bars_where(&over_bars(8, 8, Some(&p)), JamBandState::HatsOnly),
            vec![2, 3, 6, 7]
        );
        let p = trade(8, 8);
        assert_eq!(
            bars_where(&over_bars(32, 32, Some(&p)), JamBandState::HatsOnly),
            vec![8, 9, 10, 11, 12, 13, 14, 15, 24, 25, 26, 27, 28, 29, 30, 31]
        );
        let p = trade(2, 4);
        assert_eq!(
            bars_where(&over_bars(12, 12, Some(&p)), JamBandState::HatsOnly),
            vec![2, 3, 4, 5, 8, 9, 10, 11]
        );
    }

    /// SILENCE WINS. It is the stronger instruction and the one that
    /// produces the honest score — nothing bleeds into the mic during it.
    #[test]
    fn drop_out_wins_the_bars_where_both_tools_apply() {
        let p = JamPracticeConfig {
            drop_out: Some(JamDropOut {
                every_bars: 4,
                bars: 2,
            }),
            trade: Some(JamTrade {
                band_bars: 4,
                you_bars: 4,
            }),
        };
        let states = over_bars(12, 12, Some(&p));
        assert_eq!(bars_where(&states, JamBandState::Silent), vec![4, 5, 8, 9]);
        // Bars 6-7 would have been yours; what is left of your four is hats.
        assert_eq!(states[6], JamBandState::HatsOnly);
        assert_eq!(states[7], JamBandState::HatsOnly);
    }

    #[test]
    fn the_band_with_nothing_switched_on_plays_every_bar() {
        assert!(over_bars(24, 12, None)
            .iter()
            .all(|s| *s == JamBandState::Full));
        let both_null = JamPracticeConfig {
            drop_out: None,
            trade: None,
        };
        assert!(over_bars(24, 12, Some(&both_null))
            .iter()
            .all(|s| *s == JamBandState::Full));
        // And a pair with a zero in it is off, the way `practiceConfigFrom`
        // reads it: dropping out for zero bars is not dropping out.
        for p in [drop_out(8, 0), drop_out(0, 2), trade(0, 4), trade(4, 0)] {
            assert!(
                over_bars(24, 12, Some(&p))
                    .iter()
                    .all(|s| *s == JamBandState::Full),
                "a window with a zero in it is off"
            );
        }
    }

    /// The table carries the whole chorus, worked out once, and it is the
    /// same list every chorus — which is what "phase-locked" means and what
    /// lets the timeline draw a silence before it arrives.
    #[test]
    fn the_table_carries_one_state_per_bar_of_the_chorus() {
        let mut cfg = rock_8ths();
        cfg.form_bars = 12;
        cfg.practice = Some(drop_out(8, 2));
        let t = compile(&cfg).unwrap();
        let drawn: Vec<JamBandState> = (0..12).map(|b| t.band_state(b)).collect();
        assert_eq!(
            drawn,
            vec![
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::Silent,
                JamBandState::Silent,
                JamBandState::Full,
                JamBandState::Full,
            ]
        );
        // Out of range is a bounds check, not a panic on the audio thread.
        assert_eq!(t.band_state(12), JamBandState::Full);
        assert_eq!(t.band_state(u32::MAX), JamBandState::Full);

        // And no practice config at all is a band that plays every bar.
        let mut cfg = rock_8ths();
        cfg.form_bars = 12;
        let t = compile(&cfg).unwrap();
        assert!((0..12).all(|b| t.band_state(b) == JamBandState::Full));
    }

    /// The three words the UI reads off `BeatEvent.bandState`.
    #[test]
    fn the_band_state_serialises_the_way_the_contract_spells_it() {
        for (state, word) in [
            (JamBandState::Full, "\"full\""),
            (JamBandState::HatsOnly, "\"hatsOnly\""),
            (JamBandState::Silent, "\"silent\""),
        ] {
            assert_eq!(serde_json::to_string(&state).unwrap(), word);
        }
    }

    /// The second pass's half of the contract, deserialised: kit, bass and
    /// practice as the UI writes them — and an older jam that has none of
    /// them still loading.
    #[test]
    fn the_second_pass_fields_deserialise_from_the_contracts_camel_case() {
        let json = r#"{
            "ticksPerBeat": 2,
            "beatsPerBar": 4,
            "bar": {
              "kick":  [1,0,0,0,1,0,0,0],
              "snare": [0,0,2,0,0,0,2,0],
              "hat":   [1,3,1,3,1,3,1,3],
              "ride":  [0,0,0,0,0,0,0,0],
              "crash": [0,0,0,0,0,0,0,0]
            },
            "fill": null,
            "formBars": 12,
            "crashOnOne": true,
            "intensity": 1.0,
            "kit": "brushes",
            "bass": { "pitches": [40,0,0,0,45,0,0,0], "gain": 0.9 },
            "practice": {
              "dropOut": { "everyBars": 8, "bars": 2 },
              "trade": { "bandBars": 4, "youBars": 4 }
            }
        }"#;
        let cfg: JamConfig = serde_json::from_str(json).expect("the contract must deserialise");
        assert_eq!(cfg.kit, "brushes");
        let bass = cfg.bass.as_ref().expect("bass");
        assert_eq!(bass.pitches.len(), 8);
        assert!((bass.gain - 0.9).abs() < 1e-6);
        let practice = cfg.practice.as_ref().expect("practice");
        assert_eq!(
            practice.drop_out.map(|d| (d.every_bars, d.bars)),
            Some((8, 2))
        );
        assert_eq!(
            practice.trade.map(|t| (t.band_bars, t.you_bars)),
            Some((4, 4))
        );

        let t = compile(&cfg).unwrap();
        assert_eq!(t.kit, JamKit::Brushes);
        assert_eq!(t.band_state(0), JamBandState::Full);
        assert_eq!(t.band_state(4), JamBandState::HatsOnly);
        assert_eq!(t.band_state(8), JamBandState::Silent);

        // A jam written by the first pass — no `bass`, no `practice` — must
        // still load, because the store is full of them.
        let older = r#"{
            "ticksPerBeat": 2,
            "beatsPerBar": 4,
            "bar": {
              "kick":  [1,0,0,0,1,0,0,0],
              "snare": [0,0,2,0,0,0,2,0],
              "hat":   [1,3,1,3,1,3,1,3],
              "ride":  [0,0,0,0,0,0,0,0],
              "crash": [0,0,0,0,0,0,0,0]
            },
            "fill": null,
            "formBars": 12,
            "crashOnOne": true,
            "intensity": 1.0,
            "kit": "room"
        }"#;
        let cfg: JamConfig = serde_json::from_str(older).expect("an older jam must still load");
        assert!(cfg.bass.is_none());
        assert!(cfg.practice.is_none());
        assert!(cfg.fill_every.is_none());
        let t = compile(&cfg).unwrap();
        assert!((0..12).all(|b| t.band_state(b) == JamBandState::Full));
    }
}

// ---------------------------------------------------------------------------
// Tests — moving through the form, fills every N bars, and the gain memo
// ---------------------------------------------------------------------------

#[cfg(test)]
mod form_tests {
    use super::*;

    fn twelve_bar() -> JamConfig {
        let z = vec![0u8; 8];
        JamConfig {
            ticks_per_beat: 2,
            beats_per_bar: 4,
            bar: JamPattern {
                kick: vec![1, 0, 0, 0, 1, 0, 0, 0],
                snare: vec![0, 0, 2, 0, 0, 0, 2, 0],
                hat: vec![1, 3, 1, 3, 1, 3, 1, 3],
                ride: z.clone(),
                crash: z.clone(),
            },
            // A fill nobody could mistake for the groove: no kick at all.
            fill: Some(JamPattern {
                kick: z.clone(),
                snare: vec![2, 1, 2, 1, 2, 1, 2, 1],
                hat: z.clone(),
                ride: z.clone(),
                crash: z,
            }),
            form_bars: 12,
            crash_on_one: false,
            intensity: 1.0,
            kit: "room".into(),
            bass: None,
            practice: None,
            fill_every: None,
        }
    }

    fn cmd(jump_to: Option<u32>, loop_bars: Option<(u32, u32)>) -> JamPositionCommand {
        JamPositionCommand {
            jump_to,
            loop_bars: loop_bars.map(|(start, end)| JamLoop { start, end }),
        }
    }

    // ---- The command, and what it is checked against ----

    #[test]
    fn a_bar_the_form_has_is_accepted_and_one_it_does_not_is_refused() {
        let form = Some(12);
        assert_eq!(
            validate_position(&cmd(Some(11), None), form).unwrap(),
            JamPosition {
                jump: Some(11),
                loop_bars: None
            }
        );
        let refused = validate_position(&cmd(Some(12), None), form).unwrap_err();
        assert!(
            refused.contains("13") && refused.contains("12 bars"),
            "the message has to name the bar and the form: {refused}"
        );
    }

    #[test]
    fn a_loop_has_to_fit_the_form_and_point_forwards() {
        let form = Some(12);
        assert_eq!(
            validate_position(&cmd(None, Some((4, 7))), form).unwrap(),
            JamPosition {
                jump: None,
                loop_bars: Some((4, 7))
            }
        );
        assert!(
            validate_position(&cmd(None, Some((0, 11))), form).is_ok(),
            "the whole form is a legal loop"
        );
        assert!(validate_position(&cmd(None, Some((8, 12))), form)
            .unwrap_err()
            .contains("13"));
        let backwards = validate_position(&cmd(None, Some((7, 4))), form).unwrap_err();
        assert!(
            backwards.contains("cannot be after"),
            "a loop that ends before it starts says so: {backwards}"
        );
    }

    #[test]
    fn a_move_with_no_band_is_kept_rather_than_refused() {
        // Nothing to check it against, so nothing is refused: the UI may set
        // a loop before it loads a jam, and the order two commands happen to
        // arrive in must not decide whether the loop survives.
        let far = validate_position(&cmd(Some(40), Some((30, 39))), None).unwrap();
        assert_eq!(far.jump, Some(40));
        assert_eq!(far.loop_bars, Some((30, 39)));
        // ...and the table it lands on is what actually decides.
        assert_eq!(far.for_table(Some(12)), JamPosition::default());
        // A backwards loop is refused even with no band: it is not a
        // question about the form.
        assert!(validate_position(&cmd(None, Some((9, 2))), None).is_err());
    }

    #[test]
    fn a_new_table_drops_the_jump_and_keeps_a_loop_that_still_fits() {
        let pending = JamPosition {
            jump: Some(3),
            loop_bars: Some((4, 7)),
        };
        // Same twelve bars: the loop is still the turnaround the musician
        // set, and the jump is stale by the time the table lands.
        assert_eq!(
            pending.for_table(Some(12)),
            JamPosition {
                jump: None,
                loop_bars: Some((4, 7))
            }
        );
        // A seven-bar form has no bar 8 for the loop to end on.
        assert_eq!(pending.for_table(Some(7)), JamPosition::default());
        // Exactly long enough is long enough: bars 5-8 of an eight-bar loop
        // are the eight-bar loop's second half, and they exist.
        assert_eq!(
            pending.for_table(Some(8)).loop_bars,
            Some((4, 7)),
            "bar 8 of an eight-bar form is the last one, not one too many"
        );
        // The band going away leaves the loop for the next one.
        assert_eq!(pending.for_table(None).loop_bars, Some((4, 7)));
        assert_eq!(pending.for_table(None).jump, None);
    }

    #[test]
    fn the_contract_camel_case_reaches_the_position() {
        let c: JamPositionCommand =
            serde_json::from_str(r#"{"jumpTo":7,"loop":{"start":4,"end":11}}"#).unwrap();
        assert_eq!(c.jump_to, Some(7));
        let p = validate_position(&c, Some(12)).unwrap();
        assert_eq!(p.loop_bars, Some((4, 11)));
        // Both halves nullable, and both null is "no jump, no loop".
        let cleared: JamPositionCommand =
            serde_json::from_str(r#"{"jumpTo":null,"loop":null}"#).unwrap();
        assert_eq!(
            validate_position(&cleared, Some(12)).unwrap(),
            JamPosition::default()
        );
    }

    // ---- Fills every N bars ----

    #[test]
    fn a_fill_every_four_lands_on_bars_four_eight_and_twelve() {
        let mut cfg = twelve_bar();
        cfg.fill_every = Some(4);
        let t = compile(&cfg).unwrap();
        let counted: Vec<u32> = (0..12).filter(|&b| t.fill_bar(b)).map(|b| b + 1).collect();
        assert_eq!(counted, vec![4, 8, 12], "as a drummer counts the bars");

        // And it really is the fill that plays there, not the groove: the
        // fill has no kick and the groove opens with one.
        let kick = |bar: u32| {
            t.tick(0, bar)
                .unwrap()
                .slots()
                .iter()
                .any(|s| s.lane == JamLane::Kick)
        };
        assert!(kick(0) && kick(1) && kick(2), "bars 1-3 are the groove");
        assert!(!kick(3), "bar 4 is the fill");
        assert!(kick(4), "bar 5 is the groove again");
    }

    #[test]
    fn a_fill_every_eight_still_fills_the_end_of_the_chorus() {
        let mut cfg = twelve_bar();
        cfg.fill_every = Some(8);
        let t = compile(&cfg).unwrap();
        let counted: Vec<u32> = (0..12).filter(|&b| t.fill_bar(b)).map(|b| b + 1).collect();
        assert_eq!(
            counted,
            vec![8, 12],
            "the last bar of the chorus is a fill whatever fillEvery says"
        );
    }

    #[test]
    fn no_fill_every_is_the_end_of_the_chorus_and_nothing_else() {
        let t = compile(&twelve_bar()).unwrap();
        let counted: Vec<u32> = (0..12).filter(|&b| t.fill_bar(b)).map(|b| b + 1).collect();
        assert_eq!(counted, vec![12]);
    }

    #[test]
    fn a_fill_every_the_ui_does_not_offer_is_refused() {
        for every in [1u32, 2, 3, 5, 6, 7, 9, 16] {
            let mut cfg = twelve_bar();
            cfg.fill_every = Some(every);
            let e = compile(&cfg).unwrap_err();
            assert!(
                e.contains("fillEvery") && e.contains("4 or 8"),
                "{every} should be refused with a message that says what is \
                 allowed: {e}"
            );
        }
        for every in [0u32, 4, 8] {
            let mut cfg = twelve_bar();
            cfg.fill_every = Some(every);
            assert!(compile(&cfg).is_ok(), "fillEvery {every} is on the list");
        }
    }

    #[test]
    fn turning_fills_up_is_a_change_the_drummer_makes_now() {
        // Where the fill lands is not a bass change, so it must not be held
        // to the next bar line the way the bar-ahead bass is.
        let a = compile(&twelve_bar()).unwrap();
        let mut moved = twelve_bar();
        moved.fill_every = Some(4);
        let b = compile(&moved).unwrap();
        assert!(!swap_defers(Some(&a), Some(&b), true, false));
    }

    // ---- The normalisation memo ----

    fn walking(pitches: Vec<u8>) -> JamConfig {
        let mut cfg = twelve_bar();
        cfg.bass = Some(JamBassLine {
            pitches,
            gain: 1.0,
        });
        cfg
    }

    /// THE BAR-AHEAD BASS, ROUND AND ROUND.
    ///
    /// The traffic the memo exists for: the UI walks the same few bass bars
    /// round the form, once per chorus, for as long as the jam plays. The
    /// first time round measures each of them; from the second on, nothing
    /// is measured at all.
    #[test]
    fn the_bass_bars_of_a_form_are_measured_once_each_and_never_again() {
        let cache = JamGainCache::new();
        // E1 to G3 is the bass's range, and these stay inside it.
        let chords: Vec<Vec<u8>> = vec![
            vec![40, 0, 45, 0, 47, 0, 52, 0],
            vec![45, 0, 50, 0, 52, 0, 33, 0],
            vec![35, 0, 40, 0, 42, 0, 47, 0],
            vec![40, 0, 47, 0, 45, 0, 40, 0],
        ];
        let first: Vec<f32> = chords
            .iter()
            .map(|p| compile_with(&walking(p.clone()), &cache).unwrap().base_peak)
            .collect();
        // Every one of them is the number a cold compile would produce.
        for (p, want) in chords.iter().zip(&first) {
            assert_eq!(compile(&walking(p.clone())).unwrap().base_peak, *want);
        }
        // Second chorus: the same four bars, and the memo has all of them.
        for (p, want) in chords.iter().zip(&first) {
            let again = compile_with(&walking(p.clone()), &cache).unwrap();
            assert_eq!(again.base_peak, *want);
            assert!(cache.get(render_signature(&walking(p.clone()))).is_some());
        }
    }

    /// A DIFFERENT BASS IS A DIFFERENT MEASUREMENT.
    ///
    /// The tempting version of this memo keys on the drums alone and lets a
    /// changed bass line share the answer. It does not hold: on the jitter
    /// probe's groove, the same drums with the bass at 0.5 render 2.08 and
    /// at 1.5 render 2.95 — 42% — and normalising the loud one against the
    /// quiet one's number puts the room kit at 1.075 at full volume, which
    /// is the mixer clamping. `the_gain_cache_never_lets_a_changed_bass_
    /// reach_the_clamp` in `engine.rs` is the rendered half of this claim;
    /// this is the arithmetic half.
    #[test]
    fn a_bass_the_memo_has_not_seen_is_measured_rather_than_guessed() {
        let quiet = {
            let mut c = walking(vec![40, 0, 0, 0, 0, 0, 0, 0]);
            c.bass.as_mut().unwrap().gain = 0.5;
            c
        };
        let loud = {
            let mut c = walking(vec![40, 0, 45, 0, 47, 0, 52, 0]);
            c.bass.as_mut().unwrap().gain = 1.5;
            c
        };
        assert_ne!(
            render_signature(&quiet),
            render_signature(&loud),
            "the bass has to be in the key, or the loud table borrows the \
             quiet one's headroom"
        );
        // The drums, though, are the same drummer — which is a different
        // question, and the one the bar-line deferral asks.
        assert_eq!(drums_signature(&quiet), drums_signature(&loud));

        let cache = JamGainCache::new();
        let measured = compile_with(&quiet, &cache).unwrap();
        let after = compile_with(&loud, &cache).unwrap();
        assert!(
            after.base_peak > measured.base_peak,
            "a bass three times as loud is louder, and a memo that said \
             otherwise would be normalising the wrong table"
        );
        assert_eq!(after.base_peak, compile(&loud).unwrap().base_peak);
    }

    #[test]
    fn a_change_the_drummer_hears_misses_the_memo() {
        let cache = JamGainCache::new();
        let plain = compile_with(&twelve_bar(), &cache).unwrap();
        let mut louder = twelve_bar();
        louder.bar.crash = vec![2, 0, 0, 0, 0, 0, 0, 0];
        let crashing = compile_with(&louder, &cache).unwrap();
        assert!(
            crashing.base_peak > plain.base_peak,
            "a crash on the one is louder than no crash"
        );
        // Both are remembered, so going back is a hit rather than a render.
        assert_eq!(
            compile_with(&twelve_bar(), &cache).unwrap().base_peak,
            plain.base_peak
        );
    }

    #[test]
    fn a_memo_that_has_never_seen_this_table_measures_it() {
        let cache = JamGainCache::new();
        let with_memo = compile_with(&twelve_bar(), &cache).unwrap();
        let without = compile(&twelve_bar()).unwrap();
        assert_eq!(with_memo.peak_after, without.peak_after);
        assert_eq!(with_memo.base_peak, without.base_peak);
    }

    /// Intensity is applied after the render, so it cannot move the number
    /// the memo holds — and the three the UI offers must not each cost four
    /// bars of rendering more than once.
    #[test]
    fn the_intensity_dial_does_not_change_what_was_measured() {
        let cache = JamGainCache::new();
        let mut seen = Vec::new();
        for intensity in [0.7f32, 1.0, 1.25] {
            let mut cfg = twelve_bar();
            cfg.intensity = intensity;
            let t = compile_with(&cfg, &cache).unwrap();
            seen.push(t.base_peak);
            // The level the musician hears does move with the dial.
            assert!(t.peak_after > 0.0);
        }
        assert!(
            seen.windows(2).all(|w| w[0] == w[1]),
            "the measurement is taken at 1.0 and scaled afterwards: {seen:?}"
        );
    }

    /// The memo is a ring, so a form longer than it can hold keeps working —
    /// it just measures the bars that fell off the end again.
    #[test]
    fn a_memo_that_fills_up_forgets_the_oldest_and_stays_correct() {
        let cache = JamGainCache::new();
        // Two notes carry the counter so every line is distinct and every
        // pitch stays inside the bass's E1-to-G3 range.
        let line = |n: usize| {
            walking(vec![
                28 + (n % 28) as u8,
                0,
                28 + (n / 28) as u8,
                0,
                47,
                0,
                52,
                0,
            ])
        };
        let total = JAM_GAIN_MEMO + 8;
        for n in 0..total {
            let cfg = line(n);
            let t = compile_with(&cfg, &cache).unwrap();
            assert_eq!(
                t.base_peak,
                compile(&cfg).unwrap().base_peak,
                "entry {n} came back wrong"
            );
        }
        // The most recent are still remembered; the first ones are gone.
        assert!(cache.get(render_signature(&line(total - 1))).is_some());
        assert!(cache.get(render_signature(&line(0))).is_none());
    }
}

