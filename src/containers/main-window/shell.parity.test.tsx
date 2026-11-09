/**
 * The shell's promises, against the real `App` and `MainWindow`.
 *
 * These are the revamp's biggest risks (TOOLS_PARITY.md section 3.1): the window
 * that never shows, the wizard over an existing player's data, two things playing
 * because a new door skipped `setView`, the tool that can no longer be reached, the
 * hotkey that dies on a new view. Nothing is mocked but the Tauri transport, so a
 * Today-first shell runs through exactly the same tests.
 *
 * How a tool is reached is `src/test/parity/tools.ts`'s business, and only there.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../../App";
import { HOTKEYS } from "../../hotkeys";
import i18n from "../../i18n";
import { DEFAULT_TEST_STATE, mockInvoke, setInvokeResponse } from "../../test/mocks";
import { emitEvent, installSettings } from "../../test/parity/store";
import {
  expectOnTool,
  OPEN_ON_LAST_TOOL,
  openTool,
  press,
  RETURNING_PLAYER,
  TOOLS,
  visibleToolLabels,
  type Tool,
} from "../../test/parity/tools";
import type { AppState } from "../../types";
import { MainWindow } from "./MainWindow";

const [METRONOME, SETLIST, DRILL, JAM, SONGS] = TOOLS as unknown as [Tool, Tool, Tool, Tool, Tool];

const invoked = (command: string) => mockInvoke.mock.calls.filter(([c]) => c === command);
const invokedWith = (command: string, args: unknown) =>
  invoked(command).some(([, a]) => JSON.stringify(a) === JSON.stringify(args));

function setSearch(search: string) {
  window.history.replaceState({}, "", `/${search}`);
}

/** The whole shell, for a returning player, once it has settled. */
async function openShell(state: Partial<AppState> = {}, settings: Record<string, unknown> = {}) {
  await installSettings({ ...RETURNING_PLAYER, ...settings });
  setInvokeResponse("get_state", () => ({ ...DEFAULT_TEST_STATE, ...state }));
  // The shared mock has no answer for this, and Settings cannot draw without one.
  setInvokeResponse("tts_voice_diagnostics", () => []);
  const view = render(<MainWindow />);
  await waitFor(() => expect(document.querySelector(".rail")).not.toBeNull());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return view;
}

/** Open a tool, wait for its screen, and start counting calls from there. */
async function onTool(tool: Tool) {
  await openTool(tool);
  await expectOnTool(tool);
  mockInvoke.mockClear();
}

beforeEach(() => setSearch(""));

// ── SYS-17: the window starts hidden until this is called ────────────────
describe("app_ready", () => {
  it("is called once by the main window, which otherwise never shows", async () => {
    await installSettings(RETURNING_PLAYER);
    render(<App />);
    await waitFor(() => expect(invoked("app_ready")).toHaveLength(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(invoked("app_ready")).toHaveLength(1);
  });

  it("is called by the floating widget too", async () => {
    setSearch("?window=floating");
    await installSettings(RETURNING_PLAYER);
    const { container } = render(<App />);
    await waitFor(() => expect(invoked("app_ready")).toHaveLength(1));
    expect(container.querySelector(".floating-widget")).not.toBeNull();
  });

  it("is what Rust waits for: the main window is configured hidden", async () => {
    const fs = await import("node:fs");
    const conf = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8")) as {
      app: { windows: Array<{ label: string; visible?: boolean }> };
    };
    expect(conf.app.windows.find((w) => w.label === "main")?.visible).toBe(false);
  });
});

// ── ONB-01, ONB-02, COA-114: who counts as an existing player ────────────
describe("first-run detection", () => {
  const wizard = () => screen.queryByTestId("onboarding-overlay");

  /** Let detection finish: it stamps or it opens, and either takes a few reads. */
  async function settle() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }

  it("opens the wizard for somebody with nothing at all", async () => {
    await installSettings({});
    render(<MainWindow />);
    await waitFor(() => expect(wizard()).not.toBeNull());
  });

  it.each([
    ["a saved instrument", { instrument: "bass" }, {}],
    ["a session in the history", {}, { get_session_history: [{ id: "s1", timestamp: 1 }] }],
    ["a saved preset", {}, { list_presets: [{ id: "p1", name: "Warmup" }] }],
  ])("does not open it over %s, and stamps them as existing", async (_name, stored, responses) => {
    const store = await installSettings(stored);
    for (const [cmd, value] of Object.entries(responses)) setInvokeResponse(cmd, () => value);
    render(<MainWindow />);
    await waitFor(() => expect(store.values.get("onboarding.version")).toBeDefined());
    await settle();
    expect(wizard()).toBeNull();
    expect(store.values.get("onboarding.completedAt")).toBeDefined();
  });

  it("does not open it for somebody who has already been through it", async () => {
    await installSettings({ "onboarding.version": 1 });
    render(<MainWindow />);
    await settle();
    expect(wizard()).toBeNull();
  });

  it("leaves an existing player's saved settings as it found them", async () => {
    const instrument = "bass";
    const store = await installSettings({ instrument });
    render(<MainWindow />);
    await waitFor(() => expect(store.values.get("onboarding.version")).toBeDefined());
    await settle();
    expect(store.values.get("instrument")).toBe(instrument);
    expect(store.writes.filter(([k]) => k === "instrument")).toEqual([]);
  });
});

