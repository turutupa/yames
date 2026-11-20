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
  toggleAsk,
  appendAskTurn,
  askTurnId,
  consumeAskFocus,
  releaseHeldAsk,
  settleAskTurn,
  subscribeAsk,
} from "./askStore";

describe("Ask's store", () => {
  beforeEach(() => __resetAskStoreForTests());
  afterEach(() => __resetAskStoreForTests());

  it("opens and closes, and toggles; it is only Ask (no Tools coach section since c2a2)", () => {
    openAsk();
    expect(getAskState().open).toBe(true);
    expect(getAskState()).not.toHaveProperty("section");
    closeAsk();
    expect(getAskState().open).toBe(false);
    toggleAsk();
    expect(getAskState().open).toBe(true);
    toggleAsk();
    expect(getAskState().open).toBe(false);
  });

  it("askCoach (a line's or a chip's onAsk) asks the focus and the question", () => {
    const asked: string[] = [];
    registerAskSender((q) => asked.push(q));
    askCoach({ question: "  Why 90 again?  " });
    expect(getAskState().open).toBe(true);
    expect(getAskState().focusPending).toBe(true);
    expect(asked).toEqual(["Why 90 again?"]);
  });

  it("a focus request is consumed once: a later open that did not ask for it does not take it", () => {
    askCoach();
    expect(getAskState().focusPending).toBe(true);
    consumeAskFocus();
    expect(getAskState().focusPending).toBe(false);
    closeAsk();
    // The deferred open after a Take, or `C`: no focus asked.
    openAsk();
    expect(getAskState().focusPending).toBe(false);
    closeAsk();
    // Asked but never taken (closed first): not carried into the next open.
    askCoach();
    closeAsk();
    openAsk();
    expect(getAskState().focusPending).toBe(false);
  });

  it("opens about a sentence, and any open without one forgets it", () => {
    askCoach({ about: " Bar 5 slipped. " });
    expect(getAskState().about).toBe("Bar 5 slipped.");
    openAsk();
    expect(getAskState().about).toBeNull();
    askCoach({ about: "Keep it even." });
    closeAsk();
    expect(getAskState().about).toBeNull();
  });

  it("an answer that arrives during a Take is held, and lands when the Take ends", () => {
    let running = false;
    setAskTakeGate(() => running);
    const id = askTurnId();
    appendAskTurn({ id, kind: "coach", text: "", pending: true });
    const seen: number[] = [];
    const off = subscribeAsk(() => seen.push(1));
    running = true;
    settleAskTurn(id, { id, kind: "coach", text: "Same tempo." });
    expect(seen).toEqual([]);
    expect(getAskState().turns[0]).toMatchObject({ pending: true });
    releaseHeldAsk();
    expect(seen).toEqual([]);
    running = false;
    releaseHeldAsk();
    expect(getAskState().turns[0]).toMatchObject({ kind: "coach", text: "Same tempo." });
    off();
  });

  it("a held answer whose conversation was cleared is dropped", () => {
    let running = true;
    setAskTakeGate(() => running);
    settleAskTurn("ask-gone", { id: "ask-gone", kind: "coach", text: "late" });
    running = false;
    releaseHeldAsk();
    expect(getAskState().turns).toEqual([]);
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
