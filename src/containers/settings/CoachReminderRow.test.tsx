/**
 * Settings → Coach's Practice reminder row (leg rem2), and Today's line from
 * it: off by default and nothing written by showing it; the first On fills
 * 18:00 and all seven days; the days in the locale's order; the quiet note;
 * Today says it on a reminder day after its time with no Session today.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const store = vi.hoisted(() => ({
  disk: new Map<string, unknown>(),
  saves: [] as Array<[string, unknown]>,
  fail: new Set<string>(),
  takes: [] as Array<{ startedAt: number }>,
  runs: [] as Array<{ timestamp: number }>,
  reads: 0,
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
    getSessionHistory: vi.fn(async () => store.runs),
  };
});

import i18n from "../../i18n";
import { loadCoachStored, resetCoachStored } from "../../coach/store";
import { CoachReminderRow } from "./CoachReminderRow";
import { TodayReminder } from "../session/TodayReminder";

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
  store.reads = 0;
  store.failRead = false;
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
});

describe("Today's reminder line", () => {
  it("says it on a reminder day after its time with no Session today", async () => {
    store.disk.set("coach.reminder", { on: true, time: "00:00", days: ALL, since: Date.now() - 30 * DAY });
    store.takes = [{ startedAt: Date.now() - DAY }];
    render(<TodayReminder />);
    await loaded();
    expect(await screen.findByTestId("today-reminder")).toHaveTextContent(/^Your reminder: guitar at .+\.$/);
    expect(store.saves).toEqual([]);
  });

  it("says nothing with a Session today (a saved tool run counts)", async () => {
    store.disk.set("coach.reminder", { on: true, time: "00:00", days: ALL, since: Date.now() - 30 * DAY });
    store.runs = [{ timestamp: Date.now() }];
    const { unmount } = render(<TodayReminder />);
    await loaded();
    await act(async () => {});
    expect(screen.queryByTestId("today-reminder")).toBeNull();
    unmount();
  });

  it("says nothing when the Sessions cannot be read", async () => {
    store.disk.set("coach.reminder", { on: true, time: "00:00", days: ALL, since: Date.now() - 30 * DAY });
    store.failRead = true;
    render(<TodayReminder />);
    await loaded();
    await act(async () => {});
    expect(store.reads).toBe(1);
    expect(screen.queryByTestId("today-reminder")).toBeNull();
  });
});
