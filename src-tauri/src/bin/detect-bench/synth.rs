//! A six-string plucked-string synth with playing techniques, and the capture
//! chains it is heard through. The bench's signal source.
//!
//! Synthetic means synthetic: this is an extended Karplus-Strong model, not a
//! guitar. It exists so that every technique a tab can write has audio with
//! exact ground truth, through chains that roughly stand for a DI, a high-gain
//! DI, a laptop microphone and a phone. It says what the detection code does
//! on signals built to be hard in the ways those techniques are hard, the same
//! way every run (fixed seeds), so a regression is a number that moved. It
//! says nothing final about a real rig: the public datasets and the owner's
//! recordings do that (`plans/detection/MEASURE.md`).
//!
//! Ported from the research prototype (`prototypes/bench/guitar_synth.py`).
//! Per string: a delay line whose length follows a per-sample f0 curve, a
//! one-pole loop low-pass and a per-sample loop gain.
//!   pick          a filtered noise burst one period long, plus a 2 ms click
//!   hammer / tap  no burst: the length jumps, the loop loses a little energy
//!                 and a small low thump is added
//!   pull-off      the length jumps down and a weak pluck is added
//!   slide         the f0 curve steps through the frets in between
//!   bend/vibrato  the f0 curve moves continuously (release and pre-bend too)
//!   palm mute     heavy loop loss and a darker loop filter
//!   dead note     a pick on a string that is damped at once
//!   harmonic      a long, bright-filtered, nearly sinusoidal ring

use yames_lib::detect::fft::convolve_same_len;

pub const SR: u32 = 48_000;
const SRF: f64 = SR as f64;
pub const STANDARD_TUNING: [i32; 6] = [64, 59, 55, 50, 45, 40];

pub fn midi_hz(m: f64) -> f64 {
    440.0 * 2f64.powf((m - 69.0) / 12.0)
}

/// xorshift64*, so every run of the bench is the same run.
#[derive(Clone)]
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        let mut r = Rng(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ 0xD1B5_4A32_D192_ED03);
        for _ in 0..8 {
            r.next();
        }
        r
    }
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        if self.0 == 0 {
            self.0 = 0x2545_F491_4F6C_DD1D;
        }
        self.0.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
    /// 0..1
    pub fn unit(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64
    }
    pub fn uniform(&mut self, lo: f64, hi: f64) -> f64 {
        lo + (hi - lo) * self.unit()
    }
    pub fn normal(&mut self) -> f64 {
        let (a, b) = (self.unit().max(1e-12), self.unit());
        (-2.0 * a.ln()).sqrt() * (2.0 * std::f64::consts::PI * b).cos()
    }
}

/// One written note as it is actually played.
#[derive(Debug, Clone)]
pub struct Note {
    pub t: f64,
    pub dur: f64,
    /// 1..6
    pub string: u8,
    pub midi: f64,
    pub tech: Vec<String>,
    pub vel: f64,
    /// Level of a hammer/pull/tap against a pick.
    pub legato_strength: f64,
    pub bend: f64,
    pub bend_ms: f64,
    pub release: bool,
    pub prebend: bool,
    pub slide_from: Option<f64>,
    pub slide_ms: f64,
    pub vibrato_cents: f64,
    pub ring: bool,
    pub present: bool,
}

impl Note {
    fn has(&self, t: &str) -> bool {
        self.tech.iter().any(|x| x == t)
    }
}

// ---------------------------------------------------------------- filters

#[derive(Clone, Copy)]
struct Biquad {
    b: [f64; 3],
    a: [f64; 2],
}

