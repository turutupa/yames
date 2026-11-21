/**
 * The coach's tools: the list (DESIGN 13, TOOLS 2.1 and 2.2).
 *
 * One list serves a chip, a typed command and (later) a model. Each entry is
 * plain data (`ToolSpec`: name, kind, audience, arguments, a note) with its
 * functions beside it (`when`, and `run` or `propose` / `commit`); the shapes
 * are in `types.ts` and re-exported here.
 *
 * A tool is added by adding an entry, never by changing a shape: leg t1a2's
 * `confirm` tools go into `COACH_TOOLS` below, written with
 * `defineConfirmTool`, against the host `host.ts` already declares.
 *
 * What is NOT here is as much the point as what is: the never-list
 * (microphone and input, devices, grading consent, recording, deleting,
 * unfollowing, downloading, any grade, anything that leaves the device,
 * anything during a Take) is not a tool, so nothing can call it.
 * `registry.test.ts` proves it.
 */

import { GO_TOOLS } from "./go";
import { PRACTICE_TOOLS } from "./practice";
import { READ_TOOLS } from "./read";
import { TODAY_TOOLS } from "./today";
import { PLAY_TOOLS } from "./play";
import { SETTINGS_TOOLS } from "./settings";
import type { CoachTool, ToolCatalogue, ToolSpec } from "./types";

export type * from "./types";
export {
  argNumber,
  argString,
  defineConfirmTool,
  inSession,
  line,
  notWiredYet,
  refuse,
  takeRunning,
} from "./types";

/**
 * The tools a suggestion chip's own press may run at once (leg chip1; the
 * owner's decision: "one press of the chip IS the press for reversible
 * one-step changes, always with Undo; anything multi-step or not undoable
 * still goes through a proposal"). Each with why it qualifies. Every one is a
 * `confirm` tool that changes exactly one value through that control's own
 * setter, whose undo puts back exactly what was there (guarded by `at`: only
 * from the value it left), which starts and stops no sound and does not
 * navigate, and whose proposal is one line "X → Y" with nothing else to
 * preview. `chipPress.test.ts` walks this table and fails for any entry that
 * is not so. Not here, on purpose: `set_setting` (leg chip1b, review L3: no
 * chip offers it, and `language` is not exactly undoable: the system's
 * language, never chosen, comes back as an explicit choice, and its setter
 * is async), `start_today`, `play_exercise`,
 * `find_edge`, `test_out` (sound starts; the screen changes), `swap_part`,
 * `set_minutes`, `set_focus` (the plan as it would be is a preview),
 * `follow_path` (no undo), `load_jam`, `load_preset` (the unsaved-work
 * question; the click may stop), `set_goal` (no undo from no goal),
 * `restore_part` (the app's own), `loop_bars`, `make_exercise` (not yet).
 */
export const CHIP_PRESS: Readonly<Record<string, string>> = {
  set_tempo:
    "One tempo, one step (a rung in a Session, between Takes only). Undo puts the tempo back, only from the tempo it left. Changing the tempo starts and stops nothing.",
  click_subdivision:
    "The click's subdivision, one value, outside a Session. Undo puts it back, only from the value it left. The click plays on or stays stopped as it was.",
};

function flagged(tools: readonly CoachTool[]): CoachTool[] {
  return tools.map((tool) => (Object.prototype.hasOwnProperty.call(CHIP_PRESS, tool.name) ? { ...tool, chipPress: true as const } : tool));
}

/** Every tool, in the order a "what can you do" list would show them. */
export const COACH_TOOLS: readonly CoachTool[] = flagged([
  ...GO_TOOLS,
  ...READ_TOOLS,
  ...PRACTICE_TOOLS,
  ...TODAY_TOOLS,
  ...PLAY_TOOLS,
  ...SETTINGS_TOOLS,
]);

/** The catalogue's version: bumped when a change is not backwards compatible. */
export const TOOL_CATALOGUE_VERSION = 1;

/**
 * The generator's input: every tool a player (a chip, a command, a model) may
 * call, as plain data. The app's own tools (`audience: "app"`, the undo) are
 * left out, so no grammar built from this can emit them.
 */
export function toolCatalogue(registry: readonly CoachTool[] = COACH_TOOLS): ToolCatalogue {
  const tools: ToolSpec[] = registry
    .filter((tool) => tool.audience === "player")
    .map(({ name, kind, audience, args, note }) => ({ name, kind, audience, args, note }));
  return { version: TOOL_CATALOGUE_VERSION, tools };
}

export function findTool(name: string, registry: readonly CoachTool[] = COACH_TOOLS): CoachTool | undefined {
  return registry.find((tool) => tool.name === name);
}
