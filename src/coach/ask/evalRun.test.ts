import { beforeAll, describe, expect, it } from "vitest";
import type { PathDoc } from "../../paths/format";
import { loadAllPacks } from "../../session/packs";
import { askRequestFor, chainAnswer, commonErrors, errorsMarkdown, modelAnswer, rulesAnswer, scoreItem, summarize } from "./evalRun";
import type { EvalItem } from "./evalWorld";

let paths: PathDoc[];
beforeAll(async () => {
  paths = await loadAllPacks("en");
}, 120_000);

const item = (over: Partial<EvalItem>): EvalItem => ({
  id: "t-1",
  lang: "en",
  situation: { view: "beat", tempo: 100 },
  text: "slower",
  expect: { kind: "call", tool: "set_tempo", args: { direction: "slower" } },
  tags: ["terse"],
  writer: "w",
  reader: "r",
  ...over,
});

describe("scoreItem", () => {
  it("the asked-for call is right, written either way", () => {
    const s = scoreItem(item({}), { kind: "call", call: { tool: "set_tempo", args: { direction: "slower" } } }, paths);
    expect(s).toMatchObject({ rightTool: true, rightArgs: true, wrongAction: false, right: true });
    const same = scoreItem(item({}), { kind: "call", call: { tool: "set_tempo", args: { bpm: 95 } } }, paths);
    expect(same.rightTool).toBe(true);
  });

  it("another action the app would take is a wrong action; none, which and a refused call are not", () => {
    const other = scoreItem(item({}), { kind: "call", call: { tool: "go_to", args: { screen: "paths" } } }, paths);
    expect(other).toMatchObject({ rightTool: false, wrongAction: true, right: false });
    expect(scoreItem(item({}), { kind: "none" }, paths).wrongAction).toBe(false);
    expect(scoreItem(item({}), { kind: "which" }, paths).wrongAction).toBe(false);
    // Refused here (no Path called that): nothing happened.
    const refused = scoreItem(item({}), { kind: "call", call: { tool: "open_path", args: { path: "zzz nothing" } } }, paths);
    expect(refused.wrongAction).toBe(false);
  });

  it("any action on a none item is wrong; which counts as asked", () => {
    const none = item({ text: "thanks", expect: { kind: "none" } });
    expect(scoreItem(none, { kind: "call", call: { tool: "set_tempo", args: { direction: "faster" } } }, paths).wrongAction).toBe(true);
    const which = item({ text: "open picking", expect: { kind: "which" } });
    expect(scoreItem(which, { kind: "which" }, paths)).toMatchObject({ asked: true, right: true, wrongAction: false });
  });

  it("only answered is an answer", () => {
    for (const status of ["truncated", "deadEnd", "timedOut", "cancelled", "noModel"]) {
      const a = modelAnswer({ id: "t-1", status, text: '{"tool":"set_tempo","args":{"direction":"slower"}}' });
      expect(a).toEqual({ kind: "noAnswer", status });
      const s = scoreItem(item({}), a, paths);
      expect(s).toMatchObject({ noAnswer: status, right: false, wrongAction: false });
    }
    expect(modelAnswer({ id: "t-1", status: "answered", text: '{"answer":"which"}' })).toEqual({ kind: "which" });
    expect(modelAnswer({ id: "t-1", status: "answered", text: "{oops" })).toMatchObject({ kind: "noAnswer", status: "unread" });
  });

  it("summarizes per language", () => {
    const it1 = item({});
    const s = summarize("en", [it1], [scoreItem(it1, { kind: "none" }, paths, 1200)]);
    expect(s).toMatchObject({ n: 1, calls: 1, rightTool: 0, wrongActions: 0, medianMs: 1200 });
  });
});

