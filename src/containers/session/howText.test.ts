import { describe, expect, it } from "vitest";
import { howText } from "./SessionView";

describe("the ready screen's one how paragraph (acceptance P1-4)", () => {
  it("drops the sentence naming the fret the hand line gives", () => {
    expect(
      howText("First finger on fret 5, one finger per fret. Walk up and back on the A string.", { fret: 5 }, ["The bar: 85%."]),
    ).toBe("Walk up and back on the A string. The bar: 85%.");
  });

  it("keeps a sentence whose numbers only contain the fret's digits", () => {
    expect(howText("Eighth notes, 60 BPM up to a pass at 100.", { fret: 10 }, [])).toBe("Eighth notes, 60 BPM up to a pass at 100.");
    expect(howText("Start at fret 15.", { fret: 5 }, [])).toBe("Start at fret 15.");
  });

  it("works in a language without spaces, and with no fret at all", () => {
    expect(howText("人差し指を5フレットに。Aの弦を往復します。", { fret: 5 }, [])).toBe("Aの弦を往復します。");
    expect(howText("Open strings only.", { fret: 0 }, [null, "Caveat."])).toBe("Open strings only. Caveat.");
  });
});
