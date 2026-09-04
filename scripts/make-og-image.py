#!/usr/bin/env python3
"""Render docs/og-image.png — the card shown wherever yames.app is shared.

    python scripts/make-og-image.py

Composed rather than screenshotted: link previews are usually seen small,
so this is a headline plus one product shot, not a page capture. It uses
the same faces as the site (Bricolage Grotesque + Manrope), downloaded
into a local cache on first run.

Requires Pillow and numpy.  After changing the hero copy in
docs/index.html, re-run this so the card does not drift out of step —
and bump the ?v= on og:image / twitter:image in docs/index.html so the
social platforms re-fetch instead of serving the cached old card.
"""
import os
import sys
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "og-image.png")
# The product shot is chosen by the palette, below.
CACHE = os.path.join(ROOT, "node_modules", ".cache", "og-fonts")

W, H = 1200, 630

# Keyed to the site's landing palette. Pass a theme name as argv[1] to
# render a different one; keep the default in step with LANDING_THEME in
# docs/site.js, or the shared card and the page will disagree.
PALETTES = {
    "obsidian": dict(
        bg=("#1E1108", "#0A0503"),
        a1="#FFC24D", a2="#FF6BA6", a3="#A98BFF",
        ink="#F7F0EA", dim="#CDB5A8",
        shot="obsidian-metronome.webp", edge=(245, 158, 11, 130),
        glow=(210, 120, 20, 150),
    ),
    "aurora": dict(
        bg=("#150C33", "#08041B"),
        a1="#22DCFF", a2="#FF3D8A", a3="#8B5CF6",
        ink="#F2EFFA", dim="#B4AED0",
        shot="aurora-metronome.webp", edge=(34, 220, 255, 110),
        glow=(0, 140, 220, 150),
    ),
}
THEME = sys.argv[1] if len(sys.argv) > 1 else "obsidian"
if THEME not in PALETTES:
    sys.exit(f"unknown theme {THEME!r}; try: {', '.join(PALETTES)}")
P = PALETTES[THEME]

BG_A, BG_B = P["bg"]
CYAN, VIOLET, PINK = P["a1"], P["a3"], P["a2"]
INK, DIM = P["ink"], P["dim"]

# Pinned static instances of the site's two families.
FONTS = {
    "display": ("Bricolage-ExtraBold.ttf",
                "https://fonts.gstatic.com/s/bricolagegrotesque/v9/3y9U6as8bTXq_nANBjzKo3Ie"
                "Zx8z6up5BeSl5jBNz_19PpbpMXuECpwUxJBOm_OJWiaaD30YfKfjZZoLvZvlyM0.ttf"),
    "body": ("Manrope-Regular.ttf",
             "https://fonts.gstatic.com/s/manrope/v20/xn7_YHE41ni1AdIRqAuZuw1Bx9mbZk79FO_F.ttf"),
    "body-bold": ("Manrope-Bold.ttf",
                  "https://fonts.gstatic.com/s/manrope/v20/xn7_YHE41ni1AdIRqAuZuw1Bx9mbZk4aE-_F.ttf"),
}


def font_path(kind):
    name, url = FONTS[kind]
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print(f"  fetching {name}…")
        try:
            urllib.request.urlretrieve(url, path)
        except Exception as exc:
            sys.exit(f"could not download {name}: {exc}\n"
                     f"Put the file at {path} by hand and re-run.")
    return path


def font(kind, size):
    return ImageFont.truetype(font_path(kind), size)


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ── Ground ───────────────────────────────────────────────────────────
yy, xx = np.mgrid[0:H, 0:W]
t = np.clip((xx / W) * 0.45 + (yy / H) * 0.55, 0, 1)[..., None]
bg = np.array(hex_rgb(BG_A)) * (1 - t) + np.array(hex_rgb(BG_B)) * t

