/**
 * Fact cards in Ask (leg c2b1a): a chip press asks and answers in the thread,
 * drawn with the existing blocks and the source line; typed English reaches a
 * card only on a clear match (`answerCardFor`, the seam for the send path); an
 * ungraded player is told what Ask can answer instead.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { fixture } from "../../coach/ask/cardFixtures";
import { fakeHost, toolCtx } from "../../coach/tools/fakeHost";
import { __resetCoachLoaderForTests } from "../../hooks/coachLoader";
import i18n from "../../i18n";
import { AskPanel } from "./AskPanel";
import { AskCardTurn } from "./AskCardTurn";
import { answerCardFor, askCard, lastCardShape, MAX_ASK_CHIPS, withinChipCap } from "./askCards";
import { askPrompt } from "./askContext";
import { __resetAskStoreForTests, getAskState, openAsk } from "./askStore";
import { __setAskToolsForTests } from "./askTools";

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
    expect(within(row).getAllByRole("button").map((b) => b.textContent)).toEqual([
      `?${t("ask.card.chip.where")}`,
      `?${t("ask.card.chip.lean")}`,
      `?${t("ask.card.chip.count")}`,
    ]);
    fireEvent.click(screen.getByTestId("ask-card-chip-where_slipped"), { detail: 1 });
    const turns = getAskState().turns;
    expect(turns.map((x) => x.kind)).toEqual(["user", "card"]);
    const card = screen.getByTestId("ask-card");
    expect(card).toHaveAttribute("data-card", "where_slipped");
    expect(card).toHaveTextContent("Bar 1 of the tune slipped on 2 of 3 rounds.");
    expect(card).toHaveTextContent(`${t("coachBlocks.source.measuredTake", { take: 2 })}`);
    // Above the text box now: the other two, never the one just answered.
    const again = screen.getByTestId("ask-card-chips");
    expect(within(again).queryByTestId("ask-card-chip-where_slipped")).toBeNull();
    expect(within(again).getAllByRole("button")).toHaveLength(2);
  });

  it("at most three chips at once, card chips first (F10)", () => {
    __setAskToolsForTests(fakeHost(), below().ctx);
    openAsk();
    render(<AskPanel lookingAt={{ text: "Your Session", key: "session|tune" }} onClose={() => {}} />);
    const count = () =>
      (screen.queryByTestId("ask-card-chips")?.querySelectorAll("button").length ?? 0) +
      (screen.queryByTestId("ask-tool-chips")?.querySelectorAll("button").length ?? 0);
    expect(count()).toBeLessThanOrEqual(MAX_ASK_CHIPS);
    fireEvent.click(screen.getByTestId("ask-card-chip-where_slipped"), { detail: 1 });
    expect(count()).toBeLessThanOrEqual(MAX_ASK_CHIPS);
  });

  it("the cap: tool chips fill only the room the cards leave", () => {
    expect(withinChipCap(3, ["a", "b"])).toEqual([]);
    expect(withinChipCap(2, ["a", "b", "c", "d"])).toEqual(["a"]);
    expect(withinChipCap(0, ["a", "b", "c", "d"])).toEqual(["a", "b", "c"]);
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
    for (const screen of ["songs", "jam", "today"] as const) {
      __setAskToolsForTests(fakeHost(), toolCtx({ screen }));
      expect(answerCardFor("Where did I mess up?")).toBeNull();
      expect(answerCardFor("am I rushing?")).toBeNull();
    }
    expect(getAskState().turns).toEqual([]);
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
