import { useEffect, useMemo, useRef, useState } from "react";
import { onBeat } from "../../../ipc";
import type { BeatEvent } from "../../../types";
import type { ChordSequence, GameMode, RhythmPattern, SessionState } from "../trackTypes";

const SCORED_BEATS = 32;

export function useCuedSession({
  session,
  beatCount,
  bpm,
  gameMode,
  selectedSequence,
  selectedPattern,
}: {
  session: SessionState;
  beatCount: number;
  bpm: number;
  gameMode: GameMode;
  selectedSequence: ChordSequence | null;
  selectedPattern: RhythmPattern | null;
}) {
  const subBeatTimestamps = useRef<number[]>([]);
  const [subBeatCount, setSubBeatCount] = useState(0);

  const gameSubdivision: 1 | 2 | 4 =
    gameMode === "rhythm" && selectedPattern
      ? selectedPattern.subdivisionInterval
      : 1;

  const expectedTaps = SCORED_BEATS * gameSubdivision;

  // Cue derivation
  const currentCue = useMemo<string | undefined>(() => {
    if (gameMode === "chords" && selectedSequence) {
      const { chords, beatsPerChord } = selectedSequence;
      const chordIndex = Math.floor(beatCount / beatsPerChord) % chords.length;
      return chords[chordIndex];
    }
    if (gameMode === "rhythm" && selectedPattern) {
      return selectedPattern.symbol;
    }
    return undefined;
  }, [gameMode, selectedSequence, selectedPattern, beatCount]);

  const chordIndex = useMemo<number>(() => {
    if (gameMode === "chords" && selectedSequence) {
      const { chords, beatsPerChord } = selectedSequence;
      return Math.floor(beatCount / beatsPerChord) % chords.length;
    }
    return 0;
  }, [gameMode, selectedSequence, beatCount]);

  // Reset sub-beat tracking on session start
  useEffect(() => {
    if (session === "playing") {
      subBeatTimestamps.current = [];
      setSubBeatCount(0);
    }
  }, [session]);

  // Sub-beat listener — only active in rhythm mode while playing
  useEffect(() => {
    if (gameMode !== "rhythm") return;
    if (session !== "playing") return;

    const unlisten = onBeat((_b: BeatEvent) => {
      // Record ALL subdivisions (including subdivision === 0)
      const now = performance.now();
      subBeatTimestamps.current.push(now);
      setSubBeatCount((c) => c + 1);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [gameMode, session, bpm]);

  return {
    currentCue,
    chordIndex,
    subBeatTimestamps,
    subBeatCount,
    gameSubdivision,
    expectedTaps,
  };
}
