use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

/// Play mode derived from `onset_efficiency`. ≥ 0.65 → Structured
/// (the player is locking in to the beat grid); < 0.65 → Noodling
/// (free improvisation against the metronome).
#[derive(Clone, Copy, Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlayMode {
    Structured,
    Noodling,
}

/// Status of model components on disk.
#[derive(Debug, Clone, Serialize)]
pub struct ModelStatus {
    /// Whether the brain model is downloaded
    #[serde(rename = "brainReady")]
    pub brain_ready: bool,
    /// Which tier is downloaded (null if none)
    #[serde(rename = "brainTier")]
    pub brain_tier: Option<String>,
    /// Size on disk in bytes
    #[serde(rename = "brainSizeBytes")]
    pub brain_size_bytes: u64,
    /// Which model family the downloaded brain belongs to.
    ///
    /// `"qwen3"` when the downloader left a `model.json` marker saying so,
    /// `"legacy"` for anything installed before T04 (Qwen2.5-1.5B /
    /// Phi-3.5-mini — no marker on disk), and `null` when no brain is
    /// downloaded at all. Drives the Settings "Update brain" affordance;
    /// the old file is never deleted automatically.
    #[serde(rename = "brainFamily")]
    pub brain_family: Option<String>,
    /// Whether voice models are downloaded
    #[serde(rename = "voiceReady")]
    pub voice_ready: bool,
    /// Size on disk in bytes
    #[serde(rename = "voiceSizeBytes")]
    pub voice_size_bytes: u64,
    /// Whether the Studio tier may be offered on this machine.
    #[serde(rename = "studioRecommended")]
    pub studio_recommended: bool,
    /// Whether the Standard tier may be offered on this machine.
    #[serde(rename = "standardRecommended")]
    pub standard_recommended: bool,
    /// Whether the installed brain belongs to a superseded family and
    /// should be replaced ("Update brain").
    #[serde(rename = "brainUpdateRecommended")]
    pub brain_update_recommended: bool,
    /// Each local tier on its own: both can be on disk side by side
    /// (`models/brain/<tier>/model.bin`). Always one entry per tier in
    /// `BRAIN_TIERS`, in that order. The single-brain fields above stay for
    /// older callers: `brain_ready` is "any tier", `brain_tier` / `brain_family`
    /// the first tier on disk, `brain_size_bytes` all brains together, and
    /// `brain_update_recommended` "any tier wants updating".
    pub tiers: Vec<TierStatus>,
    /// Bytes free on the volume that holds the models, for the selector's
    /// low-storage check. `null` when the platform cannot say.
    #[serde(rename = "freeBytes")]
    pub free_bytes: Option<u64>,
}

/// One tier's brain on disk (`ModelStatus::tiers`).
#[derive(Debug, Clone, Serialize)]
pub struct TierStatus {
    pub tier: String,
    #[serde(rename = "onDisk")]
    pub on_disk: bool,
    /// The brain's directory on disk (weights + marker); 0 when absent.
    #[serde(rename = "sizeBytes")]
    pub size_bytes: u64,
    /// `"qwen3"`, `"legacy"`, or null when the tier is not on disk.
    pub family: Option<String>,
    /// This tier's weights are a superseded family ("Update brain").
    #[serde(rename = "updateRecommended")]
    pub update_recommended: bool,
    /// Bytes of a paused download of this tier's pinned file, kept for the
    /// next start to resume from; 0 when there is none.
    #[serde(rename = "partialBytes")]
    pub partial_bytes: u64,
    /// What the pinned download weighs, when the tier has a pinned file.
    #[serde(rename = "downloadBytes")]
    pub download_bytes: Option<u64>,
    /// Whether a SHA-256 is pinned for this tier's file (the check runs
    /// after the transfer, before the file is adopted).
    #[serde(rename = "checksumPinned")]
    pub checksum_pinned: bool,
}

/// RAM floor for the Studio tier (Qwen3-8B Q4_K_M, ~8 GB resident).
///
/// ROADMAP §3 says "16 GB", but *installed* and *reported* RAM are not
/// the same number: Windows and Linux subtract firmware and integrated-GPU
/// reservations before `GlobalMemoryStatusEx` / `MemTotal` ever sees them,
/// so a real 16 GB laptop answers ~15.7–15.9 GiB and a literal 16 GiB
/// comparison locked those machines out of a tier they run fine. The gate
/// is the honest floor with the reservation slack taken off.
pub const STUDIO_MIN_MEMORY_MB: u64 = 15 * 1024;

/// RAM floor for the Standard tier (Qwen3-4B Q4_K_M, ~4 GB resident plus
/// the app). Same reservation slack off a nominal 8 GB machine.
pub const STANDARD_MIN_MEMORY_MB: u64 = 7 * 1024 + 512;

/// Tier gates and the migration prompt, decided in one place.
///
/// These used to be TS constants (`brainTiers.ts`, `coachRecommendation.ts`)
/// duplicating `CURRENT_BRAIN_FAMILY` and a 16 GiB threshold that the
/// frontend could not see was wrong. Rust owns the numbers; the frontend
/// consumes the booleans.
///
/// `memory_mb == 0` means the platform query failed. That reads as
/// "unknown", never as "too small": a false "your machine is too small"
/// is a worse failure than letting someone with 16 GB fetch 4.7 GiB.
fn recommendations(memory_mb: u64, brain_ready: bool, brain_family: Option<&str>) -> (bool, bool, bool) {
    let studio = memory_mb == 0 || memory_mb >= STUDIO_MIN_MEMORY_MB;
    let standard = memory_mb == 0 || memory_mb >= STANDARD_MIN_MEMORY_MB;
    // A ready brain with no classifiable family is treated like a legacy
    // install rather than silently left on unknown weights.
    let update = brain_ready && brain_family != Some(CURRENT_BRAIN_FAMILY);
    (studio, standard, update)
}

/// Minimum plausible sizes for everything the installer downloads, in one
/// table.
///
/// Same defence in every case: HuggingFace behind a corporate proxy, a VPN
/// with TLS interception, or a CDN having a bad day will happily serve a
/// few KB of HTML with a 200, and curl saves it as a completed download.
/// The asset then fails at *use* time with an opaque error instead of at
/// install time with a useful one. Floors sit well under the real assets
/// so a future re-quantisation or minor release does not trip them.
pub mod floors {
    /// Piper release archive (macOS ~19 MB, Windows ~23 MB, Linux ~26 MB).
    pub const PIPER_ARCHIVE: u64 = 15 * 1024 * 1024;
    /// A Piper medium voice `.onnx` (~60 MB).
    pub const VOICE_ONNX: u64 = 30 * 1024 * 1024;
    /// Its `.onnx.json` sidecar (~5 KB).
    pub const VOICE_ONNX_JSON: u64 = 1024;
    /// Brain weights, per tier (Standard 2.50 GB / Studio 5.03 GB as of
    /// 2026-09-02).
    pub const BRAIN_STANDARD: u64 = 2 * 1024 * 1024 * 1024;
    pub const BRAIN_STUDIO: u64 = 4 * 1024 * 1024 * 1024;
}

/// The current brain family. Bump this (and `family_for_url`) when the
/// tiers move to another model generation — every user on an older family
/// is then offered "Update brain".
pub const CURRENT_BRAIN_FAMILY: &str = "qwen3";

/// Name of the per-download marker written next to `model.bin`.
pub const BRAIN_MARKER: &str = "model.json";

/// The local tiers, in the order the selector lists them. The ids are
/// frozen: `full` is persisted in the settings store and on disk.
pub const BRAIN_TIERS: [&str; 2] = ["standard", "full"];

pub fn is_brain_tier(tier: &str) -> bool {
    BRAIN_TIERS.contains(&tier)
}

/// One pinned brain download: where it comes from, what it weighs, and its
/// SHA-256 when one is known.
#[derive(Debug, Clone, Copy)]
pub struct BrainArtifact {
    pub tier: &'static str,
    pub url: &'static str,
    pub bytes: u64,
    /// Lowercase hex. `None` ships the mechanism without a hash: the size is
    /// still checked exactly, the content is not.
    pub sha256: Option<&'static str>,
}

/// The brain files, one per tier, pinned beside their URLs.
///
/// `useCoachDownload.ts` `MODEL_URLS` sends these URLs (a vitest test,
/// `brainArtifacts.test.ts`, holds the two lists equal). Sizes and hashes
/// are the ones Hugging Face publishes for these files: the repository
/// tree API (`/api/models/Qwen/Qwen3-4B-GGUF/tree/main` and
/// `/api/models/Qwen/Qwen3-8B-GGUF/tree/main`) lists each LFS file's
/// `lfs.oid`, which is the SHA-256 of its content, and `lfs.size`; read
/// 2026-11-20. If Qwen re-uploads a file under the same name the check
/// fails and says so; the pin is then updated here, deliberately.
pub const BRAIN_ARTIFACTS: [BrainArtifact; 2] = [
    BrainArtifact {
        tier: "standard",
        url: "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf",
        bytes: 2_497_280_256,
        sha256: Some("7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5"),
    },
    BrainArtifact {
        tier: "full",
        url: "https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf",
        bytes: 5_027_783_488,
        sha256: Some("d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785"),
    },
];

/// The pinned artifact for this exact request, if the URL is the pinned
/// one for the tier. Any other URL downloads as before, unchecked.
pub fn artifact_for(tier: &str, url: &str) -> Option<&'static BrainArtifact> {
    BRAIN_ARTIFACTS.iter().find(|a| a.tier == tier && a.url == url)
}

fn pinned_for_tier(tier: &str) -> Option<&'static BrainArtifact> {
    BRAIN_ARTIFACTS.iter().find(|a| a.tier == tier)
}

/// Classify a download URL into a brain family.
///
/// The URL is the only thing the backend knows about *what* it is being
/// asked to fetch — `useCoachDownload.ts` owns `MODEL_URLS` — so the
/// family is derived from it at download time and frozen into the marker.
/// Reading it back later from the GGUF metadata would be more principled
/// but needs the model loaded, which is exactly what the Settings screen
/// cannot do on a build without `coach-llm`.
pub fn family_for_url(url: &str) -> &'static str {
    if url.to_ascii_lowercase().contains("qwen3") {
        CURRENT_BRAIN_FAMILY
    } else {
        "legacy"
    }
}

/// Minimum plausible size for a downloaded brain, per tier. Unknown tiers
/// fall back to the lower floor rather than blocking a download outright.
pub fn min_brain_bytes(tier: &str) -> u64 {
    match tier {
        "full" => floors::BRAIN_STUDIO,
        // "standard" and anything unrecognised
        _ => floors::BRAIN_STANDARD,
    }
}

/// Human-readable name for a brain that has not been loaded (or whose
/// GGUF carries no `general.name`), built from the download marker.
///
/// The tier ids are frozen — `full` is persisted in the settings store and
/// in `models/brain/tier`, so only the *label* moved to "Studio" — which
/// is why the mapping lives here rather than being re-derived at every
/// display site.
pub fn brain_display_name(family: Option<&str>, tier: Option<&str>) -> String {
    let model = match (family, tier) {
        (Some(CURRENT_BRAIN_FAMILY), Some("full")) => "Qwen3 8B",
        (Some(CURRENT_BRAIN_FAMILY), _) => "Qwen3 4B",
        _ => "brain",
    };
    model.to_string()
}

// ---------------------------------------------------------------------------
// Where the brains live: one directory per tier
// ---------------------------------------------------------------------------
//
//   models/brain/standard/{model.bin, model.json, tier, model.<url-key>.part}
//   models/brain/full/{…the same…}
//
// Until leg ms2 both tiers wrote `models/brain/model.bin`, so only one could
// be on disk. That single brain is adopted in place as its tier by
// `adopt_legacy_brain`, with a rename inside the same directory tree (never a
// copy that needs the space twice, never a re-download), and a crash at any
// point of it is finished by the next call. Every entry point that touches
// the brains (status, load, download, delete) runs it first.

/// The brain on disk the loader should load: `tier`'s, or (no tier asked
/// for, an older caller) the first tier on disk. Returns the directory
/// holding `model.bin` with the family and tier its marker records.
pub struct BrainOnDisk {
    pub dir: PathBuf,
    pub model: PathBuf,
    pub family: Option<String>,
    pub tier: String,
}

pub fn locate_brain(app: &AppHandle, tier: Option<&str>) -> Result<BrainOnDisk, String> {
    let brain_root = models_dir(app)?.join("brain");
    if let Err(e) = adopt_legacy_brain(&brain_root) {
        eprintln!("[yames] could not adopt the single brain as its tier: {e}");
    }
    locate_brain_in(&brain_root, tier)
}

fn locate_brain_in(brain_root: &Path, tier: Option<&str>) -> Result<BrainOnDisk, String> {
    let wanted: Vec<&str> = match tier {
        Some(t) if is_brain_tier(t) => vec![t],
        Some(t) => return Err(format!("unknown brain tier {t:?}")),
        None => BRAIN_TIERS.to_vec(),
    };
    for t in wanted {
        if let Some(dir) = tier_brain_dir(brain_root, t) {
            return Ok(BrainOnDisk {
                model: dir.join("model.bin"),
                family: read_brain_family(&dir),
                dir,
                tier: t.to_string(),
            });
        }
    }
    // Nothing on disk: the path the tier would have, so the loader's own
    // "no model downloaded" error names it.
    let t = tier.unwrap_or(BRAIN_TIERS[0]);
    let dir = brain_root.join(t);
    Ok(BrainOnDisk {
        model: dir.join("model.bin"),
        family: None,
        dir,
        tier: t.to_string(),
    })
}

/// The directory holding `tier`'s `model.bin`, if it is on disk: its own
/// directory, or, when an adoption could not run (see `adopt_legacy_brain`),
/// the old single place if that brain is this tier.
fn tier_brain_dir(brain_root: &Path, tier: &str) -> Option<PathBuf> {
    let own = brain_root.join(tier);
    if own.join("model.bin").is_file() {
        return Some(own);
    }
    if brain_root.join("model.bin").is_file() && legacy_tier(brain_root) == tier {
        return Some(brain_root.to_path_buf());
    }
    None
}

