//! "Send my test sessions to my computer" (card #123, test builds only): the
//! file side of it. The upload itself is the frontend's (`src/capture/inbox.ts`,
//! the webview's `fetch`, which has the platform's TLS on Windows and Android
//! alike); this module only lists the sessions on disk, zips one into the
//! outbox, hands the zip out in chunks, and on Android copies it to shared
//! storage (`Documents/Yames/capture`) so `adb pull` works on a build that is
//! not debuggable.
//!
//! Nothing here touches an audio or detector thread: every command that calls
//! in runs it on the blocking pool. Every id that comes from the webview is
//! checked with [`is_session_id`] before it becomes part of a path, and a
//! chunk is read only from `<outbox>/<id>.zip`, never from a path the webview
//! names.

use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use serde_json::Value;

/// The largest chunk the webview may ask for at once.
pub const CHUNK_MAX: u64 = 16 * 1024 * 1024;

/// Where a test build on Android leaves a copy of each zip (`adb pull` reads
/// it on any build; Android 11 and later let an app write its own files here
/// without a permission).
pub const ANDROID_SHARED_DIR: &str = "/storage/emulated/0/Documents/Yames/capture";

/// A name `Capture::start` makes (`20261120-134500`, `-2` after it), and
/// nothing that could leave a folder: ASCII letters, digits, `-`, `_`, at most 64.
pub fn is_session_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn check_id(id: &str) -> Result<(), String> {
    if is_session_id(id) {
        Ok(())
    } else {
        Err("not a recording session".into())
    }
}

/// A recording session on disk, for the outbox to decide what is still to send.
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionEntry {
    pub id: String,
    pub started_wall_ms: Option<f64>,
    pub ended_wall_ms: Option<f64>,
    /// The session on now: not to be zipped or sent yet.
    pub active: bool,
}

/// The sessions under `root` (`<app data>/capture`), oldest first. `active` is
/// the id of the session on now, if any.
pub fn list_sessions(root: &Path, active: Option<&str>) -> Vec<SessionEntry> {
    let Ok(rd) = std::fs::read_dir(root) else { return Vec::new() };
    let mut out: Vec<SessionEntry> = rd
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|e| {
            let id = e.file_name().to_str()?.to_owned();
            if !is_session_id(&id) {
                return None;
            }
            let doc: Value = serde_json::from_slice(&std::fs::read(e.path().join("session.json")).ok()?).ok()?;
            Some(SessionEntry {
                started_wall_ms: doc.get("startedWallMs").and_then(Value::as_f64),
                ended_wall_ms: doc.get("endedWallMs").and_then(Value::as_f64),
                active: active == Some(id.as_str()),
                id,
            })
        })
        .collect();
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

/// The zip of session `id` in `outbox`, made from `root/<id>` if it is not
/// there yet (written beside it and renamed, so a half-written zip is never
/// taken for one). Refused for the session on now. The zip and its size.
pub fn prepare(root: &Path, outbox: &Path, id: &str, active: Option<&str>) -> Result<(PathBuf, u64), String> {
    check_id(id)?;
    if active == Some(id) {
        return Err("the session is still recording".into());
    }
    let src = root.join(id);
    if !src.join("session.json").is_file() {
        return Err("no such recording session".into());
    }
    std::fs::create_dir_all(outbox).map_err(|e| e.to_string())?;
    let out = outbox.join(format!("{id}.zip"));
    if !out.is_file() {
        let tmp = outbox.join(format!("{id}.zip.part"));
        crate::capture::Capture::zip_session(&src, &tmp)?;
        std::fs::rename(&tmp, &out).map_err(|e| e.to_string())?;
    }
    let size = std::fs::metadata(&out).map_err(|e| e.to_string())?.len();
    Ok((out, size))
}

/// `len` bytes (at most [`CHUNK_MAX`]) of `<outbox>/<id>.zip` from `offset`;
/// fewer at its end, none past it.
pub fn read_chunk(outbox: &Path, id: &str, offset: u64, len: u64) -> Result<Vec<u8>, String> {
    check_id(id)?;
    let len = len.min(CHUNK_MAX);
    let mut f = std::fs::File::open(outbox.join(format!("{id}.zip"))).map_err(|e| e.to_string())?;
    let size = f.metadata().map_err(|e| e.to_string())?.len();
    if offset >= size {
        return Ok(Vec::new());
    }
    let n = len.min(size - offset) as usize;
    f.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; n];
    f.read_exact(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf)
}

