import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { NeckStageContext } from "../../../stage3d/api";
import type { NeckStage } from "../../../stage3d/api";
import { exerciseNeck, fingeredNotes, kindOfMark, neckNotesOf, useNeckSlot, useNeckTake, zoomOf } from "./useNeck";
import type { TakePlan } from "../../../session/take";
import type { TimingMark } from "../../songs/review/marks";

function fakeStage(): NeckStage & { [k: string]: ReturnType<typeof vi.fn> } {
  return {
    setView: vi.fn(),
    setNotes: vi.fn(),
    pluck: vi.fn(),
    sweep: vi.fn(),
    setTakeRunning: vi.fn(),
    is3d: false,
  } as never;
}

describe("the neck's selectors", () => {
  it("colours a live mark by its timing: on time a tone, off it tension, missed a clash", () => {
    expect(kindOfMark("onTime")).toBe("tone");
    expect(kindOfMark("slightlyEarly")).toBe("tone");
    expect(kindOfMark("slightlyLate")).toBe("tone");
    expect(kindOfMark("early")).toBe("tens");
    expect(kindOfMark("late")).toBe("tens");
    expect(kindOfMark("missed")).toBe("clash");
    expect(kindOfMark("notAssessed")).toBeNull();
  });

  it("frames an Exercise's frets with a fret either side, never narrower than four", () => {
    expect(zoomOf([{ fret: 5 }, { fret: 8 }])).toEqual({ kind: "zoom", from: 4, to: 9 });
    expect(zoomOf([{ fret: 7 }])).toEqual({ kind: "zoom", from: 5, to: 9 });
    expect(zoomOf([{ fret: 0 }])).toEqual({ kind: "zoom", from: 0, to: 5 });
    expect(zoomOf([{ fret: 24 }])).toEqual({ kind: "zoom", from: 20, to: 24 });
  });

  it("puts each place on the neck once, named by its letter", () => {
    const notes = neckNotesOf([
      { string: 5, fret: 5, midi: 50 },
      { string: 5, fret: 5, midi: 50 },
      { string: 5, fret: 7, midi: 52 },
    ]);
    expect(notes).toEqual([
      { string: 5, fret: 5, kind: "aim", label: "D" },
      { string: 5, fret: 7, kind: "aim", label: "E" },
    ]);
  });
});

describe("an Exercise's dots: fingers, never frets", () => {
  // Four fingers on one string at fret 5: 5 6 7 8 are fingers 1 2 3 4.
  const drill = [5, 6, 7, 8].map((fret, i) => ({ string: 5, fret, midi: 45 + 5 + i, tick: i * 480, duration: 480 }));
  const fixed = { fret: 5, shifts: "none" as const };

  it("labels a result's neck with the fingers the ready screen shows", () => {
    const { view, notes } = exerciseNeck(drill as never, "tone", false, fixed);
    expect(view).toEqual({ kind: "zoom", from: 4, to: 9 });
    expect(notes.map((n) => n.label)).toEqual(["1", "2", "3", "4"]);
    expect(notes.every((n) => n.kind === "tone")).toBe(true);
  });

  it("never puts a fret number on a dot, and leaves it blank where the finger is not known", () => {
    const { notes } = exerciseNeck(drill as never, "dim");
    expect(notes.every((n) => n.label === undefined)).toBe(true);
    const shifting = exerciseNeck([...drill, { string: 5, fret: 12, midi: 57, tick: 2000, duration: 480 }] as never, "dim", false, {
      fret: 5,
      shifts: "allowed",
    });
    expect(shifting.notes.some((n) => n.label === "12" || n.label === "5")).toBe(false);
  });

  it("marks an open string 0 and keeps a theory dot's letter only where it has no finger", () => {
    const open = fingeredNotes([{ string: 6, fret: 0, midi: 40 }], undefined, "aim", true);
    expect(open[0].label).toBe("0");
    const theory = fingeredNotes([{ string: 5, fret: 3, midi: 48 }], undefined, "aim", true);
    expect(theory[0].label).toBe("C");
  });
});

describe("the neck from a screen", () => {
  it("frames into the slot it was given, and sweeps once on arrival", () => {
    const stage = fakeStage();
    function Screen() {
      const slot = useNeckSlot({ kind: "whole" }, [], { sweep: true });
      return <div ref={slot} data-testid="slot" />;
    }
    const { getByTestId } = render(
      <NeckStageContext.Provider value={stage}>
        <Screen />
      </NeckStageContext.Provider>,
    );
    expect(stage.setView).toHaveBeenCalledWith({ kind: "whole" }, getByTestId("slot"));
    expect(stage.sweep).toHaveBeenCalledTimes(1);
  });

  it("plucks each note the analyzer rules on once, where the score put it", () => {
    const stage = fakeStage();
    const take = {
      score: { notes: [{ id: 0, string: 5, fret: 5 }, { id: 1, string: 5, fret: 7 }] },
      schedule: { onsets: [{ id: 10, noteIds: [0] }, { id: 11, noteIds: [1] }] },
    } as unknown as TakePlan;
    function Running({ lights }: { lights: ReadonlyMap<number, TimingMark> }) {
      useNeckTake(take, lights, true);
      return null;
    }
    const { rerender } = render(
      <NeckStageContext.Provider value={stage}>
        <Running lights={new Map([[10, "onTime"]])} />
      </NeckStageContext.Provider>,
    );
    rerender(
      <NeckStageContext.Provider value={stage}>
        <Running
          lights={
            new Map<number, TimingMark>([
              [10, "onTime"],
              [11, "late"],
            ])
          }
        />
      </NeckStageContext.Provider>,
    );
    expect(stage.setTakeRunning).toHaveBeenCalledWith(true);
    expect(stage.pluck.mock.calls).toEqual([
      [5, 5, "tone"],
      [5, 7, "tens"],
    ]);
  });
});
