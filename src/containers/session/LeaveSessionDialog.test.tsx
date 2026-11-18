import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LeaveSessionDialog } from "./LeaveSessionDialog";

afterEach(cleanup);

describe("the leave dialog (acceptance P2-3)", () => {
  it("focuses Keep going, so Enter stays", () => {
    const onLeave = vi.fn();
    const onStay = vi.fn();
    render(<LeaveSessionDialog onLeave={onLeave} onStay={onStay} />);
    expect(document.activeElement).toBe(screen.getByTestId("leave-session-stay"));
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("leaves on Enter only once Leave has the focus", () => {
    const onLeave = vi.fn();
    render(<LeaveSessionDialog onLeave={onLeave} onStay={vi.fn()} />);
    screen.getByTestId("leave-session-leave").focus();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("says nothing is saved when there are no Takes", () => {
    render(<LeaveSessionDialog onLeave={vi.fn()} onStay={vi.fn()} saved={false} />);
    expect(screen.getByTestId("leave-session").textContent).toContain("No Takes yet");
  });

  it("keeps Tab inside: forward and back go round its two buttons (acceptance pass 3 P2-5)", () => {
    render(
      <>
        <button data-testid="behind">Exit</button>
        <LeaveSessionDialog onLeave={vi.fn()} onStay={vi.fn()} />
      </>,
    );
    const stay = screen.getByTestId("leave-session-stay");
    const leave = screen.getByTestId("leave-session-leave");
    expect(document.activeElement).toBe(stay);
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(leave);
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(stay);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(leave);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(stay);
    expect(document.activeElement).not.toBe(screen.getByTestId("behind"));
  });

  it("gives the focus back to what opened it when it closes", () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button data-testid="exit" onClick={() => setOpen(true)}>
            Exit
          </button>
          {open && <LeaveSessionDialog onLeave={vi.fn()} onStay={() => setOpen(false)} />}
        </>
      );
    }
    render(<Host />);
    const exit = screen.getByTestId("exit");
    exit.focus();
    fireEvent.click(exit);
    expect(document.activeElement).toBe(screen.getByTestId("leave-session-stay"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("leave-session")).toBeNull();
    expect(document.activeElement).toBe(exit);
  });
});
