/**
 * W1 — Instrument (ONBOARDING_PLAN §3), guitar first (owner, 2026-11-17).
 *
 * The Paths, the planner and every Session are written for guitar, so the
 * first run offers the two guitars and nothing else. Bass, drums and piano are
 * still in Settings, and the tools follow them there; the line under the cards
 * says so.
 *
 * Selection is never navigation (see `types.ts`): clicking a card only
 * highlights it. The choice is persisted — through the env's `setInstrument`,
 * which writes the store and pushes the profile to the DSP backend — by the
 * commit the shell runs when the user actually advances.
 *
 * Electric is preselected on a true first run, so Next is open from the start:
 * it used to stay disabled until a click, and with nothing highlighted the
 * owner read the step as stuck. Skipping persists nothing and the shell falls
 * back to the same electric guitar (`DEFAULT_INSTRUMENT`). A re-run keeps the
 * live instrument: a guitar starts selected, and anything else (a drummer who
 * chose drums in Settings) starts with no card selected and is kept unless a
 * guitar is picked.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstrumentPickerGrid } from "../../../components/InstrumentPickerModal";
import { DEFAULT_INSTRUMENT, isGuitar } from "../../../constants/instruments";
import { IS_MOBILE } from "../../../platform";
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
  const keepsOther = instrumentChosen && !isGuitar(instrument);
  const [staged, setStaged] = useState<string | undefined>(() =>
    !instrumentChosen ? DEFAULT_INSTRUMENT : isGuitar(instrument) ? instrument : undefined,
  );

  useEffect(() => {
    setNextEnabled(true);
    setStepCommit(staged ? () => setInstrument(staged) : null);
  }, [staged, setNextEnabled, setStepCommit, setInstrument]);

  return (
    <div className="onboarding-step onboarding-instrument">
      <h2 className="onboarding-step-title" id="onboarding-title">
        {t("instrumentPicker.title")}
      </h2>
      <p className="onboarding-step-subtitle">
        {t(IS_MOBILE ? "instrumentPicker.subtitleMobile" : "instrumentPicker.subtitle")}
      </p>
      <InstrumentPickerGrid selectedId={staged} onPick={setStaged} />
      {keepsOther && !staged && (
        <p className="onboarding-instrument-note" data-testid="instrument-keep-current">
          {t("instrumentPicker.keepCurrent", { instrument: t(`instrument.${instrument}`) })}
        </p>
      )}
      <p className="onboarding-instrument-note">{t("instrumentPicker.otherInstruments")}</p>
    </div>
  );
}
