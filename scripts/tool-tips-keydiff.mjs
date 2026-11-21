#!/usr/bin/env node
/**
 * Key-level diff of the tools' tip catalogue across every locale (leg tc1).
 *
 *   node scripts/tool-tips-keydiff.mjs <git-ref> [allowed-keys-file]
 *
 * Compares `src/locales/<lng>/toolTips.json` at <git-ref> with the working
 * tree, leaf by leaf. Prints, per locale, the keys whose text changed, and any
 * key added or removed. With an allowed-keys file (one dotted key per line, `#`
 * comments allowed), exits 1 if any locale changed a key outside it, or added
 * or removed a key; also lists the allowed keys a locale did NOT change.
 * `--table` prints the English old/new pairs as a Markdown table.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const table = args.includes("--table");
const [ref, allowedFile] = args.filter((a) => a !== "--table");
if (!ref) {
  console.error("usage: tool-tips-keydiff.mjs <git-ref> [allowed-keys-file] [--table]");
  process.exit(2);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = path.join(root, "src/locales");

function leaves(t, prefix = "") {
  if (t === null || typeof t !== "object") return [[prefix, t]];
  return Object.entries(t).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}
const atRef = (lng) =>
  new Map(
    leaves(
      JSON.parse(execFileSync("git", ["show", `${ref}:src/locales/${lng}/toolTips.json`], { cwd: root, encoding: "utf8" }))
        .toolTips,
    ),
  );
const now = (lng) =>
  new Map(leaves(JSON.parse(fs.readFileSync(path.join(LOCALES, lng, "toolTips.json"), "utf8")).toolTips));

const allowed = allowedFile
  ? new Set(
      fs
        .readFileSync(allowedFile, "utf8")
        .split("\n")
        .map((l) => l.replace(/#.*/, "").trim())
        .filter(Boolean),
    )
  : null;

const langs = fs
  .readdirSync(LOCALES, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(LOCALES, e.name, "toolTips.json")))
  .map((e) => e.name)
  .sort();

if (table) {
  const a = atRef("en");
  const b = now("en");
  console.log("| key | old English | new English |\n|---|---|---|");
  for (const [k, v] of b) if (a.get(k) !== v) console.log(`| \`${k}\` | ${a.get(k)} | ${v} |`);
  process.exit(0);
}

let bad = 0;
for (const lng of langs) {
  const a = atRef(lng);
  const b = now(lng);
  const changed = [];
  const outside = [];
  for (const [k, v] of b) {
    if (!a.has(k)) {
      outside.push(`${k} (added)`);
      continue;
    }
    if (a.get(k) !== v) {
      changed.push(k);
      if (allowed && !allowed.has(k)) outside.push(k);
    }
  }
  for (const k of a.keys()) if (!b.has(k)) outside.push(`${k} (removed)`);
  const untouched = allowed ? [...allowed].filter((k) => !changed.includes(k)) : [];
  console.log(`${lng}: ${changed.length} keys changed, ${outside.length} outside the list, ${untouched.length} listed but unchanged`);
  for (const k of outside) console.log(`  OUTSIDE ${k}`);
  for (const k of untouched) console.log(`  UNCHANGED ${k}`);
  bad += outside.length;
}
process.exit(bad ? 1 : 0);
