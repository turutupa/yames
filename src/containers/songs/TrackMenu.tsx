/**
 * Which part of the file you are reading — on the stage, not only at import.
 *
 * The owner, after his first session with Songs (2026-09-20): *"there's no
 * dropdown for selecting the instrument if a file has multiple instruments"*.
 * `TrackPicker` asks once, before the count-in, and then the answer is
 * invisible and final; a file with a guitar, a second guitar and a bass in it
 * meant importing it three times.
 *
 * So the part's name in the head is a menu. It is a different question from
 * the band's faders beside it — **this one chooses what you READ and are
 * scored on**, that one chooses what you HEAR — and they are worth keeping
 * apart in words as well as in place.
 *
 * Portalled to the body and placed by Jam's `useMenuPlacement`, like every
 * other menu in this app: the head sits at the top of a stage that clips, and
 * a list drawn as a child of it would be cut off by the stage on a short
 * window. 320 px is the hook's own cap — see `songs.css`.
 *
 * ## Rows that cannot be chosen still appear
 *
 * A drum chart and a vocal line are in the file and a list that hid them
 * would look like it had lost them (`playableTracks` says the same thing
 * about the import sheet). They are shown, and the row says why it is not
 * offered: Yames follows a player's fingers on a fretted part, and a
 * `SongScore` is notes on strings — `buildSongScore` refuses a staff with no
 * tuning, which is every drum kit and every singer.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useMenuPlacement } from "../jam/useMenuPlacement";
import { tuningLabel } from "./TrackPicker";
import type { SongTrackChoice } from "../../songs/import";

function GuitarGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.5 9.5 21 3" />
      <path d="M11 12a4.5 4.5 0 1 1-4.2 6.2A4.5 4.5 0 1 1 11 12z" />
      <circle cx="10" cy="15" r="1.6" />
    </svg>
  );
}

function BassGlyph() {
  return (
    <svg
      width="13"
      height="13"
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

function DrumsGlyph() {
  return (
    <svg
      width="13"
      height="13"
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
    </svg>
  );
}

function StaffGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="3" y1="7" x2="21" y2="7" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="17" x2="21" y2="17" />
    </svg>
  );
}

function trackGlyph(track: SongTrackChoice) {
  if (track.percussion) return <DrumsGlyph />;
  if (track.kind === "bass") return <BassGlyph />;
  if (track.kind === "guitar") return <GuitarGlyph />;
  return <StaffGlyph />;
}

/**
 * Can Yames follow your fingers on this part?
 *
 * The same question `buildSongScore` answers by throwing: a score is notes on
 * strings, and a staff with no tuning has none. A part with nothing written
 * on it is a second reason and gets its own sentence, because "this is empty"
 * and "this is a drum kit" are different news.
 */
export function trackTrouble(track: SongTrackChoice): "percussion" | "notTab" | "empty" | null {
  if (track.percussion) return "percussion";
  if (track.stringCount === 0) return "notTab";
  if (!track.hasNotes) return "empty";
  return null;
}

export interface TrackMenuProps {
  tracks: SongTrackChoice[];
  /** The track being read, as an index into the FILE. */
  current: number;
  /** What the head says when the file is one track, or has not been read. */
  currentName: string;
  onChoose: (trackIndex: number) => void;
  /**
   * The song's facts — tuning, capo, meter, tempo — folded in under the list
   * when the bar is too narrow to carry them (W36 item 2).
   *
   * Here rather than in the bar's overflow because it is the same question:
   * this menu is already "which part am I reading", and a part's tuning is
   * the first thing you want to know about it. Null whenever the bar has room
   * for them, so they are never in two places at once.
   */
  facts?: React.ReactNode;
}

export function TrackMenu({ tracks, current, currentName, onChoose, facts = null }: TrackMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { wrapRef, menuRef, style } = useMenuPlacement(open);

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

  const here = tracks.find((track) => track.index === current) ?? null;
  const name = here?.name ?? currentName;

  // One part in the file is not a choice, so it is not a control: the name is
  // said and nothing pretends to open.
  if (tracks.length < 2) {
    return <span className="songs-track-one">{name}</span>;
  }

  return (
    <div className="songs-track-menu" ref={wrapRef}>
      <button
        type="button"
        className="songs-chip songs-track-chip"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("songs.track.choose")}
        onClick={() => setOpen((was) => !was)}
      >
        {here && <span className="songs-track-glyph">{trackGlyph(here)}</span>}
        <span className="songs-track-chip-name">{name}</span>
        <svg
          className="songs-track-caret"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            className="songs-track-pop"
            ref={menuRef}
            style={style}
          >
            <div role="listbox" aria-label={t("songs.track.choose")} className="songs-track-list">
            {tracks.map((track) => {
              const trouble = trackTrouble(track);
              const chosen = track.index === current;
              return (
                <button
                  key={track.index}
                  type="button"
                  role="option"
                  aria-selected={chosen}
                  className="songs-track-row"
                  data-chosen={chosen ? "" : undefined}
                  /* A part with no tuning cannot become a score, so it is
                     listed and not offered — hiding it would look like the
                     file had lost a track. */
                  disabled={trouble === "percussion" || trouble === "notTab"}
                  onClick={() => {
                    setOpen(false);
                    onChoose(track.index);
                  }}
                >
                  <span className="songs-track-row-glyph">{trackGlyph(track)}</span>
                  <span className="songs-track-row-name">{track.name}</span>
                  <span className="songs-track-row-facts">
                    {trouble === null || trouble === "empty"
                      ? `${tuningLabel(track.tuning)} · ${t("songs.picker.strings", {
                          count: track.stringCount,
                        })}`
                      : t(`songs.track.${trouble}`)}
                  </span>
                  {trouble === "empty" && (
                    <span className="songs-track-row-note">{t("songs.track.empty")}</span>
                  )}
                </button>
              );
            })}
            </div>
            {facts && <div className="songs-track-pop-facts">{facts}</div>}
          </div>,
          document.body,
        )}
    </div>
  );
}
