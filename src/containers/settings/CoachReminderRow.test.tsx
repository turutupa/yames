/**
 * Settings → Coach's Practice reminder row (leg rem2), and Today's line from
 * it: off by default and nothing written by showing it; the first On fills
 * 18:00 and all seven days; the days in the locale's order; the quiet note;
 * Today says it on a reminder day after its time with no Session today.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const store = vi.hoisted(() => ({
  disk: new Map<string, unknown>(),
  saves: [] as Array<[string, unknown]>,
  fail: new Set<string>(),
  takes: [] as Array<{ startedAt: number }>,
  runs: [] as Array<{ timestamp: number }>,
  /** Songs attempts' starts, by song. */
  attempts: new Map<string, number[]>(),
  reads: 0,
  runReads: 0,
  songReads: 0,
  failRead: false,
}));

vi.mock("../../ipc", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../ipc")>();
  return {
    ...real,
    storeLoad: vi.fn(async (key: string) => {
      if (store.fail.has(key)) throw new Error("unreadable");
      return store.disk.get(key);
    }),
    storeSave: vi.fn(async (key: string, value: unknown) => {
      store.saves.push([key, value]);
      store.disk.set(key, value);
    }),
    listPathTakes: vi.fn(async () => {
      store.reads += 1;
      if (store.failRead) throw new Error("practice store unreadable");
      return store.takes;
    }),
    getSessionHistory: vi.fn(async () => {
      store.runReads += 1;
      return store.runs;
    }),
    listScores: vi.fn(async () => {
      store.songReads += 1;
      return [...store.attempts.keys()].map((id) => ({ id }));
    }),
    queryAttempts: vi.fn(async (query: { scoreId: string }) =>
      (store.attempts.get(query.scoreId) ?? []).map((startedAt) => ({ scoreId: query.scoreId, startedAt })),
    ),
  };
});

import i18n from "../../i18n";
import { loadCoachStored, resetCoachStored } from "../../coach/store";
import { setCoachClickPlaying, setCoachSessionBusy } from "../../hooks/coachLoadGate";
import { CoachReminderRow } from "./CoachReminderRow";
import { TodayReminder } from "../session/TodayReminder";

/** Today's line as TodayView mounts it: with the Session's Takes handed in. */
function today(takes: ReadonlyArray<{ startedAt: number }> | null = store.takes, sessionBusy = false) {
  return <TodayReminder takes={takes} sessionBusy={sessionBusy} />;
}

const t = i18n.t.bind(i18n);
const DAY = 86_400_000;
const ALL = [0, 1, 2, 3, 4, 5, 6];

async function loaded() {
  await act(async () => {
    await loadCoachStored();
  });
}

beforeEach(() => {
  store.disk.clear();
  store.saves.length = 0;
  store.fail.clear();
  store.takes = [];
  store.runs = [];
  store.attempts.clear();
  store.reads = 0;
  store.runReads = 0;
  store.songReads = 0;
  store.failRead = false;
  setCoachSessionBusy(false);
  setCoachClickPlaying(false);
  resetCoachStored();
});

