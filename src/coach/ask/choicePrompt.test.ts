import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THEMES } from "../../themes";
import { estimateTokens } from "../context";
import { SAFE_SETTING_KEYS } from "../tools/host";
import { COACH_TOOLS, toolCatalogue } from "../tools/registry";
import { CHOICE_CONTEXT_TOKENS, CHOICE_PREFIX_TOKENS, SETTING_VALUES, choiceContext, choicePrefix, namedTitles } from "./choicePrompt";
import { commandTableFor } from "./commandTable";
import { EVAL_CARDS } from "./evalCards";
import { EVAL_LANGUAGES, WORLD_THEMES } from "./evalWorld";

const catalogue = () => toolCatalogue(COACH_TOOLS);

describe("choicePrefix", () => {
  it("is byte-identical turn to turn (the worker keeps it decoded)", () => {
    const first = choicePrefix(catalogue(), EVAL_CARDS);
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 86_400_000;
      expect(choicePrefix(catalogue(), EVAL_CARDS)).toBe(first);
    } finally {
      Date.now = realNow;
    }
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}/);
  });

  it("lists every player tool and fits DESIGN 5.5's 900 tokens", () => {
    const prefix = choicePrefix(catalogue(), EVAL_CARDS);
    for (const tool of catalogue().tools) expect(prefix).toContain(`\n${tool.name}(`);
    expect(prefix).not.toContain("return_to");
    expect(estimateTokens(prefix)).toBeLessThanOrEqual(CHOICE_PREFIX_TOKENS);
  });

  it("still fits with a card list as long as the cards' (about 40 one-liners)", () => {
    const cards = Array.from({ length: 40 }, (_, i) => ({ id: `card_${i}`, note: "What the player's best clean tempo is here." }));
    const prefix = choicePrefix(catalogue(), cards);
    expect(prefix).toContain("card_39: ");
    // Reported, not gated: c3b1b decides how cards are described once they exist.
    expect(estimateTokens(prefix)).toBeGreaterThan(0);
  });
});

describe("choicePrefix, leg c3bp's fixes", () => {
  const prefix = choicePrefix(catalogue(), EVAL_CARDS);

  it("lists every value of every closed set, never two and a '…'", () => {
    expect(prefix).not.toContain("…");
    expect(prefix).not.toContain("Am7");
    for (const tool of catalogue().tools) {
      for (const f of tool.args) {
        // set_setting's keys are written with their values (the next test).
        if (f.type.kind !== "enum" || (tool.name === "set_setting" && f.name === "key")) continue;
        for (const v of f.type.values) expect(prefix, `${tool.name}.${f.name}=${v}`).toMatch(new RegExp(`[=|]${v.replace(/[#]/g, "\\#")}(?=[|,)\\n;]|$)`, "m"));
      }
    }
    // A long set once, under its name, used by both tools that take it.
    expect(prefix).toContain("show_scale(root=ROOT, scale=SCALE,");
    expect(prefix).toMatch(/^SCALE=major\|naturalMinor\|.*\|minorPentatonic\|/m);
    expect(prefix.match(/^ROOT=/gm)).toHaveLength(1);
  });

  it("says to leave out an optional argument the player did not say, and shows set_tempo's two as one or the other", () => {
    expect(prefix).toContain("an optional arg? only if the player said it");
    expect(prefix).toContain("set_tempo(bpm# or direction=slower|faster, at?#)");
  });

  it("gives set_setting the values each key takes, for every safe key", () => {
    const line = prefix.split("\n").find((l) => l.startsWith("  key=value: "))!;
    for (const key of SAFE_SETTING_KEYS) expect(line).toContain(`${key}=${SETTING_VALUES[key].join("|")}`);
    expect(line).toContain("language=en|es|");
    expect(line).not.toMatch(/japanese|english/i);
  });

  it("the settings' values are the app's: its themes, its languages, the eval world's", () => {
    expect([...SETTING_VALUES.theme].sort()).toEqual(THEMES.map((t) => t.id).sort());
    expect([...SETTING_VALUES.theme].sort()).toEqual([...WORLD_THEMES].sort());
    const locales = readdirSync(join(dirname(fileURLToPath(import.meta.url)), "../../locales")).sort();
    expect([...SETTING_VALUES.language].sort()).toEqual(locales);
    expect([...SETTING_VALUES.language].sort()).toEqual([...EVAL_LANGUAGES].sort());
  });

  it("a caller may give its own values; the plain arm keeps the same head", () => {
    const own = choicePrefix(catalogue(), EVAL_CARDS, { settingValues: { ...SETTING_VALUES, language: ["en", "de"] } });
    expect(own).toContain("language=en|de;");
    expect(choicePrefix(catalogue(), EVAL_CARDS, { notes: false }).split("Tools:")[0]).toBe(prefix.split("Tools:")[0]);
  });
});

