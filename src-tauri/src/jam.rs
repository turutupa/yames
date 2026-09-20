//! Jam — the band as a lookup table on the tick grid.
//!
//! The whole reason Jam is cheap and safe is that nothing about timing
//! changes (`plans/JAM_MODE.md` §6). Every hit the band plays lands on a tick
//! the metronome was going to play anyway; a rest is an empty column, never a
//! skipped tick. This module owns the two halves of that:
//!
//! * [`JamConfig`] — the serde mirror of `JamEngineConfig` in
//!   `src/jam/types.ts`, validated on receipt so a bad jam is *rejected* with
//!   a message rather than half-applied.
//! * [`JamTable`] — what the audio thread reads. One entry per tick of the
//!   bar, each holding up to six fixed-size `(sound, gain, ring-out)` slots —
//!   five drums and the bass.
//!   No `Vec` per tick, no allocation on the audio thread; the same
//!   discipline `accent_mask` follows. Compiled in the `set_jam` command and
//!   swapped in behind an `Arc`, which the callback only ever clones (a
//!   refcount bump, not an allocation).
//!
//! The contract the UI and the engine share: **the UI sets the engine's
//! subdivision to `ticksPerBeat` and its beat groups to `[beatsPerBar]`
//! before calling `set_jam`.** The engine checks the product against its own
//! bar length on every tick and plays the plain click when they disagree.
//! Nobody guesses. See `plans/tasks/jam/BRIEF.md`.

use serde::{Deserialize, Serialize};

use std::sync::Arc;

use crate::engine::{
    jam_reference_sample, BassVoice, JamKit, KeysVoice, KitVoice, SoundId, VoiceLine,
    BASS_MAX_MIDI, BASS_MIN_MIDI, BASS_VOICE_COUNT, JAM_REFERENCE_SR, KEYS_MAX_MIDI,
    KEYS_MIN_MIDI, KEYS_VOICE_COUNT,
};
use crate::kit::{fallback_for, KitBank, KIT_VOICES};
use crate::voices::MelodicBank;

// ---------------------------------------------------------------------------
// Limits — mirrored from src/jam/types.ts
// ---------------------------------------------------------------------------

/// How many rows of the pattern are the drummer's: kick, snare, hat,
/// hat_open, ride, crash, tom_hi, tom_lo.
///
/// Eight, because a fill is toms (`plans/tasks/jam-v3/BRIEF.md`).
pub const JAM_DRUM_LANES: usize = 8;

/// And how many are the percussionist's — the contract's ten
/// (`plans/tasks/jam-v5/BRIEF.md`), in its order.
pub const JAM_PERC_LANES: usize = 10;

/// The lanes a `JamPattern` carries.
///
/// Eighteen: the drummer's eight and the percussionist's ten. Every row
/// past the first six is optional in exactly the way `hatOpen` was when it
/// arrived — absent is silent, and every pattern the app has ever saved
/// still loads and still plays what it always played.
pub const JAM_PATTERN_LANES: usize = JAM_DRUM_LANES + JAM_PERC_LANES;

/// The most notes one keys voicing may hold. Four is a seventh chord, which
/// is as much harmony as a comping voice should put under a soloist; five
/// would be a pianist showing off.
pub const JAM_MAX_VOICING: usize = 4;

/// Eight drums and ten percussion voices, the hi-hat pedal the engine adds
/// after an open hat, the bass, and up to four notes of one keys voicing.
/// The array on every tick is this wide, so a tick is a fixed-size value the
/// audio thread can read without a bounds surprise or a heap touch.
///
/// It is what a table can DESCRIBE and not what anybody writes: no groove in
/// the library puts eighteen rows on one tick. The probe's `busiest_jam`
/// does, which is the point of it.
pub const JAM_MAX_SLOTS: usize = JAM_PATTERN_LANES + 1 + 1 + JAM_MAX_VOICING;

/// `JAM_MAX_FORM_BARS` in `src/jam/types.ts`.
pub const JAM_MAX_FORM_BARS: u32 = 64;

/// The engine caps a bar at 16 beats (`validate_beat_groups`) and the
/// contract caps `ticksPerBeat` at 6, so no legal bar is longer than this.
pub const JAM_MAX_TICKS_PER_BAR: usize = 16 * 6;

/// Legal `ticksPerBeat` values, from the contract's union type.
const TICKS_PER_BEAT: [u32; 5] = [1, 2, 3, 4, 6];

/// Legal `fillEvery` values. 0 is "the last bar of the chorus only", which
/// is what a fill meant before this existed; the UI offers 4 and 8 and
/// nothing else, because a fill every bar or every two is not a fill, it is
/// the groove.
const FILL_EVERY: [u32; 3] = [0, 4, 8];

/// How loud a cell is, by level: 0 off, 1 hit, 2 accent, 3 ghost, 4 peak.
/// Applied *before* intensity and the master volume.
///
/// **Five levels now, and the fifth is the top of a fill.** A crash at the
/// end of a ramp and a backbeat are not the same stroke, and with four
/// levels the loudest thing a groove could ask for was the same "accent" it
/// asked for on every two and four. Peak is that stroke: the same gain as an
/// accent, and the HARDEST LAYER the kit has, which on a recorded kit is a
/// different recording rather than the same one louder
/// (`plans/JAM_SOUND.md` §2.2).
///
/// A ghost went from 0.35 to 0.45 at the same time, and for the same reason
/// in reverse: with a real soft layer under it, the level gain no longer has
/// to do the whole job of making a ghost sound soft, and 0.35 of a layer
/// that is already soft is a note nobody can hear.
pub const LEVEL_GAIN: [f32; 5] = [0.0, 0.8, 1.0, 0.45, 1.0];

/// Which velocity layer a level reaches for, 1-based, clamped to the layers
/// the voice actually has.
///
/// Ghost to the softest, hit above it, accent above that, peak to the
/// hardest — which is the whole point of a layered kit and the thing a
/// single scaled sample cannot do. A kit with one layer plays that one at
/// every level and sounds exactly as it did before this pass, which is what
/// keeps the five synthesised kits honest.
pub const LEVEL_LAYER: [u8; 5] = [0, 2, 3, 1, 4];

/// The loudest level a cell may carry.
pub const MAX_LEVEL: u8 = 4;

/// The hi-hat pedal the engine plays after an open hat.
///
/// Not a lane and not something a groove writes: a drummer who opens the hat
/// closes it with their foot at the next hat, and that foot makes a sound.
/// It is soft — it is a foot, not a stick — and 0.4 is where it reads as the
/// close rather than as another hat.
const HAT_PEDAL_GAIN: f32 = 0.4;

/// The ride, trimmed.
///
/// Every kit file peaks at 0.900, so the engine carries the balance between
/// them (`src-tauri/sounds/KITS.md`). A ride is three to seven times longer
/// than a closed hat at the same peak, which is several times the energy: at
/// the hat's gain it would sit on top of the groove instead of under it.
/// 0.7 puts the ping where a drummer plays it. It is no longer the stand-in
/// the first pass had — each kit has a real ride now.
const RIDE_TRIM: f32 = 0.7;

/// The hat is capped at 0.9 of a tick, exactly like today's plain beat, so a
/// closed hat stays closed instead of smearing into the next sixteenth.
const HAT_CAP_TICKS: f32 = 0.9;

/// The open hat rings a beat, and no further.
///
/// An open hat is the one drum whose whole point is that it is still there
/// on the next tick — a drummer opens it on the "and" and the wash carries
/// into the downbeat, which is why it is a row of its own rather than a
/// louder closed hat (`plans/JAM_UX_DECISIONS.md` B5). So it is capped long
/// rather than short, like the ride.
///
/// It is capped and not left to ring out, which is what the kick, the snare
/// and the crash do, for two reasons and they are both about a row somebody
/// can fill in by hand. Musically, a real drummer's foot closes the hat;
/// an open hat that is still washing four beats later is a cymbal, not a
/// hat. Mechanically, this is the only long voice a pattern can write on
/// EVERY tick, and a folder's own open hat may be [`crate::kit::
/// MAX_VOICE_SECS`] long — at 300 BPM sixteenths that is forty of them alive
/// at once out of one lane. Four ticks is a beat at sixteenths, half a bar
/// at eighths, and bounds the lane at four.
const HAT_OPEN_CAP_TICKS: f32 = 4.0;

/// The ride rings three ticks — long enough to read as a wash under the
/// groove, short enough that a 16th-note ride pattern does not stack up.
const RIDE_CAP_TICKS: f32 = 3.0;

/// How long a struck percussion voice rings: four ticks, the open hat's
/// bound.
///
/// **Every percussion lane is capped, and the reason is arithmetic before it
/// is music.** A drum kit has three lanes a groove can write on every tick
/// and leave ringing (kick, snare, crash); a percussion tray has ten. At 300
/// BPM sixteenths a tick is 50 ms and a set's voices may be two seconds
/// long, so ten uncapped rows written on every tick would be four hundred
/// voices alive at once out of a mixer that preallocates two hundred and
/// fifty-six. Uncapped percussion is not a balance decision that went wrong;
/// it is a table the callback cannot play.
///
/// Four ticks is the number for the ringing half of the tray — cowbell,
/// claves, tambourine, congas, bongos — and it is the open hat's number for
/// the open hat's reason: a beat at sixteenths, half a bar at eighths, and
/// the lane bounded at four. At every tempo a musician actually plays, a
/// conga tone and a tambourine are over before it, so the cap is a bound the
/// band never touches; above about 250 BPM in sixteenths it starts to cut,
/// and it cuts the way the hat, the open hat and the ride are already cut.
const PERC_CAP_TICKS: f32 = 4.0;

/// And the shaken and scraped voices ring two, which is the closed hat's
/// rule rather than the open one's.
///
/// A shaker, a cabasa and a guiro are the pulse: they are written on every
/// subdivision and the next stroke is what ends the last one. One that rang
/// two subdivisions into the next would be a hiss rather than a time
/// keeper, which is exactly why the closed hat is capped at 0.9 of a tick.
/// Two and not 0.9 because these are longer gestures than a stick on a
/// closed cymbal — a cabasa stroke is the beads going round — and cutting
/// one inside its own tick would take the gesture away rather than the
/// smear.
const PERC_SHAKEN_CAP_TICKS: f32 = 2.0;

/// WHAT THE TABLE'S NORMALISATION IS FOR, AFTER THIS PASS.
///
/// It used to be the whole level policy: four bars of the band were
/// rendered, the busiest sample found, and the table scaled so that the
/// loudest thing the groove could possibly do stayed under 0.90 at the
/// loudest intensity. It worked, and it is why the drums played **9 to
/// 13 dB below the metronome's own drum accent** (`plans/JAM_SOUND.md` §1):
/// every groove in the library paid, on every hit, for the one pattern
/// nobody writes.
///
/// The bus does that job now — a tanh stage and a peak compressor, on the
/// audio thread, which hold the band down when it is actually loud instead
/// of all the time. So this survives only as a SAFETY CLAMP: a table whose
/// worst rendered sample is over two and a half times full scale is asking
/// the bus for something no compressor makes musical, and it comes down to
/// 2.5. Everything below that is left exactly as the groove was written.
///
/// 2.5 and not 1.0 because the bus is built for this: `tanh(2.5)/tanh(1.0)`
/// is 1.30, and the compressor takes that to 0.69 in its steady state. A
/// band arriving at 2.5 is a band arriving hot, which is what a drum bus is
/// for.
const JAM_SAFETY_CLAMP: f32 = 2.5;

/// Intensity bounds from the contract (soft 0.6, normal 1.0, loud 1.6).
///
/// Clamped rather than rejected: a jam saved by a future build with a wider
/// range should still play, just not deafen anyone. The range opened up with
/// the bus underneath it — soft went from 0.7 to 0.6 and loud from 1.25 to
/// 1.6 — because a dial whose three stops are within 5 dB of each other is a
/// dial nobody can hear turning.
const INTENSITY_MIN: f32 = 0.5;
const INTENSITY_MAX: f32 = 1.6;

/// `JamBassLine.gain` bounds from the contract. Clamped, never rejected, for
/// the same reason intensity is.
const BASS_GAIN_MIN: f32 = 0.5;
const BASS_GAIN_MAX: f32 = 1.5;

/// `JamKeysLine.gain` bounds from the contract, clamped the same way.
const KEYS_GAIN_MIN: f32 = 0.5;
const KEYS_GAIN_MAX: f32 = 1.5;

/// `JamMix` bounds from the contract: 0..1.5 per lane, so a lane can be
/// taken all the way off. Clamped rather than rejected, like every other
/// gain here.
const MIX_MIN: f32 = 0.0;
const MIX_MAX: f32 = 1.5;

/// The keys, trimmed, so the band stays a band.
///
/// Every synthesised bank peaks at 0.9 like the kit files do — the files
/// carry timbre, the engine carries balance (`src-tauri/sounds/KITS.md`) —
/// and this is the balance for a comping voice. A voicing is FOUR notes at
/// once, sustained for most of a bar, against a snare that is one transient:
/// at the same slot gain the chord is the loudest thing in the room and the
/// drummer disappears behind it.
///
/// The measurement, made by `the_keys_sit_under_the_snare_on_a_small_speaker`
/// in `engine.rs`: at the bank's own level a four-note voicing comes out
/// **+4.96 dB against the snare accent** — the chord is the loudest thing in
/// the bar, and that is with a groove that is nothing but a backbeat. 0.07
/// is 23 dB off that, which puts the voicing at **−7.7 dB**: past the 6 dB
/// `plans/tasks/jam/W14-ENGINE-KEYS-TAKES.md` asks for, and still a chord a
/// player can hear the harmony of rather than a rumour of one.
///
/// It is a starting point for ears, not a finished balance. The musician has
/// `keys.gain` (0.5..1.5) and `mix.keys` (0..1.5) over the top of it, so the
/// range this trim opens is 0.045 to 0.203 — a bit under half to a bit over
/// double.
///
/// ## 2026-09-20: +2.2 dB, because the ear got there
///
/// 0.07 was the number above, and it was arrived at without anybody
/// listening. The owner then listened, making a clip for the website, and
/// said it: "what I can hear is mostly drum sound, the keys and bass is very
/// low in comparison."
///
/// Measured the way a listener hears it rather than the way a transient is
/// compared — every keys voice rendered alone for eight bars and put through
/// `ffmpeg -af highpass=f=120,ebur128`, against the same vibe's kit rendered
/// alone, over four vibes at all three intensities
/// (`scripts/sounds/jam_mix_probe.ts`, twelve cells a voice) — the keys came
/// out **7.5 to 10.7 dB under the kit on average and as far as 16.7 dB under
/// in funk at Loud**. `JamMix` tops out at 1.5, which is +3.5 dB, so a player
/// could not fix it from the mixer either.
///
/// 0.0902 is +2.2 dB, and it puts the four voices at a mean of **kit −6.2 dB**
/// in that measurement — the 6 dB `plans/tasks/jam/W14-ENGINE-KEYS-TAKES.md`
/// asks for, now measured against the whole kit over eight bars instead of
/// against one snare stroke over one beat. It is deliberately the brief's
/// number and not further: `plans/tasks/songs/W17-JAM-MIX.md` ends in clips
/// for the owner, and if the answer is "more", this is the constant that
/// moves and `the_keys_sit_under_the_snare_on_a_small_speaker` is the floor
/// that moves with it.
pub(crate) const KEYS_TRIM: f32 = 0.0902;

/// Each bass voice against the fingered one, through the small-speaker
/// band-pass.
///
/// THE BANKS CARRY TIMBRE AND THE ENGINE CARRIES BALANCE, and this is the
/// balance. Every note of every voice is normalised to a peak of 0.9 in
/// `engine.rs`, which is the right thing for a bank and says nothing at all
/// about loudness: a slap puts a great deal of energy where a laptop
/// speaker works and an upright puts almost none there, and a synth bass
/// that is HELD carries three times a plucked one's energy over the same
/// beat. At equal peaks, changing the bass voice would change the volume,
/// and the musician would go looking for the control that had moved on its
/// own.
///
/// ## The band these are measured in changed on 2026-09-20, and that is the
/// whole of this pass
///
/// They used to be measured through the 200 Hz–4 kHz band-pass every other
/// level claim in this codebase uses. **That band is right for a drum and
/// wrong for a bass.** A bass runs E1 to G3 — 41 to 196 Hz — so a 200 Hz
/// corner measures a bass's harmonics and not one of its fundamentals, and
/// `every_bass_voice_lands_at_the_same_level` passed on it while the voices
/// were four and a half decibels apart in the octave the note is actually
/// heard in. The owner heard the result before any meter did: "what I can
/// hear is mostly drum sound, the keys and bass is very low in comparison",
/// and the website's own clip had already been hand-balanced around it
/// (`plans/WEBSITE_DECISIONS.md`, "One sound clip, only when asked for").
///
/// So the measurement moved to **above 120 Hz** — the brief's band, where a
/// laptop's driver gives up, and the same band
/// `ffmpeg -af highpass=f=120,ebur128` was pointed at when the eight-bar
/// lines were measured. `above_120_energy` in `engine.rs` is the filter.
///
/// The numbers, measured by `every_bass_voice_lands_at_the_same_level` —
/// one note (E2) rendered into a common window of one beat at 120 BPM,
/// against the fingered voice, with the OLD trims in place:
///
/// | voice | at the old trims, above 120 Hz | correction | new trim |
/// |---|---|---|---|
/// | fingered | 0.00 dB | ×1.000 | 1.0000 |
/// | picked | −0.94 dB | ×1.115 | 0.9695 |
/// | upright | +1.51 dB | ×0.840 | 1.0069 |
/// | slap | −4.61 dB | ×1.702 | 0.9634 |
/// | synth | −3.11 dB | ×1.430 | 0.3168 |
///
/// **The slap and the synth are the two the old band could not see**, and
/// they are the two recipes rather than recordings: a slap's energy and a
/// filtered saw's sit under 200 Hz, so the old measurement saw what was left
/// over and trimmed them for it. Above 120 Hz they were four and a half and
/// three decibels under a fingered note, which on a laptop speaker is a bass
/// that is not there. The synth's trim is still much the smallest of the
/// five — it is HELD where the others are plucked, and that is real — but it
/// is 3.1 dB less small than it was.
///
/// What this does NOT do is level the eight-bar LINES, and it should not: a
/// slap line is short notes and space, an upright rings for two beats, and
/// that difference is the instrument rather than the mixer. Measured over
/// eight bars above 120 Hz the five voices still span 7.5 dB (they spanned
/// 10.6), and the group sits at about the kit's own level instead of 1 dB
/// under it. `plans/tasks/songs/W17-JAM-MIX.md` has the twelve cells a voice.
///
/// A trim below 1 also means the note's PEAK is below the bank's 0.9, which
/// is not a loss: the table's own normalisation then has less to take away
/// from the drums, so a quiet-peaked bass buys the kit headroom rather than
/// spending it.
///
/// **This matches the band a laptop speaker radiates, and that is a
/// choice.** A trimmed synth bass is quieter than a fingered one BELOW
/// 200 Hz, where the band-pass does not look, so on a subwoofer it has less
/// bottom than the number here suggests. The brief asks for the
/// small-speaker match because that is the speaker the music gets practised
/// through; `bass.gain` and `mix.bass` are over the top of it either way.
///
/// The test's gate is the brief's 3 dB and not today's hundredth of one, so
/// the recipes can be tuned by ear (`plans/JAM_UX_DECISIONS.md` C2 — the
/// owner listens) without the test having to move every time.
pub(crate) const BASS_VOICE_TRIM: [f32; BASS_VOICE_COUNT] = [
    1.0000, // fingered — the reference. Moving this one moves everything.
    0.9695, // picked   (was 0.8699)
    1.0069, // upright  (was 1.1981)
    0.9634, // slap     (was 0.5661 — the biggest move, and the point)
    0.3168, // synth    (was 0.2216)
];

/// The same, for the keys, against the electric piano.
///
/// Applied ON TOP of [`KEYS_TRIM`], which is what holds the whole section
/// under the drummer; this only says that changing WHO is on the keys must
/// not change how loud they are.
///
/// Measured by `every_keys_voice_lands_at_the_same_level`, one four-note
/// voicing rendered into one beat at 120 BPM — through the 200 Hz–4 kHz
/// band-pass until 2026-09-20 and above 120 Hz since, for the reason
/// [`BASS_VOICE_TRIM`] gives at length. It matters far less here than it
/// does for the bass, because a voicing has almost nothing under 120 Hz at
/// all: the corrections below are all about a decibel.
///
/// | voice | untrimmed | old trim | at the old trim, above 120 Hz | new trim |
/// |---|---|---|---|---|
/// | epiano | 0.00 dB | 1.0000 | 0.00 dB | 1.0000 |
/// | organ | +7.46 dB | 0.4236 | −1.23 dB | 0.4880 |
/// | clav | −6.09 dB | 2.0160 | −0.97 dB | 2.2553 |
/// | pad | +6.50 dB | 0.4732 | −0.41 dB | 0.4961 |
///
/// The two extremes are the two ends of what a keyboard is. An organ does
/// not decay at all, so over a beat it carries five times an electric
/// piano's energy at the same peak; a clav is over in 220 ms, so it carries
/// a quarter. Both trims are therefore doing exactly what they should — and
/// the clav's, being above 1, means its TRANSIENT is twice the piano's,
/// which is what a percussive stab is.
pub(crate) const KEYS_VOICE_TRIM: [f32; KEYS_VOICE_COUNT] = [
    1.0000, // epiano — the reference, so `KEYS_TRIM`'s own measurement holds.
    0.4880, // organ (was 0.4236)
    2.2553, // clav  (was 2.0160)
    0.4961, // pad   (was 0.4732)
];

/// How far a hit's gain wanders, either way.
///
/// Two per cent (`plans/JAM_SOUND.md` §2.6). Exact gain on an exact grid is
/// what "programmed" sounds like, and the fix is not randomness: the same
/// bar, the same tick and the same drum always hash to the same number, so
/// a take is reproducible and a jam left running never loops audibly.
pub const DRIFT_GAIN: f32 = 0.02;

/// How late a hit can be.
///
/// Three milliseconds at the outside, and never on the kick on the one —
/// the downbeat is where the band agrees it is, and a drummer who pushed
/// that would be a drummer nobody could play with.
pub const DRIFT_MAX_SECS: f32 = 0.003;

/// Which round robin one hit gets.
///
/// The contract's formula, and it is arithmetic rather than state on
/// purpose: the audio thread works it out when the tick is scheduled and
/// stores nothing, so there is no counter to get out of step with a jump, a
/// loop or a table swapped at a bar line — and the same bar of the same jam
/// plays the same drums every time round.
///
/// The `× 7` is what stops every voice cycling together. Without it the
/// kick, the snare and the hat would all step to round robin 2 on the same
/// tick, which is a machine gun with three barrels rather than one.
#[inline]
pub fn round_robin(bar: u32, ticks_per_bar: u32, tick: u32, voice: u8, rr: u8) -> u8 {
    if rr <= 1 {
        return 0;
    }
    let n = (bar as u64)
        .wrapping_mul(ticks_per_bar as u64)
        .wrapping_add(tick as u64)
        .wrapping_add(voice as u64 * 7);
    (n % rr as u64) as u8
}

/// The gain and the delay one hit drifts by: a multiplier around 1.0 within
/// [`DRIFT_GAIN`], and a delay as a fraction of [`DRIFT_MAX_SECS`].
///
/// SplitMix64 over (bar, tick, voice). A hash and not a generator, for the
/// same reason [`round_robin`] is a formula: it is called on the audio
/// thread, it may not allocate or hold state, and a take that came out
/// different on the second play would not be a take.
#[inline]
pub fn drift(bar: u32, tick: u32, voice: u8) -> (f32, f32) {
    let mut z = ((bar as u64) << 40 ^ (tick as u64) << 16 ^ voice as u64)
        .wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^= z >> 31;
    let gain = 1.0 + ((z & 0xFFFF) as f32 / 65_535.0 * 2.0 - 1.0) * DRIFT_GAIN;
    let delay = ((z >> 16) & 0xFFFF) as f32 / 65_535.0;
    (gain, delay)
}

/// The fastest the metronome runs: `set_bpm` clamps to 20..=300. With the
/// contract's `ticksPerBeat` of 6 that is a tick every 33 ms, and a short
/// tick is what makes voices pile up — see [`worst_bar_peak`].
const MAX_BPM: f32 = 300.0;

// ---------------------------------------------------------------------------
// The recorded melodic voices
// ---------------------------------------------------------------------------

/// The recorded banks a table plays its melodic lines out of, when the
/// voices the jam names ship one.
///
/// `None` is the synthesised recipe, which is what `synth`, `organ`, `clav`
/// and `pad` always are and what every voice is until its folder arrives.
/// So a build with no `sounds/voices` in it plays exactly what it played
/// before this existed, which is the whole reason this is an `Option` rather
/// than a branch somewhere.
#[derive(Default, Clone, Debug)]
pub struct JamVoices {
    pub bass: Option<Arc<MelodicBank>>,
    pub keys: Option<Arc<MelodicBank>>,
}

impl JamVoices {
    /// The folder a bass voice would play out of, or `None` for a voice
    /// that is synthesis in real life.
    ///
    /// `synth` has no entry and never will: a synth bass is a synthesiser,
    /// and the recipe in `engine.rs` is an honest one. The other four are
    /// instruments somebody records.
    pub fn folder_for_bass(voice: BassVoice) -> Option<&'static str> {
        match voice {
            BassVoice::Fingered => Some("bass_fingered"),
            BassVoice::Picked => Some("bass_picked"),
            BassVoice::Upright => Some("bass_upright"),
            BassVoice::Slap => Some("bass_slap"),
            BassVoice::Synth => None,
        }
    }

    /// The same for the keys. An organ, a clavinet and a pad are
    /// synthesisers or close enough; a Rhodes is a recording.
    pub fn folder_for_keys(voice: KeysVoice) -> Option<&'static str> {
        match voice {
            KeysVoice::Epiano => Some("epiano"),
            KeysVoice::Organ | KeysVoice::Clav | KeysVoice::Pad => None,
        }
    }
}

/// Which velocity layer a melodic line reaches for, from its own gain.
///
/// The contract's mapping: below 0.6 the softest, below 0.9 the one above
/// it, otherwise the hardest — clamped to the layers the bank actually has,
/// so a bank with one layer plays that one at every level and sounds exactly
/// as a single-sample bank should.
///
/// It is the LINE'S gain and not the mix or the voice trim, and that is the
/// point: `bass.gain` is the arrangement saying how hard this chorus is
/// played, where the mix is the musician saying how loud they want the bass
/// in their headphones. A player turning themselves up should not make the
/// band play harder.
///
/// Returns a 0-based index, which is what the bank is addressed by.
pub(crate) fn voice_layer(gain: f32, layers: u8) -> u8 {
    let want = if !gain.is_finite() || gain < 0.6 {
        1
    } else if gain < 0.9 {
        2
    } else {
        3
    };
    want.min(layers.max(1)) - 1
}


// ---------------------------------------------------------------------------
// The config — serde mirror of JamEngineConfig
// ---------------------------------------------------------------------------

/// One bar, one row per drum. Every array has exactly
/// `beatsPerBar × ticksPerBeat` entries, tick 0 first.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamPattern {
    pub kick: Vec<u8>,
    pub snare: Vec<u8>,
    pub hat: Vec<u8>,
    /// The open hi-hat, as its own row (`JamPattern.hatOpen` in
    /// `src/jam/types.ts`, second pass, B5).
    ///
    /// **Optional, and empty means none.** Every pattern the app has ever
    /// saved was written before this row existed, so a config that does not
    /// carry it has to load and play exactly as it did — which is what
    /// `#[serde(default)]` and the empty case in [`compile_pattern`] are
    /// for. A row that IS sent is held to the same length as every other:
    /// half a lane is a bug in the caller, not a groove.
    ///
    /// `null` reads as absent as well as missing. The contract spells the
    /// row `hatOpen?: JamLevel[]`, so what the UI sends is the key or
    /// nothing — but a jam that has been through a store, a JSON round trip
    /// or a later build is a real thing, and every other optional field here
    /// already accepts a null. Rejecting one would take the whole band away
    /// and play the click over an empty row.
    #[serde(default, deserialize_with = "lane_or_none")]
    pub hat_open: Vec<u8>,
    pub ride: Vec<u8>,
    pub crash: Vec<u8>,
    /// The high tom, optional exactly as `hat_open` is: a groove that does
    /// not name it has no toms, which is every groove written before this
    /// pass. `tomHi` on the contract's side.
    #[serde(default, deserialize_with = "lane_or_none")]
    pub tom_hi: Vec<u8>,
    /// And the floor tom. Between them they are what a fill is made of
    /// (`plans/JAM_SOUND.md` §2.9); before this a fill was the snare going
    /// faster.
    #[serde(default, deserialize_with = "lane_or_none")]
    pub tom_lo: Vec<u8>,
    // ---- The percussionist's ten (`plans/tasks/jam-v5/BRIEF.md`) ----
    //
    // Optional every one of them, and for the reason `hat_open` and the toms
    // are: a groove written before the percussionist existed does not carry
    // these rows, and has to load and play exactly as it did. A groove that
    // carries none of them has no percussionist, which is most of the
    // library — a country train and a bluegrass groove have nobody on a
    // shaker, and saying so is a row that is not there rather than a row of
    // zeros the engine reads past on every bar to learn nothing.
    //
    // They are ROWS OF THE SAME BAR and not a second pattern: a
    // percussionist plays the same tick grid as the drummer, so the cells
    // are the same levels, the same length, and land in the same `JamTick`
    // the drums do. The audio thread walks one list.
    #[serde(default, deserialize_with = "lane_or_none")]
    pub shaker: Vec<u8>,
    #[serde(default, deserialize_with = "lane_or_none")]
    pub tambourine: Vec<u8>,
    #[serde(default, deserialize_with = "lane_or_none")]
    pub cowbell: Vec<u8>,
    #[serde(default, deserialize_with = "lane_or_none")]
    pub cabasa: Vec<u8>,
    #[serde(default, deserialize_with = "lane_or_none")]
    pub claves: Vec<u8>,
    #[serde(default, deserialize_with = "lane_or_none")]
    pub guiro: Vec<u8>,
    /// The open conga and the tumba. `conga_muted` is layer 1 of the high
    /// one — the ghost stroke — so a muted conga is a level on this row
    /// rather than a row of its own, exactly as a ghost snare is.
    #[serde(default, deserialize_with = "lane_or_none")]
    pub conga_hi: Vec<u8>,
    #[serde(default, deserialize_with = "lane_or_none")]
    pub conga_lo: Vec<u8>,
    #[serde(default, deserialize_with = "lane_or_none")]
    pub bongo_hi: Vec<u8>,
    #[serde(default, deserialize_with = "lane_or_none")]
    pub bongo_lo: Vec<u8>,
}

/// An optional lane: the cells, or nothing at all, whichever arrived.
///
/// `null` and a missing key both come out as an empty row. See
/// [`JamPattern::hat_open`], which is the only field that needs it.
fn lane_or_none<'de, D>(d: D) -> Result<Vec<u8>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<Vec<u8>>::deserialize(d)?.unwrap_or_default())
}

impl JamPattern {
    fn lanes(&self) -> [(JamLane, &[u8]); JAM_PATTERN_LANES] {
        [
            (JamLane::Kick, &self.kick),
            (JamLane::Snare, &self.snare),
            (JamLane::Hat, &self.hat),
            (JamLane::HatOpen, &self.hat_open),
            (JamLane::Ride, &self.ride),
            (JamLane::Crash, &self.crash),
            (JamLane::TomHi, &self.tom_hi),
            (JamLane::TomLo, &self.tom_lo),
            (JamLane::Shaker, &self.shaker),
            (JamLane::Tambourine, &self.tambourine),
            (JamLane::Cowbell, &self.cowbell),
            (JamLane::Cabasa, &self.cabasa),
            (JamLane::Claves, &self.claves),
            (JamLane::Guiro, &self.guiro),
            (JamLane::CongaHi, &self.conga_hi),
            (JamLane::CongaLo, &self.conga_lo),
            (JamLane::BongoHi, &self.bongo_hi),
            (JamLane::BongoLo, &self.bongo_lo),
        ]
    }
}

/// The lanes a pattern may leave out entirely.
///
/// Absent means silent, not malformed: every jam saved before these rows
/// existed has to load and play exactly as it did. A row that IS sent is
/// held to the same length as the rest — half a lane is a caller's bug, not
/// a groove.
const OPTIONAL_LANES: [JamLane; 3 + JAM_PERC_LANES] = [
    JamLane::HatOpen,
    JamLane::TomHi,
    JamLane::TomLo,
    // And every percussion row: a groove with no percussionist writes none
    // of them, which is most of the library.
    JamLane::Shaker,
    JamLane::Tambourine,
    JamLane::Cowbell,
    JamLane::Cabasa,
    JamLane::Claves,
    JamLane::Guiro,
    JamLane::CongaHi,
    JamLane::CongaLo,
    JamLane::BongoHi,
    JamLane::BongoLo,
];

/// Which row of the table a slot came from.
///
/// It travels all the way to the audio thread because the practice windows
/// need it there: on a trading bar the drums drop to hats only, and "only
/// the hat lane" is a comparison the callback has to be able to make without
/// asking which sound a hat is (the answer differs per kit).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JamLane {
    Kick,
    Snare,
    Hat,
    /// The open hi-hat. Its own lane, so a trading bar that drops the band
    /// "to hats only" keeps both of them and a groove can put the wash on
    /// the "and" without the closed hat moving.
    HatOpen,
    Ride,
    Crash,
    /// The high tom and the floor tom. Optional rows, and the two the fills
    /// in `plans/JAM_SOUND.md` §2.9 are written around.
    TomHi,
    TomLo,
    /// The percussionist's ten, in the contract's order and immediately
    /// after the drummer's — which is what [`JamLane::is_perc`] reads.
    ///
    /// They are lanes rather than one "percussion" lane because the band
    /// state asks about them one at a time no more than it asks about the
    /// hats one at a time: the lane travels to the audio thread so a
    /// trading bar can say what keeps playing, and "the percussion keeps
    /// going" is a question about the FAMILY, which the order answers.
    Shaker,
    Tambourine,
    Cowbell,
    Cabasa,
    Claves,
    Guiro,
    CongaHi,
    CongaLo,
    BongoHi,
    BongoLo,
    /// Not a row of `JamPattern` either — the foot that closes the hi-hat.
    /// The engine adds it after every open hat, at the next hat hit, because
    /// it is a consequence of the groove rather than something a groove
    /// writes.
    HatPedal,
    /// Not a row of `JamPattern` — the bass is its own array in the config
    /// and is merged into the same ticks when the table is compiled, so the
    /// audio thread has one list to walk instead of two.
    Bass,
    /// Not a row of `JamPattern` either. One note of a keys voicing; a
    /// voicing puts up to four of these on the same tick, and they carry the
    /// same lane so a trading bar drops all of them together.
    Keys,
}

impl JamLane {
    fn name(self) -> &'static str {
        match self {
            Self::Kick => "kick",
            Self::Snare => "snare",
            Self::Hat => "hat",
            Self::HatOpen => "hatOpen",
            Self::Ride => "ride",
            Self::Crash => "crash",
            Self::TomHi => "tomHi",
            Self::TomLo => "tomLo",
            Self::Shaker => "shaker",
            Self::Tambourine => "tambourine",
            Self::Cowbell => "cowbell",
            Self::Cabasa => "cabasa",
            Self::Claves => "claves",
            Self::Guiro => "guiro",
            Self::CongaHi => "congaHi",
            Self::CongaLo => "congaLo",
            Self::BongoHi => "bongoHi",
            Self::BongoLo => "bongoLo",
            Self::HatPedal => "hatPedal",
            Self::Bass => "bass",
            Self::Keys => "keys",
        }
    }

    /// Is this row the percussionist's?
    ///
    /// Read on the AUDIO THREAD, once per slot on a trading bar, which is
    /// why it is a range on the discriminant rather than a lookup: the ten
    /// are numbered together and immediately after the drummer's eight, so
    /// the whole question is two comparisons on a byte the slot already
    /// carries.
    ///
    /// What it decides is the contract's band rule: **the percussion keeps
    /// going when the hats do.** In a breakdown the kit drops to kick and
    /// hats and the shaker and the congas keep the time, which is what a
    /// percussionist in a room does and the reason the layer is worth
    /// having at all.
    #[inline]
    pub fn is_perc(self) -> bool {
        matches!(
            self,
            Self::Shaker
                | Self::Tambourine
                | Self::Cowbell
                | Self::Cabasa
                | Self::Claves
                | Self::Guiro
                | Self::CongaHi
                | Self::CongaLo
                | Self::BongoHi
                | Self::BongoLo
        )
    }

    /// The kit voice this percussion row plays, or `None` for a row that is
    /// not the percussionist's.
    ///
    /// The lane and the voice are one to one here — a percussionist's row IS
    /// an instrument, where the drummer's `ride` row reaches for the bell on
    /// a level 4 and the `snare` row for the cross-stick on a ghost. There
    /// is no such second stroke on a tray: a cowbell is a cowbell. The one
    /// place a level changes which RECORDING plays is the conga, whose
    /// muted ghost is layer 1 of the open one, and that is a layer rather
    /// than a voice.
    #[inline]
    fn perc_voice(self) -> Option<KitVoice> {
        Some(match self {
            Self::Shaker => KitVoice::Shaker,
            Self::Tambourine => KitVoice::Tambourine,
            Self::Cowbell => KitVoice::Cowbell,
            Self::Cabasa => KitVoice::Cabasa,
            Self::Claves => KitVoice::Claves,
            Self::Guiro => KitVoice::Guiro,
            Self::CongaHi => KitVoice::CongaHi,
            Self::CongaLo => KitVoice::CongaLo,
            Self::BongoHi => KitVoice::BongoHi,
            Self::BongoLo => KitVoice::BongoLo,
            _ => return None,
        })
    }
}

