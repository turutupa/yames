/**
 * "Send feedback": a prefilled GitHub issue, opened in the player's browser.
 *
 * Nothing leaves the machine from here. The app builds a URL and hands it to
 * the system's browser (`openUrl` in `ipc.ts`); the player reads the issue,
 * writes their words into it and presses Submit on GitHub, or closes the tab.
 * No telemetry, no account in the app, no request made by Yames itself.
 *
 * The template is English on purpose: it is read by the people fixing the
 * bug, and the headings are what they look for. The player writes in
 * whatever language they like.
 */

/** Where testers' reports go. */
export const FEEDBACK_REPO = "turutupa/yames";

/**
 * GitHub answers 414 for a URL much past 8 KB; a user agent and a template are
 * a few hundred bytes, so this only guards against something odd in them.
 */
const MAX_URL = 7000;

export type FeedbackFacts = {
  /** The app's version, as `getVersion()` reports it. */
  version: string;
  /** The operating system, as plainly as the web view can tell. */
  os: string;
  /** The web view's user agent: the OS version and the engine, for a bug. */
  userAgent?: string;
  /** The interface language, e.g. "de". */
  language?: string;
};

/** "Windows", "macOS", "Linux", or what the platform string says. */
export function osName(platform: string, userAgent = ""): string {
  const p = `${platform} ${userAgent}`.toLowerCase();
  if (p.includes("win")) return "Windows";
  if (p.includes("mac")) return "macOS";
  if (p.includes("linux") || p.includes("x11")) return "Linux";
  return platform || "unknown";
}

/** The facts this web view can report, without asking the backend anything. */
export function currentFacts(version: string, language?: string): FeedbackFacts {
  const platform = typeof navigator !== "undefined" ? navigator.platform : "";
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return { version, os: osName(platform, userAgent), userAgent, language };
}

/** The issue's body: their words first, then what we need to reproduce it. */
export function feedbackBody(facts: FeedbackFacts): string {
  const lines = [
    "<!-- Thanks for testing Yames. Write in any language. Nothing is sent until you press Submit. -->",
    "",
    "### What happened",
    "",
    "",
    "### What you expected",
    "",
    "",
    "### Steps, if you remember them",
    "",
    "1. ",
    "",
    "### Your setup",
    "",
    "- Input: (microphone / audio interface, which one)",
    "- Guitar: ",
    "",
    "---",
    `- Yames: ${facts.version || "unknown"}`,
    `- OS: ${facts.os}`,
  ];
  if (facts.language) lines.push(`- Language: ${facts.language}`);
  if (facts.userAgent) lines.push(`- Web view: \`${facts.userAgent}\``);
  return lines.join("\n");
}

/** `https://github.com/turutupa/yames/issues/new?title=…&body=…` */
export function feedbackUrl(facts: FeedbackFacts): string {
  const title = `Feedback: Yames ${facts.version || ""} on ${facts.os}`.replace(/\s+/g, " ").trim();
  const base = `https://github.com/${FEEDBACK_REPO}/issues/new`;
  const url = `${base}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(feedbackBody(facts))}`;
  if (url.length <= MAX_URL) return url;
  // Drop the user agent before anything a person would miss.
  const short = { ...facts, userAgent: undefined };
  return `${base}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(feedbackBody(short))}`;
}
