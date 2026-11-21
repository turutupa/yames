/**
 * The Notebook's noticed lines over fixture histories: five Takes of evidence,
 * unfair Takes left out, an ungraded player's tempo and minutes only, a line
 * left out for thirty days, the 500-Take edge, and every line's sentence and
 * evidence present in English with nothing left unfilled.
 */
import { describe, expect, it } from "vitest";
import type { PathTakeRow } from "../ipc";
import en from "../locales/en/notebook.json";
import type { PathDoc, PathNote } from "../paths/format";
import type { TakeFacts } from "../session/progress";
import { notebookFrom } from "./notebook";
import { COACH_STORED_DEFAULTS, type CoachKeyState, type CoachKeyStates } from "./store";

const statesAll = (s: CoachKeyState): CoachKeyStates => ({ suggestions: s, cards: s, goal: s, suppressed: s, reminder: s });
const READ = statesAll("read");
import { MIN_SESSIONS, MIN_TAKES, TAKES_WINDOW, tendencies, type NoticedLine } from "./tendencies";
import { totalsFrom } from "../session/totals";
import { CUSTOM_PATH_ID } from "../paths/custom";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 20, 18);

let n = 0;
function row(exerciseId: string, ago: number, fields: Partial<PathTakeRow> & { facts?: TakeFacts } = {}): PathTakeRow {
  n += 1;
  return {
    id: `t${n}`,
    pathId: "fx",
    stepId: "s1",
    exerciseId,
    startedAt: NOW - ago,
    bpm: 100,
    bars: 8,
    caught: true,
    passed: false,
    facts: {},
    ...fields,
  };
}

const even = (exerciseId: string, bpm: number, evenness: number, ago: number, facts: TakeFacts = {}) =>
  row(exerciseId, ago, { bpm, facts: { measures: { evenness }, ...facts } });

const leaning = (exerciseId: string, lean: Array<number | null>, ago: number, facts: TakeFacts = {}) =>
  row(exerciseId, ago, { facts: { lean, ...facts } });

// A four-bar Exercise: eighths in bars 1, 3 and 4, a whole note held through bar 2,
// so bar 3 opens on the note after a held one. One string, two frets: no open
// string, no shift, no change of string.
const eighths = (bar: number): PathNote[] =>
  Array.from({ length: 8 }, (_v, i) => ({
    string: 2,
    fret: i % 2 ? 7 : 5,
    midi: 0,
    tick: (bar - 1) * 3840 + i * 480,
    dur: 480,
    tech: [],
  })) as unknown as PathNote[];
const HELD_EXERCISE = {
  id: "held",
  title: "The held-note tune",
  meter: { numerator: 4, denominator: 4 },
  bars: 4,
  loops: false,
  position: { fret: 5, shifts: "allowed" },
  notes: [...eighths(1), { string: 2, fret: 5, midi: 0, tick: 3840, dur: 3840, tech: [] }, ...eighths(3), ...eighths(4)],
};
const FX_PATH = { id: "fx", steps: [{ id: "s1", exercises: [HELD_EXERCISE] }] } as unknown as PathDoc;

const ids = (lines: NoticedLine[]) => lines.map((l) => l.id);

/** Two Exercises, each twice at 100 and twice at 90, a few days apart. */
function tempoHistory(): PathTakeRow[] {
  return [
    even("a", 100, 0.74, 1 * DAY),
    even("a", 100, 0.72, 2 * DAY),
    even("a", 90, 0.86, 3 * DAY),
    even("a", 90, 0.84, 4 * DAY),
    even("b", 100, 0.76, 1 * DAY + HOUR),
    even("b", 100, 0.74, 2 * DAY + HOUR),
    even("b", 90, 0.85, 5 * DAY),
    even("b", 90, 0.87, 6 * DAY),
  ];
}

