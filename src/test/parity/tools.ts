/**
 * The tools, and the one place that knows how a player gets to them.
 *
 * The revamp puts Today in front and moves these under a Tools door, so nothing
 * else in this suite may assume the rail's shape. Everything that needs to reach
 * a tool goes through `openTool`, and everything that reads a rail goes through
 * `visibleToolLabels`. **When the Tools door lands, this is the file to change,
 * and these ids, actions and hotkeys must not move:** `beat` is the Metronome in
 * users' saved `activeTab`, and `tab-1` to `tab-5` are stored in their bindings.
 */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { HotkeyAction } from "../../hotkeys";
import type { PlayTab } from "../../containers/main-window/hooks/useTabRouting";

export interface Tool {
  /** The stored `activeTab` value. */
  mode: PlayTab;
  /** The i18n key of its name, and that name in English. */
  labelKey: string;
  label: string;
  /** Its positional hotkey. Stored in `keyBindings`, so never renumbered. */
  action: HotkeyAction;
}

export const TOOLS: readonly Tool[] = [
  { mode: "beat", labelKey: "nav.metronome", label: "Metronome", action: "tab-1" },
  { mode: "setlist", labelKey: "nav.setlist", label: "Setlist", action: "tab-2" },
  { mode: "drill", labelKey: "nav.drill", label: "Drill", action: "tab-3" },
  { mode: "jam", labelKey: "nav.jam", label: "Jam", action: "tab-4" },
  { mode: "songs", labelKey: "nav.songs", label: "Songs", action: "tab-5" },
];

/**
 * Whatever opens the tool list, if something has to.
 *
 * Today the modes sit straight on the rail, so nothing does. Under the revamp's
 * rail this clicks Tools first.
 */
function revealTools(): void {
  // Nothing to reveal yet: the five modes are on the rail.
}

/** The names of the tools a player can see, in order. */
export function visibleToolLabels(root: ParentNode = document): string[] {
  revealTools();
  return [...root.querySelectorAll(".rail-mode-label")].map((n) => n.textContent ?? "");
}

/** Open a tool the way a player does: by clicking its name. */
export async function openTool(tool: Tool): Promise<void> {
  revealTools();
  const rail = await waitFor(() => {
    const el = document.querySelector<HTMLElement>(".rail");
    if (!el) throw new Error("no rail on screen");
    return el;
  });
  fireEvent.click(within(rail).getByText(tool.label));
  await waitFor(() => expect(screen.getByText(tool.label)).toBeTruthy());
}
