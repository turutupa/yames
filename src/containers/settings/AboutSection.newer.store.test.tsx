/**
 * The phone build a STORE gets, told a newer version exists — and saying
 * nothing whatsoever about it.
 *
 * The control for `AboutSection.newer.test.tsx`. It matters more than a
 * negative test usually does: a store updates its own apps, and both stores
 * refuse an app that points at its own download page, so a row that leaked
 * into this build is a rejected submission rather than a cosmetic bug.
 *
 * The props are deliberately the ones that WOULD draw the row — a newest
 * version and two live handlers — so this cannot pass merely because nothing
 * was passed in.
 */
import "../../test/mobileFlag"; // MUST be first — the store build's flag.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { IS_MOBILE, SAYS_WHEN_NEWER } from "../../platform";
import { AboutSection } from "./AboutSection";

afterEach(cleanup);

describe("the store's phone build", () => {
  it("is a phone build, and is not the website's", () => {
    expect(IS_MOBILE).toBe(true);
    expect(SAYS_WHEN_NEWER).toBe(false);
  });

  it("draws nothing at all, even handed a newer version", () => {
    render(
      <AboutSection
        appVersion="1.2.1"
        updateStatus="idle"
        latestVersion=""
        newerVersion={{ newest: "1.3.0", getIt: vi.fn(), hide: vi.fn() }}
        onInstallUpdate={vi.fn()}
        onCheckUpdate={vi.fn()}
      />,
    );
    expect(document.querySelector(".about-newer")).toBeNull();
    expect(document.body.textContent).not.toContain("1.3.0");
    // And no door to a download anywhere on the screen.
    expect(document.querySelector('a[href*="yames.app"]')).toBeNull();
    // The version it IS running still shows: that is the one line About has
    // always had, and it is how anyone reports a bug.
    expect(document.body.textContent).toContain("1.2.1");
  });
});
