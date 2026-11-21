#!/usr/bin/env node
// The coach's tool eval (DESIGN C3b, TOOLS 3.5; leg c3b1a).
//
//   node scripts/coach-eval.mjs rules    --out DIR [--lang L,...]
//   node scripts/coach-eval.mjs requests --out DIR [--lang L,...] [--limit N] [--grammar situation|full] [--deadline-ms MS]
//   node scripts/coach-eval.mjs model    --out DIR --bin PATH --gguf FILE [--lang L,...] [--limit N] [--grammar ...] [--deadline-ms MS]
//   node scripts/coach-eval.mjs score    --out DIR --outcomes FILE [--lang L,...] [--limit N]
//   node scripts/coach-eval.mjs titles   --out FILE --lang L
//   node scripts/coach-eval.mjs prompt   --out FILE
//   node scripts/coach-eval.mjs check    [--lang L,...]   (each expected call judged by the runner)
//
// `rules` runs the set through the rule chain every device has today (no
// model). `model` writes one `coach::ask` choice request per item, runs the
// Rust bin `coach-eval` (built with `--features coach-llm`) over them, and
// scores what came back; `requests` + `score` are the same in two halves.
// Every result goes to `--out` (results.json, summary.md): there is no
// default folder, so nothing lands in a fixed place.
//
// The set is `evals/coach/tools/<lng>.jsonl` (see evals/coach/README.md): held
// out, never used for training. All of the logic is TypeScript in
// src/coach/ask (evalEntry.ts) and pure; this file bundles it with esbuild,
// reads the files and runs the process.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const setDir = path.join(root, "evals/coach/tools");
const packsDir = path.join(root, "src/paths/packs");

// ---------------------------------------------------------------------------
// Bundling: Vite's `import.meta.glob` written out for esbuild
// ---------------------------------------------------------------------------

