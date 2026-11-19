/**
 * Where a new player starts, from what they want and how far along they are
 * (the curriculum map, plans/paths/NEW_PATHS.md; decided 2026-11-18, the
 * owner delegated it). One optional question, "What do you want most right
 * now?", and four plain answers, two of which say the player's level:
 *
 * - `basics`, new to the guitar: Rhythm Foundations and Know the Neck, the
 *   first Path of each route.
 * - `harmony`: Know the Neck, the first of the route through Scales and
 *   Modes, Triads, Chords in a Key and Arpeggios over Changes.
 * - `technique`, faster and cleaner: Alternate Picking.
 * - `speed`, for a player who says their technique is already solid: Shred.
 *
 * No answer: Rhythm Foundations, the map's one start. Nobody is put on Shred
 * without asking for it any more. A recommendation only stages the choice;
 * the player can pick any Path under it, and change it on the Path page.
 */
import type { PathDoc } from "../../../paths/format";
import { START_HERE_PATH_ID } from "../../../session/tracks";

export type StartGoal = "basics" | "harmony" | "technique" | "speed";

export const START_GOALS: readonly StartGoal[] = ["basics", "harmony", "technique", "speed"];

/** The Paths each answer starts, first one first (its Level is the one the step shows). */
export const GOAL_PATHS: Readonly<Record<StartGoal, readonly string[]>> = {
  basics: [START_HERE_PATH_ID, "know-the-neck"],
  harmony: ["know-the-neck"],
  technique: ["alternate-picking"],
  speed: ["shred"],
};

/** Without an answer: the one start. */
export const NO_GOAL_PATHS: readonly string[] = [START_HERE_PATH_ID];

export type StartRecommendation = {
  /** The Paths to start, the first one at the Level the step shows. */
  pathIds: string[];
  /** `onboarding.start.why.*`: one line on why these. */
  whyKey: string;
};

/** The Paths an answer (or no answer) starts, of those the step can offer. */
export function recommendStart(goal: StartGoal | null, offered: readonly Pick<PathDoc, "id">[]): StartRecommendation | null {
  const has = (id: string) => offered.some((p) => p.id === id);
  const wanted = (goal ? GOAL_PATHS[goal] : NO_GOAL_PATHS).filter(has);
  if (wanted.length > 0) return { pathIds: [...wanted], whyKey: `onboarding.start.why.${goal ?? "none"}` };
  const first = offered[0];
  return first ? { pathIds: [first.id], whyKey: "onboarding.start.why.none" } : null;
}
