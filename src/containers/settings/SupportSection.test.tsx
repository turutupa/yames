/**
 * Settings → Support carries "Send feedback" for testers: one button that
 * opens a prefilled GitHub issue through the app's open-URL door, with the
 * version said beside it. Pressing it sends nothing by itself.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const openUrl = vi.fn(async () => undefined);
const setTakeDiagnostics = vi.fn(async (on: boolean) => (on ? "/data/diagnostics/takes" : null));
const exportPracticeData = vi.fn(async (_name: string, _json: string) => "/tmp/yames-practice.json");
vi.mock("../../ipc", () => ({
  exportPracticeData: (name: string, json: string) => exportPracticeData(name, json),
  listPathStates: async () => [],
  listPathTakes: async () => [],
  listExerciseCeilings: async () => [],
  storeLoad: async () => undefined,
  openUrl: (url: string) => openUrl(url),
  setTakeDiagnostics: (on: boolean) => setTakeDiagnostics(on),
  openFeedback: async (version: string) =>
    openUrl(`https://github.com/turutupa/yames/issues/new?title=${encodeURIComponent(version)}`),
}));

import { SupportSection } from "./SupportSection";

afterEach(() => {
  cleanup();
  openUrl.mockClear();
});

describe("Send feedback in Settings", () => {
  it("says the version and opens the issue only when pressed", () => {
    render(<SupportSection shareTooltip={false} onShareOption={vi.fn()} appVersion="0.9.0" />);
    expect(screen.getByTestId("settings-feedback")).toHaveTextContent("Yames 0.9.0");
    expect(openUrl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("settings-send-feedback"));
    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(String((openUrl.mock.calls[0] as unknown[])[0])).toContain("github.com/turutupa/yames/issues/new");
  });
});

describe("Export my practice data, beside Send feedback", () => {
  it("writes the JSON through the save dialog and says where it went", async () => {
    render(<SupportSection shareTooltip={false} onShareOption={vi.fn()} appVersion="0.9.0" />);
    fireEvent.click(screen.getByTestId("export-practice-button"));
    await waitFor(() => expect(exportPracticeData).toHaveBeenCalledTimes(1));
    const [name, json] = exportPracticeData.mock.calls[0] as unknown as [string, string];
    expect(name).toMatch(/^yames-practice-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(json)).toMatchObject({ kind: "yames-practice-data", appVersion: "0.9.0" });
    expect(await screen.findByText(/Saved to \/tmp\/yames-practice.json/)).toBeInTheDocument();
  });
});

describe("Keep my last Takes for troubleshooting", () => {
  it("is off by default, and pressing it stores the choice and tells the engine", async () => {
    const mem = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, v),
        removeItem: (k: string) => void mem.delete(k),
      },
    });
    render(<SupportSection shareTooltip={false} onShareOption={() => {}} appVersion="1.2.3" />);
    const row = screen.getByTestId("settings-keep-takes");
    const button = row.querySelector("button")!;
    expect(button.className).not.toContain("active");
    expect(setTakeDiagnostics).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(setTakeDiagnostics).toHaveBeenLastCalledWith(true);
    expect(window.localStorage.getItem("yames.keepTakesForTroubleshooting")).toBe("1");
    await waitFor(() => expect(row.textContent).toContain("/data/diagnostics/takes"));
    fireEvent.click(button);
    expect(setTakeDiagnostics).toHaveBeenLastCalledWith(false);
    expect(window.localStorage.getItem("yames.keepTakesForTroubleshooting")).toBeNull();
  });
});
