import { describe, expect, it } from "vitest";
import type { PathDoc } from "../paths/format";
import { pickDirectionMatters, stepPickDirectionMatters } from "./caveats";
import { ALT } from "./testKit";

const load = (g: Record<string, unknown>) => (Object.values(g)[0] as { default: unknown }).default as PathDoc;
const BLUES = load(import.meta.glob("../paths/packs/blues-pentatonics.json", { eager: true }));
const SHRED = load(import.meta.glob("../paths/packs/shred.json", { eager: true }));

describe("the pick-direction caveat (QA 2026-11-17 #15)", () => {
  it("shows on an alternate-picked Exercise with strokes", () => {
    expect(pickDirectionMatters(ALT.steps[0].exercises[0])).toBe(true);
    expect(stepPickDirectionMatters(ALT.steps[0])).toBe(true);
  });

  it("not on any Blues Exercise, band Takes included", () => {
    const all = BLUES.steps.flatMap((s) => s.exercises);
    expect(all.some((e) => e.backing.kind === "jam")).toBe(true);
    expect(all.filter(pickDirectionMatters)).toEqual([]);
    expect(BLUES.steps.filter(stepPickDirectionMatters)).toEqual([]);
  });

  it("not on a legato line with no strokes printed", () => {
    const legato = SHRED.steps.flatMap((s) => s.exercises).filter((e) => e.notes.every((n) => n.pick === undefined));
    expect(legato.length).toBeGreaterThan(0);
    for (const e of legato) expect(pickDirectionMatters(e), e.id).toBe(false);
  });
});
