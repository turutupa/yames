/**
 * A source line, pressed (leg c2b2b): what each label opens, in and out of a
 * Session, and that a press in a Session calls no `go` tool.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { fixture } from "../../coach/ask/cardFixtures";
import { CoachBlocks } from "../../coach/blocks/CoachBlocks";
import type { BlockSource } from "../../coach/blocks/resolve";
import { noteFinding, resetCoachSlot } from "../../coach/coachSlot";
import { fakeHost, toolCtx } from "../../coach/tools/fakeHost";
import { runIn } from "../../coach/tools/testPaths";
import { __resetCoachLoaderForTests } from "../../hooks/coachLoader";
import i18n from "../../i18n";
import type { PathDoc } from "../../paths/format";
import type { TakeOutcome } from "../../session/runner";
import { AskCardTurn } from "./AskCardTurn";
import { AskPanel } from "./AskPanel";
import { askCard, type CardBody } from "./askCards";
import { pressSource, sourceAnswer, type SourceWorld } from "./askSources";
import { __resetAskStoreForTests, getAskState, openAsk, type AskTurn } from "./askStore";
import { __setAskToolsForTests } from "./askTools";

const t = i18n.t.bind(i18n);

const STEPS = [
  { id: "sp-1", order: 1, title: "One string", goal: "Pick down and up on one string.", why: "Every pattern starts here.", exercises: [] },
  { id: "sp-2", order: 2, title: "Two strings", goal: "Cross to the next string without a gap.", why: "", exercises: [] },
];
const PATH = { id: "speed-picking", title: "Speed Picking", steps: STEPS } as unknown as PathDoc;
/** Another Path with a Step 2 of its own: a press must never open this one for the first's Step 2. */
const OTHER = { id: "legato", title: "Legato", steps: [{ ...STEPS[1], id: "lg-2", title: "Slurs" }] } as unknown as PathDoc;
const PATHS = [OTHER, PATH];

const take = (n: number, exerciseId = "tune"): TakeOutcome => ({ takeNumber: n, exerciseId, stepId: "s", title: "Tune", bpm: 80 }) as unknown as TakeOutcome;

function world(over: Partial<SourceWorld> = {}): SourceWorld {
  return { ctx: toolCtx(), paths: PATHS, sessionActive: false, finding: () => null, ...over };
}

const inSession = (): SourceWorld => world({ ctx: toolCtx({ screen: "session", run: runIn("ready") }), sessionActive: true });

beforeEach(() => {
  __resetAskStoreForTests();
  __resetCoachLoaderForTests();
  resetCoachSlot();
});
afterEach(() => {
  __setAskToolsForTests(null, null);
  __resetAskStoreForTests();
  resetCoachSlot();
});

