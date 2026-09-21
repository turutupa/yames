/**
 * "There is a newer one" — for the phone app people download from the site.
 *
 * A store keeps its own apps current. An app someone installed from
 * yames.app has nothing that does, and the desktop's updater is no use here:
 * a phone cannot replace its own package, and `tauri-plugin-updater` is not
 * built for one. So this is the smallest honest thing instead — ask once a
 * day what the newest release is called, and if it is newer than what is
 * running, say so once, quietly, in About.
 *
 * What it sends: nothing. One anonymous GET for a public page, no headers
 * that name anybody, no body, no cookies, no identifier of any kind, and the
 * answer is thrown away except for a version number. Offline it fails and the
 * app never mentions it.
 *
 * Nothing in this file is reachable from a store build or from a desktop one:
 * every call site is behind `SAYS_WHEN_NEWER`, a build-time constant, so
 * Rollup drops the module and neither address below reaches `dist/`.
 */

/** The newest published release, as a public page anyone can read. */
export const LATEST_RELEASE_URL =
  "https://api.github.com/repos/turutupa/yames/releases/latest";

/** Where "Get it" goes, in the phone's own browser. */
export const DOWNLOAD_PAGE_URL = "https://yames.app/#download";

/** Once a day. Not an interval — see `useNewerVersion`; nothing runs in the
 *  background, this is only how long an answer is considered fresh. */
export const ASK_EVERY_MS = 24 * 60 * 60 * 1000;

/** Give up rather than hold a connection open on a bad network. */
const ASK_TIMEOUT_MS = 8000;

/** Keys in the settings store. */
export const ASKED_AT_KEY = "newerVersion.askedAt";
export const LATEST_KEY = "newerVersion.latest";
export const HIDDEN_KEY = "newerVersion.hidden";

/**
 * A version as three-ish numbers and an optional pre-release tail.
 *
 * `null` for anything that is not one. A release could be tagged "nightly" or
 * the request could come back as an error page, and a version we cannot read
 * has to mean "say nothing" rather than "say something wrong".
 */
interface Parsed {
  numbers: number[];
  /** The bit after "-", split on ".". Empty for a final release. */
  pre: string[];
}

export function parseVersion(raw: unknown): Parsed | null {
  if (typeof raw !== "string") return null;
  // A tag is "v1.2.1" and a version is "1.2.1"; both are the same thing.
  const text = raw.trim().replace(/^v/i, "");
  // Build metadata ("+abc") never affects which version is newer.
  const [core, ...preParts] = text.split("+")[0].split("-");
  if (!/^\d+(\.\d+)*$/.test(core)) return null;
  const numbers = core.split(".").map(Number);
  if (numbers.some((n) => !Number.isFinite(n))) return null;
  const pre = preParts.join("-");
  return { numbers, pre: pre ? pre.split(".") : [] };
}

/**
 * -1, 0 or 1, the way a person would read the two numbers.
 *
 * Compared part by part as NUMBERS, which is the whole reason this is not a
 * string comparison: "1.10.0" is newer than "1.9.9" and sorts before it as
 * text. A missing part is a zero, so 1.3 and 1.3.0 are the same version.
 *
 * A pre-release is older than the release it leads to — 1.3.0-beta.1 comes
 * before 1.3.0 — so someone running a beta is told about the final, and
 * nobody is ever sent "backwards" to a beta.
 */
export function compareVersions(a: Parsed, b: Parsed): number {
  const len = Math.max(a.numbers.length, b.numbers.length);
  for (let i = 0; i < len; i++) {
    const x = a.numbers[i] ?? 0;
    const y = b.numbers[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0;
  if (a.pre.length === 0) return 1;
  if (b.pre.length === 0) return -1;
  const preLen = Math.max(a.pre.length, b.pre.length);
  for (let i = 0; i < preLen; i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    // Semver's rule, and the useful one: "beta" outranks "11" so that
    // 1.3.0-11 does not read as newer than 1.3.0-beta.
    if (xn && yn) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
    } else if (xn !== yn) {
      return xn ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** Is `latest` a version worth mentioning to someone running `running`? */
export function isNewer(latest: unknown, running: unknown): boolean {
  const l = parseVersion(latest);
  const r = parseVersion(running);
  if (!l || !r) return false;
  return compareVersions(l, r) > 0;
}

/**
 * Time to ask again?
 *
 * Anything that is not a number we have written ourselves — missing, a string,
 * `NaN` — means "never asked". A clock that has gone backwards (a phone
 * crossing a time zone, or a user setting the date) also means ask: the
 * alternative is a device that never asks again until the date catches up.
 */
export function timeToAsk(askedAt: unknown, now: number): boolean {
  if (typeof askedAt !== "number" || !Number.isFinite(askedAt)) return true;
  if (askedAt > now) return true;
  return now - askedAt >= ASK_EVERY_MS;
}

/**
 * The version of the newest release, or null.
 *
 * Null for every failure there is — offline, a rate limit, a body that is not
 * the shape expected, a tag that is not a version. The caller has one thing
 * to do with a null and it is nothing.
 */
export async function askForNewest(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ASK_TIMEOUT_MS);
    let body: unknown;
    try {
      const response = await fetchImpl(LATEST_RELEASE_URL, {
        method: "GET",
        // No credentials, no cookies, nothing cached from a previous answer.
        credentials: "omit",
        cache: "no-store",
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      body = await response.json();
    } finally {
      clearTimeout(timer);
    }
    const tag = (body as { tag_name?: unknown } | null)?.tag_name;
    return parseVersion(tag) ? String(tag).trim().replace(/^v/i, "") : null;
  } catch {
    return null;
  }
}