# The site's drifting glows, held still.
for cx, cy, rad, col, amp in [
    (0.18 * W, 0.26 * H, 0.62 * W, CYAN, 0.30),
    (0.86 * W, 0.16 * H, 0.55 * W, PINK, 0.24),
    (0.60 * W, 0.95 * H, 0.60 * W, VIOLET, 0.22),
]:
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / rad
    a = (np.clip(1 - dist, 0, 1) ** 1.7)[..., None] * amp
    bg = bg * (1 - a) + np.array(hex_rgb(col)) * a

img = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8), "RGB")
d = ImageDraw.Draw(img)
PAD = 68

# ── Wordmark ─────────────────────────────────────────────────────────
d.text((PAD, PAD - 10), "yames", font=font("display", 46), fill=hex_rgb(INK))

# ── Headline, sized to its column so it can never run under the shot ──
COL = 600
L1, L2A, L2B = "Finally, a metronome", "you ", "won't skip."
size = 78
while size > 34:
    f_head = font("display", size)
    if (d.textlength(L1, font=f_head) <= COL
            and d.textlength(L2A + L2B, font=f_head) <= COL):
        break
    size -= 2
LH = int(size * 1.02)           # display face, tight leading
TOP = 172

d.text((PAD, TOP), L1, font=f_head, fill=hex_rgb(INK))
d.text((PAD, TOP + LH), L2A, font=f_head, fill=hex_rgb(INK))
w_you = d.textlength(L2A, font=f_head)

# Gradient fill on the emphasised words, via a mask.
tw = int(d.textlength(L2B, font=f_head)) + 12
th = int(size * 1.6)
strip = Image.new("L", (tw, th), 0)
ImageDraw.Draw(strip).text((0, 0), L2B, font=f_head, fill=255)
gx = np.linspace(0, 1, tw)[None, :].repeat(th, 0)[..., None]
grad = np.array(hex_rgb(CYAN)) * (1 - gx) + np.array(hex_rgb(PINK)) * gx
img.paste(Image.fromarray(grad.astype(np.uint8), "RGB"), (PAD + int(w_you), TOP + LH), strip)

# ── Subhead ──────────────────────────────────────────────────────────
f_sub = font("body", 25)
SUB = TOP + LH * 2 + 44
for i, line in enumerate([
    "Timing you can trust for a whole session.",
    "Ten themes, seven live visuals.",
    "Free and open source.",
]):
    d.text((PAD, SUB + i * 36), line, font=f_sub, fill=hex_rgb(DIM))

d.text((PAD, H - 84), "macOS  ·  Windows  ·  Linux",
       font=font("body-bold", 22), fill=hex_rgb(CYAN))

# ── Product shot, angled in from the right ───────────────────────────
try:
    shot = Image.open(os.path.join(
        ROOT, "docs", "img", "metronome", P["shot"])).convert("RGB")
    sw = 520
    sh = int(shot.height * sw / shot.width)
    shot = shot.resize((sw, sh), Image.LANCZOS)

    card = Image.new("RGBA", (sw + 4, sh + 4), (0, 0, 0, 0))
    rounded = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(rounded).rounded_rectangle([0, 0, sw - 1, sh - 1], radius=16, fill=255)
    card.paste(shot, (2, 2), rounded)
    ImageDraw.Draw(card).rounded_rectangle(
        [2, 2, sw + 1, sh + 1], radius=16, outline=P["edge"], width=2)
    card = card.rotate(-7, resample=Image.BICUBIC, expand=True)

    gx0, gy0 = W - 470, 132
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle(
        [gx0 + 30, gy0 + 40, gx0 + card.width - 30, gy0 + card.height - 20],
        radius=40, fill=P["glow"])
    img = Image.alpha_composite(img.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(52)))
    img.paste(card, (gx0, gy0), card)
except OSError as exc:
    print(f"  (no product shot: {exc})")

img.convert("RGB").save(OUT, quality=92)
print(f"wrote {OUT} at {W}x{H} ({THEME})")
