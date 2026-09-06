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
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { PresetSidebar, type PresetSidebarHandle } from "./PresetSidebar";
import { setInvokeResponse, DEFAULT_TEST_STATE } from "../../test/mocks";
import type { Chain, Preset } from "../../types";

const makePreset = (overrides: Partial<Preset> = {}): Preset => ({
  id: "p1",
  name: "Funk Groove",
  createdAt: 1700000000000,
  bpm: 110,
  subdivision: 1,
  timeSignature: 4,
  beatGroups: [4],
  freeMode: false,
  soundType: "click",
  volume: 0.7,
  view: "beat",
  ...overrides,
});

const makeChain = (overrides: Partial<Chain> = {}): Chain => ({
  id: "ch1",
  name: "Warm-up routine",
  createdAt: 1700000000000,
  repeat: 1,
  steps: [
    {
      id: "s1",
      name: "Loosen up",
      bpm: 70,
      subdivision: 1,
      beatGroups: [4],
      freeMode: false,
      soundType: "click",
      volume: 0.7,
      trigger: { kind: "bars", bars: 8 },
      transition: { kind: "cut" },
    },
    {
      id: "s2",
      name: "Alt picking",
      bpm: 96,
      subdivision: 4,
      beatGroups: [4],
      freeMode: false,
      soundType: "wood",
      volume: 0.7,
      trigger: { kind: "manual" },
      transition: { kind: "cut" },
    },
  ],
  ...overrides,
});

const baseProps = {
  state: DEFAULT_TEST_STATE,
  view: "beat" as const,
  isOpen: true,
  onLoadPreset: vi.fn(),
  onActiveChange: vi.fn(),
};

/** The field is behind the header's magnifier now, not a permanent row. */
async function openSearch(): Promise<HTMLInputElement> {
  const toggle = await waitFor(() => {
    const b = document.querySelector(".preset-sidebar-search-btn") as HTMLButtonElement;
    expect(b).not.toBeNull();
    return b;
  });
  fireEvent.click(toggle);
  return (await waitFor(() => {
    const el = document.querySelector(".preset-search-input");
    expect(el).not.toBeNull();
    return el;
  })) as HTMLInputElement;
}

describe("PresetSidebar", () => {
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
    const search = await openSearch();
    fireEvent.change(search, { target: { value: "blues" } });
    await waitFor(() => {
      expect(screen.queryByText("Fast Latin")).not.toBeInTheDocument();
      expect(screen.getByText("Slow Blues")).toBeInTheDocument();
    });
  });

  it("puts the field away and unfilters the list with it", async () => {
    // A list still narrowed by a query you can no longer see is a list that
    // looks broken — which is the failure mode a hidden field invites.
    setInvokeResponse("list_presets", () => [
      makePreset({ id: "a", name: "Slow Blues" }),
      makePreset({ id: "b", name: "Fast Latin" }),
    ]);
    render(<PresetSidebar {...baseProps} />);
    const search = await openSearch();
    fireEvent.change(search, { target: { value: "blues" } });
    await waitFor(() => expect(screen.queryByText("Fast Latin")).not.toBeInTheDocument());

    fireEvent.click(document.querySelector(".preset-sidebar-search-btn")!);
    await waitFor(() => {
      expect(document.querySelector(".preset-search-input")).toBeNull();
      expect(screen.getByText("Fast Latin")).toBeInTheDocument();
    });
  });

  it("says tempo and meter, and marks the one that is loaded", async () => {
    // Tempo alone does not separate two presets a player keeps at the same
    // speed in different meters, which is the pair worth telling apart.
    setInvokeResponse("list_presets", () => [
      makePreset({ id: "a", name: "Warmup", bpm: 130, beatGroups: [3, 3] }),
    ]);
    const { container } = render(<PresetSidebar {...baseProps} />);
    expect(await screen.findByText("130 · 6/8")).toBeInTheDocument();

    // Every row carries the marker so the names align; loading paints it.
    expect(container.querySelector(".preset-sidebar-item .preset-item-dot")).not.toBeNull();
    expect(container.querySelector(".preset-sidebar-item.active")).toBeNull();
    fireEvent.click(screen.getByText("Warmup"));
    await waitFor(() =>
      expect(container.querySelector(".preset-sidebar-item.active .preset-item-dot")).not.toBeNull(),
    );
  });

  it("says FREE where there is no signature to print", async () => {
    setInvokeResponse("list_presets", () => [
      makePreset({ id: "a", name: "Loose", bpm: 90, freeMode: true }),
    ]);
    render(<PresetSidebar {...baseProps} />);
    expect(await screen.findByText("90 · FREE")).toBeInTheDocument();
  });

  it("titles the library for the mode it is listing", async () => {
    setInvokeResponse("list_presets", () => []);
    const { rerender } = render(<PresetSidebar {...baseProps} />);
    expect(document.querySelector(".preset-sidebar-title")?.textContent).toBe("Presets");
    rerender(<PresetSidebar {...baseProps} view="drill" />);
    expect(document.querySelector(".preset-sidebar-title")?.textContent).toBe("Drills");
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
  it("lists chains beside the presets, with a glyph and a step count (U9.4)", async () => {
    // "Chain" is vague in isolation and precise here: in a list headed
    // PRESETS, beside presets, the word says exactly what the row is.
    setInvokeResponse("list_presets", () => [makePreset({ id: "a", name: "Slow Blues" })]);
    const onLoadChain = vi.fn();
    const { container } = render(
      <PresetSidebar {...baseProps} chains={[makeChain()]} onLoadChain={onLoadChain} />,
    );
    const row = await waitFor(() => {
      const el = container.querySelector(".chain-item");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(within(row).getByText("Warm-up routine")).toBeInTheDocument();
    expect(within(row).getByText("chain · 2 steps")).toBeInTheDocument();
    expect(row.querySelector("svg")).not.toBeNull();

    // A preset still loads a preset; a chain loads a chain.
    fireEvent.click(row);
    expect(onLoadChain).toHaveBeenCalledWith(expect.objectContaining({ id: "ch1" }));
    fireEvent.click(screen.getByText("Slow Blues"));
    expect(baseProps.onLoadPreset).toHaveBeenCalled();
  });

  it("only the metronome list carries chains", async () => {
    // A step is a metronome configuration; a drill is a ramp the chain
    // runtime has no way to run.
    setInvokeResponse("list_presets", () => []);
    const { container } = render(
      <PresetSidebar {...baseProps} view="drill" chains={[makeChain()]} onLoadChain={vi.fn()} />,
    );
    await waitFor(() => expect(container.querySelector(".preset-sidebar-title")).not.toBeNull());
    expect(container.querySelector(".chain-item")).toBeNull();
  });

  it("keeps a separate opener for a new chain", async () => {
    // Overloading the "+" would put a menu in front of the gesture a new
    // user reaches for first.
    setInvokeResponse("list_presets", () => []);
    const onNewChain = vi.fn();
    render(<PresetSidebar {...baseProps} chains={[]} onNewChain={onNewChain} />);
    const add = await waitFor(() => {
      const b = document.querySelector(".preset-sidebar-add") as HTMLButtonElement;
      expect(b).not.toBeNull();
      return b;
    });
    fireEvent.click(screen.getByLabelText("New chain"));
    expect(onNewChain).toHaveBeenCalled();
    fireEvent.click(add);
    await waitFor(() => expect(document.querySelector(".preset-sidebar-name-input")).not.toBeNull());
  });
});
