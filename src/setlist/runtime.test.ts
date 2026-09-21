/**
 * The setlist runtime is a state machine a player leaves running unattended,
 * so the tests are written against the rules rather than against the code:
 * U9.3's arming, U9.6's repeat counts, and the boundaries where a trigger
 * lands on the same bar line that started the step.
 *
 * `play` below drives the reducer with ticks shaped the way `engine.rs` emits
 * them — a bar-local `measureBeat` that cycles and wraps, and subdivisions
 * that share a beat — and works `barStart` out of them exactly as
 * `useSetlistRunner` does. It used to hand the reducer
 * `position % beatsPerBar === 0` under the name `isDownbeat`, which is a
 * contract no engine supplies: the engine's `isDownbeat` is `sub == 0`, true
 * on EVERY whole beat. That is why a green suite sat over a setlist whose
 * "after 8 bars" moved on after 8 beats.
 */
import { describe, expect, it } from "vitest";
import {
  setlistReduce,
  IDLE_SETLIST_RUN,
  resolveNext,
  stepRemaining,
  triggerFired,
  type SetlistEffect,
  type SetlistEvent,
  type SetlistRunState,
} from "./runtime";
import type { Setlist, SetlistStep, SetlistTransition, SetlistTrigger } from "../types";

// --- fixtures --------------------------------------------------------------

function step(
  name: string,
  trigger: SetlistTrigger,
  transition: SetlistTransition = { kind: "cut" },
): SetlistStep {
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

function setlistOf(steps: SetlistStep[], repeat = 1): Setlist {
  return { id: "c1", name: "Warm-up", createdAt: 0, steps, repeat };
}

/**
 * One tick as `engine.rs` emits it: bar-local position, which subdivision of
 * the beat it is, and the engine's own `isDownbeat` — `sub == 0`, "a whole
 * beat and not a subdivision", which is true on EVERY beat of the bar.
 */
type EngineTick = { measureBeat: number; subdivision: number; isDownbeat: boolean };

/**
 * What `useSetlistRunner` makes of one engine tick, written out here so the
 * runtime's tests and the hook cannot drift apart.
 *
 * Subdivision ticks are not beats and are dropped; a bar opens on the pair
 * the engine itself tests when it opens one.
 */
function fromEngine(tick: EngineTick, seconds: number): SetlistEvent | null {
  if (tick.subdivision !== 0) return null;
  return { kind: "beat", barStart: tick.isDownbeat && tick.measureBeat === 0, seconds };
}

/**
 * A driver that plays a setlist the way the engine plays one: `beats` whole
 * beats of a bar `beatsPerBar` long, each split into `subdivisions` ticks,
 * collecting every effect. `measureBeat` cycles and wraps exactly as the
 * engine wraps it, so "which tick opens a bar" is a fact of the stream rather
 * than something the test asserts by hand. Seconds run from the beat clock so
 * a `seconds` trigger can be exercised without touching wall time.
 *
 * The log has one entry per WHOLE beat, because that is what reaches the
 * reducer; a beat's subdivision ticks are generated and dropped, which is the
 * point of generating them.
 */
function play(
  setlist: Setlist,
  options: {
    beats: number;
    beatsPerBar?: number;
    secondsPerBeat?: number;
    /** Ticks per beat. 1 is no subdivision; 4 is sixteenths on a quarter. */
    subdivisions?: number;
    /** Events injected before the beat of that index (0-based). */
    inject?: Record<number, SetlistEvent>;
    startAtBeatInBar?: number;
  },
) {
  const beatsPerBar = options.beatsPerBar ?? 4;
  const subdivisions = options.subdivisions ?? 1;
  const secondsPerBeat = options.secondsPerBeat ?? 0.5;
  const log: { beat: number; state: SetlistRunState; effects: SetlistEffect[] }[] = [];
  const applied: number[] = [];

  let state = IDLE_SETLIST_RUN;
  const startResult = setlistReduce(setlist, state, { kind: "start", seconds: 0 });
  state = startResult.state;
  for (const e of startResult.effects) if (e.kind === "applyStep") applied.push(e.index);

  let measureBeat = (options.startAtBeatInBar ?? 0) % beatsPerBar;
  for (let i = 0; i < options.beats; i++) {
    const injected = options.inject?.[i];
    if (injected) state = setlistReduce(setlist, state, injected).state;
    let effects: SetlistEffect[] = [];
    for (let sub = 0; sub < subdivisions; sub++) {
      // Seconds are wall time, so a subdivision tick is not free: the beat's
      // own tick opens it and the rest fall inside it.
      const seconds = (i + sub / subdivisions + 1) * secondsPerBeat;
      const event = fromEngine({ measureBeat, subdivision: sub, isDownbeat: sub === 0 }, seconds);
      if (!event) continue;
      const result = setlistReduce(setlist, state, event);
      state = result.state;
      effects = result.effects;
    }
    log.push({ beat: i, state, effects });
    for (const e of effects) if (e.kind === "applyStep") applied.push(e.index);
    measureBeat = (measureBeat + 1) % beatsPerBar;
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
    // A `bars: 0` step would switch on its own first bar line and then on
    // the next, running a whole setlist through itself inside one bar.
    expect(triggerFired({ kind: "bars", bars: 0 }, 0, 0)).toBe(false);
    expect(triggerFired({ kind: "bars", bars: -2 }, 10, 0)).toBe(false);
    expect(triggerFired({ kind: "bars", bars: NaN }, 10, 0)).toBe(false);
    expect(triggerFired({ kind: "seconds", seconds: 0 }, 0, 5)).toBe(false);
    expect(triggerFired({ kind: "seconds", seconds: Infinity }, 0, 1e9)).toBe(false);
  });
});

