import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listTakes } from "../../ipc";
import type { LibrarySong } from "../../songs/songFiles";

/**
 * "Remove this song?" — the one destructive thing the library can do (W35).
 *
 * Everything else in the sidebar is reversible: a rename can be typed back, a
 * jam duplicated, a preset saved again. This takes every part of the file out
 * of the store — and with each part goes every attempt at it, everything the
 * coach remembers about it and every take filed against it — and Yames's own
 * copy of the file, which is the copy the tab is drawn from. There is no undo
 * and there is nothing left to import from except the original the player
 * still has somewhere.
 *
 * So it says so, with the number of takes in it. The count is asked for when
 * the dialog opens rather than kept on the row: it is one call per part, and
 * only at the moment somebody is about to lose them. Until it answers the
 * line is simply absent — a confirm that flickered a number into place under
 * the reader's eye would be worse than one that waited.
 *
 * Shaped after `UnsavedChangesDialog`: Escape and the backdrop cancel, focus
 * lands on the safe button, and the destructive one has to be aimed at.
 */
export function DeleteSongDialog({
  song,
  onConfirm,
  onCancel,
}: {
  song: LibrarySong;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const keepRef = useRef<HTMLButtonElement>(null);
  /** `null` until every part has answered. */
  const [takes, setTakes] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(song.parts.map((p) => listTakes(p.id).catch(() => [])))
      .then((lists) => {
        if (!cancelled) setTakes(lists.reduce((n, list) => n + list.length, 0));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [song]);

  useEffect(() => {
    keepRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div className="unsaved-overlay" onClick={onCancel}>
      <div
        className="unsaved-card song-remove-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="song-remove-title"
        aria-describedby="song-remove-body"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="unsaved-head">
          <span className="unsaved-glyph" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.6 21 19H3z" />
              <path d="M12 10v4" />
              <path d="M12 17.2v.01" />
            </svg>
          </span>
          <span className="unsaved-title" id="song-remove-title">
            {t("songs.library.removeTitle", { name: song.name })}
          </span>
        </div>

        <p className="unsaved-body" id="song-remove-body">
          {t("songs.library.removeBody")}
        </p>
        {takes !== null && (
          <p className="song-remove-takes">
            {takes > 0
              ? t("songs.library.removeTakes", { count: takes })
              : t("songs.library.removeNoTakes")}
          </p>
        )}

        <div className="unsaved-actions">
          <span className="unsaved-spacer" />
          <button ref={keepRef} className="unsaved-save" onClick={onCancel}>
            {t("songs.library.removeCancel")}
          </button>
          <button className="unsaved-discard song-remove-confirm" onClick={onConfirm}>
            {t("songs.library.removeConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
