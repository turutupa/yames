/**
 * W7 — Ready (ONBOARDING_PLAN §3, decision 4).
 *
 * A summary of what the setup produced. Every row is a button back to the
 * step that owns it, so a wrong answer is one click from being fixed — rows
 * for steps O2–O5 haven't built yet show the app's *current* setting rather
 * than a placeholder, and jumping to them is a no-op until they register.
 */
import { useTranslation } from "react-i18next";
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
    jumpTo,
    finish,
    onRequestTour,
  } = useWizardEnv();

  const rows: SummaryRow[] = [
    {
      key: "instrument",
      label: t("onboarding.ready.rows.instrument"),
      value: t(`instrument.${instrument}`),
      target: "instrument",
    },
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
  ];

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title" id="onboarding-title">
        {t("onboarding.ready.title")}
      </h2>
      <p className="onboarding-step-subtitle">{t("onboarding.ready.subtitle")}</p>

      <ul className="onboarding-summary">
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              className="onboarding-summary-row"
              onClick={() => jumpTo(row.target)}
            >
              <span className="onboarding-summary-label">{row.label}</span>
              <span className="onboarding-summary-value">{row.value}</span>
            </button>
          </li>
        ))}
        <li>
          <div className="onboarding-summary-row onboarding-summary-static">
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
      </ul>

      <div className="onboarding-welcome-actions">
        <button
          type="button"
          className="onboarding-btn onboarding-btn-primary"
          onClick={finish}
        >
          {t("onboarding.ready.start")}
        </button>
        {onRequestTour && (
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
