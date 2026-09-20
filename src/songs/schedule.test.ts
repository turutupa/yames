// The schedule is the only thing the analyzer ever sees, so a mistake here is
// a player being marked down for playing the passage correctly. The three
// rules that matter — a chord is one attack, a tie is none, a hammer-on is
// one that may not be audible — each have a test whose failure would be
// exactly that complaint.
import { describe, expect, it } from "vitest";
import { importSong } from "./import";
import {
  buildSchedule,
  clampRange,
  meterAt,
  rangeTempo,
  rangeTicks,
  sectionRange,
  tempoAt,
  wholeSong,
} from "./schedule";
import { TICKS_PER_QUARTER } from "./types";
import type { SongScore } from "./types";
import {
  CHORD_THEN_SINGLES,
  HAMMER_AND_PULL,
  REPEAT_WITH_ENDINGS,
  SECTIONS,
  TEMPO_AND_SEVEN_EIGHT,
  texBytes,
} from "./fixtures";

function load(tex: string): SongScore {
  return importSong(texBytes(tex), "fixture.alphatex", 0).score;
}

describe("a chord is one onset", () => {
  const score = load(CHORD_THEN_SINGLES);
  const schedule = buildSchedule(score);

  it("counts a three-note chord once, not three times", () => {
    // Four beats in the bar: a chord and three single notes.
    expect(schedule.onsets).toHaveLength(4);
    expect(schedule.onsets[0].noteIds).toHaveLength(3);
    expect(schedule.onsets[1].noteIds).toHaveLength(1);
  });

  it("puts the onsets on the beats, counted in quarter notes", () => {
    expect(schedule.onsets.map((o) => o.beat)).toEqual([0, 1, 2, 3]);
  });

  it("numbers the onsets from zero so a result can point back at one", () => {
    expect(schedule.onsets.map((o) => o.id)).toEqual([0, 1, 2, 3]);
  });

  it("measures the range in quarter notes", () => {
    expect(schedule.lengthBeats).toBe(4);
  });

  it("does not loop unless it is asked to", () => {
    expect(schedule.loops).toBe(false);
    expect(buildSchedule(score, wholeSong(score), { loops: true }).loops).toBe(true);
  });
});

describe("a tie makes no onset", () => {
  const score = load(REPEAT_WITH_ENDINGS);
  const schedule = buildSchedule(score);

  it("leaves the tied note out of the onsets entirely", () => {
    const tied = score.notes.find((n) => n.tieFromPrevious)!;
    const onsetAtTie = schedule.onsets.find(
      (o) => o.beat === (tied.tick - score.bars[0].startTick) / TICKS_PER_QUARTER,
    );
    expect(onsetAtTie).toBeUndefined();
    expect(schedule.onsets.some((o) => o.noteIds.includes(tied.id))).toBe(false);
  });

  it("counts one onset per remaining note in a single-note line", () => {
    // Six bars of four quarters, minus the one tied note.
    expect(schedule.onsets).toHaveLength(6 * 4 - 1);
  });
});

describe("a hammer-on is soft", () => {
  it("flags the hammered note, and not the picked one before it", () => {
    const score = load(HAMMER_AND_PULL);
    const schedule = buildSchedule(score);
    // 5 (picked), 7 (hammered), 7 (picked), 5 (pulled).
    expect(schedule.onsets.map((o) => o.soft)).toEqual([false, true, false, true]);
  });

  it("does not call a chord soft when one of its notes was picked", () => {
    // A hammered note struck together with a plucked one is audible: the
    // attack happened, whatever the other finger did.
    const score = load(CHORD_THEN_SINGLES);
    const mixed: SongScore = {
      ...score,
      notes: score.notes.map((n, i) =>
        n.tick === 0 && i === 0 ? { ...n, techniques: ["hammer" as const] } : n,
      ),
    };
    expect(buildSchedule(mixed).onsets[0].soft).toBe(false);
  });

  it("calls it soft only when every note in the group was hammered", () => {
    const score = load(CHORD_THEN_SINGLES);
    const allHammered: SongScore = {
      ...score,
      notes: score.notes.map((n) =>
        n.tick === 0 ? { ...n, techniques: ["hammer" as const] } : n,
      ),
    };
    expect(buildSchedule(allHammered).onsets[0].soft).toBe(true);
  });
});

describe("an accent carries through", () => {
  it("marks the onset when any note in it is accented", () => {
    const score = load(CHORD_THEN_SINGLES);
    const accented: SongScore = {
      ...score,
      notes: score.notes.map((n, i) => (i === 1 ? { ...n, accent: true } : n)),
    };
    const schedule = buildSchedule(accented);
    expect(schedule.onsets[0].accent).toBe(true);
    expect(schedule.onsets[1].accent).toBe(false);
  });
});