/// What the engine receives from `set_jam`. Field for field, camelCase, the
/// mirror of `JamEngineConfig`.
/// `Default` is for the tests and the probe, which build a config by hand
/// and should not have to name every field the contract has grown. Serde
/// does not use it — every optional field carries its own
/// `#[serde(default)]` — so a config off the wire is unaffected.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamConfig {
    pub ticks_per_beat: u32,
    pub beats_per_bar: u32,
    /// The groove.
    pub bar: JamPattern,
    /// Played instead of `bar` on the last bar of every chorus, when set.
    #[serde(default)]
    pub fill: Option<JamPattern>,
    /// Bars in one chorus of the form, 1..64.
    pub form_bars: u32,
    /// A crash on tick 0 of bar 0 of every chorus.
    pub crash_on_one: bool,
    /// Gain multiplier on every hit, 0.5..1.5.
    pub intensity: f32,
    /// Which kit plays the lanes: "room", "tight", "brushes", "electronic", "raw".
    /// Anything else is "room" — see [`JamKit::from_name`].
    #[serde(default)]
    pub kit: String,
    /// The bass, when the band has one. Absent or null: no bass.
    #[serde(default)]
    pub bass: Option<JamBassLine>,
    /// The practice windows, applied per bar from the engine's own form
    /// counter so they land on bar lines. Absent or null: the band plays
    /// every bar.
    #[serde(default)]
    pub practice: Option<JamPracticeConfig>,
    /// Also play the fill on every bar whose 1-based number within the
    /// chorus is a multiple of this. Absent or 0: the last bar of the chorus
    /// only, which is what a fill has always meant here.
    #[serde(default)]
    pub fill_every: Option<u32>,
    /// The keys, comping. Absent or null: nobody on the keys.
    #[serde(default)]
    pub keys: Option<JamKeysLine>,
    /// Per-lane balance. Absent: 1.0 each, which is the band as the grooves
    /// were written.
    #[serde(default)]
    pub mix: Option<JamMix>,
    /// What the count-in plays. Absent: the beep the drill uses.
    #[serde(default)]
    pub count_in_sound: Option<JamCountInSound>,
    /// Does the drummer play you in?
    ///
    /// The last beat the count-in sounds is handed to the band instead: the
    /// fill's last beat, kick, snare and toms, straight into bar one. It is
    /// the half of `intro: "fill"` that nothing in the compiler could reach
    /// before, because the count-in is played by the engine from its own
    /// counter and `jam_play` hands every one of those ticks back to the
    /// click.
    ///
    /// **It also says what `fill` is FOR.** A table that carries a pickup
    /// spends its fill row on the pickup and plays no bar-line fill — an
    /// arrangement decides its fills per bar and puts them in `bar`, so the
    /// engine's own last-bar-of-the-chorus rule would play a second one over
    /// the top. One row, one job, said once.
    #[serde(default)]
    pub pickup: Option<bool>,
    /// Which bass the band has: "fingered", "picked", "upright", "slap",
    /// "synth". Absent or unknown: fingered, which is the voice the first
    /// pass shipped — see [`BassVoice::from_name`].
    #[serde(default)]
    pub bass_voice: Option<String>,
    /// Who is on the keys: "epiano", "organ", "clav", "pad". Absent or
    /// unknown: epiano, for the same reason.
    #[serde(default)]
    pub keys_voice: Option<String>,
    /// A kit of the musician's own samples. Absent or null: the built-in
    /// kit named in `kit`, exactly as before.
    #[serde(default)]
    pub custom_kit: Option<JamCustomKit>,
    /// WHEN this table takes over from the one playing.
    ///
    /// Absent or `"now"` is what a jam has always done: a change the
    /// musician made is heard on the next tick, and only the bar-ahead bass
    /// and keys wait for the bar line (see [`swap_defers`]). `"barLine"`
    /// makes the WHOLE table wait, drums included.
    ///
    /// It exists because an arrangement is written a bar ahead. The sender
    /// posts the next bar's groove during this one — a breakdown chorus
    /// dropping to the hats, a stop-time bar, a fill scaled to the dynamics
    /// — and every one of those is a change to the drums, which today
    /// arrives at once and puts the next bar's drummer a bar early. Asking
    /// for the bar line is the sender saying "this is next bar's, not
    /// this bar's".
    #[serde(default)]
    pub apply_at: Option<ApplyAt>,
    /// Does the form END when the bar carrying this table completes?
    ///
    /// `song` sets it on the last bar of the last chorus. The engine stops
    /// there the way a press of Stop would, and says so once with
    /// `jam-ended`. Absent or false: the band plays on, which is every jam
    /// that is a loop.
    #[serde(default)]
    pub ends_form: Option<bool>,
    /// Does this groove's snare lane mean the CROSS-STICK where it writes a
    /// ghost?
    ///
    /// A bossa and a ballad are played on the rim with the stick laid across
    /// the head, and that is a different sound from a quiet snare, not a
    /// quieter one. The groove knows which it is; the engine does not, which
    /// is why this is a flag on the config (`snareGhostIsRim`) and not a
    /// guess about tempo or feel. Absent or false: a ghost is a ghost.
    #[serde(default)]
    pub snare_ghost_is_rim: Option<bool>,
    /// Is there a percussionist in this band?
    ///
    /// The band flag, mirroring `Jam.band.perc` on the contract's side. It
    /// is a THIRD state and not a boolean, and the three are different:
    ///
    /// * `Some(true)` — the jam has a percussionist, and every percussion
    ///   row the groove wrote plays.
    /// * `None` — nobody has said. The rows play if the groove has any,
    ///   which is what every jam saved before this pass means and what a
    ///   sender that has not learned the field yet means. A jam is never
    ///   silently given a percussionist it did not ask for: a groove with no
    ///   percussion rows has no percussion either way.
    /// * `Some(false)` — the musician switched the percussionist off. The
    ///   rows are dropped and NOTHING ELSE CHANGES: same drums, same bass,
    ///   same keys, same normalisation, same everything. Muting a player is
    ///   not remixing the band.
    ///
    /// It is a flag here rather than zeroed rows in the sender because it is
    /// a member of the band rather than a bar of music — the same reason
    /// `mix.perc` is a dial rather than a gain written into every cell.
    #[serde(default)]
    pub perc: Option<bool>,
}

/// When a table takes over. The mirror of `JamEngineConfig.applyAt` in
/// `src/jam/types.ts`.
///
/// An unknown value is not possible — serde refuses one and the whole
/// config is rejected with a message, which is the right answer for a field
/// whose two values mean opposite things about timing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ApplyAt {
    /// The next tick. What a jam has always done.
    #[default]
    Now,
    /// The next downbeat, whatever changed — the groove, the kit, the
    /// intensity, the mix, all of it.
    BarLine,
}

/// A folder of WAVs on this machine, used as the kit. The mirror of
/// `JamEngineConfig.customKit` in `src/jam/types.ts`.
///
/// A path and nothing else: the *record* the UI keeps also carries a name
/// to show in a list, and the engine has no use for it.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamCustomKit {
    pub dir: String,
}

/// One voicing per tick, up to four MIDI notes each, an empty array for a
/// rest. The mirror of `JamKeysLine` in `src/jam/types.ts`.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamKeysLine {
    pub voicings: Vec<Vec<u8>>,
    /// Gain multiplier on the keys voice, 0.5..1.5.
    pub gain: f32,
    /// How hard each voicing is played. See [`JamBassLine::velocities`].
    #[serde(default)]
    pub velocities: Vec<f32>,
    /// How long each voicing rings, in ticks. See [`JamBassLine::lengths`].
    #[serde(default)]
    pub lengths: Vec<f32>,
}

/// Per-lane balance. The mirror of `JamMix` in `src/jam/types.ts`.
///
/// Resolved into the slots when the table is compiled, so the audio thread
/// never reads it — a mix is three multiplications on the command thread,
/// not three more fields for the callback to look up per tick.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamMix {
    pub drums: f32,
    pub bass: f32,
    pub keys: f32,
    /// The percussionist's own level, 0..1.5 like the rest.
    ///
    /// **Defaulted and not required**, unlike the three above it. Those have
    /// been on the wire since the mix existed, so a config without them is a
    /// caller that is wrong; this one arrives on a wire full of jams saved
    /// before the percussionist did, and a stored mix of three numbers has
    /// to keep loading. Absent is 1.0, which is the percussionist at the
    /// level the grooves were written at.
    #[serde(default = "default_mix_level")]
    pub perc: f32,
}

/// A mix lane nobody set: the band as the grooves were written.
fn default_mix_level() -> f32 {
    1.0
}

impl Default for JamMix {
    fn default() -> Self {
        Self {
            drums: 1.0,
            bass: 1.0,
            keys: 1.0,
            perc: 1.0,
        }
    }
}

impl JamMix {
    /// The mix as the compiler will actually use it. Non-finite reads as
    /// 1.0 — a NaN in a store is a jam that plays, not a silent band.
    fn clamped(self) -> Self {
        let one = |v: f32| {
            if v.is_finite() {
                v.clamp(MIX_MIN, MIX_MAX)
            } else {
                1.0
            }
        };
        Self {
            drums: one(self.drums),
            bass: one(self.bass),
            keys: one(self.keys),
            perc: one(self.perc),
        }
    }
}

/// What the count-in plays. The mirror of `JamCountInSound`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JamCountInSound {
    /// The beep the drill counts in with. What a count-in has always been.
    Beep,
    /// The kit's rim, played like a drummer clicking sticks: on the beats,
    /// and nothing in between.
    Sticks,
}

impl Default for JamCountInSound {
    fn default() -> Self {
        Self::Beep
    }
}

/// One MIDI note per tick, `0` for a rest, the same length as the drum
/// lanes. The mirror of `JamBassLine` in `src/jam/types.ts`.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamBassLine {
    pub pitches: Vec<u8>,
    /// Gain multiplier on the bass voice, 0.5..1.5.
    pub gain: f32,
    /// How hard each note is played, per tick, 1.0 as written.
    ///
    /// Empty (the default, and every config sent before 2026-09-16) is 1.0
    /// everywhere. Otherwise exactly as long as `pitches`; a rest's entry is
    /// ignored. Clamped to [`NOTE_VELOCITY_MIN`]..[`NOTE_VELOCITY_MAX`] and
    /// multiplied into the note's gain, and it picks the note's recorded
    /// layer — so an accented note is a harder stroke, not only a louder one.
    /// Without it every note of a line was the same stroke, which is the
    /// sound of a sequencer rather than a player.
    #[serde(default)]
    pub velocities: Vec<f32>,
    /// How long each note rings, in ticks, per tick.
    ///
    /// Empty, or `0` for a note, is "until the next note or the bar line",
    /// which is all a line could say before. A positive length shorter than
    /// that ends the note early — the detached note a funk or a reggae bass
    /// plays, which the old rule could not write at all: a rest after a note
    /// used to extend it. A length longer than the gap is cut to the gap.
    #[serde(default)]
    pub lengths: Vec<f32>,
}

/// The softest and hardest a note may be asked to be. Wide enough for a
/// ghost note and an accent, narrow enough that a stray value cannot silence
/// a line or blow the bus.
pub const NOTE_VELOCITY_MIN: f32 = 0.3;
pub const NOTE_VELOCITY_MAX: f32 = 1.4;

/// One note's velocity, from a line's optional array.
fn note_velocity(velocities: &[f32], i: usize) -> f32 {
    match velocities.get(i) {
        Some(v) if v.is_finite() => v.clamp(NOTE_VELOCITY_MIN, NOTE_VELOCITY_MAX),
        _ => 1.0,
    }
}

/// How many ticks a note rings: its own length if it asked for one shorter
/// than the gap to the next note, the gap otherwise.
fn note_cap(lengths: &[f32], i: usize, gap: usize) -> f32 {
    match lengths.get(i) {
        Some(l) if l.is_finite() && *l > 0.0 => l.min(gap as f32),
        _ => gap as f32,
    }
}

/// The optional per-note arrays must be empty or exactly one entry per tick.
fn check_articulation(what: &str, velocities: &[f32], lengths: &[f32], ticks: u32) -> Result<(), String> {
    for (name, v) in [("velocities", velocities), ("lengths", lengths)] {
        if !v.is_empty() && v.len() != ticks as usize {
            return Err(format!(
                "{what}.{name} has {} entries; it is either empty or one per tick ({ticks})",
                v.len()
            ));
        }
    }
    Ok(())
}

/// The mirror of `JamPracticeConfig` in `src/jam/types.ts`.
///
/// **Phase-locked to the chorus.** Both windows are read off the bar within
/// the chorus and start over at bar 0 of every chorus, so a silence lands on
/// the same chord every time round. `src/jam/practice.ts` is the same rule
/// in TypeScript — it is what draws the timeline, and if the two disagree
/// the drawn band and the heard band disagree. [`band_state_for_bar`] below
/// is the Rust half, and its tests are ported from `practice.test.ts`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamPracticeConfig {
    #[serde(default)]
    pub drop_out: Option<JamDropOut>,
    #[serde(default)]
    pub trade: Option<JamTrade>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamDropOut {
    pub every_bars: u32,
    pub bars: u32,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamTrade {
    pub band_bars: u32,
    pub you_bars: u32,
}

/// What the band is doing on a bar. Mirrored on every `BeatEvent` as
/// `bandState`, and `JamBandState` in `src/jam/types.ts` is the same three
/// words — `camelCase` gives "full", "hatsOnly", "silent".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum JamBandState {
    /// Everything the table says.
    Full,
    /// Your bars in a trade: the hat lane keeps the time and nothing else
    /// plays, bass included.
    HatsOnly,
    /// A drop-out bar. No drums, no bass — and no click either, because the
    /// point of the window is silence.
    Silent,
}

/// What the band does on bar `form_bar` of a chorus.
///
/// Line for line the rule in `src/jam/practice.ts`, and deliberately so: the
/// timeline draws the silence a bar before it arrives, and a band that
/// disagreed with the drawing would be worse than no drawing at all.
///
/// Drop-out: a window of `bars` bars opens at every multiple of `everyBars`
/// within the chorus, but never at bar 0 — the band always gets to state the
/// form first. Trading: from bar 0, `bandBars` bars of band then `youBars`
/// bars of hats, repeating. Drop-out wins where both apply, because silence
/// is the stronger instruction and the one that produces an honest score.
pub fn band_state_for_bar(
    form_bar: u32,
    form_bars: u32,
    practice: Option<&JamPracticeConfig>,
) -> JamBandState {
    let practice = match practice {
        Some(p) => p,
        None => return JamBandState::Full,
    };
    let form_bars = form_bars.max(1);
    let bar = form_bar % form_bars;

    if let Some(d) = practice.drop_out {
        if d.every_bars > 0 && d.bars > 0 && bar >= d.every_bars && bar % d.every_bars < d.bars {
            return JamBandState::Silent;
        }
    }
    if let Some(t) = practice.trade {
        let cycle = t.band_bars.saturating_add(t.you_bars);
        if t.band_bars > 0 && t.you_bars > 0 && cycle > 0 && bar % cycle >= t.band_bars {
            return JamBandState::HatsOnly;
        }
    }
    JamBandState::Full
}

// ---------------------------------------------------------------------------
// Moving through the form — jump and loop
// ---------------------------------------------------------------------------

/// The serde mirror of `JamPositionCommand` in `src/jam/types.ts`.
///
/// One command carries BOTH halves of where the form goes, and it replaces
/// both. Sending `{ jumpTo: 3, loop: null }` leaves the loop off; sending
/// `{ jumpTo: null, loop: { start: 8, end: 11 } }` sets a loop and asks for
/// no jump. That is the contract's "`loop` stays until replaced with null":
/// the *engine* keeps it between commands, and a command that names it
/// `null` is the thing that takes it away.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamPositionCommand {
    /// 0-based bar of the chorus to land on at the next bar line.
    #[serde(default)]
    pub jump_to: Option<u32>,
    /// Bars `start..=end`, 0-based within the chorus.
    ///
    /// Renamed by hand: `rename_all` would make this `loopBars`, and the
    /// contract's field is `loop` — which cannot be a Rust identifier.
    #[serde(default, rename = "loop")]
    pub loop_bars: Option<JamLoop>,
}

/// A loop range from the contract: inclusive at both ends, 0-based.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct JamLoop {
    pub start: u32,
    pub end: u32,
}

/// Where the form goes, as the audio thread reads it.
///
/// `Copy` and eight bytes wide on purpose: the callback takes a snapshot of
/// it behind a `try_lock` when the generation counter moves, and there is
/// nothing to free afterwards — no retirement path, no `Arc`, no allocation.
/// The table has all of that because it owns `Vec`s; this owns nothing.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct JamPosition {
    /// Consumed at the next bar line, then gone.
    pub jump: Option<u32>,
    /// Held until a command replaces it, or a new table makes it impossible.
    pub loop_bars: Option<(u32, u32)>,
}

impl JamPosition {
    /// What is left of this position once a table of `form_bars` bars is
    /// loaded (or `None` for no table at all).
    ///
    /// A pending jump is dropped: "bar 9" of a 12-bar blues and "bar 9" of
    /// an eight-bar loop are not the same place, and a jump the musician
    /// asked for against the old form is a worse answer than no jump. The
    /// loop is kept when it still fits, because a musician looping the
    /// turnaround while they edit the bass line means to keep looping it —
    /// and the bar-ahead bass send is a new table several times a chorus.
    #[must_use]
    pub fn for_table(self, form_bars: Option<u32>) -> Self {
        let loop_bars = match (self.loop_bars, form_bars) {
            (Some((s, e)), Some(n)) if e >= n || s > e => None,
            (keep, _) => keep,
        };
        Self {
            jump: None,
            loop_bars,
        }
    }
}

/// Check a `set_jam_position` command against the form that is loaded.
///
/// `form_bars` is `None` when no jam is loaded, and then nothing can be
/// checked and nothing is refused: the position is stored, ignored while
/// there is no band, and re-checked by [`JamPosition::for_table`] the moment
/// a table arrives. Refusing it instead would mean the order the UI happens
/// to send two commands in decides whether a loop survives.
pub fn validate_position(
    cmd: &JamPositionCommand,
    form_bars: Option<u32>,
) -> Result<JamPosition, String> {
    if let Some(l) = cmd.loop_bars {
        if l.start > l.end {
            return Err(format!(
                "the loop starts at bar {} and ends at bar {}; the start cannot be \
                 after the end",
                l.start + 1,
                l.end + 1
            ));
        }
    }
    if let Some(n) = form_bars {
        if let Some(j) = cmd.jump_to {
            if j >= n {
                return Err(format!(
                    "there is no bar {} to jump to; this form is {n} bars long",
                    j + 1
                ));
            }
        }
        if let Some(l) = cmd.loop_bars {
            if l.end >= n {
                return Err(format!(
                    "the loop ends at bar {}, and this form is {n} bars long",
                    l.end + 1
                ));
            }
        }
    }
    Ok(JamPosition {
        jump: cmd.jump_to,
        loop_bars: cmd.loop_bars.map(|l| (l.start, l.end)),
    })
}

// ---------------------------------------------------------------------------
// The compiled table
// ---------------------------------------------------------------------------

/// One drum, ready to spawn. `cap_ticks` is a ring-out limit in ticks — 0.0
/// means play the sample out, which is what a kick, a snare and a crash all
/// want. The callback turns it into samples with the tick length it already
/// computed, so the cap follows the tempo without anything being recompiled.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct JamSlot {
    /// Which drum, at which layer. The ROUND ROBIN in here is always 0: the
    /// table says which voice and which layer, and the callback works out
    /// which of that layer's recordings this bar and this tick get. See
    /// [`round_robin`].
    pub sound: SoundId,
    pub gain: f32,
    pub cap_ticks: f32,
    /// Which row this came from. The practice windows read it on the audio
    /// thread — "hats only" is a lane, not a sound.
    pub lane: JamLane,
    /// Level 2 or 4. Carried per slot rather than only per tick so a trading
    /// bar can flash the dot on what is actually playing.
    pub accent: bool,
    /// Where this drum sits across the stereo picture, as a pair of gains.
    /// Resolved from the kit's manifest when the table was compiled, so the
    /// audio thread multiplies rather than panning.
    pub pan_l: f32,
    pub pan_r: f32,
    /// How many round robins this voice's layer has, and which voice it is —
    /// the two numbers [`round_robin`] and [`drift`] need on the tick.
    /// `voice` is a [`KitVoice`] index, or [`NOT_A_DRUM`].
    pub rr: u8,
    pub voice: u8,
    /// Which voices' hits fade this one out, and which voices THIS one fades
    /// out. Both as masks of `KitVoice::bit`, so the audio thread's question
    /// is an `&` over the voices already ringing.
    pub choked_by: u32,
    pub chokes: u32,
    /// How many frames of fade-out this note ends its cap with, at the rate
    /// its bank was built at.
    ///
    /// A RECORDED note only. The cap is a decision about musical length — a
    /// note rings until the next one — and on a recording, cutting there is
    /// a step from whatever the string was doing straight down to nothing:
    /// a click on every note of every walking line. The bank names its own
    /// release and this is it, resolved when the table was compiled.
    ///
    /// Nought for a drum, for the count-in and for a synthesised note, whose
    /// recipes already land on zero (`Recipe::release_fraction`).
    pub release: u32,
}

/// [`JamSlot::voice`] for everything that is not a drum: the bass and the
/// keys. Outside the range of any [`KitVoice`], so no choke mask can name
/// it and no drift hash collides with a drum's.
pub const NOT_A_DRUM: u8 = u8::MAX;

/// A placeholder for the unused tail of a tick's slot array. Gain 0.0, so
/// even a bug that read past `len` would be silent rather than loud.
const SILENT_SLOT: JamSlot = JamSlot {
    sound: SoundId::Band {
        voice: 0,
        layer: 0,
        robin: 0,
    },
    gain: 0.0,
    cap_ticks: 0.0,
    lane: JamLane::Kick,
    accent: false,
    pan_l: 1.0,
    pan_r: 1.0,
    rr: 1,
    voice: NOT_A_DRUM,
    choked_by: 0,
    chokes: 0,
    release: 0,
};

/// Everything the band plays on one tick.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct JamTick {
    slots: [JamSlot; JAM_MAX_SLOTS],
    len: u8,
    accent: bool,
}

impl JamTick {
    const EMPTY: Self = Self {
        slots: [SILENT_SLOT; JAM_MAX_SLOTS],
        len: 0,
        accent: false,
    };

    /// The drums on this tick. A slice of a fixed-size array — no allocation,
    /// nothing to free.
    #[inline]
    pub fn slots(&self) -> &[JamSlot] {
        &self.slots[..self.len as usize]
    }

    /// True when any lane is at level 2 here, which is what makes the UI's
    /// dots flash on the kick and the backbeat.
    #[inline]
    pub fn is_accent(&self) -> bool {
        self.accent
    }

    fn push(&mut self, slot: JamSlot) {
        if (self.len as usize) < JAM_MAX_SLOTS {
            self.slots[self.len as usize] = slot;
            self.len += 1;
        }
        self.accent |= slot.accent;
    }
}

/// What the audio thread reads. Immutable once compiled; the callback holds
/// an `Arc` to it and swaps in a new one when the generation counter moves.
#[derive(Debug)]
pub struct JamTable {
    ticks_per_bar: u32,
    form_bars: u32,
    bar: Vec<JamTick>,
    fill: Option<Vec<JamTick>>,
    /// Play the fill on every bar whose 1-based number in the chorus is a
    /// multiple of this, as well as on the last bar. 0 is the last bar only.
    fill_every: u32,
    /// The bar BEFORE bar one: one beat of drums the band plays over the
    /// count-in's last beat, or `None` for a jam with no pickup.
    ///
    /// Exactly `ticks_per_beat` ticks, cut from the fill's last beat with
    /// everything but the kick, the snare and the toms taken out — a pickup
    /// is what a drummer's hands do on the way into the tune, and hats,
    /// cymbals, bass and keys have not started yet. Built here, at the same
    /// level as the band it leads into, so the audio thread indexes one
    /// short row and decides nothing.
    pickup: Option<Vec<JamTick>>,
    /// The crash on the one, already mixed to the table's normalisation.
    /// `None` when the jam did not ask for one, or when the groove's own
    /// crash lane already hits tick 0 — two crashes on the same sample is a
    /// cymbal at double volume, not a bigger cymbal.
    crash_on_one: Option<JamSlot>,
    /// What the band does on each bar of the chorus, worked out once when
    /// the table is compiled. `form_bars` is at most 64, so this is a few
    /// dozen bytes and the audio thread indexes it instead of running the
    /// modulo arithmetic; the state is constant within a bar either way,
    /// which is what "decided at the bar line" means.
    band_states: Vec<JamBandState>,
    /// What the count-in plays over this band, decided here rather than per
    /// tick: `None` is the beep the drill uses, `Some(slot)` is the kit's
    /// rim at the beat gain. The callback reads one `Copy` field.
    count_in_slot: Option<JamSlot>,
    /// Which kit the lanes resolved to. Diagnostics and tests only.
    pub kit: JamKit,
    /// How hard this kit asks to be driven into the bus's tanh stage, and
    /// the reciprocal that keeps the curve passing through 1.0. Worked out
    /// here so the audio thread copies two floats at a table swap rather
    /// than computing a `tanh` in the callback.
    pub bus_drive: f32,
    pub bus_shape: f32,
    /// The drums themselves.
    ///
    /// **Inside the table on purpose, and now that is true of every kit
    /// rather than only of a folder somebody chose.** The audio thread has
    /// to be able to answer `SoundId::Band { hat, .. }` while it is mixing,
    /// and it may not lock or allocate to do it. Every other way of getting
    /// a kit to the callback needs a second handoff with a second generation
    /// counter and a window in which the drums have swapped and their
    /// samples have not — which is a hat playing out of somebody else's kit
    /// for one buffer. Here there is no window at all: the drums and the
    /// bank that holds them are one `Arc<JamTable>`, so they arrive
    /// together, swap together at the bar line, and retire together on a
    /// thread that may `free()`.
    ///
    /// The bar-ahead sends share one `Arc` — `KitCache` hands back the same
    /// bank for the same kit — so a chorus of them costs a refcount bump
    /// each and no decoding at all.
    bank: Arc<KitBank>,
    /// The percussionist's set, when one ships and this jam has one.
    ///
    /// **Beside the drums and inside the table, for every reason the drums
    /// are.** The audio thread has to be able to answer
    /// `SoundId::Band { voice: shaker, .. }` while it is mixing and may not
    /// lock or allocate to do it; the set is decoded at whatever rate the
    /// device opened at, long after the `SoundBank` was built. So it rides
    /// in the `Arc<JamTable>` that names it, arrives with it, swaps with it
    /// at the bar line and retires with it on a thread that may `free()`.
    /// There is no window in which the drums have swapped and the
    /// percussion has not.
    ///
    /// `None` is every percussion lane silent: no set shipped, or no
    /// percussionist in this band. A table with no percussion slots in it
    /// still carries the set — resolving it costs an `Arc` clone off the
    /// cache — because whether a row is silent is the compiler's answer and
    /// not the callback's.
    perc: Option<Arc<KitBank>>,
    /// The recorded bass and keys, when the voices this jam names ship one.
    ///
    /// Inside the table for every reason the drums are, and the reason is
    /// worth repeating because it is the whole shape of this feature: the
    /// audio thread has to be able to answer `SoundId::Voice { .. }` while
    /// it is mixing, and it may not lock or allocate to do it. A bank is
    /// twenty-eight notes built at the rate the device opened at — nothing
    /// anybody would pay for on a device change, so it cannot live in the
    /// `SoundBank` — so it rides in the `Arc<JamTable>` that names it,
    /// arrives with it, swaps with it at the bar line and retires with it on
    /// a thread that may `free()`.
    ///
    /// `None` is the synthesised recipe, which is what every voice was
    /// before this and what `synth`, `organ`, `clav` and `pad` always are.
    voices: JamVoices,
    /// Whether any tick of the groove has a hat. A band without one — a
    /// drummer's band, which has no drums at all, or a groove drawn without
    /// hats — keeps its bass on your bars in a trade instead of going dead.
    has_hat: bool,
    /// Everything about the table EXCEPT the bass line, hashed. Two tables
    /// with the same signature are the same drummer under a different bass
    /// bar, and that is the case the audio thread defers to the next bar
    /// line (see [`swap_defers`]).
    drums_signature: u64,
    /// Does this table wait for the next downbeat, whatever changed?
    ///
    /// `applyAt: "barLine"` on the config. Out of both signatures on
    /// purpose: it says WHEN a table arrives, not what it sounds like, so
    /// it must not make the gain memo re-measure the same band and must not
    /// make the same drummer look like a different one.
    apply_at_bar_line: bool,
    /// Does the form end when the bar carrying this table completes?
    ends_form: bool,
    /// The loudest sample four bars of this band render, before and after
    /// the per-table normalisation, at the fastest tick the engine can
    /// produce. Diagnostics only; the audio thread never reads these.
    pub peak_before: f32,
    pub peak_after: f32,
    /// The same measurement at intensity 1.0 — the number the normalisation
    /// is computed from, and the one [`JamGainCache`] remembers so the next
    /// table with the same drums does not have to render four bars again.
    pub base_peak: f32,
}

impl JamTable {
    /// See the `has_hat` field.
    #[inline]
    pub fn has_hat(&self) -> bool {
        self.has_hat
    }

    /// The drums this table plays. Read once per buffer by the audio thread
    /// — a field of an object it is already holding, which is why it may.
    #[inline]
    pub fn kit_bank(&self) -> &KitBank {
        &self.bank
    }

    /// The percussion this table plays, or `None` for a band with no
    /// percussionist. Read once per buffer by the audio thread, off an
    /// object it is already holding, which is why it may.
    #[inline]
    pub fn perc_bank(&self) -> Option<&KitBank> {
        self.perc.as_deref()
    }

    /// The recorded bank one of the melodic lines plays out of, or `None`
    /// for the synthesised recipe. Read once per buffer by the audio thread,
    /// off an object it is already holding, which is why it may.
    #[inline]
    pub fn voice_bank(&self, line: VoiceLine) -> Option<&MelodicBank> {
        match line {
            VoiceLine::Bass => self.voices.bass.as_deref(),
            VoiceLine::Keys => self.voices.keys.as_deref(),
        }
    }

    /// What the band does on bar `form_bar` of the chorus. Out of range —
    /// which cannot happen, since the caller wraps at `form_bars` — reads as
    /// `Full`, so a bug is a band that plays rather than a panic.
    #[inline]
    pub fn band_state(&self, form_bar: u32) -> JamBandState {
        self.band_states
            .get(form_bar as usize)
            .copied()
            .unwrap_or(JamBandState::Full)
    }

    /// Ticks in one bar of this table: `ticksPerBeat × beatsPerBar`. The
    /// engine compares this against its own `beats_per_measure × subdivision`
    /// and falls back to the plain click when they disagree.
    #[inline]
    pub fn ticks_per_bar(&self) -> u32 {
        self.ticks_per_bar
    }

    /// Bars in one chorus of the form.
    #[inline]
    pub fn form_bars(&self) -> u32 {
        self.form_bars
    }

    /// Does the form end when the bar carrying this table completes?
    ///
    /// Read on the audio thread at the bar line, once per bar, off a table
    /// it is already holding.
    #[inline]
    pub fn ends_form(&self) -> bool {
        self.ends_form
    }

    /// Does this table wait for the next downbeat? See
    /// [`JamConfig::apply_at`].
    #[inline]
    pub fn apply_at_bar_line(&self) -> bool {
        self.apply_at_bar_line
    }

    /// The crash to add on tick 0 of bar 0 of a chorus, if any.
    #[inline]
    pub fn crash_on_one(&self) -> Option<JamSlot> {
        self.crash_on_one
    }

    /// What the count-in beats play over this band: `None` for the beep the
    /// drill has always used, `Some(slot)` for the kit's sticks.
    ///
    /// Decided when the table is compiled — when the count-in is armed the
    /// callback reads this once, and it is the same answer for every beat of
    /// the count. Nothing here is worked out per tick.
    #[inline]
    pub fn count_in_slot(&self) -> Option<JamSlot> {
        self.count_in_slot
    }

    /// Does this table have a fill bar?
    #[inline]
    pub fn has_fill(&self) -> bool {
        self.fill.is_some()
    }

    /// Does the drummer play this jam in? See the `pickup` field.
    #[inline]
    pub fn has_pickup(&self) -> bool {
        self.pickup.is_some()
    }

    /// What the band plays on tick `tick_in_beat` of the pickup — the count-in
    /// beat before bar one.
    ///
    /// `None` when this jam has no pickup, which is every jam that loops, and
    /// `None` past the end of the row, which the caller has already ruled out
    /// by checking the table's width against its own bar. The audio thread
    /// reads this exactly the way it reads [`JamTable::tick`]: an index into a
    /// row that was decided when the table was compiled.
    #[inline]
    pub fn pickup_tick(&self, tick_in_beat: u32) -> Option<&JamTick> {
        self.pickup.as_ref()?.get(tick_in_beat as usize)
    }

    /// Does the fill play on bar `jam_bar` (0-based within the chorus)?
    ///
    /// Always on the last bar of the chorus — that is what a fill is — and,
    /// when `fillEvery` is set, on every bar whose 1-based number in the
    /// chorus is a multiple of it. With `fillEvery` 4 on a 12-bar blues that
    /// is bars 4, 8 and 12 as the musician counts them, which is where a
    /// drummer puts them.
    #[inline]
    pub fn fill_bar(&self, jam_bar: u32) -> bool {
        let counted = jam_bar + 1;
        counted >= self.form_bars || (self.fill_every > 0 && counted % self.fill_every == 0)
    }

    /// What the band plays at `tick_index` of bar `jam_bar` (0-based within
    /// the chorus). The fill replaces the groove on the bars
    /// [`JamTable::fill_bar`] names, when the jam has one.
    ///
    /// `None` only when the tick index is outside the bar, which the caller
    /// has already ruled out by comparing `ticks_per_bar`; it is a bounds
    /// check, not a decision.
    #[inline]
    pub fn tick(&self, tick_index: u32, jam_bar: u32) -> Option<&JamTick> {
        let table = match self.fill {
            Some(ref f) if self.fill_bar(jam_bar) => f,
            _ => &self.bar,
        };
        table.get(tick_index as usize)
    }
}

/// How many measurements the memo remembers.
///
/// One per bar of the longest chorus the contract allows, because that is
/// the shape of the traffic: the bar-ahead handshake sends the SAME handful
/// of bass bars round and round, one per chord of the form, every chorus. A
/// memo this size covers any form the app can hold, so after the first time
/// round nothing is ever measured twice. It costs twelve bytes an entry.
const JAM_GAIN_MEMO: usize = JAM_MAX_FORM_BARS as usize;

/// The normalisations the command thread has already worked out.
///
/// [`compile`] renders four bars of the band to find out how loud it
/// actually is, and that render is the expensive part of loading a jam. It
/// runs on every `set_jam` — and the UI sends one four to six times a
/// chorus, because the bar-ahead bass has to arrive a bar early
/// (`useJamSession.ts`). Those sends walk the same few bass bars round the
/// form again and again, so from the second chorus on, every one of them is
/// asking for a number that has already been measured.
///
/// **The key is the whole table, bass included** ([`render_signature`]) —
/// not the drums alone. Keying on the drums and letting a changed bass share
/// the answer looks safe and is not: measured on the jitter probe's groove,
/// moving `bass.gain` across the range the contract allows (0.5 to 1.5, and
/// the store can hold either) moves the rendered peak of the room kit from
/// 2.08 to 2.95, and changing which note sits under the crash on the one
/// moves it another 8%. Both are far more than the 10%
/// the safety clamp allows for. Normalising a
/// loud bass against a quiet one's measurement renders 1.075 at full volume
/// on the room kit, which is the mixer clamping — the exact thing
/// `the_busiest_groove_never_makes_the_mixer_clamp` exists to forbid.
///
/// A hit is therefore the same table, and the number it hands back is the
/// number a cold compile would have produced, bit for bit.
///
/// Two things are deliberately left OUT of the key, because neither can
/// change the measurement:
///
/// * **Intensity.** The table is compiled at 1.0 and rendered at 1.0; the
///   musician's dial is applied afterwards. So dragging the intensity
///   slider re-uses the measurement instead of re-rendering four bars per
///   frame of the drag.
/// * **The practice windows.** They decide which bars the band plays, never
///   what a bar sounds like.
///
/// `the_gain_cache_never_lets_a_changed_bass_reach_the_clamp` in `engine.rs`
/// is what holds that to a number: it renders every kit at every rate and
/// across the tempo range with the memo in play.
pub struct JamGainCache {
    memo: std::sync::Mutex<GainMemo>,
}

/// A ring of remembered measurements. Small and linear on purpose: sixty-four
/// `u64` comparisons on the command thread is nothing, and a `HashMap` here
/// would be a data structure to explain rather than one to read.
struct GainMemo {
    entries: Vec<(u64, f32)>,
    next: usize,
}

impl Default for JamGainCache {
    fn default() -> Self {
        Self::new()
    }
}

impl JamGainCache {
    pub fn new() -> Self {
        Self {
            memo: std::sync::Mutex::new(GainMemo {
                entries: Vec::with_capacity(JAM_GAIN_MEMO),
                next: 0,
            }),
        }
    }

    /// The remembered peak for this exact table, if it has been measured.
    fn get(&self, signature: u64) -> Option<f32> {
        match self.memo.lock() {
            Ok(m) => m
                .entries
                .iter()
                .find(|&&(sig, _)| sig == signature)
                .map(|&(_, peak)| peak),
            // A poisoned memo is a memo miss, never a wrong number: the
            // render is the source of truth and only ever costs time.
            Err(_) => None,
        }
    }

    fn put(&self, signature: u64, peak: f32) {
        if let Ok(mut m) = self.memo.lock() {
            if m.entries.len() < JAM_GAIN_MEMO {
                m.entries.push((signature, peak));
                return;
            }
            let slot = m.next % JAM_GAIN_MEMO;
            m.entries[slot] = (signature, peak);
            m.next = slot + 1;
        }
    }
}

// ---------------------------------------------------------------------------
// Compiling
// ---------------------------------------------------------------------------

/// Validate a config and compile it into the table the audio thread reads.
///
/// Runs in the `set_jam` command — never on the audio thread. A config that
/// does not check out is rejected whole: the engine keeps whatever it had,
/// so a malformed jam can never leave the band half-loaded.
///
/// This overload decodes the kit the config names, at the reference rate,
/// through a process-wide cache. It is what tests and the probe use; the app
/// goes through [`compile_with`], which already holds the bank at the rate
/// the device is running at.
pub fn compile(cfg: &JamConfig) -> Result<JamTable, String> {
    let voices = reference_voices(cfg)?;
    compile_measured(cfg, None, reference_bank(&cfg.kit)?, reference_perc(), voices)
}

/// [`compile`] with the bass and keys on their synthesised recipes,
/// whatever banks ship.
///
/// The recorded banks landed under `sounds/voices/` after most of the
/// tests below were written, and sixteen of them stopped meaning what they
/// said: a test asserting which synthesised note a pitch becomes was
/// suddenly looking at a recorded one, and a level measured through the
/// synthesised `SoundBank` came back silent because the table now named a
/// bank that `SoundBank` does not hold. The test modules shadow `compile`
/// with this, so a test that says nothing about recordings tests the
/// recipe it was written against; a test that wants a recorded bank says
/// so through [`compile_with_voices`], and the shipped folders have a
/// test of their own in `voices/tests.rs`.
#[cfg(test)]
pub(crate) fn compile_synth(cfg: &JamConfig) -> Result<JamTable, String> {
    compile_measured(
        cfg,
        None,
        reference_bank(&cfg.kit)?,
        reference_perc(),
        JamVoices { bass: None, keys: None },
    )
}

