import { describe, expect, it, vi } from "vitest";
import { Adaptive, pickTier, tierSettings } from "./quality";
import { isSoftwareRenderer } from "./webgl";

describe("pickTier", () => {
  const desk = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
  it("honours a forced tier", () => expect(pickTier({ forced: 1, userAgent: desk, gpu: "NVIDIA" })).toBe(1));
  it("puts software rendering on tier 0", () => {
    expect(pickTier({ userAgent: desk, gpu: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))" })).toBe(0);
    expect(pickTier({ userAgent: desk, gpu: "llvmpipe (LLVM 15.0.7, 256 bits)" })).toBe(0);
  });
  it("puts integrated Intel on tier 1 and a discrete GPU on tier 2", () => {
    expect(pickTier({ userAgent: desk, gpu: "ANGLE (Intel, Intel(R) UHD Graphics 620)" })).toBe(1);
    expect(pickTier({ userAgent: desk, gpu: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070)" })).toBe(2);
  });
  it("puts phones on tier 1, old phone GPUs on 0", () => {
    const phone = "Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile";
    expect(pickTier({ userAgent: phone, gpu: "Mali-G710" })).toBe(1);
    expect(pickTier({ userAgent: phone, gpu: "Adreno (TM) 506" })).toBe(0);
  });
  it("sizes textures and shadows by tier", () => {
    expect(tierSettings(2)).toEqual({ maxDpr: 2, textureScale: 1, shadows: true });
    expect(tierSettings(0).shadows).toBe(false);
    expect(tierSettings(0).maxDpr).toBe(1.6);
  });
});

describe("Adaptive", () => {
  it("leaves quality alone while frames are on budget", () => {
    const lower = vi.fn(() => true);
    const a = new Adaptive(lower, 10, 26);
    for (let i = 0; i < 100; i++) a.sample(16.7);
    expect(lower).not.toHaveBeenCalled();
  });

  it("lowers resolution first, then shadows, then stops asking", () => {
    const steps: string[] = [];
    const a = new Adaptive((step) => {
      steps.push(step);
      return step === "resolution" || steps.filter((s) => s === "shadows").length === 1;
    }, 10, 26);
    for (let i = 0; i < 200; i++) a.sample(40);
    expect(steps.slice(0, 3)).toEqual(["resolution", "resolution", "resolution"]);
    expect(steps[3]).toBe("shadows");
    // Asked once more, refused, and never again.
    expect(steps.length).toBe(5);
    expect(a.dprScale).toBeCloseTo(0.62, 5);
  });

  it("forgets a partial window on reset", () => {
    const lower = vi.fn(() => true);
    const a = new Adaptive(lower, 10, 26);
    for (let i = 0; i < 9; i++) a.sample(50);
    a.reset();
    for (let i = 0; i < 9; i++) a.sample(50);
    expect(lower).not.toHaveBeenCalled();
  });
});


describe("software renderers", () => {
  it("are recognised, so the stage falls back to the SVG neck on them", () => {
    expect(isSoftwareRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)")).toBe(true);
    expect(isSoftwareRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (NVIDIA Corporation, NVIDIA GB10/PCIe, OpenGL ES 3.2)")).toBe(false);
    expect(isSoftwareRenderer("Apple M2")).toBe(false);
  });
});