/// Which tier the single brain of an older install is. Its `tier` file;
/// else the tier its marker records; else its size (the Studio file is the
/// only one past the Studio floor). Never fails: an unreadable tier still
/// has to go somewhere, and a misfiled brain is only a label.
fn legacy_tier(brain_root: &Path) -> String {
    let from_file = std::fs::read_to_string(brain_root.join("tier"))
        .ok()
        .map(|t| t.trim().to_string())
        .filter(|t| is_brain_tier(t));
    if let Some(t) = from_file {
        return t;
    }
    let from_marker = read_brain_marker(brain_root)
        .and_then(|m| m.get("tier").and_then(serde_json::Value::as_str).map(str::to_string))
        .filter(|t| is_brain_tier(t));
    if let Some(t) = from_marker {
        return t;
    }
    let bytes = std::fs::metadata(brain_root.join("model.bin"))
        .map(|m| m.len())
        .unwrap_or(0);
    if bytes >= floors::BRAIN_STUDIO {
        "full".to_string()
    } else {
        "standard".to_string()
    }
}

/// What `adopt_legacy_brain` found and did.
#[derive(Debug, PartialEq, Eq)]
pub enum Adoption {
    /// No single brain in the old place: nothing to do (the usual case).
    Nothing,
    /// The single brain now lives in its tier's directory.
    Adopted(String),
    /// The tier's directory already holds a brain. Neither file was
    /// touched; the old one stays where it is (and is not loaded).
    Conflict(String),
}

/// One lock for every adoption: status, load and download may all call it
/// at once, and two renames of the same file must not race.
static ADOPTION: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Adopt the single brain of an older install as its tier, in place.
///
/// The order is what makes it crash-safe; each step is either idempotent
/// or atomic, so a run stopped anywhere is finished by the next one:
///
///   1. `brain/<tier>/` is created and its small files written there (a
///      `tier` file, a copy of the `model.json` marker) and synced.
///   2. `brain/model.bin` is renamed to `brain/<tier>/model.bin`: one
///      rename inside the same directory tree, atomic, no second copy of
///      the weights. Before it, the old place still holds the brain and
///      step 1 is simply redone; after it, the new place does.
///   3. The old `tier` and `model.json` are removed, but only once the
///      weights are in the tier's directory with their own copies.
///
/// Paused downloads (`model.<url-key>.part`) of the pinned files move with
/// their tier the same way, when the tier's directory has none of its own.
///
/// Nothing here deletes or truncates a brain: the only removals are the two
/// small metadata files of step 3. If the tier's directory already holds a
/// brain (only possible by hand), nothing moves and `Conflict` says so.
pub fn adopt_legacy_brain(brain_root: &Path) -> Result<Adoption, String> {
    let _guard = ADOPTION.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    adopt_partials(brain_root);
    let legacy_model = brain_root.join("model.bin");
    if !legacy_model.is_file() {
        tidy_legacy_metadata(brain_root);
        return Ok(Adoption::Nothing);
    }
    let tier = legacy_tier(brain_root);
    let dir = brain_root.join(&tier);
    if dir.join("model.bin").exists() {
        return Ok(Adoption::Conflict(tier));
    }
    std::fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    // Step 1. A marker left in the tier's directory by an earlier, stopped
    // run is rewritten from the old place's, or removed when the old place
    // has none (a pre-T04 brain: no marker, read as legacy).
    write_synced(&dir.join("tier"), tier.as_bytes())?;
    let old_marker = brain_root.join(BRAIN_MARKER);
    let new_marker = dir.join(BRAIN_MARKER);
    match std::fs::read(&old_marker) {
        Ok(bytes) => write_synced(&new_marker, &bytes)?,
        Err(_) => {
            let _ = std::fs::remove_file(&new_marker);
        }
    }
    // Step 2.
    std::fs::rename(&legacy_model, dir.join("model.bin")).map_err(|e| {
        format!(
            "move {} to {}: {e}",
            legacy_model.display(),
            dir.join("model.bin").display()
        )
    })?;
    sync_dir(&dir);
    sync_dir(brain_root);
    // Step 3.
    tidy_legacy_metadata(brain_root);
    Ok(Adoption::Adopted(tier))
}

/// The old place's `tier` and `model.json`, once no brain is left there and
/// some tier directory holds weights with its own copies. Anything else is
/// left alone: these two files describe nothing once the weights are gone,
/// but they are only removed when that is certain.
fn tidy_legacy_metadata(brain_root: &Path) {
    if brain_root.join("model.bin").exists() {
        return;
    }
    let old_tier = brain_root.join("tier");
    let old_marker = brain_root.join(BRAIN_MARKER);
    if !old_tier.exists() && !old_marker.exists() {
        return;
    }
    let adopted = BRAIN_TIERS.iter().any(|t| {
        let d = brain_root.join(t);
        d.join("model.bin").is_file() && d.join("tier").is_file()
    });
    if adopted {
        let _ = std::fs::remove_file(old_tier);
        let _ = std::fs::remove_file(old_marker);
    }
}

/// Paused downloads of the pinned files in the old place move to their
/// tier's directory (a rename; never over a part already there).
fn adopt_partials(brain_root: &Path) {
    for a in &BRAIN_ARTIFACTS {
        let old = part_path_for(&brain_root.join("model.bin"), a.url);
        if !old.is_file() {
            continue;
        }
        let dir = brain_root.join(a.tier);
        let new = part_path_for(&dir.join("model.bin"), a.url);
        if new.exists() || std::fs::create_dir_all(&dir).is_err() {
            continue;
        }
        if let Err(e) = std::fs::rename(&old, &new) {
            eprintln!("[yames] could not move {}: {e}", old.display());
        }
    }
}

fn write_synced(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let mut f = std::fs::File::create(path).map_err(|e| format!("write {}: {e}", path.display()))?;
    f.write_all(bytes)
        .and_then(|()| f.sync_all())
        .map_err(|e| format!("write {}: {e}", path.display()))
}

/// Make a rename durable where the platform allows syncing a directory
/// (unix). Best effort: the rename itself is already atomic.
fn sync_dir(dir: &Path) {
    #[cfg(unix)]
    if let Ok(d) = std::fs::File::open(dir) {
        let _ = d.sync_all();
    }
    #[cfg(not(unix))]
    let _ = dir;
}

/// Bytes free on the volume holding `path` (or its nearest existing
/// ancestor), as the current user may use them. `None` when the platform
/// cannot say.
///
/// unix (Linux, macOS, Android): `statvfs`, `f_bavail × f_frsize`.
/// Windows: `GetDiskFreeSpaceExW` (windows-sys `Win32_Storage_FileSystem`),
/// the bytes available to the caller, which honours quotas.
pub fn free_space_bytes(path: &Path) -> Option<u64> {
    let mut at = path;
    while !at.exists() {
        at = at.parent()?;
    }
    free_space_at(at)
}

#[cfg(unix)]
#[allow(clippy::unnecessary_cast)]
fn free_space_at(path: &Path) -> Option<u64> {
    use std::os::unix::ffi::OsStrExt;
    let c = std::ffi::CString::new(path.as_os_str().as_bytes()).ok()?;
    // SAFETY: `statvfs` fills a caller-owned struct from a NUL-terminated
    // path that outlives the call.
    let mut st: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(c.as_ptr(), &mut st) } != 0 {
        return None;
    }
    Some((st.f_bavail as u64).saturating_mul(st.f_frsize as u64))
}

#[cfg(windows)]
fn free_space_at(path: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let mut available: u64 = 0;
    // SAFETY: a NUL-terminated wide path that outlives the call, and one
    // caller-owned u64 out-parameter; the other two may be null.
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    (ok != 0).then_some(available)
}

#[cfg(not(any(unix, windows)))]
fn free_space_at(_path: &Path) -> Option<u64> {
    None
}

/// The brain the coach loaded last, so deleting a tier unloads the model
/// only when it is that tier's (Windows will not unlink a mapped file).
/// `None` after an unload, or when nothing has been loaded.
static RESIDENT_BRAIN: std::sync::Mutex<Option<PathBuf>> = std::sync::Mutex::new(None);

pub fn note_resident_brain(dir: Option<PathBuf>) {
    *RESIDENT_BRAIN.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = dir;
}

/// Whether the resident model may be `tier`'s: true when it is, and when
/// it is not known (an unknown is unloaded rather than unlinked under it).
pub fn resident_may_be(app: &AppHandle, tier: &str) -> bool {
    let recorded = RESIDENT_BRAIN
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clone();
    let Some(recorded) = recorded else {
        return true;
    };
    let Ok(models) = models_dir(app) else {
        return true;
    };
    let root = models.join("brain");
    recorded == root.join(tier) || (recorded == root && legacy_tier(&root) == tier)
}

/// Total physical RAM in MB, or 0 when the platform query fails.
///
/// ROADMAP §3 offers the Studio tier only at ≥ 16 GB. Implemented against
/// the OS directly rather than pulling in `sysinfo`: all three platforms
/// are two lines, and the crate would add ~15 transitive dependencies to
/// answer one question asked once per Settings render.
pub fn system_memory_mb() -> u64 {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::SystemInformation::{
            GlobalMemoryStatusEx, MEMORYSTATUSEX,
        };
        // SAFETY: `GlobalMemoryStatusEx` fills a caller-owned struct whose
        // `dwLength` we set to its own size, as the API requires.
        let mut status: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
        status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        if unsafe { GlobalMemoryStatusEx(&mut status) } != 0 {
            return status.ullTotalPhys / (1024 * 1024);
        }
        0
    }

    #[cfg(target_os = "macos")]
    {
        let mut bytes: u64 = 0;
        let mut len = std::mem::size_of::<u64>();
        let name = c"hw.memsize";
        // SAFETY: `sysctlbyname` writes at most `len` bytes into `bytes`.
        let rc = unsafe {
            libc::sysctlbyname(
                name.as_ptr(),
                std::ptr::addr_of_mut!(bytes).cast(),
                &mut len,
                std::ptr::null_mut(),
                0,
            )
        };
        if rc == 0 {
            return bytes / (1024 * 1024);
        }
        0
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        // /proc/meminfo rather than `libc::sysinfo` — no unsafe, and the
        // `MemTotal:` line is stable across every kernel Yames supports.
        std::fs::read_to_string("/proc/meminfo")
            .ok()
            .and_then(|text| parse_meminfo_total_kb(&text))
            .map(|kb| kb / 1024)
            .unwrap_or(0)
    }

    #[cfg(not(any(windows, unix)))]
    {
        0
    }
}

/// Pull `MemTotal:` (in kB) out of /proc/meminfo. Split out so it is
/// testable on any host, not just Linux.
#[cfg_attr(not(all(unix, not(target_os = "macos"))), allow(dead_code))]
fn parse_meminfo_total_kb(text: &str) -> Option<u64> {
    text.lines()
        .find(|l| l.starts_with("MemTotal:"))?
        .split_whitespace()
        .nth(1)?
        .parse::<u64>()
        .ok()
}

/// Get the models directory inside the app data dir.
fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    Ok(data_dir.join("models"))
}

/// Check which models are available on disk.
pub fn check_model_status(app: &AppHandle) -> Result<ModelStatus, String> {
    let dir = models_dir(app)?;
    let brain_root = dir.join("brain");
    if let Err(e) = adopt_legacy_brain(&brain_root) {
        eprintln!("[yames] could not adopt the single brain as its tier: {e}");
    }
    let voice_dir = dir.join("voice");

    let memory_mb = system_memory_mb();
    let tiers = tier_statuses(&brain_root, memory_mb);
    let first = tiers.iter().find(|t| t.on_disk);
    let brain_ready = first.is_some();
    let brain_tier = first.map(|t| t.tier.clone());
    let brain_family = first.and_then(|t| t.family.clone());
    let brain_size_bytes = tiers.iter().map(|t| t.size_bytes).sum();

    // `voice_ready` powers the UI banner + the "Download voices" button.
    // For the user to ACTUALLY hear a Piper voice, BOTH the Piper
    // engine binary AND at least the default (lessac) ONNX model must
    // be on disk — otherwise `tts::speak` silently falls back to macOS
    // `say`.
    //
    // We use the fast filesystem-only `piper_runnable` here (called on
    // every UI render of the coach card) — spawning a `piper --help`
    // subprocess every refresh would be wasteful. The deeper "binary
    // actually launches on this machine" probe is `piper_smoke_test`,
    // run once by the download pipeline; if that passed at install
    // time we trust the on-disk state.
    //
    // The ONNX is ALSO size-gated against `MIN_ONNX_BYTES` so a 1 KB
    // HTML error page that curl saved during a flaky download can't
    // pass for a working voice — the user's "fix corrupted voices"
    // case from 2026-05-18.
    let piper_ready = crate::tts::piper_runnable(&dir);
    let lessac_onnx = voice_dir.join("en_US-lessac-medium.onnx");
    let onnx_ready = lessac_onnx
        .metadata()
        .map(|m| m.len() >= crate::tts::MIN_ONNX_BYTES)
        .unwrap_or(false);
    let voice_ready = piper_ready && onnx_ready;
    let voice_size_bytes = if voice_dir.exists() {
        dir_size(&voice_dir)
    } else {
        0
    };

    let (studio_recommended, standard_recommended, _) = recommendations(memory_mb, false, None);
    let brain_update_recommended = tiers.iter().any(|t| t.update_recommended);

    Ok(ModelStatus {
        brain_ready,
        brain_tier,
        brain_family,
        brain_size_bytes,
        voice_ready,
        voice_size_bytes,
        studio_recommended,
        standard_recommended,
        brain_update_recommended,
        free_bytes: free_space_bytes(&dir),
        tiers,
    })
}

