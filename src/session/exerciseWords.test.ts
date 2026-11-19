import { describe, expect, it } from "vitest";
import type { Exercise, PathDoc } from "../paths/format";
import { localizePack, readOverlay } from "../paths/strings";
import triadsJson from "../paths/packs/triads.json";
import triadsRu from "../paths/packs/i18n/ru/triads.json";
import { exerciseWords, plannedPurpose } from "./exerciseWords";
import { withVariant } from "./take";

const triads = triadsJson as unknown as PathDoc;
const find = (doc: PathDoc, id: string): Exercise =>
  doc.steps.flatMap((s) => s.exercises).find((e) => e.id === id)!;
const KEYED = "three-chords.stay-put-keys";
const seedOf = (ex: Exercise, variantId: string) => ex.variation!.variants.findIndex((v) => v.id === variantId);

describe("exerciseWords", () => {
  const base = find(triads, KEYED);

  it("reads the played variant's own how-to, every line of it", () => {
    const played = withVariant(base, seedOf(base, "key=E"));
    const words = exerciseWords(base, played);
    expect(words.howTo).toEqual(base.variation!.variants.find((v) => v.id === "key=E")!.howTo);
    expect(words.howTo.length).toBeGreaterThan(1);
    expect(words.howTo[1]).toMatch(/^In E\b/);
    expect(words.howTo).not.toEqual(base.howTo);
  });

  it("two variants of one Exercise say different second lines", () => {
    const e = exerciseWords(base, withVariant(base, seedOf(base, "key=E"))).howTo[1];
    const bb = exerciseWords(base, withVariant(base, seedOf(base, "key=Bb"))).howTo[1];
    expect(e).not.toBe(bb);
    expect(bb).toMatch(/B flat/);
  });

  it("falls back on the Exercise's text when the variant has none", () => {
    const played = withVariant(base, seedOf(base, "key=D"));
    expect(base.variation!.variants.find((v) => v.id === "key=D")!.howTo).toBeUndefined();
    const words = exerciseWords(base, played);
    expect(words.howTo).toEqual(base.howTo);
    expect(words.purpose).toBe(base.purpose);
  });

  it("falls back field by field, and with no Take at all", () => {
    expect(exerciseWords(base, null)).toEqual({ purpose: base.purpose, howTo: base.howTo });
    const own = exerciseWords(base, { purpose: "  ", howTo: ["Mine."] });
    expect(own).toEqual({ purpose: base.purpose, howTo: ["Mine."] });
    const blank = exerciseWords(base, { purpose: "Own purpose.", howTo: ["", " "] });
    expect(blank).toEqual({ purpose: "Own purpose.", howTo: base.howTo });
    expect(exerciseWords(null, null)).toEqual({ purpose: "", howTo: [] });
  });

  it("a planned step's purpose follows its variant, the Exercise's when none is planned", () => {
    expect(plannedPurpose(base, null)).toBe(base.purpose);
    const withOwn: Exercise = {
      ...base,
      variation: {
        ...base.variation!,
        variants: base.variation!.variants.map((v, i) => (i === 1 ? { ...v, purpose: "Own." } : v)),
      },
    };
    expect(plannedPurpose(withOwn, 1)).toBe("Own.");
    expect(plannedPurpose(withOwn, 0)).toBe(base.purpose);
  });

  it("the variant's words come translated through the pack's overlay", () => {
    const overlay = readOverlay(triadsRu);
    expect(overlay).not.toBeNull();
    const ru = localizePack(triads, overlay);
    const ex = find(ru, KEYED);
    const words = exerciseWords(ex, withVariant(ex, seedOf(ex, "key=E")));
    const key = `exercise.${KEYED}.variant.key=E.howTo.1`;
    const wanted = overlay!.strings[key];
    expect(wanted).toBeTruthy();
    // Translated when its English source is current, English otherwise: never empty.
    expect([wanted, base.variation!.variants.find((v) => v.id === "key=E")!.howTo![1]]).toContain(words.howTo[1]);
    expect(words.howTo[1]).toMatch(/[Ѐ-ӿ]/);
  });
});
