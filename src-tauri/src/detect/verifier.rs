//! Score-informed note verification: did THIS pitch start near THIS time?
//!
//! Yames knows what should be played, so it does not transcribe. For every
//! written note it asks the model's posteriors one question, in the window
//! the timing matcher would give that note:
//!
//!   1. An ATTACK is a peak of the broadband envelope inside the note's
//!      window (0.4 of the gap to the nearest other written onset). Windows of
//!      neighbouring onsets cannot overlap, so an attack answers one onset.
//!   2. With an attack, each written pitch is HEARD if it is sounding over the
//!      middle of the note, or if its own onset fired and no neighbouring
//!      semitone's fired harder. If a neighbour did, the note was WRONG and
//!      the pitch that started is reported. Sounding is not starting: a
//!      pitch already sounding as strongly just before (a string left ringing)
//!      needs its own start here, and a chord tone needs the chord to have
//!      been struck (a real attack, or one of its strings plainly starting)
//!      and, written to ring, still to sound a quarter second on.
//!      Short of that it is UNSURE, never HEARD (card #116).
//!   3. Without an attack (hammer-ons, pull-offs, slides) the written pitch is
//!      HEARD if it sounds after and did not before.
//!   4. Anything in between is UNSURE: "couldn't tell". It is never a miss and
//!      never blocks a pass (owner decision 4, plans/detection/PROGRESS.md).
//!
//! This is a port of the research prototype (`prototypes/bench/verifier.py`,
//! rule v2) with the same thresholds, plus the UNSURE band, which the
//! prototype did not have. Every threshold is a constant below, and the whole
//! decision is deterministic: the same audio gives the same verdicts.

use super::flux::FLUX_HOP;
use super::model::{Posteriors, MIDI_LOW, MODEL_RATE, PITCHES};

/// The pitch range evidence is kept over: C2 to G#6, a guitar and a bit.
pub const P_LO: i32 = 36;
pub const P_HI: i32 = 92;
const NP: usize = (P_HI - P_LO + 1) as usize;

/// "Sounding": the note posterior's mean over the middle of the note.
pub const ACT_THRESHOLD: f32 = 0.40;
/// "Just started", on the soft path.
pub const RISE_THRESHOLD: f32 = 0.30;
/// A broadband peak this strong against the Take's typical pick is an attack.
pub const ATTACK_THRESHOLD: f32 = 0.12;
/// A neighbouring pitch's onset this strong, with the written one's under
/// [`RIVAL_RATIO`] of it, means the neighbour was played instead.
const RIVAL_ONSET: f32 = 0.5;
const RIVAL_RATIO: f32 = 0.85;
/// A pitch whose "sounding" just before the attack is this share of its
/// "sounding" over the note was already ringing: it counts as started only
/// with its own "just started" at [`RESTRIKE_RISE`] or more.
const RINGING_SHARE: f32 = 0.7;
const RESTRIKE_RISE: f32 = 0.25;
/// A chord was struck if its attack is this strong against the Take's typical
/// pick, or one of its written pitches shows "just started" at
/// [`STRUM_RISE`]. A noise bump under a ringing chord is neither.
const STRUM_ATTACK: f32 = 0.2;
const STRUM_RISE: f32 = 0.6;
/// A chord tone written to last this long (seconds) whose "sounding" over
/// 0.25 to 0.5 s after the attack is under [`CHOKED_ACT`] was choked at once.
const CHOKED_MIN_DUR: f64 = 0.6;
const CHOKED_ACT: f32 = 0.04;
/// Evidence over this share of a threshold, but short of it, is "couldn't
/// tell" rather than "no".
const UNSURE_SHARE: f32 = 0.5;

/// What the model saw, cut to the guitar's range, with the attack envelope.
pub struct Evidence {
    pub frames: usize,
    /// Seconds between frames.
    pub dt: f64,
    /// `frames x NP`: this pitch is sounding.
    pub act: Vec<f32>,
    /// `frames x NP`: this pitch just started.
    pub rise: Vec<f32>,
    pub flux: Vec<f32>,
    pub flux_dt: f64,
}

