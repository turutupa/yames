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
import type { ScorerPassResult } from "../ipc";
import type { TakeMeasures } from "./takeMeasures";

/**
 * How many clean bars in a row earn a clean tempo.
 *
 * The owner's definition (`BRIEF.md`): the highest tempo at which a Take on that
 * Exercise passes its bar over at least 8 bars. Since 2026-11-17 those are
 * **any** 8 bars in a row of the Take, not all of it (`TAKE_SLACK_BARS`).
 */
export const CLEAN_TEMPO_MIN_BARS = 8;

/**
 * Bars a Take has beyond the longest stretch it is judged over (owner,
 * 2026-11-17). Without them a Take was exactly as long as the stretch, so one
 * fluffed bar anywhere lost it; with them, a bad bar near either end can be
 * left behind and the clean bars around it still count.
 */
export const TAKE_SLACK_BARS = 2;

/**
 * How many bars a full Take of this Exercise is.
 *
 * Long enough for the clean tempo and for the longest stretch a pass bar asks
 * to hold over (the Stamina minutes ask for 16; shorter, it could never pass),
 * plus `TAKE_SLACK_BARS`, and never less than one whole pass of the Exercise.
 *
 * Not rounded up to whole passes: a 4-bar lick would be 12 bars for a 10-bar
 * need, and a 16-bar Stamina pattern 32. The Take ends on a bar line inside
 * the pattern instead (`take.ts` `writtenOut`), which costs nothing: grading is
 * per bar, the band plays bar `b` of its chart as `b mod form` (`takeBand.ts`),
 * and the engine stops on the last bar's sample whatever is written there.
 */
export function takeBarsOf(exercise: Exercise): number {
  const needed = Math.max(CLEAN_TEMPO_MIN_BARS, barsAskedFor(exercise)) + TAKE_SLACK_BARS;
  return Math.max(Math.max(1, exercise.bars), needed);
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
 * bar and eight good ones holds it: the window slides one bar at a time. Until the scorer reports per bar, the whole
 * Take is the only window there is, which is the stricter reading.
 */
function evennessOver(measures: TakeMeasures, overBars: number): number | null {
  const bars = measures.barEvenness;
  if (!bars || bars.length < overBars || overBars < 1) return measures.evenness;
  // A window is only as even as its worst bar, as in `score/pass.rs`: an
  // average would let one sloppy bar hide among good ones.
  let best = -1;
  for (let at = 0; at + overBars <= bars.length; at += 1) {
    best = Math.max(best, Math.min(...bars.slice(at, at + overBars)));
  }
  return best;
}

/**
 * The scorer's verdict, in this file's terms. `score/pass.rs` judges every
 * window of finished bars, so it is the rule; the reading in `gradeTake` is the
 * fallback for a build or a Take that came back without it.
 */
function fromScorer(
  exercise: Exercise,
  bpm: number,
  pass: ScorerPassResult,
  nothing: Omit<TakeGrade, "verdict">,
): TakeGrade {
  if (pass.verdict === "didntCatchEnough") return { ...nothing, verdict: "notCaught" };
  // In the Exercise's order: the scorer's check for each assessed bar, and an
  // unmeasured one for what timing cannot judge.
  const remaining = [...pass.checks];
  const checks: BarCheck[] = exercise.passBars.map((bar) => {
    const at = remaining.findIndex((c) => c.metric === bar.metric && c.overBars === bar.overBars);
    const scorer = at >= 0 ? remaining.splice(at, 1)[0] : undefined;
    return {
      metric: bar.metric,
      value: scorer ? scorer.measured : null,
      ...(bar.min === undefined ? {} : { min: bar.min }),
      ...(bar.max === undefined ? {} : { max: bar.max }),
      met: scorer ? scorer.held : null,
    };
  });
  const unmeasured = checks.filter((c) => c.met === null).map((c) => c.metric);
  const failed = checks.find((c) => c.met === false) ?? null;
  const headline = failed ?? checks.find((c) => c.met === true) ?? null;
  const measurable = checks.some((c) => c.met !== null);
  const judged = { ...nothing, checks, headline, unmeasured };
  if (pass.verdict === "tooShort") return { ...judged, verdict: "tooShort" };
  if (pass.verdict === "failed" || !measurable) return { ...judged, verdict: "belowBar" };
  const clean = pass.countsForCleanTempo;
  const passAt = exercise.tempo.passAtBpm;
  return {
    ...judged,
    verdict: "passed",
    cleanBpm: clean ? bpm : null,
    passesExercise: clean && passAt !== null && bpm >= passAt,
  };
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
  if (measures.pass) return fromScorer(exercise, bpm, measures.pass, nothing);

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

  // The clean tempo is 8 clean bars in a row, not 8 bars played: with per-bar
  // evenness, the best 8-bar stretch has to meet every evenness floor too, as
  // `heldBars` does in `score/pass.rs`. Without it, the whole Take is the
  // stretch, and it was judged above.
  const longEnough =
    measures.barsPlayed >= CLEAN_TEMPO_MIN_BARS &&
    exercise.passBars.every((bar) => {
      if (bar.metric !== "timingEvenness" || bar.min === undefined) return true;
      const value = evennessOver(measures, Math.max(CLEAN_TEMPO_MIN_BARS, bar.overBars));
      return value !== null && value >= bar.min;
    });
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