describe("tempo against evenness", () => {
  it("compares the player's own evenness at two tempos, on the Exercises that have both", () => {
    const [line] = tendencies(tempoHistory(), NOW);
    expect(line).toMatchObject({
      id: "tempoEvenness:100:90",
      kind: "tempoEvenness",
      key: "notebook.noticed.tempoEvenness",
      values: { fast: 100, slow: 90, fastScore: 74, slowScore: 86 },
      evidence: { key: "notebook.evidence.exercises", values: { count: 8, exercises: 2 } },
      exercises: [
        { pathId: "fx", exerciseId: "a" },
        { pathId: "fx", exerciseId: "b" },
      ],
      from: NOW - 6 * DAY,
      to: NOW - DAY,
    });
    expect(line.takeIds).toHaveLength(8);
  });

  it("says nothing with fewer than five Takes behind it", () => {
    expect(tendencies(tempoHistory().filter((t) => t.exerciseId === "a"), NOW)).toEqual([]);
  });

  it("says nothing when one of the Exercises does not drop", () => {
    const rows = tempoHistory().map((t) => (t.exerciseId === "b" && t.bpm === 100 ? even("b", 100, 0.86, NOW - t.startedAt) : t));
    expect(ids(tendencies(rows, NOW))).not.toContain("tempoEvenness:100:90");
  });

  it("leaves out a Take marked not fair, and with it the line when too few remain", () => {
    const rows = tempoHistory();
    const unfair = rows.map((t) => (t.exerciseId === "b" ? { ...t, facts: { ...(t.facts as TakeFacts), fair: "no" as const } } : t));
    expect(tendencies(unfair, NOW)).toEqual([]);
    const oneUnfair = [...rows, even("a", 100, 0.2, 7 * DAY, { fair: "no" })];
    const [line] = tendencies(oneUnfair, NOW);
    expect(line.takeIds).toHaveLength(8);
    expect(line.values.fastScore).toBe(74);
  });

  // c4a2b, L8: "your Takes were N% even" is the mean over the Takes the evidence line counts.
  it("the percentages are the mean over the Takes counted, not a mean of per-Exercise means", () => {
    const rows = [
      even("a", 100, 0.7, 1 * DAY),
      even("a", 100, 0.7, 2 * DAY),
      even("a", 90, 0.8, 3 * DAY),
      even("a", 90, 0.8, 4 * DAY),
      ...[1, 2, 3, 4, 5, 6].map((i) => even("b", 100, 0.85, i * DAY + HOUR)),
      even("b", 90, 0.95, 7 * DAY),
      even("b", 90, 0.95, 8 * DAY),
    ];
    const [line] = tendencies(rows, NOW);
    // Over the eight Takes at 100: (2 × 70 + 6 × 85) / 8 = 81.25 (a mean of the two means would say 78).
    expect(line.values).toMatchObject({ fastScore: 81, slowScore: 88 });
    expect(line.evidence.values.count).toBe(12);
  });

  it("never reads a Take too little was heard in", () => {
    const rows = tempoHistory().map((t) => (t.exerciseId === "b" ? { ...t, caught: false } : t));
    expect(tendencies(rows, NOW)).toEqual([]);
  });
});

describe("where in time: by bar position", () => {
  it("names the bar, the direction and the count over the newest Takes", () => {
    const rows = [
      ...[0, 1, 2, 3, 4].map((i) => leaning("a", [0, 2, -3, 25], i * DAY + HOUR)),
      leaning("a", [0, 1, 0, 3], 5 * DAY),
      leaning("a", [0, 1, 0, -2], 6 * DAY),
    ];
    const lines = tendencies(rows, NOW);
    expect(ids(lines)).toEqual(["lean:last:late"]);
    expect(lines[0]).toMatchObject({ key: "notebook.noticed.lean.last.late", values: { hits: 5, count: 7 } });
  });

  // c4a1b, L2: "of the N most recent Takes where it could be measured" is exactly the set counted.
  it("counts only the Takes where the lean could be measured, and names exactly those", () => {
    const measuredRows = [0, 1, 2, 3, 4, 5].map((i) => leaning("a", [0, 2, -3, 25], i * DAY + 2 * HOUR));
    const between = [
      leaning("a", [0, 2, -3, 25], HOUR, { ungraded: "gradingOff" }),
      row("a", 1 * DAY + HOUR, { caught: false, facts: { lean: [0, 2, -3, 25] } }),
      leaning("a", [0, 2, -3, 25], 2 * DAY + HOUR, { fair: "no" }),
      // One pattern bar: nothing to lean against.
      leaning("a", [25], 3 * DAY + HOUR),
    ];
    const [line] = tendencies([...between, ...measuredRows], NOW);
    expect(line).toMatchObject({ id: "lean:last:late", values: { hits: 6, count: 6 } });
    expect([...line.takeIds].sort()).toEqual(measuredRows.map((t) => t.id).sort());
    expect(line.from).toBe(measuredRows[5].startedAt);
    expect(line.to).toBe(measuredRows[0].startedAt);
  });

  it("needs five Takes that can show it, and most of them to", () => {
    const four = [0, 1, 2, 3].map((i) => leaning("a", [0, 2, -3, 25], i * DAY));
    expect(tendencies(four, NOW)).toEqual([]);
    const split = [...four, ...[4, 5, 6].map((i) => leaning("a", [0, 2, -3, 0], i * DAY))];
    // 4 of 7 is under the share.
    expect(tendencies(split, NOW)).toEqual([]);
  });
});

