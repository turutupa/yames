import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAskStoreForTests,
  askCoach,
  closeAsk,
  getAskState,
  noteAskScreen,
  openAsk,
  openDeferredAsk,
  registerAskSender,
  setAskTakeGate,
  showToolsCoach,
  toggleAsk,
  appendAskTurn,
  askTurnId,
} from "./askStore";

describe("Ask's store", () => {
  beforeEach(() => __resetAskStoreForTests());
  afterEach(() => __resetAskStoreForTests());

  it("opens and closes, on the Ask section, and toggles", () => {
    openAsk();
    expect(getAskState()).toMatchObject({ open: true, section: "ask" });
    closeAsk();
    expect(getAskState().open).toBe(false);
    toggleAsk();
    expect(getAskState().open).toBe(true);
    toggleAsk();
    expect(getAskState().open).toBe(false);
  });

  it("the tools' Start opens it on the Tools coach section", () => {
    showToolsCoach();
    expect(getAskState()).toMatchObject({ open: true, section: "tools" });
  });

  it("askCoach (a line's or a chip's onAsk) asks the focus and the question", () => {
    const asked: string[] = [];
    registerAskSender((q) => asked.push(q));
    askCoach({ question: "  Why 90 again?  " });
    expect(getAskState().open).toBe(true);
    expect(getAskState().focusSeq).toBe(1);
    expect(asked).toEqual(["Why 90 again?"]);
  });

  it("during a Take nothing opens: it is deferred, the question dropped, and opens after", () => {
    let running = true;
    setAskTakeGate(() => running);
    const asked: string[] = [];
    registerAskSender((q) => asked.push(q));
    openAsk({ question: "now?" });
    expect(getAskState()).toMatchObject({ open: false, deferred: true });
    expect(asked).toEqual([]);
    openDeferredAsk();
    expect(getAskState().open).toBe(false);
    running = false;
    openDeferredAsk();
    expect(getAskState()).toMatchObject({ open: true, deferred: false });
  });

  it("closing gives focus back to what opened it", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    openAsk();
    const elsewhere = document.createElement("input");
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    closeAsk();
    expect(document.activeElement).toBe(opener);
    opener.remove();
    elsewhere.remove();
  });

  it("a divider goes into a conversation when the screen changes, never into an empty one", () => {
    noteAskScreen("today", "Now looking at: Today");
    expect(getAskState().turns).toEqual([]);
    noteAskScreen("progress", "Now looking at: Progress");
    expect(getAskState().turns).toEqual([]);
    appendAskTurn({ id: askTurnId(), kind: "user", text: "hello" });
    noteAskScreen("progress", "Now looking at: Progress");
    expect(getAskState().turns).toHaveLength(1);
    noteAskScreen("today", "Now looking at: Today");
    expect(getAskState().turns.at(-1)).toMatchObject({ kind: "divider", text: "Now looking at: Today" });
  });

  it("the conversation outlives the panel being closed", () => {
    const sender = vi.fn();
    registerAskSender(sender);
    openAsk();
    appendAskTurn({ id: askTurnId(), kind: "user", text: "kept" });
    closeAsk();
    openAsk();
    expect(getAskState().turns.map((t) => t.text)).toEqual(["kept"]);
  });
});
