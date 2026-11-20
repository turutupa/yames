"""tools/corpus/ingest.py on a synthetic session (plans/capture/FORMAT.md), no cargo needed.

    ~/projects/.venvs/ml/bin/python -m unittest tools.corpus.test_ingest
"""
from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest
import zipfile

import numpy as np
import soundfile as sf

from tools.corpus import ingest

APP_SR, PHONE_SR = 48000, 44100
BASE_NS = 5_000_000_000
PHONE_OFFSET_S, PHONE_PPM = 1.234, 80.0
B = 1.0 + PHONE_PPM * 1e-6


def jsonl(path) -> list:
    return [json.loads(line) for line in pathlib.Path(path).read_text().splitlines() if line.strip()]


def phone_time(ns: int) -> float:
    """The truth: where app-clock `ns` is in the phone file."""
    return PHONE_OFFSET_S + B * (ns - BASE_NS) / 1e9


def chirp(sr: int) -> np.ndarray:
    t = np.arange(int(0.3 * sr)) / sr
    f0, f1, T = 600.0, 7000.0, 0.3
    k = np.log(f1 / f0)
    ph = 2 * np.pi * f0 * T / k * (np.exp(t / T * k) - 1)
    return (0.35 * np.sin(ph) * np.hanning(len(t))).astype(np.float32)


def pluck(sr: int, midi: float, dur: float, rng) -> np.ndarray:
    t = np.arange(int(dur * sr)) / sr
    f = 440.0 * 2 ** ((midi - 69) / 12)
    y = sum((0.6 / h) * np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6)) for h in range(1, 6))
    att = np.minimum(1.0, t / 0.002)
    return (y * att * np.exp(-t * 5.0) * 0.5).astype(np.float32)


# (start s on the app clock after BASE_NS, seconds, kind, onsets as (beat, midi))
TAKES = [
    (3.0, 6.5, "take", [(0, 52), (1, 55), (1.5, 57), (2.5, 59), (3, 60), (4.25, 62), (5, 64), (6, 62), (7.5, 60), (8, 57)]),
    (12.0, 7.0, "take", [(0, 45), (0.5, 48), (2, 50), (2.75, 52), (3.5, 55), (4, 57), (5.5, 55), (6, 52), (7, 50), (9, 48), (10, 45)]),
    (21.5, 6.0, "freeplay", [(0, 40), (0.7, 43), (1.9, 47), (2.4, 50), (3.6, 52), (5.1, 55), (6.3, 52), (7.7, 47)]),
]
FIRST_BEAT_MS, BPM = 1000.0, 120.0
START_CHIRP_S, END_CHIRP_S = 1.0, 30.0
MARKS_S = [14.0, 21.5 + 6.0 + 5.0, 200.0]  # inside Take 1; 5 s after the jam ended; nowhere