describe("what each label opens", () => {
  it("Measured · Take N: that Take's review as its result note said it, in Ask", () => {
    const two = take(2);
    const out = sourceAnswer({ kind: "measured", take: 2 }, world({ finding: (o) => (o === two ? { outcome: two, text: "Bar 1 slipped.", history: "Last Take it was two." } : null) }), two);
    expect(out).toEqual({
      kind: "turn",
      body: {
        shape: null,
        line: { key: "ask.source.take", values: { take: 2, text: "Bar 1 slipped. Last Take it was two." } },
        source: { kind: "measured", take: 2 },
      },
    });
  });

  it("Measured · Take N: the Take the card read, never another Exercise's Take of the same number", () => {
    const cited = take(2, "first");
    const last = take(2, "second");
    const finding = (o: TakeOutcome) => (o === last ? { outcome: last, text: "Not this one.", history: null } : null);
    const out = sourceAnswer({ kind: "measured", take: 2 }, world({ ctx: toolCtx({ lastTake: last }), finding }), cited);
    expect(out).toMatchObject({ kind: "turn", body: { line: { key: "ask.source.takeGone", values: { take: 2 } }, source: { kind: "app" } } });
  });

  it("Measured · Take N with no card behind it: the last Take when it is Take N", () => {
    const three = take(3);
    const finding = (o: TakeOutcome) => (o === three ? { outcome: three, text: "Passed at 80 BPM.", history: null } : null);
    expect(sourceAnswer({ kind: "measured", take: 3 }, world({ ctx: toolCtx({ lastTake: three }), finding }))).toMatchObject({
      body: { line: { key: "ask.source.take", values: { take: 3, text: "Passed at 80 BPM." } } },
    });
    expect(sourceAnswer({ kind: "measured", take: 2 }, world({ ctx: toolCtx({ lastTake: three }), finding }))).toMatchObject({
      body: { line: { key: "ask.source.takeGone" } },
    });
  });

  it("From the Path · Step N, outside a Session: open_step on THAT Path (receipt and way back come from the runner)", () => {
    expect(sourceAnswer({ kind: "path", step: 2, pathId: PATH.id }, world())).toEqual({
      kind: "call",
      call: { tool: "open_step", args: { path: "Speed Picking", step: 2 } },
    });
    // No Path named and none on screen: the Path the player is on, as open_step decides.
    expect(sourceAnswer({ kind: "path", step: 2 }, world())).toEqual({ kind: "call", call: { tool: "open_step", args: { step: 2 } } });
  });

  it("From the Path · Step N, in a Session: the Step's own words quoted in Ask, nothing navigates", () => {
    const out = sourceAnswer({ kind: "path", step: 1, pathId: PATH.id }, inSession());
    expect(out).toEqual({
      kind: "turn",
      body: {
        shape: null,
        line: { key: "ask.source.step", values: { step: 1, title: "One string" } },
        more: [
          { key: "ask.card.path.quote", values: { text: "Pick down and up on one string." } },
          { key: "ask.card.path.quote", values: { text: "Every pattern starts here." } },
        ],
        source: { kind: "path", step: 1, pathId: PATH.id },
      },
    });
    // An empty why is not quoted.
    expect(sourceAnswer({ kind: "path", step: 2, pathId: PATH.id }, inSession())).toMatchObject({ body: { more: [{ values: { text: STEPS[1].goal } }] } });
    // A Step the Path does not have: one line.
    expect(sourceAnswer({ kind: "path", step: 9, pathId: PATH.id }, inSession())).toMatchObject({ body: { line: { key: "ask.source.stepGone", values: { step: 9 } } } });
  });

  it("a Session is a Session whichever says so: the host, the screen or a running phase", () => {
    const src: BlockSource = { kind: "path", step: 1, pathId: PATH.id };
    expect(sourceAnswer(src, world({ sessionActive: true })).kind).toBe("turn");
    expect(sourceAnswer(src, world({ ctx: toolCtx({ screen: "session" }) })).kind).toBe("turn");
    expect(sourceAnswer(src, world({ ctx: toolCtx({ screen: "today", run: runIn("ready") }) })).kind).toBe("turn");
    expect(sourceAnswer(src, world({ ctx: null })).kind).toBe("turn");
  });

  it.each([
    [{ kind: "app" } as const, "ask.source.app"],
    [{ kind: "general" } as const, "ask.source.general"],
    [{ kind: "measured" } as const, "ask.source.measured"],
    [{ kind: "path" } as const, "ask.source.path"],
  ])("%o: one line that says what the label means, in and out of a Session", (source, key) => {
    for (const w of [world(), inSession()]) {
      expect(sourceAnswer(source, w)).toEqual({ kind: "turn", body: { shape: null, line: { key, values: {} }, source: { kind: "app" } } });
    }
  });

  it("every line it can say is in English and says it without a placeholder left over", () => {
    const keys = ["measured", "path", "app", "general", "take", "takeGone", "step", "stepGone"];
    for (const k of keys) {
      const said = t(`ask.source.${k}`, { take: 2, text: "Bar 1 slipped.", step: 2, title: "Two strings" });
      expect(said, k).not.toBe(`ask.source.${k}`);
      expect(said, k).not.toMatch(/\{\{/);
    }
  });
});

describe("the press, through the runner", () => {
  it("outside a Session: the label as the player's words, then open_step's receipt; the app is on the Step", () => {
    const host = fakeHost({ paths: PATHS, view: "today" });
    __setAskToolsForTests(host, toolCtx());
    pressSource({ kind: "path", step: 2, pathId: PATH.id }, "From the Path · Step 2");
    const turns = getAskState().turns;
    expect(turns.map((x) => x.kind)).toEqual(["user", "tool"]);
    expect(turns[0]).toMatchObject({ text: "From the Path · Step 2" });
    expect(turns[1]).toMatchObject({ body: { kind: "receipt" } });
    expect(host.where()).toEqual({ view: "paths", at: { pathId: PATH.id, stepId: "sp-2" } });
  });

  it.each<BlockSource>([
    { kind: "path", step: 2, pathId: PATH.id },
    { kind: "path", step: 2 },
    { kind: "measured", take: 1 },
    { kind: "app" },
    { kind: "general" },
  ])("in a Session, a press on %o calls no go tool and changes nothing", (source) => {
    const host = fakeHost({ paths: PATHS, view: "session", session: true });
    __setAskToolsForTests(host, toolCtx({ screen: "session", run: runIn("result") }));
    pressSource(source, "words");
    expect(host.changes()).toEqual([]);
    expect(host.where()).toEqual({ view: "session", at: { pathId: null, stepId: null } });
    expect(getAskState().turns.some((x: AskTurn) => x.kind === "tool")).toBe(false);
    expect(getAskState().turns.map((x) => x.kind)).toEqual(["user", "card"]);
  });
});

describe("the line as drawn", () => {
  it("with onSource it is a button that hands over the source and the words as read; without it, not a target", () => {
    const pressed: Array<[BlockSource, string]> = [];
    const blocks = [{ type: "text" as const, text: "Bar 1 slipped.", source: { kind: "measured" as const, take: 2 } }];
    const { container, rerender } = render(<CoachBlocks blocks={blocks} onSource={(s, w) => pressed.push([s, w])} />);
    const button = screen.getByTestId("coach-source-press");
    expect(button.tagName).toBe("BUTTON");
    fireEvent.click(button, { detail: 1 });
    // The second click of a double-click is not a second press.
    fireEvent.click(button, { detail: 2 });
    expect(pressed).toEqual([[{ kind: "measured", take: 2 }, t("coachBlocks.source.measuredTake", { take: 2 })]]);
    rerender(<CoachBlocks blocks={blocks} />);
    expect(screen.queryByTestId("coach-source-press")).toBeNull();
    expect(container.querySelector(".coach-block-source button")).toBeNull();
  });

  it("a card's Measured line, pressed in a Session, answers with that Take's review in Ask", () => {
    const f = fixture({ slipped: [0, 4], failOn: "timingEvenness" });
    const host = fakeHost({ view: "session", session: true });
    __setAskToolsForTests(host, f.ctx);
    const last = f.ctx.lastTake!;
    noteFinding(last, "Bars 1 and 5 of the tune slipped.", null);
    askCard({ tool: "where_slipped", args: {} }, "");
    openAsk();
    render(<AskPanel lookingAt={{ text: "Your Session", key: "session|tune" }} onClose={() => {}} />);
    const card = screen.getByTestId("ask-card");
    fireEvent.click(within(card).getByTestId("coach-source-press"), { detail: 1 });
    const turns = getAskState().turns;
    expect(turns.map((x) => x.kind)).toEqual(["card", "user", "card"]);
    const opened = turns[2];
    expect(opened.kind === "card" && opened.card.shape === null && opened.card.line).toEqual({
      key: "ask.source.take",
      values: { take: last.takeNumber, text: "Bars 1 and 5 of the tune slipped." },
    });
    expect(host.changes()).toEqual([]);
  });

  it("a scale is named as the Jam screen names it (its labelKey), not in English a second time", async () => {
    const card: CardBody = {
      shape: "scale_fits",
      lines: [{ key: "ask.card.theory.scale", values: { root: "A", name: "Natural minor", scale: "naturalMinor", notes: "A B C D E F G" } }],
      source: { kind: "app" },
    };
    await i18n.changeLanguage("de");
    try {
      render(<AskCardTurn card={card} />);
      expect(screen.getByTestId("ask-card").textContent).toContain(`A ${i18n.t("scale.naturalMinor")}`);
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});
