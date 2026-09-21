/**
 * How fast, on the strip (W29 item 3).
 *
 * Six chips where the stage has room for six chips, and one chip with the
 * six behind it where it has not. The brief's rule for what sheds last is
 * *"tempo percent and loop stay longest"*, and this is how the tempo keeps
 * its place on a 480 px window: the CONTROL stays on the row, in a form that
 * is one press instead of none, rather than disappearing into "More" with
 * the things you set once.
 *
 * The chip says the speed you are at, so a player who has slowed a passage
 * down can see that without opening anything.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useMenuPlacement } from "../jam/useMenuPlacement";

export interface SongSpeedProps {
  steps: readonly number[];
  percent: number;
  /** The tempo each step comes out at, for the tooltip. */
  bpmAt: (percent: number) => number;
  onChoose: (percent: number) => void;
  /** No room for six chips: one chip and a menu instead. */
  folded: boolean;
}

export function SongSpeed({ steps, percent, bpmAt, onChoose, folded }: SongSpeedProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { wrapRef, menuRef, style } = useMenuPlacement(open && folded, { prefer: "above" });

  // A stage that widens again must not leave a menu hanging over it.
  useEffect(() => {
    if (!folded) setOpen(false);
  }, [folded]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, wrapRef, menuRef]);

  const chip = (step: number, className: string) => (
    <button
      key={step}
      type="button"
      className={className}
      data-active={percent === step ? "" : undefined}
      aria-pressed={percent === step}
      title={t("songs.speedNote", { bpm: bpmAt(step) })}
      onClick={() => {
        setOpen(false);
        onChoose(step);
      }}
    >
      {t("songs.percent", { percent: step })}
    </button>
  );

  if (!folded) {
    return (
      <div className="songs-strip-group songs-strip-tempo">
        <span className="songs-strip-label">{t("songs.speed")}</span>
        <div className="songs-tempo-chips">
          {steps.map((step) => chip(step, "songs-chip"))}
        </div>
      </div>
    );
  }

  return (
    <div className="songs-strip-group songs-strip-tempo" ref={wrapRef}>
      <button
        type="button"
        className="songs-chip songs-speed-chip"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("songs.speed")}
        onClick={() => setOpen((was) => !was)}
      >
        {t("songs.percent", { percent })}
      </button>
      {open &&
        createPortal(
          <div
            className="songs-speed-pop"
            role="listbox"
            aria-label={t("songs.speed")}
            ref={menuRef}
            style={style}
          >
            {steps.map((step) => chip(step, "songs-chip songs-speed-row"))}
          </div>,
          document.body,
        )}
    </div>
  );
}
