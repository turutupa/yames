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
import { createEvent, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { PresetSidebar, type PresetSidebarHandle } from "./PresetSidebar";
import { setInvokeResponse, DEFAULT_TEST_STATE } from "../../test/mocks";
import { readStylesheet } from "../../test/readStyles";
import { STARTER_JAMS } from "../../jam/jams";
import type { Setlist, Preset } from "../../types";

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

const makeSetlist = (overrides: Partial<Setlist> = {}): Setlist => ({
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
  it("gives the setlist tab a library of setlists and nothing else", async () => {
    // One list per tab. Setlists used to sit above the presets under a
    // PRESETS heading, which needed the word "setlist" on every row to be
    // legible; on a tab of their own the rows say what they are by being
    // the only thing there.
    setInvokeResponse("list_presets", () => [makePreset({ id: "a", name: "Slow Blues" })]);
    const onLoadSetlist = vi.fn();
    const { container } = render(
      <PresetSidebar
        {...baseProps}
        view="setlist"
        setlists={[makeSetlist()]}
        onLoadSetlist={onLoadSetlist}
      />,
    );
    const row = await waitFor(() => {
      const el = container.querySelector(".setlist-item");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(within(row).getByText("Warm-up routine")).toBeInTheDocument();
    expect(within(row).getByText("2 steps")).toBeInTheDocument();
    expect(row.querySelector("svg")).not.toBeNull();

    fireEvent.click(row);
    expect(onLoadSetlist).toHaveBeenCalledWith(expect.objectContaining({ id: "ch1" }));

    // The presets are on their own tab, and so is the button that saves one.
    expect(screen.queryByText("Slow Blues")).toBeNull();
    expect(container.querySelector(".preset-sidebar-add")).toBeNull();
    expect(container.querySelector(".preset-sidebar-title")?.textContent).toBe("Setlists");
  });

  it("keeps setlists off every other tab's library", async () => {
    setInvokeResponse("list_presets", () => []);
    for (const view of ["beat", "drill"] as const) {
      const { container, unmount } = render(
        <PresetSidebar {...baseProps} view={view} setlists={[makeSetlist()]} onLoadSetlist={vi.fn()} />,
      );
      await waitFor(() => expect(container.querySelector(".preset-sidebar-title")).not.toBeNull());
      expect(container.querySelector(".setlist-item")).toBeNull();
      unmount();
    }
  });

  it("gives each tab the opener for the thing that tab holds", async () => {
    // "Save current settings" is the gesture a new user reaches for first,
    // and it means nothing on the setlist tab — there is no preset there to
    // save. Each tab shows one opener, for its own kind of thing.
    setInvokeResponse("list_presets", () => []);
    const onNewSetlist = vi.fn();
    const setlistTab = render(
      <PresetSidebar {...baseProps} view="setlist" setlists={[]} onNewSetlist={onNewSetlist} />,
    );
    await waitFor(() => expect(screen.getByLabelText("New setlist")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("New setlist"));
    expect(onNewSetlist).toHaveBeenCalled();
    expect(document.querySelector(".preset-sidebar-add")).toBeNull();
    setlistTab.unmount();

    render(<PresetSidebar {...baseProps} setlists={[]} onNewSetlist={onNewSetlist} />);
    const add = await waitFor(() => {
      const b = document.querySelector(".preset-sidebar-add") as HTMLButtonElement;
      expect(b).not.toBeNull();
      return b;
    });
    expect(screen.queryByLabelText("New setlist")).toBeNull();
    fireEvent.click(add);
    await waitFor(() => expect(document.querySelector(".preset-sidebar-name-input")).not.toBeNull());
  });

  it("offers rename, duplicate and delete on a right-click", async () => {
    // The same three items in the same order as a jam's menu. A drummer who
    // has duplicated a jam should not have to find out whether a setlist can
    // be duplicated by trying it.
    setInvokeResponse("list_presets", () => []);
    const onDuplicateSetlist = vi.fn();
    const onDeleteSetlist = vi.fn();
    render(
      <PresetSidebar
        {...baseProps}
        view="setlist"
        setlists={[makeSetlist()]}
        onLoadSetlist={vi.fn()}
        onDuplicateSetlist={onDuplicateSetlist}
        onDeleteSetlist={onDeleteSetlist}
      />,
    );
    fireEvent.contextMenu(await screen.findByText("Warm-up routine"));
    const menu = await waitFor(() => {
      const m = document.querySelector(".preset-context-menu");
      expect(m).not.toBeNull();
      return m as HTMLElement;
    });
    expect([...menu.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Rename",
      "Duplicate setlist",
      "Delete setlist",
    ]);
    fireEvent.click(within(menu).getByText("Duplicate setlist"));
    expect(onDuplicateSetlist).toHaveBeenCalledWith("ch1");
    expect(onDeleteSetlist).not.toHaveBeenCalled();
  });
});

describe("PresetSidebar — dragging a setlist in the library", () => {
  /** Five routines, in the order the library holds them. */
  const LIBRARY = [
    makeSetlist({ id: "c0", name: "Warm-up" }),
    makeSetlist({ id: "c1", name: "Evening set" }),
    makeSetlist({ id: "c2", name: "Gig night" }),
    makeSetlist({ id: "c3", name: "Sunday set" }),
    makeSetlist({ id: "c4", name: "Monday drills" }),
  ];

  const setlistProps = { ...baseProps, view: "setlist" as const };
  const transfer = () => ({ effectAllowed: "", dropEffect: "", setData: vi.fn() });

  async function rows(): Promise<HTMLElement[]> {
    return await waitFor(() => {
      const r = [...document.querySelectorAll(".setlist-item")] as HTMLElement[];
      expect(r.length).toBeGreaterThan(2);
      return r;
    });
  }

  it("moves a setlist to the row it was dropped on", async () => {
    // The order is the user's: the routine you warm up on first, the one you
    // finish with. The jam library has said so since JAM_MODE; this is the
    // same gesture, and the owner noticed it was missing here (issue 52).
    setInvokeResponse("list_presets", () => []);
    const onReorderSetlists = vi.fn();
    render(
      <PresetSidebar
        {...setlistProps}
        setlists={LIBRARY}
        onLoadSetlist={vi.fn()}
        onReorderSetlists={onReorderSetlists}
      />,
    );
    const r = await rows();
    const data = transfer();
    fireEvent.dragStart(r[1], { dataTransfer: data });
    // Picked up, and the row it is over — what the styling hangs off.
    expect(r[1].getAttribute("data-dragging")).toBe("");
    fireEvent.dragEnter(r[3]);
    await waitFor(() => expect(r[3].getAttribute("data-drag-over")).toBe(""));
    fireEvent.drop(r[3], { dataTransfer: data });
    expect(onReorderSetlists).toHaveBeenCalledWith(1, 3);

    // And the drag is over: nothing is left marked.
    await waitFor(() => {
      expect(document.querySelector(".setlist-item[data-dragging]")).toBeNull();
      expect(document.querySelector(".setlist-item[data-drag-over]")).toBeNull();
    });
  });

  it("says 'Drag to reorder' on the row, in the user's own words", async () => {
    setInvokeResponse("list_presets", () => []);
    render(<PresetSidebar {...setlistProps} setlists={LIBRARY} onLoadSetlist={vi.fn()} />);
    const r = await rows();
    expect(r[0].getAttribute("title")).toBe("Drag to reorder");
    expect(r[0].getAttribute("draggable")).toBe("true");
  });

  it("reports the library's indices, not the filtered view's", async () => {
    // Dropping the first row of a search result onto the third must move the
    // setlist to the third MATCH's place in the library — the filtered view
    // will not exist a keystroke later.
    setInvokeResponse("list_presets", () => []);
    const onReorderSetlists = vi.fn();
    render(
      <PresetSidebar
        {...setlistProps}
        setlists={LIBRARY}
        onLoadSetlist={vi.fn()}
        onReorderSetlists={onReorderSetlists}
      />,
    );
    const search = await openSearch();
    // "Evening set" (1), "Sunday set" (3) and "Monday drills" (4) match; the
    // first and third rows of the result are library 1 and library 4.
    fireEvent.change(search, { target: { value: "s" } });
    const r = await waitFor(() => {
      const found = [...document.querySelectorAll(".setlist-item")] as HTMLElement[];
      expect(found).toHaveLength(3);
      return found;
    });
    const data = transfer();
    fireEvent.dragStart(r[0], { dataTransfer: data });
    fireEvent.drop(r[2], { dataTransfer: data });
    expect(onReorderSetlists).toHaveBeenCalledWith(1, 4);
  });

  it("will not drag a row that is being renamed", async () => {
    // The row is a text field at that moment, and a drag would take the caret
    // with it. The jam rows guard the same way.
    setInvokeResponse("list_presets", () => []);
    const ref = createRef<PresetSidebarHandle>();
    render(
      <PresetSidebar
        {...setlistProps}
        ref={ref}
        setlists={LIBRARY}
        onLoadSetlist={vi.fn()}
        onReorderSetlists={vi.fn()}
      />,
    );
    await waitFor(() => expect(ref.current).not.toBeNull());
    ref.current?.triggerRenameSetlist("c1");
    await waitFor(() =>
      expect(document.querySelector(".preset-sidebar-name-input")).not.toBeNull(),
    );
    for (const row of await rows()) expect(row.getAttribute("draggable")).toBe("false");
  });

  it("offers the drop only to the kind that is in the hand", async () => {
    // `dragover` is what says "this row will take it": the browser shows the
    // move cursor for it and sends no `drop` without it. A row that accepts
    // everything and then does nothing with most of it is a row that lies.
    setInvokeResponse("list_presets", () => []);
    render(
      <PresetSidebar
        {...setlistProps}
        setlists={LIBRARY}
        onLoadSetlist={vi.fn()}
        onReorderSetlists={vi.fn()}
      />,
    );
    const r = await rows();

    // Nothing of ours in flight — a file from the desktop, a selection, a jam
    // that came from the other tab. The row is not a target.
    const foreign = createEvent.dragOver(r[1], { dataTransfer: transfer() });
    fireEvent(r[1], foreign);
    expect(foreign.defaultPrevented).toBe(false);

    // A setlist in flight, and it is.
    fireEvent.dragStart(r[0], { dataTransfer: transfer() });
    const own = createEvent.dragOver(r[1], { dataTransfer: transfer() });
    fireEvent(r[1], own);
    expect(own.defaultPrevented).toBe(true);
  });

  it("offers a jam row the same answer, for the same reason", async () => {
    setInvokeResponse("list_presets", () => []);
    render(
      <PresetSidebar
        {...baseProps}
        view="jam"
        jams={[...STARTER_JAMS]}
        onLoadJam={vi.fn()}
        onReorderJams={vi.fn()}
      />,
    );
    const j = await waitFor(() => {
      const r = [...document.querySelectorAll(".jam-item")] as HTMLElement[];
      expect(r.length).toBeGreaterThan(2);
      return r;
    });
    const foreign = createEvent.dragOver(j[1], { dataTransfer: transfer() });
    fireEvent(j[1], foreign);
    expect(foreign.defaultPrevented).toBe(false);

    fireEvent.dragStart(j[0], { dataTransfer: transfer() });
    const own = createEvent.dragOver(j[1], { dataTransfer: transfer() });
    fireEvent(j[1], own);
    expect(own.defaultPrevented).toBe(true);
  });

  it("gives a draggable row the grab hand, and keeps it while it is held", async () => {
    /*
     * Only CSS can get this wrong and no render test can see it. The setlist
     * row carried `cursor: pointer` at two simple selectors from a file
     * imported after shell.css, so a rule written there as one class lost —
     * the jam rows showed a hand and the setlist rows a finger, for the same
     * gesture.
     */
    const css = readStylesheet();
    const grab = css.indexOf('.preset-sidebar-item[draggable="true"] {');
    const grabbing = css.indexOf('.preset-sidebar-item[draggable="true"][data-dragging] {');
    expect(grab).toBeGreaterThan(-1);
    expect(grabbing).toBeGreaterThan(-1);
    expect(css.slice(grab, css.indexOf("}", grab))).toContain("cursor: grab");
    expect(css.slice(grabbing, css.indexOf("}", grabbing))).toContain("cursor: grabbing");

    // Nothing later may take the cursor back off a library row. The setlist
    // row's own rule is the one that did.
    const setlistRow = css.indexOf(".preset-sidebar-item.setlist-item {");
    expect(css.slice(setlistRow, css.indexOf("}", setlistRow))).not.toContain("cursor");
    // And the jam row no longer keeps a hand of its own, which it held even
    // while it was being renamed and could not be picked up.
    expect(readStylesheet("jam.css")).not.toContain(".jam-item {");
  });

  /*
   * A setlist and a jam are never dropped on each other.
   *
   * The two libraries live on separate tabs, so the only way to hold a drag
   * open across both is to move the tab out from under it — and moving the tab
   * is what ENDS a drag, because the row it started from is gone and its
   * `dragend` will never fire. So what these check is that nothing is left in
   * the hand, and that the row the drag would have landed on refuses it.
   */
  const bothLibraries = (over: ReturnType<typeof vi.fn>) => ({
    setlists: LIBRARY,
    jams: [...STARTER_JAMS],
    onLoadSetlist: vi.fn(),
    onLoadJam: vi.fn(),
    onReorderSetlists: over,
    onReorderJams: over,
  });

  async function jamRows(): Promise<HTMLElement[]> {
    return await waitFor(() => {
      const r = [...document.querySelectorAll(".jam-item")] as HTMLElement[];
      expect(r.length).toBeGreaterThan(2);
      return r;
    });
  }

  it("leaves a jam behind on the tab it was picked up on", async () => {
    setInvokeResponse("list_presets", () => []);
    const never = vi.fn();
    const props = bothLibraries(never);
    const { rerender } = render(<PresetSidebar {...baseProps} view="jam" {...props} />);
    const data = transfer();
    fireEvent.dragStart((await jamRows())[1], { dataTransfer: data });

    rerender(<PresetSidebar {...baseProps} view="setlist" {...props} />);
    const r = await rows();
    // Nothing is in the hand any more, so no setlist row is a target and none
    // of them can be dropped on.
    expect(document.querySelector("[data-dragging]")).toBeNull();
    fireEvent.dragEnter(r[2]);
    expect(r[2].getAttribute("data-drag-over")).toBeNull();
    fireEvent.drop(r[2], { dataTransfer: data });
    expect(never).not.toHaveBeenCalled();
  });

  it("leaves a setlist behind the same way", async () => {
    setInvokeResponse("list_presets", () => []);
    const never = vi.fn();
    const props = bothLibraries(never);
    const { rerender } = render(<PresetSidebar {...baseProps} view="setlist" {...props} />);
    const data = transfer();
    fireEvent.dragStart((await rows())[0], { dataTransfer: data });

    rerender(<PresetSidebar {...baseProps} view="jam" {...props} />);
    const j = await jamRows();
    expect(document.querySelector("[data-dragging]")).toBeNull();
    fireEvent.dragEnter(j[2]);
    expect(j[2].getAttribute("data-drag-over")).toBeNull();
    fireEvent.drop(j[2], { dataTransfer: data });
    expect(never).not.toHaveBeenCalled();
  });

  it("does not let an abandoned drag haunt the next one", async () => {
    /*
     * `dragend` fires on the row the drag started from, and changing tabs
     * takes that row away — so an id left behind outlived the gesture: the row
     * came back faded when you returned to it, and every later drag in the
     * OTHER library was refused its drop line by a guard reading a drag that
     * was not happening.
     */
    setInvokeResponse("list_presets", () => []);
    const onReorderJams = vi.fn();
    const props = { ...bothLibraries(vi.fn()), onReorderJams };
    const { rerender } = render(<PresetSidebar {...baseProps} view="setlist" {...props} />);
    const abandoned = await rows();
    fireEvent.dragStart(abandoned[0], { dataTransfer: transfer() });

    // Away and back: the row that was in the hand is not still marked.
    rerender(<PresetSidebar {...baseProps} view="jam" {...props} />);
    rerender(<PresetSidebar {...baseProps} view="setlist" {...props} />);
    expect(document.querySelector("[data-dragging]")).toBeNull();

    // And the other library still takes a drag of its own, drop line and all.
    rerender(<PresetSidebar {...baseProps} view="jam" {...props} />);
    const j = await jamRows();
    const data = transfer();
    fireEvent.dragStart(j[0], { dataTransfer: data });
    fireEvent.dragEnter(j[2]);
    await waitFor(() => expect(j[2].getAttribute("data-drag-over")).toBe(""));
    fireEvent.drop(j[2], { dataTransfer: data });
    expect(onReorderJams).toHaveBeenCalledWith(0, 2);
  });
});

describe("PresetSidebar — the jam library", () => {
  const jamProps = { ...baseProps, view: "jam" as const };

  it("lists jams with their tempo and their shape", async () => {
    // "92 · 12-bar" is what tells two blues jams apart in a list of six.
    setInvokeResponse("list_presets", () => []);
    render(<PresetSidebar {...jamProps} jams={[...STARTER_JAMS]} onLoadJam={vi.fn()} />);
    expect(await screen.findByText("Slow blues in A")).toBeInTheDocument();
    expect(screen.getByText("92 · 12-bar")).toBeInTheDocument();
    expect(screen.getByText("Swing in F")).toBeInTheDocument();
    expect(screen.getByText("160 · AABA")).toBeInTheDocument();
  });

  it("titles the panel for the thing it holds", async () => {
    setInvokeResponse("list_presets", () => []);
    const { container } = render(<PresetSidebar {...jamProps} jams={[]} />);
    await waitFor(() =>
      expect(container.querySelector(".preset-sidebar-title")?.textContent).toBe("Jams"),
    );
  });

  it("keeps jams off every other tab's library, and presets off its own", async () => {
    setInvokeResponse("list_presets", () => [makePreset({ name: "Funk Groove" })]);
    for (const view of ["beat", "drill", "setlist"] as const) {
      const { container, unmount } = render(
        <PresetSidebar {...baseProps} view={view} jams={[...STARTER_JAMS]} onLoadJam={vi.fn()} />,
      );
      await waitFor(() => expect(container.querySelector(".preset-sidebar-title")).not.toBeNull());
      expect(container.querySelector(".jam-item")).toBeNull();
      unmount();
    }

    const { container } = render(
      <PresetSidebar {...jamProps} jams={[...STARTER_JAMS]} onLoadJam={vi.fn()} />,
    );
    await waitFor(() => expect(container.querySelector(".jam-item")).not.toBeNull());
    expect(screen.queryByText("Funk Groove")).toBeNull();
  });

  it("gives the jam tab its own opener", async () => {
    setInvokeResponse("list_presets", () => []);
    const onNewJam = vi.fn();
    render(<PresetSidebar {...jamProps} jams={[]} onNewJam={onNewJam} />);
    fireEvent.click(await screen.findByLabelText("New jam"));
    expect(onNewJam).toHaveBeenCalled();
    expect(document.querySelector(".preset-sidebar-add")).toBeNull();
  });

  it("loads the jam whose row was clicked", async () => {
    setInvokeResponse("list_presets", () => []);
    const onLoadJam = vi.fn();
    render(<PresetSidebar {...jamProps} jams={[...STARTER_JAMS]} onLoadJam={onLoadJam} />);
    fireEvent.click(await screen.findByText("Bossa in D minor"));
    expect(onLoadJam).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Bossa in D minor" }),
    );
  });

  it("offers rename, duplicate and delete on a right-click", async () => {
    setInvokeResponse("list_presets", () => []);
    const onDuplicateJam = vi.fn();
    const onDeleteJam = vi.fn();
    render(
      <PresetSidebar
        {...jamProps}
        jams={[...STARTER_JAMS]}
        onLoadJam={vi.fn()}
        onDuplicateJam={onDuplicateJam}
        onDeleteJam={onDeleteJam}
      />,
    );
    fireEvent.contextMenu(await screen.findByText("Rock in G"));
    const menu = await waitFor(() => {
      const m = document.querySelector(".preset-context-menu");
      expect(m).not.toBeNull();
      return m as HTMLElement;
    });
    expect([...menu.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Rename",
      "Duplicate jam",
      "Delete jam",
    ]);
    fireEvent.click(within(menu).getByText("Duplicate jam"));
    expect(onDuplicateJam).toHaveBeenCalled();
  });

  it("reorders by the library's own order, not by the filtered rows", async () => {
    // Dropping row two of a search result onto row four must move the jam to
    // the fourth jam's place in the LIBRARY — the filtered view will not exist
    // a keystroke later.
    setInvokeResponse("list_presets", () => []);
    const onReorderJams = vi.fn();
    render(
      <PresetSidebar
        {...jamProps}
        jams={[...STARTER_JAMS]}
        onLoadJam={vi.fn()}
        onReorderJams={onReorderJams}
      />,
    );
    const search = await openSearch();
    fireEvent.change(search, { target: { value: "in " } });

    const rows = await waitFor(() => {
      const r = [...document.querySelectorAll(".jam-item")];
      expect(r.length).toBeGreaterThan(2);
      return r;
    });
    const data = { effectAllowed: "", dropEffect: "", setData: vi.fn() };
    // "Funk in E" is library index 1; "Swing in F" is library index 3.
    fireEvent.dragStart(rows[1], { dataTransfer: data });
    fireEvent.drop(rows[3], { dataTransfer: data });
    expect(onReorderJams).toHaveBeenCalledWith(1, 3);
  });

  it("says so when a search matches no jam", async () => {
    setInvokeResponse("list_presets", () => []);
    render(<PresetSidebar {...jamProps} jams={[...STARTER_JAMS]} onLoadJam={vi.fn()} />);
    const search = await openSearch();
    fireEvent.change(search, { target: { value: "polka" } });
    expect(await screen.findByText("No results")).toBeInTheDocument();
  });

  it("narrows the library to one style, and back", async () => {
    // Fifty starters is a library, and "the blues ones" is how a player asks
    // for a third of it (JAM_KILLER §2 A3).
    setInvokeResponse("list_presets", () => []);
    const { container } = render(
      <PresetSidebar {...jamProps} jams={[...STARTER_JAMS]} onLoadJam={vi.fn()} />,
    );
    await screen.findByText("Slow blues in A");
    const filter = container.querySelector(".preset-sidebar-filter") as HTMLElement;
    fireEvent.click(within(filter).getByText("Blues"));
    const shown = [...container.querySelectorAll(".jam-item .preset-item-name")].map(
      (n) => n.textContent,
    );
    expect(shown).toContain("Slow blues in A");
    expect(shown).not.toContain("Swing in F");
    expect(shown).toHaveLength(STARTER_JAMS.filter((j) => j.vibe === "blues").length);

    // Tapping the chip again is the way back, and so is "All styles".
    fireEvent.click(within(filter).getByText("Blues"));
    expect(container.querySelectorAll(".jam-item")).toHaveLength(STARTER_JAMS.length);
  });

  it("offers a chip only for a style the library actually holds", async () => {
    // A chip that empties the list is a filter people stop trusting.
    setInvokeResponse("list_presets", () => []);
    const onlyBlues = STARTER_JAMS.filter((j) => j.vibe === "blues");
    const { container } = render(
      <PresetSidebar {...jamProps} jams={[...onlyBlues, STARTER_JAMS[3]]} onLoadJam={vi.fn()} />,
    );
    await screen.findByText("Slow blues in A");
    const chips = [...container.querySelectorAll(".preset-sidebar-chip")].map(
      (c) => c.textContent,
    );
    expect(chips).toEqual(["All styles", "Blues", "Jazz"]);
  });

  it("keeps the style filter off every other tab", async () => {
    setInvokeResponse("list_presets", () => []);
    const { container } = render(
      <PresetSidebar {...baseProps} view="beat" jams={[...STARTER_JAMS]} onLoadJam={vi.fn()} />,
    );
    await waitFor(() => expect(container.querySelector(".preset-sidebar-list")).not.toBeNull());
    expect(container.querySelector(".preset-sidebar-filter")).toBeNull();
  });
});
