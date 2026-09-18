import { useLayoutEffect, useRef, useState } from "react";

/**
 * Where a menu hanging off a chip actually goes (2026-09-17).
 *
 * A dropdown used to be an absolutely positioned child of its chip, and that
 * broke in two ways at once — the owner, testing: "when clicking on long
 * dropdowns they are overflowing... either on the drawer or on the main
 * stage... maybe they should grow up or something".
 *
 * Off the WINDOW, because a chip near the right-hand edge or low on the
 * screen put the menu past it. And off the DRAWER, because the setup sheet
 * scrolls, and a child of something that scrolls is clipped by it however
 * much room the window has — which is the half no amount of `max-height`
 * fixes.
 *
 * So a menu is not a child any more. The caller draws it on the body through
 * a portal and gives it the style this returns: window coordinates, so
 * nothing can clip it; slid back inside the frame; opening upwards when there
 * is more room above; and never taller than the room it opens into.
 *
 * One hook rather than one copy per menu: there are three of these on the jam
 * screen and the first fix landed in one of them, which is how the kit picker
 * went on running off the bottom of a drawer that everything else had stopped
 * running off.
 */
export function useMenuPlacement(open: boolean) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{
    left: number;
    top: number;
    minWidth: number;
    maxHeight: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setAt(null);
      return;
    }
    const place = () => {
      const chip = wrapRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!chip || !menu) return;

      /** A margin, so a menu never sits flush against the frame. */
      const edge = 12;
      /** The gap between the chip and its menu. */
      const gap = 4;
      // Its natural height, asked for before anything has been imposed on it.
      const natural = menu.scrollHeight;
      const width = Math.max(menu.offsetWidth, chip.width);

      const below = window.innerHeight - chip.bottom - gap - edge;
      const above = chip.top - gap - edge;
      // Upwards only when it genuinely helps: flipping into a space just as
      // short as the one it left is movement for nothing.
      const up = natural > below && above > below;
      const room = Math.max(0, up ? above : below);
      const height = Math.min(natural, room);

      let left = chip.left;
      if (left + width > window.innerWidth - edge) left = window.innerWidth - edge - width;
      if (left < edge) left = edge;

      setAt({
        left: Math.round(left),
        top: Math.round(up ? chip.top - gap - height : chip.bottom + gap),
        minWidth: Math.round(width),
        maxHeight: Math.round(room),
      });
    };

    place();
    // The page can move under an open menu — the drawer scrolls, the window
    // resizes — and a menu left behind is worse than one that never opened.
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return {
    wrapRef,
    menuRef,
    /**
     * The frame before it has been measured puts the menu off-screen rather
     * than in the wrong place: one is invisible, the other is a menu that
     * visibly jumps.
     */
    style: at ?? { left: -9999, top: 0 },
  };
}
