//! A small radix-2 FFT for the detection layer's spectra. Not on any audio
//! thread: everything in `detect` runs after a Take or on a background
//! thread, so this allocates its tables once per plan and is otherwise plain.

use std::f64::consts::PI;

/// A plan for one power-of-two size.
pub struct Fft {
    n: usize,
    cos: Vec<f64>,
    sin: Vec<f64>,
    rev: Vec<usize>,
}

impl Fft {
    pub fn new(n: usize) -> Self {
        assert!(n.is_power_of_two() && n >= 2, "FFT size must be a power of two");
        let bits = n.trailing_zeros();
        let rev = (0..n).map(|i| i.reverse_bits() >> (usize::BITS - bits)).collect();
        let cos = (0..n / 2).map(|k| (2.0 * PI * k as f64 / n as f64).cos()).collect();
        let sin = (0..n / 2).map(|k| (2.0 * PI * k as f64 / n as f64).sin()).collect();
        Self { n, cos, sin, rev }
    }

    pub fn len(&self) -> usize {
        self.n
    }

    pub fn is_empty(&self) -> bool {
        false
    }

    /// In place, forward (`inverse == false`) or unnormalised inverse.
    pub fn transform(&self, re: &mut [f64], im: &mut [f64], inverse: bool) {
        let n = self.n;
        debug_assert!(re.len() == n && im.len() == n);
        for i in 0..n {
            let j = self.rev[i];
            if j > i {
                re.swap(i, j);
                im.swap(i, j);
            }
        }
        let mut len = 2;
        while len <= n {
            let half = len / 2;
            let step = n / len;
            let mut start = 0;
            while start < n {
                for k in 0..half {
                    let c = self.cos[k * step];
                    let s = if inverse { self.sin[k * step] } else { -self.sin[k * step] };
                    let (a, b) = (start + k, start + k + half);
                    let tr = re[b] * c - im[b] * s;
                    let ti = re[b] * s + im[b] * c;
                    re[b] = re[a] - tr;
                    im[b] = im[a] - ti;
                    re[a] += tr;
                    im[a] += ti;
                }
                start += len;
            }
            len <<= 1;
        }
    }
}

/// `x` convolved with `h`, cut to `x.len()`. Overlap-add, for the long room
/// responses the bench's capture chains use.
pub fn convolve_same_len(x: &[f64], h: &[f64]) -> Vec<f64> {
    if x.is_empty() || h.is_empty() {
        return vec![0.0; x.len()];
    }
    let n = (2 * h.len()).next_power_of_two().max(4096);
    let block = n - h.len() + 1;
    let fft = Fft::new(n);
    let mut hr = vec![0.0; n];
    let mut hi = vec![0.0; n];
    hr[..h.len()].copy_from_slice(h);
    fft.transform(&mut hr, &mut hi, false);
    let mut out = vec![0.0; x.len() + n];
    let mut xr = vec![0.0; n];
    let mut xi = vec![0.0; n];
    let mut at = 0;
    while at < x.len() {
        let end = (at + block).min(x.len());
        xr.iter_mut().for_each(|v| *v = 0.0);
        xi.iter_mut().for_each(|v| *v = 0.0);
        xr[..end - at].copy_from_slice(&x[at..end]);
        fft.transform(&mut xr, &mut xi, false);
        for k in 0..n {
            let (a, b) = (xr[k], xi[k]);
            xr[k] = a * hr[k] - b * hi[k];
            xi[k] = a * hi[k] + b * hr[k];
        }
        fft.transform(&mut xr, &mut xi, true);
        for k in 0..n {
            out[at + k] += xr[k] / n as f64;
        }
        at = end;
    }
    out.truncate(x.len());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_sine_lands_in_its_bin() {
        let n = 256;
        let fft = Fft::new(n);
        let mut re: Vec<f64> = (0..n).map(|i| (2.0 * PI * 8.0 * i as f64 / n as f64).sin()).collect();
        let mut im = vec![0.0; n];
        fft.transform(&mut re, &mut im, false);
        let mag: Vec<f64> = re.iter().zip(&im).map(|(a, b)| (a * a + b * b).sqrt()).collect();
        let peak = (0..n / 2).max_by(|a, b| mag[*a].total_cmp(&mag[*b])).unwrap();
        assert_eq!(peak, 8);
        assert!((mag[8] - n as f64 / 2.0).abs() < 1e-6);
    }

    #[test]
    fn convolution_matches_the_direct_sum() {
        let x: Vec<f64> = (0..5000).map(|i| ((i * 37 % 101) as f64 - 50.0) / 50.0).collect();
        let h: Vec<f64> = (0..300).map(|i| ((i * 13 % 17) as f64 - 8.0) / 8.0).collect();
        let fast = convolve_same_len(&x, &h);
        for &i in &[0usize, 1, 299, 300, 2500, 4999] {
            let mut direct = 0.0;
            for (k, hk) in h.iter().enumerate() {
                if i >= k {
                    direct += x[i - k] * hk;
                }
            }
            assert!((fast[i] - direct).abs() < 1e-6, "at {i}: {} vs {direct}", fast[i]);
        }
    }
}
