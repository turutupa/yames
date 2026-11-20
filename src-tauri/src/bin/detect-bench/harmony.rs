//! The free-play engine on the bench (M7): key, chord per beat and
//! inside/outside, measured through the path the app runs: audio, the note
//! model on rolling windows, the note decoder, the engine
//! (`yames_lib::harmony::stream::run_all`).
//!
//! Two sources: synthetic strummed progressions and solos through every
//! capture chain (in `run --fast`, gated by the baseline), and GuitarSet's
//! microphone recordings against its own key and chord annotations
//! (`detect-bench harmony --guitarset <dir>`).

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use yames_lib::detect::model::{self, NoteModel};
use yames_lib::harmony::stream::run_all;
use yames_lib::harmony::{feed_notes, key_score, BeatOut, Chart, ChartChord, Engine, Key, KeyState, Mode, NoteClass, NoteVerdict};
use yames_lib::pitch::decode_mono_file;

use crate::eval::{Better, Metric};
use crate::synth::{self, Note, Rng};

/// What was really played.
pub struct Truth {
    pub name: String,
    pub chain: String,
    /// "strummed" or "solo".
    pub style: &'static str,
    pub key: Key,
    pub beat_s: f64,
    /// `(from, to, root, minor)`.
    pub chords: Vec<(f64, f64, u8, bool)>,
    /// `(start, seconds, midi)`, sorted.
    pub notes: Vec<(f64, f64, i32)>,
    pub seconds: f64,
}

impl Truth {
    fn chord_at(&self, t: f64) -> Option<(u8, bool)> {
        self.chords.iter().find(|c| t >= c.0 && t < c.1).map(|c| (c.2, c.3))
    }
    fn played(&self, t: f64, midi: i32) -> bool {
        self.notes.iter().any(|n| n.2 == midi && (n.0 - t).abs() <= 0.15)
    }
    fn chart(&self) -> Chart {
        // one bar per chord span; the marks say where each starts
        let bars = self
            .chords
            .iter()
            .map(|c| {
                let third = if c.3 { 3 } else { 4 };
                vec![ChartChord { root: c.2, tones: vec![c.2, (c.2 + third) % 12, (c.2 + 7) % 12, (c.2 + 10) % 12, (c.2 + if c.3 { 10 } else { 11 }) % 12], label: String::new() }]
            })
            .collect();
        Chart { key: Some(self.key), bars, beats_per_bar: 4 }
    }
}

/// Sums for one (chain, style) cell.
#[derive(Default, Clone)]
struct Cell {
    beats: u32,
    root_right: u32,
    answered: u32,
    answered_right: u32,
    key15: Vec<f64>,
    key30: Vec<f64>,
    cases: u32,
    settled: u32,
    settled_right: u32,
    settle_s: f64,
    out_called: u32,
    out_right: u32,
    in_called: u32,
    in_right: u32,
    untold: u32,
    chart_out_called: u32,
    chart_out_right: u32,
    chart_agree: u32,
    chart_notes: u32,
}

fn leading_at(beats: &[BeatOut], t: f64) -> Option<Key> {
    beats.iter().rev().find(|b| b.t1 <= t + 1e-6).and_then(|b| b.leading)
}

fn judge_outside(truth: &Truth, verdicts: &[NoteVerdict], called: &mut u32, right: &mut u32) {
    let mask = truth.key.scale_mask();
    for v in verdicts.iter().filter(|v| v.class == NoteClass::Outside) {
        *called += 1;
        // right when that note was played and is outside the true key
        if truth.played(v.t, v.midi) && mask & (1 << v.midi.rem_euclid(12)) == 0 {
            *right += 1;
        }
    }
}

