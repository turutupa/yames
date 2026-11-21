/**
 * Fact cards in Ask (leg c2b1a): a chip press asks and answers in the thread,
 * drawn with the existing blocks and the source line; typed English reaches a
 * card only on a clear match (`answerCardFor`, the seam for the send path); an
 * ungraded player is told what Ask can answer instead.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { fixture } from "../../coach/ask/cardFixtures";
import { fakeHost, toolCtx } from "../../coach/tools/fakeHost";
import { __resetCoachLoaderForTests } from "../../hooks/coachLoader";
import i18n from "../../i18n";
import type { SessionPlan } from "../../session/planner";
import { AskPanel } from "./AskPanel";
import { AskCardTurn } from "./AskCardTurn";
import { answerCardFor, askCard, lastCardShape, MAX_ASK_CHIPS, typedCardAnswerer, withinChipCap } from "./askCards";
import { askPrompt } from "./askContext";
import { __resetAskStoreForTests, getAskState, openAsk, registerAskSender } from "./askStore";
import { answerTyped, setAskNextAnswerer } from "./askTyped";
import { __setAskToolsForTests } from "./askTools";
import { rememberPaths } from "../../coach/pathSuggest";
import { cardChipsFor } from "../../coach/ask/suggest";
import { ALT, SWEEP } from "../../session/testKit";

const t = i18n.t.bind(i18n);

beforeEach(() => {
  __resetAskStoreForTests();
  __resetCoachLoaderForTests();
});
afterEach(() => {
  __setAskToolsForTests(null, null);
  __resetAskStoreForTests();
});

const below = () => fixture({ slipped: [0, 4], failOn: "timingEvenness", deviation: (bar) => (bar % 4 === 0 ? 40 : 0) });

describe("a chip asks and answers in the thread", () => {
  it("offers the cards in the empty state; a press writes the question, then the card with its source", () => {
    __setAskToolsForTests(fakeHost(), below().ctx);
    openAsk();
    render(<AskPanel lookingAt={{ text: "Your Session", key: "session|tune" }} onClose={() => {}} />);
    const row = screen.getByTestId("ask-card-chips");
    // Below the pass mark (c2b1b): where, how far the pass mark is, early or late.
    expect(within(row).getAllByRole("button").map((b) => b.textContent)).toEqual([
      `?${t("ask.card.chip.where")}`,
      `?${t("ask.card.chip.distance")}`,
      `?${t("ask.card.chip.lean")}`,
    ]);
    fireEvent.click(screen.getByTestId("ask-card-chip-where_slipped"), { detail: 1 });
    const turns = getAskState().turns;
    expect(turns.map((x) => x.kind)).toEqual(["user", "card"]);
    const card = screen.getByTestId("ask-card");
    expect(card).toHaveAttribute("data-card", "where_slipped");
    expect(card).toHaveTextContent("Bar 1 of the tune slipped on 2 of 3 rounds.");
    expect(card).toHaveTextContent(`${t("coachBlocks.source.measuredTake", { take: 2 })}`);
    // Above the text box now: the next three, never the one just answered.
    const again = screen.getByTestId("ask-card-chips");
    expect(within(again).queryByTestId("ask-card-chip-where_slipped")).toBeNull();
    expect(within(again).getAllByRole("button")).toHaveLength(3);
  });

  it("at most four chips at once (the tools' own cap), card chips first (F10)", () => {
    __setAskToolsForTests(fakeHost(), below().ctx);
    openAsk();
    render(<AskPanel lookingAt={{ text: "Your Session", key: "session|tune" }} onClose={() => {}} />);
    const count = () =>
      (screen.queryByTestId("ask-card-chips")?.querySelectorAll("button").length ?? 0) +
      (screen.queryByTestId("ask-tool-chips")?.querySelectorAll("button").length ?? 0);
    // Three cards and the tools' first chip: the tools had more to offer than the room left.
    expect(count()).toBe(MAX_ASK_CHIPS);
    expect(screen.getByTestId("ask-card-chips").querySelectorAll("button")).toHaveLength(3);
    fireEvent.click(screen.getByTestId("ask-card-chip-where_slipped"), { detail: 1 });
    expect(count()).toBeLessThanOrEqual(MAX_ASK_CHIPS);
  });

  it("the cap: tool chips fill only the room the cards leave", () => {
    expect(withinChipCap(4, ["a", "b"])).toEqual([]);
    expect(withinChipCap(3, ["a", "b", "c", "d"])).toEqual(["a"]);
    expect(withinChipCap(0, ["a", "b", "c", "d"])).toEqual(["a", "b", "c", "d"]);
  });

  it("a double-click is one question", () => {
    __setAskToolsForTests(fakeHost(), below().ctx);
    openAsk();
    render(<AskPanel lookingAt={{ text: "Your Session", key: "session|tune" }} onClose={() => {}} />);
    const chip = screen.getByTestId("ask-card-chip-early_or_late");
    fireEvent.click(chip, { detail: 1 });
    fireEvent.click(chip, { detail: 2 });
    expect(getAskState().turns.filter((x) => x.kind === "card")).toHaveLength(1);
  });

  it("an ungraded player: no card chip, and one line saying what is not there to answer from", () => {
    __setAskToolsForTests(fakeHost(), fixture({ slipped: [0, 4], failOn: "timingEvenness" }, { grading: "off" }).ctx);
    openAsk();
    render(<AskPanel lookingAt={{ text: "Your Session", key: "session|tune" }} onClose={() => {}} />);
    expect(screen.queryByTestId("ask-card-chips")).toBeNull();
    expect(screen.getByTestId("ask-card-ungraded")).toHaveTextContent(t("ask.card.canAnswer.ungraded"));
  });

  it("off a Session, no card and no ungraded line", () => {
    __setAskToolsForTests(fakeHost(), toolCtx({ screen: "today" }));
    openAsk();
    render(<AskPanel lookingAt={{ text: "Today", key: "today" }} onClose={() => {}} />);
    expect(screen.queryByTestId("ask-card-chips")).toBeNull();
    expect(screen.queryByTestId("ask-card-ungraded")).toBeNull();
  });
});

describe("answerCardFor: the seam for the text box's send path", () => {
  it("a clear question answers, with the premise first (mock 15)", () => {
    __setAskToolsForTests(fakeHost(), below().ctx);
    const id = answerCardFor("how do i stop rushing the open string");
    expect(id).not.toBeNull();
    const turns = getAskState().turns;
    expect(turns[0]).toMatchObject({ kind: "user", text: "how do i stop rushing the open string" });
    const card = turns[1];
    expect(card.kind === "card" && card.card.shape !== null && card.card.lines[0].key).toBe("ask.card.lean.premise.late");
  });

  it("anything not clearly a card: null, and nothing written", () => {
    __setAskToolsForTests(fakeHost(), below().ctx);
    expect(answerCardFor("slower")).toBeNull();
    expect(answerCardFor("should I anchor my pinky?")).toBeNull();
    expect(getAskState().turns).toEqual([]);
  });

  it("no Take to read (Songs, Jam, Today): null and nothing written, so the next answerer gets it (F6)", () => {
    // Grading on and off alike (c2b1d M4): off, the card's "you're playing
    // without grading" line would otherwise be written and keep it from the model.
    for (const grading of ["on", "off"] as const) {
      for (const screen of ["songs", "jam", "today"] as const) {
        __setAskToolsForTests(fakeHost(), toolCtx({ screen, grading }));
        expect(answerCardFor("Where did I mess up?")).toBeNull();
        expect(answerCardFor("am I rushing?")).toBeNull();
        expect(answerCardFor("Why didn't that count?")).toBeNull();
        expect(answerCardFor("do you check my pick direction?")).toBeNull();
      }
    }
    expect(getAskState().turns).toEqual([]);
  });

  it("a metric question with the Exercise on screen and no Take yet still answers (c2b1d M4)", () => {
    const f = fixture({});
    __setAskToolsForTests(fakeHost(), { ...f.ctx, lastTake: undefined });
    expect(answerCardFor("do you check my pick direction?")).not.toBeNull();
    const card = getAskState().turns[1];
    expect(card.kind === "card" && card.card.shape).toBe("why_not_counted");
  });

  it("a question about another Take: null and nothing written (F6)", () => {
    __setAskToolsForTests(fakeHost(), below().ctx);
    expect(answerCardFor("Was I late in Take 1?")).toBeNull();
    expect(getAskState().turns).toEqual([]);
  });

  it("asked by an ungraded player: one line, from the app's rule, never a card about quality", () => {
    __setAskToolsForTests(fakeHost(), fixture({ slipped: [0, 4], failOn: "timingEvenness" }, { grading: "off" }).ctx);
    answerCardFor("where did it slip?");
    const card = getAskState().turns[1];
    expect(card.kind === "card" && card.card.shape).toBe(null);
    render(<AskCardTurn card={card.kind === "card" ? card.card : (null as never)} />);
    expect(screen.getByTestId("ask-card")).toHaveTextContent(t("ask.card.notNow.ungraded"));
    expect(screen.getByTestId("ask-card")).toHaveTextContent(t("coachBlocks.source.app"));
  });
});

describe("the seam: typed text, the router, then the cards, then the model (c2b1b)", () => {
  afterEach(() => {
    setAskNextAnswerer(null);
  });

  /** What reached the model or the plain statement (the host's answerer). */
  const capture = () => {
    const sent: string[] = [];
    registerAskSender((q) => {
      sent.push(q);
    });
    return sent;
  };
  const panel = () => render(<AskPanel lookingAt={{ text: "Your Session", key: "session|tune" }} onClose={() => {}} />);

  it("with the panel open, a card question typed in English answers with the card, not the model", () => {
    __setAskToolsForTests(fakeHost(), below().ctx);
    openAsk();
    panel();
    const sent = capture();
    let outcome: ReturnType<typeof answerTyped> = null;
    act(() => {
      outcome = answerTyped("How far is the pass mark?", "en");
    });
    expect(outcome).toBe("next");
    const turns = getAskState().turns;
    expect(turns.map((x) => x.kind)).toEqual(["user", "card"]);
    expect(turns[1].kind === "card" && turns[1].card.shape).toBe("pass_mark_distance");
    expect(sent).toEqual([]);
    expect(screen.getByTestId("ask-card")).toHaveTextContent("Even: 79% in Take 2, 6 points short of the pass mark of 85%.");
  });

  it("a line the router takes as a command never reaches a card", () => {
    __setAskToolsForTests(fakeHost(), below().ctx);
    openAsk();
    panel();
    let asked = 0;
    const cards = typedCardAnswerer(() => "en");
    setAskNextAnswerer((text) => {
      asked += 1;
      return cards(text);
    });
    // The router answers it (a call, or "not on this screen"); the slot is never asked.
    expect(["call", "notHere"]).toContain(answerTyped("slower", "en"));
    expect(asked).toBe(0);
    expect(getAskState().turns.some((x) => x.kind === "card")).toBe(false);
  });

  it("in any other language typed text does not reach a card: it goes on to the model", () => {
    __setAskToolsForTests(fakeHost(), below().ctx);
    setAskNextAnswerer(typedCardAnswerer(() => "de"));
    const sent = capture();
    // English words, German interface: still not a card (cards are reached by chip there).
    expect(answerTyped("where did it slip?", "de")).toBe("asked");
    expect(sent).toEqual(["where did it slip?"]);
    expect(getAskState().turns.some((x) => x.kind === "card")).toBe(false);
  });

  it("not a card's question: nothing written by the cards, and the model gets it", () => {
    __setAskToolsForTests(fakeHost(), below().ctx);
    openAsk();
    panel();
    const sent = capture();
    expect(answerTyped("should I anchor my pinky?", "en")).toBe("asked");
    expect(sent).toEqual(["should I anchor my pinky?"]);
    expect(getAskState().turns.some((x) => x.kind === "card")).toBe(false);
  });

  it("the panel closed: the slot is empty again", () => {
    __setAskToolsForTests(fakeHost(), below().ctx);
    openAsk();
    const { unmount } = panel();
    unmount();
    const sent = capture();
    expect(answerTyped("where did it slip?", "en")).toBe("asked");
    expect(sent).toEqual(["where did it slip?"]);
    expect(getAskState().turns.some((x) => x.kind === "card")).toBe(false);
  });
});

