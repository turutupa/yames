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

/** Every tool, in the order a "what can you do" list would show them. */
export const COACH_TOOLS: readonly CoachTool[] = [...GO_TOOLS, ...READ_TOOLS, ...PRACTICE_TOOLS];

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
