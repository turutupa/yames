import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "../../ipc";
import { IS_BETA, IS_MOBILE, SAYS_WHEN_NEWER } from "../../platform";
import { NO_ANDROID_BETA, type AndroidBetaUpdate } from "../../beta/useAndroidBetaUpdate";

import type { UpdateStatus } from "../main-window/hooks/useAppUpdates";
import { NEVER_NEWER, type NewerVersion } from "../main-window/hooks/useNewerVersion";

const LICENSE_URL = "https://github.com/turutupa/yames/blob/main/LICENSE";

/**
 * About (settings polish, 2026-11-18): a summary card — the name, the version,
 * the channel and the updater — then the diagnostics folded away behind
 * "Technical details" with a copy button, then credits and licences.
 *
 * It used to be a table whose loudest row was a raw user-agent string in
 * monospace: something a musician cannot act on, shown above the one line
 * they might need. The diagnostics are still one click away, and copy as a
 * block to paste into a bug report. The parent owns the update lifecycle and
 * passes setters / handlers.
 */
export function AboutSection({
  appVersion,
  updateStatus,
  latestVersion,
  newerVersion = NEVER_NEWER,
  androidBeta = NO_ANDROID_BETA,
  onInstallUpdate,
  onCheckUpdate,
}: {
  appVersion: string;
  updateStatus: UpdateStatus;
  latestVersion: string;
  /** Empty on every build but the phone one from yames.app (M11). */
  newerVersion?: NewerVersion;
  /** The Android test build's own updater; idle everywhere else. */
  androidBeta?: AndroidBetaUpdate;
  onInstallUpdate: () => void;
  onCheckUpdate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="settings-section about-section" id="settings-about">
      <h2>{t("settings.about.title")}</h2>
      <div className="about-info">
        {/* A newer version exists, and this app is the one nobody updates for
            you — installed from the website, where there is no store behind
            it. One quiet line at the top of About: no dialog, no banner over
            the metronome, nothing that arrives in the middle of practising.
            "Not now" quiets this version and only this version; the next one
            gets to speak for itself.

            `SAYS_WHEN_NEWER &&` and not just the value: the constant is
            known at build time, so on a store build this whole block — its
            markup, its class names and the three keys it asks i18n for — is
            dead code and Rollup takes it out of `dist/` along with the hook
            behind it. `scripts/check-mobile-bundle.mjs` is the gate. */}
        {SAYS_WHEN_NEWER && newerVersion.newest && (
          <div className="about-newer">
            <span className="about-newer-said">
              {t("settings.about.newerOut", { version: newerVersion.newest })}
            </span>
            <button
              type="button"
              className="about-newer-get"
              onClick={newerVersion.getIt}
            >
              {t("settings.about.getIt")}
            </button>
            <button
              type="button"
              className="about-newer-hide"
              onClick={newerVersion.hide}
            >
              {t("settings.about.notNow")}
            </button>
          </div>
        )}
        <div className="about-summary">
          <span className="about-mark" aria-hidden="true">Y</span>
          <div className="about-summary-text">
            <span className="about-summary-name">Yames</span>
            <span className="about-summary-meta">
              <span className="about-summary-version">
                {t("settings.about.version")} {appVersion}
              </span>
              {/* A test build says so, next to its version, on every
                  platform: "which build are you on" is the first question
                  about a bug. */}
              {IS_BETA ? (
                <span className="about-channel about-channel-beta" data-testid="about-channel">
                  {t("settings.about.channelBeta")}
                </span>
              ) : (
                <span className="about-channel">{t("settings.about.channelStable")}</span>
              )}
            </span>
          </div>
        {/* The Android test build updates itself from the beta feed; a store
            build has the store, and the website's build the line above. */}
        {IS_BETA && IS_MOBILE && (
          <div className="about-summary-update" data-testid="about-beta-updates">
            <span className="about-update-line">
              {androidBeta.status === "checking" && (
                <span className="update-status">{t("settings.about.checking")}</span>
              )}
              {androidBeta.status === "downloading" && (
                <span className="update-status">
                  {typeof androidBeta.progress === "number"
                    ? t("settings.about.betaDownloadingPercent", {
                        percent: Math.round(androidBeta.progress * 100),
                      })
                    : t("settings.about.betaDownloading")}
                </span>
              )}
              {androidBeta.status === "installing" && (
                <span className="update-status">{t("settings.about.betaInstalling")}</span>
              )}
              {androidBeta.status === "needs-permission" && (
                <span className="update-status">{t("settings.about.betaAllowInstalls")}</span>
              )}
              {androidBeta.status === "up-to-date" && (
                <span className="update-status up-to-date">{t("settings.about.upToDate")}</span>
              )}
              {androidBeta.status === "check-failed" && (
                <span className="update-status" title={androidBeta.error ?? undefined}>
                  {t("settings.about.betaCheckFailed")}
                </span>
              )}
              {androidBeta.status === "failed" && (
                <span className="update-status" title={androidBeta.error ?? undefined}>
                  {t("settings.about.betaFailed")}
                </span>
              )}
              {androidBeta.version &&
                (androidBeta.status === "available" ||
                  androidBeta.status === "needs-permission" ||
                  androidBeta.status === "failed") && (
                  <button className="update-available-btn" onClick={androidBeta.update}>
                    {t("settings.about.available", { version: androidBeta.version })}
                  </button>
                )}
              {(androidBeta.status === "idle" ||
                androidBeta.status === "up-to-date" ||
                (androidBeta.status === "failed" && !androidBeta.version)) && (
                <button className="update-check-btn" onClick={androidBeta.check}>
                  {t(
                    androidBeta.status === "idle"
                      ? "settings.about.checkUpdates"
                      : "settings.about.checkAgain",
                  )}
                </button>
              )}
            </span>
          </div>
        )}
        {/* The store updates a phone app; there is no in-app check. */}
        {!IS_MOBILE && (
          <div className="about-summary-update">
            <span className="about-update-line">
              {/*
                The row says what is known, and — unless something is actually
                in flight — offers the check again.

                It used to offer it only in "idle", so the first click was the
                last one available: a check that came back up to date replaced
                the button with the words "up to date" and left no way to ask
                a second time, for the rest of the session. The owner: "once a
                user clicks on it, there's no way of re-triggering that button,
                it disappears." A release published five minutes later was
                unreachable without restarting the app.

                "checking" and "downloading" are the two states where asking
                again means nothing, so they are the two without a button.
                "failed" had no arm at all and rendered an empty row.
              */}
              {updateStatus === "checking" && (
                <span className="update-status">{t("settings.about.checking")}</span>
              )}
              {updateStatus === "downloading" && (
                <span className="update-status">{t("settings.about.updating")}</span>
              )}
              {updateStatus === "available" && (
                <button
                  className="update-available-btn"
                  onClick={onInstallUpdate}
                >
                  {t("settings.about.available", { version: latestVersion })}
                </button>
              )}
              {updateStatus === "up-to-date" && (
                <span className="update-status up-to-date">
                  {t("settings.about.upToDate")}
                </span>
              )}
              {updateStatus === "failed" && (
                <span className="update-status">{t("settings.about.failed")}</span>
              )}
              {(updateStatus === "idle" ||
                updateStatus === "up-to-date" ||
                updateStatus === "failed") && (
                <button
                  className="update-check-btn"
                  onClick={onCheckUpdate}
                >
                  {t(
                    updateStatus === "idle"
                      ? "settings.about.checkUpdates"
                      : "settings.about.checkAgain",
                  )}
                </button>
              )}
            </span>
          </div>
        )}
        {/* Two rows of diagnostics, for a desktop bug report. On a phone
            `navigator.platform` reads "Linux armv8l" and the user agent is
            four lines naming the browser engine and the word every string a
            musician reads is forbidden to contain -- and neither is anything
            they could act on or would paste anywhere. Musicians, not
            developers (mobile plan §1). The version above is the one line
            that matters for "which build am I on", and it stays. */}
        </div>
        {!IS_MOBILE && <TechnicalDetails appVersion={appVersion} />}
      </div>
      <h3 className="settings-subhead">{t("settings.about.credits")}</h3>
      <p className="about-license">
        {t("settings.about.license")}{" "}
        <button type="button" className="about-inline-link" onClick={() => void openUrl(LICENSE_URL)}>
          {t("settings.about.licenseLink")}
        </button>
      </p>
      {/*
        Where the drums came from. The two recorded kits are other people's
        work under licences that ask to be named, and one of those licences
        (CC BY 4.0, for the Studio kit) makes naming them a condition rather
        than a courtesy — so the line is here, in the About screen, where the
        rest of what this app is made of is written down. The kit names, the
        people and the licence ids are not translated: they are what they are
        called.
      */}
      <p className="about-sounds">
        <span className="about-sounds-title">{t("settings.about.sounds")}</span>{" "}
        {t("settings.about.soundsCredit")}{" "}
        {/* W28 — and the General MIDI set behind every other instrument in a
            song. Apache-2.0, which asks for the notice to travel with it, so
            it travels here beside the two kits and in `LICENSE`. */}
        {t("settings.about.soundsCreditSongs")}
      </p>
      <p className="about-footer">
        {t("settings.about.madeWith", { heart: "♥" })}
      </p>
    </section>
  );
}

/**
 * Platform and user agent, folded away (desktop only — see the note above
 * its call). "Copy" puts the three lines on the clipboard as one block, the
 * way they go into a bug report.
 */
function TechnicalDetails({ appVersion }: { appVersion: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const lines = [
    `Yames ${appVersion}`,
    `${t("settings.about.platform")}: ${navigator.platform}`,
    `${t("settings.about.userAgent")}: ${navigator.userAgent}`,
  ];
  const copy = () => {
    void navigator.clipboard
      ?.writeText(lines.join("\n"))
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  };
  return (
    <details className="about-tech" data-testid="about-technical">
      <summary className="about-tech-summary">
        <svg className="about-tech-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        {t("settings.about.technical")}
      </summary>
      <div className="about-tech-body">
        <dl className="about-tech-list">
          <dt>{t("settings.about.platform")}</dt>
          <dd>{navigator.platform}</dd>
          <dt>{t("settings.about.userAgent")}</dt>
          <dd className="about-tech-mono">{navigator.userAgent}</dd>
        </dl>
        <button type="button" className="toggle-btn about-tech-copy" onClick={copy}>
          {copied ? t("tooltip.copied") : t("settings.about.copy")}
        </button>
      </div>
    </details>
  );
}
