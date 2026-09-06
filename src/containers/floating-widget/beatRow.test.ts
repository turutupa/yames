import { describe, it, expect } from "vitest";
import { beatRowExtent, beatRowDot, BEAT_ROW_WIDTH } from "./FloatingWidget";

/**
 * The floating window is a fixed 400×160 with `resizable: false`, so the beat
 * row has one width forever while a bar can hold up to sixteen beats. Before
 * this, a 9-beat bar already pushed the last dot outside the window and it was
 * simply cut off — the more beats, the more of the bar silently went missing.
 *
 * These run across every bar length the engine accepts, because the bug was
 * not at one size: it grew with the beat count, on a surface nobody thinks to
 * check.
 */

/** `validate_beat_groups` caps a bar at 16 beats. */
const EVERY_BAR = Array.from({ length: 16 }, (_, i) => i + 1);

describe("the widget's beat row", () => {
  it("fits every bar the engine allows", () => {
    const tooWide = EVERY_BAR.filter((n) => beatRowExtent(n) > BEAT_ROW_WIDTH);
    expect(tooWide).toEqual([]);
  });

  it("costs the ordinary meters nothing", () => {
    // Up to six beats — 4/4, 6/8, 3/4, 5/4 — nothing had a problem and
    // nothing gives anything up: full 10px dots, full 10px gaps.
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(beatRowExtent(n), `${n} beats`).toBeCloseTo(n * 12 + (n - 1) * 10, 5);
    }
  });

  it("tightens the gaps before it shrinks the dots", () => {
    // A 7 or 9 beat bar is common enough (7/8, 9/8) that the dots should stay
    // the size they always were; the space between them gives first.
    for (const n of [7, 8, 9]) {
      expect(beatRowDot(n), `${n} beats`).toBe(10);
    }
    expect(beatRowDot(12)).toBeLessThan(10);
  });

  it("keeps a dot big enough to read at the worst case", () => {
    expect(beatRowDot(16)).toBeGreaterThan(5);
  });

  it("gives up room gradually rather than all at once", () => {
    // 12 beats should not look like a different widget from 11.
    for (let n = 2; n <= 16; n++) {
      expect(beatRowDot(n - 1) - beatRowDot(n), `${n - 1} → ${n}`).toBeLessThan(1.5);
    }
  });

  it("never grows a dot past what the widget shipped with", () => {
    for (const n of EVERY_BAR) {
      expect(beatRowDot(n), `${n} beats`).toBeLessThanOrEqual(10);
    }
  });
});
