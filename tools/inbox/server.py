"""Yames test-session inbox (card #123): the DGX end of "Send my test sessions
to my computer".

A test build of the app zips a recording session when it ends and uploads it
here in chunks (resumable). A finished upload lands in
``~/projects/.datasets/yames-corpus/inbox/<session>.zip`` and
``npm run corpus:ingest`` runs on it (``nice -n 10``), its report under
``~/projects/.preview/corpus/``.

Security model, in short:

- binds 127.0.0.1 only (``tailscale serve`` puts it on the tailnet, never
  funnel); any other bind address is refused;
- every request carries ``Authorization: Bearer <token>``, compared in
  constant time. The token lives in ``~/secrets/yames-inbox.token`` (0600)
  and is never logged. Two exceptions, both needed by a browser and neither
  touching data: a CORS preflight (``OPTIONS``, a browser cannot put a token on
  it) and ``POST /v1/pair``, which trades a one-time pairing code (made with
  ``pair``, hashed on disk, single use, expires, failed attempts rate-limited)
  for the token;
- the session id in a URL is ``[A-Za-z0-9_-]{1,64}``; nothing from a request
  becomes a path otherwise;
- size caps: a chunk (``--max-chunk``), an upload (``--max-bytes``), what the
  zip says it holds once unpacked, and free disk;
- a finished zip is checked before it is kept: every member under
  ``<session>/``, no ``..``, no absolute path, no backslash or drive, no
  symlink, CRCs good.

    python3 tools/inbox/server.py serve [--port 5646]
    python3 tools/inbox/server.py pair [--url https://host:8646]
    python3 -m unittest tools.inbox.test_server
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import http.server
import json
import os
import pathlib
import queue
import re
import secrets
import shutil
import socketserver
import stat
import subprocess
import sys
import threading
import time
import urllib.parse
import zipfile

HOME = pathlib.Path.home()
DEFAULT_PORT = 5646
DEFAULT_TOKEN_FILE = HOME / "secrets/yames-inbox.token"
DEFAULT_PAIR_FILE = HOME / "secrets/yames-inbox.pair.json"
DEFAULT_INBOX = HOME / "projects/.datasets/yames-corpus/inbox"
DEFAULT_REPORTS = HOME / "projects/.preview/corpus"
DEFAULT_REPO = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_MAX_BYTES = 16 * 1024**3
DEFAULT_MAX_CHUNK = 16 * 1024**2
# room left on the disk after an upload is accepted
DISK_MARGIN = 4 * 1024**3
PAIR_TTL_S = 24 * 3600
PAIR_FAIL_WINDOW_S = 600
PAIR_FAIL_MAX = 10
SESSION_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost"}
# the app's webview origins (Windows/Android: http(s)://tauri.localhost, macOS/Linux: tauri://localhost) and its dev server
ALLOWED_ORIGINS = {
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
    "http://localhost:1420",
}
READ_PIECE = 1024 * 1024


def log(msg: str) -> None:
    if os.environ.get("YAMES_INBOX_QUIET"):
        return
    print(f"[inbox {time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}", file=sys.stderr, flush=True)


def write_private(path: pathlib.Path, data: bytes) -> None:
    """Write `data` to `path` with mode 0600 (the folder 0700), atomically."""
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path.parent, 0o700)
    except OSError:
        pass
    tmp = path.with_name(path.name + f".tmp{os.getpid()}")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, data)
        os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(tmp, path)
    os.chmod(path, 0o600)


def load_token(path: pathlib.Path, create: bool = True) -> str:
    """The inbox's token, made (0600) the first time. Refuses one others can read."""
    if not path.exists():
        if not create:
            raise SystemExit(f"no token at {path}")
        write_private(path, (secrets.token_urlsafe(32) + "\n").encode())
        log(f"made a new token in {path}")
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode & 0o077:
        raise SystemExit(f"{path} is readable by others (mode {oct(mode)}): chmod 600 it")
    tok = path.read_text().strip()
    if len(tok) < 24:
        raise SystemExit(f"{path}: the token is too short")
    return tok


