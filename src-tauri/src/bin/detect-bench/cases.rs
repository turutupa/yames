//! The bench's Takes: real Exercises from the shipped Path packs
//! (`src/paths/packs/*.json`, which is the app's own tab DSL compiled), plus a
//! few written here for what the packs cannot write yet (harmonics, a bend
//! with its release, the speed drills). Each is looped to a Take's length and
//! played by `synth` with human scatter and scripted mistakes, and the truth
//! of how it was played is kept note by note.
//!
//! The JSON shapes (`TakeMeta`, `TruthNote`) are the research prototype's
//! `*.truth.json`, so a folder of recordings prepared by
//! `tools/detect-bench/*.py` (public datasets, the owner's corpus) loads
//! through the same types.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use yames_lib::score::pass::PassBar;
use yames_lib::score::{ExpectedOnset, ScoreSchedule};

use crate::synth::{self, Note, Rng};

/// Silence before beat 0: the count-in.
pub const LEAD_S: f64 = 2.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TruthNote {
    pub note_id: u32,
    pub onset_id: u32,
    pub beat: f64,
    pub t_written: f64,
    /// `None`: written and not played.
    pub t_played: Option<f64>,
    pub dur: f64,
    #[serde(default)]
    pub string: u8,
    pub midi_written: f64,
    pub midi_played: Option<f64>,
    #[serde(default)]
    pub tech: Vec<String>,
    #[serde(default)]
    pub legato: bool,
    #[serde(default = "one")]
    pub chord_size: u32,
    /// Semitones actually bent.
    #[serde(default)]
    pub bend: f64,
    #[serde(default)]
    pub bend_written: f64,
    #[serde(default)]
    pub release: bool,
    /// Vibrato actually played, cents either way.
    #[serde(default)]
    pub vibrato_cents: f64,
    /// "omitted" | "wrong" | "weak" | "dead" | "flat" | "noVibrato"
    #[serde(default)]
    pub fault: Option<String>,
}

fn one() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TakeMeta {
    pub name: String,
    pub category: String,
    pub style: String,
    pub chain: String,
    #[serde(default)]
    pub pack: String,
    #[serde(default)]
    pub exercise: String,
    #[serde(default)]
    pub title: String,
    pub bpm: f64,
    #[serde(default = "four")]
    pub beats_per_bar: f64,
    pub lead_s: f64,
    pub seconds: f64,
    #[serde(default)]
    pub flags: Vec<String>,
    pub truth: Vec<TruthNote>,
    pub schedule: ScoreSchedule,
    #[serde(default)]
    pub pass_bars: Vec<PassBar>,
    /// Where the audio is, for a sidecar that is not beside its recording
    /// (several descriptions of one file). Absolute, or relative to the sidecar.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio: Option<String>,
}

fn four() -> f64 {
    4.0
}

/// A Take to run: its description, and its audio or where to find it.
pub struct Case {
    pub meta: TakeMeta,
    pub source: Source,
}

pub enum Source {
    /// Rendered when the case runs: the notes, the chain and the seed.
    Synth { notes: Vec<Note>, seed: u64 },
    File(std::path::PathBuf),
}

// ------------------------------------------------------------------ packs

