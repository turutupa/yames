/**
 * The coach's card on Progress (c4b2), rendered with the watch that feeds it
 * (c4b2's review: L12, and the fixes M1, M2, M4, M5, L8): what it waits for,
 * what Hide and Undo write and say, the plateau question's answers, and when
 * the watch publishes nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { CleanTempoSpanRow, PathTakeRow } from "../../ipc";

const io = vi.hoisted(() => ({
  disk: new Map<string, unknown>(),
  saves: [] as Array<[string, unknown]>,
  spans: [] as unknown[],
  release: null as null | (() => void),
  hold: false,
  fail: false,
}));

vi.mock("../../ipc", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../ipc")>();
  return {
    ...real,
    storeLoad: vi.fn(async (key: string) => io.disk.get(key)),
    storeSave: vi.fn(async (key: string, value: unknown) => {
      io.saves.push([key, value]);
      io.disk.set(key, value);
    }),
    listCleanTempoSpans: vi.fn(
      () =>
        new Promise((resolve, reject) => {
          if (io.fail) reject(new Error("no long view"));
          else if (!io.hold) resolve(io.spans);
          else io.release = () => resolve(io.spans);
        }),
    ),
  };
});

const ask = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("./askTools", () => ({
  runAskCall: vi.fn((call: unknown) => {
    ask.calls.push(call);
    return "";
  }),
}));
vi.mock("./askStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./askStore")>()),
  openAsk: vi.fn(),
}));

import i18n from "../../i18n";
import { companionBlocked, resetCompanion, useCompanion, useCompanionWatch, useProgressDot } from "../../coach/companion";
import { resetCardBudget } from "../../coach/cardBudget";
import { milestonesNow } from "../../coach/milestones";
import { loadCoachStored, resetCoachStored } from "../../coach/store";
import { countsTowardCleanTempo, type PlayerProgress } from "../../session/progress";
import { ALT, DAY, NOW, progress, take } from "../../session/testKit";
import { weekTotals, type Weekday } from "../../session/totals";
import type { SessionRun } from "../session/hooks/useSessionRun";
import { CompanionCard, UNDO_MS } from "./CompanionCard";

const t = i18n.t.bind(i18n);
const MON = 1 as Weekday;
const [A, B, C] = ALT.steps.flatMap((s) => s.exercises);
const { lastWeek } = weekTotals([], [ALT], NOW, MON);
const day = (d: number) => lastWeek.start + d * DAY + 12 * 3_600_000;

let n = 0;
const clean = (ex: string, bpm: number, at: number): PathTakeRow =>
  take(ex, { bpm, startedAt: at, passed: true, facts: { verdict: "passed", newClean: true, session: ++n } });
const below = (ex: string, bpm: number, at: number): PathTakeRow =>
  take(ex, { bpm, startedAt: at, facts: { verdict: "belowBar", newClean: false, session: ++n } });

/** Last week: A 70 → 90, three Sessions. */
const lastWeekTakes = () => [clean(A.id, 70, day(-5)), clean(A.id, 80, day(0)), clean(A.id, 90, day(2)), below(B.id, 60, day(4))];
/** C: three Sessions at 90 without a new clean tempo, ending yesterday: the planner rests it. */
const stuckTakes = () => [90, 90, 90].map((bpm, i) => below(C.id, bpm, NOW - (3 - i) * DAY));

function spansOf(takes: readonly PathTakeRow[]): CleanTempoSpanRow[] {
  const out = new Map<string, CleanTempoSpanRow>();
  for (const r of [...takes].sort((a, b) => a.startedAt - b.startedAt)) {
    if (!countsTowardCleanTempo(r)) continue;
    const id = `${r.pathId}/${r.exerciseId}`;
    const s = out.get(id);
    if (!s) out.set(id, { pathId: r.pathId, exerciseId: r.exerciseId, firstBpm: r.bpm, firstAt: r.startedAt, bestBpm: r.bpm, bestAt: r.startedAt });
    else if (r.bpm > s.bestBpm) Object.assign(s, { bestBpm: r.bpm, bestAt: r.startedAt });
  }
  return [...out.values()];
}

