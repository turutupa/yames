import { describe, expect, it } from "vitest";
import { BETA_EVERY_MS, betaVersionCode, dayIsUp, offerable } from "./feed";
// The workflow's half of the same rules (scripts/beta-feed.mjs).
import * as script from "../../scripts/beta-feed.mjs";

const SHA = "a".repeat(64);

describe("the beta version and its Android versionCode", () => {
  it("is the next minor after stable, -beta.N", () => {
    expect(script.betaVersion("1.2.2", 57)).toBe("1.3.0-beta.57");
    expect(script.betaVersion("1.9.0", "3")).toBe("1.10.0-beta.3");
    expect(() => script.betaVersion("1.2.2", 0)).toThrow();
    expect(() => script.betaVersion("1.2.2", 10000)).toThrow();
  });

  it("gives every run a higher versionCode, above every stable code", () => {
    expect(betaVersionCode("1.3.0-beta.57")).toBe(103000057);
    expect(betaVersionCode("1.3.0-beta.58")!).toBeGreaterThan(betaVersionCode("1.3.0-beta.57")!);
    expect(betaVersionCode("1.4.0-beta.59")!).toBeGreaterThan(betaVersionCode("1.3.0-beta.58")!);
    // Stable 1.2.2 is 10202 (build.gradle.kts).
    expect(betaVersionCode("1.3.0-beta.1")!).toBeGreaterThan(10202);
    expect(betaVersionCode("1.2.2")).toBeNull();
  });

  it("agrees with the workflow's formula", () => {
    for (const v of ["1.3.0-beta.1", "1.3.0-beta.57", "2.0.0-beta.9999", "1.10.3-beta.12"]) {
      expect(script.betaVersionCode(v)).toBe(betaVersionCode(v));
    }
  });
});

describe("once a day", () => {
  it("is up when never, after a day, or when the clock went backwards", () => {
    const now = 10 * BETA_EVERY_MS;
    expect(dayIsUp(undefined, now)).toBe(true);
    expect(dayIsUp("x", now)).toBe(true);
    expect(dayIsUp(now - 1000, now)).toBe(false);
    expect(dayIsUp(now - BETA_EVERY_MS, now)).toBe(true);
    expect(dayIsUp(now + 1000, now)).toBe(true);
  });
});

describe("what is worth offering", () => {
  const feed = {
    version: "1.3.0-beta.58",
    versionCode: 103000058,
    url: "https://github.com/turutupa/yames/releases/download/beta/Yames_1.3.0-beta.58_aarch64.apk",
    sha256: SHA,
    size: 1,
    notes: "",
  };
  it("a newer, well-formed build", () => {
    expect(offerable(feed, 103000057)).toBe(true);
    expect(offerable(feed, 103000058)).toBe(false);
    expect(offerable(feed, null)).toBe(false);
    expect(offerable({ ...feed, sha256: "" }, 1)).toBe(false);
    expect(offerable({ ...feed, url: "http://x" }, 1)).toBe(false);
    expect(offerable(null, 1)).toBe(false);
  });
});

describe("the workflow's feed files", () => {
  const frag = (label: string, version: string, keys: string[], name: string) => ({
    label,
    version,
    files: [name],
    platforms: Object.fromEntries(keys.map((k) => [k, { signature: `sig-${label}`, url: script.assetUrl(name) }])),
  });

  it("the overlay only changes the version and the updater endpoint", () => {
    expect(script.betaOverlay("1.3.0-beta.5")).toEqual({
      version: "1.3.0-beta.5",
      plugins: {
        updater: { endpoints: ["https://github.com/turutupa/yames/releases/download/beta/latest.json"] },
      },
    });
  });

  it("merges this run's platforms and keeps only same-version entries", () => {
    const win = frag("windows", "1.3.0-beta.6", ["windows-x86_64-nsis", "windows-x86_64"], "Yames_1.3.0-beta.6_x64-setup.exe");
    const old = {
      version: "1.3.0-beta.5",
      platforms: { "linux-x86_64": { signature: "s", url: script.assetUrl("old.AppImage") } },
    };
    const merged = script.mergeLatest({ version: "1.3.0-beta.6", notes: "n", fragments: [win], existing: old });
    expect(Object.keys(merged.platforms)).toEqual(["windows-x86_64", "windows-x86_64-nsis"]);
    expect(merged.version).toBe("1.3.0-beta.6");

    const rerun = { ...old, version: "1.3.0-beta.6" };
    const kept = script.mergeLatest({ version: "1.3.0-beta.6", notes: "", fragments: [win], existing: rerun });
    expect(Object.keys(kept.platforms)).toContain("linux-x86_64");
    expect(kept.notes).toBe("Test build 1.3.0-beta.6");

    expect(() =>
      script.mergeLatest({ version: "1.3.0-beta.7", notes: "", fragments: [win], existing: null }),
    ).toThrow();
    expect(() => script.mergeLatest({ version: "1.3.0-beta.7", notes: "", fragments: [], existing: null })).toThrow();
  });

  it("android-beta.json refuses an APK whose versionCode is not the scheme's", () => {
    const ok = script.androidFeed({
      version: "1.3.0-beta.6",
      versionCode: "103000006",
      apkName: "Yames_1.3.0-beta.6_aarch64.apk",
      sha256: SHA,
      size: 42,
      notes: "",
    });
    expect(ok.versionCode).toBe(103000006);
    expect(ok.url).toBe(script.assetUrl("Yames_1.3.0-beta.6_aarch64.apk"));
    expect(() =>
      script.androidFeed({ version: "1.3.0-beta.6", versionCode: 10300, apkName: "a.apk", sha256: SHA, size: 1, notes: "" }),
    ).toThrow();
  });

  it("sweeps only what no feed needs", () => {
    const latest = {
      version: "1.3.0-beta.6",
      platforms: { a: { url: script.assetUrl("Yames_1.3.0-beta.6_aarch64.app.tar.gz") } },
    };
    const android = { version: "1.3.0-beta.4", url: script.assetUrl("Yames_1.3.0-beta.4_aarch64.apk") };
    const names = [
      "latest.json",
      "android-beta.json",
      "Yames_1.3.0-beta.6_aarch64.app.tar.gz",
      "Yames_1.3.0-beta.6_aarch64.dmg",
      "Yames_1.3.0-beta.4_aarch64.apk",
      "Yames_1.3.0-beta.5_x64-setup.exe",
      "Yames_1.3.0-beta.3_aarch64.apk",
    ];
    expect(script.staleAssets(names, latest, android)).toEqual([
      "Yames_1.3.0-beta.5_x64-setup.exe",
      "Yames_1.3.0-beta.3_aarch64.apk",
    ]);
  });

  it("knows which release assets are still referenced", () => {
    const latest = { platforms: { a: { url: script.assetUrl("Yames_1.3.0-beta.6_x64-setup.exe") } } };
    const android = { url: script.assetUrl("Yames_1.3.0-beta.4_aarch64.apk") };
    expect([...script.referencedAssets(latest, android)].sort()).toEqual(
      ["Yames_1.3.0-beta.4_aarch64.apk", "Yames_1.3.0-beta.6_x64-setup.exe", "android-beta.json", "latest.json"],
    );
  });
});