describe("where in time: by what the bar has in it", () => {
  const rows = () => [0, 1, 2, 3, 4, 5].map((i) => row("held", i * DAY, { facts: { lean: [0, -1, 30, -5] } }));

  it("reads the notes the Take played: bars after a held note sat late", () => {
    const lines = tendencies(rows(), NOW, { paths: [FX_PATH] });
    expect(ids(lines)).toEqual(["place:afterHeld:late"]);
    expect(lines[0]).toMatchObject({
      key: "notebook.noticed.place.afterHeld.lateOne",
      values: { hits: 6, count: 6, exercise: "The held-note tune" },
      evidence: { key: "notebook.evidence.oneExercise", values: { count: 6, exercises: 1 } },
    });
  });

  it("without the Paths, says nothing about places", () => {
    expect(tendencies(rows(), NOW)).toEqual([]);
  });
});

describe("an ungraded player", () => {
  it("gets tempo and minutes lines only, whatever the rows carry", () => {
    const facts = (session: number): TakeFacts => ({ ungraded: "gradingOff", measures: { evenness: 0.5 }, lean: [0, 0, 0, 40], session });
    const rows = [
      ...[0, 1].map((i) => row("u", i * HOUR, { bpm: 95, bars: 150, facts: facts(1) })),
      ...[2, 3].map((i) => row("u", DAY + i * HOUR, { bpm: 95, bars: 150, facts: facts(2) })),
      ...[4, 5].map((i) => row("u", 2 * DAY + i * HOUR, { bpm: 95, bars: 150, facts: facts(3) })),
      ...[6, 7].map((i) => row("u", 3 * DAY + i * HOUR, { bpm: 80, bars: 40, facts: facts(4) })),
      ...[8, 9].map((i) => row("u", 4 * DAY + i * HOUR, { bpm: 80, bars: 40, facts: facts(5) })),
      ...[10, 11].map((i) => row("u", 5 * DAY + i * HOUR, { bpm: 80, bars: 40, facts: facts(6) })),
    ];
    const lines = tendencies(rows, NOW, { paths: [FX_PATH] });
    expect(new Set(lines.map((l) => l.kind))).toEqual(new Set(["tempoPlayed", "minutes"]));
    expect(lines.find((l) => l.kind === "tempoPlayed")).toMatchObject({
      id: "tempoPlayed:fx/u",
      key: "notebook.noticed.tempoPlayed.unnamed",
      values: { fromBpm: 80, toBpm: 95 },
    });
    // 150 bars of 4/4 at 95 is 6.3 minutes; two a Session is 13. 40 at 80: 2 minutes, 4 a Session.
    expect(lines.find((l) => l.kind === "minutes")).toMatchObject({
      key: "notebook.noticed.minutes.perSession",
      values: { sessions: 3, now: 13, then: 4 },
    });
  });

  // c4a1b, L3.
  describe("minutes per Session", () => {
    /** `n` Sessions, newest first: two Takes each, one of them marked not fair; the newer half longer. */
    const sessions = (n: number) =>
      Array.from({ length: n }, (_v, s) => {
        const newer = s < Math.floor(n / 2);
        const at = s * DAY;
        const take = { bpm: newer ? 95 : 80, bars: newer ? 150 : 40 };
        return [
          row("u", at, { ...take, facts: { session: 100 - s } }),
          row("u", at + HOUR, { ...take, facts: { session: 100 - s, fair: "no" } }),
        ];
      });

    it(`needs ${MIN_SESSIONS} Sessions, three against three`, () => {
      expect(MIN_SESSIONS).toBe(6);
      const minutes = (rows: PathTakeRow[]) => tendencies(rows, NOW).filter((l) => l.kind === "minutes");
      expect(minutes(sessions(5).flat())).toEqual([]);
      expect(minutes(sessions(6).flat())).toHaveLength(1);
    });

    it("counts the minutes Progress counts, a Take marked not fair included", () => {
      const groups = sessions(6);
      const line = tendencies(groups.flat(), NOW).find((l) => l.kind === "minutes");
      const perSession = (gs: PathTakeRow[][]) =>
        Math.round(gs.reduce((s, g) => s + totalsFrom(g, []).seconds, 0) / gs.length / 60);
      expect(line?.values).toEqual({ sessions: 3, now: perSession(groups.slice(0, 3)), then: perSession(groups.slice(3)) });
      // Two Takes of 6.3 minutes a Session: 13, not the 6 the fair Take alone would say.
      expect(line?.values.now).toBe(13);
      expect(line?.takeIds).toHaveLength(12);
    });

    // c4a1c, F5: seven Sessions are "your last 3 … the 3 before": S4 to S6, not S5 to S7.
    it("with an odd number of Sessions, compares the newest N with the N right before them", () => {
      const bars = [150, 150, 150, 600, 40, 40, 40];
      const groups = bars.map((b, s) => {
        const take = { bpm: s < 3 ? 95 : 80, bars: b };
        return [row("u", s * DAY, { ...take, facts: { session: 200 - s } }), row("u", s * DAY + HOUR, { ...take, facts: { session: 200 - s } })];
      });
      const line = tendencies(groups.flat(), NOW).find((l) => l.kind === "minutes");
      // S4 is two Takes of 30 minutes: (60 + 4 + 4) / 3 = 23. Leaving it out for S7 would say 4.
      expect(line?.values).toEqual({ sessions: 3, now: 13, then: 23 });
      expect(new Set(line?.takeIds)).toEqual(new Set(groups.slice(0, 6).flat().map((t) => t.id)));
    });
  });

  it("says nothing about a tempo that did not move", () => {
    const rows = [0, 1, 2, 3, 4, 5].map((i) => row("u", i * DAY, { bpm: 80, facts: { ungraded: "chosen" } }));
    expect(ids(tendencies(rows, NOW))).not.toContain("tempoPlayed:fx/u");
  });
});

