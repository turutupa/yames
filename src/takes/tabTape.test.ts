/**
 * The tab's model: where every fret number is in time.
 *
 * The whole claim W31 makes is "in sync", and this file is what that claim
 * rests on. A fret number is in sync when it is UNDER THE PLAYHEAD at the
 * moment the note was due — so every test below takes a note, works out when
 * the take had it, asks the painter's model where it is at that moment, and
 * expects the playhead's own fraction back. Half tempo, a tempo step inside
 * the passage and the second time round a loop are the three ways that can be
 * wrong, and each has a case here.
 *
 * What a canvas then draws with these numbers is checked by making real clips
 * and looking at frames of them: vitest runs in happy-dom and there is no
 * canvas in it at all.
 */
import { describe, expect, it } from "vitest";
import { buildTabTape, isLit, TAB_HEAD_AT, visibleTabExtras, visibleTabNotes } from "./tabTape";
import { buildTape } from "../songs/camera/tape";
import { buildSchedule } from "../songs/schedule";
import type { BarRange } from "../songs/schedule";
import type { OnsetResult, SongNote, SongScore } from "../songs/types";

const BANDS = { perfect: 25, good: 50, window: 120 };
const RANGE: BarRange = { startBar: 0, endBar: 1 };

/** A quarter note on one string, at one tick. */
function note(id: number, tick: number, string: number, fret: number, extra: Partial<SongNote> = {}): SongNote {
  return {
    id,
    tick,
    durTicks: 960,
    string,
    fret,
    midi: 40 + fret,
    tieFromPrevious: false,
    ghost: false,
    dead: false,
    accent: false,
    techniques: [],
    ...extra,
  };
}

/**
 * Two bars of 4/4 that STEP from 120 to 60 on the second bar line.
 *
 * The step is the point of the fixture: a tab whose spacing did not change
 * with the tempo map would drift out of the music exactly here, and it would
 * look fine for the first bar.
 */
function score(): SongScore {
  return {
    schema: 1,
    id: "s",
    title: "Two bars",
    artist: "",
    source: { fileName: "f.alphatex", format: "alphatex", trackIndex: 0, trackName: "Lead" },
    tuning: [64, 59, 55, 50, 45, 40],
    capo: 0,
    ticksPerQuarter: 960,
    tempoMap: [
      { tick: 0, bpm: 120 },
      { tick: 3840, bpm: 60 },
    ],
    meterMap: [{ bar: 0, numerator: 4, denominator: 4 }],
    bars: [
      { index: 0, startTick: 0, lengthTicks: 3840, printedBar: 0 },
      { index: 1, startTick: 3840, lengthTicks: 3840, printedBar: 1, section: "Chorus" },
    ],
    notes: [
      note(0, 0, 6, 3),
      note(1, 960, 5, 5),
      // A chord: two notes at one tick are ONE onset and two numbers stacked.
      note(2, 1920, 4, 7),
      note(3, 1920, 3, 7),
      // The first note after the tempo step.
      note(4, 3840, 2, 12, { techniques: ["hammer"] }),
      // Tied over from it: nothing is picked, so there is no verdict to paint.
      note(5, 4800, 2, 12, { tieFromPrevious: true }),
    ],
    sections: [{ name: "Chorus", startBar: 1, endBar: 1 }],
  };
}

function tapeOf(tempoPercent: number, passes = 1) {
  const s = score();
  const schedule = buildSchedule(s, RANGE, { loops: passes > 1 });
  const results: OnsetResult[] = [];
  for (let pass = 0; pass < passes; pass++) {
    for (const onset of schedule.onsets) {
      results.push({ id: onset.id, state: "hit", deviationMs: 0, pass });
    }
  }
  const tape = buildTape({
    score: s,
    schedule,
    range: RANGE,
    tempoPercent,
    results,
    extras: [{ beat: 2.5, pass: 0 }],
    bands: BANDS,
  });
  return { score: s, schedule, tape, tab: buildTabTape({ score: s, schedule, tape, range: RANGE, tempoPercent }) };
}

