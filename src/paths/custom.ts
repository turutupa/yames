/**
 * "My exercises": a custom Exercise built from a recipe (DESIGN 13, TOOLS 2.4).
 *
 * A recipe is a handful of choices from closed sets: a shape, a root, a scale or
 * a chord, a position, the strings, a subdivision, a length and a direction. No
 * free text reaches the generator, and nothing here writes a fret: the notes come
 * from the templates the sixteen Paths are written with (`templates.ts`), the tab
 * goes through `parseTab`, the Exercise through the same `buildPath` a pack goes
 * through, and the result through `validatePath`. A recipe a hand cannot play, or
 * one that names a shape that is not there, is refused with a reason (`Why`), and
 * never repaired by a guess.
 *
 * Pure: no clock, no randomness, no store. The same recipe gives the same notes
 * and the same id on every machine. The words a player reads about it are not
 * here: `summary` is data, and the sentences come from locale templates (t2c).
 */
import { STANDARD_TUNING, SUBDIVISION_TICKS, barLengthTicks } from "./format";
import type { Exercise, PathDoc, PathLevel } from "./format";
import { stepDifficulty } from "./difficulty";
import { buildPath } from "./generate";
import { paceLadder } from "./pace";
import type { ExerciseSpec, HarmonySpec, PathSpec } from "./spec";
import {
  acrossStrings,
  arpeggioCells,
  boxCells,
  oneStringClimb,
  sequenced,
  threeNpsCells,
} from "./templates";
import type { FretCell, Sequence } from "./templates";
import { chordPcs, pcOfName, scalePcs, spellChord, spellScale } from "./theory";
import { validatePath } from "./validate";
import type { Issue } from "./validate";
import { chordSuffix } from "../jam/harmony";
import type { ChordQuality } from "../jam/harmony";
import type { ScaleId } from "../jam/scales";

// ---------------------------------------------------------------------------
// The recipe
// ---------------------------------------------------------------------------

/** Bumped when a recipe of the same fields would build different notes. Stored with every recipe. */
export const RECIPE_VERSION = 1 as const;

/** The twelve pitch classes, one spelling each (the chart spelling `templates.ts` uses). */
export const RECIPE_ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
export type RecipeRoot = (typeof RECIPE_ROOTS)[number];

export const RECIPE_SHAPES = ["box", "threePerString", "arpeggio", "oneString", "chromatic"] as const;
export type RecipeShape = (typeof RECIPE_SHAPES)[number];

/** The pentatonic boxes: `boxCells`. A major pentatonic is its relative minor's box. */
export const BOX_SCALES = ["minorPentatonic", "majorPentatonic", "blues"] as const;
export type BoxScale = (typeof BOX_SCALES)[number];

/** Seven-note scales the theory data can spell: `threeNpsCells`. */
export const SEVEN_NOTE_SCALES = ["major", "naturalMinor", "harmonicMinor", "dorian", "mixolydian"] as const;
export type SevenNoteScale = (typeof SEVEN_NOTE_SCALES)[number];

/** Scales a one-string climb may use: all of the above. */
export const LINE_SCALES = [...SEVEN_NOTE_SCALES, ...BOX_SCALES] as const;
export type LineScale = (typeof LINE_SCALES)[number];

/** Chord qualities `theory.ts` can spell, three notes or more: `arpeggioCells`. */
export const ARPEGGIO_CHORDS = ["maj", "min", "dim", "aug", "7", "maj7", "m7", "m7b5", "dim7"] as const;
export type ArpeggioChord = (typeof ARPEGGIO_CHORDS)[number];

/** The four grids a recipe may name, as `format.ts` names them. */
export const RECIPE_SUBDIVISIONS = ["quarters", "eighths", "eighthTriplets", "sixteenths"] as const;
export type RecipeSubdivision = (typeof RECIPE_SUBDIVISIONS)[number];

