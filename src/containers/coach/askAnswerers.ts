/**
 * The rule-made answerers Ask's text box tries after the command router and
 * before the model (DESIGN 5.3; leg c2cb), plugged as one into t1b2b's slot
 * (`setAskNextAnswerer`) while the panel is mounted. In order:
 *
 * 1. **tuning** (English): a question about tuning gets one plain sentence,
 *    that the app has no tuner and did not check it (the owner's decision 9),
 *    so no card, help entry or Path passage that mentions tuning answers it;
 * 2. **cards** (English): c2b1b's `typedCardAnswerer`;
 * 3. **help** (English): an entry of the help set (`helpMatch.ts`);
 * 4. **search** (every language): the nearest passage of the player's Paths
 *    (`answerSearchFor`, c2ca), quoted byte for byte with its Step.
 *
 * Each is synchronous and writes its own turns (the player's first) before it
 * returns, as the slot requires; none writes anything when it does not answer.
 * A command never reaches them (the router answered it first). Nothing here
 * runs during a Take: Ask is not mounted then.
 */
import type { FactCard } from "../../coach/ask/cards";
import { helpCard, helpKey, TUNING_KEY } from "../../coach/ask/help";
import { asksAboutTuning, matchHelp } from "../../coach/ask/helpMatch";
import { answerSearchFor, type SearchAnswer } from "../../coach/ask/search";
import type { CoachContext } from "../../coach/context";
import type { PathDoc } from "../../paths/format";
import { variantIndexOf } from "../../session/take";
import { line } from "../../coach/tools/types";
import { typedCardAnswerer } from "./askCards";
import { appendAskTurn, askTurnId } from "./askStore";
import { askToolContext, askToolHost } from "./askTools";

/** Which engine answered a typed sentence (for the table test and the log). */
export type TypedEngine = "tuning" | "card" | "help" | "search";

export function isEnglish(language: string): boolean {
  return language === "en" || language.startsWith("en-");
}

function write(said: string, card: FactCard): void {
  if (said.trim()) appendAskTurn({ id: askTurnId(), kind: "user", text: said.trim() });
  appendAskTurn({ id: askTurnId(), kind: "card", card });
}

/** 1. A question about tuning (English): the one sentence, and nothing else answers it. */
export function answerTuning(text: string, language: string): boolean {
  if (!isEnglish(language) || !asksAboutTuning(text)) return false;
  write(text, { ...helpCard(line(TUNING_KEY)), uncertain: true });
  return true;
}

/** 3. A help entry (English), when the question names exactly one. */
export function answerHelp(text: string, language: string): boolean {
  if (!isEnglish(language)) return false;
  const id = matchHelp(text);
  if (!id) return false;
  write(text, helpCard(line(helpKey(id))));
  return true;
}

/** The variant played on screen, where there is one: search quotes its own words. */
function playedOf(ctx: CoachContext | null): { exerciseId: string; variantId: string } | null {
  const exercise = ctx?.exercise;
  if (!exercise) return null;
  const at = variantIndexOf(exercise, ctx?.variantSeed);
  const variant = at === null ? undefined : exercise.variation?.variants?.[at];
  return variant ? { exerciseId: exercise.id, variantId: variant.id } : null;
}

/** The search answer as Ask's card: where it is, then the passage, labelled "From the Path · Step N". */
export function searchCard(found: SearchAnswer, paths: readonly PathDoc[]): FactCard {
  const path = paths.find((p) => p.id === found.hit.pathId);
  const step = path?.steps.find((s) => s.id === found.hit.stepId);
  const intro = path && step ? [line("help.search.from", { step: step.title, path: path.title })] : [];
  return { shape: "search", lines: [...intro, line("ask.card.path.quote", { text: found.hit.text })], source: found.source };
}

/** 4. Search of the player's Paths, in the player's language. */
export function answerSearch(text: string, language: string): boolean {
  const host = askToolHost();
  if (!host) return false;
  let paths: readonly PathDoc[];
  try {
    paths = host.paths();
  } catch {
    return false;
  }
  const ctx = askToolContext();
  const found = answerSearchFor(text, { language, paths, progress: ctx?.progress ?? null, played: playedOf(ctx) });
  if (!found) return false;
  write(text, searchCard(found, paths));
  return true;
}

/** The engines, in order. Each answers (true, its turns written) or passes. */
function engines(language: () => string): ReadonlyArray<[TypedEngine, (text: string) => boolean]> {
  const cards = typedCardAnswerer(language);
  return [
    ["tuning", (text) => answerTuning(text, language())],
    ["card", cards],
    ["help", (text) => answerHelp(text, language())],
    ["search", (text) => answerSearch(text, language())],
  ];
}

/** Which engine answered `text`, having written its turns; null when none did (the model or the plain statement is next). */
export function answerByRules(text: string, language: () => string): TypedEngine | null {
  for (const [name, answer] of engines(language)) {
    if (answer(text)) return name;
  }
  return null;
}

/** The chain as t1b2b's slot takes it (`setAskNextAnswerer`): synchronous, true when one answered. */
export function typedRuleAnswerer(language: () => string): (text: string) => boolean {
  return (text) => answerByRules(text, language) !== null;
}
