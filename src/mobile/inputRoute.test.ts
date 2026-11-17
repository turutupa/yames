/**
 * The input after a route change (M7, review): restarted on the same device
 * when it is still there, moved to the one Android routes to when it is not,
 * and said either way.
 */
import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useInputRoute } from "./inputRoute";
import { mockListen, setInvokeResponse } from "../test/mocks";

function routeListener() {
  const call = [...mockListen.mock.calls].reverse().find(([event]) => event === "audio-route-changed");
  expect(call, "nothing listens for audio-route-changed").toBeDefined();
  return call![1] as (e: { payload: { kind: "input" | "output" } }) => void;
}

function evaluation(selected: string) {
  return {
    enabled: true,
    selectedDevice: selected,
    setListening: vi.fn(async () => {}),
    selectDevice: vi.fn(async () => {}),
  };
}

const DEVICES = [
  { name: "Pixel 8 (built-in mic)", isDefault: false, isInterface: false, channels: 1 },
  { name: "iRig HD 2 (USB)", isDefault: true, isInterface: true, channels: 1 },
];

describe("the input after a route change", () => {
  it("restarts on the same device when it is still there", async () => {
    setInvokeResponse("list_audio_input_devices", () => DEVICES);
    const ev = evaluation("Pixel 8 (built-in mic)");
    const { result } = renderHook(() => useInputRoute(ev));
    await act(async () => routeListener()({ payload: { kind: "input" } }));
    await waitFor(() => expect(result.current.changedTo).toBe("Pixel 8 (built-in mic)"));
    expect(ev.setListening).toHaveBeenNthCalledWith(1, false);
    expect(ev.setListening).toHaveBeenNthCalledWith(2, true);
    expect(ev.selectDevice).not.toHaveBeenCalled();
  });

  it("moves to the device Android routes to when the old one is gone", async () => {
    setInvokeResponse("list_audio_input_devices", () => DEVICES);
    const ev = evaluation("Scarlett 2i2 (USB)");
    const { result } = renderHook(() => useInputRoute(ev));
    await act(async () => routeListener()({ payload: { kind: "input" } }));
    await waitFor(() => expect(result.current.changedTo).toBe("iRig HD 2 (USB)"));
    expect(ev.selectDevice).toHaveBeenCalledWith("iRig HD 2 (USB)");
  });

  it("leaves a closed input alone, and ignores the output", async () => {
    setInvokeResponse("list_audio_input_devices", () => DEVICES);
    const ev = { ...evaluation("Pixel 8 (built-in mic)"), enabled: false };
    const { result } = renderHook(() => useInputRoute(ev));
    await act(async () => routeListener()({ payload: { kind: "input" } }));
    await act(async () => routeListener()({ payload: { kind: "output" } }));
    expect(ev.setListening).not.toHaveBeenCalled();
    expect(result.current.changedTo).toBeNull();
  });
});
