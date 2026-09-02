import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WhatsNewModal, parseNotes } from "./WhatsNewModal";

describe("parseNotes", () => {
  it("keeps plain lines and unwraps bullets", () => {
    expect(parseNotes("Highlights\n- one\n* two\n• three")).toEqual([
      { text: "Highlights", bullet: false },
      { text: "one", bullet: true },
      { text: "two", bullet: true },
      { text: "three", bullet: true },
    ]);
  });

  it("drops blank lines and handles CRLF", () => {
    expect(parseNotes("a\r\n\r\n- b\r\n   \r\n")).toEqual([
      { text: "a", bullet: false },
      { text: "b", bullet: true },
    ]);
  });
});

describe("WhatsNewModal", () => {
  it("renders nothing when closed", () => {
    render(
      <WhatsNewModal open={false} version="1.3.0" notes="- x" onClose={() => {}} />,
    );
    expect(screen.queryByTestId("whats-new")).toBeNull();
  });

  it("shows the version and the release body", () => {
    render(
      <WhatsNewModal
        open
        version="1.3.0"
        notes={"- Beat grouping\n- Faster startup"}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/1\.3\.0/)).toBeInTheDocument();
    expect(screen.getByText("Beat grouping")).toBeInTheDocument();
    expect(screen.getByText("Faster startup")).toBeInTheDocument();
  });

  it("falls back to a link when there is no cached body", () => {
    render(<WhatsNewModal open version="1.3.0" notes={null} onClose={() => {}} />);
    expect(
      screen.getByText(/full release notes are on the web/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /release notes/i })).toBeInTheDocument();
  });

  it("closes on the button, the backdrop, and Escape", async () => {
    const user = userEvent.setup();

    const onClose = vi.fn();
    const { unmount } = render(
      <WhatsNewModal open version="1.3.0" notes="- x" onClose={onClose} />,
    );
    await user.click(screen.getByRole("button", { name: /got it/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    const onCloseBackdrop = vi.fn();
    const second = render(
      <WhatsNewModal open version="1.3.0" notes="- x" onClose={onCloseBackdrop} />,
    );
    await user.click(screen.getByTestId("whats-new"));
    expect(onCloseBackdrop).toHaveBeenCalledTimes(1);
    second.unmount();

    const onCloseEsc = vi.fn();
    render(<WhatsNewModal open version="1.3.0" notes="- x" onClose={onCloseEsc} />);
    await user.keyboard("{Escape}");
    expect(onCloseEsc).toHaveBeenCalledTimes(1);
  });

  it("a click inside the card does not close it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<WhatsNewModal open version="1.3.0" notes="- x" onClose={onClose} />);
    await user.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("drops the entrance animation when motion is reduced", () => {
    const { rerender } = render(
      <WhatsNewModal open version="1.3.0" notes="- x" onClose={() => {}} />,
    );
    expect(screen.getByTestId("whats-new").className).not.toContain("no-motion");
    rerender(
      <WhatsNewModal
        open
        version="1.3.0"
        notes="- x"
        onClose={() => {}}
        animate={false}
      />,
    );
    expect(screen.getByTestId("whats-new").className).toContain("no-motion");
  });
});
