//! What the coach would say, computed.
//!
//! `COACH_UX.md` A4–A5, `SONGS.md` S0.6, `LEARNING_PATHS_DECISIONS.md` E3.
//! One attempt goes in; a ranked list of [`Finding`]s comes out, each with
//! the numbers a sentence can be built from and a [`Fix`] the app can set up
//! in one tap. **Rules decide, the model narrates** (`ROADMAP.md` principle
//! 3): nothing here guesses, nothing here reads a clock, and the same input
//! always produces the same output.
//!
//! ## The shape of the judgement
//!
//! A4 ranks findings in one order and the whole module is built around it:
//! a passage you consistently miss, then a tendency, then a tempo ceiling,
//! then praise. **Exactly one correction is the headline** — the rest exist
//! to be opened, never pushed. [`headline`] returns it.
//!
//! ## What it will not do
//!
//! * A `softAbsent` onset never counts against the player, and neither does
//!   a *miss* on an onset the schedule marked `soft`: a hammer-on the ear
//!   could not hear is not a note the player dropped (`BRIEF.md`, B2).
//! * Chord notes are timing-only. Nothing here looks at which note was
//!   played, because nothing upstream knows yet (`SONGS.md` S0.5). A
//!   finding never implies otherwise, and the honesty line about chords
//!   belongs to the UI.
//! * No I/O, no clock, no randomness, no allocation on anybody's audio
//!   thread. This runs in the post-session tier (`AGENTS.md`).
//!
//! ## Reading the rules
//!
//! Every threshold is a named constant with the reason next to it, and the
//! tempo-dependent ones are derived from the same matching window the
//! scorer uses (`timing::window_thresholds`), so "early enough to mention"
//! means the same thing here as it does there.

use serde::{Deserialize, Serialize};

use crate::score::{ExtraOnset, OnsetResult, OnsetState, ScoreSchedule, SongScore, Technique};
use crate::srs::COMFORTABLE_MAD_MS;
use crate::timing::{tempo_aware_window_ms, window_thresholds, BeatFeedback, BeatTick};

// ---------------------------------------------------------------------------
// How much is enough — the constants every rule is stated in
// ---------------------------------------------------------------------------

/// Nothing is a finding on fewer samples than this. Four notes is the
/// smallest number that can show a tendency rather than an accident.
const MIN_ONSETS: u32 = 4;

/// "Missed on most passes" — half of them.
const MISS_PASS_FRACTION: f32 = 0.5;

/// Two shaky notes this far apart or closer are the same problem. One bar,
/// because a passage a player recognises is contiguous.
const MISS_GAP_BARS: u32 = 1;

/// A tendency needs this share of its samples pulling the same way before
/// it is a tendency and not a wide spread with a lopsided mean.
const BIAS_SIGN_FRACTION: f32 = 0.65;

/// Position shifts are rarer than notes, so they get a lower bar.
const MIN_SHIFT_ONSETS: u32 = 3;

/// A fret jump of this much is a new hand position.
const SHIFT_FRET_JUMP: i32 = 4;

/// So is skipping this many strings.
const SHIFT_STRING_SKIP: i32 = 2;

/// After a shift, this much extra miss rate over the rest of the passage is
/// the shift's fault and not noise.
const SHIFT_MISS_EXCESS: f32 = 0.25;

/// Stamina means nothing on a short passage.
const STAMINA_MIN_ONSETS: u32 = 16;

/// The back half losing this much hit rate is falling apart.
const STAMINA_HIT_DROP: f32 = 0.15;

/// So is the back half's spread growing by this much…
const STAMINA_SPREAD_GROWTH: f64 = 1.6;

/// …provided the front half was steady enough for the ratio to mean
/// anything. Below this, a 1.6× growth is two milliseconds.
const STAMINA_MIN_FIRST_MAD_MS: f64 = 3.0;

/// Fewer extra notes than this, anywhere, is a fingernail and not a habit.
const EXTRA_MIN_IN_CLUSTER: u32 = 3;

/// A bar is allowed this many stray onsets before it starts counting
/// towards a cluster — pick noise and ring-out are real.
const EXTRA_BAR_ALLOWANCE: f64 = 0.5;

/// Praise needs a run at least this long to be about something.
const CLEAN_MIN_RUN: u32 = 4;

/// Improvement worth volunteering: this much hit rate…
const IMPROVED_HIT_RATE_STEP: f32 = 0.10;

/// …or this share of the old spread…
const IMPROVED_MAD_FRACTION: f64 = 0.20;

/// …but never less than this in absolute terms, so a tidy attempt getting
/// half a millisecond tidier is not news.
const IMPROVED_MAD_MS: f64 = 4.0;

/// A tempo is collapsed when its hit rate is below this, whatever the
/// spread says.
const CEILING_HIT_RATE: f32 = 0.75;

/// And a tempo only counts as held when its hit rate is at least this.
const COMFORTABLE_HIT_RATE: f32 = 0.90;

/// How far a loop drops below the tempo that went wrong.
const SLOWER_STEP_PERCENT: u16 = 20;

/// …and how slow a suggested loop is ever allowed to get. Below half
/// tempo a passage stops being the same passage.
const MIN_LOOP_PERCENT: u16 = 50;

/// How far a ramp climbs above a clean pass.
const FASTER_STEP_PERCENT: u16 = 10;

/// When something improved, look at it again the day after tomorrow. The
/// real schedule is `srs.rs`'s, once the store has a record; this is the
/// coach's nudge when it has none.
const IMPROVED_COME_BACK_DAYS: u16 = 2;

/// And when it was already clean at full tempo, in three days.
const CLEAN_COME_BACK_DAYS: u16 = 3;

/// Free play: BPM is bucketed this coarsely before the ceiling is looked
/// for. Ten BPM is the granularity a player thinks in.
const CEILING_BAND_BPM: u16 = 10;

/// …and a band needs this many samples before it may claim a ceiling.
const CEILING_MIN_SAMPLES: u32 = 8;

/// Free play: a subdivision position this much weaker than the best one is
/// the weak one.
const SUBDIVISION_HIT_GAP: f32 = 0.20;

/// Free play: how much the ramp under a weak subdivision drops.
const SUBDIVISION_RAMP_FROM: u16 = 80;

// ---------------------------------------------------------------------------
// The output
// ---------------------------------------------------------------------------

/// What the coach found. Declaration order is the tiebreak of last resort
/// in the ranking, so it runs corrections first and praise last.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FindingKind {
    /// The same notes missed on most passes.
    ConsistentMiss,
    /// A passage, or a note value, played early.
    Rushing,
    /// A passage, or a note value, played late.
    Dragging,
    /// Late or missed after a position shift.
    AfterShift,
    /// Accuracy decaying across a long passage — stamina.
    FallsApart,
    /// Notes played that are not written, clustered somewhere.
    Extras,
    /// Wide spread with no bias: not early or late, just unsteady.
    Uneven,
    /// Free play: one position in the bar is out of line with the rest.
    BeatPositionBias,
    /// Free play: one subdivision position is landing far less often.
    SubdivisionWeak,
    /// Free play: the segment pulls steadily one way as it goes.
    Drift,
    /// The tempo where it stops holding together.
    TempoCeiling,
    /// What got better against earlier attempts, and by how much.
    Improved,
    /// A hard passage played right on every pass.
    Clean,
}

impl FindingKind {
    /// Praise, as opposed to a correction. A4 allows one correction as the
    /// headline and any amount of praise behind it.
    pub fn is_praise(self) -> bool {
        matches!(self, FindingKind::Improved | FindingKind::Clean)
    }

    /// A4's ranking, as a number: consistent misses, then tendencies, then
    /// the ceiling, then praise.
    pub fn tier(self) -> u8 {
        match self {
            FindingKind::ConsistentMiss => 0,
            FindingKind::Rushing
            | FindingKind::Dragging
            | FindingKind::AfterShift
            | FindingKind::FallsApart
            | FindingKind::Extras
            | FindingKind::Uneven
            | FindingKind::BeatPositionBias
            | FindingKind::SubdivisionWeak
            | FindingKind::Drift => 1,
            FindingKind::TempoCeiling => 2,
            FindingKind::Improved | FindingKind::Clean => 3,
        }
    }
}

/// Something the app can set up, in one tap or one footswitch press
/// (`COACH_UX.md` A5). Bars are played-bar indices — `SongScore::bars[i].index`,
/// not the number on the page; the page number rides along in
/// [`Evidence::printed_bars`] for the sentence to quote.
///
/// `start` and `end` are optional only because the free-play half of the
/// module has no bars to name; every finding drawn from a score fills them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Fix {
    /// Loop these bars at this share of the score's tempo.
    #[serde(rename_all = "camelCase")]
    LoopBars {
        start: u32,
        end: u32,
        tempo_percent: u16,
    },
    /// Climb from one tempo to another. The percentages are of
    /// [`Evidence::reference_bpm`] — the score's own tempo for a song, the
    /// tempo that was holding together for free play.
    #[serde(rename_all = "camelCase")]
    Ramp {
        start: Option<u32>,
        end: Option<u32>,
        from_percent: u16,
        to_percent: u16,
    },
    /// Put more clicks under it.
    #[serde(rename_all = "camelCase")]
    ClickSubdivision {
        start: Option<u32>,
        end: Option<u32>,
        subdivision: u8,
    },
    /// Leave it, and come back.
    ComeBack { days: u16 },
}

/// The numbers a sentence is built from. Everything optional is absent
/// rather than zero, so a narrator never quotes a number nobody measured.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Evidence {
    /// Expected onsets (or scored beats) this finding is drawn from,
    /// counting every pass.
    pub onsets: u32,
    pub hits: u32,
    pub hit_rate: f32,
    /// Signed mean deviation in ms. Negative is early.
    pub mean_deviation_ms: f64,
    /// The same number as a fraction of a beat — "about a sixteenth early".
    pub deviation_beats: f64,
    /// Median absolute deviation in ms, to the quarter-millisecond below.
    pub spread_ms: f64,
    /// Times round the loop this attempt made.
    pub passes: u32,
    /// How many of them this finding showed up on.
    pub passes_affected: u32,
    /// The BPM that 100 % means for this finding's fix.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference_bpm: Option<f64>,
    /// The same bars as `Finding::bars`, as they are numbered on the page.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub printed_bars: Option<(u32, u32)>,
    /// The note value this is about: 1 quarters, 2 eighths, 3 triplets,
    /// 4 sixteenths, 6 sextuplets — `timing.rs`'s divisors.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subdivision: Option<u8>,
    /// Free play: which beat of the bar, 1-based.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub beat_position: Option<u8>,
    /// Free play: which position inside the beat, 0-based, out of how many.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subdivision_position: Option<(u8, u8)>,
    /// (the tempo it holds, the tempo it collapses at), in BPM.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bpm_band: Option<(u16, u16)>,
    /// Notes played that are not written, inside this finding's bars. The
    /// one number an `extras` sentence is actually about: `onsets` and
    /// `hits` count what the score asked for, and these are the ones it
    /// did not.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extras: Option<u32>,
    /// Against earlier attempts: how much the hit rate moved…
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hit_rate_delta: Option<f32>,
    /// …and how many ms of spread came off.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spread_delta_ms: Option<f64>,
}

/// One thing the coach found.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub kind: FindingKind,
    /// Played bars, inclusive. Absent for free play, which has no score.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bars: Option<(u32, u32)>,
    /// The notes it is about, by `SongNote::id`, so the tab can colour them.
    pub note_ids: Vec<u32>,
    /// 0..1. Only ever compared inside one tier of the ranking.
    pub severity: f32,
    pub evidence: Evidence,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fix: Option<Fix>,
}

impl Finding {
    /// Whether this is a correction, as opposed to praise.
    pub fn is_correction(&self) -> bool {
        !self.kind.is_praise()
    }
}

/// The one thing to say (`COACH_UX.md` A4). The ranking puts it first, so
/// this is `findings.first()` — it exists so callers do not have to know
/// that, and so "the headline" is a word in the code as well as the plan.
///
/// It is a correction whenever there is one, and praise when there is not.
pub fn headline(findings: &[Finding]) -> Option<&Finding> {
    findings.first()
}

/// One attempt at a passage: every pass, as scoring reported it.
#[derive(Debug, Clone, Copy)]
pub struct Attempt<'a> {
    pub results: &'a [OnsetResult],
    pub extras: &'a [ExtraOnset],
    /// The tempo it was played at, as a share of the score's own tempo.
    pub tempo_percent: u16,
}

// ---------------------------------------------------------------------------
// Stage A — one attempt at a score
// ---------------------------------------------------------------------------

/// Judge one attempt, ranked, headline first.
///
/// `earlier` is previous attempts at the same passage, oldest first. It may
/// be empty; it is what makes [`FindingKind::Improved`] and the tempo
/// ceiling possible, and nothing else depends on it.
pub fn analyze_attempt(
    score: &SongScore,
    schedule: &ScoreSchedule,
    attempt: &Attempt,
    earlier: &[Attempt],
) -> Vec<Finding> {
    let ctx = Context::build(score, schedule, attempt.tempo_percent);
    if ctx.slots.is_empty() || score.bars.is_empty() {
        return Vec::new();
    }
    let agg = Aggregate::build(&ctx, attempt);

    let mut out: Vec<Finding> = Vec::new();
    out.extend(rule_consistent_miss(&ctx, &agg, attempt));
    out.extend(rule_bias(&ctx, &agg, attempt));
    out.extend(rule_after_shift(&ctx, &agg, attempt));
    out.extend(rule_falls_apart(&ctx, &agg, attempt));
    out.extend(rule_extras(&ctx, &agg, attempt));
    out.extend(rule_uneven(&ctx, &agg));
    out.extend(rule_tempo_ceiling(&ctx, &agg, attempt, earlier));
    out.extend(rule_improved(&ctx, &agg, attempt, earlier));
    out.extend(rule_clean(&ctx, &agg, attempt));
    rank(&mut out);
    out
}

