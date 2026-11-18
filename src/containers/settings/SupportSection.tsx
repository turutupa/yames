import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SHARE_OPTIONS, SHARE_URL } from "../../constants/metronome";
import { openFeedback, openUrl } from "../../ipc";
import { ShareIcon } from "../main-window/ShareMenuPopover";
import { ExportPracticeButton } from "../session/ExportPracticeButton";

type ShareOption = (typeof SHARE_OPTIONS)[number];

const GITHUB_URL = "https://github.com/turutupa/yames";
const COFFEE_URL = "https://buymeacoffee.com/turutupa";

const FeedbackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="M8 9h8M8 13h5" />
  </svg>
);

const HeartIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const GitHubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

const GlobeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

/** "Opens in your browser": the corner arrow every outbound card carries. */
const OutIcon = () => (
  <svg className="support-link-out" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

function LinkCard({
  icon,
  title,
  hint,
  onClick,
  tone,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  tone?: "heart";
}) {
  return (
    <button className={`support-link${tone ? ` support-link-${tone}` : ""}`} onClick={onClick}>
      <span className="support-link-icon">{icon}</span>
      <span className="support-link-text">
        <span className="support-link-title">{title}</span>
        <span className="support-link-hint">{hint}</span>
      </span>
      <OutIcon />
    </button>
  );
}

/**
 * Support (settings polish, 2026-11-18). The owner: "the Support and the
 * About could use some help". It was a stack of equal buttons and paragraphs,
 * so "Send feedback" (the one thing a tester comes here for) weighed the same
 * as "Reddit". Now, in order of how much it matters:
 *
 *   1. Send feedback — the panel's one primary action, with what it does.
 *   2. Export my practice data — a secondary row; it is what a tester
 *      attaches to that feedback, so it sits right under it. It moved here
 *      from Progress.
 *   3. Support the project — three outbound cards (coffee, GitHub, website).
 *   4. Share — one row of quiet chips.
 *
 * Nothing is sent from here: every outbound action opens the browser.
 */
export function SupportSection({
  shareTooltip,
  onShareOption,
  appVersion = "",
}: {
  shareTooltip: boolean;
  onShareOption: (opt: ShareOption) => void;
  /** Goes into the feedback issue, and is said beside the button. */
  appVersion?: string;
}) {
  const { t, i18n } = useTranslation();
  return (
    <section className="settings-section support-section" id="settings-support">
      <h2>{t("settings.support.title")}</h2>

      {/* Testers first: what happened, in their words, with the version and
          OS already filled in. A GitHub issue in their browser, which they
          submit or don't; nothing is sent from here. */}
      <div className="support-feedback" data-testid="settings-feedback">
        <span className="support-feedback-icon">
          <FeedbackIcon />
        </span>
        <div className="support-feedback-body">
          <h3 className="support-feedback-title">{t("settings.feedback.title")}</h3>
          <p className="support-feedback-blurb">{t("settings.feedback.blurb")}</p>
          <p className="support-feedback-note">
            {t("settings.feedback.note", { version: appVersion })}
          </p>
        </div>
        <button
          className="support-primary-btn"
          data-testid="settings-send-feedback"
          onClick={() => void openFeedback(appVersion, i18n.language).catch(() => {})}
        >
          {t("settings.feedback.button")}
        </button>
      </div>

      {/* The practice data a tester can attach to that issue: a file they
          save and choose to attach, never sent from here. */}
      <ExportPracticeButton appVersion={appVersion} className="toggle-btn" layout="row" />

      <h3 className="settings-subhead">{t("settings.support.supportTitle")}</h3>
      <p className="settings-section-intro">{t("settings.support.blurb")}</p>
      <div className="support-links">
        <LinkCard
          icon={<HeartIcon />}
          tone="heart"
          title={t("settings.support.buyCoffee")}
          hint={t("settings.support.coffeeHint")}
          onClick={() => void openUrl(COFFEE_URL)}
        />
        <LinkCard
          icon={<GitHubIcon />}
          title="GitHub"
          hint={t("settings.support.githubHint")}
          onClick={() => void openUrl(GITHUB_URL)}
        />
        <LinkCard
          icon={<GlobeIcon />}
          title={t("settings.support.website")}
          hint="yames.app"
          onClick={() => void openUrl(SHARE_URL)}
        />
      </div>

      <h3 className="settings-subhead">{t("settings.support.shareTitle")}</h3>
      <p className="settings-section-intro">{t("settings.support.sharePrompt")}</p>
      <div className="support-share">
        {SHARE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            className={`support-share-chip${opt.id === "copy" && shareTooltip ? " copied" : ""}`}
            onClick={() => onShareOption(opt)}
          >
            <ShareIcon id={opt.id} size={15} />
            {opt.id === "copy"
              ? shareTooltip
                ? t("tooltip.copied")
                : t("settings.support.copyLink")
              : opt.label}
          </button>
        ))}
      </div>
    </section>
  );
}