/// One recording through the engine, as free play and (a solo) with its chart.
fn measure(model: &mut dyn NoteModel, samples: &[f32], rate: u32, truth: &Truth, from_annotation: bool) -> Result<Cell, String> {
    let mut cell = Cell { cases: 1, ..Cell::default() };
    let mut engine = Engine::new(None);
    engine.set_beat_seconds(truth.beat_s);
    let (mut beats, mut verdicts) = (Vec::new(), Vec::new());
    if from_annotation {
        feed_notes(&mut engine, &truth.notes, truth.seconds);
        engine.finish();
        beats = engine.take_beats();
        verdicts = engine.take_verdicts();
    } else {
        run_all(model, samples, rate, &mut engine, |_, e| {
            beats.extend(e.take_beats());
            verdicts.extend(e.take_verdicts());
        })?;
        engine.finish();
        beats.extend(engine.take_beats());
        verdicts.extend(engine.take_verdicts());
    }
    // `HARMONY_DEBUG_BEATS=1`: a line per recording (wrong roots by interval
    // above the true one; `near`: wrong, and the chord of a neighbouring
    // beat). `HARMONY_DEBUG_SEQ=<part of a name>`: truth/answer per beat.
    let mut wrong_by = [0u32; 12];
    let mut near = 0u32;
    for b in &beats {
        let mid = 0.5 * (b.t0 + b.t1);
        let Some((root, _)) = truth.chord_at(mid) else { continue };
        cell.beats += 1;
        if let Some(c) = &b.chord {
            cell.answered += 1;
            if c.root == root {
                cell.answered_right += 1;
                cell.root_right += 1;
            } else {
                wrong_by[((c.root + 12 - root) % 12) as usize] += 1;
                let len = b.t1 - b.t0;
                near += u32::from([mid - len, mid + len].iter().any(|t| truth.chord_at(*t).is_some_and(|x| x.0 == c.root)));
            }
        }
    }
    if std::env::var("HARMONY_DEBUG_SEQ").is_ok_and(|v| truth.name.contains(&v)) {
        const N: [&str; 12] = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
        let line: Vec<String> = beats.iter().map(|b| {
            let t = truth.chord_at(0.5 * (b.t0 + b.t1)).map_or("-".to_string(), |c| format!("{}{}", N[c.0 as usize], if c.1 { "m" } else { "" }));
            let e = b.chord.as_ref().map_or("?".to_string(), |c| format!("{}{}", N[c.root as usize], if c.quality.is_some_and(|q| q.is_minor()) { "m" } else { "" }));
            format!("{t}/{e}")
        }).collect();
        eprintln!("SEQ {} {} {}", truth.name, if from_annotation { "ann" } else { "mic" }, line.join(" "));
    }
    if std::env::var("HARMONY_DEBUG_BEATS").is_ok() {
        eprintln!("BEATS {} {} {} beats {} answered {} right {} near {} wrong_by {:?}", truth.name, truth.style, if from_annotation { "ann" } else { "mic" }, cell.beats, cell.answered, cell.root_right, near, wrong_by);
    }
    if truth.seconds >= 15.0 {
        cell.key15.push(key_score(leading_at(&beats, 15.0), truth.key));
    }
    if truth.seconds >= 29.0 {
        cell.key30.push(key_score(leading_at(&beats, truth.seconds.min(30.0) - 1.0), truth.key));
    }
    let reading = engine.reading();
    if std::env::var("HARMONY_DEBUG").is_ok() {
        eprintln!("{} {} truth {:?} at15 {:?} at30 {:?} settled {:?}", truth.name, if from_annotation { "ann" } else { "mic" }, truth.key, leading_at(&beats, 15.0), leading_at(&beats, truth.seconds.min(30.0) - 1.0), reading.key.map(|k| (k.key, k.relative_too)));
    }
    if let (KeyState::Settled, Some(k), Some(at)) = (reading.key_state, reading.key, reading.settled_at_s) {
        cell.settled = 1;
        cell.settle_s = at;
        cell.settled_right = u32::from(k.key == truth.key || (k.relative_too && k.key.relative() == truth.key));
    }
    judge_outside(truth, &verdicts, &mut cell.out_called, &mut cell.out_right);
    let mask = truth.key.scale_mask();
    for v in &verdicts {
        match v.in_key {
            Some(true) => {
                cell.in_called += 1;
                if truth.played(v.t, v.midi) && mask & (1 << v.midi.rem_euclid(12)) != 0 {
                    cell.in_right += 1;
                }
            }
            None => cell.untold += 1,
            Some(false) => {}
        }
    }
    if truth.style == "solo" && !from_annotation {
        // the same audio with the chart as the prior: what a jam does
        let mut engine = Engine::new(Some(truth.chart()));
        for (i, c) in truth.chords.iter().enumerate() {
            engine.mark_bar(c.0, i as u32, (c.1 - c.0) / 4.0);
        }
        let mut verdicts = Vec::new();
        run_all(model, samples, rate, &mut engine, |_, e| verdicts.extend(e.take_verdicts()))?;
        judge_outside(truth, &verdicts, &mut cell.chart_out_called, &mut cell.chart_out_right);
        // against the same rule over the notes as written
        let mut written = Engine::new(Some(truth.chart()));
        for (i, c) in truth.chords.iter().enumerate() {
            written.mark_bar(c.0, i as u32, (c.1 - c.0) / 4.0);
        }
        feed_notes(&mut written, &truth.notes, truth.seconds);
        let want = written.take_verdicts();
        for v in &verdicts {
            if let Some(w) = want.iter().find(|w| w.midi == v.midi && (w.t - v.t).abs() <= 0.15) {
                cell.chart_notes += 1;
                cell.chart_agree += u32::from(w.class == v.class);
            }
        }
    }
    Ok(cell)
}

