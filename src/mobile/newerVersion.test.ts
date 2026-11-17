/**
 * Is that release newer than this one?
 *
 * The only question this feature asks, and the only one it can get wrong in a
 * way anybody notices: told yes when the answer is no, the app nags someone
 * who is already up to date; told no when the answer is yes, it is silent
 * forever and the whole thing may as well not exist.
 *
 * A string comparison gets it wrong the first time a minor version reaches
 * ten — "1.10.0" < "1.9.9" as text — which is the case this file exists for.
 */
import { describe, expect, it, vi } from "vitest";
import {
  ASK_EVERY_MS,
  LATEST_RELEASE_URL,
  askForNewest,
  isNewer,
  parseVersion,
  timeToAsk,
} from "./newerVersion";

describe("which version is newer", () => {
  it("counts, rather than spells", () => {
    expect(isNewer("1.10.0", "1.9.9")).toBe(true);
    expect(isNewer("1.9.9", "1.10.0")).toBe(false);
    expect(isNewer("2.0.0", "1.99.99")).toBe(true);
    expect(isNewer("1.2.10", "1.2.9")).toBe(true);
  });

  it("says no to the version that is running", () => {
    expect(isNewer("1.2.1", "1.2.1")).toBe(false);
    // Same version, written with a part left off and with a "v" in front.
    expect(isNewer("v1.2", "1.2.0")).toBe(false);
    expect(isNewer("1.2.0", "v1.2")).toBe(false);
  });

  it("says no to an older one, which is what a rolled-back release looks like", () => {
    expect(isNewer("1.2.0", "1.2.1")).toBe(false);
  });

  it("puts a pre-release before the release it leads to", () => {
    expect(isNewer("1.3.0", "1.3.0-beta.1")).toBe(true);
    expect(isNewer("1.3.0-beta.1", "1.3.0")).toBe(false);
    expect(isNewer("1.3.0-beta.2", "1.3.0-beta.1")).toBe(true);
    // "beta" outranks "11", or 1.3.0-11 would read as newer than 1.3.0-beta.
    expect(isNewer("1.3.0-beta", "1.3.0-11")).toBe(true);
    // Someone on a beta is told about the final release of the same version.
    expect(isNewer("1.3.0", "1.3.0-rc.1")).toBe(true);
  });

  it("ignores build metadata, which is not a version", () => {
    expect(isNewer("1.2.1+build.7", "1.2.1")).toBe(false);
    expect(isNewer("1.2.2+build.7", "1.2.1")).toBe(true);
  });

  it("says nothing at all about an answer it cannot read", () => {
    for (const bad of ["nightly", "", "v", "1.2.x", "latest", null, undefined, 7, {}]) {
      expect(parseVersion(bad)).toBeNull();
      expect(isNewer(bad, "1.2.1")).toBe(false);
    }
    // And a malformed RUNNING version is just as disqualifying: comparing
    // against nothing would make every release look newer.
    expect(isNewer("9.9.9", "dev")).toBe(false);
  });
});

describe("how often it asks", () => {
  const now = 1_700_000_000_000;

  it("asks when it never has", () => {
    expect(timeToAsk(undefined, now)).toBe(true);
    // Anything that is not a number we wrote ourselves.
    expect(timeToAsk("yesterday", now)).toBe(true);
    expect(timeToAsk(NaN, now)).toBe(true);
  });

  it("does not ask twice in a day", () => {
    expect(timeToAsk(now - 1000, now)).toBe(false);
    expect(timeToAsk(now - ASK_EVERY_MS + 1000, now)).toBe(false);
  });

  it("asks again a day later", () => {
    expect(timeToAsk(now - ASK_EVERY_MS, now)).toBe(true);
    expect(timeToAsk(now - ASK_EVERY_MS * 3, now)).toBe(true);
  });

  it("asks when the clock has gone backwards", () => {
    // A phone crossing a time zone, or somebody setting the date. Without
    // this the device would never ask again until the date caught up.
    expect(timeToAsk(now + ASK_EVERY_MS, now)).toBe(true);
  });
});

describe("asking", () => {
  it("sends one plain GET and no identifier of any kind", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ tag_name: "v1.3.0" }), { status: 200 }),
    );
    expect(await askForNewest(fetchImpl as unknown as typeof fetch)).toBe("1.3.0");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(LATEST_RELEASE_URL);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe("omit");
    expect(Object.keys(init.headers as object)).toEqual(["Accept"]);
  });

  it("says nothing when there is no network", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("Failed to fetch");
    });
    expect(await askForNewest(fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it("says nothing when the answer is an error page", async () => {
    const fetchImpl = vi.fn(async () => new Response("rate limited", { status: 403 }));
    expect(await askForNewest(fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it("says nothing when the answer is not the shape expected", async () => {
    for (const body of ["not json at all", "{}", '{"tag_name":"nightly"}', '{"tag_name":42}']) {
      const fetchImpl = vi.fn(async () => new Response(body, { status: 200 }));
      expect(await askForNewest(fetchImpl as unknown as typeof fetch)).toBeNull();
    }
  });
});
