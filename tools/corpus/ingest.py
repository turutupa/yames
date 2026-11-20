"""Recording-session ingest: a Yames capture session -> the ML factory store, a report, regression cases.

    npm run corpus:ingest -- <session dir | capture dir | file.zip | rtx> [options]

The on-disk contract is `plans/capture/FORMAT.md` (the app writes it). For every
session this:

1. aligns every second recording (phone, laptop, DI, ...) dropped into the
   session folder to the app's clock: the start/end sync chirps by matched
   filter give offset and drift, one chirp gives the offset alone, none falls
   back to onset-envelope cross-correlation per Take; then every Take is
   refined locally (+-150 ms) against the Take's own wav;
2. labels every Take from its job (schedule, pitches, beat map, details) and
   confirms each note with the verifier (`detect-bench replay`), keeping the
   unconfirmed ones flagged;
3. writes the set `corpus-<session>` in the factory store format (split
   `corpus`), a report (markdown, html, json) under
   ~/projects/.preview/corpus/<session>/, and a regression case for every Take
   where the live grade and the verifier disagree under
   ~/projects/.datasets/yames-corpus-cases/<session>/.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import html
import json
import math
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import zipfile

import numpy as np
import soundfile as sf
from scipy import signal

try:  # the factory's own store, when this checkout has it (branch mvp-ml)
    from tools.ml.factory import store  # type: ignore
except Exception:  # pragma: no cover - depends on the branch
    from tools.corpus import store_compat as store

HOME = pathlib.Path.home()
REPO = pathlib.Path(__file__).resolve().parents[2]
SOURCE = "yames-capture"
LICENCE = "owner, private"
SPLIT = "corpus"
ENV_HOP = 32  # samples at store.RATE: 1.45 ms (as tools/ml/factory/real.py)
ENV_WIN = 256
AUDIO_EXT = {".wav", ".flac", ".mp3", ".ogg", ".oga", ".opus", ".aif", ".aiff", ".m4a", ".aac", ".wma", ".caf", ".webm", ".mp4"}
MARK_WINDOW_S = 30.0
RTX_CAPTURE = "/mnt/c/Users/delgado/AppData/Roaming/com.yames.metronome/capture"
RTX_DOWNLOADS = "/mnt/c/Users/delgado/Downloads"
RTX_ADB = "/mnt/c/Users/delgado/tools/platform-tools/adb.exe"
ANDROID_PKG = "com.yames.metronome"
# where a test build copies each session zip, for `adb pull` on a non-debuggable build (card #123)
ANDROID_SHARED = "/sdcard/Documents/Yames/capture"
SESSION_RE = re.compile(r"^\d{8}-\d{6}")


def env_path(name: str, default: pathlib.Path) -> pathlib.Path:
    return pathlib.Path(os.environ.get(name, str(default))).expanduser()


def raw_root() -> pathlib.Path:
    return env_path("YAMES_CAPTURE_RAW", HOME / "projects/.datasets/yames-capture-raw")


def preview_root() -> pathlib.Path:
    return env_path("YAMES_CORPUS_PREVIEW", HOME / "projects/.preview/corpus")


def cases_root() -> pathlib.Path:
    return env_path("YAMES_CORPUS_CASES", HOME / "projects/.datasets/yames-corpus-cases")


def log(msg: str):
    print(msg, file=sys.stderr, flush=True)


# ------------------------------------------------------------------ audio

def read_mono(path) -> tuple[np.ndarray, int]:
    x, sr = sf.read(str(path), always_2d=True, dtype="float32")
    return x.mean(axis=1), int(sr)


def resample(x: np.ndarray, sr: int, to_rate: int = store.RATE) -> np.ndarray:
    if sr == to_rate:
        return np.asarray(x, dtype=np.float32)
    g = math.gcd(sr, to_rate)
    return signal.resample_poly(x, to_rate // g, sr // g).astype(np.float32)


def no_clip(y: np.ndarray) -> np.ndarray:
    peak = float(np.max(np.abs(y))) if y.size else 0.0
    return (y / peak * 0.999 if peak > 0.999 else y).astype(np.float32)


def onset_envelope(y: np.ndarray, ref: float | None = None) -> np.ndarray:
    """Spectral flux of `y` (at store.RATE), as real.py's; frame `i` is centred on sample `i * ENV_HOP`."""
    if len(y) < ENV_WIN:
        y = np.pad(y, (0, ENV_WIN - len(y)))
    _, _, s = signal.stft(y, nperseg=ENV_WIN, noverlap=ENV_WIN - ENV_HOP, window="hann", boundary="zeros", padded=False)
    a = np.abs(s)
    m = np.log1p(200.0 * a / ((ref if ref else float(np.max(a))) + 1e-12))
    return np.maximum(0.0, np.diff(m, axis=1, prepend=m[:, :1])).sum(axis=0)


