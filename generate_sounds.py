"""Generate click WAV files for the metronome — multiple sound kits.

WARNING — THE LEGACY GENERATORS BELOW NO LONGER PRODUCE THE SHIPPED FILES.
Running this script with no arguments overwrites `click_*`, `wood_*`, `beep_*`,
`drum_*` and `chime_*` with files that are NOT what `src-tauri/sounds/` holds
and NOT what the app embeds. Measured on 2026-09-12, all twelve differ from the
tracked bytes, because `scripts/sounds/rebuild.py` has since removed their DC,
faded their tails (a truncated decay is a second, unintended click on every
beat) and added the beater to `drum_high`. `gen_wood` is also unseeded, so
`wood_high` / `wood_low` differ from run to run as well.

`scripts/sounds/rebuild.py` is the generator of record for those files, and
its module docstring is the history. This script is kept for the jam kits
below and for the record of how the originals were first made.

    python generate_sounds.py --kits    # jam kits only: safe, deterministic
    python generate_sounds.py           # ALSO rewrites the legacy files above
"""
import struct
import math
import sys
import os
import random
import zlib

def write_wav(filename: str, samples: list, sample_rate: int = 44100):
    """Write a list of float samples (-1..1) to a 16-bit mono WAV file."""
    num_samples = len(samples)
    data_size = num_samples * 2
    with open(filename, 'wb') as f:
        f.write(b'RIFF')
        f.write(struct.pack('<I', 36 + data_size))
        f.write(b'WAVE')
        f.write(b'fmt ')
        f.write(struct.pack('<I', 16))
        f.write(struct.pack('<H', 1))   # PCM
        f.write(struct.pack('<H', 1))   # mono
        f.write(struct.pack('<I', sample_rate))
        f.write(struct.pack('<I', sample_rate * 2))
        f.write(struct.pack('<H', 2))
        f.write(struct.pack('<H', 16))
        f.write(b'data')
        f.write(struct.pack('<I', data_size))
        for s in samples:
            clamped = max(-1.0, min(1.0, s))
            f.write(struct.pack('<h', int(clamped * 32767)))

def gen_click(freq: float, duration_ms: int = 25, sample_rate: int = 44100):
    """Original sine click with exponential decay."""
    n = int(sample_rate * duration_ms / 1000)
    out = []
    for i in range(n):
        t = i / sample_rate
        env = math.exp(-t * 80)
        s = math.sin(2 * math.pi * freq * t) * env
        if i < sample_rate * 0.002:
            s += (math.sin(2 * math.pi * freq * 3 * t) * 0.3) * env
        out.append(s)
    return out

def gen_wood(freq: float, duration_ms: int = 30, sample_rate: int = 44100):
    """Woodblock / clave — band-pass filtered noise burst + resonant tone."""
    n = int(sample_rate * duration_ms / 1000)
    out = []
    for i in range(n):
        t = i / sample_rate
        env = math.exp(-t * 120)
        tone = math.sin(2 * math.pi * freq * t) * 0.6
        # Noise component for that wooden transient
        noise = (random.random() * 2 - 1) * 0.4
        if i > sample_rate * 0.003:
            noise *= 0.05  # Kill noise quickly after initial transient
        s = (tone + noise) * env
        out.append(s)
    return out

def gen_beep(freq: float, duration_ms: int = 40, sample_rate: int = 44100):
    """Clean digital beep — pure sine with smooth envelope."""
    n = int(sample_rate * duration_ms / 1000)
    out = []
    attack = int(sample_rate * 0.002)
    release = int(sample_rate * 0.008)
    for i in range(n):
        t = i / sample_rate
        # Smooth attack / sustain / release
        if i < attack:
            env = i / attack
        elif i > n - release:
            env = (n - i) / release
        else:
            env = math.exp(-t * 30)
        s = math.sin(2 * math.pi * freq * t) * env
        out.append(s)
    return out

def gen_chime(direction: str = "up", sample_rate: int = 44100):
    """Two-tone chime for drill step transitions.
    'up' = ascending (C5→E5), 'down' = descending (E5→C5)."""
    freq1, freq2 = (523.25, 659.25) if direction == "up" else (659.25, 523.25)
    tone_ms = 60      # Each tone duration
    gap_ms = 20       # Gap between tones
    n_tone = int(sample_rate * tone_ms / 1000)
    n_gap = int(sample_rate * gap_ms / 1000)
    out = []
    for freq in [freq1, freq2]:
        attack = int(sample_rate * 0.002)
        release = int(sample_rate * 0.015)
        for i in range(n_tone):
            t = i / sample_rate
            if i < attack:
                env = i / attack
            elif i > n_tone - release:
                env = (n_tone - i) / release
            else:
                env = math.exp(-t * 20)
            s = math.sin(2 * math.pi * freq * t) * env
            # Add a soft harmonic for a bell-like quality
            s += math.sin(2 * math.pi * freq * 2 * t) * env * 0.15
            s += math.sin(2 * math.pi * freq * 3 * t) * env * 0.05
            out.append(s * 0.7)
        # Add gap between tones
        out.extend([0.0] * n_gap)
    return out

