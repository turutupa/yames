import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PracticeSettingsSection } from "./PracticeSettingsSection";

afterEach(cleanup);

const base = { minutes: 10 as const, setMinutes: vi.fn(), practiceView: "neck" as const, setPracticeView: vi.fn() };

describe("Settings → Practice → Grade my playing: a choice of three (owner, 2026-11-18)", () => {
  it("reads as a choice, each answer with its own line, and hands a pick to the Session", () => {
    const setGrading = vi.fn();
    render(<PracticeSettingsSection practice={{ ...base, grading: "ask", setGrading }} />);
    expect(screen.getByText("Grade my playing")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    const on = screen.getByTestId("settings-grading-on");
    const off = screen.getByTestId("settings-grading-off");
    const ask = screen.getByTestId("settings-grading-ask");
    expect(ask.getAttribute("aria-checked")).toBe("true");
    expect(on).toHaveTextContent("Grade me");
    expect(off).toHaveTextContent("Just play");
    expect(off).toHaveTextContent("Nothing listens and nothing is graded.");
    expect(ask).toHaveTextContent("Ask me");
    fireEvent.click(off);
    expect(setGrading).toHaveBeenCalledWith("off");
    expect(off.getAttribute("aria-checked")).toBe("true");
    expect(ask.getAttribute("aria-checked")).toBe("false");
  });

  it("is not offered by a caller that cannot keep it", () => {
    render(<PracticeSettingsSection practice={base} />);
    expect(screen.queryByTestId("settings-grading")).toBeNull();
  });
});
