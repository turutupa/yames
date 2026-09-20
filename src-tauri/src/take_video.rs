//! The picture beside the take — written by the webview, kept by us.
//!
//! `plans/SONGS.md` A9 (the camera is in, Songs only, and the review must work
//! exactly the same with sound alone) and A10 (the picture is the webview's own
//! file, the sound stays the engine's take, and a sidecar holds the measured
//! offset between them).
//!
//! ## Why the picture comes down a pipe instead of arriving as a file
//!
//! `MediaRecorder` hands the webview a `Blob` every timeslice and nothing
//! else. Holding those until the pass ends means a five-minute take sitting in
//! the renderer's heap — a hundred-odd megabytes of it — and losing the whole
//! recording if anything goes wrong before the end. So each chunk crosses once
//! and is appended to a file straight away: memory stays flat, and what is on
//! disk at any instant is a playable prefix of what has been played.
//!
//! ## Every rule `take.rs` makes about a recording applies here unchanged
//!
//! Same directory, same opt-in, same delete. A picture of somebody playing is
//! the most private thing this app writes, so:
//!
//! * Nothing records until `take_video_begin` is called, and only the camera
//!   switch calls it, only for a song whose camera the user turned on, and
//!   only after `getUserMedia` — which the OS gates with its own prompt.
//! * The file lives beside its take, is listed with it, sized with it and
//!   deleted with it (`take.rs`: `video_beside`, `list_takes`, `delete_take`).
//! * It is **not** addressable as a take: `safe_stem` refuses any id ending in
//!   `.video`, so nothing can play, analyse or delete the picture on its own.
//! * Nothing is uploaded. There is no command in this file that reads a video
//!   back out, and the review plays it through the webview's own asset
//!   protocol, scoped to the takes directory and to nothing else.
//!
//! ## The pending name, and why the file is not born with the take's id
//!
//! The engine names a take when it STOPS — `stop_take` is what hands an id
//! back — and the camera has been writing since the first bar. So the file is
//! opened under `pending-<ms>.video.<ext>` and renamed to
//! `<takeId>.video.<ext>` when the take that owns it is known. A crash between
//! the two leaves a `pending-` file, which is why `take_video_begin` sweeps
//! them: an orphan recording of a person that nothing on screen lists is
//! exactly the outcome the opt-in promise forbids.
//!
//! ## Nothing here runs near the audio threads
//!
//! These are ordinary command-thread file writes on the Tauri async runtime.
//! The click, the band and the take's own writer thread never see this module,
//! and `TAKE_VIDEO_*` touches no ring, no handoff and no callback.

use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager, State};

use crate::take::{is_video_stem, take_dir, take_path, VIDEO_SUFFIX};

/// The most a single recording may grow to.
///
/// A take is capped at twenty minutes (`take::TAKE_MAX_SECS`); twenty minutes
/// of 720p30 is a few hundred megabytes at any sane bitrate, and two gigabytes
/// is far past anything a camera the webview negotiated will produce. It is
/// here so that a recorder that goes wrong — a stuck encoder, a device that
/// re-negotiates upward — cannot quietly fill a disk while somebody practises.
const MAX_VIDEO_BYTES: u64 = 2 * 1024 * 1024 * 1024;

/// How far ahead of the next expected chunk the appends may run.
///
/// The webview sends chunks in order and waits for each to land before sending
/// the next, so in practice this is never used. It exists because "in practice"
/// is not a guarantee: if the IPC ever delivers two appends out of order, the
/// early one waits here rather than being written into the middle of the file,
/// which would produce a video that plays for a while and then stops. Sixteen
/// chunks is sixteen seconds at the timeslice the recorder uses.
const MAX_PENDING_CHUNKS: usize = 16;

/// ...and how much memory that is allowed to be. A chunk is a few hundred
/// kilobytes; sixty-four megabytes is a hard stop rather than an expected size.
const MAX_PENDING_BYTES: usize = 64 * 1024 * 1024;

