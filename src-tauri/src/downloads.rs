//! The Downloads folder, watched while Songs is open — and only then.
//!
//! `plans/SONGS.md` S0.9. The owner's favourite half of getting a song in:
//! the player finds a tab in their own browser, presses download, and comes
//! back to Yames to find it already waiting to be opened. Everything after
//! the click on "download" is gone.
//!
//! # What this module will not do
//!
//! * **It never touches a tab site.** Nothing here makes a network request of
//!   any kind. It reads a directory listing on this machine and that is all.
//! * **It never opens a file.** A poll asks the operating system for a name, a
//!   size and a modification time. The bytes are read by `read_offered_file`,
//!   once, after the player has said yes — and by nothing else.
//! * **It never moves, renames or deletes anything.** The file in Downloads is
//!   the player's; Yames keeps its own copy of what it imports
//!   (`scores.source_b64`) precisely so it never has to own theirs.
//! * **It does not exist when it is turned off.** "Off" means no thread, not a
//!   thread that decides to stay quiet.
//!
//! # Polling, not `notify`
//!
//! The brief offered the `notify` crate if its licence fitted. It does not —
//! `notify` is CC0-1.0 OR Artistic-2.0, and this repo takes MIT/Apache
//! dependencies — and once the "is it finished arriving?" rule is written, a
//! watcher buys very little: a browser writes a part file, renames it, and
//! then may still be flushing, so an event still has to be followed by a size
//! that holds still. So this polls, every [`POLL_INTERVAL`], with `read_dir`
//! and `metadata` and nothing else. A Downloads folder is a few hundred
//! entries; the thread sleeps for 99.9 % of its life and costs the bundle
//! nothing at all.
//!
//! # The shape
//!
//! [`Scanner`] is the whole of the decision and has no I/O in it, so every
//! rule below is a unit test rather than a thing that has to be reproduced
//! with a real browser: a partial download is ignored, a file whose size is
//! still moving is ignored, a file that arrived before the player opened
//! Songs (beyond a short grace) is ignored, and a file is offered exactly
//! once. The thread is twenty lines of `read_dir` around it.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;

/// The extensions a finished download is offered for.
///
/// Deliberately **not** `.xml`. The brief allows it "only if it parses as
/// MusicXML", and there is no way to know that without opening the file —
/// which is the one thing this module promises not to do before the player
/// has said yes. A Downloads folder is also full of `.xml` that is a bank
/// statement, so offering every one of them would train people to ignore the
/// offer. `.xml` still imports perfectly well through the file picker and the
/// drop target, where the player chose the file themselves.
pub const WATCHED_EXTENSIONS: [&str; 7] = ["gp", "gp3", "gp4", "gp5", "gpx", "musicxml", "mxl"];

/// Suffixes a browser puts on a file it has not finished writing. The
/// extension check below already rejects `song.gp.crdownload`, because its
/// extension is `crdownload`; this list is here so that the rule is stated
/// where somebody looks for it rather than being an accident of the other one.
const PARTIAL_SUFFIXES: [&str; 6] = [
    ".crdownload",
    ".part",
    ".partial",
    ".download",
    ".opdownload",
    ".tmp",
];

/// How often the folder is listed.
pub const POLL_INTERVAL: Duration = Duration::from_millis(700);

/// How many consecutive polls a size must hold before the file counts as
/// finished. Two, so a file is offered about 1.4 s after it stops growing —
/// long enough that a slow flush is not mistaken for the end of a download,
/// short enough that the offer is there when the player switches back.
pub const STABLE_POLLS: u32 = 2;

/// How long before Songs was opened a file may have arrived and still be
/// offered. Ten minutes, from the brief: the player downloads the file, then
/// finds their way to Songs.
pub const GRACE: Duration = Duration::from_secs(10 * 60);

/// The largest file this module will hand over. A Guitar Pro file is tens of
/// kilobytes and the biggest orchestral MusicXML anybody has is a few
/// megabytes; sixty-four is far past generous, and it is the difference
/// between a mistake and a webview asking Rust to read a disk image into a
/// string.
pub const MAX_OFFER_BYTES: u64 = 64 * 1024 * 1024;

