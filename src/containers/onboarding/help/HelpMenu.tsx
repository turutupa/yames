/**
 * The Help menu behind the header `?` (and Cmd/Ctrl-/).
 *
 * Every entry is optional in the "the feature is not mounted" sense: the tour
 * (O6) and "Run setup again" (O1) only appear when the host actually passes a
 * handler, so a build without them shows a shorter menu rather than a dead
 * item. Version is not a button at all — it is the footer, because the reason
 * anyone looks for it is to type it into a bug report.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SHARE_URL } from "../../../constants/metronome";
import { openUrl } from "../../../ipc";
import "../../../styles/help.css";

export type HelpMenuProps = {
  open: boolean;
  onClose: () => void;
  appVersion: string;
  /** O6's spotlight tour. Omit to hide the item. */
  onTakeTour?: () => void;
  /** O1's wizard. Omit to hide the item. */
  onRunSetupAgain?: () => void;
  /** Always present — the sheet is part of this feature. */
  onShowShortcuts: () => void;
  /**
   * Writes the diagnostics bundle and resolves with its path, which is shown
   * under the item so the user can attach it to an issue. Omit to hide.
   */
  onReportProblem?: () => Promise<string>;
  /** False suppresses the entrance animation. */
  animate?: boolean;
};

const TourIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
);

const SetupIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
    <polyline points="21 3 21 8 16 8" />
    <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
    <polyline points="3 21 3 16 8 16" />
  </svg>
);

const KeyboardIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M6 16h12" />
  </svg>
);

const BugIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="8" y="6" width="8" height="14" rx="4" />
    <path d="M8 11H4M20 11h-4M8 16H4.5M20 16h-3.5M9 6.5 7.5 4M15 6.5 16.5 4" />
  </svg>
);

const GlobeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

export function HelpMenu({
  open,
  onClose,
  appVersion,
  onTakeTour,
  onRunSetupAgain,
  onShowShortcuts,
  onReportProblem,
  animate = true,
}: HelpMenuProps) {
  const { t } = useTranslation();
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const [reportState, setReportState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [reportPath, setReportPath] = useState("");

  useEffect(() => {
    if (!open) {
      setReportState("idle");
      setReportPath("");
      return;
    }
    firstItemRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  // The first rendered item takes focus; tracked with a flag rather than an
  // index because which items exist varies with the build.
  let firstAssigned = false;
  const focusRef = () => {
    if (firstAssigned) return undefined;
    firstAssigned = true;
    return firstItemRef;
  };

  return (
    <div
      className={`help-overlay${animate ? "" : " no-motion"}`}
      data-testid="help-menu"
      onClick={onClose}
    >
      <div
        className="help-card help-menu-card"
        role="dialog"
        aria-modal="true"
        aria-label={t("onboarding.help.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="help-card-title">{t("onboarding.help.title")}</h2>

        <ul className="help-menu-list">
          {onTakeTour && (
            <li>
              <button
                ref={focusRef()}
                type="button"
                className="help-menu-item"
                onClick={() => {
                  onClose();
                  onTakeTour();
                }}
              >
                <TourIcon />
                <span>{t("onboarding.help.takeTour")}</span>
              </button>
            </li>
          )}
          {onRunSetupAgain && (
            <li>
              <button
                ref={focusRef()}
                type="button"
                className="help-menu-item"
                onClick={() => {
                  onClose();
                  onRunSetupAgain();
                }}
              >
                <SetupIcon />
                <span>{t("onboarding.help.runSetup")}</span>
              </button>
            </li>
          )}
          <li>
            <button
              ref={focusRef()}
              type="button"
              className="help-menu-item"
              onClick={onShowShortcuts}
            >
              <KeyboardIcon />
              <span>{t("onboarding.help.shortcuts")}</span>
            </button>
          </li>
          {onReportProblem && (
            <li>
              <button
                ref={focusRef()}
                type="button"
                className="help-menu-item"
                disabled={reportState === "working"}
                onClick={() => {
                  setReportState("working");
                  onReportProblem()
                    .then((path) => {
                      setReportPath(path);
                      setReportState("done");
                    })
                    .catch(() => setReportState("error"));
                }}
              >
                <BugIcon />
                <span>{t("onboarding.help.reportProblem")}</span>
              </button>
              {reportState === "working" && (
                <p className="help-menu-note">{t("onboarding.help.reportWorking")}</p>
              )}
              {reportState === "done" && (
                <p className="help-menu-note" data-testid="help-report-path">
                  {t("onboarding.help.reportDone")}
                  <span className="help-menu-path">{reportPath}</span>
                </p>
              )}
              {reportState === "error" && (
                <p className="help-menu-note help-menu-note-error">
                  {t("onboarding.help.reportError")}
                </p>
              )}
            </li>
          )}
          <li>
            <button
              ref={focusRef()}
              type="button"
              className="help-menu-item"
              onClick={() => {
                openUrl(SHARE_URL).catch(() => {});
              }}
            >
              <GlobeIcon />
              <span>{t("onboarding.help.website")}</span>
            </button>
          </li>
        </ul>

        <div className="help-menu-footer">
          <span className="help-menu-version">
            {t("onboarding.help.version", { version: appVersion })}
          </span>
          <button type="button" className="help-btn help-btn-ghost" onClick={onClose}>
            {t("onboarding.help.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
