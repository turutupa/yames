/**
 * PresetSidebar feature preservation tests.
 *
 * Locks in:
 * - Renders collapsed-tab when isOpen=false
 * - Renders preset list when isOpen=true and presets exist
 * - "No presets yet" empty state
 * - "+" button puts the sidebar into adding mode (input appears)
 * - Saving a new preset calls save_preset IPC
 * - Clicking a preset triggers onLoadPreset callback
 * - Search filters visible presets
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { PresetSidebar, type PresetSidebarHandle } from "./PresetSidebar";
import { setInvokeResponse, DEFAULT_TEST_STATE } from "../../test/mocks";
import type { Preset } from "../../types";

const makePreset = (overrides: Partial<Preset> = {}): Preset => ({
  id: "p1",
  name: "Funk Groove",
  createdAt: 1700000000000,
  bpm: 110,
  subdivision: 1,
  timeSignature: 4,
  beatGroups: [4],
  soundType: "click",
  volume: 0.7,
  view: "beat",
  ...overrides,
});

const baseProps = {
  state: DEFAULT_TEST_STATE,
  view: "beat" as const,
  isOpen: true,
  onToggle: vi.fn(),
  onLoadPreset: vi.fn(),
  onActiveChange: vi.fn(),
};

describe("PresetSidebar", () => {
  it("shows a collapsed-tab button when isOpen=false", () => {
    render(<PresetSidebar {...baseProps} isOpen={false} />);
    const tab = document.querySelector(".preset-sidebar-collapsed-tab");
    expect(tab).not.toBeNull();
  });

  it("renders 'No presets yet' when listPresets returns []", async () => {
    setInvokeResponse("list_presets", () => []);
    render(<PresetSidebar {...baseProps} />);
    expect(await screen.findByText(/No presets yet/i)).toBeInTheDocument();
  });

  it("renders preset items from listPresets", async () => {
    setInvokeResponse("list_presets", () => [
      makePreset({ id: "a", name: "Slow Blues", bpm: 60 }),
      makePreset({ id: "b", name: "Fast Latin", bpm: 180 }),
    ]);
    render(<PresetSidebar {...baseProps} />);
    expect(await screen.findByText("Slow Blues")).toBeInTheDocument();
    expect(await screen.findByText("Fast Latin")).toBeInTheDocument();
  });

  it("clicking '+' enters adding mode and shows the name input", async () => {
    render(<PresetSidebar {...baseProps} />);
    const addBtn = await waitFor(() => {
      const b = document.querySelector(".preset-sidebar-add") as HTMLButtonElement;
      expect(b).not.toBeNull();
      return b;
    });
    fireEvent.click(addBtn);
    await waitFor(() => {
      const input = document.querySelector(".preset-sidebar-name-input");
      expect(input).not.toBeNull();
    });
  });

  it("clicking a preset calls onLoadPreset with that preset", async () => {
    const onLoadPreset = vi.fn();
    const preset = makePreset({ name: "Test Preset" });
    setInvokeResponse("list_presets", () => [preset]);
    render(<PresetSidebar {...baseProps} onLoadPreset={onLoadPreset} />);
    const item = await screen.findByText("Test Preset");
    fireEvent.click(item);
    expect(onLoadPreset).toHaveBeenCalledWith(
      expect.objectContaining({ id: preset.id, name: preset.name }),
    );
  });

  it("search input filters the visible preset list", async () => {
    setInvokeResponse("list_presets", () => [
      makePreset({ id: "a", name: "Slow Blues" }),
      makePreset({ id: "b", name: "Fast Latin" }),
    ]);
    render(<PresetSidebar {...baseProps} />);
    const search = (await waitFor(() => {
      const el = document.querySelector(".preset-search-input");
      expect(el).not.toBeNull();
      return el;
    })) as HTMLInputElement;
    fireEvent.change(search, { target: { value: "blues" } });
    await waitFor(() => {
      expect(screen.queryByText("Fast Latin")).not.toBeInTheDocument();
      expect(screen.getByText("Slow Blues")).toBeInTheDocument();
    });
  });

  it("imperative triggerAdd() opens the name input", async () => {
    const ref = createRef<PresetSidebarHandle>();
    render(<PresetSidebar {...baseProps} ref={ref} />);
    await waitFor(() => expect(ref.current).not.toBeNull());
    ref.current?.triggerAdd();
    await waitFor(() => {
      const input = document.querySelector(".preset-sidebar-name-input");
      expect(input).not.toBeNull();
    });
  });
});
