/**
 * Is this the shape of a block at all?
 *
 * The first of the two gates an answer passes. This one asks only about
 * shape — the right type, the right fields, the right kinds of value — and it
 * reads the catalogue in `spec.ts` to do it, so it can never disagree with
 * the JSON Schema or the grammar about what a block may contain.
 *
 * The second gate is `resolve.ts`, which asks whether the references mean
 * anything: is "Am7" a chord, is shape 40 a shape it has, is bar 300 in the
 * song. Shape first because it is cheap and because a value that is not a
 * string cannot be looked up as one.
 *
 * ## Two small kindnesses, and one deliberate severity
 *
 * A model writing JSON puts `null` where it means "nothing", and it writes
 * numbers as numbers or as digits in a string. Both are accepted for a field
 * the catalogue allows to be missing, and for an integer, because refusing
 * them would throw away a block that is right about everything a player can
 * see.
 *
 * A field the catalogue does not list is refused, and the whole block with
 * it. That is not fussiness: the catalogue exists so a model cannot write
 * content (D3 rule 1), and an extra field is exactly what writing content
 * looks like.
 */

import { CATALOGUE, type BlockSpec, type Field, type FieldType } from "./spec";
import { chordNamePattern } from "./schema";
import type { CoachBlock } from "./types";

/** Why a block did not survive the first gate. */
export type ShapeProblem = { reason: "unknownType" | "notAnObject" | "badField"; detail: string };

export type ShapeResult =
  | { ok: true; block: CoachBlock }
  | { ok: false; type: string | null; problem: ShapeProblem };

const CHORD_NAME = new RegExp(chordNamePattern());

const SPEC_BY_TYPE = new Map<string, BlockSpec>(
  CATALOGUE.blocks.map((block) => [block.type, block]),
);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A whole number, written as one or spelled out in digits. */
function asInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

type Checked = { ok: true; value: unknown } | { ok: false; detail: string };

function checkType(type: FieldType, value: unknown, where: string): Checked {
  switch (type.kind) {
    case "enum":
      return typeof value === "string" && type.values.includes(value)
        ? { ok: true, value }
        : { ok: false, detail: `${where} is not one of ${type.values.join(", ")}` };

    case "sentence": {
      if (typeof value !== "string") return { ok: false, detail: `${where} is not a sentence` };
      const text = value.trim();
      if (text.length === 0) return { ok: false, detail: `${where} is empty` };
      if (text.length > type.maxLength)
        return { ok: false, detail: `${where} is ${text.length} characters, over ${type.maxLength}` };
      return { ok: true, value: text };
    }

    case "id": {
      if (typeof value !== "string") return { ok: false, detail: `${where} is not an id` };
      const id = value.trim();
      if (id.length === 0 || id.length > type.maxLength)
        return { ok: false, detail: `${where} is not an id of 1 to ${type.maxLength} characters` };
      return { ok: true, value: id };
    }

    case "chordName": {
      if (typeof value !== "string") return { ok: false, detail: `${where} is not a chord name` };
      const name = value.trim();
      return CHORD_NAME.test(name)
        ? { ok: true, value: name }
        : { ok: false, detail: `${where} is not a chord this app writes: "${name}"` };
    }

    case "integer": {
      const number = asInteger(value);
      if (number === null) return { ok: false, detail: `${where} is not a whole number` };
      if (number < type.min || number > type.max)
        return { ok: false, detail: `${where} is ${number}, outside ${type.min} to ${type.max}` };
      return { ok: true, value: number };
    }

    case "tuple": {
      if (!Array.isArray(value) || value.length !== type.length)
        return { ok: false, detail: `${where} is not a list of ${type.length}` };
      const items: unknown[] = [];
      for (const [index, item] of value.entries()) {
        const checked = checkType(type.of, item, `${where}[${index}]`);
        if (!checked.ok) return checked;
        items.push(checked.value);
      }
      return { ok: true, value: items };
    }

    case "union": {
      if (!isPlainObject(value)) return { ok: false, detail: `${where} is not an object` };
      const tag = value[type.tag];
      const variant = type.variants.find((candidate) => candidate.name === tag);
      if (!variant)
        return {
          ok: false,
          detail: `${where}.${type.tag} is not one of ${type.variants
            .map((v) => v.name)
            .join(", ")}`,
        };
      return checkObject(
        [
          { name: type.tag, type: { kind: "enum", values: [variant.name] }, note: variant.note },
          ...variant.fields,
        ],
        value,
        where,
      );
    }
  }
}

function checkObject(fields: readonly Field[], value: Record<string, unknown>, where: string): Checked {
  const known = new Set(fields.map((field) => field.name));
  for (const name of Object.keys(value)) {
    if (!known.has(name)) return { ok: false, detail: `${where} carries a "${name}" it should not` };
  }

  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = value[field.name];
    // A model writes `null` where it means "nothing". For a field that may be
    // missing, that is what it means.
    const missing = raw === undefined || raw === null;
    if (missing) {
      if (field.optional) continue;
      return { ok: false, detail: `${where} has no ${field.name}` };
    }
    const checked = checkType(field.type, raw, `${where}.${field.name}`);
    if (!checked.ok) return checked;
    out[field.name] = checked.value;
  }
  return { ok: true, value: out };
}

/**
 * One value out of an answer, as a block or as the reason it is not one.
 *
 * The cast at the end is the one place the data-driven checker and the
 * hand-written union in `types.ts` meet. `spec.test.ts` walks both and fails
 * when they name different blocks or different fields, which is what makes
 * the cast safe rather than hopeful.
 */
export function checkBlockShape(value: unknown, where = "the block"): ShapeResult {
  if (!isPlainObject(value))
    return { ok: false, type: null, problem: { reason: "notAnObject", detail: `${where} is not an object` } };

  const type = value.type;
  if (typeof type !== "string" || !SPEC_BY_TYPE.has(type))
    return {
      ok: false,
      type: typeof type === "string" ? type : null,
      problem: { reason: "unknownType", detail: `${where} is a "${String(type)}", which is not a block` },
    };

  const spec = SPEC_BY_TYPE.get(type) as BlockSpec;
  const checked = checkObject(
    [{ name: "type", type: { kind: "enum", values: [type] }, note: spec.note }, ...spec.fields],
    value,
    where,
  );
  if (!checked.ok) return { ok: false, type, problem: { reason: "badField", detail: checked.detail } };
  return { ok: true, block: checked.value as CoachBlock };
}
