import { useTranslation } from "react-i18next";
import { INSTRUMENTS } from "../constants/metronome";
import { INSTRUMENT_ICONS } from "./MetronomeIcons";

/**
 * First-launch instrument picker (D0 of the DSP & Coach plan).
 *
 * The plan is explicit: do not silently default to "Other" on first
 * launch. Every default is a compromise that fits no single instrument
 * well. Surface the choice up-front so the rest of the DSP and coach
 * stack runs against an `InstrumentProfile` tuned for the user's gear.
 *
 * If the user dismisses the picker without choosing, the caller falls
 * back to "electric-guitar" (statistically the most likely user); the
 * dropdown in Settings stays available so they can change it later.
 */
export function InstrumentPickerModal({
  onPick,
  onDismiss,
}: {
  onPick: (instrumentId: string) => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="instrument-picker-overlay"
      onClick={(e) => {
        // Click on the backdrop (not inner content) = dismiss.
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div className="instrument-picker-modal">
        <h2 className="instrument-picker-title">{t("instrumentPicker.title")}</h2>
        <p className="instrument-picker-subtitle">
          {t("instrumentPicker.subtitle")}
        </p>
        <div className="instrument-picker-grid">
          {INSTRUMENTS.filter((i) => i.id !== "other").map((inst) => (
            <button
              key={inst.id}
              className="instrument-picker-card"
              onClick={() => onPick(inst.id)}
              type="button"
            >
              <span className="instrument-picker-card-icon">
                {INSTRUMENT_ICONS[inst.id]}
              </span>
              <span className="instrument-picker-card-name">{t(`instrument.${inst.id}`)}</span>
            </button>
          ))}
        </div>
        <button
          className="instrument-picker-skip"
          onClick={onDismiss}
          type="button"
        >
          {t("instrumentPicker.skip")}
        </button>
      </div>
    </div>
  );
}
