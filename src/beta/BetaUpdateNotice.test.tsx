import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BetaUpdateNotice } from "./BetaUpdateNotice";

afterEach(cleanup);

describe("BetaUpdateNotice", () => {
  it("names the build and offers Update and Later", () => {
    const onUpdate = vi.fn();
    const onDismiss = vi.fn();
    render(<BetaUpdateNotice version="1.3.0-beta.58" busy={false} onUpdate={onUpdate} onDismiss={onDismiss} />);
    expect(screen.getByTestId("beta-update-notice").textContent).toMatch(/1\.3\.0-beta\.58/);
    fireEvent.click(document.querySelector(".audio-error-notice-action")!);
    fireEvent.click(document.querySelector(".audio-error-notice-dismiss")!);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows progress instead of the button while busy", () => {
    render(<BetaUpdateNotice version="1.3.0-beta.58" busy progress={0.3} onUpdate={vi.fn()} onDismiss={vi.fn()} />);
    expect(document.querySelector(".audio-error-notice-action")).toBeNull();
    expect(screen.getByTestId("beta-update-notice").textContent).toMatch(/30/);
  });
});