describe("Practice reminder row", () => {
  it("off by default: no time, no days, nothing read or written by being shown", async () => {
    render(<CoachReminderRow />);
    await loaded();
    expect(screen.getByTestId("coach-reminder-off")).toHaveClass("active");
    expect(screen.queryByTestId("coach-reminder-time")).toBeNull();
    expect(screen.getByTestId("coach-reminder-row")).toHaveTextContent(t("notebook.reminder.hint"));
    expect(store.saves).toEqual([]);
    expect(store.reads).toBe(0);
  });

  it("the first On fills 18:00 and all seven days, dated by the press", async () => {
    render(<CoachReminderRow />);
    await loaded();
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-reminder-on"));
    });
    expect(store.saves).toHaveLength(1);
    const [key, value] = store.saves[0];
    expect(key).toBe("coach.reminder");
    expect(value).toMatchObject({ on: true, time: "18:00", days: ALL });
    expect(typeof (value as { since: unknown }).since).toBe("number");
    expect(screen.getByTestId("coach-reminder-time")).toHaveValue("18:00");
    for (const d of ALL) expect(screen.getByTestId(`coach-reminder-day-${d}`)).toHaveAttribute("aria-pressed", "true");
  });

  it("a day and the time change only what was pressed; Off keeps them", async () => {
    store.disk.set("coach.reminder", { on: true, time: "18:00", days: ALL, since: Date.now() - DAY });
    render(<CoachReminderRow />);
    await loaded();
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-reminder-day-0"));
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId("coach-reminder-time"), { target: { value: "07:30" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-reminder-off"));
    });
    expect(store.disk.get("coach.reminder")).toEqual({ on: false, time: "07:30", days: [1, 2, 3, 4, 5, 6], since: null });
  });

  it("the weekdays in the locale's order: Monday first in German", async () => {
    store.disk.set("coach.reminder", { on: true, time: "18:00", days: ALL, since: null });
    const order = () =>
      Array.from(document.querySelectorAll("[data-testid^='coach-reminder-day-']")).map((el) => el.getAttribute("data-testid"));
    await act(async () => {
      await i18n.changeLanguage("de");
    });
    const { unmount } = render(<CoachReminderRow />);
    await loaded();
    expect(order()[0]).toBe("coach-reminder-day-1");
    unmount();
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  it("an unreadable value: it says so, shows neither as chosen, and a press saves", async () => {
    store.fail.add("coach.reminder");
    render(<CoachReminderRow />);
    await loaded();
    expect(screen.getByTestId("coach-reminder-unreadable")).toBeInTheDocument();
    expect(screen.getByTestId("coach-reminder-off")).not.toHaveClass("active");
    expect(screen.getByTestId("coach-reminder-on")).not.toHaveClass("active");
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-reminder-off"));
    });
    expect(store.saves).toEqual([["coach.reminder", { on: false, time: "18:00", days: ALL, since: null }]]);
  });

  it("says Today has stopped mentioning it after three reminder days with no Session; the setting stays On", async () => {
    store.disk.set("coach.reminder", { on: true, time: "00:00", days: ALL, since: Date.now() - 30 * DAY });
    store.takes = [{ startedAt: Date.now() - 10 * DAY }];
    render(<CoachReminderRow />);
    await loaded();
    expect(await screen.findByTestId("coach-reminder-quiet")).toHaveTextContent(t("notebook.reminder.quiet"));
    expect(screen.getByTestId("coach-reminder-on")).toHaveClass("active");
    expect(store.saves).toEqual([]);
  });

  it("no quiet note on a day already practised (rem2b L1)", async () => {
    store.disk.set("coach.reminder", { on: true, time: "00:00", days: ALL, since: Date.now() - 30 * DAY });
    store.takes = [{ startedAt: Date.now() - 10 * DAY }];
    store.attempts.set("song", [Date.now()]);
    render(<CoachReminderRow />);
    await loaded();
    await act(async () => {});
    expect(store.songReads).toBe(1);
    expect(screen.queryByTestId("coach-reminder-quiet")).toBeNull();
  });

  it("On with no day chosen says Today will not mention it (rem2b L3)", async () => {
    store.disk.set("coach.reminder", { on: true, time: "18:00", days: [0], since: Date.now() - DAY });
    render(<CoachReminderRow />);
    await loaded();
    expect(screen.queryByTestId("coach-reminder-no-days")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-reminder-day-0"));
    });
    expect(screen.getByTestId("coach-reminder-no-days")).toHaveTextContent(t("notebook.reminder.noDays"));
  });

  it("a day or a time pressed reads nothing again (rem2b L5)", async () => {
    store.disk.set("coach.reminder", { on: true, time: "18:00", days: ALL, since: Date.now() - DAY });
    render(<CoachReminderRow />);
    await loaded();
    await act(async () => {});
    expect([store.reads, store.runReads, store.songReads]).toEqual([1, 1, 1]);
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-reminder-day-3"));
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId("coach-reminder-time"), { target: { value: "07:30" } });
    });
    expect(store.saves).toHaveLength(2);
    expect([store.reads, store.runReads, store.songReads]).toEqual([1, 1, 1]);
  });

  it("opened in the middle of a Take, it reads nothing until the click stops (rem2b L4)", async () => {
    store.disk.set("coach.reminder", { on: true, time: "00:00", days: ALL, since: Date.now() - 30 * DAY });
    setCoachClickPlaying(true);
    render(<CoachReminderRow />);
    await loaded();
    await act(async () => {});
    expect([store.reads, store.runReads, store.songReads]).toEqual([0, 0, 0]);
    await act(async () => {
      setCoachClickPlaying(false);
    });
    expect([store.reads, store.runReads, store.songReads]).toEqual([1, 1, 1]);
  });

  it("a cleared time writes nothing; unknown fields of a valid value are kept (rem2b L10)", async () => {
    store.disk.set("coach.reminder", { on: true, time: "18:00", days: ALL, since: 5, later: "kept" });
    render(<CoachReminderRow />);
    await loaded();
    await act(async () => {
      fireEvent.change(screen.getByTestId("coach-reminder-time"), { target: { value: "" } });
    });
    expect(store.saves).toEqual([]);
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-reminder-day-0"));
    });
    expect(store.disk.get("coach.reminder")).toEqual({ on: true, time: "18:00", days: [1, 2, 3, 4, 5, 6], since: 5, later: "kept" });
  });

  it("the Off/On pair is a group named after the row (rem2b L9)", async () => {
    render(<CoachReminderRow />);
    await loaded();
    expect(screen.getByRole("group", { name: t("notebook.reminder.label") })).toContainElement(
      screen.getByTestId("coach-reminder-on"),
    );
  });
});

