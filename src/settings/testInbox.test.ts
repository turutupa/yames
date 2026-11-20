import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../platform", () => ({ IS_BETA: true, IS_MOBILE: false }));

// the "zip" the outbox hands out
const ZIP = new Uint8Array(10 * 1024 * 1024 + 123).map((_, i) => i % 251);
vi.mock("../ipc", () => ({
  captureSessions: vi.fn(async () => [
    { id: "20261120-010000", startedWallMs: 5_000, endedWallMs: 6_000, active: false },
    { id: "20261120-020000", startedWallMs: 9e15, endedWallMs: null, active: false },
    { id: "20261120-030000", startedWallMs: 9e15, endedWallMs: null, active: true },
  ]),
  captureOutboxPrepare: vi.fn(async (id: string) => ({ id, size: ZIP.length, shared: null, sharedError: null })),
  captureOutboxChunk: vi.fn(async (_id: string, offset: number, len: number) => ZIP.slice(offset, offset + len).buffer),
  captureOutboxClear: vi.fn(async () => {}),
  captureStatus: vi.fn(async () => ({ active: false })),
}));

import * as ipc from "../ipc";
import { settingsSnapshot } from "./recordingSession";
import {
  CHUNK_BYTES,
  INBOX_SINCE_KEY,
  INBOX_TOKEN_KEY,
  INBOX_URL_KEY,
  inboxNow,
  normCode,
  pairInbox,
  parseInboxInput,
  resetTestInboxForTests,
  setInboxOn,
  syncInbox,
} from "./testInbox";

const backing = new Map<string, string>();
const fake: Storage = {
  get length() {
    return backing.size;
  },
  key: (i) => [...backing.keys()][i] ?? null,
  getItem: (k) => backing.get(k) ?? null,
  setItem: (k, v) => void backing.set(k, String(v)),
  removeItem: (k) => void backing.delete(k),
  clear: () => backing.clear(),
};
Object.defineProperty(window, "localStorage", { value: fake, configurable: true });

const TOKEN = "k".repeat(43);

/** Byte-equal (a deep `toEqual` over ten million elements takes seconds). */
function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** A tiny inbox in memory, with the server's resume rules. */
function fakeInbox(opts: { dropAfter?: number; status?: number } = {}) {
  const got = new Map<string, Uint8Array[]>();
  let puts = 0;
  const calls: { method: string; url: string; auth: string | null }[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const h = (init.headers ?? {}) as Record<string, string>;
    calls.push({ method: init.method ?? "GET", url, auth: h.Authorization ?? null });
    const u = new URL(url);
    const json = (code: number, doc: unknown) => new Response(JSON.stringify(doc), { status: code });
    if (u.pathname === "/v1/pair") {
      const body = JSON.parse(String(init.body));
      return body.code === "ABCDE12345" ? json(200, { token: TOKEN }) : json(403, { error: "bad" });
    }
    if (h.Authorization !== `Bearer ${TOKEN}`) return json(401, {});
    if (opts.status) return json(opts.status, {});
    const id = decodeURIComponent(u.pathname.split("/").pop()!);
    const parts = got.get(id) ?? [];
    const received = parts.reduce((n, p) => n + p.length, 0);
    if (init.method === "GET") return json(200, { received, total: received ? ZIP.length : null, done: received === ZIP.length });
    if (opts.dropAfter !== undefined && puts++ >= opts.dropAfter) throw new TypeError("network down");
    const off = Number(u.searchParams.get("offset"));
    if (off !== received) return json(409, { received, total: ZIP.length, done: false });
    parts.push(new Uint8Array(init.body as ArrayBuffer));
    got.set(id, parts);
    const now = received + (init.body as ArrayBuffer).byteLength;
    return json(now === ZIP.length ? 201 : 200, { received: now, total: ZIP.length, done: now === ZIP.length });
  });
  vi.stubGlobal("fetch", fetchMock);
  const joined = (id: string) => {
    const parts = got.get(id) ?? [];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  };
  return { calls, joined, fetchMock, set dropAfter(v: number | undefined) {
    opts.dropAfter = v;
    puts = 0;
  } };
}

beforeEach(() => {
  backing.clear();
  vi.clearAllMocks();
  resetTestInboxForTests();
});

describe("the inbox address", () => {
  it("takes an https address or a pairing link, and nothing in clear text off this machine", () => {
    expect(parseInboxInput("https://dgx.example.ts.net:8646/")).toEqual({ base: "https://dgx.example.ts.net:8646", code: null });
    expect(parseInboxInput("dgx.example.ts.net:8646")).toEqual({ base: "https://dgx.example.ts.net:8646", code: null });
    expect(parseInboxInput("https://dgx.example.ts.net:8646/#pair=ABCDE12345")).toEqual({ base: "https://dgx.example.ts.net:8646", code: "ABCDE12345" });
    expect(parseInboxInput("http://dgx.example.ts.net:8646")).toBeNull();
    expect(parseInboxInput("http://127.0.0.1:5646")?.base).toBe("http://127.0.0.1:5646");
    expect(parseInboxInput("ftp://x")).toBeNull();
    expect(parseInboxInput("")).toBeNull();
    expect(normCode(" abcde-12345 ")).toBe("ABCDE12345");
  });
});

