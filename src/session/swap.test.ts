// Swap on Today's rows (owner, 2026-11-18): what each choice offers, the
// minutes it keeps, the warm-up rule, and what is remembered.
import { describe, expect, it } from "vitest";
import { notesPerSecond, planSession } from "./planner";
import type { PlanStep, SessionPlan } from "./planner";
import {
  SWAP_CHOICES,
  applySwaps,
  avoidSet,
  dayKey,
  forgetSwap,
  harderTempoNote,
  readSwapMemory,
  rememberSwap,
  swapMemoryOn,
  swapOptions,
} from "./swap";
import type { SwapContext } from "./swap";
import { ALT, DAY, NOW, SWEEP, ceiling, passed, progress, state, take } from "./testKit";
import type { Exercise, PathDoc } from "../paths/format";

type ExStep = Extract<PlanStep, { kind: "exercise" }>;

const p = progress({
  states: [state(), state({ pathId: SWEEP.id })],
  takes: [
    passed("even-eighths.open-string", 90, 0.87, 2 * DAY),
    take("triads.triad-rolls", { pathId: SWEEP.id, stepId: "triads", startedAt: NOW - 3 * DAY }),
  ],
  ceilings: [ceiling("even-eighths.open-string", 90)],
});
const ctx: SwapContext = { paths: [ALT, SWEEP], allPaths: [ALT, SWEEP], progress: p, now: NOW };
const plan = planSession({ minutes: 15, now: NOW, paths: [ALT, SWEEP], progress: p });
const at = (id: string) => plan.steps.findIndex((s) => s.id === id);
const focusAt = at("focus");
const focus = plan.steps[focusAt] as ExStep;

function exerciseOf(paths: readonly PathDoc[], pathId: string, id: string): Exercise {
  const path = paths.find((x) => x.id === pathId)!;
  return [...path.steps.flatMap((s) => s.exercises), ...(path.levels ?? []).flatMap((l) => l.warmups)].find(
    (e) => e.id === id,
  )!;
}
const order = (path: PathDoc, id: string) => path.steps.flatMap((s) => s.exercises).findIndex((e) => e.id === id);
const inPlan = (sp: SessionPlan) => sp.steps.flatMap((s) => ("exerciseId" in s && s.exerciseId ? [s.exerciseId] : []));
const total = (sp: SessionPlan) => sp.steps.reduce((sum, s) => sum + s.minutes, 0);

