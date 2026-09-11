import { useRef } from "react";
import { meterKey } from "../utils/meter";

/**
 * What the metronome is set to, and what has changed about it since anyone
 * last looked.
 *
 * This was the inside of `useSession.ts`, which is 2 400 lines of practice
 * coach wrapped around one small piece of bookkeeping that is not about the
 * coach at all: the tempo, the meter, the preset and the instrument, plus
 * "did any of those move, and has the player stopped fiddling yet".
 *
 * It is pulled out for the mobile build (`plans/MOBILE_IMPLEMENTATION_PLAN.md`
 * §3): this module imports nothing from `src/coach/`, nothing from
 * `ipc.desktop.ts`, and nothing that knows a coach exists — so it is safe on a
 * phone, where `useSession` is not in the bundle at all. On desktop
 * `useSession` composes it and feeds the changes to the gatekeeper.
 *
 * Everything here is deliberately render-scoped rather than ref-latched:
 * `snapshot` is the values of the render that produced it, so a caller that
 * captures this object inside a `useCallback` gets exactly the staleness its
 * own dependency array implies — the same behaviour the inlined version had.
 */

/** The metronome settings a change in which is worth noticing. */
export interface MetronomeStateOptions {
  bpm: number;
  timeSignature: number;
  /**
   * Accent grouping of the bar. Watched alongside `timeSignature` because a
   * variant switch that keeps the same total (7/8 `[3,2,2]` → `[2,3,2]`) is a
   * real change the player hears and `timeSignature` alone cannot see it.
   */
  beatGroups?: number[];
  presetId?: string;
  presetName?: string;
  instrument: string;
}

/** One render's worth of settings, with the meter reduced to a stable key. */
export interface MetronomeSnapshot {
  bpm: number;
  presetId?: string;
  presetName?: string;
  timeSignature: number;
  meterId: string;
  instrument: string;
}

export type ConfigChangeKind =
  | "bpm-up"
  | "bpm-down"
  | "preset"
  | "time-sig"
  | "grouping"
  | "instrument";

export interface ConfigChange {
  kind: ConfigChangeKind;
  from: string | number;
  to: string | number;
}

/**
 * Everything that moved between two snapshots, in salience order: tempo,
 * preset, meter, instrument.
 *
 * A bar that changed length reports `time-sig` and nothing about the
 * grouping — the length is the bigger news, and reporting both would say the
 * same change twice.
 */
export function diffMetronomeState(
  from: MetronomeSnapshot,
  to: MetronomeSnapshot,
): ConfigChange[] {
  const changes: ConfigChange[] = [];
  if (from.bpm !== to.bpm) {
    changes.push({
      kind: to.bpm > from.bpm ? "bpm-up" : "bpm-down",
      from: from.bpm,
      to: to.bpm,
    });
  }
  if (from.presetId !== to.presetId) {
    changes.push({
      kind: "preset",
      from: from.presetId ?? "free play",
      to: to.presetName ?? to.presetId ?? "free play",
    });
  }
  if (from.timeSignature !== to.timeSignature) {
    changes.push({
      kind: "time-sig",
      from: from.timeSignature,
      to: to.timeSignature,
    });
  } else if (from.meterId !== to.meterId) {
    changes.push({ kind: "grouping", from: from.meterId, to: to.meterId });
  }
  if (from.instrument !== to.instrument) {
    changes.push({
      kind: "instrument",
      from: from.instrument,
      to: to.instrument,
    });
  }
  return changes;
}

export function useMetronomeState({
  bpm,
  timeSignature,
  beatGroups,
  presetId,
  presetName,
  instrument,
}: MetronomeStateOptions) {
  // Stable identity for the meter: `beatGroups` arrives as a fresh array on
  // every state-changed event, so anything depending on the meter has to
  // depend on this string rather than the array reference.
  const meterId = meterKey(beatGroups ?? [timeSignature]);
  const snapshot: MetronomeSnapshot = {
    bpm,
    presetId,
    presetName,
    timeSignature,
    meterId,
    instrument,
  };

  // The last values anyone *acted on* — not the last values rendered. A burst
  // of -5 BPM clicks is one change from here, which is the whole point: six
  // cards for six clicks is what the debounce below exists to prevent.
  const committedRef = useRef<MetronomeSnapshot>(snapshot);
  const settleTimerRef = useRef<number | null>(null);

  return {
    meterId,
    snapshot,
    /** What has moved since the last `commit`, in salience order. */
    changesSinceCommit: () => diffMetronomeState(committedRef.current, snapshot),
    /** Accept a snapshot as the new baseline. */
    commit: (next: MetronomeSnapshot) => {
      committedRef.current = next;
    },
    /** The pending "player has stopped fiddling" timer, or null. */
    settleTimer: settleTimerRef,
    /** Drop the pending timer, if any. */
    cancelSettle: () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    },
  };
}