describe("the cards (c3b1b)", () => {
  // Not items of the held-out set: sentences written for this test only.
  const result = { view: "session" as const, path: "rhythm-foundations", step: 1, phase: "result" as const };
  const ready = { ...result, phase: "ready" as const };
  const card = (text: string, situation: EvalItem["situation"], expect: EvalItem["expect"]) => item({ text, situation, expect });

  it("the rules ask the cards' matcher after the router, in English, where a card has something to read", () => {
    const slip = card("where did I slip up on that take?", result, { kind: "card", card: "where_slipped", args: {} });
    expect(rulesAnswer(slip, paths)).toMatchObject({ kind: "card", card: "where_slipped" });
    // No Take yet on the ready screen: the Take's cards say nothing, the Exercise's still answer.
    expect(rulesAnswer({ ...slip, situation: ready }, paths)).toEqual({ kind: "none" });
    expect(rulesAnswer(card("is my muting graded?", ready, { kind: "card", card: "why_not_counted", args: { what: "muting" } }), paths)).toMatchObject({
      kind: "card",
      card: "why_not_counted",
      args: { what: "muting" },
    });
    // During a Take, or in another language: no card.
    expect(rulesAnswer({ ...slip, situation: { ...result, phase: "playing" } }, paths).kind).not.toBe("card");
    expect(rulesAnswer({ ...slip, lang: "es" }, paths).kind).not.toBe("card");
  });

  it("a card is right only as asked; another card or a card where none is expected is counted", () => {
    const why = card("is my muting graded?", ready, { kind: "card", card: "why_not_counted", args: { what: "muting" } });
    expect(scoreItem(why, { kind: "card", card: "why_not_counted", args: { what: "muting", take: "last" } }, paths).right).toBe(true);
    expect(scoreItem(why, { kind: "card", card: "why_not_counted", args: {} }, paths).right).toBe(false);
    const plain = card("why didn't the take count", result, { kind: "card", card: "why_not_counted", args: {} });
    expect(scoreItem(plain, { kind: "card", card: "why_not_counted", args: { what: "take" } }, paths).right).toBe(true);
    const none = card("lol", result, { kind: "none" });
    const scores = [
      scoreItem(why, { kind: "card", card: "score_made_of", args: {} }, paths),
      scoreItem(none, { kind: "card", card: "where_slipped", args: {} }, paths),
    ];
    expect(scores.every((s) => !s.wrongAction)).toBe(true);
    expect(summarize("en", [why, { ...none, id: "t-2" }], [scores[0], { ...scores[1], id: "t-2" }])).toMatchObject({ cards: 1, cardsRight: 0, cardsWrong: 1, cardsUninvited: 1 });
  });
});

describe("the engines' inputs", () => {
  it("the rules answer small talk with nothing", () => {
    expect(rulesAnswer(item({ text: "thanks!", expect: { kind: "none" } }), paths)).toEqual({ kind: "none" });
    expect(rulesAnswer(item({}), paths)).toEqual({ kind: "call", call: { tool: "set_tempo", args: { direction: "slower" } } });
  });

  it("every request shares one prefix; the grammar follows the situation", () => {
    const a = askRequestFor(item({}), paths, { generationId: 1, deadlineMs: 8000, grammar: "situation" });
    const b = askRequestFor(item({ situation: { view: "today" } }), paths, { generationId: 2, deadlineMs: 8000, grammar: "situation" });
    const full = askRequestFor(item({}), paths, { generationId: 3, deadlineMs: 8000, grammar: "full" });
    expect(a.prefix).toBe(b.prefix);
    expect(a.grammar).toContain('"\\"set_tempo\\""');
    expect(b.grammar).not.toContain('"\\"set_tempo\\""');
    expect(full.grammar.length).toBeGreaterThan(a.grammar.length);
    expect(a.context).toContain("Tempo: 100 bpm");
  });

  it("the c3b2m arms: no grammar sends none; a plain prompt names the tools without their lines", () => {
    const shipped = askRequestFor(item({}), paths, { generationId: 1, deadlineMs: 8000, grammar: "situation" });
    const bare = askRequestFor(item({}), paths, { generationId: 2, deadlineMs: 8000, grammar: "none" });
    const plain = askRequestFor(item({}), paths, { generationId: 3, deadlineMs: 8000, grammar: "situation", prompt: "names" });
    expect(bare.grammar).toBeUndefined();
    expect("grammar" in bare).toBe(false);
    expect(bare.prefix).toBe(shipped.prefix);
    expect(plain.grammar).toBe(shipped.grammar);
    expect(shipped.prefix).toMatch(/^set_tempo\([^)\n]*\): \S/m);
    expect(plain.prefix).toMatch(/^set_tempo\([^)\n]*\)$/m);
    expect(plain.prefix.length).toBeLessThan(shipped.prefix.length);
    // The answer's format is the same in both.
    expect(plain.prefix.split("Tools:")[0]).toBe(shipped.prefix.split("Tools:")[0]);
  });

  it("a raw answer without a grammar is read strictly", () => {
    expect(modelAnswer({ id: "t-1", status: "answered", text: '```json\n{"answer":"none"}\n```' })).toMatchObject({ kind: "noAnswer", status: "unread" });
    expect(modelAnswer({ id: "t-1", status: "answered", text: 'Sure! {"answer":"none"}' })).toMatchObject({ kind: "noAnswer", status: "unread" });
    expect(modelAnswer({ id: "t-1", status: "answered", text: ' {"answer":"none"}\n' })).toEqual({ kind: "none" });
  });
});

