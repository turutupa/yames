// The proof-reader's input: each Exercise's tab, purpose and how-to, and its cues with their triggers.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { PathDoc } from "/home/dgx-delgado/yames-coach-cues2/src/paths/format";

const PATH = process.env.CUE_PATH ?? "blues-pentatonics";
const doc = JSON.parse(readFileSync(`/home/dgx-delgado/yames-coach-cues2/src/paths/packs/${PATH}.json`, "utf8")) as PathDoc;
const all = [...doc.steps.flatMap((s) => s.exercises), ...(doc.levels ?? []).flatMap((l) => l.warmups)];
const out: string[] = [];
for (const ex of all) {
  out.push(`## ${ex.id}: "${ex.title}"`);
  out.push(`Purpose: ${ex.purpose}`);
  out.push(`Tab: ${ex.tab}`);
  ex.howTo.forEach((h, i) => out.push(`How-to ${i}: ${h}`));
  if (ex.variation) out.push(`(Changes between Takes: ${ex.variation.dimensions.join(", ")}; the tab above is the first version, so a cue may name no string, fret or note.)`);
  for (const [i, c] of (ex.cues ?? []).entries()) out.push(`- cue ${i} [${c.general ? "general" : c.when}]: ${c.say}`);
  out.push("");
}
mkdirSync(`/tmp/coach-cues2/proof-${PATH}`, { recursive: true });
writeFileSync(`/tmp/coach-cues2/proof-${PATH}/input.md`, out.join("\n"));
console.log(`${all.length} exercises`);