def gen_hihat(duration_ms: int = 60, sample_rate: int = 44100):
    """Closed hi-hat / metallic accent layer for drum kit.
    Inharmonic partials + broadband noise give a realistic metallic 'tsss'."""
    n = int(sample_rate * duration_ms / 1000)
    out = []
    # Inharmonic metallic partials (simulates cymbal alloy resonances)
    freqs = [7900, 9950, 12500, 15750, 19800]
    for i in range(n):
        t = i / sample_rate
        # Very fast attack (0.5ms), ~14ms half-life decay
        if t < 0.0005:
            env = t / 0.0005
        else:
            env = math.exp(-t * 50)
        noise = (random.random() * 2 - 1) * 0.6
        metallic = sum(math.sin(2 * math.pi * f * t) for f in freqs) / len(freqs) * 0.5
        s = (noise + metallic) * env
        s = math.tanh(s * 1.2) * 0.8
        out.append(s)
    return out

def gen_crash(duration_ms: int = 100, sample_rate: int = 44100):
    """Crash cymbal splash — mid-freq metallic wash for drum accent third layer.
    Lower, denser partials than the hi-hat give it a fuller cymbal quality."""
    n = int(sample_rate * duration_ms / 1000)
    out = []
    # Inharmonic partials spread across mid-high range (crash character vs hi-hat's sizzle)
    freqs = [2800, 3900, 5100, 6400, 8100, 10200, 12800]
    for i in range(n):
        t = i / sample_rate
        if t < 0.0008:
            env = t / 0.0008
        else:
            env = math.exp(-t * 18)  # Slower decay (~38ms half-life) vs hi-hat's 14ms
        noise = (random.random() * 2 - 1) * 0.5
        metallic = sum(math.sin(2 * math.pi * f * t) for f in freqs) / len(freqs) * 0.55
        s = (noise + metallic) * env
        s = math.tanh(s * 1.1) * 0.75
        out.append(s)
    return out

def gen_drum(is_kick: bool, duration_ms: int = 50, sample_rate: int = 44100):
    """Drum kit sounds for metronome.
    Accent (is_kick=True): Kick drum — sub-bass pitch sweep, punchy thump.
    Regular (is_kick=False): Snare hit — noise-heavy crack with fast decay."""
    out = []
    if is_kick:
        # === KICK DRUM ===
        # Realism comes from three layers:
        #   1. Sub-bass body (pitch sweep 150→52Hz, must be FAST — real kicks sweep in <10ms)
        #   2. Knock/punch component (~130Hz, faster decay) — the "weight" of the hit
        #   3. Beater click (2-6kHz tones + noise) — the most important for realism
        dur = 180  # ms
        n = int(sample_rate * dur / 1000)
        phase_sub = 0.0
        phase_knock = 0.0

        for i in range(n):
            t = i / sample_rate

            # 1. Sub-bass: pitch sweep 150 → 52Hz, completes in ~10ms (rate 280)
            freq_sub = 52 + 98 * math.exp(-t * 280)
            phase_sub += 2 * math.pi * freq_sub / sample_rate

            # 2. Knock: resonant mid-bass 160 → 90Hz, faster decay
            freq_knock = 90 + 70 * math.exp(-t * 200)
            phase_knock += 2 * math.pi * freq_knock / sample_rate

            # Amplitude envelope: instant attack, ~110ms decay for sub
            if t < 0.001:
                env_sub = t / 0.001
            else:
                env_sub = math.exp(-(t - 0.001) * 12)

            # Knock envelope: punchier, faster decay
            env_knock = math.exp(-t * 40)

            # 3. Beater/click: 3kHz + 5.5kHz tonal knock + broadband noise (first 8ms)
            beater = 0.0
            if t < 0.008:
                click_env = (1 - t / 0.008) ** 1.8
                beater = (
                    math.sin(2 * math.pi * 3000 * t) * 0.45 +
                    math.sin(2 * math.pi * 5500 * t) * 0.2 +
                    (random.random() * 2 - 1) * 0.35
                ) * click_env

            tone_sub = math.sin(phase_sub) * 0.8 + math.sin(phase_sub * 2) * 0.12
            tone_knock = math.sin(phase_knock) * 0.5

            s = tone_sub * env_sub + tone_knock * env_knock * 0.55 + beater * 0.85
            s = math.tanh(s * 1.35) * 0.88
            out.append(s)

    else:
        # === SNARE DRUM ===
        # Snare = mostly noise. Sine tones make it sound like a bell.
        # The "crack" is a broadband noise burst; the wire rattle is decaying noise.
        dur = 130  # ms
        n = int(sample_rate * dur / 1000)

        for i in range(n):
            t = i / sample_rate

            # Initial crack transient (first 4ms — very dense noise)
            crack = 0.0
            if t < 0.004:
                crack_env = (1 - t / 0.004) ** 1.5
                crack = (random.random() * 2 - 1) * crack_env * 0.9

            # Snare body noise (wire rattle + head) — decays over ~80ms
            body_env = math.exp(-t * 28)
            body_noise = (random.random() * 2 - 1) * body_env * 0.65

            # Low-frequency head thump — kept very short and quiet
            # (just enough to feel like something was hit, not a bell tone)
            head_env = math.exp(-t * 60)
            head = math.sin(2 * math.pi * 185 * t) * head_env * 0.18

            s = crack + body_noise + head
            s = math.tanh(s * 1.3) * 0.78
            out.append(s)
    return out

