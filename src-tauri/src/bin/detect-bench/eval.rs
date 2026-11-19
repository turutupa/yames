//! Truth against what the production path said, note by note, turned into the
//! bench's metrics; the Markdown tables; and the baseline check.
//!
//! Every accuracy is reported as two numbers, never one: sounded notes
//! confirmed, and mistakes let through. One without the other hides the trade.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use yames_lib::detect::verifier::Heard;
use yames_lib::pitch::NoteState;
use yames_lib::score::verify::VerifierStatus;
use yames_lib::score::OnsetState;

use crate::cases::{kind_of, TakeMeta};
use crate::harness::{Cost, Outcome};

/// One written note of one Take: the truth and every system's answer.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    pub take: String,
    pub category: String,
    pub style: String,
    pub chain: String,
    pub kind: &'static str,
    pub fault: Option<String>,
    pub present: bool,
    pub note_id: u32,
    pub t_written: f64,
    pub t_played: Option<f64>,
    /// The live detector and matcher: "hit" | "miss" | "softAbsent" | "notReached".
    pub onset: &'static str,
    /// Where the right-notes pass reads it from, seconds into the audio: the
    /// production look-up itself (`ScheduleRun::pitch_lookups_ms`), which has
    /// to be the attack.
    pub onset_t: Option<f64>,
    /// The cut of the pitch track nearest the true attack, seconds.
    pub cut_t: Option<f64>,
    /// The right-notes pass: "right" | "wrong" | "octave" | "unheard" | none.
    pub pitch: Option<&'static str>,
    pub verifier: Option<Heard>,
    pub verifier_t: Option<f64>,
    pub verifier_alt: Option<i32>,
    pub verifier_act: Option<f32>,
}

/// One Take's summary.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TakeRow {
    pub take: String,
    pub category: String,
    pub style: String,
    pub chain: String,
    pub bpm: f64,
    pub seconds: f64,
    pub verdict: Option<String>,
    pub pass: Option<String>,
    pub notes_status: Option<String>,
    pub due: u32,
    pub heard: u32,
    pub extra: u32,
    pub evenness: Option<f32>,
    pub verifier_status: VerifierStatus,
    pub verifier_lag_ms: f64,
    pub cost: Cost,
}

