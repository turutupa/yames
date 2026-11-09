/**
 * The review page: one self-contained HTML file per Path, for a person to read,
 * hear and mark. Everything is rendered here, so a page reads with scripts off;
 * only the play-along and the marks need `reviewClient.ts`.
 */
import type { Exercise, PathDoc, PathNote, Step } from "./format";
import { TICKS, barLengthTicks } from "./format";
import { METRICS, NOT_GRADED } from "./metrics";
import { REVIEW_CLIENT } from "./reviewClient";
import { isPicked } from "./tabDsl";
import { SCALE_NAMES_EN } from "../jam/scales";
import type { ScaleId } from "../jam/scales";
import { chordPcs } from "./theory";
import { runtimeNeeds } from "./validate";

const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MODE_LABEL: Record<Exercise["grading"], string> = {
  graded: "Graded",
  landings: "Graded at landings only",
  selfChecked: "Self-checked",
  practiceOnly: "Practice only",
};
const FEEDBACK_LABEL: Record<Exercise["feedback"], string> = {
  afterTake: "Feedback after the take",
  livePerNote: "Live note lights, confirmed after the take",
  livePerBar: "Wants live per-bar feedback",
  none: "No feedback",
};

const metricLabel = (id: string) => METRICS.find((m) => m.id === id)?.label ?? id;

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

const LINE_GAP = 13;
const STAFF_TOP = 46;
const STAFF_HEIGHT = LINE_GAP * 5;
const MIN_NOTE_SPACE = 23;
const PAD = 14;

function strokeMark(pick: "d" | "u", x: number, y: number): string {
  if (pick === "d") {
    return `<path class="stroke" d="M${x - 4} ${y + 6}V${y}H${x + 4}V${y + 6}"/>`;
  }
  return `<path class="stroke" d="M${x - 4} ${y}L${x} ${y + 7}L${x + 4} ${y}"/>`;
}

