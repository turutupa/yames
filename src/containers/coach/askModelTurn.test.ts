/**
 * The model's turn in Ask's thread (leg c3b2a), against the typed mock of
 * `coach_ask` and the recording fake host: the chain (which engine answered,
 * whether the model was called), how an answer becomes a turn, and every way
 * a generation in flight is cancelled and its result dropped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoachAskOutcome } from "../../ipc";
import { mockInvoke, setInvokeResponse } from "../../test/mocks";
import { publish, resetCoachBus } from "../../coach/bus";
import { __resetModelForTests, __setModelLangsForTests } from "../../coach/ask/model";
import { fakeHost, toolCtx, type FakeHost } from "../../coach/tools/fakeHost";
import { runIn, TEST_PATHS } from "../../coach/tools/testPaths";
import { __resetAskStoreForTests, getAskState, registerAskSender } from "./askStore";
import { __setAskToolsForTests, noteAskJamTake, noteAskTake, notNowProposal, pressChip, pressProposal } from "./askTools";
import { answerTyped, setAskNextAnswerer } from "./askTyped";
import { __resetModelTurnForTests, modelTurnLive, stopModelTurn } from "./askModelTurn";

const snapshot = vi.hoisted(() => ({ choice: "standard" as "off" | "standard" | "full", state: "ready" as string }));
vi.mock("../../hooks/coachLoader", async (orig) => {
  const real = await orig<typeof import("../../hooks/coachLoader")>();
  return { ...real, getCoachModelSnapshot: () => ({ ...real.getCoachModelSnapshot(), choice: snapshot.choice, state: snapshot.state }) };
});

const GPU = { llmCompiled: true, modelResident: true, loading: false, backend: "vulkan", modelName: "Qwen3 4B", loadError: null, brainDownloaded: true, studioRecommended: true, standardRecommended: true, brainUpdateRecommended: false, tipsUseModel: true, rephraseP50Ms: 400 };
const answered = (text: string): CoachAskOutcome => ({ status: "answered", text, prefixCached: true, promptMs: 50, totalMs: 600 });

let asked: string[] = [];
let unregister = () => {};
let host: FakeHost;

/** A `coach_ask` that answers when the test says. */
function heldAsk() {
  let answer: (o: CoachAskOutcome) => void = () => {};
  setInvokeResponse("coach_ask", () => new Promise<CoachAskOutcome>((resolve) => (answer = resolve)));
  return (o: CoachAskOutcome) => answer(o);
}

const flush = async () => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const kinds = () => getAskState().turns.map((t) => (t.kind === "tool" ? `tool:${t.body.kind}` : t.kind));
const asks = () => mockInvoke.mock.calls.filter(([cmd]) => cmd === "coach_ask").length;
const cancels = () => mockInvoke.mock.calls.filter(([cmd]) => cmd === "cancel_generation").map(([, a]) => (a as { generationId: number }).generationId);

beforeEach(() => {
  __resetAskStoreForTests();
  __resetModelForTests();
  resetCoachBus();
  snapshot.choice = "standard";
  snapshot.state = "ready";
  __setModelLangsForTests({ standard: ["en", "de"], full: ["en"] });
  setInvokeResponse("get_coach_capabilities", GPU);
  asked = [];
  unregister = registerAskSender((q) => asked.push(q));
  host = fakeHost({ view: "beat", paths: TEST_PATHS });
  __setAskToolsForTests(host, toolCtx({ screen: "today" }));
});
afterEach(() => {
  __resetModelTurnForTests();
  setAskNextAnswerer(null);
  unregister();
  __setAskToolsForTests(null, null);
  __resetAskStoreForTests();
  __resetModelForTests();
});