describe("Today's reminder line", () => {
  it("says it on a reminder day after its time with no practice today", async () => {
    store.disk.set("coach.reminder", { on: true, time: "00:00", days: ALL, since: Date.now() - 30 * DAY });
    store.takes = [{ startedAt: Date.now() - DAY }];
    render(today());
    await loaded();
    expect(await screen.findByTestId("today-reminder")).toHaveTextContent(/^Your reminder: guitar at .+\.$/);
    expect(store.saves).toEqual([]);
  });

  it("says nothing with a saved tool run today; the same without the run says it", async () => {
    store.disk.set("coach.reminder", { on: true, time: "00:00", days: ALL, since: Date.now() - 30 * DAY });
    store.takes = [{ startedAt: Date.now() - DAY }];
    store.runs = [{ timestamp: Date.now() }];
    const { unmount } = render(today());
    await loaded();
    await act(async () => {});
    expect(store.runReads).toBe(1);
    expect(screen.queryByTestId("today-reminder")).toBeNull();
    unmount();
    store.runs = [];
    render(today());
    expect(await screen.findByTestId("today-reminder")).toBeInTheDocument();
  });

  it("a Songs attempt today counts as practice (rem2b M2); the same without it says the line", async () => {
    store.disk.set("coach.reminder", { on: true, time: "00:00", days: ALL, since: Date.now() - 30 * DAY });
    store.attempts.set("a", [Date.now() - 3 * DAY]);
    store.attempts.set("b", [Date.now() - 2 * DAY, Date.now()]);
    const { unmount } = render(today());
    await loaded();
    await act(async () => {});
    expect(store.songReads).toBe(1);
    expect(screen.queryByTestId("today-reminder")).toBeNull();
    unmount();
    store.attempts.set("b", [Date.now() - 2 * DAY]);
    render(today());
    expect(await screen.findByTestId("today-reminder")).toBeInTheDocument();
  });

  it("uses the Session's Takes: a Take today hides it, and the Takes are not read again (rem2b L5)", async () => {
    store.disk.set("coach.reminder", { on: true, time: "00:00", days: ALL, since: Date.now() - 30 * DAY });
    const yesterday = { startedAt: Date.now() - DAY };
    const { rerender } = render(today([yesterday]));
    await loaded();
    expect(await screen.findByTestId("today-reminder")).toBeInTheDocument();
    rerender(today([{ startedAt: Date.now() }, yesterday]));
    expect(screen.queryByTestId("today-reminder")).toBeNull();
    expect(store.reads).toBe(0);
  });

  it("says nothing and reads nothing between the Takes of a running Session (rem2b L4)", async () => {
    store.disk.set("coach.reminder", { on: true, time: "00:00", days: ALL, since: Date.now() - 30 * DAY });
    render(today([], true));
    await loaded();
    await act(async () => {});
    expect(screen.queryByTestId("today-reminder")).toBeNull();
    expect([store.runReads, store.songReads]).toEqual([0, 0]);
  });

  it("the practice store unavailable answers empty lists, which cannot be told from nothing played: the line shows (rem2b L2)", async () => {
    // Turned on yesterday, so the quiet rule cannot hold yet.
    store.disk.set("coach.reminder", { on: true, time: "00:00", days: ALL, since: Date.now() - DAY });
    // `SharedPracticeStore::read_or(Vec::new(), …)`: no rejection, an empty list.
    render(today([]));
    await loaded();
    expect(await screen.findByTestId("today-reminder")).toBeInTheDocument();
  });

  it("a read that rejects says nothing", async () => {
    store.disk.set("coach.reminder", { on: true, time: "00:00", days: ALL, since: Date.now() - 30 * DAY });
    store.failRead = true;
    render(<TodayReminder takes={undefined as never} />);
    await loaded();
    await act(async () => {});
    expect(store.reads).toBe(1);
    expect(screen.queryByTestId("today-reminder")).toBeNull();
  });
});

describe("Today's reminder line across midnight (rem2b M1)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("left open from 23:59 on a reminder day into a day that is not one: the line goes", async () => {
    // Monday 23 November 2026, 23:59; the reminder on Mondays at 18:00.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date(2026, 10, 23, 23, 59));
    // Turned on the day before, so the quiet rule cannot hold.
    store.disk.set("coach.reminder", { on: true, time: "18:00", days: [1], since: Date.now() - DAY });
    render(today([]));
    await loaded();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("today-reminder")).toBeInTheDocument();
    expect(store.runReads).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });
    expect(screen.queryByTestId("today-reminder")).toBeNull();
    // It looked again at midnight.
    expect(store.runReads).toBe(2);
  });

  it("left open before the time: the line comes at the time, and the window coming back reads again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date(2026, 10, 23, 17, 59));
    // Turned on the day before, so the quiet rule cannot hold.
    store.disk.set("coach.reminder", { on: true, time: "18:00", days: [1], since: Date.now() - DAY });
    render(today([]));
    await loaded();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByTestId("today-reminder")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(screen.getByTestId("today-reminder")).toBeInTheDocument();
    expect(store.runReads).toBe(2);
    store.runs = [{ timestamp: Date.now() }];
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(store.runReads).toBe(3);
    expect(screen.queryByTestId("today-reminder")).toBeNull();
  });
});
