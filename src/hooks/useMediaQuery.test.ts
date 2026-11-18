// Where the Session's input line renders on a phone held upright (acceptance
// 4, P1-3) is decided by this hook: false without matchMedia, live with it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { PORTRAIT_PHONE_QUERY, useMediaQuery } from "./useMediaQuery";

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

function stub(initial: boolean) {
  let listener: (() => void) | null = null;
  const mql = {
    matches: initial,
    media: PORTRAIT_PHONE_QUERY,
    addEventListener: (_: string, l: () => void) => void (listener = l),
    removeEventListener: vi.fn(),
  };
  window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;
  return {
    set(on: boolean) {
      mql.matches = on;
      listener?.();
    },
  };
}

describe("useMediaQuery", () => {
  it("is false where nothing can be asked", () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    expect(renderHook(() => useMediaQuery(PORTRAIT_PHONE_QUERY)).result.current).toBe(false);
  });

  it("follows the query as the window turns", () => {
    const mq = stub(true);
    const { result } = renderHook(() => useMediaQuery(PORTRAIT_PHONE_QUERY));
    expect(result.current).toBe(true);
    act(() => mq.set(false));
    expect(result.current).toBe(false);
  });

  it("asks the same query session.css keeps the sticky footer under", () => {
    expect(PORTRAIT_PHONE_QUERY).toBe("(orientation: portrait) and (max-width: 480px)");
  });
});
