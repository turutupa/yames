import { beforeAll, describe, expect, it } from "vitest";
import type { PathDoc } from "../../paths/format";
import { loadAllPacks } from "../../session/packs";
import { askRequestFor, modelAnswer, rulesAnswer, scoreItem, summarize } from "./evalRun";
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
});