/// Each tier's brain, as `check_model_status` reports it.
fn tier_statuses(brain_root: &Path, memory_mb: u64) -> Vec<TierStatus> {
    BRAIN_TIERS
        .iter()
        .map(|&tier| {
            let found = tier_brain_dir(brain_root, tier);
            // Family marker. Absent marker = installed before T04 = legacy,
            // which is the whole migration signal: the Phi-3-style prompt
            // those models want is gone, so their output would be full of
            // template artifacts.
            let family = found
                .as_ref()
                .map(|d| read_brain_family(d).unwrap_or_else(|| "legacy".to_string()));
            let size_bytes = match &found {
                // The old single place also holds other things (parts of
                // other downloads): only the brain's own files count there.
                Some(d) if d == brain_root => file_len(&d.join("model.bin")),
                Some(d) => dir_size(d).saturating_sub(partial_bytes(d, tier)),
                None => 0,
            };
            let (_, _, update_recommended) =
                recommendations(memory_mb, found.is_some(), family.as_deref());
            let pinned = pinned_for_tier(tier);
            TierStatus {
                tier: tier.to_string(),
                on_disk: found.is_some(),
                size_bytes,
                family,
                update_recommended,
                partial_bytes: partial_bytes(&brain_root.join(tier), tier),
                download_bytes: pinned.map(|a| a.bytes),
                checksum_pinned: pinned.is_some_and(|a| a.sha256.is_some()),
            }
        })
        .collect()
}

/// Bytes of the paused download of `tier`'s pinned file in `dir`.
fn partial_bytes(dir: &Path, tier: &str) -> u64 {
    pinned_for_tier(tier)
        .map(|a| file_len(&part_path_for(&dir.join("model.bin"), a.url)))
        .unwrap_or(0)
}

fn file_len(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

/// Read the `family` field out of the brain marker, if there is one.
/// A marker that exists but cannot be parsed is treated as no marker at
/// all — a corrupt marker should offer the user an update, not crash the
/// Settings screen.
fn read_brain_family(brain_dir: &std::path::Path) -> Option<String> {
    read_brain_marker(brain_dir)?
        .get("family")?
        .as_str()
        .map(std::string::ToString::to_string)
}

/// The marker, if it describes the weights beside it. A download writes its
/// marker just before it renames the new weights into place, so a crash
/// between the two can leave a new marker beside old weights: a marker
/// whose `bytes` disagree with `model.bin` is read as no marker (the
/// weights then read as legacy, which offers an update, never a load).
fn read_brain_marker(brain_dir: &std::path::Path) -> Option<serde_json::Value> {
    let raw = std::fs::read_to_string(brain_dir.join(BRAIN_MARKER)).ok()?;
    let marker: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let recorded = marker.get("bytes").and_then(serde_json::Value::as_u64);
    let model = brain_dir.join("model.bin");
    if let (Some(recorded), Ok(meta)) = (recorded, std::fs::metadata(&model)) {
        if meta.len() != recorded {
            return None;
        }
    }
    Some(marker)
}

/// True when the brain already on disk is the exact thing this download
/// was asked for — same family AND same tier — so the multi-gigabyte
/// fetch can be skipped.
///
/// The tier half matters as much as the family half: before T04 this
/// check was just `model.bin exists`, so a user on Standard who picked
/// Studio got the tier file rewritten to `full` and no new weights. The
/// UI then advertised Studio while the Standard model stayed resident.
fn brain_matches_request(brain_dir: &std::path::Path, url: &str, tier: &str) -> bool {
    let Some(marker) = read_brain_marker(brain_dir) else {
        return false;
    };
    marker.get("family").and_then(serde_json::Value::as_str) == Some(family_for_url(url))
        && marker.get("tier").and_then(serde_json::Value::as_str) == Some(tier)
}

/// Write the marker that records what was just installed. Best-effort:
/// a failure here only costs the user a spurious "Update brain" prompt,
/// so it is logged rather than failing an otherwise-good download.
#[cfg(test)]
fn write_brain_marker(dir: &std::path::Path, url: &str, tier: &str, bytes: u64) {
    write_brain_marker_checked(dir, url, tier, bytes, None);
}

/// The marker, with the SHA-256 the file was checked against when it was.
fn write_brain_marker_checked(
    dir: &std::path::Path,
    url: &str,
    tier: &str,
    bytes: u64,
    sha256: Option<&str>,
) {
    let mut marker = serde_json::json!({
        "family": family_for_url(url),
        "tier": tier,
        "url": url,
        "bytes": bytes,
    });
    if let Some(sha) = sha256 {
        marker["sha256"] = serde_json::Value::from(sha);
    }
    let path = dir.join(BRAIN_MARKER);
    if let Err(e) = write_synced(&path, marker.to_string().as_bytes()) {
        eprintln!(
            "[yames] Failed to write brain marker at {}: {e}",
            path.display(),
        );
    }
}

/// Write model data from the frontend to disk.
pub fn write_model_file(
    app: &AppHandle,
    component: &str,
    filename: &str,
    data: &[u8],
) -> Result<String, String> {
    let dir = models_dir(app)?;
    let component_dir = dir.join(component);
    std::fs::create_dir_all(&component_dir)
        .map_err(|e| format!("Failed to create directory: {e}"))?;
    let path = component_dir.join(filename);
    std::fs::write(&path, data).map_err(|e| format!("Failed to write file: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

/// Delete all downloaded models.
pub fn delete_models(app: &AppHandle) -> Result<(), String> {
    let dir = models_dir(app)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("Failed to delete models: {e}"))?;
    }
    Ok(())
}

/// Delete one tier's brain: its weights, marker and any paused download of
/// it. The player's own press in Settings → Coach; nothing else calls it.
/// The other tier, the voices and the speech engine are not touched.
pub fn delete_brain_tier(app: &AppHandle, tier: &str) -> Result<(), String> {
    if !is_brain_tier(tier) {
        return Err(format!("unknown brain tier {tier:?}"));
    }
    let brain_root = models_dir(app)?.join("brain");
    delete_brain_tier_in(&brain_root, tier)
}

fn delete_brain_tier_in(brain_root: &Path, tier: &str) -> Result<(), String> {
    // A brain still in the old single place is adopted first, so what is
    // removed is exactly the tier the player named.
    match adopt_legacy_brain(brain_root) {
        Ok(Adoption::Conflict(t)) if t == tier => {
            return Err(format!(
                "two {tier} brains are on disk ({} and {}); remove one by hand",
                brain_root.join("model.bin").display(),
                brain_root.join(tier).join("model.bin").display(),
            ));
        }
        Err(e) if legacy_tier(brain_root) == tier => {
            // It could not be moved, and it is the one the player asked to
            // delete: remove it where it is.
            eprintln!("[yames] deleting the {tier} brain in the old place: {e}");
            std::fs::remove_file(brain_root.join("model.bin"))
                .map_err(|e| format!("Failed to delete {tier} brain: {e}"))?;
            let _ = std::fs::remove_file(brain_root.join("tier"));
            let _ = std::fs::remove_file(brain_root.join(BRAIN_MARKER));
        }
        _ => {}
    }
    let dir = brain_root.join(tier);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("Failed to delete {tier} brain: {e}"))?;
    }
    Ok(())
}

/// Stop keeping a paused download: remove the `.part` of `url` for `tier`
/// (in the tier's directory, and in the old single place if one is left
/// there). Never touches `model.bin`.
pub fn discard_partial(app: &AppHandle, tier: &str, url: &str) -> Result<(), String> {
    if !is_brain_tier(tier) {
        return Err(format!("unknown brain tier {tier:?}"));
    }
    discard_partial_in(&models_dir(app)?.join("brain"), tier, url)
}

fn discard_partial_in(brain_root: &Path, tier: &str, url: &str) -> Result<(), String> {
    for dir in [brain_root.join(tier), brain_root.to_path_buf()] {
        let part = part_path_for(&dir.join("model.bin"), url);
        match std::fs::remove_file(&part) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("could not remove {}: {e}", part.display())),
        }
    }
    Ok(())
}

/// Get the models directory path (for frontend to know where files go).
pub fn get_models_path(app: &AppHandle) -> Result<String, String> {
    let dir = models_dir(app)?;
    Ok(dir.to_string_lossy().to_string())
}

/// Recursively compute directory size in bytes.
fn dir_size(path: &PathBuf) -> u64 {
    if !path.exists() {
        return 0;
    }
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                total += dir_size(&p);
            } else if let Ok(meta) = p.metadata() {
                total += meta.len();
            }
        }
    }
    total
}

// ---------------------------------------------------------------------------
// Backend model download (survives frontend hot-reloads)
// ---------------------------------------------------------------------------

/// Shared cancel flag for the active download.
pub type DownloadCancelFlag = Arc<AtomicBool>;

/// The running download's controls. `cancel` stops it and keeps what was
/// fetched (a pause: the next start resumes); `discard` set with it also
/// removes the partial file once the transfer has stopped (a cancel).
#[derive(Clone)]
pub struct DownloadControl {
    pub cancel: DownloadCancelFlag,
    pub discard: Arc<AtomicBool>,
    /// The brain tier and URL it fetches; `None` for a voice repair.
    pub tier: Option<String>,
    pub url: Option<String>,
}

impl DownloadControl {
    pub fn new(tier: Option<String>, url: Option<String>) -> Self {
        DownloadControl {
            cancel: Arc::new(AtomicBool::new(false)),
            discard: Arc::new(AtomicBool::new(false)),
            tier,
            url,
        }
    }
}

/// Progress event emitted to the frontend during download.
#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub component: String,
    #[serde(rename = "downloadedBytes")]
    pub downloaded_bytes: u64,
    #[serde(rename = "totalBytes")]
    pub total_bytes: u64,
    pub fraction: f64,
    pub done: bool,
    /// `"transfer"` while bytes arrive; `"checking"` while the brain's
    /// SHA-256 is computed, `fraction` and the bytes then counting the
    /// bytes hashed.
    pub stage: &'static str,
}

impl DownloadProgress {
    fn transfer(component: String, downloaded: u64, total: u64, fraction: f64, done: bool) -> Self {
        DownloadProgress {
            component,
            downloaded_bytes: downloaded,
            total_bytes: total,
            fraction,
            done,
            stage: "transfer",
        }
    }
}

/// Why a brain download stopped short.
#[derive(Debug, PartialEq, Eq)]
pub enum BrainFetchError {
    /// The player paused or cancelled.
    Cancelled,
    /// Not enough room on the models' volume for what is left to fetch.
    Space { need: u64, free: u64 },
    /// The file arrived whole and its SHA-256 is not the pinned one. The
    /// file was removed; nothing the player had was touched.
    Checksum,
    Failed(String),
}

impl From<String> for BrainFetchError {
    fn from(e: String) -> Self {
        if e == "cancelled" {
            BrainFetchError::Cancelled
        } else {
            BrainFetchError::Failed(e)
        }
    }
}

/// The `model-download-complete` payload for a brain download that stopped.
fn brain_failure_event(e: &BrainFetchError, discarded: bool) -> serde_json::Value {
    match e {
        BrainFetchError::Cancelled => {
            serde_json::json!({ "success": false, "cancelled": true, "discarded": discarded })
        }
        BrainFetchError::Space { need, free } => serde_json::json!({
            "success": false,
            "code": "space",
            "needBytes": need,
            "freeBytes": free,
            "error": format!("not enough free space: {need} bytes needed, {free} free"),
        }),
        BrainFetchError::Checksum => serde_json::json!({
            "success": false,
            "code": "checksum",
            "error": "the downloaded file did not match its published checksum and was removed",
        }),
        BrainFetchError::Failed(msg) => serde_json::json!({ "success": false, "error": msg }),
    }
}