describe("left out", () => {
  it("for thirty days, then allowed again", () => {
    const left = (at: number) => ({ suppressed: { "tempoEvenness:100:90": at } });
    expect(tendencies(tempoHistory(), NOW, left(NOW - 10 * DAY))).toEqual([]);
    expect(ids(tendencies(tempoHistory(), NOW, left(NOW - 30 * DAY)))).toEqual(["tempoEvenness:100:90"]);
  });
});

describe("the window", () => {
  /** Newer graded Takes that say nothing, then five ungraded Takes whose tempo moved. */
  function history(filler: number): PathTakeRow[] {
    const rows = Array.from({ length: filler }, (_v, i) => row("z", i * 60_000, { facts: { session: 1 } }));
    const old = [0, 1, 2, 3, 4].map((i) => row("y", 10 * DAY + i * HOUR, { bpm: 90 - i * 5, facts: { ungraded: "chosen", session: 2 } }));
    return [...rows, ...old];
  }

  it(`reads the newest ${TAKES_WINDOW} Takes and not one more`, () => {
    expect(ids(tendencies(history(TAKES_WINDOW - MIN_TAKES), NOW))).toEqual(["tempoPlayed:fx/y"]);
    expect(tendencies(history(TAKES_WINDOW - MIN_TAKES + 1), NOW)).toEqual([]);
  });

  // c4a2b, M2: the real id (`paths/custom.ts`), so the test cannot drift from it again.
  it("never reads the player's own exercises (CUSTOM_PATH_ID)", () => {
    expect(CUSTOM_PATH_ID).toBe("my-exercises");
    const rows = tempoHistory().map((t) => ({ ...t, pathId: CUSTOM_PATH_ID }));
    expect(tendencies(rows, NOW)).toEqual([]);
    // Mixed in: the line, its numbers and its evidence count rest on the Path Takes alone.
    const own = [even("c", 100, 0.5, DAY + 2 * HOUR), even("c", 100, 0.5, 2 * DAY + 2 * HOUR), even("c", 90, 0.9, 3 * DAY + 2 * HOUR), even("c", 90, 0.9, 4 * DAY + 2 * HOUR)];
    const mixed = [...tempoHistory(), ...own.map((t) => ({ ...t, pathId: CUSTOM_PATH_ID }))];
    const [line] = tendencies(mixed, NOW);
    expect(line.values.fastScore).toBe(74);
    expect(line.evidence.values).toEqual({ count: 8, exercises: 2 });
    expect(line.exercises.every((e) => e.pathId !== CUSTOM_PATH_ID)).toBe(true);
  });
});

