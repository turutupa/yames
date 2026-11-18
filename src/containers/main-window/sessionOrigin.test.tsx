/**
 * A Session goes back to where it was started from (QA 2026-11-17).
 *
 * The owner was on Sweep Picking, on a Step, pressed Play this on an Exercise,
 * then Escape, and landed on Today. Exit, Escape and the recap's Done all went
 * to Today whatever had started the Session, and the Paths screen forgot which
 * Path and Step were open the moment it unmounted.
 *
 * Every door into a Session, through the whole window: Today's Start, a Step's
 * Play this, Find my edge and Test out. And Back inside Paths, by Escape and by
 * the rail.
 */
import { describe, expect, it } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import i18n from "../../i18n";
import { setInvokeResponse } from "../../test/mocks";
import { openShell, settle } from "../../test/parity/shell";
import { press } from "../../test/parity/tools";
import { sessionOrigin } from "../session/hooks/useSessionRun";

const t = (key: string) => i18n.t(key);
const testid = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const on = (id: string) => testid(id) !== null;

async function click(el: HTMLElement | null) {
  if (!el) throw new Error("nothing to click");
  await act(async () => {
    fireEvent.click(el);
  });
  await settle();
}

async function railTo(labelKey: string) {
  const button = document.querySelector<HTMLElement>(`.rail [aria-label="${t(labelKey)}"]`);
  await click(button);
}

/** Escape, as a keyboard sends it (`press` lower-cases a named key). */
async function escape() {
  await act(async () => {
    fireEvent.keyDown(document.body, { key: "Escape" });
  });
  await settle();
}

/** Today, with its plan drawn: Start is enabled once the Paths have loaded. */
async function toToday() {
  await railTo("session.nav.progress");
  await railTo("session.nav.today");
  await waitFor(() => {
    const start = testid("today-start") as HTMLButtonElement | null;
    if (!start || start.disabled) throw new Error("no plan on Today yet");
  });
}

async function inSession() {
  await waitFor(() => {
    if (!on("session-exit")) throw new Error("no Session on screen");
  });
}

/** A returning player, subscribed to Alternate picking, one Take on its first Exercise. */
async function openReturning() {
  const now = Date.now();
  setInvokeResponse("list_path_states", () => [
    { pathId: "alternate-picking", startedAt: now - 3 * 86_400_000, updatedAt: now - 86_400_000 },
  ]);
  setInvokeResponse("list_path_takes", () => [
    {
      id: "t1",
      pathId: "alternate-picking",
      stepId: "even-eighths",
      exerciseId: "even-eighths.open-string",
      startedAt: now - 86_400_000,
      bpm: 60,
      bars: 8,
      caught: true,
      passed: false,
      facts: {},
    },
  ]);
  await openShell();
}

/** Paths, then Alternate picking, then its first Step. */
async function toStep() {
  await railTo("session.nav.paths");
  await waitFor(() => {
    if (!on("path-card-alternate-picking")) throw new Error("no Paths list");
  });
  await click(testid("path-card-alternate-picking"));
  await click(testid("step-row-even-eighths"));
  expect(on("step-detail")).toBe(true);
}

describe("sessionOrigin", () => {
  it("is the learning screen it was started from, and Today for anything else", () => {
    expect(sessionOrigin("today")).toBe("today");
    expect(sessionOrigin("paths")).toBe("paths");
    expect(sessionOrigin("progress")).toBe("progress");
    expect(sessionOrigin("tools")).toBe("tools");
    expect(sessionOrigin("session")).toBe("today");
    expect(sessionOrigin("beat")).toBe("today");
    expect(sessionOrigin("settings")).toBe("today");
  });
});

