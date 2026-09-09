import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Rail } from "./Rail";
import { DEFAULT_TEST_STATE } from "../../test/mocks";
import { readStylesheet } from "../../test/readStyles";

function setup(overrides: Partial<React.ComponentProps<typeof Rail>> = {}) {
  const props = {
    state: DEFAULT_TEST_STATE,
    view: "beat" as const,
    setView: vi.fn(),
    prevTab: { current: "beat" as "beat" | "drill" | "setlist" },
    libraryOpen: false,
    onToggleLibrary: vi.fn(),
    onLoadPreset: vi.fn(),
    onActivePresetChange: vi.fn(),
    setlists: [],
    activeSetlistId: null,
    onLoadSetlist: vi.fn(),
    onNewSetlist: vi.fn(),
    onDeleteSetlist: vi.fn(),
    onRenameSetlist: vi.fn(),
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
    expect(labels).toEqual(["Metronome", "Setlist", "Drill"]);
  });

  it("switches mode and marks the current one for assistive tech", () => {
    const { props, container, rerender } = setup();
    fireEvent.click(screen.getByText("Drill"));
    expect(props.setView).toHaveBeenCalledWith("drill");

    rerender(<Rail {...props} view="drill" />);
    const current = container.querySelector('[aria-current="page"] .rail-mode-label');
    expect(current?.textContent).toBe("Drill");
  });

  it("shows the library only while the sidebar is expanded", () => {
    const { container, props, rerender } = setup({ libraryOpen: true });
    expect(container.querySelector(".preset-sidebar")).not.toBeNull();
    expect(container.getAttribute("data-collapsed")).toBeNull();

    rerender(<Rail {...props} libraryOpen={false} />);
    expect(container.querySelector(".preset-sidebar")).toBeNull();
  });

  it("collapses and expands the whole sidebar from one control", () => {
    // The control used to live in the PRESETS header, where it collapsed the
    // whole rail but read as though it collapsed the preset list. There is one
    // now, at the sidebar's level, and one state behind it: expanded shows
    // labels and the library, collapsed shows neither.
    const { container, props, rerender } = setup({ libraryOpen: true });
    const toggle = () =>
      container.querySelector(".rail-collapse") as HTMLButtonElement;

    expect(toggle()).not.toBeNull();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle());
    expect(props.onToggleLibrary).toHaveBeenCalled();

    rerender(<Rail {...props} libraryOpen={false} />);
    expect(container.querySelector(".rail")?.getAttribute("data-collapsed")).toBe("");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    // Still named while its own label is hidden — it is the way back.
    expect(toggle().getAttribute("aria-label")).toBeTruthy();
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

  it("says what the coach is doing, and says it in the button's name too", () => {
    // The mockup writes "Ready" here. The row knows three states, not one, and
    // below 620px the visible label is `display: none` — so the status has to
    // be in the accessible name as well or it disappears with the text.
    const { container, props, rerender } = setup();
    const status = () => container.querySelector(".rail-action-status")?.textContent;
    const name = () =>
      container.querySelector(".rail-action")?.getAttribute("aria-label") ?? "";

    expect(status()).toBe("Ready");
    expect(name()).toContain("Ready");

    rerender(<Rail {...props} coachActive />);
    expect(status()).toBe("In session");

    rerender(<Rail {...props} coachActive coachListening />);
    expect(status()).toBe("Listening");
    expect(name()).toContain("Listening");
  });

  it("remembers the mode it left when opening settings, and returns to it", () => {
    const prevTab = { current: "beat" as "beat" | "drill" | "setlist" };
    const setView = vi.fn();
    const { props, rerender } = setup({ view: "drill", prevTab, setView });

    fireEvent.click(screen.getByText("Settings"));
    expect(prevTab.current).toBe("drill");
    expect(setView).toHaveBeenCalledWith("settings");

    rerender(<Rail {...props} view="settings" />);
    fireEvent.click(screen.getByText("Settings"));
    expect(setView).toHaveBeenLastCalledWith("drill");
  });

  it("names every button, so the icon-only rail is still usable blind", () => {
    // Below 620px the rail hides its labels with `display: none`, which takes
    // the accessible name with it — six unlabelled buttons. Found by reading
    // the accessibility tree of the running app at the 480px minimum.
    const { container } = setup({ libraryOpen: false });
    const unnamed = [...container.querySelectorAll("button")].filter(
      (b) => !(b.getAttribute("aria-label") ?? "").trim() && !(b.textContent ?? "").trim(),
    );
    expect(unnamed.map((b) => b.className)).toEqual([]);
  });

  it("keeps the name when the label is hidden", () => {
    const { container } = setup();
    for (const b of container.querySelectorAll(".rail-mode, .rail-action")) {
      expect(b.getAttribute("aria-label"), b.className).toBeTruthy();
    }
  });

  it("hides and restores the coach's status with the labels it sits beside", () => {
    // Below 620px the rail is 68px of icons; a status left drawn there would
    // overflow the strip. Opening the library floats the rail back to full
    // width, and everything the strip hid has to come back with it — the
    // status included, or it is the one thing missing from a rail that
    // otherwise looks whole.
    const css = readStylesheet();
    const strip = css.slice(css.indexOf("@media (max-width: 619px) {"));
    const hide = strip.slice(0, strip.indexOf("display: none;"));
    expect(hide).toContain(".rail-action-status");
    const restore = strip.slice(strip.indexOf(".rail[data-library-open] .rail-mode-label"));
    expect(restore.slice(0, restore.indexOf("display: revert;"))).toContain(
      ".rail[data-library-open] .rail-action-status",
    );
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
