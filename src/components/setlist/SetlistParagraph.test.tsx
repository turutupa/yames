import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SetlistParagraph } from "./SetlistParagraph";
import type { Setlist, SetlistStep } from "../../types";

/**
 * The setlist, with every step open.
 *
 * It was one line per step and the clicked one expanded to 191px. That
 * answered "which step am I editing" and not "how does this routine go" —
 * the owner: "clicking on each step to verify how they are transitioning in
 * between is annoying". Expanding at editing size measured 2,443px for twelve
 * steps and showed three at a time, so the SIZE came down instead: the same
 * sentence at reading size, about 75px, with nothing collapsed and nothing
 * that grows.
 *
 * These assert what that buys — every step readable and editable without a
 * click, and a layout that never changes under you — plus the one thing the
 * mockup got wrong, which is that a setlist where every step looks identical
 * has nothing to point at when the transport says "Start at step 3".
 */

function step(over: Partial<SetlistStep> & { id: string; name: string }): SetlistStep {
  return {
    bpm: 96,
    subdivision: 4,
    beatGroups: [4],
    freeMode: false,
    soundType: "wood",
    volume: 0.7,
    trigger: { kind: "bars", bars: 8 },
    transition: { kind: "cut" },
    ...over,
  };
}

const SETLIST: Setlist = {
  id: "c1",
  name: "Warm-up routine",
  createdAt: 0,
  repeat: 1,
  steps: [
    step({ id: "s1", name: "Loosen up", bpm: 70, subdivision: 1 }),
    step({
      id: "s2",
      name: "Alt picking",
      trigger: { kind: "seconds", seconds: 120 },
      transition: { kind: "countIn", bars: 2 },
    }),
    step({
      id: "s3",
      name: "Odd meter",
      bpm: 88,
      subdivision: 2,
      beatGroups: [3, 2, 2],
      trigger: { kind: "manual" },
    }),
  ],
};

function draw(over: Partial<Parameters<typeof SetlistParagraph>[0]> = {}) {
  return render(
    <SetlistParagraph
      setlist={SETLIST}
      selectedStepId="s1"
      onSelectStep={() => {}}
      runningIndex={-1}
      onChange={() => {}}
      onPatchStep={() => {}}
      onAddStep={() => {}}
      {...over}
    />,
  );
}

const blocks = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".setlist-step")];
const grips = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".setlist-step-grip")];
const names = (setlist: Setlist) => setlist.steps.map((s) => s.name);

/** What a DragEvent carries, for jsdom, which has no drag of its own. */
function transfer() {
  return { effectAllowed: "", dropEffect: "", setData: vi.fn(), getData: () => "" };
}

/**
 * A drag event with a pointer position on it.
 *
 * jsdom implements no `DragEvent`, so `fireEvent.dragOver` falls back to a
 * bare `Event` and quietly drops `clientY` — which is the one thing the drop
 * line is decided by, so a test written the easy way would pass whatever the
 * pointer did. A real `DragEvent` extends `MouseEvent`; this builds that.
 */
function dragEvent(
  type: "dragover" | "drop",
  row: HTMLElement,
  clientY: number,
  data: ReturnType<typeof transfer>,
) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
  Object.defineProperty(event, "dataTransfer", { value: data });
  fireEvent(row, event);
}

/** A row's box, so the drop line can be asked which half the pointer is in. */
function boxed(row: HTMLElement, top = 100, height = 40) {
  row.getBoundingClientRect = () =>
    ({ top, height, bottom: top + height, left: 0, right: 100, width: 100, x: 0, y: top }) as DOMRect;
}

