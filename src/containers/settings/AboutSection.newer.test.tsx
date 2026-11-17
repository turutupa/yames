/**
 * The "a newer version is out" row, in the build that may have it.
 *
 * `AboutSection.newer.store.test.tsx` is the control: the same component, the
 * same props, the store build's flag — and nothing on screen. The pair is the
 * whole promise of the build-time switch, stated where a person can read it;
 * `scripts/check-mobile-bundle.mjs` states the other half against the bytes.
 */
import "../../test/sideloadFlag"; // MUST be first — see the file.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SAYS_WHEN_NEWER } from "../../platform";
import { AboutSection } from "./AboutSection";

afterEach(cleanup);

function view(newest: string) {
  const getIt = vi.fn();
  const hide = vi.fn();
  render(
    <AboutSection
      appVersion="1.2.1"
      updateStatus="idle"
      latestVersion=""
      newerVersion={{ newest, getIt, hide }}
      onInstallUpdate={vi.fn()}
      onCheckUpdate={vi.fn()}
    />,
  );
  return { getIt, hide };
}

const row = () => document.querySelector(".about-newer");

describe("the website's phone build", () => {
  it("has the flag on — every assertion below depends on it", () => {
    expect(SAYS_WHEN_NEWER).toBe(true);
  });

  it("says which version is out, in words and a number", () => {
    view("1.3.0");
    expect(row()).not.toBeNull();
    expect(screen.getByText(/1\.3\.0/)).toBeTruthy();
  });

  it("offers the download page and a way to quiet it", () => {
    const { getIt, hide } = view("1.3.0");
    fireEvent.click(document.querySelector(".about-newer-get")!);
    expect(getIt).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector(".about-newer-hide")!);
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it("says nothing when there is nothing newer", () => {
    view("");
    expect(row()).toBeNull();
  });

  it("never mentions the update the desktop installs for you", () => {
    // The desktop's own updater row is `!IS_MOBILE` and must stay gone: a
    // phone cannot replace its own package, which is the reason this quiet
    // row exists at all.
    view("1.3.0");
    expect(document.querySelector(".update-check-btn")).toBeNull();
    expect(document.querySelector(".update-available-btn")).toBeNull();
  });
});
