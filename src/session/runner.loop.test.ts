/**
 * The loop step and the two Session rules the owner confirmed (2026-11-20):
 * P1, once more here, and P2, leave it (DESIGN 4.2).
 */
import { describe, expect, it } from "vitest";
import type { Exercise } from "../paths/format";
import { takeBarsOf, type TakeGrade } from "./grade";
import { planSession } from "./planner";
import type { LoopStep, SessionPlan } from "./planner";
import { hasRungAbove, rungAbove, rungBelow } from "./ladder";
import {
  IDLE,
  bigAction,
  canJump,
  currentStep,
  eventForBigAction,
  eyesOffer,
  leaveNeedsAsking,
  LOOP_MAX_BARS,
  loopAsked,
  loopAt,
  loopBars,
  loopOffer,
  OWN_EXERCISES_PATH_ID,
  printedLoopBars,
  runReducer,
  timedTempoAdjustable,
} from "./runner";
import type { RunEvent, RunState, TakeOutcome, TakeSpot } from "./runner";
import { ALT, NOW, missed, progress } from "./testKit";
import { MY_EXERCISES_PATH_ID } from "./myExercises";
import { CUSTOM_PATH_ID } from "../paths/custom";

const EX = ALT.steps[0].exercises[0];

function plan(): SessionPlan {
  return planSession({ minutes: 15, now: NOW, paths: [ALT], progress: progress({ takes: [missed(EX.id, 60, 0.8)] }) });
}

function run(state: RunState, ...events: RunEvent[]): RunState {
  return events.reduce(runReducer, state);
}

function atFocus(ungraded = false): RunState {
  return run(
    IDLE,
    { type: "start", plan: plan(), now: NOW, ...(ungraded ? { ungraded: "gradingOff" as const } : {}) },
    { type: "next", now: NOW },
  );
}

function grade(verdict: TakeGrade["verdict"], passesExercise = false): TakeGrade {
  return { verdict, checks: [], headline: null, unmeasured: [], cleanBpm: null, passesExercise };
}

function outcomeOf(state: RunState, verdict: TakeGrade["verdict"], spot?: TakeSpot, ungraded = false): TakeOutcome {
  const step = currentStep(state);
  return {
    stepId: step?.id ?? "focus",
    exerciseId: EX.id,
    title: EX.title,
    bpm: state.bpm,
    takeNumber: state.takes + 1,
    measures: {
      expected: 16,
      heard: 16,
      extras: 0,
      evenness: 0.9,
      accent: null,
      noteIdentity: null,
      barsPlayed: 8,
      barEvenness: null,
      caught: !ungraded,
    },
    grade: grade(verdict),
    previousValue: null,
    cleanBefore: null,
    ...(spot ? { spot } : {}),
    ...(ungraded ? { ungraded: "gradingOff" as const } : {}),
  };
}

function take(state: RunState, verdict: TakeGrade["verdict"], spot?: TakeSpot, ungraded = false): RunState {
  return run(
    state,
    { type: "takeStarted", now: NOW },
    { type: "takeStopped", now: NOW },
    { type: "takeResult", outcome: outcomeOf(state, verdict, spot, ungraded), now: NOW },
  );
}

/** Again, as the big button does it. */
function again(state: RunState): RunState {
  const event = eventForBigAction(bigAction(state, EX), NOW);
  if (!event || event.type !== "again") throw new Error(`not again: ${JSON.stringify(bigAction(state, EX))}`);
  return run(state, event);
}

const SLIPPED: TakeSpot = { patternBars: [1], repeat: 1, onceMoreHere: false };

