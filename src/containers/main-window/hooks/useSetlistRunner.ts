import { useCallback, useEffect, useRef, useState } from "react";
import {
  setlistReduce,
  IDLE_SETLIST_RUN,
  stepRemaining,
  type SetlistEffect,
  type SetlistRunState,
} from "../../../setlist";
import { armCountIn, setPlaying, setVolume } from "../../../ipc";
import { applySetlistStep } from "./applySetlistStep";
import type { BeatEvent, Setlist, SetlistStep } from "../../../types";

/**
 * Drives a setlist from the engine's beat events.
 *
 * Everything that decides anything lives in `src/setlist/runtime.ts`. This
 * hook only supplies the two clocks the runtime cannot read for itself and
 * carries out the effects it returns.
 *
 * The clocks are deliberately different in kind, for the reason
 * `usePlaybackClock` gives: bars are counted from engine downbeats, because
 * `BeatEvent` carries no bar length and the beat index does not reset when
 * the meter changes; seconds come from wall time, because a step that
 * changes tempo would otherwise make "two minutes" mean something else.
 */
export type SetlistRunner = {
  state: SetlistRunState;
  /** The step now playing, or null when the setlist is not running. */
  step: SetlistStep | null;
  /** 1-based, for "step 2 of 4". (U9.7) */
  stepNumber: number;
  stepCount: number;
  /** What is left of the current gap, live. (U9.7) */
  remaining: ReturnType<typeof stepRemaining>;
  /** Move on at the next downbeat — the manual trigger, and skip-ahead. */
  skip: () => void;
};

export function useSetlistRunner(
  setlist: Setlist | null,
  isPlaying: boolean,
  currentBeat: BeatEvent | null,
  /** Index to begin on — the step the editor has open. */
  startFrom = 0,
): SetlistRunner {
  const [state, setState] = useState<SetlistRunState>(IDLE_SETLIST_RUN);
  const stateRef = useRef(state);
  const setlistRef = useRef(setlist);
  setlistRef.current = setlist;
  /**
   * Read through a ref, never a dependency. The effect below starts the run
   * when `isPlaying` turns true; if the starting index were in its dependency
   * array, clicking a different step mid-run would re-dispatch `start` and
   * restart the setlist under the player.
   */
  const startFromRef = useRef(startFrom);
  startFromRef.current = startFrom;

  const startedAt = useRef<number | null>(null);
  const lastBeat = useRef<number | null>(null);
  /** Volume to put back after a `rest`, if the run stops inside one. */
  const restingVolume = useRef<number | null>(null);
  // Re-render while a seconds gap counts down; the reduced state only moves
  // on beats, which at 40 bpm is once every second and a half.
  const [, setTick] = useState(0);

  const runClock = useCallback(
    () => (startedAt.current === null ? 0 : (Date.now() - startedAt.current) / 1000),
    [],
  );

  const runEffects = useCallback(
    (effects: SetlistEffect[]) => {
      for (const effect of effects) {
        switch (effect.kind) {
          case "applyStep":
            restingVolume.current = null;
            applySetlistStep(effect.step);
            break;
          case "rest":
            // The engine has no rest, so a rest is silence: the step that
            // lands next restores the volume as part of its own config.
            restingVolume.current = setlistRef.current?.steps[stateRef.current.stepIndex]?.volume ?? null;
            void setVolume(0).catch(() => {});
            break;
          case "countIn":
            // After applyStep, never before: the beats have to sound at the
            // tempo of the step they are counting you into.
            void armCountIn(effect.beats).catch(() => {});
            break;
          case "finished":
            void setPlaying(false).catch(() => {});
            break;
        }
      }
    },
    [],
  );

  const dispatch = useCallback(
    (event: Parameters<typeof setlistReduce>[2]) => {
      const current = setlistRef.current;
      if (!current) return;
      const { state: next, effects } = setlistReduce(current, stateRef.current, event);
      stateRef.current = next;
      setState(next);
      runEffects(effects);
    },
    [runEffects],
  );

  const restoreRestVolume = useCallback(() => {
    if (restingVolume.current === null) return;
    void setVolume(restingVolume.current).catch(() => {});
    restingVolume.current = null;
  }, []);

  // Loading a setlist and pressing play is the whole interaction: the setlist
  // starts with the transport and stops with it.
  useEffect(() => {
    if (!setlist || !isPlaying) {
      // A setlist that ended by itself already stopped playback; treating that
      // as a user stop would wipe the "finished" the transport is showing.
      if (stateRef.current.phase !== "finished" && stateRef.current.phase !== "idle") {
        restoreRestVolume();
        dispatch({ kind: "stop" });
      }
      startedAt.current = null;
      lastBeat.current = null;
      return;
    }
    startedAt.current = Date.now();
    lastBeat.current = null;
    dispatch({ kind: "start", seconds: 0, from: startFromRef.current });
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [setlist?.id, isPlaying, dispatch, restoreRestVolume]);

  useEffect(() => {
    if (!isPlaying || !currentBeat) return;
    // Subdivisions are not beats, and the engine can re-emit an index.
    if (currentBeat.subdivision !== 0) return;
    if (lastBeat.current === currentBeat.beat) return;
    lastBeat.current = currentBeat.beat;
    dispatch({ kind: "beat", isDownbeat: currentBeat.isDownbeat, seconds: runClock() });
  }, [isPlaying, currentBeat, dispatch, runClock]);

  const skip = useCallback(() => dispatch({ kind: "advance" }), [dispatch]);

  const step = setlist?.steps[state.stepIndex] ?? null;
  const live = runClock() - state.stepStartedAt;
  return {
    state,
    step: state.phase === "idle" || state.phase === "finished" ? null : step,
    stepNumber: state.stepIndex + 1,
    stepCount: setlist?.steps.length ?? 0,
    remaining: setlist ? stepRemaining(setlist, state, live) : null,
    skip,
  };
}
