//! Practice Coach — LLM inference engine.
//!
//! When built with the `coach-llm` feature, loads a GGUF model from disk and
//! runs text generation for coaching comments, mini-reports, session summaries,
//! and chat Q&A. Without the feature, generates template-based responses.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, RwLock};

static VARIANT_COUNTER: AtomicU32 = AtomicU32::new(0);

/// Thread-safe handle to the coach engine.
pub type SharedCoachEngine = Arc<CoachHandle>;

pub fn create_shared_engine() -> SharedCoachEngine {
    Arc::new(CoachHandle::new())
}

// ---------------------------------------------------------------------------
// Status snapshot (read without ever touching the engine mutex)
// ---------------------------------------------------------------------------

/// Lock-free view of what the coach is doing right now.
///
/// The read-only Tauri commands (`is_coach_loaded`,
/// `get_coach_capabilities`) used to lock `SharedCoachEngine`, which
/// `load_coach_model` holds for the whole GGUF load and `coach_generate`
/// held for the whole generation. A Settings render during a cold load
/// therefore froze on the mutex for however long llama.cpp took to mmap
/// several gigabytes. The status commands now read *this* instead: it is
/// updated by whoever owns the mutex, but never needs it.
#[derive(Debug, Default)]
pub struct CoachStatus {
    resident: AtomicBool,
    loading: AtomicBool,
    name: RwLock<Option<String>>,
    last_error: RwLock<Option<String>>,
}

impl CoachStatus {
    /// True when a worker is resident and `generate` will run inference.
    pub fn resident(&self) -> bool {
        self.resident.load(Ordering::Acquire)
    }

    /// True while a load/reload is in flight. The UI shows "warming up".
    pub fn loading(&self) -> bool {
        self.loading.load(Ordering::Acquire)
    }

    /// Display name of the resident model ("Qwen3 4B"), or `None`.
    pub fn model_name(&self) -> Option<String> {
        self.name.read().ok().and_then(|g| g.clone())
    }

    /// Why the last load refused or failed, or `None`.
    pub fn last_error(&self) -> Option<String> {
        self.last_error.read().ok().and_then(|g| g.clone())
    }

    fn set_resident(&self, on: bool) {
        self.resident.store(on, Ordering::Release);
    }

    fn set_name(&self, name: Option<String>) {
        if let Ok(mut g) = self.name.write() {
            *g = name;
        }
    }

    fn set_error(&self, err: Option<String>) {
        if let Ok(mut g) = self.last_error.write() {
            *g = err;
        }
    }

    /// The worker died under us. Residency is cleared so the status line
    /// stops claiming an active brain and the next `ensure_loaded` spawns
    /// a replacement; the message is logged exactly once per death rather
    /// than on every failed generation.
    #[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
    fn clear_residency(&self, why: &str) {
        if self.resident.swap(false, Ordering::AcqRel) {
            eprintln!("[coach] inference worker is gone ({why}) — falling back to templates");
        }
        self.set_name(None);
        self.set_error(Some(why.to_string()));
    }
}

// ---------------------------------------------------------------------------
// Template-based engine (always available)
// ---------------------------------------------------------------------------

/// What Tauri manages: the engine behind a mutex, plus the lock-free
/// status snapshot beside it.
pub struct CoachHandle {
    engine: Mutex<CoachEngine>,
    status: Arc<CoachStatus>,
}

impl CoachHandle {
    fn new() -> Self {
        let status = Arc::new(CoachStatus::default());
        CoachHandle {
            engine: Mutex::new(CoachEngine::new(status.clone())),
            status,
        }
    }

    /// Read the status without taking the engine mutex. This is the only
    /// thing the UI-facing commands are allowed to consult.
    pub fn status(&self) -> &Arc<CoachStatus> {
        &self.status
    }

    /// Take the engine mutex. Every caller here holds it for a handful of
    /// pointer moves — never across a model load or a generation.
    fn lock(&self) -> Result<MutexGuard<'_, CoachEngine>, String> {
        self.engine
            .lock()
            .map_err(|e| format!("coach engine lock poisoned: {e}"))
    }
}

/// Identity of the weights a worker was built from. Two loads of the same
/// file are a no-op; a changed file (a re-download, an "Update brain") is
/// what makes a reload necessary — nothing else does.
#[derive(Clone, Debug, PartialEq, Eq)]
struct ModelFingerprint {
    path: PathBuf,
    len: u64,
    mtime: Option<std::time::SystemTime>,
}

#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
fn fingerprint(path: &Path) -> Option<ModelFingerprint> {
    let meta = std::fs::metadata(path).ok()?;
    Some(ModelFingerprint {
        path: path.to_path_buf(),
        len: meta.len(),
        mtime: meta.modified().ok(),
    })
}

pub struct CoachEngine {
    /// Handle to the long-lived inference thread (ROADMAP §3). The model,
    /// its `LlamaContext` and the llama.cpp backend all live *on* that
    /// thread; this side only owns a job channel. That is what lets the
    /// context be hoisted and reused across calls — `LlamaContext` is not
    /// `Send`, but `SharedCoachEngine` is Tauri managed state and must be.
    ///
    /// Residency is *derived* from this being `Some` (and is structurally
    /// impossible without the feature): a separate `model_resident` bool
    /// was a third source of truth that could disagree with the other two.
    #[cfg(feature = "coach-llm")]
    llm: Option<Arc<llm::LlmWorker>>,
    /// Weights the resident worker was built from.
    #[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
    fingerprint: Option<ModelFingerprint>,
    status: Arc<CoachStatus>,
}

impl CoachEngine {
    fn new(status: Arc<CoachStatus>) -> Self {
        CoachEngine {
            #[cfg(feature = "coach-llm")]
            llm: None,
            fingerprint: None,
            status,
        }
    }

    /// True only when a real model is resident and `generate` will
    /// actually run inference. Derived, never stored.
    pub fn is_loaded(&self) -> bool {
        #[cfg(feature = "coach-llm")]
        {
            self.llm.is_some()
        }
        #[cfg(not(feature = "coach-llm"))]
        {
            false
        }
    }

    /// Push the derived residency into the lock-free snapshot. Called by
    /// whoever just mutated `llm`, while still holding the mutex.
    fn publish(&self, name: Option<String>) {
        self.status.set_resident(self.is_loaded());
        self.status.set_name(name);
    }
}

// ---------------------------------------------------------------------------
// Generation kinds
// ---------------------------------------------------------------------------

/// What the caller is asking for.
///
/// This used to be sniffed out of the prompt text ("Rephrase this
/// practice-coach…", "User asks:"), which meant the token budget and the
/// template branch were decided by string matching on a prompt the JS
/// layer owns. The adaptive-drill prompt carries neither marker, so it
/// silently got the 256-token chat budget and no template branch at all.
/// The caller now says what it wants.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GenKind {
    /// Mid-session tip (AGENTS.md 1–3 s tier).
    Tip,
    /// Session-start greeting.
    Greeting,
    /// End-of-exercise mini-report.
    Report,
    /// End-of-session summary.
    Summary,
    /// Free-form user question.
    Chat,
    /// One-line narration of an adaptive-drill step the engine already made.
    Drill,
}

impl GenKind {
    /// True for the kinds that paraphrase a template the JS side has
    /// already rendered. They get the short budget, and a paraphrase that
    /// runs out of budget mid-sentence is worse than the template it was
    /// paraphrasing — so those fall back instead of shipping a fragment.
    pub fn is_rephrase(self) -> bool {
        matches!(self, GenKind::Tip | GenKind::Greeting | GenKind::Drill)
    }

    /// Per-call generation cap (ROADMAP §0.3 / T04).
    pub fn max_tokens(self) -> usize {
        if self.is_rephrase() {
            REPHRASE_MAX_TOKENS
        } else {
            CHAT_MAX_TOKENS
        }
    }
}

/// Whether this binary was compiled with the LLM backend at all.
///
/// A `false` here is not a user error and not a missing download — the
/// build simply cannot run a model, and the UI must say so rather than
/// inviting the user to fetch gigabytes of weights it will never read.
pub fn llm_compiled() -> bool {
    cfg!(feature = "coach-llm")
}

/// Which llama.cpp backend this build was compiled against.
///
/// `"none"` when the LLM isn't compiled in at all. Note that this is a
/// *compile-time* answer: llama.cpp falls back to CPU at runtime when
/// no usable GPU or driver is present, so a `"vulkan"` build may still
/// be executing on the CPU.
pub fn backend_name() -> &'static str {
    #[cfg(feature = "coach-llm")]
    {
        llm::BACKEND
    }
    #[cfg(not(feature = "coach-llm"))]
    {
        "none"
    }
}

/// System prompt that constrains the coach's behavior.
/// Only referenced when the `coach-llm` feature is enabled (the
/// inner `llm` module reaches for `super::SYSTEM_PROMPT` when building
/// the prompt).  Tagged `dead_code`-allowed on the no-LLM path so the
/// default-features build stays warning-clean.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub const SYSTEM_PROMPT: &str = r#"You are a practice coach for a metronome app. You help musicians improve their timing and rhythm.

Rules:
- Keep responses concise (1-3 sentences max)
- Only discuss timing, rhythm, practice, and the session data you're given
- Be encouraging but honest about areas to improve
- Never make up data — only reference metrics provided to you
- Use natural, conversational language like a supportive instructor
- When commenting on timing: "early" means ahead of the beat, "late" means behind
- Reference specific beats or patterns when the data supports it"#;

/// Reason a load refused before any weights were touched. Surfaced in
/// `CoachCapabilities.loadError` so Settings can say *why* rather than
/// silently staying on templates.
pub const NO_WEIGHTS: &str = "no weights on disk";
pub const LEGACY_WEIGHTS: &str =
    "these weights predate the Qwen3 refresh — use \"Update brain\" to replace them";
#[cfg_attr(feature = "coach-llm", allow(dead_code))]
pub const NO_LLM_IN_BUILD: &str = "this build was compiled without the coach LLM";

