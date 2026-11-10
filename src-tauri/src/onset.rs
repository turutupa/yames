use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::audio_input::{RingBuffer, SharedAudioInput};
use crate::instrument::InstrumentProfile;

// aubio onset detector — replaces the hand-rolled Goertzel FFT + spectral
// flux pipeline. Aliased to avoid shadowing our own `Onset` event struct.
use aubio::Onset as AubioOnset;

/// A detected onset event.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Onset {
    /// Monotonic timestamp in nanoseconds (from Instant)
    #[serde(rename = "tsNs")]
    pub ts_ns: u64,
    /// Peak amplitude at onset (0.0–1.0)
    pub amplitude: f32,
    /// Spectral centroid at onset (Hz) — higher = brighter sound
    pub centroid: f32,
    /// D2 — detection confidence in `[0.0, 1.0]`. Higher = clearer
    /// onset against the noise floor + sharper spectral flux peak.
    /// Downstream: D3 grid_alignment weights classifications by this,
    /// onset_efficiency weights matched-count by this, and C5 coach
    /// surfaces a "hard to hear you" caveat when mean session
    /// confidence stays under 0.5 for 30+ seconds.
    pub confidence: f32,
}

/// Live tempo context shared between the metronome engine and the
/// onset detector. Lets D2 compute an adaptive refractory period
/// (`max(profile.refractory_floor_ms, subdivision_interval_ms × k)`)
/// without coupling the detector to the engine module.
///
/// Every field is atomically writeable so the engine can update them
/// per-beat without re-acquiring the SharedState mutex.
#[derive(Debug)]
pub struct TempoContext {
    /// Current BPM × 100 (centi-BPM) so we get one decimal of resolution
    /// while staying lock-free with `AtomicU32`.
    bpm_x100: AtomicU32,
    /// Current subdivision (1 = quarter, 2 = 8th, 4 = 16th, …).
    subdivision: AtomicU32,
    /// Whether the metronome click track is currently running.
    /// The `detect_loop` gates analysis on this so onsets aren't
    /// accumulated when there's no beat grid to match against.
    is_playing: AtomicBool,
    /// Roadmap 1.3 — the smallest inter-onset interval the PLAYER is
    /// producing, in centi-milliseconds. 0 = unknown (nothing has told
    /// us yet), which is the cold-start state and the state free play
    /// stays in until `RhythmInference` locks.
    ///
    /// Written by the timing analyzer (from the locked divisor) and, when
    /// a `ScoreSchedule` is loaded, from the schedule's smallest gap —
    /// the score knows better than the inference. Read by `detect_loop`
    /// every hop.
    played_interval_cms: AtomicU32,
    /// A score is loaded, so what is due is known. See
    /// [`KNOWN_SCORE_REFRACTORY_FACTOR`].
    known_score: AtomicBool,
}

impl TempoContext {
    pub fn new(bpm: u16, subdivision: u8) -> Self {
        Self {
            bpm_x100: AtomicU32::new((bpm as u32) * 100),
            subdivision: AtomicU32::new(subdivision.max(1) as u32),
            is_playing: AtomicBool::new(false),
            played_interval_cms: AtomicU32::new(0),
            known_score: AtomicBool::new(false),
        }
    }
    pub fn set_bpm(&self, bpm: u16) {
        self.bpm_x100.store((bpm as u32) * 100, Ordering::Relaxed);
    }
    pub fn set_subdivision(&self, subdivision: u8) {
        self.subdivision
            .store(subdivision.max(1) as u32, Ordering::Relaxed);
    }
    /// Mark the metronome click track as started (`true`) or stopped
    /// (`false`). The `detect_loop` reads this flag every hop to gate
    /// spectral analysis — no grid → no matching → no event flood.
    pub fn set_playing(&self, playing: bool) {
        self.is_playing.store(playing, Ordering::Relaxed);
    }
    /// Returns `true` if the metronome click track is currently running.
    pub fn is_playing(&self) -> bool {
        self.is_playing.load(Ordering::Relaxed)
    }
    /// Returns the current subdivision interval in milliseconds. At
    /// 120 BPM quarter-notes this is 500ms; at 200 BPM 16ths it's 75ms.
    pub fn subdivision_interval_ms(&self) -> f32 {
        let bpm = (self.bpm_x100.load(Ordering::Relaxed) as f32) / 100.0;
        let subdiv = self.subdivision.load(Ordering::Relaxed) as f32;
        if bpm <= 0.0 || subdiv <= 0.0 {
            return 500.0;
        }
        (60_000.0 / bpm) / subdiv
    }

    /// Roadmap 1.3 — tell the detector the smallest interval between
    /// two notes the player is actually producing. `None` clears it
    /// back to "unknown" (the detector then falls back to the audible
    /// subdivision, which is what it always used before).
    ///
    /// Called from the timing-analysis thread, once per refit, and from
    /// the schedule loader. Values are clamped to a sane band so a
    /// pathological divisor or a corrupt schedule can never talk the
    /// refractory down to zero or up past a whole note.
    pub fn set_played_interval_ms(&self, interval_ms: Option<f32>) {
        let cms = match interval_ms {
            Some(ms) if ms.is_finite() && ms > 0.0 => {
                (ms.clamp(1.0, 4_000.0) * 100.0).round() as u32
            }
            _ => 0,
        };
        self.played_interval_cms.store(cms, Ordering::Relaxed);
    }

    /// The played interval last published, or `None` while unknown.
    pub fn played_interval_ms(&self) -> Option<f32> {
        let cms = self.played_interval_cms.load(Ordering::Relaxed);
        if cms == 0 {
            None
        } else {
            Some(cms as f32 / 100.0)
        }
    }

    /// Whether a score is loaded. Set by the analyzer, read every hop.
    pub fn set_known_score(&self, known: bool) {
        self.known_score.store(known, Ordering::Relaxed);
    }

    /// What share of the detection interval the refractory takes.
    pub fn refractory_factor(&self) -> f32 {
        if self.known_score.load(Ordering::Relaxed) {
            KNOWN_SCORE_REFRACTORY_FACTOR
        } else {
            REFRACTORY_SUBDIVISION_FACTOR
        }
    }

    /// Roadmap 1.3 — the interval the refractory and the ghost window
    /// are keyed to: the FINER of the audible subdivision and what the
    /// player is actually playing.
    ///
    /// Before this existed the detector only knew the click. A quarter
    /// click at 100 BPM therefore gave a 450 ms refractory and swallowed
    /// every played 16th before the analyzer ever saw it — the bug
    /// roadmap 1.3 exists to fix, and the one thing that made Songs
    /// impossible, since a song's rhythm is never the click's.
    ///
    /// It is the *minimum* of the two rather than the played interval
    /// alone (which is the literal reading of 1.3) for a reason worth
    /// keeping: taking the played value outright would RAISE the
    /// refractory whenever somebody plays sparsely over a fine click —
    /// quarters over a 16th click would widen it from 150 ms to 600 ms —
    /// and the moment they went back to 16ths those onsets would be
    /// swallowed again, with no way for the inference to notice, because
    /// the evidence it needs is exactly what got swallowed. The
    /// deadlock 1.3 removes, reintroduced from the other side. Taking
    /// the finer of the two never blinds the detector; the instrument
    /// floor still protects it from firing on its own resonance.
    pub fn detection_interval_ms(&self) -> f32 {
        let audible = self.subdivision_interval_ms();
        match self.played_interval_ms() {
            Some(played) => played.min(audible),
            None => audible,
        }
    }
}

