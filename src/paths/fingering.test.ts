/**
 * The fingering rules (`fingering.ts`), one by one, and then the fingering of
 * every Exercise in every Path pinned in a file a guitarist can read:
 * `__fingering__/<path>.txt`, one line per variant, the Hand line and each
 * note's finger in order ("6:5=1 6:8=4 ..."; `_` no number, `t` a tap).
 *
 * The audit behind it (2026-11-18) is `~/projects/.preview/fingering-audit/REPORT.md`.
 * When a change moves a finger, read the diff of the pinned file the way a
 * teacher reads a fingered tab before accepting it (`vitest -u`).
 */
import { describe, expect, it } from "vitest";
import type { Exercise, LearningPath, PathNote } from "./format";
import { fingerPlan, fingersByPlace, firstBase, handMoves, type FingerNote, type HandAt } from "./fingering";
import { parseTab } from "./tabDsl";
import { STANDARD_TUNING } from "./format";

const N = (string: number, fret: number, tech: string[] = [], extra: Partial<FingerNote> = {}): FingerNote => ({
  string,
  fret,
  tech,
  ...extra,
});
/** Notes in time order, a tick apart unless given. */
const seq = (...notes: FingerNote[]) => notes.map((n, i) => ({ tick: i * 240, ...n }));
const fingersOf = (notes: FingerNote[], at: HandAt) => fingerPlan(notes, at).map((s) => s.finger);
const STILL = (fret: number): HandAt => ({ fret, shifts: "none" });
const MOVING = (fret: number): HandAt => ({ fret, shifts: "allowed" });

