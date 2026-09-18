import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMenuPlacement } from "./useMenuPlacement";
import { useTranslation } from "react-i18next";

export type JamSelectOption<T extends string> = {
  id: T;
  label: string;
  /** A quieter second line — what the choice means, in a player's words. */
  hint?: string;
};

interface JamSelectProps<T extends string> {
  label: string;
  value: T;
  options: readonly JamSelectOption<T>[];
  onChange: (id: T) => void;
  disabled?: boolean;
  /** A narrower menu for a control that only holds one word per row. */
  compact?: boolean;
  /**
   * The pointer is on the way, or the menu is opening: a chance to get the
   * options ready before one is chosen. Called on hover, on focus and on
   * open, so it must be cheap to call more than once.
   */
  onWarm?: () => void;
  /**
   * The choice just made is still loading. A small spinner beside the value,
   * and nothing else — the control stays live, so a misclick can be fixed
   * without waiting for the wrong sound to finish.
   */
  loading?: boolean;
}

/**
 * A dropdown, in the stage's vocabulary: "Shape · 12-bar blues".
 *
 * Not a `<select>`. Two reasons, and both come from the boards: a row here can
 * carry a second line ("I · IV · V, the turnaround on 12"), which a native
 * option cannot, and the app draws its own menus everywhere else — the header's
 * sound menu is this shape already, and one screen using the OS widget would
 * read as a screen somebody else built.
 *
 * The setup sheet is where a dropdown earns its place at all. On the playing
 * screen a control you have to open is a control you cannot hit with a
 * plectrum in your hand; on a sheet you are looking at with both hands free,
 * eight cards for a thing you set once is eight cards of noise.
 */
export function JamSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  compact = false,
  onWarm,
  loading = false,
}: JamSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const { wrapRef, menuRef, style } = useMenuPlacement(open);
  const { t } = useTranslation();
  const loadingLabel = t("jam.loading");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      // Both, now that the menu is drawn on the body: a click inside it is
      // not inside the chip, and closing on it would eat the choice.
      if (wrapRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Claimed, so the sheet behind it does not close as well. One Escape,
      // one thing put away.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const current = options.find((o) => o.id === value);

  return (
    <div className="jam-select" ref={wrapRef} data-compact={compact ? "" : undefined}>
      <button
        type="button"
        className={`jam-dropdown${open ? " open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onPointerEnter={onWarm}
        onFocus={onWarm}
        onClick={() => {
          if (!open) onWarm?.();
          setOpen((o) => !o);
        }}
      >
        <span className="jam-dropdown-label">{label}</span>
        <span className="jam-dropdown-value">{current?.label ?? value}</span>
        {loading && <span className="jam-spinner" role="status" aria-label={loadingLabel} />}
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            className="jam-dropdown-menu"
            ref={menuRef}
            style={style}
            role="listbox"
            aria-label={label}
          >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === value}
              className={`jam-dropdown-item${option.id === value ? " active" : ""}`}
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
            >
              <span className="jam-dropdown-item-text">
                <span className="jam-dropdown-item-name">{option.label}</span>
                {option.hint && (
                  <span className="jam-dropdown-item-hint">{option.hint}</span>
                )}
              </span>
            </button>
          ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
