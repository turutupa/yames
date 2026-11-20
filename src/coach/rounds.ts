/**
 * A Take's bars, counted the way a player counts them.
 *
 * A Take repeats a short pattern (`exercise.bars`) for ten bars or more
 * (`session/take.ts` `writtenOut`), so bars 1, 5 and 9 of a four-bar tune are
 * one bar of the tune played on three rounds. The coach never says "bars 1 and
 * 5" (DESIGN section 2; REVIEW row 2): it folds every played bar onto the bar
 * of the pattern it is, and counts the rounds.
 *
 * Bars here are what the scorer and the findings use: played bars, from 0, in
 * played order (`score.rs` `BarMetrics`, `findings.rs` `Finding.bars`). A
 * Session Take's count-in is in the transport, not in the score, so it is not
 * among them; `countInBars` is there for a numbering that does carry it.
 * Rounds and pattern bars come out from 1, as the player counts.
 *
 * Comparisons between Takes are keyed on (variant, pattern bar): the second bar
 * of another variant is other notes, and "the same place" would be a lie.
 */
import type { OnsetResult, ScoreSchedule, SongScore } from "../songs/types";

/** Where one played bar falls in the tune. Both from 1. */
export type Folded = { round: number; patternBar: number };

/** The pattern's length in bars, never less than one. */
function lengthOf(patternBars: number): number {
  return Math.max(1, Math.floor(patternBars));
}

/**
 * Fold a played bar (from 0) onto (round, pattern bar). Null for a bar of the
 * count-in, or one that is not a bar at all.
 */
export function foldBar(playedBar: number, patternBars: number, countInBars = 0): Folded | null {
  const at = Math.floor(playedBar) - Math.max(0, Math.floor(countInBars));
  if (!Number.isFinite(at) || at < 0) return null;
  const length = lengthOf(patternBars);
  return { round: Math.floor(at / length) + 1, patternBar: (at % length) + 1 };
}

/** How many rounds a Take of `takeBars` bars starts: a partial last one counts. */
export function roundsIn(takeBars: number, patternBars: number): number {
  if (takeBars <= 0) return 0;
  return Math.ceil(takeBars / lengthOf(patternBars));
}

/**
 * How many of those rounds reach this pattern bar (from 1). A ten-bar Take of
 * a four-bar tune plays its first two bars three times and its last two twice.
 */
export function roundsOfPatternBar(takeBars: number, patternBars: number, patternBar: number): number {
  const length = lengthOf(patternBars);
  if (patternBar < 1 || patternBar > length || takeBars <= 0) return 0;
  const whole = Math.floor(takeBars / length);
  return whole + (takeBars % length >= patternBar ? 1 : 0);
}

/** The pattern bars (from 1) a span of played bars (from 0, inclusive) touches, in tune order. */
export function patternBarsOf(span: readonly [number, number], patternBars: number, countInBars = 0): number[] {
  const seen = new Set<number>();
  for (let bar = Math.min(span[0], span[1]); bar <= Math.max(span[0], span[1]); bar += 1) {
    const folded = foldBar(bar, patternBars, countInBars);
    if (folded) seen.add(folded.patternBar);
    if (seen.size >= lengthOf(patternBars)) break;
  }
  return [...seen].sort((a, b) => a - b);
}

/** The key two Takes are compared on: which notes, and which bar of them. */
export function spotKey(variantSeed: number | null | undefined, patternBar: number): string {
  return `${variantSeed ?? "-"}:${patternBar}`;
}

/** One played bar as judged: from 1, and whether it held. */
export type JudgedBar = { n: number; state: "met" | "missed" | "thin" };

/** How a pattern bar did over a Take: in how many rounds it slipped, of how many judged. */
export type RoundCount = {
  patternBar: number;
  /** Rounds (from 1) in which it slipped. */
  slippedIn: number[];
  /** Rounds in which it could be judged: a bar with too few notes to say is not one. */
  of: number;
};

/**
 * Count rounds per pattern bar from the bar-by-bar strip ("on two rounds of
 * three"). Indexed by pattern bar from 1; entry 0 is unused.
 */
