/**
 * What survives resolution, and what does not.
 *
 * The rule under test is COACH_UX D3's first: a reference that does not
 * resolve renders as NOTHING, never as a guess. So every case here is either
 * "this reference is real and comes back with the facts behind it" or "this
 * one is not and the block is gone, with a line saying why".
 */

import { describe, expect, it } from "vitest";
import { resolveCoachAnswer, type CoachBlockContext } from "./resolve";

const SCORE = { id: "song", title: "Wish You Were Here", bars: 64 };

const CTX: CoachBlockContext = {
  scores: [SCORE],
  attempts: [
    { id: 411, scoreId: "song" },
    { id: 412, scoreId: "song" },
    { id: 500, scoreId: "another" },
  ],
  presets: [{ id: "warmup", name: "Warm-up" }],
  jams: [{ id: "blues", name: "Slow blues in A" }],
  progressFor: () => [
    { at: "a", percent: 61 },
    { at: "b", percent: 94 },
  ],
};

/** One block in, the answer out. */
function one(block: unknown, ctx: CoachBlockContext = CTX) {
  return resolveCoachAnswer({ blocks: [block] }, ctx);
}

/** The reason a single block was dropped, or "kept". */
function why(block: unknown, ctx: CoachBlockContext = CTX): string {
  const { blocks, dropped } = one(block, ctx);
  return blocks.length === 1 ? "kept" : dropped[0].reason;
}

describe("an answer that is not one", () => {
  it("takes prose without throwing", () => {
    const out = resolveCoachAnswer("Play it slower, mate.");
    expect(out.blocks).toEqual([]);
    expect(out.dropped[0].reason).toBe("notAnAnswer");
  });

  it("reads an answer that arrived as text", () => {
    const out = resolveCoachAnswer(JSON.stringify({ blocks: [{ type: "text", text: "Nice." }] }));
    expect(out.blocks).toEqual([{ type: "text", text: "Nice." }]);
  });

  it("refuses null, a number, an array and an empty object", () => {
    for (const rubbish of [null, 7, [], {}, { blocks: "two" }]) {
      expect(resolveCoachAnswer(rubbish).blocks).toEqual([]);
    }
  });

  it("keeps the first six blocks and says the rest were too many", () => {
    const blocks = Array.from({ length: 9 }, (_, i) => ({ type: "text", text: `line ${i}` }));
    const out = resolveCoachAnswer({ blocks });
    expect(out.blocks).toHaveLength(6);
    expect(out.dropped).toHaveLength(3);
    expect(out.dropped.every((d) => d.reason === "tooManyBlocks")).toBe(true);
  });
});

describe("the shape of a block", () => {
  it("refuses a type that is not in the catalogue", () => {
    expect(why({ type: "video", url: "x" })).toBe("unknownType");
  });

  it("refuses a block carrying a field the catalogue does not have", () => {
    // What writing content looks like: the model naming the frets itself.
    expect(why({ type: "chordShape", chord: "Am7", shape: 0, frets: [5, 7, 5, 5, 5, 5] })).toBe(
      "badField",
    );
  });

  it("refuses a missing field and a field of the wrong kind", () => {
    expect(why({ type: "chordShape", chord: "Am7" })).toBe("badField");
    expect(why({ type: "chordShape", chord: 7, shape: 0 })).toBe("badField");
  });

  it("takes a number written as digits, and null for a field that may be missing", () => {
    const out = one({ type: "chordShape", chord: "Am7", shape: "1", instrument: null });
    expect(out.blocks).toHaveLength(1);
  });

  it("refuses a sentence longer than the catalogue allows", () => {
    expect(why({ type: "text", text: "x".repeat(241) })).toBe("badField");
    expect(why({ type: "text", text: "x".repeat(240) })).toBe("kept");
    expect(why({ type: "text", text: "   " })).toBe("badField");
  });
});

describe("a chord", () => {
  it("draws a grip the chord has", () => {
    const { blocks } = one({ type: "chordShape", chord: "Am7", shape: 0 });
    expect(blocks[0]).toMatchObject({ type: "chordShape", chordLabel: "Am7", index: 0 });
    const block = blocks[0] as { shape: { frets: (number | null)[] } };
    // The frets came from the library, not from the answer.
    expect(block.shape.frets.some((f) => f !== null)).toBe(true);
  });

  it("drops a chord this app cannot spell", () => {
    expect(why({ type: "chordShape", chord: "Hm7", shape: 0 })).toBe("badField");
  });

  it("drops a shape index the chord does not have", () => {
    expect(why({ type: "chordShape", chord: "C", shape: 25 })).toBe("shapeOutOfRange");
  });

  it("drops a guitar-only chord asked for on a bass", () => {
    // `GUITAR_ONLY_QUALITIES` — a bassist does not play a thirteenth.
    expect(why({ type: "chordShape", chord: "C13", shape: 0, instrument: "bass" })).toBe(
      "shapeOutOfRange",
    );
    expect(why({ type: "chordShape", chord: "C13", shape: 0 })).toBe("kept");
  });
});

