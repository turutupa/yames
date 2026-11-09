/**
 * Learning mode — ROADMAP §6 1.5.
 *
 * Two people can play the same passage equally well and want opposite
 * things from the coach. One is drilling and wants to be told the moment
 * a note leans early. The other is learning the passage and wants to be
 * left alone until something is actually wrong. Learning mode is the
 * second one.
 *
 * What it is NOT: the old proposal was to widen the hit window to
 * ±35 ms, which would have changed the score. The roadmap rejected that
 * outright, and the gate on this item is that every d3d scenario stays
 * where it is. **Nothing here touches a score.** The session is measured
 * and stored exactly as strictly in either mode; what changes is when
 * the coach opens its mouth and which way it leans when it does.
 *
 * Three effects, and no others:
 *
 *   1. **The window is 1.5× wider.** The gatekeeper's tolerances — how
 *      far a passage has to lean before it counts as rushing, how big a
 *      constant offset has to be before it counts as a bias, how far
 *      accuracy has to fall before it counts as a drop — are all scaled
 *      by `LEARNING_WINDOW_SCALE`. The player gets half again as much
 *      room before the coach has an opinion.
 *
 *   2. **Corrections stop interrupting.** An event that would be phrased
 *      as a correction is demoted from the spoken tier to the written
 *      one. It still lands in the feed; it no longer speaks over the
 *      playing.
 *
 *   3. **Encouragement is preferred.** Where the catalogue has an
 *      encouraging way to say the same true thing, that variant is drawn
 *      first. `severityPlan` returns an ordered list rather than a single
 *      severity precisely so the caller falls back to the strict
 *      phrasing rather than going silent when no such variant exists —
 *      the coach never swallows a finding to stay cheerful.
 *
 * `severityFor` moved here from `useSession.ts`, where it had grown into
 * the only definition of which scenarios are corrections. That question
 * now has one answer and a test file.
 */

import type { ScenarioTag, Tier } from "./gatekeeper";
import type { Severity } from "./templates";

/**
 * How hard the coach is on you. `"strict"` is the behaviour that has
 * always shipped; `"learning"` is the new one. Stored beside `coachMode`
 * (see `useCoachDownload.ts`) — the two are independent: `coachMode`
 * decides how the SCORE is computed, this decides how the coach TALKS.
 */
export type CoachStance = "strict" | "learning";

/**
 * The one factor. Every tolerance learning mode widens is multiplied by
 * this and nothing else, so "learning mode is one and a half times more
 * patient" stays a true sentence about the code.
 */
export const LEARNING_WINDOW_SCALE = 1.5;

/** Multiplier to apply to a gatekeeper tolerance under `stance`. */
export function windowScale(stance: CoachStance | undefined): number {
  return stance === "learning" ? LEARNING_WINDOW_SCALE : 1;
}

/**
 * Widen a gatekeeper tolerance for the stance. Named rather than
 * inlined so every widened threshold in `gatekeeper.ts` reads as the
 * same decision and a reader can find all of them.
 */
export function scaled(value: number, stance: CoachStance | undefined): number {
  return value * windowScale(stance);
}

/**
 * Which of the three template severities a scenario is phrased in,
 * under strict stance. Moved verbatim from `useSession.ts`.
 *
 *   - Always-positive scenarios (personal best, recovery, milestones,
 *     new band locked) → `encouragement`.
 *   - Always-corrective scenarios (accuracy drop, fatigue) →
 *     `correction`.
 *   - Trend scenarios graduate: `neutral` while still being confirmed
 *     in the written channel, `correction` once the gatekeeper has
 *     promoted them to spoken (two consecutive confirmations).
 *   - Everything else → `neutral`.
 */
export function severityFor(scenario: ScenarioTag, tier: Tier): Severity {
  switch (scenario) {
    case "personal_best_streak":
    case "recovery":
    case "recovery_confirmed":
    case "tempo_milestone":
    case "new_band_locked":
      return "encouragement";
    case "accuracy_drop":
    case "fatigue":
      return "correction";
    case "bias_only":
      return "neutral";
    case "rushing_trend":
    case "dragging_trend":
      return tier === "spoken" ? "correction" : "neutral";
    case "low_confidence":
    case "check_in":
    case "boundary_signal_a":
    case "boundary_signal_b":
    default:
      return "neutral";
  }
}

/**
 * True when this event is one the coach would phrase as a correction.
 * The single definition — learning mode's tier demotion and its
 * encouragement preference both key off this, so they can never drift
 * apart and start disagreeing about what a correction is.
 */
export function isCorrection(scenario: ScenarioTag, tier: Tier): boolean {
  return severityFor(scenario, tier) === "correction";
}

/**
 * The tier this event should actually use. In learning mode a
 * correction is demoted from spoken to written: still in the feed,
 * no longer in the player's ears while they are mid-passage.
 *
 * Note what is NOT demoted — `recovery`, `tempo_milestone` and the
 * boundary signals keep their voice in both stances. A player who asked
 * for a gentler coach did not ask for a silent one.
 */
export function tierFor(
  scenario: ScenarioTag,
  tier: Tier,
  stance: CoachStance | undefined,
): Tier {
  if (stance !== "learning") return tier;
  if (tier !== "spoken") return tier;
  return isCorrection(scenario, tier) ? "written" : tier;
}

/**
 * Severities to try, best first. The caller draws a template for the
 * first one the catalogue can satisfy.
 *
 * Strict stance has exactly one answer. Learning stance asks for the
 * encouraging phrasing of a correction first and keeps the correction
 * behind it, so a scenario with no encouraging variant is still said —
 * just plainly. The finding is never dropped to protect the mood.
 *
 * Callers pass the tier the event actually carries, which in learning
 * mode is the demoted one. That compounds for the two trend scenarios:
 * a confirmed rushing trend arrives written, so it is phrased neutrally
 * rather than as a correction. `accuracy_drop` and `fatigue` are
 * corrections whatever channel they end up in, so they still get the
 * encouragement-first plan.
 */
export function severityPlan(
  scenario: ScenarioTag,
  tier: Tier,
  stance: CoachStance | undefined,
): Severity[] {
  const strict = severityFor(scenario, tier);
  if (stance !== "learning") return [strict];
  if (strict === "correction") return ["encouragement", "correction"];
  if (strict === "neutral") return ["encouragement", "neutral"];
  return [strict];
}
