/**
 * The Notebook's "What I've noticed" (DESIGN 6.7), as data.
 *
 * `tendencies(rows, now, options)` reads the stored Takes (the 500-Take window
 * `useSessionRun` reads, newest first) and returns the lines it can stand
 * behind. Every line compares the player with themselves, says only what was
 * measured, and names its evidence: how many Takes, on which Exercises, between
 * which dates. No cause, no advice, no praise. When there is too little to say,
 * it says nothing.
 *
 * The rules, each held by a test over a fixture history:
 * - at least `MIN_TAKES` (five) Takes of evidence behind every line;
 * - a Take the player marked not fair is left out of every measured line (the
 *   minutes line counts it: a not-fair Take's minutes were still played, and
 *   Progress counts them);
 * - an ungraded Take, or one where too little was heard, carries no measure:
 *   it counts only toward the tempo and minutes lines, so an ungraded player
 *   gets those and nothing else;
 * - a line whose id is in `coach.suppressed` is left out for thirty days;
 * - only the newest `TAKES_WINDOW` (500) rows are read, whatever is passed;
 * - Takes on the player's own exercises (`CUSTOM_PATH_ID`, `paths/custom.ts`)
 *   are never read for a measured line or a tempo (their minutes count, as in
 *   Progress).
 *
 * Pure: no store, no React, no clock but `now`. Build it on demand (when the
 * Notebook opens), never in a render or per beat.
 */
import type { PathTakeRow } from "../ipc";
import type { CueTrigger, Exercise, PathDoc } from "../paths/format";
import { placeTriggers } from "../paths/cues";
import { findExercise } from "../session/packs";
import { CUSTOM_PATH_ID } from "../paths/custom";
import { factsOf, isMarkedNotFair, isUngradedTake, leanOf, sessionKeyOf } from "../session/progress";
import { withVariant } from "../session/take";
import { totalsFrom } from "../session/totals";
import { biasThresholdMs } from "./takeNote";
import { isSuppressed, type Suppressed } from "./store";

/** `useSessionRun`'s `TAKES_TO_READ`: the window every coach sentence is measured over. */
export const TAKES_WINDOW = 500;
/** DESIGN 6.7: five Takes of evidence before a line appears. */
export const MIN_TAKES = 5;
/** A lean or place line reads the newest this many Takes that can show it ("5 of your last 7"). */
export const RECENT_TAKES = 10;
/** And appears when at least this share of them showed it. */
export const SHOWN_SHARE = 0.6;
/** Evenness must drop by this many points (of 100) at the faster tempo, on every Exercise, to be a line. */
export const MIN_EVENNESS_DROP = 5;
/** Two tempos are compared only with at least this many Takes at each. */
export const MIN_TAKES_PER_TEMPO = 2;
/** Minutes per Session: at least this many Sessions, compared newer half against older half (three against three). */
export const MIN_SESSIONS = 6;
/** The newest this many Sessions are read for the minutes line. */
export const RECENT_SESSIONS = 8;
/** And the two halves must differ by at least this many whole minutes. */
export const MIN_MINUTES_CHANGE = 2;
/** The Path the player's own exercises are stored under (`paths/custom.ts`): kept out of tendencies. */
export const OWN_EXERCISES_PATH = CUSTOM_PATH_ID;

export type TendencyKind = "tempoEvenness" | "lean" | "place" | "tempoPlayed" | "minutes";

/** The bar triggers of `paths/cues.ts` a place line reads (DESIGN 4.2's "after a held note", open string, shift). */
export const PLACE_KINDS = ["afterHeld", "openString", "shift"] as const satisfies readonly CueTrigger[];
export type PlaceKind = (typeof PLACE_KINDS)[number];

export type ExerciseRef = { pathId: string; exerciseId: string };

export type NoticedLine = {
  /** Stable across runs for the same statement: what `coach.suppressed` keys on. */
  id: string;
  kind: TendencyKind;
  /** The sentence: an i18n key under `notebook.noticed`, and its values. */
  key: string;
  values: Record<string, string | number>;
  /**
   * The evidence line ("From 7 Takes · 11 to 19 Nov"): an i18n key under
   * `notebook.evidence`, with `count` (Takes) and `exercises`; `from` and `to`
   * are left for the caller to fill with the window's dates in the locale's format.
   */
  evidence: { key: string; values: { count: number; exercises: number } };
  /** The Exercises the line rests on. */
  exercises: ExerciseRef[];
  /** The Takes it rests on, newest first. */
  takeIds: string[];
  /** The window: the oldest and newest of those Takes (ms). */
  from: number;
  to: number;
};

export type TendencyOptions = {
  /** The Paths, for an Exercise's notes and meter. Without them no place line, and minutes read 4/4. */
  paths?: readonly PathDoc[];
  /** `coach.suppressed`. */
  suppressed?: Suppressed;
};

