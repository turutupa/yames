import { RATING_COLORS, getOffsetRating } from "./trackTypes";
import type { GameMode, Rating, TapResult } from "./trackTypes";

/**
 * Playing screen — the active session view. Shows progress ring (warmup or
 * scored), last tap offset (color-coded), a rolling row of hit/miss dots
 * for the most recent 16 beats, and a Stop button. The parent computes
 * `beatTimestamps` (an array of beat onset times) and passes it in so the
 * dot row can match taps to beats using the BPM-derived window.
 *
 * `offset` is the saved calibration offset that we subtract from each tap's
 * raw offset to get the "true" calibrated offset shown in the UI.
 */
export function TrackPlayingView({
  beatCount,
  warmupBeats,
  scoredBeats,
  expectedTaps,
  taps,
  beatTimestamps,
  bpm,
  offset,
  evaluationEnabled,
  gameMode,
  currentCue,
  chordIndex,
  subBeatCount,
  gameSubdivision,
  onTap,
  onStop,
}: {
  beatCount: number;
  warmupBeats: number;
  scoredBeats: number;
  expectedTaps: number;
  taps: TapResult[];
  beatTimestamps: number[];
  bpm: number;
  offset: number;
  evaluationEnabled: boolean | undefined;
  gameMode?: GameMode;
  currentCue?: string;
  chordIndex?: number;
  subBeatCount?: number;
  gameSubdivision?: number;
  onTap: () => void;
  onStop: () => void;
}) {
  const isWarmup = beatCount < warmupBeats;
  const isRhythm = gameMode === "rhythm";
  const activeScoredProgress = isRhythm
    ? Math.max(0, (subBeatCount ?? 0) - warmupBeats * (gameSubdivision ?? 1)) / expectedTaps
    : Math.max(0, beatCount - warmupBeats) / scoredBeats;
  const scoredProgress = activeScoredProgress;
  const warmupProgress = Math.min(beatCount / warmupBeats, 1);

  return (
    <div
      className="track-view track-playing"
      onMouseDown={onTap}
      onTouchStart={(e) => {
        e.preventDefault();
        onTap();
      }}
    >
      <div className="track-live-header">
        {isWarmup ? (
          <span className="track-live-beats warmup">
            Warm-up {beatCount}/{warmupBeats}
          </span>
        ) : isRhythm ? (
          <span className="track-live-beats">
            {Math.max(0, (subBeatCount ?? 0) - warmupBeats * (gameSubdivision ?? 1))}/{expectedTaps}
          </span>
        ) : (
          <span className="track-live-beats">
            {Math.max(0, beatCount - warmupBeats)}/{scoredBeats}
          </span>
        )}
        <span className="track-live-taps">{taps.length} taps</span>
      </div>

      <div className="track-progress-ring">
        <svg viewBox="0 0 100 100" className="track-ring-svg">
          <circle cx="50" cy="50" r="42" className="track-ring-bg" />
          {isWarmup ? (
            <circle
              cx="50"
              cy="50"
              r="42"
              className="track-ring-warmup"
              style={{ strokeDashoffset: `${264 * (1 - warmupProgress)}` }}
            />
          ) : (
            <circle
              cx="50"
              cy="50"
              r="42"
              className="track-ring-fill"
              style={{ strokeDashoffset: `${264 * (1 - scoredProgress)}` }}
            />
          )}
        </svg>
        <div className="track-ring-center">
          {isWarmup ? (
            <span className="track-ring-label warmup">GET READY</span>
          ) : gameMode === "chords" && currentCue ? (
            <span className="track-ring-cue" key={chordIndex}>
              {currentCue}
            </span>
          ) : gameMode === "rhythm" && currentCue ? (
            <span
              className={`track-ring-cue-symbol${(subBeatCount ?? 0) > 0 ? " pulse" : ""}`}
              key={subBeatCount}
            >
              {currentCue}
            </span>
          ) : (
            <span className="track-ring-label">TAP</span>
          )}
          {!isWarmup &&
            taps.length > 0 &&
            (() => {
              const lastCal = taps[taps.length - 1].offsetMs - offset;
              const lastRating = getOffsetRating(Math.abs(lastCal));
              return (
                <span
                  className="track-last-offset"
                  style={{ color: RATING_COLORS[lastRating] }}
                >
                  {lastCal >= 0 ? "+" : ""}
                  {lastCal.toFixed(0)}ms
                </span>
              );
            })()}
        </div>
      </div>

      <div className="track-live-dots">
        {(() => {
          const beatIntervalMs = 60000 / bpm;
          const items: {
            type: "hit" | "miss" | "warmup";
            rating?: Rating;
            color?: string;
          }[] = [];
          for (let b = 0; b < beatTimestamps.length; b++) {
            const beatTime = beatTimestamps[b];
            if (b < warmupBeats) {
              items.push({ type: "warmup" });
              continue;
            }
            let matched = false;
            for (const tap of taps) {
              if (Math.abs(tap.timestamp - beatTime) < beatIntervalMs * 0.5) {
                const calOffset = tap.offsetMs - offset;
                const calRating = getOffsetRating(Math.abs(calOffset));
                items.push({
                  type: "hit",
                  rating: calRating,
                  color: RATING_COLORS[calRating],
                });
                matched = true;
                break;
              }
            }
            if (!matched) {
              // Don't mark the most recent beat as miss yet — user still has time to tap
              if (b === beatTimestamps.length - 1) {
                items.push({ type: "warmup" }); // show as neutral/pending dot
              } else {
                items.push({ type: "miss" });
              }
            }
          }
          return items
            .slice(-16)
            .map((item, i) => (
              <span
                key={i}
                className={`track-live-dot ${item.type === "miss" ? "miss" : ""} ${item.type === "warmup" ? "warmup" : ""}`}
                style={
                  item.type === "hit" ? { background: item.color } : undefined
                }
              />
            ));
        })()}
      </div>

      <div className="track-live-hint">
        {evaluationEnabled ? "Play your instrument along with the beat" : "Click the target to tap along"}
      </div>

      <button
        className="play-btn full-width playing"
        onMouseDown={(e) => {
          e.stopPropagation();
          onStop();
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="2" width="12" height="12" rx="1.5" />
        </svg>
        Stop
      </button>
    </div>
  );
}