export const RECIPE_DIRECTIONS = ["up", "down", "upAndBack"] as const;
export type RecipeDirection = (typeof RECIPE_DIRECTIONS)[number];

export type StringNumber = 1 | 2 | 3 | 4 | 5 | 6;

/** Neighbouring strings, `low` the lowest-sounding (6 is the low E): `{ low: 6, high: 1 }` is all six. */
export type StringRange = { low: StringNumber; high: StringNumber };

/** The highest fret a recipe may start at. */
export const MAX_POSITION = 15;
export const MIN_BARS = 1;
export const MAX_BARS = 8;

/**
 * Where the shape starts: the fret of its first note on its lowest string (box 1 of
 * A minor at 5 is "5", as the player says it), or `"root"`, the root on that string
 * between the nut and fret 11. `"root"` and the fret it stands for build the same
 * Exercise, with the same id.
 */
export type RecipePosition = number | "root";

type Common = {
  v: typeof RECIPE_VERSION;
  position: RecipePosition;
  subdivision: RecipeSubdivision;
  /** 1 to 8. */
  bars: number;
  direction: RecipeDirection;
};

export type BoxRecipe = Common & { shape: "box"; root: RecipeRoot; scale: BoxScale; strings?: StringRange };
export type ThreePerStringRecipe = Common & {
  shape: "threePerString";
  root: RecipeRoot;
  scale: SevenNoteScale;
  /** At least two strings. */
  strings?: StringRange;
};
export type ArpeggioRecipe = Common & {
  shape: "arpeggio";
  root: RecipeRoot;
  chord: ArpeggioChord;
  /** At least three strings: one chord tone on each. */
  strings?: StringRange;
};
export type OneStringRecipe = Common & { shape: "oneString"; root: RecipeRoot; scale: LineScale; string?: StringNumber };
/** One finger per fret, frets 1-2-3-4 from `position`, on each string in turn. No key. */
export type ChromaticRecipe = Common & { shape: "chromatic"; strings?: StringRange };

export type Recipe = BoxRecipe | ThreePerStringRecipe | ArpeggioRecipe | OneStringRecipe | ChromaticRecipe;

// ---------------------------------------------------------------------------
// What comes back
// ---------------------------------------------------------------------------

/**
 * Why a recipe was refused, as data a sentence can be made from.
 *
 * - `badRecipe`: a field outside its closed set (`field` names it). A tool's grammar
 *   should make this impossible; the check is here so nothing else has to trust it.
 * - `noShapeHere`: the shape does not start at that fret (not a note of the scale or
 *   chord there, or no box starts there). `nearest`: the closest frets it does start
 *   at, below first, at most one each side.
 * - `outOfRange`: the shape starts there but runs past fret 22 (or below the nut).
 * - `tooManyNotes`: one time through does not fit in the bars; `needsBars` would.
 * - `tooFewNotes`: the line leaves a whole bar or more empty; `fillsBars` it fills.
 * - `unreachable`: no hand at this app's reach level plays it at a gradeable tempo;
 *   `maxBpm` is the fastest a fingering exists for (0: none at all).
 * - `notValid`: built, but the validator refused it (`rules`). The grid test proves
 *   no recipe reaches this; it is here so that a bug is a refusal and never a pack
 *   Exercise the validator would not let ship.
 * - `atLimit`: from `nextRecipe` only: no such change from here (the last position,
 *   eight bars, the subdivision it already is, the other way of up-and-back).
 */
export type Why =
  | { why: "badRecipe"; field: string }
  | { why: "noShapeHere"; nearest: number[] }
  | { why: "outOfRange" }
  | { why: "tooManyNotes"; needsBars: number }
  | { why: "tooFewNotes"; fillsBars: number }
  | { why: "unreachable"; maxBpm: number }
  | { why: "notValid"; rules: string[] }
  | { why: "atLimit" };

export type WhyKind = Why["why"];

