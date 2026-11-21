/**
 * What `scripts/coach-eval.mjs` bundles (esbuild, as `scripts/paths.mjs`
 * bundles the Paths pipeline). Pure re-exports; the script does the files.
 */
export { localizePack, readOverlay } from "../../paths/strings";
export { PATH_SCHEMA_VERSION } from "../../paths/format";
export { COACH_TOOLS, toolCatalogue } from "../tools/registry";
export { EVAL_CARDS, CARD_IDS } from "./evalCards";
export { choiceGrammar, parseChoice } from "./grammar";
export { choicePrefix, choiceContext } from "./choicePrompt";
export { EVAL_LANGUAGES, parseSetFile, judgeExpected, WORLD_FOLLOWED, WORLD_JAMS, WORLD_PRESETS } from "./evalWorld";
export { rulesAnswer, askRequestFor, modelAnswer, scoreItem, summarize, summaryMarkdown, choiceFactsFor } from "./evalRun";
