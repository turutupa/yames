/**
 * The band that came with the file, on the stage.
 *
 * `JAM_UX_DECISIONS.md` A13 is the rule: what you change while playing lives
 * where you can reach it with a guitar on. Turning the drums down because the
 * file's kit is loud, or muting the bass to hear your own line under it, is
 * exactly that — so these are here beside the bar range and not behind a
 * sheet.
 *
 * ## A row, not a column (2026-09-20, W18)
 *
 * It was four stacked mixer rows, and stacked is what put it 28 px below the
 * bottom of a 900 px window — a control A13 says lives on the stage that you
 * could not reach while playing without scrolling. So each player is one short
 * row now, and the players sit side by side: an icon, a fader, a mute. The
 * name goes when the stage is too narrow to keep it (a container query, so it
 * is the STAGE's width that decides, not the window's — the rail and the coach
 * dock both take from it), and the icon and the fader's own `aria-label` carry
 * the name for anyone who cannot see the picture.
 *
 * Shaped after Jam's `BandLanes`, deliberately: it is the same gesture on the
 * same kind of row, and a musician who has learned one should not have to
 * learn the other. Two things differ, and both follow from a song's band
 * being the FILE's rather than one you built:
 *
 * - **Only the rows the file has.** A file with no bass track has no bass
 *   fader. A control for a player who is not there is a control that does
 *   nothing, and Jam's switch — "is this player in the band at all" — is not
 *   a question anybody can answer about a Guitar Pro file.
 * - **The click is one of the rows.** Over a song the click is a part you
 *   balance against the band rather than the thing the band plays to, and it
 *   arrives at 0.45 for that reason (`song.rs`).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useMenuPlacement } from "../jam/useMenuPlacement";
import { useStageIsNarrow } from "./useStageIsNarrow";
import { SONG_MIX_MAX } from "../../songs/types";
import type { SongLane, SongMixSetting } from "../../songs/songEngine";
import type { SongRole } from "../../songs/types";

/** The metronome's own beater, for the click's row. */
function ClickIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 3h6l4 18H5z" />
      <line x1="7" y1="14" x2="17" y2="14" />
      <line x1="12" y1="20" x2="15" y2="6" />
    </svg>
  );
}

function DrumsIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="8" rx="8" ry="3.2" />
      <path d="M4 8v8c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V8" />
      <line x1="8" y1="10.6" x2="8" y2="18.6" />
      <line x1="16" y1="10.6" x2="16" y2="18.6" />
    </svg>
  );
}

function BassIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12c0-2 2-4 4-4h10c2 0 4 2 4 4s-2 4-4 4H7c-2 0-4-2-4-4z" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </svg>
  );
}

function KeysIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="6" width="19" height="12" rx="1.6" />
      <line x1="8.8" y1="6" x2="8.8" y2="18" />
      <line x1="15.2" y1="6" x2="15.2" y2="18" />
      <rect x="6.6" y="6" width="2.6" height="6.6" fill="currentColor" stroke="none" />
      <rect x="13" y="6" width="2.6" height="6.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function laneIcon(lane: SongLane) {
  if (lane === "click") return <ClickIcon />;
  if (lane === "drums") return <DrumsIcon />;
  if (lane === "bass") return <BassIcon />;
  return <KeysIcon />;
}

export interface SongBandProps {
  setting: SongMixSetting;
  /** The band's rows this file has, in playing order. Never the click. */
  lanes: SongRole[];
  onGain: (lane: SongLane, value: number) => void;
  onMute: (lane: SongLane, muted: boolean) => void;
  /**
   * The stage the faders have to fit on, so the band knows when to fold.
   *
   * The element and not a width: `useStageIsNarrow` measures it and keeps
   * measuring it, because the coach dock can narrow this column without the
   * window changing at all.
   */
  stageRef: { current: HTMLElement | null };
}

/**
 * Below this, one short row per player no longer fits beside anything else.
 *
 * Three lanes at their 104px floor is 320px of stage, which is all of it at
 * the smallest window the app opens — so the band would take a row of its own
 * and a caption above it, and the tab would be down to nothing. The same
 * number `songs.css` folds the head at, because it is the same question.
 */