// ── Every rail mode reachable, by both routes ────────────────────────────
describe("every tool can be reached", () => {
  it("names all five tools where a player can see them", async () => {
    await openShell();
    const labels = visibleToolLabels();
    for (const tool of TOOLS) expect(labels).toContain(tool.label);
  });

  it.each(TOOLS.map((t) => [t.label, t] as const))("%s, by its name", async (_label, tool) => {
    await openShell();
    // From another tool, so a tool that is merely the default still has to work.
    const other = tool === METRONOME ? SETLIST : METRONOME;
    await onTool(other);
    await openTool(tool);
    await expectOnTool(tool);
    expect(invokedWith("set_active_tab", { tab: tool.mode })).toBe(true);
  });

  it.each(TOOLS.map((t) => [t.action, t] as const))("%s, by its hotkey", async (action, tool) => {
    await openShell();
    const other = tool === METRONOME ? SETLIST : METRONOME;
    await onTool(other);
    const key = HOTKEYS.find((h) => h.id === action)!.key;
    press(key);
    await expectOnTool(tool);
    expect(invokedWith("set_active_tab", { tab: tool.mode })).toBe(true);
  });

  it.each(TOOLS.map((t) => [t.action, t] as const))("%s, by a pedal", async (action, tool) => {
    await openShell();
    const other = tool === METRONOME ? SETLIST : METRONOME;
    await onTool(other);
    await act(async () => emitEvent("midi-action", { action }));
    await expectOnTool(tool);
  });
});

