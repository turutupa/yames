/**
 * The validator. It reads a pack as plain JSON and owes nothing to the spec that
 * made it, so a hand-edited file gets the same checks as a generated one. Every
 * rule has an id in `RULES`, and `validate.fixtures.test.ts` proves each one
 * fires on a deliberately broken pack and that a pack without the fault is left
 * alone.
 */
import { GROOVES } from "../jam/grooves";
import { parseChordChart } from "../jam/chart";
import { parseKey, sameChord } from "../jam/harmony";
import { buildSchedule } from "../songs/schedule";
import type { ScaleId } from "../jam/scales";
import { acceptedNotes, poolOf } from "./generate";
import {
  CROSSINGS,
  FEEDBACK_TIMINGS,
  GRADING_MODES,
  PATH_LEVELS,
  PATH_SCHEMA_VERSION,
  PICK_PLANS,
  REVIEW_STATUSES,
  STANDARD_TUNING,
  TECHNIQUES,
  LEVEL_IDS,
  TICKS,
  VARIATION_DIMENSIONS,
  barLengthTicks,
} from "./format";
import type { Exercise, Harmony, PathDoc, PathLevel, PathNote, Step } from "./format";
import {
  crossingsIn,
  gradedGapLimit,
  pickedPairs,
  requiredFlags,
  requiredNotGraded,
  worstCorrectHeard,
} from "./derive";
import { exerciseDifficulty, minGapMs, stepDifficulty } from "./difficulty";
import { bannedClaimsIn } from "./honesty";
import { DETECTION_FLAGS, FORBIDDEN_METRICS, METRICS, METRIC_IDS, NOT_GRADED } from "./metrics";
import { checkReachAt, maxPlayableBpm } from "./reach";
import { exerciseWithVariant } from "./variants";
import { isPicked, NOTATED_TICKS } from "./tabDsl";
import { canSpellScale, chordPcs, parseChord, pcOfName, scaleIsKnown, scalePcs, spellChord, spellScale } from "./theory";
import { exerciseScore } from "./toScore";

/** Every rule the validator knows. A rule with no fixture fails the test suite. */
export const RULES = {
  "schema.version": "schemaVersion must be the version this code speaks",
  "schema.shape": "a required field is missing or the wrong type",
  "schema.enum": "a value is not in its controlled list",
  "schema.todo": "a TODO left in the text by the scaffold",
  "schema.duplicateId": "two Steps or two Exercises share an id",
  "schema.computedStale": "the computed block does not match the notes",
  "tab.string": "string out of range",
  "tab.fret": "fret out of range",
  "tab.midi": "the tab and the MIDI disagree",
  "tab.value": "a note value that cannot be notated",
  "tab.barFill": "the notes and rests do not fill the bars exactly",
  "tab.barline": "a note crosses a bar line",
  "tab.bend": "a bend must carry both the technique and a distance",
  "loop.firstNote": "a looping Exercise should start on its first beat",
  "loop.seamLeap": "the leap from the last note back to the first is not musical",
  "loop.seamRepeat": "the last note and the first are the same note, back to back",
  "loop.seamPick": "the loop breaks alternation: the first stroke flips on the second pass",
  "reach.position": "the first note is not under the hand at the declared position",
  "reach.stretch": "frets that do not fit under one hand",
  "reach.legato": "a hammer-on or pull-off across a position shift",
  "reach.shiftTime": "a position shift that does not fit in the time at the top rung",
  "reach.seam": "the jump back to the first note does not fit in the time at the top rung",
  "pick.alternate": "the marks do not alternate",
  "pick.sweep": "the marks do not sweep with the strings",
  "pick.legatoMarked": "a hammer-on or pull-off has a stroke on it",
  "pick.freeMarked": "a free pick plan prints strokes",
  "pick.crossing": "the declared crossing is not what the strokes produce",
  "music.unknownScale": "a scale the theory data does not have",
  "music.scaleTone": "a note outside the declared scale",
  "music.scaleCover": "the tab does not play every note of the scale",
  "music.chordSymbol": "a chord symbol the app cannot read",
  "music.chordTone": "a note that is not in its chord",
  "music.chordCover": "the tab does not play every note of the chord",
  "music.downbeat": "a written line whose downbeat misses its chord",
  "music.spelling": "the spelled notes are wrong",
  "music.landing": "a landing that does not agree with its chord",
  "music.landingExample": "the example does not obey its own landing",
  "backing.groove": "a groove the Jam band does not have",
  "backing.key": "a key the Jam band cannot read",
  "backing.chart": "the chart does not parse to the same chords",
  "backing.meter": "the groove and the Exercise are in different meters",
  "backing.feel": "straight eighths written over a shuffle or swing band",
  "ladder.rising": "the ladder must rise",
  "ladder.jump": "a rung more than 25% above the last one",
  "ladder.range": "a tempo outside 30 to 300 BPM",
  "ladder.passAt": "the pass tempo is not a graded rung",
  "ladder.gradedAbove": "a graded rung above a self-checked rung",
  "ladder.trust": "a graded rung faster than grading can be trusted",
  "progress.stepOrder": "Step order must run 1, 2, 3 ...",
  "progress.difficulty": "a Step easier than the last by the stated metric, with no exception",
  "progress.difficultyValue": "the stored Step difficulty is not the median of its Exercises",
  "progress.prereqMissing": "a prerequisite that does not exist",
  "progress.prereqForward": "a prerequisite that comes later",
  "progress.cycle": "prerequisites that form a cycle",
  "progress.exerciseCount": "a Step needs 3 to 5 Exercises",
  "progress.why": "a Step or Exercise without a real why",
  "progress.howTo": "a Step or Exercise without how-to-play text",
  "progress.payoff": "a Step without an audible payoff",
  "progress.noPassBar": "a Step with no Exercise that has a measurable or self-checked bar",
  "progress.minutes": "estimated minutes that do not add up",
  "honesty.banned": "a banned claim in the text",
  "honesty.metric": "a metric that is not in the controlled list",
  "honesty.passNotGraded": "a pass bar on a metric the Exercise does not declare graded",
  "honesty.notGradedId": "a not-graded id that is not in the controlled list",
  "honesty.notGradedRequired": "the not-graded list leaves out something this Exercise cannot grade",
  "honesty.overlap": "the same thing listed as graded and not graded",
  "honesty.slideBar": "a notes-heard bar a correct take would fail if its slid-to notes go unheard",
  "honesty.flag": "a detection flag is missing, unknown, or has no sentence",
  "honesty.modeShape": "the grading mode and the rest of the Exercise disagree",
  "honesty.selfCheck": "a self-checked rung with no question for the player to answer",
  "honesty.feedback": "feedback that promises more than the grading mode allows",
  "honesty.reviewStatus": "a status past draft with no record of who reviewed it",
  "runtime.schedule": "the Exercise does not produce a usable schedule for score.rs",
  "level.missing": "a Path with no Levels",
  "level.order": "Levels must be beginner, intermediate and advanced, in that order",
  "level.steps": "every Step belongs to exactly one Level, in the Path's order",
  "level.entry": "a Level that is not open: a player may start anywhere",
  "level.placement": "a placement note a player can't check, or that won't fit on a screen",
  "level.warmup": "a Level with no warm-up",
  "variation.shape": "a variation that is not well formed",
  "variation.declared": "a varying dimension not declared as pooled or not pooled",
  "variation.duplicate": "two variants with the same notes",
  "variation.base": "the Exercise's own notes are not its first variant",
  "variation.pool": "a variant in the wrong pool for its values",
  "variation.pooledDifficulty": "a pool whose variants differ too much in difficulty to share progress",
  "warmup.variants": "a warm-up with too few variants",
  "warmup.moves": "a warm-up variant that stays in one place",
  "warmup.short": "a warm-up that is too long",
  "warmup.musical": "a warm-up with no declared harmony",
  "warmup.tempo": "a warm-up that doesn't start comfortably below the clean tempo",
  "warmup.reference": "a warm-up whose reference Exercise is missing or on another note grid",
  "warmup.progress": "a warm-up that advances progress",
  "warmup.placement": "a warm-up outside a Level, or an Exercise in a Level's warm-ups that isn't one",
  "chain.changes": "a chain with no chord changes",
  "chain.harmony": "a chain whose bars aren't checked against their chords",
  "chain.continuous": "a chain that stops at a bar line",
  "chain.joint": "a link that jumps instead of connecting",
} as const;

