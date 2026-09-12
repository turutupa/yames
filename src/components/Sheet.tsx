import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { IS_MOBILE } from "../platform";
import { useBackDismiss } from "../mobile/backStack";

interface SheetProps {
  open: boolean;
  /** Called by the scrim, the close button, Escape and a downward swipe. */
  onClose: () => void;
  /**
   * The sheet's name. Read out as the dialog's accessible name, and drawn in
   * the title row unless `header` replaces it.
   */
  title: string;
  /**
   * The content draws its own header row, so the sheet contributes only the
   * handle and a close button floated over the top-right corner.
   *
   * The library is the case: `PresetSidebar` already has a header carrying the
   * list's name, the search button and the save button. A sheet title above it
   * would be a second row saying the same word, on the screen with the least
   * room for one.
   */
  ownHeader?: boolean;
  /** Goes on the panel, e.g. `sheet--library`. */
  className?: string;
  children: React.ReactNode;
}

/** How far down you must drag before letting go dismisses it. */
const DISMISS_PX = 96;
/** …or how fast, for a flick that never travels that far. */
const DISMISS_VELOCITY = 0.6; // px per ms

/**
 * A bottom sheet: a panel that rises from the bottom edge over a scrim.
 *
 * This is the phone's answer to two desktop shapes that have no narrow form —
 * the 252px library drawer, which covered 70% of a 360px screen and left the
 * live metronome squeezed into what was left, and the meter picker, a popover
 * anchored to a chip that opened 286px wider than the screen
 * (`plans/tasks/mobile/M03-GAPS.md`, ranked #1 and #4).
 *
 * It is only ever mounted behind `IS_MOBILE`. Nothing about it is conditional
 * on a media query, because the decision is not "is this window narrow" but
 * "is this the phone build" — a desktop window dragged to 360px still has a
 * pointer, a keyboard and a rail, and wants none of this.
 *
 * Three ways out, because a sheet with no visible dismiss is the thing the
 * survey complained about: the scrim, the close button in the title row, and a
 * downward drag from the handle. Escape works too, for the tablet keyboards
 * and the desktop browser this gets developed in.
 *
 * The drag is pointer events on the grip rather than the whole panel: the
 * library's list scrolls, and a sheet that follows your finger while you are
 * trying to scroll a list is a sheet that closes every time you look for the
 * preset at the bottom.
 */
export function Sheet({ open, onClose, title, ownHeader, className, children }: SheetProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Live drag offset, in px. Kept in state so the panel follows the finger;
  // null when nothing is being dragged, which is also what re-enables the
  // snap-back transition.
  const [dragY, setDragY] = useState<number | null>(null);
  const drag = useRef<{ id: number; startY: number; startedAt: number } | null>(null);

  // The system Back gesture, which on Android is the gesture people actually
  // reach for to dismiss a sheet. One registration here covers every sheet in
  // the app; with none open, Back sends the app to the background instead of
  // killing it mid-click (M00 found it doing exactly that). Gated on the
  // build-time constant so a desktop bundle never carries `src/mobile/`.
  if (IS_MOBILE) useBackDismiss(open, onClose);

  // Escape, and the focus that was somewhere else before this opened.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  // A sheet that opens while the last one is still sliding away would otherwise
  // keep the old drag offset and open part-way down the screen.
  useEffect(() => {
    if (!open) setDragY(null);
  }, [open]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Mouse-right and pen-eraser are not a swipe.
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, startY: e.clientY, startedAt: performance.now() };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragY(0);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    // Downward only. Dragging up must not peel the sheet off the bottom edge.
    setDragY(Math.max(0, e.clientY - drag.current.startY));
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (drag.current?.id !== e.pointerId) return;
      const dy = Math.max(0, e.clientY - drag.current.startY);
      const dt = Math.max(1, performance.now() - drag.current.startedAt);
      drag.current = null;
      setDragY(null);
      if (dy > DISMISS_PX || dy / dt > DISMISS_VELOCITY) onClose();
    },
    [onClose],
  );

  if (!open) return null;

  const grip = {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };

  const closeButton = (
    <button
      className={`sheet-close${ownHeader ? " sheet-close--floating" : ""}`}
      onClick={onClose}
      aria-label={t("sheet.close")}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <line x1="6" y1="6" x2="18" y2="18" />
        <line x1="18" y1="6" x2="6" y2="18" />
      </svg>
    </button>
  );

  return createPortal(
    <div className="sheet-layer">
      {/* Not a button: a scrim that answers the keyboard would be a second,
          invisible tab stop for something the close button already does. */}
      <div className="sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={`sheet${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        // With its own header the dialog's name is a node this component did
        // not render, so it is spelled out rather than pointed at.
        {...(ownHeader ? { "aria-label": title } : { "aria-labelledby": titleId })}
        tabIndex={-1}
        data-dragging={dragY === null ? undefined : ""}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div className="sheet-grip" {...grip}>
          <span className="sheet-handle" aria-hidden="true" />
        </div>
        {ownHeader ? (
          closeButton
        ) : (
          <div className="sheet-titlebar" {...grip}>
            <span className="sheet-title" id={titleId}>
              {title}
            </span>
            {closeButton}
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