describe("the thread", () => {
  it("a model's prompt does not see a question a card answered", () => {
    __setAskToolsForTests(fakeHost(), below().ctx);
    askCard({ tool: "where_slipped", args: {} }, "Where did it slip?");
    expect(askPrompt("ctx", getAskState().turns, "next?")).not.toContain("Where did it slip?");
  });

  it("knows which card it answered last", () => {
    __setAskToolsForTests(fakeHost(), below().ctx);
    askCard({ tool: "early_or_late", args: {} }, "Was I early or late?");
    expect(lastCardShape(getAskState().turns)).toBe("early_or_late");
  });
});

describe("'suggest a Path' (leg c4b3, review M2)", () => {
  afterEach(() => rememberPaths([]));

  it("typed on Paths with no Take: the card, written; on Today and Progress too", () => {
    rememberPaths([ALT, SWEEP]);
    for (const screen of ["paths", "today", "progress"] as const) {
      __resetAskStoreForTests();
      __setAskToolsForTests(fakeHost({ view: screen === "paths" ? "paths" : "today" }), toolCtx({ screen }));
      expect(answerCardFor("suggest a path"), screen).not.toBeNull();
      const card = getAskState().turns[1];
      expect(card.kind === "card" && card.card.shape, screen).toBe("suggest_path");
    }
  });

  it("typed in a Session before its first Take: answered", () => {
    rememberPaths([ALT, SWEEP]);
    __setAskToolsForTests(fakeHost(), fixture({}, { lastTake: undefined }).ctx);
    expect(answerCardFor("Which path should I try next?")).not.toBeNull();
  });

  it("its chip is offered in Ask's empty state on Paths and Progress, not in a Session", () => {
    expect(cardChipsFor(toolCtx({ screen: "paths" }), "askEmpty").map((c) => c.kind === "card" && c.shape)).toContain("suggest_path");
    expect(cardChipsFor(toolCtx({ screen: "progress" }), "askEmpty").map((c) => c.kind === "card" && c.shape)).toContain("suggest_path");
    expect(cardChipsFor(fixture({}, { lastTake: undefined }).ctx, "askEmpty").map((c) => c.kind === "card" && c.shape)).not.toContain("suggest_path");
  });
});