/// What the webview managed to encode, as a file extension.
///
/// An enum and not the string that arrived: the extension becomes part of a
/// path, and the whole of `take.rs`'s character rule exists because a name
/// built out of unvalidated input is how a feature that writes files becomes a
/// feature that writes any file. Two containers, both chosen from a fixed list
/// here, and an unknown one is refused rather than resolved to the nearest.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Container {
    Mp4,
    WebM,
}

impl Container {
    fn parse(name: &str) -> Result<Self, String> {
        match name.trim().to_ascii_lowercase().as_str() {
            "mp4" => Ok(Self::Mp4),
            "webm" => Ok(Self::WebM),
            other => Err(format!("{other:?} is not a video container this app writes")),
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Self::Mp4 => "mp4",
            Self::WebM => "webm",
        }
    }
}

/// What the review is told once the picture is on disk.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TakeVideo {
    /// Absolute path of the file, for the asset protocol to play.
    pub path: String,
    pub bytes: u64,
    /// Milliseconds to ADD to a position in the take's audio to reach the same
    /// instant in the picture. See `JamTake::video_offset_ms`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset_ms: Option<f64>,
}

/// A recording in progress: one open file, and where the next chunk goes.
struct ActiveVideo {
    path: PathBuf,
    file: fs::File,
    /// The chunk number the file is waiting for. Chunks are numbered from 0 by
    /// the webview and appended in that order and no other.
    next_seq: u32,
    /// Chunks that arrived early, waiting for the gap in front of them.
    pending: BTreeMap<u32, Vec<u8>>,
    pending_bytes: usize,
    bytes: u64,
}

/// The recording this window has open, if any. Command thread only.
///
/// The slot is private: `ActiveVideo` holds an open file handle, and a module
/// that could reach in and take it could leave a recording of somebody playing
/// half-written with nothing left to close or delete it by.
#[derive(Default)]
pub struct VideoState(Mutex<Option<ActiveVideo>>);

impl VideoState {
    /// The slot, with a poisoned lock taken over rather than refused: a panic
    /// on another thread must not leave a camera recording with no way to stop
    /// it. The slot's own invariants do not depend on the panicking thread.
    fn slot(&self) -> Result<std::sync::MutexGuard<'_, Option<ActiveVideo>>, std::sync::PoisonError<std::sync::MutexGuard<'_, Option<ActiveVideo>>>> {
        self.0.lock()
    }
}

/// Where the app keeps its files. The same resolution `take.rs`'s commands
/// use, so a build that resolves the data directory differently cannot end up
/// writing pictures in one place and takes in another.
fn home(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("could not find where this app keeps its files: {e}"))
}

/// The name a recording is written under before its take has an id.
fn pending_name(started_ms: u64, container: Container) -> String {
    format!("pending-{started_ms}{VIDEO_SUFFIX}.{}", container.extension())
}

/// Is this a half-written recording somebody walked away from?
fn is_pending(stem: &str) -> bool {
    is_video_stem(stem) && stem.starts_with("pending-")
}

/// Throw away every `pending-` recording in a take directory.
///
/// Run before a new one starts rather than on a timer: the only way one of
/// these exists is a crash or a kill mid-take, and the next time the camera is
/// armed is both the soonest we are certainly not using it and a moment the
/// user is present for. A failure to remove one is not worth refusing the new
/// recording over — it is reported and the take goes ahead.
fn sweep_pending(dir: &Path) -> u32 {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    let mut swept = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if !is_pending(stem) || !path.is_file() {
            continue;
        }
        match fs::remove_file(&path) {
            Ok(()) => swept += 1,
            Err(e) => eprintln!("[take-video] could not clear {}: {e}", path.display()),
        }
    }
    swept
}

/// The bytes of one chunk, however the IPC chose to carry them.
///
/// `Raw` is what the webview sends — a `Uint8Array` crosses as a body rather
/// than as a JSON array of several hundred thousand numbers, which is the
/// difference between a few hundred kilobytes and a few megabytes of text per
/// second of video. The JSON branch is the fallback for a host that did not
/// take the raw path, and it is strict: a value that is not a byte is an
/// error, never a silently dropped one.
fn bytes_of(body: &InvokeBody) -> Result<Vec<u8>, String> {
    match body {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        InvokeBody::Json(value) => {
            let array = value
                .as_array()
                .ok_or_else(|| "a video chunk has to be bytes".to_string())?;
            let mut out = Vec::with_capacity(array.len());
            for item in array {
                let n = item
                    .as_u64()
                    .filter(|n| *n <= 255)
                    .ok_or_else(|| "a video chunk has to be bytes".to_string())?;
                out.push(n as u8);
            }
            Ok(out)
        }
    }
}