export type RuleId = keyof typeof RULES;

export type Issue = {
  rule: RuleId;
  /** Warnings are for a person to look at; only errors fail the build. */
  severity: "error" | "warning";
  where: string;
  message: string;
};

type Report = (rule: RuleId, where: string, message: string, severity?: Issue["severity"]) => void;

const barBeat = (tick: number, barTicks: number) =>
  `bar ${Math.floor(tick / barTicks) + 1}, beat ${(tick % barTicks) / 960 + 1}`;

const soundingPc = (n: PathNote) => (n.midi + (n.bend ?? 0)) % 12;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkShape(doc: unknown, report: Report): doc is PathDoc {
  let ok = true;
  const bad = (where: string, message: string) => {
    report("schema.shape", where, message);
    ok = false;
  };
  if (!isObject(doc)) {
    bad("path", "the pack is not an object");
    return false;
  }
  if (doc.schemaVersion !== PATH_SCHEMA_VERSION) {
    report("schema.version", "path", `schemaVersion is ${String(doc.schemaVersion)}, this code reads ${PATH_SCHEMA_VERSION}`);
    return false;
  }
  for (const key of ["id", "title", "kind", "goal", "level", "assumes", "orderRationale", "gradingLimits"]) {
    if (typeof doc[key] !== "string" || !(doc[key] as string).trim()) bad(`path.${key}`, "required text is missing");
  }
  if (!isObject(doc.review) || !Array.isArray(doc.review.history)) bad("path.review", "review is required");
  if (!isObject(doc.prerequisites)) bad("path.prerequisites", "prerequisites are required");
  if (!Array.isArray(doc.tuning)) bad("path.tuning", "tuning is required");
  if (typeof doc.estimatedMinutes !== "number") bad("path.estimatedMinutes", "required");
  if (!Array.isArray(doc.steps) || doc.steps.length === 0) {
    bad("path.steps", "a Path needs Steps");
    return false;
  }
  for (const [si, step] of (doc.steps as unknown[]).entries()) {
    const at = `step ${si + 1}`;
    if (!isObject(step)) {
      bad(at, "not an object");
      continue;
    }
    for (const key of ["id", "title", "goal"]) {
      if (typeof step[key] !== "string" || !(step[key] as string).trim()) bad(`${at}.${key}`, "required text is missing");
    }
    if (typeof step.why !== "string") bad(`${at}.why`, "required");
    if (typeof step.payoff !== "string") bad(`${at}.payoff`, "required");
    if (!Array.isArray(step.howTo)) bad(`${at}.howTo`, "required");
    if (!Array.isArray(step.prerequisites)) bad(`${at}.prerequisites`, "required");
    if (!Array.isArray(step.exercises)) {
      bad(`${at}.exercises`, "required");
      continue;
    }
    for (const [ei, ex] of (step.exercises as unknown[]).entries()) {
      const eat = `${at} exercise ${ei + 1}`;
      if (!isObject(ex)) {
        bad(eat, "not an object");
        continue;
      }
      for (const key of ["id", "title", "purpose", "coachLine", "grading", "feedback", "pickPlan", "crossing", "notesRole", "tab"]) {
        if (typeof ex[key] !== "string") bad(`${eat}.${key}`, "required");
      }
      for (const key of ["howTo", "notes", "rests", "passBars", "graded", "notGraded"]) {
        if (!Array.isArray(ex[key])) bad(`${eat}.${key}`, "required list");
      }
      for (const key of ["bars", "estimatedMinutes"]) {
        if (typeof ex[key] !== "number") bad(`${eat}.${key}`, "required number");
      }
      for (const key of ["meter", "position", "tempo", "detection", "backing", "computed"]) {
        if (!isObject(ex[key])) bad(`${eat}.${key}`, "required object");
      }
      if (typeof ex.loops !== "boolean") bad(`${eat}.loops`, "required boolean");
      if (isObject(ex.tempo) && !Array.isArray(ex.tempo.rungs)) bad(`${eat}.tempo.rungs`, "required list");
      if (isObject(ex.detection) && (!Array.isArray(ex.detection.flags) || !Array.isArray(ex.detection.notes))) {
        bad(`${eat}.detection`, "flags and notes are required");
      }
      if (Array.isArray(ex.notes)) {
        for (const [ni, note] of (ex.notes as unknown[]).entries()) {
          if (!isObject(note)) {
            bad(`${eat} note ${ni + 1}`, "not an object");
            continue;
          }
          for (const key of ["string", "fret", "midi", "tick", "dur"]) {
            if (typeof note[key] !== "number") bad(`${eat} note ${ni + 1}.${key}`, "required number");
          }
          if (!Array.isArray(note.tech)) bad(`${eat} note ${ni + 1}.tech`, "required list");
        }
      }
    }
  }
  return ok;
}

function checkEnums(doc: PathDoc, report: Report) {
  const inList = (value: string, list: readonly string[], where: string) => {
    if (!list.includes(value)) report("schema.enum", where, `"${value}" is not one of: ${list.join(", ")}`);
  };
  inList(doc.kind, ["mechanics", "theory"], "path.kind");
  inList(doc.level, PATH_LEVELS, "path.level");
  inList(doc.review.status, REVIEW_STATUSES, "path.review.status");
  for (const step of doc.steps) {
    for (const ex of step.exercises) {
      inList(ex.grading, GRADING_MODES, `${ex.id}.grading`);
      inList(ex.feedback, FEEDBACK_TIMINGS, `${ex.id}.feedback`);
      inList(ex.pickPlan, PICK_PLANS, `${ex.id}.pickPlan`);
      inList(ex.crossing, CROSSINGS, `${ex.id}.crossing`);
      inList(ex.notesRole, ["target", "example"], `${ex.id}.notesRole`);
      inList(ex.position.shifts, ["none", "allowed"], `${ex.id}.position.shifts`);
      for (const note of ex.notes) {
        for (const tech of note.tech) inList(tech, TECHNIQUES, `${ex.id} note`);
      }
    }
  }
}

