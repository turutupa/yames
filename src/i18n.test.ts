import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import i18n, { getLanguages } from "./i18n";

/**
 * The loader layer. `test/i18n.locales.test.ts` checks the files on disk; this
 * checks that the runtime bundle Vite assembles from them is the same thing —
 * the glob, the shallow merge and the `_name` extraction all being places the
 * namespace split could go wrong without any file being malformed.
 */

const LOCALES_DIR = path.resolve(process.cwd(), "src/locales");

function onDisk(lang: string): Record<string, unknown> {
  const dir = path.join(LOCALES_DIR, lang);
  const out: Record<string, unknown> = {};
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    Object.assign(out, JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  }
  delete out._name; // the loader lifts this out into the language list
  return out;
}

describe("i18n loader", () => {
  it("discovers every language directory", () => {
    const dirs = fs
      .readdirSync(LOCALES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(getLanguages().map((l) => l.code).sort()).toEqual(dirs);
  });

  it("merges a language's namespaces into the bundle the files describe", () => {
    for (const { code } of getLanguages()) {
      expect(i18n.getResourceBundle(code, "translation"), code).toEqual(onDisk(code));
    }
  });

  it("resolves a key from every namespace", () => {
    // One key per namespace file: if the glob ever drops a file, this is what
    // notices, and it names which screen went missing.
    const t = i18n.getFixedT("en");
    expect(t("common.play")).toBeTruthy();
    expect(t("nav.metronome")).toBeTruthy();
    expect(t("metronome.tap")).toBeTruthy();
    expect(t("drill.mode")).toBeTruthy();
    expect(t("coachCard.feed")).toBeTruthy();
    expect(t("zen.fullscreen")).toBeTruthy();
    expect(t("settings.coach.title")).toBeTruthy();
    expect(t("onboarding.welcome.title")).toBeTruthy();
  });

  it("puts English first in the picker and names every language natively", () => {
    const langs = getLanguages();
    expect(langs[0].code).toBe("en");
    for (const { code, name } of langs) expect(name, code).not.toBe(code);
  });
});
