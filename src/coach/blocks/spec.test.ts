/**
 * The catalogue against everything generated from it.
 *
 * Three things have to agree about what a block is: `spec.ts`, the types in
 * `types.ts`, and the two files on disk a model is held to. This is what
 * fails when they stop agreeing — which they will, because adding a field is
 * one line in the spec and nothing at all anywhere else.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { chordSuffix, parseChordName, type Chord } from "../../jam/harmony";
import { CHORD_QUALITIES, chordName } from "../../jam/diatonic";
import { buildGbnf, chordNamePattern, jsonSchemaText } from "./schema";
import { BLOCK_TYPES, CATALOGUE, CHORD_SUFFIXES } from "./spec";
import type { CoachBlock } from "./types";

const HERE = path.resolve(process.cwd(), "src/coach/blocks");

/**
 * A generated file as it was written.
 *
 * `core.autocrlf` is true on the owner's machine, so a checked-in file comes
 * back out of git with CRLF line endings while the generator emits LF.
 * Comparing raw bytes would report every file as stale on a fresh clone,
 * which is a gate that cries wolf and gets turned off.
 */
function onDisk(name: string): string {
  return fs.readFileSync(path.join(HERE, name), "utf8").replace(/\r\n/g, "\n");
}

describe("the generated schema and grammar", () => {
  it("is what the spec says, byte for byte", () => {
    // If this fails: `node scripts/coach-blocks.mjs`, then commit all three.
    expect(onDisk("coach-answer.schema.json")).toBe(jsonSchemaText());
    expect(onDisk("coach-answer.gbnf")).toBe(buildGbnf());
  });

  it("names every rule it uses", () => {
    // A grammar with a dangling reference loads and then refuses every token,
    // which llama.cpp reports as an empty sample rather than as a bad file.
    const text = onDisk("coach-answer.gbnf");
    const defined = new Set(
      [...text.matchAll(/^([a-zA-Z][a-zA-Z0-9-]*)\s*::=/gm)].map((m) => m[1]),
    );
    expect(defined.has("root"), "no root rule").toBe(true);

    const referenced = new Set<string>();
    for (const line of text.split("\n")) {
      if (line.startsWith("#") || !line.includes("::=")) continue;
      const body = line
        .slice(line.indexOf("::=") + 3)
        // Quoted literals and character classes hold letters that are not
        // rule names; repetition counts hold digits that are not either.
        .replace(/"(?:\\.|[^"\\])*"/g, " ")
        .replace(/\[(?:\\.|[^\]\\])*\]/g, " ")
        .replace(/\{[^}]*\}/g, " ");
      for (const match of body.matchAll(/[a-zA-Z][a-zA-Z0-9-]*/g)) referenced.add(match[0]);
    }

    expect([...referenced].filter((name) => !defined.has(name)).sort()).toEqual([]);
  });

  it("holds an answer to six blocks", () => {
    expect(CATALOGUE.maxBlocks).toBe(6);
    const schema = JSON.parse(onDisk("coach-answer.schema.json")) as {
      properties: { blocks: { maxItems: number } };
    };
    expect(schema.properties.blocks.maxItems).toBe(6);
    expect(onDisk("coach-answer.gbnf")).toContain("{0,5}");
  });
});

