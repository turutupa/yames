/**
 * Ask's panel (leg c2a1): one panel, its roles, its keys, the honest empty
 * state and answers, the model selector at its foot, and the Session's rules
 * for the drawer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { AskPanel } from "./AskPanel";
import { answerAsk, useAskSessionRules } from "./useCoachPanel";
import {
  __resetAskStoreForTests,
  closeAsk,
  getAskState,
  openAsk,
  registerAskSender,
  subscribeAsk,
} from "./askStore";
import { __resetCoachLoaderForTests } from "../../hooks/coachLoader";
import { mockInvoke, setInvokeResponse } from "../../test/mocks";
import i18n from "../../i18n";
import { within } from "@testing-library/react";
import { fakeHost, toolCtx } from "../../coach/tools/fakeHost";
import { __setAskToolsForTests } from "./askTools";

const t = i18n.t.bind(i18n);

const snapshot = vi.hoisted(() => ({ state: "off" as string }));
vi.mock("../../hooks/coachLoader", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../hooks/coachLoader")>();
  // One object per (snapshot, state): `useSyncExternalStore` needs it stable.
  let last: { base: unknown; state: string; out: ReturnType<typeof real.getCoachModelSnapshot> } | null = null;
  return {
    ...real,
    getCoachModelSnapshot: () => {
      const base = real.getCoachModelSnapshot();
      if (!last || last.base !== base || last.state !== snapshot.state) {
        last = { base, state: snapshot.state, out: { ...base, state: snapshot.state as typeof base.state } };
      }
      return last.out;
    },
  };
});

beforeEach(() => {
  __resetAskStoreForTests();
  __resetCoachLoaderForTests();
  snapshot.state = "off";
});
afterEach(() => __resetAskStoreForTests());

describe("the panel", () => {
  it("is a complementary region with a log, the selector at its foot and one footer line", () => {
    openAsk();
    render(<AskPanel lookingAt={{ text: "Today", key: "today" }} onClose={() => {}} />);
    const panel = screen.getByRole("complementary");
    expect(panel).toHaveAttribute("data-coach-model-bounds");
    expect(panel.querySelector("[data-coach-model-ceiling]")).not.toBeNull();
    expect(screen.getByRole("log")).toBeInTheDocument();
    expect(screen.getByTestId("ask-context")).toHaveTextContent(`${t("ask.lookingAt")} Today`);
    const foot = panel.querySelector(".ask-foot")!;
    expect(foot.querySelector(".coach-model-button")).not.toBeNull();
    expect(foot.querySelector(".ask-footer")).toHaveTextContent(t("help.ui.footer.local"));
  });

  it("says honestly what it can do with no model (the rules and search answer, leg c2cb), and fakes no answer", () => {
    openAsk();
    render(<AskPanel lookingAt={null} onClose={() => {}} />);
    expect(screen.getByTestId("ask-empty")).toHaveTextContent(t("help.ui.empty.local"));
    expect(screen.getByTestId("ask-input")).toHaveAttribute("placeholder", t("help.ui.placeholder"));
  });

  it("holds no solid button", () => {
    openAsk();
    const { container } = render(<AskPanel lookingAt={null} onClose={() => {}} />);
    expect(container.querySelector(".btn-primary, .session-big")).toBeNull();
  });

  it("Escape closes it; no key inside it reaches the screen's hotkeys", () => {
    openAsk();
    const onClose = vi.fn();
    const outside = vi.fn();
    document.addEventListener("keydown", outside);
    render(<AskPanel lookingAt={null} onClose={onClose} />);
    const box = screen.getByTestId("ask-input");
    fireEvent.keyDown(box, { key: " " });
    fireEvent.keyDown(screen.getByTestId("ask-close"), { key: "n" });
    expect(outside).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    document.removeEventListener("keydown", outside);
  });

  it("Enter sends what was typed to the store's answerer and clears the box", () => {
    openAsk();
    const asked: string[] = [];
    registerAskSender((q) => asked.push(q));
    render(<AskPanel lookingAt={null} onClose={() => {}} />);
    const box = screen.getByTestId("ask-input") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "is 90 slow?" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(asked).toEqual(["is 90 slow?"]);
    expect(box.value).toBe("");
  });

  it("the Enter that commits an IME composition sends nothing, even after compositionend (keyCode 229; review t1b2b, finding 3)", () => {
    openAsk();
    const host = fakeHost({ view: "today" });
    __setAskToolsForTests(host, toolCtx({ screen: "today" }));
    const asked: string[] = [];
    registerAskSender((q) => asked.push(q));
    render(<AskPanel lookingAt={null} onClose={() => {}} />);
    const box = screen.getByTestId("ask-input") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "paths" } });
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 });
    fireEvent.keyDown(box, { key: "Enter", isComposing: true });
    expect(host.changes()).toEqual([]);
    expect(asked).toEqual([]);
    expect(box.value).toBe("paths");
    // The Enter after it sends, once, however fast the second one comes.
    fireEvent.keyDown(box, { key: "Enter", keyCode: 13 });
    fireEvent.keyDown(box, { key: "Enter", keyCode: 13 });
    expect(host.where().view).toBe("paths");
    expect(getAskState().turns.filter((x) => x.kind === "user")).toHaveLength(1);
    __setAskToolsForTests(null, null);
  });

  it("with a model ready, a typed command is done, not handed to the model; a question still is", () => {
    openAsk();
    snapshot.state = "ready";
    const host = fakeHost({ view: "today" });
    __setAskToolsForTests(host, toolCtx({ screen: "today" }));
    const asked: string[] = [];
    registerAskSender((q) => asked.push(q));
    render(<AskPanel lookingAt={null} onClose={() => {}} />);
    const box = screen.getByTestId("ask-input") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "open paths" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(host.where().view).toBe("paths");
    expect(asked).toEqual([]);
    fireEvent.change(box, { target: { value: "why was I late?" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(asked).toEqual(["why was I late?"]);
    __setAskToolsForTests(null, null);
  });

  it("is Ask and its Notebook only: no Start, no End, no Feed or History tabs, no sections (legs c2a2, c4a2)", () => {
    openAsk();
    const { container } = render(<AskPanel lookingAt={null} onClose={() => {}} />);
    expect(container.querySelector("[data-testid^='ask-section']")).toBeNull();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([t("notebook.ui.tabAsk"), t("notebook.ui.tabNotebook")]);
    for (const word of ["Start", "End", "Feed", "History"]) {
      expect(screen.queryByRole("button", { name: word })).toBeNull();
      expect(screen.queryByRole("tab", { name: word })).toBeNull();
    }
    expect(screen.getByRole("log")).toBeInTheDocument();
    expect(container.querySelector(".ask-foot .coach-model-button")).not.toBeNull();
  });

  it("the caret goes in the box when a key or a question opened it", () => {
    render(<AskPanel lookingAt={null} onClose={() => {}} />);
    act(() => openAsk({ focus: true }));
    expect(document.activeElement).toBe(screen.getByTestId("ask-input"));
  });

  it("a focus request is consumed once: the next open that did not ask (the deferred one after a Take) leaves the caret alone", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    openAsk({ focus: true });
    const first = render(<AskPanel lookingAt={null} onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByTestId("ask-input"));
    act(() => closeAsk({ restoreFocus: false }));
    first.unmount();
    opener.focus();
    // The panel remounts on every open, as MainWindow mounts it.
    act(() => openAsk());
    render(<AskPanel lookingAt={null} onClose={() => {}} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("shows the sentence it was opened about", () => {
    openAsk({ about: "Bar 5 slipped" });
    render(<AskPanel lookingAt={null} onClose={() => {}} />);
    expect(screen.getByTestId("ask-about")).toHaveTextContent("Bar 5 slipped");
  });

  it("offers the tools' chips in the empty state, then above the text box; a press is a tool call (leg t1b1)", () => {
    const host = fakeHost({ view: "beat" }, { clickSubdivision: () => 1 });
    __setAskToolsForTests(host, toolCtx({ screen: "beat" }));
    openAsk();
    const { container } = render(<AskPanel lookingAt={{ text: "Metronome", key: "beat" }} onClose={() => {}} />);
    const chips = within(screen.getByTestId("ask-empty")).getAllByRole("button");
    // The help set's chip first (a card chip, leg c2cb), then the tools' in the room left of four.
    expect(chips.map((c) => c.textContent)).toEqual([`?${t("help.ui.chip")}`, "Slower", "Faster", "Two clicks a beat"]);
    act(() => fireEvent.click(chips[1]));
    expect(screen.getByTestId("ask-receipt")).toBeInTheDocument();
    // The thread has turns now: the chips sit above the text box, once.
    expect(container.querySelectorAll("[data-testid=ask-tool-chips]").length).toBe(1);
    expect(container.querySelector(".ask-chip-row [data-testid=ask-tool-chips]")).not.toBeNull();
    expect(container.querySelector(".btn-primary")).toBeNull();
    __setAskToolsForTests(null, null);
  });

  it("the chips are chosen again when a turn is written in place: after the Undo's press, the subdivision chip offers the other value", () => {
    let now = 1;
    const host = fakeHost({ view: "beat" }, { clickSubdivision: () => now as 1, setClickSubdivision: (s) => ((now = s), "done") });
    __setAskToolsForTests(host, toolCtx({ screen: "beat" }));
    openAsk();
    const { container } = render(<AskPanel lookingAt={{ text: "Metronome", key: "beat" }} onClose={() => {}} />);
    // A chip's own press is the press (leg chip1): changed at once, with Undo.
    act(() => fireEvent.click(within(screen.getByTestId("ask-empty")).getByRole("button", { name: "Two clicks a beat" })));
    const row = () => [...container.querySelectorAll(".ask-chip-row [data-testid=ask-tool-chips] button")].map((b) => b.textContent);
    expect(now).toBe(2);
    expect(screen.queryByTestId("ask-proposal")).toBeNull();
    expect(row()).toContain("One click a beat");
    act(() => fireEvent.click(screen.getByTestId("ask-undo")));
    expect(now).toBe(1);
    expect(row()).toContain("Two clicks a beat");
    expect(row()).not.toContain("One click a beat");
    __setAskToolsForTests(null, null);
  });
});

describe("the chip row's own button (leg chip1b: review M1, L4)", () => {
  function tempoPanel() {
    let bpm = 120;
    const host = fakeHost({ view: "beat" }, { tempo: () => bpm, setTempo: (b) => ((bpm = b), "done") });
    __setAskToolsForTests(host, toolCtx({ screen: "beat" }));
    openAsk();
    const { container } = render(<AskPanel lookingAt={{ text: "Metronome", key: "beat" }} onClose={() => {}} />);
    const chip = () => container.querySelector<HTMLButtonElement>('[data-chip="slower"]')!;
    return { host, chip, bpm: () => bpm };
  }
  afterEach(() => __setAskToolsForTests(null, null));

  it("the second click of a double-click is not a press: one change, one receipt", () => {
    const { chip, bpm } = tempoPanel();
    act(() => fireEvent.click(chip(), { detail: 1 }));
    act(() => fireEvent.click(chip(), { detail: 2 }));
    expect(bpm()).toBe(115);
    expect(screen.getAllByTestId("ask-receipt")).toHaveLength(1);
  });

  it("a held Enter is one press: its auto-repeats change nothing, and Undo puts back what the player had", () => {
    const { chip, bpm } = tempoPanel();
    // The browser's own sequence for a held key: keydown, click (detail 0), then keydown(repeat) + click per repeat.
    act(() => void fireEvent.keyDown(chip(), { key: "Enter" }));
    act(() => void fireEvent.click(chip(), { detail: 0 }));
    for (let i = 0; i < 5; i++) {
      const repeat = fireEvent.keyDown(chip(), { key: "Enter", repeat: true });
      expect(repeat, "the repeat's default (its click) is stopped").toBe(false);
      act(() => void fireEvent.click(chip(), { detail: 0 }));
    }
    act(() => void fireEvent.keyUp(chip(), { key: "Enter" }));
    expect(bpm()).toBe(115);
    expect(screen.getAllByTestId("ask-receipt")).toHaveLength(1);
    // A new, separate key press is a press again.
    act(() => void fireEvent.keyDown(chip(), { key: "Enter" }));
    act(() => void fireEvent.click(chip(), { detail: 0 }));
    expect(bpm()).toBe(110);
  });

  it("separate presses chain: Slower ×3, Undo goes back to 120; the live receipt says 120 → 105, the earlier ones are plain lines", () => {
    const { chip, bpm } = tempoPanel();
    for (let i = 0; i < 3; i++) act(() => fireEvent.click(chip(), { detail: 1 }));
    expect(bpm()).toBe(105);
    const receipts = screen.getAllByTestId("ask-receipt");
    expect(receipts).toHaveLength(3);
    expect(receipts.map((r) => r.getAttribute("data-undo"))).toEqual(["gone", "gone", "live"]);
    expect(receipts[2]).toHaveTextContent("Tempo 120 → 105 BPM");
    expect(receipts[0]).toHaveTextContent("Tempo 120 → 115 BPM");
    expect(screen.getAllByTestId("ask-undo")).toHaveLength(1);
    act(() => fireEvent.click(screen.getByTestId("ask-undo")));
    expect(bpm()).toBe(120);
  });
});

describe("answering", () => {
  it("with no model: the question, then one honest line, and no call to the model", async () => {
    mockInvoke.mockClear();
    await answerAsk("why?", t, () => "ctx");
    expect(getAskState().turns.map((x) => [x.kind, x.text])).toEqual([
      ["user", "why?"],
      ["app", t("help.ui.reply.local")],
    ]);
    expect(mockInvoke.mock.calls.some(([cmd]) => cmd === "coach_generate")).toBe(false);
  });

  it("a model still loading says so", async () => {
    snapshot.state = "loading";
    await answerAsk("why?", t, () => "ctx");
    expect(getAskState().turns.at(-1)).toMatchObject({ kind: "app", text: t("ask.reply.gettingReady") });
  });

  it("with a model ready: the chat kind, the context and the conversation, and the answer", async () => {
    snapshot.state = "ready";
    let prompt = "";
    setInvokeResponse("coach_generate", (args) => {
      prompt = (args as { kind: string; context: string }).context;
      expect((args as { kind: string }).kind).toBe("chat");
      return "  Same tempo until it holds.  ";
    });
    await answerAsk("why 90?", t, () => "screen session; exercise: A tune");
    expect(prompt).toContain("screen session; exercise: A tune");
    expect(prompt).toContain("User asks: why 90?");
    const turns = getAskState().turns;
    expect(turns.at(-1)).toMatchObject({ kind: "coach", text: "Same tempo until it holds." });
  });

  it("an empty answer is said to be one", async () => {
    snapshot.state = "ready";
    setInvokeResponse("coach_generate", () => "   ");
    await answerAsk("why?", t, () => "ctx");
    expect(getAskState().turns.at(-1)).toMatchObject({ kind: "app", text: t("ask.reply.nothing") });
  });

  it("a model's answer is labelled general advice", async () => {
    snapshot.state = "ready";
    setInvokeResponse("coach_generate", () => "Keep the wrist loose.");
    await answerAsk("how?", t, () => "ctx");
    openAsk();
    render(<AskPanel lookingAt={null} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Keep the wrist loose.")).toBeInTheDocument());
    expect(screen.getByText(t("coachBlocks.source.general"))).toBeInTheDocument();
  });
});

describe("the drawer in a Session", () => {
  type P = Parameters<typeof useAskSessionRules>[0];
  const base: P = {
    inSession: true,
    takeRunning: false,
    timedRunning: false,
    pauseTimed: () => {},
    sounding: false,
    open: false,
    deferred: false,
  };
  const rules = (initial: P) => renderHook((p: P) => useAskSessionRules(p), { initialProps: initial });

  it("a Take starting closes it", () => {
    openAsk();
    const { rerender } = rules({ ...base, open: true });
    rerender({ ...base, open: true, takeRunning: true });
    expect(getAskState().open).toBe(false);
  });

  it("the Ask key during a Take opens it on the result", () => {
    const { rerender } = rules({ ...base, takeRunning: true });
    openAsk();
    expect(getAskState()).toMatchObject({ open: false, deferred: true });
    rerender({ ...base, takeRunning: true, deferred: true });
    expect(getAskState().open).toBe(false);
    rerender({ ...base, takeRunning: false, deferred: true });
    expect(getAskState().open).toBe(true);
  });

  it("opened over a running timed step, the step pauses; an Exercise's clock does not", () => {
    const pauseTimed = vi.fn();
    const { rerender } = rules({ ...base, timedRunning: true, pauseTimed });
    rerender({ ...base, timedRunning: true, pauseTimed, open: true });
    expect(pauseTimed).toHaveBeenCalledTimes(1);
    const other = vi.fn();
    const second = rules({ ...base, pauseTimed: other });
    second.rerender({ ...base, pauseTimed: other, open: true });
    expect(other).not.toHaveBeenCalled();
  });

  it("anything starting to sound closes it", () => {
    openAsk();
    const { rerender } = rules({ ...base, open: true });
    rerender({ ...base, open: true, sounding: true });
    expect(getAskState().open).toBe(false);
  });

  it("an answer in flight when a Take starts commits nothing during the Take, and lands after it", async () => {
    snapshot.state = "ready";
    let reply!: (text: string) => void;
    setInvokeResponse("coach_generate", () => new Promise<string>((resolve) => (reply = resolve)));
    const { rerender } = rules({ ...base });
    const answered = answerAsk("why 90?", t, () => "ctx");
    await waitFor(() => expect(reply).toBeTypeOf("function"));
    rerender({ ...base, takeRunning: true });
    const changes = vi.fn();
    const off = subscribeAsk(changes);
    await act(async () => {
      reply("Same tempo until it holds.");
      await answered;
    });
    expect(changes).not.toHaveBeenCalled();
    expect(getAskState().turns.at(-1)).toMatchObject({ kind: "coach", pending: true });
    rerender({ ...base, takeRunning: false });
    expect(getAskState().turns.at(-1)).toMatchObject({ kind: "coach", text: "Same tempo until it holds." });
    off();
  });
});
