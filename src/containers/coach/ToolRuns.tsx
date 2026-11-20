/**
 * Progress → Tool runs (DESIGN 7, 3.1 "Progress"): everything the old coach
 * card's History tab did, on the page where the player looks back.
 *
 * The list of saved runs (newest thirty, grouped by day, the note-spacing
 * trend over them), a run's detail (its summary, the timeline of its
 * stretches, the breakdown and the timing histogram), Delete on a run and
 * Clear all with its confirmation: the player's own buttons, never the
 * coach's. Rows saved by any older version read as they always did: each is
 * re-scored on read exactly as the card did it (`rescoreReport`, COA-51).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { clearAllSessions, deleteSession, getSessionHistory } from "../../ipc";
import { rescoreReport } from "../../coach/reportStats";
import type { SavedSession } from "../../types";
import { ToolRunList } from "./toolRuns/ToolRunList";
import { ToolRunDetail } from "./toolRuns/ToolRunDetail";
import "../../styles/evaluation-panel.css";
import "../../styles/tool-runs.css";

/** Sessions saved before the scoring fix are read with today's formula. */
export function rescoreHistory(sessions: SavedSession[]): SavedSession[] {
  return sessions.map((s) => ({ ...s, report: rescoreReport(s.report) }));
}

/** The note under a tool asked to open this section: scroll to it when it mounts. */
let revealPending = false;
export function revealToolRuns(): void {
  revealPending = true;
}

export function ToolRuns() {
  const { t } = useTranslation();
  const [history, setHistory] = useState<SavedSession[] | null>(null);
  const [selected, setSelected] = useState<SavedSession | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  const load = useCallback(() => {
    getSessionHistory()
      .then((h) => setHistory(rescoreHistory(h)))
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!revealPending || history === null) return;
    revealPending = false;
    rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [history]);

  // A delete the store refused leaves the list as it was (the old card did
  // the same), and says so: a row that vanished here and came back on the
  // next visit would be the app being quiet about the one thing it owes.
  const [failed, setFailed] = useState(false);

  const remove = useCallback(async (id: string) => {
    try {
      await deleteSession(id);
    } catch (e) {
      console.error("[tool runs] the store refused the delete:", e);
      setFailed(true);
      return;
    }
    setFailed(false);
    setHistory((h) => (h ?? []).filter((s) => s.id !== id));
    setSelected((s) => (s?.id === id ? null : s));
  }, []);

  const clearAll = useCallback(async () => {
    setConfirmClear(false);
    try {
      await clearAllSessions();
    } catch (e) {
      console.error("[tool runs] the store refused to clear:", e);
      setFailed(true);
      return;
    }
    setFailed(false);
    setHistory([]);
    setSelected(null);
  }, []);

  const runs = history ?? [];

  return (
    <section className="tool-runs session-glass session-rise" ref={rootRef} data-testid="tool-runs" aria-labelledby="tool-runs-title">
      <header className="tool-runs-head">
        {selected ? (
          <button type="button" className="tool-runs-back" onClick={() => setSelected(null)} data-testid="tool-runs-back">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            {t("tooltip.back")}
          </button>
        ) : null}
        <h2 className="session-prog-title" id="tool-runs-title">
          {t("session.progress.toolRuns")}
        </h2>
        {!selected && runs.length > 0 && !confirmClear && (
          <button
            type="button"
            className="tool-runs-clear"
            onClick={() => setConfirmClear(true)}
            data-testid="tool-runs-clear"
          >
            {t("coachCard.clearAll")}
          </button>
        )}
      </header>
      {!selected && <p className="session-why tool-runs-intro">{t("session.progress.toolRunsIntro")}</p>}
      {confirmClear && (
        <div className="coach-confirm-dialog tool-runs-confirm" role="alertdialog" aria-label={t("eval.deleteAllConfirm")} data-testid="tool-runs-confirm">
          <p>{t("eval.deleteAllConfirm")}</p>
          <div className="coach-confirm-actions">
            <button type="button" className="coach-confirm-cancel" onClick={() => setConfirmClear(false)}>
              {t("eval.cancel")}
            </button>
            <button type="button" className="coach-confirm-delete" onClick={clearAll} data-testid="tool-runs-clear-confirm">
              {t("eval.deleteAll")}
            </button>
          </div>
        </div>
      )}
      {failed && (
        <p className="session-why session-bad tool-runs-failed" role="alert" data-testid="tool-runs-failed">
          {t("session.progress.toolRunsDeleteFailed")}
        </p>
      )}
      {history === null ? null : selected ? (
        <ToolRunDetail session={selected} onDelete={() => remove(selected.id)} />
      ) : (
        <ToolRunList sessions={runs} onSelect={setSelected} onDelete={remove} />
      )}
    </section>
  );
}