/** The facts t2c writes the preview sentence from. No words. */
export type CustomSummary = {
  shape: RecipeShape;
  root: RecipeRoot | null;
  scale: LineScale | null;
  chord: ArpeggioChord | null;
  /** The fret the shape starts at, `"root"` resolved. */
  position: number;
  /** Where the index finger starts. */
  handFret: number;
  strings: StringRange;
  subdivision: RecipeSubdivision;
  bars: number;
  direction: RecipeDirection;
  /** The first note: where it is and, where the recipe has a key, its spelled name. */
  firstNote: { string: StringNumber; fret: number; midi: number; name: string | null };
  /** Notes in one time through the shape, and how many times the bars hold it. */
  notesPerPass: number;
  passes: number;
  /** The tempo a first Take starts at, and the pass tempo (both graded rungs). */
  startBpm: number;
  passBpm: number;
};

export type BuildResult = { ok: true; exercise: Exercise; summary: CustomSummary } | { ok: false; why: Why };

// ---------------------------------------------------------------------------
// Constants of the build
// ---------------------------------------------------------------------------

/** Step id every custom Exercise sits under, so its id is `my.<key>`. No pack has a Step called "my". */
export const CUSTOM_STEP_ID = "my";
export const CUSTOM_PATH_ID = "my-exercises";

/** The hand the reach check assumes: the Scales and Modes Path's. */
export const CUSTOM_REACH_LEVEL: PathLevel = "intermediate";

/** Where a first Take starts (mock 17: "Starts at 60 BPM"), unless the pass is slower. */
export const START_BPM = 60;
/** The slowest pass a custom Exercise may have: under it, `unreachable`. */
export const MIN_PASS_BPM = 40;
/** The pass tempo by grid: about two to five notes a second. Lowered to what a hand can play. */
export const PASS_BPM: Readonly<Record<RecipeSubdivision, number>> = {
  quarters: 120,
  eighths: 100,
  eighthTriplets: 90,
  sixteenths: 80,
};

/**
 * Rules of a Path's own structure that a one-Exercise document cannot meet and
 * that say nothing about the Exercise: a Step of three to five, and Levels. Every
 * other rule applies to a custom Exercise exactly as to a pack's.
 */
export const PATH_ONLY_RULES: readonly string[] = ["progress.exerciseCount", "level.missing"];

const NOTE_VALUE: Readonly<Record<RecipeSubdivision, string>> = {
  quarters: "/4",
  eighths: "/8",
  eighthTriplets: "/8t",
  sixteenths: "/16",
};

const SEQUENCE: Readonly<Record<RecipeDirection, Sequence>> = { up: "up", down: "down", upAndBack: "updown" };

const ALL_STRINGS: StringRange = { low: 6, high: 1 };
const MAX_FRET = 22;

const open = (string: number) => STANDARD_TUNING[string - 1];
const pcName = (pc: number): RecipeRoot => RECIPE_ROOTS[((pc % 12) + 12) % 12];

// ---------------------------------------------------------------------------
// Checking a recipe
// ---------------------------------------------------------------------------

const isIn = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);
const isString = (value: unknown): value is StringNumber =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6;