describe("P1, once more here", () => {
  it("a pass that still held the bar that slipped stays at its tempo once, with the rung above one tap away", () => {
    const s = atFocus();
    expect(hasRungAbove(EX, s.bpm)).toBe(true);
    const missedOnce = take(s, "belowBar", SLIPPED);
    const passed = take(again(missedOnce), "passed", { patternBars: [1], repeat: 1, onceMoreHere: true });
    expect(bigAction(passed, EX)).toEqual({ kind: "again", bpm: s.bpm, onceMore: { up: rungAbove(EX, s.bpm) } });
  });

  it("once only: the next pass at that tempo goes up as it always did", () => {
    const s = atFocus();
    let state = take(s, "belowBar", SLIPPED);
    state = take(again(state), "passed", { patternBars: [1], repeat: 1, onceMoreHere: true });
    state = take(again(state), "passed", { patternBars: [1], repeat: 1, onceMoreHere: true });
    expect(bigAction(state, EX)).toEqual({ kind: "again", bpm: rungAbove(EX, s.bpm), up: true });
  });

  it("a clean pass goes up as before", () => {
    const state = take(atFocus(), "passed");
    expect(bigAction(state, EX)).toEqual({ kind: "again", bpm: rungAbove(EX, state.bpm), up: true });
  });

  it("never holds a pass that passes the Exercise", () => {
    const s = atFocus();
    const state = run(
      s,
      { type: "takeStarted", now: NOW },
      { type: "takeStopped", now: NOW },
      {
        type: "takeResult",
        outcome: { ...outcomeOf(s, "passed", { patternBars: [1], repeat: 1, onceMoreHere: true }), grade: grade("passed", true) },
        now: NOW,
      },
    );
    expect(bigAction(state, EX).kind).toBe("next");
  });
});

describe("P2, leave it", () => {
  it("the third time at the same place, the solid button moves on", () => {
    const s = atFocus();
    const first = take(s, "belowBar", SLIPPED);
    expect(bigAction(first, EX)).toEqual({ kind: "again", bpm: s.bpm });
    const second = take(again(first), "belowBar", { ...SLIPPED, repeat: 2 });
    expect(bigAction(second, EX)).toEqual({ kind: "again", bpm: s.bpm });
    const third = take(again(second), "belowBar", { ...SLIPPED, repeat: 3 });
    const action = bigAction(third, EX);
    expect(action.kind).toBe("next");
    expect(action.kind === "next" && action.leaveIt).toBe(true);
    // The event is the ordinary Next.
    expect(eventForBigAction(action, NOW)).toEqual({ type: "next", now: NOW });
  });

  it("three Takes falling (no bar named) is the same row", () => {
    const state = take(atFocus(), "belowBar", { patternBars: [], repeat: 3, onceMoreHere: false });
    const action = bigAction(state, EX);
    expect(action.kind === "next" && action.leaveIt).toBe(true);
  });

  it("going again stays reachable after it", () => {
    const state = take(atFocus(), "belowBar", { ...SLIPPED, repeat: 3 });
    const back = run(state, { type: "again", now: NOW });
    expect(back.phase).toBe("ready");
    expect(back.bpm).toBe(state.bpm);
  });

  it("does nothing on a pass, a short Take or an ungraded one", () => {
    expect(bigAction(take(atFocus(), "tooShort", { ...SLIPPED, repeat: 3 }), EX).kind).toBe("again");
    const ungraded = take(atFocus(true), "ungraded", undefined, true);
    const action = bigAction(ungraded, EX);
    expect("leaveIt" in action && action.leaveIt).toBeFalsy();
  });
});

