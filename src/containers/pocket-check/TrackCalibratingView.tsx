import { useTranslation } from "react-i18next";
import type { TapResult } from "./trackTypes";

/**
 * Calibrating screen — shown during the calibration session. Renders the
 * progress ring (warmup-colored), the last-tap offset, and a Cancel button.
 * The parent owns tap handling, beat counting, and the calibration math —
 * this component is purely presentational and just calls `onTap` / `onStop`.
 */
export function TrackCalibratingView({
  beatCount,
  calibrationBeats,
  taps,
  onTap,
  onStop,
}: {
  beatCount: number;
  calibrationBeats: number;
  taps: TapResult[];
  onTap: () => void;
  onStop: () => void;
}) {
  const { t } = useTranslation();
  const calProgress = beatCount / calibrationBeats;
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
        <span className="track-live-beats warmup">
          {t("pocketCheck.calibratingProgress", { count: beatCount, total: calibrationBeats })}
        </span>
        <span className="track-live-taps">{t("pocketCheck.tapsCount", { count: taps.length })}</span>
      </div>

      <div className="track-progress-ring">
        <svg viewBox="0 0 100 100" className="track-ring-svg">
          <circle cx="50" cy="50" r="42" className="track-ring-bg" />
          <circle
            cx="50"
            cy="50"
            r="42"
            className="track-ring-warmup"
            style={{ strokeDashoffset: `${264 * (1 - calProgress)}` }}
          />
        </svg>
        <div className="track-ring-center">
          <span className="track-ring-label warmup">{t("pocketCheck.tap")}</span>
          {taps.length > 0 && (
            <span
              className="track-last-offset"
              style={{ color: "var(--text-muted)" }}
            >
              {taps[taps.length - 1].offsetMs >= 0 ? "+" : ""}
              {taps[taps.length - 1].offsetMs.toFixed(0)}ms
            </span>
          )}
        </div>
      </div>

      <div className="track-live-hint">
        {t("pocketCheck.calibratingHint")}
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
        {t("pocketCheck.cancel")}
      </button>
    </div>
  );
}