pub type SharedTempoContext = Arc<TempoContext>;

/// D2 refractory multiplier — `max(floor, subdivision_interval × k)`.
/// Plan-specified value; lower for drums (separate path via the
/// `profile.refractory_floor_ms` already), tighter at faster tempos.
///
/// Bumped from 0.35 → 0.55 on 2026-05-17 after a paired-WAV
/// investigation of the "DSP doubling/density" bug. The 0.35 multiplier
/// produced a refractory of only 65–70ms at 80 BPM × 16ths subdivision
/// (sub_interval ≈ 187ms). Guitar / acoustic instruments have attack
/// envelopes whose body resonance peaks land 60–95ms after the initial
/// pluck, comfortably above the old refractory — so the detector
/// emitted 2–3 "ghost" onsets per real hit. In six paired test
/// sessions, 82% of consecutive onsets were < 100ms apart (median
/// 74ms), and matched-vs-spurious onsets had identical amplitude /
/// confidence distributions (mean amp 0.0082 each), confirming the
/// detector couldn't distinguish a real hit from an envelope echo.
///
/// 0.55 raised the refractory to ≈ 103ms at 80 BPM 16ths — but a 2026-05-23
/// amplitude-ordering forensic on session_1779514382 revealed a second ghost
/// band at 103–150ms. At 80 BPM 16ths (sub_interval = 187.5ms), 94 onset
/// pairs had intervals in the 103–150ms range (27% of all pairs). Amplitude
/// ordering showed only 33% of those pairs had a louder second onset across
/// all three sub-buckets (103–115ms: 30%, 115–131ms: 36%, 131–150ms: 33%),
/// confirming attack-then-resonance (not pick-noise-then-attack): the body
/// resonance trails the pick attack by up to 150ms and was registering as a
/// second onset, corrupting IC scores for a player whose real attacks were
/// within ±0.5ms of the grid.
///
/// Bumped from 0.55 → 0.75 on 2026-05-23 to cover the full resonance window.
/// At 80 BPM 16ths: refractory = 0.75 × 187.5 = 140.6ms → blocks ~83% of
/// the ghost-onset band. At 120 BPM 16ths: refractory = 0.75 × 125 = 93.75ms,
/// meaning a legit hit would need to arrive 31ms early to be blocked (4× the
/// measured ±8.1ms timing spread — statistically negligible). Still permits
/// 16ths up to any tempo and 8ths with extreme headroom.
///
/// NOTE: The 103–150ms ghost band at 120 BPM (52% second-louder, 71% in
/// 131–150ms sub-bucket) shows a DIFFERENT pattern — likely pick-noise-then-
/// attack rather than resonance. That is a cluster_window_ms concern, not a
/// refractory concern, and is tracked separately.
///
/// If we ever want to support 32nds or extreme tempos, drop the
/// instrument refractory floor (instrument.rs) for that profile
/// instead of pulling this constant back — the floor already exists
/// specifically to protect fast articulations.
pub const REFRACTORY_SUBDIVISION_FACTOR: f32 = 0.75;

/// The refractory's share of the gap when the score is known.
///
/// 0.75 blinds the detector to any real note that lands under three quarters of
/// a gap after the last one, and a player's notes do. At 160 BPM sixteenths a
/// player right on the 85% evenness bar has a spread of 11 ms, which puts about
/// one note in twenty inside it: every note played, heard reported as 94%, and
/// a failed bar that is the detector's fault. It only gets worse with tempo.
///
/// With a score loaded there is somewhere better for a doubtful onset to go.
/// The alignment takes the nearest of two candidates and calls the other an
/// extra, so a ghost that gets through costs half a miss instead of a real note
/// being lost outright. Free play has no such arbiter and keeps 0.75.
///
/// **This is the one knob in this file that a real guitar may move.** The
/// ghosts 0.75 was tuned against came from sessions on the overlapping feed, and
/// whether they were the guitar's or the feed's is unknown: synthetic audio
/// through the sequential feed has none. If the first real pass shows extras
/// over the bar, in `plans/revamp/GRADING_LIMITS.md`, this goes back up.
pub const KNOWN_SCORE_REFRACTORY_FACTOR: f32 = 0.5;

/// Relative amplitude threshold for ghost-onset suppression (inactive).
///
/// WAV forensic analysis (2026-05 session logs) showed that guitar pick
/// decay creates a secondary "ghost" onset ~140–175 ms after the real
/// attack. At 80 BPM 16th notes the sub_interval is 187.5 ms and the
/// adaptive refractory is 140.6 ms, so ghosts in [140.6, 187.5) ms leak
/// past the refractory gate and reset `last_onset_ns` — blocking the real
/// next 16th note (due at 187.5 ms) until ~281 ms.
///
/// GHOST_1 used this ratio as an amplitude discriminator, but forensic
/// analysis of session_1779823064 showed ghost B/A median = 1.12 — ghosts
/// are often LOUDER than real notes, so amplitude alone cannot distinguish
/// them. Only 11/70 ghost pairs (16%) were caught at the 0.70 threshold.
///
/// POSTMATCH_1 supersedes this gate: all onsets in [refractory, sub_interval)
/// are now EMITTED (hard ghost window) so both the ghost and the subsequent
/// real note reach the post-session best-candidate matcher. The matcher then
/// assigns the closer-to-center onset to each beat slot. This constant is
/// retained for reference and potential future use.
#[allow(dead_code)]
pub const GHOST_AMPLITUDE_RATIO: f32 = 0.70;

/// What the refractory gate decided about one candidate onset.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateDecision {
    /// Inside the refractory period — the detector's own echo, or a
    /// resonance peak. Never emitted.
    Blocked,
    /// POSTMATCH_1's hard ghost window: past the refractory but still
    /// closer than one expected note-to-note gap. Emitted for the
    /// post-match best-candidate matcher to arbitrate, but it does NOT
    /// move the refractory anchor, so the real next note is not blocked
    /// behind somebody's pick decay.
    Ghost,
    /// A note. Emitted, and the refractory anchor moves to it.
    Accepted,
}

/// The refractory rule, lifted out of `detect_loop` so it can be
/// exercised without an audio device. The loop holds one of these and
/// feeds it every hop that cleared aubio and the noise floor; the
/// fixture suite holds one and feeds it a synthetic stream of played
/// notes. One rule, both callers — a test of a second copy would prove
/// nothing about what ships.
#[derive(Debug, Default)]
pub struct RefractoryGate {
    last_onset_ns: u64,
    /// GHOST_1: amplitude of the last accepted (non-ghost) onset. Only
    /// its being non-zero still matters — see the ghost check below and
    /// `GHOST_AMPLITUDE_RATIO` for why amplitude itself was abandoned
    /// as a discriminator.
    last_amplitude: f32,
}

impl RefractoryGate {
    pub fn new() -> Self {
        Self::default()
    }

