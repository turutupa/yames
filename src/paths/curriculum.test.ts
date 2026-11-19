import { describe, expect, it } from "vitest";
import { buildsOn, categoryOf, checkCurriculum, curriculumOrder, prerequisitePaths, unmetPrerequisites } from "./curriculum";
import type { PathDoc } from "./format";
import { buildPath } from "./generate";
import { SPECS } from "./specs/index";

type Linked = Pick<PathDoc, "id" | "prerequisites">;
const path = (id: string, ...paths: unknown[]): Linked =>
  ({ id, prerequisites: { paths, skills: [] } }) as unknown as Linked;
const rules = (docs: Linked[]) => checkCurriculum(docs).map((i) => i.rule);

describe("the curriculum graph", () => {
  it("accepts a chain and a diamond", () => {
    const docs = [
      path("a"),
      path("b", { path: "a" }),
      path("c", { path: "a", level: "beginner" }),
      path("d", { path: "b" }, { path: "c", level: "advanced" }),
    ];
    expect(checkCurriculum(docs)).toEqual([]);
  });

  it("refuses a prerequisite that does not exist", () => {
    const issues = checkCurriculum([path("a", { path: "nowhere" })]);
    expect(issues).toEqual([
      { rule: "curriculum.missing", where: "a.prerequisites.paths[0]", message: 'no Path called "nowhere"' },
    ]);
  });

  it("refuses a Path that builds on itself", () => {
    expect(rules([path("a", { path: "a" })])).toEqual(["curriculum.self"]);
  });

  it("refuses a cycle, once, and names the loop", () => {
    const issues = checkCurriculum([path("a", { path: "c" }), path("b", { path: "a" }), path("c", { path: "b" })]);
    expect(issues.map((i) => i.rule)).toEqual(["curriculum.cycle"]);
    expect(issues[0].message).toBe("a needs c needs b needs a");
  });

  it("refuses a two-Path cycle as well as a long one", () => {
    expect(rules([path("a", { path: "b" }), path("b", { path: "a" })])).toEqual(["curriculum.cycle"]);
  });

  it("refuses a Level that is not one, a bad shape, and a duplicate", () => {
    expect(rules([path("a"), path("b", { path: "a", level: "expert" })])).toEqual(["curriculum.level"]);
    expect(rules([path("a"), path("b", 7)])).toEqual(["curriculum.shape"]);
    expect(rules([path("a"), path("b", { path: "a" }, { path: "a", level: "beginner" })])).toEqual(["curriculum.duplicate"]);
  });

  it("orders every Path after what it builds on and keeps the given order otherwise", () => {
    const docs = [path("d", { path: "b" }), path("x"), path("b", { path: "a" }), path("a")];
    expect(curriculumOrder(docs).map((d) => d.id)).toEqual(["a", "b", "d", "x"]);
  });

  it("reads a prerequisite written as a bare id", () => {
    expect(prerequisitePaths(path("b", "a"))).toEqual([{ path: "a" }]);
  });

  it("says which prerequisites a player has not reached, and never invents a lock", () => {
    const doc = path("d", { path: "a" }, { path: "b", level: "beginner" }, { path: "gone" });
    const known = new Set(["a", "b", "d"]);
    const asked: Array<[string, string | undefined]> = [];
    const unmet = unmetPrerequisites(doc, known, (id, level) => {
      asked.push([id, level]);
      return id === "a";
    });
    expect(unmet).toEqual([{ path: "b", level: "beginner" }]);
    // A Path the app does not have is not asked about and not reported.
    expect(asked).toEqual([["a", undefined], ["b", "beginner"]]);
  });

  it("lists what builds on a Path", () => {
    expect(buildsOn([path("a"), path("b", { path: "a" }), path("c", { path: "b" })], "a")).toEqual(["b"]);
  });
});

describe("the shipped Paths", () => {
  const docs = SPECS.map((spec) => buildPath(spec));

  it("form a sound graph: every prerequisite exists and nothing leads back to itself", () => {
    expect(checkCurriculum(docs)).toEqual([]);
  });

  it("write every prerequisite as { path, level? }", () => {
    for (const doc of docs) {
      for (const need of doc.prerequisites.paths) {
        expect(typeof need.path, doc.id).toBe("string");
      }
    }
  });

  it("each say what they are about, and no Path about harmony is filed under styles", () => {
    const by = Object.fromEntries(docs.map((d) => [d.id, categoryOf(d)]));
    for (const doc of docs) expect(doc.category, doc.id).toBeDefined();
    expect(by["rhythm-foundations"]).toBe("foundations");
    expect(by["blues-pentatonics"]).toBe("style");
    expect(by["classic-rock"]).toBe("style");
    for (const id of ["know-the-neck", "scales-and-modes", "triads", "chords-in-a-key"]) expect(by[id], id).toBe("harmony");
    expect(by["sweep-picking"]).toBe("technique");
  });

  it("a pack from before categories reads as the old split", () => {
    expect(categoryOf({ kind: "theory" })).toBe("style");
    expect(categoryOf({ kind: "mechanics" })).toBe("technique");
  });
});
