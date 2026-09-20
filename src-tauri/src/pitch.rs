//! Which note was that — a monophonic tracker over a finished buffer.
//!
//! `plans/ROADMAP.md` §7 item 2.7 step A, `LEARNING_PATHS_DECISIONS.md` C2,
//! `plans/SONGS.md` A8 and spike K2. `timing.rs` tells the coach WHEN a note
//! landed; this tells it WHAT it was, which is the difference between "you
//! were late" and "you played the wrong note".
//!
//! ## Where this is allowed to run, and where it is not
//!
//! Nowhere near an audio thread, and not live. AGENTS.md's latency tiers put
//! pitch in the mid-session and post-session report tiers: the pass is over,
//! the player is already reading the timing score, and this has three
//! seconds of free real estate to spend on a thirty-second buffer. So
//! everything here allocates freely, takes `&[f32]` of a buffer that has
//! stopped growing, and is a pure function of it. Nothing in this module is
//! reachable from the cpal callback and nothing in it may become so.
//!
//! ## The method, and why each part of it is there
//!
//! pYIN-class, which is four things stacked:
//!
//! 1. **The YIN difference function** — `d(τ) = Σ (x[j] − x[j+τ])²` over an
//!    integration window, with cumulative mean normalisation so `d'(τ)` can
//!    be compared against an absolute threshold instead of a per-frame one.
//!    de Cheveigné & Kawahara 2002; the normalisation is the step that makes
//!    "is this frame periodic at all" answerable without knowing how loud it
//!    was.
//! 2. **Parabolic interpolation** on the minimum, because the answer has to
//!    carry cents and a lag is an integer. At 22 050 Hz a 330 Hz note sits
//!    at lag 67 and one whole sample of lag is 26 cents, so without this
//!    step half the gate is lost to quantisation before anything else goes
//!    wrong.
//! 3. **A small HMM across frames** (Viterbi over the candidate minima of
//!    each frame) so an octave error has to pay for itself. A single frame's
//!    `d'` very often has near-equal minima at τ and 2τ — that IS the octave
//!    error, and it is not fixable inside one frame. Across frames it is:
//!    the true pitch is the one that does not have to jump twelve semitones
//!    and back to be chosen.
//! 4. **A median across the frames of one note**, with the stragglers folded
//!    into the note's own octave. The HMM stops octave errors flickering;
//!    this is what stops a whole note being reported an octave out because
//!    its first two frames were.
//!
//! ## The range you ask for buys the time resolution you get
//!
//! A difference function cannot see a period it has not been given two of.
//! B0 on a five-string bass is 30.9 Hz, so a window that can hear it is at
//! least 65 ms long, and a 93 ms window cannot tell two 16ths at 160 BPM
//! apart because a 16th at 160 BPM IS 93.75 ms. There is no setting that
//! escapes that; there is only being honest about it. So the window is
//! DERIVED from the lowest frequency the caller asks for, and the caller
//! asks for what the score's tuning says it needs ([`PitchConfig::guitar`],
//! [`PitchConfig::bass`], [`PitchConfig::for_tuning`]). A guitar part gets a
//! 31 ms window and can resolve fast sixteenths; a bass part gets 74 ms and
//! can hear the open B string. Asking for both at once gets the bass
//! window, which is the honest answer to a question that contains both.
//!
//! ## Cost
//!
//! The difference function is computed through a pair of FFTs per frame
//! rather than `W × τmax` multiply-adds, which is the difference between
//! this finishing a thirty-second take in under a second and not finishing
//! it inside the tier's budget at all. The transform is written out here —
//! there is no FFT crate in `Cargo.lock` and this did not deserve to be the
//! reason one arrived. It is ninety lines and
//! `the_packed_correlation_matches_the_long_way_round` pins it against the
//! brute-force sum it replaces.

use std::f64::consts::PI;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// The numbers
// ---------------------------------------------------------------------------

/// The rate every buffer is brought to before anything looks at it.
///
/// Fixed, and not the device's, so a take recorded at 44 100 and one
/// recorded at 96 000 are analysed by the same code doing the same
/// arithmetic and the fixture numbers below mean the same thing on both.
/// 22 050 keeps seven harmonics of the highest note this is asked about and
/// costs a quarter of what 48 000 would; the lag quantisation it leaves is
/// handled by the parabolic step, not by the rate.
pub const ANALYSIS_RATE: u32 = 22_050;

/// How far the analysis window moves between frames, in analysis samples.
/// 256 at 22 050 Hz is 11.6 ms — four frames inside a 16th at 160 BPM once
/// the attack has been skipped, which is the tightest thing this is asked
/// to segment.
pub const HOP: usize = 256;

/// How many periods of the lowest frequency the integration window holds.
///
/// Two is the floor below which the difference function is guessing; the
/// extra 0.15 is there so that the note being slightly flat of the range's
/// bottom does not take the window under two.
const PERIODS_PER_WINDOW: f64 = 2.15;

/// Above this, `d'(τ)` is not a pitch, it is noise with a favourite lag.
///
/// YIN's paper suggests 0.1–0.15 and measures it on clean speech. This is
/// not clean speech: a plucked string decays while it is being measured, and
/// the hardest case in the suite — an open low E inside a sixteenth at
/// 160 BPM — gives the difference function a thirty-millisecond window
/// holding two and a half periods, with the next note starting before the
/// longest lag it has to compare against has finished. Its honest `d'` sits
/// around 0.12–0.15, and at 0.15 the tracker called six of those notes
/// silence.
///
/// Loosening this does not let the tracker invent notes: what it may claim
/// is bounded underneath by [`SILENCE_RMS`], and in the pipeline it is
/// bounded again by only being asked about places an onset was actually
/// detected.
const VOICED_THRESHOLD: f64 = 0.20;

/// Candidates worse than this are not offered to the HMM at all.
const CANDIDATE_CEILING: f64 = 0.75;

/// The most candidate periods one frame may put forward.
const MAX_CANDIDATES: usize = 5;

/// What one semitone of pitch jump costs the Viterbi path.
///
/// An octave is twelve of them, so an octave error must be worth 0.24 of
/// `d'` to the frames that want it — far more than the difference between
/// the true minimum and its subharmonic ever is on a real note, and far
/// less than a genuine octave leap in a line costs when every frame on the
/// far side agrees about it.
const JUMP_PENALTY: f64 = 0.02;

/// The most one transition may cost, so a rest between two distant notes is
/// not scored as if the player slid between them.
const MAX_JUMP_COST: f64 = 0.6;

/// Starting or stopping playing costs this much, which is what stops the
/// path chattering in and out of voiced across a decay.
///
/// **It has to be worth less than the frames a SHORT note has to pay it
/// with.** A voiced frame is cheaper than an unvoiced one by
/// `threshold − d'`, which on a clean note is about a tenth; a note is
/// therefore only worth entering if it lasts long enough for that to add up
/// to two of these. At 0.25 the sum came out against a sixteenth at
/// 160 BPM — four usable frames, a tenth each, against half a point of
/// switching — and the tracker silently answered "nobody played anything"
/// for two notes in three of a fast passage while passing every slow
/// fixture in the suite. At 0.08 a note needs a frame and a half to be
/// worth hearing, and a frame has to be worse than `d' ≈ 0.3` to break a
/// note in half.
const SWITCH_COST: f64 = 0.08;

/// How much worse than the frame's best candidate a SHORTER period may be
/// and still be preferred to it.
///
/// This is YIN's absolute-threshold rule — "the first minimum below the
/// threshold, not the lowest" — restated so that an HMM can hold it. The
/// rule exists because the two mistakes are not symmetric:
///
/// * A signal periodic at τ is ALSO periodic at 2τ, 3τ and so on, so the
///   subharmonic explains it very nearly as well and quite often a shade
///   better once the cumulative mean has divided by more of the curve. That
///   shade is the octave error.
/// * A signal periodic at τ is NOT periodic at τ/2 unless it really is, so a
///   candidate at half the period is either right or hopeless, never a
///   shade better.
///
/// So: among the candidates within this much of the best, the SHORTEST wins,
/// and anything longer pays [`LONGER_PERIOD_PENALTY`].
const OCTAVE_SLACK: f64 = 0.12;

/// What a period longer than the shortest good one costs.
///
/// Large on purpose — larger than any difference in `d'` between a
/// fundamental and its subharmonic ever is. It is a tie-break with a
/// direction, not a weight to be traded off, and when it was a weight (0.03
/// per shorter candidate, accumulating per frame) a long note could buy its
/// way onto the subharmonic: eighteen frames of a three-hundredth beat two
/// transitions of a quarter, and a whole G3 came back as G2.
const LONGER_PERIOD_PENALTY: f64 = 0.4;

