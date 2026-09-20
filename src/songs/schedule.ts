/**
 * The schedule — what scoring is told to expect.
 *
 * A `SongScore` says what is written. A `ScoreSchedule` says what should be
 * *heard*, over the range the player chose, and it is the only thing the
 * analyzer ever sees. Three rules from `plans/tasks/songs/BRIEF.md` make the
 * translation, and each exists because getting it wrong would score a player
 * down for playing correctly:
 *
 * - **Notes sharing a tick are one onset.** A six-string chord is one attack,
 *   not six; scoring six would mark five misses for one strum.
 * - **A tied continuation makes no onset.** Nothing is picked, so there is
 *   nothing to hear and nothing to be late for.
 * - **A hammer-on or a pull-off is `soft`.** It is fretted, not picked, and a
 *   quiet one genuinely may not reach the microphone. A soft onset that never
 *   arrives is `softAbsent`, not a miss.
 */
import { TICKS_PER_QUARTER } from "./types";
import type { ExpectedOnset, ScoreSchedule, SongScore } from "./types";

/** A half-open range of played bars, `[startBar, endBar]` inclusive. */
export type BarRange = { startBar: number; endBar: number };

/** The whole song, as a range. */
export function wholeSong(score: SongScore): BarRange {
  return { startBar: 0, endBar: Math.max(0, score.bars.length - 1) };
}

/** The range a named section covers, or the whole song when it is gone. */
export function sectionRange(score: SongScore, name: string): BarRange {
  const section = score.sections.find((s) => s.name === name);
  return section ? { startBar: section.startBar, endBar: section.endBar } : wholeSong(score);
}

/** Hold a range inside the song, and the right way round. */
export function clampRange(score: SongScore, range: BarRange): BarRange {
  const last = Math.max(0, score.bars.length - 1);
  const a = Math.min(Math.max(0, Math.round(range.startBar)), last);
  const b = Math.min(Math.max(0, Math.round(range.endBar)), last);
  return { startBar: Math.min(a, b), endBar: Math.max(a, b) };
}

/** Where a range begins and ends in ticks. */
export function rangeTicks(score: SongScore, range: BarRange): { start: number; end: number } {
  const { startBar, endBar } = clampRange(score, range);
  const first = score.bars[startBar];
  const last = score.bars[endBar];
  if (!first || !last) return { start: 0, end: 0 };
  return { start: first.startTick, end: last.startTick + last.lengthTicks };
}

/**
 * Build the schedule for a range.
 *
 * `beat` is quarter notes from the start of the RANGE, not of the song, so
 * looping bars 17–24 hands the analyzer a schedule that starts at 0 — it never
 * needs to know where in the song it is.
 */
export function buildSchedule(
  score: SongScore,
  range: BarRange = wholeSong(score),
  options: { loops?: boolean } = {},
): ScoreSchedule {
  const { start, end } = rangeTicks(score, range);
  const lengthBeats = (end - start) / TICKS_PER_QUARTER;

  // Group by tick. The notes are already sorted by tick, so one pass would do;
  // a map keeps it honest if that ever stops being true.
  const byTick = new Map<number, typeof score.notes>();
  for (const note of score.notes) {
    if (note.tick < start || note.tick >= end) continue;
    // A tie is not an attack, so it never opens a group and never joins one.
    if (note.tieFromPrevious) continue;
    const at = byTick.get(note.tick);
    if (at) at.push(note);
    else byTick.set(note.tick, [note]);
  }

  const onsets: ExpectedOnset[] = [];
  for (const tick of [...byTick.keys()].sort((a, b) => a - b)) {
    const group = byTick.get(tick)!;
    onsets.push({
      id: onsets.length,
      beat: (tick - start) / TICKS_PER_QUARTER,
      noteIds: group.map((n) => n.id),
      // Soft only when NOTHING here was picked. One plucked note in the
      // group and the attack is audible, whatever the others were.
      soft: group.every((n) => n.techniques.includes("hammer") || n.techniques.includes("pull")),
      accent: group.some((n) => n.accent),
    });
  }

  return { onsets, lengthBeats, loops: options.loops ?? false };
}

/**
 * The tempo a range starts at.
 *
 * This wave's engine clicks at one tempo for the whole pass (`W4-SONGS.md`
 * stage C); the tempo map goes to the engine in the next one. So what the
 * click needs is the tempo in force where the range begins, which is the last
 * step at or before it — not `tempoMap[0]`, which is the top of the song and
 * may be nothing like the section you are looping.
 */
export function tempoAt(score: SongScore, tick: number): number {
  let bpm = score.tempoMap[0]?.bpm ?? 120;
  for (const step of score.tempoMap) {
    if (step.tick > tick) break;
    bpm = step.bpm;
  }
  return bpm;
}

/** The click's tempo for a range, at a percentage of what is written. */
export function rangeTempo(score: SongScore, range: BarRange, percent: number): number {
  const { start } = rangeTicks(score, range);
  const written = tempoAt(score, start);
  return Math.max(20, Math.round((written * percent) / 100));
}

/** The meter in force at a played bar — what the engine counts in. */
export function meterAt(score: SongScore, bar: number): { numerator: number; denominator: number } {
  let meter = score.meterMap[0] ?? { bar: 0, numerator: 4, denominator: 4 };
  for (const step of score.meterMap) {
    if (step.bar > bar) break;
    meter = step;
  }
  return { numerator: meter.numerator, denominator: meter.denominator };
}