describe("the fingering rules", () => {
  it("is one finger per fret from the index, open strings 0", () => {
    expect(fingersOf(seq(N(5, 5), N(5, 6), N(5, 7), N(5, 8), N(4, 0)), STILL(5))).toEqual([1, 2, 3, 4, 0]);
  });

  it("plays the pentatonic box 1-4 on the outer strings and 1-3 in the middle", () => {
    const box = seq(N(6, 5), N(6, 8), N(5, 5), N(5, 7), N(4, 5), N(4, 7), N(3, 5), N(3, 7), N(2, 5), N(2, 8), N(1, 5), N(1, 8));
    expect(fingersOf(box, STILL(5))).toEqual([1, 4, 1, 3, 1, 3, 1, 3, 1, 4, 1, 4]);
  });

  it("plays three notes a string 1-3-4 for whole-half, 1-2-4 for half-whole and the stretched whole-whole", () => {
    const nps = seq(N(6, 5), N(6, 7), N(6, 8), N(5, 5), N(5, 6), N(5, 8), N(4, 5), N(4, 7), N(4, 9));
    expect(fingersOf(nps, STILL(5))).toEqual([1, 3, 4, 1, 2, 4, 1, 2, 4]);
  });

  it("rolls a finger across strings at one fret, and stretches the little finger up a sweep's top", () => {
    // The A minor triad at 12 with the hammer to 17: 3-2-1, then the little finger.
    const am = seq(N(3, 14), N(2, 13), N(1, 12), N(1, 17, ["hammer"]), N(1, 12, ["pull"]), N(2, 13));
    expect(fingersOf(am, STILL(12))).toEqual([3, 2, 1, 4, 1, 2]);
    // The C major sweep at 8: ring, middle, an index roll, little finger at 12.
    expect(fingersOf(seq(N(4, 10), N(3, 9), N(2, 8), N(1, 8), N(1, 12)), STILL(8))).toEqual([3, 2, 1, 1, 4]);
  });

  it("stretches two frets only from the 8th fret up", () => {
    expect(fingersOf(seq(N(1, 12), N(1, 17)), STILL(12))).toEqual([1, 4]);
    expect(fingersOf(seq(N(1, 5), N(1, 10)), STILL(5))).toEqual([1, null]);
  });

  it("lets the index reach a fret back, and gives nothing further out to a hand that stays", () => {
    expect(fingersOf(seq(N(3, 5), N(3, 4), N(4, 7)), STILL(5))).toEqual([1, 1, 3]);
    expect(fingersOf(seq(N(3, 5), N(3, 3)), STILL(5))).toEqual([1, null]);
  });

  it("never hammers or pulls a finger onto itself", () => {
    // Index at 12: the pull from 17 down to 15 is the little finger to the ring.
    const run = seq(N(1, 12), N(1, 17, ["hammer"]), N(1, 15, ["pull"]), N(1, 13, ["pull"]), N(1, 12, ["pull"]));
    expect(fingersOf(run, STILL(12))).toEqual([1, 4, 3, 2, 1]);
    // A pull to a fret below the index moves the whole hand down first.
    expect(fingersOf(seq(N(2, 10), N(1, 8), N(1, 7, ["pull"]), N(2, 8)), MOVING(8))).toEqual([3, 2, 1, 2]);
  });

  it("keeps a slide on one finger, and moves the hand with it", () => {
    const slide = seq(N(3, 5), N(3, 7, ["slide"]), N(3, 9), N(2, 8), N(2, 10));
    const plan = fingerPlan(slide, MOVING(5));
    expect(plan.map((s) => s.finger)).toEqual([1, 3, 3, 2, 4]);
    expect(plan.map((s) => s.base)).toEqual([5, 5, 7, 7, 7]);
  });

  it("puts a bend at the top of the box on the ring finger", () => {
    expect(fingersOf(seq(N(1, 5), N(2, 8, ["bend"], { bend: 2 }), N(2, 5)), STILL(5))).toEqual([1, 3, 1]);
    expect(fingersOf(seq(N(3, 7, ["bend"], { bend: 2 })), STILL(5))).toEqual([3]);
  });

  it("gives a tap past the hand no number, and a hammer from nowhere under it its finger", () => {
    const tap = seq(N(1, 12, ["tap"]), N(1, 5, ["pull"]), N(1, 8, ["hammer"]));
    expect(fingersOf(tap, STILL(5))).toEqual([null, 1, 4]);
    const nowhere = seq(N(6, 8), N(5, 5, ["tap"]), N(5, 7, ["hammer"]));
    expect(fingersOf(nowhere, STILL(5))).toEqual([4, 1, 3]);
  });

  it("moves a shifting hand as little as it can, at the bar line when it can", () => {
    // Two triads a bar each: Am at 12 (3-2-1), then F at 13 (2-1-1), not F crammed in at 12.
    const bar = 3840;
    const rock = (shape: FingerNote[], at: number) =>
      [...shape, ...[...shape].reverse(), ...shape, ...[...shape].reverse()].map((n, i) => ({ ...n, tick: at + i * 320 }));
    const am = rock([N(3, 14), N(2, 13), N(1, 12)], 0);
    const f = rock([N(3, 14), N(2, 13), N(1, 13)], bar);
    const fingers = fingersOf([...am, ...f], MOVING(12));
    expect(fingers.slice(0, 3)).toEqual([3, 2, 1]);
    expect(fingers.slice(12, 15)).toEqual([2, 1, 1]);
  });

  it("follows the content's own finger first", () => {
    const own = seq(N(3, 14, [], { finger: 4 }), N(2, 13, [], { finger: 3 }), N(1, 12, [], { finger: 2 }), N(1, 10, ["pull"], { finger: 1 }));
    expect(fingersOf(own, STILL(10))).toEqual([4, 3, 2, 1]);
  });

  it("shows one finger a place: the content's, then a bend's, then the most used", () => {
    const places = fingersByPlace(seq(N(2, 8), N(2, 5), N(2, 8, ["bend"], { bend: 2 }), N(2, 8)), STILL(5));
    expect(places.get("2:8")).toBe("3");
    expect(fingersByPlace(seq(N(1, 5), N(1, 5, [], { finger: 2 })), STILL(5)).get("1:5")).toBe("2");
  });

  it("knows when a hand allowed to move never does, and where its index starts", () => {
    const box = seq(N(4, 7), N(3, 5), N(3, 7), N(2, 5));
    expect(handMoves(box, 5)).toBe(false);
    expect(handMoves([...box, ...seq(N(4, 12), N(3, 10))].map((n, i) => ({ ...n, tick: i * 240 })), 5)).toBe(true);
    expect(firstBase(seq(N(6, 12), N(5, 10), N(4, 9)), MOVING(7))).toBe(8);
  });

  it("reads the tab's f1..f4 as the content's finger", () => {
    const { notes } = parseTab("/4 3:14f4 2:13f3 1:12f2 1:10pf1", STANDARD_TUNING, 3840);
    expect(notes.map((n) => n.finger)).toEqual([4, 3, 2, 1]);
    expect(notes[3].tech).toEqual(["pull"]);
    expect(() => parseTab("/4 3:0f1", STANDARD_TUNING, 3840)).toThrow(/open string/);
    expect(() => parseTab("/4 3:5f5", STANDARD_TUNING, 3840)).toThrow(/finger/);
  });
});

