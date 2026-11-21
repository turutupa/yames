/**
 * `make_exercise` (leg t2c): the proposal and its preview, nothing stored
 * before the press, the press through the host's one door, the receipt's
 * Undo taking out exactly what was added, the refusals with the nearest
 * recipe that builds, and never during a Take or a jam take.
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as custom from "../../paths/custom";
import { fakeHost, toolCtx } from "./fakeHost";
import {
  MAKE_BOX_SCALES,
  MAKE_CHORDS,
  MAKE_DIRECTIONS,
  MAKE_MAX_BARS,
  MAKE_MAX_POSITION,
  MAKE_ROOTS,
  MAKE_SEVEN_SCALES,
  MAKE_SHAPES,
  MAKE_SUBDIVISIONS,
  exerciseGenerator,
  loadExerciseGenerator,
  recipeRoot,
} from "./make";
import { confirmCoachTool, runCoachTool, runCoachUndo } from "./run";
import type { MyExerciseAdd, MyExerciseUndo } from "./host";
import type { Proposal, RunOutcome, ToolCall, ToolResult } from "./types";

beforeAll(async () => {
  await loadExerciseGenerator();
});

const call = (args: Record<string, string | number>): ToolCall => ({ tool: "make_exercise", args });
const MOCK_17 = { root: "A", scale: "minorPentatonic", position: 5 };

function proposalOf(outcome: RunOutcome): Proposal {
  if (!outcome.ok || !("proposal" in outcome)) throw new Error(`no proposal: ${JSON.stringify(outcome)}`);
  return outcome.proposal;
}

/** A host whose store answers as told, recording what it was asked. */
function storeHost(add: MyExerciseAdd = "added", undo: MyExerciseUndo = "undone", jam = false) {
  const added: Array<{ recipe: custom.Recipe; at: number }> = [];
  const undone: Array<{ key: string; at: number }> = [];
  const host = fakeHost(
    { view: "today" },
    {
      jamTakeRunning: () => jam,
      addMyExercise: (recipe, at) => {
        added.push({ recipe, at });
        return Promise.resolve(add);
      },
      undoAddedExercise: (key, at) => {
        undone.push({ key, at });
        return Promise.resolve(undo);
      },
    },
  );
  return { host, added, undone };
}

describe("the closed sets are the generator's", () => {
  it("shapes, scales, chords, subdivisions, directions, roots, limits", () => {
    expect(exerciseGenerator()).not.toBeNull();
    expect(MAKE_SHAPES).toEqual(custom.RECIPE_SHAPES);
    expect(MAKE_BOX_SCALES).toEqual(custom.BOX_SCALES);
    expect(MAKE_SEVEN_SCALES).toEqual(custom.SEVEN_NOTE_SCALES);
    expect(MAKE_CHORDS).toEqual(custom.ARPEGGIO_CHORDS);
    expect(MAKE_SUBDIVISIONS).toEqual(custom.RECIPE_SUBDIVISIONS);
    expect(MAKE_DIRECTIONS).toEqual(custom.RECIPE_DIRECTIONS);
    expect(MAKE_ROOTS).toEqual(custom.RECIPE_ROOTS);
    expect(MAKE_MAX_POSITION).toBe(custom.MAX_POSITION);
    expect(MAKE_MAX_BARS).toBe(custom.MAX_BARS);
  });

  it("a root as the player names it is the recipe's spelling of that note", () => {
    expect(recipeRoot("A#")).toBe("Bb");
    expect(recipeRoot("Db")).toBe("C#");
    expect(recipeRoot("A")).toBe("A");
    expect(recipeRoot("H")).toBeNull();
  });
});