/// Below this RMS a frame is silence and no pitch is claimed for it.
/// −60 dBFS: quieter than the decay tail of any note anyone means to be
/// scored on, louder than the noise floor of a take.
const SILENCE_RMS: f32 = 0.001;

/// How much of a note to throw away after its onset before believing the
/// pitch.
///
/// A pluck is a broadband transient before it is a note; the string has not
/// settled into a period yet and the difference function says so. Twenty
/// milliseconds is what a wound string takes to become periodic and is
/// still short enough to leave frames inside a 93 ms sixteenth.
const ATTACK_BLANK_MS: f64 = 20.0;

/// A note shorter than this is a segmentation artefact, not a note.
const MIN_NOTE_MS: f64 = 30.0;

/// The longest buffer this will read off disk, for the inspector and the
/// fixtures. Takes are capped at twenty minutes (`take::TAKE_MAX_SECS`) and
/// a pitch pass over one is already outside the tier, but refusing to open
/// it would be worse than being slow about it.
const MAX_DECODE_SECS: f64 = 20.0 * 60.0;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// What the tracker is being asked to listen for.
///
/// Built through the constructors rather than by hand: the window, the lag
/// bounds and the transform size are all derived from the frequency range
/// and are not independently meaningful. See the module header on why the
/// range is a decision the caller has to make.
#[derive(Debug, Clone, PartialEq)]
pub struct PitchConfig {
    /// The lowest fundamental to look for, in Hz. Decides the window.
    pub fmin_hz: f64,
    /// The highest fundamental to look for, in Hz.
    pub fmax_hz: f64,
    /// Integration window, in analysis samples.
    pub window: usize,
    /// The longest period considered, in analysis samples.
    pub tau_max: usize,
    /// The shortest period considered, in analysis samples.
    pub tau_min: usize,
    /// Transform length. A power of two, at least `2·window + tau_max`, so
    /// the circular correlation the FFT computes carries no wrap into the
    /// lags that are read.
    pub fft_len: usize,
    /// Frames this far apart, in analysis samples.
    pub hop: usize,
    /// `d'` at or below which a frame is called voiced.
    pub threshold: f64,
    /// How much of a note after its onset is not believed.
    pub attack_blank_ms: f64,
    /// Shorter than this is not a note.
    pub min_note_ms: f64,
}

impl Default for PitchConfig {
    /// Everything the brief names: B0 on a five-string bass up to the top of
    /// a 24-fret guitar. Correct for a part whose instrument is not known,
    /// and slower and blunter in time than either of the two that are.
    fn default() -> Self {
        Self::for_range(29.0, 1400.0)
    }
}

impl PitchConfig {
    /// A guitar part. 70 Hz is under the low E of a drop-D tuning (73.4) with
    /// room for a flat one; 1400 Hz is over the 24th fret of the high E.
    pub fn guitar() -> Self {
        Self::for_range(70.0, 1400.0)
    }

    /// A bass part, four or five string. 29 Hz is under the open B of a
    /// five-string (30.87); 700 Hz is over anything a bass line reaches.
    pub fn bass() -> Self {
        Self::for_range(29.0, 700.0)
    }

    /// The config a score's own tuning asks for.
    ///
    /// `tuning` is the contract's: one MIDI number per string, string 1
    /// (the highest) first. A part whose lowest string is below E2 is a
    /// bass, and a bass buys the long window it needs; anything else is a
    /// guitar and keeps the time resolution. An empty tuning is a part we
    /// know nothing about, and gets [`PitchConfig::default`].
    pub fn for_tuning(tuning: &[i32]) -> Self {
        match tuning.iter().min() {
            None => Self::default(),
            // Below E2 (40) — a bass, a baritone, or a guitar in a tuning
            // deep enough that the guitar window would be guessing at it.
            Some(&low) if low < 40 => Self::bass(),
            Some(_) => Self::guitar(),
        }
    }

    /// The derivation every constructor above goes through. Public because
    /// an instrument this app has not met yet is a range, not a new method.
    pub fn for_range(fmin_hz: f64, fmax_hz: f64) -> Self {
        let rate = ANALYSIS_RATE as f64;
        let fmin = fmin_hz.max(10.0);
        let fmax = fmax_hz.clamp(fmin * 2.0, rate / 2.5);
        let tau_max = (rate / fmin).ceil() as usize;
        let tau_min = ((rate / fmax).floor() as usize).max(2);
        let window = (PERIODS_PER_WINDOW * rate / fmin).ceil() as usize;
        // `2·window + tau_max` and not `window + tau_max`: the correlation
        // being computed is of the window against the whole read span, and
        // a linear correlation of lengths `W` and `W + τmax` needs
        // `2W + τmax − 1` points before the circular transform folds a
        // negative lag onto a positive one.
        let fft_len = (2 * window + tau_max).next_power_of_two();
        Self {
            fmin_hz: fmin,
            fmax_hz: fmax,
            window,
            tau_max,
            tau_min,
            fft_len,
            hop: HOP,
            threshold: VOICED_THRESHOLD,
            attack_blank_ms: ATTACK_BLANK_MS,
            min_note_ms: MIN_NOTE_MS,
        }
    }

    /// How long the integration window is, in milliseconds — the smallest
    /// slice of a note this config can give an answer about.
    pub fn window_ms(&self) -> f64 {
        self.window as f64 * 1000.0 / ANALYSIS_RATE as f64
    }

    /// How far apart frames are, in milliseconds.
    pub fn hop_ms(&self) -> f64 {
        self.hop as f64 * 1000.0 / ANALYSIS_RATE as f64
    }

    /// How many samples one frame reads: the window, plus the longest lag it
    /// compares the window against.
    fn span(&self) -> usize {
        self.window + self.tau_max
    }
}

// ---------------------------------------------------------------------------
// What comes out
// ---------------------------------------------------------------------------

/// One analysis frame.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchFrame {
    /// Where the integration window starts, ms from the start of the buffer.
    pub start_ms: f64,
    /// The estimate, as a float MIDI number so the cents survive. Only
    /// meaningful when `voiced`.
    pub midi: f64,
    /// The same, in Hz.
    pub hz: f64,
    /// `1 − d'(τ)` at the chosen lag, clamped to `[0, 1]`.
    pub confidence: f64,
    /// RMS of the integration window.
    pub rms: f32,
    pub voiced: bool,
}

/// Every frame of one buffer, and what they were measured with.
#[derive(Debug, Clone)]
pub struct PitchTrack {
    pub frames: Vec<PitchFrame>,
    pub config: PitchConfig,
    /// How long the buffer was, in milliseconds.
    pub length_ms: f64,
}

/// One note the tracker heard.
///
/// `midi` is a float on purpose: a note played 30 cents sharp is a different
/// fact from a note played in tune, and rounding here would throw away the
/// only part of this the tuning and bend work downstream can use.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NoteEvent {
    pub start_ms: f64,
    pub end_ms: f64,
    pub midi: f64,
    /// Mean frame confidence over the note, scaled by how much of the note
    /// was voiced at all. A note the tracker only half heard says so.
    pub confidence: f64,
}

impl NoteEvent {
    /// The note as a whole semitone, for a screen that wants a name.
    pub fn nearest_midi(&self) -> i32 {
        self.midi.round() as i32
    }

    /// How far from that name it was, in cents.
    pub fn cents_off_nearest(&self) -> f64 {
        (self.midi - self.midi.round()) * 100.0
    }
}

// ---------------------------------------------------------------------------
// The transform
// ---------------------------------------------------------------------------

/// An iterative radix-2 complex FFT with its twiddles worked out once.
///
/// Written out rather than pulled in: `Cargo.lock` has no FFT crate in it
/// (checked 2026-09-20 — `rustfft`, `realfft`, `microfft`, `num-complex`
/// are all absent), and a module that needs one transform of one power-of-two
/// size does not justify being the reason a dependency and its half-dozen
/// transitive crates enter a GPL-3 audio app's licence audit.
struct Fft {
    n: usize,
    /// Bit-reversal permutation, precomputed.
    rev: Vec<u32>,
    /// `exp(−2πik/n)` for `k` in `0..n/2`.
    tw_re: Vec<f64>,
    tw_im: Vec<f64>,
}

impl Fft {
    fn new(n: usize) -> Self {
        assert!(n.is_power_of_two() && n >= 2, "an FFT length is a power of two");
        let bits = n.trailing_zeros();
        let rev = (0..n)
            .map(|i| (i as u32).reverse_bits() >> (32 - bits))
            .collect();
        let mut tw_re = Vec::with_capacity(n / 2);
        let mut tw_im = Vec::with_capacity(n / 2);
        for k in 0..n / 2 {
            let a = -2.0 * PI * k as f64 / n as f64;
            tw_re.push(a.cos());
            tw_im.push(a.sin());
        }
        Self {
            n,
            rev,
            tw_re,
            tw_im,
        }
    }