describe("what each choice offers for an Exercise block", () => {
  it("the plan this file reads: a warm-up, the focus, a block of each Path", () => {
    expect(plan.steps.map((s) => s.id)).toEqual(["warmup", "focus", "block-1", "block-2"]);
    expect(focus.exerciseId).toBe("even-eighths.open-string");
  });

  it("Harder: later in the same Path and harder, keeping the block's id and minutes", () => {
    const { candidates, none } = swapOptions(plan, focusAt, "harder", ctx);
    expect(none).toBeNull();
    expect(candidates.length).toBeGreaterThan(1);
    const base = exerciseOf([ALT], ALT.id, focus.exerciseId).computed.difficulty;
    for (const c of candidates as ExStep[]) {
      expect(c).toMatchObject({ kind: "exercise", id: "focus", role: "focus", pathId: ALT.id, minutes: focus.minutes });
      expect(order(ALT, c.exerciseId)).toBeGreaterThan(order(ALT, focus.exerciseId));
      expect(exerciseOf([ALT], ALT.id, c.exerciseId).computed.difficulty).toBeGreaterThan(base);
      expect(inPlan(plan)).not.toContain(c.exerciseId);
      expect(c.swappedFrom).toBe(focus.title);
    }
  });

  it("Harder is off, with a reason, on the Path's last Exercise", () => {
    const last = ALT.steps[ALT.steps.length - 1];
    const ex = last.exercises.filter((e) => e.grading === "graded").at(-1)!;
    const only: SessionPlan = {
      ...plan,
      steps: [{ ...focus, stepId: last.id, exerciseId: ex.id, title: ex.title }],
    };
    expect(swapOptions(only, 0, "harder", ctx)).toEqual({ candidates: [], none: "harder" });
  });

  it("Something different: another Exercise of the same Path, none of them already in the plan", () => {
    const { candidates, none } = swapOptions(plan, focusAt, "different", ctx);
    expect(none).toBeNull();
    for (const c of candidates as ExStep[]) {
      expect(c.pathId).toBe(ALT.id);
      expect(c.exerciseId).not.toBe(focus.exerciseId);
      expect(inPlan(plan)).not.toContain(c.exerciseId);
      expect(c.minutes).toBe(focus.minutes);
    }
  });

  it("Another style: another Path's next Exercise; off when there is no other Path", () => {
    const { candidates } = swapOptions(plan, focusAt, "style", ctx);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates as ExStep[]) {
      expect(c.pathId).toBe(SWEEP.id);
      expect(c.minutes).toBe(focus.minutes);
    }
    const alone = { ...ctx, paths: [ALT], allPaths: [ALT] };
    const single = planSession({ minutes: 15, now: NOW, paths: [ALT], progress: p });
    expect(swapOptions(single, single.steps.findIndex((s) => s.id === "focus"), "style", alone)).toEqual({
      candidates: [],
      none: "style",
    });
  });

  it("Another style offers the entry of a Path the player has not started", () => {
    const alone = { ...ctx, paths: [ALT], allPaths: [ALT, SWEEP] };
    const single = planSession({ minutes: 15, now: NOW, paths: [ALT], progress: p });
    const { candidates } = swapOptions(single, single.steps.findIndex((s) => s.id === "focus"), "style", alone);
    expect((candidates[0] as ExStep).pathId).toBe(SWEEP.id);
  });

  it("the band and the ramp have nothing to swap", () => {
    const jam: SessionPlan = {
      ...plan,
      steps: [{ kind: "jam", id: "jam", title: "", minutes: 4, why: { code: "jam", values: {} } }],
    };
    for (const c of SWAP_CHOICES) expect(swapOptions(jam, 0, c, ctx).candidates).toEqual([]);
  });
});

describe("a warm-up only swaps for a warm-up, never busier than the block it warms up", () => {
  const cases: Array<[string, SessionPlan, SwapContext]> = [];
  for (const path of [ALT, SWEEP]) {
    const fresh = progress({ states: [state({ pathId: path.id })] });
    const c = { paths: [path], allPaths: [ALT, SWEEP], progress: fresh, now: NOW };
    cases.push([`${path.id} first`, planSession({ minutes: 10, now: NOW, paths: [path], progress: fresh }), c]);
  }
  cases.push(["two Paths, returning", plan, ctx]);

  for (const [name, sp, c] of cases) {
    it(name, () => {
      const warmAt = sp.steps.findIndex((s) => s.id === "warmup");
      expect(warmAt).toBeGreaterThanOrEqual(0);
      const f = sp.steps.find((s): s is ExStep => s.kind === "exercise" && s.id === "focus")!;
      const focusRate = notesPerSecond(exerciseOf(c.allPaths, f.pathId, f.exerciseId), f.bpm);
      let offered = 0;
      for (const choice of SWAP_CHOICES) {
        for (const cand of swapOptions(sp, warmAt, choice, c).candidates) {
          offered += 1;
          expect(cand).toMatchObject({ kind: "metronome", id: "warmup", minutes: sp.steps[warmAt].minutes });
          if (cand.kind !== "metronome") continue;
          const rate = notesPerSecond(exerciseOf(c.allPaths, cand.pathId!, cand.exerciseId!), cand.bpm);
          if (rate !== null && focusRate !== null) expect(rate).toBeLessThanOrEqual(focusRate * 1.25 + 1e-9);
        }
      }
      expect(offered).toBeGreaterThan(0);
    });
  }

  it("Harder is a busier warm-up than the one there", () => {
    const warmAt = at("warmup");
    const w = plan.steps[warmAt];
    if (w.kind !== "metronome") throw new Error("no warm-up");
    const own = notesPerSecond(exerciseOf([ALT], ALT.id, w.exerciseId!), w.bpm)!;
    for (const cand of swapOptions(plan, warmAt, "harder", ctx).candidates) {
      if (cand.kind !== "metronome") throw new Error("not a warm-up");
      expect(notesPerSecond(exerciseOf([ALT], ALT.id, cand.exerciseId!), cand.bpm)!).toBeGreaterThan(own);
    }
  });
});

