/**
 * What a Path or an Exercise is badged with, for a player (QA 2026-11-17 #13).
 *
 * A pack's review status ("draft") is the authors' business and never shown.
 * A Path says "Subscribed" when Today plans from it and "Coming soon" when the
 * app cannot run it yet; a runnable Path the player has not subscribed to needs
 * no badge. An Exercise says why it has no bar only when that is true of it:
 * self-checked and practice-only Exercises are never graded, by design, and
 * "Not graded yet" is kept for the ones grading is still to come for.
 */
import type { Exercise } from "../paths/format";
import { isRunnable } from "./packs";
import { isGradable, isSubscribed } from "./progress";
import type { PlayerProgress } from "./progress";

export type PathBadge = "subscribed" | "comingSoon" | null;

export function pathBadge(pathId: string, progress: PlayerProgress): PathBadge {
  if (!isRunnable(pathId)) return "comingSoon";
  return isSubscribed(progress, pathId) ? "subscribed" : null;
}

export const PATH_BADGE_KEY: Readonly<Record<Exclude<PathBadge, null>, string>> = {
  subscribed: "session.paths.subscribed",
  comingSoon: "session.paths.comingSoon",
};

/** The line an Exercise card shows in place of (or beside) its bar, or null. */
export function exerciseGradingKey(exercise: Exercise, runnable: boolean): string | null {
  if (exercise.grading === "selfChecked") return "session.paths.selfChecked";
  if (exercise.grading === "practiceOnly") return "session.paths.practiceOnly";
  if (!isGradable(exercise) || !runnable) return "session.paths.notGradedYet";
  return null;
}
