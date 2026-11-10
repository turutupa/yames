/**
 * P6: MIDI, on the frontend's side. 13 of 18 MID rows had no test.
 *
 * A pedal is the whole reason the actions exist: a press reaches the dispatcher,
 * learning a pedal stores what Rust needs, and taking a signal from another action
 * asks first. The Rust side is `src-tauri/tests/parity_midi.rs`.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { mockInvoke, setInvokeResponse } from "../test/mocks";
import { emitEvent } from "../test/parity/store";
import type { MidiActivity, MidiBinding, MidiDeviceInfo } from "../types";
import { useMidi } from "./useMidi";

const PEDAL: MidiDeviceInfo = { name: "FS-1", isConnected: false } as MidiDeviceInfo;
const SIGNAL: MidiActivity = { channel: 0, type: "cc", number: 64, value: 127 } as MidiActivity;
const BOUND: MidiBinding = { action: "play", channel: 0, msgType: "cc", number: 64 } as MidiBinding;

const calls = (command: string) => mockInvoke.mock.calls.filter(([c]) => c === command);

async function mount(dispatch = vi.fn(), autoAccept = false, suppress = false) {
  const hook = renderHook(
    ({ a, s }: { a: boolean; s: boolean }) => useMidi(dispatch, a, s),
    { initialProps: { a: autoAccept, s: suppress } },
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { ...hook, dispatch };
}

describe("a press", () => {
  it("reaches the dispatcher as the action it is bound to", async () => {
    const { dispatch } = await mount();
    act(() => emitEvent("midi-action", { action: "jam-next-groove" }));
    expect(dispatch).toHaveBeenCalledWith("jam-next-groove");
  });

  it("uses the dispatcher of the moment, not the first one", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const hook = renderHook(({ d }) => useMidi(d), { initialProps: { d: first } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    hook.rerender({ d: second });
    act(() => emitEvent("midi-action", { action: "play" }));
    expect(second).toHaveBeenCalledWith("play");
    expect(first).not.toHaveBeenCalled();
  });

  it("goes nowhere while the input tester has it", async () => {
    const { dispatch } = await mount(vi.fn(), false, true);
    act(() => emitEvent("midi-action", { action: "play" }));
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("devices", () => {
  it("lists them, and notices the one already connected", async () => {
    setInvokeResponse("list_midi_devices", () => [{ ...PEDAL, isConnected: true }]);
    const { result } = await mount();
    await waitFor(() => expect(result.current.connectedDevice).toBe("FS-1"));
    expect(result.current.devices).toHaveLength(1);
  });

  it("connects by name", async () => {
    setInvokeResponse("list_midi_devices", () => [PEDAL]);
    const { result } = await mount();
    await act(() => result.current.connect("FS-1"));
    expect(calls("connect_midi_device").at(-1)?.[1]).toEqual({ deviceName: "FS-1" });
    expect(result.current.connectedDevice).toBe("FS-1");
  });

  it("disconnects", async () => {
    const { result } = await mount();
    await act(() => result.current.connect("FS-1"));
    await act(() => result.current.disconnect());
    expect(calls("disconnect_midi_device")).toHaveLength(1);
    expect(result.current.connectedDevice).toBeNull();
  });

  it("follows a device arriving or leaving (MID-05)", async () => {
    const { result } = await mount();
    act(() => emitEvent("midi-devices-changed", [{ ...PEDAL, isConnected: true }]));
    expect(result.current.connectedDevice).toBe("FS-1");
    act(() => emitEvent("midi-devices-changed", []));
    expect(result.current.connectedDevice).toBeNull();
  });

  it("refreshes on request", async () => {
    const { result } = await mount();
    setInvokeResponse("list_midi_devices", () => [PEDAL]);
    await act(() => result.current.refreshDevices());
    expect(result.current.devices).toEqual([PEDAL]);
  });
});

describe("learning a pedal", () => {
  it("binds the next signal to the action being learned", async () => {
    setInvokeResponse("get_midi_bindings", () => []);
    const { result } = await mount();
    act(() => result.current.startLearn("tab-3"));
    expect(result.current.learnMode).toBe("tab-3");
    setInvokeResponse("get_midi_bindings", () => [{ ...BOUND, action: "tab-3" }]);
    await act(async () => {
      emitEvent("midi-activity", SIGNAL);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(calls("set_midi_binding").at(-1)?.[1]).toEqual({
      action: "tab-3",
      channel: 0,
      msgType: "cc",
      number: 64,
    });
    expect(result.current.learnMode).toBeNull();
    expect(result.current.bindings).toEqual([{ ...BOUND, action: "tab-3" }]);
  });

  it("does not bind anything when it is not learning", async () => {
    const { result } = await mount();
    act(() => emitEvent("midi-activity", SIGNAL));
    expect(result.current.lastActivity).toEqual(SIGNAL);
    expect(calls("set_midi_binding")).toEqual([]);
  });

  it("can be cancelled", async () => {
    const { result } = await mount();
    act(() => result.current.startLearn("play"));
    act(() => result.current.cancelLearn());
    act(() => emitEvent("midi-activity", SIGNAL));
    expect(calls("set_midi_binding")).toEqual([]);
  });

  it("asks before taking a signal from another action", async () => {
    setInvokeResponse("get_midi_bindings", () => [BOUND]);
    const { result } = await mount();
    await waitFor(() => expect(result.current.bindings).toEqual([BOUND]));
    act(() => result.current.startLearn("tab-3"));
    await act(async () => {
      emitEvent("midi-activity", SIGNAL);
    });
    expect(result.current.pendingConflict).toMatchObject({
      targetAction: "tab-3",
      existingBinding: BOUND,
    });
    expect(calls("set_midi_binding")).toEqual([]);
    await act(() => result.current.acceptConflict());
    expect(calls("set_midi_binding").at(-1)?.[1]).toMatchObject({ action: "tab-3", number: 64 });
    expect(result.current.pendingConflict).toBeNull();
  });

  it("leaves everything alone if the player says no", async () => {
    setInvokeResponse("get_midi_bindings", () => [BOUND]);
    const { result } = await mount();
    await waitFor(() => expect(result.current.bindings).toEqual([BOUND]));
    act(() => result.current.startLearn("tab-3"));
    await act(async () => {
      emitEvent("midi-activity", SIGNAL);
    });
    act(() => result.current.rejectConflict());
    expect(result.current.pendingConflict).toBeNull();
    expect(calls("set_midi_binding")).toEqual([]);
  });

  it("does not ask when the wizard says to take it", async () => {
    setInvokeResponse("get_midi_bindings", () => [BOUND]);
    const { result } = await mount(vi.fn(), true);
    await waitFor(() => expect(result.current.bindings).toEqual([BOUND]));
    act(() => result.current.startLearn("tab-3"));
    await act(async () => {
      emitEvent("midi-activity", SIGNAL);
    });
    expect(result.current.pendingConflict).toBeNull();
    expect(calls("set_midi_binding")).toHaveLength(1);
  });

  it("is free to rebind the same signal to the same action", async () => {
    setInvokeResponse("get_midi_bindings", () => [BOUND]);
    const { result } = await mount();
    await waitFor(() => expect(result.current.bindings).toEqual([BOUND]));
    act(() => result.current.startLearn("play"));
    await act(async () => {
      emitEvent("midi-activity", SIGNAL);
    });
    expect(result.current.pendingConflict).toBeNull();
    expect(calls("set_midi_binding")).toHaveLength(1);
  });

  it("removes a binding on its own", async () => {
    setInvokeResponse("get_midi_bindings", () => [BOUND]);
    const { result } = await mount();
    setInvokeResponse("get_midi_bindings", () => []);
    await act(() => result.current.removeBinding("play"));
    expect(calls("clear_midi_binding").at(-1)?.[1]).toEqual({ action: "play" });
    expect(result.current.bindings).toEqual([]);
  });
});
