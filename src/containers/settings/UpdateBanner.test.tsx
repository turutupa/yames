// An update that did not install has to say so.
//
// The banner had three states and no fourth: any failure reset it to
// "available", which is pixel-identical to the click having done nothing. The
// first real failure in the wild was a VPN blocking the download, and the app
// could not say that — the owner worked it out by guessing.
//
// `downloadAndInstallUpdate` had a matching hole: when the re-check came back
// empty it returned normally, so the caller saw success and the banner sat on
// "Updating…" for good. That one is covered in ipc's own tests; this covers
// what the user sees.
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { UpdateBanner } from "./UpdateBanner";

afterEach(cleanup);

describe("UpdateBanner", () => {
  it("offers the update when there is one", () => {
    render(<UpdateBanner updateStatus="available" latestVersion="1.2.0" onInstall={vi.fn()} />);
    expect(screen.getByText(/1\.2\.0/)).toBeInTheDocument();
  });

  it("says nothing in the states that are not about an update", () => {
    for (const status of ["idle", "checking", "up-to-date"] as const) {
      const { container, unmount } = render(
        <UpdateBanner updateStatus={status} latestVersion="1.2.0" onInstall={vi.fn()} />,
      );
      expect(container.firstChild, status).toBeNull();
      unmount();
    }
  });

  it("reports a failure instead of quietly going back to the offer", () => {
    render(
      <UpdateBanner
        updateStatus="failed"
        latestVersion="1.2.0"
        updateError="Network unreachable"
        onInstall={vi.fn()}
      />,
    );
    expect(document.querySelector(".update-banner-failed")).not.toBeNull();
    // The reason, verbatim. It comes from the updater or the OS, and a guessed
    // translation of an error is worse than an untranslated one.
    expect(screen.getByText(/Network unreachable/)).toBeInTheDocument();
  });

  it("still shows the failure when there is no reason to give", () => {
    render(<UpdateBanner updateStatus="failed" latestVersion="1.2.0" onInstall={vi.fn()} />);
    expect(document.querySelector(".update-banner-failed")).not.toBeNull();
  });

  it("retries when the failed banner is clicked", () => {
    // The way back from a failure is the same gesture that caused it — no
    // second control to find.
    const onInstall = vi.fn();
    render(
      <UpdateBanner
        updateStatus="failed"
        latestVersion="1.2.0"
        updateError="Network unreachable"
        onInstall={onInstall}
      />,
    );
    fireEvent.click(document.querySelector(".update-banner-failed") as HTMLElement);
    expect(onInstall).toHaveBeenCalled();
  });

  it("is not clickable while it is downloading", () => {
    const onInstall = vi.fn();
    render(<UpdateBanner updateStatus="downloading" latestVersion="1.2.0" onInstall={onInstall} />);
    fireEvent.click(document.querySelector(".update-banner-downloading") as HTMLElement);
    expect(onInstall).not.toHaveBeenCalled();
  });
});
