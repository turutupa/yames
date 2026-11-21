/**
 * The model names, the app resolves (TOOLS 2.2).
 *
 * A tool never takes a Path's, a Step's or an Exercise's id from outside: it
 * takes the player's words (`query`) and finds the thing by its title in the
 * player's language (the packs as `loadAllPacks(lng)` returns them, overlays
 * applied). One clear match runs; several come back as "Which one?" choices;
 * none is `notFound`. And numbers are snapped to what the app allows: a tempo
 * to a graded rung, minutes to one of four, a part number to one that exists.
 *
 * Shared by both halves of the tools (t1a1's `go` tools, t1a2's `confirm`
 * ones). Pure: no host, no React, no IPC.
 */

import { findExercise } from "../../session/packs";
import { gradedRungs } from "../../session/ladder";
import { PLAN_MINUTES, type PlanMinutes } from "../../session/planner";
import type { Exercise, PathDoc, Step } from "../../paths/format";

/** At most this many "Which one?" choices. More than that is a question too vague to list. */
export const MAX_CHOICES = 6;

export type Resolved<T> =
  | { found: T }
  /** Several equally good matches, best first, at most `MAX_CHOICES`. */
  | { several: readonly T[] }
  | { none: true };

/**
 * Words as compared: lower case, accents off, anything that is not a letter
 * or a digit a space, spaces collapsed. "Alternate-Picking" and "alternate
 * picking" are the same words; so are "Légato" and "legato".
 */
export function normalizeWords(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** A script written without spaces between words (CJK, Thai): matched inside words. */
export const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;

/**
 * How well `query` names `title`: 2 the same words, 1 every word of the query
 * starts a word of the title (or, in a script without spaces, appears in it),
 * 0 not at all.
 */
export function titleMatch(query: string, title: string): 0 | 1 | 2 {
  const q = normalizeWords(query);
  const t = normalizeWords(title);
  if (q.length === 0 || t.length === 0) return 0;
  if (q === t) return 2;
  const words = t.split(" ");
  // A player of a script without spaces types a title's words run together ("얼터네이트피킹"
  // for "얼터네이트 피킹", "オルタネイトピッキング" for "オルタネイト・ピッキング"; review t1b2b, finding 4).
  const joined = t.replace(/ /g, "");
  const every = q.split(" ").every((part) =>
    UNSPACED.test(part) ? t.includes(part) || joined.includes(part) : words.some((word) => word.startsWith(part)),
  );
  return every ? 1 : 0;
}

/**
 * Whether `query` names `title` by its whole words, as typed text must before
 * it opens anything at once (review t1b2c, finding 5): the title itself, or a
 * run of two or more of its words in order. One word that is not the whole
 * title ("class", "first", "over") is not: a casual sentence is full of words
 * that start or sit inside a title, and the player gets one press instead.
 * A script without spaces: only the whole title, typed with or without them.
 */
export function wholeTitleWords(query: string, title: string): boolean {
  const q = normalizeWords(query);
  const t = normalizeWords(title);
  if (q.length === 0 || t.length === 0) return false;
  if (q === t || q.replace(/ /g, "") === t.replace(/ /g, "")) return true;
  if (UNSPACED.test(q)) return false;
  return q.includes(" ") && ` ${t} `.includes(` ${q} `);
}

/**
 * The items `query` names. An exact title wins over partial ones; one partial
 * match is found; several are choices, in the order given.
 */
export function matchByTitle<T>(query: string, items: readonly T[], titleOf: (item: T) => string): Resolved<T> {
  const exact: T[] = [];
  const partial: T[] = [];
  for (const item of items) {
    const score = titleMatch(query, titleOf(item));
    if (score === 2) exact.push(item);
    else if (score === 1) partial.push(item);
  }
  const best = exact.length > 0 ? exact : partial;
  if (best.length === 0) return { none: true };
  if (best.length === 1) return { found: best[0] };
  return { several: best.slice(0, MAX_CHOICES) };
}

/** A Path, by the player's words. */
export function resolvePath(query: string, paths: readonly PathDoc[]): Resolved<PathDoc> {
  return matchByTitle(query, paths, (path) => path.title);
}

export type StepHit = { path: PathDoc; step: Step };

/**
 * A Step, by its number on the Path or by the player's words. With no Path,
 * the words are looked for on every Path (`paths`), the Path's own title
 * not counted.
 */
export function resolveStep(
  on: { path: PathDoc } | { paths: readonly PathDoc[] },
  ask: { number: number } | { query: string },
): Resolved<StepHit> {
  const scope = "path" in on ? [on.path] : on.paths;
  if ("number" in ask) {
    if (!("path" in on)) return { none: true };
    const step = on.path.steps.find((s) => s.order === ask.number);
    return step ? { found: { path: on.path, step } } : { none: true };
  }
  const hits: StepHit[] = scope.flatMap((path) => path.steps.map((step) => ({ path, step })));
  return matchByTitle(ask.query, hits, (hit) => hit.step.title);
}

export type ExerciseHit = { path: PathDoc; step: Step; exercise: Exercise };

/**
 * An Exercise, by the player's words, on one Path or on all of them. The
 * Step it belongs to comes from `findExercise` (a Level's warm-up included).
 * For t1a2's `play_exercise`, `find_edge`.
 */
export function resolveExercise(
  query: string,
  on: { path: PathDoc } | { paths: readonly PathDoc[] },
): Resolved<ExerciseHit> {
  const scope = "path" in on ? [on.path] : on.paths;
  const hits: ExerciseHit[] = [];
  for (const path of scope) {
    const seen = new Set<string>();
    const all = [
      ...path.steps.flatMap((s) => s.exercises),
      ...(path.levels ?? []).flatMap((level) => level.warmups),
    ];
    for (const exercise of all) {
      if (seen.has(exercise.id)) continue;
      seen.add(exercise.id);
      const at = findExercise(path, exercise.id);
      if (at) hits.push({ path, step: at.step, exercise: at.exercise });
    }
  }
  return matchByTitle(query, hits, (hit) => hit.exercise.title);
}

// ---------------------------------------------------------------------------
// Numbers, snapped to what the app allows
// ---------------------------------------------------------------------------

/**
 * The graded rung nearest `bpm` (a tie goes to the slower one: a player asked
 * for a number between two rungs is not pushed past it). With no graded rung,
 * the nearest rung of any kind; with no rung at all, null.
 */
export function snapToRung(exercise: Exercise, bpm: number): number | null {
  const graded = gradedRungs(exercise);
  const rungs = graded.length > 0 ? graded : exercise.tempo.rungs.map((rung) => rung.bpm).sort((a, b) => a - b);
  return nearest(rungs, bpm);
}

/** One of the four lengths a plan has (5, 10, 15, 20); a tie goes to the shorter. */
export function snapMinutes(minutes: number): PlanMinutes {
  return nearest(PLAN_MINUTES, minutes) ?? PLAN_MINUTES[0];
}

/**
 * A part number as the player counts it (from 1) to an index that exists
 * (from 0), clamped to the first and the last. Null when there are no parts.
 */
export function snapPart(part: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.max(0, Math.min(count - 1, Math.round(part) - 1));
}

function nearest<T extends number>(values: readonly T[], target: number): T | null {
  let best: T | null = null;
  for (const value of values) {
    if (best === null || Math.abs(value - target) < Math.abs(best - target)) best = value;
    else if (Math.abs(value - target) === Math.abs(best - target) && value < best) best = value;
  }
  return best;
}
