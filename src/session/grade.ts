/**
 * Did a Take pass? Plain arithmetic over what was measured, per the pack.
 *
 * A model has no part in this (`BRIEF.md` rule 3), and neither does the scorer's
 * headline `score`, which ignores missed notes on guitar
 * (`CONVERSION_AUDIT.md` §3). A pass bar names controlled metrics
 * (`src/paths/metrics.ts`), and this reads each one.
 *
 * Three outcomes are kept apart because a player must be told them differently:
 * a bar was not met (true, and useful), nothing was graded because too little
 * was heard (says nothing about the player), and a metric the Exercise lists
 * that this build cannot measure yet (`noteIdentity`). That last one does not
 * block a pass and does not count towards one, and the result says so.
 */
import type { Exercise, PassBar } from "../paths/format";
import type { TakeMeasures } from "./takeMeasures";

/**
 * How many bars a Take must run for its tempo to count as clean.
 *
 * The owner's definition (`BRIEF.md`): the highest tempo at which a Take on that
 * Exercise passes its bar over at least 8 bars.
 */
export const CLEAN_TEMPO_MIN_BARS = 8;

/** How many bars a full Take of this Exercise is, in whole passes. */
export function takeBarsOf(exercise: Exercise): number {
  const bars = Math.max(1, exercise.bars);
  return Math.ceil(CLEAN_TEMPO_MIN_BARS / bars) * bars;
}

export type BarCheck = {
  metric: string;
  /** What was measured, on the bar's own scale. Null: not measured. */
  value: number | null;
  /** The bar: a floor or a ceiling, whichever the pack set. */
  min?: number;
  max?: number;
  /** Null is "cannot be measured here", which is neither met nor failed. */
  met: boolean | null;
};

export type TakeVerdict =
  /** Every measurable bar was met, over enough bars. */
  | "passed"
  /** At least one bar was not met. */
  | "belowBar"
  /** Stopped before enough bars were played to judge the bar. */
  | "tooShort"
  /** Too little was heard. No grade, and it counts for nothing. */
  | "notCaught"
  /** The Exercise or this rung is not graded by the app. */
  | "ungraded";

export type TakeGrade = {
  verdict: TakeVerdict;
  checks: BarCheck[];
  /** The check most worth talking about: the first failed, or the first met. */
  headline: BarCheck | null;
  /** A metric the bar lists that this build cannot measure yet. */
  unmeasured: string[];
  /** This Take earned this clean tempo, or null. */
  cleanBpm: number | null;
  /** This Take passes the Exercise itself: the bar, at the pass rung or above. */
  passesExercise: boolean;
};

/** The longest run the pack's bars ask for. */
function barsAskedFor(exercise: Exercise): number {
  return exercise.passBars.reduce((most, bar) => Math.max(most, bar.overBars), 0);
}

/**
 * The best stretch of `overBars` bars, or the whole Take with no per-bar data.
 *
 * A pass bar says "consecutive bars this must hold over", so a Take with one bad
 * bar and eight good ones holds it. Until the scorer reports per bar, the whole
 * Take is the only window there is, which is the stricter reading.
 */
function evennessOver(measures: TakeMeasures, overBars: number): number | null {
  const bars = measures.barEvenness;
  if (!bars || bars.length < overBars || overBars < 1) return measures.evenness;
  let best = -1;
  for (let at = 0; at + overBars <= bars.length; at += 1) {
    let sum = 0;
    for (let i = at; i < at + overBars; i += 1) sum += bars[i];
    best = Math.max(best, sum / overBars);
  }
  return best;
}

function valueOf(bar: PassBar, measures: TakeMeasures): number | null {
  switch (bar.metric) {
    case "timingEvenness":
      return evennessOver(measures, bar.overBars);
    case "notesHeard":
      return measures.expected > 0 ? measures.heard / measures.expected : null;
    case "extraNotes":
      // A bar's ceiling is per `overBars` bars, and a Take may be longer.
      return measures.barsPlayed > 0
        ? (measures.extras * bar.overBars) / measures.barsPlayed
        : null;
    case "accentPlacement":
      return measures.accent;
    case "noteIdentity":
      return measures.noteIdentity;
    default:
      return null;
  }
}

function check(bar: PassBar, measures: TakeMeasures): BarCheck {
  const value = valueOf(bar, measures);
  const base: BarCheck = {
    metric: bar.metric,
    value,
    ...(bar.min === undefined ? {} : { min: bar.min }),
    ...(bar.max === undefined ? {} : { max: bar.max }),
    met: null,
  };
  if (value === null) return base;
  const overFloor = bar.min === undefined || value >= bar.min;
  const underCeiling = bar.max === undefined || value <= bar.max;
  return { ...base, met: overFloor && underCeiling };
}

export function gradeTake(exercise: Exercise, bpm: number, measures: TakeMeasures): TakeGrade {
  const nothing = {
    checks: [] as BarCheck[],
    headline: null,
    unmeasured: [] as string[],
    cleanBpm: null,
    passesExercise: false,
  };

  const rung = exercise.tempo.rungs.find((r) => r.bpm === bpm);
  if (exercise.grading !== "graded" || rung?.grading === "selfChecked") {
    return { ...nothing, verdict: "ungraded" };
  }
  if (!measures.caught) return { ...nothing, verdict: "notCaught" };

  const checks = exercise.passBars.map((bar) => check(bar, measures));
  const unmeasured = checks.filter((c) => c.met === null).map((c) => c.metric);
  const failed = checks.find((c) => c.met === false) ?? null;
  const headline = failed ?? checks.find((c) => c.met === true) ?? null;
  const measurable = checks.some((c) => c.met !== null);

  if (measures.barsPlayed < barsAskedFor(exercise)) {
    return { ...nothing, checks, headline, unmeasured, verdict: "tooShort" };
  }
  if (failed || !measurable) {
    return { ...nothing, checks, headline, unmeasured, verdict: "belowBar" };
  }

  const longEnough = measures.barsPlayed >= CLEAN_TEMPO_MIN_BARS;
  const passAt = exercise.tempo.passAtBpm;
  return {
    verdict: "passed",
    checks,
    headline,
    unmeasured,
    cleanBpm: longEnough ? bpm : null,
    passesExercise: longEnough && passAt !== null && bpm >= passAt,
  };
}
