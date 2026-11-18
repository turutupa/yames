import { useEffect, useState } from "react";
import { storeLoad } from "../../../ipc";

/**
 * The setlist and the jam you last had open, for the Tools page's LAST line
 * (acceptance P2-13, 2026-11-18).
 *
 * Both tools already write the id down when one is put on the stage or saved
 * (`lastSetlistId` in `useSetlistSession`, `lastJamId` in `useJamSession`),
 * and read it back to reopen it. Without a tool open in this run, though, the
 * card had nothing to say: it only read what was loaded in memory. This reads
 * the same two keys, each time the page is shown, so the card can name what
 * the tool will open on.
 *
 * Ids only: the caller looks them up in the library, so a setlist or a jam
 * deleted since is not named.
 */
export const LAST_SETLIST_KEY = "lastSetlistId";
export const LAST_JAM_KEY = "lastJamId";

export function useLastUsed(active: boolean): { setlistId?: string; jamId?: string } {
  const [ids, setIds] = useState<{ setlistId?: string; jamId?: string }>({});
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const read = (key: string) => storeLoad<string>(key).catch(() => undefined);
    void Promise.all([read(LAST_SETLIST_KEY), read(LAST_JAM_KEY)]).then(([setlistId, jamId]) => {
      if (!alive) return;
      setIds((prev) =>
        prev.setlistId === setlistId && prev.jamId === jamId
          ? prev
          : {
              setlistId: typeof setlistId === "string" ? setlistId : undefined,
              jamId: typeof jamId === "string" ? jamId : undefined,
            },
      );
    });
    return () => {
      alive = false;
    };
  }, [active]);
  return ids;
}