function checkIds(doc: PathDoc, report: Report) {
  const seen = new Set<string>();
  for (const step of doc.steps) {
    if (seen.has(step.id)) report("schema.duplicateId", step.id, "Step id used twice");
    seen.add(step.id);
    for (const ex of step.exercises) {
      if (seen.has(ex.id)) report("schema.duplicateId", ex.id, "Exercise id used twice");
      seen.add(ex.id);
    }
  }
}

function checkTab(doc: PathDoc, ex: Exercise, report: Report) {
  const barTicks = barLengthTicks(ex.meter);
  const total = barTicks * ex.bars;
  const tuning = doc.tuning.length ? doc.tuning : [...STANDARD_TUNING];
  const voices: Array<{ tick: number; dur: number }> = [];
  ex.notes.forEach((note, index) => {
    const at = `${ex.id} note ${index + 1} (${barBeat(note.tick, barTicks)})`;
    if (!Number.isInteger(note.string) || note.string < 1 || note.string > tuning.length) {
      report("tab.string", at, `string ${note.string} is not on a ${tuning.length}-string guitar`);
      return;
    }
    if (!Number.isInteger(note.fret) || note.fret < 0 || note.fret > 22) {
      report("tab.fret", at, `fret ${note.fret} is outside 0 to 22`);
      return;
    }
    const expected = tuning[note.string - 1] + note.fret;
    if (note.midi !== expected) {
      report("tab.midi", at, `tab says string ${note.string} fret ${note.fret} (MIDI ${expected}), the note says ${note.midi}`);
    }
    if (!NOTATED_TICKS.includes(note.dur)) {
      report("tab.value", at, `${note.dur} ticks is not a note value`);
    }
    if (Math.floor(note.tick / barTicks) !== Math.floor((note.tick + note.dur - 1) / barTicks)) {
      report("tab.barline", at, `the note runs over the bar line; split it or shorten it`);
    }
    if (note.tech.includes("bend") !== (note.bend !== undefined && note.bend > 0)) {
      report("tab.bend", at, "a bend needs the bend technique and a distance in semitones");
    }
  });
  for (const rest of ex.rests) {
    if (!NOTATED_TICKS.includes(rest.dur)) {
      report("tab.value", `${ex.id} (${barBeat(rest.tick, barTicks)})`, `a rest of ${rest.dur} ticks is not a note value`);
    }
  }
  // One voice: note and rest spans laid end to end must cover the bars exactly.
  const onsets = new Map<number, number>();
  for (const note of ex.notes) onsets.set(note.tick, Math.max(onsets.get(note.tick) ?? 0, note.dur));
  for (const [tick, dur] of onsets) voices.push({ tick, dur });
  for (const rest of ex.rests) voices.push(rest);
  voices.sort((a, b) => a.tick - b.tick);
  let cursor = 0;
  for (const span of voices) {
    if (span.tick !== cursor) {
      report(
        "tab.barFill",
        `${ex.id} (${barBeat(span.tick, barTicks)})`,
        span.tick > cursor
          ? `${span.tick - cursor} ticks unaccounted for before this note`
          : `this overlaps the previous note by ${cursor - span.tick} ticks`,
      );
      return;
    }
    cursor += span.dur;
  }
  if (cursor !== total) {
    report("tab.barFill", ex.id, `the bars need ${total} ticks and the notes and rests come to ${cursor}`);
  }
}

function checkLoop(ex: Exercise, report: Report) {
  if (!ex.loops || ex.notes.length === 0) return;
  const barTicks = barLengthTicks(ex.meter);
  const first = ex.notes[0];
  const last = ex.notes[ex.notes.length - 1];
  if (first.tick !== 0 && !ex.guide) {
    report("loop.firstNote", ex.id, `the first note is at ${barBeat(first.tick, barTicks)}; start on beat 1 or carry a guide`);
  }
  const leap = Math.abs(last.midi + (last.bend ?? 0) - first.midi);
  if (leap > 24) {
    report("loop.seamLeap", ex.id, `from the last note to the first is ${leap} semitones`);
  }
  const trailing = ex.rests
    .filter((r) => r.tick >= last.tick + last.dur)
    .reduce((sum, r) => sum + r.dur, 0);
  const before = ex.notes[ex.notes.length - 2];
  const repeatsAnyway = before && before.string === last.string && before.fret === last.fret;
  const ringsOut = last.dur >= 1920;
  if (trailing === 0 && last.string === first.string && last.fret === first.fret && !last.bend && !repeatsAnyway && !ringsOut) {
    report("loop.seamRepeat", ex.id, `the last note and the first are both ${first.string}:${first.fret}`, "warning");
  }
}

function checkReach(level: PathLevel, ex: Exercise, report: Report) {
  const rungs = ex.tempo.rungs;
  if (rungs.length === 0) return;
  const top = rungs[rungs.length - 1].bpm;
  const atLevel = (bpm: number) => checkReachAt(ex, level, bpm);
  const result = atLevel(top);
  if (!result.failure) return;
  const fails = result.failure;
  const best = maxPlayableBpm(ex, level);
  const hint = best > 0 ? ` The fastest this can be fingered is about ${best} BPM.` : "";
  const at = `${ex.id} (top rung ${top} BPM)`;
  const rule = ({
    position: "reach.position",
    stretch: "reach.stretch",
    legato: "reach.legato",
    shiftTime: "reach.shiftTime",
    seam: "reach.seam",
  } as const)[fails.kind];
  report(rule, at, `${fails.message}.${hint}`);
}

