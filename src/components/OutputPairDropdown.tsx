import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Which pair of a device's outputs the app plays on.
 *
 * A church drummer running v-drums into outputs 1-2 of a four-output
 * interface needs the click somewhere else, and "somewhere else" on an
 * interface is a pair: outputs 3-4, or 5-6, or 7-8. The value is 0-based
 * (0 is "Outputs 1-2") because that is what the engine writes with; the
 * labels count from one, because that is what is printed on the box.
 *
 * Same `midi-dropdown` mark-up as every other device picker in the app, and
 * no dot indicator — a pair of outputs has nothing to be connected to.
 */
export function OutputPairDropdown({
  outputCount,
  value,
  onChange,
}: {
  outputCount: number;
  value: number;
  onChange: (pair: number) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Whole pairs only: a device reporting five outputs offers two pairs, and
  // the odd one out is not something the app can put a stereo click into.
  const pairs = Math.max(1, Math.floor(outputCount / 2));
  const options = Array.from({ length: pairs }, (_, i) => ({
    value: i,
    label: t("settings.devices.outputsPair", { a: i * 2 + 1, b: i * 2 + 2 }),
  }));

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
    <div className={`midi-dropdown ${open ? "open" : ""}`} ref={ref} style={{ flex: 1 }}>
      <button
        className="midi-dropdown-trigger"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="midi-dropdown-value">
          {options[value]?.label ?? options[0]?.label}
        </span>
        <svg
          className="midi-dropdown-chevron"
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
        <div className="midi-dropdown-menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`midi-dropdown-item ${opt.value === value ? "selected" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              type="button"
            >
              {opt.value === value && (
                <svg
                  className="midi-dropdown-check"
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
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
