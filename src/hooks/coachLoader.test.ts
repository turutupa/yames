/**
 * When the brain is in memory — the policy, not the plumbing.
 *
 * The rules being pinned here are the ones that went wrong before T04c:
 * two callers racing a load and destroying a working worker, a model that
 * was resident from launch whether or not anyone practised, and one that
 * stayed resident for the rest of the process once it was.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COACH_IDLE_UNLOAD_MS,
  __resetCoachLoaderForTests,
  cancelCoachIdleUnload,
  coachLoadPending,
  coachResident,
  ensureCoachLoaded,
  scheduleCoachIdleUnload,
  unloadCoach,
} from "./coachLoader";
import { mockInvoke, setInvokeResponse } from "../test/mocks";

const calls = (command: string) =>
  mockInvoke.mock.calls.filter(([cmd]) => cmd === command);

beforeEach(() => {
  __resetCoachLoaderForTests();
  vi.useFakeTimers();
});

afterEach(() => {
  cancelCoachIdleUnload();
  vi.useRealTimers();
});

describe("ensureCoachLoaded", () => {
  it("loads once and remembers the answer", async () => {
    setInvokeResponse("load_coach_model", () => true);

    expect(await ensureCoachLoaded()).toBe(true);
    expect(coachResident()).toBe(true);
    expect(calls("load_coach_model")).toHaveLength(1);

    // A second session start must not pay for a second load — and, more
    // importantly, must not reach a Rust `load_model` that once dropped
    // the resident worker before spawning its replacement.
    expect(await ensureCoachLoaded()).toBe(true);
    expect(calls("load_coach_model")).toHaveLength(1);
  });

  it("coalesces concurrent callers onto one IPC call", async () => {
    let release!: (v: boolean) => void;
    setInvokeResponse(
      "load_coach_model",
      () => new Promise<boolean>((resolve) => (release = resolve)),
    );

    const a = ensureCoachLoaded();
    const b = ensureCoachLoaded();
    expect(coachLoadPending()).toBe(true);
    expect(calls("load_coach_model")).toHaveLength(1);

    release(true);
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(coachLoadPending()).toBe(false);
  });

  it("treats a refusal as 'no brain', not an error", async () => {
    // `load_model` returns Ok(false) for missing weights, a legacy family,
    // or a build with no LLM. The session carries on with templates.
    setInvokeResponse("load_coach_model", () => false);
    expect(await ensureCoachLoaded()).toBe(false);
    expect(coachResident()).toBe(false);
  });

  it("swallows a rejected load", async () => {
    setInvokeResponse("load_coach_model", () => {
      throw new Error("boom");
    });
    await expect(ensureCoachLoaded()).resolves.toBe(false);
    expect(coachResident()).toBe(false);
  });

  it("retries after a failed load rather than caching the failure", async () => {
    setInvokeResponse("load_coach_model", () => false);
    expect(await ensureCoachLoaded()).toBe(false);
    setInvokeResponse("load_coach_model", () => true);
    expect(await ensureCoachLoaded()).toBe(true);
    expect(calls("load_coach_model")).toHaveLength(2);
  });
});

describe("unloadCoach", () => {
  it("drops the worker and forgets residency", async () => {
    setInvokeResponse("load_coach_model", () => true);
    await ensureCoachLoaded();

    await unloadCoach();
    expect(calls("unload_coach_model")).toHaveLength(1);
    expect(coachResident()).toBe(false);

    // …and the next session loads again.
    await ensureCoachLoaded();
    expect(calls("load_coach_model")).toHaveLength(2);
  });

  it("still forgets residency when the backend call fails", async () => {
    setInvokeResponse("load_coach_model", () => true);
    await ensureCoachLoaded();
    setInvokeResponse("unload_coach_model", () => {
      throw new Error("nothing to unload");
    });
    await expect(unloadCoach()).resolves.toBeUndefined();
    expect(coachResident()).toBe(false);
  });
});

describe("idle unload", () => {
  it("drops the worker after the idle window with no session", async () => {
    setInvokeResponse("load_coach_model", () => true);
    await ensureCoachLoaded();

    scheduleCoachIdleUnload();
    // Nothing happens a minute in — a break between two songs is not the
    // end of a practice session.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls("unload_coach_model")).toHaveLength(0);
    expect(coachResident()).toBe(true);

    await vi.advanceTimersByTimeAsync(COACH_IDLE_UNLOAD_MS);
    expect(calls("unload_coach_model")).toHaveLength(1);
    expect(coachResident()).toBe(false);
  });

  it("is cancelled by the next session start", async () => {
    setInvokeResponse("load_coach_model", () => true);
    await ensureCoachLoaded();
    scheduleCoachIdleUnload();

    await vi.advanceTimersByTimeAsync(COACH_IDLE_UNLOAD_MS / 2);
    await ensureCoachLoaded();
    await vi.advanceTimersByTimeAsync(COACH_IDLE_UNLOAD_MS);

    expect(calls("unload_coach_model")).toHaveLength(0);
    expect(coachResident()).toBe(true);
  });

  it("arms nothing when no model is resident", async () => {
    scheduleCoachIdleUnload();
    await vi.advanceTimersByTimeAsync(COACH_IDLE_UNLOAD_MS * 2);
    expect(calls("unload_coach_model")).toHaveLength(0);
  });

  it("re-arms rather than stacking timers across repeated session ends", async () => {
    setInvokeResponse("load_coach_model", () => true);
    await ensureCoachLoaded();
    scheduleCoachIdleUnload();
    scheduleCoachIdleUnload();
    scheduleCoachIdleUnload();
    await vi.advanceTimersByTimeAsync(COACH_IDLE_UNLOAD_MS);
    expect(calls("unload_coach_model")).toHaveLength(1);
  });
});
