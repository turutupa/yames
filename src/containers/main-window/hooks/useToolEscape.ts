/**
 * Escape in a tool goes back to the Tools page (UX audit TOOL-3).
 *
 * The tools already use Escape for their own things — a menu, a sheet, a
 * popover, a picked bar of tab, the review, Zen — and none of those may also
 * walk out of the tool. Not all of them claim the key (several just close
 * themselves), so "did someone handle it?" cannot be read off the event alone.
 * Two listeners on `window` answer it instead:
 *
 * - CAPTURE, first of everything: was anything open when the key went down?
 *   A dialog, a menu, a list, a popover's expanded control, the song review,
 *   one of the jam's sheets, focus in a text field, Zen, the input tester.
 * - BUBBLE, last of everything: if nothing was open, nobody prevented the
 *   default and nobody stopped the key on its way up, leave for Tools.
 *
 * So the innermost thing still goes first, and only an Escape with nothing
 * left to put away leaves the tool.
 */
import { useEffect, useRef } from "react";
import { isTypingTarget } from "../../../hotkeys";
import { IS_MOBILE } from "../../../platform";

const TOOL_VIEWS = new Set(["beat", "setlist", "drill", "jam", "songs"]);

/** Anything that, being on screen, is what Escape should put away first. */
const OPEN_THINGS = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[aria-modal="true"]',
  '[data-testid="songs-review"]',
].join(", ");

/**
 * Disclosures that stay open as a layout choice rather than as something to
 * put away: the rail's library, the song shelf's starter section, the jam's
 * fretboard. An expanded control anywhere else is a popover standing open.
 */
const STANDING_DISCLOSURES = ".song-shelf-heading, .jam-now-fretboard";

export function somethingOpen(): boolean {
  if (document.querySelector(OPEN_THINGS)) return true;
  for (const el of document.querySelectorAll('[aria-expanded="true"]')) {
    if (el.closest(".rail") || el.matches(STANDING_DISCLOSURES)) continue;
    return true;
  }
  return false;
}

export interface ToolEscapeArgs {
  view: string;
  onLeave: () => void;
  /** Something above the tool owns the keyboard: Zen, the tester, a binding being recorded, onboarding. */
  blocked: boolean;
  /** The jam has a sheet or the chord picker open. */
  jamBusy: boolean;
}

export function useToolEscape({ view, onLeave, blocked, jamBusy }: ToolEscapeArgs) {
  const busy = useRef(false);
  useEffect(() => {
    if (IS_MOBILE || !TOOL_VIEWS.has(view) || blocked) return;
    const before = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      busy.current =
        isTypingTarget(e.target) ||
        isTypingTarget(document.activeElement) ||
        (view === "jam" && jamBusy) ||
        somethingOpen();
    };
    const after = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const wasBusy = busy.current;
      busy.current = false;
      if (wasBusy || e.defaultPrevented) return;
      e.preventDefault();
      onLeave();
    };
    window.addEventListener("keydown", before, true);
    window.addEventListener("keydown", after);
    return () => {
      window.removeEventListener("keydown", before, true);
      window.removeEventListener("keydown", after);
    };
  }, [view, onLeave, blocked, jamBusy]);
}
