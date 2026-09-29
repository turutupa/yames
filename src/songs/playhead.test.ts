/**
 * One place in the song (W37 item 1).
 *
 * The owner's sentence is the test: *"let's say i hit play, and i hit pause
 * when it's on bar 3, if i click on bar 6 and hit play again, it will resume
 * from bar 3 but then immediately go on from bar 6, as if there are 2 states
 * for the current location"*. There is one now, and these say what it does.
 */
import { describe, expect, it } from "vitest";
import {
  AGREE_QUARTERS,
  NO_PLAYHEAD,
  barOfTick,
  clampTick,
  giveUpWaiting,
  goTo,
  onReport,
  pauseAt,
  playheadTick,
  rangeStartTick,
  reportAgrees,
  tickOfBar,
  toStart,
} from "./playhead";
import type { PlayheadState } from "./playhead";
import { TICKS_PER_QUARTER } from "./types";
import type { SongScore } from "./types";

/** Ten bars of 4/4 at 120. Plain, because the rule is about places. */
function tenBars(): SongScore {
  return {
    schema: 1,
    id: "s",
    title: "Ten bars",
    artist: "",
    source: { fileName: "f.alphatex", format: "alphatex", trackIndex: 0, trackName: "Lead" },
    tuning: [64, 59, 55, 50, 45, 40],
    capo: 0,
    ticksPerQuarter: TICKS_PER_QUARTER,
    tempoMap: [{ tick: 0, bpm: 120 }],
    meterMap: [{ bar: 0, numerator: 4, denominator: 4 }],
    bars: Array.from({ length: 10 }, (_, i) => ({
      index: i,
      startTick: i * 3840,
      lengthTicks: 3840,
      printedBar: i,
    })),
    notes: [],
    sections: [],
  };
}

const score = tenBars();
const whole = { startBar: 0, endBar: score.bars.length - 1 };
const portion = { startBar: 4, endBar: 7 };
const bar = (n: number) => score.bars[n].startTick;

describe("where the playhead is", () => {
  it("is the first bar of what is playing when nobody has said otherwise", () => {
    expect(playheadTick(score, whole, NO_PLAYHEAD, { playing: false, report: null })).toBe(
      bar(0),
    );
    expect(playheadTick(score, portion, NO_PLAYHEAD, { playing: false, report: null })).toBe(
      bar(4),
    );
  });

  it("is where the player left it while the transport is stopped", () => {
    const at: PlayheadState = { stored: bar(6), pending: null };
    expect(playheadTick(score, whole, at, { playing: false, report: null })).toBe(bar(6));
    // And the engine has nothing to say about a song nobody is playing.
    expect(playheadTick(score, whole, at, { playing: false, report: bar(1) })).toBe(bar(6));
  });

  it("is the engine's while the transport runs", () => {
    const at: PlayheadState = { stored: bar(6), pending: null };
    expect(playheadTick(score, whole, at, { playing: true, report: bar(9) })).toBe(bar(9));
  });

  it("is the click, at once, until the engine agrees with it", () => {
    // The owner's bar 3 / bar 6: playing at bar 2, the page is clicked at
    // bar 6, and the engine goes on reporting bar 2 for a click tick.
    const clicked = goTo(bar(6));
    expect(playheadTick(score, whole, clicked, { playing: true, report: bar(2) })).toBe(bar(6));
    // The report that agrees hands it back.
    const settled = onReport(score, clicked, bar(6) + TICKS_PER_QUARTER);
    expect(settled.pending).toBeNull();
    expect(playheadTick(score, whole, settled, { playing: true, report: bar(7) })).toBe(bar(7));
  });

  it("holds the playhead inside the bars that are going to play", () => {
    const outside: PlayheadState = { stored: bar(0), pending: null };
    expect(playheadTick(score, portion, outside, { playing: false, report: null })).toBe(bar(4));
    const past: PlayheadState = { stored: bar(9), pending: null };
    const end = playheadTick(score, portion, past, { playing: false, report: null });
    expect(end).toBeGreaterThanOrEqual(bar(7));
    expect(end).toBeLessThan(bar(8));
  });
});

describe("agreeing", () => {
  it("is one-sided and measured in quarter notes", () => {
    const target = bar(6);
    expect(reportAgrees(score, target, target)).toBe(true);
    expect(reportAgrees(score, target, target + TICKS_PER_QUARTER * AGREE_QUARTERS)).toBe(true);
    expect(reportAgrees(score, target, target + TICKS_PER_QUARTER * AGREE_QUARTERS + 1)).toBe(
      false,
    );
    // A report BEFORE the click is stale whichever way the click went.
    expect(reportAgrees(score, target, target - 1)).toBe(false);
  });

  it("gives the engine the truth back when no report ever agrees", () => {
    const clicked = goTo(bar(6));
    const waited = onReport(score, clicked, bar(1));
    expect(waited.pending).toBe(bar(6));
    expect(giveUpWaiting(waited).pending).toBeNull();
    // The place is kept: the click still decides where the next pass begins.
    expect(giveUpWaiting(waited).stored).toBe(bar(6));
  });

  it("hands the same object back when nothing changed, so no render is spent", () => {
    const settled: PlayheadState = { stored: bar(6), pending: null };
    expect(onReport(score, settled, bar(9))).toBe(settled);
    expect(giveUpWaiting(settled)).toBe(settled);
  });
});

describe("a stop is a pause", () => {
  it("leaves the playhead where the music stopped", () => {
    const running = goTo(bar(2));
    const paused = pauseAt(running, bar(3) + TICKS_PER_QUARTER);
    expect(paused.stored).toBe(bar(3) + TICKS_PER_QUARTER);
    expect(paused.pending).toBeNull();
    // ...and that is exactly where the next press of Play begins.
    expect(playheadTick(score, whole, paused, { playing: false, report: null })).toBe(
      bar(3) + TICKS_PER_QUARTER,
    );
  });

  it("leaves it alone when nothing was reporting", () => {
    const at: PlayheadState = { stored: bar(5), pending: null };
    expect(pauseAt(at, null).stored).toBe(bar(5));
  });

  it("and back to the start is the only thing that rewinds", () => {
    expect(toStart()).toEqual(NO_PLAYHEAD);
    expect(playheadTick(score, portion, toStart(), { playing: false, report: null })).toBe(
      bar(4),
    );
  });
});

describe("bars and ticks", () => {
  it("names the bar the playhead stands in", () => {
    expect(barOfTick(score, whole, bar(5) + 10)).toBe(5);
    // Held inside the portion, both ends.
    expect(barOfTick(score, portion, bar(0))).toBe(4);
    expect(barOfTick(score, portion, bar(9))).toBe(7);
  });

  it("turns a bar back into the tick it starts on", () => {
    expect(tickOfBar(score, whole, 5)).toBe(bar(5));
    expect(rangeStartTick(score, portion)).toBe(bar(4));
  });

  it("is never the bar line of the bar after the range", () => {
    const last = clampTick(score, portion, Number.MAX_SAFE_INTEGER);
    expect(barOfTick(score, portion, last)).toBe(7);
  });
});
