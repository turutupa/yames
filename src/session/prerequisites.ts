/**
 * Which of a Path's prerequisite Paths this player has not reached yet.
 *
 * Guidance only. Nothing here locks a Path, hides one or changes what Start
 * does: it answers a question the Paths screen may ask ("should I suggest
 * something first?") and the answer is a list that is empty for most players.
 */
import { prerequisitePaths, unmetPrerequisites } from "../paths/curriculum";
import type { LevelId, PathDoc, PathPrerequisite } from "../paths/format";
import { LEVEL_IDS } from "../paths/format";
import { currentStepOf, isStepPassed } from "./progress";
import type { PlayerProgress } from "./progress";

/** Has the player started this Path: a state row, or any Take on it. */
export function hasStartedPath(progress: PlayerProgress, pathId: string): boolean {
  return progress.states.some((s) => s.pathId === pathId) || progress.takes.some((t) => t.pathId === pathId);
}

/**
 * Is the player through this Level of this Path: on a Step after its last one
 * (by playing, or by choosing a higher Level, which is the player saying they
 * know it), or on its last Step with that Step passed.
 */
export function isThroughLevel(progress: PlayerProgress, path: PathDoc, levelId: LevelId): boolean {
  const upTo = LEVEL_IDS.slice(0, LEVEL_IDS.indexOf(levelId) + 1);
  const stepIds = (path.levels ?? []).filter((l) => upTo.includes(l.id)).flatMap((l) => l.stepIds);
  const last = Math.max(-1, ...stepIds.map((id) => path.steps.findIndex((s) => s.id === id)));
  if (last < 0) return hasStartedPath(progress, path.id);
  if (!hasStartedPath(progress, path.id)) return false;
  const current = currentStepOf(progress, path);
  const at = path.steps.findIndex((s) => s.id === current.id);
  return at > last || (at === last && isStepPassed(progress, path.id, current));
}

/** The prerequisites of `path` this player has not reached, in the order the Path lists them. */
export function unmetPathPrerequisites(
  progress: PlayerProgress,
  paths: readonly PathDoc[],
  path: PathDoc,
): PathPrerequisite[] {
  const byId = new Map(paths.map((p) => [p.id, p]));
  return unmetPrerequisites(path, new Set(byId.keys()), (id, level) => {
    const other = byId.get(id)!;
    return level ? isThroughLevel(progress, other, level) : hasStartedPath(progress, id);
  });
}

/** A prerequisite with its Path, for a screen to name and link. */
export type ShownPrerequisite = { path: PathDoc; level?: LevelId };

/** What `path` builds on, the Paths that are in the app, in the order it lists them ("Builds on: …"). */
export function buildsOnPaths(paths: readonly PathDoc[], path: PathDoc): ShownPrerequisite[] {
  const byId = new Map(paths.map((p) => [p.id, p]));
  return prerequisitePaths(path).flatMap((need) => {
    const other = byId.get(need.path);
    if (!other || other.id === path.id) return [];
    return [need.level ? { path: other, level: need.level } : { path: other }];
  });
}

/**
 * "Start with X first, or start anyway": the first prerequisite not reached,
 * only while the player has not started this Path. Once they have, they have
 * decided, and the suggestion is gone for good.
 */
export function startFirstSuggestion(
  progress: PlayerProgress,
  paths: readonly PathDoc[],
  path: PathDoc,
): PathDoc | null {
  if (hasStartedPath(progress, path.id)) return null;
  const first = unmetPathPrerequisites(progress, paths, path)[0];
  return first ? (paths.find((p) => p.id === first.path) ?? null) : null;
}

/**
 * What Subscribe offers to add as well: the prerequisites not reached that the
 * player has not started at all. One they started and left is their call, and
 * is not offered again. An offer, never a condition: the Path is subscribed
 * whatever the answer.
 */
export function prerequisitesToOffer(
  progress: PlayerProgress,
  paths: readonly PathDoc[],
  path: PathDoc,
): PathDoc[] {
  return unmetPathPrerequisites(progress, paths, path)
    .filter((need) => !hasStartedPath(progress, need.path))
    .flatMap((need) => paths.filter((p) => p.id === need.path));
}
