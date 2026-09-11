// Click the tempo, type a tempo.
//
// Two separate things had to be true for that to work, and neither was.
//
// 1. The number is a `<span>` with an onClick. The window-drag handler asks
//    `isInteractive` whether a mousedown landed on a control, and a bare span
//    answers no — so the tempo read as window furniture and started a window
//    drag, which calls `preventDefault()` and puts `user-select: none` on the
//    body. That is exactly "the number does not highlight".
//
//    Third time in this codebase, after the library rows and the setlist
//    steps: anything clickable that is not a real control has to say so.
//    useDrag.interactive.test.tsx guards the drag side; this guards the
//    markup that side depends on.
//
// 2. The old value was selected by a `setTimeout(…, 0)` fired next to the
//    state update, so it had to land after React had committed the input and
//    after `autoFocus` had focused it. Nothing guaranteed that ordering. It is
//    the input's own `onFocus` now.
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MetronomeView } from "./MetronomeView";
import { useBpmEditing } from "../main-window/hooks/useBpmEditing";
import { DEFAULT_TEST_STATE } from "../../test/mocks";

afterEach(cleanup);

/** The tempo number wired to the real editing hook, and nothing else. */
function Harness({ onCommit = vi.fn() }: { onCommit?: (bpm: number) => void }) {
  const bpm = useBpmEditing(DEFAULT_TEST_STATE.bpm, onCommit);
  return (
    <MetronomeView
      state={DEFAULT_TEST_STATE}
      currentBeat={null}
      evaluation={{ enabled: false } as never}
      activeBeat={-1}
      activeSub={-1}
      isDownbeat={false}
      sliderPercent={50}
      tapActive={false}
      tapCount={0}
      tapPulse={false}
      editingBpm={bpm.editingBpm}
      bpmEditValue={bpm.bpmEditValue}
      setBpmEditValue={bpm.setBpmEditValue}
      setEditingBpm={bpm.setEditingBpm}
      bpmInputRef={bpm.bpmInputRef}
      onTap={vi.fn()}
      onBpmChange={vi.fn()}
      onStartBpmEdit={bpm.startBpmEdit}
      onCommitBpmEdit={bpm.commitBpmEdit}
    />
  );
}

const tempo = () => document.querySelector(".bpm-clickable") as HTMLElement;
const input = () => document.querySelector("input.bpm-input") as HTMLInputElement;

describe("the tempo number", () => {
  it("says it is a control, so a window drag does not claim it", () => {
    render(<Harness />);
    expect(tempo().getAttribute("role")).toBe("button");
    expect(tempo().getAttribute("tabindex")).toBe("0");
  });

  it("opens for editing with the old tempo selected", () => {
    render(<Harness />);
    fireEvent.click(tempo());

    const el = input();
    expect(el).not.toBeNull();
    expect(el.value).toBe(String(DEFAULT_TEST_STATE.bpm));
    // The whole value, so the first digit typed replaces the tempo rather
    // than landing beside it.
    expect(el.selectionStart).toBe(0);
    expect(el.selectionEnd).toBe(el.value.length);
  });

  it("opens from the keyboard too", () => {
    // A click target nothing can reach by keyboard is the other half of what
    // `role`/`tabIndex` are for.
    render(<Harness />);
    fireEvent.keyDown(tempo(), { key: "Enter" });
    expect(input()).not.toBeNull();
  });

  it("commits what was typed", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.click(tempo());
    fireEvent.change(input(), { target: { value: "144" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(144);
  });

  it("leaves the tempo alone when what was typed is not one", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.click(tempo());
    fireEvent.change(input(), { target: { value: "" } });
    fireEvent.blur(input());
    expect(onCommit).not.toHaveBeenCalled();
  });
});
