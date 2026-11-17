/** The band's level under a jam-backed Take: a slider, only when there is a band. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BandVolume } from "./SessionView";
import type { SessionRun } from "./hooks/useSessionRun";

afterEach(cleanup);

function fake(hasBand: boolean, directInput = true) {
  const setBandVolume = vi.fn();
  return { session: { hasBand, directInput, bandVolume: 0.8, setBandVolume } as unknown as SessionRun, setBandVolume };
}

describe("the band volume", () => {
  it("moves the band's level", () => {
    const { session, setBandVolume } = fake(true);
    render(<BandVolume session={session} hint />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveValue("0.8");
    fireEvent.change(slider, { target: { value: "0.3" } });
    expect(setBandVolume).toHaveBeenCalledWith(0.3);
    expect(screen.getByText(/not graded/)).toBeInTheDocument();
  });

  it("tells a microphone player why it starts off", () => {
    const { session } = fake(true, false);
    render(<BandVolume session={session} hint />);
    expect(screen.getByText(/headphones/)).toBeInTheDocument();
  });

  it("is not there over a click", () => {
    const { session } = fake(false);
    const { container } = render(<BandVolume session={session} hint />);
    expect(container).toBeEmptyDOMElement();
  });
});
