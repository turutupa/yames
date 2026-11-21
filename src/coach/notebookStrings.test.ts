/**
 * The Notebook's noticed lines in English (`notebook.*`), held to the same
 * honesty lint as the coach's note (`noteStrings.test.ts`): nothing the app
 * cannot measure, never "the bar" for the pass mark, nothing about tuning,
 * and every noticed line names its window (a count of Takes or Sessions).
 */
import { describe, expect, it } from "vitest";
import en from "../locales/en/notebook.json";
import { bannedClaimsIn } from "../paths/honesty";

function strings(node: unknown, prefix: string): Array<[string, string]> {
  if (typeof node === "string") return [[prefix, node]];
  if (!node || typeof node !== "object") return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => strings(v, `${prefix}.${k}`));
}

const ALL = strings((en as { notebook: unknown }).notebook, "notebook");
const NOTICED = ALL.filter(([key]) => key.startsWith("notebook.noticed."));

describe("the Notebook, in English", () => {
  it("has strings to check", () => {
    expect(NOTICED.length).toBeGreaterThanOrEqual(20);
  });

  it.each(ALL)("%s claims nothing the app cannot measure", (_key, text) => {
    expect(bannedClaimsIn(text, true).map((c) => c.name)).toEqual([]);
  });

  it.each(ALL)("%s never calls the threshold \"the bar\"", (_key, text) => {
    expect(text).not.toMatch(/\bthe bar\b|\bpass bar\b|\bclears? the bar\b/i);
  });

  it.each(ALL)("%s says nothing about tuning", (_key, text) => {
    expect(text).not.toMatch(/\btun(?:e|ing)\s+(?:up|your|the guitar)|\btuning\b|\bin tune\b|\bout of tune\b/i);
  });

  it.each(NOTICED)("%s names its window or compares two measured values", (key, text) => {
    // A count of Takes or Sessions, or (tempo lines) the two tempos it compares.
    expect(text, key).toMatch(/\{\{count\}\}|\{\{sessions\}\}|\{\{slow\}\}|\{\{fromBpm\}\}/);
  });

  // c4a1b, L2: `count` is the Takes where the lean could be measured, not every Take played since.
  it.each(NOTICED.filter(([, text]) => text.includes("{{hits}}")))("%s says which Takes it counted", (key, text) => {
    expect(text, key).not.toMatch(/your last \{\{count\}\}/i);
    expect(text, key).toMatch(/of the \{\{count\}\} most recent Takes .*where it could be measured/);
  });

  // c4a1b, L3: the minutes are the Takes' own length, as Progress counts them.
  it("the minutes line says it counts minutes played in Takes", () => {
    expect(en.notebook.noticed.minutes.perSession).toMatch(/minutes played in Takes/);
  });
});
