/**
 * "Send feedback" builds a URL and nothing else: the player's browser opens a
 * GitHub issue with the version and the OS filled in, and they submit it or
 * they don't. These pin what the issue carries and that it goes to the repo.
 */
import { describe, expect, it, vi } from "vitest";
import { feedbackBody, feedbackUrl, FEEDBACK_REPO, osName } from "./feedbackUrl";

describe("the feedback issue", () => {
  const facts = { version: "0.9.0", os: "Windows", userAgent: "Mozilla/5.0 (Windows NT 10.0)", language: "de" };

  it("opens a new issue on the project's repository", () => {
    const url = new URL(feedbackUrl(facts));
    expect(`${url.origin}${url.pathname}`).toBe(`https://github.com/${FEEDBACK_REPO}/issues/new`);
    expect(FEEDBACK_REPO).toBe("turutupa/yames");
  });

  it("titles it with the version and the OS", () => {
    const url = new URL(feedbackUrl(facts));
    expect(url.searchParams.get("title")).toBe("Feedback: Yames 0.9.0 on Windows");
  });

  it("leaves room for their words, then states the version, OS and language", () => {
    const body = new URL(feedbackUrl(facts)).searchParams.get("body")!;
    expect(body).toBe(feedbackBody(facts));
    expect(body.indexOf("### What happened")).toBeLessThan(body.indexOf("- Yames: 0.9.0"));
    expect(body).toContain("- OS: Windows");
    expect(body).toContain("- Language: de");
    expect(body).toContain("Mozilla/5.0 (Windows NT 10.0)");
  });

  it("survives characters a query string would otherwise break on", () => {
    const odd = { ...facts, userAgent: "a&b=c#d?e" };
    const url = new URL(feedbackUrl(odd));
    expect(url.searchParams.get("body")).toContain("a&b=c#d?e");
    expect([...url.searchParams.keys()]).toEqual(["title", "body"]);
  });

  it("drops the user agent before it lets the URL get too long", () => {
    const url = feedbackUrl({ ...facts, userAgent: "x".repeat(9000) });
    expect(url.length).toBeLessThan(7000);
    expect(new URL(url).searchParams.get("body")).toContain("- Yames: 0.9.0");
  });

  it("names the three desktop systems", () => {
    expect(osName("Win32")).toBe("Windows");
    expect(osName("MacIntel")).toBe("macOS");
    expect(osName("Linux x86_64")).toBe("Linux");
    expect(osName("", "Mozilla/5.0 (X11; Linux aarch64)")).toBe("Linux");
  });
});

describe("openFeedback", () => {
  it("goes through the app's one open-URL door, and nothing else", async () => {
    vi.resetModules();
    const invoke = vi.fn(async () => undefined);
    vi.doMock("@tauri-apps/api/core", () => ({ invoke }));
    const { openFeedback } = await import("../ipc");
    await openFeedback("0.9.0", "en");
    expect(invoke).toHaveBeenCalledTimes(1);
    const [command, args] = invoke.mock.calls[0] as unknown as [string, { url: string }];
    expect(command).toBe("open_url");
    expect(args.url.startsWith(`https://github.com/${FEEDBACK_REPO}/issues/new?`)).toBe(true);
    vi.doUnmock("@tauri-apps/api/core");
  });
});
