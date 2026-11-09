#!/usr/bin/env node
// The learning-path pipeline's command line. See plans/PATHS_PIPELINE.md.
//
//   npm run paths -- new <id> "<title>" <mechanics|theory>   start a spec
//   npm run paths -- gen [id]            spec to pack JSON and test fixtures
//   npm run paths -- check [id]          validate, and prove packs match specs
//   npm run paths -- validate <file>     validate any pack file
//   npm run paths -- review [id] [--out dir]    the review page for a person
//   npm run paths -- all                 gen, check, review
//
// All of the logic is TypeScript in src/paths and pure; this file only bundles
// it with esbuild (already here through vite) and does the file system.
import { build } from "esbuild";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packsDir = path.join(root, "src/paths/packs");
const specsDir = path.join(root, "src/paths/specs");
const rustFixture = path.join(root, "src-tauri/tests/path_fixtures/schedules.jsonl");
const defaultReviewDir = path.resolve(root, "..", "yames-concept", "paths-review");

async function loadPipeline() {
  const dir = mkdtempSync(path.join(tmpdir(), "yames-paths-"));
  const outfile = path.join(dir, "pipeline.mjs");
  await build({
    entryPoints: [path.join(root, "src/paths/pipeline.ts")],
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

function selectSpecs(pipeline, id) {
  const specs = pipeline.allSpecs();
  if (!id) return specs;
  const found = specs.filter((s) => s.id === id);
  if (found.length === 0) fail(`no spec called "${id}". Known: ${specs.map((s) => s.id).join(", ")}`);
  return found;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printIssues(pipeline, issues) {
  for (const issue of issues) console.log(pipeline.formatIssue(issue));
}

function gen(pipeline, id) {
  mkdirSync(packsDir, { recursive: true });
  for (const spec of selectSpecs(pipeline, id)) {
    const bytes = pipeline.packBytes(spec);
    writeFileSync(path.join(packsDir, `${spec.id}.json`), bytes);
    console.log(`wrote src/paths/packs/${spec.id}.json (${bytes.length} bytes)`);
  }
  // The Rust fixture always covers every pack, so it does not depend on `id`.
  const docs = pipeline.allSpecs().map((s) => JSON.parse(pipeline.packBytes(s)));
  mkdirSync(path.dirname(rustFixture), { recursive: true });
  writeFileSync(rustFixture, pipeline.scheduleFixtures(docs));
  console.log("wrote src-tauri/tests/path_fixtures/schedules.jsonl");
}

function check(pipeline, id) {
  let errors = 0;
  for (const spec of selectSpecs(pipeline, id)) {
    const file = path.join(packsDir, `${spec.id}.json`);
    if (!existsSync(file)) {
      console.log(`ERROR no pack for ${spec.id}. Run: npm run paths -- gen ${spec.id}`);
      errors += 1;
      continue;
    }
    const onDisk = readFileSync(file, "utf8");
    if (onDisk !== pipeline.packBytes(spec)) {
      console.log(`ERROR ${spec.id}: the pack is not what its spec generates. Run: npm run paths -- gen ${spec.id}`);
      errors += 1;
    }
    const issues = pipeline.validatePath(JSON.parse(onDisk));
    printIssues(pipeline, issues);
    const bad = pipeline.errorsIn(issues).length;
    errors += bad;
    console.log(`${bad === 0 ? "ok  " : "FAIL"} ${pipeline.summary(JSON.parse(onDisk))} ${bad} errors, ${issues.length - bad} warnings.`);
  }
  if (errors > 0) fail(`${errors} errors.`);
}

function validateFile(pipeline, file) {
  const issues = pipeline.validatePath(JSON.parse(readFileSync(file, "utf8")));
  printIssues(pipeline, issues);
  const bad = pipeline.errorsIn(issues).length;
  if (bad > 0) fail(`${bad} errors in ${file}.`);
  console.log(`ok ${file}`);
}

function review(pipeline, id, outDir) {
  mkdirSync(outDir, { recursive: true });
  for (const spec of selectSpecs(pipeline, id)) {
    const doc = JSON.parse(readFileSync(path.join(packsDir, `${spec.id}.json`), "utf8"));
    const file = path.join(outDir, `${spec.id}.html`);
    writeFileSync(file, pipeline.renderReviewPage(doc));
    console.log(`wrote ${file}`);
  }
}

function scaffold(id, title, kind) {
  if (!/^[a-z0-9-]+$/.test(id ?? "")) fail("usage: new <lowercase-id> \"Title\" <mechanics|theory>");
  if (kind !== "mechanics" && kind !== "theory") fail("kind must be mechanics or theory");
  const file = path.join(specsDir, `${id}.ts`);
  if (existsSync(file)) fail(`${file} already exists`);
  const name = id.replace(/-([a-z0-9])/g, (_m, c) => c.toUpperCase());
  writeFileSync(
    file,
    `/** ${title}. A draft until a teacher and a guitarist say otherwise. */
import { definePath } from "../spec";
import { ladder, repeat } from "../templates";

export default definePath({
  id: "${id}",
  title: ${JSON.stringify(title)},
  kind: "${kind}",
  goal: "TODO: what the player can do at the end, in one sentence.",
  level: "intermediate",
  assumes: "TODO: what the player can already do.",
  orderRationale: "TODO: why the Steps are in this order.",
  gradingLimits: "TODO: where grading stops being trustworthy on this Path.",
  steps: [
    {
      id: "first-step",
      title: "TODO",
      goal: "TODO",
      why: "TODO: why this Step, in at least one real sentence for the player.",
      howTo: ["TODO: technique, taught in words."],
      payoff: "TODO: what they will hear themselves gain.",
      exercises: [
        {
          id: "first",
          title: "TODO",
          purpose: "TODO: what this Exercise is for.",
          howTo: ["TODO"],
          coach: "TODO: what the Coach may say. Never claim to see or hear technique.",
          tab: repeat("/16 5:5 5:6 5:7 5:8", 4),
          position: 5,
          rungs: ladder(60, 100, 10),
          grade: "timing",
          minutes: 5,
        },
      ],
    },
  ],
});
`,
  );
  const index = path.join(specsDir, "index.ts");
  let source = readFileSync(index, "utf8");
  source = source.replace(
    "  // new paths go above this line",
    `  ${name},\n  // new paths go above this line`,
  );
  source = source.replace('import type { PathSpec } from "../spec";', `import ${name} from "./${id}";\nimport type { PathSpec } from "../spec";`);
  writeFileSync(index, source);
  console.log(`wrote src/paths/specs/${id}.ts and registered it. Next: npm run paths -- gen ${id}`);
}

const [command, ...rest] = process.argv.slice(2);
const flagAt = rest.indexOf("--out");
const outDir = flagAt >= 0 ? path.resolve(rest[flagAt + 1]) : defaultReviewDir;
const positional = flagAt >= 0 ? rest.filter((_v, i) => i !== flagAt && i !== flagAt + 1) : rest;

if (command === "new") {
  scaffold(positional[0], positional[1], positional[2]);
} else if (["gen", "check", "validate", "review", "all"].includes(command)) {
  const pipeline = await loadPipeline();
  if (command === "gen") gen(pipeline, positional[0]);
  if (command === "check") check(pipeline, positional[0]);
  if (command === "validate") validateFile(pipeline, positional[0]);
  if (command === "review") review(pipeline, positional[0], outDir);
  if (command === "all") {
    gen(pipeline);
    check(pipeline);
    review(pipeline, undefined, outDir);
  }
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 11).join("\n"));
  process.exit(command ? 1 : 0);
}
