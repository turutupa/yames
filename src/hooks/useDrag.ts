import { useEffect } from "react";
import { getCurrentWindow, LogicalPosition } from "@tauri-apps/api/window";
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
 */
export function useDrag() {
  useEffect(() => {
    let dragging = false;
    let nativeTookOver = false;
    let lastScreenX = 0;
    let lastScreenY = 0;
    let winX = 0;
    let winY = 0;
    let rafId = 0;
    let dirty = false;

    async function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      if (isInteractive(e.target as HTMLElement)) return;
      e.preventDefault();

      // Set up manual fallback state
      dragging = true;
      nativeTookOver = false;
      lastScreenX = e.screenX;
      lastScreenY = e.screenY;
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      // Convert physical → logical so deltas (CSS px) accumulate without DPR scaling.
      // LogicalPosition at setPosition time lets Tauri apply the correct per-monitor DPR,
      // which fixes Y-axis drift when dragging across monitors with different DPI scales.
      const dpr = window.devicePixelRatio || 1;
      winX = pos.x / dpr;
      winY = pos.y / dpr;

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
      // screenX/Y are CSS logical pixels — no DPR scaling needed
      const dx = e.screenX - lastScreenX;
      const dy = e.screenY - lastScreenY;
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
            new LogicalPosition(Math.round(winX), Math.round(winY))
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
          new LogicalPosition(Math.round(winX), Math.round(winY))
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
