import { useEffect, useState } from "react";
import { configureSpeedRamp } from "../../ipc";
import type { SpeedRamp } from "../../types";

/**
 * Everything about a drill that the user sets — as opposed to `SpeedRamp`,
 * which also carries where the run has got to.
 */
export type DrillPlan = {
  startBpm: number;
  targetBpm: number;
  increment: number;
  decrement: number;
  barsPerStep: number;
  beatsPerBar: number;
  subdivision: number;
  mode: string;
  cyclic: boolean;
  aggressiveness: string;
  /** 0 for no count-in. The UI shows this as an on/off switch. */
  warmupBeats: number;
};

function planFromRamp(ramp: SpeedRamp): DrillPlan {
  return {
    startBpm: ramp.startBpm,
    targetBpm: ramp.targetBpm,
    increment: ramp.increment,
    decrement: ramp.decrement,
    barsPerStep: ramp.barsPerStep,
    beatsPerBar: ramp.beatsPerBar,
    // Defended rather than assumed: a hot-reloaded frontend can render
    // against a binary that predates this field, and a subdivision of 0
    // divides a beat into nothing on the audio thread.
    subdivision: ramp.subdivision || 1,
    mode: ramp.mode,
    cyclic: ramp.cyclic,
    aggressiveness: ramp.aggressiveness || "moderate",
    warmupBeats: ramp.warmupBeats,
  };
}

/**
 * A string that changes exactly when a PLANNED field of the ramp changes.
 *
 * Used as the sync effect's dependency. The alternative is listing all eleven
 * fields in a deps array, which is a list that has to be edited every time the
 * plan grows a setting — and the failure when you forget is silent: the form
 * just stops following the backend for that one value.
 */
function planSignature(ramp: SpeedRamp): string {
  return Object.values(planFromRamp(ramp)).join("|");
}

/**
 * The drill's editable plan, and the one way to change it.
 *
 * This replaces eleven `useState` pairs that were each written out four
 * times — the declaration, the effect that syncs them from the backend, that
 * effect's dependency array, and the `??` chain inside the save call. Four
 * places to edit for one new setting, and every one of them silent when
 * missed.
 *
 * `edit` is the important half. Changing a value used to be two calls, a
 * local setter and a save, and they could disagree: the aggressiveness
 * buttons called `setAggressiveness(next)` and then a save that read
 * `aggressiveness` from the render's own closure — the value BEFORE the
 * click — so picking "Gentle" sent whatever was selected previously. Here the
 * next plan is computed once and both shown and sent, so that class of bug
 * cannot be written.
 *
 * The backend stays the source of truth while the drill is stopped; a running
 * ramp is left alone so the form does not fight the run's own tempo changes.
 */
export function useDrillPlan(ramp: SpeedRamp) {
  const [plan, setPlan] = useState<DrillPlan>(() => planFromRamp(ramp));
  const signature = planSignature(ramp);

  useEffect(() => {
    if (!ramp.active) setPlan(planFromRamp(ramp));
    // `ramp` itself is a fresh object on every `state-changed` event, so
    // depending on it would re-run this on every beat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ramp.active]);

  /** Apply a change: show it, and send the whole plan to the engine. */
  const edit = (patch: Partial<DrillPlan>) => {
    const next = { ...plan, ...patch };
    setPlan(next);
    void configureSpeedRamp(next).catch((err) => {
      // An `invoke` nobody awaits is silent when it rejects, and the drill
      // just quietly stops saving.
      console.error("[yames] configure_speed_ramp failed", err);
    });
  };

  return { plan, edit };
}
