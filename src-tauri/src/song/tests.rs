//! What a compiled song has to be true about, with no audio device in sight.
//!
//! The offline render — every click and every backing onset against the map,
//! across a tempo step and across a loop seam — lives in `engine.rs` beside
//! `render_band_demos`, because it needs the callback's own mixer. These are
//! the arithmetic: the map, the meter, the range, the count-in and the
//! General MIDI drum map.

use super::*;

/// A twelve-bar song with a 7/8 bar and a tempo step at bar 5 — the shape the
/// brief names, built once here so every test below is about the same piece.
///
/// Bars 0-3 and 5-11 are 4/4; bar 4 is 7/8. 120 BPM from the top, 90 from the
/// start of bar 5 (the step is on a bar line, which is the only place v1
/// allows one).
pub(super) fn twelve_bar() -> SongTransport {
    let mut bars = Vec::new();
    let mut tick = 0u32;
    for i in 0..12u32 {
        let (num, den) = if i == 4 { (7, 8) } else { (4, 4) };
        // A bar is `numerator` notes of `1/denominator`, in ticks of a
        // quarter: 4/4 is 3840, 7/8 is 3360.
        let len = TICKS_PER_QUARTER * 4 / den * num;
        bars.push(SongBar {
            start_tick: tick,
            length_ticks: len,
            numerator: num,
            denominator: den,
        });
        tick += len;
    }
    SongTransport {
        ticks_per_quarter: TICKS_PER_QUARTER,
        tempo_map: vec![
            SongTempo { tick: 0, bpm: 120.0 },
            SongTempo {
                tick: bars[5].start_tick,
                bpm: 90.0,
            },
        ],
        bars,
        range: SongRange {
            start_bar: 0,
            end_bar: 11,
        },
        loops: false,
        tempo_percent: 100,
        count_in_bars: 0,
    }
}

/// The plan alone — no kit, no banks, no device. Everything about the click
/// and the map is decided before a sound is looked at, which is what makes
/// this possible.
fn plan(t: &SongTransport, rate: u32, subdivision: u32) -> RangePlan {
    plan_range(t, rate, subdivision).expect("the twelve-bar song plans")
}

// ─── The map ─────────────────────────────────────────────────────────────

#[test]
fn a_bar_lasts_exactly_as_long_as_its_meter_and_its_tempo() {
    let t = twelve_bar();
    let p = plan(&t, 48_000, 1);
    // 4/4 at 120: two seconds. 96 000 frames at 48 kHz.
    assert_eq!(p.bars[0].start_sample, 0);
    assert_eq!(p.bars[1].start_sample, 96_000);
    assert_eq!(p.bars[2].start_sample, 192_000);
    // Bar 4 is 7/8 at 120: seven eighths, each a quarter of a second.
    assert_eq!(p.bars[4].start_sample, 384_000);
    assert_eq!(p.bars[5].start_sample, 384_000 + 7 * 12_000);
    // And bar 5 onward is 4/4 at 90: eight thirds of a second.
    let bar_at_90 = (4.0 * 60.0 / 90.0 * 48_000.0) as u64;
    assert_eq!(
        p.bars[6].start_sample - p.bars[5].start_sample,
        bar_at_90,
        "a tempo step lands on the bar line and nowhere else"
    );
}

#[test]
fn the_pass_is_the_sum_of_its_bars_to_the_sample() {
    let t = twelve_bar();
    let p = plan(&t, 44_100, 1);
    // Four bars of 4/4 at 120, one of 7/8 at 120, seven of 4/4 at 90.
    let expected: f64 = 4.0 * 2.0 + 7.0 * 0.25 + 7.0 * (4.0 * 60.0 / 90.0);
    let want = (expected * 44_100.0).round() as u64;
    assert_eq!(p.pass_samples, want);
}

