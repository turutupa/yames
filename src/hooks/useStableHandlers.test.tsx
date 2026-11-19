import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStableHandlers } from "./useStableHandlers";

describe("useStableHandlers", () => {
  it("hands back the same function every render, and it calls the latest closure", () => {
    const first = vi.fn(() => "first");
    const second = vi.fn(() => "second");
    const { result, rerender } = renderHook(({ on }: { on: (n: number) => string }) => useStableHandlers({ on }), {
      initialProps: { on: first },
    });
    const stable = result.current.on;
    expect(stable(1)).toBe("first");
    rerender({ on: second });
    expect(result.current.on).toBe(stable);
    expect(stable(2)).toBe("second");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(2);
  });

  it("an absent handler stays absent, and comes back as the same function", () => {
    const fn = vi.fn();
    const { result, rerender } = renderHook(({ on }: { on?: () => void }) => useStableHandlers({ on }), {
      initialProps: { on: fn } as { on?: () => void },
    });
    const stable = result.current.on;
    rerender({ on: undefined });
    expect(result.current.on).toBeUndefined();
    rerender({ on: fn });
    expect(result.current.on).toBe(stable);
  });
});
