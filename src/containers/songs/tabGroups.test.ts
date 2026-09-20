/**
 * The map from an onset of the schedule to a group of the engraving.
 *
 * Driven from the real importer and a real parse rather than from hand-built
 * objects, because the two things this can get wrong are both things only the
 * real model has: alphaTab's own beat ids, and the unroll of a repeat.
 */
import { describe, expect, it } from "vitest";
import { model } from "@coderline/alphatab";
import { buildSongScore, parseSongFile } from "../../songs/import";
import { buildSchedule, wholeSong } from "../../songs/schedule";
import { REPEAT_WITH_ENDINGS, texBytes } from "../../songs/fixtures";
import { beatGroupClass, groupClassByTick, lightTargets, tickByOnset } from "./tabGroups";
import type { EngravedBar } from "./tabGroups";

function printedBars(atScore: model.Score, trackIndex: number): readonly EngravedBar[] {
  return atScore.tracks[trackIndex].staves[0].bars;
}

describe("the group a note is engraved in", () => {
  const bytes = texBytes(REPEAT_WITH_ENDINGS);
  const parsed = parseSongFile(bytes, "repeat.alphatex");
  const { score } = buildSongScore(parsed, 0, bytes);
  const bars = printedBars(parsed.atScore, 0);

  it("names every played tick that carries an attack", () => {
    const byTick = groupClassByTick(score, bars);
    // Every note of the score is on a tick that has a group, or the lights
    // would silently miss notes on the page.
    for (const note of score.notes) {
      expect(byTick.has(note.tick), `tick ${String(note.tick)}`).toBe(true);
    }
  });

  it("sends both times round a repeat to the one bar that is printed", () => {
    const byTick = groupClassByTick(score, bars);
    // The fixture plays printed bars 0,1,2, 0,1,3 — so played bar 3 is a
    // second visit to printed bar 0 and must land on the same groups.
    const first = score.bars[0];
    const second = score.bars.find((bar) => bar.index > 0 && bar.printedBar === 0);
    expect(second).toBeDefined();
    expect(byTick.get(first.startTick)).toBe(byTick.get(second!.startTick));
  });

  it("gives each onset the tick its own notes are on", () => {
    const schedule = buildSchedule(score, wholeSong(score), { loops: false });
    const ticks = tickByOnset(score, schedule);
    expect(ticks.size).toBe(schedule.onsets.length);
    for (const onset of schedule.onsets) {
      const noteTicks = onset.noteIds.map((id) => score.notes[id].tick);
      expect(new Set(noteTicks).size).toBe(1);
      expect(ticks.get(onset.id)).toBe(noteTicks[0]);
    }
  });

  it("resolves a lit onset to a class the engraving actually wrote", () => {
    const schedule = buildSchedule(score, wholeSong(score), { loops: false });
    const ticks = tickByOnset(score, schedule);
    const classes = groupClassByTick(score, bars);
    const lights = new Map([[schedule.onsets[0].id, "onTime" as const]]);

    const targets = lightTargets(lights, ticks, classes);
    expect(targets).toHaveLength(1);
    expect(targets[0].mark).toBe("onTime");

    // The class names a beat of the model — the same id alphaTab writes into
    // the SVG — rather than anything this file invented.
    const beatIds = new Set<string>();
    for (const bar of bars)
      for (const voice of bar.voices)
        for (const beat of voice.beats) beatIds.add(beatGroupClass(beat.id));
    expect(beatIds.has(targets[0].className)).toBe(true);
  });

  it("drops an onset the engraving has no beat for, rather than guessing", () => {
    const classes = groupClassByTick(score, bars);
    const ticks = new Map([[99, 7_777_777]]);
    expect(lightTargets(new Map([[99, "missed" as const]]), ticks, classes)).toEqual([]);
  });

  it("costs nothing when nothing is lit", () => {
    const classes = groupClassByTick(score, bars);
    expect(lightTargets(new Map<number, string>(), new Map(), classes)).toEqual([]);
  });
});
