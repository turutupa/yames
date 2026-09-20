/**
 * The About panel's update row.
 *
 * Written the day the owner reported that the check disappears: "there's a
 * button for check for updates, once a user clicks on it, there's no way of
 * re-triggering that button, it disappears." The row used to offer the
 * button in `idle` and nowhere else, so the first check was the only one
 * this session — a result of "up to date" replaced the button with the
 * words and left nothing to press. A release published a minute later was
 * unreachable without restarting the app.
 *
 * What is held here is the rule, not the wording: there is always a way to
 * ask again EXCEPT while an answer is already on its way.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { UpdateStatus } from "../main-window/hooks/useAppUpdates";
import { AboutSection } from "./AboutSection";

afterEach(cleanup);

const view = (updateStatus: UpdateStatus, onCheckUpdate = vi.fn()) => {
  render(
    <AboutSection
      appVersion="1.2.1"
      updateStatus={updateStatus}
      latestVersion="1.2.2"
      onInstallUpdate={vi.fn()}
      onCheckUpdate={onCheckUpdate}
    />,
  );
  return onCheckUpdate;
};

/** The button that asks the updater, by the class the row gives only to it. */
const checkButton = () => document.querySelector(".update-check-btn");

describe("asking for updates again", () => {
  // The three answers a check can land on. Every one of them is a dead end
  // without a way back to the updater.
  for (const status of ["idle", "up-to-date", "failed"] as const) {
    it(`offers the check when the last answer was "${status}"`, () => {
      const onCheck = view(status);
      const button = checkButton();
      expect(button, `no way to check again after "${status}"`).not.toBeNull();
      fireEvent.click(button!);
      expect(onCheck).toHaveBeenCalledTimes(1);
    });
  }

  // The two where the answer is already coming. A second press would either
  // do nothing or start a second download.
  for (const status of ["checking", "downloading"] as const) {
    it(`does not offer it while "${status}"`, () => {
      view(status);
      expect(checkButton(), `"${status}" is not a moment to ask again`).toBeNull();
    });
  }

  it("offers the install instead when there is one to install", () => {
    view("available");
    expect(document.querySelector(".update-available-btn")).not.toBeNull();
    expect(checkButton(), "checking again is not the useful act here").toBeNull();
  });

  it("says a check failed rather than showing an empty row", () => {
    view("failed");
    // The status arm for "failed" did not exist: the row rendered the label
    // "Updates" and nothing beside it.
    expect(screen.getByText("Check failed")).toBeTruthy();
  });

  it("says it is up to date, and still lets you look again", () => {
    view("up-to-date");
    expect(screen.getByText(/Up to date/)).toBeTruthy();
    expect(screen.getByText("Check again")).toBeTruthy();
  });
});
