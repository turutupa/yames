/**
 * One-shot (leg c5c3): writes `src/locales/en/toolTips.json` from the three
 * catalogues that used to live as constants in `src/coach/templateCatalog.ts`
 * (`TEMPLATE_CATALOG`, `DEFAULT_MODE_CATALOG`, `PRO_MODE_CATALOG`), the same
 * strings in the same order.
 *
 *   npx vite-node scripts/tool-tips-extract.ts
 *
 * It ran once, at the commit where the constants and the JSON sat side by
 * side and `templateCatalog.data.test.ts` proved them equal. After that commit
 * the constants are gone and `templateCatalog.ts` reads the JSON, so this
 * script only works checked out at that commit; it is kept as the record of
 * how the English file was made. The other locales are assembled by
 * `scripts/tool-tips-locales.mjs`.
 */
import fs from "node:fs";
import path from "node:path";
import * as source from "../src/coach/templateCatalog";

type Loose = Record<string, unknown>;
const s = source as unknown as Loose;

const data = {
  toolTips: {
    catalog: s.TEMPLATE_CATALOG,
    defaultMode: s.DEFAULT_MODE_CATALOG,
    proMode: s.PRO_MODE_CATALOG,
  },
};

// Relative to this file, not the shell's directory: a worktree's script must
// write into that worktree.
const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src/locales/en/toolTips.json");
fs.writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
console.log(`wrote ${out}`);