// ---------------------------------------------------------------------------
// Which rows count for what
// ---------------------------------------------------------------------------

/**
 * Every Take in the window, newest first, at most 500: what Progress counts
 * (`totalsFrom`). The minutes line reads these, because minutes played are
 * minutes played whether the Take was fair or on the player's own exercise.
 */
export function playedOf(rows: readonly PathTakeRow[]): PathTakeRow[] {
  return [...rows].sort((a, b) => b.startedAt - a.startedAt).slice(0, TAKES_WINDOW);
}

/** The window the measured lines read: `playedOf`, less Takes marked not fair and the player's own exercises. */
export function windowOf(rows: readonly PathTakeRow[]): PathTakeRow[] {
  return playedOf(rows).filter((t) => t.pathId !== OWN_EXERCISES_PATH && !isMarkedNotFair(t));
}

/** A Take whose measures can be compared: graded and heard. */
function measured(take: PathTakeRow): boolean {
  return take.caught && !isUngradedTake(take);
}

function evennessOf(take: PathTakeRow): number | null {
  const e = factsOf(take).measures?.evenness;
  return typeof e === "number" && Number.isFinite(e) && e >= 0 && e <= 1 ? e : null;
}

const exKey = (t: Pick<PathTakeRow, "pathId" | "exerciseId">) => `${t.pathId}/${t.exerciseId}`;
const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function refsOf(takes: readonly PathTakeRow[]): ExerciseRef[] {
  const seen = new Map<string, ExerciseRef>();
  for (const t of takes) if (!seen.has(exKey(t))) seen.set(exKey(t), { pathId: t.pathId, exerciseId: t.exerciseId });
  return [...seen.values()];
}

function exerciseOf(paths: readonly PathDoc[] | undefined, take: PathTakeRow): Exercise | null {
  const path = paths?.find((p) => p.id === take.pathId);
  const hit = path ? findExercise(path, take.exerciseId) : null;
  return hit ? withVariant(hit.exercise, take.variantSeed) : null;
}

function titleOf(paths: readonly PathDoc[] | undefined, take: PathTakeRow): string | null {
  const path = paths?.find((p) => p.id === take.pathId);
  return (path && findExercise(path, take.exerciseId)?.exercise.title) || null;
}

function line(
  id: string,
  kind: TendencyKind,
  key: string,
  values: Record<string, string | number>,
  takes: readonly PathTakeRow[],
): NoticedLine {
  const sorted = [...takes].sort((a, b) => b.startedAt - a.startedAt);
  const exercises = refsOf(sorted);
  return {
    id,
    kind,
    key: `notebook.noticed.${key}`,
    values,
    evidence: {
      key: exercises.length === 1 ? "notebook.evidence.oneExercise" : "notebook.evidence.exercises",
      values: { count: sorted.length, exercises: exercises.length },
    },
    exercises,
    takeIds: sorted.map((t) => t.id),
    from: sorted[sorted.length - 1].startedAt,
    to: sorted[0].startedAt,
  };
}

// ---------------------------------------------------------------------------
// Tempo against evenness ("At 100 your Takes were 74% even; at 90, 85%")
// ---------------------------------------------------------------------------

function tempoEvenness(window: readonly PathTakeRow[]): NoticedLine | null {
  // Exercise → tempo → its Takes with an evenness.
  const byEx = new Map<string, Map<number, PathTakeRow[]>>();
  for (const t of window) {
    if (!measured(t) || evennessOf(t) === null) continue;
    const tempos = byEx.get(exKey(t)) ?? new Map<number, PathTakeRow[]>();
    tempos.set(t.bpm, [...(tempos.get(t.bpm) ?? []), t]);
    byEx.set(exKey(t), tempos);
  }
  // Every (fast, slow) pair some Exercise was played at, enough times at each.
  // `fastE` / `slowE` hold one evenness per Take (c4a2b, L8): the sentence's
  // "your Takes were 74% even" is the mean over exactly the Takes the evidence
  // line counts; the per-Exercise means only decide whether every Exercise dropped.
  type Pair = { fast: number; slow: number; takes: PathTakeRow[]; fastE: number[]; slowE: number[]; drops: number[] };
  const pairs = new Map<string, Pair>();
  for (const tempos of byEx.values()) {
    const bpms = [...tempos.keys()].filter((b) => tempos.get(b)!.length >= MIN_TAKES_PER_TEMPO).sort((a, b) => b - a);
    for (let i = 0; i < bpms.length; i++) {
      for (let j = i + 1; j < bpms.length; j++) {
        const [fast, slow] = [bpms[i], bpms[j]];
        const f = tempos.get(fast)!;
        const s = tempos.get(slow)!;
        const fes = f.map((t) => evennessOf(t)!);
        const ses = s.map((t) => evennessOf(t)!);
        const fe = mean(fes);
        const se = mean(ses);
        const pair = pairs.get(`${fast}:${slow}`) ?? { fast, slow, takes: [], fastE: [], slowE: [], drops: [] };
        pair.takes.push(...f, ...s);
        pair.fastE.push(...fes);
        pair.slowE.push(...ses);
        pair.drops.push((se - fe) * 100);
        pairs.set(`${fast}:${slow}`, pair);
      }
    }
  }
  // A line only when the faster tempo is lower on every Exercise that has both.
  const candidates = [...pairs.values()].filter(
    (p) => p.takes.length >= MIN_TAKES && p.drops.every((d) => d >= MIN_EVENNESS_DROP),
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.takes.length - a.takes.length || mean(b.drops) - mean(a.drops) || a.fast - b.fast);
  const best = candidates[0];
  const fastScore = Math.round(mean(best.fastE) * 100);
  const slowScore = Math.round(mean(best.slowE) * 100);
  if (slowScore - fastScore < MIN_EVENNESS_DROP) return null;
  return line(
    `tempoEvenness:${best.fast}:${best.slow}`,
    "tempoEvenness",
    "tempoEvenness",
    { fast: best.fast, slow: best.slow, fastScore, slowScore },
    best.takes,
  );
}

