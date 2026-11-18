import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * "Leave this Session?" Asked by Escape and by Exit alike once there is
 * anything to lose: Takes in this Session, or a block running (UX audit NAV-2,
 * acceptance P2-1, P2-2). `saved` says which: with Takes it says they are
 * kept; without, that only what is running stops.
 *
 * Its own keys, in the capture phase so the Session's never see them: Escape
 * stays (a key that both asked and answered would be no question). "Keep
 * going" has the focus (acceptance P2-3), so Enter, a pedal's press or a
 * stray Space stays; leaving is a deliberate move to the other button.
 * Tab stays inside it, and the focus goes back where it was when it closes
 * (acceptance pass 3 P2-5).
 */
export function LeaveSessionDialog({
  onLeave,
  onStay,
  saved = true,
}: {
  onLeave: () => void;
  onStay: () => void;
  /** Takes in this Session are kept, and the body says so. */
  saved?: boolean;
}) {
  const { t } = useTranslation();
  const stayRef = useRef<HTMLButtonElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);
  // Whatever had the focus before the dialog (Exit, or the Session's big
  // button behind an Escape) gets it back when the dialog closes.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null,
  );
  useEffect(
    () => () => {
      if (opener && opener.isConnected) opener.focus();
    },
    [opener],
  );
  useEffect(() => {
    stayRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        // A modal keeps the focus (acceptance pass 3 P2-5): Tab and Shift+Tab
        // go round its two buttons, never on to the Session behind it.
        e.preventDefault();
        e.stopPropagation();
        const order = [stayRef.current, leaveRef.current].filter((b): b is HTMLButtonElement => !!b);
        const at = order.indexOf(document.activeElement as HTMLButtonElement);
        const next = at === -1 ? 0 : (at + (e.shiftKey ? order.length - 1 : 1)) % order.length;
        order[next]?.focus();
      } else if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onStay();
      } else if (e.key === "Enter" || e.key === " ") {
        // The focused button's answer, and never the Session's "next thing".
        e.stopPropagation();
        e.preventDefault();
        if (document.activeElement === leaveRef.current) onLeave();
        else onStay();
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
          {t(saved ? "session.leave.body" : "session.leave.bodyNothingSaved")}
        </p>
        <div className="unsaved-actions">
          <button ref={stayRef} className="unsaved-cancel" onClick={onStay} data-testid="leave-session-stay">
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
