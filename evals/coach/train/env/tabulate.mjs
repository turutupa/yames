// Leg c3d2: one run folder's RESULT.md (pipeline.sh's last stage), or every run side by side.
//
//   node tabulate.mjs <runs>/<candidate>             -> <runs>/<candidate>/RESULT.md
//   node tabulate.mjs --all <runs> <out.md>          -> every run that has a held-out result
//
// A run folder holds heldout/{alone,chain-rules-first,chain-model-first}/results.json
// (scripts/coach-eval.mjs), val/<snapshot>-<quant>/val.json (val_match.py), train/metrics.json,
// SELECTED and STATUS. The stock rows (runs/stock-4b, stock-8b) sit beside the candidate's in its
// table when they exist. Plain Node, no dependency.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "-");
const sec = (ms) => (ms == null ? "-" : `${(ms / 1000).toFixed(2)} s`);
const readJson = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
const GATE = (x) => x.calls > 0 && x.rightTool / x.calls >= 0.9 && x.wrongActions / x.n < 0.02;

function load(dir) {
  const name = path.basename(dir);
  const sel = existsSync(path.join(dir, "SELECTED")) ? readFileSync(path.join(dir, "SELECTED"), "utf8").trim().split(/\s+/) : [];
  const gguf = sel[1];
  const val = {};
  const valDir = path.join(dir, "val");
  if (existsSync(valDir)) for (const d of readdirSync(valDir).sort()) {
    const v = readJson(path.join(valDir, d, "val.json"));
    if (v) val[d] = v;
  }
  const count = existsSync(path.join(dir, "heldout", "COUNT")) ? readFileSync(path.join(dir, "heldout", "COUNT"), "utf8").trim().split("\n").filter(Boolean).length : 0;
  return {
    name,
    dir,
    selected: sel[0],
    gguf,
    ggufBytes: gguf && existsSync(gguf) ? statSync(gguf).size : null,
    metrics: readJson(path.join(dir, "train", "metrics.json")),
    lengths: readJson(path.join(dir, "data", "lengths.json")),
    val,
    heldoutRuns: count,
    alone: readJson(path.join(dir, "heldout", "alone", "results.json")),
    chain: readJson(path.join(dir, "heldout", "chain-rules-first", "results.json")),
    chainModel: readJson(path.join(dir, "heldout", "chain-model-first", "results.json")),
  };
}

/** Wrong actions by what was expected (c3b2m's classes, with the card items). */
function classes(r) {
  const exp = { which: 0, yours: 0, none: 0, "another tool": 0, "other arguments": 0, "card asked, acted": 0 };
  for (const x of r.scores.filter((s) => s.wrongAction)) {
    const e = x.expect.startsWith("call ") ? (x.rightTool ? "other arguments" : "another tool") : x.expect.startsWith("card ") ? "card asked, acted" : x.expect.split(" ")[0];
    exp[e] = (exp[e] ?? 0) + 1;
  }
  return exp;
}

const HEAD =
  "| run | right tool | right args | wrong action | which asked | yours | none | cards right | wrong card | card uninvited | no answer | median | p90 | gate (>= 90%, < 2%) |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";
function row(label, r) {
  const x = r.rows.at(-1);
  return `| ${label} | ${x.rightTool}/${x.calls} (${pct(x.rightTool, x.calls)}) | ${x.rightArgs}/${x.calls} (${pct(x.rightArgs, x.calls)}) | ${x.wrongActions}/${x.n} (${pct(x.wrongActions, x.n)}) | ${x.asked}/${x.which} | ${x.yoursRight}/${x.yours} | ${x.noneRight}/${x.none} | ${x.cardsRight ?? 0}/${x.cards ?? 0} | ${x.cardsWrong ?? 0} | ${x.cardsUninvited ?? 0} | ${x.noAnswer} | ${sec(x.medianMs)} | ${sec(x.p90Ms)} | ${GATE(x) ? "yes" : "no"} |`;
}