describe("the neck", () => {
  it("lights a scale up from its root and its name", () => {
    const { blocks } = one({
      type: "fretboard",
      show: { of: "scale", root: "A", scale: "minorPentatonic" },
    });
    expect(blocks[0]).toMatchObject({
      type: "fretboard",
      rootPitchClass: 9,
      // A C E D G — the notes the theory code hands over, not the answer.
      pitchClasses: [9, 0, 2, 4, 7],
      startFret: 0,
      frets: 12,
    });
  });

  it("lights a chord up from its name", () => {
    const { blocks } = one({ type: "fretboard", show: { of: "chord", chord: "Am7" } });
    expect(blocks[0]).toMatchObject({ pitchClasses: [9, 0, 4, 7] });
  });

  it("works a named position out from the tuning", () => {
    // A on the fifth string is fret 12 above the open A, which is fret 0 —
    // pitch class arithmetic, and the position is a hand's worth of frets.
    const a5 = one({
      type: "fretboard",
      show: { of: "chord", chord: "Am7" },
      position: "rootOn5",
    }).blocks[0] as { startFret: number; frets: number };
    expect(a5).toMatchObject({ startFret: 0, frets: 5 });

    // C on the sixth string is the eighth fret, which is where the hand goes.
    const c6 = one({
      type: "fretboard",
      show: { of: "chord", chord: "C" },
      position: "rootOn6",
    }).blocks[0] as { startFret: number };
    expect(c6.startFret).toBe(8);
  });

  it("drops a string the instrument does not have", () => {
    expect(
      why({
        type: "fretboard",
        show: { of: "scale", root: "C", scale: "major" },
        position: "rootOn6",
        instrument: "bass",
      }),
    ).toBe("positionNotOnThisNeck");
    expect(
      why({
        type: "fretboard",
        show: { of: "scale", root: "C", scale: "major" },
        position: "rootOn4",
        instrument: "bass",
      }),
    ).toBe("kept");
  });

  it("drops a scale this app does not know", () => {
    expect(why({ type: "fretboard", show: { of: "scale", root: "C", scale: "klezmer" } })).toBe(
      "badField",
    );
  });
});

describe("a passage of a song", () => {
  it("keeps bars inside the song", () => {
    expect(why({ type: "tabExcerpt", score: "song", fromBar: 17, toBar: 20 })).toBe("kept");
  });

  it("drops a song nobody has imported", () => {
    expect(why({ type: "tabExcerpt", score: "nope", fromBar: 1, toBar: 4 })).toBe("unknownScore");
  });

  it("drops bars past the end, and bars that run backwards", () => {
    expect(why({ type: "tabExcerpt", score: "song", fromBar: 60, toBar: 300 })).toBe(
      "barsOutsideScore",
    );
    expect(why({ type: "tabExcerpt", score: "song", fromBar: 20, toBar: 17 })).toBe(
      "barsOutsideScore",
    );
  });

  it("drops everything about a song when nothing has been imported at all", () => {
    for (const block of [
      { type: "tabExcerpt", score: "song", fromBar: 1, toBar: 4 },
      { type: "progress", score: "song", fromBar: 1, toBar: 4 },
      { type: "action", action: { kind: "loopBars", score: "song", fromBar: 1, toBar: 4 } },
    ]) {
      expect(why(block, {})).toBe("unknownScore");
    }
  });

  it("drops an attempt that is not a run at this song", () => {
    expect(why({ type: "tabExcerpt", score: "song", fromBar: 1, toBar: 4, attempt: 500 })).toBe(
      "unknownAttempt",
    );
    expect(why({ type: "tabExcerpt", score: "song", fromBar: 1, toBar: 4, attempt: 411 })).toBe(
      "kept",
    );
  });
});

describe("progress over time", () => {
  it("keeps a passage with a story behind it", () => {
    const { blocks } = one({ type: "progress", score: "song", fromBar: 1, toBar: 8 });
    expect(blocks[0]).toMatchObject({ points: [{ percent: 61 }, { percent: 94 }] });
  });

  it("drops a passage played once, or never", () => {
    const once = { ...CTX, progressFor: () => [{ at: "a", percent: 61 }] };
    const never = { ...CTX, progressFor: () => null };
    expect(why({ type: "progress", score: "song", fromBar: 1, toBar: 8 }, once)).toBe(
      "nothingRecorded",
    );
    expect(why({ type: "progress", score: "song", fromBar: 1, toBar: 8 }, never)).toBe(
      "nothingRecorded",
    );
  });
});

