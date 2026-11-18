import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LeaveSessionDialog } from "./LeaveSessionDialog";

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
});