/// One directory entry, as the scanner sees one: a name, a size and a time.
/// No handle, no bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub name: String,
    pub size: u64,
    /// Modification time, epoch milliseconds.
    pub modified_ms: i64,
}

/// What the frontend is told about a file worth offering.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Offer {
    /// The full path, which is what `read_offered_file` takes back.
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub modified_ms: i64,
}

#[derive(Debug, Clone, Copy)]
struct Pending {
    size: u64,
    /// How many consecutive polls this size has now held for.
    holds: u32,
}

/// The decision, with no disk in it.
///
/// Fed a listing at a time. Answers with the files that have just become
/// worth offering, and remembers enough to never say the same one twice.
#[derive(Debug)]
pub struct Scanner {
    started_ms: i64,
    grace_ms: i64,
    stable_polls: u32,
    pending: HashMap<String, Pending>,
    offered: HashSet<String>,
}

impl Scanner {
    pub fn new(started_ms: i64) -> Scanner {
        Scanner::with_rules(started_ms, GRACE.as_millis() as i64, STABLE_POLLS)
    }

    pub fn with_rules(started_ms: i64, grace_ms: i64, stable_polls: u32) -> Scanner {
        Scanner {
            started_ms,
            grace_ms,
            stable_polls,
            pending: HashMap::new(),
            offered: HashSet::new(),
        }
    }

    /// One listing in, the newly offerable files out, in the listing's order.
    ///
    /// A file disappears from the map when it disappears from the folder, so
    /// a download that is deleted and fetched again is judged from scratch
    /// rather than inheriting the first attempt's stability.
    pub fn poll(&mut self, entries: &[Entry]) -> Vec<Entry> {
        let present: HashSet<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        self.pending.retain(|name, _| present.contains(name.as_str()));

        let mut out = Vec::new();
        for entry in entries {
            if self.offered.contains(&entry.name) {
                continue;
            }
            if !is_watched(&entry.name) {
                continue;
            }
            // A file still being written has no size worth measuring, and a
            // zero-byte placeholder is what a browser leaves behind when a
            // download failed.
            if entry.size == 0 {
                continue;
            }
            // It has to have arrived while Songs was open, or in the grace
            // window before it. Everything else in Downloads is old news, and
            // a folder full of last year's files must not produce a hundred
            // offers the first time somebody opens the mode.
            if entry.modified_ms < self.started_ms - self.grace_ms {
                continue;
            }
            let holds = match self.pending.get(&entry.name) {
                Some(seen) if seen.size == entry.size => seen.holds + 1,
                // New, or still growing: the count starts again.
                _ => 1,
            };
            if holds >= self.stable_polls {
                self.pending.remove(&entry.name);
                self.offered.insert(entry.name.clone());
                out.push(entry.clone());
            } else {
                self.pending.insert(
                    entry.name.clone(),
                    Pending {
                        size: entry.size,
                        holds,
                    },
                );
            }
        }
        out
    }

    /// Never offer this name again in this watch.
    ///
    /// The player's dismissal survives a restart in `settings.json` — the
    /// frontend owns that list, because it is the frontend that knows what
    /// was on screen. This is the same fact for the life of one watch, so
    /// that a dismissal is not undone by the next poll a second later.
    pub fn dismiss(&mut self, name: &str) {
        self.pending.remove(name);
        self.offered.insert(name.to_string());
    }
}

/// True for a name this module would offer. Case-insensitive, because
/// Windows writes `Song.GP5` and so do plenty of tab sites.
pub fn is_watched(name: &str) -> bool {
    if PARTIAL_SUFFIXES
        .iter()
        .any(|s| name.to_ascii_lowercase().ends_with(s))
    {
        return false;
    }
    match name.rsplit_once('.') {
        // A name that is nothing but an extension (`.gp5`) is a hidden file,
        // not a song called "gp5".
        Some((stem, ext)) if !stem.is_empty() => {
            let ext = ext.to_ascii_lowercase();
            WATCHED_EXTENSIONS.contains(&ext.as_str())
        }
        _ => false,
    }
}