# ===========================================================================
# JAM KITS — kit_<kit>_<voice>.wav
#
# Four kits of eight voices for Jam mode (plans/JAM_MODE.md §4.1). Nothing
# here touches the generators above; these are new files under new names.
#
# WHY THIS SECTION DOES NOT USE THE GENERATORS ABOVE. The kits are built from
# the helpers in `scripts/sounds/rebuild.py`, because those helpers are what
# four rounds of "the snare is shy" / "the accent is a shout" actually taught,
# and every lesson is a lesson about where the energy sits:
#
#   1. ENERGY IN 200 Hz-4 kHz, OR A LAPTOP CANNOT REPRODUCE IT. `drum_high`
#      had 100% of its energy below 120 Hz and measured +0.2 dB over the plain
#      beat on the speaker people actually use. Every kick here carries a
#      mid-band body layer for that reason, and not a 6 ms beater: a transient
#      that short raises the PEAK almost 1:1 and adds almost no loudness,
#      which is the worst currency when the budget is peak.
#   2. BALANCE LAYERS BY ENERGY, NEVER BY PEAK. A sine has an 11 dB crest
#      factor and noise has 20, so normalising both to 1.0 hands the sine 9 dB
#      for free. That is how the snare accent became a sub-bass kick with a
#      whisper of snare on it.
#   3. LOUDNESS AT A FIXED PEAK COMES FROM DURATION. The first snare ended
#      while its wire tail was still at -36 dBFS: cut off rather than decayed.
#      A respectable peak and almost no loudness is what "shy" sounds like.
#   4. AN ACCENT IS THE SAME DRUM HIT HARDER, NOT A DIFFERENT DRUM. `snare_hi`
#      and `snare_lo` share their shell modes in every kit, so a bar is one
#      instrument played two ways and not a drum fill. Only what a player's
#      arm changes — ring decay, crack, stick, duration — differs.
#   5. SATURATE, DO NOT DIVIDE BY THE PEAK. tanh holds the ceiling while
#      keeping the loudness peak division throws away, and the harmonics it
#      makes from a sub-bass fundamental land where a small speaker works.
#   6. FADE THE TAIL AND REMOVE THE DC, or the truncation is a second click.
#
# Points 1-6 are `rebuild.py`'s module docstring in short form; read it before
# changing a number here. The engine-side measurement these files are checked
# against is `every_accent_is_louder_than_its_beat_on_a_small_speaker` in
# `src-tauri/src/engine.rs`; `scripts/sounds/measure_kits.py` reproduces it.
# ===========================================================================

KIT_SR = 44100

# Every file lands here exactly. The engine mixes and gains the voices, so the
# files carry timbre and duration and the engine carries balance — which is
# also why `snare_lo` is not pre-attenuated: "gain does the rest".
KIT_PEAK = 0.9

np = None   # bound by _load_kit_dsp()
_rb = None


def _load_kit_dsp():
    """Bind numpy and the measured DSP helpers from scripts/sounds/rebuild.py.

    Imported rather than copied. `_band` is the filter that shapes the bytes
    the app ships, and a second copy of it in this file would drift from the
    one the snare kit was tuned against — two band-passes that disagree by a
    dB are two kits that do not belong in the same app.

    Lazy, so the legacy generators above still run on the standard library
    alone on a machine with no numpy."""
    global np, _rb
    if _rb is not None:
        return
    import numpy
    here = os.path.dirname(os.path.abspath(__file__))
    scripts = os.path.join(here, 'scripts', 'sounds')
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    import rebuild
    np, _rb = numpy, rebuild


