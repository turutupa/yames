import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Rail } from "./Rail";
import { DEFAULT_TEST_STATE } from "../../test/mocks";

function setup(overrides: Partial<React.ComponentProps<typeof Rail>> = {}) {
  const props = {
    state: DEFAULT_TEST_STATE,
    view: "beat" as const,
    setView: vi.fn(),
    prevTab: { current: "beat" as "beat" | "drill" },
    libraryOpen: false,
    onToggleLibrary: vi.fn(),
    onLoadPreset: vi.fn(),
    onActivePresetChange: vi.fn(),
    coachOpen: false,
    coachActive: false,
    coachListening: false,
    onToggleCoach: vi.fn(),
    onZen: vi.fn(),
    ...overrides,
  };
  const utils = render(<Rail {...props} />);
  return { ...utils, props };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Rail", () => {
  it("offers exactly the modes that exist — Paths is not shipped yet", () => {
    // UI_DECISIONS U1.8: the rail is built to grow, but a greyed-out item is a
    // promise with no date. Pocket Check is gone (U1.7), Paths is not here yet.
    const { container } = setup();
    const labels = [...container.querySelectorAll(".rail-mode-label")].map((n) => n.textContent);
    expect(labels).toEqual(["Metronome", "Drill"]);
  });

  it("switches mode and marks the current one for assistive tech", () => {
    const { props, container, rerender } = setup();
    fireEvent.click(screen.getByText("Drill"));
    expect(props.setView).toHaveBeenCalledWith("drill");

    rerender(<Rail {...props} view="drill" />);
    const current = container.querySelector('[aria-current="page"] .rail-mode-label');
    expect(current?.textContent).toBe("Drill");
  });

  it("shows the library when open and a way back to it when closed", () => {
    const { container, props, rerender } = setup({ libraryOpen: true });
    expect(container.querySelector(".preset-sidebar")).not.toBeNull();
    expect(container.querySelector(".rail-library-reopen")).toBeNull();

    rerender(<Rail {...props} libraryOpen={false} />);
    expect(container.querySelector(".preset-sidebar")).toBeNull();
    const reopen = container.querySelector(".rail-library-reopen") as HTMLButtonElement;
    expect(reopen).not.toBeNull();
    fireEvent.click(reopen);
    expect(props.onToggleLibrary).toHaveBeenCalled();
  });

  it("shows the coach's status dot only once a session is running", () => {
    const { container, props, rerender } = setup();
    expect(container.querySelector(".rail-action-dot")).toBeNull();

    rerender(<Rail {...props} coachActive />);
    expect(container.querySelector(".rail-action-dot")).not.toBeNull();
    expect(container.querySelector(".rail-action-dot.listening")).toBeNull();

    rerender(<Rail {...props} coachActive coachListening />);
    expect(container.querySelector(".rail-action-dot.listening")).not.toBeNull();
  });

  it("remembers the mode it left when opening settings, and returns to it", () => {
    const prevTab = { current: "beat" as "beat" | "drill" };
    const setView = vi.fn();
    const { props, rerender } = setup({ view: "drill", prevTab, setView });

    fireEvent.click(screen.getByText("Settings"));
    expect(prevTab.current).toBe("drill");
    expect(setView).toHaveBeenCalledWith("settings");

    rerender(<Rail {...props} view="settings" />);
    fireEvent.click(screen.getByText("Settings"));
    expect(setView).toHaveBeenLastCalledWith("drill");
  });

  it("keeps Zen and the widget adjacent — the tour spotlights them together", () => {
    // Tour stop "zen-widget" unions every element carrying the id. They used
    // to sit next to each other in the header; separating them would stretch
    // the spotlight across the whole window.
    const { container } = setup();
    const anchored = [...container.querySelectorAll('[data-tour="zen-widget"]')];
    expect(anchored).toHaveLength(2);
    expect(anchored[0].nextElementSibling).toBe(anchored[1]);
  });
});
