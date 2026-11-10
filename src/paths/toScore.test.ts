// The runtime check. An Exercise has to reach the app's real scoring path:
// alphaTex through the real importer, the score through the real schedule. The
// other half is `src-tauri/tests/path_exercises.rs`, which runs `match_attempt`
// on these same schedules.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importSong } from "../songs/import";
import { buildSchedule } from "../songs/schedule";
import { texBytes } from "../songs/fixtures";
import type { PathDoc } from "./format";
import { concreteExercises } from "./pipeline";
import { exerciseAlphaTex, exerciseScore } from "./toScore";
import { notesForTake, resolveVariant } from "./variants";

const PACKS = ["alternate-picking", "sweep-picking", "blues-pentatonics"];

function loadPack(id: string): PathDoc {
  return JSON.parse(readFileSync(path.join(process.cwd(), `src/paths/packs/${id}.json`), "utf8")) as PathDoc;
}

describe.each(PACKS)("%s through the real importer", (id) => {
  const doc = loadPack(id);
  const exercises = [...doc.steps.flatMap((s) => s.exercises), ...(doc.levels ?? []).flatMap((l) => l.warmups)].flatMap(concreteExercises);

  it.each(exercises.map((e) => [e.id, e] as const))("%s", (_id, ex) => {
    const bpm = ex.tempo.passAtBpm ?? ex.tempo.rungs[0].bpm;
    const ours = exerciseScore(doc.id, ex, bpm);
    const tex = exerciseAlphaTex(ex, bpm);
    const { score } = importSong(texBytes(tex), `${ex.id}.alphatex`, 0);

    expect(score.tuning).toEqual(ours.tuning);
    expect(score.bars.length).toBe(ours.bars.length);
    const pick = (n: (typeof ours.notes)[number]) => ({
      tick: n.tick,
      string: n.string,
      fret: n.fret,
      midi: n.midi,
      accent: n.accent,
      techniques: [...n.techniques].sort(),
    });
    expect(score.notes.map(pick)).toEqual(ours.notes.map(pick));

    // The two routes to a schedule agree, so the tab view and the pack cannot
    // disagree about what is expected of the player.
    const fromFile = buildSchedule(score);
    const fromPack = buildSchedule(ours);
    expect(fromFile.onsets.map((o) => [o.beat, o.soft, o.accent])).toEqual(
      fromPack.onsets.map((o) => [o.beat, o.soft, o.accent]),
    );
    expect(fromFile.lengthBeats).toBe(fromPack.lengthBeats);
  });
});

describe("a variant and a chain, from the seed to the schedule", () => {
  const doc = loadPack("sweep-picking");
  const chain = doc.steps.find((s) => s.id === "link-chains")!.exercises.find((e) => e.id.endsWith("looped-chain"))!;

  it("a chained-arpeggio Exercise: one seed, known notes, a real schedule", () => {
    const { variantId, exercise } = notesForTake(chain, "session-12", 4);
    const again = resolveVariant(chain, variantId)!;
    expect(again.notes).toEqual(exercise.notes);
    const schedule = buildSchedule(exerciseScore(doc.id, exercise, 90));
    expect(schedule.onsets.length).toBe(exercise.notes.length);
    expect(schedule.lengthBeats).toBe(16);
    // Hammers and pulls are soft, and every chord change keeps going.
    expect(schedule.onsets.some((o) => o.soft)).toBe(true);
    expect(chain.chain).toBeDefined();
    expect(exercise.chords?.length).toBe(4);
  });

  it("two seeds give different notes, each of them through the importer", () => {
    const a = notesForTake(chain, 1, 0).exercise;
    const b = notesForTake(chain, 1, 1).exercise;
    expect(a.notes).not.toEqual(b.notes);
    for (const one of [a, b]) {
      const { score } = importSong(texBytes(exerciseAlphaTex(one, 90)), "take.alphatex", 0);
      expect(score.notes.length).toBe(one.notes.length);
    }
  });

  it("a warm-up's notes never come round the same twice running", () => {
    for (const level of doc.levels!) {
      const warmup = level.warmups[0];
      const takes = Array.from({ length: 14 }, (_v, i) => notesForTake(warmup, "player-1", i).exercise.tab);
      for (let i = 1; i < takes.length; i += 1) expect(takes[i]).not.toBe(takes[i - 1]);
    }
  });
});

describe("what scoring is told", () => {
  it("a hammer-on is soft, so an unheard one is never a miss", () => {
    const doc = loadPack("sweep-picking");
    const ex = doc.steps[0].exercises.find((e) => e.id.endsWith("pentatonic-lick"))!;
    const schedule = buildSchedule(exerciseScore(doc.id, ex, 90));
    expect(schedule.onsets.filter((o) => o.soft).length).toBe(3);
  });

  it("accents arrive as accents", () => {
    const doc = loadPack("alternate-picking");
    const ex = doc.steps[2].exercises[0];
    const schedule = buildSchedule(exerciseScore(doc.id, ex, 80));
    expect(schedule.onsets.filter((o) => o.accent).length).toBe(4);
  });
});