/** Where along the strip a note is, in a window `windowMs` wide. */
function atOf(tab: ReturnType<typeof tapeOf>["tab"], noteIndex: number, nowMs: number, windowMs: number) {
  const found = visibleTabNotes(tab, nowMs, windowMs).find((p) => p.note === tab.notes[noteIndex]);
  return found?.at;
}

describe("the tab, laid out in time", () => {
  it("puts a note under the playhead at the moment it was due, at full tempo", () => {
    const { tab } = tapeOf(100);
    // 4/4 at 120: a quarter is 500 ms, a bar is 2 s.
    expect(tab.notes[0].atMs).toBeCloseTo(0, 6);
    expect(tab.notes[1].atMs).toBeCloseTo(500, 6);
    expect(tab.notes[2].atMs).toBeCloseTo(1000, 6);

    const windowMs = 4000;
    expect(atOf(tab, 1, 500, windowMs)).toBeCloseTo(TAB_HEAD_AT, 6);
    expect(atOf(tab, 2, 1000, windowMs)).toBeCloseTo(TAB_HEAD_AT, 6);
  });

  it("does the same at half speed, with everything twice as far apart", () => {
    const { tab } = tapeOf(50);
    // 50 % of 120 is 60, so a quarter is a second.
    expect(tab.notes[1].atMs).toBeCloseTo(1000, 6);
    expect(tab.notes[2].atMs).toBeCloseTo(2000, 6);
    expect(atOf(tab, 1, 1000, 8000)).toBeCloseTo(TAB_HEAD_AT, 6);
    expect(atOf(tab, 2, 2000, 8000)).toBeCloseTo(TAB_HEAD_AT, 6);
  });

  it("follows a tempo step inside the passage rather than one BPM throughout", () => {
    const { tab } = tapeOf(100);
    // Bar 1 is 2 s at 120. Bar 2 is at 60, so its first note is at 2 s and its
    // quarters last a second — the tie a quarter later is at 3 s. A tab that
    // read `tempoMap[0]` for the whole passage would put it at 2.5 s and be
    // half a beat out for the rest of the piece.
    expect(tab.notes[4].atMs).toBeCloseTo(2000, 6);
    expect(tab.notes[5].atMs).toBeCloseTo(3000, 6);
    expect(atOf(tab, 4, 2000, 4000)).toBeCloseTo(TAB_HEAD_AT, 6);
    expect(atOf(tab, 5, 3000, 4000)).toBeCloseTo(TAB_HEAD_AT, 6);
  });

  it("and the scroll speed changes with it, which is what the step looks like", () => {
    const { tab } = tapeOf(100);
    const windowMs = 4000;
    // Two quarters before the step are 500 ms apart; two after it are 1000.
    const before = tab.notes[1].atMs - tab.notes[0].atMs;
    const after = tab.notes[5].atMs - tab.notes[4].atMs;
    expect(after / before).toBeCloseTo(2, 6);
    // Which on the strip is twice the distance, because the strip is time.
    const gapBefore = atOf(tab, 1, 0, windowMs)! - atOf(tab, 0, 0, windowMs)!;
    const gapAfter = atOf(tab, 5, 3000, windowMs)! - atOf(tab, 4, 3000, windowMs)!;
    expect(gapAfter / gapBefore).toBeCloseTo(2, 6);
  });

  it("puts the second time round a loop a whole pass later, and under the playhead there too", () => {
    const { tab, tape } = tapeOf(100, 2);
    // One pass is two bars: 2 s at 120 plus 4 s at 60.
    expect(tape.passMs).toBeCloseTo(6000, 6);
    const second = tab.notes.filter((n) => n.pass === 1);
    const first = tab.notes.filter((n) => n.pass === 0);
    expect(second.length).toBe(first.length);
    for (let i = 0; i < first.length; i++) {
      expect(second[i].atMs - first[i].atMs).toBeCloseTo(6000, 6);
    }
    const again = visibleTabNotes(tab, 6500, 4000).find(
      (p) => p.note.pass === 1 && Math.round(p.note.atMs) === 6500,
    );
    expect(again, "the second pass's second note is not on the strip").toBeDefined();
    expect(again!.at).toBeCloseTo(TAB_HEAD_AT, 6);
  });

  it("shows two thirds of the window ahead of the playhead and one third behind", () => {
    const { tab } = tapeOf(100);
    const windowMs = 3000;
    const shown = visibleTabNotes(tab, 1000, windowMs);
    expect(shown.length).toBeGreaterThan(0);
    for (const { note: n, at } of shown) {
      expect(at).toBeGreaterThanOrEqual(-0.06);
      expect(at).toBeLessThanOrEqual(1.06);
      // One third of three seconds behind, two thirds ahead.
      expect(n.atMs).toBeGreaterThan(1000 - windowMs * TAB_HEAD_AT - 200);
      expect(n.atMs).toBeLessThan(1000 + windowMs * (1 - TAB_HEAD_AT) + 200);
    }
    // Nothing from the far end of the passage is on the strip at the start.
    expect(visibleTabNotes(tab, 0, windowMs).some((p) => p.note.atMs > 2100)).toBe(false);
  });
});

