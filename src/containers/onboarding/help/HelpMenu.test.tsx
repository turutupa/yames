/**
 * The Help menu's contract:
 *   - every item that depends on a feature disappears when the feature is not
 *     wired (no tour, no wizard, no log export) — never a dead entry;
 *   - "Report a problem" surfaces the path it wrote, because the whole point
 *     is to attach that file to an issue;
 *   - Cmd/Ctrl-/ opens it, and does so on the right modifier per platform.
 */
import { describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpMenu } from "./HelpMenu";
import { isHelpShortcut, useHelpMenu } from "./useHelpMenu";

const base = {
  open: true,
  onClose: () => {},
  appVersion: "1.3.0",
  onShowShortcuts: () => {},
};

describe("HelpMenu — items by feature availability", () => {
  it("renders nothing when closed", () => {
    render(<HelpMenu {...base} open={false} />);
    expect(screen.queryByTestId("help-menu")).toBeNull();
  });

  it("shows every item when every feature is wired", () => {
    render(
      <HelpMenu
        {...base}
        onTakeTour={() => {}}
        onRunSetupAgain={() => {}}
        onReportProblem={async () => "/tmp/logs.json"}
      />,
    );
    expect(screen.getByRole("button", { name: /take the tour/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run setup again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keyboard shortcuts/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /report a problem/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /website/i })).toBeInTheDocument();
  });

  it("hides the tour item when the tour is not mounted", () => {
    render(<HelpMenu {...base} onRunSetupAgain={() => {}} />);
    expect(screen.queryByRole("button", { name: /take the tour/i })).toBeNull();
    expect(screen.getByRole("button", { name: /run setup again/i })).toBeInTheDocument();
  });

  it("hides the setup item when the wizard is not mounted", () => {
    render(<HelpMenu {...base} onTakeTour={() => {}} />);
    expect(screen.queryByRole("button", { name: /run setup again/i })).toBeNull();
    expect(screen.getByRole("button", { name: /take the tour/i })).toBeInTheDocument();
  });

  it("hides Report a problem when no export is available", () => {
    render(<HelpMenu {...base} />);
    expect(screen.queryByRole("button", { name: /report a problem/i })).toBeNull();
  });

  it("always shows the shortcuts sheet entry and the version", () => {
    render(<HelpMenu {...base} />);
    expect(screen.getByRole("button", { name: /keyboard shortcuts/i })).toBeInTheDocument();
    expect(screen.getByText(/1\.3\.0/)).toBeInTheDocument();
  });
});

describe("HelpMenu — actions", () => {
  it("takes the tour and closes first", async () => {
    const user = userEvent.setup();
    const onTakeTour = vi.fn();
    const onClose = vi.fn();
    render(<HelpMenu {...base} onClose={onClose} onTakeTour={onTakeTour} />);
    await user.click(screen.getByRole("button", { name: /take the tour/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onTakeTour).toHaveBeenCalled();
  });

  it("shows the exported diagnostics path", async () => {
    const user = userEvent.setup();
    const onReportProblem = vi.fn().mockResolvedValue("C:\\logs\\yames-session-logs-1.json");
    render(<HelpMenu {...base} onReportProblem={onReportProblem} />);
    await user.click(screen.getByRole("button", { name: /report a problem/i }));
    expect(await screen.findByTestId("help-report-path")).toHaveTextContent(
      "yames-session-logs-1.json",
    );
  });

  it("reports a failed export instead of a fake path", async () => {
    const user = userEvent.setup();
    const onReportProblem = vi.fn().mockRejectedValue(new Error("disk full"));
    render(<HelpMenu {...base} onReportProblem={onReportProblem} />);
    await user.click(screen.getByRole("button", { name: /report a problem/i }));
    expect(
      await screen.findByText(/could not write the diagnostics file/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("help-report-path")).toBeNull();
  });

  it("closes on the backdrop and on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { unmount } = render(<HelpMenu {...base} onClose={onClose} />);
    await user.click(screen.getByTestId("help-menu"));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    const onCloseEsc = vi.fn();
    render(<HelpMenu {...base} onClose={onCloseEsc} />);
    await user.keyboard("{Escape}");
    expect(onCloseEsc).toHaveBeenCalledTimes(1);
  });

  it("drops the entrance animation when motion is reduced", () => {
    render(<HelpMenu {...base} animate={false} />);
    expect(screen.getByTestId("help-menu").className).toContain("no-motion");
  });
});

describe("isHelpShortcut", () => {
  const ev = (init: Partial<KeyboardEvent>) =>
    ({ key: "/", metaKey: false, ctrlKey: false, altKey: false, ...init }) as KeyboardEvent;

  it("matches Cmd-/ on macOS only", () => {
    expect(isHelpShortcut(ev({ metaKey: true }), true)).toBe(true);
    expect(isHelpShortcut(ev({ ctrlKey: true }), true)).toBe(false);
  });

  it("matches Ctrl-/ off macOS only", () => {
    expect(isHelpShortcut(ev({ ctrlKey: true }), false)).toBe(true);
    expect(isHelpShortcut(ev({ metaKey: true }), false)).toBe(false);
  });

  it("accepts '?' (Shift-/ on a US layout)", () => {
    expect(isHelpShortcut(ev({ key: "?", ctrlKey: true }), false)).toBe(true);
  });

  it("ignores a bare slash and Alt combinations", () => {
    expect(isHelpShortcut(ev({}), false)).toBe(false);
    expect(isHelpShortcut(ev({ ctrlKey: true, altKey: true }), false)).toBe(false);
  });
});

describe("useHelpMenu", () => {
  function press(target: EventTarget = document.body) {
    const e = new KeyboardEvent("keydown", {
      key: "/",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      target.dispatchEvent(e);
    });
  }

  it("Ctrl-/ opens the menu and toggles it shut", () => {
    const { result } = renderHook(() => useHelpMenu(false));
    expect(result.current.panel).toBe("closed");
    press();
    expect(result.current.panel).toBe("menu");
    press();
    expect(result.current.panel).toBe("closed");
  });

  it("does not fire while another overlay owns the keyboard", () => {
    const { result } = renderHook(() => useHelpMenu(false, { disabled: true }));
    press();
    expect(result.current.panel).toBe("closed");
  });

  it("does not fire while the user is typing in a field", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const { result } = renderHook(() => useHelpMenu(false));
    press(input);
    expect(result.current.panel).toBe("closed");
    input.remove();
  });

  it("switches between the menu and the shortcuts sheet", () => {
    const { result } = renderHook(() => useHelpMenu(false));
    act(() => result.current.openMenu());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.openShortcuts());
    expect(result.current.panel).toBe("shortcuts");
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });
});
