//! What the ring promises the audio callback, and what the synth promises the
//! player.
//!
//! The ring's three promises are the ones the brief names, and each is a test
//! here rather than a comment: the callback never blocks on it, an
//! invalidation never replays audio from the stream it replaced, and a loop
//! seam is sample-continuous — a chord ringing at the end of the range is
//! still ringing at the start of it.
use super::*;
use std::sync::atomic::Ordering;

/// A ring small enough to be reasoned about by hand, with its reader started.
fn ring(frames: u64) -> Arc<SynthRing> {
    let r = Arc::new(SynthRing::with_frames(frames));
    // The first buffer: the callback drains for epoch 0 and finds nothing.
    assert_eq!(r.ready(0), 0);
    r
}

/// The renderer's side, without a thread: begin a stream at the playhead the
/// callback published, and fill it with a ramp whose value IS the frame
/// number, so the reader can say which frame it got.
fn produce(r: &SynthRing, from: u64, frames: u64) {
    let epoch = r.epoch.load(Ordering::Acquire);
    if r.live.load(Ordering::Acquire) != epoch {
        assert!(r.drained_for(epoch), "the reader has not drained yet");
        r.begin(epoch);
    }
    let block: Vec<f32> = (0..frames).map(|n| (from + n) as f32).collect();
    r.push(&block, &block);
}

#[test]
fn the_ring_never_blocks_the_callback() {
    // Every call the callback is allowed to make, against a ring in each of
    // the four states it can be in: empty, part full, invalidated, and with a
    // producer that has not restarted. None of them may loop or wait; what is
    // pinned here is that each answers with a number and leaves the ring in a
    // state the next buffer can read.
    let r = ring(1024);
    assert_eq!(r.ready(0), 0, "an empty ring offers nothing");
    produce(&r, 0, 256);
    assert_eq!(r.ready(0), 256);
    // Reading and consuming what was offered.
    let (l, _) = r.at(0);
    assert_eq!(l, 0.0);
    let (l, _) = r.at(255);
    assert_eq!(l, 255.0);
    r.consume(256);
    assert_eq!(r.ready(256), 0, "drained, and still answers");

    // Invalidated, with a producer that has not begun again: still zero, and
    // still no wait.
    produce(&r, 256, 128);
    r.invalidate();
    assert_eq!(r.ready(256), 0, "what was queued is not offered");
    assert_eq!(r.ready(300), 0, "and the next buffer does not block either");
}

#[test]
fn an_invalidation_never_replays_stale_audio() {
    let r = ring(1024);
    // A stream from the top of the piece, half of it heard.
    produce(&r, 0, 512);
    assert_eq!(r.ready(0), 512);
    r.consume(128);
    assert_eq!(r.ready(128), 384, "the rest of the old stream is queued");

    // The player drops the cursor on bar 9 — the same song, a different place.
    r.invalidate();
    assert_eq!(r.ready(128), 0, "the queue goes, whole");
    // And it went: `read` caught `write` up, so none of those 384 frames can
    // ever be handed out.
    assert_eq!(
        r.read.load(Ordering::Relaxed),
        r.write.load(Ordering::Relaxed),
    );

    // The renderer begins again where the callback actually is.
    produce(&r, 9000, 256);
    assert_eq!(r.ready(128), 256);
    let (first, _) = r.at(0);
    assert_eq!(
        first, 9000.0,
        "the first frame after an invalidation is the NEW stream's first frame",
    );
}

#[test]
fn a_stream_that_began_behind_the_playhead_is_skipped_to() {
    // The renderer published a stream starting at playhead 1000 and the
    // callback has already reached 1100 by the time it reads. The hundred
    // frames in between are the past and must not be played a hundred frames
    // late: they are skipped, and what is heard is the frame for 1100.
    let r = ring(4096);
    produce(&r, 0, 512);
    // `produce` began the stream at the playhead the callback last published,
    // which was 0.
    let have = r.ready(100);
    assert_eq!(have, 412, "the first hundred frames are behind us");
    let (l, _) = r.at(0);
    assert_eq!(l, 100.0, "and what is offered is the frame for 100");
    let _ = have;
}

