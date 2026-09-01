import { useTranslation } from "react-i18next";

type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "up-to-date";

/**
 * About section — version, update status (with inline install button when an
 * update is available), platform/user-agent, and footer tagline. The parent
 * owns the update lifecycle and passes setters / handlers.
 */
export function AboutSection({
  appVersion,
  updateStatus,
  latestVersion,
  onInstallUpdate,
  onCheckUpdate,
}: {
  appVersion: string;
  updateStatus: UpdateStatus;
  latestVersion: string;
  onInstallUpdate: () => void;
  onCheckUpdate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="settings-section about-section">
      <h2>{t("settings.about.title")}</h2>
      <div className="about-info">
        <div className="about-row">
          <span className="about-label">{t("settings.about.version")}</span>
          <span className="about-value">{appVersion}</span>
        </div>
        <div className="about-row">
          <span className="about-label">{t("settings.about.updates")}</span>
          <span className="about-value">
            {updateStatus === "checking" && (
              <span className="update-status">{t("settings.about.checking")}</span>
            )}
            {updateStatus === "available" && (
              <button
                className="update-available-btn"
                onClick={onInstallUpdate}
              >
                {t("settings.about.available", { version: latestVersion })}
              </button>
            )}
            {updateStatus === "downloading" && (
              <span className="update-status">{t("settings.about.updating")}</span>
            )}
            {updateStatus === "up-to-date" && (
              <span className="update-status up-to-date">
                {t("settings.about.upToDate")}
              </span>
            )}
            {updateStatus === "idle" && (
              <button
                className="update-check-btn"
                onClick={onCheckUpdate}
              >
                {t("settings.about.checkUpdates")}
              </button>
            )}
          </span>
        </div>
        <div className="about-row">
          <span className="about-label">{t("settings.about.platform")}</span>
          <span className="about-value">{navigator.platform}</span>
        </div>
        <div className="about-row">
          <span className="about-label">{t("settings.about.userAgent")}</span>
          <span className="about-value about-value-small">
            {navigator.userAgent}
          </span>
        </div>
      </div>
      <div className="about-footer-divider"></div>
      <p className="about-footer">
        {t("settings.about.madeWith", { heart: "♥" })}
      </p>
    </section>
  );
}