/// The zip is on the computer: drop the outbox's copy (the session folder stays).
pub fn clear(outbox: &Path, id: &str) -> Result<(), String> {
    check_id(id)?;
    match std::fs::remove_file(outbox.join(format!("{id}.zip"))) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Copy the zip into `shared` as `yames-capture-<id>.zip`, unless one of that
/// size is there already. The copy's path.
pub fn copy_to_shared(zip: &Path, shared: &Path, id: &str) -> Result<PathBuf, String> {
    check_id(id)?;
    std::fs::create_dir_all(shared).map_err(|e| e.to_string())?;
    let dest = shared.join(format!("yames-capture-{id}.zip"));
    let size = std::fs::metadata(zip).map_err(|e| e.to_string())?.len();
    if std::fs::metadata(&dest).map(|m| m.len() == size).unwrap_or(false) {
        return Ok(dest);
    }
    let tmp = shared.join(format!("yames-capture-{id}.zip.part"));
    std::fs::copy(zip, &tmp).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;
    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yames-outbox-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn session(root: &Path, id: &str, ended: bool) {
        let d = root.join(id);
        std::fs::create_dir_all(d.join("takes")).unwrap();
        let doc = serde_json::json!({"session": id, "startedWallMs": 1.0, "endedWallMs": if ended { Some(2.0) } else { None }});
        std::fs::write(d.join("session.json"), doc.to_string()).unwrap();
        std::fs::write(d.join("takes/t1.f32"), vec![7u8; 100_000]).unwrap();
    }

    #[test]
    fn only_plain_names_are_session_ids() {
        for ok in ["20261120-134500", "20261120-134500-2", "a_b"] {
            assert!(is_session_id(ok), "{ok}");
        }
        for bad in ["", "..", "../x", "a/b", "a\\b", "a.b", "C:", "a b", "é", &"x".repeat(65), "a\0b"] {
            assert!(!is_session_id(bad), "{bad:?}");
        }
    }

    #[test]
    fn sessions_list_oldest_first_and_skip_what_is_not_one() {
        let root = scratch("list");
        session(&root, "20261120-020000", true);
        session(&root, "20261120-010000", false);
        std::fs::create_dir_all(root.join("not.a.session")).unwrap();
        std::fs::create_dir_all(root.join("20261120-030000")).unwrap(); // no session.json
        std::fs::write(root.join("yames-capture-x.zip"), b"zip").unwrap();
        let list = list_sessions(&root, Some("20261120-020000"));
        assert_eq!(list.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), ["20261120-010000", "20261120-020000"]);
        assert_eq!(list[0].ended_wall_ms, None);
        assert!(list[1].active && !list[0].active);
        assert!(list_sessions(&root.join("missing"), None).is_empty());
    }

    #[test]
    fn a_session_zips_once_into_the_outbox_and_reads_back_in_chunks() {
        let root = scratch("zip");
        let outbox = root.join("outbox");
        session(&root, "20261120-010000", true);
        let (zip, size) = prepare(&root, &outbox, "20261120-010000", None).unwrap();
        assert_eq!(zip, outbox.join("20261120-010000.zip"));
        let whole = std::fs::read(&zip).unwrap();
        assert_eq!(whole.len() as u64, size);
        let mut back = Vec::new();
        let mut off = 0;
        loop {
            let c = read_chunk(&outbox, "20261120-010000", off, 30_000).unwrap();
            if c.is_empty() {
                break;
            }
            off += c.len() as u64;
            back.extend(c);
        }
        assert_eq!(back, whole);
        assert!(read_chunk(&outbox, "20261120-010000", size + 10, 10).unwrap().is_empty());
        // a second prepare reuses it
        let before = std::fs::metadata(&zip).unwrap().modified().unwrap();
        prepare(&root, &outbox, "20261120-010000", None).unwrap();
        assert_eq!(std::fs::metadata(&zip).unwrap().modified().unwrap(), before);
        assert!(!outbox.join("20261120-010000.zip.part").exists());
        clear(&outbox, "20261120-010000").unwrap();
        assert!(!zip.exists());
        assert!(root.join("20261120-010000/session.json").exists(), "the session folder stays");
        clear(&outbox, "20261120-010000").unwrap();
    }

    #[test]
    fn nothing_outside_the_outbox_is_read_and_the_live_session_is_not_sent() {
        let root = scratch("guard");
        let outbox = root.join("outbox");
        session(&root, "20261120-010000", false);
        std::fs::write(root.join("secret.zip"), b"secret").unwrap();
        for bad in ["../secret", "..", "/etc/passwd", "outbox/../secret"] {
            assert!(read_chunk(&outbox, bad, 0, 10).is_err(), "{bad}");
            assert!(prepare(&root, &outbox, bad, None).is_err(), "{bad}");
            assert!(clear(&outbox, bad).is_err(), "{bad}");
            assert!(copy_to_shared(&root.join("secret.zip"), &root, bad).is_err(), "{bad}");
        }
        assert!(prepare(&root, &outbox, "20261120-010000", Some("20261120-010000")).is_err());
        assert!(prepare(&root, &outbox, "20261120-999999", None).is_err());
        // a chunk is capped whatever is asked
        session(&root, "20261120-020000", true);
        prepare(&root, &outbox, "20261120-020000", None).unwrap();
        assert!(read_chunk(&outbox, "20261120-020000", 0, u64::MAX).unwrap().len() as u64 <= CHUNK_MAX);
    }

    #[test]
    fn the_shared_copy_is_made_once() {
        let root = scratch("shared");
        let outbox = root.join("outbox");
        session(&root, "20261120-010000", true);
        let (zip, _) = prepare(&root, &outbox, "20261120-010000", None).unwrap();
        let shared = root.join("Documents/Yames/capture");
        let dest = copy_to_shared(&zip, &shared, "20261120-010000").unwrap();
        assert_eq!(dest, shared.join("yames-capture-20261120-010000.zip"));
        assert_eq!(std::fs::read(&dest).unwrap(), std::fs::read(&zip).unwrap());
        let before = std::fs::metadata(&dest).unwrap().modified().unwrap();
        copy_to_shared(&zip, &shared, "20261120-010000").unwrap();
        assert_eq!(std::fs::metadata(&dest).unwrap().modified().unwrap(), before);
    }
}
