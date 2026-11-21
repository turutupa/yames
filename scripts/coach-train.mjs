#!/usr/bin/env node
// The router's training data (leg c3d1, TOOLS 3.4; plans/tasks/coach/c3d-small-router.md).
//
//   node scripts/coach-train.mjs generate [--out DIR] [--size N] [--seed S] [--lang L,...]
//   node scripts/coach-train.mjs render   --in FILE --out FILE [--check]
//   node scripts/coach-train.mjs sample   --lang L --n 50 --out FILE [--seed S]
//
// `generate` writes DIR/train.jsonl, DIR/validation.jsonl and DIR/stats.json
// (DIR defaults to evals/coach/train): records, not prompts. It refuses to run
// when a held-out file does not match its hash in evals/coach/README.md, and
// drops (and counts) every text too close to a held-out item.
//
// `render` turns records into the training pairs, `{id, prompt, completion}`,
// with the app's own prompt code AS IT IS IN THIS CHECKOUT (the prefix, the
// context, the ChatML of coach::ask_prompt_head / _tail); the completion is
// the answer JSON followed by <|im_end|>. `--check` also holds every
// completion to the record's grammar and to the runner's checkCall.
//
// `sample` picks records for a reviewer to re-read.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const heldOutDir = path.join(root, "evals/coach/tools");
const trainDir = path.join(root, "evals/coach/train");
const packsDir = path.join(root, "src/paths/packs");

