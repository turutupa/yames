/**
 * `make_exercise` in Ask's thread (leg t2c, mock 17): the preview, then the
 * proposal saying what is graded before the press; a variant chip replaces
 * the proposal (the old one retired through the runner); the press stores
 * through the host and the receipt names it, with Undo and "Open Paths"
 * (leg t2cb); a store that did not keep it retires the Undo.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { fakeHost, toolCtx } from "../../coach/tools/fakeHost";
import { loadExerciseGenerator } from "../../coach/tools/make";
import type { MyExerciseAdd } from "../../coach/tools/host";
import i18n from "../../i18n";
import { __resetAskStoreForTests, getAskState, useAskState } from "./askStore";
import { __setAskToolsForTests, noteAskToolView, runAskCall } from "./askTools";
import { AskToolTurn } from "./AskToolTurn";

function Thread() {
  const { turns } = useAskState();
  return (
    <div>
      {turns.map((turn) => (turn.kind === "tool" ? <AskToolTurn key={turn.id} id={turn.id} body={turn.body} /> : <p key={turn.id}>{turn.kind === "user" ? turn.text : ""}</p>))}
    </div>
  );
}

function hostWith(add: MyExerciseAdd) {
  const added: number[] = [];
  const undone: number[] = [];
  const host = fakeHost(
    { view: "today" },
    {
      addMyExercise: (_recipe, at) => {
        added.push(at);
        return Promise.resolve(add);
      },
      undoAddedExercise: (_key, at) => {
        undone.push(at);
        return Promise.resolve("undone");
      },
    },
  );
  __setAskToolsForTests(host, toolCtx());
  return { host, added, undone };
}

const MOCK_17 = { tool: "make_exercise", args: { root: "A", scale: "minorPentatonic", position: 5 } };

beforeAll(async () => {
  await loadExerciseGenerator();
});
beforeEach(() => {
  __resetAskStoreForTests();
  void i18n.changeLanguage("en");
});
afterEach(() => {
  __setAskToolsForTests(null, null);
  __resetAskStoreForTests();
});

describe("make_exercise in Ask", () => {
  it("draws mock 17: the line, the neck with the first note, the source, the proposal and what is graded, the chips", () => {
    const { added } = hostWith("added");
    render(<Thread />);
    act(() => void runAskCall(MOCK_17, "a minor pentatonic eighths 5th fret"));
    expect(screen.getByTestId("ask-make-line")).toHaveTextContent("A minor pentatonic, the box at fret 5: up and back down. 3 bars.");
    expect(screen.getByTestId("ask-make-neck").querySelector("[data-first='true']")).not.toBeNull();
    expect(screen.getByTestId("ask-make-first")).toHaveTextContent("Starts on A: string 6, fret 5.");
    expect(screen.getByTestId("ask-make-preview")).toHaveTextContent("Worked out by the app");
    expect(screen.getByTestId("ask-proposal")).toHaveTextContent("Add it to My exercises");
    expect(screen.getByTestId("ask-make-graded")).toHaveTextContent("Starts at 60 BPM. Timing and notes heard can be graded; the rest is yours.");
    expect(screen.getByTestId("ask-proposal-go")).toHaveTextContent("Add it");
    expect(screen.getByTestId("ask-make-variants")).toHaveTextContent("Sixteenths instead");
    expect(screen.getByTestId("ask-make-variants")).toHaveTextContent("Next position");
    expect(added).toEqual([]);
  });

  it("a variant chip proposes again and retires the open proposal", () => {
    hostWith("added");
    render(<Thread />);
    act(() => void runAskCall(MOCK_17, ""));
    act(() => fireEvent.click(screen.getByText("Sixteenths instead")));
    const proposals = getAskState().turns.filter((t) => t.kind === "tool" && t.body.kind === "proposal");
    expect(proposals.map((t) => (t.kind === "tool" && t.body.kind === "proposal" ? t.body.state : null))).toEqual(["expired", "open"]);
    expect(screen.getAllByTestId("ask-make-line")[1]).toHaveTextContent("A minor pentatonic, the box at fret 5: up and back down. 2 bars.");
  });

  it("the press: the receipt names what it added, then offers Undo and Open Paths; Undo takes out that entry", async () => {
    const { added, undone } = hostWith("added");
    render(<Thread />);
    act(() => void runAskCall(MOCK_17, ""));
    act(() => fireEvent.click(screen.getByTestId("ask-proposal-go")));
    expect(added).toHaveLength(1);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("ask-receipt")).toHaveTextContent("Added A minor pentatonic, the box at fret 5 to My exercises.");
    expect(screen.getByTestId("ask-receipt-next")).toHaveTextContent("Open Paths");
    act(() => fireEvent.click(screen.getByTestId("ask-undo")));
    expect(undone).toEqual(added);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("ask-undone")).toHaveTextContent("Undone. Taken back out of My exercises.");
  });

  it("no Undo before the store kept the add, and no 'Undone.' before the store took it out (review t2c, 4)", async () => {
    let keep: (answer: MyExerciseAdd) => void = () => {};
    let takeOut: (answer: "undone") => void = () => {};
    const host = fakeHost(
      { view: "today" },
      {
        addMyExercise: () => new Promise<MyExerciseAdd>((resolve) => (keep = resolve)),
        undoAddedExercise: () => new Promise<"undone">((resolve) => (takeOut = resolve)),
      },
    );
    __setAskToolsForTests(host, toolCtx());
    render(<Thread />);
    act(() => void runAskCall(MOCK_17, ""));
    act(() => fireEvent.click(screen.getByTestId("ask-proposal-go")));
    // "Adding…": nothing to undo yet.
    expect(screen.queryByTestId("ask-undo")).toBeNull();
    await act(async () => {
      keep("added");
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    act(() => fireEvent.click(screen.getByTestId("ask-undo")));
    // Asked, not answered: it says it is at it, never "Undone.".
    expect(screen.queryByTestId("ask-undone")).toBeNull();
    expect(screen.getByTestId("ask-undo-note")).toHaveTextContent("Taking it back out of My exercises…");
    expect(screen.queryByText(/Undone\./)).toBeNull();
    await act(async () => {
      takeOut("undone");
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    expect(screen.getByTestId("ask-undone")).toHaveTextContent("Undone. Taken back out of My exercises.");
  });

  it("Open Paths goes to Paths; the receipt says the Undo stayed behind and what does its job there (review t2c, 3)", async () => {
    const { host, undone } = hostWith("added");
    render(<Thread />);
    act(() => void runAskCall(MOCK_17, ""));
    act(() => fireEvent.click(screen.getByTestId("ask-proposal-go")));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => fireEvent.click(screen.getByText("Open Paths")));
    expect(host.where().view).toBe("paths");
    // The app's own view change, as `useAskHost` reports it.
    act(() => noteAskToolView("paths", null));
    const receipt = screen.getAllByTestId("ask-receipt")[0];
    expect(receipt.querySelector("[data-testid='ask-undo']")).toBeNull();
    expect(receipt).toHaveTextContent("The Undo stayed on the screen this was added on. To take it out, use Remove on My exercises in Paths.");
    expect(undone).toEqual([]);
  });

  it("a full list: the receipt says so, and offers no Undo", async () => {
    hostWith("full");
    render(<Thread />);
    act(() => void runAskCall(MOCK_17, ""));
    act(() => fireEvent.click(screen.getByTestId("ask-proposal-go")));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("ask-receipt")).toHaveTextContent("My exercises is full (50), so this one wasn't added.");
    expect(screen.queryByTestId("ask-undo")).toBeNull();
    expect(screen.queryByTestId("ask-receipt-next")).toBeNull();
  });
});
