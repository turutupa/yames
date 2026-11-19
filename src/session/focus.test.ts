// Today's focus and the daily mix (owner, 2026-11-18): "I only have 20 minutes
// and I only want to focus on the pentatonics path", and "subscribed to Shred
// for occasional work, but never in the daily mix".
import { describe, expect, it } from "vitest";
import type { PathDoc } from "../paths/format";
import { PLAN_MINUTES, planSession } from "./planner";
import type { PlanStep, SessionPlan } from "./planner";
import { MIX, focusOn, mixPaths, readFocus, readOffMix, readStoredFocus, showsFocusPicker, storedFocus, todayPaths } from "./focus";
import { applySwaps, readSwapMemory, rememberSwap, swapMemoryOn, swapsIn, withScope } from "./swap";
import { ALT, DAY, NOW, SWEEP, progress, state, take } from "./testKit";
import type { PlayerProgress } from "./progress";

const BLUES_PACK = import.meta.glob("../paths/packs/blues-pentatonics.json", { eager: true });
const BLUES = (Object.values(BLUES_PACK)[0] as { default: unknown }).default as PathDoc;
const MINE = [ALT, SWEEP, BLUES];

type ExStep = Extract<PlanStep, { kind: "exercise" }>;
const total = (p: SessionPlan) => p.steps.reduce((sum, s) => sum + s.minutes, 0);
const pathsIn = (p: SessionPlan) =>
  new Set(p.steps.flatMap((s) => ("pathId" in s && s.pathId ? [s.pathId] : [])));

/** Three Paths, each played once, a few days apart: a returning player on all of them. */
const P: PlayerProgress = progress({
  states: MINE.map((path, i) => state({ pathId: path.id, startedAt: NOW - 30 * DAY + i })),
  takes: MINE.map((path, i) =>
    take(path.steps[0].exercises[0].id, {
      pathId: path.id,
      stepId: path.steps[0].id,
      startedAt: NOW - (i + 1) * DAY,
      facts: { session: NOW - (i + 1) * DAY, role: "focus", verdict: "belowBar" },
    }),
  ),
});

/** What the hook plans: `todayPaths`, then the planner. */
function planFor(minutes: (typeof PLAN_MINUTES)[number], offMix: string[], focus: string, p = P) {
  const today = todayPaths(MINE, offMix, focus);
  return planSession({
    minutes,
    now: NOW,
    paths: today.paths,
    progress: p,
    ...(today.focusedPath ? { focused: true } : {}),
  });
}

describe("reading the settings", () => {
  it("a focus: the mix unless a Path's id; the old name 'all' is the mix", () => {
    expect(readFocus(undefined)).toBe(MIX);
    expect(readFocus(null)).toBe(MIX);
    expect(readFocus("")).toBe(MIX);
    expect(readFocus(7)).toBe(MIX);
    expect(readFocus("all")).toBe(MIX);
    expect(readFocus(BLUES.id)).toBe(BLUES.id);
  });

  it("a focus is for the day it was chosen on, and the mix the day after", () => {
    const kept = storedFocus(BLUES.id, NOW);
    expect(kept).not.toBe(MIX);
    const stored = readStoredFocus(JSON.parse(JSON.stringify(kept)));
    expect(stored?.focus).toBe(BLUES.id);
    expect(focusOn(stored, NOW)).toBe(BLUES.id);
    // Later the same day (the end of it, wherever NOW falls in it).
    const endOfDay = new Date(NOW);
    endOfDay.setHours(23, 59, 59, 0);
    expect(focusOn(stored, endOfDay.getTime())).toBe(BLUES.id);
    // The next morning, and any day after: the mix, with nothing to undo.
    expect(focusOn(stored, endOfDay.getTime() + 2000)).toBe(MIX);
    expect(focusOn(stored, NOW + 9 * DAY)).toBe(MIX);
    // A clock set back does not bring it back either.
    expect(focusOn(stored, NOW - 2 * DAY)).toBe(MIX);
  });

  it("the mix is kept as the mix, and only a Path with its day is a focus", () => {
    expect(storedFocus(MIX, NOW)).toBe(MIX);
    expect(readStoredFocus(MIX)).toBeNull();
    expect(readStoredFocus(undefined)).toBeNull();
    // The build that kept a focus until changed stored the bare id: no day, so the mix.
    expect(readStoredFocus(BLUES.id)).toBeNull();
    expect(readStoredFocus({ focus: BLUES.id })).toBeNull();
    expect(readStoredFocus({ focus: BLUES.id, day: "tomorrow" })).toBeNull();
    expect(readStoredFocus({ focus: "all", day: "2026-11-18" })).toBeNull();
    expect(focusOn(null, NOW)).toBe(MIX);
  });

  it("migration: nothing stored means every subscribed Path is in the mix", () => {
    expect(readOffMix(undefined)).toEqual([]);
    expect(readOffMix({})).toEqual([]);
    expect(mixPaths(MINE, readOffMix(undefined))).toEqual(MINE);
    expect(readOffMix([SWEEP.id, 3, "", SWEEP.id])).toEqual([SWEEP.id]);
  });
});