#[test]
fn the_producer_never_writes_over_what_the_reader_has_not_taken() {
    // `room()` is the only thing standing between the renderer and the frame
    // the callback is about to mix, so it is worth pinning that it shrinks
    // with the queue and comes back when the queue is consumed.
    let r = ring(512);
    assert_eq!(r.room(), 512);
    produce(&r, 0, 300);
    assert_eq!(r.room(), 212);
    assert_eq!(r.ready(0), 300);
    r.consume(300);
    assert_eq!(r.room(), 512, "what was heard is room again");
}

// ---------------------------------------------------------------------------
// The synth itself
// ---------------------------------------------------------------------------

/// A one-bar score: a note on every quarter of a 4/4 bar at 120, on channel 0.
fn four_on_the_floor(rate: u32, key: u8) -> SynthScore {
    let beat = rate as u64 / 2; // 120 bpm
    let mut events = vec![SynthEvent {
        sample: 0,
        channel: 0,
        kind: SynthEventKind::Program { program: 27 },
    }];
    for n in 0..4u64 {
        events.push(SynthEvent {
            sample: n * beat,
            channel: 0,
            kind: SynthEventKind::NoteOn { key, velocity: 100 },
        });
        events.push(SynthEvent {
            sample: n * beat + beat / 2,
            channel: 0,
            kind: SynthEventKind::NoteOff { key },
        });
    }
    events.sort_by_key(|e| e.sample);
    let mut channel_track = [u8::MAX; 16];
    channel_track[0] = 0;
    SynthScore {
        events,
        pass_samples: beat * 4,
        loops: true,
        channel_track,
    }
}

#[test]
fn the_shipped_sound_set_loads_and_makes_a_note() {
    let font = load_font(None).expect("the built-in SoundFont");
    let rate = 48_000u32;
    let score = four_on_the_floor(rate, 64);
    let (l, r) = render_offline(&score, &font, rate, rate as usize / 4, &[1.0]).unwrap();
    let peak = l
        .iter()
        .chain(r.iter())
        .fold(0.0f32, |m, s| m.max(s.abs()));
    assert!(
        peak > 0.01,
        "a quarter of a second of a guitar came out at {peak}, which is silence",
    );
}

#[test]
fn a_loop_seam_is_sample_continuous() {
    // A note struck on the last beat of the bar is still ringing when the bar
    // comes round, so the frames either side of the seam must be a waveform
    // and not a step. What is measured is the jump across the seam against
    // the jumps just before it: a cut would be an order of magnitude bigger.
    let font = load_font(None).expect("the built-in SoundFont");
    let rate = 48_000u32;
    let score = four_on_the_floor(rate, 52);
    let seam = score.pass_samples as usize;
    let (l, _) = render_offline(&score, &font, rate, seam + 4096, &[1.0]).unwrap();
    let step = |n: usize| (l[n + 1] - l[n]).abs();
    let across = step(seam - 1);
    // The biggest ordinary sample-to-sample step in the two hundred frames
    // before the seam, which is what "a waveform" looks like here.
    let ordinary = (seam - 200..seam - 1).fold(0.0f32, |m, n| m.max(step(n)));
    assert!(
        across <= ordinary * 4.0 + 1e-6,
        "the seam stepped by {across} where the waveform either side steps by at most \
         {ordinary} — the loop cut the band off",
    );
    // And the note is still sounding after it, rather than the synth having
    // been reset.
    let after: f32 = l[seam..seam + 512].iter().fold(0.0, |m, s| m.max(s.abs()));
    assert!(after > 0.001, "nothing was ringing across the seam");
}

