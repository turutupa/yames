import { describe, it, expect } from "vitest";
import { isTypingTarget } from "./hotkeys";

/**
 * The bug this exists for: the tempo ruler is an `input[type=range]`, and the
 * hotkey handlers used to stand aside for any INPUT at all. Setting a tempo by
 * dragging the ruler leaves it focused, so from that moment every hotkey in
 * the app was swallowed — Space would not start the metronome, nothing would —
 * until the user clicked some other part of the window. It was reported as
 * "hotkeys stop working until I click the rail", which is exactly what it
 * looked like from the outside and gives no hint of the cause.
 */

function el(tag: string, type?: string): HTMLElement {
  const node = document.createElement(tag);
  if (type) (node as HTMLInputElement).type = type;
  return node;
}

describe("isTypingTarget", () => {
  it("stands aside for the places text is entered", () => {
    expect(isTypingTarget(el("textarea"))).toBe(true);
    expect(isTypingTarget(el("select"))).toBe(true);
    for (const type of ["text", "number", "search", "email", "password", "tel", "url"]) {
      expect(isTypingTarget(el("input", type)), type).toBe(true);
    }
  });

  it("does not stand aside for controls that hold no text", () => {
    // The range is the one that mattered — it is the tempo ruler.
    for (const type of ["range", "checkbox", "radio", "button", "submit", "reset", "color", "file"]) {
      expect(isTypingTarget(el("input", type)), type).toBe(false);
    }
  });

  it("treats a contenteditable as typing", () => {
    const node = el("div");
    Object.defineProperty(node, "isContentEditable", { value: true });
    expect(isTypingTarget(node)).toBe(true);
  });

  it("lets hotkeys through from ordinary elements", () => {
    expect(isTypingTarget(el("button"))).toBe(false);
    expect(isTypingTarget(el("div"))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
  });

  it("survives a target that is not an element", () => {
    // `document` and `window` both dispatch keydown and neither has a tagName.
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(document)).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
  });

  it("defaults an input with no type to typing", () => {
    // A bare <input> is a text field, and the fallback has to err towards
    // leaving the user alone while they type.
    const bare = document.createElement("input");
    expect(isTypingTarget(bare)).toBe(true);
  });
});
