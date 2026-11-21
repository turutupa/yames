/**
 * `make_exercise` (TOOLS 2.4, DESIGN 13, mock 17; leg t2c): a custom Exercise
 * from a recipe, shown before it is made, made by one press.
 *
 * - `propose` turns the call into a recipe (`recipeOf`), builds it with t2a's
 *   `buildCustomExercise` and returns the proposal with its preview: the
 *   generator's facts, one pass of the notes, and the variant chips
 *   ("Sixteenths instead", "Next position"), each a full call that proposes
 *   again. What the generator cannot build is refused with its reason as a
 *   sentence, and the nearest recipe that DOES build offered as a chip; never
 *   a nearest guess made in the player's place.
 * - `commit` adds the recipe through the host (`addMyExercise`: the store's
 *   one writer, `updateMyExercises`), nothing before the press. The receipt
 *   says the app is at it until the store answers, and carries the Undo:
 *   `undo_make_exercise`, an app-only tool that takes out that one entry (its
 *   recipe key and its date) and nothing else.
 *
 * Never while a Take runs (the runner), nor while a jam take is being written
 * (here). Stores the recipe, never the notes.
 *
 * The generator is not in the shell's first load (t2b found it slowed it):
 * it is imported the first time Ask runs this tool (`loadExerciseGenerator`,
 * which `askTools.ts` awaits before the call), and only its types are here.
 */
import type * as Custom from "../../paths/custom";
import type { Recipe, RecipeSubdivision, Why } from "../../paths/custom";
import { ROOT_NAMES, SCALE_NAMES } from "../blocks/spec";
import { chordSymbolOf } from "../../session/myExerciseWords";
import {
  argNumber,
  argString,
  defineConfirmTool,
  line,
  notWiredYet,
  refuse,
  takeRunning,
  type ConfirmTool,
  type ExercisePreview,
  type Line,
  type ProposeResult,
  type Refusal,
  type ToolArgs,
  type ToolChoice,
  type ToolResult,
} from "./types";
import type { CoachToolHost } from "./host";

// ---------------------------------------------------------------------------
// The generator, loaded on first use
// ---------------------------------------------------------------------------

type Generator = typeof Custom;

let generator: Generator | null = null;
let loading: Promise<Generator | null> | null = null;

/** The generator if it is loaded, else null (the tool then says so and the next call has it). */
export function exerciseGenerator(): Generator | null {
  return generator;
}

/** Load the generator once. A failed load is tried again by the next call. */
export function loadExerciseGenerator(): Promise<Generator | null> {
  loading ??= import("../../paths/custom").then(
    (module) => (generator = module),
    (error) => {
      console.warn("[yames] could not load the exercise maker", error);
      loading = null;
      return null;
    },
  );
  return loading;
}

// ---------------------------------------------------------------------------
// The closed sets (written out so this file loads no generator; a test holds them to `custom.ts`'s)
// ---------------------------------------------------------------------------

export const MAKE_SHAPES = ["box", "threePerString", "arpeggio", "oneString", "chromatic"] as const;
export const MAKE_BOX_SCALES = ["minorPentatonic", "majorPentatonic", "blues"] as const;
export const MAKE_SEVEN_SCALES = ["major", "naturalMinor", "harmonicMinor", "dorian", "mixolydian"] as const;
export const MAKE_CHORDS = ["maj", "min", "dim", "aug", "7", "maj7", "m7", "m7b5", "dim7"] as const;
export const MAKE_SUBDIVISIONS = ["quarters", "eighths", "eighthTriplets", "sixteenths"] as const;
export const MAKE_DIRECTIONS = ["up", "down", "upAndBack"] as const;
/** `custom.ts`'s `RECIPE_ROOTS`, by pitch class from C. */
export const MAKE_ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
export const MAKE_MAX_POSITION = 15;
export const MAKE_MAX_BARS = 8;

