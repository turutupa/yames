/**
 * Ask's text box (leg t1b2b): the router first, then the next answerer, then
 * the model or the plain statement. Against the recording fake host.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeHost, toolCtx } from "../../coach/tools/fakeHost";
import { runIn } from "../../coach/tools/testPaths";
import { __resetAskStoreForTests, getAskState, registerAskSender } from "./askStore";
import { __setAskToolsForTests, runAskCall } from "./askTools";
import { answerTyped, setAskNextAnswerer } from "./askTyped";
import { loadAllPacks } from "../../session/packs";
import { resolvePath } from "../../coach/tools/resolve";
import { commandTableFor } from "../../coach/ask/commandTable";
import { commandFacts, routeCommand } from "../../coach/ask/router";

const HERE = dirname(fileURLToPath(import.meta.url));

let asked: string[] = [];
let unregister: () => void = () => {};

beforeEach(() => {
  __resetAskStoreForTests();
  asked = [];
  unregister = registerAskSender((q) => asked.push(q));
});
afterEach(() => {
  // A test that failed before unplugging leaks no answerer into the next one (review t1b2b, finding 5).
  setAskNextAnswerer(null);
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

  it("two answerers plugged in (two Ask views): either unplugging first leaves the other answering", () => {
    const host = fakeHost({ view: "beat" });
    __setAskToolsForTests(host, toolCtx({ screen: "beat" }));
    const unplugA = setAskNextAnswerer((text) => text === "a?");
    const unplugB = setAskNextAnswerer((text) => text === "b?");
    // The last one plugged in answers.
    expect(answerTyped("b?", "en")).toBe("next");
    expect(answerTyped("a?", "en")).toBe("asked");
    // The first one unmounting does not unplug the second.
    unplugA();
    expect(answerTyped("b?", "en")).toBe("next");
    // Plugged again, then the second unmounting first: the first answers again.
    const unplugA2 = setAskNextAnswerer((text) => text === "a?");
    const unplugC = setAskNextAnswerer((text) => text === "c?");
    unplugC();
    expect(answerTyped("a?", "en")).toBe("next");
    unplugA2();
    expect(answerTyped("b?", "en")).toBe("next");
    unplugB();
    expect(answerTyped("b?", "en")).toBe("asked");
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

  it("a slot that throws, or answers with a Promise, has not answered: the sentence is asked (review t1b2b, finding 5)", () => {
    const host = fakeHost({ view: "beat" });
    __setAskToolsForTests(host, toolCtx({ screen: "beat" }));
    setAskNextAnswerer(() => {
      throw new Error("broken card");
    });
    expect(answerTyped("what is a pentatonic?", "en")).toBe("asked");
    setAskNextAnswerer((() => Promise.resolve(true)) as unknown as (text: string) => boolean);
    expect(answerTyped("what is a triad?", "en")).toBe("asked");
    expect(asked).toEqual(["what is a pentatonic?", "what is a triad?"]);
  });

  it("the slot is synchronous: anything but a boolean is not an answer, and dev says so (review t1b2c, finding 4)", () => {
    const host = fakeHost({ view: "beat" });
    __setAskToolsForTests(host, toolCtx({ screen: "beat" }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (const odd of [Promise.resolve(true), "yes", 1, undefined]) {
        setAskNextAnswerer((() => odd) as unknown as (text: string) => boolean);
        expect(answerTyped("what is a triad?", "en"), String(odd)).toBe("asked");
      }
      expect(warn).toHaveBeenCalledTimes(4);
      expect(String(warn.mock.calls[0][0])).toMatch(/synchronously/);
      warn.mockClear();
      setAskNextAnswerer(() => true);
      expect(answerTyped("what is a triad?", "en")).toBe("next");
      setAskNextAnswerer(() => false);
      expect(answerTyped("what is a triad?", "en")).toBe("asked");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("a command whose typed name names nothing is not answered 'no such Path': it goes on to the model (review t1b2b, finding 2)", () => {
    const host = fakeHost({ view: "today" });
    __setAskToolsForTests(host, toolCtx({ screen: "today" }));
    expect(answerTyped("open zzqx", "en")).toBe("asked");
    expect(getAskState().turns).toEqual([]);
    expect(asked).toEqual(["open zzqx"]);
    expect(host.changes()).toEqual([]);
    // With the next answerer plugged in, it is asked first.
    setAskNextAnswerer((text) => text === "open zzqx");
    expect(answerTyped("open zzqx", "en")).toBe("next");
  });

  it("the send path is the only caller (a press is the only way in)", () => {
    const panel = readFileSync(join(HERE, "AskPanel.tsx"), "utf8");
    expect(panel.match(/answerTyped\(/g)?.length).toBe(1);
    expect(panel).not.toMatch(/sendAsk\(/);
  });
});

/** The "Which one?" choices of the last turn, or null. */
const lastChoices = () => {
  const last = getAskState().turns.at(-1);
  return last?.kind === "tool" && last.body.kind === "refusal" ? last.body.choices : null;
};