/** The first field outside its closed set, or null. Accepts anything: a tool's arguments come here unchecked. */
export function recipeProblem(recipe: unknown): string | null {
  if (typeof recipe !== "object" || recipe === null) return "recipe";
  const r = recipe as Record<string, unknown>;
  if (r.v !== RECIPE_VERSION) return "v";
  if (!isIn(RECIPE_SHAPES, r.shape)) return "shape";
  if (r.shape !== "chromatic" && !isIn(RECIPE_ROOTS, r.root)) return "root";
  if (r.shape === "box" && !isIn(BOX_SCALES, r.scale)) return "scale";
  if (r.shape === "threePerString" && !isIn(SEVEN_NOTE_SCALES, r.scale)) return "scale";
  if (r.shape === "oneString" && !isIn(LINE_SCALES, r.scale)) return "scale";
  if (r.shape === "arpeggio" && !isIn(ARPEGGIO_CHORDS, r.chord)) return "chord";
  const p = r.position;
  if (p === "root") {
    if (r.shape === "chromatic") return "position";
  } else if (typeof p !== "number" || !Number.isInteger(p) || p < 0 || p > MAX_POSITION) {
    return "position";
  }
  if (!isIn(RECIPE_SUBDIVISIONS, r.subdivision)) return "subdivision";
  if (typeof r.bars !== "number" || !Number.isInteger(r.bars) || r.bars < MIN_BARS || r.bars > MAX_BARS) return "bars";
  if (!isIn(RECIPE_DIRECTIONS, r.direction)) return "direction";
  if (r.shape === "oneString") {
    if (r.string !== undefined && !isString(r.string)) return "string";
  } else if (r.strings !== undefined) {
    const s = r.strings as Record<string, unknown> | null;
    if (typeof s !== "object" || s === null || !isString(s.low) || !isString(s.high) || s.low < s.high) return "strings";
    const count = (s.low as number) - (s.high as number) + 1;
    const fewest = r.shape === "arpeggio" ? 3 : r.shape === "threePerString" ? 2 : 1;
    if (count < fewest) return "strings";
  }
  return null;
}

// ---------------------------------------------------------------------------
// One time through the shape, from the templates
// ---------------------------------------------------------------------------

const stringsOf = (r: Recipe): StringRange =>
  r.shape === "oneString" ? { low: r.string ?? 6, high: r.string ?? 6 } : (r.strings ?? ALL_STRINGS);

/** Low to high: `[6, 5, 4]`. */
const stringList = (range: StringRange): number[] => {
  const out: number[] = [];
  for (let s = range.low; s >= range.high; s -= 1) out.push(s);
  return out;
};

const cellsOfTab = (tab: string): FretCell[] =>
  [...tab.matchAll(/(\d):(\d+)/g)].map((m) => ({ string: Number(m[1]), fret: Number(m[2]) }));

const chordSymbol = (root: RecipeRoot, chord: ArpeggioChord) => `${root}${chordSuffix(chord as ChordQuality)}`;

/** Pitch classes of the recipe's key, or null for the chromatic shape. */
function keyPcs(r: Recipe): Set<number> | null {
  if (r.shape === "chromatic") return null;
  if (r.shape === "arpeggio") return new Set(chordPcs(chordSymbol(r.root, r.chord)));
  return new Set(scalePcs(r.root, r.scale as ScaleId));
}

type Shape = { kind: "shape"; cells: FretCell[] } | { kind: "none" } | { kind: "offNeck" };

const onNeck = (cells: readonly FretCell[]) => cells.length > 0 && cells.every((c) => c.fret >= 0 && c.fret <= MAX_FRET);

/** Every box (1 to 5, an octave down, as written, an octave up) cut to the strings, by the fret it starts at. */
function boxesByStart(r: BoxRecipe): Map<number, FretCell[]> {
  // A major pentatonic is its relative minor's box: the same five notes.
  const boxRoot = r.scale === "majorPentatonic" ? pcName(pcOfName(r.root) + 9) : r.root;
  const scale = r.scale === "blues" ? "blues" : "minorPentatonic";
  const strings = stringList(stringsOf(r));
  const out = new Map<number, FretCell[]>();
  for (const octave of [-12, 0, 12]) {
    for (let box = 1; box <= 5; box += 1) {
      const cells = boxCells(boxRoot, box, scale)
        .filter((c) => strings.includes(c.string))
        .map((c) => ({ string: c.string, fret: c.fret + octave }));
      if (cells.length === 0 || cells.some((c) => c.fret < 0)) continue;
      const start = cells[0].fret;
      // Two boxes cut to a few strings can start on one fret: the lower box number wins, always.
      if (!out.has(start)) out.set(start, cells);
    }
  }
  return out;
}

