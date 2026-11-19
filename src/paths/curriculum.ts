/**
 * The curriculum: how Paths build on each other.
 *
 * A Path may name Paths it builds on (`PathDoc.prerequisites.paths`). That is
 * guidance and never a lock: the product rule is that nothing is locked, so the
 * app may say "before this, do X, or start anyway" and no more. This file is
 * the whole of the logic: the check that the graph is sound (every reference
 * exists, no Path builds on itself, no chain leads back to where it started),
 * the order a beginner would meet the Paths in, and which of a Path's
 * prerequisites a given player has not reached yet.
 */
import { LEVEL_IDS } from "./format";
import type { LevelId, PathCategory, PathDoc, PathPrerequisite } from "./format";

export const CURRICULUM_RULES = {
  "curriculum.shape": "a prerequisite that is not { path, level? }",
  "curriculum.self": "a Path that builds on itself",
  "curriculum.missing": "a prerequisite Path that does not exist",
  "curriculum.level": "a prerequisite Level that is not beginner, intermediate or advanced",
  "curriculum.duplicate": "the same prerequisite Path listed twice",
  "curriculum.cycle": "prerequisite Paths that form a cycle",
} as const;

export type CurriculumRuleId = keyof typeof CURRICULUM_RULES;
export type CurriculumIssue = { rule: CurriculumRuleId; where: string; message: string };

type Linked = Pick<PathDoc, "id" | "prerequisites">;

const isLevel = (value: unknown): value is LevelId => LEVEL_IDS.includes(value as LevelId);

/** The prerequisite Paths of a doc, tolerating a pack written before they were objects. */
export function prerequisitePaths(doc: Linked): PathPrerequisite[] {
  const listed: unknown = doc.prerequisites?.paths;
  if (!Array.isArray(listed)) return [];
  return listed.flatMap((entry: unknown): PathPrerequisite[] => {
    if (typeof entry === "string") return [{ path: entry }];
    if (entry && typeof entry === "object" && typeof (entry as PathPrerequisite).path === "string") {
      const { path, level } = entry as PathPrerequisite;
      return [isLevel(level) ? { path, level } : { path }];
    }
    return [];
  });
}

/** Every problem with the graph the docs form together. All of them are errors. */
export function checkCurriculum(docs: readonly Linked[]): CurriculumIssue[] {
  const issues: CurriculumIssue[] = [];
  const ids = new Set(docs.map((d) => d.id));
  for (const doc of docs) {
    const listed: unknown = doc.prerequisites?.paths;
    const seen = new Set<string>();
    for (const [index, entry] of (Array.isArray(listed) ? listed : []).entries()) {
      const where = `${doc.id}.prerequisites.paths[${index}]`;
      const one = entry as Partial<PathPrerequisite> | null;
      if (!one || typeof one !== "object" || typeof one.path !== "string" || !one.path.trim()) {
        issues.push({ rule: "curriculum.shape", where, message: `found ${JSON.stringify(entry)}` });
        continue;
      }
      if (one.level !== undefined && !isLevel(one.level)) {
        issues.push({ rule: "curriculum.level", where, message: `"${String(one.level)}" is not a Level` });
      }
      if (one.path === doc.id) {
        issues.push({ rule: "curriculum.self", where, message: `${doc.id} lists itself` });
      } else if (!ids.has(one.path)) {
        issues.push({ rule: "curriculum.missing", where, message: `no Path called "${one.path}"` });
      }
      if (seen.has(one.path)) {
        issues.push({ rule: "curriculum.duplicate", where, message: `"${one.path}" is listed more than once` });
      }
      seen.add(one.path);
    }
  }
  // Cycles, reported once each, from the Path that comes first in `docs`.
  const edges = new Map(docs.map((d) => [d.id, prerequisitePaths(d).map((p) => p.path).filter((p) => ids.has(p) && p !== d.id)]));
  const state = new Map<string, 1 | 2>();
  const reported = new Set<string>();
  const visit = (id: string, trail: string[]) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      const loop = [...trail.slice(trail.indexOf(id)), id];
      const key = [...new Set(loop)].sort().join(",");
      if (!reported.has(key)) {
        reported.add(key);
        issues.push({ rule: "curriculum.cycle", where: `${id}.prerequisites.paths`, message: loop.join(" needs ") });
      }
      return;
    }
    state.set(id, 1);
    for (const next of edges.get(id) ?? []) visit(next, [...trail, id]);
    state.set(id, 2);
  };
  for (const doc of docs) visit(doc.id, []);
  return issues;
}

/**
 * The docs with every Path after the ones it builds on, otherwise in the order
 * given. With a cycle (which `checkCurriculum` refuses) the order given wins.
 */
export function curriculumOrder<T extends Linked>(docs: readonly T[]): T[] {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const done = new Set<string>();
  const open = new Set<string>();
  const out: T[] = [];
  const place = (doc: T) => {
    if (done.has(doc.id) || open.has(doc.id)) return;
    open.add(doc.id);
    for (const need of prerequisitePaths(doc)) {
      const before = byId.get(need.path);
      if (before) place(before);
    }
    open.delete(doc.id);
    done.add(doc.id);
    out.push(doc);
  };
  for (const doc of docs) place(doc);
  return out;
}

/**
 * The prerequisites of `doc` this player has not reached. `reached(path, level)`
 * answers for one of them: with a Level, "is that Level of that Path done";
 * without, "has the player started that Path". A prerequisite whose Path is not
 * in the app is left out: there is nothing to send the player to.
 */
export function unmetPrerequisites(
  doc: Linked,
  known: ReadonlySet<string>,
  reached: (path: string, level: LevelId | undefined) => boolean,
): PathPrerequisite[] {
  return prerequisitePaths(doc).filter((need) => known.has(need.path) && !reached(need.path, need.level));
}

/** Every Path that names `id` as a prerequisite, directly. */
export function buildsOn(docs: readonly Linked[], id: string): string[] {
  return docs.filter((d) => prerequisitePaths(d).some((p) => p.path === id)).map((d) => d.id);
}

/** What a Path is about: its own `category`, or the old two-way split for a pack without one. */
export function categoryOf(doc: Pick<PathDoc, "kind" | "category">): PathCategory {
  return doc.category ?? (doc.kind === "theory" ? "style" : "technique");
}
