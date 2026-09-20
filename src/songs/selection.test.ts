/**
 * The portion you are working on, and the gestures that choose it.
 *
 * Every one of these is a thing a player does with a pointer or a footswitch,
 * written as arithmetic so it can be checked without a browser. The model is
 * the only place that knows what a drag means; `TabStage` turns pointer
 * events into calls on it and draws what it says, and nothing between them
 * has an opinion.
 */
import { describe, expect, it } from "vitest";
import {
  addPortion,
  beginDrag,
  clampSelection,
  dragRange,
  dragTo,
  isWholeSong,
  MAX_SAVED_PORTIONS,
  nudgeRange,
  playedBarOfPrinted,
  printedRunsOfRange,
  removePortion,
  renamePortion,
  setEdge,
} from "./selection";
import type { SavedPortion } from "./selection";
import type { SongScore } from "./types";

/** A song of `count` played bars, each of them its own printed bar. */
function song(count: number): SongScore {
  return {
    schema: 1,
    id: "s",
    title: "",
    artist: "",
    source: { fileName: "s.gp", format: "gp", trackIndex: 0, trackName: "Guitar" },
    tuning: [],
    capo: 0,
    ticksPerQuarter: 960,
    tempoMap: [{ tick: 0, bpm: 100 }],
    meterMap: [{ bar: 0, numerator: 4, denominator: 4 }],
    bars: Array.from({ length: count }, (_, i) => ({
      index: i,
      startTick: i * 3840,
      lengthTicks: 3840,
      printedBar: i,
    })),
    notes: [],
    sections: [],
  } as SongScore;
}

/**
 * Eight played bars over six printed ones: bars 3–4 are played twice, which
 * is what a repeat is once the importer has unrolled it.
 */
function repeated(): SongScore {
  const printed = [0, 1, 2, 3, 2, 3, 4, 5];
  const base = song(8);
  return {
    ...base,
    bars: printed.map((p, i) => ({
      index: i,
      startTick: i * 3840,
      lengthTicks: 3840,
      printedBar: p,
    })),
  };
}

describe("dragging a portion out", () => {
  it("is one bar when the pointer never leaves the bar it went down on", () => {
    // A click IS a selection. Looping one bar of a run is the whole point.
    const drag = beginDrag(4);
    expect(dragRange(drag)).toEqual({ startBar: 4, endBar: 4 });
    expect(drag.moved).toBe(false);
  });

  it("follows the pointer forwards", () => {
    const drag = dragTo(dragTo(beginDrag(4), 5), 7);
    expect(dragRange(drag)).toEqual({ startBar: 4, endBar: 7 });
    expect(drag.moved).toBe(true);
  });

  it("turns round rather than collapsing when dragged back past the anchor", () => {
    // The anchor is where the pointer went down and does not move. A range
    // sorted on every move would snap shut the moment you crossed it.
    const drag = dragTo(beginDrag(6), 2);
    expect(dragRange(drag)).toEqual({ startBar: 2, endBar: 6 });
  });

  it("extends what is there on shift, from the far end", () => {
    // What every text editor does: shift-clicking bar 30 with 5–8 chosen
    // gives 5–30, not 8–30.
    const drag = beginDrag(29, { shiftKey: true, current: { startBar: 4, endBar: 7 } });
    expect(dragRange(drag)).toEqual({ startBar: 4, endBar: 29 });
  });

  it("extends backwards from the far end too", () => {
    const drag = beginDrag(1, { shiftKey: true, current: { startBar: 10, endBar: 14 } });
    expect(dragRange(drag)).toEqual({ startBar: 1, endBar: 14 });
  });

  it("anchors the OTHER end when a handle is taken hold of", () => {
    const current = { startBar: 4, endBar: 11 };
    const drag = dragTo(beginDrag(4, { handle: "start", current }), 8);
    expect(dragRange(drag)).toEqual({ startBar: 8, endBar: 11 });
  });

  it("lets a handle be dragged past the other one, turning the portion round", () => {
    const current = { startBar: 4, endBar: 11 };
    const drag = dragTo(beginDrag(11, { handle: "end", current }), 1);
    expect(dragRange(drag)).toEqual({ startBar: 1, endBar: 4 });
  });

  it("ignores a move that stays on the same bar", () => {
    const first = dragTo(beginDrag(3), 5);
    expect(dragTo(first, 5)).toBe(first);
  });
});

describe("holding a portion inside the song", () => {
  it("clamps past the end and past the start", () => {
    expect(clampSelection(song(8), { startBar: -4, endBar: 99 })).toEqual({
      startBar: 0,
      endBar: 7,
    });
  });

  it("sorts a range that arrives the wrong way round", () => {
    expect(clampSelection(song(8), { startBar: 6, endBar: 2 })).toEqual({
      startBar: 2,
      endBar: 6,
    });
  });

  it("knows the whole song when it sees it, and null too", () => {
    expect(isWholeSong(song(8), { startBar: 0, endBar: 7 })).toBe(true);
    expect(isWholeSong(song(8), { startBar: 0, endBar: 6 })).toBe(false);
    expect(isWholeSong(song(8), null)).toBe(true);
  });
});