fn add(a: &mut Cell, b: &Cell) {
    a.beats += b.beats;
    a.root_right += b.root_right;
    a.answered += b.answered;
    a.answered_right += b.answered_right;
    a.key15.extend(&b.key15);
    a.key30.extend(&b.key30);
    a.cases += b.cases;
    a.settled += b.settled;
    a.settled_right += b.settled_right;
    a.settle_s += b.settle_s;
    a.out_called += b.out_called;
    a.out_right += b.out_right;
    a.in_called += b.in_called;
    a.in_right += b.in_right;
    a.untold += b.untold;
    a.chart_out_called += b.chart_out_called;
    a.chart_out_right += b.chart_out_right;
    a.chart_agree += b.chart_agree;
    a.chart_notes += b.chart_notes;
}

fn metrics_of(cells: &BTreeMap<(String, String), Cell>) -> BTreeMap<String, Metric> {
    let mut out = BTreeMap::new();
    for ((chain, style), c) in cells {
        let mut put = |name: &str, num: f64, den: u32, better: Better| {
            if den > 0 {
                out.insert(format!("harmony|{chain}|{style}|{name}"), Metric { value: num / den as f64, n: den, better });
            }
        };
        put("chord_root", c.root_right as f64, c.beats, if style == "strummed" { Better::Higher } else { Better::Info });
        put("chord_answered", c.answered as f64, c.beats, Better::Info);
        put("chord_root_when_answered", c.answered_right as f64, c.answered, if style == "strummed" { Better::Higher } else { Better::Info });
        put("key_15s", c.key15.iter().sum(), c.key15.len() as u32, Better::Higher);
        put("key_30s", c.key30.iter().sum(), c.key30.len() as u32, Better::Higher);
        put("key_settled", c.settled as f64, c.cases, Better::Info);
        put("key_settled_right", c.settled_right as f64, c.settled, Better::Higher);
        put("key_settle_s", c.settle_s, c.settled, Better::Info);
        put("outside_precision", c.out_right as f64, c.out_called, Better::Info);
        put("inside_precision", c.in_right as f64, c.in_called, Better::Higher);
        put("notes_not_judged", c.untold as f64, c.untold + c.in_called + c.out_called, Better::Info);
        put("chart_outside_precision", c.chart_out_right as f64, c.chart_out_called, Better::Higher);
        put("chart_class_agrees", c.chart_agree as f64, c.chart_notes, Better::Higher);
    }
    out
}

