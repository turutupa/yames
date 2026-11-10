/**
 * Help, the header's overflow and the tour: the shell's ways of explaining itself.
 *
 * A Today-first shell rebuilds the header and moves the tools behind a door, and the
 * tour walks a player across the Metronome and the Drill by switching tabs, so these
 * are where the revamp is likeliest to leave a player somewhere other than where they
 * started. Test names carry their TOOLS_PARITY.md rows (see src/test/parity/COVERAGE.md).
 */
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { IS_MAC } from "../../hotkeys";
import { HINT_IDS } from "./hints";
import { hintShownKey } from "./hints/types";
import i18n from "../../i18n";
import { onTool, openSettings, openShell, settle } from "../../test/parity/shell";
import { expectOnTool, TOOLS, type Tool } from "../../test/parity/tools";

const [METRONOME, , DRILL, JAM] = TOOLS as unknown as [Tool, Tool, Tool, Tool, Tool];
const t = (key: string) => i18n.t(key);

/** The header's own overflow. Settings draws more "More" buttons of its own. */
const moreButton = () => {
  const el = document.querySelector<HTMLElement>(".header-more-wrap > button[aria-haspopup='menu']");
  if (!el) throw new Error("the header has no overflow button");
  expect(el.getAttribute("aria-label")).toBe(t("tooltip.more"));
  return el;
};
const menuItem = (labelKey: string) =>
  [...document.querySelectorAll<HTMLElement>(".header-more-wrap [role='menuitem']")].find(
    (b) => b.textContent === t(labelKey),
  );
/** Every one-time hint already shown: a hint card takes the first Escape (ONB-23). */
const HINTS_SEEN = Object.fromEntries(HINT_IDS.map((id) => [hintShownKey(id), true]));

const helpMenu = () => screen.queryByTestId("help-menu");
const tour = () => screen.queryByTestId("tour-overlay");

function pressHelpShortcut(target: EventTarget = document.body) {
  fireEvent.keyDown(target, { key: "/", metaKey: IS_MAC, ctrlKey: !IS_MAC });
}

async function openHelpFromOverflow() {
  fireEvent.click(moreButton());
  await waitFor(() => expect(menuItem("tooltip.help")).toBeDefined());
  await settle();
  fireEvent.click(menuItem("tooltip.help")!);
  await waitFor(() => expect(helpMenu()).not.toBeNull());
}

function helpItem(labelKey: string): HTMLElement {
  const item = [...document.querySelectorAll<HTMLElement>(".help-menu-item")].find((b) =>
    b.textContent?.includes(t(labelKey)),
  );
  if (!item) throw new Error(`no help item "${t(labelKey)}"`);
  return item;
}

describe("the header's overflow", () => {
  it("SHL-21: opens, and Escape closes it without closing the tool behind it", async () => {
    await openShell({}, HINTS_SEEN);
    await onTool(JAM);
    fireEvent.click(moreButton());
    await waitFor(() => expect(moreButton().getAttribute("aria-expanded")).toBe("true"));
    expect(menuItem("tooltip.share")).toBeDefined();
    // Its Escape listener is an effect of being open: let it attach.
    await settle();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(moreButton().getAttribute("aria-expanded")).toBe("false"));
    await expectOnTool(JAM);
  });

  it("SHL-21: a click outside closes it", async () => {
    await openShell();
    await onTool(METRONOME);
    fireEvent.click(moreButton());
    await waitFor(() => expect(moreButton().getAttribute("aria-expanded")).toBe("true"));
    await settle();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(moreButton().getAttribute("aria-expanded")).toBe("false"));
  });

  it.each(TOOLS.map((tool) => [tool.label, tool] as const))(
    "SHL-23: holds Help on %s",
    async (_label, tool) => {
      await openShell();
      await onTool(tool);
      await openHelpFromOverflow();
    },
  );

  it("SHL-23: holds no Help on Settings", async () => {
    await openShell();
    await openSettings();
    fireEvent.click(moreButton());
    await waitFor(() => expect(menuItem("tooltip.share")).toBeDefined());
    expect(menuItem("tooltip.help")).toBeUndefined();
  });
});

