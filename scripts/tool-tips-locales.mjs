#!/usr/bin/env node
/**
 * The tools' tip catalogue in fifteen languages (leg c5c3).
 *
 * `src/locales/en/toolTips.json` is the source. Every other locale carries a
 * file of the same shape; a SECTION of it that has not been translated yet
 * holds the English text and is named in `src/coach/toolTipsPending.json`,
 * which the loader (`src/coach/templateCatalog.ts`) reads so that a pending
 * section is never shown: a pending instrument falls back to that locale's
 * `generic`, a pending `generic` to English.
 *
 * Sections, most-seen first (the order of translation):
 *   group 1: generic, defaultMode, proMode, words (the values code puts into
 *            `{direction}`, `{correctionDirection}` and `{change}`)
 *   group 2: electric-guitar, acoustic-guitar, bass
 *   group 3: drums, piano
 *
 *   node scripts/tool-tips-locales.mjs sections <dir>
 *       Writes English's sections to <dir>/en/<section>.json for the
 *       translators and prints how many strings each holds.
 *   node scripts/tool-tips-locales.mjs merge <dir>
 *       Starts every locale from its committed file (or English, the first
 *       time), takes each <dir>/<locale>/<section>.json that has exactly
 *       English's shape and placeholders, writes the locale files and the
 *       pending list. A fragment of the wrong shape is refused and named.
 *   node scripts/tool-tips-locales.mjs check <dir> <locale> <section>
 *       A translator's self-check of one fragment before the merge.
 *   node scripts/tool-tips-locales.mjs report [pairs] [seed]
 *       Per locale: strings translated, strings identical to English, lines
 *       with "!" and, if asked, that many random English/translation pairs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = path.join(ROOT, "src/locales");
const PENDING = path.join(ROOT, "src/coach/toolTipsPending.json");

export const GROUPS = [
  ["generic", "defaultMode", "proMode", "words"],
  ["electric-guitar", "acoustic-guitar", "bass"],
  ["drums", "piano"],
];
const SECTIONS = GROUPS.flat();

const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const write = (f, v) => fs.writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`);

/** The section's object inside a toolTips file. */
function get(file, section) {
  const t = file.toolTips;
  if (section === "words") return t.words;
  if (section === "defaultMode") return t.defaultMode.generic;
  if (section === "proMode") return t.proMode.generic;
  return t.catalog[section];
}
function set(file, section, value) {
  const t = file.toolTips;
  if (section === "words") t.words = value;
  else if (section === "defaultMode") t.defaultMode.generic = value;
  else if (section === "proMode") t.proMode.generic = value;
  else t.catalog[section] = value;
}

