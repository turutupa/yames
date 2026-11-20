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
import { MINIMAL_SPEC, VARIANT_TEXT_SPEC } from "./fixtures/minimal";
import { buildPath } from "./generate";
import { exerciseWithVariant } from "./variants";

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

describe("cues", () => {
  const cued: PathDoc = JSON.parse(JSON.stringify(ALT));
  const ex = cued.steps[0].exercises[0];
  ex.cues = [
    { when: "even", say: "Count every eighth out loud.", general: true },
    { when: "late", say: "Put the open B right on the click.", more: 0 },
  ];

  it("are keyed by position, `exercise.<id>.cue.<n>`, right after the coach line, and only `say` is text", () => {
    const keys = Object.keys(extractStrings(cued));
    const at = keys.indexOf(`exercise.${ex.id}.coachLine`);
    expect(keys.slice(at + 1, at + 3)).toEqual([`exercise.${ex.id}.cue.0`, `exercise.${ex.id}.cue.1`]);
    const o: StringsOverlay = {
      version: 1,
      path: cued.id,
      lng: "de",
      strings: { [`exercise.${ex.id}.cue.1`]: "Die leere B-Saite genau auf den Klick." },
      from: { [`exercise.${ex.id}.cue.1`]: sourceHash("Put the open B right on the click.") },
    };
    const local = localizePack(cued, o).steps[0].exercises[0];
    expect(local.cues).toEqual([ex.cues![0], { when: "late", say: "Die leere B-Saite genau auf den Klick.", more: 0 }]);
  });

  it("over 48 characters in a language is an error for `check`, counted in characters, not bytes", () => {
    const en = extractStrings(cued);
    const key = `exercise.${ex.id}.cue.0`;
    const long = "Zähle jede Achtel laut mit und bleib dabei ganz ruhig.";
    const fits = "每个八分音符都大声数出来，一直数到最后一个音为止，不要停下来。";
    const o: StringsOverlay = { version: 1, path: cued.id, lng: "de", strings: { [key]: long }, from: { [key]: sourceHash(en[key]) } };
    expect(checkOverlay(en, o).long).toEqual([key]);
    expect(checkOverlay(en, { ...o, strings: { [key]: fits } }).long).toEqual([]);
    // A coach line is not a cue: its length is not this check's business.
    const line = `exercise.${ex.id}.coachLine`;
    expect(checkOverlay(en, { ...o, strings: { [line]: long + long }, from: { [line]: sourceHash(en[line]) } }).long).toEqual([]);
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

describe("a variant's own text", () => {
  const doc = buildPath(VARIANT_TEXT_SPEC);
  const warm = doc.levels![0].warmups[0];
  const english = extractStrings(doc);
  const k = (variantId: string, field: string) => `exercise.${warm.id}.variant.${variantId}.${field}`;

  it("has stable keys: the Exercise id, the variant id, the field", () => {
    expect(english[k("key=2", "purpose")]).toBe("A purpose of its own for the line moved up 2 frets.");
    expect(english[k("key=2", "howTo.0")]).toBe("Play it evenly.");
    expect(english[k("key=9", "howTo.1")]).toBe("Start at fret 12.");
    // The first variant reads the Exercise's text, so it has no keys of its own.
    expect(Object.keys(english).filter((key) => key.includes(".variant.key=0."))).toEqual([]);
    // After the Exercise's own strings, in variant order.
    const keys = Object.keys(english);
    expect(keys.indexOf(k("key=2", "purpose"))).toBeGreaterThan(keys.indexOf(`exercise.${warm.id}.coachLine`));
    expect(keys.indexOf(k("key=3", "purpose"))).toBeGreaterThan(keys.indexOf(k("key=2", "howTo.1")));
    // A pack with no variant text has exactly the keys it had before.
    const plain = Object.keys(extractStrings(buildPath(MINIMAL_SPEC)));
    expect(keys.filter((key) => !key.includes(".variant."))).toEqual(plain);
  });

  it("round-trips through an overlay file, todo and merge included", () => {
    const todo = stringsToTranslate(english, null);
    expect(todo[k("key=5", "howTo.1")]).toBe("Start at fret 8.");
    const translated = Object.fromEntries(
      Object.entries(todo)
        .filter(([key]) => key.includes(".variant."))
        .map(([key, text]) => [key, `[xx] ${text}`]),
    );
    const merged = mergeTranslations(english, null, doc.id, "xx", translated);
    expect(merged.refused).toEqual([]);
    // As bytes and back: what the app reads is what merge wrote.
    const overlay = readOverlay(JSON.parse(serializeOverlay(merged.overlay)))!;
    expect(overlay.strings[k("key=2", "purpose")]).toBe("[xx] A purpose of its own for the line moved up 2 frets.");
    const report = checkOverlay(english, overlay);
    expect(report.stale).toEqual([]);
    expect(report.outdated).toEqual([]);
    expect(Object.keys(stringsToTranslate(english, overlay)).some((key) => key.includes(".variant."))).toBe(false);

    const localized = localizePack(doc, overlay);
    const variants = localized.levels![0].warmups[0].variation!.variants;
    expect(variants[1].purpose).toBe("[xx] A purpose of its own for the line moved up 2 frets.");
    expect(variants[5].howTo).toEqual(["[xx] Play it evenly.", "[xx] Start at fret 12."]);
    // Notes and ids are the pack's own, and the pack is not written to.
    expect(variants[1].notes).toBe(warm.variation!.variants[1].notes);
    expect(variants[1].id).toBe("key=2");
    expect(variants[0]).toBe(warm.variation!.variants[0]);
    expect(warm.variation!.variants[1].purpose).toBe("A purpose of its own for the line moved up 2 frets.");
    // What a Take is handed: the variant's words, in the language on screen.
    const take = exerciseWithVariant(localized.levels![0].warmups[0], variants[1]);
    expect(take.howTo).toEqual(["[xx] Play it evenly.", "[xx] Start at fret 5."]);
    // Extraction of the localized pack gives the same keys: the walk is one walk.
    expect(Object.keys(extractStrings(localized))).toEqual(Object.keys(english));
  });

  it("shows the English when a variant's English changed, and counts it outdated", () => {
    const key = k("key=3", "howTo.1");
    const overlay: StringsOverlay = {
      version: 1,
      path: doc.id,
      lng: "xx",
      strings: { [key]: "Alt" },
      from: { [key]: sourceHash("Start at fret 7.") },
    };
    expect(localizePack(doc, overlay).levels![0].warmups[0].variation!.variants[2].howTo![1]).toBe("Start at fret 6.");
    expect(checkOverlay(english, overlay).outdated).toEqual([key]);
    expect(stringsToTranslate(english, overlay)[key]).toBe("Start at fret 6.");
  });

  it("calls a key for a variant that has no text stale, and merge refuses it", () => {
    const gone = k("key=0", "purpose");
    const overlay: StringsOverlay = { version: 1, path: doc.id, lng: "xx", strings: { [gone]: "Weg" }, from: { [gone]: "deadbeef" } };
    expect(checkOverlay(english, overlay).stale).toEqual([gone]);
    expect(mergeTranslations(english, null, doc.id, "xx", { [gone]: "Weg" }).refused).toEqual([gone]);
  });

  it("takes a variant id as it is: '=', ',', ':', '#' and '.' in a key", () => {
    const odd: PathDoc = JSON.parse(JSON.stringify(doc));
    const id = "stringSet=top-E:-12.5,key=F#-minor";
    odd.levels![0].warmups[0].variation!.variants[1].id = id;
    const strings = extractStrings(odd);
    expect(strings[k(id, "howTo.1")]).toBe("Start at fret 5.");
    const merged = mergeTranslations(strings, null, odd.id, "xx", { [k(id, "howTo.1")]: "Ab Bund 5." });
    const overlay = readOverlay(JSON.parse(serializeOverlay(merged.overlay)))!;
    expect(localizePack(odd, overlay).levels![0].warmups[0].variation!.variants[1].howTo![1]).toBe("Ab Bund 5.");
    expect(checkOverlay(strings, overlay).stale).toEqual([]);
  });

  it("shares a variation that has no text of its own", () => {
    const plain = buildPath(MINIMAL_SPEC);
    const localized = localizePack(plain, { version: 1, path: plain.id, lng: "xx", strings: {}, from: {} });
    expect(localized.levels![0].warmups[0].variation).toBe(plain.levels![0].warmups[0].variation);
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
