/**
 * The chain runtime is a state machine a player leaves running unattended,
 * so the tests are written against the rules rather than against the code:
 * U9.3's arming, U9.6's repeat counts, and the boundaries where a trigger
 * lands on the same downbeat that started the step.
 */
import { describe, expect, it } from "vitest";
import {
  chainReduce,
  IDLE_CHAIN_RUN,
  resolveNext,
  stepRemaining,
  triggerFired,
  type ChainEffect,
  type ChainEvent,
  type ChainRunState,
} from "./runtime";
import type { Chain, ChainStep, ChainTransition, ChainTrigger } from "../types";

// --- fixtures --------------------------------------------------------------

function step(
  name: string,
  trigger: ChainTrigger,
  transition: ChainTransition = { kind: "cut" },
): ChainStep {
  return {
    id: `s-${name}`,
    name,
    bpm: 100,
    subdivision: 1,
    beatGroups: [4],
    soundType: "click",
    volume: 0.8,
    trigger,
    transition,
  };
}

function chainOf(steps: ChainStep[], repeat = 1): Chain {
  return { id: "c1", name: "Warm-up", createdAt: 0, steps, repeat };
}

/**
 * A driver that plays a chain the way the engine would: `bar` bars of
 * `beatsPerBar`, one beat at a time, collecting every effect. Seconds run
 * from the beat clock so a `seconds` trigger can be exercised without
 * touching wall time.
 */
function play(
  chain: Chain,
  options: {
    beats: number;
    beatsPerBar?: number;
    secondsPerBeat?: number;
    /** Events injected before the beat of that index (0-based). */
    inject?: Record<number, ChainEvent>;
    startAtBeatInBar?: number;
  },
) {
  const beatsPerBar = options.beatsPerBar ?? 4;
  const secondsPerBeat = options.secondsPerBeat ?? 0.5;
  const log: { beat: number; state: ChainRunState; effects: ChainEffect[] }[] = [];
  const applied: number[] = [];

  let state = IDLE_CHAIN_RUN;
  const startResult = chainReduce(chain, state, { kind: "start", seconds: 0 });
  state = startResult.state;
  for (const e of startResult.effects) if (e.kind === "applyStep") applied.push(e.index);

  let position = options.startAtBeatInBar ?? 0;
  for (let i = 0; i < options.beats; i++) {
    const injected = options.inject?.[i];
    if (injected) state = chainReduce(chain, state, injected).state;
    const seconds = (i + 1) * secondsPerBeat;
    const isDownbeat = position % beatsPerBar === 0;
    const result = chainReduce(chain, state, { kind: "beat", isDownbeat, seconds });
    state = result.state;
    log.push({ beat: i, state, effects: result.effects });
    for (const e of result.effects) if (e.kind === "applyStep") applied.push(e.index);
    position += 1;
  }
  return { state, log, applied };
}

// --- triggers --------------------------------------------------------------

describe("triggerFired", () => {
  it("never fires on its own for a manual gap", () => {
    expect(triggerFired({ kind: "manual" }, 999, 999)).toBe(false);
  });

  it("fires once the bar count is reached, not before", () => {
    expect(triggerFired({ kind: "bars", bars: 4 }, 3, 0)).toBe(false);
    expect(triggerFired({ kind: "bars", bars: 4 }, 4, 0)).toBe(true);
    expect(triggerFired({ kind: "bars", bars: 4 }, 5, 0)).toBe(true);
  });

  it("fires once the seconds are reached, not before", () => {
    expect(triggerFired({ kind: "seconds", seconds: 30 }, 0, 29.9)).toBe(false);
    expect(triggerFired({ kind: "seconds", seconds: 30 }, 0, 30)).toBe(true);
  });

  it("treats a zero or nonsense count as a gap that never comes due", () => {
    // A `bars: 0` step would switch on its own first downbeat and then on
    // the next, running a whole chain through itself inside one bar.
    expect(triggerFired({ kind: "bars", bars: 0 }, 0, 0)).toBe(false);
    expect(triggerFired({ kind: "bars", bars: -2 }, 10, 0)).toBe(false);
    expect(triggerFired({ kind: "bars", bars: NaN }, 10, 0)).toBe(false);
    expect(triggerFired({ kind: "seconds", seconds: 0 }, 0, 5)).toBe(false);
    expect(triggerFired({ kind: "seconds", seconds: Infinity }, 0, 1e9)).toBe(false);
  });
});

