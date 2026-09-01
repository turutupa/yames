import { useEffect, useRef, useCallback } from "react";
import i18n from "../i18n";

export type GamepadButtonId = string; // e.g. "gp:0:b:0"

/** Format a gamepad button press into a binding string */
function buttonId(gpIndex: number, btnIndex: number): GamepadButtonId {
  return `gp:${gpIndex}:b:${btnIndex}`;
}

/** Pretty-print a gamepad button binding */
export function formatGamepadButton(id: string): string {
  const m = id.match(/^gp:(\d+):b:(\d+)$/);
  if (!m) return id;
  return i18n.t("settings.hotkeys.gamepadButton", {
    pad: parseInt(m[1]) + 1,
    btn: parseInt(m[2]) + 1,
  });
}

/** Returns true if a binding string is a gamepad binding */
export function isGamepadBinding(id: string): boolean {
  return /^gp:\d+:b:\d+$/.test(id);
}

interface UseGamepadOptions {
  /** Called when any gamepad button is pressed (for binding capture) */
  onButtonPress?: (id: GamepadButtonId) => void;
  /** Map of action → gamepad binding. When a bound button is pressed, the action fires. */
  bindings?: Record<string, string>;
  /** Called when a bound action should fire */
  onAction?: (actionId: string) => void;
  /** Disable polling (e.g. when not needed) */
  enabled?: boolean;
}

export function useGamepad({ onButtonPress, bindings, onAction, enabled = true }: UseGamepadOptions) {
  const prevPressed = useRef<Set<string>>(new Set());
  const rafId = useRef<number>(0);

  const poll = useCallback(() => {
    // Guard for non-Chromium environments (happy-dom test runner,
    // Firefox in private mode, locked-down WebViews) that don't ship
    // the Gamepad API. Without this, `navigator.getGamepads()` throws
    // and crashes the raf loop on every frame.
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
      return;
    }
    const gamepads = navigator.getGamepads();
    const nowPressed = new Set<string>();

    for (const gp of gamepads) {
      if (!gp) continue;
      for (let i = 0; i < gp.buttons.length; i++) {
        if (gp.buttons[i].pressed) {
          const id = buttonId(gp.index, i);
          nowPressed.add(id);

          // Only fire on fresh press (not held)
          if (!prevPressed.current.has(id)) {
            // Binding capture mode
            if (onButtonPress) {
              onButtonPress(id);
            }
            // Action dispatch mode
            if (bindings && onAction) {
              const actionId = Object.entries(bindings).find(([_, bid]) => bid === id)?.[0];
              if (actionId) onAction(actionId);
            }
          }
        }
      }
    }

    prevPressed.current = nowPressed;
    rafId.current = requestAnimationFrame(poll);
  }, [onButtonPress, bindings, onAction]);

  useEffect(() => {
    if (!enabled) return;
    rafId.current = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId.current);
  }, [enabled, poll]);
}
