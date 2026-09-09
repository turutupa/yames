import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

/**
 * "You have unsaved changes to this setlist."
 *
 * Leaving a setlist is a one-key gesture now — Escape, or clicking the one
 * you are already on — and one key is exactly the wrong amount of effort to
 * spend losing an afternoon's edits. So the two cheap ways out ask first,
 * and only when there is something to lose: a clean setlist closes silently,
 * because a dialog that always appears is a dialog nobody reads.
 *
 * Saving is offered alongside discarding rather than only underneath it. The
 * common case for "I pressed Escape and it asked" is that you did want to
 * leave and you did want to keep the work, and making that two dialogs — one
 * to cancel, then find Save — would be the app being pedantic at you.
 */
export function LeaveSetlistDialog({
  name,
  onSave,
  onDiscard,
  onCancel,
}: {
  name: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const saveRef = useRef<HTMLButtonElement>(null);

  // Focus lands on Save, which is the recoverable choice. Escape cancels:
  // the key that opened this must not also be the key that discards through
  // it, or holding Escape would throw the work away.
  useEffect(() => {
    saveRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div className="setlist-leave-overlay" onClick={onCancel}>
      <div
        className="setlist-leave-card"
        role="alertdialog"
        aria-modal="true"
        aria-label={t("setlist.leave.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="setlist-leave-title">{t("setlist.leave.title")}</span>
        <p className="setlist-leave-body">{t("setlist.leave.body", { name })}</p>
        <div className="setlist-leave-actions">
          <button ref={saveRef} className="setlist-leave-save" onClick={onSave}>
            {t("setlist.leave.save")}
          </button>
          <button className="setlist-leave-discard" onClick={onDiscard}>
            {t("setlist.leave.discard")}
          </button>
          <button className="setlist-leave-cancel" onClick={onCancel}>
            {t("setlist.leave.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
