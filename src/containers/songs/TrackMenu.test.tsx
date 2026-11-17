/** The song head's part menu is valid inside its <p> (QA 2026-11-17 #26). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../../i18n";
import { TrackMenu } from "./TrackMenu";
import type { SongTrackChoice } from "../../songs/import";

afterEach(cleanup);

const track = (index: number, name: string): SongTrackChoice =>
  ({ index, name, tuning: [64, 59, 55, 50, 45, 40], capo: 0, stringCount: 6, kind: "guitar" }) as SongTrackChoice;

describe("TrackMenu inside the song head's paragraph", () => {
  it("renders no <div> in the <p>, so React has nothing to warn about", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <p>
        <TrackMenu tracks={[track(0, "Lead"), track(1, "Rhythm")]} current={0} currentName="Lead" onChoose={() => {}} />
      </p>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(container.querySelector("p div")).toBeNull();
    expect(error.mock.calls.filter((c) => String(c[0]).includes("validateDOMNesting"))).toEqual([]);
    error.mockRestore();
  });
});