impl Evidence {
    pub fn new(p: &Posteriors, flux: Vec<f32>) -> Self {
        let lo = (P_LO - MIDI_LOW) as usize;
        let mut act = vec![0.0f32; p.frames * NP];
        let mut rise = vec![0.0f32; p.frames * NP];
        for k in 0..p.frames {
            act[k * NP..(k + 1) * NP].copy_from_slice(&p.note[k * PITCHES + lo..k * PITCHES + lo + NP]);
            rise[k * NP..(k + 1) * NP].copy_from_slice(&p.onset[k * PITCHES + lo..k * PITCHES + lo + NP]);
        }
        // a note posterior that climbs is a start too, where the onset output is unsure
        for k in 1..p.frames.saturating_sub(1) {
            for c in 0..NP {
                let d = (act[(k + 1) * NP + c] - act[(k - 1) * NP + c]).max(0.0);
                let r = &mut rise[k * NP + c];
                *r = r.max(0.8 * d);
            }
        }
        Self {
            frames: p.frames,
            dt: Posteriors::frame_seconds(),
            act,
            rise,
            flux,
            flux_dt: FLUX_HOP as f64 / MODEL_RATE as f64,
        }
    }

    fn col(midi: f64) -> usize {
        (midi.round() as i32 - P_LO).clamp(0, NP as i32 - 1) as usize
    }

    /// Mean of `act` in column `col` over frames `[i0, i1)`, at least two.
    fn mean_act(&self, i0: i64, i1: i64, col: usize) -> f32 {
        let i0 = i0.max(0);
        let i1 = i1.max(i0 + 2).min(self.frames as i64);
        if i1 <= i0 {
            return 0.0;
        }
        let mut s = 0.0f32;
        for k in i0..i1 {
            s += self.act[k as usize * NP + col];
        }
        s / (i1 - i0) as f32
    }
}