    /// In place, over the whole of `re` and `im`, which must both be `n`
    /// long. The inverse conjugates the twiddles and scales by `1/n`.
    fn run(&self, re: &mut [f64], im: &mut [f64], inverse: bool) {
        let n = self.n;
        debug_assert_eq!(re.len(), n);
        debug_assert_eq!(im.len(), n);
        for i in 0..n {
            let j = self.rev[i] as usize;
            if i < j {
                re.swap(i, j);
                im.swap(i, j);
            }
        }
        let mut len = 2;
        while len <= n {
            let half = len / 2;
            let step = n / len;
            let mut base = 0;
            while base < n {
                for k in 0..half {
                    let t = k * step;
                    let tr = self.tw_re[t];
                    let ti = if inverse { -self.tw_im[t] } else { self.tw_im[t] };
                    let (ur, ui) = (re[base + k], im[base + k]);
                    let (xr, xi) = (re[base + k + half], im[base + k + half]);
                    let vr = xr * tr - xi * ti;
                    let vi = xr * ti + xi * tr;
                    re[base + k] = ur + vr;
                    im[base + k] = ui + vi;
                    re[base + k + half] = ur - vr;
                    im[base + k + half] = ui - vi;
                }
                base += len;
            }
            len <<= 1;
        }
        if inverse {
            let s = 1.0 / n as f64;
            for v in re.iter_mut() {
                *v *= s;
            }
            for v in im.iter_mut() {
                *v *= s;
            }
        }
    }
}

/// Scratch the frame loop reuses, so a thirty-second buffer is a handful of
/// allocations and not two per frame.
struct Scratch {
    re: Vec<f64>,
    im: Vec<f64>,
    corr: Vec<f64>,
    diff: Vec<f64>,
    cmnd: Vec<f64>,
}

impl Scratch {
    fn new(cfg: &PitchConfig) -> Self {
        Self {
            re: vec![0.0; cfg.fft_len],
            im: vec![0.0; cfg.fft_len],
            corr: vec![0.0; cfg.tau_max + 1],
            diff: vec![0.0; cfg.tau_max + 1],
            cmnd: vec![0.0; cfg.tau_max + 1],
        }
    }
}

/// `corr[τ] = Σ_{j<W} x[t+j]·x[t+j+τ]` for every `τ` up to `tau_max`, in two
/// transforms instead of `W × τmax` multiply-adds.
///
/// The two sequences being correlated are the integration window `a` (the
/// first `W` samples of the frame) and the whole read span `b` (`W + τmax`
/// of them). Both are real, so both go through ONE forward transform packed
/// as `z = a + i·b` and are separated afterwards by the Hermitian symmetry
/// of a real sequence's spectrum — the standard two-for-one, and the reason
/// a frame costs two transforms rather than three.
fn windowed_correlation(fft: &Fft, x: &[f64], t: usize, cfg: &PitchConfig, s: &mut Scratch) {
    let l = cfg.fft_len;
    let w = cfg.window;
    let n = cfg.span();
    s.re[..l].fill(0.0);
    s.im[..l].fill(0.0);
    for j in 0..n {
        let v = x[t + j];
        // The window in the real part, the whole span in the imaginary one.
        if j < w {
            s.re[j] = v;
        }
        s.im[j] = v;
    }
    fft.run(&mut s.re, &mut s.im, false);

    // Unpack, multiply and refold in one sweep over the half-spectrum. For
    // each bin `k`, with `Z = FFT(a + ib)`:
    //   A[k] = (Z[k] + conj(Z[L−k])) / 2
    //   B[k] = −i·(Z[k] − conj(Z[L−k])) / 2
    // and the correlation's spectrum is `conj(A)·B`. Writing it straight
    // back into `re`/`im` needs the pair `k` and `L−k` handled together,
    // because each is the other's input.
    for k in 0..=l / 2 {
        let k2 = (l - k) % l;
        let (zr, zi) = (s.re[k], s.im[k]);
        let (wr, wi) = (s.re[k2], s.im[k2]);
        let (ar, ai) = ((zr + wr) * 0.5, (zi - wi) * 0.5);
        let (br, bi) = ((zi + wi) * 0.5, -(zr - wr) * 0.5);
        // conj(A)·B
        let cr = ar * br + ai * bi;
        let ci = ar * bi - ai * br;
        s.re[k] = cr;
        s.im[k] = ci;
        if k2 != k {
            // A real correlation's spectrum is Hermitian, so the mirror bin
            // is the conjugate and costs nothing to fill.
            s.re[k2] = cr;
            s.im[k2] = -ci;
        }
    }
    fft.run(&mut s.re, &mut s.im, true);
    s.corr[..=cfg.tau_max].copy_from_slice(&s.re[..=cfg.tau_max]);
}

// ---------------------------------------------------------------------------
// Preparing the buffer
// ---------------------------------------------------------------------------

/// One biquad, direct form I. Only ever a low-pass here.
#[derive(Clone, Copy)]
struct Biquad {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
}

