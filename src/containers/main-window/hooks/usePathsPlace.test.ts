/**
 * Paths' remembered place and scroll (QA 2026-11-17), and a move made from
 * another screen (leg pol2, item 11: the coach's `open_path` from Today wrote
 * Today's scroll over the one Paths had remembered).
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePathsPlace } from "./usePathsPlace";
import type { MainView } from "../MainHeader";

function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const ref = { current: el };
  const hook = renderHook((p: { view: MainView }) => usePathsPlace(p.view, ref), {
    initialProps: { view: "paths" as MainView },
  });
  return { el, hook };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("usePathsPlace", () => {
  it("a move made while another screen shows does not write that screen's scroll over Paths'", () => {
    const { el, hook } = mount();
    // The list, scrolled down 500; the player goes to Today from there.
    el.scrollTop = 500;
    el.dispatchEvent(new Event("scroll"));
    // Today: its own page, at the top.
    hook.rerender({ view: "today" });
    el.scrollTop = 0;
    // The coach opens another Path from Today.
    act(() => hook.result.current.move({ pathId: "first-chords", stepId: null }));
    hook.rerender({ view: "paths" });
    // Back to the list: where it was.
    act(() => {
      hook.result.current.back();
    });
    expect(hook.result.current.at).toEqual({ pathId: null, stepId: null });
    expect(el.scrollTop).toBe(500);
  });

  it("on Paths, a move still writes down the page it leaves", () => {
    const { el, hook } = mount();
    el.scrollTop = 320;
    act(() => hook.result.current.move({ pathId: "alternate-picking", stepId: null }));
    el.scrollTop = 0;
    act(() => {
      hook.result.current.back();
    });
    expect(el.scrollTop).toBe(320);
  });
});
