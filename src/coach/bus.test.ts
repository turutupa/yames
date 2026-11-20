/**
 * The coach's bus (DESIGN 9.2): last event of each kind, every listener in
 * order, a failing listener harmless, and a snapshot that keeps its identity
 * until something changes, which is what `useSyncExternalStore` needs.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSnapshot,
  lastEvent,
  listenerCount,
  publish,
  resetCoachBus,
  subscribe,
  type CoachEvent,
} from "./bus";
import { useCoachEvent } from "./useCoachEvent";

const opened = (daysAway: number | null): CoachEvent => ({ type: "appOpened", at: 1, daysAway });
const jam = (): CoachEvent => ({ type: "jamStopped", at: 2 });

afterEach(() => resetCoachBus());

describe("the bus, with nobody listening", () => {
  it("keeps the last event of each kind, numbered in order", () => {
    publish(opened(3));
    publish(jam());
    publish(opened(0));
    expect(lastEvent("appOpened")).toMatchObject({ daysAway: 0, seq: 3 });
    expect(lastEvent("jamStopped")).toMatchObject({ seq: 2 });
    expect(lastEvent("takeResult")).toBeNull();
    expect(listenerCount()).toBe(0);
  });

  it("builds no snapshot until one is read, and the same one until the next publish", () => {
    publish(opened(1));
    const first = getSnapshot();
    expect(getSnapshot()).toBe(first);
    expect(first.seq).toBe(1);
    expect(first.last.appOpened?.daysAway).toBe(1);
    publish(jam());
    const second = getSnapshot();
    expect(second).not.toBe(first);
    expect(second.seq).toBe(2);
    // The old snapshot is not changed under whoever still holds it.
    expect(first.last.jamStopped).toBeUndefined();
  });
});

describe("listeners", () => {
  it("hears every event, synchronously and in order, until it leaves", () => {
    const heard: string[] = [];
    const off = subscribe((event) => heard.push(`${event.type}#${String(event.seq)}`));
    publish(opened(1));
    publish(jam());
    off();
    publish(opened(2));
    expect(heard).toEqual(["appOpened#1", "jamStopped#2"]);
    expect(listenerCount()).toBe(0);
  });

  it("a listener that throws does not stop the others, or the publisher", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const after = vi.fn();
    subscribe(() => {
      throw new Error("broken surface");
    });
    subscribe(after);
    expect(() => publish(jam())).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("useCoachEvent", () => {
  it("re-renders for its own kind and not for the others", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useCoachEvent("appOpened");
    });
    expect(result.current).toBeNull();
    const before = renders;

    act(() => publish(jam()));
    expect(renders).toBe(before);

    act(() => publish(opened(4)));
    expect(result.current?.daysAway).toBe(4);
    expect(renders).toBe(before + 1);
  });

  it("hears two events in one commit as the later one, and the listener hears both", () => {
    // What a surface DRAWS is the latest; what a listener COUNTS is every one.
    const counted: number[] = [];
    subscribe((event) => {
      if (event.type === "appOpened") counted.push(event.daysAway ?? -1);
    });
    const { result } = renderHook(() => useCoachEvent("appOpened"));
    act(() => {
      publish(opened(5));
      publish(opened(6));
    });
    expect(result.current?.daysAway).toBe(6);
    expect(counted).toEqual([5, 6]);
  });
});