describe("namedTitles (leg c3bp)", () => {
  const titles = ["Alternate Picking", "Sweep Picking", "First Chords and Strumming", "Chords in a Key", "Know the Neck", "Tapping"];
  const en = commandTableFor("en");

  it("finds the titles the words could name, by the router's matcher", () => {
    expect(namedTitles("open picking", titles, en)).toEqual(["Alternate Picking", "Sweep Picking"]);
    expect(namedTitles("open alternate picking", titles, en)).toEqual(["Alternate Picking"]);
    expect(namedTitles("abre acordes", ["Acordes en una tonalidad", "Primeros acordes y rasgueo", "Tapping"])).toEqual([
      "Acordes en una tonalidad",
      "Primeros acordes y rasgueo",
    ]);
    expect(namedTitles("tap", titles, en)).toEqual([]);
    expect(namedTitles("tapping please", titles, en)).toEqual(["Tapping"]);
  });

  it("a short word or a command's own word names nothing", () => {
    expect(namedTitles("show me the neck and the key", titles, en)).toEqual(["Know the Neck"]);
    expect(namedTitles("swap the first one", titles, en)).toEqual([]);
    expect(namedTitles("swap the first one", titles)).toEqual(["First Chords and Strumming"]);
    expect(namedTitles("set the tempo to 120", titles, en)).toEqual([]);
  });

  it("in a script without spaces, by two-character runs", () => {
    const ja = ["オルタネイト・ピッキング", "スウィープ・ピッキング", "タッピング"];
    expect(namedTitles("ピッキングを開いて", ja, commandTableFor("ja"))).toEqual(["オルタネイト・ピッキング", "スウィープ・ピッキング"]);
    expect(namedTitles("スウィープピッキング", ja, commandTableFor("ja"))).toEqual(["スウィープ・ピッキング"]);
  });

  it("at most MAX_CHOICES", () => {
    const many = Array.from({ length: 10 }, (_, i) => `Picking ${i}`);
    expect(namedTitles("picking", many, en)).toHaveLength(6);
  });
});

describe("choiceContext", () => {
  const facts = {
    screen: "today",
    session: "none",
    grading: "on",
    minutes: 15,
    parts: ["Quarter notes on one string", "Downstrokes, then alternate", "The box, in A"],
    followed: ["Rhythm Foundations", "Alternate Picking", "Blues and Pentatonics"],
    jams: ["Blues in A", "Funk 90", "Slow rock"],
    presets: ["Warm-up 80", "Triplets 120", "Gallop"],
    possible: ["go_to", "open_path", "start_today", "set_minutes"],
  };

  it("states the facts as plain lines", () => {
    const text = choiceContext(facts);
    expect(text).toContain("Screen: today");
    expect(text).toContain("Today: 15 minutes");
    expect(text).toContain("Today's parts: 1. Quarter notes on one string; 2.");
    expect(text).toContain("Tools here: go_to, open_path, start_today, set_minutes");
  });

  it("names the Paths the words could name right after the tools, and nothing when there are none (leg c3bp)", () => {
    expect(choiceContext({ ...facts, named: [] })).toBe(choiceContext(facts));
    const text = choiceContext({ ...facts, named: ["Alternate Picking", "Sweep Picking"] });
    expect(text).toContain("Tools here: go_to, open_path, start_today, set_minutes\nPaths these words name: Alternate Picking; Sweep Picking\nToday's parts:");
  });

  it("never passes the worker's 450 tokens, whatever the titles", () => {
    const long = { ...facts, followed: Array.from({ length: 200 }, (_, i) => `学習パス ${i} 弦をまたぐオルタネイト・ピッキング`) };
    const text = choiceContext(long);
    expect(estimateTokens(text)).toBeLessThanOrEqual(CHOICE_CONTEXT_TOKENS);
    expect(text).toContain("Screen: today");
  });
});
