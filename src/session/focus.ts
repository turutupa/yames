/**
 * Which Paths Today plans from (owner, 2026-11-18): "I only have 20 minutes and
 * I only want to focus on the pentatonics path".
 *
 * Two settings, both in the settings store:
 *
 * - The daily mix (`session.offMix`): subscribing to a Path and putting it in
 *   the everyday mix are separate. Stored as the Paths switched OUT of the mix,
 *   so a new subscription is in it and every subscription from before this
 *   setting existed is in it too, with nothing to migrate.
 * - Today's focus (`session.todayFocus`): "mix", the planner across every Path
 *   in the mix as it always was, or one subscribed Path's id, which plans from
 *   that Path alone, in the mix or not. Kept until the player changes it; a
 *   Path no longer subscribed falls back to the mix.
 *
 * Plain deterministic code. The planner is not told about either: it is given
 * the Paths, so with every Path in the mix and the focus on the mix it gets the
 * same input it always did.
 */
import type { PathDoc } from "../paths/format";

export const FOCUS_KEY = "session.todayFocus";
export const OFF_MIX_KEY = "session.offMix";

/** The daily mix: every subscribed Path in it, the way Today always planned. */
export const MIX = "mix";
/** "mix", or the id of one subscribed Path. */
export type TodayFocus = string;

/** A stored focus, checked. "all" was the first name of the mix. */
export function readFocus(raw: unknown): TodayFocus {
  if (typeof raw !== "string" || raw.length === 0 || raw === "all") return MIX;
  return raw;
}

/** The Paths switched out of the mix, checked. Nothing stored: every Path is in. */
export function readOffMix(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

/** The subscribed Paths in the daily mix, in the player's order. */
export function mixPaths(mine: readonly PathDoc[], offMix: readonly string[]): PathDoc[] {
  const off = new Set(offMix);
  return mine.filter((p) => !off.has(p.id));
}

export type TodayPaths = {
  /** The focus in force: the stored one, or the mix when its Path is not subscribed. */
  focus: TodayFocus;
  /** What the planner is given. */
  paths: PathDoc[];
  /** The one Path chosen for today, when the focus is one. */
  focusedPath: PathDoc | null;
  /** Subscribed to something, but nothing is in the mix and no Path is chosen. */
  emptyMix: boolean;
};

/** What Today plans from, for the player's subscribed Paths, the mix and the focus. */
export function todayPaths(
  mine: readonly PathDoc[],
  offMix: readonly string[],
  focus: TodayFocus,
): TodayPaths {
  const chosen = focus === MIX ? null : (mine.find((p) => p.id === focus) ?? null);
  if (chosen) return { focus: chosen.id, paths: [chosen], focusedPath: chosen, emptyMix: false };
  const paths = mixPaths(mine, offMix);
  return { focus: MIX, paths, focusedPath: null, emptyMix: mine.length > 0 && paths.length === 0 };
}

/** The picker on Today: shown with two subscribed Paths or more, or when the mix is empty. */
export function showsFocusPicker(mine: readonly PathDoc[], offMix: readonly string[]): boolean {
  return mine.length >= 2 || (mine.length > 0 && mixPaths(mine, offMix).length === 0);
}
