// Prints, for every Exercise of the pack, what a cue writer needs.
import { readFileSync, writeFileSync } from "node:fs";
import { possibleTriggers, placeTriggers } from "/home/dgx-delgado/yames-coach-cues2/src/paths/cues";
import { exerciseWithVariant } from "/home/dgx-delgado/yames-coach-cues2/src/paths/variants";
import type { PathDoc, Exercise } from "/home/dgx-delgado/yames-coach-cues2/src/paths/format";

const PATH = process.env.CUE_PATH ?? "blues-pentatonics";
const doc = JSON.parse(readFileSync(`/home/dgx-delgado/yames-coach-cues2/src/paths/packs/${PATH}.json`, "utf8")) as PathDoc;
const out: string[] = [];
const all: Array<{ ex: Exercise; step: string; order: number | string }> = [
  ...doc.steps.flatMap((s) => s.exercises.map((ex) => ({ ex, step: s.id, order: s.order }))),
  ...(doc.levels ?? []).flatMap((l) => l.warmups.map((ex) => ({ ex, step: `warmup ${l.id}`, order: "-" }))),
];
for (const { ex, step, order } of all) {
  const concrete = ex.variation?.variants.length ? ex.variation.variants.map((v) => exerciseWithVariant(ex, v)) : [ex];
  const can = new Set<string>();
  for (const c of concrete) for (const t of possibleTriggers(c)) can.add(t);
  const perBar = Array.from({ length: ex.bars }, (_v, i) => `b${i + 1}:${placeTriggers(ex, [i + 1]).join(",") || "-"}`).join(" ");
  out.push(`## ${ex.id}  (Step ${order} ${step}) "${ex.title}"`);
  out.push(`grading: ${ex.grading}; pass: ${ex.passBars.map((b) => b.metric).join(", ") || "none"}; bars ${ex.bars}; loops ${ex.loops}; pick ${ex.pickPlan}; variants ${concrete.length}${ex.variation ? ` (${ex.variation.dimensions.join(",")})` : ""}`);
  out.push(`triggers possible: ${[...can].join(", ") || "none"}`);
  out.push(`base bars: ${perBar}`);
  out.push(`tab: ${ex.tab}`);
  out.push(`purpose: ${ex.purpose}`);
  ex.howTo.forEach((h, i) => out.push(`howTo ${i}: ${h}`));
  out.push(`coachLine: ${ex.coachLine}`);
  if (ex.selfCheck) out.push(`selfCheck: ${ex.selfCheck.join(" | ")}`);
  out.push("");
}
writeFileSync(`/tmp/coach-cues2/${PATH}-dump.txt`, out.join("\n"));
console.log(`${all.length} exercises`);
