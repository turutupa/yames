/**
 * The TypeScript mirrors against the Rust they mirror.
 *
 * `findings.rs` and `pitch.rs` are the coach's judgement and its ears, and
 * both are read on this side as JSON. W6 pins the wire format from Rust
 * (`a_finding_goes_over_the_wire_in_camel_case`, `every_fix_is_a_tagged_
 * object`); nothing pinned the other half, so a variant added to
 * `FindingKind` or a field added to `Evidence` would come over the wire and
 * land in a type that does not have it — which TypeScript cannot see,
 * because JSON is `any` until somebody asserts otherwise.
 *
 * So this reads the Rust and compares the names. It is the same gate
 * `src/coach/blocks/spec.test.ts` puts on the block catalogue, and it fails
 * on the side that forgot rather than in front of a player.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Evidence, Finding, FindingKind, Fix, NoteState, NoteVerdict } from "./types";

const root = process.cwd();
const findingsRs = fs.readFileSync(path.join(root, "src-tauri/src/findings.rs"), "utf8");
const pitchRs = fs.readFileSync(path.join(root, "src-tauri/src/pitch.rs"), "utf8");

/** The body of `pub enum <name> { … }` / `pub struct <name> { … }`. */
function body(source: string, kind: "enum" | "struct", name: string): string {
  const head = source.indexOf(`pub ${kind} ${name} {`);
  expect(head, `no ${kind} ${name}`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = source.indexOf("{", head); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) {
      return source.slice(source.indexOf("{", head) + 1, i);
    }
  }
  throw new Error(`${name} never closes`);
}

/** Lines with the comments and the attributes taken out. */
function code(block: string): string[] {
  return block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !l.startsWith("#["));
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const camel = (s: string) => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

/** `Variant,` / `Variant {` at the top level of an enum, as serde renames it. */
function variants(source: string, name: string): string[] {
  const out: string[] = [];
  let depth = 0;
  for (const line of code(body(source, "enum", name))) {
    if (depth === 0) {
      const m = /^([A-Z][A-Za-z0-9]*)\s*(,|\{|$)/.exec(line);
      if (m) out.push(lower(m[1]));
    }
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
  }
  return out.sort();
}

/** `pub name: Type,` at the top level of a struct, as serde renames it. */
function fields(source: string, name: string): string[] {
  return code(body(source, "struct", name))
    .flatMap((line) => {
      const m = /^pub ([a-z0-9_]+)\s*:/.exec(line);
      return m ? [camel(m[1])] : [];
    })
    .sort();
}

/**
 * Every name the TypeScript has, written out so the compiler is part of the
 * gate: a `Record` keyed by the union does not compile when the union grows,
 * and `keyof` a type does not compile when a field is renamed.
 */
const TS_FINDING_KINDS: Record<FindingKind, true> = {
  consistentMiss: true,
  rushing: true,
  dragging: true,
  afterShift: true,
  fallsApart: true,
  extras: true,
  uneven: true,
  beatPositionBias: true,
  subdivisionWeak: true,
  drift: true,
  tempoCeiling: true,
  improved: true,
  clean: true,
};

const TS_FIX_TAGS: Record<Fix["type"], true> = {
  loopBars: true,
  ramp: true,
  clickSubdivision: true,
  comeBack: true,
};

const TS_NOTE_STATES: Record<NoteState, true> = {
  right: true,
  wrong: true,
  octave: true,
  unheard: true,
  notAssessed: true,
};

const TS_EVIDENCE: readonly (keyof Evidence)[] = [
  "onsets",
  "hits",
  "hitRate",
  "meanDeviationMs",
  "deviationBeats",
  "spreadMs",
  "passes",
  "passesAffected",
  "referenceBpm",
  "printedBars",
  "subdivision",
  "beatPosition",
  "subdivisionPosition",
  "bpmBand",
  "extras",
  "hitRateDelta",
  "spreadDeltaMs",
];

const TS_FINDING: readonly (keyof Finding)[] = [
  "kind",
  "bars",
  "noteIds",
  "severity",
  "evidence",
  "fix",
];

const TS_NOTE_VERDICT: readonly (keyof NoteVerdict)[] = [
  "noteId",
  "onsetId",
  "expectedMidi",
  "heardMidi",
  "centsOff",
  "state",
  "confidence",
];

describe("the judgement's wire format", () => {
  it("knows every kind of finding the rules can produce", () => {
    expect(variants(findingsRs, "FindingKind")).toEqual(
      Object.keys(TS_FINDING_KINDS).sort(),
    );
  });

  it("knows every fix the coach can offer", () => {
    expect(variants(findingsRs, "Fix")).toEqual(Object.keys(TS_FIX_TAGS).sort());
  });

  it("names every field of a finding", () => {
    expect(fields(findingsRs, "Finding")).toEqual([...TS_FINDING].sort());
  });

  it("names every number a sentence can be built from", () => {
    expect(fields(findingsRs, "Evidence")).toEqual([...TS_EVIDENCE].sort());
  });
});

describe("the tracker's wire format", () => {
  it("knows every verdict a note can get", () => {
    expect(variants(pitchRs, "NoteState")).toEqual(Object.keys(TS_NOTE_STATES).sort());
  });

  it("names every field of one", () => {
    expect(fields(pitchRs, "NoteVerdict")).toEqual([...TS_NOTE_VERDICT].sort());
  });
});

describe("the shapes W6 pinned from the other side", () => {
  /**
   * The exact value `a_finding_goes_over_the_wire_in_camel_case` builds and
   * asserts on, written here as a `Finding`. If the Rust test's expectations
   * and this disagree, one of them is wrong about what crosses the wire.
   */
  it("reads the finding the Rust test serialises", () => {
    const finding: Finding = {
      kind: "consistentMiss",
      bars: [3, 4],
      noteIds: [12, 13],
      severity: 0.8,
      evidence: {
        onsets: 6,
        hits: 0,
        hitRate: 0,
        meanDeviationMs: 0,
        deviationBeats: 0,
        spreadMs: 0,
        passes: 3,
        passesAffected: 3,
        printedBars: [4, 5],
      },
      fix: { type: "loopBars", start: 3, end: 4, tempoPercent: 80 },
    };
    expect(finding.evidence.bpmBand).toBeUndefined();
    expect(finding.evidence.subdivision).toBeUndefined();
    expect(finding.fix?.type).toBe("loopBars");
  });

  it("reads every tagged fix", () => {
    const fixes: Fix[] = [
      { type: "loopBars", start: 1, end: 2, tempoPercent: 80 },
      { type: "ramp", start: null, end: null, fromPercent: 80, toPercent: 100 },
      { type: "clickSubdivision", start: 1, end: 2, subdivision: 4 },
      { type: "comeBack", days: 2 },
    ];
    expect(fixes.map((f) => f.type)).toEqual(Object.keys(TS_FIX_TAGS));
  });
});
