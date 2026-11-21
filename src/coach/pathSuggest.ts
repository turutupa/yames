/**
 * Suggesting a Path (DESIGN 6.4), pure but for the Path list it remembers.
 *
 * Only when a Level is finished (a `levelDone` or `pathDone` milestone of the
 * last Session: `milestones.ts`), or when the player asks ("suggest a Path",
 * the `suggest_path` fact card in `ask/intents.ts`). One suggestion, on Paths,
 * last on the page, as a chip-sized button that opens the Path. It never
 * subscribes and never changes anything: opening a Path is the player's
 * press, and subscribing stays theirs on the Path's page.
 *
 * The reason is the curriculum's own, never "your Paths have room for one
 * more": among the Paths not started (the player's own exercises aside) whose
 * prerequisites are met (`unmetPathPrerequisites`), in the curriculum's order
 * (`curriculumOrder`), one that builds on a Path the player has started
 * (`buildsOnPaths`) comes first, named with it ("builds on X, which you are
 * through Beginner of"); else the first in the curriculum's order. With a goal
 * set (`coach.goal`), the Path whose title, goal or category shares the most
 * of its words goes first, and the card quotes the goal when that decided.
 */
import type { LevelId, PathDoc } from "../paths/format";
import type { FactCard, NoCard } from "./ask/cards";
import { curriculumOrder } from "../paths/curriculum";
import { MY_EXERCISES_PATH_ID } from "../session/myExercises";
import { isRunnable } from "../session/packs";
import { buildsOnPaths, hasStartedPath, isThroughLevel, unmetPathPrerequisites } from "../session/prerequisites";
import type { PlayerProgress } from "../session/progress";
import { milestonesNow } from "./milestones";
import type { CoachGoal } from "./store";
import type { WeeklyLine } from "./weekly";

export type PathSuggestion = {
  path: PathDoc;
  /** Why, in the curriculum's words: an i18n key under `companion.pathSuggest` and its values. */
  reason: WeeklyLine;
  /** The player's goal, quoted when it decided the order. */
  goal: CoachGoal | null;
};

/** Words of a goal worth matching: four letters or more, lower case. */
function goalWords(goal: CoachGoal | null): string[] {
  if (!goal) return [];
  return goal.text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4);
}

/** How many of the goal's words the Path's title, goal, category or id holds. */
function goalScore(path: PathDoc, words: readonly string[]): number {
  if (words.length === 0) return 0;
  const text = `${path.title} ${path.goal} ${path.category ?? ""} ${path.id.replace(/-/g, " ")}`.toLowerCase();
  return words.filter((w) => text.includes(w)).length;
}

/** The Path to suggest now, with its reason, or null when none is ready. */
export function suggestPath(progress: PlayerProgress, paths: readonly PathDoc[], goal: CoachGoal | null): PathSuggestion | null {
  const pool = curriculumOrder(paths.filter((p) => p.id !== MY_EXERCISES_PATH_ID && isRunnable(p.id) && !hasStartedPath(progress, p.id)));
  const ready = pool.filter((p) => unmetPathPrerequisites(progress, paths, p).length === 0);
  if (ready.length === 0) return null;
  const words = goalWords(goal);
  const ranked = ready
    .map((path, order) => {
      const on = buildsOnPaths(paths, path).find((b) => hasStartedPath(progress, b.path.id)) ?? null;
      return { path, order, on, score: goalScore(path, words) };
    })
    .sort((a, b) => b.score - a.score || Number(b.on !== null) - Number(a.on !== null) || a.order - b.order);
  const best = ranked[0];
  // The goal is quoted only when it decided: the Path it put first holds more of its words than the rest.
  const decided = best.score > 0 && ranked.slice(1).every((r) => r.score < best.score);
  return { path: best.path, reason: reasonOf(progress, best.path, best.on), goal: decided ? goal : null };
}

function reasonOf(progress: PlayerProgress, path: PathDoc, on: { path: PathDoc; level?: LevelId } | null): WeeklyLine {
  if (!on) return { key: "next", values: { path: path.title } };
  const level = (on.path.levels ?? []).find((l) => l.id === on.level) ?? null;
  if (level && isThroughLevel(progress, on.path, level.id)) {
    return { key: "buildsOnLevel", values: { path: path.title, on: on.path.title, level: level.title } };
  }
  return { key: "buildsOn", values: { path: path.title, on: on.path.title } };
}

/**
 * The suggestion Paths shows unasked: only when the last Session finished a
 * Level or a Path (graded: with grading off nothing is finished).
 */
export function pathSuggestionNow(
  progress: PlayerProgress,
  paths: readonly PathDoc[],
  goal: CoachGoal | null,
  now: number,
  graded: boolean,
): PathSuggestion | null {
  const finished = milestonesNow(progress, paths, now, graded).some((m) => m.kind === "levelDone" || m.kind === "pathDone");
  return finished ? suggestPath(progress, paths, goal) : null;
}

/** A suggestion as lines: the Path and its reason, then the goal when it decided. */
export function suggestionLines(s: PathSuggestion): WeeklyLine[] {
  const lines: WeeklyLine[] = [{ key: `companion.pathSuggest.${s.reason.key}`, values: s.reason.values }];
  if (s.goal) lines.push({ key: "companion.pathSuggest.goal", values: { goal: s.goal.text } });
  return lines;
}

/**
 * "Suggest a Path", asked (the `suggest_path` fact card): answered for every
 * player, graded or not, since it reads the curriculum and which Paths were
 * started, never a grade. The answer names the Path; opening it is the
 * player's press on Paths.
 */
export function suggestPathCard(progress: PlayerProgress, goal: CoachGoal | null): FactCard | NoCard {
  const paths = knownPaths();
  if (paths.length === 0) return { line: { key: "companion.pathSuggest.notLoaded", values: {} } };
  const s = suggestPath(progress, paths, goal);
  if (!s) return { line: { key: "companion.pathSuggest.none", values: {} } };
  return { shape: "suggest_path", lines: suggestionLines(s), source: { kind: "path" } };
}

// The Paths the app has loaded, for the asked card (an Ask context carries no
// Path list). Set by the companion's watch; memory only.
let known: readonly PathDoc[] = [];

export function rememberPaths(paths: readonly PathDoc[]): void {
  known = paths;
}

export function knownPaths(): readonly PathDoc[] {
  return known;
}
