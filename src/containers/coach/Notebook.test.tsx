/**
 * The Notebook, Ask's second tab (leg c4a2): the tab strip, the two lists,
 * every state of each (loading, could not read, too few Takes, nothing noticed
 * yet), Leave out and its Undo, the goal question and its "Not now", and the
 * goal set through `set_goal`. Nothing is written without a press.
 */
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PathTakeRow } from "../../ipc";

/** The settings store, in memory; a read can be held (`hold`) or fail (`fail`). */
const store = vi.hoisted(() => ({
  disk: new Map<string, unknown>(),
  saves: [] as Array<[string, unknown]>,
  fail: new Set<string>(),
  hold: false,
  waiting: [] as Array<() => void>,
  /** Keys whose save fails. */
  failSave: new Set<string>(),
  /** The store answers a press "notRead", as for a key it could not read. */
  refuse: false,
}));

vi.mock("../../coach/store", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../coach/store")>();
  return {
    ...real,
    saveSuppressed: (id: string, now: number) => (store.refuse ? "notRead" : real.saveSuppressed(id, now)),
    saveCardDismissed: (kind: string, now: number) => (store.refuse ? "notRead" : real.saveCardDismissed(kind, now)),
  };
});

vi.mock("../../ipc", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../ipc")>();
  const read = async (key: string) => {
    if (store.fail.has(key)) throw new Error("unreadable");
    return store.disk.get(key);
  };
  return {
    ...real,
    storeLoad: vi.fn((key: string) => {
      if (!store.hold) return read(key);
      return new Promise((resolve, reject) => store.waiting.push(() => read(key).then(resolve, reject)));
    }),
    storeSave: vi.fn(async (key: string, value: unknown) => {
      if (store.failSave.has(key)) throw new Error("unwritable");
      store.saves.push([key, value]);
      store.disk.set(key, value);
    }),
  };
});

import i18n from "../../i18n";
import { coachGoalKnown, coachStored, loadCoachStored, resetCoachStored, saveGoal } from "../../coach/store";
import { fakeHost, toolCtx } from "../../coach/tools/fakeHost";
import { __resetCoachLoaderForTests } from "../../hooks/coachLoader";
import { AskPanel } from "./AskPanel";
import { __resetAskStoreForTests, getAskState, openAsk, registerNotebookSource, setAskTab } from "./askStore";
import { __setAskToolsForTests } from "./askTools";
import { LEAVE_OUT_UNDO_MS, Notebook } from "./Notebook";

const t = i18n.t.bind(i18n);
const DAY = 86_400_000;
const HOUR = 3_600_000;

let n = 0;
function even(exerciseId: string, bpm: number, evenness: number, ago: number): PathTakeRow {
  n += 1;
  return {
    id: `t${n}`,
    pathId: "fx",
    stepId: "s1",
    exerciseId,
    startedAt: Date.now() - ago,
    bpm,
    bars: 8,
    caught: true,
    passed: false,
    facts: { measures: { evenness } },
  };
}

/** Two Exercises, twice at 100 and twice at 90: one noticed line (tendencies.test's fixture). */
function tempoHistory(extraAgo = 0): PathTakeRow[] {
  return [
    even("a", 100, 0.74, 1 * DAY + extraAgo),
    even("a", 100, 0.72, 2 * DAY + extraAgo),
    even("a", 90, 0.86, 3 * DAY + extraAgo),
    even("a", 90, 0.84, 4 * DAY + extraAgo),
    even("b", 100, 0.76, 1 * DAY + HOUR + extraAgo),
    even("b", 100, 0.74, 2 * DAY + HOUR + extraAgo),
    even("b", 90, 0.85, 5 * DAY + extraAgo),
    even("b", 90, 0.87, 6 * DAY + extraAgo),
  ];
}

/** Seven Takes whose last bar sat late: a second noticed line (`lean:last:late`). */
function leanHistory(): PathTakeRow[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => {
    n += 1;
    return {
      id: `t${n}`,
      pathId: "fx",
      stepId: "s1",
      exerciseId: "l",
      startedAt: Date.now() - (i * DAY + 3 * HOUR),
      bpm: 100,
      bars: 8,
      caught: true,
      passed: false,
      facts: { lean: [0, 2, -3, 25] },
    };
  });
}
const LEAN_ID = "lean:last:late";