/// Extensions Yames will open a file for when the OS hands it one — "Open
/// with Yames", or a path on the command line.
///
/// Wider than [`WATCHED_EXTENSIONS`] by three, and the difference is consent.
/// The watcher offers files nobody asked it about, so it stays off anything
/// ambiguous; this list answers a file the player deliberately chose, and
/// refusing their `.xml` because it MIGHT be a bank statement would be
/// refusing to do the thing they just asked for. If it does not parse, the
/// importer says so in a sentence.
pub const OPENABLE_EXTENSIONS: [&str; 10] = [
    "gp", "gp3", "gp4", "gp5", "gpx", "musicxml", "mxl", "xml", "alphatex", "tex",
];

/// True for a file the player has explicitly asked Yames to open.
pub fn is_openable(name: &str) -> bool {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => {
            let ext = ext.to_ascii_lowercase();
            OPENABLE_EXTENSIONS.contains(&ext.as_str())
        }
        _ => false,
    }
}

/// Epoch milliseconds, saturating at zero. `SystemTime` before the epoch is a
/// clock somebody has set wrongly, not a reason to panic in a watcher.
pub fn epoch_ms(time: SystemTime) -> i64 {
    time.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn now_ms() -> i64 {
    epoch_ms(SystemTime::now())
}

/// List a folder as the scanner wants it. Errors are an empty listing: a
/// folder that has been renamed or unmounted is not a reason to stop
/// watching, and the next poll may well find it again.
pub fn list_dir(dir: &Path) -> Vec<Entry> {
    let Ok(read) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in read.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() {
            continue;
        }
        let Some(name) = entry.file_name().to_str().map(String::from) else {
            continue;
        };
        out.push(Entry {
            name,
            size: meta.len(),
            modified_ms: meta.modified().map(epoch_ms).unwrap_or(0),
        });
    }
    // A stable order, so two polls of one folder produce offers in one order
    // and a test does not have to sort.
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

// ---------------------------------------------------------------------------
// The watch itself
// ---------------------------------------------------------------------------

/// A running watch: the folder, the thread's stop flag, and the scanner the
/// thread and the dismiss command share.
pub struct Watch {
    pub dir: PathBuf,
    stop: Arc<AtomicBool>,
    scanner: Arc<Mutex<Scanner>>,
}

impl Watch {
    pub fn stop(&self) {
        self.stop.store(true, Ordering::Release);
    }

    pub fn dismiss(&self, name: &str) {
        if let Ok(mut scanner) = self.scanner.lock() {
            scanner.dismiss(name);
        }
    }
}

/// The one watch there may be, or none. `None` is the honest representation
/// of "off": there is no thread.
#[derive(Default)]
pub struct WatchState(pub Mutex<Option<Watch>>);

/// Start watching `dir`, calling `offer` on the watching thread for every
/// file that finishes arriving.
///
/// The callback is what keeps this module free of Tauri: the command layer
/// passes a closure that emits an event, and the tests pass one that pushes
/// to a `Vec`. Nothing here is on, or near, an audio thread.
pub fn spawn_watch<F>(dir: PathBuf, offer: F) -> Watch
where
    F: Fn(Offer) + Send + 'static,
{
    let stop = Arc::new(AtomicBool::new(false));
    let scanner = Arc::new(Mutex::new(Scanner::new(now_ms())));
    let handle = Watch {
        dir: dir.clone(),
        stop: Arc::clone(&stop),
        scanner: Arc::clone(&scanner),
    };
    std::thread::Builder::new()
        .name("yames-downloads".into())
        .spawn(move || {
            while !stop.load(Ordering::Acquire) {
                let entries = list_dir(&dir);
                let fresh = match scanner.lock() {
                    Ok(mut s) => s.poll(&entries),
                    // A poisoned scanner means a panic in a callback. Stop
                    // rather than spin: the mode will start a new watch.
                    Err(_) => break,
                };
                for entry in fresh {
                    if stop.load(Ordering::Acquire) {
                        return;
                    }
                    offer(Offer {
                        path: dir.join(&entry.name).to_string_lossy().into_owned(),
                        file_name: entry.name,
                        size_bytes: entry.size,
                        modified_ms: entry.modified_ms,
                    });
                }
                std::thread::sleep(POLL_INTERVAL);
            }
        })
        .expect("the downloads watcher thread");
    handle
}

/// Why a path handed back by the frontend will not be read.
#[derive(Debug, PartialEq, Eq)]
pub enum OfferError {
    /// Not inside the folder being watched. The webview may name any path it
    /// likes; this module reads one folder.
    NotWatched,
    /// Not a name this module would have offered.
    NotASong,
    TooBig(u64),
    Unreadable(String),
}

impl std::fmt::Display for OfferError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OfferError::NotWatched => write!(f, "that file is not in the folder Yames is watching"),
            OfferError::NotASong => write!(f, "that is not a Guitar Pro or MusicXML file"),
            OfferError::TooBig(size) => write!(f, "that file is {size} bytes, which is too big"),
            OfferError::Unreadable(e) => write!(f, "{e}"),
        }
    }
}

