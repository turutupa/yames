/**
 * Pack text in other languages: the keys, the English fallback per string, the
 * stale and outdated checks, and that every overlay checked in passes them.
 */
import { describe, expect, it } from "vitest";
import type { PathDoc } from "./format";
import {
  checkOverlay,
  englishStrings,
  extractStrings,
  localizePack,
  mergeTranslations,
  readOverlay,
  serializeOverlay,
  sourceHash,
  stringsToTranslate,
} from "./strings";
import type { StringsOverlay } from "./strings";

const PACKS = import.meta.glob("./packs/*.json", { eager: true, import: "default" }) as Record<string, PathDoc>;
const ENGLISH = import.meta.glob("./packs/i18n/en/*.json", { eager: true, import: "default" }) as Record<
  string,
  unknown
>;
const OVERLAYS = import.meta.glob(["./packs/i18n/*/*.json", "!./packs/i18n/en/*.json"], {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

const ALT = PACKS["./packs/alternate-picking.json"];
const step = ALT.steps[0];
const exercise = step.exercises[0];

function overlay(strings: Record<string, string>, from?: Record<string, string>): StringsOverlay {
  const english = extractStrings(ALT);
  return {
    version: 1,
    path: ALT.id,
    lng: "xx",
    strings,
    from: from ?? Object.fromEntries(Object.keys(strings).map((k) => [k, sourceHash(english[k] ?? "")])),
  };
}

describe("the keys", () => {
  it("are stable ids and field names, every player-facing field included", () => {
    const keys = Object.keys(extractStrings(ALT));
    expect(keys[0]).toBe("path.title");
    expect(keys).toContain(`step.${step.id}.why`);
    expect(keys).toContain(`step.${step.id}.howTo.0`);
    expect(keys).toContain(`step.${step.id}.payoff`);
    expect(keys).toContain(`exercise.${exercise.id}.title`);
    expect(keys).toContain(`exercise.${exercise.id}.coachLine`);
    const flagged = ALT.steps.flatMap((s) => s.exercises).find((e) => e.detection.notes.length > 0)!;
    expect(keys).toContain(`exercise.${flagged.id}.detection.0`);
    expect(keys).toContain("level.beginner.startHereIf.0");
    expect(keys).toContain(`exercise.${ALT.levels![0].warmups[0].id}.title`);
    expect(keys).toContain("path.gradingLimits");
  });

  it("leave ids, tab and notes out", () => {
    const values = Object.values(extractStrings(ALT));
    expect(values).not.toContain(exercise.tab);
    expect(values).not.toContain(exercise.id);
  });
});

describe("localizePack", () => {
  it("replaces the text it has, and leaves everything else English", () => {
    const doc = localizePack(
      ALT,
      overlay({ [`step.${step.id}.title`]: "Schritt eins", [`exercise.${exercise.id}.howTo.0`]: "Zupfe" }),
    );
    expect(doc.steps[0].title).toBe("Schritt eins");
    expect(doc.steps[0].exercises[0].howTo[0]).toBe("Zupfe");
    expect(doc.steps[0].why).toBe(step.why);
    expect(doc.title).toBe(ALT.title);
  });

  it("never touches notes, ids, grading or the source pack", () => {
    const doc = localizePack(ALT, overlay({ [`exercise.${exercise.id}.title`]: "X" }));
    const ex = doc.steps[0].exercises[0];
    expect(ex.notes).toBe(exercise.notes);
    expect(ex.passBars).toBe(exercise.passBars);
    expect(ex.variation).toBe(exercise.variation);
    expect(ex.id).toBe(exercise.id);
    expect(exercise.title).not.toBe("X");
    const strip = (d: PathDoc) => JSON.stringify(englishStrings(d).strings);
    expect(Object.keys(JSON.parse(strip(doc)))).toEqual(Object.keys(JSON.parse(strip(ALT))));
  });

  it("falls back to English when the English changed since the translation", () => {
    const key = `step.${step.id}.title`;
    const doc = localizePack(ALT, overlay({ [key]: "Alt" }, { [key]: sourceHash("an older sentence") }));
    expect(doc.steps[0].title).toBe(step.title);
  });

  it("is the pack itself with no overlay, or one for another Path", () => {
    expect(localizePack(ALT, null)).toBe(ALT);
    expect(localizePack(ALT, { ...overlay({}), path: "shred" })).toBe(ALT);
  });
});

describe("checkOverlay", () => {
  const english = extractStrings(ALT);

  it("finds stale keys, missing, outdated and changed placeholders", () => {
    const key = `step.${step.id}.title`;
    const o = overlay({ [key]: "Eins", "step.gone.title": "Weg" });
    o.from[`exercise.${exercise.id}.title`] = "deadbeef";
    o.strings[`exercise.${exercise.id}.title`] = "Veraltet";
    const r = checkOverlay(english, o);
    expect(r.stale).toEqual(["step.gone.title"]);
    expect(r.outdated).toEqual([`exercise.${exercise.id}.title`]);
    expect(r.translated).toBe(1);
    expect(r.missing.length).toBe(Object.keys(english).length - 2);
  });

  it("refuses a lost placeholder and warns on a changed number", () => {
    const en = { a: "Play {{bpm}} BPM", b: "At 80 BPM" };
    const o: StringsOverlay = {
      version: 1,
      path: "p",
      lng: "de",
      strings: { a: "Spiele BPM", b: "Bei 90 BPM" },
      from: { a: sourceHash(en.a), b: sourceHash(en.b) },
    };
    const r = checkOverlay(en, o);
    expect(r.placeholders).toEqual(["a"]);
    expect(r.numbers).toEqual(["b"]);
  });
});

describe("todo and merge", () => {
  it("merges stamped, fills repeated English once, refuses unknown keys", () => {
    const en = { a: "Same", b: "Same", c: "Other" };
    const { overlay: o, refused } = mergeTranslations(en, null, "p", "de", { a: "Gleich", zzz: "x" });
    expect(refused).toEqual(["zzz"]);
    expect(o.strings).toEqual({ a: "Gleich", b: "Gleich" });
    expect(o.from.a).toBe(sourceHash("Same"));
    expect(stringsToTranslate(en, o)).toEqual({ c: "Other" });
    expect(readOverlay(JSON.parse(serializeOverlay(o)))).toEqual(o);
  });
});

describe("the overlays checked in", () => {
  it("each English file is what its pack says (run: npm run paths -- strings)", () => {
    for (const doc of Object.values(PACKS)) {
      expect(ENGLISH[`./packs/i18n/en/${doc.id}.json`], doc.id).toEqual(englishStrings(doc));
    }
  });

  it("have no stale keys and keep every placeholder", () => {
    expect(Object.keys(OVERLAYS).length).toBeGreaterThan(0);
    for (const [file, raw] of Object.entries(OVERLAYS)) {
      const o = readOverlay(raw);
      expect(o, file).not.toBeNull();
      const [, lng, pathId] = file.match(/i18n\/([^/]+)\/([^/]+)\.json$/)!;
      expect(o!.lng, file).toBe(lng);
      expect(o!.path, file).toBe(pathId);
      const doc = PACKS[`./packs/${pathId}.json`];
      expect(doc, file).toBeDefined();
      const r = checkOverlay(extractStrings(doc), o!);
      expect(r.stale, file).toEqual([]);
      expect(r.placeholders, file).toEqual([]);
    }
  });
});
