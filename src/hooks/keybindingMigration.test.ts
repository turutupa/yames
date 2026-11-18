// The navigation keys moved on 2026-11-17 (owner): Today, Paths, Progress and
// Tools on ⌘1–⌘4, the tools on ⌥1–⌥5. A player on the old defaults moves
// over, once; one who remapped any of them keeps what they chose.
import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HOTKEYS, actionForCombo, eventToCombo } from "../hotkeys";
import { installSettings } from "../test/parity/store";
import { KEYMAP_VERSION, KEYMAP_VERSION_KEY, OLD_NAV_DEFAULTS, migrateNavKeys } from "./keybindingMigration";
import { useKeybindings } from "./useKeybindings";

const NEW = Object.fromEntries(HOTKEYS.map((h) => [h.id, h.key]));
const OLD = { ...NEW, ...OLD_NAV_DEFAULTS };

describe("the new defaults", () => {
  it("are ⌘1–⌘4 for the learning side and ⌥1–⌥5 for the tools; Settings stays ⌘,", () => {
    expect(["tab-today", "tab-paths", "tab-progress", "tab-tools"].map((id) => NEW[id])).toEqual(["⌘1", "⌘2", "⌘3", "⌘4"]);
    expect(["tab-1", "tab-2", "tab-3", "tab-4", "tab-5"].map((id) => NEW[id])).toEqual(["⌥1", "⌥2", "⌥3", "⌥4", "⌥5"]);
    expect(NEW.settings).toBe("⌘,");
  });

  it("clash with nothing else in the table", () => {
    const keys = Object.values(NEW).filter(Boolean);
    for (const k of ["⌘1", "⌘2", "⌘3", "⌘4", "⌥1", "⌥2", "⌥3", "⌥4", "⌥5"]) {
      expect(keys.filter((x) => x === k), k).toHaveLength(1);
    }
  });

  it("an Alt/Option+digit press is read by its key, whatever character the layout makes", () => {
    // Option+1..5 on a Mac types ¡ ™ £ ¢ ∞; the physical digit is what counts.
    for (const [key, code] of [["¡", "Digit1"], ["™", "Digit2"], ["£", "Digit3"], ["¢", "Digit4"], ["∞", "Digit5"]]) {
      const combo = eventToCombo(new KeyboardEvent("keydown", { key, code, altKey: true }));
      expect(combo).toBe(`⌥${code.slice(5)}`);
    }
    const combo = eventToCombo(new KeyboardEvent("keydown", { key: "3", code: "Digit3", altKey: true }));
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
    expect(moved["tab-1"]).toBe("⌥1");
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
