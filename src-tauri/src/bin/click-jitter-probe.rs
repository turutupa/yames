//! Audio-safety gate (ROADMAP §1 principle 1, §4) — click-jitter probe.
//!
//! Runs the *real* `MetronomeEngine` on the default output device and
//! measures the output callback from inside itself, optionally while the
//! coach LLM generates continuously on a background thread. The gate:
//!
//!   * p99 callback-to-callback jitter < 1 ms, and
//!   * zero missed beats over the measurement window.
//!
//! Usage:
//!
//! ```text
//!   cargo run --bin click-jitter-probe -- --no-llm
//!   cargo run --features coach-llm --bin click-jitter-probe -- --gguf model.gguf
//!   YAMES_LLM_GPU_LAYERS=0 cargo run --features coach-llm-vulkan \
//!       --bin click-jitter-probe -- --gguf model.gguf
//! ```
//!
//! Flags:
//!
//! ```text
//!   --bpm <n>            default 200
//!   --subdivision <n>    default 4   (200 BPM 16ths = 13.33 ticks/s)
//!   --seconds <n>        default 60  (length of the *measured* window)
//!   --warmup-ms <n>      default 1500 (stream start-up, excluded)
//!   --gguf <path>        loop coach::generate over this model
//!   --no-llm             baseline; no model, no generation thread
//!   --p99-ms <f>         jitter threshold, default 1.0
//!   --volume <f>         0.0-1.0, default 0.8 (the app's own default).
//!                        Changes the AMPLITUDE and nothing else: a voice's
//!                        gain is worked out once when it is spawned, so the
//!                        mixer does identical work at 0.01 and at 0.8. It
//!                        exists so the gate can be re-run on a machine
//!                        somebody is asleep next to
//!   --json               emit a machine-readable summary line as well
//!   --dump-csv <path>    write the raw per-callback capture for re-analysis
//!   --jam                load the busiest plausible jam (16 ticks a bar,
//!                        kick/snare/hat/ride, a fill and a crash on the one)
//!                        at 240 BPM, so the gate covers the band as well as
//!                        the click. Needs --subdivision 4, which is the
//!                        default; the run is refused at any other, because
//!                        the engine would play the click instead
//!   --jam-swap           --jam, and replace the table from another thread
//!                        every 350 ms (the bar-ahead bass handshake)
//!   --jam-move           --jam, and move the form while it plays: a loop
//!                        set and a jump every 2 s. Combines with --jam-swap
//!   --jam-kit <dir>      --jam, with the drums decoded from a folder of
//!                        your own WAVs. Combines with the three below
//!   --jam-voice <dir>    --jam, with the BASS AND THE KEYS played out of a
//!                        folder of recorded notes rather than out of the
//!                        synthesised recipes. That is a mono buffer through
//!                        the drum bus, a round robin decided on the tick,
//!                        and a raised-cosine release on every note the
//!                        line's cap ends — the one per-sample `cos`
//!                        anywhere near the callback, and the reason this
//!                        flag exists
//!   --jam-take           --jam, and record a take for the whole run: the
//!                        callback copies its mix into a lock-free ring and
//!                        a writer thread resamples, mixes and writes it to
//!                        a temporary WAV underneath the stream. Combines
//!                        with the other two
//!   --song               play an imported SONG rather than the click or the
//!                        band: a tempo map with a step in it, a 7/8 bar, and
//!                        the file's own drums, bass and keys. The one path
//!                        where the callback walks a table of sample
//!                        positions rather than counting ticks, so it is the
//!                        one the gate has to cover on its own. Not with --jam
//!   --song-loop          --song, looping the four bars that span the meter
//!                        change and the tempo step — the seam every few
//!                        seconds for the length of the run
//!   --song-take          --song, and record a take of it
//! ```
//!
//! Exit codes: 0 pass, 1 gate failure, 2 setup/usage error.
//!
//! ## What is being measured, exactly
//!
//! `CallbackProbe` (engine.rs) records, per cpal callback and with no
//! locking or allocation on the audio thread: entry timestamp, frame
//! count, the engine's sample counter, and how many metronome ticks were
//! rendered into that buffer.
//!
//! * **Jitter** — `|Δwall − frames_prev / sample_rate|`. The device
//!   consumes buffers at exactly `frames / sample_rate`, so in a healthy
//!   stream consecutive callback entries are that far apart and the
//!   residual is scheduling noise. This is the number ROADMAP §4 caps.
//! * **Max gap** — largest wall-clock interval between two callbacks. A
//!   gap larger than the device's buffered audio is an audible dropout.
//! * **Missed beats** — the sample counter only advances by frames the
//!   device actually took, so `wall_elapsed − audio_elapsed` is time the
//!   DAC spent without fresh samples. Divided by the tick interval, that
//!   is the number of clicks the user did not hear. Crystal skew between
//!   the audio and system clocks is ~100 ppm (≈6 ms over 60 s), three
//!   orders of magnitude below one 75 ms tick, so it cannot manufacture a
//!   false positive here.
//! * **Dropouts** — callbacks whose gap exceeded twice the buffer period,
//!   i.e. the device provably ran dry. Reported for diagnosis; the gate
//!   is on missed beats, which is what the musician perceives.
//! * **Callback allocations / frees** — every `malloc`, `realloc` and
//!   `free` made inside the body of the output callback, counted by this
//!   binary's own global allocator (see below). Entry-to-entry gaps cannot
//!   see these: an allocation on a warm heap is fast, and a rule that only
//!   shows up when it is slow is a rule nobody is testing. Hard gate at
//!   zero, both ways — a `free()` under the mixer is exactly what the
//!   retirement machinery in `engine.rs`, `take.rs` and `speech_out.rs`
//!   exists to prevent.
//! * **Dropped notifications** — beats the callback could not hand to the
//!   event loop. Hard gate at zero: `beat_log` is the only source
//!   `TimingAnalyzer` has for where a beat fell, so one of these is an
//!   expected onset the player is silently marked down for.

use std::alloc::{GlobalAlloc, Layout, System};
use std::process::ExitCode;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use yames_lib::probe::{
    compile_jam, compile_jam_with_voices, compile_song, create_beat_log, load_font,
    create_shared_state, in_callback, load_kit, load_voice_bank, perc_ids, reference_bank, reference_perc, CallbackProbe, CallbackSample,
    JamBassLine, JamConfig, JamKeysLine, JamMix, JamPattern, JamPosition, JamVoices, KitBank,
    MelodicBank, MetronomeEngine, SongBacking, SongBar, SongNote, SongRange, SongRole, SongSounds,
    SynthPlayer, SynthRing,
    SongTempo, SongTrack, SongTransport, TakeRing, TakeSession, TakeStart,
};

// ---------------------------------------------------------------------------
// The counting allocator — AGENTS.md's "nothing on the callback allocates",
// as a number instead of a promise
// ---------------------------------------------------------------------------

/// Allocations made inside the output callback's body during this run.
static CB_ALLOCS: AtomicU64 = AtomicU64::new(0);
/// Bytes those allocations asked for.
static CB_ALLOC_BYTES: AtomicU64 = AtomicU64::new(0);
/// Frees made inside it. A `free()` under the mixer is the fault the jam
/// table's, the take's and the coach's retirement paths all exist to avoid,
/// so it is counted separately and gated just as hard.
static CB_FREES: AtomicU64 = AtomicU64::new(0);

/// `System`, plus a count of what the audio thread did inside the callback.
///
/// **Probe-only by construction.** A `#[global_allocator]` applies to the
/// binary that declares it, and this is declared in the probe, so the app's
/// allocator is untouched — no branch, no atomic, nothing.
///
/// `yames_lib::probe::in_callback` is a thread-local `Cell<bool>` with a
/// `const` initialiser and no destructor: reading it here is a TLS slot load
/// that cannot allocate and so cannot recurse into this allocator. It is
/// true only for the span of the callback body, not for the whole audio
/// thread — cpal's own stream loop runs on that thread too, and a `malloc`
/// in the backend is not a Yames defect and must not be reported as one.
struct CountingAlloc;

unsafe impl GlobalAlloc for CountingAlloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if in_callback() {
            CB_ALLOCS.fetch_add(1, Ordering::Relaxed);
            CB_ALLOC_BYTES.fetch_add(layout.size() as u64, Ordering::Relaxed);
        }
        unsafe { System.alloc(layout) }
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        if in_callback() {
            CB_ALLOCS.fetch_add(1, Ordering::Relaxed);
            CB_ALLOC_BYTES.fetch_add(layout.size() as u64, Ordering::Relaxed);
        }
        unsafe { System.alloc_zeroed(layout) }
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        if in_callback() {
            CB_ALLOCS.fetch_add(1, Ordering::Relaxed);
            CB_ALLOC_BYTES.fetch_add(new_size as u64, Ordering::Relaxed);
        }
        unsafe { System.realloc(ptr, layout, new_size) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        if in_callback() {
            CB_FREES.fetch_add(1, Ordering::Relaxed);
        }
        unsafe { System.dealloc(ptr, layout) }
    }
}

#[global_allocator]
static ALLOCATOR: CountingAlloc = CountingAlloc;

