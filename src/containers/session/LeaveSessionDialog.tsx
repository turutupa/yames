import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

/**
 * "Leave this Session? Your Takes are saved." The second Escape in a Session
 * that has Takes in it (UX audit NAV-2, 2026-11-17).
 *
 * Its own keys, in the capture phase so the Session's never see them: Escape
 * stays (a key that both asked and answered would be no question), Enter
 * leaves. Without this Enter would also be the Session's "next thing".
 */
export function LeaveSessionDialog({ onLeave, onStay }: { onLeave: () => void; onStay: () => void }) {
  const { t } = useTranslation();
  const leaveRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    leaveRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onStay();
      } else if (e.key === "Enter") {
        e.stopPropagation();
        e.preventDefault();
        onLeave();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onLeave, onStay]);
  return (
    <div className="unsaved-overlay" onClick={onStay} data-testid="leave-session">
      <div
        className="unsaved-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-session-title"
        aria-describedby="leave-session-body"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="unsaved-head">
          <span className="unsaved-title" id="leave-session-title">
            {t("session.leave.title")}
          </span>
        </div>
        <p className="unsaved-body" id="leave-session-body">
          {t("session.leave.body")}
        </p>
        <div className="unsaved-actions">
          <button className="unsaved-cancel" onClick={onStay} data-testid="leave-session-stay">
            {t("session.leave.stay")}
          </button>
          <span className="unsaved-spacer" />
          <button ref={leaveRef} className="unsaved-save" onClick={onLeave} data-testid="leave-session-leave">
            {t("session.leave.leave")}
          </button>
        </div>
      </div>
    </div>
  );
}
