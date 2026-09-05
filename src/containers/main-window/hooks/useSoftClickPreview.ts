import { useCallback, useRef, useState } from "react";
import { setBpm, setPlaying, setVolume, togglePlayback } from "../../../ipc";
import type { AppState } from "../../../types";

/**
 * The wizard's demo click — deliberately slow and quiet. The tempo is also
 * where a completed wizard leaves the user ("Start practicing lands on the
 * metronome at 80 BPM"), so it is exported rather than duplicated.
 */
export const SOFT_CLICK_BPM = 80;
const SOFT_CLICK_VOLUME = 0.35;

/**
 * The onboarding wizard demonstrates the app rather than describing it: a soft
 * 80 BPM click runs while it is open (W0/W2). The user's tempo, volume and
 * playing state are captured when it starts and restored when it stops, so a
 * wizard opened mid-practice gives the session back exactly as it was.
 *
 * `state` is read through a ref rather than a dependency: the snapshot must be
 * whatever is true at the moment the wizard opens, and the callbacks must stay
 * stable so the wizard does not re-render on every beat.
 */
export function useSoftClickPreview(state: AppState) {
  const stateRef = useRef(state);
  stateRef.current = state;

  const previous = useRef<{ bpm: number; volume: number; wasPlaying: boolean } | null>(null);
  const [softClickPlaying, setSoftClickPlaying] = useState(false);

  const startSoftClick = useCallback(() => {
    if (previous.current) return;
    const snapshot = stateRef.current;
    previous.current = {
      bpm: snapshot.bpm,
      volume: snapshot.volume,
      wasPlaying: snapshot.isPlaying,
    };
    setSoftClickPlaying(true);
    void (async () => {
      try {
        await setVolume(SOFT_CLICK_VOLUME);
        await setBpm(SOFT_CLICK_BPM);
        if (!snapshot.isPlaying) await togglePlayback();
      } catch {
        /* engine not ready — the wizard still works, just silently */
      }
    })();
  }, []);

  const stopSoftClick = useCallback(async () => {
    const prev = previous.current;
    if (!prev) return;
    previous.current = null;
    setSoftClickPlaying(false);
    try {
      if (!prev.wasPlaying) await setPlaying(false);
      await setVolume(prev.volume);
      await setBpm(prev.bpm);
    } catch {
      /* ignore — nothing to restore if the engine is gone */
    }
  }, []);

  return { softClickPlaying, startSoftClick, stopSoftClick };
}