#[test]
fn every_click_lands_where_the_map_says_and_within_one_sample() {
    let t = twelve_bar();
    let rate = 48_000u32;
    let p = plan(&t, rate, 2);
    // Recomputed from the transport rather than from the plan: a test that
    // used the plan's own arithmetic would prove the plan agrees with itself.
    let mut seconds = 0.0f64;
    let mut at = 0usize;
    for (i, bar) in t.bars.iter().enumerate() {
        let bpm = if i < 5 { 120.0 } else { 90.0 };
        let beat = 60.0 / bpm * 4.0 / bar.denominator as f64;
        for b in 0..bar.numerator {
            for sub in 0..2 {
                let want = ((seconds + b as f64 * beat + sub as f64 * beat / 2.0)
                    * rate as f64)
                    .round() as i64;
                let got = p.ticks[at].sample as i64;
                assert!(
                    (got - want).abs() <= 1,
                    "bar {i} beat {b} sub {sub}: {got} frames, the map says {want}"
                );
                at += 1;
            }
        }
        seconds += bar.length_ticks as f64 / TICKS_PER_QUARTER as f64 * 60.0 / bpm;
    }
    assert_eq!(at, p.ticks.len(), "every tick of the map, and no others");
}

#[test]
fn a_tick_carries_the_beat_the_analyzer_has_to_score_against() {
    let t = twelve_bar();
    let p = plan(&t, 48_000, 1);
    // 4/4 at 120: a beat is 500 ms. The 7/8 bar's beat is an eighth, 250 ms.
    assert!((p.ticks[0].interval_ms - 500.0).abs() < 1e-9);
    let seven = p.ticks.iter().find(|t| t.bar == 4).unwrap();
    assert!((seven.interval_ms - 250.0).abs() < 1e-9);
    // And after the step, 4/4 at 90: 666.67 ms.
    let after = p.ticks.iter().find(|t| t.bar == 5).unwrap();
    assert!((after.interval_ms - 60_000.0 / 90.0).abs() < 1e-9);
}

#[test]
fn a_range_starts_at_zero_however_far_into_the_song_it_is() {
    let mut t = twelve_bar();
    t.range = SongRange {
        start_bar: 5,
        end_bar: 8,
    };
    let p = plan(&t, 48_000, 1);
    assert_eq!(p.bars.len(), 4);
    assert_eq!(p.bars[0].index, 5, "the range's first bar is bar 5");
    assert_eq!(p.bars[0].start_sample, 0, "and it starts the pass");
    assert_eq!(p.ticks[0].beat, 0, "the beat count is the pass's, not the song's");
    assert_eq!(p.ticks[0].bar, 5, "but the bar is the song's");
}

#[test]
fn half_speed_is_twice_as_long_everywhere() {
    let t = twelve_bar();
    let full = plan(&t, 48_000, 1);
    let mut half = twelve_bar();
    half.tempo_percent = 50;
    let half = plan(&half, 48_000, 1);
    assert_eq!(half.pass_samples, full.pass_samples * 2);
    for (a, b) in full.ticks.iter().zip(half.ticks.iter()) {
        assert_eq!(b.sample, a.sample * 2, "every tick, not just the first");
        assert!((b.interval_ms - a.interval_ms * 2.0).abs() < 1e-6);
    }
}

// ─── The meter and its accents ───────────────────────────────────────────

#[test]
fn a_bar_opens_strong_and_nothing_else_accents_in_a_simple_meter() {
    let t = twelve_bar();
    let p = plan(&t, 48_000, 1);
    let first: Vec<u8> = p.ticks.iter().filter(|x| x.bar == 0).map(|x| x.accent).collect();
    assert_eq!(
        first,
        vec![AccentLevel::Strong as u8, 0, 0, 0],
        "4/4 is one group of four"
    );
    let seven: Vec<u8> = p.ticks.iter().filter(|x| x.bar == 4).map(|x| x.accent).collect();
    assert_eq!(
        seven,
        vec![AccentLevel::Strong as u8, 0, 0, 0, 0, 0, 0],
        "7/8 divides where the music says, and the file does not say"
    );
}

#[test]
fn a_compound_meter_groups_in_threes() {
    assert_eq!(meter_groups(6, 8), vec![3, 3]);
    assert_eq!(meter_groups(9, 8), vec![3, 3, 3]);
    assert_eq!(meter_groups(12, 8), vec![3, 3, 3, 3]);
    // And everything else is one group.
    assert_eq!(meter_groups(4, 4), vec![4]);
    assert_eq!(meter_groups(3, 8), vec![3]);
    assert_eq!(meter_groups(7, 8), vec![7]);
    assert_eq!(meter_groups(3, 4), vec![3]);
}

