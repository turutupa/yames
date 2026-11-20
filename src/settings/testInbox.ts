/**
 * "Send my test sessions to my computer" (card #123). Test builds only
 * (`IS_BETA`), off by default. When a recording session ends
 * (`recordingSession.ts`) the app zips it and uploads it, in chunks that
 * resume, to the inbox the tester paired with (`tools/inbox/server.py` on the
 * DGX, on the tailnet). Raw microphone audio goes only to that address;
 * nothing goes anywhere while this is off or unpaired.
 *
 * Where things run: zipping and reading the zip are Rust commands on the
 * blocking pool (`src-tauri/src/capture_outbox.rs`), the upload is the
 * webview's `fetch` (the platform's own TLS on Windows and Android). Neither
 * is on an audio or detector thread.
 *
 * Retries: a session not sent (offline, the computer asleep) stays "waiting"
 * and is tried again when the app opens, when the network comes back, and
 * every ten minutes while one waits. A refusal (a wrong token, too big) is
 * "failed" and waits for Send now or a new pairing.
 *
 * On Android each zip is also copied to shared storage
 * (`Documents/Yames/capture`), so `adb pull` (`npm run corpus:ingest -- rtx`)
 * works on a build that is not debuggable, with or without the inbox.
 */
import { captureOutboxChunk, captureOutboxClear, captureOutboxPrepare, captureSessions } from "../ipc";
import { IS_BETA, IS_MOBILE } from "../platform";
import { onCapture } from "./recordingSession";

export const INBOX_ON_KEY = "yames.testInbox.on";
export const INBOX_URL_KEY = "yames.testInbox.url";
export const INBOX_SINCE_KEY = "yames.testInbox.since";
export const INBOX_ITEMS_KEY = "yames.testInbox.items";
/** Not under `yames.`: `settingsSnapshot` copies those into every session.json. */
export const INBOX_TOKEN_KEY = "yamesInbox.token";

export const CHUNK_BYTES = 4 * 1024 * 1024;
const CHUNK_TIMEOUT_MS = 120_000;
const RETRY_MS = 10 * 60_000;
const KEEP_ITEMS = 50;

/**
 * Whether this build offers the setting: a test build, or the layout suite's
 * shot harness in a dev server (so its geometry is measured). In a stable
 * production build both are constant false and the row folds away.
 */
export function inboxOffered(): boolean {
  return IS_BETA || (import.meta.env.DEV && typeof window !== "undefined" && "__SHOT_MANIFEST__" in window);
}

export type InboxItemState = "uploaded" | "waiting" | "failed" | "sending";
export type InboxItem = { state: InboxItemState; at: number; reason?: string; progress?: number };
export type InboxState = {
  on: boolean;
  url: string;
  paired: boolean;
  items: Record<string, InboxItem>;
  /** The newest session's id, for the one-line status. */
  last: string | null;
};

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function get(k: string): string | null {
  try {
    return storage()?.getItem(k) ?? null;
  } catch {
    return null;
  }
}

function put(k: string, v: string | null) {
  try {
    if (v === null) storage()?.removeItem(k);
    else storage()?.setItem(k, v);
  } catch {
    /* private mode */
  }
}

function readItems(): Record<string, InboxItem> {
  try {
    const v = JSON.parse(get(INBOX_ITEMS_KEY) ?? "{}");
    return v && typeof v === "object" ? (v as Record<string, InboxItem>) : {};
  } catch {
    return {};
  }
}

function lastOf(items: Record<string, InboxItem>): string | null {
  const ids = Object.keys(items).sort();
  return ids.length ? ids[ids.length - 1]! : null;
}

function read(): InboxState {
  const items = readItems();
  return {
    on: get(INBOX_ON_KEY) === "1",
    url: get(INBOX_URL_KEY) ?? "",
    paired: !!get(INBOX_TOKEN_KEY) && !!get(INBOX_URL_KEY),
    items,
    last: lastOf(items),
  };
}

let current: InboxState = read();
const listeners = new Set<(s: InboxState) => void>();

function publish() {
  current = read();
  for (const l of listeners) l(current);
}

export function inboxNow(): InboxState {
  return current;
}