impl Biquad {
    fn low(fc: f64, q: f64) -> Self {
        let w = 2.0 * std::f64::consts::PI * (fc / SRF).min(0.49);
        let (s, c) = w.sin_cos();
        let alpha = s / (2.0 * q);
        let a0 = 1.0 + alpha;
        Self { b: [(1.0 - c) / 2.0 / a0, (1.0 - c) / a0, (1.0 - c) / 2.0 / a0], a: [-2.0 * c / a0, (1.0 - alpha) / a0] }
    }
    fn high(fc: f64, q: f64) -> Self {
        let w = 2.0 * std::f64::consts::PI * (fc / SRF).min(0.49);
        let (s, c) = w.sin_cos();
        let alpha = s / (2.0 * q);
        let a0 = 1.0 + alpha;
        Self { b: [(1.0 + c) / 2.0 / a0, -(1.0 + c) / a0, (1.0 + c) / 2.0 / a0], a: [-2.0 * c / a0, (1.0 - alpha) / a0] }
    }
    fn run(&self, x: &mut [f64]) {
        let (mut x1, mut x2, mut y1, mut y2) = (0.0, 0.0, 0.0, 0.0);
        for v in x.iter_mut() {
            let y = self.b[0] * *v + self.b[1] * x1 + self.b[2] * x2 - self.a[0] * y1 - self.a[1] * y2;
            x2 = x1;
            x1 = *v;
            y2 = y1;
            y1 = y;
            *v = y;
        }
    }
}

const BUTTER_Q: f64 = std::f64::consts::FRAC_1_SQRT_2;

/// First-order low-pass (bilinear), as `butter(1, fc)`.
fn one_pole_low(x: &mut [f64], fc: f64) {
    let k = (std::f64::consts::PI * (fc / SRF).min(0.49)).tan();
    let (b, a) = (k / (1.0 + k), (k - 1.0) / (1.0 + k));
    let (mut x1, mut y1) = (0.0, 0.0);
    for v in x.iter_mut() {
        let y = b * (*v + x1) - a * y1;
        x1 = *v;
        y1 = y;
        *v = y;
    }
}

fn low2(x: &mut [f64], fc: f64) {
    Biquad::low(fc, BUTTER_Q).run(x);
}
fn high2(x: &mut [f64], fc: f64) {
    Biquad::high(fc, BUTTER_Q).run(x);
}

/// A noise burst `n` long, low-passed, zero mean, peak 1.
fn burst(rng: &mut Rng, n: usize, cutoff: f64) -> Vec<f64> {
    let mut x: Vec<f64> = (0..n).map(|_| rng.uniform(-1.0, 1.0)).collect();
    if n > 8 {
        one_pole_low(&mut x, cutoff);
    }
    let mean = x.iter().sum::<f64>() / n.max(1) as f64;
    let mut peak = 1e-9f64;
    for v in x.iter_mut() {
        *v -= mean;
        peak = peak.max(v.abs());
    }
    x.iter_mut().for_each(|v| *v /= peak);
    x
}

fn string_loop(f0: &[f64], exc: &[f64], gain: &[f64], lp: &[f64], out: &mut [f64]) {
    const SIZE: usize = 2048;
    let mut buf = [0.0f64; SIZE];
    let mut w = 0usize;
    let mut y_lp = 0.0;
    for i in 0..f0.len() {
        let f = f0[i];
        let y;
        if f <= 0.0 {
            y = exc[i];
            y_lp = 0.0;
        } else {
            // the loop filter costs about half a sample
            let d = (SRF / f - 0.5).clamp(2.0, (SIZE - 4) as f64);
            let di = d as usize;
            let frac = d - di as f64;
            let r0 = (w + SIZE - di) % SIZE;
            let r1 = (w + SIZE - di - 1) % SIZE;
            let x = buf[r0] * (1.0 - frac) + buf[r1] * frac;
            let a = lp[i];
            y_lp = (1.0 - a) * x + a * y_lp;
            y = exc[i] + gain[i] * y_lp;
        }
        buf[w] = y;
        w = (w + 1) % SIZE;
        out[i] += y;
    }
}

fn smooth_step(x: f64) -> f64 {
    0.5 - 0.5 * (std::f64::consts::PI * x.clamp(0.0, 1.0)).cos()
}

