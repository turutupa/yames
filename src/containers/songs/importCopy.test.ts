/** The Songs import screen is on the phone build too (QA 2026-11-17 #24). */
import { describe, expect, it } from "vitest";
import i18n from "../../i18n";

describe("the import screen's privacy line", () => {
  it("says 'this device', which is true on a computer and on a phone", () => {
    const en = i18n.getFixedT("en");
    expect(en("songs.empty.stays")).toContain("this device");
    expect(en("songs.empty.private")).toContain("this device");
    expect(en("songs.empty.stays")).not.toMatch(/computer/i);
  });
});
