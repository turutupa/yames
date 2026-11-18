import { describe, expect, it, vi } from "vitest";
import { classifyInputError, startSessionInput } from "./inputStart";

const DEVICES = [
  { name: "Microphone (Realtek)", isDefault: true, isInterface: false, channels: 1 },
  { name: "2- Scarlett 2i2 USB", isDefault: false, isInterface: true, channels: 2 },
];

describe("startSessionInput", () => {
  it("opens the selected device", async () => {
    const setListening = vi.fn(async () => {});
    const got = await startSessionInput({ setListening, selectedDevice: "2- Scarlett 2i2 USB", devices: DEVICES });
    expect(got).toEqual({ device: "2- Scarlett 2i2 USB", fellBack: false });
    expect(setListening).toHaveBeenCalledWith(true);
  });

  it("a selected device that is gone (Windows renamed it): the default instead, this once", async () => {
    const setListening = vi.fn(async () => {});
    const got = await startSessionInput({ setListening, selectedDevice: "Scarlett 2i2 USB", devices: DEVICES });
    expect(got).toEqual({ device: null, fellBack: true });
    expect(setListening).toHaveBeenCalledWith(true, null);
  });

  it("'not found' from the engine also falls back", async () => {
    const setListening = vi.fn(async (_on: true, device?: string | null) => {
      if (device === undefined) throw "Audio device 'X' not found";
    });
    const got = await startSessionInput({ setListening, selectedDevice: "X", devices: [] });
    expect(got.fellBack).toBe(true);
  });

  it("any other refusal is passed on", async () => {
    const setListening = vi.fn(async () => {
      throw new Error("access denied");
    });
    await expect(startSessionInput({ setListening, selectedDevice: undefined, devices: DEVICES })).rejects.toThrow(
      "access denied",
    );
  });

  it("no answer in time is a timeout the screen can name", async () => {
    const setListening = vi.fn(() => new Promise<void>(() => {}));
    const err = await startSessionInput({ setListening, selectedDevice: undefined, devices: DEVICES, timeoutMs: 5 }).catch(
      (e: unknown) => e,
    );
    expect(classifyInputError(err)).toBe("noAnswer");
  });
});

describe("classifyInputError", () => {
  it("names the usual refusals", () => {
    expect(classifyInputError("No default input device found")).toBe("noDevice");
    expect(classifyInputError(new Error("Permission denied by the user"))).toBe("permission");
    expect(classifyInputError("The device is in use by another application")).toBe("busy");
    expect(classifyInputError("something odd")).toBe("other");
  });
});
