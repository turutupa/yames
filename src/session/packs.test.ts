/** The loader: each pack in the language on screen, English wherever it has no words. */
import { describe, expect, it } from "vitest";
import { loadAllPacks, loadOverlay } from "./packs";
import { ALT } from "./testKit";

describe("loadAllPacks in a language", () => {
  it("reads every pack in English by default, as the pack says", async () => {
    const docs = await loadAllPacks();
    const alt = docs.find((d) => d.id === ALT.id)!;
    expect(alt.steps[0].title).toBe(ALT.steps[0].title);
  });

  it("reads German words over the same notes and ids", async () => {
    const docs = await loadAllPacks("de");
    expect(docs.map((d) => d.id)).toEqual((await loadAllPacks()).map((d) => d.id));
    const alt = docs.find((d) => d.id === ALT.id)!;
    expect(alt.steps[0].title).not.toBe(ALT.steps[0].title);
    expect(alt.steps[0].id).toBe(ALT.steps[0].id);
    expect(alt.steps[0].exercises[0].notes).toEqual(ALT.steps[0].exercises[0].notes);
    expect(alt.steps[0].exercises[0].passBars).toEqual(ALT.steps[0].exercises[0].passBars);
  });

  it("falls back to English for a language with no overlays", async () => {
    expect(await loadOverlay(ALT.id, "xx")).toBeNull();
    expect(await loadOverlay(ALT.id, "en")).toBeNull();
    const docs = await loadAllPacks("xx");
    expect(docs.find((d) => d.id === ALT.id)!.title).toBe(ALT.title);
  });

  it("has an overlay for every Path in every locale the app ships", async () => {
    const locales = Object.keys(import.meta.glob("../locales/*/common.json"))
      .map((f) => f.split("/")[2])
      .filter((l) => l !== "en");
    for (const lng of locales) {
      for (const doc of await loadAllPacks()) {
        expect(await loadOverlay(doc.id, lng), `${lng}/${doc.id}`).not.toBeNull();
      }
    }
  });
});
