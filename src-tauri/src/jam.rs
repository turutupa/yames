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
//!   bar, each holding up to five fixed-size `(sound, gain, ring-out)` slots.
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

use serde::Deserialize;

use crate::engine::{jam_reference_sample, SoundId};

// ---------------------------------------------------------------------------
// Limits — mirrored from src/jam/types.ts
// ---------------------------------------------------------------------------

/// Kick, snare, hat, ride, crash. The array on every tick is this wide, so a
/// tick is a fixed-size value the audio thread can read without a bounds
/// surprise or a heap touch.
pub const JAM_MAX_SLOTS: usize = 5;

/// `JAM_MAX_FORM_BARS` in `src/jam/types.ts`.
pub const JAM_MAX_FORM_BARS: u32 = 64;

/// The engine caps a bar at 16 beats (`validate_beat_groups`) and the
/// contract caps `ticksPerBeat` at 6, so no legal bar is longer than this.
pub const JAM_MAX_TICKS_PER_BAR: usize = 16 * 6;

/// Legal `ticksPerBeat` values, from the contract's union type.
const TICKS_PER_BEAT: [u32; 5] = [1, 2, 3, 4, 6];

/// How loud a cell is, by level: 0 off, 1 hit, 2 accent, 3 ghost. Applied
/// *before* intensity and the master volume.
const LEVEL_GAIN: [f32; 4] = [0.0, 0.8, 1.0, 0.35];