/// The dry sum of the six strings, mono.
pub fn render_strings(notes: &[Note], seconds: f64, seed: u64) -> Vec<f64> {
    let mut rng = Rng::new(seed);
    let n = (seconds * SRF) as usize;
    let mut mix = vec![0.0; n];
    let mut click = vec![0.0; n];
    for s in 1..=6u8 {
        let mut mine: Vec<&Note> = notes.iter().filter(|x| x.string == s && x.present).collect();
        if mine.is_empty() {
            continue;
        }
        mine.sort_by(|a, b| a.t.total_cmp(&b.t));
        let mut f0 = vec![0.0; n];
        let mut exc = vec![0.0; n];
        let mut gain = vec![0.0; n];
        let mut lp = vec![0.35; n];
        for (k, note) in mine.iter().enumerate() {
            let i0 = (note.t * SRF).round().max(0.0) as usize;
            if i0 >= n {
                continue;
            }
            let nxt = if k + 1 < mine.len() { mine[k + 1].t } else { seconds };
            let held_end = (note.t + note.dur).min(nxt);
            let sound_end = if note.ring { nxt } else { held_end };
            let i_end = ((sound_end * SRF).round() as usize).min(n).max(i0);
            let i_next = ((nxt * SRF).round() as usize).min(n).max(i0);
            let f_note = midi_hz(note.midi);

            // --- pitch curve over the life of the note
            let bend_s = note.bend_ms / 1000.0;
            let slide_s = note.slide_ms / 1000.0;
            let steps = note.slide_from.map(|from| (note.midi - from).round()).unwrap_or(0.0);
            for i in i0..i_next {
                let span = (i - i0) as f64 / SRF;
                let mut cents = 0.0;
                if note.bend > 0.0 {
                    let shape = smooth_step(span / bend_s);
                    if note.prebend {
                        cents += note.bend * 100.0 * (1.0 - shape);
                    } else if note.release {
                        let half = ((held_end - note.t) / 2.0).max(1e-3);
                        cents += note.bend * 100.0 * (shape - smooth_step((span - half) / bend_s));
                    } else {
                        cents += note.bend * 100.0 * shape;
                    }
                }
                if note.vibrato_cents > 0.0 {
                    let depth = ((span - 0.12) / 0.15).clamp(0.0, 1.0);
                    cents += note.vibrato_cents * depth * (2.0 * std::f64::consts::PI * 5.5 * span).sin();
                }
                if steps != 0.0 {
                    // fret by fret: the pitch moves in semitone steps
                    let frac = (span / slide_s).clamp(0.0, 1.0);
                    let pos = (frac * steps.abs() + 1e-9).floor().min(steps.abs());
                    cents += -100.0 * steps.signum() * (steps.abs() - pos);
                }
                f0[i] = f_note * 2f64.powf(cents / 1200.0);
            }

            // --- loop gain and brightness
            let (mut sustain, mut bright): (f64, f64) = (if note.midi < 52.0 { 0.9985 } else if note.midi < 64.0 { 0.998 } else { 0.9972 }, 0.30);
            if note.has("palmMute") {
                (sustain, bright) = (0.972, 0.72);
            }
            if note.has("dead") {
                (sustain, bright) = (0.90, 0.80);
            }
            if note.has("harmonic") {
                (sustain, bright) = (0.9992, 0.55);
            }
            gain[i0..i_end].iter_mut().for_each(|g| *g = sustain);
            lp[i0..i_next].iter_mut().for_each(|g| *g = bright);
            // the finger comes off or the hand damps: gone in about 15 ms
            gain[i_end..i_next].iter_mut().for_each(|g| *g = 0.90);

            // --- how the note starts
            let period = ((SRF / f_note).round() as usize).max(2);
            let room = i_next - i0;
            let previous_sounding = k > 0 && (mine[k - 1].ring || mine[k - 1].t + mine[k - 1].dur >= note.t - 0.03);
            let legato_tech = note.has("hammer") || note.has("pull") || note.has("tap") || note.has("slide");
            let legato = legato_tech && previous_sounding;
            let from_nowhere = (note.has("hammer") || note.has("tap")) && !previous_sounding;
            if legato && note.has("slide") && note.slide_from.is_some() {
                // the string keeps sounding; a little friction, a little loss
                let m = room.min((slide_s * SRF) as usize);
                for i in i0..i0 + m {
                    gain[i] = sustain.min(0.994);
                    exc[i] += 0.01 * note.vel * rng.uniform(-1.0, 1.0);
                }
            } else if legato {
                let strength = note.legato_strength * note.vel;
                let keep = (period * 2).min(room);
                // the string loses energy when its length changes under a finger
                let loss = if note.has("pull") { 0.72 } else { 0.80 };
                gain[i0..i0 + keep].iter_mut().for_each(|g| *g = sustain * loss);
                if note.has("pull") {
                    let m = period.min(room);
                    let b = burst(&mut rng, m, 2500.0);
                    for j in 0..m {
                        exc[i0 + j] += 0.5 * strength * b[j];
                    }
                } else {
                    let m = ((0.004 * SRF) as usize).min(room);
                    let b = burst(&mut rng, m, 900.0);
                    for j in 0..m {
                        let hann = 0.5 - 0.5 * (2.0 * std::f64::consts::PI * j as f64 / (m.max(2) - 1) as f64).cos();
                        exc[i0 + j] += 0.9 * strength * b[j] * hann;
                    }
                    // the finger landing also drives the new length directly
                    let m2 = period.min(room);
                    let b2 = burst(&mut rng, m2, 1800.0);
                    for j in 0..m2 {
                        exc[i0 + j] += 0.35 * strength * b2[j];
                    }
                }
            } else if from_nowhere {
                let strength = note.legato_strength.max(0.25) * note.vel;
                let m = period.min(room);
                let b = burst(&mut rng, m, 1500.0);
                for j in 0..m {
                    exc[i0 + j] += 0.8 * strength * b[j];
                }
                if room > 0 {
                    gain[i0] = 0.0;
                }
            } else {
                // picked: the old note on this string stops, a burst starts the new
                let cutoff = if note.has("palmMute") { 1800.0 } else if note.has("harmonic") { 2500.0 } else { 4200.0 };
                let m = period.min(room);
                let b = burst(&mut rng, m, cutoff);
                for j in 0..m {
                    exc[i0 + j] += note.vel * b[j];
                }
                if room > 0 {
                    gain[i0] = 0.0; // the pick stops the string for an instant
                }
                let c = ((0.002 * SRF) as usize).min(n - i0);
                for j in 0..c {
                    click[i0 + j] += 0.12 * note.vel * rng.uniform(-1.0, 1.0) * (1.0 - j as f64 / (c.max(2) - 1) as f64);
                }
            }
        }
        string_loop(&f0, &exc, &gain, &lp, &mut mix);
    }
    for i in 0..n {
        mix[i] += click[i];
    }
    mix
}