describe("the chain: which engine answered, and whether the model was called", () => {
  const rows: Array<[string, string, string, () => void, string, boolean]> = [
    ["a router command ends the turn", "open paths", "en", () => {}, "call", false],
    ["a never-list request ends the turn", "start recording", "en", () => {}, "yours", false],
    ["a synchronous answerer (a card, later help) ends the turn", "where did it slip?", "en", () => void setAskNextAnswerer(() => true), "next", false],
    ["nothing else answered, the language on: the model", "what should I practise for speed", "en", () => {}, "model", true],
    ["the language off for the tier: what Ask did before", "was soll ich üben", "ja", () => {}, "asked", false],
    ["the tier Off: what Ask did before", "what should I practise", "en", () => void (snapshot.choice = "off"), "asked", false],
  ];
  for (const [name, text, lang, setup, outcome, modelCalled] of rows) {
    it(name, async () => {
      setup();
      setInvokeResponse("coach_ask", answered('{"answer":"none"}'));
      expect(answerTyped(text, lang)).toBe(outcome);
      await flush();
      expect(asks() > 0).toBe(modelCalled);
    });
  }

  it("with the shipped switch (empty) coach_ask is never called, in any language", async () => {
    __setModelLangsForTests(null);
    for (const lang of ["en", "de", "es", "ja", "zh-CN"]) expect(answerTyped("what should I practise for speed", lang)).toBe("asked");
    await flush();
    expect(asks()).toBe(0);
  });
});

describe("how an answer becomes turns", () => {
  it("the plain statement at once, the working line while it chooses, then a read tool's receipt under it", async () => {
    const answer = heldAsk();
    answerTyped("which notes fit over a sad sounding A", "en");
    expect(kinds()).toEqual(["user", "app"]);
    await flush();
    expect(kinds()).toEqual(["user", "app", "model"]);
    answer(answered('{"tool":"show_scale","args":{"root":"A","scale":"minorPentatonic"}}'));
    await flush();
    expect(kinds()).toEqual(["user", "app", "tool:receipt"]);
    expect(host.changes()).toEqual([]);
    expect(modelTurnLive()).toBe(false);
  });

  it("a go call is a proposal labelled as the model's, and nothing moves until the press", async () => {
    setInvokeResponse("coach_ask", answered('{"tool":"go_to","args":{"screen":"progress"}}'));
    answerTyped("take me to my progress page please", "en");
    await flush();
    const last = getAskState().turns.at(-1)!;
    expect(last.kind === "tool" && last.body.kind === "proposal" ? last.body.via : null).toBe("model");
    expect(host.changes()).toEqual([]);
    pressProposal(last.id);
    expect(host.where().view).toBe("progress");
  });

  it("a go proposal made while nothing played does not stop a click started since: not now, and it stays (c3b2ab, M2)", async () => {
    setInvokeResponse("coach_ask", answered('{"tool":"go_to","args":{"screen":"progress"}}'));
    answerTyped("take me to my progress page please", "en");
    await flush();
    const id = getAskState().turns.at(-1)!.id;
    host.play("click");
    pressProposal(id);
    expect(host.where().view).toBe("beat");
    expect(host.changes()).toEqual([]);
    const turn = getAskState().turns.at(-1)!;
    expect(turn.kind === "tool" && turn.body.kind === "proposal" ? [turn.body.state, turn.body.note?.key, turn.body.note?.values.stops] : null).toEqual([
      "open",
      "coachTools.why.notNow.sounding",
      "click",
    ]);
    host.play(null);
    pressProposal(id);
    expect(host.where().view).toBe("progress");
  });

  it("Not now leaves everything as it was", async () => {
    setInvokeResponse("coach_ask", answered('{"tool":"go_to","args":{"screen":"progress"}}'));
    answerTyped("take me to my progress page please", "en");
    await flush();
    notNowProposal(getAskState().turns.at(-1)!.id);
    expect(host.changes()).toEqual([]);
  });

  it("a confirm call is a proposal too", async () => {
    host = fakeHost({ view: "beat" }, { tempo: () => 100 });
    __setAskToolsForTests(host, toolCtx({ screen: "beat" }));
    setInvokeResponse("coach_ask", answered('{"tool":"set_tempo","args":{"bpm":80}}'));
    answerTyped("could we go a bit more relaxed, like eighty", "en");
    await flush();
    expect(kinds().at(-1)).toBe("tool:proposal");
    expect(host.changes()).toEqual([]);
  });

  const nothing: Array<[string, CoachAskOutcome]> = [
    ["none", answered('{"answer":"none"}')],
    ["truncated", { status: "truncated", text: '{"tool":"go_to"', by: "budget", prefixCached: true, promptMs: 1, totalMs: 2 }],
    ["deadEnd", { status: "deadEnd", why: "x" }],
    ["timedOut", { status: "timedOut" }],
    ["noModel", { status: "noModel" }],
    ["a refused call", answered('{"tool":"start_today","args":{}}')],
  ];
  for (const [name, outcome] of nothing) {
    it(`${name}: nothing more, the plain statement stands`, async () => {
      setInvokeResponse("coach_ask", outcome);
      answerTyped("what should I practise for speed", "en");
      await flush();
      expect(kinds()).toEqual(["user", "app"]);
      expect(host.changes()).toEqual([]);
    });
  }

  it("a model still loading: says so and to ask again (nothing promised), and no generation", async () => {
    snapshot.state = "loading";
    answerTyped("what should I practise for speed", "en");
    await flush();
    expect(kinds()).toEqual(["user", "app", "app"]);
    const last = getAskState().turns.at(-1)!;
    expect(last.kind === "app" ? last.text : null).toBe("The model is still getting ready. Ask again in a moment.");
    expect(asks()).toBe(0);
  });

  it("a CPU backend while something sounds: no generation", async () => {
    setInvokeResponse("get_coach_capabilities", { ...GPU, backend: "cpu" });
    host.play("click");
    answerTyped("what should I practise for speed", "en");
    await flush();
    expect(asks()).toBe(0);
    expect(kinds()).toEqual(["user", "app"]);
  });

  it("none starts during a Take or a jam take", async () => {
    __setAskToolsForTests(host, toolCtx({ screen: "session", run: runIn("playing") }));
    answerTyped("what should I practise for speed", "en");
    await flush();
    __setAskToolsForTests(fakeHost({ view: "jam" }, { jamTakeRunning: () => true }), toolCtx({ screen: "jam" }));
    answerTyped("what should I practise for speed", "en");
    await flush();
    expect(asks()).toBe(0);
  });
});

