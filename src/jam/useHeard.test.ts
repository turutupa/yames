/**
 * Review M7, S4 and N1: a chart change stops one worker and starts the next
 * in the same tick. The stop must reach the backend first and name the worker
 * it means; and a tempo change must reach a worker that has no chart.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { HeardChart } from "../ipc";

const calls: string[] = [];
/** `clearStale` of each start. */
const cleared: boolean[] = [];
let nextId = 1;
/** Resolvers of the starts in flight, oldest first. */
let starts: ((id: number | null) => void)[] = [];
let holdStarts = false;
let reading: (live: unknown) => void = () => {};
/** What `harmonyStop` answers. */
let stopSummary: unknown = null;

vi.mock("../ipc", () => ({
  harmonyStart: vi.fn((_chart: unknown, _bpm: number, clearStale: boolean) => {
    const id = nextId++;
    calls.push(`start:${id}`);
    cleared.push(clearStale);
    if (!holdStarts) return Promise.resolve(id);
    return new Promise<number | null>((resolve) => starts.push(() => resolve(id)));
  }),
  harmonyStop: vi.fn((id: number) => {
    calls.push(`stop:${id}`);
    return Promise.resolve(stopSummary);
  }),
  harmonyMarkBar: vi.fn(() => Promise.resolve()),
  harmonySetTempo: vi.fn((bpm: number) => {
    calls.push(`tempo:${bpm}`);
    return Promise.resolve();
  }),
  onHarmonyReading: vi.fn((cb: (live: unknown) => void) => {
    reading = cb;
    return Promise.resolve(() => {});
  }),
}));

const { useHeard } = await import("./useHeard");
const { resetCoachBus, subscribe } = await import("../coach/bus");

type Props = { active: boolean; chart: HeardChart | null; bpm: number; formBar: number; jamRun?: boolean };
const chart = (tonic: number) => ({ key: { tonic, mode: "major" }, bars: [] }) as unknown as HeardChart;

