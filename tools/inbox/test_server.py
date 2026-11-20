"""Tests for the test-session inbox (card #123): python3 -m unittest tools.inbox.test_server"""
from __future__ import annotations

import http.client
import io
import json
import os
import pathlib
import shutil
import stat
import tempfile
import threading
import time
import unittest
import zipfile

from tools.inbox import server

os.environ.setdefault("YAMES_INBOX_QUIET", "1")

TOKEN = "t" * 40


def session_zip(session: str = "20261120-120000", extra: dict[str, bytes] | None = None, raw_names: dict[str, bytes] | None = None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:
        z.writestr(f"{session}/session.json", json.dumps({"format": "yames-capture/1", "session": session}))
        z.writestr(f"{session}/takes/t1.f32", os.urandom(300_000))
        for k, v in (extra or {}).items():
            z.writestr(f"{session}/{k}", v)
        for k, v in (raw_names or {}).items():
            z.writestr(k, v)
    return buf.getvalue()


class InboxTest(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp(prefix="inbox-test-"))
        self.inbox = self.tmp / "inbox"
        self.pair_file = self.tmp / "secrets/pair.json"
        self.srv, self.app = server.build(
            "127.0.0.1", 0, TOKEN, self.inbox, self.pair_file, self.tmp / "reports", self.tmp, None,
            max_bytes=2_000_000, max_chunk=100_000, disk_margin=0,
        )
        self.port = self.srv.server_address[1]
        self.thread = threading.Thread(target=self.srv.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def req(self, method, path, body=None, token=TOKEN, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = {**getattr(self, "headers", {}), **(headers or {})}
        if token is not None:
            h["Authorization"] = f"Bearer {token}"
        c.request(method, path, body=body, headers=h)
        r = c.getresponse()
        data = r.read()
        c.close()
        try:
            doc = json.loads(data) if data else {}
        except ValueError:
            doc = {"raw": data}
        return r.status, doc, r

    def upload(self, blob: bytes, session="20261120-120000", chunk=90_000, start=0, stop_after=None):
        off, sent, last = start, 0, None
        while off < len(blob):
            piece = blob[off : off + chunk]
            last = self.req("PUT", f"/v1/uploads/{session}?offset={off}&total={len(blob)}", piece)
            if last[0] not in (200, 201):
                return last
            off += len(piece)
            sent += 1
            if stop_after and sent >= stop_after:
                break
        return last

    def wait_status(self, session, want):
        for _ in range(100):
            st = self.app.ingester.status(session)
            if st and st.get("state") == want:
                return st
            time.sleep(0.02)
        self.fail(f"no {want} status for {session}")

    # --- the happy path, and resume -------------------------------------------

    def test_upload_in_chunks_lands_in_the_inbox(self):
        blob = session_zip()
        code, doc, _ = self.upload(blob)
        self.assertEqual(code, 201, doc)
        self.assertTrue(doc["done"])
        self.assertEqual((self.inbox / "20261120-120000__anon.zip").read_bytes(), blob)
        self.assertFalse(any((self.inbox / ".partial").iterdir()))
        self.wait_status("20261120-120000__anon", "kept")
        code, doc, _ = self.req("GET", "/v1/uploads/20261120-120000")
        self.assertEqual((code, doc["done"]), (200, True))
        # sending it again is "already received", never a second copy
        code, doc, _ = self.req("PUT", f"/v1/uploads/20261120-120000?offset=0&total={len(blob)}", blob[:10])
        self.assertEqual(code, 409)
        self.assertTrue(doc["done"])

    def test_an_interrupted_upload_resumes_where_it_stopped(self):
        blob = session_zip()
        code, _, _ = self.upload(blob, stop_after=2)
        self.assertEqual(code, 200)
        code, st, _ = self.req("GET", "/v1/uploads/20261120-120000")
        self.assertEqual((st["received"], st["total"], st["done"]), (180_000, len(blob), False))
        # a chunk from the wrong place is refused with where to resume
        code, doc, _ = self.req("PUT", f"/v1/uploads/20261120-120000?offset=0&total={len(blob)}", blob[:90_000])
        self.assertEqual(code, 409)
        self.assertEqual(doc["received"], 180_000)
        code, doc, _ = self.upload(blob, start=st["received"])
        self.assertEqual(code, 201, doc)
        self.assertEqual((self.inbox / "20261120-120000__anon.zip").read_bytes(), blob)

    def test_a_short_body_keeps_what_came_and_resumes(self):
        blob = session_zip()
        # promise 90 000 bytes, send 50 000, hang up
        import socket

        s = socket.create_connection(("127.0.0.1", self.port))
        head = (
            f"PUT /v1/uploads/20261120-120000?offset=0&total={len(blob)} HTTP/1.1\r\nHost: x\r\n"
            f"Authorization: Bearer {TOKEN}\r\nContent-Length: 90000\r\n\r\n"
        ).encode()
        s.sendall(head + blob[:50_000])
        s.shutdown(socket.SHUT_WR)
        s.recv(100)
        s.close()
        for _ in range(100):
            _, st, _ = self.req("GET", "/v1/uploads/20261120-120000")
            if st["received"] == 50_000:
                break
            time.sleep(0.02)
        self.assertEqual(st["received"], 50_000)
        code, doc, _ = self.upload(blob, start=50_000)
        self.assertEqual(code, 201, doc)

    def test_a_rezipped_session_of_another_size_starts_over(self):
        a, b = session_zip(), session_zip(extra={"phone.wav": b"x" * 1000})
        self.upload(a, stop_after=1)
        code, doc, _ = self.req("PUT", f"/v1/uploads/20261120-120000?offset=0&total={len(b)}", b[:90_000])
        self.assertEqual(code, 200, doc)
        self.assertEqual(self.upload(b, start=90_000)[0], 201)
        self.assertEqual((self.inbox / "20261120-120000__anon.zip").read_bytes(), b)

    # --- the token -------------------------------------------------------------

    def test_every_request_needs_the_token(self):
        blob = session_zip()
        for tok in (None, "", "wrong", TOKEN + "x", TOKEN[:-1]):
            for method, path, body in (
                ("GET", "/v1/ping", None),
                ("GET", "/v1/uploads/20261120-120000", None),
                ("PUT", f"/v1/uploads/20261120-120000?offset=0&total={len(blob)}", blob[:1000]),
                ("POST", "/v1/whatever", b"{}"),
                ("GET", "/", None),
            ):
                code, _, _ = self.req(method, path, body, token=tok)
                self.assertEqual(code, 401, (tok, method, path))
        self.assertFalse((self.inbox / ".partial" / "20261120-120000__anon.part").exists())
        self.assertEqual(self.req("GET", "/v1/ping")[0], 200)

    def test_a_preflight_carries_no_data(self):
        code, doc, r = self.req("OPTIONS", "/v1/uploads/x", token=None, headers={"Origin": "http://tauri.localhost"})
        self.assertEqual(code, 204)
        self.assertEqual(r.getheader("Access-Control-Allow-Origin"), "http://tauri.localhost")
        code, _, r = self.req("OPTIONS", "/v1/ping", token=None, headers={"Origin": "https://evil.example"})
        self.assertIsNone(r.getheader("Access-Control-Allow-Origin"))

    def test_pairing_hands_out_the_token_once(self):
        code = server.PairStore(self.pair_file).new()
        self.assertEqual(stat.S_IMODE(self.pair_file.stat().st_mode), 0o600)
        self.assertNotIn(code.replace("-", ""), self.pair_file.read_text())
        st, doc, _ = self.req("POST", "/v1/pair", json.dumps({"code": "WRONG-CODE0"}).encode(), token=None)
        self.assertEqual(st, 403)
        st, doc, _ = self.req("POST", "/v1/pair", json.dumps({"code": code.lower()}).encode(), token=None)
        self.assertEqual((st, doc.get("token")), (200, TOKEN))
        st, _, _ = self.req("POST", "/v1/pair", json.dumps({"code": code}).encode(), token=None)
        self.assertEqual(st, 403)

    def test_pairing_stops_after_too_many_wrong_codes(self):
        good = server.PairStore(self.pair_file).new()
        for _ in range(server.PAIR_FAIL_MAX):
            self.req("POST", "/v1/pair", json.dumps({"code": "AAAAA-AAAAA"}).encode(), token=None)
        st, _, _ = self.req("POST", "/v1/pair", json.dumps({"code": good}).encode(), token=None)
        self.assertEqual(st, 429)

    def test_an_expired_code_is_refused(self):
        code = server.PairStore(self.pair_file).new(ttl_s=-1)
        st, _, _ = self.req("POST", "/v1/pair", json.dumps({"code": code}).encode(), token=None)
        self.assertEqual(st, 403)

    def test_the_token_file_is_made_private_and_a_readable_one_refused(self):
        p = self.tmp / "sec/tok"
        tok = server.load_token(p)
        self.assertGreaterEqual(len(tok), 40)
        self.assertEqual(stat.S_IMODE(p.stat().st_mode), 0o600)
        os.chmod(p, 0o644)
        with self.assertRaises(SystemExit):
            server.load_token(p)

    # --- sizes -----------------------------------------------------------------

    def test_oversized_uploads_and_chunks_are_refused(self):
        code, doc, _ = self.req("PUT", "/v1/uploads/20261120-120000?offset=0&total=2000001", b"x" * 10)
        self.assertEqual(code, 413)
        code, doc, _ = self.req("PUT", "/v1/uploads/20261120-120000?offset=0&total=500000", b"x" * 100_001)
        self.assertEqual(code, 413)
        code, doc, _ = self.req("PUT", "/v1/uploads/20261120-120000?offset=0&total=10", b"x" * 11)
        self.assertEqual(code, 400)
        code, _, _ = self.req("PUT", "/v1/uploads/20261120-120000?offset=0&total=10", b"")
        self.assertEqual(code, 400)
        code, _, _ = self.req("PUT", "/v1/uploads/20261120-120000?offset=0&total=10", b"x" * 10, headers={"Transfer-Encoding": "chunked"})
        self.assertEqual(code, 411)
        self.assertFalse((self.inbox / ".partial" / "20261120-120000__anon.part").exists())

    def test_a_zip_that_unpacks_past_the_limit_is_refused(self):
        why = server.check_zip(self._write(session_zip(extra={"big": b"\0" * 400_000})), "20261120-120000", 300_000)
        self.assertIn("size limit", why)

    def test_no_room_on_the_disk(self):
        self.app.disk_margin = 1 << 60
        code, _, _ = self.req("PUT", "/v1/uploads/20261120-120000?offset=0&total=1000", b"x" * 1000)
        self.assertEqual(code, 507)

    # --- paths -----------------------------------------------------------------

    def test_a_session_id_cannot_leave_the_inbox(self):
        for bad in ("..", "..%2F..%2Fetc", "a%2Fb", "%2e%2e", "a.b", "x" * 65, "a%00b", "%20"):
            code, _, _ = self.req("PUT", f"/v1/uploads/{bad}?offset=0&total=10", b"x" * 10)
            self.assertIn(code, (400, 404), bad)
        code, _, _ = self.req("PUT", "/v1/uploads/../../etc?offset=0&total=10", b"x" * 10)
        self.assertIn(code, (400, 404))
        self.assertEqual(sorted(p.name for p in self.inbox.iterdir()), [".partial"])

    def test_a_zip_with_a_traversal_name_is_refused_and_not_kept(self):
        for names in ({"../evil.txt": b"x"}, {"20261120-120000/../../evil": b"x"}, {"/abs": b"x"}, {"other/x": b"x"}, {"20261120-120000\\..\\x": b"x"}, {"C:/x": b"x"}):
            blob = session_zip(raw_names=names)
            code, doc, _ = self.upload(blob)
            self.assertEqual(code, 422, (names, doc))
            self.assertFalse((self.inbox / "20261120-120000__anon.zip").exists())
        self.assertFalse((self.tmp / "evil.txt").exists())

    def test_a_zip_with_a_symlink_or_no_session_json_is_refused(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("20261120-120000/session.json", "{}")
            zi = zipfile.ZipInfo("20261120-120000/link")
            zi.external_attr = (stat.S_IFLNK | 0o777) << 16
            z.writestr(zi, "/etc/passwd")
        self.assertIn("symlink", server.check_zip(self._write(buf.getvalue()), "20261120-120000", 10**9))
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("20261120-120000/x", "{}")
        self.assertIn("session.json", server.check_zip(self._write(buf.getvalue()), "20261120-120000", 10**9))
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("20261120-120000/session.json", json.dumps({"session": "../../etc"}))
        self.assertIn("another session", server.check_zip(self._write(buf.getvalue()), "20261120-120000", 10**9))
        self.assertIn("not a zip", server.check_zip(self._write(b"PK\3\4 garbage" * 10), "20261120-120000", 10**9))

    def test_it_never_listens_beyond_this_machine(self):
        for host in ("0.0.0.0", "::", "100.72.194.66", ""):
            with self.assertRaises(SystemExit):
                server.build(host, 0, TOKEN, self.inbox, self.pair_file, self.tmp, self.tmp, None, 10, 10)
        self.assertEqual(self.srv.server_address[0], "127.0.0.1")

    # --- the review's findings (card #123) ---------------------------------------

    def test_an_id_with_a_trailing_newline_is_refused(self):
        for bad in ("abc%0A", "abc%0D", "abc%0A%0A"):
            code, _, _ = self.req("PUT", f"/v1/uploads/{bad}?offset=0&total=10", b"x" * 10)
            self.assertEqual(code, 400, bad)
        self.assertEqual(sorted(p.name for p in self.inbox.iterdir()), [".partial"])

    def test_a_nested_session_json_is_refused(self):
        blob = session_zip(extra={"A/session.json": json.dumps({"session": "VICTIM"}).encode()})
        code, doc, _ = self.upload(blob)
        self.assertEqual(code, 422, doc)
        self.assertIn("second session.json", doc["error"])

    def test_two_devices_with_the_same_session_id_never_meet(self):
        a, b = session_zip(), session_zip(extra={"phone.wav": b"x" * 5000})
        for dev, blob in (("aaaa1111", a), ("bbbb2222", b)):
            self.headers = {"X-Yames-Device": dev}
            code, doc, _ = self.upload(blob)
            self.assertEqual(code, 201, (dev, doc))
        self.headers = {}
        self.assertEqual((self.inbox / "20261120-120000__aaaa1111.zip").read_bytes(), a)
        self.assertEqual((self.inbox / "20261120-120000__bbbb2222.zip").read_bytes(), b)
        code, _, _ = self.req("GET", "/v1/uploads/20261120-120000", headers={"X-Yames-Device": "../x"})
        self.assertEqual(code, 400)

    def test_a_late_chunk_of_an_older_zip_does_not_wipe_the_upload(self):
        a, b = session_zip(), session_zip(extra={"phone.wav": b"x" * 1000})
        self.upload(b, stop_after=2)
        code, doc, _ = self.req("PUT", f"/v1/uploads/20261120-120000?offset=90000&total={len(a)}", a[90_000:180_000])
        self.assertEqual(code, 409)
        self.assertEqual(doc["received"], 180_000)
        self.assertEqual(self.upload(b, start=180_000)[0], 201)

    def test_unicode_digits_are_a_bad_request_not_a_crash(self):
        for q in ("offset=%C2%B2&total=10", "offset=0&total=%D9%A1"):
            code, _, _ = self.req("PUT", f"/v1/uploads/20261120-120000?{q}", b"x" * 10)
            self.assertEqual(code, 400, q)
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        c.putrequest("PUT", "/v1/uploads/20261120-120000?offset=0&total=10")
        c.putheader("Authorization", f"Bearer {TOKEN}")
        c.putheader("Content-Length", "\u00b2".encode("latin-1"))
        c.endheaders()
        self.assertEqual(c.getresponse().status, 411)
        c.close()

    def test_room_for_the_ingest_and_other_uploads_is_counted(self):
        # 1.5 MB promised by another upload, nothing of it sent
        (self.inbox / ".partial" / "other__anon.json").write_text(json.dumps({"total": 1_500_000}))
        free = server.shutil.disk_usage(self.inbox).free
        self.app.disk_margin = free - 1_400_000 - 3 * 100
        code, _, _ = self.req("PUT", "/v1/uploads/20261120-120000?offset=0&total=100", b"x" * 100)
        self.assertEqual(code, 507)

    def test_an_abandoned_half_upload_is_dropped_after_a_week(self):
        part = self.inbox / ".partial" / "old__anon.part"
        part.write_bytes(b"x")
        os.utime(part, (time.time() - 8 * 86400,) * 2)
        self.app.expire_partials()
        self.assertFalse(part.exists())

    def _write(self, blob: bytes) -> pathlib.Path:
        p = self.tmp / f"z{time.monotonic_ns()}.zip"
        p.write_bytes(blob)
        return p


class IngestRunTest(unittest.TestCase):
    def test_a_restart_requeues_what_was_queued_or_running(self):
        tmp = pathlib.Path(tempfile.mkdtemp(prefix="inbox-requeue-"))
        try:
            for k, st in (("q1__anon", "queued"), ("r1__anon", "running"), ("d1__anon", "ingested"), ("n1__anon", None)):
                (tmp / f"{k}.zip").write_bytes(b"zip")
                if st:
                    (tmp / f"{k}.status.json").write_text(json.dumps({"state": st}))
            ing = server.Ingester(tmp, tmp / "reports", tmp, None)
            ing.start()
            for _ in range(200):
                if all((ing.status(k) or {}).get("state") == "kept" for k in ("q1__anon", "r1__anon", "n1__anon")):
                    break
                time.sleep(0.02)
            self.assertEqual({k: ing.status(k)["state"] for k in ("q1__anon", "r1__anon", "d1__anon", "n1__anon")},
                             {"q1__anon": "kept", "r1__anon": "kept", "d1__anon": "ingested", "n1__anon": "kept"})
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_one_bad_ingest_does_not_stop_the_worker(self):
        tmp = pathlib.Path(tempfile.mkdtemp(prefix="inbox-worker-"))
        try:
            ing = server.Ingester(tmp, tmp / "reports", tmp, ["true"])
            calls = []
            real = ing._one

            def flaky(k):
                calls.append(k)
                if k == "bad__anon":
                    raise OSError("disk gone")
                real(k)

            ing._one = flaky
            ing.start()
            (tmp / "ok__anon.zip").write_bytes(b"z")
            ing.q.put("bad__anon")
            ing.enqueue("ok__anon")
            for _ in range(200):
                if (ing.status("ok__anon") or {}).get("state") == "ingested":
                    break
                time.sleep(0.02)
            self.assertEqual(ing.status("ok__anon")["state"], "ingested")
            self.assertEqual(calls, ["bad__anon", "ok__anon"])
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_a_finished_upload_runs_the_ingest_and_records_it(self):
        tmp = pathlib.Path(tempfile.mkdtemp(prefix="inbox-ingest-"))
        try:
            ing = server.Ingester(tmp, tmp / "reports", tmp, ["sh", "-c", 'echo "got $0" && test -f "$0"'])
            ing.start()
            (tmp / "s1.zip").write_bytes(b"zip")
            ing.enqueue("s1")
            for _ in range(200):
                st = ing.status("s1")
                if st and st["state"] in ("ingested", "failed"):
                    break
                time.sleep(0.02)
            self.assertEqual(st["state"], "ingested", st)
            self.assertIn("got", (tmp / "reports/inbox-logs/s1.log").read_text())
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