def _kseed(kit, voice, layer):
    """A stable seed per noise bed.

    `hash()` is salted per process and would make the bytes differ between
    runs; CRC-32 of the name is fixed forever, and naming the layer means two
    beds in one voice are never the same noise."""
    return zlib.crc32('{}/{}/{}'.format(kit, voice, layer).encode()) & 0x7FFFFFFF


def _knoise(kit, voice, layer, n, band, sr, decay):
    """One band-limited, exponentially decaying noise bed."""
    raw = _rb._noise(n, _kseed(kit, voice, layer))
    t = np.arange(n) / sr
    return _rb._band(raw, band[0], band[1], sr) * np.exp(-t * decay)


def _kroom(x, sr, amount):
    """Early reflections, kept inside the voice's own length.

    Four taps of a darkened copy of the hit. A room is mostly what it does to
    the first 50 ms; a longer tail would push every voice past the duration
    the engine schedules against, so anything later than the file is dropped
    rather than the file being lengthened. Darkened because a small room's
    reflections lose the top before they lose anything else."""
    if amount <= 0:
        return x
    dark = _rb._band(x, 200, 5000, sr)
    y = x.copy()
    for ms, g in ((13.0, 0.55), (23.0, 0.36), (37.0, 0.22), (53.0, 0.12)):
        d = int(sr * ms / 1000.0)
        if d >= len(x):
            break
        y[d:] += dark[: len(x) - d] * g * amount
    return y


def _krelease(x, frac=0.25):
    """A raised-cosine release over the last quarter of the voice.

    rebuild.py's point 1 is that a sample cut mid-decay steps to zero and the
    step is a second, unintended click on every hit; its answer was a 4 ms
    fade. That is enough for a sample already at -30 dBFS and it is NOT enough
    for a kick. Measured, these kicks reach the end of their allotted 130-180
    ms still at 8-12% of full scale, where 4 ms is a fifth of a cycle at 50 Hz
    — so the fade is itself an amplitude step, and it showed up as a DC offset
    an order of magnitude above every other voice.

    Raising the decay rate instead would have worked and would have cost the
    thump: the whole point of a low decay rate is that a kick sustains. A
    release lands the decay on true zero rather than cutting it there, over a
    window long enough to be a decay and far enough from the attack — where a
    kick actually lives — to be inaudible on it."""
    n = len(x)
    k = int(n * frac)
    if k < 2:
        return x
    y = x.copy()
    y[n - k:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, k)))
    return y


def _kfinish(y, sr, drive, room=0.0):
    """Room, then the release, then loudness, then the ceiling, then the tail.

    The order matters. The release goes before the normalisation so the DC it
    removes is gone before the peak is set; `_norm` to 1.0 so `drive` means
    the same thing in every voice; saturate for the loudness that peak
    division would throw away; `_norm` to KIT_PEAK so every file has the same
    ceiling and the engine's gains are the only thing separating two voices;
    fade last, on a tail that is now genuinely near zero, so the peak survives
    it."""
    y = _kroom(y, sr, room)
    y = _krelease(y)
    y = _rb._norm(y, 1.0)
    if drive > 0:
        y = _rb._saturate(y, drive, ceil=1.0)
    return _rb.fade_tail(_rb._norm(y, KIT_PEAK), sr)


# --- voices ----------------------------------------------------------------

def _kv_kick(spec, kit, sr):
    """Sub-bass sweep, shell modes, a mid-band body and a beater.

    The sweep is the pitch and the shell modes plus the body are the part a
    laptop radiates — point 1 above. A kick built from the sweep alone
    measures loud on headphones and disappears on the speaker most people
    practise on."""
    k = spec['kick']
    n = int(sr * k['ms'] / 1000)
    t = np.arange(n) / sr
    f0, f1, drop = k['sweep']
    freq = (f0 - f1) * np.exp(-t * drop) + f1
    y = np.sin(2 * np.pi * np.cumsum(freq) / sr) * _rb._hit(t, k['decay'], k['attack'])
    if k['modes']:
        shell = sum(
            np.sin(2 * np.pi * f * t) * _rb._hit(t, dec, 1.0) * g
            for f, dec, g in k['modes']
        )
        y = y + shell * k['mode_gain']
    band, dec, gain = k['body']
    y = y + _knoise(kit, 'kick', 'body', n, band, sr, dec) * gain
    band, dec, gain = k['click']
    y = y + _knoise(kit, 'kick', 'click', n, band, sr, dec) * gain
    return _kfinish(y, sr, k['drive'], spec['room'])


