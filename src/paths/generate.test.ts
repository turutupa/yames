// The promises the pipeline makes about its output: reproducible bytes, packs
// that match their specs, and zero validator errors on everything we ship.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MINIMAL_SPEC } from "./fixtures/minimal";
import { PATH_SCHEMA_VERSION, REVIEW_STATUSES } from "./format";
import type { PathDoc } from "./format";
import { buildPath, serializePath } from "./generate";
import { packBytes, renderReviewPage, scheduleFixtures } from "./pipeline";
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
    const needs = runtimeNeeds(docs[2]);
    expect(needs.map((n) => n.metric)).toContain("landingChordTone");
    expect(needs.find((n) => n.metric === "landingChordTone")?.status).toBe("new-grader");
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