// ---------------------------------------------------------------- capture

/// The capture chains, by name. The first five are the research report's; the
/// last two isolate one factor each (report 1.4).
pub const CHAINS: [&str; 7] = ["di", "di_gain", "laptop_mic", "phone_mic", "phone_agc", "laptop_noisy", "laptop_reverb"];

fn room_ir(rng: &mut Rng, rt60: f64, direct_db: f64) -> Vec<f64> {
    let n = (rt60 * 1.2 * SRF) as usize;
    let mut tail: Vec<f64> = (0..n).map(|i| rng.normal() * (-6.91 * (i as f64 / SRF) / rt60).exp()).collect();
    tail[..(0.004 * SRF) as usize].iter_mut().for_each(|v| *v = 0.0);
    let norm = tail.iter().map(|v| v * v).sum::<f64>().sqrt() + 1e-12;
    let g = 10f64.powf(-direct_db / 20.0) / norm;
    tail.iter_mut().for_each(|v| *v *= g);
    tail[0] = 1.0;
    tail
}

/// Room noise with a tilt, unit RMS.
fn noise(rng: &mut Rng, n: usize, tilt: f64) -> Vec<f64> {
    let white: Vec<f64> = (0..n).map(|_| rng.normal()).collect();
    let mut x = white.clone();
    one_pole_low(&mut x, tilt * 2000.0);
    for i in 0..n {
        x[i] += 0.25 * white[i];
    }
    let rms = (x.iter().map(|v| v * v).sum::<f64>() / n.max(1) as f64).sqrt() + 1e-12;
    x.iter_mut().for_each(|v| *v /= rms);
    x
}

