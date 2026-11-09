/**
 * The catalogue, said twice more: as a JSON Schema and as a GBNF grammar.
 *
 * Both are generated from `spec.ts` and written to disk by
 * `scripts/coach-blocks.mjs`; `spec.test.ts` regenerates them and fails when
 * what is checked in has fallen behind. The files are checked in rather than
 * built at startup because the grammar has to be handed to llama.cpp by a
 * Rust process that does not run TypeScript, and the schema has to be posted
 * to a hosted model by whatever eventually does that.
 *
 * ## What each of them is for
 *
 * - **The JSON Schema** holds a hosted model to the catalogue. It states
 *   every bound exactly, because it can.
 * - **The GBNF grammar** holds llama.cpp to it locally, token by token. It
 *   cannot say "between 20 and 300" — a grammar counts characters, not
 *   values — so a wide range becomes a digit pattern. Every enum, every
 *   field name, every block type and every chord spelling IS exact, which is
 *   what stops a small model from inventing a block type or a scale.
 *
 * Neither is the guarantee. `resolve.ts` is: it checks the bounds and every
 * reference against the real shape library, the real score and the real
 * store, and drops what does not resolve.
 *
 * ## Keeping the grammar small
 *
 * The brief asks for it and llama.cpp's sampler pays for it on every token.
 * So: at most six blocks, bounded strings, alternations for short integer
 * ranges and digit patterns for long ones, and one shared rule per repeated
 * terminal rather than a copy per use.
 */

import {
  type CatalogueSpec,
  type Field,
  type FieldType,
  CATALOGUE,
  CHORD_SUFFIXES,
  ROOT_NAMES,
} from "./spec";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** `chordShape` → `chord-shape`, so a rule name is letters, digits and dashes. */
function ruleName(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** Anything that could mean something else inside a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The chord names the catalogue accepts, as one pattern.
 *
 * A root out of the app's own note tables, then a quality out of its own
 * suffix table — so "Am7" and "Bb" are chords and "Hmin" and "Am7b5b9" are
 * not. The major triad's suffix is empty, which is why the quality group can
 * match nothing at all.
 */
export function chordNamePattern(): string {
  const roots = ROOT_NAMES.map(escapeRegExp).join("|");
  const qualities = CHORD_SUFFIXES.filter((s) => s.length > 0)
    .map(escapeRegExp)
    .join("|");
  return `^(?:${roots})(?:${qualities})?$`;
}

// ---------------------------------------------------------------------------
// JSON Schema
// ---------------------------------------------------------------------------

type JsonObject = Record<string, unknown>;

function jsonSchemaForType(type: FieldType, defs: JsonObject): JsonObject {
  switch (type.kind) {
    case "enum":
      return { type: "string", enum: [...type.values] };
    case "sentence":
      return { type: "string", minLength: 1, maxLength: type.maxLength };
    case "id":
      return { type: "string", minLength: 1, maxLength: type.maxLength };
    case "chordName":
      return { $ref: "#/$defs/chordName" };
    case "integer":
      return { type: "integer", minimum: type.min, maximum: type.max };
    case "tuple":
      return {
        type: "array",
        minItems: type.length,
        maxItems: type.length,
        items: jsonSchemaForType(type.of, defs),
      };
    case "union":
      return {
        oneOf: type.variants.map((variant) =>
          jsonSchemaForObject(
            [
              {
                name: type.tag,
                type: { kind: "enum", values: [variant.name] },
                note: variant.note,
              },
              ...variant.fields,
            ],
            defs,
          ),
        ),
      };
  }
}

function jsonSchemaForObject(fields: readonly Field[], defs: JsonObject): JsonObject {
  const properties: JsonObject = {};
  const required: string[] = [];
  for (const field of fields) {
    properties[field.name] = { ...jsonSchemaForType(field.type, defs), description: field.note };
    if (!field.optional) required.push(field.name);
  }
  return { type: "object", additionalProperties: false, required, properties };
}

/**
 * The whole catalogue as a JSON Schema, draft 2020-12.
 *
 * One `$def` per block so a reader can find "what is a chordShape" without
 * counting braces, and `additionalProperties: false` everywhere so a model
 * that invents a field is refused rather than quietly trimmed.
 */
export function buildJsonSchema(catalogue: CatalogueSpec = CATALOGUE): JsonObject {
  const defs: JsonObject = {
    chordName: {
      type: "string",
      description: "A chord as a musician writes it: a root, then a quality.",
      pattern: chordNamePattern(),
      maxLength: 12,
    },
  };

  for (const block of catalogue.blocks) {
    defs[`block-${block.type}`] = {
      description: block.note,
      ...jsonSchemaForObject(
        [
          { name: "type", type: { kind: "enum", values: [block.type] }, note: "Which block." },
          ...block.fields,
        ],
        defs,
      ),
    };
  }

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://yames.app/schemas/coach-answer.v1.schema.json",
    title: "CoachAnswer",
    description:
      "What the coach answers with: a short list of blocks from a fixed catalogue. " +
      "Blocks carry references — a chord by name, a scale by root and name, bars by " +
      "score and range — never frets, note lists or colours.",
    type: "object",
    additionalProperties: false,
    required: ["blocks"],
    properties: {
      blocks: {
        type: "array",
        minItems: 1,
        maxItems: catalogue.maxBlocks,
        items: { oneOf: catalogue.blocks.map((block) => ({ $ref: `#/$defs/block-${block.type}` })) },
      },
    },
    $defs: defs,
  };
}

