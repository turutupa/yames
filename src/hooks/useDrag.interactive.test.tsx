import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDrag } from "./useDrag";

/**
 * The window drags when you grab it somewhere that is not a control — and
 * `useDrag` decides "not a control" for the whole document, on mousedown,
 * before anything else sees the event.
 *
 * It used to decide by tag name alone, and that shipped a WINDOWS-ONLY bug.
 * The library's chain rows are `<div role="button" tabIndex={0}>`, so they
 * failed the test; mousedown called `preventDefault()` and `startDragging()`,
 * the OS took the mouse, and the click never arrived. On macOS
 * `startDragging()` rejects on a focused undecorated window, the manual
 * fallback ran instead, and the click survived — which is why it looked like a
 * platform quirk rather than a bug. The owner: "on my Mac I can click a chain
 * and it goes active, on this Windows machine the click does nothing".
 *
 * These assert the decision, not the drag: if `preventDefault` was called on
 * a control, that control is broken on Windows.
 */

const startDragging = vi.fn(() => Promise.resolve());

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    label: "main",
    outerPosition: () => Promise.resolve({ x: 0, y: 0 }),
    setPosition: () => Promise.resolve(),
    startDragging,
  }),
  PhysicalPosition: class {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: () => Promise.resolve() }));

/** Mousedown on `el` and report whether the drag handler claimed the event. */
function claimedByDrag(el: HTMLElement): boolean {
  const e = new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true });
  el.dispatchEvent(e);
  return e.defaultPrevented;
}

let root: HTMLDivElement;

beforeEach(() => {
  startDragging.mockClear();
  root = document.createElement("div");
  document.body.appendChild(root);
  renderHook(() => useDrag());
});

afterEach(() => {
  root.remove();
});

describe("what useDrag treats as a control", () => {
  it("leaves a div that says it is a button alone", () => {
    // The exact shape of the library's chain rows, and the bug itself.
    root.innerHTML = `<div role="button" tabindex="0"><span>Metal Chain</span></div>`;
    const row = root.firstElementChild as HTMLElement;
    expect(claimedByDrag(row)).toBe(false);
    // ...including when the click lands on something inside it.
    expect(claimedByDrag(row.querySelector("span") as HTMLElement)).toBe(false);
    expect(startDragging).not.toHaveBeenCalled();
  });

  it("leaves anything focusable alone, whatever it is called", () => {
    root.innerHTML = `<div tabindex="0">focusable</div>`;
    expect(claimedByDrag(root.firstElementChild as HTMLElement)).toBe(false);
  });

  it("leaves the other ARIA controls alone", () => {
    for (const role of ["switch", "option", "menuitem", "tab", "slider", "checkbox"]) {
      root.innerHTML = `<div role="${role}">x</div>`;
      expect(claimedByDrag(root.firstElementChild as HTMLElement), role).toBe(false);
    }
  });

  it("still treats real controls as controls", () => {
    for (const tag of ["button", "input", "textarea", "select", "a", "label"]) {
      root.innerHTML = `<${tag}>x</${tag}>`;
      expect(claimedByDrag(root.firstElementChild as HTMLElement), tag).toBe(false);
    }
  });

  it("still drags from plain furniture, or the window could not be moved", () => {
    // The other half of the contract. Widening `isInteractive` too far would
    // leave nowhere to grab.
    root.innerHTML = `<div class="app-titlebar"><span>yames</span></div>`;
    const bar = root.firstElementChild as HTMLElement;
    expect(claimedByDrag(bar)).toBe(true);
    expect(claimedByDrag(bar.querySelector("span") as HTMLElement)).toBe(true);
  });
});