/// The kit a name means, decoded once per process at [`JAM_REFERENCE_SR`].
///
/// For everything that has no audio device to ask: the tests, the four-bar
/// measurements, the probe before its stream opens. The app never comes
/// here — `set_jam` holds a `KitCache` and the rate the device actually
/// opened at, and a kit decoded at the wrong rate is a kit a semitone and a
/// half out.
///
/// **One entry per kit, and nothing is ever evicted**, which is what makes
/// this a constant rather than a cache. It matters because a decode's
/// identity is part of a table's signature (`hash_drums`): two decodes of
/// the same kit are two drummers as far as the bar-line handshake is
/// concerned, because either could be a file somebody just replaced. An
/// evicting cache here would make the same jam a different drummer
/// depending on which kit somebody looked at in between.
pub fn reference_bank(kit: &str) -> Result<Arc<KitBank>, String> {
    use std::collections::HashMap;
    static BANKS: std::sync::OnceLock<std::sync::Mutex<HashMap<usize, Arc<KitBank>>>> =
        std::sync::OnceLock::new();
    let index = JamKit::from_name(kit).0;
    let banks = BANKS.get_or_init(Default::default);
    // The lock is held ACROSS the decode, deliberately. Checking, dropping
    // the lock and inserting is the obvious shape and is a race: two threads
    // both miss, both decode, and the second overwrites the first — so a jam
    // compiled either side of it is two different drummers for no reason,
    // which is exactly the mistake the stable identity above exists to
    // prevent. Contention costs one decode of one kit, once per process.
    let mut held = banks
        .lock()
        .map_err(|_| "the shipped kits could not be read".to_string())?;
    if let Some(bank) = held.get(&index) {
        return Ok(bank.clone());
    }
    let bank = Arc::new(crate::kit::load_shipped(index, JAM_REFERENCE_SR)?);
    held.insert(index, bank.clone());
    Ok(bank)
}

/// THE PERCUSSION SET, decoded once per process at [`JAM_REFERENCE_SR`].
///
/// [`reference_bank`] for the other folder, and a constant rather than a
/// cache for the same reason: a decode's identity is part of a table's
/// signature, so two decodes of one set would be two percussionists as far
/// as the bar-line handshake is concerned.
///
/// **`None` when the app ships no set**, which is a checkout without
/// `sounds/perc` and is a state the whole feature is built to survive: the
/// table carries no set, every percussion lane compiles to no slot, and the
/// band plays exactly what it played before the percussionist existed.
///
/// **Set zero, and not a set the config names.** One set for now
/// (`plans/tasks/jam-v5/BRIEF.md`): the percussionist plays it under every
/// drum kit, because a percussionist is not a drum kit and the person who
/// picked Brushes did not thereby pick a different cowbell. A later set is
/// another folder and a choice, and this is the line that grows when there
/// is one to make.
pub fn reference_perc() -> Option<Arc<KitBank>> {
    static SET: std::sync::OnceLock<Option<Arc<KitBank>>> = std::sync::OnceLock::new();
    SET.get_or_init(|| {
        if crate::kit::perc_count() == 0 {
            return None;
        }
        match crate::kit::load_perc(0, JAM_REFERENCE_SR) {
            Ok(bank) => Some(Arc::new(bank)),
            Err(e) => {
                // A SENTENCE AND A SILENT ROW, not a jam that will not load.
                // The percussionist is a layer on top of a band that works
                // without one, so a set that does not decode takes the
                // shaker away and leaves the drummer playing.
                eprintln!("[perc] the shipped percussion set did not decode: {e}");
                None
            }
        }
    })
    .clone()
}

/// [`compile`], with the drums already decoded.
///
/// The decoding is the caller's because only the caller knows the output
/// rate and holds the cache — see `set_jam` in `commands.rs`. A voice the
/// kit does not hold falls back through [`crate::kit::fallback_for`], lane
/// by lane, in [`slot_for`].
pub fn compile_with_kit(cfg: &JamConfig, bank: Arc<KitBank>) -> Result<JamTable, String> {
    let voices = reference_voices(cfg)?;
    compile_measured(cfg, None, bank, reference_perc(), voices)
}

/// [`compile`], with the melodic banks handed in rather than resolved.
///
/// What the tests and the probe use to play a bank that is not shipped: a
/// folder somebody rendered, before it lives under `sounds/voices`. The app
/// goes through [`compile_with`], which holds a `VoiceCache` and the rate
/// the device actually opened at.
pub fn compile_with_voices(
    cfg: &JamConfig,
    bank: Arc<KitBank>,
    voices: JamVoices,
) -> Result<JamTable, String> {
    compile_measured(cfg, None, bank, reference_perc(), voices)
}

/// [`compile_with_kit`], with the PERCUSSION handed in rather than resolved.
///
/// What the tests use, and the reason they can say anything at all about the
/// percussionist: the shipped set is a folder that may not be in a
/// checkout, so a test that needed it would be a test that passes on one
/// machine. Every percussion test builds its own set with
/// `KitBank::for_tests(&KitVoice::PERC, ..)` and hands it in here, and the
/// one test that IS about the shipped folder says so and skips when there
/// is none.
#[cfg(test)]
pub(crate) fn compile_with_perc(
    cfg: &JamConfig,
    bank: Arc<KitBank>,
    perc: Option<Arc<KitBank>>,
) -> Result<JamTable, String> {
    let voices = reference_voices(cfg)?;
    compile_measured(cfg, None, bank, perc, voices)
}

/// The recorded banks a config's voices resolve to, at [`JAM_REFERENCE_SR`].
///
/// For everything with no audio device to ask — the tests, the four-bar
/// measurements, the probe before its stream opens — and built through a
/// process-wide cache for the reason [`reference_bank`] is: a bank's decode
/// is part of a table's signature, so two decodes of the same folder would
/// be two bass players as far as the bar-line handshake is concerned.
///
/// Empty until the banks ship, which is what makes every jam saved before
/// them play exactly as it did.
fn reference_voices(cfg: &JamConfig) -> Result<JamVoices, String> {
    static CACHE: std::sync::OnceLock<crate::voices::VoiceCache> = std::sync::OnceLock::new();
    let cache = CACHE.get_or_init(Default::default);
    resolve_voices(cfg, cache, JAM_REFERENCE_SR)
}

/// Which recorded banks this config's bass and keys voices play out of.
///
/// `None` for a voice that is synthesis in real life, and `None` for one
/// whose folder has not shipped — both of which send the line back to the
/// recipe it has always used. A line the jam does not have at all is never
/// asked for, so a jam with no keys pays for no keys bank.
pub fn resolve_voices(
    cfg: &JamConfig,
    cache: &crate::voices::VoiceCache,
    rate: u32,
) -> Result<JamVoices, String> {
    let bass = match cfg.bass {
        Some(_) => {
            let voice = BassVoice::from_name(cfg.bass_voice.as_deref().unwrap_or(""));
            JamVoices::folder_for_bass(voice)
                .and_then(crate::voices::shipped_index)
                .map(|i| cache.shipped(i, rate, BASS_MIN_MIDI, BASS_MAX_MIDI))
                .transpose()?
        }
        None => None,
    };
    let keys = match cfg.keys {
        Some(_) => {
            let voice = KeysVoice::from_name(cfg.keys_voice.as_deref().unwrap_or(""));
            JamVoices::folder_for_keys(voice)
                .and_then(crate::voices::shipped_index)
                .map(|i| cache.shipped(i, rate, KEYS_MIN_MIDI, KEYS_MAX_MIDI))
                .transpose()?
        }
        None => None,
    };
    Ok(JamVoices { bass, keys })
}

/// [`compile`], reusing the normalisation the same drums produced last time.
///
/// This is the entry point `set_jam` uses. See [`JamGainCache`] for what is
/// being reused and why a changed bass line may share it.
pub fn compile_with(
    cfg: &JamConfig,
    cache: &JamGainCache,
    bank: Arc<KitBank>,
    perc: Option<Arc<KitBank>>,
    voices: JamVoices,
) -> Result<JamTable, String> {
    let signature = render_signature(cfg, &bank, perc.as_deref(), &voices);
    let remembered = cache.get(signature);
    let table = compile_measured(cfg, remembered, bank, perc, voices)?;
    if remembered.is_none() {
        cache.put(signature, table.base_peak);
    }
    Ok(table)
}

/// `base_peak`, when the caller already knows it, skips the four-bar render.
/// `None` measures it.
fn compile_measured(
    cfg: &JamConfig,
    base_peak: Option<f32>,
    bank: Arc<KitBank>,
    perc: Option<Arc<KitBank>>,
    voices: JamVoices,
) -> Result<JamTable, String> {
    if !TICKS_PER_BEAT.contains(&cfg.ticks_per_beat) {
        return Err(format!(
            "ticksPerBeat is {}, which is not one of {:?}",
            cfg.ticks_per_beat, TICKS_PER_BEAT
        ));
    }
    if cfg.beats_per_bar < 1 || cfg.beats_per_bar > 16 {
        return Err(format!(
            "beatsPerBar is {}, and a bar is 1 to 16 beats",
            cfg.beats_per_bar
        ));
    }
    if cfg.form_bars < 1 || cfg.form_bars > JAM_MAX_FORM_BARS {
        return Err(format!(
            "formBars is {}, and a chorus is 1 to {} bars",
            cfg.form_bars, JAM_MAX_FORM_BARS
        ));
    }
    let fill_every = cfg.fill_every.unwrap_or(0);
    if !FILL_EVERY.contains(&fill_every) {
        return Err(format!(
            "fillEvery is {fill_every}; a fill lands every 4 or 8 bars, or 0 for \
             the end of the chorus only"
        ));
    }

    let ticks = cfg.ticks_per_beat * cfg.beats_per_bar;
    debug_assert!(ticks as usize <= JAM_MAX_TICKS_PER_BAR);

    // Clamped, not rejected. See INTENSITY_MIN.
    let intensity = if cfg.intensity.is_finite() {
        cfg.intensity.clamp(INTENSITY_MIN, INTENSITY_MAX)
    } else {
        1.0
    };

    // Which drums. Resolved here, once, so the audio thread never sees a
    // string and never asks which kit a lane belongs to.
    let kit = JamKit::from_name(&cfg.kit);
    // Which drum silences which, worked out once here from the kit's own
    // manifest: voice V chokes W exactly when W said it was `choked_by` V.
    // Inverted here rather than asked on the audio thread, because the
    // callback's question is "what does this hit silence?" and the manifest
    // answers the other one.
    let chokes = choke_map(&bank);
    // Does this groove mean the cross-stick where it writes a ghost on the
    // snare? A bossa does; a funk groove does not.
    let ghost_is_rim = cfg.snare_ghost_is_rim.unwrap_or(false);

    // And which instruments. Resolved here for the same reason: the audio
    // thread receives a `SoundId` that already names the voice, and never
    // learns that a voice has a name.
    let bass_voice = BassVoice::from_name(cfg.bass_voice.as_deref().unwrap_or(""));
    let keys_voice = KeysVoice::from_name(cfg.keys_voice.as_deref().unwrap_or(""));

    // The balance between the lanes, resolved into the slots below. The
    // audio thread never sees a mix: it is three multiplications here, on
    // the command thread, once per jam.
    let mix = cfg.mix.unwrap_or_default().clamped();

    // Compiled at intensity 1.0 and scaled once at the end, so the
    // normalisation below can see the groove's own shape rather than the
    // shape times whatever the musician set the dial to.
    // IS THERE A PERCUSSIONIST? Asked once, here, and the answer is a bank
    // or nothing — so every percussion lane below either resolves against a
    // set or makes no slot at all, and the audio thread never learns that a
    // band could have had one.
    //
    // `perc: Some(false)` is the musician switching the player off and is
    // the only thing it does: the rows make no slots, and the drums, the
    // bass, the keys, the fill, the crash, the count-in and the
    // normalisation are all exactly what they would have been. A band
    // member leaving is not a remix.
    let perc = match cfg.perc {
        Some(false) => None,
        _ => perc,
    };
    let voicing = Voicing {
        bank: &bank,
        perc: perc.as_deref(),
        chokes,
        ghost_is_rim,
        mix: mix.drums,
        mix_perc: mix.perc,
    };
    let mut bar = compile_pattern(&cfg.bar, ticks, &voicing, "bar")?;
    let mut fill = match cfg.fill {
        Some(ref f) => Some(compile_pattern(f, ticks, &voicing, "fill")?),
        None => None,
    };

    // The bass goes into the same ticks the drums are in — one list for the
    // audio thread to walk — and into the fill as well as the groove: a bass
    // player keeps walking while the drummer plays a fill.
    if let Some(ref line) = cfg.bass {
        let slots = compile_bass(line, ticks, bass_voice, mix.bass, voices.bass.as_deref())?;
        for (i, slot) in slots.iter().enumerate() {
            if let Some(s) = *slot {
                bar[i].push(s);
                if let Some(ref mut f) = fill {
                    f[i].push(s);
                }
            }
        }
    }

    // And the keys, into the same ticks and the same fill, for the same
    // reason: a comping player keeps playing the changes while the drummer
    // fills. One slot per note of the voicing.
    if let Some(ref line) = cfg.keys {
        let slots = compile_keys(line, ticks, keys_voice, mix.keys, voices.keys.as_deref())?;
        for (i, voicing) in slots.iter().enumerate() {
            for s in voicing.iter() {
                bar[i].push(*s);
                if let Some(ref mut f) = fill {
                    f[i].push(*s);
                }
            }
        }
    }

    // The crash on the one. LEVEL 4 — the peak — because arriving at the top
    // of the form is the loudest thing the band does, and with layers that
    // means the hardest stroke the kit was recorded with rather than the
    // same cymbal turned up. The groove's own crash lane keeps whatever
    // level it was written with.
    let mut crash = if cfg.crash_on_one {
        let already = bar
            .first()
            .map(|t| t.slots().iter().any(|s| s.lane == JamLane::Crash))
            .unwrap_or(false);
        if already {
            None
        } else {
            slot_for(JamLane::Crash, 4, &voicing)
        }
    } else {
        None
    };

    // ---- The loudest sample the band renders, measured rather than
    // guessed ----
    //
    // Summing each sound's *peak* would be an upper bound and a bad one:
    // these transients do not land on the same sample (the kick's peak is
    // milliseconds in, the hat's is immediate), so a peak-sum says a full
    // band tick is three times full scale when the rendered sum is nowhere
    // near that. A table scaled by that bound would be inaudible. So the
    // band is actually rendered, once, here — off the audio thread, only
    // when the jam changes.
    //
    // Unless the caller already knows the answer: the same drums under a
    // different bass bar render the same peak, and the UI sends one of those
    // several times a chorus. See [`JamGainCache`].
    let base_peak = base_peak.unwrap_or_else(|| {
        worst_bar_peak(
            &bar,
            fill.as_deref(),
            crash,
            cfg.form_bars,
            cfg.ticks_per_beat,
            &bank,
            perc.as_deref(),
            &voices,
        )
    });

    // THE SAFETY CLAMP, AND NOTHING MORE. See [`JAM_SAFETY_CLAMP`]: the bus
    // holds the band down when it is loud, so a groove that renders under
    // two and a half times full scale keeps its own level exactly — which
    // is most grooves, and is where the 9 to 13 dB came back from. Only a
    // table over the clamp is scaled, and only down to it.
    let norm = if base_peak > JAM_SAFETY_CLAMP {
        JAM_SAFETY_CLAMP / base_peak
    } else {
        1.0
    };
    let total = norm * intensity;
    if total != 1.0 {
        scale(&mut bar, total);
        if let Some(ref mut f) = fill {
            scale(f, total);
        }
        if let Some(ref mut c) = crash {
            c.gain *= total;
        }
    }
    // What the busiest tick would have peaked at with no normalisation, and
    // what it peaks at now.
    let peak_before = base_peak * intensity;
    let peak_after = base_peak * total;

    // ---- The pickup, and what it costs the fill row ----
    //
    // Cut AFTER the scaling above, because a pickup is the band: it leads
    // straight into bar one and has to arrive at the level bar one is played
    // at. (The count-in's own sticks, a few lines down, are the opposite case
    // and say so.)
    //
    // And the fill row goes with it. A table asks for a pickup only under an
    // arrangement, and an arrangement writes its fills into `bar` per bar —
    // so leaving the engine's own "fill on the last bar of the chorus" rule
    // pointed at this row would play a second fill over the first. The row
    // travels for the pickup; the pickup is what it is spent on.
    let pickup = if cfg.pickup.unwrap_or(false) {
        fill.as_deref()
            .map(|f| pickup_beat(f, cfg.ticks_per_beat))
    } else {
        None
    };
    let fill = if pickup.is_some() { None } else { fill };

    // One state per bar of the chorus, decided now rather than on the audio
    // thread. Phase-locked, so this is the same list every chorus.
    let band_states: Vec<JamBandState> = (0..cfg.form_bars)
        .map(|b| band_state_for_bar(b, cfg.form_bars, cfg.practice.as_ref()))
        .collect();

    // What the count-in plays over this band. Worked out here so the audio
    // thread never decides it — not when the count-in is armed, and
    // certainly not per tick.
    //
    // Deliberately outside everything above it: the sticks are not scaled by
    // the intensity dial, the per-table normalisation or the mix. A count-in
    // happens before the band and alone, so none of the arithmetic that
    // keeps four voices out of each other's way applies to it — and a
    // count-in nobody can hear because the drums were mixed down is a bug,
    // not a balance.
    let count_in_slot = match cfg.count_in_sound.unwrap_or_default() {
        JamCountInSound::Beep => None,
        // THE METRONOME'S OWN CROSS-STICK, NOT THE LOADED KIT'S.
        //
        // It was `voice_slot(KitVoice::Rim, ...)` — whichever rim the jam's
        // kit happened to ship — and since 2026-09-14 it is `sticks_low`,
        // the beat half of the Sticks click preset, straight out of the
        // `SoundBank`. Two things follow and both were the point.
        //
        // Being counted in and practising to Sticks are now the SAME SOUND.
        // A musician who counts off with sticks and then hears the Sticks
        // preset is hearing one instrument, where before the count-off was
        // whatever rim the kit had and the preset did not exist.
        //
        // And it no longer depends on the kit. A count-in is played before
        // the band, alone, outside the intensity dial, the mix and the
        // safety clamp — it was already the one slot in the table that the
        // band's arithmetic does not touch, and now it does not come from
        // the band's folder either. So there is nothing for a kit without a
        // rim to fall back through, and nothing for `voice_slot`'s mix to
        // be put back after.
        JamCountInSound::Sticks => Some(JamSlot {
            sound: SoundId::SticksLow,
            gain: crate::engine::BEAT_GAIN,
            cap_ticks: 0.0,
            lane: JamLane::Snare,
            accent: false,
            // Centred, and read by nothing: the audio thread spawns this one
            // through `Voice::click`, which is mono by construction.
            pan_l: 1.0,
            pan_r: 1.0,
            rr: 1,
            voice: NOT_A_DRUM,
            choked_by: 0,
            chokes: 0,
            release: 0,
        }),
    };

    let has_hat = bar
        .iter()
        .any(|t| t.slots().iter().any(|s| s.lane == JamLane::Hat));
    // Taken here rather than in the struct literal below, which moves
    // `custom` and would end the borrow `custom_ref` is holding.
    let drums_signature = drums_signature(cfg, &bank, perc.as_deref(), &voices);
    let bus_drive = bank.drive;
    Ok(JamTable {
        ticks_per_bar: ticks,
        form_bars: cfg.form_bars,
        bar,
        fill,
        fill_every,
        pickup,
        crash_on_one: crash,
        band_states,
        count_in_slot,
        kit,
        bus_drive,
        bus_shape: 1.0 / bus_drive.tanh(),
        bank,
        perc,
        voices,
        has_hat,
        drums_signature,
        apply_at_bar_line: cfg.apply_at.unwrap_or_default() == ApplyAt::BarLine,
        ends_form: cfg.ends_form.unwrap_or(false),
        peak_before,
        peak_after,
        base_peak,
    })
}

/// A hash of every field of the config except the bass line and the keys.
///
/// The UI posts the NEXT bar's bass and voicings on the downbeat of the
/// current one (`useJamSession.ts`, "the half of the handshake the engine
/// has to match"), so most configs the engine receives while playing differ
/// from the one it holds only in `bass` and `keys`. Those must wait for the
/// bar line, or every bar plays the next bar's changes. A config that
/// changes anything else — the groove, the kit, the intensity, the form, the
/// practice windows, the mix — is the musician turning a dial, and that
/// applies at once.
fn drums_signature(
    cfg: &JamConfig,
    bank: &KitBank,
    perc: Option<&KitBank>,
    voices: &JamVoices,
) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::Hasher;
    let mut h = DefaultHasher::new();
    hash_drums(cfg, bank, perc, voices, &mut h);
    h.finish()
}

/// Everything that decides what four bars of this band RENDER — the drums,
/// the bass and the keys — and nothing that does not.
///
/// The key [`JamGainCache`] remembers a measurement under. It is deliberately
/// a different question from [`drums_signature`]: that one asks "is this the
/// same drummer, so the swap can wait for the bar line?", this one asks "is
/// this the same sound, so the measurement still holds?". The bass and the
/// keys answer the second and not the first, which is the whole point of
/// having two.
fn render_signature(
    cfg: &JamConfig,
    bank: &KitBank,
    perc: Option<&KitBank>,
    voices: &JamVoices,
) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    hash_drums(cfg, bank, perc, voices, &mut h);
    match cfg.bass {
        Some(ref b) => {
            true.hash(&mut h);
            b.pitches.hash(&mut h);
            for v in b.velocities.iter().chain(b.lengths.iter()) {
                v.to_bits().hash(&mut h);
            }
            // The clamped value, because that is the one the render uses:
            // two stores holding 2.0 and 3.0 are the same bass at 1.5.
            let gain = if b.gain.is_finite() {
                b.gain.clamp(BASS_GAIN_MIN, BASS_GAIN_MAX)
            } else {
                1.0
            };
            gain.to_bits().hash(&mut h);
        }
        None => false.hash(&mut h),
    }
    match cfg.keys {
        Some(ref k) => {
            true.hash(&mut h);
            k.voicings.hash(&mut h);
            for v in k.velocities.iter().chain(k.lengths.iter()) {
                v.to_bits().hash(&mut h);
            }
            let gain = if k.gain.is_finite() {
                k.gain.clamp(KEYS_GAIN_MIN, KEYS_GAIN_MAX)
            } else {
                1.0
            };
            gain.to_bits().hash(&mut h);
        }
        None => false.hash(&mut h),
    }
    h.finish()
}

/// The half both signatures share.
///
/// `intensity` is in here because [`swap_defers`] needs it: turning the band
/// up is a change you have to hear now, not at the next bar line. The memo
/// would not have needed it — the table is compiled and rendered at 1.0 and
/// scaled afterwards, so intensity cannot move the measurement — and it
/// costs one render per intensity. The UI offers three, so the memo holds
/// three entries for the same groove instead of one. That is cheaper than a
/// third signature to explain.
fn hash_drums(
    cfg: &JamConfig,
    bank: &KitBank,
    perc: Option<&KitBank>,
    voices: &JamVoices,
    h: &mut impl std::hash::Hasher,
) {
    use std::hash::Hash;
    cfg.ticks_per_beat.hash(h);
    cfg.beats_per_bar.hash(h);
    for p in std::iter::once(&cfg.bar).chain(cfg.fill.iter()) {
        p.kick.hash(h);
        p.snare.hash(h);
        p.hat.hash(h);
        p.hat_open.hash(h);
        p.ride.hash(h);
        p.crash.hash(h);
        p.tom_hi.hash(h);
        p.tom_lo.hash(h);
        // And the percussionist's ten. They are rows of the same bar, so
        // they belong in the same walk for both of the reasons the toms do:
        // a groove that changed its shaker is a different drummer as far as
        // the bar-line handshake is concerned, and it renders a different
        // four bars as far as the memo is.
        p.shaker.hash(h);
        p.tambourine.hash(h);
        p.cowbell.hash(h);
        p.cabasa.hash(h);
        p.claves.hash(h);
        p.guiro.hash(h);
        p.conga_hi.hash(h);
        p.conga_lo.hash(h);
        p.bongo_hi.hash(h);
        p.bongo_lo.hash(h);
    }
    cfg.fill.is_some().hash(h);
    // Which bars the fill lands on is the drummer's business, not the bass
    // player's: turning it on has to be heard now, and it changes which bar
    // of the table the loudest tick lives in.
    cfg.fill_every.unwrap_or(0).hash(h);
    // Whether the fill row is a bar-line fill or a pickup is the drummer's
    // business too, and it decides which bars the table has: with a pickup
    // the last bar of the chorus plays the groove, without one it plays the
    // fill. Two tables that disagree about that are two drummers.
    cfg.pickup.unwrap_or(false).hash(h);
    cfg.form_bars.hash(h);
    cfg.crash_on_one.hash(h);
    cfg.intensity.to_bits().hash(h);
    JamKit::from_name(&cfg.kit).0.hash(h);
    // Which stroke the snare lane's ghosts are is the drummer's business
    // and changes what the band plays, so it is a swap you hear now.
    cfg.snare_ghost_is_rim.unwrap_or(false).hash(h);
    // Which drums, which bass and which keys are all the musician turning a
    // dial: swapping the bass from fingered to slap has to be heard on the
    // next tick, not at the next bar line, and it changes what four bars of
    // this band render so the memo must not share a measurement across it.
    //
    // The kit is hashed by its DECODE (`KitBank::id`) rather than by its
    // name or its folder path. Replace `snare.wav` while the app is open and
    // the path has not changed but the band has; keying on the path would
    // keep handing back the old snare's peak until the app restarted. It
    // also covers the device changing rate under a kit, which is a different
    // decode of the same drums.
    (cfg.bass_voice.as_deref().map(BassVoice::from_name).map(|v| v.name())).hash(h);
    (cfg.keys_voice.as_deref().map(KeysVoice::from_name).map(|v| v.name())).hash(h);
    bank.id.hash(h);
    // AND WHICH PERCUSSION, by its decode and by whether there is one at
    // all — the two things that can differ. Both of the kit's reasons apply
    // unchanged: switching the percussionist off is the musician turning a
    // dial and has to be heard on the next tick rather than at the next bar
    // line, and it changes what four bars of this band render, so the memo
    // must not hand back a measurement taken with a shaker in it.
    perc.map(|b| b.id).hash(h);
    cfg.perc.hash(h);
    // And WHICH RECORDED BANKS, by their decode, for both of the reasons
    // the kit is hashed by its. A bank arriving where there was a recipe
    // changes what the band sounds like, so the memo must not share a
    // measurement across it — and it is the musician choosing an instrument,
    // so it is a change you hear now rather than at the next bar line.
    voices.bass.as_ref().map(|b| b.id).hash(h);
    voices.keys.as_ref().map(|b| b.id).hash(h);
    // The mix is a dial, not a bar of music: turning the keys down is a
    // change you have to hear now, not at the next bar line. Hashed
    // clamped, because that is the value the compiler uses.
    let mix = cfg.mix.unwrap_or_default().clamped();
    (
        mix.drums.to_bits(),
        mix.bass.to_bits(),
        mix.keys.to_bits(),
        mix.perc.to_bits(),
    )
        .hash(h);
    // Which sound the count-in makes is not part of the band, but it IS part
    // of the table, and a table that differs only in it must not be
    // mistaken for the same one and held back to a bar line.
    (cfg.count_in_sound.unwrap_or_default() == JamCountInSound::Sticks).hash(h);
    match cfg.practice {
        Some(ref p) => {
            true.hash(h);
            match p.drop_out {
                Some(d) => (true, d.every_bars, d.bars).hash(h),
                None => false.hash(h),
            }
            match p.trade {
                Some(t) => (true, t.band_bars, t.you_bars).hash(h),
                None => false.hash(h),
            }
        }
        None => false.hash(h),
    }
}

/// Should the audio thread hold `incoming` until the next bar line instead
/// of playing it now?
///
/// Two reasons a table waits, and they are asked in this order.
///
/// **The table said so.** `applyAt: "barLine"` holds the WHOLE table, drums
/// included — see [`JamConfig::apply_at`]. An arrangement is written a bar
/// ahead, and a breakdown chorus that arrived at once would put the next
/// bar's drummer in this bar.
///
/// **Only the changes moved.** The old rule, and it still stands for
/// everything the sender does not mark: the new table is the same drummer
/// (same signature, same bar length) and just the bass line or the keys
/// voicings differ, which is what the bar-ahead handshake posts. A table
/// with a different groove, kit, intensity, mix or count-in sound is the
/// musician turning a dial and applies at once.
///
/// A table arriving while stopped, during the count-in, or while no table
/// is loaded applies immediately whatever it says: there is no bar line to
/// wait for that matters, and a band held back from a bar that never comes
/// is a band that never arrives.
pub fn swap_defers(
    active: Option<&JamTable>,
    incoming: Option<&JamTable>,
    playing: bool,
    warming_up: bool,
) -> bool {
    if !playing || warming_up {
        return false;
    }
    match (active, incoming) {
        (Some(a), Some(n)) => {
            n.apply_at_bar_line
                || (a.drums_signature == n.drums_signature && a.ticks_per_bar == n.ticks_per_bar)
        }
        _ => false,
    }
}

/// The bass line as one optional slot per tick.
///
/// The cap is the whole rule: a note rings until the next note or the end of
/// the bar, whichever comes first. Without it a walking line at any tempo
/// slower than the note's own 450 ms turns into a chord — four roots and a
/// fifth all sounding at once — which is the difference between a bass
/// player and a drone.
fn compile_bass(
    line: &JamBassLine,
    ticks: u32,
    voice: BassVoice,
    mix: f32,
    bank: Option<&MelodicBank>,
) -> Result<Vec<Option<JamSlot>>, String> {
    if line.pitches.len() != ticks as usize {
        return Err(format!(
            "bass.pitches has {} entries, and this bar is {ticks} ticks long",
            line.pitches.len()
        ));
    }
    check_articulation("bass", &line.velocities, &line.lengths, ticks)?;
    for (i, &p) in line.pitches.iter().enumerate() {
        if p != 0 && !(BASS_MIN_MIDI..=BASS_MAX_MIDI).contains(&p) {
            return Err(format!(
                "bass.pitches tick {i} is MIDI {p}; the bass runs {BASS_MIN_MIDI} to \
                 {BASS_MAX_MIDI} (E1 to G3), and 0 is a rest"
            ));
        }
    }
    // Clamped, not rejected. See INTENSITY_MIN.
    let level = if line.gain.is_finite() {
        line.gain.clamp(BASS_GAIN_MIN, BASS_GAIN_MAX)
    } else {
        1.0
    };
    let gain = level * mix
        // What makes five voices five instruments and not five volumes.
        // A RECORDED bank carries its own balance in its manifest's
        // `trim_db`, which was applied when the bank was built; this trim
        // is what holds the SYNTHESISED recipes together, and it stays on
        // top of a recording so that a bank measured against the fingered
        // recipe lands where the fingered recipe landed.
        * BASS_VOICE_TRIM[voice as usize];
    let n = ticks as usize;
    let mut out: Vec<Option<JamSlot>> = vec![None; n];
    for i in 0..n {
        if line.pitches[i] == 0 {
            continue;
        }
        let next = (i + 1..n).find(|&j| line.pitches[j] != 0).unwrap_or(n);
        // How hard THIS note is played: its level, and the recorded layer
        // that level reaches. See `voice_layer`.
        let velocity = note_velocity(&line.velocities, i);
        let layer = bank.map_or(0, |b| voice_layer(level * velocity, b.layers()));
        // A recorded bank if one ships for this voice, and the recipe if
        // not. The note is an index into whichever answered, worked out
        // here so the audio thread never subtracts a MIDI number.
        let (sound, rr, release) = match bank {
            Some(b) => (
                SoundId::Voice {
                    line: VoiceLine::Bass,
                    note: line.pitches[i].saturating_sub(b.low()),
                    layer,
                    robin: 0,
                },
                b.rr(),
                b.release_frames,
            ),
            None => (
                SoundId::Bass(voice, line.pitches[i] - BASS_MIN_MIDI),
                1,
                0,
            ),
        };
        out[i] = Some(JamSlot {
            sound,
            gain: gain * velocity,
            cap_ticks: note_cap(&line.lengths, i, next - i),
            lane: JamLane::Bass,
            // A bass note is never an accent: the dots mark the drummer's
            // backbeat, and a walking line would have every one of them lit.
            accent: false,
            // Down the middle, and nothing chokes it: a bass player stands
            // where the bass player stands, and nobody silences them.
            pan_l: 1.0,
            pan_r: 1.0,
            rr,
            voice: NOT_A_DRUM,
            choked_by: 0,
            chokes: 0,
            release,
        });
    }
    Ok(out)
}

/// The keys line as up to four slots per tick.
///
/// The cap is the bass's rule applied to a chord: a voicing rings until the
/// next voicing or the end of the bar, whichever comes first. Without it the
/// bar's changes pile on top of each other and a ii–V–I comes out as one
/// eleven-note cluster — the difference between a comping player and a
/// sustain pedal nobody let go of.
///
/// Every note of a voicing gets the same cap and the same gain, so the chord
/// speaks and stops as one thing rather than as four notes that happen to
/// have started together.
fn compile_keys(
    line: &JamKeysLine,
    ticks: u32,
    voice: KeysVoice,
    mix: f32,
    bank: Option<&MelodicBank>,
) -> Result<Vec<Vec<JamSlot>>, String> {
    if line.voicings.len() != ticks as usize {
        return Err(format!(
            "keys.voicings has {} entries, and this bar is {ticks} ticks long",
            line.voicings.len()
        ));
    }
    for (i, v) in line.voicings.iter().enumerate() {
        if v.len() > JAM_MAX_VOICING {
            return Err(format!(
                "keys.voicings tick {i} has {} notes; a voicing is at most \
                 {JAM_MAX_VOICING}",
                v.len()
            ));
        }
        for &n in v.iter() {
            if !(KEYS_MIN_MIDI..=KEYS_MAX_MIDI).contains(&n) {
                return Err(format!(
                    "keys.voicings tick {i} has MIDI {n}; the keys run \
                     {KEYS_MIN_MIDI} to {KEYS_MAX_MIDI} (C3 to C6), and an empty \
                     voicing is the rest"
                ));
            }
        }
    }
    // Clamped, not rejected. See INTENSITY_MIN.
    let level = if line.gain.is_finite() {
        line.gain.clamp(KEYS_GAIN_MIN, KEYS_GAIN_MAX)
    } else {
        1.0
    };
    let gain = level * mix * KEYS_TRIM * KEYS_VOICE_TRIM[voice as usize];
    check_articulation("keys", &line.velocities, &line.lengths, ticks)?;

    let n = ticks as usize;
    let mut out: Vec<Vec<JamSlot>> = vec![Vec::new(); n];
    for i in 0..n {
        if line.voicings[i].is_empty() {
            continue;
        }
        let next = (i + 1..n)
            .find(|&j| !line.voicings[j].is_empty())
            .unwrap_or(n);
        let velocity = note_velocity(&line.velocities, i);
        let layer = bank.map_or(0, |b| voice_layer(level * velocity, b.layers()));
        let cap = note_cap(&line.lengths, i, next - i);
        out[i] = line.voicings[i]
            .iter()
            .map(|&note| {
                let (sound, rr, release) = match bank {
                    Some(b) => (
                        SoundId::Voice {
                            line: VoiceLine::Keys,
                            note: note.saturating_sub(b.low()),
                            layer,
                            robin: 0,
                        },
                        b.rr(),
                        b.release_frames,
                    ),
                    None => (SoundId::Keys(voice, note - KEYS_MIN_MIDI), 1, 0),
                };
                JamSlot {
                    sound,
                    gain: gain * velocity,
                    cap_ticks: cap,
                    lane: JamLane::Keys,
                    // A chord is never an accent. The dots mark the
                    // drummer's backbeat, and comping on every tick would
                    // light all of them.
                    accent: false,
                    pan_l: 1.0,
                    pan_r: 1.0,
                    rr,
                    voice: NOT_A_DRUM,
                    choked_by: 0,
                    chokes: 0,
                    release,
                }
            })
            .collect();
    }
    Ok(out)
}

/// Everything the lane-to-sound question needs, gathered once per compile.
///
/// A struct rather than six arguments because every one of them is the same
/// for the whole table, and passing them down one at a time is how the
/// groove and the fill end up resolved against different kits.
pub(crate) struct Voicing<'a> {
    pub(crate) bank: &'a KitBank,
    /// The percussion set, when one ships and the band has not switched it
    /// off.
    ///
    /// `None` is every percussion lane silent, and it is `None` for three
    /// different reasons that all mean the same thing on the audio thread: a
    /// checkout with no `sounds/perc` folder, a jam whose band flag says no
    /// percussionist, and a groove that writes none of the rows (which never
    /// gets this far — it has no slots to make). One `Option`, checked on
    /// the command thread, and no percussion branch anywhere the callback
    /// can see.
    pub(crate) perc: Option<&'a KitBank>,
    /// Which voices each voice's hit chokes. Indexed by [`KitVoice`].
    pub(crate) chokes: [u32; KIT_VOICES],
    /// Does this groove's snare ghost mean the cross-stick?
    pub(crate) ghost_is_rim: bool,
    /// The drums' share of the mix, folded into every slot here so the audio
    /// thread never sees one.
    pub(crate) mix: f32,
    /// And the percussion's, folded into the percussion slots the same way.
    /// Its own dial because it is its own row in the band — the musician
    /// pulling the shaker down is not pulling the drummer down.
    pub(crate) mix_perc: f32,
}

impl<'a> Voicing<'a> {
    /// Which bank a voice's samples come out of, and the mix its row
    /// carries.
    ///
    /// THE ONE PLACE THE TWO FAMILIES PART, and it happens here on the
    /// command thread rather than on the audio thread: what a slot ends up
    /// holding is a voice index, and `jam_sample` picks the bank off the
    /// index alone.
    #[inline]
    fn family(&self, voice: KitVoice) -> Option<(&'a KitBank, f32)> {
        if voice.is_perc() {
            Some((self.perc?, self.mix_perc))
        } else {
            Some((self.bank, self.mix))
        }
    }
}

/// Invert the manifest's `choked_by` into "what does this hit silence?".
///
/// The manifest says what closes a drum, because that is how a drummer
/// describes it: the open hat is closed by the stick and the foot. The
/// audio thread asks the other question, on the tick, about the drum it is
/// about to spawn — so the inversion happens here, once, on the command
/// thread.
pub(crate) fn choke_map(bank: &KitBank) -> [u32; KIT_VOICES] {
    let mut out = [0u32; KIT_VOICES];
    for victim in KitVoice::ALL {
        let by = bank.choked_by(victim);
        for killer in KitVoice::ALL {
            if by & killer.bit() != 0 {
                out[killer as usize] |= victim.bit();
            }
        }
    }
    out
}

