// The Exercises the suite plays, read from the same pack the app ships, so a
// change to a pack changes the take rather than silently missing it.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLEAN_TEMPO_MIN_BARS = 8; // src/session/grade.ts

export function loadPath(id = "alternate-picking") {
  return JSON.parse(readFileSync(join(repo, "src", "paths", "packs", `${id}.json`), "utf8"));
}

/** An Exercise by its title, as the app shows it. */
export function exerciseByTitle(title, path = loadPath()) {
  for (const step of path.steps) {
    for (const ex of step.exercises) if (ex.title === title) return { path, step, exercise: ex };
  }
  throw new Error(`no Exercise called ${title} in ${path.id}`);
}

/**
 * The Path a new player starts on, and the one the suite subscribes to second
 * (`FIRST_PATH_ID` in src/session/packs.ts; the planner places a player on a
 * newly subscribed Path with its first Step's first graded Exercise).
 */
export const FIRST_PATH = "shred";
export const SECOND_PATH = "alternate-picking";

/** A pack's first Step's first graded Exercise: what placement starts with. */
export function placementExercise(path) {
  for (const step of path.steps) {
    const exercise = step.exercises.find((e) => e.grading === "graded");
    if (exercise) return { path, step, exercise };
  }
  throw new Error(`${path.id} has no graded Exercise`);
}

/**
 * Which Exercise a Session screen is on, from the title it shows (`heading`,
 * when the screen's heading could be read) or else the page's text, across
 * `paths`. An exact heading wins; otherwise the longest title the page holds,
 * so "Four of each" does not shadow "Four of each, on the top string".
 */
export function exerciseOnScreen({ heading, page, pathTitle }, paths) {
  const all = paths.flatMap((path) =>
    path.steps.flatMap((step) => step.exercises.map((exercise) => ({ path, step, exercise }))),
  );
  const prefer = (hits) => hits.find((h) => pathTitle && h.path.title === pathTitle) ?? hits[0] ?? null;
  if (heading) {
    const exact = all.filter((h) => h.exercise.title === heading.trim());
    if (exact.length) return prefer(exact);
  }
  const inPage = all
    .filter((h) => page.includes(h.exercise.title))
    .sort((a, b) => b.exercise.title.length - a.exercise.title.length);
  return inPage.length ? prefer(inPage.filter((h) => h.exercise.title === inPage[0].exercise.title)) : null;
}

/** `takeBarsOf` in src/session/grade.ts. */
export function takeBars(ex) {
  const bars = Math.max(1, ex.bars);
  const asked = ex.passBars.reduce((m, b) => Math.max(m, b.overBars), 0);
  return Math.ceil(Math.max(CLEAN_TEMPO_MIN_BARS, asked) / bars) * bars;
}

export function barTicks(ex) {
  return Math.round((ex.meter.numerator * 960 * 4) / ex.meter.denominator);
}
