import { useTranslation } from "react-i18next";
import { INSTRUMENTS } from "../constants/metronome";
import { GUITAR_INSTRUMENTS } from "../constants/instruments";
import { IS_MOBILE } from "../platform";
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
/**
 * The card grid on its own, so the onboarding wizard's W1 step can host it
 * inside its own frame (O1) while the standalone modal below keeps working.
 * `selectedId` renders the current choice as selected — the modal doesn't use
 * it (there is no prior choice on first launch), the wizard does.
 */
export function InstrumentPickerGrid({
  onPick,
  selectedId,
  ids = GUITAR_INSTRUMENTS,
}: {
  onPick: (instrumentId: string) => void;
  selectedId?: string;
  /**
   * Which instruments to offer. A first run offers the two guitars (guitar
   * first, 2026-11-17): the Paths are written for guitar, and every other
   * instrument lives in Settings, where the tools still follow it.
   */
  ids?: readonly string[];
}) {
  const { t } = useTranslation();
  const offered = INSTRUMENTS.filter((i) => ids.includes(i.id));
  return (
    <div
      className={`instrument-picker-grid${offered.length === 2 ? " is-pair" : ""}`}
      role="group"
    >
      {offered.map((inst) => {
        const selected = selectedId === inst.id;
        return (
          <button
            key={inst.id}
            className={`instrument-picker-card${selected ? " selected" : ""}`}
            aria-pressed={selected}
            data-instrument={inst.id}
            onClick={() => onPick(inst.id)}
            type="button"
          >
            {/* The check is the selected state's second cue, after the border
                and tint: a dimmer card alone read as "not chosen" (owner). */}
            <span className="instrument-picker-card-check" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 8.5l3 3 6-7" />
              </svg>
            </span>
            <span className="instrument-picker-card-icon">
              {INSTRUMENT_ICONS[inst.id]}
            </span>
            <span className="instrument-picker-card-name">
              {t(`instrument.${inst.id}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

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
          {/* Same two sentences as the wizard's W1, for the same reason: the
              desktop one names the coach and the microphone. */}
          {t(IS_MOBILE ? "instrumentPicker.subtitleMobile" : "instrumentPicker.subtitle")}
        </p>
        <InstrumentPickerGrid onPick={onPick} />
        <p className="instrument-picker-subtitle">{t("instrumentPicker.otherInstruments")}</p>
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
