//! The free-play engine: key, scale, chord and "inside or outside" from the
//! notes somebody is playing (research report 3.5 and 5.6; roadmap M7).
//!
//! It is music theory over a note stream, not an audio model. Notes come in
//! ([`Engine::onset`], [`Engine::sustain`]), time moves ([`Engine::tick`]),
//! and a [`Reading`] comes out. Where the notes come from is not this file's
//! business: `notes.rs` decodes them from the note model's posteriors,
//! `stream.rs` runs that model over a live input, `worker.rs` is the thread.
//!
//! **Tier.** Nothing here is real time. The caller is the free-play worker
//! (below normal priority) or an offline tool; it allocates freely and is
//! never called from the audio callback, the onset thread or the analyzer.
//!
//! **Weak evidence is "couldn't tell".** A key is named only once it has
//! held its lead ([`KeyState::Settled`]); a chord only when the beat held a
//! chord and not a line; a note is inside or outside only against a key or a
//! chord that is known. A jam's chart, when there is one, is taken as the
//! truth for key and chords and nothing is estimated.

pub mod notes;
pub mod stream;
pub mod worker;

use std::collections::VecDeque;

use serde::{Deserialize, Serialize};

/// Temperley's key profiles (Kostka-Payne): better than Krumhansl's on
/// guitar (report 5.6).
const MAJOR_PROFILE: [f32; 12] = [0.748, 0.060, 0.488, 0.082, 0.670, 0.460, 0.096, 0.715, 0.104, 0.366, 0.057, 0.400];
const MINOR_PROFILE: [f32; 12] = [0.712, 0.084, 0.474, 0.618, 0.049, 0.460, 0.105, 0.747, 0.404, 0.067, 0.133, 0.330];

/// What the histogram forgets by, seconds.
pub const KEY_HALF_LIFE_S: f64 = 16.0;
/// A note counts for at most this long towards the key.
const NOTE_WEIGHT_CAP_S: f64 = 1.0;
/// Seconds of notes (summed over voices) before any key is considered.
pub const KEY_MIN_HEARD_S: f64 = 4.0;
/// ... and this many pitch classes among them.
const KEY_MIN_CLASSES: usize = 4;
/// The leading key must have led for this long ...
pub const KEY_HOLD_S: f64 = 6.0;
/// ... and stand this far in correlation above the best key that is not its
/// relative.
pub const KEY_MARGIN: f32 = 0.04;
/// Under this the relative major/minor pair is shown together.
const RELATIVE_MARGIN: f32 = 0.06;

/// Chord path: what leaving the chord of the last beat costs.
const CHORD_STAY: f32 = 0.6;
/// The bonus when the lowest note of the beat is the root.
const CHORD_BASS_BONUS: f32 = 0.25;
/// A seventh over the triad counts this much for the chord (and is not held
/// against it): Am7 is A C E G, not C major with an A; Cmaj7 is not E minor.
const CHORD_SEVENTH_GAIN: f32 = 0.25;
/// A beat is a chord and not a line when this many voices sound on average
/// ...
const CHORD_MIN_POLYPHONY: f32 = 1.2;
/// ... and this many sound at one moment: a strum, not two notes of a line
/// ringing into each other.
const CHORD_MIN_VOICES: u32 = 3;
/// The chord of a beat is decided this many beats after it closed: the
/// beat after it is read first (fixed-lag smoothing on the chord path). See
/// [`Reading::chord`] for what that does to the readout.
pub const CHORD_LAG_BEATS: usize = 1;
/// A chord is counted through this many beats in which nothing sounded.
const CHORD_HOLD_BEATS: u32 = 1;
/// And at least this share of what sounded is the triad's.
const CHORD_MIN_COVER: f32 = 0.5;
/// A beat that goes on with the chord of the beats before it needs only
/// this much of it: a bass note or a fill inside a strummed bar.
const CHORD_CONTINUE_COVER: f32 = 0.34;
/// A seventh is named when it is this share of the beat.
const SEVENTH_SHARE: f32 = 0.10;
/// The default beat when nobody set a tempo: 120 BPM.
const DEFAULT_BEAT_S: f64 = 0.5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
    Major,
    Minor,
    /// A chart's "A blues". Never estimated: 24 major/minor keys do not
    /// describe it, so only a chart can say it.
    Blues,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Key {
    /// Pitch class, 0 = C.
    pub tonic: u8,
    pub mode: Mode,
}

impl Key {
    /// The pitch classes a note is "inside" for.
    pub fn scale_mask(self) -> u16 {
        let degrees: &[u8] = match self.mode {
            Mode::Major => &[0, 2, 4, 5, 7, 9, 11],
            Mode::Minor => &[0, 2, 3, 5, 7, 8, 10],
            // the blues scale with the major third, second and sixth beside
            // it: what players use over dominant chords
            Mode::Blues => &[0, 2, 3, 4, 5, 6, 7, 9, 10],
        };
        mask_of(self.tonic, degrees)
    }

    /// The relative key: A minor for C major.
    pub fn relative(self) -> Key {
        match self.mode {
            Mode::Major => Key { tonic: (self.tonic + 9) % 12, mode: Mode::Minor },
            Mode::Minor => Key { tonic: (self.tonic + 3) % 12, mode: Mode::Major },
            Mode::Blues => self,
        }
    }
}

fn mask_of(root: u8, degrees: &[u8]) -> u16 {
    degrees.iter().fold(0, |m, d| m | 1 << ((root + d) % 12))
}

/// The scale types a reading names (report 3.5). Serialised as the ids of
/// `src/jam/scales.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Scale {
    Major,
    Lydian,
    Mixolydian,
    MajorPentatonic,
    NaturalMinor,
    Dorian,
    Phrygian,
    MinorPentatonic,
    Blues,
}

