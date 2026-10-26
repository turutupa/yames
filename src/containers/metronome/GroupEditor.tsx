import { useTranslation } from "react-i18next";
import type { AccentMode, BeatFeedback, MultiMeasurePattern, PatternAccentLevel } from "../../types";
import { accentPositions, meterLabel, meterTotal } from "../../utils/meter";
import { cycleAccent } from "./patternPresets";

interface GroupEditorProps {
  beatGroups: number[];
  subdivision: number;
  isPlaying?: boolean;
  activeBeat?: number;
  activeSub?: number;
  isDownbeat?: boolean;
  freeMode?: boolean;
  /** Which beats carry the accent — mirrors the engine (U2.3). */
  accentMode?: AccentMode;
  /**
   * `BeatEvent.accentLevel` for the beat currently lit — 0 none, 1 a group
   * start inside the bar, 2 the bar's own opening, 3 silent/rest. The engine decides it;
   * this component only draws it.
   */
  accentBeat?: 0 | 1 | 2 | 3;
  /**
   * Per-beat evaluation feedback, keyed by bar position. Renders the
   * `feedback-<classification>` tint the pre-grouping beat dots had —
   * `evaluation.dotFeedback` lost its consumer when the flat dot row was
   * replaced by this grouped editor.
   */
  feedback?: Map<number, BeatFeedback>;
  /**
   * Called with the whole new grouping. Kept as a prop so this component
   * stays presentational — the owner (`MetronomeView`) does the IPC.
   */
  onBeatGroupsChange?: (next: number[]) => void;
  /** Active multi-measure pattern when in pattern accent mode */
  pattern?: MultiMeasurePattern;
  /** Current bar in multi-measure pattern (0-based) from `BeatEvent.formBar` */
  activeBar?: number;
  /** Callback when user clicks a tick to cycle its accent */
  onPatternChange?: (next: MultiMeasurePattern) => void;
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
  accentBeat = 0,
  feedback,
  pattern,
  activeBar = 0,
  onPatternChange,
}: GroupEditorProps) {
  const { t } = useTranslation();
  const total = meterTotal(beatGroups);
  // Static markers only — the LIVE accent comes from the engine via
  // `accentBeat`, so the two can never disagree.
  const accents = accentPositions(beatGroups, accentMode as "groups" | "all" | "none");
  // Strong keeps the ring and the glow it always had; medium keeps the ring
  // and drops the glow, so a bar reads as one opening and a middle rather
  // than as two openings. Weak is a plain ring.
  const accentClass = (level: number) =>
    level === 2 ? "accent" : level === 1 ? "accent-medium" : "";

  // Multi-Measure Pattern mode rendering
  if (accentMode === "pattern" && pattern && pattern.measures.length > 0) {
    const numBars = pattern.measures.length;
    const normalizedActiveBar = ((activeBar % numBars) + numBars) % numBars;

    return (
      <div className="group-editor pattern-editor">
        <div className="pattern-measures-grid">
          {pattern.measures.map((measure, barIdx) => {
            const isBarActive = isPlaying && normalizedActiveBar === barIdx;
            const beats = measure.beats;
            const sub = measure.subdivision;
            const barMeterLabel =
              beats === total && !freeMode ? meterLabel(beatGroups) : `${beats}/4`;

            return (
              <div
                key={barIdx}
                className={`pattern-measure-card ${isBarActive ? "bar-active" : ""}`}
              >
                <div className="pattern-measure-header">
                  <div className="pattern-bar-meta">
                    <span className="pattern-bar-pill">
                      Bar {barIdx + 1}
                    </span>
                    {isBarActive && <span className="pattern-live-tag">LIVE</span>}
                  </div>
                  <span className="pattern-measure-meter">
                    {barMeterLabel} • {sub > 1 ? `${sub} ticks` : "quarter"}
                  </span>
                </div>

                <div
                  className="pattern-uniform-cols"
                  style={{
                    gridTemplateColumns: `repeat(${beats}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({ length: beats }, (_, beatIdx) => (
                    <div key={beatIdx} className="pattern-beat-col">
                      <div className="pattern-beat-num">Beat {beatIdx + 1}</div>
                      <div className="pattern-sub-stack">
                        {Array.from({ length: sub }, (_, subIdx) => {
                          const tickIdx = beatIdx * sub + subIdx;
                          const level = (measure.ticks[tickIdx] ?? 1) as PatternAccentLevel;
                          const isTickPlaying =
                            isPlaying &&
                            isBarActive &&
                            activeBeat === beatIdx &&
                            activeSub === subIdx;

                          let levelClass = "plain";
                          if (level === 3) levelClass = "accent strong";
                          else if (level === 2) levelClass = "accent-medium";
                          else if (level === 0) levelClass = "rest";

                          const fb = subIdx === 0 ? feedback?.get(beatIdx) : undefined;
                          const feedbackClass = fb && isTickPlaying ? `feedback-${fb.classification}` : "";

                          return (
                            <button
                              key={subIdx}
                              type="button"
                              className={`pattern-tick-cell ${levelClass} ${isTickPlaying ? "playing" : ""} ${feedbackClass}`}
                              title={`Bar ${barIdx + 1}, Beat ${beatIdx + 1}.${subIdx + 1}: ${
                                level === 3
                                  ? "Strong Accent"
                                  : level === 2
                                  ? "Medium Accent"
                                  : level === 1
                                  ? "Plain Click"
                                  : "Rest / Silent"
                              } (Click to cycle)`}
                              onClick={() => {
                                if (!onPatternChange) return;
                                const nextTicks = [...measure.ticks];
                                nextTicks[tickIdx] = cycleAccent(level);
                                const nextMeasures = pattern.measures.map((m, idx) =>
                                  idx === barIdx ? { ...m, ticks: nextTicks } : m
                                );
                                onPatternChange({
                                  ...pattern,
                                  id: "custom",
                                  name: "Custom Pattern",
                                  measures: nextMeasures,
                                });
                              }}
                            >
                              <span className="pattern-tick-dot" />
                              <span className="pattern-tick-sub-label">
                                {sub === 1
                                  ? level === 0 ? "Rest" : level === 3 ? "Strong" : level === 2 ? "Mid" : "Beat"
                                  : `.${subIdx + 1}`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

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
            const level = isActive ? accentBeat : (accents.get(i) ?? 0);
            return (
              <div key={i} className="group-dot-wrap">
                <div
                  className={`group-dot ${accentClass(level)} ${isActive ? "playing" : "free-active"} ${feedbackClass}`}
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
                  const level = isActive ? accentBeat : (accents.get(pos) ?? 0);
                  const fb = feedback?.get(pos);
                  const feedbackClass = fb && isActive ? `feedback-${fb.classification}` : "";
                  return (
                    <div key={d} className="group-dot-wrap">
                      <div className={`group-dot ${accentClass(level)} ${isActive ? "playing" : ""} ${feedbackClass}`} />
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