/// Load (or reload) the GGUF model from the brain directory.
///
/// Idempotent by design. `useSession` used to call this from its mount
/// effect *and* from `startSession`, and `load_model` unconditionally
/// dropped the resident worker before spawning a replacement — so the
/// second call tore down a perfectly good brain, and a failure at that
/// point left the user with none at all. The rules now:
///
///   * same file (path + size + mtime) already resident → `Ok(true)`,
///     nothing touched;
///   * another load already in flight → `Ok(true)`, the winner finishes it;
///   * a *changed* file with a worker resident → the worker loads the new
///     weights on its own thread and only swaps them in when that
///     succeeds, so a failed reload leaves the old brain answering
///     (`LlamaBackend::init()` is a process-wide one-shot, which is why
///     the new model cannot simply be loaded on a second thread);
///   * no worker → spawn one.
///
/// `family` is the `models/brain/model.json` marker's family. A missing
/// or superseded family refuses the load: a pre-Qwen3 GGUF loads fine but
/// is fed Qwen3 ChatML, so its answers arrive full of visible template
/// artifacts. The UI already offers "Update brain".
///
/// Returns `true` only when a real model is resident afterwards. The
/// template engine needs no loading at all — it is the fallback
/// `generate` takes whenever no model is held — so every refusal path
/// returns `false` rather than the `true` that once made `is_coach_loaded`
/// report a brain that did not exist.
pub fn load_model(
    handle: &CoachHandle,
    model_path: &Path,
    family: Option<&str>,
    fallback_name: &str,
) -> Result<bool, String> {
    let status = handle.status().clone();

    if !model_path.exists() {
        status.set_error(Some(NO_WEIGHTS.to_string()));
        return Ok(false);
    }
    if family != Some(crate::models::CURRENT_BRAIN_FAMILY) {
        status.set_error(Some(LEGACY_WEIGHTS.to_string()));
        eprintln!(
            "[coach] refusing to load {} — family {:?}, expected {:?}",
            model_path.display(),
            family,
            crate::models::CURRENT_BRAIN_FAMILY,
        );
        return Ok(false);
    }

    #[cfg(not(feature = "coach-llm"))]
    {
        // No LLM in this build: the weights on disk cannot be read, so
        // stay in template mode and say so.
        let _ = fallback_name;
        status.set_error(Some(NO_LLM_IN_BUILD.to_string()));
        return Ok(false);
    }

    #[cfg(feature = "coach-llm")]
    {
        let wanted = fingerprint(model_path);

        // Fast path: the exact weights we already have.
        {
            let engine = handle.lock()?;
            if engine.is_loaded() && engine.fingerprint == wanted && status.resident() {
                return Ok(true);
            }
        }

        // Exactly one loader at a time. A second caller is told the truth
        // — a load is happening — rather than starting a rival one that
        // would have to tear down the winner's worker.
        if status
            .loading
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Ok(true);
        }
        let _loading = LoadingGuard(&status);

        // The incumbent worker, if any. Cloned out under the mutex and
        // driven *outside* it — the reload blocks for as long as the load
        // takes, and nothing else may wait on the mutex for that long.
        let incumbent = { handle.lock()?.llm.clone() };

        let (worker, name) = match incumbent {
            Some(worker) => match worker.reload(model_path) {
                Ok(name) => (worker, name),
                Err(llm::GenError::Failed(e)) => {
                    // The old model is untouched and still answering.
                    status.set_error(Some(e.clone()));
                    return Err(e);
                }
                Err(llm::GenError::WorkerGone) => {
                    // Dead thread — drop it and start over.
                    {
                        let mut engine = handle.lock()?;
                        engine.llm = None;
                        engine.fingerprint = None;
                        engine.publish(None);
                    }
                    drop(worker);
                    let (worker, name) = llm::LlmWorker::spawn(model_path).inspect_err(|e| {
                        status.set_error(Some(e.clone()));
                    })?;
                    (Arc::new(worker), name)
                }
            },
            None => {
                let (worker, name) = llm::LlmWorker::spawn(model_path).inspect_err(|e| {
                    status.set_error(Some(e.clone()));
                })?;
                (Arc::new(worker), name)
            }
        };

        let display = if name.trim().is_empty() {
            fallback_name.to_string()
        } else {
            name
        };
        let mut engine = handle.lock()?;
        engine.llm = Some(worker);
        engine.fingerprint = wanted;
        engine.publish(Some(display));
        status.set_error(None);
        Ok(true)
    }
}

/// Drop the resident worker and free its RAM.
///
/// Called when the user turns the brain tier off, before "Remove models"
/// deletes the weights out from under a live mmap (Windows refuses the
/// delete outright; macOS lets the worker keep running weights that are
/// no longer on disk), and by the idle timer. The next session start
/// reloads.
pub fn unload_model(handle: &CoachHandle) -> Result<(), String> {
    // The worker's `Drop` closes the job channel and *joins* the thread —
    // a blocking wait, so it happens after the mutex is released.
    #[cfg(feature = "coach-llm")]
    let previous = {
        let mut engine = handle.lock()?;
        let previous = engine.llm.take();
        engine.fingerprint = None;
        engine.publish(None);
        previous
    };
    #[cfg(not(feature = "coach-llm"))]
    {
        let engine = handle.lock()?;
        engine.publish(None);
    }
    handle.status().set_error(None);
    #[cfg(feature = "coach-llm")]
    drop(previous);
    Ok(())
}

/// Test-only: end the resident worker's thread while leaving the handle
/// installed, so `generate` meets the "channel is dead" case for real.
#[cfg(all(test, feature = "coach-llm"))]
fn kill_worker_for_test(handle: &CoachHandle) {
    let worker = handle.lock().expect("lock").llm.clone();
    if let Some(worker) = worker {
        worker.kill_for_test();
    }
}

/// Resets the `loading` flag however the load exits.
#[cfg(feature = "coach-llm")]
struct LoadingGuard<'a>(&'a CoachStatus);

#[cfg(feature = "coach-llm")]
impl Drop for LoadingGuard<'_> {
    fn drop(&mut self) {
        self.0.loading.store(false, Ordering::Release);
    }
}

/// Generate a coaching comment from structured DSP data.
///
/// Takes the engine mutex only long enough to clone the worker handle;
/// the generation itself — hundreds of milliseconds to several seconds —
/// runs with the mutex released, so a Settings render never queues behind
/// it. Every failure mode ends at the template engine rather than at the
/// caller: an empty generation, a paraphrase truncated by the token
/// budget, a decode error, or a dead worker.
#[cfg_attr(not(feature = "coach-llm"), allow(unused_variables))]
pub fn generate(handle: &CoachHandle, kind: GenKind, context: &str) -> Result<String, String> {
    #[cfg(feature = "coach-llm")]
    {
        // AGENTS.md latency tiers: no *blocking* inference on the tip
        // path. A CPU-only backend measured 7–11 s per call, which is
        // three to four times the whole mid-session tip budget, so tips
        // there are template-only. A GPU backend rephrases within budget.
        let tip_on_cpu = kind == GenKind::Tip && llm::BACKEND == "cpu";
        if !tip_on_cpu {
            let worker = { handle.lock()?.llm.clone() };
            if let Some(worker) = worker {
                match worker.generate(context, kind) {
                    Ok(text) => return Ok(text),
                    Err(llm::GenError::WorkerGone) => {
                        handle.status().clear_residency("inference thread is gone");
                    }
                    Err(llm::GenError::Failed(e)) => {
                        eprintln!("[coach] {kind:?} generation unusable ({e}) — using template");
                    }
                }
            }
        }
    }

    // Template-based fallback
    generate_template(kind, context)
}

/// Per-call generation cap (ROADMAP §0.3 / T04).
///
/// A rephrase is a one-or-two-sentence paraphrase of a template the JS
/// side already rendered — 64 tokens is comfortably more than it can
/// legitimately need, and capping it is what keeps the rephrase path
/// inside the mid-session tip budget (AGENTS.md latency tiers) when the
/// model decides to be chatty. Chat answers, mini-reports and session
/// summaries get the full 256.
pub const REPHRASE_MAX_TOKENS: usize = 64;
pub const CHAT_MAX_TOKENS: usize = 256;

/// Verdict on one raw generation, before it can reach the feed.
///
/// Two failure modes that used to be shipped to the user:
///
///   * **empty** — `strip_think` can legitimately return `""` when the
///     model spent its whole budget reasoning. `useSegmentCoach` and the
///     session-summary path both assigned the result unconditionally, so
///     a blank mini-report replaced a perfectly good template.
///   * **truncated** — a rephrase that hit the 64-token budget without
///     ever emitting an end-of-generation token stopped mid-sentence.
///     Only rephrase-class kinds are judged this way: a chat answer or a
///     report legitimately runs long, and half of a long answer is still
///     an answer.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub(crate) fn usable_output(kind: GenKind, raw: &str, hit_eog: bool) -> Result<String, String> {
    let text = raw.trim();
    if text.is_empty() {
        return Err("model produced no text".to_string());
    }
    if kind.is_rephrase() && !hit_eog {
        return Err("truncated".to_string());
    }
    Ok(text.to_string())
}

/// Inference thread count (ROADMAP §3: `max(1, physical_cores - 2)`).
///
/// Split out from the worker so the arithmetic is testable on a build
/// without the LLM feature. The old implementation halved
/// `available_parallelism` as an SMT proxy, which is simply wrong on a
/// machine that does not do SMT: an 8-core Apple M1 got 2 threads and a
/// 4-core desktop got 1.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub(crate) fn threads_from_physical(physical: usize) -> i32 {
    physical.max(1).saturating_sub(2).max(1).min(i32::MAX as usize) as i32
}

/// Remove Qwen3 reasoning blocks from generated text.
///
/// We already ask for a non-thinking turn twice over (a `/no_think`
/// directive in the system message and an empty `<think></think>` block
/// prefilled into the assistant turn — see `llm::build_prompt`), but a
/// quantised 4B model under a temperature of 0.7 can still open one, and
/// a legacy or third-party GGUF may ignore the directive entirely. The
/// user must never see reasoning text, so strip it defensively:
///
///  * every complete `<think>…</think>` pair is removed;
///  * an unterminated `<think>` swallows the rest of the output (the
///    model ran out of budget mid-thought — there is no answer after it);
///  * a stray leading `</think>` (the prefill's closing tag echoed back)
///    drops everything up to and including it.
///
/// Returns the trimmed remainder, which may be empty — callers on the JS
/// side already treat an empty rephrase as "use the template".
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
fn strip_think(raw: &str) -> String {
    const OPEN: &str = "<think>";
    const CLOSE: &str = "</think>";

    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(open) = rest.find(OPEN) {
        out.push_str(&rest[..open]);
        let after = &rest[open + OPEN.len()..];
        match after.find(CLOSE) {
            Some(close) => rest = &after[close + CLOSE.len()..],
            // Unterminated block: everything from `<think>` onwards is
            // reasoning that never reached a conclusion. Drop it.
            None => {
                rest = "";
                break;
            }
        }
    }
    out.push_str(rest);

    // A bare closing tag can only be the echo of the prefilled block, so
    // whatever precedes it is reasoning too.
    if let Some(pos) = out.rfind(CLOSE) {
        out = out[pos + CLOSE.len()..].to_string();
    }
    out.trim().to_string()
}

