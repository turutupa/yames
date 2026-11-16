//! Guitar-like audio, written down from a known list of notes.
//!
//! **None of this is a guitar.** It is a set of signals that are hard in the
//! ways a guitar is hard, so that the detector and the scorer can be held to a
//! right answer before anyone records anything. What it gets right, it gets
//! right on purpose:
//!
//! * a plucked decay with a noise burst at the attack (extended
//!   Karplus–Strong, from `pitch_fixtures/synth.rs`);
//! * a tone whose RMS barely swings between attack and tail, because of a
//!   saturating gain stage after the strings. This is the point of the file:
//!   high gain is what the old noise floor could not survive;
//! * notes that ring across each other, or that cut each other off the way a
//!   new pick stops the same string;
//! * a noise floor of hiss and mains hum, before the gain stage when there is
//!   one, because that is where a rig's noise comes from;
//! * uneven levels, a stroke-direction difference, dropped notes and added
//!   ones, all known in advance.
//!
//! What it does not have: body resonance, feedback, a real pick's scrape, a
//! real room, or a real player. Every number measured over it is labelled
//! synthetic where it is written down.

use super::synth::{pluck, Pluck, Rng};

/// What the note sounds like.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tone {
    /// Palm-muted clean: a short decay, cut by the next pick.
    Damped,
    /// A clean note on one string: medium decay, cut by the next pick.
    Clean,
    /// Clean notes across strings: a long decay, each ringing under the next.
    Ringing,
    /// High gain on one string: the next pick cuts the note.
    HighGain,
    /// High gain across strings: the notes pile up in the gain stage.
    HighGainRinging,
    /// A sweep: long decay, notes ringing across strings, and a softer attack
    /// than a full pick stroke.
    Swept,
}

impl Tone {
    pub const ALL: [Tone; 6] = [
        Tone::Damped,
        Tone::Clean,
        Tone::Ringing,
        Tone::HighGain,
        Tone::HighGainRinging,
        Tone::Swept,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Tone::Damped => "damped",
            Tone::Clean => "clean",
            Tone::Ringing => "ringing",
            Tone::HighGain => "high-gain",
            Tone::HighGainRinging => "high-gain-ringing",
            Tone::Swept => "swept",
        }
    }

    fn decay_secs(self) -> f64 {
        match self {
            Tone::Damped => 0.2,
            Tone::Clean => 0.8,
            Tone::Ringing | Tone::Swept => 2.4,
            Tone::HighGain | Tone::HighGainRinging => 2.4,
        }
    }

    /// Does a new note stop the last one?
    fn cuts_previous(self) -> bool {
        matches!(self, Tone::Damped | Tone::Clean | Tone::HighGain)
    }

    fn drive(self) -> Option<f64> {
        matches!(self, Tone::HighGain | Tone::HighGainRinging).then_some(30.0)
    }

    fn pick_noise(self) -> f64 {
        match self {
            Tone::Swept => 0.15,
            _ => 0.55,
        }
    }
}

/// Which pitches, in order, round and round.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pattern {
    /// One note over and over: the open-string Exercise, and the hardest
    /// thing for a detector that reads pitch changes.
    OneNote,
    /// Four fingers up one string, the spider Exercise.
    Chromatic,
    /// A rising and falling five-string arpeggio.
    Arpeggio,
}

impl Pattern {
    pub fn midi(self, i: usize) -> f64 {
        const CHROMATIC: [f64; 8] = [52.0, 53.0, 54.0, 55.0, 55.0, 54.0, 53.0, 52.0];
        const ARPEGGIO: [f64; 8] = [45.0, 52.0, 57.0, 60.0, 64.0, 60.0, 57.0, 52.0];
        match self {
            Pattern::OneNote => 40.0,
            Pattern::Chromatic => CHROMATIC[i % CHROMATIC.len()],
            Pattern::Arpeggio => ARPEGGIO[i % ARPEGGIO.len()],
        }
    }
}

/// A noise floor. Levels are RMS relative to full scale, in dB.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Noise {
    pub hiss_db: f64,
    pub hum_db: f64,
}

impl Noise {
    pub const NONE: Noise = Noise {
        hiss_db: -120.0,
        hum_db: -120.0,
    };
    pub const DI: Noise = Noise {
        hiss_db: -72.0,
        hum_db: -78.0,
    };
    pub const ROOM_MIC: Noise = Noise {
        hiss_db: -50.0,
        hum_db: -60.0,
    };
    pub const NOISY: Noise = Noise {
        hiss_db: -40.0,
        hum_db: -46.0,
    };
}

