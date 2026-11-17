/**
 * The phone asks for the microphone at the moment the input is first opened
 * (M7), and every caller — the first-run input step, a Session, Settings'
 * test — opens it through `startEvaluation`.
 */
import "../test/mobileFlag"; // MUST be first — see the file.

import { describe, it, expect, vi } from "vitest";
import { MIC_PERMISSION_DENIED, MIC_PERMISSION_TIMEOUT_MS, MIC_PERMISSION_UNANSWERED, startEvaluation } from "../ipc";
import { mockInvoke, setInvokeResponse } from "../test/mocks";

const calls = () => mockInvoke.mock.calls.map(([cmd]) => cmd);

describe("the microphone on a phone", () => {
  it("is asked for before the input opens", async () => {
    mockInvoke.mockClear();
    await startEvaluation("Pixel 8 (built-in mic)", 0);
    const order = calls();
    expect(order.indexOf("plugin:yames-mobile|request_microphone")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("plugin:yames-mobile|request_microphone")).toBeLessThan(
      order.indexOf("start_evaluation"),
    );
  });

  it("refused, never opens the input, and says where to allow it", async () => {
    mockInvoke.mockClear();
    setInvokeResponse("plugin:yames-mobile|request_microphone", () => false);
    await expect(startEvaluation()).rejects.toThrow(MIC_PERMISSION_DENIED);
    expect(calls()).not.toContain("start_evaluation");
  });

  it("unanswered, gives up after a minute as refused, and says so", async () => {
    vi.useFakeTimers();
    try {
      mockInvoke.mockClear();
      setInvokeResponse("plugin:yames-mobile|request_microphone", () => new Promise<boolean>(() => {}));
      const started = startEvaluation();
      const outcome = expect(started).rejects.toThrow(MIC_PERMISSION_UNANSWERED);
      await vi.advanceTimersByTimeAsync(MIC_PERMISSION_TIMEOUT_MS);
      await outcome;
      expect(calls()).not.toContain("start_evaluation");
    } finally {
      vi.useRealTimers();
    }
  });
});
