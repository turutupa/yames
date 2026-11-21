/**
 * nf1 (owner, 1k questions, item 3): a Take marked not fair is left out of the
 * clean tempo the app shows and quotes. The same three cases are in `db.rs`
 * (`a_take_marked_not_fair_is_not_a_clean_tempo`) for the long-view query.
 */
import { describe, expect, it } from "vitest";
import type { PathTakeRow } from "../ipc";
import { ALT } from "./testKit";
import { groupsFrom } from "../containers/session/ProgressView";
import {
  cleanTempoOf,
  countsTowardCleanTempo,
  heldCleanTempo,
  shownCleanTempoOf,
  shownCleanTempoTakeOf,
  type PlayerProgress,
  type TakeFacts,
} from "./progress";

const PATH = ALT;
const EX = PATH.steps[0].exercises[0];

function take(id: string, at: number, bpm: number, facts: TakeFacts, row: Partial<PathTakeRow> = {}): PathTakeRow {
  return {
    id,
    pathId: PATH.id,
    stepId: PATH.steps[0].id,
    exerciseId: EX.id,
    startedAt: at,
    bpm,
    bars: 8,
    caught: true,
    passed: true,
    facts: { verdict: "passed", ...facts },
    ...row,
  };
}

const PASS = { countsForCleanTempo: true } as NonNullable<TakeFacts["measures"]>["pass"];

/** Raised the ceiling, as `useSessionRun` saves it. */
const raised = (id: string, at: number, bpm: number, more: TakeFacts = {}) => take(id, at, bpm, { newClean: true, measures: { pass: PASS }, ...more });
/** Clean, but the ceiling already stood higher: no `newClean`, the scorer said it counts. */
const held = (id: string, at: number, bpm: number, more: TakeFacts = {}) => take(id, at, bpm, { newClean: false, measures: { pass: PASS }, ...more });

function progress(takes: PathTakeRow[], ceiling: number | null): PlayerProgress {
  return {
    states: [],
    // Newest first, as the store hands them over.
    takes: [...takes].sort((a, b) => b.startedAt - a.startedAt),
    ceilings: ceiling === null ? [] : [{ exerciseKey: `${PATH.id}/${EX.id}`, cleanBpm: ceiling, lastPracticed: 0 }],
  };
}

const mark = (t: PathTakeRow, fair: "yes" | "no"): PathTakeRow => ({ ...t, facts: { ...(t.facts as TakeFacts), fair } });

/** What Progress shows for the Exercise: the last point of its clean series. */
function progressShows(p: PlayerProgress): number | null {
  const ex = groupsFrom(p.takes, [PATH])[0]?.exercises.find((s) => s.exerciseId === EX.id);
  return ex?.clean[ex.clean.length - 1]?.bpm ?? null;
}

describe("a Take marked not fair and the clean tempo", () => {
  const first = raised("first", 10, 66);
  const fastest = raised("fastest", 20, 72);
  const after = held("after", 30, 70);

  const TABLE: Array<[string, PathTakeRow[], number | null, string | null]> = [
    ["nothing marked: the ceiling", [first, fastest, after], 72, "fastest"],
    ["the fastest marked not fair: the next fastest clean Take", [first, mark(fastest, "no"), after], 70, "after"],
    ["the fastest marked fair: the ceiling", [first, mark(fastest, "yes"), after], 72, "fastest"],
    ["only Takes marked not fair: no clean tempo, not zero", [mark(first, "no"), mark(fastest, "no")], null, null],
    ["unmarking brings it back", [mark(first, "no"), mark(fastest, "yes")], 72, "fastest"],
    ["another Take at the ceiling, fair: the ceiling stands", [first, mark(fastest, "no"), held("same", 40, 72)], 72, "same"],
  ];

  it.each(TABLE)("%s", (_name, takes, shown, setter) => {
    const p = progress(takes, 72);
    expect(shownCleanTempoOf(p, PATH.id, EX.id)).toBe(shown);
    expect(shownCleanTempoTakeOf(p, PATH.id, EX.id)?.id ?? null).toBe(setter);
    // Progress shows the same number.
    expect(progressShows(p)).toBe(shown);
    // The ceiling (the planner, the Step's pass, the standing) is not touched.
    expect(cleanTempoOf(p, PATH.id, EX.id)).toBe(72);
  });

  it("no ceiling: no clean tempo", () => {
    expect(shownCleanTempoOf(progress([], null), PATH.id, EX.id)).toBeNull();
  });

  it("a ceiling raised by a Take beyond the Takes in memory stands", () => {
    // Its raising Take is older than the window; a later Take at that tempo moved nothing.
    const p = progress([held("later", 50, 90)], 90);
    expect(shownCleanTempoOf(p, PATH.id, EX.id)).toBe(90);
    expect(shownCleanTempoTakeOf(p, PATH.id, EX.id)).toBeNull();
  });

  it("reads which Takes held a clean tempo as the long-view query does", () => {
    expect(heldCleanTempo(raised("a", 1, 60))).toBe(true);
    expect(heldCleanTempo(held("b", 1, 60))).toBe(true);
    // Raised nothing and the scorer did not answer: no record of a clean tempo.
    expect(heldCleanTempo(take("c", 1, 60, { newClean: false }))).toBe(false);
    // From before `newClean`: eight bars.
    expect(heldCleanTempo(take("d", 1, 60, {}))).toBe(true);
    expect(heldCleanTempo(take("e", 1, 60, {}, { bars: 7 }))).toBe(false);
    expect(heldCleanTempo(take("f", 1, 60, { measures: { pass: { countsForCleanTempo: false } as typeof PASS } }))).toBe(false);
    expect(heldCleanTempo(take("g", 1, 60, { newClean: true }, { passed: false }))).toBe(false);
    expect(countsTowardCleanTempo(mark(raised("h", 1, 60), "no"))).toBe(false);
    expect(countsTowardCleanTempo(mark(raised("i", 1, 60), "yes"))).toBe(true);
  });
});
