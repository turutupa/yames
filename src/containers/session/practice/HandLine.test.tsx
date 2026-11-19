import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../../../i18n";
import { HandLine } from "./HandLine";

afterEach(cleanup);

describe("the Hand line", () => {
  it("names a chord shape instead of one finger per fret (fingering audit 2)", () => {
    render(<HandLine position={{ fret: 1, shifts: "none", chord: "E" }} />);
    expect(screen.getByTestId("practice-hand").textContent).toBe("Hand: open E chord shape.");
    cleanup();
    render(<HandLine position={{ fret: 1, shifts: "allowed", chord: "E" }} />);
    expect(screen.getByTestId("practice-hand").textContent).toMatch(/open E chord shape; it moves/);
  });

  it("is one finger per fret from the index otherwise", () => {
    render(<HandLine position={{ fret: 5, shifts: "none" }} />);
    expect(screen.getByTestId("practice-hand").textContent).toBe("Hand: index finger at fret 5, one finger per fret.");
  });
});
