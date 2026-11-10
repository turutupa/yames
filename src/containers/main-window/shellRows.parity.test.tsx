/**
 * The shell's rows that shell.parity.test.tsx does not already pin, one by one.
 *
 * The revamp puts Today in front of the five tools and a Tools door between them,
 * so every promise the rail, the Settings sheet, the onboarding nudges and the
 * keyboard handler make today is a place a Today-first shell can drop something.
 * Each test name starts with the TOOLS_PARITY.md row it pins; the running list is
 * src/test/parity/COVERAGE.md.
 *
 * As everywhere in this suite, a tool is reached through src/test/parity/tools.ts
 * only, and nothing is mocked but the Tauri transport.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HOTKEYS } from "../../hotkeys";
import i18n from "../../i18n";
import { mockInvoke } from "../../test/mocks";
import { onTool, openSettings, openShell, settle, wasInvoked } from "../../test/parity/shell";
import { emitEvent, installSettings } from "../../test/parity/store";
import {
  expectOnTool,
  keyEventFor,
  openTool,
  press,
  RETURNING_PLAYER,
  TOOLS,
  visibleToolLabels,
  type Tool,
} from "../../test/parity/tools";
import { MainWindow } from "./MainWindow";

const [METRONOME, SETLIST, DRILL, JAM] = TOOLS as unknown as [Tool, Tool, Tool, Tool, Tool];
const t = (key: string) => i18n.t(key);
const keyOf = (id: string) => HOTKEYS.find((h) => h.id === id)!.key;
const inSettings = () => document.querySelector("#settings-coach") !== null;

/** The rail button that opens this tool, the one carrying `aria-current`. */
const toolButton = (tool: Tool) =>
  document.querySelector<HTMLElement>(`.rail-mode[aria-label="${tool.label}"]`);

describe("the tool list", () => {
  it("SHL-01: names the five tools in their order, and no Paths among them", async () => {
    await openShell();
    expect(visibleToolLabels()).toEqual(TOOLS.map((tool) => tool.label));
  });

  it("SHL-08: marks Jam, and only Jam, as Beta", async () => {
    await openShell();
    const badges = [...document.querySelectorAll(".rail-mode-badge")];
    expect(badges.map((b) => b.textContent)).toEqual([t("rail.beta")]);
    expect(badges[0]!.closest(".rail-mode-row")?.querySelector(".rail-mode-label")?.textContent).toBe(
      JAM.label,
    );
  });

  it.each(TOOLS.map((tool) => [tool.label, tool] as const))(
    "SHL-02: marks %s as the current page when it is open, and nothing else",
    async (_label, tool) => {
      await openShell();
      await onTool(tool);
      expect(toolButton(tool)?.getAttribute("aria-current")).toBe("page");
      const current = [...document.querySelectorAll(".rail-mode[aria-current='page']")];
      expect(current).toHaveLength(1);
    },
  );

  it("SHL-15: every button on the rail keeps an accessible name", async () => {
    await openShell();
    const rail = document.querySelector(".rail")!;
    expect(rail.getAttribute("aria-label")).toBe(t("rail.label"));
    const buttons = [...rail.querySelectorAll("button")];
    expect(buttons.length).toBeGreaterThan(TOOLS.length);
    for (const b of buttons) {
      const name = b.getAttribute("aria-label") ?? b.textContent ?? "";
      expect(name.trim(), b.outerHTML.slice(0, 80)).not.toBe("");
    }
  });
});

describe("the tab hotkeys", () => {
  it.each(TOOLS.map((tool) => [tool.action, tool] as const))(
    "SHL-03: %s works from Settings too",
    async (action, tool) => {
      await openShell();
      await onTool(tool === METRONOME ? SETLIST : METRONOME);
      await openSettings();
      press(keyOf(action));
      await expectOnTool(tool);
      expect(inSettings()).toBe(false);
    },
  );

  it.each(TOOLS.map((tool) => [tool.action, tool] as const))(
    "SHL-03: %s works by a pedal from Settings",
    async (action, tool) => {
      await openShell();
      await onTool(tool === METRONOME ? SETLIST : METRONOME);
      await openSettings();
      await act(async () => emitEvent("midi-action", { action }));
      await expectOnTool(tool);
    },
  );
});

