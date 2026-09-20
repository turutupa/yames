// Where you are in a song, which is one function on purpose.
//
// The cursor, the review's live lighting and the pass counter all read
// position through here, so the day the engine starts sending `songBar` /
// `songTick` of its own the swap is one line. These tests pin both halves:
// the beat-count arithmetic that stands in today, and the preference for the
// engine's own numbers the moment they appear.
import { describe, expect, it } from "vitest";
import { barAtBeatInRange, printedBarNumber, songPosition, songTickAt } from "./position";
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

const WHOLE = { startBar: 0, endBar: 3 };
const SECOND_HALF = { startBar: 2, endBar: 3 };

describe("before anything has happened", () => {
  it("sits at the start of the range, not the start of the song", () => {
    const at = songPosition(score(), SECOND_HALF, null, { playing: false, loops: false });
    expect(at.tick).toBe(7680);
    expect(at.bar).toBe(2);
    expect(at.beatInRange).toBe(0);
  });

  it("goes back to the start of the range when the transport stops", () => {
    const at = songPosition(score(), SECOND_HALF, { beat: 5 }, { playing: false, loops: false });
    expect(at.tick).toBe(7680);
  });
});

describe("the beat count, while it is all there is", () => {
  it("walks the range one quarter note at a time", () => {
    const at = songPosition(score(), WHOLE, { beat: 5 }, { playing: true, loops: false });
    expect(at.tick).toBe(5 * 960);
    expect(at.bar).toBe(1);
    expect(at.beatInRange).toBe(5);
  });

  it("wraps with a modulo when the range repeats, and counts the goes", () => {
    // Two bars is eight quarter notes; beat 9 is the second time round.
    const at = songPosition(score(), SECOND_HALF, { beat: 9 }, { playing: true, loops: true });
    expect(at.beatInRange).toBe(1);
    expect(at.pass).toBe(1);
    expect(at.tick).toBe(7680 + 960);
  });

  it("stops at the end rather than walking off it when it does not repeat", () => {
    const at = songPosition(score(), SECOND_HALF, { beat: 40 }, { playing: true, loops: false });
    expect(at.beatInRange).toBe(8);
    expect(at.pass).toBe(0);
  });

  /**
   * The last tick of a range is the bar line of the bar after it. Reporting
   * that bar would light a bar the player was never asked to play.
   */
  it("holds the bar inside the range at both ends", () => {
    const end = songPosition(score(), SECOND_HALF, { beat: 8 }, { playing: true, loops: false });
    expect(end.bar).toBe(3);
    const start = songPosition(score(), SECOND_HALF, { beat: 0 }, { playing: true, loops: false });
    expect(start.bar).toBe(2);
  });
});

describe("when the engine says where it is, that is the answer", () => {
  it("takes a tick over the beat count", () => {
    const at = songPosition(
      score(),
      WHOLE,
      { beat: 99, songTick: 3840 },
      { playing: true, loops: true },
    );
    expect(at.tick).toBe(3840);
    expect(at.bar).toBe(1);
  });

  it("takes a bar over the beat count, and holds it inside the range", () => {
    const at = songPosition(
      score(),
      SECOND_HALF,
      { beat: 99, songBar: 0 },
      { playing: true, loops: true },
    );
    expect(at.bar).toBe(2);
    expect(at.tick).toBe(7680);
  });
});

describe("the other direction, and the page's own numbers", () => {
  it("finds the bar a beat of the schedule belongs to", () => {
    expect(barAtBeatInRange(score(), SECOND_HALF, 0)).toBe(2);
    expect(barAtBeatInRange(score(), SECOND_HALF, 3.5)).toBe(2);
    expect(barAtBeatInRange(score(), SECOND_HALF, 4)).toBe(3);
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
    const beat = { beat: 3 };
    expect(songTickAt(score(), WHOLE, beat, { playing: true, loops: false })).toBe(
      songPosition(score(), WHOLE, beat, { playing: true, loops: false }).tick,
    );
  });

  it("survives a song with no bars in it at all", () => {
    const empty = { ...score(), bars: [] };
    expect(songTickAt(empty, { startBar: 0, endBar: 0 }, { beat: 4 }, { playing: true, loops: false })).toBe(0);
  });
});