function checkPicks(ex: Exercise, report: Report) {
  ex.notes.forEach((note, index) => {
    if (!isPicked(note, ex.notes[index - 1]) && note.pick) {
      report("pick.legatoMarked", `${ex.id} note ${index + 1}`, "this note is hammered, pulled or slid to, and carries a stroke");
    }
  });
  if (ex.pickPlan === "free") {
    if (ex.notes.some((n) => n.pick)) report("pick.freeMarked", ex.id, "pick plan is free, so no strokes should be printed");
    if (ex.crossing !== "none") report("pick.crossing", ex.id, "a free pick plan has no declared crossing");
    return;
  }
  const pairs = pickedPairs(ex);
  if (ex.pickPlan === "alternate") {
    for (const { a, b, seam } of pairs) {
      if (!a.pick || !b.pick || a.pick !== b.pick) continue;
      if (seam) {
        if (!ex.pickFlipsOnLoop) {
          report(
            "loop.seamPick",
            ex.id,
            "an odd number of strokes: the first note flips on the second pass. Change the count or declare pickFlipsOnLoop and teach it",
          );
        }
      } else {
        report("pick.alternate", `${ex.id} (tick ${b.tick})`, `two ${a.pick === "d" ? "down" : "up"}strokes in a row in an alternate plan`);
      }
    }
    const actual = crossingsIn(pairs.filter((p) => !p.seam || !ex.pickFlipsOnLoop));
    if (actual !== ex.crossing) {
      report("pick.crossing", ex.id, `declared "${ex.crossing}", the strokes produce "${actual}"`);
    }
  }
  if (ex.pickPlan === "sweep") {
    for (const { a, b, seam } of pairs) {
      if (seam || a.string === b.string || !b.pick) continue;
      const wanted = b.string < a.string ? "d" : "u";
      if (b.pick !== wanted) {
        report("pick.sweep", `${ex.id} (tick ${b.tick})`, `crossing from string ${a.string} to ${b.string} wants a ${wanted === "d" ? "down" : "up"}stroke`);
      }
    }
    if (ex.crossing !== "none") report("pick.crossing", ex.id, "a sweep plan has no declared crossing");
  }
}

function checkHarmony(ex: Exercise, h: Harmony, report: Report) {
  const barTicks = barLengthTicks(ex.meter);
  const players = ex.notes;
  if (h.kind === "scale" || h.kind === "scaleOverChords") {
    if (!scaleIsKnown(h.scale)) {
      report("music.unknownScale", ex.id, `no scale called ${h.scale} in src/jam/scales.ts`);
      return;
    }
    const scale = h.scale as ScaleId;
    const pcs = new Set(scalePcs(h.root, scale));
    const allowed = h.kind === "scaleOverChords" ? h.allowed.map(pcOfName) : [];
    for (const n of players) {
      const pc = soundingPc(n);
      if (!pcs.has(pc) && !allowed.includes(pc)) {
        report("music.scaleTone", `${ex.id} (${barBeat(n.tick, barTicks)})`, `string ${n.string} fret ${n.fret} is outside ${h.root} ${h.scale}`);
      }
    }
    if (h.kind === "scale" && h.cover) {
      const played = new Set(players.map(soundingPc));
      for (const pc of pcs) {
        if (!played.has(pc)) report("music.scaleCover", ex.id, `pitch class ${pc} of ${h.root} ${h.scale} is never played`);
      }
    }
    if (canSpellScale(scale)) {
      const wanted = spellScale(h.root, scale).join(" ");
      if (h.spelled.join(" ") !== wanted) {
        report("music.spelling", ex.id, `${h.root} ${h.scale} is spelled ${wanted}, the pack says ${h.spelled.join(" ")}`);
      }
    }
  }
  if (h.kind === "arpeggio") {
    const chord = parseChord(h.chord);
    if (!chord) {
      report("music.chordSymbol", ex.id, `the app cannot read "${h.chord}"`);
      return;
    }
    const pcs = new Set(chordPcs(h.chord));
    for (const n of players) {
      if (!pcs.has(soundingPc(n))) {
        report("music.chordTone", `${ex.id} (${barBeat(n.tick, barTicks)})`, `string ${n.string} fret ${n.fret} is not in ${h.chord}`);
      }
    }
    if (h.cover) {
      const played = new Set(players.map(soundingPc));
      for (const pc of pcs) {
        if (!played.has(pc)) report("music.chordCover", ex.id, `pitch class ${pc} of ${h.chord} is never played`);
      }
    }
    const wanted = spellChord(h.chord).join(" ");
    if (h.spelled.join(" ") !== wanted) {
      report("music.spelling", ex.id, `${h.chord} is spelled ${wanted}, the pack says ${h.spelled.join(" ")}`);
    }
  }
  if (h.kind === "chordTones") {
    if (!ex.chords) {
      report("music.chordTone", ex.id, "chordTones harmony with no chords");
      return;
    }
    for (const n of players) {
      const chord = ex.chords[Math.floor(n.tick / barTicks)];
      if (!chord) continue;
      if (!chordPcs(chord).includes(soundingPc(n))) {
        report("music.chordTone", `${ex.id} (${barBeat(n.tick, barTicks)})`, `string ${n.string} fret ${n.fret} is not in ${chord}`);
      }
    }
  }
  if (h.kind === "scaleOverChords") {
    if (!ex.chords) {
      report("music.downbeat", ex.id, "a line over chords with no chords");
      return;
    }
    ex.chords.forEach((chord, bar) => {
      const down = players.find((n) => n.tick === bar * barTicks);
      if (down && !chordPcs(chord).includes(soundingPc(down))) {
        report("music.downbeat", `${ex.id} (bar ${bar + 1})`, `the downbeat is string ${down.string} fret ${down.fret}, not a tone of ${chord}`);
      }
    });
  }
}

function checkChords(ex: Exercise, report: Report) {
  if (!ex.chords) return;
  for (const chord of ex.chords) {
    if (!parseChord(chord)) report("music.chordSymbol", ex.id, `the app cannot read "${chord}"`);
  }
  if (ex.chords.length !== ex.bars) {
    report("music.chordSymbol", ex.id, `${ex.chords.length} chords over ${ex.bars} bars`);
  }
}

function checkBacking(ex: Exercise, report: Report) {
  if (ex.backing.kind !== "jam") return;
  const { grooveId, key, chart, feel } = ex.backing;
  if (feel !== "straight") {
    const straight = ex.notes.find((n) => n.tick % TICKS === TICKS / 2);
    if (straight) {
      report("backing.feel", `${ex.id} (tick ${straight.tick})`, `a straight eighth over a ${feel} band: the player will swing it and read as late. Use swing() in the spec`);
    }
  }
  const groove = GROOVES.find((g) => g.id === grooveId);
  if (!groove) report("backing.groove", ex.id, `the Jam band has no groove "${grooveId}"`);
  else if (groove.beatsPerBar !== ex.meter.numerator) {
    report("backing.meter", ex.id, `${grooveId} is in ${groove.beatsPerBar}, the Exercise in ${ex.meter.numerator}`);
  }
  if (!parseKey(key)) report("backing.key", ex.id, `Jam cannot read the key "${key}"`);
  const parsed = parseChordChart(chart);
  const chords = ex.chords ?? [];
  const same =
    parsed.warnings.length === 0 &&
    parsed.bars.length === chords.length &&
    parsed.bars.every((bar, i) => {
      const want = parseChord(chords[i] ?? "");
      return !!bar && !!want && sameChord(bar, want);
    });
  if (!same) report("backing.chart", ex.id, `Jam reads "${chart}" as something other than the Exercise's chords`);
}

