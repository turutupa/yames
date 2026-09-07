import { useTranslation } from "react-i18next";
import type { BeatFeedback } from "../../types";
import { accentPositions, meterTotal } from "../../utils/meter";

interface GroupEditorProps {
  beatGroups: number[];
  subdivision: number;
  isPlaying?: boolean;
  activeBeat?: number;
  activeSub?: number;
  isDownbeat?: boolean;
  freeMode?: boolean;
  /** Which beats carry the accent — mirrors the engine (U2.3). */
  accentMode?: "groups" | "all" | "none";
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
  accentMode = "groups",
  isAccentBeat = false,
  feedback,
}: GroupEditorProps) {
  const { t } = useTranslation();
  const total = meterTotal(beatGroups);
  // Static markers only — the LIVE accent comes from the engine via
  // `isAccentBeat`, so the two can never disagree.
  const accents = accentPositions(beatGroups, accentMode);

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
            // FREE mode has no groups, but it can still have accents: the
            // accent control's "every beat" applies here too, in the engine
            // and so on the dots. Playing, the engine is the authority; at
            // rest `accents` is, exactly as in the grouped branch below.
            const isAccent = isActive ? isAccentBeat : accents.has(i);
            return (
              <div key={i} className="group-dot-wrap">
                <div
                  className={`group-dot ${isAccent ? "accent" : ""} ${isActive ? "playing" : "free-active"} ${feedbackClass}`}
                />
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

    </div>
  );
}
