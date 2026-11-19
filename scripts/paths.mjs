#!/usr/bin/env node
// The learning-path pipeline's command line. See plans/PATHS_PIPELINE.md.
//
//   npm run paths -- new <id> "<title>" <mechanics|theory>   start a spec
//   npm run paths -- gen [id]            spec to pack JSON and test fixtures
//   npm run paths -- check [id]          validate, and prove packs match specs
//   npm run paths -- validate <file>     validate any pack file
//   npm run paths -- review [id] [--out dir]    the review page for a person
//   npm run paths -- all                 gen, check, review
//   npm run paths -- strings [id]        English strings for translators, and a report
//   npm run paths -- strings todo <lng> [--out file]   what <lng> still needs
//   npm run paths -- strings merge <lng> <file>        take translations in, stamped
//
// All of the logic is TypeScript in src/paths and pure; this file only bundles
// it with esbuild (already here through vite) and does the file system.
import { build } from "esbuild";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packsDir = path.join(root, "src/paths/packs");
const specsDir = path.join(root, "src/paths/specs");
const rustFixture = path.join(root, "src-tauri/tests/path_fixtures/schedules.jsonl");
const stringsDir = path.join(packsDir, "i18n");
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
  errors += checkCurriculumOnDisk(pipeline);
  if (errors === 0) errors += checkStrings(pipeline, id);
  if (errors > 0) fail(`${errors} errors.`);
}

