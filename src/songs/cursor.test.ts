// The playhead between two of the engine's reports.
//
// The owner's sentence is the acceptance test: *"there's a sweep picking
// section that it's not following note per note in a smooth movement, it's
// doing blocks at a time"*. So the questions here are the four the interpolator
// is built for — steady tempo, a tempo step, half speed, and a seam or a seek —
// plus the one that matters over a whole song, which is that anchoring on every
// report means the error cannot accumulate.
import { describe, expect, it } from "vitest";
import {
  SNAP_TICKS,
  advanceTicks,
  cursorTickAt,
  leadFromFrame,
  onReport,
  snapTo,
  ticksToMs,
} from "./cursor";
import type { SongScore } from "./types";

/** Four bars of 4/4 at 120, so a quarter note is exactly 500 ms. */
function score(over: Partial<SongScore> = {}): SongScore {
  return {
    schema: 1,
    id: "s",
    title: "Four bars",
    artist: "",
    source: { fileName: "f.alphatex", format: "alphatex", trackIndex: 0, trackName: "Lead" },
    tuning: [64, 59, 55, 50, 45, 40],
    capo: 0,
    ticksPerQuarter: 960,
    tempoMap: [{ tick: 0, bpm: 120 }],
    meterMap: [{ bar: 0, numerator: 4, denominator: 4 }],
    bars: [
      { index: 0, startTick: 0, lengthTicks: 3840, printedBar: 0 },
      { index: 1, startTick: 3840, lengthTicks: 3840, printedBar: 1 },
      { index: 2, startTick: 7680, lengthTicks: 3840, printedBar: 2 },
      { index: 3, startTick: 11520, lengthTicks: 3840, printedBar: 3 },
    ],
    notes: [],
    sections: [],
    ...over,
  };
}

/** The same piece, stepping to 240 BPM on the third bar. */
function withStep(): SongScore {
  return score({
    tempoMap: [
      { tick: 0, bpm: 120 },
      { tick: 7680, bpm: 240 },
    ],
  });
}

const END = 15_360;
const FRAME = { percent: 100, endTick: END, leadMs: 0 };

describe("travelling through the tempo map", () => {
  it("advances a quarter note in half a second at 120", () => {
    expect(advanceTicks(score(), 0, 500, 100)).toBeCloseTo(960, 6);
  });

  it("moves at every instant, not once a beat", () => {
    // The whole complaint, as arithmetic: an eighth of a beat of time is an
    // eighth of a beat of travel, and it is different from the one before it.
    const at = [0, 62.5, 125, 187.5, 250].map((ms) => advanceTicks(score(), 0, ms, 100));
    for (const [i, want] of [0, 120, 240, 360, 480].entries()) {
      expect(at[i]).toBeCloseTo(want, 6);
    }
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThan(at[i - 1]);
  });

  it("crosses a tempo step at the step, not at the next bar line", () => {
    // Two bars at 120 is four seconds; the third bar is at 240, so a quarter
    // note there takes 250 ms rather than 500.
    const step = withStep();
    expect(advanceTicks(step, 0, 4000, 100)).toBeCloseTo(7680, 6);
    expect(advanceTicks(step, 0, 4250, 100)).toBeCloseTo(8640, 6);
    // And a walk that starts after the step never sees the slow tempo at all.
    expect(advanceTicks(step, 7680, 250, 100)).toBeCloseTo(8640, 6);
  });

  it("goes half as far at half speed", () => {
    expect(advanceTicks(score(), 0, 500, 50)).toBeCloseTo(480, 6);
    expect(advanceTicks(withStep(), 0, 8000, 50)).toBeCloseTo(7680, 6);
  });

  it("stands still when no time has passed, and never goes backwards", () => {
    expect(advanceTicks(score(), 4321, 0, 100)).toBe(4321);
    expect(advanceTicks(score(), 4321, -50, 100)).toBe(4321);
  });

  it("is the inverse of the time it takes", () => {
    for (const from of [0, 960, 7680, 9000]) {
      for (const to of [1920, 7680, 11_520, 15_360]) {
        if (to <= from) continue;
        const ms = ticksToMs(withStep(), from, to, 80);
        expect(advanceTicks(withStep(), from, ms, 80)).toBeCloseTo(to, 3);
      }
    }
  });
});

