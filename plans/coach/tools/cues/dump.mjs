// Bundles an entry with esbuild (from the worktree's node_modules) and runs it.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire("/home/dgx-delgado/yames-coach-cues2/package.json");
const { build } = require("esbuild");
const entry = process.argv[2];
const outfile = "/tmp/coach-cues2/dump-out.mjs";
await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile, logLevel: "error" });
await import(pathToFileURL(outfile).href + `?t=${Date.now()}`);