function checkLandings(ex: Exercise, report: Report) {
  const barTicks = barLengthTicks(ex.meter);
  for (const landing of ex.landings ?? []) {
    const at = `${ex.id} (bar ${landing.bar + 1})`;
    const chord = ex.chords?.[landing.bar];
    if (chord !== landing.chord) {
      report("music.landing", at, `the landing says ${landing.chord}, the bar says ${chord ?? "nothing"}`);
      continue;
    }
    const wanted = acceptedNotes(landing.chord, landing.accept).join(" ");
    if (landing.notes.join(" ") !== wanted) {
      report("music.landing", at, `${landing.accept} of ${landing.chord} is ${wanted}, the pack says ${landing.notes.join(" ")}`);
      continue;
    }
    if (ex.notes.length === 0) continue;
    const tick = landing.bar * barTicks + landing.beat * 960;
    const pcs = landing.notes.map(pcOfName);
    const hit = ex.notes.find((n) => n.tick === tick);
    if (!hit || !pcs.includes(soundingPc(hit))) {
      report("music.landingExample", at, `the example should land on ${landing.notes.join(" or ")}${hit ? `, and plays string ${hit.string} fret ${hit.fret}` : ", and has no note there"}`);
    }
  }
}

function checkLadder(ex: Exercise, report: Report) {
  const rungs = ex.tempo.rungs;
  for (let i = 0; i < rungs.length; i += 1) {
    const rung = rungs[i];
    if (rung.bpm < 30 || rung.bpm > 300) report("ladder.range", ex.id, `${rung.bpm} BPM`);
    if (i === 0) continue;
    const prev = rungs[i - 1];
    if (rung.bpm <= prev.bpm) report("ladder.rising", ex.id, `${prev.bpm} then ${rung.bpm}`);
    else if (rung.bpm > prev.bpm * 1.25) report("ladder.jump", ex.id, `${prev.bpm} to ${rung.bpm} is more than 25%`);
    if (prev.grading === "selfChecked" && rung.grading === "graded") {
      report("ladder.gradedAbove", ex.id, `${rung.bpm} is graded, and the slower ${prev.bpm} is self-checked`);
    }
  }
  const pass = ex.tempo.passAtBpm;
  if (pass !== null) {
    const rung = rungs.find((r) => r.bpm === pass);
    if (!rung) report("ladder.passAt", ex.id, `${pass} BPM is not on the ladder`);
    else if (rung.grading !== "graded") report("ladder.passAt", ex.id, `${pass} BPM is a self-checked rung`);
  }
  if (ex.notesRole === "target") {
    const limit = gradedGapLimit(ex.pickPlan);
    for (const rung of rungs) {
      if (rung.grading !== "graded") continue;
      const gap = minGapMs(ex.notes, rung.bpm);
      if (gap !== null && gap < limit) {
        report("ladder.trust", ex.id, `${rung.bpm} BPM puts ${gap} ms between notes; ${ex.pickPlan} playing may be graded down to ${limit} ms. Make this rung self-checked`);
      }
    }
  }
}

function checkHonesty(ex: Exercise, report: Report) {
  for (const id of ex.graded) {
    if (!METRIC_IDS.includes(id)) {
      const why = FORBIDDEN_METRICS[id];
      report("honesty.metric", ex.id, `"${id}" is not a controlled metric${why ? `: ${why}` : ""}`);
    }
  }
  for (const bar of ex.passBars) {
    if (!METRIC_IDS.includes(bar.metric)) {
      const why = FORBIDDEN_METRICS[bar.metric];
      report("honesty.metric", ex.id, `pass bar on "${bar.metric}": not a controlled metric${why ? `. ${why}` : ""}`);
    } else if (!ex.graded.includes(bar.metric)) {
      report("honesty.passNotGraded", ex.id, `a pass bar uses ${bar.metric}, which is not in the graded list`);
    }
  }
  for (const id of ex.notGraded) {
    if (!(id in NOT_GRADED)) report("honesty.notGradedId", ex.id, `"${id}" is not in the not-graded list`);
    if (ex.graded.includes(id)) report("honesty.overlap", ex.id, `${id} is listed as both`);
  }
  for (const needed of requiredNotGraded(ex)) {
    if (!ex.notGraded.includes(needed)) {
      report("honesty.notGradedRequired", ex.id, `must say "${needed}" is not graded`);
    }
  }
  const heardBar = ex.passBars.find((b) => b.metric === "notesHeard");
  const worstCorrect = worstCorrectHeard(ex.notes);
  if (heardBar?.min !== undefined && heardBar.min > worstCorrect) {
    report("honesty.slideBar", ex.id, `the bar asks for ${heardBar.min}, and a correct take with unheard slides reaches ${worstCorrect.toFixed(2)}`);
  }
  const required = requiredFlags(ex);
  for (const flag of required) {
    if (!ex.detection.flags.includes(flag)) report("honesty.flag", ex.id, `the content needs the "${flag}" flag`);
  }
  for (const flag of ex.detection.flags) {
    if (!(flag in DETECTION_FLAGS)) report("honesty.flag", ex.id, `unknown flag "${flag}"`);
  }
  if (ex.detection.notes.length !== ex.detection.flags.length || ex.detection.notes.some((n) => !n.trim())) {
    report("honesty.flag", ex.id, "every flag needs its sentence");
  }

  const mode = ex.grading;
  const pass = ex.tempo.passAtBpm;
  if (mode === "graded" || mode === "landings") {
    if (ex.passBars.length === 0) report("honesty.modeShape", ex.id, `${mode} with no pass bars`);
    if (pass === null) report("honesty.modeShape", ex.id, `${mode} with no pass tempo`);
  }
  if (mode === "graded" && ex.notesRole === "example") {
    const free = ["notesHeard", "scaleMembership", "restsKept"];
    for (const bar of ex.passBars) {
      if (!free.includes(bar.metric)) {
        report("honesty.modeShape", ex.id, `the notes are only an example, so ${bar.metric} cannot be the bar`);
      }
    }
  }
  if (mode === "landings" && (ex.landings?.length ?? 0) === 0) {
    report("honesty.modeShape", ex.id, "a landings Exercise with no landings");
  }
  if (mode === "selfChecked" || mode === "practiceOnly") {
    if (ex.passBars.length > 0) report("honesty.modeShape", ex.id, `${mode} with a metric pass bar`);
    if (pass !== null) report("honesty.modeShape", ex.id, `${mode} with a pass tempo`);
    if (ex.graded.length > 0) report("honesty.modeShape", ex.id, `${mode} that declares graded metrics`);
    if (ex.tempo.rungs.some((r) => r.grading === "graded")) {
      report("honesty.modeShape", ex.id, `${mode} with a graded rung`);
    }
  }
  if ((mode === "selfChecked" || ex.tempo.rungs.some((r) => r.grading === "selfChecked" && mode !== "practiceOnly")) && !(ex.selfCheck?.length)) {
    report("honesty.selfCheck", ex.id, "a self-checked rung needs at least one question");
  }
  if ((mode === "selfChecked" || mode === "practiceOnly") && ex.feedback !== "none") {
    report("honesty.feedback", ex.id, `${mode} cannot promise ${ex.feedback} feedback`);
  }
  if (ex.graded.includes("noteIdentity") && ex.feedback === "livePerNote") {
    report("honesty.feedback", ex.id, "pitch comes after the take, so right notes cannot be per-note live");
  }

  const texts: Array<[string, string, boolean]> = [
    ["purpose", ex.purpose, false],
    ["coachLine", ex.coachLine, true],
    ...ex.howTo.map((t, i): [string, string, boolean] => [`howTo ${i + 1}`, t, false]),
    ...(ex.selfCheck ?? []).map((t, i): [string, string, boolean] => [`selfCheck ${i + 1}`, t, false]),
  ];
  if (ex.feedbackNote) texts.push(["feedbackNote", ex.feedbackNote, false]);
  for (const [field, text, coach] of texts) {
    for (const claim of bannedClaimsIn(text, coach)) {
      report("honesty.banned", `${ex.id}.${field}`, `${claim.name}: "${text}"`);
    }
  }
}

