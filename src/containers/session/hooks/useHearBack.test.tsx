import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const calls: string[] = [];
const ended: { take: ((g?: number) => void) | null; jam: (() => void) | null } = { take: null, jam: null };
const answers = { hear: null as null | (() => Promise<{ generation: number; lengthMs: number }>), held: { held: true, bars: 12 } };

vi.mock("../../../ipc", () => ({
  hearTake: vi.fn((serial: number, from: number, to: number) => {
    calls.push(`hearTake(${serial},${from},${to})`);
    return answers.hear ? answers.hear() : Promise.resolve({ generation: 5, lengthMs: 1200 });
  }),
  stopHearTake: vi.fn((g: number) => {
    calls.push(`stopHearTake(${g})`);
    return Promise.resolve(true);
  }),
  heardTake: vi.fn((serial: number) => {
    calls.push(`heardTake(${serial})`);
    return Promise.resolve(answers.held);
  }),
  setListenDemo: vi.fn((on: boolean, o: { tail?: boolean } = {}) => {
    calls.push(on ? "gate(on)" : `gate(off${o.tail === false ? ",now" : ""})`);
    return Promise.resolve();
  }),
  setPlaying: vi.fn((on: boolean) => {
    calls.push(`setPlaying(${on})`);
    return Promise.resolve();
  }),
  loadSong: vi.fn(() => {
    calls.push("loadSong");
    return Promise.resolve();
  }),
  setSongMix: vi.fn(() => {
    calls.push("setSongMix");
    return Promise.resolve();
  }),
  clearSong: vi.fn(() => {
    calls.push("clearSong");
    return Promise.resolve();
  }),
  clearScoreSchedule: vi.fn(() => {
    calls.push("clearScoreSchedule");
    return Promise.resolve();
  }),
  onTakePlaybackEnded: vi.fn((cb: (g?: number) => void) => {
    ended.take = cb;
    return Promise.resolve(() => {
      if (ended.take === cb) ended.take = null;
    });
  }),
  onJamEnded: vi.fn((cb: () => void) => {
    ended.jam = cb;
    return Promise.resolve(() => {
      if (ended.jam === cb) ended.jam = null;
    });
  }),
}));

import { useHearBack } from "./useHearBack";
import type { HearBackInput } from "./useHearBack";
import { soundStarting } from "../../../soundGate";
import { buildTake } from "../../../session/take";
import { ALT } from "../../../session/testKit";

const EXERCISE = ALT.steps.flatMap((s) => s.exercises).find((e) => e.bars >= 3) ?? ALT.steps[0].exercises[0];
const TAKE = buildTake(ALT, EXERCISE, 90);
const BAR = { played: 7, pattern: Math.min(3, EXERCISE.bars) };

function setup(over: Partial<HearBackInput> = {}) {
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = (work: () => Promise<unknown>) => {
    const next = queue.then(work).catch(() => {});
    queue = next;
    return next;
  };
  const onTakeOff = vi.fn();
  const base: HearBackInput = {
    enqueue,
    isPlaying: false,
    phase: "result",
    takeId: "take-1",
    serial: 41,
    take: TAKE,
    shown: true,
    bandVolume: 0.8,
    onTakeOff,
    ...over,
  };
  const hook = renderHook((p: HearBackInput) => useHearBack(p), { initialProps: base });
  const flush = async () => {
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await queue;
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  };
  return { ...hook, base, flush, enqueue, onTakeOff };
}

