/**
 * The flag's contract, which every mobile composition test depends on:
 * absent → desktop, and a stubbed global → mobile, provided the module is
 * re-imported after the stub. See `src/platform.ts`.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

describe("IS_MOBILE", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("is false when nothing defines __YAMES_MOBILE__ — the desktop app", async () => {
    const { IS_MOBILE } = await import("./platform");
    expect(IS_MOBILE).toBe(false);
  });

  it("is true once the global is stubbed and the module re-evaluated", async () => {
    vi.stubGlobal("__YAMES_MOBILE__", true);
    vi.resetModules();
    const { IS_MOBILE } = await import("./platform");
    expect(IS_MOBILE).toBe(true);
  });
});