function sessionOf(prog: PlayerProgress, planOn: string[] = []): SessionRun {
  const steps = planOn.map((exerciseId) => ({ kind: "exercise", pathId: ALT.id, exerciseId }));
  return { progress: prog, paths: [ALT], grading: "on", plan: { steps } } as unknown as SessionRun;
}

function Shell({ session, blocked = false }: { session: SessionRun; blocked?: boolean }) {
  useCompanionWatch(session.progress, session.paths, true, MON, blocked);
  return <CompanionCard session={session} />;
}

function Card() {
  const c = useCompanion();
  return (
    <>
      <span data-testid="card-kind">{c.card?.kind ?? "none"}</span>
      <span data-testid="companion-dot">{useProgressDot() ? "yes" : "no"}</span>
    </>
  );
}

async function show(session: SessionRun, blocked = false) {
  const view = render(
    <>
      <Shell session={session} blocked={blocked} />
      <Card />
    </>,
  );
  await act(async () => {
    await loadCoachStored();
  });
  await act(async () => {});
  return view;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(NOW);
  io.disk.clear();
  io.saves.length = 0;
  io.spans = [];
  io.hold = false;
  io.fail = false;
  io.release = null;
  ask.calls.length = 0;
  resetCoachStored();
  resetCompanion();
  resetCardBudget();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the look-back", () => {
  it("waits for the long view before it says what moved (M4), then shows it and writes nothing", async () => {
    const takes = lastWeekTakes();
    io.spans = spansOf(takes);
    io.hold = true;
    await show(sessionOf(progress({ takes })));
    expect(screen.getByTestId("card-kind")).toHaveTextContent("weekly");
    expect(screen.queryByTestId("companion-weekly")).toBeNull();
    await act(async () => {
      io.release?.();
    });
    expect(screen.getByTestId("companion-weekly")).toBeInTheDocument();
    expect(screen.getByTestId("companion-moved")).toHaveTextContent(t("companion.weekly.movedFromTo", { from: 70, to: 90 }));
    expect(screen.getByTestId("companion-foot")).toBeInTheDocument();
    expect(io.saves).toEqual([]);
  });

  it("a long view that fails: the look-back shows without what moved, never 'no clean tempo moved', and the dot clears (LOW 2)", async () => {
    const takes = lastWeekTakes();
    io.fail = true;
    await show(sessionOf(progress({ takes })));
    expect(screen.getByTestId("companion-weekly")).toBeInTheDocument();
    const week = weekTotals(takes, [ALT], NOW, MON).lastWeek;
    expect(screen.getByTestId("companion-sentence")).toHaveTextContent(
      t("companion.weekly.say.ungraded", { sessions: week.sessions, minutes: week.minutes, exercises: 2 }),
    );
    expect(screen.queryByTestId("companion-moved")).toBeNull();
    expect(screen.queryByTestId("companion-milestone")).toBeNull();
    expect(screen.getByTestId("companion-dot")).toHaveTextContent("no");
    expect(io.saves).toEqual([]);
  });

  it("Hide, then Undo: the card is back and nothing is written", async () => {
    const takes = lastWeekTakes();
    io.spans = spansOf(takes);
    await show(sessionOf(progress({ takes })));
    fireEvent.click(screen.getByTestId("companion-hide"));
    expect(screen.getByTestId("companion-hidden")).toHaveTextContent(t("companion.hidden"));
    fireEvent.click(screen.getByTestId("companion-undo"));
    expect(screen.getByTestId("companion-weekly")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(UNDO_MS * 2);
    });
    expect(io.saves).toEqual([]);
  });

  it("Hide is written once when the Undo's window closes", async () => {
    const takes = lastWeekTakes();
    io.spans = spansOf(takes);
    await show(sessionOf(progress({ takes })));
    fireEvent.click(screen.getByTestId("companion-hide"));
    await act(async () => {
      vi.advanceTimersByTime(UNDO_MS);
    });
    expect(screen.queryByTestId("companion-hidden")).toBeNull();
    expect(io.saves).toEqual([["coach.cards", { weekly: { dismissed: 1, lastDismissed: NOW } }]]);
  });

  it("Hide is kept when the page is left inside the Undo's window", async () => {
    const takes = lastWeekTakes();
    io.spans = spansOf(takes);
    const view = await show(sessionOf(progress({ takes })));
    fireEvent.click(screen.getByTestId("companion-hide"));
    view.unmount();
    expect(io.saves).toEqual([["coach.cards", { weekly: { dismissed: 1, lastDismissed: NOW } }]]);
  });

  it("the second Hide says 'until you ask', not seven days (M2)", async () => {
    io.disk.set("coach.cards", { weekly: { dismissed: 1, lastDismissed: NOW - 8 * DAY } });
    const takes = lastWeekTakes();
    io.spans = spansOf(takes);
    await show(sessionOf(progress({ takes })));
    fireEvent.click(screen.getByTestId("companion-hide"));
    expect(screen.getByTestId("companion-hidden")).toHaveTextContent(t("companion.hiddenUntilAsked"));
  });

  it("asks the plateau question inside it only when the plateau card may show (M1)", async () => {
    const takes = [...lastWeekTakes(), ...stuckTakes()];
    io.spans = spansOf(takes);
    await show(sessionOf(progress({ takes })));
    expect(screen.getByTestId("companion-plateau")).toBeInTheDocument();
  });

  it("does not ask it after 'Not now' twice on the plateau card (M1)", async () => {
    io.disk.set("coach.cards", { plateau: { dismissed: 2, lastDismissed: NOW - 30 * DAY } });
    const takes = [...lastWeekTakes(), ...stuckTakes()];
    io.spans = spansOf(takes);
    await show(sessionOf(progress({ takes })));
    expect(screen.getByTestId("companion-weekly")).toBeInTheDocument();
    expect(screen.queryByTestId("companion-plateau")).toBeNull();
  });
});

