/**
 * `coachGenerate` — the kind travels to Rust, and the timeout follows it.
 *
 * One 3 s cap used to apply to every call. That number comes from the
 * plan's C4 policy, which is written about the *tip* path ("the user
 * never waits for the model"); applied to a session summary or a chat
 * answer it just meant those never arrived on a CPU backend, where 256
 * tokens cannot be produced in three seconds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COACH_GENERATE_TIMEOUT_MS, coachGenerate } from "./ipc";
import { mockInvoke, setInvokeResponse } from "./test/mocks";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("coachGenerate", () => {
  it("sends the kind to Rust alongside the context", async () => {
    setInvokeResponse("coach_generate", () => "Nice and steady.");
    await expect(coachGenerate("report", "Score: 74")).resolves.toBe(
      "Nice and steady.",
    );
    expect(mockInvoke).toHaveBeenCalledWith("coach_generate", {
      kind: "report",
      context: "Score: 74",
    });
  });

  it("gives a tip the mid-session budget and a chat answer far more", () => {
    // AGENTS.md latency tiers: a tip must not delay the next thing the
    // player hears; a chat answer is something they are waiting for.
    expect(COACH_GENERATE_TIMEOUT_MS.tip).toBe(3_000);
    expect(COACH_GENERATE_TIMEOUT_MS.drill).toBe(3_000);
    expect(COACH_GENERATE_TIMEOUT_MS.greeting).toBe(3_000);
    expect(COACH_GENERATE_TIMEOUT_MS.report).toBeGreaterThan(
      COACH_GENERATE_TIMEOUT_MS.tip,
    );
    expect(COACH_GENERATE_TIMEOUT_MS.summary).toBeGreaterThan(
      COACH_GENERATE_TIMEOUT_MS.report,
    );
    expect(COACH_GENERATE_TIMEOUT_MS.chat).toBe(
      COACH_GENERATE_TIMEOUT_MS.summary,
    );
  });

  it("times a tip out at its own budget", async () => {
    setInvokeResponse("coach_generate", () => new Promise<string>(() => {}));
    const call = coachGenerate("tip", "Rephrase this.");
    const settled = vi.fn();
    call.catch(settled);

    await vi.advanceTimersByTimeAsync(COACH_GENERATE_TIMEOUT_MS.tip - 1);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2);
    expect(settled).toHaveBeenCalledWith(
      expect.objectContaining({ message: "coach_generate_timeout" }),
    );
  });

  it("lets a summary run well past the tip budget", async () => {
    let release!: (v: string) => void;
    setInvokeResponse(
      "coach_generate",
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    const call = coachGenerate("summary", "ended their practice session");
    const rejected = vi.fn();
    call.catch(rejected);

    // Four seconds in — under the old single 3 s cap this had already
    // failed and the user got "Session complete." forever.
    await vi.advanceTimersByTimeAsync(4_000);
    expect(rejected).not.toHaveBeenCalled();

    release("Locked in — 88% accuracy.");
    await expect(call).resolves.toBe("Locked in — 88% accuracy.");
  });

  it("clears its timer once the call settles", async () => {
    setInvokeResponse("coach_generate", () => "done");
    await coachGenerate("chat", "User asks: hi");
    // A 15 s timer left armed would keep the fake clock (and, in the app,
    // the event loop) busy long after the answer arrived.
    expect(vi.getTimerCount()).toBe(0);
  });
});