beforeEach(() => {
  calls.length = 0;
  ended.take = null;
  ended.jam = null;
  answers.hear = null;
  answers.held = { held: true, bars: 12 };
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useHearBack", () => {
  it("asks whether this Take is held, by its serial, and keeps the answer", async () => {
    const { result, flush } = setup();
    await flush();
    expect(calls[0]).toBe("heardTake(41)");
    expect(result.current.held).toEqual({ held: true, bars: 12 });
  });

  it("asks nothing without a serial, and holds nothing", async () => {
    const { result, flush } = setup({ serial: null });
    await flush();
    expect(calls).toEqual([]);
    expect(result.current.held).toBeNull();
  });

  it("plays the player's bar, then the demo of it, in this order", async () => {
    const { result, rerender, base, flush, onTakeOff } = setup();
    await flush();
    calls.length = 0;
    act(() => result.current.toggle(BAR));
    expect(result.current.stage).toBe("yours");
    expect(result.current.bar).toBe(7);
    await flush();
    expect(calls).toEqual(["gate(on)", "hearTake(41,7,7)", "gate(on)"]);
    act(() => ended.take?.(5));
    expect(result.current.stage).toBe("demo");
    await flush();
    expect(onTakeOff).toHaveBeenCalledTimes(1);
    expect(calls.slice(3)).toEqual([
      "stopHearTake(5)",
      "clearScoreSchedule",
      "loadSong",
      "setSongMix",
      "setPlaying(true)",
      "gate(on)",
    ]);
    // The engine reports the demo playing, then its end.
    rerender({ ...base, isPlaying: true });
    act(() => ended.jam?.());
    await flush();
    expect(calls.slice(9)).toEqual(["setPlaying(false)", "clearSong", "gate(off)"]);
    // Off only once the engine agrees it is silent.
    expect(result.current.stage).toBe("stopped");
    expect(result.current.active).toBe(true);
    rerender({ ...base, isPlaying: false });
    expect(result.current.stage).toBe("off");
    expect(result.current.active).toBe(false);
  });

  it("ignores an ending of any other playback", async () => {
    const { result, flush } = setup();
    await flush();
    act(() => result.current.toggle(BAR));
    await flush();
    act(() => ended.take?.(4));
    expect(result.current.stage).toBe("yours");
  });

  it("a second press between the halves stops it: nothing of the demo is sent", async () => {
    const { result, flush } = setup();
    await flush();
    act(() => result.current.toggle(BAR));
    await flush();
    calls.length = 0;
    act(() => result.current.toggle(BAR));
    await flush();
    expect(calls).toEqual(["stopHearTake(5)", "gate(off)"]);
    expect(result.current.stage).toBe("off");
  });

  it("a stop pressed before hearTake has answered still stops that generation", async () => {
    let resolve: (v: { generation: number; lengthMs: number }) => void = () => {};
    answers.hear = () => new Promise((r) => (resolve = r));
    const { result, flush } = setup();
    await flush();
    calls.length = 0;
    act(() => result.current.toggle(BAR));
    // The press's sends have reached `hearTake`, which has not answered yet.
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
    expect(calls).toEqual(["gate(on)", "hearTake(41,7,7)"]);
    act(() => result.current.toggle(BAR));
    resolve({ generation: 9, lengthMs: 1000 });
    await flush();
    expect(calls).toEqual(["gate(on)", "hearTake(41,7,7)", "stopHearTake(9)", "gate(off)"]);
  });

  it("a Start during the player's bar stops it, and nothing of ours starts after", async () => {
    const { result, flush } = setup();
    await flush();
    act(() => result.current.toggle(BAR));
    await flush();
    calls.length = 0;
    act(() => soundStarting());
    await flush();
    expect(calls).toEqual(["stopHearTake(5)", "gate(off,now)"]);
    expect(result.current.stage).toBe("off");
  });

  it("a Start during the demo stops it without stopping the transport it started", async () => {
    const { result, rerender, base, flush } = setup();
    await flush();
    act(() => result.current.toggle(BAR));
    await flush();
    act(() => ended.take?.(5));
    await flush();
    rerender({ ...base, isPlaying: true });
    calls.length = 0;
    act(() => soundStarting());
    await flush();
    expect(calls).toEqual(["gate(off,now)"]);
    rerender({ ...base, isPlaying: false });
    expect(result.current.stage).toBe("off");
  });

  it("its own Start does not stop it", async () => {
    const { result, flush } = setup();
    await flush();
    act(() => result.current.toggle(BAR));
    await flush();
    act(() => ended.take?.(5));
    await flush();
    expect(result.current.stage).toBe("demo");
  });

  it("leaving the result (Go again) stops it before anything queued after can start", async () => {
    const { result, rerender, base, flush, enqueue } = setup();
    await flush();
    act(() => result.current.toggle(BAR));
    await flush();
    calls.length = 0;
    rerender({ ...base, phase: "ready", takeId: null });
    // What the ready screen sends next: its Take, then its Start.
    void enqueue(async () => {
      calls.push("prepare");
    });
    await flush();
    expect(calls).toEqual(["stopHearTake(5)", "gate(off,now)", "prepare"]);
  });

  it("leaving the Session's view stops it", async () => {
    const { result, rerender, base, flush } = setup();
    await flush();
    act(() => result.current.toggle(BAR));
    await flush();
    calls.length = 0;
    rerender({ ...base, shown: false });
    await flush();
    expect(calls).toEqual(["stopHearTake(5)", "gate(off,now)"]);
  });

  it("a refusal from the engine leaves nothing on and the input open", async () => {
    answers.hear = () => Promise.reject("not held");
    const { result, flush } = setup();
    await flush();
    calls.length = 0;
    act(() => result.current.toggle(BAR));
    await flush();
    expect(calls).toEqual(["gate(on)", "hearTake(41,7,7)", "gate(off,now)"]);
    expect(result.current.stage).toBe("off");
  });

  it("a second press before anything was sent sends nothing but the gate's end", async () => {
    const { result, flush } = setup();
    await flush();
    calls.length = 0;
    act(() => result.current.toggle(BAR));
    act(() => result.current.toggle(BAR));
    await flush();
    expect(calls).toEqual(["gate(off)"]);
    expect(result.current.stage).toBe("off");
  });

  it("does nothing off a result", async () => {
    const { result, flush } = setup({ phase: "ready" });
    await flush();
    act(() => result.current.toggle(BAR));
    await flush();
    expect(calls).toEqual([]);
  });

  it("takes the ending as given when the event never comes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, flush } = setup();
    await flush();
    act(() => result.current.toggle(BAR));
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(1200 + 1600);
    });
    expect(result.current.stage).toBe("demo");
  });
});