describe("a milestone (c4b3)", () => {
  /** Last week's three Sessions, and yesterday B passed for the first time. */
  const passTakes = () => {
    const passB = B.tempo.passAtBpm ?? 80;
    return { takes: [...lastWeekTakes(), clean(B.id, passB, NOW - DAY)], ceilings: [{ exerciseKey: `${ALT.id}/${B.id}`, cleanBpm: passB, lastPracticed: NOW - DAY }] };
  };

  it("comes before the look-back in the budget, says its line, and Hide writes the milestone kind once", async () => {
    const { takes, ceilings } = passTakes();
    io.spans = spansOf(takes);
    const prog = progress({ takes, ceilings });
    const [m] = milestonesNow(prog, [ALT], NOW, true);
    expect(m).toBeDefined();
    await show(sessionOf(prog));
    expect(screen.getByTestId("card-kind")).toHaveTextContent("milestone");
    expect(screen.queryByTestId("companion-weekly")).toBeNull();
    expect(screen.getByTestId("companion-milestone-line")).toHaveTextContent(t(`companion.milestone.${m.line.key}`, m.line.values));
    expect(screen.getByTestId("companion-dot")).toHaveTextContent("no");
    fireEvent.click(screen.getByTestId("companion-hide"));
    await act(async () => {
      vi.advanceTimersByTime(UNDO_MS);
    });
    expect(io.saves).toEqual([["coach.cards", { milestone: { dismissed: 1, lastDismissed: NOW } }]]);
  });

  it("a milestone hidden within seven days leaves the slot to the look-back", async () => {
    io.disk.set("coach.cards", { milestone: { dismissed: 1, lastDismissed: NOW - DAY } });
    const { takes, ceilings } = passTakes();
    io.spans = spansOf(takes);
    await show(sessionOf(progress({ takes, ceilings })));
    expect(screen.getByTestId("card-kind")).toHaveTextContent("weekly");
    expect(screen.queryByTestId("companion-milestone-card")).toBeNull();
  });
});

