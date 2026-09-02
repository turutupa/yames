/**
 * GeneralSettingsSection language select tests.
 *
 * Locks in the VS Code-style click-to-expand language dropdown:
 * - Trigger shows the current language name
 * - Clicking expands the list of discovered languages
 * - Selecting a language applies it to i18n and closes the list
 * - Clicking outside closes the list without changing the language
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import { afterEach } from "vitest";
import i18n from "../../i18n";
import { GeneralSettingsSection } from "./GeneralSettingsSection";

vi.mock("../../ipc", () => ({
  storeLoad: vi.fn(() => Promise.resolve(undefined)),
  storeSave: vi.fn(() => Promise.resolve()),
}));

const baseProps = {
  autoCheckUpdates: true,
  setAutoCheckUpdates: vi.fn(),
  alwaysOnTop: false,
  setAlwaysOnTop: vi.fn(),
  buttonFlash: true,
  setButtonFlash: vi.fn(),
  activeBorder: false,
  setActiveBorder: vi.fn(),
  drillAutoCollapse: true,
  setDrillAutoCollapse: vi.fn(),
};

afterEach(() => {
  cleanup();
  // Restore the default language for the next test.
  i18n.changeLanguage("en");
});

describe("GeneralSettingsSection language select", () => {
  it("shows the current language in the trigger", async () => {
    render(<GeneralSettingsSection {...baseProps} />);
    // en is the default language; both en and zh-CN registry entries exist.
    const trigger = document.querySelector(".lang-select-btn") as HTMLElement;
    expect(trigger).not.toBeNull();
    expect(trigger.textContent).toContain("English");
    expect(document.querySelector(".lang-options")).toBeNull();
  });

  it("expands the list on click and shows all languages", async () => {
    render(<GeneralSettingsSection {...baseProps} />);
    const trigger = document.querySelector(".lang-select-btn") as HTMLElement;
    fireEvent.click(trigger);
    const options = document.querySelector(".lang-options");
    expect(options).not.toBeNull();
    expect(options?.textContent).toContain("English");
    expect(options?.textContent).toContain("中文");
  });

  it("selecting a language applies it and closes the list", async () => {
    render(<GeneralSettingsSection {...baseProps} />);
    fireEvent.click(document.querySelector(".lang-select-btn")!);
    // Exact match: "中文" must not also pick up "繁體中文".
    const zhOption = screen.getByRole("option", { name: /^中文$/ });
    fireEvent.click(zhOption);
    await waitFor(() => expect(i18n.language).toBe("zh-CN"));
    expect(document.querySelector(".lang-options")).toBeNull();
    const trigger = document.querySelector(".lang-select-btn") as HTMLElement;
    expect(trigger.textContent).toContain("中文");
  });

  it('shows "Run setup again" only when the handler is wired, and calls it', () => {
    render(<GeneralSettingsSection {...baseProps} />);
    expect(screen.queryByText("Run setup again")).toBeNull();
    cleanup();

    const onRunSetupAgain = vi.fn();
    render(
      <GeneralSettingsSection {...baseProps} onRunSetupAgain={onRunSetupAgain} />,
    );
    expect(screen.getByText("Run setup again")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onRunSetupAgain).toHaveBeenCalled();
  });

  it("clicking outside closes the list without changing language", async () => {
    render(<GeneralSettingsSection {...baseProps} />);
    fireEvent.click(document.querySelector(".lang-select-btn")!);
    expect(document.querySelector(".lang-options")).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(document.querySelector(".lang-options")).toBeNull();
    expect(i18n.language).toBe("en");
  });
});
