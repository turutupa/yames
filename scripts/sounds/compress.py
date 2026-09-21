#!/usr/bin/env python3
"""Compress the shipped sample banks to FLAC, losslessly.

Nine minutes of audio across four hundred and ten files was seventy
megabytes as uncompressed WAV and is thirty-one as FLAC — forty-one fewer
megabytes compiled into the binary, and it costs nothing at all in sound:
FLAC is lossless, so the decoder hands the engine back the same samples, bit
for bit. `kit/tests.rs` proves it the honest way,
by leaving every measurement fixture unbaked and passing anyway.

    python scripts/sounds/compress.py            # compress and delete the WAVs
    python scripts/sounds/compress.py --dry-run  # say what it would do
    python scripts/sounds/compress.py --keep     # leave the WAVs in place

Run this after regenerating a bank. The render pipeline writes WAV, the
loader reads WAV and FLAC equally on purpose (a musician's own folder of
hits is a WAV folder), and so a regenerated kit dropped in uncompressed
would work perfectly and quietly put forty megabytes back into the
installer. `the_banks_the_app_ships_are_compressed` is the test that
notices; this is the one command that fixes it.

NOT the metronome's own clicks in `src-tauri/sounds/*.wav`. Those are
`include_bytes!` by name in `engine.rs` and decoded by rodio, which this
project builds without a FLAC feature — and they are 28 files under half a
megabyte between them, so there is nothing there to win.

Needs `ffmpeg` on PATH.
"""

import argparse
import pathlib
import shutil
import subprocess
import sys

# The three folders `build.rs` embeds and `kit.rs` decodes. The loose WAVs
# beside them are the clicks, and are deliberately not in this list.
BANKS = ("kits", "voices", "perc")
ROOT = pathlib.Path(__file__).resolve().parents[2] / "src-tauri" / "sounds"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="say what it would do")
    ap.add_argument("--keep", action="store_true", help="leave the WAVs in place")
    args = ap.parse_args()

    if shutil.which("ffmpeg") is None:
        print("ffmpeg is not on PATH, and it is what does the encoding.", file=sys.stderr)
        return 2

    wavs = sorted(w for b in BANKS for w in (ROOT / b).rglob("*.wav"))
    if not wavs:
        print("Every shipped bank is already FLAC — nothing to do.")
        return 0

    before = after = 0
    for wav in wavs:
        flac = wav.with_suffix(".flac")
        rel = wav.relative_to(ROOT)
        if args.dry_run:
            print(f"  would compress {rel}")
            continue
        # -compression_level 12 is the slowest and smallest setting, and the
        # decoded samples are identical at every level — the level only
        # decides how hard the encoder looks for a shorter way to say them.
        run = subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-y",
             "-i", str(wav), "-c:a", "flac", "-compression_level", "12", str(flac)],
            capture_output=True, text=True,
        )
        if run.returncode != 0 or not flac.exists():
            print(f"  FAILED {rel}: {run.stderr.strip()}", file=sys.stderr)
            return 1
        before += wav.stat().st_size
        after += flac.stat().st_size
        if not args.keep:
            wav.unlink()
        print(f"  {rel} -> {flac.name}")

    if args.dry_run:
        print(f"\n{len(wavs)} file(s) would be compressed.")
        return 0
    saved = before - after
    print(
        f"\n{len(wavs)} file(s): {before / 1048576:.1f} MB -> {after / 1048576:.1f} MB "
        f"({saved / 1048576:.1f} MB saved, {100 * saved / before:.0f}%). "
        "Same samples, bit for bit."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
