import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Every command the frontend invokes must be one Rust actually registers.
 *
 * The bug this exists for: `set_accent_mode` was written, registered and
 * tested on the Rust side and called correctly from the UI — and clicking the
 * control still did nothing, because `invoke` on an unregistered command
 * rejects and every call site is fire-and-forget. A rejected promise nobody
 * awaits is silent. The control looked broken, the tests were green, and
 * nothing anywhere said why.
 *
 * That failure mode is the same whether the cause is a typo, a command added
 * to `commands.rs` but forgotten in `generate_handler!`, or a rename done on
 * one side only. This catches all three at test time instead of at the moment
 * someone presses a button.
 */

const root = process.cwd();
const ipc = fs.readFileSync(path.join(root, "src/ipc.ts"), "utf8");
const lib = fs.readFileSync(path.join(root, "src-tauri/src/lib.rs"), "utf8");

/** Command names passed to `invoke("…")` anywhere in ipc.ts. */
function invoked(): string[] {
  const names = new Set<string>();
  for (const m of ipc.matchAll(/invoke(?:<[^>]*>)?\(\s*"([a-z0-9_]+)"/g)) {
    names.add(m[1]);
  }
  return [...names];
}

/** Everything inside `tauri::generate_handler![ … ]`. */
function registered(): Set<string> {
  const start = lib.indexOf("generate_handler![");
  expect(start, "generate_handler! not found in lib.rs").toBeGreaterThan(-1);
  const end = lib.indexOf("]", start);
  const block = lib.slice(start, end);
  return new Set(
    block
      .split(/[\n,]/)
      .map((line) => line.trim())
      .filter((line) => /^[a-z][a-z0-9_]*$/.test(line)),
  );
}

describe("the IPC surface", () => {
  const commands = invoked();
  const handlers = registered();

  it("finds both sides — a silent zero here would pass everything", () => {
    expect(commands.length).toBeGreaterThan(30);
    expect(handlers.size).toBeGreaterThan(30);
  });

  it("invokes nothing Rust does not register", () => {
    // Plugin commands are namespaced (`plugin:store|get`) and never reach
    // `generate_handler!`, so the regex above already excludes them.
    const missing = commands.filter((c) => !handlers.has(c));
    expect(missing).toEqual([]);
  });
});
