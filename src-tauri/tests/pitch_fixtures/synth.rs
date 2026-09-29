//! The fixture generator: plucked strings, a click, and a WAV to look at.
//!
//! There is no real guitar recording in this repo and the owner's own data
//! directory is off limits, so the guitar fixtures are synthesised — and a
//! synthesised fixture is only worth anything if it is hard in the ways a
//! real recording is hard. A sine is not: every pitch tracker ever written
//! passes on sines. What actually breaks one is a signal with a strong
//! second harmonic (the octave error), partials that are not exact multiples
//! of the fundamental (inharmonicity), a broadband transient at the start of
//! every note, and a decay that takes the periodicity away while you are
//! still measuring it.
//!
//! So: extended Karplus–Strong. A delay line of filtered noise, a one-zero
//! loop filter, and a first-order all-pass for the fractional part of the
//! delay.
//!
//! * The **loop filter** `0.5·(x[n] + x[n−1])` is linear phase with a phase
//!   delay of exactly half a sample at every frequency, so it takes nothing
//!   away from the tuning while it damps the harmonics — which is what makes
//!   a plucked string get duller as it decays.
//! * The **all-pass** tunes the loop to a fractional length. Its phase delay
//!   falls with frequency, so the upper partials come out slightly sharp of
//!   exact multiples — which is the inharmonicity of a stiff string, arrived
//!   at the way a real string arrives at it rather than bolted on. At the
//!   FUNDAMENTAL its phase delay is its DC value to within a part in ten
//!   thousand (the deviation goes as ω², and 82 Hz at 44.1 kHz is ω = 0.012),
//!   so the note's own pitch is the pitch asked for.
//!   `every_synthesised_note_is_the_pitch_it_claims` measures that rather
//!   than taking this paragraph's word for it.
//! * The **attack** is the delay line's noise plus a separate decaying noise
//!   burst on top: the pick, the finger, the fret. This is the part that
//!   makes the first twenty milliseconds of every note unusable, and the
//!   reason `pitch.rs` blanks them.
//!
//! Everything here is deterministic — a seeded xorshift, no clock, no
//! `HashMap` iteration — so a fixture is the same bytes on every machine and
//! a failure is reproducible.

use std::f64::consts::PI;

/// xorshift64*, seeded. Deterministic noise, so two runs of the suite are
/// the same run.
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        // Never zero: xorshift is stuck there forever.
        Self(seed | 1)
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    /// Uniform in `[-1, 1)`.
    pub fn bipolar(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 52) as f64 * 2.0 - 1.0
    }
}

pub fn midi_to_hz(midi: f64) -> f64 {
    440.0 * 2f64.powf((midi - 69.0) / 12.0)
}

/// One plucked note.
///
/// `midi` may be fractional — that is how the detuned fixture is built, and
/// it is the difference between testing "the right note" and testing that
/// cents survive at all.
pub struct Pluck {
    pub midi: f64,
    pub secs: f64,
    /// Seconds to fall 60 dB. A wound low string rings longer than a plain
    /// high one, which the caller can say.
    pub decay_secs: f64,
    /// Peak level of the note.
    pub level: f32,
    pub seed: u64,
}

impl Pluck {
    pub fn new(midi: f64, secs: f64, seed: u64) -> Self {
        Self {
            midi,
            secs,
            decay_secs: 2.2,
            level: 0.7,
            seed,
        }
    }
}

/// Synthesise one pluck at `rate`.
pub fn pluck(p: &Pluck, rate: u32) -> Vec<f32> {
    let f0 = midi_to_hz(p.midi);
    let rate_f = rate as f64;
    let loop_len = rate_f / f0;

    // The loop filter eats half a sample of delay; the all-pass takes the
    // rest of the fraction. `frac` is kept in [0.5, 1.5) so the all-pass
    // coefficient stays small and its own transient is short.
    let after_lpf = loop_len - 0.5;
    let d = (after_lpf - 0.5).floor().max(2.0) as usize;
    let frac = after_lpf - d as f64;
    let ap_a = (1.0 - frac) / (1.0 + frac);

    // Loop gain for the decay asked for: the signal goes round `f0` times a
    // second and has to be 60 dB down after `decay_secs` of them.
    let g = 10f64.powf(-3.0 / (f0 * p.decay_secs).max(1.0));

    let mut rng = Rng::new(p.seed);
    // The delay line starts as noise with the very top taken off it — a
    // pluck excites a string over a finite width, not at a point, so the
    // initial displacement is not white.
    let mut line: Vec<f64> = Vec::with_capacity(d);
    let mut prev = 0.0;
    for _ in 0..d {
        let n = rng.bipolar();
        line.push((n + prev) * 0.5);
        prev = n;
    }

    let n_out = (rate_f * p.secs) as usize;
    let mut out = Vec::with_capacity(n_out);
    let mut read = 0usize;
    let (mut lpf_z, mut ap_x1, mut ap_y1) = (0.0f64, 0.0f64, 0.0f64);

    // The pick itself: broadband, gone in a few milliseconds, and loud
    // enough while it is there to drown the note that is starting.
    let burst_tau = 0.004 * rate_f;
    let mut burst_rng = Rng::new(p.seed ^ 0x9E37_79B9_7F4A_7C15);

    for i in 0..n_out {
        let x = line[read];
        out.push(x);

        let lp = g * 0.5 * (x + lpf_z);
        lpf_z = x;
        let ap = ap_a * lp + ap_x1 - ap_a * ap_y1;
        ap_x1 = lp;
        ap_y1 = ap;

        line[read] = ap;
        read = (read + 1) % d;

        // Added AFTER the loop write, so the burst is on the output and not
        // circulating in the string: a pick noise that fed back would be a
        // periodic signal at the note's own frequency and would flatter the
        // tracker rather than test it.
        let env = (-(i as f64) / burst_tau).exp();
        if env > 1e-4 {
            let n = out.len() - 1;
            out[n] += 0.55 * env * burst_rng.bipolar();
        }
    }

    // One peak normalisation per note, so `level` means what it says and a
    // fixture's balance does not depend on where the noise happened to land.
    let peak = out.iter().fold(0.0f64, |m, v| m.max(v.abs())).max(1e-12);
    let k = p.level as f64 / peak;
    out.iter().map(|v| (v * k) as f32).collect()
}

