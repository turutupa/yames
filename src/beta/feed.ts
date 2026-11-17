/**
 * The test channel's feed, as the app reads it.
 *
 * Everything here is reached only from behind `IS_BETA` (src/platform.ts), so
 * a stable build carries none of it — not even the address below, which is
 * what `scripts/check-mobile-bundle.mjs` looks for.
 *
 * The desktop betas need nothing from this file to find their update: their
 * `tauri-plugin-updater` endpoint was already pointed at the beta feed at
 * build time. What is shared is the rule for when to SAY so.
 */

/** `android-beta.json` on the rolling `beta` pre-release (.github/workflows/beta.yml). */
export const ANDROID_BETA_FEED_URL =
  "https://github.com/turutupa/yames/releases/download/beta/android-beta.json";

/** Once a day, for the check (Android) and for the prompt (both). */
export const BETA_EVERY_MS = 24 * 60 * 60 * 1000;

/** Settings-store keys. */
export const BETA_CHECKED_AT_KEY = "betaUpdate.checkedAt";
export const BETA_FEED_KEY = "betaUpdate.feed";
export const BETA_PROMPTED_AT_KEY = "betaUpdate.promptedAt";

/**
 * Is a day up since `at`? Anything that is not a number we wrote means
 * "never"; a clock that went backwards means "now" rather than "not until the
 * date catches up".
 */
export function dayIsUp(at: unknown, now: number): boolean {
  if (typeof at !== "number" || !Number.isFinite(at)) return true;
  if (at > now) return true;
  return now - at >= BETA_EVERY_MS;
}

/**
 * The versionCode an `X.Y.Z-beta.N` build carries — the formula in
 * `gen/android/app/build.gradle.kts` and `scripts/beta-feed.mjs`: the stable
 * code of X.Y.Z (major*10000 + minor*100 + patch), times 10000, plus N.
 * `null` for anything that is not a beta version.
 */
export function betaVersionCode(version: string): number | null {
  const m = /^(\d+)\.(\d+)\.(\d+)-beta\.(\d+)$/.exec(version.trim());
  if (!m) return null;
  const [major, minor, patch, n] = m.slice(1).map(Number);
  if (minor >= 100 || patch >= 100 || n < 1 || n > 9999) return null;
  return (major * 10000 + minor * 100 + patch) * 10000 + n;
}

/** What the app keeps of `android-beta.json` between checks. */
export interface AndroidBetaFeed {
  version: string;
  versionCode: number;
  url: string;
  sha256: string;
  size: number;
  notes: string;
}

/** A feed worth offering: well-formed, and newer than what is running. */
export function offerable(feed: unknown, installedVersionCode: number | null): feed is AndroidBetaFeed {
  if (!feed || typeof feed !== "object") return false;
  const f = feed as Partial<AndroidBetaFeed>;
  if (typeof f.version !== "string" || typeof f.url !== "string") return false;
  if (typeof f.versionCode !== "number" || !Number.isInteger(f.versionCode)) return false;
  if (typeof f.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(f.sha256)) return false;
  if (!f.url.startsWith("https://")) return false;
  if (installedVersionCode === null) return false;
  return f.versionCode > installedVersionCode;
}
