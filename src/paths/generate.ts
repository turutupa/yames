/**
 * Spec in, pack out. Pure and deterministic: no clock, no randomness, keys in
 * one fixed order, so the same spec gives the same bytes on every machine.
 */
import { GRADING_PROFILES } from "./profiles";
import type { GradingProfile } from "./profiles";
import { PATH_SCHEMA_VERSION, STANDARD_TUNING, VARIATION_DIMENSIONS, barLengthTicks } from "./format";
import type {
  Backing,
  Crossing,
  Exercise,
  ExerciseComputed,
  ExerciseVariant,
  HandPosition,
  Harmony,
  Landing,
  Level,
  PathDoc,
  PathLevel,
  PassBar,
  PathNote,
  PathRest,
  Step,
  TempoRung,
  VariationDimension,
} from "./format";
import { exerciseDifficulty, minGapMs, stepDifficulty } from "./difficulty";
import {
  crossingsIn,
  gradedGapLimit,
  pickedPairs,
  requiredFlags,
  requiredNotGraded,
  worstCorrectHeard,
} from "./derive";
import { DETECTION_FLAGS } from "./metrics";
import { checkReachAt, maxPlayableBpm } from "./reach";
import type { ExerciseSpec, HarmonySpec, PathSpec, VariantBuild, VariantParams, VarySpec } from "./spec";
import { markAlternate, markSweep, parseTab } from "./tabDsl";
import { canSpellScale, chordRootName, guideTones, spellChord, spellScale } from "./theory";
import type { ScaleId } from "../jam/scales";

const METER = { numerator: 4, denominator: 4 };

