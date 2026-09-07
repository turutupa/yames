import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { METER_PRESETS, METER_VARIANTS } from "../../constants/metronome";
import { setBeatGroups, setFreeMode } from "../../ipc";
import { findMeterPreset, meterKey } from "../../utils/meter";

interface MeterPresetsProps {
  beatGroups: number[];
  freeMode: boolean;
  /**
   * Sits between the meter chip and the grouping badges — the bar's length,
   * which is the same subject as the two things either side of it.
   *
   * It used to hang at the right-hand end of the row, far from the meter it
   * belongs to and with a gap in the middle that meant nothing.
   */
  stepper?: React.ReactNode;
}

/**
 * The meter, as a chip that opens a picker (UI_DECISIONS U2.3).
 *
 * It used to be ten buttons laid flat — FREE and nine time signatures — which
 * is a lot of screen given to a setting most players choose once and leave.
 * The chip says what the meter is; the picker appears when you want to change
 * it. The grouping sits beside the chip because it is the part that changes
 * without the meter changing: 7/8 as 3+2+2 and as 2+2+3 are the same chip and
 * very different bars.
 *
 * What is NOT here is the accent control the design draws next to it — group
 * starts / every beat / none. Two of those three have no engine behind them:
 * the click accents group starts, and FREE mode is how you get none. Adding a
 * picker for behaviour the engine cannot produce would be a lie on the screen.
 */
export function MeterPresets({ beatGroups, freeMode, stepper }: MeterPresetsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const activeKey = meterKey(beatGroups);
  // Variant-aware, so [2, 3] highlights 5/4 rather than nothing.
  const activePreset = freeMode ? undefined : findMeterPreset(beatGroups);
  const variants = activePreset ? METER_VARIANTS[activePreset.label] : null;

  const totalBeats = beatGroups.reduce((sum, n) => sum + n, 0);
  const chipLabel = freeMode
    ? t("metronome.free")
    : (activePreset?.label ?? t("metronome.beatCount", { count: totalBeats }));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // No `notifySettingsChange()` here: useSession watches bpm / preset / meter
  // and fires ONE debounced coach boundary for a burst of changes. Calling it
  // directly closed the practice segment on every click, ahead of the
  // debounce.
  async function handleSelect(groups: number[]) {
    if (freeMode) await setFreeMode(false);
    await setBeatGroups(groups);
    setOpen(false);
  }

  return (
    <div className="meter-presets" ref={pickerRef}>
      <div className="meter-head">
        {/* Inline, above the dots it describes. It used to hang in a gutter to
            the left of its row, which is what the 80px of stage padding was
            for; the design labels its sections like TEMPO instead. */}
        <span className="stage-label">{t("metronome.meter")}</span>
        <button
          className={`meter-chip ${open ? "open" : ""}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="true"
        >
          {chipLabel}
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {stepper}

        {/* The grouping, always as a badge.

            Where a meter has alternatives they are buttons and one is active;
            where it has only one — 9/8 is only ever 3+3+3 — it is that same
            active badge and not a button, because there is nothing to press.
            It used to fall back to plain text, which made the one case look
            like a different kind of thing from the other, and left the reader
            to work out which of the two they were looking at.

            Reaching 2+2+3 from 3+2+2 used to cost three clicks through the
            picker, for a change that does not touch the meter at all. */}
        {!freeMode && beatGroups.length > 1 && (
          <span
            className="meter-groupings"
            role={variants && variants.length > 1 ? "group" : undefined}
            aria-label={variants && variants.length > 1 ? t("metronome.grouping") : undefined}
          >
            {variants && variants.length > 1 ? (
              variants.map((v) => {
                const key = meterKey(v);
                const on = key === activeKey;
                return (
                  <button
                    key={key}
                    className={`meter-grouping-chip${on ? " active" : ""}`}
                    onClick={() => void handleSelect(v)}
                    aria-pressed={on}
                  >
                    {v.join(" + ")}
                  </button>
                );
              })
            ) : (
              <span className="meter-grouping-chip active">{beatGroups.join(" + ")}</span>
            )}
          </span>
        )}
      </div>

      {open && (
        <div className="meter-picker">
          <div className="time-sig-row">
            <button
              key="free"
              className={`time-sig-btn ${freeMode ? "active" : ""}`}
              onClick={() => {
                // `set_free_mode(true)` collapses `beat_groups` to `[total]`
                // itself — the invariant "freeMode ⇒ one group" is owned by
                // Rust, so no second `setBeatGroups` round-trip is needed.
                setFreeMode(true);
                setOpen(false);
              }}
            >
              {t("metronome.free")}
            </button>
            {METER_PRESETS.map((preset) => (
              <button
                key={preset.label}
                className={`time-sig-btn ${activePreset?.label === preset.label ? "active" : ""}`}
                onClick={() => handleSelect(preset.groups)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {variants && !freeMode && (
            <div className="meter-variant-row">
              <span className="meter-variant-label">{t("metronome.grouping")}</span>
              {variants.map((v) => {
                const key = meterKey(v);
                return (
                  <button
                    key={key}
                    className={`meter-variant-chip ${key === activeKey ? "active" : ""}`}
                    onClick={() => handleSelect(v)}
                  >
                    {v.join(" + ")}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
