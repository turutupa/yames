/**
 * Where the pattern is, frame by frame, for a screen that draws on onsets.
 *
 * The same motion the runway's strip and the tab cursor use (`songs/cursor`):
 * re-anchored on every report, smoothed between by the score's tempo, never
 * backwards, snapped on a loop seam. Through the count-in it pre-rolls from
 * the count-in's first tick. It renders nothing: `onTick` is called from
 * `requestAnimationFrame` with the tick, and the caller only touches the DOM
 * or the neck when what it shows changes (once per note, not per frame).
 */
import { useEffect, useRef } from "react";
import { cursorTickAt, onReport, snapTo } from "../../../songs/cursor";
import type { CursorMotion } from "../../../songs/cursor";
import type { BeatPosition } from "../../../songs/position";
import type { SongScore } from "../../../songs/types";

export function usePracticeCursor({
  score,
  countInTicks,
  endTick,
  beat,
  playing,
  onTick,
}: {
  score: SongScore;
  countInTicks: number;
  endTick: number;
  beat: BeatPosition | null;
  playing: boolean;
  onTick: (tick: number) => void;
}): void {
  const motion = useRef<CursorMotion | null>(null);
  const latest = useRef(onTick);
  latest.current = onTick;

  const reportTick = beat && playing ? (beat.songCountIn ? null : beat.songTick) : null;
  const counting = !!beat && playing && beat.songCountIn;
  useEffect(() => {
    if (!playing) {
      motion.current = null;
      return;
    }
    const now = performance.now();
    if (reportTick === null) {
      if (counting && !motion.current) motion.current = snapTo(countInTicks, now, 0);
      return;
    }
    motion.current = onReport(score, motion.current, { tick: reportTick, pass: 0, atMs: now }, 100);
  }, [reportTick, counting, playing, countInTicks, score]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const m = motion.current;
      if (!m) return;
      const next = cursorTickAt(score, m, now, { percent: 100, endTick, leadMs: 0 });
      motion.current = next.motion;
      latest.current(next.tick);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, score, endTick]);
}