/// The chunk number this append is, off the request's headers.
fn seq_of(request: &Request<'_>) -> Result<u32, String> {
    request
        .headers()
        .get("seq")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u32>().ok())
        .ok_or_else(|| "a video chunk has to say which chunk it is".to_string())
}

// ---------------------------------------------------------------------------
// The four steps, as functions. The commands under them are wrappers.
// ---------------------------------------------------------------------------

/// Open the file the picture will be written into.
///
/// Anything already open is discarded first: two recordings at once is not a
/// state the camera can reach (one take, one camera), and the way it WOULD
/// happen is a failure that left the last one open — in which case the old
/// file is an orphan and throwing it away is the right answer.
fn begin(
    app_data: &Path,
    jam_id: &str,
    container: &str,
    started_ms: u64,
    slot: &mut Option<ActiveVideo>,
) -> Result<(), String> {
    if let Some(stale) = slot.take() {
        drop(stale.file);
        let _ = fs::remove_file(&stale.path);
    }
    let container = Container::parse(container)?;
    // Through `take_dir`, which is `take.rs`'s character rule and fingerprint:
    // the path can only ever land inside `takes/`, and a song's pictures can
    // only ever land in that song's own directory.
    let dir = take_dir(app_data, jam_id)?;
    fs::create_dir_all(&dir).map_err(|e| format!("could not make room for the video: {e}"))?;
    sweep_pending(&dir);

    let path = dir.join(pending_name(started_ms, container));
    let file = fs::File::create(&path).map_err(|e| format!("could not start the video: {e}"))?;
    *slot = Some(ActiveVideo {
        path,
        file,
        next_seq: 0,
        pending: BTreeMap::new(),
        pending_bytes: 0,
        bytes: 0,
    });
    Ok(())
}

/// Append one chunk, in its turn.
fn append(seq: u32, chunk: Vec<u8>, slot: &mut Option<ActiveVideo>) -> Result<u64, String> {
    let active = slot
        .as_mut()
        .ok_or_else(|| "nothing is recording a video".to_string())?;

    if seq < active.next_seq {
        // Already written. A retry after a reply that never arrived, and
        // writing it twice would corrupt the file — so this is a success.
        return Ok(active.bytes);
    }
    if seq > active.next_seq {
        if active.pending.len() >= MAX_PENDING_CHUNKS
            || active.pending_bytes + chunk.len() > MAX_PENDING_BYTES
        {
            return Err(format!(
                "video chunk {seq} arrived too far ahead of {}",
                active.next_seq
            ));
        }
        active.pending_bytes += chunk.len();
        active.pending.insert(seq, chunk);
        return Ok(active.bytes);
    }

    let mut next = Some(chunk);
    while let Some(bytes) = next.take() {
        if active.bytes + bytes.len() as u64 > MAX_VIDEO_BYTES {
            return Err("this video has grown further than the app will write".into());
        }
        active
            .file
            .write_all(&bytes)
            .map_err(|e| format!("could not write the video: {e}"))?;
        active.bytes += bytes.len() as u64;
        active.next_seq += 1;
        if let Some(waiting) = active.pending.remove(&active.next_seq) {
            active.pending_bytes -= waiting.len();
            next = Some(waiting);
        }
    }
    Ok(active.bytes)
}

