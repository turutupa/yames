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
   * How far the menu has to move to be on screen, in pixels.
   *
   * It hangs from the chip's left edge, and the chip sits at the right-hand
   * end of the header, so the menu ran off the window. Flipping it to hang
   * from the chip's RIGHT edge instead was the first fix and it was not
   * enough: in a narrow window neither edge fits, and the layout suite caught
   * exactly that — at 520px the menu ended three pixels past the frame. So it
   * is not a choice between two edges but a measurement: hang it from the
   * left, see where it lands, and slide it back inside. Zero is the common
   * case and costs nothing.
   */
  const [shift, setShift] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const menu = menuRef.current?.getBoundingClientRect();
    if (!menu) return;
    // A margin, so the menu never sits flush against the frame.
    const edge = 12;
    let moved = Math.min(0, window.innerWidth - edge - menu.right);
    // And if moving it left has pushed its start off the other side — a menu
    // wider than the window — put that edge back instead. It cannot be both,
    // and the left edge is the one with the first key on it.
    if (menu.left + moved < edge) moved = edge - menu.left;
    setShift(moved);
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
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
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
