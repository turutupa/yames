//! Takes — your playing with the band mixed in, kept on this machine.
//!
//! `plans/JAM_MODE.md` §4.4: "Record the take. Opt in, local only, your
//! playing with the band mixed in, listen back, keep the best. Listening back
//! is how improvisers improve."
//!
//! ## The privacy rule, and how this differs from `session_audio.rs`
//!
//! `session_audio.rs` is a diagnostic dump. It is `cfg(debug_assertions)` —
//! a shipped binary physically cannot record with it, there is no runtime
//! override, and that guard is not this module's to touch.
//!
//! A take is the other thing entirely: a FEATURE, present in release builds,
//! that a musician turns on per jam (`Jam.takes` in the contract) and can
//! see, play back and delete. So it is opt-in rather than compiled out, and
//! the rules that make that honest are:
//!
//! * Nothing records until `start_take` is called, and only the UI calls it,
//!   only for a jam whose `takes` flag the user set.
//! * The files are WAVs under the app's own data directory, named after the
//!   jam and the moment. Nothing is uploaded, nothing is analysed, nothing
//!   is deleted by anyone but the user.
//! * `list_takes` shows what is on disk and `delete_take` removes both the
//!   audio and its sidecar. A feature you cannot see the output of is not
//!   opt-in, it is surveillance with a switch.
//!
//! ## Where the audio comes from, and why it is two rings
//!
//! A take is two streams that never meet until the writer thread:
//!
//! * **You** — the mic the onset detector already listens to, captured on the
//!   INPUT thread (`audio_input.rs`), at the input device's rate.
//! * **The band** — the mix the output callback has already rendered, taken
//!   at the point it is written to the device, at the OUTPUT device's rate.
//!
//! Neither thread may allocate, lock or block, so each writes into a
//! preallocated lock-free ring ([`TakeRing`]) that a writer thread drains
//! every few tens of milliseconds, resamples, mixes and writes to disk in
//! chunks. The output callback's ring is handed over through the same
//! generation-counter handoff the jam table uses, and comes back through the
//! same retirement path, for the same reason: the last `Arc` must not be
//! dropped on the audio thread.
//!
//! ## The band is the clock
//!
//! Two devices, two crystals, no shared clock. Rather than pretend they can
//! be locked together, the writer takes the BAND as the clock: it writes
//! exactly as many samples as the output callback produced, and takes that
//! many resampled mic samples if it has them, silence if it does not. A take
//! is therefore always exactly as long as the band played, a mic that is not
//! running never stalls the file, and the two can drift by a device's clock
//! error over a long take — a few milliseconds over twenty minutes, which is
//! under a hundredth of a beat and nothing anyone can hear.

