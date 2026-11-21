/**
 * The order of Ask's engines for a typed line (DESIGN 5.3; leg c2cb):
 * router → tuning → cards → help → search → the model or the plain statement.
 * A table over typed lines that checks which engine answered, against the
 * recording fake host with the real packs loaded.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fixture } from "../../coach/ask/cardFixtures";
import { answerSearchFor } from "../../coach/ask/search";
import { fakeHost, toolCtx } from "../../coach/tools/fakeHost";
import type { PathDoc } from "../../paths/format";
import { loadAllPacks } from "../../session/packs";
import enFixtures from "../../coach/ask/searchData/fixtures/en.json";
import jaFixtures from "../../coach/ask/searchData/fixtures/ja.json";
import { answerByRules, typedRuleAnswerer, type TypedEngine } from "./askAnswerers";
import { __resetAskStoreForTests, getAskState, registerAskSender, type AskTurn } from "./askStore";
import { __setAskToolsForTests } from "./askTools";
import { answerTyped, setAskNextAnswerer } from "./askTyped";

let en: PathDoc[] = [];
let ja: PathDoc[] = [];
let asked: string[] = [];
let unregister: () => void = () => {};

beforeAll(async () => {
  en = await loadAllPacks("en");
  ja = await loadAllPacks("ja");
}, 120_000);

beforeEach(() => {
  __resetAskStoreForTests();
  asked = [];
  unregister = registerAskSender((q) => asked.push(q));
});
afterEach(() => {
  setAskNextAnswerer(null);
  unregister();
  __setAskToolsForTests(null, null);
  __resetAskStoreForTests();
});

const cardsOf = (turns: readonly AskTurn[]) => turns.flatMap((t) => (t.kind === "card" ? [t.card] : []));

/** The first fixture question search answers in `lng` (c2ca's numbers decide which; at least one does). */
function searchable(qs: ReadonlyArray<{ q: string }>, paths: PathDoc[], lng: string): string {
  const q = qs.find((x) => answerSearchFor(x.q, { language: lng, paths }) !== null)?.q;
  expect(q, `a ${lng} fixture search answers`).toBeDefined();
  return q!;
}

/** Ask's whole send path, as the panel plugs it: which engine answered, or what came after them. */
function engineFor(text: string, lng: string): TypedEngine | "router" | "plain" {
  let which: TypedEngine | null = null;
  setAskNextAnswerer((t) => {
    which = answerByRules(t, () => lng);
    return which !== null;
  });
  const out = answerTyped(text, lng);
  if (out === "asked") return "plain";
  if (out === "next") return which!;
  return "router";
}

describe("the engine order (en, Today)", () => {
  beforeEach(() => __setAskToolsForTests(fakeHost({ view: "today", paths: en }), toolCtx({ screen: "today", locale: "en" })));

  const TABLE: Array<[string, TypedEngine | "router" | "plain"]> = [
    ["open paths", "router"],
    ["slower", "router"],
    ["start recording", "router"],
    ["explain this screen", "router"],
    ["is my guitar in tune?", "tuning"],
    ["How do I tune my guitar?", "tuning"],
    ["what is a rung?", "help"],
    ["What does parked mean?", "help"],
    ["how does the drill work", "help"],
    ["what time is it", "plain"],
  ];
  for (const [text, want] of TABLE) it(`"${text}" is answered by ${want}`, () => expect(engineFor(text, "en")).toBe(want));

  it("a question search answers is answered by search, quoted with its Step", () => {
    const q = searchable(enFixtures.questions, en, "en");
    expect(engineFor(q, "en")).toBe("search");
    const card = cardsOf(getAskState().turns).at(-1);
    expect(card?.shape).toBe("search");
    expect(card && card.shape !== null ? card.source : null).toMatchObject({ kind: "path" });
    expect(asked).toEqual([]);
  });

  it("'explain this screen' (the router) answers with Today's help entry, as a help card", () => {
    engineFor("explain this screen", "en");
    const card = cardsOf(getAskState().turns).at(-1);
    expect(card && card.shape !== null ? card.lines[0].key : null).toBe("help.entry.screen.today");
  });
});

describe("tuning never reaches search or help", () => {
  it.each(["how do I tune my guitar", "is my guitar in tune", "my low E string sounds flat", "do you have a tuner?"])("'%s' gets the one sentence", (text) => {
    __setAskToolsForTests(fakeHost({ view: "today", paths: en }), toolCtx({ screen: "today", locale: "en" }));
    expect(answerByRules(text, () => "en")).toBe("tuning");
    const cards = cardsOf(getAskState().turns);
    expect(cards).toHaveLength(1);
    expect(cards[0].shape === "help" ? cards[0].lines.map((l) => l.key) : null).toEqual(["help.tuning.none"]);
  });
});

describe("cards come before help and search", () => {
  it("'where did it slip?' after a Take below the pass mark is the card", () => {
    __setAskToolsForTests(fakeHost({ paths: en }), fixture({ slipped: [0, 4], failOn: "timingEvenness" }).ctx);
    expect(engineFor("where did it slip?", "en")).toBe("card");
    expect(cardsOf(getAskState().turns).at(-1)?.shape).toBe("where_slipped");
  });
});

describe("other languages: no tuning, card or help matching; search answers", () => {
  it("ja: a question search answers is search; English help words are not matched", () => {
    __setAskToolsForTests(fakeHost({ view: "today", paths: ja }), toolCtx({ screen: "today", locale: "ja" }));
    const q = searchable(jaFixtures.questions, ja, "ja");
    expect(engineFor(q, "ja")).toBe("search");
    __resetAskStoreForTests();
    expect(engineFor("what is a rung?", "ja")).toBe("plain");
  });
});

describe("the slot as the panel plugs it", () => {
  it("is synchronous and writes nothing when nothing answers", () => {
    __setAskToolsForTests(fakeHost({ view: "today", paths: en }), toolCtx({ screen: "today", locale: "en" }));
    const fn = typedRuleAnswerer(() => "en");
    expect(fn("what time is it")).toBe(false);
    expect(getAskState().turns).toEqual([]);
  });
});