describe("cards that end in a proposal or a drawing (leg c2b2a)", () => {
  const today = () => toolCtx({ screen: "today" });
  const hostWithMinutes = () => {
    const plan = { minutes: 5, mood: "first", daysAway: null, steps: [] } as unknown as SessionPlan;
    return fakeHost({ view: "today" }, { minutes: () => 10, previewPlan: () => plan, setMinutes: () => "done" as never });
  };

  it("typed 'I have 5 minutes': the card, then set_minutes' proposal through the runner; nothing changes", () => {
    const host = hostWithMinutes();
    __setAskToolsForTests(host, today());
    expect(answerCardFor("I have 5 minutes")).not.toBeNull();
    const turns = getAskState().turns;
    expect(turns.map((t) => t.kind)).toEqual(["user", "card", "tool"]);
    const tool = turns[2];
    expect(tool.kind === "tool" && tool.body.kind).toBe("proposal");
    expect(host.changes()).toEqual([]);
  });

  it("in a Session the minutes card is not answered by typing: nothing written, the next answerer has it", () => {
    __setAskToolsForTests(hostWithMinutes(), below().ctx);
    expect(answerCardFor("I have 5 minutes")).toBeNull();
    expect(getAskState().turns).toEqual([]);
  });

  it("'what notes are in F7?': the spelled card, then show_chord's drawing as a receipt", () => {
    __setAskToolsForTests(fakeHost({ view: "today" }, { instrument: () => "guitar" }), today());
    expect(answerCardFor("What notes are in F7?")).not.toBeNull();
    const turns = getAskState().turns;
    expect(turns.map((t) => t.kind)).toEqual(["user", "card", "tool"]);
    const tool = turns[2];
    expect(tool.kind === "tool" && tool.body.kind).toBe("receipt");
  });

  it("an unknown chord: 'I don't know', and nothing drawn", () => {
    __setAskToolsForTests(fakeHost({ view: "today" }), today());
    expect(answerCardFor("What notes are in Fxyz?")).toBeNull();
    askCard({ tool: "chord_notes", args: { root: "F", suffix: "unknown" } }, "notes of F7zz");
    expect(getAskState().turns.map((t) => t.kind)).toEqual(["user", "card"]);
  });
});
