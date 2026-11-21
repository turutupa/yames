/**
 * What `scripts/coach-train.mjs` bundles (esbuild, as `coach-eval.mjs` bundles
 * `evalEntry.ts`). Pure re-exports; the script does the files.
 */
export { localizePack, readOverlay } from "../../paths/strings";
export { PATH_SCHEMA_VERSION } from "../../paths/format";
export { COACH_TOOLS } from "../tools/registry";
export { checkCall } from "../tools/run";
export { EVAL_LANGUAGES, parseSetFile } from "../ask/evalWorld";
export { languageData, generateLanguage, splitValidation, countRecords, DEFAULT_MIX, CARD_MIX } from "./generate";
export { LeakGuard } from "./leakage";
export { renderRecord } from "./render";
export { gbnfToRegExp } from "./gbnf";