function source(rows: PathTakeRow[], sessionStartedAt: number | null = null) {
  registerNotebookSource(() => ({ rows, paths: [], sessionStartedAt }));
}

const LINE_ID = "tempoEvenness:100:90";

async function loaded() {
  await act(async () => {
    await loadCoachStored();
  });
}

beforeEach(() => {
  store.disk.clear();
  store.saves.length = 0;
  store.fail.clear();
  store.hold = false;
  store.waiting.length = 0;
  store.failSave.clear();
  store.refuse = false;
  resetCoachStored();
  __resetAskStoreForTests();
  __resetCoachLoaderForTests();
  // The runner's host for set_goal: the real store behind it, as useCoachToolHost has it.
  __setAskToolsForTests(
    fakeHost(
      {},
      {
        goal: () => (coachGoalKnown() ? (coachStored().goal?.text ?? null) : "notWiredYet"),
        // As the real host (useCoachToolHost): a goal the store does not keep throws (review c4a2 L7).
        setGoal: (text: string) => {
          if (!coachGoalKnown()) return "notWiredYet";
          if (!saveGoal(text, Date.now())) throw new Error("not a goal the store keeps");
          return "done";
        },
      },
    ),
    toolCtx(),
  );
});
afterEach(() => {
  __setAskToolsForTests(null, null);
  __resetAskStoreForTests();
  vi.useRealTimers();
});

describe("the tab strip", () => {
  it("\"Ask | Notebook\" in the head; Ask first; the Notebook has its own footer line", async () => {
    source(tempoHistory());
    openAsk();
    render(<AskPanel lookingAt={{ text: "Today", key: "today" }} onClose={() => {}} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((b) => b.textContent)).toEqual([t("notebook.ui.tabAsk"), t("notebook.ui.tabNotebook")]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByTestId("notebook")).toBeNull();

    fireEvent.click(tabs[1]);
    await loaded();
    expect(screen.getByTestId("notebook")).toBeInTheDocument();
    expect(screen.queryByTestId("ask-input")).toBeNull();
    expect(screen.queryByTestId("ask-context")).toBeNull();
    expect(screen.getByText(t("notebook.ui.footer"))).toBeInTheDocument();
  });

  // c4a2b, L4.
  it("a question typed and not sent is still there after a visit to the Notebook", async () => {
    source(tempoHistory());
    openAsk();
    render(<AskPanel lookingAt={{ text: "Today", key: "today" }} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("ask-input"), { target: { value: "how is my timing" } });
    fireEvent.click(screen.getByTestId("ask-tab-notebook"));
    await loaded();
    expect(screen.queryByTestId("ask-input")).toBeNull();
    fireEvent.click(screen.getByTestId("ask-tab-ask"));
    expect(screen.getByTestId("ask-input")).toHaveValue("how is my timing");
    expect(store.saves).toEqual([]);
  });

  it("arrow keys move between the tabs; a question always opens on Ask", () => {
    openAsk({ tab: "notebook" });
    render(<AskPanel lookingAt={null} onClose={() => {}} />);
    expect(getAskState().tab).toBe("notebook");
    fireEvent.keyDown(screen.getByTestId("ask-tab-notebook"), { key: "ArrowLeft" });
    expect(getAskState().tab).toBe("ask");
    act(() => setAskTab("notebook"));
    act(() => openAsk({ question: "how am I doing?" }));
    expect(getAskState().tab).toBe("ask");
  });

  it("opening the tab writes nothing", async () => {
    source(tempoHistory(3 * DAY));
    render(<Notebook />);
    await loaded();
    expect(screen.getByTestId("nb-noticed")).toBeInTheDocument();
    expect(store.saves).toEqual([]);
  });
});