// Vite's `import.meta.glob`, written out for esbuild (as in coach-eval.mjs).
function expandGlob(fromDir, pattern) {
  const parts = pattern.split("/");
  const starAt = parts.findIndex((p) => p.includes("*"));
  const base = parts.slice(0, starAt).join("/");
  const toRe = (seg) => new RegExp(`^${seg.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);
  let found = [base];
  for (const seg of parts.slice(starAt)) {
    const re = toRe(seg);
    const next = [];
    for (const rel of found) {
      const abs = path.resolve(fromDir, rel);
      if (!existsSync(abs)) continue;
      for (const name of readdirSync(abs).sort()) if (re.test(name)) next.push(`${rel}/${name}`);
    }
    found = next;
  }
  return found;
}

const globPlugin = {
  name: "vite-glob",
  setup(b) {
    b.onLoad({ filter: /src[\\/].*\.tsx?$/ }, (args) => {
      let source = readFileSync(args.path, "utf8");
      if (!source.includes("import.meta.glob")) return undefined;
      const dir = path.dirname(args.path);
      const imports = [];
      let n = 0;
      source = source.replace(/import\.meta\.glob(?:<[^>(]*>)?\(\s*(\[[^\]]*\]|"[^"]*")\s*(?:,\s*(\{[^}]*\}))?\s*\)/g, (_all, pats, opts = "") => {
        if (!/eager:\s*true/.test(opts)) return "({})";
        const importDefault = /import:\s*"default"/.test(opts);
        const patterns = JSON.parse(pats.startsWith("[") ? pats : `[${pats}]`);
        const keep = new Set();
        for (const p of patterns.filter((p) => !p.startsWith("!"))) for (const f of expandGlob(dir, p)) keep.add(f);
        for (const p of patterns.filter((p) => p.startsWith("!"))) for (const f of expandGlob(dir, p.slice(1))) keep.delete(f);
        const entries = [...keep].sort().map((file) => {
          const name = `__glob_${n++}`;
          imports.push(importDefault ? `import ${name} from ${JSON.stringify(file)};` : `import * as ${name} from ${JSON.stringify(file)};`);
          return `${JSON.stringify(file)}: ${name}`;
        });
        return `({ ${entries.join(", ")} })`;
      });
      return { contents: `${imports.join("\n")}\n${source}`, loader: args.path.endsWith(".tsx") ? "tsx" : "ts" };
    });
  },
};

async function loadTrain() {
  const dir = mkdtempSync(path.join(tmpdir(), "yames-coach-train-"));
  const outfile = path.join(dir, "train.mjs");
  await build({
    entryPoints: [path.join(root, "src/coach/train/trainEntry.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "error",
    plugins: [globPlugin],
    define: { "import.meta.env.DEV": "false", "import.meta.env.PROD": "true", "import.meta.env.MODE": '"production"' },
  });
  const module = await import(pathToFileURL(outfile).href);
  rmSync(dir, { recursive: true, force: true });
  return module;
}

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[a.slice(2)] = true;
      else {
        out[a.slice(2)] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function fail(message) {
  console.error(`coach-train: ${message}`);
  process.exit(2);
}

function loadPacks(ev, lng) {
  const docs = [];
  for (const file of readdirSync(packsDir).filter((f) => f.endsWith(".json")).sort()) {
    const doc = JSON.parse(readFileSync(path.join(packsDir, file), "utf8"));
    if (doc?.schemaVersion !== ev.PATH_SCHEMA_VERSION || typeof doc.id !== "string" || !Array.isArray(doc.steps)) continue;
    const overlayFile = path.join(packsDir, "i18n", lng, `${doc.id}.json`);
    const overlay = lng !== "en" && existsSync(overlayFile) ? ev.readOverlay(JSON.parse(readFileSync(overlayFile, "utf8"))) : null;
    docs.push(ev.localizePack(doc, overlay));
  }
  return docs;
}

const readJsonl = (file) =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
const writeJsonl = (file, rows) => writeFileSync(file, rows.length ? `${rows.map((r) => JSON.stringify(r)).join("\n")}\n` : "");

/** The held-out files against their hashes, and their texts as the leak guard. */
function heldOut(ev) {
  const readme = readFileSync(path.join(root, "evals/coach/README.md"), "utf8");
  const guard = new ev.LeakGuard();
  for (const lng of ev.EVAL_LANGUAGES) {
    const file = path.join(heldOutDir, `${lng}.jsonl`);
    if (!existsSync(file)) fail(`no held-out file for ${lng}`);
    const raw = readFileSync(file);
    const sha = createHash("sha256").update(raw).digest("hex");
    if (!readme.includes(`| ${lng}.jsonl | ${sha} |`)) fail(`${lng}.jsonl does not match its hash in evals/coach/README.md`);
    for (const item of ev.parseSetFile(raw.toString("utf8"))) guard.add(lng, item.text);
  }
  return guard;
}

/** Wordings a reviewer rejected: `review/<lng>.json` is `{rejected: [{id, wording, why}]}`. */
function blockedWordings(dir, langs) {
  const blocked = new Set();
  const counts = {};
  for (const lng of langs) {
    const file = path.join(dir, "review", `${lng}.json`);
    if (!existsSync(file)) continue;
    const review = JSON.parse(readFileSync(file, "utf8"));
    counts[lng] = { sampled: review.sampled ?? null, rejected: (review.rejected ?? []).length };
    for (const r of review.rejected ?? []) if (r.wording) blocked.add(`${lng}:${r.wording}`);
  }
  return { blocked, counts };
}

async function cmdGenerate(ev, opt) {
  const dir = typeof opt.out === "string" ? opt.out : trainDir;
  const size = Number(opt.size) || 700;
  const seed = Number(opt.seed) || 1;
  const langs = typeof opt.lang === "string" ? opt.lang.split(",") : [...ev.EVAL_LANGUAGES];
  const guard = heldOut(ev);
  // Wordings and reviews always come from evals/coach/train; only the output may go elsewhere.
  const { blocked, counts: reviewed } = blockedWordings(trainDir, langs);
  const all = [];
  const drops = {};
  for (const lng of langs) {
    const wfile = path.join(trainDir, "wordings", `${lng}.json`);
    if (!existsSync(wfile)) fail(`no wordings for ${lng} (${wfile})`);
    const wordings = JSON.parse(readFileSync(wfile, "utf8"));
    const paths = loadPacks(ev, lng);
    const t0 = Date.now();
    const data = ev.languageData(lng, paths, wordings);
    const t1 = Date.now();
    const res = ev.generateLanguage(data, wordings, { size, seed, guard, blocked, mix: ev.CARD_MIX });
    all.push(...res.records);
    drops[lng] = res.drops;
    console.log(`${lng}: ${res.records.length} records (names ${t1 - t0} ms, records ${Date.now() - t1} ms; names: path ${data.path.unique.length}/${data.path.ambiguous.length}, step ${data.step.unique.length}/${data.step.ambiguous.length}, exercise ${data.exercise.unique.length}/${data.exercise.ambiguous.length})`);
    console.log(`  drops ${JSON.stringify(res.drops)}`);
  }
  const { train, validation } = ev.splitValidation(all);
  mkdirSync(dir, { recursive: true });
  writeJsonl(path.join(dir, "train.jsonl"), train);
  writeJsonl(path.join(dir, "validation.jsonl"), validation);
  const stats = { seed, size, mix: ev.CARD_MIX, total: all.length, train: train.length, validation: validation.length, counts: ev.countRecords(all), validationCounts: ev.countRecords(validation), reviewed, drops };
  writeFileSync(path.join(dir, "stats.json"), `${JSON.stringify(stats, null, 1)}\n`);
  console.log(`total ${all.length}: train ${train.length}, validation ${validation.length}`);
}

async function cmdRender(ev, opt) {
  if (typeof opt.in !== "string" || typeof opt.out !== "string") fail("--in FILE and --out FILE are required");
  const records = readJsonl(opt.in);
  const packs = new Map();
  const rows = [];
  let bad = 0;
  for (const r of records) {
    if (!packs.has(r.language)) packs.set(r.language, loadPacks(ev, r.language));
    const out = ev.renderRecord(r, packs.get(r.language));
    if (opt.check) {
      const okGrammar = ev.gbnfToRegExp(out.grammar).test(out.answer);
      const parsed = JSON.parse(out.answer);
      const okCall =
        parsed.tool !== undefined
          ? ev.checkCall({ tool: parsed.tool, args: parsed.args }, ev.COACH_TOOLS).ok
          : parsed.card === undefined || ev.checkCall({ tool: parsed.card, args: parsed.args ?? {} }, ev.FACT_CARDS, "player").ok;
      if (!okGrammar || !okCall) {
        bad++;
        console.log(`${r.id}: ${okGrammar ? "" : "grammar "}${okCall ? "" : "checkCall "}${out.answer}`);
      }
    }
    rows.push({ id: out.id, prompt: out.prompt, completion: out.completion });
  }
  writeJsonl(opt.out, rows);
  console.log(`rendered ${rows.length}${opt.check ? `, ${bad} failing the grammar or checkCall` : ""}`);
  if (bad > 0) process.exit(1);
}

async function cmdSample(ev, opt) {
  if (typeof opt.lang !== "string" || typeof opt.out !== "string") fail("--lang L[,L...] and --out FILE|DIR are required");
  const langs = opt.lang === "all" ? [...ev.EVAL_LANGUAGES] : opt.lang.split(",");
  if (langs.length > 1) {
    mkdirSync(opt.out, { recursive: true });
    for (const lng of langs) sampleOne(opt, lng, path.join(opt.out, `${lng}.jsonl`));
  } else sampleOne(opt, langs[0], opt.out);
}

function sampleOne(opt, lang, out) {
  const n = Number(opt.n) || 50;
  const records = [...readJsonl(path.join(trainDir, "train.jsonl")), ...readJsonl(path.join(trainDir, "validation.jsonl"))].filter((r) => r.language === lang);
  // Spread over the kinds: an even share of each, the rest at random, seeded.
  let s = Number(opt.seed) || 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const byKind = new Map();
  for (const r of records) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  const picked = [];
  const per = Math.ceil(n / byKind.size);
  for (const list of byKind.values()) {
    const copy = [...list];
    for (let i = 0; i < per && copy.length; i++) picked.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  }
  const rows = picked.slice(0, n).map((r) => ({
    id: r.id,
    wording: r.wording,
    text: r.text,
    where: `${r.situation.view}${r.situation.phase ? ` (${r.situation.phase})` : ""}`,
    expect: r.expect,
    ...(r.call ? { call: r.call } : {}),
    tags: r.tags,
  }));
  writeJsonl(out, rows);
  console.log(`${lang}: sampled ${rows.length} of ${records.length}`);
}

const opt = args(process.argv.slice(2));
const commands = { generate: cmdGenerate, render: cmdRender, sample: cmdSample };
if (!commands[opt._[0]]) fail(`usage: coach-train.mjs <${Object.keys(commands).join("|")}> ...`);
const ev = await loadTrain();
await commands[opt._[0]](ev, opt);