describe("languages written without spaces, against the real Paths (review t1b2b, findings 1 and 4)", () => {
  it("ja: 'コースを開けて' opens the Paths screen; a verb's stem with a kana left over opens no Path", async () => {
    const paths = await loadAllPacks("ja");
    // The leftovers the reviewer found are inside real titles: without the fix they open those Paths.
    expect("found" in resolvePath("て", paths)).toBe(true);
    expect("found" in resolvePath("る", paths)).toBe(true);
    for (const text of ["コースを開けて", "コースを開けてね"]) {
      const host = fakeHost({ view: "today", paths });
      __setAskToolsForTests(host, toolCtx({ screen: "today", locale: "ja" }));
      expect(answerTyped(text, "ja"), text).toBe("call");
      expect(host.where().view, text).toBe("paths");
      expect(host.where().at.pathId, text).toBeNull();
    }
    for (const text of ["開けて", "開ける", "開けてよ", "コースを開くと固まる"]) {
      const host = fakeHost({ view: "today", paths });
      __setAskToolsForTests(host, toolCtx({ screen: "today", locale: "ja" }));
      expect(answerTyped(text, "ja"), text).toBe("asked");
      expect(host.changes(), text).toEqual([]);
    }
  }, 60_000);

  it.each([
    ["ja", "ブルースを開いて", "ブルースとペンタトニック"],
    ["ja", "オルタネイト・ピッキングを開いて", "オルタネイト・ピッキング"],
    ["ja", "オルタネイトピッキングを開いて", "オルタネイト・ピッキング"],
    ["ko", "얼터네이트 피킹 열어줘", "얼터네이트 피킹"],
    ["ko", "블루스와 펜타토닉 코스 열어줘", "블루스와 펜타토닉"],
    ["zh-CN", "打开交替拨弦", "交替拨弦"],
    ["zh-TW", "打開交替撥弦", "交替撥弦"],
  ])("%s: '%s' is one press, never at once, and the press opens %s", async (lng, text, title) => {
    const paths = await loadAllPacks(lng);
    const want = paths.find((p) => p.title === title);
    expect(want, title).toBeDefined();
    const host = fakeHost({ view: "today", paths });
    __setAskToolsForTests(host, toolCtx({ screen: "today", locale: lng }));
    expect(answerTyped(text, lng)).toBe("which");
    expect(host.changes()).toEqual([]);
    const choices = lastChoices();
    expect(choices?.map((c) => c.call.tool)).toEqual(["open_path"]);
    // The chip says the title a press opens, never the typed leftover (review t1b2c, finding 1).
    expect(choices![0].label).toEqual({ key: "coachTools.choice.path", values: { path: title } });
    // The query the router built resolves against the localized title (finding 4).
    const hit = resolvePath(String(choices![0].call.args.path), paths);
    expect("found" in hit ? hit.found.id : hit, text).toBe(want!.id);
    runAskCall(choices![0].call, text);
    expect(host.where().view).toBe("paths");
    expect(host.where().at.pathId).toBe(want!.id);
  }, 60_000);

  // None of these leans on `notCommand`: the leftover is resolved, names nothing, and the sentence
  // goes on to the model (review t1b2c, finding 1).
  it.each([
    ["ja", "設定を開くのは面倒"],
    ["ja", "コースを開けといて"],
    ["ja", "コースを開いて弾く"],
    ["ko", "냉장고 열어줘"],
    ["zh-CN", "打开冰箱"],
    ["zh-TW", "打開冰箱"],
  ])("%s: '%s' names no Path: asked, no chip, nothing changes", async (lng, text) => {
    const paths = await loadAllPacks(lng);
    const host = fakeHost({ view: "today", paths });
    __setAskToolsForTests(host, toolCtx({ screen: "today", locale: lng }));
    // The router alone still makes it a one-press "Which one?" (the guard against a leftover is here, not there).
    const routed = routeCommand(text, commandTableFor(lng)!, commandFacts(toolCtx({ screen: "today", locale: lng }), "today"));
    expect(routed.kind, text).toBe("which");
    expect(answerTyped(text, lng)).toBe("asked");
    expect(getAskState().turns).toEqual([]);
    expect(asked).toEqual([text]);
    expect(host.changes()).toEqual([]);
  }, 60_000);

  it("ja: one kana left after a verb's stem reaches the two-character guard and names nothing (review t1b2c, finding 3)", () => {
    const table = commandTableFor("ja")!;
    const today = commandFacts(toolCtx({ screen: "today", locale: "ja" }), "today");
    // "コース開けれ": the verb "開け", the noun "コース", and "れ" left over; without the guard it is a Path's name.
    expect(routeCommand("コース開けれ", table, today)).toEqual({ kind: "none" });
    // Two characters left over get past the guard (and then to the resolver, which finds nothing).
    expect(routeCommand("コース開けれれ", table, today).kind).toBe("which");
  });
});

