/**
 * W0 — Welcome (ONBOARDING_PLAN §3).
 *
 * Two decisions and nothing else: "Set me up" walks the flow, "Just give me
 * the click" closes straight onto a working metronome (principle 1 — audible
 * click in under ten seconds). The mark pulses with the soft preview click so
 * the app demonstrates itself before it explains anything.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWizardEnv } from "../WizardContext";
import type { WizardStepProps } from "./types";

export function WelcomeStep({ isActive }: WizardStepProps) {
  const { t } = useTranslation();
  const {
    appVersion,
    beatTick,
    softClickPlaying,
    startSetup,
    skipAll,
    startSoftClick,
  } = useWizardEnv();
  const [pulse, setPulse] = useState(false);

  // Start the preview click as soon as W0 is on screen. `startSoftClick` is
  // idempotent, so re-entering W0 from Settings doesn't stack playbacks.
  useEffect(() => {
    if (isActive) startSoftClick();
  }, [isActive, startSoftClick]);

  // Pulse for one beat period-ish; the class is dropped on a timer rather
  // than an animation event so reduced-motion (no animation) still clears it.
  useEffect(() => {
    if (!beatTick || !softClickPlaying) return;
    setPulse(true);
    const id = setTimeout(() => setPulse(false), 160);
    return () => clearTimeout(id);
  }, [beatTick, softClickPlaying]);

  return (
    <div className="onboarding-welcome">
      <div
        className={`onboarding-logo${pulse ? " pulsing" : ""}`}
        aria-hidden="true"
      >
        <svg
          width="52"
          height="52"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>
      <h1 className="onboarding-welcome-title" id="onboarding-title">
        {t("onboarding.welcome.title")}
      </h1>
      <p className="onboarding-welcome-tagline">
        {t("onboarding.welcome.tagline")}
      </p>
      <div className="onboarding-welcome-actions">
        <button
          type="button"
          className="onboarding-btn onboarding-btn-primary"
          onClick={startSetup}
        >
          {t("onboarding.welcome.setup")}
        </button>
        <button
          type="button"
          className="onboarding-btn onboarding-btn-ghost"
          onClick={skipAll}
        >
          {t("onboarding.welcome.skip")}
        </button>
      </div>
      <p className="onboarding-welcome-footer">
        {t("onboarding.welcome.footer", { version: appVersion })}
      </p>
    </div>
  );
}
