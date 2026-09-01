import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { RATING_COLORS } from "./trackTypes";
import type {
  GameResult,
  PerBeatDatum,
  Rating,
  TapResult,
} from "./trackTypes";

/**
 * Results screen — shows the user's timing rating, a per-rating breakdown,
 * the accuracy graph (raw + smoothed lines), and a scatter plot of every
 * tap relative to its expected beat time. Floating "Try Again" CTA is
 * portaled to the document body to escape any clipping ancestors.
 *
 * The parent passes already-resolved display values so this component
 * doesn't need to know whether the user is viewing live results or a
 * past game pulled from history.
 */
export function TrackResultsView({
  hasHistory,
  displayRating,
  displayBreakdown,
  displayPerBeat,
  displayTaps,
  displayBpm,
  viewingResult,
  onShowHistory,
  onCalibrate,
  onStartSession,
}: {
  hasHistory: boolean;
  displayRating: Rating;
  displayBreakdown: Record<Rating, number>;
  displayPerBeat: PerBeatDatum[];
  displayTaps: TapResult[];
  displayBpm: number;
  viewingResult: GameResult | null;
  onShowHistory: () => void;
  onCalibrate: () => void;
  onStartSession: () => void;
}) {
  const { t, i18n } = useTranslation();
  // 5-point rolling mean for the smoothed accuracy line — softens the
  // raw per-beat noise without hiding the underlying drift trend.
  const smoothed = displayPerBeat.map((_d, i) => {
    const window = 5;
    const half = Math.floor(window / 2);
    let sum = 0,
      count = 0;
    for (
      let j = Math.max(0, i - half);
      j <= Math.min(displayPerBeat.length - 1, i + half);
      j++
    ) {
      if (displayPerBeat[j].offsetMs !== null) {
        sum += displayPerBeat[j].offsetMs!;
        count++;
      }
    }
    return count > 0 ? sum / count : null;
  });

  return (
    <div className="track-view track-results-view">
      <div className="track-results-toolbar">
        {hasHistory && (
          <button
            className="track-toolbar-btn"
            onClick={onShowHistory}
            data-tooltip={t("pocketCheck.history")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="14" width="4" height="7" rx="1"/>
              <rect x="10" y="8" width="4" height="13" rx="1"/>
              <rect x="16" y="3" width="4" height="18" rx="1"/>
            </svg>
          </button>
        )}
        <button
          className="track-toolbar-btn"
          onClick={onCalibrate}
          data-tooltip={t("pocketCheck.calibrate")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="8" x2="20" y2="8"/>
            <line x1="4" y1="16" x2="20" y2="16"/>
            <circle cx="9" cy="8" r="2.5" fill="currentColor"/>
            <circle cx="15" cy="16" r="2.5" fill="currentColor"/>
          </svg>
        </button>
      </div>
      <div className="track-results">
        <div className="track-result-header view-stagger-item" style={{ animationDelay: '0ms' }}>
          <div className="track-result-rating-wrap">
            <span className="track-result-prefix">{t("pocketCheck.yourTimingWas")}</span>
            <span
              className="track-result-rating"
              style={{ color: RATING_COLORS[displayRating] }}
            >
              {t(`pocketCheck.ratings.${displayRating}`)}
            </span>
          </div>
          <div className="track-result-meta">
            {displayBpm} BPM · {viewingResult ? new Date(viewingResult.date).toLocaleDateString(i18n.language) : new Date().toLocaleDateString(i18n.language)}
          </div>
        </div>

        {/* Rating breakdown bars */}
        <div className="track-breakdown view-stagger-item" style={{ animationDelay: '60ms' }}>
          {(
            ["metronomic", "tight", "solid", "loose", "miss"] as Rating[]
          ).map((rating) => (
            <div key={rating} className="track-breakdown-row">
              <span
                className="track-breakdown-dot"
                style={{ background: RATING_COLORS[rating] }}
              />
              <span className="track-breakdown-label">
                {t(`pocketCheck.ratings.${rating}`)}
              </span>
              <span className="track-breakdown-count">
                {displayBreakdown[rating] || 0}
              </span>
              <div className="track-breakdown-bar">
                <div
                  className="track-breakdown-fill"
                  style={{
                    width: `${displayTaps.length > 0 ? ((displayBreakdown[rating] || 0) / displayTaps.length) * 100 : 0}%`,
                    background: RATING_COLORS[rating],
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Accuracy graph */}
        <div className="track-accuracy-graph view-stagger-item" style={{ animationDelay: '120ms' }}>
          <div className="track-graph-y-labels">
            <span>{t("pocketCheck.early")}</span>
            <span>0ms</span>
            <span>{t("pocketCheck.late")}</span>
          </div>
          <svg
            viewBox={`0 0 ${Math.max(displayPerBeat.length, 1) * 20} 120`}
            preserveAspectRatio="none"
            className="track-graph-svg"
          >
            <line
              x1="0"
              y1="60"
              x2={displayPerBeat.length * 20}
              y2="60"
              stroke="var(--graph-grid)"
              strokeWidth="1"
            />
            {(() => {
              const points = displayPerBeat
                .map((d, i) =>
                  d.offsetMs !== null
                    ? {
                        x: i * 20 + 10,
                        y:
                          60 -
                          (Math.max(-80, Math.min(80, d.offsetMs)) / 80) * 55,
                      }
                    : null,
                )
                .filter(Boolean) as { x: number; y: number }[];
              if (points.length < 2) return null;
              const pathD = points
                .map((p, i) => {
                  if (i === 0) return `M ${p.x} ${p.y}`;
                  const prev = points[i - 1];
                  const cpx1 = prev.x + (p.x - prev.x) * 0.4;
                  const cpx2 = p.x - (p.x - prev.x) * 0.4;
                  return `C ${cpx1} ${prev.y} ${cpx2} ${p.y} ${p.x} ${p.y}`;
                })
                .join(" ");
              return (
                <path
                  d={pathD}
                  fill="none"
                  stroke="var(--graph-line)"
                  strokeWidth="2"
                />
              );
            })()}
            {(() => {
              const points = smoothed
                .map((val, i) =>
                  val !== null
                    ? {
                        x: i * 20 + 10,
                        y: 60 - (Math.max(-80, Math.min(80, val)) / 80) * 55,
                      }
                    : null,
                )
                .filter(Boolean) as { x: number; y: number }[];
              if (points.length < 2) return null;
              const pathD = points
                .map((p, i) => {
                  if (i === 0) return `M ${p.x} ${p.y}`;
                  const prev = points[i - 1];
                  const cpx1 = prev.x + (p.x - prev.x) * 0.4;
                  const cpx2 = p.x - (p.x - prev.x) * 0.4;
                  return `C ${cpx1} ${prev.y} ${cpx2} ${p.y} ${p.x} ${p.y}`;
                })
                .join(" ");
              return (
                <path
                  d={pathD}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.5"
                />
              );
            })()}
            {displayPerBeat.map((d, i) => {
              const x = i * 20 + 10;
              if (d.offsetMs === null) {
                return (
                  <g key={i}>
                    <line
                      x1={x - 4}
                      y1="56"
                      x2={x + 4}
                      y2="64"
                      stroke="#ff4444"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <line
                      x1={x + 4}
                      y1="56"
                      x2={x - 4}
                      y2="64"
                      stroke="#ff4444"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </g>
                );
              }
              return null;
            })}
            {displayPerBeat.map((d, i) => {
              if (d.offsetMs === null) return null;
              const x = i * 20 + 10;
              const y =
                60 - (Math.max(-80, Math.min(80, d.offsetMs)) / 80) * 55;
              return (
                <circle
                  key={`dot-${i}`}
                  cx={x}
                  cy={y}
                  r="3"
                  fill={RATING_COLORS[d.rating]}
                  opacity="0.35"
                />
              );
            })}
          </svg>
        </div>

        {/* Scatter plot */}
        <div className="track-scatter view-stagger-item" style={{ animationDelay: '180ms' }}>
          <div className="track-scatter-zero" />
          {displayTaps.map((t, i) => (
            <div
              key={i}
              className="track-scatter-dot"
              style={{
                left: `${Math.min(100, Math.max(0, ((t.offsetMs + 80) / 160) * 100))}%`,
                top: `${(i / Math.max(displayTaps.length - 1, 1)) * 100}%`,
                background: RATING_COLORS[t.rating],
              }}
            />
          ))}
          <span className="track-scatter-label-left">−80ms</span>
          <span className="track-scatter-label-right">+80ms</span>
        </div>
      </div>

      {createPortal(
        <button className="play-btn full-width track-floating-cta" onClick={onStartSession}>
          {t("pocketCheck.tryAgain")}
        </button>,
        document.body
      )}
    </div>
  );
}