function checkPathText(doc: PathDoc, report: Report) {
  const texts: Array<[string, string]> = [
    ["path.goal", doc.goal],
    ["path.assumes", doc.assumes],
    ["path.orderRationale", doc.orderRationale],
    ["path.gradingLimits", doc.gradingLimits],
  ];
  for (const step of doc.steps) {
    texts.push([`${step.id}.why`, step.why], [`${step.id}.goal`, step.goal], [`${step.id}.payoff`, step.payoff]);
    step.howTo.forEach((t, i) => texts.push([`${step.id}.howTo ${i + 1}`, t]));
  }
  for (const ex of [...doc.steps.flatMap((s) => s.exercises), ...(doc.levels ?? []).flatMap((l) => l.warmups)]) {
    texts.push([`${ex.id}.purpose`, ex.purpose], [`${ex.id}.coachLine`, ex.coachLine]);
  }
  for (const level of doc.levels ?? []) {
    texts.push([`level ${level.id}.summary`, level.summary]);
  }
  for (const [where, text] of texts) {
    if (/\bTODO\b/.test(text)) report("schema.todo", where, "still says TODO");
    for (const claim of bannedClaimsIn(text, false)) {
      report("honesty.banned", where, `${claim.name}: "${text}"`);
    }
  }
}

function checkProgress(doc: PathDoc, report: Report) {
  const orderOf = new Map(doc.steps.map((s, i) => [s.id, i]));
  let previous: Step | null = null;
  doc.steps.forEach((step, index) => {
    if (step.order !== index + 1) report("progress.stepOrder", step.id, `order is ${step.order}, it is Step ${index + 1}`);
    if (step.why.trim().length < 40) report("progress.why", step.id, "the Step's why is missing or too thin to teach anything");
    if (step.howTo.length === 0 || step.howTo.some((t) => !t.trim())) report("progress.howTo", step.id, "the Step has no how-to-play text");
    if (step.payoff.trim().length < 20) report("progress.payoff", step.id, "the Step does not say what the player will hear themselves gain");
    if (step.exercises.length < 3 || step.exercises.length > 5) {
      report("progress.exerciseCount", step.id, `${step.exercises.length} Exercises; a Step has 3 to 5`);
    }
    const barred = step.exercises.some(
      (e) => (e.passBars.length > 0 && e.tempo.passAtBpm !== null) || (e.grading === "selfChecked" && (e.selfCheck?.length ?? 0) > 0),
    );
    if (!barred) report("progress.noPassBar", step.id, "no Exercise here has a measurable or self-checked bar");
    for (const ex of step.exercises) {
      if (ex.purpose.trim().length < 20) report("progress.why", ex.id, "the Exercise does not say what it is for");
      if (ex.howTo.length === 0 || ex.howTo.some((t) => !t.trim())) report("progress.howTo", ex.id, "the Exercise has no how-to-play text");
      if (!(ex.estimatedMinutes > 0)) report("progress.minutes", ex.id, "estimated minutes must be positive");
    }
    if (step.difficulty !== stepDifficulty(step)) {
      report("progress.difficultyValue", step.id, `stored ${step.difficulty}, the median is ${stepDifficulty(step)}`);
    }
    if (previous && step.difficulty < previous.difficulty && !step.difficultyException?.trim()) {
      report("progress.difficulty", step.id, `difficulty ${step.difficulty} after ${previous.difficulty} in "${previous.title}". Reorder, or declare difficultyException with the reason`);
    }
    if (step.difficultyException?.trim() && previous && step.difficulty >= previous.difficulty) {
      report("progress.difficulty", step.id, "declares a difficulty exception it does not need", "warning");
    }
    for (const prereq of step.prerequisites) {
      const at = orderOf.get(prereq);
      if (at === undefined) report("progress.prereqMissing", step.id, `needs "${prereq}", which is not a Step here`);
      else if (at >= index && prereq !== step.id) report("progress.prereqForward", step.id, `needs "${prereq}", which comes later`);
    }
    previous = step;
  });
  // Cycles, including a Step that needs itself.
  const edges = new Map(doc.steps.map((s) => [s.id, s.prerequisites]));
  const state = new Map<string, 1 | 2>();
  const visit = (id: string, trail: string[]): void => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      report("progress.cycle", id, `prerequisite cycle: ${[...trail, id].join(" -> ")}`);
      return;
    }
    state.set(id, 1);
    for (const next of edges.get(id) ?? []) if (edges.has(next)) visit(next, [...trail, id]);
    state.set(id, 2);
  };
  for (const step of doc.steps) visit(step.id, []);
  const sum = doc.steps.reduce((total, s) => total + s.exercises.reduce((t, e) => t + e.estimatedMinutes, 0), 0);
  if (doc.estimatedMinutes !== sum) report("progress.minutes", "path", `says ${doc.estimatedMinutes} minutes, the Exercises come to ${sum}`);
}

function checkReview(doc: PathDoc, report: Report) {
  const { status, history } = doc.review;
  if (status !== "draft" && !history.some((e) => e.status === status && e.by.trim() && e.date.trim())) {
    report("honesty.reviewStatus", "path.review", `status is ${status}, with no record of who reviewed it and when`);
  }
}

function checkComputed(doc: PathDoc, level: PathLevel, ex: Exercise, report: Report) {
  const top = ex.tempo.rungs[ex.tempo.rungs.length - 1]?.bpm ?? 60;
  const reach = checkReachAt(ex, level, top);
  const shifts = reach.failure ? 0 : reach.shifts;
  const stale = (field: string, stored: unknown, actual: unknown) => {
    if (stored !== actual) report("schema.computedStale", ex.id, `computed.${field} says ${String(stored)}, the notes say ${String(actual)}. Regenerate`);
  };
  stale("noteCount", ex.computed.noteCount, ex.notes.length);
  stale("minGapMsAtTop", ex.computed.minGapMsAtTop, minGapMs(ex.notes, top));
  stale("handShifts", ex.computed.handShifts, shifts);
  stale("maxPlayableBpm", ex.computed.maxPlayableBpm, maxPlayableBpm(ex, level));
  stale("difficulty", ex.computed.difficulty, exerciseDifficulty(ex, doc.kind, shifts));
}