// ---------------------------------------------------------------------------
// Where in time: lean by bar position, and by what the bar has in it
// ---------------------------------------------------------------------------

type Direction = "late" | "early";

/** Takes with a trustworthy per-bar lean of at least two pattern bars, newest first. */
function leaning(window: readonly PathTakeRow[]): Array<{ take: PathTakeRow; lean: Array<number | null> }> {
  const out: Array<{ take: PathTakeRow; lean: Array<number | null> }> = [];
  for (const take of window) {
    if (!measured(take)) continue;
    const lean = leanOf(take);
    if (lean && lean.length >= 2) out.push({ take, lean });
  }
  return out;
}

/**
 * Of the newest `RECENT_TAKES` Takes that can show it, how many leaned which
 * way: a line when one direction holds at least `SHOWN_SHARE` of them.
 *
 * "Can show it" is exactly what the sentence calls "where it could be
 * measured" (c4a1b, L2): in the window (not marked not fair, not the player's
 * own exercise), graded, heard, with a per-bar lean of at least two bars, and
 * for a place line at least one bar with that place and one without. Takes in
 * between that are none of these are not counted, and the sentence does not
 * say "your last N Takes": `count` is the number of these readings, newest
 * first, and the evidence line carries their dates.
 */
function verdictOf(
  readings: ReadonlyArray<{ take: PathTakeRow; value: number }>,
): { direction: Direction; hits: number; takes: PathTakeRow[] } | null {
  const recent = readings.slice(0, RECENT_TAKES);
  if (recent.length < MIN_TAKES) return null;
  const late = recent.filter((r) => r.value >= biasThresholdMs(r.take.bpm)).length;
  const early = recent.filter((r) => r.value <= -biasThresholdMs(r.take.bpm)).length;
  const direction: Direction = late >= early ? "late" : "early";
  const hits = Math.max(late, early);
  if (hits === 0 || hits < Math.ceil(recent.length * SHOWN_SHARE)) return null;
  return { direction, hits, takes: recent.map((r) => r.take) };
}

function leanLines(window: readonly PathTakeRow[]): NoticedLine[] {
  const takes = leaning(window);
  const out: NoticedLine[] = [];
  for (const position of ["first", "last"] as const) {
    const readings = takes.flatMap(({ take, lean }) => {
      const value = lean[position === "first" ? 0 : lean.length - 1];
      return value === null ? [] : [{ take, value }];
    });
    const v = verdictOf(readings);
    if (!v) continue;
    out.push(
      line(`lean:${position}:${v.direction}`, "lean", `lean.${position}.${v.direction}`, { hits: v.hits, count: v.takes.length }, v.takes),
    );
  }
  return out;
}