/// Download a model file from `url` to the models directory.
/// Runs on a background thread. Emits "model-download-progress" events.
/// After the brain model, automatically downloads Piper binary + voice models.
/// Returns immediately. `control.cancel` can be set to abort (keeping the
/// partial file), with `control.discard` to also remove it.
///
/// The brain goes to its tier's own directory (`models/brain/<tier>/`), so
/// downloading one tier never touches the other's weights.
pub fn start_download(
    app: AppHandle,
    url: String,
    component: String,
    filename: String,
    tier: String,
    control: DownloadControl,
) {
    let cancel = control.cancel.clone();
    std::thread::spawn(move || {
        let models_dir = match app.path().app_data_dir() {
            Ok(d) => d.join("models"),
            Err(e) => {
                let _ = app.emit(
                    "model-download-complete",
                    serde_json::json!({ "success": false, "error": format!("{e}") }),
                );
                return;
            }
        };

        // Step 1: Download the brain model.
        //
        // Skipped only when what is on disk is exactly what was asked for
        // — right family, right tier, per the `model.json` marker. That
        // covers both T04 migrations (a legacy Qwen2.5/Phi-3.5 install has
        // no marker, so it re-downloads and "Update brain" actually
        // updates) and the tier switch that used to silently no-op.
        if component == "brain" {
            if let Err(e) = fetch_brain(&app, &models_dir, &url, &tier, &cancel) {
                let mut discarded = false;
                if e == BrainFetchError::Cancelled && control.discard.load(Ordering::Relaxed) {
                    // curl has been killed and waited for: the part is
                    // closed and may be removed on every platform.
                    discarded = discard_partial_in(&models_dir.join("brain"), &tier, &url).is_ok();
                }
                let _ = app.emit("model-download-complete", brain_failure_event(&e, discarded));
                return;
            }
        } else {
            // Not a brain: the one-file path as it always was.
            if let Err(e) = do_download(&app, &url, &component, &filename, &tier, &cancel, &component) {
                let event = if e == "cancelled" {
                    serde_json::json!({ "success": false, "cancelled": true })
                } else {
                    serde_json::json!({ "success": false, "error": e })
                };
                let _ = app.emit("model-download-complete", event);
                return;
            }
        }

        // Step 2: Download Piper binary + voices (if not already present)

        // Download Piper binary. The completeness check has to gate on
        // the dylibs too, not just the `piper` executable — an earlier
        // build shipped with a check that only verified `piper/piper`
        // existed. When a previous tarball extraction had dropped the
        // shared libraries (`libespeak-ng.1.dylib`,
        // `libonnxruntime.1.14.1.dylib`, `libpiper_phonemize.1.dylib`)
        // the executable was on disk but crashed at launch with
        // `dyld: Library not loaded`. The old check then skipped the
        // re-download because the binary "existed", leaving the user
        // permanently stuck. We now require all four files (binary +
        // three dylibs) and wipe the piper/ dir before re-extracting
        // so a partial leftover can't shadow the fresh tarball.
        // Capture engine/voice failures as we go so the final
        // `model-download-complete` event can report ACCURATE success
        // instead of falsely claiming the install is done. Before this
        // tracking was added, the function unconditionally emitted
        // `{ success: true }` at the end even when curl had failed on
        // every URL (e.g. behind a VPN that blocks HuggingFace), so
        // the UI showed "Practice coach available!" with no voices on
        // disk — silently broken. See the per-failure assignments
        // below and the final-state check at the end of this thread.
        let mut piper_error: Option<String> = None;
        let mut voice_errors: Vec<(String, String)> = Vec::new();

        let piper_dir = models_dir.join("piper");
        // Skip the engine install only if it already PASSES the smoke
        // test (binary launches, libraries resolve). Filesystem
        // presence isn't enough — a half-extracted or corrupted prior
        // install would silently pass a `.exists()` check and then
        // crash at speak time.
        if crate::tts::piper_smoke_test(&piper_dir).is_err() {
            // One shared installer for both entry points — download,
            // size-check, wipe, extract (tar.gz or zip depending on the
            // platform), per-OS fixups, smoke test, verified marker.
            if let Err(e) = install_piper_engine(&app, &models_dir, &cancel) {
                if e == "cancelled" {
                    let _ = app.emit(
                        "model-download-complete",
                        serde_json::json!({ "success": false, "cancelled": true }),
                    );
                    return;
                }
                eprintln!("[yames] Piper engine install failed: {e}");
                piper_error = Some(e.clone());
                let _ = app.emit(
                    "model-download-progress",
                    DownloadProgress {
                        component: format!("Piper TTS engine (failed: {e})"),
                        downloaded_bytes: 0,
                        total_bytes: 0,
                        fraction: 0.0,
                        done: true,
                        stage: "transfer",
                    },
                );
            }
        }

        // Download voice models
        let voice_dir = models_dir.join("voice");
        let _ = std::fs::create_dir_all(&voice_dir);
        for (voice_id, onnx_url, json_url) in crate::tts::voice_model_urls() {
            let onnx_name = format!("en_US-{voice_id}-medium.onnx");
            let json_name = format!("en_US-{voice_id}-medium.onnx.json");
            let onnx_path = voice_dir.join(&onnx_name);
            let json_path = voice_dir.join(&json_name);
            // Skip only if BOTH files are present AND big enough to be
            // real. Previously this was a `.exists()` check, which let
            // a 1 KB HTML error page (saved by a flaky earlier
            // download) shadow a real redownload — the user got stuck
            // with a "voice present but corrupted" state and no way
            // out except manually deleting the file. Size-gating
            // matches what `tts::list_voices` already does at runtime.
            if voice_already_valid(&onnx_path, &json_path) {
                continue;
            }
            // Wipe any partial/corrupt leftovers so the redownload
            // can't be poisoned by stale bytes mixed with new ones.
            let _ = std::fs::remove_file(&onnx_path);
            let _ = std::fs::remove_file(&json_path);
            if cancel.load(Ordering::Relaxed) {
                let _ = app.emit(
                    "model-download-complete",
                    serde_json::json!({ "success": false, "cancelled": true }),
                );
                return;
            }
            let label = format!("Voice: {voice_id}");
            let _ = app.emit(
                "model-download-progress",
                DownloadProgress {
                    component: label.clone(),
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    fraction: 0.0,
                    done: false,
                    stage: "transfer",
                },
            );
            // Download .onnx + validate. The size check after curl
            // catches the case where the server returned a 200 + tiny
            // HTML body (CDN error, captive portal, proxy block) which
            // curl happily saves as the "completed" download. Without
            // this, the corrupt file would slip through and the user
            // would hit silence-then-`say`-fallback at first speak.
            if let Err(e) = curl_download(&app, onnx_url, &onnx_path, &cancel, &label) {
                if e == "cancelled" {
                    let _ = app.emit(
                        "model-download-complete",
                        serde_json::json!({ "success": false, "cancelled": true }),
                    );
                    return;
                }
                eprintln!("[yames] Failed to download voice {voice_id}: {e}");
                let _ = app.emit(
                    "model-download-progress",
                    DownloadProgress {
                        component: format!("Voice: {voice_id} (failed: {e})"),
                        downloaded_bytes: 0,
                        total_bytes: 0,
                        fraction: 0.0,
                        done: true,
                        stage: "transfer",
                    },
                );
                voice_errors.push((voice_id.to_string(), e.clone()));
                continue;
            }
            if let Err(e) = verify_voice_onnx(&onnx_path) {
                eprintln!("[yames] Voice {voice_id} .onnx failed validation: {e}");
                let _ = std::fs::remove_file(&onnx_path);
                let _ = app.emit(
                    "model-download-progress",
                    DownloadProgress {
                        component: format!("Voice: {voice_id} (invalid: {e})"),
                        downloaded_bytes: 0,
                        total_bytes: 0,
                        fraction: 0.0,
                        done: true,
                        stage: "transfer",
                    },
                );
                voice_errors.push((voice_id.to_string(), e));
                continue;
            }
            // Download .onnx.json sidecar + validate. The sidecar is
            // small (~5 KB) so a truncated 0-byte or 1-byte file is
            // the most common failure; size check still catches it.
            if let Err(e) = curl_download(&app, json_url, &json_path, &cancel, &label) {
                if e == "cancelled" {
                    let _ = app.emit(
                        "model-download-complete",
                        serde_json::json!({ "success": false, "cancelled": true }),
                    );
                    return;
                }
                eprintln!("[yames] Failed to download voice {voice_id} sidecar: {e}");
                // Remove the orphaned .onnx so the next attempt
                // re-downloads both together — otherwise the next run
                // sees a valid .onnx and a missing .json and considers
                // the voice "valid".
                let _ = std::fs::remove_file(&onnx_path);
                voice_errors.push((voice_id.to_string(), format!("sidecar: {e}")));
                continue;
            }
            if let Err(e) = verify_voice_json(&json_path) {
                eprintln!("[yames] Voice {voice_id} .onnx.json failed validation: {e}");
                let _ = std::fs::remove_file(&onnx_path);
                let _ = std::fs::remove_file(&json_path);
                voice_errors.push((voice_id.to_string(), format!("sidecar: {e}")));
                continue;
            }
        }

        // Final state check. Before this was added the function emitted
        // `{ success: true }` unconditionally, which is how the "Practice
        // coach available!" banner showed up even when every curl call
        // had failed (e.g. behind a VPN that blocks HuggingFace) and
        // there were no voice files on disk. Now we surface the real
        // state: if Piper didn't install, that's the headline error; if
        // Piper is fine but one or more voices failed, report the
        // voices. Only when the engine is installed AND at least one
        // voice download succeeded do we emit success.
        // Final engine check — smoke test the binary so the success
        // signal matches reality (binary actually launches, libraries
        // resolve). If an upstream step recorded a specific error
        // already, prefer that; otherwise re-run the smoke test so
        // the error string we emit matches whatever's actually broken.
        let engine_check = crate::tts::piper_smoke_test(&piper_dir);
        if engine_check.is_err() || piper_error.is_some() {
            let err = piper_error
                .or_else(|| engine_check.err())
                .unwrap_or_else(|| "Speech engine install incomplete".to_string());
            // Append the OS-specific remediation sentence: on Windows
            // and Linux the failure modes (AV quarantine, a zip that no
            // extractor could open, missing espeak-ng-data) are nothing
            // like macOS's Gatekeeper story, and the raw error alone
            // gives the user nothing to act on.
            let hint = crate::tts::engine_missing_hint(&models_dir);
            let _ = app.emit(
                "model-download-complete",
                serde_json::json!({
                    "success": false,
                    "error": format!("Speech engine couldn't be installed: {err}. {hint}"),
                }),
            );
            return;
        }
        // Engine smoke test passed. Write the verified marker so hot-path
        // callers (`tts::piper_runnable`, used on every Settings render and
        // every voice-preview click) can trust the install without paying
        // a subprocess on each check. This is the cheap proxy for "we
        // ran `piper --help` and it didn't dyld-crash on this machine".
        let marker = piper_dir.join(crate::tts::PIPER_VERIFIED_MARKER);
        if let Err(e) = std::fs::write(&marker, b"") {
            eprintln!(
                "[yames] Failed to write piper verified marker at {}: {e}",
                marker.display(),
            );
        }
        if !voice_errors.is_empty() {
            let names = voice_errors
                .iter()
                .map(|(v, _)| v.as_str())
                .collect::<Vec<_>>()
                .join(", ");
            let first_err = &voice_errors[0].1;
            let _ = app.emit(
                "model-download-complete",
                serde_json::json!({
                    "success": false,
                    "error": format!("Voice download failed ({names}): {first_err}"),
                }),
            );
            return;
        }
        let _ = app.emit(
            "model-download-complete",
            serde_json::json!({ "success": true, "tier": tier }),
        );
    });
}

/// Command line for one download.
///
/// Split out from `curl_download` so the flags are assertable in a unit
/// test — the Studio brain is 4.7 GiB and the previous line could not
/// fetch it on ordinary broadband:
///
///   * `--max-time 600` is a *wall-clock* cap on the whole transfer, so a
///     4.7 GiB download failed after ten minutes no matter how healthy
///     the connection was, and `--retry 3` then restarted it from zero
///     three more times. Replaced by `--speed-time`/`--speed-limit`,
///     which abort only when the transfer has actually stalled
///     (< 10 KB/s sustained for 60 s).
///   * `-C -` is passed unconditionally rather than only when a `.part`
///     already exists. curl resumes from the local file's length, which
///     is 0 when it is absent — so the flag is a no-op on a fresh
///     download and the thing that saves the first 3 GiB on a retry.
/// Where the in-progress bytes for `url` live.
///
/// Keyed by the URL, not just by the destination: both brain tiers used
/// to land on `models/brain/model.bin` (each has its own directory since
/// leg ms2, and the key still guards a URL change), so a single `model.part` plus the
/// unconditional `-C -` below would let an abandoned 2.3 GiB Standard
/// download be resumed *into* a Studio request — producing a
/// Frankenstein file large enough to clear the size floor. A per-URL name
/// makes that impossible. Parts are renamed away on success; an abandoned
/// one is cleaned up by "Remove models".
fn part_path_for(dest: &std::path::Path, url: &str) -> PathBuf {
    // FNV-1a — a stable, dependency-free file-name key. Not a security
    // hash; collisions here would only mean sharing a resume buffer.
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in url.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x1000_0000_01b3);
    }
    dest.with_extension(format!("{hash:016x}.part"))
}

fn curl_args(url: &str, part_path: &std::path::Path) -> Vec<std::ffi::OsString> {
    use std::ffi::OsString;
    let mut args: Vec<OsString> = [
        "-L",
        "--retry",
        "3",
        "--retry-delay",
        "2",
        "--connect-timeout",
        "15",
        // Abort a stalled transfer, never a slow-but-moving one.
        "--speed-time",
        "60",
        "--speed-limit",
        "10240",
        // Resume whatever is already in the .part file.
        "-C",
        "-",
        "--progress-bar",
        "-o",
    ]
    .iter()
    .map(OsString::from)
    .collect();
    args.push(part_path.as_os_str().to_os_string());
    args.push(OsString::from(url));
    args
}

/// Download a file with curl, then rename it into place. Returns Ok(()) on
/// success.
fn curl_download(
    app: &AppHandle,
    url: &str,
    dest: &std::path::Path,
    cancel: &AtomicBool,
    label: &str,
) -> Result<(), String> {
    let part_path = part_path_for(dest, url);
    eprintln!("[yames] curl_download: url={url} dest={}", dest.display());
    curl_fetch(url, &part_path, cancel, None, &mut |downloaded, total, fraction| {
        let _ = app.emit(
            "model-download-progress",
            DownloadProgress::transfer(label.to_string(), downloaded, total, fraction, false),
        );
    })?;
    std::fs::rename(&part_path, dest).map_err(|e| format!("Failed to rename file: {e}"))?;
    Ok(())
}

