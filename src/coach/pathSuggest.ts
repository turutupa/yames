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
 * of its words (whole words, common ones aside) goes first, and the card
 * quotes the goal whenever that changed the pick; a Path the goal put first
 * that builds on nothing started is said to match the goal, never to be "the
 * next" in the curriculum's order.
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
  /** The player's goal, quoted when it changed the pick. */
  goal: CoachGoal | null;
};

/**
 * Words too common in a player's goal to say anything about a Path (review
 * c4b3 L6): "I want to play guitar better" must not decide the order, and
 * then be quoted as the reason.
 */
const GOAL_STOP_WORDS = new Set([
  "able", "about", "also", "become", "better", "could", "from", "getting", "good", "great", "guitar", "guitars",
  "have", "improve", "into", "just", "learn", "learning", "like", "make", "more", "much", "play", "player", "playing",
  "practice", "practise", "really", "should", "some", "start", "that", "their", "them", "they", "this", "very", "wanna",
  "want", "well", "what", "when", "where", "which", "with", "would", "your",
]);

/** A word as it is compared: lower case, a plural "s" dropped ("scales" is "scale"). */
function stem(word: string): string {
  return word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0);
}

/** Words of a goal worth matching: four letters or more, not a common word, each once. */
function goalWords(goal: CoachGoal | null): string[] {
  if (!goal) return [];
  return [...new Set(wordsOf(goal.text).filter((w) => w.length >= 4 && !GOAL_STOP_WORDS.has(w)).map(stem))];
}

/** How many of the goal's words the Path's title, goal, category or id holds, as whole words. */
function goalScore(path: PathDoc, words: readonly string[]): number {
  if (words.length === 0) return 0;
  const own = new Set(wordsOf(`${path.title} ${path.goal} ${path.category ?? ""} ${path.id}`).map(stem));
  return words.filter((w) => own.has(w)).length;
}

/** The Path to suggest now, with its reason, or null when none is ready. */
export function suggestPath(progress: PlayerProgress, paths: readonly PathDoc[], goal: CoachGoal | null): PathSuggestion | null {
  const pool = curriculumOrder(paths.filter((p) => p.id !== MY_EXERCISES_PATH_ID && isRunnable(p.id) && !hasStartedPath(progress, p.id)));
  const ready = pool.filter((p) => unmetPathPrerequisites(progress, paths, p).length === 0);
  if (ready.length === 0) return null;
  const words = goalWords(goal);
  const rows = ready.map((path, order) => {
    const on = buildsOnPaths(paths, path).find((b) => hasStartedPath(progress, b.path.id)) ?? null;
    return { path, order, on, score: goalScore(path, words) };
  });
  const byCurriculum = (a: (typeof rows)[number], b: (typeof rows)[number]) => Number(b.on !== null) - Number(a.on !== null) || a.order - b.order;
  const best = [...rows].sort((a, b) => b.score - a.score || byCurriculum(a, b))[0];
  // The goal is quoted whenever it changed the pick (review c4b3 H1): the
  // curriculum alone would have put another Path first.
  const changed = best.path !== [...rows].sort(byCurriculum)[0].path;
  return { path: best.path, reason: reasonOf(progress, best.path, best.on, best.order), goal: changed ? goal : null };
}

function reasonOf(progress: PlayerProgress, path: PathDoc, on: { path: PathDoc; level?: LevelId } | null, order: number): WeeklyLine {
  // "The next in the curriculum's order" only of the first ready Path: one the
  // goal put first is said to match the goal instead (review c4b3 H1).
  if (!on) return { key: order === 0 ? "next" : "readyGoal", values: { path: path.title } };
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