/// Close the file and file it under the take it belongs to.
fn finish(
    app_data: &Path,
    take_id: &str,
    offset_ms: Option<f64>,
    slot: &mut Option<ActiveVideo>,
) -> Result<TakeVideo, String> {
    let active = slot
        .take()
        .ok_or_else(|| "nothing is recording a video".to_string())?;
    let ActiveVideo {
        path, file, bytes, ..
    } = active;
    // Flushed and closed before anything else looks at it: a rename of a file
    // with a buffer still in it is a rename of a truncated video.
    drop(file);

    if bytes == 0 {
        // A camera that produced nothing. The same rule the engine applies to
        // a take with no audio in it: a row that plays nothing is worse than
        // no row, and a zero-byte file the shelf offers a picture for is worse
        // than both.
        let _ = fs::remove_file(&path);
        return Err("that recording has no picture in it".into());
    }

    // The take has to exist and has to be a take — `take_path` is `find_take`,
    // so the id goes through the character rule and the dry/video refusal, and
    // a picture can only ever be filed beside a WAV that is really there.
    //
    // A failure here takes the recording with it rather than leaving it under
    // the pending name. There is no take to attach it to, nothing on screen
    // would list it, and a recording of somebody playing that the app holds and
    // does not show is the one thing the opt-in promise forbids.
    let wav = match take_path(app_data, take_id) {
        Ok(path) => path,
        Err(e) => {
            let _ = fs::remove_file(&path);
            return Err(e);
        }
    };
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("webm")
        .to_string();
    let stem = wav
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "that take has no name".to_string())?;
    let target = wav.with_file_name(format!("{stem}{VIDEO_SUFFIX}.{extension}"));

    // Not `rename` across the two paths blindly: they are in the same
    // directory by construction, and a target that already exists is a second
    // recording for one take, which means the first is an orphan.
    if target.exists() {
        let _ = fs::remove_file(&target);
    }
    fs::rename(&path, &target).map_err(|e| {
        // The recording is still on disk under the pending name; sweeping it
        // is the next `begin`'s job rather than a second failure here.
        format!("could not file the video beside its take: {e}")
    })?;

    if let Some(ms) = offset_ms.filter(|ms| ms.is_finite()) {
        write_offset(&wav, ms);
    }

    Ok(TakeVideo {
        path: target.to_string_lossy().into_owned(),
        bytes,
        offset_ms: offset_ms.filter(|ms| ms.is_finite()),
    })
}

/// Put the measured offset into the take's own sidecar.
///
/// As a `Value` rather than through `JamTake`: the sidecar is the take's
/// record and this module owns one field of it, so round-tripping it through a
/// struct would quietly drop any field a newer — or older — version of the app
/// wrote. A sidecar that cannot be read or written is not a failure worth
/// giving the picture up over; the review then starts the two level and offers
/// the nudge, which is what it does for every take recorded before this
/// existed anyway.
fn write_offset(wav: &Path, offset_ms: f64) {
    let sidecar = wav.with_extension("json");
    let Ok(text) = fs::read_to_string(&sidecar) else {
        eprintln!("[take-video] no sidecar to record the offset in");
        return;
    };
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&text) else {
        eprintln!("[take-video] the take's sidecar is not readable");
        return;
    };
    let Some(map) = value.as_object_mut() else {
        return;
    };
    let Some(number) = serde_json::Number::from_f64(offset_ms) else {
        return;
    };
    map.insert("videoOffsetMs".into(), serde_json::Value::Number(number));
    match serde_json::to_string_pretty(&value) {
        Ok(out) => {
            if let Err(e) = fs::write(&sidecar, out) {
                eprintln!("[take-video] could not record the offset: {e}");
            }
        }
        Err(e) => eprintln!("[take-video] could not record the offset: {e}"),
    }
}

