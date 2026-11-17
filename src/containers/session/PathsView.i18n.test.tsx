/** The Path and Step pages in German: the pack's own words, not only the app's. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import i18n from "../../i18n";
import { PathsView } from "./PathsView";
import type { SessionRun } from "./hooks/useSessionRun";
import { loadAllPacks } from "../../session/packs";
import { ALT, NOW } from "../../session/testKit";

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("en");
});

describe("a Step page in de", () => {
  it("shows German Step and Exercise text", async () => {
    await i18n.changeLanguage("de");
    const alt = (await loadAllPacks("de")).find((d) => d.id === ALT.id)!;
    const session = {
      paths: [alt],
      progress: { states: [{ pathId: alt.id, startedAt: NOW, updatedAt: NOW }], takes: [], ceilings: [] },
      actions: { chooseStep: vi.fn(), chooseLevel: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() },
    } as unknown as SessionRun;
    render(<PathsView session={session} />);
    expect(screen.getByTestId(`path-card-${alt.id}`)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(`path-card-${alt.id}`));
    fireEvent.click(screen.getByTestId(`step-row-${alt.steps[0].id}`));
    const page = screen.getByTestId("step-detail");
    const step = alt.steps[0];
    expect(step.title).not.toBe(ALT.steps[0].title);
    expect(page).toHaveTextContent(step.title);
    expect(page).toHaveTextContent(step.why);
    expect(page).toHaveTextContent(step.exercises[0].title);
    expect(page).not.toHaveTextContent(ALT.steps[0].why);
    expect(page).not.toHaveTextContent(ALT.steps[0].exercises[0].title);
  });
});
