/**
 * A warm-up's position, made on this side from the click (the panel's
 * redesign, 2026-11-17).
 *
 * A warm-up only starts the metronome (`useSessionRun`, the timed step's
 * start): no song is loaded, so the engine has no position in the pattern to
 * report. Its `beat` events still say which beat each tick is. That is a
 * clock, and the pattern's own tempo is the click's, so the position follows:
 * the first downbeat after Start opens a one-bar count-in, then the pattern
 * runs from its first note and wraps on every pass.
 *
 * The result has the shape of a Take's engine report (`BeatPosition`), so the
 * neck, the runway and the tab follow a warm-up exactly the way they follow a
 * Take: one report per beat, smoothed between by the score's tempo
 * (`songs/cursor.ts`), and a loop seam is a snap back to the first note.
 * Nothing is asked of the engine and nothing touches the audio thread.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { BeatPosition } from "../../../songs/position";
import { TICKS_PER_QUARTER } from "../../../songs/types";
import type { TakePlan } from "../../../session/take";
import { warmupPosition } from "./practiceModel";
import type { ClickBeat, WarmupClock } from "./practiceModel";

/** The beat a practice screen is handed: the engine's event, read for position and for the click's own count. */
export type PracticeBeat = BeatPosition & Partial<ClickBeat>;

/**
 * Where a Resume carries on from, in beats into the pattern: the start of the
 * bar it was paused in, so the player comes back in on a downbeat.
 */
export function resumeBeats(clock: WarmupClock, pos: BeatPosition | null, barTicks: number): number {
  if (!pos || pos.songCountIn) return 0;
  const into = pos.songPass * clock.passTicks + (pos.songTick - clock.start);
  const bar = Math.max(1, barTicks);
  return Math.max(0, Math.floor(into / bar) * Math.round(bar / clock.perQuarter));
}

/** One pass of a warm-up's pattern, from its Take. */
export function warmupClockOf(take: TakePlan): WarmupClock {
  const score = take.score;
  const perQuarter = score.ticksPerQuarter > 0 ? score.ticksPerQuarter : TICKS_PER_QUARTER;
  const first = score.bars[take.range.startBar] ?? score.bars[0];
  const start = first?.startTick ?? 0;
  const barTicks = first?.lengthTicks || perQuarter * 4;
  const own = Math.max(1, take.exercise.bars);
  const lastBar = score.bars[take.range.endBar] ?? score.bars[score.bars.length - 1];
  const written = lastBar ? lastBar.startTick + lastBar.lengthTicks - start : barTicks * own;
  return {
    start,
    // The pattern repeats every `exercise.bars` bars, whatever the Take wrote
    // out; never longer than what is written.
    passTicks: Math.max(perQuarter, Math.min(written, barTicks * own)),
    perQuarter,
    // The click is set to 4/4 for a warm-up (`setBeatGroups([4])`): one bar of it.
    countInBeats: 4,
  };
}

/**
 * The warm-up's position while it runs, or null (stopped, or before the
 * first downbeat after Start). A new object per beat, like the engine's.
 */
export function useWarmupBeat(
  take: TakePlan | null,
  beat: PracticeBeat | null,
  running: boolean,
  /** Beats into the pattern to carry on from after the count-in (a Resume); 0 from the top. */
  fromBeats = 0,
): BeatPosition | null {
  const clock = useMemo(() => (take ? warmupClockOf(take) : null), [take]);
  const [pos, setPos] = useState<BeatPosition | null>(null);
  const first = useRef<number | null>(null);
  // The event on screen when the run began is from before it: not counted.
  const stale = useRef<PracticeBeat | null>(null);
  const latestBeat = useRef(beat);
  latestBeat.current = beat;

  useEffect(() => {
    first.current = null;
    stale.current = latestBeat.current;
    setPos(null);
  }, [running, clock]);

  useEffect(() => {
    if (!running || !clock || !beat || beat === stale.current) return;
    if (typeof beat.beat !== "number" || (beat.subdivision ?? 0) !== 0) return;
    // A counter that went backwards is a restarted click: count again from its next downbeat.
    if (first.current !== null && beat.beat < first.current) first.current = null;
    if (first.current === null) {
      if (beat.isDownbeat === false) return;
      first.current = beat.beat;
    }
    setPos(warmupPosition(clock, beat.beat - first.current, fromBeats));
  }, [beat, running, clock, fromBeats]);

  return running ? pos : null;
}