/// The bass's range, mirrored from `engine.rs`. The probe builds a melodic
/// bank by hand, so it has to say which notes the band can ask for.
const PROBE_BASS_RANGE: (u8, u8) = (28, 55);
/// And the comping range.
const PROBE_KEYS_RANGE: (u8, u8) = (48, 84);

/// Pessimistic upper bound on callbacks per second used to size the
/// preallocated arena: 4000/s is a 0.25 ms buffer at 48 kHz, well below
/// anything WASAPI/CoreAudio/ALSA hands out in shared mode.
const MAX_CALLBACKS_PER_SEC: usize = 4000;

struct Args {
    bpm: u16,
    subdivision: u8,
    seconds: u64,
    warmup_ms: u64,
    gguf: Option<String>,
    no_llm: bool,
    p99_ms: f64,
    /// Output level, 0.0-1.0. The app's own default unless asked otherwise.
    ///
    /// Every gain the mixer applies — the click's, each drum's, the bass's —
    /// is multiplied by this ONCE, where the voice is spawned, and the
    /// per-sample loop never sees it. So a run at 0.01 renders exactly the
    /// same number of voices through exactly the same code as a run at 0.8
    /// and the numbers are comparable; what changes is whether the room
    /// hears it.
    volume: f32,
    json: bool,
    dump_csv: Option<String>,
    jam: bool,
    /// `--jam`, and replace the table from another thread every 350 ms
    /// while the stream runs, alternating two tables that differ only in
    /// their bass — the bar-ahead handshake the UI performs several times a
    /// chorus. The gate then covers the handoff and the retirement path.
    jam_swap: bool,
    /// `--jam`, and move the form from another thread while the stream runs:
    /// a loop set once and a jump every two seconds. The bar line then has
    /// the whole of `next_form_position` to do rather than a single add,
    /// and it does it inside the callback.
    jam_move: bool,
    /// `--jam`, and record a take of the whole run. The output callback
    /// then copies every buffer into a ring, a synthetic 44.1 kHz "mic"
    /// fills a second one, and a writer thread resamples, mixes and writes
    /// both to disk while the measurement is running — which is the load a
    /// take actually puts on the machine, and the one path where the audio
    /// thread does work on behalf of the filesystem.
    /// `--jam-take` or `--song-take`: record a take of the whole run. The
    /// output callback then copies every buffer into a ring, a synthetic
    /// 44.1 kHz "mic" fills a second one, and a writer thread resamples,
    /// mixes and writes both to disk while the measurement is running.
    ///
    /// One flag for both modes, because it is one path: `take.rs` does not
    /// know whether it is recording a band or a song, and that is exactly the
    /// claim `--song-take` is here to check.
    take: bool,
    /// Make that take out of everything this computer plays (W30).
    ///
    /// Opens a real loopback capture on the output device beside the engine's
    /// own stream, so the run measures the output callback with a SECOND
    /// device's callback running and a writer thread draining, resampling and
    /// folding its ring. Off unless `--jam-loopback-take` asks for it: it
    /// needs a sound card.
    loopback: bool,
    /// Play an imported SONG instead of the click or the band: a tempo map
    /// with a step in it, a 7/8 bar, and the file's own drums, bass and keys
    /// on every sixteenth.
    ///
    /// The one path where the callback walks a table of sample positions
    /// rather than counting ticks, so it is the one the gate has to cover
    /// separately: a different transport, a different table, a different
    /// retirement list.
    song: bool,
    /// `--song`, and loop a four-bar range of it — so the seam, which is the
    /// one moment a song's cursors all move at once, happens every few
    /// seconds for the length of the run.
    song_loop: bool,
    /// `--jam`, and play the bass and the keys out of this folder of
    /// recorded notes instead of the synthesised recipes.
    ///
    /// ONE FOLDER FOR BOTH LINES, and it works because the loader is asked
    /// for a range rather than told one: it builds whatever notes the band
    /// can ask for out of whatever notes the folder holds. A bank that spans
    /// the band covers a bass and a comping voice at once, and one that does
    /// not says so on the console and still plays.
    jam_voice: Option<String>,
    /// `--jam`, and play the drums out of this folder of WAVs instead of a
    /// built-in kit. The one sound source the audio thread reads that was
    /// not compiled into the binary: decoded on the command thread, handed
    /// over inside the table, and retired with it.
    jam_kit: Option<String>,
    /// Whether the tempo / resolution came from the command line, so `--jam`
    /// can supply its own 240 BPM sixteenths without overruling a run that
    /// asked for something else.
    bpm_set: bool,
    subdivision_set: bool,
}

impl Default for Args {
    fn default() -> Self {
        Self {
            bpm: 200,
            subdivision: 4,
            loopback: false,
            seconds: 60,
            warmup_ms: 1500,
            gguf: None,
            no_llm: false,
            p99_ms: 1.0,
            volume: 0.8,
            json: false,
            dump_csv: None,
            jam: false,
            jam_swap: false,
            jam_move: false,
            take: false,
            song: false,
            song_loop: false,
            jam_kit: None,
            jam_voice: None,
            bpm_set: false,
            subdivision_set: false,
        }
    }
}

fn parse_args() -> Result<Args, String> {
    let mut a = Args::default();
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < argv.len() {
        // Value-taking flags advance `i` twice; boolean flags once.
        let value = |i: usize| -> Result<&str, String> {
            argv.get(i + 1)
                .map(String::as_str)
                .ok_or_else(|| format!("{} needs a value", argv[i]))
        };
        let num = |i: usize| -> Result<f64, String> {
            let v = value(i)?;
            v.parse::<f64>()
                .map_err(|_| format!("{}: {v:?} is not a number", argv[i]))
        };
        let mut consumed = 2;
        match argv[i].as_str() {
            "--bpm" => {
                a.bpm = num(i)? as u16;
                a.bpm_set = true;
            }
            "--subdivision" => {
                a.subdivision = num(i)? as u8;
                a.subdivision_set = true;
            }
            "--seconds" => a.seconds = num(i)? as u64,
            "--warmup-ms" => a.warmup_ms = num(i)? as u64,
            "--p99-ms" => a.p99_ms = num(i)?,
            "--volume" => a.volume = (num(i)? as f32).clamp(0.0, 1.0),
            "--gguf" => a.gguf = Some(value(i)?.to_string()),
            "--dump-csv" => a.dump_csv = Some(value(i)?.to_string()),
            "--no-llm" => {
                a.no_llm = true;
                consumed = 1;
            }
            "--json" => {
                a.json = true;
                consumed = 1;
            }
            "--jam" => {
                a.jam = true;
                consumed = 1;
            }
            "--jam-swap" => {
                a.jam = true;
                a.jam_swap = true;
                consumed = 1;
            }
            "--jam-move" => {
                a.jam = true;
                a.jam_move = true;
                consumed = 1;
            }
            "--jam-take" => {
                a.jam = true;
                a.take = true;
                consumed = 1;
            }
            // W30 — the take is made of everything this computer plays, so a
            // SECOND audio device is open and delivering into a ring that the
            // same writer thread is draining, resampling and folding to
            // stereo, under the same output callback. That is the arrangement
            // `plans/SONGS.md` A12 has to be safe in, and this is how it is
            // measured. Needs a real speaker; on a machine with none the
            // capture refuses and the run says so rather than passing.
            "--jam-loopback-take" => {
                a.jam = true;
                a.take = true;
                a.loopback = true;
                consumed = 1;
            }
            "--song" => {
                a.song = true;
                consumed = 1;
            }
            "--song-loop" => {
                a.song = true;
                a.song_loop = true;
                consumed = 1;
            }
            "--song-take" => {
                a.song = true;
                a.take = true;
                consumed = 1;
            }
            "--jam-voice" => {
                a.jam = true;
                a.jam_voice = Some(value(i)?.to_string());
                i += 2;
            }
            "--jam-kit" => {
                a.jam = true;
                a.jam_kit = Some(value(i)?.to_string());
            }
            "-h" | "--help" => return Err("help".into()),
            other => return Err(format!("unknown flag {other}")),
        }
        i += consumed;
    }
    if a.subdivision == 0 {
        return Err("--subdivision must be >= 1".into());
    }
    if a.bpm == 0 {
        return Err("--bpm must be >= 1".into());
    }
    // A SONG IS ITS OWN ENGINE MODE, and the callback prefers it over the
    // band when both are loaded — so a run that asked for both would measure
    // the song and report the jam. Refuse rather than measure the wrong thing
    // quietly, which is the rule the `--jam --subdivision` check below is
    // also written under.
    if a.song && a.jam {
        return Err(
            "--song and --jam are different engine modes; the song wins and the jam \
             would be silent, so this run would measure the song and call it a jam"
                .into(),
        );
    }
    // The band's own band: 240 BPM sixteenths is 16 ticks a bar at 16 ticks
    // a second, which is the top of what a jam can ask the mixer for.
    if a.jam {
        if !a.bpm_set {
            a.bpm = 240;
        }
        if !a.subdivision_set {
            a.subdivision = 4;
        }
        // The band's table is sixteen ticks to a 4/4 bar, and the engine
        // compares that against `beats_per_measure * subdivision` on every
        // tick. At any other resolution it plays the plain click and says so
        // once — so `--jam --subdivision 3` would report a clean jam gate
        // having measured no jam at all. Refuse rather than measure the
        // wrong thing quietly.
        if a.subdivision != 4 {
            return Err(format!(
                "--jam plays a sixteen-tick bar, so it needs --subdivision 4; at \
                 --subdivision {} the engine falls back to the click and this run \
                 would measure the click",
                a.subdivision
            ));
        }
    }
    Ok(a)
}