describe("the loop step", () => {
  it("is offered on a result that named a place, two rungs under the Take", () => {
    const state = take(atFocus(), "belowBar", { patternBars: [2], repeat: 1, onceMoreHere: false });
    const offer = loopOffer(state, EX);
    expect(offer).not.toBeNull();
    expect(offer?.front).toBe(false);
    expect(offer?.loop).toMatchObject({ kind: "loop", fromBar: 2, toBar: 2, exerciseId: EX.id });
    expect(offer?.loop.bpm).toBe(rungBelow(EX, rungBelow(EX, state.bpm)));
  });

  it("leads the tonal row the second time at the same spot", () => {
    const state = take(atFocus(), "belowBar", { patternBars: [1], repeat: 2, onceMoreHere: false });
    expect(loopOffer(state, EX)?.front).toBe(true);
  });

  it("is not offered with no place, or on a pass with no place", () => {
    expect(loopOffer(take(atFocus(), "belowBar"), EX)).toBeNull();
    expect(loopOffer(take(atFocus(), "passed"), EX)).toBeNull();
    expect(loopOffer(atFocus(), EX)).toBeNull();
  });

  it("ungraded, it comes to the front after Not yet twice, on the first bar, and never otherwise", () => {
    const state = take(atFocus(true), "ungraded", undefined, true);
    expect(loopOffer(state, EX)).toBeNull();
    const offer = loopOffer(state, EX, { notYetTwice: true });
    expect(offer).toMatchObject({ front: true, loop: { fromBar: 1, toBar: 1 } });
  });

  it("runs from a result and goes back to the same step's ready screen, storing nothing and moving no tempo", () => {
    const result = take(atFocus(), "belowBar", SLIPPED);
    const offer = loopOffer(result, EX) as { loop: LoopStep };
    const looping = run(result, { type: "loop", loop: offer.loop, now: NOW + 1 });
    expect(looping.phase).toBe("looping");
    expect(bigAction(looping, EX)).toEqual({ kind: "endLoop" });
    expect(eventForBigAction(bigAction(looping, EX), NOW)).toBeNull();
    // Its own tempo moves; the Take's does not.
    const slower = run(looping, { type: "setBpm", bpm: offer.loop.bpm - 5, now: NOW + 2 });
    expect(slower.loop?.bpm).toBe(offer.loop.bpm - 5);
    expect(slower.bpm).toBe(result.bpm);
    const heard = { rounds: 4, landed: 3, lastRun: 3 };
    const back = run(slower, { type: "loopStopped", heard, now: NOW + 3 });
    expect(back.phase).toBe("ready");
    expect(back.stepIndex).toBe(result.stepIndex);
    expect(back.bpm).toBe(result.bpm);
    expect(back.takes).toBe(result.takes);
    expect(back.outcomes).toBe(result.outcomes);
    expect(back.done).toEqual(result.done);
    expect(back.loop).toBeNull();
    expect(back.afterLoop).toEqual({ loop: { ...offer.loop, bpm: offer.loop.bpm - 5 }, heard });
    // The next Take clears the line about the loop.
    expect(run(back, { type: "takeStarted", now: NOW + 4 }).afterLoop).toBeNull();
  });

  it("runs from a ready screen and comes back to it", () => {
    const result = take(atFocus(), "belowBar", SLIPPED);
    const ready = run(result, { type: "slower", exercise: EX, now: NOW });
    const offer = loopOffer(ready, EX) as { loop: LoopStep };
    expect(offer).not.toBeNull();
    const back = run(ready, { type: "loop", loop: offer.loop, now: NOW }, { type: "loopStopped", heard: null, now: NOW });
    expect(back.phase).toBe("ready");
    expect(back.bpm).toBe(ready.bpm);
    expect(back.afterLoop?.heard).toBeNull();
  });

  it("ignores a Take's events while it runs, and a loop of another Exercise", () => {
    const result = take(atFocus(), "belowBar", SLIPPED);
    const offer = loopOffer(result, EX) as { loop: LoopStep };
    const looping = run(result, { type: "loop", loop: offer.loop, now: NOW });
    expect(run(looping, { type: "takeStarted", now: NOW })).toBe(looping);
    expect(run(looping, { type: "again", now: NOW })).toBe(looping);
    expect(run(result, { type: "loop", loop: { ...offer.loop, exerciseId: "other" }, now: NOW })).toBe(result);
  });

  it("can be left by the bar's blocks and Exit, with nothing to ask about it", () => {
    const fresh = run(atFocus(), { type: "loop", loop: { ...(loopOffer(take(atFocus(), "belowBar", SLIPPED), EX) as { loop: LoopStep }).loop }, now: NOW });
    expect(fresh.phase).toBe("looping");
    expect(canJump(fresh)).toBe(true);
    expect(leaveNeedsAsking({ ...fresh, outcomes: [] })).toBe(false);
    const jumped = run(fresh, { type: "jump", index: 0, now: NOW });
    expect(jumped.phase).toBe("timedReady");
    expect(jumped.loop).toBeNull();
    expect(jumped.afterLoop).toBeNull();
  });

  it("is a step whose tempo the player sets", () => {
    const offer = loopOffer(take(atFocus(), "belowBar", SLIPPED), EX) as { loop: LoopStep };
    expect(timedTempoAdjustable(offer.loop)).toBe(true);
  });
});

