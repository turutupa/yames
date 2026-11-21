/**
 * Settings → Coach in five groups (leg c6a, DESIGN 8): Answers, Voice,
 * Suggestions, Notebook, In the tools, in that order, each row in its group;
 * the Beta badge on the section's head; the Answers line true today (no
 * language switched on: the coach answers from Takes and Paths).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import i18n from "../../i18n";
import { __setModelLangsForTests } from "../../coach/ask/model";
import { CoachSettingsSection } from "./CoachSettingsSection";
import { answersLine, modelUsable } from "./CoachSettingsGroups";
import type { BrainTier } from "../../types";

const t = i18n.t.bind(i18n);

function renderSection(choice: BrainTier = "off") {
  render(
    <CoachSettingsSection
      coachBrainTier={choice}
      setCoachBrainTier={vi.fn()}
      coachVoiceMode="silent"
      setCoachVoiceMode={vi.fn()}
      coachVoiceName="lessac"
      setCoachVoiceName={vi.fn()}
      coachVerbosity="default"
      setCoachVerbosity={vi.fn()}
      coachMode="default"
      setCoachMode={vi.fn()}
      coachStance="strict"
      setCoachStance={vi.fn()}
      modelStatus={null}
      setModelStatus={vi.fn()}
      modelDownloading={false}
      studioAvailable
      standardAvailable
      brainUpdateAvailable={false}
      availableVoices={[]}
      voiceDiagnostics={[]}
      jamCues={false}
      setJamCues={vi.fn()}
      jamHear={false}
      setJamHear={vi.fn()}
      onStartDownload={vi.fn()}
      onRequestDownload={vi.fn()}
    />,
  );
}

const group = (id: string) => document.querySelector<HTMLElement>(`#settings-coach [data-coach-group="${id}"]`)!;

afterEach(() => {
  cleanup();
  __setModelLangsForTests(null);
});

describe("Settings → Coach's groups", () => {
  it("five groups, in DESIGN 8's order, each under its own heading", () => {
    renderSection();
    const ids = Array.from(document.querySelectorAll("#settings-coach [data-coach-group]")).map((el) =>
      el.getAttribute("data-coach-group"),
    );
    expect(ids).toEqual(["answers", "voice", "suggestions", "notebook", "tools"]);
    for (const id of ids) {
      expect(screen.getByRole("group", { name: t(`settings.coach.groups.${id}`) })).toBeTruthy();
    }
  });

  it("keeps the Beta badge on the section's head", () => {
    renderSection();
    const head = document.querySelector("#settings-coach > .settings-section-title")!;
    expect(head.textContent).toContain(t("settings.coach.title"));
    expect(head.querySelector(".experimental-badge")?.textContent).toBe(t("settings.coach.beta"));
  });

  it("puts each row in its group", () => {
    renderSection();
    expect(group("answers").textContent).toContain(t("settings.coach.brain"));
    expect(group("voice").textContent).toContain(t("settings.coach.voice"));
    expect(group("voice").textContent).toContain(t("settings.coach.voiceName"));
    expect(group("voice").textContent).toContain(t("jam.cues.label"));
    expect(group("suggestions").querySelector('[data-testid="coach-reminder-row"]')).toBeTruthy();
    expect(group("suggestions").textContent).toContain(t("notebook.suggestions.label"));
    expect(group("notebook").querySelector('[data-testid="coach-notebook-group"]')).toBeTruthy();
    const tools = group("tools");
    for (const key of ["settings.coach.scoringMode", "settings.coach.stance", "settings.coach.verbosity", "jam.hear.label"]) {
      expect(tools.textContent).toContain(t(key));
    }
    // "Tools only" stays on Scoring mode and Coaching style, and nowhere else.
    expect(tools.querySelectorAll(".setting-scope-tag")).toHaveLength(2);
    expect(document.querySelectorAll("#settings-coach .setting-scope-tag")).toHaveLength(2);
  });

  it("the Answers line: with no language switched on, the coach answers from Takes and Paths", () => {
    renderSection("standard");
    expect(screen.getByTestId("coach-answers-line").textContent).toBe(t("settings.coach.answersRuleMade"));
  });

  it("the Answers line names the languages once one is switched on, for the chosen model only", () => {
    __setModelLangsForTests({ standard: ["en", "es"], full: [] });
    expect(answersLine("standard", "en", true)).toEqual({
      key: "settings.coach.answersLangs",
      params: { langs: "English and Spanish" },
    });
    expect(answersLine("full", "en", true).key).toBe("settings.coach.answersRuleMade");
    expect(answersLine("off", "en", true).key).toBe("settings.coach.answersRuleMade");
  });

  // Review c6a L1: "In its own words in: …" only with a model this device can use.
  it("with a language switched on, the line names it only while the chosen model is usable here", () => {
    __setModelLangsForTests({ standard: ["en"], full: ["en"] });
    for (const state of ["ready", "loading", "waiting", "onDisk"] as const) {
      expect(modelUsable({ state }), state).toBe(true);
      expect(answersLine("standard", "en", modelUsable({ state })).key, state).toBe("settings.coach.answersLangs");
    }
    for (const state of ["notDownloaded", "failed", "notOnThisDevice"] as const) {
      expect(modelUsable({ state }), state).toBe(false);
      expect(answersLine("standard", "en", modelUsable({ state })).key, state).toBe("settings.coach.answersRuleMade");
    }
    expect(modelUsable(undefined)).toBe(false);
    expect(answersLine("full", "en", modelUsable(null)).key).toBe("settings.coach.answersRuleMade");
  });

  // Review c6a L3: "Remove models" sits in Answers and also removes the voices; its label says so.
  it("the Remove button in Answers names the voices it also removes", () => {
    expect(t("settings.coach.removeModels")).toBe("Remove models and voices");
  });

  it("rendered: Standard chosen with its language on but not downloaded says the coach answers from Takes and Paths", () => {
    __setModelLangsForTests({ standard: ["en", "es"], full: [] });
    renderSection("standard");
    expect(screen.getByTestId("coach-answers-line").textContent).toBe(t("settings.coach.answersRuleMade"));
  });
});