const USAGE: &str = "\
click-jitter-probe — ROADMAP §4 audio-safety gate

  --bpm <n>          default 200
  --subdivision <n>  default 4
  --seconds <n>      measured window, default 60
  --warmup-ms <n>    excluded stream start-up, default 1500
  --gguf <path>      loop coach::generate over this model (needs
                     --features coach-llm | coach-llm-vulkan | coach-llm-metal)
  --no-llm           baseline run
  --p99-ms <f>       jitter threshold, default 1.0
  --volume <f>       0.0-1.0, default 0.8. Amplitude only — the mixer does
                     the same work at any level — so the gate can be run
                     next to somebody who is asleep
  --json             also print a one-line JSON summary
  --dump-csv <path>  write the raw per-callback capture for re-analysis
  --jam              play the busiest plausible jam instead of the click
  --jam-swap         --jam, and swap the table from another thread every
                     350 ms while playing (the bar-ahead bass handshake)
                     (16 ticks a bar, every lane, a fill, a crash on the
                     one) at 240 BPM / 16ths
  --jam-move         --jam, and move the form while playing: bars 2-4 of
                     the form looped and a jump every 2 s. Combines with
                     --jam-swap.
  --jam-take         --jam, and record a take for the whole run (the
                     callback's ring, a synthetic 44.1 kHz mic, and a
                     writer thread on the disk). Combines with both.
  --jam-voice <dir>  --jam, with the bass and the keys coming from a folder
                     of recorded notes rather than from the synthesised
                     recipes. Combines with the others
  --jam-kit <dir>    --jam, with the drums coming from a folder of your
                     own WAVs (kick, snare, snare_soft, hat, hat_open,
                     ride, rim, crash) rather than a built-in kit. The
                     folder is decoded at the device's own rate once the
                     stream is open, handed to the callback inside the
                     table, and swapped and retired with it. Combines
                     with all three above.
  --song             play an imported SONG instead of the click or the
                     band: twelve bars at 240 with a 7/8 at bar 4 and a
                     tempo step at bar 5, every drum on every sixteenth,
                     a bass on every eighth and a chord on every beat
                     held a beat and a half. The one path where the
                     callback walks a table of sample positions rather
                     than counting ticks. Not with --jam
  --song-loop        --song, looping the four bars that span the 7/8 and
                     the tempo step, so the seam — both cursors back to
                     nought with the voices left ringing — happens every
                     few seconds for the whole run
  --song-take        --song, and record a take of it. `take.rs` does not
                     know whether it is recording a band or a song, and
                     this is the flag that checks that

exit 0 = pass, 1 = gate failure, 2 = setup error";

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

fn percentile(sorted: &[f64], q: f64) -> f64 {
    if sorted.is_empty() {
        return f64::NAN;
    }
    // Nearest-rank; with thousands of samples the interpolation choice is
    // noise, and nearest-rank never invents a value the stream did not
    // actually produce.
    let rank = (q * sorted.len() as f64).ceil() as usize;
    sorted[rank.saturating_sub(1).min(sorted.len() - 1)]
}

struct Report {
    callbacks: usize,
    excluded: usize,
    overflow: usize,
    sample_rate: u32,
    median_frames: u32,
    buffer_ms: f64,
    wall_s: f64,
    audio_s: f64,
    jitter_p50: f64,
    jitter_p95: f64,
    jitter_p99: f64,
    jitter_max: f64,
    max_gap_ms: f64,
    dropouts: usize,
    ticks_rendered: u64,
    ticks_expected: f64,
    missed_beats: u64,
}

fn analyse(
    all: &[CallbackSample],
    sample_rate: u32,
    overflow: usize,
    window_start_ns: u64,
    tick_interval_s: f64,
) -> Result<Report, String> {
    let w: Vec<CallbackSample> = all
        .iter()
        .copied()
        .filter(|s| s.entry_ns >= window_start_ns)
        .collect();
    if w.len() < 3 {
        return Err(format!(
            "only {} callbacks in the measurement window — did the stream start?",
            w.len()
        ));
    }

    let sr = sample_rate as f64;
    let mut abs_jitter_ms: Vec<f64> = Vec::with_capacity(w.len());
    let mut max_gap_ms = 0.0f64;
    let mut dropouts = 0usize;

    for pair in w.windows(2) {
        let (a, b) = (pair[0], pair[1]);
        let delta_ms = (b.entry_ns.saturating_sub(a.entry_ns)) as f64 / 1e6;
        // The device drains the buffer `a` just filled at exactly
        // frames/sample_rate, so that is when `b` is due.
        let expected_ms = a.frames as f64 / sr * 1000.0;
        abs_jitter_ms.push((delta_ms - expected_ms).abs());
        if delta_ms > max_gap_ms {
            max_gap_ms = delta_ms;
        }
        if expected_ms > 0.0 && delta_ms > 2.0 * expected_ms {
            dropouts += 1;
        }
    }
    abs_jitter_ms.sort_by(|x, y| x.partial_cmp(y).unwrap());

    let first = w[0];
    let last = w[w.len() - 1];
    let wall_s = (last.entry_ns - first.entry_ns) as f64 / 1e9;
    let audio_s = (last.sample_pos.saturating_sub(first.sample_pos)) as f64 / sr;
    let ticks_rendered: u64 = w.iter().map(|s| s.ticks as u64).sum();
    let ticks_expected = wall_s / tick_interval_s;
    // Time the DAC had no fresh samples, in ticks. Negative (audio clock
    // running fast) floors at zero.
    let missed_beats = (((wall_s - audio_s) / tick_interval_s).floor()).max(0.0) as u64;

    let mut frames: Vec<u32> = w.iter().map(|s| s.frames).collect();
    frames.sort_unstable();
    let median_frames = frames[frames.len() / 2];

    Ok(Report {
        callbacks: w.len(),
        excluded: all.len() - w.len(),
        overflow,
        sample_rate,
        median_frames,
        buffer_ms: median_frames as f64 / sr * 1000.0,
        wall_s,
        audio_s,
        jitter_p50: percentile(&abs_jitter_ms, 0.50),
        jitter_p95: percentile(&abs_jitter_ms, 0.95),
        jitter_p99: percentile(&abs_jitter_ms, 0.99),
        jitter_max: abs_jitter_ms.last().copied().unwrap_or(f64::NAN),
        max_gap_ms,
        dropouts,
        ticks_rendered,
        ticks_expected,
        missed_beats,
    })
}

// ---------------------------------------------------------------------------
// LLM load generator
// ---------------------------------------------------------------------------

/// A realistic mini-report context — same shape `miniReport.ts` builds.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
const LLM_CONTEXT: &str = "\
Accuracy: 78
SignedDev: -6.4
HitCompleteness: 0.81
Longest clean streak: 12
Tempo: 200 BPM, 16th notes
Give the player one concrete thing to fix.";

/// Only constructed on `coach-llm` builds; the default build's `start_llm`
/// always errors, so every field would otherwise read as dead code.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
struct LlmRun {
    handle: Option<std::thread::JoinHandle<()>>,
    generations: Arc<AtomicU64>,
    failures: Arc<AtomicU64>,
    backend: String,
    load_secs: f64,
}

#[cfg(feature = "coach-llm")]
fn start_llm(path: &str, stop: Arc<AtomicBool>) -> Result<LlmRun, String> {
    use std::time::Instant;
    use yames_lib::probe::{
        create_shared_engine, generate, load_model, GenKind, CURRENT_BRAIN_FAMILY,
    };

    let p = std::path::PathBuf::from(path);
    if !p.exists() {
        return Err(format!("--gguf: no such file: {path}"));
    }

    let backend = if cfg!(feature = "coach-llm-vulkan") {
        "vulkan"
    } else if cfg!(feature = "coach-llm-metal") {
        "metal"
    } else {
        "cpu"
    };
    let gpu_layers = std::env::var("YAMES_LLM_GPU_LAYERS").unwrap_or_else(|_| "(unset)".into());
    eprintln!("[probe] loading {path} (backend={backend}, YAMES_LLM_GPU_LAYERS={gpu_layers})");

    // Load before the metronome starts: the gate is about *generation*
    // disturbing the click, and a 60 s window that begins mid-load would
    // measure a different thing every run.
    let started = Instant::now();
    let engine = create_shared_engine();
    // The probe points at a bare GGUF with no `model.json` marker beside
    // it, so the family the loader gates on is asserted here rather than
    // read off disk.
    if !load_model(&engine, &p, Some(CURRENT_BRAIN_FAMILY), "probe model")? {
        return Err(format!("model did not load: {path}"));
    }
    let load_secs = started.elapsed().as_secs_f64();
    eprintln!("[probe] model loaded in {load_secs:.1}s");

    let generations = Arc::new(AtomicU64::new(0));
    let failures = Arc::new(AtomicU64::new(0));
    let gens = generations.clone();
    let fails = failures.clone();

    let handle = std::thread::Builder::new()
        .name("probe-llm".into())
        .spawn(move || {
            // Since T04 the model lives on the coach's own inference thread,
            // which is lowered to below-normal priority once at spawn;
            // `generate` just queues a job there, so this loop measures the
            // shipping behaviour without any priority dance of its own.
            {
                while !stop.load(Ordering::Relaxed) {
                    // `Chat` deliberately: it carries the 256-token budget,
                    // which is the longest generation the coach ever runs and
                    // therefore the heaviest thing the audio thread has to
                    // survive. (`Tip` would skip inference entirely on a CPU
                    // build — the AGENTS.md tier rule — and measure nothing.)
                    match generate(&engine, GenKind::Chat, LLM_CONTEXT) {
                        Ok(_) => {
                            gens.fetch_add(1, Ordering::Relaxed);
                        }
                        Err(e) => {
                            fails.fetch_add(1, Ordering::Relaxed);
                            eprintln!("[probe] generation failed: {e}");
                        }
                    }
                }
            }
        })
        .map_err(|e| format!("failed to spawn LLM thread: {e}"))?;

    Ok(LlmRun {
        handle: Some(handle),
        generations,
        failures,
        backend: backend.to_string(),
        load_secs,
    })
}