function placeLines(window: readonly PathTakeRow[], paths: readonly PathDoc[] | undefined): NoticedLine[] {
  if (!paths?.length) return [];
  const takes = leaning(window);
  // What each pattern bar has in it, once per Exercise and variant.
  const cache = new Map<string, CueTrigger[][] | null>();
  const barsOf = (take: PathTakeRow, count: number): CueTrigger[][] | null => {
    const key = `${exKey(take)}#${take.variantSeed ?? ""}#${count}`;
    if (!cache.has(key)) {
      const ex = exerciseOf(paths, take);
      cache.set(key, ex && ex.bars >= 1 ? Array.from({ length: count }, (_v, i) => placeTriggers(ex, [i + 1])) : null);
    }
    return cache.get(key)!;
  };
  const out: NoticedLine[] = [];
  for (const kind of PLACE_KINDS) {
    const readings: Array<{ take: PathTakeRow; value: number }> = [];
    for (const { take, lean } of takes) {
      const bars = barsOf(take, lean.length);
      if (!bars) continue;
      const withIt: number[] = [];
      let without = 0;
      lean.forEach((value, i) => {
        if (value === null) return;
        if (bars[i].includes(kind)) withIt.push(value);
        else without += 1;
      });
      // A lean is relative to the Take's own median: a Take whose every bar has it says nothing about it.
      if (withIt.length === 0 || without === 0) continue;
      readings.push({ take, value: mean(withIt) });
    }
    const v = verdictOf(readings);
    if (!v) continue;
    const values: Record<string, string | number> = { hits: v.hits, count: v.takes.length };
    const refs = refsOf(v.takes);
    const title = refs.length === 1 ? titleOf(paths, v.takes[0]) : null;
    if (title) values.exercise = title;
    out.push(
      line(`place:${kind}:${v.direction}`, "place", `place.${kind}.${v.direction}${title ? "One" : ""}`, values, v.takes),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tempo and minutes: what an ungraded player gets too
// ---------------------------------------------------------------------------

/** Ungraded practice on one Exercise: the tempo it started and ended the window at. */
function tempoPlayedLines(window: readonly PathTakeRow[], paths: readonly PathDoc[] | undefined): NoticedLine[] {
  const byEx = new Map<string, PathTakeRow[]>();
  for (const t of window) {
    if (!isUngradedTake(t) || t.bpm <= 0) continue;
    byEx.set(exKey(t), [...(byEx.get(exKey(t)) ?? []), t]);
  }
  const out: NoticedLine[] = [];
  for (const [key, takes] of byEx) {
    if (takes.length < MIN_TAKES) continue;
    const newest = takes[0];
    const oldest = takes[takes.length - 1];
    if (newest.bpm === oldest.bpm) continue;
    const title = titleOf(paths, newest);
    const values: Record<string, string | number> = { fromBpm: oldest.bpm, toBpm: newest.bpm };
    if (title) values.exercise = title;
    out.push(line(`tempoPlayed:${key}`, "tempoPlayed", `tempoPlayed.${title ? "named" : "unnamed"}`, values, takes));
  }
  return out.sort((a, b) => b.to - a.to);
}

/**
 * Minutes played per Session, the newer half of the newest Sessions against
 * the older half. The minutes are the Takes' own length, counted as Progress
 * counts them (`totalsFrom`): every Take in `playedOf`, a Take marked not fair
 * and one on the player's own exercise included (c4a1b, L3), so the two never
 * disagree for the same Sessions. At least `MIN_SESSIONS` (six: three against
 * three) Sessions.
 */
function minutesLine(played: readonly PathTakeRow[], paths: readonly PathDoc[] | undefined): NoticedLine | null {
  const sessions: Array<{ key: string; takes: PathTakeRow[] }> = [];
  for (const t of played) {
    const key = sessionKeyOf(t);
    const s = sessions.find((x) => x.key === key);
    if (s) s.takes.push(t);
    else if (sessions.length < RECENT_SESSIONS) sessions.push({ key, takes: [t] });
  }
  if (sessions.length < MIN_SESSIONS) return null;
  const half = Math.floor(sessions.length / 2);
  const newer = sessions.slice(0, half);
  // "the N before them": the N right before the newest N (c4a1c, F5); an odd one out is the oldest.
  const older = sessions.slice(half, 2 * half);
  const minutes = (group: typeof sessions) =>
    Math.round(mean(group.map((s) => totalsFrom(s.takes, paths ?? []).seconds)) / 60);
  const now = minutes(newer);
  const then = minutes(older);
  const takes = [...newer, ...older].flatMap((s) => s.takes);
  if (takes.length < MIN_TAKES || Math.abs(now - then) < MIN_MINUTES_CHANGE) return null;
  return line("minutes:sessions", "minutes", "minutes.perSession", { sessions: half, now, then }, takes);
}

// ---------------------------------------------------------------------------

/**
 * The noticed lines, in a fixed order: tempo against evenness, lean by
 * position, lean by place, tempo played, minutes. Suppressed ids are left out.
 */
export function tendencies(rows: readonly PathTakeRow[], now: number, options: TendencyOptions = {}): NoticedLine[] {
  const window = windowOf(rows);
  const lines = [
    tempoEvenness(window),
    ...leanLines(window),
    ...placeLines(window, options.paths),
    ...tempoPlayedLines(window, options.paths),
    minutesLine(playedOf(rows), options.paths),
  ].filter((l): l is NoticedLine => l !== null);
  const suppressed = options.suppressed ?? {};
  return lines.filter((l) => !isSuppressed(suppressed, l.id, now));
}
