/**
 * Which of a Path's prerequisite Paths this player has not reached yet.
 *
 * Guidance only. Nothing here locks a Path, hides one or changes what Start
 * does: it answers a question the Paths screen may ask ("should I suggest
 * something first?") and the answer is a list that is empty for most players.
 */
import { unmetPrerequisites } from "../paths/curriculum";
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
