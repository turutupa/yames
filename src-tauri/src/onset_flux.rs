//! The second onset detector: attacks the first one does not hear.
//!
//! aubio's complex-domain detector (`onset.rs`) is exact on a clean signal
//! and goes deaf on three things the detection bench measures
//! (`plans/detection/PROGRESS.md`, M6): a room with noise in it, automatic
//! gain, and an attack that adds little energy (a hammer-on, a pull-off).
//! This one reads the same hops and answers a different question: **did
//! any band of the spectrum rise, measured against how loud this player has
//! lately been?** Everything in it is a ratio, so a gain change (a hot
//! pickup, a phone's automatic gain) moves nothing:
//!
//! - the spectrum is folded into quarter-octave bands, 80 Hz to 8 kHz;
//! - each band's rise is taken in the log domain, above a floor that is the
//!   larger of that band's own background (a slow minimum) and a fixed
//!   distance under the loudest the input has recently been. The first keeps
//!   steady noise from counting; the second makes a sound far quieter than
//!   the playing (a brushed string, a chair) small, however clean the input;
//! - a peak of the summed rise is an attack when it stands clear of the
//!   last 100 ms of itself and is not small beside the player's last notes.
//!
//! It allocates when it is built and never after, takes no lock and makes no
//! system call: one 1024-point transform and a few hundred floating-point
//! operations per hop. `OnsetCore` owns it, asks it once per hop, and lets
//! aubio's own onset win whenever both hear the same attack.

use crate::pitch::Fft;

/// The analysis window, seconds. A power of two of samples near this is used:
/// 1024 at 44.1 and 48 kHz, 2048 at 96 kHz.
const WINDOW_SECS: f32 = 0.0213;
/// The bands run from here ...
const BAND_LOW_HZ: f32 = 80.0;
/// ... to here (or to Nyquist), ...
const BAND_HIGH_HZ: f32 = 8000.0;
/// ... this many to the octave.
const BANDS_PER_OCTAVE: f32 = 4.0;
const MAX_BANDS: usize = 32;
/// The summed rise peaks in the hop that ends this far after the attack, as
/// a share of the analysis window: once most of the window is past the
/// attack. Measured on the detection bench against the true attack times
/// (15.5 ms at 48 kHz), and what puts this detector's onsets on aubio's clock.
const PEAK_AFTER_ATTACK_WINDOWS: f64 = 0.73;
/// The summed rise is kept this long: the threshold reads the part before a
/// peak.
const HISTORY: usize = 64;
/// How far back the threshold looks, seconds.
const THRESHOLD_LOOKBACK_SECS: f32 = 0.10;
/// Two peaks closer than this are one attack. At 44.1 and 48 kHz two peaks
/// are two hops apart at the least, which is already more; at 96 kHz a hop
/// is 2.7 ms and the first attack out of silence peaks twice inside 6 ms.
const MIN_GAP_SECS: f32 = 0.010;
/// How many of the player's last attacks the salience test remembers, and
/// for how long after the last of them.
const RECENT: usize = 8;
const RECENT_MEMORY_NS: u64 = 30_000_000_000;

/// What the detector says of one hop.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FluxOnset {
    /// Where the attack's peak fell, in hops after the END of the hop just
    /// analysed. Negative: the peak is always in the past (it is called one
    /// hop after it happened), and it is placed between hops by a parabola
    /// through the three values around it.
    pub hops_from_now: f32,
    /// How far the peak stood above its surroundings, against what this
    /// player's recent attacks measured: 1.0 is a typical one.
    pub salience: f32,
}

/// The numbers the detector is tuned by. One set for every input: nothing in
/// here is a level.
#[derive(Debug, Clone, Copy)]
pub struct FluxTuning {
    /// A band counts from this far under the loudest recent input (amplitude
    /// ratio).
    pub floor_under_peak: f32,
    /// ... and from this many times its own background.
    pub floor_over_background: f32,
    /// A peak must clear the median of the lookback by this many of its mean
    /// absolute deviations ...
    pub threshold_spread: f32,
    /// ... plus this much, in summed log units.
    pub threshold_offset: f32,
    /// And it must be at least this fraction of the player's recent attacks.
    pub min_salience: f32,
    /// Before any attack has been heard, the whole input must rise by this
    /// factor across the peak.
    pub first_note_rise: f32,
    /// The rise is measured against the larger of the frame this far back
    /// and the hop before it, seconds. In seconds and not hops, like the
    /// window: at 96 kHz a hop is 2.7 ms and at 16 kHz (a Bluetooth headset
    /// on Android) it is 16 ms. Two hops at 44.1 and 48 kHz.
    pub lag_secs: f32,
    /// Half-life of the "loudest recent input", seconds.
    pub peak_half_life_secs: f32,
}