/** The shape at fret `p`, ascending, one time through, before the direction is applied. */
function shapeAt(r: Recipe, p: number): Shape {
  const range = stringsOf(r);
  const strings = stringList(range);
  const low = range.low;
  const pcs = keyPcs(r);
  const startsOnKey = pcs === null || pcs.has((open(low) + p) % 12);
  try {
    switch (r.shape) {
      case "box": {
        const cells = boxesByStart(r).get(p);
        if (!cells) return { kind: "none" };
        return onNeck(cells) ? { kind: "shape", cells } : { kind: "offNeck" };
      }
      case "threePerString": {
        if (!startsOnKey) return { kind: "none" };
        const cells = threeNpsCells({ root: r.root, scale: r.scale, string: low, fret: p, strings: strings.length });
        return onNeck(cells) ? { kind: "shape", cells } : { kind: "offNeck" };
      }
      case "arpeggio": {
        if (!startsOnKey) return { kind: "none" };
        const { up } = arpeggioCells({ chord: chordSymbol(r.root, r.chord), strings, near: p });
        if (up[0].fret !== p) return { kind: "none" };
        return onNeck(up) ? { kind: "shape", cells: up } : { kind: "offNeck" };
      }
      case "oneString": {
        if (!startsOnKey) return { kind: "none" };
        // Three scale steps a group, a step higher each group, until the last group ends an octave up.
        const groups = new Set(scalePcs(r.root, r.scale as ScaleId)).size - 1;
        const tab = oneStringClimb({ root: r.root, scale: r.scale as ScaleId, string: low, from: p, cell: [0, 1, 2], bars: groups });
        const cells = cellsOfTab(tab);
        return onNeck(cells) ? { kind: "shape", cells } : { kind: "offNeck" };
      }
      case "chromatic": {
        if (p < 1) return { kind: "none" };
        const cells = cellsOfTab(acrossStrings({ cell: [0, 1, 2, 3], strings, fret: p }));
        return onNeck(cells) ? { kind: "shape", cells } : { kind: "offNeck" };
      }
    }
  } catch {
    // A template that runs off the neck or below the nut says so by throwing.
    return { kind: "offNeck" };
  }
}

/** The frets 0 to 15 the recipe's shape starts at and fits on the neck from, lowest first. */
export function positionsFor(recipe: Recipe): number[] {
  const out: number[] = [];
  for (let p = 0; p <= MAX_POSITION; p += 1) if (shapeAt(recipe, p).kind === "shape") out.push(p);
  return out;
}

/** `"root"` as a fret: the root on the shape's lowest string, between the nut and fret 11. */
export function resolvePosition(recipe: Recipe): number {
  if (recipe.position !== "root") return recipe.position;
  if (recipe.shape === "chromatic") return 1;
  return (pcOfName(recipe.root) - open(stringsOf(recipe).low) + 120) % 12;
}

// ---------------------------------------------------------------------------
// The id
// ---------------------------------------------------------------------------

/**
 * The key of a recipe: every field, in one order, `"root"` resolved, defaults
 * written out. Two recipes with the same notes have the same key; the version
 * is in it, so a recipe of another version never shares an id.
 */
export function recipeKey(recipe: Recipe): string {
  const range = stringsOf(recipe);
  const music =
    recipe.shape === "chromatic"
      ? []
      : [recipe.root.toLowerCase().replace("#", "s"), (recipe.shape === "arpeggio" ? `chord${recipe.chord}` : recipe.scale).toLowerCase()];
  return [
    `v${recipe.v}`,
    recipe.shape.toLowerCase(),
    ...music,
    `s${range.low}${range.high}`,
    `f${resolvePosition(recipe)}`,
    recipe.subdivision.toLowerCase(),
    `${recipe.bars}b`,
    recipe.direction.toLowerCase(),
  ].join("-");
}