function table(runs, which, title, lines) {
  const rs = runs.filter((r) => r[which]);
  if (rs.length === 0) return;
  lines.push(`## ${title}`, "", HEAD);
  for (const r of rs) lines.push(row(r.name, r[which]));
  lines.push("", "Wrong actions by what was expected:", "");
  for (const r of rs) lines.push(`- ${r.name}: ${Object.entries(classes(r[which])).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  lines.push("");
  lines.push(`Per language (${rs.map((r) => r.name).join(" / ")}): right tool, wrong action, median; gate`, "");
  lines.push("| lang | right tool | wrong action | median | gate |", "|---|---|---|---|---|");
  const langs = rs[0][which].rows.slice(0, -1).map((x) => x.lang);
  for (const lang of langs) {
    const xs = rs.map((r) => r[which].rows.find((x) => x.lang === lang));
    const j = (f) => xs.map((x) => (x ? f(x) : "-")).join(" / ");
    lines.push(`| ${lang} | ${j((x) => `${x.rightTool}/${x.calls}`)} | ${j((x) => `${x.wrongActions}/${x.n}`)} | ${j((x) => sec(x.medianMs))} | ${j((x) => (GATE(x) ? "yes" : "no"))} |`);
  }
  lines.push("");
}

function describe(r, lines) {
  lines.push(`### ${r.name}`, "");
  if (r.gguf) lines.push(`- measured GGUF: \`${r.gguf}\` (${r.ggufBytes == null ? "?" : `${(r.ggufBytes / 2 ** 20).toFixed(0)} MiB`}), snapshot \`${r.selected}\`; held-out runs of this candidate: ${r.heldoutRuns}`);
  const m = r.metrics;
  if (m) {
    lines.push(
      `- trained: ${m.mode}, ${m.steps} steps, batch ${m.batch_size}x${m.grad_accum}, max_len ${m.max_len}, lr ${m.lr}${m.mode === "lora" ? `, r ${m.lora_r} alpha ${m.lora_alpha}` : ""}; rows ${m.rows} used of ${m.rows_in ?? "?"} (${m.rows_dropped_too_long ?? "?"} dropped as too long); tokens/row median ${m.tokens_per_row_median ?? "?"} max ${m.tokens_per_row_max ?? "?"}`,
      `- time: ${m.seconds_per_step_steady.toFixed(2)} s/step steady, ${(m.seconds_total / 3600).toFixed(2)} h in all${m.resumed_from_step ? ` (resumed at step ${m.resumed_from_step}: timing covers the part after it)` : ""}; peak GPU ${m.peak_alloc_gib.toFixed(1)} GiB allocated, ${m.peak_reserved_gib.toFixed(1)} GiB reserved; load average ${m.load_avg_start?.toFixed(0)} -> ${m.load_avg_end?.toFixed(0)}`,
      `- loss: final training window ${m.final_loss?.toFixed(4)}; validation loss by epoch: ${(m.epoch_evals ?? []).map((e) => `${e.epoch ?? "end"} (step ${e.step}) ${e.eval_loss?.toFixed(4)}`).join(", ") || "-"}`,
    );
  }
  const vs = Object.entries(r.val);
  if (vs.length) lines.push(`- validation exact match (525 records, under each record's grammar): ${vs.map(([k, v]) => `${k} ${v.same_object}/${v.n} (${(100 * v.exact_match).toFixed(1)}%)`).join(", ")}`);
  lines.push("");
}

function render(runs, title) {
  const lines = [`# ${title}`, ""];
  lines.push(
    "Held-out set: 447 items (`evals/coach/tools`, with the card items), the `coach` prompt and grammar of the code",
    "snapshot the job ran (cards section, titles line), grammar narrowed to the situation, the tools' notes,",
    "deadline 8 s, prefix cache on, all layers on the GPU: the frozen `coach-eval-cuda` on the DGX's GB10 (CUDA),",
    "a busy shared machine, so latency is this machine's and not a player's. Chain = rules first, the model only",
    "where the rules said none (as the app runs it). Gate: right tool >= 90% of calls and wrong actions < 2% of items.",
    "",
  );
  for (const r of runs) describe(r, lines);
  table(runs, "alone", "Model alone", lines);
  table(runs, "chain", "Chain, rules first (the app's order)", lines);
  table(runs, "chainModel", "Chain, model first", lines);
  return `${lines.join("\n")}\n`;
}

const argv = process.argv.slice(2);
if (argv[0] === "--all") {
  const root = argv[1];
  const dirs = readdirSync(root).filter((d) => !d.startsWith("_") && existsSync(path.join(root, d, "heldout", "alone", "results.json"))).sort((a, b) => (a.startsWith("stock") ? -1 : 0) - (b.startsWith("stock") ? -1 : 0) || a.localeCompare(b));
  writeFileSync(argv[2], render(dirs.map((d) => load(path.join(root, d))), "Coach router candidates against stock (leg c3d2)"));
  console.log(`wrote ${argv[2]}`);
} else if (argv[0]) {
  const dir = path.resolve(argv[0]);
  const root = path.dirname(dir);
  const me = load(dir);
  const stock = ["stock-4b", "stock-8b"].filter((s) => s !== me.name && existsSync(path.join(root, s))).map((s) => load(path.join(root, s)));
  writeFileSync(path.join(dir, "RESULT.md"), render([me, ...stock.filter((s) => s.alone)], `${me.name} (leg c3d2)`));
  console.log(`wrote ${path.join(dir, "RESULT.md")}`);
} else {
  console.error("usage: node tabulate.mjs <run dir> | --all <runs dir> <out.md>");
  process.exit(2);
}
