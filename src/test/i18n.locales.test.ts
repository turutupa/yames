// Guards the "directory = language, file = namespace" contract:
//   - every directory in src/locales/ is a supported language
//   - each language carries the same set of namespace files
//   - no top-level group is claimed by two namespaces (the loader merges
//     namespaces shallowly, so a clash would resolve by glob order)
//   - each language declares a "_name" (native name, used by the picker)
//   - every language has exactly the keys of English (no missing, no extra),
//     counting a plural variant as its base key: Polish and Russian need
//     `_few` and `_many` for a key English writes twice, and those extra
//     forms are the language being right, not the file drifting
//   - every {{placeholder}} token used in English appears in each language too
//
// What a key SAYS is `i18n.songs-wave.test.ts`'s job: this file passes just
// as happily when every value is still the English sentence.
//
// The namespaces exist so that work on four screens touches four files rather
// than one. They are not part of the key space: `t("drill.mode")` is
// `drill.mode` wherever it is stored, and moving a group between namespace
// files must change nothing a caller can see.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Vitest runs from the project root (no `root` override in vitest.config.ts).
const LOCALES_DIR = path.resolve(process.cwd(), "src/locales");

const NAMESPACES = [
  "coach",
  // The coach's blocks (COACH_UX D3) get their own file rather than joining
  // `coach`: the renderer is one component with one vocabulary, and a whole
  // screen's strings arriving in the file the coach card already uses is how
  // two people editing two features end up in one diff.
  "coachBlocks",
  "common",
  "drill",
  "jam",
  "metronome",
  "onboarding",
  "setlist",
  "settings",
  "shell",
  "songs",
  "zen",
];

function languages(): string[] {
  return fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function namespaceFiles(lang: string): string[] {
  return fs
    .readdirSync(path.join(LOCALES_DIR, lang))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

function loadNamespace(lang: string, ns: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, lang, `${ns}.json`), "utf8"));
}

/** One language's namespaces merged the way the loader merges them. */
function loadLanguage(lang: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const ns of namespaceFiles(lang)) Object.assign(out, loadNamespace(lang, ns));
  return out;
}

/** All leaf keys, skipping "_" meta keys (e.g. _name). */
function collectKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj)
    .filter(([key]) => !key.startsWith("_"))
    .flatMap(([key, value]) => {
      const next = prefix ? `${prefix}.${key}` : key;
      return typeof value === "object" && value !== null
        ? collectKeys(value as Record<string, unknown>, next)
        : [next];
    })
    .sort();
}

function placeholders(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
}

/**
 * A plural variant reduced to the key it is a form of.
 *
 * i18next resolves `bars_few` from `bars`, so the two are one key as far as
 * this file's "same key set" contract goes. A language whose rules need more
 * forms than English's carries more of them; a language whose rules need
 * fewer may still carry English's, which costs nothing and keeps the files
 * looking alike. Only the underscore counts — `review.bars.one` is a key
 * called "one", not a plural of "review.bars".
 */
function baseKey(key: string): string {
  return key.replace(/_(zero|one|two|few|many|other)$/, "");
}

function baseKeys(obj: Record<string, unknown>): string[] {
  return [...new Set(collectKeys(obj).map(baseKey))].sort();
}

/** The value at a dotted key, or undefined. */
function at(tree: Record<string, unknown>, dotted: string): unknown {
  let node: unknown = tree;
  for (const part of dotted.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/**
 * Base key → the placeholders its sentence uses, as one sorted string.
 *
 * Every plural form of a key says the same thing about a different number, so
 * they are folded together: a language with four forms of "{{count}} bar" is
 * not using `{{count}}` four times as often as English.
 */
function tokensByBase(tree: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>();
  for (const key of collectKeys(tree)) {
    const base = baseKey(key);
    const tokens = new Set([...(out.get(base) ?? "").split(",").filter(Boolean), ...placeholders(at(tree, key))]);
    out.set(base, [...tokens].sort().join(","));
  }
  return out;
}

describe("locale files", () => {
  const langs = languages();
  const en = loadLanguage("en");
  const enKeys = collectKeys(en);

  it("English is present and is the source of truth", () => {
    expect(langs).toContain("en");
    expect(enKeys.length).toBeGreaterThan(100);
  });

  it("no stray flat locale file survives the namespace split", () => {
    const strays = fs
      .readdirSync(LOCALES_DIR, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => e.name);
    expect(strays).toEqual([]);
  });

  it("every language carries the same namespaces", () => {
    for (const lang of langs) {
      expect(namespaceFiles(lang), `${lang} namespace mismatch`).toEqual(NAMESPACES);
    }
  });

  it("no top-level group is claimed by two namespaces", () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const ns of NAMESPACES) {
      for (const group of Object.keys(loadNamespace("en", ns))) {
        const prev = owner.get(group);
        if (prev) clashes.push(`${group} is in both ${prev} and ${ns}`);
        else owner.set(group, ns);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("every language declares a _name (native language name)", () => {
    for (const lang of langs) {
      expect(loadNamespace(lang, "common")._name, `${lang} is missing "_name"`).toBeTypeOf(
        "string",
      );
    }
  });

  it("every language has exactly the English key set", () => {
    const enBases = baseKeys(en);
    for (const lang of langs) {
      expect(baseKeys(loadLanguage(lang)), `${lang} key mismatch`).toEqual(enBases);
    }
  });

  it("every {{placeholder}} from English exists in every language", () => {
    // Per base key, not as one bag for the whole file. The bag version passed
    // just as happily when a translator moved `{{amount}}` out of one
    // sentence and into another, which is how fourteen locales once carried
    // it in `songs.review.say.drift.3` where English had only `{{when}}`.
    const enTokens = tokensByBase(en);
    for (const lang of langs) {
      const theirs = tokensByBase(loadLanguage(lang));
      const drift: string[] = [];
      for (const [key, want] of enTokens) {
        const got = theirs.get(key) ?? "";
        if (got !== want) drift.push(`${key}: English has [${want}], ${lang} has [${got}]`);
      }
      expect(drift, `${lang} placeholder drift`).toEqual([]);
    }
  });

  it("Pocket Check left no strings behind", () => {
    // `tab-3` used to be listed here too. Pocket Check was the third tab, so
    // its hotkey strings survived its removal under that generic id — which is
    // what this test was written to catch.
    //
    // The id has since been reissued: the rail is Metronome, Setlist, Drill,
    // and Drill is tab-3. Keeping it on this list would now fail on a key that
    // is in use. A key nothing calls is the i18n coverage test's job, and it
    // catches that for every key rather than for two remembered ones.
    const stale = enKeys.filter((k) => k.includes("pocketCheck"));
    expect(stale).toEqual([]);
  });
});
