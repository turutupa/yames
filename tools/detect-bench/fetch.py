#!/usr/bin/env python3
"""Download a public dataset into the datasets folder (never into the repo).

    python fetch.py list
    python fetch.py guitar-techs [--only P1_techniques.zip,...]
    python fetch.py guitarset | fiveguitar | eg-ipt | ag-pt-set

Files land in $YAMES_DATASETS/<name>/ (default ~/projects/.datasets/<name>/),
each archive unpacked into a folder of its own. Only standard-library Python.
Downloaded archives are other people's files: nothing in them is executed.
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
import urllib.request
import zipfile

# name -> (Zenodo record, licence, what it is)
DATASETS = {
    "guitarset": (3371780, "CC BY 4.0", "360 thirty-second excerpts, one acoustic guitar, hexaphonic pickup + mic, note/chord/key annotations (Xi et al., ISMIR 2018)"),
    "fiveguitar": (4988354, "CC BY 4.0", "30 performances on 5 guitars, each through an interface, a phone and a laptop at once; no note labels"),
    "guitar-techs": (14963133, "CC BY 4.0", "3 players, electric guitar, DI + amp + room mics, techniques, chords, scales, excerpts, with MIDI (Pedroza et al., 2025)"),
    "eg-ipt": (15205644, "CC BY 4.0", "28 h, 19 playing techniques, DI + 6 mics, one electric guitar (NIME 2025); 24 GB"),
    "ag-pt-set": (10159492, "CC BY 4.0", "32,592 notes with ms onsets, 7 acoustic guitars, 8 techniques; 6.8 GB"),
}
# Read and decided against (cannot train on, cannot ship weights from):
NOT_USABLE = {
    "IDMT-SMT-Guitar / IDMT-SMT-Chords": "CC BY-NC-ND",
    "SynthTab": "CC BY-NC",
    "GOAT, DadaGP": "by request, research only",
    "GAPS": "YouTube-sourced; treat as research only",
}


def root() -> pathlib.Path:
    return pathlib.Path(os.environ.get("YAMES_DATASETS", pathlib.Path.home() / "projects" / ".datasets"))


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] == "list":
        for name, (rec, lic, what) in DATASETS.items():
            have = "present" if (root() / name).exists() else "absent"
            print(f"{name:13s} zenodo.org/records/{rec}  {lic}  [{have}]\n              {what}")
        print("\nnot usable for training or shipping:")
        for name, lic in NOT_USABLE.items():
            print(f"  {name}: {lic}")
        return 0
    name = sys.argv[1]
    if name not in DATASETS:
        print(f"unknown dataset {name!r}; try `list`", file=sys.stderr)
        return 2
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    rec, lic, _ = DATASETS[name]
    out = root() / name
    out.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(f"https://zenodo.org/api/records/{rec}", headers={"User-Agent": "dataset-fetch/1.0"})
    meta = json.load(urllib.request.urlopen(req, timeout=60))
    (out / "LICENCE.txt").write_text(f"{meta['metadata']['title']}\nhttps://zenodo.org/records/{rec}\nLicence: {lic}\n")
    for f in meta["files"]:
        key = f["key"]
        if only and key not in only:
            continue
        dest = out / key
        if not dest.exists() or dest.stat().st_size != f["size"]:
            print(f"{key}: {f['size'] / 1e6:.0f} MB", flush=True)
            tmp = dest.with_suffix(dest.suffix + ".part")
            r = urllib.request.Request(f["links"]["self"], headers={"User-Agent": "dataset-fetch/1.0"})
            with urllib.request.urlopen(r, timeout=120) as src, open(tmp, "wb") as dst:
                while chunk := src.read(1 << 20):
                    dst.write(chunk)
            tmp.rename(dest)
        if key.endswith(".zip"):
            folder = out / key[:-4]
            if not folder.exists():
                with zipfile.ZipFile(dest) as z:
                    for member in z.infolist():
                        # no absolute paths, no climbing out of the folder
                        target = (folder / member.filename).resolve()
                        if not str(target).startswith(str(folder.resolve())):
                            raise SystemExit(f"{key}: refusing {member.filename!r}")
                    z.extractall(folder)
    print(f"{name}: in {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
