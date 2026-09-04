#!/usr/bin/env python3
"""Render the Yames mark to every icon the site and the app need.

    python scripts/make-icons.py

Writes the web icons under docs/ and the desktop app icons under
src-tauri/icons/, all from the same geometry as docs/favicon.svg, so the
tab, the dock and the installer can never drift apart.

No SVG rasteriser is available on this machine, so the shapes are
redrawn with Pillow at 8x and downsampled, which keeps the diagonals
clean. If you change docs/favicon.svg, change the constants below to
match — they are the same numbers in the same 64-unit viewBox.

Requires Pillow and numpy.
"""
import os

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")
APP = os.path.join(ROOT, "src-tauri", "icons")

VB = 64.0                 # favicon.svg viewBox
SS = 8                    # supersample factor
TILE_HI, TILE_LO = "#FFC24D", "#E8760C"
INK = "#0B0A14"
RADIUS = 15.0
STROKE = 8.0

WEB = {
    "apple-touch-icon.png": 180,   # iOS home screen
    "icon-192.png": 192,           # PWA / Android
    "icon-512.png": 512,           # PWA splash
    "favicon-32.png": 32,          # fallback for anything that won't take SVG
}

# Names come from src-tauri/tauri.conf.json's bundle.icon list.
APP_PNGS = {
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon.png": 256,
    "icon-1024.png": 1024,
}
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def render(size):
    W = size * SS
    K = W / VB
    px = lambda v: v * K

    # Tile gradient, matching the SVG's userSpaceOnUse vector (6,0)->(58,64).
    yy, xx = np.mgrid[0:W, 0:W]
    x0, y0, x1, y1 = px(6), px(0), px(58), px(64)
    dx, dy = x1 - x0, y1 - y0
    t = np.clip(((xx - x0) * dx + (yy - y0) * dy) / (dx * dx + dy * dy), 0, 1)[..., None]
    arr = np.array(hex_rgb(TILE_HI)) * (1 - t) + np.array(hex_rgb(TILE_LO)) * t
    tile = Image.fromarray(arr.astype(np.uint8), "RGB")

    # The Y, knocked through in ink.
    glyph = Image.new("L", (W, W), 0)
    gd = ImageDraw.Draw(glyph)
    sw = px(STROKE)
    pts = [(px(18), px(17)), (px(32), px(37)), (px(46), px(17))]
    gd.line(pts, fill=255, width=int(round(sw)), joint="curve")
    gd.line([(px(32), px(37)), (px(32), px(48))], fill=255, width=int(round(sw)))
    # Pillow adds neither round caps nor a round join.
    for (x, y) in pts + [(px(32), px(48))]:
        gd.ellipse([x - sw / 2, y - sw / 2, x + sw / 2, y + sw / 2], fill=255)

    out = tile.convert("RGBA")
    out.paste(Image.new("RGB", (W, W), hex_rgb(INK)), (0, 0), glyph)

    corner = Image.new("L", (W, W), 0)
    ImageDraw.Draw(corner).rounded_rectangle(
        [0, 0, W - 1, W - 1], radius=px(RADIUS), fill=255)
    out.putalpha(corner)

    return out.resize((size, size), Image.LANCZOS)


def main():
    for name, size in WEB.items():
        render(size).save(os.path.join(DOCS, name))
        print(f"  docs/{name}  {size}x{size}")

    if not os.path.isdir(APP):
        print("  (no src-tauri/icons — skipping the app icons)")
        return

    for name, size in APP_PNGS.items():
        render(size).save(os.path.join(APP, name))
        print(f"  src-tauri/icons/{name}  {size}x{size}")

    master = render(1024)

    # A real ICO with every size Windows asks for, rather than one big frame.
    master.save(os.path.join(APP, "icon.ico"),
                sizes=[(s, s) for s in ICO_SIZES])
    print(f"  src-tauri/icons/icon.ico  {ICO_SIZES}")

    # The previous icon.icns was a PNG with an .icns extension. This writes
    # an actual ICNS container.
    master.save(os.path.join(APP, "icon.icns"))
    with open(os.path.join(APP, "icon.icns"), "rb") as fh:
        assert fh.read(4) == b"icns", "icon.icns is not an ICNS container"
    print("  src-tauri/icons/icon.icns  (real ICNS)")


if __name__ == "__main__":
    main()