describe("mock 17: the proposal, before any press", () => {
  it("shows what it would make: three bars, from 60 BPM, A on the low E at fret 5, and the two chips", () => {
    const { host, added } = storeHost();
    const proposal = proposalOf(runCoachTool(call(MOCK_17), host, toolCtx()));
    expect(proposal.line.key).toBe("coachTools.propose.makeExercise");
    const preview = proposal.preview!;
    expect(preview.summary).toMatchObject({ shape: "box", root: "A", scale: "minorPentatonic", position: 5, bars: 3, startBpm: 60, subdivision: "eighths", direction: "upAndBack" });
    expect(preview.summary.firstNote).toEqual({ string: 6, fret: 5, midi: 45, name: "A" });
    expect(preview.notes).toHaveLength(22);
    expect(preview.notes[0]).toEqual({ string: 6, fret: 5 });
    expect(preview.variants.map((v) => v.label.key)).toEqual(["coachTools.make.chip.sixteenths", "coachTools.make.chip.nextPosition"]);
    // Nothing is stored before the press, and nothing else moved.
    expect(added).toEqual([]);
    expect(host.changes()).toEqual([]);
  });

  it("each chip is a full call that proposes again, and builds", () => {
    const { host } = storeHost();
    const preview = proposalOf(runCoachTool(call(MOCK_17), host, toolCtx())).preview!;
    const [sixteenths, next] = preview.variants;
    expect(sixteenths.call.args).toMatchObject({ subdivision: 4, position: 5 });
    expect(sixteenths.call.args.bars).toBeUndefined();
    const moved = proposalOf(runCoachTool(next.call, host, toolCtx())).preview!;
    expect(moved.summary.position).toBeGreaterThan(5);
    expect(proposalOf(runCoachTool(sixteenths.call, host, toolCtx())).preview!.summary.subdivision).toBe("sixteenths");
  });

  it("the defaults are mock 17's: eighths, up and back, the root's fret, the bars one time through needs", () => {
    const { host } = storeHost();
    const preview = proposalOf(runCoachTool(call({ root: "A", scale: "minorPentatonic" }), host, toolCtx())).preview!;
    expect(preview.summary).toMatchObject({ position: 5, bars: 3, subdivision: "eighths", direction: "upAndBack" });
  });
});

describe("the press", () => {
  it("adds through the host once, says it is at it, then what it added, with an Undo for exactly that entry", async () => {
    const { host, added, undone } = storeHost();
    const proposal = proposalOf(runCoachTool(call(MOCK_17), host, toolCtx()));
    const result = confirmCoachTool(proposal, host, toolCtx()) as ToolResult & { ok: true };
    expect(result.ok).toBe(true);
    expect(added).toHaveLength(1);
    expect(custom.recipeKey(added[0].recipe)).toBe("v1-box-a-minorpentatonic-s61-f5-eighths-3b-upandback");
    expect(result.receipt.key).toBe("coachTools.receipt.makeExerciseAdding");
    expect(await result.later).toEqual({
      key: "coachTools.receipt.makeExercise",
      values: { shape: "box", root: "A", scale: "minorPentatonic", chord: "", position: 5, string: 6 },
    });
    expect(result.undo).toEqual({ tool: "undo_make_exercise", args: { key: "v1-box-a-minorpentatonic-s61-f5-eighths-3b-upandback", at: String(added[0].at) } });
    expect(result.next?.[0].call).toEqual({ tool: "go_to", args: { screen: "paths" } });
    // A second press of the same proposal does nothing.
    expect(confirmCoachTool(proposal, host, toolCtx()).ok).toBe(false);
    expect(added).toHaveLength(1);

    const back = runCoachUndo(result.undo, host, toolCtx()) as ToolResult & { ok: true };
    expect(back.ok).toBe(true);
    expect(undone).toEqual([{ key: "v1-box-a-minorpentatonic-s61-f5-eighths-3b-upandback", at: added[0].at }]);
    expect(await back.later).toEqual({ key: "coachTools.receipt.undoMakeExercise", values: {} });
    // Once.
    expect(runCoachUndo(result.undo, host, toolCtx()).ok).toBe(false);
  });

  it("the list's answer is the receipt: full, already, not kept", async () => {
    for (const answer of ["full", "already", "unreadable", "failed"] as const) {
      const { host } = storeHost(answer);
      const result = confirmCoachTool(proposalOf(runCoachTool(call(MOCK_17), host, toolCtx())), host, toolCtx()) as ToolResult & { ok: true };
      expect((await result.later)?.key).toBe(`coachTools.why.make.${answer}`);
    }
  });

  it("an Undo that finds the entry gone says so", async () => {
    const { host } = storeHost("added", "gone");
    const result = confirmCoachTool(proposalOf(runCoachTool(call(MOCK_17), host, toolCtx())), host, toolCtx()) as ToolResult & { ok: true };
    const back = runCoachUndo(result.undo, host, toolCtx()) as ToolResult & { ok: true };
    expect((await back.later)?.key).toBe("coachTools.why.make.undo.gone");
  });

  it("no Open My exercises chip when the list is on screen", () => {
    const { host } = storeHost();
    host.setView("paths");
    const result = confirmCoachTool(proposalOf(runCoachTool(call(MOCK_17), host, toolCtx())), host, toolCtx()) as ToolResult & { ok: true };
    expect(result.next).toBeUndefined();
  });
});