describe("a typed name opens at once only by the title's whole words (review t1b2c, findings 2 and 5)", () => {
  it.each([
    ["en", "go to class", "Classic Rock"],
    ["en", "go first", "First Chords and Strumming"],
    ["en", "open first", "First Chords and Strumming"],
    ["en", "go to arpeggios", "Arpeggios over Changes"],
    ["de", "geh zu erste", "Erste Akkorde und Strumming"],
    ["es", "ve a rock", "Rock clásico"],
  ])("%s: '%s' is one press labelled %s, nothing opens", async (lng, text, title) => {
    const paths = await loadAllPacks(lng);
    const want = paths.find((p) => p.title === title);
    expect(want, title).toBeDefined();
    const host = fakeHost({ view: "today", paths });
    __setAskToolsForTests(host, toolCtx({ screen: "today", locale: lng }));
    expect(answerTyped(text, lng)).toBe("which");
    expect(host.changes()).toEqual([]);
    const choices = lastChoices();
    expect(choices?.map((c) => c.label)).toEqual([{ key: "coachTools.choice.path", values: { path: title } }]);
    runAskCall(choices![0].call, text);
    expect(host.where().at.pathId).toBe(want!.id);
  }, 60_000);

  it("en: 'go over' opens nothing ('over' is in the table's notCommand since t1b2c)", async () => {
    const paths = await loadAllPacks("en");
    const host = fakeHost({ view: "today", paths });
    __setAskToolsForTests(host, toolCtx({ screen: "today", locale: "en" }));
    expect(answerTyped("go over", "en")).not.toBe("call");
    expect(host.changes()).toEqual([]);
  }, 60_000);

  it.each([
    ["en", "open classic rock", "Classic Rock"],
    ["en", "open triads", "Triads"],
    ["de", "öffne classic rock", "Classic Rock"],
    ["es", "abre rock clásico", "Rock clásico"],
  ])("%s: '%s' opens %s at once", async (lng, text, title) => {
    const paths = await loadAllPacks(lng);
    const want = paths.find((p) => p.title === title);
    expect(want, title).toBeDefined();
    const host = fakeHost({ view: "today", paths });
    __setAskToolsForTests(host, toolCtx({ screen: "today", locale: lng }));
    expect(answerTyped(text, lng)).toBe("call");
    expect(host.where().view).toBe("paths");
    expect(host.where().at.pathId).toBe(want!.id);
    expect(kinds()).toEqual(["user", "tool:receipt"]);
  }, 60_000);

  it("en: a Step number the named Path lacks keeps its refusal; one it has opens at once", async () => {
    const paths = await loadAllPacks("en");
    const triads = paths.find((p) => p.title === "Triads")!;
    const missing = triads.steps.length + 1;
    const host = fakeHost({ view: "today", paths });
    __setAskToolsForTests(host, toolCtx({ screen: "today", locale: "en" }));
    expect(answerTyped(`open step ${missing} of triads`, "en")).toBe("call");
    const last = getAskState().turns.at(-1);
    expect(last?.kind === "tool" && last.body.kind === "refusal" ? last.body.line : null).toEqual({
      key: "coachTools.why.notFound.step",
      values: { step: missing },
    });
    expect(asked).toEqual([]);
    expect(host.changes()).toEqual([]);
    expect(answerTyped("open step 2 of triads", "en")).toBe("call");
    expect(host.where().at.pathId).toBe(triads.id);
  }, 60_000);
});
