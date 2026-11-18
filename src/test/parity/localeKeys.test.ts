/**
 * P2: deleting a feature together with its strings has to fail.
 *
 * `i18n.coverage.test.ts` says every key has a call site, and
 * `i18n.locales.test.ts` says fifteen languages hold the same keys. Both are
 * right, and both pass when a feature and all of its strings leave in the same
 * commit, because then nothing disagrees. Every user-visible string is a key, so
 * the keys are the most complete inventory of the product there is. This freezes
 * them: a key that disappears fails here until somebody says so, below, by name.
 *
 * Adding strings needs nothing. To protect a new one as well, run
 *
 *   UPDATE_PARITY_MANIFEST=1 npx vitest run src/test/parity/localeKeys.test.ts
 *
 * which only ever adds to the snapshot.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const LOCALES = path.resolve(process.cwd(), "src/locales");
const SNAPSHOT = path.resolve(process.cwd(), "src/test/parity/locale-keys.en.json");

/**
 * Keys taken out on purpose, each one a decision somebody made. Keep the reason
 * in the commit. A key listed here must really be gone, so this cannot go stale.
 */
const DELIBERATELY_REMOVED: readonly string[] = [
  // W3 leads with the Session's keys under "In a Session" (2026-11-17); the
  // old "Keyboard" heading over the tools' keys has nothing left to head.
  "onboarding.handsFree.keyboard.title",
  // The learning pages' polish (UX audit, 2026-11-17). Today's "Running: …"
  // line is gone (TODAY-6); "No mic yet? Set up input" is the header's input
  // chip now (TODAY-10, `shell` transport.setUpInput); "Go to step N" is
  // "Continue · Step N" (PATH-4); Progress lost its one headline chart for a
  // card per Path (PROG-1) and its one-line empty state for a real one (PROG-2).
  "session.today.running",
  "session.today.noMic",
  "session.today.setUpInput",
  "session.paths.openStep",
  "session.progress.empty",
  "session.progress.cleanTempo",
  "session.progress.bpmOn",
  "session.progress.chartLabel",
  "session.progress.noClean",
  "session.progress.exercises",
  // The Session's result polish (UX audit SES-2 to SES-4, 2026-11-18). "The
  // bar is 85%" is the ✓/✗ bar chip beside the number now; the paragraph
  // saying the notes could not be heard is one honest clause in the coach's
  // line plus a "Right notes: not checked" row; "Again, 80 BPM" is "Go again,
  // 80 BPM", the same words as the big button.
  "session.result.barIs",
  "session.result.barIsCount",
  "session.result.unmeasuredNotes",
  "session.result.againSame",
  // The wizard catches up with the app (2026-11-18). W3's Session card shows
  // pause, restart, view and Escape now, with faster and slower on one row;
  // its two folded "Getting around" and "In the tools" cards are one quiet
  // line. W7's coach row is "Coach model" (Settings' word) with the tier's
  // name, not "Practice coach: On".
  "onboarding.handsFree.session.faster",
  "onboarding.handsFree.session.slower",
  "onboarding.handsFree.nav.title",
  "onboarding.handsFree.tools.title",
  "onboarding.ready.rows.coach",
  "onboarding.ready.coachOn",
  // The neck's numbers are fingers everywhere (acceptance pass 4, P1-1,
  // 2026-11-18): "next" no longer says "then 8, 7", frets the player read as
  // fingers. It says "next" alone.
  "session.practice.then",
];

function englishKeys(): string[] {
  const merged: Record<string, unknown> = {};
  for (const f of fs.readdirSync(path.join(LOCALES, "en"))) {
    Object.assign(merged, JSON.parse(fs.readFileSync(path.join(LOCALES, "en", f), "utf8")));
  }
  const walk = (o: Record<string, unknown>, prefix = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      v !== null && typeof v === "object"
        ? walk(v as Record<string, unknown>, `${prefix}${k}.`)
        : [`${prefix}${k}`],
    );
  return walk(merged).sort();
}

const now = englishKeys();

if (process.env.UPDATE_PARITY_MANIFEST === "1") {
  const held: string[] = fs.existsSync(SNAPSHOT)
    ? (JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")) as string[])
    : [];
  const merged = [...new Set([...held, ...now])].sort();
  fs.writeFileSync(SNAPSHOT, `${JSON.stringify(merged, null, 0).replace(/","/g, '",\n"')}\n`);
}

const frozen = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")) as string[];

describe("the English strings", () => {
  it("is comparing something: a silent zero here would pass everything", () => {
    expect(frozen.length).toBeGreaterThan(1900);
    expect(now.length).toBeGreaterThan(1900);
  });

  it("has lost none of them", () => {
    const present = new Set(now);
    const allowed = new Set(DELIBERATELY_REMOVED);
    const lost = frozen.filter((k) => !present.has(k) && !allowed.has(k));
    expect(lost, "these strings left, and a feature probably left with them").toEqual([]);
  });

  it("names no removal that has not happened", () => {
    const present = new Set(now);
    expect(DELIBERATELY_REMOVED.filter((k) => present.has(k))).toEqual([]);
  });
});
