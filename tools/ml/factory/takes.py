"""Takes to render: every Exercise of the shipped packs, and written drills
for what the packs or the tab DSL have little of.

A Take is the written notes looped, played with a style (good, sloppy, weak
legato, notes left out, wrong notes, a damped chord string), and its labels:
for every note that sounds, when, which pitch at which time (bends and slides
move), which string and which technique.
"""
from __future__ import annotations

import glob
import json
import math
import pathlib
from typing import Dict, List

import numpy as np

from . import synth as gs

REPO = pathlib.Path(__file__).resolve().parents[3]
PACKS = REPO / "src/paths/packs"
LEAD_S = 1.0
MAX_TAKE_S = 20.0
TUNING = gs.STANDARD_TUNING
# technique classes of the classifier (T1); -1 is "not a start anyone can name"
CLASSES = ("picked", "hammer", "pull", "slide", "tap", "palm_mute", "harmonic")


def load_pack_exercises() -> List[dict]:
    out = []
    for f in sorted(glob.glob(str(PACKS / "*.json"))):
        pack = json.load(open(f))

        def walk(o):
            if isinstance(o, dict):
                if "notes" in o and "passBars" in o and o["notes"]:
                    out.append({**o, "pack": pack["id"]})
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)

        walk(pack)
    return out


def _ex(id_, notes, bars, bpm, pack="drill"):
    return {"id": id_, "pack": pack, "meter": {"numerator": 4, "denominator": 4}, "bars": bars, "notes": notes, "tempo": {"rungs": [{"bpm": bpm}], "passAtBpm": bpm}}


def _n(string, fret, tick, dur, tech=(), **kw):
    return {"string": string, "fret": fret, "midi": TUNING[string - 1] + fret, "tick": int(tick), "dur": int(dur), "tech": list(tech), **kw}


CHORD_SHAPES = [  # frets for strings 6..1, None = not played
    [0, 2, 2, 1, 0, 0], [0, 2, 2, 0, 0, 0], [None, 0, 2, 2, 2, 0], [None, 0, 2, 2, 1, 0], [None, None, 0, 2, 3, 2], [None, None, 0, 2, 3, 1],
    [3, 2, 0, 0, 0, 3], [None, 3, 2, 0, 1, 0], [1, 3, 3, 2, 1, 1], [1, 3, 3, 1, 1, 1], [None, 1, 3, 3, 3, 1], [None, 1, 3, 3, 2, 1],
    [0, 2, 0, 1, 0, 0], [None, 0, 2, 0, 2, 0], [None, 3, 2, 3, 1, 0], [3, 2, 0, 0, 0, 1], [None, 0, 2, 2, 0, 0], [None, None, 0, 2, 3, 3],
    [0, 2, 2, None, None, None], [None, 0, 2, 2, None, None], [None, None, 0, 2, 3, None],  # power chords
    [None, None, None, 2, 1, 0], [None, None, None, 2, 3, 2], [None, None, 2, 2, 1, None], [None, 3, 2, 0, None, None],  # triads
    [None, 1, 3, 2, 3, None], [None, 1, 3, 1, 3, None], [1, None, 2, 2, 1, None], [1, None, 1, 2, 1, None],  # sevenths
]