impl Biquad {
    /// RBJ cookbook low-pass at `fc`, Butterworth Q.
    fn low_pass(fc: f64, rate: f64) -> Self {
        let w0 = 2.0 * PI * (fc / rate).clamp(1e-4, 0.49);
        let (sin0, cos0) = (w0.sin(), w0.cos());
        // `alpha = sin(w0) / 2Q`, at the Butterworth `Q = 1/√2` — which is
        // `sin(w0) / √2`, written as the constant so nobody has to trust an
        // arrangement of reciprocals.
        let alpha = sin0 / std::f64::consts::SQRT_2;
        let a0 = 1.0 + alpha;
        Self {
            b0: ((1.0 - cos0) * 0.5) / a0,
            b1: (1.0 - cos0) / a0,
            b2: ((1.0 - cos0) * 0.5) / a0,
            a1: (-2.0 * cos0) / a0,
            a2: (1.0 - alpha) / a0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    fn step(&mut self, x: f64) -> f64 {
        let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2 - self.a1 * self.y1
            - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = y;
        y
    }
}

/// Bring a buffer to [`ANALYSIS_RATE`], anti-aliased, DC-free.
///
/// The low-pass is not optional and not cosmetic. Dropping 48 kHz to 22 050
/// by picking samples folds everything above 11 kHz back down into the range
/// the difference function is looking at, and a folded harmonic is a
/// periodicity that was never played. Two cascaded Butterworth sections at
/// 0.45 of the new Nyquist put the fold-back 24 dB down per octave past it,
/// which is far more than a guitar has up there to begin with.
///
/// The interpolation after it is linear, and that is fine for the same
/// reason it is fine in `take.rs`'s writer: the signal has just been
/// band-limited to well under half the new rate, so the error linear
/// interpolation makes is tiny and, more to the point, is not periodic at
/// any lag the tracker reads.
///
/// The one-pole high-pass at 20 Hz last is for rumble: a mic in a room with
/// a fridge in it has energy under the lowest note anyone can play, and
/// `d(τ)` at a long lag will happily lock onto it.
fn to_analysis_rate(samples: &[f32], from: u32) -> Vec<f64> {
    let from = from.max(1);
    let filtered: Vec<f64> = if from > ANALYSIS_RATE {
        let fc = 0.45 * ANALYSIS_RATE as f64;
        let mut a = Biquad::low_pass(fc, from as f64);
        let mut b = Biquad::low_pass(fc, from as f64);
        samples.iter().map(|&s| b.step(a.step(s as f64))).collect()
    } else {
        samples.iter().map(|&s| s as f64).collect()
    };

    let step = from as f64 / ANALYSIS_RATE as f64;
    let out_len = if filtered.len() < 2 {
        0
    } else {
        (((filtered.len() - 1) as f64) / step).floor() as usize + 1
    };
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let pos = i as f64 * step;
        let k = pos as usize;
        let f = pos - k as f64;
        let a = filtered[k];
        let b = *filtered.get(k + 1).unwrap_or(&a);
        out.push(a + (b - a) * f);
    }

    // One-pole high-pass, 20 Hz, in place.
    let rc = 1.0 / (2.0 * PI * 20.0);
    let dt = 1.0 / ANALYSIS_RATE as f64;
    let a = rc / (rc + dt);
    let (mut prev_in, mut prev_out) = (0.0, 0.0);
    for v in out.iter_mut() {
        let x = *v;
        prev_out = a * (prev_out + x - prev_in);
        prev_in = x;
        *v = prev_out;
    }
    out
}

// ---------------------------------------------------------------------------
// One frame
// ---------------------------------------------------------------------------

/// A period one frame thinks it might have.
#[derive(Debug, Clone, Copy)]
struct Candidate {
    /// The interpolated lag, in analysis samples.
    tau: f64,
    midi: f64,
    /// `d'` at the integer lag it was found at — how well this period
    /// actually explains the frame, and what the confidence is read off.
    dprime: f64,
    /// `dprime` plus [`LONGER_PERIOD_PENALTY`] when a shorter period
    /// explained the frame nearly as well. What the HMM weighs.
    cost: f64,
}

fn hz_to_midi(hz: f64) -> f64 {
    69.0 + 12.0 * (hz / 440.0).log2()
}

/// Every local minimum of `d'` worth offering, in PERIOD order.
///
/// Period order and not quality order, because the tie-break between them is
/// "the shortest one that works wins" ([`OCTAVE_SLACK`]) and that question
/// can only be asked of a list sorted by period. The HMM reads `cost`, not
/// the position.
fn candidates(cmnd: &[f64], cfg: &PitchConfig) -> Vec<Candidate> {
    let mut found: Vec<(usize, f64)> = Vec::new();
    let hi = cfg.tau_max.min(cmnd.len() - 1);
    let lo = cfg.tau_min.max(1);
    for t in (lo + 1)..hi {
        if cmnd[t] < cmnd[t - 1] && cmnd[t] <= cmnd[t + 1] && cmnd[t] < CANDIDATE_CEILING {
            found.push((t, cmnd[t]));
        }
    }
    if found.is_empty() {
        return Vec::new();
    }
    // Keep the best few by `d'`, then put them back in period order.
    found.sort_by(|a, b| a.1.total_cmp(&b.1));
    found.truncate(MAX_CANDIDATES);
    let best = found[0].1;
    found.sort_by_key(|&(t, _)| t);
    // The shortest period that explains the signal nearly as well as the
    // best one does. Everything longer than it is a subharmonic until
    // proven otherwise — see [`OCTAVE_SLACK`].
    let shortest_good = found
        .iter()
        .find(|&&(_, d)| d <= best + OCTAVE_SLACK)
        .map(|&(t, _)| t)
        .unwrap_or(0);

    found
        .iter()
        .map(|&(t, d)| {
            // Parabolic interpolation of the minimum. `s0 − 2s1 + s2` is
            // twice the parabola's curvature and is positive at a minimum;
            // a flat or inverted neighbourhood falls back to the integer
            // lag rather than dividing by nothing.
            let (s0, s1, s2) = (cmnd[t - 1], cmnd[t], cmnd[t + 1]);
            let curve = s0 - 2.0 * s1 + s2;
            let delta = if curve.abs() > 1e-12 {
                (0.5 * (s0 - s2) / curve).clamp(-1.0, 1.0)
            } else {
                0.0
            };
            let tau = t as f64 + delta;
            let hz = ANALYSIS_RATE as f64 / tau.max(1e-9);
            let longer = if t > shortest_good {
                LONGER_PERIOD_PENALTY
            } else {
                0.0
            };
            Candidate {
                tau,
                midi: hz_to_midi(hz),
                dprime: d,
                cost: d + longer,
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// The track
// ---------------------------------------------------------------------------

/// Run the tracker over a finished buffer.
///
/// `samples` is mono at `sample_rate`. Never call this from an audio
/// callback; see the module header.
pub fn track(samples: &[f32], sample_rate: u32, cfg: &PitchConfig) -> PitchTrack {
    let length_ms = samples.len() as f64 * 1000.0 / sample_rate.max(1) as f64;
    let x = to_analysis_rate(samples, sample_rate);
    let span = cfg.span();
    if x.len() < span + 1 {
        return PitchTrack {
            frames: Vec::new(),
            config: cfg.clone(),
            length_ms,
        };
    }

    // `Σ x²` up to each index, so the two power terms of `d(τ)` are a
    // subtraction rather than a second pass over the window per lag.
    let mut sumsq = Vec::with_capacity(x.len() + 1);
    sumsq.push(0.0f64);
    let mut acc = 0.0f64;
    for &v in &x {
        acc += v * v;
        sumsq.push(acc);
    }
    let power = |u: usize| sumsq[u + cfg.window] - sumsq[u];

    let fft = Fft::new(cfg.fft_len);
    let mut s = Scratch::new(cfg);
    let ms_per_sample = 1000.0 / ANALYSIS_RATE as f64;
    let frame_count = (x.len() - span) / cfg.hop + 1;

    // Frame by frame: the raw estimate and its candidates. The HMM below
    // needs them all before it can choose any, which is the whole point of
    // it — a single frame cannot tell an octave error from a note.
    let mut per_frame: Vec<(f64, f32, Vec<Candidate>)> = Vec::with_capacity(frame_count);
    for f in 0..frame_count {
        let t = f * cfg.hop;
        let p0 = power(t);
        let rms = (p0 / cfg.window as f64).max(0.0).sqrt() as f32;
        let start_ms = t as f64 * ms_per_sample;
        if rms < SILENCE_RMS {
            // Silence gets no transform at all. On a real take this is most
            // of the buffer between phrases, and skipping it is the cheapest
            // speed there is.
            per_frame.push((start_ms, rms, Vec::new()));
            continue;
        }
        windowed_correlation(&fft, &x, t, cfg, &mut s);
        // d(τ) = P(t) + P(t+τ) − 2·r(τ). Clamped at zero: it is a sum of
        // squares and can only go negative through rounding.
        for tau in 0..=cfg.tau_max {
            s.diff[tau] = (p0 + power(t + tau) - 2.0 * s.corr[tau]).max(0.0);
        }
        // Cumulative mean normalisation. d'(0) is 1 by definition, and the
        // running mean is of d(1..=τ), which is what makes the threshold
        // below an absolute one.
        s.cmnd[0] = 1.0;
        let mut running = 0.0f64;
        for tau in 1..=cfg.tau_max {
            running += s.diff[tau];
            s.cmnd[tau] = if running > 0.0 {
                s.diff[tau] * tau as f64 / running
            } else {
                1.0
            };
        }
        per_frame.push((start_ms, rms, candidates(&s.cmnd, cfg)));
    }

    let chosen = viterbi(&per_frame, cfg);
    let frames = per_frame
        .iter()
        .zip(chosen.iter())
        .map(|((start_ms, rms, cands), pick)| match pick {
            Some(i) => {
                let c = cands[*i];
                PitchFrame {
                    start_ms: *start_ms,
                    midi: c.midi,
                    hz: ANALYSIS_RATE as f64 / c.tau,
                    confidence: (1.0 - c.dprime).clamp(0.0, 1.0),
                    rms: *rms,
                    voiced: true,
                }
            }
            None => PitchFrame {
                start_ms: *start_ms,
                midi: 0.0,
                hz: 0.0,
                confidence: 0.0,
                rms: *rms,
                voiced: false,
            },
        })
        .collect();

    PitchTrack {
        frames,
        config: cfg.clone(),
        length_ms,
    }
}

/// The small HMM: one state per candidate plus one for "not playing", and
/// the cheapest path through the whole buffer.
///
/// Emission cost is the candidate's own `d'` with the shorter-period bias
/// on it; transition cost is a semitone tax, capped, plus a flat charge for
/// starting or stopping. Returns, per frame, the index of the chosen
/// candidate, or `None` where the path went unvoiced.
fn viterbi(per_frame: &[(f64, f32, Vec<Candidate>)], cfg: &PitchConfig) -> Vec<Option<usize>> {
    let n = per_frame.len();
    let mut out = vec![None; n];
    if n == 0 {
        return out;
    }
    // `costs[j]` for j < k is candidate j; `costs[k]` is unvoiced.
    let mut costs: Vec<f64> = Vec::new();
    let mut back: Vec<Vec<usize>> = Vec::with_capacity(n);
    let mut prev_cands: &[Candidate] = &[];

    for (i, (_, rms, cands)) in per_frame.iter().enumerate() {
        let k = cands.len();
        let silent = *rms < SILENCE_RMS;
        let mut next = vec![f64::INFINITY; k + 1];
        let mut ptr = vec![0usize; k + 1];
        for (j, c) in cands.iter().enumerate() {
            // A frame under the silence floor claims no pitch however
            // periodic the little that is there looks.
            let emit = if silent { 10.0 } else { c.cost };
            if i == 0 {
                next[j] = emit;
                continue;
            }
            let (mut best, mut arg) = (f64::INFINITY, 0usize);
            for (p, pc) in prev_cands.iter().enumerate() {
                let jump = (c.midi - pc.midi).abs() * JUMP_PENALTY;
                let t = costs[p] + jump.min(MAX_JUMP_COST);
                if t < best {
                    best = t;
                    arg = p;
                }
            }
            let from_unvoiced = costs[prev_cands.len()] + SWITCH_COST;
            if from_unvoiced < best {
                best = from_unvoiced;
                arg = prev_cands.len();
            }
            next[j] = best + emit;
            ptr[j] = arg;
        }
        // Not playing. Free when the frame is silent; otherwise it costs
        // the threshold, so a frame whose best candidate beats the
        // threshold prefers to be a note and one that does not prefers not
        // to be.
        let emit_unvoiced = if silent { 0.0 } else { cfg.threshold };
        if i == 0 {
            next[k] = emit_unvoiced;
        } else {
            let (mut best, mut arg) = (costs[prev_cands.len()], prev_cands.len());
            for (p, _) in prev_cands.iter().enumerate() {
                let t = costs[p] + SWITCH_COST;
                if t < best {
                    best = t;
                    arg = p;
                }
            }
            next[k] = best + emit_unvoiced;
            ptr[k] = arg;
        }
        costs = next;
        back.push(ptr);
        prev_cands = cands;
    }

    // Walk back from the cheapest end state.
    let mut state = costs
        .iter()
        .enumerate()
        .min_by(|a, b| a.1.total_cmp(b.1))
        .map(|(i, _)| i)
        .unwrap_or(0);
    for i in (0..n).rev() {
        let k = per_frame[i].2.len();
        out[i] = if state < k { Some(state) } else { None };
        state = back[i][state];
    }
    out
}

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------

/// Onset timestamps as milliseconds from the start of the buffer.
///
/// `onset.rs` stamps its events with [`crate::clock::now_ns`], a monotonic
/// clock, so what reaches here is a nanosecond count and the moment the
/// buffer began. Raw `u64`s and not `&[Onset]` on purpose: this module has
/// no business depending on the detector's event struct, and a caller that
/// has the numbers from anywhere else (a fixture, a replay, a test) can use
/// this without inventing one.
pub fn onsets_ms_from_ns(ts_ns: &[u64], buffer_start_ns: u64) -> Vec<f64> {
    ts_ns
        .iter()
        .filter(|&&t| t >= buffer_start_ns)
        .map(|&t| (t - buffer_start_ns) as f64 / 1_000_000.0)
        .collect()
}

/// Turn a track into notes, using onsets when there are any.
///
/// **With onsets**, a note runs from one onset to the next, which is the
/// only way a repeated note at the same pitch is two notes rather than one
/// long one — nothing in the pitch track itself distinguishes them.
///
/// **Without onsets**, the boundaries come from the track: a note ends when
/// the voicing does, or when the pitch has been more than a semitone away
/// from the note's own median for three frames running. That is a fallback
/// and not a peer of the first: it cannot hear a repeat, and it says so by
/// producing one note where there were two.
pub fn notes_from(tr: &PitchTrack, onsets_ms: &[f64]) -> Vec<NoteEvent> {
    if onsets_ms.is_empty() {
        return notes_from_track_alone(tr);
    }
    let cfg = &tr.config;
    let mut bounds: Vec<f64> = onsets_ms
        .iter()
        .copied()
        .filter(|t| t.is_finite() && *t >= 0.0 && *t < tr.length_ms)
        .collect();
    bounds.sort_by(f64::total_cmp);
    bounds.dedup_by(|a, b| (*a - *b).abs() < cfg.min_note_ms);

    let mut out = Vec::with_capacity(bounds.len());
    for (i, &start) in bounds.iter().enumerate() {
        let end = bounds.get(i + 1).copied().unwrap_or(tr.length_ms);
        if end - start < cfg.min_note_ms {
            continue;
        }
        let from = start + cfg.attack_blank_ms;
        if let Some(note) = summarise(tr, from, end, start) {
            out.push(note);
        }
    }
    out
}

/// The whole pipeline, for a caller that has a buffer and some onsets.
pub fn analyse(
    samples: &[f32],
    sample_rate: u32,
    onsets_ms: &[f64],
    cfg: &PitchConfig,
) -> Vec<NoteEvent> {
    notes_from(&track(samples, sample_rate, cfg), onsets_ms)
}

/// Every voiced frame whose integration window lies inside `[from, to)`,
/// collapsed into one note that is said to have started at `start`.
///
/// The window has to be INSIDE the span and not merely to start in it: a
/// frame whose window straddles the next note's attack is measuring both
/// notes, and at fast tempos that is the single biggest source of a wrong
/// answer. The last frame of a note is allowed to run a little past the end
/// so that a note with only one frame in it is not thrown away for the sake
/// of a millisecond.
fn summarise(tr: &PitchTrack, from: f64, to: f64, start: f64) -> Option<NoteEvent> {
    let win = tr.config.window_ms();
    let slack = tr.config.hop_ms();
    let mut midis: Vec<f64> = Vec::new();
    let mut confs: Vec<f64> = Vec::new();
    let mut looked = 0usize;
    let mut last_end = start;
    for f in &tr.frames {
        if f.start_ms + win > to + slack {
            break;
        }
        if f.start_ms < from {
            continue;
        }
        looked += 1;
        if f.voiced {
            midis.push(f.midi);
            confs.push(f.confidence);
            last_end = (f.start_ms + win).min(to);
        }
    }
    if midis.is_empty() {
        return None;
    }
    let midi = folded_median(&mut midis);
    // Voiced frames only decide the pitch; how many of the frames looked at
    // were voiced decides how much the answer is believed.
    let voiced_share = midis.len() as f64 / looked.max(1) as f64;
    let mean_conf = confs.iter().sum::<f64>() / confs.len() as f64;
    Some(NoteEvent {
        start_ms: start,
        end_ms: last_end.max(start),
        midi,
        confidence: (mean_conf * voiced_share).clamp(0.0, 1.0),
    })
}

/// The median of a note's frames, with the strays folded into its octave
/// first.
///
/// The fold is the last line of defence against the octave error and the
/// reason the bass fixture's gate is zero and not "almost none". The HMM
/// already refuses to let a track flicker between τ and 2τ; what it cannot
/// fix is a note whose opening frames all agree on the subharmonic, because
/// nothing about that path is inconsistent. Taking the median first, then
/// folding everything more than six semitones from it by whole octaves,
/// then taking the median again, turns "most of this note was at 82 Hz and
/// the start was at 41" into one note at 82 Hz instead of two answers.
fn folded_median(midis: &mut [f64]) -> f64 {
    let first = median(midis);
    for m in midis.iter_mut() {
        let octaves = ((first - *m) / 12.0).round();
        if octaves != 0.0 {
            *m += octaves * 12.0;
        }
    }
    median(midis)
}

fn median(v: &mut [f64]) -> f64 {
    v.sort_by(f64::total_cmp);
    let n = v.len();
    if n == 0 {
        return 0.0;
    }
    if n % 2 == 1 {
        v[n / 2]
    } else {
        (v[n / 2 - 1] + v[n / 2]) * 0.5
    }
}

/// How far the pitch may wander from a note's own median before the note is
/// over, when there are no onsets to say so.
const SPLIT_SEMITONES: f64 = 1.0;
/// For how many frames running.
const SPLIT_FRAMES: usize = 3;

fn notes_from_track_alone(tr: &PitchTrack) -> Vec<NoteEvent> {
    let cfg = &tr.config;
    let win = cfg.window_ms();
    let mut out: Vec<NoteEvent> = Vec::new();
    let mut run: Vec<PitchFrame> = Vec::new();
    let mut away = 0usize;

    let flush = |run: &mut Vec<PitchFrame>, out: &mut Vec<NoteEvent>| {
        if run.is_empty() {
            return;
        }
        let start = run[0].start_ms;
        let end = run[run.len() - 1].start_ms + win;
        if end - start >= cfg.min_note_ms {
            let mut midis: Vec<f64> = run.iter().map(|f| f.midi).collect();
            let midi = folded_median(&mut midis);
            let conf = run.iter().map(|f| f.confidence).sum::<f64>() / run.len() as f64;
            out.push(NoteEvent {
                start_ms: start,
                end_ms: end,
                midi,
                confidence: conf.clamp(0.0, 1.0),
            });
        }
        run.clear();
    };

    for f in &tr.frames {
        if !f.voiced {
            flush(&mut run, &mut out);
            away = 0;
            continue;
        }
        if run.is_empty() {
            run.push(*f);
            away = 0;
            continue;
        }
        let mut so_far: Vec<f64> = run.iter().map(|x| x.midi).collect();
        let centre = median(&mut so_far);
        if (f.midi - centre).abs() > SPLIT_SEMITONES {
            away += 1;
            if away >= SPLIT_FRAMES {
                // The last few frames belonged to the new note, not this
                // one. Hand them over rather than losing them.
                let carry: Vec<PitchFrame> = run.split_off(run.len().saturating_sub(away - 1));
                flush(&mut run, &mut out);
                run = carry;
                run.push(*f);
                away = 0;
                continue;
            }
        } else {
            away = 0;
        }
        run.push(*f);
    }
    flush(&mut run, &mut out);
    out
}

// ---------------------------------------------------------------------------
// Matching what was heard against what was written
// ---------------------------------------------------------------------------

/// One note of the score, in the range being assessed.
///
/// The `id` is `SongNote.id` from the contract in `plans/tasks/songs/
/// BRIEF.md`; `midi` is that note's sounding pitch with the tuning and capo
/// already applied, which is what the importer writes.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScoreNote {
    pub id: u32,
    pub midi: f64,
}

/// What `timing.rs` decided about one expected onset. Mirrors the wave's
/// `OnsetResult` contract.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OnsetState {
    Hit,
    Miss,
    /// A hammer-on or pull-off nobody heard. Not a miss, by the contract,
    /// and therefore not a wrong note either.
    SoftAbsent,
}

/// One expected onset after the timing pass, on its way here.
///
/// **This module does not align anything.** W1's matcher has already decided
/// which played onset answers which expected one and when it landed; redoing
/// that here with a different rule would give the review two answers to the
/// same question. All this needs from it is: which score notes were due at
/// this onset, whether it was played, and — when it was — the moment on the
/// buffer's own clock that it was played at, which is what looks the note
/// up in the pitch track.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MatchedOnset {
    /// `ExpectedOnset.id`.
    pub id: u32,
    /// The `SongNote.id`s that share this tick. More than one is a chord.
    pub note_ids: Vec<u32>,
    pub state: OnsetState,
    /// When it was played, ms from the start of the analysed buffer.
    /// `Some` exactly when `state` is [`OnsetState::Hit`].
    pub heard_at_ms: Option<f64>,
}

impl MatchedOnset {
    /// Build one from what the timing pass actually produces.
    ///
    /// **The contract's `OnsetResult` carries `deviationMs` and not an
    /// absolute time**, because the matcher works in beats: it says the note
    /// landed 23 ms late, not that it landed at 4.182 s. The pitch track is
    /// on the buffer's own clock, so the two have to be brought together,
    /// and the sum is `where the onset was due + how far off it was`.
    ///
    /// `expected_at_ms` is the `ExpectedOnset`'s `beat` converted through
    /// whatever tempo map was in force, measured from the same instant the
    /// analysed buffer starts at. Getting that instant wrong shifts every
    /// note by the same amount, which looks like a tracker that cannot
    /// segment rather than a clock that is out — so it is worth a hard look
    /// when wiring this up. A miss carries no moment at all, whatever it was
    /// due at.
    pub fn from_result(
        id: u32,
        note_ids: Vec<u32>,
        state: OnsetState,
        expected_at_ms: f64,
        deviation_ms: Option<f64>,
    ) -> Self {
        let heard_at_ms = match (state, deviation_ms) {
            (OnsetState::Hit, Some(d)) => Some(expected_at_ms + d),
            // A hit with no deviation is a contract violation upstream, but
            // the expected moment is still the best thing to look the note
            // up at, and refusing to look would lose a note over an
            // arithmetic detail.
            (OnsetState::Hit, None) => Some(expected_at_ms),
            _ => None,
        };
        Self {
            id,
            note_ids,
            state,
            heard_at_ms,
        }
    }
}

/// What this module says about one note of the score.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum NoteState {
    /// The right note, inside the tolerance.
    Right,
    /// A note, but not that one.
    Wrong,
    /// That note, in the wrong octave — worth its own word because it is a
    /// different mistake with a different fix.
    Octave,
    /// The onset was not played, or was played and nothing periodic came out
    /// of it (a muted string, a dead note).
    Unheard,
    /// Not checked, and honest about it (`plans/SONGS.md` S0.5): a chord, or
    /// a soft onset the contract says must not be scored.
    NotAssessed,
}

/// The verdict on one score note.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NoteVerdict {
    pub note_id: u32,
    pub onset_id: u32,
    pub expected_midi: f64,
    /// What was heard, as a float MIDI number. `None` when nothing was.
    pub heard_midi: Option<f64>,
    /// How far off, in cents, signed, sharp positive. For an octave error
    /// this is the WHOLE distance including the octave, not the remainder:
    /// the fact is that a note twelve semitones out was played.
    pub cents_off: Option<f64>,
    pub state: NoteState,
    /// The tracker's own confidence in the note it heard.
    pub confidence: f64,
}

