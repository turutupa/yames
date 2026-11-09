/**
 * The quiet "due" mark on a song in the library.
 *
 * `COACH_UX.md` C2: at most a few things, each one tap to start, never a
 * backlog and never a streak to protect. Tonight that is one mark on one row
 * — the coach promised to come back to a passage of that song, and the day
 * has come round.
 *
 * The rail and the review are in different halves of the window and neither
 * owns the other, so the promise travels through the store and a window
 * event, the way the rail's "+" already reaches the Songs file input
 * (`SongsView.tsx`). Two readers of one file rather than a prop threaded
 * through the shell — and the store is the truth either way, because the
 * promise outlives the session that made it.
 */
import { useEffect, useState } from "react";
import { dayOf, listSongDue, songsDueOn } from "../../../songs/due";

/** Fired when a promise is made or cleared, so the rail re-reads. */
export const SONGS_DUE_EVENT = "yames:songs-due-changed";

/** Tell every listener the promises moved. */
export function announceSongsDue(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SONGS_DUE_EVENT));
}

/** The song ids with something due today or overdue. */
export function useSongsDue(): ReadonlySet<string> {
  const [due, setDue] = useState<ReadonlySet<string>>(() => new Set<string>());

  useEffect(() => {
    let alive = true;
    const read = () => {
      void listSongDue().then((items) => {
        if (alive) setDue(songsDueOn(items, dayOf()));
      });
    };
    read();
    window.addEventListener(SONGS_DUE_EVENT, read);
    return () => {
      alive = false;
      window.removeEventListener(SONGS_DUE_EVENT, read);
    };
  }, []);

  return due;
}
