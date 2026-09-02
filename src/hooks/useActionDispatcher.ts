import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  setBeatGroups,
  setBpm,
  notifySettingsChange,
  setSubdivision,
  showFloating,
  startSpeedRamp,
  stopSpeedRamp,
  togglePlayback,
} from "../ipc";
import type { AppState, Subdivision } from "../types";
import type { HotkeyAction } from "../hotkeys";
import { FULLSCREEN_EXIT_DELAY } from "../hotkeys";
import { METER_PRESETS } from "../constants/metronome";

export type ViewName = "beat" | "drill" | "track" | "settings";

interface ActionDispatcherArgs {
  view: ViewName;
  setView: (v: ViewName) => void;
  prevTab: MutableRefObject<"beat" | "drill" | "track">;
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
        actionId === "settings" ||
        actionId === "toggle-widget" ||
        actionId === "toggle-sidebar" ||
        actionId === "toggle-coach"
      ) {
        switch (actionId) {
          case "tab-1":
            setView("beat");
            break;
          case "tab-2":
            setView("drill");
            break;
          case "tab-3":
            setView("track");
            break;
          case "settings":
            if (view === "settings") setView(prevTab.current);
            else {
              prevTab.current = view as "beat" | "drill" | "track";
              setView("settings");
            }
            break;
          case "toggle-widget":
            showFloating();
            break;
          case "toggle-sidebar":
            if (view === "beat" || view === "drill") setSidebarOpen((o) => !o);
            break;
          case "toggle-coach":
            if (view === "beat" || view === "drill") toggleCard();
            break;
        }
        return;
      }
      if (view === "settings") return;
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
          } else if (view === "beat") {
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
        case "sig-next": {
          if (state.freeMode) {
            const total = state.beatGroups.reduce((a, b) => a + b, 0);
            setBeatGroups([total >= 16 ? 1 : total + 1]); notifySettingsChange();
          } else {
            const currentIdx = METER_PRESETS.findIndex(p => JSON.stringify(p.groups) === JSON.stringify(state.beatGroups));
            const nextIdx = (currentIdx === -1 ? 0 : (currentIdx + 1) % METER_PRESETS.length);
            setBeatGroups(METER_PRESETS[nextIdx].groups);
            notifySettingsChange();
          }
          break;
        }
        case "sig-prev": {
          if (state.freeMode) {
            const total = state.beatGroups.reduce((a, b) => a + b, 0);
            setBeatGroups([total <= 1 ? 16 : total - 1]); notifySettingsChange();
          } else {
            const currentIdx = METER_PRESETS.findIndex(p => JSON.stringify(p.groups) === JSON.stringify(state.beatGroups));
            const nextIdx = (currentIdx === -1 ? 0 : (currentIdx - 1 + METER_PRESETS.length) % METER_PRESETS.length);
            setBeatGroups(METER_PRESETS[nextIdx].groups);
            notifySettingsChange();
          }
          break;
        }
        case "fullscreen":
          if (view !== "track") {
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
      state.bpm,
      state.subdivision,
      state.beatGroups,
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