/// How forgiving the verdict is.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MatchConfig {
    /// Inside this, the note is right. Fifty cents is a quarter tone: half a
    /// semitone either way, which is exactly the point at which a note stops
    /// being one note and starts being its neighbour.
    pub tolerance_cents: f64,
    /// How far from a whole octave still counts as an octave error rather
    /// than a wrong note.
    pub octave_tolerance_cents: f64,
    /// How far from the played moment a heard note may start and still be
    /// the answer to it.
    pub window_ms: f64,
    /// Below this confidence, a heard note is not evidence of anything and
    /// the score note is unheard rather than wrong.
    pub min_confidence: f64,
}

impl Default for MatchConfig {
    fn default() -> Self {
        Self {
            tolerance_cents: 50.0,
            octave_tolerance_cents: 50.0,
            // A note the matcher already called a hit is within the timing
            // tolerance of where it was expected; this only has to be wide
            // enough to survive the difference between the onset detector's
            // idea of the attack and the segmenter's.
            window_ms: 70.0,
            min_confidence: 0.2,
        }
    }
}

/// Say, for every score note in range, whether it was the note that came
/// out.
///
/// Chords are skipped rather than guessed at. A monophonic tracker asked
/// about three notes at one tick will answer with whichever of them won the
/// difference function, and reporting that as "you played the wrong note"
/// twice would be worse than saying nothing — so every note of an onset
/// with more than one note in it is [`NoteState::NotAssessed`], and the
/// review says so on the screen (`plans/SONGS.md` S0.5).
pub fn match_notes(
    events: &[NoteEvent],
    score_notes: &[ScoreNote],
    onsets: &[MatchedOnset],
    cfg: &MatchConfig,
) -> Vec<NoteVerdict> {
    let by_id = |id: u32| score_notes.iter().find(|n| n.id == id).copied();
    let mut out = Vec::new();

    for onset in onsets {
        let chord = onset.note_ids.len() > 1;
        // One heard note per onset at most, and it is the note that starts
        // nearest to the moment W1 says the onset was played.
        let heard = match (onset.state, onset.heard_at_ms) {
            (OnsetState::Hit, Some(at)) => nearest_event(events, at, cfg.window_ms),
            _ => None,
        };
        for &note_id in &onset.note_ids {
            let Some(note) = by_id(note_id) else {
                continue;
            };
            let base = NoteVerdict {
                note_id,
                onset_id: onset.id,
                expected_midi: note.midi,
                heard_midi: heard.map(|h| h.midi),
                cents_off: heard.map(|h| (h.midi - note.midi) * 100.0),
                state: NoteState::NotAssessed,
                confidence: heard.map(|h| h.confidence).unwrap_or(0.0),
            };
            let state = if chord || onset.state == OnsetState::SoftAbsent {
                NoteState::NotAssessed
            } else {
                match heard {
                    None => NoteState::Unheard,
                    Some(h) if h.confidence < cfg.min_confidence => NoteState::Unheard,
                    Some(h) => classify(h.midi - note.midi, cfg),
                }
            };
            // A chord's notes carry no reading at all rather than one note's
            // reading repeated across all of them, which would look like
            // evidence.
            let (heard_midi, cents_off, confidence) = if matches!(state, NoteState::NotAssessed) {
                (None, None, 0.0)
            } else {
                (base.heard_midi, base.cents_off, base.confidence)
            };
            out.push(NoteVerdict {
                heard_midi,
                cents_off,
                confidence,
                state,
                ..base
            });
        }
    }
    out
}

