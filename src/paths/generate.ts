/**
 * Spec in, pack out. Pure and deterministic: no clock, no randomness, keys in
 * one fixed order, so the same spec gives the same bytes on every machine.
 */
import { GRADING_PROFILES } from "./profiles";
import type { GradingProfile } from "./profiles";
import { STANDARD_TUNING, PATH_SCHEMA_VERSION, barLengthTicks } from "./format";
import type {
  Backing,
  Exercise,
  Harmony,
  Landing,
  PathDoc,
  PathNote,
  Step,
  TempoRung,
} from "./format";
import { exerciseDifficulty, minGapMs, stepDifficulty } from "./difficulty";
import {
  crossingsIn,
  gradedGapLimit,
  pickedPairs,
  requiredFlags,
  requiredNotGraded,
} from "./derive";
import { DETECTION_FLAGS } from "./metrics";
import { checkReachAt, maxPlayableBpm } from "./reach";
import type { ExerciseSpec, PathSpec, StepSpec } from "./spec";
import { markAlternate, markSweep, parseTab } from "./tabDsl";
import { canSpellScale, chordRootName, guideTones, spellChord, spellScale } from "./theory";
import type { ScaleId } from "../jam/scales";

const METER = { numerator: 4, denominator: 4 };

function buildHarmony(spec: ExerciseSpec): Harmony | undefined {
  const h = spec.harmony;
  if (!h) return undefined;
  if ("scale" in h) {
    const [root, scale] = h.scale;
    return {
      kind: "scale",
      root,
      scale,
      spelled: canSpellScale(scale) ? spellScale(root, scale as ScaleId) : [],
      cover: h.cover ?? false,
    };
  }
  if ("arpeggio" in h) {
    return { kind: "arpeggio", chord: h.arpeggio, spelled: spellChord(h.arpeggio), cover: h.cover ?? true };
  }
  if ("chordTones" in h) return { kind: "chordTones", cover: h.cover ?? false };
  const [root, scale] = h.scaleOverChords;
  return {
    kind: "scaleOverChords",
    root,
    scale,
    spelled: canSpellScale(scale) ? spellScale(root, scale as ScaleId) : [],
    cover: false,
    allowed: h.allowed ?? [],
  };
}

export function acceptedNotes(chord: string, accept: Landing["accept"]): string[] {
  switch (accept) {
    case "chordTone":
      return spellChord(chord);
    case "root":
      return [chordRootName(chord)];
    case "guideTone":
      return guideTones(chord);
    case "third":
      return [guideTones(chord)[0]];
    case "seventh":
      return [guideTones(chord)[1]];
  }
}

function buildLandings(spec: ExerciseSpec, chords: string[] | undefined): Landing[] | undefined {
  if (!spec.landings) return undefined;
  if (!chords) throw new Error(`${spec.id}: landings need chords`);
  const { at, accept } = spec.landings;
  const bars: number[] = [];
  if (at === "bar") chords.forEach((_c, bar) => bars.push(bar));
  else if (at === "change") {
    chords.forEach((chord, bar) => {
      if (bar === 0 || chord !== chords[bar - 1]) bars.push(bar);
    });
  } else bars.push(...at);
  return bars.map((bar) => ({
    bar,
    beat: 0,
    chord: chords[bar],
    accept,
    notes: acceptedNotes(chords[bar], accept),
  }));
}

function buildBacking(spec: ExerciseSpec, chords: string[] | undefined): Backing {
  if (!spec.jam) return { kind: "click", subdivision: spec.click ?? 1 };
  if (!chords) throw new Error(`${spec.id}: a band needs chords`);
  return {
    kind: "jam",
    grooveId: spec.jam.groove,
    feel: spec.jam.feel ?? "straight",
    key: spec.jam.key,
    chart: chords.join(" | "),
  };
}