/// Extract the trimmed value after a key prefix from the context string.
/// Searches all lines for the first one containing `key`, then returns
/// everything after the key text, left-trimmed of whitespace.
fn extract_str<'a>(context: &'a str, key: &str) -> Option<&'a str> {
    context
        .lines()
        .find(|l| l.trim_start().starts_with(key))
        .map(|l| l[l.find(key).unwrap() + key.len()..].trim())
}

/// Template-based generation — parses the structured context and produces a response.
///
/// The branch is chosen by the caller's `kind`, not by sniffing the
/// prompt for magic substrings ("ended their practice session",
/// "User asks:", "Rephrase this practice-coach observation"). Those
/// markers live in JS-owned prompt text, so a prompt reworded on that
/// side silently re-routed the template engine — which is exactly how the
/// adaptive-drill prompt ended up with no branch at all.
fn generate_template(kind: GenKind, context: &str) -> Result<String, String> {
    // Parse key metrics from the context string
    let accuracy = extract_metric(context, "Accuracy:").unwrap_or(0.0);
    // `SignedDev:` is a dedicated parseable line added by the JS context
    // builder (miniReport.ts). The old "avg" key tried to extract from the
    // human-readable "Timing spread: avg ±8.1ms" line — but "±8.1ms" has a
    // ± prefix and "ms" suffix that defeat `parse::<f64>()`, so deviation
    // always resolved to 0.0 and the template always reported "right in the
    // pocket" regardless of actual timing. `SignedDev:` is plain digits only.
    let deviation = extract_metric(context, "SignedDev:")
        .unwrap_or_else(|| extract_metric(context, "avg").unwrap_or(0.0));
    // Hit completeness — what fraction of expected subdivision positions had
    // a matched onset. Low values (< 0.50) explain why a well-timed player
    // can still score in the 40s: they're playing phrases, not every slot.
    // Falls back to 1.0 (assume full coverage) if the field isn't present.
    let hit_completeness = extract_metric(context, "HitCompleteness:").unwrap_or(1.0);
    let streak = extract_int(context, "Longest clean streak:").unwrap_or(0);
    // The mini-report card shows a `ScoreRing` with the composite
    // four-component score adjacent to the coach text. Surfacing the
    // accuracy percent (`hits / (hits + miss)`) as the headline number
    // in the template caused user-visible confusion in v0.9 — the
    // circle would read "65" while the text said "Rough patch at 50%"
    // and the two metrics looked contradictory. We now lead with the
    // score so the text and the badge agree; accuracy still appears
    // but as a secondary detail.
    let score = extract_int(context, "Score:").unwrap_or(0);

    match kind {
        GenKind::Chat => {
            // Extract the question
            let question = context
                .lines()
                .find(|l| l.starts_with("User asks:"))
                .map(|l| l.trim_start_matches("User asks:").trim())
                .unwrap_or("");
            return Ok(format_chat_response(question, accuracy, deviation));
        }
        // Both arrive as a rephrase prompt with the JS-rendered template
        // embedded under `Original: "…"`. Without an LLM we cannot
        // paraphrase, but that template is fully shippable on its own —
        // return it verbatim.
        GenKind::Greeting => return Ok(format_greeting(context)),
        GenKind::Tip => return Ok(format_rephrase_observation(context)),
        GenKind::Summary => return Ok(format_session_summary(accuracy, deviation, streak)),
        // The drill prompt carries no template to fall back to — the JS
        // side holds its own catalog line for exactly this case and
        // emits it when this call fails. Inventing a generic sentence
        // here would *replace* that specific line with a worse one.
        GenKind::Drill => {
            return Err("no drill narration without a model".to_string());
        }
        GenKind::Report => {}
    }

    // Mini-report
    let timing_pattern = extract_str(context, "TimingPattern:").unwrap_or("solid");
    let coach_mode = extract_str(context, "CoachMode:").unwrap_or("default");

    // Detect noodling: the JS side embeds a free-play hint rather than a key.
    let is_noodling = context.contains("free-playing/noodling");

    let comment = if is_noodling {
        pick(NOODLING).to_string()
    } else {
        format_mini_report(
            score,
            hit_completeness,
            timing_pattern,
            coach_mode,
            accuracy,
            streak,
        )
    };
    Ok(comment)
}

/// Template-fallback for the real-time rephrase prompt.
///
/// The JS-side gatekeeper has already filled a scenario-specific
/// template (e.g. "{recentAccuracyPct}% — your kick is drifting.
/// Lock the right foot to the click before the snare.") and embedded
/// it under `Original: "..."`. Without an LLM we can't actually
/// paraphrase, but the template is fully self-sufficient — return it
/// verbatim so the coach voices the gatekeeper's intent rather than a
/// generic mini-report placeholder.
///
/// Falls back to a short defensive opener if the Original block is
/// missing (shouldn't happen — `buildRephrasePrompt` always emits one).
fn format_rephrase_observation(context: &str) -> String {
    if let Some(original) = extract_original_quote(context) {
        return original;
    }
    "Keep going — locked in on the click.".to_string()
}

/// Render a fallback greeting when the LLM rephrase isn't available.
///
/// The JS side already produced a context-aware, history-aware greeting
/// (preset name, last score, target, downtrend handling, etc.) and
/// embeds it in the rephrase prompt as `Original: "..."`. Without an
/// LLM we can't actually rephrase, but the JS template is fully shippable
/// on its own — return it verbatim so the user sees the same warm,
/// specific message they'd get from the LLM.
///
/// If we can't find an `Original: "..."` block we fall through to a
/// short, friendly default rather than the prior "Free practice — play
/// when you're ready..." which felt too cold.
fn format_greeting(context: &str) -> String {
    if let Some(original) = extract_original_quote(context) {
        return original;
    }
    // No Original block — emit a warm, generic opener. This branch
    // shouldn't normally fire (the JS rephrase prompt always includes
    // Original) but is defensive against future prompt-format drift.
    "Hey — ready when you are. Hit play and I'll start picking up your timing.".to_string()
}

/// Extract the text inside the first `Original: "..."` block of the
/// rephrase prompt. Returns None if the marker isn't present.
fn extract_original_quote(context: &str) -> Option<String> {
    let start = context.find("Original: \"")?;
    let rest = &context[start + "Original: \"".len()..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

// ---------------------------------------------------------------------------
// Phrase banks — 5 variants per scenario, picked via VARIANT_COUNTER.
// Language rules: no IC/GA/HC/onset/grid-alignment/mean-deviation/interval-consistency.
// Default mode: no millisecond numbers. Pro mode: can say "about 15ms early", etc.
// ---------------------------------------------------------------------------

const GREAT_DEFAULT: &[&str] = &[
    "Really locked in — your timing is right there.",
    "Solid feel, keep riding that groove.",
    "Your timing is sitting right where it should be.",
    "Clean rhythm — that's the pocket.",
    "Locked in tight — great work.",
];
const GREAT_PRO: &[&str] = &[
    "Tight beat placement and even note spacing — clean all-round.",
    "Beat placement solid, spacing consistent — push the tempo when you're ready.",
    "All timing components clean — good session.",
    "Note spacing and placement both dialled in.",
    "Timing is locked — consider bumping the tempo.",
];

const GOOD_STEADY_DEFAULT: &[&str] = &[
    "Nice and steady — good consistent tempo.",
    "Keeping it together — solid timing through the segment.",
    "Tempo is holding well.",
    "Good rhythm feel — consistent pulse.",
    "Steady timing — you're building a solid foundation.",
];
const GOOD_STEADY_PRO: &[&str] = &[
    "Solid beat placement, spacing mostly consistent — push the tempo or sharpen the attack.",
    "Good consistency — a few positions drift but the center holds.",
    "Timing center is on, spacing is reliable.",
    "Placement and spacing solid — room to push harder.",
    "Consistent feel — timing foundation is there.",
];

const RUSHING_DEFAULT: &[&str] = &[
    "You're leaning into the beat a little — try letting it come to you.",
    "Arriving a touch early — sit back and let the pulse breathe.",
    "The tempo is pushing forward — ease off the attack slightly.",
    "You're ahead of the beat — try staying back with it.",
    "A bit of a rush happening — slow your attack, not your tempo.",
];
const RUSHING_PRO: &[&str] = &[
    "Consistently landing early — directional early bias in the attack timing.",
    "Note attacks are arriving before the beat — ease the attack forward slightly.",
    "Early attack pattern — your notes are preceding the beat.",
    "Consistent early bias — the attack is rushing the pulse.",
    "Timing is shifted early — let the beat land first, then hit.",
];

const DRAGGING_DEFAULT: &[&str] = &[
    "Settling a bit behind the beat — try staying a little more forward.",
    "The tempo is dragging back — keep your attack crisp.",
    "You're lagging slightly — push the attack forward.",
    "Behind the beat — try keeping the energy moving forward.",
    "A bit of drag happening — sharpen the attack.",
];
const DRAGGING_PRO: &[&str] = &[
    "Consistently landing late — directional late bias in the attack timing.",
    "Note attacks are landing after the beat — sharpen the attack slightly.",
    "Late attack pattern — notes are trailing the beat.",
    "Consistent late bias — the attack is dragging the pulse.",
    "Timing is shifted late — push the attack to meet the beat.",
];

const OSCILLATING_DEFAULT: &[&str] = &[
    "The tempo is moving around — speeding up and slowing down.",
    "Note spacing is uneven — try keeping the gaps between notes equal.",
    "The pulse is wandering a bit — focus on steady spacing between notes.",
    "Rushing then dragging — try locking into one steady feel.",
    "Tempo consistency needs work — focus on equal note spacing.",
];
const OSCILLATING_PRO: &[&str] = &[
    "High timing variance despite a near-neutral average — the timing is genuinely unstable.",
    "Not a directional bias — the timing is alternating early and late.",
    "Tempo instability detected: spacing between notes is inconsistent.",
    "Rushing-dragging pattern — not a fixed offset, true variance in the timing.",
    "Timing variance is high — focus on keeping note spacing consistent.",
];

const LOW_SCORE_SOLID_DEFAULT: &[&str] = &[
    "Your timing center is good — focus on hitting more of the beats.",
    "Timing is in the right place, but you're missing some positions — fill those gaps.",
    "Good timing feel, but the rhythm needs more coverage — play more of the beats.",
    "The pulse is there but the rhythm is thin — try hitting more positions.",
    "Your timing is centered well — now work on density.",
];
const LOW_SCORE_SOLID_PRO: &[&str] = &[
    "Timing center and spacing are clean but beat coverage is low.",
    "Good placement accuracy but too many beat positions are empty.",
    "Note spacing is consistent but density is low — hit more of the beat positions.",
    "Timing fundamentals are there, coverage is the gap.",
    "Placement is accurate — focus on filling out more beat positions.",
];

const LOW_COVERAGE: &[&str] = &[
    "I'm only hearing some of your playing — check your input level or play a touch louder.",
    "Signal is coming in low — try playing with a bit more attack.",
    "Low detection rate — you may need to turn up your input gain.",
    "Only picking up part of your playing — check the input level in settings.",
    "Weak signal coming in — play louder or check your input gain.",
];

const NOODLING: &[&str] = &[
    "Good free feel — let the ideas flow.",
    "Nice exploration — when you're ready, bring it back to the pulse.",
    "Creative space — use it well.",
    "Good free play — follow the feel.",
    "Let it breathe — come back to the beat when you're ready.",
];

/// Pick the next phrase from a bank, rotating via the global counter.
fn pick<'a>(bank: &[&'a str]) -> &'a str {
    bank[VARIANT_COUNTER.fetch_add(1, Ordering::Relaxed) as usize % bank.len()]
}

