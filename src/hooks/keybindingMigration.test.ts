// The navigation keys: all nine rail entries on ⌘1–⌘9 in rail order since
// 2026-11-18 (owner; ⌥+digit belongs to tiling window managers). A player on
// either older layout's defaults moves over, once; one who remapped any of them
// keeps what they chose.
import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HOTKEYS, actionForCombo, eventToCombo } from "../hotkeys";
import { installSettings } from "../test/parity/store";
import {
  CAMERA_DEFAULTS_V3,
  KEYMAP_VERSION,
  KEYMAP_VERSION_KEY,
  NAV_DEFAULTS_V2,
  OLD_NAV_DEFAULTS,
  migrateNavKeys,
} from "./keybindingMigration";
import { useKeybindings } from "./useKeybindings";

const NEW = Object.fromEntries(HOTKEYS.map((h) => [h.id, h.key]));
const OLD = { ...NEW, ...OLD_NAV_DEFAULTS };
const V2 = { ...NEW, ...NAV_DEFAULTS_V2 };
const V3 = { ...NEW, ...CAMERA_DEFAULTS_V3 };

describe("the new defaults", () => {
  it("are ⌘1–⌘9 in rail order: the learning side, then the tools; Settings stays ⌘,", () => {
    expect(["tab-today", "tab-paths", "tab-progress", "tab-tools"].map((id) => NEW[id])).toEqual(["⌘1", "⌘2", "⌘3", "⌘4"]);
    expect(["tab-1", "tab-2", "tab-3", "tab-4", "tab-5"].map((id) => NEW[id])).toEqual(["⌘5", "⌘6", "⌘7", "⌘8", "⌘9"]);
    expect(Object.values(NEW).some((k) => k.startsWith("⌥") && /\d$/.test(k))).toBe(false);
    expect(NEW.settings).toBe("⌘,");
  });

  it("clash with nothing else in the table", () => {
    const keys = Object.values(NEW).filter(Boolean);
    for (const k of ["⌘1", "⌘2", "⌘3", "⌘4", "⌘5", "⌘6", "⌘7", "⌘8", "⌘9"]) {
      expect(keys.filter((x) => x === k), k).toHaveLength(1);
    }
  });

  it("a Ctrl/⌘+digit press opens the rail entry in that place", () => {
    const mod = navigator.platform.toUpperCase().includes("MAC") ? { metaKey: true } : { ctrlKey: true };
    const combo = eventToCombo(new KeyboardEvent("keydown", { key: "7", code: "Digit7", ...mod }));
    expect(actionForCombo(NEW, combo, "today")).toBe("tab-3");
  });
});

describe("migrateNavKeys", () => {
  it("moves a map still on the old defaults to the new ones", () => {
    expect(migrateNavKeys(OLD)).toEqual(NEW);
  });

  it("keeps every key the player chose, and moves the rest", () => {
    const stored = { ...OLD, "tab-3": "⌘D", "tab-paths": "⌘P" };
    const moved = migrateNavKeys(stored);
    expect(moved["tab-3"]).toBe("⌘D");
    expect(moved["tab-paths"]).toBe("⌘P");
    expect(moved["tab-today"]).toBe("⌘1");
    expect(moved["tab-1"]).toBe("⌘5");
    expect(moved["tab-progress"]).toBe("⌘3");
  });

  it("does not take a new default from another of the player's own bindings", () => {
    // They gave ⌘1 to the coach (which cleared the Metronome's): Today stays on ⌘0.
    const stored = { ...OLD, "toggle-coach": "⌘1", "tab-1": "" };
    const moved = migrateNavKeys(stored);
    expect(moved["toggle-coach"]).toBe("⌘1");
    expect(moved["tab-today"]).toBe("⌘0");
    expect(moved["tab-1"]).toBe("");
    expect(moved["tab-paths"]).toBe("⌘2");
  });

  it("moves a map on the 2026-11-17 layout (⌥1–⌥5) to ⌘5–⌘9, keeping the player's own keys", () => {
    expect(migrateNavKeys(V2, 2)).toEqual(NEW);
    const moved = migrateNavKeys({ ...V2, "tab-4": "⌘J" }, 2);
    expect(moved["tab-4"]).toBe("⌘J");
    expect(moved["tab-1"]).toBe("⌘5");
    expect(moved["tab-today"]).toBe("⌘1");
  });

  it("moves the camera off the coach's C to ⇧R for a map on layout 3, and from older layouts too", () => {
    expect(migrateNavKeys(V3, 3)).toEqual(NEW);
    expect(migrateNavKeys({ ...V2, ...CAMERA_DEFAULTS_V3 }, 2)).toEqual(NEW);
    expect(migrateNavKeys({ ...OLD, ...CAMERA_DEFAULTS_V3 }, 1)).toEqual(NEW);
    expect(NEW["toggle-coach"]).toBe("C");
  });

  it("keeps a camera key the player chose, and does not take ⇧R from their own binding", () => {
    const chosen = migrateNavKeys({ ...V3, "jam-camera": "J" }, 3);
    expect(chosen["jam-camera"]).toBe("J");
    expect(chosen["songs-camera"]).toBe("⇧R");
    const taken = migrateNavKeys({ ...V3, "toggle-sidebar": "⇧R" }, 3);
    expect(taken["jam-camera"]).toBe("C");
    expect(taken["songs-camera"]).toBe("C");
  });

  it("leaves a map on layout 4 alone", () => {
    expect(migrateNavKeys(V3, 4)).toBe(V3);
  });

  it("leaves a map already on the new defaults exactly as it is", () => {
    expect(migrateNavKeys(NEW)).toBe(NEW);
  });
});

describe("on launch", () => {
  async function mount(stored: Record<string, unknown>) {
    const store = await installSettings(stored);
    const hook = renderHook(() => useKeybindings());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    return { ...hook, store };
  }

  it("a player on the old defaults gets the new ones, saved, and marked", async () => {
    const { result, store } = await mount({ keyBindings: OLD });
    await waitFor(() => expect(result.current.keyBindings["tab-today"]).toBe("⌘1"));
    expect(result.current.keyBindings).toEqual(NEW);
    expect(store.values.get("keyBindings")).toEqual(NEW);
    expect(store.values.get(KEYMAP_VERSION_KEY)).toBe(KEYMAP_VERSION);
  });

  it("a player on layout 3 gets the camera on ⇧R, and C stays the coach's", async () => {
    const { result, store } = await mount({ keyBindings: V3, [KEYMAP_VERSION_KEY]: 3 });
    await waitFor(() => expect(result.current.keyBindings["jam-camera"]).toBe("⇧R"));
    expect(result.current.keyBindings).toEqual(NEW);
    await waitFor(() => expect(store.values.get(KEYMAP_VERSION_KEY)).toBe(KEYMAP_VERSION));
  });

  it("once: a player who put Today back on ⌘0 afterwards keeps it", async () => {
    const mine = { ...NEW, "tab-today": "⌘0", "tab-1": "⌘1" };
    const { result } = await mount({ keyBindings: mine, [KEYMAP_VERSION_KEY]: KEYMAP_VERSION });
    await waitFor(() => expect(result.current.keyBindings["tab-today"]).toBe("⌘0"));
    expect(result.current.keyBindings["tab-1"]).toBe("⌘1");
  });

  it("a first launch has the new defaults and is marked", async () => {
    const { result, store } = await mount({});
    expect(result.current.keyBindings).toEqual(NEW);
    await waitFor(() => expect(store.values.get(KEYMAP_VERSION_KEY)).toBe(KEYMAP_VERSION));
  });
});