describe("what Today plans from", () => {
  it("the mix leaves out the Paths switched off, in the player's order", () => {
    expect(todayPaths(MINE, [SWEEP.id], MIX)).toMatchObject({ focus: MIX, paths: [ALT, BLUES], focusedPath: null, emptyMix: false });
  });

  it("one Path, in the mix or not", () => {
    expect(todayPaths(MINE, [], BLUES.id)).toMatchObject({ focus: BLUES.id, paths: [BLUES], focusedPath: BLUES });
    expect(todayPaths(MINE, [BLUES.id], BLUES.id)).toMatchObject({ paths: [BLUES], focusedPath: BLUES });
  });

  it("a focus on a Path no longer subscribed falls back to the mix", () => {
    expect(todayPaths([ALT, SWEEP], [], BLUES.id)).toMatchObject({ focus: MIX, paths: [ALT, SWEEP], focusedPath: null });
  });

  it("everything switched off is an empty mix, not an empty plan with no word", () => {
    const today = todayPaths(MINE, MINE.map((p) => p.id), MIX);
    expect(today).toMatchObject({ paths: [], emptyMix: true });
    expect(planSession({ minutes: 15, now: NOW, paths: today.paths, progress: P }).steps).toEqual([]);
    // Subscribed to nothing is not an empty mix: Today asks for a Path then.
    expect(todayPaths([], [], MIX).emptyMix).toBe(false);
  });

  it("the picker: two subscribed Paths or more, or one Path switched out of the mix", () => {
    expect(showsFocusPicker([ALT], [])).toBe(false);
    expect(showsFocusPicker([ALT], [ALT.id])).toBe(true);
    expect(showsFocusPicker([ALT, SWEEP], [])).toBe(true);
    expect(showsFocusPicker([], [])).toBe(false);
  });
});

describe("the mix plans exactly as before", () => {
  for (const minutes of PLAN_MINUTES) {
    it(`${minutes} minutes, every Path in the mix: the same plan as every subscribed Path`, () => {
      const before = planSession({ minutes, now: NOW, paths: MINE, progress: P });
      expect(planFor(minutes, [], MIX)).toEqual(before);
      // A stale focus on a Path not subscribed is the mix too.
      const stale = todayPaths([ALT, SWEEP], [], "shred-gone");
      expect(planSession({ minutes, now: NOW, paths: stale.paths, progress: P })).toEqual(
        planSession({ minutes, now: NOW, paths: [ALT, SWEEP], progress: P }),
      );
    });
  }

  it("a Path out of the mix gets no block and no review, and its progress is untouched", () => {
    for (const minutes of PLAN_MINUTES) {
      const plan = planFor(minutes, [SWEEP.id], MIX);
      expect(pathsIn(plan).has(SWEEP.id)).toBe(false);
      expect((plan.skipped ?? []).some((s) => s.pathId === SWEEP.id)).toBe(false);
      expect(total(plan)).toBe(minutes);
    }
    // Back in the mix, it is planned as it was: nothing about it changed.
    expect(planFor(20, [], MIX)).toEqual(planSession({ minutes: 20, now: NOW, paths: MINE, progress: P }));
  });

  it("one Path left in the mix plans like that one Path", () => {
    const plan = planFor(20, [ALT.id, SWEEP.id], MIX);
    expect(plan).toEqual(planSession({ minutes: 20, now: NOW, paths: [BLUES], progress: P }));
  });
});

