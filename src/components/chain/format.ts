/**
 * How a chain reads on screen.
 *
 * Kept out of `src/chain` on purpose: that module is the model and the
 * runtime, and it has no business knowing about `t()`. These are the
 * label-shaped questions the track, the sidebar and the transport all ask,
 * and asking them in three places is how three answers drift apart.
 */
import type { Chain, ChainStep, ChainTrigger } from "../../types";

/** The subset of i18next's `t` these helpers need. */
export type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * What the runner has left of the current gap — the shape `stepRemaining`
 * returns. Declared here rather than in either consumer because the track
 * and the transport both draw it and neither owns it.
 */
export type ChainRemaining =
  | { kind: "manual" }
  | { kind: "bars"; bars: number }
  | { kind: "seconds"; seconds: number }
  | null;

/**
 * A span in the unit a player would say it in.
 *
 * Under a minute reads in seconds because "0 min" is not a length; at or
 * above it, minutes, because nobody sets a warm-up to 130 seconds.
 */
export function durationLabel(t: Translate, seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return t("chain.trigger.secondsShort", { count: s });
  return t("chain.trigger.minutesShort", { count: Math.round(s / 60) });
}

/** What the chip in the gap says. */
export function triggerLabel(t: Translate, trigger: ChainTrigger): string {
  switch (trigger.kind) {
    case "manual":
      return t("chain.trigger.manualShort");
    case "bars":
      return t("chain.trigger.barsShort", { count: Math.max(0, Math.floor(trigger.bars)) });
    case "seconds":
      return durationLabel(t, trigger.seconds);
  }
}

/**
 * How long a step lasts, in seconds, or null when only the player knows.
 *
 * A bars trigger is converted through the step's own tempo and bar length,
 * not the engine's: the estimate is for a chain sitting still in the
 * library, where no engine state applies. A grouping that sums to nothing
 * is read as 4/4 rather than dividing by zero.
 */
export function stepSeconds(step: ChainStep): number | null {
  switch (step.trigger.kind) {
    case "manual":
      return null;
    case "seconds":
      return Math.max(0, step.trigger.seconds);
    case "bars": {
      const beats = step.beatGroups.reduce((a, b) => a + b, 0) || 4;
      const bpm = Math.max(1, step.bpm);
      return (Math.max(0, step.trigger.bars) * beats * 60) / bpm;
    }
  }
}

/**
 * The whole chain's length, or null when it cannot be known — one step that
 * waits for the player, or a chain set to run until stopped.
 */
export function chainSeconds(chain: Chain): number | null {
  if (chain.steps.length === 0) return null;
  if (chain.repeat === 0) return null;
  let total = 0;
  for (const step of chain.steps) {
    const seconds = stepSeconds(step);
    if (seconds === null) return null;
    total += seconds;
  }
  return total * Math.max(1, Math.floor(chain.repeat));
}

/** "70 · 4/4 · Quarter" — the step card's second line. */
export function stepConfigLabel(t: Translate, step: ChainStep, meter: string): string {
  return `${step.bpm} · ${meter} · ${t(`subdiv.${step.subdivision}`)}`;
}

/** What the chain does when it reaches the end. (U9.6) */
export function repeatLabel(t: Translate, repeat: number): string {
  if (repeat === 0) return t("chain.repeat.forever");
  if (repeat <= 1) return t("chain.repeat.once");
  return t("chain.repeat.times", { count: Math.floor(repeat) });
}