def drill(kind: str, rng: np.random.Generator, idx: int) -> dict:
    """One written drill. Ticks: 960 a quarter note."""
    bpm = int(rng.integers(60, 150))
    notes = []
    r = lambda lo, hi: int(rng.integers(lo, hi + 1))
    if kind == "melody":  # picked notes over the whole neck, any rhythm
        tick = 0
        s, f = r(1, 6), r(0, 12)
        while tick < 4 * 3840:
            dur = int(rng.choice([240, 480, 480, 960, 1440]))
            if rng.random() < 0.3:
                s = int(np.clip(s + r(-1, 1), 1, 6))
            f = int(np.clip(f + r(-4, 4), 0, 22))
            tech = ["palmMute"] if (idx % 5 == 0 and s >= 4) else []
            notes.append(_n(s, f, tick, dur, tech))
            tick += dur
    elif kind == "legato":  # hammer-ons and pull-offs on one string, with a pick now and then
        tick = 0
        s, base = r(1, 6), r(0, 14)
        scale = [0, 2, 3, 5, 7] if rng.random() < 0.5 else [0, 1, 3, 4, 5, 7]
        pos = r(0, len(scale) - 1)
        dur = int(rng.choice([240, 320, 480]))
        prev = None
        while tick < 4 * 3840:
            if rng.random() < 0.12:
                s, base, prev = r(1, 6), r(0, 14), None
            pos = int(np.clip(pos + rng.choice([-1, 1]), 0, len(scale) - 1))
            f = base + scale[pos]
            tech = []
            if prev is not None and f != prev and rng.random() < 0.75:
                tech = ["hammer"] if f > prev else ["pull"]
            notes.append(_n(s, f, tick, dur, tech))
            prev = f
            tick += dur
    elif kind == "tap":  # tap high, pull off to two fretted notes
        s = r(1, 3)
        dur = int(rng.choice([240, 320]))
        tick = 0
        while tick < 4 * 3840:
            lo = r(2, 9)
            mid, hi = lo + r(2, 4), lo + r(7, 12)
            for f, tech in ((hi, ["tap"]), (lo, ["pull"]), (mid, ["hammer"])):
                notes.append(_n(s, f, tick, dur, tech if notes or tech != ["tap"] else ["tap"]))
                tick += dur
            if rng.random() < 0.3:
                s = r(1, 3)
    elif kind == "slide":  # a picked note slid to another
        tick = 0
        while tick < 4 * 3840:
            s, f = r(1, 6), r(1, 15)
            g = int(np.clip(f + rng.choice([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]), 0, 20))
            d1, d2 = int(rng.choice([480, 960])), int(rng.choice([480, 960, 1440]))
            notes.append(_n(s, f, tick, d1, ["slide"]))
            notes.append(_n(s, g, tick + d1, d2, []))
            tick += d1 + d2
            if rng.random() < 0.4:
                notes.append(_n(r(1, 6), r(0, 12), tick, 480, []))
                tick += 480
    elif kind == "bend":  # bends, some released, some with vibrato on top
        tick = 0
        while tick < 4 * 3840:
            s, f = r(1, 4), r(5, 17)
            dur = int(rng.choice([960, 1440, 1920]))
            amount = float(rng.choice([0.5, 1.0, 1.0, 2.0]))
            n = _n(s, f, tick, dur, ["bend"], bend=amount)
            if rng.random() < 0.4:
                n["release"] = True
            notes.append(n)
            tick += dur
            if rng.random() < 0.5:
                notes.append(_n(s, max(0, f - r(1, 3)), tick, 480, []))
                tick += 480
    elif kind == "vibrato":
        tick = 0
        while tick < 4 * 3840:
            dur = int(rng.choice([960, 1920, 2880]))
            notes.append(_n(r(1, 6), r(2, 17), tick, dur, ["vibrato"]))
            tick += dur
    elif kind == "harmonic":  # natural harmonics: the sounding pitch is what is written
        tick = 0
        while tick < 4 * 3840:
            s = r(1, 6)
            up = int(rng.choice([12, 12, 19, 24]))
            dur = int(rng.choice([480, 960, 1920]))
            n = _n(s, 0, tick, dur, ["harmonic", "letRing"])
            n["midi"] = TUNING[s - 1] + up
            notes.append(n)
            tick += dur
    elif kind == "chords":  # strummed shapes, moved up the neck, down and up strokes
        tick = 0
        pattern = [[960, 960, 960, 960], [960, 480, 480, 960, 480, 480], [480] * 8, [1920, 1920], [1440, 480, 960, 960]][r(0, 4)]
        mute = rng.random() < 0.2
        shape, shift = CHORD_SHAPES[r(0, len(CHORD_SHAPES) - 1)], 0
        k = 0
        while tick < 4 * 3840:
            if k % len(pattern) == 0 and rng.random() < 0.7:
                shape = CHORD_SHAPES[r(0, len(CHORD_SHAPES) - 1)]
                shift = r(0, 9) if all(v is None or v > 0 for v in shape) or rng.random() < 0.3 else 0
            dur = pattern[k % len(pattern)]
            down = (k % 2 == 0) or dur >= 960
            strings = [(6 - i, v + shift) for i, v in enumerate(shape) if v is not None]
            if not down and len(strings) > 3 and rng.random() < 0.6:
                strings = strings[-int(rng.integers(3, len(strings) + 1)):]  # an upstroke catches the top strings
            for s, f in strings:
                tech = ["palmMute"] if (mute and len(strings) <= 3) else []
                notes.append(_n(s, f, tick, dur, tech, pick="d" if down else "u"))
            tick += dur
            k += 1
    elif kind == "arpeggio":  # chord shapes one string at a time, left ringing
        tick = 0
        while tick < 4 * 3840:
            shape, shift = CHORD_SHAPES[r(0, 17)], 0
            strings = [(6 - i, v + shift) for i, v in enumerate(shape) if v is not None]
            order = strings + strings[-2:0:-1] if rng.random() < 0.5 else strings
            for s, f in order:
                notes.append(_n(s, f, tick, 480, ["letRing"]))
                tick += 480
    elif kind == "chug":  # palm-muted low strings with open power chords between
        tick = 0
        s, f = int(rng.choice([6, 6, 5])), r(0, 5)
        while tick < 4 * 3840:
            dur = int(rng.choice([240, 240, 480]))
            if rng.random() < 0.2:
                for ss, ff in ((s, f), (s - 1, f + 2)):
                    notes.append(_n(ss, ff, tick, 960, [], pick="d"))
                tick += 960
                f = r(0, 7)
            else:
                notes.append(_n(s, f, tick, dur, ["palmMute"]))
                tick += dur
    else:
        raise ValueError(kind)
    return _ex(f"drill.{kind}.{idx}", notes, 4, bpm)