describe("what the tab says about each note", () => {
  it("has as many lines as the tuning has, named the way a player says them", () => {
    const { tab } = tapeOf(100);
    expect(tab.strings).toBe(6);
    expect(tab.stringNames).toEqual(["E", "B", "G", "D", "A", "E"]);
  });

  it("counts a seven-string file's seventh string", () => {
    const s = score();
    s.tuning = [64, 59, 55, 50, 45, 40, 35];
    const schedule = buildSchedule(s, RANGE);
    const tape = buildTape({
      score: s,
      schedule,
      range: RANGE,
      tempoPercent: 100,
      results: [],
      extras: [],
      bands: BANDS,
    });
    const tab = buildTabTape({ score: s, schedule, tape, range: RANGE, tempoPercent: 100 });
    expect(tab.strings).toBe(7);
    expect(tab.stringNames[6]).toBe("B");
  });

  it("takes the verdict off the tape the review is drawn from, not a second opinion", () => {
    const s = score();
    const schedule = buildSchedule(s, RANGE);
    const results: OnsetResult[] = schedule.onsets.map((onset, i) => ({
      id: onset.id,
      state: i === 1 ? "miss" : "hit",
      deviationMs: i === 1 ? null : i === 2 ? 80 : 0,
      pass: 0,
    }));
    const tape = buildTape({
      score: s,
      schedule,
      range: RANGE,
      tempoPercent: 100,
      results,
      extras: [],
      bands: BANDS,
    });
    const tab = buildTabTape({ score: s, schedule, tape, range: RANGE, tempoPercent: 100 });
    // Onset 1 is the note at tick 960; onset 2 is the two-note chord at 1920,
    // and both of its numbers wear the one verdict the strum earned.
    expect(tab.notes[1].mark).toBe("missed");
    expect(tab.notes[2].mark).toBe("late");
    expect(tab.notes[3].mark).toBe("late");
  });

  it("paints no verdict on a tie, because nothing was picked", () => {
    const { tab } = tapeOf(100);
    expect(tab.notes[5].onsetId).toBeNull();
    expect(tab.notes[5].mark).toBeNull();
    // ...and the note it is tied from still has one.
    expect(tab.notes[4].mark).toBe("onTime");
  });

  it("keeps the notes a player was never asked for, on the same axis", () => {
    const { tab } = tapeOf(100);
    // Beat 2.5 at 120 BPM is 1250 ms.
    expect(tab.extras.map((e) => Math.round(e.atMs))).toEqual([1250]);
    const shown = visibleTabExtras(tab, 1250, 4000);
    expect(shown.length).toBe(1);
    expect(shown[0].at).toBeCloseTo(TAB_HEAD_AT, 6);
  });

  it("lights a number while it is sounding and lets it go afterwards", () => {
    const { tab } = tapeOf(100);
    const quarter = tab.notes[1];
    expect(isLit(quarter, quarter.atMs - 200)).toBe(false);
    expect(isLit(quarter, quarter.atMs)).toBe(true);
    expect(isLit(quarter, quarter.atMs + 400)).toBe(true);
    expect(isLit(quarter, quarter.atMs + 900)).toBe(false);
  });
});
