/**
 * A source line, pressed (leg c2b2b; DESIGN 3.6: "Tapping it opens what it
 * cites"). Every label opens something, and nothing opened here acts:
 *
 * - "Measured · Take N": that Take's review, as its result note said it, as a
 *   turn in Ask. Only the Take the card read (`CardBody.cites`), never another
 *   Exercise's Take of the same number; a Take whose note is no longer kept
 *   says so in one line.
 * - "From the Path · Step N": outside a Session, the Step's page through
 *   `open_step` (its receipt and its way back, as a chip's call). In a
 *   Session nothing navigates away from it: the Step's own words are quoted in
 *   Ask instead.
 * - "Worked out by the app", "General advice", and a label with no Take or
 *   Step: one line that says what the label means. No navigation.
 *
 * Nothing here can run during a Take: Ask is not mounted then.
 */
import { findingFor, type NotedFinding } from "../../coach/coachSlot";
import type { CoachContext } from "../../coach/context";
import type { BlockSource } from "../../coach/blocks/resolve";
import { inSession, type ToolCall } from "../../coach/tools/types";
import type { Line } from "../../coach/tools/types";
import type { PathDoc } from "../../paths/format";
import type { TakeOutcome } from "../../session/runner";
import { writeCard, type CardBody } from "./askCards";
import { askToolContext, askToolHost, runAskCall } from "./askTools";

/** What a press on a source line opens: a tool's call through the runner, or a turn in Ask. */
export type SourceAnswer = { kind: "call"; call: ToolCall } | { kind: "turn"; body: CardBody };

/** What the answer reads, at the press. */
export type SourceWorld = {
  ctx: CoachContext | null;
  paths: readonly PathDoc[];
  /** A Session is open, as the tools' host says it (`sessionActive`). */
  sessionActive: boolean;
  /** What the result note drew for a Take (`coachSlot.findingFor`). */
  finding: (outcome: TakeOutcome) => NotedFinding | null;
};

function line(key: string, values: Record<string, string | number> = {}): Line {
  return { key, values };
}

const APP: BlockSource = { kind: "app" };

/** One line that says what a label means. */
function about(kind: BlockSource["kind"]): SourceAnswer {
  return { kind: "turn", body: { shape: null, line: line(`ask.source.${kind}`), source: APP } };
}

/** The Take a measured line cites: the one its card read, else the last Take when it is Take N. */
function citedTake(take: number, world: SourceWorld, cites: TakeOutcome | undefined): TakeOutcome | null {
  if (cites) return cites.takeNumber === take ? cites : null;
  const last = world.ctx?.lastTake;
  return last && last.takeNumber === take ? last : null;
}

function takeReview(take: number, world: SourceWorld, cites: TakeOutcome | undefined): SourceAnswer {
  const outcome = citedTake(take, world, cites);
  const noted = outcome ? world.finding(outcome) : null;
  if (!noted) return { kind: "turn", body: { shape: null, line: line("ask.source.takeGone", { take }), source: APP } };
  const text = noted.history ? `${noted.text} ${noted.history}` : noted.text;
  return { kind: "turn", body: { shape: null, line: line("ask.source.take", { take, text }), source: { kind: "measured", take } } };
}

/** The Path a Step line is on: the one it names, else the one on screen. */
function pathOf(source: BlockSource & { kind: "path" }, world: SourceWorld): PathDoc | null {
  const id = source.pathId ?? world.ctx?.path?.id ?? null;
  return id ? (world.paths.find((p) => p.id === id) ?? null) : null;
}

/** In a Session: the Step's own words, quoted, as a turn in Ask. */
function stepQuoted(step: number, source: BlockSource & { kind: "path" }, world: SourceWorld): SourceAnswer {
  const doc = pathOf(source, world);
  const onScreen = world.ctx?.step;
  const found = doc?.steps.find((s) => s.order === step) ?? (!source.pathId && onScreen?.order === step ? onScreen : null);
  if (!found) return { kind: "turn", body: { shape: null, line: line("ask.source.stepGone", { step }), source: APP } };
  // The Step's goal and its why, each as the Path wrote it; a field left empty is not quoted.
  const quotes = [found.goal, found.why]
    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    .map((text) => line("ask.card.path.quote", { text }));
  const cited: BlockSource = source.pathId ? { kind: "path", step, pathId: source.pathId } : { kind: "path", step };
  return {
    kind: "turn",
    body: { shape: null, line: line("ask.source.step", { step, title: found.title }), more: quotes, source: cited },
  };
}

/** Outside a Session: the Step's page, through `open_step` (its receipt and its way back). */
function stepOpened(step: number, source: BlockSource & { kind: "path" }, world: SourceWorld): SourceAnswer {
  const doc = pathOf(source, world);
  return { kind: "call", call: { tool: "open_step", args: doc ? { path: doc.title, step } : { step } } };
}

/** What a press on `source` opens, where the player is now. Pure. */
export function sourceAnswer(source: BlockSource, world: SourceWorld, cites?: TakeOutcome): SourceAnswer {
  switch (source.kind) {
    case "measured":
      return source.take === undefined ? about("measured") : takeReview(source.take, world, cites);
    case "path": {
      if (source.step === undefined) return about("path");
      // No context to tell: treated as a Session (nothing navigates).
      const session = world.sessionActive || !world.ctx || inSession(world.ctx);
      return session ? stepQuoted(source.step, source, world) : stepOpened(source.step, source, world);
    }
    case "app":
      return about("app");
    case "general":
      return about("general");
  }
}

/**
 * The press: the label as the player's turn, then what it opens. `cites` is
 * the Take the card read, when it read one. Returns the new turn's id.
 */
export function pressSource(source: BlockSource, words: string, cites?: TakeOutcome): string {
  const host = askToolHost();
  const world: SourceWorld = {
    ctx: askToolContext(),
    paths: host?.paths() ?? [],
    sessionActive: host?.sessionActive() ?? false,
    finding: (outcome) => findingFor(outcome),
  };
  const answer = sourceAnswer(source, world, cites);
  return answer.kind === "call" ? runAskCall(answer.call, words) : writeCard(answer.body, words);
}
