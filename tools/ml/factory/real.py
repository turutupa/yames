"""Real guitar, in the format the synthetic factory writes (`store.py`).

    python -m tools.ml.factory.real --set guitarset|techs [--jobs 6] [--limit N] [--name NAME]

Two sets, both CC BY 4.0:

  guitarset-v1  GuitarSet (Xi et al., ISMIR 2018). Labels from the hexaphonic
                JAMS `note_midi`. Players 00-04 train (every 15th take val),
                player 05 "heldout": the evaluation set, never trained on.
                Items per take: the microphone, the pickup mix, and (train and
                val only) the pickup mix re-recorded through one drawn chain
                of `chains.MIC_SAFE`.
  techs-v1      Guitar-TECHS (Pedroza et al., ICASSP 2025). Labels from its
                MIDI files, shifted by a lag measured per file against the
                direct-input audio (see `align`). P1 and P2 train (every 15th
                take val), P3 "heldout". Items per take: direct input and the
                amplifier microphone (shifted onto the direct input's clock).

Deterministic: a take's seed is `seed * 1_000_003 + its index`, and the output
order is the take order whatever the number of workers. Levels are kept as
recorded; audio is only scaled down if it would clip.
"""
from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import os
import pathlib
import time

import numpy as np
import soundfile as sf
from scipy import signal

from . import chains, store, takes

SEED = 20261119
LICENCE = "CC BY 4.0"
LAG_MAX_S = 0.2
ENV_HOP = 32  # samples at store.RATE: 1.45 ms
ENV_WIN = 256
RISE_WIN_S = 0.024
MIN_Z, MIN_HIT = 2.5, 0.25  # alignment confidence below either: the file is dropped (chance for `hit` is 0.075)
LOCAL_NOTES = 40


def datasets() -> pathlib.Path:
    return pathlib.Path(os.environ.get("YAMES_DATASETS", pathlib.Path.home() / "projects" / ".datasets"))


def read_mono(path, to_rate: int = store.RATE):
    """-> (audio at its own rate, its rate, audio at `to_rate`), mono float64."""
    x, sr = sf.read(str(path), always_2d=True)
    x = x.mean(axis=1)
    return x, sr, resample(x, sr, to_rate)


