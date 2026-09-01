import { useTranslation } from "react-i18next";
import { SHARE_OPTIONS, SHARE_URL } from "../../constants/metronome";
import { openUrl } from "../../ipc";
import { ShareIcon } from "../main-window/ShareMenuPopover";

type ShareOption = (typeof SHARE_OPTIONS)[number];

/**
 * Support section — donation links (Buy Me Coffee, GitHub, Website) plus a
 * row of share buttons that copy or open social-share URLs. The parent owns
 * share-handling logic (clipboard, tooltip) and passes a callback per option.
 */
export function SupportSection({
  shareTooltip,
  onShareOption,
}: {
  shareTooltip: boolean;
  onShareOption: (opt: ShareOption) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="settings-section about-section support-card">
      <h2>{t("settings.support.title")}</h2>
      <p className="about-text">
        {t("settings.support.blurb")}
      </p>
      <div className="about-links">
        <button
          className="about-link-btn support-btn"
          onClick={() => openUrl("https://buymeacoffee.com/turutupa")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {t("settings.support.buyCoffee")}
        </button>
        <button
          className="about-link-btn"
          onClick={() => openUrl("https://github.com/turutupa/yames")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
          GitHub
        </button>
        <button
          className="about-link-btn"
          onClick={() => openUrl(SHARE_URL)}
        >
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
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          {t("settings.support.website")}
        </button>
      </div>
      <p className="about-text" style={{ marginTop: 16 }}>
        {t("settings.support.sharePrompt")}
      </p>
      <div className="about-links share-row">
        {SHARE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            className={`about-link-btn share-btn${opt.id === "copy" && shareTooltip ? " copied" : ""}`}
            onClick={() => onShareOption(opt)}
          >
            <ShareIcon id={opt.id} size={16} />
            {opt.id === "copy" && shareTooltip ? t("tooltip.copied") : opt.label}
          </button>
        ))}
      </div>
    </section>
  );
}