/// Fetch `url` into `part_path` with curl, resuming what is already there.
/// Leaves the part where it is (on success, failure and cancel alike):
/// the caller decides what becomes of it.
///
/// `on_progress(downloaded, total, fraction)` at most every 200 ms. The
/// bytes are the part file's length, so they count what an earlier run
/// fetched too; with `expected` known the fraction is of the whole file
/// (curl's own percentage counts only what this run transfers, which on a
/// resume is not the whole).
fn curl_fetch(
    url: &str,
    part_path: &Path,
    cancel: &AtomicBool,
    expected: Option<u64>,
    on_progress: &mut dyn FnMut(u64, u64, f64),
) -> Result<(), String> {
    use std::process::{Command, Stdio};

    if cancel.load(Ordering::Relaxed) {
        return Err("cancelled".to_string());
    }

    let mut cmd = Command::new("curl");
    cmd.args(curl_args(url, &part_path))
        .stderr(Stdio::piped())
        .stdout(Stdio::null());

    // Log proxy env for debugging
    for var in &["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"] {
        if let Ok(val) = std::env::var(var) {
            eprintln!("[yames]   {var}={val}");
        }
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start curl: {e}"))?;
    let stderr = child.stderr.take().unwrap();

    // curl --progress-bar uses \r (carriage return) not \n, so read byte-by-byte
    let mut last_emit = std::time::Instant::now();
    let mut line_buf = String::new();
    let mut reader = std::io::BufReader::new(stderr);
    loop {
        use std::io::Read;
        let mut byte = [0u8; 1];
        match reader.read(&mut byte) {
            Ok(0) => break, // EOF
            Ok(_) => {
                if byte[0] == b'\r' || byte[0] == b'\n' {
                    if !line_buf.is_empty() {
                        if cancel.load(Ordering::Relaxed) {
                            let _ = child.kill();
                            let _ = child.wait();
                            return Err("cancelled".to_string());
                        }
                        if let Some(pct) = parse_curl_progress(&line_buf) {
                            if last_emit.elapsed().as_millis() > 200 {
                                let downloaded = file_len(part_path);
                                let (total, fraction) = match expected {
                                    Some(total) if total > 0 => {
                                        (total, (downloaded as f64 / total as f64).min(1.0))
                                    }
                                    _ => (0, pct / 100.0),
                                };
                                on_progress(downloaded, total, fraction);
                                last_emit = std::time::Instant::now();
                            }
                        }
                        line_buf.clear();
                    }
                } else {
                    line_buf.push(byte[0] as char);
                }
            }
            Err(_) => break,
        }
    }

    let status = child.wait().map_err(|e| format!("curl failed: {e}"))?;
    if !status.success() {
        // The `.part` file is deliberately LEFT on disk. Deleting it threw
        // away every byte already fetched, so a Studio download that died
        // at 4 GiB started again from zero on the next attempt; keeping it
        // is what makes the unconditional `-C -` above worth having. The
        // size floors (`min_brain_bytes`, `verify_voice_onnx`) are what
        // stop a junk `.part` from ever being promoted to the real name.
        return Err(format!("curl exited with status {status}"));
    }

    if !part_path.exists() {
        return Err("curl completed but no file was written".to_string());
    }
    Ok(())
}

/// Fetch, check and adopt one tier's brain, in its own directory.
///
///   1. A paused download of this file in the old single place moves to
///      the tier's directory (`adopt_legacy_brain` also adopts an older
///      install's brain first, so nothing is ever fetched over it).
///   2. Free space: with the file's size pinned, the bytes still to fetch
///      must fit on the volume, or nothing starts.
///   3. The transfer resumes the tier's `.part` (skipped when the part is
///      already the pinned size: a pause during the check).
///   4. `finish_brain_part` checks size and SHA-256 and renames the part
///      over `model.bin`; until that rename the weights on disk are
///      whatever they were.
fn fetch_brain(
    app: &AppHandle,
    models_dir: &Path,
    url: &str,
    tier: &str,
    cancel: &AtomicBool,
) -> Result<(), BrainFetchError> {
    if !is_brain_tier(tier) {
        return Err(BrainFetchError::Failed(format!("unknown brain tier {tier:?}")));
    }
    let brain_root = models_dir.join("brain");
    match adopt_legacy_brain(&brain_root) {
        Ok(Adoption::Conflict(t)) if t == tier => {
            return Err(BrainFetchError::Failed(format!(
                "a {tier} brain is still in {} and another in {}; nothing was downloaded",
                brain_root.display(),
                brain_root.join(tier).display(),
            )));
        }
        // A brain that could not be moved must not be fetched over.
        Err(e) if brain_root.join("model.bin").is_file() => {
            return Err(BrainFetchError::Failed(format!(
                "the brain already on disk could not be moved to its own folder: {e}"
            )));
        }
        _ => {}
    }
    let dir = brain_root.join(tier);
    let dest = dir.join("model.bin");
    if dest.is_file() && brain_matches_request(&dir, url, tier) {
        // Already exactly this file: only the voices may be missing.
        return Ok(());
    }
    std::fs::create_dir_all(&dir).map_err(|e| BrainFetchError::Failed(format!("Failed to create dir: {e}")))?;
    let artifact = artifact_for(tier, url);
    let part = part_path_for(&dest, url);
    let expected = artifact.map(|a| a.bytes);

    if let (Some(total), Some(free)) = (expected, free_space_bytes(&dir)) {
        let need = total.saturating_sub(file_len(&part));
        if free < need {
            return Err(BrainFetchError::Space { need, free });
        }
    }

    let emit = |downloaded: u64, total: u64, fraction: f64, stage: &'static str| {
        let _ = app.emit(
            "model-download-progress",
            DownloadProgress {
                component: "brain".to_string(),
                downloaded_bytes: downloaded,
                total_bytes: total,
                fraction,
                done: false,
                stage,
            },
        );
    };
    if expected.is_none() || expected != Some(file_len(&part)) {
        eprintln!("[yames] brain download: tier={tier} url={url} part={}", part.display());
        curl_fetch(url, &part, cancel, expected, &mut |d, t, f| emit(d, t, f, "transfer"))?;
    }
    finish_brain_part(&dir, &part, url, tier, artifact, min_brain_bytes(tier), cancel, &mut |d, t| {
        emit(d, t, if t > 0 { d as f64 / t as f64 } else { 0.0 }, "checking")
    })?;
    let bytes = file_len(&dest);
    let _ = app.emit(
        "model-download-progress",
        DownloadProgress::transfer("brain".to_string(), bytes, bytes, 1.0, true),
    );
    Ok(())
}

/// Check a fetched part and adopt it as the tier's `model.bin`.
///
/// With a pinned artifact the size must be exact: shorter is kept (curl
/// said it was done, but the next start can still resume it), longer is
/// removed (no resume can fix it). Without one, the tier's size floor
/// stands in, as before. Then the SHA-256, when one is pinned: hashed in
/// 8 MiB chunks on this (the download's) thread, `on_hash(done, total)`
/// after each, the cancel flag read between chunks (a pause here keeps the
/// whole part; the next start skips the transfer and checks again). A
/// mismatch removes the part: it is whole, so resuming it fetches nothing.
///
/// Only then are the marker and tier file written and the part renamed
/// over `model.bin`, the one atomic step that changes what is on disk.
#[allow(clippy::too_many_arguments)]
fn finish_brain_part(
    dir: &Path,
    part: &Path,
    url: &str,
    tier: &str,
    artifact: Option<&BrainArtifact>,
    floor: u64,
    cancel: &AtomicBool,
    on_hash: &mut dyn FnMut(u64, u64),
) -> Result<(), BrainFetchError> {
    let bytes = file_len(part);
    match artifact {
        Some(a) if bytes < a.bytes => {
            return Err(BrainFetchError::Failed(format!(
                "the download stopped at {bytes} of {} bytes; try again to resume it",
                a.bytes
            )));
        }
        Some(a) if bytes > a.bytes => {
            let _ = std::fs::remove_file(part);
            return Err(BrainFetchError::Failed(format!(
                "the download is {bytes} bytes, larger than the {} published; it was removed",
                a.bytes
            )));
        }
        Some(_) => {}
        None if bytes < floor => {
            // A truncated or proxy-substituted file is removed so the next
            // attempt starts clean.
            let _ = std::fs::remove_file(part);
            return Err(BrainFetchError::Failed(format!(
                "downloaded model is only {bytes} bytes (expected at least {} GB) — the file may be corrupted or intercepted by a proxy",
                floor / (1024 * 1024 * 1024),
            )));
        }
        None => {}
    }
    let mut verified: Option<&str> = None;
    if let Some(expected) = artifact.and_then(|a| a.sha256) {
        let actual = sha256_file(part, cancel, on_hash)?;
        if !actual.eq_ignore_ascii_case(expected) {
            eprintln!(
                "[yames] brain checksum mismatch for {tier}: expected {expected}, got {actual}"
            );
            let _ = std::fs::remove_file(part);
            return Err(BrainFetchError::Checksum);
        }
        verified = Some(expected);
    }
    write_brain_marker_checked(dir, url, tier, bytes, verified);
    write_synced(&dir.join("tier"), tier.as_bytes())
        .map_err(|e| BrainFetchError::Failed(format!("Failed to write tier: {e}")))?;
    std::fs::rename(part, dir.join("model.bin"))
        .map_err(|e| BrainFetchError::Failed(format!("Failed to rename file: {e}")))?;
    sync_dir(dir);
    Ok(())
}

/// SHA-256 of a file, lowercase hex, read in 8 MiB chunks. Returns
/// `Err("cancelled")` (as a `BrainFetchError::Cancelled`) when the cancel
/// flag is set between chunks.
fn sha256_file(
    path: &Path,
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(u64, u64),
) -> Result<String, BrainFetchError> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let mut file = std::fs::File::open(path)
        .map_err(|e| BrainFetchError::Failed(format!("open {}: {e}", path.display())))?;
    let total = file.metadata().map(|m| m.len()).unwrap_or(0);
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 8 * 1024 * 1024];
    let mut done: u64 = 0;
    let mut last = std::time::Instant::now();
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err(BrainFetchError::Cancelled);
        }
        let n = file
            .read(&mut buf)
            .map_err(|e| BrainFetchError::Failed(format!("read {}: {e}", path.display())))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        done += n as u64;
        if last.elapsed().as_millis() > 200 {
            on_progress(done, total);
            last = std::time::Instant::now();
        }
    }
    on_progress(done, total);
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

fn do_download(
    app: &AppHandle,
    url: &str,
    component: &str,
    filename: &str,
    tier: &str,
    cancel: &AtomicBool,
    label: &str,
) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?
        .join("models")
        .join(component);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {e}"))?;

    // The brain no longer comes this way (`fetch_brain` owns it, per tier);
    // this is the plain one-file path for any other component.
    let path = dir.join(filename);
    curl_download(app, url, &path, cancel, label)?;

    // Write the tier marker file
    let tier_path = dir.join("tier");
    std::fs::write(&tier_path, tier).map_err(|e| format!("Failed to write tier: {e}"))?;

    // Final progress event
    let _ = app.emit(
        "model-download-progress",
        DownloadProgress::transfer(label.to_string(), 0, 0, 1.0, true),
    );

    Ok(())
}

// `piper_install_complete` used to live here as a hard-coded list of
// required files (`piper` binary + three dylibs). That schema went
// stale when upstream Piper changed its macOS tarball layout
// (the dylibs are now either statically linked or shipped as helper
// binaries), permanently false-flagging working installs as
// "engine missing — required dylibs missing". The completeness check
// is now `crate::tts::piper_smoke_test`, which probes the engine by
// actually running `piper --help` and looking for dyld errors in
// stderr. Forward-compatible with any future tarball reorg as long
// as the binary still exists and runs.

/// Re-download (or repair) a single voice. Drives the Piper engine
/// install first if it's missing / partial — the engine and the voice
/// files share a directory so a corrupted Piper extraction is what
/// usually masquerades as "voice broken" from the user's POV.
/// Then downloads the voice's `.onnx` + `.onnx.json` sidecar,
/// overwriting any partial/corrupted file already on disk.
///
/// Emits the same `model-download-progress` / `model-download-complete`
/// events as the full `start_download` so the existing UI works
/// unchanged. The complete event omits `tier` so the frontend's
/// "tier completed" branch doesn't false-fire — a repair leaves the
/// active brain tier untouched.
pub fn start_voice_repair(app: AppHandle, voice_id: String, cancel: DownloadCancelFlag) {
    std::thread::spawn(move || {
        let models_dir = match app.path().app_data_dir() {
            Ok(d) => d.join("models"),
            Err(e) => {
                let _ = app.emit(
                    "model-download-complete",
                    serde_json::json!({ "success": false, "error": format!("{e}") }),
                );
                return;
            }
        };

        // Step 1: Piper engine. The "robotic voice / no audio" bug
        // user reports almost always trace back to a partial tarball
        // extraction, not a missing voice file — so the repair path
        // re-extracts the engine first, then the voice. The wipe-before-
        // extract is what fixed the user's case on 2026-05-18 (orphan
        // `piper` binary on disk, all three dylibs missing).
        let piper_dir = models_dir.join("piper");
        if crate::tts::piper_smoke_test(&piper_dir).is_err() {
            // Same shared installer `start_download` uses. This block
            // used to be a near-verbatim copy that had already drifted
            // (it wiped `piper/` BEFORE downloading, destroying a
            // working install whenever the network was down) — one
            // implementation now covers both entry points and all three
            // OSes.
            if let Err(e) = install_piper_engine(&app, &models_dir, &cancel) {
                if e == "cancelled" {
                    let _ = app.emit(
                        "model-download-complete",
                        serde_json::json!({ "success": false, "cancelled": true }),
                    );
                    return;
                }
                let hint = crate::tts::engine_missing_hint(&models_dir);
                let _ = app.emit(
                    "model-download-complete",
                    serde_json::json!({
                        "success": false,
                        "error": format!("Piper engine: {e}. {hint}"),
                    }),
                );
                return;
            }
        }

        // Step 2: the named voice. Look up its URLs against the
        // catalog; an unknown id is a programmer error from the
        // frontend, surface it as a complete-event with `success:false`
        // rather than silently no-op so the UI banner reads correctly.
        let voice_entry = crate::tts::voice_model_urls()
            .into_iter()
            .find(|(id, _, _)| *id == voice_id);
        let (id_str, onnx_url, json_url) = match voice_entry {
            Some(v) => (v.0.to_string(), v.1.to_string(), v.2.to_string()),
            None => {
                let _ = app.emit(
                    "model-download-complete",
                    serde_json::json!({
                        "success": false,
                        "error": format!("Unknown voice id: {voice_id}"),
                    }),
                );
                return;
            }
        };

        let voice_dir = models_dir.join("voice");
        let _ = std::fs::create_dir_all(&voice_dir);
        let onnx_path = voice_dir.join(format!("en_US-{id_str}-medium.onnx"));
        let json_path = voice_dir.join(format!("en_US-{id_str}-medium.onnx.json"));

        // ALWAYS remove any existing file first. The repair path is the
        // user's "this voice is corrupted" escape hatch — silently
        // skipping because a too-small file already exists would defeat
        // the whole point.
        let _ = std::fs::remove_file(&onnx_path);
        let _ = std::fs::remove_file(&json_path);

        let label = format!("Voice: {id_str}");
        let _ = app.emit(
            "model-download-progress",
            DownloadProgress::transfer(label.clone(), 0, 0, 0.0, false),
        );
        if let Err(e) = curl_download(&app, &onnx_url, &onnx_path, &cancel, &label) {
            if e == "cancelled" {
                let _ = app.emit(
                    "model-download-complete",
                    serde_json::json!({ "success": false, "cancelled": true }),
                );
                return;
            }
            let _ = app.emit(
                "model-download-complete",
                serde_json::json!({ "success": false, "error": format!("Voice {id_str}: {e}") }),
            );
            return;
        }
        // Size-validate the .onnx. Same rationale as the bulk
        // pipeline: catches CDN error pages saved as 200 OK, partial
        // truncations, and proxy-stripped bodies.
        if let Err(e) = verify_voice_onnx(&onnx_path) {
            let _ = std::fs::remove_file(&onnx_path);
            let _ = app.emit(
                "model-download-complete",
                serde_json::json!({
                    "success": false,
                    "error": format!("Voice {id_str} appears corrupt: {e}"),
                }),
            );
            return;
        }
        if let Err(e) = curl_download(&app, &json_url, &json_path, &cancel, &label) {
            if e == "cancelled" {
                let _ = app.emit(
                    "model-download-complete",
                    serde_json::json!({ "success": false, "cancelled": true }),
                );
                return;
            }
            // Sidecar failure is unusual — the file is ~5 KB — but
            // surface it as an error rather than partial success so the
            // UI can prompt a retry. Also wipe the orphaned .onnx so a
            // subsequent run doesn't see a half-installed voice.
            let _ = std::fs::remove_file(&onnx_path);
            let _ = app.emit(
                "model-download-complete",
                serde_json::json!({ "success": false, "error": format!("Voice {id_str} sidecar: {e}") }),
            );
            return;
        }
        if let Err(e) = verify_voice_json(&json_path) {
            let _ = std::fs::remove_file(&onnx_path);
            let _ = std::fs::remove_file(&json_path);
            let _ = app.emit(
                "model-download-complete",
                serde_json::json!({
                    "success": false,
                    "error": format!("Voice {id_str} sidecar appears corrupt: {e}"),
                }),
            );
            return;
        }

        // Done. Omit `tier` so the JS layer's "tier completed" branch
        // doesn't fire and clobber the active brain selection.
        let _ = app.emit(
            "model-download-complete",
            serde_json::json!({ "success": true }),
        );
    });
}

