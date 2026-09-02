import { useEffect, useMemo, useRef, useState } from "react";
import type { AudioInputDevice } from "../types";

/** Custom themed dropdown for audio input device selection. */
export function AudioInputDropdown({
  devices,
  value,
  onChange,
  defaultLabel = "System default",
  defaultSuffix = " (default)",
}: {
  devices: AudioInputDevice[];
  value: string;
  onChange: (value: string) => void;
  /**
   * Label for the "no explicit device" entry. Optional so existing call sites
   * keep their wording; the onboarding wizard (O5) passes the localised
   * `settings.inputTest.systemDefault` / `.defaultSuffix` strings.
   */
  defaultLabel?: string;
  /** Suffix appended to the OS default device's name. */
  defaultSuffix?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const options = useMemo(
    () => [
      { value: "", label: defaultLabel },
      ...devices.map((d) => ({
        value: d.name,
        label: d.name + (d.isDefault ? defaultSuffix : ""),
      })),
    ],
    [devices, defaultLabel, defaultSuffix],
  );

  const selected = options.find((o) => o.value === value) || options[0];

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
    <div className={`midi-dropdown ${open ? "open" : ""}`} ref={ref}>
      <button
        className="midi-dropdown-trigger"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="midi-dropdown-value">
          <span className={`midi-dropdown-dot ${value ? "connected" : ""}`} />
          {selected.label}
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
