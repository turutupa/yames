/**
 * The URLs the app downloads its brains from are pinned twice: here, in
 * `MODEL_URLS` (what the frontend asks for), and in `models.rs`
 * `BRAIN_ARTIFACTS` (where Rust keeps each file's size and SHA-256). Rust
 * checks only a URL it knows, so the two lists must be the same.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MODEL_URLS } from "./useCoachDownload";
import { COACH_MODEL_TIERS } from "./coachLoader";

const rust = readFileSync(resolve(__dirname, "../../src-tauri/src/models.rs"), "utf8");
const table = rust.slice(rust.indexOf("pub const BRAIN_ARTIFACTS"), rust.indexOf("pub fn artifact_for"));

/** `(tier, url, bytes)` for each entry of the Rust table. */
function pinned(): { tier: string; url: string; bytes: number }[] {
  const re = /tier:\s*"([^"]+)",\s*url:\s*"([^"]+)",\s*bytes:\s*([\d_]+),/g;
  return Array.from(table.matchAll(re), (m) => ({ tier: m[1], url: m[2], bytes: Number(m[3].replace(/_/g, "")) }));
}

describe("the pinned brain files", () => {
  it("Rust pins exactly the URLs the frontend downloads, tier for tier", () => {
    const rows = pinned();
    expect(rows).toHaveLength(2);
    for (const { tier, url } of rows) {
      expect(MODEL_URLS[tier as keyof typeof MODEL_URLS]).toBe(url);
    }
  });

  it("the sizes the selector shows are the pinned sizes", () => {
    for (const { tier, bytes } of pinned()) {
      expect(COACH_MODEL_TIERS.find((t) => t.tier === tier)?.downloadBytes).toBe(bytes);
    }
  });
});
