import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import {
  getActiveTab,
  setActiveTab,
  setPlaying,
  stopSpeedRamp,
} from "../../../ipc";
import {
  DEBUG_SCREEN_SETTINGS,
  MOBILE_DEBUG_SCREENS,
} from "../../../platform";
import type { MainView } from "../MainHeader";

/**
 * Owns the active tab and the transition rules between tabs:
 *
 *   - `view`         — the currently displayed tab (beat / setlist / drill
 *                      / jam / settings).
 *   - `mode`         — the MODE the app is in: `view`, except under Settings,
 *                      where it is the mode Settings was opened from. Anything
 *                      that asks "is the jam (or the setlist, or the drill)
 *                      what is going on?" asks this, not `view`.
 *   - `setView`      — wraps the raw setter with side effects: stops playback
 *                      when the MODE changes, persists the new tab (excluding
 *                      `settings`, which is a transient overlay), remembers
 *                      where Settings was opened from, and scrolls Settings
 *                      back to the top.
 *   - `prevTab`      — the same mode as `mode`, as a ref, for callbacks that
 *                      must not re-subscribe when it changes. Written ONLY
 *                      here.
 *   - `contentRef`   — passed down to the scrollable content container.
 *                      Owned here so `setView` can scroll it to the top
 *                      without prop-drilling.
 *
 * SETTINGS IS A LAYER, NOT A PLACE (2026-09-16). It used to count as leaving
 * whatever was under it: a jam took its band off the engine the moment
 * Settings opened, so a playing jam fell back to the bare click, and came back
 * when Settings closed. A drill had its climb stopped. Going Settings -> another
 * mode skipped the playback stop that going there directly performs, because
 * the tab being left was "settings". And three of the doors into Settings never
 * recorded where they came from, so closing it could land on a stale mode.
 *
 * Now: opening Settings changes nothing underneath, closing it returns to the
 * mode it covered, and leaving it for a different mode is exactly a mode
 * change from the one it covered.
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
export const PLAY_TABS = ["beat", "setlist", "drill", "jam"] as const;

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
  mode: PlayTab;
  setView: (v: MainView) => void;
  prevTab: MutableRefObject<PlayTab>;
  contentRef: RefObject<HTMLDivElement>;
}

export function useTabRouting({
  isPlaying,
  speedRampActive,
}: UseTabRoutingArgs): TabRouting {
  const [view, setViewRaw] = useState<MainView>("beat");
  const [mode, setMode] = useState<PlayTab>("beat");
  const prevTab = useRef<PlayTab>("beat");
  const viewRef = useRef<MainView>("beat");
  const contentRef = useRef<HTMLDivElement>(null);

  // The latest transport facts, read at the moment of a switch rather than
  // captured by it — `setView` is handed to a dozen callbacks and must not be
  // a new function on every beat.
  const liveRef = useRef({ isPlaying, speedRampActive });
  liveRef.current = { isPlaying, speedRampActive };

  const setView = useCallback((v: MainView) => {
    const from = viewRef.current;
    if (from === v) return;
    // The mode being left: under Settings, the one Settings covers.
    const leaving: PlayTab = from === "settings" ? prevTab.current : from;
    if (v === "settings") {
      // Opening Settings: remember what it covers, touch nothing else.
      prevTab.current = leaving;
    } else {
      if (v !== leaving) {
        const { isPlaying: playing, speedRampActive: ramping } = liveRef.current;
        if (playing) void setPlaying(false);
        if (ramping) void stopSpeedRamp();
      }
      prevTab.current = v;
      setMode(v);
      setActiveTab(v);
    }
    viewRef.current = v;
    setViewRaw(v);
    if (v === "settings") {
      setTimeout(() => contentRef.current?.scrollTo(0, 0), 0);
    }
  }, []);

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
   * `settings` is never persisted, so it can never arrive. And a restore that
   * lands after the user has already moved is dropped: their click wins.
   */
  useEffect(() => {
    getActiveTab().then((tab) => {
      // The one screen a headless simulator cannot otherwise be put on — see
      // `MOBILE_DEBUG_SCREENS`. `false` in every build but the screenshot job,
      // so this whole branch and the string it compares against fold away.
      if (MOBILE_DEBUG_SCREENS && tab === DEBUG_SCREEN_SETTINGS) {
        setViewRaw("settings");
        return;
      }
      if (!isPlayTab(tab)) return;
      if (viewRef.current !== "beat" || prevTab.current !== "beat") return;
      viewRef.current = tab;
      prevTab.current = tab;
      setViewRaw(tab);
      setMode(tab);
    });
  }, []);

  return { view, mode, setView, prevTab, contentRef };
}