#[test]
fn six_eight_has_a_beat_one_and_a_beat_four_that_are_not_the_same_event() {
    let t = SongTransport {
        ticks_per_quarter: TICKS_PER_QUARTER,
        tempo_map: vec![SongTempo { tick: 0, bpm: 120.0 }],
        bars: vec![SongBar {
            start_tick: 0,
            length_ticks: TICKS_PER_QUARTER * 3,
            numerator: 6,
            denominator: 8,
        }],
        range: SongRange { start_bar: 0, end_bar: 0 },
        loops: false,
        tempo_percent: 100,
        count_in_bars: 0,
    };
    let p = plan(&t, 48_000, 1);
    let levels: Vec<u8> = p.ticks.iter().map(|x| x.accent).collect();
    assert_eq!(
        levels,
        vec![
            AccentLevel::Strong as u8,
            0,
            0,
            AccentLevel::Medium as u8,
            0,
            0
        ],
        "the bar's own opening, then a group start inside it"
    );
}

#[test]
fn a_subdivision_tick_is_never_an_accent() {
    let t = twelve_bar();
    let p = plan(&t, 48_000, 4);
    assert!(
        p.ticks.iter().all(|x| x.sub == 0 || x.accent == 0),
        "the sixteenths between the beats mark nothing"
    );
    assert_eq!(
        p.ticks.iter().filter(|x| x.bar == 0).count(),
        16,
        "four beats, four ticks each"
    );
}

#[test]
fn the_last_tick_of_a_bar_is_the_one_that_completes_it() {
    let t = twelve_bar();
    let p = plan(&t, 48_000, 3);
    let bar0: Vec<bool> = p.ticks.iter().filter(|x| x.bar == 0).map(|x| x.bar_complete).collect();
    assert_eq!(bar0.iter().filter(|c| **c).count(), 1);
    assert!(bar0[bar0.len() - 1], "and it is the last one");
}

// ─── The count-in ────────────────────────────────────────────────────────

#[test]
fn a_count_in_is_the_ranges_first_meter_at_the_ranges_first_tempo() {
    let mut t = twelve_bar();
    // Bar 5 onward: 4/4 at 90.
    t.range = SongRange { start_bar: 5, end_bar: 8 };
    t.count_in_bars = 2;
    let p = plan(&t, 48_000, 1);
    assert_eq!(p.count_in.len(), 8, "two bars of four");
    let beat = (60.0f64 / 90.0 * 48_000.0).round() as u64;
    assert_eq!(p.count_in[1].sample, beat);
    assert_eq!(p.count_in_samples, 8 * beat);
    assert!(
        p.count_in.iter().all(|t| t.bar == COUNT_IN_BAR),
        "a count-in is not a bar of the song, and is not 'no song' either"
    );
    assert_ne!(COUNT_IN_BAR, NO_SONG_BAR);
    assert!(
        (COUNT_IN_BAR as usize) > MAX_BARS,
        "neither sentinel can be a real played bar"
    );
    assert_eq!(p.count_in[0].accent, AccentLevel::Strong as u8);
    assert_eq!(p.count_in[4].accent, AccentLevel::Strong as u8);
}

#[test]
fn no_count_in_is_no_count_in() {
    let t = twelve_bar();
    let p = plan(&t, 48_000, 1);
    assert!(p.count_in.is_empty());
    assert_eq!(p.count_in_samples, 0);
}

// ─── What is refused ─────────────────────────────────────────────────────

#[test]
fn a_transport_that_does_not_check_out_is_refused_whole() {
    let bad = |f: fn(&mut SongTransport)| {
        let mut t = twelve_bar();
        f(&mut t);
        plan_range(&t, 48_000, 1).expect_err("this should not have compiled")
    };
    assert!(bad(|t| t.ticks_per_quarter = 480).contains("ticks to a quarter"));
    assert!(bad(|t| t.tempo_percent = 150).contains("%"));
    assert!(bad(|t| t.tempo_percent = 0).contains("%"));
    assert!(bad(|t| t.count_in_bars = 5).contains("count-in"));
    assert!(bad(|t| t.range.end_bar = 99).contains("bars long"));
    assert!(bad(|t| t.range = SongRange { start_bar: 4, end_bar: 2 }).contains("no range"));
    assert!(bad(|t| t.tempo_map.clear()).contains("no tempo"));
    assert!(bad(|t| t.bars.clear()).contains("no bars"));
    assert!(bad(|t| t.tempo_map[0].bpm = 900.0).contains("BPM"));
    assert!(bad(|t| t.bars[3].numerator = 0).contains("1 to"));
    assert!(bad(|t| t.bars[3].denominator = 5).contains("power of two"));
    // A map whose FIRST entry is late is caught by its own check, before the
    // ordering one — the two sentences are different for a reason.
    assert!(bad(|t| t.tempo_map.reverse()).contains("first tempo starts after"));
    assert!(bad(|t| t.tempo_map.push(SongTempo { tick: 100, bpm: 100.0 }))
        .contains("not in order"));
}