describe("one Path for today", () => {
  for (const focus of MINE) {
    for (const minutes of PLAN_MINUTES) {
      it(`${focus.title}, ${minutes} minutes: only that Path, every minute filled`, () => {
        const plan = planFor(minutes, [], focus.id);
        expect(plan.steps.length).toBeGreaterThan(0);
        expect([...pathsIn(plan)]).toEqual([focus.id]);
        expect(total(plan)).toBe(minutes);
        expect(plan.focusPathId).toBe(focus.id);
        expect(plan.skipped).toEqual([]);
        // The lead says it is the player's choice.
        const lead = plan.steps.find((s): s is ExStep => s.kind === "exercise" && s.id === "focus");
        expect(lead?.context).toEqual({ code: "focusChosen", values: { path: focus.title } });
      });
    }
  }

  it("a Path out of the mix can still be chosen for a day", () => {
    const plan = planFor(15, [SWEEP.id], SWEEP.id);
    expect([...pathsIn(plan)]).toEqual([SWEEP.id]);
    expect(total(plan)).toBe(15);
  });

  it("other Paths' rotation is not penalised: the next mix day leads with one of them", () => {
    // The mix today leads with the Path that has waited longest.
    const mixLead = planFor(15, [], MIX).focusPathId;
    // A focused day on another Path, played: its Takes are its own.
    const chosen = MINE.find((p) => p.id !== mixLead)!;
    const played: PlayerProgress = {
      ...P,
      takes: [
        take(chosen.steps[0].exercises[0].id, {
          pathId: chosen.id,
          stepId: chosen.steps[0].id,
          startedAt: NOW - 60_000,
          facts: { session: NOW - 60_000, role: "focus", verdict: "belowBar" },
        }),
        ...P.takes,
      ],
    };
    const next = planFor(15, [], MIX, played);
    expect(next.focusPathId).not.toBe(chosen.id);
    expect(next.focusPathId).toBe(mixLead);
  });

  it("with nothing fresh left, the Path's passed work is pushed past its clean tempo, never another Path", () => {
    const [a, b] = ALT.steps[0].exercises;
    const tiny: PathDoc = { ...ALT, id: "tiny", title: "Tiny", steps: [{ ...ALT.steps[0], exercises: [a, b] }] };
    const passAt = b.tempo.passAtBpm ?? 60;
    const p = progress({
      states: [state({ pathId: "tiny" }), state({ pathId: SWEEP.id })],
      takes: [
        take(b.id, { pathId: "tiny", stepId: tiny.steps[0].id, bpm: passAt, passed: true, startedAt: NOW - 3_600_000 }),
        take(a.id, { pathId: "tiny", stepId: tiny.steps[0].id, startedAt: NOW - 2 * 3_600_000 }),
      ],
      ceilings: [{ exerciseKey: `tiny/${b.id}`, cleanBpm: passAt, lastPracticed: NOW - 3_600_000 }],
    });
    for (const minutes of PLAN_MINUTES) {
      const plan = planSession({ minutes, now: NOW, paths: [tiny], progress: p, focused: true });
      expect([...pathsIn(plan)]).toEqual(["tiny"]);
      expect(total(plan)).toBe(minutes);
    }
    const plan = planSession({ minutes: 15, now: NOW, paths: [tiny], progress: p, focused: true });
    const edge = plan.steps.find((s): s is ExStep => s.kind === "exercise" && s.role === "edge");
    expect(edge?.exerciseId).toBe(b.id);
    // Not focused (the mix with one Path): as before, the lead takes the time.
    const before = planSession({ minutes: 15, now: NOW, paths: [tiny], progress: p });
    expect(before.steps.some((s) => s.kind === "exercise" && s.role === "edge")).toBe(false);
    expect(total(before)).toBe(15);
  });
});

describe("swaps belong to the plan they were made in", () => {
  const ctx = { paths: MINE, allPaths: MINE, progress: P, now: NOW };
  const mixPlan = planFor(15, [], MIX);
  const slot = mixPlan.steps.find((s): s is ExStep => s.kind === "exercise" && s.id === "block-1")!;
  const other = MINE.find((p) => p.id !== slot.pathId)!;
  const to = { pathId: other.id, exerciseId: other.steps[0].exercises[1].id };
  const from = { pathId: slot.pathId, exerciseId: slot.exerciseId };
  const memory = rememberSwap(withScope(swapMemoryOn(null, NOW), MIX), slot.id, from, to, from);

  it("in the mix, as before", () => {
    expect(swapsIn(memory, MIX)).toHaveLength(1);
    // A memory from before the focus existed was made in the mix.
    const { scope: _scope, ...old } = memory;
    expect(swapsIn(old, MIX)).toHaveLength(1);
    expect(swapsIn(readSwapMemory(JSON.parse(JSON.stringify(memory)))!, MIX)).toHaveLength(1);
  });

  it("another focus: no swaps applied, no stale rows, no crash", () => {
    const focused = planFor(15, [], ALT.id);
    const shown = applySwaps(focused, swapsIn(memory, ALT.id), ctx);
    expect(shown).toBe(focused);
    // Even applied by mistake, a swap whose block holds something else does nothing.
    expect(() => applySwaps(focused, memory.swaps, ctx)).not.toThrow();
  });

  it("changing the focus drops today's swaps and keeps what counts against tomorrow", () => {
    const moved = withScope(memory, ALT.id);
    expect(moved.swaps).toEqual([]);
    expect(moved.scope).toBe(ALT.id);
    expect(moved.away).toEqual(memory.away);
    // Back to the mix: still none. They belonged to the plan that was left.
    expect(withScope(moved, MIX).swaps).toEqual([]);
    expect(withScope(memory, MIX)).toBe(memory);
  });
});
