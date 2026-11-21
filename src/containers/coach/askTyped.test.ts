/**
 * Ask's text box (leg t1b2b): the router first, then the next answerer, then
 * the model or the plain statement. Against the recording fake host.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeHost, toolCtx } from "../../coach/tools/fakeHost";
import { runIn } from "../../coach/tools/testPaths";
import { __resetAskStoreForTests, getAskState, registerAskSender } from "./askStore";
import { __setAskToolsForTests } from "./askTools";
import { answerTyped, setAskNextAnswerer } from "./askTyped";

const HERE = dirname(fileURLToPath(import.meta.url));

let asked: string[] = [];
let unregister: () => void = () => {};

beforeEach(() => {
  __resetAskStoreForTests();
  asked = [];
  unregister = registerAskSender((q) => asked.push(q));
});
afterEach(() => {
  unregister();
  __setAskToolsForTests(null, null);
  __resetAskStoreForTests();
});

const kinds = () => getAskState().turns.map((t) => (t.kind === "tool" ? `tool:${t.body.kind}` : t.kind));

describe("answerTyped", () => {
  it("a command is a call through the runner, shown as the player's turn and its receipt; the model is not asked", () => {
    const host = fakeHost({ view: "today" });
    __setAskToolsForTests(host, toolCtx({ screen: "today" }));
    expect(answerTyped("  open paths ", "en")).toBe("call");
    expect(host.where().view).toBe("paths");
    expect(kinds()).toEqual(["user", "tool:receipt"]);
    expect(getAskState().turns[0]).toMatchObject({ kind: "user", text: "open paths" });
    expect(asked).toEqual([]);
  });

  it("several meanings are 'Which one?' with the choices, and nothing changes", () => {
    const host = fakeHost({ view: "today" });
    __setAskToolsForTests(host, toolCtx({ screen: "today" }));
    expect(answerTyped("load slow blues", "en")).toBe("which");
    expect(host.changes()).toEqual([]);
    const last = getAskState().turns.at(-1);
    expect(last?.kind === "tool" && last.body.kind === "refusal" ? last.body.choices.map((c) => c.call.tool) : null).toEqual(["load_jam", "load_preset"]);
    expect(last?.kind === "tool" && last.body.kind === "refusal" ? last.body.line.key : null).toBe("coachTools.why.which");
    expect(asked).toEqual([]);
  });

  it("a never-list request is 'that one is yours', never a call", () => {
    const host = fakeHost({ view: "today" });
    __setAskToolsForTests(host, toolCtx({ screen: "today" }));
    expect(answerTyped("start recording", "en")).toBe("yours");
    expect(host.changes()).toEqual([]);
    expect(kinds()).toEqual(["user", "tool:yours"]);
  });

  it("a command that cannot run here: the runner says why, and nothing changes", () => {
    const host = fakeHost({ view: "today" });
    __setAskToolsForTests(host, toolCtx({ screen: "today" }));
    expect(answerTyped("slower", "en")).toBe("notHere");
    expect(host.changes()).toEqual([]);
    expect(kinds()).toEqual(["user", "tool:refusal"]);
    expect(asked).toEqual([]);
  });

  it("a sentence that is not a command goes on: the next answerer, then the model or the plain statement", () => {
    const host = fakeHost({ view: "beat" });
    __setAskToolsForTests(host, toolCtx({ screen: "beat" }));
    expect(answerTyped("why was I late at 80?", "en")).toBe("asked");
    expect(asked).toEqual(["why was I late at 80?"]);
    const seen: string[] = [];
    const unplug = setAskNextAnswerer((text) => {
      seen.push(text);
      return text.includes("pentatonic");
    });
    expect(answerTyped("what is a pentatonic?", "en")).toBe("next");
    expect(answerTyped("I want to play faster", "en")).toBe("asked");
    expect(seen).toEqual(["what is a pentatonic?", "I want to play faster"]);
    expect(asked).toEqual(["why was I late at 80?", "I want to play faster"]);
    unplug();
    expect(answerTyped("what is a pentatonic?", "en")).toBe("asked");
    expect(host.changes()).toEqual([]);
  });

  it("a language with no table never runs English words as commands", () => {
    const host = fakeHost({ view: "today" });
    __setAskToolsForTests(host, toolCtx({ screen: "today" }));
    expect(answerTyped("open paths", "xx")).toBe("asked");
    expect(host.changes()).toEqual([]);
  });

  it("without a host or a context nothing is routed: the sentence is asked", () => {
    __setAskToolsForTests(null, null);
    expect(answerTyped("open paths", "en")).toBe("asked");
    expect(asked).toEqual(["open paths"]);
  });

  it("during a Take nothing typed changes the app", () => {
    const host = fakeHost({ view: "beat", session: true });
    __setAskToolsForTests(host, toolCtx({ screen: "session", run: runIn("playing") }));
    for (const text of ["faster", "80", "open paths", "start", "loop bar 3", "show a minor pentatonic"]) answerTyped(text, "en");
    expect(host.changes()).toEqual([]);
  });

  it("an empty send does nothing", () => {
    expect(answerTyped("   ", "en")).toBeNull();
    expect(getAskState().turns).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("the send path is the only caller (a press is the only way in)", () => {
    const panel = readFileSync(join(HERE, "AskPanel.tsx"), "utf8");
    expect(panel.match(/answerTyped\(/g)?.length).toBe(1);
    expect(panel).not.toMatch(/sendAsk\(/);
  });
});
