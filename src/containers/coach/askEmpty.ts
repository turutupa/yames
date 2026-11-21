/**
 * Which words Ask's empty state and its "nothing answered that" reply use
 * (leg c2cc; review of c2cb, M2, M3, L10). Each says only what can answer
 * where the player is:
 *
 * - typed English reaches the tuning line, the fact cards, the help set and
 *   search (`askAnswerers.ts`); typed text in any other language reaches
 *   search alone, and the chips reach the cards and the help set in every
 *   language;
 * - a model answers only on a computer, only once it is ready, and never on a
 *   build compiled without one (the selector says "this build can't run a
 *   model" there), so only a build that can run one is offered one.
 *
 * Pure: no React, no store, no i18n.
 */
import type { CoachModelState } from "../../hooks/coachLoader";

export type AskWhere = {
  mobile: boolean;
  model: CoachModelState;
  /** The app's language is English: the typed matchers run (`isEnglish`). */
  english: boolean;
  /** False only when this build is known to have no model in it (a selector row says `noLlm`). */
  canRunModel: boolean;
};

function loading(model: CoachModelState): boolean {
  return model === "loading" || model === "waiting";
}

/** The empty state's sentence under "Ask". */
export function askEmptyKey(w: AskWhere): string {
  const model = !w.mobile && w.canRunModel ? w.model : "off";
  if (w.english) {
    if (w.mobile) return "help.ui.empty.phone";
    if (model === "ready") return "ask.empty.model";
    if (loading(model)) return "ask.empty.loading";
    return "help.ui.empty.local";
  }
  if (model === "ready") return "help.ui.empty.searchModel";
  if (loading(model)) return "help.ui.empty.searchLoading";
  return "help.ui.empty.search";
}

/** The plain statement when nothing before the model answered and no model is ready. */
export function askNothingKey(w: AskWhere): string {
  if (!w.mobile && w.canRunModel && loading(w.model)) return "ask.reply.gettingReady";
  const offer = !w.mobile && w.canRunModel;
  if (w.english) return offer ? "help.ui.reply.local" : "help.ui.reply.phone";
  return offer ? "help.ui.reply.searchLocal" : "help.ui.reply.search";
}
