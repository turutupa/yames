/**
 * The recipes the custom-Exercise tests walk, and the schedules the Rust scorer
 * reads from them (`src-tauri/tests/path_fixtures/custom_schedules.jsonl`, written
 * by `node scripts/custom-exercises.mjs gen`). Pure, so the vitest suite and the
 * script see the same grid.
 */
import { buildCustomExercise, customPathDoc, RECIPE_DIRECTIONS, RECIPE_SUBDIVISIONS } from "./custom";
import type { BuildResult, Recipe, RecipePosition } from "./custom";
import { scheduleFixtures } from "./pipeline";

/** A recipe without its position, grid, length and direction (`Omit` taken over each shape of the union). */
type Music = Recipe extends infer R ? (R extends Recipe ? Omit<R, "v" | "position" | "subdivision" | "bars" | "direction"> : never) : never;

/** One of each kind of music per shape. */
const MUSIC: readonly Music[] = [
  { shape: "box", root: "A", scale: "minorPentatonic" },
  { shape: "box", root: "C", scale: "majorPentatonic" },
  { shape: "box", root: "E", scale: "blues" },
  { shape: "box", root: "G", scale: "minorPentatonic", strings: { low: 3, high: 1 } },
  { shape: "threePerString", root: "G", scale: "major" },
  { shape: "threePerString", root: "A", scale: "harmonicMinor" },
  { shape: "threePerString", root: "D", scale: "dorian", strings: { low: 5, high: 2 } },
  { shape: "arpeggio", root: "A", chord: "min" },
  { shape: "arpeggio", root: "C", chord: "maj7", strings: { low: 5, high: 2 } },
  { shape: "arpeggio", root: "E", chord: "7", strings: { low: 4, high: 1 } },
  { shape: "oneString", root: "A", scale: "naturalMinor", string: 1 },
  { shape: "oneString", root: "E", scale: "minorPentatonic", string: 6 },
  { shape: "oneString", root: "Bb", scale: "mixolydian", string: 3 },
  { shape: "chromatic" },
  { shape: "chromatic", strings: { low: 4, high: 1 } },
];

const POSITIONS: readonly RecipePosition[] = ["root", 0, 1, 3, 5, 7, 8, 10, 12, 15];
const BARS: readonly number[] = [1, 2, 3, 4, 8];

/** Every music × position × subdivision × bars × direction: about nine thousand recipes. */
export function customGrid(): Recipe[] {
  const out: Recipe[] = [];
  for (const music of MUSIC) {
    for (const position of POSITIONS) {
      if (music.shape === "chromatic" && position === "root") continue;
      for (const subdivision of RECIPE_SUBDIVISIONS) {
        for (const bars of BARS) {
          for (const direction of RECIPE_DIRECTIONS) {
            out.push({ ...music, v: 1, position, subdivision, bars, direction } as Recipe);
          }
        }
      }
    }
  }
  return out;
}

export type GridRun = { recipe: Recipe; result: BuildResult };

export function runGrid(recipes: readonly Recipe[] = customGrid()): GridRun[] {
  return recipes.map((recipe) => ({ recipe, result: buildCustomExercise(recipe) }));
}

/**
 * The fixture's recipes: for every music, subdivision and direction, the first
 * recipe of the grid that builds. A few hundred schedules, every shape and grid.
 */
export function fixtureRuns(recipes: readonly Recipe[] = customGrid()): GridRun[] {
  const found = new Set<string>();
  const out: GridRun[] = [];
  for (const recipe of recipes) {
    const key = JSON.stringify({ ...recipe, position: null, bars: null });
    if (found.has(key)) continue;
    const result = buildCustomExercise(recipe);
    if (!result.ok) continue;
    found.add(key);
    out.push({ recipe, result });
  }
  return out;
}

/** The fixture file's bytes: one schedule row per Exercise, as `schedules.jsonl` has them. */
export function customScheduleFixtures(runs: readonly GridRun[] = fixtureRuns()): string {
  const docs = runs.flatMap((run) => (run.result.ok ? [customPathDoc(run.result.exercise)] : []));
  return scheduleFixtures(docs);
}
