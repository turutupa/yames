import { describe, expect, it } from "vitest";
import { fitRow } from "./useFitOneLine";

/** A row whose content is `widths[fit]` wide in each state, in a box `room` wide. */
function row(room: number, widths: Record<string, number>): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { get: () => room });
  Object.defineProperty(el, "scrollWidth", {
    get: () => Math.max(room, widths[el.getAttribute("data-fit") ?? "full"]),
  });
  return el;
}

describe("a row that must stay one row", () => {
  const widths = { full: 340, tight: 300, snug: 280, wrap: 200 };

  it("is left as drawn when it fits", () => {
    const el = row(360, widths);
    el.setAttribute("data-fit", "wrap");
    fitRow(el);
    expect(el.hasAttribute("data-fit")).toBe(false);
  });

  it("takes the first shorter form it fits in", () => {
    const tight = row(302, widths);
    fitRow(tight);
    expect(tight.getAttribute("data-fit")).toBe("tight");
    const snug = row(290, widths);
    fitRow(snug);
    expect(snug.getAttribute("data-fit")).toBe("snug");
  });

  it("wraps only when no form fits", () => {
    const el = row(260, widths);
    fitRow(el);
    expect(el.getAttribute("data-fit")).toBe("wrap");
  });

  it("does nothing to a row with no width yet", () => {
    const el = row(0, widths);
    fitRow(el);
    expect(el.hasAttribute("data-fit")).toBe(false);
  });
});