async function settle() {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

beforeEach(async () => {
  await settle();
  calls.length = 0;
  cleared.length = 0;
  starts = [];
  holdStarts = false;
  stopSummary = null;
  resetCoachBus();
});

describe("useHeard: jamStopped (leg c5a1)", () => {
  const summary = { reading: { keyState: "settled", key: null, chord: null, settledAtS: 3, heardS: 40 }, chords: [], chordBeats: 0, beats: 80 };

  function heard() {
    const events: { type: string; heard?: unknown; at: number }[] = [];
    subscribe((e) => events.push(e as never));
    return events;
  }

  it("a jam's stop publishes jamStopped once, with what the hearing came to", async () => {
    const events = heard();
    stopSummary = summary;
    const view = renderHook((p: Props) => useHeard(p), { initialProps: { active: true, chart: null, bpm: 100, formBar: 0, jamRun: true } });
    await settle();
    // playing: nothing is published, however many renders
    view.rerender({ active: true, chart: null, bpm: 100, formBar: 1, jamRun: true });
    view.rerender({ active: true, chart: null, bpm: 100, formBar: 2, jamRun: true });
    await settle();
    expect(events).toEqual([]);
    const before = Date.now();
    view.rerender({ active: false, chart: null, bpm: 100, formBar: 2, jamRun: false });
    await settle();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("jamStopped");
    expect(events[0].heard).toEqual(summary);
    expect(events[0].at).toBeGreaterThanOrEqual(before);
    view.unmount();
    await settle();
    expect(events).toHaveLength(1);
  });

  it("a stop with hearing off publishes jamStopped with no heard, and invokes nothing", async () => {
    const events = heard();
    stopSummary = summary;
    const view = renderHook((p: Props) => useHeard(p), { initialProps: { active: false, chart: null, bpm: 100, formBar: 0, jamRun: true } });
    await settle();
    view.rerender({ active: false, chart: null, bpm: 100, formBar: 0, jamRun: false });
    await settle();
    expect(calls).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("jamStopped");
    expect("heard" in events[0]).toBe(false);
  });

  it("a stretch the engine heard nothing in (null) publishes no heard", async () => {
    const events = heard();
    const view = renderHook((p: Props) => useHeard(p), { initialProps: { active: true, chart: null, bpm: 100, formBar: 0, jamRun: true } });
    await settle();
    view.rerender({ active: false, chart: null, bpm: 100, formBar: 0, jamRun: false });
    await settle();
    expect(events).toHaveLength(1);
    expect("heard" in events[0]).toBe(false);
  });

  it("a Session's free play (no jamRun) publishes nothing", async () => {
    const events = heard();
    stopSummary = summary;
    const view = renderHook((p: Props) => useHeard(p), { initialProps: { active: true, chart: null, bpm: 100, formBar: 0 } });
    await settle();
    view.rerender({ active: false, chart: null, bpm: 100, formBar: 0 });
    await settle();
    expect(events).toEqual([]);
  });
});

describe("useHeard", () => {
  it("stops the old worker by its id before it starts the next", async () => {
    const view = renderHook((p: Props) => useHeard(p), { initialProps: { active: true, chart: chart(0), bpm: 100, formBar: 0 } });
    await settle();
    const first = calls[0].split(":")[1];
    view.rerender({ active: true, chart: chart(7), bpm: 100, formBar: 0 });
    await settle();
    expect(calls.slice(0, 3)).toEqual([`start:${first}`, `stop:${first}`, `start:${Number(first) + 1}`]);
    view.unmount();
    await settle();
    expect(calls[calls.length - 1]).toBe(`stop:${Number(first) + 1}`);
  });

  it("a stop asked for while the start is in flight waits for it, and stops that worker", async () => {
    holdStarts = true;
    const view = renderHook((p: Props) => useHeard(p), { initialProps: { active: true, chart: null, bpm: 100, formBar: 0 } });
    await settle();
    expect(calls).toHaveLength(1);
    const id = calls[0].split(":")[1];
    view.unmount();
    await settle();
    // not stopped yet: there is no id to stop, and no stop of "whatever runs"
    expect(calls).toHaveLength(1);
    starts.shift()?.(null);
    await settle();
    expect(calls).toEqual([`start:${id}`, `stop:${id}`]);
  });

  it("tells a running worker the new tempo, and says nothing while off", async () => {
    const view = renderHook((p: Props) => useHeard(p), { initialProps: { active: false, chart: null, bpm: 100, formBar: 0 } });
    view.rerender({ active: false, chart: null, bpm: 110, formBar: 0 });
    await settle();
    expect(calls).toEqual([]);
    view.rerender({ active: true, chart: null, bpm: 110, formBar: 0 });
    await settle();
    expect(calls.filter((c) => c.startsWith("tempo"))).toEqual([]);
    view.rerender({ active: true, chart: null, bpm: 132, formBar: 0 });
    await settle();
    expect(calls.filter((c) => c.startsWith("tempo"))).toEqual(["tempo:132"]);
    view.unmount();
    await settle();
  });

  it("clears a schedule left loaded when free play begins, and not when it asks again", async () => {
    vi.useFakeTimers();
    const view = renderHook((p: Props) => useHeard(p), { initialProps: { active: true, chart: null, bpm: 100, formBar: 0 } });
    await settle();
    expect(cleared).toEqual([true]);
    // the worker ended by itself: asked for again a little later
    act(() => reading(null));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await settle();
    expect(cleared).toEqual([true, false]);
    view.unmount();
    await settle();
  });

  it("clears nothing while a stop is still being graded against the schedule", async () => {
    const { holdSchedule } = await import("../songs/scheduleHold");
    const release = holdSchedule();
    const view = renderHook((p: Props) => useHeard(p), { initialProps: { active: true, chart: null, bpm: 100, formBar: 0 } });
    await settle();
    release();
    expect(cleared, "free play cleared the schedule a Songs stop was being graded against").toEqual([false]);
    view.unmount();
    await settle();
  });
});

afterEach(() => {
  vi.useRealTimers();
});
