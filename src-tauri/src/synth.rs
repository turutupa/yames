//! The instrument for everything the sampled band cannot play — and the ring
//! that keeps it off the audio callback.
//!
//! `plans/tasks/songs/W28-HEAR-THE-SONG.md`. Until this existed the engine
//! played a file's drums, bass and pianos through Jam's recorded band and
//! dropped every other track, which for the ordinary two-guitar tab meant
//! pressing play and hearing a metronome. A General MIDI synthesiser reading a
//! SoundFont plays the rest: the guitars, the strings, the horns, and the
//! player's own part as the guide every tab player has.
//!
//! ## Why it is not on the callback, and never will be
//!
//! `AGENTS.md` — "the click is sacred". The sampled band's cost per frame is
//! bounded and known: a voice is a read out of a decoded buffer and a
//! multiply. A SoundFont voice is an oscillator, an envelope, a filter and an
//! interpolator, and a bar of a dense arrangement can ask for forty of them at
//! once. That is not a cost you put under a metronome somebody is practising
//! to.
//!
//! So the synth runs on **its own thread**, ahead of the playhead, into a
//! pre-allocated lock-free ring, and the callback's whole job is to add
//! frames that are already there. A song is deterministic, so running ahead is
//! always possible. The contract with the callback is the one the whole engine
//! runs on:
//!
//! * **Nothing is allocated, freed or locked by the reader.** The ring's
//!   buffer is allocated once, when the song is compiled, and travels inside
//!   the `Arc<SongTable>` that names it — so it retires down the same path,
//!   on a thread that may `free()`.
//! * **The reader never blocks.** An empty ring is silence from the synth for
//!   a few milliseconds and nothing at all to the click or the sampled band,
//!   which are mixed by paths this one cannot reach.
//! * **The reader never hears stale audio.** A seek, a range change or a new
//!   table bumps [`SynthRing::invalidate`]; the callback throws away what is
//!   queued in constant time, and the renderer does not begin the new stream
//!   until it has.
//!
//! ## How the two threads stay in step, to the sample
//!
//! Both sides count frames, and neither trusts a clock. The renderer writes a
//! contiguous musical stream and publishes the pair `(base_write, base_play)`:
//! the ring index its stream starts at, and the playhead position that index
//! stands for. The callback wants the frame for playhead `play`, which is
//! index `base_write + (play - base_play)`, and it either skips forward to it
//! — that is what throwing stale audio away IS — or waits for the stream to
//! reach it. After the first frame both advance by one per output frame, so
//! they stay aligned until something invalidates, and a loop seam does not:
//! the renderer wraps its own cursor and goes on rendering, so notes ring
//! across the seam exactly as they do in the file.
//!
//! ## The lead
//!
//! [`SYNTH_LEAD_MS`] is how far ahead the renderer works. It is the one number
//! with two sides pulling on it. Too little and a loaded machine underruns and
//! the guitars flicker; too much and a fader move is not heard until the
//! queued audio has drained, because a fader is a channel volume the renderer
//! applies to the block it is rendering NOW. 120 ms is inside the
//! "a fader is heard within 100–150 ms" the brief asks for and is four times
//! the worst render block this has been measured at.
use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;

use rustysynth::{SoundFont, Synthesizer, SynthesizerSettings};

/// How far ahead of the playhead the renderer works, in milliseconds.
pub const SYNTH_LEAD_MS: u64 = 120;

/// And how much the ring holds. Four times the lead, so a thread that was not
/// scheduled for a hundred milliseconds has somewhere to catch up into rather
/// than a full ring it must spin on.
pub const SYNTH_RING_MS: u64 = 480;

/// The most tracks of a file the engine gives a fader of its own.
///
/// Sixteen because MIDI has sixteen channels and Guitar Pro is written
/// against that same limit — a file with more parts than this was not written
/// to be played back. The seventeenth track and beyond share the last
/// channel, and the importer says so rather than dropping them.
pub const MAX_SONG_TRACKS: usize = 16;

/// The channel percussion is always on, in every General MIDI file ever
/// written.
pub const PERCUSSION_CHANNEL: u8 = 9;