describe("pairing", () => {
  it("trades the code for the token, which never lands in a session's settings", async () => {
    fakeInbox();
    await expect(pairInbox("https://dgx.example:8646", "WRONG")).rejects.toMatchObject({ message: "badCode" });
    expect(inboxNow().paired).toBe(false);
    await pairInbox("https://dgx.example:8646/#pair=abcde-12345", "");
    expect(inboxNow().paired).toBe(true);
    expect(backing.get(INBOX_TOKEN_KEY)).toBe(TOKEN);
    const snap = settingsSnapshot(fake);
    expect(JSON.stringify(snap)).not.toContain(TOKEN);
    expect(snap[INBOX_URL_KEY]).toBe("https://dgx.example:8646");
  });
});

describe("sending sessions", () => {
  async function paired() {
    const inbox = fakeInbox();
    backing.set(INBOX_URL_KEY, "https://dgx.example:8646");
    backing.set(INBOX_TOKEN_KEY, TOKEN);
    setInboxOn(true);
    backing.set(INBOX_SINCE_KEY, "1000");
    await syncInbox(); // the run setInboxOn started may still be going
    return inbox;
  }

  it("sends nothing while off", async () => {
    const inbox = fakeInbox();
    backing.set(INBOX_URL_KEY, "https://dgx.example:8646");
    backing.set(INBOX_TOKEN_KEY, TOKEN);
    await syncInbox();
    expect(inbox.fetchMock).not.toHaveBeenCalled();
    expect(ipc.captureOutboxPrepare).not.toHaveBeenCalled();
  });

  it("uploads every ended session in chunks, skips the live one, and clears the outbox", async () => {
    const inbox = await paired();
    await syncInbox();
    const s = inboxNow();
    expect(s.items["20261120-010000"]?.state).toBe("uploaded");
    expect(s.items["20261120-020000"]?.state).toBe("uploaded");
    expect(s.items["20261120-030000"]).toBeUndefined();
    expect(same(inbox.joined("20261120-010000"), ZIP)).toBe(true);
    expect(inbox.calls.filter((c) => c.method === "PUT").length).toBe(2 * Math.ceil(ZIP.length / CHUNK_BYTES));
    expect(inbox.calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);
    expect(ipc.captureOutboxClear).toHaveBeenCalledWith("20261120-010000");
  });

  it("only sends what was recorded since the switch went on", async () => {
    await paired();
    backing.set(INBOX_SINCE_KEY, String(1e15));
    backing.delete("yames.testInbox.items");
    await syncInbox();
    expect(inboxNow().items["20261120-010000"]).toBeUndefined();
    expect(inboxNow().items["20261120-020000"]?.state).toBe("uploaded");
  });

  it("waits when offline and resumes from what the inbox has", async () => {
    const inbox = fakeInbox({ dropAfter: 1 });
    backing.set(INBOX_URL_KEY, "https://dgx.example:8646");
    backing.set(INBOX_TOKEN_KEY, TOKEN);
    backing.set("yames.testInbox.on", "1");
    backing.set(INBOX_SINCE_KEY, "1000");
    await syncInbox();
    expect(inboxNow().items["20261120-010000"]).toMatchObject({ state: "waiting", reason: "offline" });
    inbox.dropAfter = undefined;
    await syncInbox();
    expect(inboxNow().items["20261120-010000"]?.state).toBe("uploaded");
    expect(same(inbox.joined("20261120-010000"), ZIP)).toBe(true);
    // the first chunk was not sent twice
    const firstChunks = inbox.calls.filter((c) => c.method === "PUT" && c.url.includes("010000?offset=0&"));
    expect(firstChunks.length).toBe(1);
  });

  it("fails on a refused token and leaves it for a new pairing", async () => {
    fakeInbox();
    backing.set(INBOX_URL_KEY, "https://dgx.example:8646");
    backing.set(INBOX_TOKEN_KEY, "x".repeat(43));
    backing.set("yames.testInbox.on", "1");
    backing.set(INBOX_SINCE_KEY, "1000");
    await syncInbox();
    expect(inboxNow().items["20261120-010000"]).toMatchObject({ state: "failed", reason: "token" });
    vi.clearAllMocks();
    await syncInbox();
    expect(ipc.captureOutboxPrepare).not.toHaveBeenCalled();
    await pairInbox("https://dgx.example:8646", "ABCDE-12345");
    await syncInbox();
    expect(inboxNow().items["20261120-010000"]?.state).toBe("uploaded");
  });

  it("waits, unpaired, without sending anything", async () => {
    const inbox = fakeInbox();
    backing.set("yames.testInbox.on", "1");
    backing.set(INBOX_SINCE_KEY, "1000");
    await syncInbox();
    expect(inbox.fetchMock).not.toHaveBeenCalled();
    expect(inboxNow().items["20261120-010000"]).toMatchObject({ state: "waiting", reason: "notPaired" });
  });
});
