// ../../../tmp/coach-cues2/todo-entry.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
var PATH = process.env.CUE_PATH ?? "blues-pentatonics";
var doc = JSON.parse(readFileSync(`/home/dgx-delgado/yames-coach-cues2/src/paths/packs/${PATH}.json`, "utf8"));
var all = [...doc.steps.flatMap((s) => s.exercises), ...(doc.levels ?? []).flatMap((l) => l.warmups)];
var todo = {};
var context = [];
var seen = /* @__PURE__ */ new Map();
for (const ex of all) {
  (ex.cues ?? []).forEach((c, i) => {
    const key = `exercise.${ex.id}.cue.${i}`;
    const what = `${c.general ? "general" : c.when} in "${ex.title}" (${ex.id})`;
    if (seen.has(c.say)) return;
    seen.set(c.say, key);
    todo[key] = c.say;
    context.push(`${key}
  "${c.say}"
  for: ${what}`);
  });
}
var dir = `/tmp/coach-cues2/i18n-${PATH}`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/todo.json`, `${JSON.stringify({ [PATH]: todo }, null, 2)}
`);
writeFileSync(`${dir}/context.txt`, context.join("\n") + "\n");
console.log(`${Object.keys(todo).length} distinct cues`);