def _kv_snare(spec, kit, sr, hard):
    """ONE drum at two dynamics — point 4 above.

    `spec['shell']` is the drum's identity and is shared by both. What the
    dynamic changes is what an arm changes: how long the wires ring, how much
    crack comes off the head, how much stick is in the attack, and how long
    the hit lasts. `bursts` turns the crack layer into a hand clap, which is
    how the electronic kit gets a snare that is still the same instrument at
    both dynamics."""
    s = spec['snare']
    d = s['hi'] if hard else s['lo']
    tag = 'snare_hi' if hard else 'snare_lo'
    n = int(sr * d['ms'] / 1000)
    t = np.arange(n) / sr

    shell = sum(
        np.sin(2 * np.pi * f * t) * _rb._hit(t, dec, s['attack']) * g
        for f, dec, g in spec['shell']
    )
    ring = _knoise(kit, tag, 'ring', n, s['ring'], sr, d['ring_decay'])
    stick = _knoise(kit, tag, 'stick', n, s['stick'], sr, s['stick_decay'])

    if d.get('bursts'):
        crack = np.zeros(n)
        for j, (off_ms, g) in enumerate(d['bursts']):
            off = int(sr * off_ms / 1000.0)
            if off >= n:
                break
            one = _knoise(kit, tag, 'burst%d' % j, n, s['crack'], sr, s['burst_decay'])
            crack[off:] += one[: n - off] * g
    else:
        crack = _knoise(kit, tag, 'crack', n, s['crack'], sr, s['crack_decay'])

    y = shell * s['shell_gain'] + ring + crack * d['crack'] + stick * d['stick']
    return _kfinish(y, sr, d['drive'], spec['room'])


def _kv_hat(spec, kit, sr, is_open):
    """Air plus inharmonic partials. The partials are what stops a hi-hat
    being hiss; the 0.4 ms rise is what stops it being a step."""
    h = spec['hat_open'] if is_open else spec['hat']
    tag = 'hat_open' if is_open else 'hat'
    n = int(sr * h['ms'] / 1000)
    t = np.arange(n) / sr
    env = np.exp(-t * h['decay'])
    air = _knoise(kit, tag, 'air', n, h['band'], sr, h['decay'])
    metal = sum(np.sin(2 * np.pi * f * t) for f in h['partials']) / len(h['partials']) * env
    rise = np.clip(t / 0.0004, 0, 1)
    y = (air + metal * h['partial_gain']) * rise
    # Half the room of the drums: a cymbal is already mostly its own tail.
    return _kfinish(y, sr, h['drive'], spec['room'] * 0.5)


def _kv_ride(spec, kit, sr):
    """A ping over a wash. The ping is low, tonal and struck; the wash is the
    bow of the cymbal still moving underneath it, and it is where the length
    comes from."""
    r = spec['ride']
    n = int(sr * r['ms'] / 1000)
    t = np.arange(n) / sr
    ping = sum(
        np.sin(2 * np.pi * f * t) * _rb._hit(t, r['ping_decay'], 0.8) for f in r['ping']
    ) / len(r['ping'])
    wash = _knoise(kit, 'ride', 'wash', n, r['wash'], sr, r['wash_decay'])
    stick = _knoise(kit, 'ride', 'stick', n, r['stick'], sr, 320.0)
    y = ping * r['ping_gain'] + wash + stick * r['stick_gain']
    return _kfinish(y, sr, r['drive'], spec['room'] * 0.5)


def _kv_rim(spec, kit, sr):
    """Side-stick: short, and mid-forward WITHOUT being a woodblock.

    The app already shipped a side-stick that was 60 ms of 780 Hz wood, with
    48% of its energy in one place — so three beats in four sounded like the
    `wood` kit the user had not chosen. The energy here is spread over
    1-5 kHz noise with two quiet modes on top, so it reads as a stick on a
    rim rather than as a pitched block."""
    r = spec['rim']
    n = int(sr * r['ms'] / 1000)
    t = np.arange(n) / sr
    band, dec, gain = r['click']
    y = _knoise(kit, 'rim', 'click', n, band, sr, dec) * gain
    band, dec, gain = r['low']
    y = y + _knoise(kit, 'rim', 'low', n, band, sr, dec) * gain
    y = y + sum(
        np.sin(2 * np.pi * f * t) * _rb._hit(t, dec, 0.4) * g for f, dec, g in r['modes']
    )
    return _kfinish(y, sr, r['drive'], spec['room'] * 0.5)


