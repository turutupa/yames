import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { clearSession, getSessionHistory, deleteSession, clearAllSessions } from "../../ipc";
import { FEEDBACK_COLORS } from "../../hooks/useEvaluation";
import { ScoreRing, BreakdownBar, Histogram, ScoreBadge, MiniSparkline } from "./evaluation";
import type { SessionReport, SavedSession } from "../../types";
import { accuracyPct, rescoreReport, scoredBeats } from "../../coach/reportStats";
import { SessionNarrativeView } from "../../coach/SessionNarrativeView";
import "../../styles/evaluation-panel.css";

/**
 * Apply the JS-side legacy scoring formula to every loaded session.
 * Mirrors `CoachCard.rescoreHistory` — see that file for the rationale
 * (sessions saved with the pre-fix segment-aware Rust score get
 * re-derived on read so the history view is internally consistent).
 */
function rescoreHistory(sessions: SavedSession[]): SavedSession[] {
  return sessions.map((s) => ({ ...s, report: rescoreReport(s.report) }));
}

interface EvaluationPanelProps {
  open: boolean;
  onClose: () => void;
  onToggle: () => void;
  /** If set, panel opens directly to this report (e.g. after playback stops) */
  currentReport?: SessionReport | null;
  currentMeta?: { bpm: number; timestamp: number } | null;
  /** Lifted state for persistence across unmount/remount */
  panelView: "history" | "detail";
  setPanelView: (v: "history" | "detail") => void;
  selectedReport: SessionReport | null;
  setSelectedReport: (r: SessionReport | null) => void;
  selectedMeta: { bpm: number; timestamp: number; id?: string } | null;
  setSelectedMeta: (m: { bpm: number; timestamp: number; id?: string } | null) => void;
}