/// A4's order, made total so that two findings of equal weight always come
/// out the same way round: tier, then severity, then kind, then position.
fn rank(findings: &mut [Finding]) {
    findings.sort_by(|a, b| {
        a.kind
            .tier()
            .cmp(&b.kind.tier())
            .then_with(|| {
                b.severity
                    .partial_cmp(&a.severity)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| a.kind.cmp(&b.kind))
            .then_with(|| a.bars.cmp(&b.bars))
            .then_with(|| a.note_ids.first().cmp(&b.note_ids.first()))
    });
}

// ---------------------------------------------------------------------------
// Context — everything derived from the score, once
// ---------------------------------------------------------------------------

/// One expected onset, with everything the rules need to know about where
/// it sits. Built once per call; every rule then reads it.
#[derive(Debug, Clone, Copy)]
struct Slot {
    /// Position in `score.bars`, not `ScoreBar::index`.
    bar: usize,
    beat: f64,
    soft: bool,
    /// 1, 2, 3, 4, 6, or 0 for a position no simple divisor explains.
    subdivision: u8,
    /// Whether a position shift happened between the previous onset and
    /// this one.
    after_shift: bool,
    /// The length of a beat here, at the tempo it was played at.
    beat_ms: f64,
    /// And the score's own tempo here, unscaled.
    score_bpm: f64,
    /// Whether any of its notes carry a technique a player would call hard.
    hard: bool,
}

struct Context<'a> {
    score: &'a SongScore,
    schedule: &'a ScoreSchedule,
    slots: Vec<Slot>,
    onset_ids: IdMap,
    min_beat: f64,
    max_beat: f64,
}

impl<'a> Context<'a> {
    fn build(score: &'a SongScore, schedule: &'a ScoreSchedule, tempo_percent: u16) -> Self {
        let note_ids = build_id_map(score.notes.len(), |i| score.notes[i].id);
        let tpq = f64::from(score.ticks_per_quarter.max(1));
        let scale = f64::from(tempo_percent.max(1)) / 100.0;

        let mut slots: Vec<Slot> = Vec::with_capacity(schedule.onsets.len());
        let mut previous_anchor: Option<(i32, i32)> = None;
        let mut min_beat = f64::MAX;
        let mut max_beat = f64::MIN;
        // One buffer, reused: an allocation per onset is ten thousand
        // allocations on the passage the gate measures.
        let mut notes: Vec<usize> = Vec::new();
        // Onsets arrive in tick order by contract, so the bar and the tempo
        // walk forward with them rather than being searched for each time.
        // Both cursors fall back to a binary search the moment an onset
        // arrives behind them, so an out-of-order schedule is slower and
        // still right.
        let mut bar_cursor = 0usize;
        let mut tempo_cursor = 0usize;

        for onset in &schedule.onsets {
            notes.clear();
            for &id in &onset.note_ids {
                if let Some(i) = note_ids.get(id) {
                    if i < score.notes.len() {
                        notes.push(i);
                    }
                }
            }
            let tick = notes
                .first()
                .map(|&n| score.notes[n].tick)
                .unwrap_or_else(|| {
                    // No notes on the onset: fall back to the beat axis,
                    // whose origin is the first played bar by contract.
                    let base = score.bars.first().map_or(0, |b| b.start_tick);
                    base.saturating_add((onset.beat.max(0.0) * tpq) as u32)
                });
            let bar = match score.bars.get(bar_cursor) {
                Some(at) if tick >= at.start_tick => {
                    while score
                        .bars
                        .get(bar_cursor + 1)
                        .is_some_and(|next| next.start_tick <= tick)
                    {
                        bar_cursor += 1;
                    }
                    bar_cursor
                }
                _ => bar_of_tick(score, tick),
            };
            let bar_start = score.bars.get(bar).map_or(0, |b| b.start_tick);
            let subdivision = subdivision_of(tick.saturating_sub(bar_start), score.ticks_per_quarter);

            let score_bpm = match score.tempo_map.get(tempo_cursor) {
                Some(at) if tick >= at.tick => {
                    while score
                        .tempo_map
                        .get(tempo_cursor + 1)
                        .is_some_and(|next| next.tick <= tick)
                    {
                        tempo_cursor += 1;
                    }
                    let bpm = score.tempo_map[tempo_cursor].bpm;
                    if bpm > 0.0 {
                        bpm
                    } else {
                        DEFAULT_BPM
                    }
                }
                _ => bpm_at_tick(score, tick),
            };
            let played_bpm = (score_bpm * scale).max(1.0);

            let anchor = position_anchor(score, &notes);
            let after_shift = match (previous_anchor, anchor) {
                (Some(prev), Some(now)) => is_shift(prev, now),
                _ => false,
            };
            if anchor.is_some() {
                previous_anchor = anchor;
            }

            let hard = notes.iter().any(|&n| is_hard(&score.notes[n].techniques));

            min_beat = min_beat.min(onset.beat);
            max_beat = max_beat.max(onset.beat);

            slots.push(Slot {
                bar,
                beat: onset.beat,
                soft: onset.soft,
                subdivision,
                after_shift,
                beat_ms: 60_000.0 / played_bpm,
                score_bpm,
                hard: hard || after_shift,
            });
        }

        Context {
            score,
            schedule,
            onset_ids: build_id_map(schedule.onsets.len(), |i| schedule.onsets[i].id),
            slots,
            min_beat: if min_beat == f64::MAX { 0.0 } else { min_beat },
            max_beat: if max_beat == f64::MIN { 0.0 } else { max_beat },
        }
    }

    fn bar_count(&self) -> usize {
        self.score.bars.len()
    }

    /// Played-bar numbers for a span of bar positions.
    fn bars_of(&self, first: usize, last: usize) -> Option<(u32, u32)> {
        let a = self.score.bars.get(first)?;
        let b = self.score.bars.get(last)?;
        Some((a.index, b.index))
    }

    /// And the same span as it is printed on the page.
    fn printed_of(&self, first: usize, last: usize) -> Option<(u32, u32)> {
        let a = self.score.bars.get(first)?;
        let b = self.score.bars.get(last)?;
        Some((a.printed_bar, b.printed_bar))
    }

    /// Every note id of every onset between two bar positions, in order.
    fn note_ids_between(&self, first: usize, last: usize) -> Vec<u32> {
        let mut ids = Vec::new();
        for (i, slot) in self.slots.iter().enumerate() {
            if slot.bar >= first && slot.bar <= last {
                for &id in &self.schedule.onsets[i].note_ids {
                    ids.push(id);
                }
            }
        }
        ids
    }

    fn score_bpm_at(&self, bar: usize) -> f64 {
        self.slots
            .iter()
            .find(|s| s.bar == bar)
            .map(|s| s.score_bpm)
            .unwrap_or_else(|| {
                let tick = self.score.bars.get(bar).map_or(0, |b| b.start_tick);
                bpm_at_tick(self.score, tick)
            })
    }
}

/// Which hand position an onset is played in: the lowest fretted note, and
/// the lowest string it touches. Dead notes are excluded — a muted string
/// says nothing about where the hand is.
///
/// Returns `(fret, string)`, with `fret` 0 when everything sounding is open.
fn position_anchor(score: &SongScore, notes: &[usize]) -> Option<(i32, i32)> {
    let mut fret: Option<i32> = None;
    let mut string: Option<i32> = None;
    for &i in notes {
        let note = &score.notes[i];
        if note.dead {
            continue;
        }
        string = Some(string.map_or(i32::from(note.string), |s: i32| s.min(i32::from(note.string))));
        if note.fret > 0 {
            fret = Some(fret.map_or(i32::from(note.fret), |f: i32| f.min(i32::from(note.fret))));
        }
    }
    string.map(|s| (fret.unwrap_or(0), s))
}

/// A position shift: a fret jump of four or more, or a skip of two strings
/// or more. An open string is not a position, so a pair involving one is
/// judged on the strings alone.
fn is_shift(previous: (i32, i32), now: (i32, i32)) -> bool {
    let (prev_fret, prev_string) = previous;
    let (fret, string) = now;
    let fret_jump = prev_fret > 0 && fret > 0 && (fret - prev_fret).abs() >= SHIFT_FRET_JUMP;
    let string_skip = (string - prev_string).abs() >= SHIFT_STRING_SKIP;
    fret_jump || string_skip
}

/// The techniques that make a passage hard enough for praise to be worth
/// something. Not an exhaustive list of difficulty — a list of things that
/// go wrong in time, which is all this module can see.
fn is_hard(techniques: &[Technique]) -> bool {
    techniques.iter().any(|t| {
        matches!(
            t,
            Technique::Bend | Technique::Tap | Technique::Harmonic | Technique::Slide
        )
    })
}

/// Which note value a tick offset inside its bar represents, as
/// `timing.rs`'s divisors: the coarsest one that lands exactly on it.
/// 0 when none does (a quintuplet, a swung sixteenth from a sloppy import).
fn subdivision_of(offset_in_bar: u32, ticks_per_quarter: u32) -> u8 {
    let tpq = ticks_per_quarter.max(1);
    let offset = offset_in_bar % tpq.max(1);
    for &d in &[1u32, 2, 3, 4, 6] {
        if tpq % d == 0 && offset % (tpq / d) == 0 {
            return d as u8;
        }
    }
    0
}

/// The position in `score.bars` holding a tick.
fn bar_of_tick(score: &SongScore, tick: u32) -> usize {
    let found = score.bars.partition_point(|b| b.start_tick <= tick);
    found.saturating_sub(1).min(score.bars.len().saturating_sub(1))
}

/// What a score with no usable tempo map is assumed to be.
const DEFAULT_BPM: f64 = 120.0;

/// The score's own tempo at a tick. Step changes only, first at tick 0.
fn bpm_at_tick(score: &SongScore, tick: u32) -> f64 {
    let found = score.tempo_map.partition_point(|t| t.tick <= tick);
    score
        .tempo_map
        .get(found.saturating_sub(1))
        .map(|t| t.bpm)
        .filter(|b| *b > 0.0)
        .unwrap_or(DEFAULT_BPM)
}

// ---------------------------------------------------------------------------
// Aggregate — one pass over the results, everything the rules count
// ---------------------------------------------------------------------------

/// Hits, misses and deviations for some subset of the attempt.
#[derive(Debug, Clone, Copy, Default)]
struct Tally {
    hits: u32,
    /// Misses that count against the player: never a `soft` onset.
    misses: u32,
    dev_sum: f64,
    beat_ms_sum: f64,
    early: u32,
    late: u32,
}

impl Tally {
    fn hit(&mut self, deviation_ms: f64, beat_ms: f64) {
        self.hits += 1;
        self.dev_sum += deviation_ms;
        self.beat_ms_sum += beat_ms;
        if deviation_ms < 0.0 {
            self.early += 1;
        } else if deviation_ms > 0.0 {
            self.late += 1;
        }
    }

    fn scored(&self) -> u32 {
        self.hits + self.misses
    }

    fn hit_rate(&self) -> f32 {
        if self.scored() == 0 {
            0.0
        } else {
            self.hits as f32 / self.scored() as f32
        }
    }

    fn mean_dev(&self) -> f64 {
        if self.hits == 0 {
            0.0
        } else {
            self.dev_sum / f64::from(self.hits)
        }
    }

    fn beat_ms(&self) -> f64 {
        if self.hits == 0 {
            0.0
        } else {
            self.beat_ms_sum / f64::from(self.hits)
        }
    }

    /// The share of hits pulling the way the mean does.
    fn sign_fraction(&self) -> f32 {
        if self.hits == 0 {
            return 0.0;
        }
        let leaning = if self.mean_dev() < 0.0 {
            self.early
        } else {
            self.late
        };
        leaning as f32 / self.hits as f32
    }
}

/// Per expected onset, across every pass.
#[derive(Debug, Clone, Copy, Default)]
struct SlotStat {
    tally: Tally,
    /// Passes this onset was missed on.
    miss_passes: u32,
}

/// Per bar, across every pass.
#[derive(Debug, Clone, Copy, Default)]
struct BarStat {
    tally: Tally,
    extras: u32,
}

/// One subdivision bucket: quarters, eighths, triplets, sixteenths,
/// sextuplets.
#[derive(Debug, Clone, Copy, Default)]
struct SubStat {
    tally: Tally,
}

struct Aggregate {
    passes: u32,
    global: Tally,
    per_slot: Vec<SlotStat>,
    per_bar: Vec<BarStat>,
    /// Indexed by divisor, so 0..=6 with 5 unused.
    per_sub: [SubStat; 7],
    shift: Tally,
    plain: Tally,
    all_devs: Vec<f64>,
    first_half_devs: Vec<f64>,
    second_half_devs: Vec<f64>,
    first_half: Tally,
    second_half: Tally,
    total_extras: u32,
}