describe("moving a portion by whole bars", () => {
  it("keeps its length", () => {
    expect(nudgeRange(song(16), { startBar: 4, endBar: 7 }, 1)).toEqual({
      startBar: 5,
      endBar: 8,
    });
    expect(nudgeRange(song(16), { startBar: 4, endBar: 7 }, -2)).toEqual({
      startBar: 2,
      endBar: 5,
    });
  });

  it("stops at the ends rather than shortening", () => {
    // A four-bar loop nudged towards the start stays four bars. Shortening it
    // to one bar at bar zero would be a different passage.
    expect(nudgeRange(song(16), { startBar: 1, endBar: 4 }, -5)).toEqual({
      startBar: 0,
      endBar: 3,
    });
    expect(nudgeRange(song(16), { startBar: 11, endBar: 14 }, 9)).toEqual({
      startBar: 12,
      endBar: 15,
    });
  });
});

describe("marking one end — the footswitch's two presses", () => {
  it("sets the start where you are, keeping the end", () => {
    expect(setEdge(song(16), { startBar: 2, endBar: 9 }, "start", 5)).toEqual({
      startBar: 5,
      endBar: 9,
    });
  });

  it("turns the portion round when the start is marked past the end", () => {
    // `]` then `[` in the other order is a real thing a player does mid-pass,
    // and the answer is the bars between them either way.
    expect(setEdge(song(16), { startBar: 2, endBar: 5 }, "start", 11)).toEqual({
      startBar: 5,
      endBar: 11,
    });
  });

  it("starts a one-bar portion when there was none", () => {
    expect(setEdge(song(16), null, "end", 6)).toEqual({ startBar: 6, endBar: 6 });
  });
});

describe("printed bars and played bars", () => {
  it("takes the FIRST played bar a printed bar stands for", () => {
    // A repeated bar is drawn once and two played bars point at it. The first
    // to claim it keeps it, so a click does not depend on which way round the
    // pass went — `tabGroups.ts` keeps the same rule for the note lights.
    const score = repeated();
    expect(playedBarOfPrinted(score, 3)).toBe(3);
    expect(playedBarOfPrinted(score, 5)).toBe(7);
    expect(playedBarOfPrinted(score, 99)).toBeNull();
  });

  it("draws a plain range as one run", () => {
    expect(printedRunsOfRange(song(16), { startBar: 4, endBar: 7 })).toEqual([
      { from: 4, to: 7 },
    ]);
  });

  it("draws a range that crosses a repeat over each printed bar once", () => {
    // Played bars 2..5 are printed 2, 3, 2, 3 — two bars on the page, not
    // four, and the page has one of each.
    expect(printedRunsOfRange(repeated(), { startBar: 2, endBar: 5 })).toEqual([
      { from: 2, to: 3 },
    ]);
  });

  it("splits into runs when the printed bars are not contiguous", () => {
    const score = { ...song(8), bars: [0, 1, 5, 6].map((p, i) => ({
      index: i,
      startTick: i * 3840,
      lengthTicks: 3840,
      printedBar: p,
    })) } as SongScore;
    expect(printedRunsOfRange(score, { startBar: 0, endBar: 3 })).toEqual([
      { from: 0, to: 1 },
      { from: 5, to: 6 },
    ]);
  });
});

describe("portions the player keeps", () => {
  const portion = (name: string, id = name): SavedPortion => ({
    id,
    name,
    startBar: 4,
    endBar: 7,
    tempoPercent: 80,
  });

  it("replaces one saved under the same name rather than adding a second", () => {
    // Saving "Solo" twice means correcting it. Two chips called Solo is a
    // list nobody can use.
    const first = addPortion([], portion("Solo", "a"));
    const again = addPortion(first, { ...portion("Solo", "b"), startBar: 9, endBar: 12 });
    expect(again).toHaveLength(1);
    expect(again[0].id).toBe("b");
    expect(again[0].startBar).toBe(9);
  });

  it("matches the name whatever the case and spacing", () => {
    const first = addPortion([], portion("Solo", "a"));
    expect(addPortion(first, portion("  solo ", "b"))).toHaveLength(1);
  });

  it("drops the oldest once the shelf is full", () => {
    let all: SavedPortion[] = [];
    for (let i = 0; i < MAX_SAVED_PORTIONS + 3; i++) {
      all = addPortion(all, portion(`p${i}`, `p${i}`));
    }
    expect(all).toHaveLength(MAX_SAVED_PORTIONS);
    expect(all[0].name).toBe("p3");
  });

  it("renames, and refuses to rename to nothing", () => {
    const all = addPortion([], portion("Solo", "a"));
    expect(renamePortion(all, "a", "  The bridge ")[0].name).toBe("The bridge");
    expect(renamePortion(all, "a", "   ")[0].name).toBe("Solo");
  });

  it("forgets one by id and leaves the rest", () => {
    const all = addPortion(addPortion([], portion("A", "a")), portion("B", "b"));
    expect(removePortion(all, "a").map((p) => p.id)).toEqual(["b"]);
  });
});
