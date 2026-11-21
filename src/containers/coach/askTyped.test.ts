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
import { __setAskToolsForTests, runAskCall } from "./askTools";
import { answerTyped, setAskNextAnswerer } from "./askTyped";
import { loadAllPacks } from "../../session/packs";
import { resolvePath } from "../../coach/tools/resolve";

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
    // The query the router built resolves against the localized title (finding 4).
    const hit = resolvePath(String(choices![0].call.args.path), paths);
    expect("found" in hit ? hit.found.id : hit, text).toBe(want!.id);
    runAskCall(choices![0].call, text);
    expect(host.where().view).toBe("paths");
    expect(host.where().at.pathId).toBe(want!.id);
  }, 60_000);
});