impl Aggregate {
    fn build(ctx: &Context, attempt: &Attempt) -> Self {
        let mut agg = Aggregate {
            passes: 0,
            global: Tally::default(),
            per_slot: vec![SlotStat::default(); ctx.slots.len()],
            per_bar: vec![BarStat::default(); ctx.bar_count()],
            per_sub: [SubStat::default(); 7],
            shift: Tally::default(),
            plain: Tally::default(),
            all_devs: Vec::with_capacity(attempt.results.len()),
            first_half_devs: Vec::with_capacity(attempt.results.len() / 2 + 1),
            second_half_devs: Vec::with_capacity(attempt.results.len() / 2 + 1),
            first_half: Tally::default(),
            second_half: Tally::default(),
            total_extras: 0,
        };
        let midpoint = (ctx.min_beat + ctx.max_beat) / 2.0;

        for result in attempt.results {
            agg.passes = agg.passes.max(result.pass.saturating_add(1));
            let Some(slot_index) = ctx.onset_ids.get(result.id) else {
                continue;
            };
            let Some(slot) = ctx.slots.get(slot_index).copied() else {
                continue;
            };
            let stat = &mut agg.per_slot[slot_index];
            let bar = &mut agg.per_bar[slot.bar.min(ctx.bar_count().saturating_sub(1))];
            let sub = &mut agg.per_sub[usize::from(slot.subdivision.min(6))];
            let first_half = slot.beat <= midpoint;

            match result.state {
                OnsetState::Hit => {
                    let dev = result.deviation_ms.unwrap_or(0.0);
                    for t in [
                        &mut stat.tally,
                        &mut bar.tally,
                        &mut sub.tally,
                        &mut agg.global,
                    ] {
                        t.hit(dev, slot.beat_ms);
                    }
                    if slot.after_shift {
                        agg.shift.hit(dev, slot.beat_ms);
                    } else {
                        agg.plain.hit(dev, slot.beat_ms);
                    }
                    agg.all_devs.push(dev);
                    if first_half {
                        agg.first_half.hit(dev, slot.beat_ms);
                        agg.first_half_devs.push(dev);
                    } else {
                        agg.second_half.hit(dev, slot.beat_ms);
                        agg.second_half_devs.push(dev);
                    }
                }
                OnsetState::Miss => {
                    // A `soft` onset the ear did not hear is not a note the
                    // player dropped, whichever state the scorer chose for
                    // it. It is counted nowhere.
                    if slot.soft {
                        continue;
                    }
                    stat.miss_passes += 1;
                    stat.tally.misses += 1;
                    bar.tally.misses += 1;
                    sub.tally.misses += 1;
                    agg.global.misses += 1;
                    if slot.after_shift {
                        agg.shift.misses += 1;
                    } else {
                        agg.plain.misses += 1;
                    }
                    if first_half {
                        agg.first_half.misses += 1;
                    } else {
                        agg.second_half.misses += 1;
                    }
                }
                OnsetState::SoftAbsent => {}
            }
        }

        // Extras land on the beat axis, whose origin is the first played bar.
        let tpq = f64::from(ctx.score.ticks_per_quarter.max(1));
        let base = ctx.score.bars.first().map_or(0, |b| b.start_tick);
        for extra in attempt.extras {
            agg.passes = agg.passes.max(extra.pass.saturating_add(1));
            agg.total_extras += 1;
            let tick = base.saturating_add((extra.beat.max(0.0) * tpq) as u32);
            let bar = bar_of_tick(ctx.score, tick);
            if let Some(stat) = agg.per_bar.get_mut(bar) {
                stat.extras += 1;
            }
        }
        agg.passes = agg.passes.max(1);
        agg
    }
}

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/// **consistentMiss** — notes missed on most passes, clustered into the
/// passage they belong to.
fn rule_consistent_miss(ctx: &Context, agg: &Aggregate, attempt: &Attempt) -> Option<Finding> {
    let shaky = |i: usize| -> bool {
        let stat = agg.per_slot[i];
        stat.tally.scored() > 0
            && (stat.tally.misses as f32 / stat.tally.scored() as f32) >= MISS_PASS_FRACTION
    };

    // Runs of shaky onsets no more than MISS_GAP_BARS apart.
    let mut best: Option<(Vec<usize>, f32)> = None;
    let mut run: Vec<usize> = Vec::new();
    let flush = |run: &mut Vec<usize>, best: &mut Option<(Vec<usize>, f32)>| {
        if run.is_empty() {
            return;
        }
        let long_enough = run.len() >= 2 || agg.passes >= 2;
        if long_enough {
            let misses: u32 = run.iter().map(|&i| agg.per_slot[i].miss_passes).sum();
            let weight = misses as f32;
            if best.as_ref().is_none_or(|(_, w)| weight > *w) {
                *best = Some((run.clone(), weight));
            }
        }
        run.clear();
    };

    for i in 0..ctx.slots.len() {
        if !shaky(i) {
            continue;
        }
        let breaks = run
            .last()
            .is_some_and(|&last| ctx.slots[i].bar.saturating_sub(ctx.slots[last].bar) > MISS_GAP_BARS as usize);
        if breaks {
            flush(&mut run, &mut best);
        }
        run.push(i);
    }
    flush(&mut run, &mut best);

    let (run, _) = best?;
    let first_bar = run.iter().map(|&i| ctx.slots[i].bar).min()?;
    let last_bar = run.iter().map(|&i| ctx.slots[i].bar).max()?;

    let mut tally = Tally::default();
    let mut passes_affected: u32 = 0;
    let mut note_ids: Vec<u32> = Vec::new();
    for &i in &run {
        let stat = agg.per_slot[i];
        tally.hits += stat.tally.hits;
        tally.misses += stat.tally.misses;
        tally.dev_sum += stat.tally.dev_sum;
        tally.beat_ms_sum += stat.tally.beat_ms_sum;
        passes_affected = passes_affected.max(stat.miss_passes);
        note_ids.extend_from_slice(&ctx.schedule.onsets[i].note_ids);
    }
    let miss_rate = if tally.scored() == 0 {
        0.0
    } else {
        tally.misses as f32 / tally.scored() as f32
    };
    // Severity is the miss rate, lifted by how much of a passage it is: one
    // dead note is worth less than four in a row missed just as often.
    let coverage = 0.7 + 0.3 * (run.len() as f32 / 4.0).min(1.0);
    let bars = ctx.bars_of(first_bar, last_bar)?;

    Some(Finding {
        kind: FindingKind::ConsistentMiss,
        bars: Some(bars),
        note_ids,
        severity: (miss_rate * coverage).clamp(0.0, 1.0),
        evidence: Evidence {
            printed_bars: ctx.printed_of(first_bar, last_bar),
            reference_bpm: Some(ctx.score_bpm_at(first_bar)),
            passes_affected,
            ..evidence_of(&tally, agg.passes)
        },
        fix: Some(Fix::LoopBars {
            start: bars.0,
            end: bars.1,
            tempo_percent: slower(attempt.tempo_percent),
        }),
    })
}

/// **rushing / dragging** — a signed bias, on a note value when one note
/// value carries it and another does not, on the passage otherwise.
fn rule_bias(ctx: &Context, agg: &Aggregate, attempt: &Attempt) -> Option<Finding> {
    let biased = |t: &Tally| -> Option<f64> {
        if t.hits < MIN_ONSETS {
            return None;
        }
        let threshold = bias_threshold_ms(t.beat_ms());
        let mean = t.mean_dev();
        if mean.abs() >= threshold && t.sign_fraction() >= BIAS_SIGN_FRACTION {
            Some(mean.abs() / threshold)
        } else {
            None
        }
    };

    // Is there a contrast between note values? A passage where everything
    // rushes is a passage that rushes, not a sixteenth-note problem.
    let mut worst: Option<(u8, f64)> = None;
    let mut clean_bucket = false;
    for d in [1u8, 2, 3, 4, 6] {
        let bucket = &agg.per_sub[usize::from(d)];
        if bucket.tally.hits < MIN_ONSETS {
            continue;
        }
        match biased(&bucket.tally) {
            Some(ratio) => {
                if worst.is_none_or(|(_, best)| ratio > best) {
                    worst = Some((d, ratio));
                }
            }
            None => clean_bucket = true,
        }
    }

    let (subdivision, tally) = match worst {
        Some((d, _)) if clean_bucket => (Some(d), agg.per_sub[usize::from(d)].tally),
        _ => (None, agg.global),
    };
    let ratio = biased(&tally)?;
    let mean = tally.mean_dev();
    let kind = if mean < 0.0 {
        FindingKind::Rushing
    } else {
        FindingKind::Dragging
    };

    let (first_bar, last_bar) = bias_span(ctx, attempt, subdivision, mean.signum(), &agg.per_bar)?;
    let bars = ctx.bars_of(first_bar, last_bar)?;
    let fix = match subdivision {
        // One note value out of line: put the click on that note value, so
        // the thing that is drifting has something to land on. This is
        // A5's own example, in reverse.
        Some(click) => Some(Fix::ClickSubdivision {
            start: Some(bars.0),
            end: Some(bars.1),
            subdivision: click,
        }),
        // The whole passage leans: there is no click that fixes that, only
        // a slower tempo.
        None => Some(Fix::LoopBars {
            start: bars.0,
            end: bars.1,
            tempo_percent: slower(attempt.tempo_percent),
        }),
    };

    Some(Finding {
        kind,
        bars: Some(bars),
        note_ids: ctx.note_ids_between(first_bar, last_bar),
        severity: ((ratio - 1.0) / 2.0).clamp(0.0, 1.0) as f32,
        evidence: Evidence {
            subdivision,
            printed_bars: ctx.printed_of(first_bar, last_bar),
            reference_bpm: Some(ctx.score_bpm_at(first_bar)),
            passes_affected: agg.passes,
            ..evidence_of(&tally, agg.passes)
        },
        fix,
    })
}

/// Where a bias is worst: the contiguous stretch of bars that maximises how
/// far past the threshold it leans, weighted by how many notes are in it.
/// Falls back to the whole span when no stretch stands out.
fn bias_span(
    ctx: &Context,
    attempt: &Attempt,
    subdivision: Option<u8>,
    sign: f64,
    per_bar: &[BarStat],
) -> Option<(usize, usize)> {
    let mut weights = vec![0.0f64; ctx.bar_count()];
    let mut any = false;
    if let Some(d) = subdivision {
        // A second pass, because the per-bar tallies are not split by note
        // value and a note-value finding must not be located by the others.
        let mut per_bar_sub = vec![Tally::default(); ctx.bar_count()];
        for result in attempt.results {
            if result.state != OnsetState::Hit {
                continue;
            }
            let Some(i) = ctx.onset_ids.get(result.id) else {
                continue;
            };
            let Some(slot) = ctx.slots.get(i) else { continue };
            if slot.subdivision != d {
                continue;
            }
            per_bar_sub[slot.bar].hit(result.deviation_ms.unwrap_or(0.0), slot.beat_ms);
        }
        for (b, t) in per_bar_sub.iter().enumerate() {
            weights[b] = bar_weight(t, sign);
            any |= t.hits > 0;
        }
    } else {
        for (b, stat) in per_bar.iter().enumerate() {
            weights[b] = bar_weight(&stat.tally, sign);
            any |= stat.tally.hits > 0;
        }
    }
    if !any {
        return None;
    }
    best_run(&weights).or_else(|| {
        let first = (0..ctx.bar_count()).find(|&b| weights[b] != 0.0)?;
        let last = (0..ctx.bar_count()).rev().find(|&b| weights[b] != 0.0)?;
        Some((first, last))
    })
}

/// How far one bar leans past the threshold, in note-milliseconds.
fn bar_weight(t: &Tally, sign: f64) -> f64 {
    if t.hits == 0 {
        return 0.0;
    }
    let threshold = bias_threshold_ms(t.beat_ms());
    (sign * t.mean_dev() - threshold) * f64::from(t.hits)
}

/// **afterShift** — onsets that follow a position shift, compared with the
/// ones that do not.
fn rule_after_shift(ctx: &Context, agg: &Aggregate, attempt: &Attempt) -> Option<Finding> {
    if agg.shift.scored() < MIN_SHIFT_ONSETS || agg.plain.scored() < MIN_ONSETS {
        return None;
    }
    let threshold = bias_threshold_ms(if agg.shift.beat_ms() > 0.0 {
        agg.shift.beat_ms()
    } else {
        agg.plain.beat_ms()
    });
    let late_excess = agg.shift.mean_dev() - agg.plain.mean_dev();
    let miss_excess = (1.0 - agg.shift.hit_rate()) - (1.0 - agg.plain.hit_rate());
    let late = agg.shift.hits >= MIN_SHIFT_ONSETS && late_excess >= threshold;
    let dropped = miss_excess >= SHIFT_MISS_EXCESS;
    if !late && !dropped {
        return None;
    }

    // Only the shifts that actually went wrong are the finding.
    let mut first_bar = usize::MAX;
    let mut last_bar = 0usize;
    let mut note_ids: Vec<u32> = Vec::new();
    let mut tally = Tally::default();
    let mut passes_affected = 0u32;
    for (i, slot) in ctx.slots.iter().enumerate() {
        if !slot.after_shift {
            continue;
        }
        let stat = agg.per_slot[i];
        let offending = stat.miss_passes > 0
            || (stat.tally.hits > 0 && stat.tally.mean_dev() >= agg.plain.mean_dev() + threshold);
        if !offending {
            continue;
        }
        first_bar = first_bar.min(slot.bar);
        last_bar = last_bar.max(slot.bar);
        note_ids.extend_from_slice(&ctx.schedule.onsets[i].note_ids);
        tally.hits += stat.tally.hits;
        tally.misses += stat.tally.misses;
        tally.dev_sum += stat.tally.dev_sum;
        tally.beat_ms_sum += stat.tally.beat_ms_sum;
        passes_affected = passes_affected.max(stat.miss_passes.max(1));
    }
    if first_bar == usize::MAX {
        return None;
    }
    let bars = ctx.bars_of(first_bar, last_bar)?;
    let by_time = (late_excess / (3.0 * threshold.max(1.0))).clamp(0.0, 1.0) as f32;
    let by_drop = (miss_excess / 0.5).clamp(0.0, 1.0);

    Some(Finding {
        kind: FindingKind::AfterShift,
        bars: Some(bars),
        note_ids,
        severity: by_time.max(by_drop),
        evidence: Evidence {
            printed_bars: ctx.printed_of(first_bar, last_bar),
            reference_bpm: Some(ctx.score_bpm_at(first_bar)),
            passes_affected,
            ..evidence_of(&tally, agg.passes)
        },
        fix: Some(Fix::LoopBars {
            start: bars.0,
            end: bars.1,
            tempo_percent: slower(attempt.tempo_percent),
        }),
    })
}

/// **fallsApart** — the back half of a long passage losing notes, or losing
/// steadiness. Stamina, not tempo; the ceiling is its own finding.
fn rule_falls_apart(ctx: &Context, agg: &Aggregate, attempt: &Attempt) -> Option<Finding> {
    if agg.global.scored() < STAMINA_MIN_ONSETS
        || agg.first_half.scored() < MIN_ONSETS
        || agg.second_half.scored() < MIN_ONSETS
    {
        return None;
    }
    let drop = agg.first_half.hit_rate() - agg.second_half.hit_rate();
    let first = spread(&agg.first_half_devs);
    let second = spread(&agg.second_half_devs);
    let growth = if first.mad_ms >= STAMINA_MIN_FIRST_MAD_MS {
        second.mad_ms / first.mad_ms
    } else {
        0.0
    };
    if drop < STAMINA_HIT_DROP && growth < STAMINA_SPREAD_GROWTH {
        return None;
    }

    let midpoint = (ctx.min_beat + ctx.max_beat) / 2.0;
    let back: Vec<usize> = (0..ctx.slots.len())
        .filter(|&i| ctx.slots[i].beat > midpoint)
        .collect();
    let first_bar = back.iter().map(|&i| ctx.slots[i].bar).min()?;
    let last_bar = back.iter().map(|&i| ctx.slots[i].bar).max()?;
    let whole_first = ctx.slots.iter().map(|s| s.bar).min()?;
    let whole_last = ctx.slots.iter().map(|s| s.bar).max()?;
    let bars = ctx.bars_of(first_bar, last_bar)?;
    let whole = ctx.bars_of(whole_first, whole_last)?;

    let by_drop = (drop / 0.5).clamp(0.0, 1.0);
    let by_growth = ((growth - 1.0) / 1.5).clamp(0.0, 1.0) as f32;

    Some(Finding {
        kind: FindingKind::FallsApart,
        bars: Some(bars),
        note_ids: ctx.note_ids_between(first_bar, last_bar),
        severity: by_drop.max(by_growth),
        evidence: Evidence {
            printed_bars: ctx.printed_of(first_bar, last_bar),
            reference_bpm: Some(ctx.score_bpm_at(first_bar)),
            spread_ms: second.mad_ms,
            spread_delta_ms: Some(second.mad_ms - first.mad_ms),
            hit_rate_delta: Some(-drop),
            passes_affected: agg.passes,
            ..evidence_of(&agg.second_half, agg.passes)
        },
        // Stamina needs the run-up, so the loop is the whole passage even
        // though the evidence is in its back half.
        fix: Some(Fix::LoopBars {
            start: whole.0,
            end: whole.1,
            tempo_percent: attempt.tempo_percent,
        }),
    })
}

