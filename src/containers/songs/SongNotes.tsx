/**
 * What the importer had to say about this file — said once, then put away.
 *
 * The owner, 2026-09-21, looking at a 1124 px window with three rows of
 * furniture above the music: the tempo warning *"The tempo slides in 1 bar.
 * Yames steps it at the bar line instead."* had been sitting in a bordered
 * banner over the tab since the file was imported, and would have gone on
 * sitting there for ever. It is true, it is worth knowing once, and it is not
 * worth thirty pixels of every practice session.
 *
 * So: a quiet toast the first time the song is opened (`songs/notesSeen.ts`
 * remembers which songs have had theirs), and after that a small mark beside
 * the title that opens the same lines. Nothing is lost and nothing is
 * permanent.
 *
 * The mark is deliberately the same size as the head's chips and deliberately
 * not in the accent: this is a note about a file, not a problem with it — the
 * piece plays either way — and a warning colour beside the song's name reads
 * as "something is wrong with your song".
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useMenuPlacement } from "../jam/useMenuPlacement";
import { loadNotesSeen, saveNotesSeen, withSeen } from "../../songs/notesSeen";

/** A circled i. A note, not an alarm. */
function NoteGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <line x1="12" y1="7.6" x2="12" y2="7.7" />
    </svg>
  );
}

/**
 * Has this song's notes been shown yet, and the toast if they have not.
 *
 * The store is read once per song. A song with nothing to say never writes
 * anything down: there is no point remembering that a file Yames had no
 * comment on was not commented on.
 */
export function useSongNotesSeen(songId: string | null, hasNotes: boolean) {
  const [showToast, setShowToast] = useState(false);
  /** The id the toast on screen belongs to, so a song change closes it. */
  const shownFor = useRef<string | null>(null);

  useEffect(() => {
    if (!songId || !hasNotes) {
      setShowToast(false);
      shownFor.current = null;
      return;
    }
    if (shownFor.current === songId) return;
    shownFor.current = songId;
    let alive = true;
    void (async () => {
      const seen = await loadNotesSeen();
      if (!alive || seen.includes(songId)) return;
      setShowToast(true);
      await saveNotesSeen(withSeen(seen, songId));
    })();
    return () => {
      alive = false;
    };
  }, [songId, hasNotes]);

  return { showToast, dismissToast: () => setShowToast(false) };
}

export interface SongNotesProps {
  /** Lines the importer wrote, already in the player's language. */
  notes: string[];
}

/**
 * The mark, beside the title, and the panel behind it.
 *
 * Portalled and placed by Jam's `useMenuPlacement`, like every other menu in
 * this app: it opens from the app's own top bar now, and a panel drawn as a
 * child of that bar would be clipped by it.
 */
export function SongNotesMark({ notes }: SongNotesProps) {
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

  if (notes.length === 0) return null;

  return (
    <div className="songs-notes" ref={wrapRef}>
      <button
        type="button"
        className="songs-chip songs-notes-mark"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t("songs.notes.label")}
        title={t("songs.notes.label")}
        onClick={() => setOpen((was) => !was)}
      >
        <NoteGlyph />
      </button>
      {open &&
        createPortal(
          <div
            className="songs-notes-pop"
            role="dialog"
            aria-label={t("songs.notes.label")}
            ref={menuRef}
            style={style}
          >
            <p className="songs-notes-title">{t("songs.notes.label")}</p>
            <ul className="songs-notes-list">
              {notes.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * The same lines, once, when the song is first opened.
 *
 * Over the foot of the stage rather than in the column: a toast that took a
 * row would be the banner again with a timer on it. `role="status"` and not
 * `alert` — nothing here is urgent, the piece plays, and an alert interrupts
 * whatever a screen-reader user was doing.
 */
export function SongNotesToast({ notes, onDismiss }: SongNotesProps & { onDismiss: () => void }) {
  const { t } = useTranslation();

  // Goes on its own after a while, like every other quiet thing in this app.
  // Cleared on unmount, so a song swapped underneath it cannot dismiss the
  // next song's toast.
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 12_000);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  if (notes.length === 0) return null;

  return (
    <div className="songs-notes-toast" role="status" aria-live="polite">
      <div className="songs-notes-toast-body">
        <p className="songs-notes-title">{t("songs.notes.label")}</p>
        <ul className="songs-notes-list">
          {notes.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
      <button type="button" className="songs-btn songs-notes-toast-ok" onClick={onDismiss}>
        {t("songs.dismiss")}
      </button>
    </div>
  );
}
