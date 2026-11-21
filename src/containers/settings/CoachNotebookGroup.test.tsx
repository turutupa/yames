/**
 * Settings → Coach → Notebook (leg c6a, judgement call 27): the lines left out
 * with their day and Bring back (one press, an Undo that leaves the line out
 * again on its own day), the empty state, the thirty-day sentence, and the
 * goal with its Edit. Nothing is deleted; nothing is written without a press.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { PathTakeRow } from "../../ipc";

const store = vi.hoisted(() => ({
  disk: new Map<string, unknown>(),
  saves: [] as Array<[string, unknown]>,
}));

vi.mock("../../ipc", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../ipc")>();
  return {
    ...real,
    storeLoad: vi.fn(async (key: string) => store.disk.get(key)),
    storeSave: vi.fn(async (key: string, value: unknown) => {
      store.saves.push([key, value]);
      store.disk.set(key, value);
    }),
  };
});

import i18n from "../../i18n";
import { coachStored, loadCoachStored, resetCoachStored } from "../../coach/store";
import { __resetAskStoreForTests, registerNotebookSource } from "../coach/askStore";
import { LEAVE_OUT_UNDO_MS } from "../coach/Notebook";
import { CoachNotebookGroup } from "./CoachNotebookGroup";

const t = i18n.t.bind(i18n);
const DAY = 86_400_000;
const HOUR = 3_600_000;
const LEAN_ID = "lean:last:late";

let n = 0;
/** Seven Takes whose last bar sat late: one noticed line (`lean:last:late`), as Notebook.test has it. */
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

async function mount() {
  render(<CoachNotebookGroup />);
  await act(async () => {
    await loadCoachStored();
  });
}

beforeEach(() => {
  store.disk.clear();
  store.saves.length = 0;
  resetCoachStored();
  __resetAskStoreForTests();
  registerNotebookSource(() => ({ rows: leanHistory(), paths: [], sessionStartedAt: null }));
});
afterEach(() => {
  registerNotebookSource(null);
  vi.useRealTimers();
});

describe("Settings → Coach → Notebook", () => {
  it("says nothing is left out, and that a line comes back by itself after thirty days", async () => {
    await mount();
    expect(screen.getByRole("heading", { name: t("settings.coach.groups.notebook") })).toBeTruthy();
    expect(screen.getByTestId("coach-nb-empty").textContent).toBe(t("settings.coach.notebook.empty"));
    expect(screen.getByText(t("settings.coach.notebook.comesBack"))).toBeTruthy();
    expect(store.saves).toEqual([]);
  });

  it("names a line left out, with its day, and leaves one over thirty days out of the list", async () => {
    const at = Date.now() - 2 * DAY;
    store.disk.set("coach.suppressed", { [LEAN_ID]: at, "minutes:sessions": Date.now() - 31 * DAY });
    await mount();
    const list = screen.getByTestId("coach-nb-left-out");
    expect(list.querySelectorAll("li")).toHaveLength(1);
    expect(list.querySelector(`[data-line="${LEAN_ID}"] .nb-text`)?.textContent).not.toBe(
      t("settings.coach.notebook.lineGone"),
    );
    expect(list.textContent).toContain(t("settings.coach.notebook.bringBack"));
    expect(store.saves).toEqual([]);
  });

  it("a line the Takes no longer make still shows, said plainly", async () => {
    store.disk.set("coach.suppressed", { "place:shift:early": Date.now() - DAY });
    await mount();
    expect(screen.getByTestId("coach-nb-left-out").textContent).toContain(t("settings.coach.notebook.lineGone"));
  });

  it("Bring back is one press through the store's door; its Undo leaves it out again on its own day", async () => {
    const at = Date.now() - 2 * DAY;
    store.disk.set("coach.suppressed", { [LEAN_ID]: at });
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-nb-bring-back"), { detail: 1 });
    });
    expect(coachStored().suppressed[LEAN_ID]).toBeUndefined();
    expect(store.disk.get("coach.suppressed")).toEqual({});
    expect(screen.getByTestId("coach-nb-back").textContent).toContain(t("settings.coach.notebook.broughtBack"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-nb-undo"), { detail: 1 });
    });
    expect(coachStored().suppressed[LEAN_ID]).toBe(at);
    expect(store.disk.get("coach.suppressed")).toEqual({ [LEAN_ID]: at });
    expect(screen.getByTestId("coach-nb-bring-back")).toBeTruthy();
  });

  it("the Undo goes after a few seconds, and its going writes nothing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    store.disk.set("coach.suppressed", { [LEAN_ID]: Date.now() - DAY });
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-nb-bring-back"), { detail: 1 });
    });
    const saves = store.saves.length;
    await act(async () => {
      vi.advanceTimersByTime(LEAVE_OUT_UNDO_MS + 50);
    });
    expect(screen.queryByTestId("coach-nb-undo")).toBeNull();
    expect(screen.getByTestId("coach-nb-empty")).toBeTruthy();
    expect(store.saves.length).toBe(saves);
  });

  it("shows the goal with its Edit, and never asks the goal question", async () => {
    store.disk.set("coach.goal", { text: "Play Blackbird at 90", at: Date.now() - 3 * DAY });
    await mount();
    expect(screen.getByTestId("nb-goal").textContent).toContain("Play Blackbird at 90");
    expect(screen.getByTestId("nb-goal-edit-button")).toBeTruthy();
    expect(screen.queryByTestId("nb-goal-offer")).toBeNull();
  });

  it("with no goal, offers to add one only on a press, and asks nothing", async () => {
    await mount();
    expect(screen.getByTestId("nb-goal-none")).toBeTruthy();
    expect(screen.queryByTestId("nb-goal-offer")).toBeNull();
    expect(store.saves).toEqual([]);
  });
});