// ── SHL-04, SHL-05, SHL-07: setView is the only way between modes ────────
describe("setView", () => {
  it("stops the click when the mode changes", async () => {
    await openShell({ isPlaying: true });
    await onTool(METRONOME);
    await openTool(DRILL);
    await expectOnTool(DRILL);
    expect(invokedWith("set_playing", { playing: false })).toBe(true);
  });

  it("stops a running climb when the mode changes", async () => {
    await openShell({
      speedRamp: { ...DEFAULT_TEST_STATE.speedRamp, active: true },
    });
    await onTool(DRILL);
    await openTool(METRONOME);
    await expectOnTool(METRONOME);
    expect(invoked("stop_speed_ramp").length).toBeGreaterThan(0);
  });

  it("stops the click on the way between any two tools", async () => {
    await openShell({ isPlaying: true });
    await onTool(JAM);
    await openTool(SONGS);
    await expectOnTool(SONGS);
    expect(invokedWith("set_playing", { playing: false })).toBe(true);
  });

  it("does nothing to playback when Settings opens and closes over a tool", async () => {
    await openShell({ isPlaying: true });
    await onTool(METRONOME);
    press(HOTKEYS.find((h) => h.id === "settings")!.key);
    await waitFor(() => expect(document.querySelector(METRONOME.landmark)).toBeNull());
    press(HOTKEYS.find((h) => h.id === "settings")!.key);
    await expectOnTool(METRONOME);
    expect(invoked("set_playing")).toEqual([]);
  });

  it("returns to the tool Settings covered, not to wherever else", async () => {
    await openShell();
    await onTool(DRILL);
    press(HOTKEYS.find((h) => h.id === "settings")!.key);
    await waitFor(() => expect(document.querySelector(DRILL.landmark)).toBeNull());
    fireEvent.keyDown(document.body, { key: "Escape" });
    await expectOnTool(DRILL);
  });

  it("counts leaving Settings for another tool as a mode change", async () => {
    await openShell({ isPlaying: true });
    await onTool(METRONOME);
    press(HOTKEYS.find((h) => h.id === "settings")!.key);
    await waitFor(() => expect(document.querySelector(METRONOME.landmark)).toBeNull());
    await openTool(JAM);
    await expectOnTool(JAM);
    expect(invokedWith("set_playing", { playing: false })).toBe(true);
  });

  it("never saves Settings as the tab to come back to", async () => {
    await openShell();
    await onTool(METRONOME);
    press(HOTKEYS.find((h) => h.id === "settings")!.key);
    await waitFor(() => expect(document.querySelector(METRONOME.landmark)).toBeNull());
    expect(invokedWith("set_active_tab", { tab: "settings" })).toBe(false);
  });

  it.each(TOOLS.map((t) => [t.mode, t] as const))(
    "brings a saved activeTab of %s back",
    async (mode, tool) => {
      setInvokeResponse("get_active_tab", () => mode);
      await openShell({}, OPEN_ON_LAST_TOOL);
      await expectOnTool(tool);
    },
  );

  it("drops an activeTab it does not recognise, without losing the shell", async () => {
    setInvokeResponse("get_active_tab", () => "pocket-check");
    await openShell({}, OPEN_ON_LAST_TOOL);
    expect(document.querySelector(".rail")).not.toBeNull();
  });
});

// ── Hands-free: the real key handler and the real MIDI listener ──────────
describe("the keys, on the Metronome", () => {
  const cases: Array<[string, string, string, unknown]> = [
    ["play", "Space", "toggle_playback", undefined],
    ["bpm-up", "↑", "set_bpm", { bpm: 125 }],
    ["bpm-down", "↓", "set_bpm", { bpm: 115 }],
    ["bpm-up-1", "⇧↑", "set_bpm", { bpm: 121 }],
    ["bpm-down-1", "⇧↓", "set_bpm", { bpm: 119 }],
    ["sub-next", "]", "set_subdivision", { subdivision: 2 }],
    ["sub-prev", "[", "set_subdivision", { subdivision: 6 }],
    ["sub-1", "1", "set_subdivision", { subdivision: 1 }],
    ["sub-2", "2", "set_subdivision", { subdivision: 2 }],
    ["sub-3", "3", "set_subdivision", { subdivision: 3 }],
    ["sub-4", "4", "set_subdivision", { subdivision: 4 }],
    ["sig-next", "T", "set_beat_groups", { groups: [3, 2] }],
    ["sig-prev", "⇧T", "set_beat_groups", { groups: [3] }],
    ["toggle-widget", "W", "show_floating", undefined],
  ];

  it.each(cases)("%s (%s) reaches %s, by key", async (_id, combo, command, args) => {
    await openShell();
    await onTool(METRONOME);
    press(combo);
    await waitFor(() =>
      expect(invoked(command).map(([, a]) => a)).toContainEqual(args),
    );
  });

  it.each(cases)("%s reaches %s, by a pedal (%s)", async (id, _combo, command, args) => {
    await openShell();
    await onTool(METRONOME);
    await act(async () => emitEvent("midi-action", { action: id }));
    await waitFor(() =>
      expect(invoked(command).map(([, a]) => a)).toContainEqual(args),
    );
  });

  it("all the keys in the table are the keys in the app", () => {
    for (const [id, combo] of cases) {
      expect(HOTKEYS.find((h) => h.id === id)?.key).toBe(combo);
    }
  });

  it("stand aside while somebody is typing", async () => {
    await openShell();
    await onTool(METRONOME);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: " " });
    input.remove();
    expect(invoked("toggle_playback")).toEqual([]);
  });

  it("keep working with focus on the tempo ruler", async () => {
    await openShell();
    await onTool(METRONOME);
    const ruler = document.querySelector<HTMLInputElement>('input[type="range"]')!;
    fireEvent.keyDown(ruler, { key: " " });
    await waitFor(() => expect(invoked("toggle_playback").length).toBeGreaterThan(0));
  });

  it("honour a player's saved binding", async () => {
    await openShell({}, { keyBindings: { play: "P" } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await onTool(METRONOME);
    press("P");
    await waitFor(() => expect(invoked("toggle_playback").length).toBeGreaterThan(0));
  });
});

