import { describe, expect, it } from "vitest";
describe("the frame-time guard needs two slow launches (card #97)", () => {
  it("flattens one session on the first slow probe and remembers it only on the second", async () => {
    const { resetStagePrefsForTest, noteSlowProbe, noteFastProbe, getStagePrefs } = await import("./prefs");
    resetStagePrefsForTest();
    expect(noteSlowProbe().remembered).toBe(false);
    expect(getStagePrefs().forceFlat).toBe(true);
    expect(noteSlowProbe().remembered).toBe(true);
    resetStagePrefsForTest();
    noteSlowProbe();
    noteFastProbe();
    expect(noteSlowProbe().remembered).toBe(false);
  });
});
