import { useTranslation } from "react-i18next";
import {
  addBeatToLastGroup,
  MAX_FREE_BEATS,
  MIN_FREE_BEATS,
  nextFreeBeatCount,
  prevFreeBeatCount,
  removeBeatFromLastGroup,
} from "../../constants/metronome";

/** Clicks per beat, by subdivision. */
const SUBDIVISION_MULTIPLIER: Record<number, number> = {
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6,
};

interface BeatStepperProps {
  beatGroups: number[];
  subdivision: number;
  freeMode: boolean;
  onBeatGroupsChange?: (groups: number[]) => void;
}

/**
 * The bar's length — `− 6 +` — and clicks/bar beside it.
 *
 * It lived at the end of the dots row, which meant it slid sideways every time
 * the bar got longer or shorter: the control moved out from under the pointer
 * at the exact moment you were clicking it repeatedly, which is how you end up
 * pressing the wrong thing. It sits on the meter row now, at a fixed offset —
 * see `.meter-row` in metronome.css, where the position is a grid column
 * rather than the end of a flow.
 *
 * Nothing inside it may resize either, so both numbers are tabular and both
 * their boxes are wide enough for the largest value they can hold. 9 → 10
 * beats must not nudge the `+` a pixel.
 *
 * FREE mode wraps at both ends and so never disables; a grouped meter clamps,
 * because wrapping would discard the grouping. See `addBeatToLastGroup`.
 */
export function BeatStepper({
  beatGroups,
  subdivision,
  freeMode,
  onBeatGroupsChange,
}: BeatStepperProps) {
  const { t } = useTranslation();
  const total = beatGroups.reduce((sum, n) => sum + n, 0);
  const clicksPerBar = total * (SUBDIVISION_MULTIPLIER[subdivision] ?? 1);

  return (
    <div className="beat-stepper-row">
      <div
        className="beat-stepper"
        role="group"
        aria-label={t("metronome.beatCount", { count: total })}
      >
        <button
          className="beat-stepper-btn"
          onClick={() =>
            onBeatGroupsChange?.(
              freeMode ? [prevFreeBeatCount(total)] : removeBeatFromLastGroup(beatGroups),
            )
          }
          disabled={!freeMode && total <= MIN_FREE_BEATS}
          aria-label={t("metronome.removeBeat")}
        >
          −
        </button>
        <span className="beat-stepper-value">{total}</span>
        <button
          className="beat-stepper-btn"
          onClick={() =>
            onBeatGroupsChange?.(
              freeMode ? [nextFreeBeatCount(total)] : addBeatToLastGroup(beatGroups),
            )
          }
          disabled={!freeMode && total >= MAX_FREE_BEATS}
          aria-label={t("metronome.addBeat")}
        >
          +
        </button>
      </div>
      <span className="beat-clicks">
        {t("metronome.clicksPerBar", { count: clicksPerBar })}
      </span>
    </div>
  );
}
