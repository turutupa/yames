import { useTranslation } from "react-i18next";
import { RATING_COLORS, getOffsetRating } from "./trackTypes";
import type { Rating, TapResult } from "./trackTypes";

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
  taps,
  beatTimestamps,
  bpm,
  offset,
  evaluationEnabled,
  onTap,
  onStop,
}: {
  beatCount: number;
  warmupBeats: number;
  scoredBeats: number;
  taps: TapResult[];
  beatTimestamps: number[];
  bpm: number;
  offset: number;
  evaluationEnabled: boolean | undefined;
  onTap: () => void;
  onStop: () => void;
}) {
  const { t } = useTranslation();
  const isWarmup = beatCount < warmupBeats;
  const scoredProgress = Math.max(0, beatCount - warmupBeats) / scoredBeats;
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
            {t("pocketCheck.warmupProgress", { count: beatCount, total: warmupBeats })}
          </span>
        ) : (
          <span className="track-live-beats">
            {Math.max(0, beatCount - warmupBeats)}/{scoredBeats}
          </span>
        )}
        <span className="track-live-taps">{t("pocketCheck.tapsCount", { count: taps.length })}</span>
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
            <span className="track-ring-label warmup">{t("pocketCheck.getReady")}</span>
          ) : (
            <span className="track-ring-label">{t("pocketCheck.tap")}</span>
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
        {evaluationEnabled ? t("pocketCheck.playInstrumentHint") : t("pocketCheck.playTapHint")}
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
        {t("pocketCheck.stop")}
      </button>
    </div>
  );
}