const placeholders = (s) => [...s.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort().join(",");

/** Every (path, english, theirs) leaf of a section, in English's order. */
function* pairs(en, theirs, prefix = "") {
  if (typeof en === "string") {
    yield [prefix.replace(/\.$/, ""), en, typeof theirs === "string" ? theirs : undefined];
    return;
  }
  for (const [k, v] of Object.entries(en)) {
    yield* pairs(v, theirs && typeof theirs === "object" ? theirs[k] : undefined, `${prefix}${k}.`);
  }
}

/** What is wrong with a translated section, or [] when it fits. */
function problems(en, theirs, at = "") {
  if (typeof en === "string") {
    if (typeof theirs !== "string" || theirs.trim() === "") return [`${at}: empty`];
    // The separator may be only punctuation and a space; it is still a value.
    if (placeholders(theirs) !== placeholders(en)) {
      return [`${at}: placeholders [${placeholders(theirs)}], English [${placeholders(en)}]`];
    }
    return [];
  }
  if (!theirs || typeof theirs !== "object") return [`${at}: missing`];
  if (Array.isArray(en) && (!Array.isArray(theirs) || theirs.length !== en.length)) {
    return [`${at}: ${Array.isArray(theirs) ? theirs.length : "no"} variants, English has ${en.length}`];
  }
  const out = [];
  for (const k of Object.keys(theirs)) if (!(k in en)) out.push(`${at}.${k}: extra`);
  for (const [k, v] of Object.entries(en)) out.push(...problems(v, theirs[k], at ? `${at}.${k}` : k));
  return out;
}

function locales() {
  return fs.readdirSync(LOCALES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "en")
    .map((e) => e.name)
    .sort();
}

const english = () => read(path.join(LOCALES, "en/toolTips.json"));
const pendingList = () => (fs.existsSync(PENDING) ? read(PENDING) : {});

function count(section) {
  let n = 0;
  for (const _ of pairs(section)) n++;
  return n;
}

function sections(dir) {
  const en = english();
  fs.mkdirSync(path.join(dir, "en"), { recursive: true });
  let total = 0;
  for (const s of SECTIONS) {
    write(path.join(dir, "en", `${s}.json`), get(en, s));
    const n = count(get(en, s));
    total += n;
    console.log(`${s}\t${n}`);
  }
  console.log(`total\t${total}`);
}

function merge(dir) {
  const en = english();
  const pending = pendingList();
  const next = {};
  for (const loc of locales()) {
    const file = path.join(LOCALES, loc, "toolTips.json");
    const have = fs.existsSync(file) ? read(file) : null;
    const out = structuredClone(en);
    const missing = [];
    for (const s of SECTIONS) {
      const wasPending = !have || (pending[loc] ?? []).includes(s) || get(have, s) === undefined;
      if (have && !wasPending) set(out, s, get(have, s));
      const frag = path.join(dir, loc, `${s}.json`);
      if (fs.existsSync(frag)) {
        let theirs;
        try {
          theirs = read(frag);
        } catch (e) {
          console.log(`REFUSED ${loc}/${s}: ${e.message}`);
          if (wasPending) missing.push(s);
          continue;
        }
        const bad = problems(get(en, s), theirs);
        if (bad.length) {
          console.log(`REFUSED ${loc}/${s}: ${bad.length} problems; first: ${bad.slice(0, 5).join(" | ")}`);
          if (wasPending) missing.push(s);
          continue;
        }
        set(out, s, theirs);
        console.log(`took ${loc}/${s}`);
      } else if (wasPending) {
        missing.push(s);
      }
    }
    write(file, out);
    if (missing.length) next[loc] = missing;
  }
  write(PENDING, next);
  console.log(`pending: ${JSON.stringify(next)}`);
}

/** Small deterministic PRNG so a report can be repeated. */
function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function report(nPairs, seed) {
  const en = english();
  const pending = pendingList();
  const rnd = mulberry(seed);
  for (const loc of locales()) {
    const file = read(path.join(LOCALES, loc, "toolTips.json"));
    const skip = new Set(pending[loc] ?? []);
    const all = [];
    const perGroup = GROUPS.map(() => 0);
    let same = 0;
    let bang = 0;
    let drift = 0;
    GROUPS.forEach((group, gi) => {
      for (const s of group) {
        if (skip.has(s)) continue;
        for (const [p, e, t] of pairs(get(en, s), get(file, s), `${s}.`)) {
          perGroup[gi]++;
          all.push([p, e, t]);
          if (e === t) same++;
          if (/[!！]/.test(t)) bang++;
          if (placeholders(t) !== placeholders(e)) drift++;
        }
      }
    });
    console.log(`== ${loc}: translated ${all.length} (groups ${perGroup.join("/")}), identical to English ${same}, with "!" ${bang}, placeholder drift ${drift}, pending [${[...skip].join(" ")}]`);
    for (let i = 0; i < nPairs && all.length; i++) {
      const [p, e, t] = all[Math.floor(rnd() * all.length)];
      console.log(`  ${p}\n    EN ${e}\n    ${loc} ${t}`);
    }
    for (const [p, e, t] of all) if (e === t && e.length > 12) console.log(`  same: ${p}: ${e}`);
  }
}

/** A translator's self-check of one fragment: shape, placeholders, "!". */
function check(dir, loc, section) {
  const en = english();
  const frag = path.join(dir, loc, `${section}.json`);
  let theirs;
  try {
    theirs = read(frag);
  } catch (e) {
    console.log(`FAIL ${frag}: ${e.message}`);
    process.exit(1);
  }
  const bad = problems(get(en, section), theirs);
  let n = 0;
  let same = 0;
  for (const [p, e, t] of pairs(get(en, section), theirs)) {
    n++;
    if (e === t) same++;
    if (t && /[!！]/.test(t)) bad.push(`${p}: has "!"`);
  }
  for (const b of bad) console.log(`  ${b}`);
  console.log(`${bad.length ? "FAIL" : "OK"} ${loc}/${section}: ${n} strings, ${same} identical to English, ${bad.length} problems`);
  process.exit(bad.length ? 1 : 0);
}

/** A second reader's sample: n random lines per locale from its fragments. */
function sample(dir, n, seed, only) {
  const en = english();
  const rnd = mulberry(seed);
  fs.mkdirSync(path.join(dir, "review"), { recursive: true });
  for (const loc of locales()) {
    if (only && !only.split(",").includes(loc)) continue;
    const all = [];
    for (const s of SECTIONS) {
      const frag = path.join(dir, loc, `${s}.json`);
      if (!fs.existsSync(frag)) continue;
      for (const [p, e, t] of pairs(get(en, s), read(frag), "")) all.push({ section: s, path: p, en: e, [loc]: t });
    }
    const picked = [];
    while (picked.length < Math.min(n, all.length)) {
      const c = all.splice(Math.floor(rnd() * all.length), 1)[0];
      picked.push(c);
    }
    write(path.join(dir, "review", `${loc}.json`), picked);
    console.log(`${loc}\t${picked.length}`);
  }
}

const [cmd, a, b, c, d] = process.argv.slice(2);
if (cmd === "check") check(a, b, c);
else if (cmd === "sample") sample(a, Number(b ?? 60), Number(c ?? 1), d);
else if (cmd === "sections") sections(a);
else if (cmd === "merge") merge(a);
else if (cmd === "report") report(Number(a ?? 0), Number(b ?? 1));
else {
  console.log("usage: sections <dir> | merge <dir> | report [pairs] [seed]");
  process.exit(2);
}