/// Which drum, at which layer, actually plays when the kit is asked for
/// `voice` at `layer` — following the contract's fallbacks until the kit has
/// something, and carrying the gain each substitution costs.
///
/// `layer` is 1-based and 0 means "whatever layer the level asked for",
/// which is what a fallback that keeps the dynamics wants (a ride standing
/// in for its own bell is still soft on a soft stroke). A fallback that
/// names a layer pins it: a cross-stick played on the snare is the softest
/// snare there is, whatever the groove wrote.
///
/// Returns `None` only when the chain runs out — a kit with no kick has no
/// kick, and inventing one out of a tom would be the app playing something
/// nobody recorded.
fn resolve_voice(bank: &KitBank, voice: KitVoice, layer: u8) -> Option<(KitVoice, u8, f32)> {
    let mut voice = voice;
    let mut layer = layer;
    let mut gain = 1.0f32;
    // Eleven voices, and the chain is data — so the walk is bounded by the
    // number of voices rather than trusted to terminate.
    for _ in 0..KIT_VOICES {
        if let Some(v) = bank.voice(voice) {
            // 1-based to an index, clamped to what this voice actually has.
            let index = layer.clamp(1, v.layers()) - 1;
            return Some((voice, index, gain));
        }
        let (next, pinned, cost) = fallback_for(voice)?;
        voice = next;
        if pinned > 0 {
            layer = pinned;
        }
        gain *= cost;
    }
    None
}

/// One drum of the kit as a slot, with the pan, the choke and the round
/// robin count already resolved.
///
/// `layer` is 1-based, or 0 for "the layer this level asks for".
pub(crate) fn voice_slot(
    v: &Voicing,
    voice: KitVoice,
    layer: u8,
    lane: JamLane,
    gain: f32,
    cap_ticks: f32,
    accent: bool,
) -> Option<JamSlot> {
    // WHICH BANK, and which of the band's dials this row is under. A
    // percussion voice comes out of the set and carries `mix.perc`; a drum
    // comes out of the kit and carries `mix.drums`. `None` is no set at all
    // — no folder shipped, or the band switched the percussionist off — and
    // a lane with no bank behind it makes no slot, which is silence.
    let (from, mix) = v.family(voice)?;
    let (voice, index, cost) = resolve_voice(from, voice, layer)?;
    let bank = from.voice(voice)?;
    let (pan_l, pan_r) = from.pan(voice);
    Some(JamSlot {
        sound: SoundId::Band {
            voice: voice as u8,
            layer: index,
            robin: 0,
        },
        gain: gain * cost * mix,
        cap_ticks,
        lane,
        accent,
        pan_l,
        pan_r,
        rr: bank.rr(),
        voice: voice as u8,
        choked_by: from.choked_by(voice),
        chokes: v.chokes[voice as usize],
        // A drum ends where its sample ends or where its cap lands, and
        // both of those are already decisions somebody made about a
        // recording of a drum. The release is the melodic lines'.
        release: 0,
    })
}

/// The rows of the pattern, into the ticks the audio thread reads.
fn compile_pattern(
    pattern: &JamPattern,
    ticks: u32,
    v: &Voicing,
    what: &str,
) -> Result<Vec<JamTick>, String> {
    let mut out = vec![JamTick::EMPTY; ticks as usize];
    for (lane, cells) in pattern.lanes() {
        // The optional rows: absent is how every pattern saved before they
        // existed arrives, and it means no open hat and no toms rather than
        // a malformed bar. Sent at all, they are held to the same length as
        // the rest — a half-filled lane is a caller's bug.
        if OPTIONAL_LANES.contains(&lane) && cells.is_empty() {
            continue;
        }
        if cells.len() != ticks as usize {
            return Err(format!(
                "{what}.{} has {} cells, and this bar is {ticks} ticks long",
                lane.name(),
                cells.len(),
            ));
        }
        for (i, &level) in cells.iter().enumerate() {
            if level > MAX_LEVEL {
                return Err(format!(
                    "{what}.{} tick {i} is level {level}; levels are 0 off, \
                     1 hit, 2 accent, 3 ghost, 4 peak",
                    lane.name()
                ));
            }
            if level == 0 {
                continue;
            }
            if let Some(slot) = slot_for(lane, level, v) {
                out[i].push(slot);
            }
        }
    }
    add_hat_pedals(pattern, &mut out, ticks, v);
    Ok(out)
}

/// THE FOOT THAT CLOSES THE HAT.
///
/// An open hat is closed by the next stroke, and the closing makes a sound:
/// the chip of the two cymbals meeting under the stick. The choke is what
/// stops the wash (`choked_by` in the manifest, applied on the audio
/// thread); this is the other half, the noise the foot makes.
///
/// It is added here rather than written into a groove because it is a
/// CONSEQUENCE of the groove: a writer who put an open hat on the "and" did
/// not also decide there is a pedal on the next beat, and asking them to
/// would be asking them to notate a thing drummers do without thinking.
///
/// The bar is walked as a CIRCLE, because a bar of a groove is played round
/// and round: an open hat on the last sixteenth is closed by the hat on the
/// downbeat of the next bar, which is tick 0 of this one.
fn add_hat_pedals(pattern: &JamPattern, out: &mut [JamTick], ticks: u32, v: &Voicing) {
    let n = ticks as usize;
    if n == 0 || pattern.hat_open.len() != n || pattern.hat.len() != n {
        return;
    }
    for i in 0..n {
        if pattern.hat[i] == 0 {
            continue;
        }
        // Walk back for the nearest thing that happened on either hat row.
        // An open hat first means this stroke is the one that closes it; a
        // closed hat first means it was already closed and the foot has
        // nothing to do.
        let mut pedal = false;
        for back in 1..=n {
            let k = (i + n - back) % n;
            if pattern.hat_open[k] != 0 {
                pedal = true;
                break;
            }
            if pattern.hat[k] != 0 {
                break;
            }
        }
        if !pedal {
            continue;
        }
        if let Some(slot) = voice_slot(
            v,
            KitVoice::HatPedal,
            1,
            JamLane::HatPedal,
            HAT_PEDAL_GAIN,
            HAT_CAP_TICKS,
            false,
        ) {
            out[i].push(slot);
        }
    }
}

/// Lane, level and kit to a sound, a gain and a ring-out. Intensity is NOT
/// applied here: the table is compiled at its own level and scaled once, so
/// the measurement can see the groove's shape rather than the shape times
/// whatever the musician set the dial to.
///
/// This is the only place a lane becomes a sound, and it happens in the
/// `set_jam` command. The audio thread receives a `SoundId` and never learns
/// which kit is loaded.
fn slot_for(lane: JamLane, level: u8, v: &Voicing) -> Option<JamSlot> {
    let g = *LEVEL_GAIN.get(level as usize)?;
    if g <= 0.0 {
        return None;
    }
    // Which stroke this level is. Ghost to the softest layer the kit has,
    // peak to the hardest — the difference between a drummer and a fader.
    let layer = LEVEL_LAYER[level as usize];
    let (voice, gain, cap_ticks) = match lane {
        // The kick and the snare are the pulse. They ring out: a kick cut at
        // 0.9 of a sixteenth at 240 BPM is a click, not a drum.
        JamLane::Kick => (KitVoice::Kick, g, 0.0),
        // A ghost is the softest layer of the snare — a DIFFERENT recording,
        // not the backbeat turned down, which is the whole reason a kit has
        // layers (`plans/JAM_SOUND.md` §2.2). In a bossa or a ballad the
        // groove says that stroke is the cross-stick instead, and it is: a
        // stick laid across the head is its own sound and not a quiet snare.
        JamLane::Snare => {
            let voice = if level == 3 && v.ghost_is_rim {
                KitVoice::Rim
            } else {
                KitVoice::Snare
            };
            (voice, g, 0.0)
        }
        JamLane::Hat => (KitVoice::Hat, g, HAT_CAP_TICKS),
        // The wash, not a louder closed hat: its own voice in the kit and
        // its own row in the pattern. Rung long, like the ride, and for the
        // same reason — see `HAT_OPEN_CAP_TICKS`. What stops it now is the
        // next stick or foot, which is the choke.
        JamLane::HatOpen => (KitVoice::HatOpen, g, HAT_OPEN_CAP_TICKS),
        // The top of a ride figure is the bell, when the kit has one. That
        // is what a level 4 on the ride lane means and it is the only place
        // the bell is reachable from — a groove does not get a row for it,
        // because a drummer does not get a second ride.
        JamLane::Ride => {
            let voice = if level == 4 && v.bank.has(KitVoice::RideBell) {
                KitVoice::RideBell
            } else {
                KitVoice::Ride
            };
            (voice, g * RIDE_TRIM, RIDE_CAP_TICKS)
        }
        JamLane::Crash => (KitVoice::Crash, g, 0.0),
        JamLane::TomHi => (KitVoice::TomHi, g, 0.0),
        JamLane::TomLo => (KitVoice::TomLo, g, 0.0),
        JamLane::HatPedal => (KitVoice::HatPedal, HAT_PEDAL_GAIN, HAT_CAP_TICKS),
        // ---- The percussionist ----
        //
        // A row IS an instrument here: there is no second stroke to reach
        // for on a level 4 the way the ride lane reaches for its bell and
        // the snare lane for the cross-stick, because a cowbell is a
        // cowbell. What a level does is what it does everywhere else —
        // `LEVEL_LAYER` picks the stroke's velocity layer, so a ghost is the
        // softest recording the set has (on the conga that is the muted
        // stroke, which is the whole reason `conga_muted` is a layer and not
        // a row) and a peak is the hardest.
        //
        // No engine trim, either, and that is deliberate: the balance
        // between the ten is `trim_db` in the set's own manifest, measured
        // by the render tool against the kits' snare
        // (`plans/tasks/jam-v5/BRIEF.md`). `RIDE_TRIM` exists because a ride
        // is true of every kit; a shaker's level is true of one recording.
        JamLane::Shaker | JamLane::Cabasa | JamLane::Guiro => {
            (lane.perc_voice()?, g, PERC_SHAKEN_CAP_TICKS)
        }
        JamLane::Tambourine
        | JamLane::Cowbell
        | JamLane::Claves
        | JamLane::CongaHi
        | JamLane::CongaLo
        | JamLane::BongoHi
        | JamLane::BongoLo => (lane.perc_voice()?, g, PERC_CAP_TICKS),
        // The bass and the keys have their own arrays in the config and
        // their own compilers.
        JamLane::Bass | JamLane::Keys => return None,
    };
    voice_slot(
        v,
        voice,
        layer,
        lane,
        gain,
        cap_ticks,
        level == 2 || level == 4,
    )
}

fn scale(ticks: &mut [JamTick], factor: f32) {
    for t in ticks.iter_mut() {
        for s in t.slots[..t.len as usize].iter_mut() {
            s.gain *= factor;
        }
    }
}

/// The pickup: the fill's LAST BEAT, hands only.
///
/// Two decisions, and a drummer would recognise both.
///
/// **The last beat**, because that is the part of a fill that is a pickup.
/// The compiler sends the whole fill row — it is the same row the `big` fill
/// is cut from, topped off on its last tick — and the beat that leads into
/// the downbeat is the end of it.
///
/// **Kick, snare and toms and nothing else.** A pickup happens before the
/// tune: the hats have not started, the ride has not started, a crash here
/// would step on the one that answers it a beat later, and the bass player
/// and the keys player are still counting. What is left is what the hands
/// are doing, which is what a fill is made of anyway
/// (`plans/JAM_SOUND.md` §2.9).
///
/// A fill shorter than a beat cannot happen — a bar is at least one beat and
/// a fill is a full bar — but the start index is saturating rather than
/// trusting, because the alternative is arithmetic that underflows into a
/// row the audio thread then reads.
fn pickup_beat(fill: &[JamTick], ticks_per_beat: u32) -> Vec<JamTick> {
    let from = fill.len().saturating_sub(ticks_per_beat.max(1) as usize);
    fill[from..]
        .iter()
        .map(|tick| {
            let mut out = JamTick::EMPTY;
            for slot in tick.slots() {
                if matches!(
                    slot.lane,
                    JamLane::Kick | JamLane::Snare | JamLane::TomHi | JamLane::TomLo
                ) {
                    out.push(*slot);
                }
            }
            out
        })
        .collect()
}

