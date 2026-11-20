import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "../../i18n";
import { NowBlock } from "./NowBlock";

const block = (heard: Parameters<typeof NowBlock>[0]["heard"]) =>
  render(<NowBlock chord="Am" next={null} scales={["A minor pentatonic"]} fretboardOpen={false} onToggleFretboard={null} heard={heard} />);

describe("the Jam's 'heard' line", () => {
  it("is not there unless the setting is on", () => {
    block(null);
    expect(screen.queryByTestId("jam-heard")).toBeNull();
  });

  it("says the key and the chord, or that it couldn't tell", () => {
    const { unmount } = block({ state: "heard", key: { root: "A", mode: "minor" }, relative: null, chord: "Dm" });
    expect(screen.getByTestId("jam-heard").textContent).toBe("Heard: A minor · Dm");
    unmount();
    const unsure = block({ state: "unsure" });
    expect(screen.getByTestId("jam-heard").textContent).toBe("Couldn't tell yet");
    unsure.unmount();
    block({ state: "chart", key: { root: "C", mode: "major" }, relative: null, chord: null });
    expect(screen.getByTestId("jam-heard").textContent).toBe("Chart: C major");
  });
});