fn pool(results: Vec<(String, String, Cell)>) -> BTreeMap<String, Metric> {
    let mut cells: BTreeMap<(String, String), Cell> = BTreeMap::new();
    for (chain, style, c) in results {
        add(cells.entry((chain, style.clone())).or_default(), &c);
        add(cells.entry(("all".into(), style)).or_default(), &c);
    }
    metrics_of(&cells)
}

// ------------------------------------------------------------ synthetic

fn note(t: f64, dur: f64, string: u8, midi: i32, vel: f64) -> Note {
    Note {
        t,
        dur,
        string,
        midi: midi as f64,
        tech: Vec::new(),
        vel,
        legato_strength: 1.0,
        bend: 0.0,
        bend_ms: 0.0,
        release: false,
        prebend: false,
        slide_from: None,
        slide_ms: 0.0,
        vibrato_cents: 0.0,
        ring: false,
        present: true,
    }
}

struct Song {
    name: &'static str,
    key: Key,
    bpm: f64,
    /// `(root pitch class, minor)` a bar.
    bars: &'static [(u8, bool)],
}

const SONGS: [Song; 3] = [
    Song { name: "C_I-vi-IV-V", key: Key { tonic: 0, mode: Mode::Major }, bpm: 100.0, bars: &[(0, false), (9, true), (5, false), (7, false)] },
    Song { name: "Am_i-iv-v-i", key: Key { tonic: 9, mode: Mode::Minor }, bpm: 90.0, bars: &[(9, true), (2, true), (4, true), (9, true)] },
    Song { name: "G_I-IV-V-I", key: Key { tonic: 7, mode: Mode::Major }, bpm: 120.0, bars: &[(7, false), (0, false), (2, false), (7, false)] },
];

/// The audio starts with this much room before bar one.
const LEAD_IN_S: f64 = 0.0;
const BARS: usize = 16;

fn build(song: &Song, style: &'static str, chain: &str, seed: u64) -> (Vec<Note>, Truth) {
    let beat = 60.0 / song.bpm;
    let mut rng = Rng::new(seed);
    let mut notes = Vec::new();
    let mut chords = Vec::new();
    let mut scale: Vec<i32> = Vec::new();
    for m in 57..=81 {
        if song.key.scale_mask() & (1 << (m % 12)) != 0 {
            scale.push(m);
        }
    }
    let mut at = scale.len() / 2;
    for bar in 0..BARS {
        let (root, minor) = song.bars[bar % song.bars.len()];
        let t0 = LEAD_IN_S + bar as f64 * 4.0 * beat;
        chords.push((t0, t0 + 4.0 * beat, root, minor));
        let third = if minor { 3 } else { 4 };
        if style == "strummed" {
            // root on the low strings, then fifth, root, third, fifth
            let low = 40 + (root as i32 + 12 - 4) % 12;
            for b in 0..4 {
                for (k, m) in [low, low + 7, low + 12, low + 12 + third, low + 19].into_iter().enumerate() {
                    let t = t0 + b as f64 * beat + k as f64 * 0.012 + rng.normal() * 0.004;
                    notes.push(note(t.max(0.0), beat * 0.92, 6 - k as u8, m, 0.7 + 0.1 * rng.normal().clamp(-1.0, 1.0)));
                }
            }
        } else {
            // eighths: a walk on the scale that lands on a chord tone on the
            // beat, and one note in ten a semitone outside
            for e in 0..8 {
                let step = (rng.unit() * 5.0) as i64 - 2;
                at = (at as i64 + step).clamp(0, scale.len() as i64 - 1) as usize;
                let mut m = scale[at];
                if e % 2 == 0 {
                    let tones = [root as i32, (root as i32 + third) % 12, (root as i32 + 7) % 12];
                    if let Some(i) = (0..scale.len()).filter(|i| tones.contains(&(scale[*i] % 12))).min_by_key(|i| (*i as i64 - at as i64).abs()) {
                        at = i;
                        m = scale[i];
                    }
                } else if rng.unit() < 0.1 {
                    m += 1;
                }
                let t = t0 + e as f64 * 0.5 * beat + rng.normal() * 0.004;
                notes.push(note(t.max(0.0), beat * 0.45, 2, m, 0.8));
            }
        }
    }
    notes.sort_by(|a, b| a.t.total_cmp(&b.t));
    let seconds = LEAD_IN_S + BARS as f64 * 4.0 * beat + 1.0;
    let truth = Truth {
        name: format!("harmony_{}_{style}__{chain}", song.name),
        chain: chain.to_string(),
        style,
        key: song.key,
        beat_s: beat,
        chords,
        notes: notes.iter().map(|n| (n.t, n.dur, n.midi as i32)).collect(),
        seconds,
    };
    (notes, truth)
}