    /// The refractory period for a given expected note-to-note interval.
    /// `max(instrument floor, interval × 0.75)` — the floor is physics
    /// (how fast this instrument can articulate), the multiplier is the
    /// resonance window measured in the forensics above.
    pub fn refractory_ms(interval_ms: f32, floor_ms: u32) -> f32 {
        (interval_ms * REFRACTORY_SUBDIVISION_FACTOR).max(floor_ms as f32)
    }

    /// Clear the anchor — used when the click stops, so the refractory
    /// clock does not span the gap.
    pub fn reset(&mut self) {
        self.last_onset_ns = 0;
        // `last_amplitude` deliberately survives: see the note on the
        // first-onset guard in the ghost check.
    }

    /// Decide one candidate onset and update the anchor accordingly.
    pub fn admit(&mut self, now_ns: u64, amplitude: f32, interval_ms: f32, floor_ms: u32) -> GateDecision {
        self.admit_with_factor(now_ns, amplitude, interval_ms, floor_ms, REFRACTORY_SUBDIVISION_FACTOR)
    }

    /// [`Self::admit`], with the refractory's share of the interval given.
    pub fn admit_with_factor(
        &mut self,
        now_ns: u64,
        amplitude: f32,
        interval_ms: f32,
        floor_ms: u32,
        factor: f32,
    ) -> GateDecision {
        let refractory_ms = (interval_ms * factor).max(floor_ms as f32);
        let refractory_ns = (refractory_ms as u64).saturating_mul(1_000_000);
        if now_ns.saturating_sub(self.last_onset_ns) < refractory_ns {
            return GateDecision::Blocked;
        }
        let since_last_ms = now_ns.saturating_sub(self.last_onset_ns) / 1_000_000;
        // First-onset guard stays: with no accepted onset behind it the
        // gap is enormous and this can never fire on the first note of
        // a session.
        if (since_last_ms as f32) < interval_ms && self.last_amplitude > 0.0 {
            return GateDecision::Ghost;
        }
        self.last_onset_ns = now_ns;
        self.last_amplitude = amplitude;
        GateDecision::Accepted
    }

    /// Milliseconds since the anchor — for the diagnostic log only.
    pub fn since_last_ms(&self, now_ns: u64) -> u64 {
        now_ns.saturating_sub(self.last_onset_ns) / 1_000_000
    }
}

/// Onset detector using spectral flux with adaptive threshold.
///
/// Runs on a dedicated analyzer thread, consuming samples from the audio input
/// ring buffer. Emits `Onset` events through a callback.
pub struct OnsetDetector {
    alive: Arc<AtomicBool>,
    thread_handle: Option<thread::JoinHandle<()>>,
}

impl OnsetDetector {
    pub fn new() -> Self {
        Self {
            alive: Arc::new(AtomicBool::new(false)),
            thread_handle: None,
        }
    }

    /// Start the onset detection thread.
    ///
    /// `profile` carries instrument-specific tuning (D0 of the DSP plan):
    /// most importantly, `refractory_floor_ms` (the physics floor) and
    /// `cluster_window_ms` (chord/strum merging).
    ///
    /// `tempo_ctx` is the live BPM / subdivision view (D2). The
    /// detector reads it every hop to compute the adaptive refractory
    /// period — `max(floor, subdivision_interval × 0.55)`. Drums get a
    /// tighter floor via the profile so fast rolls aren't merged at
    /// fast tempos.
    ///
    /// `on_onset` is called from the analyzer thread for each detected
    /// onset. After D2's chord-cluster pass, near-simultaneous onsets
    /// have already been collapsed to a single event.
    pub fn start<F>(
        &mut self,
        audio_input: SharedAudioInput,
        profile: InstrumentProfile,
        tempo_ctx: SharedTempoContext,
        on_onset: F,
    ) where
        F: Fn(Onset) + Send + 'static,
    {
        self.stop();
        self.alive.store(true, Ordering::SeqCst);
        let alive = self.alive.clone();

        self.thread_handle = Some(thread::spawn(move || {
            // ROADMAP §0.5 — the analyzer runs per audio hop and must not be
            // preempted by background compute (LLM inference).
            let _rt = audio_thread_priority::promote_current_thread_to_real_time(0, 48_000)
                .map_err(|e| eprintln!("[yames] analyzer stayed at normal priority: {e}"));
            Self::detect_loop(alive, audio_input, profile, tempo_ctx, on_onset);
        }));
    }

    pub fn stop(&mut self) {
        self.alive.store(false, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
    }

    #[allow(dead_code)]
    pub fn is_active(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }

    /// Main detection loop: wake, pull whatever the input callback has
    /// written since last time, and hand it to [`OnsetCore`]. Everything
    /// that decides anything lives in the core, so the audio fixture suite
    /// runs the same decisions over a WAV without an audio device.
    ///
    /// Consumes `tempo_ctx` to make the refractory period adaptive
    /// (`max(floor, detection interval × 0.75)`).
    fn detect_loop<F>(
        alive: Arc<AtomicBool>,
        audio_input: SharedAudioInput,
        profile: InstrumentProfile,
        tempo_ctx: SharedTempoContext,
        on_onset: F,
    ) where
        F: Fn(Onset) + Send + 'static,
    {
        let sample_rate = {
            let ai = audio_input.lock().unwrap();
            ai.sample_rate()
        };
        let mut core = OnsetCore::new(&profile, sample_rate);
        let mut emit = |onset: Onset| on_onset(onset);

        while alive.load(Ordering::SeqCst) {
            // Sleep a bit between processing (don't spin-wait)
            thread::sleep(Duration::from_millis(5));
            if !alive.load(Ordering::SeqCst) {
                break;
            }

            // Gate: only run detection while the metronome click track is
            // active. No ring lock in here: the callback's `try_lock` on the
            // ring has nothing to contend with while nobody is listening.
            if !tempo_ctx.is_playing() {
                core.idle(&mut emit);
                continue;
            }

            {
                let ai = audio_input.lock().unwrap();
                let ring = ai.ring();
                let r = ring.lock().unwrap();
                core.pull(&r);
            }
            core.process(crate::clock::now_ns(), &tempo_ctx, &mut emit);
        }

        core.finish(&mut emit);
    }
}

/// The analysis window aubio's phase vocoder runs over.
pub const ONSET_FFT_SIZE: usize = 1024;

/// How far the window moves between two runs of the detector.
///
/// 256 samples is 5.3 ms at 48 kHz, and it is not an arbitrary change from
/// the 512 this used to say. Until 2026-11 the loop woke every 5 ms and fed
/// aubio the newest 512 samples it could see, whatever had been fed last
/// time: about 240 new samples per call, each hop overlapping the previous
/// one and butting up against it with a discontinuity. aubio's peak picker
/// counts in hops, and it needs about 4.6 of them to call a peak, so in wall
/// time the shipped detector was running a 5 ms hop all along. Sequential
/// 256-sample hops keep that same latency (and so every timing deadline and
/// every cached calibration built on it) while handing the phase vocoder the
/// signal it thinks it is reading. See `plans/revamp/GRADING_LIMITS.md` for
/// what the overlapping feed did to a sustained note.
pub const ONSET_HOP_SIZE: usize = 256;

/// `Onset::amplitude` and the noise floor read RMS over this many samples,
/// which is what they always read: changing the hop must not move a number
/// that session logs and accent verdicts have been comparing for a year.
const AMPLITUDE_WINDOW: usize = 512;

/// The most unprocessed audio the core will catch up on after a stall. Past
/// this it drops the backlog rather than analysing stale audio on a
/// real-time-priority thread.
const MAX_BACKLOG_SECS: f64 = 0.25;

/// The detector, without a thread or an audio device.
///
/// `OnsetDetector`'s thread owns one of these; so does the audio fixture
/// suite. One rule, both callers: a harness over a second copy would prove
/// nothing about what ships. It is handed a [`RingBuffer`] and the time, and
/// it calls back with onsets.
pub struct OnsetCore {
    detector: AubioOnset,
    hop_size: usize,
    sample_rate: u32,
    floor: NoiseFloor,
    gate: RefractoryGate,
    /// How far into the ring this core has read. `None` means "start from
    /// wherever the ring is now": first run, or the click just restarted.
    cursor: Option<usize>,
    /// Samples pulled from the ring and not yet analysed.
    fresh: Vec<f32>,
    max_backlog: usize,
    /// Signal energy of the last hops, for the amplitude window.
    hop_energies: Vec<f32>,
    hop_energy_pos: usize,
    /// D2 chord/strum merging — pending onset that's still inside
    /// the cluster window. Once the window expires (or a louder
    /// onset arrives), we forward the merged event.
    pending: Option<PendingCluster>,
    cluster_window_ns: u64,
    refractory_floor_ms: u32,
    /// Diagnostic logging — env-flag gated so logs don't ship in production
    /// builds. Launch the dev shell with `YAMES_ONSET_DEBUG=1`. Read once
    /// here, not every hop: `std::env::var` is a syscall.
    debug_enabled: bool,
    hops_since_log: u32,
}

impl OnsetCore {
    pub fn new(profile: &InstrumentProfile, sample_rate: u32) -> Self {
        Self::with_hop(profile, sample_rate, ONSET_HOP_SIZE)
    }