describe("every line can be said in English, with nothing left unfilled", () => {
  const strings = en as unknown as Record<string, unknown>;
  const lookup = (key: string, count: number): string | undefined => {
    const parts = key.split(".");
    const leaf = parts.pop()!;
    let node: unknown = strings;
    for (const p of parts) node = (node as Record<string, unknown> | undefined)?.[p];
    const branch = node as Record<string, string> | undefined;
    return branch?.[leaf] ?? branch?.[`${leaf}_${count === 1 ? "one" : "other"}`];
  };

  const all: NoticedLine[] = [
    ...tendencies(tempoHistory(), NOW),
    ...tendencies([0, 1, 2, 3, 4, 5].map((i) => row("held", i * DAY, { facts: { lean: [20, -1, 30, -25] } })), NOW, { paths: [FX_PATH] }),
  ];

  it("has lines to check", () => {
    expect(new Set(all.map((l) => l.kind)).size).toBeGreaterThanOrEqual(3);
  });

  it.each(all.map((l) => [l.id, l] as const))("%s", (_id, l) => {
    const sentence = lookup(l.key, Number(l.values.count ?? 0));
    expect(sentence, l.key).toBeTypeOf("string");
    for (const [, name] of sentence!.matchAll(/\{\{(\w+)\}\}/g)) expect(l.values, `${l.key} {{${name}}}`).toHaveProperty(name);
    const evidence = lookup(l.evidence.key, l.evidence.values.count);
    expect(evidence, l.evidence.key).toBeTypeOf("string");
    for (const [, name] of evidence!.matchAll(/\{\{(\w+)\}\}/g)) {
      if (name !== "from" && name !== "to") expect(l.evidence.values, name).toHaveProperty(name);
    }
  });
});