function barSvg(
  ex: Exercise,
  bar: number,
  notes: PathNote[],
  indexOffset: number,
  options: { chord?: string; guide?: boolean },
): string {
  const barTicks = barLengthTicks(ex.meter);
  const start = bar * barTicks;
  const barNotes = notes
    .map((note, index) => ({ note, index }))
    .filter(({ note }) => note.tick >= start && note.tick < start + barTicks);
  const onsets = new Set(barNotes.map((n) => n.note.tick));
  // Proportional spacing, wide enough that the tightest pair of notes can't touch.
  const smallest = barNotes.reduce((best, { note }, i) => {
    const next = barNotes[i + 1]?.note.tick ?? start + barTicks;
    return Math.min(best, next - note.tick);
  }, barTicks / 4);
  const width = Math.max(
    150,
    Math.round(Math.max(onsets.size * MIN_NOTE_SPACE, (barTicks / smallest) * MIN_NOTE_SPACE) + PAD * 2),
  );
  const inner = width - PAD * 2;
  const xAt = (tick: number) => PAD + ((tick - start) / barTicks) * inner;
  const yAt = (string: number) => STAFF_TOP + (string - 1) * LINE_GAP;
  const parts: string[] = [];

  for (let s = 1; s <= 6; s += 1) {
    parts.push(`<line class="sl" x1="0" x2="${width}" y1="${yAt(s)}" y2="${yAt(s)}"/>`);
  }
  parts.push(`<line class="bl" x1="0" x2="0" y1="${yAt(1)}" y2="${yAt(6)}"/>`);
  parts.push(`<line class="bl" x1="${width}" x2="${width}" y1="${yAt(1)}" y2="${yAt(6)}"/>`);
  parts.push(`<text class="barnum" x="3" y="${STAFF_TOP - 25}">${bar + 1}</text>`);
  if (options.chord) parts.push(`<text class="chord" x="${PAD}" y="12">${esc(options.chord)}</text>`);

  // Beats, under the staff.
  const beats = barTicks / TICKS;
  for (let b = 0; b < beats; b += 1) {
    const x = xAt(start + b * TICKS);
    parts.push(`<line class="beat" x1="${x}" x2="${x}" y1="${yAt(6) + 6}" y2="${yAt(6) + 13}"/>`);
    parts.push(`<text class="beatn" x="${x}" y="${yAt(6) + 24}">${b + 1}</text>`);
  }

  // Rests.
  for (const rest of ex.rests) {
    if (options.guide || rest.tick < start || rest.tick >= start + barTicks) continue;
    const x = xAt(rest.tick);
    const w = (rest.dur / barTicks) * inner;
    parts.push(`<rect class="rest" x="${x + 2}" y="${yAt(1) + 1}" width="${Math.max(2, w - 4)}" height="${STAFF_HEIGHT - 2}" rx="2"/>`);
  }

  const landingTicks = new Map<number, string[]>();
  if (!options.guide) {
    for (const landing of ex.landings ?? []) {
      landingTicks.set(landing.bar * barTicks + landing.beat * TICKS, landing.notes);
    }
  }

  for (const { note, index } of barNotes) {
    const x = xAt(note.tick);
    const y = yAt(note.string);
    const previous = notes[index - 1];
    const label = String(note.fret);
    const halfWidth = label.length > 1 ? 9 : 5.5;
    const marks: string[] = [];
    if (landingTicks.has(note.tick)) {
      marks.push(`<circle class="land" cx="${x}" cy="${y}" r="11"/>`);
    }
    marks.push(`<rect class="kn" x="${x - halfWidth}" y="${y - 7.5}" width="${halfWidth * 2}" height="15" rx="3"/>`);
    marks.push(`<text class="fret" x="${x}" y="${y + 4.5}">${label}</text>`);
    if (note.pick) marks.push(strokeMark(note.pick, x, STAFF_TOP - 16));
    if (note.accent) marks.push(`<text class="acc" x="${x}" y="${STAFF_TOP - 19}">&gt;</text>`);
    if (note.tech.includes("palmMute")) marks.push(`<text class="tag" x="${x}" y="${STAFF_TOP - 4}">PM</text>`);
    if (note.tech.includes("letRing")) marks.push(`<text class="tag" x="${x}" y="${STAFF_TOP - 4}">ring</text>`);
    if (note.tech.includes("vibrato")) marks.push(`<text class="tag vib" x="${x + 12}" y="${y - 4}">~</text>`);
    if (note.tech.includes("bend")) {
      const distance = note.bend === 1 ? "½" : note.bend === 2 ? "full" : `+${note.bend ?? 0}`;
      marks.push(
        `<path class="bendl" d="M${x + 7} ${y}Q${x + 14} ${y} ${x + 14} ${y - 9}"/>`,
        `<text class="tag" x="${x + 15}" y="${y - 11}">${distance}</text>`,
      );
    }
    if (previous && previous.string === note.string) {
      const prevX = xAt(previous.tick);
      if (previous.tick >= start) {
        const mid = (prevX + x) / 2;
        if (note.tech.includes("hammer") || note.tech.includes("pull")) {
          const letter = note.tech.includes("hammer") ? "h" : "p";
          marks.push(`<path class="legato" d="M${prevX + 3} ${y - 8}Q${mid} ${y - 16} ${x - 3} ${y - 8}"/>`);
          marks.push(`<text class="tag" x="${mid}" y="${y - 15}">${letter}</text>`);
        }
        if (previous.tech.includes("slide")) {
          const up = note.fret > previous.fret;
          marks.push(`<line class="slide" x1="${prevX + 7}" y1="${y + (up ? 4 : -4)}" x2="${x - 7}" y2="${y + (up ? -4 : 4)}"/>`);
        }
      }
    }
    const data = options.guide ? "" : ` data-i="${indexOffset + index}"`;
    const picked = isPicked(note, previous) ? "" : " unpicked";
    parts.push(`<g class="n${picked}"${data}>${marks.join("")}</g>`);
  }

  const height = yAt(6) + 30;
  return `<svg class="bar${options.guide ? " guide" : ""}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Bar ${bar + 1}">${parts.join("")}</svg>`;
}

