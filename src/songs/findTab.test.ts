import { describe, expect, it } from "vitest";
import { MAX_QUERY, TAB_SEARCH_TERMS, tabSearchUrl } from "./findTab";

/**
 * The tab sites this must never contain, by name or by domain.
 *
 * Not a blocklist that does anything — nothing filters against it — but the
 * assertion that the feature is what it claims to be. If somebody ever
 * "improves" this by pointing it straight at a site, one of these fires.
 */
const TAB_SITES = [
  "ultimate-guitar",
  "ultimateguitar",
  "songsterr",
  "gprotab",
  "911tabs",
  "tabs.ultimate",
  "mysongbook",
  "guitarprotabs",
  "tabnabber",
];

describe("finding a tab, without touching anybody's tab site", () => {
  it("names no tab site", () => {
    const url = tabSearchUrl("blackbird beatles")!;
    for (const site of TAB_SITES) {
      expect(url.toLowerCase(), `the link points at ${site}`).not.toContain(site);
    }
    // A general-purpose search engine, and an ordinary results page.
    expect(url.startsWith("https://duckduckgo.com/?")).toBe(true);
  });

  it("sends the words the player typed, and the two that say what they want", () => {
    const url = new URL(tabSearchUrl("  Blackbird   Beatles ")!);
    expect(url.searchParams.get("q")).toBe(`Blackbird Beatles ${TAB_SEARCH_TERMS}`);
    // Nothing else crosses: no id, no version, no machine, no song.
    expect([...url.searchParams.keys()]).toEqual(["q"]);
  });

  it("does not open a blank search when the box is empty", () => {
    for (const nothing of ["", "   ", "\n\t "]) {
      expect(tabSearchUrl(nothing), JSON.stringify(nothing)).toBeNull();
    }
  });

  it("treats a title with punctuation in it as a title", () => {
    // `&`, `#` and `+` in a hand-built query string would be three
    // parameters, a fragment and a space. Through `URLSearchParams` they are
    // the characters somebody typed.
    const url = new URL(tabSearchUrl("Rock & Roll #1 + me")!);
    expect(url.searchParams.get("q")).toBe(`Rock & Roll #1 + me ${TAB_SEARCH_TERMS}`);
  });

  it("sends a title, not an essay", () => {
    const long = "a".repeat(500);
    const url = new URL(tabSearchUrl(long)!);
    expect(url.searchParams.get("q")).toBe(`${"a".repeat(MAX_QUERY)} ${TAB_SEARCH_TERMS}`);
  });
});