    /// The fixture suite's way in, for measuring other hop sizes. The app
    /// always runs [`ONSET_HOP_SIZE`].
    pub fn with_hop(profile: &InstrumentProfile, sample_rate: u32, hop_size: usize) -> Self {
        // Instrument-specific onset algorithm. `InstrumentProfile` carries
        // `aubio_onset_method` ("hfc" / "complex" / "specflux") that maps
        // directly to aubio's built-in detectors. Parse, falling back to
        // SpecFlux if the string is unrecognised (should never happen in
        // practice).
        let aubio_mode = profile
            .aubio_onset_method
            .parse::<aubio::OnsetMode>()
            .unwrap_or(aubio::OnsetMode::SpecFlux);
        let mut detector = AubioOnset::new(aubio_mode, ONSET_FFT_SIZE, hop_size, sample_rate)
            .expect("aubio::Onset init failed — invalid parameters");
        // Keep aubio's internal adaptive threshold; set the silence gate
        // explicitly at −70 dBFS (aubio's default). Our own adaptive RMS
        // noise floor is layered on top as a second guard.
        detector.set_silence(-70.0);

        let hops_per_sec = sample_rate as f32 / hop_size as f32;
        let max_backlog = (sample_rate as f64 * MAX_BACKLOG_SECS) as usize;
        let debug_enabled = std::env::var("YAMES_ONSET_DEBUG").is_ok();
        if debug_enabled {
            eprintln!("[onset] debug logging enabled (sample_rate={sample_rate})");
        }
        Self {
            detector,
            hop_size,
            sample_rate,
            floor: NoiseFloor::new(hops_per_sec),
            gate: RefractoryGate::new(),
            cursor: None,
            fresh: Vec::with_capacity(max_backlog + hop_size),
            max_backlog,
            hop_energies: vec![0.0; (AMPLITUDE_WINDOW / hop_size).max(1)],
            hop_energy_pos: 0,
            pending: None,
            cluster_window_ns: (profile.cluster_window_ms as u64) * 1_000_000,
            refractory_floor_ms: profile.refractory_floor_ms,
            debug_enabled,
            hops_since_log: 0,
        }
    }

    /// The click stopped. Flush any in-flight cluster so stale events don't
    /// leak into the next session, reset the refractory clock so it doesn't
    /// span the gap, and reset aubio's frame count. The cursor is let go so
    /// the audio of the gap is never analysed when the click comes back.
    pub fn idle<F: FnMut(Onset)>(&mut self, on_onset: &mut F) {
        if let Some(p) = self.pending.take() {
            on_onset(p.flush());
        }
        self.gate.reset();
        self.detector.reset();
        self.cursor = None;
        self.fresh.clear();
    }

    /// Copy what the input callback has written since the last pull. Holds
    /// the ring's lock for a `memcpy` of the new samples, and the callback's
    /// side of that lock is a `try_lock`: this replaced copying 2048 samples
    /// on every wake, so it holds it for less than it ever did.
    pub fn pull(&mut self, ring: &RingBuffer) {
        let cursor = self.cursor.get_or_insert_with(|| ring.write_pos());
        ring.read_since(cursor, &mut self.fresh, self.max_backlog);
    }

    /// Analyse every whole hop that has been pulled. `now_ns` is the moment
    /// of the pull, and the newest sample is taken to have arrived then: a
    /// hop further back in the backlog is stamped that much earlier, so a
    /// large input buffer delivering several hops at once does not smear
    /// them onto one timestamp.
    pub fn process<F: FnMut(Onset)>(&mut self, now_ns: u64, tempo: &TempoContext, on_onset: &mut F) {
        let interval_ms = tempo.detection_interval_ms();
        let factor = tempo.refractory_factor();
        let fresh = std::mem::take(&mut self.fresh);
        let ns_per_sample = 1e9 / self.sample_rate as f64;
        let mut start = 0;
        while fresh.len() - start >= self.hop_size {
            let end = start + self.hop_size;
            let behind = (fresh.len() - end) as f64;
            let hop_end_ns = now_ns.saturating_sub((behind * ns_per_sample) as u64);
            self.analyse_hop(&fresh[start..end], hop_end_ns, interval_ms, factor, on_onset);
            start = end;
        }
        self.fresh = fresh;
        self.fresh.drain(..start);
    }

    /// Hand over anything still held back. The thread does this on shutdown,
    /// a fixture at the end of its audio.
    pub fn finish<F: FnMut(Onset)>(&mut self, on_onset: &mut F) {
        if let Some(p) = self.pending.take() {
            on_onset(p.flush());
        }
    }

