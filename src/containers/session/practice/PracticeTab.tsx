/**
 * The Tab view of a practice screen: the Session's own tab strip as the one
 * picture (`tabstrip/TabStrip.tsx`). Before the start it previews one pass,
 * numbered in playing order; while it runs it follows the pattern under a
 * fixed column, the played notes keeping their timing colour (a Take).
 *
 * Songs keeps alphaTab (`TabStage`); a Session's Exercises use this.
 */
import { useMemo } from "react";
import type { BeatPosition } from "../../../songs/position";
import type { TakePlan } from "../../../session/take";
import type { TimingMark } from "../../songs/review/marks";
import { TabStrip } from "../tabstrip/TabStrip";
import { resultsFromLights, tabStripInputOfTake } from "../tabstrip/tabStripModel";

/**
 * Ticks from the Take's start, as the strip counts them: negative through the
 * count-in, and unwrapped across passes when the engine (or a warm-up's click)
 * loops, so the strip keeps going forward.
 */
export function stripPosition(
  beat: BeatPosition | null,
  start: number,
  barTicks: number,
  loopTicks: number | null,
): number {
  if (!beat || beat.songCountIn) return -barTicks;
  const into = beat.songTick - start;
  return loopTicks ? beat.songPass * loopTicks + into : into;
}

export function PracticeTab({
  take,
  running,
  beat,
  playing,
  lights,
  loopTicks = null,
}: {
  take: TakePlan;
  running: boolean;
  beat: BeatPosition | null;
  playing: boolean;
  lights?: ReadonlyMap<number, TimingMark>;
  /** The pattern repeats for as long as it runs (a warm-up, a finisher): one loop's ticks. Null: a graded Take, its own length. */
  loopTicks?: number | null;
}) {
  const input = useMemo(() => tabStripInputOfTake(take), [take]);
  const results = useMemo(
    () => (lights && lights.size > 0 ? resultsFromLights(lights, take.schedule) : undefined),
    [lights, take.schedule],
  );
  const start = take.score.bars[take.range.startBar]?.startTick ?? 0;
  const live = running && playing;
  const position = live ? stripPosition(beat, start, input.barTicks, loopTicks) : -input.barTicks;
  return (
    <div className="session-glass practice-tab" data-testid="practice-tab" data-running={running ? "" : undefined}>
      <TabStrip
        notes={input.notes}
        barTicks={input.barTicks}
        patternBars={input.patternBars}
        takeBars={loopTicks ? undefined : input.takeBars}
        position={position}
        bpm={input.bpm}
        playing={live}
        results={results}
        mode={running ? "follow" : "preview"}
      />
    </div>
  );
}
