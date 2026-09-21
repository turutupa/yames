#!/usr/bin/env python3
"""Move the five synthesised kits into the folder format the loader reads.

Before this, a kit was eight files in `src-tauri/sounds/` named
`kit_<kit>_<voice>.wav` and a hand-written `include_bytes!` table in
`engine.rs`. Adding a kit meant editing Rust. After it, a kit is a folder
with a `kit.json` in it, `build.rs` walks the folders, and adding a kit is
adding a folder — which is what makes the recorded kits (W27's `club` and
`studio`) a drop rather than a patch.

    python scripts/sounds/relayout_kits.py            # move them
    python scripts/sounds/relayout_kits.py --dry-run  # say what it would do

The move is a rename and nothing else: not one sample is touched, so the
five kits sound in the new format exactly as they sounded in the old one.
Two names change meaning on the way, and only because the new format spells
velocity layers rather than two snares:

    <voice>.wav        ->  <voice>.1.1.wav      (layer 1, round robin 1)
    snare_lo.wav       ->  snare.1.1.wav        (the soft layer)
    snare_hi.wav       ->  snare.2.1.wav        (the same drum, hit harder)

Which is rule 4 of `src-tauri/sounds/KITS.md` written the way the rest of
the world writes it. Everything else — `kick`, `hat`, `hat_open`, `ride`,
`rim`, `crash` — is one layer and one round robin, because one sample is
what a synthesised kit has.

Idempotent: run it twice and the second run finds the folders already
there and the old files already gone, and says so.
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

# The repository's `src-tauri/sounds`, found from this file rather than from
# the working directory, so the script runs from anywhere.
SOUNDS = Path(__file__).resolve().parents[2] / "src-tauri" / "sounds"

KITS = ["room", "tight", "brushes", "electronic", "raw"]

# The old `<voice>` half of `kit_<kit>_<voice>.wav`, and where it lands:
# (voice, layer). The order is the order the manifest lists them in, which
# is the order the engine's `KitVoice` enum names them.
MOVES = [
    ("kick", "kick", 1),
    ("snare_lo", "snare", 1),
    ("snare_hi", "snare", 2),
    ("rim", "rim", 1),
    ("hat", "hat", 1),
    ("hat_open", "hat_open", 1),
    ("ride", "ride", 1),
    ("crash", "crash", 1),
]

# What each kit is, for the `name` the picker shows. The credit is the
# app's own: these are synthesised by `generate_sounds.py`, from nobody's
# recording, which is why the licence is the app's licence.
NAMES = {
    "room": "Room",
    "tight": "Tight",
    "brushes": "Brushes",
    "electronic": "Electronic",
    "raw": "Raw",
}

CREDIT = "Synthesised by Yames — scripts/generate_sounds.py --kits"

# How hard each kit asks the drum bus to drive it. 1.0 is glue and not an
# effect, which is what an acoustic kit wants; `raw` is the kit the owner
# asked for after the first four came out smooth, so it asks for more.
DRIVE = {"raw": 1.6}
LICENCE = "GPL-3.0-or-later"

# The closed hat and the open hat sit a little right of centre, where a
# right-handed drummer's hats are; everything else is where it was. A pan
# of 0 is dead centre and is what a mono file has always been, so the four
# drums that carry the pulse keep it.
PAN = {"hat": 0.15, "hat_open": 0.15}


def wav_header(path: Path) -> tuple[int, int, int]:
    """(channels, sample rate, frames) from a WAV's own header.

    Read by hand rather than with a library so the script needs nothing
    installed: the repository's other sound scripts are plain Python and
    this one is run once.
    """
    data = path.read_bytes()
    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise SystemExit(f"{path.name} is not a RIFF/WAVE file")
    pos, channels, rate, bits, frames = 12, 0, 0, 0, 0
    while pos + 8 <= len(data):
        chunk_id = data[pos : pos + 4]
        (size,) = struct.unpack("<I", data[pos + 4 : pos + 8])
        body = pos + 8
        if chunk_id == b"fmt ":
            channels, rate = struct.unpack("<HI", data[body + 2 : body + 8])
            (bits,) = struct.unpack("<H", data[body + 14 : body + 16])
        elif chunk_id == b"data" and bits:
            frames = size // (channels * (bits // 8))
        pos = body + size + (size & 1)
    if not (channels and rate and frames):
        raise SystemExit(f"{path.name} has no fmt or data chunk this script can read")
    return channels, rate, frames


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="say what would move, and move nothing",
    )
    args = ap.parse_args()

    root = SOUNDS / "kits"
    moved, already = 0, 0
    for kit in KITS:
        dest = root / kit
        voices: dict[str, dict] = {}
        rate, channels = 0, 0
        for old_voice, voice, layer in MOVES:
            src = SOUNDS / f"kit_{kit}_{old_voice}.wav"
            out = dest / f"{voice}.{layer}.1.wav"
            if out.exists() and not src.exists():
                already += 1
            elif not src.exists():
                raise SystemExit(f"{src} is missing and {out} does not exist either")
            else:
                ch, sr, _ = wav_header(src)
                rate, channels = sr, ch
                print(f"  {src.name} -> kits/{kit}/{out.name}")
                if not args.dry_run:
                    dest.mkdir(parents=True, exist_ok=True)
                    out.write_bytes(src.read_bytes())
                    src.unlink()
                moved += 1
            entry = voices.setdefault(voice, {"layers": 0, "rr": 1, "trim_db": 0.0})
            entry["layers"] = max(entry["layers"], layer)
            if voice in PAN:
                entry["pan"] = PAN[voice]

        # The closed hat and the foot close the open one. Named here rather
        # than in the engine because a kit whose hats are two mics, or whose
        # "open hat" is a china, is entitled to disagree.
        voices["hat_open"]["choked_by"] = ["hat", "hat_pedal"]

        if not rate:
            # Nothing moved for this kit: read the rate off a file that is
            # already in place, so a re-run still writes a correct manifest.
            ch, sr, _ = wav_header(dest / "kick.1.1.wav")
            rate, channels = sr, ch

        manifest = {
            "id": kit,
            "name": NAMES[kit],
            "credit": CREDIT,
            "licence": LICENCE,
            "rate": rate,
            "channels": channels,
            "drive": DRIVE.get(kit, 1.0),
            "voices": voices,
        }
        # `ensure_ascii=False`: the credit line has an em dash in it, and a
        # manifest a person may open should read as the sentence it is
        # rather than as an escape.
        text = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
        print(f"  kits/{kit}/kit.json ({len(voices)} voices, {rate} Hz, {channels} ch)")
        if not args.dry_run:
            dest.mkdir(parents=True, exist_ok=True)
            (dest / "kit.json").write_text(text, encoding="utf-8")

    print(f"\n{moved} files moved, {already} already in place.")
    if args.dry_run:
        print("(dry run: nothing was written)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