describe("the spec and the types", () => {
  /**
   * Every block, and every field of it, written out against the TypeScript.
   *
   * The `keyof` is what makes this worth having: a field named here that
   * `types.ts` does not have will not compile, and a field the spec has that
   * is not named here fails the assertion below. So the spec cannot gain a
   * field without the type gaining one too.
   */
  const FIELDS: {
    [K in CoachBlock["type"]]: readonly (keyof Extract<CoachBlock, { type: K }>)[];
  } = {
    text: ["type", "text"],
    fretboard: ["type", "show", "position", "instrument"],
    chordShape: ["type", "chord", "shape", "instrument"],
    tabExcerpt: ["type", "score", "fromBar", "toBar", "attempt"],
    progress: ["type", "score", "fromBar", "toBar"],
    take: ["type", "attempt", "fromBar", "toBar"],
    compare: ["type", "attempts"],
    action: ["type", "action"],
  };

  it("names the same blocks", () => {
    expect([...BLOCK_TYPES].sort()).toEqual(Object.keys(FIELDS).sort());
  });

  it("names the same fields on each of them", () => {
    for (const block of CATALOGUE.blocks) {
      const fromSpec = ["type", ...block.fields.map((field) => field.name)];
      const fromTypes = FIELDS[block.type as CoachBlock["type"]] as readonly string[];
      expect([...fromSpec].sort(), `${block.type} fields`).toEqual([...fromTypes].sort());
    }
  });
});

describe("the chord spellings", () => {
  it("round-trips every quality through the app's own parser", () => {
    // The catalogue's list of suffixes IS what the grammar lets a model
    // write, so a spelling the parser cannot read is a chord the model can
    // produce and the app will then drop. "6/9" was exactly that: the parser
    // reads a slash as a bass note and hands back a plain sixth.
    for (const quality of CHORD_QUALITIES) {
      const written = CHORD_SUFFIXES.find(
        (suffix) => parseChordName(`C${suffix}`)?.quality === quality,
      );
      expect(written, `no spelling in the catalogue reads back as ${quality}`).toBeDefined();
    }
  });

  it("accepts every chord name the app writes, but one", () => {
    const pattern = new RegExp(chordNamePattern());
    const refused = new Set<string>();
    for (let root = 0; root < 12; root++) {
      for (const quality of CHORD_QUALITIES) {
        if (!pattern.test(chordName(root, quality))) refused.add(quality);
      }
    }
    // The six-nine chord, and only it. The test below says why.
    expect([...refused]).toEqual(["69"]);
  });

  it("spells the six-nine chord the way the parser reads it, not the way the app writes it", () => {
    /*
     * A found defect in `src/jam/harmony.ts`, worked around here rather than
     * fixed (it is not this worker's file this wave).
     *
     * `chordSuffix("69")` writes "6/9", and `parseChordName` reads a slash as
     * a bass note — "D/F#" is a D — so it drops the "/9" and hands back a
     * plain sixth. The right root and the wrong chord.
     *
     * So the catalogue offers "69", which the parser reads correctly, and the
     * grammar does not allow "6/9" at all. Allowing it would let a model name
     * a six-nine and have the app quietly draw a sixth, which is the exact
     * failure D3 rule 1 exists to prevent: an unknown reference must render
     * as nothing, never as a guess — and a WRONG reference that resolves is
     * worse than either.
     *
     * If harmony.ts ever learns to read "6/9", delete this and let
     * `CHORD_SUFFIXES` use `chordSuffix` unchanged.
     */
    expect(chordSuffix("69")).toBe("6/9");
    expect(parseChordName("C6/9")?.quality).toBe("6");
    expect(parseChordName("C69")?.quality).toBe("69");
    expect(CHORD_SUFFIXES).toContain("69");
    expect(CHORD_SUFFIXES).not.toContain("6/9");
  });

  it("refuses a chord the app cannot spell", () => {
    const pattern = new RegExp(chordNamePattern());
    for (const nonsense of ["Hm7", "Am7b5b9", "", "Am/C", "A m7", "Amaj7777"]) {
      expect(pattern.test(nonsense), `"${nonsense}" got through`).toBe(false);
    }
  });

  it("agrees with the parser about what a chord is", () => {
    const pattern = new RegExp(chordNamePattern());
    const samples = ["Am7", "Bb", "F#dim7", "C", "G7sus4", "Ebm(maj7)", "D69"];
    for (const text of samples) {
      const parsed: Chord | null = parseChordName(text);
      expect(pattern.test(text), `the pattern refused ${text}`).toBe(true);
      expect(parsed, `the parser refused ${text}`).not.toBeNull();
    }
  });
});