/// Render four bars of the band and return the loudest sample in them.
///
/// THIS USED TO DECIDE THE BAND'S LEVEL. It does not any more: the bus does
/// that, on the audio thread, where it can tell a loud bar from a loud
/// possibility. What this is for now is the safety clamp — see
/// [`JAM_SAFETY_CLAMP`] — so the question it answers is narrower ("is this
/// table absurd?") even though the arithmetic is the same.
///
/// It still measures rather than sums peaks. Summing each sound's peak would
/// be an upper bound and a bad one: these transients do not land on the same
/// sample (the kick's peak is milliseconds in, the hat's is immediate), so a
/// peak-sum says a full band tick is three times full scale when the
/// rendered sum is nowhere near that.
///
/// And it still renders at the FASTEST TICK the engine can produce —
/// [`MAX_BPM`] at this table's own `ticksPerBeat` — because a shorter tick
/// is what stacks voices. What reaches the mixer is the drums that start
/// together plus everything still ringing from the ticks before, and with
/// real kit samples that is most of the level: a three-second crash over a
/// 50 ms tick is sixty ticks of ring-out.
///
/// Four bars, in the order the band plays them around the top of the form:
/// bar 0 with the crash on it, two of the groove, then the bar that plays
/// last in the chorus (the fill, when there is one) and bar 0 again. The
/// crash is measured TWICE on purpose — once cold at the start of playback
/// and once with a bar of ring-out under it — because a tail carries a sign
/// and can subtract as easily as it adds.
///
/// **Round robin 0 and no drift.** The table stores the layer and this walks
/// it; the round robin a hit gets is decided on the tick and the drift is
/// ±2%, which is a fifth of a decibel against a clamp that only fires at two
/// and a half times full scale. Rendering all three round robins to find a
/// peak that differs in the third decimal place would be three times the
/// work for a number nothing reads.
///
/// Allocates freely: this is the `set_jam` command thread, once per jam.
#[allow(clippy::too_many_arguments)]
fn worst_bar_peak(
    bar: &[JamTick],
    fill: Option<&[JamTick]>,
    crash: Option<JamSlot>,
    form_bars: u32,
    ticks_per_beat: u32,
    bank: &KitBank,
    perc: Option<&KitBank>,
    voices: &JamVoices,
) -> f32 {
    let ticks = bar.len();
    if ticks == 0 {
        return 0.0;
    }
    let tick_samples =
        (JAM_REFERENCE_SR as f64 * 60.0 / MAX_BPM as f64 / ticks_per_beat.max(1) as f64) as usize;
    if tick_samples == 0 {
        return 0.0;
    }

    // A one-bar form makes the FILL bar 0 as well as the last bar, so the
    // crash lands on the fill's first tick there and on the groove's
    // everywhere else.
    let last = fill.unwrap_or(bar);
    let zero = if form_bars == 1 { last } else { bar };
    let sequence = [zero, bar, last, zero];
    const CRASH_BARS: [usize; 2] = [0, 3];

    let total = sequence.len() * ticks * tick_samples;
    // Two accumulators, because the band is stereo now and the loudest
    // sample is the loudest sample of either side. Panning can only take
    // level away (see `JamSlot::pan_l`), so this can never come out above
    // what the mono render used to say — but a hard-panned kit measured down
    // the middle would have been measured at the wrong height, which is
    // exactly the error a safety clamp cannot afford.
    let mut acc = vec![[0.0f32; 2]; total];
    for (b, bar_ticks) in sequence.iter().enumerate() {
        for (i, t) in bar_ticks.iter().enumerate() {
            let start = (b * ticks + i) * tick_samples;
            let extra = if CRASH_BARS.contains(&b) && i == 0 {
                crash
            } else {
                None
            };
            for slot in t.slots().iter().chain(extra.iter()) {
                // THE KIT IS NOT AT THIS RENDER'S RATE, and after this pass
                // that is true of every kit rather than only of a folder.
                // A bank is decoded at whatever rate the device opened at,
                // and this render runs at the reference rate. Walked one for
                // one, a 96 kHz kit would render every drum at half speed and
                // twice the length — twice the ring-out to stack, `cap_ticks`
                // cutting it at half the musical duration it names, and a
                // peak that is not the one the device will produce. So the
                // walk is at the kit's own rate's stride.
                //
                // Nearest neighbour, deliberately: this is a measurement of a
                // PEAK over four bars and the resampler's own error is 120 dB
                // below the signal (`kit.rs`), so interpolating here would
                // cost time to move a number nothing reads.
                let (buf, stride) = match slot.sound {
                    // WHICH BANK IS THE VOICE INDEX'S OWN ANSWER, here as on
                    // the audio thread: the percussion is numbered after the
                    // drums, so a slot says which of the two it came out of
                    // without carrying a second field to say so. A table
                    // whose percussion has been switched off has no such
                    // slots to measure.
                    SoundId::Band {
                        voice,
                        layer,
                        robin,
                    } => {
                        let from = if crate::kit::KitVoice::ALL
                            .get(voice as usize)
                            .is_some_and(|v| v.is_perc())
                        {
                            perc
                        } else {
                            Some(bank)
                        };
                        match from {
                            Some(b) => (
                                b.sample(voice, layer, robin),
                                b.rate as f64 / JAM_REFERENCE_SR as f64,
                            ),
                            None => (&[][..], 1.0f64),
                        }
                    }
                    // A RECORDED melodic note, out of the bank this table
                    // carries — and at that bank's own rate's stride, for
                    // the reason a drum is: a bank decoded at whatever rate
                    // the device opened at, walked one for one against a
                    // render at the reference rate, would be the wrong
                    // length and the wrong height. The release fade is NOT
                    // applied here and does not need to be: it only ever
                    // takes level away, and what this measures is a peak.
                    SoundId::Voice {
                        line,
                        note,
                        layer,
                        robin,
                    } => {
                        let held = match line {
                            VoiceLine::Bass => voices.bass.as_deref(),
                            VoiceLine::Keys => voices.keys.as_deref(),
                        };
                        match held {
                            Some(b) => (
                                b.sample(note, layer, robin),
                                b.rate as f64 / JAM_REFERENCE_SR as f64,
                            ),
                            None => (&[][..], 1.0f64),
                        }
                    }
                    // A SYNTHESISED bass or keys note is built at the
                    // reference rate and is mono, which is why it is a
                    // different arm rather than a different stride.
                    other => (jam_reference_sample(other), 1.0f64),
                };
                let stereo = matches!(slot.sound, SoundId::Band { .. });
                let frames = if stereo { buf.len() / 2 } else { buf.len() };
                // How long this drum is IN THIS RENDER'S SAMPLES.
                let ring = if stride == 1.0 {
                    frames
                } else {
                    (frames as f64 / stride) as usize
                };
                // The callback's own arithmetic: `cap_ticks` becomes samples
                // with the tick length, 0.0 means play the sample out.
                let limit = if slot.cap_ticks > 0.0 {
                    ((tick_samples as f32 * slot.cap_ticks) as usize).min(ring)
                } else {
                    ring
                };
                let n = limit.min(total.saturating_sub(start));
                let (gl, gr) = (slot.gain * slot.pan_l, slot.gain * slot.pan_r);
                for k in 0..n {
                    let src = if stride == 1.0 {
                        k
                    } else {
                        (k as f64 * stride) as usize
                    };
                    if stereo {
                        match (buf.get(2 * src), buf.get(2 * src + 1)) {
                            (Some(l), Some(r)) => {
                                acc[start + k][0] += l * gl;
                                acc[start + k][1] += r * gr;
                            }
                            _ => break,
                        }
                    } else {
                        match buf.get(src) {
                            Some(v) => {
                                acc[start + k][0] += v * gl;
                                acc[start + k][1] += v * gr;
                            }
                            None => break,
                        }
                    }
                }
            }
        }
    }
    acc.iter()
        .fold(0.0f32, |m, v| m.max(v[0].abs()).max(v[1].abs()))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    mod deferral {
        use super::super::*;

        fn cfg(bass: Option<Vec<u8>>, kit: &str) -> JamConfig {
            let z = vec![0u8; 8];
            let mut kick = z.clone();
            kick[0] = 2;
            JamConfig {
                ticks_per_beat: 2,
                beats_per_bar: 4,
                bar: JamPattern {
                    hat_open: Vec::new(),
                    kick,
                    snare: z.clone(),
                    hat: vec![1u8; 8],
                    ride: z.clone(),
                    crash: z.clone(),
                    ..Default::default()
                },
                fill: None,
                form_bars: 12,
                crash_on_one: true,
                intensity: 1.0,
                kit: kit.to_string(),
                bass: bass.map(|pitches| JamBassLine { pitches, gain: 1.0, ..Default::default() }),
                practice: None,
                fill_every: None,
                keys: None,
                mix: None,
                count_in_sound: None,
                bass_voice: None,
                keys_voice: None,
                custom_kit: None,
                ..Default::default()
            }
        }

        #[test]
        fn a_bass_only_change_waits_for_the_bar_line() {
            let a = compile(&cfg(Some(vec![33, 0, 0, 0, 40, 0, 0, 0]), "room")).unwrap();
            let n = compile(&cfg(Some(vec![38, 0, 0, 0, 45, 0, 0, 0]), "room")).unwrap();
            assert_eq!(a.drums_signature, n.drums_signature);
            assert!(swap_defers(Some(&a), Some(&n), true, false));
        }

        #[test]
        fn a_kit_change_plays_now() {
            let a = compile(&cfg(Some(vec![33, 0, 0, 0, 40, 0, 0, 0]), "room")).unwrap();
            let n = compile(&cfg(Some(vec![33, 0, 0, 0, 40, 0, 0, 0]), "tight")).unwrap();
            assert_ne!(a.drums_signature, n.drums_signature);
            assert!(!swap_defers(Some(&a), Some(&n), true, false));
        }

        #[test]
        fn nothing_waits_while_stopped_counting_in_or_unloaded() {
            let a = compile(&cfg(Some(vec![33, 0, 0, 0, 40, 0, 0, 0]), "room")).unwrap();
            let n = compile(&cfg(Some(vec![38, 0, 0, 0, 45, 0, 0, 0]), "room")).unwrap();
            assert!(!swap_defers(Some(&a), Some(&n), false, false));
            assert!(!swap_defers(Some(&a), Some(&n), true, true));
            assert!(!swap_defers(None, Some(&n), true, false));
            assert!(!swap_defers(Some(&a), None, true, false));
        }

        /// A DRUM CHANGE PLAYS NOW UNLESS THE TABLE ASKS FOR THE BAR LINE.
        ///
        /// Which is the whole of `applyAt`: the same pair of tables, the
        /// same different kit, deferred or not according to one field.
        #[test]
        fn a_bar_line_table_waits_even_when_the_drums_changed() {
            let a = compile(&cfg(Some(vec![33, 0, 0, 0, 40, 0, 0, 0]), "room")).unwrap();
            let mut later = cfg(Some(vec![33, 0, 0, 0, 40, 0, 0, 0]), "tight");
            later.apply_at = Some(ApplyAt::BarLine);
            let n = compile(&later).unwrap();
            assert_ne!(a.drums_signature, n.drums_signature);
            assert!(swap_defers(Some(&a), Some(&n), true, false));
        }

        /// ...and it is the INCOMING table that decides, not the one
        /// playing. A jam that asked for the bar line once does not hold
        /// every edit after it back.
        #[test]
        fn the_arriving_table_is_the_one_that_asks() {
            let mut first = cfg(Some(vec![33, 0, 0, 0, 40, 0, 0, 0]), "room");
            first.apply_at = Some(ApplyAt::BarLine);
            let a = compile(&first).unwrap();
            let n = compile(&cfg(Some(vec![33, 0, 0, 0, 40, 0, 0, 0]), "tight")).unwrap();
            assert!(!swap_defers(Some(&a), Some(&n), true, false));
        }

        /// `applyAt` says WHEN, never WHAT. Two tables that differ only in
        /// it are the same band, so the four-bar measurement one of them
        /// paid for is the other's too, and a deferred bass send following a
        /// deferred arrangement bar is still the same drummer.
        #[test]
        fn asking_for_the_bar_line_does_not_make_it_a_different_band() {
            let now = compile(&cfg(Some(vec![33, 0, 0, 0, 40, 0, 0, 0]), "room")).unwrap();
            let mut waits = cfg(Some(vec![33, 0, 0, 0, 40, 0, 0, 0]), "room");
            waits.apply_at = Some(ApplyAt::BarLine);
            let waits = compile(&waits).unwrap();
            assert_eq!(now.drums_signature, waits.drums_signature);
            let bank = reference_bank("room").unwrap();
            assert_eq!(
                render_signature(
                    &cfg(Some(vec![33, 0, 0, 0, 40, 0, 0, 0]), "room"),
                    &bank,
                    None,
                    &JamVoices::default()
                ),
                render_signature(
                    &{
                        let mut c = cfg(Some(vec![33, 0, 0, 0, 40, 0, 0, 0]), "room");
                        c.apply_at = Some(ApplyAt::BarLine);
                        c
                    },
                    &bank,
                    None,
                    &JamVoices::default()
                )
            );
        }

        /// The contract's spelling, off the wire. `"barLine"` and nothing
        /// else — a value nobody defined is a config rejected with a
        /// message, because the two values mean opposite things about time.
        #[test]
        fn apply_at_reads_the_contracts_words() {
            let of = |json: &str| -> Result<Option<ApplyAt>, String> {
                serde_json::from_str::<JamConfig>(json)
                    .map(|c| c.apply_at)
                    .map_err(|e| e.to_string())
            };
            let base = r#""ticksPerBeat":2,"beatsPerBar":4,
                "bar":{"kick":[2,0,0,0,0,0,0,0],"snare":[0,0,0,0,0,0,0,0],
                       "hat":[1,1,1,1,1,1,1,1],"ride":[0,0,0,0,0,0,0,0],
                       "crash":[0,0,0,0,0,0,0,0]},
                "formBars":4,"crashOnOne":false,"intensity":1.0"#;
            assert_eq!(of(&format!("{{{base}}}")).unwrap(), None);
            assert_eq!(
                of(&format!("{{{base},\"applyAt\":\"now\"}}")).unwrap(),
                Some(ApplyAt::Now)
            );
            assert_eq!(
                of(&format!("{{{base},\"applyAt\":\"barLine\"}}")).unwrap(),
                Some(ApplyAt::BarLine)
            );
            assert!(of(&format!("{{{base},\"applyAt\":\"bar_line\"}}")).is_err());
            assert!(of(&format!("{{{base},\"applyAt\":\"soon\"}}")).is_err());
        }

        /// `endsForm` reaches the table, and a jam that does not carry it
        /// does not end — which is every jam that is a loop, including
        /// every one already saved.
        #[test]
        fn only_a_bar_that_says_so_ends_the_form() {
            let plain = compile(&cfg(None, "room")).unwrap();
            assert!(!plain.ends_form());
            let mut last = cfg(None, "room");
            last.ends_form = Some(true);
            assert!(compile(&last).unwrap().ends_form());
            let mut not_last = cfg(None, "room");
            not_last.ends_form = Some(false);
            assert!(!compile(&not_last).unwrap().ends_form());
        }

        /// An ending is a fact about one bar, not about the band, so it is
        /// out of the signature: a `song`'s last bar and the bar before it
        /// carry the same drums, and the memo must not measure them twice.
        #[test]
        fn ending_the_form_does_not_make_it_a_different_band() {
            let a = compile(&cfg(None, "room")).unwrap();
            let mut last = cfg(None, "room");
            last.ends_form = Some(true);
            let b = compile(&last).unwrap();
            assert_eq!(a.drums_signature, b.drums_signature);
        }
    }

    use super::*;

    /// See `compile_synth`: these tests were written against the recipes.
    fn compile(cfg: &JamConfig) -> Result<JamTable, String> {
        super::compile_synth(cfg)
    }

    /// Which drum a slot's sound names, or `None` for the bass and the
    /// keys.
    ///
    /// Most of these tests predate layers and asserted on a bare `SoundId`;
    /// what they were really checking is that the lane reached the right
    /// DRUM, which is a question the layer and the round robin do not change.
    /// The tests that care which layer say so separately.
    fn drum(sound: SoundId) -> Option<KitVoice> {
        match sound {
            SoundId::Band { voice, .. } => KitVoice::ALL.get(voice as usize).copied(),
            _ => None,
        }
    }

    /// Which layer a slot reaches, 0-based.
    fn layer_of(sound: SoundId) -> Option<u8> {
        match sound {
            SoundId::Band { layer, .. } => Some(layer),
            _ => None,
        }
    }

    fn is(sound: SoundId, v: KitVoice) -> bool {
        drum(sound) == Some(v)
    }

    /// A 4/4 rock bar at 8ths: kick on 1 and 3, snare on 2 and 4, hat
    /// throughout. The shape every other fixture here is built from.
    fn rock_8ths() -> JamConfig {
        JamConfig {
            ticks_per_beat: 2,
            beats_per_bar: 4,
            bar: JamPattern {
                hat_open: Vec::new(),
                kick: vec![1, 0, 0, 0, 1, 0, 0, 0],
                snare: vec![0, 0, 2, 0, 0, 0, 2, 0],
                hat: vec![1, 3, 1, 3, 1, 3, 1, 3],
                ride: vec![0; 8],
                crash: vec![0; 8],
                ..Default::default()
            },
            fill: None,
            form_bars: 4,
            crash_on_one: false,
            intensity: 1.0,
            kit: "room".into(),
            bass: None,
            practice: None,
            fill_every: None,
            keys: None,
            mix: None,
            count_in_sound: None,
            bass_voice: None,
            keys_voice: None,
            custom_kit: None,
            ..Default::default()
        }
    }

    #[test]
    fn a_valid_groove_compiles_to_the_slots_it_names() {
        let t = compile(&rock_8ths()).expect("the rock groove must compile");
        assert_eq!(t.ticks_per_bar(), 8);
        assert_eq!(t.form_bars(), 4);
        assert!(!t.has_fill());

        // Tick 0: kick + hat, no snare.
        let tick0 = t.tick(0, 0).unwrap();
        assert_eq!(tick0.slots().len(), 2);
        assert!(is(tick0.slots()[0].sound, KitVoice::Kick));
        assert!(is(tick0.slots()[1].sound, KitVoice::Hat));
        assert!(!tick0.is_accent(), "the kick is a hit here, not an accent");

        // Tick 2 is beat 2: the backbeat, an accent, on the high snare.
        let back = t.tick(2, 0).unwrap();
        assert!(back.is_accent(), "a level-2 snare must read as an accent");
        assert!(back.slots().iter().any(|s| is(s.sound, KitVoice::Snare)));

        // Tick 1 is a ghosted hat and nothing else.
        let off = t.tick(1, 0).unwrap();
        assert_eq!(off.slots().len(), 1);
        assert!(is(off.slots()[0].sound, KitVoice::Hat));
    }

    /// Hit 0.8, accent 1.0, ghost 0.35 — the contract's levels, as ratios.
    ///
    /// Ratios rather than absolutes because the per-table normalisation
    /// scales the whole table by one number; what the contract fixes is the
    /// shape of the groove, not how far the master fader has been pulled
    /// down to make room for "loud".
    #[test]
    fn levels_map_to_the_gains_the_contract_states() {
        // One lane at a time, so nothing else is in the sum.
        let mut cfg = rock_8ths();
        cfg.bar.kick = vec![1, 2, 3, 0, 0, 0, 0, 0];
        cfg.bar.snare = vec![0; 8];
        cfg.bar.hat = vec![0; 8];
        let t = compile(&cfg).unwrap();

        let gain = |i| t.tick(i, 0).unwrap().slots()[0].gain;
        let accent = gain(1);
        assert!(accent > 0.0, "the accent came out silent");
        assert!(
            (gain(0) / accent - 0.8).abs() < 1e-5,
            "a hit is 0.8 of an accent, got {}",
            gain(0) / accent
        );
        assert!(
            (gain(2) / accent - 0.45).abs() < 1e-5,
            "a ghost is 0.45 of an accent, got {}",
            gain(2) / accent
        );
        assert_eq!(t.tick(3, 0).unwrap().slots().len(), 0, "level 0 is silence");
    }

    /// A LEVEL IS A STROKE, NOT A FADER, and this is where that becomes
    /// true. `plans/JAM_SOUND.md` §2.2: a real ghost note is a different
    /// sound from a backbeat, not a quiet copy, and with one sample per drum
    /// soft and loud were the same colour — which is the "flat" feeling
    /// under every groove in the library.
    ///
    /// The snare is the voice to measure it on, because it is the one the
    /// five synthesised kits already carry two layers of: `snare_lo` became
    /// layer 1 and `snare_hi` layer 2. A ghost reaches the soft one and
    /// everything above it the hard one.
    #[test]
    fn a_ghost_is_a_different_stroke_and_a_peak_is_the_hardest_one() {
        let mut cfg = rock_8ths();
        cfg.bar.kick = vec![0; 8];
        cfg.bar.hat = vec![0; 8];
        // ghost, hit, accent, peak.
        cfg.bar.snare = vec![3, 1, 2, 4, 0, 0, 0, 0];
        let t = compile(&cfg).unwrap();
        let layer = |i| layer_of(t.tick(i, 0).unwrap().slots()[0].sound).unwrap();
        assert_eq!(layer(0), 0, "a ghost is the softest layer there is");
        assert_eq!(layer(1), 1, "a hit is the one above it");
        // The room kit has two snare layers, so accent and peak both clamp
        // to the hardest — and that is the point of clamping rather than
        // refusing: a kit with fewer layers plays exactly as it always did.
        assert_eq!(layer(2), 1, "an accent reaches as high as this kit goes");
        assert_eq!(layer(3), 1, "and so does a peak");
        // And the two layers are different recordings, which is the whole
        // claim: before this pass they were one file at two volumes.
        let bank = reference_bank("room").unwrap();
        assert_ne!(
            bank.sample(KitVoice::Snare as u8, 0, 0),
            bank.sample(KitVoice::Snare as u8, 1, 0),
            "the ghost and the backbeat are the same recording"
        );
        // A peak is as loud as an accent. What makes it the top of a fill is
        // the layer, not the gain.
        let gain = |i| t.tick(i, 0).unwrap().slots()[0].gain;
        assert!((gain(3) - gain(2)).abs() < 1e-6, "a peak is an accent's gain");
    }

    /// LEVEL 4 IS LEGAL EVERYWHERE A LEVEL IS READ, and level 5 is not.
    #[test]
    fn a_peak_is_a_level_and_anything_above_it_is_refused() {
        for lane in 0..4 {
            let mut cfg = rock_8ths();
            let row = vec![4u8; 8];
            match lane {
                0 => cfg.bar.kick = row,
                1 => cfg.bar.snare = row,
                2 => cfg.bar.ride = row,
                _ => cfg.bar.crash = row,
            }
            assert!(compile(&cfg).is_ok(), "level 4 was refused on lane {lane}");
        }
        let mut cfg = rock_8ths();
        cfg.bar.kick = vec![5, 0, 0, 0, 0, 0, 0, 0];
        let err = compile(&cfg).expect_err("level 5 is not a level");
        assert!(err.contains("4 peak"), "the message has to list them: {err:?}");
    }

    /// THE TOM LANES: absent is silent, present is a drum, and a kit with no
    /// toms plays the fallback rather than nothing.
    #[test]
    fn the_tom_lanes_play_toms_and_absent_is_silent() {
        // Absent, which is every groove written before this pass.
        let t = compile(&rock_8ths()).unwrap();
        for i in 0..8 {
            assert!(
                !t.tick(i, 0).unwrap().slots().iter().any(|s| matches!(
                    drum(s.sound),
                    Some(KitVoice::TomHi) | Some(KitVoice::TomLo)
                )),
                "a tom sounded on tick {i} of a groove with no tom rows"
            );
        }

        let mut cfg = rock_8ths();
        cfg.bar.kick = vec![0; 8];
        cfg.bar.snare = vec![0; 8];
        cfg.bar.hat = vec![0; 8];
        cfg.bar.tom_hi = vec![2, 0, 0, 0, 0, 0, 0, 0];
        cfg.bar.tom_lo = vec![0, 2, 0, 0, 0, 0, 0, 0];
        let t = compile(&cfg).unwrap();
        // The five synthesised kits have no toms, so both lanes resolve
        // through the contract's chain: tom_lo to tom_hi to the snare's
        // second layer at 0.8. A fill on a kit without toms is a fill, not a
        // silence.
        let hi = t.tick(0, 0).unwrap().slots()[0];
        let lo = t.tick(1, 0).unwrap().slots()[0];
        assert!(is(hi.sound, KitVoice::Snare), "the high tom fell through to {:?}", drum(hi.sound));
        assert!(is(lo.sound, KitVoice::Snare));
        assert_eq!(hi.lane, JamLane::TomHi, "the LANE is still a tom lane");
        assert_eq!(lo.lane, JamLane::TomLo);
        assert!(
            (hi.gain - LEVEL_GAIN[2] * 0.8).abs() < 1e-6,
            "the substitution costs 0.8 and came out at {}",
            hi.gain
        );
        // A half-filled tom row is a caller's bug, like every other lane.
        let mut bad = cfg.clone();
        bad.bar.tom_hi = vec![1, 0];
        assert!(compile(&bad).is_err());
    }

    /// The ride is its own cymbal now, and it is trimmed under the hat.
    ///
    /// It used to be the closed hat at 0.6 because no ride sample existed.
    /// There are four of them now, and the trim stays for a different
    /// reason: every kit file peaks at 0.900, and a ride is three to seven
    /// times longer than a hat at that peak. Same ceiling, several times the
    /// energy — at the hat's gain the ride would be the loudest thing in the
    /// bar.
    #[test]
    fn the_ride_is_its_own_cymbal_and_sits_under_the_hat() {
        let mut cfg = rock_8ths();
        cfg.bar.kick = vec![0; 8];
        cfg.bar.snare = vec![0; 8];
        cfg.bar.hat = vec![1, 0, 0, 0, 0, 0, 0, 0];
        cfg.bar.ride = vec![0, 1, 0, 0, 0, 0, 0, 0];
        let t = compile(&cfg).unwrap();
        let hat = t.tick(0, 0).unwrap().slots()[0];
        let ride = t.tick(1, 0).unwrap().slots()[0];
        assert!(is(hat.sound, KitVoice::Hat));
        assert!(is(ride.sound, KitVoice::Ride), "the ride is the ride");
        assert!((ride.gain - hat.gain * RIDE_TRIM).abs() < 1e-6);
        assert!(ride.cap_ticks > hat.cap_ticks, "the ride rings longer");
    }

    #[test]
    fn the_kick_and_the_snare_ring_out_and_the_hat_does_not() {
        let t = compile(&rock_8ths()).unwrap();
        for s in t.tick(0, 0).unwrap().slots() {
            match s.lane {
                JamLane::Kick => assert_eq!(s.cap_ticks, 0.0, "a kick must ring out"),
                JamLane::Hat => assert!((s.cap_ticks - 0.9).abs() < 1e-6),
                other => panic!("unexpected lane {other:?} on tick 0"),
            }
        }
        let snare = t.tick(2, 0).unwrap().slots()[0];
        assert_eq!(snare.cap_ticks, 0.0, "a snare must ring out");
    }

    #[test]
    fn a_lane_of_the_wrong_length_is_rejected_whole() {
        let mut cfg = rock_8ths();
        cfg.bar.hat = vec![1, 1, 1, 1]; // half a bar
        let err = compile(&cfg).expect_err("a short lane must be rejected");
        assert!(err.contains("hat"), "the message must name the lane: {err}");
        assert!(err.contains('4'), "and how many cells it had: {err}");

        // And the same rule inside a fill.
        let mut cfg = rock_8ths();
        let mut fill = cfg.bar.clone();
        fill.snare = vec![1; 9];
        cfg.fill = Some(fill);
        let err = compile(&cfg).expect_err("a short fill lane must be rejected");
        assert!(err.contains("fill.snare"), "{err}");
    }

    #[test]
    fn an_impossible_level_or_meter_is_rejected() {
        let mut cfg = rock_8ths();
        cfg.bar.kick[3] = 5;
        assert!(compile(&cfg).is_err(), "level 5 does not exist");

        let mut cfg = rock_8ths();
        cfg.ticks_per_beat = 5;
        assert!(compile(&cfg).is_err(), "5 ticks a beat is not in the contract");

        let mut cfg = rock_8ths();
        cfg.beats_per_bar = 0;
        assert!(compile(&cfg).is_err(), "a bar of no beats");

        for bars in [0u32, JAM_MAX_FORM_BARS + 1] {
            let mut cfg = rock_8ths();
            cfg.form_bars = bars;
            assert!(compile(&cfg).is_err(), "{bars} bars is not a chorus");
        }
    }

    #[test]
    fn intensity_is_clamped_rather_than_obeyed() {
        let kick_gain = |intensity| {
            let mut cfg = rock_8ths();
            cfg.intensity = intensity;
            cfg.bar.kick = vec![2, 0, 0, 0, 0, 0, 0, 0];
            cfg.bar.snare = vec![0; 8];
            cfg.bar.hat = vec![0; 8];
            let t = compile(&cfg).unwrap();
            t.tick(0, 0).unwrap().slots()[0].gain
        };
        // Anything under the floor lands on the floor, anything over the
        // top lands on the top. The range is 0.5..1.6 — soft is 0.6 and
        // loud is 1.6 now, because with the bus underneath it a dial whose
        // three stops are within 5 dB of each other is a dial nobody can
        // hear turning.
        assert_eq!(kick_gain(0.05), kick_gain(0.5), "clamped up to 0.5");
        assert_eq!(kick_gain(-3.0), kick_gain(0.5), "a negative jam is still a jam");
        assert_eq!(kick_gain(9.0), kick_gain(1.6), "clamped down to 1.6");
        assert!(
            kick_gain(f32::NAN) > 0.0,
            "a NaN intensity must not silence the band"
        );
        assert!(kick_gain(f32::INFINITY) > 0.0);
    }

    /// INTENSITY HAS TO DO SOMETHING, ON A BUSY GROOVE TOO.
    ///
    /// The first version of the normalisation scaled every table so its
    /// worst tick hit the ceiling, which meant soft, normal and loud all
    /// came out at exactly the same level on any groove busy enough to trip
    /// it: the musician turns the dial and nothing happens. The clamp only
    /// fires on a table nobody writes now, so the dial reaches the band
    /// intact on every groove in the library.
    #[test]
    fn soft_normal_and_loud_are_three_different_levels() {
        let peak = |intensity| {
            // Busy — and it is deliberately NOT busy enough to trip the
            // clamp, because that is the case the dial has to survive.
            let mut cfg = rock_8ths();
            cfg.intensity = intensity;
            cfg.bar.kick = vec![2; 8];
            cfg.bar.snare = vec![2; 8];
            cfg.bar.hat = vec![2; 8];
            cfg.bar.crash = vec![2; 8];
            compile(&cfg).unwrap().peak_after
        };
        let (soft, normal, loud) = (peak(0.6), peak(1.0), peak(1.6));
        assert!(
            soft < normal && normal < loud,
            "soft {soft:.3}, normal {normal:.3}, loud {loud:.3} — the dial does nothing"
        );
        // And they are spaced the way the contract says: the ratios survive.
        assert!((normal / soft - 1.0 / 0.6).abs() < 1e-3);
        assert!((loud / normal - 1.6).abs() < 1e-3);
        // A 8.5 dB spread, which is a dial you can hear rather than one you
        // have to be told about.
        let spread = 20.0 * (loud / soft).log10();
        eprintln!("[jam] soft to loud: {spread:.1} dB");
        assert!(spread > 6.0, "soft to loud is only {spread:.1} dB");
    }

    #[test]
    fn the_fill_replaces_the_groove_only_on_the_last_bar() {
        let mut cfg = rock_8ths();
        cfg.form_bars = 4;
        let mut fill = cfg.bar.clone();
        fill.kick = vec![0; 8];
        fill.snare = vec![2, 1, 2, 1, 2, 1, 2, 1];
        cfg.fill = Some(fill);
        let t = compile(&cfg).unwrap();
        assert!(t.has_fill());

        for bar in 0..3 {
            let has_kick = t
                .tick(0, bar)
                .unwrap()
                .slots()
                .iter()
                .any(|s| is(s.sound, KitVoice::Kick));
            assert!(has_kick, "bar {bar} of 4 is still the groove");
        }
        let last = t.tick(0, 3).unwrap();
        assert!(
            !last.slots().iter().any(|s| is(s.sound, KitVoice::Kick)),
            "the last bar of the chorus is the fill"
        );
    }

    /// A fill of toms and a snare, so the pickup has something to cut from,
    /// and a hat right through it, so there is something to leave behind.
    fn rock_8ths_with_a_tom_fill() -> JamConfig {
        let mut cfg = rock_8ths();
        let mut fill = cfg.bar.clone();
        fill.kick = vec![1, 0, 0, 0, 0, 0, 0, 0];
        fill.snare = vec![0, 0, 2, 0, 0, 0, 0, 0];
        fill.hat = vec![1, 1, 1, 1, 1, 1, 1, 1];
        fill.tom_hi = vec![0, 0, 0, 0, 2, 1, 0, 0];
        fill.tom_lo = vec![0, 0, 0, 0, 0, 0, 2, 4];
        cfg.fill = Some(fill);
        cfg
    }

    /// The pickup is the fill's LAST BEAT, and only what a drummer's hands
    /// are doing: the toms are in it, the hat that plays straight through
    /// the fill is not.
    #[test]
    fn the_pickup_is_the_fills_last_beat_and_nothing_but_the_hands() {
        let mut cfg = rock_8ths_with_a_tom_fill();
        cfg.pickup = Some(true);
        let t = compile(&cfg).unwrap();
        assert!(t.has_pickup(), "the config asked to be played in");

        // Two ticks to the beat, so the pickup is ticks 6 and 7 of the fill.
        let first = t.pickup_tick(0).expect("the pickup's first tick");
        let second = t.pickup_tick(1).expect("the pickup's second tick");
        assert!(
            t.pickup_tick(2).is_none(),
            "a pickup is one beat and not a tick more"
        );

        assert!(
            first.slots().iter().any(|s| s.lane == JamLane::TomLo),
            "the floor tom on the fill's seventh tick"
        );
        assert!(
            second.slots().iter().any(|s| s.lane == JamLane::TomLo),
            "and the one that lands on the eighth"
        );
        for (n, tick) in [first, second].iter().enumerate() {
            assert!(
                !tick.slots().iter().any(|s| s.lane == JamLane::Hat),
                "tick {n} of the pickup kept a hat; the tune has not started"
            );
            assert!(
                !tick.slots().iter().any(|s| s.lane == JamLane::Crash
                    || s.lane == JamLane::Ride
                    || s.lane == JamLane::Bass
                    || s.lane == JamLane::Keys),
                "tick {n} of the pickup kept something that is not a hand"
            );
        }
    }

    /// The pickup SPENDS the fill row. An arrangement writes its fills into
    /// the bar, so a table that carries a pickup must not also play the
    /// engine's own fill on the last bar of the chorus — that would be two
    /// fills over each other.
    #[test]
    fn a_table_with_a_pickup_plays_no_fill_at_the_bar_line() {
        let mut cfg = rock_8ths_with_a_tom_fill();
        cfg.form_bars = 4;

        // Without the pickup the row is what it has always been.
        let looped = compile(&cfg).unwrap();
        assert!(looped.has_fill());
        assert!(!looped.has_pickup());
        assert!(
            looped
                .tick(6, 3)
                .unwrap()
                .slots()
                .iter()
                .any(|s| s.lane == JamLane::TomLo),
            "the last bar of the chorus is the fill"
        );

        // With it, the last bar of the chorus is the groove again.
        cfg.pickup = Some(true);
        let played_in = compile(&cfg).unwrap();
        assert!(played_in.has_pickup());
        assert!(!played_in.has_fill(), "the fill row was spent on the pickup");
        for bar in 0..4 {
            assert!(
                !played_in
                    .tick(6, bar)
                    .unwrap()
                    .slots()
                    .iter()
                    .any(|s| s.lane == JamLane::TomLo),
                "bar {bar} of 4 played a fill the arrangement did not write"
            );
        }
    }

    /// Asking to be played in with nothing to play is not a pickup, and not
    /// an error either: a groove nobody drew a fill for counts in as it did
    /// before, and keeps its fill row, because there is none to spend.
    #[test]
    fn a_pickup_without_a_fill_is_no_pickup_at_all() {
        let mut cfg = rock_8ths();
        cfg.pickup = Some(true);
        let t = compile(&cfg).unwrap();
        assert!(!t.has_pickup());
        assert!(t.pickup_tick(0).is_none());
    }

    /// The pickup arrives at the level of the band it leads into — it IS the
    /// band, a beat early, so the intensity dial moves it with everything
    /// else. (The count-in's sticks are the opposite case: see
    /// `a_count_in_is_a_beep_unless_the_jam_asks_for_sticks`.)
    #[test]
    fn the_pickup_is_played_at_the_bands_own_level() {
        let mut soft = rock_8ths_with_a_tom_fill();
        soft.pickup = Some(true);
        soft.intensity = 0.7;
        let mut loud = soft.clone();
        loud.intensity = 1.25;

        let gain_of = |cfg: &JamConfig| {
            compile(cfg)
                .unwrap()
                .pickup_tick(1)
                .expect("the pickup's last tick")
                .slots()
                .iter()
                .map(|s| s.gain)
                .fold(0.0f32, f32::max)
        };
        let quiet = gain_of(&soft);
        let hard = gain_of(&loud);
        assert!(
            hard > quiet * 1.5,
            "the dial moved the band and left the pickup behind: {quiet} then {hard}"
        );
    }

    #[test]
    fn the_crash_on_the_one_is_added_once_and_never_doubled() {
        let mut cfg = rock_8ths();
        cfg.crash_on_one = true;
        let t = compile(&cfg).unwrap();
        let crash = t.crash_on_one().expect("the jam asked for a crash");
        assert!(is(crash.sound, KitVoice::Crash));
        assert_eq!(crash.cap_ticks, 0.0, "a crash rings out");

        // A groove that already crashes on tick 0 does not get a second one.
        let mut cfg = rock_8ths();
        cfg.crash_on_one = true;
        cfg.bar.crash = vec![2, 0, 0, 0, 0, 0, 0, 0];
        let t = compile(&cfg).unwrap();
        assert!(
            t.crash_on_one().is_none(),
            "the groove's own crash is already on the one"
        );

        // And nothing is added when the jam did not ask.
        assert!(compile(&rock_8ths()).unwrap().crash_on_one().is_none());
    }

    /// THE SAFETY CLAMP, ON THE TABLE IT EXISTS FOR.
    ///
    /// Kick, snare, hat, ride and crash on every tick at the loudest
    /// intensity there is: the loudest thing Jam can describe, and nobody's
    /// groove. It is not held to full scale any more — the bus does that —
    /// but it IS held to [`JAM_SAFETY_CLAMP`], because a band arriving at
    /// five times full scale is asking a compressor for something no
    /// compressor makes musical.
    #[test]
    fn the_busiest_band_is_held_at_the_safety_clamp() {
        let cfg = JamConfig {
            ticks_per_beat: 4,
            beats_per_bar: 4,
            bar: JamPattern {
                hat_open: Vec::new(),
                kick: vec![1; 16],
                snare: vec![2; 16],
                hat: vec![1; 16],
                ride: vec![1; 16],
                crash: vec![4; 16],
                ..Default::default()
            },
            fill: None,
            form_bars: 4,
            crash_on_one: true,
            intensity: 1.6,
            kit: "room".into(),
            bass: None,
            practice: None,
            fill_every: None,
            keys: None,
            mix: None,
            count_in_sound: None,
            bass_voice: None,
            keys_voice: None,
            custom_kit: None,
            ..Default::default()
        };
        let t = compile(&cfg).unwrap();
        assert!(
            t.base_peak > JAM_SAFETY_CLAMP,
            "this fixture is supposed to be the absurd one; it rendered {}",
            t.base_peak
        );

        // Re-measure the compiled slots rather than trusting the
        // bookkeeping. The clamp is applied at intensity 1.0, so what the
        // table renders is the clamp times whatever the dial was set to.
        let measured = worst_bar_peak(
            &t.bar,
            t.fill.as_deref(),
            t.crash_on_one(),
            t.form_bars(),
            cfg.ticks_per_beat,
            t.kit_bank(),
            t.perc_bank(),
            &JamVoices::default(),
        );
        assert!(
            measured <= JAM_SAFETY_CLAMP * cfg.intensity + 1e-2,
            "the compiled table still renders a tick at {measured}"
        );
        // AND WHAT THE BUS DOES WITH IT IS UNDER FULL SCALE. That is the
        // claim the clamp exists to make true — a band at the clamp is a
        // band arriving hot, which is what a drum bus is for.
        let out = bus_steady_state(JAM_SAFETY_CLAMP, t.bus_drive);
        assert!(
            out < 1.0,
            "the clamp lets {JAM_SAFETY_CLAMP} through the bus at {out}"
        );

        // Gentle: the groove's own balance survives the scaling.
        let tick = t.tick(0, 0).unwrap();
        let kick = tick.slots().iter().find(|s| s.lane == JamLane::Kick).unwrap();
        let snare = tick
            .slots()
            .iter()
            .find(|s| is(s.sound, KitVoice::Snare))
            .unwrap();
        assert!(
            (snare.gain / kick.gain - 1.0 / 0.8).abs() < 1e-4,
            "normalisation must scale the table, not reshape it"
        );
    }

    /// An ordinary groove at normal intensity must stay a loud, present
    /// thing. It is held below the ceiling to leave room for "loud", but
    /// "below the ceiling" must not quietly become "shy" — the mistake the
    /// snare kit made three times over (`engine.rs`).
    #[test]
    fn an_ordinary_groove_is_still_a_loud_groove() {
        let t = compile(&rock_8ths()).unwrap();
        assert!(
            t.peak_after > 0.5,
            "a rock beat at normal intensity peaks at {:.3}, which is a whisper",
            t.peak_after
        );
        // AND IT IS NOT SCALED AT ALL. This is the 9 to 13 dB
        // (`plans/JAM_SOUND.md` §1): a rock beat used to pay, on every hit,
        // for the busiest table anybody could write. It does not any more.
        assert_eq!(
            t.peak_before, t.peak_after,
            "a rock beat was scaled, and nothing about it is absurd"
        );
        // A groove quiet enough not to need the headroom keeps its level
        // untouched too — the clamp is not a fader on everything.
        let mut quiet = rock_8ths();
        quiet.bar.kick = vec![3, 0, 0, 0, 0, 0, 0, 0];
        quiet.bar.snare = vec![0; 8];
        quiet.bar.hat = vec![0; 8];
        let q = compile(&quiet).unwrap();
        assert_eq!(
            q.tick(0, 0).unwrap().slots()[0].gain,
            LEVEL_GAIN[3],
            "a lone ghost note needs no headroom and must not be scaled"
        );
    }

    /// THE SCALING RULE, AT 2.4 AND AT 2.6.
    ///
    /// The contract: "a table is scaled only when its worst tick exceeds
    /// 2.5 before the bus". Measured on the arithmetic rather than on a
    /// groove, because finding two grooves that render either side of one
    /// number would be a test about the fixtures.
    #[test]
    fn a_table_is_scaled_only_above_two_and_a_half() {
        let scaled = |base: f32| {
            if base > JAM_SAFETY_CLAMP {
                JAM_SAFETY_CLAMP / base
            } else {
                1.0
            }
        };
        assert_eq!(scaled(2.4), 1.0, "2.4 is under the clamp and keeps its level");
        assert_eq!(scaled(2.5), 1.0, "and so is the clamp itself");
        assert!(scaled(2.6) < 1.0, "2.6 is over it");
        assert!(
            (2.6 * scaled(2.6) - JAM_SAFETY_CLAMP).abs() < 1e-5,
            "a scaled table lands on the clamp and not below it"
        );
        assert_eq!(JAM_SAFETY_CLAMP, 2.5);
    }

    /// What the bus does to a steady input, for the tests above to lean on.
    ///
    /// The same two stages `DrumBus` runs on the audio thread, settled: the
    /// tanh with this kit's drive, then the compressor's gain at its own
    /// steady state. Written here rather than reached for across the module
    /// boundary because `DrumBus` is the callback's and this is arithmetic.
    fn bus_steady_state(input: f32, drive: f32) -> f32 {
        let shaped = (input * drive).tanh() / drive.tanh();
        // Threshold −6 dBFS, ratio 3:1.
        if shaped > 0.5 {
            shaped * (0.5 / shaped).powf(1.0 - 1.0 / 3.0)
        } else {
            shaped
        }
    }

    #[test]
    fn a_one_bar_form_is_its_own_fill() {
        let mut cfg = rock_8ths();
        cfg.form_bars = 1;
        let mut fill = cfg.bar.clone();
        fill.kick = vec![0; 8];
        cfg.fill = Some(fill);
        let t = compile(&cfg).unwrap();
        assert!(
            !t.tick(0, 0)
                .unwrap()
                .slots()
                .iter()
                .any(|s| is(s.sound, KitVoice::Kick)),
            "bar 0 of a 1-bar form is also its last bar"
        );
    }

    /// THE CRASH IS MEASURED WHERE IT ACTUALLY LANDS.
    ///
    /// The crash on the one hits bar 0 of the chorus. With a one-bar form
    /// the fill IS bar 0, so it lands on the fill's first tick; with any
    /// longer form it lands on the groove's. Measuring both regardless is
    /// safe and wrong — it throws away level for a bar that never happens —
    /// and measuring only the groove's leaves a one-bar form free to clip.
    #[test]
    fn the_crash_is_measured_against_whichever_bar_is_bar_zero() {
        // A fill far louder on its downbeat than the groove is.
        let with_form = |bars: u32| {
            let mut cfg = rock_8ths();
            cfg.form_bars = bars;
            cfg.crash_on_one = true;
            cfg.bar.kick = vec![1, 0, 0, 0, 0, 0, 0, 0];
            cfg.bar.snare = vec![0; 8];
            cfg.bar.hat = vec![0; 8];
            cfg.fill = Some(JamPattern {
                hat_open: Vec::new(),
                kick: vec![2; 8],
                snare: vec![2; 8],
                hat: vec![2; 8],
                ride: vec![2; 8],
                crash: vec![0; 8],
                ..Default::default()
            });
            compile(&cfg).unwrap()
        };
        let one = with_form(1);
        let four = with_form(4);
        assert!(
            one.peak_before > four.peak_before,
            "a one-bar form stacks the crash on the fill's downbeat, so it must \
             measure louder than a four-bar form ({:.3} vs {:.3})",
            one.peak_before,
            four.peak_before
        );
        for (name, t) in [("one-bar", &one), ("four-bar", &four)] {
            assert!(
                t.peak_after <= JAM_SAFETY_CLAMP + 1e-4,
                "the {name} form peaks at {:.3}, over the ceiling",
                t.peak_after
            );
        }
    }

    #[test]
    fn a_tick_outside_the_bar_is_a_bounds_check_not_a_panic() {
        let t = compile(&rock_8ths()).unwrap();
        assert!(t.tick(8, 0).is_none());
        assert!(t.tick(u32::MAX, 0).is_none());
    }

    #[test]
    fn the_config_deserialises_from_the_contracts_camel_case() {
        let json = r#"{
            "ticksPerBeat": 2,
            "beatsPerBar": 4,
            "bar": {
              "kick":  [1,0,0,0,1,0,0,0],
              "snare": [0,0,2,0,0,0,2,0],
              "hat":   [1,3,1,3,1,3,1,3],
              "ride":  [0,0,0,0,0,0,0,0],
              "crash": [0,0,0,0,0,0,0,0]
            },
            "fill": null,
            "formBars": 12,
            "crashOnOne": true,
            "intensity": 1.25,
            "kit": "room"
        }"#;
        let cfg: JamConfig = serde_json::from_str(json).expect("the contract must deserialise");
        assert_eq!(cfg.ticks_per_beat, 2);
        assert_eq!(cfg.form_bars, 12);
        assert!(cfg.crash_on_one);
        assert!(cfg.fill.is_none());
        assert_eq!(cfg.kit, "room");
        let t = compile(&cfg).unwrap();
        assert_eq!(t.ticks_per_bar(), 8);
        assert_eq!(t.form_bars(), 12);
    }

    /// THE WIRE NAMES, WHICH ARE THE UI'S AND NOT THE ENGINE'S.
    ///
    /// `JamConfig` and `JamPattern` are `rename_all = "camelCase"`, so the
    /// Rust field `tom_hi` arrives as `tomHi` and `snare_ghost_is_rim` as
    /// `snareGhostIsRim`. Nothing in the engine spells those out, which is
    /// exactly why this exists: a serde rename added by hand, or the
    /// container attribute quietly dropped, would take the toms and the
    /// cross-stick away with no error anywhere — the fields would simply
    /// default and every groove would play without them.
    #[test]
    fn the_third_pass_fields_arrive_under_the_names_the_ui_sends() {
        let json = r#"{
            "ticksPerBeat": 2,
            "beatsPerBar": 4,
            "bar": {
              "kick":   [1,0,0,0,1,0,0,0],
              "snare":  [0,0,2,0,0,0,2,0],
              "hat":    [1,3,1,3,1,3,1,3],
              "hatOpen":[0,0,0,1,0,0,0,1],
              "ride":   [0,0,0,0,0,0,0,0],
              "crash":  [0,0,0,0,0,0,0,0],
              "tomHi":  [0,0,0,0,4,0,0,0],
              "tomLo":  [0,0,0,0,0,4,0,0]
            },
            "fill": null,
            "formBars": 12,
            "crashOnOne": true,
            "intensity": 1.6,
            "kit": "attic",
            "snareGhostIsRim": true
        }"#;
        let cfg: JamConfig = serde_json::from_str(json).expect("the UI's own spelling");
        assert_eq!(cfg.bar.tom_hi, vec![0, 0, 0, 0, 4, 0, 0, 0]);
        assert_eq!(cfg.bar.tom_lo, vec![0, 0, 0, 0, 0, 4, 0, 0]);
        assert_eq!(cfg.bar.hat_open, vec![0, 0, 0, 1, 0, 0, 0, 1]);
        assert_eq!(cfg.snare_ghost_is_rim, Some(true));
        assert_eq!(cfg.intensity, 1.6);

        // AND A KIT THIS BUILD HAS NEVER HEARD OF STILL PLAYS. "attic" is a
        // kit a later build might ship (this test once said "studio", and
        // then the recorded kits arrived and it was real); a jam that named
        // it and would not load is a worse failure than one that loads on
        // the drums the app already has.
        let t = compile(&cfg).expect("a jam naming a kit this build lacks must still play");
        assert_eq!(t.kit.name(), "room", "an unknown kit is the fallback");
        assert!(is(slot_of(&t, 4, JamLane::TomHi).unwrap().sound, KitVoice::Snare));
        assert!(is(slot_of(&t, 1, JamLane::Hat).unwrap().sound, KitVoice::Hat));

        // The other side of the round trip: a config with none of these
        // fields is a config with silent toms and no cross-stick, which is
        // every jam the store already holds.
        let older: JamConfig = serde_json::from_str(
            r#"{"ticksPerBeat":2,"beatsPerBar":4,
                "bar":{"kick":[1,0,0,0,1,0,0,0],"snare":[0,0,2,0,0,0,2,0],
                       "hat":[1,1,1,1,1,1,1,1],"ride":[0,0,0,0,0,0,0,0],
                       "crash":[0,0,0,0,0,0,0,0]},
                "fill":null,"formBars":12,"crashOnOne":false,"intensity":1.0,"kit":"room"}"#,
        )
        .expect("a jam from before this pass");
        assert!(older.bar.tom_hi.is_empty() && older.bar.tom_lo.is_empty());
        assert_eq!(older.snare_ghost_is_rim, None);
        assert!(compile(&older).is_ok());
    }

    /// THE CRASH ON THE ONE IS THE PEAK, NOT AN ACCENT.
    ///
    /// Arriving at the top of the form is the loudest thing the band does,
    /// and with layers that means the hardest stroke the kit was recorded
    /// with rather than the same cymbal turned up.
    #[test]
    fn the_crash_on_the_one_is_the_hardest_stroke_the_kit_has() {
        let mut cfg = rock_8ths();
        cfg.crash_on_one = true;
        let bank = Arc::new(KitBank::layered_for_tests(
            &[KitVoice::Crash, KitVoice::Kick, KitVoice::Snare, KitVoice::Hat],
            JAM_REFERENCE_SR,
            0.05,
            4,
            1,
        ));
        let t = compile_with_kit(&cfg, bank).unwrap();
        let crash = t.crash_on_one().expect("the jam asked for a crash");
        assert!(is(crash.sound, KitVoice::Crash));
        assert_eq!(layer_of(crash.sound), Some(3), "a peak is the hardest layer");
        assert!(crash.accent, "the top of the form flashes the dot");
        assert!(
            (crash.gain - LEVEL_GAIN[4]).abs() < 1e-6,
            "the crash came out at {} and a peak is {}",
            crash.gain,
            LEVEL_GAIN[4]
        );
        // ...and a kit with one crash plays it, which is every synthesised
        // kit in the app.
        let one = compile(&cfg).unwrap().crash_on_one().unwrap();
        assert_eq!(layer_of(one.sound), Some(0));
    }

    // -----------------------------------------------------------------
    // Round robins, drift and the choke
    // -----------------------------------------------------------------

    /// THE ROUND ROBIN IS THE CONTRACT'S FORMULA AND NOTHING ELSE.
    ///
    /// `(bar * ticks_per_bar + tick + voice_index * 7) mod rr`. Arithmetic
    /// rather than a counter, so there is no state to get out of step with a
    /// jump, a loop or a table swapped at a bar line — and the same bar of
    /// the same jam plays the same drums every time round, which is what
    /// makes a take reproducible.
    #[test]
    fn the_round_robin_is_the_formula_the_contract_states() {
        for (bar, tick, voice, rr) in [
            (0u32, 0u32, 0u8, 3u8),
            (1, 5, 2, 3),
            (11, 15, 10, 2),
            (63, 95, 6, 3),
        ] {
            let want = ((bar as u64 * 16 + tick as u64 + voice as u64 * 7) % rr as u64) as u8;
            assert_eq!(round_robin(bar, 16, tick, voice, rr), want);
        }
        // One round robin is no choice at all, and the answer is always the
        // one buffer there is — a kit with a single sample per drum behaves
        // exactly as it did before this pass.
        for tick in 0..64 {
            assert_eq!(round_robin(3, 16, tick, 4, 1), 0);
        }
        // ...and it is always in range, which is what stops `KitBank::sample`
        // reaching past the end.
        for rr in 1..=crate::kit::MAX_RR {
            for tick in 0..96 {
                for voice in 0..KIT_VOICES as u8 {
                    assert!(round_robin(7, 96, tick, voice, rr) < rr);
                }
            }
        }
    }

    /// IDENTICAL HITS IN A ROW ARE A MACHINE GUN.
    ///
    /// `plans/JAM_SOUND.md` §2.3: the brain flags the repetition within two
    /// bars. So a hat on every sixteenth must not play the same recording
    /// twice in a row — and the `× 7` in the formula is what stops every
    /// voice cycling together, which would be a machine gun with three
    /// barrels rather than one.
    #[test]
    fn a_hat_on_every_sixteenth_does_not_play_the_same_recording_twice() {
        let robins: Vec<u8> = (0..16)
            .map(|t| round_robin(0, 16, t, KitVoice::Hat as u8, 3))
            .collect();
        for w in robins.windows(2) {
            assert_ne!(w[0], w[1], "two of the same in a row in {robins:?}");
        }
        // Three round robins, and all three are used inside one bar.
        let mut seen = [false; 3];
        for r in robins.iter() {
            seen[*r as usize] = true;
        }
        assert!(seen.iter().all(|s| *s), "{robins:?} does not use all three");

        // AND ADJACENT VOICES ARE OUT OF PHASE. `× 7` is what does it: the
        // kick, the snare and the cross-stick are voices 0, 1 and 2, so
        // their offsets are 0, 7 and 14 — three different residues mod 3,
        // which means the kick and the snare never change recording on the
        // same tick.
        //
        // It is not true of EVERY pair, and it cannot be: 7 is 1 mod 3, so
        // voices three apart share a phase whatever the multiplier. What
        // matters is the drums that land together, and those are next to
        // each other in the list.
        for (a, b) in [
            (KitVoice::Kick, KitVoice::Snare),
            (KitVoice::Snare, KitVoice::Hat),
            (KitVoice::Hat, KitVoice::HatOpen),
        ] {
            let same = (0..16)
                .filter(|t| {
                    round_robin(0, 16, *t, a as u8, 3) == round_robin(0, 16, *t, b as u8, 3)
                })
                .count();
            assert_eq!(
                same,
                0,
                "{} and {} cycle together",
                a.file_name(),
                b.file_name()
            );
        }
    }

    /// THE DRIFT IS BOUNDED, AND IT IS THE SAME EVERY TIME ROUND.
    ///
    /// A seeded ±2% of gain and 0-3 ms of push reads as a person
    /// (`plans/JAM_SOUND.md` §2.6). Random would read as a person too, and
    /// would make a take unrepeatable and a level claim unmeasurable — so it
    /// is a hash, and this is what says it stays one.
    #[test]
    fn the_drift_is_bounded_and_deterministic() {
        let mut gains = Vec::new();
        let mut delays = Vec::new();
        for bar in 0..64u32 {
            for tick in 0..96u32 {
                for voice in 0..KIT_VOICES as u8 {
                    let (g, d) = drift(bar, tick, voice);
                    assert!(
                        (1.0 - DRIFT_GAIN..=1.0 + DRIFT_GAIN).contains(&g),
                        "bar {bar} tick {tick} voice {voice} drifted to {g}"
                    );
                    assert!((0.0..=1.0).contains(&d), "delay {d} is not a fraction");
                    // The same input, the same output — checked here rather
                    // than in a second loop, so a hash that read a clock
                    // would fail on the call and not on the comparison.
                    assert_eq!((g, d), drift(bar, tick, voice));
                    gains.push(g);
                    delays.push(d);
                }
            }
        }
        // AND IT ACTUALLY MOVES. A hash that returned 1.0 and 0.0 would pass
        // every bound above and be exactly the thing this replaces.
        let spread = |v: &[f32]| {
            let (lo, hi) = v.iter().fold((f32::MAX, f32::MIN), |(a, b), s| (a.min(*s), b.max(*s)));
            hi - lo
        };
        assert!(
            spread(&gains) > DRIFT_GAIN * 1.9,
            "the gain drift only spans {}",
            spread(&gains)
        );
        assert!(spread(&delays) > 0.98, "the delay only spans {}", spread(&delays));
        // And it is not a pattern: the same tick of two different bars is a
        // different hit, which is what stops a four-bar form looping
        // audibly.
        let a: Vec<(f32, f32)> = (0..96).map(|t| drift(0, t, 3)).collect();
        let b: Vec<(f32, f32)> = (0..96).map(|t| drift(1, t, 3)).collect();
        assert_ne!(a, b, "every bar drifts identically, which is a loop");
    }

    /// THE CHOKE MASKS ARE THE MANIFEST'S, INVERTED.
    ///
    /// The manifest says what CLOSES a drum, because that is how a drummer
    /// describes it. The audio thread asks the other question, about the
    /// drum it is spawning. `choke_map` is the inversion, and this is what
    /// says it is the right way round — the direction is the difference
    /// between a hat that closes the wash and a wash that silences the hat.
    #[test]
    fn a_closed_hat_and_the_foot_choke_the_open_one_and_nothing_else() {
        let bank = reference_bank("room").unwrap();
        let map = choke_map(&bank);
        assert_eq!(
            map[KitVoice::Hat as usize],
            KitVoice::HatOpen.bit(),
            "the stick does not close the open hat"
        );
        assert_eq!(
            map[KitVoice::HatPedal as usize],
            KitVoice::HatOpen.bit(),
            "the foot does not either"
        );
        assert_eq!(
            map[KitVoice::HatOpen as usize],
            0,
            "the wash silenced the stick, which is the inversion upside down"
        );
        for v in [KitVoice::Kick, KitVoice::Snare, KitVoice::Crash, KitVoice::Ride] {
            assert_eq!(map[v as usize], 0, "{} chokes something", v.file_name());
        }

        // And it reaches the slots, which is where the audio thread reads it.
        let mut cfg = rock_8ths();
        cfg.bar.hat_open = vec![0, 1, 0, 0, 0, 0, 0, 0];
        let t = compile(&cfg).unwrap();
        let hat = slot_of(&t, 0, JamLane::Hat).unwrap();
        let open = slot_of(&t, 1, JamLane::HatOpen).unwrap();
        assert_eq!(hat.chokes, KitVoice::HatOpen.bit());
        assert_eq!(open.chokes, 0);
        assert_eq!(
            open.choked_by,
            KitVoice::Hat.bit() | KitVoice::HatPedal.bit()
        );
    }

    /// THE FOOT THAT CLOSES THE HAT MAKES A SOUND.
    ///
    /// Not a lane and not something a groove writes: a drummer who opens the
    /// hat closes it with their foot at the next hat, and that foot chips.
    /// The bar is a circle, because a bar of a groove is played round and
    /// round.
    #[test]
    fn every_open_hat_is_followed_by_a_pedal_at_the_next_hat() {
        let mut cfg = rock_8ths();
        //          0  1  2  3  4  5  6  7
        cfg.bar.hat = vec![1, 0, 1, 0, 1, 0, 1, 0];
        cfg.bar.hat_open = vec![0, 1, 0, 0, 0, 0, 0, 0];
        let t = compile(&cfg).unwrap();
        let pedal = |tick: u32| slot_of(&t, tick, JamLane::HatPedal);

        // The open hat is on tick 1; the next closed hat is tick 2, and that
        // is where the foot lands.
        assert!(pedal(2).is_some(), "the foot never came down");
        for tick in [0u32, 4, 6] {
            assert!(
                pedal(tick).is_none(),
                "tick {tick} grew a pedal with no open hat before it"
            );
        }
        // It is soft — a foot, not a stick — and it is the kit's own pedal,
        // which on a kit without one is the closed hat at half.
        let p = pedal(2).unwrap();
        assert!(
            (p.gain - HAT_PEDAL_GAIN * 0.5).abs() < 1e-6,
            "the pedal came out at {} and the fallback is the hat at half",
            p.gain
        );
        assert!(is(p.sound, KitVoice::Hat), "the room kit has no pedal, so it borrows");

        // THE BAR IS A CIRCLE. An open hat on the last tick is closed by the
        // hat on the downbeat, which is tick 0 of the same bar played again.
        let mut round = rock_8ths();
        round.bar.hat = vec![1, 0, 0, 0, 0, 0, 0, 0];
        round.bar.hat_open = vec![0, 0, 0, 0, 0, 0, 0, 1];
        let t = compile(&round).unwrap();
        assert!(
            slot_of(&t, 0, JamLane::HatPedal).is_some(),
            "the open hat on the last sixteenth rings into the next bar for ever"
        );

        // A groove with no open hat has no pedals at all, which is every
        // groove written before this pass.
        let plain = compile(&rock_8ths()).unwrap();
        for tick in 0..8 {
            assert!(slot_of(&plain, tick, JamLane::HatPedal).is_none());
        }
    }

    /// A BOSSA'S GHOST IS THE CROSS-STICK, AND A FUNK GROOVE'S IS NOT.
    ///
    /// A stick laid across the head is its own sound, not a quiet snare. The
    /// groove knows which it is; the engine does not, which is why it is a
    /// flag on the config.
    #[test]
    fn a_groove_can_say_its_snare_ghosts_are_the_cross_stick() {
        let mut cfg = rock_8ths();
        cfg.bar.snare = vec![0, 3, 2, 0, 0, 3, 2, 0];

        let plain = compile(&cfg).unwrap();
        assert!(is(slot_of(&plain, 1, JamLane::Snare).unwrap().sound, KitVoice::Snare));

        cfg.snare_ghost_is_rim = Some(true);
        let bossa = compile(&cfg).unwrap();
        assert!(
            is(slot_of(&bossa, 1, JamLane::Snare).unwrap().sound, KitVoice::Rim),
            "the ghost is still a snare"
        );
        // ...and only the GHOST. The backbeat is the drum, whatever the
        // groove says about its ghosts.
        assert!(is(slot_of(&bossa, 2, JamLane::Snare).unwrap().sound, KitVoice::Snare));
        // It is a change you hear now, not at the next bar line.
        assert_ne!(plain.drums_signature, bossa.drums_signature);
        assert!(!swap_defers(Some(&plain), Some(&bossa), true, false));
    }

    /// THE CONTRACT'S FALLBACK CHAIN, VOICE BY VOICE.
    ///
    /// A kit without a cross-stick still has to play a bossa, and a kit
    /// without toms still has to play a fill. Every substitution here is
    /// musical rather than a silence, and each carries the gain that makes
    /// it sound like the voice it stands in for.
    #[test]
    fn a_voice_a_kit_does_not_have_falls_through_to_one_it_does() {
        // Everything but the drums the chain reaches for.
        let bank = KitBank::for_tests(&[KitVoice::Kick, KitVoice::Snare, KitVoice::Hat], 48_000, 0.05);
        for (want, voice, layer, gain) in [
            // rim -> snare layer 1
            (KitVoice::Snare, KitVoice::Rim, 0u8, 1.0f32),
            // hat_pedal -> hat layer 1 at 0.5
            (KitVoice::Hat, KitVoice::HatPedal, 0, 0.5),
            // tom_lo -> tom_hi -> snare layer 2 at 0.8
            (KitVoice::Snare, KitVoice::TomLo, 1, 0.8),
            (KitVoice::Snare, KitVoice::TomHi, 1, 0.8),
            // hat_open -> hat, keeping whatever layer the level asked for
            (KitVoice::Hat, KitVoice::HatOpen, 2, 1.0),
        ] {
            let (got, index, cost) = resolve_voice(&bank, voice, 3)
                .unwrap_or_else(|| panic!("{} fell through to nothing", voice.file_name()));
            assert_eq!(got, want, "{} fell through to {got:?}", voice.file_name());
            assert!(
                (cost - gain).abs() < 1e-6,
                "{} costs {cost} and the contract says {gain}",
                voice.file_name()
            );
            let _ = (index, layer);
        }
        // ride_bell -> ride, and it keeps the layer.
        let with_ride = KitBank::layered_for_tests(&[KitVoice::Ride], 48_000, 0.05, 4, 1);
        let (got, index, cost) = resolve_voice(&with_ride, KitVoice::RideBell, 4).unwrap();
        assert_eq!((got, index), (KitVoice::Ride, 3));
        assert_eq!(cost, 1.0);
        // And a kit with no kick has no kick: inventing one out of a tom
        // would be the app playing something nobody recorded.
        let bare = KitBank::for_tests(&[KitVoice::Hat], 48_000, 0.05);
        assert!(resolve_voice(&bare, KitVoice::Kick, 2).is_none());
        assert!(resolve_voice(&bare, KitVoice::Crash, 2).is_none());
    }

    /// THE RIDE'S BELL IS THE TOP OF A RIDE FIGURE, AND ONLY THERE.
    #[test]
    fn a_peak_on_the_ride_lane_reaches_the_bell_when_the_kit_has_one() {
        let mut cfg = rock_8ths();
        cfg.bar.ride = vec![1, 0, 4, 0, 0, 0, 0, 0];

        // A kit with a bell.
        let bank = Arc::new(KitBank::for_tests(
            &[KitVoice::Ride, KitVoice::RideBell],
            JAM_REFERENCE_SR,
            0.05,
        ));
        let t = compile_with_kit(&cfg, bank).unwrap();
        assert!(is(slot_of(&t, 0, JamLane::Ride).unwrap().sound, KitVoice::Ride));
        assert!(
            is(slot_of(&t, 2, JamLane::Ride).unwrap().sound, KitVoice::RideBell),
            "a drummer does not get a second ride, so level 4 is the only way in"
        );

        // And a kit without one plays the ride, hard, rather than nothing.
        let t = compile(&cfg).unwrap();
        assert!(is(slot_of(&t, 2, JamLane::Ride).unwrap().sound, KitVoice::Ride));
    }

    // -----------------------------------------------------------------
    // Kits
    // -----------------------------------------------------------------

    #[test]
    fn every_kit_plays_its_own_drums() {
        // One of each lane, at each level that changes the voice.
        let mut cfg = rock_8ths();
        cfg.bar.kick = vec![1, 0, 0, 0, 0, 0, 0, 0];
        cfg.bar.snare = vec![0, 2, 1, 0, 0, 0, 0, 0];
        cfg.bar.hat = vec![0, 0, 0, 1, 0, 0, 0, 0];
        cfg.bar.ride = vec![0, 0, 0, 0, 1, 0, 0, 0];
        cfg.bar.crash = vec![0, 0, 0, 0, 0, 1, 0, 0];

        for name in ["room", "tight", "brushes", "electronic", "raw"] {
            let mut c = cfg.clone();
            c.kit = name.to_string();
            let t = compile(&c).unwrap();
            assert_eq!(t.kit, JamKit::from_name(name));
            assert_eq!(t.kit.name(), name);
            // And the drums really are that kit's, which is a claim about
            // the BANK the table carries rather than about a `SoundId` that
            // no longer names a kit at all.
            assert_eq!(t.kit_bank().id_name, name);
            let slot = |tick: u32| t.tick(tick, 0).unwrap().slots()[0];
            assert!(is(slot(0).sound, KitVoice::Kick), "{name} kick");
            assert!(is(slot(1).sound, KitVoice::Snare), "{name} accent");
            assert!(is(slot(2).sound, KitVoice::Snare), "{name} hit");
            assert_eq!(
                layer_of(slot(1).sound),
                Some(1),
                "{name}: an accent is the drum hit harder"
            );
            assert!(is(slot(3).sound, KitVoice::Hat), "{name} hat");
            assert!(is(slot(4).sound, KitVoice::Ride), "{name} ride");
            assert!(is(slot(5).sound, KitVoice::Crash), "{name} crash");
        }
    }

    /// A JAM SAVED BY A LATER BUILD STILL PLAYS.
    ///
    /// The kit is a free-form string on the record, and the record outlives
    /// the build that wrote it. An unknown name is "room" — the kit whose
    /// job is to sound like the app already sounds — and never an error: a
    /// jam that will not load because someone renamed a kit is a worse
    /// failure than a jam that loads with the default drums.
    #[test]
    fn an_unknown_kit_is_the_room_kit() {
        for (name, expected) in [
            ("", "room"),
            ("ROOM", "room"),
            (" Tight ", "tight"),
            ("vibraphone", "room"),
            ("808", "room"),
        ] {
            let mut cfg = rock_8ths();
            cfg.kit = name.to_string();
            let t = compile(&cfg).expect("an unknown kit must still compile");
            assert_eq!(t.kit.name(), expected, "kit {name:?}");
        }
    }

    /// ADDING A KIT IS ADDING A FOLDER, and the engine finds it by looking.
    ///
    /// Nothing names the five kits in Rust any more — `build.rs` walks
    /// `sounds/kits/*/kit.json`. This is what says the walk reached the
    /// config: a name in a jam finds the folder of the same name, and the
    /// index it resolves to is stable enough to be a cache key.
    #[test]
    fn the_kits_are_whatever_folders_are_there() {
        let ids = crate::kit::shipped_ids();
        for name in ids.iter() {
            let mut cfg = rock_8ths();
            cfg.kit = name.clone();
            let t = compile(&cfg).expect("a shipped kit compiles");
            assert_eq!(&t.kit.name(), name);
        }
        assert_eq!(JamKit::all().len(), ids.len());
    }

    /// Each kit gets its own normalisation, because each kit has its own
    /// worst tick: `brushes` and `electronic` do not sum to the same peak
    /// even playing identical notes.
    #[test]
    fn each_kit_is_normalised_on_its_own_peak() {
        let busy = |kit: &str| {
            let mut cfg = rock_8ths();
            cfg.kit = kit.to_string();
            cfg.intensity = 1.6;
            cfg.bar.kick = vec![2; 8];
            cfg.bar.snare = vec![2; 8];
            cfg.bar.hat = vec![2; 8];
            // The open hat is a lane of the pattern too, and it is the one
            // that RINGS — four ticks against the closed hat's nine tenths
            // of one — so a normalisation measured without it would be
            // measured on a quieter bar than the table can hold.
            cfg.bar.hat_open = vec![2; 8];
            cfg.bar.crash = vec![2; 8];
            compile(&cfg).unwrap()
        };
        let mut peaks = Vec::new();
        for kit in ["room", "tight", "brushes", "electronic", "raw"] {
            let t = busy(kit);
            assert!(
                t.peak_after <= JAM_SAFETY_CLAMP * 1.6 + 1e-2,
                "{kit} peaks at {:.3}, over the clamp",
                t.peak_after
            );
            assert!(
                t.peak_after > 0.5,
                "{kit} peaks at {:.3}, which is a whisper",
                t.peak_after
            );
            peaks.push(t.peak_before);
        }
        assert!(
            peaks.windows(2).any(|w| (w[0] - w[1]).abs() > 1e-3),
            "every kit measured the same worst tick ({peaks:?}); one kit is \
             being normalised against another's sounds"
        );
    }

    // -----------------------------------------------------------------
    // The bass
    // -----------------------------------------------------------------

    /// A 16-tick bar of nothing but the bass line handed in.
    fn with_bass(pitches: Vec<u8>) -> JamConfig {
        let n = pitches.len();
        JamConfig {
            ticks_per_beat: 4,
            beats_per_bar: 4,
            bar: JamPattern {
                hat_open: Vec::new(),
                kick: vec![0; n],
                snare: vec![0; n],
                hat: vec![0; n],
                ride: vec![0; n],
                crash: vec![0; n],
                ..Default::default()
            },
            fill: None,
            form_bars: 4,
            crash_on_one: false,
            intensity: 1.0,
            kit: "room".into(),
            bass: Some(JamBassLine { pitches, gain: 1.0, ..Default::default() }),
            practice: None,
            fill_every: None,
            keys: None,
            mix: None,
            count_in_sound: None,
            bass_voice: None,
            keys_voice: None,
            custom_kit: None,
            ..Default::default()
        }
    }

    fn bass_at(t: &JamTable, tick: u32) -> Option<JamSlot> {
        t.tick(tick, 0)
            .unwrap()
            .slots()
            .iter()
            .copied()
            .find(|s| s.lane == JamLane::Bass)
    }

    /// A NOTE STOPS WHEN THE NEXT ONE STARTS.
    ///
    /// The buffer is 450 ms long, which at anything under about 130 BPM is
    /// longer than a quarter note. Without the cap a walking line would
    /// sound all four of its notes at once — a chord, not a bass player.
    #[test]
    fn a_bass_note_rings_until_the_next_one() {
        let t = compile(&with_bass(vec![
            40, 0, 0, 0, 45, 0, 0, 0, 47, 0, 0, 0, 52, 0, 0, 0,
        ]))
        .unwrap();
        for tick in [0u32, 4, 8, 12] {
            let s = bass_at(&t, tick).unwrap_or_else(|| panic!("no bass on tick {tick}"));
            assert_eq!(s.cap_ticks, 4.0, "tick {tick} must ring one beat");
            assert!(!s.accent, "a bass note is never an accent");
        }
        for tick in [1u32, 2, 3, 5, 15] {
            assert!(bass_at(&t, tick).is_none(), "tick {tick} is a rest");
        }
    }

    /// A NOTE MAY BE SHORTER THAN THE GAP (2026-09-16). A detached funk or
    /// reggae note is a note followed by silence, and the old rule — ring
    /// until the next note — could not write it.
    #[test]
    fn a_bass_note_can_stop_before_the_next_one() {
        let mut cfg = with_bass(vec![40, 0, 0, 0, 45, 0, 0, 0, 47, 0, 0, 0, 52, 0, 0, 0]);
        let b = cfg.bass.as_mut().unwrap();
        b.lengths = vec![1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 9.0, 0.0, 0.0, 0.0, 2.5, 0.0, 0.0, 0.0];
        let t = compile(&cfg).unwrap();
        assert_eq!(bass_at(&t, 0).unwrap().cap_ticks, 1.0, "asked for one tick");
        assert_eq!(bass_at(&t, 4).unwrap().cap_ticks, 4.0, "0 is until the next note");
        assert_eq!(bass_at(&t, 8).unwrap().cap_ticks, 4.0, "longer than the gap is cut to it");
        assert_eq!(bass_at(&t, 12).unwrap().cap_ticks, 2.5, "fractions are allowed");
    }

    /// A NOTE MAY BE PLAYED SOFTER OR HARDER THAN THE LINE (2026-09-16).
    #[test]
    fn a_bass_note_carries_its_own_velocity() {
        let pitches = vec![40, 0, 0, 0, 45, 0, 0, 0, 47, 0, 0, 0, 52, 0, 0, 0];
        let plain = compile(&with_bass(pitches.clone())).unwrap();
        let mut cfg = with_bass(pitches);
        let b = cfg.bass.as_mut().unwrap();
        b.velocities = vec![1.2, 1.0, 1.0, 1.0, 0.5, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0, 1.0, f32::NAN, 1.0, 1.0, 1.0];
        let t = compile(&cfg).unwrap();
        let g = |table: &JamTable, tick| bass_at(table, tick).unwrap().gain;
        assert!((g(&t, 0) - g(&plain, 0) * 1.2).abs() < 1e-5, "accented");
        assert!((g(&t, 4) - g(&plain, 4) * 0.5).abs() < 1e-5, "ghosted");
        assert!(
            (g(&t, 8) - g(&plain, 8) * NOTE_VELOCITY_MIN).abs() < 1e-5,
            "0 is clamped up, not a silent note"
        );
        assert!((g(&t, 12) - g(&plain, 12)).abs() < 1e-5, "NaN is ignored");
    }

    /// The per-note arrays are empty or one per tick — a line of the wrong
    /// length is refused whole, like a pitch array of the wrong length.
    #[test]
    fn articulation_of_the_wrong_length_is_refused() {
        let mut cfg = with_bass(vec![40; 16]);
        cfg.bass.as_mut().unwrap().lengths = vec![1.0; 3];
        let err = compile(&cfg).unwrap_err();
        assert!(err.contains("bass.lengths"), "{err}");
        let mut cfg = with_bass(vec![40; 16]);
        cfg.bass.as_mut().unwrap().velocities = vec![1.0; 17];
        let err = compile(&cfg).unwrap_err();
        assert!(err.contains("bass.velocities"), "{err}");
    }

    /// A change of articulation is a change of sound, so the loudness memo
    /// must not hand back the measurement of the line without it.
    #[test]
    fn articulation_is_part_of_what_renders() {
        let bank = reference_bank("room").unwrap();
        let voices = JamVoices::default();
        let a = with_bass(vec![40; 16]);
        let mut b = a.clone();
        b.bass.as_mut().unwrap().lengths = vec![1.0; 16];
        let mut c = a.clone();
        c.bass.as_mut().unwrap().velocities = vec![0.5; 16];
        let sig = |cfg: &JamConfig| render_signature(cfg, &bank, None, &voices);
        assert_ne!(sig(&a), sig(&b));
        assert_ne!(sig(&a), sig(&c));
        // ...and it is still not part of what the drummer is: a new bass
        // articulation waits for the bar line like a new bass line.
        let dsig = |cfg: &JamConfig| drums_signature(cfg, &bank, None, &voices);
        assert_eq!(dsig(&a), dsig(&b));
    }

    /// ...OR THE END OF THE BAR, WHICHEVER COMES FIRST. A note with nothing
    /// after it must not run into the next bar's downbeat.
    #[test]
    fn the_last_bass_note_stops_at_the_bar_line() {
        let t = compile(&with_bass(vec![
            40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 45,
        ]))
        .unwrap();
        assert_eq!(
            bass_at(&t, 0).unwrap().cap_ticks,
            15.0,
            "a whole-bar note rings to the last tick and no further"
        );
        assert_eq!(
            bass_at(&t, 15).unwrap().cap_ticks,
            1.0,
            "a note on the last tick gets one tick"
        );
    }

    #[test]
    fn a_bass_rest_spawns_nothing_at_all() {
        let t = compile(&with_bass(vec![0; 16])).unwrap();
        for tick in 0..16 {
            assert_eq!(
                t.tick(tick, 0).unwrap().slots().len(),
                0,
                "tick {tick} of an all-rest bar"
            );
        }
    }

    /// The bass keeps walking while the drummer plays a fill. A fill bar
    /// with no bass under it is a hole in the music every chorus.
    #[test]
    fn the_bass_plays_through_the_fill() {
        let mut cfg = with_bass(vec![40, 0, 0, 0, 45, 0, 0, 0, 47, 0, 0, 0, 52, 0, 0, 0]);
        cfg.form_bars = 4;
        cfg.fill = Some(JamPattern {
            hat_open: Vec::new(),
            kick: vec![0; 16],
            snare: vec![2; 16],
            hat: vec![0; 16],
            ride: vec![0; 16],
            crash: vec![0; 16],
            ..Default::default()
        });
        let t = compile(&cfg).unwrap();
        let on_fill = t
            .tick(0, 3)
            .unwrap()
            .slots()
            .iter()
            .find(|s| s.lane == JamLane::Bass)
            .copied();
        assert_eq!(
            on_fill.map(|s| s.sound),
            Some(SoundId::Bass(BassVoice::Fingered, 40 - BASS_MIN_MIDI)),
            "the last bar of the chorus is the fill, and the bass plays it too"
        );
    }

    #[test]
    fn the_bass_pitch_becomes_the_right_note_of_the_bank() {
        let mut pitches = vec![0u8; 16];
        pitches[0] = BASS_MIN_MIDI;
        pitches[4] = BASS_MAX_MIDI;
        let t = compile(&with_bass(pitches)).unwrap();
        assert_eq!(
            bass_at(&t, 0).unwrap().sound,
            SoundId::Bass(BassVoice::Fingered, 0)
        );
        assert_eq!(
            bass_at(&t, 4).unwrap().sound,
            SoundId::Bass(BassVoice::Fingered, BASS_MAX_MIDI - BASS_MIN_MIDI)
        );
    }

    #[test]
    fn a_bass_line_that_is_not_this_bar_is_rejected_whole() {
        let mut cfg = with_bass(vec![40; 16]);
        cfg.bass = Some(JamBassLine {
            pitches: vec![40; 8],
            gain: 1.0,
            ..Default::default()
        });
        let err = compile(&cfg).expect_err("half a bar of bass must be rejected");
        assert!(err.contains("bass.pitches"), "{err}");
        assert!(
            err.contains('8'),
            "the message must say how many it had: {err}"
        );

        // And a note the bank does not hold.
        for bad in [1u8, BASS_MIN_MIDI - 1, BASS_MAX_MIDI + 1, 127] {
            let mut pitches = vec![0u8; 16];
            pitches[3] = bad;
            let cfg = with_bass(pitches);
            let err = compile(&cfg).unwrap_err();
            assert!(err.contains("tick 3"), "MIDI {bad}: {err}");
        }
    }

    #[test]
    fn the_bass_gain_is_clamped_rather_than_obeyed() {
        let gain_of = |gain: f32| {
            let mut pitches = vec![0u8; 16];
            pitches[0] = 40;
            let mut cfg = with_bass(pitches.clone());
            cfg.bass = Some(JamBassLine { pitches, gain, ..Default::default() });
            bass_at(&compile(&cfg).unwrap(), 0).unwrap().gain
        };
        assert_eq!(gain_of(0.01), gain_of(0.5), "clamped up to 0.5");
        assert_eq!(gain_of(99.0), gain_of(1.5), "clamped down to 1.5");
        assert!(
            gain_of(f32::NAN) > 0.0,
            "a NaN gain must not silence the bass"
        );
    }

    /// The bass is in the sum the normalisation measures. A root under a
    /// kick is two low-frequency transients on the same sample, which is
    /// exactly the pair most likely to clip.
    #[test]
    fn the_bass_counts_towards_the_worst_tick() {
        let mut cfg = with_bass(vec![40; 16]);
        // Ghosted drums, so the bass is the loudest thing on every tick and
        // the comparison does not hang on whether its root lands on the
        // same sample as a kick's ringing peak. (It did, once: with the
        // drums at accent, the bass's low note met the kick's overshoot
        // out of phase and the "with" peak came out a hair UNDER.)
        cfg.bar.kick = vec![3; 16];
        cfg.bar.snare = vec![3; 16];
        cfg.bar.crash = vec![3; 16];
        cfg.intensity = 1.6;
        let with = compile(&cfg).unwrap();
        cfg.bass = None;
        let without = compile(&cfg).unwrap();
        assert!(
            with.peak_before > without.peak_before,
            "the bass did not reach the meter: {:.3} with, {:.3} without",
            with.peak_before,
            without.peak_before
        );
        assert!(
            with.peak_after <= JAM_SAFETY_CLAMP * 1.6 + 1e-2,
            "a band with a bass peaks at {:.3}, over the clamp",
            with.peak_after
        );
    }

    // -----------------------------------------------------------------
    // The practice windows
    //
    // Ported case for case from `src/jam/practice.test.ts`. These two
    // implementations decide the same thing in two languages: the TypeScript
    // one draws the silence on the timeline a bar before it arrives, this
    // one plays it. If they ever disagree, the drawn band and the heard band
    // disagree, which is worse than having no timeline at all.
    // -----------------------------------------------------------------

    /// `overBars` from `practice.test.ts`: the band's state for a run of
    /// absolute bars, so a test can read the way the brief does —
    /// "bars 8-9 silent". Bar 0 is the first downbeat of the jam.
    fn over_bars(
        count: u32,
        form_bars: u32,
        practice: Option<&JamPracticeConfig>,
    ) -> Vec<JamBandState> {
        (0..count)
            .map(|bar| band_state_for_bar(bar % form_bars, form_bars, practice))
            .collect()
    }

    /// Which absolute bars came back with `state`.
    fn bars_where(states: &[JamBandState], state: JamBandState) -> Vec<u32> {
        states
            .iter()
            .enumerate()
            .filter(|(_, s)| **s == state)
            .map(|(i, _)| i as u32)
            .collect()
    }

    fn drop_out(every_bars: u32, bars: u32) -> JamPracticeConfig {
        JamPracticeConfig {
            drop_out: Some(JamDropOut { every_bars, bars }),
            trade: None,
        }
    }

    fn trade(band_bars: u32, you_bars: u32) -> JamPracticeConfig {
        JamPracticeConfig {
            drop_out: None,
            trade: Some(JamTrade {
                band_bars,
                you_bars,
            }),
        }
    }

    #[test]
    fn drop_out_goes_silent_for_bars_8_and_9_of_every_chorus() {
        // The fact from the brief, and the first case in practice.test.ts.
        // Phase-locked, so the silence falls on the same two bars of the
        // form every time round — which over a 12-bar blues means the same
        // two chords, every chorus.
        let p = drop_out(8, 2);
        let states = over_bars(36, 12, Some(&p));
        assert_eq!(
            bars_where(&states, JamBandState::Silent),
            vec![8, 9, 20, 21, 32, 33]
        );
        assert!(
            states[..8].iter().all(|s| *s == JamBandState::Full),
            "the band states the form before it takes anything away"
        );
    }

    #[test]
    fn drop_out_never_opens_on_bar_0_however_small_every_bars_is() {
        for every in [1u32, 2, 3, 4, 6] {
            let p = drop_out(every, 1);
            let states = over_bars(24, 12, Some(&p));
            assert_eq!(states[0], JamBandState::Full, "everyBars {every}, bar 0");
            assert_eq!(states[12], JamBandState::Full, "everyBars {every}, bar 12");
        }
    }

    #[test]
    fn drop_out_opens_at_every_multiple_and_lasts_as_long_as_asked() {
        let p = drop_out(4, 2);
        assert_eq!(
            bars_where(&over_bars(12, 12, Some(&p)), JamBandState::Silent),
            vec![4, 5, 8, 9]
        );
        let p = drop_out(8, 4);
        assert_eq!(
            bars_where(&over_bars(16, 16, Some(&p)), JamBandState::Silent),
            vec![8, 9, 10, 11]
        );
    }

    #[test]
    fn trading_gives_you_bars_4_to_7_and_brings_the_band_back_at_12() {
        let p = trade(4, 4);
        let states = over_bars(24, 12, Some(&p));
        assert_eq!(
            bars_where(&states, JamBandState::HatsOnly),
            vec![4, 5, 6, 7, 16, 17, 18, 19]
        );
        assert!(
            states[12..16].iter().all(|s| *s == JamBandState::Full),
            "a new chorus starts the cycle over, so bar 12 is the band's again"
        );
    }

    #[test]
    fn trading_always_starts_with_the_band() {
        for bars in [1u32, 2, 4, 8] {
            let p = trade(bars, bars);
            assert_eq!(
                over_bars(32, 16, Some(&p))[0],
                JamBandState::Full,
                "trading {bars}: you never open a chorus cold"
            );
        }
    }

    #[test]
    fn trading_does_twos_and_eights_and_uneven_pairs() {
        let p = trade(2, 2);
        assert_eq!(
            bars_where(&over_bars(8, 8, Some(&p)), JamBandState::HatsOnly),
            vec![2, 3, 6, 7]
        );
        let p = trade(8, 8);
        assert_eq!(
            bars_where(&over_bars(32, 32, Some(&p)), JamBandState::HatsOnly),
            vec![8, 9, 10, 11, 12, 13, 14, 15, 24, 25, 26, 27, 28, 29, 30, 31]
        );
        let p = trade(2, 4);
        assert_eq!(
            bars_where(&over_bars(12, 12, Some(&p)), JamBandState::HatsOnly),
            vec![2, 3, 4, 5, 8, 9, 10, 11]
        );
    }

    /// SILENCE WINS. It is the stronger instruction and the one that
    /// produces the honest score — nothing bleeds into the mic during it.
    #[test]
    fn drop_out_wins_the_bars_where_both_tools_apply() {
        let p = JamPracticeConfig {
            drop_out: Some(JamDropOut {
                every_bars: 4,
                bars: 2,
            }),
            trade: Some(JamTrade {
                band_bars: 4,
                you_bars: 4,
            }),
        };
        let states = over_bars(12, 12, Some(&p));
        assert_eq!(bars_where(&states, JamBandState::Silent), vec![4, 5, 8, 9]);
        // Bars 6-7 would have been yours; what is left of your four is hats.
        assert_eq!(states[6], JamBandState::HatsOnly);
        assert_eq!(states[7], JamBandState::HatsOnly);
    }

    #[test]
    fn the_band_with_nothing_switched_on_plays_every_bar() {
        assert!(over_bars(24, 12, None)
            .iter()
            .all(|s| *s == JamBandState::Full));
        let both_null = JamPracticeConfig {
            drop_out: None,
            trade: None,
        };
        assert!(over_bars(24, 12, Some(&both_null))
            .iter()
            .all(|s| *s == JamBandState::Full));
        // And a pair with a zero in it is off, the way `practiceConfigFrom`
        // reads it: dropping out for zero bars is not dropping out.
        for p in [drop_out(8, 0), drop_out(0, 2), trade(0, 4), trade(4, 0)] {
            assert!(
                over_bars(24, 12, Some(&p))
                    .iter()
                    .all(|s| *s == JamBandState::Full),
                "a window with a zero in it is off"
            );
        }
    }

    /// The table carries the whole chorus, worked out once, and it is the
    /// same list every chorus — which is what "phase-locked" means and what
    /// lets the timeline draw a silence before it arrives.
    #[test]
    fn the_table_carries_one_state_per_bar_of_the_chorus() {
        let mut cfg = rock_8ths();
        cfg.form_bars = 12;
        cfg.practice = Some(drop_out(8, 2));
        let t = compile(&cfg).unwrap();
        let drawn: Vec<JamBandState> = (0..12).map(|b| t.band_state(b)).collect();
        assert_eq!(
            drawn,
            vec![
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::Full,
                JamBandState::Silent,
                JamBandState::Silent,
                JamBandState::Full,
                JamBandState::Full,
            ]
        );
        // Out of range is a bounds check, not a panic on the audio thread.
        assert_eq!(t.band_state(12), JamBandState::Full);
        assert_eq!(t.band_state(u32::MAX), JamBandState::Full);

        // And no practice config at all is a band that plays every bar.
        let mut cfg = rock_8ths();
        cfg.form_bars = 12;
        let t = compile(&cfg).unwrap();
        assert!((0..12).all(|b| t.band_state(b) == JamBandState::Full));
    }

    /// The three words the UI reads off `BeatEvent.bandState`.
    #[test]
    fn the_band_state_serialises_the_way_the_contract_spells_it() {
        for (state, word) in [
            (JamBandState::Full, "\"full\""),
            (JamBandState::HatsOnly, "\"hatsOnly\""),
            (JamBandState::Silent, "\"silent\""),
        ] {
            assert_eq!(serde_json::to_string(&state).unwrap(), word);
        }
    }

    /// The second pass's half of the contract, deserialised: kit, bass and
    /// practice as the UI writes them — and an older jam that has none of
    /// them still loading.
    #[test]
    fn the_second_pass_fields_deserialise_from_the_contracts_camel_case() {
        let json = r#"{
            "ticksPerBeat": 2,
            "beatsPerBar": 4,
            "bar": {
              "kick":  [1,0,0,0,1,0,0,0],
              "snare": [0,0,2,0,0,0,2,0],
              "hat":   [1,3,1,3,1,3,1,3],
              "ride":  [0,0,0,0,0,0,0,0],
              "crash": [0,0,0,0,0,0,0,0]
            },
            "fill": null,
            "formBars": 12,
            "crashOnOne": true,
            "intensity": 1.0,
            "kit": "brushes",
            "bass": { "pitches": [40,0,0,0,45,0,0,0], "gain": 0.9 },
            "practice": {
              "dropOut": { "everyBars": 8, "bars": 2 },
              "trade": { "bandBars": 4, "youBars": 4 }
            }
        }"#;
        let cfg: JamConfig = serde_json::from_str(json).expect("the contract must deserialise");
        assert_eq!(cfg.kit, "brushes");
        let bass = cfg.bass.as_ref().expect("bass");
        assert_eq!(bass.pitches.len(), 8);
        assert!((bass.gain - 0.9).abs() < 1e-6);
        let practice = cfg.practice.as_ref().expect("practice");
        assert_eq!(
            practice.drop_out.map(|d| (d.every_bars, d.bars)),
            Some((8, 2))
        );
        assert_eq!(
            practice.trade.map(|t| (t.band_bars, t.you_bars)),
            Some((4, 4))
        );

        let t = compile(&cfg).unwrap();
        assert_eq!(t.kit.name(), "brushes");
        assert_eq!(t.band_state(0), JamBandState::Full);
        assert_eq!(t.band_state(4), JamBandState::HatsOnly);
        assert_eq!(t.band_state(8), JamBandState::Silent);

        // A jam written by the first pass — no `bass`, no `practice` — must
        // still load, because the store is full of them.
        let older = r#"{
            "ticksPerBeat": 2,
            "beatsPerBar": 4,
            "bar": {
              "kick":  [1,0,0,0,1,0,0,0],
              "snare": [0,0,2,0,0,0,2,0],
              "hat":   [1,3,1,3,1,3,1,3],
              "ride":  [0,0,0,0,0,0,0,0],
              "crash": [0,0,0,0,0,0,0,0]
            },
            "fill": null,
            "formBars": 12,
            "crashOnOne": true,
            "intensity": 1.0,
            "kit": "room"
        }"#;
        let cfg: JamConfig = serde_json::from_str(older).expect("an older jam must still load");
        assert!(cfg.bass.is_none());
        assert!(cfg.practice.is_none());
        assert!(cfg.fill_every.is_none());
        let t = compile(&cfg).unwrap();
        assert!((0..12).all(|b| t.band_state(b) == JamBandState::Full));
    }
    // -----------------------------------------------------------------
    // Your own kit — a folder of samples, lane by lane
    // -----------------------------------------------------------------

    /// A folder holding just these voices, at the reference rate, in short
    /// bursts — for the tests that ask which SOUND a lane resolved to.
    ///
    /// The tests that ask how LOUD it comes out use [`long_folder`], because
    /// a 50 ms burst cannot answer a question about ring-out.
    fn folder(voices: &[KitVoice]) -> Arc<KitBank> {
        Arc::new(KitBank::for_tests(voices, JAM_REFERENCE_SR, 0.05))
    }

    /// The same, with every voice at the cap — the longest drum a folder is
    /// allowed to hold, which is what the clamp has to survive.
    fn long_folder(voices: &[KitVoice], rate: u32) -> Arc<KitBank> {
        Arc::new(KitBank::for_tests(voices, rate, crate::kit::MAX_VOICE_SECS))
    }

    /// The whole slot a lane compiled to on tick `t` — gain and ring-out as
    /// well as which drum.
    fn slot_of(table: &JamTable, t: u32, lane: JamLane) -> Option<JamSlot> {
        table
            .tick(t, 0)
            .expect("in the bar")
            .slots()
            .iter()
            .find(|s| s.lane == lane)
            .copied()
    }

    /// Which drum a lane resolved to on tick `t`.
    fn lane_voice(table: &JamTable, t: u32, lane: JamLane) -> Option<KitVoice> {
        slot_of(table, t, lane).and_then(|s| drum(s.sound))
    }

    /// Which samples a lane resolved to on tick `t`, out of `bank`. The one
    /// way to say "that drum came from the folder and not from the kit
    /// behind it" now that both live in one bank.
    fn lane_samples<'a>(
        table: &JamTable,
        bank: &'a KitBank,
        t: u32,
        lane: JamLane,
    ) -> Option<&'a [f32]> {
        match slot_of(table, t, lane)?.sound {
            SoundId::Band { voice, layer, robin } => Some(bank.sample(voice, layer, robin)),
            _ => None,
        }
    }

    /// VOICE BY VOICE, NOT ALL OR NOTHING.
    ///
    /// The whole promise of B3 is that a folder with a kick and a snare in
    /// it is a real kit whose hats come from the built-in one — a musician
    /// with two good samples should get a band, not an error. So the
    /// fallback is per lane and happens where every other sound decision
    /// happens: when the table is compiled, on the command thread.
    #[test]
    fn voices_the_folder_lacks_come_from_the_built_in_kit() {
        let mut cfg = rock_8ths();
        cfg.kit = "tight".into();
        let own = folder(&[KitVoice::Kick, KitVoice::Snare]);
        let behind = reference_bank("tight").unwrap();
        let bank = crate::kit::with_fallback(&own, &behind);
        let t = compile_with_kit(&cfg, bank.clone()).unwrap();

        // Tick 0 is kick + hat; tick 2 is the snare accent.
        assert_eq!(
            lane_samples(&t, &bank, 0, JamLane::Kick),
            Some(own.sample(KitVoice::Kick as u8, 0, 0)),
            "the folder has a kick and the band should be playing it"
        );
        assert!(is(
            slot_of(&t, 2, JamLane::Snare).unwrap().sound,
            KitVoice::Snare
        ));
        // The hat is not in the folder, so it is the kit named in `kit` —
        // and `tight`, not `room`, because the config said so.
        assert_eq!(
            lane_samples(&t, &bank, 0, JamLane::Hat),
            Some(behind.sample(KitVoice::Hat as u8, 0, 0)),
            "the folder has no hat, so the hat comes from the built-in kit"
        );
        // And the table carries the drums, which is what lets the audio
        // thread answer `SoundId::Band` without a lock.
        assert_eq!(t.kit_bank().id, bank.id);
    }

    /// A SOFT SNARE IS A DIFFERENT RECORDING, AND HALF A PAIR IS A WHOLE
    /// PAIR.
    ///
    /// `snare_soft.wav` is the ghost and `snare.wav` the backbeat, which is
    /// two layers of one drum now rather than two voices. The rule that
    /// survives from the second pass is the one that matters from a chair: a
    /// folder that has only one of them uses it for both, because a folder
    /// that borrowed the app's ghost would be two snares that do not match —
    /// and would play the borrowed one on every groove in the library that
    /// writes its backbeat at level 1, which is most of them.
    ///
    /// The layer clamp in `resolve_voice` is what does it now, and it is the
    /// same clamp that makes a one-layer kit play every level.
    #[test]
    fn one_snare_in_a_folder_covers_the_backbeat_and_the_ghosts() {
        let mut cfg = rock_8ths();
        // A ghost, then the backbeat.
        cfg.bar.snare = vec![0, 3, 2, 0, 0, 3, 2, 0];

        // Two layers: the ghost is the soft one and the backbeat the hard.
        let both = Arc::new(KitBank::layered_for_tests(
            &[KitVoice::Snare],
            JAM_REFERENCE_SR,
            0.05,
            2,
            1,
        ));
        let t = compile_with_kit(&cfg, both).unwrap();
        assert_eq!(layer_of(slot_of(&t, 1, JamLane::Snare).unwrap().sound), Some(0));
        assert_eq!(layer_of(slot_of(&t, 2, JamLane::Snare).unwrap().sound), Some(1));

        // One layer: both strokes are it. Not silence, and not the app's.
        let one = folder(&[KitVoice::Snare]);
        let t = compile_with_kit(&cfg, one.clone()).unwrap();
        for tick in [1, 2] {
            assert_eq!(
                lane_samples(&t, &one, tick, JamLane::Snare),
                Some(one.sample(KitVoice::Snare as u8, 0, 0)),
                "tick {tick} did not play the folder's only snare"
            );
        }
        // And they are still different STROKES, because the level gain is
        // what a one-layer kit has left.
        let ghost = slot_of(&t, 1, JamLane::Snare).unwrap();
        let back = slot_of(&t, 2, JamLane::Snare).unwrap();
        assert!(ghost.gain < back.gain);
    }

    /// THE FOLDER A MUSICIAN ACTUALLY TRIES FIRST: A KICK AND A SNARE.
    ///
    /// Most of the library writes its backbeat at level 1 — a plain hit, not
    /// an accent. Before the second pass that resolved to a voice the folder
    /// did not have, so a folder holding `kick.wav` and `snare.wav` played
    /// the musician's kick against the app's snare on nearly every groove
    /// there is. The layer clamp is what keeps that fixed.
    #[test]
    fn a_kick_and_a_snare_in_a_folder_play_the_backbeat_of_an_unaccented_groove() {
        let mut cfg = rock_8ths();
        // The backbeat as most of the library writes it: level 1.
        cfg.bar.snare = vec![0, 0, 1, 0, 0, 0, 1, 0];
        let own = folder(&[KitVoice::Kick, KitVoice::Snare]);
        let bank = crate::kit::with_fallback(&own, &reference_bank("room").unwrap());
        let t = compile_with_kit(&cfg, bank.clone()).unwrap();
        assert_eq!(
            lane_samples(&t, &bank, 0, JamLane::Kick),
            Some(own.sample(KitVoice::Kick as u8, 0, 0))
        );
        assert_eq!(
            lane_samples(&t, &bank, 2, JamLane::Snare),
            Some(own.sample(KitVoice::Snare as u8, 0, 0)),
            "the backbeat of a level-1 groove came from the built-in kit, so the \
             folder's kick is playing against somebody else's snare"
        );
    }

    /// The crash on the one and the sticks count-in are drums too.
    ///
    /// The crash is built outside `slot_for` — it is not a lane of the
    /// pattern — so it is a place the folder could have been forgotten, and
    /// this is what says it was not.
    ///
    /// THE COUNT-IN USED TO BE HERE TOO AND IS DELIBERATELY NOT ANY MORE.
    /// It was the second half of this test and it asserted the opposite of
    /// what it now must: since the sticks became `sticks_low` out of the
    /// `SoundBank` they do not come from the folder, do not fall back
    /// through `with_fallback`, and do not change when the kit does. That
    /// claim is `sticks_are_the_click_banks_cross_stick_at_the_beat_gain`,
    /// which walks every kit to make it. What is asserted here instead is
    /// the narrow thing this test is the right place for: that swapping the
    /// folder moves the crash and leaves the count-in alone.
    #[test]
    fn the_crash_on_the_one_comes_from_the_folder_and_the_sticks_do_not() {
        let mut cfg = rock_8ths();
        cfg.crash_on_one = true;
        cfg.count_in_sound = Some(JamCountInSound::Sticks);
        let own = folder(&[KitVoice::Crash, KitVoice::Rim]);
        let bank = crate::kit::with_fallback(&own, &reference_bank("room").unwrap());
        let t = compile_with_kit(&cfg, bank.clone()).unwrap();
        let samples = |slot: Option<JamSlot>| match slot?.sound {
            SoundId::Band { voice, layer, robin } => Some(bank.sample(voice, layer, robin)),
            _ => None,
        };
        assert_eq!(
            samples(t.crash_on_one()),
            Some(own.sample(KitVoice::Crash as u8, 0, 0))
        );
        assert_eq!(
            t.count_in_slot().map(|s| s.sound),
            Some(SoundId::SticksLow),
            "the count-in is the metronome's own cross-stick"
        );

        // And without them in the folder, the crash is the built-in kit's —
        // while the count-in is the same file it was a moment ago, which is
        // the whole of what changed.
        let behind = reference_bank("room").unwrap();
        let bare = crate::kit::with_fallback(&folder(&[KitVoice::Kick]), &behind);
        let t = compile_with_kit(&cfg, bare.clone()).unwrap();
        let samples = |slot: Option<JamSlot>| match slot?.sound {
            SoundId::Band { voice, layer, robin } => Some(bare.sample(voice, layer, robin)),
            _ => None,
        };
        assert_eq!(
            samples(t.crash_on_one()),
            Some(behind.sample(KitVoice::Crash as u8, 0, 0))
        );
        assert_eq!(t.count_in_slot().map(|s| s.sound), Some(SoundId::SticksLow));
    }

    /// A COUNT-IN IS STICKS, WHATEVER THE GROOVE SAYS ITS GHOSTS ARE.
    ///
    /// The cross-stick became reachable from the snare lane (`snareGhostIsRim`),
    /// and the count-in no longer reaches for that drum at all: it is
    /// `sticks_low` out of the `SoundBank`, at the beat gain, outside the
    /// intensity, the mix and the clamp. A count-in nobody can hear because
    /// the drums were mixed down is a bug, not a balance — and it is now a
    /// bug that cannot happen, because the mix has nothing to multiply.
    #[test]
    fn the_sticks_are_not_moved_by_the_mix_or_the_groove() {
        let mut cfg = rock_8ths();
        cfg.count_in_sound = Some(JamCountInSound::Sticks);
        cfg.mix = Some(JamMix {
            drums: 0.2,
            ..JamMix::default()
        });
        cfg.intensity = 0.6;
        let t = compile(&cfg).unwrap();
        let slot = t.count_in_slot().expect("a sticks count-in");
        assert_eq!(
            slot.sound,
            SoundId::SticksLow,
            "the count-in is the metronome's cross-stick"
        );
        assert!(
            (slot.gain - crate::engine::BEAT_GAIN).abs() < 1e-5,
            "the count-in came out at {} and the beat gain is {}",
            slot.gain,
            crate::engine::BEAT_GAIN
        );
        assert!(!slot.accent);
    }

    /// CHANGING THE KIT IS A DIAL, SO IT PLAYS NOW.
    ///
    /// The bar-ahead handshake holds a new table back to the bar line when
    /// only the bass and the keys moved. A different folder — or the same
    /// folder after the musician replaced a file in it — is not that: it is
    /// the drummer changing, and it has to be heard on the next tick.
    #[test]
    fn a_change_of_folder_is_a_change_of_drummer() {
        let cfg = rock_8ths();
        let a = compile_with_kit(&cfg, folder(&[KitVoice::Kick])).unwrap();
        let b = compile_with_kit(&cfg, folder(&[KitVoice::Kick])).unwrap();
        let none = compile(&cfg).unwrap();
        assert_ne!(
            a.drums_signature, b.drums_signature,
            "two decodes of a folder are two drummers, because either could be a \
             file the musician just replaced"
        );
        assert_ne!(a.drums_signature, none.drums_signature);
        assert!(!swap_defers(Some(&a), Some(&b), true, false));
        assert!(!swap_defers(Some(&a), Some(&none), true, false));

        // The SAME decode twice over is the same drummer, which is what the
        // cache turns a chorus of bar-ahead sends into.
        let one = folder(&[KitVoice::Kick]);
        let c = compile_with_kit(&cfg, one.clone()).unwrap();
        let d = compile_with_kit(&cfg, one).unwrap();
        assert_eq!(c.drums_signature, d.drums_signature);
    }

    /// A table on somebody else's samples is normalised like any other.
    ///
    /// It has to be: the ceiling exists so that a kick, a snare accent and a
    /// crash landing together do not clip, and a folder of hot samples is
    /// exactly the case where they would. `worst_bar_peak` renders the
    /// folder's own buffers for this, which is why it takes the bank.
    #[test]
    fn a_custom_kit_is_held_under_the_ceiling_like_every_other() {
        let mut cfg = rock_8ths();
        cfg.intensity = 1.6;
        cfg.crash_on_one = true;
        // Every lane on every tick: the loudest thing the table can hold.
        cfg.bar.kick = vec![2; 8];
        cfg.bar.snare = vec![2; 8];
        cfg.bar.hat = vec![2; 8];
        let t = compile_with_kit(
            &cfg,
            folder(&[
                KitVoice::Kick,
                KitVoice::Snare,
                KitVoice::Hat,
                KitVoice::Crash,
            ]),
        )
        .unwrap();
        assert!(
            t.peak_after <= JAM_SAFETY_CLAMP * cfg.intensity + 1e-2,
            "a custom kit renders {} after the clamp, over it",
            t.peak_after
        );
        assert!(t.peak_after > 0.0, "and it is not silent");
    }

    /// THE SAME, WITH THE LONGEST DRUMS A FOLDER IS ALLOWED TO HOLD.
    ///
    /// The test above ran on 50 ms bursts, and 50 ms cannot answer the
    /// question the ceiling is about. `kit::MAX_VOICE_SECS` is two seconds —
    /// nearly three times the longest voice this app ships (`brushes`'
    /// 700 ms crash) — and the kick, the snare and the crash are not capped
    /// at all, so at the fastest tick the engine can produce each of them
    /// keeps forty copies of a two-second sample alive out of one lane. That
    /// is the case `JAM_SAFETY_CLAMP` was
    /// never measured against, and it is the one a musician with a sample
    /// pack of real cymbals actually loads.
    ///
    /// Every lane accented on every tick, at the loudest intensity, with the
    /// crash on the one over the top of it.
    #[test]
    fn a_folder_of_two_second_drums_is_held_under_the_ceiling() {
        let mut cfg = rock_8ths();
        cfg.ticks_per_beat = 4;
        cfg.intensity = 1.6;
        cfg.crash_on_one = true;
        cfg.bar.kick = vec![2; 16];
        cfg.bar.snare = vec![2; 16];
        cfg.bar.hat = vec![2; 16];
        cfg.bar.hat_open = vec![2; 16];
        cfg.bar.ride = vec![2; 16];
        cfg.bar.crash = vec![0; 16];
        let bank = long_folder(&KitVoice::ALL, JAM_REFERENCE_SR);
        let t = compile_with_kit(&cfg, bank).unwrap();
        assert!(
            t.peak_after <= JAM_SAFETY_CLAMP * cfg.intensity + 1e-2,
            "eleven three-second drums render {} after the clamp, over it",
            t.peak_after
        );
        assert!(t.peak_after > 0.0, "and it is not silent");
        // And the normalisation actually had to WORK: a fixture this dense
        // that came out unscaled would mean the render never saw the tails,
        // which is the bug this test exists for.
        assert!(
            t.base_peak > JAM_SAFETY_CLAMP,
            "eleven three-second drums on every tick rendered {} before the clamp, \
             which is under it — the ring-out is not being measured",
            t.base_peak
        );
    }

    /// A FOLDER IS MEASURED AT THE RATE IT WAS DECODED AT.
    ///
    /// `worst_bar_peak` renders at `JAM_REFERENCE_SR`, and the shipped banks
    /// are at that rate too, so for years the render could walk a buffer one
    /// sample at a time. A folder is not: it is decoded at whatever rate the
    /// device opened at. Walked one for one, a 96 kHz folder renders every
    /// drum at half speed and twice the length — twice the ring-out to
    /// stack, and `cap_ticks` cutting a hat at half the musical time it
    /// names — and a 44.1 kHz one renders sharp and short.
    ///
    /// The fixture is the same drums in real time at three rates, so the
    /// measurement has to come out the same. It does not have to come out
    /// EXACTLY the same — nearest neighbour resampling and the rates not
    /// dividing evenly are both real — but a 2:1 error in every duration is
    /// not a rounding difference, and that is the size of the bug.
    #[test]
    fn a_custom_kit_measures_the_same_at_every_device_rate() {
        let mut cfg = rock_8ths();
        cfg.ticks_per_beat = 4;
        cfg.bar.kick = vec![2, 0, 0, 1, 1, 0, 1, 0, 2, 0, 0, 1, 1, 0, 1, 0];
        cfg.bar.snare = vec![0, 0, 3, 0, 2, 0, 0, 3, 0, 3, 0, 0, 2, 0, 3, 1];
        cfg.bar.hat = vec![1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3];
        cfg.bar.hat_open = vec![0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1];
        cfg.bar.ride = vec![0; 16];
        cfg.bar.crash = vec![0; 16];

        let voices = [
            KitVoice::Kick,
            KitVoice::Snare,
            KitVoice::Hat,
            KitVoice::HatOpen,
        ];
        let at = |rate: u32| {
            compile_with_kit(&cfg, long_folder(&voices, rate))
                .unwrap()
                .base_peak
        };
        let reference = at(JAM_REFERENCE_SR);
        assert!(reference > 0.0, "the reference render is silent");
        for rate in [44_100u32, 88_200, 96_000] {
            let got = at(rate);
            let ratio = got / reference;
            assert!(
                (0.9..=1.1).contains(&ratio),
                "the same drums decoded at {rate} Hz measure {got:.4} against \
                 {reference:.4} at {JAM_REFERENCE_SR} Hz — a factor of {ratio:.3}, \
                 so the render is walking the folder at the wrong speed"
            );
        }
    }

    // -----------------------------------------------------------------
    // The open hat — its own row
    // -----------------------------------------------------------------

    /// The open hat is its own DRUM, not a louder closed one.
    #[test]
    fn the_open_hat_lane_plays_the_open_hat() {
        let mut cfg = rock_8ths();
        cfg.bar.hat_open = vec![0, 1, 0, 0, 0, 0, 0, 2];
        let t = compile(&cfg).unwrap();

        assert_eq!(lane_voice(&t, 1, JamLane::HatOpen), Some(KitVoice::HatOpen));
        assert_eq!(lane_voice(&t, 7, JamLane::HatOpen), Some(KitVoice::HatOpen));
        // The closed hat is untouched on those ticks: two rows, two drums,
        // and a groove can play both at once.
        assert_eq!(lane_voice(&t, 1, JamLane::Hat), Some(KitVoice::Hat));
        assert!(lane_voice(&t, 0, JamLane::HatOpen).is_none());

        // It rings like a ride and not like a closed hat — a wash that
        // carries into the next tick is the whole reason the row exists.
        let open = slot_of(&t, 1, JamLane::HatOpen).unwrap();
        let closed = slot_of(&t, 1, JamLane::Hat).unwrap();
        assert!(
            open.cap_ticks > closed.cap_ticks,
            "the open hat is capped at {} ticks and the closed one at {}",
            open.cap_ticks,
            closed.cap_ticks
        );
        assert_eq!(open.cap_ticks, HAT_OPEN_CAP_TICKS);
    }

    /// A PATTERN SAVED BEFORE THE ROW EXISTED STILL PLAYS.
    ///
    /// Every jam in the library, and every jam anybody has written, was
    /// saved without `hatOpen`. Absent has to mean "no open hat", not "a
    /// malformed bar" — which is what the length check would have made it.
    #[test]
    fn a_pattern_with_no_open_hat_row_is_a_pattern_and_not_an_error() {
        let cfg = rock_8ths();
        assert!(cfg.bar.hat_open.is_empty());
        let t = compile(&cfg).unwrap();
        for tick in 0..8 {
            assert!(
                lane_voice(&t, tick, JamLane::HatOpen).is_none(),
                "tick {tick} grew an open hat out of an absent row"
            );
        }

        // And it really is absent rather than defaulted to zeroes by the
        // caller: serde has to fill it in, because the UI does not send it.
        let json = r#"{
            "ticksPerBeat": 2, "beatsPerBar": 4,
            "bar": { "kick": [1,0,0,0,1,0,0,0], "snare": [0,0,2,0,0,0,2,0],
                     "hat": [1,1,1,1,1,1,1,1], "ride": [0,0,0,0,0,0,0,0],
                     "crash": [0,0,0,0,0,0,0,0] },
            "fill": null, "formBars": 4, "crashOnOne": false,
            "intensity": 1.0, "kit": "room"
        }"#;
        let parsed: JamConfig = serde_json::from_str(json).expect("a jam saved before the row");
        assert!(parsed.bar.hat_open.is_empty());
        assert!(compile(&parsed).is_ok());

        // And an explicit null reads the same way, rather than taking the
        // whole band away over an empty row.
        let nulled = json.replace(
            r#""crash": [0,0,0,0,0,0,0,0] }"#,
            r#""crash": [0,0,0,0,0,0,0,0], "hatOpen": null }"#,
        );
        assert_ne!(nulled, json, "the fixture stopped containing what it patches");
        let parsed: JamConfig = serde_json::from_str(&nulled).expect("a null row is no row");
        assert!(parsed.bar.hat_open.is_empty());
        assert!(compile(&parsed).is_ok());
    }

    /// Sent at all, the row is a whole bar. Half a lane is a caller's bug
    /// and is refused with a sentence, like every other malformed row.
    #[test]
    fn half_an_open_hat_row_is_refused_like_any_other_lane() {
        let mut cfg = rock_8ths();
        cfg.bar.hat_open = vec![1, 0, 0];
        let err = compile(&cfg).expect_err("three cells is not a bar of eight");
        assert!(
            err.contains("hatOpen") && err.contains("3 cells"),
            "the message has to name the row and the length: {err:?}"
        );
    }

    /// The folder's open hat wins, and a folder without one borrows the
    /// built-in kit's — the same rule every other lane follows.
    #[test]
    fn the_open_hat_comes_from_the_folder_when_the_folder_has_one() {
        let mut cfg = rock_8ths();
        cfg.kit = "tight".into();
        cfg.bar.hat_open = vec![0, 1, 0, 0, 0, 1, 0, 0];

        let own = folder(&[KitVoice::HatOpen]);
        let behind = reference_bank("tight").unwrap();
        let mine = crate::kit::with_fallback(&own, &behind);
        let t = compile_with_kit(&cfg, mine.clone()).unwrap();
        assert_eq!(
            lane_samples(&t, &mine, 1, JamLane::HatOpen),
            Some(own.sample(KitVoice::HatOpen as u8, 0, 0))
        );

        let bare = crate::kit::with_fallback(&folder(&[KitVoice::Kick]), &behind);
        let t = compile_with_kit(&cfg, bare.clone()).unwrap();
        assert_eq!(
            lane_samples(&t, &bare, 1, JamLane::HatOpen),
            Some(behind.sample(KitVoice::HatOpen as u8, 0, 0))
        );
    }

    /// Changing the open-hat row is the drummer changing, so it plays now
    /// rather than waiting for the bar line — and it is a different render,
    /// so the gain memo must not hand one row's measurement to the other.
    #[test]
    fn an_open_hat_edit_is_a_new_drummer_and_a_new_measurement() {
        let a = rock_8ths();
        let mut b = a.clone();
        b.bar.hat_open = vec![0, 0, 0, 1, 0, 0, 0, 1];

        let ta = compile(&a).unwrap();
        let tb = compile(&b).unwrap();
        assert_ne!(ta.drums_signature, tb.drums_signature);
        assert!(!swap_defers(Some(&ta), Some(&tb), true, false));
        let bank = reference_bank("room").unwrap();
        let none = JamVoices::default();
        assert_ne!(
            render_signature(&a, &bank, None, &none),
            render_signature(&b, &bank, None, &none)
        );
    }

    /// The voices are chosen when the table is compiled, and the config's
    /// spelling never reaches the audio thread.
    #[test]
    fn the_voice_names_become_sounds_at_compile_time() {
        let mut cfg = with_bass(vec![40; 16]);
        cfg.bass_voice = Some("SLAP".into());
        let t = compile(&cfg).unwrap();
        assert_eq!(
            bass_at(&t, 0).unwrap().sound,
            SoundId::Bass(BassVoice::Slap, 40 - BASS_MIN_MIDI),
            "case is ignored, because a hand-edited store is a real thing"
        );

        // A name from a later build is the voice this one shipped with,
        // never an error: a jam saved by a newer Yames still plays.
        cfg.bass_voice = Some("theremin".into());
        let t = compile(&cfg).unwrap();
        assert_eq!(
            bass_at(&t, 0).unwrap().sound,
            SoundId::Bass(BassVoice::Fingered, 40 - BASS_MIN_MIDI)
        );

        // And a jam that names no voice at all is the one the first pass
        // shipped, which is what keeps every saved jam sounding the same.
        cfg.bass_voice = None;
        let t = compile(&cfg).unwrap();
        assert_eq!(
            bass_at(&t, 0).unwrap().sound,
            SoundId::Bass(BassVoice::Fingered, 40 - BASS_MIN_MIDI)
        );
    }

    /// Changing who is playing is a dial too, for the reason a kit is.
    #[test]
    fn a_change_of_voice_plays_now_and_is_measured_separately() {
        let mut a = with_bass(vec![40; 16]);
        a.bass_voice = Some("fingered".into());
        let mut b = a.clone();
        b.bass_voice = Some("upright".into());

        let ta = compile(&a).unwrap();
        let tb = compile(&b).unwrap();
        assert_ne!(ta.drums_signature, tb.drums_signature);
        assert!(!swap_defers(Some(&ta), Some(&tb), true, false));
        // And the memo must not hand one voice's measurement to the other:
        // an upright is trimmed UP and a slap down, so sharing a peak would
        // put one of them through the ceiling.
        assert_ne!(render_signature(&a, &reference_bank("room").unwrap(), None, &JamVoices::default()), render_signature(&b, &reference_bank("room").unwrap(), None, &JamVoices::default()));
    }
}

