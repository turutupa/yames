/**
 * "What's new" — the rules, with no React and no store in sight, so the
 * "exactly once per version" promise is a unit test rather than a hope.
 *
 * Store keys (onboarding README + ONBOARDING_PLAN §6):
 *   whatsNew.seenVersion   string  app version whose notes were shown
 *   whatsNew.pendingNotes  {version, notes}  the release body captured by the
 *                          update check *before* the user installed it — see
 *                          the note on `PendingNotes` below.
 */

export const WHATS_NEW_SEEN_KEY = "whatsNew.seenVersion";
export const WHATS_NEW_NOTES_KEY = "whatsNew.pendingNotes";

/**
 * Why the notes are cached rather than fetched on launch:
 *
 * the updater endpoint (`latest.json`) only tells us about a version *newer*
 * than the running one — `check()` returns null once you are on the latest
 * build, which is exactly the moment the release notes become interesting. So
 * `useAppUpdates` stows the body it saw during the pre-update check, and this
 * module hands it back when the app comes up as that version.
 *
 * Users who upgrade outside the in-app updater (winget, brew, a downloaded
 * installer) have no cached body. They still get the modal — with the
 * fallback copy and a link to the release page — because "something changed,
 * here is where to read about it" is the point.
 */
export type PendingNotes = {
  version: string;
  notes: string;
};

export type WhatsNewDecision =
  /** Put the modal on screen. */
  | "show"
  /** Stamp `seenVersion` without showing anything (a brand-new install). */
  | "record"
  /** Nothing to do — already seen, or the version is not known yet. */
  | "skip";

export type WhatsNewInput = {
  /** The running version. `useAppUpdates` reports "0.0.0" until Tauri answers. */
  appVersion: string;
  /** `whatsNew.seenVersion`, undefined when the key has never been written. */
  seenVersion: string | undefined;
  /**
   * True on a genuine first launch (O1 case 1: no instrument, no
   * `onboarding.version`). Those users are meeting the app for the first
   * time — a changelog for a release they have never run is noise, so the
   * version is recorded silently and they see the modal on the *next* upgrade.
   */
  firstRun: boolean;
};

export function decideWhatsNew({
  appVersion,
  seenVersion,
  firstRun,
}: WhatsNewInput): WhatsNewDecision {
  // "0.0.0" is useAppUpdates' placeholder; acting on it would burn the
  // one-shot on a version that does not exist.
  if (!appVersion || appVersion === "0.0.0") return "skip";
  if (seenVersion === appVersion) return "skip";
  if (seenVersion === undefined && firstRun) return "record";
  // Everything else is an upgrade — including the existing user who is
  // launching this build for the first time and has no `seenVersion` at all.
  return "show";
}

/**
 * The body to render, or null when the cached notes belong to another version
 * (an install that was never completed, or a downgrade).
 */
export function notesForVersion(
  pending: PendingNotes | undefined,
  appVersion: string,
): string | null {
  if (!pending || pending.version !== appVersion) return null;
  const trimmed = pending.notes?.trim();
  return trimmed ? trimmed : null;
}