/// The longest run of frames the renderer produces without looking at the
/// clock, the mix or the epoch again.
///
/// Small enough that a fader or an invalidation is picked up promptly, big
/// enough that the per-block overhead is nothing beside the synthesis.
const RENDER_CHUNK: usize = 256;

/// How long the renderer sleeps when it is far enough ahead.
///
/// It is not a spin: a thread that busy-waits beside an audio callback is a
/// core the callback is not getting. Two milliseconds is a twentieth of the
/// lead, so the queue never runs down while it naps.
const RENDER_NAP: std::time::Duration = std::time::Duration::from_millis(2);

// ---------------------------------------------------------------------------
// What the renderer plays
// ---------------------------------------------------------------------------

/// One thing the synth is told, at the frame of the pass it happens on.
///
/// Note-offs are events of their own rather than a duration on the note-on,
/// because that is what lets a let-ring chord and a palm-muted eighth live in
/// the same list: the file's own MIDI generation decided both durations, and
/// the renderer only has to play them.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SynthEvent {
    /// Frames from the first frame of the range.
    pub sample: u64,
    /// The MIDI channel, which is also the voice: one per track.
    pub channel: u8,
    pub kind: SynthEventKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SynthEventKind {
    NoteOn { key: u8, velocity: u8 },
    NoteOff { key: u8 },
    /// A bend, as MIDI writes one: 0..=16383 with 8192 at rest. Slides and
    /// bends both arrive as these, which is why neither had to be invented
    /// here.
    Bend { value: u16 },
    /// Which General MIDI instrument this channel is, from the file.
    Program { program: u8 },
}

/// A song's synth part: the events of one pass, and how long a pass is.
#[derive(Debug)]
pub struct SynthScore {
    /// Sorted by `sample`. Two events on one frame are two entries.
    pub events: Vec<SynthEvent>,
    /// How long one pass is, in frames. The seam, to the sample.
    pub pass_samples: u64,
    pub loops: bool,
    /// Which fader each channel answers to — an index into the mix's tracks.
    /// `u8::MAX` for a channel no track claimed.
    pub channel_track: [u8; 16],
}

// ---------------------------------------------------------------------------
// The ring
// ---------------------------------------------------------------------------

/// The pre-allocated, lock-free stereo ring between the renderer and the
/// audio callback, and the handshake that keeps them on the same sample.
///
/// One producer (the renderer thread) and one consumer (the audio callback).
/// Every field is owned by exactly one of the three threads that touch it, and
/// the comment on each says which — that ownership is the whole proof, and a
/// second writer to any of them is a bug rather than a race to be tuned.
pub struct SynthRing {
    /// Interleaved stereo. Allocated once; never grown, never freed here.
    buf: UnsafeCell<Box<[f32]>>,
    /// How many stereo frames it holds.
    frames: u64,

    // ---- producer only ----
    /// Frames written since this ring was made. Monotonic across epochs.
    write: AtomicU64,
    /// The `write` index the current stream begins at, and the playhead that
    /// index stands for. Written before `live`, so a consumer that sees the
    /// new epoch is guaranteed to read the pair that goes with it.
    base_write: AtomicU64,
    base_play: AtomicU64,
    /// The epoch the renderer is producing for.
    live: AtomicU64,

    // ---- consumer only ----
    /// Frames the callback has taken.
    read: AtomicU64,
    /// Where the callback is, in frames since the song started. The renderer
    /// reads it to know how far ahead it is.
    play: AtomicU64,
    /// The epoch the callback has thrown the old stream away for.
    drained: AtomicU64,

    // ---- the command thread ----
    /// Bumped whenever what is queued stopped being true.
    epoch: AtomicU64,
    /// The mix, one gain per track, as `f32::to_bits`. Read by the renderer
    /// once a block; a fader is a channel volume and not a recompile.
    gains: [AtomicU32; MAX_SONG_TRACKS],
    /// Set when the song goes away and the renderer should stop.
    stop: AtomicBool,
}

