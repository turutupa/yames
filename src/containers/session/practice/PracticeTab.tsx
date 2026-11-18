/**
 * The Tab view of a practice screen: the tab as the one picture, large, its
 * cursor following the pattern.
 *
 * PLACEHOLDER until `tabstrip/TabStrip.tsx` lands (branch `mvp-tabstrip`):
 * the current `TabStage` (alphaTab), given the live position instead of the
 * frozen tick 0 it used to get. Songs keeps `TabStage` for good; a Session's
 * Exercises move to the TabStrip ("preview" before the start, "follow" while
 * it runs) when it is merged.
 */
import type { BeatPosition } from "../../../songs/position";
import type { TakePlan } from "../../../session/take";
import type { TimingMark } from "../../songs/review/marks";
import { ExerciseStage } from "../ExerciseStage";

export function PracticeTab({
  take,
  running,
  beat,
  playing,
  themeId,
  lights,
}: {
  take: TakePlan;
  running: boolean;
  beat: BeatPosition | null;
  playing: boolean;
  themeId: string;
  lights?: ReadonlyMap<number, TimingMark>;
}) {
  const first = take.score.bars[take.range.startBar]?.startTick ?? 0;
  const live = running && playing && !!beat && !beat.songCountIn;
  const tick = live && beat ? beat.songTick : first;
  return (
    <div className="session-glass practice-tab" data-testid="practice-tab" data-running={running ? "" : undefined}>
      <ExerciseStage take={take} tick={tick} playing={live} themeId={themeId} lights={lights} />
    </div>
  );
}