impl Default for FluxTuning {
    fn default() -> Self {
        Self {
            floor_under_peak: 0.05,
            floor_over_background: 2.0,
            threshold_spread: 3.0,
            threshold_offset: 1.0,
            min_salience: 0.25,
            first_note_rise: 1.6,
            lag_secs: 0.0107,
            peak_half_life_secs: 5.0,
        }
    }
}

pub struct FluxDetector {
    tuning: FluxTuning,
    fft: Fft,
    n_fft: usize,
    sample_rate: u32,
    /// The last `n_fft` samples.
    frame: Vec<f32>,
    window: Vec<f32>,
    re: Vec<f64>,
    im: Vec<f64>,
    /// `bands + 1` bin edges.
    edges: [usize; MAX_BANDS + 1],
    bands: usize,
    /// Band magnitudes of the last frames, newest at `mag_pos`.
    mags: Vec<[f32; MAX_BANDS]>,
    mag_pos: usize,
    /// Each band's background: a minimum that creeps up.
    background: [f32; MAX_BANDS],
    background_creep: f32,
    /// The loudest broadband magnitude lately, decaying.
    peak: f32,
    peak_decay: f32,
    /// The broadband magnitude of the last hops, on the same ring as `flux`.
    levels: [f32; HISTORY],
    /// The summed rise of the last hops, newest at `flux_pos`.
    flux: [f32; HISTORY],
    flux_pos: usize,
    lookback: usize,
    /// `tuning.lag_secs` in hops, at least one.
    lag: usize,
    /// Two peaks closer than this many hops are one attack ([`MIN_GAP_SECS`]).
    min_gap: u64,
    last_onset_frame: Option<u64>,
    frames_seen: u64,
    /// The first frames after a reset read a window half full of nothing.
    warmup_frames: u64,
    recent: [f32; RECENT],
    recent_count: usize,
    last_recent_ns: u64,
}

impl FluxDetector {
    pub fn new(sample_rate: u32, hop_size: usize) -> Self {
        Self::with_tuning(sample_rate, hop_size, FluxTuning::default())
    }

