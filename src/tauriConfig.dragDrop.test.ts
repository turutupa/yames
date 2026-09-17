import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * EVERY WINDOW TURNS TAURI'S FILE-DROP HANDLING OFF.
 *
 * Tauri's own schema says it: "Disabling it is required to use HTML5 drag
 * and drop on the frontend on Windows." Left on — the default — the webview's
 * native drop target swallows the drag, so `dragover` and `drop` never reach
 * the page. Reordering setlist steps, setlists and jams by dragging all use
 * HTML5 drag and drop, and all three did nothing on Windows until 2026-09-16:
 * the owner reported "drag n dropping in setlist not working".
 *
 * Nothing in the app takes files dropped onto the window (a kit folder is
 * chosen through a dialog), so nothing is lost. If that ever changes, it has
 * to be done without turning this back on.
 */
describe("tauri.conf.json", () => {
  it("disables native drag-drop on every window so HTML5 drag works on Windows", () => {
    const conf = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
    ) as { app: { windows: Array<{ label: string; dragDropEnabled?: boolean }> } };
    expect(conf.app.windows.length).toBeGreaterThan(0);
    for (const w of conf.app.windows) {
      expect(w.dragDropEnabled, w.label).toBe(false);
    }
  });
});
