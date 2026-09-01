import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getSessionHistory, deleteSession, clearAllSessions } from "../../ipc";
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

interface CoachCardProps {
  open: boolean;
  active: boolean;
  messages: FeedMessage[];
  onToggle: () => void;
  onStartSession: () => void;
  onEndSession: () => void;
  onSendChat?: (message: string) => void;
  /** Phase 5 — chip tap / affordance handler. When the user taps a
   *  chip on a mini-report the card dispatches the resulting
   *  `ChipAction` here. The session hook owns the routing (append
   *  feed, set BPM, focus chat). */
  onChipAction?: (action: ChipAction) => void;
  /** Phase 5 — focus-input registration. The session hook calls this
   *  on mount to install a focus callback the chip "open-chat"
   *  affordance can invoke. The card calls `register(null)` on
   *  unmount. */
  onRegisterChatFocus?: (focus: (() => void) | null) => void;
  listening?: boolean;
  hasSignal?: boolean;
  spectrum?: AudioSpectrum | null;
  /** Plan OQ8 — `?` while playing pauses the metronome AND opens the
   *  card. Without these props, the shortcut just opens the card. The
   *  MainWindow wires both: `isPlaying` from the metronome state and
   *  `onPause` from `togglePlayback`. */
  isPlaying?: boolean;
  onPause?: () => void;
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

export default function CoachCard({ open, active, messages, onToggle, onStartSession, onEndSession, onSendChat, onChipAction, onRegisterChatFocus, listening, hasSignal, spectrum, isPlaying, onPause, inferredGrid, playMode, coachLoading, ttsActive }: CoachCardProps) {
  const { t } = useTranslation();
  const feedRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [chatInput, setChatInput] = useState("");

  // Phase 5 — register a focus callback the session hook can invoke
  // when an "open-chat" chip fires. The callback is intentionally a
  // re-creatable arrow so we don't need useCallback (the registration
  // effect deps only fire when `onRegisterChatFocus` changes).
  useEffect(() => {
    if (!onRegisterChatFocus) return;
    onRegisterChatFocus(() => chatInputRef.current?.focus());
    return () => onRegisterChatFocus(null);
  }, [onRegisterChatFocus]);
  const [tab, setTab] = useState<CardTab>("feed");
  const [closing, setClosing] = useState(false);
  const [showCard, setShowCard] = useState(open);

  // Handle open/close with exit animation
  useEffect(() => {
    if (open) {
      setClosing(false);
      setShowCard(true);
    } else if (showCard) {
      setClosing(true);
      const timer = setTimeout(() => {
        setClosing(false);
        setShowCard(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Phase 5 — global `?` shortcut: open the card if collapsed, focus
  // the chat input. The shortcut is the mid-session "ask coach"
  // discovery affordance: chips after a mini-report are the primary
  // surface, but pressing `?` while you're playing gets you to the
  // chat input without breaking flow. Plan OQ8 — when the metronome
  // is currently playing we ALSO pause it so the user gets a clean
  // "pause then ask" flow (rather than trying to type questions while
  // the click track is still hammering). We ignore the key while
  // focus is inside an input/textarea (or `contentEditable`) so we
  // don't intercept the literal "?" character the user is typing
  // somewhere else.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "?") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
        return;
      }
      // Don't fight other keybindings that use modifiers.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      // OQ8 — pause first, then open. Pausing before opening keeps the
      // shortcut semantically consistent with the chat experience: the
      // metronome stops, the card slides in, the input gets focus.
      if (isPlaying) onPause?.();
      if (!open) onToggle();
      // Defer focus until after the open animation has started so the
      // input is mounted and visible.
      window.setTimeout(() => chatInputRef.current?.focus(), 0);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onToggle, isPlaying, onPause]);

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
    if (tab === "history" && open) {
      getSessionHistory().then((h) => setHistory(rescoreHistory(h)));
    }
  }, [tab, open]);

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

  if (!showCard) {
    return (
      <button
        className={`coach-card-pill ${active ? "coach-active" : ""}`}
        onClick={onToggle}
        title={t("settings.coach.title")}
      >
        {listening && <span className={`coach-status-dot ${hasSignal ? "signal" : "listening"}`} />}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z" />
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z" />
        </svg>
        <span className="coach-card-pill-label">{t("settings.coach.title")}</span>
      </button>
    );
  }

  return (
    <div className={`coach-card coach-card-open${closing ? " coach-card-closing" : ""}`}>
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
            <button className="coach-card-header-btn" onClick={onToggle} title={t("coachCard.collapse")}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
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

            {/* Chat input */}
            <div className="coach-card-chat">
              <input
                ref={chatInputRef}
                className="coach-card-chat-input"
                type="text"
                placeholder={t("coachCard.askPlaceholder")}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" && chatInput.trim()) {
                    onSendChat?.(chatInput.trim());
                    setChatInput("");
                  }
                }}
              />
              <button
                className="coach-card-chat-send"
                disabled={!chatInput.trim()}
                onClick={() => { onSendChat?.(chatInput.trim()); setChatInput(""); }}
                title={t("coachCard.send")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
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
