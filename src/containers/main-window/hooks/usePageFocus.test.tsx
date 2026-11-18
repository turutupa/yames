import { describe, expect, it } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { usePageFocus } from "./usePageFocus";

function Host({ view, page }: { view: string; page: "a" | "b" | "session" | "session-wait" }) {
  const ref = useRef<HTMLDivElement>(null);
  usePageFocus(ref, view);
  return (
    <div ref={ref}>
      {page === "a" && <h1 key="a">Today</h1>}
      {page === "b" && <h1 key="b">Paths</h1>}
      {page.startsWith("session") && (
        <button data-testid="session-big" disabled={page === "session-wait"}>
          Start
        </button>
      )}
    </div>
  );
}

describe("usePageFocus (NAV-10)", () => {
  it("leaves the first page alone, then focuses each new page's heading", async () => {
    const { rerender, getByText } = render(<Host view="today" page="a" />);
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    expect(document.activeElement).toBe(document.body);
    rerender(<Host view="paths" page="b" />);
    await waitFor(() => expect(document.activeElement).toBe(getByText("Paths")));
    expect(getByText("Paths").getAttribute("tabindex")).toBe("-1");
  });

  it("focuses the big button when a Session starts, once it is enabled", async () => {
    const { rerender, getByTestId } = render(<Host view="today" page="a" />);
    rerender(<Host view="session" page="session-wait" />);
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    expect(document.activeElement).not.toBe(getByTestId("session-big"));
    rerender(<Host view="session" page="session" />);
    await waitFor(() => expect(document.activeElement).toBe(getByTestId("session-big")));
  });

  it("takes nothing from a field being typed in", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const { rerender } = render(<Host view="today" page="a" />);
    input.focus();
    rerender(<Host view="paths" page="b" />);
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    expect(document.activeElement).toBe(input);
    input.remove();
  });
});