export function onInbox(listener: (s: InboxState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setItem(id: string, item: Omit<InboxItem, "at">) {
  const items = readItems();
  items[id] = { ...item, at: Date.now() };
  const ids = Object.keys(items).sort();
  for (const old of ids.slice(0, Math.max(0, ids.length - KEEP_ITEMS))) delete items[old];
  put(INBOX_ITEMS_KEY, JSON.stringify(items));
  publish();
}

// --- the address and the pairing ----------------------------------------------

/**
 * The inbox's base URL from what the tester typed or pasted, and a pairing
 * code if the paste carried one (`https://host:8646/#pair=ABCDE12345`).
 * HTTPS only, except this machine (a dev inbox): the token rides on every
 * request. `null` when it is not an address.
 */
export function parseInboxInput(input: string): { base: string; code: string | null } | null {
  const raw = input.trim();
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
  const m = /(?:^|[#&?])pair=([A-Za-z0-9-]+)/.exec(u.hash || u.search);
  return { base: `${u.protocol}//${u.host}`, code: m ? m[1]! : null };
}

export function normCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export class InboxError extends Error {
  /** Not worth retrying on its own: a wrong token, too big, refused. */
  permanent: boolean;
  constructor(reason: string, permanent: boolean) {
    super(reason);
    this.permanent = permanent;
  }
}

async function call(base: string, method: string, path: string, init: { token?: string; body?: BodyInit; json?: unknown } = {}): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CHUNK_TIMEOUT_MS);
  const headers: Record<string, string> = {};
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  let body = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/octet-stream";
  }
  try {
    return await fetch(`${base}${path}`, { method, headers, body, signal: ctl.signal, cache: "no-store", credentials: "omit" });
  } catch {
    throw new InboxError("offline", false);
  } finally {
    clearTimeout(timer);
  }
}

function refusal(status: number): InboxError {
  if (status === 401 || status === 403) return new InboxError("token", true);
  if (status === 413) return new InboxError("tooBig", true);
  if (status === 422 || status === 400) return new InboxError("refused", true);
  if (status === 429) return new InboxError("tooMany", false);
  if (status === 507) return new InboxError("full", false);
  return new InboxError("server", false);
}

/** Trade a one-time pairing code for the inbox's token. Throws an `InboxError`. */
export async function pairInbox(input: string, codeInput: string): Promise<InboxState> {
  const parsed = parseInboxInput(input);
  if (!parsed) throw new InboxError("badAddress", true);
  const code = normCode(codeInput || parsed.code || "");
  if (!code) throw new InboxError("noCode", true);
  const r = await call(parsed.base, "POST", "/v1/pair", {
    json: { code, device: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 60) : "" },
  });
  if (r.status === 429) throw new InboxError("tooMany", true);
  if (!r.ok) throw r.status === 403 ? new InboxError("badCode", true) : refusal(r.status);
  const doc = (await r.json().catch(() => null)) as { token?: unknown } | null;
  if (!doc || typeof doc.token !== "string" || doc.token.length < 24) throw new InboxError("server", true);
  put(INBOX_URL_KEY, parsed.base);
  put(INBOX_TOKEN_KEY, doc.token);
  // a session that failed on the old token gets another go
  const items = readItems();
  for (const [id, it] of Object.entries(items)) if (it.state === "failed" && it.reason === "token") items[id] = { ...it, state: "waiting" };
  put(INBOX_ITEMS_KEY, JSON.stringify(items));
  publish();
  void syncInbox();
  return current;
}

export function forgetInbox(): InboxState {
  put(INBOX_TOKEN_KEY, null);
  put(INBOX_URL_KEY, null);
  publish();
  return current;
}

/** The switch. Turning it on starts the clock: only sessions recorded from now are sent. */
export function setInboxOn(on: boolean): InboxState {
  put(INBOX_ON_KEY, on ? "1" : "0");
  if (on) put(INBOX_SINCE_KEY, String(Date.now()));
  publish();
  if (on) void syncInbox();
  return current;
}

// --- the upload ---------------------------------------------------------------

/** Send one zip, from where the inbox says it has it to. */
export async function uploadSession(base: string, token: string, id: string, size: number, onProgress: (f: number) => void): Promise<void> {
  const path = `/v1/uploads/${encodeURIComponent(id)}`;
  const head = await call(base, "GET", path, { token });
  if (!head.ok) throw refusal(head.status);
  const st = (await head.json().catch(() => ({}))) as { done?: boolean; received?: number; total?: number | null };
  if (st.done) return;
  let off = st.total === size && typeof st.received === "number" ? st.received : 0;
  while (off < size) {
    const buf = await captureOutboxChunk(id, off, CHUNK_BYTES);
    if (buf.byteLength === 0) throw new InboxError("zipChanged", true);
    const r = await call(base, "PUT", `${path}?offset=${off}&total=${size}`, { token, body: buf });
    if (r.status === 409) {
      const d = (await r.json().catch(() => ({}))) as { done?: boolean; received?: number; total?: number | null };
      if (d.done) return;
      off = d.total === size && typeof d.received === "number" ? d.received : 0;
      continue;
    }
    if (!r.ok) throw refusal(r.status);
    off += buf.byteLength;
    onProgress(off / size);
  }
}

