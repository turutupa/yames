/**
 * FREE-mode preset round-trip (PR #11, F8).
 *
 * `stateToPreset` (PresetSidebar) writes `freeMode` into the saved preset and
 * `handleLoadPreset` (MainWindow) restores it. Neither is exported, so the
 * round trip is exercised through the UI: save a preset while free mode is on,
 * then hand the *saved payload* back to MainWindow and load it.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PresetSidebar } from "../../components/presets/PresetSidebar";
import { MainWindow } from "./MainWindow";
import {
  DEFAULT_TEST_STATE,
  mockInvoke,
  setInvokeResponse,
} from "../../test/mocks";
import type { AppState, Preset } from "../../types";

const FREE_STATE: AppState = {
  ...DEFAULT_TEST_STATE,
  freeMode: true,
  beatGroups: [9],
  timeSignature: 9,
};

const sidebarProps = {
  view: "beat" as const,
  isOpen: true,
  onToggle: () => {},
  onLoadPreset: () => {},
  onActiveChange: () => {},
};

/**
 * Save a preset from `state` through the real sidebar; return the payload
 * that reached `save_preset`. Unmounts before returning so a follow-up render
 * (MainWindow) is the only sidebar in the document.
 */
async function savePresetFromState(state: AppState): Promise<Preset> {
  const { unmount } = render(<PresetSidebar {...sidebarProps} state={state} />);
  const addBtn = await waitFor(() => {
    const b = document.querySelector(".preset-sidebar-add") as HTMLButtonElement;
    expect(b).not.toBeNull();
    return b;
  });
  fireEvent.click(addBtn);
  const input = await waitFor(() => {
    const el = document.querySelector(".preset-sidebar-name-input");
    expect(el).not.toBeNull();
    return el as HTMLInputElement;
  });
  fireEvent.change(input, { target: { value: "Free Nine" } });
  fireEvent.keyDown(input, { key: "Enter" });
  const call = await waitFor(() => {
    const c = mockInvoke.mock.calls.find((x) => x[0] === "save_preset");
    expect(c).toBeDefined();
    return c!;
  });
  unmount();
  mockInvoke.mockClear();
  return (call[1] as { preset: Preset }).preset;
}

describe("FREE mode — preset round trip", () => {
  it("saves freeMode and the collapsed beat groups into the preset", async () => {
    const preset = await savePresetFromState(FREE_STATE);
    expect(preset.freeMode).toBe(true);
    expect(preset.beatGroups).toEqual([9]);
    expect(preset.timeSignature).toBe(9);
  });

  it("saves freeMode: false for a grouped meter", async () => {
    const preset = await savePresetFromState({
      ...DEFAULT_TEST_STATE,
      freeMode: false,
      beatGroups: [3, 2, 2],
      timeSignature: 7,
    });
    expect(preset.freeMode).toBe(false);
    expect(preset.beatGroups).toEqual([3, 2, 2]);
  });

  it("restores freeMode and the beat count when the preset is loaded", async () => {
    const preset = await savePresetFromState(FREE_STATE);
    // Fresh window, not in free mode, with the saved preset on disk.
    setInvokeResponse("get_state", () => DEFAULT_TEST_STATE);
    setInvokeResponse("list_presets", () => [preset]);
    render(<MainWindow />);

    const tab = await waitFor(() => {
      const b = document.querySelector(
        ".preset-sidebar-collapsed-tab",
      ) as HTMLButtonElement;
      expect(b).not.toBeNull();
      return b;
    });
    fireEvent.click(tab);

    const item = await screen.findByText("Free Nine");
    fireEvent.click(item);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("set_free_mode", {
        enabled: true,
      }),
    );
    expect(mockInvoke).toHaveBeenCalledWith("set_beat_groups", {
      groups: [9],
    });
  });
});
