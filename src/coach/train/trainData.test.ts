/**
 * The router's training files as committed (leg c3d1; brief items 1, 2, 5):
 *
 * - **Leakage**: no training or validation text, in a language, is the same as
 *   a held-out item's once normalised, or within an edit distance of 3 of one;
 *   and the held-out files still have the hashes `evals/coach/README.md` records.
 * - **Every answer is the runner's**: each call is accepted in its situation,
 *   each "which" is the runner's several matches, each "wrong screen" its
 *   refusal; numbers in an answer are numbers in the text; a relative tempo
 *   request carries no number.
 * - **Every rendered completion is one the grammar and `checkCall` accept.**
 * - The size, the share per language and the validation split.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { PathDoc } from "../../paths/format";
import { loadAllPacks } from "../../session/packs";
import { COACH_TOOLS } from "../tools/registry";
import { checkCall } from "../tools/run";
import { EVAL_LANGUAGES, effectOf, parseSetFile } from "../ask/evalWorld";
import { gbnfToRegExp } from "./gbnf";
import { ALREADY, WRONG_SCREEN } from "./generate";
import { LeakGuard } from "./leakage";
import { renderRecord, type TrainRecord } from "./render";

const EVALS = join(dirname(fileURLToPath(import.meta.url)), "../../../evals/coach");
const readJsonl = (file: string): TrainRecord[] =>
  existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as TrainRecord)
    : [];
const TRAIN = readJsonl(join(EVALS, "train", "train.jsonl"));
const VALIDATION = readJsonl(join(EVALS, "train", "validation.jsonl"));
const ALL = [...TRAIN, ...VALIDATION];

describe("the training files", () => {
  it("never come near the held-out set (normalised equality or edit distance <= 3, same language)", () => {
    const readme = readFileSync(join(EVALS, "README.md"), "utf8");
    const guard = new LeakGuard();
    for (const lng of EVAL_LANGUAGES) {
      const raw = readFileSync(join(EVALS, "tools", `${lng}.jsonl`));
      const hash = createHash("sha256").update(raw).digest("hex");
      expect(readme, `${lng}.jsonl changed`).toContain(`| ${lng}.jsonl | ${hash} |`);
      for (const item of parseSetFile(raw.toString("utf8"))) guard.add(lng, item.text);
      expect(guard.size(lng), lng).toBeGreaterThan(0);
    }
    const leaks = ALL.filter((r) => guard.leak(r.language, r.text) !== null).map((r) => `${r.id}: ${r.text}`);
    expect(leaks).toEqual([]);
  });

  it("are 8,000 to 15,000 records, at least 300 a language, with a 5% validation split stratified by language and kind", () => {
    expect(ALL.length).toBeGreaterThanOrEqual(8000);
    expect(ALL.length).toBeLessThanOrEqual(15000);
    const ids = new Set<string>();
    for (const r of ALL) {
      expect(ids.has(r.id), r.id).toBe(false);
      ids.add(r.id);
    }
    for (const lng of EVAL_LANGUAGES) {
      const mine = ALL.filter((r) => r.language === lng);
      expect(mine.length, lng).toBeGreaterThanOrEqual(300);
      for (const kind of ["call", "which", "yours", "none"]) {
        const n = mine.filter((r) => r.kind === kind).length;
        const v = VALIDATION.filter((r) => r.language === lng && r.kind === kind).length;
        expect(n, `${lng} ${kind}`).toBeGreaterThan(0);
        expect(v, `${lng} ${kind} validation`).toBeGreaterThan(0);
        expect(v / n, `${lng} ${kind} validation share`).toBeLessThan(0.12);
      }
      // Weighted to the decisions the stock models miss: calls well under the held-out set's two in three.
      expect(mine.filter((r) => r.kind === "call").length / mine.length, lng).toBeLessThan(0.5);
    }
    expect(VALIDATION.length / ALL.length).toBeGreaterThan(0.03);
    expect(VALIDATION.length / ALL.length).toBeLessThan(0.08);
  });

  describe.each([...EVAL_LANGUAGES])("%s", (lng) => {
    let paths: PathDoc[];
    const mine = ALL.filter((r) => r.language === lng);
    beforeAll(async () => {
      paths = await loadAllPacks(lng);
    }, 120_000);

    it("has every answer from the runner, and no number the player did not say", () => {
      const wrong: string[] = [];
      for (const r of mine) {
        const e = r.call ? effectOf(r.call, r.situation, lng, paths) : null;
        if (r.expect.kind === "call") {
          const ok = e !== null && (e.did !== null || e.refused?.startsWith("notWiredYet:") || (r.tags.includes("already") && ALREADY.test(e.refused ?? "")));
          if (!ok) wrong.push(`${r.id}: not accepted`);
          for (const v of Object.values(r.expect.args)) if (typeof v === "number" && !r.text.includes(String(v))) wrong.push(`${r.id}: ${v} not said`);
          if (r.expect.args.direction !== undefined && (r.expect.args.bpm !== undefined || /\d/.test(r.text))) wrong.push(`${r.id}: a number beside a direction`);
        }
        if (r.expect.kind === "which" && !e?.which) wrong.push(`${r.id}: not several`);
        if (r.tags.includes("wrong-screen") && !WRONG_SCREEN.test(e?.refused ?? "")) wrong.push(`${r.id}: not refused here`);
        if (r.tags.includes("withheld") && r.call && r.tools.includes(r.call.tool)) wrong.push(`${r.id}: shown`);
      }
      expect(wrong).toEqual([]);
    });

    it("renders completions the grammar and checkCall accept", () => {
      const bad: string[] = [];
      for (const r of mine) {
        const out = renderRecord(r, paths);
        if (!out.completion.endsWith("<|im_end|>") || !gbnfToRegExp(out.grammar).test(out.answer)) bad.push(`${r.id} grammar: ${out.answer}`);
        const parsed = JSON.parse(out.answer) as { tool?: string; args?: unknown };
        if (parsed.tool !== undefined && !checkCall({ tool: parsed.tool, args: parsed.args }, COACH_TOOLS).ok) bad.push(`${r.id} checkCall: ${out.answer}`);
      }
      expect(bad).toEqual([]);
    }, 300_000);
  });
});
