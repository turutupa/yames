/**
 * The rest of the strip, one press away (W29 item 3).
 *
 * The strip was three rows under the tab at 1440×900 and five at 480×780,
 * and the tab was paying for every one of them — under half the window's
 * height at the size the pictures are taken at. The owner: *"figure out how
 * to use as much space as possible on the stage area with tabs, right now a
 * lot of space is under used"*.
 *
 * So the strip is ONE row, and what does not earn a permanent place on it
 * lives in here: the sections and the portions you named, the record and
 * camera switches, and the band's faders. What stays on the row is what
 * `JAM_UX_DECISIONS` A13 is really about — the thing you change with a
 * guitar on, mid-passage, over and over: which bars, whether they repeat,
 * and how fast. Everything in this popover is something you set once before
 * you play rather than while you are playing, and every one of them is also
 * on a footswitch (`useActionDispatcher`), which is the door A13 cares about
 * most.
 *
 * Portalled and placed by Jam's `useMenuPlacement`, opening upwards: the
 * strip is the last row above the transport, so a panel that grew downwards
 * would open over Play and Stop.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useMenuPlacement } from "../jam/useMenuPlacement";

export interface SongStripMoreProps {
  children: React.ReactNode;
  /** Shown on the chip: how many of the players are turned down, and so on. */
  badge?: React.ReactNode;
}

export function SongStripMore({ children, badge }: SongStripMoreProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { wrapRef, menuRef, style } = useMenuPlacement(open, { prefer: "above" });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      // A shelf opened from INSIDE this panel — the takes list, the band's
      // own popover — is portalled to the body too, so it is not a
      // descendant of either ref. Closing on a press inside one of those
      // would take the panel out from under the button being pressed.
      if ((target as HTMLElement).closest?.(".songs-takes-pop, .songs-band-pop")) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, wrapRef, menuRef]);

  return (
    <div className="songs-strip-group songs-strip-more" ref={wrapRef}>
      <button
        type="button"
        className="songs-chip songs-more-chip"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((was) => !was)}
      >
        {t("songs.strip.more")}
        {badge}
      </button>
      {open &&
        createPortal(
          <div
            className="songs-more-pop"
            role="dialog"
            aria-label={t("songs.strip.more")}
            ref={menuRef}
            style={style}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}
