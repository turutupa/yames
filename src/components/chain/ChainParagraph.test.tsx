import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChainParagraph } from "./ChainParagraph";
import type { Chain, ChainStep } from "../../types";

/**
 * The editor half of chain mode.
 *
 * What matters here is not that it draws — it is the two claims the design
 * rests on. A closed step is ONE line and carries no controls, which is where
 * the height came from; and the step you clicked is the only one holding an
 * editor, which is why the step card could stop being a card.
 */

function step(over: Partial<ChainStep> & { id: string; name: string }): ChainStep {
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

const CHAIN: Chain = {
  id: "c1",
  name: "Warm-up routine",
  createdAt: 0,
  repeat: 1,
  steps: [
    step({ id: "s1", name: "Loosen up", bpm: 70, subdivision: 1 }),
    step({ id: "s2", name: "Alt picking", trigger: { kind: "seconds", seconds: 120 }, transition: { kind: "countIn", bars: 2 } }),
    step({ id: "s3", name: "Odd meter", bpm: 88, subdivision: 2, beatGroups: [3, 2, 2], trigger: { kind: "manual" } }),
  ],
};

function draw(over: Partial<Parameters<typeof ChainParagraph>[0]> = {}) {
  return render(
    <ChainParagraph
      chain={CHAIN}
      selectedStepId="s1"
      onSelectStep={() => {}}
      runningIndex={-1}
      onChange={() => {}}
      onAddStep={() => {}}
      {...over}
    />,
  );
}

describe("the chain, as a paragraph", () => {
  it("says a closed step in words, and gives it nothing to press", () => {
    // The whole argument for the row: a step that is not being edited is a
    // sentence you read, so it costs one line instead of a 136px card whose
    // four tool buttons reserved 31px each while invisible.
    const { container } = draw({ selectedStepId: "s1" });
    const rows = container.querySelectorAll(".chain-row");
    expect(rows).toHaveLength(2); // s2 and s3; s1 is the open one

    const alt = screen.getByText("Alt picking").closest(".chain-row") as HTMLElement;
    expect(alt.textContent).toContain("96 BPM");
    expect(alt.textContent).toContain("4/4");
    // The trigger, in the words a player would use, on the row itself.
    expect(alt.textContent).toContain("2 min");
    expect(alt.textContent).toContain("count in 2 bars");
    // ...and no controls of its own beyond being the control.
    expect(within(alt).queryAllByRole("button")).toHaveLength(0);
  });

  it("opens exactly one step, and only that one carries the tools", () => {
    const { container } = draw({ selectedStepId: "s2" });
    expect(container.querySelectorAll(".chain-open-step")).toHaveLength(1);
    expect(container.querySelectorAll(".chain-sentence")).toHaveLength(1);

    const open = container.querySelector(".chain-open-step") as HTMLElement;
    expect(open.textContent).toContain("Alt picking");
    for (const name of ["Move this step earlier", "Move this step later", "Duplicate this step", "Remove this step"]) {
      expect(within(open).getByRole("button", { name })).toBeTruthy();
    }
    // The closed rows have none of them anywhere on the screen but here.
    expect(screen.getAllByRole("button", { name: "Remove this step" })).toHaveLength(1);
  });

  it("clicking a closed step asks for it, and does not edit the chain", () => {
    const onSelectStep = vi.fn();
    const onChange = vi.fn();
    draw({ selectedStepId: "s1", onSelectStep, onChange });

    screen.getByText("Odd meter").closest(".chain-row")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(onSelectStep).toHaveBeenCalledWith("s3");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("says a step that waits for you differently from one that counts", () => {
    draw({ selectedStepId: "s1" });
    const odd = screen.getByText("Odd meter").closest(".chain-row") as HTMLElement;
    expect(odd.textContent).toContain("until I say");
    // ...and the last step ends the chain rather than handing over.
    expect(odd.textContent).toContain("the chain ends");
  });

  it("marks the running step even while you are editing another one", () => {
    // Leaving the player does not stop the run, so the paragraph has to be
    // able to say which step is sounding while you edit a different one.
    const { container } = draw({ selectedStepId: "s3", runningIndex: 0 });
    const running = container.querySelector(".chain-row.running") as HTMLElement;
    expect(running).toBeTruthy();
    expect(running.textContent).toContain("Loosen up");
    expect(running.getAttribute("aria-current")).toBe("step");
  });

  it("offers the way back to the player only while something is playing", async () => {
    const onBackToPlaying = vi.fn();
    const { rerender } = render(
      <ChainParagraph
        chain={CHAIN}
        selectedStepId="s1"
        onSelectStep={() => {}}
        runningIndex={-1}
        onChange={() => {}}
        onAddStep={() => {}}
        onBackToPlaying={onBackToPlaying}
      />,
    );
    expect(screen.queryByText("Back to playing")).toBeNull();

    rerender(
      <ChainParagraph
        chain={CHAIN}
        selectedStepId="s1"
        onSelectStep={() => {}}
        runningIndex={1}
        onChange={() => {}}
        onAddStep={() => {}}
        onBackToPlaying={onBackToPlaying}
      />,
    );
    await userEvent.click(screen.getByText("Back to playing"));
    expect(onBackToPlaying).toHaveBeenCalled();
  });

  it("offers a count-in, and says none rather than zero", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ChainParagraph
        chain={CHAIN}
        selectedStepId="s1"
        onSelectStep={() => {}}
        runningIndex={-1}
        onChange={onChange}
        onAddStep={() => {}}
      />,
    );
    // "0 beats" is not a length of anything. A chain with no count-in says so.
    expect(screen.getByText("No count-in")).toBeTruthy();

    screen.getByRole("button", { name: "More count-in beats" }).click();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ countIn: 1 }));

    rerender(
      <ChainParagraph
        chain={{ ...CHAIN, countIn: 4 }}
        selectedStepId="s1"
        onSelectStep={() => {}}
        runningIndex={-1}
        onChange={onChange}
        onAddStep={() => {}}
      />,
    );
    expect(screen.getByText("4 beats")).toBeTruthy();
  });

  it("an empty chain says what a chain is", () => {
    draw({ chain: { ...CHAIN, steps: [] }, selectedStepId: null });
    expect(screen.getByText(/plays your steps in order/i)).toBeTruthy();
    expect(screen.getByText("+ Add a step")).toBeTruthy();
  });
});
