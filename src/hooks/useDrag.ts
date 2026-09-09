import { useEffect } from "react";
import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

const INTERACTIVE_TAGS = new Set([
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "a",
  "label",
  "summary",
]);

/**
 * ARIA roles that mean "this is a control". A `div` carrying one of these is
 * as clickable as a `<button>`, and the user has no way of knowing which the
 * author reached for.
 */
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "spinbutton",
  "textbox",
  "combobox",
  "listbox",
  "option",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
]);

/**
 * Is this something the user is clicking, rather than somewhere they are
 * grabbing the window by?
 *
 * This used to test tag names alone, and that cost a real bug — WINDOWS ONLY,
 * which is what made it hard to see. The setlist rows in the library are
 * `<div role="button" tabIndex={0}>`, so they failed the tag test; mousedown
 * called `preventDefault()` and `startDragging()`, the OS took the mouse, and
 * the click never arrived. On macOS `startDragging()` REJECTS on a focused
 * undecorated window — see the note on the hook below — so the manual
 * fallback ran and the click survived. The owner found it as "on my Mac I can
 * click a setlist and it goes active, on Windows the click does nothing".
 *
 * So: a role, a tabindex or `contenteditable` counts as much as a tag. Being
 * focusable is the honest definition of "the user aims at this".
 */
function isInteractive(el: HTMLElement | null): boolean {
  while (el) {
    if (INTERACTIVE_TAGS.has(el.tagName.toLowerCase())) return true;
    const role = el.getAttribute?.("role");
    if (role && INTERACTIVE_ROLES.has(role)) return true;
    // Anything the author made focusable. A drag region is not focusable.
    if (el.hasAttribute?.("tabindex")) return true;
    if (el.isContentEditable) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Did this mousedown land on a scrollbar rather than on the content?
 *
 * A scrollbar belongs to no element of its own. Chromium dispatches the
 * mousedown to the SCROLLING BOX — measured: clicking the setlist track's
 * horizontal bar arrives with `target` = `.setlist-track-strip` and
 * `offsetY` 154 against a `clientHeight` of 140 — so by the time
 * `isInteractive` sees it, it is looking at a plain `div` and says "furniture,
 * drag the window". Which is what happened: the owner grabbed the bar under a
 * long setlist and the whole window came with it, on both platforms.
 *
 * `offsetX`/`offsetY` are measured from the padding box, and `clientWidth`
 * and `clientHeight` are the padding box MINUS the scrollbar gutters, so
 * "past the client box" is exactly "in a gutter" and needs no geometry of its
 * own. In a right-to-left box the vertical gutter is on the left instead,
 * hence the `direction` check.
 *
 * This only sees a scrollbar that occupies layout — a classic one. macOS
 * overlay bars measure zero, which is why the setlist strip and the drill's
 * climb both style `::-webkit-scrollbar`: a styled bar is always classic.
 */
function isOnScrollbar(el: HTMLElement, e: MouseEvent): boolean {
  const gutterY = el.offsetHeight > 0 && e.offsetY > el.clientHeight;
  if (gutterY) return true;
  const rtl = getComputedStyle(el).direction === "rtl";
  return rtl ? e.offsetX < 0 : e.offsetX > el.clientWidth;
}

/**
 * Hybrid drag: tries native startDragging() first (perfect multi-monitor),
 * falls back to manual incremental drag when the window is already focused
 * (macOS bug: startDragging doesn't work on focused undecorated windows).
 *
 * The manual fallback detects devicePixelRatio changes (monitor boundary
 * crossings) and re-syncs position from outerPosition() to prevent drift.
 */
export function useDrag() {
  useEffect(() => {
    let dragging = false;
    let nativeTookOver = false;
    let lastScreenX = 0;
    let lastScreenY = 0;
    let winX = 0;
    let winY = 0;
    let lastDpr = 1;
    let rafId = 0;
    let dirty = false;

    async function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (isInteractive(target)) return;
      // The scrollbar of whatever was clicked. Its own box, not an ancestor's
      // — a scrollbar hit always targets the box it scrolls.
      if (isOnScrollbar(target, e)) return;
      e.preventDefault();

      // Set up manual fallback state
      dragging = true;
      nativeTookOver = false;
      lastScreenX = e.screenX;
      lastScreenY = e.screenY;
      lastDpr = window.devicePixelRatio || 1;
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      winX = pos.x;
      winY = pos.y;

      document.body.style.userSelect = "none";
      document.body.style.webkitUserSelect = "none";

      // Try native drag — if it works, mousemove events won't fire
      try {
        await win.startDragging();
        // If we get here, native drag completed (mouse released)
        nativeTookOver = true;
        dragging = false;
        document.body.style.userSelect = "";
        document.body.style.webkitUserSelect = "";
        // Persist position
        const finalPos = await win.outerPosition();
        try {
          await invoke("save_window_position", {
            label: win.label, x: finalPos.x, y: finalPos.y,
          });
        } catch (_) {}
      } catch (_) {
        // startDragging failed/rejected — manual fallback is active
      }
    }

    function onMouseMove(e: MouseEvent) {
      if (!dragging || nativeTookOver) return;
      e.preventDefault();

      const currentDpr = window.devicePixelRatio || 1;

      // Monitor boundary detected (DPR changed).
      // Cancel pending RAF so stale coords don't fire, reset delta baseline,
      // and continue tracking with the new DPR. winX/winY stay valid — physical
      // coordinates are in a unified global space across monitors.
      if (currentDpr !== lastDpr) {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; dirty = false; }
        lastDpr = currentDpr;
        lastScreenX = e.screenX;
        lastScreenY = e.screenY;
        return; // skip one frame to absorb the DPR transition
      }

      const scale = currentDpr;
      const dx = (e.screenX - lastScreenX) * scale;
      const dy = (e.screenY - lastScreenY) * scale;
      lastScreenX = e.screenX;
      lastScreenY = e.screenY;
      winX += dx;
      winY += dy;
      // Coalesce moves to one setPosition per frame
      if (!dirty) {
        dirty = true;
        rafId = requestAnimationFrame(() => {
          dirty = false;
          getCurrentWindow().setPosition(
            new PhysicalPosition(Math.round(winX), Math.round(winY))
          );
        });
      }
    }

    async function onMouseUp() {
      if (dragging && !nativeTookOver) {
        dragging = false;
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        dirty = false;
        // Apply final position synchronously
        await getCurrentWindow().setPosition(
          new PhysicalPosition(Math.round(winX), Math.round(winY))
        );
        document.body.style.userSelect = "";
        document.body.style.webkitUserSelect = "";
        try {
          const win = getCurrentWindow();
          const pos = await win.outerPosition();
          await invoke("save_window_position", {
            label: win.label, x: pos.x, y: pos.y,
          });
        } catch (_) {}
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);
}