/** The files a glob pattern names (`dir/*.ext`, `dir/*\/*.ext`), as the pattern writes them. */
function expandGlob(fromDir, pattern) {
  const parts = pattern.split("/");
  const starAt = parts.findIndex((p) => p.includes("*"));
  const base = parts.slice(0, starAt).join("/");
  const rest = parts.slice(starAt);
  const toRe = (seg) => new RegExp(`^${seg.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);
  let found = [base];
  for (const seg of rest) {
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
        const eager = /eager:\s*true/.test(opts);
        if (!eager) return "({})"; // lazy globs (the packs' loaders) are never called by the eval
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

async function loadEval() {
  const dir = mkdtempSync(path.join(tmpdir(), "yames-coach-eval-"));
  const outfile = path.join(dir, "eval.mjs");
  await build({
    entryPoints: [path.join(root, "src/coach/ask/evalEntry.ts")],
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

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function fail(message) {
  console.error(`coach-eval: ${message}`);
  process.exit(2);
}

/** Every pack, in `lng` where it is translated, as `loadAllPacks` builds them. */
function loadPacks(ev, lng) {
  const files = readdirSync(packsDir).filter((f) => f.endsWith(".json")).sort();
  const docs = [];
  for (const file of files) {
    const doc = JSON.parse(readFileSync(path.join(packsDir, file), "utf8"));
    if (doc?.schemaVersion !== ev.PATH_SCHEMA_VERSION || typeof doc.id !== "string" || !Array.isArray(doc.steps)) continue;
    let overlay = null;
    const overlayFile = path.join(packsDir, "i18n", lng, `${doc.id}.json`);
    if (lng !== "en" && existsSync(overlayFile)) overlay = ev.readOverlay(JSON.parse(readFileSync(overlayFile, "utf8")));
    docs.push(ev.localizePack(doc, overlay));
  }
  return docs;
}

function loadSet(ev, langs) {
  const sets = [];
  for (const lng of langs) {
    const file = path.join(setDir, `${lng}.jsonl`);
    if (!existsSync(file)) continue;
    sets.push({ lng, items: ev.parseSetFile(readFileSync(file, "utf8")) });
  }
  return sets;
}

function langsOf(ev, opt) {
  return typeof opt.lang === "string" ? opt.lang.split(",") : [...ev.EVAL_LANGUAGES];
}

/** The first `limit` items across the languages, spread evenly (a smoke run takes some of each). */
function limitItems(sets, limit) {
  if (!limit) return sets;
  const per = Math.max(1, Math.ceil(limit / sets.length));
  let left = limit;
  return sets.map((s) => {
    const take = Math.min(per, left, s.items.length);
    left -= take;
    return { ...s, items: s.items.slice(0, take) };
  });
}

function outDir(opt) {
  if (typeof opt.out !== "string") fail("--out DIR is required (there is no default folder)");
  mkdirSync(opt.out, { recursive: true });
  return opt.out;
}

function writeResults(dir, title, note, ev, scored) {
  const rows = [];
  const all = { items: [], scores: [] };
  for (const { lng, items, scores } of scored) {
    rows.push(ev.summarize(lng, items, scores));
    all.items.push(...items);
    all.scores.push(...scores);
  }
  rows.push(ev.summarize("all", all.items, all.scores));
  writeFileSync(path.join(dir, "results.json"), `${JSON.stringify({ title, rows, scores: all.scores }, null, 1)}\n`);
  writeFileSync(path.join(dir, "summary.md"), ev.summaryMarkdown(title, rows, note));
  const total = rows[rows.length - 1];
  console.log(`${title}: ${total.n} items, right ${total.right}, right tool ${total.rightTool}/${total.calls}, wrong actions ${total.wrongActions}, asked ${total.asked}/${total.which}, no answer ${total.noAnswer}`);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdRules(ev, opt) {
  const dir = outDir(opt);
  const scored = [];
  for (const { lng, items } of limitItems(loadSet(ev, langsOf(ev, opt)), Number(opt.limit) || 0)) {
    const paths = loadPacks(ev, lng);
    const scores = items.map((item) => ev.scoreItem(item, ev.rulesAnswer(item, paths), paths));
    scored.push({ lng, items, scores });
  }
  writeResults(dir, "Tool eval: the rules (no model)", "Router as `answerTyped` runs it, then Path search. No fact cards (not on `coach` yet).", ev, scored);
}

function writeRequests(ev, opt, dir) {
  const grammar = opt.grammar === "full" ? "full" : "situation";
  const deadlineMs = Number(opt["deadline-ms"]) || 8000;
  const sets = limitItems(loadSet(ev, langsOf(ev, opt)), Number(opt.limit) || 0);
  const lines = [];
  let id = 1;
  for (const { lng, items } of sets) {
    const paths = loadPacks(ev, lng);
    for (const item of items) lines.push(JSON.stringify(ev.askRequestFor(item, paths, { generationId: id++, deadlineMs, grammar })));
  }
  const file = path.join(dir, "requests.jsonl");
  writeFileSync(file, `${lines.join("\n")}\n`);
  return { file, sets };
}

function scoreOutcomes(ev, sets, outcomesFile, dir, title, note) {
  const outcomes = new Map(
    readFileSync(outcomesFile, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l))
      .map((o) => [o.id, o]),
  );
  const scored = [];
  for (const { lng, items } of sets) {
    const paths = loadPacks(ev, lng);
    const scores = items.map((item) => {
      const o = outcomes.get(item.id) ?? { id: item.id, status: "error", error: "no outcome" };
      return ev.scoreItem(item, ev.modelAnswer(o), paths, typeof o.totalMs === "number" ? o.totalMs : undefined);
    });
    scored.push({ lng, items, scores });
  }
  writeResults(dir, title, note, ev, scored);
}

async function cmdRequests(ev, opt) {
  const dir = outDir(opt);
  const { file } = writeRequests(ev, opt, dir);
  console.log(`wrote ${file}`);
}

async function cmdScore(ev, opt) {
  const dir = outDir(opt);
  if (typeof opt.outcomes !== "string") fail("--outcomes FILE is required");
  const sets = limitItems(loadSet(ev, langsOf(ev, opt)), Number(opt.limit) || 0);
  scoreOutcomes(ev, sets, opt.outcomes, dir, "Tool eval: a model", `Outcomes from ${opt.outcomes}.`);
}

async function cmdModel(ev, opt) {
  const dir = outDir(opt);
  if (typeof opt.bin !== "string" || typeof opt.gguf !== "string") fail("--bin (the coach-eval binary) and --gguf are required");
  const { file, sets } = writeRequests(ev, opt, dir);
  const outcomes = path.join(dir, "outcomes.jsonl");
  const run = spawnSync(opt.bin, ["--gguf", opt.gguf, "--requests", file, "--outcomes", outcomes], { stdio: "inherit" });
  if (run.status !== 0) fail(`${opt.bin} exited ${run.status}`);
  scoreOutcomes(ev, sets, outcomes, dir, `Tool eval: ${path.basename(opt.gguf)}`, `Grammar: ${opt.grammar === "full" ? "every player tool" : "the tools possible in the situation"}. Only \`answered\` is an answer.`);
}