/// **extras** — notes that are not written, where they cluster.
fn rule_extras(ctx: &Context, agg: &Aggregate, attempt: &Attempt) -> Option<Finding> {
    if agg.total_extras < EXTRA_MIN_IN_CLUSTER {
        return None;
    }
    let weights: Vec<f64> = agg
        .per_bar
        .iter()
        .map(|b| f64::from(b.extras) - EXTRA_BAR_ALLOWANCE)
        .collect();
    let (first_bar, last_bar) = best_run(&weights)?;
    let cluster: u32 = agg.per_bar[first_bar..=last_bar].iter().map(|b| b.extras).sum();
    if cluster < EXTRA_MIN_IN_CLUSTER {
        return None;
    }
    let written: u32 = agg.per_bar[first_bar..=last_bar]
        .iter()
        .map(|b| b.tally.scored())
        .sum();
    let bars = ctx.bars_of(first_bar, last_bar)?;

    let mut tally = Tally::default();
    for stat in &agg.per_bar[first_bar..=last_bar] {
        tally.hits += stat.tally.hits;
        tally.misses += stat.tally.misses;
        tally.dev_sum += stat.tally.dev_sum;
        tally.beat_ms_sum += stat.tally.beat_ms_sum;
    }

    Some(Finding {
        kind: FindingKind::Extras,
        bars: Some(bars),
        note_ids: ctx.note_ids_between(first_bar, last_bar),
        severity: (f64::from(cluster) / f64::from(cluster + written.max(1))).clamp(0.0, 1.0) as f32,
        evidence: Evidence {
            printed_bars: ctx.printed_of(first_bar, last_bar),
            reference_bpm: Some(ctx.score_bpm_at(first_bar)),
            extras: Some(cluster),
            passes_affected: agg.passes.min(cluster),
            ..evidence_of(&tally, agg.passes)
        },
        fix: Some(Fix::LoopBars {
            start: bars.0,
            end: bars.1,
            tempo_percent: slower(attempt.tempo_percent),
        }),
    })
}

/// **uneven** — wide spread, no bias. Not early, not late, just unsteady.
fn rule_uneven(ctx: &Context, agg: &Aggregate) -> Option<Finding> {
    if agg.global.hits < MIN_ONSETS {
        return None;
    }
    let beat_ms = agg.global.beat_ms();
    let spread_limit = spread_threshold_ms(beat_ms);
    let stats = spread(&agg.all_devs);
    if stats.mad_ms < spread_limit {
        return None;
    }
    // A bias is its own finding. This one is only for the spread that has
    // nowhere to point.
    if agg.global.mean_dev().abs() >= bias_threshold_ms(beat_ms) {
        return None;
    }
    let first_bar = ctx.slots.iter().map(|s| s.bar).min()?;
    let last_bar = ctx.slots.iter().map(|s| s.bar).max()?;
    let bars = ctx.bars_of(first_bar, last_bar)?;

    // Put the click on whatever note value the passage is mostly made of,
    // and never coarser than eighths — a quarter-note click is what the
    // player already had when it came out uneven.
    let dominant = [1u8, 2, 3, 4, 6]
        .into_iter()
        .max_by_key(|&d| agg.per_sub[usize::from(d)].tally.hits)
        .unwrap_or(4);
    let fix = Fix::ClickSubdivision {
        start: Some(bars.0),
        end: Some(bars.1),
        subdivision: dominant.max(2),
    };

    Some(Finding {
        kind: FindingKind::Uneven,
        bars: Some(bars),
        note_ids: ctx.note_ids_between(first_bar, last_bar),
        severity: ((stats.mad_ms / spread_limit) - 1.0).clamp(0.0, 1.0) as f32,
        evidence: Evidence {
            spread_ms: stats.mad_ms,
            printed_bars: ctx.printed_of(first_bar, last_bar),
            reference_bpm: Some(ctx.score_bpm_at(first_bar)),
            passes_affected: agg.passes,
            ..evidence_of(&agg.global, agg.passes)
        },
        fix: Some(fix),
    })
}

/// **tempoCeiling** — the tempo it holds, and the tempo above it where it
/// comes apart. Needs earlier attempts: one attempt is one tempo.
fn rule_tempo_ceiling(
    ctx: &Context,
    agg: &Aggregate,
    attempt: &Attempt,
    earlier: &[Attempt],
) -> Option<Finding> {
    // A ceiling is a comparison between tempos, and one attempt is one
    // tempo. With no history there is nothing to compare, and rebuilding
    // the aggregate to discover that would cost a pass over every onset.
    if earlier.is_empty() {
        return None;
    }

    /// One tempo's worth of evidence.
    struct Rung {
        percent: u16,
        mad_ms: f64,
        hit_rate: f32,
        scored: u32,
    }
    let mut rungs: Vec<Rung> = Vec::with_capacity(earlier.len() + 1);
    for past in earlier.iter().chain(std::iter::once(attempt)) {
        let past_agg = Aggregate::build(ctx, past);
        rungs.push(Rung {
            percent: past.tempo_percent,
            mad_ms: spread(&past_agg.all_devs).mad_ms,
            hit_rate: past_agg.global.hit_rate(),
            scored: past_agg.global.scored(),
        });
    }
    rungs.retain(|r| r.scored >= MIN_ONSETS);
    rungs.sort_by_key(|r| r.percent);

    let comfortable = rungs
        .iter()
        .filter(|r| r.mad_ms <= COMFORTABLE_MAD_MS && r.hit_rate >= COMFORTABLE_HIT_RATE)
        .next_back()?;
    let collapse = rungs
        .iter()
        .find(|r| {
            r.percent > comfortable.percent
                && (r.mad_ms > COMFORTABLE_MAD_MS || r.hit_rate < CEILING_HIT_RATE)
        })?;

    let first_bar = ctx.slots.iter().map(|s| s.bar).min()?;
    let last_bar = ctx.slots.iter().map(|s| s.bar).max()?;
    let bars = ctx.bars_of(first_bar, last_bar)?;
    let reference = ctx.score_bpm_at(first_bar);
    let band = (
        percent_of(reference, comfortable.percent),
        percent_of(reference, collapse.percent),
    );

    Some(Finding {
        kind: FindingKind::TempoCeiling,
        bars: Some(bars),
        note_ids: ctx.note_ids_between(first_bar, last_bar),
        severity: ((collapse.mad_ms / COMFORTABLE_MAD_MS) - 1.0).clamp(0.0, 1.0) as f32,
        evidence: Evidence {
            spread_ms: collapse.mad_ms,
            bpm_band: Some(band),
            printed_bars: ctx.printed_of(first_bar, last_bar),
            reference_bpm: Some(reference),
            passes_affected: agg.passes,
            ..evidence_of(&agg.global, agg.passes)
        },
        fix: Some(Fix::Ramp {
            start: Some(bars.0),
            end: Some(bars.1),
            from_percent: comfortable.percent,
            to_percent: collapse.percent,
        }),
    })
}

/// **improved** — specific praise against earlier attempts: which bars got
/// better, and by how much.
fn rule_improved(
    ctx: &Context,
    agg: &Aggregate,
    attempt: &Attempt,
    earlier: &[Attempt],
) -> Option<Finding> {
    // The most useful comparison is the last attempt at the same tempo;
    // failing that, simply the last one.
    let previous = earlier
        .iter()
        .rev()
        .find(|a| a.tempo_percent == attempt.tempo_percent)
        .or_else(|| earlier.last())?;
    if previous.tempo_percent > attempt.tempo_percent {
        // Getting tidier by slowing down is not an improvement worth
        // volunteering.
        return None;
    }
    let before = Aggregate::build(ctx, previous);
    if before.global.scored() < MIN_ONSETS || agg.global.scored() < MIN_ONSETS {
        return None;
    }
    let hit_gain = agg.global.hit_rate() - before.global.hit_rate();
    let before_spread = spread(&before.all_devs);
    let now_spread = spread(&agg.all_devs);
    let mad_gain = before_spread.mad_ms - now_spread.mad_ms;
    let mad_enough = mad_gain >= IMPROVED_MAD_MS.max(before_spread.mad_ms * IMPROVED_MAD_FRACTION);
    if hit_gain < IMPROVED_HIT_RATE_STEP && !mad_enough {
        return None;
    }

    // Where it improved most, so the praise names bars and not the song.
    let weights: Vec<f64> = (0..ctx.bar_count())
        .map(|b| {
            let now = agg.per_bar[b].tally;
            let then = before.per_bar[b].tally;
            if now.scored() == 0 || then.scored() == 0 {
                return 0.0;
            }
            f64::from(now.hit_rate() - then.hit_rate()) * f64::from(now.scored())
        })
        .collect();
    let (first_bar, last_bar) = best_run(&weights).unwrap_or((
        ctx.slots.iter().map(|s| s.bar).min()?,
        ctx.slots.iter().map(|s| s.bar).max()?,
    ));
    let bars = ctx.bars_of(first_bar, last_bar)?;

    Some(Finding {
        kind: FindingKind::Improved,
        bars: Some(bars),
        note_ids: ctx.note_ids_between(first_bar, last_bar),
        severity: (f64::from(hit_gain) / 0.3)
            .max(mad_gain / 20.0)
            .clamp(0.0, 1.0) as f32,
        evidence: Evidence {
            spread_ms: now_spread.mad_ms,
            hit_rate_delta: Some(hit_gain),
            spread_delta_ms: Some(mad_gain),
            printed_bars: ctx.printed_of(first_bar, last_bar),
            reference_bpm: Some(ctx.score_bpm_at(first_bar)),
            passes_affected: agg.passes,
            ..evidence_of(&agg.global, agg.passes)
        },
        fix: Some(Fix::ComeBack {
            days: IMPROVED_COME_BACK_DAYS,
        }),
    })
}

/// **clean** — the longest run played right on every pass, preferring one
/// that was hard. Never generic: it names bars, a count of passes and a
/// spread.
fn rule_clean(ctx: &Context, agg: &Aggregate, attempt: &Attempt) -> Option<Finding> {
    let mut best: Option<(usize, usize, bool)> = None;
    let mut start: Option<usize> = None;
    let mut hard = false;

    let consider = |start: usize, end: usize, hard: bool, best: &mut Option<(usize, usize, bool)>| {
        let len = (end - start + 1) as u32;
        if len < CLEAN_MIN_RUN {
            return;
        }
        let better = match *best {
            // A hard run beats a long one; among equals, the longer, then
            // the earlier.
            Some((bs, be, bh)) => (hard, len) > (bh, (be - bs + 1) as u32),
            None => true,
        };
        if better {
            *best = Some((start, end, hard));
        }
    };

    for i in 0..ctx.slots.len() {
        let stat = agg.per_slot[i];
        let clean = stat.tally.misses == 0 && stat.tally.hits > 0;
        if clean {
            if start.is_none() {
                start = Some(i);
                hard = false;
            }
            hard |= ctx.slots[i].hard;
        } else if let Some(s) = start.take() {
            consider(s, i - 1, hard, &mut best);
        }
    }
    if let Some(s) = start.take() {
        consider(s, ctx.slots.len() - 1, hard, &mut best);
    }
    let (from, to, was_hard) = best?;

    let mut tally = Tally::default();
    let mut devs: Vec<f64> = Vec::new();
    let mut note_ids: Vec<u32> = Vec::new();
    for i in from..=to {
        let stat = agg.per_slot[i];
        tally.hits += stat.tally.hits;
        tally.dev_sum += stat.tally.dev_sum;
        tally.beat_ms_sum += stat.tally.beat_ms_sum;
        note_ids.extend_from_slice(&ctx.schedule.onsets[i].note_ids);
        // Per-slot deviations are not kept individually, so the spread of a
        // run is rebuilt from its slot means — which is what "how evenly did
        // this run sit" asks anyway.
        if stat.tally.hits > 0 {
            devs.push(stat.tally.mean_dev());
        }
    }
    let stats = spread(&devs);
    if stats.mad_ms > spread_threshold_ms(tally.beat_ms()) {
        return None;
    }

    let first_bar = ctx.slots[from].bar;
    let last_bar = ctx.slots[to].bar;
    let bars = ctx.bars_of(first_bar, last_bar)?;
    let fix = if attempt.tempo_percent < 100 {
        Fix::Ramp {
            start: Some(bars.0),
            end: Some(bars.1),
            from_percent: attempt.tempo_percent,
            to_percent: (attempt.tempo_percent + FASTER_STEP_PERCENT).min(100),
        }
    } else {
        Fix::ComeBack {
            days: CLEAN_COME_BACK_DAYS,
        }
    };

    Some(Finding {
        kind: FindingKind::Clean,
        bars: Some(bars),
        note_ids,
        severity: {
            let tidiness = 1.0 - (stats.mad_ms / spread_threshold_ms(tally.beat_ms()).max(1.0));
            let length = ((to - from + 1) as f32 / 8.0).min(1.0);
            ((tidiness as f32).clamp(0.0, 1.0) * 0.5 + length * 0.5)
                * if was_hard { 1.0 } else { 0.75 }
        },
        evidence: Evidence {
            spread_ms: stats.mad_ms,
            printed_bars: ctx.printed_of(first_bar, last_bar),
            reference_bpm: Some(ctx.score_bpm_at(first_bar)),
            passes_affected: agg.passes,
            ..evidence_of(&tally, agg.passes)
        },
        fix: Some(fix),
    })
}

// ---------------------------------------------------------------------------
// Stage A, second half — free play (E3)
// ---------------------------------------------------------------------------

