import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  setBeatGroups,
  setBpm,
  setSubdivision,
  showFloating,
  startSpeedRamp,
  stopSpeedRamp,
  togglePlayback,
} from "../ipc";
import { markWidgetOpened } from "../containers/onboarding/hints/hintRuntime";
import type { AppState, Subdivision } from "../types";
import type { HotkeyAction } from "../hotkeys";
import { FULLSCREEN_EXIT_DELAY } from "../hotkeys";
import { meterKey, stepMeter } from "../utils/meter";

export type ViewName = "beat" | "drill" | "setlist" | "jam" | "settings";

interface ActionDispatcherArgs {
  view: ViewName;
  setView: (v: ViewName) => void;
  prevTab: MutableRefObject<"beat" | "drill" | "setlist" | "jam">;
  /** Whether the setlist tab has one open — with none, there is nothing to start. */
  setlistLoaded: boolean;
  /** Same for the jam tab, and the same reason: an empty stage starts nothing. */
  jamLoaded: boolean;
  /**
   * Whether the groove editor drawer is down.
   *
   * While it is, the hands-free jam keys stand aside: `G` steps to the next
   * preset groove, and stepping a groove throws `customGroove` away — which
   * over an open editor means the pattern you are drawing disappears under
   * your hands. Nothing you can press by accident may delete work in progress.
   */
  jamEditorOpen: boolean;
  /**
   * Play, on the jam tab. Not `togglePlayback` — a jam with a count-in has to
   * arm it first, and only the window knows which jam is loaded.
   */
  onToggleJam: () => void;
  /**
   * The hands-free jam actions (JAM_MODE §4.7), for a footswitch.
   *
   * Passed in as one object rather than five callbacks because they are one
   * feature and they all come from the same hook; the dispatcher's job here is
   * only to decide that the jam tab is open and a jam is loaded.
   */
  jamActions: {
    nextGroove: () => void;
    prevGroove: () => void;
    toggleTrade: () => void;
    toggleDropOut: () => void;
    nextShape: () => void;
    nextSection: () => void;
    prevSection: () => void;
    loopSection: () => void;
    toggleTakes: () => void;
  };
  state: AppState;
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  setIsOsFullscreen: (v: boolean) => void;
  setSidebarOpen: (updater: boolean | ((prev: boolean) => boolean)) => void;
  toggleCard: () => void;
  forceWebviewFocus: () => Promise<void>;
}

/**
 * The single keyboard / MIDI / gamepad / footswitch action dispatcher.
 *
 * Tab / settings / widget / sidebar actions are universal — they work even
 * when the user is on the Settings tab. Everything else is no-op'd when on
 * Settings to avoid stealing focus while the user is typing into a binding
 * capture field.
 *
 * Fullscreen ("zen") needs special handling on macOS: when leaving the OS
 * fullscreen we have to wait for the animation to finish, re-apply
 * always-on-top, and force-focus the webview. The `forceWebviewFocus`
 * helper handles that final webview-focus step.
 */