// --- repeat ----------------------------------------------------------------

describe("resolveNext", () => {
  const three = chainOf([
    step("a", { kind: "bars", bars: 1 }),
    step("b", { kind: "bars", bars: 1 }),
    step("c", { kind: "bars", bars: 1 }),
  ]);

  it("walks forward within a pass", () => {
    expect(resolveNext(three, 0, 0)).toEqual({ kind: "step", index: 1, pass: 0 });
    expect(resolveNext(three, 1, 0)).toEqual({ kind: "step", index: 2, pass: 0 });
  });

  it("ends after the last step when repeat is once through", () => {
    expect(resolveNext(three, 2, 0)).toEqual({ kind: "end" });
  });

  it("wraps N-1 times for repeat N", () => {
    const twice = { ...three, repeat: 2 };
    expect(resolveNext(twice, 2, 0)).toEqual({ kind: "step", index: 0, pass: 1 });
    expect(resolveNext(twice, 2, 1)).toEqual({ kind: "end" });
  });

  it("never ends when repeat is 0", () => {
    const forever = { ...three, repeat: 0 };
    for (const pass of [0, 1, 7, 1000]) {
      expect(resolveNext(forever, 2, pass)).toEqual({ kind: "step", index: 0, pass: pass + 1 });
    }
  });

  it("ends immediately for a chain with no steps", () => {
    expect(resolveNext(chainOf([], 0), 0, 0)).toEqual({ kind: "end" });
  });

  it("reads a negative repeat as once through rather than as no passes at all", () => {
    expect(resolveNext({ ...three, repeat: -3 }, 2, 0)).toEqual({ kind: "end" });
  });

  it("runs every step of every pass, for many shapes of chain", () => {
    // Property-style: for 1..8 steps and 1..4 passes, the number of steps
    // actually entered is exactly steps × passes, in order, with no step
    // skipped and none run twice in a row.
    for (let count = 1; count <= 8; count++) {
      for (let repeat = 1; repeat <= 4; repeat++) {
        const steps = Array.from({ length: count }, (_, i) =>
          step(`s${i}`, { kind: "bars", bars: 1 }),
        );
        const chain = chainOf(steps, repeat);
        // One bar per step, plus a tail of bars to prove it stays stopped.
        const { applied, state } = play(chain, { beats: (count * repeat + 4) * 4 });
        const expected = Array.from({ length: count * repeat }, (_, i) => i % count);
        expect(applied, `${count} steps × ${repeat}`).toEqual(expected);
        expect(state.phase).toBe("finished");
      }
    }
  });
});

// --- U9.3, the arming rule -------------------------------------------------