describe("the keys, on the Jam", () => {
  it("reach the jam, with one on the stage", async () => {
    await openShell();
    await onTool(JAM);
    press("G");
    await waitFor(() => expect(mockInvoke.mock.calls.length).toBeGreaterThan(0));
  });
});

describe("the sidebar, the coach and Settings", () => {
  it("B collapses the library", async () => {
    await openShell();
    await onTool(METRONOME);
    const was = document.querySelector(".preset-sidebar") !== null;
    press("B");
    await waitFor(() =>
      expect(document.querySelector(".preset-sidebar") !== null).toBe(!was),
    );
  });

  it("⌘, opens Settings", async () => {
    await openShell();
    await onTool(METRONOME);
    press("⌘,");
    await waitFor(() => expect(document.querySelector(METRONOME.landmark)).toBeNull());
    expect(document.querySelector("#settings-coach")).not.toBeNull();
  });

  it("keeps the anchors other screens jump to", async () => {
    await openShell();
    press("⌘,");
    await waitFor(() => expect(document.querySelector("#settings-devices")).not.toBeNull());
    expect(document.querySelector("#settings-coach")).not.toBeNull();
    expect(document.querySelector("#settings-appearance")).not.toBeNull();
  });
});

// ── The doors out: Zen and the widget ────────────────────────────────────
describe("Zen, from the shell", () => {
  const zen = () => document.querySelector(".fullscreen-view");

  it("opens on Z", async () => {
    await openShell();
    await onTool(METRONOME);
    press("Z");
    await waitFor(() => expect(zen()).not.toBeNull());
  });

  it("opens by a pedal", async () => {
    await openShell();
    await onTool(METRONOME);
    await act(async () => emitEvent("midi-action", { action: "fullscreen" }));
    await waitFor(() => expect(zen()).not.toBeNull());
  });

  it("opens from its button", async () => {
    await openShell();
    await onTool(METRONOME);
    fireEvent.click(screen.getByRole("button", { name: i18n.t("tooltip.zen") }));
    await waitFor(() => expect(zen()).not.toBeNull());
  });

  it("closes on Escape, back on the same tool", async () => {
    // Off, because the fade ends on an animation event that happy-dom never fires.
    await openShell({}, { viewTransitions: "off" });
    await onTool(DRILL);
    press("Z");
    await waitFor(() => expect(zen()).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(zen()).toBeNull());
    await expectOnTool(DRILL);
  });

  it.each(TOOLS.map((t) => [t.label, t] as const))("opens from %s", async (_label, tool) => {
    await openShell();
    await onTool(tool);
    press("Z");
    await waitFor(() => expect(zen()).not.toBeNull());
  });
});

describe("the floating widget, from the shell", () => {
  it("opens from its button", async () => {
    await openShell();
    await onTool(METRONOME);
    fireEvent.click(screen.getByRole("button", { name: i18n.t("tooltip.openWidget") }));
    await waitFor(() => expect(invoked("show_floating").length).toBeGreaterThan(0));
  });

  it.each(TOOLS.map((t) => [t.label, t] as const))("opens by key from %s", async (_label, tool) => {
    await openShell();
    await onTool(tool);
    press("W");
    await waitFor(() => expect(invoked("show_floating").length).toBeGreaterThan(0));
  });
});
