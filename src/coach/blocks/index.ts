/**
 * The coach's blocks, as the rest of the app sees them (COACH_UX D3).
 *
 * Three doors, and they are meant to be used in this order:
 *
 *   1. `resolveCoachAnswer(json, context)` — whatever came back from a model,
 *      or whatever the rules emitted, turned into blocks that can be drawn
 *      plus a list of what was dropped and why.
 *   2. `<CoachBlocks blocks={...} onAction={...} />` — the drawing.
 *   3. `useCoachAction(host)` — the button, wired to what the app does.
 *
 * `coach-answer.schema.json` and `coach-answer.gbnf` sit beside this file for
 * whoever is holding a model to the catalogue. Both are generated from
 * `spec.ts`; do not edit them.
 */

export { CoachBlocks, default as CoachBlocksView } from "./CoachBlocks";
export type { CoachBlocksProps } from "./CoachBlocks";

export { resolveCoachAnswer, checkBlockShape } from "./resolve";
export type {
  ActionLabel,
  AttemptRef,
  CoachBlockContext,
  DroppedBlock,
  DropReason,
  NamedRef,
  ProgressPoint,
  ResolvedAnswer,
  ResolvedBlock,
  ScoreRef,
} from "./resolve";

export { runCoachAction, useCoachAction } from "./actions";
export type { CoachActionHost, CoachActionOutcome } from "./actions";

export { PLACEHOLDER_SLOTS } from "./slots";
export type {
  CoachBlockSlots,
  CompareSlotProps,
  TabExcerptSlotProps,
  TakeSlotProps,
} from "./slots";

export type {
  BlockInstrument,
  CoachAction,
  CoachAnswer,
  CoachBlock,
  CoachBlockType,
  ComeBackWhen,
  NeckPosition,
  NeckSubject,
} from "./types";

export { CATALOGUE } from "./spec";
export { buildGbnf, buildJsonSchema, jsonSchemaText } from "./schema";
