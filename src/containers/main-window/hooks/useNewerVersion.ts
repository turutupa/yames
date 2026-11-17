import { useCallback, useEffect, useRef, useState } from "react";
import { storeLoad, storeSave, openUrl } from "../../../ipc";
import {
  ASKED_AT_KEY,
  DOWNLOAD_PAGE_URL,
  HIDDEN_KEY,
  LATEST_KEY,
  askForNewest,
  isNewer,
  timeToAsk,
} from "../../../mobile/newerVersion";

/**
 * The one line of state behind "version 1.3.0 is out".
 *
 * `newest` is the version to offer, or "" when there is nothing to say — which
 * is every desktop build, every store build, every phone that is up to date,
 * and every phone whose owner has already waved this version away.
 */
export interface NewerVersion {
  newest: string;
  /** Open the download page in the phone's own browser. */
  getIt: () => void;
  /** Not this one. The next one still gets to speak. */
  hide: () => void;
}

/** What a build that never asks reports. A frozen object, so it is the same
 *  reference on every render and no memo downstream is invalidated by it. */
export const NEVER_NEWER: NewerVersion = Object.freeze({
  newest: "",
  getIt: () => {},
  hide: () => {},
});

/**
 * Ask once a day, when the app is opened, and never while the click runs.
 *
 * Three rules, and each of them is about not being in the way:
 *
 *   - **Once a day.** The answer is kept, so a phone opened six times in an
 *     afternoon asks once and still shows the notice the other five times.
 *   - **When the app is opened.** There is no timer and no listener; this is a
 *     mount effect and nothing else. Nothing happens in the background,
 *     because an app that reaches the network while it is not on screen is an
 *     app that has to explain itself.
 *   - **Never while playing.** The click is sacred. If a routine is running
 *     when the app opens — the setlist resumed, a jam under way — the ask
 *     waits for the stop rather than putting a request and a JSON parse on the
 *     same thread as the beat.
 *
 * The build-time gate is at the CALL site, not in here — `SAYS_WHEN_NEWER ?
 * useNewerVersion(…) : NEVER_NEWER` in `MainWindow`. That is what lets Rollup
 * drop this module, `mobile/newerVersion.ts` and both web addresses out of
 * every build that is not the website's phone build.
 */
export function useNewerVersion({
  appVersion,
  isPlaying,
}: {
  appVersion: string;
  isPlaying: boolean;
}): NewerVersion {
  const [newest, setNewest] = useState("");
  /** One ask per app open, however many times the effect is re-run. */
  const asked = useRef(false);

  useEffect(() => {
    // "0.0.0" is `useAppUpdates` saying Tauri has not answered yet. Comparing
    // against it would call every release newer.
    if (appVersion === "0.0.0") return;
    // The click first. The effect runs again when it stops.
    if (isPlaying) return;
    if (asked.current) return;
    asked.current = true;

    let live = true;
    (async () => {
      const [askedAt, remembered, hidden] = await Promise.all([
        storeLoad<number>(ASKED_AT_KEY),
        storeLoad<string>(LATEST_KEY),
        storeLoad<string>(HIDDEN_KEY),
      ]);

      let latest = remembered;
      if (timeToAsk(askedAt, Date.now())) {
        const answer = await askForNewest();
        // A failed ask is not an answer: the day's slot is only used up when
        // something actually came back, so a phone that was offline this
        // morning asks again this afternoon rather than tomorrow.
        if (answer !== null) {
          latest = answer;
          await storeSave(ASKED_AT_KEY, Date.now());
          await storeSave(LATEST_KEY, answer);
        }
      }

      if (!live) return;
      if (!latest || latest === hidden) return;
      if (!isNewer(latest, appVersion)) return;
      setNewest(latest);
    })().catch(() => {
      // Silent, always. Nothing here is worth a word to someone practising.
    });

    return () => {
      live = false;
    };
  }, [appVersion, isPlaying]);

  const getIt = useCallback(() => {
    openUrl(DOWNLOAD_PAGE_URL).catch(() => {});
  }, []);

  const hide = useCallback(() => {
    const version = newest;
    setNewest("");
    // The version, not a flag: the next release is a different string and
    // has its own say.
    if (version) storeSave(HIDDEN_KEY, version).catch(() => {});
  }, [newest]);

  return { newest, getIt, hide };
}
