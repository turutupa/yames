/** Progressive first-time hints (O7). See `types.ts` for the store contract. */
export { HintCard } from "./HintCard";
export { useFirstTimeHint, useHintSession } from "./useFirstTimeHint";
export { useAppHints, type ActiveAppHint } from "./useAppHints";
export { markWidgetOpened, resetHints } from "./hintRuntime";
export { shouldHintCoachAsk, shouldHintZenFirst } from "./triggers";
export { HINT_IDS, type HintId } from "./types";
