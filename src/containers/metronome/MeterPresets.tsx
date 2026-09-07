import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { METER_PRESETS, METER_VARIANTS } from "../../constants/metronome";
import { setBeatGroups, setFreeMode } from "../../ipc";
import { findMeterPreset, meterKey } from "../../utils/meter";

interface MeterPresetsProps {
  beatGroups: number[];
  freeMode: boolean;
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
export function MeterPresets({ beatGroups, freeMode }: MeterPresetsProps) {
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
        {/* The grouping, and where a meter has more than one, the alternatives
            beside it as buttons.

            It used to be static text, which meant reaching 3+2+2 from 2+2+3
            cost three clicks: open the picker, find the variant row, choose.
            Only three meters have variants at all, and never more than three
            of them, so they fit on the row that already names the grouping —
            and one click is the right price for a change this small. */}
        {!freeMode && variants && variants.length > 1 ? (
          <span className="meter-groupings" role="group" aria-label={t("metronome.grouping")}>
            {variants.map((v) => {
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
            })}
          </span>
        ) : (
          !freeMode &&
          beatGroups.length > 1 && (
            <span className="meter-grouping">{beatGroups.join(" + ")}</span>
          )
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
