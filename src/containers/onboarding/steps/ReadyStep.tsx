/**
 * W7 — Ready (ONBOARDING_PLAN §3, decision 4).
 *
 * A summary of what the setup produced. Every row is a button back to the
 * step that owns it, so a wrong answer is one click from being fixed — rows
 * for steps O2–O5 haven't built yet show the app's *current* setting rather
 * than a placeholder, and jumping to them is a no-op until they register.
 */
import { useTranslation } from "react-i18next";
import { IS_MOBILE } from "../../../platform";
import { getThemeById } from "../../../themes";
import { useWizardEnv } from "../WizardContext";
import type { StepId } from "../onboardingMachine";
import type { WizardStepProps } from "./types";

type SummaryRow = {
  key: string;
  label: string;
  value: string;
  target: StepId;
};

export function ReadyStep(_props: WizardStepProps) {
  const { t } = useTranslation();
  const {
    instrument,
    soundType,
    themeId,
    coachTier,
    inputDeviceName,
    hasFootswitch,
    alwaysOnTop,
    setAlwaysOnTop,
    availableSteps,
    jumpTo,
    finish,
    onRequestTour,
  } = useWizardEnv();

  const rows: SummaryRow[] = [
    // A phone never asks the instrument question (M03d, plan §1: nothing on
    // mobile consumes the answer), so a summary row for it would be reporting
    // a setup step the user was never offered — the same "greyed out for a
    // feature that isn't there" the mobile plan forbids, applied to a summary
    // instead of a tile.
    ...(IS_MOBILE
      ? []
      : ([
          {
            key: "instrument",
            label: t("onboarding.ready.rows.instrument"),
            value: t(`instrument.${instrument}`),
            target: "instrument",
          },
        ] as SummaryRow[])),
    {
      key: "sound",
      label: t("onboarding.ready.rows.sound"),
      value: t(`sound.${soundType}`),
      target: "sound-look",
    },
    {
      key: "theme",
      label: t("onboarding.ready.rows.theme"),
      value: getThemeById(themeId).name,
      target: "sound-look",
    },
    // Three rows for three steps a phone does not have: the footswitch, the
    // practice coach and the microphone. M02 cut the steps; the summary was
    // still reporting their settings, so a phone showed "Practice coach:
    // Timing feedback only" and "Audio input: Not set up" -- greyed-out
    // status for features that are not in the build, which is the one thing
    // the mobile plan's §1 forbids by name. A summary of a setup you were
    // never offered is not a summary.
    ...(IS_MOBILE
      ? []
      : ([
          {
            key: "control",
            label: t("onboarding.ready.rows.control"),
            value: hasFootswitch
              ? t("onboarding.ready.controlFootswitch")
              : t("onboarding.ready.controlKeyboard"),
            target: "hands-free",
          },
          {
            key: "coach",
            label: t("onboarding.ready.rows.coach"),
            value:
              coachTier === "off"
                ? t("onboarding.ready.coachTiming")
                : t("onboarding.ready.coachOn"),
            target: "coach",
          },
          {
            key: "input",
            label: t("onboarding.ready.rows.input"),
            value: inputDeviceName || t("onboarding.ready.inputNone"),
            target: "audio-input",
          },
        ] as SummaryRow[])),
  ];

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title" id="onboarding-title">
        {t("onboarding.ready.title")}
      </h2>
      <p className="onboarding-step-subtitle">{t("onboarding.ready.subtitle")}</p>

      <ul className="onboarding-summary">
        {rows.map((row) => {
          // A row is only a button when the step it points at exists on this
          // run. Rows for steps O2–O5 have yet to add stay static — a
          // clickable-looking row that does nothing is worse than plain text.
          const reachable = availableSteps.includes(row.target);
          const body = (
            <>
              <span className="onboarding-summary-label">{row.label}</span>
              <span className="onboarding-summary-value">{row.value}</span>
            </>
          );
          return (
            <li key={row.key}>
              {reachable ? (
                <button
                  type="button"
                  className="onboarding-summary-row"
                  onClick={() => jumpTo(row.target)}
                >
                  {body}
                </button>
              ) : (
                <div className="onboarding-summary-row onboarding-summary-static">
                  {body}
                </div>
              )}
            </li>
          );
        })}
        {/* A phone has one fullscreen webview — nothing to stay on top of. */}
        {!IS_MOBILE && (
          <li>
            <div className="onboarding-summary-row onboarding-summary-static onboarding-summary-toggle">
              <span className="onboarding-summary-label">
                {t("onboarding.ready.alwaysOnTop")}
              </span>
              <button
                type="button"
                className={`toggle-btn ${alwaysOnTop ? "active" : ""}`}
                aria-pressed={alwaysOnTop}
                onClick={() => setAlwaysOnTop(!alwaysOnTop)}
              >
                {alwaysOnTop ? t("common.on") : t("common.off")}
              </button>
            </div>
          </li>
        )}
      </ul>

      <div className="onboarding-ready-actions">
        <button
          type="button"
          className="onboarding-btn onboarding-btn-primary"
          onClick={finish}
        >
          {t("onboarding.ready.start")}
        </button>
        {/* The tour is written around a desktop layout and its hotkeys, and
            is cut on a phone (plan §1) -- Settings already drops its "Take
            the tour" row. An offer that leads nowhere belongs nowhere. */}
        {!IS_MOBILE && onRequestTour && (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-ghost"
            onClick={onRequestTour}
          >
            {t("onboarding.ready.tour")}
          </button>
        )}
      </div>
    </div>
  );
}
