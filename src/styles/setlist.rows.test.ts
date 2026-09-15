import { describe, it, expect } from "vitest";
import { readStylesheet } from "../test/readStyles";

/**
 * Two things about a setlist row that only CSS can get wrong, and that no
 * render test can see.
 *
 * The first is a specificity accident. The grip is revealed by
 * `.setlist-step:hover .setlist-step-grip` — three simple selectors — so the
 * greyed-out rule for a playing setlist, written as
 * `.setlist-step-grip.is-locked`, is one short of it and loses. The handle
 * went back to full opacity the instant the pointer touched the row, which is
 * the only instant anybody would have looked at it: the dimming was correct
 * everywhere except on screen.
 *
 * The second is that shift-click is how this screen marks a block of steps
 * AND how every browser extends a text selection, so marking four steps left
 * four rows of highlighted prose behind it — while the fields inside the
 * expanded step still have to be selectable, because they hold text people
 * edit.
 */

const css = readStylesheet("setlist.css");

/** (classes + pseudo-classes, attributes) — enough for the selectors here. */
function specificity(selector: string): number {
  const classes = (selector.match(/\.[a-zA-Z0-9_-]+/g) ?? []).length;
  const pseudo = (selector.match(/(?<!:):[a-zA-Z-]+/g) ?? []).length;
  const attrs = (selector.match(/\[[^\]]+\]/g) ?? []).length;
  return classes + pseudo + attrs;
}

/** Where a rule whose selector list contains `needle` starts, or -1. */
function ruleAt(needle: string): number {
  return css.indexOf(needle);
}

describe("the setlist row's stylesheet", () => {
  it("lets the locked grip beat the rules that reveal it", () => {
    const reveals = [
      ".setlist-step:hover .setlist-step-grip",
      ".setlist-step.selected .setlist-step-grip",
      ".setlist-step:focus-within .setlist-step-grip",
    ];
    const locked = ".setlist-step .setlist-step-grip.is-locked";
    expect(ruleAt(locked)).toBeGreaterThan(-1);

    for (const reveal of reveals) {
      expect(ruleAt(reveal), reveal).toBeGreaterThan(-1);
      expect(specificity(locked), reveal).toBeGreaterThanOrEqual(specificity(reveal));
      // Equal specificity is decided by source order, so it has to come after.
      if (specificity(locked) === specificity(reveal)) {
        expect(ruleAt(locked), `${locked} must be declared after ${reveal}`).toBeGreaterThan(
          ruleAt(reveal),
        );
      }
    }
  });

  it("does not let a shift-click drag a text selection across the rows", () => {
    const row = css.slice(css.indexOf(".setlist-step {"));
    expect(row.slice(0, row.indexOf("}"))).toContain("user-select: none");
  });

  it("keeps the fields inside a step selectable, because they hold text", () => {
    const fields = css.indexOf(".setlist-step input,");
    expect(fields).toBeGreaterThan(-1);
    const block = css.slice(fields, css.indexOf("}", fields));
    for (const tag of ["input", "textarea", "[contenteditable]"]) {
      expect(block).toContain(`.setlist-step ${tag}`);
    }
    expect(block).toContain("user-select: text");
  });
});