function tabHtml(ex: Exercise): string {
  const rows: string[] = [];
  const bars = Array.from({ length: ex.bars }, (_v, i) => i);
  if (ex.guide?.length) {
    rows.push(`<div class="tab-label">The app plays</div>`);
    rows.push(`<div class="tab">${bars.map((b) => barSvg(ex, b, ex.guide!, 0, { chord: ex.chords?.[b], guide: true })).join("")}</div>`);
    rows.push(`<div class="tab-label">You play</div>`);
  } else if (ex.notesRole === "example") {
    rows.push(`<div class="tab-label">One example. These notes are not a target.</div>`);
  }
  rows.push(`<div class="tab">${bars.map((b) => barSvg(ex, b, ex.notes, 0, { chord: ex.chords?.[b] })).join("")}</div>`);
  return rows.join("");
}

// ---------------------------------------------------------------------------
// Play-along data
// ---------------------------------------------------------------------------

type ClientEvent = {
  t: number;
  dur: number;
  midi: number;
  i?: number;
  accent?: true;
  mute?: true;
  ring?: true;
  bend?: number;
  vibrato?: true;
  level?: number;
};

function clientEvents(notes: readonly PathNote[], numbered: boolean): ClientEvent[] {
  return notes.map((note, index) => {
    const event: ClientEvent = { t: note.tick / TICKS, dur: note.dur / TICKS, midi: note.midi };
    if (numbered) event.i = index;
    if (note.accent) event.accent = true;
    if (note.tech.includes("palmMute")) event.mute = true;
    if (note.tech.includes("letRing")) event.ring = true;
    if (note.bend) event.bend = note.bend;
    if (note.tech.includes("vibrato")) event.vibrato = true;
    if (!isPicked(note, notes[index - 1])) event.level = 0.38;
    return event;
  });
}

/** Soft pads under the notes: root, then the chord, twice a bar. */
function chordEvents(ex: Exercise): ClientEvent[] {
  const out: ClientEvent[] = [];
  const beatsPerBar = barLengthTicks(ex.meter) / TICKS;
  (ex.chords ?? []).forEach((chord, bar) => {
    const pcs = chordPcs(chord);
    const bass = 36 + pcs[0];
    for (const beat of [0, 2]) {
      const t = bar * beatsPerBar + beat;
      out.push({ t, dur: 1.9, midi: bass });
      pcs.slice(1).forEach((pc) => {
        out.push({ t, dur: 1.9, midi: 52 + ((pc + 8) % 12) });
      });
    }
  });
  return out;
}