/// Score-first mini-report using mode-aware phrase banks.
///
/// Scenario cascade (in priority order):
///   accuracy < 60  → low_coverage (signal quality)
///   oscillating    → oscillating
///   rushing        → rushing
///   dragging       → dragging
///   score >= 85    → great
///   score >= 65    → good_steady
///   else           → low_score_solid_timing
fn format_mini_report(
    score: u32,
    hit_completeness: f64,
    timing_pattern: &str,
    coach_mode: &str,
    accuracy: f64,
    streak: u32,
) -> String {
    let _ = hit_completeness; // retained in signature for future use
    let _ = streak; // retained in signature for future use
    let is_pro = coach_mode == "pro";

    let phrase = if accuracy < 60.0 {
        pick(LOW_COVERAGE)
    } else if timing_pattern == "oscillating" {
        pick(if is_pro {
            OSCILLATING_PRO
        } else {
            OSCILLATING_DEFAULT
        })
    } else if timing_pattern == "rushing" {
        pick(if is_pro { RUSHING_PRO } else { RUSHING_DEFAULT })
    } else if timing_pattern == "dragging" {
        pick(if is_pro {
            DRAGGING_PRO
        } else {
            DRAGGING_DEFAULT
        })
    } else if score >= 85 {
        pick(if is_pro { GREAT_PRO } else { GREAT_DEFAULT })
    } else if score >= 65 {
        pick(if is_pro {
            GOOD_STEADY_PRO
        } else {
            GOOD_STEADY_DEFAULT
        })
    } else {
        // solid timing, low score → coverage issue
        pick(if is_pro {
            LOW_SCORE_SOLID_PRO
        } else {
            LOW_SCORE_SOLID_DEFAULT
        })
    };

    phrase.to_string()
}

fn format_session_summary(accuracy: f64, deviation: f64, streak: u32) -> String {
    let tendency = if deviation.abs() < 3.0 {
        "centered timing"
    } else if deviation < 0.0 {
        "a slight rush"
    } else {
        "a slight drag"
    };

    // v0.10: the low-accuracy branch used to open with "Tough
    // session…" which read as a verdict. This is a practice tool, not
    // an exam — and a low accuracy reading is often a detection-
    // sensitivity issue (under-counted onsets), not a "tough session."
    // Reframed all three branches to lead with what's worth carrying
    // forward instead of what fell short. The accuracy ladder still
    // dispatches on the same thresholds so the wording tracks reality.
    if accuracy >= 85.0 {
        format!(
            "Locked in — {accuracy:.0}% accuracy with {tendency}. \
             Best streak was {streak} beats. Try nudging the tempo up next time."
        )
    } else if accuracy >= 60.0 {
        format!(
            "Good session — {accuracy:.0}% accuracy with {tendency}. \
             Pick one passage that felt off and run it a few more times."
        )
    } else {
        format!(
            "Plenty to build on — {tendency} with a {streak}-beat best streak. \
             Try dropping the tempo a touch and locking in a clean bar."
        )
    }
}

fn format_chat_response(question: &str, accuracy: f64, deviation: f64) -> String {
    let q = question.to_lowercase();
    if q.contains("timing") || q.contains("how was") || q.contains("how did") {
        let timing = if deviation.abs() < 5.0 {
            "Your timing was solid — pretty centered on the beat."
        } else if deviation < 0.0 {
            "You were pushing slightly ahead of the beat on average."
        } else {
            "You were sitting slightly behind the beat on average."
        };
        format!("{timing} Overall accuracy was {accuracy:.0}%.")
    } else if q.contains("focus") || q.contains("improve") || q.contains("work on") {
        if deviation.abs() > 10.0 {
            "Focus on locking in with the click — your timing is drifting. Try a slower tempo and nail the pocket.".to_string()
        } else if accuracy < 80.0 {
            "Work on clean hits at this tempo before pushing faster. Accuracy first, speed second."
                .to_string()
        } else {
            "You're in good shape. Try pushing the tempo up 5 BPM and see if you can maintain this accuracy.".to_string()
        }
    } else {
        format!("Your session shows {accuracy:.0}% accuracy with an average deviation of {deviation:.1}ms. Keep at it!")
    }
}

fn extract_metric(text: &str, prefix: &str) -> Option<f64> {
    text.lines().find(|l| l.contains(prefix)).and_then(|l| {
        l.split_whitespace()
            .find_map(|w| w.trim_end_matches('%').parse::<f64>().ok())
    })
}

fn extract_int(text: &str, prefix: &str) -> Option<u32> {
    text.lines().find(|l| l.contains(prefix)).and_then(|l| {
        let after = l.split(prefix).nth(1)?;
        after.split_whitespace().next()?.parse::<u32>().ok()
    })
}

// NOTE: `format_mini_report_context`, `format_session_summary_context`,
// and `format_chat_context` used to live here as Rust-side formatters
// for the LLM prompt. The JS layer now owns prompt assembly in
// `src/hooks/useSession.ts` (`formatMiniReportContext`,
// `formatSessionContext`, the chat literal in `sendChat`) — keeping
// the formatting on the side that also owns gatekeeper context and
// narrative state means there is exactly one source of truth for
// "what goes into the LLM." Removed during the Step-4 house-cleaning
// pass after they sat dead since the Phase-5 refactor.

// ---------------------------------------------------------------------------
// LLM backend (only compiled with coach-llm feature)
// ---------------------------------------------------------------------------

#[cfg(feature = "coach-llm")]
mod llm {
    use std::path::{Path, PathBuf};
    use std::sync::mpsc::{channel, sync_channel, Receiver, Sender, SyncSender};

    use llama_cpp_2::context::params::LlamaContextParams;
    use llama_cpp_2::context::LlamaContext;
    use llama_cpp_2::llama_backend::LlamaBackend;
    use llama_cpp_2::llama_batch::LlamaBatch;
    use llama_cpp_2::model::params::LlamaModelParams;
    use llama_cpp_2::model::LlamaModel;
    use llama_cpp_2::sampling::LlamaSampler;

    /// ROADMAP §0.3: `n_ctx` 4096. Qwen3 trains at 32k but the coach's
    /// longest prompt (a session summary with narrative + history) is a
    /// few hundred tokens; 4096 leaves generous headroom while keeping
    /// the KV buffer — allocated once now, not per call — small.
    const CONTEXT_SIZE: u32 = 4096;

    /// Which llama.cpp backend this binary was compiled against. Reported in
    /// the load log so a bug report can say whether the GPU path was even
    /// available. (`coach-llm` alone is a CPU-only build.)
    pub const BACKEND: &str = if cfg!(feature = "coach-llm-metal") {
        "metal"
    } else if cfg!(feature = "coach-llm-vulkan") {
        "vulkan"
    } else {
        "cpu"
    };

    /// True when this build has a GPU backend linked in. Derived from
    /// `BACKEND` so a future backend feature is one edit, not two.
    const HAS_GPU_BACKEND: bool = !matches!(BACKEND.as_bytes(), b"cpu");

    /// Layers to offload when a GPU backend is compiled in. `with_n_gpu_layers`
    /// takes a `u32` and saturates into `i32`, so `u32::MAX` lands on
    /// `i32::MAX` — llama.cpp's idiom for "all layers".
    const ALL_GPU_LAYERS: u32 = u32::MAX;

    /// How many layers to try to offload on this build, honouring the
    /// `YAMES_LLM_GPU_LAYERS` override.
    ///
    /// The override exists for two callers that must be able to force CPU
    /// inference on a GPU build: the audio-safety jitter probe (ROADMAP §0.5
    /// runs generation "CPU-only forced") and anyone debugging a driver.
    /// Setting it to `0` disables offload entirely.
    fn requested_gpu_layers() -> u32 {
        // No GPU backend linked in means there is nothing to offload to;
        // asking for layers would only produce a confusing warning.
        let default = if HAS_GPU_BACKEND { ALL_GPU_LAYERS } else { 0 };
        match std::env::var("YAMES_LLM_GPU_LAYERS") {
            Ok(raw) => raw.trim().parse::<u32>().unwrap_or_else(|_| {
                eprintln!("[coach] YAMES_LLM_GPU_LAYERS={raw:?} is not a number — ignoring");
                default
            }),
            Err(_) => default,
        }
    }

    /// Physical cores on this machine.
    ///
    /// `available_parallelism` reports *logical* CPUs and std has no
    /// physical-core query, so this used to halve it as an SMT proxy —
    /// which under-counts by 2× on every machine that does not do SMT.
    /// An 8-core Apple M1 got `8/2 - 2 = 2` inference threads and a
    /// 4-core desktop got 1. `num_cpus` asks the OS.
    ///
    /// On Apple Silicon the honest denominator is the *performance* core
    /// count: the efficiency cores are a third to a quarter of the speed,
    /// and llama.cpp's decode is a barrier-synchronised fork/join, so a
    /// batch spread across both classes runs at E-core pace.
    fn physical_cores() -> usize {
        #[cfg(target_os = "macos")]
        if let Some(perf) = performance_cores() {
            return perf;
        }
        num_cpus::get_physical()
    }

