/**
 * The input's starts, stops and restarts run one after another, and the last
 * on/off asked for is the one that holds (B1 and its review follow-up).
 */
import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { mockInvoke, setInvokeResponse } from "../test/mocks";
import { useEvaluation } from "./useEvaluation";

const inputCalls = () =>
  mockInvoke.mock.calls.map(([c]) => c).filter((c) => c === "start_evaluation" || c === "stop_evaluation");

describe("useEvaluation, in turn", () => {
  it("a restart finishing after a newer stop does not undo it, so a toggle then turns it on", async () => {
    setInvokeResponse("get_evaluation_state", () => false);
    const hook = renderHook(() => useEvaluation());
    await act(async () => {
      await hook.result.current.setListening(true);
    });
    await waitFor(() => expect(hook.result.current.enabled).toBe(true));

    // The restart's start hangs until released.
    let release: () => void = () => {};
    setInvokeResponse("start_evaluation", () => new Promise<void>((r) => (release = r)));
    let restarting: Promise<unknown> = Promise.resolve();
    let stopping: Promise<unknown> = Promise.resolve();
    await act(async () => {
      restarting = hook.result.current.selectChannel(1);
      await new Promise((r) => setTimeout(r, 10));
      stopping = hook.result.current.setListening(false);
    });
    // The queued stop hangs too, so the toggle below lands while it waits.
    let releaseStop: () => void = () => {};
    setInvokeResponse("stop_evaluation", () => new Promise<void>((r) => (releaseStop = r)));
    setInvokeResponse("start_evaluation", () => undefined);
    let toggled: Promise<unknown> = Promise.resolve();
    await act(async () => {
      release();
      await restarting;
      // The player asked for off last; a toggle now means on.
      toggled = hook.result.current.toggle();
    });
    setInvokeResponse("stop_evaluation", () => undefined);
    await act(async () => {
      releaseStop();
      await Promise.all([stopping, toggled]);
    });
    await waitFor(() => expect(hook.result.current.enabled).toBe(true));
    expect(inputCalls().slice(-2)).toEqual(["stop_evaluation", "start_evaluation"]);
  });

  it("a start asked for during a restart waits its turn rather than being dropped", async () => {
    setInvokeResponse("get_evaluation_state", () => false);
    const hook = renderHook(() => useEvaluation());
    await act(async () => {
      await Promise.all([hook.result.current.setListening(true), hook.result.current.setListening(false), hook.result.current.setListening(true)]);
    });
    await waitFor(() => expect(hook.result.current.enabled).toBe(true));
  });
});
