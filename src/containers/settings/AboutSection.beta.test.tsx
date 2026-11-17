/**
 * About in a test build says it is one, and on Android offers the next beta.
 * The control is every other About test: no `__YAMES_BETA__`, no channel row.
 */
import "../../test/betaMobileFlag"; // MUST be first.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IS_BETA, IS_MOBILE } from "../../platform";
import { AboutSection } from "./AboutSection";
import type { AndroidBetaUpdate } from "../../beta/useAndroidBetaUpdate";

afterEach(cleanup);

function view(beta: Partial<AndroidBetaUpdate>) {
  const androidBeta: AndroidBetaUpdate = {
    status: "idle",
    version: "",
    progress: null,
    error: null,
    check: vi.fn(),
    update: vi.fn(),
    ...beta,
  };
  render(
    <AboutSection
      appVersion="1.3.0-beta.57"
      updateStatus="idle"
      latestVersion=""
      androidBeta={androidBeta}
      onInstallUpdate={vi.fn()}
      onCheckUpdate={vi.fn()}
    />,
  );
  return androidBeta;
}

describe("the Android test build's About", () => {
  it("has both flags on", () => {
    expect(IS_BETA).toBe(true);
    expect(IS_MOBILE).toBe(true);
  });

  it("names the channel", () => {
    view({});
    expect(screen.getByTestId("about-channel").textContent).toMatch(/beta/i);
  });

  it("checks on demand", () => {
    const b = view({});
    fireEvent.click(document.querySelector(".update-check-btn")!);
    expect(b.check).toHaveBeenCalledTimes(1);
  });

  it("offers a newer build and updates on a tap", () => {
    const b = view({ status: "available", version: "1.3.0-beta.58" });
    const btn = document.querySelector(".update-available-btn")!;
    expect(btn.textContent).toMatch(/1\.3\.0-beta\.58/);
    fireEvent.click(btn);
    expect(b.update).toHaveBeenCalledTimes(1);
  });

  it("shows download progress", () => {
    view({ status: "downloading", version: "1.3.0-beta.58", progress: 0.42 });
    expect(screen.getByTestId("about-beta-updates").textContent).toMatch(/42/);
  });
});
