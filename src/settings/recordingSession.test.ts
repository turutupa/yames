import { describe, expect, it, vi } from "vitest";

vi.mock("../ipc", () => ({
  captureStart: vi.fn(async () => ({ status: { active: true, session: "s", dir: "/d", takes: 0, bytes: 0, warnBytes: 1, capBytes: 2, warn: false, stopped: false }, chirp: {} })),
  captureEnd: vi.fn(async () => "/d"),
  captureStatus: vi.fn(async () => ({ active: false, session: null, dir: null, takes: 0, bytes: 0, warnBytes: 1, capBytes: 2, warn: false, stopped: false })),
  captureSetContext: vi.fn(async () => {}),
  captureMark: vi.fn(async () => ({})),
  captureFreeBegin: vi.fn(async () => {}),
  captureFreeEnd: vi.fn(async () => {}),
  captureReveal: vi.fn(async () => "/d"),
  captureZip: vi.fn(async () => "/d.zip"),
  getCalibrationOffset: vi.fn(async () => 12),
  getState: vi.fn(async () => ({ bpm: 100 })),
  listAudioInputDevices: vi.fn(async () => []),
  listAudioOutputDevices: vi.fn(async () => []),
  listCalibrationCache: vi.fn(async () => []),
}));

import * as ipc from "../ipc";
import {
  captureNow,
  clampCapGb,
  formatBytes,
  markFeltOff,
  setRecordingSession,
  setTakeContext,
  settingsSnapshot,
  storeCapGb,
  storedCapGb,
} from "./recordingSession";
import { isMarkKey } from "../containers/main-window/RecordingPill";

// happy-dom here gives no localStorage: a small one of our own.
const backing = new Map<string, string>();
const fake: Storage = {
  get length() {
    return backing.size;
  },
  key: (i) => [...backing.keys()][i] ?? null,
  getItem: (k) => backing.get(k) ?? null,
  setItem: (k, v) => void backing.set(k, String(v)),
  removeItem: (k) => void backing.delete(k),
  clear: () => backing.clear(),
};
Object.defineProperty(window, "localStorage", { value: fake, configurable: true });

describe("recording session", () => {
  it("keeps the cap within bounds and remembers it", () => {
    expect(clampCapGb(0)).toBe(1);
    expect(clampCapGb(1e9)).toBe(200);
    expect(clampCapGb(Number.NaN)).toBe(10);
    expect(storeCapGb(25)).toBe(25);
    expect(storedCapGb()).toBe(25);
  });

  it("says nothing to the engine about a Take, and marks nothing, until a session is on", async () => {
    setTakeContext({ kind: "take", mode: "graded" });
    expect(ipc.captureSetContext).not.toHaveBeenCalled();
    expect(await markFeltOff()).toBe(false);
    const s = await setRecordingSession(true);
    expect(s.active).toBe(true);
    expect(captureNow().active).toBe(true);
    const meta = vi.mocked(ipc.captureStart).mock.calls[0]![0] as { latency: { offsetMs: number } };
    expect(meta.latency.offsetMs).toBe(12);
    setTakeContext({ kind: "take", mode: "ungraded", exerciseId: "x" });
    expect(ipc.captureSetContext).toHaveBeenCalledWith({ kind: "take", mode: "ungraded", exerciseId: "x" });
    expect(await markFeltOff()).toBe(true);
    await setRecordingSession(false);
    expect(ipc.captureEnd).toHaveBeenCalled();
    expect(captureNow().active).toBe(false);
  });

  it("snapshots only the app's own settings, cut short", () => {
    fake.setItem("yames.a", "1");
    fake.setItem("yames.long", "x".repeat(3000));
    fake.setItem("other", "no");
    const snap = settingsSnapshot();
    expect(snap["yames.a"]).toBe("1");
    expect(snap["other"]).toBeUndefined();
    expect(snap["yames.long"]!.length).toBe(2001);
  });

  it("reads sizes", () => {
    expect(formatBytes(340 * 1024 ** 2)).toBe("340 MB");
    expect(formatBytes(1.25 * 1024 ** 3)).toBe("1.3 GB");
  });

  it("takes M alone as the mark, never typed into a field", () => {
    const key = (init: KeyboardEventInit, target?: EventTarget) => {
      const e = new KeyboardEvent("keydown", init);
      if (target) Object.defineProperty(e, "target", { value: target });
      return e;
    };
    expect(isMarkKey(key({ key: "m" }))).toBe(true);
    expect(isMarkKey(key({ key: "M" }))).toBe(true);
    expect(isMarkKey(key({ key: "m", ctrlKey: true }))).toBe(false);
    expect(isMarkKey(key({ key: "m", repeat: true }))).toBe(false);
    expect(isMarkKey(key({ key: "n" }))).toBe(false);
    expect(isMarkKey(key({ key: "m" }, document.createElement("input")))).toBe(false);
  });
});
