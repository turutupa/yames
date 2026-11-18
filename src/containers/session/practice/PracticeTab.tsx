/**
 * The Tab view of a practice screen: the Session's own tab strip as the one
 * picture (`tabstrip/TabStrip.tsx`), and under it the slim fret strip the
 * Neck view has, the frets in use framed (the approved mock).
 *
 * Before the start, and while paused, the whole pattern as an overview, every
 * bar numbered and wrapped onto rows (paused: where it stopped, marked).
 * While it runs, "now" and "next", the amber column going note to note, the
 * played notes keeping their timing colour (a Take).
 *
 * Songs keeps alphaTab (`TabStage`); a Session's Exercises use this.
 */
import { useMemo } from "react";
import { OverviewStrip } from "../../../stage3d/OverviewStrip";
import { neckNotesOf } from "../hooks/useNeck";
import type { BeatPosition } from "../../../songs/position";
import type { TakePlan } from "../../../session/take";
import type { TimingMark } from "../../songs/review/marks";
import { TabStrip } from "../tabstrip/TabStrip";
import { IS_MOBILE } from "../../../platform";
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
  paused = false,
  fretStrip = true,
  compact = false,
}: {
  take: TakePlan;
  running: boolean;
  beat: BeatPosition | null;
  playing: boolean;
  lights?: ReadonlyMap<number, TimingMark>;
  /** The pattern repeats for as long as it runs (a warm-up, a finisher): one loop's ticks. Null: a graded Take, its own length. */
  loopTicks?: number | null;
  /** Paused: the whole pattern, where it stopped marked; `beat` is where. */
  paused?: boolean;
  /** The slim fret strip under the panel (the Tab view's own; off where a neck already has one). */
  fretStrip?: boolean;
  /** A small overview under another picture: numbers held small, no panel padding. */
  compact?: boolean;
}) {
  const input = useMemo(() => tabStripInputOfTake(take), [take]);
  const results = useMemo(
    () => (lights && lights.size > 0 ? resultsFromLights(lights, take.schedule) : undefined),
    [lights, take.schedule],
  );
  const start = take.score.bars[take.range.startBar]?.startTick ?? 0;
  const live = running && playing && !paused;
  const position = running && beat ? stripPosition(beat, start, input.barTicks, loopTicks) : -input.barTicks;
  const follow = running && !paused;
  const neckNotes = useMemo(() => neckNotesOf(take.exercise.notes, "aim"), [take.exercise.notes]);
  const frets = take.exercise.notes.map((n) => n.fret).filter((f) => f > 0);
  const lo = frets.length ? Math.min(...frets) : 0;
  const hi = frets.length ? Math.max(...frets) : 5;
  return (
    <>
      <div
        className="practice-tab"
        data-testid="practice-tab"
        data-running={running ? "" : undefined}
        data-paused={paused ? "" : undefined}
        data-compact={compact ? "" : undefined}
      >
        <TabStrip
          notes={input.notes}
          barTicks={input.barTicks}
          patternBars={input.patternBars}
          takeBars={loopTicks ? undefined : input.takeBars}
          position={position}
          bpm={input.bpm}
          // Not through the count-in: its position stands still at -1 bar, and
          // smoothing it forward would run the column into the pattern early.
          playing={live && !!beat && !beat.songCountIn}
          results={results}
          mode={follow ? "follow" : "preview"}
          marker={paused && beat && !beat.songCountIn ? position : null}
          maxFretPx={compact ? 18 : undefined}
          growToFit={IS_MOBILE && !running && !compact}
        />
      </div>
      {fretStrip && (
        <div className="practice-fretstrip" aria-hidden="true">
          <OverviewStrip from={Math.max(0, lo - 1)} to={Math.max(hi, lo + 3)} notes={neckNotes} height={46} />
        </div>
      )}
    </>
  );
}