function clientData(doc: PathDoc): string {
  const data: Record<string, unknown> = {};
  for (const step of doc.steps) {
    for (const ex of step.exercises) {
      data[ex.id] = {
        beatsPerBar: barLengthTicks(ex.meter) / TICKS,
        bars: ex.bars,
        events: clientEvents(ex.notes, true),
        guide: clientEvents(ex.guide ?? [], false),
        chords: chordEvents(ex),
      };
    }
  }
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function passBarText(bar: Exercise["passBars"][number]): string {
  const metric = METRICS.find((m) => m.id === bar.metric);
  const unit = metric?.unit;
  const fmt = (value: number) =>
    unit === "ratio" ? `${Math.round(value * 100)}%` : unit === "perFourBars" ? `${value} per 4 bars` : `${value}`;
  const limit = bar.min !== undefined ? `at least ${fmt(bar.min)}` : `at most ${fmt(bar.max ?? 0)}`;
  return `${esc(metricLabel(bar.metric))} ${limit}, over ${bar.overBars} bars`;
}

function harmonyText(ex: Exercise): string {
  const h = ex.harmony;
  if (!h) return "";
  if (h.kind === "scale" || h.kind === "scaleOverChords") {
    const extra = h.kind === "scaleOverChords" && h.allowed.length ? `, with ${h.allowed.join(", ")} allowed` : "";
    const name = (SCALE_NAMES_EN[h.scale as ScaleId] ?? h.scale).toLowerCase();
    return `${esc(h.root)} ${esc(name)}: ${esc(h.spelled.join(" "))}${extra}`;
  }
  if (h.kind === "arpeggio") return `${esc(h.chord)} arpeggio: ${esc(h.spelled.join(" "))}`;
  return "Each bar plays its chord's own notes";
}

/** The note values an Exercise moves in, in words. */
function rhythmWords(ex: Exercise): string {
  const words: Record<number, string> = {
    160: "sextuplets",
    240: "sixteenths",
    320: "triplets",
    480: "eighths",
    640: "shuffle",
    960: "quarters",
    1920: "half notes",
    3840: "whole notes",
  };
  const seen = new Set(ex.notes.map((n) => n.tick % 960));
  const grid = [...seen].some((t) => t % 320 !== 0 && t % 240 !== 0) ? 160
    : [...seen].some((t) => t % 240 === 0 && t % 480 !== 0) ? 240
    : [...seen].some((t) => t === 640 && ex.notes.some((n) => n.tick % 960 === 320)) ? 320
    : [...seen].includes(640) ? 640
    : [...seen].includes(480) ? 480
    : 0;
  if (grid) return words[grid];
  const shortest = ex.notes.reduce((best, n) => Math.min(best, n.dur), 3840);
  return words[shortest] ?? "mixed";
}

function exerciseCard(ex: Exercise, stepOrder: number, exOrder: number): string {
  const rungs = ex.tempo.rungs
    .map((rung, index) => {
      const pass = rung.bpm === ex.tempo.passAtBpm;
      const classes = ["rung", rung.grading === "selfChecked" ? "self" : "graded", pass ? "pass" : ""]
        .filter(Boolean)
        .join(" ");
      const selected = pass || (ex.tempo.passAtBpm === null && index === 0) ? " sel" : "";
      return `<button type="button" class="${classes}${selected}" data-bpm="${rung.bpm}" title="${rung.grading === "selfChecked" ? "Self-checked rung" : pass ? "Pass rung" : "Graded rung"}">${rung.bpm}</button>`;
    })
    .join("");
  const chips = [
    `<span class="chip mode-${ex.grading}">${MODE_LABEL[ex.grading]}</span>`,
    `<span class="chip">${FEEDBACK_LABEL[ex.feedback]}</span>`,
    ex.pickPlan === "alternate"
      ? `<span class="chip">Alternate, ${ex.crossing === "none" ? "one string" : `${ex.crossing} crossings`}</span>`
      : ex.pickPlan === "sweep"
        ? `<span class="chip">Swept</span>`
        : "",
    `<span class="chip">Rhythm: ${rhythmWords(ex)}</span>`,
    `<span class="chip">Fret ${ex.position.fret}${ex.position.shifts === "allowed" ? ", hand moves" : ""}</span>`,
    `<span class="chip">${ex.backing.kind === "jam" ? `Band: ${esc(ex.backing.grooveId)}${ex.backing.feel === "straight" ? "" : `, ${ex.backing.feel}`}` : "Click"}</span>`,
    `<span class="chip">${ex.bars} bar${ex.bars === 1 ? "" : "s"}${ex.loops ? ", loops" : ""}</span>`,
    ex.holdSeconds ? `<span class="chip">Hold ${ex.holdSeconds} s</span>` : "",
    `<span class="chip">${ex.estimatedMinutes} min</span>`,
  ].join("");
  const harmony = harmonyText(ex);
  const landing = ex.landings?.length
    ? `<p class="line"><b>Graded moments:</b> ${ex.landings
        .map((l) => `bar ${l.bar + 1} on ${esc(l.chord)}: ${esc(l.notes.join(" "))}`)
        .join("; ")}. Circled in the tab.</p>`
    : "";
  const pass = ex.passBars.length
    ? `<p class="line"><b>Pass bar at ${ex.tempo.passAtBpm} BPM:</b> ${ex.passBars.map(passBarText).join("; ")}.</p>`
    : `<p class="line"><b>No metric pass bar.</b> ${ex.grading === "practiceOnly" ? "Nothing to pass." : "The player judges it."}</p>`;
  const self = ex.selfCheck?.length
    ? `<div class="line"><b>Self-check:</b><ul>${ex.selfCheck.map((q) => `<li>${esc(q)}</li>`).join("")}</ul></div>`
    : "";
  const detection = ex.detection.notes.length
    ? `<div class="note-box"><b>Hard to hear:</b><ul>${ex.detection.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>`
    : "";
  const feedbackNote = ex.feedbackNote ? `<p class="line small"><b>Runtime:</b> ${esc(ex.feedbackNote)}</p>` : "";
  const chordsToggle = ex.chords?.length
    ? `<label><input type="checkbox" data-opt="chords" checked> Chords</label>`
    : "";
  return `<article class="ex" id="${esc(ex.id)}" data-ex="${esc(ex.id)}">
  <header><h3><span class="exnum">${stepOrder}.${exOrder}</span> ${esc(ex.title)}</h3><div class="chips">${chips}</div></header>
  <p class="purpose">${esc(ex.purpose)}</p>
  ${harmony ? `<p class="line"><b>Notes:</b> ${harmony}</p>` : ""}
  ${tabHtml(ex)}
  <div class="player">
    <button type="button" class="play" data-act="play">Play</button>
    <div class="rungs" aria-label="Tempo ladder, BPM">${rungs}</div>
    <div class="opts"><label><input type="checkbox" data-opt="click" checked> Click</label>${chordsToggle}<label><input type="checkbox" data-opt="loop" ${ex.loops ? "checked" : ""}> Loop</label></div>
  </div>
  <div class="how"><b>How to play it</b><ul>${ex.howTo.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>
  <p class="coach"><b>Coach:</b> ${esc(ex.coachLine)}</p>
  ${landing}${pass}${self}
  <div class="grades">
    <div><b>Graded</b><ul>${ex.graded.length ? ex.graded.map((g) => `<li>${esc(metricLabel(g))}</li>`).join("") : "<li>Nothing</li>"}</ul></div>
    <div><b>Not graded</b><ul>${ex.notGraded.map((g) => `<li>${esc((NOT_GRADED[g] ?? g).split(":")[0])}</li>`).join("")}</ul></div>
  </div>
  ${detection}${feedbackNote}
  <p class="small dim">${ex.computed.noteCount} notes, tightest gap ${ex.computed.minGapMsAtTop ?? "-"} ms at the top rung, ${ex.computed.handShifts} hand shift${ex.computed.handShifts === 1 ? "" : "s"}, playable by the reach check up to about ${ex.computed.maxPlayableBpm} BPM, difficulty ${ex.computed.difficulty}.</p>
</article>`;
}

function stepSection(step: Step): string {
  const exception = step.difficultyException
    ? `<p class="line small"><b>Easier than the last Step by the metric, on purpose:</b> ${esc(step.difficultyException)}</p>`
    : "";
  return `<section class="step" id="step-${step.order}">
  <h2><span class="stepnum">Step ${step.order}</span> ${esc(step.title)}</h2>
  <p class="goal">${esc(step.goal)}</p>
  <p><b>Why:</b> ${esc(step.why)}</p>
  <div class="how"><b>How to play it</b><ul>${step.howTo.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>
  <p><b>What you will hear:</b> ${esc(step.payoff)}</p>
  <p class="small dim">Difficulty ${step.difficulty} by the stated metric.</p>
  ${exception}
  ${step.exercises.map((ex, i) => exerciseCard(ex, step.order, i + 1)).join("\n")}
</section>`;
}

function reviewSheet(doc: PathDoc): string {
  const box = (id: string, field: string, label: string) =>
    `<td class="c"><label><input type="checkbox" data-mark="${esc(id)}" data-field="${field}" aria-label="${label}"> <span class="ml">${label}</span></label></td>`;
  const rows = doc.steps
    .map((step) => {
      const head = `<tr class="sh"><th colspan="7">Step ${step.order}: ${esc(step.title)}</th></tr>`;
      const lines = step.exercises
        .map((ex, i) => {
          const rungs = ex.tempo.rungs;
          const graded = rungs.filter((r) => r.grading === "graded");
          const tempo = `${rungs[0].bpm}-${rungs[rungs.length - 1].bpm}${ex.tempo.passAtBpm ? `, pass ${ex.tempo.passAtBpm}` : ""}${graded.length && graded.length < rungs.length ? `, graded to ${graded[graded.length - 1].bpm}` : ""}`;
          return `<tr data-mark-row="${esc(ex.id)}"><td class="t"><a href="#${esc(ex.id)}">${step.order}.${i + 1} ${esc(ex.title)}</a><div class="small dim">${MODE_LABEL[ex.grading]}; ${tempo} BPM</div></td>${box(ex.id, "notes", "Notes right")}${box(ex.id, "playable", "Playable at the top")}${box(ex.id, "tempo", "Tempo realistic")}${box(ex.id, "useful", "Worth the time")}<td class="w"><input class="comment" type="text" data-mark="${esc(ex.id)}" data-field="comment" placeholder="Fix or note" aria-label="Comment"></td></tr>`;
        })
        .join("");
      return head + lines;
    })
    .join("");
  const question = (id: string, text: string) =>
    `<label class="q"><span>${esc(text)}</span><input class="comment" type="text" data-mark="path" data-field="${id}"></label>`;
  return `<section class="sheet" id="review-sheet">
  <h2>Review sheet</h2>
  <p class="small">For a teacher to mark. Tick what holds up and write what does not. Marks stay in this browser until you export them. <span id="mark-count"></span> <button type="button" id="export-marks">Export marks</button></p>
  ${question("reviewer", "Reviewer and date")}
  ${question("order", "Is the Step order right for this level?")}
  ${question("level", `Is "${doc.level}" the right level?`)}
  ${question("missing", "What is missing, or should go?")}
  <table>
    <thead><tr><th>Exercise</th><th class="c">Notes right</th><th class="c">Playable</th><th class="c">Tempo real</th><th class="c">Worth it</th><th>Comment</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

const STYLE = `
:root{--ink:#1d2329;--dim:#646f7a;--line:#d7dde3;--paper:#fbfaf7;--card:#fff;--accent:#b4441c;--ok:#1f7a4d;--self:#8a6d1f;--play:#14324a}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1080px;margin:0 auto;padding:0 16px 80px}
.draft{background:#7a1f12;color:#fff;padding:9px 16px;font-weight:600;font-size:14px;text-align:center}
.top h1{font-size:30px;line-height:1.15;margin:20px 0 6px}
.top .meta{color:var(--dim);font-size:14px;margin:0 0 10px}
nav.steps{position:sticky;top:0;z-index:5;background:var(--paper);border-bottom:1px solid var(--line);display:flex;gap:6px;overflow-x:auto;padding:8px 0;margin-bottom:8px;-webkit-overflow-scrolling:touch}
nav.steps a{flex:none;font-size:13px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--ink);text-decoration:none}
details{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin:8px 0}
details summary{cursor:pointer;font-weight:600}
.step{margin-top:32px}.step>h2{font-size:24px;line-height:1.2;margin:0 0 4px}
.stepnum{color:var(--accent);font-weight:700;margin-right:4px}
.goal{font-weight:600;margin:4px 0 10px}
.ex{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:14px 0}
.ex.playing{border-color:var(--play);box-shadow:0 0 0 1px var(--play)}
.ex h3{font-size:18px;margin:0 0 6px;line-height:1.25}
.exnum{color:var(--dim);font-weight:500;font-variant-numeric:tabular-nums;margin-right:2px}
.chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.chip{font-size:12px;line-height:1.2;padding:3px 7px;border-radius:5px;background:#eef1f4;color:#35404b}
.mode-graded{background:#dcefe4;color:#14573a;font-weight:600}.mode-landings{background:#e0e9f7;color:#1d4479;font-weight:600}
.mode-selfChecked{background:#f4ebcf;color:#6a5310;font-weight:600}.mode-practiceOnly{background:#efe6f2;color:#5b2d6b;font-weight:600}
.purpose{margin:0 0 8px}.line{margin:6px 0}.small{font-size:13.5px}.dim{color:var(--dim)}
ul{margin:4px 0;padding-left:20px}li{margin:2px 0}
.tab{display:flex;flex-wrap:wrap;gap:0;margin:8px 0;align-items:flex-start}
.tab-label{font-size:13px;font-weight:600;color:var(--dim);margin-top:8px}
svg.bar{display:block;max-width:100%;height:auto;flex:0 1 auto}
svg .sl{stroke:#aab3bc;stroke-width:1}svg .bl{stroke:#56616c;stroke-width:1.5}
svg .fret{font:600 13.5px ui-monospace,Menlo,Consolas,monospace;text-anchor:middle;fill:var(--ink)}
svg .kn{fill:var(--card)}svg .unpicked .fret{fill:#3e5c76}
svg .chord{font:700 14px system-ui,sans-serif;fill:var(--accent)}
svg .barnum,svg .beatn{font:10px system-ui,sans-serif;fill:#8a949e;text-anchor:start}svg .beatn{text-anchor:middle}
svg .beat{stroke:#8a949e;stroke-width:1}
svg .stroke{fill:none;stroke:var(--ink);stroke-width:1.4}
svg .acc{font:700 14px system-ui,sans-serif;text-anchor:middle;fill:var(--accent)}
svg .tag{font:600 10.5px system-ui,sans-serif;text-anchor:middle;fill:#3e5c76}svg .tag.vib{font-size:15px}
svg .legato,svg .bendl{fill:none;stroke:#3e5c76;stroke-width:1.2}svg .slide{stroke:#3e5c76;stroke-width:1.4}
svg .rest{fill:#e9edf0}
svg .land{fill:#e0e9f7;stroke:#1d4479;stroke-width:1.5}
svg .n.on .kn{fill:#14324a}svg .n.on .fret{fill:#fff}
svg.guide .fret{fill:#7a848d}
.player{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;background:#f3f5f7;border-radius:8px;padding:8px;margin:8px 0}
.play{background:var(--play);color:#fff;border:0;border-radius:6px;padding:8px 18px;font:600 15px system-ui,sans-serif;cursor:pointer;min-height:40px}
.rungs{display:flex;flex-wrap:wrap;gap:3px}
.rung{font:600 12.5px system-ui,sans-serif;font-variant-numeric:tabular-nums;border:1px solid #b9c2ca;background:#fff;color:var(--ink);border-radius:5px;padding:5px 6px;min-width:34px;min-height:32px;cursor:pointer}
.rung.self{border-style:dashed;color:var(--self);background:#fbf7e8}
.rung.pass{border-color:var(--ok);border-width:2px;color:var(--ok)}
.rung.sel{background:var(--play);color:#fff;border-color:var(--play)}
.opts{display:flex;gap:10px;font-size:13.5px}.opts input{vertical-align:-1px}
.how{margin:8px 0}.coach{background:#f6f1ea;border-left:3px solid var(--accent);padding:6px 10px;margin:8px 0;border-radius:0 6px 6px 0}
.grades{display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13.5px;margin:8px 0}
.note-box{background:#fbf3e4;border-radius:6px;padding:6px 10px;font-size:13.5px;margin:8px 0}
.key{font-size:13.5px}.key .rung{cursor:default;pointer-events:none}
.sheet{margin-top:40px}.sheet table{width:100%;border-collapse:collapse;background:var(--card);font-size:14px}
.sheet th,.sheet td{border:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:top}
.sheet th.c,.sheet td.c{text-align:center;width:54px}.sheet thead th{font-size:12px;position:sticky;top:44px;background:#eef1f4;z-index:1}
.sheet .sh th{background:#f3f5f7}.sheet .t a{color:var(--ink)}
.sheet input[type=checkbox]{width:20px;height:20px}.comment{width:100%;min-width:90px;font:inherit;padding:4px 6px;border:1px solid var(--line);border-radius:4px}
.ml{display:none}.q{display:block;margin:6px 0;font-size:14px}.q span{display:block;font-weight:600;margin-bottom:2px}
#export-marks{font:inherit;font-size:13px;padding:3px 9px}
@media (max-width:640px){
  main{padding:0 10px 60px}.top h1{font-size:24px}.ex{padding:10px}
  .grades{grid-template-columns:1fr}
  .sheet thead th{position:static}
  .sheet table,.sheet tbody,.sheet tr{display:block}.sheet thead{display:none}
  .sheet tr{border:1px solid var(--line);margin:6px 0;background:var(--card);padding:4px}
  .sheet .sh{border:0;background:none}.sheet .sh th{display:block;border:0;background:none;padding:6px 0 0}
  .sheet td{display:inline-block;border:0}.sheet td.t{display:block}.sheet td.w{display:block}
  .sheet td.c{width:auto;padding:4px 10px 4px 2px;font-size:12px}.ml{display:inline}
}
@media print{
  .draft{background:none;color:#000;border:1px solid #000}.player,nav.steps,#export-marks{display:none}
  .ex{break-inside:avoid}body{background:#fff}
}
`;

/** The page for a Path. Same pack, same bytes. */
export function renderReviewPage(doc: PathDoc): string {
  const exercises = doc.steps.flatMap((s) => s.exercises);
  const count = (mode: Exercise["grading"]) => exercises.filter((e) => e.grading === mode).length;
  const needs = runtimeNeeds(doc)
    .map((n) => `<li>${esc(metricLabel(n.metric))}: ${n.status}, in ${n.exercises} Exercises</li>`)
    .join("");
  const nav = doc.steps
    .map((s) => `<a href="#step-${s.order}">${s.order}. ${esc(s.title)}</a>`)
    .join("");
  const statusWords =
    doc.review.status === "draft"
      ? "DRAFT. No teacher or guitarist has reviewed this content, and nothing on this page has been tried on a real guitar in the app."
      : `Status: ${doc.review.status}.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.title)}: Path review</title>
<style>${STYLE}</style>
</head>
<body data-path="${esc(doc.id)}">
<div class="draft">${esc(statusWords)}</div>
<main>
<div class="top">
  <h1>${esc(doc.title)}</h1>
  <p class="meta">${doc.kind === "mechanics" ? "Mechanics Path" : "Theory Path"} · ${doc.steps.length} Steps · ${exercises.length} Exercises (${count("graded")} graded, ${count("landings")} at landings, ${count("selfChecked")} self-checked, ${count("practiceOnly")} practice-only) · about ${Math.round(doc.estimatedMinutes / 60)} hours for one pass</p>
  <p><b>Goal:</b> ${esc(doc.goal)}</p>
  <p><b>Assumes (${esc(doc.level)}):</b> ${esc(doc.assumes)}</p>
  <details><summary>Why this order</summary><p>${esc(doc.orderRationale)}</p></details>
  <details><summary>Where grading can and can't be trusted</summary><p>${esc(doc.gradingLimits)}</p></details>
  <details><summary>What the app must build to run this Path</summary><ul>${needs}</ul><p class="small dim">in-report: the number is already in score.rs. exists-unwired: the maths exists and nothing feeds it from an Exercise. new-grader: specified, not built.</p></details>
  <p class="key small"><b>Tempo ladder:</b> <span class="rung pass">pass</span> the rung the pass bars decide at; <span class="rung graded">graded</span> graded; <span class="rung self">self</span> dashed means self-checked. <b>Tab:</b> string 1 on top, first stave line highest. Blue numbers aren't picked (hammer, pull or slide). Marks above the stave are guidance strokes: square is down, V is up. Audio is a synthetic pluck for checking notes, not the app's sound.</p>
</div>
<nav class="steps" aria-label="Steps">${nav}<a href="#review-sheet"><b>Review sheet</b></a></nav>
${doc.steps.map(stepSection).join("\n")}
${reviewSheet(doc)}
</main>
<script type="application/json" id="exercise-data">${clientData(doc)}</script>
<script>${REVIEW_CLIENT}</script>
</body>
</html>
`;
}