/// One note, in time.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Note {
    pub at_ms: f64,
    pub midi: f64,
    /// Peak level before any gain stage, as a fraction of `level`.
    pub gain: f32,
}

pub fn db(v: f64) -> f64 {
    10f64.powf(v / 20.0)
}

/// Lay `notes` out as audio, `len_ms` long, and put `noise` under it.
pub fn render(
    tone: Tone,
    notes: &[Note],
    len_ms: f64,
    level: f32,
    noise: Noise,
    rate: u32,
    seed: u64,
) -> Vec<f32> {
    let n = (len_ms * rate as f64 / 1000.0) as usize;
    let mut mix = vec![0.0f64; n];
    let mut sorted = notes.to_vec();
    sorted.sort_by(|a, b| a.at_ms.total_cmp(&b.at_ms));

    for (i, note) in sorted.iter().enumerate() {
        let start = (note.at_ms * rate as f64 / 1000.0).max(0.0) as usize;
        // A cut note stops at the next pick, with a few samples of fade so the
        // cut itself is not a click. A ringing one is left to decay, up to a
        // point: three seconds of it is more than the mix can tell apart.
        let ring_ms = (tone.decay_secs() * 1000.0).min(3000.0);
        let until = match sorted.get(i + 1).filter(|_| tone.cuts_previous()) {
            Some(next) => (next.at_ms - note.at_ms + 2.0).min(ring_ms),
            None => ring_ms,
        };
        let secs = (until / 1000.0).max(0.01);
        let mut p = Pluck::new(note.midi, secs, seed.wrapping_add(i as u64 * 7919));
        p.decay_secs = tone.decay_secs();
        p.level = note.gain;
        p.pick_noise = tone.pick_noise();
        let buf = pluck(&p, rate);
        let fade = ((2.0 * rate as f64 / 1000.0) as usize).min(buf.len());
        for (k, s) in buf.iter().enumerate() {
            let Some(slot) = mix.get_mut(start + k) else {
                break;
            };
            let g = if k + fade >= buf.len() {
                (buf.len() - k) as f64 / fade.max(1) as f64
            } else {
                1.0
            };
            *slot += *s as f64 * g;
        }
    }

    let (hiss, hum) = (db(noise.hiss_db), db(noise.hum_db));
    let mut rng = Rng::new(seed ^ 0xA5A5_5A5A_DEAD_BEEF);
    let drive = tone.drive();
    // Noise goes in BEFORE the gain stage when there is one: a high-gain rig's
    // hiss is the guitar's noise, amplified along with everything else.
    // With no gain stage it is scaled to come out at the level asked for; with
    // one it comes out louder, which is what a high-gain rig does.
    let mut out = vec![0.0f32; n];
    let (mut hp_x, mut hp_y, mut lp) = (0.0f64, 0.0f64, 0.0f64);
    let hp_a = (-2.0 * std::f64::consts::PI * 90.0 / rate as f64).exp();
    let lp_a = (-2.0 * std::f64::consts::PI * 5000.0 / rate as f64).exp();
    for (i, slot) in out.iter_mut().enumerate() {
        let t = i as f64 / rate as f64;
        let w = 2.0 * std::f64::consts::PI * 50.0 * t;
        let hum_now = hum * std::f64::consts::SQRT_2 * (0.8 * w.sin() + 0.5 * (3.0 * w).sin() + 0.3 * (5.0 * w).sin());
        let hiss_now = hiss * 3f64.sqrt() * rng.bipolar();
        let noise_now = hum_now + hiss_now;
        let y = match drive {
            Some(d) => {
                let x = mix[i] * level as f64 + noise_now;
                // A pre-amp's HP keeps the mud out, the saturation flattens the
                // envelope, and the cab's LP takes the fizz off.
                let hp = hp_a * (hp_y + x - hp_x);
                hp_x = x;
                hp_y = hp;
                let sat = (d * hp).tanh() * 0.6;
                lp = (1.0 - lp_a) * sat + lp_a * lp;
                lp
            }
            None => mix[i] * level as f64 + noise_now,
        };
        *slot = y as f32;
    }
    out
}
