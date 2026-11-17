// ⌘1 ⌘2 ⌘3 count down the rail.
//
// The numbers are positional or they are arbitrary. When setlists became a
// mode they arrived second in the rail, which moved Drill from ⌘2 to ⌘3 —
// keeping Drill on ⌘2 would have spared the habit once and then left everyone
// pressing ⌘2 for the third item for the rest of the app's life.
//
// So the binding table and the rail have to stay in step, and neither one
// knows about the other. This is what notices when they stop agreeing.
import { describe, expect, it } from "vitest";
import { HOTKEYS, actionForCombo } from "./hotkeys";
import { PLAY_TABS } from "./containers/main-window/hooks/useTabRouting";

/** The `tab-N` entries, in N order. */
function tabHotkeys() {
  return HOTKEYS.filter((h) => /^tab-\d+$/.test(h.id)).sort((a, b) =>
    Number(a.id.slice(4)) - Number(b.id.slice(4)),
  );
}

describe("the tab hotkeys", () => {
  it("gives every mode a number, and no number without a mode", () => {
    expect(tabHotkeys().map((h) => h.id)).toEqual(
      PLAY_TABS.map((_, i) => `tab-${i + 1}`),
    );
  });

  it("numbers them in the order the rail lists them", () => {
    // PLAY_TABS is the rail's order: Metronome, Setlist, Drill, Jam, Songs.
    const names: Record<string, string> = {
      beat: "Metronome",
      setlist: "Setlist",
      drill: "Drill",
      jam: "Jam",
      songs: "Songs",
    };
    expect(tabHotkeys().map((h) => h.action)).toEqual(
      PLAY_TABS.map((tab) => `${names[tab]} tab`),
    );
  });

  it("binds them to consecutive digits", () => {
    expect(tabHotkeys().map((h) => h.key)).toEqual(
      PLAY_TABS.map((_, i) => `⌘${i + 1}`),
    );
  });

  it("files them under navigation, so the settings list groups them together", () => {
    for (const h of tabHotkeys()) expect(h.group, h.id).toBe("navigation");
  });
});

// The rail's learning side has keys of its own (owner, 2026-11-17): Today kept
// ⌘0, the tools kept ⌘1–⌘5, and Paths, Progress and Tools come after them.
describe("the learning side's keys", () => {
  const key = (id: string) => HOTKEYS.find((h) => h.id === id)?.key;

  it("are ⌘6, ⌘7 and ⌘8, after the tools, leaving ⌘0 and ⌘1–⌘5 as they were", () => {
    expect(key("tab-today")).toBe("⌘0");
    expect(["tab-1", "tab-2", "tab-3", "tab-4", "tab-5"].map(key)).toEqual(["⌘1", "⌘2", "⌘3", "⌘4", "⌘5"]);
    expect(["tab-paths", "tab-progress", "tab-tools"].map(key)).toEqual(["⌘6", "⌘7", "⌘8"]);
  });

  it("claim no key anything else in the table has", () => {
    const keys = HOTKEYS.map((h) => h.key).filter(Boolean);
    for (const k of ["⌘6", "⌘7", "⌘8"]) expect(keys.filter((x) => x === k), k).toHaveLength(1);
  });

  it("leave the webview's own shortcuts alone", () => {
    for (const k of ["⌘P", "⌘R", "⌘F", "⌘W", "⌘Q", "⌘N", "⌘T"]) {
      expect(HOTKEYS.some((h) => ["tab-paths", "tab-progress", "tab-tools"].includes(h.id) && h.key === k)).toBe(false);
    }
  });

  it("are app-wide, on every tab", () => {
    const defaults = Object.fromEntries(HOTKEYS.map((h) => [h.id, h.key]));
    for (const view of ["beat", "jam", "songs", "today", "session", "settings"]) {
      expect(actionForCombo(defaults, "⌘6", view), view).toBe("tab-paths");
      expect(actionForCombo(defaults, "⌘7", view), view).toBe("tab-progress");
      expect(actionForCombo(defaults, "⌘8", view), view).toBe("tab-tools");
    }
  });
});

// Escape in a Session is Exit; anywhere else it is left to what is open there.
describe("Escape", () => {
  const defaults = Object.fromEntries(HOTKEYS.map((h) => [h.id, h.key]));

  it("leaves a Session", () => {
    expect(actionForCombo(defaults, "Escape", "session")).toBe("session-exit");
  });

  it("means nothing app-wide off the Session", () => {
    for (const view of ["beat", "drill", "setlist", "jam", "songs", "today", "paths", "progress", "tools", "settings"]) {
      expect(actionForCombo(defaults, "Escape", view), view).toBeUndefined();
    }
  });

  it("follows a remap: bound elsewhere, Escape no longer leaves", () => {
    const remapped = { ...defaults, "session-exit": "Q" };
    expect(actionForCombo(remapped, "Escape", "session")).toBeUndefined();
    expect(actionForCombo(remapped, "Q", "session")).toBe("session-exit");
  });
});