/// The synthetic cases through every chain. `fast` runs two strummed songs
/// and one solo a chain, `full` all three of each.
pub fn run_synthetic(chains: &[String], fast: bool, jobs: usize, only: Option<&str>) -> Result<BTreeMap<String, Metric>, String> {
    let mut cases = Vec::new();
    for chain in chains {
        for (i, song) in SONGS.iter().enumerate() {
            for style in ["strummed", "solo"] {
                if fast && ((style == "strummed" && i == 2) || (style == "solo" && i != 0)) {
                    continue;
                }
                let (notes, truth) = build(song, style, chain, 0xC0FFEE + i as u64);
                if only.is_none_or(|o| truth.name.contains(o)) {
                    cases.push((notes, truth));
                }
            }
        }
    }
    let next = AtomicUsize::new(0);
    let results: Mutex<Vec<(String, String, Cell)>> = Mutex::new(Vec::new());
    let failure: Mutex<Option<String>> = Mutex::new(None);
    std::thread::scope(|scope| {
        for _ in 0..jobs.min(cases.len()) {
            scope.spawn(|| {
                let mut model = match model::load() {
                    Ok(m) => m,
                    Err(e) => {
                        *failure.lock().unwrap() = Some(format!("the note model did not load: {e}"));
                        return;
                    }
                };
                loop {
                    let i = next.fetch_add(1, Ordering::SeqCst);
                    if i >= cases.len() || failure.lock().unwrap().is_some() {
                        break;
                    }
                    let (notes, truth) = &cases[i];
                    let dry = synth::render_strings(notes, truth.seconds, 0xBEEF + i as u64);
                    let cell = synth::capture(&dry, &truth.chain, 0xBEEF + i as u64).and_then(|audio| measure(model.as_mut(), &audio, synth::SR, truth, false));
                    match cell {
                        Ok(c) => results.lock().unwrap().push((truth.chain.clone(), truth.style.to_string(), c)),
                        Err(e) => *failure.lock().unwrap() = Some(format!("{}: {e}", truth.name)),
                    }
                }
            });
        }
    });
    if let Some(e) = failure.into_inner().unwrap() {
        return Err(e);
    }
    Ok(pool(results.into_inner().unwrap()))
}

// ------------------------------------------------------------ GuitarSet

fn pitch_class(name: &str) -> Option<u8> {
    let base = match name.chars().next()? {
        'C' => 0,
        'D' => 2,
        'E' => 4,
        'F' => 5,
        'G' => 7,
        'A' => 9,
        'B' => 11,
        _ => return None,
    };
    let acc: i32 = name[1..].chars().map(|c| if c == '#' { 1 } else if c == 'b' { -1 } else { 0 }).sum();
    Some((base + acc).rem_euclid(12) as u8)
}