// SAFETY: `buf` is written only by the producer, at indices at or past
// `write`, and read only by the consumer, at indices before `write` and at or
// past `read`. The producer never writes past `read + frames`, so the two
// ranges cannot overlap. Everything else in here is an atomic.
unsafe impl Sync for SynthRing {}
unsafe impl Send for SynthRing {}

impl std::fmt::Debug for SynthRing {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SynthRing")
            .field("frames", &self.frames)
            .field("write", &self.write.load(Ordering::Relaxed))
            .field("read", &self.read.load(Ordering::Relaxed))
            .field("epoch", &self.epoch.load(Ordering::Relaxed))
            .field("live", &self.live.load(Ordering::Relaxed))
            .finish()
    }
}

impl SynthRing {
    /// A ring long enough for [`SYNTH_RING_MS`] at `rate`.
    pub fn new(rate: u32) -> Self {
        let frames = (rate as u64 * SYNTH_RING_MS / 1000).max(1024);
        Self::with_frames(frames)
    }

    /// The same, at a length the tests name themselves.
    pub fn with_frames(frames: u64) -> Self {
        let buf = vec![0.0f32; (frames * 2) as usize].into_boxed_slice();
        Self {
            buf: UnsafeCell::new(buf),
            frames,
            write: AtomicU64::new(0),
            base_write: AtomicU64::new(0),
            base_play: AtomicU64::new(0),
            live: AtomicU64::new(u64::MAX),
            read: AtomicU64::new(0),
            play: AtomicU64::new(0),
            drained: AtomicU64::new(u64::MAX),
            epoch: AtomicU64::new(0),
            gains: std::array::from_fn(|_| AtomicU32::new(1.0f32.to_bits())),
            stop: AtomicBool::new(false),
        }
    }

    /// How many stereo frames it holds.
    #[inline]
    pub fn capacity(&self) -> u64 {
        self.frames
    }

    // ---- the command thread ------------------------------------------------

    /// What is queued is no longer true: a seek, a new range, a new table.
    ///
    /// Costs one atomic and frees nothing. The callback throws the queue away
    /// on its next buffer and the renderer starts again from wherever the
    /// playhead has got to.
    pub fn invalidate(&self) {
        self.epoch.fetch_add(1, Ordering::Release);
    }

    /// Move one track's fader. Heard within the lead; recompiles nothing.
    pub fn set_gain(&self, track: usize, gain: f32) {
        if let Some(slot) = self.gains.get(track) {
            slot.store(gain.to_bits(), Ordering::Relaxed);
        }
    }

    /// Stop the renderer. Called when the song is taken away.
    pub fn stop(&self) {
        self.stop.store(true, Ordering::Release);
    }

    #[inline]
    fn stopping(&self) -> bool {
        self.stop.load(Ordering::Acquire)
    }

    // ---- the audio callback ------------------------------------------------

    /// Say where the playhead is and find out how many frames may be mixed.
    ///
    /// **This is the whole of what the callback does that is not a read.** One
    /// store, three loads and — when a stream has been invalidated — one more
    /// store that throws the queue away in constant time. No allocation, no
    /// lock, no loop whose length depends on anything.
    ///
    /// `play` is frames since the song started: the callback's own count, which
    /// does not reset at a loop seam, so the two sides cannot disagree about
    /// which time round they are on.
    #[inline]
    pub fn ready(&self, play: u64) -> u64 {
        self.play.store(play, Ordering::Release);
        let epoch = self.epoch.load(Ordering::Acquire);
        if self.drained.load(Ordering::Relaxed) != epoch {
            // Everything queued belongs to a stream nobody is listening to any
            // more. Dropping it is a store, and it is what "an invalidation
            // never replays stale audio" means.
            self.read
                .store(self.write.load(Ordering::Acquire), Ordering::Release);
            self.drained.store(epoch, Ordering::Release);
            return 0;
        }
        if self.live.load(Ordering::Acquire) != epoch {
            // The renderer has not begun the new stream yet. Silence from the
            // synth; the click and the sampled band are mixed elsewhere and
            // never see this.
            return 0;
        }
        let base_write = self.base_write.load(Ordering::Acquire);
        let base_play = self.base_play.load(Ordering::Acquire);
        if play < base_play {
            return 0;
        }
        let want = base_write + (play - base_play);
        let write = self.write.load(Ordering::Acquire);
        let read = self.read.load(Ordering::Relaxed);
        if read < want {
            // The stream began behind us — skip to where we actually are
            // rather than play it late.
            let to = want.min(write);
            self.read.store(to, Ordering::Release);
            return write.saturating_sub(to);
        }
        if read > want {
            return 0;
        }
        write.saturating_sub(read)
    }

