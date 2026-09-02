/**
 * W1 — Instrument (ONBOARDING_PLAN §3).
 *
 * The first-launch picker's grid, hosted in the wizard frame. Picking
 * persists immediately (through the env's `setInstrument`, which writes the
 * store and pushes the profile to the DSP backend) and advances; skipping
 * leaves the electric-guitar fallback the app has always used.
 */
import { useTranslation } from "react-i18next";
import { InstrumentPickerGrid } from "../../../components/InstrumentPickerModal";
import { useWizardEnv } from "../WizardContext";
import type { WizardStepProps } from "./types";

export function InstrumentStep({ onNext }: WizardStepProps) {
  const { t } = useTranslation();
  const { instrument, instrumentChosen, setInstrument } = useWizardEnv();
  // On a true first run nothing is chosen yet — pre-highlighting the
  // electric-guitar fallback would be a lie. Highlight only a real choice.
  const chosen = instrumentChosen ? instrument : undefined;

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title" id="onboarding-title">
        {t("instrumentPicker.title")}
      </h2>
      <p className="onboarding-step-subtitle">{t("instrumentPicker.subtitle")}</p>
      <InstrumentPickerGrid
        selectedId={chosen}
        onPick={(id) => {
          setInstrument(id);
          onNext();
        }}
      />
    </div>
  );
}
