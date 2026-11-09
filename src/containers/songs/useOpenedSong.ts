/**
 * "Open with Yames" — the React half.
 *
 * `plans/SONGS.md` S0.9. A player who has a Guitar Pro file already, or who
 * has just downloaded one and found it in their file manager, double-clicks
 * it and lands on the track picker. Two doors, and Rust has already made them
 * one (`commands.rs`, `queue_opened_paths`):
 *
 *   cold start   the path was in `std::env::args()` before a window existed
 *   running      a second process was started and `single-instance` handed
 *                its command line to this one, which then emits
 *                `songs-open-file`
 *
 * So this asks once on mount, and again whenever that event arrives. The
 * webview never supplies a path — it asks whether the OS handed this process
 * one, and gets back bytes.
 *
 * Switching to Songs is done here rather than in Rust because the tab is the
 * frontend's idea: `setView` is what the rail and the hotkeys use, and going
 * round it would leave the rail highlighting a tab nobody is on.
 */
import { useCallback, useEffect, useRef } from "react";
import { onOpenFile, setActiveTab, takePendingOpen } from "../../ipc";
import { decodeSource } from "../../songs/library";

export type OpenedSongInput = {
  /**
   * Walk to a tab, the way the rail does.
   *
   * `"songs"` and nothing else is ever passed, so the narrow type is the
   * honest one — and it means this hook cannot send the window somewhere a
   * mode does not exist.
   */
  setView: (view: "songs") => void;
  /** Where the file goes: the same door the picker and the drop target use. */
  onFile: (file: File) => void;
};

export function useOpenedSong({ setView, onFile }: OpenedSongInput): void {
  // Both through a ref: the effect below registers its listener once, and
  // must not be torn down and rebuilt every time the session it hands files
  // to is re-created — a file arriving in that gap would be lost, and it was
  // taken out of the queue before it went missing.
  const sink = useRef({ setView, onFile });
  sink.current = { setView, onFile };

  const collect = useCallback(() => {
    void takePendingOpen()
      .then((opened) => {
        if (!opened) return;
        sink.current.setView("songs");
        // The rail's own idea of where it is, so the tab survives a restart.
        void setActiveTab("songs").catch(() => {});
        const bytes = decodeSource(opened.base64);
        // See `useDownloadWatch` for why this is `.buffer`: TypeScript 5.7
        // made `Uint8Array` generic over its buffer and a plain one is no
        // longer a `BlobPart`. `decodeSource` allocates exactly these bytes.
        sink.current.onFile(new File([bytes.buffer as ArrayBuffer], opened.fileName));
        // There may be a second: a file manager will happily start Yames
        // with two files selected.
        collect();
      })
      .catch(() => {
        // Nothing waiting, or a build without the command. Either way there
        // is nothing to tell the player: they did not ask this screen for
        // anything.
      });
  }, []);

  useEffect(() => {
    collect();
    let cancelled = false;
    const unlisten = onOpenFile(() => {
      if (!cancelled) collect();
    });
    return () => {
      cancelled = true;
      void unlisten.then((un) => un()).catch(() => {});
    };
  }, [collect]);
}
