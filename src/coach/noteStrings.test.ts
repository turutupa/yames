/**
 * The coach's new English, held to the honesty lint (DESIGN 2, "What it never
 * claims"). `BANNED_CLAIMS` runs on pack text already; this runs it over every
 * string the coach's note says in a Session (`session.note.*`), as the coach.
 *
 * Two of the owner's decisions are checked here as well: the threshold is the
 * pass mark, never "the bar" (decision 2), and nothing is said about tuning
 * until the app has a tuner (decision 9).
 */
import { describe, expect, it } from "vitest";
import en from "../locales/en/session.json";
import { bannedClaimsIn } from "../paths/honesty";

function strings(node: unknown, prefix: string): Array<[string, string]> {
  if (typeof node === "string") return [[prefix, node]];
  if (!node || typeof node !== "object") return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => strings(v, `${prefix}.${k}`));
}

const NOTE = strings((en as { session: { note: unknown } }).session.note, "session.note");

describe("the coach's note, in English", () => {
  it("has strings to check", () => {
    expect(NOTE.length).toBeGreaterThan(40);
  });

  it.each(NOTE)("%s claims nothing the app cannot measure", (_key, text) => {
    expect(bannedClaimsIn(text, true).map((c) => c.name)).toEqual([]);
  });

  it.each(NOTE)("%s never calls the threshold \"the bar\"", (_key, text) => {
    expect(text).not.toMatch(/\bthe bar\b|\bpass bar\b|\bclears? the bar\b/i);
  });

  it.each(NOTE)("%s says nothing about tuning", (_key, text) => {
    expect(text).not.toMatch(/\btun(?:e|ing)\s+(?:up|your|the guitar)|\btuning\b|\bin tune\b|\bout of tune\b/i);
  });

  it("the lint itself still catches a coach claiming to hear the pick", () => {
    expect(bannedClaimsIn("I heard your downstrokes land late.", true).length).toBeGreaterThan(0);
  });
});