// How the Paths build on each other is a property of all of them together,
// so it is checked over every pack on disk whatever `id` was asked for.
function checkCurriculumOnDisk(pipeline) {
  const docs = pipeline
    .allSpecs()
    .map((spec) => path.join(packsDir, `${spec.id}.json`))
    .filter((file) => existsSync(file))
    .map((file) => JSON.parse(readFileSync(file, "utf8")));
  const issues = pipeline.checkCurriculum(docs);
  for (const issue of issues) console.log(`ERROR ${issue.rule}  ${issue.where}\n      ${issue.message}`);
  const linked = docs.filter((d) => (d.prerequisites?.paths ?? []).length > 0).length;
  console.log(`${issues.length === 0 ? "ok  " : "FAIL"} curriculum: ${docs.length} Paths, ${linked} build on another. ${issues.length} errors.`);
  return issues.length;
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


// ---- Pack text in other languages (src/paths/strings.ts) -------------------

function packDocs(pipeline, id) {
  return selectSpecs(pipeline, id).map((spec) => JSON.parse(readFileSync(path.join(packsDir, `${spec.id}.json`), "utf8")));
}

function localeDirs() {
  if (!existsSync(stringsDir)) return [];
  return readdirSync(stringsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "en")
    .map((d) => d.name)
    .sort();
}

function overlayFile(lng, pathId) {
  return path.join(stringsDir, lng, `${pathId}.json`);
}

function readOverlayFile(pipeline, lng, pathId) {
  const file = overlayFile(lng, pathId);
  if (!existsSync(file)) return null;
  const overlay = pipeline.readOverlay(JSON.parse(readFileSync(file, "utf8")));
  if (!overlay) throw new Error(`${path.relative(root, file)} is not a strings overlay`);
  return overlay;
}

/** Errors in the strings: an English file that is not the pack's, stale keys, lost placeholders. */
function checkStrings(pipeline, id, { verbose = false } = {}) {
  let errors = 0;
  const lines = [];
  for (const doc of packDocs(pipeline, id)) {
    const english = pipeline.englishStrings(doc);
    const enFile = overlayFile("en", doc.id);
    if (!existsSync(enFile) || readFileSync(enFile, "utf8") !== pipeline.serializeOverlay(english)) {
      console.log(`ERROR strings: i18n/en/${doc.id}.json is not what the pack says. Run: npm run paths -- strings`);
      errors += 1;
    }
    const total = Object.keys(english.strings).length;
    const row = [];
    for (const lng of localeDirs()) {
      let overlay;
      try {
        overlay = readOverlayFile(pipeline, lng, doc.id);
      } catch (e) {
        console.log(`ERROR strings: ${e.message}`);
        errors += 1;
        continue;
      }
      if (!overlay) {
        row.push(`${lng} 0`);
        continue;
      }
      if (overlay.path !== doc.id || overlay.lng !== lng) {
        console.log(`ERROR strings: i18n/${lng}/${doc.id}.json says it is ${overlay.lng}/${overlay.path}`);
        errors += 1;
      }
      const r = pipeline.checkOverlay(english.strings, overlay);
      for (const key of r.stale) console.log(`ERROR strings: i18n/${lng}/${doc.id}.json has "${key}", which the English does not`);
      for (const key of r.placeholders) console.log(`ERROR strings: i18n/${lng}/${doc.id}.json "${key}" changes a placeholder or markup`);
      errors += r.stale.length + r.placeholders.length;
      if (verbose) for (const key of r.numbers) console.log(`warn  strings: i18n/${lng}/${doc.id}.json "${key}" has different numbers from the English`);
      const notes = [];
      if (r.missing.length) notes.push(`${r.missing.length} missing`);
      if (r.outdated.length) notes.push(`${r.outdated.length} outdated`);
      row.push(`${lng} ${r.translated}${notes.length ? ` (${notes.join(", ")})` : ""}`);
    }
    lines.push(`strings ${doc.id}: ${total} English; ${row.join("; ") || "no translations"}`);
  }
  for (const line of lines) console.log(line);
  return errors;
}

function writeEnglish(pipeline, id) {
  mkdirSync(path.join(stringsDir, "en"), { recursive: true });
  for (const doc of packDocs(pipeline, id)) {
    const english = pipeline.englishStrings(doc);
    writeFileSync(overlayFile("en", doc.id), pipeline.serializeOverlay(english));
    console.log(`wrote src/paths/packs/i18n/en/${doc.id}.json (${Object.keys(english.strings).length} strings)`);
  }
}

/** `{ pathId: { key: english } }`: what <lng> still needs, each sentence once. */
function stringsTodo(pipeline, lng, out) {
  if (!lng) fail("usage: strings todo <lng> [--out file]");
  const todo = {};
  let count = 0;
  for (const doc of packDocs(pipeline)) {
    const english = pipeline.englishStrings(doc).strings;
    const need = pipeline.stringsToTranslate(english, readOverlayFile(pipeline, lng, doc.id));
    const seen = new Set();
    const unique = {};
    for (const [key, text] of Object.entries(need)) {
      if (seen.has(text)) continue;
      seen.add(text);
      unique[key] = text;
    }
    if (Object.keys(unique).length) {
      todo[doc.id] = unique;
      count += Object.keys(unique).length;
    }
  }
  const bytes = `${JSON.stringify(todo, null, 2)}\n`;
  if (out) {
    writeFileSync(out, bytes);
    console.log(`wrote ${out}: ${count} strings for ${lng}`);
  } else process.stdout.write(bytes);
}

/** Take `{ pathId: { key: translation } }` into i18n/<lng>/, stamped with today's English. */
function stringsMerge(pipeline, lng, file) {
  if (!lng || !file) fail("usage: strings merge <lng> <file>");
  const incoming = JSON.parse(readFileSync(file, "utf8"));
  const docs = new Map(packDocs(pipeline).map((d) => [d.id, d]));
  let refused = 0;
  for (const [pathId, translations] of Object.entries(incoming)) {
    const doc = docs.get(pathId);
    if (!doc) {
      console.log(`refused: no Path "${pathId}"`);
      refused += 1;
      continue;
    }
    const english = pipeline.englishStrings(doc).strings;
    const merged = pipeline.mergeTranslations(english, readOverlayFile(pipeline, lng, pathId), pathId, lng, translations);
    for (const key of merged.refused) console.log(`refused: ${lng}/${pathId} "${key}" is not an English key, or is empty`);
    refused += merged.refused.length;
    mkdirSync(path.join(stringsDir, lng), { recursive: true });
    writeFileSync(overlayFile(lng, pathId), pipeline.serializeOverlay(merged.overlay));
    const r = pipeline.checkOverlay(english, merged.overlay);
    console.log(`wrote src/paths/packs/i18n/${lng}/${pathId}.json: ${r.translated} of ${Object.keys(english).length}`);
    for (const key of r.placeholders) console.log(`ERROR ${lng}/${pathId} "${key}" changes a placeholder or markup`);
    for (const key of r.numbers) console.log(`warn  ${lng}/${pathId} "${key}" has different numbers: ${english[key]}\n      ${merged.overlay.strings[key]}`);
  }
  if (refused > 0) fail(`${refused} refused.`);
}

function strings(pipeline, args, out) {
  const [sub, a, b] = args;
  if (sub === "todo") return stringsTodo(pipeline, a, out);
  if (sub === "merge") return stringsMerge(pipeline, a, b);
  writeEnglish(pipeline, sub);
  const errors = checkStrings(pipeline, sub, { verbose: true });
  if (errors > 0) fail(`${errors} errors.`);
}

function scaffold(id, title, kind) {
  if (!/^[a-z0-9-]+$/.test(id ?? "")) fail("usage: new <lowercase-id> \"Title\" <mechanics|theory>");
  if (kind !== "mechanics" && kind !== "theory") fail("kind must be mechanics or theory");
  const file = path.join(specsDir, `${id}.ts`);
  if (existsSync(file)) fail(`${file} already exists`);
  const name = id.replace(/-([a-z0-9])/g, (_m, c) => c.toUpperCase());
  const stepIds = ["first-step", "middle-step", "last-step"];
  const stepStub = (id) => `    {
      id: "${id}",
      title: "TODO",
      goal: "TODO",
      why: "TODO: why this Step, in at least one real sentence for the player.",
      howTo: ["TODO: technique, taught in words."],
      payoff: "TODO: what they will hear themselves gain.",
      exercises: [
        // Three to five. Vary anything that would get boring: see plans/PATHS_PIPELINE.md.
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
    },`;
  const levelStub = (level, stepId) => `    {
      id: "${level}",
      title: "TODO",
      summary: "TODO: what this Level is, in a sentence.",
      startHereIf: ["TODO: something a player can check, with a number: a tempo or a count.", "TODO: another one."],
      steps: ["${stepId}"],
      warmups: [
        {
          id: "warm-${level}",
          title: "TODO",
          purpose: "TODO: short, musical, moving through positions.",
          howTo: ["TODO"],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "C", "D", "E", "G", "B"] },
            pooled: ["key"],
            // TODO: return the notes for one value of each dimension. Declare any
            // dimension that changes difficulty under notPooled, with the reason.
            build: () => ({ tab: repeat("/8 5:5 5:7 5:8 5:7", 2), position: 5, shifts: true }),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "${stepId}.first", fallback: 60 },
          rungs: ladder(60, 100, 10),
          minutes: 4,
        },
      ],
    },`;
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
${stepIds.map(stepStub).join("\n")}
  ],
  levels: [
${["beginner", "intermediate", "advanced"].map((level, i) => levelStub(level, stepIds[i])).join("\n")}
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
} else if (command === "strings") {
  strings(await loadPipeline(), positional, flagAt >= 0 ? outDir : undefined);
} else if (["gen", "check", "validate", "review", "all"].includes(command)) {
  const pipeline = await loadPipeline();
  if (command === "gen") gen(pipeline, positional[0]);
  if (command === "check") check(pipeline, positional[0]);
  if (command === "validate") validateFile(pipeline, positional[0]);
  if (command === "review") review(pipeline, positional[0], outDir);
  if (command === "all") {
    gen(pipeline);
    writeEnglish(pipeline);
    check(pipeline);
    review(pipeline, undefined, outDir);
  }
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 14).join("\n"));
  process.exit(command ? 1 : 0);
}
