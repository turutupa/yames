import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

/**
 * "You have unsaved changes." Asked once, on the way out.
 *
 * This started as the setlist's own dialog on the two doors that CLOSED a
 * setlist, which was the wrong shape: the commonest way to lose work is not
 * closing a thing, it is opening the next one — clicking another setlist, or
 * a preset, while your edits are still only on screen. So it guards an
 * ACTION rather than a screen, and the same dialog serves setlists and
 * presets because the question is identical.
 *
 * That is also why the buttons no longer say "and close". They did while
 * closing was the only thing on the other side of them; now the next step
 * might be another setlist, a preset, or nothing at all, and a label that
 * names the wrong outcome is worse than one that names none.
 *
 * Saving is offered alongside discarding rather than only underneath it. The
 * common case for "it asked" is that you did mean to move on AND did mean to
 * keep the work; making that two dialogs — cancel, then go and find Save —
 * would be the app being pedantic at you.
 */
export function UnsavedChangesDialog({
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

  // Focus lands on Save, the recoverable choice. Escape cancels: one of the
  // doors into this dialog IS Escape, and a key that both asks a question and
  // answers it destructively would throw work away on a double-press.
  useEffect(() => {
    saveRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div className="unsaved-overlay" onClick={onCancel}>
      <div
        className="unsaved-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        aria-describedby="unsaved-body"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="unsaved-head">
          <span className="unsaved-glyph" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.6 21 19H3z" />
              <path d="M12 10v4" />
              <path d="M12 17.2v.01" />
            </svg>
          </span>
          <span className="unsaved-title" id="unsaved-title">
            {t("common.unsaved.title")}
          </span>
        </div>

        <p className="unsaved-body" id="unsaved-body">
          <strong className="unsaved-name">{name}</strong>
          {t("common.unsaved.body")}
        </p>

        <div className="unsaved-actions">
          {/* Keep editing sits apart on the left: it is the way BACK, and the
              two buttons that move you on belong together. */}
          <button className="unsaved-cancel" onClick={onCancel}>
            {t("common.unsaved.cancel")}
          </button>
          <span className="unsaved-spacer" />
          <button className="unsaved-discard" onClick={onDiscard}>
            {t("common.unsaved.discard")}
          </button>
          <button ref={saveRef} className="unsaved-save" onClick={onSave}>
            {t("common.unsaved.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