describe("Settings, over a tool", () => {
  it("SHL-05: the rail's Settings button opens it and, pressed again, goes back", async () => {
    await openShell();
    await onTool(DRILL);
    const settingsButton = () => screen.getByRole("button", { name: t("tooltip.settings") });
    fireEvent.click(settingsButton());
    await waitFor(() => expect(inSettings()).toBe(true));
    fireEvent.click(settingsButton());
    await expectOnTool(DRILL);
    expect(inSettings()).toBe(false);
  });

  it("SHL-06: opening it scrolls it back to the top", async () => {
    const scrollTo = vi.fn();
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof original;
    try {
      await openShell();
      await onTool(METRONOME);
      scrollTo.mockClear();
      await openSettings();
      await settle(10);
      expect(scrollTo).toHaveBeenCalledWith(0, 0);
    } finally {
      HTMLElement.prototype.scrollTo = original;
    }
  });

  it("SHL-27, KEY-10: Escape closes the input tester first, and only then leaves Settings", async () => {
    await openShell();
    await onTool(JAM);
    await openSettings();
    fireEvent.click(document.querySelector(".hotkeys-section-header .input-test-btn")!);
    await waitFor(() => expect(document.querySelector(".input-tester-modal")).not.toBeNull());
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(document.querySelector(".input-tester-modal")).toBeNull());
    expect(inSettings()).toBe(true);
    fireEvent.keyDown(document.body, { key: "Escape" });
    await expectOnTool(JAM);
  });

  it("SHL-27, KEY-10: Zen's key is ignored on Settings, so Escape there only leaves it", async () => {
    await openShell({}, { viewTransitions: "off" });
    await onTool(METRONOME);
    await openSettings();
    press(keyOf("fullscreen"));
    await settle(10);
    expect(document.querySelector(".fullscreen-view")).toBeNull();
    fireEvent.keyDown(document.body, { key: "Escape" });
    await expectOnTool(METRONOME);
  });
});

describe("the coach card, from the shell", () => {
  const cardOpen = () => document.querySelector(".coach-card-inner") !== null;

  it("SHL-12, COA-01: the rail's coach button opens and closes it", async () => {
    await openShell();
    await onTool(METRONOME);
    const was = cardOpen();
    const coach = () =>
      [...document.querySelectorAll<HTMLElement>(".rail button")].find((b) =>
        b.getAttribute("aria-label")?.startsWith(t("settings.coach.title")),
      )!;
    expect(coach()).toBeDefined();
    fireEvent.click(coach());
    await waitFor(() => expect(cardOpen()).toBe(!was));
    fireEvent.click(coach());
    await waitFor(() => expect(cardOpen()).toBe(was));
  });

  it("SHL-12: says its state in the rail button's name", async () => {
    await openShell();
    const coach = [...document.querySelectorAll<HTMLElement>(".rail button")].find((b) =>
      b.getAttribute("aria-label")?.startsWith(t("settings.coach.title")),
    )!;
    expect(coach.getAttribute("aria-label")).toMatch(new RegExp(`^${t("settings.coach.title")} — .+`));
  });

  it("SHL-12: C opens it from the Metronome", async () => {
    await openShell();
    await onTool(METRONOME);
    const was = cardOpen();
    press(keyOf("toggle-coach"));
    await waitFor(() => expect(cardOpen()).toBe(!was));
  });
});

describe("who owns the keyboard", () => {
  it("SHL-28: the wizard does: Space and the tab keys do nothing behind it", async () => {
    await installSettings({});
    render(<MainWindow />);
    await waitFor(() => expect(screen.queryByTestId("onboarding-overlay")).not.toBeNull());
    await settle();
    mockInvoke.mockClear();
    fireEvent.keyDown(document.body, { key: " " });
    press(keyOf("tab-3"));
    await settle(10);
    expect(wasInvoked("toggle_playback")).toBe(false);
    expect(wasInvoked("set_active_tab")).toBe(false);
    expect(document.querySelector(DRILL.landmark)).toBeNull();
  });

  it("SHL-28: a text field does: the tab key typed into one does not change tool", async () => {
    await openShell();
    await onTool(METRONOME);
    const input = document.createElement("input");
    input.type = "text";
    document.body.appendChild(input);
    try {
      input.focus();
      fireEvent.keyDown(input, keyEventFor(keyOf("tab-3")));
      await settle(10);
      expect(wasInvoked("set_active_tab")).toBe(false);
      await expectOnTool(METRONOME);
      // The same key with the caret elsewhere does change it: the guard is the field.
      input.blur();
      press(keyOf("tab-3"));
      await expectOnTool(DRILL);
    } finally {
      input.remove();
    }
  });
});

