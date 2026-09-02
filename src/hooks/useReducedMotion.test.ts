import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REDUCED_MOTION_QUERY,
  prefersReducedMotion,
  useReducedMotion,
} from "./useReducedMotion";

/**
 * A controllable `matchMedia` stub. The global one in `src/test/setup.ts`
 * always reports `matches: false`; these tests need to flip it and to fire a
 * change event.
 */
function installMatchMedia(initial: boolean, opts: { legacy?: boolean } = {}) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  let matches = initial;
  const mql = {
    get matches() {
      return matches;
    },
    media: REDUCED_MOTION_QUERY,
    onchange: null,
    ...(opts.legacy
      ? {
          addListener: (cb: (e: { matches: boolean }) => void) => listeners.add(cb),
          removeListener: (cb: (e: { matches: boolean }) => void) => listeners.delete(cb),
        }
      : {
          addEventListener: (_: string, cb: (e: { matches: boolean }) => void) =>
            listeners.add(cb),
          removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) =>
            listeners.delete(cb),
        }),
    dispatchEvent: () => true,
  };
  const impl = vi.fn(() => mql);
  Object.defineProperty(window, "matchMedia", { writable: true, value: impl });
  return {
    impl,
    listenerCount: () => listeners.size,
    set(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb({ matches: next }));
    },
  };
}

const original = window.matchMedia;
afterEach(() => {
  Object.defineProperty(window, "matchMedia", { writable: true, value: original });
});

describe("useReducedMotion", () => {
  it("is false when neither the OS nor the preference asks for less motion", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion("subtle"));
    expect(result.current).toBe(false);
  });

  it("is true when the OS asks for reduced motion", () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion("expressive"));
    expect(result.current).toBe(true);
  });

  it('is true when the viewTransitions preference is "off"', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion("off"));
    expect(result.current).toBe(true);
  });

  it("treats an absent preference as 'ask the OS'", () => {
    installMatchMedia(false);
    const { result, rerender } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    rerender();
    expect(result.current).toBe(false);
  });

  it("reacts live when the OS setting changes", () => {
    const mm = installMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => mm.set(true));
    expect(result.current).toBe(true);
    act(() => mm.set(false));
    expect(result.current).toBe(false);
  });

  it("unsubscribes on unmount", () => {
    const mm = installMatchMedia(false);
    const { unmount } = renderHook(() => useReducedMotion());
    expect(mm.listenerCount()).toBe(1);
    unmount();
    expect(mm.listenerCount()).toBe(0);
  });

  it("falls back to addListener on engines without addEventListener", () => {
    const mm = installMatchMedia(false, { legacy: true });
    const { result, unmount } = renderHook(() => useReducedMotion());
    act(() => mm.set(true));
    expect(result.current).toBe(true);
    unmount();
    expect(mm.listenerCount()).toBe(0);
  });

  it("survives an environment without matchMedia", () => {
    Object.defineProperty(window, "matchMedia", { writable: true, value: undefined });
    expect(prefersReducedMotion()).toBe(false);
    const { result } = renderHook(() => useReducedMotion("off"));
    // The preference still applies even with no media-query support.
    expect(result.current).toBe(true);
  });

  it("survives a matchMedia that throws", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: () => {
        throw new Error("nope");
      },
    });
    expect(prefersReducedMotion()).toBe(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });
});