#[test]
fn a_song_will_not_build_without_an_output_rate() {
    let t = twelve_bar();
    assert!(plan_range(&t, 0, 1).unwrap_err().contains("no rate"));
}

// ─── General MIDI percussion ─────────────────────────────────────────────

#[test]
fn the_general_midi_drums_land_on_the_kits_voices() {
    assert_eq!(gm_drum(35), Some(KitVoice::Kick));
    assert_eq!(gm_drum(36), Some(KitVoice::Kick));
    assert_eq!(gm_drum(37), Some(KitVoice::Rim));
    assert_eq!(gm_drum(38), Some(KitVoice::Snare));
    assert_eq!(gm_drum(40), Some(KitVoice::Snare));
    assert_eq!(gm_drum(42), Some(KitVoice::Hat));
    assert_eq!(gm_drum(44), Some(KitVoice::HatPedal));
    assert_eq!(gm_drum(46), Some(KitVoice::HatOpen));
    assert_eq!(gm_drum(49), Some(KitVoice::Crash));
    assert_eq!(gm_drum(57), Some(KitVoice::Crash));
    assert_eq!(gm_drum(51), Some(KitVoice::Ride));
    assert_eq!(gm_drum(59), Some(KitVoice::Ride));
    assert_eq!(gm_drum(53), Some(KitVoice::RideBell));
}

#[test]
fn a_tom_fill_stays_a_tom_fill_on_a_kit_with_two_of_them() {
    // GM's six toms, low to high, onto the kit's two — and the order has to
    // survive, or a descending fill comes out as a shuffle.
    let toms: Vec<KitVoice> = [41, 43, 45, 47, 48, 50]
        .into_iter()
        .map(|n| gm_drum(n).unwrap())
        .collect();
    assert_eq!(
        toms,
        vec![
            KitVoice::TomLo,
            KitVoice::TomLo,
            KitVoice::TomLo,
            KitVoice::TomHi,
            KitVoice::TomHi,
            KitVoice::TomHi,
        ]
    );
}

#[test]
fn the_percussion_numbers_reach_the_percussionist() {
    assert_eq!(gm_drum(54), Some(KitVoice::Tambourine));
    assert_eq!(gm_drum(56), Some(KitVoice::Cowbell));
    assert_eq!(gm_drum(60), Some(KitVoice::BongoHi));
    assert_eq!(gm_drum(61), Some(KitVoice::BongoLo));
    assert_eq!(gm_drum(62), Some(KitVoice::CongaHi));
    assert_eq!(gm_drum(63), Some(KitVoice::CongaHi));
    assert_eq!(gm_drum(64), Some(KitVoice::CongaLo));
    assert_eq!(gm_drum(69), Some(KitVoice::Cabasa));
    assert_eq!(gm_drum(70), Some(KitVoice::Shaker));
    assert_eq!(gm_drum(82), Some(KitVoice::Shaker));
    assert_eq!(gm_drum(73), Some(KitVoice::Guiro));
    assert_eq!(gm_drum(74), Some(KitVoice::Guiro));
    assert_eq!(gm_drum(75), Some(KitVoice::Claves));
}

#[test]
fn a_number_with_no_voice_behind_it_is_dropped_and_not_approximated() {
    // The hand clap, the Chinese cymbal, the splash, the vibraslap, the
    // triangle — real instruments this band does not have.
    for n in [39u8, 52, 55, 58, 71, 76, 80, 81, 0, 127] {
        assert_eq!(gm_drum(n), None, "GM {n} has no voice here");
    }
}

// ─── Velocity and the ranges ─────────────────────────────────────────────

