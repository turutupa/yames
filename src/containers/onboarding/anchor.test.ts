/**
 * The placement rules the tour card (and O7's hint cards) rely on.
 *
 * The last block is the one that matters most: at Yames' minimum window
 * (480x780) there is not much room, so "the card is fully inside the window"
 * is asserted for a grid of targets rather than for a couple of hand-picked
 * cases.
 */
import { describe, expect, it } from "vitest";
import {
  ANCHOR_GAP,
  ANCHOR_MARGIN,
  clipToViewport,
  computeAnchor,
  padRect,
  unionRects,
  type Rect,
} from "./anchor";

const VIEWPORT = { width: 800, height: 900 };
const MIN_VIEWPORT = { width: 480, height: 780 };
const CARD = { width: 300, height: 160 };

function inside(
  anchor: { x: number; y: number },
  card: { width: number; height: number },
  viewport: { width: number; height: number },
): boolean {
  return (
    anchor.x >= 0 &&
    anchor.y >= 0 &&
    anchor.x + card.width <= viewport.width &&
    anchor.y + card.height <= viewport.height
  );
}

describe("computeAnchor — placement", () => {
  it("prefers below the target when there is room", () => {
    const target: Rect = { x: 300, y: 100, width: 200, height: 60 };
    const a = computeAnchor(target, CARD, VIEWPORT);
    expect(a.placement).toBe("bottom");
    expect(a.y).toBe(target.y + target.height + ANCHOR_GAP);
    // Horizontally centred on the target.
    expect(a.x).toBe(target.x + target.width / 2 - CARD.width / 2);
  });

  it("flips above when the card would not fit below", () => {
    const target: Rect = { x: 300, y: 700, width: 200, height: 60 };
    const a = computeAnchor(target, CARD, VIEWPORT);
    expect(a.placement).toBe("top");
    expect(a.y).toBe(target.y - ANCHOR_GAP - CARD.height);
  });

  it("goes to the side when neither above nor below fits", () => {
    // A target tall enough to leave no vertical room on either side.
    const target: Rect = { x: 20, y: 20, width: 120, height: 860 };
    const a = computeAnchor(target, CARD, VIEWPORT);
    expect(a.placement).toBe("right");
    expect(a.x).toBe(target.x + target.width + ANCHOR_GAP);
  });

  it("goes left when the target hugs the right edge", () => {
    const target: Rect = { x: 660, y: 20, width: 120, height: 860 };
    const a = computeAnchor(target, CARD, VIEWPORT);
    expect(a.placement).toBe("left");
    expect(a.x).toBe(target.x - ANCHOR_GAP - CARD.width);
  });

  it("centres the card when there is no target", () => {
    const a = computeAnchor(null, CARD, VIEWPORT);
    expect(a.placement).toBe("center");
    expect(a.arrow).toBeNull();
    expect(a.x).toBe((VIEWPORT.width - CARD.width) / 2);
    expect(a.y).toBe((VIEWPORT.height - CARD.height) / 2);
  });

  it("treats a zero-sized target as no target (hidden element)", () => {
    const a = computeAnchor({ x: 0, y: 0, width: 0, height: 0 }, CARD, VIEWPORT);
    expect(a.placement).toBe("center");
  });
});