describe("a bar range", () => {
  const score = load(REPEAT_WITH_ENDINGS);

  it("counts beats from the start of the range, not of the song", () => {
    const schedule = buildSchedule(score, { startBar: 2, endBar: 3 });
    expect(schedule.onsets[0].beat).toBe(0);
    expect(schedule.lengthBeats).toBe(8);
    expect(schedule.onsets).toHaveLength(8);
  });

  it("takes the bars asked for and nothing either side", () => {
    const { start, end } = rangeTicks(score, { startBar: 1, endBar: 1 });
    expect(start).toBe(3840);
    expect(end).toBe(7680);
    expect(buildSchedule(score, { startBar: 1, endBar: 1 }).onsets).toHaveLength(4);
  });

  it("holds a range inside the song and turns a backwards one round", () => {
    expect(clampRange(score, { startBar: 4, endBar: 1 })).toEqual({ startBar: 1, endBar: 4 });
    expect(clampRange(score, { startBar: -3, endBar: 99 })).toEqual({ startBar: 0, endBar: 5 });
    expect(clampRange(score, { startBar: 1.6, endBar: 2.2 })).toEqual({ startBar: 2, endBar: 2 });
  });

  it("finds a section by name, and falls back to the whole song", () => {
    const sectioned = load(SECTIONS);
    expect(sectionRange(sectioned, "Chorus")).toEqual({ startBar: 2, endBar: 3 });
    expect(sectionRange(sectioned, "Bridge")).toEqual({ startBar: 0, endBar: 3 });
  });

  it("schedules a section as its own little song", () => {
    const sectioned = load(SECTIONS);
    const schedule = buildSchedule(sectioned, sectionRange(sectioned, "Chorus"), { loops: true });
    expect(schedule.lengthBeats).toBe(8);
    expect(schedule.loops).toBe(true);
    expect(schedule.onsets[0].beat).toBe(0);
  });
});

describe("the tempo a range starts at", () => {
  const score = load(TEMPO_AND_SEVEN_EIGHT);

  it("reads the step in force, not the top of the song", () => {
    expect(tempoAt(score, 0)).toBe(100);
    expect(tempoAt(score, 3839)).toBe(100);
    expect(tempoAt(score, 3840)).toBe(140);
    expect(tempoAt(score, 99999)).toBe(140);
  });

  it("gives a section that starts after a change that change's tempo", () => {
    // Looping bar 2 at 100 % must click at 140, not at the song's opening 100.
    expect(rangeTempo(score, { startBar: 1, endBar: 2 }, 100)).toBe(140);
    expect(rangeTempo(score, { startBar: 0, endBar: 0 }, 100)).toBe(100);
  });

  it("takes a percentage of what is written", () => {
    expect(rangeTempo(score, { startBar: 0, endBar: 0 }, 50)).toBe(50);
    expect(rangeTempo(score, { startBar: 0, endBar: 0 }, 70)).toBe(70);
    expect(rangeTempo(score, { startBar: 1, endBar: 1 }, 50)).toBe(70);
  });

  it("never asks the engine for a tempo it cannot play", () => {
    expect(rangeTempo(score, { startBar: 0, endBar: 0 }, 1)).toBeGreaterThanOrEqual(20);
  });

  it("knows the meter each bar is counted in", () => {
    expect(meterAt(score, 0)).toEqual({ numerator: 4, denominator: 4 });
    expect(meterAt(score, 1)).toEqual({ numerator: 4, denominator: 4 });
    expect(meterAt(score, 2)).toEqual({ numerator: 7, denominator: 8 });
  });
});

describe("the whole song", () => {
  it("covers every bar", () => {
    const score = load(REPEAT_WITH_ENDINGS);
    expect(wholeSong(score)).toEqual({ startBar: 0, endBar: 5 });
    const { start, end } = rangeTicks(score, wholeSong(score));
    expect(start).toBe(0);
    expect(end).toBe(6 * 3840);
  });

  it("schedules a repeat's second time round as its own onsets", () => {
    const score = load(REPEAT_WITH_ENDINGS);
    const schedule = buildSchedule(score);
    // Bar 0 is played again as bar 3: the same music, twelve beats later.
    const first = schedule.onsets.filter((o) => o.beat >= 0 && o.beat < 4);
    const second = schedule.onsets.filter((o) => o.beat >= 12 && o.beat < 16);
    expect(second.map((o) => o.beat - 12)).toEqual(first.map((o) => o.beat));
  });
});