    fn analyse_hop<F: FnMut(Onset)>(
        &mut self,
        hop: &[f32],
        now_ns: u64,
        sub_interval_ms: f32,
        refractory_factor: f32,
        on_onset: &mut F,
    ) {
        // Run aubio onset detection on this hop.
        // `do_result` returns > 0.0 when an onset is detected;
        // the exact value is an offset ∈ (0, 1] within the hop.
        let onset_value = match self.detector.do_result(hop) {
            Ok(v) => v,
            Err(_) => return,
        };

        // RMS for amplitude and noise-floor gating, over the amplitude
        // window rather than one hop.
        let energy = hop.iter().map(|s| s * s).sum::<f32>();
        let slots = self.hop_energies.len();
        self.hop_energies[self.hop_energy_pos] = energy;
        self.hop_energy_pos = (self.hop_energy_pos + 1) % slots;
        let rms = (self.hop_energies.iter().sum::<f32>() / (slots * hop.len()) as f32).sqrt();

        let fired = onset_value > 0.0;
        self.floor.observe(rms, fired, now_ns);
        let noise_floor = self.floor.level(now_ns);

        // Roadmap 1.3: the interval is the finer of the click and what the
        // player is playing — see `TempoContext::detection_interval_ms`.
        // The ghost window keys off the same value, so both move together
        // and the band between them never inverts.
        let refractory_floor_ms = self.refractory_floor_ms;
        let adaptive_refractory_ms =
            (sub_interval_ms * refractory_factor).max(refractory_floor_ms as f32);

        // Periodic state dump. Useful when the user says "I'm playing but
        // no onsets fire": shows whether `rms > noise_floor` and the aubio
        // onset value are passing.
        if self.debug_enabled {
            self.hops_since_log += 1;
            if self.hops_since_log >= self.sample_rate / self.hop_size as u32 {
                self.hops_since_log = 0;
                let rms_pass = rms > noise_floor;
                eprintln!(
                    "[onset] state rms={:.4}{} onset_val={:.3} desc={:.3} floor={:.4} refrac={:.0}ms",
                    rms,
                    if rms_pass { ">floor" } else { "<floor" },
                    onset_value,
                    self.detector.get_descriptor(),
                    noise_floor,
                    adaptive_refractory_ms,
                );
            }
        }

        // aubio signals an onset when do_result returns > 0.
        // We layer our own RMS noise-floor gate on top so brief
        // silence artefacts in the phase-vocoder don't fire.
        if fired && rms > noise_floor {
            let since_last_ms = self.gate.since_last_ms(now_ns);

            // Refractory period check (skips spurious double-counts).
            // POSTMATCH_1: Hard ghost window — any onset in
            // [refractory, sub_interval) is emitted for telemetry
            // but does NOT reset the anchor. This lets the real
            // next note also pass the refractory and reach the
            // post-session best-candidate matcher, which picks the
            // closest onset per slot.
            //
            // The amplitude condition is gone: median ghost B/A is
            // 1.12 so amplitude cannot reliably distinguish
            // pick-decay ghosts from real notes.
            let decision = self.gate.admit_with_factor(
                now_ns,
                rms,
                sub_interval_ms,
                refractory_floor_ms,
                refractory_factor,
            );
            let is_ghost = decision == GateDecision::Ghost;
            if decision != GateDecision::Blocked {
                self.floor.note_heard(rms, now_ns);
                if self.debug_enabled {
                    if is_ghost {
                        eprintln!(
                            "[onset] GHOST-WINDOW emitting since_last={}ms sub_int={:.0}ms rms={:.4} (refractory NOT updated)",
                            since_last_ms, sub_interval_ms, rms,
                        );
                    } else {
                        eprintln!(
                            "[onset] FIRED rms={:.4} onset_val={:.3} desc={:.3} floor={:.4} since_last={}ms",
                            rms, onset_value, self.detector.get_descriptor(), noise_floor, since_last_ms,
                        );
                    }
                }
                // Emit onset for both ghost-window and real onsets.
                // Ghost onsets appear in detected_onsets telemetry so the
                // post-session best-candidate matcher can assign the
                // closer-to-slot-center one per expected beat.
                //
                // D2 confidence — blend amplitude-to-noise ratio with
                // aubio's thresholded descriptor, which acts as a proxy
                // for peak sharpness (descriptor − threshold; clamped to
                // [0, 1] since the raw value can exceed 1 for strong
                // onsets — those saturate to max confidence).
                let amp_ratio = if noise_floor > 0.0 {
                    (rms / noise_floor).min(8.0)
                } else {
                    1.0
                };
                let conf_amp = ((amp_ratio - 1.0) / 4.0).clamp(0.0, 1.0);
                let conf_desc = self.detector.get_thresholded_descriptor().clamp(0.0, 1.0);
                let confidence = (conf_amp * 0.45 + conf_desc * 0.55).clamp(0.0, 1.0);

                let onset = Onset {
                    ts_ns: now_ns,
                    amplitude: rms.clamp(0.0, 1.0),
                    // aubio doesn't expose spectral centroid directly;
                    // field is preserved for schema compatibility and
                    // future use (e.g. pitch/brightness from aubio's
                    // pitch detector).
                    centroid: 0.0,
                    confidence,
                };

                // Ghost onsets bypass chord clustering — emitted directly
                // so they appear as standalone telemetry entries. This
                // prevents the real next note (~37ms later) from being
                // merged into a ghost-started cluster at wider cluster
                // windows (cluster_window_ms > 37ms).
                if is_ghost || self.cluster_window_ns == 0 {
                    on_onset(onset);
                } else {
                    // D2 chord/strum merging — if a pending onset is
                    // still inside the cluster window, fold this one in
                    // (keep the loudest's timestamp, sum amplitudes,
                    // take the higher confidence). Drums opt out by
                    // setting `cluster_window_ms = 0` in their profile.
                    let still_open = match self.pending.as_ref() {
                        Some(p) => {
                            onset.ts_ns.saturating_sub(p.first_ts_ns) <= self.cluster_window_ns
                        }
                        None => false,
                    };
                    if still_open {
                        // unwrap is safe — still_open ⇒ Some(_).
                        self.pending.as_mut().unwrap().merge(onset);
                    } else {
                        if let Some(old) = self.pending.take() {
                            on_onset(old.flush());
                        }
                        self.pending = Some(PendingCluster::from_onset(onset));
                    }
                }
            } else if self.debug_enabled {
                // aubio fired but the refractory guard blocked it.
                // Common during fast tremolo / drum rolls; flag in
                // logs so the user can tell whether a low onset count
                // is "didn't detect" vs "detected but merged".
                eprintln!(
                    "[onset] blocked-by-refractory since_last={}ms < refrac={:.0}ms (rms={:.4})",
                    since_last_ms, adaptive_refractory_ms, rms,
                );
            }
        }

        // Flush any pending cluster whose window has closed (even if
        // no new onset arrived this hop).
        if let Some(ref p) = self.pending {
            if now_ns.saturating_sub(p.first_ts_ns) > self.cluster_window_ns {
                let merged = self.pending.take().unwrap().flush();
                on_onset(merged);
            }
        }
    }
}

/// How long after an aubio detection a hop is still taken to be the player's
/// sound and not the room's.
const NOISE_QUIET_AFTER_DETECTION_MS: u64 = 250;
/// How much quiet audio the background estimate looks back over.
const NOISE_HISTORY_SECS: f32 = 2.6;
/// How much quiet audio it needs before it says anything at all. Until then
/// the floor is [`MIN_NOISE_FLOOR`] and everything loud enough gets through,
/// which is the right way round to be wrong when somebody starts playing the
/// instant the click does.
const NOISE_BOOTSTRAP_SECS: f32 = 0.5;
/// A note has to be this many times the background.
const NOISE_FLOOR_MULTIPLIER: f32 = 3.0;
/// The absolute lower bound on the floor.
const MIN_NOISE_FLOOR: f32 = 0.002;
/// However the background got to where it is, the floor never climbs past
/// this fraction of what the player's notes have recently measured.
const NOISE_CAP_OF_RECENT_NOTES: f32 = 0.5;
/// A note only vouches for itself if it stood at least this far above the
/// background. Phantom detections on steady noise measure the noise, and
/// must not talk the floor down to where they get through.
const NOTE_MUST_CLEAR_BACKGROUND: f32 = 1.25;
/// And the floor stays this far above the background, whatever the notes say.
const NOISE_FLOOR_ABOVE_BACKGROUND: f32 = 1.15;
/// How many notes the cap remembers, and for how long after the last.
const RECENT_NOTES: usize = 8;
const RECENT_NOTES_MEMORY_NS: u64 = 30_000_000_000;

/// What a note has to clear before it counts as a note.
///
/// D2's original rule was three times the 10th percentile of ALL recent RMS,
/// and that rule has a defect at the point that matters most. Play steadily
/// for longer than its history, and the 10th percentile stops being the room
/// and becomes the player's own sustain. If RMS then does not swing by three
/// times between attack and tail, which compressed high gain never does and a
/// ringing clean note often does not, the floor shuts and every note after it
/// is refused. It measured 19 of 128 sixteenths heard at 120 BPM, on a take
/// that still scored 98, and the audit's maths says it closes about 2.3 s in.
///
/// So the background is learned only from hops nobody is playing on: at least
/// [`NOISE_QUIET_AFTER_DETECTION_MS`] from the last thing aubio called an
/// onset. Steady playing freezes it where the room left it, because the next
/// detection always arrives first. Steady noise still teaches it, because
/// aubio has nothing to fire on.
///
/// That leaves the slow held note: long enough between picks for its tail to
/// be learned as "background". So the floor is also capped at half of what the
/// player's own recent notes measured, and that memory outlasts any held note.
/// A pick that looks like the player's last eight picks is a note.
#[derive(Debug)]
pub struct NoiseFloor {
    /// RMS of recent quiet hops, a ring.
    history: Vec<f32>,
    write_pos: usize,
    seen: usize,
    /// Preallocated so taking the percentile never allocates.
    scratch: Vec<f32>,
    bootstrap: usize,
    pushes_since_estimate: u32,
    background: Option<f32>,
    /// When aubio last fired, whether or not anything came of it.
    last_detection_ns: Option<u64>,
    recent_notes: [f32; RECENT_NOTES],
    recent_note_count: usize,
    last_note_ns: u64,
}

impl NoiseFloor {
    pub fn new(hops_per_sec: f32) -> Self {
        let capacity = (hops_per_sec * NOISE_HISTORY_SECS).ceil().max(16.0) as usize;
        Self {
            history: vec![0.0; capacity],
            write_pos: 0,
            seen: 0,
            scratch: Vec::with_capacity(capacity),
            bootstrap: (hops_per_sec * NOISE_BOOTSTRAP_SECS).ceil().max(8.0) as usize,
            pushes_since_estimate: 0,
            background: None,
            last_detection_ns: None,
            recent_notes: [0.0; RECENT_NOTES],
            recent_note_count: 0,
            last_note_ns: 0,
        }
    }

