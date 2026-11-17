/**
 * The Android test build's updater: once a day on open, never over the click,
 * and Update = download (once) then the installer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { BETA_CHECKED_AT_KEY, BETA_FEED_KEY } from "./feed";
import { useAndroidBetaUpdate } from "./useAndroidBetaUpdate";

const store = new Map<string, unknown>();
const probe = vi.fn();
const download = vi.fn(async (_feed: unknown, onProgress: (p: { received: number; total: number }) => void) => {
  onProgress({ received: 5, total: 10 });
});
const install = vi.fn(async () => ({ started: true, needsPermission: false }));

vi.mock("../ipc", () => ({
  storeLoad: async (key: string) => store.get(key),
  storeSave: async (key: string, value: unknown) => {
    store.set(key, value);
  },
  androidBetaProbe: (url: string) => probe(url),
  androidBetaDownload: (feed: unknown, cb: (p: { received: number; total: number }) => void) => download(feed, cb),
  androidBetaInstall: () => install(),
}));

const FEED = {
  version: "1.3.0-beta.58",
  versionCode: 103000058,
  url: "https://github.com/turutupa/yames/releases/download/beta/Yames_1.3.0-beta.58_aarch64.apk",
  sha256: "b".repeat(64),
  size: 10,
  notes: "",
};

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  probe.mockResolvedValue({ ...FEED, installedVersionCode: 103000057, installedVersionName: "", canInstall: true, downloaded: false });
});

const mount = (isPlaying = false) =>
  renderHook((p: { appVersion: string; isPlaying: boolean }) => useAndroidBetaUpdate(p), {
    initialProps: { appVersion: "1.3.0-beta.57", isPlaying },
  });

describe("useAndroidBetaUpdate", () => {
  it("asks on open and offers a newer build", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("available"));
    expect(result.current.version).toBe("1.3.0-beta.58");
    expect(probe).toHaveBeenCalledWith("https://github.com/turutupa/yames/releases/download/beta/android-beta.json");
    expect(typeof store.get(BETA_CHECKED_AT_KEY)).toBe("number");
  });

  it("does not ask twice in a day, and remembers the answer", async () => {
    store.set(BETA_CHECKED_AT_KEY, Date.now() - 1000);
    store.set(BETA_FEED_KEY, FEED);
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("available"));
    expect(probe).not.toHaveBeenCalled();
  });

  it("waits for the click to stop", async () => {
    const { result, rerender } = mount(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(probe).not.toHaveBeenCalled();
    rerender({ appVersion: "1.3.0-beta.57", isPlaying: false });
    await waitFor(() => expect(result.current.status).toBe("available"));
  });

  it("says nothing when this is the newest build", async () => {
    probe.mockResolvedValue({ ...FEED, installedVersionCode: 103000058, installedVersionName: "", canInstall: true, downloaded: false });
    const { result } = mount();
    await waitFor(() => expect(probe).toHaveBeenCalled());
    expect(result.current.status).toBe("idle");
    act(() => result.current.check());
    await waitFor(() => expect(result.current.status).toBe("up-to-date"));
  });

  it("downloads once, then opens the installer; asks for the permission when needed", async () => {
    install.mockResolvedValueOnce({ started: false, needsPermission: true });
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("available"));
    act(() => result.current.update());
    await waitFor(() => expect(result.current.status).toBe("needs-permission"));
    expect(download).toHaveBeenCalledTimes(1);
    expect(result.current.progress).toBe(0.5);
    act(() => result.current.update());
    await waitFor(() => expect(install).toHaveBeenCalledTimes(2));
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("says a check it was asked for could not reach the feed, apart from a failed update", async () => {
    store.set(BETA_CHECKED_AT_KEY, Date.now() - 1000);
    const { result } = mount();
    probe.mockRejectedValueOnce(new Error('Unable to resolve host "github.com"'));
    act(() => result.current.check());
    await waitFor(() => expect(result.current.status).toBe("check-failed"));
    expect(result.current.error).toMatch(/resolve host/);
  });

  it("reports a failed download", async () => {
    download.mockRejectedValueOnce(new Error("the download does not match its sha256"));
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("available"));
    act(() => result.current.update());
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.error).toMatch(/sha256/);
    expect(install).not.toHaveBeenCalled();
  });
});