    pub fn with_tuning(sample_rate: u32, hop_size: usize, tuning: FluxTuning) -> Self {
        let rate = sample_rate.max(8000) as f32;
        let n_fft = ((rate * WINDOW_SECS) as usize).next_power_of_two().clamp(256, 8192).max(hop_size.next_power_of_two());
        let hops_per_sec = rate / hop_size.max(1) as f32;
        let bin_hz = rate / n_fft as f32;
        let top = BAND_HIGH_HZ.min(rate * 0.45);
        // Quarter-octave edges, each band at least one bin wide.
        let mut edges = [0usize; MAX_BANDS + 1];
        let mut bands = 0;
        let mut lo = ((BAND_LOW_HZ / bin_hz).round() as usize).max(1);
        edges[0] = lo;
        let mut k = 1;
        while bands < MAX_BANDS {
            let f = BAND_LOW_HZ * 2f32.powf(k as f32 / BANDS_PER_OCTAVE);
            k += 1;
            if f > top * 1.001 {
                break;
            }
            let hi = ((f / bin_hz).round() as usize).min(n_fft / 2);
            if hi <= lo {
                continue;
            }
            bands += 1;
            edges[bands] = hi;
            lo = hi;
        }
        let window = (0..n_fft).map(|i| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / n_fft as f32).cos()).collect();
        let lag = ((tuning.lag_secs * hops_per_sec).round() as usize).clamp(1, 8);
        Self {
            tuning,
            fft: Fft::new(n_fft),
            n_fft,
            sample_rate: sample_rate.max(8000),
            frame: vec![0.0; n_fft],
            window,
            re: vec![0.0; n_fft],
            im: vec![0.0; n_fft],
            edges,
            bands,
            mags: vec![[0.0; MAX_BANDS]; lag + 2],
            mag_pos: 0,
            background: [0.0; MAX_BANDS],
            // doubles in about two seconds
            background_creep: 2f32.powf(1.0 / (2.0 * hops_per_sec)),
            peak: 0.0,
            peak_decay: 0.5f32.powf(1.0 / (tuning.peak_half_life_secs.max(0.1) * hops_per_sec)),
            levels: [0.0; HISTORY],
            flux: [0.0; HISTORY],
            flux_pos: 0,
            lookback: ((THRESHOLD_LOOKBACK_SECS * hops_per_sec).round() as usize).clamp(6, HISTORY - 3),
            lag,
            min_gap: (MIN_GAP_SECS * hops_per_sec).ceil() as u64,
            last_onset_frame: None,
            frames_seen: 0,
            warmup_frames: (n_fft / hop_size.max(1)) as u64 + lag as u64 + 2,
            recent: [0.0; RECENT],
            recent_count: 0,
            last_recent_ns: 0,
        }
    }

    /// How long after an attack the hop that holds its peak ends, ns.
    pub fn peak_after_attack_ns(&self) -> u64 {
        (PEAK_AFTER_ATTACK_WINDOWS * self.n_fft as f64 * 1e9 / self.sample_rate as f64) as u64
    }

    /// The click stopped: forget the audio, keep nothing across the gap.
    pub fn reset(&mut self) {
        self.frame.iter_mut().for_each(|v| *v = 0.0);
        self.mags.iter_mut().for_each(|m| *m = [0.0; MAX_BANDS]);
        self.background = [0.0; MAX_BANDS];
        self.peak = 0.0;
        self.flux = [0.0; HISTORY];
        self.frames_seen = 0;
        self.last_onset_frame = None;
        self.recent_count = 0;
    }

    /// One hop of audio, ending at `now_ns`. Says whether the hop BEFORE this
    /// one held the peak of an attack.
    pub fn process(&mut self, hop: &[f32], now_ns: u64) -> Option<FluxOnset> {
        let n = self.n_fft;
        let h = hop.len().min(n);
        self.frame.copy_within(h.., 0);
        self.frame[n - h..].copy_from_slice(&hop[hop.len() - h..]);
        for i in 0..n {
            self.re[i] = (self.frame[i] * self.window[i]) as f64;
            self.im[i] = 0.0;
        }
        self.fft.run(&mut self.re, &mut self.im, false);

        // Band magnitudes, and the broadband one.
        let slots = self.mags.len();
        let norm = 2.0 / n as f64;
        let mut total = 0.0f64;
        let mut now = [0.0f32; MAX_BANDS];
        for b in 0..self.bands {
            let mut p = 0.0f64;
            for k in self.edges[b]..self.edges[b + 1] {
                p += self.re[k] * self.re[k] + self.im[k] * self.im[k];
            }
            total += p;
            now[b] = (p.sqrt() * norm) as f32;
        }
        let level = (total.sqrt() * norm) as f32;
        // A NaN or an infinity from the device would sit in `peak` for good
        // (`max` keeps an infinity) and every band would be under the floor
        // from then on. The hop is skipped; the bad samples leave the frame
        // within a window.
        // Skipped before the history moves on: a slot that was stepped to
        // and never written would hold the frame of a whole history ago, and
        // serve as a rise's reference later.
        if !level.is_finite() {
            return None;
        }
        self.mag_pos = (self.mag_pos + 1) % slots;
        self.peak = (self.peak * self.peak_decay).max(level);
        let under_peak = self.peak * self.tuning.floor_under_peak;

        // The summed rise against the larger of two earlier frames.
        let lag = self.lag;
        let a = &self.mags[(self.mag_pos + slots - lag) % slots];
        let b2 = &self.mags[(self.mag_pos + slots - lag - 1) % slots];
        let mut rise = 0.0f32;
        for b in 0..self.bands {
            let m = now[b];
            // the background: down at once, up slowly
            let bg = &mut self.background[b];
            *bg = if self.frames_seen == 0 { m } else { (*bg * self.background_creep).min(m.max(1e-9)) };
            let floor = (*bg * self.tuning.floor_over_background).max(under_peak).max(1e-7);
            let before = a[b].max(b2[b]);
            if m > before {
                rise += ((m + floor) / (before + floor)).ln();
            }
        }
        self.mags[self.mag_pos] = now;
        self.frames_seen += 1;

        self.flux_pos = (self.flux_pos + 1) % HISTORY;
        self.levels[self.flux_pos] = level;
        self.flux[self.flux_pos] = if self.frames_seen <= self.warmup_frames { 0.0 } else { rise };
        if self.frames_seen <= self.warmup_frames + 2 {
            return None;
        }

        // Was the hop before this one a peak?
        let at = |back: usize| self.flux[(self.flux_pos + HISTORY - back) % HISTORY];
        let (next, here, prev) = (at(0), at(1), at(2));
        if !(here > next && here >= prev) {
            return None;
        }
        let mut sorted = [0.0f32; HISTORY];
        let w = self.lookback;
        for i in 0..w {
            sorted[i] = at(2 + i);
        }
        let hist = &mut sorted[..w];
        hist.sort_unstable_by(|x, y| x.total_cmp(y));
        let median = hist[w / 2];
        let spread = hist.iter().map(|v| (v - median).abs()).sum::<f32>() / w as f32;
        let contrast = here - median;
        if contrast < self.tuning.threshold_spread * spread + self.tuning.threshold_offset {
            return None;
        }
        // Small beside the player's recent attacks: a stray sound.
        let salience = match self.recent_level(now_ns) {
            Some(typical) if typical > 0.0 => contrast / typical,
            // Nobody has played yet, so there is nothing to be small beside:
            // the input as a whole has to have got louder. A room's noise
            // moves band by band and not as a whole.
            _ => {
                let lv = |back: usize| self.levels[(self.flux_pos + HISTORY - back) % HISTORY];
                let before = lv(2 + lag).max(lv(3 + lag)).max(1e-7);
                if lv(0).max(lv(1)) < self.tuning.first_note_rise * before {
                    return None;
                }
                1.0
            }
        };
        if salience < self.tuning.min_salience {
            return None;
        }
        if self.last_onset_frame.is_some_and(|f| self.frames_seen - f < self.min_gap) {
            return None;
        }
        self.last_onset_frame = Some(self.frames_seen);
        self.recent[self.recent_count % RECENT] = contrast;
        self.recent_count += 1;
        self.last_recent_ns = now_ns;

        // Between hops, by a parabola through the three values.
        let denom = prev - 2.0 * here + next;
        let frac = if denom < 0.0 { (0.5 * (prev - next) / denom).clamp(-0.5, 0.5) } else { 0.0 };
        Some(FluxOnset { hops_from_now: -1.0 + frac, salience })
    }

    /// Forget how loud the recent attacks were, and nothing else. For when
    /// what was just heard was not the player: a listen demo through the
    /// speakers must not be the measure the player's own soft notes are
    /// small beside for the next 30 s.
    pub fn forget_recent_attacks(&mut self) {
        self.recent_count = 0;
        self.last_recent_ns = 0;
    }

    /// How far the summed rise of the last three hops stands above the 100 ms
    /// before them. `OnsetCore` asks this when aubio called an onset its
    /// level gate refused: a real attack shows here whatever the level does.
    pub fn rise_now(&self) -> f32 {
        if self.frames_seen <= self.warmup_frames + 2 {
            return 0.0;
        }
        let at = |back: usize| self.flux[(self.flux_pos + HISTORY - back) % HISTORY];
        let newest = at(0).max(at(1)).max(at(2));
        let mut sorted = [0.0f32; HISTORY];
        let w = self.lookback;
        for i in 0..w {
            sorted[i] = at(3 + i);
        }
        let hist = &mut sorted[..w];
        hist.sort_unstable_by(|x, y| x.total_cmp(y));
        newest - hist[w / 2]
    }

    /// The median contrast of the last few attacks, while they are recent.
    fn recent_level(&self, now_ns: u64) -> Option<f32> {
        let count = self.recent_count.min(RECENT);
        if count < 3 || now_ns.saturating_sub(self.last_recent_ns) > RECENT_MEMORY_NS {
            return None;
        }
        let mut sorted = self.recent;
        let window = &mut sorted[..count];
        window.sort_unstable_by(|a, b| a.total_cmp(b));
        Some(window[count / 2])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;
    const HOP: usize = 256;

    struct Rng(u64);
    impl Rng {
        fn bipolar(&mut self) -> f32 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            (self.0 >> 40) as f32 / (1u64 << 23) as f32 - 1.0
        }
    }

    /// Plucked-ish notes at the given times (seconds, Hz, level) over noise.
    fn signal(seconds: f32, noise: f32, notes: &[(f32, f32, f32)]) -> Vec<f32> {
        signal_at(RATE, seconds, noise, notes)
    }

    fn signal_at(rate: u32, seconds: f32, noise: f32, notes: &[(f32, f32, f32)]) -> Vec<f32> {
        let mut rng = Rng(0x1234_5678_9ABC);
        let n = (seconds * rate as f32) as usize;
        let mut x: Vec<f32> = (0..n).map(|_| noise * rng.bipolar()).collect();
        for &(t0, hz, level) in notes {
            let i0 = (t0 * rate as f32) as usize;
            for i in i0..n {
                let t = (i - i0) as f32 / rate as f32;
                let env = level * (1.0 - (-t / 0.002).exp()) * (-t / 0.35).exp();
                for (h, a) in [(1.0, 1.0), (2.0, 0.5), (3.0, 0.33), (4.0, 0.2)] {
                    x[i] += env * a * (2.0 * std::f32::consts::PI * hz * h * t).sin();
                }
            }
        }
        x
    }

    /// Attack times the detector calls, seconds.
    fn attacks(x: &[f32]) -> Vec<f32> {
        attacks_at(RATE, x)
    }

    fn attacks_at(rate: u32, x: &[f32]) -> Vec<f32> {
        let mut d = FluxDetector::new(rate, HOP);
        let hop_s = HOP as f32 / rate as f32;
        let lag_s = d.peak_after_attack_ns() as f32 / 1e9;
        let mut out = Vec::new();
        for (k, hop) in x.chunks_exact(HOP).enumerate() {
            let end_s = (k + 1) as f32 * hop_s;
            if let Some(o) = d.process(hop, (end_s as f64 * 1e9) as u64) {
                out.push(end_s + o.hops_from_now * hop_s - lag_s);
            }
        }
        out
    }

    const NOTES: [(f32, f32, f32); 6] = [(1.0, 196.0, 0.3), (1.4, 220.0, 0.3), (1.8, 247.0, 0.3), (2.2, 262.0, 0.3), (2.6, 294.0, 0.3), (3.0, 330.0, 0.3)];

    fn each_heard_once(found: &[f32]) {
        assert_eq!(found.len(), NOTES.len(), "onsets at {found:?}");
        for (k, (f, n)) in found.iter().zip(NOTES).enumerate() {
            // The first attack out of silence has no loudness to be measured
            // against yet, so its rise saturates as soon as the window
            // touches it and it is put up to two hops early. On a clean input
            // aubio hears that note and its timestamp is the one used.
            let tolerance = if k == 0 { 0.012 } else { 0.006 };
            assert!((f - n.0).abs() < tolerance, "an attack at {} was put at {f}", n.0);
        }
    }

    #[test]
    fn a_room_with_nobody_playing_is_not_an_attack() {
        assert!(attacks(&signal(6.0, 0.02, &[])).is_empty());
        assert!(attacks(&signal(6.0, 0.0, &[])).is_empty());
    }

    #[test]
    fn notes_are_heard_once_each_and_on_time() {
        each_heard_once(&attacks(&signal(4.0, 0.0005, &NOTES)));
    }

    /// The lag and the lookback are lengths of time: the same notes are heard
    /// once each where a hop is 2.7 ms and where it is 16 ms.
    #[test]
    fn notes_are_heard_once_each_at_other_sample_rates() {
        for rate in [16_000, 44_100, 96_000] {
            let found = attacks_at(rate, &signal_at(rate, 4.0, 0.0005, &NOTES));
            assert_eq!(found.len(), NOTES.len(), "at {rate} Hz: onsets at {found:?}");
            // a hop of slack on top of the 48 kHz tolerance: at 16 kHz a hop is 16 ms
            let slack = 0.012 + HOP as f32 / rate as f32;
            for (f, n) in found.iter().zip(NOTES) {
                assert!((f - n.0).abs() < slack, "at {rate} Hz an attack at {} was put at {f}", n.0);
            }
        }
    }

    #[test]
    fn the_lag_is_a_length_of_time() {
        for (rate, lag, lookback) in [(16_000, 1, 6), (44_100, 2, 17), (48_000, 2, 19), (96_000, 4, 38)] {
            let d = FluxDetector::new(rate, HOP);
            assert_eq!((d.lag, d.lookback), (lag, lookback), "at {rate} Hz");
        }
    }

    #[test]
    fn a_sample_that_is_not_a_number_does_not_deafen_the_detector() {
        let mut x = signal(4.0, 0.0005, &NOTES);
        x[(0.5 * RATE as f32) as usize] = f32::NAN;
        x[(0.6 * RATE as f32) as usize] = f32::INFINITY;
        each_heard_once(&attacks(&x));
    }

    #[test]
    fn noise_twenty_six_decibels_under_the_notes_changes_nothing() {
        each_heard_once(&attacks(&signal(4.0, 0.015, &NOTES)));
    }

    #[test]
    fn the_gain_of_the_input_changes_nothing() {
        let x = signal(4.0, 0.002, &NOTES);
        let quiet: Vec<f32> = x.iter().map(|v| v * 0.05).collect();
        assert_eq!(attacks(&x), attacks(&quiet));
    }

    #[test]
    fn a_sound_far_quieter_than_the_playing_is_not_a_note() {
        let mut notes = NOTES.to_vec();
        notes.push((3.2, 587.0, 0.3 * 0.03));
        each_heard_once(&attacks(&signal(4.0, 0.0005, &notes)));
    }

    #[test]
    fn a_new_pitch_over_a_ringing_note_is_heard_without_a_rise_in_level() {
        // a hammer-on: the old note stops, the new one starts at under half
        let mut notes = NOTES.to_vec();
        notes.push((3.25, 370.0, 0.12));
        let found = attacks(&signal(4.0, 0.0005, &notes));
        assert!(found.iter().any(|f| (f - 3.25).abs() < 0.008), "onsets at {found:?}");
    }

    /// `node scripts/rust-test.mjs --release --lib --no-default-features
    /// cost_per_hop -- --ignored --nocapture`: what the onset thread pays per
    /// hop for this detector, and for the whole core with it.
    #[test]
    #[ignore]
    fn cost_per_hop() {
        use crate::audio_input::RingBuffer;
        use crate::instrument::Instrument;
        use crate::onset::{OnsetCore, TempoContext};
        let x = signal(60.0, 0.01, &NOTES);
        let hops = x.len() / HOP;
        let mut best = (f64::MAX, f64::MAX);
        for _ in 0..5 {
            let mut d = FluxDetector::new(RATE, HOP);
            let started = std::time::Instant::now();
            let mut found = 0;
            for (k, hop) in x.chunks_exact(HOP).enumerate() {
                found += d.process(hop, k as u64 * 5_333_333).is_some() as u32;
            }
            let flux = started.elapsed().as_nanos() as f64 / hops as f64;
            std::hint::black_box(found);

            let mut core = OnsetCore::new(&Instrument::ElectricGuitar.profile(), RATE);
            let ctx = TempoContext::new(100, 2);
            let mut ring = RingBuffer::new(RATE as usize * 4);
            let mut sink = |_o| {};
            core.pull(&ring);
            let started = std::time::Instant::now();
            for (k, hop) in x.chunks_exact(HOP).enumerate() {
                ring.write(hop);
                core.pull(&ring);
                core.process(5_000_000_000 + k as u64 * 5_333_333, &ctx, &mut sink);
            }
            let whole = started.elapsed().as_nanos() as f64 / hops as f64;
            best = (best.0.min(flux), best.1.min(whole));
        }
        println!("second detector {:.0} ns/hop; whole core (ring, aubio, gates, second detector) {:.0} ns/hop; a hop is 5,333,333 ns", best.0, best.1);
    }

    #[test]
    fn other_sample_rates_get_a_window_of_the_same_length() {
        for (rate, n) in [(44_100, 1024), (48_000, 1024), (96_000, 2048)] {
            let d = FluxDetector::new(rate, HOP);
            assert_eq!(d.n_fft, n);
            assert!(d.bands >= 20 && d.bands <= MAX_BANDS, "{} bands at {rate}", d.bands);
        }
    }
}
