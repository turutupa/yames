import { useCallback, useEffect, useRef, useState } from "react";
import {
  chainReduce,
  IDLE_CHAIN_RUN,
  stepRemaining,
  type ChainEffect,
  type ChainRunState,
} from "../../../chain";
import { armCountIn, setPlaying, setVolume } from "../../../ipc";
import { applyChainStep } from "./applyChainStep";
import type { BeatEvent, Chain, ChainStep } from "../../../types";

/**
 * Drives a chain from the engine's beat events.
 *
 * Everything that decides anything lives in `src/chain/runtime.ts`. This
 * hook only supplies the two clocks the runtime cannot read for itself and
 * carries out the effects it returns.
 *
 * The clocks are deliberately different in kind, for the reason
 * `usePlaybackClock` gives: bars are counted from engine downbeats, because
 * `BeatEvent` carries no bar length and the beat index does not reset when
 * the meter changes; seconds come from wall time, because a step that
 * changes tempo would otherwise make "two minutes" mean something else.
 */
export type ChainRunner = {
  state: ChainRunState;
  /** The step now playing, or null when the chain is not running. */
  step: ChainStep | null;
  /** 1-based, for "step 2 of 4". (U9.7) */
  stepNumber: number;
  stepCount: number;
  /** What is left of the current gap, live. (U9.7) */
  remaining: ReturnType<typeof stepRemaining>;
  /** Move on at the next downbeat — the manual trigger, and skip-ahead. */
  skip: () => void;
};

export function useChainRunner(
  chain: Chain | null,
  isPlaying: boolean,
  currentBeat: BeatEvent | null,
): ChainRunner {
  const [state, setState] = useState<ChainRunState>(IDLE_CHAIN_RUN);
  const stateRef = useRef(state);
  const chainRef = useRef(chain);
  chainRef.current = chain;

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
    (effects: ChainEffect[]) => {
      for (const effect of effects) {
        switch (effect.kind) {
          case "applyStep":
            restingVolume.current = null;
            applyChainStep(effect.step);
            break;
          case "rest":
            // The engine has no rest, so a rest is silence: the step that
            // lands next restores the volume as part of its own config.
            restingVolume.current = chainRef.current?.steps[stateRef.current.stepIndex]?.volume ?? null;
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
    (event: Parameters<typeof chainReduce>[2]) => {
      const current = chainRef.current;
      if (!current) return;
      const { state: next, effects } = chainReduce(current, stateRef.current, event);
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

  // Loading a chain and pressing play is the whole interaction: the chain
  // starts with the transport and stops with it.
  useEffect(() => {
    if (!chain || !isPlaying) {
      // A chain that ended by itself already stopped playback; treating that
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
    dispatch({ kind: "start", seconds: 0 });
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [chain?.id, isPlaying, dispatch, restoreRestVolume]);

  useEffect(() => {
    if (!isPlaying || !currentBeat) return;
    // Subdivisions are not beats, and the engine can re-emit an index.
    if (currentBeat.subdivision !== 0) return;
    if (lastBeat.current === currentBeat.beat) return;
    lastBeat.current = currentBeat.beat;
    dispatch({ kind: "beat", isDownbeat: currentBeat.isDownbeat, seconds: runClock() });
  }, [isPlaying, currentBeat, dispatch, runClock]);

  const skip = useCallback(() => dispatch({ kind: "advance" }), [dispatch]);

  const step = chain?.steps[state.stepIndex] ?? null;
  const live = runClock() - state.stepStartedAt;
  return {
    state,
    step: state.phase === "idle" || state.phase === "finished" ? null : step,
    stepNumber: state.stepIndex + 1,
    stepCount: chain?.steps.length ?? 0,
    remaining: chain ? stepRemaining(chain, state, live) : null,
    skip,
  };
}
