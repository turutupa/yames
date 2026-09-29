/**
 * What a take is made of, drawn (`plans/SONGS.md` A12).
 *
 * The things this has to get right are not layout, they are promises. A
 * machine that cannot record what it plays must not be offered a switch that
 * would record silence. A machine that can must be told, in a sentence, that
 * it will record everything — the owner's own first question was "so you'll
 * record ALL the audio coming from the pc?". And the level check has to be a
 * button rather than a meter that runs, because a meter that runs is the
 * speakers being listened to when nobody asked.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TakeSoundControl } from "./TakeSoundControl";
import { meterLevel } from "./useTakeSound";
import type { TakeSoundState } from "./useTakeSound";

afterEach(cleanup);

function state(over: Partial<TakeSoundState> = {}): TakeSoundState {
  return {
    sound: "yamesAndInput",
    setSound: vi.fn(),
    check: { can: true, device: "Speakers (Realtek(R) Audio)", sampleRate: 48000, channels: 2, peak: 0.2 },
    recheck: vi.fn(),
    checking: false,
    canRecordEverything: true,
    ...over,
  };
}

describe("the take's sound source", () => {
  it("draws nothing at all until the engine has answered", () => {
    const { container } = render(<TakeSoundControl state={state({ check: null })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("survives a caller that has no answer to give", () => {
    // Every harness that builds a takes state by hand, and every screen older
    // than this control. A missing prop is the same picture as a missing
    // answer, and never a crash.
    const { container } = render(<TakeSoundControl />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers no switch on a machine that cannot record what it plays", async () => {
    render(
      <TakeSoundControl
        state={state({
          canRecordEverything: false,
          check: { can: false, peak: 0, trouble: "this Mac cannot hand an app what its speakers are playing" },
        })}
      />,
    );
    expect(screen.queryByRole("group")).toBeNull();
    // One sentence, and it is the app's own translated one rather than the
    // engine's English reason.
    expect(screen.getByText(/cannot give Yames what its speakers are playing/i)).toBeTruthy();
  });

  it("says nothing at all on a build that has no such feature to be missing", () => {
    // No `trouble` means the engine rejected the command outright — an older
    // build. There is no absence here to explain.
    const { container } = render(
      <TakeSoundControl state={state({ canRecordEverything: false, check: { can: false, peak: 0 } })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the warning and the speaker's name out of the way until it is chosen", async () => {
    const { rerender } = render(<TakeSoundControl state={state()} />);
    expect(screen.queryByText(/not only Yames/i)).toBeNull();

    rerender(<TakeSoundControl state={state({ sound: "everything" })} />);
    expect(screen.getByText(/records everything this computer plays, not only Yames/i)).toBeTruthy();
    // And it names the speaker, so "which one is it listening to" is never a
    // question the musician has to guess the answer to.
    expect(screen.getByText(/Speakers \(Realtek\(R\) Audio\)/)).toBeTruthy();
  });

  it("listens only when the button is pressed", async () => {
    const recheck = vi.fn();
    render(<TakeSoundControl state={state({ sound: "everything", recheck })} />);
    // Drawing the control listened to nothing.
    expect(recheck).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /check the sound/i }));
    expect(recheck).toHaveBeenCalledTimes(1);
  });

  it("says so when the speakers turned out to be silent", () => {
    render(<TakeSoundControl state={state({ sound: "everything", check: { can: true, peak: 0 } })} />);
    expect(screen.getByText(/nothing came through/i)).toBeTruthy();
    // The meter is at the floor rather than absent: an empty meter IS the
    // answer, and a missing one reads as a control that has not run.
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("0");
  });

  it("changes what the next take is made of", async () => {
    const setSound = vi.fn();
    render(<TakeSoundControl state={state({ setSound })} />);
    await userEvent.click(screen.getByRole("button", { name: /everything this computer plays/i }));
    expect(setSound).toHaveBeenCalledWith("everything");
  });
});

describe("the meter", () => {
  it("is empty at silence and full at the ceiling", () => {
    expect(meterLevel(0)).toBe(0);
    expect(meterLevel(-1)).toBe(0);
    expect(meterLevel(1)).toBe(1);
  });

  it("reads in decibels, not in the raw number", () => {
    // A signal at a sensible recording level is about 0.1, which on a linear
    // meter draws a tenth of a bar and looks broken. Half scale is -30 dB.
    expect(meterLevel(0.1)).toBeGreaterThan(0.6);
    const half = meterLevel(10 ** (-30 / 20));
    expect(Math.abs(half - 0.5)).toBeLessThan(0.01);
  });
});