describe("computeAnchor — clamping", () => {
  it("clamps a card that would overflow the left edge", () => {
    const target: Rect = { x: 0, y: 100, width: 40, height: 40 };
    const a = computeAnchor(target, CARD, VIEWPORT);
    expect(a.x).toBe(ANCHOR_MARGIN);
    expect(inside(a, CARD, VIEWPORT)).toBe(true);
  });

  it("clamps a card that would overflow the right edge", () => {
    const target: Rect = { x: 780, y: 100, width: 20, height: 20 };
    const a = computeAnchor(target, CARD, VIEWPORT);
    expect(a.x).toBe(VIEWPORT.width - ANCHOR_MARGIN - CARD.width);
    expect(inside(a, CARD, VIEWPORT)).toBe(true);
  });

  it("keeps a card that is wider than the window on screen", () => {
    const tiny = { width: 300, height: 200 };
    const narrow = { width: 240, height: 500 };
    const a = computeAnchor({ x: 100, y: 100, width: 40, height: 40 }, tiny, narrow);
    expect(a.x).toBe(ANCHOR_MARGIN);
  });

  it("never leaves the window, for any target on the minimum window", () => {
    for (let x = 0; x <= MIN_VIEWPORT.width - 40; x += 40) {
      for (let y = 0; y <= MIN_VIEWPORT.height - 40; y += 40) {
        const target: Rect = { x, y, width: 40, height: 40 };
        const a = computeAnchor(target, CARD, MIN_VIEWPORT);
        expect(
          inside(a, CARD, MIN_VIEWPORT),
          `card left the window at ${x},${y} (${a.placement} ${a.x},${a.y})`,
        ).toBe(true);
      }
    }
  });

  it("never leaves the window for a very tall target either", () => {
    const target: Rect = { x: 10, y: 0, width: 460, height: 780 };
    const a = computeAnchor(target, CARD, MIN_VIEWPORT);
    expect(inside(a, CARD, MIN_VIEWPORT)).toBe(true);
  });
});

describe("computeAnchor — arrow", () => {
  it("points at the target's centre", () => {
    const target: Rect = { x: 300, y: 100, width: 200, height: 60 };
    const a = computeAnchor(target, CARD, VIEWPORT);
    expect(a.arrow).toBe(CARD.width / 2);
  });

  it("stays inside the card when the target is off to one side", () => {
    const target: Rect = { x: 0, y: 100, width: 20, height: 20 };
    const a = computeAnchor(target, CARD, VIEWPORT);
    expect(a.arrow).not.toBeNull();
    expect(a.arrow!).toBeGreaterThanOrEqual(0);
    expect(a.arrow!).toBeLessThanOrEqual(CARD.width);
  });

  it("is measured down the card for a side placement", () => {
    const target: Rect = { x: 20, y: 20, width: 120, height: 860 };
    const a = computeAnchor(target, CARD, VIEWPORT);
    expect(a.placement).toBe("right");
    expect(a.arrow!).toBeGreaterThanOrEqual(0);
    expect(a.arrow!).toBeLessThanOrEqual(CARD.height);
  });
});

describe("rect helpers", () => {
  it("unions several rects", () => {
    const u = unionRects([
      { x: 10, y: 10, width: 20, height: 20 },
      { x: 100, y: 5, width: 30, height: 10 },
    ]);
    expect(u).toEqual({ x: 10, y: 5, width: 120, height: 25 });
  });

  it("ignores zero-sized rects — a hidden element must not drag the union", () => {
    const u = unionRects([
      { x: 0, y: 0, width: 0, height: 0 },
      { x: 100, y: 100, width: 20, height: 20 },
    ]);
    expect(u).toEqual({ x: 100, y: 100, width: 20, height: 20 });
  });

  it("returns null when nothing is visible", () => {
    expect(unionRects([])).toBeNull();
    expect(unionRects([{ x: 5, y: 5, width: 0, height: 0 }])).toBeNull();
  });

  it("pads a rect on every side", () => {
    expect(padRect({ x: 10, y: 10, width: 20, height: 20 }, 5)).toEqual({
      x: 5,
      y: 5,
      width: 30,
      height: 30,
    });
  });

  it("clips a rect to the viewport", () => {
    expect(
      clipToViewport({ x: -10, y: -10, width: 50, height: 50 }, VIEWPORT),
    ).toEqual({ x: 0, y: 0, width: 40, height: 40 });
    expect(
      clipToViewport({ x: 790, y: 10, width: 100, height: 20 }, VIEWPORT),
    ).toEqual({ x: 790, y: 10, width: 10, height: 20 });
  });
});
