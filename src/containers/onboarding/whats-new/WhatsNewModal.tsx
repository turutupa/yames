/**
 * The one-time post-upgrade modal. Deliberately small: a heading with the
 * version, the release body when we have one, a link to the full notes, and a
 * single button. Nobody launched a metronome to read a changelog.
 *
 * The body arrives as the raw `notes` string from `latest.json`. It is *not*
 * rendered as markdown — that would mean shipping a parser (and a sanitiser)
 * for text we do not control. Lines are shown verbatim, with a leading
 * "-"/"*" bullet turned into a real list item, which is what release notes
 * actually look like.
 */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "../../../ipc";
import "../../../styles/help.css";

/** GitHub's "latest release" page — same target the update banner links to. */
export const RELEASE_NOTES_URL = "https://github.com/turutupa/yames/releases/latest";

export type WhatsNewModalProps = {
  open: boolean;
  version: string;
  /** Release body, or null when this build was installed outside the updater. */
  notes: string | null;
  onClose: () => void;
  /** False suppresses the entrance animation (OS or app preference). */
  animate?: boolean;
};

/** Split the body into lines, tagging the ones that are bullets. */
export function parseNotes(notes: string): { text: string; bullet: boolean }[] {
  return notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const bullet = /^[-*•]\s+/.test(line);
      return { text: bullet ? line.replace(/^[-*•]\s+/, "") : line, bullet };
    });
}

export function WhatsNewModal({
  open,
  version,
  notes,
  onClose,
  animate = true,
}: WhatsNewModalProps) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    // Capture, so Escape closes this rather than leaving Zen/Settings.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const lines = notes ? parseNotes(notes) : [];

  return (
    <div
      className={`help-overlay${animate ? "" : " no-motion"}`}
      data-testid="whats-new"
      onClick={onClose}
    >
      <div
        className="help-card whats-new-card"
        role="dialog"
        aria-modal="true"
        aria-label={t("whatsNew.title", { version })}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="help-card-title">{t("whatsNew.title", { version })}</h2>

        {lines.length > 0 ? (
          <ul className="whats-new-notes">
            {lines.map((line, i) => (
              <li key={i} className={line.bullet ? "whats-new-bullet" : "whats-new-line"}>
                {line.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="whats-new-fallback">{t("whatsNew.noNotes")}</p>
        )}

        <div className="help-card-actions">
          <button
            type="button"
            className="help-btn help-btn-ghost"
            onClick={() => {
              openUrl(RELEASE_NOTES_URL).catch(() => {});
            }}
          >
            {t("whatsNew.fullNotes")}
          </button>
          <button
            ref={closeRef}
            type="button"
            className="help-btn help-btn-primary"
            onClick={onClose}
          >
            {t("whatsNew.dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