let inflight: Promise<void> | null = null;
let again = false;
let againForce = false;

/**
 * Send what is still to send: every session recorded since the switch went
 * on, ended, not yet on the computer. One at a time, oldest first; never
 * throws. A call while a run is going asks for one more run after it and
 * resolves when that is done too.
 */
export function syncInbox(force = false): Promise<void> {
  if (!inboxOffered() || get(INBOX_ON_KEY) !== "1") return Promise.resolve();
  if (inflight) {
    again = true;
    againForce ||= force;
    return inflight;
  }
  inflight = (async () => {
    let f = force;
    do {
      again = false;
      await runOnce(f);
      f = againForce;
      againForce = false;
    } while (again);
  })().finally(() => {
    inflight = null;
    publish();
  });
  return inflight;
}

async function runOnce(force: boolean): Promise<void> {
  {
    const since = Number(get(INBOX_SINCE_KEY) ?? "0") || 0;
    const sessions = await captureSessions().catch(() => []);
    for (const s of sessions) {
      // recorded (or still going) since the switch went on; one ended by closing the app has no end time
      if (s.active || Math.max(s.startedWallMs ?? 0, s.endedWallMs ?? 0) < since) continue;
      const prev = readItems()[s.id];
      if (prev?.state === "uploaded" || (prev?.state === "failed" && !force)) continue;
      const base = get(INBOX_URL_KEY);
      const token = get(INBOX_TOKEN_KEY);
      // unpaired: the phone still keeps its shared copy for adb
      if (!base || !token) {
        if (IS_MOBILE) await captureOutboxPrepare(s.id, true).catch(() => null);
        setItem(s.id, { state: "waiting", reason: "notPaired" });
        continue;
      }
      let size: number;
      try {
        size = (await captureOutboxPrepare(s.id, IS_MOBILE)).size;
      } catch {
        setItem(s.id, { state: "failed", reason: "zip" });
        continue;
      }
      setItem(s.id, { state: "sending", progress: 0 });
      let lastPct = 0;
      try {
        await uploadSession(base, token, s.id, size, (f) => {
          const pct = Math.floor(f * 100);
          if (pct >= lastPct + 5) {
            lastPct = pct;
            setItem(s.id, { state: "sending", progress: f });
          }
        });
        setItem(s.id, { state: "uploaded" });
        void captureOutboxClear(s.id).catch(() => {});
      } catch (e) {
        const err = e instanceof InboxError ? e : new InboxError("offline", false);
        setItem(s.id, { state: err.permanent ? "failed" : "waiting", reason: err.message });
      }
    }
  }
}

function anyWaiting(): boolean {
  return Object.values(readItems()).some((i) => i.state === "waiting" || i.state === "sending");
}

let started = false;

/**
 * Once per app run, test builds only: send what waits now (the app was closed
 * or offline last time), when a recording session ends, when the network is
 * back, and every ten minutes while something waits.
 */
export function startTestInbox(): () => void {
  if (started || !inboxOffered()) return () => {};
  started = true;
  // a "sending" left by an app that closed mid-upload is waiting now
  const items = readItems();
  for (const [id, it] of Object.entries(items)) if (it.state === "sending") items[id] = { ...it, state: "waiting" };
  put(INBOX_ITEMS_KEY, JSON.stringify(items));
  publish();
  void syncInbox();
  let wasActive = false;
  const offCapture = onCapture((s) => {
    if (wasActive && !s.active) void syncInbox();
    wasActive = s.active;
  });
  const online = () => void syncInbox();
  window.addEventListener("online", online);
  const timer = setInterval(() => {
    if (anyWaiting()) void syncInbox();
  }, RETRY_MS);
  return () => {
    started = false;
    offCapture();
    window.removeEventListener("online", online);
    clearInterval(timer);
  };
}

/** Test only: forget the module's state. */
export function resetTestInboxForTests() {
  inflight = null;
  again = false;
  againForce = false;
  started = false;
  current = read();
}
