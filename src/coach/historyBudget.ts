/**
 * The history a tools session starts from, read within a budget.
 *
 * Kept from the old greeting (`greeting.ts`, removed in leg c2a2 with the
 * greeting itself): the session reads the last thirty sessions and this
 * preset's own when Listen turns on, for the chips' "compared with last
 * time", the stamina and pace tips and the narrative's first line. A store
 * that is slow to answer must not hold the session's start up.
 */
import type { SavedSession } from "../types";

/** How long a start waits for the history before going on without it. */
export const HISTORY_LOAD_TIMEOUT_MS = 500;

/**
 * Race a session-history loader against a timeout. If the loader wins,
 * returns the loaded array; if the timeout wins, `undefined`. The loader is
 * not cancelled.
 */
export async function loadHistoryWithBudget(
  loader: () => Promise<SavedSession[]>,
  budgetMs: number = HISTORY_LOAD_TIMEOUT_MS,
): Promise<SavedSession[] | undefined> {
  const load = loader();
  const timeout = new Promise<undefined>((resolve) =>
    setTimeout(() => resolve(undefined), budgetMs),
  );
  const result = await Promise.race([load, timeout]);
  return result as SavedSession[] | undefined;
}