describe("notebookFrom", () => {
  it("one plain object: the lines, the goal, and whether the goal may be asked", () => {
    const rows = tempoHistory();
    const fresh = notebookFrom(rows, COACH_STORED_DEFAULTS, READ, NOW);
    // A line on 8 Takes over two Exercises: not "too few Takes" (c4a1b, L1).
    expect(fresh).toMatchObject({ goal: null, takesRead: 8, firstTakeAt: NOW - 6 * DAY, tooFewTakes: false, askGoal: false });
    expect(ids(fresh.noticed)).toEqual(["tempoEvenness:100:90"]);

    const weekOld = [...rows, even("a", 90, 0.85, 8 * DAY)];
    expect(notebookFrom(weekOld, COACH_STORED_DEFAULTS, READ, NOW)).toMatchObject({ askGoal: true, tooFewTakes: false });
    const withGoal = { ...COACH_STORED_DEFAULTS, goal: { text: "Play in a band", at: NOW - DAY } };
    expect(notebookFrom(weekOld, withGoal, READ, NOW)).toMatchObject({ askGoal: false, goal: { text: "Play in a band" } });
    const quiet = { ...COACH_STORED_DEFAULTS, suggestions: "asked" as const };
    expect(notebookFrom(weekOld, quiet, READ, NOW).askGoal).toBe(false);
    const leftOut = { ...COACH_STORED_DEFAULTS, suppressed: { "tempoEvenness:100:90": NOW - DAY } };
    expect(notebookFrom(weekOld, leftOut, READ, NOW).noticed).toEqual([]);
  });

  // c4a1c, F1: the read side fails closed, before the load and after a failed read alike.
  describe.each(["loading", "unreadable"] as const)("a key %s", (state) => {
    const weekOld = () => [...tempoHistory(), even("a", 90, 0.85, 8 * DAY)];

    it("coach.suppressed: no noticed line (any may be one the player left out), and the state says why", () => {
      const nb = notebookFrom(weekOld(), COACH_STORED_DEFAULTS, { ...READ, suppressed: state }, NOW);
      expect(nb.noticed).toEqual([]);
      expect(nb.noticedState).toBe(state);
      // Measured on the Takes, not on the key: eight Takes are not "too few".
      expect(nb.tooFewTakes).toBe(false);
      // The same history with the key read has its line.
      expect(notebookFrom(weekOld(), COACH_STORED_DEFAULTS, READ, NOW).noticed).not.toEqual([]);
    });

    it("coach.goal: no goal shown and the goal never asked", () => {
      const withGoal = { ...COACH_STORED_DEFAULTS, goal: { text: "Play in a band", at: NOW - DAY } };
      const nb = notebookFrom(weekOld(), withGoal, { ...READ, goal: state }, NOW);
      expect(nb).toMatchObject({ goal: null, goalState: state, askGoal: false });
      expect(notebookFrom(weekOld(), COACH_STORED_DEFAULTS, { ...READ, goal: state }, NOW).askGoal).toBe(false);
    });

    it("coach.suggestions or coach.cards: the goal question is not offered", () => {
      expect(notebookFrom(weekOld(), COACH_STORED_DEFAULTS, { ...READ, suggestions: state }, NOW).askGoal).toBe(false);
      expect(notebookFrom(weekOld(), COACH_STORED_DEFAULTS, { ...READ, cards: state }, NOW).askGoal).toBe(false);
    });
  });

  it("\"too few Takes\" only under five Takes played, and never beside a noticed line (c4a1b, L1)", () => {
    const four = tempoHistory().slice(0, 4);
    expect(notebookFrom(four, COACH_STORED_DEFAULTS, READ, NOW)).toMatchObject({ noticed: [], tooFewTakes: true });
    // Five Takes with nothing to say: the empty state is "nothing noticed", not "too few".
    const five = [0, 1, 2, 3, 4].map((i) => row(`e${i}`, i * DAY));
    expect(notebookFrom(five, COACH_STORED_DEFAULTS, READ, NOW)).toMatchObject({ noticed: [], tooFewTakes: false });
    const histories = [
      tempoHistory(),
      [0, 1, 2, 3, 4, 5].map((i) => row("held", i * DAY, { facts: { lean: [0, -1, 30, -5] } })),
      [0, 1, 2, 3, 4].map((i) => row("y", i * HOUR, { bpm: 90 - i * 5, facts: { ungraded: "chosen" } })),
    ];
    for (const rows of histories) {
      const nb = notebookFrom(rows, COACH_STORED_DEFAULTS, READ, NOW, [FX_PATH]);
      expect(nb.noticed.length).toBeGreaterThan(0);
      expect(nb.tooFewTakes).toBe(false);
    }
  });

  it("an empty history: nothing noticed, the empty state's sentence, no goal question", () => {
    expect(notebookFrom([], COACH_STORED_DEFAULTS, READ, NOW)).toEqual({
      noticed: [],
      noticedState: "read",
      goal: null,
      goalState: "read",
      askGoal: false,
      takesRead: 0,
      firstTakeAt: null,
      tooFewTakes: true,
    });
  });
});
