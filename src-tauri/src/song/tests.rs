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
        drums: -1.0,
        bass: f32::NAN,
        keys: 0.5,
    }
    .gains();
    assert_eq!(g.click, MIX_MAX);
    assert_eq!(g.lane(SongLane::Drums), MIX_MIN);
    assert_eq!(g.lane(SongLane::Bass), 1.0, "a NaN fader is a fader at unity");
    assert_eq!(g.lane(SongLane::Keys), 0.5);
}

/// The band arrives at the level the arrangement was written at, and the
/// click arrives under it — see `DEFAULT_CLICK_MIX` for why a song's click is
/// not the metronome's.
#[test]
fn the_default_mix_leaves_the_band_alone_and_the_click_under_it() {
    let g = SongMixGains::default();
    assert_eq!(g.lanes, [1.0, 1.0, 1.0]);
    assert!(
        g.click < 1.0 && g.click > 0.0,
        "the click is a reference over a song, not the loudest thing in it"
    );
}
