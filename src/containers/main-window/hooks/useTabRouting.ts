import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import {
  getActiveTab,
  setActiveTab,
  setPlaying,
  stopSpeedRamp,
} from "../../../ipc";
import type { MainView } from "../MainHeader";

/**
 * Owns the active tab and the transition rules between tabs:
 *
 *   - `view`         — the currently displayed tab (beat / setlist / drill
 *                      / settings).
 *   - `setView`      — wraps the raw setter with side effects: stops
 *                      playback when leaving a play-tab for another play-
 *                      tab, stops the speed-ramp drill when leaving drill
 *                      for settings, persists the new tab (excluding
 *                      `settings`, which is a transient overlay), and
 *                      scrolls the tab's content back to the top.
 *   - `prevTab`      — remembers the last "real" (non-settings) tab so
 *                      that closing settings returns to where the user
 *                      came from.
 *   - `contentRef`   — passed down to the scrollable content container.
 *                      Owned here so `setView` can scroll it to the top
 *                      without prop-drilling.
 *
 * On mount, the persisted tab is read back from the Tauri store and
 * applied (skipping `settings`, which is never persisted as a default).
 */

/**
 * The tabs that are a place to be, as opposed to `settings`, which is an
 * overlay you return from.
 *
 * A runtime array rather than only a type, because the persisted tab arrives
 * as an unchecked string and something has to narrow it.
 */
export const PLAY_TABS = ["beat", "setlist", "drill"] as const;

export type PlayTab = (typeof PLAY_TABS)[number];

function isPlayTab(tab: string): tab is PlayTab {
  return (PLAY_TABS as readonly string[]).includes(tab);
}

export interface UseTabRoutingArgs {
  isPlaying: boolean;
  speedRampActive: boolean;
}

export interface TabRouting {
  view: MainView;
  setView: (v: MainView) => void;
  prevTab: MutableRefObject<PlayTab>;
  contentRef: RefObject<HTMLDivElement>;
}

export function useTabRouting({
  isPlaying,
  speedRampActive,
}: UseTabRoutingArgs): TabRouting {
  const [view, setViewRaw] = useState<MainView>("beat");
  const prevTab = useRef<PlayTab>("beat");
  const contentRef = useRef<HTMLDivElement>(null);

  const setView = useCallback(
    (v: MainView) => {
      setViewRaw((prev) => {
        // Stop playback when leaving the current tab for another non-
        // settings tab. Settings is a transient overlay — staying on it
        // shouldn't kill playback.
        if (prev !== v && prev !== "settings" && v !== "settings") {
          if (isPlaying) setPlaying(false);
          if (speedRampActive) stopSpeedRamp();
        }
        // Stop the drill if leaving the drill tab for settings.
        if (prev === "drill" && v === "settings" && speedRampActive) {
          stopSpeedRamp();
        }
        return v;
      });
      if (v !== "settings") {
        setActiveTab(v);
      }
      if (v === "settings") {
        setTimeout(() => contentRef.current?.scrollTo(0, 0), 0);
      }
    },
    [isPlaying, speedRampActive],
  );

  /**
   * Restore the tab the app was last on.
   *
   * The guard is what makes the stored string safe to use, and it has to list
   * every play tab: it said `beat || drill` for as long as those were the only
   * two, so when setlists became a mode the app went on persisting "setlist"
   * and then silently dropping it — quit on the setlist and you came back to
   * the metronome. Derived from PLAY_TABS now, so the next mode cannot be
   * forgotten here.
   *
   * `settings` is never persisted, so it can never arrive.
   */
  useEffect(() => {
    getActiveTab().then((tab) => {
      if (!isPlayTab(tab)) return;
      setViewRaw(tab);
      prevTab.current = tab;
    });
  }, []);

  return { view, setView, prevTab, contentRef };
}