/// One scored beat tick of free play: what the metronome expected, and what
/// the matcher made of it. Both types come from `timing.rs` unchanged — the
/// caller pairs them, because `BeatFeedback` alone cannot say which
/// subdivision of which beat it is.
#[derive(Debug, Clone)]
pub struct FreePlayBeat {
    pub tick: BeatTick,
    pub feedback: BeatFeedback,
}

impl FreePlayBeat {
    fn is_hit(&self) -> bool {
        matches!(
            self.feedback.classification.as_str(),
            "perfect" | "good" | "ok"
        )
    }

    fn is_scored(&self) -> bool {
        self.is_hit() || self.feedback.classification == "miss"
    }

    /// `BeatTick::expected_interval_ms` is the quarter-note interval on
    /// every tick of the beat, subdivisions included — so it is the beat
    /// length, unmodified.
    fn beat_ms(&self) -> f64 {
        self.tick.expected_interval_ms.max(1.0)
    }
}

/// The free-play half of `LEARNING_PATHS_DECISIONS.md` E3: what can be said
/// about a segment with no score behind it.
///
/// Same [`Finding`] shape, `bars` absent, `note_ids` empty. Four
/// diagnostics: where in the bar the time slips, which subdivision position
/// goes missing, the tempo band where consistency collapses, and drift
/// across the segment.
///
/// `beats` must be in the order they were played; nothing else is assumed.
pub fn analyze_free_play(beats: &[FreePlayBeat]) -> Vec<Finding> {
    let mut out = Vec::new();
    out.extend(free_beat_position(beats));
    out.extend(free_subdivision(beats));
    out.extend(free_tempo_ceiling(beats));
    out.extend(free_drift(beats));
    rank(&mut out);
    out
}

/// Per-beat-position bias: one beat of the bar out of line with the others.
/// Quarter-note positions only — a subdivision tick is not a beat.
fn free_beat_position(beats: &[FreePlayBeat]) -> Option<Finding> {
    let mut buckets: Vec<Tally> = vec![Tally::default(); 17];
    let mut global = Tally::default();
    for b in beats {
        if b.tick.subdivision_index != 0 || !b.is_hit() {
            continue;
        }
        let per_bar = usize::from(b.tick.beats_per_bar.max(1)).min(16);
        let position = (b.tick.beat_index as usize) % per_bar;
        buckets[position].hit(b.feedback.deviation_ms, b.beat_ms());
        global.hit(b.feedback.deviation_ms, b.beat_ms());
    }
    if global.hits < MIN_ONSETS {
        return None;
    }
    let threshold = bias_threshold_ms(global.beat_ms());
    let mut worst: Option<(usize, f64)> = None;
    for (position, tally) in buckets.iter().enumerate() {
        if tally.hits < MIN_ONSETS {
            continue;
        }
        let delta = tally.mean_dev() - global.mean_dev();
        if delta.abs() >= threshold && worst.is_none_or(|(_, d): (usize, f64)| delta.abs() > d.abs())
        {
            worst = Some((position, delta));
        }
    }
    let (position, delta) = worst?;
    let tally = buckets[position];
    let active = dominant_subdivision(beats);

    Some(Finding {
        kind: FindingKind::BeatPositionBias,
        bars: None,
        note_ids: Vec::new(),
        severity: (delta.abs() / (3.0 * threshold.max(1.0))).clamp(0.0, 1.0) as f32,
        evidence: Evidence {
            beat_position: Some((position + 1) as u8),
            reference_bpm: Some(60_000.0 / tally.beat_ms().max(1.0)),
            passes_affected: 1,
            ..evidence_of(&tally, 1)
        },
        fix: denser_subdivision(active).map(|subdivision| Fix::ClickSubdivision {
            start: None,
            end: None,
            subdivision,
        }),
    })
}

/// Per-subdivision hit rate: the position inside the beat that goes missing.
fn free_subdivision(beats: &[FreePlayBeat]) -> Option<Finding> {
    let mut buckets: Vec<Tally> = vec![Tally::default(); 7];
    let mut total = 0u8;
    for b in beats {
        if !b.is_scored() || b.tick.subdivision_total <= 1 {
            continue;
        }
        total = total.max(b.tick.subdivision_total);
        let position = usize::from(b.tick.subdivision_index.min(6));
        if b.is_hit() {
            buckets[position].hit(b.feedback.deviation_ms, b.beat_ms());
        } else {
            buckets[position].misses += 1;
        }
    }
    let eligible: Vec<usize> = (0..7).filter(|&i| buckets[i].scored() >= MIN_ONSETS).collect();
    if eligible.len() < 2 {
        return None;
    }
    let best = eligible
        .iter()
        .map(|&i| buckets[i].hit_rate())
        .fold(0.0f32, f32::max);
    let worst_at = *eligible
        .iter()
        .min_by(|&&a, &&b| {
            buckets[a]
                .hit_rate()
                .partial_cmp(&buckets[b].hit_rate())
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(a.cmp(&b))
        })?;
    let gap = best - buckets[worst_at].hit_rate();
    if gap < SUBDIVISION_HIT_GAP {
        return None;
    }
    let tally = buckets[worst_at];
    let reference = 60_000.0 / tally.beat_ms().max(1.0);

    Some(Finding {
        kind: FindingKind::SubdivisionWeak,
        bars: None,
        note_ids: Vec::new(),
        severity: (gap / 0.6).clamp(0.0, 1.0),
        evidence: Evidence {
            subdivision: Some(total),
            subdivision_position: Some((worst_at as u8, total)),
            hit_rate_delta: Some(-gap),
            reference_bpm: Some(reference),
            passes_affected: 1,
            ..evidence_of(&tally, 1)
        },
        // Slow it down and climb back: a position you drop is a position you
        // never played slowly enough.
        fix: Some(Fix::Ramp {
            start: None,
            end: None,
            from_percent: SUBDIVISION_RAMP_FROM,
            to_percent: 100,
        }),
    })
}

/// The tempo band where consistency collapses, from a segment that changed
/// tempo — a ramp, or a drill that climbed.
fn free_tempo_ceiling(beats: &[FreePlayBeat]) -> Option<Finding> {
    let mut bands: Vec<(u16, Vec<f64>, Tally)> = Vec::new();
    for b in beats {
        if !b.is_scored() {
            continue;
        }
        let bpm = (60_000.0 / b.tick.expected_interval_ms.max(1.0)).round();
        let band = ((bpm as u16) / CEILING_BAND_BPM) * CEILING_BAND_BPM;
        let slot = match bands.iter().position(|(b2, _, _)| *b2 == band) {
            Some(i) => i,
            None => {
                bands.push((band, Vec::new(), Tally::default()));
                bands.len() - 1
            }
        };
        if b.is_hit() {
            bands[slot].1.push(b.feedback.deviation_ms);
            bands[slot].2.hit(b.feedback.deviation_ms, b.beat_ms());
        } else {
            bands[slot].2.misses += 1;
        }
    }
    bands.retain(|(_, _, t)| t.scored() >= CEILING_MIN_SAMPLES);
    bands.sort_by_key(|(band, _, _)| *band);
    if bands.len() < 2 {
        return None;
    }

    let mad: Vec<f64> = bands.iter().map(|(_, devs, _)| spread(devs).mad_ms).collect();
    let comfortable = (0..bands.len())
        .filter(|&i| mad[i] <= COMFORTABLE_MAD_MS && bands[i].2.hit_rate() >= COMFORTABLE_HIT_RATE)
        .next_back()?;
    let collapse = (comfortable + 1..bands.len())
        .find(|&i| mad[i] > COMFORTABLE_MAD_MS || bands[i].2.hit_rate() < CEILING_HIT_RATE)?;

    let held = bands[comfortable].0;
    let broke = bands[collapse].0;
    let to_percent = ((f64::from(broke) / f64::from(held.max(1))) * 100.0).round() as u16;

    Some(Finding {
        kind: FindingKind::TempoCeiling,
        bars: None,
        note_ids: Vec::new(),
        severity: ((mad[collapse] / COMFORTABLE_MAD_MS) - 1.0).clamp(0.0, 1.0) as f32,
        evidence: Evidence {
            spread_ms: mad[collapse],
            bpm_band: Some((held, broke)),
            reference_bpm: Some(f64::from(held)),
            passes_affected: 1,
            ..evidence_of(&bands[collapse].2, 1)
        },
        fix: Some(Fix::Ramp {
            start: None,
            end: None,
            from_percent: 100,
            to_percent,
        }),
    })
}

/// Drift within a segment: the last third sitting somewhere the first third
/// did not. A bias that grows is not the same as a bias.
fn free_drift(beats: &[FreePlayBeat]) -> Option<Finding> {
    let hits: Vec<&FreePlayBeat> = beats.iter().filter(|b| b.is_hit()).collect();
    if hits.len() < (MIN_ONSETS as usize) * 3 {
        return None;
    }
    let third = hits.len() / 3;
    let mut first = Tally::default();
    let mut last = Tally::default();
    let mut all = Tally::default();
    for (i, b) in hits.iter().enumerate() {
        all.hit(b.feedback.deviation_ms, b.beat_ms());
        if i < third {
            first.hit(b.feedback.deviation_ms, b.beat_ms());
        } else if i >= hits.len() - third {
            last.hit(b.feedback.deviation_ms, b.beat_ms());
        }
    }
    let drift = last.mean_dev() - first.mean_dev();
    // Twice the "worth mentioning" threshold: a drift is a bias that moved,
    // so it has to move further than a bias has to lean.
    let threshold = 2.0 * bias_threshold_ms(all.beat_ms());
    if drift.abs() < threshold {
        return None;
    }
    let active = dominant_subdivision(beats);

    Some(Finding {
        kind: FindingKind::Drift,
        bars: None,
        note_ids: Vec::new(),
        severity: (drift.abs() / (3.0 * threshold.max(1.0))).clamp(0.0, 1.0) as f32,
        evidence: Evidence {
            mean_deviation_ms: drift,
            deviation_beats: if all.beat_ms() > 0.0 {
                drift / all.beat_ms()
            } else {
                0.0
            },
            reference_bpm: Some(60_000.0 / all.beat_ms().max(1.0)),
            passes_affected: 1,
            ..evidence_of(&all, 1)
        },
        fix: denser_subdivision(active).map(|subdivision| Fix::ClickSubdivision {
            start: None,
            end: None,
            subdivision,
        }),
    })
}

/// The subdivision the segment mostly ran at.
fn dominant_subdivision(beats: &[FreePlayBeat]) -> u8 {
    let mut counts = [0u32; 8];
    for b in beats {
        counts[usize::from(b.tick.subdivision_total.min(7))] += 1;
    }
    (1..8)
        .max_by_key(|&i| counts[i])
        .map(|i| i as u8)
        .unwrap_or(1)
}

// ---------------------------------------------------------------------------
// Arithmetic the rules share
// ---------------------------------------------------------------------------

/// How far off is far enough to mention, at this tempo. The scorer's own
/// `perfect` threshold: inside it, the app calls a note perfect, so a mean
/// that never leaves it is not a tendency.
fn bias_threshold_ms(beat_ms: f64) -> f64 {
    let beat = if beat_ms > 0.0 { beat_ms } else { 500.0 };
    window_thresholds(tempo_aware_window_ms(beat)).perfect
}

/// And how wide is too wide. The ceiling rule's fifteen milliseconds
/// (`srs.rs`), never tighter than the scorer would call perfect.
fn spread_threshold_ms(beat_ms: f64) -> f64 {
    bias_threshold_ms(beat_ms).max(COMFORTABLE_MAD_MS)
}

/// The tempo to loop something at after it went wrong at this one.
fn slower(tempo_percent: u16) -> u16 {
    tempo_percent
        .saturating_sub(SLOWER_STEP_PERCENT)
        .max(MIN_LOOP_PERCENT)
}

/// More clicks than this note value, or `None` when there is no useful
/// denser click to ask for.
fn denser_subdivision(subdivision: u8) -> Option<u8> {
    match subdivision {
        1 => Some(2),
        2 => Some(4),
        3 => Some(6),
        4 => Some(6),
        _ => None,
    }
}

fn percent_of(bpm: f64, percent: u16) -> u16 {
    (bpm * f64::from(percent) / 100.0).round().clamp(1.0, 999.0) as u16
}

/// The evidence every finding carries, from one tally.
fn evidence_of(tally: &Tally, passes: u32) -> Evidence {
    let beat_ms = tally.beat_ms();
    let mean = tally.mean_dev();
    Evidence {
        onsets: tally.scored(),
        hits: tally.hits,
        hit_rate: tally.hit_rate(),
        mean_deviation_ms: mean,
        deviation_beats: if beat_ms > 0.0 { mean / beat_ms } else { 0.0 },
        spread_ms: 0.0,
        passes,
        passes_affected: 0,
        ..Evidence::default()
    }
}

// The spread histogram. 2048 bins of a quarter of a millisecond spans
// ±256 ms, which is wider than any deviation the matcher will ever hand
// back, and a quarter of a millisecond is two orders of magnitude finer
// than the smallest threshold anything compares a spread against.
const SPREAD_BINS: usize = 2048;
const SPREAD_BIN_MS: f64 = 0.25;
const SPREAD_RANGE_MS: f64 = 256.0;

/// Where a set of deviations sits, and how far it is spread.
///
/// `median_ms` is only read by the tests — a MAD is an absolute deviation
/// around the median, so a median that drifts is a MAD that lies, and the
/// one number is worth asserting on its own.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
struct Spread {
    mean_ms: f64,
    #[allow(dead_code)]
    median_ms: f64,
    /// Median absolute deviation, to the quarter-millisecond.
    mad_ms: f64,
}

/// Median and MAD by histogram rather than by sorting.
///
/// The gate on this module is ten thousand onsets in five milliseconds, and
/// a comparison sort of ten thousand floats cannot promise that in a debug
/// build. A histogram is two linear passes and a fixed scan, with no
/// allocation and no ordering assumption about the input.
fn spread(deviations: &[f64]) -> Spread {
    if deviations.is_empty() {
        return Spread::default();
    }
    let n = deviations.len();
    let mut signed = [0u32; SPREAD_BINS];
    let mut sum = 0.0f64;
    for &d in deviations {
        sum += d;
        signed[signed_bin(d)] += 1;
    }
    let median = median_of(&signed, n, signed_edge);

    let mut absolute = [0u32; SPREAD_BINS / 2];
    for &d in deviations {
        absolute[absolute_bin(d - median)] += 1;
    }
    let mad = median_of(&absolute, n, absolute_edge);

    Spread {
        mean_ms: sum / n as f64,
        median_ms: median,
        mad_ms: mad,
    }
}