/** The Exercise id: `my.<key>`. A pack id is `<step>.<exercise>` and no pack has a Step "my". */
export function customExerciseId(recipe: Recipe): string {
  return `${CUSTOM_STEP_ID}.${recipeKey(recipe)}`;
}

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

const fail = (why: Why): BuildResult => ({ ok: false, why });

/** The one-Exercise Path a custom Exercise is built and validated in. */
function wrapperSpec(exercise: ExerciseSpec): PathSpec {
  return {
    id: CUSTOM_PATH_ID,
    title: "My exercises",
    kind: "mechanics",
    goal: "Exercises a player made from a recipe: a shape, a key, a position and a length.",
    level: CUSTOM_REACH_LEVEL,
    assumes: "Nothing beyond the recipe: it is not part of any Path and passes nothing.",
    orderRationale: "One Exercise, so there is no order to explain.",
    gradingLimits: "Timing evenness and notes heard are graded, with the default pass marks. Nothing else is.",
    labelSubdivisions: true,
    steps: [
      {
        id: CUSTOM_STEP_ID,
        title: "My exercises",
        goal: "Play the Exercise the recipe describes, in time, every note heard.",
        why: "A custom Exercise is the shape the player asked for, built by the same generator the Paths are written with.",
        howTo: ["Play it as written, with the click."],
        payoff: "The shape under the fingers, in time.",
        exercises: [exercise],
      },
    ],
  };
}

/** A custom Exercise as the one-Exercise Path document `validatePath` reads. */
export function customPathDoc(exercise: Exercise): PathDoc {
  const doc = buildPath(wrapperSpec(placeholderSpec()));
  const exercises = [exercise];
  return {
    ...doc,
    estimatedMinutes: exercise.estimatedMinutes,
    steps: [{ ...doc.steps[0], exercises, difficulty: stepDifficulty({ exercises }) }],
  };
}

/** Errors in a custom Exercise's document, the Path-only rules left out. */
export function customIssues(exercise: Exercise): Issue[] {
  return validatePath(customPathDoc(exercise)).filter((i) => i.severity === "error" && !PATH_ONLY_RULES.includes(i.rule));
}

function placeholderSpec(): ExerciseSpec {
  return {
    id: "placeholder",
    title: "Placeholder",
    purpose: "Holds the place of the Exercise being checked.",
    howTo: ["Play it."],
    coach: "Play it.",
    tab: "/1 6:5",
    position: 5,
    rungs: [60],
    grade: "timing",
    minutes: 5,
  };
}

const floor5 = (bpm: number) => Math.floor(bpm / 5) * 5;

/** The tab: the shape `passes` times, bar lines where they fall, the last note held to the bar line. */
function tabFor(cells: readonly FretCell[], recipe: Recipe, perBar: number, passes: number, leftover: number): string {
  const line = Array.from({ length: passes }, () => cells).flat();
  const tokens: string[] = [NOTE_VALUE[recipe.subdivision]];
  line.forEach((c, i) => {
    if (i > 0 && i % perBar === 0) tokens.push("|");
    tokens.push(`${c.string}:${c.fret}`);
  });
  if (leftover > 0) tokens.push("hold");
  return tokens.join(" ");
}

/**
 * Where the index finger starts: under the first fretted note, as low as the notes
 * around it in the first bar ask, never more than three frets below it. `handAt`
 * (the lowest fret of the first bar) is right for a line that starts at the bottom
 * of its shape and wrong for one that starts at the top and comes down.
 */
function handFret(line: readonly FretCell[], perBar: number): number {
  const firstBar = line.slice(0, perBar).filter((c) => c.fret > 0);
  if (firstBar.length === 0) return 1;
  const first = firstBar[0].fret;
  return Math.min(...firstBar.map((c) => c.fret).filter((f) => f >= first - 3 && f <= first));
}

function nearestTo(p: number, starts: readonly number[]): number[] {
  const below = starts.filter((s) => s < p).slice(-1);
  const above = starts.filter((s) => s > p).slice(0, 1);
  return [...below, ...above];
}

