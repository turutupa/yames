/**
 * The Notebook, Ask's second tab (leg c4a2): the tab strip, the two lists,
 * every state of each (loading, could not read, too few Takes, nothing noticed
 * yet), Leave out and its Undo, the goal question and its "Not now", and the
 * goal set through `set_goal`. Nothing is written without a press.
 */
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
}));

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
  resetCoachStored();
  __resetAskStoreForTests();
  __resetCoachLoaderForTests();
  // The runner's host for set_goal: the real store behind it, as useCoachToolHost has it.
  __setAskToolsForTests(
    fakeHost(
      {},
      {
        goal: () => (coachGoalKnown() ? (coachStored().goal?.text ?? null) : "notWiredYet"),
        setGoal: (text: string) => {
          if (!coachGoalKnown()) return "notWiredYet";
          saveGoal(text, Date.now());
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
    expect(screen.queryByTestId("nb-noticed")).toBeNull();
    expect(screen.getByTestId("nb-left-out")).toHaveTextContent(t("notebook.ui.leftOut"));
    expect(store.saves).toHaveLength(1);
    expect(store.saves[0][0]).toBe("coach.suppressed");
    expect(Object.keys(store.saves[0][1] as object)).toEqual([LINE_ID]);
    expect(rows).toHaveLength(8);

    fireEvent.click(screen.getByTestId("nb-undo"));
    expect(screen.getByTestId("nb-noticed")).toBeInTheDocument();
    expect(screen.queryByTestId("nb-left-out")).toBeNull();
    expect(store.saves).toHaveLength(2);
    expect(store.saves[1]).toEqual(["coach.suppressed", {}]);
  });

  it("the Undo is offered for a few seconds, then goes; the line stays left out", async () => {
    source(tempoHistory());
    render(<Notebook />);
    await loaded();
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("nb-leave-out"));
    expect(screen.getByTestId("nb-undo")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(LEAVE_OUT_UNDO_MS + 50);
    });
    expect(screen.queryByTestId("nb-undo")).toBeNull();
    expect(screen.queryByTestId("nb-noticed")).toBeNull();
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