fn signed_bin(ms: f64) -> usize {
    (((ms + SPREAD_RANGE_MS) / SPREAD_BIN_MS).floor()).clamp(0.0, (SPREAD_BINS - 1) as f64) as usize
}

fn signed_edge(bin: usize) -> f64 {
    bin as f64 * SPREAD_BIN_MS - SPREAD_RANGE_MS
}

fn absolute_bin(ms: f64) -> usize {
    (ms.abs() / SPREAD_BIN_MS)
        .floor()
        .clamp(0.0, (SPREAD_BINS / 2 - 1) as f64) as usize
}

fn absolute_edge(bin: usize) -> f64 {
    bin as f64 * SPREAD_BIN_MS
}

/// The median of a histogram: the textbook one, averaging the two middle
/// values when there is an even number of them.
///
/// The lower median alone would be wrong in exactly the case that matters —
/// a player who alternates forty milliseconds early and forty late has a
/// lower median of −40 and, from there, an absolute deviation of nothing.
/// Which is how a rule meant to catch unsteadiness would call it steady.
fn median_of(histogram: &[u32], n: usize, edge: impl Fn(usize) -> f64) -> f64 {
    if n == 0 {
        return 0.0;
    }
    if n % 2 == 1 {
        edge(nth_bin(histogram, n.div_ceil(2)))
    } else {
        (edge(nth_bin(histogram, n / 2)) + edge(nth_bin(histogram, n / 2 + 1))) / 2.0
    }
}

/// The bin holding the `k`-th smallest value, 1-based.
fn nth_bin(histogram: &[u32], k: usize) -> usize {
    let mut seen = 0usize;
    for (bin, &count) in histogram.iter().enumerate() {
        seen += count as usize;
        if seen >= k {
            return bin;
        }
    }
    histogram.len().saturating_sub(1)
}

/// The contiguous run of bars with the largest total weight — Kadane, with
/// ties going to the earliest and then the shortest run, so the answer is
/// the same every time.
fn best_run(weights: &[f64]) -> Option<(usize, usize)> {
    let mut best: Option<(usize, usize, f64)> = None;
    let mut run_start = 0usize;
    let mut running = 0.0f64;
    for (i, &w) in weights.iter().enumerate() {
        if running <= 0.0 {
            run_start = i;
            running = w;
        } else {
            running += w;
        }
        if running > 0.0 && best.is_none_or(|(_, _, b)| running > b) {
            best = Some((run_start, i, running));
        }
    }
    best.map(|(from, to, _)| (from, to))
}

/// An id → position lookup for ids that are dense by construction and might
/// not be. The contract numbers notes and onsets by their own index, so the
/// dense path is the only one that runs in practice; the sparse one exists
/// so a hand-written schedule cannot make this allocate by the megabyte.
enum IdMap {
    Dense(usize),
    Sparse(Vec<(u32, u32)>),
}

fn build_id_map(len: usize, id_at: impl Fn(usize) -> u32) -> IdMap {
    if (0..len).all(|i| id_at(i) == i as u32) {
        return IdMap::Dense(len);
    }
    let mut pairs: Vec<(u32, u32)> = (0..len).map(|i| (id_at(i), i as u32)).collect();
    pairs.sort_unstable();
    IdMap::Sparse(pairs)
}

impl IdMap {
    fn get(&self, id: u32) -> Option<usize> {
        match self {
            IdMap::Dense(len) => {
                let i = id as usize;
                (i < *len).then_some(i)
            }
            IdMap::Sparse(pairs) => pairs
                .binary_search_by_key(&id, |&(key, _)| key)
                .ok()
                .map(|i| pairs[i].1 as usize),
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::score::{
        ExpectedOnset, ExtraOnset, OnsetResult, OnsetState, ScoreBar, ScoreSchedule, SongNote,
        SongSource, SourceFormat, TempoChange, TICKS_PER_QUARTER,
    };

    // -----------------------------------------------------------------
    // The helper: a score, a perfect performance, and one mistake
    // -----------------------------------------------------------------

    /// A score of `bars` 4/4 bars at 120 BPM, `per_bar` evenly spaced notes
    /// in each, one note per onset. `hand(i)` places note `i` on the neck,
    /// which is how the position-shift tests inject a shift.
    fn score_of(bars: u32, per_bar: u32, hand: impl Fn(u32) -> (u8, u8)) -> SongScore {
        let bar_ticks = TICKS_PER_QUARTER * 4;
        let step = bar_ticks / per_bar;
        let mut notes = Vec::new();
        let mut bar_list = Vec::new();
        for b in 0..bars {
            bar_list.push(ScoreBar {
                index: b,
                start_tick: b * bar_ticks,
                length_ticks: bar_ticks,
                printed_bar: b + 1,
                section: None,
            });
            for n in 0..per_bar {
                let ordinal = b * per_bar + n;
                let (string, fret) = hand(ordinal);
                notes.push(SongNote {
                    id: ordinal,
                    tick: b * bar_ticks + n * step,
                    dur_ticks: step,
                    string,
                    fret,
                    midi: 40 + fret,
                    tie_from_previous: false,
                    ghost: false,
                    dead: false,
                    accent: false,
                    techniques: Vec::new(),
                });
            }
        }
        SongScore {
            schema: 1,
            id: "test".into(),
            title: "Test".into(),
            artist: "Nobody".into(),
            source: SongSource {
                file_name: "test.gp".into(),
                format: SourceFormat::Gp,
                track_index: 0,
                track_name: "Guitar".into(),
            },
            tuning: vec![64, 59, 55, 50, 45, 40],
            capo: 0,
            ticks_per_quarter: TICKS_PER_QUARTER,
            tempo_map: vec![TempoChange { tick: 0, bpm: 120.0 }],
            meter_map: Vec::new(),
            bars: bar_list,
            notes,
            sections: Vec::new(),
        }
    }

    /// One note, one onset.
    fn schedule_of(score: &SongScore) -> ScoreSchedule {
        let onsets: Vec<ExpectedOnset> = score
            .notes
            .iter()
            .enumerate()
            .map(|(i, n)| ExpectedOnset {
                id: i as u32,
                beat: f64::from(n.tick) / f64::from(TICKS_PER_QUARTER),
                note_ids: vec![n.id],
                soft: false,
                accent: false,
            })
            .collect();
        let length = onsets.last().map_or(0.0, |o| o.beat + 1.0);
        ScoreSchedule {
            onsets,
            length_beats: length,
            loops: true,
        }
    }

    /// Dead on, every pass.
    fn perfect(schedule: &ScoreSchedule, passes: u32) -> Vec<OnsetResult> {
        let mut out = Vec::new();
        for pass in 0..passes {
            for onset in &schedule.onsets {
                out.push(OnsetResult {
                    id: onset.id,
                    state: OnsetState::Hit,
                    deviation_ms: Some(0.0),
                    pass,
                    accent_heard: None,
                });
            }
        }
        out
    }

    /// Turn some onsets into misses, on every pass.
    fn miss(results: &mut [OnsetResult], ids: &[u32]) {
        for r in results.iter_mut() {
            if ids.contains(&r.id) {
                r.state = OnsetState::Miss;
                r.deviation_ms = None;
            }
        }
    }

    /// Nudge some onsets off the beat.
    fn nudge(results: &mut [OnsetResult], ms: f64, keep: impl Fn(u32) -> bool) {
        for r in results.iter_mut() {
            if r.state == OnsetState::Hit && keep(r.id) {
                r.deviation_ms = Some(r.deviation_ms.unwrap_or(0.0) + ms);
            }
        }
    }

    fn attempt<'a>(
        results: &'a [OnsetResult],
        extras: &'a [ExtraOnset],
        tempo_percent: u16,
    ) -> Attempt<'a> {
        Attempt {
            results,
            extras,
            tempo_percent,
        }
    }

    fn one_finger(_i: u32) -> (u8, u8) {
        (1, 5)
    }

    /// Every fourth note jumps nine frets and two strings, and back.
    fn shifting_hand(i: u32) -> (u8, u8) {
        if i % 4 == 0 {
            (1, 3)
        } else {
            (3, 12)
        }
    }

    // The mistakes the table injects, one per row.
    fn play_it_right(_: &mut [OnsetResult]) {}
    fn drop_two_notes(results: &mut [OnsetResult]) {
        miss(results, &[12, 13]);
    }
    fn rush_the_sixteenths(results: &mut [OnsetResult]) {
        nudge(results, -40.0, |id| id % 2 == 1);
    }
    fn drag_everything(results: &mut [OnsetResult]) {
        nudge(results, 45.0, |_| true);
    }
    fn land_late_out_of_every_shift(results: &mut [OnsetResult]) {
        nudge(results, 45.0, |id| id % 4 <= 1);
    }
    fn wobble(results: &mut [OnsetResult]) {
        for r in results.iter_mut() {
            if r.state == OnsetState::Hit {
                r.deviation_ms = Some(if r.id % 2 == 0 { 35.0 } else { -35.0 });
            }
        }
    }

    /// One row: a score, a perfect performance, one mistake injected, and
    /// the whole of what the coach should say about it.
    struct Case {
        what: &'static str,
        per_bar: u32,
        hand: fn(u32) -> (u8, u8),
        mistake: fn(&mut [OnsetResult]),
        kind: FindingKind,
        bars: (u32, u32),
        fix: Fix,
    }

    #[test]
    fn one_mistake_at_a_time_gets_one_headline_with_its_bars_and_its_fix() {
        let cases = [
            Case {
                what: "nothing wrong at all",
                per_bar: 4,
                hand: one_finger,
                mistake: play_it_right,
                kind: FindingKind::Clean,
                bars: (0, 7),
                fix: Fix::ComeBack {
                    days: CLEAN_COME_BACK_DAYS,
                },
            },
            Case {
                what: "the same two notes dropped every pass",
                per_bar: 4,
                hand: one_finger,
                mistake: drop_two_notes,
                kind: FindingKind::ConsistentMiss,
                bars: (3, 3),
                fix: Fix::LoopBars {
                    start: 3,
                    end: 3,
                    tempo_percent: 80,
                },
            },
            Case {
                what: "the sixteenths rush and the quarters do not",
                per_bar: 16,
                hand: one_finger,
                mistake: rush_the_sixteenths,
                kind: FindingKind::Rushing,
                bars: (0, 7),
                fix: Fix::ClickSubdivision {
                    start: Some(0),
                    end: Some(7),
                    subdivision: 4,
                },
            },
            Case {
                what: "the whole passage drags",
                per_bar: 2,
                hand: one_finger,
                mistake: drag_everything,
                kind: FindingKind::Dragging,
                bars: (0, 7),
                fix: Fix::LoopBars {
                    start: 0,
                    end: 7,
                    tempo_percent: 80,
                },
            },
            Case {
                what: "late out of every position shift",
                per_bar: 4,
                hand: shifting_hand,
                mistake: land_late_out_of_every_shift,
                kind: FindingKind::AfterShift,
                bars: (0, 7),
                fix: Fix::LoopBars {
                    start: 0,
                    end: 7,
                    tempo_percent: 80,
                },
            },
            Case {
                what: "unsteady, leaning nowhere",
                per_bar: 4,
                hand: one_finger,
                mistake: wobble,
                kind: FindingKind::Uneven,
                bars: (0, 7),
                fix: Fix::ClickSubdivision {
                    start: Some(0),
                    end: Some(7),
                    subdivision: 2,
                },
            },
        ];

        for case in &cases {
            let score = score_of(8, case.per_bar, case.hand);
            let schedule = schedule_of(&score);
            let mut results = perfect(&schedule, 2);
            (case.mistake)(&mut results);
            let found = analyze_attempt(&score, &schedule, &attempt(&results, &[], 100), &[]);

            let head = headline(&found).unwrap_or_else(|| panic!("{}: nothing said", case.what));
            assert_eq!(head.kind, case.kind, "{}: wrong headline", case.what);
            assert_eq!(head.bars, Some(case.bars), "{}: wrong bars", case.what);
            assert_eq!(head.fix, Some(case.fix), "{}: wrong fix", case.what);
            assert_eq!(
                found.iter().filter(|f| f.is_correction()).count(),
                usize::from(case.kind != FindingKind::Clean),
                "{}: one mistake should make exactly one correction, got {:?}",
                case.what,
                found.iter().map(|f| f.kind).collect::<Vec<_>>()
            );
        }
    }

    // -----------------------------------------------------------------
    // Nothing wrong
    // -----------------------------------------------------------------

    #[test]
    fn a_perfect_attempt_yields_praise_and_no_correction() {
        let score = score_of(8, 4, one_finger);
        let schedule = schedule_of(&score);
        let results = perfect(&schedule, 3);
        let found = analyze_attempt(&score, &schedule, &attempt(&results, &[], 100), &[]);

        assert!(
            found.iter().all(|f| !f.is_correction()),
            "a perfect attempt produced a correction: {:?}",
            found.iter().map(|f| f.kind).collect::<Vec<_>>()
        );
        let head = headline(&found).expect("perfect play should still get a sentence");
        assert_eq!(head.kind, FindingKind::Clean);
        assert!(head.bars.is_some(), "praise must name bars");
        assert_eq!(head.evidence.passes, 3);
        assert!(head.evidence.hit_rate > 0.99);
    }

    // -----------------------------------------------------------------
    // One mistake per kind
    // -----------------------------------------------------------------

    #[test]
    fn consistent_miss_is_the_headline_with_its_bars_and_a_slower_loop() {
        let score = score_of(8, 4, one_finger);
        let schedule = schedule_of(&score);
        let mut results = perfect(&schedule, 3);
        // Notes 12 and 13 are bar 3 (0-based), beats 1 and 2.
        miss(&mut results, &[12, 13]);
        let found = analyze_attempt(&score, &schedule, &attempt(&results, &[], 90), &[]);

        let head = headline(&found).expect("a dropped passage is a finding");
        assert_eq!(head.kind, FindingKind::ConsistentMiss);
        assert_eq!(head.bars, Some((3, 3)));
        assert_eq!(head.note_ids, vec![12, 13]);
        assert_eq!(head.evidence.printed_bars, Some((4, 4)));
        assert_eq!(head.evidence.passes_affected, 3);
        assert_eq!(head.evidence.hit_rate, 0.0);
        assert_eq!(
            head.fix,
            Some(Fix::LoopBars {
                start: 3,
                end: 3,
                tempo_percent: 70
            })
        );
    }

