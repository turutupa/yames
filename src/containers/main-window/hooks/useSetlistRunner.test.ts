/**
 * The hook's own job is small — two clocks in, IPC calls out — so these
 * tests only cover the wiring the runtime tests cannot see: that a beat
 * proper is `subdivision === 0`, that a landed switch reaches the engine's
 * setters, and that a finished setlist stops the transport.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSetlistRunner } from "./useSetlistRunner";
import { mockInvoke } from "../../../test/mocks";
import { jamToSetlistStep } from "../../../setlist";
import { STARTER_JAMS } from "../../../jam/jams";
import type { Jam } from "../../../jam/types";
import type { BeatEvent, Setlist, SetlistStep, SetlistTrigger } from "../../../types";

function step(name: string, bpm: number, trigger: SetlistTrigger): SetlistStep {
  return {
    id: `s-${name}`,
    name,
    bpm,
    subdivision: 1,
    beatGroups: [4],
    freeMode: false,
    soundType: "click",
    volume: 0.5,
    trigger,
    transition: { kind: "cut" },
  };
}

const CHAIN: Setlist = {
  id: "c1",
  name: "Warm-up",
  createdAt: 0,
  repeat: 1,
  steps: [step("a", 80, { kind: "bars", bars: 1 }), step("b", 120, { kind: "manual" })],
};

function beat(n: number, isDownbeat: boolean, subdivision = 0): BeatEvent {
  return { beat: n, measureBeat: 0, subdivision, isDownbeat, isAccent: isDownbeat, formBar: 0, chorus: 1 };
}

/** Args of every invoke of `command` so far. */
function callsTo(command: string) {
  return mockInvoke.mock.calls.filter((c) => c[0] === command).map((c) => c[1]);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function mount(setlist: Setlist | null = CHAIN) {
  return renderHook(
    ({ b, playing }: { b: BeatEvent | null; playing: boolean }) =>
      useSetlistRunner(setlist, playing, b),
    { initialProps: { b: null as BeatEvent | null, playing: false } },
  );
}

describe("useSetlistRunner", () => {
  it("applies the first step when the transport starts", () => {
    const { rerender } = mount();
    act(() => rerender({ b: null, playing: true }));
    expect(callsTo("set_bpm")).toContainEqual({ bpm: 80 });
    expect(callsTo("set_beat_groups")).toContainEqual({ groups: [4] });
    expect(callsTo("set_sound_type")).toContainEqual({ soundType: "click" });
    expect(callsTo("set_volume")).toContainEqual({ volume: 0.5 });
  });

  it("does nothing at all without a setlist", () => {
    const { rerender } = mount(null);
    act(() => rerender({ b: null, playing: true }));
    expect(callsTo("set_bpm")).toEqual([]);
  });

  it("counts bars from downbeats and drives the switch through the setters", () => {
    const { result, rerender } = mount();
    act(() => rerender({ b: null, playing: true }));
    mockInvoke.mockClear();

    // Bar one: its own downbeat, then three beats.
    act(() => rerender({ b: beat(0, true), playing: true }));
    act(() => rerender({ b: beat(1, false), playing: true }));
    act(() => rerender({ b: beat(2, false), playing: true }));
    act(() => rerender({ b: beat(3, false), playing: true }));
    expect(result.current.stepNumber).toBe(1);
    expect(callsTo("set_bpm")).toEqual([]);

    // The downbeat of bar two is where the one-bar gap comes due.
    act(() => rerender({ b: beat(4, true), playing: true }));
    expect(result.current.stepNumber).toBe(2);
    expect(result.current.step?.name).toBe("b");
    expect(callsTo("set_bpm")).toEqual([{ bpm: 120 }]);
  });

  it("ignores subdivisions and a re-emitted beat index", () => {
    const { result, rerender } = mount();
    act(() => rerender({ b: null, playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    // Four subdivision ticks inside bar one, then the same downbeat again.
    act(() => rerender({ b: beat(1, false, 1), playing: true }));
    act(() => rerender({ b: beat(2, true, 2), playing: true }));
    act(() => rerender({ b: beat(3, true, 1), playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    expect(result.current.state.barsInStep).toBe(0);
    expect(result.current.stepNumber).toBe(1);
  });

  it("stops the transport when the setlist runs out (U9.6)", () => {
    const single: Setlist = { ...CHAIN, steps: [CHAIN.steps[0]] };
    const { result, rerender } = renderHook(
      ({ b, playing }: { b: BeatEvent | null; playing: boolean }) =>
        useSetlistRunner(single, playing, b),
      { initialProps: { b: null as BeatEvent | null, playing: false } },
    );
    act(() => rerender({ b: null, playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    act(() => rerender({ b: beat(4, true), playing: true }));
    expect(callsTo("set_playing")).toContainEqual({ playing: false });
    expect(result.current.state.phase).toBe("finished");
    expect(result.current.step).toBeNull();
  });

  it("skips ahead on the next downbeat, not on the press (U9.3)", () => {
    const { result, rerender } = mount();
    act(() => rerender({ b: null, playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    act(() => rerender({ b: beat(1, false), playing: true }));
    act(() => result.current.skip());
    expect(result.current.stepNumber).toBe(1);
    act(() => rerender({ b: beat(2, false), playing: true }));
    expect(result.current.stepNumber).toBe(1);
    act(() => rerender({ b: beat(4, true), playing: true }));
    expect(result.current.stepNumber).toBe(2);
  });

  it("counts a seconds gap down between beats (U9.7)", () => {
    const timed: Setlist = {
      ...CHAIN,
      steps: [step("a", 80, { kind: "seconds", seconds: 30 }), CHAIN.steps[1]],
    };
    const { result, rerender } = renderHook(
      ({ b, playing }: { b: BeatEvent | null; playing: boolean }) =>
        useSetlistRunner(timed, playing, b),
      { initialProps: { b: null as BeatEvent | null, playing: false } },
    );
    act(() => rerender({ b: null, playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    expect(result.current.remaining).toEqual({ kind: "seconds", seconds: 30 });
    // No beat arrives, but the number still moves.
    act(() => void vi.advanceTimersByTime(5000));
    expect(result.current.remaining).toEqual({ kind: "seconds", seconds: 25 });
  });

  it("forgets the run when the transport stops", () => {
    const { result, rerender } = mount();
    act(() => rerender({ b: null, playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    act(() => rerender({ b: beat(4, true), playing: true }));
    expect(result.current.stepNumber).toBe(2);
    act(() => rerender({ b: null, playing: false }));
    expect(result.current.state.phase).toBe("idle");
    expect(result.current.step).toBeNull();
  });

  it("puts the volume back if the run is stopped inside a rest", () => {
    const resting: Setlist = {
      ...CHAIN,
      steps: [
        { ...CHAIN.steps[0], volume: 0.42, transition: { kind: "rest", bars: 4 } },
        CHAIN.steps[1],
      ],
    };
    const { rerender } = renderHook(
      ({ b, playing }: { b: BeatEvent | null; playing: boolean }) =>
        useSetlistRunner(resting, playing, b),
      { initialProps: { b: null as BeatEvent | null, playing: false } },
    );
    act(() => rerender({ b: null, playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    act(() => rerender({ b: beat(4, true), playing: true }));
    expect(callsTo("set_volume")).toContainEqual({ volume: 0 });
    mockInvoke.mockClear();
    act(() => rerender({ b: null, playing: false }));
    expect(callsTo("set_volume")).toContainEqual({ volume: 0.42 });
  });
});

// ---------------------------------------------------------------------------
// A jam as a step (JAM_MODE §8.5)
// ---------------------------------------------------------------------------

/**
 * Let the pushes finish.
 *
 * `pushJam` and `clearJam` await each setter so the engine SEES them in order,
 * which means only the first of them has been made by the time a synchronous
 * `act()` returns. Anything asserting on the order — which is the whole point
 * of these tests — has to let the microtasks run first.
 */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  });
}

/** The order every invoke went out in, so a sequence can be asserted on. */
function order(...commands: string[]) {
  return mockInvoke.mock.calls.map((c) => c[0]).filter((c) => commands.includes(c as string));
}

const JAM: Jam = { ...STARTER_JAMS[0], id: "j1", bpm: 92 };

/** A setlist whose first step is that jam and whose second is a plain click. */
function jammed(over: Partial<SetlistStep> = {}): Setlist {
  return {
    id: "c-jam",
    name: "Routine",
    createdAt: 0,
    repeat: 1,
    steps: [
      { ...jamToSetlistStep(JAM), trigger: { kind: "bars", bars: 1 }, ...over },
      step("after", 120, { kind: "manual" }),
    ],
  };
}

function mountJammed(
  setlist: Setlist,
  jams: Jam[] = [JAM],
  meter = { subdivision: 4, beatGroups: [7], freeMode: true },
) {
  return renderHook(
    ({ b, playing }: { b: BeatEvent | null; playing: boolean }) =>
      useSetlistRunner(setlist, playing, b, 0, {
        getJam: (id) => jams.find((j) => j.id === id) ?? null,
        lineup: { drums: true, bass: true },
        meter,
      }),
    { initialProps: { b: null as BeatEvent | null, playing: false } },
  );
}

describe("a setlist step that is a jam", () => {
  it("sends the meter before the table, the way the jam tab does", async () => {
    // The engine checks `ticksPerBeat × beatsPerBar` against its own bar and
    // refuses a table that disagrees — by playing the plain click, silently.
    // A table that arrives before its meter is checked against the PREVIOUS
    // one, so this order is the whole contract.
    const { rerender } = mountJammed(jammed());
    act(() => rerender({ b: null, playing: true }));
    await settle();

    const seen = order("set_free_mode", "set_beat_groups", "set_subdivision", "set_jam");
    expect(seen.indexOf("set_jam")).toBeGreaterThan(seen.indexOf("set_beat_groups"));
    expect(seen.indexOf("set_jam")).toBeGreaterThan(seen.indexOf("set_subdivision"));
    expect(seen.indexOf("set_beat_groups")).toBeGreaterThan(seen.indexOf("set_free_mode"));
  });

  it("hands the engine a table, and the step's own tempo beside it", async () => {
    const { rerender } = mountJammed(jammed());
    act(() => rerender({ b: null, playing: true }));
    await settle();
    const config = callsTo("set_jam").at(-1) as { config: { formBars: number } | null };
    expect(config.config).not.toBeNull();
    expect(config.config!.formBars).toBe(12);
    expect(callsTo("set_bpm")).toContainEqual({ bpm: 92 });
  });

  it("exposes the running jam, so the player can draw the form", () => {
    const { result, rerender } = mountJammed(jammed());
    act(() => rerender({ b: null, playing: true }));
    expect(result.current.jam?.id).toBe("j1");
  });

  it("takes the band away when a plain step follows, and leaves its meter alone", async () => {
    const { result, rerender } = mountJammed(jammed());
    act(() => rerender({ b: null, playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    await settle();
    mockInvoke.mockClear();
    // The downbeat of bar two is where the one-bar gap comes due.
    act(() => rerender({ b: beat(4, true), playing: true }));
    await settle();

    expect(result.current.stepNumber).toBe(2);
    expect(result.current.jam).toBeNull();
    expect(callsTo("set_jam")).toContainEqual({ config: null });
    // The plain step is about to set its own meter; handing back a remembered
    // one here would undo it on the beat it landed.
    expect(callsTo("set_beat_groups")).toEqual([{ groups: [4] }]);
  });

  it("gives the metronome its own meter back when the run stops", async () => {
    // The jam set the engine's subdivision and beat groups to the groove's,
    // and those are engine state, not jam state. A player who came in from
    // 7/8 must not find their own setting quietly gone.
    const { rerender } = mountJammed(jammed());
    act(() => rerender({ b: null, playing: true }));
    await settle();
    mockInvoke.mockClear();
    act(() => rerender({ b: null, playing: false }));
    await settle();

    expect(callsTo("set_jam")).toContainEqual({ config: null });
    expect(callsTo("set_beat_groups")).toContainEqual({ groups: [7] });
    expect(callsTo("set_subdivision")).toContainEqual({ subdivision: 4 });
    expect(callsTo("set_free_mode")).toContainEqual({ enabled: true });
  });

  it("leaves the plain step's own meter alone when the run ends on it", async () => {
    // The pocket is filled on the first jam step of the run. A routine of
    // "blues, then alternate picking" that is stopped during the picking used
    // to hand back the meter from before the WHOLE run, over the picking
    // step's own — which the runner had set one step earlier and which is the
    // meter actually playing. The band still goes; the meter stays put.
    const { result, rerender } = mountJammed(jammed());
    act(() => rerender({ b: null, playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    act(() => rerender({ b: beat(4, true), playing: true }));
    await settle();
    expect(result.current.stepNumber).toBe(2);
    mockInvoke.mockClear();

    act(() => rerender({ b: null, playing: false }));
    await settle();

    expect(callsTo("set_jam")).toContainEqual({ config: null });
    expect(callsTo("set_beat_groups")).toEqual([]);
    expect(callsTo("set_subdivision")).toEqual([]);
    expect(callsTo("set_free_mode")).toEqual([]);
  });

  it("says nothing about the band on a setlist that has none", async () => {
    // One `set_jam(null)` per plain step is the reconciliation every step
    // does; what must not happen is the run END sending one on a routine
    // that never had a band in it.
    const { rerender } = mount();
    act(() => rerender({ b: null, playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    mockInvoke.mockClear();
    act(() => rerender({ b: null, playing: false }));
    await settle();
    expect(callsTo("set_jam")).toEqual([]);
  });

  it("plays a deleted jam's step as the plain step it describes", () => {
    // The step still carries the tempo, the meter and the sound the jam gave
    // it, so it plays. What it must not do is leave a table on the engine.
    const { result, rerender } = mountJammed(jammed(), []);
    act(() => rerender({ b: null, playing: true }));
    expect(result.current.jam).toBeNull();
    expect(callsTo("set_jam")).toEqual([{ config: null }]);
    expect(callsTo("set_bpm")).toContainEqual({ bpm: 92 });
    expect(callsTo("set_beat_groups")).toContainEqual({ groups: [4] });
  });

  it("sends the next bar's bass at the bar line, and only when it moves", async () => {
    // Over a twelve-bar blues the bass plays A under bar 1 and D under bar 5.
    // Without this the drummer would be right and the bass a chord behind for
    // the whole step.
    const long = jammed({ trigger: { kind: "manual" } });
    const { rerender } = mountJammed(long);
    act(() => rerender({ b: null, playing: true }));
    await settle();
    mockInvoke.mockClear();

    // Bar 0's config is already in flight from the load; this bar line says
    // nothing, which is what stops the table overtaking its own meter.
    act(() => rerender({ b: { ...beat(0, true), formBar: 0 }, playing: true }));
    expect(callsTo("set_jam")).toEqual([]);

    // Bars 1, 2 and 3 of a blues are all the I, so nothing has to be said
    // until the bar before the IV.
    act(() => rerender({ b: { ...beat(4, true), formBar: 1 }, playing: true }));
    act(() => rerender({ b: { ...beat(8, true), formBar: 2 }, playing: true }));
    act(() => rerender({ b: { ...beat(12, true), formBar: 3 }, playing: true }));
    const sends = callsTo("set_jam") as { config: unknown }[];
    expect(sends.every((s) => s.config !== null)).toBe(true);
    expect(sends.length).toBeGreaterThan(0);
  });
});