def make_session(root: pathlib.Path) -> pathlib.Path:
    rng = np.random.default_rng(7)
    d = root / "20261120-033000"
    d.mkdir(parents=True)
    c = chirp(APP_SR)
    sf.write(d / "chirp.wav", c, APP_SR, subtype="FLOAT")
    total_s = 40.0
    phone = np.zeros(int(total_s * PHONE_SR), np.float32)

    def place(sig: np.ndarray, sr: int, ns: int):
        """Into the phone file at the true time, with the phone's clock running B fast."""
        t0 = phone_time(ns)
        n = int(len(sig) / sr * B * PHONE_SR)
        pos = (np.arange(n) / PHONE_SR / B) * sr
        seg = np.interp(pos, np.arange(len(sig)), sig, right=0.0) * 0.6
        i = int(round(t0 * PHONE_SR))
        frac = t0 * PHONE_SR - i  # sub-sample start
        seg = np.interp(np.arange(n) - frac, np.arange(n), seg, left=0.0)
        phone[i:i + n] += seg[: len(phone) - i]

    for s in (START_CHIRP_S, END_CHIRP_S):
        place(c, APP_SR, BASE_NS + int(s * 1e9))
    for k, (start, secs, kind, onsets) in enumerate(TAKES):
        n = int(secs * APP_SR)
        y = (rng.standard_normal(n) * 1e-3).astype(np.float32)
        for beat, midi in onsets:
            i = int((FIRST_BEAT_MS / 1000 + beat * 60 / BPM) * APP_SR)
            p = pluck(APP_SR, midi, 0.45, rng)[: n - i]
            y[i:i + len(p)] += p
        stem = f"take-{1795600000000 + k * 10000:013d}-{k + 1:04d}"
        sf.write(d / f"{stem}.wav", y, APP_SR, subtype="FLOAT")
        start_ns = BASE_NS + int(start * 1e9)
        place(y, APP_SR, start_ns)
        cap = {"session": d.name, "kind": kind, "mode": "graded" if kind == "take" else "ungraded",
               "context": {"pathId": "blues", "stepId": f"s{k}", "exerciseId": f"ex{k}", "variantSeed": k, "bpm": BPM},
               "rate": APP_SR, "samples": n, "audioStartNs": start_ns, "audioStartWallMs": 1795600000000.0 + start * 1000,
               "firstBeatSample": int(FIRST_BEAT_MS / 1000 * APP_SR), "countInStartSample": 0, "countInBeats": 4, "marks": []}
        job = {"audio": f"{stem}.wav", "bpm": BPM, "firstBeatMs": FIRST_BEAT_MS, "beatsPerBar": 4, "instrument": "electric-guitar", "capture": cap}
        if kind == "take":
            job["schedule"] = {"onsets": [{"id": i, "beat": float(b), "noteIds": [i], "soft": False, "accent": False} for i, (b, _) in enumerate(onsets)],
                               "lengthBeats": 12.0, "loops": False}
            job["pitches"] = [{"id": i, "midi": float(m)} for i, (_, m) in enumerate(onsets)]
            job["details"] = [{"id": i, "durBeats": 0.5, "bend": 0, "string": 5, "tech": ["palmMute"] if i == 0 else []} for i in range(len(onsets))]
            job["live"] = {"grade": {"verdict": "caught", "score": 80.0, "due": len(onsets), "heard": len(onsets), "missed": 0, "extra": 0},
                           "results": [{"id": i, "state": "hit", "deviationMs": 3.0, "pass": 0} for i in range(len(onsets))], "onsets": []}
        else:
            job["heard"] = {"key": "E minor", "chords": ["Em"]}
        (d / f"{stem}.job.json").write_text(json.dumps(job))
    phone += (rng.standard_normal(len(phone)) * 3e-3).astype(np.float32)
    sf.write(d / "phone-recording.wav", phone, PHONE_SR, subtype="PCM_16")
    chirps = [{"kind": k, "played": True, "playNs": BASE_NS + int(s * 1e9), "wallMs": 0.0, "outputLatencyUs": 10667, "rate": APP_SR,
               "samples": len(c), "f0": 600.0, "f1": 7000.0, "seconds": 0.3, "amp": 0.35, "shape": "log sweep"}
              for k, s in (("start", START_CHIRP_S), ("end", END_CHIRP_S))]
    session = {"format": "yames-capture/1", "session": d.name, "startedWallMs": 1795600000000.0, "endedWallMs": 1795600040000.0,
               "clock": {"ns": BASE_NS, "wallMs": 1795600000000.0}, "app": {"version": "test", "platform": "linux", "arch": "aarch64"},
               "inputRate": APP_SR, "outputRate": APP_SR, "outputLatencyUs": 10667, "device": {"input": "Test DI", "instrument": "electric-guitar"},
               "chirps": chirps, "takes": len(TAKES)}
    (d / "session.json").write_text(json.dumps(session))
    (d / "marks.jsonl").write_text("".join(json.dumps({"ns": BASE_NS + int(s * 1e9), "wallMs": 0.0}) + "\n" for s in MARKS_S))
    return d


class IngestTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = pathlib.Path(tempfile.mkdtemp(prefix="corpus-test-"))
        os.environ["YAMES_CAPTURE_RAW"] = str(cls.tmp / "raw")
        os.environ["YAMES_CORPUS_PREVIEW"] = str(cls.tmp / "preview")
        os.environ["YAMES_CORPUS_CASES"] = str(cls.tmp / "cases")
        cls.session = make_session(cls.tmp / "capture")
        cls.store = cls.tmp / "store"
        rc = ingest.main([str(cls.session), "--no-replay", "--store-root", str(cls.store)])
        assert rc == 0, rc
        cls.summary = json.loads((cls.tmp / "preview" / cls.session.name / "summary.json").read_text())
        cls.set = cls.store / f"corpus-{cls.session.name}"

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_chirps_and_drift(self):
        (rec,) = self.summary["seconds"]
        self.assertEqual(rec["chain"], "phone")
        self.assertEqual(rec["method"], "chirps")
        kinds = {c["kind"]: c["fileS"] for c in rec["chirps"]}
        self.assertAlmostEqual(kinds["start"], phone_time(BASE_NS + int(START_CHIRP_S * 1e9)), delta=0.001)
        self.assertAlmostEqual(kinds["end"], phone_time(BASE_NS + int(END_CHIRP_S * 1e9)), delta=0.001)
        self.assertLess(abs(rec["driftPpm"] - PHONE_PPM), 20.0)

    def test_per_take_offset(self):
        (rec,) = self.summary["seconds"]
        self.assertEqual(rec["aligned"], len(TAKES), rec.get("dropped"))
        for k, (start, *_rest) in enumerate(TAKES):
            stem = f"take-{1795600000000 + k * 10000:013d}-{k + 1:04d}"
            got = rec["takes"][stem]["fileStartS"]
            self.assertLess(abs(got - phone_time(BASE_NS + int(start * 1e9))) * 1000, 2.0, (stem, rec["takes"][stem]))
            self.assertGreater(rec["takes"][stem]["conf"], 0.5)

    def test_store(self):
        man = json.loads((self.set / "manifest.json").read_text())
        self.assertEqual(man["licence"], "owner, private")
        self.assertEqual(man["rate"], 22050)
        takes = jsonl(self.set / "takes.jsonl")
        items = jsonl(self.set / "items.jsonl")
        self.assertEqual(len(takes), len(TAKES))
        self.assertEqual(len(items), 2 * len(TAKES))
        for t in takes:
            self.assertEqual((t["split"], t["licence"], t["source"]), ("corpus", "owner, private", "yames-capture"))
        for it in items:
            self.assertEqual(it["split"], "corpus")
        self.assertEqual({it["chain"]["name"] for it in items}, {"app", "phone"})
        audio = np.memmap(self.set / "audio.i16", dtype="<i2", mode="r")
        self.assertEqual(len(audio), sum(it["samples"] for it in items))
        # labels: from the schedule, unconfirmed without a replay, the jam with none
        t0 = takes[0]
        self.assertEqual(len(t0["notes"]), len(TAKES[0][3]))
        n = t0["notes"][1]
        self.assertAlmostEqual(n["t"], FIRST_BEAT_MS / 1000 + 1 * 60 / BPM, places=4)
        self.assertEqual((n["midi"], n["string"], n["confirmed"]), (55, 5, False))
        self.assertEqual(t0["notes"][0]["cls"], "palm_mute")
        self.assertEqual(takes[2]["notes"], [])
        self.assertEqual(takes[2]["heard"]["key"], "E minor")
        # the phone item of a Take is that Take: its envelope lines up with the app's
        app, ph = items[2], items[3]
        a = audio[app["offset"]:app["offset"] + app["samples"]].astype(float)
        b = audio[ph["offset"]:ph["offset"] + ph["samples"]].astype(float)
        ea, eb = ingest.onset_envelope(a), ingest.onset_envelope(b)
        self.assertGreater(ingest.pearson_at(ea, eb), 0.5)

    def test_marks(self):
        takes = jsonl(self.set / "takes.jsonl")
        self.assertEqual([t["feltOff"] for t in takes], [False, True, True])
        marks = self.summary["marks"]
        self.assertEqual([m["how"] for m in marks], ["inside", "after", None])
        self.assertAlmostEqual(takes[1]["marks"][0], 2.0, places=2)

    def test_report_files(self):
        out = self.tmp / "preview" / self.session.name
        for f in ("report.md", "report.html", "summary.json"):
            self.assertTrue((out / f).stat().st_size > 200, f)
        self.assertIn("phone-recording.wav", (out / "report.html").read_text())

    def test_disagreement_case_from_a_replay(self):
        """A replay the verifier made (faked here: written beside the report, newer than the Take) -> confirmed labels and a case."""
        name = self.session.name
        rdir = self.tmp / "preview" / name / "replay"
        rdir.mkdir(parents=True, exist_ok=True)
        for k in (0, 1):
            stem = f"take-{1795600000000 + k * 10000:013d}-{k + 1:04d}"
            onsets = TAKES[k][3]
            exp = []
            for i, (beat, midi) in enumerate(onsets):
                due = FIRST_BEAT_MS + beat * 60000 / BPM
                heard = "no" if (k == 0 and i == 2) else "yes"
                exp.append({"result": i, "onsetId": i, "pass": 0, "beat": beat, "dueMs": due, "state": "hit", "heardAtMs": due + 2.0, "pitchPass": "right",
                            "notes": [{"id": i, "midi": float(midi), "verifier": {"heard": heard, "how": "pick", "strength": 0.8}}]})
            (rdir / f"{stem}.replay.json").write_text(json.dumps({"expected": exp, "grade": {"score": 78.0}, "verifierStatus": "ran"}))
            (rdir / f"{stem}.replay.html").write_text("<html></html>")
        store2 = self.tmp / "store2"
        self.assertEqual(ingest.main([str(self.session), "--store-root", str(store2)]), 0)
        s = json.loads((self.tmp / "preview" / name / "summary.json").read_text())
        dis = [t for t in s["perTake"] if t["disagree"]]
        self.assertEqual([t["take"] for t in dis], [f"take-{1795600000000:013d}-0001"])
        self.assertEqual(dis[0]["rows"][0]["disagree"], "live heard, verifier did not")
        truth = json.loads(pathlib.Path(dis[0]["case"]).read_text())
        self.assertEqual(len(truth["truth"]), len(TAKES[0][3]))
        self.assertIsNone(truth["truth"][2]["tPlayed"])
        self.assertEqual(truth["truth"][2]["fault"], "omitted")
        self.assertAlmostEqual(truth["leadS"], 1.0)
        self.assertTrue(pathlib.Path(dis[0]["case"]).with_name(dis[0]["take"] + ".wav").exists())
        takes = jsonl(store2 / f"corpus-{name}" / "takes.jsonl")
        self.assertEqual(sum(n["confirmed"] for n in takes[0]["notes"]), len(TAKES[0][3]) - 1)
        self.assertAlmostEqual(takes[0]["notes"][0]["t"], (FIRST_BEAT_MS + 2.0) / 1000, places=4)
        self.assertIn("run --dir", (self.tmp / "preview" / name / "report.md").read_text())

    def test_one_chirp_and_none(self):
        """Only the start chirp in session.json: offset from it; no chirp at all: per-Take cross-correlation."""
        for variant in ("start-only", "none"):
            d = make_session(self.tmp / variant)
            s = json.loads((d / "session.json").read_text())
            s["chirps"] = s["chirps"][:1] if variant == "start-only" else []
            (d / "session.json").write_text(json.dumps(s))
            if variant == "none":
                (d / "chirp.wav").unlink()
            self.assertEqual(ingest.main([str(d), "--no-replay", "--no-cases", "--store-root", str(self.tmp / f"store-{variant}")]), 0)
            (rec,) = json.loads((self.tmp / "preview" / d.name / "summary.json").read_text())["seconds"]
            self.assertEqual(rec["method"], "chirp-start" if variant == "start-only" else "xcorr")
            self.assertEqual(rec["aligned"], len(TAKES), (variant, rec["dropped"]))
            for k, (start, *_rest) in enumerate(TAKES):
                stem = f"take-{1795600000000 + k * 10000:013d}-{k + 1:04d}"
                self.assertLess(abs(rec["takes"][stem]["fileStartS"] - phone_time(BASE_NS + int(start * 1e9))) * 1000, 2.0, (variant, stem))

    def test_zip_and_dry_run(self):
        zp = self.tmp / f"yames-capture-{self.session.name}.zip"
        with zipfile.ZipFile(zp, "w") as z:
            for p in self.session.rglob("*"):
                z.write(p, f"{self.session.name}/{p.relative_to(self.session)}")
        found = ingest.resolve_input(str(zp), None, False)
        self.assertEqual([p.name for p in found], [self.session.name])
        self.assertTrue((found[0] / "session.json").exists())
        script = ingest.rtx_script(2)
        self.assertIn("N=2", script)
        self.assertIn("run-as", script)
        self.assertIn("tar -chf -", script)
        self.assertIn(ingest.ANDROID_SHARED, script)

    def test_a_zip_cannot_name_its_way_out_of_the_raw_root(self):
        # session.json's "session" becomes the folder name: a path in it falls back to the folder's own
        zp = self.tmp / "evil.zip"
        with zipfile.ZipFile(zp, "w") as z:
            z.writestr("20261120-010203/session.json", json.dumps({"session": "../../outside"}))
        found = ingest.resolve_input(str(zp), None, False)
        self.assertEqual([p.name for p in found], ["20261120-010203"])
        self.assertFalse((self.tmp / "outside").exists())
        self.assertEqual(found[0].parent, ingest.raw_root())
        zp = self.tmp / "evil2.zip"
        with zipfile.ZipFile(zp, "w") as z:
            z.writestr("../x/session.json", "{}")
        with self.assertRaises(ValueError):
            ingest.resolve_input(str(zp), None, False)

    def test_a_nested_session_or_a_namesake_never_replaces_another(self):
        victim = ingest.raw_root() / "VICTIM"
        victim.mkdir(parents=True, exist_ok=True)
        (victim / "session.json").write_text(json.dumps({"session": "VICTIM", "startedWallMs": 1}))
        zp = self.tmp / "nested.zip"
        with zipfile.ZipFile(zp, "w") as z:
            z.writestr("20261120-040000/session.json", json.dumps({"session": "20261120-040000"}))
            z.writestr("20261120-040000/A/session.json", json.dumps({"session": "VICTIM"}))
        with self.assertRaises(ValueError):
            ingest.resolve_input(str(zp), None, False)
        self.assertEqual(json.loads((victim / "session.json").read_text())["startedWallMs"], 1)
        # the same name from another device lands beside it; the same recording again replaces itself
        def zipped(started, platform, name):
            p = self.tmp / name
            with zipfile.ZipFile(p, "w") as z:
                z.writestr("20261120-050000/session.json", json.dumps({"session": "20261120-050000", "startedWallMs": started, "app": {"platform": platform}}))
            return p
        a = ingest.resolve_input(str(zipped(10, "windows", "a.zip")), None, False)
        b = ingest.resolve_input(str(zipped(10, "android", "b.zip")), None, False)
        a2 = ingest.resolve_input(str(zipped(10, "windows", "a2.zip")), None, False)
        self.assertEqual([a[0].name, b[0].name, a2[0].name], ["20261120-050000", "20261120-050000-b", "20261120-050000"])