def long_envelope(y: np.ndarray) -> np.ndarray:
    """onset_envelope of a long file in chunks (bounded memory), one normalisation for all of it."""
    chunk = ENV_HOP * 32768
    if len(y) <= chunk:
        return onset_envelope(y)
    ref = 0.0
    for i in range(0, len(y), chunk):
        _, _, s = signal.stft(y[i:i + chunk + ENV_WIN], nperseg=ENV_WIN, noverlap=ENV_WIN - ENV_HOP, window="hann", boundary="zeros", padded=False)
        ref = max(ref, float(np.max(np.abs(s))))
    parts = []
    for i in range(0, len(y), chunk):
        e = onset_envelope(y[max(0, i - ENV_WIN):i + chunk], ref)
        skip = ENV_WIN // ENV_HOP if i > 0 else 0
        parts.append(e[skip:skip + chunk // ENV_HOP])
    return np.concatenate(parts)


def parabola(c: np.ndarray, i: int) -> float:
    if 0 < i < len(c) - 1:
        den = c[i - 1] - 2 * c[i] + c[i + 1]
        if den < 0:
            return float(0.5 * (c[i - 1] - c[i + 1]) / den)
    return 0.0


def pearson_at(a: np.ndarray, b: np.ndarray) -> float:
    a, b = a - a.mean(), b - b.mean()
    d = float(np.sqrt((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / d) if d > 0 else 0.0


def best_lag(long_env: np.ndarray, short_env: np.ndarray, centre: int, radius: int):
    """Lag j in centre +- radius maximising sum long[j + i] * short[i]; -> (j sub-frame, pearson at j)."""
    lo, hi = max(0, centre - radius), min(len(long_env) - len(short_env), centre + radius)
    if hi < lo or len(short_env) < 8:
        return None, 0.0
    seg = long_env[lo:hi + len(short_env)]
    s = short_env - short_env.mean()
    c = signal.correlate(seg - seg.mean(), s, mode="valid", method="fft")
    k = int(np.argmax(c))
    j = lo + k
    return j + parabola(c, k), pearson_at(long_env[j:j + len(short_env)], short_env)


# ------------------------------------------------------------------ session

class Take:
    def __init__(self, job_path: pathlib.Path):
        self.job_path = job_path
        self.stem = job_path.name[: -len(".job.json")]
        self.job = json.loads(job_path.read_text())
        self.wav = job_path.with_name(self.stem + ".wav")
        cap = self.job.get("capture") or {}
        self.capture = cap
        self.kind = cap.get("kind", "take")
        self.mode = cap.get("mode")
        self.context = cap.get("context") or {}
        self._audio = None
        try:
            info = sf.info(str(self.wav))
            self.rate, self.samples = int(info.samplerate), int(info.frames)
        except Exception:
            self.rate, self.samples = int(cap.get("rate") or 48000), int(cap.get("samples") or 0)
        self.seconds = self.samples / self.rate if self.rate else 0.0
        self.start_ns = int(cap.get("audioStartNs") or 0)
        self.end_ns = self.start_ns + int(round(self.seconds * 1e9))
        self.marks: list[dict] = []

    def audio(self) -> np.ndarray:
        """The Take's wav at store.RATE."""
        if self._audio is None:
            x, sr = read_mono(self.wav)
            self._audio = resample(x, sr)
        return self._audio


class Session:
    def __init__(self, d: pathlib.Path):
        self.dir = d
        self.meta = json.loads((d / "session.json").read_text())
        self.name = self.meta.get("session") or d.name
        self.takes = [Take(p) for p in sorted(d.glob("take-*.job.json"))]
        self.takes = [t for t in self.takes if t.wav.exists()] + []
        self.missing = [p.name for p in sorted(d.glob("take-*.job.json")) if not p.with_name(p.name[: -len(".job.json")] + ".wav").exists()]
        self.takes.sort(key=lambda t: (t.start_ns, t.stem))
        self.marks = []
        mp = d / "marks.jsonl"
        if mp.exists():
            for line in mp.read_text().splitlines():
                line = line.strip()
                if line:
                    try:
                        self.marks.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
        for t in self.takes:  # marks the job itself carries
            for ns in t.capture.get("marks") or []:
                if not any(int(m.get("ns", -1)) == int(ns) for m in self.marks):
                    self.marks.append({"ns": int(ns), "from": "job"})
        self.marks.sort(key=lambda m: int(m.get("ns", 0)))
        chirp = d / "chirp.wav"
        self.chirp = chirp if chirp.exists() else None
        self.seconds_files = second_recordings(d)


def second_recordings(d: pathlib.Path) -> list[pathlib.Path]:
    out = []
    for p in sorted(d.iterdir()):
        if p.is_file() and p.suffix.lower() in AUDIO_EXT and not p.name.startswith("take-") and p.name != "chirp.wav":
            out.append(p)
    sec = d / "second"
    if sec.is_dir():
        out += sorted(p for p in sec.rglob("*") if p.is_file() and p.suffix.lower() in AUDIO_EXT)
    return out


def chain_of(path: pathlib.Path) -> str:
    n = path.stem.lower()
    if re.search(r"phone|iphone|android|pixel|galaxy|voice ?memo", n):
        return "phone"
    if re.search(r"laptop|macbook|notebook", n):
        return "laptop"
    if re.search(r"(^|[^a-z])di([^a-z]|$)|direct|interface", n):
        return "di"
    return "other"


def resolve_marks(session: Session) -> list[dict]:
    """Each mark -> the Take it is about: inside a Take's span, else the latest Take that ended before it (within 30 s)."""
    out = []
    for m in session.marks:
        ns = int(m.get("ns", 0))
        hit, how = None, None
        for t in session.takes:
            if t.start_ns <= ns <= t.end_ns:
                hit, how = t, "inside"
                break
        if hit is None:
            before = [t for t in session.takes if t.end_ns <= ns and (ns - t.end_ns) / 1e9 <= MARK_WINDOW_S]
            if before:
                hit, how = max(before, key=lambda t: t.end_ns), "after"
        rec = {"ns": ns, "wallMs": m.get("wallMs"), "take": hit.stem if hit else None, "how": how}
        if hit is not None:
            rec["atS"] = round((ns - hit.start_ns) / 1e9, 3)
            hit.marks.append(rec)
        out.append(rec)
    return out


# ------------------------------------------------------------------ alignment

def find_chirps(y: np.ndarray, chirp: np.ndarray, threshold: float = 0.3, k: int = 6) -> list[tuple[float, float]]:
    """Matched filter (normalised) of `chirp` over `y`, both at store.RATE -> [(time of the chirp's first sample, s), score] best first."""
    if len(y) < len(chirp) or not np.any(chirp):
        return []
    c = chirp.astype(np.float32)
    corr = signal.oaconvolve(y.astype(np.float32), c[::-1], mode="valid")
    e = np.concatenate([[0.0], np.cumsum(y.astype(np.float64) ** 2)])
    energy = e[len(c):] - e[: len(e) - len(c)]
    ncc = corr / (np.sqrt(np.maximum(energy, 1e-12)) * float(np.linalg.norm(c)) + 1e-9)
    peaks, props = signal.find_peaks(ncc, height=threshold, distance=len(c))
    order = np.argsort(props["peak_heights"])[::-1][:k] if len(peaks) else []
    out = []
    for o in order:
        i = int(peaks[o])
        out.append(((i + parabola(ncc, i)) / store.RATE, float(ncc[i])))
    return out


class Model:
    """file time (s) = a + b * app clock (s)."""

    def __init__(self, a: float, b: float, method: str, chirps: list | None = None):
        self.a, self.b, self.method, self.chirps = a, b, method, chirps or []

    def file_s(self, ns: int) -> float:
        return self.a + self.b * ns / 1e9

    @property
    def ppm(self) -> float:
        return (self.b - 1.0) * 1e6


def candidate_models(session: Session, found: list[tuple[float, float]]) -> list[Model]:
    played = [c for c in session.meta.get("chirps") or [] if c.get("played", True) and c.get("playNs") is not None]
    start = next((c for c in played if c.get("kind") == "start"), None)
    end = next((c for c in played if c.get("kind") == "end"), None)
    models = []
    if start and end and len(found) >= 2:
        span = (int(end["playNs"]) - int(start["playNs"])) / 1e9
        best = None
        for i, (ti, si) in enumerate(found):
            for tj, sj in found[i + 1:]:
                t0, t1 = min(ti, tj), max(ti, tj)
                if span > 0 and abs((t1 - t0) - span) < 0.005 * span + 0.05:
                    if best is None or si + sj > best[2]:
                        best = (t0, t1, si + sj, (si, sj) if ti < tj else (sj, si))
        if best:
            t0, t1, _, (s0, s1) = best
            b = (t1 - t0) / span
            a = t0 - b * int(start["playNs"]) / 1e9
            models.append(Model(a, b, "chirps", [{"kind": "start", "fileS": round(t0, 5), "score": round(s0, 3)}, {"kind": "end", "fileS": round(t1, 5), "score": round(s1, 3)}]))
            return models
    if found and played:
        # one chirp to go on: which peak is which chirp is a guess; every pairing is tried and the Takes decide
        for t, s in found[:4]:
            for c in played:
                models.append(Model(t - int(c["playNs"]) / 1e9, 1.0, "chirp-" + str(c.get("kind")), [{"kind": c.get("kind"), "fileS": round(t, 5), "score": round(s, 3)}]))
    return models


def take_lags_global(takes: list[Take], file_env: np.ndarray, floor: float) -> Model | None:
    """No chirp: where every Take is in the whole file by envelope xcorr, then a line through them."""
    pts = []
    for t in takes:
        te = onset_envelope(t.audio())
        if len(te) >= len(file_env):
            continue
        j, conf = best_lag(file_env, te, len(file_env) // 2, len(file_env))
        if j is not None and conf >= floor:
            pts.append((t.start_ns / 1e9, j * ENV_HOP / store.RATE, conf))
    if not pts:
        return None
    if len(pts) == 1:
        x, y, _ = pts[0]
        return Model(y - x, 1.0, "xcorr")
    xs, ys, ws = (np.array(v) for v in zip(*pts))
    keep = np.ones(len(xs), bool)
    for _ in range(3):  # drop the outliers (a Take matched to a repeat of itself)
        b, a = np.polyfit(xs[keep], ys[keep], 1, w=ws[keep])
        r = np.abs(ys - (a + b * xs))
        new = r < max(0.05, 3 * np.median(r[keep]) + 1e-3)
        if new.sum() < 2 or (new == keep).all():
            break
        keep = new
    b, a = np.polyfit(xs[keep], ys[keep], 1, w=ws[keep]) if keep.sum() >= 2 else (1.0, float(np.median(ys - xs)))
    if abs(b - 1.0) > 0.01:  # not a clock: a fit across too few, too close Takes
        b, a = 1.0, float(np.median((ys - xs)[keep]))
    return Model(float(a), float(b), "xcorr")


def warp(y: np.ndarray, start_s: float, b: float, n: int, before_s: float = 0.0) -> np.ndarray:
    """y (at store.RATE) read at file time start_s + b * t, t = -before_s + i / RATE for i < n."""
    t = (np.arange(n) / store.RATE - before_s) * b + start_s
    pos = t * store.RATE
    out = np.interp(pos, np.arange(len(y)), y, left=0.0, right=0.0)
    return out.astype(np.float32)


def refine(take: Take, y: np.ndarray, model: Model, radius_s: float = 0.15) -> dict:
    """The Take against its own wav, locally: lag (ms), local drift (ppm), confidence, the file time of its sample 0."""
    a = take.audio()
    n = len(a)
    fs = model.file_s(take.start_ns)
    margin = radius_s + 0.05
    seg = warp(y, fs, model.b, n + int(2 * margin * store.RATE), margin)
    se, te = onset_envelope(seg), onset_envelope(a)
    m_frames = int(round(margin * store.RATE / ENV_HOP))
    r_frames = int(round(radius_s * store.RATE / ENV_HOP))
    j, conf = best_lag(se, te, m_frames, r_frames)
    if j is None:
        return {"conf": 0.0, "why": "too short"}
    lag_s = (j - m_frames) * ENV_HOP / store.RATE
    out = {"fileStartS": fs + lag_s * model.b, "lagMs": lag_s * 1000.0, "conf": conf}
    # drift inside the Take: the two halves, each against its own part of the file
    if take.seconds >= 6.0:
        h = len(te) // 2
        lags = []
        for part, off in ((te[:h], 0), (te[h:], h)):
            jj, cc = best_lag(se, part, int(round(j)) + off, int(round(0.01 * store.RATE / ENV_HOP)))
            if jj is None or cc < 0.2:
                break
            lags.append((jj - off) * ENV_HOP / store.RATE)
        if len(lags) == 2:
            out["driftPpm"] = (lags[1] - lags[0]) / (h * ENV_HOP / store.RATE) * 1e6
    out["coverage"] = float(np.clip((len(y) / store.RATE - out["fileStartS"]) / max(1e-9, take.seconds * model.b), 0, 1)) if out["fileStartS"] >= 0 else \
        float(np.clip((take.seconds * model.b + out["fileStartS"]) / max(1e-9, take.seconds * model.b), 0, 1))
    return out


def align_file(session: Session, path: pathlib.Path, floor: float) -> dict:
    """One second recording -> its clock model and every Take's alignment (and trimmed audio)."""
    rec = {"file": str(path.relative_to(session.dir)), "chain": chain_of(path), "takes": {}, "dropped": []}
    try:
        x, sr = read_mono(path)
    except Exception as e:
        rec["skipped"] = f"cannot read {path.suffix or 'this format'} ({type(e).__name__}); export it as WAV (or FLAC) and drop that in instead"
        return rec
    y = resample(x, sr)
    del x
    rec.update({"rate": sr, "seconds": round(len(y) / store.RATE, 3)})
    found = []
    if session.chirp is not None:
        cx, csr = read_mono(session.chirp)
        found = find_chirps(y, resample(cx, csr))
    models = candidate_models(session, found)
    if not models:
        m = take_lags_global(session.takes, long_envelope(y), floor)
        if m is not None:
            models = [m]
    if not models:
        rec["skipped"] = "no chirp found and no Take matched by cross-correlation"
        rec["chirpsFound"] = len(found)
        return rec
    best = None
    for m in models:
        res = {t.stem: refine(t, y, m) for t in session.takes}
        confs = [r.get("conf", 0.0) for r in res.values()]
        score = float(np.median(confs)) if confs else 0.0
        if best is None or score > best[0]:
            best = (score, m, res)
    _, model, res = best
    rec.update({"method": model.method, "driftPpm": round(model.ppm, 2), "offsetS": round(model.a, 6), "chirps": model.chirps, "chirpsFound": len(found)})
    audio = {}
    for t in session.takes:
        r = res[t.stem]
        r = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.items()}
        if r.get("conf", 0.0) < floor:
            rec["dropped"].append({"take": t.stem, "why": f"confidence {r.get('conf', 0):.2f} under {floor}"})
            continue
        if r.get("coverage", 1.0) < 0.9:
            rec["dropped"].append({"take": t.stem, "why": f"the recording covers {100 * r['coverage']:.0f}% of it"})
            continue
        rec["takes"][t.stem] = r
        audio[t.stem] = warp(y, r["fileStartS"], model.b, len(t.audio()))
    rec["_audio"] = audio
    return rec


# ------------------------------------------------------------------ labels

def due_ms(job: dict, beat: float) -> float:
    q = job.get("quartersMs") or []
    if len(q) >= 2:
        i = max(0, min(int(math.floor(beat)), len(q) - 2))
        return q[i] + (beat - i) * (q[i + 1] - q[i])
    return float(job.get("firstBeatMs") or 0.0) + beat * 60000.0 / max(1.0, float(job.get("bpm") or 120.0))


def expected_notes(take: Take) -> list[dict]:
    """Every written note the Take reached, one a (onset, note, pass), with its due time (ms into the wav)."""
    job = take.job
    sched = job.get("schedule")
    if not sched or not sched.get("onsets"):
        return []
    onsets = {o["id"]: o for o in sched["onsets"]}
    length = float(sched.get("lengthBeats") or 0.0)
    total_ms = take.seconds * 1000.0
    live = ((job.get("live") or {}).get("results")) or []
    pairs = [(r["id"], int(r.get("pass", 0))) for r in live if r.get("id") in onsets]
    if not pairs:
        passes = 1
        if sched.get("loops") and length > 0:
            passes = max(1, int(math.ceil((total_ms - due_ms(job, 0)) / max(1.0, due_ms(job, length) - due_ms(job, 0)))))
        pairs = [(o["id"], p) for p in range(passes) for o in sorted(sched["onsets"], key=lambda o: o["beat"])]
    pitch = {p["id"]: float(p["midi"]) for p in job.get("pitches") or []}
    detail = {d["id"]: d for d in job.get("details") or []}
    out = []
    for oid, p in pairs:
        o = onsets[oid]
        beat = p * length + float(o["beat"])
        t = due_ms(job, beat)
        if t > total_ms:
            continue
        for nid in o.get("noteIds") or []:
            d = detail.get(nid, {})
            out.append({"onsetId": oid, "noteId": nid, "pass": p, "beat": beat, "dueMs": t, "soft": bool(o.get("soft")), "midi": pitch.get(nid),
                        "string": d.get("string") or None, "tech": list(d.get("tech") or []), "bend": d.get("bend") or None,
                        "durBeats": float(d.get("durBeats") or 0.0), "chord": len(o.get("noteIds") or [])})
    return out


def end_of(n: dict, notes: list[dict], take: Take, t: float) -> float:
    if n["durBeats"] > 0:
        e = t + (due_ms(take.job, n["beat"] + n["durBeats"]) - due_ms(take.job, n["beat"])) / 1000.0
    else:
        later = [m["dueMs"] / 1000.0 for m in notes if m["dueMs"] > n["dueMs"] and (n["string"] is None or m["string"] in (None, n["string"]))]
        e = min(later) if later else t + 1.0
        e = min(e, t + 2.0)
    return float(min(max(e, t + 0.03), take.seconds))


def cls_of(tech: list[str]) -> str | None:
    if "palmMute" in tech:
        return "palm_mute"
    if "harmonic" in tech:
        return "harmonic"
    if set(tech) & {"hammer", "pull", "tap", "dead", "ghost"}:
        return None
    return "picked"


def label(t: float, end: float, midi: int, string, cls, vel) -> dict:
    """As tools/ml/factory/real.py's label(): the keys takes.labels_of writes; what a recording cannot tell is null."""
    t, end = round(float(t), 5), round(float(end), 5)
    return {"t": t, "end": end, "midi": int(midi), "string": string, "cls": cls, "tech": [], "legato": None, "bend": None, "release": None, "vib": None,
            "vel": vel, "weak": None, "segs": [[t, end, int(midi)]], "on": [[t, int(midi)]]}


def live_state(take: Take) -> dict:
    return {(r["id"], int(r.get("pass", 0))): r for r in ((take.job.get("live") or {}).get("results") or [])}


def replay_index(doc: dict | None) -> dict:
    out = {}
    for e in (doc or {}).get("expected") or []:
        for n in e.get("notes") or []:
            out[(e["onsetId"], int(e.get("pass", 0)), n["id"])] = (e, n.get("verifier"))
    return out


def labels_for(take: Take, doc: dict | None) -> tuple[list[dict], list[dict]]:
    """-> (labels for the store, per-note comparison rows: live vs verifier)."""
    notes = expected_notes(take)
    live = live_state(take)
    idx = replay_index(doc)
    labels, rows = [], []
    for n in notes:
        e, v = idx.get((n["onsetId"], n["pass"], n["noteId"]), (None, None))
        lr = live.get((n["onsetId"], n["pass"]))
        heard = (v or {}).get("heard")
        confirmed = heard == "yes"
        t = n["dueMs"] / 1000.0
        if e is not None and e.get("dueMs") is not None:
            t = e["dueMs"] / 1000.0
            n["dueMs"] = e["dueMs"]
        if confirmed and e is not None and e.get("heardAtMs") is not None:
            t = e["heardAtMs"] / 1000.0
        if n["midi"] is None:
            continue
        lab = label(t, end_of(n, notes, take, t), int(round(n["midi"])), n["string"], cls_of(n["tech"]), None)
        lab["tech"] = sorted(n["tech"])
        lab["legato"] = bool(set(n["tech"]) & {"hammer", "pull", "tap"}) or None
        lab["bend"] = n["bend"]
        lab["confirmed"] = confirmed
        verdict = {"live": lr.get("state") if lr else None, "liveDeviationMs": lr.get("deviationMs") if lr else None,
                   "matcher": e.get("state") if e else None, "rightNotes": e.get("pitchPass") if e else None,
                   "verifier": heard, "how": (v or {}).get("how"), "heardMidi": (v or {}).get("heardMidi"),
                   "deviationMs": (v or {}).get("deviationMs"), "strength": (v or {}).get("strength")}
        lab["verdict"] = verdict
        lab.update({"noteId": n["noteId"], "onsetId": n["onsetId"], "pass": n["pass"], "dueS": round(n["dueMs"] / 1000.0, 5)})
        labels.append(lab)
        live_heard = bool(lr) and lr.get("state") == "hit"
        disagree = None
        if heard in ("yes", "no", "wrong") and lr is not None and lr.get("state") != "softAbsent":
            if live_heard and not confirmed:
                disagree = "live heard, verifier " + ("heard another pitch" if heard == "wrong" else "did not")
            elif not live_heard and confirmed:
                disagree = "live missed, verifier credited"
        rows.append({"noteId": n["noteId"], "onsetId": n["onsetId"], "pass": n["pass"], "dueS": lab["dueS"], "midi": lab["midi"], **verdict, "disagree": disagree})
    return labels, rows


# ------------------------------------------------------------------ detect-bench replay

def target_dir() -> pathlib.Path:
    return pathlib.Path(os.environ.get("CARGO_TARGET_DIR", "/home/dgx-personal/projects/.target-capture"))


def bench_cmd() -> list[str]:
    binary = target_dir() / "release" / "detect-bench"
    if binary.exists():
        return ["nice", "-n", "19", str(binary)]
    return ["nice", "-n", "19", "cargo", "run", "--quiet", "--release", "--manifest-path", str(REPO / "src-tauri/Cargo.toml"), "--features", "detect-tract", "--bin", "detect-bench", "--"]


def bench_env() -> dict:
    env = dict(os.environ)
    env["PATH"] = f"{HOME}/.cargo/bin:{env.get('PATH', '')}"
    env.setdefault("CFLAGS", "-std=gnu11 -Wno-implicit-function-declaration")
    env["CARGO_TARGET_DIR"] = str(target_dir())
    env.setdefault("CARGO_BUILD_JOBS", "4")
    return env


def replay(take: Take, out_dir: pathlib.Path, fresh: bool) -> tuple[dict | None, str | None]:
    """detect-bench replay on the Take's own wav -> (the replay JSON, error). Reuses a replay newer than its inputs."""
    out_dir.mkdir(parents=True, exist_ok=True)
    jp = out_dir / f"{take.stem}.replay.json"
    newest = max(take.wav.stat().st_mtime, take.job_path.stat().st_mtime)
    if not fresh and jp.exists() and jp.stat().st_mtime >= newest:
        try:
            return json.loads(jp.read_text()), None
        except json.JSONDecodeError:
            pass
    logp = out_dir / f"{take.stem}.replay.log"
    with open(logp, "w") as lf:
        r = subprocess.run(bench_cmd() + ["replay", str(take.wav), "--job", str(take.job_path), "--out", str(out_dir)], stdout=lf, stderr=subprocess.STDOUT, env=bench_env(), cwd=str(REPO))
    if r.returncode != 0 or not jp.exists():
        return None, f"detect-bench replay failed ({r.returncode}), log {logp}"
    return json.loads(jp.read_text()), None


# ------------------------------------------------------------------ regression cases

def write_case(take: Take, labels: list[dict], doc: dict, out: pathlib.Path) -> pathlib.Path:
    """The Take as a `detect-bench run --dir` case: the wav, `<stem>.truth.json` (cases.rs::TakeMeta), the job (for its pass bars)."""
    out.mkdir(parents=True, exist_ok=True)
    job = take.job
    wav = out / f"{take.stem}.wav"
    if not wav.exists() or wav.stat().st_size != take.wav.stat().st_size:
        shutil.copy2(take.wav, wav)
    sched = job["schedule"]
    q = job.get("quartersMs") or []
    lead = float(job.get("firstBeatMs") or 0.0) or (q[0] if q else 0.0)
    truth = []
    for lab in labels:
        if lab["pass"] != 0:
            continue
        v = lab["verdict"]["verifier"]
        played = lab["confirmed"] or v == "wrong"
        truth.append({"noteId": lab["noteId"], "onsetId": lab["onsetId"], "beat": next((o["beat"] for o in sched["onsets"] if o["id"] == lab["onsetId"]), 0.0),
                      "tWritten": lab["dueS"], "tPlayed": lab["t"] if played else None, "dur": round(lab["end"] - lab["t"], 5), "string": lab["string"] or 0,
                      "midiWritten": float(lab["midi"]), "midiPlayed": float(lab["midi"]) if lab["confirmed"] else (float(lab["verdict"]["heardMidi"]) if v == "wrong" and lab["verdict"]["heardMidi"] is not None else None),
                      "tech": lab["tech"], "legato": bool(lab["legato"]), "chordSize": 1, "bendWritten": float(lab["bend"] or 0.0),
                      "fault": {"no": "omitted", "wrong": "wrong"}.get(v)})
    by_onset = {}
    for n in truth:
        by_onset[n["onsetId"]] = by_onset.get(n["onsetId"], 0) + 1
    for n in truth:
        n["chordSize"] = by_onset[n["onsetId"]]
    ctx = take.context
    meta = {"name": take.stem, "category": "corpus", "style": "real", "chain": "app", "pack": str(ctx.get("pathId") or ""), "exercise": str(ctx.get("exerciseId") or ""),
            "title": f"{take.capture.get('session', '')} {take.stem}", "bpm": float(job.get("bpm") or 120.0), "beatsPerBar": float(job.get("beatsPerBar") or 4),
            "leadS": lead / 1000.0, "seconds": round(take.seconds, 4), "flags": ["corpus", "disagree"], "truth": truth, "schedule": sched,
            "passBars": job.get("passBars") or [], "audio": wav.name}
    (out / f"{take.stem}.truth.json").write_text(json.dumps(meta, indent=1))
    j2 = dict(job)
    j2["audio"] = wav.name
    (out / f"{take.stem}.job.json").write_text(json.dumps(j2))
    return out / f"{take.stem}.truth.json"


# ------------------------------------------------------------------ report

def fmt(v, nd=1):
    if v is None:
        return "-"
    if isinstance(v, float):
        return f"{v:.{nd}f}"
    return str(v)


def write_report(summary: dict, out: pathlib.Path):
    out.mkdir(parents=True, exist_ok=True)
    (out / "summary.json").write_text(json.dumps(summary, indent=1))
    s = summary
    md = [f"# Corpus ingest: session {s['session']}", "",
          f"- Takes: {s['takes']} ({s['graded']} graded, {s['jams']} jam/free play), {s['minutes']:.1f} min of app audio",
          f"- Device: {s['device']}", f"- App: {s['app']}", f"- Store: `{s['store']}` ({s['items']} items, split `corpus`)",
          f"- Labels: {s['labels']} notes, {s['confirmed']} confirmed by the verifier, {s['labels'] - s['confirmed']} kept unconfirmed",
          f"- Replay: {s['replay']}", ""]
    md += ["## Second recordings", ""]
    if not s["seconds"]:
        md.append("None in the session folder.")
    else:
        md += ["| file | chain | method | drift ppm | chirps | Takes aligned | dropped | median conf |", "|---|---|---|---|---|---|---|---|"]
        for r in s["seconds"]:
            if r.get("skipped"):
                md.append(f"| {r['file']} | {r['chain']} | skipped: {r['skipped']} | | | | | |")
                continue
            ch = ", ".join(f"{c['kind']} @ {c['fileS']:.3f} s ({c['score']:.2f})" for c in r.get("chirps") or []) or "-"
            md.append(f"| {r['file']} | {r['chain']} | {r['method']} | {r['driftPpm']:+.1f} | {ch} | {r['aligned']} | {len(r['dropped'])} | {fmt(r.get('medianConf'), 2)} |")
        for r in s["seconds"]:
            for d in r.get("dropped") or []:
                md.append(f"- dropped {r['file']} / {d['take']}: {d['why']}")
    md += ["", "## Felt-off marks", ""]
    if not s["marks"]:
        md.append("None.")
    for m in s["marks"]:
        md.append(f"- {m['ns']}: " + (f"Take {m['take']} ({m['how']}, {m['atS']:+.1f} s)" if m["take"] else "no Take within 30 s"))
    md += ["", "## Takes where the live grade and the verifier disagree", ""]
    dis = [t for t in s["perTake"] if t["disagree"]]
    if not dis:
        md.append("None." if s["replayRan"] else "Not checked: no replay (`--no-replay`, or detect-bench failed).")
    for t in dis:
        md.append(f"### {t['take']} ({t['exercise'] or t['kind']}, {fmt(t['bpm'], 0)} bpm){' — FELT OFF' if t['feltOff'] else ''}")
        md.append(f"- live: score {fmt(t['liveScore'])}, heard {t['liveHeard']} / missed {t['liveMissed']}; replay: score {fmt(t['replayScore'])}, verifier credited {t['credited']} of {t['notes']}; score delta {fmt(t['scoreDelta'])}")
        md.append(f"- replay: [{t['replayHtml']}]({t['replayHtml']}); case: `{t['case']}`" if t.get("case") else f"- replay: [{t['replayHtml']}]({t['replayHtml']})")
        for r in t["rows"][:12]:
            md.append(f"  - note {r['noteId']} pass {r['pass']} at {r['dueS']:.2f} s, midi {r['midi']}: {r['disagree']} (verifier {r['verifier']}, {r['how']}{', heard ' + str(r['heardMidi']) if r['heardMidi'] is not None else ''})")
        if len(t["rows"]) > 12:
            md.append(f"  - ... {len(t['rows']) - 12} more in summary.json")
    if s.get("casesDir"):
        md += ["", "## Regression cases", "", f"Run them: `npm run detect:bench -- run --dir {s['casesDir']}` (add `--notes` for the per-note table)."]
    md += ["", "## Every Take", "", "| Take | kind | mode | exercise | bpm | s | live score | replay score | confirmed | felt off |", "|---|---|---|---|---|---|---|---|---|---|"]
    for t in s["perTake"]:
        md.append(f"| {t['take']} | {t['kind']} | {t['mode'] or '-'} | {t['exercise'] or '-'} | {fmt(t['bpm'], 0)} | {t['seconds']:.1f} | {fmt(t['liveScore'])} | {fmt(t['replayScore'])} | {t['credited']}/{t['notes']} | {'yes' if t['feltOff'] else ''} |")
    text = "\n".join(md) + "\n"
    (out / "report.md").write_text(text)
    (out / "report.html").write_text(md_to_html(text, f"Corpus {s['session']}"))


def md_to_html(text: str, title: str) -> str:
    """Enough markdown for this report: headings, bullets, pipe tables, links, code."""
    def inline(s: str) -> str:
        s = html.escape(s)
        s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
        return s
    out, table, ul = [], False, 0
    for line in text.splitlines():
        if line.startswith("|"):
            cells = [c.strip() for c in line.strip("|").split("|")]
            if all(set(c) <= {"-", ":"} for c in cells):
                continue
            if not table:
                out.append("<table>")
                out.append("<tr>" + "".join(f"<th>{inline(c)}</th>" for c in cells) + "</tr>")
                table = True
            else:
                out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in cells) + "</tr>")
            continue
        if table:
            out.append("</table>")
            table = False
        m = re.match(r"^( *)- (.*)$", line)
        if m:
            depth = len(m.group(1)) // 2 + 1
            while ul < depth:
                out.append("<ul>")
                ul += 1
            while ul > depth:
                out.append("</ul>")
                ul -= 1
            out.append(f"<li>{inline(m.group(2))}</li>")
            continue
        while ul:
            out.append("</ul>")
            ul -= 1
        h = re.match(r"^(#+) (.*)$", line)
        if h:
            out.append(f"<h{len(h.group(1))}>{inline(h.group(2))}</h{len(h.group(1))}>")
        elif line.strip():
            out.append(f"<p>{inline(line)}</p>")
    if table:
        out.append("</table>")
    out += ["</ul>"] * ul
    css = "body{font:14px/1.45 system-ui,sans-serif;max-width:1100px;margin:24px auto;padding:0 16px;color:#1d2228}table{border-collapse:collapse;margin:8px 0}" \
          "td,th{border:1px solid #ccd;padding:3px 8px;text-align:left;font-size:13px}th{background:#eef0f4}code{background:#f0f1f4;padding:1px 4px;border-radius:3px}h3{margin-top:22px}"
    return f"<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>{html.escape(title)}</title><style>{css}</style></head><body>\n" + "\n".join(out) + "\n</body></html>\n"


# ------------------------------------------------------------------ ingest one session

def ingest_session(d: pathlib.Path, args) -> dict:
    session = Session(d)
    name = session.name
    log(f"[{name}] {len(session.takes)} Takes, {len(session.seconds_files)} second recording(s), {len(session.marks)} mark(s)")
    marks = resolve_marks(session)
    preview = preview_root() / name
    replay_dir = preview / "replay"

    docs: dict[str, dict | None] = {t.stem: None for t in session.takes}
    replay_errors = []
    if not args.no_replay:
        todo = [t for t in session.takes if t.job.get("schedule")]
        if todo:
            with cf.ThreadPoolExecutor(max(1, args.jobs)) as ex:
                futs = {ex.submit(replay, t, replay_dir, args.fresh_replay): t for t in todo}
                for f in cf.as_completed(futs):
                    t = futs[f]
                    try:
                        doc, err = f.result()
                    except Exception as e:  # noqa: BLE001
                        doc, err = None, str(e)
                    docs[t.stem] = doc
                    if err:
                        replay_errors.append(f"{t.stem}: {err}")
    replay_ran = any(v is not None for v in docs.values())

    aligned = []
    for p in session.seconds_files:
        log(f"[{name}] aligning {p.name}")
        aligned.append(align_file(session, p, args.min_conf))

    writer = store.Writer(f"corpus-{name}") if not args.store_root else None
    if args.store_root:
        old = store.ROOT
        store.ROOT = pathlib.Path(args.store_root)
        writer = store.Writer(f"corpus-{name}")
        store.ROOT = old
    per_take, n_labels, n_conf, n_items = [], 0, 0, 0
    cases_dir = cases_root() / name
    wrote_case = False
    device = session.meta.get("device") or {}
    for t in session.takes:
        doc = docs.get(t.stem)
        labels, rows = labels_for(t, doc)
        n_labels += len(labels)
        n_conf += sum(1 for lab in labels if lab["confirmed"])
        ctx = t.context
        live_grade = (t.job.get("live") or {}).get("grade") or {}
        rgrade = (doc or {}).get("grade") or {}
        meta = {"source": SOURCE, "licence": LICENCE, "split": SPLIT, "session": name, "name": t.stem, "group": f"corpus_{name}",
                "path": ctx.get("pathId"), "step": ctx.get("stepId"), "exercise": ctx.get("exerciseId"), "variant": ctx.get("variantSeed"),
                "kind": t.kind, "mode": t.mode, "bpm": t.job.get("bpm"), "device": device, "instrument": t.job.get("instrument"),
                "seconds": round(t.seconds, 3), "rate": t.rate, "audioStartNs": t.start_ns,
                "feltOff": bool(t.marks), "marks": [m["atS"] for m in t.marks],
                "live": {k: live_grade.get(k) for k in ("verdict", "score", "due", "heard", "missed", "extra")} if live_grade else None,
                "replay": ({k: rgrade.get(k) for k in ("verdict", "score", "due", "heard", "missed", "extra")} | {"verifierStatus": doc.get("verifierStatus")}) if doc else None,
                "confirmedBy": "verifier" if doc else None}
        if t.kind in ("jam", "freeplay") or not t.job.get("schedule"):
            meta["heard"] = t.job.get("heard")
        tid = writer.take(meta, labels)
        writer.item(tid, no_clip(t.audio()), {"split": SPLIT, "chain": {"kind": "real_app", "name": "app", "input": device.get("input") if isinstance(device, dict) else None}})
        n_items += 1
        for r in aligned:
            a = (r.get("_audio") or {}).get(t.stem)
            if a is None:
                continue
            al = r["takes"][t.stem]
            writer.item(tid, no_clip(a), {"split": SPLIT, "chain": {"kind": f"real_{r['chain']}", "name": r["chain"], "file": r["file"]},
                                          "align": {"method": r["method"], "fileStartS": al["fileStartS"], "lagMs": al["lagMs"], "driftPpm": r["driftPpm"],
                                                    "takeDriftPpm": al.get("driftPpm"), "conf": al["conf"]}})
            n_items += 1
        dis_rows = [x for x in rows if x["disagree"]]
        live_score, rep_score = live_grade.get("score"), rgrade.get("score")
        delta = (rep_score - live_score) if (live_score is not None and rep_score is not None) else None
        disagree = bool(doc) and (bool(dis_rows) or (delta is not None and abs(delta) >= args.score_delta))
        rec = {"take": t.stem, "kind": t.kind, "mode": t.mode, "exercise": ctx.get("exerciseId"), "bpm": t.job.get("bpm"), "seconds": round(t.seconds, 2),
               "liveScore": live_score, "liveHeard": live_grade.get("heard"), "liveMissed": live_grade.get("missed"), "replayScore": rep_score,
               "scoreDelta": delta, "notes": len(labels), "credited": sum(1 for lab in labels if lab["confirmed"]), "feltOff": bool(t.marks),
               "disagree": disagree, "rows": dis_rows, "replayHtml": f"replay/{t.stem}.replay.html" if doc else None}
        if disagree and t.job.get("schedule") and not args.no_cases:
            rec["case"] = str(write_case(t, labels, doc, cases_dir))
            wrote_case = True
        per_take.append(rec)

    for r in aligned:
        confs = [v["conf"] for v in r.get("takes", {}).values()]
        r["aligned"] = len(confs)
        r["medianConf"] = float(np.median(confs)) if confs else None
        r.pop("_audio", None)
    manifest = writer.close({"name": f"corpus-{name}", "source": SOURCE, "licence": LICENCE, "session": name, "split": SPLIT,
                             "splits": {SPLIT: {"takes": len(session.takes), "items": n_items, "notes": n_labels, "confirmed": n_conf}},
                             "seconds": [{k: v for k, v in r.items() if k != "takes"} | {"takes": r.get("takes", {})} for r in aligned],
                             "marks": marks, "adapter": "tools/corpus/ingest.py", "format": session.meta.get("format")})
    summary = {"session": name, "dir": str(d), "store": str(writer.dir), "items": n_items, "takes": len(session.takes),
               "graded": sum(1 for t in session.takes if t.job.get("schedule")), "jams": sum(1 for t in session.takes if not t.job.get("schedule")),
               "minutes": sum(t.seconds for t in session.takes) / 60.0, "device": json.dumps(device)[:200], "app": json.dumps(session.meta.get("app") or {}),
               "labels": n_labels, "confirmed": n_conf, "replayRan": replay_ran,
               "replay": ("ran" if replay_ran else "skipped (--no-replay)" if args.no_replay else "failed") + (f"; {len(replay_errors)} error(s): " + "; ".join(replay_errors[:3]) if replay_errors else ""),
               "seconds": aligned, "marks": marks, "perTake": per_take, "missingWav": session.missing,
               "casesDir": str(cases_dir) if wrote_case else None, "hours": manifest.get("hours")}
    write_report(summary, preview)
    log(f"[{name}] store {writer.dir}  report {preview / 'report.html'}")
    return summary


# ------------------------------------------------------------------ inputs: folders, zips, the RTX

def sessions_in(p: pathlib.Path) -> list[pathlib.Path]:
    if (p / "session.json").exists():
        return [p]
    out = sorted({q.parent for q in p.rglob("session.json")}, key=lambda q: q.name)
    return out


# what a zip may unpack to (a 30 min session is about 1 GB; the inbox caps uploads at 16 GB)
MAX_UNPACKED = 64 * 1024**3
SAFE_NAME_RE = re.compile(r"\A[A-Za-z0-9_-]{1,64}\Z")


def safe_name(name, fallback: str) -> str:
    """A session's folder name: what session.json says when it is a plain name, else the folder's own."""
    name = str(name or "")
    if SAFE_NAME_RE.fullmatch(name):
        return name
    if SAFE_NAME_RE.fullmatch(fallback):
        return fallback
    raise ValueError(f"not a session name we can use as a folder: {name!r} / {fallback!r}")


def safe_extract_zip(zp: pathlib.Path, dest: pathlib.Path) -> list[pathlib.Path]:
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zp) as z:
        total = 0
        for m in z.infolist():
            target = (dest / m.filename).resolve()
            if not str(target).startswith(str(dest.resolve()) + os.sep) and target != dest.resolve():
                raise ValueError(f"{zp}: unsafe path {m.filename}")
            if "\\" in m.filename or (m.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError(f"{zp}: unsafe member {m.filename}")
            total += m.file_size
            if total > MAX_UNPACKED:
                raise ValueError(f"{zp}: unpacks past {MAX_UNPACKED} bytes")
        z.extractall(dest)
    return sessions_in(dest)


def same_session(a: dict, b: dict) -> bool:
    """Two session.json docs for one recording (the same start, the same device kind)."""
    return a.get("startedWallMs") == b.get("startedWallMs") and (a.get("app") or {}).get("platform") == (b.get("app") or {}).get("platform")


def unique_dest(root: pathlib.Path, name: str, doc: dict) -> pathlib.Path:
    """`root/name`, unless that holds ANOTHER recording of the same name (two devices in one
    second): then `name-b`, `name-c`, ... A re-import of the same recording replaces it."""
    for suffix in [""] + [f"-{c}" for c in "bcdefghijklmnopqrstuvwxyz"]:
        dest = root / f"{name}{suffix}"
        try:
            old = json.loads((dest / "session.json").read_text())
        except (OSError, ValueError):
            return dest
        if same_session(old, doc):
            return dest
    raise ValueError(f"too many sessions named {name}")


def import_zip(zp: pathlib.Path) -> list[pathlib.Path]:
    """A Share/Zip export -> session folder(s) under the raw root."""
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="yames-zip-", dir=str(raw_root().parent) if raw_root().parent.exists() else None))
    try:
        found = safe_extract_zip(zp, tmp)
        # a session folder inside another would be taken for a session of its own, named by its json
        for s in found:
            if any(o != s and o in s.parents for o in found):
                raise ValueError(f"{zp}: a session folder inside another ({s.relative_to(tmp)})")
        out = []
        for s in found:
            doc = json.loads((s / "session.json").read_text())
            name = safe_name(doc.get("session"), s.name)
            dest = unique_dest(raw_root(), name, doc)
            if dest.exists():
                shutil.rmtree(dest)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(s), str(dest))
            out.append(dest)
        return out
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def rtx_script(latest: int) -> str:
    # one compound command: bash reads all of it before running any, so nothing inside can eat the script from stdin
    return f"""main() {{
set -u
N={int(latest)}
CAP='{RTX_CAPTURE}'
DL='{RTX_DOWNLOADS}'
ADB='{RTX_ADB}'
PKG='{ANDROID_PKG}'
SHARED='{ANDROID_SHARED}'
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/out/pc" "$T/out/android" "$T/out/zips"
say() {{ echo "rtx: $*" >&2; echo "$*" >> "$T/out/STATUS.txt"; }}
# 1. the PC app's sessions, newest N
if [ -d "$CAP" ]; then
  for s in $(ls -1 "$CAP" | grep -E '^[0-9]{{8}}-[0-9]{{6}}' | sort | tail -n "$N"); do ln -s "$CAP/$s" "$T/out/pc/$s"; done
  say "pc: $(ls -1 "$T/out/pc" | tr '\\n' ' ')"
else
  say "pc: no capture folder at $CAP"
fi
# 2. Android over adb (a debuggable build: run-as)
if [ -x "$ADB" ] || [ -f "$ADB" ]; then
  DEV=$("$ADB" devices </dev/null 2>/dev/null | tr -d '\\r' | awk 'NR>1 && $2=="device" {{print $1; exit}}')
  if [ -n "$DEV" ]; then
    "$ADB" -s "$DEV" exec-out run-as "$PKG" sh -c 'for d in files/capture capture app_data/capture; do if [ -d "$d" ]; then cd "$d" && ls -1 | grep -E "^[0-9]{{8}}-[0-9]{{6}}" | sort | tail -n '"$N"' | xargs tar cf - ; exit 0; fi; done; exit 3' < /dev/null > "$T/android.tar" 2> "$T/android.err"
    if tar tf "$T/android.tar" >/dev/null 2>&1 && [ -s "$T/android.tar" ]; then
      tar xf "$T/android.tar" -C "$T/out/android" && say "android $DEV: $(ls -1 "$T/out/android" | tr '\\n' ' ')"
    else
      say "android $DEV: run-as could not read the app's files (a release build is not debuggable); trying shared storage"
    fi
    # 2b. any build: the zips a test build leaves in shared storage (Documents/Yames/capture), newest N
    for z in $("$ADB" -s "$DEV" shell "ls -1t $SHARED/yames-capture-*.zip 2>/dev/null" </dev/null | tr -d '\\r' | grep -E '/yames-capture-[A-Za-z0-9_-]+\\.zip$' | head -n "$N"); do
      b=$(basename "$z")
      "$ADB" -s "$DEV" exec-out cat "$z" </dev/null > "$T/out/zips/android-$b" && say "android $DEV shared: $b"
    done
  else
    say "android: no device connected"
  fi
else
  say "android: no adb at $ADB"
fi
# 3. Share/Zip exports in Downloads, newest N
for z in $(ls -1t "$DL"/yames-capture-*.zip 2>/dev/null | head -n "$N"); do ln -s "$z" "$T/out/zips/$(basename "$z")"; done
say "zips: $(ls -1 "$T/out/zips" | tr '\\n' ' ')"
tar -chf - -C "$T/out" .
}}
main </dev/null
"""


