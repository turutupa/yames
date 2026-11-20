import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getSessionHistory, deleteSession, clearAllSessions } from "../../ipc.desktop";
import { rescoreReport } from "../../coach/reportStats";
import type { FeedMessage, SavedSession, AudioSpectrum, InferredGridChanged } from "../../types";
import { FeedMessageItem, type ChipAction } from "./CoachFeedMessage";
import { CoachHistoryList } from "./CoachHistoryList";
import { CoachSessionDetail } from "./CoachSessionDetail";
import { SystemStatusChip } from "../../components/SystemStatusChip";

/**
 * Apply the JS-side legacy scoring formula to every loaded session.
 * Sessions saved before the scoring fix have the old segment-aware
 * Rust score baked in (often demotivating sub-30 grades on otherwise
 * fine 70%-accuracy runs); re-deriving on read keeps the history view
 * consistent with newly-saved sessions without a destructive migration.
 */
function rescoreHistory(sessions: SavedSession[]): SavedSession[] {
  return sessions.map((s) => ({ ...s, report: rescoreReport(s.report) }));
}
import "../../styles/coach-card.css";
import "../../styles/evaluation-panel.css";

/**
 * The tools' coach: Start and End, the Feed and History.
 *
 * Since leg c2a1 it is a section of Ask (`containers/coach/AskPanel.tsx`),
 * not a panel of its own: the panel, its open state, its close button and
 * the model selector at its foot are Ask's; the question box moved into Ask
 * with the conversation, and `?` became a hotkey action (`ask-coach`). Leg
 * c2a2 removes this component with Start, End, the Feed and History.
 */
interface CoachCardProps {
  active: boolean;
  messages: FeedMessage[];
  onStartSession: () => void;
  onEndSession: () => void;
  /** Phase 5 — chip tap / affordance handler. When the user taps a
   *  chip on a mini-report the card dispatches the resulting
   *  `ChipAction` here. The session hook owns the routing (append
   *  feed, set BPM, ask in Ask). */
  onChipAction?: (action: ChipAction) => void;
  listening?: boolean;
  hasSignal?: boolean;
  spectrum?: AudioSpectrum | null;
  isPlaying?: boolean;
  /** Path B — rhythm-inference lock state. When the matcher decides the
   *  user is playing a specific divisor (e.g. 4 → 16ths), this carries
   *  the locked divisor. Used to render the subtle "Tracking 16ths"
   *  caption next to the title. `null` or `locked === false` → no
   *  caption. */
  inferredGrid?: InferredGridChanged | null;
  /** Step 5 — derived play style from onset_efficiency. 'noodling'
   *  when the ratio of matched onsets is below the threshold,
   *  'structured' otherwise. Absent until the first session report. */
  playMode?: "structured" | "noodling";
  /** True while the LLM is generating a response. */
  coachLoading?: boolean;
  /** True while TTS audio is playing back. */
  ttsActive?: boolean;
}


type CardTab = "feed" | "history";
type HistoryView = "list" | "detail";

