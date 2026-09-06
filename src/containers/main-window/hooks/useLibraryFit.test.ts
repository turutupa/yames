import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLibraryFit, LIBRARY_MIN_WIDTH } from "./useLibraryFit";

function setWidth(px: number) {
  Object.defineProperty(window, "innerWidth", { value: px, configurable: true, writable: true });
}

const originalWidth = window.innerWidth;
afterEach(() => {
  setWidth(originalWidth);
  vi.restoreAllMocks();
});

describe("useLibraryFit", () => {
  it("leaves a wide window alone", () => {
    setWidth(1400);
    const setOpen = vi.fn();
    renderHook(() => useLibraryFit(true, setOpen));
    expect(setOpen).not.toHaveBeenCalled();
  });

  it("closes the library when the window cannot hold it", () => {
    setWidth(480);
    const setOpen = vi.fn();
    renderHook(() => useLibraryFit(true, setOpen));
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("gives the library back, and only what the user had", () => {
    setWidth(1400);
    const setOpen = vi.fn();
    // The user closed it themselves at a width that could have shown it.
    const { rerender } = renderHook(({ open }) => useLibraryFit(open, setOpen), {
      initialProps: { open: false },
    });

    setWidth(480);
    act(() => window.dispatchEvent(new Event("resize")));
    rerender({ open: false });

    setWidth(1400);
    act(() => window.dispatchEvent(new Event("resize")));
    // Restored to false — their choice, not forced open.
    expect(setOpen).toHaveBeenLastCalledWith(false);
  });

  it("restores an open library after a trip through a narrow window", () => {
    setWidth(1400);
    const setOpen = vi.fn();
    const { rerender } = renderHook(({ open }) => useLibraryFit(open, setOpen), {
      initialProps: { open: true },
    });

    setWidth(480);
    act(() => window.dispatchEvent(new Event("resize")));
    rerender({ open: false });

    setWidth(1400);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(setOpen).toHaveBeenLastCalledWith(true);
  });

  it("does nothing when the environment cannot report a width", () => {
    // The bug this guards: a stubbed matchMedia answers every query false,
    // which an earlier version read as "too narrow" and used to collapse the
    // library in a 1024px test window.
    setWidth(0);
    const setOpen = vi.fn();
    renderHook(() => useLibraryFit(true, setOpen));
    expect(setOpen).not.toHaveBeenCalled();
  });

  it("collapses exactly one pixel below the stylesheet's breakpoint", () => {
    // This constant and the `max-width` in shell.css are one decision in two
    // files; if they drift, the rail overlays the stage with no way back.
    const setOpen = vi.fn();
    setWidth(LIBRARY_MIN_WIDTH);
    const a = renderHook(() => useLibraryFit(true, setOpen));
    expect(setOpen).not.toHaveBeenCalled();
    a.unmount();

    setWidth(LIBRARY_MIN_WIDTH - 1);
    renderHook(() => useLibraryFit(true, setOpen));
    expect(setOpen).toHaveBeenCalledWith(false);
  });
});