/** The real schedule path: what `load_score_schedule` would be handed. */
function checkRuntime(doc: PathDoc, ex: Exercise, report: Report) {
  if (ex.notesRole !== "target") return;
  const bpm = ex.tempo.passAtBpm ?? ex.tempo.rungs[0]?.bpm ?? 60;
  const score = exerciseScore(doc.id, ex, bpm);
  const schedule = buildSchedule(score, undefined, { loops: ex.loops });
  const onsets = new Set(ex.notes.map((n) => n.tick)).size;
  if (schedule.onsets.length !== onsets || onsets === 0) {
    report("runtime.schedule", ex.id, `${onsets} written onsets became ${schedule.onsets.length} in the schedule`);
    return;
  }
  const allSoft = schedule.onsets.every((o) => o.soft);
  if (allSoft) report("runtime.schedule", ex.id, "every onset is soft, so nothing can be missed and notes heard means nothing");
  const beats = ex.bars * ((ex.meter.numerator * 4) / ex.meter.denominator);
  if (Math.abs(schedule.lengthBeats - beats) > 1e-9) {
    report("runtime.schedule", ex.id, `the schedule is ${schedule.lengthBeats} beats long, the Exercise ${beats}`);
  }
}

function checkOne(doc: PathDoc, level: PathLevel, ex: Exercise, report: Report, issues: readonly Issue[]) {
  checkTab(doc, ex, report);
  // Off the neck, nothing further about these notes means anything.
  if (issues.some((i) => (i.rule === "tab.string" || i.rule === "tab.fret") && i.where.startsWith(ex.id))) return;
  checkLoop(ex, report);
  checkReach(level, ex, report);
  checkPicks(ex, report);
  checkChords(ex, report);
  // Everything below reads the chords, and an unreadable one has been said.
  if (ex.chords?.some((c) => !parseChord(c))) return;
  if (ex.harmony) checkHarmony(ex, ex.harmony, report);
  checkBacking(ex, report);
  checkLandings(ex, report);
  checkLadder(ex, report);
  checkHonesty(ex, report);
  checkComputed(doc, level, ex, report);
  checkRuntime(doc, ex, report);
}

/** Things a warm-up can't do without. Six is enough that it doesn't feel the same. */
export const MIN_WARMUP_VARIANTS = 6;
/** Variants this far apart in difficulty can't share a clean tempo. */
export const POOL_DIFFICULTY_SPREAD = 1.3;

