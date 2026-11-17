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
    for (const ex of step.exercises) if (ex.title === title) return { step, exercise: ex };
  }
  throw new Error(`no Exercise called ${title} in ${path.id}`);
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