DRILLS = {"melody": 5, "legato": 4, "tap": 2, "slide": 3, "bend": 2, "vibrato": 1, "harmonic": 2, "chords": 8, "arpeggio": 2, "chug": 2}  # relative counts


def technique_class(tech, legato: bool, slid: bool) -> int:
    t = set(tech)
    if "dead" in t:
        return -1
    if "harmonic" in t:
        return CLASSES.index("harmonic")
    if slid:
        return CLASSES.index("slide")
    if legato and "tap" in t:
        return CLASSES.index("tap")
    if legato and "hammer" in t:
        return CLASSES.index("hammer")
    if legato and "pull" in t:
        return CLASSES.index("pull")
    if "palmMute" in t:
        return CLASSES.index("palm_mute")
    return CLASSES.index("picked")


def build_take(ex: dict, bpm: float, style: str, seed: int, timbre: gs.Timbre):
    """-> (synth notes, labels, seconds). Labels are of what SOUNDS."""
    rng = np.random.default_rng(seed)
    bt = round(ex["meter"]["numerator"] * 960 * 4 / ex["meter"]["denominator"])
    q = 60.0 / bpm
    bar_s = bt / 960 * q
    bars = max(2, int(min(MAX_TAKE_S - LEAD_S - 1.0, 16 * bar_s) // bar_s))
    pass_ticks = bt * ex["bars"]
    passes = -(-bars // ex["bars"])
    written = []
    for p in range(passes):
        for n in ex["notes"]:
            tick = n["tick"] + p * pass_ticks
            if tick < bars * bt:
                written.append({**n, "tick": tick})
    written.sort(key=lambda n: (n["tick"], -n["string"]))
    ticks = sorted({n["tick"] for n in written})
    sigma = {"sloppy": 0.025}.get(style, 0.006)
    jitter = {t: float(np.clip(rng.normal(0, sigma), -3 * sigma, 3 * sigma)) for t in ticks}
    groups: Dict[int, list] = {}
    for n in written:
        groups.setdefault(n["tick"], []).append(n)
    strum_gap = {t: float(rng.uniform(0.003, 0.022)) for t in ticks}
    take_vel = float(rng.uniform(0.45, 1.0))
    legato_level = float(rng.uniform(0.25, 0.6))
    chordy = sum(1 for g in groups.values() if len(g) >= 3) >= 2

    notes: List[gs.Note] = []
    prev_on_string: Dict[int, dict] = {}
    count = 0
    for nid, n in enumerate(written):
        tick = n["tick"]
        group = groups[tick]
        chord = len(group) > 1
        tech = list(n["tech"])
        t = LEAD_S + tick / 960 * q + jitter[tick]
        if chord:
            down = (n.get("pick") or "d") == "d"
            order = sorted(group, key=lambda m: -m["string"] if down else m["string"])
            t += strum_gap[tick] * order.index(n)
        dur = n["dur"] / 960 * q
        prev = prev_on_string.get(n["string"])
        slide_from = None
        if prev is not None and "slide" in prev["tech"] and prev["tick"] < tick and prev["midi"] != n["midi"]:
            slide_from = float(prev["midi"])
        present, midi = True, float(n["midi"])
        strength = legato_level
        bend = float(n.get("bend") or 0.0) if "bend" in tech else 0.0
        count += 1
        if style == "weak" and set(tech) & {"hammer", "pull", "tap"}:
            strength = float(rng.uniform(0.06, 0.15))
        if style == "omit" and rng.random() < 0.15:
            present = False
        if style == "wrong" and rng.random() < 0.15:
            midi += float(rng.choice([-2, -1, 1, 2]))
        if style == "dead" and chord and rng.random() < 0.2:
            tech = tech + ["dead"]
        if style == "flat" and bend > 0 and rng.random() < 0.5:
            bend = max(0.0, bend - 0.5)
        ring = "letRing" in tech or chordy or style == "ringing"
        notes.append(gs.Note(
            t=t, dur=dur, string=n["string"], midi=midi, tech=tech, vel=take_vel * float(rng.uniform(0.75, 1.0)), legato_strength=strength,
            bend=bend, bend_ms=min(float(rng.uniform(120, 260)), dur * 1000 * 0.45), release=bool(n.get("release")),
            slide_from=slide_from, slide_ms=min(float(rng.uniform(50, 110)), dur * 1000 * 0.4),
            vibrato_cents=float(rng.uniform(20, 50)) if "vibrato" in tech else 0.0, ring=ring, note_id=nid, present=present,
        ))
        prev_on_string[n["string"]] = n
    seconds = LEAD_S + bars * bar_s + 1.0
    return notes, labels_of(notes, seconds, timbre), seconds


def _decay_s(note: gs.Note, timbre: gs.Timbre) -> float:
    """Seconds until the string is 40 dB down (the synth's own loop loss): a
    label must not outlive the sound, or the model learns to hear silence."""
    tech = set(note.tech)
    sustain = 0.9985 if note.midi < 52 else 0.998 if note.midi < 64 else 0.9972
    if "palmMute" in tech:
        sustain = 0.972
    if "harmonic" in tech:
        sustain = 0.9992
    return max(0.05, math.log(0.01) / (gs.midi_hz(note.midi) * math.log(sustain ** timbre.sustain)))


def labels_of(notes: List[gs.Note], seconds: float, timbre: gs.Timbre) -> List[dict]:
    out = []
    by_string: Dict[int, List[gs.Note]] = {}
    for n in notes:
        if n.present:
            by_string.setdefault(n.string, []).append(n)
    for s, mine in by_string.items():
        mine.sort(key=lambda x: x.t)
        for k, n in enumerate(mine):
            nxt = mine[k + 1].t if k + 1 < len(mine) else seconds
            held_end = min(n.t + n.dur, nxt)
            end = (nxt if n.ring else held_end)
            end = min(end, n.t + _decay_s(n, timbre))
            tech = set(n.tech)
            prev_sounding = k > 0 and (mine[k - 1].ring or mine[k - 1].t + mine[k - 1].dur >= n.t - 0.03)
            legato = bool(tech & {"hammer", "pull", "tap"}) and prev_sounding
            slid = n.slide_from is not None and prev_sounding
            if "dead" in tech:
                out.append({"t": n.t, "end": n.t + 0.03, "midi": None, "string": s, "cls": -1, "tech": sorted(tech), "segs": [], "on": [], "vel": n.vel})
                continue
            # pitch over time, in semitone steps
            segs = []
            base = int(round(n.midi))
            if n.bend > 0:
                step = 0.01
                ts = np.arange(0.0, max(step, end - n.t), step)
                rise = np.clip(ts / (n.bend_ms / 1000.0), 0, 1)
                shape = 0.5 - 0.5 * np.cos(np.pi * rise)
                if n.release:
                    half = max(1e-3, (held_end - n.t) / 2.0)
                    down = np.clip((ts - half) / (n.bend_ms / 1000.0), 0, 1)
                    shape = shape - (0.5 - 0.5 * np.cos(np.pi * down))
                semis = np.round(n.midi + n.bend * shape).astype(int)
                start = 0
                for i in range(1, len(ts) + 1):
                    if i == len(ts) or semis[i] != semis[start]:
                        segs.append([n.t + ts[start], n.t + (ts[i] if i < len(ts) else end - n.t), int(semis[start])])
                        start = i
            elif slid and n.slide_from is not None:
                steps = int(round(n.midi - n.slide_from))
                m = max(1, abs(steps))
                sl = n.slide_ms / 1000.0
                for j in range(m):  # passing frets, then the target
                    segs.append([n.t + sl * j / m, n.t + sl * (j + 1) / m, int(round(n.slide_from)) + int(np.sign(steps)) * j])
                segs.append([n.t + sl, max(end, n.t + sl + 0.01), base])
                segs = segs[1:]  # the first step is still the note it left
            else:
                segs.append([n.t, end, base])
            # the target pitch "starts" when it is reached (a slide arrives late)
            on_t = segs[-1][0] if (slid and n.slide_from is not None) else n.t
            out.append({
                "t": round(n.t, 5), "end": round(end, 5), "midi": base, "string": s, "cls": technique_class(tech, legato, bool(slid)),
                "tech": sorted(tech), "legato": bool(legato or slid), "bend": n.bend, "release": n.release, "vib": n.vibrato_cents, "vel": round(n.vel, 3),
                "weak": bool(legato and n.legato_strength < 0.2),
                "segs": [[round(a, 5), round(b, 5), int(m)] for a, b, m in segs if b > a], "on": [[round(on_t, 5), base]],
            })
    out.sort(key=lambda x: x["t"])
    return out