    /// The `n`th frame of what [`SynthRing::ready`] just offered.
    ///
    /// # Safety contract
    ///
    /// `n` must be less than what `ready` returned on this buffer. Inside
    /// that, the producer cannot be writing the slot: it stops at
    /// `read + frames` and these are all before `write`.
    #[inline]
    pub fn at(&self, n: u64) -> (f32, f32) {
        let idx = ((self.read.load(Ordering::Relaxed) + n) % self.frames) as usize * 2;
        // SAFETY: see the type's `unsafe impl Sync` — this slot is behind
        // `write` and at or after `read`, which is the half of the buffer the
        // producer will not touch.
        let buf = unsafe { &*self.buf.get() };
        (buf[idx], buf[idx + 1])
    }

    /// Take the frames that were mixed. One store.
    #[inline]
    pub fn consume(&self, n: u64) {
        if n == 0 {
            return;
        }
        let read = self.read.load(Ordering::Relaxed) + n;
        self.read.store(read, Ordering::Release);
    }

    // ---- the renderer ------------------------------------------------------

    /// The epoch the command thread is on.
    fn epoch(&self) -> u64 {
        self.epoch.load(Ordering::Acquire)
    }

    /// Has the callback thrown the old stream away for `epoch` yet?
    fn drained_for(&self, epoch: u64) -> bool {
        self.drained.load(Ordering::Acquire) == epoch
            && self.read.load(Ordering::Acquire) >= self.write.load(Ordering::Relaxed)
    }

    /// Begin a new stream at the playhead the callback last published.
    fn begin(&self, epoch: u64) -> u64 {
        let play = self.play.load(Ordering::Acquire);
        self.base_write
            .store(self.write.load(Ordering::Relaxed), Ordering::Release);
        self.base_play.store(play, Ordering::Release);
        // Last, and with a release: a callback that sees this epoch is then
        // guaranteed to read the pair above that goes with it.
        self.live.store(epoch, Ordering::Release);
        play
    }

    /// How many frames are queued ahead of the playhead.
    fn lead(&self) -> u64 {
        let play = self.play.load(Ordering::Acquire);
        let base_play = self.base_play.load(Ordering::Relaxed);
        let base_write = self.base_write.load(Ordering::Relaxed);
        let want = base_write + play.saturating_sub(base_play);
        self.write.load(Ordering::Relaxed).saturating_sub(want)
    }

    /// How many frames may be written before the reader's half is reached.
    fn room(&self) -> u64 {
        let read = self.read.load(Ordering::Acquire);
        let write = self.write.load(Ordering::Relaxed);
        self.frames.saturating_sub(write.saturating_sub(read))
    }

    /// Put one rendered block in. Producer only.
    fn push(&self, left: &[f32], right: &[f32]) {
        let write = self.write.load(Ordering::Relaxed);
        // SAFETY: every slot written here is at or past `write` and before
        // `read + frames` — `room()` is what the caller checked — which is the
        // half of the buffer the consumer will not touch.
        let buf = unsafe { &mut *self.buf.get() };
        for (n, (l, r)) in left.iter().zip(right.iter()).enumerate() {
            let idx = ((write + n as u64) % self.frames) as usize * 2;
            buf[idx] = *l;
            buf[idx + 1] = *r;
        }
        self.write
            .store(write + left.len() as u64, Ordering::Release);
    }