describe("takes", () => {
  it("keeps a whole take without needing the song loaded", () => {
    expect(why({ type: "take", attempt: 500 })).toBe("kept");
  });

  it("drops part of a take when the song that bounds it is not loaded", () => {
    expect(why({ type: "take", attempt: 500, fromBar: 1, toBar: 4 })).toBe("unknownScore");
  });

  it("drops an attempt nobody made", () => {
    expect(why({ type: "take", attempt: 9 })).toBe("unknownAttempt");
  });

  it("refuses to compare a take with itself", () => {
    expect(why({ type: "compare", attempts: [412, 412] })).toBe("sameTakeTwice");
  });

  it("refuses to compare takes of different songs", () => {
    expect(why({ type: "compare", attempts: [411, 500] })).toBe("unknownAttempt");
  });

  it("compares two goes at the same song, older first", () => {
    const { blocks } = one({ type: "compare", attempts: [411, 412] });
    expect(blocks[0]).toMatchObject({ older: { id: 411 }, newer: { id: 412 } });
  });
});

describe("the button", () => {
  it("labels a loop by its bars, and by its tempo when it has one", () => {
    const plain = one({
      type: "action",
      action: { kind: "loopBars", score: "song", fromBar: 17, toBar: 20 },
    }).blocks[0] as { label: { key: string; values: Record<string, unknown> } };
    expect(plain.label).toEqual({
      key: "coachBlocks.action.loopBars",
      values: { from: 17, to: 20 },
    });

    const tempo = one({
      type: "action",
      action: { kind: "loopBars", score: "song", fromBar: 17, toBar: 20, bpm: 96 },
    }).blocks[0] as { label: { key: string } };
    expect(tempo.label.key).toBe("coachBlocks.action.loopBarsAt");
  });

  it("names the preset and the jam rather than repeating their ids", () => {
    const preset = one({ type: "action", action: { kind: "loadPreset", preset: "warmup" } })
      .blocks[0] as { label: { values: Record<string, unknown> } };
    expect(preset.label.values).toEqual({ name: "Warm-up" });

    const jam = one({ type: "action", action: { kind: "loadJam", jam: "blues" } }).blocks[0] as {
      label: { values: Record<string, unknown> };
    };
    expect(jam.label.values).toEqual({ name: "Slow blues in A" });
  });

  it("drops a preset or a jam the player does not have", () => {
    expect(why({ type: "action", action: { kind: "loadPreset", preset: "nope" } })).toBe(
      "unknownPreset",
    );
    expect(why({ type: "action", action: { kind: "loadJam", jam: "nope" } })).toBe("unknownJam");
  });

  it("drops a ramp that goes nowhere, and keeps one that descends", () => {
    expect(why({ type: "action", action: { kind: "ramp", fromBpm: 120, toBpm: 120 } })).toBe(
      "nothingToDo",
    );
    // U3.7 — a target below the start is a descending drill and is as valid.
    expect(why({ type: "action", action: { kind: "ramp", fromBpm: 120, toBpm: 80 } })).toBe("kept");
  });

  it("drops a tempo outside what the app can be set to", () => {
    expect(why({ type: "action", action: { kind: "ramp", fromBpm: 10, toBpm: 400 } })).toBe(
      "badField",
    );
  });

  it("labels the click by the note it lands on", () => {
    const out = one({ type: "action", action: { kind: "clickSubdivision", subdivision: 4 } })
      .blocks[0] as { label: { key: string } };
    expect(out.label.key).toBe("coachBlocks.action.click.4");
    expect(why({ type: "action", action: { kind: "clickSubdivision", subdivision: 7 } })).toBe(
      "badField",
    );
  });

  it("drops an action kind that is not one", () => {
    expect(why({ type: "action", action: { kind: "deleteEverything" } })).toBe("badField");
  });
});

describe("what survives alongside what does not", () => {
  it("keeps the good blocks and reports each bad one where it was", () => {
    const out = resolveCoachAnswer(
      {
        blocks: [
          { type: "text", text: "Only this and the grip." },
          { type: "chordShape", chord: "Hm7", shape: 0 },
          { type: "chordShape", chord: "Am7", shape: 0 },
          { type: "tabExcerpt", score: "nope", fromBar: 1, toBar: 2 },
        ],
      },
      CTX,
    );
    expect(out.blocks.map((b) => b.type)).toEqual(["text", "chordShape"]);
    expect(out.dropped.map((d) => [d.at, d.type, d.reason])).toEqual([
      [1, "chordShape", "badField"],
      [3, "tabExcerpt", "unknownScore"],
    ]);
    for (const drop of out.dropped) expect(drop.detail.length).toBeGreaterThan(0);
  });
});