/// Throw the recording away. What the camera does when the take turned out to
/// be nothing, when the pass was abandoned, or when anything at all went wrong
/// — a picture with no take beside it is the orphan this module exists to
/// prevent.
fn discard(slot: &mut Option<ActiveVideo>) -> Result<(), String> {
    let Some(active) = slot.take() else {
        // Nothing to discard is what a UI sends when it is making sure, and
        // it is not a failure.
        return Ok(());
    };
    drop(active.file);
    fs::remove_file(&active.path)
        .map_err(|e| format!("could not remove the video: {e}"))
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Start writing the camera's recording to disk.
///
/// The webview has already been given the camera by the OS at this point; this
/// is only the file. `started_ms` names the pending file, so two windows
/// arming a camera in the same millisecond is the only collision available and
/// the second would simply take the first's name — which is why `begin`
/// discards whatever was open rather than trusting the name to be unique.
#[tauri::command]
pub fn take_video_begin(
    jam_id: String,
    container: String,
    started_ms: u64,
    video: State<VideoState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let app_data = home(&app_handle)?;
    let mut slot = video.slot().unwrap_or_else(|e| e.into_inner());
    begin(&app_data, &jam_id, &container, started_ms, &mut slot)
}

/// Append one `MediaRecorder` chunk. The body is the bytes; the `seq` header
/// is which chunk it is.
#[tauri::command]
pub fn take_video_append(request: Request<'_>, video: State<VideoState>) -> Result<u64, String> {
    let seq = seq_of(&request)?;
    let chunk = bytes_of(request.body())?;
    let mut slot = video.slot().unwrap_or_else(|e| e.into_inner());
    append(seq, chunk, &mut slot)
}

/// Close the recording and file it under the take it belongs to.
#[tauri::command]
pub fn take_video_finish(
    take_id: String,
    offset_ms: Option<f64>,
    video: State<VideoState>,
    app_handle: AppHandle,
) -> Result<TakeVideo, String> {
    let app_data = home(&app_handle)?;
    let mut slot = video.slot().unwrap_or_else(|e| e.into_inner());
    finish(&app_data, &take_id, offset_ms, &mut slot)
}

/// Throw the recording away.
#[tauri::command]
pub fn take_video_discard(video: State<VideoState>) -> Result<(), String> {
    let mut slot = video.slot().unwrap_or_else(|e| e.into_inner());
    discard(&mut slot)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::take::{safe_dir_name, TAKES_DIR};

    /// A temp directory of this test's own, removed and remade so a rerun
    /// starts clean. The same shape `take.rs`'s tests use.
    fn tmp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yames-take-video-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A take on disk for a picture to be filed beside: a WAV with a header
    /// and a sidecar, which is what `find_take` and `write_offset` look for.
    fn a_take(root: &Path, jam: &str, id: &str) -> PathBuf {
        let dir = root.join(TAKES_DIR).join(safe_dir_name(jam).unwrap());
        fs::create_dir_all(&dir).unwrap();
        let wav = dir.join(format!("{id}.wav"));
        fs::write(&wav, [0u8; 44]).unwrap();
        fs::write(
            wav.with_extension("json"),
            format!(r#"{{"id":"{id}","jamId":"{jam}","createdAt":1,"durationSec":1.0,"path":"x"}}"#),
        )
        .unwrap();
        wav
    }

    fn slot_of(root: &Path, jam: &str) -> Option<ActiveVideo> {
        let mut slot = None;
        begin(root, jam, "webm", 1_000, &mut slot).unwrap();
        slot
    }

    #[test]
    fn chunks_land_in_the_order_they_were_numbered() {
        let root = tmp_dir("order");
        a_take(&root, "song1", "5000");
        let mut slot = slot_of(&root, "song1");

        append(0, b"aaa".to_vec(), &mut slot).unwrap();
        append(1, b"bbb".to_vec(), &mut slot).unwrap();
        append(2, b"ccc".to_vec(), &mut slot).unwrap();
        let record = finish(&root, "5000", Some(-12.5), &mut slot).unwrap();

        assert_eq!(record.bytes, 9);
        assert_eq!(fs::read(&record.path).unwrap(), b"aaabbbccc");
    }

    /// The whole reason appends are numbered. A chunk that overtakes its
    /// neighbour must not be written where the neighbour goes — the result
    /// would be a video that plays for a few seconds and then stops, which is
    /// a bug nobody would attribute to the order of two IPC calls.
    #[test]
    fn a_chunk_that_arrives_early_waits_for_its_turn() {
        let root = tmp_dir("early");
        a_take(&root, "song1", "5000");
        let mut slot = slot_of(&root, "song1");

        append(0, b"aaa".to_vec(), &mut slot).unwrap();
        append(2, b"ccc".to_vec(), &mut slot).unwrap();
        // Nothing of chunk 2 is on disk yet: the file is still three bytes.
        assert_eq!(append(2, b"ccc".to_vec(), &mut slot).unwrap(), 3);
        append(1, b"bbb".to_vec(), &mut slot).unwrap();
        let record = finish(&root, "5000", None, &mut slot).unwrap();

        assert_eq!(fs::read(&record.path).unwrap(), b"aaabbbccc");
    }

    #[test]
    fn a_chunk_too_far_ahead_is_refused_rather_than_held() {
        let root = tmp_dir("ahead");
        a_take(&root, "song1", "5000");
        let mut slot = slot_of(&root, "song1");
        append(0, b"a".to_vec(), &mut slot).unwrap();
        for seq in 2..(2 + MAX_PENDING_CHUNKS as u32) {
            append(seq, b"x".to_vec(), &mut slot).unwrap();
        }
        assert!(append(99, b"x".to_vec(), &mut slot).is_err());
    }

    #[test]
    fn the_picture_is_filed_under_the_take_and_the_pending_name_is_gone() {
        let root = tmp_dir("file-it");
        a_take(&root, "song1", "5000");
        let mut slot = slot_of(&root, "song1");
        let pending = slot.as_ref().unwrap().path.clone();
        append(0, b"video".to_vec(), &mut slot).unwrap();
        let record = finish(&root, "5000", Some(-30.0), &mut slot).unwrap();

        assert!(!pending.exists(), "the pending file is still there");
        assert!(record.path.ends_with("5000.video.webm"), "{}", record.path);
        assert!(Path::new(&record.path).is_file());
    }

    /// The one field of the take's record this module owns. Written into the
    /// sidecar the engine already wrote, without disturbing anything else in
    /// it — a take that lost its position or its dry stem to a video offset
    /// would be a worse bug than having no offset at all.
    #[test]
    fn the_offset_goes_into_the_takes_own_sidecar() {
        let root = tmp_dir("offset");
        let wav = a_take(&root, "song1", "5000");
        let mut slot = slot_of(&root, "song1");
        append(0, b"video".to_vec(), &mut slot).unwrap();
        finish(&root, "5000", Some(-42.5), &mut slot).unwrap();

        let text = fs::read_to_string(wav.with_extension("json")).unwrap();
        let value: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["videoOffsetMs"].as_f64(), Some(-42.5));
        assert_eq!(value["id"].as_str(), Some("5000"), "the rest survived");
    }

    #[test]
    fn discarding_leaves_nothing_behind() {
        let root = tmp_dir("discard");
        a_take(&root, "song1", "5000");
        let mut slot = slot_of(&root, "song1");
        let pending = slot.as_ref().unwrap().path.clone();
        append(0, b"video".to_vec(), &mut slot).unwrap();
        discard(&mut slot).unwrap();

        assert!(!pending.exists());
        assert!(slot.is_none());
        // And discarding again is not a failure — it is a UI making sure.
        assert!(discard(&mut slot).is_ok());
    }

    /// A camera that opened and produced nothing. `MediaRecorder` does this
    /// when a device is unplugged between `start()` and the first frame.
    #[test]
    fn a_recording_with_no_picture_in_it_is_not_kept() {
        let root = tmp_dir("empty");
        a_take(&root, "song1", "5000");
        let mut slot = slot_of(&root, "song1");
        let pending = slot.as_ref().unwrap().path.clone();

        assert!(finish(&root, "5000", None, &mut slot).is_err());
        assert!(!pending.exists());
    }

    /// The path rule, from both ends. A jam id and a take id both become part
    /// of a path, and `take.rs`'s character rule is what keeps that path
    /// inside `takes/`.
    #[test]
    fn a_path_outside_the_takes_directory_is_refused() {
        let root = tmp_dir("escape");
        a_take(&root, "song1", "5000");

        let mut slot = None;
        // A jam id that tries to climb out sanitises — the separators become
        // underscores — and gets a fingerprint, so it lands in a directory of
        // its own directly inside `takes/` rather than anywhere above it. The
        // name it gets may still CONTAIN dots; what it may not contain is a
        // separator, which is the whole of the traversal guarantee.
        begin(&root, "../../evil", "webm", 1, &mut slot).unwrap();
        let path = slot.as_ref().unwrap().path.clone();
        let takes = root.join(TAKES_DIR);
        assert_eq!(
            path.parent().and_then(|p| p.parent()),
            Some(takes.as_path()),
            "escaped to {}",
            path.display()
        );
        let dir_name = path
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap();
        assert!(!dir_name.contains('/') && !dir_name.contains('\\'), "{dir_name}");
        append(0, b"x".to_vec(), &mut slot).unwrap();

        // A take id that tries the same is refused outright, because an id
        // that had to be sanitised is not the id it claims to be. The
        // recording is given up with it, so nothing is left half-written.
        assert!(finish(&root, "../5000", None, &mut slot).is_err());
        assert!(slot.is_none());
        assert!(!path.exists(), "a recording with no take was kept");

        // ...and so is a take that does not exist.
        let mut second = None;
        begin(&root, "song1", "webm", 2, &mut second).unwrap();
        let orphan = second.as_ref().unwrap().path.clone();
        append(0, b"x".to_vec(), &mut second).unwrap();
        assert!(finish(&root, "9999", None, &mut second).is_err());
        assert!(!orphan.exists());
    }

    /// A picture may never be addressed as a take. `take.rs` enforces it; this
    /// asserts it from the side that creates the name, so a change to the
    /// suffix here cannot quietly open the door there.
    #[test]
    fn a_picture_is_not_an_addressable_take() {
        let root = tmp_dir("not-a-take");
        a_take(&root, "song1", "5000");
        let mut slot = slot_of(&root, "song1");
        append(0, b"video".to_vec(), &mut slot).unwrap();
        finish(&root, "5000", None, &mut slot).unwrap();

        assert!(take_path(&root, "5000.video").is_err());
        assert!(crate::take::delete_take(&root, "5000.video").is_err());
        // And deleting the take takes the picture with it.
        let video = root
            .join(TAKES_DIR)
            .join(safe_dir_name("song1").unwrap())
            .join("5000.video.webm");
        assert!(video.is_file());
        crate::take::delete_take(&root, "5000").unwrap();
        assert!(!video.exists(), "the picture outlived its take");
    }

    /// A crash mid-take leaves a `pending-` file. The next time the camera is
    /// armed is when it goes — an orphan recording of a person that nothing on
    /// screen lists is exactly what the opt-in promise forbids.
    #[test]
    fn arming_the_camera_clears_a_recording_a_crash_left_behind() {
        let root = tmp_dir("sweep");
        a_take(&root, "song1", "5000");
        let dir = root.join(TAKES_DIR).join(safe_dir_name("song1").unwrap());
        let orphan = dir.join("pending-123.video.webm");
        fs::write(&orphan, b"half a take").unwrap();

        let mut slot = None;
        begin(&root, "song1", "webm", 999, &mut slot).unwrap();
        assert!(!orphan.exists(), "the orphan survived");
        discard(&mut slot).unwrap();
    }

    #[test]
    fn only_the_two_containers_this_app_writes_are_accepted() {
        assert_eq!(Container::parse("mp4").unwrap().extension(), "mp4");
        assert_eq!(Container::parse("WebM").unwrap().extension(), "webm");
        assert!(Container::parse("../../etc/passwd").is_err());
        assert!(Container::parse("mkv").is_err());
    }

    #[test]
    fn a_chunk_is_bytes_whichever_way_it_crossed() {
        assert_eq!(
            bytes_of(&InvokeBody::Raw(vec![1, 2, 3])).unwrap(),
            vec![1, 2, 3]
        );
        assert_eq!(
            bytes_of(&InvokeBody::Json(serde_json::json!([1, 2, 3]))).unwrap(),
            vec![1, 2, 3]
        );
        assert!(bytes_of(&InvokeBody::Json(serde_json::json!([1, 300]))).is_err());
        assert!(bytes_of(&InvokeBody::Json(serde_json::json!("nope"))).is_err());
    }

    #[test]
    fn appending_with_nothing_open_is_an_error_not_a_file() {
        let mut slot = None;
        assert!(append(0, b"x".to_vec(), &mut slot).is_err());
        assert!(finish(Path::new("."), "5000", None, &mut slot).is_err());
    }
}
