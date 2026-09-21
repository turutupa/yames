/**
 * Three passes, written down — the same three the tests check and the
 * pictures show.
 *
 * One file rather than two because a fixture the screenshots use and a
 * fixture the tests use will drift, and the day they do, a green suite is
 * proving something about a review nobody can look at. So the shot harness
 * (`src/shots/mockIpc.ts`) synthesises its segment from these recipes and
 * the unit tests build theirs from the same ones.
 *
 * **Nothing here is a real song and nothing here is real playing.** The
 * results are arithmetic over a schedule: "every onset in these bars was a
 * miss", "every onset was a quarter of a beat early". That is enough for the
 * review to have something to colour, a finding to point at and a sentence to
 * say, and it is honest about being a fixture (`SONGS.md` S0.4).
 */
import type {
  Evidence,
  ExtraOnset,
  Finding,
  FindingKind,
  OnsetResult,
  ScoreSchedule,
  SongScore,
} from "../../../songs/types";

/**
 * Which pass to build.
 *
 * `improved` (W25) is `clean`'s pass under a different finding: the notes
 * landed, and what the coach has to say about it is that this passage is
 * better than it was — which is the one finding that offers "see the
 * difference" (`COACH_UX.md` C3, `plans/ECHORA.md` A2).
 */
export type ReviewRecipe = "rushing" | "missed" | "clean" | "improved";

export type ScriptedPass = {
  results: OnsetResult[];
  extras: ExtraOnset[];
  /** What scoring would have said, 0–100. */
  score: number;
  passes: number;
};

/**
 * A pass over a schedule, built by rule.
 *
 * `quarterMs` is what the deviations are stated against: "a quarter of a beat
 * early" is a different number of milliseconds at 80 and at 140, and a
 * fixture that hard-coded milliseconds would colour differently at every
 * tempo.
 */
export function scriptPass(
  schedule: ScoreSchedule,
  recipe: ReviewRecipe,
  options: { quarterMs?: number; passes?: number; troubleFrom?: number; troubleTo?: number } = {},
): ScriptedPass {
  const quarterMs = options.quarterMs ?? 500;
  const passes = options.passes ?? (recipe === "missed" ? 3 : 1);
  // Where it goes wrong, in quarter notes from the start of the range. The
  // default is the back half, which is where a passage usually comes apart.
  const from = options.troubleFrom ?? schedule.lengthBeats / 2;
  const to = options.troubleTo ?? schedule.lengthBeats;

  const results: OnsetResult[] = [];
  const extras: ExtraOnset[] = [];

  for (let pass = 0; pass < passes; pass++) {
    for (const onset of schedule.onsets) {
      const inTrouble = onset.beat >= from && onset.beat < to;
      if (onset.soft) {
        // The contract's own rule: a soft onset that did not arrive is not a
        // miss and never counts against the player.
        results.push({ id: onset.id, state: "softAbsent", deviationMs: null, pass });
        continue;
      }
      if (recipe === "missed" && inTrouble) {
        results.push({ id: onset.id, state: "miss", deviationMs: null, pass });
        continue;
      }
      const deviation =
        recipe === "rushing" && inTrouble
          ? -0.24 * quarterMs
          : steadyJitter(onset.id) * quarterMs * 0.012;
      results.push({
        id: onset.id,
        state: "hit",
        deviationMs: round(deviation),
        pass,
        ...(onset.accent ? { accentHeard: recipe !== "missed" } : {}),
      });
    }
    // A pass that dropped notes usually gains a couple as well — the hand
    // keeps going where the ear has lost the place.
    if (recipe === "missed") {
      extras.push({ beat: round(from + 0.5), pass }, { beat: round(from + 1.25), pass });
    }
  }

  return {
    results,
    extras,
    score:
      recipe === "clean" ? 94 : recipe === "improved" ? 88 : recipe === "rushing" ? 71 : 58,
    passes,
  };
}

/**
 * Deterministic wobble, so a "clean" pass is not suspiciously perfect and is
 * the same every time it is drawn. Not randomness — a screenshot that changed
 * between two runs is a screenshot nobody can review.
 */