#[test]
fn a_velocity_is_a_level_whichever_way_the_importer_sends_it() {
    assert!((velocity_of(0.8) - 0.8).abs() < 1e-6);
    // 100/127, which is what a MIDI file calls mezzo-forte.
    assert!((velocity_of(100.0) - 100.0 / 127.0).abs() < 1e-6);
    assert_eq!(velocity_of(0.0), 0.0);
    assert_eq!(velocity_of(-1.0), 0.0);
    assert_eq!(velocity_of(f32::NAN), 0.0);
    assert_eq!(velocity_of(200.0), 1.0, "and it is still a level");
}

#[test]
fn a_note_outside_a_banks_range_comes_back_in_octaves() {
    // A five-string's low B, an octave under the bank's E1.
    assert_eq!(fold_into(23, BASS_MIN_MIDI, BASS_MAX_MIDI), Some(35));
    // And a bass part written up at the twelfth fret.
    assert_eq!(fold_into(72, BASS_MIN_MIDI, BASS_MAX_MIDI), Some(48));
    // A note already inside is left where it is.
    assert_eq!(fold_into(40, BASS_MIN_MIDI, BASS_MAX_MIDI), Some(40));
    assert_eq!(fold_into(60, KEYS_MIN_MIDI, KEYS_MAX_MIDI), Some(60));
    assert_eq!(fold_into(24, KEYS_MIN_MIDI, KEYS_MAX_MIDI), Some(48));
    // Five octaves down is still the same note, so a range that HOLDS an
    // octave of the pitch is reached however far away it starts.
    assert_eq!(fold_into(0, 60, 64), Some(60));
    // A range narrower than an octave that holds no octave of the note
    // cannot be reached at all, and says so rather than looping.
    assert_eq!(fold_into(60, 61, 64), None);
}

// ─── The mix ─────────────────────────────────────────────────────────────

#[test]
fn a_mix_is_clamped_and_never_nan() {
    let g = SongMix {
        click: 9.0,
        count_in: f32::NAN,
        tracks: vec![-1.0, f32::NAN, 0.5],
    }
    .gains();
    assert_eq!(g.click, MIX_MAX);
    assert_eq!(g.count_in, 1.0, "a NaN count-in is a count-in at unity");
    assert_eq!(g.track(0), MIX_MIN);
    assert_eq!(g.track(1), 1.0, "a NaN fader is a fader at unity");
    assert_eq!(g.track(2), 0.5);
    // A file with more tracks than the mix was sent for plays them, rather
    // than playing them silently: a band nobody has touched is a band at the
    // level the arrangement was written at.
    assert_eq!(g.track(9), 1.0);
}

/// The band arrives at the level the arrangement was written at, and the
/// click arrives under it — see `DEFAULT_CLICK_MIX` for why a song's click is
/// not the metronome's.
#[test]
fn the_default_mix_leaves_the_band_alone_and_the_click_under_it() {
    let g = SongMixGains::default();
    assert!(g.tracks.iter().all(|t| *t == 1.0));
    assert!(
        g.click < 1.0 && g.click > 0.0,
        "the click is a reference over a song, not the loudest thing in it"
    );
    assert_eq!(g.count_in, g.click, "a count-in you cannot hear is not one");
}

/// The count-in has a dial of its own, and it is not the click's (W34 item 7).
///
/// Songs turns the click off by default over a song that has parts of its own
/// — the owner's click sound is a kit, so a click ticking through every bar is
/// a drummer playing along — and the count-in is the one thing that cannot go
/// off with it, because it is how you know when to come in.
#[test]
fn the_count_in_still_sounds_when_the_click_is_off() {
    let g = SongMix {
        click: 0.0,
        count_in: 0.45,
        tracks: vec![1.0],
    }
    .gains();
    assert_eq!(g.click, 0.0, "the click through the piece is off");
    assert_eq!(g.count_in, 0.45, "the count-in still counts you in");
}