describe("every step is open", () => {
  it("draws all of them, not one", () => {
    const { container } = draw();
    expect(blocks(container)).toHaveLength(3);
    expect(container.querySelectorAll(".setlist-sentence-folded")).toHaveLength(3);
  });

  it("says the whole routine without a click, handovers included", () => {
    const { container } = draw();
    const text = container.textContent ?? "";
    for (const said of ["Loosen up", "Alt picking", "Odd meter", "70", "96", "88"]) {
      expect(text).toContain(said);
    }
    // The complaint this exists for: every handover, at the same time.
    expect(text).toContain("8 bars");
    expect(text).toContain("2 min");
    expect(text).toContain("when I say");
    expect(text).toContain("count in 2 bars");
  });

  it("makes the phrases reachable on every step, not just the selected one", () => {
    // A phrase you can read but not press would be the collapsed row again
    // with extra steps.
    const { container } = draw({ selectedStepId: "s1" });
    for (const block of blocks(container)) {
      expect(within(block).getAllByRole("button").length).toBeGreaterThan(4);
    }
  });

  it("routes an edit through onPatchStep, which is what reaches the engine", async () => {
    const onPatchStep = vi.fn();
    const onChange = vi.fn();
    const { container } = draw({ onPatchStep, onChange });
    const third = blocks(container)[2];
    await userEvent.click(within(third).getByText("eighth").closest("button")!);
    await userEvent.click(await screen.findByText("Quarter"));
    expect(onPatchStep).toHaveBeenCalledWith("s3", { subdivision: 1 });
    // `onChange` replaces the whole setlist and does NOT reach the engine.
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("which step Start will begin on", () => {
  it("marks the selected one, and only it", () => {
    // The mockup drew every step accented, which left "Start at step 3" with
    // nothing on screen to point at.
    const { container } = draw({ selectedStepId: "s2" });
    const selected = container.querySelectorAll(".setlist-step.selected");
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain("Alt picking");
  });

  it("selects a step when you click one you are not on", () => {
    const onSelectStep = vi.fn();
    const { container } = draw({ selectedStepId: "s1", onSelectStep });
    blocks(container)[2].click();
    expect(onSelectStep).toHaveBeenCalledWith("s3");
  });

  it("marks the running step separately from the selected one", () => {
    // Leaving the player does not stop the run, so both marks exist at once
    // and they are not the same mark.
    const { container } = draw({ selectedStepId: "s3", runningIndex: 0 });
    const running = container.querySelector(".setlist-step.running")!;
    const selected = container.querySelector(".setlist-step.selected")!;
    expect(running.textContent).toContain("Loosen up");
    expect(selected.textContent).toContain("Odd meter");
    expect(running).not.toBe(selected);
  });
});

describe("nothing grows", () => {
  it("gives every step its tools, so a row cannot change height by gaining them", () => {
    // The cards reserved 31px apiece for buttons invisible until hover. These
    // are drawn on every step and revealed with opacity — same reservation,
    // no height.
    const { container } = draw();
    for (const block of blocks(container)) {
      const tools = block.querySelector<HTMLElement>(".setlist-step-tools")!;
      expect(within(tools).getAllByRole("button")).toHaveLength(4);
    }
  });

  it("keeps the tools working without selecting the step they sit on", () => {
    const onChange = vi.fn();
    const onSelectStep = vi.fn();
    const { container } = draw({ selectedStepId: "s1", onChange, onSelectStep });
    const third = blocks(container)[2];
    within(third).getByRole("button", { name: "Remove this step" }).click();
    expect(onChange).toHaveBeenCalled();
    // Removing a step is not a request to edit it.
    expect(onSelectStep).not.toHaveBeenCalled();
  });
});

describe("the rest of the paragraph", () => {
  it("offers the way back to the player only while something is playing", async () => {
    const onBackToPlaying = vi.fn();
    const props = {
      setlist: SETLIST,
      selectedStepId: "s1",
      onSelectStep: () => {},
      onChange: () => {},
      onPatchStep: () => {},
      onAddStep: () => {},
      onBackToPlaying,
    };
    const { rerender } = render(<SetlistParagraph {...props} runningIndex={-1} />);
    expect(screen.queryByText("Back to playing")).toBeNull();

    rerender(<SetlistParagraph {...props} runningIndex={1} />);
    await userEvent.click(screen.getByText("Back to playing"));
    expect(onBackToPlaying).toHaveBeenCalled();
  });

  it("an empty setlist says what a setlist is", () => {
    draw({ setlist: { ...SETLIST, steps: [] }, selectedStepId: null });
    expect(screen.getByText(/plays your steps in order/i)).toBeTruthy();
    expect(screen.getByText("+ Add a step")).toBeTruthy();
  });
});

describe("a step is a control, not a div that happens to be clickable", () => {
  it("says so in the DOM, which is what Windows clicks depend on", () => {
    /*
     * `useDrag` decides on mousedown whether the pointer is on a control or
     * on window furniture, and it decides for the whole document. A bare
     * `div` with an `onClick` fails that test, so on Windows `startDragging()`
     * takes the mouse and the click never lands; macOS survives it because
     * `startDragging()` rejects on a focused undecorated window.
     *
     * This is the second clickable `div` in this project to cost a
     * Windows-only bug. The assertion is cheap and the bug is invisible on
     * the machine most of this was written on.
     */
    const { container } = draw();
    for (const block of container.querySelectorAll<HTMLElement>(".setlist-step")) {
      expect(block.getAttribute("role")).toBe("button");
      expect(block.getAttribute("tabindex")).toBe("0");
    }
  });

  it("selects from the keyboard as well as the pointer", () => {
    const onSelectStep = vi.fn();
    const { container } = draw({ selectedStepId: "s1", onSelectStep });
    const third = [...container.querySelectorAll<HTMLElement>(".setlist-step")][2];
    third.focus();
    third.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onSelectStep).toHaveBeenCalledWith("s3");
  });
});

describe("the jam picker at the foot of the list", () => {
  const JAMS = [
    { id: "j1", name: "Slow blues in A" },
    { id: "j2", name: "Bossa" },
  ] as unknown as Parameters<typeof SetlistParagraph>[0]["jams"];

  it("takes Escape for itself, so the setlist behind it stays open", async () => {
    // The window closes the loaded setlist on Escape. One press used to shut
    // this picker and walk straight through that door as well, so changing
    // your mind about adding a jam threw you out of the routine.
    const user = userEvent.setup();
    draw({ jams: JAMS, onAddJamStep: vi.fn() });
    await user.click(screen.getByRole("button", { name: /jam/i }));
    expect(screen.getByRole("menuitem", { name: /Slow blues in A/ })).toBeTruthy();

    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    fireEvent(document, escape);
    expect(screen.queryByRole("menuitem", { name: /Slow blues in A/ })).toBeNull();
    expect(escape.defaultPrevented).toBe(true);
  });
});

describe("dragging a step by its handle", () => {
  it("gives every row a handle, and it is the handle that is draggable", () => {
    // Not the row. A selected row opens into a sentence of inputs, and a drag
    // that began on a tempo field would carry the step off while you were
    // trying to select text in it.
    const { container } = draw();
    expect(grips(container)).toHaveLength(3);
    for (const grip of grips(container)) {
      expect(grip.getAttribute("draggable")).toBe("true");
      expect(grip.getAttribute("title")).toBe("Drag to reorder");
    }
    for (const row of blocks(container)) {
      expect(row.getAttribute("draggable")).toBeNull();
    }
  });

  it("moves the step to where the line was", () => {
    const onChange = vi.fn();
    const { container } = draw({ onChange });
    const rows = blocks(container);
    const data = transfer();
    boxed(rows[2]);
    fireEvent.dragStart(grips(container)[0], { dataTransfer: data });
    // Firefox refuses to start a drag with nothing on the transfer.
    expect(data.setData).toHaveBeenCalledWith("text/plain", "s1");
    dragEvent("dragover", rows[2], 135, data);
    dragEvent("drop", rows[2], 135, data);
    expect(names(onChange.mock.calls[0][0])).toEqual(["Alt picking", "Odd meter", "Loosen up"]);
  });

  it("puts the line on the half of the row the pointer is in", () => {
    // A line between rows, not a filled row: "after this one" and "instead of
    // this one" are different answers.
    const onChange = vi.fn();
    const { container } = draw({ onChange });
    const rows = blocks(container);
    const data = transfer();
    boxed(rows[2]);

    fireEvent.dragStart(grips(container)[0], { dataTransfer: data });
    dragEvent("dragover", rows[2], 110, data);
    expect(rows[2].getAttribute("data-drop")).toBe("before");
    expect(rows[0].getAttribute("data-dragging")).toBe("");

    dragEvent("dragover", rows[2], 135, data);
    expect(rows[2].getAttribute("data-drop")).toBe("after");

    // The upper half means "in front of this one", which for step three is
    // where step two already ends.
    dragEvent("dragover", rows[2], 110, data);
    dragEvent("drop", rows[2], 110, data);
    expect(names(onChange.mock.calls[0][0])).toEqual(["Alt picking", "Loosen up", "Odd meter"]);
  });

  it("draws no line on the rows that are moving, and a drop on one does nothing", () => {
    const onChange = vi.fn();
    const { container } = draw({ onChange });
    const rows = blocks(container);
    const data = transfer();
    fireEvent.dragStart(grips(container)[0], { dataTransfer: data });
    dragEvent("dragover", rows[0], 110, data);
    expect(rows[0].getAttribute("data-drop")).toBeNull();
    dragEvent("drop", rows[0], 110, data);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("puts the drag down if the setlist starts in the middle of it", () => {
    /*
     * `draggable={!locked}` only stops a drag from STARTING. The setlist can
     * begin to play while one is in the air — a hotkey, a MIDI note, the
     * footswitch under the drummer's foot — and the drop would then move rows
     * under a runner that addresses them by index. `dragend` does not fire
     * until the pointer comes up, which may be several bars later, so both
     * ends of the drag ask rather than trusting the handle.
     */
    const onChange = vi.fn();
    const props = {
      setlist: SETLIST,
      selectedStepId: "s1",
      onSelectStep: vi.fn(),
      onChange,
      onPatchStep: vi.fn(),
      onAddStep: vi.fn(),
    };
    const { container, rerender } = render(<SetlistParagraph {...props} runningIndex={-1} />);
    const rows = blocks(container);
    const data = transfer();
    boxed(rows[2]);
    fireEvent.dragStart(grips(container)[0], { dataTransfer: data });
    dragEvent("dragover", rows[2], 135, data);
    expect(rows[2].getAttribute("data-drop")).toBe("after");

    rerender(<SetlistParagraph {...props} runningIndex={0} />);
    // The line is gone, because it was promising something no longer on offer.
    expect(rows[2].getAttribute("data-drop")).toBeNull();
    dragEvent("dragover", rows[2], 135, data);
    dragEvent("drop", rows[2], 135, data);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not re-apply a step to the engine for grabbing the one it is on", () => {
    // Selecting pushes the step onto the engine and reopens the mirror's
    // wait. Doing that for the step the engine is already on is an IPC write
    // and a dropped guard in exchange for nothing.
    const onSelectStep = vi.fn();
    const { container } = draw({ selectedStepId: "s1", onSelectStep });
    fireEvent.dragStart(grips(container)[0], { dataTransfer: transfer() });
    expect(onSelectStep).not.toHaveBeenCalled();

    // A row that is not the one being edited still becomes it.
    fireEvent.dragStart(grips(container)[2], { dataTransfer: transfer() });
    expect(onSelectStep).toHaveBeenCalledWith("s3");
  });

  it("refuses the handle while the setlist is playing, and says why", () => {
    // The runner tracks steps by index, so a row moving under it changes what
    // plays next. The up and down buttons keep working - they are the
    // one-position move the runner already survives.
    const onChange = vi.fn();
    const { container } = draw({ runningIndex: 1, onChange });
    for (const grip of grips(container)) {
      expect(grip.getAttribute("draggable")).toBe("false");
      expect(grip.getAttribute("title")).toBe("Stop the setlist to reorder");
      expect(grip.className).toContain("is-locked");
    }
    const rows = blocks(container);
    within(rows[2]).getByRole("button", { name: "Move this step earlier" }).click();
    expect(onChange).toHaveBeenCalled();
  });
});

describe("a block of steps", () => {
  const ids = (set: string[]) => new Set(set);

  it("shift-click asks for the range, ctrl-click asks for the one", () => {
    const onExtendSelection = vi.fn();
    const onToggleSelection = vi.fn();
    const onSelectStep = vi.fn();
    const { container } = draw({ onExtendSelection, onToggleSelection, onSelectStep });
    const rows = blocks(container);

    fireEvent.click(rows[2], { shiftKey: true });
    expect(onExtendSelection).toHaveBeenCalledWith("s3");
    // The primary selection does not move: marking five steps to drag them is
    // not a request to start listening to the fifth.
    expect(onSelectStep).not.toHaveBeenCalled();

    fireEvent.click(rows[1], { ctrlKey: true });
    expect(onToggleSelection).toHaveBeenCalledWith("s2");
    expect(onSelectStep).not.toHaveBeenCalled();

    fireEvent.click(rows[1]);
    expect(onSelectStep).toHaveBeenCalledWith("s2");
  });

  it("marks the block with a state of its own, beside selected and running", () => {
    const { container } = draw({
      selectedStepIds: ids(["s1", "s2"]),
      selectedStepId: "s1",
      runningIndex: 1,
    });
    const rows = blocks(container);
    expect(rows[0].className).toContain("multi");
    expect(rows[0].className).toContain("selected");
    expect(rows[1].className).toContain("multi");
    expect(rows[1].className).toContain("running");
    expect(rows[2].className).not.toContain("multi");
  });

  it("does not mark anything when the block is the one selected step", () => {
    const { container } = draw({ selectedStepIds: ids(["s1"]) });
    expect(container.querySelectorAll(".setlist-step.multi")).toHaveLength(0);
  });

  it("Shift and down extends the block and takes the focus with it", () => {
    const onExtendSelection = vi.fn();
    const { container } = draw({ onExtendSelection, selectedStepIds: ids(["s1"]) });
    const rows = blocks(container);
    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: "ArrowDown", shiftKey: true });
    expect(onExtendSelection).toHaveBeenCalledWith("s2");
    expect(document.activeElement).toBe(rows[1]);
  });

  it("keeps every modified arrow off the tempo — including the ones that do nothing", () => {
    /*
     * The arrows are the global BPM keys, dispatched from a listener on
     * `document`. React's own listener sits on the root inside it, so the row
     * has to stop the event or marking a block would retune the metronome.
     *
     * The refused presses are the ones that mattered. Shift+↑ on the top row
     * and Shift+↓ on the bottom row have nowhere to go, and Alt+arrows are
     * refused outright while the setlist plays — and each of those used to
     * `return` before claiming the key, so the press that was supposed to do
     * NOTHING changed the tempo instead. A gesture that is refused has to be
     * refused silently.
     */
    const listen = (run: () => void): string[] => {
      const seen: string[] = [];
      const spy = (e: KeyboardEvent) => seen.push(e.key);
      document.addEventListener("keydown", spy);
      run();
      document.removeEventListener("keydown", spy);
      return seen;
    };

    const { container } = draw({ onExtendSelection: vi.fn(), onChange: vi.fn() });
    const rows = blocks(container);
    rows[0].focus();
    expect(
      listen(() => {
        fireEvent.keyDown(rows[0], { key: "ArrowDown", shiftKey: true });
        fireEvent.keyDown(rows[0], { key: "ArrowDown", altKey: true });
        // Nowhere to go: the top row has no row above it, the last none below.
        fireEvent.keyDown(rows[0], { key: "ArrowUp", shiftKey: true });
        fireEvent.keyDown(rows[2], { key: "ArrowDown", shiftKey: true });
      }),
    ).toEqual([]);

    // A bare arrow is still the tempo, which is what it has always been.
    expect(listen(() => fireEvent.keyDown(rows[0], { key: "ArrowUp" }))).toEqual(["ArrowUp"]);
  });

  it("keeps Alt off the tempo while the setlist plays, and moves nothing", () => {
    const onChange = vi.fn();
    const { container } = draw({ onChange, runningIndex: 0, selectedStepIds: ids(["s1", "s2"]) });
    const rows = blocks(container);
    rows[0].focus();
    const seen: string[] = [];
    const spy = (e: KeyboardEvent) => seen.push(e.key);
    document.addEventListener("keydown", spy);
    fireEvent.keyDown(rows[0], { key: "ArrowDown", altKey: true });
    document.removeEventListener("keydown", spy);
    expect(seen).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Alt and down moves the whole block one position", () => {
    const onChange = vi.fn();
    const { container } = draw({ onChange, selectedStepIds: ids(["s1", "s2"]) });
    const rows = blocks(container);
    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: "ArrowDown", altKey: true });
    expect(names(onChange.mock.calls[0][0])).toEqual(["Odd meter", "Loosen up", "Alt picking"]);
  });

  it("dragging any row of the block carries all of it", () => {
    const onChange = vi.fn();
    const { container } = draw({ onChange, selectedStepIds: ids(["s1", "s3"]) });
    const rows = blocks(container);
    const data = transfer();
    boxed(rows[1]);
    fireEvent.dragStart(grips(container)[2], { dataTransfer: data });
    expect(data.setData).toHaveBeenCalledWith("text/plain", "s1,s3");
    expect(rows[0].getAttribute("data-dragging")).toBe("");
    expect(rows[2].getAttribute("data-dragging")).toBe("");
    dragEvent("dragover", rows[1], 135, data);
    dragEvent("drop", rows[1], 135, data);
    // Their own order survives the move.
    expect(names(onChange.mock.calls[0][0])).toEqual(["Alt picking", "Loosen up", "Odd meter"]);
  });

  it("dragging a row outside the block makes it the step you are working with", () => {
    const onSelectStep = vi.fn();
    const { container } = draw({ onSelectStep, selectedStepIds: ids(["s1", "s2"]) });
    const data = transfer();
    fireEvent.dragStart(grips(container)[2], { dataTransfer: data });
    expect(onSelectStep).toHaveBeenCalledWith("s3");
    expect(data.setData).toHaveBeenCalledWith("text/plain", "s3");
  });

  it("duplicates and removes the whole block, and says how many", () => {
    const onChange = vi.fn();
    const onCollapseSelection = vi.fn();
    const { container } = draw({
      onChange,
      onCollapseSelection,
      selectedStepIds: ids(["s1", "s3"]),
    });
    const tools = blocks(container)[0];
    const copy = within(tools).getByRole("button", { name: "Duplicate 2 steps" });
    const remove = within(tools).getByRole("button", { name: "Remove 2 steps" });

    copy.click();
    expect(names(onChange.mock.calls[0][0])).toEqual([
      "Loosen up",
      "Alt picking",
      "Odd meter",
      "Loosen up",
      "Odd meter",
    ]);

    remove.click();
    expect(names(onChange.mock.calls[1][0])).toEqual(["Alt picking"]);
    // The marks have to go with the steps, or the next duplicate acts on ghosts.
    expect(onCollapseSelection).toHaveBeenCalled();
  });

  it("keeps the singular wording for a step that is on its own", () => {
    const { container } = draw({ selectedStepIds: ids(["s1"]) });
    const tools = blocks(container)[0];
    expect(within(tools).getByRole("button", { name: "Duplicate this step" })).toBeTruthy();
    expect(within(tools).getByRole("button", { name: "Remove this step" })).toBeTruthy();
  });

  it("Escape gives the block back before it gives the setlist back", () => {
    // The window closes the loaded setlist on Escape. With several steps
    // marked, the first press means "never mind about those".
    const onCollapseSelection = vi.fn();
    draw({ selectedStepIds: ids(["s1", "s2"]), onCollapseSelection });
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    fireEvent(document, escape);
    expect(onCollapseSelection).toHaveBeenCalled();
    expect(escape.defaultPrevented).toBe(true);
  });

  it("leaves Escape alone when there is no block to give back", () => {
    const onCollapseSelection = vi.fn();
    draw({ selectedStepIds: ids(["s1"]), onCollapseSelection });
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    fireEvent(document, escape);
    expect(onCollapseSelection).not.toHaveBeenCalled();
    expect(escape.defaultPrevented).toBe(false);
  });
});