#[cfg(not(feature = "coach-llm"))]
fn start_llm(_path: &str, _stop: Arc<AtomicBool>) -> Result<LlmRun, String> {
    Err("this binary was built without the coach-llm feature — rebuild with \
         `--features coach-llm` (or coach-llm-vulkan / coach-llm-metal), \
         or pass --no-llm"
        .into())
}

// ---------------------------------------------------------------------------

/// The busiest jam anyone could plausibly ask for, for `--jam`.
///
/// Sixteen ticks to the bar with every lane working, a fill on the last bar
/// of a four-bar form where every lane plays every tick, and a crash on the
/// one. The kick, the snare and the crash all ring out uncapped, so at 240
/// BPM this keeps dozens of voices alive at once — which is the thing the
/// gate has to cover. If the click survives this, it survives any groove the
/// library can hold.
fn busiest_jam() -> JamConfig {
    JamConfig {
        ticks_per_beat: 4,
        beats_per_bar: 4,
        bar: JamPattern {
            kick: vec![2, 0, 0, 1, 1, 0, 1, 0, 2, 0, 0, 1, 1, 0, 1, 0],
            snare: vec![0, 0, 3, 0, 2, 0, 0, 3, 0, 3, 0, 0, 2, 0, 3, 1],
            hat: vec![1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3],
            // The wash on the last sixteenth of each beat, where a drummer
            // opens it. It is a lane of its own now (B5), and it rings four
            // ticks, so it is one more voice the mixer carries across the
            // bar line.
            hat_open: vec![0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
            ride: vec![1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
            crash: vec![0; 16],
            // The toms are their own lanes now, and a groove that uses them
            // is one more voice ringing uncapped per tick. Sparse here and
            // solid in the fill below, which is where a drummer puts them.
            tom_hi: vec![0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
            tom_lo: vec![0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
            // THE PERCUSSIONIST, all ten rows of them. Nobody writes a
            // groove with a shaker, a cabasa, a guiro, two congas, two
            // bongos, a cowbell, a tambourine AND claves in it — this is
            // the worst bar the table can describe, which is the only bar
            // the gate is about. Levels vary per row so each one reaches a
            // different layer of the set, and the two-round-robin voices
            // step through both.
            shaker: vec![2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1],
            tambourine: vec![0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0],
            cowbell: vec![2, 0, 0, 1, 0, 0, 2, 0, 0, 1, 0, 0, 2, 0, 0, 0],
            cabasa: vec![1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2],
            claves: vec![2, 0, 0, 1, 0, 0, 1, 0, 0, 0, 2, 0, 0, 2, 0, 0],
            guiro: vec![0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 2, 0],
            conga_hi: vec![0, 3, 0, 2, 0, 3, 0, 4, 0, 3, 0, 2, 0, 3, 0, 4],
            conga_lo: vec![1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0],
            bongo_hi: vec![0, 0, 3, 0, 0, 2, 0, 0, 3, 0, 0, 2, 0, 0, 3, 0],
            bongo_lo: vec![0, 2, 0, 0, 1, 0, 0, 2, 0, 0, 1, 0, 0, 2, 0, 0],
            ..Default::default()
        },
        // Every lane on every tick: the worst bar the table can describe.
        // Every lane on every tick, at the LOUDEST LEVEL THERE IS: level 4
        // reaches the hardest layer the kit has and the ride's own bell, so
        // this is the worst bar the table can describe on a kit with four
        // layers as well as on one with a single sample.
        fill: Some(JamPattern {
            kick: vec![4; 16],
            snare: vec![4; 16],
            hat: vec![1; 16],
            hat_open: vec![1; 16],
            ride: vec![4; 16],
            crash: vec![0; 16],
            tom_hi: vec![4; 16],
            tom_lo: vec![4; 16],
            // And the percussionist on every tick of it, at the top level:
            // ten more voices spawning on every sixteenth, on top of a bar
            // that was already the worst one the table can hold. This is
            // what the caps in `jam.rs` are for and the number the gate
            // reports.
            shaker: vec![4; 16],
            tambourine: vec![4; 16],
            cowbell: vec![4; 16],
            cabasa: vec![4; 16],
            claves: vec![4; 16],
            guiro: vec![4; 16],
            conga_hi: vec![4; 16],
            conga_lo: vec![4; 16],
            bongo_hi: vec![4; 16],
            bongo_lo: vec![4; 16],
            ..Default::default()
        }),
        form_bars: 4,
        crash_on_one: true,
        intensity: 1.6,
        // The longest kit in the set: a 700 ms crash, a 400 ms ride and a
        // 330 ms open hat (`src-tauri/sounds/KITS.md`). Voices that ring
        // longer overlap more, and overlapping voices are what the mixer
        // pays for, so brushes is the kit that costs the callback the most
        // per tick — not the one anyone would pick for this groove.
        kit: "brushes".to_string(),
        // And a bass under it, on every tick. A note per sixteenth at
        // 240 BPM is nobody's bass line; it is the maximum rate the table
        // can ask the engine to spawn one, which is the number the gate is
        // about.
        bass: Some(JamBassLine {
            pitches: vec![40, 45, 47, 52, 40, 45, 47, 52, 38, 43, 45, 50, 38, 43, 45, 50],
            gain: 1.0,
            ..Default::default()
        }),
        // The practice windows only ever take work away, so the probe runs
        // without them: the busiest case is the band playing every bar.
        practice: None,
        fill_every: None,
        // And a comping voice over the top. Four notes on every eighth is
        // nobody's piano part; it is the maximum the table can ask for on
        // the one lane that SUSTAINS, and sustaining voices are what the
        // mixer pays for. Sixteen sixteenths of drums keep four to eight
        // voices alive; this adds eight more that are still ringing when
        // the next chord lands.
        keys: Some(JamKeysLine {
            voicings: (0..16)
                .map(|t| {
                    if t % 2 == 0 {
                        vec![55, 60, 64, 67]
                    } else {
                        Vec::new()
                    }
                })
                .collect(),
            gain: 1.5,
            ..Default::default()
        }),
        // Every lane as loud as the contract lets it be.
        mix: Some(JamMix {
            drums: 1.5,
            bass: 1.5,
            keys: 1.5,
            perc: 1.5,
        }),
        count_in_sound: None,
        bass_voice: None,
        keys_voice: None,
        custom_kit: None,
        // The cross-stick, so the probe covers the fallback chain as well:
        // every ghost in the groove above resolves through `rim`, which on
        // a kit without one is the softest snare there is.
        snare_ghost_is_rim: Some(true),
        ..Default::default()
    }
}

/// Ticks to a quarter note, as `song.rs` fixes it.
const SONG_TPQ: u32 = 960;

/// The busiest song anyone could plausibly import, for `--song`.
///
/// Twelve bars at 240 BPM with a 7/8 at bar 4 and a tempo step to 180 on the
/// bar line of bar 5 — so the run crosses a meter change and a tempo change
/// over and over — with the file's own drums on every sixteenth, a bass note
/// on every eighth and a four-note chord on every beat held for a beat and a
/// half, so there is always a voicing still ringing when the next one lands.
///
/// It is the song shape of `busiest_jam` and it is written for the same
/// reason: the gate is about what the mixer carries, not about music. What it
/// adds over the jam is the thing only a song has — a table of absolute
/// sample positions, two cursors walking it, a tempo step inside it, and
/// (with `--song-loop`) a seam every four bars where both cursors go back to
/// nought while the voices do not.
fn probe_song(loops: bool) -> (SongTransport, SongBacking) {
    let mut bars = Vec::new();
    let mut tick = 0u32;
    for i in 0..12u32 {
        let (num, den) = if i == 4 { (7u32, 8u32) } else { (4, 4) };
        let len = SONG_TPQ * 4 / den * num;
        bars.push(SongBar {
            start_tick: tick,
            length_ticks: len,
            numerator: num,
            denominator: den,
        });
        tick += len;
    }
    let step_at = bars[5].start_tick;
    let mut drums = Vec::new();
    let mut bass = Vec::new();
    let mut keys = Vec::new();
    // Every drum this engine has a voice for, cycled over the sixteenths, so
    // the choke masks, the percussion set and the fallback chain are all in
    // the run rather than only the kick and the snare.
    const GM: [u8; 12] = [36, 42, 38, 46, 41, 44, 47, 49, 51, 53, 54, 56];
    // And a guitar, which is what W28 added and what a two-guitar tab is
    // made of: six notes a bar through the synthesiser, ringing across the
    // beat, so the ring the callback reads is never empty and the renderer
    // has real work to do under the measurement.
    let mut guitar = Vec::new();
    for bar in bars.iter() {
        let sixteenth = SONG_TPQ / 4;
        let mut at = bar.start_tick;
        let mut n = 0usize;
        while at < bar.start_tick + bar.length_ticks {
            drums.push(SongNote {
                tick: at,
                dur_ticks: sixteenth,
                midi: GM[n % GM.len()],
                velocity: 0.9,
            });
            // Two drums on most sixteenths: a kit plays a hand and a foot at
            // once, and two onsets on one sample is the case the cursor walk
            // has to get right.
            drums.push(SongNote {
                tick: at,
                dur_ticks: sixteenth,
                midi: GM[(n + 5) % GM.len()],
                velocity: 0.6,
            });
            n += 1;
            at += sixteenth;
        }
        let eighth = SONG_TPQ / 2;
        let mut at = bar.start_tick;
        while at < bar.start_tick + bar.length_ticks {
            bass.push(SongNote {
                tick: at,
                dur_ticks: eighth,
                midi: 40 + (at / eighth % 12) as u8,
                velocity: 0.9,
            });
            at += eighth;
        }
        let beat = SONG_TPQ * 4 / bar.denominator;
        let mut at = bar.start_tick;
        while at < bar.start_tick + bar.length_ticks {
            for note in [55u8, 60, 64, 67] {
                keys.push(SongNote {
                    tick: at,
                    // A beat and a half: the chord is still ringing when the
                    // next one starts, which is what makes the mixer carry
                    // eight voices of keys instead of four.
                    dur_ticks: beat + beat / 2,
                    midi: note,
                    velocity: 0.8,
                });
            }
            at += beat;
        }
        let beat = SONG_TPQ * 4 / bar.denominator;
        let mut at = bar.start_tick;
        let mut n = 0usize;
        while at < bar.start_tick + bar.length_ticks {
            for note in [52u8, 59, 64] {
                guitar.push(SongNote {
                    tick: at,
                    dur_ticks: beat + beat / 2,
                    midi: note + (n % 3) as u8,
                    velocity: 0.75,
                });
            }
            n += 1;
            at += beat;
        }
    }
    (
        SongTransport {
            ticks_per_quarter: SONG_TPQ,
            tempo_map: vec![
                SongTempo { tick: 0, bpm: 240.0 },
                SongTempo {
                    tick: step_at,
                    bpm: 180.0,
                },
            ],
            bars,
            // Four bars that span the 7/8 AND the tempo step, so a looping
            // run crosses both on every pass.
            range: if loops {
                SongRange {
                    start_bar: 3,
                    end_bar: 6,
                }
            } else {
                SongRange {
                    start_bar: 0,
                    end_bar: 11,
                }
            },
            loops,
            tempo_percent: 100,
            // A count-in is a few clicks at the start and nothing the gate
            // can see over sixty seconds; the run is about the piece.
            count_in_bars: 0,
            start_tick: 0,
            drums_as_written: false,
        },
        SongBacking {
            tracks: vec![
                SongTrack {
                    role: SongRole::Drums,
                    name: "drums".into(),
                    program: 0,
                    guide: false,
                    percussion: false,
                    bends: Vec::new(),
                    notes: drums,
                },
                SongTrack {
                    role: SongRole::Bass,
                    name: "bass".into(),
                    program: 0,
                    guide: false,
                    percussion: false,
                    bends: Vec::new(),
                    notes: bass,
                },
                SongTrack {
                    role: SongRole::Keys,
                    name: "keys".into(),
                    program: 0,
                    guide: false,
                    percussion: false,
                    bends: Vec::new(),
                    notes: keys,
                },
                SongTrack {
                    role: SongRole::Synth,
                    name: "guitar".into(),
                    // 30, overdriven guitar: the loudest, busiest voice in a
                    // General MIDI set, which is the one to measure.
                    program: 29,
                    guide: true,
                    percussion: false,
                    bends: Vec::new(),
                    notes: guitar,
                },
            ],
        },
    )
}

fn main() -> ExitCode {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            if e != "help" {
                eprintln!("error: {e}\n");
            }
            eprintln!("{USAGE}");
            return if e == "help" {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(2)
            };
        }
    };

    if args.gguf.is_some() && args.no_llm {
        eprintln!("error: --gguf and --no-llm are mutually exclusive");
        return ExitCode::from(2);
    }
    if args.gguf.is_none() && !args.no_llm {
        eprintln!("error: pass either --gguf <path> or --no-llm");
        return ExitCode::from(2);
    }

    let tick_interval_s = 60.0 / args.bpm as f64 / args.subdivision as f64;
    let total_s = args.seconds + args.warmup_ms.div_ceil(1000);

    // ---- LLM first, so the model is warm before the window opens ----
    let stop = Arc::new(AtomicBool::new(false));
    let mut llm: Option<LlmRun> = None;
    if let Some(ref path) = args.gguf {
        match start_llm(path, stop.clone()) {
            Ok(run) => llm = Some(run),
            Err(e) => {
                eprintln!("error: {e}");
                return ExitCode::from(2);
            }
        }
    }

    // ---- Engine ----
    let capacity = (total_s as usize + 2) * MAX_CALLBACKS_PER_SEC;
    let cb_probe = Arc::new(CallbackProbe::new(capacity));
    let beat_log = create_beat_log();
    let state = create_shared_state();
    {
        let mut s = state.lock().unwrap();
        s.bpm = args.bpm;
        s.subdivision = args.subdivision;
        s.volume = args.volume;
        s.is_playing = true;
        // A 4/4 bar keeps the accent pattern (and therefore the voice mix)
        // representative; nothing here changes tick spacing.
        s.beat_groups = vec![4];
    }

    let mut engine = MetronomeEngine::new_with_probe(beat_log, cb_probe.clone());
    if args.jam {
        let cfg = busiest_jam();
        match compile_jam(&cfg) {
            Ok(table) => {
                eprintln!(
                    concat!(
                        "[probe] jam loaded: {} kit, {} ticks a bar, {} bars a chorus, ",
                        "fill on, crash on the one, bass on every tick; ",
                        "loudest sample {:.3} -> {:.3} after normalisation"
                    ),
                    cfg.kit,
                    table.ticks_per_bar(),
                    table.form_bars(),
                    table.peak_before,
                    table.peak_after,
                );
                engine.set_jam_table(Some(Arc::new(table)));
            }
            Err(e) => {
                eprintln!("error: the probe's own jam did not compile: {e}");
                return ExitCode::from(2);
            }
        }
    }
    // THREE TRIES AT THE DEVICE, not one.
    //
    // `start_headless` waits `AUDIO_SETUP_TIMEOUT` — two seconds — for the
    // audio thread to say whether it got a stream, and on a box where five
    // other agents are running `cargo build` that is not always enough to
    // enumerate the devices and decode the sound bank at the device's rate.
    // The engine is left startable by a failed setup (that is what
    // `AudioThreadExit` is for, and `a_failed_audio_setup_leaves_the_engine_
    // startable_again` is the test), so asking again is the honest fix for a
    // shared machine. A run that gets a stream on the second try is not a
    // worse measurement — the window has not opened yet.
    let mut started = Err("not attempted".to_string());
    for attempt in 1..=3 {
        started = engine.start_headless(state.clone());
        match started {
            Ok(()) => break,
            Err(ref e) => eprintln!("[probe] audio setup attempt {attempt}/3 failed: {e}"),
        }
    }
    if let Err(e) = started {
        eprintln!("error: audio engine did not start: {e}");
        return ExitCode::from(2);
    }

    // `--jam-kit`: the musician's own drums, decoded HERE rather than
    // above, because a folder is resampled to the output rate and the
    // output rate is not a thing anyone knows until the device has opened.
    // Installing it now also makes this a live handoff into a running
    // stream, which is more of a test than a table set before the first
    // buffer, not less. It lands inside the warm-up window the measurement
    // already excludes.
    let custom_kit: Option<Arc<KitBank>> = match args.jam_kit {
        Some(ref dir) => {
            let rate = engine.output_sample_rate().unwrap_or(48_000);
            let bank = match load_kit(std::path::Path::new(dir), rate) {
                Ok(b) => Arc::new(b),
                Err(e) => {
                    eprintln!("error: --jam-kit {dir}: {e}");
                    return ExitCode::from(2);
                }
            };
            eprintln!(
                "[probe] kit from {dir}: {} at {} Hz, {:.1} MB decoded",
                bank.found
                    .iter()
                    .map(|v| format!("{} {}x{}", v.voice, v.layers, v.rr))
                    .collect::<Vec<_>>()
                    .join(", "),
                bank.rate,
                bank.bytes as f64 / (1024.0 * 1024.0),
            );
            Some(bank)
        }
        None => None,
    };

    // `--song`: built HERE rather than before the stream, because a song's
    // tables are sample positions at the OUTPUT rate and the output rate is
    // not a thing anybody knows until the device has opened. Installing it
    // now also makes this a live handoff into a running stream, which is more
    // of a test than a table set before the first buffer, not less; it lands
    // inside the warm-up window the measurement already excludes.
    // The renderer thread and the ring it fills, held for the life of the
    // run: dropping the player stops and joins the thread, which is a thing
    // the end of `main` may do and the callback may not.
    let mut song_synth: Option<(SynthPlayer, Arc<SynthRing>)> = None;
    if args.song {
        let rate = engine.output_sample_rate().unwrap_or(48_000);
        let (transport, backing) = probe_song(args.song_loop);
        let sounds = SongSounds {
            // The reference decode, as `--jam` uses: it is built at
            // `JAM_REFERENCE_SR` rather than at the device's rate, so on a
            // 44.1 kHz box the probe's drums are a fraction of a semitone
            // sharp. That is a pitch the gate does not measure — the mixer
            // reads the same number of samples either way — and it saves the
            // run a second decode of the whole kit.
            bank: match reference_bank("brushes") {
                Ok(b) => b,
                Err(e) => {
                    eprintln!("error: the probe's song kit did not decode: {e}");
                    return ExitCode::from(2);
                }
            },
            perc: reference_perc(),
            // The synthesised recipes, as a checkout without the voice
            // folders plays. `--jam-voice` is the flag that covers recorded
            // banks, and it covers the same `SoundId::Voice` path.
            voices: JamVoices::default(),
        };
        let table = match compile_song(
            &transport,
            Some(&backing),
            sounds,
            rate,
            args.subdivision as u32,
        ) {
            Ok(t) => t,
            Err(e) => {
                eprintln!("error: the probe's own song did not compile: {e}");
                return ExitCode::from(2);
            }
        };
        eprintln!(
            "[probe] song loaded: {} bars of the range, one pass is {:.2} s at {} Hz, \
             {} clicks and {} band notes a pass, {} dropped, band held at {:.2}, \
             {}",
            table.bars().len(),
            table.pass_samples() as f64 / rate as f64,
            rate,
            table.ticks().len(),
            table.band().len(),
            table.dropped_notes,
            table.band_trim,
            if table.loops() {
                "looping"
            } else {
                "one pass then the transport stops"
            },
        );
        // ---- THE SYNTHESISER, AND THE THREAD FEEDING IT ----
        //
        // W28. This is the one thing on the callback that another thread
        // fills, so the gate has to cover it: without a renderer running, the
        // ring is empty and `ready()` returns 0 on every buffer, which is the
        // one path that costs nothing and proves nothing. The player is held
        // for the life of the run and dropped at the end, where joining a
        // thread is allowed.
        let table = Arc::new(table);
        song_synth = match (table.synth(), table.synth_score.clone()) {
            (Some(ring), Some(score)) => match load_font(None) {
                Ok(font) => {
                    // The callback has not run a buffer for this table yet,
                    // so the renderer may begin as soon as it is started.
                    match SynthPlayer::start(Arc::clone(ring), score, font, rate) {
                        Ok(player) => {
                            eprintln!(
                                "[probe] the song's guitar is on the synthesiser: \
                                 {} note-ons a pass, {} ms of lead into a {} frame ring",
                                table.synth_notes,
                                yames_lib::synth::SYNTH_LEAD_MS,
                                ring.capacity(),
                            );
                            Some((player, Arc::clone(ring)))
                        }
                        Err(e) => {
                            eprintln!("error: the probe's renderer would not start: {e}");
                            return ExitCode::from(2);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("error: the probe's sound set did not load: {e}");
                    return ExitCode::from(2);
                }
            },
            _ => None,
        };
        engine.set_song_table(Some(table));
    }

    // WHICH PERCUSSION SET the band is playing, said out loud. The ten
    // rows in `busiest_jam` are silent on a checkout with no `sounds/perc`
    // in it, and a gate that measured a band with no percussionist without
    // saying so would be a gate reporting the wrong band.
    match perc_ids().first() {
        Some(id) => eprintln!("[probe] percussion set: {id}, under every kit"),
        None => eprintln!(
            "[probe] no percussion set is shipped: the ten percussion rows are SILENT"
        ),
    }

    // `--jam-voice`: recorded bass and keys, built HERE for the reason the
    // kit is decoded here — a bank's notes are built at the OUTPUT rate, and
    // the output rate is not a thing anyone knows until the device has
    // opened. One folder, asked for two ranges.
    let voices: JamVoices = match args.jam_voice {
        Some(ref dir) => {
            let rate = engine.output_sample_rate().unwrap_or(48_000);
            let path = std::path::Path::new(dir);
            let build = |low: u8, high: u8| -> Result<Arc<MelodicBank>, String> {
                load_voice_bank(path, rate, low, high).map(Arc::new)
            };
            let (bass, keys) = match (
                build(PROBE_BASS_RANGE.0, PROBE_BASS_RANGE.1),
                build(PROBE_KEYS_RANGE.0, PROBE_KEYS_RANGE.1),
            ) {
                (Ok(b), Ok(k)) => (b, k),
                (Err(e), _) | (_, Err(e)) => {
                    eprintln!("error: --jam-voice {dir}: {e}");
                    return ExitCode::from(2);
                }
            };
            for (what, bank) in [("bass", &bass), ("keys", &keys)] {
                eprintln!(
                    "[probe] {what} from {dir}: {} notes x {} layers x {} rr at {} Hz, \
                     {:.1} MB, {} ms release, furthest note {} semitones from its sample",
                    bank.notes(),
                    bank.layers(),
                    bank.rr(),
                    bank.rate,
                    bank.bytes as f64 / (1024.0 * 1024.0),
                    bank.release_frames * 1000 / bank.rate.max(1),
                    bank.worst_stretch,
                );
            }
            JamVoices {
                bass: Some(bass),
                keys: Some(keys),
            }
        }
        None => JamVoices::default(),
    };

    // Either flag means the table the stream opened with is the wrong one,
    // so it is recompiled and handed over live — which is more of a test
    // than a table set before the first buffer, not less. It lands inside
    // the warm-up window the measurement already excludes.
    if args.jam_kit.is_some() || args.jam_voice.is_some() {
        let bank = match custom_kit.clone() {
            Some(b) => b,
            None => match reference_bank(&busiest_jam().kit) {
                Ok(b) => b,
                Err(e) => {
                    eprintln!("error: the probe's kit did not decode: {e}");
                    return ExitCode::from(2);
                }
            },
        };
        match compile_jam_with_voices(&busiest_jam(), bank, voices.clone()) {
            Ok(table) => {
                eprintln!(
                    "[probe] jam recompiled on the folders it was given; loudest \
                     sample {:.3} -> {:.3} after normalisation",
                    table.peak_before, table.peak_after,
                );
                engine.set_jam_table(Some(Arc::new(table)));
            }
            Err(e) => {
                eprintln!("error: the probe's jam did not compile on those folders: {e}");
                return ExitCode::from(2);
            }
        }
    }

    eprintln!(
        "[probe] {} BPM / subdivision {} ({:.1} ticks/s, {:.2} ms apart), volume {:.2}, \
         warmup {} ms, window {} s",
        args.bpm,
        args.subdivision,
        1.0 / tick_interval_s,
        tick_interval_s * 1000.0,
        args.volume,
        args.warmup_ms,
        args.seconds,
    );

    // `--jam-swap`: another thread keeps replacing the table with one that
    // differs only in its bass, the way the UI does at every bar line where
    // the changes move. Each swap is deferred to the bar line by the engine
    // and the replaced table is retired back to this thread, so this run is
    // the one that measures the handoff, not just the mixing.
    let swapper = if args.jam_swap {
        let handoff = engine.jam_handoff();
        let stop_swaps = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = stop_swaps.clone();
        // Both tables carry the same kit, so a swap is the bar-ahead bass
        // handshake and not a kit change — and the `Arc<KitBank>` inside
        // them is the SAME one, which is what the cache achieves in the app
        // and what makes a swap a refcount bump rather than a decode.
        let bank = match custom_kit.clone() {
            Some(b) => b,
            None => reference_bank(&busiest_jam().kit).expect("the probe's kit decodes"),
        };
        let table_a = Arc::new(
            compile_jam_with_voices(&busiest_jam(), bank.clone(), voices.clone())
                .expect("compiled above"),
        );
        let mut cfg_b = busiest_jam();
        if let Some(ref mut b) = cfg_b.bass {
            b.gain = 0.9;
        }
        let table_b = Arc::new(
            compile_jam_with_voices(&cfg_b, bank, voices.clone())
                .expect("the probe's swap table did not compile"),
        );
        let swaps = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let count = swaps.clone();
        let handle = std::thread::spawn(move || {
            let mut flip = false;
            while !flag.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(350));
                handoff.set(Some(if flip { table_a.clone() } else { table_b.clone() }));
                flip = !flip;
                count.fetch_add(1, Ordering::Relaxed);
            }
        });
        Some((handle, stop_swaps, swaps))
    } else {
        None
    };

    // `--jam-move`: the form itself moves while the stream runs. A loop over
    // the last three bars of the four-bar form, and a jump every two
    // seconds — two bars at 240 BPM — alternating between the first bar of
    // the loop and the fill, which is the bar where every lane plays every
    // tick. The bar line then runs the whole of the jump / loop / wrap rule
    // on the audio thread instead of a single add, and the jump is a
    // generation change the callback has to notice and consume.
    //
    // A jump command carries the loop with it: the contract's position is
    // both halves at once, so a command that named only the jump would be
    // asking for the loop to be taken away.
    const PROBE_LOOP: (u32, u32) = (1, 3);
    let mover = if args.jam_move {
        let handoff = engine.jam_handoff();
        handoff.set_position(JamPosition {
            jump: None,
            loop_bars: Some(PROBE_LOOP),
        });
        let stop_moves = Arc::new(AtomicBool::new(false));
        let flag = stop_moves.clone();
        let moves = Arc::new(AtomicU64::new(0));
        let count = moves.clone();
        let handle = std::thread::spawn(move || {
            let mut to_fill = true;
            while !flag.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_secs(2));
                handoff.set_position(JamPosition {
                    jump: Some(if to_fill { PROBE_LOOP.1 } else { PROBE_LOOP.0 }),
                    loop_bars: Some(PROBE_LOOP),
                });
                to_fill = !to_fill;
                count.fetch_add(1, Ordering::Relaxed);
            }
        });
        Some((handle, stop_moves, moves))
    } else {
        None
    };

    // ---- A HAND ON A FADER, AND A SEEK, WHILE THE SONG PLAYS ----
    //
    // The brief's own conditions for the W28 gate. They are two different
    // things and both had to be in the run:
    //
    // * **A fader** is a gain the renderer picks up on its next block and
    //   turns into a channel volume. It changes nothing on the callback and
    //   invalidates nothing, so what it tests is that a write racing the
    //   renderer's read costs the audio thread nothing at all.
    // * **A seek** bumps the ring's epoch. The callback then throws the whole
    //   queue away in constant time and mixes no synth until the renderer has
    //   begun again — which is the one path where the callback does something
    //   about the synthesiser beyond adding two numbers, and the one the
    //   dropout count has to stay at zero across.
    let song_hand = song_synth.as_ref().map(|(_, ring)| {
        let ring = Arc::clone(ring);
        // The transport's own seek, which is the whole of the path the
        // owner's click on the tab takes: `SongHandoff::seek` posts a sample,
        // the callback takes it with a swap, moves three cursors, cuts every
        // voice the sampled band has ringing and bumps the synthesiser's
        // ring. Driven from a thread here for the reason `--jam-move` is:
        // there is no command surface in a headless run.
        let handoff = engine.song_handoff();
        let seam = engine
            .song_handoff()
            .table()
            .map(|t| t.pass_samples())
            .unwrap_or(0);
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        let moves = Arc::new(AtomicU64::new(0));
        let count = moves.clone();
        let handle = std::thread::spawn(move || {
            let mut n = 0u64;
            while !flag.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(250));
                // The guitar's own fader, swept rather than stepped: a drag
                // is what a musician actually does to one.
                let gain = 0.2 + 0.8 * ((n % 8) as f32 / 8.0);
                ring.set_gain(3, gain);
                // And every three seconds, the cursor is dropped somewhere
                // else in the piece — forwards and backwards by turns, so a
                // seek that only ever went one way could not pass this.
                if n % 12 == 11 && seam > 0 {
                    let quarter = seam / 4;
                    handoff.seek(quarter * ((n / 12) % 4 + 1).min(3));
                }
                n += 1;
                count.fetch_add(1, Ordering::Relaxed);
            }
        });
        (handle, stop, moves)
    });

    // `--jam-take`: record a take for the whole run.
    //
    // This is the one place the audio callback does work on behalf of the
    // filesystem, so it is the one the gate has to cover: every buffer is
    // copied into a lock-free ring, and a writer thread drains it, resamples
    // a synthetic 44.1 kHz "mic" against the output rate, mixes the two and
    // writes 16-bit PCM to disk for the length of the measurement. The mic
    // is synthetic because the probe runs headless with no input stream;
    // what matters for the gate is that the writer is doing a take's real
    // work — the resampler, the mix and the disk — while the stream runs.
    let taker = if args.take {
        let handoff = engine.take_handoff();
        let out_sr = match engine.output_sample_rate() {
            Some(sr) => sr,
            None => {
                eprintln!("error: the output device never reported a rate, so --jam-take \
                           has nothing to record");
                return ExitCode::from(2);
            }
        };
        let dir = std::env::temp_dir().join(format!("yames-probe-takes-{}", std::process::id()));
        let mic = Arc::new(TakeRing::new(44_100 * 4));
        // W30 — a take made of everything this computer plays. A REAL capture
        // on a real endpoint, because the thing under test is what a second
        // device's callback and a busier writer thread do to the first
        // device's callback, and a synthetic ring would measure neither.
        let loopback = if args.loopback {
            match yames_lib::probe::open_loopback(None) {
                Ok(capture) => {
                    let f = capture.format().clone();
                    eprintln!(
                        "[probe] recording everything {} plays — {} Hz, {} channel(s)",
                        f.device, f.sample_rate, f.channels
                    );
                    Some(yames_lib::probe::TakeLoopback {
                        ring: capture.ring(),
                        sample_rate: f.sample_rate,
                        channels: f.channels,
                        device: f.device,
                        capture: Some(capture),
                    })
                }
                Err(e) => {
                    eprintln!("error: could not listen to this computer: {e}");
                    return ExitCode::from(2);
                }
            }
        } else {
            None
        };
        let loopback_mic = if args.loopback { None } else { Some((mic.clone(), 44_100)) };
        let mut session = TakeSession::default();
        if let Err(e) = session.start(TakeStart {
            app_data: &dir,
            jam_id: "probe",
            handoff: &handoff,
            loopback,
            mic: loopback_mic,
            out_sr,
            // The probe measures the writer, not the alignment: a synthetic
            // mic has no round trip to correct and there is no device change
            // to watch for in a headless run.
            round_trip_us: 0,
            out_sr_watch: Some(engine.output_sample_rate_handle()),
            owns_input: false,
            // The probe measures the callback and the writer, not the
            // review. The stamp is still written — that is the thing under
            // test — and nothing reads it back.
            position: None,
        }) {
            eprintln!("error: could not start the probe's take: {e}");
            return ExitCode::from(2);
        }
        eprintln!("[probe] recording a take into {}", dir.display());

        // The synthetic mic: 44.1 kHz of a quiet tone, pushed in
        // callback-sized chunks, so the writer's resampler and its mix both
        // run for real rather than short-circuiting on matching rates.
        let stop_mic = Arc::new(AtomicBool::new(false));
        let flag = stop_mic.clone();
        let mic_thread = std::thread::spawn(move || {
            let mut phase = 0.0f32;
            let step = std::f32::consts::TAU * 440.0 / 44_100.0;
            while !flag.load(Ordering::Relaxed) {
                let chunk: Vec<f32> = (0..441)
                    .map(|_| {
                        phase += step;
                        0.1 * phase.sin()
                    })
                    .collect();
                mic.push(&chunk);
                std::thread::sleep(Duration::from_millis(10));
            }
        });
        Some((session, handoff, stop_mic, mic_thread, dir))
    } else {
        None
    };

    std::thread::sleep(Duration::from_millis(args.warmup_ms));
    let window_start_ns = yames_lib::probe::now_ns();
    std::thread::sleep(Duration::from_secs(args.seconds));

    // The take stops BEFORE the engine, so the writer's last drain is of a
    // ring the callback is still alive to have filled.
    let take_summary = match taker {
        Some((mut session, handoff, stop_mic, mic_thread, dir)) => {
            stop_mic.store(true, Ordering::Relaxed);
            let _ = mic_thread.join();
            let recorded = session.stop(&handoff);
            let summary = match recorded {
                Ok(Some(t)) => {
                    let bytes = std::fs::metadata(&t.path).map(|m| m.len()).unwrap_or(0);
                    Some(format!("{:.1} s, {} bytes", t.duration_sec, bytes))
                }
                Ok(None) => Some("nothing was recorded".to_string()),
                Err(e) => Some(format!("failed: {e}")),
            };
            let _ = std::fs::remove_dir_all(&dir);
            summary
        }
        None => None,
    };

    engine.shutdown();
    stop.store(true, Ordering::Relaxed);
    let swaps_done = match swapper {
        Some((handle, stop_swaps, swaps)) => {
            stop_swaps.store(true, Ordering::Relaxed);
            let _ = handle.join();
            swaps.load(Ordering::Relaxed)
        }
        None => 0,
    };
    let moves_done = match mover {
        Some((handle, stop_moves, moves)) => {
            stop_moves.store(true, Ordering::Relaxed);
            let _ = handle.join();
            moves.load(Ordering::Relaxed)
        }
        None => 0,
    };
    let song_moves = match song_hand {
        Some((handle, stop, moves)) => {
            stop.store(true, Ordering::Relaxed);
            let _ = handle.join();
            moves.load(Ordering::Relaxed)
        }
        None => 0,
    };
    // The renderer, stopped and joined HERE — on the way out, on a thread
    // that may block — and not left to a destructor somewhere the stream is
    // still running.
    drop(song_synth);

    let samples = cb_probe.snapshot();
    let sample_rate = cb_probe.sample_rate();
    let overflow = cb_probe.overflow();
    // Read AFTER `shutdown`, which joins the audio thread, so nothing can
    // still be pushing while these are read.
    let dropped_notifications = engine.dropped_notifications();
    let cb_allocs = CB_ALLOCS.load(Ordering::Relaxed);
    let cb_alloc_bytes = CB_ALLOC_BYTES.load(Ordering::Relaxed);
    let cb_frees = CB_FREES.load(Ordering::Relaxed);

    // Joining can take one generation (up to a few seconds); do it after
    // the audio measurement is already captured.
    let llm_summary = llm.take().map(|mut run| {
        if let Some(h) = run.handle.take() {
            let _ = h.join();
        }
        (
            run.backend,
            run.load_secs,
            run.generations.load(Ordering::Relaxed),
            run.failures.load(Ordering::Relaxed),
        )
    });

    if sample_rate == 0 {
        eprintln!("error: the audio stream never started (no output device?)");
        return ExitCode::from(2);
    }

    if let Some(ref path) = args.dump_csv {
        // Raw capture, so a run can be re-analysed without re-running it
        // (and so a surprising percentile can be traced to real samples
        // rather than argued about).
        let mut out = String::with_capacity(samples.len() * 40);
        out.push_str("entry_ns,frames,sample_pos,ticks,in_window\n");
        for s in &samples {
            out.push_str(&format!(
                "{},{},{},{},{}\n",
                s.entry_ns,
                s.frames,
                s.sample_pos,
                s.ticks,
                u8::from(s.entry_ns >= window_start_ns)
            ));
        }
        match std::fs::write(path, out) {
            Ok(()) => eprintln!("[probe] wrote {} callbacks to {path}", samples.len()),
            Err(e) => eprintln!("[probe] could not write {path}: {e}"),
        }
    }

    let report = match analyse(
        &samples,
        sample_rate,
        overflow,
        window_start_ns,
        tick_interval_s,
    ) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("error: {e}");
            return ExitCode::from(2);
        }
    };

    // ---- Output ----
    let mut mode = match &llm_summary {
        None => "baseline (--no-llm)".to_string(),
        Some((backend, _, _, _)) => format!(
            "LLM backend={backend} YAMES_LLM_GPU_LAYERS={}",
            std::env::var("YAMES_LLM_GPU_LAYERS").unwrap_or_else(|_| "(unset)".into())
        ),
    };
    // A pasted report has to say whether the band was playing. Two runs
    // whose only difference is `--jam` were otherwise indistinguishable on
    // the page, which is exactly the pair anyone compares.
    // The level is on the line because a quiet run and a loud one are
    // otherwise indistinguishable on the page, and somebody reading a
    // pasted report deserves to know the band was turned down.
    mode.push_str(&format!(" @ volume {:.2}", args.volume));
    if args.jam {
        mode.push_str(" + --jam");
    }
    if args.jam_swap {
        mode.push_str(&format!("-swap ({swaps_done} table swaps while playing)"));
    }
    if args.jam_move {
        mode.push_str(&format!(
            " + --jam-move (bars {}-{} looped, {moves_done} jumps while playing)",
            PROBE_LOOP.0 + 1,
            PROBE_LOOP.1 + 1
        ));
    }
    if song_moves > 0 {
        mode.push_str(&format!(
            " + a fader moved {song_moves} times and a seek every three seconds"
        ));
    }
    if args.song {
        mode.push_str(if args.song_loop {
            " + --song-loop (bars 4-7, a 7/8 and a tempo step, looping)"
        } else {
            " + --song (twelve bars, a 7/8 and a tempo step)"
        });
    }
    if let Some(ref t) = take_summary {
        mode.push_str(&format!(
            " + --{}-take ({t})",
            if args.song { "song" } else { "jam" }
        ));
    }
    // Last, because `--jam-swap` is spelled by appending "-swap" to the
    // "--jam" above it and anything in between turns it into nonsense.
    if let Some(ref dir) = args.jam_voice {
        mode.push_str(&format!(" + --jam-voice ({dir})"));
    }
    if let Some(ref dir) = args.jam_kit {
        mode.push_str(&format!(" + --jam-kit ({dir})"));
    }

    println!("\n=== click-jitter-probe ===");
    println!("mode              {mode}");
    if let Some((_, load_secs, gens, fails)) = &llm_summary {
        println!("model load        {load_secs:.1} s");
        println!("generations       {gens} completed, {fails} failed");
    }
    println!(
        "stream            {} Hz, {} frames/callback ({:.2} ms)",
        report.sample_rate, report.median_frames, report.buffer_ms
    );
    println!(
        "window            {:.2} s wall / {:.2} s audio, {} callbacks ({} start-up excluded)",
        report.wall_s, report.audio_s, report.callbacks, report.excluded
    );
    if report.overflow > 0 {
        println!("arena overflow    {} callbacks DROPPED", report.overflow);
    }
    println!(
        "ticks             {} rendered, {:.1} expected",
        report.ticks_rendered, report.ticks_expected
    );
    if args.song {
        // The expected figure above is `window / (60 / bpm / subdivision)`,
        // and a song does not tick at `--bpm`: it ticks where its own map
        // says, through a meter change and a tempo step. Say so rather than
        // let somebody read a mismatch as a fault.
        println!(
            "                  (--song: the ticks come from the song's map, not from \
             --bpm {}, so 'expected' does not apply)",
            args.bpm
        );
    }
    println!("--- callback-to-callback jitter (|Δwall − buffer period|) ---");
    println!("p50               {:.4} ms", report.jitter_p50);
    println!("p95               {:.4} ms", report.jitter_p95);
    println!("p99               {:.4} ms", report.jitter_p99);
    println!("max               {:.4} ms", report.jitter_max);
    println!("max gap           {:.4} ms", report.max_gap_ms);
    println!("dropouts (>2×buf) {}", report.dropouts);
    println!("missed beats      {}", report.missed_beats);
    println!("--- inside the callback (this binary's global allocator) ---");
    println!("allocations       {cb_allocs} ({cb_alloc_bytes} bytes)");
    println!("frees             {cb_frees}");
    println!("dropped beats     {dropped_notifications} (beat queue full)");

    let jitter_ok = report.jitter_p99 < args.p99_ms;
    let beats_ok = report.missed_beats == 0;
    let arena_ok = report.overflow == 0;
    let alloc_ok = cb_allocs == 0 && cb_frees == 0;
    let queue_ok = dropped_notifications == 0;
    println!("--- gate (ROADMAP §4) ---");
    println!(
        "p99 < {:.2} ms      {}",
        args.p99_ms,
        if jitter_ok { "PASS" } else { "FAIL" }
    );
    println!(
        "missed beats = 0  {}",
        if beats_ok { "PASS" } else { "FAIL" }
    );
    println!(
        "callback heap = 0 {}",
        if alloc_ok { "PASS" } else { "FAIL" }
    );
    // Not folded into the line above: a dropped beat is a SCORING fault, not
    // a timing one. The click was heard; the analyzer was not told about it,
    // and the player is marked down for a beat they played.
    println!(
        "dropped beats = 0 {}",
        if queue_ok { "PASS" } else { "FAIL" }
    );
    if !arena_ok {
        println!("arena overflow    FAIL (statistics are truncated)");
    }

    if args.json {
        println!(
            "JSON {{\"mode\":\"{}\",\"sample_rate\":{},\"frames\":{},\"callbacks\":{},\
\"p50_ms\":{:.5},\"p95_ms\":{:.5},\"p99_ms\":{:.5},\"max_ms\":{:.5},\
\"max_gap_ms\":{:.5},\"dropouts\":{},\"missed_beats\":{},\
\"callback_allocs\":{},\"callback_alloc_bytes\":{},\"callback_frees\":{},\
\"dropped_notifications\":{},\"pass\":{}}}",
            mode,
            report.sample_rate,
            report.median_frames,
            report.callbacks,
            report.jitter_p50,
            report.jitter_p95,
            report.jitter_p99,
            report.jitter_max,
            report.max_gap_ms,
            report.dropouts,
            report.missed_beats,
            cb_allocs,
            cb_alloc_bytes,
            cb_frees,
            dropped_notifications,
            jitter_ok && beats_ok && arena_ok && alloc_ok && queue_ok
        );
    }

    if jitter_ok && beats_ok && arena_ok && alloc_ok && queue_ok {
        println!("\nRESULT PASS");
        ExitCode::SUCCESS
    } else {
        println!("\nRESULT FAIL");
        ExitCode::from(1)
    }
}
