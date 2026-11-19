import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { useRef } from "react";
import { hideTipUntilLeft, showTipAgain, usePreviousWordFits } from "./sessionBarParts";

describe("the Session bar's tooltip (acceptance 5, P2-5)", () => {
  it("is hidden once its block is pressed, until the pointer leaves", () => {
    const el = document.createElement("button");
    hideTipUntilLeft(el);
    expect(el.hasAttribute("data-tip-off")).toBe(true);
    showTipAgain({ currentTarget: el });
    expect(el.hasAttribute("data-tip-off")).toBe(false);
  });
});

function Bar({ rows }: { rows: [number, number] }) {
  const ref = useRef<HTMLDivElement>(null);
  usePreviousWordFits(ref, "k");
  return (
    <div ref={ref} data-testid="bar">
      <button className="session-exit" data-top={rows[0]} />
      <button className="session-skip-this" data-top={rows[1]} />
    </div>
  );
}

describe("Previous keeps its word where the row has room (acceptance 5, P2-8)", () => {
  const withTops = () => {
    const proto = HTMLElement.prototype as unknown as { getBoundingClientRect: () => DOMRect };
    const original = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function (this: HTMLElement) {
      return { top: Number(this.getAttribute("data-top") ?? 0), width: 300 } as DOMRect;
    };
    return () => {
      proto.getBoundingClientRect = original;
    };
  };

  it("one row: the word stays", () => {
    const restore = withTops();
    const { getByTestId } = render(<Bar rows={[9, 9]} />);
    expect(getByTestId("bar").hasAttribute("data-prev-short")).toBe(false);
    restore();
  });

  it("Skip pushed to a row of its own: the chevron alone", () => {
    const restore = withTops();
    const { getByTestId } = render(<Bar rows={[9, 53]} />);
    expect(getByTestId("bar").hasAttribute("data-prev-short")).toBe(true);
    restore();
  });
});
