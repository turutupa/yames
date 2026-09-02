import { useTranslation } from "react-i18next";
import {
  nextFreeBeatCount,
  prevFreeBeatCount,
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
   * Called by the free-mode stepper with the new beat count. Kept as a prop so
   * this component stays presentational — the owner (`MetronomeView`) does the
   * IPC. No-op default lets the grouped branch render without wiring.
   */
  onBeatCountChange?: (next: number) => void;
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
  onBeatCountChange,
}: GroupEditorProps) {
  const { t } = useTranslation();
  const total = meterTotal(beatGroups);
  const formula = beatGroups.join(" + ");
  const clicksPerBar = total * (SUBDIVISION_MULTIPLIER[subdivision] ?? 1);
  // Static markers only — the LIVE accent comes from the engine via
  // `isAccentBeat`, so the two can never disagree (and stays false in
  // FREE mode, where `accentPositions` is empty anyway).
  const accents = accentPositions(beatGroups, freeMode);

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
        {/* Formula bar with inline beat count control */}
        <div className="group-formula">
          <button
            className="free-count-btn"
            onClick={() => onBeatCountChange?.(prevFreeBeatCount(total))}
            aria-label={t("metronome.removeBeat")}
          >‹</button>
          <span className="group-formula-total">{t("metronome.beatCount", { count: total })}</span>
          <button
            className="free-count-btn"
            onClick={() => onBeatCountChange?.(nextFreeBeatCount(total))}
            aria-label={t("metronome.addBeat")}
          >›</button>
          <span className="group-formula-clicks">{t("metronome.clicksPerBar", { count: clicksPerBar })}</span>
        </div>
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
          <div key={idx} className="group-box">
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
            <span className="group-label">{t("metronome.beatCount", { count })}</span>
          </div>
        ))}
      </div>

      <div className="group-formula">
        <span className="group-formula-total">{t("metronome.beatCount", { count: total })}</span>
        <span className="group-formula-expr">{formula}</span>
        <span className="group-formula-clicks">{t("metronome.clicksPerBar", { count: clicksPerBar })}</span>
      </div>
    </div>
  );
}