fn load_jams(path: &Path, style: &'static str) -> Result<Truth, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let j: serde_json::Value = serde_json::from_str(&raw).map_err(|e| format!("{}: {e}", path.display()))?;
    let (mut notes, mut chords, mut key, mut tempo) = (Vec::new(), Vec::new(), None, 120.0);
    for ann in j["annotations"].as_array().ok_or("no annotations")? {
        let ns = ann["namespace"].as_str().unwrap_or("");
        let src = ann["annotation_metadata"]["data_source"].as_str().unwrap_or("");
        let data = ann["data"].as_array().cloned().unwrap_or_default();
        match ns {
            "note_midi" => {
                for d in &data {
                    notes.push((d["time"].as_f64().unwrap_or(0.0), d["duration"].as_f64().unwrap_or(0.0), d["value"].as_f64().unwrap_or(0.0).round() as i32));
                }
            }
            // the instructed chart (the performed one names its source)
            "chord" if src.is_empty() => {
                for d in &data {
                    let label = d["value"].as_str().unwrap_or("N");
                    let (root, rest) = label.split_once(':').unwrap_or((label, ""));
                    if let Some(pc) = pitch_class(root) {
                        let t = d["time"].as_f64().unwrap_or(0.0);
                        let minor = rest.starts_with("min") || rest.starts_with("dim") || rest.starts_with("hdim");
                        chords.push((t, t + d["duration"].as_f64().unwrap_or(0.0), pc, minor));
                    }
                }
            }
            "key_mode" => {
                let label = data.first().and_then(|d| d["value"].as_str()).unwrap_or("");
                if let Some((tonic, mode)) = label.split_once(':') {
                    key = pitch_class(tonic).map(|t| Key { tonic: t, mode: if mode == "minor" { Mode::Minor } else { Mode::Major } });
                }
            }
            "tempo" => tempo = data.first().and_then(|d| d["value"].as_f64()).unwrap_or(120.0),
            _ => {}
        }
    }
    notes.sort_by(|a, b| a.0.total_cmp(&b.0));
    Ok(Truth {
        name: path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string(),
        chain: "gs_mic".into(),
        style,
        key: key.ok_or("no key")?,
        beat_s: 60.0 / tempo,
        chords,
        notes,
        seconds: j["file_metadata"]["duration"].as_f64().unwrap_or(30.0),
    })
}