describe("a swap in the plan", () => {
  const harder = swapOptions(plan, focusAt, "harder", ctx).candidates[0] as ExStep;
  const memory = rememberSwap(
    swapMemoryOn(null, NOW),
    "focus",
    { pathId: ALT.id, exerciseId: focus.exerciseId },
    { pathId: ALT.id, exerciseId: harder.exerciseId },
    { pathId: ALT.id, exerciseId: focus.exerciseId },
  );

  it("keeps the block's place and minutes, and the plan's total", () => {
    const swapped = applySwaps(plan, memory.swaps, ctx);
    expect(swapped.steps.map((s) => s.id)).toEqual(plan.steps.map((s) => s.id));
    expect(swapped.steps.map((s) => s.minutes)).toEqual(plan.steps.map((s) => s.minutes));
    expect(total(swapped)).toBe(total(plan));
    expect(swapped.steps[focusAt]).toMatchObject({ exerciseId: harder.exerciseId, swappedFrom: focus.title });
  });

  it("stops applying once the block holds something else", () => {
    const moved: SessionPlan = { ...plan, steps: plan.steps.map((s, i) => (i === focusAt ? { ...focus, exerciseId: "x" } : s)) };
    expect(applySwaps(moved, memory.swaps, ctx)).toBe(moved);
  });

  it("a focus swapped for a slower block brings the warm-up down under it", () => {
    // Swap the focus for a slow Exercise of another Path: the warm-up must stay within 1.25x of it.
    const slow = swapOptions(plan, focusAt, "style", ctx).candidates[0] as ExStep;
    const m = rememberSwap(
      swapMemoryOn(null, NOW),
      "focus",
      { pathId: ALT.id, exerciseId: focus.exerciseId },
      { pathId: slow.pathId, exerciseId: slow.exerciseId },
      { pathId: ALT.id, exerciseId: focus.exerciseId },
    );
    const swapped = applySwaps(plan, m.swaps, ctx);
    const f = swapped.steps[focusAt] as ExStep;
    const w = swapped.steps[at("warmup")];
    if (w.kind !== "metronome") throw new Error("no warm-up");
    const fr = notesPerSecond(exerciseOf(ctx.allPaths, f.pathId, f.exerciseId), f.bpm)!;
    const wr = notesPerSecond(exerciseOf(ctx.allPaths, w.pathId!, w.exerciseId!), w.bpm)!;
    expect(wr).toBeLessThanOrEqual(fr * 1.25 + 1e-9);
  });

  it("a block swapped twice still answers to the planner's first choice; undo puts it back", () => {
    const second = swapOptions(plan, focusAt, "harder", ctx).candidates[1] as ExStep;
    const twice = rememberSwap(
      memory,
      "focus",
      { pathId: ALT.id, exerciseId: focus.exerciseId },
      { pathId: ALT.id, exerciseId: second.exerciseId },
      { pathId: ALT.id, exerciseId: harder.exerciseId },
    );
    expect(twice.swaps).toEqual([
      { slot: "focus", from: { pathId: ALT.id, exerciseId: focus.exerciseId }, to: { pathId: ALT.id, exerciseId: second.exerciseId } },
    ]);
    expect(twice.away).toEqual([`${ALT.id}/${focus.exerciseId}`, `${ALT.id}/${harder.exerciseId}`]);
    const back = forgetSwap(twice, "focus");
    expect(back.swaps).toEqual([]);
    expect(applySwaps(plan, back.swaps, ctx)).toBe(plan);
    expect(back.away).not.toContain(`${ALT.id}/${focus.exerciseId}`);
  });
});

