/**
 * The download is caught — the React half.
 *
 * `plans/SONGS.md` S0.9. While Songs is the open mode, Rust lists the
 * Downloads folder; when a Guitar Pro or MusicXML file has finished arriving
 * it says so, and this decides whether the player is shown an offer.
 *
 * The four rules the brief is emphatic about, and where each one lives:
 *
 *   never automatic     nothing here imports. `accept` runs on a press, and
 *                       it hands the file to the same `offerFile` the file
 *                       picker uses, so the track picker still opens and the
 *                       player still chooses their part.
 *   never a system      the offer is a banner on the Songs screen. Nothing in
 *   dialog              this file focuses a window or opens anything.
 *   dismissed stays     `songs/downloadWatch.ts` keeps the list in
 *   dismissed           `settings.json`; Rust is told too, so the next poll a
 *                       second later does not offer it again.
 *   the watcher is      the effect starts it on the way into Songs and stops
 *   gone when the mode  it on the way out — and never starts it at all when
 *   is left             the setting is off.
 *
 * Bytes are read in `accept` and nowhere else.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  dismissDownloadOffer,
  onDownloadOffer,
  readOfferedFile,
  startDownloadWatch,
  stopDownloadWatch,
  storeLoad,
  storeSave,
} from "../../ipc";
import { decodeSource } from "../../songs/library";
import {
  DEFAULT_DOWNLOAD_WATCH,
  DOWNLOAD_WATCH_KEY,
  isDismissed,
  readDownloadWatch,
  withDismissed,
} from "../../songs/downloadWatch";
import type { DownloadOffer, DownloadWatchSetting } from "../../songs/downloadWatch";

export interface DownloadWatch {
  /** The file waiting to be offered, or null. One at a time, oldest first. */
  offer: DownloadOffer | null;
  /** How many more are behind it, so the banner can say "and 2 more". */
  queued: number;
  /** Reading the bytes, between the press and the track picker. */
  opening: boolean;
  /** A sentence, when the file would not open. */
  error: string | null;
  /** Yes: read the bytes and hand them to the importer. */
  accept: () => void;
  /** Not this one — now, and the next time it is seen. */
  dismiss: () => void;
  dismissError: () => void;
}

export type DownloadWatchInput = {
  /** The tab the window is on. The watch exists on "songs" and nowhere else. */
  view: string;
  /** Where a caught file goes: the same door the file picker uses. */
  onFile: (file: File) => void;
};

export function useDownloadWatch({ view, onFile }: DownloadWatchInput): DownloadWatch {
  const [setting, setSetting] = useState<DownloadWatchSetting | null>(null);
  const [queue, setQueue] = useState<DownloadOffer[]>([]);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSongs = view === "songs";

  /**
   * The setting, read once and then kept in step with the Settings screen.
   *
   * `storeSave` does not tell anybody, so the section that owns the switch
   * fires a window event when it writes — the same shape the library's "+"
   * uses to reach this screen's file input. Without it, turning the offer off
   * in Settings would leave a watcher running until the player left Songs.
   */
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      void storeLoad<unknown>(DOWNLOAD_WATCH_KEY)
        .then((stored) => {
          if (!cancelled) setSetting(readDownloadWatch(stored));
        })
        .catch(() => {
          if (!cancelled) setSetting(DEFAULT_DOWNLOAD_WATCH);
        });
    };
    read();
    window.addEventListener("yames:songs-download-setting", read);
    return () => {
      cancelled = true;
      window.removeEventListener("yames:songs-download-setting", read);
    };
  }, []);

  /**
   * The watch itself.
   *
   * Off means no watcher exists — not a watcher that stays quiet — so the
   * effect simply does not start one. A folder that has gone (a removable
   * drive, a synced folder that has not come back) rejects, and that is
   * silent on purpose: it is not the player's fault and there is nothing
   * they can do about it from this screen.
   */
  useEffect(() => {
    if (!setting || !onSongs || !setting.enabled) return;
    void startDownloadWatch(setting.folder).catch(() => {});
    return () => {
      void stopDownloadWatch().catch(() => {});
      // Nothing caught before the player walked away is their business now.
      setQueue([]);
    };
  }, [setting, onSongs]);

  /**
   * What Rust said had arrived.
   *
   * The listener is registered once and reads the setting through a ref: it
   * must not be torn down and rebuilt every time the dismissed list grows, or
   * the offer that caused the growth could arrive in the gap.
   */
  const settingRef = useRef<DownloadWatchSetting | null>(null);
  settingRef.current = setting;
  const onSongsRef = useRef(onSongs);
  onSongsRef.current = onSongs;

  useEffect(() => {
    let cancelled = false;
    const unlisten = onDownloadOffer((incoming) => {
      if (cancelled || !onSongsRef.current) return;
      const current = settingRef.current;
      if (!current || !current.enabled || isDismissed(current, incoming)) return;
      setQueue((q) => (q.some((o) => o.path === incoming.path) ? q : [...q, incoming]));
    });
    return () => {
      cancelled = true;
      void unlisten.then((un) => un()).catch(() => {});
    };
  }, []);

  const offer = queue[0] ?? null;

  const accept = useCallback(() => {
    if (!offer || opening) return;
    setOpening(true);
    setError(null);
    void readOfferedFile(offer.path)
      .then((base64) => {
        const bytes = decodeSource(base64);
        // A `File`, because that is what `offerFile` takes and what the file
        // picker hands it. The caught file goes through exactly the path a
        // chosen one does — same parse, same track picker, same errors.
        //
        // `.buffer` rather than the view: TypeScript 5.7 made `Uint8Array`
        // generic over its buffer, so a plain `Uint8Array` is no longer a
        // `BlobPart` (it might be backed by a `SharedArrayBuffer`). The
        // buffer `decodeSource` allocates is exactly this file's bytes and
        // nothing else's, so handing it over whole is the same bytes.
        onFile(new File([bytes.buffer as ArrayBuffer], offer.fileName));
        setQueue((q) => q.slice(1));
      })
      .catch((err) => {
        setError(typeof err === "string" ? err : String(err));
      })
      .finally(() => setOpening(false));
  }, [offer, opening, onFile]);

  const dismiss = useCallback(() => {
    if (!offer) return;
    setQueue((q) => q.slice(1));
    // Rust first, so the next poll — which may be half a second away — does
    // not put it straight back.
    void dismissDownloadOffer(offer.fileName).catch(() => {});
    setSetting((current) => {
      const next = withDismissed(current ?? DEFAULT_DOWNLOAD_WATCH, offer);
      void storeSave(DOWNLOAD_WATCH_KEY, next).catch(() => {});
      return next;
    });
  }, [offer]);

  return {
    offer,
    queued: Math.max(0, queue.length - 1),
    opening,
    error,
    accept,
    dismiss,
    dismissError: useCallback(() => setError(null), []),
  };
}
