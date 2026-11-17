import { describe, expect, it } from "vitest";
import { ALT } from "../../../session/testKit";
import { buildTake } from "../../../session/take";
import type { NeckNote } from "../../../stage3d/api";
import {
  BARS_AHEAD,
  BARS_BEHIND,
  MIN_NOTE_PX,
  dotOffset,
  ghostNeck,
  isPracticeView,
  laneScale,
  nextOnsetIndex,
  runwayModel,
  stripOffset,
} from "./runwayModel";

const exercise = ALT.steps[0].exercises[0];
const take = buildTake(ALT, exercise, 80, null);

describe("runwayModel", () => {
  const model = runwayModel(take);

  it("puts every scheduled note on its string, at its onset's tick", () => {
    const scheduled = take.schedule.onsets.reduce((n, o) => n + o.noteIds.length, 0);
    expect(model.notes.length).toBe(scheduled);
    const byId = new Map(take.score.notes.map((n) => [n.id, n]));
    for (const note of model.notes) {
      const src = byId.get(note.noteId)!;
      expect(note.string).toBe(src.string);
      expect(note.fret).toBe(src.fret);
      expect(note.tick).toBe(src.tick);
    }
  });

  it("knows the bars, the count-in and the end", () => {
    expect(model.barTicks.length).toBe(take.bars + 1);
    expect(model.barTicks[0]).toBe(0);
    expect(model.countInTicks).toBe(-model.barLength);
    expect(model.endTick).toBe(model.barTicks[model.barTicks.length - 1]);
    expect(model.onsets.map((o) => o.tick)).toEqual([...model.onsets.map((o) => o.tick)].sort((a, b) => a - b));
  });

  it("scales the lane to three bars, the hit line a bar in", () => {
    const s = laneScale(model, 900);
    expect(s.hitX).toBeCloseTo(900 * (BARS_BEHIND / (BARS_AHEAD + BARS_BEHIND)));
    expect(s.ppt * model.barLength * (BARS_AHEAD + BARS_BEHIND)).toBeCloseTo(900);
    // A note due now sits on the hit line; one a bar later, a bar to the right.
    expect(stripOffset(model.barLength, s) + model.barLength * s.ppt).toBeCloseTo(s.hitX);
    expect(stripOffset(0, s)).toBeCloseTo(s.hitX);
    expect(laneScale(model, 0).ppt).toBe(0);
  });

  it("zooms in rather than let two notes touch", () => {
    expect(model.minGap).toBeGreaterThan(0);
    const narrow = laneScale(model, 300);
    expect(narrow.ppt * model.minGap).toBeGreaterThanOrEqual(MIN_NOTE_PX - 1e-9);
    expect(narrow.hitX).toBeCloseTo(100);
    // Wide enough, and it is three bars again.
    const wide = laneScale({ barLength: model.barLength, minGap: model.barLength }, 900);
    expect(wide.ppt * model.barLength * 3).toBeCloseTo(900);
  });
});

describe("nextOnsetIndex", () => {
  const onsets = [0, 480, 960, 1440].map((tick, id) => ({ id, tick, places: [] }));
  it("is the first onset still to come", () => {
    expect(nextOnsetIndex(onsets, -960)).toBe(0);
    expect(nextOnsetIndex(onsets, 0)).toBe(1);
    expect(nextOnsetIndex(onsets, 479)).toBe(1);
    expect(nextOnsetIndex(onsets, 2000)).toBe(4);
  });
  it("holds a note as next for a moment after it is due", () => {
    expect(nextOnsetIndex(onsets, 100, 120)).toBe(0);
    expect(nextOnsetIndex(onsets, 130, 120)).toBe(1);
  });
});

describe("ghostNeck", () => {
  const shape: NeckNote[] = [
    { string: 3, fret: 5, kind: "aim", label: "C" },
    { string: 3, fret: 7, kind: "aim", label: "D" },
    { string: 2, fret: 5, kind: "aim", label: "E" },
  ];
  const onsets = [
    { id: 0, tick: 0, places: [{ string: 3, fret: 5 }] },
    { id: 1, tick: 480, places: [{ string: 3, fret: 7 }] },
    { id: 2, tick: 960, places: [{ string: 3, fret: 5 }] },
  ];
  it("marks the next note amber, the one after a ghost, the rest quiet", () => {
    expect(ghostNeck(shape, onsets, 0).map((n) => n.kind)).toEqual(["aim", "box", "dim"]);
    expect(ghostNeck(shape, onsets, 1).map((n) => n.kind)).toEqual(["box", "aim", "dim"]);
    expect(ghostNeck(shape, onsets, 3).map((n) => n.kind)).toEqual(["dim", "dim", "dim"]);
  });
  it("keeps the labels and places", () => {
    expect(ghostNeck(shape, onsets, 0).map((n) => n.label)).toEqual(["C", "D", "E"]);
  });
});

describe("dotOffset and the setting", () => {
  it("moves the dot left for early, right for late, clamped", () => {
    expect(dotOffset(null)).toBe(0);
    expect(dotOffset(0)).toBe(0);
    expect(dotOffset(-25)).toBe(-8);
    expect(dotOffset(25)).toBe(8);
    expect(dotOffset(500)).toBe(16);
    expect(dotOffset(Number.NaN)).toBe(0);
  });
  it("accepts only the two views", () => {
    expect(isPracticeView("neck")).toBe(true);
    expect(isPracticeView("runway")).toBe(true);
    expect(isPracticeView("tab")).toBe(false);
    expect(isPracticeView(undefined)).toBe(false);
  });
});