export function countRounds(cells: readonly JudgedBar[], patternBars: number): RoundCount[] {
  const length = lengthOf(patternBars);
  const out: RoundCount[] = Array.from({ length: length + 1 }, (_unused, patternBar) => ({
    patternBar,
    slippedIn: [],
    of: 0,
  }));
  for (const cell of cells) {
    const folded = foldBar(cell.n - 1, length);
    if (!folded || cell.state === "thin") continue;
    const count = out[folded.patternBar];
    count.of += 1;
    if (cell.state === "missed") count.slippedIn.push(folded.round);
  }
  return out;
}

/** The scorer's beat (quarters from the range's start) as a played bar, from 0. Null past the score. */
function barAtBeat(score: Pick<SongScore, "bars" | "ticksPerQuarter">, beat: number): number | null {
  const tick = beat * score.ticksPerQuarter;
  for (const bar of score.bars) {
    if (tick >= bar.startTick && tick < bar.startTick + bar.lengthTicks) return bar.index;
  }
  return null;
}

/** One heard note's deviation, with the played bar it fell in. */
export type BarDeviation = { onsetId: number; bar: number; deviationMs: number };

/**
 * The heard notes of a Take, each with its signed deviation (negative is
 * early) and its played bar. Misses and soft notes that never came carry no
 * deviation and are left out; so is a note the schedule does not know.
 */
export function deviationsByBar(
  score: Pick<SongScore, "bars" | "ticksPerQuarter">,
  schedule: Pick<ScoreSchedule, "onsets">,
  results: readonly OnsetResult[] | undefined,
): BarDeviation[] {
  if (!results || results.length === 0) return [];
  const beats = new Map(schedule.onsets.map((o) => [o.id, o.beat] as const));
  const out: BarDeviation[] = [];
  for (const r of results) {
    if (r.state !== "hit" || typeof r.deviationMs !== "number" || !Number.isFinite(r.deviationMs)) continue;
    const beat = beats.get(r.id);
    if (beat === undefined) continue;
    const bar = barAtBeat(score, beat);
    if (bar === null) continue;
    out.push({ onsetId: r.id, bar, deviationMs: r.deviationMs });
  }
  return out;
}

/** The median of a list; 0 for none. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The signed mean deviation of each pattern bar, in whole ms, relative to the
 * Take's median deviation (DESIGN 9.3, `TakeFacts.lean`). Positive is late.
 *
 * Relative because the scorer's lag correction absorbs a lean the whole Take
 * shares: "this bar sat later than the rest of the Take" is what was measured,
 * "this bar was late" is not. `null` for a pattern bar with no heard note: no
 * number is made up for it. Empty when nothing was heard.
 */
export function leanPerPatternBar(deviations: readonly BarDeviation[], patternBars: number): Array<number | null> {
  if (deviations.length === 0) return [];
  const length = lengthOf(patternBars);
  const centre = median(deviations.map((d) => d.deviationMs));
  const sums = new Array<number>(length).fill(0);
  const counts = new Array<number>(length).fill(0);
  for (const d of deviations) {
    const folded = foldBar(d.bar, length);
    if (!folded) continue;
    sums[folded.patternBar - 1] += d.deviationMs - centre;
    counts[folded.patternBar - 1] += 1;
  }
  return sums.map((sum, i) => (counts[i] === 0 ? null : Math.round(sum / counts[i])));
}

/**
 * `TakeFacts.lean` for a Take's review, or null when it has nothing to say
 * (no review, nothing heard): what the Session stores with the Take.
 */
export function takeLean(
  review: {
    score: Pick<SongScore, "bars" | "ticksPerQuarter">;
    schedule: Pick<ScoreSchedule, "onsets">;
    segment?: { onsetResults?: OnsetResult[] } | null;
  } | null,
  patternBars: number,
): Array<number | null> | null {
  if (!review) return null;
  const lean = leanPerPatternBar(deviationsByBar(review.score, review.schedule, review.segment?.onsetResults), patternBars);
  return lean.length > 0 && lean.some((v) => v !== null) ? lean : null;
}
