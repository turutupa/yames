/**
 * Every choice the band's pickers offer has a name in every language
 * (2026-09-16): the bass figures, the keys styles and the progressions are
 * drawn from lists in code, and an id with no translation would render as
 * the id.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { JAM_BASS_BUSY, JAM_BASS_STYLES } from "./bassFigures";
import { JAM_KEYS_STYLES_ALL } from "./keysFigures";
import { CHANGES } from "./changes";

const dir = path.join(process.cwd(), "src/locales");
const locales = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, "jam.json")));

describe("the band's choices are named everywhere", () => {
  it.each(locales)("%s", (code) => {
    const jam = JSON.parse(fs.readFileSync(path.join(dir, code, "jam.json"), "utf8")).jam;
    for (const id of JAM_BASS_STYLES) expect(jam.bassFigure?.[id], `bassFigure.${id}`).toBeTruthy();
    for (const id of JAM_BASS_BUSY) expect(jam.bassBusy?.[id], `bassBusy.${id}`).toBeTruthy();
    for (const id of JAM_KEYS_STYLES_ALL) expect(jam.keysComp?.[id], `keysComp.${id}`).toBeTruthy();
    for (const { id } of CHANGES) expect(jam.progressions?.[id], `progressions.${id}`).toBeTruthy();
    for (const key of ["bassFigure", "keysComp"]) expect(jam[key].autoNamed).toContain("{{style}}");
    expect(jam.progressions.autoNamed).toContain("{{name}}");
    for (const s of ["song", "drums", "bass", "keys", "perc"]) expect(jam.section?.[s], `section.${s}`).toBeTruthy();
  });
});
