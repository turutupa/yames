/**
 * Settings → Coach on a phone (leg c6a, judgement call 28): Answers (the
 * selector's rows, "not on this device", nothing to press), Suggestions (with
 * the practice reminder) and Notebook. No Voice, no In the tools.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../../platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../platform")>()),
  IS_MOBILE: true,
}));

import i18n from "../../i18n";
import { __resetCoachLoaderForTests } from "../../hooks/coachLoader";
import { CoachSettingsPhone } from "./CoachSettingsGroups";

const t = i18n.t.bind(i18n);

afterEach(() => {
  cleanup();
  __resetCoachLoaderForTests();
});

describe("Settings → Coach on a phone", () => {
  it("shows Answers, Suggestions and Notebook, in that order, and not Voice or In the tools", () => {
    render(<CoachSettingsPhone />);
    const ids = Array.from(document.querySelectorAll("#settings-coach [data-coach-group]")).map((el) =>
      el.getAttribute("data-coach-group"),
    );
    expect(ids).toEqual(["answers", "suggestions", "notebook"]);
    expect(screen.queryByText(t("settings.coach.voiceName"))).toBeNull();
    expect(screen.queryByText(t("settings.coach.scoringMode"))).toBeNull();
    expect(document.querySelector(".experimental-badge")?.textContent).toBe(t("settings.coach.beta"));
  });

  it("each model's row says it is not on this device, with nothing to press", () => {
    render(<CoachSettingsPhone />);
    const tiers = screen.getByTestId("coach-phone-tiers");
    const rows = tiers.querySelectorAll("li");
    expect(rows).toHaveLength(2);
    for (const row of Array.from(rows)) expect(row.textContent).toContain(t("coachModel.why.phone"));
    const answers = document.querySelector('[data-coach-group="answers"]')!;
    expect(answers.querySelectorAll("button")).toHaveLength(0);
    expect(screen.getByTestId("coach-answers-line").textContent).toBe(t("settings.coach.answersRuleMade"));
  });

  it("carries the practice reminder in Suggestions", () => {
    render(<CoachSettingsPhone />);
    const suggestions = document.querySelector('[data-coach-group="suggestions"]')!;
    expect(suggestions.querySelector('[data-testid="coach-reminder-row"]')).toBeTruthy();
    expect(suggestions.textContent).toContain(t("notebook.suggestions.label"));
  });
});
