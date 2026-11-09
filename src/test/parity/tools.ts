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
import { fireEvent, waitFor } from "@testing-library/react";
import { IS_MAC, type HotkeyAction } from "../../hotkeys";
import type { PlayTab } from "../../containers/main-window/hooks/useTabRouting";

export interface Tool {
  /** The stored `activeTab` value. */
  mode: PlayTab;
  /** The i18n key of its name, and that name in English. */
  labelKey: string;
  label: string;
  /** Its positional hotkey. Stored in `keyBindings`, so never renumbered. */
  action: HotkeyAction;
  /** A class only that tool's screen has. "Existing screens live under Tools unchanged". */
  landmark: string;
}

export const TOOLS: readonly Tool[] = [
  { mode: "beat", labelKey: "nav.metronome", label: "Metronome", action: "tab-1", landmark: ".bpm-section" },
  { mode: "setlist", labelKey: "nav.setlist", label: "Setlist", action: "tab-2", landmark: ".setlist-paragraph" },
  { mode: "drill", labelKey: "nav.drill", label: "Drill", action: "tab-3", landmark: ".drill-view" },
  { mode: "jam", labelKey: "nav.jam", label: "Jam", action: "tab-4", landmark: ".jam-view" },
  { mode: "songs", labelKey: "nav.songs", label: "Songs", action: "tab-5", landmark: ".songs-view" },
];

/**
 * Settings that make the app open on the last tool rather than on the front door.
 *
 * Empty today, when it always does. Today-first shells put "open on my last tool"
 * here, so the tests that say a stored `activeTab` comes back still mean something.
 */
export const OPEN_ON_LAST_TOOL: Record<string, unknown> = {};

/** The settings of someone who has used the app before: no wizard, no tour. */
export const RETURNING_PLAYER: Record<string, unknown> = {
  instrument: "electric-guitar",
  "onboarding.version": 1,
  "onboarding.completedAt": "2026-01-01T00:00:00.000Z",
  "tour.seenVersion": 1,
  "whatsNew.seenVersion": "0.9.0",
};

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
  const name = await waitFor(() => {
    const el = [...document.querySelectorAll<HTMLElement>(".rail-mode-label")].find(
      (n) => n.textContent === tool.label,
    );
    if (!el) throw new Error(`${tool.label} is not on the rail`);
    return el;
  });
  fireEvent.click(name);
}

/** Wait for a tool's own screen. Fails if opening it put nothing on screen. */
export async function expectOnTool(tool: Tool): Promise<void> {
  await waitFor(() => {
    if (!document.querySelector(tool.landmark)) {
      throw new Error(`${tool.label}'s screen (${tool.landmark}) is not showing`);
    }
  });
}

/** The key event a default binding like `⌘⇧↑` stands for. */
export function keyEventFor(combo: string): KeyboardEventInit {
  const mod = /⌘/.test(combo);
  const named: Record<string, string> = {
    Space: " ",
    "↑": "ArrowUp",
    "↓": "ArrowDown",
    "←": "ArrowLeft",
    "→": "ArrowRight",
  };
  const shift = /⇧/.test(combo);
  const bare = combo.replace(/[⌘⇧⌥⌃]/g, "");
  const key = named[bare] ?? (shift ? bare : bare.toLowerCase());
  return {
    key,
    shiftKey: shift,
    altKey: /⌥/.test(combo),
    ctrlKey: mod && !IS_MAC,
    metaKey: mod && IS_MAC,
  };
}

/** Press a default binding, as a player's keyboard would. */
export function press(combo: string): void {
  fireEvent.keyDown(document.body, keyEventFor(combo));
}