pub fn rows(meta: &TakeMeta, out: &Outcome) -> (Vec<Row>, TakeRow) {
    let report = out.report.as_ref();
    // pass 0 only: the bench's schedules do not loop
    let result_of: BTreeMap<u32, usize> = report
        .map(|r| r.results.iter().enumerate().filter(|(_, x)| x.pass == 0).map(|(k, x)| (x.id, k)).collect())
        .unwrap_or_default();
    let verified: BTreeMap<u32, &yames_lib::score::verify::VerifiedNote> = out.verifier.notes.iter().filter(|n| n.pass == 0).map(|n| (n.note_id, n)).collect();
    let mut rows = Vec::with_capacity(meta.truth.len());
    for n in &meta.truth {
        let k = result_of.get(&n.onset_id).copied();
        let r = k.and_then(|k| report.map(|rep| rep.results[k]));
        let onset = match r.map(|r| r.state) {
            Some(OnsetState::Hit) => "hit",
            Some(OnsetState::Miss) => "miss",
            Some(OnsetState::SoftAbsent) => "softAbsent",
            None => "notReached",
        };
        let onset_t = k.and_then(|k| out.pitch_lookups_ms.get(k).copied().flatten()).map(|ms| ms / 1000.0);
        let cut_t = n.t_played.filter(|_| onset_t.is_some()).and_then(|t| {
            out.pitch_cuts_ms.iter().map(|c| c / 1000.0).filter(|c| (c - t).abs() < 0.06).min_by(|a, b| (a - t).abs().total_cmp(&(b - t).abs()))
        });
        let pitch = k.and_then(|k| out.pitch_states.get(k).copied().flatten()).map(|s| match s {
            NoteState::Right => "right",
            NoteState::Wrong => "wrong",
            NoteState::Octave => "octave",
            NoteState::Unheard => "unheard",
            NoteState::NotAssessed => "notAssessed",
        });
        let v = verified.get(&n.note_id);
        rows.push(Row {
            take: meta.name.clone(),
            category: meta.category.clone(),
            style: meta.style.clone(),
            chain: meta.chain.clone(),
            kind: kind_of(meta, n),
            fault: n.fault.clone(),
            present: n.t_played.is_some(),
            note_id: n.note_id,
            t_written: n.t_written,
            t_played: n.t_played,
            onset,
            onset_t,
            cut_t,
            pitch,
            verifier: v.map(|v| v.heard),
            verifier_t: v.and_then(|v| v.deviation_ms).map(|d| n.t_written + d / 1000.0),
            verifier_alt: v.and_then(|v| v.heard_midi),
            verifier_act: v.map(|v| v.strength),
        });
    }
    let grade = report.map(|r| &r.grade);
    let take = TakeRow {
        take: meta.name.clone(),
        category: meta.category.clone(),
        style: meta.style.clone(),
        chain: meta.chain.clone(),
        bpm: meta.bpm,
        seconds: out.seconds,
        verdict: grade.map(|g| json_name(&g.verdict)),
        pass: grade.and_then(|g| g.pass.as_ref()).map(|p| json_name(&p.verdict)),
        notes_status: grade.and_then(|g| g.pass.as_ref()).and_then(|p| p.notes.as_ref()).map(|n| json_name(&n.status)),
        due: grade.map(|g| g.due).unwrap_or(0),
        heard: grade.map(|g| g.heard).unwrap_or(0),
        extra: grade.map(|g| g.extra).unwrap_or(0),
        evenness: grade.and_then(|g| g.evenness),
        verifier_status: out.verifier.status,
        verifier_lag_ms: out.verifier.lag_ms,
        cost: out.cost,
    };
    (rows, take)
}

fn json_name<T: Serialize>(v: &T) -> String {
    serde_json::to_value(v).ok().and_then(|v| v.as_str().map(|s| s.to_string())).unwrap_or_default()
}