describe("this one is for your eyes", () => {
  it("every fifth Take, on an Exercise where the pick matters, graded", () => {
    let state = atFocus();
    const offered: number[] = [];
    for (let i = 1; i <= 10; i += 1) {
      state = take(state, "belowBar");
      if (eyesOffer(state, true)) offered.push(state.takes);
      state = run(state, { type: "again", now: NOW });
    }
    // Offered after the 4th and the 9th: the 5th and the 10th are for the eyes.
    expect(offered).toEqual([4, 9]);
  });

  it("never where the pick does not matter, ungraded, or on a ready screen", () => {
    let state = atFocus();
    for (let i = 0; i < 4; i += 1) state = run(take(state, "belowBar"), { type: "again", now: NOW });
    expect(eyesOffer(state, true)).toBe(false);
    const fourth = take(state, "belowBar");
    expect(eyesOffer(fourth, false)).toBe(false);
    expect(eyesOffer({ ...fourth, ungraded: "gradingOff" }, true)).toBe(false);
  });

  it("the Take itself is ungraded and moves nothing: the big action after it is the plain one", () => {
    let state = atFocus();
    for (let i = 0; i < 4; i += 1) state = run(take(state, "belowBar"), { type: "again", now: NOW });
    const eyes = run(state, { type: "setUngraded", why: "eyes" });
    const after = take(eyes, "ungraded", undefined, true);
    expect(after.bpm).toBe(state.bpm);
    expect(loopOffer(after, EX)).toBeNull();
  });
});

describe("loopAt: bars the player asked for (leg lb1)", () => {
  const FOUR = { ...EX, bars: 4 };

  it("builds the loop loopOffer would, for the asked bars: same id, two rungs under, no minutes", () => {
    const result = take(atFocus(), "belowBar", SLIPPED);
    const offer = loopOffer(result, EX) as { loop: LoopStep };
    const asked = loopAt(result, EX, offer.loop.fromBar, offer.loop.toBar);
    expect(asked).toEqual({ loop: offer.loop });
    const own = loopAt(result, FOUR, 2, 4) as { loop: LoopStep };
    expect(own.loop).toMatchObject({ kind: "loop", id: offer.loop.id, fromBar: 2, toBar: 4, minutes: 0, bpm: offer.loop.bpm });
  });

  it("honours a range past LOOP_MAX_BARS: that limit is the coach's offer, not the player's request", () => {
    const state = take(atFocus(), "belowBar", SLIPPED);
    const asked = loopAt(state, FOUR, 1, 4) as { loop: LoopStep };
    expect(asked.loop.toBar - asked.loop.fromBar + 1).toBeGreaterThan(LOOP_MAX_BARS);
  });

  it("allows a fresh step with no Take yet, still two rungs under the step's tempo", () => {
    const fresh = atFocus();
    expect(fresh.phase).toBe("ready");
    expect(fresh.takes).toBe(0);
    const asked = loopAt(fresh, EX, 1, 1) as { loop: LoopStep };
    expect(asked.loop.bpm).toBe(rungBelow(EX, rungBelow(EX, fresh.bpm)));
    expect(run(fresh, { type: "loop", loop: asked.loop, now: NOW }).phase).toBe("looping");
  });

  it.each([
    ["off an Exercise's screens: idle", () => IDLE, 1, 1, "notHere"],
    ["during a Take", () => run(atFocus(), { type: "takeStarted", now: NOW }), 1, 1, "notHere"],
    ["while a loop runs", () => run(atFocus(), { type: "loop", loop: (loopAt(atFocus(), EX, 1, 1) as { loop: LoopStep }).loop, now: NOW }), 1, 1, "notHere"],
    ["on a warm-up", () => run(IDLE, { type: "start", plan: plan(), now: NOW }), 1, 1, "notHere"],
    ["bar 0", () => atFocus(), 0, 1, "outsideTune"],
    ["past the pattern", () => atFocus(), 1, 5, "outsideTune"],
    ["to before from", () => atFocus(), 3, 2, "backwards"],
  ] as const)("refuses %s", (_name, state, from, to, why) => {
    expect(loopAt(state(), FOUR, from, to)).toEqual({ refused: why });
  });

  it("refuses with no Exercise", () => {
    expect(loopAt(atFocus(), null, 1, 1)).toEqual({ refused: "notHere" });
  });
});

