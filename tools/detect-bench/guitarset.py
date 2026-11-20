#!/usr/bin/env python3
"""GuitarSet (Xi et al., ISMIR 2018; CC BY 4.0) as bench Takes.

    python guitarset.py prepare [--limit N]

Writes `<datasets>/guitarset-bench/*.truth.json`, each pointing at a WAV of the
dataset, for `npm run detect:bench -- run --dir <datasets>/guitarset-bench`.
No audio is copied and none is committed.

The hexaphonic annotation is the score: one "Take" per excerpt, per capture
(`gs_mic_solo`, `gs_mic_comp`, `gs_pickup_solo`, `gs_pickup_comp`), in three styles that share the audio:

  good   every annotated note asked for at its annotated time
  wrong  every fifth single note asked for one or two semitones away: the
         player "played a wrong note" as far as the score knows
  omit   a note asked for in the middle of a gap of 360 ms or more, at a pitch
         the piece uses that is not sounding within 200 ms (any octave): the
         player "left it out". The research prototype's decoy, kept so the
         numbers compare.

So a run reports real notes confirmed and both kinds of mistake let through,
on real guitar. This is expressive playing without a click, and the
annotation includes ghost notes, so absolute numbers are lower than exercise
playing would give; compare systems on it, and before with after.

Only the standard library.
"""
from __future__ import annotations

import json
import os
import pathlib
import sys

CAPTURES = {"gs_mic": ("audio_mono-mic", "_mic.wav"), "gs_pickup": ("audio_mono-pickup_mix", "_mix.wav")}
MERGE_S = 0.03  # notes this close are one strum, as one written onset


def root() -> pathlib.Path:
    return pathlib.Path(os.environ.get("YAMES_DATASETS", pathlib.Path.home() / "projects" / ".datasets"))


def load_notes(jams: pathlib.Path):
    j = json.loads(jams.read_text())
    notes = []
    for ann in j["annotations"]:
        if ann["namespace"] == "note_midi":
            string = int(ann["annotation_metadata"].get("data_source", "0"))
            for d in ann["data"]:
                notes.append({"t": d["time"], "dur": d["duration"], "midi": d["value"], "string": 6 - string})
    notes.sort(key=lambda n: n["t"])
    return notes, j["file_metadata"]["duration"]


def sounding_near(notes, t, midi, pad):
    return any(abs(round(n["midi"]) - midi) % 12 == 0 and n["t"] - pad <= t <= n["t"] + n["dur"] + pad for n in notes)


def build(notes, duration, style):
    groups = []
    for n in notes:
        if groups and n["t"] - groups[-1][0]["t"] <= MERGE_S:
            groups[-1].append(n)
        else:
            groups.append([n])
    truth, onsets = [], []
    singles = 0

    def add(group_rows, t):
        oid = len(onsets)
        ids = []
        for r in group_rows:
            r["noteId"] = len(truth)
            r["onsetId"] = oid
            r["beat"] = t
            r["tWritten"] = t
            r["chordSize"] = len(group_rows)
            ids.append(r["noteId"])
            truth.append(r)
        onsets.append({"id": oid, "beat": t, "noteIds": ids, "soft": False, "accent": False})

    for gi, g in enumerate(groups):
        t = g[0]["t"]
        rows = []
        for n in g:
            row = {"tPlayed": n["t"], "dur": n["dur"], "string": n["string"], "midiWritten": round(n["midi"]), "midiPlayed": n["midi"], "tech": [], "legato": False, "bend": 0.0, "bendWritten": 0.0, "fault": None}
            if style == "wrong" and len(g) == 1:
                singles += 1
                shift = (1, -2, -1, 2)[(singles // 5) % 4]
                if singles % 5 == 2 and not sounding_near(notes, n["t"], round(n["midi"]) + shift, 0.25):
                    row["midiWritten"] = round(n["midi"]) + shift
                    row["fault"] = "wrong"
            rows.append(row)
        add(rows, t)
        if style == "omit" and gi + 1 < len(groups):
            gap = groups[gi + 1][0]["t"] - t
            if gap > 0.36:
                mid = t + gap / 2
                cands = sorted({round(n["midi"]) for n in notes if not sounding_near(notes, mid, round(n["midi"]), 0.2)})
                if cands:
                    midi = cands[(gi * 7919) % len(cands)]
                    add([{"tPlayed": None, "dur": 0.15, "string": 0, "midiWritten": midi, "midiPlayed": None, "tech": [], "legato": False, "bend": 0.0, "bendWritten": 0.0, "fault": "omitted"}], mid)
    return truth, {"onsets": onsets, "lengthBeats": duration, "loops": False}


def prepare(limit=None) -> int:
    src = root() / "guitarset"
    out = root() / "guitarset-bench"
    out.mkdir(parents=True, exist_ok=True)
    jams_files = sorted((src / "annotation").glob("*.jams"))
    if not jams_files:
        print(f"no annotations under {src}; run `python fetch.py guitarset` first", file=sys.stderr)
        return 2
    if limit:
        # spread over players and styles rather than the first N
        jams_files = jams_files[:: max(1, len(jams_files) // limit)][:limit]
    count = 0
    for jams in jams_files:
        notes, duration = load_notes(jams)
        playing = "comp" if jams.stem.endswith("_comp") else "solo"
        for chain, (folder, suffix) in CAPTURES.items():
            wav = src / folder / (jams.stem + suffix)
            if not wav.exists():
                continue
            for style in ("good", "wrong", "omit"):
                truth, schedule = build(notes, duration, style)
                name = f"{jams.stem}__{chain}__{style}"
                meta = {
                    "name": name,
                    "category": f"guitarset_{playing}",
                    "style": style,
                    "chain": f"{chain}_{playing}",
                    "pack": "guitarset",
                    "exercise": jams.stem,
                    "title": jams.stem,
                    # the annotation is in seconds, so one beat is one second
                    "bpm": 60.0,
                    "beatsPerBar": 4,
                    "leadS": 0.0,
                    "seconds": duration,
                    "flags": [],
                    "audio": str(wav),
                    "truth": truth,
                    "schedule": schedule,
                }
                (out / f"{name}.truth.json").write_text(json.dumps(meta))
                count += 1
    print(f"{count} Takes described in {out}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] != "prepare":
        print(__doc__)
        sys.exit(2)
    lim = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    sys.exit(prepare(lim))
