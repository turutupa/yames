import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDrillRuns, saveDrillRun } from "../../ipc";
import type { DrillReach, DrillRun, SpeedRamp } from "../../types";
import type { DrillPlan } from "./useDrillPlan";
import { pickUnderlay, type ClimbUnderlay } from "./lastRun";

/**
 * Recording a drill run, and finding the last one worth drawing
 * (UI_DECISIONS U3.3).
 *
 * ## Why the frontend records this
 *
 * A run ends in two different places. The user stopping it ends in
 * `stop_speed_ramp`; the ramp reaching its target ends deep inside the audio
 * thread in `engine.rs`. Neither of those is a place to write to a store —
 * and the one thing both of them do is push a state where `speedRamp.active`
 * has gone false with the final position still on it (nothing resets
 * `current_step` / `bars_in_step` until the next start). So the transition is
 * the recording point, and it catches both endings with one piece of code.
 *
 * ## Why bars are counted here rather than read off the end
 *
 * `barsInStep` never reaches `barsPerStep`: the engine increments it and, in
 * the same locked update, resets it to 0 and advances the step. So a
 * completed step is only ever visible as *the step having moved on*. This
 * hook credits a full step at that moment, and keeps crediting the partial
 * bars of the step being played now — which is what makes the record true for
 * every mode, including adaptive, where the step index counts decisions
 * rather than rungs of any ladder.
 *
 * A jump (clicking a cell of the climb) also moves the step, and it must NOT
 * be credited as a completed step — the player skipped those bars rather than
 * playing them. `markJump` is how the climb says so; without it the underlay
 * would grow every time you clicked it.
 */

/** The most bars seen at one tempo — see `lastRun.ts` on why max, not sum. */
function credit(reach: Map<number, number>, bpm: number, bars: number) {
  if (!bpm || bars <= 0) return;
  reach.set(bpm, Math.max(reach.get(bpm) ?? 0, bars));
}

export function useDrillRuns(ramp: SpeedRamp, plan: DrillPlan, steps: number[]) {
  const [runs, setRuns] = useState<DrillRun[]>([]);
  const [reloads, setReloads] = useState(0);

  // The run in progress. `startedAt` of 0 means there isn't one — which is
  // also what stops a stop-while-already-stopped from writing an empty
  // record on every re-render.
  const startedAtRef = useRef(0);
  const reachRef = useRef(new Map<number, number>());
  const prevStepRef = useRef(0);
  const prevBpmRef = useRef(0);
  const jumpedRef = useRef(false);
  // The plan as it was when the run started. A record has to say what was
  // being played, and the form is still editable mid-run.
  const planRef = useRef(plan);

  useEffect(() => {
    let alive = true;
    getDrillRuns()
      .then((r) => {
        // Defended rather than assumed: a hot-reloaded frontend can call a
        // binary that does not have `get_drill_runs` registered, and every
        // call site here is fire-and-forget. Anything that is not a list of
        // runs is no history, which draws no underlay.
        if (alive) setRuns(Array.isArray(r) ? r : []);
      })
      .catch((err) => {
        // Fire-and-forget like every other invoke here: a store that will not
        // read means no underlay, not a broken drill screen.
        console.error("[yames] get_drill_runs failed", err);
      });
    return () => {
      alive = false;
    };
  }, [reloads]);

  /** Called by the climb before it jumps the run — see the doc above. */
  const markJump = useCallback(() => {
    jumpedRef.current = true;
  }, []);

  useEffect(() => {
    const reach = reachRef.current;

    if (ramp.active) {
      if (startedAtRef.current === 0) {
        startedAtRef.current = Date.now();
        reach.clear();
        planRef.current = plan;
        prevStepRef.current = ramp.currentStep;
        prevBpmRef.current = ramp.currentBpm;
        jumpedRef.current = false;
      }
      if (ramp.currentStep !== prevStepRef.current) {
        // A step that ran out gets its full set of bars; one the player
        // jumped away from gets only what was already credited to it.
        if (!jumpedRef.current) {
          credit(reach, prevBpmRef.current, planRef.current.barsPerStep);
        }
        jumpedRef.current = false;
        prevStepRef.current = ramp.currentStep;
      }
      credit(reach, ramp.currentBpm, ramp.barsInStep);
      prevBpmRef.current = ramp.currentBpm;
      return;
    }

    // --- the run just ended (or there was never one) ---
    if (startedAtRef.current === 0) return;
    const startedAt = startedAtRef.current;
    startedAtRef.current = 0;
    const recorded = planRef.current;

    // A ramp that reached its target stops on the step it finished, and that
    // step was played in full.
    if (ramp.completed) credit(reach, ramp.currentBpm, recorded.barsPerStep);

    const entries: DrillReach[] = [...reach.entries()]
      .filter(([, bars]) => bars > 0)
      .map(([bpm, bars]) => ({ bpm, bars: Math.min(bars, recorded.barsPerStep) }))
      .sort((a, b) => a.bpm - b.bpm);

    // Pressing start and stopping again is not a run. The same judgement
    // `isSegmentReportable` makes about a session that aggregates to nothing:
    // a record of it would only pollute the history that "last run" scans.
    // One completed step is the bar — below that there is no wall to draw.
    const worthKeeping =
      ramp.completed || entries.some((e) => e.bars >= recorded.barsPerStep);
    if (!worthKeeping) return;

    void saveDrillRun({
      id: crypto.randomUUID(),
      timestamp: startedAt,
      startBpm: recorded.startBpm,
      targetBpm: recorded.targetBpm,
      increment: recorded.increment,
      decrement: recorded.decrement,
      barsPerStep: recorded.barsPerStep,
      beatsPerBar: recorded.beatsPerBar,
      subdivision: recorded.subdivision,
      mode: recorded.mode,
      cyclic: recorded.cyclic,
      reachedStep: ramp.currentStep,
      reachedBar: ramp.barsInStep,
      reachedBpm: ramp.currentBpm,
      completed: ramp.completed,
      reach: entries,
    })
      // Reload rather than push the new run onto the local list: the store is
      // the thing that capped and ordered it, and reading it back is the only
      // way to know the write landed.
      .then(() => setReloads((n) => n + 1))
      .catch((err) => {
        console.error("[yames] save_drill_run failed", err);
      });
  }, [ramp.active, ramp.currentStep, ramp.currentBpm, ramp.barsInStep, ramp.completed, plan]);

  // Recomputed when the plan or the history changes, not on every beat: the
  // underlay is a picture of the PAST, and nothing tonight's run does to the
  // playhead can move it.
  const stepSignature = steps.join(",");
  const underlay: ClimbUnderlay | null = useMemo(
    () => pickUnderlay(runs, steps, plan, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runs, stepSignature, plan.barsPerStep, plan.beatsPerBar, plan.subdivision],
  );

  return { underlay, markJump };
}
