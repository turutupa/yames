#!/usr/bin/env node
// Custom Exercises ("My exercises", src/paths/custom.ts): the fixture the Rust
// scorer reads, and a report on the recipe grid.
//
//   node scripts/custom-exercises.mjs gen      write src-tauri/tests/path_fixtures/custom_schedules.jsonl
//   node scripts/custom-exercises.mjs check    exit 1 if that file is not what gen would write
//   node scripts/custom-exercises.mjs report   the grid: built and refused by reason, and the time per recipe
//
// The logic is TypeScript in src/paths and pure; this file bundles it with
// esbuild (as scripts/paths.mjs does) and does the file system.
import { build } from "esbuild";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "src-tauri/tests/path_fixtures/custom_schedules.jsonl");

async function loadGrid() {
  const dir = mkdtempSync(path.join(tmpdir(), "yames-custom-"));
  const outfile = path.join(dir, "grid.mjs");
  await build({
    entryPoints: [path.join(root, "src/paths/customGrid.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "error",
  });
  const module = await import(pathToFileURL(outfile).href);
  rmSync(dir, { recursive: true, force: true });
  return module;
}

const command = process.argv[2] ?? "report";
const grid = await loadGrid();

if (command === "gen" || command === "check") {
  const bytes = grid.customScheduleFixtures();
  const rows = bytes.trim().split("\n").length;
  if (command === "gen") {
    writeFileSync(fixture, bytes);
    console.log(`wrote src-tauri/tests/path_fixtures/custom_schedules.jsonl (${rows} schedules)`);
  } else {
    const onDisk = existsSync(fixture) ? readFileSync(fixture, "utf8") : "";
    if (onDisk !== bytes) {
      console.error("custom_schedules.jsonl is stale. Run: node scripts/custom-exercises.mjs gen");
      process.exit(1);
    }
    console.log(`custom_schedules.jsonl is current (${rows} schedules)`);
  }
} else if (command === "report") {
  const recipes = grid.customGrid();
  const t0 = performance.now();
  const runs = grid.runGrid(recipes);
  const total = performance.now() - t0;
  const counts = {};
  const builtMs = [];
  for (const run of runs) {
    const key = run.result.ok ? "built" : run.result.why.why;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  // One built recipe at a time, timed alone, for the preview's number.
  for (const run of runs.filter((r) => r.result.ok).slice(0, 300)) {
    const t = performance.now();
    grid.runGrid([run.recipe]);
    builtMs.push(performance.now() - t);
  }
  builtMs.sort((a, b) => a - b);
  const at = (q) => builtMs[Math.min(builtMs.length - 1, Math.floor(q * builtMs.length))].toFixed(1);
  console.log(`${recipes.length} recipes in ${(total / 1000).toFixed(1)} s`);
  console.log(JSON.stringify(counts));
  console.log(`one built recipe: median ${at(0.5)} ms, p90 ${at(0.9)} ms, max ${at(0.999)} ms (${builtMs.length} timed)`);
  const notValid = runs.filter((r) => !r.result.ok && r.result.why.why === "notValid").slice(0, 10);
  for (const run of notValid) console.log("notValid", JSON.stringify(run.recipe), JSON.stringify(run.result.why));
  const byShape = {};
  for (const run of runs) {
    const key = `${run.recipe.shape}/${run.recipe.direction}`;
    byShape[key] ??= {};
    const why = run.result.ok ? "built" : run.result.why.why;
    byShape[key][why] = (byShape[key][why] ?? 0) + 1;
  }
  for (const [key, value] of Object.entries(byShape)) console.log(key, JSON.stringify(value));
  const unreachable = runs.filter((r) => !r.result.ok && r.result.why.why === "unreachable").slice(0, 5);
  for (const run of unreachable) console.log("unreachable", JSON.stringify(run.recipe), JSON.stringify(run.result.why));
} else {
  console.error(`unknown command ${command}: gen, check or report`);
  process.exit(2);
}
