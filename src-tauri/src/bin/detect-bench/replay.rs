//! One recording through the production path, as JSON and as a page to look
//! at: the waveform, the spectrogram, what was written against what was
//! heard, and every verdict. The tool for "this Take graded wrong on my
//! guitar": `plans/detection/MEASURE.md` says how a Take gets out of the app
//! and into here.

use base64::Engine;
use serde_json::{json, Value};
use yames_lib::detect::flux::{mel_db, FLUX_HOP, MEL_BANDS};
use yames_lib::detect::model::{MIDI_LOW, MODEL_RATE, PITCHES};
use yames_lib::detect::verifier::{P_HI, P_LO};
use yames_lib::pitch::NoteState;
use yames_lib::score::OnsetState;

use crate::harness::{Job, Outcome};

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// Everything the page draws and everything a script would want, in one value.
pub fn document(samples: &[f32], rate: u32, job: &Job, out: &Outcome, source: &str) -> Value {
    let seconds = out.seconds;
    // waveform: min and max per 5 ms
    let cols = (seconds * 200.0).ceil() as usize;
    let per = (rate as f64 / 200.0).max(1.0);
    let mut wave = Vec::with_capacity(cols * 2);
    for c in 0..cols {
        let (a, b) = ((c as f64 * per) as usize, (((c + 1) as f64 * per) as usize).min(samples.len()));
        let (mut lo, mut hi) = (0.0f32, 0.0f32);
        for v in &samples[a.min(b)..b] {
            lo = lo.min(*v);
            hi = hi.max(*v);
        }
        wave.push((lo * 127.0).round() as i8 as u8);
        wave.push((hi * 127.0).round() as i8 as u8);
    }
    // spectrogram: the envelope's own log-mel, every second frame (11.6 ms)
    let at_rate: Vec<f64> = resample(samples, rate);
    let (frames, db) = mel_db(&at_rate, MODEL_RATE);
    let peak = db.iter().cloned().fold(f64::MIN, f64::max);
    let spec_frames = frames.div_ceil(2);
    let mut spec = Vec::with_capacity(spec_frames * MEL_BANDS);
    for f in (0..frames).step_by(2) {
        for m in 0..MEL_BANDS {
            spec.push((((db[f * MEL_BANDS + m] - (peak - 80.0)) / 80.0).clamp(0.0, 1.0) * 255.0) as u8);
        }
    }
    let spec_dt = 2.0 * FLUX_HOP as f64 / MODEL_RATE as f64;

    let mut doc = json!({
        "source": source,
        "seconds": seconds,
        "rate": rate,
        "bpm": job.bpm,
        "firstBeatMs": job.first_beat_ms,
        "detectionDelayMs": out.detected.delay_ms,
        "gapMs": out.gap_ms,
        "onsets": out.detected.onsets.iter().map(|o| json!({"tMs": o.time_ms, "amp": o.amplitude, "conf": o.confidence})).collect::<Vec<_>>(),
        "cost": out.cost,
        "wave": {"perSecond": 200, "minMaxI8": b64(&wave)},
        "spectrogram": {"dt": spec_dt, "bands": MEL_BANDS, "frames": spec_frames, "u8": b64(&spec), "note": "log-mel, 60 Hz to 10 kHz, 80 dB range"},
        "verifierStatus": out.verifier.status,
    });
    if let Some(a) = &out.analysis {
        // the note posterior over the guitar's range, as the verifier read it
        let np = (P_HI - P_LO + 1) as usize;
        let lo = (P_LO - MIDI_LOW) as usize;
        let mut post = Vec::with_capacity(a.posteriors.frames * np);
        let mut onset = Vec::with_capacity(a.posteriors.frames * np);
        for k in 0..a.posteriors.frames {
            for c in 0..np {
                post.push((a.posteriors.note[k * PITCHES + lo + c].clamp(0.0, 1.0) * 255.0) as u8);
                onset.push((a.posteriors.onset[k * PITCHES + lo + c].clamp(0.0, 1.0) * 255.0) as u8);
            }
        }
        doc["posterior"] = json!({"dt": a.evidence.dt, "frames": a.posteriors.frames, "midiLow": P_LO, "pitches": np, "noteU8": b64(&post), "onsetU8": b64(&onset)});
        let flux_peak = a.evidence.flux.iter().cloned().fold(1e-9f32, f32::max);
        doc["flux"] = json!({"dt": a.evidence.flux_dt, "u8": b64(&a.evidence.flux.iter().map(|v| (v / flux_peak * 255.0) as u8).collect::<Vec<_>>())});
    }
    if let Some(tr) = &out.pitch_track {
        doc["pitchTrack"] = json!({
            "hopMs": tr.config.hop_ms(),
            "windowMs": tr.config.window_ms(),
            "frames": tr.frames.iter().map(|f| json!([((f.start_ms + tr.config.window_ms() / 2.0) * 10.0).round() / 10.0, if f.voiced { (f.midi * 100.0).round() / 100.0 } else { -1.0 }])).collect::<Vec<_>>(),
        });
    }
    if let (Some(schedule), Some(report)) = (&job.schedule, &out.report) {
        let q = 60.0 / job.bpm;
        let offset = report.grade.calibration.offset_ms;
        let pitch: std::collections::HashMap<u32, f64> = job.pitches.iter().map(|p| (p.id, p.midi)).collect();
        let length = if schedule.length_beats > 0.0 { schedule.length_beats } else { 0.0 };
        let mut expected = Vec::new();
        for (k, r) in report.results.iter().enumerate() {
            let Some(onset) = schedule.onsets.iter().find(|o| o.id == r.id) else { continue };
            let beat = r.pass as f64 * length + onset.beat;
            let due_ms = if job.quarters_ms.len() >= 2 {
                let i = (beat.floor() as usize).min(job.quarters_ms.len() - 2);
                job.quarters_ms[i] + (beat - i as f64) * (job.quarters_ms[i + 1] - job.quarters_ms[i])
            } else {
                job.first_beat_ms + beat * q * 1000.0
            };
            let verified: Vec<_> = out.verifier.notes.iter().filter(|n| n.result as usize == k).collect();
            expected.push(json!({
                "result": k,
                "onsetId": r.id,
                "pass": r.pass,
                "beat": beat,
                "dueMs": due_ms,
                "soft": onset.soft,
                "state": match r.state { OnsetState::Hit => "hit", OnsetState::Miss => "miss", OnsetState::SoftAbsent => "softAbsent" },
                "deviationMs": r.deviation_ms,
                // where the matcher says the note started, in the audio
                "heardAtMs": r.deviation_ms.map(|d| due_ms + offset + d - out.detected.delay_ms),
                "pitchPass": out.pitch_states.get(k).copied().flatten().map(|s| match s {
                    NoteState::Right => "right", NoteState::Wrong => "wrong", NoteState::Octave => "octave", NoteState::Unheard => "unheard", NoteState::NotAssessed => "notAssessed",
                }),
                "notes": onset.note_ids.iter().map(|id| {
                    let v = verified.iter().find(|n| n.note_id == *id);
                    json!({"id": id, "midi": pitch.get(id), "verifier": v})
                }).collect::<Vec<_>>(),
            }));
        }
        doc["expected"] = json!(expected);
        doc["extras"] = serde_json::to_value(&report.extras).unwrap_or_default();
        doc["grade"] = serde_json::to_value(&report.grade).unwrap_or_default();
        doc["verifierLagMs"] = json!(out.verifier.lag_ms);
        doc["verifierKinds"] = serde_json::to_value(&out.verifier.kinds).unwrap_or_default();
    }
    doc
}

