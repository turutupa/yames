/**
 * Empty states (ONBOARDING_PLAN §6): every empty surface says what goes there
 * and offers exactly one way forward. Snapshots pin the rendered markup so a
 * refactor cannot quietly drop the action; the assertions around them pin the
 * behaviour the snapshot cannot see.
 *
 * Kept in one file rather than three because the rule they enforce is one rule.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PresetSidebar } from "../../components/presets/PresetSidebar";
import { CoachHistoryList } from "../practice-coach/CoachHistoryList";
import { DrillView } from "../drill/DrillView";
import { DEFAULT_TEST_STATE, setInvokeResponse } from "../../test/mocks";
import type { AppState } from "../../types";

const sidebarProps = {
  state: DEFAULT_TEST_STATE,
  view: "beat" as const,
  isOpen: true,
  onToggle: vi.fn(),
  onLoadPreset: vi.fn(),
  onActiveChange: vi.fn(),
};

describe("presets empty state", () => {
  it("offers one action and names the panel shortcut", async () => {
    setInvokeResponse("list_presets", () => []);
    render(<PresetSidebar {...sidebarProps} shortcut="B" />);
    const empty = await waitFor(() => {
      const el = document.querySelector(".preset-sidebar-empty-state");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(empty).toMatchSnapshot();
    expect(screen.getByText("No presets yet")).toBeInTheDocument();
    expect(screen.getByText(/Press B to open and close/)).toBeInTheDocument();
    // Exactly one action, not a wall of buttons.
    expect(empty.querySelectorAll("button")).toHaveLength(1);
  });

  it("the action opens the name input", async () => {
    const user = userEvent.setup();
    setInvokeResponse("list_presets", () => []);
    render(<PresetSidebar {...sidebarProps} />);
    await user.click(
      await screen.findByRole("button", { name: /save your first preset/i }),
    );
    expect(document.querySelector(".preset-sidebar-name-input")).not.toBeNull();
  });

  it("a search with no hits stays the plain 'no results' caption", async () => {
    const user = userEvent.setup();
    setInvokeResponse("list_presets", () => []);
    render(<PresetSidebar {...sidebarProps} />);
    await screen.findByText("No presets yet");
    // The field lives behind the header's magnifier now.
    await user.click(document.querySelector(".preset-sidebar-search-btn")!);
    await user.type(document.querySelector(".preset-search-input")!, "zzz");
    expect(screen.getByText("No results")).toBeInTheDocument();
    expect(document.querySelector(".preset-sidebar-empty-state")).toBeNull();
  });
});

describe("session history empty state", () => {
  it("says where sessions come from", () => {
    const { container } = render(
      <CoachHistoryList sessions={[]} onSelect={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(container.firstChild).toMatchSnapshot();
    expect(
      screen.getByText(/after you stop the metronome/i),
    ).toBeInTheDocument();
  });
});

describe("drill idle state", () => {
  const drillState = (mode: string, active = false): AppState => ({
    ...DEFAULT_TEST_STATE,
    accentMode: "groups" as const,
  countIn: { beats: 0, done: 0 },
    speedRamp: { ...DEFAULT_TEST_STATE.speedRamp!, mode, active },
  });

  it("explains every mode on the button that selects it", () => {
    // One line of prose used to sit under the plan the whole time the ramp
    // was stopped, explaining the mode already chosen. All three explanations
    // are hovers on the three buttons now — which means the two you did NOT
    // choose are readable before you choose them, and none of them is on
    // screen while you play.
    render(<DrillView state={drillState("linear")} currentBeat={0} />);
    expect(screen.getByTestId("drill-mode-tip-linear")).toMatchSnapshot();
    expect(screen.getByTestId("drill-mode-tip-linear")).toHaveTextContent(
      /^Linear:/,
    );
    expect(screen.getByTestId("drill-mode-tip-zigzag")).toHaveTextContent(
      /^Zigzag:/,
    );
    expect(screen.getByTestId("drill-mode-tip-adaptive")).toHaveTextContent(
      /^Adaptive:/,
    );
  });

  it("names each tip as its button's description, for assistive tech", () => {
    // The tip is a hover, so a keyboard or screen-reader user reaches it only
    // through `aria-describedby`. Without the link it is decoration.
    render(<DrillView state={drillState("zigzag")} currentBeat={0} />);
    const zigzag = screen.getByRole("button", { name: "Zigzag" });
    expect(zigzag.getAttribute("aria-describedby")).toBe("drill-mode-tip-zigzag");
    expect(document.getElementById("drill-mode-tip-zigzag")).toHaveTextContent(
      /^Zigzag:/,
    );
  });

  it("keeps the explanations off the stage while the drill is running", () => {
    // Still rendered — they belong to the buttons, which are still there —
    // but nothing on the stage is showing prose at a player mid-run.
    const { container } = render(
      <DrillView state={drillState("linear", true)} currentBeat={0} />,
    );
    expect(container.querySelector(".drill-idle-hint")).toBeNull();
    for (const tip of container.querySelectorAll(".drill-mode-tip")) {
      expect(tip.parentElement?.className).toContain("drill-mode-wrap");
    }
  });
});