    /// One track's fader, as the renderer reads it.
    fn gain(&self, track: u8) -> f32 {
        match self.gains.get(track as usize) {
            Some(slot) => f32::from_bits(slot.load(Ordering::Relaxed)),
            None => 1.0,
        }
    }
}

// ---------------------------------------------------------------------------
// The renderer thread
// ---------------------------------------------------------------------------

/// The thread that plays the synth into the ring, and its life.
///
/// Dropping it stops the thread and joins it, which is why it lives beside the
/// song on the command thread and never inside the `SongTable` the callback
/// holds: joining a thread is not something an audio callback may do, even by
/// accident, even in a destructor.
pub struct SynthPlayer {
    ring: Arc<SynthRing>,
    handle: Option<std::thread::JoinHandle<()>>,
}

impl std::fmt::Debug for SynthPlayer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SynthPlayer").finish()
    }
}

impl Drop for SynthPlayer {
    fn drop(&mut self) {
        self.ring.stop();
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
    }
}

impl SynthPlayer {
    /// Start rendering `score` into `ring` at `rate`.
    pub fn start(
        ring: Arc<SynthRing>,
        score: Arc<SynthScore>,
        font: Arc<SoundFont>,
        rate: u32,
    ) -> Result<Self, String> {
        let mut settings = SynthesizerSettings::new(rate as i32);
        // The synth's own block. Small, because a note-on may only land on
        // one of these boundaries and a backing part that is a millisecond
        // late against the click is a backing part nobody trusts.
        settings.block_size = 32;
        settings.maximum_polyphony = 64;
        settings.enable_reverb_and_chorus = false;
        let synth = Synthesizer::new(&font, &settings)
            .map_err(|e| format!("the SoundFont would not open at {rate} Hz: {e}"))?;
        let thread_ring = Arc::clone(&ring);
        let handle = std::thread::Builder::new()
            .name("yames-song-synth".into())
            .spawn(move || render_loop(thread_ring, score, synth, rate))
            .map_err(|e| format!("the song's synthesiser thread would not start: {e}"))?;
        Ok(Self {
            ring,
            handle: Some(handle),
        })
    }
}

/// Where the renderer is in the piece, and in the event list.
struct Cursor {
    /// Frames from the start of the pass.
    sample: u64,
    /// Index into `score.events`.
    at: usize,
}

impl Cursor {
    /// The cursor for a playhead. `play` counts frames since the song started
    /// and never resets, so this is where the modulo lives — in one place, on
    /// the renderer's thread, and not in the callback.
    fn at_play(play: u64, score: &SynthScore) -> Self {
        let sample = if score.loops && score.pass_samples > 0 {
            play % score.pass_samples
        } else {
            play
        };
        let at = score.events.partition_point(|e| e.sample < sample);
        Cursor { sample, at }
    }
}