// ---------------------------------------------------------------------------
// Tests — moving through the form, fills every N bars, and the gain memo
// ---------------------------------------------------------------------------

#[cfg(test)]
mod form_tests {
    use super::*;

    /// See `compile_synth`: these tests were written against the recipes.
    fn compile(cfg: &JamConfig) -> Result<JamTable, String> {
        super::compile_synth(cfg)
    }

    fn twelve_bar() -> JamConfig {
        let z = vec![0u8; 8];
        JamConfig {
            ticks_per_beat: 2,
            beats_per_bar: 4,
            bar: JamPattern {
                hat_open: Vec::new(),
                kick: vec![1, 0, 0, 0, 1, 0, 0, 0],
                snare: vec![0, 0, 2, 0, 0, 0, 2, 0],
                hat: vec![1, 3, 1, 3, 1, 3, 1, 3],
                ride: z.clone(),
                crash: z.clone(),
                ..Default::default()
            },
            // A fill nobody could mistake for the groove: no kick at all.
            fill: Some(JamPattern {
                hat_open: Vec::new(),
                kick: z.clone(),
                snare: vec![2, 1, 2, 1, 2, 1, 2, 1],
                hat: z.clone(),
                ride: z.clone(),
                crash: z,
                ..Default::default()
            }),
            form_bars: 12,
            crash_on_one: false,
            intensity: 1.0,
            kit: "room".into(),
            bass: None,
            practice: None,
            fill_every: None,
            keys: None,
            mix: None,
            count_in_sound: None,
            bass_voice: None,
            keys_voice: None,
            custom_kit: None,
            ..Default::default()
        }
    }

