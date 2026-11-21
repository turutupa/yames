/**
 * The tools' tip catalogue moved from TypeScript constants into
 * `src/locales/en/toolTips.json` (leg c5c3, `scripts/tool-tips-extract.ts`).
 * English must say exactly what it said before: the same strings, in the same
 * order, under the same vocabularies, scenarios and severities.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_MODE_CATALOG, PRO_MODE_CATALOG, TEMPLATE_CATALOG } from "./templateCatalog";

const file = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "src/locales/en/toolTips.json"), "utf8"),
) as { toolTips: Record<string, unknown> };

describe("the English tip catalogue as data", () => {
  it("is byte for byte the catalogue the code reads, in the same order", () => {
    expect(JSON.stringify(file.toolTips.catalog)).toBe(JSON.stringify(TEMPLATE_CATALOG));
    expect(JSON.stringify(file.toolTips.defaultMode)).toBe(JSON.stringify(DEFAULT_MODE_CATALOG));
    expect(JSON.stringify(file.toolTips.proMode)).toBe(JSON.stringify(PRO_MODE_CATALOG));
  });
});
