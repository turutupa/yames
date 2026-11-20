/**
 * The `read` tools: reading, not acting.
 *
 * TOOLS 2.2: `show_scale`, `show_chord`, `show_bars` draw the blocks the coach
 * already has (`fretboard`, `chordShape`, `tabExcerpt`), resolved by
 * `blocks/resolve.ts` against the app's own theory tables and the song on
 * screen; what does not resolve is `notFound`, never a guess. `explain_screen`
 * waits on the help set (DESIGN C2c) and says so. The fact cards of the next
 * legs join this list as more `read` tools.
 */

import { playedBarOfPrinted } from "../../songs/selection";
import { resolveCoachAnswer, type CoachBlockContext, type ScoreRef } from "../blocks/resolve";
import { MAX_BAR, MAX_SHAPE_INDEX, NECK_POSITIONS, ROOT_NAMES, SCALE_NAMES } from "../blocks/spec";
import type { CoachBlock, NeckPosition } from "../blocks/types";
import type { ScaleId } from "../../jam/scales";
import {
  argNumber,
  argString,
  line,
  notWiredYet,
  refuse,
  takeRunning,
  type ActTool,
  type Line,
  type ToolResult,
} from "./types";

/** One block, resolved, as a result: drawn, or `notFound` with the resolver's reason for the log. */
function show(block: CoachBlock, receipt: Line, context: CoachBlockContext = {}): ToolResult {
  const { blocks, dropped } = resolveCoachAnswer({ blocks: [block] }, context);
  if (blocks.length === 1) return { ok: true, receipt, blocks };
  return refuse("notFound", "coachTools.why.notFound.drawing", {}, { detail: dropped[0]?.reason ?? "dropped" });
}

const notDuringTake: ActTool["when"] = (ctx) => !takeRunning(ctx);

const showScale: ActTool = {
  name: "show_scale",
  kind: "read",
  audience: "player",
  note: "Draw a scale on the player's neck.",
  args: [
    { name: "root", type: { kind: "enum", values: ROOT_NAMES }, note: "The root, as a musician writes it." },
    { name: "scale", type: { kind: "enum", values: SCALE_NAMES }, note: "The scale." },
    { name: "position", type: { kind: "enum", values: NECK_POSITIONS }, optional: true, note: "Where on the neck." },
  ],
  when: notDuringTake,
  run(args, host) {
    const root = argString(args, "root") ?? "";
    const scale = argString(args, "scale") as ScaleId;
    const position = argString(args, "position") as NeckPosition | undefined;
    return show(
      { type: "fretboard", show: { of: "scale", root, scale }, instrument: host.instrument(), ...(position ? { position } : {}) },
      line("coachTools.receipt.showScale", { root, scale }),
    );
  },
};

const showChord: ActTool = {
  name: "show_chord",
  kind: "read",
  audience: "player",
  note: "Draw a chord's grip.",
  args: [
    { name: "chord", type: { kind: "chordName" }, note: "The chord, as the app writes it (\"Am7\")." },
    {
      name: "shape",
      type: { kind: "integer", min: 1, max: MAX_SHAPE_INDEX + 1 },
      optional: true,
      note: "Which of its shapes, counted from 1. Left out: the first.",
    },
  ],
  when: notDuringTake,
  run(args, host) {
    const chord = argString(args, "chord") ?? "";
    const shape = (argNumber(args, "shape") ?? 1) - 1;
    return show(
      { type: "chordShape", chord, shape, instrument: host.instrument() },
      line("coachTools.receipt.showChord", { chord, shape: shape + 1 }),
    );
  },
};

const showBars: ActTool = {
  name: "show_bars",
  kind: "read",
  audience: "player",
  note: "Show bars of the song on screen, numbered as the page prints them.",
  args: [
    { name: "from", type: { kind: "integer", min: 1, max: MAX_BAR }, note: "The first bar, as printed." },
    { name: "to", type: { kind: "integer", min: 1, max: MAX_BAR }, optional: true, note: "The last bar, as printed. Left out: one bar." },
  ],
  // The song on screen is the only score it can name: no id comes from outside.
  when: (ctx) => !takeRunning(ctx) && ctx.song !== undefined,
  run(args, _host, ctx) {
    const song = ctx.song?.song;
    if (!song) return refuse("notNow", "coachTools.why.notNow.noSong");
    const from = argNumber(args, "from") ?? 1;
    const to = argNumber(args, "to") ?? from;
    // Printed numbers to played bars (`playedBarOfPrinted`, both from 0).
    const first = playedBarOfPrinted(song.score, from - 1);
    const last = playedBarOfPrinted(song.score, to - 1);
    if (first === null || last === null || last < first) {
      return refuse("notFound", "coachTools.why.notFound.bars", { from, to, song: song.name });
    }
    const score: ScoreRef = {
      id: song.id,
      title: song.name,
      bars: song.score.bars.length,
      printedBars: song.score.bars.map((bar) => bar.printedBar + 1),
    };
    return show(
      { type: "tabExcerpt", score: song.id, fromBar: first + 1, toBar: last + 1 },
      line("coachTools.receipt.showBars", { song: song.name, from, to }),
      { scores: [score] },
    );
  },
};

const explainScreen: ActTool = {
  name: "explain_screen",
  kind: "read",
  audience: "player",
  note: "Say what this screen is for (the help set, DESIGN C2c).",
  args: [],
  when: notDuringTake,
  run: () => notWiredYet("explain_screen"),
};

export const READ_TOOLS: readonly ActTool[] = [showScale, showChord, showBars, explainScreen];