describe("the chain and the error list (c3b2m)", () => {
  const call = { kind: "call", call: { tool: "set_tempo", args: { direction: "slower" } } } as const;
  it("rules first: the rules' answer stands unless it is none", () => {
    expect(chainAnswer("rules-first", call, { kind: "which" })).toEqual({ answer: call, usedModel: false });
    expect(chainAnswer("rules-first", { kind: "search", step: "p/s" }, call)).toEqual({ answer: { kind: "search", step: "p/s" }, usedModel: false });
    expect(chainAnswer("rules-first", { kind: "none" }, call)).toEqual({ answer: call, usedModel: true });
    expect(chainAnswer("rules-first", { kind: "none" }, { kind: "noAnswer", status: "truncated" })).toMatchObject({ usedModel: true });
  });

  it("model first: the model's answer stands unless it is none or no answer", () => {
    expect(chainAnswer("model-first", { kind: "none" }, call)).toEqual({ answer: call, usedModel: true });
    expect(chainAnswer("model-first", call, { kind: "none" })).toEqual({ answer: call, usedModel: false });
    expect(chainAnswer("model-first", call, { kind: "noAnswer", status: "timedOut" })).toEqual({ answer: call, usedModel: false });
    expect(chainAnswer("model-first", call, { kind: "yours" })).toEqual({ answer: { kind: "yours" }, usedModel: true });
  });

  it("groups wrong answers by tool or kind, most frequent first, with examples", () => {
    const a = item({ id: "a", text: "slower please" });
    const b = item({ id: "b", text: "bit slower" });
    const c = item({ id: "c", text: "thanks", expect: { kind: "none" } });
    const d = item({ id: "d" });
    const go = { kind: "call", call: { tool: "go_to", args: { screen: "paths" } } } as const;
    const scores = [scoreItem(a, { kind: "none" }, paths), scoreItem(b, { kind: "none" }, paths), scoreItem(c, go, paths), scoreItem(d, call, paths, 900, true)];
    const errors = commonErrors([a, b, c, d], scores);
    expect(errors.map((e) => [e.expected, e.got, e.count])).toEqual([
      ["call set_tempo", "none", 2],
      ["none", "call go_to", 1],
    ]);
    expect(errors[0].examples[0]).toMatchObject({ id: "a", text: "slower please" });
    const md = errorsMarkdown("t", errors);
    expect(md).toContain('"slower please"');
    const sum = summarize("en", [a, b, c, d], scores);
    expect(sum).toMatchObject({ prefixCached: 1, prefixKnown: 1 });
  });

  it("counts no answers by status", () => {
    const a = item({ id: "a" });
    const b = item({ id: "b" });
    const s = summarize("en", [a, b], [scoreItem(a, { kind: "noAnswer", status: "truncated" }, paths), scoreItem(b, { kind: "noAnswer", status: "deadEnd" }, paths)]);
    expect(s.noAnswerBy).toEqual({ truncated: 1, deadEnd: 1 });
  });
});