def sha(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def norm_code(code: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(code).upper())


# --- pairing codes ------------------------------------------------------------

PAIR_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L


class PairStore:
    """One-time pairing codes in a 0600 JSON file: only their hashes, with expiry."""

    def __init__(self, path: pathlib.Path):
        self.path = path
        self.lock = threading.Lock()
        self.fails: list[float] = []

    def _read(self) -> list[dict]:
        try:
            doc = json.loads(self.path.read_text())
            return [c for c in doc.get("codes", []) if isinstance(c, dict)]
        except (OSError, ValueError):
            return []

    def _write(self, codes: list[dict]) -> None:
        write_private(self.path, json.dumps({"codes": codes}).encode())

    def new(self, ttl_s: int = PAIR_TTL_S) -> str:
        code = "".join(secrets.choice(PAIR_ALPHABET) for _ in range(10))
        with self.lock:
            now = time.time()
            codes = [c for c in self._read() if c.get("expires", 0) > now]
            codes.append({"hash": sha(code), "expires": now + ttl_s})
            self._write(codes)
        return f"{code[:5]}-{code[5:]}"

    def redeem(self, code: str) -> bool | None:
        """True: the code was good and is now spent. False: wrong. None: too many tries."""
        with self.lock:
            now = time.time()
            self.fails = [t for t in self.fails if now - t < PAIR_FAIL_WINDOW_S]
            if len(self.fails) >= PAIR_FAIL_MAX:
                return None
            h = sha(norm_code(code))
            codes = [c for c in self._read() if c.get("expires", 0) > now]
            hit = [c for c in codes if hmac.compare_digest(str(c.get("hash", "")), h)]
            if not hit:
                self.fails.append(now)
                self._write(codes)
                return False
            self._write([c for c in codes if c not in hit])
            return True


# --- zip check ----------------------------------------------------------------


def check_zip(path: pathlib.Path, session: str, max_unpacked: int) -> str | None:
    """None when the zip is a session we can keep, else why not."""
    try:
        with zipfile.ZipFile(path) as z:
            total = 0
            infos = z.infolist()
            if not infos:
                return "the zip is empty"
            has_json = False
            for m in infos:
                name = m.filename
                if "\\" in name or name.startswith("/") or re.match(r"^[A-Za-z]:", name) or "\x00" in name:
                    return f"unsafe name in the zip: {name!r}"
                parts = name.rstrip("/").split("/")
                if any(p in ("", ".", "..") for p in parts):
                    return f"unsafe name in the zip: {name!r}"
                if parts[0] != session:
                    return f"a member is outside {session}/: {name!r}"
                # a symlink entry (unix mode in the high bits)
                if stat.S_ISLNK(m.external_attr >> 16):
                    return f"a symlink in the zip: {name!r}"
                total += m.file_size
                if total > max_unpacked:
                    return "the zip unpacks past the size limit"
                if parts == [session, "session.json"]:
                    has_json = True
            if not has_json:
                return f"no {session}/session.json in the zip"
            # the ingest names the session's folder from this: it must be the id
            try:
                doc = json.loads(z.read(f"{session}/session.json")[:1_000_000])
            except ValueError:
                return "session.json is not JSON"
            if not isinstance(doc, dict) or doc.get("session", session) != session:
                return "session.json names another session"
            bad = z.testzip()
            if bad is not None:
                return f"a damaged member: {bad!r}"
    except (zipfile.BadZipFile, OSError, ValueError, NotImplementedError) as e:
        return f"not a zip we can read: {e}"
    return None


# --- the ingest worker --------------------------------------------------------


class Ingester:
    """Runs `npm run corpus:ingest -- <zip>` on each new zip, one at a time."""

    def __init__(self, inbox: pathlib.Path, reports: pathlib.Path, repo: pathlib.Path, command: list[str] | None):
        self.inbox = inbox
        self.reports = reports
        self.repo = repo
        self.command = command  # None: do not ingest (tests)
        self.q: queue.Queue[str] = queue.Queue()
        self.thread = threading.Thread(target=self._run, name="inbox-ingest", daemon=True)

    def start(self) -> None:
        self.thread.start()
        # a zip that came in while the last run was stopped
        for z in sorted(self.inbox.glob("*.zip")):
            if SESSION_RE.match(z.stem) and not self.status_path(z.stem).exists():
                self.q.put(z.stem)

    def status_path(self, session: str) -> pathlib.Path:
        return self.inbox / f"{session}.status.json"

    def status(self, session: str) -> dict | None:
        try:
            return json.loads(self.status_path(session).read_text())
        except (OSError, ValueError):
            return None

    def _set(self, session: str, **kw) -> None:
        doc = {"session": session, **kw, "at": time.time()}
        tmp = self.status_path(session).with_suffix(".tmp")
        tmp.write_text(json.dumps(doc))
        os.replace(tmp, self.status_path(session))

    def enqueue(self, session: str) -> None:
        self._set(session, state="queued")
        self.q.put(session)

    def _run(self) -> None:
        while True:
            session = self.q.get()
            if self.command is None:
                self._set(session, state="kept")
                continue
            zp = self.inbox / f"{session}.zip"
            logs = self.reports / "inbox-logs"
            logs.mkdir(parents=True, exist_ok=True)
            log_path = logs / f"{session}.log"
            self._set(session, state="running")
            t0 = time.time()
            try:
                with open(log_path, "wb") as lf:
                    env = {**os.environ, "INIT_CWD": str(self.repo)}
                    rc = subprocess.call(self.command + [str(zp)], cwd=str(self.repo), stdout=lf, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, env=env)
            except OSError as e:
                rc = -1
                with open(log_path, "a") as lf:
                    lf.write(f"\ncould not start the ingest: {e}\n")
            state = "ingested" if rc == 0 else "failed"
            self._set(session, state=state, rc=rc, seconds=round(time.time() - t0, 1), log=str(log_path), report=str(self.reports / session / "report.html"))
            log(f"{session}: ingest {state} (rc {rc}, {time.time() - t0:.0f} s), log {log_path}")


# --- the server ---------------------------------------------------------------


class Inbox:
    def __init__(self, token: str, inbox: pathlib.Path, pairs: PairStore, ingester: Ingester, max_bytes: int, max_chunk: int, disk_margin: int = DISK_MARGIN):
        self.token = token
        self.inbox = inbox
        self.partial = inbox / ".partial"
        self.partial.mkdir(parents=True, exist_ok=True)
        self.pairs = pairs
        self.ingester = ingester
        self.max_bytes = max_bytes
        self.max_chunk = max_chunk
        self.disk_margin = disk_margin
        self.locks: dict[str, threading.Lock] = {}
        self.locks_lock = threading.Lock()

    def lock_for(self, session: str) -> threading.Lock:
        with self.locks_lock:
            return self.locks.setdefault(session, threading.Lock())

    def part(self, session: str) -> pathlib.Path:
        return self.partial / f"{session}.part"

    def meta_path(self, session: str) -> pathlib.Path:
        return self.partial / f"{session}.json"

    def done_path(self, session: str) -> pathlib.Path:
        return self.inbox / f"{session}.zip"

    def upload_state(self, session: str) -> dict:
        if self.done_path(session).exists():
            size = self.done_path(session).stat().st_size
            st = self.ingester.status(session) or {}
            return {"session": session, "received": size, "total": size, "done": True, "ingest": st.get("state")}
        total = None
        try:
            total = json.loads(self.meta_path(session).read_text()).get("total")
        except (OSError, ValueError):
            pass
        received = self.part(session).stat().st_size if self.part(session).exists() else 0
        return {"session": session, "received": received, "total": total, "done": False, "ingest": None}


def make_handler(app: Inbox):
    class Handler(http.server.BaseHTTPRequestHandler):
        server_version = "yames-inbox/1"
        sys_version = ""
        protocol_version = "HTTP/1.1"
        timeout = 120

        # never log headers (the token) or bodies; the request line has no secret in it
        def log_message(self, fmt, *args):
            log(f"{self.address_string()} {fmt % args}")

        def cors(self):
            origin = self.headers.get("Origin")
            if origin in ALLOWED_ORIGINS:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
                self.send_header("Access-Control-Allow-Private-Network", "true")
                self.send_header("Access-Control-Max-Age", "600")

        def reply(self, code: int, doc: dict | None = None):
            body = json.dumps(doc if doc is not None else {}).encode()
            self.send_response(code)
            self.cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def fail(self, code: int, error: str, **extra):
            # a body we did not read would be taken for the next request
            if self.headers.get("Content-Length") and not getattr(self, "_body_read", False):
                self.close_connection = True
            self.reply(code, {"error": error, **extra})

        def authed(self) -> bool:
            h = self.headers.get("Authorization", "")
            ok = h.startswith("Bearer ") and hmac.compare_digest(h[7:].strip().encode(), app.token.encode())
            if not ok:
                self.fail(401, "unauthorized")
            return ok

        def route(self) -> tuple[str, dict]:
            u = urllib.parse.urlsplit(self.path)
            return u.path, urllib.parse.parse_qs(u.query)

        def session_of(self, path: str) -> str | None:
            m = re.fullmatch(r"/v1/uploads/([^/]+)", path)
            if not m:
                self.fail(404, "not found")
                return None
            s = urllib.parse.unquote(m.group(1))
            if not SESSION_RE.match(s):
                self.fail(400, "bad session id")
                return None
            return s

        def length(self) -> int | None:
            if self.headers.get("Transfer-Encoding"):
                self.fail(411, "send a Content-Length, not chunked")
                return None
            raw = self.headers.get("Content-Length")
            if raw is None or not raw.isdigit():
                self.fail(411, "a Content-Length is needed")
                return None
            return int(raw)

        def do_OPTIONS(self):
            # a CORS preflight: no token on it (a browser sends none), nothing read or written
            self.send_response(204)
            self.cors()
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            path, _ = self.route()
            if not self.authed():
                return
            if path == "/v1/ping":
                return self.reply(200, {"ok": True, "maxBytes": app.max_bytes, "maxChunk": app.max_chunk})
            s = self.session_of(path)
            if s is None:
                return
            self.reply(200, app.upload_state(s))

        def do_POST(self):
            path, _ = self.route()
            if path != "/v1/pair":
                if not self.authed():
                    return
                return self.fail(404, "not found")
            n = self.length()
            if n is None:
                return
            if n > 4096:
                return self.fail(413, "too large")
            try:
                doc = json.loads(self.rfile.read(n) or b"{}")
                self._body_read = True
                code = str(doc.get("code", ""))
            except (ValueError, AttributeError):
                self._body_read = True
                return self.fail(400, "bad request")
            ok = app.pairs.redeem(code) if code else False
            if ok is None:
                return self.fail(429, "too many tries: wait ten minutes")
            if not ok:
                return self.fail(403, "that pairing code is wrong, used or expired")
            log(f"paired a device ({str(doc.get('device', ''))[:60]!r})")
            self.reply(200, {"token": app.token})

        def do_PUT(self):
            path, q = self.route()
            if not self.authed():
                return
            s = self.session_of(path)
            if s is None:
                return
            n = self.length()
            if n is None:
                return
            try:
                offset = int(q.get("offset", [""])[0])
                total = int(q.get("total", [""])[0])
            except ValueError:
                return self.fail(400, "offset and total are needed")
            if offset < 0 or total <= 0:
                return self.fail(400, "bad offset or total")
            if n == 0:
                return self.fail(400, "an empty chunk")
            if total > app.max_bytes:
                return self.fail(413, "the session is over the size limit", maxBytes=app.max_bytes)
            if n > app.max_chunk:
                return self.fail(413, "the chunk is over the size limit", maxChunk=app.max_chunk)
            if offset + n > total:
                return self.fail(400, "the chunk runs past the total")
            with app.lock_for(s):
                st = app.upload_state(s)
                if st["done"]:
                    return self.fail(409, "already received", **st)
                if st["total"] is not None and st["total"] != total:
                    # the app zipped the session again (a different size): start over
                    app.part(s).unlink(missing_ok=True)
                    st = app.upload_state(s)
                if offset != st["received"]:
                    return self.fail(409, "resume from received", **st)
                if offset == 0:
                    free = shutil.disk_usage(app.inbox).free
                    if free < total + app.disk_margin:
                        return self.fail(507, "not enough free disk on the inbox")
                    app.meta_path(s).write_text(json.dumps({"total": total, "started": time.time()}))
                # read the body into the part file; a short read leaves what came, to resume from
                got = 0
                with open(app.part(s), "ab") as f:
                    while got < n:
                        piece = self.rfile.read(min(READ_PIECE, n - got))
                        if not piece:
                            break
                        f.write(piece)
                        got += len(piece)
                self._body_read = True
                if got < n:
                    self.close_connection = True
                    return
                received = offset + n
                if received < total:
                    return self.reply(200, {"session": s, "received": received, "total": total, "done": False})
                why = check_zip(app.part(s), s, app.max_bytes * 2)
                if why:
                    app.part(s).unlink(missing_ok=True)
                    app.meta_path(s).unlink(missing_ok=True)
                    log(f"{s}: refused the upload: {why}")
                    return self.reply(422, {"error": why, "session": s})
                os.replace(app.part(s), app.done_path(s))
                app.meta_path(s).unlink(missing_ok=True)
                log(f"{s}: received {total} bytes")
                app.ingester.enqueue(s)
                self.reply(201, {"session": s, "received": total, "total": total, "done": True, "ingest": "queued"})

    return Handler


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def build(host: str, port: int, token: str, inbox: pathlib.Path, pair_file: pathlib.Path, reports: pathlib.Path, repo: pathlib.Path, ingest_cmd: list[str] | None, max_bytes: int, max_chunk: int, disk_margin: int = DISK_MARGIN):
    if host not in LOCAL_HOSTS:
        raise SystemExit(f"refusing to listen on {host}: the inbox binds 127.0.0.1 only (tailscale serve exposes it)")
    inbox.mkdir(parents=True, exist_ok=True)
    ingester = Ingester(inbox, reports, repo, ingest_cmd)
    app = Inbox(token, inbox, PairStore(pair_file), ingester, max_bytes, max_chunk, disk_margin)
    srv = Server(("127.0.0.1" if host == "localhost" else host, port), make_handler(app))
    ingester.start()
    return srv, app


def default_ingest_cmd() -> list[str]:
    return ["nice", "-n", "10", "npm", "run", "--silent", "corpus:ingest", "--"]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="yames-inbox")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sv = sub.add_parser("serve", help="run the inbox")
    sv.add_argument("--host", default="127.0.0.1")
    sv.add_argument("--port", type=int, default=DEFAULT_PORT)
    sv.add_argument("--inbox", type=pathlib.Path, default=DEFAULT_INBOX)
    sv.add_argument("--reports", type=pathlib.Path, default=DEFAULT_REPORTS)
    sv.add_argument("--repo", type=pathlib.Path, default=DEFAULT_REPO, help="the checkout corpus:ingest runs from")
    sv.add_argument("--token-file", type=pathlib.Path, default=DEFAULT_TOKEN_FILE)
    sv.add_argument("--pair-file", type=pathlib.Path, default=DEFAULT_PAIR_FILE)
    sv.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    sv.add_argument("--max-chunk", type=int, default=DEFAULT_MAX_CHUNK)
    sv.add_argument("--no-ingest", action="store_true")
    pr = sub.add_parser("pair", help="make a one-time pairing code (24 h)")
    pr.add_argument("--pair-file", type=pathlib.Path, default=DEFAULT_PAIR_FILE)
    pr.add_argument("--token-file", type=pathlib.Path, default=DEFAULT_TOKEN_FILE)
    pr.add_argument("--url", default=os.environ.get("YAMES_INBOX_URL", "https://dgx-delgado.taildf6572.ts.net:8646"))
    a = ap.parse_args(argv)
    if a.cmd == "pair":
        load_token(a.token_file)  # make it if it is not there yet, so pairing can hand it out
        code = PairStore(a.pair_file).new()
        print(f"Pairing code (one use, 24 h): {code}")
        print(f"Or paste this into Yames: {a.url.rstrip('/')}/#pair={code.replace('-', '')}")
        return 0
    token = load_token(a.token_file)
    srv, _ = build(a.host, a.port, token, a.inbox, a.pair_file, a.reports, a.repo, None if a.no_ingest else default_ingest_cmd(), a.max_bytes, a.max_chunk)
    log(f"listening on http://{srv.server_address[0]}:{srv.server_address[1]} (inbox {a.inbox})")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