function buildExercise(pathSpec: PathSpec, stepSpec: StepSpec, spec: ExerciseSpec): Exercise {
  const barTicks = barLengthTicks(METER);
  const where = `${stepSpec.id}/${spec.id}`;
  let parsed;
  try {
    parsed = parseTab(spec.tab, STANDARD_TUNING, barTicks);
  } catch (error) {
    throw new Error(`${where}: ${(error as Error).message}`);
  }
  const profile: GradingProfile = GRADING_PROFILES[spec.grade];
  const bars = Math.max(1, Math.ceil(parsed.totalTicks / barTicks));
  const chords = spec.chords ? spec.chords.split("|").map((c) => c.trim()).filter(Boolean) : undefined;

  const pickPlan = spec.pick ?? (pathSpec.kind === "mechanics" ? "alternate" : "free");
  if (pickPlan === "alternate") markAlternate(parsed.notes, spec.pickStart ?? "d");
  if (pickPlan === "sweep") markSweep(parsed.notes);

  let guide: PathNote[] | undefined;
  if (spec.guide) {
    guide = parseTab(spec.guide, STANDARD_TUNING, barTicks).notes;
  }

  const notesRole: Exercise["notesRole"] = spec.example || profile.example ? "example" : "target";
  const loops = spec.loops ?? true;
  const limit = gradedGapLimit(pickPlan);
  const rungs: TempoRung[] = spec.rungs.map((bpm) => {
    const gap = minGapMs(parsed.notes, bpm);
    const allowed = profile.mode !== "selfChecked" && profile.mode !== "practiceOnly";
    const graded = allowed && (notesRole === "example" || gap === null || gap >= limit);
    return { bpm, grading: graded ? "graded" : "selfChecked" };
  });
  const gradedRungs = rungs.filter((r) => r.grading === "graded");
  const passAt =
    profile.mode === "selfChecked" || profile.mode === "practiceOnly"
      ? null
      : (spec.passAt ?? gradedRungs[gradedRungs.length - 1]?.bpm ?? null);

  const graded = [...new Set([...profile.graded, ...(spec.alsoGraded ?? [])])];
  const base = {
    notes: parsed.notes,
    pickPlan,
    graded,
    grading: profile.mode,
    notesRole,
    tempo: { rungs, passAtBpm: passAt },
    holdSeconds: spec.holdSeconds,
    landings: buildLandings(spec, chords),
    backing: buildBacking(spec, chords),
  };
  const flags = requiredFlags(base);
  const position = { fret: spec.position, shifts: spec.shifts ? ("allowed" as const) : ("none" as const) };
  const shape = { notes: parsed.notes, position, loops, meter: METER, bars };
  const top = rungs[rungs.length - 1]?.bpm ?? 60;
  const reach = checkReachAt(shape, pathSpec.level, top);
  const handShifts = reach.failure ? 0 : reach.shifts;
  const crossing =
    spec.crossing ??
    (pickPlan === "alternate"
      ? crossingsIn(pickedPairs(shape))
      : "none");
  const difficulty = exerciseDifficulty(
    { tempo: base.tempo, notes: parsed.notes, bars, meter: METER, pickPlan, chords, grading: profile.mode },
    pathSpec.kind,
    handShifts,
  );

  const exercise: Exercise = {
    id: `${stepSpec.id}.${spec.id}`,
    title: spec.title,
    purpose: spec.purpose,
    howTo: spec.howTo,
    coachLine: spec.coach,
    grading: profile.mode,
    feedback: spec.feedback ?? profile.feedback,
    meter: METER,
    bars,
    loops,
    position,
    pickPlan,
    crossing,
    notesRole,
    notes: parsed.notes,
    rests: parsed.rests,
    tempo: base.tempo,
    passBars: spec.pass ?? profile.passBars,
    graded,
    notGraded: requiredNotGraded(base),
    detection: { flags, notes: flags.map((f) => DETECTION_FLAGS[f]) },
    backing: base.backing,
    estimatedMinutes: spec.minutes,
    tab: spec.tab.trim().replace(/\s+/g, " "),
    computed: {
      noteCount: parsed.notes.length,
      minGapMsAtTop: minGapMs(parsed.notes, top),
      handShifts,
      maxPlayableBpm: maxPlayableBpm(shape, pathSpec.level),
      difficulty,
    },
  };
  if (spec.feedbackNote) exercise.feedbackNote = spec.feedbackNote;
  if (spec.holdSeconds) exercise.holdSeconds = spec.holdSeconds;
  if (spec.pickFlipsOnLoop) exercise.pickFlipsOnLoop = true;
  if (guide) exercise.guide = guide;
  if (chords) exercise.chords = chords;
  const harmony = buildHarmony(spec);
  if (harmony) exercise.harmony = harmony;
  if (base.landings) exercise.landings = base.landings;
  if (spec.selfCheck) exercise.selfCheck = spec.selfCheck;
  return exercise;
}

export function buildPath(spec: PathSpec): PathDoc {
  const steps: Step[] = spec.steps.map((stepSpec, index) => {
    const exercises = stepSpec.exercises.map((e) => buildExercise(spec, stepSpec, e));
    const step: Step = {
      id: stepSpec.id,
      order: index + 1,
      title: stepSpec.title,
      goal: stepSpec.goal,
      why: stepSpec.why,
      howTo: stepSpec.howTo,
      payoff: stepSpec.payoff,
      prerequisites: stepSpec.prerequisites ?? (index > 0 ? [spec.steps[index - 1].id] : []),
      difficulty: stepDifficulty({ exercises }),
      exercises,
    };
    if (stepSpec.difficultyException) step.difficultyException = stepSpec.difficultyException;
    return step;
  });
  const minutes = steps.reduce(
    (sum, step) => sum + step.exercises.reduce((s, e) => s + e.estimatedMinutes, 0),
    0,
  );
  return {
    schemaVersion: PATH_SCHEMA_VERSION,
    id: spec.id,
    title: spec.title,
    kind: spec.kind,
    goal: spec.goal,
    level: spec.level,
    assumes: spec.assumes,
    prerequisites: {
      paths: spec.prerequisites?.paths ?? [],
      skills: spec.prerequisites?.skills ?? [],
    },
    tuning: [...STANDARD_TUNING],
    review: spec.review ?? { status: "draft", history: [] },
    orderRationale: spec.orderRationale,
    gradingLimits: spec.gradingLimits,
    estimatedMinutes: minutes,
    steps,
  };
}

/** Is this object one of the note-shaped rows printed on one line? */
const isRow = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  ("tick" in value || ("bpm" in value && "grading" in value));

function format(value: unknown, indent: string): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every((v) => typeof v !== "object" || v === null)) {
      const flat = `[${value.map((v) => JSON.stringify(v)).join(", ")}]`;
      if (flat.length + indent.length <= 100) return flat;
    }
    const inner = `${indent}  `;
    const rows = value.map((v) => `${inner}${isRow(v) ? JSON.stringify(v) : format(v, inner)}`);
    return `[\n${rows.join(",\n")}\n${indent}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return "{}";
    const inner = `${indent}  `;
    const rows = entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${format(v, inner)}`);
    return `{\n${rows.join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

/** The bytes of a pack: readable, diffable, one note to a line. */
export function serializePath(doc: PathDoc): string {
  return `${format(doc, "")}\n`;
}