export default function EvaluationPanel({ open, onClose, onToggle, currentReport, currentMeta, panelView, setPanelView, selectedReport, setSelectedReport, selectedMeta, setSelectedMeta }: EvaluationPanelProps) {
  const { t } = useTranslation();
  const [history, setHistory] = useState<SavedSession[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Load history when panel opens
  useEffect(() => {
    if (open) {
      getSessionHistory().then((h) => setHistory(rescoreHistory(h)));
      // If we have a fresh report from playback stop, show it
      if (currentReport) {
        setSelectedReport(currentReport);
        setSelectedMeta(currentMeta ? { bpm: currentMeta.bpm, timestamp: currentMeta.timestamp } : null);
        setPanelView("detail");
      }
      // Otherwise keep existing view state (don't reset on remount)
    }
  }, [open, currentReport, currentMeta]);

  const handleSelectSession = useCallback((session: SavedSession) => {
    setSelectedReport(session.report);
    setSelectedMeta({ bpm: session.bpm, timestamp: session.timestamp, id: session.id });
    setPanelView("detail");
  }, []);

  const handleBack = useCallback(() => {
    setPanelView("history");
    setSelectedReport(null);
    setSelectedMeta(null);
    // Refresh history in case something changed
    getSessionHistory().then(setHistory);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteSession(id);
    setHistory((h) => h.filter((s) => s.id !== id));
    if (selectedMeta?.id === id) {
      setPanelView("history");
      setSelectedReport(null);
      setSelectedMeta(null);
    }
  }, [selectedMeta]);

  const handleClearCurrent = useCallback(async () => {
    await clearSession();
    onClose();
  }, [onClose]);

  const handleClearAll = useCallback(async () => {
    await clearAllSessions();
    setHistory([]);
    setPanelView("history");
    setSelectedReport(null);
    setSelectedMeta(null);
    setShowClearConfirm(false);
  }, []);

  const sessionsIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );

  return (
    <div className={`eval-panel ${open ? "open" : ""}`}>
      {!open && (
        <button
          className="eval-panel-collapsed-tab"
          onClick={onToggle}
          title={t("eval.sessions")}
        >
          {sessionsIcon}
        </button>
      )}
      <div className="eval-panel-inner">
        {open && (
          <>
            <div className="eval-panel-header">
              {panelView === "detail" ? (
                <button className="eval-back-btn" onClick={handleBack}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  {t("eval.sessions")}
                </button>
              ) : (
                <h3>{t("eval.sessions")}</h3>
              )}
              {panelView === "history" && history.length > 0 && (
                <button
                  className="eval-clear-all-btn"
                  onClick={() => setShowClearConfirm(true)}
                  title={t("eval.clearAllTitle")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                  <span className="eval-clear-all-label">{t("eval.clearAll")}</span>
                </button>
              )}
              <button className="eval-panel-close" onClick={onToggle} title={t("eval.closeSessions")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {showClearConfirm && (
              <div className="eval-confirm-overlay" onClick={() => setShowClearConfirm(false)}>
                <div className="eval-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                  <p>{t("eval.deleteAllConfirm")}</p>
                  <div className="eval-confirm-actions">
                    <button className="eval-confirm-cancel" onClick={() => setShowClearConfirm(false)}>{t("eval.cancel")}</button>
                    <button className="eval-confirm-delete" onClick={handleClearAll}>{t("eval.deleteAll")}</button>
                  </div>
                </div>
              </div>
            )}

            {panelView === "history" ? (
              <HistoryList
                sessions={history}
                onSelect={handleSelectSession}
                onDelete={handleDelete}
              />
            ) : selectedReport ? (
              <ReportDetail
                report={selectedReport}
                meta={selectedMeta}
                onDelete={selectedMeta?.id ? () => handleDelete(selectedMeta.id!) : undefined}
                onClearCurrent={!selectedMeta?.id ? handleClearCurrent : undefined}
              />
            ) : (
              <div className="eval-panel-empty">
                <p>{t("eval.emptyData")}</p>
                <p>{t("eval.emptyDataHint")}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── History List ────────────────────────────────────────────────────────────

function HistoryList({
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
      <div className="eval-panel-empty">
        <p>{t("eval.emptyHistory")}</p>
        <p>{t("eval.emptyHistoryHint")}</p>
      </div>
    );
  }

  const grouped = groupByDay(sessions, t, i18n.language);

  return (
    <div className="eval-history-list">
      {grouped.map((group) => (
        <div key={group.label}>
          <div className="eval-history-heading">{group.label}</div>
          {group.sessions.map((session) => (
        <div
          key={session.id}
          className="eval-history-card"
          onClick={() => onSelect(session)}
        >
          <button
            className="eval-history-delete"
            onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <div className="eval-card-top">
            <ScoreBadge score={session.report.score} />
            <span className="eval-card-time">{new Date(session.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
            <span className="eval-card-sep">&middot;</span>
            <span className="eval-card-bpm">{session.bpm} BPM</span>
          </div>
          {session.report.comment && (
            <div className="eval-card-comment">{session.report.comment}</div>
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

// ─── Report Detail ───────────────────────────────────────────────────────────

function ReportDetail({
  report,
  meta,
  onDelete,
  onClearCurrent,
}: {
  report: SessionReport;
  meta: { bpm: number; timestamp: number; id?: string } | null;
  onDelete?: () => void;
  onClearCurrent?: () => void;
}) {
  const { t, i18n } = useTranslation();
  // Both the breakdown-bar totals and the hit-rate use the SCORED-beat
  // denominator (hits + miss). Centralised in `src/coach/reportStats.ts`
  // so the JS-side accuracy never disagrees with the Rust score.
  const scored = scoredBeats(report);
  const hitRate = accuracyPct(report);
  return (
    <div className="eval-panel-body">
      <div className="eval-ring-section">
        <ScoreRing score={report.score} size={96} strokeWidth={6} />
        {meta && (
          <div className="eval-ring-meta">
            {meta.bpm} BPM &middot; {formatDate(meta.timestamp, t, i18n.language)}
          </div>
        )}
        <div className="eval-comment">{report.comment}</div>
      </div>

      {/*
        Narrative sits between the ring and the rule-based insights so
        the user reads the *interpretation* of their score before the
        raw rule fires. A 65 might be "tight but scattered" or "loose
        but accurate" — the narrative makes that distinction visible
        instead of leaving the user to derive it from the stats grid.
        Shared component with `CoachSessionDetail.tsx`.
      */}
      <SessionNarrativeView report={report} />

      {report.insights.length > 0 && (
        <div className="eval-insights">
          {report.insights.map((insight, i) => (
            <div key={i} className="eval-insight">{insight}</div>
          ))}
        </div>
      )}

      <div className="eval-breakdown">
        <div className="eval-breakdown-title">{t("eval.breakdown")}</div>
        <div className="eval-breakdown-bars">
          <BreakdownBar label={t("eval.perfect")} count={report.perfectCount} total={scored} color={FEEDBACK_COLORS.perfect} />
          <BreakdownBar label={t("eval.good")} count={report.goodCount} total={scored} color={FEEDBACK_COLORS.good} />
          <BreakdownBar label={t("eval.ok")} count={report.okCount} total={scored} color={FEEDBACK_COLORS.ok} />
          <BreakdownBar label={t("eval.miss")} count={report.missCount} total={scored} color={FEEDBACK_COLORS.miss} />
        </div>
      </div>

      {report.deviations.length > 4 && (
        <div className="eval-histogram">
          <div className="eval-breakdown-title">{t("eval.timingDistribution")}</div>
          <Histogram deviations={report.deviations} />
        </div>
      )}

      <div className="eval-stats">
        <div className="eval-breakdown-title">{t("eval.details")}</div>
        <div className="eval-stat-row">
          <span className="eval-stat-label">{t("eval.scoredBeats")}</span>
          <span className="eval-stat-value">{scored}</span>
        </div>
        <div className="eval-stat-row">
          <span className="eval-stat-label">{t("eval.hitRate")}</span>
          <span className="eval-stat-value">{hitRate}%</span>
        </div>
        <div className="eval-stat-row">
          {/*
            "Avg timing error" uses the MAGNITUDE (meanAbsDeviationMs) — the
            signed mean (meanDeviationMs) cancels to ~0 when early/late
            errors are balanced and was producing the misleading "+0.0 ms"
            on sloppy sessions. Bias direction lives in the narrative.
          */}
          <span className="eval-stat-label">{t("eval.avgTimingError")}</span>
          <span className="eval-stat-value">{"\u00B1"}{report.meanAbsDeviationMs.toFixed(1)}ms</span>
        </div>
        <div className="eval-stat-row">
          <span className="eval-stat-label">{t("eval.consistency")}</span>
          <span className="eval-stat-value">{"\u00B1"}{report.stdDeviationMs.toFixed(1)}ms</span>
        </div>
        <div className="eval-stat-row">
          <span className="eval-stat-label">{t("eval.tempoStability")}</span>
          <span className="eval-stat-value">{"\u00B1"}{report.tempoStabilityMs.toFixed(1)}ms</span>
        </div>
        <div className="eval-stat-row">
          <span className="eval-stat-label">{t("eval.longestStreak")}</span>
          <span className="eval-stat-value">{report.longestStreak}</span>
        </div>
        {report.skippedBeats > 0 && (
          <div className="eval-stat-row">
            <span className="eval-stat-label">{t("eval.skipped")}</span>
            <span className="eval-stat-value eval-stat-muted">{report.skippedBeats}</span>
          </div>
        )}
      </div>

      {onDelete && (
        <button className="eval-clear-btn" onClick={onDelete}>{t("eval.deleteSession")}</button>
      )}
      {onClearCurrent && (
        <button className="eval-clear-btn" onClick={onClearCurrent}>{t("eval.dismiss")}</button>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDayGroup(timestamp: number, t: TFunction, lang: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t("eval.today");
  if (diffDays === 1) return t("eval.yesterday");
  if (diffDays < 7) return date.toLocaleDateString(lang, { weekday: "long" });
  return date.toLocaleDateString(lang, { month: "short", day: "numeric" });
}

function groupByDay(sessions: SavedSession[], t: TFunction, lang: string): { label: string; sessions: SavedSession[] }[] {
  const groups: { label: string; sessions: SavedSession[] }[] = [];
  let currentLabel = "";
  for (const session of sessions) {
    const label = getDayGroup(session.timestamp, t, lang);
    if (label !== currentLabel) {
      groups.push({ label, sessions: [session] });
      currentLabel = label;
    } else {
      groups[groups.length - 1].sessions.push(session);
    }
  }
  return groups;
}

function formatDate(timestamp: number, t: TFunction, lang: string): string {
  const date = new Date(timestamp);
  const now = new Date();

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24));

  const time = date.toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit" });

  if (diffDays === 0) return `${t("eval.today")} ${time}`;
  if (diffDays === 1) return `${t("eval.yesterday")} ${time}`;
  if (diffDays < 7) return `${date.toLocaleDateString(lang, { weekday: "short" })} ${time}`;
  return date.toLocaleDateString(lang, { month: "short", day: "numeric" });
}
