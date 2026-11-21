import { describe, expect, it } from "vitest";
import type { Exercise, PathDoc } from "./format";
import { buildPath } from "./generate";
import { rewriteReport, shapeOf } from "./rewrites";
import { SPECS } from "./specs/index";

const spec = (id: string) => SPECS.find((s) => s.id === id)!;
const exercisesOf = (d: PathDoc): Exercise[] => [...d.steps.flatMap((s) => s.exercises), ...(d.levels ?? []).flatMap((l) => l.warmups)];
const find = (d: PathDoc, id: string) => exercisesOf(d).find((e) => e.id === id)!;

describe("the check's report on the variant rewriter", () => {
  it("a generated pack has no errors, and lists what was said in other words", () => {
    const s = spec("tapping");
    const r = rewriteReport(buildPath(s), buildPath({ ...s, variantText: false }));
    expect(r.errors).toEqual([]);
    expect(r.rewritten).toContainEqual({
      where: "scale-under-the-tap.scale-tap#stringSet=B:-12-over-5-6-8",
      kind: "howTo",
      from: "Lean a little on the fourth note, the A at fret 5. It is the middle of the beat and keeps the six even.",
      to: "Lean a little on the fourth note, the E at fret 5. It is the middle of the beat and keeps the six even.",
    });
  });

  it("lists the cues a variant cannot say", () => {
    // No shipped pack has one since leg fc1, so the cue First Chords used to have is put back by hand.
    const doc = buildPath(spec("first-chords"));
    expect(rewriteReport(doc, null).refused).toEqual([]);
    const ex = find(doc, "warmup-advanced.small-barre");
    ex.cues = [...(ex.cues ?? []), { when: "late", say: "Arrive at each new fret by its click." }];
    const r = rewriteReport(doc, null);
    expect(r.refused).toContainEqual({
      where: "warmup-advanced.small-barre#stringSet=D-and-G,shapeOrder=going-up",
      cue: "Arrive at each new fret by its click.",
      reason: "a layout of frets, and the frets moved differently",
    });
    expect(r.errors).toEqual([]);
  });

  it("a how-to line the rewriter would not write is an error (a pack from the old rewriter)", () => {
    const s = spec("tapping");
    const doc = buildPath(s);
    const v = find(doc, "scale-under-the-tap.scale-tap").variation!.variants.find((x) => x.id === "stringSet=B:-12-over-5-6-8")!;
    v.howTo = [v.howTo![0], "Lean a little on the fourth note, the C at fret 5. It is the middle of the beat and keeps the six even."];
    const r = rewriteReport(doc, buildPath({ ...s, variantText: false }));
    expect(r.errors.map((e) => [e.where, e.kind])).toEqual([["scale-under-the-tap.scale-tap#stringSet=B:-12-over-5-6-8", "howTo"]]);
  });

  it("a cue the rewriter would not say is an error: Know the Neck's false sharp", () => {
    const doc = buildPath(spec("know-the-neck"));
    const ex = find(doc, "top-strings-keys.g-major-strings");
    ex.cues = [...(ex.cues ?? []), { when: "notes", say: "Play F sharp, the one sharp in G major." }];
    const v = ex.variation!.variants.find((x) => x.id === "stringSet=B-string")!;
    v.cues = [...(v.cues ?? ex.cues.slice(0, -1)), { when: "notes", say: "Play A, the one sharp in G major." }];
    const r = rewriteReport(doc, null);
    expect(r.errors).toEqual([
      { where: "top-strings-keys.g-major-strings#stringSet=B-string", kind: "cue", text: "Play A, the one sharp in G major.", message: "a cue the rewriter does not say for these notes" },
    ]);
    expect(r.refused).toContainEqual({
      where: "top-strings-keys.g-major-strings#stringSet=B-string",
      cue: "Play F sharp, the one sharp in G major.",
      reason: "a note name, and the notes did not all move the same interval",
    });
  });

  it("a sentence's shape blanks note names, numbers and strings", () => {
    expect(shapeOf("Lean on the A at fret 5 on the low E string.")).toBe(shapeOf("Lean on the F sharp at fret 12 on the B string."));
    expect(shapeOf("Lean on the A at fret 5.")).not.toBe(shapeOf("Lean on the A at fret 5, then rest."));
  });
});
