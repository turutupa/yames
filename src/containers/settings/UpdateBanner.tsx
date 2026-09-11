import { useTranslation } from "react-i18next";

import type { UpdateStatus } from "../main-window/hooks/useAppUpdates";

const DownloadIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

/**
 * Top-of-settings update banner — clickable "available" state that triggers
 * install, and a passive "downloading" state. Returns null when neither
 * status applies, so the parent can render it unconditionally.
 */
export function UpdateBanner({
  updateStatus,
  latestVersion,
  updateError,
  onInstall,
}: {
  updateStatus: UpdateStatus;
  latestVersion: string;
  /** Whatever the updater said. Not translated — see the note in the banner. */
  updateError?: string | null;
  onInstall: () => void;
}) {
  const { t } = useTranslation();
  if (updateStatus === "available") {
    return (
      <div className="update-banner" onClick={onInstall}>
        <DownloadIcon />
        <span>{t("updateBanner.available", { version: latestVersion || "0.6.0" })}</span>
        <span className="update-banner-action">{t("updateBanner.installRestart")}</span>
      </div>
    );
  }
  if (updateStatus === "downloading") {
    return (
      <div className="update-banner update-banner-downloading">
        <DownloadIcon />
        <span>{t("updateBanner.updating")}</span>
      </div>
    );
  }
  if (updateStatus === "failed") {
    // The reason is shown verbatim rather than translated: it comes from the
    // updater or the OS, and a guessed translation of an error is worse than
    // an untranslated one. Clicking retries.
    return (
      <div className="update-banner update-banner-failed" onClick={onInstall}>
        <DownloadIcon />
        <span>
          {t("updateBanner.failed")}
          {updateError ? ` — ${updateError}` : ""}
        </span>
        <span className="update-banner-action">{t("updateBanner.retry")}</span>
      </div>
    );
  }
  return null;
}
