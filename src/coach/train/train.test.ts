/**
 * The training-set generator's own tests (leg c3d1): the grammar matcher, the
 * ChatML copy against the Rust, the leak measure, and the generator on
 * English with a small wordings file: the runner decides every answer, no
 * number is invented, the mix leans on the decisions the stock models miss.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { PathDoc } from "../../paths/format";
import { loadAllPacks } from "../../session/packs";
import { COACH_TOOLS, toolCatalogue } from "../tools/registry";
import { EVAL_CARDS } from "../ask/evalCards";
import { effectOf } from "../ask/evalWorld";
import { choiceGrammar } from "../ask/grammar";
import { gbnfAccepts, gbnfToRegExp } from "./gbnf";
import { LeakGuard, editDistance, leakKey } from "./leakage";
import { ASK_SYSTEM_PROMPT, askPromptHead, askPromptTail, renderRecord } from "./render";
import { ALREADY, WRONG_SCREEN, generateLanguage, judgeCard, languageData, splitValidation, wordingProblem, type WordingsFile } from "./generate";
import { CALL_INTENTS, INTENTS, intentById } from "./intents";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("gbnf", () => {
  const grammar = choiceGrammar(toolCatalogue(COACH_TOOLS), EVAL_CARDS);
  const re = gbnfToRegExp(grammar);
  it("accepts the three shapes the choice grammar allows", () => {
    for (const ok of [
      '{"answer":"which"}',
      '{ "answer": "none" }',
      '{"tool":"go_to","args":{"screen":"paths"}}',
      '{"tool":"set_tempo","args":{"direction":"faster"}}',
      '{"tool":"set_tempo","args":{"bpm":120}}',
      '{"tool":"show_chord","args":{"chord":"F#m7"}}',
      '{"tool":"open_path","args":{"path":"Alternate picking"}}',
      '{"tool":"explain_screen","args":{}}',
    ])
      expect(re.test(ok), ok).toBe(true);
  });
  it("refuses what it does not", () => {
    for (const bad of [
      '{"answer":"maybe"}',
      '{"tool":"go_to","args":{"screen":"kitchen"}}',
      '{"tool":"set_tempo","args":{"direction":"faster","bpm":120}}', // declared order: bpm first
      '{"tool":"delete_take","args":{}}',
      '{"tool":"set_tempo","args":{"bpm":1200}}',
      '{"answer":"none"} ',
    ])
      expect(re.test(bad), bad).toBe(false);
  });
  it("throws on a recursive grammar", () => {
    expect(() => gbnfAccepts('root ::= "a" root?\n', "aa")).toThrow(/recursive/);
  });
});

describe("the ChatML copy", () => {
  const rust = readFileSync(join(ROOT, "src-tauri/src/coach.rs"), "utf8");
  it("is coach::ASK_SYSTEM_PROMPT word for word", () => {
    const m = rust.match(/pub const ASK_SYSTEM_PROMPT: &str = r#"([\s\S]*?)"#;/);
    expect(m?.[1]).toBe(ASK_SYSTEM_PROMPT);
  });
  it("is ask_prompt_head / ask_prompt_tail's text", () => {
    expect(rust).toContain('head.push_str("<|im_start|>system\\n");');
    expect(rust).toContain('head.push_str("\\n\\n/no_think<|im_end|>\\n<|im_start|>user\\n");');
    expect(rust).toContain('tail.push_str("Question: ");');
    expect(rust).toContain('tail.push_str("<|im_end|>\\n<|im_start|>assistant\\n<think>\\n\\n</think>\\n\\n");');
    expect(askPromptHead("P")).toBe(`<|im_start|>system\n${ASK_SYSTEM_PROMPT}\n\nP\n\n/no_think<|im_end|>\n<|im_start|>user\n`);
    expect(askPromptTail("C", " q ")).toBe("C\n\nQuestion: q<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n");
  });
});

describe("leakage", () => {
  it("folds case, punctuation and spaces", () => {
    expect(leakKey("Open  Paths!")).toBe(leakKey("openpaths"));
  });
  it("measures edit distance by code point, bounded", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("速度を上げて", "速度上げて")).toBe(1);
    expect(editDistance("a", "abcdefg", 3)).toBe(4);
  });
  it("finds a text within three edits of a held-out one, in the same language only", () => {
    const g = new LeakGuard();
    g.add("en", "slow it down a bit");
    expect(g.leak("en", "Slow it down a bit!!")).not.toBeNull();
    expect(g.leak("en", "slow it dwn a bt")).not.toBeNull();
    expect(g.leak("de", "slow it down a bit")).toBeNull();
    expect(g.leak("en", "make the click slower please")).toBeNull();
  });
});

describe("intents", () => {
  it("have unique ids, and wordings are held to their slots", () => {
    expect(new Set(INTENTS.map((i) => i.id)).size).toBe(INTENTS.length);
    const show = intentById("show_scale")!;
    expect(wordingProblem(show, "show {root} {scale}")).toBeNull();
    expect(wordingProblem(show, "show {root}")).not.toBeNull();
    expect(wordingProblem(intentById("tempo_faster")!, "10 bpm faster")).toMatch(/digit/);
  });
  it("never carry a number in a relative tempo request", () => {
    for (const id of ["tempo_faster", "tempo_slower"]) {
      const intent = CALL_INTENTS.find((i) => i.id === id)!;
      expect(intent.slots).toEqual([]);
      expect(intent.args({})).not.toHaveProperty("bpm");
    }
  });
});

describe("the generator (en, a small wordings file)", () => {
  let paths: PathDoc[];
  const file: WordingsFile = {
    language: "en",
    writer: "fixture",
    wordings: {
      go_screen: ["take me to {screen}", "{screen} please"],
      open_path: ["open {path}", "show me the {path} path"],
      play_exercise: ["play {exercise}"],
      tempo_faster: ["quicker please", "speed it up a touch"],
      tempo_slower: ["ease off the speed", "slow it down a hair"],
      tempo_bpm: ["tempo {bpm}"],
      yours_input: ["mute the mic", "make it stop listening"],
      yours_grading: ["stop grading me"],
      none_chat: ["thanks mate", "you're the best"],
      none_future: ["open {screen} tomorrow"],
    },
    goals: [],
  };
  beforeAll(async () => {
    paths = await loadAllPacks("en");
  }, 120_000);

  it("lets the runner decide every answer, and invents no number", () => {
    const data = languageData("en", paths, file);
    const { records } = generateLanguage(data, file, { size: 300, seed: 3, guard: new LeakGuard() });
    expect(records.length).toBeGreaterThan(200);
    const kinds: Record<string, number> = {};
    for (const r of records) {
      kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
      if (r.expect.kind === "call") {
        const e = effectOf({ tool: r.expect.tool, args: r.expect.args }, r.situation, "en", paths);
        expect(e.did !== null || e.refused?.startsWith("notWiredYet:") || ALREADY.test(e.refused ?? ""), `${r.id} ${r.text}`).toBe(true);
        expect(r.tools).toContain(r.expect.tool);
        for (const v of Object.values(r.expect.args)) if (typeof v === "number") expect(r.text, r.id).toContain(String(v));
        if (r.expect.args.direction !== undefined) {
          expect(r.expect.args.bpm, r.id).toBeUndefined();
          expect(r.text, r.id).not.toMatch(/\d/);
        }
      }
      if (r.expect.kind === "which") expect(effectOf(r.call, r.situation, "en", paths).which, r.id).toBe(true);
      if (r.tags.includes("wrong-screen")) expect(effectOf(r.call, r.situation, "en", paths).refused, r.id).toMatch(WRONG_SCREEN);
      if (r.tags.includes("withheld")) expect(r.tools).not.toContain(CALL_INTENTS.find((i) => i.id === r.intent)!.tool);
    }
    // Far fewer calls than the held-out set's two in three; every hard kind present.
    expect(kinds.call / records.length).toBeLessThan(0.5);
    for (const k of ["which", "yours", "none"]) expect(kinds[k], k).toBeGreaterThan(0);
  });

  it("judges a card question by the card's own rule (leg c3int)", () => {
    const p = paths.find((x) => x.steps.length > 0)!;
    const session = (phase: "result" | "ready" | "playing", grading?: "off") => ({ view: "session" as const, path: p.id, step: p.steps[0].order, phase, ...(grading ? { grading } : {}) });
    const expectOf = (card: string, args: Record<string, string>, s: Parameters<typeof judgeCard>[2]) => {
      const j = judgeCard(card, args, s, "en", paths);
      return "drop" in j ? j : { ...j.expect, tags: j.tags };
    };
    // A Take there (the result screen): the card, with the words' argument.
    expect(expectOf("early_or_late", { premise: "late" }, session("result"))).toMatchObject({ kind: "card", card: "early_or_late", args: { premise: "late" } });
    expect(expectOf("where_slipped", {}, session("result"))).toEqual({ kind: "card", card: "where_slipped", tags: ["card"] });
    // No Take to read: none; but the Exercise-reading cards answer on the ready screen.
    expect(expectOf("where_slipped", {}, session("ready"))).toMatchObject({ kind: "none", tags: ["card-near", "no-take"] });
    expect(expectOf("score_made_of", {}, session("ready"))).toMatchObject({ kind: "card" });
    expect(expectOf("why_not_counted", { what: "muting" }, session("ready"))).toMatchObject({ kind: "card", args: { what: "muting" } });
    expect(expectOf("improving", {}, { view: "paths" })).toMatchObject({ kind: "none", tags: ["card-near", "no-take"] });
    // During a Take, and for an ungraded player: none.
    expect(expectOf("where_slipped", {}, session("playing"))).toMatchObject({ kind: "none", tags: ["card-near", "take-running"] });
    expect(expectOf("pass_mark_distance", {}, session("result", "off"))).toMatchObject({ kind: "none", tags: ["card-near", "ungraded"] });
    // A shape the card refuses is dropped, never answered.
    expect(expectOf("early_or_late", { premise: "sideways" }, session("result"))).toHaveProperty("drop");
  });

  it("renders a pair the grammar accepts, and splits validation by language and kind", () => {
    const data = languageData("en", paths, file);
    const { records } = generateLanguage(data, file, { size: 120, seed: 4, guard: new LeakGuard() });
    for (const r of records.slice(0, 40)) {
      const out = renderRecord(r, paths);
      expect(out.completion.endsWith("<|im_end|>")).toBe(true);
      expect(gbnfToRegExp(out.grammar).test(out.answer), `${r.id}: ${out.answer}`).toBe(true);
      expect(out.prompt).toContain(`Question: ${r.text.trim()}<|im_end|>`);
      for (const name of toolCatalogue(COACH_TOOLS).tools.map((t) => t.name)) {
        if (!r.tools.includes(name)) expect(out.prompt, `${r.id}: ${name} withheld`).not.toContain(`\n${name}(`);
      }
    }
    const { train, validation } = splitValidation(records);
    expect(train.length + validation.length).toBe(records.length);
    expect(validation.length).toBeGreaterThan(0);
    expect(train.some((r) => validation.includes(r))).toBe(false);
    // 22 s once on a busy machine (leg c3int): headroom, as `paths/generate.test.ts`'s "mostly" test has.
  }, 120_000);
});
