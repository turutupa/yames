use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::audio_input::SharedAudioInput;
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
}

impl TempoContext {
    pub fn new(bpm: u16, subdivision: u8) -> Self {
        Self {
            bpm_x100: AtomicU32::new((bpm as u32) * 100),
            subdivision: AtomicU32::new(subdivision.max(1) as u32),
            is_playing: AtomicBool::new(false),
            played_interval_cms: AtomicU32::new(0),
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
        let refractory_ns =
            (Self::refractory_ms(interval_ms, floor_ms) as u64).saturating_mul(1_000_000);
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

    /// Main detection loop. Processes audio in hops, computes spectral flux,
    /// applies adaptive threshold, and emits onsets.
    ///
    /// Consumes the `InstrumentProfile`:
    ///   * `refractory_floor_ms` sets the lower bound on inter-onset gap.
    ///   * `cluster_window_ms` collapses near-simultaneous onsets into
    ///     one "musical event" (D2 chord/strum merge).
    ///   * `spectral_weights` biases the per-band flux contribution
    ///     toward the instrument's characteristic energy region.
    ///
    /// Consumes `tempo_ctx` to make the refractory period adaptive
    /// (`max(floor, subdivision_interval × 0.55)`).
    fn detect_loop<F>(
        alive: Arc<AtomicBool>,
        audio_input: SharedAudioInput,
        profile: InstrumentProfile,
        tempo_ctx: SharedTempoContext,
        on_onset: F,
    ) where
        F: Fn(Onset) + Send + 'static,
    {
        // aubio parameters: 1024-sample analysis window, 512-sample hop
        // (50% overlap). These match the old Goertzel frame size so the
        // refractory-period timing math and ring-buffer read sizing are
        // unchanged.
        let fft_size: usize = 1024;
        let hop_size: usize = fft_size / 2; // 512 — ~10.7 ms at 48 kHz

        // Read sample rate first — needed both for aubio init and for
        // the refractory / adaptive threshold math below.
        let sample_rate = {
            let ai = audio_input.lock().unwrap();
            ai.sample_rate()
        };

        // Instrument-specific onset algorithm. `InstrumentProfile` carries
        // `aubio_onset_method` ("hfc" / "complex" / "specflux") that maps
        // directly to aubio's built-in detectors. Parse, falling back to
        // SpecFlux if the string is unrecognised (should never happen in
        // practice).
        let aubio_mode = profile
            .aubio_onset_method
            .parse::<aubio::OnsetMode>()
            .unwrap_or(aubio::OnsetMode::SpecFlux);
        let mut detector = AubioOnset::new(aubio_mode, fft_size, hop_size, sample_rate)
            .expect("aubio::Onset init failed — invalid parameters");
        // Keep aubio's internal adaptive threshold; set the silence gate
        // explicitly at −70 dBFS (aubio's default). Our own adaptive RMS
        // noise floor is layered on top as a second guard.
        detector.set_silence(-70.0);

        // D2 adaptive noise floor — rolling 10th-percentile of RMS over
        // ~5 seconds of recent audio. Replaces the old hardcoded 0.01.
        // The 10th-percentile fix sidesteps the "user struck a note
        // during the bootstrap window" failure mode that plagued the
        // earlier "re-measure on signal drop" idea (which was circular
        // anyway — the threshold IS what we were trying to set).
        const RMS_HISTORY_LEN: usize = 500; // ~5s at 10ms/hop
        const NOISE_FLOOR_MULTIPLIER: f32 = 3.0;
        const MIN_NOISE_FLOOR: f32 = 0.002; // absolute lower bound
        let mut rms_history = vec![0.0_f32; RMS_HISTORY_LEN];
        let mut rms_write_pos = 0_usize;
        let mut rms_samples_seen = 0_usize;

        // D2 chord/strum merging — pending onset that's still inside
        // the cluster window. Once the window expires (or a louder
        // onset arrives), we forward the merged event.
        let cluster_window_ns = (profile.cluster_window_ms as u64) * 1_000_000;
        let mut pending: Option<PendingCluster> = None;

        // Refractory period is now computed PER-HOP from the live tempo
        // context (D2). Floor stays profile-driven so fast articulations
        // (drum rolls, guitar tremolo) aren't blocked just because the
        // grid is quarter notes — see plan's "DO NOT key refractory off
        // the grid subdivision alone."
        // The rule itself lives in `RefractoryGate` so the fixture suite
        // can drive the shipped decision without an audio device.
        let mut gate = RefractoryGate::new();

        // Diagnostic logging — env-flag gated so logs don't ship in
        // production builds. Flip on by launching the dev shell with:
        //   YAMES_ONSET_DEBUG=1 npm run tauri dev
        // The flag is read once here (not every hop — `std::env::var`
        // is a syscall) so toggling it requires a restart. Two log
        // channels:
        //   * Periodic state dump every ~1s of hops — useful when no
        //     onsets fire so you can see WHY (rms below floor, flux
        //     below threshold, refractory blocking, …).
        //   * Per-onset emission log — fires every time the detector
        //     emits a raw onset (before chord clustering).
        let debug_enabled = std::env::var("YAMES_ONSET_DEBUG").is_ok();
        if debug_enabled {
            eprintln!("[onset] debug logging enabled (sample_rate={sample_rate})");
        }
        let mut hops_since_log: u32 = 0;
        const LOG_EVERY_HOPS: u32 = 100; // ~1s at hop_size=512 @ 48kHz

        while alive.load(Ordering::SeqCst) {
            // Sleep a bit between processing (don't spin-wait)
            thread::sleep(Duration::from_millis(5));
            if !alive.load(Ordering::SeqCst) {
                break;
            }

            // Gate: only run detection while the metronome click track is
            // active. When stopped, flush any in-flight cluster so stale
            // events don't leak into the next session, reset
            // `last_onset_ns` so the refractory clock doesn't span the gap,
            // and reset the aubio phase vocoder so stale buffered samples
            // don't produce phantom onsets when playback resumes.
            if !tempo_ctx.is_playing() {
                if let Some(p) = pending.take() {
                    on_onset(p.flush());
                }
                gate.reset();
                detector.reset();
                continue;
            }

            // Feed the most recent hop into aubio. Read 4× hop_size from
            // the ring so we have enough samples even if the loop ran fast;
            // take only the tail hop_size chunk. Because the ring exposes
            // only `read_last` (no cursor-based advance), we may re-feed
            // duplicate hops on fast iterations — aubio handles this
            // gracefully via its internal phase-vocoder state; the
            // refractory period below suppresses any resulting duplicates.
            let new_samples = {
                let ai = audio_input.lock().unwrap();
                let ring = ai.ring();
                let r = ring.lock().unwrap();
                r.read_last(hop_size * 4)
            };

            if new_samples.len() < hop_size {
                continue;
            }

            let offset = new_samples.len().saturating_sub(hop_size);
            let hop_slice = &new_samples[offset..offset + hop_size];

            // Run aubio onset detection on this hop.
            // `do_result` returns > 0.0 when an onset is detected;
            // the exact value is an offset ∈ (0, 1] within the hop.
            let onset_value = match detector.do_result(hop_slice) {
                Ok(v) => v,
                Err(_) => continue,
            };

            // Compute RMS on the hop for amplitude and noise-floor gating.
            let rms = (hop_slice.iter().map(|s| s * s).sum::<f32>() / hop_size as f32).sqrt();

            // D2 adaptive noise floor — update rolling RMS history then
            // take 10th percentile × NOISE_FLOOR_MULTIPLIER. Until the
            // history is half full we use a conservative absolute floor
            // so the bootstrap period doesn't admit junk onsets.
            rms_history[rms_write_pos] = rms;
            rms_write_pos = (rms_write_pos + 1) % RMS_HISTORY_LEN;
            rms_samples_seen = (rms_samples_seen + 1).min(RMS_HISTORY_LEN);
            let noise_floor = if rms_samples_seen >= RMS_HISTORY_LEN / 2 {
                let mut sorted_rms = rms_history[..rms_samples_seen].to_vec();
                sorted_rms.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                let p10_idx = sorted_rms.len() / 10; // 10th percentile
                (sorted_rms[p10_idx] * NOISE_FLOOR_MULTIPLIER).max(MIN_NOISE_FLOOR)
            } else {
                MIN_NOISE_FLOOR
            };

            // D2 adaptive refractory — recompute per-hop from the live
            // tempo context. Floor (instrument physics) wins at fast
            // subdivisions; the multiplier wins at slow ones. Plan:
            // `max(profile.refractory_floor_ms, sub_interval × 0.55)`.
            //
            // Roadmap 1.3: the interval is no longer the click's. It is
            // the finer of the click and what the player is playing —
            // see `TempoContext::detection_interval_ms`. The ghost
            // window below keys off the same value, so both move
            // together and the band between them never inverts.
            let sub_interval_ms = tempo_ctx.detection_interval_ms();
            let adaptive_refractory_ms =
                RefractoryGate::refractory_ms(sub_interval_ms, profile.refractory_floor_ms);

            // Periodic state dump — see DEBUG comment near loop start.
            // Useful diagnostic when the user says "I'm playing but no
            // onsets fire": shows whether `rms > noise_floor` and the
            // aubio onset value are passing.
            if debug_enabled {
                hops_since_log += 1;
                if hops_since_log >= LOG_EVERY_HOPS {
                    hops_since_log = 0;
                    let rms_pass = rms > noise_floor;
                    eprintln!(
                        "[onset] state rms={:.4}{} onset_val={:.3} desc={:.3} floor={:.4} refrac={:.0}ms",
                        rms,
                        if rms_pass { ">floor" } else { "<floor" },
                        onset_value,
                        detector.get_descriptor(),
                        noise_floor,
                        adaptive_refractory_ms,
                    );
                }
            }

            // aubio signals an onset when do_result returns > 0.
            // We layer our own RMS noise-floor gate on top so brief
            // silence artefacts in the phase-vocoder don't fire.
            if onset_value > 0.0 && rms > noise_floor {
                let now_ns = crate::clock::now_ns();
                let since_last_ms = gate.since_last_ms(now_ns);

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
                let decision =
                    gate.admit(now_ns, rms, sub_interval_ms, profile.refractory_floor_ms);
                let is_ghost = decision == GateDecision::Ghost;
                if decision != GateDecision::Blocked {
                    if is_ghost {
                        if debug_enabled {
                            eprintln!(
                                "[onset] GHOST-WINDOW emitting since_last={}ms sub_int={:.0}ms rms={:.4} (refractory NOT updated)",
                                since_last_ms, sub_interval_ms, rms,
                            );
                        }
                    } else if debug_enabled {
                        eprintln!(
                            "[onset] FIRED rms={:.4} onset_val={:.3} desc={:.3} floor={:.4} since_last={}ms",
                            rms, onset_value, detector.get_descriptor(), noise_floor, since_last_ms,
                        );
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
                    let conf_desc = detector.get_thresholded_descriptor().clamp(0.0, 1.0);
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
                    if is_ghost || cluster_window_ns == 0 {
                        on_onset(onset);
                    } else {
                        // D2 chord/strum merging — if a pending onset is
                        // still inside the cluster window, fold this one in
                        // (keep the loudest's timestamp, sum amplitudes,
                        // take the higher confidence). Drums opt out by
                        // setting `cluster_window_ms = 0` in their profile.
                        let still_open = match pending.as_ref() {
                            Some(p) => {
                                onset.ts_ns.saturating_sub(p.first_ts_ns) <= cluster_window_ns
                            }
                            None => false,
                        };
                        if still_open {
                            // unwrap is safe — still_open ⇒ Some(_).
                            pending.as_mut().unwrap().merge(onset);
                        } else {
                            if let Some(old) = pending.take() {
                                on_onset(old.flush());
                            }
                            pending = Some(PendingCluster::from_onset(onset));
                        }
                    }
                } else if debug_enabled {
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
            if let Some(ref p) = pending {
                let now_ns = crate::clock::now_ns();
                if now_ns.saturating_sub(p.first_ts_ns) > cluster_window_ns {
                    let merged = pending.take().unwrap().flush();
                    on_onset(merged);
                }
            }
        }

        // Drain any final pending cluster on shutdown.
        if let Some(p) = pending.take() {
            on_onset(p.flush());
        }
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
