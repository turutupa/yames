/**
 * The pair of outputs everything the app plays comes out of.
 *
 * Issue 52: a church drummer on a four-output interface puts his v-drums
 * into outputs 1-2 and needs the click on 3-4. The choice is remembered
 * against the device it was made for, so carrying the laptop between the
 * kitchen table and the church brings the right outputs back with each
 * device — that is what most of these tests are about.
 *
 * The backend is the authority on which pair is actually playing: a device
 * can advertise four outputs and deliver two, and only the open stream
 * knows. So the hook sends a choice, believes the answer, and listens for
 * `audio-output-pair-fallback` for the case where the answer arrives late,
 * after a reopen.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { storedPairFor, useAudioOutputDevices } from "./useAudioOutputDevices";
import type { AudioOutputDevice } from "../../../types";

const harness: {
  values: Record<string, unknown>;
  devices: AudioOutputDevice[];
  pairSent: number[];
  pairInEffect: (pair: number) => number;
  deviceSent: Array<string | null>;
  onDevicesChanged?: (devices: AudioOutputDevice[]) => void;
  onFallback?: (pair: number) => void;
} = {
  values: {},
  devices: [],
  pairSent: [],
  pairInEffect: (pair) => pair,
  deviceSent: [],
};

vi.mock("../../../ipc", () => ({
  storeLoad: async (key: string) => harness.values[key],
  listAudioOutputDevices: async () => harness.devices,
  setAudioOutputDevice: async (name: string | null) => {
    harness.deviceSent.push(name);
  },
  setAudioOutputPair: async (pair: number) => {
    harness.pairSent.push(pair);
    return harness.pairInEffect(pair);
  },
  onAudioDevicesChanged: async (cb: (d: AudioOutputDevice[]) => void) => {
    harness.onDevicesChanged = cb;
    return () => undefined;
  },
  onAudioOutputPairFallback: async (cb: (pair: number) => void) => {
    harness.onFallback = cb;
    return () => undefined;
  },
}));

const device = (name: string, channels: number): AudioOutputDevice => ({
  name,
  isDefault: false,
  isBluetooth: false,
  channels,
});

const INTERFACE = device("UMC204HD 192k", 4);
const LAPTOP = device("Speakers (Realtek)", 2);

beforeEach(() => {
  harness.values = {};
  harness.devices = [INTERFACE, LAPTOP];
  harness.pairSent = [];
  harness.pairInEffect = (pair) => pair;
  harness.deviceSent = [];
  harness.onDevicesChanged = undefined;
  harness.onFallback = undefined;
});

describe("storedPairFor", () => {
  it("answers 0 for a device nobody has chosen a pair for", () => {
    expect(storedPairFor({ "UMC204HD 192k": 1 }, "Speakers (Realtek)")).toBe(0);
    expect(storedPairFor(undefined, "anything")).toBe(0);
    expect(storedPairFor(null, "anything")).toBe(0);
  });

  it("keeps a pair per device, with the system default under the empty name", () => {
    const pairs = { "": 0, "UMC204HD 192k": 1, "Scarlett 18i20": 2 };
    expect(storedPairFor(pairs, "UMC204HD 192k")).toBe(1);
    expect(storedPairFor(pairs, "Scarlett 18i20")).toBe(2);
    expect(storedPairFor(pairs, "")).toBe(0);
  });

  it("refuses nonsense from a hand-edited settings file", () => {
    expect(storedPairFor({ x: -1 } as never, "x")).toBe(0);
    expect(storedPairFor({ x: "3-4" } as never, "x")).toBe(0);
  });
});

describe("useAudioOutputDevices", () => {
  it("comes back on the pair the chosen device was last used on", async () => {
    harness.values = {
      audioOutputDevice: "UMC204HD 192k",
      audioOutputPairs: { "UMC204HD 192k": 1 },
    };
    const { result } = renderHook(() => useAudioOutputDevices());
    await waitFor(() => expect(result.current.selectedOutputDevice).toBe("UMC204HD 192k"));
    expect(result.current.outputPair).toBe(1);
  });

  it("starts on outputs 1-2 when nobody has ever chosen", async () => {
    const { result } = renderHook(() => useAudioOutputDevices());
    await waitFor(() => expect(result.current.audioOutputDevices).toHaveLength(2));
    expect(result.current.outputPair).toBe(0);
  });

  it("sends a new pair and believes the answer", async () => {
    const { result } = renderHook(() => useAudioOutputDevices());
    await waitFor(() => expect(result.current.audioOutputDevices).toHaveLength(2));

    await act(async () => {
      result.current.selectOutputPair(1);
    });
    expect(harness.pairSent).toEqual([1]);
    await waitFor(() => expect(result.current.outputPair).toBe(1));
    expect(result.current.outputPairFellBack).toBe(false);
  });

  it("says so when the device could not give the outputs that were asked for", async () => {
    // The device advertised four outputs and delivered two.
    harness.pairInEffect = () => 0;
    const { result } = renderHook(() => useAudioOutputDevices());
    await waitFor(() => expect(result.current.audioOutputDevices).toHaveLength(2));

    await act(async () => {
      result.current.selectOutputPair(1);
    });
    await waitFor(() => expect(result.current.outputPairFellBack).toBe(true));
    expect(result.current.outputPair).toBe(0);
  });

  it("follows the engine when the fallback arrives late, after a reopen", async () => {
    const { result } = renderHook(() => useAudioOutputDevices());
    await waitFor(() => expect(harness.onFallback).toBeDefined());

    await act(async () => {
      result.current.selectOutputPair(1);
    });
    await waitFor(() => expect(result.current.outputPair).toBe(1));

    // The stream reopened, and this is what it actually got.
    await act(async () => {
      harness.onFallback?.(0);
    });
    expect(result.current.outputPair).toBe(0);
    expect(result.current.outputPairFellBack).toBe(true);
  });

  it("brings each device's own pair back when the device changes", async () => {
    const { result } = renderHook(() => useAudioOutputDevices());
    await waitFor(() => expect(result.current.audioOutputDevices).toHaveLength(2));

    await act(async () => {
      result.current.selectOutputDevice("UMC204HD 192k");
    });
    await act(async () => {
      result.current.selectOutputPair(1);
    });
    await waitFor(() => expect(result.current.outputPair).toBe(1));

    // Back to the laptop: two outputs, and its own pair.
    await act(async () => {
      result.current.selectOutputDevice("Speakers (Realtek)");
    });
    expect(result.current.outputPair).toBe(0);

    // ...and the interface still remembers.
    await act(async () => {
      result.current.selectOutputDevice("UMC204HD 192k");
    });
    expect(result.current.outputPair).toBe(1);
  });

  it("goes back to outputs 1-2 when the interface is unplugged", async () => {
    harness.values = {
      audioOutputDevice: "UMC204HD 192k",
      audioOutputPairs: { "UMC204HD 192k": 1 },
    };
    const { result } = renderHook(() => useAudioOutputDevices());
    await waitFor(() => expect(result.current.outputPair).toBe(1));
    await waitFor(() => expect(harness.onDevicesChanged).toBeDefined());

    await act(async () => {
      harness.onDevicesChanged?.([LAPTOP]);
    });

    expect(result.current.selectedOutputDevice).toBe("");
    expect(harness.deviceSent).toContain(null);
    expect(result.current.outputPair).toBe(0);
    expect(result.current.outputPairFellBack).toBe(false);
  });
});
