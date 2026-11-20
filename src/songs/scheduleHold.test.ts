import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetScheduleHoldForTests, holdSchedule, onScheduleFree, scheduleHeld, whenScheduleFree } from "./scheduleHold";

beforeEach(() => __resetScheduleHoldForTests());

describe("scheduleHold", () => {
  it("is free when the last hold goes, once, however often a release is called", () => {
    const freed = vi.fn();
    onScheduleFree(freed);
    const a = holdSchedule();
    const b = holdSchedule();
    a();
    a();
    expect(scheduleHeld()).toBe(true);
    expect(freed).not.toHaveBeenCalled();
    b();
    expect(scheduleHeld()).toBe(false);
    expect(freed).toHaveBeenCalledTimes(1);
  });

  it("whenScheduleFree waits for the hold (a Session's load behind a Songs stop)", async () => {
    await expect(whenScheduleFree()).resolves.toBeUndefined();
    const release = holdSchedule();
    let done = false;
    const wait = whenScheduleFree().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    release();
    await wait;
    expect(done).toBe(true);
  });
});
