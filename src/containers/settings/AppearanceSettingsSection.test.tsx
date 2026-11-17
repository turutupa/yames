/** Settings > Appearance: the "3D fretboard: Auto / Off" row (stage3d/prefs.ts). */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { storeSave } from "../../ipc";
import { getStagePrefs, resetStagePrefsForTest, setForceFlat } from "../../stage3d/prefs";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";

vi.mock("../../ipc", () => ({
  storeLoad: vi.fn(() => Promise.resolve(undefined)),
  storeSave: vi.fn(() => Promise.resolve()),
}));

function mount() {
  render(
    <AppearanceSettingsSection
      themeId="default"
      setTheme={vi.fn()}
      viewTransitions="smooth"
      setViewTransitions={vi.fn()}
      animationStyle="fade"
      setAnimationStyle={vi.fn()}
    />,
  );
  return screen.getByTestId("setting-neck3d");
}

afterEach(() => {
  cleanup();
  resetStagePrefsForTest();
  vi.mocked(storeSave).mockClear();
});

describe("the 3D fretboard setting", () => {
  it("offers Auto and Off, and saves the choice", () => {
    const row = mount();
    expect(row.textContent).toContain("3D fretboard");
    const off = screen.getByRole("button", { name: "Off", pressed: false });
    fireEvent.click(off);
    expect(getStagePrefs().neck3d).toBe("off");
    expect(storeSave).toHaveBeenCalledWith("stage.neck3d", "off");
    expect(screen.getByRole("button", { name: "Off", pressed: true })).toBeTruthy();
  });

  it("says when the machine was too slow, and Try 3D again clears it", () => {
    resetStagePrefsForTest({ forceFlat: true });
    const row = mount();
    expect(row.textContent).toContain("too slowly");
    fireEvent.click(screen.getByTestId("neck3d-retry"));
    expect(getStagePrefs().forceFlat).toBe(false);
    expect(storeSave).toHaveBeenCalledWith("stage.forceFlat", false);
    expect(screen.queryByTestId("neck3d-retry")).toBeNull();
    act(() => setForceFlat(true));
    expect(screen.getByTestId("neck3d-retry")).toBeTruthy();
  });
});
