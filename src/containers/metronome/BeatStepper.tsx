import { useTranslation } from "react-i18next";
import { stepMeter } from "../../utils/meter";

/** Clicks per beat, by subdivision. */
const SUBDIVISION_MULTIPLIER: Record<number, number> = {
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6,
};

interface BeatStepperProps {
  beatGroups: number[];
  freeMode: boolean;
  onBeatGroupsChange?: (groups: number[]) => void;
}

/**
 * Clicks/bar — the bar's length once the subdivision has multiplied it.
 *
 * It is a READOUT, not a control, and that is why it is no longer next to the
 * `− 6 +` it used to trail. It sits on the METER heading line, beside the
 * word, the way the section headings work everywhere else on this stage: the
 * title says what the section is, and the things you press are the row under
 * it. Mixing a number you can only read into the row of things you press was
 * the inconsistency the owner reported against SUBDIVISION.
 *
 * Tabular, so 9 → 10 beats does not reflow the heading line.
 */
export function ClicksPerBar({
  beatGroups,
  subdivision,
}: {
  beatGroups: number[];
  subdivision: number;
}) {
  const { t } = useTranslation();
  const total = beatGroups.reduce((sum, n) => sum + n, 0);
  const clicksPerBar = total * (SUBDIVISION_MULTIPLIER[subdivision] ?? 1);
  return (
    <span className="beat-clicks">
      {t("metronome.clicksPerBar", { count: clicksPerBar })}
    </span>
  );
}

/**
 * The bar's length — `− 6 +`.
 *
 * It lived at the end of the dots row, which meant it slid sideways every time
 * the bar got longer or shorter: the control moved out from under the pointer
 * at the exact moment you were clicking it repeatedly, which is how you end up
 * pressing the wrong thing. It sits in the METER section's control row now, at
 * a fixed offset from the left — see `.meter-controls` in metronome.css.
 *
 * Nothing inside it may resize either, so the number is tabular and its box is
 * wide enough for the largest value it can hold. 9 → 10 beats must not nudge
 * the `+` a pixel.
 *
 * IT WALKS THE METERS, and always did until it stopped. In a grouped meter
 * `+` is the next time signature and `−` the previous one — 6/8 → 7/8 → 8/8
 * → 9/8 → 12/8 → 2/4 — wrapping at both ends, so neither button is ever
 * disabled. For a while it resized the LAST GROUP instead, turning 3+3 into
 * 3+4, which the owner reported as "a really bad experience": it is not what
 * v1.1.0 did, it is not what the floating widget's meter button, the Zen
 * one or the `sig-next` / `sig-prev` hotkeys do, and a 7-beat bar grouped
 * 3+4 is not a meter anybody asked for.
 *
 * FREE mode is the exception and is unchanged: a flat run of N beats has no
 * grouping to walk, so `+` adds a beat and `−` removes one, wrapping 16 → 1.
 *
 * Both branches are `stepMeter`, which is the same function all six of those
 * call sites go through — the agreement is structural rather than remembered.
 *
 * The buttons' names follow the branch, because a screen reader is the only
 * thing that reads them and "Add beat" is a lie in a grouped meter: 12/8's
 * `+` wraps to 2/4 and 9/8's adds three beats at once. The visible control is
 * `− 6 +` either way.
 */
export function BeatStepper({
  beatGroups,
  freeMode,
  onBeatGroupsChange,
}: BeatStepperProps) {
  const { t } = useTranslation();
  const total = beatGroups.reduce((sum, n) => sum + n, 0);
  const upLabel = t(freeMode ? "metronome.addBeat" : "metronome.nextMeter");
  const downLabel = t(freeMode ? "metronome.removeBeat" : "metronome.prevMeter");

  return (
    <div
      className="beat-stepper"
      role="group"
      aria-label={t("metronome.beatCount", { count: total })}
    >
      <button
        className="beat-stepper-btn"
        onClick={() => onBeatGroupsChange?.(stepMeter(beatGroups, freeMode, -1))}
        aria-label={downLabel}
      >
        −
      </button>
      <span className="beat-stepper-value">{total}</span>
      <button
        className="beat-stepper-btn"
        onClick={() => onBeatGroupsChange?.(stepMeter(beatGroups, freeMode, 1))}
        aria-label={upLabel}
      >
        +
      </button>
    </div>
  );
}