    /// `hw.perflevel0.logicalcpu` — the P-core cluster on an Apple Silicon
    /// machine. Absent on Intel Macs (and on any kernel that does not
    /// publish it), in which case the caller falls back to physical cores.
    #[cfg(target_os = "macos")]
    fn performance_cores() -> Option<usize> {
        let mut value: i32 = 0;
        let mut len = std::mem::size_of::<i32>();
        let name = c"hw.perflevel0.logicalcpu";
        // SAFETY: `sysctlbyname` writes at most `len` bytes into `value`.
        let rc = unsafe {
            libc::sysctlbyname(
                name.as_ptr(),
                std::ptr::addr_of_mut!(value).cast(),
                &mut len,
                std::ptr::null_mut(),
                0,
            )
        };
        (rc == 0 && value > 0).then_some(value as usize)
    }

    /// Inference thread count (ROADMAP §3: `max(1, physical_cores - 2)`).
    fn inference_threads() -> i32 {
        super::threads_from_physical(physical_cores())
    }

    fn load_model_file(
        backend: &LlamaBackend,
        path: &std::path::Path,
        n_gpu_layers: u32,
    ) -> Result<LlamaModel, String> {
        let params = LlamaModelParams::default().with_n_gpu_layers(n_gpu_layers);
        LlamaModel::load_from_file(backend, path, &params)
            .map_err(|e| format!("Failed to load model: {e}"))
    }

    /// Build the Qwen3 chat prompt.
    ///
    /// Hand-built ChatML rather than `LlamaModel::apply_chat_template`
    /// on purpose. llama.cpp's `llama_chat_apply_template` (which is what
    /// that method calls) is **not** a Jinja engine: it sniffs the GGUF's
    /// template string for known markers and, seeing `<|im_start|>`,
    /// renders generic ChatML. Every bit of Qwen3's template that we
    /// actually care about — the `enable_thinking` switch and the empty
    /// `<think>` block it emits when thinking is off — is silently
    /// dropped. Building the string ourselves is both cheaper and the
    /// only way to get the non-thinking turn.
    ///
    /// Thinking is disabled two ways, because either alone has been seen
    /// to leak on a Q4 quant:
    ///   1. `/no_think` in the system message — the documented Qwen3
    ///      soft switch;
    ///   2. an empty `<think></think>` block prefilled into the assistant
    ///      turn, which is exactly what the official template emits for
    ///      `enable_thinking=false`, so the model continues with content
    ///      instead of opening a reasoning block.
    /// `super::strip_think` cleans up anything that still gets through.
    ///
    /// The old prompt was Phi-3 style (`<|system|>` … `<|assistant|>`).
    /// Qwen3 has no such tokens, so they tokenised as literal text and
    /// showed up in the model's output as template artifacts.
    fn build_prompt(context: &str) -> String {
        format!(
            "<|im_start|>system\n{system}\n\n/no_think<|im_end|>\n\
             <|im_start|>user\n{context}<|im_end|>\n\
             <|im_start|>assistant\n<think>\n\n</think>\n\n",
            system = super::SYSTEM_PROMPT,
        )
    }

    // -----------------------------------------------------------------
    // Inference thread
    // -----------------------------------------------------------------

    /// One generation's raw result. `tokens` is what makes an honest
    /// tokens/second figure possible in `latency_bench`; `hit_eog` is what
    /// tells a finished sentence from one the budget cut off.
    pub struct Generated {
        pub text: String,
        /// Only read by `latency_bench`, which is the reason the count is
        /// carried at all — a tokens/second figure someone measured beats
        /// one someone typed into a PR.
        #[cfg_attr(not(test), allow(dead_code))]
        pub tokens: usize,
        pub hit_eog: bool,
    }

    /// Why a job did not produce usable text.
    ///
    /// The distinction matters: `WorkerGone` means the thread is dead and
    /// residency has to be cleared so the next session start spawns a
    /// replacement, while `Failed` is a bad generation on a healthy worker
    /// and only costs this one call.
    #[derive(Debug)]
    pub enum GenError {
        WorkerGone,
        Failed(String),
    }