/// GuitarSet's microphone recordings (and, as `gs_annotation`, its notes as
/// annotated: a perfect capture layer) against its key and chart.
pub fn run_guitarset(root: &Path, jobs: usize, limit: Option<usize>) -> Result<BTreeMap<String, Metric>, String> {
    let mut files: Vec<_> = std::fs::read_dir(root.join("annotation")).map_err(|e| format!("{}: {e}", root.display()))?.filter_map(|e| e.ok().map(|e| e.path())).filter(|p| p.extension().is_some_and(|x| x == "jams")).collect();
    files.sort();
    if let Some(n) = limit {
        // evenly through the set, so players and styles are all in it
        let step = (files.len() / n.max(1)).max(1);
        files = files.into_iter().step_by(step).collect();
    }
    // `HARMONY_ANNOTATION_ONLY=1`: only the annotated notes (seconds, no
    // audio): for working on the engine's rules.
    let annotation_only = std::env::var("HARMONY_ANNOTATION_ONLY").is_ok();
    let next = AtomicUsize::new(0);
    let results: Mutex<Vec<(String, String, Cell)>> = Mutex::new(Vec::new());
    let failure: Mutex<Option<String>> = Mutex::new(None);
    std::thread::scope(|scope| {
        for _ in 0..jobs.min(files.len()) {
            scope.spawn(|| {
                let Ok(mut model) = model::load() else {
                    *failure.lock().unwrap() = Some("the note model did not load".into());
                    return;
                };
                loop {
                    let i = next.fetch_add(1, Ordering::SeqCst);
                    if i >= files.len() || failure.lock().unwrap().is_some() {
                        break;
                    }
                    let stem = files[i].file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
                    let style = if stem.ends_with("solo") { "solo" } else { "strummed" };
                    let one = (|| {
                        let truth = load_jams(&files[i], style)?;
                        let ann = measure(model.as_mut(), &[], 44_100, &truth, true)?;
                        if annotation_only {
                            return Ok((None, ann));
                        }
                        let (audio, rate) = decode_mono_file(&root.join("audio_mono-mic").join(format!("{stem}_mic.wav")))?;
                        let mic = measure(model.as_mut(), &audio, rate, &truth, false)?;
                        Ok::<_, String>((Some(mic), ann))
                    })();
                    match one {
                        Ok((mic, ann)) => {
                            let mut r = results.lock().unwrap();
                            if let Some(mic) = mic {
                                r.push(("gs_mic".into(), style.into(), mic));
                            }
                            r.push(("gs_annotation".into(), style.into(), ann));
                            if r.len() % 80 == 0 {
                                eprintln!("{}/{} excerpts", r.len() / 2, files.len());
                            }
                        }
                        Err(e) => *failure.lock().unwrap() = Some(format!("{stem}: {e}")),
                    }
                }
            });
        }
    });
    if let Some(e) = failure.into_inner().unwrap() {
        return Err(e);
    }
    let mut m = pool(results.into_inner().unwrap());
    m.retain(|k, _| !k.starts_with("harmony|all|"));
    Ok(m)
}

const COLUMNS: [(&str, &str); 11] = [
    ("chord_root", "chord root right, all beats"),
    ("chord_answered", "beats given a chord"),
    ("chord_root_when_answered", "root right when given"),
    ("key_15s", "key score at 15 s"),
    ("key_30s", "key score at 30 s"),
    ("key_settled", "key settled"),
    ("key_settled_right", "settled key right"),
    ("key_settle_s", "seconds to settle"),
    ("inside_precision", "\"inside\" right"),
    ("outside_precision", "\"outside\" right"),
    ("chart_outside_precision", "\"outside\" right, with the chart"),
];

pub fn markdown(metrics: &BTreeMap<String, Metric>) -> String {
    let mut rows: Vec<(String, String)> = Vec::new();
    for k in metrics.keys().filter(|k| k.starts_with("harmony|")) {
        let p: Vec<&str> = k.split('|').collect();
        let row = (p[2].to_string(), p[1].to_string());
        if !rows.contains(&row) {
            rows.push(row);
        }
    }
    if rows.is_empty() {
        return String::new();
    }
    rows.sort();
    let mut s = String::from("## Free play: key, chord, inside/outside (M7)\n\nThe note model on rolling windows, the note decoder and the engine, with no chart (except the last column). Key scores are the leading key on the standard weighted score; \"settled\" is the key the app would show.\n\n| playing | chain |");
    for (_, title) in COLUMNS {
        s.push_str(&format!(" {title} |"));
    }
    s.push_str("\n|---|---|");
    s.push_str(&"---|".repeat(COLUMNS.len()));
    s.push('\n');
    for (style, chain) in rows {
        s.push_str(&format!("| {style} | {chain} |"));
        for (name, _) in COLUMNS {
            match metrics.get(&format!("harmony|{chain}|{style}|{name}")) {
                Some(m) if name.ends_with("_s") && name != "key_15s" && name != "key_30s" => s.push_str(&format!(" {:.1} |", m.value)),
                Some(m) if name.starts_with("key_1") || name.starts_with("key_3") => s.push_str(&format!(" {:.2} |", m.value)),
                Some(m) => s.push_str(&format!(" {:.0}% ({}) |", m.value * 100.0, m.n)),
                None => s.push_str(" - |"),
            }
        }
        s.push('\n');
    }
    s.push('\n');
    s
}
