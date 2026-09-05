import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { onFullscreenChanged } from "../../../ipc";
import { FULLSCREEN_EXIT_DELAY } from "../../../hotkeys";
import type { MainView } from "../MainHeader";

/**
 * Owns the app's "fullscreen / zen-mode" lifecycle:
 *
 *   - `isFullscreen`    — the app's *intended* zen state (toggled by the
 *                         user via hotkey, button, or a Rust-side global
 *                         shortcut).
 *   - `isOsFullscreen`  — whether the OS window itself is in native
 *                         fullscreen (macOS Space). Used purely for CSS
 *                         (`.os-fullscreen` class) — read-only externally.
 *   - `forceWebviewFocus()` — the hidden-input trick that's the only
 *                         reliable way to re-grab keyboard focus after a
 *                         macOS fullscreen exit. Exposed so the action
 *                         dispatcher and zen-exit handler can call it.
 *
 * Three effects run:
 *   1. Listen for Rust-side fullscreen toggles (global shortcut).
 *   2. Track the OS-level fullscreen state via `window.onResized`. macOS
 *      doesn't deliver an Escape-key event to the app when the user exits
 *      fullscreen with Esc, so we infer it from a resize and restore
 *      always-on-top + focus.
 *   3. A safety net for any exit path: when `isFullscreen` flips from
 *      true → false, re-apply always-on-top (with retries — macOS will
 *      silently ignore it during the exit animation) and re-grab focus.
 */

export interface UseFullscreenLifecycleArgs {
  view: MainView;
  alwaysOnTop: boolean;
}

export interface FullscreenLifecycle {
  isFullscreen: boolean;
  setIsFullscreen: Dispatch<SetStateAction<boolean>>;
  isOsFullscreen: boolean;
  setIsOsFullscreen: Dispatch<SetStateAction<boolean>>;
  forceWebviewFocus: (retries?: number, delayMs?: number) => Promise<void>;
}

// Force the webview to reclaim keyboard focus after macOS fullscreen exit.
// The hidden-input trick is the only reliable way — body.focus()/click()
// don't work.
async function forceWebviewFocus(retries = 4, delayMs = 200) {
  for (let i = 0; i < retries; i++) {
    if (document.hasFocus()) break;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  const tmp = document.createElement("input");
  tmp.style.position = "fixed";
  tmp.style.opacity = "0";
  tmp.style.pointerEvents = "none";
  document.body.appendChild(tmp);
  tmp.focus();
  tmp.remove();
}

export function useFullscreenLifecycle({
  view,
  alwaysOnTop,
}: UseFullscreenLifecycleArgs): FullscreenLifecycle {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isOsFullscreen, setIsOsFullscreen] = useState(false);
  const wasOsFullscreen = useRef(false);
  const prevFullscreen = useRef(false);

  // 1. Listen for fullscreen changes from Rust (global shortcut)
  useEffect(() => {
    const unlisten = onFullscreenChanged(() => {
      setIsFullscreen((prev) => !prev);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [view]);

  // 2. Track OS fullscreen state and restore always-on-top when exiting
  // (handles macOS Escape key which the app never receives)
  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.onResized(async () => {
      const isFull = await win.isFullscreen();
      setIsOsFullscreen(isFull);
      // Exiting OS fullscreen — restore always-on-top and focus
      if (wasOsFullscreen.current && !isFull) {
        await new Promise((r) => setTimeout(r, FULLSCREEN_EXIT_DELAY));
        await win.setAlwaysOnTop(alwaysOnTop);
        await win.setFocus();
        await forceWebviewFocus();
      }
      wasOsFullscreen.current = isFull;
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [alwaysOnTop]);

  // 3. Safety net: re-apply always-on-top and focus after any zen exit
  useEffect(() => {
    if (prevFullscreen.current && !isFullscreen) {
      const win = getCurrentWindow();
      const timer = setTimeout(async () => {
        if (await win.isFullscreen()) {
          await win.setFullscreen(false);
          await new Promise((r) => setTimeout(r, FULLSCREEN_EXIT_DELAY));
        }
        // Retry setAlwaysOnTop — macOS can silently ignore it if the
        // fullscreen exit animation hasn't fully completed
        for (let i = 0; i < 3; i++) {
          await win.setAlwaysOnTop(alwaysOnTop);
          await new Promise((r) => setTimeout(r, 200));
        }
        await win.setFocus();
        await forceWebviewFocus();
      }, 100);
      return () => clearTimeout(timer);
    }
    prevFullscreen.current = isFullscreen;
  }, [isFullscreen, alwaysOnTop]);

  return {
    isFullscreen,
    setIsFullscreen,
    isOsFullscreen,
    setIsOsFullscreen,
    forceWebviewFocus,
  };
}
