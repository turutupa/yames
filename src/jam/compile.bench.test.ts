// How long the bar-ahead send takes to PREPARE.
//
// `useJamSession` re-sends the whole config at every bar line where the next
// bar's bass is different music. That send has one bar to arrive in — 2.6
// seconds at the slow blues's 92 BPM, 0.75 at a fast swing — and it is made of
// two halves: compiling the config, which happens here, and the IPC round trip
// to the engine, which `jamLatency` in `useJamSession` times in the running
// app because a test has no engine to talk to.
//
// This pins the half a test can see. It is a budget, not a benchmark: the
// number that matters is that compiling is nowhere near a bar, so the whole of
// the budget is left for the trip.
import { describe, expect, it } from "vitest";
import { compileJam } from "./compile";
import { STARTER_JAMS } from "./jams";

describe("preparing a bar-ahead send", () => {
  it("compiles a jam in well under a millisecond", () => {
    // The busiest starter: thirty-two bars of AABA with a walking bass on a
    // triplet grid, which is the most chords and the most ticks Jam ships.
    const jam = STARTER_JAMS.find((j) => j.form.kind === "aaba32")!;
    const lineup = { drums: true, bass: true };

    // Warm, so the first call's parse and JIT are not what is measured.
    for (let i = 0; i < 200; i += 1) compileJam(jam, { formBar: i % 32, lineup });

    const runs = 2000;
    const started = performance.now();
    for (let i = 0; i < runs; i += 1) compileJam(jam, { formBar: i % 32, lineup });
    const each = (performance.now() - started) / runs;

    // A bar at the fastest tempo Jam ships (160 BPM, 4/4) is 1500 ms. One
    // millisecond is a thousandth of that, and the assertion is deliberately
    // that loose: this is a guard against compiling becoming accidentally
    // quadratic, not a stopwatch whose exact reading is meaningful on CI.
    expect(each, `compileJam took ${each.toFixed(3)} ms`).toBeLessThan(1);
  });
});
