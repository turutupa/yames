/**
 * What to play: the one place a Session draws the instrument.
 *
 * Every screen hands this the same few facts, and only this file knows they
 * become a tab. A 3D neck replaces it by honouring the same props, with no change
 * to a running screen, the runner or the planner; see `BRIEF.md`, which wants the
 * jitter question answered before that happens.
 *
 * Lazy, because `TabStage` brings alphaTab with it, and a player who only ever
 * reads Today should not pay for an engraver.
 */
import { Suspense, lazy } from "react";
import { DEFAULT_STAGE_VIEW } from "../../songs/stageView";
import type { TimingMark } from "../songs/review/marks";
import type { TakePlan } from "../../session/take";

const TabStage = lazy(() =>
  import("../songs/TabStage").then((m) => ({ default: m.TabStage })),
);

export type ExerciseStageProps = {
  take: TakePlan;
  /** Where the cursor stands, in the score's ticks, from the engine's report. */
  tick: number;
  playing: boolean;
  themeId: string;
  /** How each note has gone so far, by onset id. Empty draws nothing. */
  lights?: ReadonlyMap<number, TimingMark>;
};

export function ExerciseStage({ take, tick, playing, themeId, lights }: ExerciseStageProps) {
  const lastBar = take.score.bars[take.score.bars.length - 1];
  const endTick = lastBar ? lastBar.startTick + lastBar.lengthTicks - 1 : 0;
  return (
    <div className="session-stage" data-testid="exercise-stage">
      <Suspense fallback={<div className="session-stage-wait" />}>
        <TabStage
          score={take.score}
          source={take.source}
          tick={tick}
          playing={playing}
          pass={0}
          tempoPercent={100}
          endTick={endTick}
          themeId={themeId}
          view={DEFAULT_STAGE_VIEW}
          lights={lights}
          schedule={take.schedule}
        />
      </Suspense>
    </div>
  );
}