describe("printedLoopBars: bars as the Session prints them", () => {
  const FOUR = { ...EX, bars: 4 };
  const takeBars = takeBarsOf(FOUR);

  it("a number up to the pattern's length is the pattern's bar", () => {
    expect(printedLoopBars(FOUR, 3, 4)).toEqual({ fromBar: 3, toBar: 4 });
    expect(printedLoopBars(FOUR, 1, 1)).toEqual({ fromBar: 1, toBar: 1 });
  });

  it("a Take's bar past the pattern folds onto its pattern bar, round by round", () => {
    expect(takeBars).toBeGreaterThan(8);
    expect(printedLoopBars(FOUR, 7, 8)).toEqual({ fromBar: 3, toBar: 4 });
    expect(printedLoopBars(FOUR, 5, 5)).toEqual({ fromBar: 1, toBar: 1 });
    expect(printedLoopBars(FOUR, takeBars, takeBars)).toEqual({ fromBar: ((takeBars - 1) % 4) + 1, toBar: ((takeBars - 1) % 4) + 1 });
  });

  it("refuses a range across a round seam rather than guess", () => {
    expect(printedLoopBars(FOUR, 4, 5)).toEqual({ refused: "acrossRounds" });
    expect(printedLoopBars(FOUR, 2, 7)).toEqual({ refused: "acrossRounds" });
    expect(printedLoopBars(FOUR, 3, 6)).toEqual({ refused: "acrossRounds" });
  });

  it("refuses past the Take's last bar, before bar 1, and backwards", () => {
    expect(printedLoopBars(FOUR, takeBars + 1, takeBars + 1)).toEqual({ refused: "outsideTune" });
    expect(printedLoopBars(FOUR, 0, 2)).toEqual({ refused: "outsideTune" });
    expect(printedLoopBars(FOUR, 4, 3)).toEqual({ refused: "backwards" });
  });

  it("loopAsked: where the player is first, then the bars, then the loop", () => {
    const ready = atFocus();
    expect(loopAsked(IDLE, FOUR, 99, 1)).toEqual({ refused: "notHere" });
    expect(loopAsked(ready, FOUR, 4, 5)).toEqual({ refused: "acrossRounds" });
    expect(loopAsked(ready, FOUR, 7, 8)).toEqual(loopAt(ready, FOUR, 3, 4));
  });

  it("a variant that asks for more bars prints a longer Take: its bars are not outside the tune (lb1b L1)", () => {
    const longer = { ...FOUR.passBars[0], overBars: takeBars + 8 };
    const variant = {
      id: "long",
      tab: FOUR.tab,
      position: FOUR.position,
      crossing: FOUR.crossing,
      notes: FOUR.notes,
      rests: FOUR.rests,
      backing: FOUR.backing,
      computed: FOUR.computed,
      passBars: [longer],
    };
    const VARIED = { ...FOUR, variation: { ...FOUR.variation, variants: [variant] } } as unknown as Exercise;
    expect(takeBarsOf(VARIED)).toBe(takeBars);
    const bar = takeBars + 2;
    const asWritten = atFocus();
    expect(loopAsked(asWritten, VARIED, bar, bar)).toEqual({ refused: "outsideTune" });
    const played = run(atFocus(), { type: "setVariant", seed: 0 });
    const fold = ((bar - 1) % 4) + 1;
    expect(loopAsked(played, VARIED, bar, bar)).toEqual(loopAt(played, VARIED, fold, fold));
  });

  it("a one-bar Exercise: bar 1, and any Take bar, loop it; a range says it has one bar (lb1b L2)", () => {
    const ONE = { ...EX, bars: 1 };
    const ready = atFocus();
    expect(printedLoopBars(ONE, 1, 1)).toEqual({ fromBar: 1, toBar: 1 });
    expect(printedLoopBars(ONE, 3, 3)).toEqual({ fromBar: 1, toBar: 1 });
    expect(printedLoopBars(ONE, 1, 2)).toEqual({ refused: "oneBar" });
    expect(printedLoopBars(ONE, 2, 3)).toEqual({ refused: "oneBar" });
    expect(printedLoopBars(ONE, 2, 1)).toEqual({ refused: "backwards" });
    expect(printedLoopBars(ONE, 0, 1)).toEqual({ refused: "outsideTune" });
    expect(loopAsked(ready, ONE, 1, 1)).toEqual(loopAt(ready, ONE, 1, 1));
    expect(loopAsked(ready, ONE, 1, 2)).toEqual({ refused: "oneBar" });
  });
});

