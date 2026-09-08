import type { DrillRun } from "../../types";

/**
 * Matching a past run to tonight's plan (UI_DECISIONS U3.3).
 *
 * The whole difficulty of drawing "last time" under "tonight" is that a plan
 * changes between runs. Last night was 80→120; tonight is 90→140. The columns
 * do not line up, and stacking column 1 on column 1 would put five bars of 80
 * underneath tonight's 90 — a picture that says you have already played a
 * tempo you have never played. So the rule is:
 *
 *   **Match by tempo, never by column index.**
 *
 * A column of tonight's climb stands at a tempo. The underlay under it is how
 * many bars the past run played *at that tempo*, and nothing else. Tempos
 * tonight introduces that the past run never touched get no underlay, which is
 * exactly right: you have not played them. A route that zigzags or loops
 * visits the same tempo more than once, so the best of those visits is the
 * answer to "how far did you get at this tempo".
 *
 * That is also why `DrillRun.reach` records bars-per-tempo rather than only a
 * step index. A step index is meaningless outside the ladder it was counted
 * against, and that ladder is not recoverable: adaptive counts a step per
 * decision including the ones that went down, and a cyclic ramp counts past
 * the end of its own ladder.
 *
 * ## What makes a run comparable at all
 *
 * Three settings decide what one cell of the climb *means*, and all three
 * have to match:
 *
 *   - `barsPerStep`  — how many cells a column has
 *   - `beatsPerBar`  — how long a cell is
 *   - `subdivision`  — what you were playing inside it
 *
 * Twelve bars of 4/4 sixteenths is not the same exercise as twelve bars of
 * 3/4 quarters at the same tempo, and drawing one under the other would be a
 * misaligned underlay wearing the costume of an aligned one.
 *
 * Deliberately *not* required: `startBpm`, `targetBpm`, `increment`,
 * `decrement`, `mode` and `cyclic`. Those change the route, not the exercise —
 * and matching by tempo already makes the route irrelevant. Requiring them
 * would mean nudging the target from 120 to 125 threw away every run you had
 * ever done, which is the opposite of what the underlay is for.
 *
 * ## When nothing matches
 *
 * Nothing is drawn. No legend key, no note, no placeholder — `DrillClimb`'s
 * rule is that a chart which invents its own history is worse than one that
 * admits it has none, and an empty underlay would read as "you got nowhere"
 * rather than "there is no record".
 */

/** The settings of tonight's plan that decide what a cell means. */
export type ClimbPlanShape = {
  barsPerStep: number;
  beatsPerBar: number;
  subdivision: number;
};

/** Everything `DrillClimb` needs to draw one past run under tonight's plan. */
export type ClimbUnderlay = {
  /** Bars the past run played at each of tonight's tempos, one entry per
   *  column of `steps`, capped at tonight's `barsPerStep`. */
  barsPerColumn: number[];
  /** The furthest column along tonight's route that carries any underlay —
   *  the wall. Always a valid index; an underlay with no wall is not built. */
  wallStep: number;
  /** Bars into the wall column. Always ≥ 1. */
  wallBar: number;
  /** Tonight's tempo at the wall column. */
  wallBpm: number;
  /**
   * The furthest tempo the past run itself got to, and the bars it played
   * there — which is NOT always the wall. Tonight's plan can stop short of
   * where you got last time (last night 80→120, tonight 80→100), and the
   * sentence beside the chart should still say where you got. The wall is
   * where that reach meets tonight's picture; this is the reach.
   */
  furthestBpm: number;
  furthestBars: number;
  /** The past run reached its target rather than being stopped short. */
  completed: boolean;
  /** Whole calendar days between that run and now. 0 = today. */
  daysAgo: number;
};

/**
 * Do the two plans mean the same thing by "a cell"? See the header — this is
 * the exercise test, not the route test.
 */
export function isComparable(run: DrillRun, plan: ClimbPlanShape): boolean {
  return (
    run.barsPerStep === plan.barsPerStep &&
    run.beatsPerBar === plan.beatsPerBar &&
    // Old records could pre-date the field; `|| 1` matches the same defence
    // `useDrillPlan` puts on the live ramp, where a 0 divides a beat into
    // nothing on the audio thread.
    (run.subdivision || 1) === (plan.subdivision || 1)
  );
}

