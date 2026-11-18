import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PracticeSettingsSection } from "./PracticeSettingsSection";

afterEach(cleanup);

describe("Settings → Practice → Grade my playing", () => {
  it("is on by default, and turning it off is handed to the Session", () => {
    const setGrade = vi.fn();
    render(
      <PracticeSettingsSection
        practice={{ minutes: 10, setMinutes: vi.fn(), practiceView: "neck", setPracticeView: vi.fn(), grade: true, setGrade }}
      />,
    );
    const toggle = screen.getByTestId("settings-grade");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Grade my playing")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(setGrade).toHaveBeenCalledWith(false);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("is not offered by a caller that cannot keep it", () => {
    render(
      <PracticeSettingsSection practice={{ minutes: 10, setMinutes: vi.fn(), practiceView: "neck", setPracticeView: vi.fn() }} />,
    );
    expect(screen.queryByTestId("settings-grade")).toBeNull();
  });
});