describe("the last exchange the model reads (`Before:`): never a line a tool answered (c3b2ab, M1)", () => {
  const context = () => {
    const last = mockInvoke.mock.calls.filter(([cmd]) => cmd === "coach_ask").at(-1);
    return (last?.[1] as { request: { context: string } }).request.context;
  };
  beforeEach(() => void setInvokeResponse("coach_ask", answered('{"answer":"none"}')));

  it("a typed command, then a typed line: no Before", async () => {
    expect(answerTyped("open paths", "en")).toBe("call");
    answerTyped("what should I practise for speed", "en");
    await flush();
    expect(context()).not.toContain("Before:");
  });

  it("a chip press, then a typed line: no Before", async () => {
    pressChip({ tool: "go_to", args: { screen: "progress" } }, "Progress");
    expect(kinds()).toEqual(["user", "tool:receipt"]);
    answerTyped("what should I practise for speed", "en");
    await flush();
    expect(context()).not.toContain("Before:");
  });

  it("a line nothing but the plain statement answered is the Before", async () => {
    answerTyped("what should I practise for speed", "en");
    await flush();
    answerTyped("and for accuracy", "en");
    await flush();
    expect(context()).toContain("Before: what should I practise for speed");
  });
});

describe("every cancel: the generation is cancelled in Rust and its result dropped", () => {
  const cancelBy: Array<[string, () => void]> = [
    ["a Take (or its count-in) starting, on the coach bus", () => publish({ type: "takeStarted", stepIndex: 0, bpm: 80, takeNumber: 1, at: 0 } as never)],
    ["the host noting a Take", () => noteAskTake()],
    ["a jam take's recording starting", () => noteAskJamTake(true)],
    ["Stop", () => stopModelTurn()],
    ["a new turn", () => void answerTyped("open paths", "en")],
  ];
  for (const [name, cancel] of cancelBy) {
    it(name, async () => {
      const answer = heldAsk();
      answerTyped("what should I practise for speed", "en");
      await flush();
      expect(kinds()).toContain("model");
      const before = getAskState().turns.length;
      cancel();
      await flush();
      expect(cancels()).toHaveLength(1);
      expect(kinds()).not.toContain("model");
      answer(answered('{"tool":"go_to","args":{"screen":"progress"}}'));
      await flush();
      expect(kinds()).not.toContain("tool:proposal");
      expect(getAskState().turns.length).toBeLessThanOrEqual(before + 2);
      noteAskJamTake(false);
    });
  }
});
