import { describe, expect, it } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { focusPagePrimary, usePageFocus } from "./usePageFocus";

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

  it("focuses a tool's Play when the tool opens, once it draws (P2-8)", async () => {
    function Tool({ view, play }: { view: string; play: boolean }) {
      const ref = useRef<HTMLDivElement>(null);
      usePageFocus(ref, view);
      return (
        <div ref={ref}>
          {view === "tools" && <h1>Tools</h1>}
          {view === "beat" && play && <button className="transport-play">Play</button>}
        </div>
      );
    }
    const { rerender, getByText } = render(<Tool view="tools" play={false} />);
    rerender(<Tool view="beat" play={false} />);
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    rerender(<Tool view="beat" play />);
    await waitFor(() => expect(document.activeElement).toBe(getByText("Play")));
  });

  it("puts focus on the page when the focused element is taken away (P2-8)", async () => {
    function Page({ wizard }: { wizard: boolean }) {
      const ref = useRef<HTMLDivElement>(null);
      usePageFocus(ref, "today");
      return (
        <>
          {wizard && <button>Go to Today</button>}
          <div ref={ref}>
            <h1>Today</h1>
            <button className="session-today-start">Start</button>
          </div>
        </>
      );
    }
    const { rerender, getByText } = render(<Page wizard />);
    getByText("Go to Today").focus();
    rerender(<Page wizard={false} />);
    await waitFor(() => expect(document.activeElement).toBe(getByText("Start")));
  });

  it("leaves focus alone while a modal is open", async () => {
    function Page({ step }: { step: number }) {
      const ref = useRef<HTMLDivElement>(null);
      usePageFocus(ref, "today");
      return (
        <>
          <div role="dialog" aria-modal="true">
            <button key={step}>Next {step}</button>
          </div>
          <div ref={ref}>
            <button className="session-today-start">Start</button>
          </div>
        </>
      );
    }
    const { rerender, getByText } = render(<Page step={1} />);
    getByText("Next 1").focus();
    rerender(<Page step={2} />);
    await act(async () => new Promise((r) => setTimeout(r, 40)));
    expect(document.activeElement).not.toBe(getByText("Start"));
  });

  it("the skip link's target: Start on Today, else the heading", () => {
    const root = document.createElement("div");
    root.innerHTML = '<h1>Progress</h1>';
    document.body.appendChild(root);
    expect(focusPagePrimary(root, "progress")).toBe(true);
    expect(document.activeElement?.textContent).toBe("Progress");
    root.innerHTML = '<h1>Today</h1><button class="session-today-start">Start</button>';
    expect(focusPagePrimary(root, "today")).toBe(true);
    expect(document.activeElement?.textContent).toBe("Start");
    root.remove();
  });
});