fn render_loop(ring: Arc<SynthRing>, score: Arc<SynthScore>, mut synth: Synthesizer, rate: u32) {
    let lead_frames = rate as u64 * SYNTH_LEAD_MS / 1000;
    let mut left = vec![0.0f32; RENDER_CHUNK];
    let mut right = vec![0.0f32; RENDER_CHUNK];
    let mut my_epoch = u64::MAX;
    let mut cursor = Cursor { sample: 0, at: 0 };
    // What each channel's volume was last sent as, so a fader that has not
    // moved is not a control change on every block.
    let mut sent = [f32::NAN; 16];

    loop {
        if ring.stopping() {
            return;
        }
        let epoch = ring.epoch();
        if epoch != my_epoch {
            // Nothing of the new stream may be written until the callback has
            // thrown the old one away, or the two would disagree about which
            // frame is which.
            if !ring.drained_for(epoch) {
                std::thread::park_timeout(RENDER_NAP);
                continue;
            }
            synth.reset();
            sent = [f32::NAN; 16];
            let play = ring.begin(epoch);
            cursor = Cursor::at_play(play, &score);
            // The programs are the file's, and they are said again for every
            // new stream: `reset()` puts every channel back to a grand piano.
            for e in score.events.iter() {
                if let SynthEventKind::Program { program } = e.kind {
                    if e.sample <= cursor.sample {
                        synth.process_midi_message(e.channel as i32, 0xC0, program as i32, 0);
                    }
                }
            }
            my_epoch = epoch;
        }

        // The faders, once a block. A channel volume takes effect on the audio
        // the renderer makes next, so a move is heard once the queue ahead of
        // it has drained — which is what the lead is chosen against.
        for ch in 0..16usize {
            let track = score.channel_track[ch];
            if track == u8::MAX {
                continue;
            }
            let gain = ring.gain(track);
            if sent[ch] == gain {
                continue;
            }
            sent[ch] = gain;
            // CC7, on MIDI's own curve: the synth squares it, so the fader
            // moves the way every other fader in the app does.
            let cc = (gain.clamp(0.0, 1.0) * 127.0).round() as i32;
            synth.process_midi_message(ch as i32, 0xB0, 7, cc);
        }

        if ring.lead() >= lead_frames {
            std::thread::park_timeout(RENDER_NAP);
            continue;
        }
        let room = ring.room();
        if room < RENDER_CHUNK as u64 {
            std::thread::park_timeout(RENDER_NAP);
            continue;
        }

        // ---- one chunk, cut short at the next event so a note-on lands on
        // the frame the file put it on rather than on a block boundary ----
        let mut want = RENDER_CHUNK as u64;
        if score.loops && score.pass_samples > 0 {
            want = want.min(score.pass_samples - cursor.sample);
        }
        while let Some(e) = score.events.get(cursor.at) {
            if e.sample > cursor.sample {
                want = want.min(e.sample - cursor.sample);
                break;
            }
            play_event(&mut synth, e);
            cursor.at += 1;
        }
        let want = want.max(1) as usize;
        synth.render(&mut left[..want], &mut right[..want]);
        ring.push(&left[..want], &right[..want]);
        cursor.sample += want as u64;

        if score.pass_samples > 0 && cursor.sample >= score.pass_samples {
            if score.loops {
                // The seam. The synth is NOT reset and no note is stopped, so
                // a chord that was ringing at the end of the range goes on
                // ringing into the start of it — which is what "render across
                // the seam" means and what a player looping four bars hears
                // when they play it themselves.
                cursor.sample -= score.pass_samples;
                cursor.at = 0;
            } else if cursor.sample >= score.pass_samples + rate as u64 * 3 {
                // Three seconds past the end is longer than any voice in a
                // General MIDI set rings for. Nothing more to render.
                std::thread::park_timeout(RENDER_NAP);
            }
        }
    }
}

fn play_event(synth: &mut Synthesizer, e: &SynthEvent) {
    let ch = e.channel as i32;
    match e.kind {
        SynthEventKind::NoteOn { key, velocity } => {
            synth.note_on(ch, key as i32, velocity as i32);
        }
        SynthEventKind::NoteOff { key } => synth.note_off(ch, key as i32),
        SynthEventKind::Bend { value } => {
            // MIDI's two seven-bit halves, LSB first, which is the shape
            // `process_midi_message` takes them in.
            synth.process_midi_message(ch, 0xE0, (value & 0x7F) as i32, (value >> 7) as i32);
        }
        SynthEventKind::Program { program } => {
            synth.process_midi_message(ch, 0xC0, program as i32, 0);
        }
    }
}

// ---------------------------------------------------------------------------
// The same thing, offline
// ---------------------------------------------------------------------------

