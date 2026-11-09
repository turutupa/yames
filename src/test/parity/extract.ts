/**
 * What the app offers today, read out of its source.
 *
 * `surface.test.ts` compares this with the frozen `manifest.json`, so that a
 * capability cannot leave the product without an edit to that file, which a
 * review can see. Everything here is read from the code rather than imported
 * from it wherever the code is Rust, or wherever importing would hand the
 * check the very list it is meant to be checking.
 *
 * Plain regular expressions over source text, the way `ipc.commands.test.ts`
 * does it. A silent zero would pass everything, so the test asserts the counts
 * before it compares anything.
 */
import fs from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();

export function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function walk(dir: string, match: (file: string) => boolean, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "locales" || entry.name === "test") continue;
      walk(rel, match, out);
    } else if (match(rel)) {
      out.push(rel);
    }
  }
  return out;
}

/** Production TypeScript, without the tests and the mocks. */
export function productionTs(): string[] {
  return walk("src", (f) => /\.tsx?$/.test(f) && !/\.(test|spec|bench)\.tsx?$/.test(f));
}

function productionRust(): string[] {
  return walk("src-tauri/src", (f) => f.endsWith(".rs"));
}

const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

// ── Commands ─────────────────────────────────────────────────────────────

/** Everything inside `tauri::generate_handler![ … ]`. */
export function registeredCommands(): string[] {
  const lib = read("src-tauri/src/lib.rs");
  const start = lib.indexOf("generate_handler![");
  if (start < 0) throw new Error("generate_handler! not found in lib.rs");
  const block = lib.slice(start, lib.indexOf("]", start));
  return sorted(
    block
      .split(/[\n,]/)
      .map((line) => line.trim().replace(/^.*::/, ""))
      .filter((line) => /^[a-z][a-z0-9_]*$/.test(line)),
  );
}

