import { useTranslation } from "react-i18next";

type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "up-to-date";

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
  onInstall,
}: {
  updateStatus: UpdateStatus;
  latestVersion: string;
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
  return null;
}