    /// One hop went by. `fired` is whether aubio called an onset on it.
    pub fn observe(&mut self, rms: f32, fired: bool, now_ns: u64) {
        if fired {
            self.last_detection_ns = Some(now_ns);
            return;
        }
        let quiet = match self.last_detection_ns {
            Some(at) => now_ns.saturating_sub(at) >= NOISE_QUIET_AFTER_DETECTION_MS * 1_000_000,
            None => true,
        };
        if !quiet {
            return;
        }
        let capacity = self.history.len();
        self.history[self.write_pos] = rms;
        self.write_pos = (self.write_pos + 1) % capacity;
        self.seen = (self.seen + 1).min(capacity);
        self.pushes_since_estimate += 1;
        // A percentile on every hop is wasted work on a real-time thread; the
        // room does not change in 40 ms.
        if self.seen >= self.bootstrap && self.pushes_since_estimate >= 8 {
            self.pushes_since_estimate = 0;
            self.scratch.clear();
            self.scratch.extend_from_slice(&self.history[..self.seen]);
            let p10 = self.scratch.len() / 10;
            let (_, value, _) = self
                .scratch
                .select_nth_unstable_by(p10, |a, b| a.total_cmp(b));
            self.background = Some(*value);
        }
    }

    /// A note got through. Its level is what the cap reads.
    pub fn note_heard(&mut self, rms: f32, now_ns: u64) {
        self.recent_notes[self.recent_note_count % RECENT_NOTES] = rms;
        self.recent_note_count += 1;
        self.last_note_ns = now_ns;
    }

    /// The level RMS has to clear, right now.
    pub fn level(&self, now_ns: u64) -> f32 {
        let Some(background) = self.background else {
            return MIN_NOISE_FLOOR;
        };
        let from_room = background * NOISE_FLOOR_MULTIPLIER;
        let floor = match self.recent_note_level(now_ns) {
            Some(notes) if notes >= background * NOTE_MUST_CLEAR_BACKGROUND => from_room
                .min((notes * NOISE_CAP_OF_RECENT_NOTES).max(background * NOISE_FLOOR_ABOVE_BACKGROUND)),
            _ => from_room,
        };
        floor.max(MIN_NOISE_FLOOR)
    }

    /// The median of the last few notes, while they are recent.
    fn recent_note_level(&self, now_ns: u64) -> Option<f32> {
        let count = self.recent_note_count.min(RECENT_NOTES);
        if count == 0 || now_ns.saturating_sub(self.last_note_ns) > RECENT_NOTES_MEMORY_NS {
            return None;
        }
        let mut sorted = self.recent_notes;
        let window = &mut sorted[..count];
        window.sort_unstable_by(|a, b| a.total_cmp(b));
        Some(window[count / 2])
    }
}

/// Internal helper used during chord/strum merging. Holds the in-flight
/// "lead" onset of a cluster plus the accumulated amplitude / max
/// confidence as additional onsets fall inside the window.
#[derive(Debug, Clone)]
struct PendingCluster {
    first_ts_ns: u64,
    /// Timestamp of the loudest onset in the cluster — that's the one
    /// we keep for downstream beat matching.
    loudest_ts_ns: u64,
    loudest_amp: f32,
    summed_amp: f32,
    max_confidence: f32,
    /// Centroid of the loudest onset (most musically representative).
    centroid: f32,
}

impl PendingCluster {
    fn from_onset(o: Onset) -> Self {
        Self {
            first_ts_ns: o.ts_ns,
            loudest_ts_ns: o.ts_ns,
            loudest_amp: o.amplitude,
            summed_amp: o.amplitude,
            max_confidence: o.confidence,
            centroid: o.centroid,
        }
    }
    fn merge(&mut self, o: Onset) {
        self.summed_amp = (self.summed_amp + o.amplitude).min(1.0);
        if o.amplitude > self.loudest_amp {
            self.loudest_amp = o.amplitude;
            self.loudest_ts_ns = o.ts_ns;
            self.centroid = o.centroid;
        }
        if o.confidence > self.max_confidence {
            self.max_confidence = o.confidence;
        }
    }
    fn flush(self) -> Onset {
        Onset {
            ts_ns: self.loudest_ts_ns,
            amplitude: self.summed_amp.clamp(0.0, 1.0),
            centroid: self.centroid,
            confidence: self.max_confidence,
        }
    }
}

impl Drop for OnsetDetector {
    fn drop(&mut self) {
        self.stop();
    }
}

pub type SharedOnsetDetector = Arc<Mutex<OnsetDetector>>;

pub fn create_shared_onset_detector() -> SharedOnsetDetector {
    Arc::new(Mutex::new(OnsetDetector::new()))
}

// ---------------------------------------------------------------------------
// D2 unit tests — tempo context arithmetic + chord cluster merging.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;

