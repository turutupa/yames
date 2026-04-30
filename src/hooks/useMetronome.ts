import { useEffect, useState, useCallback } from "react";
import type { AppState, BeatEvent } from "../types";
import { getState, onBeat, onStateChange } from "../ipc";
import { getThemeById, applyTheme } from "../themes";

const DEFAULT_STATE: AppState = {
  bpm: 120,
  isPlaying: false,
  subdivision: 1,
  mode: "comfortable",
  corner: "top-right",
  alwaysOnTop: true,
  accentColor: "#e94560",
  theme: "mono",
  volume: 0.8,
  soundType: "click",
  timeSignature: 4,
  speedRamp: {
    startBpm: 80,
    targetBpm: 140,
    increment: 5,
    decrement: 3,
    barsPerStep: 4,
    beatsPerBar: 4,
    mode: "linear",
    cyclic: false,
    active: false,
    currentStep: 0,
    currentBpm: 80,
    direction: "up",
    barsInStep: 0,
    completed: false,
  },
};

export function useMetronome() {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [currentBeat, setCurrentBeat] = useState<BeatEvent | null>(null);

  useEffect(() => {
    getState().then(setState).catch(() => {});

    const unlistenState = onStateChange((s) => setState(s));
    const unlistenBeat = onBeat((b) => setCurrentBeat(b));

    return () => {
      unlistenState.then((fn) => fn());
      unlistenBeat.then((fn) => fn());
    };
  }, []);

  // Apply theme whenever it changes
  useEffect(() => {
    const theme = getThemeById(state.theme);
    applyTheme(theme);
  }, [state.theme]);

  const resetBeat = useCallback(() => {
    setCurrentBeat(null);
  }, []);

  return { state, currentBeat, resetBeat };
}
