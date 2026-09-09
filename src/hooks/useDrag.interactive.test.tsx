import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDrag } from "./useDrag";

/**
 * The window drags when you grab it somewhere that is not a control — and
 * `useDrag` decides "not a control" for the whole document, on mousedown,
 * before anything else sees the event.
 *
 * It used to decide by tag name alone, and that shipped a WINDOWS-ONLY bug.
 * The library's setlist rows are `<div role="button" tabIndex={0}>`, so they
 * failed the test; mousedown called `preventDefault()` and `startDragging()`,
 * the OS took the mouse, and the click never arrived. On macOS
 * `startDragging()` rejects on a focused undecorated window, the manual
 * fallback ran instead, and the click survived — which is why it looked like a
 * platform quirk rather than a bug. The owner: "on my Mac I can click a setlist
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

/**
 * Mousedown on `el` and report whether the drag handler claimed the event.
 *
 * `at` places the press inside the element's padding box. jsdom lays nothing
 * out, so both the offsets and the client box have to be stated — which is
 * the point: the numbers below are the ones measured in the real engine.
 */
function claimedByDrag(el: HTMLElement, at?: { offsetX: number; offsetY: number }): boolean {
  const e = new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true });
  Object.defineProperty(e, "offsetX", { value: at?.offsetX ?? 0 });
  Object.defineProperty(e, "offsetY", { value: at?.offsetY ?? 0 });
  el.dispatchEvent(e);
  return e.defaultPrevented;
}

/** Give `el` a client box, the way a laid-out scrolling element has one. */
function scrollBox(el: HTMLElement, box: { clientWidth: number; clientHeight: number; offsetHeight: number }) {
  for (const [k, value] of Object.entries(box)) {
    Object.defineProperty(el, k, { value, configurable: true });
  }
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
    // The exact shape of the library's setlist rows, and the bug itself.
    root.innerHTML = `<div role="button" tabindex="0"><span>Metal Setlist</span></div>`;
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

  it("leaves a horizontal scrollbar alone, and the strip above it draggable", () => {
    /*
     * The setlist track, measured in the real engine: a mousedown on its
     * scrollbar arrives with `target` = the strip itself and `offsetY` 154
     * against a `clientHeight` of 140. Nothing about the target says
     * "control", so before this the strip's bar was unusable — pressing it
     * dragged the whole window instead of scrolling the setlist.
     */
    root.innerHTML = `<div class="setlist-track-strip"><div>step</div></div>`;
    const strip = root.firstElementChild as HTMLElement;
    scrollBox(strip, { clientWidth: 387, clientHeight: 140, offsetHeight: 155 });

    expect(claimedByDrag(strip, { offsetX: 123, offsetY: 154 })).toBe(false);
    expect(startDragging).not.toHaveBeenCalled();

    // ...and the 140px above the gutter is still the strip, which has no
    // controls of its own and so is still somewhere to grab the window by.
    expect(claimedByDrag(strip, { offsetX: 123, offsetY: 60 })).toBe(true);
  });

  it("leaves a vertical scrollbar alone too", () => {
    root.innerHTML = `<div class="scroller">tall</div>`;
    const el = root.firstElementChild as HTMLElement;
    scrollBox(el, { clientWidth: 300, clientHeight: 200, offsetHeight: 200 });
    expect(claimedByDrag(el, { offsetX: 310, offsetY: 90 })).toBe(false);
    expect(claimedByDrag(el, { offsetX: 290, offsetY: 90 })).toBe(true);
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