describe("the switch arms and lands on a downbeat (U9.3)", () => {
  it("does not switch mid-bar when a seconds trigger fires", () => {
    // 4/4 at 0.5 s a beat. The step's clock starts at its own downbeat, so
    // the gap comes due 1.5 s in — the last beat of bar 1, and the switch
    // must wait for the downbeat of bar 2.
    const chain = chainOf([
      step("a", { kind: "seconds", seconds: 1.2 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(chain, { beats: 8, secondsPerBeat: 0.5 });

    expect(log[2].state.phase).toBe("running"); // 1.0 s in, not yet due
    expect(log[3].state.phase).toBe("armed");
    expect(log[3].state.stepIndex).toBe(0); // still playing step a
    expect(log[3].effects).toEqual([]);
    // Beat index 4 is the downbeat of bar 2. The switch lands there.
    expect(log[4].state.phase).toBe("switching");
    expect(log[4].state.stepIndex).toBe(1);
    expect(log[4].effects).toEqual([{ kind: "applyStep", index: 1, step: chain.steps[1] }]);
  });

  it("switches on the very downbeat a bars trigger comes due, not a bar later", () => {
    const chain = chainOf([
      step("a", { kind: "bars", bars: 2 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(chain, { beats: 12 });
    // Beat 0 anchors bar 1. Beats 4 and 8 are the next two downbeats, so
    // two bars have elapsed at beat 8 and the switch is due there.
    expect(log[4].state.barsInStep).toBe(1);
    expect(log[7].state.stepIndex).toBe(0);
    expect(log[8].state.stepIndex).toBe(1);
    expect(log[8].state.phase).toBe("switching");
  });

  it("holds a manual advance until the next downbeat", () => {
    const chain = chainOf([step("a", { kind: "manual" }), step("b", { kind: "manual" })]);
    // Pressed on beat 2 of bar 1 (index 1).
    const { log } = play(chain, { beats: 8, inject: { 1: { kind: "advance" } } });
    expect(log[1].state.phase).toBe("armed");
    expect(log[2].state.phase).toBe("armed");
    expect(log[3].state.phase).toBe("armed");
    expect(log[4].state.stepIndex).toBe(1);
  });

  it("lands the advance on the first downbeat even when it is pressed before one", () => {
    // The chain was loaded mid-bar and skipped before bar one ever started.
    const chain = chainOf([step("a", { kind: "manual" }), step("b", { kind: "manual" })]);
    const { log } = play(chain, {
      beats: 6,
      startAtBeatInBar: 2,
      inject: { 0: { kind: "advance" } },
    });
    expect(log[0].state.phase).toBe("armed");
    expect(log[1].state.phase).toBe("armed");
    expect(log[2].state.stepIndex).toBe(1); // the downbeat two beats later
  });

  it("does not arm twice, and a second press does not skip two steps", () => {
    const chain = chainOf([
      step("a", { kind: "manual" }),
      step("b", { kind: "manual" }),
      step("c", { kind: "manual" }),
    ]);
    const { applied } = play(chain, {
      beats: 8,
      inject: { 1: { kind: "advance" }, 2: { kind: "advance" } },
    });
    expect(applied).toEqual([0, 1]);
  });

  it("`switching` lasts exactly one event, then the step is simply running", () => {
    const chain = chainOf([
      step("a", { kind: "bars", bars: 1 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(chain, { beats: 8 });
    expect(log[4].state.phase).toBe("switching");
    expect(log[5].state.phase).toBe("running");
  });
});

// --- the shape of a step's own clock ---------------------------------------

describe("a step's bars and seconds start at its own downbeat", () => {
  it("does not count the half bar a chain was started in", () => {
    // Started two beats into a 4/4 bar: the first downbeat is bar one, and
    // a 1-bar gap must last a whole bar from there.
    const chain = chainOf([
      step("a", { kind: "bars", bars: 1 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(chain, { beats: 8, startAtBeatInBar: 2 });
    expect(log[1].state.anchored).toBe(false);
    expect(log[2].state.anchored).toBe(true); // the downbeat two beats in
    expect(log[2].state.barsInStep).toBe(0);
    expect(log[5].state.stepIndex).toBe(0); // still bar one of step a
    expect(log[6].state.stepIndex).toBe(1); // the next downbeat, one bar later
  });

  it("gives the second step a full bar too", () => {
    const chain = chainOf([
      step("a", { kind: "bars", bars: 1 }),
      step("b", { kind: "bars", bars: 1 }),
      step("c", { kind: "manual" }),
    ]);
    const { log } = play(chain, { beats: 16 });
    expect(log[4].state.stepIndex).toBe(1);
    expect(log[4].state.barsInStep).toBe(0);
    expect(log[7].state.stepIndex).toBe(1);
    expect(log[8].state.stepIndex).toBe(2);
  });

  it("restarts the seconds clock at each step", () => {
    const chain = chainOf([
      step("a", { kind: "seconds", seconds: 2 }),
      step("b", { kind: "seconds", seconds: 2 }),
      step("c", { kind: "manual" }),
    ]);
    const { log } = play(chain, { beats: 24, secondsPerBeat: 0.5 });
    const enters = log.filter((l) => l.state.phase === "switching");
    for (const entry of enters) expect(entry.state.secondsInStep).toBe(0);
    expect(log[log.length - 1].state.stepIndex).toBe(2);
  });
});

// --- ending (U9.6) ---------------------------------------------------------

describe("a chain ends", () => {
  it("stops after the last step rather than hanging on it", () => {
    const chain = chainOf([
      step("a", { kind: "bars", bars: 1 }),
      step("b", { kind: "bars", bars: 1 }),
    ]);
    const { log, state } = play(chain, { beats: 16 });
    const finish = log.find((l) => l.effects.some((e) => e.kind === "finished"));
    expect(finish).toBeDefined();
    expect(state.phase).toBe("finished");
  });

  it("waits for the downbeat to end, too", () => {
    const chain = chainOf([step("a", { kind: "seconds", seconds: 1.2 })]);
    const { log } = play(chain, { beats: 8, secondsPerBeat: 0.5 });
    expect(log[2].state.phase).toBe("running");
    expect(log[3].state.phase).toBe("armed"); // due at 1.5 s, mid-bar
    expect(log[4].state.phase).toBe("finished");
    expect(log[4].effects).toEqual([{ kind: "finished" }]);
  });

  it("ignores everything after it has finished", () => {
    const chain = chainOf([step("a", { kind: "bars", bars: 1 })]);
    const { state } = play(chain, { beats: 20, inject: { 12: { kind: "advance" } } });
    expect(state.phase).toBe("finished");
    expect(state.stepIndex).toBe(0);
  });

  it("finishes a chain with no steps at once instead of running an empty routine", () => {
    const result = chainReduce(chainOf([]), IDLE_CHAIN_RUN, { kind: "start", seconds: 0 });
    expect(result.state.phase).toBe("finished");
    expect(result.effects).toEqual([{ kind: "finished" }]);
  });

  it("runs a chain of one step, once", () => {
    const chain = chainOf([step("only", { kind: "bars", bars: 2 })]);
    const { applied, log } = play(chain, { beats: 20 });
    expect(applied).toEqual([0]);
    expect(log[8].state.phase).toBe("finished");
  });

  it("loops a chain of one step forever when repeat is 0", () => {
    const chain = chainOf([step("only", { kind: "bars", bars: 1 })], 0);
    const { applied, state } = play(chain, { beats: 40 });
    expect(applied.length).toBeGreaterThan(8);
    expect(applied.every((i) => i === 0)).toBe(true);
    expect(state.phase).not.toBe("finished");
    expect(state.pass).toBeGreaterThan(8);
  });

  it("a manual last step waits for the player instead of stopping", () => {
    const chain = chainOf([
      step("a", { kind: "bars", bars: 1 }),
      step("b", { kind: "manual" }),
    ]);
    const { state } = play(chain, { beats: 40 });
    expect(state.stepIndex).toBe(1);
    expect(state.phase).toBe("running");
  });
});

// --- transitions -----------------------------------------------------------

describe("transitions", () => {
  it("rests the bars it was given before the next step arrives", () => {
    const chain = chainOf([
      step("a", { kind: "bars", bars: 1 }, { kind: "rest", bars: 2 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(chain, { beats: 20 });
    // Bar one ends at beat 4; two bars of rest, so step b starts at beat 12.
    expect(log[4].state.phase).toBe("resting");
    expect(log[4].effects).toEqual([{ kind: "rest", bars: 2 }]);
    expect(log[8].state.phase).toBe("resting");
    expect(log[11].state.stepIndex).toBe(0);
    expect(log[12].state.stepIndex).toBe(1);
    expect(log[12].effects).toEqual([{ kind: "applyStep", index: 1, step: chain.steps[1] }]);
  });

  it("does not let a skip cut a rest short", () => {
    const chain = chainOf([
      step("a", { kind: "bars", bars: 1 }, { kind: "rest", bars: 2 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(chain, { beats: 16, inject: { 6: { kind: "advance" } } });
    expect(log[6].state.phase).toBe("resting");
    expect(log[12].state.stepIndex).toBe(1);
  });

  it("treats countIn as a cut for now (U9.5)", () => {
    const cut = chainOf([
      step("a", { kind: "bars", bars: 1 }, { kind: "cut" }),
      step("b", { kind: "manual" }),
    ]);
    const counted = chainOf([
      step("a", { kind: "bars", bars: 1 }, { kind: "countIn", bars: 2 }),
      step("b", { kind: "manual" }),
    ]);
    const a = play(cut, { beats: 12 });
    const b = play(counted, { beats: 12 });
    expect(b.log.map((l) => l.state.stepIndex)).toEqual(a.log.map((l) => l.state.stepIndex));
  });

  it("treats a rest of zero bars as a cut", () => {
    const chain = chainOf([
      step("a", { kind: "bars", bars: 1 }, { kind: "rest", bars: 0 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(chain, { beats: 8 });
    expect(log[4].state.stepIndex).toBe(1);
  });
});

// --- the transport's numbers (U9.7) ----------------------------------------

describe("stepRemaining", () => {
  const chain = chainOf([
    step("a", { kind: "bars", bars: 4 }),
    step("b", { kind: "seconds", seconds: 30 }),
    step("c", { kind: "manual" }),
  ]);

  it("says nothing while idle or finished", () => {
    expect(stepRemaining(chain, IDLE_CHAIN_RUN)).toBeNull();
    expect(stepRemaining(chain, { ...IDLE_CHAIN_RUN, phase: "finished" })).toBeNull();
  });

  it("counts bars down", () => {
    const { log } = play(chain, { beats: 9 });
    expect(stepRemaining(chain, log[0].state)).toEqual({ kind: "bars", bars: 4 });
    expect(stepRemaining(chain, log[4].state)).toEqual({ kind: "bars", bars: 3 });
    expect(stepRemaining(chain, log[8].state)).toEqual({ kind: "bars", bars: 2 });
  });

  it("counts seconds down, and will take a live reading between beats", () => {
    const state: ChainRunState = {
      ...IDLE_CHAIN_RUN,
      phase: "running",
      stepIndex: 1,
      anchored: true,
      secondsInStep: 10,
    };
    expect(stepRemaining(chain, state)).toEqual({ kind: "seconds", seconds: 20 });
    expect(stepRemaining(chain, state, 12.5)).toEqual({ kind: "seconds", seconds: 17.5 });
  });

  it("never counts below zero", () => {
    const state: ChainRunState = {
      ...IDLE_CHAIN_RUN,
      phase: "running",
      stepIndex: 1,
      anchored: true,
      secondsInStep: 45,
    };
    expect(stepRemaining(chain, state)).toEqual({ kind: "seconds", seconds: 0 });
  });

  it("says manual for a gap that waits on the player", () => {
    const state: ChainRunState = { ...IDLE_CHAIN_RUN, phase: "running", stepIndex: 2 };
    expect(stepRemaining(chain, state)).toEqual({ kind: "manual" });
  });

  it("reads zero once the switch is armed", () => {
    const state: ChainRunState = { ...IDLE_CHAIN_RUN, phase: "armed", stepIndex: 0 };
    expect(stepRemaining(chain, state)).toEqual({ kind: "bars", bars: 0 });
  });
});

// --- edits under a running chain -------------------------------------------

describe("a chain edited while it runs", () => {
  it("stops rather than guessing when the pending step is gone", () => {
    const chain = chainOf([
      step("a", { kind: "manual" }),
      step("b", { kind: "manual" }),
    ]);
    let state = chainReduce(chain, IDLE_CHAIN_RUN, { kind: "start", seconds: 0 }).state;
    state = chainReduce(chain, state, { kind: "beat", isDownbeat: true, seconds: 0.5 }).state;
    state = chainReduce(chain, state, { kind: "advance" }).state;
    const shortened = chainOf([chain.steps[0]]);
    const landed = chainReduce(shortened, state, {
      kind: "beat",
      isDownbeat: true,
      seconds: 2.5,
    });
    expect(landed.state.phase).toBe("finished");
    expect(landed.effects).toEqual([{ kind: "finished" }]);
  });

  it("stops clean and forgets where it was", () => {
    const chain = chainOf([step("a", { kind: "bars", bars: 1 }), step("b", { kind: "manual" })]);
    const { state } = play(chain, { beats: 6 });
    const stopped = chainReduce(chain, state, { kind: "stop" });
    expect(stopped.state).toEqual(IDLE_CHAIN_RUN);
    expect(stopped.effects).toEqual([]);
    // And a beat arriving after the stop changes nothing.
    expect(
      chainReduce(chain, stopped.state, { kind: "beat", isDownbeat: true, seconds: 9 }).state,
    ).toEqual(IDLE_CHAIN_RUN);
  });
});
