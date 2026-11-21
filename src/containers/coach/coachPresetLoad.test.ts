/**
 * The coach's preset load past the gate (review t1b1 N2): "Loaded" is heard
 * only after the preset was applied, and a failure the app can see is never
 * heard as Loaded.
 */
import { describe, expect, it, vi } from "vitest";
import type { Preset } from "../../types";
import { loadPresetAfterReRead } from "./coachPresetLoad";

const PRESET = { id: "p1", name: "Warm up 80" } as unknown as Preset;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

describe("the coach's preset load", () => {
  it("says applied only once the preset has been applied, not when the re-read found it", async () => {
    const applying = deferred<boolean>();
    const applied = vi.fn();
    const apply = vi.fn(() => applying.promise);
    const done = loadPresetAfterReRead("p1", async () => [PRESET], apply, applied);
    await vi.waitFor(() => expect(apply).toHaveBeenCalledWith(PRESET));
    expect(applied).not.toHaveBeenCalled();
    applying.resolve(true);
    await done;
    expect(applied.mock.calls).toEqual([[true]]);
  });

  it("a step that failed is a failure, never Loaded", async () => {
    const applied = vi.fn();
    await loadPresetAfterReRead("p1", async () => [PRESET], async () => false, applied);
    expect(applied.mock.calls).toEqual([["failed"]]);
  });

  it("applying that throws is a failure, heard once", async () => {
    const applied = vi.fn();
    await loadPresetAfterReRead("p1", async () => [PRESET], () => Promise.reject(new Error("ipc")), applied);
    expect(applied.mock.calls).toEqual([["failed"]]);
  });

  it("a preset gone since, or a store that cannot be read: nothing applied, said so", async () => {
    const apply = vi.fn(async () => true);
    const gone = vi.fn();
    await loadPresetAfterReRead("p1", async () => [], apply, gone);
    const unreadable = vi.fn();
    await loadPresetAfterReRead("p1", () => Promise.reject(new Error("store")), apply, unreadable);
    expect(apply).not.toHaveBeenCalled();
    expect(gone.mock.calls).toEqual([[false]]);
    expect(unreadable.mock.calls).toEqual([[false]]);
  });
});
