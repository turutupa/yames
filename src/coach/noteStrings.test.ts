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
import { cueWordIssues } from "../paths/cues";
import type { PathDoc } from "../paths/format";

function strings(node: unknown, prefix: string): Array<[string, string]> {
  if (typeof node === "string") return [[prefix, node]];
  if (!node || typeof node !== "object") return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => strings(v, `${prefix}.${k}`));
}

const SESSION = (en as { session: { note: unknown; loop: unknown; eyes: unknown; result: { upTo: string } } }).session;
// The note, the loop step's words and the Take for the eyes (c1c): the coach says those too.
const NOTE = [
  ...strings(SESSION.note, "session.note"),
  ...strings(SESSION.loop, "session.loop"),
  ...strings(SESSION.eyes, "session.eyes"),
  ...strings(SESSION.result.upTo, "session.result.upTo"),
];

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

/**
 * The Paths' cues (`Exercise.cues`) are the coach's words too: the ready
 * note's headline, the Take's order and the result's "Next time". Every
 * English cue in every pack, the Exercise's and each variant's own, is held
 * to the same lint and the two decisions, and to the cue's own rules
 * (`cueWordIssues`: 48 characters, an order, no grade, no praise).
 */
const PACKS = import.meta.glob("../paths/packs/*.json", { eager: true, import: "default" }) as Record<string, PathDoc>;
const CUES: Array<[string, string]> = Object.values(PACKS).flatMap((doc) =>
  [...doc.steps.flatMap((s) => s.exercises), ...(doc.levels ?? []).flatMap((l) => l.warmups)].flatMap((ex) => [
    ...(ex.cues ?? []).map((c, i): [string, string] => [`${doc.id} ${ex.id}.cue.${i}`, c.say]),
    ...(ex.variation?.variants ?? []).flatMap((v) =>
      (v.cues ?? []).map((c, i): [string, string] => [`${doc.id} ${ex.id}#${v.id}.cue.${i}`, c.say]),
    ),
  ]),
);

describe("the Paths' cues, in English", () => {
  it("there are cues to check (Alternate Picking has them)", () => {
    expect(CUES.some(([key]) => key.startsWith("alternate-picking "))).toBe(true);
  });

  it.each(CUES)("%s claims nothing the app cannot measure", (_key, text) => {
    expect(bannedClaimsIn(text, true).map((c) => c.name)).toEqual([]);
  });

  it.each(CUES)("%s never calls the threshold \"the bar\"", (_key, text) => {
    expect(text).not.toMatch(/\bthe bar\b|\bpass bar\b|\bclears? the bar\b/i);
  });

  it.each(CUES)("%s says nothing about tuning", (_key, text) => {
    expect(text).not.toMatch(/\btun(?:e|ing)\s+(?:up|your|the guitar)|\btuning\b|\bin tune\b|\bout of tune\b/i);
  });

  it.each(CUES)("%s is an order of at most 48 characters", (_key, text) => {
    expect(cueWordIssues(text)).toEqual([]);
  });
});
