/**
 * The search's fixtures (DESIGN 10, C2c's gate: "search fixtures in en, de,
 * ja"), against the real packs in each language: the questions a teacher can
 * answer from a Path, and the near-misses that must get none.
 *
 * With `SEARCH_REPORT=1` it prints every question's best scores and the
 * index's build time and size: that is how `SEARCH_FLOOR` was set.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { PathDoc } from "../../paths/format";
import { loadAllPacks } from "../../session/packs";
import { answerSearchFor, buildSearchIndex, INDEXED_FIELDS, searchPaths, type SearchHit, type SearchIndex } from "./search";

type Fixture = {
  lng: string;
  questions: Array<{ q: string; expect: string[] }>;
  none: string[];
};

const FIXTURES = import.meta.glob<Fixture>("./searchData/fixtures/*.json", { eager: true, import: "default" });
const BY_LNG = new Map(Object.values(FIXTURES).map((f) => [f.lng, f]));
const REPORT = !!process.env.SEARCH_REPORT;

/**
 * What each language found on 2026-11-20 (a change that lowers one is a
 * regression; one that raises it should raise the number): the right Step
 * first and in the first three, ranked with no floor, and first AND over the
 * floor (what the player is actually answered).
 */
const KEEP: Readonly<Record<string, { at1: number; at3: number; answered: number }>> = {
  en: { at1: 15, at3: 18, answered: 14 },
  de: { at1: 11, at3: 14, answered: 10 },
  ja: { at1: 9, at3: 12, answered: 9 },
  es: { at1: 2, at3: 3, answered: 1 },
  ru: { at1: 1, at3: 2, answered: 1 },
  "zh-CN": { at1: 1, at3: 4, answered: 1 },
};

const isHit = (hit: SearchHit, expected: string[]) => expected.includes(`${hit.pathId}/${hit.stepId}`);

const where = (h: SearchHit | undefined) =>
  h ? `${h.score.toFixed(2)}/${h.coverage.toFixed(2)}/${h.strength.toFixed(3)} ${h.pathId}/${h.stepId}` : "-";

describe.each([...BY_LNG.keys()].sort())("search fixtures: %s", (lng) => {
  const fixture = BY_LNG.get(lng)!;
  let index: SearchIndex;
  let packs: PathDoc[];

  beforeAll(async () => {
    packs = await loadAllPacks(lng);
    const heapBefore = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    index = buildSearchIndex(packs, lng);
    const ms = performance.now() - t0;
    if (REPORT) {
      const heapMb = (process.memoryUsage().heapUsed - heapBefore) / 2 ** 20;
      let entries = 0;
      for (const list of index.byPassage.postings.values()) entries += list.docs.length;
      for (const list of index.bySteps.postings.values()) entries += list.docs.length;
      const textChars = index.passages.reduce((n, p) => n + p.text.length, 0);
      console.log(
        `[search-report] ${lng} build ${ms.toFixed(0)} ms, packs ${packs.length}, passages ${index.passages.length}, ` +
          `terms ${index.byPassage.postings.size}, steps ${index.bySteps.lengths.length}, postings ${entries}, text ${textChars} chars, heap +${heapMb.toFixed(1)} MB`,
      );
    }
  }, 180_000);

  it(`finds the passage a teacher would point at (${fixture.questions.length} questions)`, () => {
    let at1 = 0;
    let at3 = 0;
    let answered = 0;
    for (const { q, expect: expected } of fixture.questions) {
      const hits = searchPaths(q, index, { floor: null });
      const one = hits[0] && isHit(hits[0], expected);
      const three = hits.slice(0, 3).some((h) => isHit(h, expected));
      if (one) at1++;
      if (three) at3++;
      const said = searchPaths(q, index)[0];
      if (said && isHit(said, expected)) answered++;
      if (REPORT) {
        const mark = one ? "HIT1" : three ? "HIT3" : "MISS";
        console.log(`[search-report] ${lng} ${mark} ${where(hits[0])} | ${where(hits[1])} | ${where(hits[2])} :: ${q}`);
      }
    }
    const n = fixture.questions.length;
    if (REPORT) console.log(`[search-report] ${lng} hits@1 ${at1}/${n} hits@3 ${at3}/${n} answered ${answered}/${n}`);
    expect(at1).toBeGreaterThanOrEqual(KEEP[lng]?.at1 ?? 0);
    expect(at3).toBeGreaterThanOrEqual(KEEP[lng]?.at3 ?? 0);
    expect(answered).toBeGreaterThanOrEqual(KEEP[lng]?.answered ?? 0);
  });

  it.runIf(REPORT)("report: the same questions with the Steps' goals searched too", () => {
    const withGoal = buildSearchIndex(packs, lng, [...INDEXED_FIELDS, "goal"]);
    let at1 = 0;
    let at3 = 0;
    let answered = 0;
    for (const { q, expect: expected } of fixture.questions) {
      const hits = searchPaths(q, withGoal, { floor: null });
      if (hits[0] && isHit(hits[0], expected)) at1++;
      if (hits.slice(0, 3).some((h) => isHit(h, expected))) at3++;
      const said = searchPaths(q, withGoal)[0];
      if (said && isHit(said, expected)) answered++;
    }
    const through = fixture.none.filter((q) => searchPaths(q, withGoal).length > 0).length;
    console.log(`[search-report] ${lng} WITH GOAL hits@1 ${at1} hits@3 ${at3} answered ${answered} near-misses through ${through}`);
  });

  it.runIf(lng === "en" || lng === "ja")("answers with the passage byte for byte, one text block, from the Path · Step N", () => {
    let quoted = 0;
    for (const { q } of fixture.questions) {
      const result = answerSearchFor(q, { language: lng, paths: packs });
      if (!result) continue;
      quoted++;
      const { hit } = result;
      const path = packs.find((p) => p.id === hit.pathId)!;
      const step = path.steps.find((s) => s.id === hit.stepId)!;
      const ex = step.exercises.find((e) => e.id === hit.exerciseId);
      const owner: Record<string, unknown> = ex ?? step;
      const field = owner[hit.field] as string | string[];
      const said = Array.isArray(field) ? field[hit.line!] : field;
      expect(result.answer).toEqual({ blocks: [{ type: "text", text: said }] });
      expect(result.source).toEqual({ kind: "path", step: step.order });
      expect(result.candidates[0]).toBe(hit);
    }
    expect(quoted).toBeGreaterThan(5);
  });

  it(`answers none to every near-miss (${fixture.none.length})`, () => {
    const wrong: string[] = [];
    for (const q of fixture.none) {
      if (REPORT) console.log(`[search-report] ${lng} NONE ${where(searchPaths(q, index, { floor: null })[0])} :: ${q}`);
      const answered = searchPaths(q, index)[0];
      if (answered) wrong.push(`${q} -> ${where(answered)}`);
    }
    expect(wrong).toEqual([]);
  });
});