/// Check a path the frontend asked for against the folder being watched.
///
/// Pure, and separately tested, because it is the security boundary: it is
/// the one place a string from the webview turns into a file that gets
/// opened. The path must be a direct child of the watched folder (no
/// subdirectory, no `..` climbing out) and must be a name this module would
/// have offered in the first place.
pub fn check_offer(watched: &Path, path: &Path) -> Result<(), OfferError> {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or(OfferError::NotASong)?;
    if !is_watched(name) {
        return Err(OfferError::NotASong);
    }
    let parent = path.parent().ok_or(OfferError::NotWatched)?;
    // Canonicalised on both sides, so a path with `..` in it, a different
    // spelling of the same drive, or a symlink pointing elsewhere cannot
    // dress itself up as the watched folder. A folder that will not
    // canonicalise (deleted, unmounted) fails closed.
    let watched = watched
        .canonicalize()
        .map_err(|_| OfferError::NotWatched)?;
    let parent = parent.canonicalize().map_err(|_| OfferError::NotWatched)?;
    if parent != watched {
        return Err(OfferError::NotWatched);
    }
    Ok(())
}

/// The file's bytes, after the player has said yes.
///
/// The only function in this module that opens anything.
pub fn read_offered(watched: &Path, path: &Path) -> Result<Vec<u8>, OfferError> {
    check_offer(watched, path)?;
    let meta = std::fs::metadata(path).map_err(|e| OfferError::Unreadable(e.to_string()))?;
    if meta.len() > MAX_OFFER_BYTES {
        return Err(OfferError::TooBig(meta.len()));
    }
    std::fs::read(path).map_err(|e| OfferError::Unreadable(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(name: &str, size: u64, modified_ms: i64) -> Entry {
        Entry {
            name: name.to_string(),
            size,
            modified_ms,
        }
    }

    /// A temp directory of this test's own. Never the owner's Downloads —
    /// nothing in this suite may read or watch a real data directory.
    fn temp_dir(tag: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("yames-w19-{tag}-{nanos}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn only_the_extensions_a_song_comes_in() {
        for good in ["riff.gp", "riff.gp3", "riff.gp4", "riff.gp5", "riff.gpx", "riff.musicxml", "riff.mxl"] {
            assert!(is_watched(good), "{good} should be watched");
        }
        for bad in [
            "riff.xml",          // could be anything; see WATCHED_EXTENSIONS
            "riff.pdf",
            "riff.gp5.crdownload",
            "riff.gp5.part",
            "riff.gp5.tmp",
            "riff",
            ".gp5",              // a hidden file, not a song called "gp5"
            "",
        ] {
            assert!(!is_watched(bad), "{bad} should not be watched");
        }
        // Windows writes what the site sent it, capitals and all.
        assert!(is_watched("Riff.GP5"));
        assert!(is_watched("Riff.MusicXML"));
    }

    #[test]
    fn opening_a_file_takes_three_the_watcher_will_not_offer() {
        // The player chose this one, so the ambiguity that keeps `.xml` out
        // of the watcher does not apply.
        for good in ["riff.xml", "riff.alphatex", "riff.tex", "riff.gp5", "riff.MXL"] {
            assert!(is_openable(good), "{good} should open");
        }
        for bad in ["riff.pdf", "riff", ".gp5", "riff.gp5.part", ""] {
            assert!(!is_openable(bad), "{bad} should not open");
        }
        // Everything the watcher offers, Yames will also open.
        for ext in WATCHED_EXTENSIONS {
            assert!(is_openable(&format!("riff.{ext}")), "{ext}");
        }
    }

    #[test]
    fn a_file_still_growing_is_not_offered_and_then_is() {
        let mut scanner = Scanner::with_rules(1_000_000, 60_000, 2);
        // Arrives, half written.
        assert!(scanner.poll(&[entry("riff.gp5", 4_000, 1_000_100)]).is_empty());
        // Still growing: the stability count starts again rather than ticking.
        assert!(scanner.poll(&[entry("riff.gp5", 9_000, 1_000_800)]).is_empty());
        // Held still for one more poll: offered.
        let out = scanner.poll(&[entry("riff.gp5", 9_000, 1_000_800)]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name, "riff.gp5");
    }

    #[test]
    fn a_partial_download_is_never_offered() {
        let mut scanner = Scanner::with_rules(1_000_000, 60_000, 1);
        let listing = [entry("riff.gp5.crdownload", 9_000, 1_000_100)];
        assert!(scanner.poll(&listing).is_empty());
        assert!(scanner.poll(&listing).is_empty());
        assert!(scanner.poll(&listing).is_empty());
    }

    #[test]
    fn a_file_is_offered_exactly_once() {
        let mut scanner = Scanner::with_rules(1_000_000, 60_000, 1);
        let listing = [entry("riff.gp5", 9_000, 1_000_100)];
        assert_eq!(scanner.poll(&listing).len(), 1);
        for _ in 0..5 {
            assert!(scanner.poll(&listing).is_empty(), "offered twice");
        }
    }

    #[test]
    fn a_dismissed_file_stays_dismissed() {
        let mut scanner = Scanner::with_rules(1_000_000, 60_000, 1);
        let listing = [entry("riff.gp5", 9_000, 1_000_100)];
        assert_eq!(scanner.poll(&listing).len(), 1);
        scanner.dismiss("riff.gp5");
        for _ in 0..5 {
            assert!(scanner.poll(&listing).is_empty());
        }
    }

    #[test]
    fn a_file_dismissed_before_it_settled_is_never_offered() {
        // The player can only dismiss what they have seen, but the frontend's
        // stored list is replayed into a fresh watch, and a file still
        // growing at that moment must not slip through behind the dismissal.
        let mut scanner = Scanner::with_rules(1_000_000, 60_000, 2);
        assert!(scanner.poll(&[entry("riff.gp5", 4_000, 1_000_100)]).is_empty());
        scanner.dismiss("riff.gp5");
        assert!(scanner.poll(&[entry("riff.gp5", 4_000, 1_000_100)]).is_empty());
        assert!(scanner.poll(&[entry("riff.gp5", 4_000, 1_000_100)]).is_empty());
    }

    #[test]
    fn last_years_downloads_are_not_offered() {
        // Opened Songs at t=1_000_000 with a ten-second grace.
        let mut scanner = Scanner::with_rules(1_000_000, 10_000, 1);
        let out = scanner.poll(&[
            entry("old.gp5", 9_000, 900_000),   // long before
            entry("recent.gp5", 9_000, 995_000), // inside the grace
            entry("new.gp5", 9_000, 1_000_500),  // while watching
        ]);
        // In the listing's own order, which `list_dir` sorts by name.
        let names: Vec<_> = out.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["recent.gp5", "new.gp5"]);
    }

    #[test]
    fn an_empty_file_is_not_a_download() {
        let mut scanner = Scanner::with_rules(1_000_000, 60_000, 1);
        assert!(scanner.poll(&[entry("riff.gp5", 0, 1_000_100)]).is_empty());
        assert!(scanner.poll(&[entry("riff.gp5", 0, 1_000_100)]).is_empty());
    }

    #[test]
    fn a_file_deleted_and_fetched_again_starts_over() {
        let mut scanner = Scanner::with_rules(1_000_000, 60_000, 2);
        assert!(scanner.poll(&[entry("riff.gp5", 4_000, 1_000_100)]).is_empty());
        // Gone: the browser cancelled it.
        assert!(scanner.poll(&[]).is_empty());
        // Back at the same size. One poll is not two, so nothing yet.
        assert!(scanner.poll(&[entry("riff.gp5", 4_000, 1_000_900)]).is_empty());
        assert_eq!(scanner.poll(&[entry("riff.gp5", 4_000, 1_000_900)]).len(), 1);
    }

    // -- the disk half, in a temp directory ---------------------------------

    #[test]
    fn a_real_folder_is_listed_without_opening_anything() {
        let dir = temp_dir("list");
        std::fs::write(dir.join("riff.gp5"), b"not really a guitar pro file").unwrap();
        std::fs::write(dir.join("notes.txt"), b"ignored").unwrap();
        std::fs::create_dir_all(dir.join("a-folder.gp5")).unwrap();

        let entries = list_dir(&dir);
        let names: Vec<_> = entries.iter().map(|e| e.name.as_str()).collect();
        // The directory called `a-folder.gp5` is in the listing (the scanner,
        // not the lister, decides what is a song) but a directory is not a
        // file and never reaches it.
        assert!(names.contains(&"riff.gp5"));
        assert!(names.contains(&"notes.txt"));
        assert!(!names.contains(&"a-folder.gp5"), "a directory is not a file");
        assert_eq!(
            entries.iter().find(|e| e.name == "riff.gp5").unwrap().size,
            28
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_watch_offers_a_finished_file_and_stops_when_it_is_told_to() {
        let dir = temp_dir("watch");
        let seen: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&seen);
        let watch = spawn_watch(dir.clone(), move |offer| {
            sink.lock().unwrap().push(offer.file_name);
        });

        std::fs::write(dir.join("riff.gp5"), b"bytes enough to have a size").unwrap();
        // Two polls to settle plus slack; the thread sleeps POLL_INTERVAL.
        let deadline = SystemTime::now() + Duration::from_secs(10);
        while seen.lock().unwrap().is_empty() && SystemTime::now() < deadline {
            std::thread::sleep(Duration::from_millis(100));
        }
        assert_eq!(seen.lock().unwrap().as_slice(), ["riff.gp5"]);

        watch.stop();
        std::thread::sleep(POLL_INTERVAL * 3);
        seen.lock().unwrap().clear();
        std::fs::write(dir.join("second.gp5"), b"written after the watch stopped").unwrap();
        std::thread::sleep(POLL_INTERVAL * 4);
        assert!(
            seen.lock().unwrap().is_empty(),
            "a stopped watch went on offering",
        );

        // And the file it offered is exactly where it was: never moved,
        // never renamed, never deleted.
        assert!(dir.join("riff.gp5").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_path_outside_the_watched_folder_is_refused() {
        let dir = temp_dir("guard");
        let other = temp_dir("guard-other");
        std::fs::write(dir.join("riff.gp5"), b"in the watched folder").unwrap();
        std::fs::write(other.join("elsewhere.gp5"), b"somewhere else entirely").unwrap();
        std::fs::write(dir.join("notes.txt"), b"not a song").unwrap();

        assert_eq!(check_offer(&dir, &dir.join("riff.gp5")), Ok(()));
        assert_eq!(
            check_offer(&dir, &other.join("elsewhere.gp5")),
            Err(OfferError::NotWatched),
        );
        assert_eq!(
            check_offer(&dir, &dir.join("notes.txt")),
            Err(OfferError::NotASong),
        );
        // Climbing out and back in by name is the same folder and is allowed;
        // climbing out and staying out is not.
        assert_eq!(
            check_offer(&dir, &other.join("..").join("nowhere").join("riff.gp5")),
            Err(OfferError::NotWatched),
        );

        assert_eq!(
            read_offered(&dir, &dir.join("riff.gp5")).unwrap(),
            b"in the watched folder",
        );
        assert!(read_offered(&dir, &other.join("elsewhere.gp5")).is_err());

        std::fs::remove_dir_all(&dir).ok();
        std::fs::remove_dir_all(&other).ok();
    }
}