describe("remembering swaps", () => {
  const today = swapMemoryOn(null, NOW);
  const kept = rememberSwap(
    today,
    "focus",
    { pathId: ALT.id, exerciseId: "even-eighths.open-string" },
    { pathId: ALT.id, exerciseId: "even-eighths.pedal-riff" },
    { pathId: ALT.id, exerciseId: "even-eighths.open-string" },
  );

  it("round-trips through the store as plain JSON", () => {
    expect(readSwapMemory(JSON.parse(JSON.stringify(kept)))).toEqual(kept);
    expect(readSwapMemory("nonsense")).toBeNull();
    expect(readSwapMemory({ day: "yesterday", swaps: [] })).toBeNull();
    expect(readSwapMemory({ day: dayKey(NOW), swaps: [{ slot: 1 }], away: [3] })).toEqual({
      day: dayKey(NOW),
      swaps: [],
      away: [],
      avoid: null,
    });
  });

  it("the same day: today's swaps, as kept", () => {
    expect(swapMemoryOn(kept, NOW + 60_000)).toEqual(kept);
  });

  it("the next plan: the swaps are over and what was swapped away goes to the back, once", () => {
    const tomorrow = swapMemoryOn(kept, NOW + DAY);
    expect(tomorrow.swaps).toEqual([]);
    expect([...avoidSet(tomorrow)]).toEqual([`${ALT.id}/even-eighths.open-string`]);
    // The same day again keeps the penalty; the day after drops it.
    expect(avoidSet(swapMemoryOn(tomorrow, NOW + DAY + 60_000)).size).toBe(1);
    expect(avoidSet(swapMemoryOn(tomorrow, NOW + 2 * DAY)).size).toBe(0);
  });

  it("the planner does not serve straight back what was swapped away", () => {
    const base = planSession({ minutes: 15, now: NOW, paths: [ALT, SWEEP], progress: p });
    const avoid = new Set([`${ALT.id}/${(base.steps[focusAt] as ExStep).exerciseId}`]);
    const next = planSession({ minutes: 15, now: NOW, paths: [ALT, SWEEP], progress: p, avoid });
    const nextFocus = next.steps.find((s) => s.id === "focus") as ExStep;
    expect(nextFocus.exerciseId).not.toBe((base.steps[focusAt] as ExStep).exerciseId);
    expect(total(next)).toBe(total(base));
  });
});

// Acceptance 4, P2-5: Harder offered 60 BPM for an 80 BPM block and said nothing.
describe("Harder's tempo note", () => {
  it("says nothing when the tempo is the same or higher", () => {
    for (const c of swapOptions(plan, focusAt, "harder", ctx).candidates) {
      const note = harderTempoNote(focus, c, ctx.allPaths);
      if ((c as ExStep).bpm >= focus.bpm) expect(note).toBeNull();
    }
    expect(harderTempoNote(focus, { ...focus, bpm: focus.bpm + 10 }, ctx.allPaths)).toBeNull();
  });

  it("explains a lower tempo: busier at more notes a beat, else a new Exercise starting slow", () => {
    const slower = { ...focus, bpm: focus.bpm - 20 };
    expect(harderTempoNote(focus, slower, ctx.allPaths)).toEqual({
      key: "startsSlow",
      values: { bpm: focus.bpm - 20, was: focus.bpm },
    });
    // The same Exercise at half the tempo with a rate check that cannot be made: still explained.
    const unknown = { ...slower, pathId: "nowhere" } as PlanStep;
    expect(harderTempoNote(focus, unknown, ctx.allPaths)?.key).toBe("startsSlow");
    // A candidate whose notes come faster at its lower tempo is busier.
    const own = notesPerSecond(exerciseOf([ALT], ALT.id, focus.exerciseId), focus.bpm)!;
    const busy = ALT.steps
      .flatMap((s) => s.exercises)
      .find((e) => {
        const r = notesPerSecond(e, focus.bpm - 10);
        return r !== null && r > own;
      });
    if (busy) {
      const step = { ...focus, exerciseId: busy.id, bpm: focus.bpm - 10 } as PlanStep;
      expect(harderTempoNote(focus, step, ctx.allPaths)?.key).toBe("busier");
    }
  });
});