export default function CoachCard({ active, messages, onStartSession, onEndSession, onChipAction, listening, hasSignal, spectrum, isPlaying, inferredGrid, playMode, coachLoading, ttsActive }: CoachCardProps) {
  const { t } = useTranslation();
  const feedRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<CardTab>("feed");

  // History state
  const [history, setHistory] = useState<SavedSession[]>([]);
  const [historyView, setHistoryView] = useState<HistoryView>("list");
  const [selectedSession, setSelectedSession] = useState<SavedSession | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Auto-scroll feed to bottom on new messages
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Switch to feed tab when session starts
  useEffect(() => {
    if (active) setTab("feed");
  }, [active]);

  // Load history when switching to history tab
  useEffect(() => {
    if (tab === "history") {
      getSessionHistory().then((h) => setHistory(rescoreHistory(h)));
    }
  }, [tab]);

  const handleSelectSession = useCallback((session: SavedSession) => {
    setSelectedSession(session);
    setHistoryView("detail");
  }, []);

  const handleBack = useCallback(() => {
    setHistoryView("list");
    setSelectedSession(null);
    getSessionHistory().then(setHistory);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteSession(id);
    setHistory((h) => h.filter((s) => s.id !== id));
    if (selectedSession?.id === id) {
      setHistoryView("list");
      setSelectedSession(null);
    }
  }, [selectedSession]);

  const handleClearAll = useCallback(async () => {
    await clearAllSessions();
    setHistory([]);
    setHistoryView("list");
    setSelectedSession(null);
    setShowClearConfirm(false);
  }, []);

  return (
    <div className="coach-card coach-card-embedded">
      <div className="coach-card-inner">
        <div className="coach-card-header">
          {tab === "history" && historyView === "detail" ? (
            <button className="coach-card-header-btn" onClick={handleBack}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              {t("tooltip.back")}
            </button>
          ) : (
            <span className="coach-card-title">
              <span className={`coach-status-dot ${listening ? (hasSignal ? "signal" : "listening") : ""}`} />
              {t("settings.coach.title")}
              <span className="experimental-badge" title={t("settings.coach.betaHint")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" />
                  <path d="M8.5 2h7" />
                  <path d="M7 16h10" />
                </svg>
                {t("settings.coach.beta")}
              </span>
              {active && listening && spectrum && (
                <span className={`coach-title-spectrum ${hasSignal ? "has-signal" : ""}`}>
                  {Array.from({ length: 5 }, (_, i) => {
                    const bands = spectrum.bands ?? [];
                    const step = Math.max(1, Math.floor(bands.length / 5));
                    const level = i * step < bands.length ? bands[i * step] : 0;
                    return <span key={i} className="coach-title-spectrum-bar" style={{ height: `${Math.max(2, level * 100)}%` }} />;
                  })}
                </span>
              )}
            </span>
          )}
          <div className="coach-card-header-actions">
            {active && tab === "feed" && (
              <button className="coach-card-header-btn coach-card-end-btn" onClick={onEndSession}>
                {t("coachCard.end")}
              </button>
            )}
            {!active && tab === "feed" && (
              <button className="coach-card-header-btn coach-card-start-btn" onClick={onStartSession}>
                {t("coachCard.start")}
              </button>
            )}
            {tab === "history" && historyView === "list" && history.length > 0 && (
              <button className="coach-card-header-btn" onClick={() => setShowClearConfirm(true)} title={t("coachCard.clearAll")}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="coach-card-tabs">
          <button
            className={`coach-card-tab ${tab === "feed" ? "active" : ""}`}
            onClick={() => { setTab("feed"); setHistoryView("list"); setSelectedSession(null); }}
          >
            {t("coachCard.feed")}
          </button>
          <button
            className={`coach-card-tab ${tab === "history" ? "active" : ""}`}
            onClick={() => setTab("history")}
          >
            {t("coachCard.history")}
          </button>
        </div>

        {tab === "feed" ? (
          <>
            {messages.length === 0 ? (
              <div className="coach-card-empty">
                <div className="coach-card-empty-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </div>
                <p className="coach-card-empty-text">
                  {t("coachCard.emptyTitle")}<br/>
                  {t("coachCard.emptyHint")}
                </p>
              </div>
            ) : (
              <div className="coach-card-feed" ref={feedRef}>
                {messages.map((msg) => (
                  <FeedMessageItem key={msg.id} message={msg} onChipAction={onChipAction} />
                ))}
              </div>
            )}

            <SystemStatusChip
              active={active}
              isPlaying={isPlaying}
              listening={listening}
              playMode={playMode}
              coachLoading={coachLoading}
              ttsActive={ttsActive}
              inferredDivisor={inferredGrid?.locked ? inferredGrid.divisor : undefined}
            />
          </>
        ) : (
          <>
            {showClearConfirm && (
              <div className="coach-confirm-overlay" onClick={() => setShowClearConfirm(false)}>
                <div className="coach-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                  <p>{t("eval.deleteAllConfirm")}</p>
                  <div className="coach-confirm-actions">
                    <button className="coach-confirm-cancel" onClick={() => setShowClearConfirm(false)}>{t("eval.cancel")}</button>
                    <button className="coach-confirm-delete" onClick={handleClearAll}>{t("eval.deleteAll")}</button>
                  </div>
                </div>
              </div>
            )}

            {historyView === "list" ? (
              <CoachHistoryList
                sessions={history}
                onSelect={handleSelectSession}
                onDelete={handleDelete}
              />
            ) : selectedSession ? (
              <CoachSessionDetail
                session={selectedSession}
                onDelete={() => handleDelete(selectedSession.id)}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