def resample(x: np.ndarray, sr: int, to_rate: int = store.RATE) -> np.ndarray:
    if sr == to_rate:
        return x
    g = np.gcd(sr, to_rate)
    return signal.resample_poly(x, to_rate // g, sr // g)


def no_clip(y: np.ndarray) -> np.ndarray:
    peak = float(np.max(np.abs(y))) if y.size else 0.0
    return (y / peak * 0.999 if peak > 0.999 else y).astype(np.float32)


def label(t: float, end: float, midi: int, string, cls, vel) -> dict:
    """The keys `takes.labels_of` writes; what a recording cannot tell is null."""
    t, end = round(float(t), 5), round(float(end), 5)
    return {"t": t, "end": end, "midi": int(midi), "string": string, "cls": cls, "tech": [], "legato": None, "bend": None, "release": None, "vib": None,
            "vel": vel, "weak": None, "segs": [[t, end, int(midi)]], "on": [[t, int(midi)]]}


def split_of(heldout: bool, k: int) -> str:
    """`k` counts the takes that are not held out."""
    return "heldout" if heldout else ("val" if k % 15 == 14 else "train")


# ---------------------------------------------------------------- GuitarSet

def guitarset_jobs(seed: int):
    root = datasets() / "guitarset"
    jobs, k = [], 0
    for j, jams in enumerate(sorted((root / "annotation").glob("*.jams"))):
        stem = jams.stem
        player = stem[:2]
        held = player == "05"
        jobs.append({"set": "guitarset", "job": j, "seed": seed * 1_000_003 + j, "name": stem, "player": player, "split": split_of(held, k), "jams": str(jams),
                     "mic": str(root / "audio_mono-mic" / f"{stem}_mic.wav"), "pickup": str(root / "audio_mono-pickup_mix" / f"{stem}_mix.wav")})
        k += 0 if held else 1
    return jobs


def run_guitarset(job: dict):
    rng = np.random.default_rng(job["seed"])
    j = json.loads(pathlib.Path(job["jams"]).read_text())
    notes = []
    for ann in j["annotations"]:
        if ann["namespace"] != "note_midi":
            continue
        src = ann["annotation_metadata"].get("data_source")
        string = 6 - int(src) if src not in (None, "") else None  # data_source 0 is the low E: string 6
        for d in ann["data"]:
            if d["duration"] > 0:
                notes.append(label(d["time"], d["time"] + d["duration"], int(round(d["value"])), string, None, None))
    notes.sort(key=lambda n: n["t"])
    out, seconds, chain_src = [], 0.0, None
    for kind, key in (("real_mic", "mic"), ("real_pickup", "pickup")):
        if not os.path.exists(job[key]):
            continue
        x, sr, y = read_mono(job[key])
        out.append(({"kind": kind}, no_clip(y)))
        seconds = max(seconds, len(y) / store.RATE)
        chain_src = (x, sr)  # the pickup, read last, when there is one
    if not out:
        return {"dropped": job["name"], "why": "no audio"}
    if job["split"] != "heldout":
        p = chains.draw(rng, str(rng.choice(chains.MIC_SAFE)))
        out.append((p, no_clip(resample(chains.apply(chain_src[0], chain_src[1], p), chain_src[1]))))
    style = job["name"].split("_")[1].split("-")[0]
    meta = {"source": "guitarset", "licence": LICENCE, "split": job["split"], "name": job["name"], "player": job["player"], "group": "gs_" + job["name"].rsplit("_", 1)[1],
            "style": style, "seed": job["seed"], "seconds": round(seconds, 3)}
    return meta, notes, out


# ------------------------------------------------------------- Guitar-TECHS

STRING_OF_TRACK = {"e": 1, "B": 2, "G": 3, "D": 4, "A": 5, "E": 6}
# technique file -> (group, class). Bends and vibrato are picked notes; a pinch
# harmonic is neither a picked note nor the natural harmonic the synth makes.
TECH = {"PalmMute": ("palm_mute", "palm_mute"), "Harmonics": ("harmonic", "harmonic"), "PinchHarmonics": ("pinch_harmonic", None),
        "Bendings": ("bend", "picked"), "Vibrato": ("vibrato", "picked")}
CATEGORY = {"chords": ("chords", "picked"), "scales": ("scales", "picked"), "singlenotes": ("single_notes", "picked"), "music": ("music", None)}


def techs_jobs(seed: int):
    root = datasets() / "guitar-techs"
    jobs, k = [], 0
    for di in sorted(root.glob("P*_*/P*_*/audio/directinput/directinput_*.wav")):
        base = di.parents[2]
        player, category = base.name.split("_", 1)
        fid = di.stem[len("directinput_"):]
        group, cls = TECH.get(fid, (fid, None)) if category == "techniques" else CATEGORY.get(category, (category, None))
        held = player == "P3"
        j = len(jobs)
        jobs.append({"set": "techs", "job": j, "seed": seed * 1_000_003 + j, "name": f"{base.name}/{fid}", "player": player, "split": split_of(held, k), "group": group,
                     "cls": takes.CLASSES.index(cls) if cls else None, "di": str(di), "mic": str(base / "audio" / "micamp" / f"micamp_{fid}.wav"),
                     "midi": str(base / "midi" / f"midi_{fid}.mid")})
        k += 0 if held else 1
    return jobs


def midi_notes(path: str):
    """-> [(onset s, end s, midi, string or None, velocity 0..1)], by the file's own tempo map."""
    import mido

    mid = mido.MidiFile(path)
    tempi = sorted({(t, e.tempo) for tr in mid.tracks for t, e in _abs(tr) if e.type == "set_tempo"}) or [(0, 500_000)]
    if tempi[0][0] > 0:
        tempi.insert(0, (0, 500_000))
    ticks = np.array([t for t, _ in tempi], dtype=float)
    secs = np.concatenate([[0.0], np.cumsum(np.diff(ticks) * np.array([u for _, u in tempi[:-1]]) / 1e6 / mid.ticks_per_beat)])

    def at(tick):
        i = int(np.searchsorted(ticks, tick, side="right") - 1)
        return secs[i] + (tick - ticks[i]) * tempi[i][1] / 1e6 / mid.ticks_per_beat

    out = []
    for tr in mid.tracks:
        string = STRING_OF_TRACK.get(tr.name.strip())
        open_ = {}
        for tick, e in _abs(tr):
            if e.type == "note_on" and e.velocity > 0:
                open_.setdefault((e.channel, e.note), []).append((tick, e.velocity))
            elif e.type in ("note_off", "note_on") and open_.get((e.channel, e.note)):
                t0, vel = open_[(e.channel, e.note)].pop(0)
                if tick > t0:
                    out.append((at(t0), at(tick), e.note, string, round(vel / 127.0, 3)))
    out.sort()
    return out


def _abs(track):
    t = 0
    for e in track:
        t += e.time
        yield t, e


def onset_envelope(y: np.ndarray) -> np.ndarray:
    """Spectral flux of `y` (at store.RATE); frame `i` is centred on sample `i * ENV_HOP`."""
    _, _, s = signal.stft(y, nperseg=ENV_WIN, noverlap=ENV_WIN - ENV_HOP, window="hann", boundary="zeros", padded=False)
    m = np.log1p(200.0 * np.abs(s) / (np.max(np.abs(s)) + 1e-12))
    return np.maximum(0.0, np.diff(m, axis=1, prepend=m[:, :1])).sum(axis=0)


def xcorr_lag(a: np.ndarray, b: np.ndarray, max_frames: int):
    """Lag `l` (frames, sub-frame by a parabola) that maximises sum a[i + l] * b[i], and the curve."""
    n = min(len(a), len(b))
    a, b = a[:n] - a[:n].mean(), b[:n] - b[:n].mean()
    c = signal.correlate(a, b, mode="full", method="fft")[n - 1 - max_frames:n + max_frames]
    i = int(np.argmax(c))
    frac = 0.0
    if 0 < i < len(c) - 1:
        den = c[i - 1] - 2 * c[i] + c[i + 1]
        frac = 0.5 * (c[i - 1] - c[i + 1]) / den if den < 0 else 0.0
    return i - max_frames + frac, c


def note_rise(y: np.ndarray, t: float, midi: int, half: float) -> np.ndarray:
    """How fast the note's own partials grow, sample by sample, over `t - half .. t + half`."""
    sr = store.RATE
    i0, n = int(round((t - half) * sr)), int(round(2 * half * sr)) + 1
    seg = np.zeros(n)
    a, b = max(0, i0), min(len(y), i0 + n)
    if b > a:
        seg[a - i0:b - i0] = y[a:b]
    f0 = 440.0 * 2 ** ((midi - 69) / 12.0)
    win = signal.windows.hann(int(RISE_WIN_S * sr) | 1)
    win /= win.sum()
    k = np.arange(n)
    mag = np.zeros(n)
    for h in range(1, 5):
        if h * f0 < sr * 0.45:
            mag += np.abs(signal.fftconvolve(seg * np.exp(-2j * np.pi * h * f0 / sr * k), win, mode="same"))
    d = np.maximum(0.0, np.diff(mag, prepend=mag[0]))
    edge = len(win)  # the zero padding of the convolution is not an onset
    d[:edge] = 0.0
    d[-edge:] = 0.0
    return d


def align(y: np.ndarray, notes: list) -> dict:
    """How late the audio is against the MIDI. For every note, the rate at
    which the energy at its own partials (f0 to 4 f0, a 24 ms zero-phase
    window) rises around its MIDI onset; the curves of all notes, each scaled
    to one vote, are summed, and the lag is where the sum peaks (+-`LAG_MAX_S`).
    A broadband onset detector cannot do this on strummed chords and noisy
    direct inputs; this one asks each string for its own attack.
    `z`: the peak against the rest of the curve; `hit`: the share of notes
    whose own steepest rise is within 15 ms of the common lag; `range_ms`:
    the lag is also measured in runs of 40 notes, and where those differ by
    more than 12 ms (a file that is two sessions end to end) each note is
    shifted by the lag of its own stretch of the file.
    """
    sr = store.RATE
    half = LAG_MAX_S + 0.05
    curves = []
    for t, _, midi, _, _ in notes:
        d = note_rise(y, t, midi, half)
        curves.append(d / (d.max() + 1e-12))
    curves = np.array(curves)
    lags = (np.arange(curves.shape[1]) - (curves.shape[1] - 1) / 2) / sr
    keep = np.abs(lags) <= LAG_MAX_S
    smooth = signal.windows.gaussian(int(0.012 * sr) | 1, 0.002 * sr)

    def peak(rows):
        c = signal.fftconvolve(rows.sum(axis=0), smooth, mode="same")[keep]
        i = int(np.argmax(c))
        mad = np.median(np.abs(c - np.median(c))) * 1.4826 + 1e-12
        return float(lags[keep][i]), float((c[i] - np.median(c)) / mad)

    def agree(rows, lag):
        own = lags[keep][np.argmax(rows[:, keep], axis=1)]
        return own, np.abs(own - lag) <= 0.015

    lag, z = peak(curves)
    own, ok = agree(curves, lag)
    if ok.sum() >= 4:  # the median of the notes that agree is steadier than the peak of a sum
        lag = float(np.median(own[ok]))
    # the lag along the file: some files are two sessions end to end
    n = len(curves)
    per_note = np.full(n, lag)
    local = []
    if n >= 2 * LOCAL_NOTES:
        centres = list(range(LOCAL_NOTES // 2, n - LOCAL_NOTES // 2 + 1, LOCAL_NOTES // 4))
        for c in centres:
            rows = curves[c - LOCAL_NOTES // 2:c + LOCAL_NOTES // 2]
            l, _ = peak(rows)
            o, k = agree(rows, l)
            local.append(float(np.median(o[k])) if k.mean() >= max(MIN_HIT, 0.3) and k.sum() >= 4 else np.nan)
        local = np.array(local)
        good = ~np.isnan(local)
        if good.sum() >= 3:
            filled = np.interp(np.arange(len(local)), np.flatnonzero(good), local[good])
            filled = signal.medfilt(np.pad(filled, 2, mode="edge"), 5)[2:-2]
            if filled.max() - filled.min() > 0.012:
                per_note = filled[np.argmin(np.abs(np.arange(n)[:, None] - np.array(centres)[None, :]), axis=1)]
            local = filled
        else:
            local = np.array([])
    own_ok = np.abs(own - per_note) <= 0.015
    return {"lag_s": float(np.median(per_note)), "per_note": per_note, "z": round(z, 1), "hit": round(float(own_ok.mean()), 3),
            "range_ms": [round(float(per_note.min()) * 1000, 2), round(float(per_note.max()) * 1000, 2)],
            "sd_ms": round(float(np.std((own - per_note)[own_ok]) * 1000), 2) if own_ok.any() else None}


def run_techs(job: dict):
    for k in ("di", "mic", "midi"):
        if not os.path.exists(job[k]):
            return {"dropped": job["name"], "why": f"no {k} file"}
    notes = midi_notes(job["midi"])
    if len(notes) < 4:
        return {"dropped": job["name"], "why": "fewer than 4 MIDI notes"}
    _, _, di = read_mono(job["di"])
    _, _, mic = read_mono(job["mic"])
    a = align(di, notes)
    info = {"lag_ms": round(a["lag_s"] * 1000, 2), "lag_range_ms": a["range_ms"], "lag_z": a["z"], "lag_hit": a["hit"], "lag_sd_ms": a["sd_ms"]}
    if a["z"] < MIN_Z or a["hit"] < MIN_HIT or abs(a["lag_s"]) > LAG_MAX_S - 0.005:
        return {"dropped": job["name"], "why": "alignment", **info}
    # the amplifier microphone onto the direct input's clock (cable, amplifier, air)
    dt = ENV_HOP / store.RATE
    mlag, _ = xcorr_lag(onset_envelope(mic), onset_envelope(di), int(round(0.1 / dt)))
    shift = int(round(mlag * ENV_HOP))
    if shift > 0:
        mic = mic[shift:]
    elif shift < 0:
        mic = np.concatenate([np.zeros(-shift), mic])
    seconds = len(di) / store.RATE
    mic = mic[:len(di)]
    labels = []
    for (t, end, midi, string, vel), lag in zip(notes, a["per_note"]):
        t, end = t + lag, min(end + lag, seconds)
        if end > max(t, 0.0) and t < seconds:
            labels.append(label(max(t, 0.0), end, midi, string, job["cls"], vel))
    labels.sort(key=lambda n: n["t"])
    meta = {"source": "guitar-techs", "licence": LICENCE, "split": job["split"], "name": job["name"], "player": job["player"], "group": job["group"], "seed": job["seed"],
            "seconds": round(seconds, 3), **info, "mic_lag_ms": round(mlag * dt * 1000, 2)}
    return meta, labels, [({"kind": "real_di"}, no_clip(di)), ({"kind": "real_amp_mic"}, no_clip(mic))]


# ----------------------------------------------------------------------- main

SETS = {
    "guitarset": dict(name="guitarset-v1", jobs=guitarset_jobs, source="guitarset", url="https://zenodo.org/records/3371780",
                      citation="Q. Xi, R. M. Bittner, J. Pauwels, X. Ye, J. P. Bello: GuitarSet: A Dataset for Guitar Transcription. ISMIR 2018."),
    "techs": dict(name="techs-v1", jobs=techs_jobs, source="guitar-techs", url="https://zenodo.org/records/14963133",
                  citation="H. Pedroza, W. Abreu, R. Corey, I. Roman: Guitar-TECHS: An Electric Guitar Dataset Covering Techniques, Musical Excerpts, Chords and Scales Using a Diverse Array of Hardware. ICASSP 2025."),
}


def run(job: dict):
    return run_guitarset(job) if job["set"] == "guitarset" else run_techs(job)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", required=True, choices=sorted(SETS))
    ap.add_argument("--name", default=None)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--jobs", type=int, default=6)
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    spec = SETS[a.set]
    jobs = spec["jobs"](a.seed)
    if a.limit:
        jobs = jobs[:: max(1, len(jobs) // a.limit)][: a.limit]
    w = store.Writer(a.name or spec["name"])
    splits, dropped, t0 = {}, [], time.time()
    with mp.Pool(min(a.jobs, 6)) as pool:
        for i, res in enumerate(pool.imap(run, jobs, chunksize=1)):
            if isinstance(res, dict):
                dropped.append(res)
                print(f"dropped {json.dumps(res)}", flush=True)
                continue
            meta, labels, out = res
            tid = w.take(meta, labels)
            s = splits.setdefault(meta["split"], {"takes": 0, "items": 0, "hours": 0.0, "notes": 0})
            s["takes"] += 1
            s["notes"] += len(labels)
            for p, y in out:
                w.item(tid, y, {"split": meta["split"], "chain": p})
                s["items"] += 1
                s["hours"] += len(y) / store.RATE / 3600
            if "lag_ms" in meta:
                print(f"{meta['name']}: lag {meta['lag_ms']:+.1f} ms (range {meta['lag_range_ms']}), z {meta['lag_z']}, hit {meta['lag_hit']}, mic {meta['mic_lag_ms']:+.1f} ms", flush=True)
            if i % 20 == 0:
                print(f"{i}/{len(jobs)} takes, {w.offset / store.RATE / 3600:.2f} h, {time.time() - t0:.0f} s", flush=True)
    for s in splits.values():
        s["hours"] = round(s["hours"], 3)
    m = w.close({"name": a.name or spec["name"], "source": spec["source"], "licence": LICENCE, "citation": spec["citation"], "url": spec["url"], "seed": a.seed,
                 "splits": splits, "dropped": dropped, "adapter": "tools/ml/factory/real.py"})
    print(json.dumps(m))


if __name__ == "__main__":
    main()
