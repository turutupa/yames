import { useTranslation } from "react-i18next";
import { ScoreBadge, MiniSparkline } from "../drill/evaluation";
import type { SavedSession } from "../../types";
import { groupByDay } from "./coachCardHelpers";

/**
 * Saved-session list inside the coach card's History tab. Sessions are
 * grouped by day (Today / Yesterday / weekday / date) via the shared
 * groupByDay helper. Clicking a card calls `onSelect`; the trash icon
 * calls `onDelete` (stopPropagation prevents the card click).
 */
export function CoachHistoryList({
  sessions,
  onSelect,
  onDelete,
}: {
  sessions: SavedSession[];
  onSelect: (s: SavedSession) => void;
  onDelete: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  if (sessions.length === 0) {
    return (
      <div className="coach-card-empty">
        <p className="coach-card-empty-text">
          {t("emptyStates.history.title")}<br/>
          {t("emptyStates.history.hint")}
        </p>
      </div>
    );
  }

  const grouped = groupByDay(sessions, t, i18n.language);

  const icValues = [...sessions]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(s => s.report.intervalConsistency)
    .filter((v): v is number => v !== undefined)
    .slice(-8);

  return (
    <div className="coach-history-list">
      {icValues.length >= 3 && (
        <div className="coach-history-ic-trend">
          <span className="coach-history-ic-label">{t("coachCard.noteSpacingTrend")}</span>
          <svg width="80" height="20" viewBox="0 0 80 20" aria-hidden="true">
            {icValues.slice(1).map((v, i) => {
              const prev = icValues[i];
              const x1 = (i / (icValues.length - 1)) * 76 + 2;
              const y1 = 18 - prev * 16;
              const x2 = ((i + 1) / (icValues.length - 1)) * 76 + 2;
              const y2 = 18 - v * 16;
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="var(--accent, #7c6af7)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
        </div>
      )}
      {grouped.map((group) => (
        <div key={group.label}>
          <div className="coach-history-heading">{group.label}</div>
          {group.sessions.map((session) => (
            <div
              key={session.id}
              className="coach-history-card"
              onClick={() => onSelect(session)}
            >
              <button
                className="coach-history-delete"
                onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
              <div className="coach-history-card-top">
                <ScoreBadge score={session.report.score} />
                <span className="coach-history-time">
                  {new Date(session.timestamp).toLocaleTimeString(i18n.language, { hour: "numeric", minute: "2-digit" })}
                </span>
                <span className="coach-history-sep">&middot;</span>
                <span className="coach-history-bpm">{session.bpm} BPM</span>
              </div>
              {session.presetName && (
                <div className="coach-history-preset">{session.presetName}</div>
              )}
              {session.report.comment && (
                <div className="coach-history-comment">{session.report.comment}</div>
              )}
              {session.report.deviations.length > 2 && (
                <MiniSparkline deviations={session.report.deviations} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
