import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { INSTRUMENTS } from "../constants/metronome";
import { INSTRUMENT_ICONS } from "./MetronomeIcons";

/** Instrument dropdown for Practice Coach settings. */
export function InstrumentDropdown({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = INSTRUMENTS.find((o) => o.id === value) || INSTRUMENTS[0];

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className={`instrument-dropdown ${open ? "open" : ""} ${disabled ? "disabled" : ""}`} ref={ref}>
      <button
        className="instrument-dropdown-trigger"
        onClick={() => !disabled && setOpen((v) => !v)}
        type="button"
        disabled={disabled}
      >
        <span className="instrument-dropdown-value">
          {INSTRUMENT_ICONS[selected.id]}
          {t(`instrument.${selected.id}`)}
        </span>
        <svg
          className="instrument-dropdown-chevron"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="instrument-dropdown-menu">
          {INSTRUMENTS.map((inst) => (
            <button
              key={inst.id}
              className={`instrument-dropdown-item ${inst.id === value ? "selected" : ""} ${inst.soon ? "soon" : ""}`}
              onClick={() => {
                if (inst.soon) return;
                onChange(inst.id);
                setOpen(false);
              }}
              type="button"
              disabled={inst.soon}
            >
              {inst.id === value && !inst.soon && (
                <svg
                  className="instrument-dropdown-check"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              <span className="instrument-dropdown-icon">{INSTRUMENT_ICONS[inst.id]}</span>
              <span>{t(`instrument.${inst.id}`)}</span>
              {inst.soon && (
                <span className="instrument-dropdown-soon">{t("common.soon")}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