const INVOKE = /\binvoke(?:<[^(]*>)?\(\s*"([a-z0-9_]+)"/g;

/** Commands `src/ipc.ts` itself calls: the IPC surface proper. */
export function ipcCommands(): string[] {
  return sorted([...read("src/ipc.ts").matchAll(INVOKE)].map((m) => m[1]));
}

/** Commands called from anywhere else. `app_ready` is one. */
export function commandsInvokedOutsideIpc(): string[] {
  const found: string[] = [];
  for (const file of productionTs()) {
    if (file === path.join("src", "ipc.ts")) continue;
    for (const m of read(file).matchAll(INVOKE)) found.push(m[1]);
  }
  return sorted(found);
}

// ── IPC wrappers, and whether anything still calls them ──────────────────

export function ipcWrappers(): string[] {
  const ipc = read("src/ipc.ts");
  return sorted(
    [...ipc.matchAll(/^export (?:async )?function ([A-Za-z_]\w*)/gm)].map((m) => m[1]),
  );
}

/**
 * Wrappers with no caller outside `ipc.ts` itself.
 *
 * This is what catches the deletion the command list cannot: take a feature's
 * screen away, leave its plumbing behind, and every command is still there.
 * What goes is the last call to the wrapper.
 */
export function ipcWrappersWithoutCaller(): string[] {
  const others = productionTs()
    .filter((f) => f !== path.join("src", "ipc.ts"))
    .map(read)
    .join("\n");
  const known = new Set(others.match(/\b[A-Za-z_]\w*\b/g) ?? []);
  const ipc = read("src/ipc.ts");
  return ipcWrappers().filter((name) => {
    if (known.has(name)) return false;
    // A helper another wrapper is built on is reached through that wrapper.
    const uses = ipc.match(new RegExp(`\\b${name}\\b`, "g")) ?? [];
    return uses.length <= 1;
  });
}

// ── Events ───────────────────────────────────────────────────────────────

export function eventsListened(): string[] {
  const ipc = read("src/ipc.ts");
  return sorted([...ipc.matchAll(/\blisten(?:<[^(]*>)?\(\s*"([a-z0-9-]+)"/g)].map((m) => m[1]));
}

export function eventsEmitted(): string[] {
  const found: string[] = [];
  for (const file of productionRust()) {
    for (const m of read(file).matchAll(/\bemit\(\s*"([a-z0-9-]+)"/g)) found.push(m[1]);
  }
  return sorted(found);
}

// ── Settings keys ────────────────────────────────────────────────────────

export interface SettingsKeyUse {
  store: "settings.json" | "songs.json" | "localStorage";
  read: boolean;
  written: boolean;
}

/** A key built at run time, named by its shape. */
const BUILT_KEYS: Record<string, string> = {
  hintShownKey: "hints.<id>",
  gainStoreKey: "inputGain_<device>",
  cameraNudgeKey: "songs.cameraNudgeMs.<device>",
  nudgeKey: "songs.cameraNudgeMs.<device>",
};

/** Identifiers that hold a built key, per file, where a plain scan cannot tell. */
const IDENT_IN_FILE: Record<string, Record<string, string>> = {
  [path.join("src", "takes", "JamTakeView.tsx")]: { key: "songs.cameraNudgeMs.<device>" },
};

/**
 * Every key anything reads from or writes to a store, and which of the two.
 *
 * Keys named by a constant are resolved through the constant, in the same file
 * first. An unresolved identifier is ignored, so the count in the test is what
 * says the scan is still seeing them all.
 */
export function settingsKeys(): Record<string, SettingsKeyUse> {
  const keys: Record<string, SettingsKeyUse> = {};
  const note = (key: string, store: SettingsKeyUse["store"], op: "read" | "written") => {
    keys[key] ??= { store, read: false, written: false };
    keys[key][op] = true;
  };

  const constant = /\bconst ([A-Za-z_]\w*)(?:\s*:\s*\w+)?\s*=\s*"([^"\n]+)"/g;
  const files = productionTs().filter((f) => !f.includes(path.join("paths", "")));
  const global = new Map<string, string>();
  const sources = new Map(files.map((f) => [f, read(f)]));
  for (const text of sources.values()) {
    for (const m of text.matchAll(constant)) global.set(m[1], m[2]);
  }

  const call =
    /\bstore(Load|Save)(?:<[^()]*?(?:\[\])?>)?\(\s*(?:"([^"]+)"|`([^`$]*)\$\{|([A-Za-z_]\w*)(\()?)/g;
  for (const [file, text] of sources) {
    const local = new Map<string, string>();
    for (const m of text.matchAll(constant)) local.set(m[1], m[2]);
    for (const m of text.matchAll(call)) {
      const op = m[1] === "Load" ? "read" : "written";
      const [literal, template, ident, called] = [m[2], m[3], m[4], m[5]];
      let key: string | undefined;
      if (literal) key = literal;
      else if (template === "inputGain_") key = "inputGain_<device>";
      else if (ident && called) key = BUILT_KEYS[ident];
      else if (ident) {
        key =
          IDENT_IN_FILE[file]?.[ident] ??
          BUILT_KEYS[ident] ??
          local.get(ident) ??
          global.get(ident);
      }
      if (key) note(key, "settings.json", op);
    }
  }

  // `ipc.ts` keeps the legacy songs file in a store of its own.
  const ipc = read("src/ipc.ts");
  const songsFile = ipc.slice(ipc.indexOf("async function getSongStore"));
  for (const m of songsFile.matchAll(/\bstore\.(get|set)(?:<[^()]*>)?\(\s*([A-Z_]+)/g)) {
    const key = global.get(m[2]);
    if (key) note(key, "songs.json", m[1] === "get" ? "read" : "written");
  }

  // The coach's two browser-side keys.
  for (const text of sources.values()) {
    const local = new Map<string, string>();
    for (const m of text.matchAll(constant)) local.set(m[1], m[2]);
    for (const m of text.matchAll(/\.(getItem|setItem)\(\s*(?:"([^"]+)"|([A-Za-z_]\w*))/g)) {
      const key = m[2] ?? local.get(m[3]) ?? global.get(m[3]);
      if (key && /^coach\./.test(key)) {
        note(key, "localStorage", m[1] === "getItem" ? "read" : "written");
      }
    }
  }

  // Rust names its stores `store` or `settings`, and a few keys by a constant.
  const rustSources = productionRust().map(read);
  const rustConstants = new Map<string, string>();
  for (const text of rustSources) {
    for (const m of text.matchAll(/\bconst ([A-Z_]+): &str = "([^"]+)"/g)) {
      rustConstants.set(m[1], m[2]);
    }
  }
  for (const text of rustSources) {
    const access = /\b(?:\w*store\w*|settings)\s*\.\s*(get|set)\(\s*(?:"([^"]+)"|([A-Z_]+)\b)/g;
    for (const m of text.matchAll(access)) {
      const key = m[2] ?? rustConstants.get(m[3]);
      if (key) note(key, "settings.json", m[1] === "get" ? "read" : "written");
    }
  }
  return Object.fromEntries(Object.entries(keys).sort(([a], [b]) => a.localeCompare(b)));
}

// ── Saved history ────────────────────────────────────────────────────────

export function sqliteTables(): string[] {
  return sorted([...read("src-tauri/src/db.rs").matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1]));
}

// ── Lists the code exports as data ───────────────────────────────────────

export function localeDirs(): string[] {
  return sorted(
    fs
      .readdirSync(path.join(ROOT, "src/locales"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name),
  );
}

export function zenStyles(): string[] {
  const union = /export type ZenStyle =([^;]+);/.exec(read("src/containers/zen/ZenEffects.tsx"));
  return sorted([...(union?.[1] ?? "").matchAll(/"([a-z]+)"/g)].map((m) => m[1]));
}

export function fileAssociations(): string[] {
  const conf = JSON.parse(read("src-tauri/tauri.conf.json")) as {
    bundle: { fileAssociations?: Array<{ ext: string[] }> };
  };
  return sorted((conf.bundle.fileAssociations ?? []).flatMap((a) => a.ext));
}

export function windowLabels(): string[] {
  const conf = JSON.parse(read("src-tauri/tauri.conf.json")) as {
    app: { windows: Array<{ label: string }> };
  };
  return sorted(conf.app.windows.map((w) => w.label));
}