/// Render a score straight into two buffers, with no thread and no ring.
///
/// **The same arithmetic the renderer thread runs**, and deliberately written
/// out again rather than shared with it, for the reason `render_song` in
/// `engine.rs` is a copy of the callback: a change in the real path that this
/// does not follow shows up as a failing assertion rather than as a test that
/// quietly moved with the bug.
///
/// This is what the A/B clips the owner listens to are rendered with, and what
/// the seam and the tempo tests measure, so it takes the gains as a slice
/// rather than reading the ring's atomics.
pub fn render_offline(
    score: &SynthScore,
    font: &Arc<SoundFont>,
    rate: u32,
    frames: usize,
    gains: &[f32],
) -> Result<(Vec<f32>, Vec<f32>), String> {
    let mut settings = SynthesizerSettings::new(rate as i32);
    settings.block_size = 32;
    settings.maximum_polyphony = 64;
    settings.enable_reverb_and_chorus = false;
    let mut synth = Synthesizer::new(font, &settings)
        .map_err(|e| format!("the SoundFont would not open at {rate} Hz: {e}"))?;
    for ch in 0..16usize {
        let track = score.channel_track[ch];
        if track == u8::MAX {
            continue;
        }
        let gain = gains.get(track as usize).copied().unwrap_or(1.0);
        synth.process_midi_message(ch as i32, 0xB0, 7, (gain.clamp(0.0, 1.0) * 127.0).round() as i32);
    }
    let mut out_l = Vec::with_capacity(frames);
    let mut out_r = Vec::with_capacity(frames);
    let mut left = vec![0.0f32; RENDER_CHUNK];
    let mut right = vec![0.0f32; RENDER_CHUNK];
    let mut cursor = Cursor { sample: 0, at: 0 };
    for e in score.events.iter() {
        if let SynthEventKind::Program { program } = e.kind {
            if e.sample == 0 {
                synth.process_midi_message(e.channel as i32, 0xC0, program as i32, 0);
            }
        }
    }
    while out_l.len() < frames {
        let mut want = RENDER_CHUNK.min(frames - out_l.len()) as u64;
        if score.loops && score.pass_samples > 0 {
            want = want.min(score.pass_samples - cursor.sample);
        }
        while let Some(e) = score.events.get(cursor.at) {
            if e.sample > cursor.sample {
                want = want.min(e.sample - cursor.sample);
                break;
            }
            play_event(&mut synth, e);
            cursor.at += 1;
        }
        let want = want.max(1) as usize;
        synth.render(&mut left[..want], &mut right[..want]);
        out_l.extend_from_slice(&left[..want]);
        out_r.extend_from_slice(&right[..want]);
        cursor.sample += want as u64;
        if score.pass_samples > 0 && cursor.sample >= score.pass_samples && score.loops {
            cursor.sample -= score.pass_samples;
            cursor.at = 0;
        }
    }
    out_l.truncate(frames);
    out_r.truncate(frames);
    Ok((out_l, out_r))
}

// ---------------------------------------------------------------------------
// The SoundFont
// ---------------------------------------------------------------------------

/// The General MIDI set the app ships.
///
/// **Sonivox, 1.3 MB, Apache-2.0** (`sounds/gm/sonivox.sf2`, and its licence
/// beside it). Chosen against GeneralUser GS, TimGM6mb and MuseScore General
/// on the one thing the owner has spent a release on: the download. v1.2.1
/// moved the recorded band to FLAC to take 30 MB off it, and a 30 MB SoundFont
/// would have put it all back for a part that is behind the player's own.
/// A player who wants better guitars can point at a `.sf2` of their own in
/// Settings, which costs nobody who does not.
const SHIPPED_SF2: &[u8] = include_bytes!("../sounds/gm/sonivox.sf2");

/// Read the shipped set, or one the player pointed at.
///
/// Decoded once and shared: a `SoundFont` is read-only and `Synthesizer::new`
/// borrows it, so every song of a session gets the same `Arc` and the second
/// load of a piece costs nothing.
pub fn load_font(path: Option<&std::path::Path>) -> Result<Arc<SoundFont>, String> {
    match path {
        Some(p) => {
            let mut file = std::fs::File::open(p)
                .map_err(|e| format!("that sound set could not be opened: {e}"))?;
            SoundFont::new(&mut file)
                .map(Arc::new)
                .map_err(|e| format!("that file is not a SoundFont the engine can read: {e}"))
        }
        None => {
            let mut bytes = std::io::Cursor::new(SHIPPED_SF2);
            SoundFont::new(&mut bytes)
                .map(Arc::new)
                .map_err(|e| format!("the built-in sound set did not load: {e}"))
        }
    }
}

#[cfg(test)]
mod tests;