/// One written note, placed in the audio.
#[derive(Debug, Clone)]
pub struct Expected {
    pub note_id: u32,
    /// Seconds into the audio where the grid says it is due.
    pub t: f64,
    pub midi: f64,
    /// Seconds it is written to last.
    pub dur: f64,
    /// More than one note at its tick.
    pub chord: bool,
    /// Semitones it is bent up, 0 for none.
    pub bend: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Heard {
    /// The written pitch started here.
    Yes,
    /// Nothing of it: no attack and the pitch did not appear.
    No,
    /// Something was played here and it was another pitch.
    Wrong,
    /// The evidence is short of a verdict either way.
    Unsure,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum How {
    /// Anchored on a broadband attack.
    Pick,
    /// No attack: the pitch itself rose.
    Soft,
    None,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Verdict {
    pub note_id: u32,
    pub heard: Heard,
    /// When it started, seconds on the grid's clock (the lag taken out).
    pub t: Option<f64>,
    /// "Sounding" over the note, and just before it.
    pub act: f32,
    pub pre: f32,
    /// "Just started", peak in the window.
    pub rise: f32,
    /// Broadband attack strength against the Take's typical pick; 0 for none.
    pub attack: f32,
    /// The pitch that sounded instead, when one did.
    pub alt_midi: Option<i32>,
    pub how: How,
}

struct Attacks {
    times: Vec<f64>,
    strength: Vec<f32>,
    scale: f32,
}

fn max_filter(x: &[f32], size: usize) -> Vec<f32> {
    let half = size / 2;
    (0..x.len())
        .map(|i| {
            let lo = i.saturating_sub(half);
            let hi = (i + half + 1).min(x.len());
            x[lo..hi].iter().cloned().fold(f32::MIN, f32::max)
        })
        .collect()
}

/// Peaks of the envelope, scaled so 1.0 is a typical pick of this Take: the
/// median of as many of the strongest peaks as half the onsets the score
/// expects.
fn pick_attacks(ev: &Evidence, n_expected: usize) -> Attacks {
    let mx = max_filter(&ev.flux, 7);
    let idx: Vec<usize> = (0..ev.flux.len()).filter(|&i| ev.flux[i] == mx[i] && ev.flux[i] > 0.0).collect();
    if idx.is_empty() {
        return Attacks { times: vec![], strength: vec![], scale: 1.0 };
    }
    let mut vals: Vec<f32> = idx.iter().map(|&i| ev.flux[i]).collect();
    vals.sort_by(|a, b| b.total_cmp(a));
    let top = &vals[..vals.len().min((n_expected / 2).max(4))];
    // numpy's median: the mean of the middle two for an even count
    let m = top.len();
    let median = if m % 2 == 1 { top[m / 2] } else { 0.5 * (top[m / 2 - 1] + top[m / 2]) };
    let scale = median + 1e-9;
    Attacks {
        times: idx.iter().map(|&i| i as f64 * ev.flux_dt).collect(),
        strength: idx.iter().map(|&i| ev.flux[i] / scale).collect(),
        scale,
    }
}

/// One constant offset between the grid and the audio: the shift at which the
/// written onsets sit on the most broadband attack.
fn estimate_lag(ev: &Evidence, grid: &[f64], scale: f32, lo: f64, hi: f64) -> f64 {
    let smooth: Vec<f32> = max_filter(&ev.flux, 5).iter().map(|v| (v / scale).min(1.0)).collect();
    if smooth.is_empty() || grid.is_empty() {
        return 0.0;
    }
    let (mut best, mut best_score) = (0.0, f64::MIN);
    let mut lag = lo;
    while lag < hi {
        let mut s = 0.0f64;
        for t in grid {
            let i = (((t + lag) / ev.flux_dt).round() as i64).clamp(0, smooth.len() as i64 - 1) as usize;
            s += smooth[i] as f64;
        }
        let score = s / grid.len() as f64;
        if score > best_score {
            best = lag;
            best_score = score;
        }
        lag += 0.003;
    }
    best
}

/// Where the lag is searched, seconds: the range the timing matcher's own
/// estimate lives in (`score::estimate_constant_lag_ms`).
pub const LAG_RANGE_S: (f64, f64) = (-0.06, 0.16);

pub struct Verified {
    pub verdicts: Vec<Verdict>,
    /// The offset between the grid and the audio that was used, seconds.
    pub lag: f64,
    /// Broadband attacks found, seconds into the audio, with their strength.
    pub attacks: Vec<(f64, f32)>,
}

/// Verify every expected note. `lag`: `None` to estimate it from the audio.
pub fn verify(ev: &Evidence, expected: &[Expected], lag: Option<f64>) -> Verified {
    let mut grid: Vec<f64> = expected.iter().map(|e| (e.t * 1e4).round() / 1e4).collect();
    grid.sort_by(|a, b| a.total_cmp(b));
    grid.dedup();
    let attacks = pick_attacks(ev, grid.len());
    let lag = lag.unwrap_or_else(|| estimate_lag(ev, &grid, attacks.scale, LAG_RANGE_S.0, LAG_RANGE_S.1));
    let dt = ev.dt;
    let frames = ev.frames as i64;

    let gap_of = |t: f64| -> f64 {
        grid.iter().map(|g| (g - t).abs()).filter(|d| *d > 1e-3).fold(f64::MAX, f64::min).min(if grid.len() > 1 { f64::MAX } else { 0.5 })
    };
    let gap_of = |t: f64| -> f64 {
        let g = gap_of(t);
        if g == f64::MAX {
            0.5
        } else {
            g
        }
    };
    let key = |t: f64| ((t * 1e4).round()) as i64;

    // one attack per written onset: the strongest inside its own window
    let mut attack_of: std::collections::HashMap<i64, (f64, f32)> = std::collections::HashMap::new();
    for &t in &grid {
        let w = (0.4 * gap_of(t)).clamp(0.025, 0.10);
        let mut best: Option<(f64, f32)> = None;
        for (at, st) in attacks.times.iter().zip(&attacks.strength) {
            if *at >= t + lag - w && *at <= t + lag + w && *st >= ATTACK_THRESHOLD && best.is_none_or(|b| *st > b.1) {
                best = Some((*at, *st));
            }
        }
        if let Some(b) = best {
            attack_of.insert(key(t), b);
        }
    }

    // "Just started" at a note's own pitch, peak inside its attack window:
    // (first frame, last frame, peak, the peak's offset from the first).
    let rise_in = |e: &Expected| -> (i64, i64, f32, i64) {
        let w = (0.4 * gap_of(e.t)).clamp(0.025, 0.10);
        let c = Evidence::col(e.midi);
        let i0 = (((e.t + lag - w) / dt).floor() as i64).max(0);
        let i1 = (((e.t + lag + w) / dt).ceil() as i64).min(frames - 1);
        let (mut peak, mut rk) = (0.0f32, 0i64);
        if i1 > i0 {
            peak = f32::MIN;
            for k in i0..=i1 {
                let v = ev.rise[k as usize * NP + c];
                if v > peak {
                    peak = v;
                    rk = k - i0;
                }
            }
        }
        (i0, i1, peak, rk)
    };
    // the clearest start of any written pitch of each chord: one string that
    // plainly started says the chord was struck, however soft the strum
    let mut chord_rise: std::collections::HashMap<i64, f32> = std::collections::HashMap::new();
    for e in expected.iter().filter(|e| e.chord) {
        let r = chord_rise.entry(key(e.t)).or_insert(0.0);
        *r = r.max(rise_in(e).2);
    }

    let fr = |t: f64| (t / dt).round() as i64;
    let mut verdicts = Vec::with_capacity(expected.len());
    for e in expected {
        let gap = gap_of(e.t);
        let g = gap.min(e.dur.max(0.05));
        let (mut a0, mut a1) = ((0.30 * g).clamp(0.015, 0.04), (0.85 * g).clamp(0.045, 0.15));
        if e.chord {
            // a strum takes tens of ms to cross the strings: listen after it has
            a0 = 0.05;
            a1 = (0.85 * g).clamp(0.09, 0.20);
        }
        let c = Evidence::col(e.midi);
        let rounded = (e.t * 1e4).round() / 1e4;
        let next = grid.iter().cloned().find(|x| *x > rounded + 1e-3);
        // on the soft path, never listen into the next written note: without an
        // attack to anchor on, a repeat of this pitch there would answer for it
        let limit = next.map(|n| n + lag - 0.15 * gap_of(n)).unwrap_or(1e9);
        let sounding = |t0: f64, col: usize, capped: bool| -> f32 {
            let end = if capped { (t0 + a1).min(limit) } else { t0 + a1 };
            ev.mean_act(fr(t0 + a0), fr(end), col)
        };
        let before = |t0: f64| -> f32 { ev.mean_act(fr(t0 - a1), fr(t0 - a0), c) };

        let (i0, i1, rise_peak, rk) = rise_in(e);
        // a chord with no attack worth the name and no string of it plainly
        // starting: the strum is not there, whatever is still ringing
        let strum_unclear = |attack: f32| e.chord && attack < STRUM_ATTACK && chord_rise.get(&key(e.t)).copied().unwrap_or(0.0) < STRUM_RISE;
        let t_rise = ((i0 + rk).clamp(0, (frames - 1).max(0))) as f64 * dt;

        let mut alt_midi = None;
        let (heard, how, t_est, act, pre, strength);
        if let Some(&(t_a, st)) = attack_of.get(&key(e.t)) {
            strength = st;
            let mut a = sounding(t_a, c, false);
            if e.bend > 0.0 {
                // a bent note leaves its fret's pitch: accept where it was bent to
                let target = Evidence::col(e.midi + e.bend.round());
                a = a
                    .max(ev.mean_act(fr(t_a + 0.5 * g), fr(t_a + 0.9 * g), target))
                    .max(ev.mean_act(fr(t_a + 0.01), fr(t_a + 0.05), c));
            }
            act = a;
            pre = before(t_a);
            let mut yes = act >= ACT_THRESHOLD;
            let mut rival_pitch = None;
            if !e.chord && e.bend <= 0.0 && i1 > i0 {
                // The onset output is sharp in time where the sustained one is
                // not (it takes about 100 ms to move, so at sixteenths it
                // neither drops for one wrong note nor rises fully for one
                // right one). So ask which pitch STARTED at this attack.
                let (mut rival, mut rival_col) = (0.0f32, c);
                for d in [-2i32, -1, 1, 2] {
                    let cc = c as i32 + d;
                    if cc < 0 || cc >= NP as i32 {
                        continue;
                    }
                    for k in i0..=i1 {
                        let v = ev.rise[k as usize * NP + cc as usize];
                        if v > rival {
                            rival = v;
                            rival_col = cc as usize;
                        }
                    }
                }
                if rival >= RIVAL_ONSET && rise_peak < RIVAL_RATIO * rival {
                    yes = false; // a neighbouring pitch started here instead
                    rival_pitch = Some(P_LO + rival_col as i32);
                } else if rise_peak >= 0.5 && rise_peak >= RIVAL_RATIO * rival && act >= 0.4 * ACT_THRESHOLD {
                    yes = true; // the written pitch started here
                }
            }
            // Sounding is not starting. A pitch already sounding about as
            // strongly before the attack (a string left ringing from the
            // stroke before) counts only if its own start shows here; and a
            // chord tone only if the chord was struck. Short of that it is
            // "couldn't tell": never a miss, never credit (card #116).
            let ringing = pre >= RINGING_SHARE * act && rise_peak < RESTRIKE_RISE;
            // A chord tone written to ring that is gone a quarter second in
            // started and stopped at once: a dead or choked string.
            let choked = e.chord
                && e.bend <= 0.0
                && e.dur >= CHOKED_MIN_DUR
                && fr(t_a + 0.5) <= frames // the audio goes on that long
                && ev.mean_act(fr(t_a + 0.25), fr(t_a + 0.5), c) < CHOKED_ACT;
            let doubt = yes && (ringing || strum_unclear(st) || choked);
            if yes && !doubt {
                heard = Heard::Yes;
                how = How::Pick;
                t_est = Some(t_a);
            } else if doubt {
                heard = Heard::Unsure;
                how = How::None;
                t_est = None;
            } else {
                how = How::None;
                t_est = None;
                // which pitch did sound over the note, if any
                let j0 = fr(t_a + a0).max(0);
                let j1 = fr(t_a + a1).max(j0 + 2).min(frames);
                let mut best = (0.0f32, c);
                if j1 > j0 && !e.chord {
                    for cc in 0..NP {
                        let m = ev.mean_act(j0, j1, cc);
                        if m > best.0 {
                            best = (m, cc);
                        }
                    }
                }
                if let Some(p) = rival_pitch {
                    alt_midi = Some(p);
                    heard = Heard::Wrong;
                } else if best.0 >= ACT_THRESHOLD && best.1.abs_diff(c) == 12 {
                    // The written pitch's octave: the model's own commonest
                    // slip (a strong second harmonic, a string's octave
                    // ringing in sympathy), so not evidence of a wrong note.
                    // "Couldn't tell" (owner decision 4), with what was read.
                    alt_midi = Some(P_LO + best.1 as i32);
                    heard = Heard::Unsure;
                } else if best.0 >= ACT_THRESHOLD && best.1 != c {
                    alt_midi = Some(P_LO + best.1 as i32);
                    heard = Heard::Wrong;
                } else if e.chord && act < UNSURE_SHARE * ACT_THRESHOLD {
                    // the strum was there and this string was not in it
                    heard = Heard::No;
                } else {
                    // an attack with no clear pitch behind it: a muted or
                    // dead note, or one the model could not read
                    heard = Heard::Unsure;
                }
            }
        } else {
            strength = 0.0;
            act = sounding(t_rise, c, true);
            pre = before(t_rise);
            // started here: it sounds after and did not before. A sharp rise is
            // one way to know; a pitch that was absent and is now present (a
            // slide arriving, a gentle hammer-on) is the other.
            let yes = act >= ACT_THRESHOLD && pre < 0.5 * act && (rise_peak >= RISE_THRESHOLD || pre < 0.5 * ACT_THRESHOLD);
            if yes && strum_unclear(0.0) {
                // a chord tone with no attack and no string plainly starting
                how = How::None;
                t_est = None;
                heard = Heard::Unsure;
            } else if yes {
                heard = Heard::Yes;
                how = How::Soft;
                t_est = Some(t_rise);
            } else {
                how = How::None;
                t_est = None;
                heard = if act >= UNSURE_SHARE * ACT_THRESHOLD {
                    // the pitch is there, or half there, and nothing says it
                    // STARTED here: a note still ringing, a repeat with no
                    // attack, a weak capture
                    Heard::Unsure
                } else {
                    Heard::No
                };
            }
        }
        verdicts.push(Verdict {
            note_id: e.note_id,
            heard,
            t: t_est.map(|t| t - lag),
            act,
            pre,
            rise: rise_peak.max(0.0),
            attack: strength,
            alt_midi,
            how,
        });
    }
    Verified {
        verdicts,
        lag,
        attacks: attacks.times.iter().cloned().zip(attacks.strength.iter().cloned()).collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Posteriors built by hand: `notes` are `(start s, end s, midi, picked)`.
    fn evidence(seconds: f64, notes: &[(f64, f64, i32, bool)]) -> Evidence {
        let dt = Posteriors::frame_seconds();
        let frames = (seconds / dt) as usize + 1;
        let mut p = Posteriors { frames, note: vec![0.02; frames * PITCHES], onset: vec![0.01; frames * PITCHES] };
        let flux_dt = FLUX_HOP as f64 / MODEL_RATE as f64;
        let mut flux = vec![0.0f32; (seconds / flux_dt) as usize + 1];
        for &(t0, t1, midi, picked) in notes {
            let c = (midi - MIDI_LOW) as usize;
            for k in (t0 / dt) as usize..((t1 / dt) as usize).min(frames) {
                p.note[k * PITCHES + c] = 0.85;
            }
            let k0 = (t0 / dt).round() as usize;
            p.onset[k0 * PITCHES + c] = 0.9;
            if picked {
                flux[(t0 / flux_dt).round() as usize] = 3.0;
            }
        }
        Evidence::new(&p, flux)
    }

    fn want(id: u32, t: f64, midi: i32) -> Expected {
        Expected { note_id: id, t, midi: midi as f64, dur: 0.25, chord: false, bend: 0.0 }
    }

    #[test]
    fn picked_notes_are_heard_and_a_wrong_one_is_named() {
        // four picked eighths; the third is a semitone sharp
        let ev = evidence(3.0, &[(0.5, 0.75, 60, true), (0.75, 1.0, 62, true), (1.0, 1.25, 65, true), (1.25, 1.5, 65, true)]);
        let exp = [want(0, 0.5, 60), want(1, 0.75, 62), want(2, 1.0, 64), want(3, 1.25, 65)];
        let v = verify(&ev, &exp, None);
        // one-frame pulses leave the lag free by a couple of envelope frames
        assert!(v.lag.abs() < 0.018, "lag {}", v.lag);
        let heard: Vec<Heard> = v.verdicts.iter().map(|x| x.heard).collect();
        assert_eq!(heard, [Heard::Yes, Heard::Yes, Heard::Wrong, Heard::Yes]);
        assert_eq!(v.verdicts[2].alt_midi, Some(65));
        assert!(v.verdicts.iter().filter(|x| x.heard == Heard::Yes).all(|x| x.how == How::Pick));
    }

    /// Review of M4, item 4: the model reading a note an octave out (its
    /// commonest slip) is "couldn't tell", not a wrong note; any other pitch
    /// still is one.
    #[test]
    fn the_written_pitch_an_octave_out_is_unsure_not_wrong() {
        for (played, verdict) in [(76, Heard::Unsure), (52, Heard::Unsure), (71, Heard::Wrong)] {
            let ev = evidence(3.0, &[(0.5, 0.75, 60, true), (0.75, 1.0, 62, true), (1.0, 1.25, played, true), (1.25, 1.5, 65, true)]);
            let exp = [want(0, 0.5, 60), want(1, 0.75, 62), want(2, 1.0, 64), want(3, 1.25, 65)];
            let v = verify(&ev, &exp, Some(0.0));
            assert_eq!(v.verdicts[2].heard, verdict, "64 written, {played} read");
            assert_eq!(v.verdicts[2].alt_midi, Some(played));
        }
    }

    #[test]
    fn a_hammer_on_with_no_attack_is_heard_on_the_soft_path() {
        let ev = evidence(3.0, &[(0.5, 0.75, 60, true), (0.75, 1.0, 62, false), (1.0, 1.25, 60, true), (1.25, 1.5, 62, true)]);
        let exp = [want(0, 0.5, 60), want(1, 0.75, 62), want(2, 1.0, 60), want(3, 1.25, 62)];
        let v = verify(&ev, &exp, Some(0.0));
        assert_eq!(v.verdicts[1].heard, Heard::Yes);
        assert_eq!(v.verdicts[1].how, How::Soft);
        assert!((v.verdicts[1].t.unwrap() - 0.75).abs() < 0.02);
    }

    #[test]
    fn a_note_left_out_is_not_heard_and_a_ringing_one_is_unsure() {
        // the second note is left out entirely; the fourth is written again
        // while the third's pitch is simply still ringing, with no attack
        let ev = evidence(3.0, &[(0.5, 0.7, 60, true), (1.0, 1.6, 64, true)]);
        let exp = [want(0, 0.5, 60), want(1, 0.75, 62), want(2, 1.0, 64), want(3, 1.25, 64)];
        let v = verify(&ev, &exp, Some(0.0));
        assert_eq!(v.verdicts[1].heard, Heard::No);
        assert_eq!(v.verdicts[2].heard, Heard::Yes);
        assert_eq!(v.verdicts[3].heard, Heard::Unsure, "a pitch already sounding cannot be said to have started");
    }

    /// Card #116: sounding is not starting. A pitch still ringing from the
    /// stroke before is not credited for an attack that started something
    /// else; picked again, with its own start, it is.
    #[test]
    fn a_ringing_pitch_needs_its_own_start() {
        // 60 rings on from 0.5 s while 64 is picked at 1.0, where 60 is written
        let ev = evidence(3.0, &[(0.5, 1.6, 60, true), (1.0, 1.25, 64, true), (1.5, 1.75, 67, true)]);
        let exp = [want(0, 0.5, 60), want(1, 1.0, 60), want(2, 1.5, 67)];
        let v = verify(&ev, &exp, Some(0.0));
        assert_eq!(v.verdicts[1].heard, Heard::Unsure, "ringing, not started: {:?}", v.verdicts[1]);
        // the same, but 60 is picked again at 1.0
        let ev = evidence(3.0, &[(0.5, 1.6, 60, true), (1.0, 1.6, 60, true), (1.5, 1.75, 67, true)]);
        let v = verify(&ev, &exp, Some(0.0));
        assert_eq!(v.verdicts[1].heard, Heard::Yes);
        assert_eq!(v.verdicts[1].how, How::Pick);
    }

    /// Card #116: a chord left out while the one before rings on, under a
    /// noise bump that passes for an attack, is not heard; strummed again, it is.
    #[test]
    fn a_chord_left_out_while_the_last_rings_is_not_heard() {
        let chord = [52, 55, 59];
        let mut notes = vec![];
        for m in chord {
            notes.push((0.5, 2.2, m, true)); // struck at 0.5 s, rings to 2.2 s
            notes.push((1.5, 2.2, m, true)); // struck again at 1.5 s
        }
        let mut ev = evidence(3.0, &notes);
        ev.flux[(1.0 / ev.flux_dt).round() as usize] = 0.45; // a bump at 1.0 s
        let exp: Vec<Expected> = [0.5, 1.0, 1.5]
            .iter()
            .enumerate()
            .flat_map(|(k, &t)| chord.iter().enumerate().map(move |(j, &m)| Expected { note_id: (3 * k + j) as u32, t, midi: m as f64, dur: 0.5, chord: true, bend: 0.0 }))
            .collect();
        let v = verify(&ev, &exp, Some(0.0));
        let heard: Vec<Heard> = v.verdicts.iter().map(|x| x.heard).collect();
        assert!(v.verdicts[3].attack > 0.0, "the bump passes for an attack");
        assert_eq!(heard[0..3], [Heard::Yes; 3]);
        assert_eq!(heard[3..6], [Heard::Unsure; 3], "left out, still ringing: {:?}", &v.verdicts[3..6]);
        assert_eq!(heard[6..9], [Heard::Yes; 3]);
    }

    /// Card #116: a chord tone written to ring that is gone at once (a dead
    /// string in the strum: it sounds over the attack, then stops) is
    /// "couldn't tell", not heard.
    #[test]
    fn a_choked_chord_tone_is_unsure() {
        let ev = evidence(3.0, &[(0.5, 1.8, 52, true), (0.5, 0.72, 55, true), (0.5, 1.8, 59, true), (2.0, 2.5, 64, true)]);
        let exp: Vec<Expected> = [52, 55, 59]
            .iter()
            .enumerate()
            .map(|(j, &m)| Expected { note_id: j as u32, t: 0.5, midi: m as f64, dur: 1.2, chord: true, bend: 0.0 })
            .chain([want(3, 2.0, 64)])
            .collect();
        let v = verify(&ev, &exp, Some(0.0));
        let heard: Vec<Heard> = v.verdicts.iter().map(|x| x.heard).collect();
        assert_eq!(heard, [Heard::Yes, Heard::Unsure, Heard::Yes, Heard::Yes]);
        // written short, it is simply heard
        let short: Vec<Expected> = exp.iter().map(|e| Expected { dur: if e.chord { 0.25 } else { e.dur }, ..e.clone() }).collect();
        assert_eq!(verify(&ev, &short, Some(0.0)).verdicts[1].heard, Heard::Yes);
        // a long chord right at the end of the audio is not taken for choked
        let ev = evidence(0.74, &[(0.5, 0.74, 52, true), (0.5, 0.74, 55, true), (0.5, 0.74, 59, true)]);
        let v = verify(&ev, &exp[0..3], Some(0.0));
        assert!(v.verdicts.iter().all(|x| x.heard == Heard::Yes), "{:?}", v.verdicts);
    }

    /// Card #116: a chord whose pitches appear under a bump too weak to be a
    /// strum, or under no attack at all, with no string plainly starting, is
    /// "couldn't tell"; one string plainly starting says it was struck.
    #[test]
    fn a_chord_with_no_clear_strum_is_unsure() {
        let chord = [52, 55, 59];
        for (bump, one_clear, want_heard) in [(0.45, false, Heard::Unsure), (0.0, false, Heard::Unsure), (0.45, true, Heard::Yes)] {
            let mut notes = vec![];
            for (t, ms) in [(0.5, [40, 43, 47]), (1.0, [41, 44, 48]), (2.5, [42, 45, 49])] {
                for m in ms {
                    notes.push((t, t + 0.45, m, true));
                }
            }
            for m in chord {
                notes.push((2.0, 2.45, m, false)); // fresh pitches, not ringing before
            }
            let mut ev = evidence(3.5, &notes);
            ev.flux[(2.0 / ev.flux_dt).round() as usize] = bump as f32;
            // no string's own start is clear: cap "just started" around 2.0 s
            let dt = Posteriors::frame_seconds();
            for (j, m) in chord.iter().enumerate() {
                let cap = if one_clear && j == 0 { 0.7 } else { 0.4 };
                for k in (1.8 / dt) as usize..(2.2 / dt) as usize {
                    let r = &mut ev.rise[k * NP + (m - P_LO) as usize];
                    *r = r.min(cap);
                }
            }
            let mut exp = vec![];
            for (k, (t, ms)) in [(0.5, [40, 43, 47]), (1.0, [41, 44, 48]), (2.0, chord), (2.5, [42, 45, 49])].iter().enumerate() {
                for (j, m) in ms.iter().enumerate() {
                    exp.push(Expected { note_id: (3 * k + j) as u32, t: *t, midi: *m as f64, dur: 0.45, chord: true, bend: 0.0 });
                }
            }
            let v = verify(&ev, &exp, Some(0.0));
            let at2: Vec<Heard> = v.verdicts[6..9].iter().map(|x| x.heard).collect();
            assert_eq!(at2, [want_heard; 3], "bump {bump}, one clear {one_clear}: {:?}", &v.verdicts[6..9]);
            assert!(v.verdicts[0..6].iter().chain(&v.verdicts[9..12]).all(|x| x.heard == Heard::Yes));
        }
    }

    #[test]
    fn an_attack_with_no_pitch_is_unsure_not_wrong() {
        let mut ev = evidence(3.0, &[(0.5, 0.75, 60, true), (1.0, 1.25, 64, true), (1.25, 1.5, 65, true), (1.5, 1.75, 67, true)]);
        // a dead note at 0.75 s: an attack and nothing behind it
        let i = (0.75 / ev.flux_dt).round() as usize;
        ev.flux[i] = 3.0;
        let exp = [want(0, 0.5, 60), want(1, 0.75, 62), want(2, 1.0, 64), want(3, 1.25, 65), want(4, 1.5, 67)];
        let v = verify(&ev, &exp, Some(0.0));
        assert_eq!(v.verdicts[1].heard, Heard::Unsure);
        assert!(v.verdicts[1].attack > 0.5);
    }

    #[test]
    fn the_lag_is_found_from_the_attacks() {
        let late = 0.045;
        let ev = evidence(
            4.0,
            &[(0.5 + late, 0.75 + late, 60, true), (0.75 + late, 1.0 + late, 62, true), (1.0 + late, 1.25 + late, 64, true), (1.5 + late, 1.75 + late, 65, true), (2.25 + late, 2.5 + late, 67, true)],
        );
        let exp = [want(0, 0.5, 60), want(1, 0.75, 62), want(2, 1.0, 64), want(3, 1.5, 65), want(4, 2.25, 67)];
        let v = verify(&ev, &exp, None);
        assert!((v.lag - late).abs() < 0.018, "lag {} against {late}", v.lag);
        assert!(v.verdicts.iter().all(|x| x.heard == Heard::Yes));
        // and the times come back on the grid's clock
        assert!((v.verdicts[3].t.unwrap() - 1.5).abs() < 0.018);
    }
}