describe("the audio failure notice", () => {
  const notice = () => document.querySelector(".audio-error-notice");

  it.each(TOOLS.map((tool) => [tool.label, tool] as const))(
    "SHL-30: shows on %s",
    async (_label, tool) => {
      await openShell();
      await onTool(tool);
      await act(async () => emitEvent("audio-error", "0x8889000a device in use"));
      await waitFor(() => expect(notice()).not.toBeNull());
    },
  );

  it("SHL-30: shows on Settings too, where the remedy is", async () => {
    await openShell();
    await openSettings();
    await act(async () => emitEvent("audio-error", "0x8889000a device in use"));
    await waitFor(() => expect(notice()).not.toBeNull());
  });

  it("SHL-31: its Audio settings button goes to Settings and takes the notice away", async () => {
    await openShell();
    await onTool(METRONOME);
    await act(async () => emitEvent("audio-error", "0x8889000a device in use"));
    await waitFor(() => expect(notice()).not.toBeNull());
    fireEvent.click(document.querySelector(".audio-error-notice-action")!);
    await waitFor(() => expect(document.querySelector("#settings-devices")).not.toBeNull());
    expect(notice()).toBeNull();
  });

  it("SHL-31: X dismisses it, on the same tool", async () => {
    await openShell();
    await onTool(DRILL);
    await act(async () => emitEvent("audio-error", "0x8889000a device in use"));
    await waitFor(() => expect(notice()).not.toBeNull());
    fireEvent.click(document.querySelector(".audio-error-notice-dismiss")!);
    await waitFor(() => expect(notice()).toBeNull());
    await expectOnTool(DRILL);
  });
});

describe("the onboarding nudges a returning player can get", () => {
  const chip = () => document.querySelector(".finish-setup-chip");
  const offer = () => screen.queryByTestId("tour-offer");

  it("ONB-03: a player who skipped setup gets the Finish setup chip", async () => {
    await installSettings({ ...RETURNING_PLAYER, "onboarding.completedAt": undefined });
    render(<MainWindow />);
    await waitFor(() => expect(chip()).not.toBeNull());
    expect(screen.queryByTestId("onboarding-overlay")).toBeNull();
  });

  it("ONB-03: and stops getting it after two dismissals", async () => {
    await installSettings({
      ...RETURNING_PLAYER,
      "onboarding.completedAt": undefined,
      "onboarding.chipDismissed": 2,
    });
    render(<MainWindow />);
    await settle(20);
    expect(chip()).toBeNull();
  });

  it("ONB-04: the chip is not drawn over Settings", async () => {
    await openShell({}, { "onboarding.completedAt": undefined });
    await waitFor(() => expect(chip()).not.toBeNull());
    await openSettings();
    expect(chip()).toBeNull();
  });

  it("ONB-04: the chip opens the wizard", async () => {
    await installSettings({ ...RETURNING_PLAYER, "onboarding.completedAt": undefined });
    render(<MainWindow />);
    await waitFor(() => expect(chip()).not.toBeNull());
    fireEvent.click(document.querySelector(".finish-setup-chip-main")!);
    await waitFor(() => expect(screen.queryByTestId("onboarding-overlay")).not.toBeNull());
  });

  it("ONB-03: a player who finished setup gets no chip", async () => {
    await openShell();
    await settle(20);
    expect(chip()).toBeNull();
  });

  it("ONB-21: an existing player stamped at this launch is offered the tour once", async () => {
    await installSettings({ instrument: "bass" });
    render(<MainWindow />);
    await waitFor(() => expect(offer()).not.toBeNull());
  });

  it("ONB-21: dismissing the offer counts as seen", async () => {
    const store = await installSettings({ instrument: "bass" });
    render(<MainWindow />);
    await waitFor(() => expect(offer()).not.toBeNull());
    fireEvent.click(document.querySelector(".tour-offer-dismiss")!);
    await waitFor(() => expect(offer()).toBeNull());
    await waitFor(() => expect(store.values.get("tour.seenVersion")).toBeDefined());
  });

  it("ONB-21: a player who has seen the tour is not offered it", async () => {
    await openShell();
    await settle(20);
    expect(offer()).toBeNull();
  });
});

describe("the tool a player is on survives the doors out", () => {
  it.each(TOOLS.map((tool) => [tool.label, tool] as const))(
    "SHL-26: %s draws its own screen, and only its own",
    async (_label, tool) => {
      await openShell();
      await onTool(tool);
      for (const other of TOOLS) {
        if (other === tool) continue;
        expect(document.querySelector(other.landmark), other.label).toBeNull();
      }
    },
  );

  it("SHL-04: opening a tool by its name from Settings stops a running click", async () => {
    await openShell({ isPlaying: true });
    await onTool(METRONOME);
    await openSettings();
    await openTool(DRILL);
    await expectOnTool(DRILL);
    expect(wasInvoked("set_playing", { playing: false })).toBe(true);
  });
});