const MAJOR_SCALES: [(Scale, &[u8]); 4] = [
    (Scale::Major, &[0, 2, 4, 5, 7, 9, 11]),
    (Scale::Lydian, &[0, 2, 4, 6, 7, 9, 11]),
    (Scale::Mixolydian, &[0, 2, 4, 5, 7, 9, 10]),
    (Scale::MajorPentatonic, &[0, 2, 4, 7, 9]),
];
const MINOR_SCALES: [(Scale, &[u8]); 5] = [
    (Scale::NaturalMinor, &[0, 2, 3, 5, 7, 8, 10]),
    (Scale::Dorian, &[0, 2, 3, 5, 7, 9, 10]),
    (Scale::Phrygian, &[0, 1, 3, 5, 7, 8, 10]),
    (Scale::MinorPentatonic, &[0, 3, 5, 7, 10]),
    (Scale::Blues, &[0, 3, 5, 6, 7, 10]),
];

/// The scale on `key`'s tonic that holds the most of what was played; each
/// degree costs a little, so a seven-note scale only beats the pentatonic
/// inside it when its two extra notes are really played.
fn scale_for(key: Key, hist: &[f32; 12]) -> Scale {
    let total: f32 = hist.iter().sum::<f32>() + 1e-9;
    let family: &[(Scale, &[u8])] = match key.mode {
        Mode::Major => &MAJOR_SCALES,
        Mode::Minor => &MINOR_SCALES,
        Mode::Blues => return Scale::Blues,
    };
    let mut best = (f32::MIN, family[0].0);
    for (scale, degrees) in family {
        let inside: f32 = degrees.iter().map(|d| hist[((key.tonic + d) % 12) as usize]).sum::<f32>() / total;
        let score = inside - 0.02 * degrees.len() as f32;
        if score > best.0 {
            best = (score, *scale);
        }
    }
    best.1
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum KeyState {
    /// Not enough has been played to say anything.
    Listening,
    /// There is a leading key, and it has not earned being shown.
    Unsure,
    /// Estimated, and it held.
    Settled,
    /// The chart's.
    Chart,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyReading {
    pub key: Key,
    pub scale: Scale,
    /// 0..1: how far the key stands above the next (1.0 for a chart's).
    pub confidence: f32,
    /// The notes fit the relative key as well: show the pair.
    pub relative_too: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Quality {
    Maj,
    Min,
    Dom7,
    Maj7,
    Min7,
}

impl Quality {
    fn tones(self) -> &'static [u8] {
        match self {
            Quality::Maj => &[0, 4, 7],
            Quality::Min => &[0, 3, 7],
            Quality::Dom7 => &[0, 4, 7, 10],
            Quality::Maj7 => &[0, 4, 7, 11],
            Quality::Min7 => &[0, 3, 7, 10],
        }
    }
    pub fn is_minor(self) -> bool {
        matches!(self, Quality::Min | Quality::Min7)
    }
}

/// A chord of the chart: the page knows the 31 qualities and their names, so
/// it sends the tones and the name and this file needs neither table.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartChord {
    pub root: u8,
    /// Pitch classes of the chord, root included.
    pub tones: Vec<u8>,
    pub label: String,
}

/// What a jam's chart says, in concert pitch.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chart {
    pub key: Option<Key>,
    /// One entry per bar of the form: the bar's chords in order, sharing the
    /// bar evenly. Empty when the jam has no progression.
    #[serde(default)]
    pub bars: Vec<Vec<ChartChord>>,
    pub beats_per_bar: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChordReading {
    pub root: u8,
    /// `None` for a chart's chord, whose `label` says it.
    pub quality: Option<Quality>,
    pub label: Option<String>,
    pub from_chart: bool,
    #[serde(skip)]
    pub mask: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NoteClass {
    ChordTone,
    ScaleTone,
    /// Outside the key, a semitone from the chord tone played next.
    Approach,
    Outside,
    /// Neither a key nor a chord to hold it against.
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteVerdict {
    pub t: f64,
    pub midi: i32,
    pub class: NoteClass,
    pub in_key: Option<bool>,
    pub in_chord: Option<bool>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tally {
    pub chord_tone: u32,
    pub scale_tone: u32,
    pub approach: u32,
    pub outside: u32,
    pub unknown: u32,
}

impl Tally {
    fn count(&mut self, c: NoteClass) {
        match c {
            NoteClass::ChordTone => self.chord_tone += 1,
            NoteClass::ScaleTone => self.scale_tone += 1,
            NoteClass::Approach => self.approach += 1,
            NoteClass::Outside => self.outside += 1,
            NoteClass::Unknown => self.unknown += 1,
        }
    }
    /// Notes that could be told.
    pub fn told(&self) -> u32 {
        self.chord_tone + self.scale_tone + self.approach + self.outside
    }
}

/// What the page shows, and what the coach's line is written from.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reading {
    pub key_state: KeyState,
    /// `None` while listening; present and not to be shown as fact while
    /// `Unsure`.
    pub key: Option<KeyReading>,
    /// The newest chord decided; `None` is "couldn't tell". Without a chart
    /// a beat's chord is decided when the beat after it has closed
    /// ([`CHORD_LAG_BEATS`]), so this is the chord of the last beat but one:
    /// between one and two beats behind the notes the engine has been
    /// handed (0.5 to 1 s at 120 BPM), on top of the capture layer's own
    /// second. With a chart it is the chord of the last whole beat.
    pub chord: Option<ChordReading>,
    pub notes: Tally,
    /// Seconds since the engine started at which the key first settled.
    pub settled_at_s: Option<f64>,
    /// Seconds of input read.
    pub heard_s: f64,
}

/// One closed beat, for the bench and the tests.
#[derive(Debug, Clone, PartialEq)]
pub struct BeatOut {
    pub t0: f64,
    pub t1: f64,
    pub chord: Option<ChordReading>,
    /// The leading key, whatever its state.
    pub leading: Option<Key>,
    pub key_state: KeyState,
}

#[derive(Debug, Clone, Copy)]
struct Seg {
    midi: i32,
    note_start: f64,
    t0: f64,
    t1: f64,
}

#[derive(Debug, Clone, Copy)]
struct Mark {
    t: f64,
    bar: u32,
    beat_s: f64,
}

/// A closed beat whose chord is not decided yet.
#[derive(Debug, Clone, Copy)]
struct Frame {
    t0: f64,
    t1: f64,
    chroma: [f32; 12],
    total: f32,
    silent: bool,
    /// The most voices that sounded at once.
    voices: u32,
    /// `back[k]`: the chord of the beat before on the best path that has
    /// chord `k` in this beat.
    back: [u8; 24],
    leading: Option<Key>,
    key_state: KeyState,
}

#[derive(Debug, Clone, Copy)]
struct Pending {
    t: f64,
    midi: i32,
}

pub struct Engine {
    chart: Chart,
    marks: VecDeque<Mark>,
    default_beat_s: f64,
    beat_start: f64,
    now: f64,
    segs: Vec<Seg>,
    pending: VecDeque<Pending>,
    // key
    hist: [f32; 12],
    heard_s: f64,
    leader: Option<Key>,
    leader_since: f64,
    settled: Option<Key>,
    settled_at: Option<f64>,
    key_state: KeyState,
    key_reading: Option<KeyReading>,
    // chord
    path: [f32; 24],
    chords: VecDeque<(f64, f64, Option<ChordReading>)>,
    silent_beats: u32,
    frames: VecDeque<Frame>,
    quiet_run: u32,
    tally: Tally,
    beats_out: VecDeque<BeatOut>,
    verdicts: VecDeque<NoteVerdict>,
}

const KEEP: usize = 512;

impl Engine {
    pub fn new(chart: Option<Chart>) -> Self {
        let chart = chart.unwrap_or_default();
        let mut e = Self {
            chart,
            marks: VecDeque::new(),
            default_beat_s: DEFAULT_BEAT_S,
            beat_start: 0.0,
            now: 0.0,
            segs: Vec::new(),
            pending: VecDeque::new(),
            hist: [0.0; 12],
            heard_s: 0.0,
            leader: None,
            leader_since: 0.0,
            settled: None,
            settled_at: None,
            key_state: KeyState::Listening,
            key_reading: None,
            path: [0.0; 24],
            chords: VecDeque::new(),
            silent_beats: 0,
            frames: VecDeque::with_capacity(8),
            quiet_run: 0,
            tally: Tally::default(),
            beats_out: VecDeque::new(),
            verdicts: VecDeque::new(),
        };
        e.update_key();
        e
    }

    /// The beat when no bar has been marked, seconds.
    pub fn set_beat_seconds(&mut self, beat_s: f64) {
        if beat_s.is_finite() && beat_s > 0.05 {
            self.default_beat_s = beat_s;
        }
    }

    /// Bar `bar` of the form (0-based) starts at `t`, at `beat_s` a beat.
    pub fn mark_bar(&mut self, t: f64, bar: u32, beat_s: f64) {
        if !(t.is_finite() && beat_s.is_finite()) || beat_s <= 0.05 {
            return;
        }
        if self.marks.back().is_some_and(|m| t <= m.t) {
            return;
        }
        self.marks.push_back(Mark { t, bar, beat_s });
        while self.marks.len() > 64 {
            self.marks.pop_front();
        }
    }

    /// A note started at `t` (seconds).
    pub fn onset(&mut self, t: f64, midi: i32) {
        self.pending.push_back(Pending { t, midi });
    }

    /// The note that started at `note_start` sounded from `t0` to `t1`.
    pub fn sustain(&mut self, midi: i32, note_start: f64, t0: f64, t1: f64) {
        if t1 > t0 {
            self.segs.push(Seg { midi, note_start, t0, t1 });
        }
    }

    /// Everything up to `t` has been handed over: close the beats that ended.
    pub fn tick(&mut self, t: f64) {
        if !(t > self.now) {
            return;
        }
        self.now = t;
        loop {
            let end = self.boundary_after(self.beat_start);
            if end > t {
                break;
            }
            self.close_beat(self.beat_start, end);
            self.beat_start = end;
        }
    }

    pub fn reading(&self) -> Reading {
        Reading {
            key_state: self.key_state,
            key: self.key_reading,
            chord: self.chords.back().and_then(|c| c.2.clone()),
            notes: self.tally,
            settled_at_s: self.settled_at,
            heard_s: self.now,
        }
    }

    pub fn take_beats(&mut self) -> Vec<BeatOut> {
        self.beats_out.drain(..).collect()
    }

    pub fn take_verdicts(&mut self) -> Vec<NoteVerdict> {
        self.verdicts.drain(..).collect()
    }

    fn mark_at(&self, t: f64) -> Option<(usize, Mark)> {
        // a note a few ms before the bar line belongs to the bar
        let i = self.marks.iter().rposition(|m| m.t <= t + 0.03)?;
        Some((i, self.marks[i]))
    }

    fn boundary_after(&self, t0: f64) -> f64 {
        match self.mark_at(t0) {
            Some((i, m)) => {
                let k = ((t0 - m.t) / m.beat_s + 1e-6).floor().max(0.0) + 1.0;
                let mut end = m.t + k * m.beat_s;
                if let Some(next) = self.marks.get(i + 1) {
                    if next.t < end + 0.5 * m.beat_s {
                        end = next.t;
                    }
                }
                end.max(t0 + 0.05)
            }
            None => match self.marks.front() {
                Some(first) if first.t < t0 + 1.5 * self.default_beat_s => first.t.max(t0 + 0.05),
                _ => t0 + self.default_beat_s,
            },
        }
    }

    fn chart_chord_at(&self, t: f64) -> Option<ChordReading> {
        if self.chart.bars.is_empty() {
            return None;
        }
        let (_, m) = self.mark_at(t)?;
        let bar = &self.chart.bars[m.bar as usize % self.chart.bars.len()];
        if bar.is_empty() {
            return None;
        }
        let bar_s = m.beat_s * self.chart.beats_per_bar.max(1) as f64;
        // past the end of the marked bar with no new mark: the band stopped
        if t - m.t > bar_s * 1.5 {
            return None;
        }
        let i = (((t - m.t).max(0.0) / bar_s * bar.len() as f64) as usize).min(bar.len() - 1);
        let c = &bar[i];
        Some(ChordReading {
            root: c.root % 12,
            quality: None,
            label: Some(c.label.clone()),
            from_chart: true,
            mask: c.tones.iter().fold(0, |m, pc| m | 1 << (pc % 12)),
        })
    }

    fn close_beat(&mut self, b0: f64, b1: f64) {
        let len = b1 - b0;
        let mut chroma = [0.0f32; 12];
        let mut bass: Option<i32> = None;
        let mut weight = [0.0f32; 12];
        let mut voices = 0u32;
        for s in &self.segs {
            let ov = s.t1.min(b1) - s.t0.max(b0);
            if ov <= 0.0 {
                continue;
            }
            // how many sound a moment after this one starts (a strum's
            // strings start within a few tens of ms of each other)
            let at = s.t0.max(b0) + 0.04;
            if at < b1 {
                voices = voices.max(self.segs.iter().filter(|o| o.t0 <= at && o.t1 > at).count() as u32);
            }
            let pc = s.midi.rem_euclid(12) as usize;
            chroma[pc] += ov as f32;
            if ov > 0.05 && bass.is_none_or(|b| s.midi < b) {
                bass = Some(s.midi);
            }
            let counted = (s.t1.min(b1).min(s.note_start + NOTE_WEIGHT_CAP_S) - s.t0.max(b0)).max(0.0);
            weight[pc] += counted as f32;
        }
        self.segs.retain_mut(|s| {
            if s.t1 <= b1 {
                return false;
            }
            s.t0 = s.t0.max(b1);
            true
        });

        // key
        let decay = 0.5f64.powf(len / KEY_HALF_LIFE_S) as f32;
        for pc in 0..12 {
            self.hist[pc] = self.hist[pc] * decay + weight[pc];
            self.heard_s += weight[pc] as f64;
        }
        self.update_key_at(b1);

        // chord
        if self.chart.bars.is_empty() {
            let frame = self.advance_path(b0, b1, &chroma, bass, voices);
            self.frames.push_back(frame);
            while self.frames.len() > CHORD_LAG_BEATS {
                self.decide_front();
            }
        } else {
            let chord = self.chart_chord_at(0.5 * (b0 + b1));
            self.emit_beat(b0, b1, chord, self.leader, self.key_state);
        }
    }

    /// Decide the beats still held back ([`CHORD_LAG_BEATS`]) with what is
    /// known now: the input ended. Nothing else needs it; a live reading
    /// simply stays one beat behind.
    pub fn finish(&mut self) {
        while !self.frames.is_empty() {
            self.decide_front();
        }
    }

    fn emit_beat(&mut self, b0: f64, b1: f64, chord: Option<ChordReading>, leading: Option<Key>, key_state: KeyState) {
        self.chords.push_back((b0, b1, chord.clone()));
        while self.chords.len() > 16 {
            self.chords.pop_front();
        }
        self.beats_out.push_back(BeatOut { t0: b0, t1: b1, chord, leading, key_state });
        while self.beats_out.len() > KEEP {
            self.beats_out.pop_front();
        }
        self.classify(b1, b1 - b0);
    }

    fn update_key(&mut self) {
        self.update_key_at(0.0);
    }

    fn update_key_at(&mut self, now: f64) {
        if let Some(key) = self.chart.key {
            self.key_state = KeyState::Chart;
            self.settled = Some(key);
            self.leader = Some(key);
            self.key_reading = Some(KeyReading { key, scale: scale_for(key, &self.hist), confidence: 1.0, relative_too: false });
            return;
        }
        let classes = self.hist.iter().filter(|w| **w > 0.02 * self.hist.iter().sum::<f32>()).count();
        if self.heard_s < KEY_MIN_HEARD_S || classes < KEY_MIN_CLASSES {
            self.key_state = if self.settled.is_some() { KeyState::Settled } else { KeyState::Listening };
            return;
        }
        let scores = key_scores(&self.hist);
        let top = (0..24).max_by(|a, b| scores[*a].total_cmp(&scores[*b])).unwrap_or(0);
        let key = key_of(top);
        let rel = index_of(key.relative());
        let next = (0..24).filter(|i| *i != top && *i != rel).map(|i| scores[i]).fold(f32::MIN, f32::max);
        let margin = scores[top] - next;
        let relative_margin = scores[top] - scores[rel];
        if self.leader != Some(key) {
            // The relative taking the lead is the same notes: the clock that
            // says "these notes have held" is not restarted for it.
            if self.leader.map(Key::relative) != Some(key) {
                self.leader_since = now;
            }
            self.leader = Some(key);
        }
        let held = now - self.leader_since >= KEY_HOLD_S;
        if held && margin >= KEY_MARGIN {
            if self.settled.is_none() {
                self.settled_at = Some(now);
            }
            self.settled = Some(key);
        }
        match self.settled {
            Some(shown) => {
                self.key_state = KeyState::Settled;
                let (conf, rel_too) = if shown == key {
                    (margin, relative_margin < RELATIVE_MARGIN)
                } else {
                    (0.0, shown.relative() == key)
                };
                self.key_reading = Some(KeyReading {
                    key: shown,
                    scale: scale_for(shown, &self.hist),
                    confidence: (conf / 0.2).clamp(0.0, 1.0),
                    relative_too: rel_too,
                });
            }
            None => {
                self.key_state = KeyState::Unsure;
                self.key_reading = Some(KeyReading {
                    key,
                    scale: scale_for(key, &self.hist),
                    confidence: (margin / 0.2).clamp(0.0, 1.0),
                    relative_too: relative_margin < RELATIVE_MARGIN,
                });
            }
        }
    }

    /// One step of the chord path over the beat that just closed.
    fn advance_path(&mut self, b0: f64, b1: f64, chroma: &[f32; 12], bass: Option<i32>, voices: u32) -> Frame {
        let len = (b1 - b0) as f32;
        let total: f32 = chroma.iter().sum();
        let mut frame = Frame { t0: b0, t1: b1, chroma: *chroma, total, silent: false, voices, back: std::array::from_fn(|k| k as u8), leading: self.leader, key_state: self.key_state };
        if total < 0.15 * len {
            // Nothing sounded: the path is kept for two beats (a rest in a
            // strummed bar), then forgotten.
            frame.silent = true;
            self.silent_beats += 1;
            if self.silent_beats > 2 {
                self.path = [0.0; 24];
            }
            return frame;
        }
        self.silent_beats = 0;
        let bass_pc = bass.map(|b| b.rem_euclid(12) as usize);
        let top_prev = (0..24).max_by(|a, b| self.path[*a].total_cmp(&self.path[*b])).unwrap_or(0);
        let best_prev = self.path[top_prev];
        for k in 0..24 {
            let (root, minor) = (k / 2, k % 2 == 1);
            let third = if minor { 3 } else { 4 };
            let triad = (chroma[root] + chroma[(root + third) % 12] + chroma[(root + 7) % 12]) / total;
            let seventh = if minor { chroma[(root + 10) % 12] } else { chroma[(root + 10) % 12].max(chroma[(root + 11) % 12]) } / total;
            let emit = triad + CHORD_SEVENTH_GAIN * seventh - 0.5 * (1.0 - triad - seventh) + if bass_pc == Some(root) { CHORD_BASS_BONUS } else { 0.0 };
            if self.path[k] < best_prev - CHORD_STAY {
                frame.back[k] = top_prev as u8;
                self.path[k] = best_prev - CHORD_STAY;
            }
            self.path[k] += emit;
        }
        let peak = self.path.iter().copied().fold(f32::MIN, f32::max);
        self.path.iter_mut().for_each(|v| *v -= peak);
        frame
    }

    /// Name the chord of the oldest undecided beat: its place on the path
    /// that is best now, the beats after it included (a Viterbi backtrace
    /// over the window, [`CHORD_LAG_BEATS`] deep).
    fn decide_front(&mut self) {
        let Some(frame) = self.frames.front().copied() else { return };
        let mut state = (0..24).max_by(|a, b| self.path[*a].total_cmp(&self.path[*b])).unwrap_or(0);
        for f in self.frames.iter().skip(1).rev() {
            state = f.back[state] as usize;
        }
        let chord = self.gate(&frame, state);
        self.frames.pop_front();
        self.emit_beat(frame.t0, frame.t1, chord, frame.leading, frame.key_state);
    }

    /// The path's chord for `frame`, or "couldn't tell": it is named when
    /// the beat held a chord, when it goes on with the chord of the beats
    /// around it (a bass note or a fill inside a strummed bar), or for one
    /// quiet beat after a chord.
    fn gate(&mut self, frame: &Frame, state: usize) -> Option<ChordReading> {
        if frame.silent {
            self.quiet_run += 1;
            return if self.quiet_run <= CHORD_HOLD_BEATS { self.chords.back().and_then(|c| c.2.clone()) } else { None };
        }
        let (root, minor) = (state / 2, state % 2 == 1);
        let third = if minor { 3 } else { 4 };
        let cover_of = |f: &Frame| (f.chroma[root] + f.chroma[(root + third) % 12] + f.chroma[(root + 7) % 12]) / f.total.max(1e-9);
        let chordal = |f: &Frame| !f.silent && f.voices >= CHORD_MIN_VOICES && f.total / (f.t1 - f.t0) as f32 >= CHORD_MIN_POLYPHONY && cover_of(f) >= CHORD_MIN_COVER;
        // the chord named in one of the last four beats, or held by a beat
        // after this one
        let before = self.chords.iter().rev().take(4).any(|c| c.2.as_ref().is_some_and(|c| !c.from_chart && c.root as usize == root && c.quality.is_some_and(|q| q.is_minor() == minor)));
        let after = self.frames.iter().skip(1).any(chordal);
        let goes_on = cover_of(frame) >= CHORD_CONTINUE_COVER && (before || after);
        if !chordal(frame) && !goes_on {
            // a line is not a rest: nothing is held through it
            self.quiet_run = self.quiet_run.max(CHORD_HOLD_BEATS);
            return None;
        }
        self.quiet_run = 0;
        let share = |d: usize| frame.chroma[(root + d) % 12] / frame.total;
        let quality = match (minor, share(10) >= SEVENTH_SHARE, share(11) >= SEVENTH_SHARE) {
            (true, true, _) => Quality::Min7,
            (true, false, _) => Quality::Min,
            (false, true, _) => Quality::Dom7,
            (false, false, true) => Quality::Maj7,
            (false, false, false) => Quality::Maj,
        };
        Some(ChordReading { root: root as u8, quality: Some(quality), label: None, from_chart: false, mask: mask_of(root as u8, quality.tones()) })
    }

    fn chord_for(&self, t: f64) -> Option<&ChordReading> {
        self.chords.iter().rev().find(|(b0, b1, _)| t >= *b0 - 0.03 && t < *b1).and_then(|c| c.2.as_ref())
    }

    /// Give a verdict on every note whose beat has closed. The newest note
    /// waits one beat for the note after it (an approach note is told by
    /// where it goes).
    fn classify(&mut self, closed: f64, beat: f64) {
        let key = if matches!(self.key_state, KeyState::Settled | KeyState::Chart) { self.settled } else { None };
        while let Some(n) = self.pending.front().copied() {
            if n.t >= closed {
                break;
            }
            let next = self.pending.get(1).copied();
            if next.is_none() && closed - n.t < beat {
                break;
            }
            self.pending.pop_front();
            let bit = 1u16 << n.midi.rem_euclid(12);
            let in_chord = self.chord_for(n.t).map(|c| c.mask & bit != 0);
            let in_key = key.map(|k| k.scale_mask() & bit != 0);
            let class = match (in_chord, in_key) {
                (Some(true), _) => NoteClass::ChordTone,
                (_, Some(true)) => NoteClass::ScaleTone,
                (_, Some(false)) => {
                    let resolves = next.is_some_and(|x| {
                        x.t - n.t <= 2.0 * beat && (x.midi - n.midi).abs() == 1 && self.chord_for(x.t).is_some_and(|c| c.mask & (1 << x.midi.rem_euclid(12)) != 0)
                    });
                    if resolves {
                        NoteClass::Approach
                    } else {
                        NoteClass::Outside
                    }
                }
                (_, None) => NoteClass::Unknown,
            };
            self.tally.count(class);
            self.verdicts.push_back(NoteVerdict { t: n.t, midi: n.midi, class, in_key, in_chord });
            while self.verdicts.len() > KEEP {
                self.verdicts.pop_front();
            }
        }
    }
}

fn key_of(index: usize) -> Key {
    Key { tonic: (index / 2) as u8, mode: if index % 2 == 0 { Mode::Major } else { Mode::Minor } }
}

fn index_of(key: Key) -> usize {
    key.tonic as usize * 2 + usize::from(key.mode == Mode::Minor)
}

/// Pearson correlation of the histogram with each of the 24 keys' profiles.
fn key_scores(hist: &[f32; 12]) -> [f32; 24] {
    let mean = hist.iter().sum::<f32>() / 12.0;
    let var: f32 = hist.iter().map(|h| (h - mean) * (h - mean)).sum();
    let mut out = [0.0f32; 24];
    if var <= 0.0 {
        return out;
    }
    for (i, slot) in out.iter_mut().enumerate() {
        let key = key_of(i);
        let profile = if key.mode == Mode::Major { &MAJOR_PROFILE } else { &MINOR_PROFILE };
        let pm = profile.iter().sum::<f32>() / 12.0;
        let pv: f32 = profile.iter().map(|p| (p - pm) * (p - pm)).sum();
        let mut cov = 0.0;
        for d in 0..12 {
            cov += (hist[(key.tonic as usize + d) % 12] - mean) * (profile[d] - pm);
        }
        *slot = cov / (var * pv).sqrt();
    }
    out
}

/// The standard weighted key score (MIREX): 1.0 exact, 0.5 a fifth away,
/// 0.3 the relative, 0.2 the parallel.
pub fn key_score(est: Option<Key>, truth: Key) -> f64 {
    let Some(est) = est else { return 0.0 };
    let d = (est.tonic + 12 - truth.tonic) % 12;
    if est == truth {
        1.0
    } else if est.mode == truth.mode && (d == 7 || d == 5) {
        0.5
    } else if est.mode != truth.mode && est.relative() == truth {
        0.3
    } else if est.tonic == truth.tonic {
        0.2
    } else {
        0.0
    }
}

/// Feed a list of whole notes `(start, seconds, midi)`, sorted by start,
/// through `engine` up to `until`: what a perfect capture layer would hand
/// over. For tests and the bench's "notes from the annotation" rows.
pub fn feed_notes(engine: &mut Engine, notes: &[(f64, f64, i32)], until: f64) {
    const STEP: f64 = 0.05;
    let mut next = 0;
    let mut t = 0.0;
    while t < until {
        let t1 = (t + STEP).min(until);
        while next < notes.len() && notes[next].0 < t1 {
            let (s, d, m) = notes[next];
            engine.onset(s, m);
            engine.sustain(m, s, s, s + d);
            next += 1;
        }
        // nothing later can start before `t`: the engine may close up to it
        engine.tick(t);
        t = t1;
    }
    engine.tick(until);
}

#[cfg(test)]
mod tests {
    use super::*;

    const C: i32 = 60;

    /// A guitar's five-string shape: root, fifth, root, third, fifth.
    fn strum(out: &mut Vec<(f64, f64, i32)>, t: f64, dur: f64, root: i32, minor: bool) {
        let third = if minor { 3 } else { 4 };
        for m in [root - 12, root - 5, root, root + third, root + 7] {
            out.push((t, dur, m));
        }
    }

    /// I vi IV V in C, a chord a bar at 120 BPM, strummed on every beat.
    fn progression(bars: usize) -> Vec<(f64, f64, i32)> {
        let chords = [(C, false), (C + 9, true), (C + 5, false), (C + 7, false)];
        let mut out = Vec::new();
        for bar in 0..bars {
            let (root, minor) = chords[bar % 4];
            for beat in 0..4 {
                strum(&mut out, bar as f64 * 2.0 + beat as f64 * 0.5, 0.45, root, minor);
            }
        }
        out
    }

    fn c_major() -> Key {
        Key { tonic: 0, mode: Mode::Major }
    }

    #[test]
    fn a_strummed_progression_settles_on_its_key_and_names_its_chords() {
        let notes = progression(16);
        let mut e = Engine::new(None);
        feed_notes(&mut e, &notes, 32.0);
        let r = e.reading();
        assert_eq!(r.key_state, KeyState::Settled);
        assert_eq!(r.key.unwrap().key, c_major());
        let settled = r.settled_at_s.expect("settled");
        assert!((KEY_HOLD_S..=20.0).contains(&settled), "settled at {settled}");
        let beats = e.take_beats();
        let roots = [0u8, 9, 5, 7];
        let right = beats.iter().filter(|b| b.chord.as_ref().is_some_and(|c| c.root == roots[(b.t0 / 2.0) as usize % 4])).count();
        assert!(right as f64 >= 0.9 * beats.len() as f64, "{right} of {} beats", beats.len());
        let minor = beats.iter().filter(|b| (b.t0 / 2.0) as usize % 4 == 1).all(|b| b.chord.as_ref().is_some_and(|c| c.quality == Some(Quality::Min)));
        assert!(minor, "the vi chord is minor");
    }

    /// Why this file's strum is a guitar shape and not root, root, third,
    /// fifth, root: the key histogram counts every voice, so with the root
    /// in three of five voices I vi IV V weighs C 5, A 4, G 4, F 3, E 2, and
    /// F major (F A C) fits as well as C major (C E G). The lead then goes
    /// to F after each IV bar and back to C after each I bar, every 4 s, and
    /// no key leads for `KEY_HOLD_S`: nothing settles, which is the honest
    /// answer for those notes. Counting a pitch class once a beat settles
    /// this on C, and was measured worse on real recordings (GuitarSet
    /// microphone, strummed: key score at 30 s 0.83 to 0.81, settled 96% to
    /// 92%), so every voice still counts.
    #[test]
    fn a_root_in_three_octaves_leans_to_the_subdominant_and_does_not_settle_wrong() {
        let mut notes = Vec::new();
        for bar in 0..16 {
            let (root, minor) = [(C, false), (C + 9, true), (C + 5, false), (C + 7, false)][bar % 4];
            for beat in 0..4 {
                for m in [root - 12, root, root + if minor { 3 } else { 4 }, root + 7, root + 12] {
                    notes.push((bar as f64 * 2.0 + beat as f64 * 0.5, 0.45, m));
                }
            }
        }
        let mut e = Engine::new(None);
        feed_notes(&mut e, &notes, 32.0);
        let r = e.reading();
        assert_ne!(r.key_state, KeyState::Listening);
        let leads = r.key.unwrap().key;
        assert!(leads == c_major() || leads == Key { tonic: 5, mode: Mode::Major }, "{leads:?}");
        assert!(r.key_state != KeyState::Settled || leads == c_major());
    }

    #[test]
    fn a_beats_chord_is_decided_one_beat_late_and_finish_decides_the_rest() {
        let mut e = Engine::new(None);
        feed_notes(&mut e, &progression(4), 8.0);
        // 16 beats closed, the last one waits for the beat after it
        let beats = e.take_beats();
        assert_eq!(beats.len(), 16 - CHORD_LAG_BEATS);
        // the first beat of each new chord is that chord: the beat after it
        // was read before it was named
        for bar in 1..4 {
            let first = beats.iter().find(|b| (b.t0 - bar as f64 * 2.0).abs() < 1e-6).unwrap();
            assert_eq!(first.chord.as_ref().map(|c| c.root), Some([0u8, 9, 5, 7][bar]), "bar {bar}");
        }
        assert_eq!(e.reading().chord.map(|c| c.root), Some(7));
        e.finish();
        assert_eq!(e.take_beats().len(), CHORD_LAG_BEATS);
    }

    #[test]
    fn a_chord_is_held_through_one_quiet_beat_and_no_further() {
        let mut notes = Vec::new();
        for beat in [0, 1, 2, 3, 5, 6, 7] {
            strum(&mut notes, beat as f64 * 0.5, 0.45, C, false);
        }
        let mut e = Engine::new(None);
        feed_notes(&mut e, &notes, 8.0);
        e.finish();
        let named: Vec<bool> = e.take_beats().iter().map(|b| b.chord.as_ref().is_some_and(|c| c.root == 0)).collect();
        assert_eq!(named[..8], [true; 8], "the rest on beat 4 is still C");
        assert_eq!(named[8..], [true, false, false, false, false, false, false, false], "one quiet beat, then nothing");
    }

    #[test]
    fn two_notes_ringing_into_each_other_are_a_line_and_a_minor_seventh_is_its_roots_chord() {
        // a line in overlapping thirds: two voices on average, never three at once
        let line: Vec<_> = (0..32).map(|i| (i as f64 * 0.25, 0.5, 60 + [0, 4, 7, 4][i % 4])).collect();
        let mut e = Engine::new(None);
        feed_notes(&mut e, &line, 8.0);
        e.finish();
        assert!(e.take_beats().iter().all(|b| b.chord.is_none()));
        // Am7 with the fifth in the bass: A C E G is A minor seventh, not C
        let mut notes = Vec::new();
        for beat in 0..8 {
            for m in [52, 57, 60, 67] {
                notes.push((beat as f64 * 0.5, 0.45, m));
            }
        }
        let mut e = Engine::new(None);
        feed_notes(&mut e, &notes, 4.0);
        e.finish();
        let beats = e.take_beats();
        assert!(beats.iter().all(|b| b.chord.as_ref().is_some_and(|c| c.root == 9 && c.quality == Some(Quality::Min7))), "{:?}", beats.iter().map(|b| b.chord.as_ref().map(|c| c.root)).collect::<Vec<_>>());
    }

    #[test]
    fn nothing_is_named_before_enough_was_played() {
        let mut e = Engine::new(None);
        feed_notes(&mut e, &progression(1), 2.0);
        let r = e.reading();
        assert_ne!(r.key_state, KeyState::Settled);
        assert_eq!(r.settled_at_s, None);
        let silent = Engine::new(None).reading();
        assert_eq!((silent.key_state, silent.key, silent.chord), (KeyState::Listening, None, None));
    }

    #[test]
    fn a_single_line_gets_no_chord_and_notes_without_a_key_are_not_judged() {
        // a chromatic line: no key holds, no beat is a chord
        let notes: Vec<_> = (0..40).map(|i| (i as f64 * 0.25, 0.22, 60 + (i * 7) % 12)).collect();
        let mut e = Engine::new(None);
        feed_notes(&mut e, &notes, 10.0);
        assert!(e.take_beats().iter().all(|b| b.chord.is_none()));
        let r = e.reading();
        assert_ne!(r.key_state, KeyState::Settled);
        assert_eq!(r.notes.told(), 0);
        assert!(r.notes.unknown > 30);
    }

    fn chart() -> Chart {
        let chord = |root: u8, minor: bool, label: &str| ChartChord { root, tones: vec![root, (root + if minor { 3 } else { 4 }) % 12, (root + 7) % 12], label: label.into() };
        Chart {
            key: Some(c_major()),
            bars: vec![vec![chord(0, false, "C")], vec![chord(9, true, "Am")], vec![chord(5, false, "F")], vec![chord(7, false, "G")]],
            beats_per_bar: 4,
        }
    }

    #[test]
    fn with_a_chart_the_key_and_chords_are_the_charts_and_notes_are_judged_from_the_first() {
        let mut e = Engine::new(Some(chart()));
        assert_eq!(e.reading().key_state, KeyState::Chart);
        for bar in 0..4 {
            e.mark_bar(bar as f64 * 2.0, bar, 0.5);
        }
        // bar 0 (C): E is a chord tone, D a scale tone, C# then D... C# then C is an approach, F# held is outside
        let notes = [(0.1, 0.2, 64), (0.5, 0.2, 62), (1.0, 0.2, 61), (1.25, 0.2, 60), (1.6, 0.3, 66), (2.1, 0.3, 69), (4.1, 0.3, 69)];
        feed_notes(&mut e, &notes, 8.0);
        let v: Vec<NoteClass> = e.take_verdicts().iter().map(|v| v.class).collect();
        use NoteClass::*;
        assert_eq!(v, vec![ChordTone, ScaleTone, Approach, ChordTone, Outside, ChordTone, ChordTone]);
        let beats = e.take_beats();
        assert_eq!(beats[0].chord.as_ref().unwrap().label.as_deref(), Some("C"));
        assert_eq!(beats[5].chord.as_ref().unwrap().label.as_deref(), Some("Am"));
        // the band stopped after bar 3: no chord is claimed two bars later
        let mut late = Engine::new(Some(chart()));
        late.mark_bar(0.0, 0, 0.5);
        feed_notes(&mut late, &[], 6.0);
        assert!(late.take_beats().last().unwrap().chord.is_none());
    }

    #[test]
    fn beats_follow_the_marked_bars() {
        let mut e = Engine::new(None);
        e.mark_bar(0.3, 0, 0.4);
        e.mark_bar(1.9, 1, 0.4);
        e.tick(3.0);
        e.finish();
        let starts: Vec<f64> = e.take_beats().iter().map(|b| (b.t0 * 100.0).round() / 100.0).collect();
        assert_eq!(starts, vec![0.0, 0.3, 0.7, 1.1, 1.5, 1.9, 2.3]);
    }

    #[test]
    fn the_key_score_is_the_standard_one() {
        let k = |tonic, mode| Key { tonic, mode };
        assert_eq!(key_score(Some(c_major()), c_major()), 1.0);
        assert_eq!(key_score(Some(k(7, Mode::Major)), c_major()), 0.5);
        assert_eq!(key_score(Some(k(9, Mode::Minor)), c_major()), 0.3);
        assert_eq!(key_score(Some(k(0, Mode::Minor)), c_major()), 0.2);
        assert_eq!(key_score(Some(k(2, Mode::Major)), c_major()), 0.0);
        assert_eq!(key_score(None, c_major()), 0.0);
    }

    #[test]
    fn a_minor_pentatonic_line_over_its_key_names_the_pentatonic() {
        let hist = {
            let mut h = [0.0f32; 12];
            for d in [9, 0, 2, 4, 7] {
                h[d] = 1.0;
            }
            h
        };
        assert_eq!(scale_for(Key { tonic: 9, mode: Mode::Minor }, &hist), Scale::MinorPentatonic);
        assert_eq!(scale_for(c_major(), &hist), Scale::MajorPentatonic);
    }
}