    #[test]
    fn rushing_names_the_note_value_when_another_note_value_is_clean() {
        // Sixteen notes a bar: quarters, eighths and sixteenths all present.
        let score = score_of(8, 16, one_finger);
        let schedule = schedule_of(&score);
        let mut results = perfect(&schedule, 2);
        // Odd notes are the sixteenths. They rush; nothing else moves.
        nudge(&mut results, -40.0, |id| id % 2 == 1);
        let found = analyze_attempt(&score, &schedule, &attempt(&results, &[], 100), &[]);

        let head = headline(&found).expect("a rushed note value is a finding");
        assert_eq!(head.kind, FindingKind::Rushing);
        assert_eq!(head.evidence.subdivision, Some(4), "the sixteenths, not the quarters");
        assert!(
            head.evidence.mean_deviation_ms < -30.0,
            "mean was {}",
            head.evidence.mean_deviation_ms
        );
        assert!(
            head.evidence.deviation_beats < -0.05,
            "as a fraction of a beat: {}",
            head.evidence.deviation_beats
        );
        assert!(
            matches!(head.fix, Some(Fix::ClickSubdivision { subdivision: 4, .. })),
            "fix was {:?}",
            head.fix
        );
    }

    #[test]
    fn dragging_the_whole_passage_loops_it_slower() {
        // One note value only — nothing to contrast, so it is the passage.
        let score = score_of(8, 2, one_finger);
        let schedule = schedule_of(&score);
        let mut results = perfect(&schedule, 2);
        nudge(&mut results, 45.0, |_| true);
        let found = analyze_attempt(&score, &schedule, &attempt(&results, &[], 100), &[]);

        let head = headline(&found).expect("a dragged passage is a finding");
        assert_eq!(head.kind, FindingKind::Dragging);
        assert_eq!(head.evidence.subdivision, None);
        assert!(head.evidence.mean_deviation_ms > 40.0);
        assert!(
            matches!(head.fix, Some(Fix::LoopBars { tempo_percent: 80, .. })),
            "fix was {:?}",
            head.fix
        );
    }

    #[test]
    fn after_shift_finds_the_jump_and_not_the_rest() {
        // Every fourth note jumps seven frets and two strings.
        let score = score_of(8, 4, |i| if i % 4 == 0 { (1, 3) } else { (3, 12) });
        let schedule = schedule_of(&score);
        let mut results = perfect(&schedule, 2);
        // The note after each jump lands late; nothing else moves.
        nudge(&mut results, 45.0, |id| id % 4 == 1 || id % 4 == 0);
        let found = analyze_attempt(&score, &schedule, &attempt(&results, &[], 100), &[]);

        let head = headline(&found).expect("late after a shift is a finding");
        assert_eq!(head.kind, FindingKind::AfterShift);
        assert!(head.bars.is_some());
        assert!(
            head.evidence.mean_deviation_ms > 30.0,
            "mean was {}",
            head.evidence.mean_deviation_ms
        );
        assert!(matches!(head.fix, Some(Fix::LoopBars { .. })));
    }

    #[test]
    fn falls_apart_points_at_the_back_half_and_loops_the_whole_thing() {
        let score = score_of(8, 4, one_finger);
        let schedule = schedule_of(&score);
        let mut results = perfect(&schedule, 1);
        // The second half of the passage starts dropping notes.
        miss(&mut results, &[17, 19, 21, 23, 25, 27, 29, 31]);
        let found = analyze_attempt(&score, &schedule, &attempt(&results, &[], 100), &[]);

        let falls = found
            .iter()
            .find(|f| f.kind == FindingKind::FallsApart)
            .expect("a decaying back half is a finding");
        assert_eq!(falls.bars, Some((4, 7)), "the evidence is in the back half");
        assert_eq!(
            falls.fix,
            Some(Fix::LoopBars {
                start: 0,
                end: 7,
                tempo_percent: 100
            }),
            "stamina needs the run-up"
        );
        assert!(falls.evidence.hit_rate_delta.unwrap() < 0.0);
    }

    #[test]
    fn extras_cluster_where_they_were_played() {
        let score = score_of(8, 4, one_finger);
        let schedule = schedule_of(&score);
        let results = perfect(&schedule, 1);
        // Bar 5 is beats 20..24.
        let extras = vec![
            ExtraOnset { beat: 20.5, pass: 0 },
            ExtraOnset { beat: 21.5, pass: 0 },
            ExtraOnset { beat: 22.5, pass: 0 },
            ExtraOnset { beat: 23.5, pass: 0 },
        ];
        let found = analyze_attempt(&score, &schedule, &attempt(&results, &extras, 100), &[]);

        let head = headline(&found).expect("four notes nobody wrote is a finding");
        assert_eq!(head.kind, FindingKind::Extras);
        assert_eq!(head.bars, Some((5, 5)));
        assert_eq!(head.evidence.extras, Some(4), "the number the sentence is about");
        assert!(matches!(head.fix, Some(Fix::LoopBars { start: 5, end: 5, .. })));
    }

    #[test]
    fn uneven_is_spread_with_nowhere_to_point() {
        let score = score_of(8, 4, one_finger);
        let schedule = schedule_of(&score);
        let mut results = perfect(&schedule, 2);
        // ±35 ms, alternating: a mean of zero and a wide spread.
        for r in results.iter_mut() {
            r.deviation_ms = Some(if r.id % 2 == 0 { 35.0 } else { -35.0 });
        }
        let found = analyze_attempt(&score, &schedule, &attempt(&results, &[], 100), &[]);

        let head = headline(&found).expect("unsteady is a finding");
        assert_eq!(head.kind, FindingKind::Uneven);
        assert!(
            head.evidence.mean_deviation_ms.abs() < 1.0,
            "there should be no bias, mean was {}",
            head.evidence.mean_deviation_ms
        );
        assert!(head.evidence.spread_ms > 30.0, "spread was {}", head.evidence.spread_ms);
        assert!(matches!(head.fix, Some(Fix::ClickSubdivision { .. })));
    }

    #[test]
    fn the_ceiling_needs_a_tempo_it_holds_and_one_it_does_not() {
        let score = score_of(8, 4, one_finger);
        let schedule = schedule_of(&score);

        let mut slow = perfect(&schedule, 1);
        nudge(&mut slow, 2.0, |id| id % 2 == 0);
        let mut fast = perfect(&schedule, 1);
        for r in fast.iter_mut() {
            r.deviation_ms = Some(if r.id % 2 == 0 { 40.0 } else { -40.0 });
        }
        let earlier = vec![attempt(&slow, &[], 80)];
        let found = analyze_attempt(&score, &schedule, &attempt(&fast, &[], 110), &earlier);

        let ceiling = found
            .iter()
            .find(|f| f.kind == FindingKind::TempoCeiling)
            .expect("a tempo that collapses is a finding");
        assert_eq!(
            ceiling.fix,
            Some(Fix::Ramp {
                start: Some(0),
                end: Some(7),
                from_percent: 80,
                to_percent: 110
            })
        );
        // 120 BPM score: 80 % is 96, 110 % is 132.
        assert_eq!(ceiling.evidence.bpm_band, Some((96, 132)));
        assert_eq!(ceiling.evidence.reference_bpm, Some(120.0));
    }

    #[test]
    fn improved_is_specific_about_what_moved() {
        let score = score_of(8, 4, one_finger);
        let schedule = schedule_of(&score);
        let mut before = perfect(&schedule, 1);
        miss(&mut before, &[12, 13, 14, 15]);
        let now = perfect(&schedule, 1);
        let earlier = vec![attempt(&before, &[], 100)];
        let found = analyze_attempt(&score, &schedule, &attempt(&now, &[], 100), &earlier);

        assert!(
            found.iter().all(|f| !f.is_correction()),
            "a clean attempt should carry no correction: {:?}",
            found.iter().map(|f| f.kind).collect::<Vec<_>>()
        );
        let improved = found
            .iter()
            .find(|f| f.kind == FindingKind::Improved)
            .expect("getting better is worth saying");
        assert_eq!(improved.bars, Some((3, 3)), "it should name where it moved");
        assert!(improved.evidence.hit_rate_delta.unwrap() > 0.1);
        assert_eq!(
            improved.fix,
            Some(Fix::ComeBack {
                days: IMPROVED_COME_BACK_DAYS
            })
        );
    }

    #[test]
    fn clean_prefers_a_hard_run_and_offers_the_next_tempo_up() {
        let score = score_of(8, 4, |i| if i % 4 == 0 { (1, 3) } else { (3, 12) });
        let schedule = schedule_of(&score);
        let results = perfect(&schedule, 4);
        let found = analyze_attempt(&score, &schedule, &attempt(&results, &[], 80), &[]);

        let clean = found
            .iter()
            .find(|f| f.kind == FindingKind::Clean)
            .expect("a hard passage played right is praise");
        assert_eq!(clean.evidence.passes, 4);
        assert_eq!(
            clean.fix,
            Some(Fix::Ramp {
                start: Some(0),
                end: Some(7),
                from_percent: 80,
                to_percent: 90
            })
        );
    }

    // -----------------------------------------------------------------
    // The rules about the rules
    // -----------------------------------------------------------------

    #[test]
    fn soft_onsets_never_count_against_the_player() {
        let score = score_of(8, 4, one_finger);
        let mut schedule = schedule_of(&score);
        for onset in schedule.onsets.iter_mut() {
            if (12..16).contains(&onset.id) {
                onset.soft = true;
            }
        }
        let mut results = perfect(&schedule, 3);
        // The hammer-ons in bar 3 were not heard — in both the state the
        // contract specifies and the one a careless scorer might send.
        for r in results.iter_mut() {
            if (12..14).contains(&r.id) {
                r.state = OnsetState::SoftAbsent;
                r.deviation_ms = None;
            } else if (14..16).contains(&r.id) {
                r.state = OnsetState::Miss;
                r.deviation_ms = None;
            }
        }
        let found = analyze_attempt(&score, &schedule, &attempt(&results, &[], 100), &[]);
        assert!(
            found.iter().all(|f| !f.is_correction()),
            "a quiet hammer-on became a correction: {:?}",
            found.iter().map(|f| f.kind).collect::<Vec<_>>()
        );
    }

    #[test]
    fn exactly_one_correction_is_the_headline() {
        let score = score_of(8, 4, one_finger);
        let schedule = schedule_of(&score);
        let mut results = perfect(&schedule, 3);
        miss(&mut results, &[12, 13]);
        nudge(&mut results, 45.0, |_| true);
        let found = analyze_attempt(&score, &schedule, &attempt(&results, &[], 100), &[]);

        let corrections = found.iter().filter(|f| f.is_correction()).count();
        assert!(corrections >= 2, "the fixture should produce several");
        let head = headline(&found).unwrap();
        assert_eq!(head.kind, FindingKind::ConsistentMiss, "A4's order");
        // Everything else is there to be opened, in tier order.
        let tiers: Vec<u8> = found.iter().map(|f| f.kind.tier()).collect();
        assert!(
            tiers.windows(2).all(|w| w[0] <= w[1]),
            "findings came out of order: {tiers:?}"
        );
    }

    #[test]
    fn equal_weight_findings_rank_stably() {
        let mut findings = vec![
            Finding {
                kind: FindingKind::Uneven,
                bars: Some((9, 12)),
                note_ids: vec![40],
                severity: 0.5,
                evidence: Evidence::default(),
                fix: None,
            },
            Finding {
                kind: FindingKind::Uneven,
                bars: Some((1, 4)),
                note_ids: vec![4],
                severity: 0.5,
                evidence: Evidence::default(),
                fix: None,
            },
        ];
        rank(&mut findings);
        assert_eq!(findings[0].bars, Some((1, 4)), "earlier bars win a tie");
        let once = findings.clone();
        rank(&mut findings);
        assert_eq!(findings, once, "ranking is idempotent");

        // And the same two in the other input order come out the same way.
        let mut reversed = vec![once[1].clone(), once[0].clone()];
        rank(&mut reversed);
        assert_eq!(reversed, once);
    }

    #[test]
    fn the_same_attempt_always_gives_the_same_answer() {
        let score = score_of(12, 4, |i| (1 + (i % 3) as u8, (i % 9) as u8));
        let schedule = schedule_of(&score);
        let mut results = perfect(&schedule, 3);
        miss(&mut results, &[5, 6, 20, 21]);
        nudge(&mut results, 18.0, |id| id % 3 == 0);
        let extras = vec![
            ExtraOnset { beat: 10.5, pass: 0 },
            ExtraOnset { beat: 10.75, pass: 1 },
        ];
        let a = analyze_attempt(&score, &schedule, &attempt(&results, &extras, 95), &[]);
        let b = analyze_attempt(&score, &schedule, &attempt(&results, &extras, 95), &[]);
        assert_eq!(a, b);
    }

    #[test]
    fn an_empty_attempt_says_nothing() {
        let score = score_of(4, 4, one_finger);
        let schedule = schedule_of(&score);
        assert!(analyze_attempt(&score, &schedule, &attempt(&[], &[], 100), &[]).is_empty());
    }

    /// The gate is five milliseconds for ten thousand onsets, and five
    /// milliseconds is a budget for the code the app ships — optimised.
    /// `npm run test:rust` builds unoptimised, where every bounds check,
    /// every overflow check and every un-inlined accessor is still in the
    /// binary and the same work measures about three times longer.
    ///
    /// So both profiles are gated, at the budget that means something in
    /// each. The debug budget is not a formality: the first version of this
    /// module searched for each onset's bar and tempo instead of walking a
    /// cursor, and measured 80.58 ms here — which this catches and the
    /// release gate, on its own, would not, because nobody runs the release
    /// lib tests.
    #[cfg(debug_assertions)]
    const ONSET_BUDGET_MS: f64 = 40.0;
    #[cfg(not(debug_assertions))]
    const ONSET_BUDGET_MS: f64 = 5.0;