    fn approx_eq(a: f32, b: f32, eps: f32) -> bool {
        (a - b).abs() < eps
    }

    #[test]
    fn tempo_context_subdivision_interval_120_quarters() {
        let ctx = TempoContext::new(120, 1);
        // 60_000 / 120 = 500ms per quarter.
        assert!(approx_eq(ctx.subdivision_interval_ms(), 500.0, 0.01));
    }

    #[test]
    fn tempo_context_subdivision_interval_200_sixteenths() {
        let ctx = TempoContext::new(200, 4);
        // 60_000 / 200 / 4 = 75ms per 16th.
        assert!(approx_eq(ctx.subdivision_interval_ms(), 75.0, 0.01));
    }

    #[test]
    fn tempo_context_live_updates() {
        let ctx = TempoContext::new(120, 1);
        ctx.set_bpm(60);
        // 60 BPM quarter = 1000ms.
        assert!(approx_eq(ctx.subdivision_interval_ms(), 1000.0, 0.01));
        ctx.set_subdivision(2);
        // 60 BPM 8ths = 500ms.
        assert!(approx_eq(ctx.subdivision_interval_ms(), 500.0, 0.01));
    }

    #[test]
    fn tempo_context_subdivision_floor_is_one() {
        // We never want a divide-by-zero on subdivision; setter clamps to ≥1.
        let ctx = TempoContext::new(120, 1);
        ctx.set_subdivision(0);
        // Behaves as if subdivision = 1.
        assert!(approx_eq(ctx.subdivision_interval_ms(), 500.0, 0.01));
    }

    #[test]
    fn tempo_context_zero_bpm_returns_safe_default() {
        // Defensive: BPM should never legitimately be 0, but if it
        // somehow lands there we hand back a 500ms beat instead of NaN.
        let ctx = TempoContext::new(120, 1);
        ctx.bpm_x100.store(0, Ordering::Relaxed);
        assert!(approx_eq(ctx.subdivision_interval_ms(), 500.0, 0.01));
    }

    #[test]
    fn refractory_factor_constant_matches_plan() {
        // Plan-locked: 0.75 of subdivision interval is the "musical" knee
        // between "too eager" and "blocking legit fast runs."
        // History: 0.35 → 0.55 on 2026-05-17 (doubling-bug WAV analysis).
        //          0.55 → 0.75 on 2026-05-23 (amplitude-ordering forensic on
        //          session_1779514382: 94 pairs at 103–150ms, 33% 2nd-louder
        //          across all sub-buckets → attack-then-resonance confirmed).
        // See constant's docstring for full forensics. New value still
        // permits 16ths at any tempo (legit hit must be 31ms early at 120 BPM
        // to be blocked — 4× the measured ±8.1ms timing spread).
        assert!(approx_eq(REFRACTORY_SUBDIVISION_FACTOR, 0.75, 1e-6));
    }

    // ── The refractory gate, lifted out of the detect loop ───────────

    /// Electric guitar's floor. Every gate test uses it so the numbers
    /// below are the ones a guitarist actually gets.
    const GUITAR_FLOOR_MS: u32 = 40;

    fn ms(n: u64) -> u64 {
        n * 1_000_000
    }

    #[test]
    fn the_gate_admits_the_first_note_of_a_session() {
        let mut gate = RefractoryGate::new();
        assert_eq!(
            gate.admit(ms(1_000), 0.3, 150.0, GUITAR_FLOOR_MS),
            GateDecision::Accepted,
        );
    }

    #[test]
    fn the_gate_blocks_the_instruments_own_echo() {
        // 150 ms expected gap → 112.5 ms refractory. A resonance peak
        // 60 ms after the pluck is inside it.
        let mut gate = RefractoryGate::new();
        gate.admit(ms(1_000), 0.3, 150.0, GUITAR_FLOOR_MS);
        assert_eq!(
            gate.admit(ms(1_060), 0.4, 150.0, GUITAR_FLOOR_MS),
            GateDecision::Blocked,
        );
    }

    #[test]
    fn the_ghost_window_emits_without_moving_the_anchor() {
        // POSTMATCH_1's whole point: something in [refractory, gap) is
        // handed to the matcher, but the next real note must still get
        // through rather than sitting behind the ghost's refractory.
        let mut gate = RefractoryGate::new();
        gate.admit(ms(1_000), 0.3, 150.0, GUITAR_FLOOR_MS);
        assert_eq!(
            gate.admit(ms(1_120), 0.3, 150.0, GUITAR_FLOOR_MS),
            GateDecision::Ghost,
        );
        // Anchor never moved, so the note at +150 ms is 150 ms from the
        // anchor and lands as a note, not as a second ghost.
        assert_eq!(
            gate.admit(ms(1_150), 0.3, 150.0, GUITAR_FLOOR_MS),
            GateDecision::Accepted,
        );
    }

    #[test]
    fn a_quarter_click_used_to_swallow_three_sixteenths_in_four() {
        // The bug, stated as a test. 100 BPM: 16ths are 150 ms apart.
        // Told only the click's 600 ms, the gate accepts one note per
        // 600 ms and ghosts one more; told the played interval, it
        // accepts every note. This is roadmap 1.3 in one assertion.
        let play: Vec<u64> = (0..16).map(|i| ms(1_000 + i * 150)).collect();

        let mut blind = RefractoryGate::new();
        let accepted_blind = play
            .iter()
            .filter(|&&t| blind.admit(t, 0.3, 600.0, GUITAR_FLOOR_MS) == GateDecision::Accepted)
            .count();

        let mut keyed = RefractoryGate::new();
        let accepted_keyed = play
            .iter()
            .filter(|&&t| keyed.admit(t, 0.3, 150.0, GUITAR_FLOOR_MS) == GateDecision::Accepted)
            .count();

        assert_eq!(accepted_blind, 4, "the click-keyed gate kept one note in four");
        assert_eq!(accepted_keyed, 16, "the player-keyed gate must keep them all");
    }

    #[test]
    fn the_instrument_floor_still_wins_at_extreme_tempos() {
        // 200 BPM 32nds would ask for a 28 ms refractory; guitar's
        // 40 ms floor is physics and holds. The floor exists precisely
        // to protect fast articulations, and 1.3 does not touch it.
        assert!(approx_eq(
            RefractoryGate::refractory_ms(37.5, GUITAR_FLOOR_MS),
            40.0,
            1e-4,
        ));
        assert!(approx_eq(
            RefractoryGate::refractory_ms(150.0, GUITAR_FLOOR_MS),
            112.5,
            1e-4,
        ));
    }

