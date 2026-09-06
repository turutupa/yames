/**
 * The track's own job: draw the chain, and hand every edit back as a new
 * `Chain`. The data operations it calls are tested in `src/chain`; what is
 * tested here is that the right one is called, and that what the artboard
 * asks the strip to say is what it says.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { ChainTrack } from "./ChainTrack";
import type { Chain, ChainStep, ChainTrigger } from "../../types";

function step(id: string, name: string, trigger: ChainTrigger): ChainStep {
  return {
    id,
    name,
    bpm: 70,
    subdivision: 1,
    beatGroups: [4],
    freeMode: false,
    soundType: "click",
    volume: 0.7,
    trigger,
    transition: { kind: "cut" },
  };
}

const CHAIN: Chain = {
  id: "c1",
  name: "Warm-up",
  createdAt: 0,
  repeat: 1,
  steps: [
    step("s1", "Loosen up", { kind: "bars", bars: 8 }),
    step("s2", "Alt picking", { kind: "manual" }),
  ],
};

function setup(overrides: Partial<React.ComponentProps<typeof ChainTrack>> = {}) {
  const props = {
    chain: CHAIN,
    selectedStepId: "s1",
    onSelectStep: vi.fn(),
    runningIndex: -1,
    remaining: null,
    onChange: vi.fn(),
    onAddStep: vi.fn(),
    ...overrides,
  };
  return { ...render(<ChainTrack {...props} />), props };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChainTrack", () => {
  it("draws a card per step and a chip in every gap, the last one included", () => {
    // The artboard stops the chips before the last card, but the last step's
    // trigger is what ends the pass (U9.6) — hiding it would hide the only
    // control that says when a one-step chain is over.
    const { container } = setup();
    expect(container.querySelectorAll(".chain-step")).toHaveLength(2);
    expect(container.querySelectorAll(".chain-gap-chip")).toHaveLength(2);
    expect(screen.getByText("8 bars")).toBeInTheDocument();
    expect(screen.getByText("when I say")).toBeInTheDocument();
  });

  it("says what the chain costs and how it ends", () => {
    // 8 bars of 4/4 at 70 bpm is a little under half a minute; the second
    // step waits for the player, so no total can be given.
    setup();
    expect(screen.getByText(/2 steps/)).toBeInTheDocument();
    expect(screen.getByText(/ends on its own/)).toBeInTheDocument();
  });

  it("counts the chain's total when every gap is timed", () => {
    const timed: Chain = {
      ...CHAIN,
      steps: [step("s1", "A", { kind: "seconds", seconds: 120 }), step("s2", "B", { kind: "seconds", seconds: 60 })],
    };
    setup({ chain: timed });
    expect(screen.getByText(/about 3 min/)).toBeInTheDocument();
  });

  it("repeat is a count, and 0 reads as until stopped (U9.6)", () => {
    const { props } = setup();
    expect(screen.getByText("Once through")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Repeat more times"));
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ repeat: 2 }));

    cleanup();
    setup({ chain: { ...CHAIN, repeat: 0 } });
    expect(screen.getByText("Until I stop it")).toBeInTheDocument();
    expect(screen.getByText(/runs until you stop it/)).toBeInTheDocument();
  });

  it("marks the running step and counts its bars", () => {
    const { container } = setup({ runningIndex: 0, remaining: { kind: "bars", bars: 6 } });
    const running = container.querySelector(".chain-step.running");
    expect(running).not.toBeNull();
    expect(within(running as HTMLElement).getByText("bar 3 of 8")).toBeInTheDocument();
  });

  it("moves, duplicates and removes steps", () => {
    const { props } = setup();
    fireEvent.click(screen.getAllByLabelText("Move this step later")[0]);
    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ steps: [expect.objectContaining({ id: "s2" }), expect.objectContaining({ id: "s1" })] }),
    );

    vi.clearAllMocks();
    fireEvent.click(screen.getAllByLabelText("Remove this step")[0]);
    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ steps: [expect.objectContaining({ id: "s2" })] }),
    );

    vi.clearAllMocks();
    fireEvent.click(screen.getAllByLabelText("Duplicate this step")[0]);
    expect(props.onChange.mock.calls[0][0].steps).toHaveLength(3);
  });

  it("the first step cannot move earlier and the last cannot move later", () => {
    setup();
    expect(screen.getAllByLabelText("Move this step earlier")[0]).toBeDisabled();
    expect(screen.getAllByLabelText("Move this step later")[1]).toBeDisabled();
  });

  it("a chip opens the gap editor and both axes write to the step", () => {
    const { props } = setup();
    fireEvent.click(screen.getByText("8 bars"));
    expect(screen.getByText("Move on")).toBeInTheDocument();
    expect(screen.getByText("Get there by")).toBeInTheDocument();

    fireEvent.click(screen.getByText("After time"));
    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [expect.objectContaining({ trigger: { kind: "seconds", seconds: 120 } }), expect.anything()],
      }),
    );
  });

  it("says out loud that count-in does not play yet (U9.5)", () => {
    // The artboard promises "two bars of count-in at 96, then step 2 begins".
    // The engine cannot do that yet, so the editor says what it will do.
    const withCountIn: Chain = {
      ...CHAIN,
      steps: [{ ...CHAIN.steps[0], transition: { kind: "countIn", bars: 2 } }, CHAIN.steps[1]],
    };
    setup({ chain: withCountIn });
    fireEvent.click(screen.getByText("8 bars"));
    expect(screen.getByText(/does not play yet/)).toBeInTheDocument();
  });

  it("selecting a step is one click, renaming it is the second", () => {
    const { props } = setup({ selectedStepId: "s1" });
    fireEvent.click(screen.getByText("Alt picking"));
    expect(props.onSelectStep).toHaveBeenCalledWith("s2");

    // Already selected: the name becomes a field rather than re-selecting.
    fireEvent.click(screen.getByText("Loosen up"));
    const input = document.querySelector(".chain-step-rename") as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: "Stretch" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ steps: [expect.objectContaining({ name: "Stretch" }), expect.anything()] }),
    );
  });

  it("an empty chain says how to fill it rather than showing a bare rail", () => {
    const { props } = setup({ chain: { ...CHAIN, steps: [] }, selectedStepId: null });
    expect(screen.getByText(/Nothing in this chain yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Add what you have now as a step"));
    expect(props.onAddStep).toHaveBeenCalled();
  });
});
