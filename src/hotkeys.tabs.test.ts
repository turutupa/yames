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
import { HOTKEYS } from "./hotkeys";
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
    // PLAY_TABS is the rail's order: Metronome, Setlist, Drill.
    const names: Record<string, string> = {
      beat: "Metronome",
      setlist: "Setlist",
      drill: "Drill",
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