describe("what I've noticed", () => {
  it("each line with its evidence line, the dates in the locale's format", async () => {
    source(tempoHistory());
    render(<Notebook />);
    await loaded();
    const item = screen.getByTestId("nb-noticed").querySelector(`[data-line="${LINE_ID}"]`)!;
    expect(item).toHaveTextContent(t("notebook.noticed.tempoEvenness", { fast: 100, slow: 90, fastScore: 74, slowScore: 86 }));
    const day = (ago: number) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(Date.now() - ago));
    expect(item.querySelector(".nb-evidence")).toHaveTextContent(
      t("notebook.evidence.exercises", { count: 8, exercises: 2, from: day(6 * DAY), to: day(DAY) }),
    );
    expect(screen.getByTestId("nb-leave-out")).toHaveAccessibleName(t("notebook.ui.leaveOut"));
  });

  it("Leave out stores a suppression (nothing deleted), says so, and its Undo brings the line back", async () => {
    const rows = tempoHistory();
    source(rows);
    render(<Notebook />);
    await loaded();
    fireEvent.click(screen.getByTestId("nb-leave-out"));
    // The line's own row says so, in its place; the line itself is gone.
    expect(screen.queryByTestId("nb-leave-out")).toBeNull();
    expect(screen.getByTestId("nb-left-out")).toHaveTextContent(t("notebook.ui.leftOut"));
    expect(screen.getByTestId("nb-left-out")).toHaveAttribute("data-line", LINE_ID);
    expect(store.saves).toHaveLength(1);
    expect(store.saves[0][0]).toBe("coach.suppressed");
    expect(Object.keys(store.saves[0][1] as object)).toEqual([LINE_ID]);
    expect(rows).toHaveLength(8);

    fireEvent.click(screen.getByTestId("nb-undo"));
    expect(screen.getByTestId("nb-leave-out")).toBeInTheDocument();
    expect(screen.queryByTestId("nb-left-out")).toBeNull();
    expect(store.saves).toHaveLength(2);
    expect(store.saves[1]).toEqual(["coach.suppressed", {}]);
  });

  it("Leave out is the words, not a bin icon: nothing is deleted", async () => {
    source(tempoHistory());
    render(<Notebook />);
    await loaded();
    const button = screen.getByTestId("nb-leave-out");
    expect(button).toHaveTextContent(t("notebook.ui.leaveOut"));
    expect(button.querySelector("svg")).toBeNull();
  });

  it("the Undo is offered for a few seconds, then goes; the line stays left out, and expiry writes nothing", async () => {
    source(tempoHistory());
    render(<Notebook />);
    await loaded();
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("nb-leave-out"));
    expect(screen.getByTestId("nb-undo")).toBeInTheDocument();
    expect(store.saves).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(LEAVE_OUT_UNDO_MS + 50);
    });
    expect(screen.queryByTestId("nb-undo")).toBeNull();
    expect(screen.queryByTestId("nb-noticed")).toBeNull();
    expect(store.saves).toHaveLength(1);
  });

  // c4a2b, L1: main.tsx renders under StrictMode, which runs every effect's cleanup once.
  it("under StrictMode the Undo still expires, and a failed save is still said", async () => {
    source(tempoHistory());
    store.failSave.add("coach.suppressed");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <StrictMode>
          <Notebook />
        </StrictMode>,
      );
      await loaded();
      vi.useFakeTimers({ shouldAdvanceTime: true });
      await act(async () => {
        fireEvent.click(screen.getByTestId("nb-leave-out"));
      });
      await waitFor(() => expect(screen.getByTestId("nb-said-notSaved")).toHaveTextContent(t("notebook.ui.notSaved")));
      act(() => {
        vi.advanceTimersByTime(LEAVE_OUT_UNDO_MS + 50);
      });
      expect(screen.queryByTestId("nb-undo")).toBeNull();
      // Its row has gone: the sentence stays, after the list.
      expect(screen.getByTestId("nb-said-notSaved")).toBeInTheDocument();
    } finally {
      quiet.mockRestore();
    }
  });

  // c4a2b, L5: two lines, each its own Undo, each in its own place.
  it("a second Leave out keeps the first line's Undo, and each Undo sits where its line was", async () => {
    source([...tempoHistory(), ...leanHistory()]);
    render(<Notebook />);
    await loaded();
    const lines = () => [...screen.getByTestId("nb-noticed").querySelectorAll("li")].map((li) => li.getAttribute("data-line"));
    const before = lines();
    expect(before).toEqual([LINE_ID, LEAN_ID]);
    fireEvent.click(screen.getAllByTestId("nb-leave-out")[0]);
    fireEvent.click(screen.getAllByTestId("nb-leave-out")[0]);
    expect(screen.getAllByTestId("nb-undo")).toHaveLength(2);
    expect(lines()).toEqual(before);
    // The first line's Undo still works, and brings it back where it was.
    fireEvent.click(screen.getAllByTestId("nb-undo")[0]);
    expect(lines()).toEqual(before);
    expect(screen.getByTestId("nb-noticed").querySelector(`[data-line="${LINE_ID}"] [data-testid="nb-leave-out"]`)).not.toBeNull();
    expect(screen.getAllByTestId("nb-undo")).toHaveLength(1);
    expect(Object.keys(store.disk.get("coach.suppressed") as object)).toEqual([LEAN_ID]);
  });

  // c4a2b, L2: Undo's save is followed too.
  it("an Undo whose save does not land says so under the line", async () => {
    source(tempoHistory());
    render(<Notebook />);
    await loaded();
    fireEvent.click(screen.getByTestId("nb-leave-out"));
    store.failSave.add("coach.suppressed");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await act(async () => {
        fireEvent.click(screen.getByTestId("nb-undo"));
      });
      const said = await screen.findByTestId("nb-said-notSaved");
      expect(said).toHaveTextContent(t("notebook.ui.notSaved"));
      expect(said.closest("li")).toHaveAttribute("data-line", LINE_ID);
    } finally {
      quiet.mockRestore();
    }
  });

  it("a Leave out on a list that could not be read says it was not left out (notRead, on screen)", async () => {
    source(tempoHistory());
    render(<Notebook />);
    await loaded();
    // The list showed; then the store refuses the press as unread (the screen cannot reach that
    // state by itself: an unread list shows no line): the press says so and changes nothing.
    store.refuse = true;
    fireEvent.click(screen.getByTestId("nb-leave-out"));
    expect(screen.getByTestId("nb-said-notRead")).toHaveTextContent(t("notebook.ui.leftOutNotRead"));
    expect(screen.getByTestId("nb-leave-out")).toBeInTheDocument();
    expect(screen.queryByTestId("nb-undo")).toBeNull();
    expect(store.saves).toEqual([]);
  });

  it("fewer than five Takes: the first empty state, with the count so far", async () => {
    source(tempoHistory().slice(0, 3));
    render(<Notebook />);
    await loaded();
    expect(screen.getByTestId("nb-too-few")).toHaveTextContent(t("notebook.ui.tooFewTakes", { count: 3 }));
  });

  it("five Takes or more with nothing noticed: the second empty state", async () => {
    source([0, 1, 2, 3, 4, 5].map((i) => even("a", 100, 0.8, (i + 1) * DAY)));
    render(<Notebook />);
    await loaded();
    expect(screen.getByTestId("nb-nothing-yet")).toHaveTextContent(t("notebook.ui.nothingYet", { count: 6 }));
  });

  it("while the keys are being read: a moment, and no line", async () => {
    store.hold = true;
    source(tempoHistory(3 * DAY));
    render(<Notebook />);
    expect(screen.getByTestId("nb-noticed-loading")).toHaveTextContent(t("notebook.ui.loading"));
    expect(screen.getByTestId("nb-goal-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("nb-noticed")).toBeNull();
    store.hold = false;
    await act(async () => {
      for (const go of store.waiting.splice(0)) go();
      await loadCoachStored();
    });
    expect(screen.getByTestId("nb-noticed")).toBeInTheDocument();
  });

  it("the list of left-out lines could not be read: it says so and shows no line", async () => {
    store.fail.add("coach.suppressed");
    source(tempoHistory());
    render(<Notebook />);
    await loaded();
    expect(screen.getByTestId("nb-noticed-unreadable")).toHaveTextContent(t("notebook.ui.noticedUnreadable"));
    expect(screen.queryByTestId("nb-noticed")).toBeNull();
  });

  it("in a Session: only what was stored before it began", async () => {
    // The Session began five days ago: two of the eight Takes were stored before it.
    source(tempoHistory(), Date.now() - 5 * DAY + 1);
    render(<Notebook />);
    await loaded();
    expect(screen.getByTestId("nb-session-note")).toHaveTextContent(t("notebook.ui.sessionNote"));
    expect(screen.queryByTestId("nb-noticed")).toBeNull();
    expect(screen.getByTestId("nb-too-few")).toHaveTextContent(t("notebook.ui.tooFewTakes", { count: 2 }));
  });
});