@unittest.skipIf(ingest.ffmpeg_bin() is None, "no ffmpeg (~/tools/ffmpeg/ffmpeg, $YAMES_FFMPEG or PATH)")
class PhoneM4aTest(unittest.TestCase):
    """The phone's recorder default: AAC in an m4a, decoded through ffmpeg. Lossy, so the same 2 ms bar as the WAV."""

    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp(prefix="corpus-m4a-"))
        self.env = {k: os.environ.get(k) for k in ("YAMES_CAPTURE_RAW", "YAMES_CORPUS_PREVIEW", "YAMES_CORPUS_CASES", "YAMES_FFMPEG")}
        os.environ["YAMES_CAPTURE_RAW"] = str(self.tmp / "raw")
        os.environ["YAMES_CORPUS_PREVIEW"] = str(self.tmp / "preview")
        os.environ["YAMES_CORPUS_CASES"] = str(self.tmp / "cases")
        self.d = make_session(self.tmp / "capture")
        wav = self.d / "phone-recording.wav"
        self.m4a = self.d / "phone.m4a"
        r = subprocess.run([ingest.ffmpeg_bin(), "-nostdin", "-loglevel", "error", "-i", str(wav), "-c:a", "aac", "-b:a", "128k", str(self.m4a)])
        self.assertEqual(r.returncode, 0)
        wav.unlink()

    def tearDown(self):
        for k, v in self.env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        shutil.rmtree(self.tmp, ignore_errors=True)

    def summary(self) -> dict:
        return json.loads((self.tmp / "preview" / self.d.name / "summary.json").read_text())

    def test_m4a_aligns(self):
        self.assertLess(self.m4a.stat().st_size, 1_000_000)
        self.assertEqual(ingest.main([str(self.d), "--no-replay", "--no-cases", "--store-root", str(self.tmp / "store")]), 0)
        (rec,) = self.summary()["seconds"]
        self.assertEqual((rec["file"], rec["decoded"], rec["method"]), ("phone.m4a", "ffmpeg", "chirps"))
        self.assertEqual(rec["aligned"], len(TAKES), rec.get("dropped"))
        for k, (start, *_rest) in enumerate(TAKES):
            stem = f"take-{1795600000000 + k * 10000:013d}-{k + 1:04d}"
            self.assertLess(abs(rec["takes"][stem]["fileStartS"] - phone_time(BASE_NS + int(start * 1e9))) * 1000, 2.0, (stem, rec["takes"][stem]))
        items = jsonl(self.tmp / "store" / f"corpus-{self.d.name}" / "items.jsonl")
        self.assertEqual({it["chain"]["name"] for it in items}, {"app", "phone"})

    def test_m4a_without_ffmpeg_is_skipped_with_a_reason(self):
        os.environ["YAMES_FFMPEG"] = ""
        self.assertIsNone(ingest.ffmpeg_bin())
        self.assertEqual(ingest.main([str(self.d), "--no-replay", "--no-cases", "--store-root", str(self.tmp / "store")]), 0)
        (rec,) = self.summary()["seconds"]
        self.assertIn("needs ffmpeg", rec["skipped"])
        self.assertIn("WAV", rec["skipped"])


if __name__ == "__main__":
    unittest.main()
