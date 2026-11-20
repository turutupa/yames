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
import {
  COACH_ASK_TIMEOUT_MS,
  COACH_GENERATE_TIMEOUT_MS,
  cancelGeneration,
  coachAsk,
  coachGenerate,
  newGenerationId,
  type CoachAskRequest,
} from "./ipc.desktop";
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

describe("coachAsk", () => {
  const request = (generationId: number): CoachAskRequest => ({
    generationId,
    mode: "choice",
    prefix: "Tools: open_step",
    context: "Screen: Today",
    question: "where was I?",
    grammar: 'root ::= "{}"',
  });

  it("sends the whole turn to its own command", async () => {
    setInvokeResponse("coach_ask", () => ({
      status: "answered",
      text: "{}",
      finished: true,
      prefixCached: true,
      promptMs: 40,
      totalMs: 90,
    }));
    await expect(coachAsk(request(7))).resolves.toMatchObject({
      status: "answered",
      prefixCached: true,
    });
    expect(mockInvoke).toHaveBeenCalledWith("coach_ask", { request: request(7) });
  });

  it("sends a missing grammar as null, and passes noModel through", async () => {
    setInvokeResponse("coach_ask", () => ({ status: "noModel" }));
    const prose: CoachAskRequest = {
      generationId: 8,
      mode: "prose",
      prefix: "p",
      context: "",
      question: "how do I relax?",
    };
    await expect(coachAsk(prose)).resolves.toEqual({ status: "noModel" });
    expect(mockInvoke).toHaveBeenCalledWith("coach_ask", {
      request: { ...prose, grammar: null },
    });
  });

  it("cancels the turn in Rust when it runs past 8 s", async () => {
    setInvokeResponse("coach_ask", () => new Promise(() => {}));
    setInvokeResponse("cancel_generation", () => true);
    const call = coachAsk(request(9));
    const settled = vi.fn();
    call.catch(settled);

    await vi.advanceTimersByTimeAsync(COACH_ASK_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalledWith("cancel_generation", expect.anything());

    await vi.advanceTimersByTimeAsync(2);
    expect(settled).toHaveBeenCalledWith(
      expect.objectContaining({ message: "coach_ask_timeout" }),
    );
    expect(mockInvoke).toHaveBeenCalledWith("cancel_generation", { generationId: 9 });
  });

  it("cancels by id, and hands out ids that never repeat", async () => {
    setInvokeResponse("cancel_generation", () => true);
    await expect(cancelGeneration(42)).resolves.toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("cancel_generation", { generationId: 42 });
    const a = newGenerationId();
    const b = newGenerationId();
    expect(b).toBeGreaterThan(a);
    expect(Number.isSafeInteger(b)).toBe(true);
  });
});