describe("leaving a Session", () => {
  it("started from Today's Start: Exit goes back to Today", async () => {
    await openReturning();
    await toToday();
    await click(screen.getByTestId("today-start"));
    await inSession();
    await click(testid("session-exit"));
    expect(on("today")).toBe(true);
  });

  it("started from Today's Start: Escape goes back to Today", async () => {
    await openReturning();
    await toToday();
    await click(screen.getByTestId("today-start"));
    await inSession();
    await escape();
    await settle();
    expect(on("today")).toBe(true);
  });

  it("started from a Step's Play this: Escape goes back to that Step", async () => {
    await openReturning();
    await toStep();
    await click(testid("play-even-eighths.open-string"));
    await inSession();
    await escape();
    await settle();
    expect(on("step-detail")).toBe(true);
    // The same Step: its own Exercises are the ones on the page.
    expect(on("exercise-even-eighths.open-string")).toBe(true);
  });

  it("started from a Step's Play this: no one-pip bar, and the clock says it is time played (acceptance pass 2)", async () => {
    await openReturning();
    await toStep();
    await click(testid("play-even-eighths.four-fingers"));
    await inSession();
    // One step: a single lit pip read as a full progress bar.
    expect(document.querySelectorAll('[data-testid="session-pips"] i')).toHaveLength(0);
    const clock = document.querySelector(".session-bar-left")?.textContent ?? "";
    expect(clock).toBe(t("session.run.played").replace("{{time}}", clock.match(/\d+:\d\d/)?.[0] ?? "?"));
  });

  it("started from a Step's Play this: Exit goes back to that Step", async () => {
    await openReturning();
    await toStep();
    await click(testid("play-even-eighths.four-fingers"));
    await inSession();
    await click(testid("session-exit"));
    expect(on("step-detail")).toBe(true);
    expect(on("exercise-even-eighths.four-fingers")).toBe(true);
  });

  it("started from a Step's Find my edge: Exit goes back to that Step", async () => {
    await openReturning();
    await toStep();
    await click(testid("edge-even-eighths.open-string"));
    await inSession();
    await click(testid("session-exit"));
    expect(on("step-detail")).toBe(true);
  });

  it("started from a Step's Test out: Escape goes back to that Step", async () => {
    await openReturning();
    await toStep();
    await click(testid("step-test-out"));
    await inSession();
    await escape();
    await settle();
    expect(on("step-detail")).toBe(true);
  });

  it("a view key does not walk out of a running Session (NAV-2)", async () => {
    await openReturning();
    await toStep();
    await click(testid("play-even-eighths.open-string"));
    await inSession();
    await act(async () => press("⌘1"));
    await act(async () => press("⌥1"));
    await settle();
    expect(on("session-exit")).toBe(true);
  });
});

describe("back inside Paths", () => {
  it("Escape goes Step, Path, list, and then stays", async () => {
    await openReturning();
    await toStep();
    await escape();
    await settle();
    expect(on("path-detail")).toBe(true);
    await escape();
    await settle();
    expect(on("paths")).toBe(true);
    await escape();
    await settle();
    expect(on("paths")).toBe(true);
  });

  it("Alt+Left goes one page up too (NAV-4)", async () => {
    await openReturning();
    await toStep();
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "ArrowLeft", altKey: true });
    });
    await settle();
    expect(on("path-detail")).toBe(true);
  });

  it("the mouse's back button goes one page up (NAV-4)", async () => {
    await openReturning();
    await toStep();
    await act(async () => {
      fireEvent.mouseUp(document.body, { button: 3 });
    });
    await settle();
    expect(on("path-detail")).toBe(true);
  });

  it("the Back control names where it goes", async () => {
    await openReturning();
    await toStep();
    expect(testid("paths-back")?.textContent).toContain("Alternate Picking");
    await click(testid("paths-back"));
    expect(on("path-detail")).toBe(true);
  });

  it("Paths reopens the Step it was on after Today, and the rail's Paths then goes up a page at a time (NAV-3)", async () => {
    await openReturning();
    await toStep();
    await railTo("session.nav.today");
    await railTo("session.nav.paths");
    expect(on("step-detail")).toBe(true);
    await railTo("session.nav.paths");
    expect(on("path-detail")).toBe(true);
    await railTo("session.nav.paths");
    expect(on("paths")).toBe(true);
  });

  it("the Paths key does the same as the rail", async () => {
    await openReturning();
    await toStep();
    await act(async () => press("⌘2"));
    await settle();
    expect(on("path-detail")).toBe(true);
  });

  it("Settings over a Step, closed by Escape, is the same Step", async () => {
    await openReturning();
    await toStep();
    await act(async () => press("⌘,"));
    await waitFor(() => {
      if (!document.querySelector("#settings-coach")) throw new Error("Settings did not open");
    });
    await escape();
    await settle();
    expect(on("step-detail")).toBe(true);
  });
});
