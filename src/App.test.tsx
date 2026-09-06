/**
 * App routing tests — verifies App.tsx selects the correct top-level component
 * based on the `?window=...` URL search param.
 *
 * NOTE: vi.mock for project-relative paths doesn't hoist under bun+vitest,
 * so we let the real MainWindow / FloatingWidget mount through mocked Tauri
 * APIs (see src/test/mocks.ts). The test only asserts on the chosen component's
 * top-level role/title — not its internals.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";

function setSearch(search: string) {
  window.history.replaceState({}, "", `/${search}`);
}

describe("App routing", () => {
  beforeEach(() => {
    setSearch("");
  });

  it("renders the main window app shell when no ?window param is present", async () => {
    render(<App />);
    // MainWindow contains the BPM display — assert SOMETHING from it appears.
    // Default state has bpm=120. Query the readout specifically: the tempo
    // ruler is numbered now, so "120" also appears as a gradation under it.
    expect(await screen.findByText("120", { selector: ".bpm-input" })).toBeInTheDocument();
  });

  it("renders the main window app shell when ?window=main is set", async () => {
    setSearch("?window=main");
    render(<App />);
    expect(await screen.findByText("120", { selector: ".bpm-input" })).toBeInTheDocument();
  });

  it("renders the floating widget when ?window=floating is set", async () => {
    setSearch("?window=floating");
    const { container } = render(<App />);
    // FloatingWidget's root has the `floating-widget` class — distinctive.
    const widget = await waitFor(() =>
      container.querySelector(".floating-widget"),
    );
    expect(widget).not.toBeNull();
  });
});
