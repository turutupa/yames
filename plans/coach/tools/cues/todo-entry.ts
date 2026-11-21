// The translators' input: each distinct English cue of the Path once, with what it is for.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { PathDoc } from "/home/dgx-delgado/yames-coach-cues2/src/paths/format";

const PATH = process.env.CUE_PATH ?? "blues-pentatonics";
const doc = JSON.parse(readFileSync(`/home/dgx-delgado/yames-coach-cues2/src/paths/packs/${PATH}.json`, "utf8")) as PathDoc;
const all = [...doc.steps.flatMap((s) => s.exercises), ...(doc.levels ?? []).flatMap((l) => l.warmups)];
const todo: Record<string, string> = {};
const context: string[] = [];
const seen = new Map<string, string>();
for (const ex of all) {
  (ex.cues ?? []).forEach((c, i) => {
    const key = `exercise.${ex.id}.cue.${i}`;
    const what = `${c.general ? "general" : c.when} in "${ex.title}" (${ex.id})`;
    if (seen.has(c.say)) return;
    seen.set(c.say, key);
    todo[key] = c.say;
    context.push(`${key}\n  "${c.say}"\n  for: ${what}`);
  });
}
const dir = `/tmp/coach-cues2/i18n-${PATH}`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/todo.json`, `${JSON.stringify({ [PATH]: todo }, null, 2)}\n`);
writeFileSync(`${dir}/context.txt`, context.join("\n") + "\n");
console.log(`${Object.keys(todo).length} distinct cues`);
