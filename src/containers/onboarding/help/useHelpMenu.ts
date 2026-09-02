/**
 * Help menu lifecycle: open/close, the Cmd/Ctrl-/ shortcut, which panel is
 * showing (the menu or the shortcuts sheet), and the "Report a problem"
 * export.
 *
 * The shortcut is deliberately *not* a `HOTKEYS` entry: those are all
 * user-rebindable and get fed to the input tester, whereas Cmd/Ctrl-/ is a
 * fixed platform convention for "help" and has to keep working even while the
 * user is remapping everything else.
 */
import { useCallback, useEffect, useState } from "react";
import { exportSessionLogs } from "../../../ipc";

export type HelpPanel = "closed" | "menu" | "shortcuts";

export type UseHelpMenuArgs = {
  /**
   * Suppress the shortcut while another overlay owns the keyboard (the
   * wizard, the tour, a key-capture modal).
   */
  disabled?: boolean;
};

export type UseHelpMenuResult = {
  panel: HelpPanel;
  isOpen: boolean;
  /** Header `?` button and Cmd/Ctrl-/. */
  openMenu: () => void;
  openShortcuts: () => void;
  close: () => void;
  /** Writes the diagnostics bundle and resolves with its path. */
  reportProblem: () => Promise<string>;
};

/** Cmd-/ on macOS, Ctrl-/ elsewhere. Shift is tolerated (US "?" is Shift-/). */
export function isHelpShortcut(e: KeyboardEvent, isMac: boolean): boolean {
  if (e.key !== "/" && e.key !== "?") return false;
  if (e.altKey) return false;
  return isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

export function useHelpMenu(
  isMac: boolean,
  { disabled = false }: UseHelpMenuArgs = {},
): UseHelpMenuResult {
  const [panel, setPanel] = useState<HelpPanel>("closed");

  const openMenu = useCallback(() => setPanel("menu"), []);
  const openShortcuts = useCallback(() => setPanel("shortcuts"), []);
  const close = useCallback(() => setPanel("closed"), []);

  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isHelpShortcut(e, isMac)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      // Toggle: pressing it again from any help panel closes.
      setPanel((p) => (p === "closed" ? "menu" : "closed"));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isMac, disabled]);

  const reportProblem = useCallback(() => exportSessionLogs(), []);

  return {
    panel,
    isOpen: panel !== "closed",
    openMenu,
    openShortcuts,
    close,
    reportProblem,
  };
}