/// To the model's rate, for the spectrogram only (the production path does its
/// own resampling inside `detect::analyse`). Linear, after a crude box filter.
fn resample(samples: &[f32], rate: u32) -> Vec<f64> {
    if rate == MODEL_RATE {
        return samples.iter().map(|v| *v as f64).collect();
    }
    let ratio = rate as f64 / MODEL_RATE as f64;
    let n = (samples.len() as f64 / ratio) as usize;
    let half = (ratio / 2.0).ceil() as isize;
    (0..n)
        .map(|i| {
            let c = (i as f64 * ratio) as isize;
            let (mut s, mut k) = (0.0, 0);
            for j in c - half..=c + half {
                if j >= 0 && (j as usize) < samples.len() {
                    s += samples[j as usize] as f64;
                    k += 1;
                }
            }
            s / k.max(1) as f64
        })
        .collect()
}

/// The page: the document inlined, and a canvas that draws it. No network, no
/// dependencies; open the file.
pub fn html(doc: &Value) -> String {
    let data = serde_json::to_string(doc).unwrap_or_else(|_| "{}".into()).replace("</", "<\\/");
    PAGE.replace("/*DATA*/null", &data)
}

const PAGE: &str = r##"<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Yames detection replay</title>
<style>
body{font:13px/1.4 system-ui,sans-serif;margin:0;background:#14161a;color:#d8dce3}
header{padding:10px 14px;border-bottom:1px solid #2a2e36}
h1{font-size:15px;margin:0 0 4px}
#scroll{overflow-x:auto;border-bottom:1px solid #2a2e36}
canvas{display:block}
#info{padding:10px 14px;display:flex;gap:28px;flex-wrap:wrap}
table{border-collapse:collapse}td,th{padding:2px 8px;text-align:left;border-bottom:1px solid #2a2e36}
.k{display:inline-block;width:10px;height:10px;margin:0 4px 0 12px;vertical-align:middle}
#tip{position:fixed;pointer-events:none;background:#000c;padding:4px 8px;border-radius:4px;display:none;white-space:pre}
label{margin-right:14px}
</style></head><body>
<header><h1>Yames detection replay</h1><div id="sub"></div>
<div style="margin-top:6px">
<label>zoom <input id="zoom" type="range" min="40" max="600" value="160"></label>
<span class="k" style="background:#3ecf6e"></span>heard
<span class="k" style="background:#e5484d"></span>wrong / not sounded
<span class="k" style="background:#9aa0aa"></span>couldn't tell
<span class="k" style="background:#f5c542"></span>onset the live detector reported (shifted back by its delay)
<span class="k" style="background:#4cc3ff"></span>pitch track
<span class="k" style="background:#c084fc"></span>broadband attack the verifier used
</div></header>
<div id="scroll"><canvas id="c"></canvas></div>
<div id="info"></div><div id="tip"></div>
<script>
const D = /*DATA*/null;
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const wave = new Int8Array(b64(D.wave.minMaxI8).buffer);
const spec = b64(D.spectrogram.u8);
const post = D.posterior ? b64(D.posterior.noteU8) : null;
const flux = D.flux ? b64(D.flux.u8) : null;
const H = {wave: 90, spec: 192, roll: 0, gap: 14};
const P = D.posterior ? D.posterior.pitches : 57, PLO = D.posterior ? D.posterior.midiLow : 36, ROW = 7;
H.roll = P * ROW;
const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const name = m => names[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const col = v => v === "yes" ? "#3ecf6e" : v === "unsure" ? "#9aa0aa" : v ? "#e5484d" : "#6b7280";
const c = document.getElementById("c"), g = c.getContext("2d");
let pps = 160, boxes = [];
function draw() {
  const W = Math.ceil(D.seconds * pps), top2 = H.wave + H.gap, top3 = top2 + H.spec + H.gap, total = top3 + H.roll + 20;
  c.width = W; c.height = total; boxes = [];
  g.fillStyle = "#14161a"; g.fillRect(0, 0, W, total);
  // beats
  const q = 60 / D.bpm;
  if (D.bpm > 0 && D.expected) { g.strokeStyle = "#2a2e36"; for (let t = D.firstBeatMs / 1000; t < D.seconds; t += q) { const x = t * pps; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, total); g.stroke(); } }
  // waveform
  g.fillStyle = "#7d8590";
  for (let x = 0; x < W; x++) { const i = Math.floor(x / pps * D.wave.perSecond), j = Math.max(i + 1, Math.floor((x + 1) / pps * D.wave.perSecond)); let lo = 0, hi = 0;
    for (let k = i; k < j && 2 * k + 1 < wave.length; k++) { lo = Math.min(lo, wave[2 * k]); hi = Math.max(hi, wave[2 * k + 1]); }
    g.fillRect(x, H.wave / 2 - hi / 127 * H.wave / 2, 1, Math.max(1, (hi - lo) / 127 * H.wave / 2)); }
  if (flux) { g.strokeStyle = "#c084fc"; g.beginPath(); for (let i = 0; i < flux.length; i++) { const x = i * D.flux.dt * pps, y = H.wave - flux[i] / 255 * H.wave; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  // live onsets, at the attack they stand for
  g.fillStyle = "#f5c542";
  for (const o of D.onsets) { const x = (o.tMs - D.detectionDelayMs) / 1000 * pps; g.fillRect(x, 0, 1.5, H.wave); }
  // spectrogram
  const img = g.createImageData(W, H.spec), B = D.spectrogram.bands;
  for (let x = 0; x < W; x++) { const f = Math.min(D.spectrogram.frames - 1, Math.floor(x / pps / D.spectrogram.dt));
    for (let y = 0; y < H.spec; y++) { const m = Math.min(B - 1, Math.floor((1 - y / H.spec) * B)), v = spec[f * B + m], o = 4 * (y * W + x);
      img.data[o] = v * v / 255; img.data[o + 1] = v * 0.75; img.data[o + 2] = 60 + v * 0.5; img.data[o + 3] = 255; } }
  g.putImageData(img, 0, top2);
  // piano roll: the model's note posterior
  if (post) { const im = g.createImageData(W, H.roll);
    for (let x = 0; x < W; x++) { const f = Math.min(D.posterior.frames - 1, Math.round(x / pps / D.posterior.dt));
      for (let p = 0; p < P; p++) { const v = post[f * P + p]; for (let r = 0; r < ROW - 1; r++) { const o = 4 * (((P - 1 - p) * ROW + r) * W + x);
        im.data[o] = 20 + v * 0.35; im.data[o + 1] = 22 + v * 0.45; im.data[o + 2] = 26 + v * 0.9; im.data[o + 3] = 255; } } }
    g.putImageData(im, 0, top3); }
  const yOf = m => top3 + (P - 1 - (m - PLO)) * ROW;
  g.fillStyle = "#6b7280"; g.font = "10px system-ui";
  for (let m = PLO; m < PLO + P; m += 12) g.fillText(name(m), 2, yOf(m) + ROW - 1);
  if (D.pitchTrack) { g.fillStyle = "#4cc3ff"; for (const [t, m] of D.pitchTrack.frames) if (m > 0) g.fillRect(t / 1000 * pps, yOf(m) + ROW / 2 - 1, Math.max(1.5, D.pitchTrack.hopMs / 1000 * pps), 2); }
  // written notes with their verdicts
  for (const e of D.expected || []) { const x = e.dueMs / 1000 * pps;
    g.fillStyle = e.state === "hit" ? "#3ecf6e" : e.state === "miss" ? "#e5484d" : "#9aa0aa"; g.fillRect(x - 1, H.wave - 8, 3, 8);
    for (const n of e.notes) { if (n.midi == null) continue; const v = n.verifier, y = yOf(Math.round(n.midi)), w = Math.max(6, (D.gapMs || 120) / 1000 * pps * 0.8);
      g.strokeStyle = col(v && v.heard); g.lineWidth = 2; g.strokeRect(x, y - 1, w, ROW);
      if (v && v.heardMidi != null) { g.fillStyle = "#e5484d"; g.fillRect(x, yOf(v.heardMidi), w, ROW - 1); }
      if (v && v.deviationMs != null) { g.fillStyle = col(v.heard); g.fillRect(x + v.deviationMs / 1000 * pps + (D.verifierLagMs || 0) / 1000 * pps, y - 3, 2, ROW + 4); }
      boxes.push({x, y, w, h: ROW, e, n}); } }
}
const tip = document.getElementById("tip");
c.onmousemove = ev => { const r = c.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
  const b = boxes.find(b => x >= b.x && x <= b.x + b.w && y >= b.y - 2 && y <= b.y + b.h + 2);
  let text = (x / pps).toFixed(3) + " s";
  if (b) { const v = b.n.verifier; text += `\nnote ${b.n.id}  ${name(Math.round(b.n.midi))}  beat ${b.e.beat.toFixed(2)}\nlive detector: ${b.e.state}` + (b.e.deviationMs != null ? ` (${b.e.deviationMs.toFixed(1)} ms)` : "") +
    `\nright-notes pass: ${b.e.pitchPass || "-"}` + (v ? `\nverifier: ${v.heard} via ${v.how}, kind ${v.kind}, strength ${v.strength.toFixed(2)}` + (v.heardMidi != null ? `, heard ${name(v.heardMidi)}` : "") : ""); }
  tip.textContent = text; tip.style.display = "block"; tip.style.left = ev.clientX + 12 + "px"; tip.style.top = ev.clientY + 12 + "px"; };
c.onmouseleave = () => tip.style.display = "none";
document.getElementById("zoom").oninput = e => { pps = +e.target.value; draw(); };
document.getElementById("sub").textContent = `${D.source}  |  ${D.seconds.toFixed(1)} s at ${D.rate} Hz  |  ${D.bpm} BPM  |  ${D.onsets.length} onsets  |  verifier: ${D.verifierStatus}`;
const info = document.getElementById("info");
const tbl = (title, rows) => { const d = document.createElement("div"); d.innerHTML = `<b>${title}</b><table>` + rows.map(r => "<tr>" + r.map(x => `<td>${x}</td>`).join("") + "</tr>").join("") + "</table>"; info.appendChild(d); };
if (D.grade) { const G = D.grade, p = G.pass;
  tbl("Grade", [["verdict", G.verdict + (G.noCatchReason ? " (" + G.noCatchReason + ")" : "")], ["due / heard / missed / extra", `${G.due} / ${G.heard} / ${G.missed} / ${G.extra}`], ["evenness", G.evenness == null ? "-" : G.evenness.toFixed(3)], ["lag", `${G.calibration.offsetMs.toFixed(1)} ms (${G.calibration.source})`], ["pass", p ? p.verdict : "-"], ["not assessed", p ? (p.notAssessed || []).join(", ") : "-"], ["right notes", p && p.notes ? JSON.stringify(p.notes) : "-"]]);
  if (p) tbl("Pass bars", [["metric", "bar", "measured", "held"], ...(p.checks || []).map(k => [k.metric, k.min ?? k.max ?? "", k.measured == null ? "-" : (+k.measured).toFixed(3), k.held])]); }
if (D.verifierKinds && D.verifierKinds.length) tbl("Verifier, by technique", [["kind", "due", "sounded", "not sounded", "wrong", "couldn't tell"], ...D.verifierKinds.map(k => [k.kind, k.due, k.sounded, k.notSounded, k.wrong, k.unsure])]);
tbl("Cost (ms)", Object.entries(D.cost).map(([k, v]) => [k, v.toFixed(1)]));
draw();
</script></body></html>
"##;
