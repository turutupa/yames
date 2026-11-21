// Leg rtx2: the items whose answer differs between two coach-eval outcome files (e.g. CUDA on the DGX
// and Vulkan on the RTX for the same GGUF), plus each file's median / p90 totalMs and promptMs.
//   node rtx2-diff.mjs <a.outcomes.jsonl> <b.outcomes.jsonl>
import { readFileSync } from "node:fs";

const read = (f) =>
  new Map(
    readFileSync(f, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l))
      .map((o) => [o.id, o]),
  );
const [fa, fb] = process.argv.slice(2);
const a = read(fa);
const b = read(fb);
const q = (xs, p) => {
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
for (const [name, m] of [["a", a], ["b", b]]) {
  const v = [...m.values()];
  const tot = v.map((o) => o.totalMs ?? 0);
  const pr = v.map((o) => o.promptMs ?? 0);
  const st = {};
  for (const o of v) st[o.status] = (st[o.status] ?? 0) + 1;
  console.log(`${name}: n ${v.length} status ${JSON.stringify(st)} totalMs median ${q(tot, 0.5)} p90 ${q(tot, 0.9)} max ${Math.max(...tot)}; promptMs median ${q(pr, 0.5)} p90 ${q(pr, 0.9)}; first item totalMs ${v[0]?.totalMs}`);
}
let same = 0;
const diff = [];
for (const [id, oa] of a) {
  const ob = b.get(id);
  const ta = `${oa.status}:${oa.text ?? ""}`;
  const tb = ob ? `${ob.status}:${ob.text ?? ""}` : "missing";
  if (ta === tb) same++;
  else diff.push(`${id}\n  a ${ta}\n  b ${tb}`);
}
console.log(`identical answers ${same}/${a.size}; differing ${diff.length}`);
for (const d of diff) console.log(d);