async function cmdTitles(ev, opt) {
  if (typeof opt.out !== "string" || typeof opt.lang !== "string") fail("--out FILE and --lang L are required");
  const lines = [];
  for (const p of loadPacks(ev, opt.lang)) {
    lines.push(`PATH ${p.id}: ${p.title}`);
    for (const l of p.levels ?? []) lines.push(`  LEVEL ${l.title}`);
    for (const s of p.steps) {
      lines.push(`  STEP ${s.order}: ${s.title}`);
      for (const e of s.exercises) lines.push(`    EXERCISE ${e.title}`);
    }
  }
  writeFileSync(opt.out, `${lines.join("\n")}\n`);
}

/** Every item parses and every expected call is one the runner accepts in its situation (the validator test, fast). */
async function cmdCheck(ev, opt) {
  let bad = 0;
  for (const lng of langsOf(ev, opt)) {
    const file = path.join(setDir, `${lng}.jsonl`);
    if (!existsSync(file)) continue;
    let items;
    try {
      items = ev.parseSetFile(readFileSync(file, "utf8"));
    } catch (error) {
      console.log(`${lng}: ${error.message}`);
      bad++;
      continue;
    }
    const paths = loadPacks(ev, lng);
    const kinds = {};
    const ids = new Set();
    for (const item of items) {
      kinds[item.expect.kind] = (kinds[item.expect.kind] ?? 0) + 1;
      if (ids.has(item.id)) console.log(`${item.id}: duplicate id`);
      ids.add(item.id);
      if (item.lang !== lng) console.log(`${item.id}: lang ${item.lang} in ${lng}.jsonl`);
      const why = ev.judgeExpected(item, paths);
      if (why) {
        bad++;
        console.log(`${item.id}: ${why}  <- ${JSON.stringify(item.expect)} in ${JSON.stringify(item.situation)}`);
      }
    }
    console.log(`${lng}: ${items.length} items ${JSON.stringify(kinds)}`);
  }
  process.exit(bad === 0 ? 0 : 1);
}

async function cmdPrompt(ev, opt) {
  if (typeof opt.out !== "string") fail("--out FILE is required");
  const catalogue = ev.toolCatalogue(ev.COACH_TOOLS);
  writeFileSync(
    opt.out,
    `${ev.choicePrefix(catalogue, ev.EVAL_CARDS)}\n\n---- catalogue ----\n${JSON.stringify(catalogue, null, 1)}\n\n---- grammar ----\n${ev.choiceGrammar(catalogue, ev.EVAL_CARDS)}`,
  );
}

const opt = args(process.argv.slice(2));
const command = opt._[0];
/** The full choice grammar (every player tool, the cards): `src/coach/ask/choice-grammar.gbnf` is this. */
async function cmdGrammar(ev, opt) {
  if (typeof opt.out !== "string") fail("--out FILE is required");
  writeFileSync(opt.out, ev.choiceGrammar(ev.toolCatalogue(ev.COACH_TOOLS), ev.EVAL_CARDS));
}

const commands = { grammar: cmdGrammar, rules: cmdRules, requests: cmdRequests, score: cmdScore, model: cmdModel, titles: cmdTitles, prompt: cmdPrompt, check: cmdCheck };
if (!commands[command]) fail(`usage: coach-eval.mjs <${Object.keys(commands).join("|")}> --out ...`);
const ev = await loadEval();
await commands[command](ev, opt);
