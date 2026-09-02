/**
 * T07 — adaptive drill commentary.
 *
 * The engine owns the tempo decision (`engine.rs::adaptive_thresholds`).
 * By the time the `adaptive-eval` event reaches the frontend the tempo
 * has ALREADY moved. Everything here is narration of a decision that is
 * final:
 *
 *   - `adaptiveScenario` maps the engine's decision onto the template
 *     catalog scenario used when no model is resident.
 *   - `buildAdaptiveCommentPrompt` builds the LLM prompt for the case
 *     where one is. It states the decision as a fact, forbids changing
 *     it, and keeps the numbers-lock rule the rephrase path uses.
 *
 * Lives in its own module (rather than inside `useSession.ts`) so both
 * paths are unit-testable without booting the whole session hook.
 */

import type { AdaptiveEvalRequest } from "../ipc";

/** The move the engine made. Mirrors `AdaptiveEvalRequest["decision"]`. */
export type AdaptiveDecision = "up" | "hold" | "down";

/**
 * Template-catalog scenario for an engine decision, or `null` for
 * `hold` — a step that didn't move the tempo isn't worth a feed line,
 * and the coach's per-channel cooldowns are better spent elsewhere.
 */
export function adaptiveScenario(
  decision: AdaptiveDecision,
): "drill_step_up" | "drill_step_down" | null {
  if (decision === "up") return "drill_step_up";
  if (decision === "down") return "drill_step_down";
  return null;
}

/**
 * Prompt for the resident model. Note what it does NOT ask for: the
 * model is never asked to pick a direction. It gets the decision, the
 * numbers behind it, and one job — say it in a sentence.
 */
export function buildAdaptiveCommentPrompt(req: AdaptiveEvalRequest): string {
  const noCeiling = req.targetBpm >= 300;
  const progress = noCeiling
    ? `open-ended (no target ceiling)`
    : `${req.newBpm} of ${req.targetBpm} BPM target`;
  const move =
    req.decision === "up"
      ? `the tempo went UP from ${req.currentBpm} to ${req.newBpm} BPM`
      : req.decision === "down"
        ? `the tempo went DOWN from ${req.currentBpm} to ${req.newBpm} BPM`
        : `the tempo HELD at ${req.newBpm} BPM`;

  return [
    `You are a practice coach commenting on a drill step that has already happened.`,
    ``,
    `The player scored ${req.accuracyPct}% accuracy on the last round, so ${move}.`,
    `Progress: ${progress}. Step number: ${req.currentStep}. Drill aggressiveness: ${req.aggressiveness}.`,
    ``,
    `Write ONE short sentence telling the player what just happened and why.`,
    `The tempo change is already decided and applied — do NOT suggest a different tempo, do NOT ask a question, and do NOT tell the player to speed up or slow down.`,
    `Keep every number exactly as given. Do not invent new numbers, percentages or facts.`,
    `Reply with the sentence only — no preamble, no labels, no quotes.`,
  ].join("\n");
}

/**
 * Guard for what the model hands back. A resident model can return an
 * empty string, a wall of reasoning, or a refusal; any of those should
 * fall back to the template line rather than reach the feed.
 */
export function isUsableComment(text: string): boolean {
  const t = text.trim();
  return t.length > 5 && t.length < 200;
}