/**
 * Whole calendar days between two instants, so "yesterday" means yesterday
 * rather than "at least 24 hours ago" — a run at 11pm and a look at 8am the
 * next morning is one day, not zero.
 *
 * Rounded rather than floored because a clock change puts a 23- or 25-hour
 * day between two midnights.
 */
export function calendarDaysAgo(then: number, now: number): number {
  const midnight = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  return Math.max(0, Math.round((midnight(now) - midnight(then)) / 86_400_000));
}

/**
 * Draw one past run against tonight's ladder, or return null if it says
 * nothing about it.
 *
 * Null covers three cases and they all mean the same thing to the caller —
 * there is nothing honest to draw:
 *   - the run is a different exercise (`isComparable` fails);
 *   - the run predates `reach`, so no per-tempo record exists;
 *   - the two plans share no tempo the run actually played.
 */
export function underlayFor(
  run: DrillRun,
  steps: number[],
  plan: ClimbPlanShape,
  now: number,
): ClimbUnderlay | null {
  if (!isComparable(run, plan)) return null;
  if (!run.reach || run.reach.length === 0) return null;

  // Most bars seen at each tempo. A zigzag or a cyclic ramp passes the same
  // tempo more than once, and the question the column answers is how far you
  // got there — so the best visit wins, not the sum, which would overflow a
  // column that only has `barsPerStep` cells.
  const best = new Map<number, number>();
  for (const { bpm, bars } of run.reach) {
    best.set(bpm, Math.max(best.get(bpm) ?? 0, bars));
  }

  let wallStep = -1;
  const barsPerColumn = steps.map((bpm, idx) => {
    const bars = Math.min(best.get(bpm) ?? 0, plan.barsPerStep);
    // The wall is the LAST column along tonight's route with anything under
    // it, not the highest tempo — a descending drill's wall is its slowest
    // step, and a zigzag's is wherever the route stopped.
    if (bars > 0) wallStep = idx;
    return bars;
  });

  if (wallStep < 0) return null;

  // How far the run itself got, read off its own record rather than off
  // tonight's ladder. "Furthest" is toward that run's own target, so a
  // descending drill's furthest step is its slowest one — and taking it from
  // `reach` rather than from `reachedBpm` means a run stopped on the first
  // bar of a new step reports the step it actually played, instead of
  // "0 bars into 115".
  const ascending = run.targetBpm >= run.startBpm;
  let furthestBpm = 0;
  let furthestBars = 0;
  for (const [bpm, bars] of best) {
    if (bars <= 0) continue;
    const further =
      furthestBars === 0 || (ascending ? bpm > furthestBpm : bpm < furthestBpm);
    if (further) {
      furthestBpm = bpm;
      furthestBars = Math.min(bars, run.barsPerStep);
    }
  }

  return {
    barsPerColumn,
    wallStep,
    wallBar: barsPerColumn[wallStep],
    wallBpm: steps[wallStep],
    furthestBpm,
    furthestBars,
    completed: run.completed,
    daysAgo: calendarDaysAgo(run.timestamp, now),
  };
}

/**
 * The last run worth drawing — the most recent one that has something to say
 * about tonight's plan.
 *
 * "Most recent" alone would be wrong: press start on a different drill in
 * between and last night's alt-picking ramp would vanish from the picture
 * even though it is still the last time you played this. So the scan is
 * newest-first and takes the first run that yields an underlay, which makes
 * "last run" mean the last run *of this exercise*.
 *
 * `runs` is expected newest-first, which is how `get_drill_runs` stores them.
 */
export function pickUnderlay(
  runs: DrillRun[],
  steps: number[],
  plan: ClimbPlanShape,
  now: number,
): ClimbUnderlay | null {
  for (const run of runs) {
    const underlay = underlayFor(run, steps, plan, now);
    if (underlay) return underlay;
  }
  return null;
}
