/**
 * Settings → Support carries "Send feedback" for testers: one button that
 * opens a prefilled GitHub issue through the app's open-URL door, with the
 * version said beside it. Pressing it sends nothing by itself.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const openUrl = vi.fn(async () => undefined);
vi.mock("../../ipc", () => ({
  openUrl: (url: string) => openUrl(url),
  openFeedback: async (version: string) =>
    openUrl(`https://github.com/turutupa/yames/issues/new?title=${encodeURIComponent(version)}`),
}));

import { SupportSection } from "./SupportSection";

afterEach(() => {
  cleanup();
  openUrl.mockClear();
});

describe("Send feedback in Settings", () => {
  it("says the version and opens the issue only when pressed", () => {
    render(<SupportSection shareTooltip={false} onShareOption={vi.fn()} appVersion="0.9.0" />);
    expect(screen.getByTestId("settings-feedback")).toHaveTextContent("Yames 0.9.0");
    expect(openUrl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("settings-send-feedback"));
    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(String((openUrl.mock.calls[0] as unknown[])[0])).toContain("github.com/turutupa/yames/issues/new");
  });
});