fn classify(delta_semitones: f64, cfg: &MatchConfig) -> NoteState {
    let cents = delta_semitones * 100.0;
    if cents.abs() <= cfg.tolerance_cents {
        return NoteState::Right;
    }
    for k in [-2.0f64, -1.0, 1.0, 2.0] {
        if (cents - k * 1200.0).abs() <= cfg.octave_tolerance_cents {
            return NoteState::Octave;
        }
    }
    NoteState::Wrong
}

fn nearest_event(events: &[NoteEvent], at_ms: f64, window_ms: f64) -> Option<NoteEvent> {
    events
        .iter()
        .filter(|e| (e.start_ms - at_ms).abs() <= window_ms || (e.start_ms <= at_ms && e.end_ms > at_ms))
        .min_by(|a, b| {
            (a.start_ms - at_ms)
                .abs()
                .total_cmp(&(b.start_ms - at_ms).abs())
        })
        .copied()
}

// ---------------------------------------------------------------------------
// Reading a file
// ---------------------------------------------------------------------------

/// Decode a WAV or FLAC to mono at its own rate.
///
/// Through `kit.rs`'s decoder, which is the one place in this app that knows
/// every bit depth and channel count a file can carry and returns a sentence
/// rather than panicking on one it does not. `kit.rs` hands back interleaved
/// stereo; a pitch tracker wants one signal, and the sum of the two halved
/// is the right one — a DI'd guitar is the same in both and a room pair is
/// the same source twice.
pub fn decode_mono_file(path: &std::path::Path) -> Result<(Vec<f32>, u32), String> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string());
    let (interleaved, rate, _) = crate::kit::decode_capped(
        &name,
        &crate::kit::Source::File(path.to_path_buf()),
        MAX_DECODE_SECS,
    )?;
    let mono = interleaved
        .chunks_exact(2)
        .map(|f| (f[0] + f[1]) * 0.5)
        .collect();
    Ok((mono, rate))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A sine, for the arithmetic tests. Not a fixture — a real note has
    /// harmonics and a real tracker has to deal with them; that is what
    /// `tests/pitch_fixtures` is for.
    fn sine(hz: f64, rate: u32, secs: f64) -> Vec<f32> {
        let n = (rate as f64 * secs) as usize;
        (0..n)
            .map(|i| (2.0 * PI * hz * i as f64 / rate as f64).sin() as f32 * 0.5)
            .collect()
    }

    /// A sawtooth — harmonics all the way up, which is what actually breaks
    /// a pitch tracker.
    fn saw(hz: f64, rate: u32, secs: f64) -> Vec<f32> {
        let n = (rate as f64 * secs) as usize;
        (0..n)
            .map(|i| {
                let p = (hz * i as f64 / rate as f64).fract();
                ((p * 2.0 - 1.0) * 0.4) as f32
            })
            .collect()
    }

    // ---- The transform ----

    #[test]
    fn the_transform_round_trips() {
        let fft = Fft::new(64);
        let mut re: Vec<f64> = (0..64).map(|i| (i as f64 * 0.37).sin()).collect();
        let mut im: Vec<f64> = (0..64).map(|i| (i as f64 * 0.11).cos()).collect();
        let (re0, im0) = (re.clone(), im.clone());
        fft.run(&mut re, &mut im, false);
        fft.run(&mut re, &mut im, true);
        for i in 0..64 {
            assert!((re[i] - re0[i]).abs() < 1e-12, "re[{i}]");
            assert!((im[i] - im0[i]).abs() < 1e-12, "im[{i}]");
        }
    }

    /// THE PACKING IS THE ONE PIECE OF CLEVERNESS IN THIS FILE, so it is
    /// pinned against the sum it stands in for. If this ever fails, the
    /// tracker is not slightly worse — every `d(τ)` in it is nonsense.
    #[test]
    fn the_packed_correlation_matches_the_long_way_round() {
        let cfg = PitchConfig::for_range(200.0, 1000.0);
        let fft = Fft::new(cfg.fft_len);
        let mut s = Scratch::new(&cfg);
        // Something with no symmetry to hide a mistake behind.
        let x: Vec<f64> = (0..cfg.span() * 3)
            .map(|i| (i as f64 * 0.7).sin() + 0.3 * (i as f64 * 2.9).cos() + 0.05 * i as f64 % 1.0)
            .collect();
        for t in [0usize, 13, cfg.span()] {
            windowed_correlation(&fft, &x, t, &cfg, &mut s);
            for tau in [0usize, 1, 7, cfg.tau_min, cfg.tau_max / 2, cfg.tau_max] {
                let want: f64 = (0..cfg.window).map(|j| x[t + j] * x[t + j + tau]).sum();
                let got = s.corr[tau];
                assert!(
                    (got - want).abs() < 1e-8 * want.abs().max(1.0),
                    "t={t} tau={tau}: {got} vs {want}"
                );
            }
        }
    }

    // ---- The config ----

    #[test]
    fn the_window_holds_two_periods_of_the_lowest_note_asked_for() {
        for cfg in [
            PitchConfig::guitar(),
            PitchConfig::bass(),
            PitchConfig::default(),
        ] {
            let period = ANALYSIS_RATE as f64 / cfg.fmin_hz;
            assert!(
                cfg.window as f64 >= 2.0 * period,
                "{:?}: {} samples is under two periods of {} Hz",
                cfg.fmin_hz,
                cfg.window,
                cfg.fmin_hz
            );
            // And the transform is long enough that no negative lag folds
            // onto a positive one.
            assert!(cfg.fft_len >= 2 * cfg.window + cfg.tau_max);
            assert!(cfg.fft_len.is_power_of_two());
        }
    }

    #[test]
    fn a_guitar_window_fits_inside_a_sixteenth_at_160_bpm() {
        // 93.75 ms, minus the attack blanking, has to leave room for a whole
        // window — otherwise every fast passage is measured across the bar
        // line and the 160 BPM fixture is unwinnable by construction.
        let cfg = PitchConfig::guitar();
        assert!(
            cfg.attack_blank_ms + cfg.window_ms() < 93.75,
            "{} ms of blanking plus a {} ms window does not fit a 16th at 160",
            cfg.attack_blank_ms,
            cfg.window_ms()
        );
    }

    #[test]
    fn a_bass_tuning_buys_the_long_window_and_a_guitar_does_not() {
        // Standard guitar, string 1 first.
        assert_eq!(
            PitchConfig::for_tuning(&[64, 59, 55, 50, 45, 40]),
            PitchConfig::guitar()
        );
        // Five-string bass: B0 E1 A1 D2 G2.
        assert_eq!(
            PitchConfig::for_tuning(&[43, 38, 33, 28, 23]),
            PitchConfig::bass()
        );
        assert_eq!(PitchConfig::for_tuning(&[]), PitchConfig::default());
    }

    // ---- The tracker on things whose answer is known exactly ----

    #[test]
    fn a_sine_is_tracked_to_within_a_few_cents() {
        for (hz, cfg) in [
            (110.0, PitchConfig::guitar()),
            (329.63, PitchConfig::guitar()),
            (41.20, PitchConfig::bass()),
            (30.87, PitchConfig::bass()),
        ] {
            let tr = track(&sine(hz, 48_000, 1.0), 48_000, &cfg);
            let voiced: Vec<&PitchFrame> = tr.frames.iter().filter(|f| f.voiced).collect();
            assert!(
                voiced.len() > tr.frames.len() / 2,
                "{hz} Hz: only {} of {} frames were voiced",
                voiced.len(),
                tr.frames.len()
            );
            let want = hz_to_midi(hz);
            let mut off: Vec<f64> = voiced.iter().map(|f| (f.midi - want) * 100.0).collect();
            let worst = off
                .iter()
                .map(|c| c.abs())
                .fold(0.0f64, f64::max);
            let mid = median(&mut off);
            assert!(
                worst < 15.0,
                "{hz} Hz: worst frame was {worst:.1} cents out (median {mid:.1})"
            );
        }
    }

    #[test]
    fn a_sawtooth_does_not_fall_an_octave() {
        // The classic failure: a signal with a strong second harmonic has a
        // difference-function minimum at 2τ that is just as deep.
        let cfg = PitchConfig::guitar();
        let tr = track(&saw(82.41, 44_100, 1.0), 44_100, &cfg);
        let want = hz_to_midi(82.41);
        let bad = tr
            .frames
            .iter()
            .filter(|f| f.voiced && (f.midi - want).abs() > 0.5)
            .count();
        assert_eq!(bad, 0, "{bad} frames of a sawtooth were not its fundamental");
    }

    #[test]
    fn silence_is_not_a_note() {
        let cfg = PitchConfig::guitar();
        let tr = track(&vec![0.0f32; 48_000], 48_000, &cfg);
        assert!(tr.frames.iter().all(|f| !f.voiced));
        assert!(notes_from(&tr, &[]).is_empty());
    }

    #[test]
    fn a_buffer_shorter_than_one_frame_is_no_frames_and_not_a_panic() {
        let cfg = PitchConfig::bass();
        let tr = track(&sine(110.0, 48_000, 0.01), 48_000, &cfg);
        assert!(tr.frames.is_empty());
        assert!(notes_from(&tr, &[5.0]).is_empty());
    }

    #[test]
    fn the_same_pitch_twice_is_two_notes_when_the_onsets_say_so() {
        // One continuous tone, two onsets: the boundary cannot come from the
        // pitch, so it has to come from the detector, and this is the test
        // that it does.
        let cfg = PitchConfig::guitar();
        let mut buf = sine(196.0, 48_000, 0.5);
        buf.extend(sine(196.0, 48_000, 0.5));
        let tr = track(&buf, 48_000, &cfg);
        let one = notes_from(&tr, &[0.0]);
        let two = notes_from(&tr, &[0.0, 500.0]);
        assert_eq!(one.len(), 1);
        assert_eq!(two.len(), 2);
        for n in &two {
            assert!((n.midi - hz_to_midi(196.0)).abs() < 0.2, "{n:?}");
        }
    }

    #[test]
    fn two_different_notes_split_without_any_onsets_at_all() {
        let cfg = PitchConfig::guitar();
        let mut buf = saw(196.0, 48_000, 0.4);
        buf.extend(saw(246.94, 48_000, 0.4));
        let notes = analyse(&buf, 48_000, &[], &cfg);
        assert_eq!(notes.len(), 2, "{notes:#?}");
        assert!((notes[0].midi - hz_to_midi(196.0)).abs() < 0.3);
        assert!((notes[1].midi - hz_to_midi(246.94)).abs() < 0.3);
    }

    #[test]
    fn a_note_thirty_cents_sharp_reads_thirty_cents_sharp() {
        let cfg = PitchConfig::guitar();
        let hz = 220.0 * 2f64.powf(0.30 / 12.0);
        let notes = analyse(&saw(hz, 48_000, 0.6), 48_000, &[0.0], &cfg);
        assert_eq!(notes.len(), 1);
        let cents = (notes[0].midi - 57.0) * 100.0;
        assert!(
            (cents - 30.0).abs() < 8.0,
            "read {cents:.1} cents, not 30 — the interpolation is not carrying cents"
        );
    }

    #[test]
    fn the_rate_the_buffer_arrives_at_does_not_change_the_answer() {
        let cfg = PitchConfig::guitar();
        let mut answers = Vec::new();
        for rate in [22_050u32, 44_100, 48_000, 96_000] {
            let notes = analyse(&saw(146.83, rate, 0.5), rate, &[0.0], &cfg);
            assert_eq!(notes.len(), 1, "{rate} Hz");
            answers.push(notes[0].midi);
        }
        let want = hz_to_midi(146.83);
        for (i, a) in answers.iter().enumerate() {
            assert!(
                (a - want).abs() < 0.12,
                "answer {i} was {a}, wanted {want} — the resampler is changing the pitch"
            );
        }
    }

    // ---- The fold ----

    #[test]
    fn a_notes_octave_strays_are_folded_into_it() {
        let mut m = vec![40.0, 52.0, 52.1, 51.9, 52.0, 64.0];
        assert!((folded_median(&mut m) - 52.0).abs() < 0.1);
    }

    // ---- The verdicts ----

    fn heard(start_ms: f64, midi: f64) -> NoteEvent {
        NoteEvent {
            start_ms,
            end_ms: start_ms + 200.0,
            midi,
            confidence: 0.9,
        }
    }

    fn onset(id: u32, notes: &[u32], at: Option<f64>) -> MatchedOnset {
        MatchedOnset {
            id,
            note_ids: notes.to_vec(),
            state: if at.is_some() {
                OnsetState::Hit
            } else {
                OnsetState::Miss
            },
            heard_at_ms: at,
        }
    }

    #[test]
    fn the_right_note_the_wrong_note_and_the_wrong_octave_are_three_answers() {
        let score = [
            ScoreNote { id: 0, midi: 64.0 },
            ScoreNote { id: 1, midi: 65.0 },
            ScoreNote { id: 2, midi: 67.0 },
            ScoreNote { id: 3, midi: 69.0 },
        ];
        let events = [
            heard(0.0, 64.10),   // right, 10 cents sharp
            heard(250.0, 67.00), // the wrong note — a fifth, not a fourth
            heard(500.0, 79.02), // an octave up
        ];
        let onsets = [
            onset(0, &[0], Some(0.0)),
            onset(1, &[1], Some(250.0)),
            onset(2, &[2], Some(500.0)),
            onset(3, &[3], None),
        ];
        let v = match_notes(&events, &score, &onsets, &MatchConfig::default());
        assert_eq!(v.len(), 4);
        assert_eq!(v[0].state, NoteState::Right);
        assert!((v[0].cents_off.unwrap() - 10.0).abs() < 1e-9);

        assert_eq!(v[1].state, NoteState::Wrong);
        // THE WRONG NOTE IS IDENTIFIED AS THAT NOTE, which is the whole
        // difference between "that was wrong" and a coach that can say what
        // you played instead.
        assert_eq!(v[1].heard_midi.unwrap().round() as i32, 67);
        assert!((v[1].cents_off.unwrap() - 200.0).abs() < 1e-9);

        assert_eq!(v[2].state, NoteState::Octave);
        assert!((v[2].cents_off.unwrap() - 1202.0).abs() < 1e-9);

        assert_eq!(v[3].state, NoteState::Unheard);
        assert_eq!(v[3].heard_midi, None);
    }

    #[test]
    fn a_chord_is_not_assessed_and_carries_no_reading() {
        let score = [
            ScoreNote { id: 0, midi: 52.0 },
            ScoreNote { id: 1, midi: 56.0 },
            ScoreNote { id: 2, midi: 59.0 },
        ];
        let events = [heard(0.0, 52.0)];
        let onsets = [onset(0, &[0, 1, 2], Some(0.0))];
        let v = match_notes(&events, &score, &onsets, &MatchConfig::default());
        assert_eq!(v.len(), 3);
        for n in &v {
            assert_eq!(n.state, NoteState::NotAssessed);
            assert_eq!(n.heard_midi, None, "a chord must not carry one note's reading");
            assert_eq!(n.cents_off, None);
        }
    }

    #[test]
    fn a_soft_onset_nobody_heard_is_not_a_wrong_note() {
        let score = [ScoreNote { id: 0, midi: 64.0 }];
        let onsets = [MatchedOnset {
            id: 0,
            note_ids: vec![0],
            state: OnsetState::SoftAbsent,
            heard_at_ms: None,
        }];
        let v = match_notes(&[], &score, &onsets, &MatchConfig::default());
        assert_eq!(v[0].state, NoteState::NotAssessed);
    }

    #[test]
    fn a_hit_with_nothing_periodic_under_it_is_unheard_and_not_wrong() {
        // A dead note: the onset detector heard the pick, the tracker found
        // no pitch. Calling that "wrong note" would be inventing a note.
        let score = [ScoreNote { id: 0, midi: 64.0 }];
        let onsets = [onset(0, &[0], Some(1000.0))];
        let v = match_notes(&[heard(0.0, 64.0)], &score, &onsets, &MatchConfig::default());
        assert_eq!(v[0].state, NoteState::Unheard);
    }

    /// The timing pass says "23 ms late"; the pitch track is on the
    /// buffer's clock. This is the one place the two are added up.
    #[test]
    fn a_deviation_and_an_expected_moment_make_a_played_moment() {
        let hit = MatchedOnset::from_result(3, vec![7], OnsetState::Hit, 4000.0, Some(23.0));
        assert_eq!(hit.heard_at_ms, Some(4023.0));
        let early = MatchedOnset::from_result(4, vec![8], OnsetState::Hit, 4000.0, Some(-18.5));
        assert_eq!(early.heard_at_ms, Some(3981.5));
        // A note nobody played has no moment, whatever it was due at.
        let missed = MatchedOnset::from_result(5, vec![9], OnsetState::Miss, 4250.0, None);
        assert_eq!(missed.heard_at_ms, None);
        let soft = MatchedOnset::from_result(6, vec![10], OnsetState::SoftAbsent, 4500.0, None);
        assert_eq!(soft.heard_at_ms, None);
    }

    #[test]
    fn onset_stamps_become_offsets_into_the_buffer() {
        let start = 5_000_000_000u64;
        let got = onsets_ms_from_ns(&[start, start + 250_000_000, start - 1], start);
        assert_eq!(got.len(), 2);
        assert!((got[0] - 0.0).abs() < 1e-9);
        assert!((got[1] - 250.0).abs() < 1e-9);
    }
}