// --- repeat ----------------------------------------------------------------

describe("resolveNext", () => {
  const three = setlistOf([
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

  it("ends immediately for a setlist with no steps", () => {
    expect(resolveNext(setlistOf([], 0), 0, 0)).toEqual({ kind: "end" });
  });

  it("reads a negative repeat as once through rather than as no passes at all", () => {
    expect(resolveNext({ ...three, repeat: -3 }, 2, 0)).toEqual({ kind: "end" });
  });

  it("runs every step of every pass, for many shapes of setlist", () => {
    // Property-style: for 1..8 steps and 1..4 passes, the number of steps
    // actually entered is exactly steps × passes, in order, with no step
    // skipped and none run twice in a row.
    for (let count = 1; count <= 8; count++) {
      for (let repeat = 1; repeat <= 4; repeat++) {
        const steps = Array.from({ length: count }, (_, i) =>
          step(`s${i}`, { kind: "bars", bars: 1 }),
        );
        const setlist = setlistOf(steps, repeat);
        // One bar per step, plus a tail of bars to prove it stays stopped.
        const { applied, state } = play(setlist, { beats: (count * repeat + 4) * 4 });
        const expected = Array.from({ length: count * repeat }, (_, i) => i % count);
        expect(applied, `${count} steps × ${repeat}`).toEqual(expected);
        expect(state.phase).toBe("finished");
      }
    }
  });
});

// --- U9.3, the arming rule -------------------------------------------------

describe("the switch arms and lands on a bar line (U9.3)", () => {
  it("does not switch mid-bar when a seconds trigger fires", () => {
    // 4/4 at 0.5 s a beat. The step's clock starts at its own bar line, so
    // the gap comes due 1.5 s in — the last beat of bar 1, and the switch
    // must wait for the bar line of bar 2.
    const setlist = setlistOf([
      step("a", { kind: "seconds", seconds: 1.2 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(setlist, { beats: 8, secondsPerBeat: 0.5 });

    expect(log[2].state.phase).toBe("running"); // 1.0 s in, not yet due
    expect(log[3].state.phase).toBe("armed");
    expect(log[3].state.stepIndex).toBe(0); // still playing step a
    expect(log[3].effects).toEqual([]);
    // Beat index 4 opens bar 2. The switch lands there.
    expect(log[4].state.phase).toBe("switching");
    expect(log[4].state.stepIndex).toBe(1);
    expect(log[4].effects).toEqual([{ kind: "applyStep", index: 1, step: setlist.steps[1] }]);
  });

  it("switches on the very bar line a bars trigger comes due, not a bar later", () => {
    const setlist = setlistOf([
      step("a", { kind: "bars", bars: 2 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(setlist, { beats: 12 });
    // Beat 0 anchors bar 1. Beats 4 and 8 are the next two bar lines, so
    // two bars have elapsed at beat 8 and the switch is due there.
    expect(log[4].state.barsInStep).toBe(1);
    expect(log[7].state.stepIndex).toBe(0);
    expect(log[8].state.stepIndex).toBe(1);
    expect(log[8].state.phase).toBe("switching");
  });

  it("holds a manual advance until the next bar line", () => {
    const setlist = setlistOf([step("a", { kind: "manual" }), step("b", { kind: "manual" })]);
    // Pressed on beat 2 of bar 1 (index 1).
    const { log } = play(setlist, { beats: 8, inject: { 1: { kind: "advance" } } });
    expect(log[1].state.phase).toBe("armed");
    expect(log[2].state.phase).toBe("armed");
    expect(log[3].state.phase).toBe("armed");
    expect(log[4].state.stepIndex).toBe(1);
  });

  it("lands the advance on the first bar line even when it is pressed before one", () => {
    // The setlist was loaded mid-bar and skipped before bar one ever started.
    const setlist = setlistOf([step("a", { kind: "manual" }), step("b", { kind: "manual" })]);
    const { log } = play(setlist, {
      beats: 6,
      startAtBeatInBar: 2,
      inject: { 0: { kind: "advance" } },
    });
    expect(log[0].state.phase).toBe("armed");
    expect(log[1].state.phase).toBe("armed");
    expect(log[2].state.stepIndex).toBe(1); // the bar line two beats later
  });

  it("does not arm twice, and a second press does not skip two steps", () => {
    const setlist = setlistOf([
      step("a", { kind: "manual" }),
      step("b", { kind: "manual" }),
      step("c", { kind: "manual" }),
    ]);
    const { applied } = play(setlist, {
      beats: 8,
      inject: { 1: { kind: "advance" }, 2: { kind: "advance" } },
    });
    expect(applied).toEqual([0, 1]);
  });

  it("`switching` lasts exactly one event, then the step is simply running", () => {
    const setlist = setlistOf([
      step("a", { kind: "bars", bars: 1 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(setlist, { beats: 8 });
    expect(log[4].state.phase).toBe("switching");
    expect(log[5].state.phase).toBe("running");
  });
});

// --- the shape of a step's own clock ---------------------------------------

describe("a step's bars and seconds start at its own bar line", () => {
  it("does not count the half bar a setlist was started in", () => {
    // Started two beats into a 4/4 bar: the first bar line is bar one, and
    // a 1-bar gap must last a whole bar from there.
    const setlist = setlistOf([
      step("a", { kind: "bars", bars: 1 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(setlist, { beats: 8, startAtBeatInBar: 2 });
    expect(log[1].state.anchored).toBe(false);
    expect(log[2].state.anchored).toBe(true); // the bar line two beats in
    expect(log[2].state.barsInStep).toBe(0);
    expect(log[5].state.stepIndex).toBe(0); // still bar one of step a
    expect(log[6].state.stepIndex).toBe(1); // the next bar line, one bar later
  });

  it("gives the second step a full bar too", () => {
    const setlist = setlistOf([
      step("a", { kind: "bars", bars: 1 }),
      step("b", { kind: "bars", bars: 1 }),
      step("c", { kind: "manual" }),
    ]);
    const { log } = play(setlist, { beats: 16 });
    expect(log[4].state.stepIndex).toBe(1);
    expect(log[4].state.barsInStep).toBe(0);
    expect(log[7].state.stepIndex).toBe(1);
    expect(log[8].state.stepIndex).toBe(2);
  });

  it("restarts the seconds clock at each step", () => {
    const setlist = setlistOf([
      step("a", { kind: "seconds", seconds: 2 }),
      step("b", { kind: "seconds", seconds: 2 }),
      step("c", { kind: "manual" }),
    ]);
    const { log } = play(setlist, { beats: 24, secondsPerBeat: 0.5 });
    const enters = log.filter((l) => l.state.phase === "switching");
    for (const entry of enters) expect(entry.state.secondsInStep).toBe(0);
    expect(log[log.length - 1].state.stepIndex).toBe(2);
  });
});

// --- a bar is a bar ---------------------------------------------------------

describe("a bar is a bar, and never a beat", () => {
  /*
   * The defect this file was rewritten around. The beat event carried the
   * engine's `isDownbeat` — `sub == 0`, true on EVERY whole beat — under a
   * name the reducer read as a bar line, so "after 8 bars" moved on after 8
   * beats, two bars of rest were two beats of it, and an armed switch landed
   * on the next beat instead of at the top of the bar U9.3 exists to protect.
   * A musician who typed 32 into a 4/4 step to get eight bars was not wrong
   * about the arithmetic.
   */
  const meters: [name: string, beatsPerBar: number][] = [
    ["4/4", 4],
    ["3/4", 3],
    ["7/8 grouped 2+2+3", 7],
    ["a FREE bar of one beat", 1],
  ];

  for (const [name, beatsPerBar] of meters) {
    it(`gives a step of eight bars eight whole bars of ${name}`, () => {
      const setlist = setlistOf([
        step("a", { kind: "bars", bars: 8 }),
        step("b", { kind: "manual" }),
      ]);
      const switchAt = 8 * beatsPerBar;
      const { log } = play(setlist, { beats: switchAt + beatsPerBar + 2, beatsPerBar });

      // Eight BEATS in, a step of eight bars is still playing — unless the
      // bar really is one beat long, where eight beats is the honest answer.
      if (beatsPerBar > 1) expect(log[8].state.stepIndex, "eight beats in").toBe(0);
      expect(log[switchAt - 1].state.stepIndex, "the beat before").toBe(0);
      expect(log[switchAt - 1].state.barsInStep).toBe(7);
      expect(log[switchAt].state.stepIndex, "the eighth bar line").toBe(1);
      expect(log[switchAt].state.phase).toBe("switching");
    });
  }

  it("counts the same with sixteenths running underneath", () => {
    // Four ticks to the beat, sixteen to the bar, and not one of them is a
    // bar: a drill of sixteenths used to read a bar of 4/4 as sixteen.
    const setlist = setlistOf([
      step("a", { kind: "bars", bars: 2 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(setlist, { beats: 12, subdivisions: 4 });
    expect(log[7].state.stepIndex).toBe(0);
    expect(log[8].state.stepIndex).toBe(1);
    expect(log[8].state.barsInStep).toBe(0);
  });

  it("rests bars, not beats", () => {
    // 3/4. Bar one of step a ends at beat 3; two bars of rest are six beats,
    // so step b begins at beat 9 — not at beat 5, where two rest BEATS end.
    const setlist = setlistOf([
      step("a", { kind: "bars", bars: 1 }, { kind: "rest", bars: 2 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(setlist, { beats: 14, beatsPerBar: 3 });
    expect(log[3].state.phase).toBe("resting");
    expect(log[3].effects).toEqual([{ kind: "rest", bars: 2 }]);
    expect(log[5].state.phase).toBe("resting");
    expect(log[8].state.stepIndex).toBe(0);
    expect(log[9].state.stepIndex).toBe(1);
  });

  it("holds an armed switch for the rest of the bar, however long the bar is", () => {
    // 7/8. Skip pressed on the third beat of bar two: the switch waits the
    // five beats left of that bar. It used to land on the very next one,
    // which is the cut-in-half bar U9.3 was written to prevent.
    const setlist = setlistOf([step("a", { kind: "manual" }), step("b", { kind: "manual" })]);
    const { log } = play(setlist, {
      beats: 20,
      beatsPerBar: 7,
      inject: { 9: { kind: "advance" } },
    });
    for (let i = 9; i < 14; i++) {
      expect(log[i].state.phase, `beat ${i}`).toBe("armed");
      expect(log[i].state.stepIndex, `beat ${i}`).toBe(0);
    }
    expect(log[14].state.stepIndex).toBe(1);
    expect(log[14].effects).toEqual([{ kind: "applyStep", index: 1, step: setlist.steps[1] }]);
  });

  it("counts a seconds gap in seconds and hands the switch a bar line", () => {
    // Minutes-based triggers are untouched by any of this: the gap still comes
    // due on wall time, and bars only decide where it lands. 7/8 at half a
    // second a beat, and the step's clock starts at its own bar line — so the
    // gap comes due on the sixth beat and waits the rest of the bar out.
    const setlist = setlistOf([
      step("a", { kind: "seconds", seconds: 2.2 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(setlist, { beats: 16, beatsPerBar: 7, secondsPerBeat: 0.5 });
    expect(log[4].state.phase).toBe("running"); // 2.0 s in, not yet due
    expect(log[5].state.phase).toBe("armed"); // 2.5 s
    expect(log[6].state.phase).toBe("armed");
    expect(log[6].state.stepIndex).toBe(0);
    expect(log[7].state.stepIndex).toBe(1); // the top of bar two
  });

  it("counts a step's bars on its own meter, not on the one before it", () => {
    /*
     * A 7/8 step after a 4/4 one, with the stream `engine.rs` really emits
     * across that seam — and the seam is the point.
     *
     * The switch is posted ON the bar line it lands on, and the config only
     * leaves the UI once that tick has already sounded. The engine used to
     * restack its grid at the very next tick, so the seam bar was ONE BEAT
     * long: two accents a beat apart, and the arriving step's bar one spent
     * on a bar nobody played. It holds the meter now and gives it to the bar
     * that line opened (`held_meter_due`), so the last bar of the 4/4 step is
     * four beats, the first bar of the 7/8 step is seven, and there is no bar
     * between them.
     */
    const setlist = setlistOf([
      step("four", { kind: "bars", bars: 1 }),
      step("seven", { kind: "bars", bars: 3 }),
      step("after", { kind: "manual" }),
    ]);
    // Written as the bars the player hears rather than as a list of
    // positions, so a stub bar cannot be typed in here by accident: one bar
    // of four, then bars of seven from the switch onwards.
    const bars = [4, 7, 7, 7, 7];
    const measureBeats = bars.flatMap((n) => Array.from({ length: n }, (_, i) => i));
    let state = setlistReduce(setlist, IDLE_SETLIST_RUN, { kind: "start", seconds: 0 }).state;
    const stepAt: number[] = [];
    measureBeats.forEach((measureBeat, i) => {
      const event = fromEngine({ measureBeat, subdivision: 0, isDownbeat: true }, (i + 1) * 0.5);
      state = setlistReduce(setlist, state, event!).state;
      stepAt.push(state.stepIndex);
    });

    // Bar lines at 0, 4, 11, 18 and 25. The switch lands on the 4/4 step's
    // second bar line, which is the 7/8 step's bar one — so the 7/8 step
    // counts sevens from there and its third bar ends at beat 25.
    expect(stepAt[3]).toBe(0);
    expect(stepAt[4]).toBe(1);
    expect(stepAt[11]).toBe(1); // where a bar of FOUR would have ended it
    expect(stepAt[24]).toBe(1);
    expect(stepAt[25]).toBe(2);
    // Three bars of seven, all of them played: the step arriving is not a
    // bar short, and none of its bars is the one-beat one.
    expect(measureBeats.slice(4, 25).filter((b) => b === 0)).toHaveLength(3);
  });
});

// --- ending (U9.6) ---------------------------------------------------------

describe("a setlist ends", () => {
  it("stops after the last step rather than hanging on it", () => {
    const setlist = setlistOf([
      step("a", { kind: "bars", bars: 1 }),
      step("b", { kind: "bars", bars: 1 }),
    ]);
    const { log, state } = play(setlist, { beats: 16 });
    const finish = log.find((l) => l.effects.some((e) => e.kind === "finished"));
    expect(finish).toBeDefined();
    expect(state.phase).toBe("finished");
  });

  it("waits for the bar line to end, too", () => {
    const setlist = setlistOf([step("a", { kind: "seconds", seconds: 1.2 })]);
    const { log } = play(setlist, { beats: 8, secondsPerBeat: 0.5 });
    expect(log[2].state.phase).toBe("running");
    expect(log[3].state.phase).toBe("armed"); // due at 1.5 s, mid-bar
    expect(log[4].state.phase).toBe("finished");
    expect(log[4].effects).toEqual([{ kind: "finished" }]);
  });

  it("ignores everything after it has finished", () => {
    const setlist = setlistOf([step("a", { kind: "bars", bars: 1 })]);
    const { state } = play(setlist, { beats: 20, inject: { 12: { kind: "advance" } } });
    expect(state.phase).toBe("finished");
    expect(state.stepIndex).toBe(0);
  });

  it("finishes a setlist with no steps at once instead of running an empty routine", () => {
    const result = setlistReduce(setlistOf([]), IDLE_SETLIST_RUN, { kind: "start", seconds: 0 });
    expect(result.state.phase).toBe("finished");
    expect(result.effects).toEqual([{ kind: "finished" }]);
  });

  it("runs a setlist of one step, once", () => {
    const setlist = setlistOf([step("only", { kind: "bars", bars: 2 })]);
    const { applied, log } = play(setlist, { beats: 20 });
    expect(applied).toEqual([0]);
    expect(log[8].state.phase).toBe("finished");
  });

  it("loops a setlist of one step forever when repeat is 0", () => {
    const setlist = setlistOf([step("only", { kind: "bars", bars: 1 })], 0);
    const { applied, state } = play(setlist, { beats: 40 });
    expect(applied.length).toBeGreaterThan(8);
    expect(applied.every((i) => i === 0)).toBe(true);
    expect(state.phase).not.toBe("finished");
    expect(state.pass).toBeGreaterThan(8);
  });

  it("a manual last step waits for the player instead of stopping", () => {
    const setlist = setlistOf([
      step("a", { kind: "bars", bars: 1 }),
      step("b", { kind: "manual" }),
    ]);
    const { state } = play(setlist, { beats: 40 });
    expect(state.stepIndex).toBe(1);
    expect(state.phase).toBe("running");
  });
});

// --- transitions -----------------------------------------------------------

describe("transitions", () => {
  it("rests the bars it was given before the next step arrives", () => {
    const setlist = setlistOf([
      step("a", { kind: "bars", bars: 1 }, { kind: "rest", bars: 2 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(setlist, { beats: 20 });
    // Bar one ends at beat 4; two bars of rest, so step b starts at beat 12.
    expect(log[4].state.phase).toBe("resting");
    expect(log[4].effects).toEqual([{ kind: "rest", bars: 2 }]);
    expect(log[8].state.phase).toBe("resting");
    expect(log[11].state.stepIndex).toBe(0);
    expect(log[12].state.stepIndex).toBe(1);
    expect(log[12].effects).toEqual([{ kind: "applyStep", index: 1, step: setlist.steps[1] }]);
  });

  it("does not let a skip cut a rest short", () => {
    const setlist = setlistOf([
      step("a", { kind: "bars", bars: 1 }, { kind: "rest", bars: 2 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(setlist, { beats: 16, inject: { 6: { kind: "advance" } } });
    expect(log[6].state.phase).toBe("resting");
    expect(log[12].state.stepIndex).toBe(1);
  });

  it("counts a step in, and the count is not one of its bars (U9.5)", () => {
    /*
     * The step is entered on the bar line the switch landed on, and then a
     * count runs before a note of it is played. The engine hands the count
     * over by putting `measure_beat` back to 0 on the beat you start playing
     * on (`is_last_warmup`), so the step gets a SECOND bar line — and an
     * anchored step had already spent bar one on the count. "Two bars" after
     * a count-in played one and a bit.
     *
     * Four beats of count at 4/4, so the switch is at beat 4, bar one of the
     * new step opens at beat 8, and its two bars run 8..11 and 12..15.
     */
    const counted = setlistOf([
      step("a", { kind: "bars", bars: 1 }, { kind: "countIn", bars: 1 }),
      step("b", { kind: "bars", bars: 2 }),
      step("c", { kind: "manual" }),
    ]);
    const { log } = play(counted, { beats: 20 });

    expect(log[4].state.stepIndex).toBe(1);
    expect(log[4].effects).toEqual([
      { kind: "applyStep", index: 1, step: counted.steps[1] },
      { kind: "countIn", beats: 4 },
    ]);
    // Entered, but belonging to no bar yet: the count is running.
    expect(log[4].state.anchored).toBe(false);
    expect(log[7].state.barsInStep).toBe(0);
    // The beat the count hands over is bar one, and the seconds clock starts
    // there too rather than a count earlier.
    expect(log[8].state.anchored).toBe(true);
    expect(log[8].state.barsInStep).toBe(0);
    expect(log[8].state.stepStartedAt).toBe(4.5);
    expect(log[4].state.stepStartedAt).toBe(2.5);
    expect(log[12].state.barsInStep).toBe(1);
    // Two whole bars of playing, then the move on. Anchored, the step would
    // have gone at beat 12 with one bar and a count behind it.
    expect(log[15].state.stepIndex).toBe(1);
    expect(log[16].state.stepIndex).toBe(2);
  });

  it("a cut hands the step the bar line it landed on, and a count-in does not", () => {
    const cut = setlistOf([
      step("a", { kind: "bars", bars: 1 }, { kind: "cut" }),
      step("b", { kind: "bars", bars: 2 }),
      step("c", { kind: "manual" }),
    ]);
    const counted = setlistOf([
      step("a", { kind: "bars", bars: 1 }, { kind: "countIn", bars: 1 }),
      step("b", { kind: "bars", bars: 2 }),
      step("c", { kind: "manual" }),
    ]);
    // Same switch, one bar apart afterwards: the count is the bar between.
    expect(play(cut, { beats: 20 }).log[12].state.stepIndex).toBe(2);
    expect(play(counted, { beats: 20 }).log[12].state.stepIndex).toBe(1);
  });

  it("treats a rest of zero bars as a cut", () => {
    const setlist = setlistOf([
      step("a", { kind: "bars", bars: 1 }, { kind: "rest", bars: 0 }),
      step("b", { kind: "manual" }),
    ]);
    const { log } = play(setlist, { beats: 8 });
    expect(log[4].state.stepIndex).toBe(1);
  });
});

// --- the transport's numbers (U9.7) ----------------------------------------

describe("stepRemaining", () => {
  const setlist = setlistOf([
    step("a", { kind: "bars", bars: 4 }),
    step("b", { kind: "seconds", seconds: 30 }),
    step("c", { kind: "manual" }),
  ]);

  it("says nothing while idle or finished", () => {
    expect(stepRemaining(setlist, IDLE_SETLIST_RUN)).toBeNull();
    expect(stepRemaining(setlist, { ...IDLE_SETLIST_RUN, phase: "finished" })).toBeNull();
  });

  it("counts bars down", () => {
    const { log } = play(setlist, { beats: 9 });
    expect(stepRemaining(setlist, log[0].state)).toEqual({ kind: "bars", bars: 4 });
    expect(stepRemaining(setlist, log[4].state)).toEqual({ kind: "bars", bars: 3 });
    expect(stepRemaining(setlist, log[8].state)).toEqual({ kind: "bars", bars: 2 });
  });

  it("counts seconds down, and will take a live reading between beats", () => {
    const state: SetlistRunState = {
      ...IDLE_SETLIST_RUN,
      phase: "running",
      stepIndex: 1,
      anchored: true,
      secondsInStep: 10,
    };
    expect(stepRemaining(setlist, state)).toEqual({ kind: "seconds", seconds: 20 });
    expect(stepRemaining(setlist, state, 12.5)).toEqual({ kind: "seconds", seconds: 17.5 });
  });

  it("never counts below zero", () => {
    const state: SetlistRunState = {
      ...IDLE_SETLIST_RUN,
      phase: "running",
      stepIndex: 1,
      anchored: true,
      secondsInStep: 45,
    };
    expect(stepRemaining(setlist, state)).toEqual({ kind: "seconds", seconds: 0 });
  });

  it("says manual for a gap that waits on the player", () => {
    const state: SetlistRunState = { ...IDLE_SETLIST_RUN, phase: "running", stepIndex: 2 };
    expect(stepRemaining(setlist, state)).toEqual({ kind: "manual" });
  });

  it("reads zero once the switch is armed", () => {
    const state: SetlistRunState = { ...IDLE_SETLIST_RUN, phase: "armed", stepIndex: 0 };
    expect(stepRemaining(setlist, state)).toEqual({ kind: "bars", bars: 0 });
  });
});

// --- edits under a running setlist -------------------------------------------

describe("a setlist edited while it runs", () => {
  it("stops rather than guessing when the pending step is gone", () => {
    const setlist = setlistOf([
      step("a", { kind: "manual" }),
      step("b", { kind: "manual" }),
    ]);
    let state = setlistReduce(setlist, IDLE_SETLIST_RUN, { kind: "start", seconds: 0 }).state;
    state = setlistReduce(setlist, state, { kind: "beat", barStart: true, seconds: 0.5 }).state;
    state = setlistReduce(setlist, state, { kind: "advance" }).state;
    const shortened = setlistOf([setlist.steps[0]]);
    const landed = setlistReduce(shortened, state, {
      kind: "beat",
      barStart: true,
      seconds: 2.5,
    });
    expect(landed.state.phase).toBe("finished");
    expect(landed.effects).toEqual([{ kind: "finished" }]);
  });

  it("stops clean and forgets where it was", () => {
    const setlist = setlistOf([step("a", { kind: "bars", bars: 1 }), step("b", { kind: "manual" })]);
    const { state } = play(setlist, { beats: 6 });
    const stopped = setlistReduce(setlist, state, { kind: "stop" });
    expect(stopped.state).toEqual(IDLE_SETLIST_RUN);
    expect(stopped.effects).toEqual([]);
    // And a beat arriving after the stop changes nothing.
    expect(
      setlistReduce(setlist, stopped.state, { kind: "beat", barStart: true, seconds: 9 }).state,
    ).toEqual(IDLE_SETLIST_RUN);
  });
});

describe("the count-in at the top of a setlist", () => {
  it("counts you into the first step, after the step is on the engine", () => {
    /*
     * Ordering is the whole thing. The beats have to sound at the tempo of
     * the step they are counting you into, and step one's tempo does not
     * exist on the engine until `applyStep` puts it there — so a count-in
     * emitted first would count you in at whatever the metronome happened to
     * be set to.
     */
    const setlist = { ...setlistOf([step("one", { kind: "bars", bars: 4 })]), countIn: 4 };
    const { effects } = setlistReduce(setlist, IDLE_SETLIST_RUN, { kind: "start", seconds: 0 });
    expect(effects.map((e) => e.kind)).toEqual(["applyStep", "countIn"]);
    expect(effects[1]).toEqual({ kind: "countIn", beats: 4 });
  });

  it("emits nothing extra for a setlist that does not ask for one", () => {
    // Every setlist saved before this existed has no `countIn` at all, and must
    // start exactly as it always did.
    const plain = setlistOf([step("one", { kind: "bars", bars: 4 })]);
    const { effects } = setlistReduce(plain, IDLE_SETLIST_RUN, { kind: "start", seconds: 0 });
    expect(effects.map((e) => e.kind)).toEqual(["applyStep"]);

    const zero = setlistReduce({ ...plain, countIn: 0 }, IDLE_SETLIST_RUN, { kind: "start", seconds: 0 });
    expect(zero.effects.map((e) => e.kind)).toEqual(["applyStep"]);
  });

  it("does not count you in again on the way round", () => {
    // It is the top of the RUN, not the top of every pass. Between steps the
    // count-in is a transition and says so for itself.
    const setlist = {
      ...setlistOf([step("one", { kind: "bars", bars: 1 }), step("two", { kind: "bars", bars: 1 })], 0),
      countIn: 4,
    };
    let state = setlistReduce(setlist, IDLE_SETLIST_RUN, { kind: "start", seconds: 0 }).state;
    const seen: string[] = [];
    for (let i = 0; i < 200 && seen.length < 40; i++) {
      const step = setlistReduce(setlist, state, { kind: "beat", barStart: true, seconds: i });
      state = step.state;
      for (const e of step.effects) seen.push(e.kind);
    }
    expect(seen.filter((k) => k === "countIn")).toHaveLength(0);
  });

  it("an empty setlist finishes rather than counting you into nothing", () => {
    const { effects } = setlistReduce(
      { ...setlistOf([]), countIn: 4 },
      IDLE_SETLIST_RUN,
      { kind: "start", seconds: 0 },
    );
    expect(effects.map((e) => e.kind)).toEqual(["finished"]);
  });
});

describe("starting where you are looking", () => {
  const three = setlistOf([
    step("one", { kind: "bars", bars: 4 }),
    step("two", { kind: "bars", bars: 4 }),
    step("three", { kind: "bars", bars: 4 }),
  ]);

  it("begins on the step you asked for, and applies THAT step", () => {
    // Pressing start while looking at step three and hearing step one is a
    // surprise, and skipping twice to get back is a chore.
    const { state, effects } = setlistReduce(three, IDLE_SETLIST_RUN, {
      kind: "start",
      seconds: 0,
      from: 2,
    });
    expect(state.stepIndex).toBe(2);
    expect(effects[0]).toEqual({ kind: "applyStep", index: 2, step: three.steps[2] });
  });

  it("begins at the top when nobody says otherwise", () => {
    const { state, effects } = setlistReduce(three, IDLE_SETLIST_RUN, {
      kind: "start",
      seconds: 0,
    });
    expect(state.stepIndex).toBe(0);
    expect(effects[0]).toEqual({ kind: "applyStep", index: 0, step: three.steps[0] });
  });

  it("clamps a selection that is no longer there", () => {
    // Remove the step you had open, press start: the index outlives it, and
    // an unclamped one would read off the end of the array.
    for (const from of [7, -3, 2.7]) {
      const { state } = setlistReduce(three, IDLE_SETLIST_RUN, { kind: "start", seconds: 0, from });
      expect(state.stepIndex).toBeGreaterThanOrEqual(0);
      expect(state.stepIndex).toBeLessThan(three.steps.length);
    }
  });

  it("runs on from there rather than looping back to the top", () => {
    // Starting at two must play two then three and finish — not two, one.
    let state = setlistReduce(three, IDLE_SETLIST_RUN, { kind: "start", seconds: 0, from: 1 }).state;
    const applied: number[] = [1];
    for (let i = 0; i < 400 && state.phase !== "finished"; i++) {
      const r = setlistReduce(three, state, { kind: "beat", barStart: true, seconds: i });
      state = r.state;
      for (const e of r.effects) if (e.kind === "applyStep") applied.push(e.index);
    }
    expect(applied).toEqual([1, 2]);
    expect(state.phase).toBe("finished");
  });

  it("counts you in at the step you started on, not at step one", () => {
    const counted = { ...three, countIn: 4 };
    const { effects } = setlistReduce(counted, IDLE_SETLIST_RUN, {
      kind: "start",
      seconds: 0,
      from: 2,
    });
    expect(effects.map((e) => e.kind)).toEqual(["applyStep", "countIn"]);
    expect(effects[0]).toMatchObject({ index: 2 });
  });
});