/** What a recipe left unsaid becomes (mock 17: eighths, up the box and back down). */
const DEFAULT_SUBDIVISION: RecipeSubdivision = "eighths";
const DEFAULT_DIRECTION = "upAndBack";

/** Mock 17's other subdivision chip: from eighths, sixteenths; from any other, eighths. */
const OTHER_SUBDIVISION: Readonly<Record<RecipeSubdivision, RecipeSubdivision>> = {
  quarters: "eighths",
  eighths: "sixteenths",
  eighthTriplets: "eighths",
  sixteenths: "eighths",
};

const isIn = (list: readonly string[], value: string | undefined): boolean => value !== undefined && list.includes(value);

const LETTER_PC: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A root as the player names it ("A#", "Bb") → the recipe's spelling of that pitch class ("Bb"). */
export function recipeRoot(name: string): (typeof MAKE_ROOTS)[number] | null {
  const m = /^([A-G])(#|b)?$/.exec(name);
  if (!m) return null;
  const pc = (LETTER_PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
  return MAKE_ROOTS[pc];
}

// ---------------------------------------------------------------------------
// A call → a recipe → an Exercise
// ---------------------------------------------------------------------------

const why = (key: string, values: Record<string, string | number> = {}, choices?: readonly ToolChoice[]): Refusal =>
  refuse("notFound", `coachTools.why.make.${key}`, values, choices && choices.length > 0 ? { choices } : {});

/** The recipe a call describes, its length still to settle when `bars` was left out. Or what is missing. */
export function recipeOf(args: ToolArgs): { recipe: Recipe; barsAsked: boolean } | Refusal {
  const scale = argString(args, "scale");
  const chord = argString(args, "chord");
  const rootName = argString(args, "root");
  const asked = argString(args, "shape");
  const shape =
    asked ?? (chord !== undefined ? "arpeggio" : isIn(MAKE_BOX_SCALES, scale) ? "box" : isIn(MAKE_SEVEN_SCALES, scale) ? "threePerString" : undefined);
  if (shape === undefined) return scale !== undefined ? why("scale", { scale }) : why("what");
  if (chord !== undefined && shape !== "arpeggio") return why("mixed");
  if (scale !== undefined && (shape === "arpeggio" || shape === "chromatic")) return why("mixed");
  const bars = argNumber(args, "bars");
  const common = {
    v: 1 as const,
    position: argNumber(args, "position") ?? ("root" as const),
    subdivision: (argString(args, "subdivision") ?? DEFAULT_SUBDIVISION) as RecipeSubdivision,
    bars: bars ?? 1,
    direction: (argString(args, "direction") ?? DEFAULT_DIRECTION) as Recipe["direction"],
  };
  const barsAsked = bars !== undefined;
  if (shape === "chromatic") return { recipe: { ...common, shape }, barsAsked };
  const root = rootName === undefined ? null : recipeRoot(rootName);
  if (root === null) return why("root");
  switch (shape) {
    case "arpeggio":
      if (chord === undefined) return why("chord");
      return { recipe: { ...common, shape, root, chord: chord as (typeof MAKE_CHORDS)[number] }, barsAsked };
    case "box":
      if (scale === undefined) return why("needScale");
      if (!isIn(MAKE_BOX_SCALES, scale)) return why("boxScale", { scale });
      return { recipe: { ...common, shape, root, scale: scale as (typeof MAKE_BOX_SCALES)[number] }, barsAsked };
    case "threePerString":
      if (scale === undefined) return why("needScale");
      if (!isIn(MAKE_SEVEN_SCALES, scale)) return why("threeScale", { scale });
      return { recipe: { ...common, shape, root, scale: scale as (typeof MAKE_SEVEN_SCALES)[number] }, barsAsked };
    case "oneString":
      if (scale === undefined) return why("needScale");
      if (!isIn(MAKE_BOX_SCALES, scale) && !isIn(MAKE_SEVEN_SCALES, scale)) return why("scale", { scale });
      return { recipe: { ...common, shape, root, scale: scale as Custom.LineScale }, barsAsked };
    default:
      return why("what");
  }
}

type Made = { recipe: Recipe; built: Custom.BuildResult & { ok: true } };

/**
 * Build what a call describes. Left out, the length is the fewest bars one time
 * through fits in (mock 17: three); asked, it is built as asked or refused.
 */
export function makeFrom(args: ToolArgs, gen: Generator): Made | { recipe: Recipe; why: Why } | Refusal {
  const asked = recipeOf(args);
  if ("ok" in asked) return asked;
  let recipe = asked.recipe;
  let built = gen.buildCustomExercise(recipe);
  if (!built.ok && !asked.barsAsked && built.why.why === "tooManyNotes" && built.why.needsBars <= MAKE_MAX_BARS) {
    recipe = { ...recipe, bars: built.why.needsBars };
    built = gen.buildCustomExercise(recipe);
  }
  return built.ok ? { recipe, built } : { recipe, why: built.why };
}

const builds = (args: ToolArgs, gen: Generator): boolean => "built" in makeFrom(args, gen);

/** `args` with one change; `bars` dropped when the player never said it, so the length fits the new notes. */
function changed(args: ToolArgs, barsAsked: boolean, change: Record<string, string | number>): ToolArgs {
  const out: Record<string, string | number> = { ...args, ...change };
  if (!barsAsked) delete out.bars;
  return out;
}

const callOf = (args: ToolArgs) => ({ tool: "make_exercise", args });

/** The chips that offer the nearest recipe that builds, after a refusal. Each checked to build. */
function nearestChoices(args: ToolArgs, made: { recipe: Recipe; why: Why }, gen: Generator): ToolChoice[] {
  const barsAsked = argNumber(args, "bars") !== undefined;
  const at = gen.resolvePosition(made.recipe);
  const offers: Array<{ label: Line; args: ToolArgs }> = [];
  switch (made.why.why) {
    case "noShapeHere":
      for (const fret of made.why.nearest) offers.push({ label: line("coachTools.make.chip.fret", { fret }), args: changed(args, barsAsked, { position: fret }) });
      break;
    case "outOfRange": {
      const below = gen.positionsFor(made.recipe).filter((p) => p < at).pop();
      if (below !== undefined) offers.push({ label: line("coachTools.make.chip.fret", { fret: below }), args: changed(args, barsAsked, { position: below }) });
      break;
    }
    case "tooManyNotes":
      if (made.why.needsBars <= MAKE_MAX_BARS) offers.push({ label: line("coachTools.make.chip.bars", { count: made.why.needsBars }), args: { ...args, bars: made.why.needsBars } });
      break;
    case "tooFewNotes":
      offers.push({ label: line("coachTools.make.chip.bars", { count: made.why.fillsBars }), args: { ...args, bars: made.why.fillsBars } });
      break;
    default:
      break;
  }
  return offers.filter((o) => builds(o.args, gen)).map((o) => ({ label: o.label, call: callOf(o.args) }));
}

/** The generator's reason, as the player reads it. */
function refusalOf(args: ToolArgs, made: { recipe: Recipe; why: Why }, gen: Generator): Refusal {
  const choices = nearestChoices(args, made, gen);
  const fret = gen.resolvePosition(made.recipe);
  switch (made.why.why) {
    case "noShapeHere":
      return why("noShapeHere", { fret }, choices);
    case "outOfRange":
      return why("outOfRange", { fret }, choices);
    case "tooManyNotes":
      return made.why.needsBars <= MAKE_MAX_BARS ? why("tooManyNotes", { count: made.why.needsBars }, choices) : why("tooLong", { count: MAKE_MAX_BARS });
    case "tooFewNotes":
      return why("tooFewNotes", { count: made.why.fillsBars }, choices);
    case "unreachable":
      return why("unreachable");
    default:
      return why("notMade");
  }
}

/** The variant chips (mock 17): the other subdivision, the next position. Only those that build. */
function variantsOf(args: ToolArgs, recipe: Recipe, barsAsked: boolean, gen: Generator): ToolChoice[] {
  const out: ToolChoice[] = [];
  const other = OTHER_SUBDIVISION[recipe.subdivision];
  const sub = changed(args, barsAsked, { subdivision: other });
  if (builds(sub, gen)) out.push({ label: line(`coachTools.make.chip.${other}`), call: callOf(sub) });
  const next = gen.nextRecipe(recipe, { change: "nextPosition" });
  if (next.recipe && typeof next.recipe.position === "number") {
    const moved = changed(args, barsAsked, { position: next.recipe.position });
    if (builds(moved, gen)) out.push({ label: line("coachTools.make.chip.nextPosition"), call: callOf(moved) });
  }
  return out;
}

/** What the receipt names: the shape's words' values (`toolWords` makes them the shape's sentence). */
function wordsOf(s: Custom.CustomSummary): Record<string, string | number> {
  return {
    shape: s.shape,
    root: s.root ?? "",
    scale: s.scale ?? "",
    chord: s.chord !== null && s.root ? chordSymbolOf(s.root, s.chord) : "",
    position: s.position,
    string: s.firstNote.string,
  };
}

/** A jam take being written counts as a Take here (the owner's rule). A read that throws: yes. */
function jamTake(host: CoachToolHost): boolean {
  try {
    return host.jamTakeRunning();
  } catch {
    return true;
  }
}

const loadingNow = (): Refusal => {
  void loadExerciseGenerator();
  return refuse("notNow", "coachTools.why.make.loading");
};

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

type MakeResolved = { recipe: Recipe; key: string; words: Record<string, string | number> };

const makeExercise = defineConfirmTool<MakeResolved>({
  name: "make_exercise",
  kind: "confirm",
  audience: "player",
  note: "Make a custom Exercise from a recipe and add it to My exercises, shown as a preview first.",
  args: [
    {
      name: "shape",
      type: { kind: "enum", values: MAKE_SHAPES },
      optional: true,
      note: "box (a pentatonic or blues box), threePerString, arpeggio, oneString, chromatic. Left out: from the scale or the chord.",
    },
    { name: "root", type: { kind: "enum", values: ROOT_NAMES }, optional: true, note: "The root. Needed for every shape but chromatic." },
    {
      name: "scale",
      type: { kind: "enum", values: SCALE_NAMES },
      optional: true,
      note: "The scale: a box takes minorPentatonic, majorPentatonic or blues; threePerString takes major, naturalMinor, harmonicMinor, dorian or mixolydian.",
    },
    { name: "chord", type: { kind: "enum", values: MAKE_CHORDS }, optional: true, note: "The arpeggio's chord. Only with an arpeggio." },
    {
      name: "position",
      type: { kind: "integer", min: 0, max: MAKE_MAX_POSITION },
      optional: true,
      note: "The fret the shape starts at on its lowest string. Left out: where the root is.",
    },
    { name: "subdivision", type: { kind: "enum", values: MAKE_SUBDIVISIONS }, optional: true, note: "Notes per beat. Left out: eighths." },
    { name: "bars", type: { kind: "integer", min: 1, max: MAKE_MAX_BARS }, optional: true, note: "How long. Left out: what one time through needs." },
    { name: "direction", type: { kind: "enum", values: MAKE_DIRECTIONS }, optional: true, note: "Which way. Left out: up and back down." },
  ],
  when: (ctx) => !takeRunning(ctx),
  propose(args, host): ProposeResult<MakeResolved> {
    if (jamTake(host)) return refuse("notNow", "coachTools.why.notNow.take");
    const gen = exerciseGenerator();
    if (!gen) return loadingNow();
    const made = makeFrom(args, gen);
    if ("ok" in made) return made;
    if ("why" in made) return refusalOf(args, made, gen);
    const { recipe, built } = made;
    const barsAsked = argNumber(args, "bars") !== undefined;
    const preview: ExercisePreview = Object.freeze({
      summary: Object.freeze({ ...built.summary }),
      notes: Object.freeze(built.exercise.notes.slice(0, built.summary.notesPerPass).map((n) => Object.freeze({ string: n.string, fret: n.fret }))),
      variants: Object.freeze(variantsOf(args, recipe, barsAsked, gen)),
    });
    return {
      ok: true,
      line: line("coachTools.propose.makeExercise"),
      resolved: { recipe, key: gen.recipeKey(recipe), words: wordsOf(built.summary) },
      preview,
    };
  },
  commit({ recipe, key, words }, host): ToolResult {
    if (jamTake(host)) return refuse("notNow", "coachTools.why.notNow.take");
    const gen = exerciseGenerator();
    if (!gen) return loadingNow();
    // Made from what was shown, or not at all (a later generator in the same run cannot happen; a bug can).
    const again = gen.buildCustomExercise(recipe);
    if (!again.ok || gen.recipeKey(recipe) !== key) return refuse("refused", "coachTools.why.refused.proposal", {}, { detail: "the recipe no longer builds" });
    const addedAt = Date.now();
    const asked = host.addMyExercise(recipe, addedAt);
    if (asked === "notWiredYet") return notWiredYet("make_exercise");
    const later = asked.then(
      (outcome): Line => (outcome === "added" ? line("coachTools.receipt.makeExercise", words) : line(`coachTools.why.make.${outcome}`)),
      (): Line => line("coachTools.why.make.failed"),
    );
    const listShown = host.view() === "paths" && host.pathsAt().pathId === null;
    return {
      ok: true,
      receipt: line("coachTools.receipt.makeExerciseAdding", words),
      later,
      undo: { tool: "undo_make_exercise", args: { key, at: String(addedAt) } },
      ...(listShown ? {} : { next: [{ label: line("coachTools.make.openList"), call: { tool: "go_to", args: { screen: "paths" } } }] }),
    };
  },
});

type UndoResolved = { key: string; at: number };

/** `make_exercise`'s Undo: the app's own, reached only through the receipt's issued Undo. */
const undoMakeExercise = defineConfirmTool<UndoResolved>({
  name: "undo_make_exercise",
  kind: "confirm",
  audience: "app",
  note: "Take back out of My exercises the one entry make_exercise just added.",
  args: [
    { name: "key", type: { kind: "appId", maxLength: 200 }, note: "The recipe's key." },
    { name: "at", type: { kind: "appId", maxLength: 20 }, note: "When it was added (ms)." },
  ],
  when: (ctx) => !takeRunning(ctx),
  propose(args) {
    const key = argString(args, "key") ?? "";
    const at = Number(argString(args, "at"));
    if (!key || !Number.isFinite(at)) return refuse("refused", "coachTools.why.refused.proposal", {}, { detail: "not an undo of an add" });
    return { ok: true, line: line("coachTools.propose.undoMakeExercise"), resolved: { key, at } };
  },
  commit({ key, at }, host): ToolResult {
    const asked = host.undoAddedExercise(key, at);
    if (asked === "notWiredYet") return notWiredYet("make_exercise");
    const later = asked.then(
      (outcome): Line => (outcome === "undone" ? line("coachTools.receipt.undoMakeExercise") : line(`coachTools.why.make.undo.${outcome}`)),
      (): Line => line("coachTools.why.make.undo.failed"),
    );
    return { ok: true, receipt: line("coachTools.receipt.undoMakeExerciseDoing"), later };
  },
});

export const MAKE_TOOLS: readonly ConfirmTool[] = [makeExercise, undoMakeExercise];
