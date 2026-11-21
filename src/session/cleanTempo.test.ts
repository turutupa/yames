/**
 * nf1 (owner, 1k questions, item 3): a Take marked not fair is left out of the
 * clean tempo the app shows and quotes. The same three cases are in `db.rs`
 * (`a_take_marked_not_fair_is_not_a_clean_tempo`) for the long-view query.
 */
import { describe, expect, it } from "vitest";
import type { PathTakeRow } from "../ipc";
import { ALT } from "./testKit";
import { groupsFrom } from "../containers/session/ProgressView";
import type { TakeOutcome } from "./runner";
import {
  cleanBeforeOutcome,
  cleanTempoOf,
  countsTowardCleanTempo,
  outcomeCountsTowardCleanTempo,
  heldCleanTempo,
  isTakeIdMarkedNotFair,
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

  it("a Session's outcome reads the answer kept on its row", () => {
    const p = progress([first, mark(fastest, "no"), mark(after, "yes")], 72);
    expect(isTakeIdMarkedNotFair(p, "fastest")).toBe(true);
    expect(isTakeIdMarkedNotFair(p, "after")).toBe(false);
    expect(isTakeIdMarkedNotFair(p, "first")).toBe(false);
    expect(isTakeIdMarkedNotFair(p, "gone")).toBe(false);
    expect(isTakeIdMarkedNotFair(p, undefined)).toBe(false);
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

function outcome(takeId: string | undefined, bpm: number, cleanBpm: number | null, cleanBefore: number | null): TakeOutcome {
  return {
    stepId: "s",
    exerciseId: EX.id,
    title: "t",
    bpm,
    takeNumber: 1,
    measures: {} as TakeOutcome["measures"],
    grade: { verdict: "passed", cleanBpm, passesExercise: false } as TakeOutcome["grade"],
    previousValue: null,
    cleanBefore,
    ...(takeId ? { takeId } : {}),
  };
}

/**
 * nf1b M1: pins today's behaviour at the edge of the 500-Take window, in both
 * directions (`shownCleanTempoOf`'s comment, `plans/coach/progress/nf1b.md`).
 * When the long view's spans are loaded with the progress, these two change:
 * the shown tempo becomes the span's best, 85 in the first and 80 in the second.
 */
describe("nf1b M1: the 500-Take window, as it stands", () => {
  it("the Take marked not fair is older than the window: the ceiling it set is still shown", () => {
    // History: 90 raised the ceiling, marked not fair; 500 Takes later only fair 85s are in memory.
    const p = progress([held("a", 10, 85), held("b", 20, 85)], 90);
    expect(shownCleanTempoOf(p, PATH.id, EX.id)).toBe(90);
    // Progress reads the window and says 85; so does the long view (`list_clean_tempo_spans`).
    expect(progressShows(p)).toBe(85);
  });

  it("the fair Take that set the tempo is older than the window: the best fair Take in it is shown", () => {
    // History: 80 raised the ceiling long ago; 90 raised it again and was marked not fair.
    const p = progress([mark(raised("ninety", 20, 90), "no"), held("later", 30, 75)], 90);
    // The long view says 80; the window only knows 75.
    expect(shownCleanTempoOf(p, PATH.id, EX.id)).toBe(75);
    expect(progressShows(p)).toBe(75);
  });
});

describe("nf1b L1: a result announces only a clean tempo Progress will show", () => {
  // The ceiling, 90, is held by a Take marked not fair; the shown tempo is 80.
  const base = [raised("eighty", 10, 80), mark(raised("ninety", 20, 90), "no")];

  it("graded without the scorer's answer, under the ceiling: not announced, and Progress agrees", () => {
    // What `useSessionRun` keeps: `newClean: false` (90 stands), no `measures.pass`.
    const fallback = take("fb", 30, 85, { newClean: false, measures: {} as TakeFacts["measures"] });
    const p = progress([...base, fallback], 90);
    expect(outcomeCountsTowardCleanTempo(p, "fb")).toBe(false);
    expect(shownCleanTempoOf(p, PATH.id, EX.id)).toBe(80);
    expect(progressShows(p)).toBe(80);
  });

  it("the scorer said it counts: announced, and Progress shows it", () => {
    const p = progress([...base, held("sc", 30, 85)], 90);
    expect(outcomeCountsTowardCleanTempo(p, "sc")).toBe(true);
    expect(shownCleanTempoOf(p, PATH.id, EX.id)).toBe(85);
    expect(progressShows(p)).toBe(85);
  });

  it("marked not fair: not announced; no row in memory: the result stands", () => {
    const p = progress([...base, mark(held("sc", 30, 85), "no")], 90);
    expect(outcomeCountsTowardCleanTempo(p, "sc")).toBe(false);
    expect(outcomeCountsTowardCleanTempo(p, "never-saved")).toBe(true);
    expect(outcomeCountsTowardCleanTempo(p, undefined)).toBe(true);
  });
});

describe("nf1b L2: the edge recap's 'before' is read when the recap shows", () => {
  // Take A at 85 raised the shown 80; Find my edge on the same Exercise came after.
  const a = outcome("A", 85, 85, 80);
  const edgeFirst = outcome("E1", 85, 85, 85);
  const edgeNext = outcome("E2", 90, 90, 85);
  const outcomes = [a, edgeFirst, edgeNext];
  const rows = (fair?: "no") => [raised("eighty", 10, 80), fair ? mark(raised("A", 30, 85), fair) : raised("A", 30, 85)];

  it("A kept: 85, as before", () => {
    expect(cleanBeforeOutcome(progress(rows(), 85), outcomes, edgeFirst)).toBe(85);
  });

  it("A marked not fair on the recap: 80, not the 85 frozen when the edge's first Take settled", () => {
    expect(edgeFirst.cleanBefore).toBe(85);
    expect(cleanBeforeOutcome(progress(rows("no"), 85), outcomes, edgeFirst)).toBe(80);
  });

  it("an edge with no Take before it in the Session: the value it settled with", () => {
    expect(cleanBeforeOutcome(progress(rows(), 85), [edgeFirst, edgeNext], edgeFirst)).toBe(85);
    expect(cleanBeforeOutcome(progress([], null), [outcome("x", 60, null, null)], outcome("x", 60, null, null))).toBeNull();
  });
});