def _kv_crash(spec, kit, sr):
    """A wide inharmonic wash with a noise attack on it. The partial series is
    geometric rather than harmonic on purpose: harmonic partials make a bell,
    and a crash is deliberately not one."""
    c = spec['crash']
    n = int(sr * c['ms'] / 1000)
    t = np.arange(n) / sr
    wash = _knoise(kit, 'crash', 'wash', n, c['wash'], sr, c['decay'])
    partials = (
        sum(np.sin(2 * np.pi * f * t) for f in c['partials'])
        / len(c['partials'])
        * np.exp(-t * c['decay'] * 0.85)
    )
    attack = _knoise(kit, 'crash', 'attack', n, (2000, 12000), sr, 180.0) * 0.5
    rise = np.clip(t / 0.0008, 0, 1)
    y = (wash + partials * c['partial_gain'] + attack) * rise
    return _kfinish(y, sr, c['drive'], spec['room'] * 0.6)


# --- the four kits ---------------------------------------------------------
#
# Read down a column rather than across a row: the same voice across four kits
# is where the kits differ from each other, and that is the comparison that
# matters when one of them sounds wrong.

KIT_SPECS = {
    # What the app's Drum kit already is, in a room. Medium decays, a real
    # shell under the kick, hats with some air in them.
    'room': {
        'room': 0.38,
        'kick': dict(
            ms=150, sweep=(150.0, 55.0, 44.0), decay=17.0, attack=1.5,
            modes=((210, 42, 0.90), (348, 58, 0.55), (620, 90, 0.30)), mode_gain=0.36,
            body=((250, 1400), 55.0, 0.70), click=((700, 4200), 165.0, 0.50), drive=1.3),
        # The shipped snare kit's own modes: this kit is the familiar one.
        'shell': ((196, 24, 1.00), (292, 32, 0.62), (421, 44, 0.34)),
        'snare': dict(
            shell_gain=0.60, attack=1.0, ring=(330, 8000), crack=(1100, 6500),
            stick=(2800, 9500), crack_decay=85.0, stick_decay=400.0,
            hi=dict(ms=200, ring_decay=20.0, crack=0.55, stick=0.30, drive=1.8),
            lo=dict(ms=150, ring_decay=42.0, crack=0.26, stick=0.12, drive=0.6)),
        'hat': dict(ms=60, band=(5500, 13000), decay=72.0,
                    partials=(6250, 8410, 10600, 13150), partial_gain=0.32, drive=0.8),
        'hat_open': dict(ms=300, band=(5200, 12500), decay=13.0,
                         partials=(6250, 8410, 10600, 13150), partial_gain=0.30, drive=0.8),
        'ride': dict(ms=350, ping=(440, 620, 905, 1210), ping_decay=8.0, ping_gain=0.60,
                     wash=(2600, 11000), wash_decay=6.0, stick=(3000, 9000),
                     stick_gain=0.38, drive=1.0),
        'rim': dict(ms=50, click=((1200, 5000), 260.0, 1.0), low=((400, 1200), 190.0, 0.28),
                    modes=((1720, 210, 0.45), (2630, 260, 0.26)), drive=1.2),
        'crash': dict(ms=600, partials=(360, 505, 715, 1010, 1430, 2020, 2860, 4050, 5730, 8100),
                      partial_gain=0.40, wash=(600, 14000), decay=7.0, drive=1.0),
    },
    # Dry and punchy: no room, every decay faster, the hats moved up a band so
    # 16ths stay separate instead of smearing into each other.
    'tight': {
        'room': 0.0,
        'kick': dict(
            ms=130, sweep=(170.0, 60.0, 60.0), decay=26.0, attack=1.0,
            modes=((230, 55, 0.90), (372, 72, 0.52), (660, 105, 0.28)), mode_gain=0.40,
            body=((260, 1600), 75.0, 0.72), click=((800, 4600), 190.0, 0.68), drive=1.4),
        'shell': ((210, 30, 1.00), (318, 40, 0.60), (455, 55, 0.32)),
        'snare': dict(
            shell_gain=0.58, attack=0.8, ring=(360, 8500), crack=(1200, 7000),
            stick=(3000, 10000), crack_decay=100.0, stick_decay=450.0,
            hi=dict(ms=170, ring_decay=30.0, crack=0.58, stick=0.34, drive=1.8),
            lo=dict(ms=130, ring_decay=46.0, crack=0.34, stick=0.18, drive=0.9)),
        'hat': dict(ms=50, band=(7000, 15000), decay=95.0,
                    partials=(7600, 9900, 12300, 15100), partial_gain=0.34, drive=0.9),
        'hat_open': dict(ms=230, band=(6600, 14500), decay=18.0,
                         partials=(7600, 9900, 12300, 15100), partial_gain=0.30, drive=0.9),
        'ride': dict(ms=260, ping=(520, 735, 1060, 1420), ping_decay=12.0, ping_gain=0.62,
                     wash=(3000, 12000), wash_decay=9.0, stick=(3500, 10000),
                     stick_gain=0.45, drive=1.0),
        'rim': dict(ms=42, click=((1400, 5600), 320.0, 1.0), low=((450, 1300), 220.0, 0.24),
                    modes=((1880, 250, 0.45), (2900, 300, 0.26)), drive=1.3),
        'crash': dict(ms=430, partials=(420, 590, 835, 1180, 1670, 2360, 3340, 4730, 6690, 9460),
                      partial_gain=0.38, wash=(700, 15000), decay=10.0, drive=1.0),
    },
    # Soft transients everywhere: a 5 ms rise on the kick instead of 1.5, the
    # snare's crack traded for a longer breathy ring, and a ride long enough
    # to carry the time on its own.
    'brushes': {
        'room': 0.30,
        'kick': dict(
            ms=170, sweep=(120.0, 50.0, 30.0), decay=15.0, attack=5.0,
            modes=((190, 36, 0.90), (312, 50, 0.55), (560, 80, 0.28)), mode_gain=0.45,
            # The click is nearly gone, but the body is NOT: a kick with no
            # mid band is a kick a laptop cannot play, however soft it is.
            # Measured, the first version of this kick sat 1.6 dB UNDER its own
            # hat through the band-pass — the softest kit is where this trap is
            # easiest to fall into, because "soft" is so nearly "absent".
            body=((200, 1300), 40.0, 0.85), click=((500, 2000), 110.0, 0.22), drive=1.3),
        'shell': ((188, 22, 1.00), (280, 30, 0.55), (404, 40, 0.28)),
        'snare': dict(
            shell_gain=0.42, attack=3.0, ring=(280, 6500), crack=(900, 5000),
            stick=(2200, 8000), crack_decay=55.0, stick_decay=260.0,
            hi=dict(ms=220, ring_decay=12.0, crack=0.34, stick=0.12, drive=1.7),
            lo=dict(ms=180, ring_decay=19.0, crack=0.20, stick=0.06, drive=0.9)),
        # Dark for a hi-hat, but not below the band a kick has to win in:
        # at (4000, 10000) the filter's half-octave skirt reached down to
        # 2.9 kHz and put most of this hat inside the 200 Hz-4 kHz measurement.
        'hat': dict(ms=65, band=(5000, 11500), decay=58.0,
                    partials=(5400, 7000, 8800, 10800), partial_gain=0.26, drive=0.7),
        'hat_open': dict(ms=330, band=(4600, 10500), decay=11.0,
                         partials=(5400, 7000, 8800, 10800), partial_gain=0.24, drive=0.7),
        'ride': dict(ms=400, ping=(400, 560, 820, 1100), ping_decay=6.0, ping_gain=0.55,
                     wash=(2200, 10000), wash_decay=5.0, stick=(2600, 8000),
                     stick_gain=0.26, drive=1.0),
        'rim': dict(ms=55, click=((1000, 4200), 200.0, 1.0), low=((350, 1100), 150.0, 0.32),
                    modes=((1560, 170, 0.40), (2380, 210, 0.24)), drive=1.0),
        'crash': dict(ms=700, partials=(320, 450, 635, 900, 1270, 1800, 2540, 3600, 5090, 7200),
                      partial_gain=0.36, wash=(500, 12500), decay=6.0, drive=0.9),
    },
    # 808-shaped. The kick is a long sine with a pitch drop and almost no
    # shell; the snare is a hand clap, which is four noise bursts 10 ms apart
    # at the accent and two at the plain beat — the same instrument, struck
    # once instead of by a room full of hands.
    'electronic': {
        'room': 0.0,
        'kick': dict(
            ms=180, sweep=(120.0, 45.0, 55.0), decay=11.0, attack=1.0,
            modes=(), mode_gain=0.0,
            # An 808 has no shell, so the only thing standing between this
            # kick and inaudibility on a laptop is the tick. It stays.
            body=((200, 900), 90.0, 0.50), click=((1200, 3500), 380.0, 0.45), drive=1.6),
        'shell': ((180, 40, 1.00), (270, 52, 0.40), (390, 70, 0.18)),
        'snare': dict(
            shell_gain=0.18, attack=0.6, ring=(900, 6000), crack=(1100, 4200),
            stick=(3000, 9000), crack_decay=190.0, stick_decay=500.0, burst_decay=190.0,
            hi=dict(ms=200, ring_decay=18.0, crack=0.95, stick=0.16, drive=1.8,
                    bursts=((0.0, 1.0), (10.0, 0.9), (20.0, 0.8), (31.0, 0.6))),
            lo=dict(ms=150, ring_decay=30.0, crack=0.62, stick=0.10, drive=0.9,
                    bursts=((0.0, 1.0), (12.0, 0.55)))),
        'hat': dict(ms=55, band=(9000, 16000), decay=110.0,
                    partials=(9700, 12100, 14800, 17300), partial_gain=0.22, drive=0.9),
        'hat_open': dict(ms=300, band=(8000, 15000), decay=14.0,
                         partials=(9700, 12100, 14800, 17300), partial_gain=0.20, drive=0.9),
        'ride': dict(ms=300, ping=(1180, 1690, 2410, 3270), ping_decay=14.0, ping_gain=0.55,
                     wash=(4000, 13000), wash_decay=11.0, stick=(4000, 11000),
                     stick_gain=0.40, drive=1.0),
        'rim': dict(ms=45, click=((1400, 4500), 420.0, 0.55), low=((600, 1600), 300.0, 0.18),
                    modes=((1700, 240, 1.00), (3400, 320, 0.22)), drive=1.1),
        'crash': dict(ms=550, partials=(480, 680, 960, 1360, 1920, 2720, 3850, 5440, 7700, 10900),
                      partial_gain=0.42, wash=(800, 15000), decay=8.0, drive=1.0),
    },
}

