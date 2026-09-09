import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Transport } from "./Transport";
import { readStylesheet, ruleBlock } from "../../test/readStyles";

const base = {
  isPlaying: false,
  speedRampActive: false,
  isPulsing: false,
  bar: 1,
  elapsedSeconds: 0,
  listening: false,
  hasSignal: false,
  startBpm: 80,
  countIn: false,
  loop: false,
  onToggleCountIn: vi.fn(),
  onToggleLoop: vi.fn(),
  onTogglePlayback: vi.fn(),
  onStartSpeedRamp: vi.fn(),
  onStopSpeedRamp: vi.fn(),
};

/** The play button, whatever it currently says. */
const playButton = () => document.querySelector(".transport-play") as HTMLButtonElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Transport", () => {
  it("starts the click on the metronome and the ramp on the drill", () => {
    const onTogglePlayback = vi.fn();
    const onStartSpeedRamp = vi.fn();

    const { unmount } = render(
      <Transport {...base} view="beat" onTogglePlayback={onTogglePlayback} onStartSpeedRamp={onStartSpeedRamp} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onTogglePlayback).toHaveBeenCalledTimes(1);
    expect(onStartSpeedRamp).not.toHaveBeenCalled();
    unmount();

    render(
      <Transport {...base} view="drill" onTogglePlayback={onTogglePlayback} onStartSpeedRamp={onStartSpeedRamp} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onStartSpeedRamp).toHaveBeenCalledTimes(1);
    expect(onTogglePlayback).toHaveBeenCalledTimes(1); // still just the first one
  });

  it("stops the ramp on the drill, not the click", () => {
    const onStopSpeedRamp = vi.fn();
    const onTogglePlayback = vi.fn();
    render(
      <Transport
        {...base}
        view="drill"
        speedRampActive
        onStopSpeedRamp={onStopSpeedRamp}
        onTogglePlayback={onTogglePlayback}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onStopSpeedRamp).toHaveBeenCalledTimes(1);
    expect(onTogglePlayback).not.toHaveBeenCalled();
  });

  it("rests on bar one rather than on a dash", () => {
    // You are always about to play bar one; "—" was a value the counter never
    // actually holds.
    const { rerender } = render(<Transport {...base} view="beat" bar={7} />);
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.getByText("1")).toBeTruthy();
    rerender(<Transport {...base} view="beat" bar={7} isPlaying />);
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("says Start on the drill and Play on the metronome", () => {
    const { unmount } = render(<Transport {...base} view="beat" />);
    expect(playButton().textContent).toContain("Play");
    unmount();

    render(<Transport {...base} view="drill" />);
    expect(playButton().textContent).toContain("Start");
  });

  it("carries the drill's count-in and loop, and nothing of the sort elsewhere", () => {
    // Promoted from the settings form because they are decided in the seconds
    // before pressing Start (S7). They are the drill's settings, not the
    // transport's: it renders what it is handed and calls back.
    const onToggleCountIn = vi.fn();
    const onToggleLoop = vi.fn();
    const { unmount } = render(
      <Transport
        {...base}
        view="drill"
        startBpm={96}
        countIn
        onToggleCountIn={onToggleCountIn}
        onToggleLoop={onToggleLoop}
      />,
    );
    expect(screen.getByText("96")).toBeTruthy();
    expect(screen.getByText("Starts at")).toBeTruthy();

    const [countIn, loop] = screen.getAllByRole("switch");
    expect(countIn.getAttribute("aria-checked")).toBe("true");
    expect(loop.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(loop);
    expect(onToggleLoop).toHaveBeenCalledTimes(1);
    expect(onToggleCountIn).not.toHaveBeenCalled();
    unmount();

    render(<Transport {...base} view="beat" />);
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(screen.queryByText("Starts at")).toBeNull();
  });

  it("explains the coach until there is something live to report instead", () => {
    // The mockup writes a sentence here. It is only true before the coach is
    // listening — once it is, the slot has to carry the live readout, because
    // the signal lamp exists nowhere else in the app.
    const { container, rerender } = render(<Transport {...base} view="beat" />);
    expect(screen.getByText("Coach listens when you press play")).toBeTruthy();

    rerender(<Transport {...base} view="drill" />);
    expect(screen.getByText("Coach stays quiet mid-step")).toBeTruthy();

    rerender(<Transport {...base} view="drill" listening hasSignal />);
    expect(container.querySelector(".transport-note")).toBeNull();
    expect(container.querySelector(".transport-signal.on")).not.toBeNull();
    expect(screen.getByText("Listening")).toBeTruthy();
  });

  it("keeps the input readout reachable at every width", () => {
    // Parity: below 920px the context bar drops its own input chip, on the
    // stated grounds that the transport reports the same state. So the
    // compact readout is in the tree behind the sentence, and the breakpoint
    // swaps which of the two is drawn.
    const { container } = render(<Transport {...base} view="beat" />);
    const narrow = container.querySelector(".transport-input-narrow");
    expect(narrow).not.toBeNull();
    expect(narrow?.textContent).toContain("Input off");
  });

  it("formats elapsed time as minutes and seconds", () => {
    render(<Transport {...base} view="beat" elapsedSeconds={252.7} />);
    expect(screen.getByText("4:12")).toBeTruthy();
  });

  it("pads the seconds so the clock does not jitter", () => {
    render(<Transport {...base} view="beat" elapsedSeconds={65} />);
    expect(screen.getByText("1:05")).toBeTruthy();
  });

  it("reports the input as off until the coach is listening", () => {
    const { container, rerender } = render(<Transport {...base} view="beat" />);
    expect(container.querySelector(".transport-input.listening")).toBeNull();
    rerender(<Transport {...base} view="beat" listening />);
    expect(container.querySelector(".transport-input.listening")).not.toBeNull();
  });

  it("shows the stop label while the drill's ramp runs, even though the click is not", () => {
    // The drill's play button follows the ramp, not `isPlaying` — the engine
    // is playing during a ramp either way, and the button must offer to stop
    // the thing the user actually started.
    render(<Transport {...base} view="drill" speedRampActive isPlaying />);
    expect(screen.getByRole("button").textContent).toContain("Stop");
  });
});