    #[test]
    fn ten_thousand_onsets_in_under_five_milliseconds() {
        use std::time::Instant;

        // 10 000 expected onsets, one pass, half of them off the beat, so
        // every rule has work to do rather than bailing early.
        let score = score_of(2_500, 4, |i| (1 + (i % 6) as u8, (i % 13) as u8));
        let schedule = schedule_of(&score);
        assert_eq!(schedule.onsets.len(), 10_000);
        let mut results = perfect(&schedule, 1);
        for r in results.iter_mut() {
            r.deviation_ms = Some((f64::from(r.id % 61) - 30.0) * 1.5);
        }
        miss(&mut results, &(0..10_000).filter(|i| i % 97 == 0).collect::<Vec<u32>>());
        let extras: Vec<ExtraOnset> = (0..200)
            .map(|i| ExtraOnset {
                beat: f64::from(i) * 7.5,
                pass: 0,
            })
            .collect();
        let one = attempt(&results, &extras, 100);

        // Warm, then best of five: the gate is what the code can do, and
        // another worker's compile on the same machine is not evidence
        // about this function.
        let _ = analyze_attempt(&score, &schedule, &one, &[]);
        let mut best = f64::MAX;
        for _ in 0..5 {
            let started = Instant::now();
            let found = analyze_attempt(&score, &schedule, &one, &[]);
            let elapsed = started.elapsed().as_secs_f64() * 1_000.0;
            assert!(!found.is_empty());
            best = best.min(elapsed);
        }
        println!(
            "[findings] 10 000 onsets: {best:.2} ms (budget {ONSET_BUDGET_MS:.0} ms, \
             {} build)",
            if cfg!(debug_assertions) {
                "unoptimised"
            } else {
                "optimised"
            }
        );
        assert!(
            best < ONSET_BUDGET_MS,
            "10 000 onsets took {best:.2} ms, the budget for this build is \
             {ONSET_BUDGET_MS:.0} ms"
        );
    }

    // -----------------------------------------------------------------
    // Free play
    // -----------------------------------------------------------------

    fn free_beat(
        index: u32,
        subdivision_index: u8,
        subdivision_total: u8,
        bpm: f64,
        deviation_ms: f64,
        classification: &str,
    ) -> FreePlayBeat {
        FreePlayBeat {
            tick: BeatTick {
                ts_ns: u64::from(index) * 1_000_000,
                beat_index: index,
                is_downbeat: index % 4 == 0 && subdivision_index == 0,
                expected_interval_ms: 60_000.0 / bpm,
                subdivision_index,
                subdivision_total,
                beats_per_bar: 4,
            },
            feedback: BeatFeedback {
                beat_index: index,
                deviation_ms,
                interval_error_ms: 0.0,
                classification: classification.into(),
                amplitude: 0.5,
                calibration_offset_ms: 0.0,
                calibration_confidence: 1.0,
                grid_correlation: 0.9,
            },
        }
    }

    #[test]
    fn free_play_finds_the_beat_of_the_bar_that_slips() {
        // Beat 3 of every bar lands 40 ms late; the rest are dead on.
        let beats: Vec<FreePlayBeat> = (0..64)
            .map(|i| {
                let late = if i % 4 == 2 { 40.0 } else { 0.0 };
                free_beat(i, 0, 1, 120.0, late, "good")
            })
            .collect();
        let found = analyze_free_play(&beats);
        let head = headline(&found).expect("a beat that slips is a finding");
        assert_eq!(head.kind, FindingKind::BeatPositionBias);
        assert_eq!(head.evidence.beat_position, Some(3));
        assert!(head.bars.is_none(), "free play has no bars");
        assert!(head.note_ids.is_empty());
        assert!(head.evidence.mean_deviation_ms > 30.0);
    }

    #[test]
    fn free_play_finds_the_subdivision_that_goes_missing() {
        // Eighths: the off-beat is missed two times in three.
        let beats: Vec<FreePlayBeat> = (0..96)
            .map(|i| {
                let sub = (i % 2) as u8;
                let missed = sub == 1 && i % 6 != 1;
                free_beat(
                    i / 2,
                    sub,
                    2,
                    120.0,
                    0.0,
                    if missed { "miss" } else { "good" },
                )
            })
            .collect();
        let found = analyze_free_play(&beats);
        let weak = found
            .iter()
            .find(|f| f.kind == FindingKind::SubdivisionWeak)
            .expect("a dropped off-beat is a finding");
        assert_eq!(weak.evidence.subdivision_position, Some((1, 2)));
        assert!(weak.evidence.hit_rate_delta.unwrap() < -0.2);
        assert!(matches!(
            weak.fix,
            Some(Fix::Ramp {
                from_percent: 80,
                to_percent: 100,
                ..
            })
        ));
    }

    #[test]
    fn free_play_finds_the_tempo_band_where_it_collapses() {
        let mut beats = Vec::new();
        // Twenty beats at 100 BPM, tight.
        for i in 0..20 {
            beats.push(free_beat(i, 0, 1, 100.0, f64::from(i % 5) - 2.0, "perfect"));
        }
        // Twenty at 140, all over the place.
        for i in 20..40 {
            let dev = if i % 2 == 0 { 45.0 } else { -45.0 };
            beats.push(free_beat(i, 0, 1, 140.0, dev, "ok"));
        }
        let found = analyze_free_play(&beats);
        let ceiling = found
            .iter()
            .find(|f| f.kind == FindingKind::TempoCeiling)
            .expect("a tempo that collapses is a finding");
        assert_eq!(ceiling.evidence.bpm_band, Some((100, 140)));
        assert!(matches!(
            ceiling.fix,
            Some(Fix::Ramp {
                from_percent: 100,
                to_percent: 140,
                ..
            })
        ));
    }

    #[test]
    fn free_play_finds_drift_across_a_segment() {
        // Starts early, ends late: a bias that moved.
        let beats: Vec<FreePlayBeat> = (0..60)
            .map(|i| free_beat(i, 0, 1, 120.0, f64::from(i) - 30.0, "good"))
            .collect();
        let found = analyze_free_play(&beats);
        let drift = found
            .iter()
            .find(|f| f.kind == FindingKind::Drift)
            .expect("drifting across a minute is a finding");
        assert!(
            drift.evidence.mean_deviation_ms > 30.0,
            "drift was {}",
            drift.evidence.mean_deviation_ms
        );
        assert!(drift.bars.is_none());
    }

    #[test]
    fn free_play_says_nothing_about_steady_playing() {
        let beats: Vec<FreePlayBeat> = (0..64)
            .map(|i| free_beat(i, 0, 1, 120.0, if i % 2 == 0 { 2.0 } else { -2.0 }, "perfect"))
            .collect();
        assert!(analyze_free_play(&beats).is_empty());
    }

    #[test]
    fn free_play_ignores_skipped_ticks() {
        let beats: Vec<FreePlayBeat> = (0..64)
            .map(|i| free_beat(i, 0, 1, 120.0, 0.0, "skipped"))
            .collect();
        assert!(analyze_free_play(&beats).is_empty());
    }

    // -----------------------------------------------------------------
    // The arithmetic underneath
    // -----------------------------------------------------------------

    #[test]
    fn spread_matches_a_sort_for_a_known_set() {
        let devs = vec![-10.0, -2.0, 0.0, 1.0, 3.0, 40.0];
        let s = spread(&devs);
        // Sorted: -10, -2, 0, 1, 3, 40 → median (0 + 1) / 2 = 0.5.
        assert!((s.median_ms - 0.5).abs() <= SPREAD_BIN_MS, "median was {}", s.median_ms);
        // |x - 0.5|: 10.5, 2.5, 0.5, 0.5, 2.5, 39.5 → sorted
        // 0.5, 0.5, 2.5, 2.5, 10.5, 39.5 → median 2.5.
        assert!((s.mad_ms - 2.5).abs() <= SPREAD_BIN_MS, "mad was {}", s.mad_ms);
        assert!((s.mean_ms - 5.333_333).abs() < 1e-4);
    }

    #[test]
    fn spread_of_dead_on_play_is_zero() {
        let s = spread(&[0.0; 32]);
        assert_eq!(s.mad_ms, 0.0);
        assert_eq!(s.mean_ms, 0.0);
    }

    #[test]
    fn subdivisions_are_the_coarsest_that_fits() {
        let tpq = TICKS_PER_QUARTER;
        let table: &[(u32, u8)] = &[
            (0, 1),
            (480, 2),
            (240, 4),
            (720, 4),
            (320, 3),
            (640, 3),
            (160, 6),
            (800, 6),
            (192, 0), // a quintuplet: nothing simple explains it
        ];
        for &(offset, expected) in table {
            assert_eq!(
                subdivision_of(offset, tpq),
                expected,
                "offset {offset} should be a {expected}"
            );
        }
    }

    #[test]
    fn a_shift_is_a_fret_jump_or_a_string_skip() {
        assert!(is_shift((3, 1), (9, 1)), "six frets is a shift");
        assert!(!is_shift((3, 1), (5, 1)), "two frets is not");
        assert!(is_shift((5, 1), (5, 3)), "two strings is");
        assert!(!is_shift((5, 1), (5, 2)), "one string is not");
        assert!(
            !is_shift((0, 1), (9, 1)),
            "an open string is not a position, so it cannot be jumped from"
        );
    }

    #[test]
    fn best_run_is_the_earliest_shortest_of_equals() {
        assert_eq!(best_run(&[1.0, -5.0, 1.0]), Some((0, 0)));
        assert_eq!(best_run(&[-1.0, 2.0, 2.0, -1.0]), Some((1, 2)));
        assert_eq!(best_run(&[-1.0, -2.0]), None);
    }

    #[test]
    fn a_loop_never_drops_below_half_tempo() {
        assert_eq!(slower(100), 80);
        assert_eq!(slower(70), 50);
        assert_eq!(slower(55), 50);
        assert_eq!(slower(50), 50);
    }

    // -----------------------------------------------------------------
    // The wire — W4 mirrors all of this in `src/songs/types.ts`
    // -----------------------------------------------------------------

    #[test]
    fn a_finding_goes_over_the_wire_in_camel_case() {
        let finding = Finding {
            kind: FindingKind::ConsistentMiss,
            bars: Some((3, 4)),
            note_ids: vec![12, 13],
            severity: 0.8,
            evidence: Evidence {
                onsets: 6,
                passes: 3,
                passes_affected: 3,
                printed_bars: Some((4, 5)),
                ..Evidence::default()
            },
            fix: Some(Fix::LoopBars {
                start: 3,
                end: 4,
                tempo_percent: 80,
            }),
        };
        let json = serde_json::to_value(&finding).expect("a finding serialises");

        assert_eq!(json["kind"], "consistentMiss");
        assert_eq!(json["noteIds"], serde_json::json!([12, 13]));
        assert_eq!(json["bars"], serde_json::json!([3, 4]));
        assert_eq!(json["evidence"]["hitRate"], 0.0);
        assert_eq!(json["evidence"]["meanDeviationMs"], 0.0);
        assert_eq!(json["evidence"]["passesAffected"], 3);
        assert_eq!(json["evidence"]["printedBars"], serde_json::json!([4, 5]));
        // Absent, not null: a narrator must never quote a number nobody
        // measured, and `undefined` is how TypeScript says so.
        assert!(json["evidence"].get("bpmBand").is_none());
        assert!(json["evidence"].get("subdivision").is_none());
        assert_eq!(json["fix"]["type"], "loopBars");
        assert_eq!(json["fix"]["tempoPercent"], 80);

        let back: Finding = serde_json::from_value(json).expect("and comes back");
        assert_eq!(back, finding);
    }

    #[test]
    fn every_fix_is_a_tagged_object() {
        let table: &[(Fix, &str)] = &[
            (
                Fix::LoopBars {
                    start: 1,
                    end: 2,
                    tempo_percent: 80,
                },
                "loopBars",
            ),
            (
                Fix::Ramp {
                    start: None,
                    end: None,
                    from_percent: 80,
                    to_percent: 100,
                },
                "ramp",
            ),
            (
                Fix::ClickSubdivision {
                    start: Some(1),
                    end: Some(2),
                    subdivision: 4,
                },
                "clickSubdivision",
            ),
            (Fix::ComeBack { days: 2 }, "comeBack"),
        ];
        for &(fix, tag) in table {
            let json = serde_json::to_value(fix).expect("a fix serialises");
            assert_eq!(json["type"], tag, "wrong tag for {fix:?}");
            let back: Fix = serde_json::from_value(json).expect("and comes back");
            assert_eq!(back, fix);
        }
        assert_eq!(
            serde_json::to_value(Fix::Ramp {
                start: None,
                end: None,
                from_percent: 80,
                to_percent: 100
            })
            .unwrap()["fromPercent"],
            80
        );
    }

    #[test]
    fn the_contract_types_round_trip() {
        // The three shapes scoring hands back, in the contract's own words.
        let result = OnsetResult {
            id: 7,
            state: OnsetState::SoftAbsent,
            deviation_ms: None,
            pass: 2,
            accent_heard: None,
        };
        let json = serde_json::to_value(result).unwrap();
        assert_eq!(json["state"], "softAbsent");
        assert_eq!(json["deviationMs"], serde_json::Value::Null);
        assert_eq!(
            serde_json::from_value::<OnsetResult>(json).unwrap(),
            result
        );

        let expected = ExpectedOnset {
            id: 7,
            beat: 3.5,
            note_ids: vec![9, 10],
            soft: true,
            accent: false,
        };
        let json = serde_json::to_value(&expected).unwrap();
        assert_eq!(json["noteIds"], serde_json::json!([9, 10]));
        assert_eq!(
            serde_json::from_value::<ExpectedOnset>(json).unwrap(),
            expected
        );

        let score = score_of(2, 4, one_finger);
        let json = serde_json::to_value(&score).unwrap();
        assert_eq!(json["ticksPerQuarter"], 960);
        assert_eq!(json["source"]["format"], "gp");
        assert_eq!(json["bars"][0]["printedBar"], 1);
        assert_eq!(json["notes"][0]["tieFromPrevious"], false);
        assert_eq!(serde_json::from_value::<SongScore>(json).unwrap(), score);
    }

    #[test]
    fn id_maps_survive_ids_that_are_not_their_own_index() {
        let dense = build_id_map(3, |i| i as u32);
        assert_eq!(dense.get(2), Some(2));
        assert_eq!(dense.get(3), None);

        let sparse = build_id_map(3, |i| 100 - i as u32);
        assert_eq!(sparse.get(100), Some(0));
        assert_eq!(sparse.get(98), Some(2));
        assert_eq!(sparse.get(99), Some(1));
        assert_eq!(sparse.get(7), None);
    }
}
