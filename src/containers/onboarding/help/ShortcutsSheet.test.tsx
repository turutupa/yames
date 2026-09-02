/**
 * The shortcuts sheet is the Settings hotkeys table with the teeth pulled: the
 * same rows (so it can never drift), but nothing you can click into a capture
 * modal, and none of the edit-mode affordances.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShortcutsSheet } from "./ShortcutsSheet";
import { HOTKEYS } from "../../../hotkeys";
import type { UseMidiReturn } from "../../../hooks/useMidi";

const midi: UseMidiReturn = {
  devices: [],
  bindings: [],
  connectedDevice: null,
  lastActivity: null,
  learnMode: null,
  pendingConflict: null,
  connect: async () => {},
  disconnect: async () => {},
  refreshDevices: async () => {},
  startLearn: vi.fn(),
  cancelLearn: vi.fn(),
  removeBinding: async () => {},
  acceptConflict: async () => {},
  rejectConflict: () => {},
};

const base = {
  open: true,
  onClose: () => {},
  keyBindings: { play: "Space", "toggle-sidebar": "B" } as Record<string, string>,
  globalBindings: {} as Record<string, string>,
  footBindings: {} as Record<string, string>,
  midi,
};

describe("ShortcutsSheet", () => {
  it("renders nothing when closed", () => {
    render(<ShortcutsSheet {...base} open={false} />);
    expect(screen.queryByTestId("shortcuts-sheet")).toBeNull();
  });

  it("lists every hotkey the Settings table lists", () => {
    render(<ShortcutsSheet {...base} />);
    // One row per HOTKEYS entry — the shared component, not a copy.
    expect(screen.getAllByText("Space").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".hotkey-row").length).toBe(HOTKEYS.length);
  });

  it("is read-only: no capture, no test-inputs, no reset", async () => {
    const user = userEvent.setup();
    render(<ShortcutsSheet {...base} />);
    expect(screen.queryByText(/test inputs/i)).toBeNull();
    expect(screen.queryByText(/reset to defaults/i)).toBeNull();

    for (const btn of Array.from(
      document.querySelectorAll<HTMLButtonElement>(".hotkey-bind-btn"),
    )) {
      expect(btn).toBeDisabled();
    }
    // Clicking a binding must not start MIDI learn mode.
    const first = document.querySelector<HTMLButtonElement>(".hotkey-bind-btn")!;
    await user.click(first);
    expect(midi.startLearn).not.toHaveBeenCalled();
  });

  it("states the always-on-top default", () => {
    render(<ShortcutsSheet {...base} />);
    expect(screen.getByText(/stays above other windows/i)).toBeInTheDocument();
  });

  it("offers Back only when the caller can go back", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const { unmount } = render(<ShortcutsSheet {...base} onBack={onBack} />);
    await user.click(screen.getByRole("button", { name: /^back$/i }));
    expect(onBack).toHaveBeenCalled();
    unmount();

    render(<ShortcutsSheet {...base} />);
    expect(screen.queryByRole("button", { name: /^back$/i })).toBeNull();
  });

  it("closes on Escape and on the backdrop", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { unmount } = render(<ShortcutsSheet {...base} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    const onCloseBackdrop = vi.fn();
    render(<ShortcutsSheet {...base} onClose={onCloseBackdrop} />);
    await user.click(screen.getByTestId("shortcuts-sheet"));
    expect(onCloseBackdrop).toHaveBeenCalledTimes(1);
  });
});
