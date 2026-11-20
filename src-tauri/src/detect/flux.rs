//! The broadband attack envelope the verifier anchors on: a SuperFlux-style
//! spectral flux (log-mel, each band compared with the maximum of its
//! neighbours two frames back, so a pitch that only wobbles does not count as
//! an attack). The same recipe the research prototype used through librosa
//! (`onset_strength(hop 128, n_fft 1024, lag 2, max_size 3, 96 mels,
//! 60 Hz to 10 kHz)`), so thresholds set there hold here.

use super::fft::Fft;

/// Samples between envelope frames at the analysis rate: 5.8 ms.
pub const FLUX_HOP: usize = 128;
const N_FFT: usize = 1024;
const N_MELS: usize = 96;
const F_MIN: f64 = 60.0;
const F_MAX: f64 = 10_000.0;
const LAG: usize = 2;
const TOP_DB: f64 = 80.0;

fn hz_to_mel(f: f64) -> f64 {
    // Slaney's scale: linear under 1 kHz, logarithmic above.
    let f_sp = 200.0 / 3.0;
    if f < 1000.0 {
        f / f_sp
    } else {
        1000.0 / f_sp + (f / 1000.0).ln() / (6.4f64.ln() / 27.0)
    }
}

fn mel_to_hz(m: f64) -> f64 {
    let f_sp = 200.0 / 3.0;
    let min_log_mel = 1000.0 / f_sp;
    if m < min_log_mel {
        m * f_sp
    } else {
        1000.0 * ((6.4f64.ln() / 27.0) * (m - min_log_mel)).exp()
    }
}

/// Triangular mel filters with Slaney's area normalisation, as sparse rows:
/// `(first bin, weights)`.
fn mel_filters(rate: f64) -> Vec<(usize, Vec<f64>)> {
    let n_bins = N_FFT / 2 + 1;
    let (lo, hi) = (hz_to_mel(F_MIN), hz_to_mel(F_MAX.min(rate / 2.0)));
    let pts: Vec<f64> = (0..N_MELS + 2).map(|i| mel_to_hz(lo + (hi - lo) * i as f64 / (N_MELS + 1) as f64)).collect();
    let bin_hz = rate / N_FFT as f64;
    (0..N_MELS)
        .map(|m| {
            let (a, b, c) = (pts[m], pts[m + 1], pts[m + 2]);
            let norm = 2.0 / (c - a);
            let mut first = None;
            let mut w = Vec::new();
            for k in 0..n_bins {
                let f = k as f64 * bin_hz;
                let v = ((f - a) / (b - a)).min((c - f) / (c - b)).max(0.0) * norm;
                if v > 0.0 {
                    if first.is_none() {
                        first = Some(k);
                    }
                    w.push(v);
                } else if first.is_some() {
                    break;
                }
            }
            (first.unwrap_or(0), w)
        })
        .collect()
}

/// Mel bands per frame of [`mel_db`].
pub const MEL_BANDS: usize = N_MELS;

/// The log-mel spectrogram the envelope is made from, `frames x MEL_BANDS` in
/// dB, clipped 80 dB under its peak: one frame every [`FLUX_HOP`] samples,
/// frame `i` centred on sample `i * FLUX_HOP`. Public for tools that draw it.
pub fn mel_db(y: &[f64], rate: u32) -> (usize, Vec<f64>) {
    let n_frames = y.len() / FLUX_HOP + 1;
    let filters = mel_filters(rate as f64);
    let fft = Fft::new(N_FFT);
    let window: Vec<f64> = (0..N_FFT)
        .map(|i| 0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / N_FFT as f64).cos())
        .collect();
    let half = (N_FFT / 2) as isize;
    let len = y.len() as isize;
    let at = |i: isize| -> f64 {
        // reflect at both ends, as a centred STFT does
        if len == 0 {
            return 0.0;
        }
        let mut j = i;
        if j < 0 {
            j = -j;
        }
        if j >= len {
            j = 2 * (len - 1) - j;
        }
        if j < 0 || j >= len {
            0.0
        } else {
            y[j as usize]
        }
    };
    let mut db = vec![0.0f64; n_frames * N_MELS];
    let mut re = vec![0.0; N_FFT];
    let mut im = vec![0.0; N_FFT];
    let mut peak = f64::MIN;
    for f in 0..n_frames {
        let centre = (f * FLUX_HOP) as isize;
        for k in 0..N_FFT {
            re[k] = at(centre - half + k as isize) * window[k];
            im[k] = 0.0;
        }
        fft.transform(&mut re, &mut im, false);
        for (m, (first, w)) in filters.iter().enumerate() {
            let mut p = 0.0;
            for (j, wj) in w.iter().enumerate() {
                let k = first + j;
                p += wj * (re[k] * re[k] + im[k] * im[k]);
            }
            let v = 10.0 * p.max(1e-10).log10();
            db[f * N_MELS + m] = v;
            peak = peak.max(v);
        }
    }
    let floor = peak - TOP_DB;
    db.iter_mut().for_each(|v| *v = v.max(floor));
    (n_frames, db)
}

/// The envelope of `y` (mono, at `rate`): one value every [`FLUX_HOP`]
/// samples, frame `i` centred on sample `i * FLUX_HOP`.
pub fn broadband_flux(y: &[f64], rate: u32) -> Vec<f32> {
    let (n_frames, db) = mel_db(y, rate);
    let mut out = vec![0.0f32; n_frames];
    for f in LAG..n_frames {
        let (now, then) = (&db[f * N_MELS..(f + 1) * N_MELS], &db[(f - LAG) * N_MELS..(f - LAG + 1) * N_MELS]);
        let mut sum = 0.0;
        for m in 0..N_MELS {
            let lo = m.saturating_sub(1);
            let hi = (m + 1).min(N_MELS - 1);
            let reference = then[lo].max(then[m]).max(then[hi]);
            sum += (now[m] - reference).max(0.0);
        }
        out[f] = (sum / N_MELS as f64) as f32;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_burst_in_silence_is_the_envelope_s_peak() {
        let rate = 22_050u32;
        // a quiet room: digital silence makes every band's leakage look like news
        let mut seed = 0x2545_F491u32;
        let mut y: Vec<f64> = (0..rate as usize)
            .map(|_| {
                seed ^= seed << 13;
                seed ^= seed >> 17;
                seed ^= seed << 5;
                (seed as f64 / u32::MAX as f64 - 0.5) * 2e-3
            })
            .collect();
        // a decaying 440 Hz tone starting at 0.5 s
        let start = rate as usize / 2;
        for i in start..y.len() {
            let t = (i - start) as f64 / rate as f64;
            y[i] += (2.0 * std::f64::consts::PI * 440.0 * t).sin() * (-4.0 * t).exp() * 0.5;
        }
        let flux = broadband_flux(&y, rate);
        let peak = (0..flux.len()).max_by(|a, b| flux[*a].total_cmp(&flux[*b])).unwrap();
        let t = peak as f64 * FLUX_HOP as f64 / rate as f64;
        assert!((t - 0.5).abs() < 0.03, "peak at {t} s");
        // and the ringing tone afterwards is no attack: the noise between
        // notes has an envelope of its own (band powers wander), which is why
        // the verifier scales attacks by the Take's own picks, but it stays
        // well under the pluck
        let later: f32 = flux[peak + 20..].iter().cloned().fold(0.0, f32::max);
        assert!(later < 0.6 * flux[peak], "sustain {later} against attack {}", flux[peak]);
    }
}
