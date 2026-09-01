import { useTranslation } from "react-i18next";
import type { Rating } from "./trackTypes";
import { RATING_COLORS } from "./trackTypes";

/** Idle (welcome) view for Pocket Check before a session starts. */
export function TrackIdleView({
  evaluationEnabled,
  scoredBeats,
  savedOffset,
  hasHistory,
  onStart,
  onCalibrate,
  onShowHistory,
}: {
  evaluationEnabled?: boolean;
  scoredBeats: number;
  savedOffset: number | null;
  hasHistory: boolean;
  onStart: () => void;
  onCalibrate: () => void;
  onShowHistory: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="track-view">
      <div className="track-intro view-stagger-item" style={{ animationDelay: '0ms' }}>
        <div className="track-intro-icon">🎯</div>
        <h3>{t("pocketCheck.title")}</h3>
        <p>
          {evaluationEnabled
            ? t("pocketCheck.idleWithInstrument", { beats: scoredBeats })
            : t("pocketCheck.idleWithTaps", { beats: scoredBeats })}
        </p>
        {savedOffset !== null ? (
          <p className="track-config-hint">
            {t("pocketCheck.calibratedHint", {
              offset: `${savedOffset >= 0 ? "+" : ""}${savedOffset.toFixed(1)}`,
            })}
          </p>
        ) : (
          <p className="track-config-hint">
            {t("pocketCheck.calibrateHint")}
          </p>
        )}
        <div className="track-ratings-legend">
          {(
            ["metronomic", "tight", "solid", "loose", "miss"] as Rating[]
          ).map((r) => (
            <span key={r} className="track-legend-item">
              <span
                className="track-legend-dot"
                style={{ background: RATING_COLORS[r] }}
              />
              {t(`pocketCheck.ratings.${r}`)}
            </span>
          ))}
        </div>
      </div>
      <button className="play-btn full-width view-stagger-item" style={{ animationDelay: '80ms' }} onClick={onStart}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 2.5a.5.5 0 0 1 .77-.42l9 5.5a.5.5 0 0 1 0 .84l-9 5.5A.5.5 0 0 1 4 13.5z" />
        </svg>
        {t("pocketCheck.start")}
      </button>
      <div className="track-secondary-actions view-stagger-item" style={{ animationDelay: '120ms' }}>
        <button
          className="play-btn full-width secondary"
          onClick={onCalibrate}
        >
          {t("pocketCheck.calibrate")}
        </button>
        <button
          className="play-btn full-width secondary"
          onClick={onShowHistory}
          disabled={!hasHistory}
        >
          {t("pocketCheck.history")}
        </button>
      </div>
    </div>
  );
}