describe("gliding between two reports", () => {
  it("draws the line where the tempo map says, between beats", () => {
    const motion = snapTo(960, 1000, 0);
    // A third of the way from the second quarter note to the third.
    const frame = cursorTickAt(score(), motion, 1000 + 500 / 3, FRAME);
    expect(frame.tick).toBeCloseTo(960 + 320, 6);
  });

  it("asks for the position the screen will actually show", () => {
    // alphaTab moves the cursor two frames after it is told; the lead is what
    // puts the line on the note at the instant the note sounds.
    const motion = snapTo(0, 0, 0);
    const led = cursorTickAt(score(), motion, 0, { ...FRAME, leadMs: 32 });
    const plain = cursorTickAt(score(), motion, 32, FRAME);
    expect(led.tick).toBeCloseTo(plain.tick, 6);
  });

  it("waits at the end of the range rather than walking off it", () => {
    const motion = snapTo(END - 480, 0, 0);
    const frame = cursorTickAt(score(), motion, 10_000, FRAME);
    expect(frame.tick).toBe(END);
  });

  it("never steps backwards when a report arrives a little late", () => {
    const at = score();
    // Anchored on the beat, gliding, and already six milliseconds past where
    // the engine has got to when the next report lands.
    let motion = snapTo(960, 1000, 0);
    const shown = cursorTickAt(at, motion, 1506, FRAME);
    motion = shown.motion;
    expect(shown.tick).toBeGreaterThan(1920);

    motion = onReport(at, motion, { tick: 1920, pass: 0, atMs: 1506 }, 100);
    // The correction is taken as a few milliseconds of standing still...
    const held = cursorTickAt(at, motion, 1506, FRAME);
    expect(held.tick).toBe(shown.tick);
    // ...and the line is moving again within the frame after that.
    const moving = cursorTickAt(at, held.motion, 1530, FRAME);
    expect(moving.tick).toBeGreaterThan(shown.tick);
  });

  it("re-anchors on every report, so five minutes of song does not drift", () => {
    const at = score({
      bars: Array.from({ length: 300 }, (_, i) => ({
        index: i,
        startTick: i * 3840,
        lengthTicks: 3840,
        printedBar: i,
      })),
    });
    const end = 300 * 3840;
    let motion = snapTo(0, 0, 0);
    let now = 0;
    // Six hundred beats — five minutes at 120 — with every report arriving
    // seven milliseconds late, which is what a thread that sleeps looks like.
    for (let beat = 1; beat <= 600; beat++) {
      now = beat * 500 + 7;
      motion = onReport(at, motion, { tick: beat * 960, pass: 0, atMs: now }, 100);
      motion = cursorTickAt(at, motion, now, { percent: 100, endTick: end, leadMs: 0 }).motion;
    }
    // Not "close to" — exactly, because the last report IS the anchor.
    expect(motion.anchorTick).toBe(600 * 960);
    expect(cursorTickAt(at, motion, now, { percent: 100, endTick: end, leadMs: 0 }).tick)
      .toBeCloseTo(600 * 960, 6);
  });
});

describe("when the engine goes somewhere the tempo map does not lead", () => {
  it("snaps on a loop seam, and lets the floor go with it", () => {
    const at = score();
    let motion = snapTo(11_520, 0, 0);
    motion = cursorTickAt(at, motion, 400, FRAME).motion;
    expect(motion.floor).toBeGreaterThan(11_520);
    // Round again: the same bars, one pass later.
    motion = onReport(at, motion, { tick: 0, pass: 1, atMs: 500 }, 100);
    expect(motion.anchorTick).toBe(0);
    expect(motion.floor).toBe(0);
    expect(cursorTickAt(at, motion, 500, FRAME).tick).toBe(0);
  });

  it("snaps on a seek, forwards or back", () => {
    const at = score();
    const motion = snapTo(960, 1000, 0);
    const forward = onReport(at, motion, { tick: 11_520, pass: 0, atMs: 1100 }, 100);
    expect(forward.anchorTick).toBe(11_520);
    expect(forward.floor).toBe(11_520);
    const back = onReport(at, motion, { tick: 0, pass: 0, atMs: 1100 }, 100);
    expect(back.anchorTick).toBe(0);
    expect(back.floor).toBe(0);
  });

  it("calls an ordinary beat an ordinary beat, however late it is", () => {
    const at = score();
    const motion = snapTo(960, 1000, 0);
    // A whole beat later, to the millisecond: the prediction and the report
    // agree, so the floor is kept and nothing jumps.
    const on = onReport(at, { ...motion, floor: 1900 }, { tick: 1920, pass: 0, atMs: 1500 }, 100);
    expect(on.floor).toBe(1900);
    // And a report that is off by less than half a beat is still ordinary.
    const off = onReport(
      at,
      { ...motion, floor: 1900 },
      { tick: 1920 + SNAP_TICKS - 1, pass: 0, atMs: 1500 },
      100,
    );
    expect(off.floor).toBe(1900);
  });

  it("starts from nothing on the first report of a pass", () => {
    const motion = onReport(score(), null, { tick: 7680, pass: 0, atMs: 12 }, 100);
    expect(motion).toEqual({ anchorTick: 7680, anchorMs: 12, pass: 0, floor: 7680 });
  });
});

describe("the lead alphaTab needs", () => {
  it("is two frames of whatever the screen is running at", () => {
    expect(leadFromFrame(16.7)).toBeCloseTo(33.4, 6);
    expect(leadFromFrame(8.3)).toBeCloseTo(16.6, 6);
  });

  it("is nothing until a frame has been measured", () => {
    expect(leadFromFrame(0)).toBe(0);
    expect(leadFromFrame(Number.NaN)).toBe(0);
  });

  it("is capped, so a backgrounded tab does not wake up in the next section", () => {
    expect(leadFromFrame(4000)).toBe(40);
  });
});
