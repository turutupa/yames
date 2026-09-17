import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SHARP_NAMES, keyName, noteName } from "../../jam/harmony";
import type { Key, KeyMode } from "../../jam/harmony";

const KEY_MODES: KeyMode[] = ["major", "minor", "blues"];

/**
 * The key, on the playing screen (2026-09-17).
 *
 * It lived only in the setup sheet, under Form, and the owner changes key
 * "often for improv purposes": a thing you do WHILE playing was three
 * gestures deep behind a drawer. So it is here too — the same control, in the
 * place where you are when you want it, beside the feel and the tempo. The
 * sheet keeps its own copy: that is where you set a jam up, and a control
 * that moved out of the sheet would be missing from the place people learned
 * it was.
 *
 * A chip that opens the grid rather than twelve buttons across the header:
 * the header is read at a glance while playing, and a key is chosen and then
 * left alone for a chorus or ten.
 */
export function KeyPicker({
  value,
  onPick,
  disabled = false,
}: {
  /** The key the BAND plays in — concert pitch, whatever the reader reads. */
  value: Key;
  onPick: (key: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  /**
   * Which edge the menu hangs from. The chip sits at the right-hand end of
   * the header, so a menu anchored to its left ran off the window; anchored
   * to its right it would run off the other side in a narrow one. Measured
   * when it opens, which is the only moment either is knowable.
   */
  const [align, setAlign] = useState<"left" | "right">("left");
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const chip = wrapRef.current?.getBoundingClientRect();
    const menu = menuRef.current?.getBoundingClientRect();
    if (!chip || !menu) return;
    const room = window.innerWidth - chip.left - 12;
    setAlign(menu.width > room && chip.right - menu.width >= 12 ? "right" : "left");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Claimed, so the jam behind it does not close as well.
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

  return (
    <div className="jam-key-picker" ref={wrapRef}>
      <button
        type="button"
        className={`jam-dropdown${open ? " open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="jam-dropdown-label">{t("jam.key.label")}</span>
        <span className="jam-dropdown-value">{keyName(value)}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="jam-key-menu"
          data-align={align}
          ref={menuRef}
          role="dialog"
          aria-label={t("jam.key.label")}
        >
          {/* The same grid the sheet draws, and deliberately: a player who
              learned the keys there should not have to learn a second shape
              here. Roots are written sharp, as they are there. */}
          <div className="jam-keys" role="group" aria-label={t("jam.key.label")}>
            {SHARP_NAMES.map((name, root) => (
              <button
                key={name}
                type="button"
                className={`jam-key${value.root === root ? " active" : ""}`}
                aria-pressed={value.root === root}
                onClick={() => onPick(keyName({ ...value, root }))}
              >
                {noteName(root, "sharp")}
              </button>
            ))}
          </div>
          <div className="accent-control jam-segmented" role="group" aria-label={t("jam.key.mode")}>
            <div className="accent-options">
              {KEY_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`accent-option${value.mode === mode ? " active" : ""}`}
                  aria-pressed={value.mode === mode}
                  onClick={() => onPick(keyName({ ...value, mode }))}
                >
                  {t(`jam.key.${mode}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