    fn cmd(jump_to: Option<u32>, loop_bars: Option<(u32, u32)>) -> JamPositionCommand {
        JamPositionCommand {
            jump_to,
            loop_bars: loop_bars.map(|(start, end)| JamLoop { start, end }),
        }
    }

    // ---- The command, and what it is checked against ----

    #[test]
    fn a_bar_the_form_has_is_accepted_and_one_it_does_not_is_refused() {
        let form = Some(12);
        assert_eq!(
            validate_position(&cmd(Some(11), None), form).unwrap(),
            JamPosition {
                jump: Some(11),
                loop_bars: None
            }
        );
        let refused = validate_position(&cmd(Some(12), None), form).unwrap_err();
        assert!(
            refused.contains("13") && refused.contains("12 bars"),
            "the message has to name the bar and the form: {refused}"
        );
    }

    #[test]
    fn a_loop_has_to_fit_the_form_and_point_forwards() {
        let form = Some(12);
        assert_eq!(
            validate_position(&cmd(None, Some((4, 7))), form).unwrap(),
            JamPosition {
                jump: None,
                loop_bars: Some((4, 7))
            }
        );
        assert!(
            validate_position(&cmd(None, Some((0, 11))), form).is_ok(),
            "the whole form is a legal loop"
        );
        assert!(validate_position(&cmd(None, Some((8, 12))), form)
            .unwrap_err()
            .contains("13"));
        let backwards = validate_position(&cmd(None, Some((7, 4))), form).unwrap_err();
        assert!(
            backwards.contains("cannot be after"),
            "a loop that ends before it starts says so: {backwards}"
        );
    }

    #[test]
    fn a_move_with_no_band_is_kept_rather_than_refused() {
        // Nothing to check it against, so nothing is refused: the UI may set
        // a loop before it loads a jam, and the order two commands happen to
        // arrive in must not decide whether the loop survives.
        let far = validate_position(&cmd(Some(40), Some((30, 39))), None).unwrap();
        assert_eq!(far.jump, Some(40));
        assert_eq!(far.loop_bars, Some((30, 39)));
        // ...and the table it lands on is what actually decides.
        assert_eq!(far.for_table(Some(12)), JamPosition::default());
        // A backwards loop is refused even with no band: it is not a
        // question about the form.
        assert!(validate_position(&cmd(None, Some((9, 2))), None).is_err());
    }

    #[test]
    fn a_new_table_drops_the_jump_and_keeps_a_loop_that_still_fits() {
        let pending = JamPosition {
            jump: Some(3),
            loop_bars: Some((4, 7)),
        };
        // Same twelve bars: the loop is still the turnaround the musician
        // set, and the jump is stale by the time the table lands.
        assert_eq!(
            pending.for_table(Some(12)),
            JamPosition {
                jump: None,
                loop_bars: Some((4, 7))
            }
        );
        // A seven-bar form has no bar 8 for the loop to end on.
        assert_eq!(pending.for_table(Some(7)), JamPosition::default());
        // Exactly long enough is long enough: bars 5-8 of an eight-bar loop
        // are the eight-bar loop's second half, and they exist.
        assert_eq!(
            pending.for_table(Some(8)).loop_bars,
            Some((4, 7)),
            "bar 8 of an eight-bar form is the last one, not one too many"
        );
        // The band going away leaves the loop for the next one.
        assert_eq!(pending.for_table(None).loop_bars, Some((4, 7)));
        assert_eq!(pending.for_table(None).jump, None);
    }