/// The ride is `DrumMetal` — the closed hat — at 0.6 and left to ring.
///
/// There is no ride sample in the bank today and one is not being
/// synthesised: no new WAVs in Jam 1. A quieter, longer hat is a stand-in
/// that reads as "the other cymbal" without pretending to be a ride. When a
/// real ride arrives this trim and [`RIDE_CAP_TICKS`] go with it.
const RIDE_TRIM: f32 = 0.6;

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
    fn lanes(&self) -> [(JamLane, &[u8]); JAM_MAX_SLOTS] {
        [
            (JamLane::Kick, &self.kick),
            (JamLane::Snare, &self.snare),
            (JamLane::Hat, &self.hat),
            (JamLane::Ride, &self.ride),
            (JamLane::Crash, &self.crash),
        ]
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum JamLane {
    Kick,
    Snare,
    Hat,
    Ride,
    Crash,
}

impl JamLane {
    fn name(self) -> &'static str {
        match self {
            Self::Kick => "kick",
            Self::Snare => "snare",
            Self::Hat => "hat",
            Self::Ride => "ride",
            Self::Crash => "crash",
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
    /// Reserved for kits. Only "room" exists today; the engine ignores it,
    /// and says so here rather than silently dropping the field.
    #[serde(default)]
    pub kit: String,
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
}

/// A placeholder for the unused tail of a tick's slot array. Gain 0.0, so
/// even a bug that read past `len` would be silent rather than loud.
const SILENT_SLOT: JamSlot = JamSlot {
    sound: SoundId::Kick,
    gain: 0.0,
    cap_ticks: 0.0,
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

    fn push(&mut self, slot: JamSlot, accent: bool) {
        if (self.len as usize) < JAM_MAX_SLOTS {
            self.slots[self.len as usize] = slot;
            self.len += 1;
        }
        self.accent |= accent;
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
    /// The crash on the one, already mixed to the table's normalisation.
    /// `None` when the jam did not ask for one, or when the groove's own
    /// crash lane already hits tick 0 — two crashes on the same sample is a
    /// cymbal at double volume, not a bigger cymbal.
    crash_on_one: Option<JamSlot>,
    /// The measured peak of the busiest tick, before and after the per-table
    /// normalisation. Diagnostics only; the audio thread never reads these.
    pub peak_before: f32,
    pub peak_after: f32,
}

impl JamTable {
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

    /// What the band plays at `tick_index` of bar `jam_bar` (0-based within
    /// the chorus). The fill replaces the groove on the last bar of the
    /// chorus when the jam has one.
    ///
    /// `None` only when the tick index is outside the bar, which the caller
    /// has already ruled out by comparing `ticks_per_bar`; it is a bounds
    /// check, not a decision.
    #[inline]
    pub fn tick(&self, tick_index: u32, jam_bar: u32) -> Option<&JamTick> {
        let table = match self.fill {
            Some(ref f) if jam_bar + 1 >= self.form_bars => f,
            _ => &self.bar,
        };
        table.get(tick_index as usize)
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

    let ticks = cfg.ticks_per_beat * cfg.beats_per_bar;
    debug_assert!(ticks as usize <= JAM_MAX_TICKS_PER_BAR);

    // Clamped, not rejected. See INTENSITY_MIN.
    let intensity = if cfg.intensity.is_finite() {
        cfg.intensity.clamp(INTENSITY_MIN, INTENSITY_MAX)
    } else {
        1.0
    };

    // Compiled at intensity 1.0 and scaled once at the end, so the
    // normalisation below can see the groove's own shape rather than the
    // shape times whatever the musician set the dial to.
    let mut bar = compile_pattern(&cfg.bar, ticks, "bar")?;
    let mut fill = match cfg.fill {
        Some(ref f) => Some(compile_pattern(f, ticks, "fill")?),
        None => None,
    };

    // The crash on the one. Level 2, because arriving at the top of the form
    // is the loudest thing the band does; the groove's own crash lane keeps
    // whatever level it was written with.
    let mut crash = if cfg.crash_on_one {
        let already = bar
            .first()
            .map(|t| t.slots().iter().any(|s| s.sound == SoundId::DrumCrash))
            .unwrap_or(false);
        if already {
            None
        } else {
            Some(JamSlot {
                sound: SoundId::DrumCrash,
                gain: LEVEL_GAIN[2],
                cap_ticks: 0.0,
            })
        }
    } else {
        None
    };

    // ---- The worst tick, measured rather than guessed ----
    //
    // Summing each sound's *peak* would be an upper bound and a bad one:
    // these transients do not land on the same sample (the kick's peak is
    // milliseconds in, the hat's is immediate), so a peak-sum says a full
    // band tick is three times full scale when the rendered sum is nowhere
    // near that. A table scaled by that bound would be inaudible. So the
    // worst tick is actually rendered, once, here — off the audio thread,
    // only when the jam changes.
    let base_peak = worst_tick_peak(&bar, fill.as_deref(), crash, cfg.form_bars);

    // Scale so that the busiest tick reaches the ceiling at LOUD and not
    // before, then apply the intensity the musician actually chose. A table
    // quiet enough not to need it keeps its level exactly.
    let headroom = base_peak * JAM_LOUD_INTENSITY;
    let norm = if headroom > JAM_TICK_CEILING {
        JAM_TICK_CEILING / headroom
    } else {
        1.0
    };
    let mut total = norm * intensity;
    // Above "loud" the range goes flat rather than clipping. Nothing the UI
    // can send reaches here; a store written by a future build can.
    if base_peak * total > JAM_TICK_CEILING {
        total = JAM_TICK_CEILING / base_peak;
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

    Ok(JamTable {
        ticks_per_bar: ticks,
        form_bars: cfg.form_bars,
        bar,
        fill,
        crash_on_one: crash,
        peak_before,
        peak_after,
    })
}

fn compile_pattern(pattern: &JamPattern, ticks: u32, what: &str) -> Result<Vec<JamTick>, String> {
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
            if let Some(slot) = slot_for(lane, level) {
                out[i].push(slot, level == 2);
            }
        }
    }
    Ok(out)
}

/// Lane and level to a sound, a gain and a ring-out. Intensity is NOT
/// applied here: the table is compiled at its own level and scaled once, so
/// the normalisation can measure the groove's shape rather than the shape
/// times whatever the musician set the dial to.
fn slot_for(lane: JamLane, level: u8) -> Option<JamSlot> {
    let g = LEVEL_GAIN[level as usize];
    if g <= 0.0 {
        return None;
    }
    let (sound, gain, cap_ticks) = match lane {
        // The kick and the snare are the pulse. They ring out: a kick cut at
        // 0.9 of a sixteenth at 240 BPM is a click, not a drum.
        JamLane::Kick => (SoundId::Kick, g, 0.0),
        JamLane::Snare => {
            let sound = if level == 2 {
                SoundId::SnareHigh
            } else {
                SoundId::SnareLow
            };
            (sound, g, 0.0)
        }
        JamLane::Hat => (SoundId::DrumMetal, g, HAT_CAP_TICKS),
        JamLane::Ride => (SoundId::DrumMetal, g * RIDE_TRIM, RIDE_CAP_TICKS),
        JamLane::Crash => (SoundId::DrumCrash, g, 0.0),
    };
    Some(JamSlot {
        sound,
        gain,
        cap_ticks,
    })
}

fn scale(ticks: &mut [JamTick], factor: f32) {
    for t in ticks.iter_mut() {
        for s in t.slots[..t.len as usize].iter_mut() {
            s.gain *= factor;
        }
    }
}

/// Render every tick of the table and return the loudest peak any of them
/// reaches. Allocates freely — this is the `set_jam` command thread.
fn worst_tick_peak(
    bar: &[JamTick],
    fill: Option<&[JamTick]>,
    crash: Option<JamSlot>,
    form_bars: u32,
) -> f32 {
    // Which table plays on bar 0 of the chorus — the only bar the crash
    // lands on. A one-bar form makes the FILL bar 0 as well as the last bar,
    // so the crash lands on the fill's first tick there and on the groove's
    // everywhere else. Measuring it on both regardless would be safe and
    // wrong: it over-normalises every form with a fill by the difference
    // between a groove's downbeat and a fill's, which on the busiest table
    // the probe can build is 1.6 dB of level thrown away for a bar that
    // never happens.
    let crash_on_fill = fill.is_some() && form_bars == 1;

    let mut worst = 0.0f32;
    for (i, t) in bar.iter().enumerate() {
        let extra = if i == 0 && !crash_on_fill { crash } else { None };
        worst = worst.max(tick_peak(t.slots(), extra));
    }
    if let Some(f) = fill {
        for (i, t) in f.iter().enumerate() {
            let extra = if i == 0 && crash_on_fill { crash } else { None };
            worst = worst.max(tick_peak(t.slots(), extra));
        }
    }
    worst
}

/// The true peak of one tick: the slots summed sample by sample, aligned at
/// their attacks the way the mixer sums them.
fn tick_peak(slots: &[JamSlot], extra: Option<JamSlot>) -> f32 {
    let mut all: [JamSlot; JAM_MAX_SLOTS + 1] = [SILENT_SLOT; JAM_MAX_SLOTS + 1];
    let mut n = 0usize;
    for s in slots.iter().chain(extra.iter()) {
        all[n] = *s;
        n += 1;
    }
    let active = &all[..n];
    if active.is_empty() {
        return 0.0;
    }
    let len = active
        .iter()
        .map(|s| jam_reference_sample(s.sound).len())
        .max()
        .unwrap_or(0);
    if len == 0 {
        return 0.0;
    }
    let mut acc = vec![0.0f32; len];
    for s in active {
        let buf = jam_reference_sample(s.sound);
        for (a, v) in acc.iter_mut().zip(buf.iter()) {
            *a += v * s.gain;
        }
    }
    acc.iter().fold(0.0f32, |m, v| m.max(v.abs()))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(tick0.slots()[0].sound, SoundId::Kick);
        assert_eq!(tick0.slots()[1].sound, SoundId::DrumMetal);
        assert!(!tick0.is_accent(), "the kick is a hit here, not an accent");

        // Tick 2 is beat 2: the backbeat, an accent, on the high snare.
        let back = t.tick(2, 0).unwrap();
        assert!(back.is_accent(), "a level-2 snare must read as an accent");
        assert!(back.slots().iter().any(|s| s.sound == SoundId::SnareHigh));

        // Tick 1 is a ghosted hat and nothing else.
        let off = t.tick(1, 0).unwrap();
        assert_eq!(off.slots().len(), 1);
        assert_eq!(off.slots()[0].sound, SoundId::DrumMetal);
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

    #[test]
    fn the_ride_is_a_quieter_longer_hat_until_it_has_its_own_sample() {
        let mut cfg = rock_8ths();
        cfg.bar.kick = vec![0; 8];
        cfg.bar.snare = vec![0; 8];
        cfg.bar.hat = vec![1, 0, 0, 0, 0, 0, 0, 0];
        cfg.bar.ride = vec![0, 1, 0, 0, 0, 0, 0, 0];
        let t = compile(&cfg).unwrap();
        let hat = t.tick(0, 0).unwrap().slots()[0];
        let ride = t.tick(1, 0).unwrap().slots()[0];
        assert_eq!(ride.sound, hat.sound, "no ride sample exists yet");
        assert!((ride.gain - hat.gain * 0.6).abs() < 1e-6);
        assert!(ride.cap_ticks > hat.cap_ticks, "the ride rings longer");
    }

    #[test]
    fn the_kick_and_the_snare_ring_out_and_the_hat_does_not() {
        let t = compile(&rock_8ths()).unwrap();
        for s in t.tick(0, 0).unwrap().slots() {
            match s.sound {
                SoundId::Kick => assert_eq!(s.cap_ticks, 0.0, "a kick must ring out"),
                SoundId::DrumMetal => assert!((s.cap_ticks - 0.9).abs() < 1e-6),
                other => panic!("unexpected sound {other:?} on tick 0"),
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
                .any(|s| s.sound == SoundId::Kick);
            assert!(has_kick, "bar {bar} of 4 is still the groove");
        }
        let last = t.tick(0, 3).unwrap();
        assert!(
            !last.slots().iter().any(|s| s.sound == SoundId::Kick),
            "the last bar of the chorus is the fill"
        );
    }

    #[test]
    fn the_crash_on_the_one_is_added_once_and_never_doubled() {
        let mut cfg = rock_8ths();
        cfg.crash_on_one = true;
        let t = compile(&cfg).unwrap();
        let crash = t.crash_on_one().expect("the jam asked for a crash");
        assert_eq!(crash.sound, SoundId::DrumCrash);
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

    /// THE TICK THAT WOULD HAVE CLIPPED.
    ///
    /// Kick, snare accent, hat, ride and crash together at intensity 1.25 is
    /// the loudest thing Jam can produce. The mixer clamps, but a clamped
    /// sum is a square wave, and the point of the per-table normalisation is
    /// that the ear never finds out.
    #[test]
    fn the_busiest_tick_stays_inside_full_scale() {
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
        let measured = worst_tick_peak(&t.bar, t.fill.as_deref(), t.crash_on_one(), t.form_bars());
        assert!(
            measured <= JAM_TICK_CEILING + 1e-4,
            "the compiled table still renders a tick at {measured}"
        );

        // Gentle: the groove's own balance survives the scaling.
        let tick = t.tick(0, 0).unwrap();
        let kick = tick.slots().iter().find(|s| s.sound == SoundId::Kick).unwrap();
        let snare = tick
            .slots()
            .iter()
            .find(|s| s.sound == SoundId::SnareHigh)
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
                .any(|s| s.sound == SoundId::Kick),
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
}