// ---------------------------------------------------------------- metrics

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Better {
    Higher,
    Lower,
    /// Reported, not gated: a number that describes rather than judges.
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Metric {
    /// A share 0..1, or milliseconds for `*_ms`.
    pub value: f64,
    /// Notes (or Takes) it was measured over.
    pub n: u32,
    pub better: Better,
}

#[derive(Default)]
struct Share {
    k: u32,
    n: u32,
}

#[derive(Default)]
struct Acc {
    shares: BTreeMap<String, (Share, Option<Better>)>,
    errors: BTreeMap<String, Vec<f64>>,
    biases: BTreeMap<String, Vec<f64>>,
}

impl Acc {
    fn share(&mut self, key: String, hit: bool, better: Better) {
        let e = self.shares.entry(key).or_default();
        e.0.n += 1;
        e.0.k += hit as u32;
        e.1 = Some(better);
    }
    fn bias(&mut self, key: String, ms: f64) {
        self.biases.entry(key).or_default().push(ms);
    }
    fn error(&mut self, key: String, ms: f64) {
        self.errors.entry(key).or_default().push(ms);
    }
}

fn median(v: &mut [f64]) -> f64 {
    if v.is_empty() {
        return 0.0;
    }
    v.sort_by(|a, b| a.total_cmp(b));
    let m = v.len();
    if m % 2 == 1 {
        v[m / 2]
    } else {
        0.5 * (v[m / 2 - 1] + v[m / 2])
    }
}

/// Robust scatter: 1.4826 x MAD.
fn scatter(v: &mut [f64]) -> f64 {
    let m = median(v);
    let mut d: Vec<f64> = v.iter().map(|x| (x - m).abs()).collect();
    1.4826 * median(&mut d)
}

/// Metric names are `group|chain|kind|metric`; `all` pools a dimension.
pub fn metrics(rows: &[Row], takes: &[TakeRow], has_verifier: bool) -> BTreeMap<String, Metric> {
    let mut acc = Acc::default();
    // timing errors with each Take's own constant lag removed
    let mut by_take: BTreeMap<&str, Vec<&Row>> = BTreeMap::new();
    for r in rows {
        by_take.entry(&r.take).or_default().push(r);
    }
    for (_, rs) in &by_take {
        for (name, get) in [("onset_scatter_ms", (|r: &Row| r.onset_t) as fn(&Row) -> Option<f64>), ("verifier_scatter_ms", |r: &Row| r.verifier_t)] {
            let errs: Vec<(&Row, f64)> = rs
                .iter()
                .filter(|r| r.style == "good" && r.fault.is_none() && r.kind != "chord_tone")
                .filter_map(|r| Some((*r, (get(r)? - r.t_played?) * 1000.0)))
                .collect();
            if errs.len() < 4 {
                continue;
            }
            let lag = median(&mut errs.iter().map(|e| e.1).collect::<Vec<_>>());
            for (r, e) in errs {
                for chain in [r.chain.as_str(), "all"] {
                    acc.error(format!("good|{chain}|{}|{name}", r.kind), e - lag);
                }
            }
        }
        // The right-notes pass must read each note from its ATTACK. The
        // bench's audio has no latency in it, so the look-up time and the
        // nearest cut should both sit on the true attack: a detector delay
        // left in (+25 ms) or taken out twice (-25 ms) shows here whatever the
        // pitch verdicts happen to do.
        for (name, get) in [("lookup_bias_ms", (|r: &Row| r.onset_t) as fn(&Row) -> Option<f64>), ("cut_bias_ms", |r: &Row| r.cut_t)] {
            for r in rs.iter().filter(|r| r.style == "good" && r.fault.is_none() && r.kind != "chord_tone" && r.kind != "slide_to") {
                if let (Some(t), Some(truth)) = (get(r), r.t_played) {
                    acc.bias(format!("good|{}|all|{name}", r.chain), (t - truth) * 1000.0);
                    acc.bias(format!("good|all|all|{name}"), (t - truth) * 1000.0);
                }
            }
        }
    }
    for r in rows {
        let v = r.verifier;
        for chain in [r.chain.as_str(), "all"] {
            let mut put = |group: &str, kind: &str, metric: &str, hit: bool, better: Better| {
                acc.share(format!("{group}|{chain}|{kind}|{metric}"), hit, better);
            };
            match (r.style.as_str(), r.fault.as_deref()) {
                ("good", None) if r.present => {
                    put("good", r.kind, "onset_heard", r.onset == "hit", Better::Higher);
                    if r.kind != "chord_tone" {
                        put("good", r.kind, "pitch_right", r.pitch == Some("right"), Better::Info);
                        put("good", r.kind, "pitch_wrong", matches!(r.pitch, Some("wrong") | Some("octave")), Better::Lower);
                    }
                    if has_verifier {
                        put("good", r.kind, "verifier_yes", v == Some(Heard::Yes), Better::Higher);
                        put("good", r.kind, "verifier_unsure", v == Some(Heard::Unsure), Better::Info);
                        put("good", r.kind, "verifier_no", matches!(v, Some(Heard::No) | Some(Heard::Wrong)), Better::Lower);
                    }
                }
                (_, Some("weak")) => {
                    put("weak", r.kind, "onset_heard", r.onset == "hit", Better::Info);
                    if has_verifier {
                        put("weak", r.kind, "verifier_yes", v == Some(Heard::Yes), Better::Info);
                    }
                }
                (_, Some("omitted")) => {
                    for kind in [r.kind, "all"] {
                        put("omitted", kind, "onset_heard", r.onset == "hit", Better::Lower);
                        if has_verifier {
                            put("omitted", kind, "verifier_yes", v == Some(Heard::Yes), Better::Lower);
                            put("omitted", kind, "verifier_unsure", v == Some(Heard::Unsure), Better::Info);
                            put("omitted", kind, "verifier_caught", matches!(v, Some(Heard::No) | Some(Heard::Wrong)), Better::Higher);
                        }
                    }
                }
                (_, Some("wrong")) => {
                    for kind in [r.kind, "all"] {
                        if r.kind != "chord_tone" {
                            put("wrong", kind, "pitch_right", r.pitch == Some("right"), Better::Lower);
                            put("wrong", kind, "pitch_caught", matches!(r.pitch, Some("wrong") | Some("octave")), Better::Info);
                        }
                        if has_verifier {
                            put("wrong", kind, "verifier_yes", v == Some(Heard::Yes), Better::Lower);
                            put("wrong", kind, "verifier_unsure", v == Some(Heard::Unsure), Better::Info);
                            put("wrong", kind, "verifier_caught", matches!(v, Some(Heard::No) | Some(Heard::Wrong)), Better::Higher);
                        }
                    }
                }
                (_, Some("dead")) if has_verifier => {
                    put("dead", r.kind, "verifier_yes", v == Some(Heard::Yes), Better::Lower);
                    put("dead", r.kind, "verifier_caught", v == Some(Heard::No), Better::Info);
                }
                _ => {}
            }
        }
    }
    for t in takes {
        if t.pass.is_none() {
            continue;
        }
        let group = if t.style == "good" { "good" } else if t.style == "omit" || t.style == "wrong" { "faulty" } else { continue };
        for chain in [t.chain.as_str(), "all"] {
            let passed = t.pass.as_deref() == Some("passed");
            if group == "good" {
                acc.share(format!("takes|{chain}|all|good_passed"), passed, Better::Higher);
                acc.share(format!("takes|{chain}|all|good_not_caught"), t.pass.as_deref() == Some("didntCatchEnough"), Better::Info);
            } else {
                acc.share(format!("takes|{chain}|all|faulty_passed"), passed, Better::Info);
            }
        }
    }
    let mut out = BTreeMap::new();
    for (key, (s, better)) in acc.shares {
        out.insert(key, Metric { value: if s.n == 0 { 0.0 } else { s.k as f64 / s.n as f64 }, n: s.n, better: better.unwrap_or(Better::Info) });
    }
    for (key, mut v) in acc.errors {
        let n = v.len() as u32;
        out.insert(key, Metric { value: scatter(&mut v), n, better: Better::Lower });
    }
    for (key, mut v) in acc.biases {
        let n = v.len() as u32;
        // gated on its size: early is as wrong as late
        out.insert(key, Metric { value: median(&mut v).abs(), n, better: Better::Lower });
    }
    out
}

// ------------------------------------------------------------------ check

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Baseline {
    /// What produced it, for a reader: mode, chains, runtime.
    pub about: serde_json::Value,
    pub metrics: BTreeMap<String, Metric>,
}

/// How far a metric may move the wrong way before the check fails. Shares:
/// two points, or two notes of a small sample, whichever is more. Scatter:
/// a millisecond.
pub fn tolerance(key: &str, n: u32) -> f64 {
    if key.ends_with("_ms") {
        1.0
    } else {
        (2.0 / n.max(1) as f64).max(0.02)
    }
}

pub struct CheckOutcome {
    pub regressions: Vec<String>,
    pub improvements: Vec<String>,
    pub missing: Vec<String>,
}

pub fn check(now: &BTreeMap<String, Metric>, base: &Baseline) -> CheckOutcome {
    let mut out = CheckOutcome { regressions: vec![], improvements: vec![], missing: vec![] };
    for (key, b) in &base.metrics {
        if b.better == Better::Info {
            continue;
        }
        let Some(m) = now.get(key) else {
            out.missing.push(key.clone());
            continue;
        };
        let tol = tolerance(key, b.n.min(m.n));
        let worse = match b.better {
            Better::Higher => b.value - m.value,
            Better::Lower => m.value - b.value,
            Better::Info => 0.0,
        };
        let line = format!("{key}: {} -> {} (n={}, tolerance {})", fmt_value(key, b.value), fmt_value(key, m.value), m.n, fmt_value(key, tol));
        if worse > tol + 1e-9 {
            out.regressions.push(line);
        } else if worse < -tol - 1e-9 {
            out.improvements.push(line);
        }
    }
    out
}

pub fn fmt_value(key: &str, v: f64) -> String {
    if key.ends_with("_ms") {
        format!("{v:.1} ms")
    } else {
        format!("{:.1}%", v * 100.0)
    }
}

// --------------------------------------------------------------- markdown

const KIND_ORDER: [&str; 13] = [
    "picked", "picked_16ths_160_220", "palm_mute", "hammer", "pull", "tap", "slide_to", "bend", "bend_release", "vibrato", "harmonic", "sweep", "chord_tone",
];

fn cell(m: Option<&Metric>, key: &str) -> String {
    match m {
        Some(m) if key.ends_with("_ms") => format!("{:.1}", m.value),
        Some(m) => format!("{:.0}%", m.value * 100.0),
        None => "-".into(),
    }
}

fn table(out: &mut String, title: &str, note: &str, metrics: &BTreeMap<String, Metric>, group: &str, metric: &str, kinds: &[&str], chains: &[String]) {
    let mut any = false;
    let mut body = String::new();
    for kind in kinds {
        let all = metrics.get(&format!("{group}|all|{kind}|{metric}"));
        let Some(all) = all else { continue };
        any = true;
        body.push_str(&format!("| {kind} | {} | {} |", all.n, cell(Some(all), metric)));
        for c in chains {
            body.push_str(&format!(" {} |", cell(metrics.get(&format!("{group}|{c}|{kind}|{metric}")), metric)));
        }
        body.push('\n');
    }
    if !any {
        return;
    }
    out.push_str(&format!("### {title}\n\n{note}\n\n| kind | n | all |"));
    for c in chains {
        out.push_str(&format!(" {c} |"));
    }
    out.push_str("\n|---|---|---|");
    for _ in chains {
        out.push_str("---|");
    }
    out.push('\n');
    out.push_str(&body);
    out.push('\n');
}

pub fn markdown(about: &serde_json::Value, metrics: &BTreeMap<String, Metric>, takes: &[TakeRow], chains: &[String], has_verifier: bool) -> String {
    let mut s = String::new();
    s.push_str("# Detection bench\n\n");
    s.push_str(&format!("`{}`\n\n", about));
    s.push_str("Synthetic guitar (a string model, fixed seeds) through the production detector, scorer, right-notes pass and verifier. Every number is reproducible with `npm run detect:bench`; see `plans/detection/MEASURE.md`.\n\n");
    s.push_str("## Notes played as written\n\n");
    let k = &KIND_ORDER[..];
    table(&mut s, "Onset heard by the live detector and matcher", "Share of correctly played notes the timing grade counts as heard.", metrics, "good", "onset_heard", k, chains);
    if has_verifier {
        table(&mut s, "Confirmed by the verifier", "Share of correctly played notes the note model confirms.", metrics, "good", "verifier_yes", k, chains);
        table(&mut s, "Verifier: couldn't tell", "Correct notes the verifier gives no verdict on. Never a miss, never blocks a pass.", metrics, "good", "verifier_unsure", k, chains);
        table(&mut s, "Verifier: wrongly declined", "Correct notes the verifier calls not sounded or wrong. The number that must stay near zero.", metrics, "good", "verifier_no", k, chains);
    }
    table(&mut s, "Right-notes pass says right", "The pitch tracker's verdict on correct notes, when asked (whether a Take is graded on it depends on its pass bars).", metrics, "good", "pitch_right", k, chains);
    table(&mut s, "Right-notes pass says wrong", "Correct notes the pitch tracker calls wrong or an octave out.", metrics, "good", "pitch_wrong", k, chains);
    table(&mut s, "Timing scatter of the live detector, ms", "Robust spread of matched onset times against the true note times, each Take's constant lag removed.", metrics, "good", "onset_scatter_ms", k, chains);
    table(&mut s, "Where the right-notes pass reads a note, against its true attack, ms", "Size of the median error of the production look-up time. Near zero or the pass reads the wrong note at speed (the M0 bug was +25).", metrics, "good", "lookup_bias_ms", &["all"], chains);
    table(&mut s, "Where the right-notes pass cuts its track, against the true attack, ms", "The same for the cuts between notes.", metrics, "good", "cut_bias_ms", &["all"], chains);
    if has_verifier {
        table(&mut s, "Timing scatter of the verifier, ms", "The same for the verifier's own start times.", metrics, "good", "verifier_scatter_ms", k, chains);
    }
    s.push_str("## Mistakes let through\n\n");
    let all_and = |extra: &[&'static str]| -> Vec<&'static str> { std::iter::once("all").chain(extra.iter().copied()).collect() };
    let kk = all_and(&KIND_ORDER);
    table(&mut s, "A left-out note counted as heard by the matcher", "Lower is better.", metrics, "omitted", "onset_heard", &kk, chains);
    if has_verifier {
        table(&mut s, "A left-out note confirmed by the verifier", "Lower is better.", metrics, "omitted", "verifier_yes", &kk, chains);
        table(&mut s, "A left-out note caught by the verifier", "Called not sounded. The rest are couldn't-tell.", metrics, "omitted", "verifier_caught", &kk, chains);
    }
    table(&mut s, "A wrong pitch called right by the right-notes pass", "Lower is better.", metrics, "wrong", "pitch_right", &kk, chains);
    if has_verifier {
        table(&mut s, "A wrong pitch confirmed by the verifier", "Lower is better.", metrics, "wrong", "verifier_yes", &kk, chains);
        table(&mut s, "A wrong pitch caught by the verifier", "Called wrong or not sounded.", metrics, "wrong", "verifier_caught", &kk, chains);
        table(&mut s, "A dead string in a chord confirmed by the verifier", "Lower is better.", metrics, "dead", "verifier_yes", &["chord_tone"], chains);
        s.push_str("## Weak legato (a tenth of a pick's strength)\n\n");
        table(&mut s, "Confirmed by the verifier", "Information: a hammer-on this weak arguably should read as weak.", metrics, "weak", "verifier_yes", k, chains);
    }
    table(&mut s, "Weak legato heard by the live detector", "Information.", metrics, "weak", "onset_heard", k, chains);
    s.push_str("## Takes\n\n");
    table(&mut s, "Correctly played Takes that pass their Exercise's bars", "Higher is better. A correct Take that fails is the app wronging the player.", metrics, "takes", "good_passed", &["all"], chains);
    table(&mut s, "Correctly played Takes answered with \"I didn't catch enough\"", "", metrics, "takes", "good_not_caught", &["all"], chains);
    table(&mut s, "Takes with scripted mistakes that pass", "Information: one note in five or six is wrong or missing in these.", metrics, "takes", "faulty_passed", &["all"], chains);

    let audio: f64 = takes.iter().map(|t| t.seconds).sum();
    if audio > 0.0 {
        let per = |f: fn(&Cost) -> f64| takes.iter().map(|t| f(&t.cost)).sum::<f64>() / audio;
        s.push_str("## Cost\n\nMilliseconds of work per second of audio, wall clock on the machine that ran this (not gated: it depends on the machine and its load).\n\n| stage | ms per s of audio | a 30 s Take |\n|---|---|---|\n");
        for (name, v) in [
            ("onset detector", per(|c| c.detect_ms)),
            ("scorer and right-notes pass", per(|c| c.score_ms)),
            ("note model", per(|c| c.model_ms)),
            ("verifier rule", per(|c| c.rule_ms)),
        ] {
            s.push_str(&format!("| {name} | {v:.2} | {:.0} ms |\n", v * 30.0));
        }
        s.push_str(&format!("\n{} Takes, {:.1} minutes of audio.\n", takes.len(), audio / 60.0));
    }
    s
}
