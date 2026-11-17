import { useTranslation } from "react-i18next";

/**
 * "Test build X is ready — Update", in the notice slot under the header (the
 * same pill as the audio-error notice and the voice toast, and its styles).
 * Test builds only; see `useBetaPrompt` for when it appears.
 */
export function BetaUpdateNotice({
  version,
  busy,
  progress,
  onUpdate,
  onDismiss,
}: {
  version: string;
  /** Downloading / installing: the button becomes a status line. */
  busy: boolean;
  /** 0..1 when known. */
  progress?: number | null;
  onUpdate: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="audio-error-notice beta-update-notice"
      role="status"
      data-testid="beta-update-notice"
    >
      <div className="audio-error-notice-body">
        <span className="audio-error-notice-text">
          {t("settings.about.betaReady", { version })}
        </span>
        {busy && (
          <span className="audio-error-notice-detail">
            {typeof progress === "number"
              ? t("settings.about.betaDownloadingPercent", {
                  percent: Math.round(progress * 100),
                })
              : t("settings.about.betaDownloading")}
          </span>
        )}
      </div>
      {!busy && (
        <button type="button" className="audio-error-notice-action" onClick={onUpdate}>
          {t("settings.about.betaUpdate")}
        </button>
      )}
      <button
        type="button"
        className="audio-error-notice-dismiss"
        onClick={onDismiss}
        aria-label={t("settings.about.betaLater")}
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