/// Lay a note into a buffer at `at_ms`, with a short fade at its end so a
/// note that is cut for the next one does not click.
pub fn place(buf: &mut Vec<f32>, note: &[f32], at_ms: f64, rate: u32, fade_ms: f64) {
    let start = (at_ms * rate as f64 / 1000.0).round() as usize;
    let need = start + note.len();
    if buf.len() < need {
        buf.resize(need, 0.0);
    }
    let fade = ((fade_ms * rate as f64 / 1000.0) as usize).min(note.len());
    for (i, s) in note.iter().enumerate() {
        let g = if fade > 1 && i >= note.len() - fade {
            let k = note.len() - i - 1;
            k as f32 / (fade - 1) as f32
        } else {
            1.0
        };
        buf[start + i] += s * g;
    }
}

/// A metronome click: a short tone burst with a fast decay. The accent is
/// higher, the way every click anyone has ever practised to is.
pub fn click(rate: u32, accent: bool, level: f32) -> Vec<f32> {
    let hz = if accent { 1500.0 } else { 1000.0 };
    let rate_f = rate as f64;
    let n = (rate_f * 0.030) as usize;
    let tau = 0.008 * rate_f;
    (0..n)
        .map(|i| {
            let env = (-(i as f64) / tau).exp();
            ((2.0 * PI * hz * i as f64 / rate_f).sin() * env) as f32 * level
        })
        .collect()
}

/// What a buffer's loudest sample is — the reference every relative level in
/// a fixture is quoted against.
pub fn peak(buf: &[f32]) -> f32 {
    buf.iter().fold(0.0f32, |m, v| m.max(v.abs()))
}

/// An INDEPENDENT measurement of a buffer's fundamental, used to check the
/// generator rather than the tracker.
///
/// Plain long-window autocorrelation over the steady part of the note, with
/// a parabolic refinement and nothing else — deliberately not the code under
/// test. If this and `pitch.rs` ever disagree about a fixture, one of them is
/// wrong and the fixture suite is the thing that says so.
pub fn measure_hz(buf: &[f32], rate: u32, expect_hz: f64) -> f64 {
    // Skip the attack; use a whole second of the steady part when there is
    // one, which at the lowest note here is thirty periods.
    let skip = (rate as f64 * 0.08) as usize;
    let want = (rate as f64 * 1.0) as usize;
    let seg: Vec<f64> = buf
        .iter()
        .skip(skip)
        .take(want)
        .map(|&v| v as f64)
        .collect();
    if seg.len() < 64 {
        return 0.0;
    }
    // Search within an octave of what was asked for: this is checking the
    // generator's tuning, not finding a pitch from nothing, and an
    // independent check that could itself fall an octave would be useless.
    let lo = ((rate as f64 / (expect_hz * 1.5)).floor() as usize).max(2);
    let hi = ((rate as f64 / (expect_hz / 1.5)).ceil() as usize).min(seg.len() / 2);
    let mut best = (lo, f64::NEG_INFINITY);
    let mut r = vec![0.0f64; hi + 2];
    for tau in lo..=hi {
        let mut s = 0.0;
        for j in 0..(seg.len() - tau) {
            s += seg[j] * seg[j + tau];
        }
        // Normalised, so a longer lag is not penalised for having fewer
        // terms in it.
        let n = (seg.len() - tau) as f64;
        r[tau] = s / n;
        if r[tau] > best.1 {
            best = (tau, r[tau]);
        }
    }
    let t = best.0;
    let tau = if t > lo && t < hi {
        let (s0, s1, s2) = (r[t - 1], r[t], r[t + 1]);
        let curve = s0 - 2.0 * s1 + s2;
        let delta = if curve.abs() > 1e-18 {
            (0.5 * (s0 - s2) / curve).clamp(-1.0, 1.0)
        } else {
            0.0
        };
        t as f64 + delta
    } else {
        t as f64
    };
    rate as f64 / tau
}

/// Write a mono 16-bit WAV, for eyeballing a fixture with `pitch-inspect`.
/// Only ever called when `DUMP_FIXTURE_WAVS=1`; the suite itself never
/// touches the disk.
pub fn write_wav(path: &std::path::Path, samples: &[f32], rate: u32) -> std::io::Result<()> {
    use std::io::Write;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let data_len = (samples.len() * 2) as u32;
    let mut out = Vec::with_capacity(44 + data_len as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&rate.to_le_bytes());
    out.extend_from_slice(&(rate * 2).to_le_bytes()); // byte rate
    out.extend_from_slice(&2u16.to_le_bytes()); // block align
    out.extend_from_slice(&16u16.to_le_bytes()); // bits
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for s in samples {
        out.extend_from_slice(&((s.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes());
    }
    std::fs::File::create(path)?.write_all(&out)
}