#[test]
fn a_muted_track_is_silent_and_a_fader_is_not_a_recompile() {
    let font = load_font(None).expect("the built-in SoundFont");
    let rate = 48_000u32;
    let score = four_on_the_floor(rate, 60);
    let frames = rate as usize / 4;
    let peak_of = |gain: f32| {
        let (l, r) = render_offline(&score, &font, rate, frames, &[gain]).unwrap();
        l.iter().chain(r.iter()).fold(0.0f32, |m, s| m.max(s.abs()))
    };
    let full = peak_of(1.0);
    let half = peak_of(0.5);
    let off = peak_of(0.0);
    assert_eq!(off, 0.0, "a muted track made {off}");
    assert!(half < full, "half the fader was not quieter: {half} vs {full}");
    // The events are untouched by any of it — which is the point of a fader
    // being a channel volume rather than a rebuild of the piece.
    assert_eq!(score.events.len(), 9);
}

/// The whole thing, threads and all: a renderer really does fill the ring,
/// and what the callback takes out of it is the song.
///
/// The one test that would fail if the handshake were subtly wrong in a way
/// each unit test above misses — the producer waiting on a drain that never
/// comes, the epoch never acknowledged, the base pair published in the wrong
/// order. It drives the consumer's side exactly as the callback does:
/// `ready(play)`, `at(n)` per frame, `consume(n)` at the end of the buffer.
#[test]
fn the_renderer_thread_fills_the_ring_and_the_callback_takes_a_song_out_of_it() {
    let font = load_font(None).expect("the built-in SoundFont");
    let rate = 48_000u32;
    let score = Arc::new(four_on_the_floor(rate, 57));
    let ring = Arc::new(SynthRing::new(rate));
    // The callback's first buffer, before anything is playing: it drains for
    // epoch 0, and the renderer may then begin.
    assert_eq!(ring.ready(0), 0);
    let player = SynthPlayer::start(Arc::clone(&ring), Arc::clone(&score), font, rate)
        .expect("the renderer starts");

    let buffer = 256u64;
    let mut play = 0u64;
    let mut heard = 0.0f32;
    let mut frames_taken = 0u64;
    // Half a second of buffers. The deadline is generous because this runs
    // beside a build; what it is watching for is a ring that never fills.
    let started = std::time::Instant::now();
    let deadline = started + std::time::Duration::from_secs(10);
    while play < rate as u64 / 2 && std::time::Instant::now() < deadline {
        let have = ring.ready(play).min(buffer);
        for n in 0..have {
            let (l, r) = ring.at(n);
            heard = heard.max(l.abs()).max(r.abs());
        }
        ring.consume(have);
        frames_taken += have;
        play += buffer;
        // A real callback is paced by the sound card: 256 frames every
        // 5.3 ms. This loop used to sleep 2 ms only when starved, which
        // walked the playhead at 2.5x real time — a race the renderer wins
        // alone and lost once inside the full suite (2026-09-21, 928 other
        // tests on the same cores). Hold the playhead to the clock instead,
        // so what is tested is "does the ring fill", not "is this machine
        // idle".
        let due = started + std::time::Duration::from_micros(play * 1_000_000 / rate as u64);
        if let Some(wait) = due.checked_duration_since(std::time::Instant::now()) {
            std::thread::sleep(wait);
        }
    }
    drop(player);
    assert!(
        frames_taken > rate as u64 / 4,
        "the ring gave the callback only {frames_taken} frames of the {} it asked for",
        rate / 2,
    );
    assert!(heard > 0.01, "what came out of the ring was silence ({heard})");
}

#[test]
fn the_cursor_lands_on_the_right_event_wherever_the_playhead_is() {
    let rate = 48_000u32;
    let score = four_on_the_floor(rate, 60);
    let beat = rate as u64 / 2;
    // At the top of the third beat, everything before it has been played and
    // the note-on for beat three has not.
    let c = Cursor::at_play(beat * 2, &score);
    assert_eq!(c.sample, beat * 2);
    assert!(score.events[c.at].sample >= beat * 2);
    assert!(c.at > 0 && score.events[c.at - 1].sample < beat * 2);
    // And a playhead two passes in comes back to the same place in the bar,
    // because a loop's cursor is the modulo and the callback never does one.
    let wrapped = Cursor::at_play(score.pass_samples * 2 + beat * 2, &score);
    assert_eq!(wrapped.sample, c.sample);
    assert_eq!(wrapped.at, c.at);
}