#[derive(Debug, Clone, Deserialize)]
pub struct PackNote {
    pub string: u8,
    pub midi: f64,
    pub tick: i64,
    pub dur: i64,
    #[serde(default)]
    pub tech: Vec<String>,
    #[serde(default)]
    pub pick: Option<String>,
    #[serde(default)]
    pub bend: Option<f64>,
    #[serde(default)]
    pub accent: Option<bool>,
    /// Bench-only: the bend comes back down inside the note.
    #[serde(default)]
    pub release: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct Meter {
    numerator: u32,
    denominator: u32,
}

#[derive(Debug, Clone, Deserialize)]
struct Rung {
    bpm: f64,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Tempo {
    #[serde(default)]
    rungs: Vec<Rung>,
    #[serde(default)]
    pass_at_bpm: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct Detection {
    #[serde(default)]
    flags: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Exercise {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    grading: Option<String>,
    meter: Meter,
    pub bars: u32,
    pub notes: Vec<PackNote>,
    #[serde(default)]
    tempo: Tempo,
    #[serde(default)]
    pub pass_bars: Vec<PassBar>,
    #[serde(default)]
    detection: Detection,
}

#[derive(Deserialize)]
struct Step {
    exercises: Vec<Exercise>,
}

#[derive(Deserialize)]
struct Pack {
    steps: Vec<Step>,
}

impl Exercise {
    fn techs(&self) -> std::collections::BTreeSet<&str> {
        self.notes.iter().flat_map(|n| n.tech.iter().map(|t| t.as_str())).collect()
    }
    fn flag(&self, f: &str) -> bool {
        self.detection.flags.iter().any(|x| x == f)
    }
    fn has_chords(&self) -> bool {
        let mut ticks: BTreeMap<i64, u32> = BTreeMap::new();
        for n in &self.notes {
            *ticks.entry(n.tick).or_default() += 1;
        }
        ticks.values().filter(|c| **c >= 3).count() >= 2
    }
    fn bar_ticks(&self) -> i64 {
        (self.meter.numerator as f64 * 960.0 * 4.0 / self.meter.denominator as f64).round() as i64
    }
    fn take_bars(&self) -> u32 {
        let asked = self.pass_bars.iter().map(|b| b.over_bars).max().unwrap_or(0);
        self.bars.max(1).max(asked.max(8) + 2)
    }
}

/// (category, pack, how many in the full bench, predicate, top tempo?)
type Pick = (&'static str, &'static str, usize, fn(&Exercise) -> bool, bool);

const SELECT: &[Pick] = &[
    ("picked", "alternate-picking", 3, |e| e.detection.flags.is_empty() && e.techs().is_empty(), false),
    ("picked_fast", "alternate-picking", 3, |e| e.flag("fastPicking") && e.techs().is_empty(), true),
    ("picked_fast", "shred", 2, |e| e.flag("fastPicking") && e.techs().is_empty(), true),
    ("legato", "legato", 5, |e| e.techs().contains("hammer") || e.techs().contains("pull"), false),
    ("legato_fast", "legato", 3, |e| (e.techs().contains("hammer") || e.techs().contains("pull")) && e.flag("fastPicking"), true),
    ("tapping", "tapping", 4, |e| e.techs().contains("tap"), false),
    ("slides", "blues-pentatonics", 3, |e| e.techs().contains("slide"), false),
    ("slides", "sweep-picking", 1, |e| e.techs().contains("slide"), false),
    ("bends", "blues-pentatonics", 4, |e| e.techs().contains("bend"), false),
    ("vibrato", "blues-pentatonics", 2, |e| e.techs().contains("vibrato") && !e.techs().contains("bend"), false),
    ("palm_mute", "metal-rhythm", 4, |e| e.techs().contains("palmMute"), false),
    ("chords", "first-chords", 3, |e| e.has_chords(), false),
    ("chords", "chords-in-a-key", 2, |e| e.has_chords(), false),
    ("chords", "triads", 2, |e| e.has_chords(), false),
    ("sweeps", "sweep-picking", 5, |e| e.flag("fastSweep"), false),
];

fn styles(category: &str) -> &'static [&'static str] {
    match category {
        "picked" => &["good", "sloppy", "omit", "wrong"],
        "picked_fast" => &["good", "omit", "wrong"],
        "legato" => &["good", "weak", "omit", "wrong"],
        "legato_fast" => &["good", "weak"],
        "tapping" => &["good", "weak", "omit", "wrong"],
        "slides" => &["good", "omit", "wrong"],
        "bends" => &["good", "flat", "omit"],
        "bend_release" => &["good", "flat"],
        "vibrato" => &["good", "no_vibrato"],
        "palm_mute" => &["good", "omit", "wrong"],
        "chords" => &["good", "dead_string", "omit", "wrong"],
        "sweeps" => &["good", "ringing", "omit", "wrong"],
        "harmonics" => &["good", "omit", "wrong"],
        "drill16" => &["good", "omit", "wrong"],
        _ => &["good"],
    }
}

fn plain(string: u8, fret: i32, tick: i64, dur: i64) -> PackNote {
    PackNote {
        string,
        midi: (synth::STANDARD_TUNING[string as usize - 1] + fret) as f64,
        tick,
        dur,
        tech: vec![],
        pick: None,
        bend: None,
        accent: None,
        release: false,
    }
}

fn bars_of(names: &[(&str, f64, u32)]) -> Vec<PassBar> {
    names
        .iter()
        .map(|(m, v, over)| PassBar {
            metric: (*m).into(),
            min: if *m == "extraNotes" { None } else { Some(*v) },
            max: if *m == "extraNotes" { Some(*v) } else { None },
            over_bars: *over,
        })
        .collect()
}

fn written(id: &str, title: &str, bars: u32, notes: Vec<PackNote>, bpm: f64, pass_bars: Vec<PassBar>, flags: &[&str]) -> Exercise {
    Exercise {
        id: id.into(),
        title: title.into(),
        grading: Some("graded".into()),
        meter: Meter { numerator: 4, denominator: 4 },
        bars,
        notes,
        tempo: Tempo { rungs: vec![Rung { bpm }], pass_at_bpm: Some(bpm) },
        pass_bars,
        detection: Detection { flags: flags.iter().map(|s| s.to_string()).collect() },
    }
}

/// Sixteenths on one string, then across two: the speed drill.
fn drill(bpm: f64) -> Exercise {
    let notes = (0..32i64)
        .map(|i| {
            let string = if i < 16 || (i / 4) % 2 == 0 { 2 } else { 1 };
            plain(string, 5 + (i % 4) as i32, i * 240, 240)
        })
        .collect();
    let bars = bars_of(&[("timingEvenness", 0.85, 4), ("notesHeard", 0.9, 4), ("extraNotes", 3.0, 4), ("noteIdentity", 0.9, 4)]);
    written(&format!("drill16.{bpm}"), &format!("Sixteenths at {bpm}"), 2, notes, bpm, bars, &["fastPicking"])
}

/// Natural harmonics at the 12th and 7th frets, quarters.
fn harmonics() -> Exercise {
    let spots: [(u8, i32); 8] = [(3, 12), (2, 12), (1, 12), (2, 12), (3, 7), (2, 7), (1, 7), (2, 7)];
    let notes = spots
        .iter()
        .enumerate()
        .map(|(i, (s, f))| {
            // a 7th-fret harmonic sounds an octave and a fifth above the open string
            let mut n = plain(*s, if *f == 12 { 12 } else { 19 }, i as i64 * 960, 960);
            n.tech = vec!["harmonic".into()];
            n
        })
        .collect();
    let bars = bars_of(&[("timingEvenness", 0.85, 4), ("notesHeard", 0.9, 4), ("extraNotes", 3.0, 4), ("noteIdentity", 0.9, 4)]);
    written("bench.harmonics", "Natural harmonics", 2, notes, 90.0, bars, &[])
}

/// A whole-tone bend held and let back down, then a half-tone one: halves.
fn bend_release() -> Exercise {
    let mut notes = Vec::new();
    for (i, (fret, bend)) in [(7, 2.0), (7, 1.0), (8, 2.0), (8, 1.0)].iter().enumerate() {
        let mut n = plain(3, *fret, i as i64 * 1920, 1920);
        n.tech = vec!["bend".into()];
        n.bend = Some(*bend);
        n.release = true;
        notes.push(n);
    }
    let bars = bars_of(&[("notesHeard", 0.9, 4), ("extraNotes", 4.0, 4)]);
    written("bench.bend-release", "Bend and release", 2, notes, 80.0, bars, &["bendPitch"])
}

fn load_pack(packs: &Path, id: &str) -> Result<Pack, String> {
    let path = packs.join(format!("{id}.json"));
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str(&raw).map_err(|e| format!("{}: {e}", path.display()))
}

pub struct Mode {
    /// The fast subset: one Exercise per kind, shorter Takes.
    pub fast: bool,
    pub chains: Vec<String>,
}

/// Every synthetic Take of the bench, in a fixed order with fixed seeds.
pub fn synthetic(packs: &Path, mode: &Mode) -> Result<Vec<Case>, String> {
    let mut chosen: Vec<(&'static str, String, Exercise, f64)> = Vec::new();
    let mut seen_cat: BTreeMap<&str, usize> = BTreeMap::new();
    for (category, pack_id, count, pred, top) in SELECT {
        let pack = load_pack(packs, pack_id)?;
        let want = if mode.fast {
            // one Exercise per category, from the first pack that names it
            if seen_cat.get(category).copied().unwrap_or(0) >= 1 {
                0
            } else {
                1
            }
        } else {
            *count
        };
        let mut got = 0;
        for step in &pack.steps {
            for ex in &step.exercises {
                if got >= want || ex.grading.as_deref() != Some("graded") || ex.notes.is_empty() {
                    continue;
                }
                if chosen.iter().any(|c| c.2.id == ex.id && c.0 == *category) || !pred(ex) {
                    continue;
                }
                let top_bpm = ex.tempo.rungs.iter().map(|r| r.bpm).fold(0.0, f64::max);
                let bpm = if *top { top_bpm } else { ex.tempo.pass_at_bpm.unwrap_or_else(|| ex.tempo.rungs.first().map(|r| r.bpm).unwrap_or(90.0)) };
                chosen.push((category, pack_id.to_string(), ex.clone(), bpm));
                got += 1;
            }
        }
        *seen_cat.entry(category).or_default() += got;
    }
    chosen.push(("harmonics", "bench".into(), harmonics(), 90.0));
    chosen.push(("bend_release", "bench".into(), bend_release(), 80.0));
    let drills: &[f64] = if mode.fast { &[160.0, 200.0] } else { &[160.0, 180.0, 200.0, 220.0] };
    for bpm in drills {
        chosen.push(("drill16", "bench".into(), drill(*bpm), *bpm));
    }

    let max_take_s = if mode.fast { 12.0 } else { 22.0 };
    let mut cases = Vec::new();
    for (idx, (category, pack_id, ex, bpm)) in chosen.iter().enumerate() {
        for style in styles(category) {
            let seed = 100 + idx as u64;
            let (notes, truth, schedule, seconds, beats_per_bar) = build_take(ex, *bpm, style, seed, category, max_take_s);
            for chain in &mode.chains {
                let name = format!("{idx:02}_{category}_{style}_{chain}");
                cases.push(Case {
                    meta: TakeMeta {
                        name,
                        category: category.to_string(),
                        style: style.to_string(),
                        chain: chain.clone(),
                        pack: pack_id.clone(),
                        exercise: ex.id.clone(),
                        title: ex.title.clone(),
                        bpm: *bpm,
                        beats_per_bar,
                        lead_s: LEAD_S,
                        seconds,
                        flags: ex.detection.flags.clone(),
                        truth: truth.clone(),
                        schedule: schedule.clone(),
                        pass_bars: ex.pass_bars.clone(),
                        audio: None,
                    },
                    source: Source::Synth { notes: notes.clone(), seed },
                });
            }
        }
    }
    Ok(cases)
}

/// The written notes looped to a Take, and the truth of how they were played.
fn build_take(ex: &Exercise, bpm: f64, style: &str, seed: u64, category: &str, max_take_s: f64) -> (Vec<Note>, Vec<TruthNote>, ScoreSchedule, f64, f64) {
    let mut rng = Rng::new(seed);
    let bt = ex.bar_ticks();
    let beats_per_bar = bt as f64 / 960.0;
    let q = 60.0 / bpm;
    let mut bars = ex.take_bars();
    while bars > ex.bars.max(2) && bars as f64 * beats_per_bar * q > max_take_s {
        bars -= 1;
    }
    let pass_ticks = bt * ex.bars as i64;
    let passes = bars.div_ceil(ex.bars.max(1));
    let mut written: Vec<PackNote> = Vec::new();
    for p in 0..passes as i64 {
        for n in &ex.notes {
            let tick = n.tick + p * pass_ticks;
            if tick < bars as i64 * bt {
                written.push(PackNote { tick, ..n.clone() });
            }
        }
    }
    written.sort_by(|a, b| a.tick.cmp(&b.tick).then(b.string.cmp(&a.string)));

    // onsets: notes sharing a tick are one (src/songs/schedule.ts)
    let mut ticks: Vec<i64> = written.iter().map(|n| n.tick).collect();
    ticks.dedup();
    let onset_of: BTreeMap<i64, u32> = ticks.iter().enumerate().map(|(i, t)| (*t, i as u32)).collect();
    let sigma = if style == "sloppy" { 0.025 } else { 0.006 };
    let jitter: BTreeMap<i64, f64> = ticks.iter().map(|t| (*t, (rng.normal() * sigma).clamp(-3.0 * sigma, 3.0 * sigma))).collect();

    let mut notes: Vec<Note> = Vec::new();
    let mut truth: Vec<TruthNote> = Vec::new();
    let mut prev_on_string: BTreeMap<u8, usize> = BTreeMap::new();
    let (mut single_count, mut chord_count, mut bends_seen) = (0u32, 0u32, 0u32);
    for (nid, n) in written.iter().enumerate() {
        let group: Vec<usize> = (0..written.len()).filter(|i| written[*i].tick == n.tick).collect();
        let chord = group.len() > 1;
        let first_of_group = group[0] == nid;
        let middle_of_group = group[group.len() / 2] == nid;
        let mut tech = n.tech.clone();
        let t_written = LEAD_S + n.tick as f64 / 960.0 * q;
        let mut t = t_written + jitter[&n.tick];
        if chord {
            // a strum: low strings first on a downstroke, a few ms apart
            let down = n.pick.as_deref().unwrap_or("d") == "d";
            let mut order = group.clone();
            order.sort_by_key(|i| if down { -(written[*i].string as i32) } else { written[*i].string as i32 });
            t += 0.007 * order.iter().position(|i| *i == nid).unwrap_or(0) as f64;
        }
        let dur = n.dur as f64 / 960.0 * q;
        let mut slide_from = None;
        if let Some(pi) = prev_on_string.get(&n.string) {
            let prev = &written[*pi];
            if prev.tech.iter().any(|x| x == "slide") && prev.tick < n.tick {
                slide_from = Some(prev.midi);
                tech.retain(|x| x != "slide");
                tech.push("slide".into());
            }
        }
        let has = |tech: &[String], t: &str| tech.iter().any(|x| x == t);
        let legato = has(&tech, "hammer") || has(&tech, "pull") || has(&tech, "tap") || slide_from.is_some();
        let mut present = true;
        let mut midi_played = n.midi;
        let vel = rng.uniform(0.8, 1.0);
        let mut legato_strength = 0.45;
        let mut ring = has(&tech, "letRing");
        let bend_written = if has(&tech, "bend") { n.bend.unwrap_or(0.0) } else { 0.0 };
        let mut bend = bend_written;
        let mut vibrato = if has(&tech, "vibrato") { 35.0 } else { 0.0 };
        let mut fault: Option<&str> = None;
        if style == "weak" && legato {
            legato_strength = 0.10;
            fault = Some("weak");
        }
        if style == "omit" && !chord {
            single_count += 1;
            if single_count % 6 == 3 {
                present = false;
                fault = Some("omitted");
            }
        }
        if (style == "omit" || style == "wrong" || style == "dead_string") && chord && first_of_group {
            chord_count += 1;
        }
        if style == "omit" && chord && chord_count % 5 == 3 {
            present = false;
            fault = Some("omitted");
        }
        if style == "wrong" && !chord {
            single_count += 1;
            if single_count % 5 == 2 {
                midi_played += if (single_count / 5) % 2 == 0 { 1.0 } else { 2.0 };
                fault = Some("wrong");
            }
        }
        if style == "wrong" && chord && chord_count % 4 == 2 && middle_of_group {
            midi_played += 1.0;
            fault = Some("wrong");
        }
        if style == "dead_string" && chord && chord_count % 3 == 1 && middle_of_group {
            tech.push("dead".into());
            fault = Some("dead");
        }
        if style == "flat" && bend > 0.0 {
            if bends_seen % 2 == 0 {
                bend -= 0.5; // a quarter-tone short of the target
                fault = Some("flat");
            }
        }
        if bend_written > 0.0 {
            bends_seen += 1;
        }
        if style == "no_vibrato" && vibrato > 0.0 {
            vibrato = 0.0;
            fault = Some("noVibrato");
        }
        if style == "ringing" || (category == "sweeps" && style != "good") || category == "chords" {
            ring = true;
        }
        notes.push(Note {
            t,
            dur,
            string: n.string,
            midi: midi_played,
            tech: tech.clone(),
            vel,
            legato_strength,
            bend,
            bend_ms: (dur * 1000.0 * if n.release { 0.3 } else { 0.45 }).min(180.0),
            release: n.release,
            prebend: false,
            slide_from,
            slide_ms: (dur * 1000.0 * 0.4).min(70.0),
            vibrato_cents: vibrato,
            ring,
            present,
        });
        truth.push(TruthNote {
            note_id: nid as u32,
            onset_id: onset_of[&n.tick],
            beat: n.tick as f64 / 960.0,
            t_written,
            t_played: present.then_some(t),
            dur,
            string: n.string,
            midi_written: n.midi,
            midi_played: present.then_some(midi_played),
            tech,
            legato,
            chord_size: group.len() as u32,
            bend,
            bend_written,
            release: n.release,
            vibrato_cents: vibrato,
            fault: fault.map(|s| s.to_string()),
        });
        prev_on_string.insert(n.string, nid);
    }

    let onsets: Vec<ExpectedOnset> = ticks
        .iter()
        .map(|t| {
            let src: Vec<&PackNote> = written.iter().filter(|m| m.tick == *t).collect();
            ExpectedOnset {
                id: onset_of[t],
                beat: *t as f64 / 960.0,
                note_ids: truth.iter().filter(|x| x.onset_id == onset_of[t]).map(|x| x.note_id).collect(),
                soft: src.iter().all(|m| m.tech.iter().any(|x| x == "hammer" || x == "pull")),
                accent: src.iter().any(|m| m.accent.unwrap_or(false)),
            }
        })
        .collect();
    let schedule = ScoreSchedule { onsets, length_beats: bars as f64 * beats_per_bar, loops: false };
    let seconds = LEAD_S + bars as f64 * beats_per_bar * q + 1.2;
    (notes, truth, schedule, seconds, beats_per_bar)
}

/// Recordings with sidecars: every `*.truth.json` under `dir`, its WAV beside
/// it, and the pass bars from `*.job.json` when there is one.
pub fn from_dir(dir: &Path, only: Option<&str>) -> Result<Vec<Case>, String> {
    let mut paths: Vec<std::path::PathBuf> = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        for entry in std::fs::read_dir(&d).map_err(|e| format!("{}: {e}", d.display()))? {
            let p = entry.map_err(|e| e.to_string())?.path();
            if p.is_dir() {
                stack.push(p);
            } else if p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.ends_with(".truth.json") && only.is_none_or(|o| n.contains(o))) {
                paths.push(p);
            }
        }
    }
    paths.sort();
    let mut cases = Vec::new();
    for p in paths {
        let raw = std::fs::read_to_string(&p).map_err(|e| format!("{}: {e}", p.display()))?;
        let mut meta: TakeMeta = serde_json::from_str(&raw).map_err(|e| format!("{}: {e}", p.display()))?;
        let base = p.to_string_lossy().trim_end_matches(".truth.json").to_string();
        if meta.pass_bars.is_empty() {
            if let Ok(job) = std::fs::read_to_string(format!("{base}.job.json")) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&job) {
                    if let Some(bars) = v.get("passBars") {
                        meta.pass_bars = serde_json::from_value(bars.clone()).unwrap_or_default();
                    }
                }
            }
        }
        let named = meta.audio.as_ref().map(|a| {
            let a = std::path::PathBuf::from(a);
            if a.is_absolute() {
                a
            } else {
                p.parent().unwrap_or(Path::new(".")).join(a)
            }
        });
        let audio = named.filter(|a| a.exists()).or_else(|| ["wav", "flac"].iter().map(|ext| std::path::PathBuf::from(format!("{base}.{ext}"))).find(|a| a.exists()));
        let Some(audio) = audio else {
            return Err(format!("{base}: no .wav or .flac beside the sidecar"));
        };
        cases.push(Case { meta, source: Source::File(audio) });
    }
    Ok(cases)
}

/// The kind a truth note is tallied under.
pub fn kind_of(meta: &TakeMeta, n: &TruthNote) -> &'static str {
    let has = |t: &str| n.tech.iter().any(|x| x == t);
    if n.chord_size > 1 {
        "chord_tone"
    } else if has("hammer") {
        "hammer"
    } else if has("pull") {
        "pull"
    } else if has("tap") {
        "tap"
    } else if has("slide") && n.legato {
        "slide_to"
    } else if has("bend") && n.release {
        "bend_release"
    } else if has("bend") {
        "bend"
    } else if has("harmonic") {
        "harmonic"
    } else if has("vibrato") {
        "vibrato"
    } else if has("palmMute") {
        "palm_mute"
    } else if meta.category == "sweeps" {
        "sweep"
    } else if meta.category == "drill16" {
        "picked_16ths_160_220"
    } else {
        "picked"
    }
}