def pull_rtx(latest: int, dry_run: bool) -> list[pathlib.Path]:
    script = rtx_script(latest)
    if dry_run:
        print("# ssh rtx bash -s <<'EOF'\n" + script + "EOF")
        return []
    root = raw_root()
    root.mkdir(parents=True, exist_ok=True)
    stage = pathlib.Path(tempfile.mkdtemp(prefix=".incoming-", dir=str(root)))
    try:
        proc = subprocess.Popen(["ssh", "-o", "BatchMode=yes", "rtx", "bash", "-s"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        proc.stdin.write(script.encode())
        proc.stdin.close()
        try:
            with tarfile.open(fileobj=proc.stdout, mode="r|") as tf:
                tf.extractall(stage, filter="data")
        except tarfile.ReadError as e:
            log(f"nothing came back from the RTX ({e})")
        rc = proc.wait()
        if rc != 0:
            log(f"ssh rtx exited {rc}")
        status = stage / "STATUS.txt"
        if status.exists():
            log(status.read_text().strip())
        out = []
        for sub in ("pc", "android"):
            for s in sessions_in(stage / sub) if (stage / sub).exists() else []:
                name = safe_name(json.loads((s / "session.json").read_text()).get("session"), s.name)
                dest = root / name
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.move(str(s), str(dest))
                out.append(dest)
        for z in sorted((stage / "zips").glob("*.zip")) if (stage / "zips").exists() else []:
            out += import_zip(z)
        return sorted(set(out), key=lambda p: p.name)
    finally:
        shutil.rmtree(stage, ignore_errors=True)


def resolve_input(arg: str, latest: int | None, dry_run: bool) -> list[pathlib.Path]:
    if arg == "rtx":
        return pull_rtx(latest or 1, dry_run)
    p = pathlib.Path(arg).expanduser()
    if not p.is_absolute():  # npm runs scripts from the repo root; INIT_CWD is where it was typed
        p = pathlib.Path(os.environ.get("INIT_CWD", os.getcwd())) / p
    if p.is_file() and p.suffix.lower() == ".zip":
        found = import_zip(p)
    elif p.is_dir():
        found = sessions_in(p)
    else:
        raise SystemExit(f"{arg}: not a session folder, a capture folder, a .zip or 'rtx'")
    if latest:
        found = sorted(found, key=lambda q: q.name)[-latest:]
    return found


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="npm run corpus:ingest --", description=__doc__.split("\n\n")[0])
    ap.add_argument("input", help="a session folder, a capture folder of sessions, a .zip export, or 'rtx'")
    ap.add_argument("--latest", type=int, default=None, help="only the newest N sessions (rtx: default 1)")
    ap.add_argument("--dry-run", action="store_true", help="rtx: print the ssh script and stop")
    ap.add_argument("--no-replay", action="store_true", help="skip detect-bench replay (labels stay unconfirmed)")
    ap.add_argument("--fresh-replay", action="store_true", help="replay again even when a replay newer than the Take exists")
    ap.add_argument("--jobs", type=int, default=4, help="replays at once")
    ap.add_argument("--min-conf", type=float, default=0.3, help="drop an aligned Take under this envelope correlation")
    ap.add_argument("--score-delta", type=float, default=10.0, help="a live/replay score gap that counts as a disagreement")
    ap.add_argument("--no-cases", action="store_true", help="do not write regression cases")
    ap.add_argument("--store-root", default=None, help="write the set here instead of $YAMES_ML_DATA")
    args = ap.parse_args(argv)
    t0 = time.time()
    sessions = resolve_input(args.input, args.latest, args.dry_run)
    if args.dry_run:
        return 0
    if not sessions:
        log("no session found")
        return 1
    results = []
    for d in sessions:
        try:
            results.append(ingest_session(d, args))
        except Exception as e:  # one bad session does not stop the rest
            log(f"[{d.name}] FAILED: {type(e).__name__}: {e}")
            results.append({"session": d.name, "error": f"{type(e).__name__}: {e}"})
    for r in results:
        if "error" in r:
            print(f"{r['session']}: FAILED {r['error']}")
        else:
            dis = sum(1 for t in r["perTake"] if t["disagree"])
            print(f"{r['session']}: {r['takes']} Takes, {r['items']} items, {r['labels']} labels ({r['confirmed']} confirmed), {dis} disagreeing; "
                  f"report {preview_root() / r['session'] / 'report.html'}")
    log(f"done in {time.time() - t0:.1f} s")
    return 0 if all("error" not in r for r in results) else 2


if __name__ == "__main__":
    sys.exit(main())