export function useActionDispatcher({
  view,
  setView,
  prevTab,
  setlistLoaded,
  jamLoaded,
  jamEditorOpen,
  onToggleJam,
  jamActions,
  state,
  isFullscreen,
  setIsFullscreen,
  setIsOsFullscreen,
  setSidebarOpen,
  toggleCard,
  forceWebviewFocus,
}: ActionDispatcherArgs) {
  const handleBpmChange = useCallback((value: number) => {
    const clamped = Math.max(20, Math.min(300, value));
    setBpm(clamped);
  }, []);

  return useCallback(
    (actionId: HotkeyAction) => {
      // Universal actions — work from any view.
      if (
        actionId === "tab-1" ||
        actionId === "tab-2" ||
        actionId === "tab-3" ||
        actionId === "tab-4" ||
        actionId === "settings" ||
        actionId === "toggle-widget" ||
        actionId === "toggle-sidebar" ||
        actionId === "toggle-coach"
      ) {
        switch (actionId) {
          // In rail order: Metronome, Setlist, Drill, Jam.
          case "tab-1":
            setView("beat");
            break;
          case "tab-2":
            setView("setlist");
            break;
          case "tab-3":
            setView("drill");
            break;
          case "tab-4":
            setView("jam");
            break;
          case "settings":
            if (view === "settings") setView(prevTab.current);
            else {
              prevTab.current = view as "beat" | "drill" | "setlist" | "jam";
              setView("settings");
            }
            break;
          case "toggle-widget":
            // Same bookkeeping as the header button — the `widget-discover`
            // hint must not offer a feature the user already uses.
            void markWidgetOpened();
            showFloating();
            break;
          case "toggle-sidebar":
            if (view === "beat" || view === "drill" || view === "jam")
              setSidebarOpen((o) => !o);
            break;
          case "toggle-coach":
            // The coach listens on a jam exactly as it does on the metronome,
            // so the key that opens it has to work there too.
            if (view === "beat" || view === "drill" || view === "jam") toggleCard();
            break;
        }
        return;
      }
      if (view === "settings") return;

      /**
       * On a jam, the groove owns the meter.
       *
       * A jam is a meter plus a table, and the engine refuses the table when
       * `ticksPerBeat × beatsPerBar` disagrees with its own bar length. So the
       * meter keys, which are exactly right on the metronome tab, are exactly
       * wrong here: they move the engine's grid out from under the groove that
       * was written on it, and the failure is silent — the plain click plays
       * while the timeline keeps animating a band that stopped. The meter you
       * want is the groove you pick, or the bar you draw in the editor.
       */
      if (
        view === "jam" &&
        jamLoaded &&
        (actionId.startsWith("sub-") || actionId.startsWith("sig-"))
      )
        return;

      /**
       * The jam actions, before the blur below.
       *
       * They only mean anything with a jam on the stage, and they mean
       * nothing anywhere else — pressing G on the metronome tab must not
       * silently change a jam you are not looking at. Nor over the groove
       * editor: the drawer is a text-free surface you draw on, and the same
       * `G` that is a footswitch stomp on stage would step the groove and take
       * the half-finished pattern with it.
       */
      if (actionId.startsWith("jam-")) {
        if (view !== "jam" || !jamLoaded || jamEditorOpen) return;
        switch (actionId) {
          case "jam-next-groove":
            jamActions.nextGroove();
            break;
          case "jam-prev-groove":
            jamActions.prevGroove();
            break;
          case "jam-trade":
            jamActions.toggleTrade();
            break;
          case "jam-dropout":
            jamActions.toggleDropOut();
            break;
          case "jam-next-shape":
            jamActions.nextShape();
            break;
          case "jam-next-section":
            jamActions.nextSection();
            break;
          case "jam-prev-section":
            jamActions.prevSection();
            break;
          case "jam-loop-section":
            jamActions.loopSection();
            break;
          case "jam-take":
            jamActions.toggleTakes();
            break;
        }
        return;
      }

      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      switch (actionId) {
        case "play":
          if (view === "drill") {
            if (state.speedRamp?.active) {
              stopSpeedRamp();
            } else {
              startSpeedRamp();
            }
          } else if (view === "setlist") {
            // The setlist tab can be opened with nothing in it, and the play
            // key there must not quietly start a bare metronome click behind
            // an empty screen.
            if (setlistLoaded) togglePlayback();
          } else if (view === "jam") {
            // Same rule as the setlist: the jam tab can be open with nothing
            // loaded, and the play key there must not start a bare click
            // behind an empty screen. A loaded jam arms its count-in first,
            // which is why this is the window's callback rather than a toggle.
            if (jamLoaded) onToggleJam();
          } else if (view === "beat") {
            // A setlist starts with the same transport the metronome does —
            // the runner picks it up from `isPlaying`. Without this branch
            // the play key would do nothing at all on the setlist tab, which
            // is the shape of bug a new `view` value quietly introduces.
            togglePlayback();
          }
          break;
        case "bpm-up":
          handleBpmChange(state.bpm + 5);
          break;
        case "bpm-down":
          handleBpmChange(state.bpm - 5);
          break;
        case "bpm-up-1":
          handleBpmChange(state.bpm + 1);
          break;
        case "bpm-down-1":
          handleBpmChange(state.bpm - 1);
          break;
        case "sub-next": {
          const subs: Subdivision[] = [1, 2, 3, 4, 5, 6];
          const idx = subs.indexOf(state.subdivision as Subdivision);
          setSubdivision(subs[(idx + 1) % subs.length]);
          break;
        }
        case "sub-prev": {
          const subs: Subdivision[] = [1, 2, 3, 4, 5, 6];
          const idx = subs.indexOf(state.subdivision as Subdivision);
          setSubdivision(subs[(idx - 1 + subs.length) % subs.length]);
          break;
        }
        case "sub-1": setSubdivision(1); break;
        case "sub-2": setSubdivision(2); break;
        case "sub-3": setSubdivision(3); break;
        case "sub-4": setSubdivision(4); break;
        // No notifySettingsChange() — useSession watches the meter and
        // fires ONE debounced coach boundary for a burst of changes.
        // `stepMeter` handles the FREE-mode branch (step the beat count,
        // wrapping) vs. the grouped branch (walk the preset list).
        case "sig-next":
          setBeatGroups(stepMeter(state.beatGroups, state.freeMode, 1));
          break;
        case "sig-prev":
          setBeatGroups(stepMeter(state.beatGroups, state.freeMode, -1));
          break;
        case "fullscreen":
          if (isFullscreen) {
            (async () => {
              const win = getCurrentWindow();
              if (await win.isFullscreen()) {
                await win.setFullscreen(false);
                await new Promise((r) =>
                  setTimeout(r, FULLSCREEN_EXIT_DELAY),
                );
              }
              setIsFullscreen(false);
              await win.setAlwaysOnTop(state.alwaysOnTop);
              await win.setFocus();
              await forceWebviewFocus();
            })();
          } else {
            setIsFullscreen(true);
          }
          break;
        case "os-fullscreen": {
          (async () => {
            const win = getCurrentWindow();
            const isFull = await win.isFullscreen();
            await win.setFullscreen(!isFull);
            setIsOsFullscreen(!isFull);
            if (isFull) {
              await new Promise((r) => setTimeout(r, FULLSCREEN_EXIT_DELAY));
              await win.setAlwaysOnTop(state.alwaysOnTop);
              await win.setFocus();
              await forceWebviewFocus();
            }
          })();
          break;
        }
      }
    },
    [
      view,
      jamLoaded,
      jamEditorOpen,
      onToggleJam,
      jamActions,
      state.bpm,
      state.subdivision,
      // Stable key — `state.beatGroups` is a fresh array on every
      // state-changed event, so the reference alone rebuilt the
      // callback on every beat.
      meterKey(state.beatGroups),
      state.freeMode,
      state.speedRamp?.active,
      state.alwaysOnTop,
      isFullscreen,
      setView,
      setIsFullscreen,
      setIsOsFullscreen,
      setSidebarOpen,
      toggleCard,
      prevTab,
      handleBpmChange,
      forceWebviewFocus,
    ],
  );
}
