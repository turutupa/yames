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
 *   - `view`         — the currently displayed tab (beat / drill / track
 *                      / settings).
 *   - `setView`      — wraps the raw setter with side effects: stops
 *                      playback when leaving a play-tab for another play-
 *                      tab, stops the speed-ramp drill when leaving drill
 *                      for settings, persists the new tab (excluding
 *                      `settings`, which is a transient overlay), and
 *                      scrolls track / settings content back to the top.
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

export type PlayTab = "beat" | "drill";

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

  // Restore last active tab on mount.
  useEffect(() => {
    getActiveTab().then((tab) => {
      if (tab === "beat" || tab === "drill") {
        setViewRaw(tab);
        prevTab.current = tab;
      }
    });
  }, []);

  return { view, setView, prevTab, contentRef };
}
