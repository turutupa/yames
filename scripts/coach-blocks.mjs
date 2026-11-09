/**
 * Write out the coach block catalogue's JSON Schema and GBNF grammar.
 *
 *   node scripts/coach-blocks.mjs          # write them
 *   node scripts/coach-blocks.mjs --check  # say whether they are stale, write nothing
 *
 * The catalogue itself is `src/coach/blocks/spec.ts` and it is the only file
 * to edit. Run this afterwards and commit all three: `npm run test` fails
 * while what is checked in disagrees with the spec, which is the whole point
 * of generating them — a schema and a grammar written by hand are two more
 * lists to forget.
 *
 * It goes through Vite rather than importing the TypeScript directly because
 * the app's imports have no file extensions, which is what Vite resolves and
 * bare Node does not. Vite is already a devDependency; nothing new is needed.
 */

import { writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src", "coach", "blocks");

async function load() {
  const server = await createServer({
    root: ROOT,
    appType: "custom",
    logLevel: "warn",
    // Nothing here needs a browser bundle, and the scan crawls every .html in
    // the repo looking for one — the screenshot harness among them, which it
    // then fails to parse and shouts about. One TypeScript module is all we
    // are after.
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null },
  });
  try {
    return await server.ssrLoadModule("/src/coach/blocks/schema.ts");
  } finally {
    await server.close();
  }
}

/**
 * What is on disk, with its line endings flattened.
 *
 * `core.autocrlf` is true on the owner's machine, so a checked-in file comes
 * back out of git as CRLF while everything generated here is LF. Comparing
 * the bytes would report every file as stale on every fresh clone.
 */
async function currentText(path) {
  try {
    return (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
  } catch {
    return null;
  }
}

const { jsonSchemaText, buildGbnf } = await load();

const files = [
  { path: join(OUT_DIR, "coach-answer.schema.json"), text: jsonSchemaText() },
  { path: join(OUT_DIR, "coach-answer.gbnf"), text: buildGbnf() },
];

const check = process.argv.includes("--check");
let stale = 0;

for (const file of files) {
  const now = await currentText(file.path);
  const same = now === file.text;
  if (same) {
    console.log(`up to date  ${file.path}`);
    continue;
  }
  stale += 1;
  if (check) {
    console.error(`STALE       ${file.path}`);
  } else {
    await writeFile(file.path, file.text, "utf8");
    console.log(`written     ${file.path}`);
  }
}

if (check && stale > 0) {
  console.error(`\n${stale} file(s) behind the spec. Run: node scripts/coach-blocks.mjs`);
  process.exit(1);
}
