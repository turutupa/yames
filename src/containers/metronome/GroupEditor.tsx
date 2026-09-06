import { useTranslation } from "react-i18next";
import {
  addBeatToLastGroup,
  MAX_FREE_BEATS,
  MIN_FREE_BEATS,
  nextFreeBeatCount,
  prevFreeBeatCount,
  removeBeatFromLastGroup,
} from "../../constants/metronome";
import type { BeatFeedback } from "../../types";
import { accentPositions, meterTotal } from "../../utils/meter";

const SUBDIVISION_MULTIPLIER: Record<number, number> = {
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6,
};

interface GroupEditorProps {
  beatGroups: number[];
  subdivision: number;
  isPlaying?: boolean;
  activeBeat?: number;
  activeSub?: number;
  isDownbeat?: boolean;
  freeMode?: boolean;
  /** `BeatEvent.isAccent` for the beat currently lit. */
  isAccentBeat?: boolean;
  /**
   * Per-beat evaluation feedback, keyed by bar position. Renders the
   * `feedback-<classification>` tint the pre-grouping beat dots had —
   * `evaluation.dotFeedback` lost its consumer when the flat dot row was
   * replaced by this grouped editor.
   */
  feedback?: Map<number, BeatFeedback>;
  /**
   * Called by the stepper with the whole new grouping. Kept as a prop so this
   * component stays presentational — the owner (`MetronomeView`) does the IPC.
   * It takes an array rather than a count because the grouped stepper resizes
   * the last group: `[3, 3]` → `[3, 4]` is not expressible as a number.
   * No-op default lets either branch render without wiring.
   */
  onBeatGroupsChange?: (next: number[]) => void;
}

export function GroupEditor({
  beatGroups,
  subdivision,
  isPlaying = false,
  activeBeat = -1,
  activeSub = -1,
  isDownbeat = false,
  freeMode = false,
  isAccentBeat = false,
  feedback,
  onBeatGroupsChange,
}: GroupEditorProps) {
  const { t } = useTranslation();
  const total = meterTotal(beatGroups);
  const clicksPerBar = total * (SUBDIVISION_MULTIPLIER[subdivision] ?? 1);
  // Static markers only — the LIVE accent comes from the engine via
  // `isAccentBeat`, so the two can never disagree (and stays false in
  // FREE mode, where `accentPositions` is empty anyway).
  const accents = accentPositions(beatGroups, freeMode);

  /**
   * The bar's length, as the design draws it: a compact `− 6 +` beside the
   * dots (UI_REVAMP gaps M5). It replaces three lines of prose — the beat
   * total, the `3 + 3 + 3` formula and a caption under every group — none of
   * which the mockup has. Nothing they said is gone: the number here IS the
   * total, the formula is stated beside the meter chip (`MeterPresets`, which
   * is where the grouping is actually chosen), each group still carries its
   * count as a `title`, and clicks/bar — the one figure you cannot read off
   * the dots — sits next to the stepper.
   *
   * FREE mode wraps at both ends and so never disables; a grouped meter
   * clamps, because wrapping would discard the grouping. See
   * `addBeatToLastGroup`.
   */
  const stepper = (
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
              freeMode
                ? [prevFreeBeatCount(total)]
                : removeBeatFromLastGroup(beatGroups),
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
              freeMode
                ? [nextFreeBeatCount(total)]
                : addBeatToLastGroup(beatGroups),
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

  if (freeMode) {
    return (
      <div className="group-editor">
        {/* N active dots — display only, no grid */}
        <div className="free-dots">
          {Array.from({ length: total }, (_, i) => {
            const isActive = isPlaying && isDownbeat && activeBeat === i;
            const isSubBeat = isPlaying && !isDownbeat && activeBeat === i;
            const fb = feedback?.get(i);
            const feedbackClass = fb && isActive ? `feedback-${fb.classification}` : "";
            return (
              <div key={i} className="group-dot-wrap">
                <div className={`group-dot ${isActive ? "playing" : "free-active"} ${feedbackClass}`} />
                {subdivision > 1 && (
                  <div className="group-sub-dots">
                    {Array.from({ length: subdivision - 1 }, (_, s) => (
                      <div key={s} className={`group-sub-dot ${isSubBeat && activeSub === s + 1 ? "active" : ""}`} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {stepper}
      </div>
    );
  }

  let dotCursor = 0;
  const groups = beatGroups.map((count, idx) => {
    const startPos = dotCursor;
    dotCursor += count;
    return { count, startPos, idx };
  });

  return (
    <div className="group-editor">
      <div className="group-editor-boxes">
        {groups.map(({ count, startPos, idx }) => (
          // The caption under each group went with the rest of M5's prose. Its
          // one job — saying how long a group is without counting circles —
          // survives as the tooltip.
          <div key={idx} className="group-box" title={t("metronome.beatCount", { count })}>
            <div className="group-display">
              <div className="group-dots">
                {Array.from({ length: count }, (_, d) => {
                  const pos = startPos + d;
                  const isActive = isPlaying && isDownbeat && activeBeat === pos;
                  const isSubBeat = isPlaying && !isDownbeat && activeBeat === pos;
                  // Playing: trust the engine. Stopped: draw the marker.
                  const isAccent = isActive ? isAccentBeat : accents.has(pos);
                  const fb = feedback?.get(pos);
                  const feedbackClass = fb && isActive ? `feedback-${fb.classification}` : "";
                  return (
                    <div key={d} className="group-dot-wrap">
                      <div className={`group-dot ${isAccent ? "accent" : ""} ${isActive ? "playing" : ""} ${feedbackClass}`} />
                      {subdivision > 1 && (
                        <div className="group-sub-dots">
                          {Array.from({ length: subdivision - 1 }, (_, s) => (
                            <div
                              key={s}
                              className={`group-sub-dot ${isSubBeat && activeSub === s + 1 ? "active" : ""}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {stepper}
    </div>
  );
}