function buildHarmony(h: HarmonySpec | undefined): Harmony | undefined {
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

function buildBacking(spec: Pick<ExerciseSpec, "jam" | "click" | "id">, chords: string[] | undefined): Backing {
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

type Compiled = {
  build: VariantBuild;
  chords?: string[];
  notes: PathNote[];
  rests: PathRest[];
  guide?: PathNote[];
  position: HandPosition;
  bars: number;
  harmony?: Harmony;
  landings?: Landing[];
  backing: Backing;
  crossing: Crossing;
  tab: string;
};

function compile(spec: ExerciseSpec, build: VariantBuild, where: string): Omit<Compiled, "crossing" | "landings" | "backing" | "harmony"> {
  const barTicks = barLengthTicks(METER);
  let parsed;
  try {
    parsed = parseTab(build.tab, STANDARD_TUNING, barTicks);
  } catch (error) {
    throw new Error(`${where}: ${(error as Error).message}`);
  }
  const chordText = build.chords ?? spec.chords;
  const chords = chordText ? chordText.split("|").map((c) => c.trim()).filter(Boolean) : undefined;
  const guideText = build.guide ?? spec.guide;
  const fret = build.position ?? spec.position;
  if (fret === undefined) throw new Error(`${where}: no position`);
  const shifts = build.shifts ?? spec.shifts;
  const compiled: Omit<Compiled, "crossing" | "landings" | "backing" | "harmony"> = {
    build,
    notes: parsed.notes,
    rests: parsed.rests,
    position: { fret, shifts: shifts ? "allowed" : "none" },
    bars: Math.max(1, Math.ceil(parsed.totalTicks / barTicks)),
    tab: build.tab.trim().replace(/\s+/g, " "),
  };
  if (chords) compiled.chords = chords;
  if (guideText) compiled.guide = parseTab(guideText, STANDARD_TUNING, barTicks).notes;
  return compiled;
}

/** Every combination of the values, first dimension slowest, in the order written. */
function combinations(values: VarySpec["values"]): VariantParams[] {
  let out: VariantParams[] = [{}];
  for (const dimension of VARIATION_DIMENSIONS) {
    const list = values[dimension];
    if (!list) continue;
    out = out.flatMap((params) => list.map((value) => ({ ...params, [dimension]: value })));
  }
  return out;
}

const variantId = (params: VariantParams) =>
  Object.entries(params)
    .map(([k, v]) => `${k}=${v.replace(/\s+/g, "-")}`)
    .join(",");

function buildExercise(
  pathSpec: PathSpec,
  groupId: string,
  spec: ExerciseSpec,
  reachLevel: PathLevel,
): Exercise {
  const where = `${groupId}/${spec.id}`;
  const profile: GradingProfile = GRADING_PROFILES[spec.grade];
  const pickPlan = spec.pick ?? (pathSpec.kind === "mechanics" ? "alternate" : "free");
  const notesRole: Exercise["notesRole"] = spec.example || profile.example ? "example" : "target";
  const loops = spec.loops ?? true;

  const paramsList: VariantParams[] = spec.vary ? combinations(spec.vary.values) : [{}];
  const builds: VariantBuild[] = spec.vary
    ? paramsList.map((params) => spec.vary!.build(params))
    : [{ tab: spec.tab ?? "" }];
  if (!spec.vary && !spec.tab) throw new Error(`${where}: no tab`);
  const parts = builds.map((build, index) => {
    const part = compile(spec, build, `${where}#${variantId(paramsList[index])}`);
    if (pickPlan === "alternate") markAlternate(part.notes, spec.pickStart ?? "d");
    if (pickPlan === "sweep") markSweep(part.notes);
    return part;
  });

  // A rung is graded only if every variant may be graded at it.
  const limit = gradedGapLimit(pickPlan);
  const rungs: TempoRung[] = spec.rungs.map((bpm) => {
    const allowed = profile.mode !== "selfChecked" && profile.mode !== "practiceOnly";
    const fits = parts.every((part) => {
      const gap = minGapMs(part.notes, bpm);
      return notesRole === "example" || gap === null || gap >= limit;
    });
    return { bpm, grading: allowed && fits ? "graded" : "selfChecked" };
  });
  const gradedRungs = rungs.filter((r) => r.grading === "graded");
  const passAt =
    profile.mode === "selfChecked" || profile.mode === "practiceOnly"
      ? null
      : (spec.passAt ?? gradedRungs[gradedRungs.length - 1]?.bpm ?? null);
  const tempo = { rungs, passAtBpm: passAt };
  const graded = [...new Set([...profile.graded, ...(spec.alsoGraded ?? [])])];
  const top = rungs[rungs.length - 1]?.bpm ?? 60;

  const concrete = parts.map((part) => {
    const shape = { notes: part.notes, position: part.position, loops, meter: METER, bars: part.bars };
    const reach = checkReachAt(shape, reachLevel, top);
    const handShifts = reach.failure ? 0 : reach.shifts;
    const chords = part.chords;
    const backing = buildBacking({ jam: part.build.jam ?? spec.jam, click: spec.click, id: spec.id }, chords);
    const landings = buildLandings(spec, chords);
    const harmony = buildHarmony(part.build.harmony ?? spec.harmony);
    const crossing =
      spec.crossing ?? (pickPlan === "alternate" ? crossingsIn(pickedPairs(shape)) : "none");
    const computed: ExerciseComputed = {
      noteCount: part.notes.length,
      minGapMsAtTop: minGapMs(part.notes, top),
      handShifts,
      maxPlayableBpm: maxPlayableBpm(shape, reachLevel),
      difficulty: exerciseDifficulty(
        { tempo, notes: part.notes, bars: part.bars, meter: METER, pickPlan, chords, grading: profile.mode },
        pathSpec.kind,
        handShifts,
      ),
    };
    return { part, backing, landings, harmony, crossing, computed };
  });

  const baseFor = (index: number) => ({
    notes: concrete[index].part.notes,
    pickPlan,
    graded,
    grading: profile.mode,
    notesRole,
    tempo,
    holdSeconds: spec.holdSeconds,
    landings: concrete[index].landings,
    backing: concrete[index].backing,
  });
  // What every variant may need said about it, so all of them can be checked.
  const flags = [...new Set(concrete.flatMap((_c, i) => requiredFlags(baseFor(i))))];
  const notGraded = [...new Set(concrete.flatMap((_c, i) => requiredNotGraded(baseFor(i))))];

  // A slide the listening can't hear still counts as missed today, so a correct
  // take must not fail for it: a variant's notes-heard bar comes down to meet its
  // own slides, and no other variant's.
  const barsFor = (notes: readonly PathNote[]): PassBar[] => {
    const worstHeard = worstCorrectHeard(notes);
    return (spec.pass ?? profile.passBars).map((bar) =>
      bar.metric === "notesHeard" && bar.min !== undefined && bar.min > worstHeard
        ? { ...bar, min: Math.floor(worstHeard * 20) / 20 }
        : bar,
    );
  };
  const passBars = barsFor(concrete[0].part.notes);

  const first = concrete[0];
  const exercise: Exercise = {
    id: `${groupId}.${spec.id}`,
    title: spec.title,
    purpose: spec.purpose,
    howTo: spec.howTo,
    coachLine: spec.coach,
    grading: profile.mode,
    feedback: spec.feedback ?? profile.feedback,
    meter: METER,
    bars: first.part.bars,
    loops,
    position: first.part.position,
    pickPlan,
    crossing: first.crossing,
    notesRole,
    notes: first.part.notes,
    rests: first.part.rests,
    tempo,
    passBars,
    graded,
    notGraded,
    detection: { flags, notes: flags.map((f) => DETECTION_FLAGS[f]) },
    backing: first.backing,
    estimatedMinutes: spec.minutes,
    tab: first.part.tab,
    computed: first.computed,
  };
  if (spec.feedbackNote) exercise.feedbackNote = spec.feedbackNote;
  if (spec.holdSeconds) exercise.holdSeconds = spec.holdSeconds;
  if (spec.pickFlipsOnLoop) exercise.pickFlipsOnLoop = true;
  if (first.part.guide) exercise.guide = first.part.guide;
  if (first.part.chords) exercise.chords = first.part.chords;
  if (first.harmony) exercise.harmony = first.harmony;
  if (first.landings) exercise.landings = first.landings;
  if (spec.selfCheck) exercise.selfCheck = spec.selfCheck;
  if (spec.chain) exercise.chain = { maxJointFrets: spec.chain.maxJointFrets };
  if (spec.warmup) {
    exercise.warmup = {
      startAtCleanRatio: spec.warmup.start,
      topAtCleanRatio: spec.warmup.top,
      referenceExercise: spec.warmup.reference,
      fallbackBpm: spec.warmup.fallback,
      advancesProgress: false,
    };
  }
  if (spec.vary) {
    const vary = spec.vary;
    const notPooled = Object.entries(vary.notPooled ?? {}) as Array<[VariationDimension, string]>;
    exercise.variation = {
      dimensions: VARIATION_DIMENSIONS.filter((d) => vary.values[d]),
      pooled: [...(vary.pooled ?? [])],
      notPooled: notPooled.map(([dimension, reason]) => ({ dimension, reason })),
      variants: concrete.map((c, index) => {
        const params = paramsList[index];
        const variant: ExerciseVariant = {
          id: variantId(params),
          label: vary.label ? vary.label(params) : Object.values(params).join(", "),
          params,
          pool: poolOf(params, notPooled.map(([d]) => d)),
          tab: c.part.tab,
          position: c.part.position,
          crossing: c.crossing,
          notes: c.part.notes,
          rests: c.part.rests,
          backing: c.backing,
          computed: c.computed,
        };
        if (c.part.guide) variant.guide = c.part.guide;
        if (c.part.chords) variant.chords = c.part.chords;
        if (c.harmony) variant.harmony = c.harmony;
        if (c.landings) variant.landings = c.landings;
        const own = barsFor(c.part.notes);
        if (JSON.stringify(own) !== JSON.stringify(passBars)) variant.passBars = own;
        return variant;
      }),
    };
  }
  return exercise;
}

/** The pool a variant belongs to, from the values that change difficulty. */
export function poolOf(params: Partial<Record<string, string>>, notPooled: readonly string[]): string {
  const parts = notPooled.filter((d) => params[d] !== undefined).map((d) => `${d}=${params[d]}`);
  return parts.length ? parts.join(",") : "all";
}

function reachLevelFor(spec: PathSpec, stepId: string): PathLevel {
  return spec.levels?.find((l) => l.steps.includes(stepId))?.reachLevel ?? spec.level;
}

export function buildPath(spec: PathSpec): PathDoc {
  const steps: Step[] = spec.steps.map((stepSpec, index) => {
    const reachLevel = reachLevelFor(spec, stepSpec.id);
    const exercises = stepSpec.exercises.map((e) => buildExercise(spec, stepSpec.id, e, reachLevel));
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
  const levels: Level[] | undefined = spec.levels?.map((level) => {
    const built: Level = {
      id: level.id,
      title: level.title,
      summary: level.summary,
      entry: "open",
      placement: { startHereIf: level.startHereIf },
      stepIds: level.steps,
      warmups: level.warmups.map((w) =>
        buildExercise(spec, `warmup-${level.id}`, w, level.reachLevel ?? spec.level),
      ),
    };
    if (level.reachLevel) built.reachLevel = level.reachLevel;
    return built;
  });
  const minutes = steps.reduce(
    (sum, step) => sum + step.exercises.reduce((s, e) => s + e.estimatedMinutes, 0),
    0,
  );
  const doc: PathDoc = {
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
  if (levels) doc.levels = levels;
  return doc;
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

