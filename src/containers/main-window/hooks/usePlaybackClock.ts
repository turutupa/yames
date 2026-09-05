import { useEffect, useRef, useState } from "react";
import type { BeatEvent } from "../../../types";

/**
 * Bars and seconds since playback started, for the docked transport.
 *
 * Both are counted here rather than read from the engine on purpose. The
 * engine's beat index is a running total that does not reset when the meter
 * changes mid-play, and `BeatEvent` carries no bar length — so the only
 * honest way to count bars in the UI is to count downbeats, which is exactly
 * what the user sees and hears.
 *
 * The clock is wall time, not derived from the beat count: a tempo ramp
 * changes how long a bar lasts, and "elapsed" should keep meaning elapsed.
 */
export function usePlaybackClock(running: boolean, currentBeat: BeatEvent | null) {
  const [bar, setBar] = useState(1);
  const [elapsedSeconds, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const lastBeat = useRef<number | null>(null);

  // Reset on every start; freeze (rather than clear) on stop, so the numbers
  // are still readable after the last note.
  useEffect(() => {
    if (!running) {
      startedAt.current = null;
      lastBeat.current = null;
      return;
    }
    setBar(1);
    setElapsed(0);
    startedAt.current = Date.now();
    lastBeat.current = null;
    const id = setInterval(() => {
      if (startedAt.current !== null) {
        setElapsed((Date.now() - startedAt.current) / 1000);
      }
    }, 500);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running || !currentBeat) return;
    // The engine can re-emit the same beat index; only advance on a new one.
    if (lastBeat.current === currentBeat.beat) return;
    const first = lastBeat.current === null;
    lastBeat.current = currentBeat.beat;
    if (currentBeat.isDownbeat && !first) setBar((b) => b + 1);
  }, [running, currentBeat]);

  return { bar, elapsedSeconds };
}