const FOLD_AT = 620;

export function SongBand({ setting, lanes, onGain, onMute, stageRef }: SongBandProps) {
  const { t } = useTranslation();
  const folded = useStageIsNarrow(stageRef, FOLD_AT);
  const [open, setOpen] = useState(false);
  // Upwards, like the takes shelf beside it and for the same reason: the
  // strip is the last row above the transport.
  const { wrapRef, menuRef, style } = useMenuPlacement(open && folded, { prefer: "above" });

  const muted = new Set(setting.muted);
  // The click is always there: a song with no band at all still has one
  // fader, and it is the one that decides whether you are playing to a
  // metronome or to nothing.
  const rows: SongLane[] = ["click", ...lanes];
  /** How many players are turned down to nothing, for the folded chip. */
  const off = rows.filter((lane) => muted.has(lane)).length;

  // A stage that gets wider again must not leave a popover hanging over it.
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

  const band = (
    <div className="songs-band" role="group" aria-label={t("songs.band.label")}>
      {rows.map((lane) => {
          const off = muted.has(lane);
          const name = t(`songs.band.${lane}`);
          return (
            <div className="songs-band-lane" key={lane} data-off={off ? "" : undefined}>
              {/* `title` rather than a tooltip component: below the width the
                  name is dropped at, this is the only thing that can still be
                  asked "which one is this?" with a mouse. */}
              <span className="songs-band-name" title={name}>
                {laneIcon(lane)}
                <span className="songs-band-name-text">{name}</span>
              </span>
              <input
                type="range"
                className="songs-band-fader"
                min={0}
                max={SONG_MIX_MAX}
                step={0.05}
                value={setting.mix[lane]}
                aria-label={t("songs.band.levelFor", { lane: name })}
                onChange={(e) => onGain(lane, Number(e.target.value))}
              />
              {/* The number stays, narrow as the row is: Jam's lanes show it
                  and a musician who learned that row should not find this one
                  answering a different question. */}
              <span className="songs-band-volume-value">
                {Math.round(setting.mix[lane] * 100)}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={!off}
                /* `transport-switch` is shell.css and so is on every screen;
                   `jam-switch` is not — jam.css is only loaded by the Jam
                   tab — so the one line it carries is ours. */
                className={`transport-switch songs-band-switch ${off ? "" : "on"}`}
                onClick={() => onMute(lane, !off)}
              >
                <span className="transport-switch-track" aria-hidden="true" />
                <span className="sr-only">{t("songs.band.muteFor", { lane: name })}</span>
              </button>
            </div>
          );
        })}
    </div>
  );

  if (!folded) {
    return (
      <div className="songs-strip-group songs-strip-band">
        <span className="songs-strip-label">{t("songs.band.label")}</span>
        {band}
      </div>
    );
  }

  /*
   * Folded: one chip, and the faders in a popover off it.
   *
   * Portalled rather than drawn under the chip, because the strip is the last
   * row above the transport and a panel that grows downwards opens straight
   * off the bottom of the window. The chip carries the state worth knowing
   * without opening it — how many players are muted — so a player who turned
   * the drums off does not have to open the shelf to be reminded.
   */
  return (
    <div className="songs-strip-group songs-strip-band" ref={wrapRef}>
      <span className="songs-strip-label">{t("songs.band.label")}</span>
      <button
        type="button"
        className="songs-chip songs-band-opener"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((was) => !was)}
      >
        {rows.map((lane) => (
          <span className="songs-band-opener-icon" key={lane} data-off={muted.has(lane) ? "" : undefined}>
            {laneIcon(lane)}
          </span>
        ))}
        {off > 0 && <span className="songs-band-opener-off">{off}</span>}
      </button>
      {open &&
        createPortal(
          <div
            className="songs-band-pop"
            role="dialog"
            aria-label={t("songs.band.label")}
            ref={menuRef}
            style={style}
          >
            {band}
          </div>,
          document.body,
        )}
    </div>
  );
}
