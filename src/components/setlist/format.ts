/**
 * How a setlist reads on screen.
 *
 * Kept out of `src/setlist` on purpose: that module is the model and the
 * runtime, and it has no business knowing about `t()`. These are the
 * label-shaped questions the track, the sidebar and the transport all ask,
 * and asking them in three places is how three answers drift apart.
 */
import type { Setlist, SetlistStep, SetlistTransition, SetlistTrigger } from "../../types";

/** The subset of i18next's `t` these helpers need. */
export type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * What the runner has left of the current gap — the shape `stepRemaining`
 * returns. Declared here rather than in either consumer because the track
 * and the transport both draw it and neither owns it.
 */
export type SetlistRemaining =
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
  if (s < 60) return t("setlist.trigger.secondsShort", { count: s });
  return t("setlist.trigger.minutesShort", { count: Math.round(s / 60) });
}

/**
 * A length of time, exactly — the number a control is setting, or a clock
 * counting down.
 *
 * `durationLabel` rounds to whole minutes, which is right for an estimate
 * and wrong for a value you are stepping: the trigger stepper moves in 15
 * second jumps, so 60 → 75 → 90 rendered as "1 min", "1 min", "2 min" and
 * the + button looked broken. It got worse further up, because more 15
 * second steps fall inside each rounded minute — at two minutes, four
 * presses in a row all read "2 min". The owner found it exactly there.
 *
 * So: seconds below a minute, whole minutes when it is one, and m:ss when
 * it is not. The transport already shows elapsed time this way.
 */
export function spanLabel(t: Translate, seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return t("setlist.trigger.secondsShort", { count: s });
  if (s % 60 === 0) return t("setlist.trigger.minutesShort", { count: s / 60 });
  return t("setlist.trigger.minutesSeconds", {
    minutes: Math.floor(s / 60),
    seconds: String(s % 60).padStart(2, "0"),
  });
}

/** What the chip in the gap says. */
export function triggerLabel(t: Translate, trigger: SetlistTrigger): string {
  switch (trigger.kind) {
    case "manual":
      return t("setlist.trigger.manualShort");
    case "bars":
      return t("setlist.trigger.barsShort", { count: Math.max(0, Math.floor(trigger.bars)) });
    case "seconds":
      // Exact: this is the step's own setting, not an estimate of it.
      return spanLabel(t, trigger.seconds);
  }
}

/**
 * How long a step lasts, in seconds, or null when only the player knows.
 *
 * A bars trigger is converted through the step's own tempo and bar length,
 * not the engine's: the estimate is for a setlist sitting still in the
 * library, where no engine state applies. A grouping that sums to nothing
 * is read as 4/4 rather than dividing by zero.
 */
export function stepSeconds(step: SetlistStep): number | null {
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
 * The whole setlist's length, or null when it cannot be known — one step that
 * waits for the player, or a setlist set to run until stopped.
 */
export function setlistSeconds(setlist: Setlist): number | null {
  if (setlist.steps.length === 0) return null;
  if (setlist.repeat === 0) return null;
  let total = 0;
  for (const step of setlist.steps) {
    const seconds = stepSeconds(step);
    if (seconds === null) return null;
    total += seconds;
  }
  return total * Math.max(1, Math.floor(setlist.repeat));
}

/** How the next step arrives — the second half of the sentence's middle line. */
export function transitionLabel(t: Translate, transition: SetlistTransition): string {
  switch (transition.kind) {
    case "cut":
      return t("setlist.transition.cutShort");
    case "countIn":
      return t("setlist.transition.countInShort", {
        count: Math.max(0, Math.floor(transition.bars)),
      });
    case "rest":
      return t("setlist.transition.restShort", {
        count: Math.max(0, Math.floor(transition.bars)),
      });
  }
}

/** "70 · 4/4 · Quarter" — the step card's second line. */
export function stepConfigLabel(t: Translate, step: SetlistStep, meter: string): string {
  return `${step.bpm} · ${meter} · ${t(`subdiv.${step.subdivision}`)}`;
}

/** What the setlist does when it reaches the end. (U9.6) */
export function repeatLabel(t: Translate, repeat: number): string {
  if (repeat === 0) return t("setlist.repeat.forever");
  if (repeat <= 1) return t("setlist.repeat.once");
  return t("setlist.repeat.times", { count: Math.floor(repeat) });
}