/// A file with no drums in it puts no drum in the band (W34 item 7).
///
/// The owner's report — *"is the drums playing by default? i've played tabs
/// with no drums and it still plays them"* — had two candidates, and the one
/// that turned out to be it is the CLICK, whose sound on his machine is a kit.
/// This is the other one, asked directly of the compiled table rather than
/// reasoned about: only a track the importer called `Drums` can put a note on
/// the drum lane, and a guitar cannot become one by being loud.
#[test]
fn a_song_with_no_percussion_track_compiles_no_drum() {
    let t = twelve_bar();
    let backing = guitar_track();
    assert!(
        backing.tracks.iter().all(|track| track.role != SongRole::Drums),
        "the fixture is a guitar, and a guitar is not a drum"
    );
    let table = crate::song::compile(&t, Some(&backing), bare_sounds(), 48_000, 1)
        .expect("the song compiles");
    assert!(table.played_notes > 0, "the guitar plays");
    // The sampled band — the kit, the bass and the keys — has nothing on the
    // drum lane. (The guitar itself is on the synthesiser, which has no drums
    // to reach for at all: `SongRole::Synth` never touches `drum_slot`.)
    assert!(
        table.band().iter().all(|e| e.lane != SongLane::Drums),
        "a file with no percussion track put a note on the drum lane"
    );
}