describe("the player's own exercise has no loop (t2eb, review M5)", () => {
  /** The same ready screen, its step one of My exercises (as "Add to today" plans it). */
  function own(state: RunState): RunState {
    const steps = state.plan!.steps.map((s, i) =>
      i === state.stepIndex && s.kind === "exercise" ? { ...s, pathId: OWN_EXERCISES_PATH_ID } : s,
    );
    return { ...state, plan: { ...state.plan!, steps } };
  }

  it("the id is the one My exercises plays under", () => {
    expect(OWN_EXERCISES_PATH_ID).toBe(MY_EXERCISES_PATH_ID);
    expect(OWN_EXERCISES_PATH_ID).toBe(CUSTOM_PATH_ID);
  });

  it("no Loop button where a Path's Exercise would get one", () => {
    const pathTake = take(atFocus(), "belowBar", SLIPPED);
    expect(loopOffer(pathTake, EX)).not.toBeNull();
    expect(loopOffer(own(pathTake), EX)).toBeNull();
    const notYet = take(atFocus(true), "ungraded", undefined, true);
    expect(loopOffer(own(notYet), EX, { notYetTwice: true })).toBeNull();
  });

  it("loop_bars is refused with its own reason, never proposed", () => {
    const ready = own(atFocus());
    expect(loopAt(ready, EX, 1, 1)).toEqual({ refused: "ownExercise" });
    expect(loopAsked(ready, EX, 1, 1)).toEqual({ refused: "ownExercise" });
    // Off an Exercise's screen, where the player is still comes first.
    expect(loopAsked(IDLE, EX, 1, 1)).toEqual({ refused: "notHere" });
  });
});

describe("loopBars", () => {
  it("the bar, or the bar and the neighbour that slipped with it", () => {
    expect(loopBars([3], 4)).toEqual({ fromBar: 3, toBar: 3 });
    expect(loopBars([2, 3], 4)).toEqual({ fromBar: 2, toBar: 3 });
    expect(loopBars([3, 2], 4)).toEqual({ fromBar: 2, toBar: 3 });
    expect(loopBars([1, 2, 3, 4], 4)).toEqual({ fromBar: 1, toBar: 2 });
    expect(loopBars([], 4)).toBeNull();
  });
});
