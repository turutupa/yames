/**
 * "Yames keeps its own copy" — and here it is back.
 *
 * `plans/tasks/songs/W19-FRICTION.md` item 3. Two things that are really one
 * thing: a sentence saying the imported file's bytes live inside Yames, and
 * the button that proves it. Between them they are what makes clearing the
 * Downloads folder safe, and a promise a player cannot act on is a promise
 * they have no reason to believe.
 *
 * The export goes through Rust and a native save dialog because the webview
 * cannot write anywhere — `plugin-fs` is not installed, and a browser-style
 * download is inert inside a Tauri window (`W4-FINDINGS.md` §9).
 *
 * Its own file, mounted in one line, with its own stylesheet: the stage this
 * sits on is being rebuilt on another branch.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { exportScoreSource } from "../../ipc";
import "../../styles/songs-import.css";

export function SongFileNote({ songId }: { songId: string | null }) {
  const { t } = useTranslation();
  /** null nothing to say · "working" mid-dialog · a sentence otherwise. */
  const [said, setSaid] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  if (!songId) return null;

  return (
    <p className="songs-keeps-copy">
      {t("songs.keepsCopy")}{" "}
      <button
        type="button"
        className="songs-find-tab-go"
        disabled={working}
        onClick={() => {
          setWorking(true);
          setSaid(null);
          void exportScoreSource(songId)
            .then((path) => {
              // `null` is the player closing the dialog. Nothing happened,
              // and saying so would be telling them what they just did.
              if (path) setSaid(t("songs.exportDone"));
            })
            .catch(() => setSaid(t("songs.exportFailed")))
            .finally(() => setWorking(false));
        }}
      >
        {working ? t("songs.exporting") : t("songs.exportOriginal")}
      </button>
      {said ? <span className="songs-offer-note"> {said}</span> : null}
    </p>
  );
}
