/**
 * Watching a jam back, in arithmetic.
 *
 * The bar lit under the picture and the bar named in the caption of the video
 * that picture is saved as come off the same shape, so the cases here are the
 * ones where the two could quietly disagree: a take that opened half way
 * through a chorus, the moment a bar line falls, and the far end of a take.
 */
import { describe, expect, it } from "vitest";
import { jamAt, jamBarCount, jamChorusBars, jamChorusCount, jamScrub, msAtJamBar } from "./jamPlayback";
import { jamTapeShape } from "./jamStrip";
import type { Jam, JamTake } from "../jam/types";

/** A twelve-bar blues in 4/4 at 120: a bar is two seconds, a beat half of one. */
function blues(over: Partial<Jam> = {}): Jam {
  return {
    id: "j1",
    name: "Blues in F",
    createdAt: 0,
    bpm: 120,
    grooveId: "swing",
    feel: "swing",
    intensity: "normal",
    kit: "brushes",
    form: { kind: "blues12", bars: 12 },
    countIn: 0,
    fills: true,
    key: "F",
    chords: true,
    ...over,
  } as Jam;
}

function take(over: Partial<JamTake> = {}): JamTake {
  return {
    id: "t1",
    jamId: "j1",
    createdAt: 0,
    durationSec: 48,
    path: "x.wav",
    ...over,
  } as JamTake;
}

const shapeOf = (jam: Jam, t: JamTake) => jamTapeShape(jam, t, "Bluesy");

describe("where a jam take is while it plays", () => {
  it("counts the bar and the chorus from the take's own first sample", () => {
    const shape = shapeOf(blues(), take());
    // Bar one of chorus one, at the top and a beat in.
    expect(jamAt(shape, 0)).toMatchObject({ barsIn: 0, formBar: 0, chorus: 1 });
    expect(jamAt(shape, 500).beat).toBeCloseTo(1, 6);
    // Bar five: eight seconds in at two seconds a bar.
    expect(jamAt(shape, 8_000)).toMatchObject({ barsIn: 4, formBar: 4, chorus: 1 });
    // The form comes round: bar thirteen of the take is bar one of chorus two.
    expect(jamAt(shape, 24_000)).toMatchObject({ barsIn: 12, formBar: 0, chorus: 2 });
  });

  it("puts a take that opened mid-chorus on the bar it actually opened on", () => {
    // The engine stamped bar 7 of the form on the first sample it wrote.
    const shape = shapeOf(blues(), take({ position: { mode: "jam", bar: 7, tick: 0, pass: 1 } }));
    expect(jamAt(shape, 0).formBar).toBe(7);
    // Five bars later the form has come round: 7 + 5 = 12, which is bar one.
    expect(jamAt(shape, 10_000)).toMatchObject({ formBar: 0, chorus: 2 });
  });

  it("lights the new bar on the bar line and not a millisecond before it", () => {
    const shape = shapeOf(blues(), take());
    expect(jamAt(shape, 1_999).barsIn).toBe(0);
    expect(jamAt(shape, 2_000).barsIn).toBe(1);
  });

  it("names the chord on the bar, and the next one only when it changes", () => {
    const shape = shapeOf(blues(), take());
    const first = jamAt(shape, 0);
    expect(first.chord).toBeTruthy();
    // A blues' first two bars are the same chord on most spellings, so the
    // "next" line is only there when there is something to say.
    const fifth = jamAt(shape, 8_000);
    if (fifth.next) expect(fifth.next).not.toBe(fifth.chord);
  });

  it("clamps at both ends rather than reading off the end of the take", () => {
    const shape = shapeOf(blues(), take({ durationSec: 10 }));
    expect(jamAt(shape, -5_000).barsIn).toBe(0);
    expect(jamAt(shape, 999_999).barsIn).toBe(5);
    expect(msAtJamBar(shape, 999)).toBe(10_000);
    expect(msAtJamBar(shape, -3)).toBe(0);
  });

  it("holds the bar a take stopped part way through", () => {
    // Nine seconds is four whole bars and half of a fifth.
    expect(jamBarCount(shapeOf(blues(), take({ durationSec: 9 })))).toBe(5);
    expect(jamBarCount(shapeOf(blues(), take({ durationSec: 0 })))).toBe(1);
  });

  it("draws the form, once, whatever the take's length is", () => {
    // Six and a half minutes of a twelve-bar blues at 120 is two hundred and
    // one bars; the grid is still twelve cells, because that is the form.
    const shape = shapeOf(blues(), take({ durationSec: 402 }));
    expect(jamBarCount(shape)).toBe(201);
    const cells = jamChorusBars(shape, 3);
    expect(cells).toHaveLength(12);
    expect(cells.map((c) => c.formBar)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    // The third time round starts at the take's bar 24.
    expect(cells[0].barsIn).toBe(24);
    expect(jamChorusCount(shape)).toBe(17);
  });

  it("leaves a dead cell where the take does not reach", () => {
    // Opened on bar 8 of the form, so the first chorus has seven bars nobody
    // played — drawn, and not pressable.
    const shape = shapeOf(blues(), take({ position: { mode: "jam", bar: 7, tick: 0, pass: 1 } }));
    const first = jamChorusBars(shape, 1);
    expect(first.slice(0, 7).every((c) => c.barsIn === null)).toBe(true);
    expect(first[7].barsIn).toBe(0);
    // ...and the same at the far end, where the take stopped mid-chorus.
    const last = jamChorusBars(shape, jamChorusCount(shape));
    expect(last.some((c) => c.barsIn === null)).toBe(true);
  });

  it("scrubs to the bar line you are hearing, then off the back of it", () => {
    const shape = shapeOf(blues(), take());
    // Well into bar three: back goes to the top of bar three.
    expect(jamScrub(shape, 5_500, -1)).toBe(4_000);
    // Already at the top of it: back goes to bar two.
    expect(jamScrub(shape, 4_100, -1)).toBe(2_000);
    expect(jamScrub(shape, 5_500, 1)).toBe(6_000);
    // And never off either end.
    expect(jamScrub(shape, 0, -1)).toBe(0);
    expect(jamScrub(shape, 47_900, 1)).toBe(48_000);
  });
});
