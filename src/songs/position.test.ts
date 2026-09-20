// Where you are in a song, which is one function on purpose.
//
// The cursor, the review's live lighting and the pass counter all read
// position through here. The engine says where it is — `songTick`, `songBar`,
// `songPass` — and this turns that into the three numbers the review works
// in. `BeatEvent.beat` is never read: it counts the CLICK's beats, so in 7/8
// it counts eighths, and the 7/8 case below is the one that proves it.
import { describe, expect, it } from "vitest";
import { barAtBeatInRange, printedBarNumber, songPosition, songTickAt } from "./position";
import type { BeatPosition } from "./position";
import type { SongScore } from "./types";

/** Four bars of 4/4, the last two a repeat of the first two. */
function score(): SongScore {
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
      { index: 2, startTick: 7680, lengthTicks: 3840, printedBar: 0 },
      { index: 3, startTick: 11520, lengthTicks: 3840, printedBar: 1 },
    ],
    notes: [],
    sections: [],
  };
}

/** Two bars of 7/8 — where a click beat and a quarter note are not the same. */
function sevenEight(): SongScore {
  return {
    ...score(),
    meterMap: [{ bar: 0, numerator: 7, denominator: 8 }],
    bars: [
      { index: 0, startTick: 0, lengthTicks: 3360, printedBar: 0 },
      { index: 1, startTick: 3360, lengthTicks: 3360, printedBar: 1 },
    ],
  };
}

const WHOLE = { startBar: 0, endBar: 3 };
const SECOND_HALF = { startBar: 2, endBar: 3 };

function at(over: Partial<BeatPosition> = {}): BeatPosition {
  return { songBar: 0, songTick: 0, songPass: 0, songCountIn: false, ...over };
}

describe("before the music starts", () => {
  it("sits at the start of the range, not the start of the song", () => {
    const where = songPosition(score(), SECOND_HALF, null, { playing: false });
    expect(where.tick).toBe(7680);
    expect(where.bar).toBe(2);
    expect(where.beatInRange).toBe(0);
  });

  it("goes back to the start of the range when the transport stops", () => {
    const where = songPosition(
      score(),
      SECOND_HALF,
      at({ songBar: 3, songTick: 12480 }),
      { playing: false },
    );
    expect(where.tick).toBe(7680);
  });

  /** A cursor walking through a count-in is a cursor on notes nobody has
   *  been asked to play yet. */
  it("waits through a count-in, and says it is waiting", () => {
    const where = songPosition(
      score(),
      SECOND_HALF,
      at({ songBar: null, songCountIn: true }),
      { playing: true },
    );
    expect(where.tick).toBe(7680);
    expect(where.countingIn).toBe(true);
  });

  it("waits when no song reached the engine at all", () => {
    const where = songPosition(score(), SECOND_HALF, at({ songBar: null }), { playing: true });
    expect(where.tick).toBe(7680);
    expect(where.countingIn).toBe(false);
  });
});

describe("what the engine says", () => {
  it("is the position, in the score's own ticks", () => {
    const where = songPosition(
      score(),
      WHOLE,
      at({ songBar: 1, songTick: 4800 }),
      { playing: true },
    );
    expect(where.tick).toBe(4800);
    expect(where.bar).toBe(1);
    expect(where.beatInRange).toBe(5);
  });

  it("counts the schedule's beats from the start of the RANGE, not the song", () => {
    const where = songPosition(
      score(),
      SECOND_HALF,
      at({ songBar: 3, songTick: 11520 }),
      { playing: true },
    );
    expect(where.beatInRange).toBe(4);
  });

  it("takes the engine's own count of the goes round", () => {
    const where = songPosition(
      score(),
      SECOND_HALF,
      at({ songBar: 2, songTick: 7680, songPass: 3 }),
      { playing: true },
    );
    expect(where.pass).toBe(3);
  });

  it("holds the bar inside the range, however the engine numbers it", () => {
    const low = songPosition(
      score(),
      SECOND_HALF,
      at({ songBar: 0, songTick: 7680 }),
      { playing: true },
    );
    expect(low.bar).toBe(2);
  });

  /**
   * The reason `BeatEvent.beat` is never read. In 7/8 a bar is 3360 ticks —
   * three and a half quarter notes — and the click has counted SEVEN beats by
   * the time the second bar starts. A position taken from the click would be
   * twice as far into the piece as the music is.
   */
  it("reads 7/8 as quarter notes, which is what a schedule counts in", () => {
    const where = songPosition(
      sevenEight(),
      { startBar: 0, endBar: 1 },
      at({ songBar: 1, songTick: 3360 }),
      { playing: true },
    );
    expect(where.beatInRange).toBe(3.5);
    expect(where.bar).toBe(1);
  });
});

describe("the other direction, and the page's own numbers", () => {
  it("finds the bar a beat of the schedule belongs to", () => {
    expect(barAtBeatInRange(score(), SECOND_HALF, 0)).toBe(2);
    expect(barAtBeatInRange(score(), SECOND_HALF, 3.5)).toBe(2);
    expect(barAtBeatInRange(score(), SECOND_HALF, 4)).toBe(3);
  });

  it("holds an onset past the end inside the range", () => {
    expect(barAtBeatInRange(score(), SECOND_HALF, 99)).toBe(3);
  });

  /** The repeat: played bars 2 and 3 are printed bars 1 and 2. */
  it("gives the number the player reads off the page, counting from one", () => {
    expect(printedBarNumber(score(), 0)).toBe(1);
    expect(printedBarNumber(score(), 2)).toBe(1);
    expect(printedBarNumber(score(), 3)).toBe(2);
  });
});

describe("the cursor's own door", () => {
  it("is the same answer with everything but the tick thrown away", () => {
    const beat = at({ songBar: 1, songTick: 4800 });
    expect(songTickAt(score(), WHOLE, beat, { playing: true })).toBe(
      songPosition(score(), WHOLE, beat, { playing: true }).tick,
    );
  });

  it("survives a song with no bars in it at all", () => {
    const empty = { ...score(), bars: [] };
    expect(
      songTickAt(empty, { startBar: 0, endBar: 0 }, at({ songTick: 900 }), { playing: true }),
    ).toBe(900);
  });
});