describe("the Help menu", () => {
  it("KEY-15: Cmd or Ctrl and / opens it, and the same again closes it", async () => {
    await openShell();
    await onTool(METRONOME);
    pressHelpShortcut();
    await waitFor(() => expect(helpMenu()).not.toBeNull());
    pressHelpShortcut();
    await waitFor(() => expect(helpMenu()).toBeNull());
  });

  it("KEY-15: stands aside in a text field", async () => {
    await openShell();
    const input = document.createElement("input");
    document.body.appendChild(input);
    try {
      pressHelpShortcut(input);
      await settle(10);
      expect(helpMenu()).toBeNull();
    } finally {
      input.remove();
    }
  });

  it("ONB-28: offers the tour, setup again and the shortcuts", async () => {
    await openShell();
    await onTool(METRONOME);
    await openHelpFromOverflow();
    helpItem("onboarding.help.takeTour");
    helpItem("onboarding.help.runSetup");
    helpItem("onboarding.help.shortcuts");
  });

  it("ONB-17: Run setup again opens the wizard", async () => {
    await openShell();
    await onTool(METRONOME);
    await openHelpFromOverflow();
    fireEvent.click(helpItem("onboarding.help.runSetup"));
    await waitFor(() => expect(screen.queryByTestId("onboarding-overlay")).not.toBeNull());
  });

  it("KEY-14: Keyboard shortcuts opens the read-only sheet", async () => {
    await openShell();
    await openHelpFromOverflow();
    fireEvent.click(helpItem("onboarding.help.shortcuts"));
    const sheet = await waitFor(() => {
      const el = screen.queryByTestId("shortcuts-sheet");
      expect(el).not.toBeNull();
      return el!;
    });
    // Read-only: the table is there, and none of its keys is a button to rebind.
    expect(sheet.textContent).toContain(t("settings.hotkeys.actions.tab-3"));
    expect(sheet.querySelectorAll(".keybinding-btn, .hotkey-key-btn")).toHaveLength(0);
  });
});

describe("the tour", () => {
  const next = () =>
    [...document.querySelectorAll<HTMLElement>(".tour-btn-primary")].find(
      (b) => b.textContent === t("onboarding.tour.next"),
    )!;
  const skip = () =>
    [...document.querySelectorAll<HTMLElement>(".tour-btn")].find(
      (b) => b.textContent === t("onboarding.tour.skip"),
    )!;

  async function startTourFrom(tool: Tool) {
    const shell = await openShell({}, { "tour.seenVersion": undefined });
    await onTool(tool);
    await openHelpFromOverflow();
    fireEvent.click(helpItem("onboarding.help.takeTour"));
    await waitFor(() => expect(tour()).not.toBeNull());
    return shell;
  }

  /** Walk forward to the stop that lives on the Drill. */
  async function toDrillStop() {
    for (let i = 0; i < 3; i++) {
      fireEvent.click(next());
      await settle(5);
    }
    await expectOnTool(DRILL);
  }

  it("ONB-19, ONB-20: starts from Help and visits the Drill at its fourth stop", async () => {
    await startTourFrom(METRONOME);
    await toDrillStop();
  });

  it("ONB-22: skipping it puts the player back on the tool they started on", async () => {
    const { store } = await startTourFrom(JAM);
    await toDrillStop();
    fireEvent.click(skip());
    await waitFor(() => expect(tour()).toBeNull());
    await expectOnTool(JAM);
    expect(store.values.get("tour.seenVersion")).toBeDefined();
  });

  it("ONB-22: Escape ends it the same way", async () => {
    const { store } = await startTourFrom(JAM);
    await toDrillStop();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(tour()).toBeNull());
    await expectOnTool(JAM);
    expect(store.values.get("tour.seenVersion")).toBeDefined();
  });

  // TOOLS_PARITY section 6.1 item 8: the Drill stop names `tab-2`, which has been
  // Setlist since the tabs were renumbered. Flip to `it` when stops.ts says `tab-3`.
  it.fails("ONB-19 (gap): the Drill stop shows the Drill's own key", async () => {
    await startTourFrom(METRONOME);
    await toDrillStop();
    const keys = [...document.querySelectorAll(".tour-key")].map((k) => k.textContent ?? "");
    expect(keys.join(" ")).toMatch(/3/);
  });
});
