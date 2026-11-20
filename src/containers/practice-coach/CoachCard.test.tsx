/**
 * CoachCard feature preservation tests.
 *
 * Since leg c2a1 the card is the "Tools coach" section of Ask: the panel
 * around it (open, close, the pill, the model selector, the question box)
 * and the `?` key are Ask's (`containers/coach/AskPanel.test.tsx`,
 * `useActionDispatcher.parity.test.tsx`). What the tools still get here,
 * until c2a2, is locked in:
 * - Inactive shows a "Start" button
 * - Active shows an "End" button
 * - Start button calls onStartSession
 * - End button calls onEndSession
 * - "History" tab swaps content
 * - No question box: the conversation is Ask's
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CoachCard from "./CoachCard";

const baseProps = {
  active: false,
  messages: [],
  onStartSession: vi.fn(),
  onEndSession: vi.fn(),
};

describe("CoachCard", () => {
  it("inactive shows a Start button", () => {
    render(<CoachCard {...baseProps} active={false} />);
    expect(screen.getByRole("button", { name: /^start$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^end$/i })).not.toBeInTheDocument();
  });

  it("active shows an End button", () => {
    render(<CoachCard {...baseProps} active={true} />);
    expect(screen.getByRole("button", { name: /^end$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^start$/i })).not.toBeInTheDocument();
  });

  it("clicking Start calls onStartSession", () => {
    const onStartSession = vi.fn();
    render(<CoachCard {...baseProps} active={false} onStartSession={onStartSession} />);
    fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStartSession).toHaveBeenCalled();
  });

  it("clicking End calls onEndSession", () => {
    const onEndSession = vi.fn();
    render(<CoachCard {...baseProps} active={true} onEndSession={onEndSession} />);
    fireEvent.click(screen.getByRole("button", { name: /^end$/i }));
    expect(onEndSession).toHaveBeenCalled();
  });

  it("clicking History tab switches to history view", () => {
    render(<CoachCard {...baseProps} />);
    const tabs = screen.getAllByRole("button");
    const historyTab = tabs.find((t) => t.textContent === "History");
    expect(historyTab).toBeDefined();
    fireEvent.click(historyTab as HTMLElement);
    // The active tab should be History now
    expect(historyTab?.className).toMatch(/active/);
  });

  it("has no question box and no key of its own: both are Ask's", () => {
    const { container } = render(<CoachCard {...baseProps} />);
    expect(container.querySelector("input, textarea")).toBeNull();
    // `?` used to be a window listener in here; nothing happens now.
    fireEvent.keyDown(window, { key: "?" });
    expect(container.querySelector(".coach-card-embedded")).not.toBeNull();
  });
});