function checkLevels(doc: PathDoc, report: Report) {
  const levels = doc.levels;
  if (!levels || levels.length === 0) {
    report("level.missing", "path", "every Path has Beginner, Intermediate and Advanced Levels");
    return;
  }
  if (levels.map((l) => l.id).join() !== LEVEL_IDS.join()) {
    report("level.order", "path.levels", `found ${levels.map((l) => l.id).join(", ")}`);
  }
  const inOrder = levels.flatMap((l) => l.stepIds);
  if (inOrder.join() !== doc.steps.map((s) => s.id).join()) {
    report("level.steps", "path.levels", `Levels list ${inOrder.join(", ")}; the Path's Steps are ${doc.steps.map((s) => s.id).join(", ")}`);
  }
  for (const level of levels) {
    const at = `level ${level.id}`;
    if ((level.entry as string) !== "open") report("level.entry", at, `entry is "${level.entry}"`);
    if (level.stepIds.length === 0) report("level.steps", at, "a Level with no Steps");
    const items = level.placement?.startHereIf ?? [];
    const words = items.join(" ");
    if (items.length < 2) report("level.placement", at, "at least two things a player can check");
    if (!items.some((t) => /\d/.test(t))) {
      report("level.placement", at, "at least one check needs a number: a tempo, a count, a fret");
    }
    if (words.length > 700) report("level.placement", at, `${words.length} characters will not fit on one screen`);
    if (/\b(must|required|unlock|locked|not allowed|can't start)\b/i.test(words)) {
      report("level.placement", at, "placement is advice: it can't sound like a gate");
    }
    for (const claim of items.flatMap((t) => bannedClaimsIn(t, false))) {
      report("honesty.banned", at, claim.name);
    }
    if (level.warmups.length === 0) report("level.warmup", at, "each Level needs a warm-up");
  }
}

function noteKey(notes: readonly PathNote[]): string {
  return notes.map((n) => `${n.tick}:${n.string}:${n.fret}`).join(" ");
}

function checkVariation(ex: Exercise, report: Report) {
  const variation = ex.variation!;
  if (variation.variants.length < 2) {
    report("variation.shape", ex.id, "a variation needs at least two variants");
    return;
  }
  const dims = variation.dimensions;
  for (const d of dims) {
    if (!VARIATION_DIMENSIONS.includes(d)) report("variation.shape", ex.id, `unknown dimension "${d}"`);
  }
  const notPooled = variation.notPooled.map((n) => n.dimension);
  for (const d of dims) {
    const inPooled = variation.pooled.includes(d);
    const inNot = notPooled.includes(d);
    if (inPooled === inNot) {
      report("variation.declared", ex.id, `"${d}" must be either pooled or not pooled, and it is ${inPooled ? "both" : "neither"}`);
    }
  }
  for (const entry of variation.notPooled) {
    if (entry.reason.trim().length < 10) report("variation.declared", ex.id, `"${entry.dimension}" needs a reason`);
  }
  const ids = new Set<string>();
  const keys = new Map<string, string>();
  const pools = new Map<string, number[]>();
  for (const v of variation.variants) {
    if (ids.has(v.id)) report("variation.shape", ex.id, `variant id "${v.id}" is used twice`);
    ids.add(v.id);
    for (const d of dims) {
      if (v.params[d] === undefined) report("variation.shape", `${ex.id}#${v.id}`, `no value for "${d}"`);
    }
    const key = noteKey(v.notes);
    const twin = keys.get(key);
    if (twin) report("variation.duplicate", `${ex.id}#${v.id}`, `the same notes as "${twin}"`);
    keys.set(key, v.id);
    if (v.pool !== poolOf(v.params, notPooled)) {
      report("variation.pool", `${ex.id}#${v.id}`, `pool is "${v.pool}", its values say "${poolOf(v.params, notPooled)}"`);
    }
    pools.set(v.pool, [...(pools.get(v.pool) ?? []), v.computed.difficulty]);
  }
  if (noteKey(ex.notes) !== noteKey(variation.variants[0].notes)) {
    report("variation.base", ex.id, "a reader that ignores variants must get a real variant: variant 0");
  }
  for (const [pool, values] of pools) {
    const low = Math.min(...values);
    const high = Math.max(...values);
    if (low > 0 && high / low > POOL_DIFFICULTY_SPREAD) {
      report("variation.pooledDifficulty", ex.id, `pool "${pool}" runs from ${low} to ${high} in difficulty, too far to share a clean tempo. Declare the dimension not pooled`);
    }
  }
}

function checkWarmup(doc: PathDoc, ex: Exercise, report: Report) {
  const plan = ex.warmup!;
  const variants = ex.variation?.variants ?? [];
  if (variants.length < MIN_WARMUP_VARIANTS) {
    report("warmup.variants", ex.id, `${variants.length} variants; a warm-up needs at least ${MIN_WARMUP_VARIANTS} so it never feels the same`);
  }
  if ((plan.advancesProgress as boolean) !== false) {
    report("warmup.progress", ex.id, "a warm-up reports and decides nothing");
  }
  if (ex.estimatedMinutes > 5) report("warmup.short", ex.id, `${ex.estimatedMinutes} minutes is more than a warm-up`);
  if (!(plan.startAtCleanRatio >= 0.4 && plan.startAtCleanRatio <= 0.8)) {
    report("warmup.tempo", ex.id, `start at ${plan.startAtCleanRatio} of clean tempo; it belongs between 0.4 and 0.8`);
  }
  if (!(plan.topAtCleanRatio > plan.startAtCleanRatio && plan.topAtCleanRatio <= 0.95)) {
    report("warmup.tempo", ex.id, `top at ${plan.topAtCleanRatio} of clean tempo; above the start and no more than 0.95`);
  }
  const fallback = ex.tempo.rungs.find((r) => r.bpm === plan.fallbackBpm);
  if (!fallback || fallback.grading !== "graded") {
    report("warmup.tempo", ex.id, `fallback ${plan.fallbackBpm} BPM has to be a graded rung`);
  }
  const all = doc.steps.flatMap((s) => s.exercises);
  const reference = all.find((e) => e.id === plan.referenceExercise);
  if (!reference) {
    report("warmup.reference", ex.id, `no Exercise "${plan.referenceExercise}"`);
  } else {
    const grid = (notes: readonly PathNote[]) => {
      let gap = Infinity;
      for (let i = 1; i < notes.length; i += 1) {
        const d = notes[i].tick - notes[i - 1].tick;
        if (d > 0 && d < gap) gap = d;
      }
      return gap;
    };
    if (grid(reference.notes) !== grid(ex.notes)) {
      report("warmup.reference", ex.id, `the reference moves in ${grid(reference.notes)}-tick notes, this in ${grid(ex.notes)}: a clean tempo on one means nothing on the other`);
    }
  }
  const concrete = variants.length ? variants.map((v) => exerciseWithVariant(ex, v)) : [ex];
  for (const one of concrete) {
    if (one.bars > 8) report("warmup.short", one.id, `${one.bars} bars is more than a warm-up`);
    if (!one.harmony && !one.chords) report("warmup.musical", one.id, "a warm-up is music: declare its scale or its chords");
    const frets = one.notes.filter((n) => n.fret > 0).map((n) => n.fret);
    const span = frets.length ? Math.max(...frets) - Math.min(...frets) : 0;
    if (one.computed.handShifts === 0 && span < 5) {
      report("warmup.moves", one.id, "this stays under one hand: a warm-up moves through positions");
    }
  }
}

function checkChain(ex: Exercise, report: Report) {
  const chords = ex.chords ?? [];
  if (new Set(chords).size < 2) report("chain.changes", ex.id, "a chain links different chords");
  if (ex.harmony?.kind !== "chordTones") {
    report("chain.harmony", ex.id, "a chain must be checked bar by bar against its chords");
  }
  const barTicks = barLengthTicks(ex.meter);
  for (let bar = 1; bar < ex.bars; bar += 1) {
    const line = bar * barTicks;
    const before = [...ex.notes].reverse().find((n) => n.tick < line);
    const after = ex.notes.find((n) => n.tick >= line);
    if (!before || !after) continue;
    if (before.tick + before.dur !== line || after.tick !== line) {
      report("chain.continuous", `${ex.id} (bar ${bar + 1})`, "the notes stop at this bar line; a link keeps going");
      continue;
    }
    if (Math.abs(before.string - after.string) > 1) {
      report("chain.joint", `${ex.id} (bar ${bar + 1})`, `from string ${before.string} to ${after.string}: a link stays on the string or goes to the next one`);
    }
    if (before.fret > 0 && after.fret > 0 && Math.abs(before.fret - after.fret) > ex.chain!.maxJointFrets) {
      report("chain.joint", `${ex.id} (bar ${bar + 1})`, `${Math.abs(before.fret - after.fret)} frets at the link; this chain allows ${ex.chain!.maxJointFrets}`);
    }
  }
}

/** Check a pack. Pass anything: the first thing it does is read the shape. */
export function validatePath(doc: unknown): Issue[] {
  const issues: Issue[] = [];
  const report: Report = (rule, where, message, severity = "error") => {
    issues.push({ rule, severity, where, message });
  };
  if (!checkShape(doc, report)) return issues;
  checkEnums(doc, report);
  // Everything after this reads those values as the types they claim to be.
  if (issues.length > 0) return issues;
  checkIds(doc, report);
  checkPathText(doc, report);
  checkReview(doc, report);
  checkLevels(doc, report);
  const levelOf = (stepId: string): PathLevel =>
    doc.levels?.find((l) => l.stepIds.includes(stepId))?.reachLevel ?? doc.level;
  const checkAll = (ex: Exercise, level: PathLevel) => {
    if (ex.variation) checkVariation(ex, report);
    const concrete = ex.variation?.variants.length
      ? ex.variation.variants.map((v) => exerciseWithVariant(ex, v))
      : [ex];
    for (const one of concrete) {
      checkOne(doc, level, one, report, issues);
      if (ex.chain) checkChain(one, report);
    }
  };
  for (const step of doc.steps) {
    for (const ex of step.exercises) {
      if (ex.warmup) report("warmup.placement", ex.id, "a warm-up belongs under a Level, not a Step");
      checkAll(ex, levelOf(step.id));
    }
  }
  for (const level of doc.levels ?? []) {
    for (const ex of level.warmups) {
      if (!ex.warmup) {
        report("warmup.placement", ex.id, "listed as a warm-up and has no warm-up plan");
        continue;
      }
      checkWarmup(doc, ex, report);
      checkAll(ex, level.reachLevel ?? doc.level);
    }
  }
  checkProgress(doc, report);
  return issues;
}

export function errorsIn(issues: readonly Issue[]): Issue[] {
  return issues.filter((i) => i.severity === "error");
}

/** What the runtime still owes this pack, from the metrics it uses. */
export function runtimeNeeds(doc: PathDoc): Array<{ metric: string; status: string; exercises: number }> {
  const counts = new Map<string, number>();
  for (const step of doc.steps) {
    for (const ex of step.exercises) {
      for (const metric of new Set(ex.passBars.map((b) => b.metric))) {
        counts.set(metric, (counts.get(metric) ?? 0) + 1);
      }
    }
  }
  return METRICS.filter((m) => counts.has(m.id)).map((m) => ({
    metric: m.id,
    status: m.status,
    exercises: counts.get(m.id)!,
  }));
}
