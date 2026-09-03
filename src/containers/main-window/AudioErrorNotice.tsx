/**
 * What the user sees when the audio thread could not open the output stream.
 *
 * Same pill as the tour offer and the "Pick a voice" toast (top-centre, under
 * the header): a notice that can be read, acted on and dismissed, never a
 * modal. That slot is deliberate — it keeps well clear of the floating play
 * button in the bottom-right, so the transport the user is about to press
 * again is never underneath it.
 *
 * Two shapes, one component:
 *
 *  - `device-in-use` — another app holds the endpoint in WASAPI exclusive
 *    mode. Named, because it is the normal case for someone practising with
 *    an amp sim open, and because there is a real remedy to point at.
 *  - `generic` — anything else. An honest sentence plus the backend's own
 *    reason, rather than a guess.
 *
 * The raw reason is on the element in both shapes (`title`, and a
 * `data-reason` attribute), so it still reaches a bug report even when the
 * message shown is the friendly one.
 */
import { useTranslation } from "react-i18next";
import type { AudioErrorNotice as Notice } from "./audioError";

export type AudioErrorNoticeProps = {
  notice: Notice;
  /** Deep-links to Settings → Devices, where the output picker lives. */
  onOpenSettings: () => void;
  onDismiss: () => void;
};

export function AudioErrorNotice({
  notice,
  onOpenSettings,
  onDismiss,
}: AudioErrorNoticeProps) {
  const { t } = useTranslation();
  return (
    <div
      className="audio-error-notice"
      role="alert"
      data-testid="audio-error-notice"
      data-kind={notice.kind}
      data-reason={notice.reason}
      title={notice.reason}
    >
      <div className="audio-error-notice-body">
        <span className="audio-error-notice-text">{t(notice.messageKey)}</span>
        {/* The hex code is never the headline, but a generic failure has no
            better explanation to offer than the backend's own words. */}
        {notice.kind === "generic" && (
          <span className="audio-error-notice-detail">
            {t("audioError.detail", { reason: notice.reason })}
          </span>
        )}
      </div>
      <button
        type="button"
        className="audio-error-notice-action"
        onClick={onOpenSettings}
      >
        {t("audioError.openSettings")}
      </button>
      <button
        type="button"
        className="audio-error-notice-dismiss"
        onClick={onDismiss}
        aria-label={t("audioError.dismiss")}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </div>
  );
}
