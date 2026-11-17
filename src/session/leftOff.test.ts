import { describe, expect, it } from "vitest";
import i18n from "../i18n";
import { leftOffLine } from "./coachWords";

const say = (line: { key: string; values: Record<string, string | number> }) => i18n.t(line.key, line.values);

describe("'Where you left off' says the unit (QA 2026-11-17 #22)", () => {
  it("evenness reads '78% even at 80 BPM'", () => {
    const line = leftOffLine({ headlineMetric: "timingEvenness", headlineValue: 0.78 }, 80);
    expect(say(line)).toBe("78% even at 80 BPM. Today starts slower.");
  });

  it("notes heard, accents and right notes say what the share is of", () => {
    expect(say(leftOffLine({ headlineMetric: "notesHeard", headlineValue: 0.9 }, 70))).toMatch(/^90% of the notes heard at 70 BPM/);
    expect(say(leftOffLine({ headlineMetric: "accentPlacement", headlineValue: 0.5 }, 70))).toMatch(/accents/);
    expect(say(leftOffLine({ headlineMetric: "noteIdentity", headlineValue: 0.6 }, 70))).toMatch(/right notes/);
  });

  it("extra notes, or no number, read the plain line", () => {
    expect(leftOffLine({ headlineMetric: "extraNotes", headlineValue: 3 }, 80).key).toBe("session.today.leftOffPlain");
    expect(leftOffLine({}, 80).key).toBe("session.today.leftOffPlain");
  });

  it("every language has every one, with the value and tempo in it", async () => {
    for (const lng of Object.keys(i18n.options.resources ?? {})) {
      for (const metric of ["even", "heard", "accents", "notes"]) {
        const text = i18n.getFixedT(lng)(`session.today.leftOffValue.${metric}`, { value: 78, bpm: 80 });
        expect(text, `${lng} ${metric}`).toContain("78");
        expect(text, `${lng} ${metric}`).toContain("80");
      }
    }
  });
});