    #[test]
    fn the_contract_camel_case_reaches_the_position() {
        let c: JamPositionCommand =
            serde_json::from_str(r#"{"jumpTo":7,"loop":{"start":4,"end":11}}"#).unwrap();
        assert_eq!(c.jump_to, Some(7));
        let p = validate_position(&c, Some(12)).unwrap();
        assert_eq!(p.loop_bars, Some((4, 11)));
        // Both halves nullable, and both null is "no jump, no loop".
        let cleared: JamPositionCommand =
            serde_json::from_str(r#"{"jumpTo":null,"loop":null}"#).unwrap();
        assert_eq!(
            validate_position(&cleared, Some(12)).unwrap(),
            JamPosition::default()
        );
    }

    // ---- Fills every N bars ----

    #[test]
    fn a_fill_every_four_lands_on_bars_four_eight_and_twelve() {
        let mut cfg = twelve_bar();
        cfg.fill_every = Some(4);
        let t = compile(&cfg).unwrap();
        let counted: Vec<u32> = (0..12).filter(|&b| t.fill_bar(b)).map(|b| b + 1).collect();
        assert_eq!(counted, vec![4, 8, 12], "as a drummer counts the bars");

        // And it really is the fill that plays there, not the groove: the
        // fill has no kick and the groove opens with one.
        let kick = |bar: u32| {
            t.tick(0, bar)
                .unwrap()
                .slots()
                .iter()
                .any(|s| s.lane == JamLane::Kick)
        };
        assert!(kick(0) && kick(1) && kick(2), "bars 1-3 are the groove");
        assert!(!kick(3), "bar 4 is the fill");
        assert!(kick(4), "bar 5 is the groove again");
    }

    #[test]
    fn a_fill_every_eight_still_fills_the_end_of_the_chorus() {
        let mut cfg = twelve_bar();
        cfg.fill_every = Some(8);
        let t = compile(&cfg).unwrap();
        let counted: Vec<u32> = (0..12).filter(|&b| t.fill_bar(b)).map(|b| b + 1).collect();
        assert_eq!(
            counted,
            vec![8, 12],
            "the last bar of the chorus is a fill whatever fillEvery says"
        );
    }

    #[test]
    fn no_fill_every_is_the_end_of_the_chorus_and_nothing_else() {
        let t = compile(&twelve_bar()).unwrap();
        let counted: Vec<u32> = (0..12).filter(|&b| t.fill_bar(b)).map(|b| b + 1).collect();
        assert_eq!(counted, vec![12]);
    }

    #[test]
    fn a_fill_every_the_ui_does_not_offer_is_refused() {
        for every in [1u32, 2, 3, 5, 6, 7, 9, 16] {
            let mut cfg = twelve_bar();
            cfg.fill_every = Some(every);
            let e = compile(&cfg).unwrap_err();
            assert!(
                e.contains("fillEvery") && e.contains("4 or 8"),
                "{every} should be refused with a message that says what is \
                 allowed: {e}"
            );
        }
        for every in [0u32, 4, 8] {
            let mut cfg = twelve_bar();
            cfg.fill_every = Some(every);
            assert!(compile(&cfg).is_ok(), "fillEvery {every} is on the list");
        }
    }

    #[test]
    fn turning_fills_up_is_a_change_the_drummer_makes_now() {
        // Where the fill lands is not a bass change, so it must not be held
        // to the next bar line the way the bar-ahead bass is.
        let a = compile(&twelve_bar()).unwrap();
        let mut moved = twelve_bar();
        moved.fill_every = Some(4);
        let b = compile(&moved).unwrap();
        assert!(!swap_defers(Some(&a), Some(&b), true, false));
    }

    // ---- The normalisation memo ----

    fn walking(pitches: Vec<u8>) -> JamConfig {
        let mut cfg = twelve_bar();
        cfg.bass = Some(JamBassLine {
            pitches,
            gain: 1.0,
            ..Default::default()
        });
        cfg
    }

    /// THE BAR-AHEAD BASS, ROUND AND ROUND.
    ///
    /// The traffic the memo exists for: the UI walks the same few bass bars
    /// round the form, once per chorus, for as long as the jam plays. The
    /// first time round measures each of them; from the second on, nothing
    /// is measured at all.
    #[test]
    fn the_bass_bars_of_a_form_are_measured_once_each_and_never_again() {
        let cache = JamGainCache::new();
        // E1 to G3 is the bass's range, and these stay inside it.
        let chords: Vec<Vec<u8>> = vec![
            vec![40, 0, 45, 0, 47, 0, 52, 0],
            vec![45, 0, 50, 0, 52, 0, 33, 0],
            vec![35, 0, 40, 0, 42, 0, 47, 0],
            vec![40, 0, 47, 0, 45, 0, 40, 0],
        ];
        let first: Vec<f32> = chords
            .iter()
            .map(|p| compile_with(&walking(p.clone()), &cache, reference_bank("room").unwrap(), None, JamVoices::default()).unwrap().base_peak)
            .collect();
        // Every one of them is the number a cold compile would produce.
        for (p, want) in chords.iter().zip(&first) {
            assert_eq!(compile(&walking(p.clone())).unwrap().base_peak, *want);
        }
        // Second chorus: the same four bars, and the memo has all of them.
        for (p, want) in chords.iter().zip(&first) {
            let again = compile_with(&walking(p.clone()), &cache, reference_bank("room").unwrap(), None, JamVoices::default()).unwrap();
            assert_eq!(again.base_peak, *want);
            assert!(cache.get(render_signature(&walking(p.clone()), &reference_bank("room").unwrap(), None, &JamVoices::default())).is_some());
        }
    }

    /// A DIFFERENT BASS IS A DIFFERENT MEASUREMENT.
    ///
    /// The tempting version of this memo keys on the drums alone and lets a
    /// changed bass line share the answer. It does not hold: on the jitter
    /// probe's groove, the same drums with the bass at 0.5 render 2.08 and
    /// at 1.5 render 2.95 — 42% — and normalising the loud one against the
    /// quiet one's number puts the room kit at 1.075 at full volume, which
    /// is the mixer clamping. `the_gain_cache_never_lets_a_changed_bass_
    /// reach_the_clamp` in `engine.rs` is the rendered half of this claim;
    /// this is the arithmetic half.
    #[test]
    fn a_bass_the_memo_has_not_seen_is_measured_rather_than_guessed() {
        let quiet = {
            let mut c = walking(vec![40, 0, 0, 0, 0, 0, 0, 0]);
            c.bass.as_mut().unwrap().gain = 0.5;
            c
        };
        let loud = {
            let mut c = walking(vec![40, 0, 45, 0, 47, 0, 52, 0]);
            c.bass.as_mut().unwrap().gain = 1.5;
            c
        };
        assert_ne!(
            render_signature(&quiet, &reference_bank("room").unwrap(), None, &JamVoices::default()),
            render_signature(&loud, &reference_bank("room").unwrap(), None, &JamVoices::default()),
            "the bass has to be in the key, or the loud table borrows the \
             quiet one's headroom"
        );
        // The drums, though, are the same drummer — which is a different
        // question, and the one the bar-line deferral asks.
        assert_eq!(drums_signature(&quiet, &reference_bank("room").unwrap(), None, &JamVoices::default()), drums_signature(&loud, &reference_bank("room").unwrap(), None, &JamVoices::default()));

        let cache = JamGainCache::new();
        let measured = compile_with(&quiet, &cache, reference_bank("room").unwrap(), None, JamVoices::default()).unwrap();
        let after = compile_with(&loud, &cache, reference_bank("room").unwrap(), None, JamVoices::default()).unwrap();
        assert!(
            after.base_peak > measured.base_peak,
            "a bass three times as loud is louder, and a memo that said \
             otherwise would be normalising the wrong table"
        );
        assert_eq!(after.base_peak, compile(&loud).unwrap().base_peak);
    }

    #[test]
    fn a_change_the_drummer_hears_misses_the_memo() {
        let cache = JamGainCache::new();
        let plain = compile_with(&twelve_bar(), &cache, reference_bank("room").unwrap(), None, JamVoices::default()).unwrap();
        let mut louder = twelve_bar();
        louder.bar.crash = vec![2, 0, 0, 0, 0, 0, 0, 0];
        let crashing = compile_with(&louder, &cache, reference_bank("room").unwrap(), None, JamVoices::default()).unwrap();
        assert!(
            crashing.base_peak > plain.base_peak,
            "a crash on the one is louder than no crash"
        );
        // Both are remembered, so going back is a hit rather than a render.
        assert_eq!(
            compile_with(&twelve_bar(), &cache, reference_bank("room").unwrap(), None, JamVoices::default()).unwrap().base_peak,
            plain.base_peak
        );
    }

    #[test]
    fn a_memo_that_has_never_seen_this_table_measures_it() {
        let cache = JamGainCache::new();
        let with_memo = compile_with(&twelve_bar(), &cache, reference_bank("room").unwrap(), None, JamVoices::default()).unwrap();
        let without = compile(&twelve_bar()).unwrap();
        assert_eq!(with_memo.peak_after, without.peak_after);
        assert_eq!(with_memo.base_peak, without.base_peak);
    }

    /// Intensity is applied after the render, so it cannot move the number
    /// the memo holds — and the three the UI offers must not each cost four
    /// bars of rendering more than once.
    #[test]
    fn the_intensity_dial_does_not_change_what_was_measured() {
        let cache = JamGainCache::new();
        let mut seen = Vec::new();
        for intensity in [0.7f32, 1.0, 1.25] {
            let mut cfg = twelve_bar();
            cfg.intensity = intensity;
            let t = compile_with(&cfg, &cache, reference_bank("room").unwrap(), None, JamVoices::default()).unwrap();
            seen.push(t.base_peak);
            // The level the musician hears does move with the dial.
            assert!(t.peak_after > 0.0);
        }
        assert!(
            seen.windows(2).all(|w| w[0] == w[1]),
            "the measurement is taken at 1.0 and scaled afterwards: {seen:?}"
        );
    }

    /// The memo is a ring, so a form longer than it can hold keeps working —
    /// it just measures the bars that fell off the end again.
    #[test]
    fn a_memo_that_fills_up_forgets_the_oldest_and_stays_correct() {
        let cache = JamGainCache::new();
        // Two notes carry the counter so every line is distinct and every
        // pitch stays inside the bass's E1-to-G3 range.
        let line = |n: usize| {
            walking(vec![
                28 + (n % 28) as u8,
                0,
                28 + (n / 28) as u8,
                0,
                47,
                0,
                52,
                0,
            ])
        };
        let total = JAM_GAIN_MEMO + 8;
        for n in 0..total {
            let cfg = line(n);
            let t = compile_with(&cfg, &cache, reference_bank("room").unwrap(), None, JamVoices::default()).unwrap();
            assert_eq!(
                t.base_peak,
                compile(&cfg).unwrap().base_peak,
                "entry {n} came back wrong"
            );
        }
        // The most recent are still remembered; the first ones are gone.
        assert!(cache.get(render_signature(&line(total - 1), &reference_bank("room").unwrap(), None, &JamVoices::default())).is_some());
        assert!(cache.get(render_signature(&line(0), &reference_bank("room").unwrap(), None, &JamVoices::default())).is_none());
    }
}

// ---------------------------------------------------------------------------
// The keys, the mix, and the sticks
// ---------------------------------------------------------------------------

#[cfg(test)]
mod band_tests {
    use super::*;

    /// See `compile_synth`: these tests were written against the recipes.
    fn compile(cfg: &JamConfig) -> Result<JamTable, String> {
        super::compile_synth(cfg)
    }
    use crate::engine::{JamKit, SoundId, BEAT_GAIN, KEYS_MAX_MIDI, KEYS_MIN_MIDI};

    /// A bar with one drum, one bass note and one chord on tick 0, so every
    /// lane is present and each one can be found by name.
    fn one_of_everything() -> JamConfig {
        let mut voicings: Vec<Vec<u8>> = vec![Vec::new(); 4];
        voicings[0] = vec![60, 64, 67];
        JamConfig {
            ticks_per_beat: 1,
            beats_per_bar: 4,
            bar: JamPattern {
                hat_open: Vec::new(),
                kick: vec![1, 0, 0, 0],
                snare: vec![0, 0, 2, 0],
                hat: vec![1, 1, 1, 1],
                ride: vec![0; 4],
                crash: vec![0; 4],
                ..Default::default()
            },
            fill: None,
            form_bars: 4,
            crash_on_one: false,
            intensity: 1.0,
            kit: "room".to_string(),
            bass: Some(JamBassLine {
                pitches: vec![40, 0, 0, 0],
                gain: 1.0,
                ..Default::default()
            }),
            practice: None,
            fill_every: None,
            keys: Some(JamKeysLine {
                voicings,
                gain: 1.0,
                ..Default::default()
            }),
            mix: None,
            count_in_sound: None,
            bass_voice: None,
            keys_voice: None,
            custom_kit: None,
            ..Default::default()
        }
    }

    fn lane_gain(table: &JamTable, tick: u32, lane: JamLane) -> f32 {
        table
            .tick(tick, 0)
            .expect("in the bar")
            .slots()
            .iter()
            .find(|s| s.lane == lane)
            .map(|s| s.gain)
            .unwrap_or_else(|| panic!("no {} on tick {tick}", lane.name()))
    }

    fn lane_count(table: &JamTable, tick: u32, lane: JamLane) -> usize {
        table
            .tick(tick, 0)
            .expect("in the bar")
            .slots()
            .iter()
            .filter(|s| s.lane == lane)
            .count()
    }

    // ---- The keys ----

    #[test]
    fn a_voicing_becomes_one_slot_per_note_of_the_chord() {
        let table = compile(&one_of_everything()).unwrap();
        assert_eq!(lane_count(&table, 0, JamLane::Keys), 3, "a triad is three notes");
        assert_eq!(lane_count(&table, 1, JamLane::Keys), 0, "and the rest is a rest");
        // The notes are the ones asked for, indexed off the bottom of the bank.
        let notes: Vec<SoundId> = table
            .tick(0, 0)
            .unwrap()
            .slots()
            .iter()
            .filter(|s| s.lane == JamLane::Keys)
            .map(|s| s.sound)
            .collect();
        assert_eq!(
            notes,
            vec![
                SoundId::Keys(KeysVoice::Epiano, 60 - KEYS_MIN_MIDI),
                SoundId::Keys(KeysVoice::Epiano, 64 - KEYS_MIN_MIDI),
                SoundId::Keys(KeysVoice::Epiano, 67 - KEYS_MIN_MIDI),
            ]
        );
    }

    #[test]
    fn a_keys_line_that_is_not_this_bar_is_rejected_whole() {
        let mut cfg = one_of_everything();
        cfg.keys = Some(JamKeysLine {
            voicings: vec![Vec::new(); 3],
            gain: 1.0,
            ..Default::default()
        });
        let err = compile(&cfg).expect_err("three voicings is not a four-tick bar");
        assert!(err.contains("keys.voicings has 3"), "{err}");
    }

    #[test]
    fn a_voicing_of_five_notes_is_refused_rather_than_truncated() {
        let mut cfg = one_of_everything();
        cfg.keys = Some(JamKeysLine {
            voicings: vec![vec![60, 62, 64, 65, 67], Vec::new(), Vec::new(), Vec::new()],
            gain: 1.0,
            ..Default::default()
        });
        let err = compile(&cfg).expect_err("five notes is not a voicing");
        assert!(err.contains("at most 4"), "{err}");
    }

    #[test]
    fn a_note_outside_the_keys_range_is_refused() {
        // 0 is a rest for the BASS; for the keys the rest is an empty
        // voicing, so a literal zero here is a note nobody can play.
        for bad in [KEYS_MIN_MIDI - 1, KEYS_MAX_MIDI + 1, 0] {
            let mut cfg = one_of_everything();
            cfg.keys = Some(JamKeysLine {
                voicings: vec![vec![bad], Vec::new(), Vec::new(), Vec::new()],
                gain: 1.0,
                ..Default::default()
            });
            let err = compile(&cfg)
                .err()
                .unwrap_or_else(|| panic!("MIDI {bad} should be refused"));
            assert!(err.contains(&format!("MIDI {bad}")), "{err}");
        }
    }

    #[test]
    fn the_keys_gain_is_clamped_rather_than_obeyed() {
        let quiet = {
            let mut cfg = one_of_everything();
            cfg.keys.as_mut().unwrap().gain = 0.5;
            compile(&cfg).unwrap()
        };
        let absurd = {
            let mut cfg = one_of_everything();
            cfg.keys.as_mut().unwrap().gain = 40.0;
            compile(&cfg).unwrap()
        };
        let nonsense = {
            let mut cfg = one_of_everything();
            cfg.keys.as_mut().unwrap().gain = f32::NAN;
            compile(&cfg).unwrap()
        };
        let clamped = {
            let mut cfg = one_of_everything();
            cfg.keys.as_mut().unwrap().gain = KEYS_GAIN_MAX;
            compile(&cfg).unwrap()
        };
        assert!(
            lane_gain(&absurd, 0, JamLane::Keys) > 0.0
                && (lane_gain(&absurd, 0, JamLane::Keys) - lane_gain(&clamped, 0, JamLane::Keys))
                    .abs()
                    < 1e-6,
            "a gain of 40 should play at {KEYS_GAIN_MAX}"
        );
        assert!(
            lane_gain(&quiet, 0, JamLane::Keys) < lane_gain(&clamped, 0, JamLane::Keys),
            "0.5 should be quieter than 1.5"
        );
        assert!(
            lane_gain(&nonsense, 0, JamLane::Keys) > 0.0,
            "a NaN in the store is a band that plays at 1.0, not a silent one"
        );
    }

    #[test]
    fn the_keys_are_held_down_by_the_trim_and_not_by_the_bank() {
        // The whole reason `KEYS_TRIM` exists: at the level the bank hands
        // out, a chord is louder than the backbeat. This is the arithmetic
        // half of the claim; `the_keys_sit_under_the_snare_on_a_small_speaker`
        // in `engine.rs` is the measured half.
        let table = compile(&one_of_everything()).unwrap();
        let keys = lane_gain(&table, 0, JamLane::Keys);
        let snare = lane_gain(&table, 2, JamLane::Snare);
        assert!(
            keys < snare * 0.5,
            "a keys note at {keys} against a snare accent at {snare} is not comping"
        );
    }

    // ---- The mix ----

    #[test]
    fn the_mix_multiplies_the_lane_it_names_and_no_other() {
        let plain = compile(&one_of_everything()).unwrap();
        let mut cfg = one_of_everything();
        cfg.mix = Some(JamMix {
            drums: 0.5,
            bass: 1.0,
            keys: 1.0,
            perc: 1.0,
        });
        let quieter = compile(&cfg).unwrap();
        // The comparison has to be against the UNNORMALISED level: a table
        // with quieter drums may be scaled differently, and that is the
        // point of measuring the ratio between two lanes of the SAME table
        // rather than one lane across two.
        let ratio = |t: &JamTable| lane_gain(t, 0, JamLane::Kick) / lane_gain(t, 0, JamLane::Bass);
        assert!(
            (ratio(&quieter) - ratio(&plain) * 0.5).abs() < 1e-5,
            "drums at 0.5 should be half as loud against the bass; {} vs {}",
            ratio(&quieter),
            ratio(&plain)
        );
    }

    #[test]
    fn each_lane_of_the_mix_moves_its_own_lane() {
        let base = compile(&one_of_everything()).unwrap();
        let base_ratio =
            lane_gain(&base, 0, JamLane::Keys) / lane_gain(&base, 0, JamLane::Kick);
        let mut cfg = one_of_everything();
        cfg.mix = Some(JamMix {
            drums: 1.0,
            bass: 1.0,
            keys: 0.25,
            perc: 1.0,
        });
        let t = compile(&cfg).unwrap();
        let ratio = lane_gain(&t, 0, JamLane::Keys) / lane_gain(&t, 0, JamLane::Kick);
        assert!(
            (ratio - base_ratio * 0.25).abs() < 1e-6,
            "the keys at 0.25 should be a quarter as loud against the kick"
        );
    }

    #[test]
    fn a_lane_mixed_to_zero_is_silent_and_the_rest_still_play() {
        let mut cfg = one_of_everything();
        cfg.mix = Some(JamMix {
            drums: 1.0,
            bass: 0.0,
            keys: 1.0,
            perc: 1.0,
        });
        let t = compile(&cfg).unwrap();
        assert_eq!(
            lane_gain(&t, 0, JamLane::Bass),
            0.0,
            "a bass mixed all the way down is silent"
        );
        assert!(lane_gain(&t, 0, JamLane::Kick) > 0.0, "the drums keep playing");
        assert!(lane_gain(&t, 0, JamLane::Keys) > 0.0, "so do the keys");
    }

    #[test]
    fn the_mix_is_clamped_rather_than_obeyed() {
        let at_max = {
            let mut cfg = one_of_everything();
            cfg.mix = Some(JamMix {
                drums: MIX_MAX,
                bass: 1.0,
                keys: 1.0,
                perc: 1.0,
            });
            compile(&cfg).unwrap()
        };
        let absurd = {
            let mut cfg = one_of_everything();
            cfg.mix = Some(JamMix {
                drums: 12.0,
                bass: 1.0,
                keys: 1.0,
                perc: 1.0,
            });
            compile(&cfg).unwrap()
        };
        let negative = {
            let mut cfg = one_of_everything();
            cfg.mix = Some(JamMix {
                drums: -3.0,
                bass: 1.0,
                keys: 1.0,
                perc: 1.0,
            });
            compile(&cfg).unwrap()
        };
        let nonsense = {
            let mut cfg = one_of_everything();
            cfg.mix = Some(JamMix {
                drums: f32::INFINITY,
                bass: 1.0,
                keys: 1.0,
                perc: 1.0,
            });
            compile(&cfg).unwrap()
        };
        let ratio = |t: &JamTable| lane_gain(t, 0, JamLane::Kick) / lane_gain(t, 0, JamLane::Bass);
        assert!(
            (ratio(&absurd) - ratio(&at_max)).abs() < 1e-5,
            "a mix of 12 should play at {MIX_MAX}"
        );
        assert_eq!(
            lane_gain(&negative, 0, JamLane::Kick),
            0.0,
            "a negative mix is off, not inverted"
        );
        let plain = compile(&one_of_everything()).unwrap();
        assert!(
            (ratio(&nonsense) - ratio(&plain)).abs() < 1e-5,
            "an infinity in the store is a band at 1.0"
        );
    }

    #[test]
    fn the_mix_is_a_dial_the_musician_hears_now() {
        // Turning a lane down has to apply at once, not at the next bar
        // line — it is the same kind of change as the intensity dial. So
        // two tables that differ only in the mix must NOT look like the
        // same drummer to `swap_defers`.
        let a = std::sync::Arc::new(compile(&one_of_everything()).unwrap());
        let mut cfg = one_of_everything();
        cfg.mix = Some(JamMix {
            drums: 0.4,
            bass: 1.0,
            keys: 1.0,
            perc: 1.0,
        });
        let b = std::sync::Arc::new(compile(&cfg).unwrap());
        assert!(
            !swap_defers(Some(&a), Some(&b), true, false),
            "a mix change must be heard now"
        );
    }

    #[test]
    fn a_new_chord_waits_for_the_bar_line_the_way_a_new_bass_bar_does() {
        // The UI posts the next bar's bass AND the next bar's voicings on
        // this bar's downbeat. Both have to wait, or the band plays the next
        // bar's changes over this one.
        let a = std::sync::Arc::new(compile(&one_of_everything()).unwrap());
        let mut cfg = one_of_everything();
        cfg.keys.as_mut().unwrap().voicings[0] = vec![62, 65, 69];
        let b = std::sync::Arc::new(compile(&cfg).unwrap());
        assert!(
            swap_defers(Some(&a), Some(&b), true, false),
            "a chord change is the same drummer under different changes"
        );
    }

    // ---- The sticks ----

    #[test]
    fn a_count_in_is_a_beep_unless_the_jam_asks_for_sticks() {
        let table = compile(&one_of_everything()).unwrap();
        assert!(
            table.count_in_slot().is_none(),
            "no countInSound means the beep the drill has always used"
        );
        let mut cfg = one_of_everything();
        cfg.count_in_sound = Some(JamCountInSound::Beep);
        assert!(compile(&cfg).unwrap().count_in_slot().is_none());
    }

    /// The count-in is `sticks_low` — the beat half of the Sticks click
    /// preset — whatever kit the jam loaded, and it used to be that kit's
    /// own cross-stick.
    ///
    /// Walking every kit is still the point of this test and means the
    /// opposite of what it used to: before, it said each kit reached its own
    /// rim; now it says none of them reaches anything, because a count-in
    /// happens before the band and no longer comes out of the band's folder.
    /// A kit that shipped without a rim used to fall back through
    /// `with_fallback` to get counted in; there is nothing left to fall
    /// through.
    #[test]
    fn sticks_are_the_click_banks_cross_stick_at_the_beat_gain() {
        for kit in JamKit::all() {
            let mut cfg = one_of_everything();
            cfg.kit = kit.name().to_string();
            cfg.count_in_sound = Some(JamCountInSound::Sticks);
            let slot = compile(&cfg)
                .unwrap()
                .count_in_slot()
                .unwrap_or_else(|| panic!("{} should count in with sticks", kit.name()));
            assert_eq!(
                slot.sound,
                SoundId::SticksLow,
                "{} counts in on the metronome's own sticks",
                kit.name()
            );
            assert!((slot.gain - BEAT_GAIN).abs() < 1e-5);
            assert_eq!(slot.cap_ticks, 0.0, "a stick click rings out");
            assert!(!slot.accent, "a count-in beat is not a backbeat");
            assert_eq!(slot.voice, NOT_A_DRUM, "a count-in is not one of the drums");
        }
    }

    #[test]
    fn the_sticks_are_not_moved_by_the_intensity_the_mix_or_the_normalisation() {
        // A count-in happens before the band and alone, so none of the
        // arithmetic that keeps four voices out of each other's way applies
        // to it — and a count-in nobody can hear because the drums were
        // mixed down is a bug, not a balance.
        let mut loud = one_of_everything();
        loud.count_in_sound = Some(JamCountInSound::Sticks);
        loud.intensity = 1.25;
        loud.mix = Some(JamMix {
            drums: 0.0,
            bass: 1.0,
            keys: 1.0,
            perc: 1.0,
        });
        // ...and a groove busy enough to be normalised down.
        loud.bar.kick = vec![2; 4];
        loud.bar.snare = vec![2; 4];
        loud.bar.crash = vec![2; 4];
        let slot = compile(&loud).unwrap().count_in_slot().expect("sticks");
        assert_eq!(
            slot.gain, BEAT_GAIN,
            "the count-in is the beat gain whatever the band is doing"
        );
    }

    #[test]
    fn changing_the_count_in_sound_is_heard_now() {
        // It is not part of the band, but it IS part of the table, and a
        // table that differs only in it must not be mistaken for the same
        // one and held back to a bar line.
        let a = std::sync::Arc::new(compile(&one_of_everything()).unwrap());
        let mut cfg = one_of_everything();
        cfg.count_in_sound = Some(JamCountInSound::Sticks);
        let b = std::sync::Arc::new(compile(&cfg).unwrap());
        assert!(!swap_defers(Some(&a), Some(&b), true, false));
    }

    // ---- The contract's spelling ----

    #[test]
    fn the_fourth_pass_fields_deserialise_from_the_contracts_camel_case() {
        let json = serde_json::json!({
            "ticksPerBeat": 1,
            "beatsPerBar": 4,
            "bar": {
                "kick": [1, 0, 0, 0],
                "snare": [0, 0, 2, 0],
                "hat": [1, 1, 1, 1],
                "ride": [0, 0, 0, 0],
                "crash": [0, 0, 0, 0],
            },
            "fill": null,
            "formBars": 12,
            "crashOnOne": true,
            "intensity": 1.0,
            "kit": "tight",
            "keys": {
                "voicings": [[60, 64, 67], [], [], []],
                "gain": 1.1,
            },
            "mix": { "drums": 0.8, "bass": 1.2, "keys": 0.6 },
            "countInSound": "sticks",
        });
        let cfg: JamConfig = serde_json::from_value(json).expect("the contract's own spelling");
        let keys = cfg.keys.as_ref().expect("keys");
        assert_eq!(keys.voicings[0], vec![60, 64, 67]);
        assert!(keys.voicings[1].is_empty());
        assert!((keys.gain - 1.1).abs() < 1e-6);
        let mix = cfg.mix.expect("mix");
        assert!((mix.drums - 0.8).abs() < 1e-6);
        assert!((mix.bass - 1.2).abs() < 1e-6);
        assert!((mix.keys - 0.6).abs() < 1e-6);
        assert_eq!(cfg.count_in_sound, Some(JamCountInSound::Sticks));
        // And it compiles into a band with a chord and a stick count.
        let table = compile(&cfg).expect("compiles");
        assert_eq!(lane_count(&table, 0, JamLane::Keys), 3);
        assert!(table.count_in_slot().is_some());
    }

    #[test]
    fn a_jam_from_before_any_of_this_still_loads() {
        // `keys`, `mix` and `countInSound` are all optional in the contract,
        // and a record written by the build before this one has none of
        // them. It has to play, not fail to parse.
        let json = serde_json::json!({
            "ticksPerBeat": 1,
            "beatsPerBar": 4,
            "bar": {
                "kick": [1, 0, 0, 0],
                "snare": [0, 0, 2, 0],
                "hat": [1, 1, 1, 1],
                "ride": [0, 0, 0, 0],
                "crash": [0, 0, 0, 0],
            },
            "fill": null,
            "formBars": 12,
            "crashOnOne": true,
            "intensity": 1.0,
            "kit": "room",
        });
        let cfg: JamConfig = serde_json::from_value(json).expect("an older record still loads");
        assert!(cfg.keys.is_none());
        assert!(cfg.mix.is_none());
        assert!(cfg.count_in_sound.is_none());
        assert!(cfg.pickup.is_none(), "nobody was played in before this");
        let table = compile(&cfg).expect("compiles");
        assert_eq!(lane_count(&table, 0, JamLane::Keys), 0);
        assert!(table.count_in_slot().is_none());
        assert!(!table.has_pickup());
    }

    #[test]
    fn the_pickup_deserialises_from_the_contracts_camel_case() {
        let json = serde_json::json!({
            "ticksPerBeat": 1,
            "beatsPerBar": 4,
            "bar": {
                "kick": [1, 0, 0, 0],
                "snare": [0, 0, 2, 0],
                "hat": [1, 1, 1, 1],
                "ride": [0, 0, 0, 0],
                "crash": [0, 0, 0, 0],
            },
            "fill": {
                "kick": [1, 0, 0, 0],
                "snare": [0, 2, 2, 4],
                "hat": [1, 1, 1, 1],
                "ride": [0, 0, 0, 0],
                "crash": [0, 0, 0, 0],
            },
            "formBars": 8,
            "crashOnOne": false,
            "intensity": 1.0,
            "kit": "room",
            "pickup": true,
        });
        let cfg: JamConfig = serde_json::from_value(json).expect("the contract's own spelling");
        assert_eq!(cfg.pickup, Some(true));
        let table = compile(&cfg).expect("compiles");
        // One tick to the beat, so the pickup is the fill's fourth tick: the
        // snare at peak, and not the hat beside it.
        let tick = table.pickup_tick(0).expect("a pickup");
        assert_eq!(tick.slots().len(), 1, "the hands and nothing else");
        assert_eq!(tick.slots()[0].lane, JamLane::Snare);
        assert!(table.pickup_tick(1).is_none());
    }
}

// ---------------------------------------------------------------------------
// The percussionist
// ---------------------------------------------------------------------------

/// `plans/tasks/jam-v5/BRIEF.md` — the ten rows, the set behind them, the
/// band flag and the mix.
///
/// **Every test here builds its own set.** The shipped one is a folder
/// (`sounds/perc/*`) rendered by a tool, and a checkout may not have it —
/// so a test that reached for the real set would be a test that passes on
/// one machine and quietly checks nothing on another. What these are about
/// is the ENGINE: which bank a lane resolves against, what the flag does,
/// what the mix does, what a bar that writes nothing does. The shipped
/// folder has one test of its own, in `kit/tests.rs`, and it says so when it
/// has nothing to check.
#[cfg(test)]
mod perc_tests {
    use super::*;
    use crate::engine::KitVoice;

    /// A percussion set: the ten voices, one layer, one round robin.
    fn set() -> Arc<KitBank> {
        Arc::new(KitBank::for_tests(&KitVoice::PERC, JAM_REFERENCE_SR, 0.05))
    }

    /// And a drum kit to play it under.
    fn kit() -> Arc<KitBank> {
        Arc::new(KitBank::for_tests(&KitVoice::DRUMS, JAM_REFERENCE_SR, 0.05))
    }

    /// A latin-ish bar at eighths: a drummer, a clave and a tumbao.
    fn with_perc() -> JamConfig {
        JamConfig {
            ticks_per_beat: 2,
            beats_per_bar: 4,
            bar: JamPattern {
                kick: vec![1, 0, 0, 0, 1, 0, 0, 0],
                snare: vec![0; 8],
                hat: vec![1, 3, 1, 3, 1, 3, 1, 3],
                ride: vec![0; 8],
                crash: vec![0; 8],
                // Strong and weak, never a row of one level — the W28 rule.
                shaker: vec![2, 1, 2, 1, 2, 1, 2, 1],
                claves: vec![2, 0, 0, 1, 0, 1, 0, 0],
                conga_hi: vec![0, 3, 0, 2, 0, 3, 0, 2],
                conga_lo: vec![1, 0, 2, 0, 1, 0, 2, 0],
                ..Default::default()
            },
            fill: None,
            form_bars: 4,
            crash_on_one: false,
            intensity: 1.0,
            kit: "room".to_string(),
            ..Default::default()
        }
    }

    /// Which voice a lane resolved to on tick `t`, or `None` for a lane that
    /// made no slot at all.
    fn lane_voice(table: &JamTable, t: u32, lane: JamLane) -> Option<KitVoice> {
        table
            .tick(t, 0)
            .expect("in the bar")
            .slots()
            .iter()
            .find(|s| s.lane == lane)
            .and_then(|s| match s.sound {
                SoundId::Band { voice, .. } => KitVoice::ALL.get(voice as usize).copied(),
                _ => None,
            })
    }

    fn slot(table: &JamTable, t: u32, lane: JamLane) -> Option<JamSlot> {
        table
            .tick(t, 0)
            .expect("in the bar")
            .slots()
            .iter()
            .find(|s| s.lane == lane)
            .copied()
    }

    /// Every percussion lane, for the tests that ask "did any of them play".
    fn perc_lanes() -> impl Iterator<Item = JamLane> {
        OPTIONAL_LANES.into_iter().filter(|l| l.is_perc())
    }

    /// THE CONTRACT'S TEN NAMES, OFF THE WIRE.
    ///
    /// camelCase for the two-word ones, because that is what `rename_all`
    /// makes of `conga_hi` and what `src/jam/types.ts` spells. This is the
    /// one test that would catch a row renamed on one side of the wire and
    /// not the other, which arrives as a silent lane rather than as an
    /// error.
    #[test]
    fn the_ten_rows_arrive_under_the_contracts_own_names() {
        let json = serde_json::json!({
            "ticksPerBeat": 1,
            "beatsPerBar": 4,
            "bar": {
                "kick": [1, 0, 0, 0],
                "snare": [0, 0, 2, 0],
                "hat": [1, 1, 1, 1],
                "ride": [0, 0, 0, 0],
                "crash": [0, 0, 0, 0],
                "shaker": [1, 2, 1, 2],
                "tambourine": [0, 2, 0, 2],
                "cowbell": [2, 0, 1, 0],
                "cabasa": [1, 1, 2, 1],
                "claves": [2, 0, 0, 1],
                "guiro": [0, 1, 0, 2],
                "congaHi": [0, 3, 0, 2],
                "congaLo": [1, 0, 2, 0],
                "bongoHi": [0, 1, 0, 2],
                "bongoLo": [2, 0, 1, 0],
            },
            "formBars": 4,
            "crashOnOne": false,
            "intensity": 1.0,
            "kit": "room",
            "perc": true,
            "mix": { "drums": 1.0, "bass": 1.0, "keys": 1.0, "perc": 0.8 },
        });
        let cfg: JamConfig = serde_json::from_value(json).expect("the contract's own spelling");
        assert_eq!(cfg.perc, Some(true));
        assert_eq!(cfg.mix.expect("a mix").perc, 0.8);
        assert_eq!(cfg.bar.conga_hi, vec![0, 3, 0, 2]);
        assert_eq!(cfg.bar.bongo_lo, vec![2, 0, 1, 0]);

        // And every one of them reaches its own voice.
        let table = compile_with_perc(&cfg, kit(), Some(set())).expect("compiles");
        let want = [
            (JamLane::Shaker, KitVoice::Shaker, 0),
            (JamLane::Tambourine, KitVoice::Tambourine, 1),
            (JamLane::Cowbell, KitVoice::Cowbell, 0),
            (JamLane::Cabasa, KitVoice::Cabasa, 0),
            (JamLane::Claves, KitVoice::Claves, 0),
            (JamLane::Guiro, KitVoice::Guiro, 1),
            (JamLane::CongaHi, KitVoice::CongaHi, 1),
            (JamLane::CongaLo, KitVoice::CongaLo, 0),
            (JamLane::BongoHi, KitVoice::BongoHi, 1),
            (JamLane::BongoLo, KitVoice::BongoLo, 0),
        ];
        for (lane, voice, tick) in want {
            assert_eq!(
                lane_voice(&table, tick, lane),
                Some(voice),
                "{} did not reach {}",
                lane.name(),
                voice.file_name()
            );
        }
    }

    /// THE SEAM THE UI ACTUALLY SENDS: NO FLAG AT ALL.
    ///
    /// `src/jam/compile.ts` decides whether there is a percussionist in
    /// TypeScript and says so by SENDING THE ROWS OR LEAVING THEM OUT — band
    /// flag off, drums off, stop-time, an ending, all of them arrive here as
    /// an absent row. It never puts a `perc` boolean on the config.
    ///
    /// So `None` has to mean "the rows play if they are there", and nothing
    /// on this side may read a missing flag as a missing player. `Some(false)`
    /// stays in the contract as the engine's own answer for a sender that
    /// wants one; the app is not that sender.
    #[test]
    fn a_config_with_no_perc_flag_plays_the_rows_it_was_sent() {
        let json = serde_json::json!({
            "ticksPerBeat": 1,
            "beatsPerBar": 4,
            "bar": {
                "kick": [1, 0, 0, 0],
                "snare": [0, 0, 2, 0],
                "hat": [1, 1, 1, 1],
                "ride": [0, 0, 0, 0],
                "crash": [0, 0, 0, 0],
                "shaker": [2, 1, 2, 1],
                "congaHi": [0, 3, 0, 2],
            },
            "formBars": 4,
            "crashOnOne": false,
            "intensity": 1.0,
            "kit": "room",
        });
        let cfg: JamConfig = serde_json::from_value(json).expect("the UI's own config");
        assert_eq!(cfg.perc, None, "the UI sends no flag, so this must stay None");
        let table = compile_with_perc(&cfg, kit(), Some(set())).expect("compiles");
        assert!(
            slot(&table, 0, JamLane::Shaker).is_some(),
            "a config with no perc flag lost its shaker"
        );
        assert!(
            slot(&table, 1, JamLane::CongaHi).is_some(),
            "a config with no perc flag lost its conga"
        );
    }

    /// AND A MIX WITH NO `perc` IN IT IS THE PERCUSSIONIST AT FULL LEVEL.
    ///
    /// Three numbers is what every jam saved before this pass carries, and
    /// what a store, a JSON round trip or an older build will keep sending.
    /// Absent is 1.0 — the level the grooves were written at — and not zero,
    /// which would be a percussionist who plays every row and is inaudible.
    #[test]
    fn a_mix_without_perc_is_the_percussionist_at_full_level() {
        let three: JamMix = serde_json::from_value(serde_json::json!({
            "drums": 1.0, "bass": 1.0, "keys": 1.0,
        }))
        .expect("a mix saved before the percussionist");
        assert_eq!(three.perc, 1.0);

        // And through the compiler: the same band with the row's level
        // spelled out comes out at the same gain.
        let mut old = with_perc();
        old.mix = Some(three);
        let old = compile_with_perc(&old, kit(), Some(set())).expect("compiles");
        let full = compile_with_perc(&with_perc(), kit(), Some(set())).expect("compiles");
        assert_eq!(
            slot(&old, 0, JamLane::Shaker).map(|s| s.gain),
            slot(&full, 0, JamLane::Shaker).map(|s| s.gain),
            "a mix with no perc row in it changed the percussionist's level"
        );
    }

    /// A MISSING SET IS A SILENT ROW, AND NOTHING ELSE.
    ///
    /// The promise a checkout without `sounds/perc` lives on: the build
    /// works, the jam loads, the percussion lanes play nothing, and the
    /// drummer plays exactly what a groove with no percussion rows in it
    /// would have played. Compared table against table, tick by tick, so
    /// "untouched" is a fact rather than a hope.
    #[test]
    fn with_no_set_the_lanes_are_silent_and_the_drums_are_untouched() {
        let cfg = with_perc();
        let without = compile_with_perc(&cfg, kit(), None).expect("compiles with no set");
        for lane in perc_lanes() {
            for t in 0..8 {
                assert!(
                    slot(&without, t, lane).is_none(),
                    "{} played with no set behind it",
                    lane.name()
                );
            }
        }

        // The same config with the percussion rows deleted, which is the
        // band this has to be identical to.
        let mut bare = cfg.clone();
        bare.bar = JamPattern {
            shaker: Vec::new(),
            claves: Vec::new(),
            conga_hi: Vec::new(),
            conga_lo: Vec::new(),
            ..cfg.bar.clone()
        };
        let plain = compile_with_perc(&bare, kit(), None).expect("compiles");
        for t in 0..8 {
            assert_eq!(
                without.tick(t, 0).unwrap().slots(),
                plain.tick(t, 0).unwrap().slots(),
                "tick {t} of the drums moved when the percussion went missing"
            );
        }
        assert_eq!(without.base_peak, plain.base_peak);
    }

    /// THE BAND FLAG SILENCES THE ROWS AND NOTHING ELSE.
    ///
    /// Muting a player is not remixing the band: the drums, the levels and
    /// the normalisation all have to come out what they were with the
    /// percussionist standing there. The comparison is against the same
    /// config with the rows deleted rather than against itself, so a flag
    /// that quietly rescaled the drums would fail here.
    #[test]
    fn switching_the_percussionist_off_takes_away_the_rows_and_nothing_else() {
        let mut off = with_perc();
        off.perc = Some(false);
        let off = compile_with_perc(&off, kit(), Some(set())).expect("compiles");

        let mut bare = with_perc();
        bare.bar = JamPattern {
            shaker: Vec::new(),
            claves: Vec::new(),
            conga_hi: Vec::new(),
            conga_lo: Vec::new(),
            ..with_perc().bar
        };
        let bare = compile_with_perc(&bare, kit(), Some(set())).expect("compiles");

        for t in 0..8 {
            assert_eq!(
                off.tick(t, 0).unwrap().slots(),
                bare.tick(t, 0).unwrap().slots(),
                "tick {t} is not the same band with the percussionist switched off"
            );
        }
        assert_eq!(off.base_peak, bare.base_peak);

        // And absent is not off: a jam saved before the flag existed still
        // has its percussionist.
        let mut unsaid = with_perc();
        unsaid.perc = None;
        let unsaid = compile_with_perc(&unsaid, kit(), Some(set())).expect("compiles");
        assert!(
            slot(&unsaid, 0, JamLane::Shaker).is_some(),
            "a jam that says nothing about the percussionist lost one"
        );
        assert!(
            slot(&unsaid, 0, JamLane::Claves).is_some(),
            "a jam that says nothing about the percussionist lost the clave"
        );
    }

    /// THE MIX SCALES THE PERCUSSION AND LEAVES THE DRUMMER WHERE HE IS.
    ///
    /// Two dials, two rows in the band. Half on `mix.perc` is half on every
    /// percussion slot and exactly nothing on the kick beside it.
    #[test]
    fn the_perc_mix_scales_the_percussion_and_only_the_percussion() {
        let full = compile_with_perc(&with_perc(), kit(), Some(set())).expect("compiles");
        let mut half = with_perc();
        half.mix = Some(JamMix {
            perc: 0.5,
            ..JamMix::default()
        });
        let half = compile_with_perc(&half, kit(), Some(set())).expect("compiles");

        for lane in [
            JamLane::Shaker,
            JamLane::Claves,
            JamLane::CongaHi,
            JamLane::CongaLo,
        ] {
            let (a, b) = (0..8)
                .filter_map(|t| Some((slot(&full, t, lane)?, slot(&half, t, lane)?)))
                .next()
                .unwrap_or_else(|| panic!("{} never played", lane.name()));
            assert!(
                (b.gain - a.gain * 0.5).abs() < 1e-6,
                "{} came out at {} against {} at half the mix",
                lane.name(),
                b.gain,
                a.gain * 0.5
            );
        }
        let kick_full = slot(&full, 0, JamLane::Kick).expect("a kick");
        let kick_half = slot(&half, 0, JamLane::Kick).expect("a kick");
        assert_eq!(
            kick_full.gain, kick_half.gain,
            "the drummer moved when the percussion mix did"
        );
    }

    /// A STOP-TIME BAR DROPS THE PERCUSSIONIST TOO.
    ///
    /// Stop-time is the downbeat and silence after it, written by the
    /// arrangement into the rows it sends (`BandMoment.perc` is `off`
    /// there). What this holds is the engine's half: nothing in here keeps a
    /// percussion lane alive across a bar that does not write it. Every row
    /// is read cell by cell, exactly as the drums are, and a row of zeros
    /// makes no slot.
    #[test]
    fn a_stop_time_bar_leaves_the_downbeat_and_nothing_after_it() {
        let mut cfg = with_perc();
        let hit = |mut v: Vec<u8>| {
            for c in v.iter_mut().skip(1) {
                *c = 0;
            }
            v
        };
        cfg.bar = JamPattern {
            kick: hit(cfg.bar.kick.clone()),
            snare: vec![0; 8],
            hat: vec![0; 8],
            ride: vec![0; 8],
            crash: vec![0; 8],
            shaker: vec![0; 8],
            claves: hit(cfg.bar.claves.clone()),
            conga_hi: vec![0; 8],
            conga_lo: vec![0; 8],
            ..Default::default()
        };
        let table = compile_with_perc(&cfg, kit(), Some(set())).expect("compiles");
        assert!(slot(&table, 0, JamLane::Claves).is_some(), "the downbeat");
        for t in 1..8 {
            for lane in perc_lanes() {
                assert!(
                    slot(&table, t, lane).is_none(),
                    "{} played on tick {t} of a stop-time bar",
                    lane.name()
                );
            }
        }
    }

    /// THE FOUR-BAR RENDER COUNTS THE PERCUSSION.
    ///
    /// The measurement behind the safety clamp walks the table's slots and
    /// reads each one's samples out of the bank the voice belongs to. If it
    /// read the percussion out of the drum kit — where those slots are
    /// `None` — ten rows would measure as silence, and a table that really
    /// is loud would go to the bus unscaled. So a band with a percussionist
    /// has to render LOUDER than the same band without one.
    #[test]
    fn the_worst_tick_is_measured_with_the_percussion_in_it() {
        let with = compile_with_perc(&with_perc(), kit(), Some(set())).expect("compiles");
        let mut bare = with_perc();
        bare.perc = Some(false);
        let bare = compile_with_perc(&bare, kit(), Some(set())).expect("compiles");
        assert!(
            with.base_peak > bare.base_peak,
            "four bars with a shaker, a clave and two congas in them measured \
             {} against {} without — the render is not reading the set",
            with.base_peak,
            bare.base_peak
        );
    }

    /// A PERCUSSION VOICE THE SET HAS NOT GOT IS SILENCE, NOT A SUBSTITUTE.
    ///
    /// The drums substitute because their voices are one instrument played
    /// differently — a cross-stick is a snare. A tray is ten instruments,
    /// and a cowbell standing in for a guiro is the wrong one. See
    /// `kit::fallback_for`.
    #[test]
    fn a_voice_the_set_has_not_got_plays_nothing() {
        let partial = Arc::new(KitBank::for_tests(
            &[KitVoice::Shaker, KitVoice::CongaHi, KitVoice::CongaLo],
            JAM_REFERENCE_SR,
            0.05,
        ));
        let table = compile_with_perc(&with_perc(), kit(), Some(partial)).expect("compiles");
        assert!(
            slot(&table, 0, JamLane::Shaker).is_some(),
            "the shaker is there"
        );
        for t in 0..8 {
            assert!(
                slot(&table, t, JamLane::Claves).is_none(),
                "a set with no claves played one anyway on tick {t}"
            );
        }
    }

    /// THE SET IS ITS OWN BANK, AND THE DRUMS ARE THE KIT'S.
    ///
    /// The whole design in one assertion: one voice index space, two banks,
    /// and the index says which. A percussion slot names a voice at or past
    /// `DRUM_VOICES` — which is what `jam_sample` reads on the audio thread —
    /// and a drum's names one below it.
    #[test]
    fn a_percussion_slot_names_a_voice_the_drum_kit_does_not_have() {
        let table = compile_with_perc(&with_perc(), kit(), Some(set())).expect("compiles");
        let shaker = slot(&table, 0, JamLane::Shaker).expect("a shaker");
        let kick = slot(&table, 0, JamLane::Kick).expect("a kick");
        assert!(shaker.voice as usize >= crate::kit::DRUM_VOICES);
        assert!((kick.voice as usize) < crate::kit::DRUM_VOICES);
        assert!(
            table.kit_bank().sample(shaker.voice, 0, 0).is_empty(),
            "the drum kit answered for a shaker"
        );
        assert!(
            !table
                .perc_bank()
                .expect("a set")
                .sample(shaker.voice, 0, 0)
                .is_empty(),
            "the set had nothing for its own shaker"
        );
    }

    /// A SHAKER'S TWO FILES ALTERNATE BY THE SAME FORMULA THE DRUMS USE.
    ///
    /// The contract asks for it by name ("a shaker's two files alternate by
    /// it"), and it is the same [`round_robin`] arithmetic with no state on
    /// the audio thread — so the second of two round robins is reached, and
    /// the same bar and tick give the same answer every time round the form.
    #[test]
    fn a_shakers_round_robins_alternate_and_repeat() {
        let two = Arc::new(KitBank::layered_for_tests(
            &KitVoice::PERC,
            JAM_REFERENCE_SR,
            0.05,
            1,
            2,
        ));
        let table = compile_with_perc(&with_perc(), kit(), Some(two)).expect("compiles");
        let s = slot(&table, 0, JamLane::Shaker).expect("a shaker");
        assert_eq!(s.rr, 2, "the table did not carry the set's round robins");
        let seen: std::collections::BTreeSet<u8> =
            (0..8).map(|t| round_robin(0, 8, t, s.voice, s.rr)).collect();
        assert_eq!(seen.len(), 2, "one of the shaker's two files never plays");
        assert_eq!(
            round_robin(3, 8, 5, s.voice, s.rr),
            round_robin(3, 8, 5, s.voice, s.rr),
            "the same bar and tick gave two answers"
        );
    }

    /// THE LEVELS ARE THE LEVELS, AND A GHOST IS A DIFFERENT RECORDING.
    ///
    /// A muted conga is layer 1 of the open one — the contract's own words —
    /// so a level 3 on the conga row has to reach the softest layer the set
    /// has, exactly as a ghost snare reaches the softest snare. That is the
    /// whole reason `conga_muted` is a layer and not an eleventh row.
    #[test]
    fn a_ghost_on_the_conga_reaches_the_muted_stroke() {
        let layered = Arc::new(KitBank::layered_for_tests(
            &KitVoice::PERC,
            JAM_REFERENCE_SR,
            0.05,
            3,
            1,
        ));
        let table = compile_with_perc(&with_perc(), kit(), Some(layered)).expect("compiles");
        // `conga_hi` is a ghost on tick 1 and an accent on tick 3.
        let ghost = slot(&table, 1, JamLane::CongaHi).expect("a ghost conga");
        let accent = slot(&table, 3, JamLane::CongaHi).expect("an accent conga");
        let layer = |s: JamSlot| match s.sound {
            SoundId::Band { layer, .. } => layer,
            _ => panic!("a conga is a drum"),
        };
        assert_eq!(layer(ghost), 0, "the ghost is not the softest stroke");
        assert!(
            layer(accent) > layer(ghost),
            "an accent and a ghost came out of the same recording"
        );
    }

    /// EVERY PERCUSSION LANE IS BOUNDED.
    ///
    /// The arithmetic behind [`PERC_CAP_TICKS`]: ten rows a groove may write
    /// on every tick, against a mixer that preallocates its voices. An
    /// uncapped percussion lane is not a balance that went wrong, it is a
    /// table the callback cannot play — so no percussion slot may carry the
    /// kick's "ring out for ever".
    #[test]
    fn no_percussion_lane_rings_out_uncapped() {
        let mut cfg = with_perc();
        let all = vec![2u8; 8];
        cfg.bar = JamPattern {
            shaker: all.clone(),
            tambourine: all.clone(),
            cowbell: all.clone(),
            cabasa: all.clone(),
            claves: all.clone(),
            guiro: all.clone(),
            conga_hi: all.clone(),
            conga_lo: all.clone(),
            bongo_hi: all.clone(),
            bongo_lo: all.clone(),
            ..cfg.bar.clone()
        };
        let table = compile_with_perc(&cfg, kit(), Some(set())).expect("compiles");
        for lane in perc_lanes() {
            let s = slot(&table, 0, lane).unwrap_or_else(|| panic!("{} never played", lane.name()));
            assert!(
                s.cap_ticks > 0.0 && s.cap_ticks <= PERC_CAP_TICKS,
                "{} rings for {} ticks",
                lane.name(),
                s.cap_ticks
            );
        }
    }

    /// TURNING THE PERCUSSIONIST OFF IS A CHANGE YOU HEAR NOW.
    ///
    /// Both signatures move with the flag and with the mix, for the two
    /// different reasons the brief names: the swap must not be held back to
    /// a bar line the way a bass line is, and the four-bar memo must not
    /// hand back a measurement that was taken with a shaker in it.
    #[test]
    fn the_flag_and_the_mix_are_in_both_signatures() {
        let kit = kit();
        let set = Some(set());
        let on = with_perc();
        let mut off = with_perc();
        off.perc = Some(false);
        let mut quiet = with_perc();
        quiet.mix = Some(JamMix {
            perc: 0.25,
            ..JamMix::default()
        });
        let voices = JamVoices::default();
        let sig = |c: &JamConfig| drums_signature(c, &kit, set.as_deref(), &voices);
        let render = |c: &JamConfig| render_signature(c, &kit, set.as_deref(), &voices);
        assert_ne!(
            sig(&on),
            sig(&off),
            "switching the player off looks like the same band"
        );
        assert_ne!(
            render(&on),
            render(&off),
            "the memo would reuse a measurement with a shaker in it"
        );
        assert_ne!(sig(&on), sig(&quiet), "the perc mix is not in the signature");
        assert_ne!(
            render(&on),
            render(&quiet),
            "the memo would reuse the measurement across a mix change"
        );
        // And a set arriving where there was none is a different band too.
        assert_ne!(
            drums_signature(&on, &kit, None, &voices),
            drums_signature(&on, &kit, set.as_deref(), &voices),
        );
    }
}