use std::collections::VecDeque;
use std::fs;
use std::io::{BufWriter, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/// The longest a take may run. `plans/tasks/jam/W14-ENGINE-KEYS-TAKES.md`:
/// twenty minutes, which at 48 kHz 16-bit mono is 115 MB — about as much of
/// a practice session as anyone listens back to, and a bound on what the
/// feature can quietly do to a disk while nobody is watching. The writer
/// stops taking audio there and the take finalises at its cap.
pub const TAKE_MAX_SECS: u64 = 20 * 60;

/// How much audio each ring holds. The writer wakes every
/// [`WRITER_TICK_MS`], so four seconds is two orders of magnitude of slack —
/// enough that a disk stall, a scheduler hiccup or a debugger breakpoint
/// costs nothing, and small enough that the pair is under two megabytes.
const RING_SECS: usize = 4;

/// How often the writer drains the rings. Short enough that the rings never
/// come close to full, long enough that the thread is asleep essentially all
/// the time.
const WRITER_TICK_MS: u64 = 25;

/// How far ahead of the band the mic is allowed to get before the writer
/// starts throwing the oldest of it away.
///
/// The two devices free-run, so one of them is always slightly faster. If it
/// is the input, its queue grows forever; a quarter of a second is far more
/// than any real clock error produces in twenty minutes and still short
/// enough that dropping it cannot be heard as a jump.
const MIC_BACKLOG_SECS: f64 = 0.25;

// ---------------------------------------------------------------------------
// The ring
// ---------------------------------------------------------------------------

/// A single-producer single-consumer ring of samples, allocated once.
///
/// The producer is an audio callback, so it may not allocate, may not block
/// and may not fail loudly: a push into a full ring drops the sample and
/// counts it, which is the only outcome available to a thread that cannot
/// wait. `dropped()` is the honest report of that, and the writer logs it.
///
/// Every slot is an `AtomicU32` holding the sample's bits rather than an
/// `UnsafeCell<f32>`, so the whole thing is safe Rust with no `unsafe` on
/// the audio thread. On every architecture anyone runs this on a relaxed
/// 32-bit store compiles to the same instruction a plain store would; the
/// ordering that actually matters is the release on the write index and the
/// acquire on it in the consumer, and there is one of each per BUFFER, not
/// one per sample.
pub struct TakeRing {
    buf: Vec<AtomicU32>,
    /// `buf.len() - 1`. The capacity is a power of two so the wrap is a mask.
    mask: usize,
    /// Monotonic counts, not indices. `u64` at 192 kHz overflows in three
    /// million years, so the wrap arithmetic below is a formality.
    write: AtomicU64,
    read: AtomicU64,
    dropped: AtomicUsize,
}

impl TakeRing {
    /// A ring holding at least `samples` samples, rounded up to a power of
    /// two. Allocates — call it on the command thread, never on an audio one.
    pub fn new(samples: usize) -> Self {
        let cap = samples.max(2).next_power_of_two();
        let mut buf = Vec::with_capacity(cap);
        buf.resize_with(cap, || AtomicU32::new(0));
        Self {
            mask: cap - 1,
            buf,
            write: AtomicU64::new(0),
            read: AtomicU64::new(0),
            dropped: AtomicUsize::new(0),
        }
    }

    /// How many samples the ring holds.
    pub fn capacity(&self) -> usize {
        self.buf.len()
    }

    /// How many samples the producer had to throw away because the consumer
    /// was not keeping up. Zero on any machine that is not on fire.
    pub fn dropped(&self) -> usize {
        self.dropped.load(Ordering::Relaxed)
    }

    /// PRODUCER (an audio callback): write every `stride`-th sample of an
    /// interleaved buffer.
    ///
    /// One acquire load and one release store for the whole buffer, whatever
    /// its length; the samples themselves are relaxed. Nothing here
    /// allocates, locks or branches on anything but the ring's own fill.
    pub fn push_strided(&self, data: &[f32], stride: usize) {
        let stride = stride.max(1);
        let cap = self.buf.len() as u64;
        let mut w = self.write.load(Ordering::Relaxed);
        let r = self.read.load(Ordering::Acquire);
        let mut free = cap.saturating_sub(w.wrapping_sub(r));
        let mut lost = 0usize;
        for s in data.iter().step_by(stride) {
            if free == 0 {
                lost += 1;
                continue;
            }
            self.buf[(w as usize) & self.mask].store(s.to_bits(), Ordering::Relaxed);
            w = w.wrapping_add(1);
            free -= 1;
        }
        self.write.store(w, Ordering::Release);
        if lost > 0 {
            self.dropped.fetch_add(lost, Ordering::Relaxed);
        }
    }

    /// PRODUCER: write a run of mono samples.
    pub fn push(&self, samples: &[f32]) {
        self.push_strided(samples, 1);
    }

    /// CONSUMER (the writer thread): append everything waiting to `out` and
    /// return how much that was.
    pub fn drain_into(&self, out: &mut Vec<f32>) -> usize {
        let r = self.read.load(Ordering::Relaxed);
        let w = self.write.load(Ordering::Acquire);
        let n = w.wrapping_sub(r) as usize;
        out.reserve(n);
        for i in 0..n {
            let slot = ((r.wrapping_add(i as u64)) as usize) & self.mask;
            out.push(f32::from_bits(self.buf[slot].load(Ordering::Relaxed)));
        }
        self.read.store(w, Ordering::Release);
        n
    }

    /// Throw away everything in the ring and forget the drop count.
    ///
    /// Only safe while the producer is stopped — which is exactly when it is
    /// called: `start_take` resets a ring before the flag that lets the
    /// input callback write to it goes up.
    pub fn reset(&self) {
        let w = self.write.load(Ordering::Acquire);
        self.read.store(w, Ordering::Release);
        self.dropped.store(0, Ordering::Relaxed);
    }
}

// ---------------------------------------------------------------------------
// The handoff to the output callback
// ---------------------------------------------------------------------------

/// A take buffer decoded and ready to stream, with the rate it was recorded
/// at. The callback resamples on the fly, because the device it is playing
/// out of today need not be the one the take was recorded through.
#[derive(Clone)]
pub struct TakePlayback {
    pub pcm: Arc<Vec<f32>>,
    pub sample_rate: u32,
}

impl TakePlayback {
    /// How far through the source the callback moves per output frame.
    ///
    /// A take is recorded at whatever the output device was running at THEN
    /// and played back through whatever is running NOW, and those need not
    /// be the same — plug in an interface between recording and listening
    /// and they will not be. One divide when the take starts, one multiply
    /// -add per frame after that.
    #[inline]
    pub(crate) fn step(&self, out_sr: u32) -> f64 {
        self.sample_rate as f64 / out_sr.max(1) as f64
    }

    /// The sample at `pos` (in SOURCE samples), or `None` once the take has
    /// run out — which is what raises `take-playback-ended`.
    ///
    /// Pure, and on the audio thread, so it is the same kind of thing
    /// `jam_play` and `accent_for` in `engine.rs` are: the rule lives here
    /// where it can be tested without a sound card, and the callback calls
    /// it.
    #[inline]
    pub(crate) fn sample_at(&self, pos: f64) -> Option<f32> {
        if pos < 0.0 {
            return Some(0.0);
        }
        let i = pos as usize;
        let pcm = &self.pcm[..];
        match (pcm.get(i), pcm.get(i + 1)) {
            (Some(&a), Some(&b)) => {
                let f = (pos - i as f64) as f32;
                Some(a + (b - a) * f)
            }
            // The last sample has nothing to interpolate towards.
            (Some(&a), None) => Some(a),
            _ => None,
        }
    }
}

/// Something the audio thread has finished with, on its way to a thread that
/// is allowed to free memory.
///
/// Nothing ever READS these fields, and that is the whole design: the value
/// of this enum is that it owns an `Arc` until a thread which may call
/// `free()` drops it. `dead_code` would have it replaced with a unit type,
/// which is the one change that would break it.
#[allow(dead_code)]
enum Retired {
    Ring(Arc<TakeRing>),
    Pcm(Arc<Vec<f32>>),
}

/// How many retired items the command thread may be behind on. A take is
/// started and stopped by hand, so the traffic here is a handful of items a
/// session, not the jam table's several a chorus.
const TAKE_RETIRED_CAP: usize = 8;

/// Where the take's ring and the take being played back wait for the audio
/// thread.
///
/// The same shape [`crate::engine::JamHandoff`] uses, and for the same
/// reasons: the callback may not block to read this and may not allocate, so
/// each half carries a generation counter it compares with one relaxed load
/// per buffer, and only a real change pays for a `try_lock` and an `Arc`
/// clone. Whatever the clone replaces is handed BACK rather than dropped
/// here — dropping the last `Arc<Vec<f32>>` of a twenty-minute take would
/// free a hundred megabytes on the audio thread.
pub struct TakeHandoff {
    record: Mutex<Option<Arc<TakeRing>>>,
    record_generation: AtomicU64,
    play: Mutex<Option<TakePlayback>>,
    play_generation: AtomicU64,
    /// Raised by the audio thread when a playback runs off its own end.
    /// Lowered by the event thread, which is what emits
    /// `take-playback-ended`; an atomic rather than a channel message
    /// because the callback must not allocate and the event loop is already
    /// awake every 50 ms.
    ended: AtomicBool,
    retired: Mutex<Vec<Retired>>,
}

/// Shared handle to the take slot. Cloned into the audio thread and into the
/// commands that fill it.
pub type SharedTake = Arc<TakeHandoff>;

impl Default for TakeHandoff {
    fn default() -> Self {
        Self::new()
    }
}

impl TakeHandoff {
    pub fn new() -> Self {
        Self {
            record: Mutex::new(None),
            record_generation: AtomicU64::new(0),
            play: Mutex::new(None),
            play_generation: AtomicU64::new(0),
            ended: AtomicBool::new(false),
            retired: Mutex::new(Vec::with_capacity(TAKE_RETIRED_CAP)),
        }
    }

    /// Hand the callback somewhere to copy the band into, or `None` to stop
    /// it copying. Command thread only.
    pub fn set_record(&self, ring: Option<Arc<TakeRing>>) {
        self.drain_retired();
        if let Ok(mut slot) = self.record.lock() {
            *slot = ring;
            // Bumped AFTER the write, so a callback that sees the new
            // generation is guaranteed to find the new value behind the lock.
            drop(slot);
            self.record_generation.fetch_add(1, Ordering::Release);
        }
    }

    /// Hand the callback a take to play, or `None` to stop it. Command
    /// thread only. Clears any stale "it ended" flag, so a playback started
    /// twice does not report the first one's ending against the second.
    pub fn set_play(&self, play: Option<TakePlayback>) {
        self.drain_retired();
        self.ended.store(false, Ordering::Release);
        if let Ok(mut slot) = self.play.lock() {
            *slot = play;
            drop(slot);
            self.play_generation.fetch_add(1, Ordering::Release);
        }
    }

    /// Is a take playing? The commands need it to refuse to start recording
    /// over the top of one.
    pub fn is_playing_back(&self) -> bool {
        self.play
            .lock()
            .map(|p| p.is_some())
            .unwrap_or_else(|e| e.into_inner().is_some())
    }

    /// Event thread: has a playback ended since the last time anyone asked?
    /// Consumes the flag, so the event is emitted exactly once.
    pub fn take_ended(&self) -> bool {
        self.ended.swap(false, Ordering::AcqRel)
    }

    /// Audio thread: say a playback ran off its end.
    pub(crate) fn note_ended(&self) {
        self.ended.store(true, Ordering::Release);
    }

    /// Drop everything the audio thread handed back. Command thread only.
    pub fn drain_retired(&self) {
        if let Ok(mut r) = self.retired.lock() {
            r.clear();
        }
    }

    /// Audio thread: read the recording ring if its generation moved.
    /// Returns `Some(new value)` when it did, `None` when nothing changed or
    /// the lock was busy — in which case the caller leaves its cached
    /// generation alone and the next buffer tries again.
    pub(crate) fn poll_record(&self, seen: &mut u64) -> Option<Option<Arc<TakeRing>>> {
        let gen = self.record_generation.load(Ordering::Acquire);
        if gen == *seen {
            return None;
        }
        let slot = self.record.try_lock().ok()?;
        let incoming = slot.clone();
        drop(slot);
        *seen = gen;
        Some(incoming)
    }

    /// Audio thread: the same for the take being played back.
    pub(crate) fn poll_play(&self, seen: &mut u64) -> Option<Option<TakePlayback>> {
        let gen = self.play_generation.load(Ordering::Acquire);
        if gen == *seen {
            return None;
        }
        let slot = self.play.try_lock().ok()?;
        let incoming = slot.clone();
        drop(slot);
        *seen = gen;
        Some(incoming)
    }

    fn try_retire(&self, item: Retired) -> Result<(), Retired> {
        match self.retired.try_lock() {
            Ok(mut r) if r.len() < r.capacity() => {
                r.push(item);
                Ok(())
            }
            _ => Err(item),
        }
    }
}

/// The audio thread's parking spaces for take buffers it replaced while the
/// retirement slot was busy, flushed once per buffer.
///
/// [`crate::engine::JamRetirement`] for the jam table, applied to this. If
/// even these fill — which needs the user to press play and stop on takes
/// faster than the command thread can take a lock — the buffer is leaked
/// rather than freed here. A few megabytes lost is a price; a `free()` under
/// the mixer is the thing the engine is built to avoid.
pub(crate) struct TakeParking {
    parked: [Option<Retired>; 4],
}

impl TakeParking {
    pub(crate) fn new() -> Self {
        Self {
            parked: [None, None, None, None],
        }
    }

    pub(crate) fn retire_ring(&mut self, handoff: &TakeHandoff, ring: Arc<TakeRing>) {
        self.park(handoff, Retired::Ring(ring));
    }

    pub(crate) fn retire_pcm(&mut self, handoff: &TakeHandoff, pcm: Arc<Vec<f32>>) {
        self.park(handoff, Retired::Pcm(pcm));
    }

    fn park(&mut self, handoff: &TakeHandoff, item: Retired) {
        if let Err(item) = handoff.try_retire(item) {
            match self.parked.iter_mut().find(|s| s.is_none()) {
                Some(slot) => *slot = Some(item),
                None => std::mem::forget(item),
            }
        }
    }

    pub(crate) fn flush(&mut self, handoff: &TakeHandoff) {
        for slot in self.parked.iter_mut() {
            if let Some(item) = slot.take() {
                if let Err(back) = handoff.try_retire(item) {
                    *slot = Some(back);
                    return;
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/// A recorded take. The mirror of `JamTake` in `src/jam/types.ts`, and the
/// content of the sidecar JSON that sits beside every WAV.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JamTake {
    pub id: String,
    pub jam_id: String,
    /// Milliseconds since the epoch, the way every other timestamp the
    /// frontend holds is written.
    pub created_at: u64,
    pub duration_sec: f64,
    /// Absolute path of the WAV.
    pub path: String,
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/// The directory every take lives under, inside the app's own data
/// directory. One subdirectory per jam.
pub const TAKES_DIR: &str = "takes";

/// The character rule: what survives of an id on its way to being a name.
///
/// Ids arrive over IPC and a directory name built from unvalidated input is
/// how a feature that writes files becomes a feature that writes ANY file.
/// Only letters, digits, dash, underscore and dot survive; everything else
/// becomes an underscore, `.` and `..` are refused outright, and the result
/// cannot contain a separator, so the path can only ever land inside
/// `takes/`.
fn sanitised(jam_id: &str) -> Result<String, String> {
    let trimmed = jam_id.trim();
    if trimmed.is_empty() {
        return Err("a take needs a jam to belong to".into());
    }
    if trimmed == "." || trimmed == ".." {
        return Err(format!("{trimmed:?} is not a jam id"));
    }
    let safe: String = trimmed
        .chars()
        .take(120)
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect();
    // A name of nothing but dots would still resolve to a directory that is
    // not the one we meant.
    if safe.chars().all(|c| c == '.') {
        return Err(format!("{jam_id:?} is not a jam id"));
    }
    Ok(safe)
}

/// A 64-bit FNV-1a of the RAW id, in hex.
///
/// Not a security hash and not trying to be: the job is to tell two ids
/// apart that the character rule maps onto the same string, and sixteen hex
/// digits of FNV over ids a person typed is far past the point where an
/// accident is thinkable. Written out rather than pulled in because the
/// alternative is a dependency to hash a jam name.
fn id_fingerprint(jam_id: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in jam_id.trim().as_bytes() {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x1000_0000_01b3);
    }
    format!("{hash:016x}")
}

/// A jam id as a directory name.
///
/// The character rule above, plus a fingerprint of the RAW id — because the
/// character rule is not one-to-one. `my jam` and `my/jam` and `my.jam`
/// (and, on the ids the screen actually generates, any pair that differs
/// only where a colon or a space sits) all sanitise to the same string, and
/// two jams sharing a directory means one jam's list showing the other's
/// takes and `delete_take` reaching into a jam nobody named. The
/// fingerprint is of the id as it arrived, so ids that differ at all get
/// different directories, and the readable half is kept in front of it so a
/// musician looking in the folder can still tell what they are looking at.
///
/// The path is still built only from characters the rule allowed, so
/// traversal is blocked exactly as before.
pub fn safe_dir_name(jam_id: &str) -> Result<String, String> {
    let safe = sanitised(jam_id)?;
    Ok(format!("{safe}-{}", id_fingerprint(jam_id)))
}

/// A take id as a file stem. The character rule, and then the id has to be
/// the id it claims to be: the ids this module generates are digits, so
/// anything that had to be sanitised to become a name came from somewhere it
/// should not have, and resolving it to the nearest legal name would be
/// guessing. No fingerprint — a stem that is not the id would make
/// `find_take` unable to find a take by the id the UI holds.
fn safe_stem(id: &str) -> Result<String, String> {
    let s = sanitised(id)?;
    if s != id.trim() {
        return Err(format!("{id:?} is not a take id"));
    }
    Ok(s)
}

fn takes_root(app_data: &Path) -> PathBuf {
    app_data.join(TAKES_DIR)
}

/// Every byte under `takes/`, so the UI can say when the feature has quietly
/// eaten a disk. Missing directory is zero, not an error.
pub fn takes_dir_size(app_data: &Path) -> u64 {
    fn walk(dir: &Path) -> u64 {
        let mut total = 0u64;
        let Ok(entries) = fs::read_dir(dir) else {
            return 0;
        };
        for entry in entries.flatten() {
            match entry.file_type() {
                Ok(t) if t.is_dir() => total += walk(&entry.path()),
                Ok(t) if t.is_file() => total += entry.metadata().map(|m| m.len()).unwrap_or(0),
                _ => {}
            }
        }
        total
    }
    walk(&takes_root(app_data))
}

/// Find a take by id: `takes/<any jam>/<id>.wav`.
///
/// A scan rather than an id that encodes its own directory, because a jam id
/// is the user's and may contain anything at all — an id built by gluing two
/// of them together is an id that can be ambiguous, and a resolution that
/// cannot be ambiguous is worth a directory listing of a folder with a
/// handful of entries in it.
fn find_take(app_data: &Path, id: &str) -> Result<PathBuf, String> {
    let stem = safe_stem(id)?;
    let root = takes_root(app_data);
    let entries = fs::read_dir(&root).map_err(|e| format!("no takes yet ({e})"))?;
    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let wav = entry.path().join(format!("{stem}.wav"));
        if wav.is_file() {
            return Ok(wav);
        }
    }
    Err(format!("there is no take {id} on this machine"))
}

/// Read the takes of one jam, newest first.
///
/// The sidecar JSON is the record; a WAV whose sidecar went missing (a crash
/// between the two writes) is still listed, with what can be read off the
/// file itself. Losing a take because its label was lost would be the worse
/// failure of the two.
pub fn list_takes(app_data: &Path, jam_id: &str) -> Result<Vec<JamTake>, String> {
    let dir = takes_root(app_data).join(safe_dir_name(jam_id)?);
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut out: Vec<JamTake> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("wav") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let sidecar = path.with_extension("json");
        let record = fs::read_to_string(&sidecar)
            .ok()
            .and_then(|text| serde_json::from_str::<JamTake>(&text).ok());
        out.push(match record {
            Some(mut r) => {
                // The path is rewritten from where the file actually is: an
                // app data directory can move between installs, and a record
                // pointing at the old one would play nothing.
                r.path = path.to_string_lossy().into_owned();
                r
            }
            None => JamTake {
                id: stem.to_string(),
                jam_id: jam_id.to_string(),
                created_at: created_at_of(&path, stem),
                duration_sec: duration_of(&path),
                path: path.to_string_lossy().into_owned(),
            },
        });
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

/// When a take with no sidecar was made: its own id is a millisecond
/// timestamp, and the file's mtime is the fallback for one that is not.
fn created_at_of(path: &Path, stem: &str) -> u64 {
    if let Ok(ms) = stem.parse::<u64>() {
        return ms;
    }
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// How long a take is, from the size of the file. 16-bit mono, so the header
/// tells the rate and the rest is two bytes a sample.
///
/// The size comes from the directory entry and the rate from the first 44
/// bytes: nothing else in the file is read. This is called once per take by
/// `list_takes`, for every take that lost its sidecar, while a screen is
/// waiting — and reading the whole file to divide its length by two would
/// mean pulling a hundred megabytes off the disk per row to learn a number
/// the header already carries.
fn duration_of(path: &Path) -> f64 {
    use std::io::Read;
    let Ok(len) = fs::metadata(path).map(|m| m.len()) else {
        return 0.0;
    };
    if len < 44 {
        return 0.0;
    }
    let mut header = [0u8; 44];
    let Ok(mut file) = fs::File::open(path) else {
        return 0.0;
    };
    if file.read_exact(&mut header).is_err() {
        return 0.0;
    }
    duration_from(len, &header)
}

/// The length of a take from its size on disk and its 44-byte header, and
/// from nothing else.
///
/// Split out so the rule can be checked without a file, and so that what is
/// NOT an input is visible: the body never appears here, which is the whole
/// point — a take is two bytes a sample at the rate the header states, and
/// reading a hundred megabytes to count them tells you nothing the size
/// did not.
fn duration_from(len: u64, header: &[u8; 44]) -> f64 {
    let sr = u32::from_le_bytes([header[24], header[25], header[26], header[27]]);
    if sr == 0 || len < 44 {
        return 0.0;
    }
    (len - 44) as f64 / 2.0 / sr as f64
}

/// Remove a take: the audio and its sidecar together. A sidecar with no
/// audio is a label for nothing.
pub fn delete_take(app_data: &Path, id: &str) -> Result<(), String> {
    let wav = find_take(app_data, id)?;
    let json = wav.with_extension("json");
    fs::remove_file(&wav).map_err(|e| format!("could not delete the take: {e}"))?;
    // The sidecar going missing first is not a failure — the take is gone,
    // which is what was asked for.
    let _ = fs::remove_file(&json);
    Ok(())
}

/// Decode a take into memory, ready to hand to the audio thread.
pub fn load_take(app_data: &Path, id: &str) -> Result<TakePlayback, String> {
    let path = find_take(app_data, id)?;
    let bytes = fs::read(&path).map_err(|e| format!("could not read the take: {e}"))?;
    let (pcm, sample_rate) = decode_wav_bytes(&bytes)?;
    if pcm.is_empty() {
        return Err("that take has no audio in it".into());
    }
    Ok(TakePlayback {
        pcm: Arc::new(pcm),
        sample_rate,
    })
}

/// Decode a mono 16-bit PCM WAV — the only kind this module writes.
///
/// Deliberately not `rodio`: these are our own files, the format is fixed,
/// and a reader that knows exactly what it is reading cannot be surprised by
/// a WAV extension nobody meant to support. A file that is not one of ours
/// is refused with a message rather than decoded on a guess.
fn decode_wav_bytes(bytes: &[u8]) -> Result<(Vec<f32>, u32), String> {
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("that file is not a WAV".into());
    }
    let channels = u16::from_le_bytes([bytes[22], bytes[23]]);
    let sample_rate = u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]);
    let bits = u16::from_le_bytes([bytes[34], bytes[35]]);
    if channels != 1 || bits != 16 || sample_rate == 0 {
        return Err(format!(
            "that take is {channels} channel(s) of {bits}-bit at {sample_rate} Hz, and \
             takes are mono 16-bit"
        ));
    }
    let data = &bytes[44..];
    let mut pcm = Vec::with_capacity(data.len() / 2);
    for frame in data.chunks_exact(2) {
        pcm.push(i16::from_le_bytes([frame[0], frame[1]]) as f32 / 32767.0);
    }
    Ok((pcm, sample_rate))
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/// A WAV being written a chunk at a time.
///
/// The same 44-byte mono 16-bit PCM header `session_audio.rs` writes, built
/// by the same function, patched on `finish` once the sample count is known.
/// A separate writer rather than a shared one because the two have opposite
/// lifetimes: that one is a debug artefact compiled out of release builds,
/// this one is a file the user asked for and will look for later.
struct TakeWavWriter {
    path: PathBuf,
    writer: BufWriter<fs::File>,
    samples: u64,
    sample_rate: u32,
}

impl TakeWavWriter {
    fn create(path: &Path, sample_rate: u32) -> std::io::Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut file = fs::File::create(path)?;
        file.write_all(&[0u8; 44])?;
        Ok(Self {
            path: path.to_path_buf(),
            writer: BufWriter::with_capacity(64 * 1024, file),
            samples: 0,
            sample_rate,
        })
    }

    fn push(&mut self, samples: &[f32]) -> std::io::Result<()> {
        const CHUNK: usize = 1024;
        let mut buf = [0u8; CHUNK * 2];
        let mut i = 0;
        while i < samples.len() {
            let end = (i + CHUNK).min(samples.len());
            for (j, s) in samples[i..end].iter().enumerate() {
                let v = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
                let b = v.to_le_bytes();
                buf[j * 2] = b[0];
                buf[j * 2 + 1] = b[1];
            }
            self.writer.write_all(&buf[..(end - i) * 2])?;
            i = end;
        }
        self.samples += samples.len() as u64;
        Ok(())
    }

    fn finish(mut self) -> std::io::Result<(PathBuf, u64)> {
        self.writer.flush()?;
        let mut file = self
            .writer
            .into_inner()
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
        let header = crate::session_audio::wav_header_mono_16bit(self.sample_rate, self.samples);
        file.seek(SeekFrom::Start(0))?;
        file.write_all(&header)?;
        file.sync_all()?;
        Ok((self.path, self.samples))
    }
}

/// A streaming linear resampler.
///
/// Linear and not the engine's windowed sinc on purpose. This runs on a mic
/// signal that is about to be summed under a band and thrown at a listener's
/// ears for a self-assessment, not analysed: the interpolation error on
/// anything a guitar produces is around -78 dB (see
/// `the_take_writer_resamples_within_a_hair` in the tests), which is two
/// orders of magnitude under the noise floor of any room this is recorded
/// in. A sinc kernel would cost thirty-two multiplies a sample to improve a
/// number nobody can hear.
///
/// Streaming, so a take is not one long allocation: the phase and the tail
/// sample survive between chunks, which is the whole difference between this
/// and calling a resampler per chunk (which would put a click at every
/// chunk boundary).
struct LinearResampler {
    /// Input samples per output sample.
    step: f64,
    /// Where in `pending` the next output sample is read from.
    pos: f64,
    pending: Vec<f32>,
}

impl LinearResampler {
    fn new(in_sr: u32, out_sr: u32) -> Self {
        Self {
            step: in_sr.max(1) as f64 / out_sr.max(1) as f64,
            pos: 0.0,
            pending: Vec::new(),
        }
    }

    /// True when the rates match, in which case this is an exact copy and
    /// not an interpolation at all. Asserted by
    /// `matching_rates_are_a_copy_and_not_an_interpolation`, which is the
    /// only caller: the writer does not need to know, it just runs.
    #[cfg(test)]
    fn is_identity(&self) -> bool {
        (self.step - 1.0).abs() < 1e-12
    }

    fn push(&mut self, input: &[f32], out: &mut VecDeque<f32>) {
        if input.is_empty() && self.pending.is_empty() {
            return;
        }
        self.pending.extend_from_slice(input);
        // `pos + 1` because the interpolation reads the sample after the one
        // it lands on; the last input sample is kept for the next chunk.
        while self.pos + 1.0 < self.pending.len() as f64 {
            let i = self.pos as usize;
            let f = (self.pos - i as f64) as f32;
            let a = self.pending[i];
            let b = self.pending[i + 1];
            out.push_back(a + (b - a) * f);
            self.pos += self.step;
        }
        let consumed = self.pos as usize;
        if consumed > 0 {
            self.pending.drain(..consumed);
            self.pos -= consumed as f64;
        }
    }
}

/// Mix one chunk of band and mic into the samples the take gets.
///
/// The band is the clock: exactly `band.len()` samples come out, taking mic
/// samples while there are any and silence after. Unity on both, clamped
/// once at the end — the band has already been through the mixer's own
/// clamp, and a mic hot enough to push the sum over is a mic the user set
/// too high, which they will hear rather than have silently limited.
fn mix_chunk(band: &[f32], mic: &mut VecDeque<f32>, out: &mut Vec<f32>) {
    out.clear();
    out.reserve(band.len());
    for &b in band {
        let m = mic.pop_front().unwrap_or(0.0);
        out.push((b + m).clamp(-1.0, 1.0));
    }
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

/// A take in flight: the two rings, the thread draining them, and the way to
/// stop it.
struct ActiveTake {
    jam_id: String,
    id: String,
    path: PathBuf,
    created_at: u64,
    band_ring: Arc<TakeRing>,
    stop: Arc<AtomicBool>,
    /// Samples the writer has committed, so `stop_take` can report a
    /// duration without reading the file back.
    written: Arc<AtomicU64>,
    out_sr: u32,
    writer: Option<std::thread::JoinHandle<()>>,
}

/// Everything the take commands own. One per app, behind a mutex, on the
/// command thread only.
#[derive(Default)]
pub struct TakeSession {
    active: Option<ActiveTake>,
}

impl TakeSession {
    pub fn is_recording(&self) -> bool {
        self.active.is_some()
    }

    /// The jam a take is being recorded for, if one is.
    pub fn recording_jam(&self) -> Option<&str> {
        self.active.as_ref().map(|a| a.jam_id.as_str())
    }

    /// Begin a take.
    ///
    /// `mic` is the input thread's ring and the rate it is filling at, or
    /// `None` when there is no input running — a take with no mic in it is
    /// still a take of the band, so this is a fact recorded rather than a
    /// reason to refuse.
    #[allow(clippy::too_many_arguments)]
    pub fn start(
        &mut self,
        app_data: &Path,
        jam_id: &str,
        handoff: &SharedTake,
        mic: Option<(Arc<TakeRing>, u32)>,
        out_sr: u32,
    ) -> Result<(), String> {
        if let Some(running) = self.recording_jam() {
            return Err(if running == jam_id {
                "a take is already recording".to_string()
            } else {
                format!("a take is already recording for another jam ({running})")
            });
        }
        if handoff.is_playing_back() {
            return Err("stop the take that is playing before recording another".into());
        }
        if out_sr == 0 {
            return Err("the audio output is not running, so there is no band to record".into());
        }
        let dir_name = safe_dir_name(jam_id)?;
        let created_at = now_ms();
        let id = created_at.to_string();
        let dir = takes_root(app_data).join(&dir_name);
        let path = dir.join(format!("{id}.wav"));
        if path.exists() {
            return Err("a take with this timestamp already exists".into());
        }

        let band_ring = Arc::new(TakeRing::new(out_sr as usize * RING_SECS));
        let stop = Arc::new(AtomicBool::new(false));
        let written = Arc::new(AtomicU64::new(0));

        let mut wav = TakeWavWriter::create(&path, out_sr)
            .map_err(|e| format!("could not open the take for writing: {e}"))?;

        let band_for_writer = band_ring.clone();
        let stop_for_writer = stop.clone();
        let written_for_writer = written.clone();
        let mic_for_writer = mic.clone();
        let path_for_writer = path.clone();
        let writer = std::thread::Builder::new()
            .name("yames-take-writer".into())
            .spawn(move || {
                let mut band_buf: Vec<f32> = Vec::with_capacity(out_sr as usize);
                let mut mic_raw: Vec<f32> = Vec::with_capacity(out_sr as usize);
                let mut mic_ready: VecDeque<f32> = VecDeque::with_capacity(out_sr as usize);
                let mut mixed: Vec<f32> = Vec::with_capacity(out_sr as usize);
                let mut resampler = mic_for_writer
                    .as_ref()
                    .map(|(_, in_sr)| LinearResampler::new(*in_sr, out_sr));
                let backlog = (out_sr as f64 * MIC_BACKLOG_SECS) as usize;
                let cap_samples = TAKE_MAX_SECS * out_sr as u64;
                let mut capped = false;

                loop {
                    let stopping = stop_for_writer.load(Ordering::Acquire);
                    band_buf.clear();
                    band_for_writer.drain_into(&mut band_buf);
                    if let (Some((ring, _)), Some(rs)) = (mic_for_writer.as_ref(), &mut resampler) {
                        mic_raw.clear();
                        ring.drain_into(&mut mic_raw);
                        rs.push(&mic_raw, &mut mic_ready);
                        // The mic's own clock is not the band's. If it runs
                        // ahead, throw the oldest away rather than let the
                        // queue grow for twenty minutes.
                        while mic_ready.len() > backlog {
                            mic_ready.pop_front();
                        }
                    }

                    if !band_buf.is_empty() {
                        let already = written_for_writer.load(Ordering::Relaxed);
                        let room = cap_samples.saturating_sub(already) as usize;
                        if room == 0 {
                            if !capped {
                                capped = true;
                                eprintln!(
                                    "[take] {} reached the {TAKE_MAX_SECS}s cap and stopped \
                                     growing",
                                    path_for_writer.display()
                                );
                            }
                        } else {
                            let n = room.min(band_buf.len());
                            mix_chunk(&band_buf[..n], &mut mic_ready, &mut mixed);
                            if let Err(e) = wav.push(&mixed) {
                                eprintln!("[take] writing stopped: {e}");
                                break;
                            }
                            written_for_writer
                                .fetch_add(mixed.len() as u64, Ordering::Release);
                        }
                    }

                    if stopping && band_buf.is_empty() {
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(WRITER_TICK_MS));
                }

                let dropped = band_for_writer.dropped()
                    + mic_for_writer.as_ref().map_or(0, |(r, _)| r.dropped());
                if dropped > 0 {
                    eprintln!(
                        "[take] {dropped} samples were dropped: the writer could not keep up \
                         with the audio threads"
                    );
                }
                if let Err(e) = wav.finish() {
                    eprintln!("[take] could not finish the WAV: {e}");
                }
            })
            .map_err(|e| {
                // The writer owned the open file and has just been dropped
                // with it, leaving a 44-byte WAV of nothing. A take that
                // never started must not appear in the list.
                let _ = fs::remove_file(&path);
                format!("could not start the take writer: {e}")
            })?;

        // Only now does anything start recording: the ring the callback is
        // about to write into has a thread draining it, and the file it
        // drains to is open.
        handoff.set_record(Some(band_ring.clone()));

        self.active = Some(ActiveTake {
            jam_id: jam_id.to_string(),
            id,
            path,
            created_at,
            band_ring,
            stop,
            written,
            out_sr,
            writer: Some(writer),
        });
        Ok(())
    }

    /// Finish the take and write its sidecar. `None` when nothing was
    /// recording, which is not an error: a stop with no take running is what
    /// a UI sends when the user pressed stop twice.
    pub fn stop(&mut self, handoff: &SharedTake) -> Result<Option<JamTake>, String> {
        let Some(mut active) = self.active.take() else {
            return Ok(None);
        };
        // The callback stops writing FIRST, so the writer's last drain is
        // the last of the audio and nothing arrives after the file is shut.
        handoff.set_record(None);
        active.stop.store(true, Ordering::Release);
        if let Some(handle) = active.writer.take() {
            let _ = handle.join();
        }
        handoff.drain_retired();

        let samples = active.written.load(Ordering::Acquire);
        let duration_sec = samples as f64 / active.out_sr.max(1) as f64;
        let record = JamTake {
            id: active.id.clone(),
            jam_id: active.jam_id.clone(),
            created_at: active.created_at,
            duration_sec,
            path: active.path.to_string_lossy().into_owned(),
        };

        // An empty take is a take of nothing — the user pressed record and
        // stop without the band playing. Keeping a 44-byte WAV in the list
        // would be a row that plays silence.
        if samples == 0 {
            let _ = fs::remove_file(&active.path);
            return Ok(None);
        }

        let sidecar = active.path.with_extension("json");
        match serde_json::to_string_pretty(&record) {
            Ok(text) => {
                if let Err(e) = fs::write(&sidecar, text) {
                    // The audio is on disk and that is the part that matters;
                    // `list_takes` rebuilds a record from the file itself.
                    eprintln!("[take] could not write the sidecar: {e}");
                }
            }
            Err(e) => eprintln!("[take] could not serialise the take record: {e}"),
        }
        let _ = active.band_ring;
        Ok(Some(record))
    }
}

/// Now, in milliseconds since the epoch — the shape every timestamp the
/// frontend holds is written in.
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(name: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "yames-take-test-{}-{}",
            name,
            crate::clock::now_ns()
        ));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        base
    }

    // ---- The ring ----

    #[test]
    fn the_ring_gives_back_what_was_put_in_it() {
        let ring = TakeRing::new(64);
        ring.push(&[0.25, -0.5, 0.75]);
        let mut out = Vec::new();
        assert_eq!(ring.drain_into(&mut out), 3);
        assert_eq!(out, vec![0.25, -0.5, 0.75]);
        // And the ring is empty again, not repeating itself.
        out.clear();
        assert_eq!(ring.drain_into(&mut out), 0);
    }

    #[test]
    fn the_ring_takes_one_channel_of_an_interleaved_buffer() {
        let ring = TakeRing::new(64);
        // Stereo, the same sample duplicated across channels the way the
        // callback writes it.
        ring.push_strided(&[1.0, 1.0, 2.0, 2.0, 3.0, 3.0], 2);
        let mut out = Vec::new();
        ring.drain_into(&mut out);
        assert_eq!(out, vec![1.0, 2.0, 3.0]);
    }

    #[test]
    fn the_ring_wraps_round_and_stays_in_order() {
        let ring = TakeRing::new(8);
        let mut out = Vec::new();
        // Five rounds of six samples through an eight-sample ring: every one
        // of them has to come out, in order, because the consumer keeps up.
        let mut expected = Vec::new();
        for round in 0..5 {
            let chunk: Vec<f32> = (0..6).map(|i| (round * 6 + i) as f32).collect();
            ring.push(&chunk);
            expected.extend_from_slice(&chunk);
            ring.drain_into(&mut out);
        }
        assert_eq!(out, expected);
        assert_eq!(ring.dropped(), 0);
    }

    #[test]
    fn a_ring_nobody_drains_drops_rather_than_overwrites() {
        // The producer is an audio callback: it cannot wait and it cannot
        // grow the buffer, so the only honest thing left is to drop and say
        // so. What it must NOT do is overwrite samples the consumer has not
        // read, which would corrupt the take rather than shorten it.
        let ring = TakeRing::new(4);
        ring.push(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
        assert_eq!(ring.dropped(), 2);
        let mut out = Vec::new();
        ring.drain_into(&mut out);
        assert_eq!(out, vec![1.0, 2.0, 3.0, 4.0], "the oldest survive intact");
    }

    #[test]
    fn resetting_a_ring_forgets_everything_including_the_drops() {
        let ring = TakeRing::new(4);
        ring.push(&[1.0, 2.0, 3.0, 4.0, 5.0]);
        assert_eq!(ring.dropped(), 1);
        ring.reset();
        assert_eq!(ring.dropped(), 0);
        let mut out = Vec::new();
        assert_eq!(ring.drain_into(&mut out), 0);
    }

    #[test]
    fn the_ring_carries_a_second_of_audio_between_two_real_threads() {
        // The shape the take actually runs in: one thread pushing in
        // callback-sized buffers, one draining on a timer, and every sample
        // arriving exactly once and in order.
        let ring = Arc::new(TakeRing::new(48_000 * RING_SECS));
        let producer = ring.clone();
        let total = 48_000usize;
        let handle = std::thread::spawn(move || {
            let mut n = 0usize;
            while n < total {
                let chunk: Vec<f32> = (n..(n + 480).min(total)).map(|i| i as f32).collect();
                producer.push(&chunk);
                n += chunk.len();
                std::thread::sleep(std::time::Duration::from_micros(200));
            }
        });
        let mut out: Vec<f32> = Vec::with_capacity(total);
        while out.len() < total {
            ring.drain_into(&mut out);
            std::thread::sleep(std::time::Duration::from_millis(1));
        }
        handle.join().unwrap();
        ring.drain_into(&mut out);
        assert_eq!(ring.dropped(), 0, "a four-second ring should never overflow");
        assert_eq!(out.len(), total);
        for (i, v) in out.iter().enumerate() {
            assert_eq!(*v, i as f32, "sample {i} came out of order");
        }
    }

    // ---- The resampler ----

    fn sine(freq: f64, sr: u32, secs: f64) -> Vec<f32> {
        let n = (sr as f64 * secs) as usize;
        (0..n)
            .map(|i| ((i as f64 / sr as f64) * freq * std::f64::consts::TAU).sin() as f32)
            .collect()
    }

    #[test]
    fn the_take_writer_resamples_within_a_hair() {
        // The case the brief names: a 44.1 kHz mic against a 48 kHz output.
        const IN_SR: u32 = 44_100;
        const OUT_SR: u32 = 48_000;
        const FREQ: f64 = 440.0;
        let input = sine(FREQ, IN_SR, 0.5);
        let mut rs = LinearResampler::new(IN_SR, OUT_SR);
        let mut out: VecDeque<f32> = VecDeque::new();
        // Pushed in callback-sized chunks, because a resampler that is only
        // correct when handed the whole signal at once is no use here.
        for chunk in input.chunks(512) {
            rs.push(chunk, &mut out);
        }
        let got: Vec<f32> = out.into_iter().collect();

        // The right amount of audio came out: half a second at the output
        // rate, to within the tail the resampler is still holding.
        let want_len = (OUT_SR as f64 * 0.5) as usize;
        assert!(
            (got.len() as i64 - want_len as i64).abs() <= 4,
            "0.5 s of 44.1 kHz should be {want_len} samples at 48 kHz, got {}",
            got.len()
        );

        // And it is the same tone. Compared against an ideal 440 Hz sine at
        // the output rate, skipping the first and last few samples where the
        // phase reference and the interpolation tail disagree by a fraction
        // of a sample.
        let ideal = sine(FREQ, OUT_SR, 0.5);
        let from = 64;
        let to = got.len().min(ideal.len()) - 64;
        let mut err = 0.0f64;
        let mut sig = 0.0f64;
        for i in from..to {
            let d = (got[i] - ideal[i]) as f64;
            err += d * d;
            sig += (ideal[i] as f64) * (ideal[i] as f64);
        }
        let rms = (err / (to - from) as f64).sqrt();
        let db = 10.0 * (err / sig.max(1e-30)).log10();
        eprintln!("[take] 44.1 -> 48 kHz resampling error: {rms:.6} RMS, {db:.1} dB");
        assert!(
            rms < 0.005,
            "the resampler is {rms:.6} RMS off a 440 Hz tone ({db:.1} dB), which is \
             audible"
        );
    }

    #[test]
    fn matching_rates_are_a_copy_and_not_an_interpolation() {
        let mut rs = LinearResampler::new(48_000, 48_000);
        assert!(rs.is_identity());
        let input: Vec<f32> = (0..1000).map(|i| (i as f32) / 1000.0).collect();
        let mut out: VecDeque<f32> = VecDeque::new();
        for chunk in input.chunks(97) {
            rs.push(chunk, &mut out);
        }
        let got: Vec<f32> = out.into_iter().collect();
        // Everything but the sample still held for the next chunk.
        assert_eq!(got.len(), input.len() - 1);
        for (i, v) in got.iter().enumerate() {
            assert_eq!(*v, input[i], "sample {i} was changed by a resampler that should \
                                      not have run");
        }
    }

    #[test]
    fn downsampling_a_mic_that_runs_faster_than_the_output() {
        // 48 kHz mic, 44.1 kHz output — the other way round, which is the
        // case a linear interpolator is worse at because it does not
        // band-limit. At 440 Hz there is nothing above the new Nyquist to
        // alias, which is why this is still fine for a take.
        let input = sine(440.0, 48_000, 0.25);
        let mut rs = LinearResampler::new(48_000, 44_100);
        let mut out: VecDeque<f32> = VecDeque::new();
        for chunk in input.chunks(256) {
            rs.push(chunk, &mut out);
        }
        let got: Vec<f32> = out.into_iter().collect();
        let want = (44_100.0 * 0.25) as usize;
        assert!(
            (got.len() as i64 - want as i64).abs() <= 4,
            "expected about {want} samples, got {}",
            got.len()
        );
        let ideal = sine(440.0, 44_100, 0.25);
        let to = got.len().min(ideal.len()) - 64;
        let err: f64 = (64..to)
            .map(|i| ((got[i] - ideal[i]) as f64).powi(2))
            .sum::<f64>()
            / (to - 64) as f64;
        assert!(err.sqrt() < 0.005, "downsampling is {} RMS off", err.sqrt());
    }

    // ---- The mix ----

    #[test]
    fn the_take_is_the_mic_and_the_band_at_unity() {
        let band = [0.25f32, -0.25, 0.5];
        let mut mic: VecDeque<f32> = VecDeque::from(vec![0.25f32, 0.25, -0.5]);
        let mut out = Vec::new();
        mix_chunk(&band, &mut mic, &mut out);
        assert_eq!(out, vec![0.5, 0.0, 0.0]);
    }

    #[test]
    fn the_band_is_the_clock_and_a_missing_mic_is_silence() {
        // A mic that has not started, or has fallen behind, must not stretch
        // or stall the take: the band's own length is the take's length.
        let band = [0.1f32, 0.2, 0.3, 0.4];
        let mut mic: VecDeque<f32> = VecDeque::from(vec![0.5f32]);
        let mut out = Vec::new();
        mix_chunk(&band, &mut mic, &mut out);
        assert_eq!(out.len(), 4);
        assert!((out[0] - 0.6).abs() < 1e-6);
        assert_eq!(&out[1..], &[0.2, 0.3, 0.4]);
    }

    #[test]
    fn a_hot_mic_over_a_loud_band_clamps_rather_than_wrapping() {
        let band = [0.9f32, -0.9];
        let mut mic: VecDeque<f32> = VecDeque::from(vec![0.9f32, -0.9]);
        let mut out = Vec::new();
        mix_chunk(&band, &mut mic, &mut out);
        assert_eq!(out, vec![1.0, -1.0]);
    }

    // ---- The WAV ----

    #[test]
    fn a_take_is_a_wav_that_reads_back_as_what_was_written() {
        let dir = tmp_dir("roundtrip");
        let path = dir.join("42.wav");
        let mut w = TakeWavWriter::create(&path, 48_000).unwrap();
        let tone = sine(440.0, 48_000, 0.1);
        for chunk in tone.chunks(333) {
            w.push(chunk).unwrap();
        }
        let (written, samples) = w.finish().unwrap();
        assert_eq!(written, path);
        assert_eq!(samples as usize, tone.len());

        let bytes = fs::read(&path).unwrap();
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(bytes.len(), 44 + tone.len() * 2);
        let (pcm, sr) = decode_wav_bytes(&bytes).unwrap();
        assert_eq!(sr, 48_000);
        assert_eq!(pcm.len(), tone.len());
        // 16-bit quantisation, so the tolerance is one LSB and not zero.
        for (i, (a, b)) in pcm.iter().zip(tone.iter()).enumerate() {
            assert!(
                (a - b).abs() < 1.0 / 32767.0 * 2.0,
                "sample {i}: {a} came back for {b}"
            );
        }
    }

    #[test]
    fn a_file_that_is_not_one_of_ours_is_refused_rather_than_guessed_at() {
        assert!(decode_wav_bytes(b"not a wav at all, not even close").is_err());
        let mut stereo = crate::session_audio::wav_header_mono_16bit(48_000, 2).to_vec();
        stereo[22] = 2; // two channels
        stereo.extend_from_slice(&[0u8; 4]);
        let err = decode_wav_bytes(&stereo).expect_err("stereo is not a take");
        assert!(err.contains("mono"), "{err}");
    }

    // ---- The names on disk ----

    #[test]
    fn a_jam_id_cannot_write_outside_the_takes_directory() {
        for bad in ["../../etc", "a/b", "a\\b", ".", "..", "   ", ""] {
            match safe_dir_name(bad) {
                Ok(name) => {
                    assert!(
                        !name.contains('/') && !name.contains('\\') && name != ".." && name != ".",
                        "{bad:?} became {name:?}, which is a path and not a name"
                    );
                }
                Err(_) => {}
            }
        }
        // The readable half is still the id, so a musician looking in the
        // folder can tell what they are looking at.
        assert!(safe_dir_name("jam-17a3f").unwrap().starts_with("jam-17a3f-"));
        assert!(safe_dir_name("../../etc").unwrap().starts_with(".._.._etc-"));
        assert!(safe_dir_name("").is_err());
        assert!(safe_dir_name("..").is_err());
    }

    /// TWO JAMS MUST NOT SHARE A TAKES DIRECTORY.
    ///
    /// The bug this pins: the character rule maps everything it does not
    /// like onto `_`, and that is not one-to-one. Two jams whose ids differ
    /// only where a space or a slash or a colon sits landed in the same
    /// folder, so one jam listed the other jam's takes — and `delete_take`,
    /// which scans every jam directory for the id, would reach into a jam
    /// nobody had named.
    #[test]
    fn two_jam_ids_cannot_collapse_onto_one_takes_directory() {
        let colliding = [
            ("my jam", "my/jam"),
            ("a:b", "a b"),
            ("set_1", "set 1"),
            ("x?y", "x*y"),
        ];
        for (a, b) in colliding {
            let (na, nb) = (safe_dir_name(a).unwrap(), safe_dir_name(b).unwrap());
            assert_eq!(
                sanitised(a).unwrap(),
                sanitised(b).unwrap(),
                "{a:?} and {b:?} should be the pair the character rule confuses"
            );
            assert_ne!(na, nb, "{a:?} and {b:?} both became {na:?}");
            // And still a name, not a path.
            for n in [&na, &nb] {
                assert!(!n.contains('/') && !n.contains('\\') && !n.contains(".."));
            }
        }

        // The same id twice is the same directory, or a take saved today
        // would be in a folder nobody looks in tomorrow.
        assert_eq!(safe_dir_name("blues").unwrap(), safe_dir_name("blues").unwrap());
        assert_eq!(safe_dir_name(" blues ").unwrap(), safe_dir_name("blues").unwrap());
    }

    /// End to end: two jams whose ids the character rule confuses keep their
    /// own takes, and neither can see the other's.
    #[test]
    fn takes_of_two_confusable_jams_do_not_mix() {
        let root = tmp_dir("collide");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        for jam in ["my jam", "my/jam"] {
            let mut session = TakeSession::default();
            session
                .start(&root, jam, &handoff, None, 48_000)
                .expect("start");
            let ring = {
                let mut seen = 0u64;
                handoff.poll_record(&mut seen).unwrap().unwrap()
            };
            for _ in 0..6 {
                ring.push(&[0.3f32; 480]);
                std::thread::sleep(std::time::Duration::from_millis(2));
            }
            session.stop(&handoff).unwrap().expect("a take");
        }
        assert_eq!(list_takes(&root, "my jam").unwrap().len(), 1);
        assert_eq!(list_takes(&root, "my/jam").unwrap().len(), 1);
        assert_ne!(
            list_takes(&root, "my jam").unwrap()[0].path,
            list_takes(&root, "my/jam").unwrap()[0].path,
            "each jam keeps its own take"
        );
    }

    #[test]
    fn a_take_id_has_to_be_the_id_it_claims_to_be() {
        // Ids this module writes are milliseconds. Anything that had to be
        // sanitised to become a name was not one of ours, and resolving it
        // to the nearest legal name would be guessing.
        assert!(safe_stem("1757640000000").is_ok());
        assert!(safe_stem("../secrets").is_err());
        assert!(safe_stem("a/b").is_err());
    }

    // ---- Listing, deleting ----

    fn write_take(root: &Path, jam: &str, id: &str, secs: f64) -> PathBuf {
        // Through `safe_dir_name`, not the raw id: that is where the takes
        // of a jam actually live, and a helper that guessed at the layout
        // would keep passing while the real one moved.
        let dir = root.join(TAKES_DIR).join(safe_dir_name(jam).unwrap());
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{id}.wav"));
        let mut w = TakeWavWriter::create(&path, 48_000).unwrap();
        w.push(&vec![0.0f32; (48_000.0 * secs) as usize]).unwrap();
        w.finish().unwrap();
        let record = JamTake {
            id: id.to_string(),
            jam_id: jam.to_string(),
            created_at: id.parse().unwrap_or(0),
            duration_sec: secs,
            path: path.to_string_lossy().into_owned(),
        };
        fs::write(
            path.with_extension("json"),
            serde_json::to_string(&record).unwrap(),
        )
        .unwrap();
        path
    }

    #[test]
    fn the_takes_of_a_jam_come_back_newest_first() {
        let root = tmp_dir("list");
        write_take(&root, "blues", "1000", 1.0);
        write_take(&root, "blues", "3000", 2.0);
        write_take(&root, "blues", "2000", 1.5);
        write_take(&root, "bossa", "9000", 1.0);

        let takes = list_takes(&root, "blues").unwrap();
        assert_eq!(
            takes.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
            vec!["3000", "2000", "1000"]
        );
        assert!(takes.iter().all(|t| t.jam_id == "blues"));
        // A jam with no takes is an empty list, not an error.
        assert!(list_takes(&root, "nothing-here").unwrap().is_empty());
    }

    #[test]
    fn a_take_whose_label_was_lost_is_still_listed() {
        let root = tmp_dir("orphan");
        let path = write_take(&root, "blues", "1757640000000", 2.0);
        fs::remove_file(path.with_extension("json")).unwrap();
        let takes = list_takes(&root, "blues").unwrap();
        assert_eq!(takes.len(), 1, "losing the sidecar must not lose the take");
        assert_eq!(takes[0].id, "1757640000000");
        assert_eq!(takes[0].created_at, 1_757_640_000_000);
        assert!(
            (takes[0].duration_sec - 2.0).abs() < 0.01,
            "the length should be read off the file: {}",
            takes[0].duration_sec
        );
    }

    /// THE LENGTH OF A TAKE IS READ, NOT COUNTED.
    ///
    /// The bug this pins: `duration_of` pulled the whole WAV into memory to
    /// divide its length by two. `list_takes` calls it once for every take
    /// that lost its sidecar, with a screen waiting — twenty minutes at
    /// 48 kHz is 115 MB, so a directory of those was a hundred megabytes a
    /// row off the disk to learn a number the first 44 bytes already carry.
    ///
    /// The rule is a function of the size on disk and the header. The body
    /// is not one of its arguments, which is the part that could not have
    /// been true before.
    #[test]
    fn the_length_of_a_take_comes_from_its_size_and_its_header() {
        let h = crate::session_audio::wav_header_mono_16bit(48_000, 0);

        // Two seconds: 48000 samples a second, two bytes each, plus header.
        assert!((duration_from(44 + 48_000 * 2 * 2, &h) - 2.0).abs() < 1e-9);
        // The same header over a twenty-minute file, which is the size that
        // made reading the body expensive.
        let twenty = 44 + 48_000u64 * 2 * TAKE_MAX_SECS;
        assert!((duration_from(twenty, &h) - TAKE_MAX_SECS as f64).abs() < 1e-9);

        // A header at another rate, same size, is another length.
        let h44 = crate::session_audio::wav_header_mono_16bit(44_100, 0);
        assert!((duration_from(44 + 44_100 * 2, &h44) - 1.0).abs() < 1e-9);

        // Nothing at all, and a header that says 0 Hz, are zero rather than
        // a divide by nothing.
        assert_eq!(duration_from(0, &h), 0.0);
        assert_eq!(duration_from(1_000_000, &[0u8; 44]), 0.0);
    }

    #[test]
    fn deleting_a_take_removes_the_audio_and_its_label() {
        let root = tmp_dir("delete");
        let path = write_take(&root, "blues", "1000", 1.0);
        let sidecar = path.with_extension("json");
        assert!(path.exists() && sidecar.exists());
        delete_take(&root, "1000").unwrap();
        assert!(!path.exists(), "the audio should be gone");
        assert!(!sidecar.exists(), "and so should its label");
        // And deleting it again says so rather than pretending.
        assert!(delete_take(&root, "1000").is_err());
    }

    #[test]
    fn a_take_is_found_whichever_jam_it_belongs_to() {
        let root = tmp_dir("find");
        write_take(&root, "blues", "1000", 0.5);
        write_take(&root, "bossa", "2000", 0.5);
        assert!(load_take(&root, "1000").is_ok());
        assert!(load_take(&root, "2000").is_ok());
        assert!(load_take(&root, "3000").is_err());
    }

    #[test]
    fn a_take_loads_at_the_rate_it_was_recorded_at() {
        let root = tmp_dir("load");
        let dir = root.join(TAKES_DIR).join("blues");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("1000.wav");
        let mut w = TakeWavWriter::create(&path, 44_100).unwrap();
        w.push(&sine(220.0, 44_100, 0.2)).unwrap();
        w.finish().unwrap();
        let play = load_take(&root, "1000").unwrap();
        assert_eq!(play.sample_rate, 44_100);
        assert_eq!(play.pcm.len(), (44_100.0 * 0.2) as usize);
    }

    #[test]
    fn the_directory_size_is_every_take_of_every_jam() {
        let root = tmp_dir("size");
        assert_eq!(takes_dir_size(&root), 0, "no takes is no bytes");
        write_take(&root, "blues", "1000", 1.0);
        write_take(&root, "bossa", "2000", 1.0);
        let size = takes_dir_size(&root);
        // Two seconds of 48 kHz 16-bit mono is 192,000 bytes plus headers
        // and two small sidecars.
        assert!(
            size > 192_000 && size < 200_000,
            "two one-second takes came to {size} bytes"
        );
    }

    // ---- The playback voice ----

    fn playback(pcm: Vec<f32>, sr: u32) -> TakePlayback {
        TakePlayback {
            pcm: Arc::new(pcm),
            sample_rate: sr,
        }
    }

    #[test]
    fn a_take_played_at_its_own_rate_is_the_samples_it_was_written_from() {
        let play = playback(vec![0.0, 0.25, 0.5, 0.75], 48_000);
        assert_eq!(play.step(48_000), 1.0);
        for (i, want) in [0.0f32, 0.25, 0.5, 0.75].iter().enumerate() {
            assert_eq!(play.sample_at(i as f64), Some(*want), "sample {i}");
        }
    }

    #[test]
    fn a_take_recorded_on_another_device_plays_at_the_right_speed() {
        // Recorded through a 44.1 kHz interface, played out of a 48 kHz
        // laptop. Without the step this comes out a semitone and a half
        // sharp, which is the kind of wrong a guitarist notices instantly.
        let play = playback(vec![0.0; 4], 44_100);
        let step = play.step(48_000);
        assert!(
            (step - 44_100.0 / 48_000.0).abs() < 1e-12,
            "the source advances slower than the output: {step}"
        );
        // And the other way round.
        let other = playback(vec![0.0; 4], 96_000);
        assert!((other.step(48_000) - 2.0).abs() < 1e-12);
    }

    #[test]
    fn the_playback_voice_interpolates_between_samples() {
        let play = playback(vec![0.0, 1.0], 48_000);
        assert_eq!(play.sample_at(0.0), Some(0.0));
        assert_eq!(play.sample_at(0.5), Some(0.5));
        assert!((play.sample_at(0.25).unwrap() - 0.25).abs() < 1e-6);
    }

    #[test]
    fn a_take_that_has_run_out_says_so_rather_than_looping_or_panicking() {
        let play = playback(vec![0.1, 0.2, 0.3], 48_000);
        // The last sample has nothing to interpolate towards and is played
        // as itself.
        assert_eq!(play.sample_at(2.0), Some(0.3));
        assert_eq!(play.sample_at(2.5), Some(0.3));
        // Past the end is the end — and `None` is what raises
        // `take-playback-ended`, so it has to arrive exactly once the audio
        // is gone and not a buffer early.
        assert_eq!(play.sample_at(3.0), None);
        assert_eq!(play.sample_at(1_000_000.0), None);
    }

    #[test]
    fn an_empty_take_ends_on_its_first_frame_instead_of_hanging() {
        let play = playback(Vec::new(), 48_000);
        assert_eq!(play.sample_at(0.0), None);
    }

    #[test]
    fn a_whole_take_streams_out_at_the_length_it_should() {
        // What the callback does, frame by frame, until the take says it is
        // over: 0.1 s recorded at 44.1 kHz should take 0.1 s to play out of
        // a 48 kHz device, which is 4800 frames and not 4410.
        const OUT_SR: u32 = 48_000;
        let source = sine(440.0, 44_100, 0.1);
        let play = playback(source, 44_100);
        let step = play.step(OUT_SR);
        let mut pos = 0.0f64;
        let mut frames = 0usize;
        while play.sample_at(pos).is_some() {
            pos += step;
            frames += 1;
            assert!(frames < 100_000, "the playback never ended");
        }
        let want = (OUT_SR as f64 * 0.1) as usize;
        assert!(
            (frames as i64 - want as i64).abs() <= 2,
            "0.1 s of 44.1 kHz took {frames} frames at 48 kHz, and should take {want}"
        );
    }

    // ---- The handoff ----

    #[test]
    fn the_ring_crosses_to_the_audio_thread_behind_its_own_generation() {
        let handoff = TakeHandoff::new();
        let mut seen = 0u64;
        // Nothing has changed, so the callback does not even take the lock.
        assert!(handoff.poll_record(&mut seen).is_none());

        handoff.set_record(Some(Arc::new(TakeRing::new(16))));
        let got = handoff.poll_record(&mut seen).expect("a change");
        assert!(got.is_some());
        assert!(
            handoff.poll_record(&mut seen).is_none(),
            "the same ring must not be handed over twice"
        );

        handoff.set_record(None);
        let gone = handoff.poll_record(&mut seen).expect("a change");
        assert!(gone.is_none());
    }

    #[test]
    fn an_ended_playback_is_reported_once_and_only_once() {
        let handoff = TakeHandoff::new();
        assert!(!handoff.take_ended());
        handoff.note_ended();
        assert!(handoff.take_ended(), "the event thread should see it");
        assert!(!handoff.take_ended(), "and not see it a second time");
    }

    #[test]
    fn starting_a_playback_clears_a_previous_ones_ending() {
        // Otherwise pressing play on a second take immediately emits the
        // first one's `take-playback-ended` and the UI puts the controls
        // back while it is still playing.
        let handoff = TakeHandoff::new();
        handoff.note_ended();
        handoff.set_play(Some(TakePlayback {
            pcm: Arc::new(vec![0.0; 10]),
            sample_rate: 48_000,
        }));
        assert!(!handoff.take_ended());
        assert!(handoff.is_playing_back());
        handoff.set_play(None);
        assert!(!handoff.is_playing_back());
    }

    #[test]
    fn the_audio_thread_never_drops_the_last_reference_to_a_take() {
        // A twenty-minute take is a hundred megabytes; the last `Arc` to it
        // must be dropped somewhere `free()` is allowed.
        let handoff = TakeHandoff::new();
        let mut parking = TakeParking::new();
        let pcm = Arc::new(vec![0.0f32; 1024]);
        let watch = Arc::downgrade(&pcm);
        parking.retire_pcm(&handoff, pcm);
        assert!(
            watch.upgrade().is_some(),
            "retiring must not free it on the spot"
        );
        handoff.drain_retired();
        assert!(
            watch.upgrade().is_none(),
            "and the command thread's drain is what does"
        );
    }

    #[test]
    fn a_busy_retirement_slot_parks_rather_than_freeing() {
        let handoff = TakeHandoff::new();
        let mut parking = TakeParking::new();
        let pcm = Arc::new(vec![0.0f32; 8]);
        let watch = Arc::downgrade(&pcm);
        // The command thread is holding the lock, the way it is for the
        // instant it drains.
        let held = handoff.retired.lock().unwrap();
        parking.retire_pcm(&handoff, pcm);
        assert!(watch.upgrade().is_some(), "parked, not freed");
        drop(held);
        parking.flush(&handoff);
        handoff.drain_retired();
        assert!(watch.upgrade().is_none());
    }

    // ---- The session ----

    #[test]
    fn a_take_records_the_band_and_the_mic_into_one_file() {
        let root = tmp_dir("session");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mic = Arc::new(TakeRing::new(48_000 * RING_SECS));
        let mut session = TakeSession::default();
        session
            .start(
                &root,
                "blues",
                &handoff,
                Some((mic.clone(), 48_000)),
                48_000,
            )
            .expect("start");
        assert!(session.is_recording());
        assert_eq!(session.recording_jam(), Some("blues"));

        // Play the part of the audio threads: the callback pushes the band
        // in, the input thread pushes the mic in, in buffer-sized chunks.
        let band_ring = {
            let mut seen = 0u64;
            handoff
                .poll_record(&mut seen)
                .expect("the ring reached the audio thread")
                .expect("and it is a ring")
        };
        for _ in 0..40 {
            band_ring.push(&[0.25f32; 480]);
            mic.push(&[0.25f32; 480]);
            std::thread::sleep(std::time::Duration::from_millis(2));
        }

        let take = session.stop(&handoff).expect("stop").expect("a take");
        assert_eq!(take.jam_id, "blues");
        assert!(!session.is_recording());

        let bytes = fs::read(&take.path).unwrap();
        let (pcm, sr) = decode_wav_bytes(&bytes).unwrap();
        assert_eq!(sr, 48_000);
        assert_eq!(pcm.len(), 40 * 480, "every band sample should be in the file");
        assert!(
            (take.duration_sec - (40.0 * 480.0 / 48_000.0)).abs() < 0.01,
            "the take is {} s",
            take.duration_sec
        );
        // Band 0.25 plus mic 0.25 at unity, allowing for the resampler's
        // one-sample tail at the very start.
        let mid = pcm[pcm.len() / 2];
        assert!(
            (mid - 0.5).abs() < 0.01,
            "the mic and the band should sum to 0.5, got {mid}"
        );
        // And it is listed, with a sidecar.
        let listed = list_takes(&root, "blues").unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, take.id);
        assert!(Path::new(&take.path).with_extension("json").exists());
    }

    #[test]
    fn a_take_of_nothing_is_not_kept() {
        let root = tmp_dir("empty");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mut session = TakeSession::default();
        session.start(&root, "blues", &handoff, None, 48_000).unwrap();
        // Nothing is pushed: the user pressed record and stop with the band
        // stopped.
        assert!(session.stop(&handoff).unwrap().is_none());
        assert!(list_takes(&root, "blues").unwrap().is_empty());
    }

    #[test]
    fn a_take_with_no_mic_is_still_a_take_of_the_band() {
        let root = tmp_dir("no-mic");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mut session = TakeSession::default();
        session.start(&root, "blues", &handoff, None, 48_000).unwrap();
        let band_ring = {
            let mut seen = 0u64;
            handoff.poll_record(&mut seen).unwrap().unwrap()
        };
        for _ in 0..10 {
            band_ring.push(&[0.5f32; 480]);
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
        let take = session.stop(&handoff).unwrap().expect("a take");
        let (pcm, _) = decode_wav_bytes(&fs::read(&take.path).unwrap()).unwrap();
        assert_eq!(pcm.len(), 4800);
        assert!((pcm[100] - 0.5).abs() < 0.01, "the band alone, at its own level");
    }

    #[test]
    fn a_second_take_is_refused_while_one_is_running() {
        let root = tmp_dir("double");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mut session = TakeSession::default();
        session.start(&root, "blues", &handoff, None, 48_000).unwrap();
        let err = session
            .start(&root, "blues", &handoff, None, 48_000)
            .expect_err("one at a time");
        assert!(err.contains("already recording"), "{err}");
        let _ = session.stop(&handoff);
    }

    #[test]
    fn recording_over_a_playback_is_refused_with_something_to_show_the_user() {
        let root = tmp_dir("over-playback");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        handoff.set_play(Some(TakePlayback {
            pcm: Arc::new(vec![0.0; 10]),
            sample_rate: 48_000,
        }));
        let mut session = TakeSession::default();
        let err = session
            .start(&root, "blues", &handoff, None, 48_000)
            .expect_err("not while a take is playing");
        assert!(err.contains("stop the take"), "{err}");
    }

    #[test]
    fn stopping_when_nothing_is_recording_is_not_an_error() {
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mut session = TakeSession::default();
        assert!(session.stop(&handoff).unwrap().is_none());
    }

    #[test]
    fn a_take_stops_growing_at_the_cap() {
        // Twenty minutes at 48 kHz would take twenty minutes to prove, so
        // the arithmetic the writer does is checked at a rate that makes the
        // cap arrive immediately: at 4 samples a second the cap is
        // `TAKE_MAX_SECS * 4` samples.
        let root = tmp_dir("cap");
        let handoff: SharedTake = Arc::new(TakeHandoff::new());
        let mut session = TakeSession::default();
        session.start(&root, "blues", &handoff, None, 4).unwrap();
        let band_ring = {
            let mut seen = 0u64;
            handoff.poll_record(&mut seen).unwrap().unwrap()
        };
        let cap = (TAKE_MAX_SECS * 4) as usize;
        // Twice the cap, in chunks the ring can hold.
        let mut sent = 0usize;
        while sent < cap * 2 {
            let n = (cap * 2 - sent).min(band_ring.capacity() / 2);
            band_ring.push(&vec![0.5f32; n]);
            sent += n;
            std::thread::sleep(std::time::Duration::from_millis(WRITER_TICK_MS + 5));
        }
        let take = session.stop(&handoff).unwrap().expect("a take");
        let (pcm, _) = decode_wav_bytes(&fs::read(&take.path).unwrap()).unwrap();
        assert_eq!(pcm.len(), cap, "the take should stop exactly at the cap");
        assert!(
            (take.duration_sec - TAKE_MAX_SECS as f64).abs() < 0.01,
            "a capped take is {TAKE_MAX_SECS} s, not {}",
            take.duration_sec
        );
    }
}