describe("the plateau question alone", () => {
  it("offers 'Try it another way' only for a part on the stuck Exercise, and asks as many as it offers (M5)", async () => {
    const takes = stuckTakes();
    await show(sessionOf(progress({ takes }), [A.id]));
    expect(screen.getByTestId("companion-plateau-card")).toBeInTheDocument();
    expect(screen.queryByTestId("companion-plateau-another")).toBeNull();
    expect(screen.getByTestId("companion-plateau")).toHaveTextContent(t("companion.plateau.askTwo"));
  });

  it("with today's part on it: says which part, offers no Rest the plan is not giving, and 'another' proposes the swap (MEDIUM 1)", async () => {
    const takes = stuckTakes();
    await show(sessionOf(progress({ takes }), [A.id, C.id]));
    const said = screen.getByTestId("companion-plateau");
    expect(said).toHaveTextContent(t("companion.plateau.sayToday", { exercise: C.title, sessions: 3, bpm: 90, n: 2 }));
    expect(said).toHaveTextContent(t("companion.plateau.askToday"));
    expect(screen.queryByTestId("companion-plateau-rest")).toBeNull();
    fireEvent.click(screen.getByTestId("companion-plateau-another"));
    expect(ask.calls).toEqual([{ tool: "swap_part", args: { at: 2, choice: "different" } }]);
    expect(io.saves).toEqual([]);
  });

  it("held by a part that is not an Exercise block (the warm-up): names the part, asks only Keep at it (MEDIUM 1)", async () => {
    const takes = stuckTakes();
    const session = sessionOf(progress({ takes }), [A.id]);
    (session.plan as unknown as { steps: unknown[] }).steps.unshift({ kind: "metronome", pathId: ALT.id, exerciseId: C.id });
    await show(session);
    const said = screen.getByTestId("companion-plateau");
    expect(said).toHaveTextContent(t("companion.plateau.sayToday", { exercise: C.title, sessions: 3, bpm: 90, n: 1 }));
    expect(said).toHaveTextContent(t("companion.plateau.askKeep"));
    expect(screen.queryByTestId("companion-plateau-rest")).toBeNull();
    expect(screen.queryByTestId("companion-plateau-another")).toBeNull();
    expect(screen.getByTestId("companion-plateau-keep")).toBeInTheDocument();
  });

  it("left out of today's plan: the plan rests it, and Rest is offered", async () => {
    await show(sessionOf(progress({ takes: stuckTakes() }), [A.id]));
    expect(screen.getByTestId("companion-plateau").textContent).toContain(t("companion.plateau.askTwo"));
    expect(screen.getByTestId("companion-plateau-rest")).toBeInTheDocument();
  });

  it("Rest says a line and changes nothing", async () => {
    await show(sessionOf(progress({ takes: stuckTakes() })));
    fireEvent.click(screen.getByTestId("companion-plateau-rest"));
    expect(screen.getByTestId("companion-plateau-rested")).toBeInTheDocument();
    expect(ask.calls).toEqual([]);
    expect(io.saves).toEqual([]);
  });

  it("Keep at it hands Ask the play_exercise proposal", async () => {
    await show(sessionOf(progress({ takes: stuckTakes() })));
    fireEvent.click(screen.getByTestId("companion-plateau-keep"));
    expect(ask.calls).toMatchObject([{ tool: "play_exercise", args: { exercise: C.title, path: ALT.title } }]);
  });
});

describe("the watch", () => {
  it("publishes nothing while blocked (a Session's view, a run's phase, the wizard)", async () => {
    const takes = lastWeekTakes();
    await show(sessionOf(progress({ takes })), true);
    expect(screen.getByTestId("card-kind")).toHaveTextContent("none");
  });

  it("is blocked by any phase of a run but idle, whatever the view (L8)", () => {
    expect(companionBlocked({ inSession: false, phase: "idle", wizardOpen: false })).toBe(false);
    for (const phase of ["countIn", "playing", "recap", "between"]) {
      expect(companionBlocked({ inSession: false, phase, wizardOpen: false })).toBe(true);
    }
    expect(companionBlocked({ inSession: true, phase: "idle", wizardOpen: false })).toBe(true);
    expect(companionBlocked({ inSession: false, phase: "idle", wizardOpen: true })).toBe(true);
  });
});
