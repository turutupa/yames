/**
 * The tool test set's validator (DESIGN C3b; leg c3b1a): every item parses,
 * every expectation names a tool or a card that exists, every expected call
 * is accepted by the runner in its situation (the runner is the judge,
 * TOOLS 3.4), the counts meet the brief, and each file's hash is the one
 * `evals/coach/README.md` records (the set is held out: c3d checks it).
 *
 * A tool or a card renamed later fails here, not in the eval.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { PathDoc } from "../../paths/format";
import { loadAllPacks } from "../../session/packs";
import { COACH_TOOLS } from "../tools/registry";
import { CARD_IDS } from "./evalCards";
import { EVAL_LANGUAGES, judgeExpected, parseSetFile, type EvalItem } from "./evalWorld";

// Not `new URL(…, import.meta.url)`: Vite rewrites that into an asset URL.
const EVALS = join(dirname(fileURLToPath(import.meta.url)), "../../../evals/coach");
const setFile = (lng: string) => join(EVALS, "tools", `${lng}.jsonl`);
const README = join(EVALS, "README.md");

const SETS = new Map<string, { raw: string; items: EvalItem[] }>();
for (const lng of EVAL_LANGUAGES) {
  const file = setFile(lng);
  if (!existsSync(file)) continue;
  const raw = readFileSync(file, "utf8");
  SETS.set(lng, { raw, items: parseSetFile(raw) });
}

const BIG = new Set(["en", "es", "de"]);
const kindsOf = (items: readonly EvalItem[]) => {
  const n = { call: 0, card: 0, which: 0, yours: 0, none: 0 };
  for (const item of items) n[item.expect.kind] += 1;
  return n;
};

describe("the tool test set", () => {
  it("has a file for every language, every line an item of its own language, ids unique", () => {
    expect([...SETS.keys()].sort()).toEqual([...EVAL_LANGUAGES].sort());
    const ids = new Set<string>();
    for (const [lng, { items }] of SETS) {
      for (const item of items) {
        expect(item.lang, item.id).toBe(lng);
        expect(item.id.startsWith(`${lng}-`), item.id).toBe(true);
        expect(ids.has(item.id), item.id).toBe(false);
        ids.add(item.id);
        expect(item.reader, `${item.id}: not cross-read`).not.toBe("pending");
        expect(item.reader, item.id).not.toBe(item.writer);
      }
    }
  });

  it("names only tools and cards that exist", () => {
    const tools = new Set(COACH_TOOLS.filter((t) => t.audience === "player").map((t) => t.name));
    for (const { items } of SETS.values()) {
      for (const item of items) {
        if (item.expect.kind === "call") expect(tools.has(item.expect.tool), `${item.id}: ${item.expect.tool}`).toBe(true);
        if (item.expect.kind === "card") expect(CARD_IDS, item.id).toContain(item.expect.card);
      }
    }
  });

  describe.each([...EVAL_LANGUAGES])("%s: every expected call is accepted where it is asked", (lng) => {
    let paths: PathDoc[];
    beforeAll(async () => {
      paths = await loadAllPacks(lng);
    }, 120_000);
    it("the runner accepts it", () => {
      const wrong: string[] = [];
      for (const item of SETS.get(lng)?.items ?? []) {
        const why = judgeExpected(item, paths);
        if (why) wrong.push(`${item.id}: ${why}`);
      }
      expect(wrong).toEqual([]);
    });
  });

  // c3b1a's half: the calls and the asks and refusals, about two actions to one.
  it("meets this half's counts: 12 a language, 36 in en / es / de, two actions to one ask or refuse", () => {
    for (const [lng, { items }] of SETS) {
      const n = kindsOf(items);
      const half = items.length - n.card;
      expect(half, lng).toBeGreaterThanOrEqual(BIG.has(lng) ? 36 : 12);
      expect(n.call / half, `${lng} calls`).toBeGreaterThanOrEqual(0.55);
      expect(n.call / half, `${lng} calls`).toBeLessThanOrEqual(0.75);
      expect(n.which, `${lng} which`).toBeGreaterThanOrEqual(1);
      expect(n.yours, `${lng} yours`).toBeGreaterThanOrEqual(1);
      expect(n.none, `${lng} none`).toBeGreaterThanOrEqual(1);
    }
  });

  // c3b1b turns this on when it adds the card items (TOOLS 3.4's four / four / two).
  it.skip("meets the full mix: 20 a language, 60 in en / es / de, four actions / four answers / two ask or refuse in ten", () => {
    let total = 0;
    for (const [lng, { items }] of SETS) {
      const n = kindsOf(items);
      total += items.length;
      expect(items.length, lng).toBeGreaterThanOrEqual(BIG.has(lng) ? 60 : 20);
      expect(Math.abs(n.call / items.length - 0.4), `${lng} calls`).toBeLessThanOrEqual(0.1);
      expect(Math.abs(n.card / items.length - 0.4), `${lng} cards`).toBeLessThanOrEqual(0.1);
      expect(Math.abs((n.which + n.yours + n.none) / items.length - 0.2), `${lng} ask or refuse`).toBeLessThanOrEqual(0.1);
    }
    expect(total).toBeGreaterThanOrEqual(300);
  });

  it("is held out: each file's hash is the one the README records", () => {
    const readme = readFileSync(README, "utf8");
    for (const [lng, { raw }] of SETS) {
      const hash = createHash("sha256").update(raw).digest("hex");
      expect(readme, `${lng}.jsonl changed: record its new hash in evals/coach/README.md`).toContain(`| ${lng}.jsonl | ${hash} |`);
    }
  });
});