/// True when both files of a Piper voice pair (`.onnx` model + JSON
/// sidecar) exist on disk AND are big enough to be the real assets.
/// Matches the same thresholds the runtime diagnostics path uses, so
/// the installer and `tts::list_voices` agree on what "voice present"
/// means.
///
/// Falls back to "not valid" on any metadata error so callers can
/// trigger a clean redownload — the safer side to err on when the
/// alternative is letting a 1 KB error page masquerade as a 60 MB
/// neural voice model.
fn voice_already_valid(onnx: &std::path::Path, json: &std::path::Path) -> bool {
    let onnx_ok = std::fs::metadata(onnx)
        .map(|m| m.len() >= crate::tts::MIN_ONNX_BYTES)
        .unwrap_or(false);
    let json_ok = std::fs::metadata(json)
        .map(|m| m.len() >= crate::tts::MIN_ONNX_JSON_BYTES)
        .unwrap_or(false);
    onnx_ok && json_ok
}

/// Validate a freshly-downloaded Piper voice `.onnx` file. Real Piper
/// medium models weigh ~60 MB on disk; we floor at `MIN_ONNX_BYTES`
/// (30 MB) so the check is tolerant to future minor size shifts but
/// still catches the common failure modes:
///
///   * Server returned 200 + an HTML error / captive portal page
///     (typically a few KB)
///   * Connection dropped midway through and curl saved the partial
///   * A corporate proxy stripped the body entirely
///
/// Returns Ok if the file looks big enough to be the real model;
/// otherwise an error string suitable for the user-facing banner.
fn verify_voice_onnx(path: &std::path::Path) -> Result<(), String> {
    let bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if bytes < crate::tts::MIN_ONNX_BYTES {
        Err(format!(
            "downloaded .onnx is only {bytes} bytes (expected at least {} MB)",
            crate::tts::MIN_ONNX_BYTES / (1024 * 1024),
        ))
    } else {
        Ok(())
    }
}

/// Validate a freshly-downloaded Piper voice `.onnx.json` sidecar.
/// Real sidecars are ~5 KB of JSON; the 1 KB floor (`MIN_ONNX_JSON_BYTES`)
/// catches truncated or empty-body failures without false-flagging
/// legitimate future config slimming.
fn verify_voice_json(path: &std::path::Path) -> Result<(), String> {
    let bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if bytes < crate::tts::MIN_ONNX_JSON_BYTES {
        Err(format!(
            "downloaded sidecar is only {bytes} bytes (expected at least {})",
            crate::tts::MIN_ONNX_JSON_BYTES,
        ))
    } else {
        Ok(())
    }
}

/// Minimum size the Piper release archive should have on disk before we
/// hand it to an extractor. HuggingFace / GitHub (or a corporate proxy
/// with TLS interception) can serve a redirect page or maintenance HTML
/// in place of the real asset — those are KB, not MB.
///
/// Real 2023.11.14-2 asset sizes: macOS ~19.1 MB, Windows zip ~22.5 MB,
/// Linux ~25.4–26.5 MB. A 15 MB floor clears every platform with room
/// for future minor release-size shifts while still catching the
/// "served a wrong/truncated payload" mode.
///
/// The number itself lives in `floors`, the single table for every
/// downloaded asset's size floor.
const MIN_PIPER_ARCHIVE_BYTES: u64 = floors::PIPER_ARCHIVE;

/// Extract the Piper release archive into `dest`.
///
/// macOS and Linux ship `.tar.gz`, which `tar xzf` handles everywhere.
/// Windows ships a `.zip`, which GNU tar refuses ("This does not look
/// like a tar archive") — and `tar` on a Windows box with Git for
/// Windows installed frequently resolves to GNU tar, not the bsdtar in
/// System32. So the zip path calls `%SystemRoot%\System32\tar.exe` by
/// ABSOLUTE path (bsdtar/libarchive, present since Windows 10 1803, and
/// verified to read this exact archive), and falls back to PowerShell's
/// `Expand-Archive` if that binary is absent. Two independent extractors
/// beats one new crate dependency for a path that only runs once per
/// install.
fn extract_piper_archive(
    archive: &std::path::Path,
    format: crate::tts::ArchiveFormat,
    dest: &std::path::Path,
) -> Result<(), String> {
    use crate::tts::ArchiveFormat;
    match format {
        ArchiveFormat::TarGz => {
            let out = std::process::Command::new("tar")
                .arg("xzf")
                .arg(archive)
                .arg("-C")
                .arg(dest)
                .output()
                .map_err(|e| format!("failed to run tar: {e}"))?;
            if !out.status.success() {
                return Err(format!(
                    "tar failed extracting Piper: {}",
                    String::from_utf8_lossy(&out.stderr).trim(),
                ));
            }
            Ok(())
        }
        ArchiveFormat::Zip => {
            let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
            let bsdtar = std::path::Path::new(&system_root)
                .join("System32")
                .join("tar.exe");
            if bsdtar.exists() {
                let out = std::process::Command::new(&bsdtar)
                    // `-xf` (not `xzf`): libarchive sniffs the format,
                    // and forcing gzip would reject the zip.
                    .arg("-xf")
                    .arg(archive)
                    .arg("-C")
                    .arg(dest)
                    .output()
                    .map_err(|e| format!("failed to run {}: {e}", bsdtar.display()))?;
                if out.status.success() {
                    return Ok(());
                }
                eprintln!(
                    "[yames] {} failed extracting Piper zip: {} \u{2014} trying Expand-Archive",
                    bsdtar.display(),
                    String::from_utf8_lossy(&out.stderr).trim(),
                );
            }
            let out = std::process::Command::new("powershell")
                .arg("-NoProfile")
                .arg("-NonInteractive")
                .arg("-Command")
                .arg(format!(
                    "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
                    archive.display(),
                    dest.display(),
                ))
                .output()
                .map_err(|e| format!("failed to run PowerShell Expand-Archive: {e}"))?;
            if !out.status.success() {
                return Err(format!(
                    "could not extract the Piper zip: {}",
                    String::from_utf8_lossy(&out.stderr).trim(),
                ));
            }
            Ok(())
        }
    }
}