# Name → builder. The order is the order the files are written and reported.
KIT_VOICES = (
    ('kick', lambda s, k, sr: _kv_kick(s, k, sr)),
    ('snare_hi', lambda s, k, sr: _kv_snare(s, k, sr, True)),
    ('snare_lo', lambda s, k, sr: _kv_snare(s, k, sr, False)),
    ('hat', lambda s, k, sr: _kv_hat(s, k, sr, False)),
    ('hat_open', lambda s, k, sr: _kv_hat(s, k, sr, True)),
    ('ride', lambda s, k, sr: _kv_ride(s, k, sr)),
    ('rim', lambda s, k, sr: _kv_rim(s, k, sr)),
    ('crash', lambda s, k, sr: _kv_crash(s, k, sr)),
)


def generate_jam_kits(sounds_dir, sr=KIT_SR):
    """Write every kit_<kit>_<voice>.wav. Deterministic: seeded noise and
    arithmetic, no input files, so a rebuild produces the same bytes."""
    _load_kit_dsp()
    written = []
    for kit, spec in KIT_SPECS.items():
        for voice, build in KIT_VOICES:
            name = 'kit_{}_{}.wav'.format(kit, voice)
            path = os.path.join(sounds_dir, name)
            _rb.write(path, build(spec, kit, sr), sr)
            written.append(name)
        print('generated kit {}: {} voices'.format(kit, len(KIT_VOICES)))
    return written