describe("Transport — what it sheds, and in what order", () => {
  const css = readStylesheet();
  const at = (px: number) => {
    const head = `@media (max-width: ${px}px) {`;
    const out: string[] = [];
    for (let i = css.indexOf(head); i !== -1; i = css.indexOf(head, i + 1)) {
      const next = css.indexOf("@media", i + head.length);
      out.push(css.slice(i, next === -1 ? css.length : next));
    }
    return out.join("\n");
  };

  it("has the input readout in place before the context bar drops its chip", () => {
    // The context bar sheds `.context-chip-input` at 959 on the stated
    // grounds that the transport reports the same state. So the transport's
    // compact readout has to be drawn by then — it arrives at 961, where the
    // row itself runs out of room for the sentence. Put the swap below the
    // chip's breakpoint instead and there is a band of widths that reports
    // the input nowhere.
    expect(at(961)).toContain(".transport-note {\n    display: none;");
    expect(at(961)).toContain(".transport-input-narrow {\n    display: flex;");
    expect(at(959)).toContain(".context-chip-input {\n    display: none;");
  });

  it("never hides the play button, at any width", () => {
    // Finding how to stop is the one thing that must always work.
    expect(css).not.toContain(".transport-play {\n    display: none;");
  });

  it("sheds the readouts before the window reaches its own default size", () => {
    // The bar needed 610px of stage and the window's default 800 gives it
    // 546, so this row used to run off the right edge at the size the app
    // opens at. 779 is where bar and elapsed go, on both screens.
    expect(at(779)).toContain(".transport-readouts {\n    display: none;");
  });

  it("gives the drill's switches back to the form rather than squeezing them", () => {
    // 620-719 is the band where the rail is still 252 wide and the stage is
    // under 470. The switches are the drill's own settings and the settings
    // form never stopped having them, so shedding them costs no capability.
    expect(at(779)).toContain('.transport[data-view="drill"] .transport-drill {\n    display: none;');
  });

  it("lets nothing in the row wrap or squash instead of shedding", () => {
    // A bar that answers a narrow window by folding "STARTS AT" onto a second
    // line has not adapted, it has broken — and it also hides the overflow
    // from anything measuring it, which is how the first pass at these
    // breakpoints came out believing the row fitted when it did not.
    const row = ruleBlock(css, ".transport > *");
    expect(row).toContain("flex-shrink: 0");
    expect(row).toContain("white-space: nowrap");
  });
  it("counts the setlist's steps, and skipping needs beats to land on (U9.7)", () => {
    // "Step 1 of 4" and "next in 5 bars" are the two things a setlist hides
    // that a metronome shows plainly. Skip arms a switch for the next
    // downbeat, so stopped it has nothing to arm.
    const { unmount } = render(
      <Transport
        {...base}
        view="beat"
        setlistStepNumber={1}
        setlistStepCount={4}
        setlistRemaining={{ kind: "bars", bars: 5 }}
        onSetlistSkip={vi.fn()}
      />,
    );
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    expect(screen.getByText("Next in 5 bars")).toBeInTheDocument();
    expect(document.querySelector(".transport-skip")).toBeDisabled();
    unmount();

    render(
      <Transport
        {...base}
        view="beat"
        isPlaying
        setlistStepNumber={2}
        setlistStepCount={4}
        setlistRemaining={{ kind: "manual" }}
        onSetlistSkip={vi.fn()}
      />,
    );
    // A manual gap is not a countdown and must not borrow the shape of one.
    expect(screen.getByText("Next when you say")).toBeInTheDocument();
    expect(document.querySelector(".transport-skip")).not.toBeDisabled();
  });

  it("says nothing about setlists when none is loaded", () => {
    render(<Transport {...base} view="beat" />);
    expect(document.querySelector(".transport-setlist")).toBeNull();
  });
});