    impl std::fmt::Display for GenError {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            match self {
                GenError::WorkerGone => write!(f, "inference thread is gone"),
                GenError::Failed(e) => write!(f, "{e}"),
            }
        }
    }

    enum Job {
        Generate {
            context: String,
            max_tokens: usize,
            reply: SyncSender<Result<Generated, String>>,
        },
        /// Swap in different weights *on the worker's own thread*.
        ///
        /// `LlamaBackend::init()` is a process-wide one-shot, so a second
        /// worker cannot be spawned while this one lives — but a second
        /// `LlamaModel` against the same backend is fine. Loading here
        /// means the incumbent model keeps answering until the new one is
        /// known-good, so a failed "Update brain" no longer leaves the
        /// user with no brain at all.
        Reload {
            path: PathBuf,
            reply: SyncSender<Result<String, String>>,
        },
        /// Test-only: end the thread while the handle stays resident, so
        /// the dead-worker fallback can be exercised without killing a
        /// thread out from under llama.cpp.
        #[cfg(test)]
        Shutdown,
    }

    /// Handle to the coach's single, long-lived inference thread.
    ///
    /// ROADMAP §3 wants generation to run *below normal* priority so a
    /// multi-second CPU inference can never preempt the audio path. T01
    /// did that per call, on whichever tokio `spawn_blocking` worker
    /// picked the job up, and restored the priority afterwards. That is
    /// wrong on Linux: an unprivileged thread cannot lower its nice value
    /// and then raise it again (`setpriority` back down is EPERM), so the
    /// restore silently failed and every tokio blocking thread that ever
    /// ran a generation stayed demoted for the life of the process —
    /// including the ones that later ran TTS synthesis and device
    /// enumeration.
    ///
    /// One dedicated thread, demoted exactly once at spawn and never
    /// restored, removes the whole problem: nothing else runs on it, so
    /// there is nothing to restore. It also serialises generations
    /// (llama.cpp contexts are single-writer anyway) and — the reason
    /// this task exists — lets the `LlamaContext` and its KV buffer be
    /// created once and reused, instead of being rebuilt per call.
    pub struct LlmWorker {
        /// `Option` only so `Drop` can close the channel before joining.
        jobs: Option<Sender<Job>>,
        handle: Option<std::thread::JoinHandle<()>>,
    }

    impl LlmWorker {
        /// Spawn the thread and block until the model has finished
        /// loading (or failed). Callers already treat `load_model` as a
        /// slow, fallible operation. Returns the model's display name,
        /// read from GGUF metadata.
        pub fn spawn(path: &Path) -> Result<(Self, String), String> {
            let (job_tx, job_rx) = channel::<Job>();
            let (ready_tx, ready_rx) = sync_channel::<Result<String, String>>(1);
            let owned = path.to_path_buf();

            let handle = std::thread::Builder::new()
                .name("yames-coach-llm".to_string())
                .spawn(move || run(owned, ready_tx, job_rx))
                .map_err(|e| format!("Failed to spawn inference thread: {e}"))?;

            match ready_rx.recv() {
                Ok(Ok(name)) => Ok((
                    LlmWorker {
                        jobs: Some(job_tx),
                        handle: Some(handle),
                    },
                    name,
                )),
                Ok(Err(e)) => {
                    let _ = handle.join();
                    Err(e)
                }
                Err(_) => {
                    let _ = handle.join();
                    Err("inference thread exited before reporting load status".to_string())
                }
            }
        }

        /// One generation, judged against the kind's contract: an empty
        /// or budget-truncated rephrase is a `Failed`, not text to ship.
        pub fn generate(&self, context: &str, kind: super::GenKind) -> Result<String, GenError> {
            let out = self.run_job(context, kind.max_tokens())?;
            super::usable_output(kind, &out.text, out.hit_eog).map_err(GenError::Failed)
        }

        /// Raw generation with an explicit budget — the latency bench
        /// wants the token count and does not care whether the text is
        /// shippable. Nothing in the shipping path calls it.
        #[cfg_attr(not(test), allow(dead_code))]
        pub fn generate_measured(
            &self,
            context: &str,
            max_tokens: usize,
        ) -> Result<(String, usize), String> {
            let out = self.run_job(context, max_tokens).map_err(|e| e.to_string())?;
            Ok((out.text, out.tokens))
        }

        fn run_job(&self, context: &str, max_tokens: usize) -> Result<Generated, GenError> {
            let (reply_tx, reply_rx) = sync_channel::<Result<Generated, String>>(1);
            let jobs = self.jobs.as_ref().ok_or(GenError::WorkerGone)?;
            jobs.send(Job::Generate {
                context: context.to_string(),
                max_tokens,
                reply: reply_tx,
            })
            .map_err(|_| GenError::WorkerGone)?;
            reply_rx
                .recv()
                .map_err(|_| GenError::WorkerGone)?
                .map_err(GenError::Failed)
        }

        /// Load different weights on this worker's thread and swap them in
        /// only if that succeeds. Returns the new model's display name.
        pub fn reload(&self, path: &Path) -> Result<String, GenError> {
            let (reply_tx, reply_rx) = sync_channel::<Result<String, String>>(1);
            let jobs = self.jobs.as_ref().ok_or(GenError::WorkerGone)?;
            jobs.send(Job::Reload {
                path: path.to_path_buf(),
                reply: reply_tx,
            })
            .map_err(|_| GenError::WorkerGone)?;
            reply_rx
                .recv()
                .map_err(|_| GenError::WorkerGone)?
                .map_err(GenError::Failed)
        }

        /// Test-only: make the inference thread exit while this handle
        /// stays installed on the engine — the exact shape of "the worker
        /// died but `engine.llm` is still `Some`" that item 4 fixes.
        #[cfg(test)]
        pub fn kill_for_test(&self) {
            if let Some(jobs) = self.jobs.as_ref() {
                let _ = jobs.send(Job::Shutdown);
            }
        }
    }

    impl Drop for LlmWorker {
        fn drop(&mut self) {
            // Closing the job channel is what ends the worker's loop, and
            // joining is what guarantees its `LlamaBackend` has been
            // dropped — `LlamaBackend::init()` is a process-wide one-shot,
            // so a replacement worker cannot start until this one is
            // fully gone (see `super::load_model`).
            drop(self.jobs.take());
            if let Some(handle) = self.handle.take() {
                let _ = handle.join();
            }
        }
    }

    /// Load the weights at `path`, retrying on the CPU if the GPU refuses.
    ///
    /// GPU first, always. A Vulkan/Metal build on a machine with no usable
    /// device normally still loads — llama.cpp reports zero offloadable
    /// devices and keeps every layer on the CPU — but a broken driver can
    /// fail the load outright, so retry rather than leaving the user with
    /// a dead brain.
    fn load_with_fallback(backend: &LlamaBackend, path: &Path) -> Result<LlamaModel, String> {
        let requested = requested_gpu_layers();
        let n_threads = inference_threads();
        eprintln!(
            "[coach] loading {} (backend={BACKEND}, n_gpu_layers={requested}, n_threads={n_threads})",
            path.display(),
        );
        match load_model_file(backend, path, requested) {
            Ok(model) => Ok(model),
            Err(gpu_err) if requested != 0 => {
                eprintln!("[coach] GPU load failed ({gpu_err}) — retrying with n_gpu_layers = 0");
                load_model_file(backend, path, 0)
            }
            Err(e) => Err(e),
        }
    }

    /// Human-readable model identity, from GGUF metadata.
    ///
    /// The status line used to read "model.bin on vulkan" because the
    /// name was the file name the downloader happened to write. Qwen's
    /// GGUFs carry `general.name` ("Qwen3 4B"); `general.basename` plus
    /// `general.size_label` is the fallback shape used by conversions that
    /// omit the composed name. An empty answer means the caller should use
    /// the family + tier from the download marker instead.
    fn model_display_name(model: &LlamaModel) -> String {
        if let Ok(name) = model.meta_val_str("general.name") {
            let name = name.trim();
            if !name.is_empty() {
                return name.to_string();
            }
        }
        let base = model
            .meta_val_str("general.basename")
            .unwrap_or_default()
            .trim()
            .to_string();
        if base.is_empty() {
            return String::new();
        }
        match model.meta_val_str("general.size_label") {
            Ok(size) if !size.trim().is_empty() => format!("{base} {}", size.trim()),
            _ => base,
        }
    }

    /// Thread body: own the backend, the model, the context and the
    /// batch; serve jobs until the channel closes.
    ///
    /// The model is a loop variable rather than a `let` binding so a
    /// `Reload` job can replace it without tearing the thread — and with
    /// it the process-wide `LlamaBackend` — down.
    fn run(path: PathBuf, ready: SyncSender<Result<String, String>>, jobs: Receiver<Job>) {
        // Lowered once, never restored — see `LlmWorker`.
        lower_current_thread_priority();

        let backend = match LlamaBackend::init() {
            Ok(b) => b,
            Err(e) => {
                let _ = ready.send(Err(format!("Failed to init llama backend: {e}")));
                return;
            }
        };

        let mut model = match load_with_fallback(&backend, &path) {
            Ok(model) => model,
            Err(e) => {
                let _ = ready.send(Err(e));
                return;
            }
        };
        let mut ready = Some(ready);

        loop {
            // The context — and the KV buffer behind it — is created ONCE
            // per resident model and reused for every job. T01 measured
            // Vulkan coming out slower than CPU on a 0.6B model precisely
            // because `generate` rebuilt this per call, re-allocating a
            // multi-hundred-MiB KV buffer on the GPU each time. `n_batch`
            // is raised to the full context so a long prompt decodes in a
            // single pass (the default is 2048, below our `n_ctx`).
            let n_threads = inference_threads();
            let ctx_params = LlamaContextParams::default()
                .with_n_ctx(std::num::NonZero::new(CONTEXT_SIZE))
                .with_n_batch(CONTEXT_SIZE)
                .with_n_threads(n_threads)
                .with_n_threads_batch(n_threads);
            let mut ctx = match model.new_context(&backend, ctx_params) {
                Ok(c) => c,
                Err(e) => {
                    if let Some(ready) = ready.take() {
                        let _ = ready.send(Err(format!("Context creation failed: {e}")));
                    }
                    return;
                }
            };
            let mut batch = LlamaBatch::new(CONTEXT_SIZE as usize, 1);

            if let Some(ready) = ready.take() {
                if ready.send(Ok(model_display_name(&model))).is_err() {
                    // Nobody is waiting for us any more (the caller gave
                    // up); tear down rather than sitting on a loaded model.
                    return;
                }
            }

            // Set when a `Reload` succeeded: the new model is already in
            // hand, so the old one can be dropped and the context rebuilt.
            let mut swap_in: Option<LlamaModel> = None;
            while let Ok(job) = jobs.recv() {
                match job {
                    Job::Generate {
                        context,
                        max_tokens,
                        reply,
                    } => {
                        let out = infer(&model, &mut ctx, &mut batch, &context, max_tokens);
                        let _ = reply.send(out);
                    }
                    Job::Reload { path, reply } => match load_with_fallback(&backend, &path) {
                        Ok(new_model) => {
                            let _ = reply.send(Ok(model_display_name(&new_model)));
                            swap_in = Some(new_model);
                            break;
                        }
                        Err(e) => {
                            // Keep serving from the model we already have.
                            eprintln!("[coach] reload failed ({e}) — keeping the resident model");
                            let _ = reply.send(Err(e));
                        }
                    },
                    #[cfg(test)]
                    Job::Shutdown => return,
                }
            }

            match swap_in {
                // `ctx` borrows `model`, so it has to die before the
                // binding is replaced.
                Some(new_model) => {
                    drop(ctx);
                    model = new_model;
                }
                // Job channel closed — the worker was dropped.
                None => return,
            }
        }
    }

    /// One generation against the resident context.
    fn infer(
        model: &LlamaModel,
        ctx: &mut LlamaContext<'_>,
        batch: &mut LlamaBatch,
        context: &str,
        max_tokens: usize,
    ) -> Result<Generated, String> {
        // Every call starts from an empty KV cache. The coach's prompts
        // do not share a prefix (each one embeds fresh session data), so
        // there is nothing to reuse — and leaving the previous
        // conversation resident would both poison the output and run the
        // window out of room after a handful of calls.
        //
        // `clear_kv_cache_seq(seq 0, whole range)` rather than
        // `clear_kv_cache()`: the latter is `llama_memory_clear(mem, true)`,
        // which also zeroes the KV *data* buffer — 576 MiB for Qwen3-4B at
        // n_ctx 4096, and on a Vulkan build that is a device-memory wipe
        // on every single generation. Dropping the cells is all we need;
        // stale bytes behind unreferenced cells are never read.
        //
        // A full-sequence removal "always succeeds" per the crate docs, so
        // the bool is not actionable; the error case is an out-of-range
        // sequence id, which `Some(0)` cannot be.
        if let Err(e) = ctx.clear_kv_cache_seq(Some(0), None, None) {
            return Err(format!("KV cache reset failed: {e}"));
        }

        let prompt = build_prompt(context);
        let tokens = model
            .str_to_token(&prompt, llama_cpp_2::model::AddBos::Always)
            .map_err(|e| format!("Tokenization failed: {e}"))?;

        if tokens.len() + max_tokens >= CONTEXT_SIZE as usize {
            return Err("Prompt too long for context window".into());
        }

        batch.clear();
        for (i, &token) in tokens.iter().enumerate() {
            let is_last = i == tokens.len() - 1;
            batch
                .add(token, i as i32, &[0], is_last)
                .map_err(|e| format!("Batch add failed: {e}"))?;
        }

        ctx.decode(batch)
            .map_err(|e| format!("Decode failed: {e}"))?;

        let mut output_tokens = Vec::new();
        // ROADMAP §0.3 keeps temp 0.7 / top-p 0.9. The sampler is rebuilt
        // per call so its RNG restarts from the same seed and identical
        // input yields identical output — the property the coach's
        // snapshot-style debugging depends on.
        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::temp(0.7),
            LlamaSampler::top_p(0.9, 1),
            LlamaSampler::dist(42),
        ]);

        // False when the loop exits because the budget ran out rather
        // than because the model said it was finished — the caller uses
        // that to reject a paraphrase cut off mid-sentence.
        let mut hit_eog = false;
        for _ in 0..max_tokens {
            let logits_id = batch.n_tokens() - 1;
            let token = sampler.sample(ctx, logits_id);

            if model.is_eog_token(token) {
                hit_eog = true;
                break;
            }

            output_tokens.push(token);

            batch.clear();
            batch
                .add(
                    token,
                    tokens.len() as i32 + output_tokens.len() as i32 - 1,
                    &[0],
                    true,
                )
                .map_err(|e| format!("Batch add failed: {e}"))?;

            ctx.decode(batch)
                .map_err(|e| format!("Decode failed: {e}"))?;
        }

        // Was `token_to_str(t, token::LlamaTokenAttr::all())` per token,
        // which does not compile against llama-cpp-2 0.1.146 — there is no
        // `LlamaTokenAttr`, and the second argument is a `model::Special`.
        // (The old call was never exercised: `coach-llm` could only build
        // on macOS, and nothing shipped with it enabled.)
        //
        // `token_to_piece` rather than the deprecated `tokens_to_str`:
        // the latter hardcodes an 8-byte piece buffer and does not retry,
        // so any longer piece fails the whole generation with
        // "Insufficient Buffer Space" — observed on a 128-token run.
        // One decoder across the whole output also means a UTF-8 sequence
        // split across two tokens survives instead of becoming replacement
        // characters. `false` = do not render control tokens as text.
        let mut decoder = encoding_rs::UTF_8.new_decoder();
        let mut result = String::new();
        for token in &output_tokens {
            let piece = model
                .token_to_piece(*token, &mut decoder, false, None)
                .map_err(|e| format!("Token decode failed: {e}"))?;
            result.push_str(&piece);
        }

        let cleaned = super::strip_think(&result);
        if cleaned.is_empty() && !result.trim().is_empty() {
            eprintln!(
                "[coach] generation was entirely reasoning ({} chars) — returning empty so the caller falls back to its template",
                result.trim().len(),
            );
        }
        Ok(Generated {
            text: cleaned,
            tokens: output_tokens.len(),
            hit_eog,
        })
    }

    // -----------------------------------------------------------------
    // Thread priority (lowered once, at spawn — never restored)
    // -----------------------------------------------------------------

    #[cfg(windows)]
    fn lower_current_thread_priority() {
        use windows_sys::Win32::System::Threading::{
            GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_BELOW_NORMAL,
        };
        // SAFETY: `GetCurrentThread` returns a pseudo-handle that needs no
        // close, and `SetThreadPriority` only mutates this thread's
        // scheduling class.
        let ok =
            unsafe { SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL) } != 0;
        if !ok {
            eprintln!("[coach] could not lower inference thread priority");
        }
    }

    #[cfg(unix)]
    fn lower_current_thread_priority() {
        // On macOS `PRIO_DARWIN_THREAD` scopes `setpriority` to the calling
        // thread. On Linux `PRIO_PROCESS` with `who == 0` is already
        // per-thread (a documented Linux divergence from POSIX), which is
        // exactly what we want here — a process-wide nice bump would also
        // slow the audio threads.
        #[cfg(target_os = "macos")]
        let which = libc::PRIO_DARWIN_THREAD;
        #[cfg(not(target_os = "macos"))]
        let which = libc::PRIO_PROCESS;

        // SAFETY: plain libc scheduling calls scoped to the current thread.
        // `getpriority` overloads -1 as both "nice -1" and "error"; the only
        // consequence of guessing wrong is nicing from the wrong base, so
        // treat it as 0.
        let previous = match unsafe { libc::getpriority(which, 0) } {
            -1 => 0,
            n => n,
        };
        if unsafe { libc::setpriority(which, 0, previous.saturating_add(5)) } != 0 {
            eprintln!("[coach] could not lower inference thread priority");
        }
    }

    #[cfg(not(any(windows, unix)))]
    fn lower_current_thread_priority() {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("yames-coach-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    const QWEN3: Option<&str> = Some(crate::models::CURRENT_BRAIN_FAMILY);

    #[test]
    fn a_new_engine_has_no_resident_model() {
        let handle = create_shared_engine();
        assert!(!handle.status().resident());
        assert!(!handle.status().loading());
        assert_eq!(handle.status().model_name(), None);
    }

    #[test]
    fn load_model_returns_false_for_a_missing_file() {
        let handle = create_shared_engine();
        let missing = std::path::Path::new("this-path-does-not-exist-model.bin");
        assert_eq!(load_model(&handle, missing, QWEN3, "Qwen3 4B"), Ok(false));
        assert!(!handle.status().resident());
        assert_eq!(handle.status().last_error().as_deref(), Some(NO_WEIGHTS));
    }

    /// Item 9: a pre-Qwen3 GGUF still loads in llama.cpp, but the engine
    /// now builds Qwen3 ChatML, so its answers arrive full of visible
    /// template artifacts. Refuse it and say why.
    #[test]
    fn load_model_refuses_a_legacy_family() {
        let dir = temp_dir("legacy");
        let path = dir.join("model.bin");
        std::fs::write(&path, b"not a real gguf").expect("write stub model");

        let handle = create_shared_engine();
        assert_eq!(
            load_model(&handle, &path, Some("legacy"), "Qwen3 4B"),
            Ok(false)
        );
        assert!(!handle.status().resident());
        assert_eq!(handle.status().last_error().as_deref(), Some(LEGACY_WEIGHTS));

        // A missing marker (nothing recorded at download time) reads the
        // same way — unknown weights are not trusted weights.
        assert_eq!(load_model(&handle, &path, None, "Qwen3 4B"), Ok(false));
        assert_eq!(handle.status().last_error().as_deref(), Some(LEGACY_WEIGHTS));

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The regression this whole change exists for: without the
    /// `coach-llm` feature, a model file that IS on disk must still
    /// report "not loaded", because nothing can read it.
    #[cfg(not(feature = "coach-llm"))]
    #[test]
    fn load_model_without_the_feature_reports_not_loaded() {
        let dir = temp_dir("nofeature");
        let path = dir.join("model.bin");
        std::fs::write(&path, b"not a real gguf").expect("write stub model");

        let handle = create_shared_engine();
        assert_eq!(load_model(&handle, &path, QWEN3, "Qwen3 4B"), Ok(false));
        assert!(!handle.status().resident());
        assert_eq!(handle.status().model_name(), None);
        assert_eq!(
            handle.status().last_error().as_deref(),
            Some(NO_LLM_IN_BUILD)
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Unloading an engine that holds nothing is a no-op, not an error —
    /// "Remove models" and the idle timer both call it unconditionally.
    #[test]
    fn unload_is_idempotent() {
        let handle = create_shared_engine();
        assert_eq!(unload_model(&handle), Ok(()));
        assert_eq!(unload_model(&handle), Ok(()));
        assert!(!handle.status().resident());
    }

    #[cfg(not(feature = "coach-llm"))]
    #[test]
    fn backend_and_compiled_flags_report_the_template_build() {
        assert!(!llm_compiled());
        assert_eq!(backend_name(), "none");
    }

    #[cfg(feature = "coach-llm")]
    #[test]
    fn backend_and_compiled_flags_report_an_llm_build() {
        assert!(llm_compiled());
        assert_ne!(backend_name(), "none");
    }

    /// Template generation is available regardless of residency — the
    /// frontend still routes chat through `coach_generate` in template
    /// mode and must get a real answer back.
    #[test]
    fn generate_falls_back_to_templates_with_no_resident_model() {
        let handle = create_shared_engine();
        let out = generate(
            &handle,
            GenKind::Chat,
            "User asks: how was my timing?\nAccuracy: 90%\n",
        )
        .expect("template generation");
        assert!(!out.trim().is_empty());
    }

    /// Item 6: the branch follows the caller's declared kind, not magic
    /// substrings in a JS-owned prompt. The greeting prompt below carries
    /// `Score:`/`Accuracy:` fields deliberately — under the old sniffing
    /// it would have fallen through to the mini-report bank.
    #[test]
    fn the_template_branch_follows_the_kind() {
        let handle = create_shared_engine();
        let greeting =
            "Rephrase this.\n\nOriginal: \"Welcome back to Slow Blues.\"\nScore: 74\nAccuracy: 88";
        assert_eq!(
            generate(&handle, GenKind::Greeting, greeting).unwrap(),
            "Welcome back to Slow Blues."
        );
        assert_eq!(
            generate(&handle, GenKind::Tip, greeting).unwrap(),
            "Welcome back to Slow Blues."
        );
        // A summary reads its numbers; a report picks from the phrase
        // banks. Neither may return the greeting text.
        let summary = generate(
            &handle,
            GenKind::Summary,
            "Accuracy: 88\nSignedDev: 1.0\nLongest clean streak: 12",
        )
        .unwrap();
        assert!(summary.contains("88%"), "unexpected summary: {summary}");
        // The drill kind has no template to fall back to — the JS side
        // owns that line and emits it when this call fails.
        assert!(generate(&handle, GenKind::Drill, "tempo went UP").is_err());
    }
}

// ---------------------------------------------------------------------------
// LLM smoke test (coach-llm builds only)
// ---------------------------------------------------------------------------

/// End-to-end check that a real GGUF loads and produces tokens on this
/// build's backend. Skipped unless `YAMES_TEST_GGUF` points at a model file,
/// because the repo ships no weights and CI must stay able to run
/// `cargo test --features coach-llm --lib` without a multi-hundred-MB
/// download when it only wants the compile checked.
///
///   YAMES_TEST_GGUF=/path/to/tiny.gguf \
///     cargo test --manifest-path src-tauri/Cargo.toml --features coach-llm --lib
///
/// Set `YAMES_LLM_GPU_LAYERS=0` alongside it to force the CPU path on a
/// GPU build.
#[cfg(all(test, feature = "coach-llm"))]
mod llm_tests {
    use super::llm::LlmWorker;
    use super::{create_shared_engine, load_model, unload_model, GenKind};

    /// `LlamaBackend::init()` is a process-wide one-shot (only `Drop`
    /// clears the flag), so two tests each spawning a worker cannot
    /// overlap — the second would fail with `BackendAlreadyInitialized`.
    /// Serialise here rather than relying on `--test-threads=1`, which no
    /// CI invocation is going to remember to pass.
    static BACKEND_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn loads_gguf_and_generates_tokens() {
        let _guard = BACKEND_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let Ok(raw) = std::env::var("YAMES_TEST_GGUF") else {
            eprintln!("YAMES_TEST_GGUF unset — skipping LLM generation test");
            return;
        };
        let path = std::path::PathBuf::from(&raw);
        assert!(path.exists(), "YAMES_TEST_GGUF does not exist: {raw}");

        // 8 tokens is the contract; `YAMES_TEST_GGUF_TOKENS` raises it only so
        // a throughput measurement has enough samples to mean anything.
        let max_tokens = std::env::var("YAMES_TEST_GGUF_TOKENS")
            .ok()
            .and_then(|v| v.trim().parse::<usize>().ok())
            .unwrap_or(8);

        let (worker, name) = LlmWorker::spawn(&path).expect("model load failed");

        // Item 8: identity comes from GGUF metadata, not from the file
        // name the downloader happened to write ("model.bin").
        eprintln!("[llm test] model name from metadata: {name:?}");
        assert!(
            !name.trim().is_empty(),
            "GGUF metadata carried no model name",
        );

        let started = std::time::Instant::now();
        let (out, _tokens) = worker
            .generate_measured("Accuracy: 82\nSignedDev: -4.1\nSay hello.", max_tokens)
            .expect("generation failed");
        let elapsed = started.elapsed();

        eprintln!(
            "[llm test] backend={} max_tokens={max_tokens} elapsed={:.2}s output={out:?}",
            super::llm::BACKEND,
            elapsed.as_secs_f64(),
        );
        assert!(
            !out.trim().is_empty(),
            "model produced no text (backend={})",
            super::llm::BACKEND
        );
        // The whole point of T04's prompt work: a Qwen3 model must not
        // leak reasoning into the coach feed.
        assert!(
            !out.contains("<think>") && !out.contains("</think>"),
            "output still contains a reasoning block: {out:?}"
        );
    }

    /// The context is hoisted into the worker and reused, so the second
    /// call must not be poisoned by the first one's KV cache — and the
    /// worker must survive being driven repeatedly.
    #[test]
    fn reuses_the_context_across_calls() {
        let _guard = BACKEND_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let Ok(raw) = std::env::var("YAMES_TEST_GGUF") else {
            eprintln!("YAMES_TEST_GGUF unset — skipping context-reuse test");
            return;
        };
        let (worker, _) =
            LlmWorker::spawn(std::path::Path::new(&raw)).expect("model load failed");
        for i in 0..3 {
            let (out, _) = worker
                .generate_measured("Accuracy: 91\nSignedDev: 2.0\nSay hello.", 32)
                .unwrap_or_else(|e| panic!("generation {i} failed: {e}"));
            assert!(!out.contains("<think>"), "call {i} leaked reasoning: {out:?}");
        }
    }

    /// Item 2 — the whole reason this task exists. `useSession` called
    /// `loadCoachModel()` from its mount effect *and* from `startSession`,
    /// and the second call used to drop a perfectly good worker and spawn
    /// a replacement. Loading the same weights twice must now touch
    /// nothing: same worker, same name, no reload.
    #[test]
    fn loading_the_same_weights_twice_is_a_no_op() {
        let _guard = BACKEND_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let Ok(raw) = std::env::var("YAMES_TEST_GGUF") else {
            eprintln!("YAMES_TEST_GGUF unset — skipping idempotent-load test");
            return;
        };
        let path = std::path::PathBuf::from(&raw);
        let handle = create_shared_engine();
        let family = Some(crate::models::CURRENT_BRAIN_FAMILY);

        assert_eq!(load_model(&handle, &path, family, "Qwen3 4B"), Ok(true));
        assert!(handle.status().resident());
        let first = handle.status().model_name();
        assert!(first.is_some(), "no model name after load");
        assert!(!handle.status().loading(), "loading flag left set");

        // Same file, second call: still resident, still the same name,
        // and the worker is still able to answer.
        assert_eq!(load_model(&handle, &path, family, "Qwen3 4B"), Ok(true));
        assert_eq!(handle.status().model_name(), first);
        let out = super::generate(&handle, GenKind::Chat, "User asks: hello?")
            .expect("generation after the second load");
        assert!(!out.trim().is_empty());

        unload_model(&handle).expect("unload");
        assert!(!handle.status().resident());
        assert_eq!(handle.status().model_name(), None);
    }

    /// Item 2/3 — a *changed* file is what triggers a reload, and the
    /// reload happens on the worker's own thread so the backend one-shot
    /// is never re-initialised. Copying the GGUF gives a new path + mtime
    /// with identical bytes, which is exactly the "user re-downloaded the
    /// same tier" shape.
    #[test]
    fn a_changed_file_reloads_in_place() {
        let _guard = BACKEND_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let Ok(raw) = std::env::var("YAMES_TEST_GGUF") else {
            eprintln!("YAMES_TEST_GGUF unset — skipping reload test");
            return;
        };
        let src = std::path::PathBuf::from(&raw);
        let dir = std::env::temp_dir().join(format!("yames-coach-reload-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir");
        let copy = dir.join("model.bin");
        std::fs::copy(&src, &copy).expect("copy gguf");

        let handle = create_shared_engine();
        let family = Some(crate::models::CURRENT_BRAIN_FAMILY);
        assert_eq!(load_model(&handle, &src, family, "Qwen3 4B"), Ok(true));
        let name = handle.status().model_name();

        // Different path (and mtime) → reload, and the worker survives it.
        assert_eq!(load_model(&handle, &copy, family, "Qwen3 4B"), Ok(true));
        assert!(handle.status().resident());
        assert_eq!(handle.status().model_name(), name, "same weights, same name");
        let out = super::generate(&handle, GenKind::Chat, "User asks: still there?")
            .expect("generation after reload");
        assert!(!out.trim().is_empty());

        // And the reloaded file is now the fingerprint, so a third call
        // with it is once again a no-op.
        assert_eq!(load_model(&handle, &copy, family, "Qwen3 4B"), Ok(true));

        unload_model(&handle).expect("unload");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Item 4 — when the inference thread is gone, `generate` must clear
    /// residency and answer from the template engine instead of returning
    /// `Err` forever while the status line still claims an active brain.
    #[test]
    fn a_dead_worker_falls_back_to_templates() {
        let _guard = BACKEND_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let Ok(raw) = std::env::var("YAMES_TEST_GGUF") else {
            eprintln!("YAMES_TEST_GGUF unset — skipping dead-worker test");
            return;
        };
        let handle = create_shared_engine();
        let path = std::path::PathBuf::from(&raw);
        assert_eq!(
            load_model(
                &handle,
                &path,
                Some(crate::models::CURRENT_BRAIN_FAMILY),
                "Qwen3 4B"
            ),
            Ok(true)
        );
        assert!(handle.status().resident());

        super::kill_worker_for_test(&handle);

        let out = super::generate(&handle, GenKind::Chat, "User asks: how was my timing?")
            .expect("template fallback after the worker died");
        assert!(!out.trim().is_empty());
        assert!(
            !handle.status().resident(),
            "residency must be cleared once the worker is gone",
        );

        unload_model(&handle).expect("unload");
    }

    /// ROADMAP §0.3's latency gate, as a runnable measurement rather than
    /// a number someone typed into a PR once.
    ///
    ///   YAMES_TEST_GGUF=/path/to/Qwen3-4B-Q4_K_M.gguf YAMES_LLM_BENCH=1 \
    ///     cargo test --manifest-path src-tauri/Cargo.toml \
    ///       --features coach-llm-vulkan --lib latency_bench -- --nocapture
    ///
    /// Opt-in because it costs minutes and needs multi-gigabyte weights.
    /// It asserts nothing: the gate is a judgement about the machine it
    /// ran on (a 4-core CPU-only laptop and an M1 have different budgets),
    /// so it prints and lets the reader decide.
    #[test]
    fn latency_bench() {
        if std::env::var("YAMES_LLM_BENCH").is_err() {
            eprintln!("YAMES_LLM_BENCH unset — skipping latency bench");
            return;
        }
        let _guard = BACKEND_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let raw = std::env::var("YAMES_TEST_GGUF").expect("YAMES_LLM_BENCH needs YAMES_TEST_GGUF");
        let (worker, _name) =
            LlmWorker::spawn(std::path::Path::new(&raw)).expect("model load failed");

        // The two shapes that matter, in the wording the JS layer actually
        // sends (`useSession.ts`) so `token_budget` classifies them the
        // same way it will in production.
        let rephrase = "Rephrase this practice-coach observation for a player of guitar. \
             Preserve every number; keep it to one sentence.\n\n\
             Original: \"82% — your kick is drifting. Lock the right foot to the click.\"";
        let chat = "Current session data:\nScore: 74\nAccuracy: 88\nSignedDev: -6.2\n\
             Longest clean streak: 19\nInstrument: guitar\n\n\
             User asks: how was my timing?\nAnswer concisely based only on the data above.";

        for (label, prompt, budget, runs) in [
            ("rephrase", rephrase, super::REPHRASE_MAX_TOKENS, 10),
            ("chat", chat, super::CHAT_MAX_TOKENS, 5),
        ] {
            // One warm-up outside the sample: the first call after load
            // pays for cold weights (mmap page-in) and, on a GPU build,
            // shader pipeline creation. Users pay it once per launch; it
            // would otherwise dominate a 5-sample p95.
            let _ = worker.generate_measured(prompt, budget);

            let mut times = Vec::with_capacity(runs);
            let mut tokens = 0usize;
            for _ in 0..runs {
                let started = std::time::Instant::now();
                let (out, n) = worker
                    .generate_measured(prompt, budget)
                    .expect("generation failed");
                times.push(started.elapsed().as_secs_f64());
                tokens += n;
                assert!(!out.contains("<think>"), "reasoning leaked: {out:?}");
            }
            let total: f64 = times.iter().sum();
            times.sort_by(f64::total_cmp);
            let p50 = times[times.len() / 2];
            // Nearest-rank p95 — with 5 or 10 samples this is the slowest
            // one, which is the honest answer at these sample counts.
            let p95 = times[((times.len() as f64 * 0.95).ceil() as usize - 1).min(times.len() - 1)];
            eprintln!(
                "[bench] backend={} kind={label} budget={budget} runs={runs} \
                 p50={p50:.3}s p95={p95:.3}s mean={:.3}s \
                 tok_per_s={:.1} tokens_per_call={}",
                super::llm::BACKEND,
                total / times.len() as f64,
                tokens as f64 / total,
                tokens / runs,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Prompt-hygiene tests (run on every build, LLM feature or not)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod prompt_tests {
    use super::{
        strip_think, threads_from_physical, usable_output, GenKind, CHAT_MAX_TOKENS,
        REPHRASE_MAX_TOKENS,
    };

    #[test]
    fn strips_a_complete_reasoning_block() {
        assert_eq!(
            strip_think("<think>\nthe user is dragging\n</think>\n\nYou're a touch behind."),
            "You're a touch behind."
        );
    }

    #[test]
    fn strips_the_empty_prefilled_block() {
        assert_eq!(strip_think("<think>\n\n</think>\n\nNice and steady."), "Nice and steady.");
    }

    #[test]
    fn strips_a_bare_closing_tag_echoed_from_the_prefill() {
        assert_eq!(strip_think("</think>\n\nLocked in."), "Locked in.");
    }

    #[test]
    fn drops_an_unterminated_block_entirely() {
        // Ran out of token budget mid-thought — there is no answer after
        // it, and shipping half a monologue would be worse than nothing.
        assert_eq!(strip_think("Sure. <think>let me consider the last 8 bars"), "Sure.");
    }

    #[test]
    fn leaves_clean_output_alone() {
        assert_eq!(strip_think("  Really locked in — keep going.  "), "Really locked in — keep going.");
    }

    /// Item 6: the budget follows the declared kind. The drill kind is
    /// the one this fixes — its prompt carries neither of the old magic
    /// markers, so it used to get the 256-token chat budget for a
    /// one-sentence narration.
    #[test]
    fn rephrase_kinds_get_the_short_budget() {
        for kind in [GenKind::Tip, GenKind::Greeting, GenKind::Drill] {
            assert!(kind.is_rephrase(), "{kind:?} should be rephrase-class");
            assert_eq!(kind.max_tokens(), REPHRASE_MAX_TOKENS, "{kind:?}");
        }
    }

    #[test]
    fn chat_and_reports_get_the_full_budget() {
        for kind in [GenKind::Chat, GenKind::Report, GenKind::Summary] {
            assert!(!kind.is_rephrase(), "{kind:?} should not be rephrase-class");
            assert_eq!(kind.max_tokens(), CHAT_MAX_TOKENS, "{kind:?}");
        }
    }

    /// Item 5. An all-reasoning generation strips to nothing, and a
    /// rephrase that ran out of budget stops mid-sentence; both used to
    /// be assigned straight into the feed by the JS callers.
    #[test]
    fn empty_and_truncated_generations_are_rejected() {
        assert_eq!(
            usable_output(GenKind::Report, "  Nice and steady.  ", true).as_deref(),
            Ok("Nice and steady.")
        );
        assert!(usable_output(GenKind::Report, "   ", true).is_err());
        assert!(usable_output(GenKind::Tip, "", false).is_err());
        assert_eq!(
            usable_output(GenKind::Tip, "You're a touch behind.", false),
            Err("truncated".to_string()),
        );
        // A long-form kind is allowed to run to the end of its budget:
        // half a chat answer is still an answer.
        assert!(usable_output(GenKind::Chat, "Your timing was", false).is_ok());
    }

    /// Item 11: `max(1, physical - 2)`, never the old halve-the-logical
    /// -cores SMT proxy that gave an 8-core M1 two threads.
    #[test]
    fn thread_count_leaves_two_cores_for_audio_and_ui() {
        assert_eq!(threads_from_physical(8), 6);
        assert_eq!(threads_from_physical(4), 2);
        assert_eq!(threads_from_physical(3), 1);
        assert_eq!(threads_from_physical(2), 1);
        assert_eq!(threads_from_physical(1), 1);
        assert_eq!(threads_from_physical(0), 1);
    }
}
