// For every varied Exercise of a Path, which cues a variant could not say, and why.
import { SPECS } from "/home/dgx-delgado/yames-coach-cues2/src/paths/specs/index";
import { buildPath } from "/home/dgx-delgado/yames-coach-cues2/src/paths/generate";
import { cueTexts } from "/home/dgx-delgado/yames-coach-cues2/src/paths/variantText";

const id = process.env.CUE_PATH ?? "blues-pentatonics";
const doc = buildPath(SPECS.find((s) => s.id === id)!);
const all = [...doc.steps.flatMap((s) => s.exercises), ...(doc.levels ?? []).flatMap((l) => l.warmups)];
let refused = 0;
let variantsWithOwn = 0;
let cues = 0;
const byTrigger: Record<string, number> = {};
const distinct = new Set<string>();
for (const ex of all) {
  for (const c of ex.cues ?? []) {
    cues += 1;
    const k = c.general ? "general" : c.when;
    byTrigger[k] = (byTrigger[k] ?? 0) + 1;
    distinct.add(c.say);
  }
  if (!ex.cues || !ex.variation) continue;
  const first = ex.variation.variants[0];
  const exText = { purpose: ex.purpose, howTo: ex.howTo, notes: ex.notes, position: ex.position, harmony: ex.harmony, chords: ex.chords, params: first.params };
  for (const v of ex.variation.variants.slice(1)) {
    if (v.cues) variantsWithOwn += 1;
    const said = cueTexts(exText, { notes: v.notes, position: v.position, harmony: v.harmony, chords: v.chords, params: v.params }, ex.cues.map((c) => c.say));
    said.forEach((s, i) => {
      if (!s.ok) {
        refused += 1;
        console.log(`${ex.id}#${v.id} [${ex.cues![i].when}] "${ex.cues![i].say}": ${s.reason}`);
      } else if (s.text !== ex.cues![i].say) console.log(`  rewritten ${ex.id}#${v.id}: "${ex.cues![i].say}" -> "${s.text}"`);
    });
  }
}
const withCues = all.filter((e) => e.cues?.length).length;
console.log(`${refused} refusals; ${variantsWithOwn} variants with cues of their own`);
console.log(`${withCues} of ${all.length} Exercises have cues; ${cues} cues, ${distinct.size} distinct sentences`);
console.log(JSON.stringify(byTrigger));
