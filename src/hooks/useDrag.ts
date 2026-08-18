import { useEffect } from "react";
import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

const INTERACTIVE = new Set(["button", "input", "textarea", "select", "a", "label"]);

function isInteractive(el: HTMLElement | null): boolean {
  while (el) {
    if (INTERACTIVE.has(el.tagName.toLowerCase())) return true;
    el = el.parentElement;
  }
  return false;
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
    let syncGen = 0;       // incremented on each re-sync; stale async results are ignored
    let resyncing = false; // true while outerPosition() is in-flight after DPR change
    let pendingDx = 0;     // accumulated deltas while resyncing
    let pendingDy = 0;
    let rafId = 0;
    let dirty = false;

    async function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      if (isInteractive(e.target as HTMLElement)) return;
      e.preventDefault();

      // Set up manual fallback state
      dragging = true;
      nativeTookOver = false;
      resyncing = false;
      pendingDx = 0;
      pendingDy = 0;
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

      // Monitor boundary detected — re-sync from actual window position.
      if (currentDpr !== lastDpr) {
        lastDpr = currentDpr;
        lastScreenX = e.screenX;
        lastScreenY = e.screenY;
        resyncing = true;
        pendingDx = 0;
        pendingDy = 0;
        const thisGen = ++syncGen;
        getCurrentWindow().outerPosition().then(pos => {
          if (thisGen !== syncGen) return; // a newer crossing happened — discard
          resyncing = false;
          // Apply accumulated deltas on top of true position
          winX = pos.x + pendingDx;
          winY = pos.y + pendingDy;
          pendingDx = 0;
          pendingDy = 0;
          if (dragging && !nativeTookOver) {
            cancelAnimationFrame(rafId);
            dirty = false;
            getCurrentWindow().setPosition(new PhysicalPosition(Math.round(winX), Math.round(winY)));
          }
        });
        return;
      }

      // While re-sync is in flight, accumulate deltas — don't set position yet.
      if (resyncing) {
        const scale = currentDpr;
        pendingDx += (e.screenX - lastScreenX) * scale;
        pendingDy += (e.screenY - lastScreenY) * scale;
        lastScreenX = e.screenX;
        lastScreenY = e.screenY;
        return;
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
        resyncing = false;
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