    // ── Roadmap 1.3 — the refractory follows the player ──────────────

    #[test]
    fn detection_interval_falls_back_to_the_click_until_somebody_says_otherwise() {
        // 100 BPM quarters: 600ms between clicks, and nothing has told
        // us what is being played. This is the pre-1.3 behaviour and it
        // must survive untouched for free play.
        let ctx = TempoContext::new(100, 1);
        assert!(ctx.played_interval_ms().is_none());
        assert!(approx_eq(ctx.detection_interval_ms(), 600.0, 0.01));
    }

    #[test]
    fn sixteenths_over_a_quarter_click_pull_the_refractory_down() {
        // The case that made Songs impossible. 100 BPM quarter click:
        // the old refractory was 0.75 × 600 = 450ms, so three of every
        // four played 16ths (150ms apart) never reached the analyzer.
        let ctx = TempoContext::new(100, 1);
        let old_refractory = ctx.subdivision_interval_ms() * REFRACTORY_SUBDIVISION_FACTOR;
        assert!(approx_eq(old_refractory, 450.0, 0.01));
        ctx.set_played_interval_ms(Some(150.0)); // 16ths at 100 BPM
        assert!(approx_eq(ctx.detection_interval_ms(), 150.0, 0.01));
        let new_refractory = ctx.detection_interval_ms() * REFRACTORY_SUBDIVISION_FACTOR;
        // 112.5ms — a 150ms gap now clears it with room to spare.
        assert!(new_refractory < 150.0);
        assert!(approx_eq(new_refractory, 112.5, 0.01));
    }

    #[test]
    fn playing_sparsely_over_a_fine_click_never_widens_the_refractory() {
        // Quarters over a 16th click. The literal reading of 1.3 would
        // widen the refractory to 0.75 × 600ms and swallow the player's
        // next run of 16ths; the finer-of-the-two rule keeps it at the
        // click's 150ms. See `detection_interval_ms` for why.
        let ctx = TempoContext::new(100, 4);
        assert!(approx_eq(ctx.subdivision_interval_ms(), 150.0, 0.01));
        ctx.set_played_interval_ms(Some(600.0));
        assert!(approx_eq(ctx.detection_interval_ms(), 150.0, 0.01));
    }

    #[test]
    fn clearing_the_played_interval_restores_the_click() {
        let ctx = TempoContext::new(120, 1);
        ctx.set_played_interval_ms(Some(125.0));
        assert!(approx_eq(ctx.detection_interval_ms(), 125.0, 0.01));
        ctx.set_played_interval_ms(None);
        assert!(ctx.played_interval_ms().is_none());
        assert!(approx_eq(ctx.detection_interval_ms(), 500.0, 0.01));
    }

    #[test]
    fn a_nonsense_played_interval_cannot_disarm_the_detector() {
        // Defensive: a corrupt schedule or a divide-by-zero upstream
        // must not talk the refractory to zero (every resonance becomes
        // an onset) or past a whole note (nothing is ever heard).
        let ctx = TempoContext::new(120, 1);
        ctx.set_played_interval_ms(Some(0.0));
        assert!(ctx.played_interval_ms().is_none());
        ctx.set_played_interval_ms(Some(f32::NAN));
        assert!(ctx.played_interval_ms().is_none());
        ctx.set_played_interval_ms(Some(-20.0));
        assert!(ctx.played_interval_ms().is_none());
        ctx.set_played_interval_ms(Some(0.01));
        assert!(approx_eq(ctx.played_interval_ms().unwrap(), 1.0, 1e-3));
        ctx.set_played_interval_ms(Some(1_000_000.0));
        assert!(approx_eq(ctx.played_interval_ms().unwrap(), 4_000.0, 1e-3));
    }

    fn mk_onset(ts_ns: u64, amp: f32, centroid: f32, conf: f32) -> Onset {
        Onset {
            ts_ns,
            amplitude: amp,
            centroid,
            confidence: conf,
        }
    }

    #[test]
    fn pending_cluster_first_onset_seeds_all_fields() {
        let c = PendingCluster::from_onset(mk_onset(100, 0.4, 1200.0, 0.6));
        assert_eq!(c.first_ts_ns, 100);
        assert_eq!(c.loudest_ts_ns, 100);
        assert!(approx_eq(c.loudest_amp, 0.4, 1e-6));
        assert!(approx_eq(c.summed_amp, 0.4, 1e-6));
        assert!(approx_eq(c.max_confidence, 0.6, 1e-6));
        assert!(approx_eq(c.centroid, 1200.0, 1e-6));
    }

    #[test]
    fn pending_cluster_louder_followup_steals_timestamp_and_centroid() {
        let mut c = PendingCluster::from_onset(mk_onset(100, 0.3, 800.0, 0.4));
        c.merge(mk_onset(105, 0.5, 1800.0, 0.7)); // louder
        assert_eq!(c.loudest_ts_ns, 105);
        assert!(approx_eq(c.loudest_amp, 0.5, 1e-6));
        assert!(approx_eq(c.centroid, 1800.0, 1e-6));
        // Summed amp accumulates.
        assert!(approx_eq(c.summed_amp, 0.8, 1e-6));
        // Confidence takes the max.
        assert!(approx_eq(c.max_confidence, 0.7, 1e-6));
    }

    #[test]
    fn pending_cluster_quieter_followup_keeps_lead() {
        let mut c = PendingCluster::from_onset(mk_onset(100, 0.6, 2000.0, 0.8));
        c.merge(mk_onset(110, 0.2, 600.0, 0.4));
        // Lead onset still owns timestamp + centroid.
        assert_eq!(c.loudest_ts_ns, 100);
        assert!(approx_eq(c.centroid, 2000.0, 1e-6));
        // But the summed amplitude still grows.
        assert!(approx_eq(c.summed_amp, 0.8, 1e-6));
        // And confidence stays at the higher value.
        assert!(approx_eq(c.max_confidence, 0.8, 1e-6));
    }

    #[test]
    fn pending_cluster_summed_amp_clamped_to_one() {
        let mut c = PendingCluster::from_onset(mk_onset(100, 0.8, 500.0, 0.5));
        c.merge(mk_onset(105, 0.5, 500.0, 0.5));
        // Would be 1.3, must clamp to 1.0.
        assert!(approx_eq(c.summed_amp, 1.0, 1e-6));
        let out = c.flush();
        assert!(out.amplitude <= 1.0);
    }

    #[test]
    fn pending_cluster_flush_returns_lead_timestamp() {
        let mut c = PendingCluster::from_onset(mk_onset(100, 0.3, 1000.0, 0.5));
        c.merge(mk_onset(120, 0.7, 1500.0, 0.9)); // new loudest
        let out = c.flush();
        // Output uses loudest's timestamp + centroid + max confidence.
        assert_eq!(out.ts_ns, 120);
        assert!(approx_eq(out.centroid, 1500.0, 1e-6));
        assert!(approx_eq(out.confidence, 0.9, 1e-6));
    }
}