describe("never during a Take", () => {
  it("a Take running: not proposed", () => {
    const { host } = storeHost();
    const playing = toolCtx({ run: { phase: "playing" } as never });
    expect(runCoachTool(call(MOCK_17), host, playing)).toMatchObject({ ok: false, why: "notNow" });
  });

  it("a jam take being written: neither proposed nor pressed", () => {
    const quiet = storeHost();
    const proposal = proposalOf(runCoachTool(call(MOCK_17), quiet.host, toolCtx()));
    const { host, added } = storeHost("added", "undone", true);
    expect(runCoachTool(call(MOCK_17), host, toolCtx())).toMatchObject({ ok: false, line: { key: "coachTools.why.notNow.take" } });
    expect(confirmCoachTool(proposal, host, toolCtx())).toMatchObject({ ok: false, line: { key: "coachTools.why.notNow.take" } });
    expect(added).toEqual([]);
  });
});

describe("what it cannot build, it says, and offers the nearest that does", () => {
  const refusal = (args: Record<string, string | number>) => {
    const out = runCoachTool(call(args), storeHost().host, toolCtx());
    if (out.ok) throw new Error(`not refused: ${JSON.stringify(args)}`);
    return out;
  };

  it("no box at fret 6: the frets either side where one starts, each a chip that builds", () => {
    const out = refusal({ ...MOCK_17, position: 6 });
    expect(out.line).toEqual({ key: "coachTools.why.make.noShapeHere", values: { fret: 6 } });
    expect(out.choices!.length).toBeGreaterThan(0);
    for (const choice of out.choices!) {
      expect(choice.label.key).toBe("coachTools.make.chip.fret");
      expect(runCoachTool(choice.call, storeHost().host, toolCtx()).ok).toBe(true);
    }
    expect(out.choices!.map((c) => c.call.args.position)).toContain(5);
  });

  it("one bar asked for a shape that needs three: says three, offers three", () => {
    const out = refusal({ ...MOCK_17, bars: 1 });
    expect(out.line).toEqual({ key: "coachTools.why.make.tooManyNotes", values: { count: 3 } });
    expect(out.choices!.map((c) => c.call.args.bars)).toEqual([3]);
  });

  it("eight bars of a short line: too few notes, offers the bars it fills", () => {
    const out = refusal({ root: "A", scale: "minorPentatonic", position: 5, bars: 8, subdivision: 1 });
    expect(out.line.key).toBe("coachTools.why.make.tooFewNotes");
    for (const choice of out.choices!) expect(runCoachTool(choice.call, storeHost().host, toolCtx()).ok).toBe(true);
  });

  it("words that name no recipe: a plain sentence, no guess", () => {
    expect(refusal({}).line.key).toBe("coachTools.why.make.what");
    expect(refusal({ scale: "minorPentatonic" }).line.key).toBe("coachTools.why.make.root");
    expect(refusal({ root: "A", scale: "lydian" }).line).toEqual({ key: "coachTools.why.make.scale", values: { scale: "lydian" } });
    expect(refusal({ root: "A", shape: "box", scale: "major" }).line.key).toBe("coachTools.why.make.boxScale");
    expect(refusal({ root: "A", shape: "threePerString", scale: "blues" }).line.key).toBe("coachTools.why.make.threeScale");
    expect(refusal({ root: "A", shape: "arpeggio" }).line.key).toBe("coachTools.why.make.chord");
    expect(refusal({ root: "A", chord: "m7", scale: "major" }).line.key).toBe("coachTools.why.make.mixed");
    for (const out of [refusal({}), refusal({ root: "A", scale: "lydian" })]) expect(out.choices ?? []).toEqual([]);
  });

  it("an arpeggio and the chromatic shape build; with no fret named, the nearest fret that holds the shape", () => {
    const { host } = storeHost();
    expect(proposalOf(runCoachTool(call({ root: "A", chord: "m7" }), host, toolCtx())).preview!.summary.chord).toBe("m7");
    // A fret named is built as asked or refused, never moved.
    const asked = runCoachTool(call({ root: "A", chord: "m7", position: 5 }), host, toolCtx());
    if (asked.ok) expect(proposalOf(asked).preview!.summary.position).toBe(5);
    expect(proposalOf(runCoachTool(call({ shape: "chromatic", position: 5 }), host, toolCtx())).preview!.summary.firstNote.name).toBeNull();
  });
});