/** The schema as it is written to disk: two-space JSON, one trailing newline. */
export function jsonSchemaText(catalogue: CatalogueSpec = CATALOGUE): string {
  return `${JSON.stringify(buildJsonSchema(catalogue), null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// GBNF
// ---------------------------------------------------------------------------

/** A GBNF string literal: the text, with quotes and backslashes escaped. */
function lit(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** The JSON key `"name":`, with the whitespace either side of the colon. */
function key(name: string): string {
  return `${lit(`"${name}"`)} ws ${lit(":")} ws`;
}

/** A name for the rule that carries this integer range. */
function intRuleName(min: number, max: number): string {
  return `int-${min}-${max}`;
}

/**
 * An integer range as a grammar rule.
 *
 * A short range is spelled out, which makes it exact. A long one becomes a
 * digit pattern of the right length, which is as close as a grammar gets —
 * `resolve.ts` is what refuses 1000 bars in a 40-bar song.
 */
function intRuleBody(min: number, max: number): string {
  if (max - min + 1 <= 32) {
    const values: string[] = [];
    for (let value = min; value <= max; value++) values.push(lit(String(value)));
    return values.join(" | ");
  }
  const shortest = String(Math.max(min, 1)).length;
  const longest = String(max).length;
  const tail = `[0-9]{${shortest - 1},${longest - 1}}`;
  return min <= 0 ? `${lit("0")} | [1-9] ${tail}` : `[1-9] ${tail}`;
}

type Rules = { order: string[]; body: Map<string, string> };

function addRule(rules: Rules, name: string, body: string): string {
  if (!rules.body.has(name)) {
    rules.body.set(name, body);
    rules.order.push(name);
  }
  return name;
}

function gbnfForType(type: FieldType, path: string, rules: Rules): string {
  switch (type.kind) {
    case "enum":
      return addRule(
        rules,
        `${path}-value`,
        type.values.map((value) => lit(`"${value}"`)).join(" | "),
      );
    case "sentence":
      return addRule(
        rules,
        `sentence-${type.maxLength}`,
        `${lit('"')} sentence-char{1,${type.maxLength}} ${lit('"')}`,
      );
    case "id":
      return addRule(
        rules,
        `id-${type.maxLength}`,
        `${lit('"')} [A-Za-z0-9_.:-]{1,${type.maxLength}} ${lit('"')}`,
      );
    case "chordName":
      return "chord-name";
    case "integer": {
      const name = intRuleName(type.min, type.max);
      return addRule(rules, name, intRuleBody(type.min, type.max));
    }
    case "tuple": {
      const inner = gbnfForType(type.of, path, rules);
      const items = Array.from({ length: type.length }, () => inner).join(` ws ${lit(",")} ws `);
      return addRule(rules, `${path}-list`, `${lit("[")} ws ${items} ws ${lit("]")}`);
    }
    case "union": {
      const variants = type.variants.map((variant) =>
        addRule(
          rules,
          `${path}-${ruleName(variant.name)}`,
          gbnfForObject(
            [
              {
                name: type.tag,
                type: { kind: "enum", values: [variant.name] },
                note: variant.note,
              },
              ...variant.fields,
            ],
            `${path}-${ruleName(variant.name)}`,
            rules,
          ),
        ),
      );
      return addRule(rules, path, variants.join(" | "));
    }
  }
}

/**
 * An object, with its fields in the catalogue's order.
 *
 * A fixed order is what keeps the grammar small: with the fields in any
 * order the rule has to hold every permutation, and an eight-field block is
 * forty thousand of them. A model held to a grammar writes the order the
 * grammar gives, so nothing is lost.
 */
function gbnfForObject(fields: readonly Field[], path: string, rules: Rules): string {
  const parts: string[] = [lit("{"), "ws"];
  fields.forEach((field, index) => {
    const value = gbnfForType(field.type, `${path}-${ruleName(field.name)}`, rules);
    const separator = index === 0 ? "" : `${lit(",")} ws `;
    const piece = `${separator}${key(field.name)} ${value} ws`;
    parts.push(field.optional ? `(${piece})?` : piece);
  });
  parts.push(lit("}"));
  return parts.join(" ");
}

/**
 * The whole catalogue as a llama.cpp grammar.
 *
 * Handed to the local model so it cannot answer with anything but a block.
 * The comment at the top is for whoever opens the file looking for the place
 * to edit it — which is not this file either, it is `spec.ts`.
 */
export function buildGbnf(catalogue: CatalogueSpec = CATALOGUE): string {
  const rules: Rules = { order: [], body: new Map() };

  const blockRules = catalogue.blocks.map((block) =>
    addRule(
      rules,
      `block-${ruleName(block.type)}`,
      gbnfForObject(
        [
          { name: "type", type: { kind: "enum", values: [block.type] }, note: block.note },
          ...block.fields,
        ],
        `block-${ruleName(block.type)}`,
        rules,
      ),
    ),
  );

  const repeats = catalogue.maxBlocks - 1;
  const head = [
    "# The coach's answer, as llama.cpp is held to it.",
    "#",
    "# GENERATED from src/coach/blocks/spec.ts by scripts/coach-blocks.mjs.",
    "# Edit the spec, run `node scripts/coach-blocks.mjs`, and commit both.",
    "# `npm run test` fails while this file and the spec disagree.",
    "",
    `root ::= answer`,
    `answer ::= ${lit("{")} ws ${key("blocks")} blocks ws ${lit("}")}`,
    `blocks ::= ${lit("[")} ws block (ws ${lit(",")} ws block){0,${repeats}} ws ${lit("]")}`,
    `block ::= ${blockRules.join(" | ")}`,
    "",
  ];

  const body = rules.order.map((name) => `${name} ::= ${rules.body.get(name) ?? ""}`);

  const terminals = [
    "",
    "# Terminals.",
    `chord-name ::= ${lit('"')} chord-root chord-quality? ${lit('"')}`,
    `chord-root ::= ${ROOT_NAMES.map(lit).join(" | ")}`,
    `chord-quality ::= ${CHORD_SUFFIXES.filter((s) => s.length > 0)
      .map(lit)
      .join(" | ")}`,
    "sentence-char ::= [^\"\\\\\\r\\n]",
    "ws ::= [ \\t\\n]*",
  ];

  return `${[...head, ...body, ...terminals].join("\n")}\n`;
}