function steadyJitter(id: number): number {
  return (((id * 37) % 11) - 5) / 5;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The finding a recipe is meant to produce, with evidence that matches it. */
export function scriptFindings(
  score: SongScore,
  schedule: ScoreSchedule,
  recipe: ReviewRecipe,
  pass: ScriptedPass,
  options: { firstBar?: number; lastBar?: number; bpm?: number } = {},
): Finding[] {
  const firstBar = options.firstBar ?? Math.floor(score.bars.length / 2);
  const lastBar = options.lastBar ?? Math.max(firstBar, score.bars.length - 1);
  const bpm = options.bpm ?? 96;
  const hits = pass.results.filter((r) => r.state === "hit").length;
  const scored = pass.results.filter((r) => r.state !== "softAbsent").length;
  const noteIds = noteIdsBetween(score, schedule, firstBar, lastBar);

  const base: Evidence = {
    onsets: scored,
    hits,
    hitRate: scored === 0 ? 0 : hits / scored,
    meanDeviationMs: recipe === "rushing" ? -120 : 4,
    deviationBeats: recipe === "rushing" ? -0.24 : 0.01,
    spreadMs: recipe === "clean" ? 6 : 18,
    passes: pass.passes,
    passesAffected: recipe === "missed" ? pass.passes : 1,
    referenceBpm: bpm,
    printedBars: [score.bars[firstBar]?.printedBar ?? firstBar, score.bars[lastBar]?.printedBar ?? lastBar],
  };

  switch (recipe) {
    case "rushing":
      return [
        {
          kind: "rushing",
          bars: [firstBar, lastBar],
          noteIds,
          severity: 0.62,
          evidence: { ...base, subdivision: 4 },
          fix: { type: "loopBars", start: firstBar, end: lastBar, tempoPercent: 80 },
        },
      ];
    case "missed":
      return [
        {
          kind: "consistentMiss",
          bars: [firstBar, lastBar],
          noteIds,
          severity: 0.81,
          evidence: base,
          fix: { type: "loopBars", start: firstBar, end: lastBar, tempoPercent: 70 },
        },
        {
          kind: "extras",
          bars: [firstBar, lastBar],
          noteIds,
          severity: 0.35,
          evidence: { ...base, extras: pass.extras.length },
          fix: { type: "loopBars", start: firstBar, end: lastBar, tempoPercent: 70 },
        },
      ];
    case "improved":
      // The passage is better than it was, and the evidence is two
      // recordings of it. `bars` covers the whole passage, because "this has
      // come on" is about the passage rather than about a moment in it.
      return [
        {
          kind: "improved",
          bars: [firstBar, lastBar],
          noteIds,
          severity: 0.4,
          // `spreadDeltaMs` is how much steadier this go was than last, and
          // the `improved` sentences quote it — without one the coach says
          // "0 ms steadier", which is the shape of a fixture that forgot a
          // field rather than of a finding.
          evidence: { ...base, hitRate: 0.96, passesAffected: pass.passes, spreadDeltaMs: 14 },
          fix: { type: "comeBack", days: 2 },
        },
      ];
    case "clean":
      return [
        {
          kind: "clean",
          bars: [0, Math.max(0, score.bars.length - 1)],
          noteIds: noteIdsBetween(score, schedule, 0, Math.max(0, score.bars.length - 1)),
          severity: 0.5,
          evidence: {
            ...base,
            hitRate: 1,
            passesAffected: pass.passes,
            printedBars: [
              score.bars[0]?.printedBar ?? 0,
              score.bars[score.bars.length - 1]?.printedBar ?? 0,
            ],
          },
          fix: { type: "comeBack", days: 3 },
        },
      ];
  }
}

/** Every note id the schedule asks for between two played bars. */
function noteIdsBetween(
  score: SongScore,
  schedule: ScoreSchedule,
  firstBar: number,
  lastBar: number,
): number[] {
  const startTick = score.bars[firstBar]?.startTick ?? 0;
  const last = score.bars[lastBar];
  const endTick = last ? last.startTick + last.lengthTicks : Number.MAX_SAFE_INTEGER;
  const wanted = new Set(
    score.notes.filter((n) => n.tick >= startTick && n.tick < endTick).map((n) => n.id),
  );
  return schedule.onsets.flatMap((o) => o.noteIds.filter((id) => wanted.has(id)));
}

/** Every kind, for the test that says each one has a sentence. */
export const ALL_FINDING_KINDS: readonly FindingKind[] = [
  "consistentMiss",
  "rushing",
  "dragging",
  "afterShift",
  "fallsApart",
  "extras",
  "uneven",
  "beatPositionBias",
  "subdivisionWeak",
  "drift",
  "tempoCeiling",
  "improved",
  "clean",
];