/// Per-OS repair of the freshly unpacked Piper tree, run between
/// extraction and the smoke test.
///
/// The macOS half was previously duplicated inline in `start_download`
/// and `start_voice_repair` and ran unconditionally — spawning `xattr`
/// and `install_name_tool` on Windows and Linux, where neither command
/// exists, on every install. It is now `cfg`-gated:
///
///   * macOS — `xattr -dr com.apple.quarantine` (curl-downloaded files
///     carry the quarantine xattr; after a security update macOS can
///     refuse to load unsigned dylibs that have it, producing "Library
///     not loaded: @rpath/…" with every file visibly present,
///     2026-05-18) plus `install_name_tool -add_rpath` (the shipped
///     binaries reference `@rpath/lib*.dylib` but carry no LC_RPATH
///     entry, so dyld can never find the bundled libraries otherwise).
///   * Linux — restore the executable bit and warn on a missing
///     `espeak-ng-data`.
///   * Windows — nothing to repair (the DLLs sit beside `piper.exe` and
///     the loader finds them there); warn on a missing `espeak-ng-data`.
///
/// Errors are swallowed: `xattr` exits non-zero when the attribute
/// isn't set, which is the success case for us, and the `piper_smoke_test`
/// that follows is the real verdict either way.
fn post_extract_fixups(piper_dir: &std::path::Path) {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("xattr")
            .arg("-dr")
            .arg("com.apple.quarantine")
            .arg(piper_dir)
            .output();
        for bin in ["piper", "piper_phonemize"] {
            let bin_path = piper_dir.join(bin);
            if bin_path.exists() {
                let _ = std::process::Command::new("install_name_tool")
                    .arg("-add_rpath")
                    .arg(piper_dir)
                    .arg(&bin_path)
                    .output();
            }
        }
        // Log any still-missing dylibs after extraction for future debugging.
        for dylib in [
            "libespeak-ng.1.dylib",
            "libpiper_phonemize.1.dylib",
            "libonnxruntime.1.14.1.dylib",
        ] {
            if !piper_dir.join(dylib).exists() {
                eprintln!("[yames] WARNING: piper dylib missing after extract: {dylib}");
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        // Piper's Linux tarball carries the executable bit, but a few
        // extraction paths (and some filesystems) drop it. Restore it
        // rather than failing the smoke test with "Permission denied".
        use std::os::unix::fs::PermissionsExt;
        for bin in ["piper", "piper_phonemize"] {
            let p = piper_dir.join(bin);
            if let Ok(meta) = std::fs::metadata(&p) {
                let mut perms = meta.permissions();
                perms.set_mode(perms.mode() | 0o111);
                let _ = std::fs::set_permissions(&p, perms);
            }
        }
        // espeak-ng-data ships inside the archive; without it Piper
        // cannot phonemise and every synthesis fails.
        if !piper_dir.join("espeak-ng-data").exists() {
            eprintln!(
                "[yames] WARNING: espeak-ng-data missing after extract \u{2014} speech will fail"
            );
        }
    }
    #[cfg(target_os = "windows")]
    {
        // The DLLs sit beside piper.exe and the loader finds them
        // there; nothing to repair. Warn on a layout surprise so a
        // future upstream reorg shows up in the logs rather than as a
        // silent smoke-test failure.
        if !piper_dir.join("espeak-ng-data").exists() {
            eprintln!(
                "[yames] WARNING: espeak-ng-data missing after extract \u{2014} speech will fail"
            );
        }
    }
    // Every branch above is cfg-gated; on an OS we don't special-case
    // the parameter would otherwise read as unused.
    let _ = piper_dir;
}

/// Download + extract + verify the Piper engine into `models_dir/piper`.
/// Shared by `start_download` and `start_voice_repair`, which previously
/// carried two near-identical ~60-line copies of this logic that had
/// already drifted apart (only one of them wiped a stale `piper/` before
/// extracting).
///
/// Returns `Err("cancelled")` verbatim when the user aborted, so callers
/// can emit the cancelled event rather than an error banner.
fn install_piper_engine(
    app: &AppHandle,
    models_dir: &std::path::Path,
    cancel: &DownloadCancelFlag,
) -> Result<(), String> {
    let piper_dir = models_dir.join("piper");
    let _ = app.emit(
        "model-download-progress",
        DownloadProgress::transfer("Piper TTS engine".to_string(), 0, 0, 0.0, false),
    );

    let archive = crate::tts::piper_archive()?;
    let archive_path = models_dir.join(archive.file_name);
    curl_download(app, archive.url, &archive_path, cancel, "Piper TTS engine")?;

    let size = std::fs::metadata(&archive_path)
        .map(|m| m.len())
        .unwrap_or(0);
    if size < MIN_PIPER_ARCHIVE_BYTES {
        let _ = std::fs::remove_file(&archive_path);
        return Err(format!(
            "downloaded archive is only {size} bytes (expected at least {} MB) \u{2014} the file may be corrupted or intercepted by a proxy",
            MIN_PIPER_ARCHIVE_BYTES / (1024 * 1024),
        ));
    }

    // Wipe a stale piper/ only after the download succeeded and its size
    // is verified — so a failed download never destroys a working
    // install. Extractors unpack side-by-side and won't remove orphan
    // files, so clearing first is still required.
    if piper_dir.exists() {
        if let Err(e) = std::fs::remove_dir_all(&piper_dir) {
            eprintln!("[yames] Failed to remove stale piper/: {e}");
        }
    }
    let _ = std::fs::create_dir_all(models_dir);
    let extract_result = extract_piper_archive(&archive_path, archive.format, models_dir);
    let _ = std::fs::remove_file(&archive_path);
    extract_result?;

    post_extract_fixups(&piper_dir);
    crate::tts::piper_smoke_test(&piper_dir)?;

    // Smoke test passed — write the verified marker so hot-path callers
    // (`tts::piper_runnable`, used on every Settings render and every
    // voice-preview click) can trust the install without paying a
    // subprocess on each check.
    let marker = piper_dir.join(crate::tts::PIPER_VERIFIED_MARKER);
    if let Err(e) = std::fs::write(&marker, b"") {
        eprintln!(
            "[yames] Failed to write piper verified marker at {}: {e}",
            marker.display(),
        );
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Brain family / marker tests (T04)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod brain_family_tests {
    use super::*;

    #[test]
    fn qwen3_urls_are_the_current_family() {
        assert_eq!(
            family_for_url(
                "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf"
            ),
            CURRENT_BRAIN_FAMILY
        );
        assert_eq!(
            family_for_url(
                "https://huggingface.co/bartowski/Qwen_Qwen3-8B-GGUF/resolve/main/Qwen_Qwen3-8B-Q4_K_M.gguf"
            ),
            CURRENT_BRAIN_FAMILY
        );
    }

    #[test]
    fn the_pre_t04_urls_are_legacy() {
        assert_eq!(
            family_for_url(
                "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf"
            ),
            "legacy"
        );
        assert_eq!(
            family_for_url(
                "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf"
            ),
            "legacy"
        );
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yames-brain-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_missing_marker_reads_as_no_family() {
        let dir = temp_dir("nomarker");
        assert_eq!(read_brain_family(&dir), None);
        assert!(!brain_matches_request(
            &dir,
            "https://x/Qwen3-4B.gguf",
            "standard"
        ));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_written_marker_round_trips() {
        let dir = temp_dir("roundtrip");
        let url = "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf";
        write_brain_marker(&dir, url, "standard", 2_497_280_256);
        assert_eq!(
            read_brain_family(&dir).as_deref(),
            Some(CURRENT_BRAIN_FAMILY)
        );
        assert!(brain_matches_request(&dir, url, "standard"));
        // Same family, different tier — must NOT be treated as up to date,
        // otherwise picking Studio would only rewrite the tier file.
        assert!(!brain_matches_request(&dir, url, "full"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_corrupt_marker_is_treated_as_legacy() {
        let dir = temp_dir("corrupt");
        std::fs::write(dir.join(BRAIN_MARKER), b"<html>not json</html>").unwrap();
        assert_eq!(read_brain_family(&dir), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn size_floors_track_the_tier() {
        assert_eq!(min_brain_bytes("standard"), 2 * 1024 * 1024 * 1024);
        assert_eq!(min_brain_bytes("full"), 4 * 1024 * 1024 * 1024);
        // Unknown tiers fall back to the lower floor rather than blocking.
        assert_eq!(min_brain_bytes("mystery"), 2 * 1024 * 1024 * 1024);
        // The real assets clear their floors (sizes measured 2026-09-02).
        assert!(2_497_280_256_u64 > min_brain_bytes("standard"));
        assert!(5_027_783_488_u64 > min_brain_bytes("full"));
    }

    #[test]
    fn meminfo_total_is_parsed() {
        let sample = "MemTotal:       32791612 kB\nMemFree:         1234 kB\n";
        assert_eq!(parse_meminfo_total_kb(sample), Some(32_791_612));
        assert_eq!(parse_meminfo_total_kb("MemFree: 12 kB\n"), None);
    }

    /// Item 7. The old TS gate compared against a literal 16 GiB, which
    /// a real 16 GB Windows or Linux machine never reports — firmware and
    /// iGPU reservations come off the top before the OS answers.
    #[test]
    fn a_real_16gb_machine_is_offered_studio() {
        // What a 16 GB Windows laptop with an integrated GPU actually
        // reports (15.5–15.9 GiB), what Linux reports, and the nominal
        // figure. All four are 16 GB machines.
        for reported in [15_872, 16_263, 15_884, 16_384] {
            let (studio, standard, _) = recommendations(reported, false, None);
            assert!(studio, "{reported} MB should be offered Studio");
            assert!(standard, "{reported} MB should be offered Standard");
        }
    }

    /// …while a genuinely small machine is still told the truth.
    #[test]
    fn small_machines_are_gated_out() {
        let (studio, standard, _) = recommendations(8 * 1024, false, None);
        assert!(!studio, "8 GB must not be offered Studio");
        assert!(standard, "8 GB is the Standard floor");

        let (studio, standard, _) = recommendations(4 * 1024, false, None);
        assert!(!studio);
        assert!(!standard, "4 GB cannot run Qwen3-4B without swapping");
    }

    /// A failed platform query reports 0 and must read as "unknown",
    /// never as "too small".
    #[test]
    fn an_unknown_memory_size_gates_nothing() {
        let (studio, standard, _) = recommendations(0, false, None);
        assert!(studio);
        assert!(standard);
    }

    #[test]
    fn the_update_prompt_follows_the_family() {
        let current = Some(CURRENT_BRAIN_FAMILY);
        assert!(!recommendations(0, false, None).2, "nothing installed");
        assert!(!recommendations(0, true, current).2, "current family");
        assert!(recommendations(0, true, Some("legacy")).2, "legacy family");
        assert!(
            recommendations(0, true, None).2,
            "a ready brain with no classifiable family is legacy",
        );
    }

    #[test]
    fn brain_names_come_from_the_marker_when_the_gguf_has_none() {
        let q = Some(CURRENT_BRAIN_FAMILY);
        assert_eq!(brain_display_name(q, Some("standard")), "Qwen3 4B");
        assert_eq!(brain_display_name(q, Some("full")), "Qwen3 8B");
        assert_eq!(brain_display_name(q, None), "Qwen3 4B");
        assert_eq!(brain_display_name(Some("legacy"), Some("full")), "brain");
        assert_eq!(brain_display_name(None, None), "brain");
    }

    /// Item 10. The Studio brain is 4.7 GiB; `--max-time 600` could not
    /// fetch it on ordinary broadband and each `--retry` started over.
    #[test]
    fn the_curl_line_resumes_and_only_aborts_when_stalled() {
        let dest = std::path::Path::new("/tmp/models/brain/model.bin");
        let url = "https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf";
        let part = part_path_for(dest, url);
        let args: Vec<String> = curl_args(url, &part)
            .iter()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();

        // No wall-clock cap on the transfer.
        assert!(
            !args.iter().any(|a| a == "--max-time"),
            "--max-time cannot fetch a 4.7 GiB model: {args:?}",
        );
        // Abort only on a stall.
        let stall = args.windows(2).any(|w| w[0] == "--speed-time" && w[1] == "60");
        let floor = args
            .windows(2)
            .any(|w| w[0] == "--speed-limit" && w[1] == "10240");
        assert!(stall && floor, "missing stall detection: {args:?}");
        // Resume unconditionally — the flag is a no-op when the .part is
        // absent and is what saves the first 3 GiB when it is not.
        assert!(
            args.windows(2).any(|w| w[0] == "-C" && w[1] == "-"),
            "resume flag missing: {args:?}",
        );
        // A connect timeout is still wanted — that one is not wall clock.
        assert!(args.iter().any(|a| a == "--connect-timeout"));
    }

    /// Both tiers write `model.bin`, so a shared `model.part` plus an
    /// unconditional `-C -` would resume a Standard download into a
    /// Studio request.
    #[test]
    fn part_files_are_keyed_by_url() {
        let dest = std::path::Path::new("/tmp/brain/model.bin");
        let standard = part_path_for(dest, "https://x/Qwen3-4B-Q4_K_M.gguf");
        let studio = part_path_for(dest, "https://x/Qwen3-8B-Q4_K_M.gguf");
        assert_ne!(standard, studio);
        assert_eq!(standard, part_path_for(dest, "https://x/Qwen3-4B-Q4_K_M.gguf"));
        assert!(standard.to_string_lossy().ends_with(".part"));
    }

    #[test]
    fn system_memory_is_plausible_on_this_host() {
        // 0 means "the platform query failed"; every machine Yames builds
        // on has at least 1 GB, so a real answer is > 1024 MB.
        let mb = system_memory_mb();
        assert!(mb == 0 || mb > 1024, "implausible system memory: {mb} MB");
    }
}

/// Leg ms2: both tiers side by side, the adoption of an older install's
/// single brain (each crash state), the checksum, partial files, free space.
/// Every test works in its own directory under the system temp dir and
/// fetches nothing from the network.
#[cfg(test)]
mod brain_store_tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    static N: AtomicUsize = AtomicUsize::new(0);

    /// A fresh `brain/` root for one test.
    fn root(tag: &str) -> PathBuf {
        let n = N.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir()
            .join(format!("yames-ms2-{tag}-{}-{n}", std::process::id()))
            .join("brain");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn put(path: &Path, bytes: &[u8]) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, bytes).unwrap();
    }

    fn read(path: &Path) -> Vec<u8> {
        std::fs::read(path).unwrap()
    }

    const STD_URL: &str = BRAIN_ARTIFACTS[0].url;

    /// An older install: one brain in `brain/`, its `tier` and marker.
    fn legacy_install(brain: &Path, tier: &str, weights: &[u8]) {
        put(&brain.join("model.bin"), weights);
        put(&brain.join("tier"), tier.as_bytes());
        let marker = serde_json::json!({
            "family": CURRENT_BRAIN_FAMILY, "tier": tier, "url": STD_URL, "bytes": weights.len(),
        });
        put(&brain.join(BRAIN_MARKER), marker.to_string().as_bytes());
    }

    #[cfg(unix)]
    fn inode(path: &Path) -> u64 {
        use std::os::unix::fs::MetadataExt;
        std::fs::metadata(path).unwrap().ino()
    }

    // ── The adoption, one test per state a run can be stopped in ──────

    #[test]
    fn an_older_install_is_adopted_in_place_as_its_tier() {
        let brain = root("adopt");
        legacy_install(&brain, "standard", b"standard weights");
        #[cfg(unix)]
        let before = inode(&brain.join("model.bin"));

        assert_eq!(adopt_legacy_brain(&brain), Ok(Adoption::Adopted("standard".into())));

        let moved = brain.join("standard/model.bin");
        assert_eq!(read(&moved), b"standard weights");
        // A rename, not a copy: the same file, never twice the space.
        #[cfg(unix)]
        assert_eq!(inode(&moved), before);
        assert!(!brain.join("model.bin").exists());
        assert!(!brain.join("tier").exists() && !brain.join(BRAIN_MARKER).exists());
        assert_eq!(read(&brain.join("standard/tier")), b"standard");
        assert_eq!(read_brain_family(&brain.join("standard")).as_deref(), Some(CURRENT_BRAIN_FAMILY));
        // The other tier's place is untouched and empty.
        assert!(!brain.join("full").exists());
        // Run again: nothing left to do.
        assert_eq!(adopt_legacy_brain(&brain), Ok(Adoption::Nothing));
        assert_eq!(read(&moved), b"standard weights");
    }

    #[test]
    fn a_run_stopped_before_the_rename_is_finished_by_the_next() {
        let brain = root("before-rename");
        legacy_install(&brain, "full", b"studio weights");
        // Step 1 had run (with a stale marker from somewhere), step 2 not.
        put(&brain.join("full/tier"), b"full");
        put(&brain.join("full/model.json"), b"{\"family\":\"legacy\",\"tier\":\"full\"}");

        assert_eq!(adopt_legacy_brain(&brain), Ok(Adoption::Adopted("full".into())));
        assert_eq!(read(&brain.join("full/model.bin")), b"studio weights");
        // The marker is the old place's, rewritten over the stale one.
        assert_eq!(read_brain_family(&brain.join("full")).as_deref(), Some(CURRENT_BRAIN_FAMILY));
        assert!(!brain.join("model.bin").exists());
    }

    #[test]
    fn a_run_stopped_after_the_rename_is_tidied_by_the_next() {
        let brain = root("after-rename");
        // Steps 1 and 2 had run; the old small files are still there.
        legacy_install(&brain, "standard", b"w");
        std::fs::create_dir_all(brain.join("standard")).unwrap();
        std::fs::copy(brain.join("tier"), brain.join("standard/tier")).unwrap();
        std::fs::copy(brain.join(BRAIN_MARKER), brain.join("standard").join(BRAIN_MARKER)).unwrap();
        std::fs::rename(brain.join("model.bin"), brain.join("standard/model.bin")).unwrap();

        assert_eq!(adopt_legacy_brain(&brain), Ok(Adoption::Nothing));
        assert!(!brain.join("tier").exists() && !brain.join(BRAIN_MARKER).exists());
        assert_eq!(read(&brain.join("standard/model.bin")), b"w");
        let tiers = tier_statuses(&brain, 0);
        assert!(tiers[0].on_disk && !tiers[1].on_disk);
        assert_eq!(tiers[0].family.as_deref(), Some(CURRENT_BRAIN_FAMILY));
    }

    #[test]
    fn the_old_small_files_stay_while_no_tier_holds_weights() {
        let brain = root("orphan-meta");
        put(&brain.join("tier"), b"standard");
        put(&brain.join(BRAIN_MARKER), b"{}");
        assert_eq!(adopt_legacy_brain(&brain), Ok(Adoption::Nothing));
        assert!(brain.join("tier").exists() && brain.join(BRAIN_MARKER).exists());
    }

    #[test]
    fn a_conflict_moves_nothing_and_deletes_nothing() {
        let brain = root("conflict");
        legacy_install(&brain, "standard", b"old place");
        put(&brain.join("standard/model.bin"), b"new place");

        assert_eq!(adopt_legacy_brain(&brain), Ok(Adoption::Conflict("standard".into())));
        assert_eq!(read(&brain.join("model.bin")), b"old place");
        assert_eq!(read(&brain.join("standard/model.bin")), b"new place");
        assert!(brain.join("tier").exists() && brain.join(BRAIN_MARKER).exists());
        // The tier's own file is the one reported and loaded.
        assert_eq!(tier_brain_dir(&brain, "standard"), Some(brain.join("standard")));
    }

    #[test]
    fn a_pre_t04_brain_without_a_marker_stays_legacy() {
        let brain = root("pre-t04");
        put(&brain.join("model.bin"), b"phi");
        put(&brain.join("tier"), b"standard");
        // A marker left in the tier's folder by some earlier stopped run
        // must not dress the old weights up as current.
        put(&brain.join("standard").join(BRAIN_MARKER), b"{\"family\":\"qwen3\",\"tier\":\"standard\"}");

        assert_eq!(adopt_legacy_brain(&brain), Ok(Adoption::Adopted("standard".into())));
        assert_eq!(read_brain_family(&brain.join("standard")), None);
        let tiers = tier_statuses(&brain, 0);
        assert_eq!(tiers[0].family.as_deref(), Some("legacy"));
        assert!(tiers[0].update_recommended);
        assert!(!tiers[1].update_recommended);
    }

    #[test]
    fn an_unreadable_tier_comes_from_the_marker_then_the_size() {
        let brain = root("tier-from-marker");
        legacy_install(&brain, "full", b"x");
        std::fs::remove_file(brain.join("tier")).unwrap();
        assert_eq!(legacy_tier(&brain), "full");

        let brain = root("tier-from-small-size");
        put(&brain.join("model.bin"), b"x");
        assert_eq!(legacy_tier(&brain), "standard");
    }

    /// A Studio-sized file with no tier file and no marker is Studio. Sparse
    /// on unix, so the test costs no disk.
    #[cfg(unix)]
    #[test]
    fn a_studio_sized_brain_without_records_is_studio() {
        let brain = root("tier-from-size");
        let f = std::fs::File::create(brain.join("model.bin")).unwrap();
        f.set_len(floors::BRAIN_STUDIO + 1).unwrap();
        drop(f);
        assert_eq!(legacy_tier(&brain), "full");
        assert_eq!(adopt_legacy_brain(&brain), Ok(Adoption::Adopted("full".into())));
        assert_eq!(file_len(&brain.join("full/model.bin")), floors::BRAIN_STUDIO + 1);
    }

    #[test]
    fn a_paused_download_moves_with_its_tier() {
        let brain = root("parts");
        let old = part_path_for(&brain.join("model.bin"), STD_URL);
        put(&old, b"first half");
        adopt_legacy_brain(&brain).unwrap();
        let new = part_path_for(&brain.join("standard/model.bin"), STD_URL);
        assert_eq!(read(&new), b"first half");
        assert!(!old.exists());
        assert_eq!(tier_statuses(&brain, 0)[0].partial_bytes, 10);

        // Never over a part the tier already has.
        put(&old, b"other");
        adopt_legacy_brain(&brain).unwrap();
        assert_eq!(read(&new), b"first half");
        assert_eq!(read(&old), b"other");
    }

    #[test]
    fn a_failed_adoption_still_finds_the_brain_where_it_is() {
        let brain = root("not-moved");
        legacy_install(&brain, "full", b"w");
        // Not adopted (as when the rename failed): status and load still
        // find it, as its own tier, and only that tier.
        assert_eq!(tier_brain_dir(&brain, "full"), Some(brain.clone()));
        assert_eq!(tier_brain_dir(&brain, "standard"), None);
        let found = locate_brain_in(&brain, Some("full")).unwrap();
        assert_eq!(found.model, brain.join("model.bin"));
        let tiers = tier_statuses(&brain, 0);
        assert!(!tiers[0].on_disk && tiers[1].on_disk);
        assert_eq!(tiers[1].size_bytes, 1);
    }

    // ── Both tiers on disk ─────────────────────────────────────────────

    #[test]
    fn both_tiers_live_side_by_side() {
        let brain = root("both");
        put(&brain.join("standard/model.bin"), b"4b");
        put(&brain.join("full/model.bin"), b"8b8b");
        let tiers = tier_statuses(&brain, 0);
        assert_eq!(tiers.len(), 2);
        assert_eq!((tiers[0].tier.as_str(), tiers[0].on_disk), ("standard", true));
        assert_eq!((tiers[1].tier.as_str(), tiers[1].on_disk), ("full", true));
        assert_eq!(tiers[0].size_bytes, 2);
        assert_eq!(tiers[1].size_bytes, 4);
        assert_eq!(tiers[0].download_bytes, Some(2_497_280_256));
        assert!(tiers[0].checksum_pinned && tiers[1].checksum_pinned);

        assert_eq!(locate_brain_in(&brain, Some("full")).unwrap().model, brain.join("full/model.bin"));
        assert_eq!(locate_brain_in(&brain, None).unwrap().tier, "standard");
        assert!(locate_brain_in(&brain, Some("huge")).is_err());

        // Deleting one leaves the other exactly as it was.
        delete_brain_tier_in(&brain, "standard").unwrap();
        assert!(!brain.join("standard").exists());
        assert_eq!(read(&brain.join("full/model.bin")), b"8b8b");
    }

    #[test]
    fn deleting_a_tier_still_in_the_old_place_deletes_only_it() {
        let brain = root("delete-legacy");
        legacy_install(&brain, "standard", b"w");
        put(&brain.join("full/model.bin"), b"studio");
        delete_brain_tier_in(&brain, "standard").unwrap();
        assert!(!brain.join("model.bin").exists() && !brain.join("standard").exists());
        assert_eq!(read(&brain.join("full/model.bin")), b"studio");
    }

    #[test]
    fn a_marker_that_does_not_describe_its_weights_is_ignored() {
        let dir = root("stale-marker");
        put(&dir.join("model.bin"), b"old weights");
        write_brain_marker(&dir, STD_URL, "standard", 2_497_280_256);
        assert_eq!(read_brain_family(&dir), None);
        put(&dir.join("model.bin"), &vec![0u8; 7]);
        write_brain_marker(&dir, STD_URL, "standard", 7);
        assert_eq!(read_brain_family(&dir).as_deref(), Some(CURRENT_BRAIN_FAMILY));
    }

    // ── The checksum, and what becomes of a part ───────────────────────

    /// FIPS 180-2's own test vector: SHA-256("abc").
    const ABC_SHA256: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    fn abc_artifact() -> BrainArtifact {
        BrainArtifact { tier: "standard", url: STD_URL, bytes: 3, sha256: Some(ABC_SHA256) }
    }

    fn finish(dir: &Path, part: &Path, artifact: Option<&BrainArtifact>, cancel: bool) -> Result<(), BrainFetchError> {
        let flag = AtomicBool::new(cancel);
        let mut seen = Vec::new();
        let r = finish_brain_part(dir, part, STD_URL, "standard", artifact, 2, &flag, &mut |d, t| seen.push((d, t)));
        if r.is_ok() && artifact.and_then(|a| a.sha256).is_some() {
            assert_eq!(seen.last(), Some(&(3, 3)), "the check reports its progress");
        }
        r
    }

    #[test]
    fn the_hash_is_the_published_one() {
        let path = root("sha").join("f");
        put(&path, b"abc");
        let hex = sha256_file(&path, &AtomicBool::new(false), &mut |_, _| {}).unwrap();
        assert_eq!(hex, ABC_SHA256);
    }

    #[test]
    fn a_matching_file_is_adopted() {
        let dir = root("hash-pass").join("standard");
        let part = part_path_for(&dir.join("model.bin"), STD_URL);
        put(&part, b"abc");
        finish(&dir, &part, Some(&abc_artifact()), false).unwrap();
        assert_eq!(read(&dir.join("model.bin")), b"abc");
        assert!(!part.exists());
        let marker = read_brain_marker(&dir).unwrap();
        assert_eq!(marker["sha256"], ABC_SHA256);
        assert_eq!(read(&dir.join("tier")), b"standard");
    }

    #[test]
    fn a_mismatch_removes_the_part_and_keeps_the_brain_on_disk() {
        let dir = root("hash-fail").join("standard");
        put(&dir.join("model.bin"), b"the player's brain");
        let part = part_path_for(&dir.join("model.bin"), STD_URL);
        put(&part, b"abd");
        assert_eq!(finish(&dir, &part, Some(&abc_artifact()), false), Err(BrainFetchError::Checksum));
        assert!(!part.exists(), "a whole file with the wrong hash cannot be resumed");
        assert_eq!(read(&dir.join("model.bin")), b"the player's brain");
    }

    #[test]
    fn a_short_part_is_kept_to_resume_and_a_long_one_removed() {
        let dir = root("hash-size").join("standard");
        let part = part_path_for(&dir.join("model.bin"), STD_URL);
        put(&part, b"ab");
        assert!(matches!(finish(&dir, &part, Some(&abc_artifact()), false), Err(BrainFetchError::Failed(_))));
        assert_eq!(read(&part), b"ab");
        put(&part, b"abcd");
        assert!(matches!(finish(&dir, &part, Some(&abc_artifact()), false), Err(BrainFetchError::Failed(_))));
        assert!(!part.exists());
        assert!(!dir.join("model.bin").exists());
    }

    #[test]
    fn a_pause_during_the_check_keeps_the_whole_part() {
        let dir = root("hash-pause").join("standard");
        let part = part_path_for(&dir.join("model.bin"), STD_URL);
        put(&part, b"abc");
        assert_eq!(finish(&dir, &part, Some(&abc_artifact()), true), Err(BrainFetchError::Cancelled));
        assert_eq!(read(&part), b"abc");
        assert!(!dir.join("model.bin").exists());
        // The next start checks it again and adopts it.
        finish(&dir, &part, Some(&abc_artifact()), false).unwrap();
        assert_eq!(read(&dir.join("model.bin")), b"abc");
    }

    #[test]
    fn without_a_pin_the_size_floor_stands_in() {
        let dir = root("no-pin").join("standard");
        let part = part_path_for(&dir.join("model.bin"), STD_URL);
        put(&part, b"a");
        assert!(matches!(finish(&dir, &part, None, false), Err(BrainFetchError::Failed(_))));
        assert!(!part.exists());
        put(&part, b"abc");
        finish(&dir, &part, None, false).unwrap();
        assert_eq!(read(&dir.join("model.bin")), b"abc");
        assert!(read_brain_marker(&dir).unwrap().get("sha256").is_none());
    }

    #[test]
    fn a_cancel_discards_only_the_part() {
        let brain = root("discard");
        put(&brain.join("standard/model.bin"), b"brain");
        let part = part_path_for(&brain.join("standard/model.bin"), STD_URL);
        let old_part = part_path_for(&brain.join("model.bin"), STD_URL);
        let other = part_path_for(&brain.join("full/model.bin"), BRAIN_ARTIFACTS[1].url);
        put(&part, b"half");
        put(&old_part, b"older half");
        put(&other, b"studio half");
        discard_partial_in(&brain, "standard", STD_URL).unwrap();
        assert!(!part.exists() && !old_part.exists());
        assert_eq!(read(&brain.join("standard/model.bin")), b"brain");
        assert_eq!(read(&other), b"studio half");
        // Nothing to discard is not an error.
        discard_partial_in(&brain, "standard", STD_URL).unwrap();
    }

    #[test]
    fn the_space_error_names_both_numbers() {
        let e = brain_failure_event(&BrainFetchError::Space { need: 5, free: 3 }, false);
        assert_eq!(e["code"], "space");
        assert_eq!(e["needBytes"], 5);
        assert_eq!(e["freeBytes"], 3);
        let e = brain_failure_event(&BrainFetchError::Cancelled, true);
        assert_eq!(e["cancelled"], true);
        assert_eq!(e["discarded"], true);
        assert_eq!(brain_failure_event(&BrainFetchError::Checksum, false)["code"], "checksum");
    }

    // ── Free space ─────────────────────────────────────────────────────

    #[cfg(any(unix, windows))]
    #[test]
    fn free_space_is_reported_for_a_folder_not_yet_made() {
        let brain = root("free");
        let free = free_space_bytes(&brain.join("not/yet/made")).expect("free space on this host");
        assert!(free > 0);
        assert_eq!(free_space_bytes(&brain).map(|f| f > 0), Some(true));
    }

    // ── The pinned files ───────────────────────────────────────────────

    #[test]
    fn every_tier_has_one_pinned_file() {
        for tier in BRAIN_TIERS {
            let a = pinned_for_tier(tier).expect("a pinned file per tier");
            assert_eq!(family_for_url(a.url), CURRENT_BRAIN_FAMILY);
            assert!(a.bytes > min_brain_bytes(tier));
            assert_eq!(artifact_for(tier, a.url).map(|x| x.url), Some(a.url));
            if let Some(sha) = a.sha256 {
                assert_eq!(sha.len(), 64);
                assert!(sha.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
            }
        }
        assert!(artifact_for("standard", BRAIN_ARTIFACTS[1].url).is_none());
    }

    // ── curl, against a local file (no network) ────────────────────────

    #[cfg(unix)]
    #[test]
    fn curl_resumes_a_part_and_reports_bytes() {
        let brain = root("curl");
        let source = brain.join("source.bin");
        let body: Vec<u8> = (0..300_000u32).map(|i| (i % 251) as u8).collect();
        put(&source, &body);
        let url = format!("file://{}", source.display());
        let part = brain.join("standard/model.x.part");
        put(&part, &body[..100_000]);

        let mut last = None;
        curl_fetch(&url, &part, &AtomicBool::new(false), Some(body.len() as u64), &mut |d, t, f| {
            last = Some((d, t, f));
        })
        .unwrap();
        assert_eq!(read(&part), body, "the part was resumed, not restarted or doubled");
        if let Some((d, t, f)) = last {
            assert!(d <= t && t == body.len() as u64 && (0.0..=1.0).contains(&f));
        }
    }

    #[test]
    fn a_cancel_before_the_start_fetches_nothing() {
        let brain = root("curl-cancel");
        let part = brain.join("p.part");
        put(&part, b"kept");
        let r = curl_fetch("file:///nonexistent", &part, &AtomicBool::new(true), None, &mut |_, _, _| {});
        assert_eq!(r, Err("cancelled".to_string()));
        assert_eq!(read(&part), b"kept");
    }
}

/// Parse percentage from curl progress bar output.
/// curl --progress-bar outputs lines like "###                         5.2%"
fn parse_curl_progress(line: &str) -> Option<f64> {
    let trimmed = line.trim();
    // Look for a percentage at the end of the line
    if let Some(pos) = trimmed.rfind('%') {
        // Walk backwards to find the start of the number
        let before = &trimmed[..pos];
        let num_start = before
            .rfind(|c: char| !c.is_ascii_digit() && c != '.')
            .map(|i| i + 1)
            .unwrap_or(0);
        before[num_start..].parse::<f64>().ok()
    } else {
        None
    }
}
