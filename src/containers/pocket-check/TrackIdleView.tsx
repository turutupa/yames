import type { ChordSequence, GameMode, Rating, RhythmPattern } from "./trackTypes";
import { RATING_LABELS, RATING_COLORS } from "./trackTypes";
import { CHORD_SEQUENCES, RHYTHM_PATTERNS } from "./presets";

/** Idle (welcome) view for Pocket Check before a session starts. */
export function TrackIdleView({
  evaluationEnabled,
  scoredBeats,
  savedOffset,
  hasHistory,
  session,
  gameMode,
  gameBpm,
  selectedSequence,
  selectedPattern,
  onModeChange,
  onBpmChange,
  onSequenceChange,
  onPatternChange,
  onStart,
  onCalibrate,
  onShowHistory,
}: {
  evaluationEnabled?: boolean;
  scoredBeats: number;
  savedOffset: number | null;
  hasHistory: boolean;
  session: import("./trackTypes").SessionState;
  gameMode: GameMode;
  gameBpm: number;
  selectedSequence: ChordSequence | null;
  selectedPattern: RhythmPattern | null;
  onModeChange: (mode: GameMode) => void;
  onBpmChange: (bpm: number) => void;
  onSequenceChange: (seq: ChordSequence | null) => void;
  onPatternChange: (pat: RhythmPattern | null) => void;
  onStart: () => void;
  onCalibrate: () => void;
  onShowHistory: () => void;
}) {
  const isIdle = session === "idle";

  const modeDescription = () => {
    if (gameMode === "chords") {
      return `Tap along with chord changes for ${scoredBeats} beats.`;
    }
    if (gameMode === "rhythm") {
      return `Match the rhythm pattern for ${scoredBeats} beats.`;
    }
    return evaluationEnabled
      ? `Play along with the metronome for ${scoredBeats} beats. Your instrument input is detected automatically.`
      : `Tap along with the metronome for ${scoredBeats} beats. Click the target to log each beat.`;
  };

  return (
    <div className="track-view">
      <div className="track-intro view-stagger-item" style={{ animationDelay: "0ms" }}>
        <div className="track-intro-icon">🎯</div>
        <h3>Pocket Check</h3>
        <p>{modeDescription()}</p>
        {savedOffset !== null ? (
          <p className="track-config-hint">
            Calibrated: {savedOffset >= 0 ? "+" : ""}
            {savedOffset.toFixed(1)}ms offset
          </p>
        ) : (
          <p className="track-config-hint">
            Calibrate first for best accuracy on your system.
          </p>
        )}
        <div className="track-ratings-legend">
          {(["metronomic", "tight", "solid", "loose", "miss"] as Rating[]).map((r) => (
            <span key={r} className="track-legend-item">
              <span className="track-legend-dot" style={{ background: RATING_COLORS[r] }} />
              {RATING_LABELS[r]}
            </span>
          ))}
        </div>
      </div>

      {/* Mode selector */}
      <div className="track-mode-selector view-stagger-item" style={{ animationDelay: "30ms" }}>
        {(["free", "chords", "rhythm"] as GameMode[]).map((m) => (
          <button
            key={m}
            className={`track-mode-btn${gameMode === m ? " active" : ""}`}
            onClick={() => onModeChange(m)}
            disabled={!isIdle}
          >
            {m === "free" ? "Free" : m === "chords" ? "Chords" : "Rhythm"}
          </button>
        ))}
      </div>

      {/* BPM input */}
      <div className="track-bpm-row view-stagger-item" style={{ animationDelay: "50ms" }}>
        <label className="track-bpm-label" htmlFor="track-bpm-input">BPM</label>
        <input
          id="track-bpm-input"
          type="number"
          className="track-bpm-input"
          min={20}
          max={300}
          value={gameBpm}
          disabled={!isIdle}
          onChange={(e) => {
            const v = Math.max(20, Math.min(300, Number(e.target.value)));
            onBpmChange(v);
          }}
        />
      </div>

      {/* Chord sequence picker */}
      {gameMode === "chords" && (
        <div className="track-preset-row view-stagger-item" style={{ animationDelay: "60ms" }}>
          <select
            className="track-preset-select"
            disabled={!isIdle}
            value={selectedSequence?.name ?? ""}
            onChange={(e) => {
              const seq = CHORD_SEQUENCES.find((s) => s.name === e.target.value) ?? null;
              onSequenceChange(seq);
            }}
          >
            {CHORD_SEQUENCES.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Rhythm pattern picker */}
      {gameMode === "rhythm" && (
        <div className="track-preset-row view-stagger-item" style={{ animationDelay: "60ms" }}>
          <select
            className="track-preset-select"
            disabled={!isIdle}
            value={selectedPattern?.name ?? ""}
            onChange={(e) => {
              const pat = RHYTHM_PATTERNS.find((p) => p.name === e.target.value) ?? null;
              onPatternChange(pat);
            }}
          >
            {RHYTHM_PATTERNS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        className="play-btn full-width view-stagger-item"
        style={{ animationDelay: "80ms" }}
        onClick={onStart}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 2.5a.5.5 0 0 1 .77-.42l9 5.5a.5.5 0 0 1 0 .84l-9 5.5A.5.5 0 0 1 4 13.5z" />
        </svg>
        Start
      </button>
      <div className="track-secondary-actions view-stagger-item" style={{ animationDelay: "120ms" }}>
        <button className="play-btn full-width secondary" onClick={onCalibrate}>
          Calibrate
        </button>
        <button
          className="play-btn full-width secondary"
          onClick={onShowHistory}
          disabled={!hasHistory}
        >
          History
        </button>
      </div>
    </div>
  );
}