/**
 * Build the Exercise a recipe describes, or say why not. Never throws: anything
 * the templates or the generator throw on is a refusal.
 */
export function buildCustomExercise(recipe: Recipe): BuildResult {
  const problem = recipeProblem(recipe);
  if (problem) return fail({ why: "badRecipe", field: problem });
  try {
    return build(recipe);
  } catch (error) {
    return fail({ why: "notValid", rules: [`threw: ${(error as Error).message}`] });
  }
}

function build(recipe: Recipe): BuildResult {
  const position = resolvePosition(recipe);
  const shape = shapeAt(recipe, position);
  if (shape.kind === "none") {
    const starts: number[] = [];
    for (let p = 0; p <= MAX_POSITION; p += 1) if (shapeAt(recipe, p).kind !== "none") starts.push(p);
    return fail({ why: "noShapeHere", nearest: nearestTo(position, starts) });
  }
  if (shape.kind === "offNeck") return fail({ why: "outOfRange" });

  const cells = sequenced(shape.cells, SEQUENCE[recipe.direction]);
  const slot = SUBDIVISION_TICKS[recipe.subdivision];
  const perBar = barLengthTicks({ numerator: 4, denominator: 4 }) / slot;
  const slots = recipe.bars * perBar;
  const passes = Math.floor(slots / cells.length);
  if (passes === 0) return fail({ why: "tooManyNotes", needsBars: Math.ceil(cells.length / perBar) });
  const leftover = slots - passes * cells.length;
  if (leftover >= perBar) return fail({ why: "tooFewNotes", fillsBars: Math.ceil((passes * cells.length) / perBar) });

  const tab = tabFor(cells, recipe, perBar, passes, leftover);
  const range = stringsOf(recipe);
  const harmony: HarmonySpec | undefined =
    recipe.shape === "chromatic"
      ? undefined
      : recipe.shape === "arpeggio"
        ? { arpeggio: chordSymbol(recipe.root, recipe.chord), cover: false }
        : { scale: [recipe.root, recipe.scale], cover: false };
  const id = recipeKey(recipe);
  const spec = (rungs: readonly number[], passAt: number): ExerciseSpec => ({
    id,
    title: `My exercise ${id}`,
    purpose: "An Exercise made from a recipe: the shape, the key, the position and the length the player chose.",
    howTo: ["Play it as written, with the click."],
    coach: "Timing and notes heard are graded here; nothing else is.",
    tab,
    position: handFret(cells, perBar),
    shifts: true,
    // Up and back walks into its own start. Straight up or down would leap from the top to the bottom.
    loops: recipe.direction === "upAndBack",
    ...(harmony ? { harmony } : {}),
    rungs,
    passAt,
    grade: "timing",
    minutes: 5,
  });
  const exerciseOf = (s: ExerciseSpec) => buildPath(wrapperSpec(s)).steps[0].exercises[0];

  // A first build tells the fastest a hand plays it; the ladder is set under that.
  const probe = exerciseOf(spec([START_BPM], START_BPM));
  const maxBpm = probe.computed.maxPlayableBpm;
  const pass = Math.min(PASS_BPM[recipe.subdivision], floor5(maxBpm));
  if (pass < MIN_PASS_BPM) return fail({ why: "unreachable", maxBpm });
  const start = Math.min(START_BPM, pass);
  const exercise = exerciseOf(spec(paceLadder(pass, pass, start), pass));

  const errors = customIssues(exercise);
  if (errors.length > 0) {
    const reach = errors.every((e) => e.rule.startsWith("reach."));
    if (reach) return fail({ why: "unreachable", maxBpm });
    return fail({ why: "notValid", rules: [...new Set(errors.map((e) => e.rule))] });
  }

  const first = exercise.notes[0];
  const summary: CustomSummary = {
    shape: recipe.shape,
    root: recipe.shape === "chromatic" ? null : recipe.root,
    scale: recipe.shape === "chromatic" || recipe.shape === "arpeggio" ? null : recipe.scale,
    chord: recipe.shape === "arpeggio" ? recipe.chord : null,
    position,
    handFret: exercise.position.fret,
    strings: range,
    subdivision: recipe.subdivision,
    bars: exercise.bars,
    direction: recipe.direction,
    firstNote: { string: first.string as StringNumber, fret: first.fret, midi: first.midi, name: spelledName(recipe, first.midi) },
    notesPerPass: cells.length,
    passes,
    startBpm: exercise.tempo.rungs.find((r) => r.grading === "graded")?.bpm ?? start,
    passBpm: exercise.tempo.passAtBpm ?? pass,
  };
  return { ok: true, exercise, summary };
}