// ---------------------------------------------------------------------------
// Every Exercise in every Path
// ---------------------------------------------------------------------------

const PACKS = Object.entries(import.meta.glob("./packs/*.json", { eager: true, import: "default" })) as [string, LearningPath][];

type Variantish = { id: string; position: Exercise["position"]; notes: PathNote[] };

function exercisesOf(path: LearningPath): { where: string; ex: Exercise }[] {
  const out: { where: string; ex: Exercise }[] = [];
  for (const level of path.levels ?? []) for (const w of level.warmups ?? []) out.push({ where: `warm-up ${level.id}`, ex: w });
  for (const step of path.steps) for (const ex of step.exercises) out.push({ where: step.id, ex });
  return out;
}

function variantsOf(ex: Exercise): Variantish[] {
  return ex.variation?.variants ?? [{ id: "-", position: ex.position, notes: ex.notes }];
}

function handLine(position: Exercise["position"]): string {
  if (position.fret <= 0) return "Hand: open position";
  return position.shifts === "allowed" ? `Hand: index at ${position.fret}, moves` : `Hand: index at ${position.fret}, stays`;
}

function line(ex: Exercise, v: Variantish): string {
  const plan = fingerPlan(v.notes, v.position);
  const cells = v.notes.map((n, i) => {
    const f = plan[i].finger;
    const mark = f !== null ? String(f) : n.tech.includes("tap") ? "t" : "_";
    return `${n.string}:${n.fret}=${mark}`;
  });
  return `${ex.id} [${v.id}] ${handLine(v.position)} | ${cells.join(" ")}`;
}

describe("every Exercise's fingering", () => {
  for (const [file, path] of PACKS) {
    it(`${path.id}: is pinned, one line a variant`, async () => {
      const lines = exercisesOf(path).flatMap(({ ex }) => variantsOf(ex).map((v) => line(ex, v)));
      await expect(`${lines.join("\n")}\n`).toMatchFileSnapshot(`./__fingering__/${file.replace(/^.*\//, "").replace(/\.json$/, ".txt")}`);
    });

    it(`${path.id}: numbers every fretted note, and no hammer or pull lands on the finger it left`, () => {
      const problems: string[] = [];
      for (const { ex } of exercisesOf(path)) {
        for (const v of variantsOf(ex)) {
          const plan = fingerPlan(v.notes, v.position);
          v.notes.forEach((n, i) => {
            if (n.fret > 0 && !n.tech.includes("tap") && plan[i].finger === null) problems.push(`${ex.id} [${v.id}] note ${i + 1} ${n.string}:${n.fret} has no finger`);
            const before = v.notes[i - 1];
            if (
              before &&
              before.string === n.string &&
              before.fret !== n.fret &&
              (n.tech.includes("hammer") || n.tech.includes("pull")) &&
              !before.tech.includes("tap") &&
              plan[i].finger !== null &&
              plan[i].finger === plan[i - 1].finger
            )
              problems.push(`${ex.id} [${v.id}] note ${i + 1}: a hammer or pull on finger ${plan[i].finger} from itself`);
          });
        }
      }
      expect(problems).toEqual([]);
    });

    it(`${path.id}: says the hand moves only when it does, from the fret its index starts on`, () => {
      const problems: string[] = [];
      for (const { ex } of exercisesOf(path)) {
        for (const v of variantsOf(ex)) {
          if (v.position.shifts !== "allowed") continue;
          const start = firstBase(v.notes, v.position);
          if (start !== null && start !== Math.max(1, v.position.fret)) problems.push(`${ex.id} [${v.id}] says ${v.position.fret}, the index starts at ${start}`);
        }
      }
      expect(problems).toEqual([]);
    });
  }
});