/// And a webview that has never heard of the field still gets a count-in.
#[test]
fn a_mix_without_a_count_in_counts_at_the_click_s_usual_level() {
    let mix: SongMix = serde_json::from_str(r#"{"click":0.0,"tracks":[1.0]}"#)
        .expect("an older mix still deserialises");
    assert_eq!(
        mix.gains().count_in,
        SongMixGains::default().click,
        "a missing countIn is the click's usual level, not silence"
    );
}


// ─── The synthesised half of the band ────────────────────────────────────

/// The sounds a song compiles against, with the recorded kit out of the way
/// so a test about the synthesiser is about the synthesiser.
fn bare_sounds() -> SongSounds {
    let kits = crate::kit::KitCache::default();
    SongSounds {
        bank: kits
            .shipped(crate::engine::JamKit::fallback().0, 48_000)
            .expect("the fallback kit decodes"),
        perc: None,
        voices: crate::jam::JamVoices::default(),
    }
}

/// A guitar on every beat of the twelve-bar piece, as the importer sends one.
fn guitar_track() -> SongBacking {
    let t = twelve_bar();
    let mut notes = Vec::new();
    for bar in t.bars.iter() {
        let beat_ticks = TICKS_PER_QUARTER * 4 / bar.denominator;
        for beat in 0..bar.numerator {
            notes.push(SongNote {
                tick: bar.start_tick + beat * beat_ticks,
                dur_ticks: beat_ticks,
                midi: 64,
                velocity: 0.8,
            });
        }
    }
    SongBacking {
        tracks: vec![SongTrack {
            role: SongRole::Synth,
            name: "Guitar".into(),
            program: 29,
            guide: false,
            bends: Vec::new(),
            notes,
        }],
    }
}

/// **Half speed is the same piece, played slowly.**
///
/// Every note-on the synthesiser is given must sit on the beat the schedule
/// says it does, whatever `tempoPercent` is — so the check is not on samples,
/// which double, but on the BEAT each note-on falls on, which must not move.
/// That is the same claim `the_gate` makes about the click and the recorded
/// band, made about the half of the band a different thread plays, because a
/// guitar a beat out at 50 % is a guitar the player is practising against.
#[test]
fn tempo_does_not_move_a_synth_note_off_its_beat() {
    let rate = 48_000u32;
    let mut beats_at: Vec<Vec<f64>> = Vec::new();
    for percent in [100u32, 50] {
        let mut t = twelve_bar();
        t.tempo_percent = percent;
        let table = compile(&t, Some(&guitar_track()), bare_sounds(), rate, 1)
            .expect("the song compiles");
        let score = table.synth_score.as_ref().expect("a synthesised part");
        let bars = table.bars();
        let mut beats = Vec::new();
        for e in score.events.iter() {
            if !matches!(e.kind, crate::synth::SynthEventKind::NoteOn { .. }) {
                continue;
            }
            // Which bar the frame is in, and how far into it in beats — the
            // bar's own tempo, which is where `tempoPercent` already is.
            let at = match bars.binary_search_by(|b| b.start_sample.cmp(&e.sample)) {
                Ok(i) => i,
                Err(0) => 0,
                Err(i) => i - 1,
            };
            let bar = &bars[at];
            let into_seconds = (e.sample - bar.start_sample) as f64 / rate as f64;
            let beats_into = into_seconds * bar.bpm / 60.0;
            // Bars from the top, in the meter's own beats, so the 7/8 counts
            // as seven eighths rather than as three and a half quarters.
            beats.push(at as f64 + (beats_into * bar.denominator as f64 / 4.0).round() / 16.0);
        }
        beats_at.push(beats);
    }
    assert_eq!(
        beats_at[0].len(),
        beats_at[1].len(),
        "half speed played a different number of notes",
    );
    for (n, (full, half)) in beats_at[0].iter().zip(beats_at[1].iter()).enumerate() {
        assert!(
            (full - half).abs() < 1e-6,
            "note {n} is on beat {full} at 100 % and on beat {half} at 50 %",
        );
    }
}

/// A file with more parts than MIDI has channels still plays the ones it can,
/// and the seventeenth is counted rather than silently gone.
#[test]
fn a_synth_track_gets_a_channel_of_its_own_and_never_the_percussion_one() {
    let rate = 48_000u32;
    let t = twelve_bar();
    let one = guitar_track();
    let mut many = SongBacking { tracks: Vec::new() };
    for _ in 0..12 {
        many.tracks.push(one.tracks[0].clone());
    }
    let table = compile(&t, Some(&many), bare_sounds(), rate, 1).expect("the song compiles");
    let score = table.synth_score.as_ref().expect("a synthesised part");
    // Channel 9 is percussion in every General MIDI set ever written, so a
    // guitar put on it plays a cymbal.
    assert_eq!(
        score.channel_track[crate::synth::PERCUSSION_CHANNEL as usize],
        u8::MAX,
        "a melodic part was put on the percussion channel",
    );
    // Twelve parts, twelve channels, each answering to its own fader.
    let claimed: Vec<u8> = score
        .channel_track
        .iter()
        .copied()
        .filter(|t| *t != u8::MAX)
        .collect();
    assert_eq!(claimed.len(), 12);
    let mut sorted = claimed.clone();
    sorted.sort_unstable();
    sorted.dedup();
    assert_eq!(sorted.len(), 12, "two parts share a fader: {claimed:?}");
}


// ─── Going to a place in the song that is playing ────────────────────────
//
// The owner, after his first session: "when i click on the tab [it should be]
// just going to that place". W29 made the click move the playhead; this is
// what makes it move while the piece is sounding, without stopping it — and
// stopping it is not a smaller thing than it sounds, because stopping ends
// the attempt and raises the review (`COACH_UX.md` A3).
//
// `SongTable::seek` is the whole of the arithmetic, so it is the whole of
// what these ask about. What the callback adds to it is cutting the voices
// that are ringing and bumping the synthesiser's ring, neither of which is a
// number.

/// A table to seek about in: the twelve-bar piece with a kit behind it.
fn seekable(percent: u32, loops: bool) -> SongTable {
    let mut t = twelve_bar();
    t.tempo_percent = percent;
    t.loops = loops;
    if loops {
        t.range = SongRange {
            start_bar: 2,
            end_bar: 5,
        };
    }
    let mut notes = Vec::new();
    for bar in t.bars.iter() {
        let beat_ticks = TICKS_PER_QUARTER * 4 / bar.denominator;
        for beat in 0..bar.numerator {
            notes.push(SongNote {
                tick: bar.start_tick + beat * beat_ticks,
                dur_ticks: beat_ticks,
                midi: if beat == 0 { 36 } else { 42 },
                velocity: 0.9,
            });
        }
    }
    let backing = SongBacking {
        tracks: vec![SongTrack {
            role: SongRole::Drums,
            name: "Drums".into(),
            program: 0,
            guide: false,
            bends: Vec::new(),
            notes,
        }],
    };
    compile(&t, Some(&backing), bare_sounds(), 48_000, 1).expect("the song compiles")
}

#[test]
fn a_seek_forward_lands_on_the_bar_and_leaves_no_event_behind_it() {
    let table = seekable(100, false);
    let bars = table.bars();
    let to = table.seek(bars[7].start_sample, 0);
    assert_eq!(to.sample, bars[7].start_sample, "a bar line is where it says");
    // Nothing before the target may sound again: the next click and the next
    // drum are both at or after it.
    assert!(table.ticks()[to.tick_at].sample >= to.sample);
    assert!(table.band()[to.band_at].sample >= to.sample);
    // And nothing at it is skipped — a click on bar 8 hears bar 8's downbeat.
    assert_eq!(
        table.ticks()[to.tick_at].sample,
        to.sample,
        "the bar's own click was stepped over",
    );
    assert_eq!(table.ticks()[to.tick_at].bar, bars[7].index);
    assert_eq!(table.band()[to.band_at].sample, to.sample, "and its downbeat");
}

#[test]
fn a_seek_backward_puts_the_cursors_back_rather_than_only_the_position() {
    // The bug this is here to catch is a position that moves while the walks
    // do not: the transport says bar 2 and the next click that sounds is bar
    // 9's, because the cursor was never wound back.
    let table = seekable(100, false);
    let bars = table.bars();
    let far = table.seek(bars[9].start_sample, 0);
    let back = table.seek(bars[1].start_sample, 0);
    assert!(back.tick_at < far.tick_at, "the click walk did not go back");
    assert!(back.band_at < far.band_at, "the band's walk did not go back");
    assert_eq!(table.ticks()[back.tick_at].bar, bars[1].index);
}

#[test]
fn a_seek_exactly_on_a_bar_line_is_that_bar_and_not_the_one_before_it() {
    // Every bar of the piece, by its own first sample. The off-by-one here
    // would be silent and constant: every click on the tab landing a bar
    // early, which reads as "the cursor is wrong" rather than as a seek bug.
    let table = seekable(100, false);
    for bar in table.bars() {
        let to = table.seek(bar.start_sample, 0);
        assert_eq!(to.sample, bar.start_sample);
        assert_eq!(
            table.ticks()[to.tick_at].bar,
            bar.index,
            "seeking to bar {} landed in bar {}",
            bar.index,
            table.ticks()[to.tick_at].bar,
        );
    }
}

#[test]
fn a_seek_inside_a_looping_portion_keeps_the_piece_s_own_clock_going_forward() {
    // The invariant the synthesiser's renderer reads: `play` counts every
    // frame of the piece, seams included, so it must not fall back into an
    // earlier pass when somebody clicks a bar on the third time round. The
    // POSITION goes back; the clock does not.
    let table = seekable(100, true);
    assert!(table.loops());
    let bars = table.bars();
    let pass = table.pass_samples();
    let on_the_third = table.seek(bars[1].start_sample, 2);
    assert_eq!(on_the_third.sample, bars[1].start_sample);
    assert_eq!(
        on_the_third.play,
        2 * pass + bars[1].start_sample,
        "the clock the renderer reads slipped a pass",
    );
    // And the renderer's own modulo brings it back to the same place in the
    // range, which is what keeps the two threads on one sample.
    assert_eq!(on_the_third.play % pass, on_the_third.sample);
    // A seek past the end of the portion is the end of the portion, not
    // silence and not a cursor outside the table.
    let past = table.seek(pass * 4, 0);
    assert_eq!(past.sample, pass - 1);
    assert!(past.tick_at <= table.ticks().len());
    assert!(past.band_at <= table.band().len());
}

#[test]
fn a_seek_at_half_speed_goes_to_the_same_bar_in_the_music() {
    // Half speed doubles every sample position, so a seek that was computed
    // in samples and not in bars would land in the middle of the piece. What
    // is asserted is the BAR, which is what the player clicked on.
    let full = seekable(100, false);
    let half = seekable(50, false);
    assert_eq!(half.pass_samples(), full.pass_samples() * 2);
    for n in [0usize, 3, 4, 7, 11] {
        let a = full.seek(full.bars()[n].start_sample, 0);
        let b = half.seek(half.bars()[n].start_sample, 0);
        assert_eq!(b.sample, a.sample * 2, "bar {n} is not twice as far in");
        assert_eq!(
            full.ticks()[a.tick_at].bar,
            half.ticks()[b.tick_at].bar,
            "bar {n} at 50 % landed somewhere else in the music",
        );
        // The same click of the same bar, not merely the same bar.
        assert_eq!(full.ticks()[a.tick_at].beat, half.ticks()[b.tick_at].beat);
    }
}

#[test]
fn a_seek_to_the_very_top_is_a_seek_and_not_a_sentinel() {
    // Bar one is the commonest seek there is — pressing Home, or clicking
    // the first bar — and `SongHandoff` carries a seek as `sample + 1` so
    // that a target of nought is still a target. This is that, from the
    // table's side: it has to be an ordinary answer.
    let table = seekable(100, false);
    let to = table.seek(0, 0);
    assert_eq!(to.sample, 0);
    assert_eq!(to.tick_at, 0);
    assert_eq!(to.band_at, 0);
    assert_eq!(to.play, 0);
}