/** A note's name as the key spells it (Eb in A blues), or null for the chromatic shape. */
function spelledName(recipe: Recipe, midi: number): string | null {
  if (recipe.shape === "chromatic") return null;
  const names =
    recipe.shape === "arpeggio" ? spellChord(chordSymbol(recipe.root, recipe.chord)) : spellScale(recipe.root, recipe.scale as ScaleId);
  const pcs = recipe.shape === "arpeggio" ? chordPcs(chordSymbol(recipe.root, recipe.chord)) : scalePcs(recipe.root, recipe.scale as ScaleId);
  const at = pcs.indexOf(((midi % 12) + 12) % 12);
  return at >= 0 ? names[at] : null;
}

// ---------------------------------------------------------------------------
// The variant chips (mock 17: "Sixteenths instead", "Next position")
// ---------------------------------------------------------------------------

export type RecipeChange =
  | { change: "subdivision"; to: RecipeSubdivision }
  | { change: "nextPosition" }
  | { change: "previousPosition" }
  | { change: "moreBars" }
  | { change: "fewerBars" }
  | { change: "otherDirection" };

export type NextResult =
  | { ok: true; recipe: Recipe; exercise: Exercise; summary: CustomSummary }
  | { ok: false; recipe: Recipe | null; why: Why };

/**
 * The recipe one chip away, built. `ok: false` with `recipe: null` when there is
 * no such change from here (`atLimit`); with the recipe when it exists but does
 * not build, and the reason. Never a guess: a next position that a hand cannot
 * play is reported as that, not skipped.
 */
export function nextRecipe(recipe: Recipe, change: RecipeChange): NextResult {
  const problem = recipeProblem(recipe);
  if (problem) return { ok: false, recipe: null, why: { why: "badRecipe", field: problem } };
  const atLimit: NextResult = { ok: false, recipe: null, why: { why: "atLimit" } };
  let next: Recipe;
  switch (change.change) {
    case "subdivision":
      if (change.to === recipe.subdivision || !isIn(RECIPE_SUBDIVISIONS, change.to)) return atLimit;
      next = { ...recipe, subdivision: change.to };
      break;
    case "nextPosition":
    case "previousPosition": {
      const here = resolvePosition(recipe);
      const all = positionsFor(recipe);
      const to = change.change === "nextPosition" ? all.find((p) => p > here) : all.filter((p) => p < here).pop();
      if (to === undefined) return atLimit;
      next = { ...recipe, position: to };
      break;
    }
    case "moreBars":
      if (recipe.bars >= MAX_BARS) return atLimit;
      next = { ...recipe, bars: recipe.bars + 1 };
      break;
    case "fewerBars":
      if (recipe.bars <= MIN_BARS) return atLimit;
      next = { ...recipe, bars: recipe.bars - 1 };
      break;
    case "otherDirection":
      if (recipe.direction === "upAndBack") return atLimit;
      next = { ...recipe, direction: recipe.direction === "up" ? "down" : "up" };
      break;
  }
  const built = buildCustomExercise(next);
  return built.ok ? { ok: true, recipe: next, exercise: built.exercise, summary: built.summary } : { ok: false, recipe: next, why: built.why };
}