if __name__ == '__main__':
    sounds_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src-tauri', 'sounds')
    os.makedirs(sounds_dir, exist_ok=True)

    # The original kits. See the warning at the top of this file: these no
    # longer produce the bytes the app ships, so --kits skips them.
    if '--kits' not in sys.argv:
        # Kit 1: Click (original)
        write_wav(os.path.join(sounds_dir, 'click_high.wav'), gen_click(1200, 25))
        write_wav(os.path.join(sounds_dir, 'click_low.wav'), gen_click(800, 20))

        # Kit 2: Woodblock
        write_wav(os.path.join(sounds_dir, 'wood_high.wav'), gen_wood(1800, 30))
        write_wav(os.path.join(sounds_dir, 'wood_low.wav'), gen_wood(1200, 25))

        # Kit 3: Digital beep
        write_wav(os.path.join(sounds_dir, 'beep_high.wav'), gen_beep(880, 40))
        write_wav(os.path.join(sounds_dir, 'beep_low.wav'), gen_beep(660, 35))

        # Kit 4: Drum kit
        random.seed(42)  # Reproducible noise
        write_wav(os.path.join(sounds_dir, 'drum_high.wav'), gen_drum(True, 150))
        write_wav(os.path.join(sounds_dir, 'drum_low.wav'), gen_drum(False, 80))
        write_wav(os.path.join(sounds_dir, 'drum_metal.wav'), gen_hihat(60))
        write_wav(os.path.join(sounds_dir, 'drum_crash.wav'), gen_crash(100))

        print("Generated all sound kits: click, wood, beep, drum")

        # Chime sounds for drill step transitions
        write_wav(os.path.join(sounds_dir, 'chime_up.wav'), gen_chime("up"))
        write_wav(os.path.join(sounds_dir, 'chime_down.wav'), gen_chime("down"))
        print("Generated chime sounds: chime_up, chime_down")

    # The jam kits. Additive: writes only kit_<kit>_<voice>.wav.
    generate_jam_kits(sounds_dir)
