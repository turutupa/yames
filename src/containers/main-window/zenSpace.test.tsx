/**
 * Space is Play/Stop in Zen and after a click in a tool (the owner,
 * 2026-11-18: "spacebar for playing on zen mode (when in jam mode) not
 * working").
 *
 * N-P1-1 gave Enter and Space to a focused button when it was reached by
 * keyboard, and read "reached by keyboard" off `:focus-visible`. Chromium
 * starts matching that on a CLICKED button as soon as a key goes down, before
 * the key's listeners run, so every clicked button looked keyboard-focused:
 * the rail's Zen button, clicked, kept focus behind Zen and Space "pressed" it
 * instead of starting the jam. These tests stand in for Chromium by making
 * `:focus-visible` match whatever has focus.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import i18n from "../../i18n";
import { mockInvoke } from "../../test/mocks";
import { onTool, openShell, settle } from "../../test/parity/shell";
import { TOOLS, type Tool } from "../../test/parity/tools";

const [METRONOME, , , JAM] = TOOLS as unknown as [Tool, Tool, Tool, Tool, Tool];
const toggles = () => mockInvoke.mock.calls.filter(([c]) => c === "toggle_playback").length;
const zen = () => document.querySelector(".fullscreen-view");

// Chromium's behaviour on keydown: whatever has focus matches `:focus-visible`.
const realMatches = Element.prototype.matches;
let focusVisible: { mockRestore(): void } | null = null;
beforeEach(() => {
  focusVisible = vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, sel: string) {
    if (sel === ":focus-visible") return document.activeElement === this;
    return realMatches.call(this, sel);
  });
});
afterEach(() => focusVisible?.mockRestore());

/** A mouse click as the browser does it: press, focus, release, click. */
async function mouseClick(el: HTMLElement) {
  await act(async () => {
    fireEvent.pointerDown(el);
    fireEvent.mouseDown(el);
    el.focus();
    fireEvent.pointerUp(el);
    fireEvent.mouseUp(el);
    fireEvent.click(el);
  });
}

/** Space, sent where the browser sends it: to whatever has focus. */
async function space(): Promise<boolean> {
  let notPrevented = true;
  await act(async () => {
    const target = document.activeElement ?? document.body;
    notPrevented = fireEvent.keyDown(target, { key: " ", code: "Space" });
  });
  return notPrevented;
}

async function loadJam() {
  await waitFor(() => {
    if (!document.querySelector(".preset-sidebar-item.jam-item")) throw new Error("no jam library");
  });
  await act(async () => void fireEvent.click(document.querySelector<HTMLElement>(".preset-sidebar-item.jam-item")!));
  await waitFor(() => {
    if (!document.querySelector(".transport-play")) throw new Error("no jam on the stage");
  });
  await settle();
  mockInvoke.mockClear();
}

const zenButton = () => screen.getByRole("button", { name: i18n.t("tooltip.zen") });

describe("Space in Zen, with a jam loaded", () => {
  it("plays and stops after Zen was opened by a click on its button", async () => {
    await openShell({}, { viewTransitions: "off" });
    await onTool(JAM);
    await loadJam();
    await mouseClick(zenButton());
    await waitFor(() => expect(zen()).not.toBeNull());
    expect(await space()).toBe(false);
    await waitFor(() => expect(toggles()).toBe(1));
    expect(await space()).toBe(false);
    await waitFor(() => expect(toggles()).toBe(2));
  });

  it("plays after Zen was opened from its button by keyboard: the button is behind Zen", async () => {
    await openShell({}, { viewTransitions: "off" });
    await onTool(JAM);
    await loadJam();
    const button = zenButton();
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "Tab", code: "Tab" });
      button.focus();
    });
    await act(async () => void fireEvent.click(button));
    await waitFor(() => expect(zen()).not.toBeNull());
    expect(document.activeElement).toBe(button);
    expect(await space()).toBe(false);
    await waitFor(() => expect(toggles()).toBe(1));
  });

  it("plays after Zen was opened on Z, with a clicked jam button still focused", async () => {
    await openShell({}, { viewTransitions: "off" });
    await onTool(JAM);
    await loadJam();
    await mouseClick(document.querySelector<HTMLElement>(".preset-sidebar-item.jam-item")!);
    mockInvoke.mockClear();
    await act(async () => void fireEvent.keyDown(document.activeElement!, { key: "z", code: "KeyZ" }));
    await waitFor(() => expect(zen()).not.toBeNull());
    expect(await space()).toBe(false);
    await waitFor(() => expect(toggles()).toBe(1));
  });
});

describe("Space in a tool after a click", () => {
  it("is still Play on the Metronome after Tempo down was clicked", async () => {
    await openShell();
    await onTool(METRONOME);
    const down = document.querySelector<HTMLElement>(".bpm-section button")!;
    await mouseClick(down);
    mockInvoke.mockClear();
    expect(document.activeElement).toBe(down);
    expect(await space()).toBe(false);
    await waitFor(() => expect(toggles()).toBe(1));
  });

  it("still goes to a button reached by Tab", async () => {
    await openShell();
    await onTool(METRONOME);
    const down = document.querySelector<HTMLElement>(".bpm-section button")!;
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "Tab", code: "Tab" });
      down.focus();
    });
    mockInvoke.mockClear();
    expect(await space()).toBe(true);
    expect(toggles()).toBe(0);
  });
});
