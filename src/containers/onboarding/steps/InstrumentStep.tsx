/**
 * W1 — Instrument (ONBOARDING_PLAN §3).
 *
 * The first-launch picker's grid, hosted in the wizard frame.
 *
 * Selection is never navigation (see `types.ts`): clicking a card only
 * highlights it and enables Next. The choice is persisted — through the
 * env's `setInstrument`, which writes the store and pushes the profile to
 * the DSP backend — by the commit the shell runs when the user actually
 * advances. Skipping persists nothing and leaves the electric-guitar
 * fallback the app has always used.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstrumentPickerGrid } from "../../../components/InstrumentPickerModal";
import { useWizardEnv } from "../WizardContext";
import type { WizardStepProps } from "./types";

export function InstrumentStep(_props: WizardStepProps) {
  const { t } = useTranslation();
  const {
    instrument,
    instrumentChosen,
    setInstrument,
    setStepCommit,
    setNextEnabled,
  } = useWizardEnv();
  // On a true first run nothing is chosen yet — pre-highlighting the
  // electric-guitar fallback would be a lie. On a re-run (the chip, or a W7
  // summary row) the live instrument starts selected.
  const [staged, setStaged] = useState<string | undefined>(() =>
    instrumentChosen ? instrument : undefined,
  );

  useEffect(() => {
    setNextEnabled(staged !== undefined);
    setStepCommit(staged ? () => setInstrument(staged) : null);
  }, [staged, setNextEnabled, setStepCommit, setInstrument]);

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title" id="onboarding-title">
        {t("instrumentPicker.title")}
      </h2>
      <p className="onboarding-step-subtitle">{t("instrumentPicker.subtitle")}</p>
      <InstrumentPickerGrid selectedId={staged} onPick={setStaged} />
    </div>
  );
}
