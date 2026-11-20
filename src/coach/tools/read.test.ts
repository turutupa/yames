/**
 * The `read` tools: they draw what the app's own tables and the song on
 * screen resolve, change nothing, and say "not yet" where the content does
 * not exist.
 */

import { describe, expect, it } from "vitest";
import type { SongRecord } from "../../songs/library";
import { fakeHost, toolCtx } from "./fakeHost";
import { runCoachTool } from "./run";
import { runIn } from "./testPaths";
import type { RunOutcome } from "./types";

function result(outcome: RunOutcome) {
  if ("proposal" in outcome) throw new Error("a read tool proposed");
  return outcome;
}

/** A song whose printed bars 3 and 4 repeat once: played 1..7 are printed 1,2,3,4,3,4,5. */
const SONG = {
  id: "song-1",
  name: "Little Wing",
  score: { bars: [0, 1, 2, 3, 2, 3, 4].map((printedBar, index) => ({ index, printedBar, startTick: index * 1920, lengthTicks: 1920 })) },
} as unknown as SongRecord;

const onSong = toolCtx({ screen: "songs", song: { song: SONG, range: { startBar: 0, endBar: 6 } } });

describe("show_scale", () => {
  it("draws it on the player's neck, and changes nothing", () => {
    const host = fakeHost({}, { instrument: () => "bass" });
    const out = result(runCoachTool({ tool: "show_scale", args: { root: "A", scale: "minorPentatonic" } }, host, toolCtx()));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.receipt).toEqual({ key: "coachTools.receipt.showScale", values: { root: "A", scale: "minorPentatonic" } });
    expect(out.blocks?.[0]).toMatchObject({ type: "fretboard", instrument: "bass" });
    expect(out.undo).toBeUndefined();
    expect(host.changes()).toEqual([]);
  });

  it.each([
    ["a scale the app does not have", { root: "A", scale: "bebop" }, "refused"],
    ["a root the app does not write", { root: "H", scale: "major" }, "refused"],
    ["a position the bass does not have", { root: "A", scale: "major", position: "rootOn6" }, "notFound"],
  ])("%s", (_, args, why) => {
    const out = result(runCoachTool({ tool: "show_scale", args }, fakeHost({}, { instrument: () => "bass" }), toolCtx()));
    expect(out.ok === false && out.why).toBe(why);
  });

  it("not during a Take", () => {
    const out = result(runCoachTool({ tool: "show_scale", args: { root: "A", scale: "major" } }, fakeHost(), toolCtx({ run: runIn("playing") })));
    expect(out.ok === false && out.why).toBe("notNow");
  });
});

describe("show_chord", () => {
  it("draws the first shape, counted from 1", () => {
    const out = result(runCoachTool({ tool: "show_chord", args: { chord: "Am7" } }, fakeHost(), toolCtx()));
    expect(out.ok && out.blocks?.[0]).toMatchObject({ type: "chordShape", index: 0 });
    expect(out.ok && out.receipt.values).toEqual({ chord: "Am7", shape: 1 });
  });

  it.each([
    ["not a chord the app writes", { chord: "A minor seven" }, "refused"],
    ["a shape past the last", { chord: "Am7", shape: 30 }, "notFound"],
    ["shape 0 (they count from 1)", { chord: "Am7", shape: 0 }, "refused"],
  ])("%s", (_, args, why) => {
    const out = result(runCoachTool({ tool: "show_chord", args }, fakeHost(), toolCtx()));
    expect(out.ok === false && out.why).toBe(why);
  });
});

describe("show_bars", () => {
  it("bars of the song on screen, numbered as printed", () => {
    const out = result(runCoachTool({ tool: "show_bars", args: { from: 2, to: 4 } }, fakeHost(), onSong));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.blocks?.[0]).toMatchObject({ type: "tabExcerpt", fromBar: 2, toBar: 4, printedFrom: 2, printedTo: 4 });
    expect(out.receipt).toEqual({ key: "coachTools.receipt.showBars", values: { song: "Little Wing", from: 2, to: 4 } });
  });

  it("one bar when `to` is left out; a repeated bar is its first pass", () => {
    const out = result(runCoachTool({ tool: "show_bars", args: { from: 4 } }, fakeHost(), onSong));
    expect(out.ok && out.blocks?.[0]).toMatchObject({ fromBar: 4, toBar: 4 });
  });

  it.each([
    ["past the end", { from: 9 }],
    ["backwards", { from: 4, to: 2 }],
  ])("%s is not found", (_, args) => {
    const out = result(runCoachTool({ tool: "show_bars", args }, fakeHost(), onSong));
    expect(out.ok === false && out.why).toBe("notFound");
  });

  it("no song on screen: not here", () => {
    const out = result(runCoachTool({ tool: "show_bars", args: { from: 1 } }, fakeHost(), toolCtx()));
    expect(out.ok === false && out.why).toBe("notNow");
  });

  it("takes no score id: the song is the one on screen", () => {
    const out = result(runCoachTool({ tool: "show_bars", args: { from: 1, score: "song-2" } }, fakeHost(), onSong));
    expect(out.ok === false && out.why).toBe("refused");
  });
});

describe("explain_screen", () => {
  it("says it is not wired yet, rather than nothing", () => {
    const host = fakeHost();
    const out = result(runCoachTool({ tool: "explain_screen", args: {} }, host, toolCtx()));
    expect(out).toMatchObject({ ok: false, why: "notWiredYet", line: { key: "coachTools.why.notWiredYet", values: { tool: "explain_screen" } } });
    expect(host.changes()).toEqual([]);
  });
});
