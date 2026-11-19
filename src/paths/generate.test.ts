// The promises the pipeline makes about its output: reproducible bytes, packs
// that match their specs, and zero validator errors on everything we ship.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MINIMAL_SPEC, VARIANT_TEXT_SPEC } from "./fixtures/minimal";
import { PATH_SCHEMA_VERSION, REVIEW_STATUSES, subdivisionOf } from "./format";
import type { PathDoc } from "./format";
import { buildPath, serializePath } from "./generate";
import { packBytes, renderReviewPage, scheduleFixtures } from "./pipeline";
import type { PathSpec } from "./spec";
import { SPECS } from "./specs/index";
import { errorsIn, runtimeNeeds, validatePath } from "./validate";

const packPath = (id: string) => path.join(process.cwd(), `src/paths/packs/${id}.json`);

describe.each(SPECS.map((s) => [s.id, s] as const))("%s", (id, spec) => {
  it("generates the same bytes twice", () => {
    expect(packBytes(spec)).toBe(packBytes(spec));
  });

  it("the checked-in pack is exactly what its spec generates", () => {
    expect(readFileSync(packPath(id), "utf8")).toBe(packBytes(spec));
  });

  it("has zero validator errors, and zero warnings", () => {
    const issues = validatePath(JSON.parse(readFileSync(packPath(id), "utf8")));
    expect(errorsIn(issues).map((i) => `${i.rule} ${i.where}: ${i.message}`)).toEqual([]);
    expect(issues.map((i) => `${i.rule} ${i.where}`)).toEqual([]);
  });

  it("is a draft, and claims nothing else", () => {
    const doc = JSON.parse(readFileSync(packPath(id), "utf8")) as PathDoc;
    expect(doc.review.status).toBe("draft");
    expect(doc.review.history).toEqual([]);
    expect(REVIEW_STATUSES).toContain(doc.review.status);
    expect(doc.schemaVersion).toBe(PATH_SCHEMA_VERSION);
  });

  it("the review page is reproducible and self-contained", () => {
    const doc = JSON.parse(readFileSync(packPath(id), "utf8")) as PathDoc;
    const html = renderReviewPage(doc);
    expect(renderReviewPage(doc)).toBe(html);
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|https?:\/\//);
    expect(html).toContain("DRAFT");
  });
});

describe("the three Paths", () => {
  const docs = SPECS.map((s) => JSON.parse(packBytes(s)) as PathDoc);

  it("every Step has 3 to 5 Exercises", () => {
    for (const doc of docs) {
      for (const step of doc.steps) {
        expect(step.exercises.length, step.id).toBeGreaterThanOrEqual(3);
        expect(step.exercises.length, step.id).toBeLessThanOrEqual(5);
      }
    }
  });

  it("the Rust scoring test's fixture is up to date", () => {
    const file = path.join(process.cwd(), "src-tauri/tests/path_fixtures/schedules.jsonl");
    expect(readFileSync(file, "utf8")).toBe(scheduleFixtures(docs));
  });

  it("every Path has three open Levels, each with a warm-up that varies", () => {
    for (const doc of docs) {
      expect(doc.levels?.map((l) => l.id)).toEqual(["beginner", "intermediate", "advanced"]);
      for (const level of doc.levels!) {
        expect(level.entry).toBe("open");
        expect(level.warmups.length).toBeGreaterThan(0);
        for (const w of level.warmups) {
          expect(w.warmup?.advancesProgress).toBe(false);
          expect(w.variation!.variants.length).toBeGreaterThanOrEqual(6);
        }
      }
    }
  });

  it("linked arpeggios are the backbone of Intermediate Sweep Picking", () => {
    const sweep = docs.find((d) => d.id === "sweep-picking")!;
    const level = sweep.levels!.find((l) => l.id === "intermediate")!;
    const chained = sweep.steps
      .filter((s) => level.stepIds.includes(s.id))
      .flatMap((s) => s.exercises)
      .filter((e) => e.chain);
    expect(chained.length).toBeGreaterThanOrEqual(10);
    expect(level.stepIds.indexOf("the-link")).toBeLessThan(level.stepIds.indexOf("link-chains"));
    const advanced = sweep.levels!.find((l) => l.id === "advanced")!;
    expect(advanced.stepIds).toContain("six-strings");
  });

  it("no pass bar anywhere uses a number the audit ruled out", () => {
    const metrics = docs.flatMap((d) => d.steps.flatMap((s) => s.exercises.flatMap((e) => e.passBars.map((b) => b.metric))));
    expect(metrics).not.toContain("score");
    expect(metrics).not.toContain("gridAlignment");
  });

  it("the runtime's to-do list is computed from the packs", () => {
    // The Theory Paths grade only what is measured today: what they need of a
    // grader that does not exist yet is "your turn", self-checked.
    for (const doc of docs.filter((d) => d.kind === "theory")) {
      const needs = runtimeNeeds(doc);
      expect(needs.map((n) => n.metric)).toContain("noteIdentity");
      expect(needs.filter((n) => n.status === "new-grader").map((n) => n.metric)).toEqual([]);
    }
    expect(docs.filter((d) => d.kind === "theory").length).toBeGreaterThanOrEqual(1);
  });
});