describe("what you're working toward", () => {
  it("the goal, with \"You said\" and its date, and Edit", async () => {
    const at = Date.now() - 8 * DAY;
    store.disk.set("coach.goal", { text: "A clean pentatonic solo at 120", at });
    source(tempoHistory());
    render(<Notebook />);
    await loaded();
    const goal = screen.getByTestId("nb-goal");
    expect(goal).toHaveTextContent("A clean pentatonic solo at 120");
    const date = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(at));
    expect(goal).toHaveTextContent(t("notebook.ui.goalSaid", { date }));
    expect(screen.getByTestId("nb-goal-edit-button")).toHaveTextContent(t("notebook.ui.goalEdit"));
    expect(screen.queryByTestId("nb-goal-offer")).toBeNull();
  });

  it("asked once the first Take is a week old: the question, its starters and Not now", async () => {
    source(tempoHistory(3 * DAY));
    render(<Notebook />);
    await loaded();
    const offer = screen.getByTestId("nb-goal-offer");
    expect(offer).toHaveTextContent(t("notebook.ui.goalQuestion"));
    expect(offer.querySelectorAll("[data-starter]")).toHaveLength(4);
    expect(store.saves).toEqual([]);
  });

  it("not asked in the first week: no goal yet, and Add a goal on a press", async () => {
    source(tempoHistory());
    render(<Notebook />);
    await loaded();
    expect(screen.queryByTestId("nb-goal-offer")).toBeNull();
    expect(screen.getByTestId("nb-goal-none")).toHaveTextContent(t("notebook.ui.goalNone"));
    fireEvent.click(screen.getByTestId("nb-goal-add"));
    expect(screen.getByTestId("nb-goal-edit")).toBeInTheDocument();
  });

  it("never asked in a Session", async () => {
    const rows = tempoHistory(3 * DAY);
    source(rows, Date.now() - HOUR);
    render(<Notebook />);
    await loaded();
    expect(screen.queryByTestId("nb-goal-offer")).toBeNull();
  });

  it("Not now counts a dismissal in coach.cards and says when it may come back", async () => {
    source(tempoHistory(3 * DAY));
    render(<Notebook />);
    await loaded();
    fireEvent.click(screen.getByTestId("nb-goal-not-now"));
    expect(screen.queryByTestId("nb-goal-offer")).toBeNull();
    expect(screen.getByTestId("nb-not-now-done")).toHaveTextContent(t("notebook.ui.notNowDone"));
    expect(store.saves).toHaveLength(1);
    expect(store.saves[0][0]).toBe("coach.cards");
    expect((store.saves[0][1] as Record<string, { dismissed: number }>).goal.dismissed).toBe(1);
  });

  // c4a2b, L7: Not now's two failure sentences, on screen.
  it("Not now whose save does not land says it holds until Yames closes", async () => {
    source(tempoHistory(3 * DAY));
    render(
      <StrictMode>
        <Notebook />
      </StrictMode>,
    );
    await loaded();
    store.failSave.add("coach.cards");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await act(async () => {
        fireEvent.click(screen.getByTestId("nb-goal-not-now"));
      });
      expect(await screen.findByTestId("nb-not-now-notSaved")).toHaveTextContent(t("notebook.ui.notSaved"));
    } finally {
      quiet.mockRestore();
    }
  });

  it("Not now refused by the store (notRead) says it was not saved, and writes nothing", async () => {
    source(tempoHistory(3 * DAY));
    render(<Notebook />);
    await loaded();
    store.refuse = true;
    fireEvent.click(screen.getByTestId("nb-goal-not-now"));
    expect(screen.getByTestId("nb-not-now-notRead")).toHaveTextContent(t("notebook.ui.notNowNotRead"));
    expect(store.saves).toEqual([]);
  });

  // c4a2b, L2: the receipt never stands alone over a goal that is not on disk.
  it("a goal whose save does not land: the receipt is followed by \"not saved\"", async () => {
    source(tempoHistory());
    render(<Notebook />);
    await loaded();
    fireEvent.click(screen.getByTestId("nb-goal-add"));
    fireEvent.change(screen.getByTestId("nb-goal-input"), { target: { value: "Blues in A at 100" } });
    store.failSave.add("coach.goal");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await act(async () => {
        fireEvent.click(screen.getByTestId("nb-goal-save"));
      });
      expect(await screen.findByTestId("nb-goal-not-saved")).toHaveTextContent(t("notebook.ui.notSaved"));
      expect(screen.getByTestId("nb-goal-receipt")).toContainElement(screen.getByTestId("nb-goal-not-saved"));
    } finally {
      quiet.mockRestore();
    }
  });

  it("a goal that is saved says nothing more than the receipt", async () => {
    source(tempoHistory());
    render(<Notebook />);
    await loaded();
    fireEvent.click(screen.getByTestId("nb-goal-add"));
    fireEvent.change(screen.getByTestId("nb-goal-input"), { target: { value: "Blues in A at 100" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("nb-goal-save"));
    });
    expect(screen.getByTestId("nb-goal-receipt")).toBeInTheDocument();
    expect(screen.queryByTestId("nb-goal-not-saved")).toBeNull();
  });

  it("coach.cards could not be read: the question is not asked, and nothing is written", async () => {
    store.fail.add("coach.cards");
    source(tempoHistory(3 * DAY));
    render(<Notebook />);
    await loaded();
    // Unreadable cards: the question is not asked at all (6.6 fails closed).
    expect(screen.queryByTestId("nb-goal-offer")).toBeNull();
    expect(store.saves).toEqual([]);
  });

  it("Save sets the goal through set_goal in one press: the runner's receipt and Undo", async () => {
    source(tempoHistory(3 * DAY));
    render(<Notebook />);
    await loaded();
    fireEvent.click(screen.getByText(t("notebook.ui.goalChoice.justPlaying")));
    expect(screen.getByTestId("nb-goal-input")).toHaveValue(t("notebook.ui.goalStarter.justPlaying"));
    fireEvent.change(screen.getByTestId("nb-goal-input"), { target: { value: "Blues in A at 100" } });
    fireEvent.click(screen.getByTestId("nb-goal-save"));
    expect(store.saves.map(([k]) => k)).toEqual(["coach.goal"]);
    expect((store.disk.get("coach.goal") as { text: string }).text).toBe("Blues in A at 100");
    expect(screen.getByTestId("nb-goal")).toHaveTextContent("Blues in A at 100");
    expect(screen.getByTestId("nb-goal-receipt")).toBeInTheDocument();
    // The receipt is the runner's, in Ask's thread too.
    expect(getAskState().turns.some((x) => x.kind === "tool" && x.body.kind === "receipt")).toBe(true);
  });

  it("a goal that could not be read: not shown, not asked, not editable", async () => {
    store.fail.add("coach.goal");
    source(tempoHistory(3 * DAY));
    render(<Notebook />);
    await loaded();
    expect(screen.getByTestId("nb-goal-unreadable")).toHaveTextContent(t("notebook.ui.goalUnreadable"));
    expect(screen.queryByTestId("nb-goal-offer")).toBeNull();
    expect(screen.queryByTestId("nb-goal-add")).toBeNull();
  });
});

describe("built once, at the tab's open", () => {
  it("reads the Takes once, not on every render", async () => {
    const rows = tempoHistory();
    const read = vi.fn(() => ({ rows, paths: [], sessionStartedAt: null }));
    registerNotebookSource(read);
    const { rerender } = render(<Notebook />);
    await loaded();
    rerender(<Notebook />);
    rerender(<Notebook />);
    expect(read).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("nb-noticed")).toBeInTheDocument());
  });
});