fn agc(x: &mut [f64]) {
    let (target, max_gain) = (0.12, 12.0);
    let a_att = (-1.0 / (0.008 * SRF)).exp();
    let a_rel = (-1.0 / (0.400 * SRF)).exp();
    let mut level = 1e-4;
    for v in x.iter_mut() {
        let e = v.abs();
        level = if e > level { a_att * level + (1.0 - a_att) * e } else { a_rel * level + (1.0 - a_rel) * e };
        *v *= (target / (level + 1e-5)).min(max_gain);
    }
}

fn peak(x: &[f64]) -> f64 {
    x.iter().fold(0.0f64, |m, v| m.max(v.abs())) + 1e-9
}

/// A microphone in a room: high-pass (and a low-pass for a phone), the room,
/// level, noise `noise_db` under the peak.
fn mic(x: &mut Vec<f64>, rng: &mut Rng, hp: f64, lp: Option<f64>, rt60: f64, direct_db: f64, level: f64, noise_db: f64, tilt: f64) {
    high2(x, hp);
    if let Some(lp) = lp {
        low2(x, lp);
    }
    let ir = room_ir(rng, rt60, direct_db);
    *x = convolve_same_len(x, &ir);
    let p = peak(x);
    let nz = noise(rng, x.len(), tilt);
    let g = level * 10f64.powf(-noise_db / 20.0);
    for i in 0..x.len() {
        x[i] = level * x[i] / p + g * nz[i];
    }
}

/// Dry strings to what the app's input would see. Peak at most 0.9.
pub fn capture(dry: &[f64], chain: &str, seed: u64) -> Result<Vec<f32>, String> {
    let mut rng = Rng::new(seed + 1000);
    let p = peak(dry);
    let mut x: Vec<f64> = dry.iter().map(|v| v / p).collect();
    let n = x.len();
    match chain {
        "di" => {
            low2(&mut x, 5500.0);
            let nz = noise(&mut rng, n, 1.0);
            for i in 0..n {
                x[i] = 0.5 * x[i] + 10f64.powf(-78.0 / 20.0) * nz[i];
            }
        }
        "di_gain" => {
            high2(&mut x, 90.0);
            low2(&mut x, 5500.0);
            x.iter_mut().for_each(|v| *v = (22.0 * *v).tanh());
            low2(&mut x, 4200.0);
            one_pole_low(&mut x, 4200.0);
            let nz = noise(&mut rng, n, 1.0);
            for i in 0..n {
                x[i] = 0.5 * x[i] + 10f64.powf(-58.0 / 20.0) * nz[i];
            }
        }
        // an unplugged or acoustic guitar about half a metre from a laptop
        "laptop_mic" => mic(&mut x, &mut rng, 130.0, None, 0.35, 8.0, 0.25, 38.0, 0.5),
        // the same laptop in a room with a fan on: one factor, noise
        "laptop_noisy" => mic(&mut x, &mut rng, 130.0, None, 0.35, 8.0, 0.25, 26.0, 0.5),
        // the same laptop across a live room: one factor, reverb
        "laptop_reverb" => mic(&mut x, &mut rng, 130.0, None, 0.7, 0.0, 0.25, 38.0, 0.5),
        // a phone on a stand or a knee: band-limited, a livelier room, more
        // noise. `phone_agc` adds what a voice-processing input path does when
        // the app cannot get an unprocessed one: automatic gain that pumps the
        // room up between notes, and a soft limiter.
        "phone_mic" | "phone_agc" => {
            mic(&mut x, &mut rng, 170.0, Some(7500.0), 0.5, 5.0, 0.2, 30.0, 0.4);
            if chain == "phone_agc" {
                agc(&mut x);
                x.iter_mut().for_each(|v| *v = (1.5 * *v).tanh() / 1.5);
            }
        }
        other => return Err(format!("unknown capture chain `{other}`")),
    }
    let p = peak(&x);
    let g = if p > 0.9 { 0.9 / p } else { 1.0 };
    Ok(x.iter().map(|v| (v * g) as f32).collect())
}