describe("subdivisions", () => {
  it("are written only for a Path that asks, from the tightest gap", () => {
    expect(buildPath(MINIMAL_SPEC).steps[0].exercises[0].subdivision).toBeUndefined();
    const labelled = buildPath({ ...MINIMAL_SPEC, labelSubdivisions: true });
    for (const ex of labelled.steps.flatMap((s) => s.exercises)) {
      expect(ex.subdivision).toBe(subdivisionOf(ex.notes));
    }
    expect(validatePath(labelled).filter((i) => i.rule === "tab.subdivision")).toEqual([]);
  });

  it('"mostly" names a grid only where most of the notes move in it (QA 2 #14)', () => {
    let named = 0;
    for (const spec of SPECS.filter((s) => s.labelSubdivisions === "mostly")) {
      for (const ex of buildPath(spec).steps.flatMap((s) => s.exercises)) {
        if (ex.subdivision === undefined) continue;
        named += 1;
        expect(ex.subdivision).toBe(subdivisionOf(ex.notes));
        const gaps = ex.notes.slice(1).map((n, i) => n.tick - ex.notes[i].tick).filter((d) => d > 0);
        const tightest = Math.min(...gaps);
        expect(gaps.filter((d) => d === tightest).length * 2, ex.id).toBeGreaterThan(gaps.length);
      }
    }
    expect(named).toBeGreaterThan(100);
  });
});

describe("a variant's own text", () => {
  const plain = buildPath(MINIMAL_SPEC).levels![0].warmups[0];
  const warm = buildPath(VARIANT_TEXT_SPEC).levels![0].warmups[0];
  const variants = warm.variation!.variants;

  it("is copied from the build onto every variant after the first", () => {
    expect(variants.slice(1).map((v) => v.purpose)).toEqual(
      ["2", "3", "5", "7", "9"].map((key) => `A purpose of its own for the line moved up ${key} frets.`),
    );
    expect(variants[1].howTo).toEqual(["Play it evenly.", "Start at fret 5."]);
    expect(variants[5].howTo).toEqual(["Play it evenly.", "Start at fret 12."]);
  });

  it("is never written for the first variant: its text is the Exercise's", () => {
    expect(variants[0]).not.toHaveProperty("purpose");
    expect(variants[0]).not.toHaveProperty("howTo");
    expect(warm.purpose).toBe(plain.purpose);
    expect(warm.howTo).toEqual(plain.howTo);
    expect(serializePath(buildPath(VARIANT_TEXT_SPEC))).not.toContain("moved up 0 frets");
  });

  it("is not written when it only repeats the Exercise's", () => {
    const spec = VARIANT_TEXT_SPEC.levels![0].warmups[0];
    const same: PathSpec = {
      ...MINIMAL_SPEC,
      levels: MINIMAL_SPEC.levels!.map((level) => ({
        ...level,
        warmups: [{ ...spec, vary: { ...spec.vary!, build: (p) => ({ ...spec.vary!.build(p), purpose: spec.purpose, howTo: [...spec.howTo] }) } }],
      })),
    };
    expect(packBytes(same)).toBe(packBytes(MINIMAL_SPEC));
  });

  it("may be made from the Exercise's own how-to, to keep a line of it", () => {
    const spec = VARIANT_TEXT_SPEC.levels![0].warmups[0];
    const kept: PathSpec = {
      ...MINIMAL_SPEC,
      levels: MINIMAL_SPEC.levels!.map((level) => ({
        ...level,
        warmups: [
          {
            ...spec,
            howTo: ["Straight eighths, well under your clean tempo.", "Start at fret 3."],
            vary: {
              ...spec.vary!,
              build: (p) => ({ ...spec.vary!.build(p), purpose: undefined, howTo: (own) => [own[0], `Start at fret ${3 + Number(p.key)}.`] }),
            },
          },
        ],
      })),
    };
    const built = buildPath(kept).levels![0].warmups[0].variation!.variants;
    expect(built[2].howTo).toEqual(["Straight eighths, well under your clean tempo.", "Start at fret 6."]);
    expect(built[2]).not.toHaveProperty("purpose");
    // The first variant's comes out as the Exercise's own lines, and is not written.
    expect(built[0]).not.toHaveProperty("howTo");
  });

  it("changes nothing else, and sits with the variant's label in the pack", () => {
    const strip = (doc: PathDoc) =>
      JSON.stringify(doc, (key, value) => (key === "purpose" || key === "howTo" ? undefined : value));
    expect(strip(buildPath(VARIANT_TEXT_SPEC))).toBe(strip(buildPath(MINIMAL_SPEC)));
    expect(Object.keys(variants[1]).slice(0, 7)).toEqual(["id", "label", "params", "pool", "purpose", "howTo", "tab"]);
    expect(packBytes(VARIANT_TEXT_SPEC)).toBe(packBytes(VARIANT_TEXT_SPEC));
  });

  it("validates, and shows on the review page beside that variant's tab", () => {
    const doc = buildPath(VARIANT_TEXT_SPEC);
    expect(validatePath(JSON.parse(serializePath(doc))).map((i) => `${i.rule} ${i.where}`)).toEqual([]);
    const html = renderReviewPage(doc);
    // `includes`, not `toContain`: a failure must not print the whole page.
    expect(html.includes("This variant's own text")).toBe(true);
    expect(html.includes("<li>Start at fret 12.</li>")).toBe(true);
    expect(renderReviewPage(buildPath(MINIMAL_SPEC)).includes("own text")).toBe(false);
  });
});

describe("serialization", () => {
  it("keeps a note on one line, for reviewable diffs", () => {
    const text = serializePath(buildPath(MINIMAL_SPEC));
    expect(text).toMatch(/\{"string":5,"fret":5,"midi":50,"tick":0,"dur":480,"tech":\[\],"pick":"d"\},\n/);
    expect(text.endsWith("}\n")).toBe(true);
  });

  it("round-trips through JSON", () => {
    const doc = buildPath(MINIMAL_SPEC);
    expect(JSON.parse(serializePath(doc))).toEqual(JSON.parse(JSON.stringify(doc)));
  });
});
