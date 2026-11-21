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
    /// A question in the Ask panel (DESIGN 9.4). Never reaches the model
    /// through `generate`: it has its own request shape, prompt, budget,
    /// grammar and cancel, and goes through [`ask`]. `generate` refuses it.
    Ask,
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
        } else if self == GenKind::Ask {
            // The larger of the Ask kind's two budgets; the request's
            // `AskMode` picks the real one.
            ASK_PROSE_MAX_TOKENS
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

/// The prompt every kind but Ask is sent as (see `llm::build_prompt` for
/// why it is hand-built ChatML). Outside the `llm` module so a test on a
/// build without the feature can hold it byte for byte.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub(crate) fn chat_prompt(context: &str) -> String {
    format!(
        "<|im_start|>system\n{system}\n\n/no_think<|im_end|>\n\
         <|im_start|>user\n{context}<|im_end|>\n\
         <|im_start|>assistant\n<think>\n\n</think>\n\n",
        system = SYSTEM_PROMPT,
    )
}

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

/// A rephrase-tier call has to land inside AGENTS.md's 1–3 s budget.
/// Above this the frontend's `COACH_GENERATE_TIMEOUT_MS.tip` (3 s) kills
/// it anyway, so the only thing a slower call buys the user is three
/// seconds of waiting before the template they were always going to get
/// — while a core is pinned generating text nobody will read.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub const TIP_LLM_BUDGET_MS: u32 = 2_500;

/// What rephrase-tier generations actually cost on *this* machine.
///
/// T04b routed tips on `llm::BACKEND`, which is the **compile-time**
/// feature string. The shipped Windows/Linux binary is built
/// `coach-llm-vulkan`, so `BACKEND == "vulkan"` on a machine with no
/// usable GPU too — llama.cpp falls back to the CPU at runtime and the
/// string never changes. The guard therefore never fired for the users it
/// was written for: measured on a GPU-less path, a rephrase takes ~3.8 s
/// against a 3 s timeout, so every live tip burned a CPU core and then
/// got killed.
///
/// Measuring is also strictly better than any backend string could be: it
/// covers a slow GPU, a fast CPU, and a machine busy doing something else,
/// none of which a compile-time constant can see.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub(crate) mod latency {
    use std::sync::Mutex;

    /// Deliberately short. This is "what is this machine doing for me
    /// right now", not a long-run statistic — a laptop that just came off
    /// battery saver should be believed within a few calls.
    const WINDOW: usize = 5;

    static SAMPLES: Mutex<Vec<u32>> = Mutex::new(Vec::new());

    pub fn record_rephrase_ms(ms: u32) {
        let mut samples = SAMPLES.lock().unwrap_or_else(|e| e.into_inner());
        samples.push(ms);
        let len = samples.len();
        if len > WINDOW {
            samples.drain(..len - WINDOW);
        }
    }

    /// Median of the samples so far; `None` until the model has been
    /// asked for a rephrase at least once.
    pub fn rephrase_p50_ms() -> Option<u32> {
        let samples = SAMPLES.lock().unwrap_or_else(|e| e.into_inner());
        if samples.is_empty() {
            return None;
        }
        let mut sorted = samples.clone();
        sorted.sort_unstable();
        Some(sorted[sorted.len() / 2])
    }

    #[cfg(test)]
    pub fn reset() {
        SAMPLES.lock().unwrap_or_else(|e| e.into_inner()).clear();
    }
}

/// Whether a given kind should reach the model at all.
///
/// Reports, summaries and chat have 8–15 s budgets and always do: a CPU
/// rephrase measures ~3.8 s and a chat answer ~5.6 s, both comfortably
/// inside their own tiers. Only the 1–3 s rephrase tier is at risk.
#[cfg(feature = "coach-llm")]
fn should_use_model(kind: GenKind) -> bool {
    if !kind.is_rephrase() {
        return true;
    }
    match latency::rephrase_p50_ms() {
        Some(p50) => p50 <= TIP_LLM_BUDGET_MS,
        // Nothing measured yet. Seed from the compile-time backend, which
        // is right for the one case it can actually see — a build with no
        // GPU backend compiled in cannot have one at runtime either — and
        // lets a GPU build take one measured call before deciding.
        None => llm::BACKEND != "cpu",
    }
}

/// Median rephrase round-trip measured on this machine so far, in ms.
///
/// `None` until the model has actually been asked for one — Settings
/// should say "measuring" rather than invent a number, because before the
/// first call we genuinely do not know whether this machine offloaded to
/// a GPU (see `latency`).
pub fn rephrase_p50_ms() -> Option<u32> {
    latency::rephrase_p50_ms()
}

/// Whether live tips currently reach the model, for Settings copy.
///
/// A build without the LLM feature never uses it; otherwise this is the
/// same decision `generate` makes, so the UI cannot drift from behaviour.
pub fn tips_use_model() -> bool {
    #[cfg(feature = "coach-llm")]
    {
        should_use_model(GenKind::Tip)
    }
    #[cfg(not(feature = "coach-llm"))]
    {
        false
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
    if kind == GenKind::Ask {
        return Err(ASK_NOT_THROUGH_GENERATE.to_string());
    }
    #[cfg(feature = "coach-llm")]
    {
        if should_use_model(kind) {
            let worker = { handle.lock()?.llm.clone() };
            if let Some(worker) = worker {
                let started = std::time::Instant::now();
                let outcome = worker.generate(context, kind);
                // Record on any answer from a live worker, including one
                // we end up rejecting: a truncated rephrase cost the user
                // the same wall clock as a good one, and that cost is
                // exactly what the routing decision is about.
                if kind.is_rephrase() && !matches!(outcome, Err(llm::GenError::WorkerGone)) {
                    latency::record_rephrase_ms(
                        started.elapsed().as_millis().min(u32::MAX as u128) as u32,
                    );
                }
                match outcome {
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

// ---------------------------------------------------------------------------
// The Ask kind (DESIGN 9.4, 5.5; leg c3a)
// ---------------------------------------------------------------------------

/// Why `generate` / the template engine refuse `GenKind::Ask`.
pub const ASK_NOT_THROUGH_GENERATE: &str =
    "the ask kind goes through coach_ask, not coach_generate";

/// Every error that comes from the caller's grammar starts with this, so
/// the frontend can tell "your grammar is wrong" (a bug to fix) from "the
/// model could not answer" (a turn to answer by rule).
pub const ASK_GRAMMAR_ERROR: &str = "grammar";

/// Output budgets, DESIGN 5.5: a choice is one small JSON object, prose is
/// at most three sentences of general advice.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub const ASK_CHOICE_MAX_TOKENS: usize = 48;
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub const ASK_PROSE_MAX_TOKENS: usize = 96;
/// The context the caller may send with a question (DESIGN 5.5: the 1.5 KB
/// of ROADMAP 3.4). Checked in tokens on the worker, where the tokenizer is.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub const ASK_CONTEXT_MAX_TOKENS: usize = 450;
/// A grammar longer than this is refused before llama.cpp sees it. The one
/// the registry generates is a few kilobytes.
pub const ASK_GRAMMAR_MAX_BYTES: usize = 32 * 1024;
/// llama.cpp's own ceiling on `{m,n}` (`MAX_REPETITION_THRESHOLD`).
const GRAMMAR_MAX_REPEAT: u64 = 2000;
/// The most grammar elements a string may expand to, estimated from above
/// by `measure_grammar`. llama.cpp's parser writes `S{m,n}` out as `m`
/// copies of `S` plus `n - m` rules of `S` and three more elements each,
/// so 32 KB of text can ask for tens of millions of elements (8 bytes each,
/// more at the parser's peak). It parses the string again on every
/// `reset()`, outside any `catch`, so a `bad_alloc` there would cross the
/// FFI. 100,000 is about 800 KB of elements: the registry's whole answer
/// grammar (`coach-answer.gbnf`, 6.8 KB with a 240-character sentence
/// rule) measures under 10,000, and a choice grammar a few hundred.
pub const ASK_GRAMMAR_MAX_ELEMENTS: u64 = 100_000;
/// Rules a grammar may define, counting each parenthesised group (llama.cpp
/// makes a rule of each). A tool grammar has one per argument shape and a
/// few dozen groups; the answer grammar has about 65.
const GRAMMAR_MAX_RULES: usize = 512;
/// Alternatives in one rule or group. The widest closed list in the answer
/// grammar has 31 (chord qualities); an intent list is one per tool.
const GRAMMAR_MAX_ALTERNATIVES: usize = 128;
/// Groups inside groups. Tool grammars nest two or three deep.
const GRAMMAR_MAX_DEPTH: usize = 16;
/// The longest chain of rule references (a cycle is cut where it closes).
/// The answer grammar's is about 8.
const GRAMMAR_MAX_REF_DEPTH: usize = 64;
/// The most parse stacks `StackEstimate` may find at one position. Each
/// stack is checked against every candidate token in a grammar `apply`
/// (about 150,000 for Qwen3), which is one uninterruptible sampling step,
/// and llama.cpp builds them at grammar init and on every `reset()`
/// outside any `catch`. The answer grammar's estimate is in the tens (its
/// widest closed list has 31 entries); `r1? r1? r1? r1?` chained twelve
/// rules deep is about 4^12.
pub const ASK_GRAMMAR_MAX_STACKS: u64 = 1_024;

/// The Ask kind's own system lines. They come first in the system turn, in
/// front of the caller's static prefix (its system text and its tool /
/// intent list), and are part of what the prefix cache keeps.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub const ASK_SYSTEM_PROMPT: &str = r#"You answer one question inside Yames, a guitar practice app. One reply, no follow-up questions.

Rules:
- Use only what the app gives you below; never invent a number, a tempo, a bar, a note or a result
- Never state a fact about the player: the app shows those itself
- Keep to guitar, practice and Yames
- When a format is required, reply in exactly that format and nothing else"#;

/// The two shapes of an Ask answer, each with its own budget.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AskMode {
    /// One small object under the caller's grammar: an intent id and its
    /// arguments, from a closed list (engine 4a).
    Choice,
    /// General advice in the model's own words (engine 4b).
    Prose,
}

impl AskMode {
    #[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
    pub fn max_tokens(self) -> usize {
        match self {
            AskMode::Choice => ASK_CHOICE_MAX_TOKENS,
            AskMode::Prose => ASK_PROSE_MAX_TOKENS,
        }
    }
}

/// One Ask turn. Rust does not know the tools: they live in TypeScript,
/// which sends the static prefix that lists them and, for a choice, the
/// grammar generated from the same registry.
#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AskRequest {
    /// Chosen by the caller, unique for the life of the process, so the
    /// caller can cancel before this call has even returned.
    pub generation_id: u64,
    pub mode: AskMode,
    /// The static head: system text and the tool / intent list. Identical
    /// from turn to turn, which is what lets the worker keep it decoded.
    pub prefix: String,
    /// What the app knows that bears on this question (at most
    /// `ASK_CONTEXT_MAX_TOKENS`).
    pub context: String,
    pub question: String,
    /// GBNF with a `root` rule. Optional for either mode; a choice without
    /// one is free text the caller will have to validate.
    #[serde(default)]
    pub grammar: Option<String>,
    /// The turn's wall-clock budget, from the moment `ask` is called:
    /// queue, prompt and answer together. `ASK_DEFAULT_DEADLINE_MS` when
    /// absent, at most `ASK_MAX_DEADLINE_MS`. Checked between prompt
    /// chunks and per output token, as a cancel is.
    #[serde(default)]
    pub deadline_ms: Option<u32>,
}

/// DESIGN 5.5: a turn fits 8 s or the rule-made answer stands.
pub const ASK_DEFAULT_DEADLINE_MS: u32 = 8_000;
/// A caller may ask for longer (the probe does, to measure on a loaded
/// machine), never for longer than this.
pub const ASK_MAX_DEADLINE_MS: u32 = 60_000;

impl AskRequest {
    pub fn deadline(&self) -> std::time::Duration {
        std::time::Duration::from_millis(
            self.deadline_ms.unwrap_or(ASK_DEFAULT_DEADLINE_MS).min(ASK_MAX_DEADLINE_MS) as u64,
        )
    }
}

/// Why an answer stopped before the model ended it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub enum TruncatedBy {
    /// The mode's token budget ran out.
    Budget,
    /// `ASK_MAX_WHITESPACE_RUN` whitespace-only tokens in a row under a
    /// grammar.
    Whitespace,
}

/// How a generation ended on the worker, before `ask_outcome` shapes it.
#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub(crate) enum AskEnd {
    /// End-of-generation, allowed by the grammar if there is one.
    Finished,
    Truncated(TruncatedBy),
    /// Nothing could be sampled though the grammar compiled and stayed
    /// healthy: the model could not continue under it.
    DeadEnd(String),
}

/// What a turn came to. A failure that is the caller's to fix (a malformed
/// grammar, a context over budget) is an `Err` instead.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum AskOutcome {
    /// The model ended the answer itself, inside the budget. Under a
    /// grammar, `text` is a complete sentence of the grammar's language.
    #[serde(rename_all = "camelCase")]
    #[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
    Answered {
        text: String,
        /// The static prefix was already decoded and only the context and
        /// the question were.
        prefix_cached: bool,
        /// From the job starting on the worker to the first output token's
        /// logits being ready: the prompt's cost.
        prompt_ms: u32,
        total_ms: u32,
    },
    /// The answer was cut off: `text` is at most a prefix of the grammar's
    /// language, never a complete answer to act on. Its own status so no
    /// caller can parse half a tool call by forgetting a flag.
    #[serde(rename_all = "camelCase")]
    #[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
    Truncated {
        text: String,
        by: TruncatedBy,
        prefix_cached: bool,
        prompt_ms: u32,
        total_ms: u32,
    },
    /// The grammar is valid, but the model reached a point where nothing it
    /// could give was allowed. Not the caller's bug: the rule-made answer
    /// stands.
    #[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
    DeadEnd { why: String },
    /// `cancel_generation` reached it, queued or running.
    Cancelled,
    /// The turn's deadline passed, queued or running. Distinct from a
    /// player's cancel.
    #[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
    TimedOut,
    /// No model is resident (or this build has none): the rule-made answer
    /// stands, which is not an error.
    NoModel,
}

/// Shape a finished generation for the caller.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub(crate) fn ask_outcome(
    end: AskEnd,
    text: String,
    prefix_cached: bool,
    prompt_ms: u32,
    total_ms: u32,
) -> AskOutcome {
    match end {
        AskEnd::Finished => AskOutcome::Answered { text, prefix_cached, prompt_ms, total_ms },
        AskEnd::Truncated(by) => {
            AskOutcome::Truncated { text, by, prefix_cached, prompt_ms, total_ms }
        }
        AskEnd::DeadEnd(why) => AskOutcome::DeadEnd { why },
    }
}

/// What stops a running turn: the player's cancel, then the deadline.
/// Checked before a queued job starts, between prompt chunks and per
/// output token.
#[derive(Clone)]
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub(crate) struct AskStop {
    pub cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub deadline: std::time::Instant,
}

/// Why `AskStop` stopped a turn.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub(crate) enum Halt {
    Cancelled,
    Expired,
}

impl AskStop {
    /// The player's cancel wins over a deadline that passed at the same time.
    #[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
    pub fn check(&self) -> Option<Halt> {
        if self.cancel.load(std::sync::atomic::Ordering::Acquire) {
            Some(Halt::Cancelled)
        } else if std::time::Instant::now() >= self.deadline {
            Some(Halt::Expired)
        } else {
            None
        }
    }
}

/// The cancel board: one flag per generation id that is queued or running.
///
/// Lives outside the worker so a cancel never waits behind the job it is
/// cancelling. A cancel that arrives before its `ask` registered (the two
/// commands race on the tokio pool) is remembered, a few at a time, and the
/// job then starts cancelled.
pub(crate) mod cancel {
    use std::collections::{HashMap, VecDeque};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex, MutexGuard, OnceLock};

    /// Early cancels remembered. Ids are unique per process, so an old one
    /// falling off the end costs nothing but that one early cancel.
    const EARLY_KEPT: usize = 32;

    #[derive(Default)]
    struct Board {
        live: HashMap<u64, Arc<AtomicBool>>,
        early: VecDeque<u64>,
    }

    fn board() -> MutexGuard<'static, Board> {
        static BOARD: OnceLock<Mutex<Board>> = OnceLock::new();
        BOARD
            .get_or_init(|| Mutex::new(Board::default()))
            .lock()
            .unwrap_or_else(|e| e.into_inner())
    }

    /// A registered generation. Dropping it takes the id off the board.
    pub struct Ticket {
        id: u64,
        flag: Arc<AtomicBool>,
    }

    impl Ticket {
        #[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
        pub fn flag(&self) -> &Arc<AtomicBool> {
            &self.flag
        }

        pub fn is_cancelled(&self) -> bool {
            self.flag.load(Ordering::Acquire)
        }
    }

    impl Drop for Ticket {
        fn drop(&mut self) {
            let mut b = board();
            // Only our own entry: a later registration of the same id
            // cannot exist while this one is live (`register` refuses it).
            if b.live.get(&self.id).is_some_and(|f| Arc::ptr_eq(f, &self.flag)) {
                b.live.remove(&self.id);
            }
        }
    }

    pub fn register(id: u64) -> Result<Ticket, String> {
        let mut b = board();
        if b.live.contains_key(&id) {
            return Err(format!("generation {id} is already running"));
        }
        let early = match b.early.iter().position(|&e| e == id) {
            Some(pos) => {
                b.early.remove(pos);
                true
            }
            None => false,
        };
        let flag = Arc::new(AtomicBool::new(early));
        b.live.insert(id, flag.clone());
        Ok(Ticket { id, flag })
    }

    /// True when a queued or running generation was flagged.
    pub fn cancel(id: u64) -> bool {
        let mut b = board();
        if let Some(flag) = b.live.get(&id) {
            flag.store(true, Ordering::Release);
            return true;
        }
        if !b.early.contains(&id) {
            if b.early.len() >= EARLY_KEPT {
                b.early.pop_front();
            }
            b.early.push_back(id);
        }
        false
    }
}

/// Stop the generation with this id, queued or running. Returns whether
/// one was found; either way the id, if it runs later, starts cancelled.
pub fn cancel_generation(generation_id: u64) -> bool {
    cancel::cancel(generation_id)
}

/// Checks on a GBNF string that llama.cpp does not make, or makes in a way
/// that costs the process: a `{m,n}` with `n < m` underflows its repeat
/// count and loops allocating rules until memory runs out (llama-grammar.cpp
/// `handle_repetitions`, `n_opt = max_times - min_times`); a grammar that
/// expands past `ASK_GRAMMAR_MAX_ELEMENTS` can exhaust memory in the parser
/// (see the constant). It also refuses more than `GRAMMAR_MAX_RULES` rules
/// and groups, `GRAMMAR_MAX_ALTERNATIVES` in one of them, groups nested
/// past `GRAMMAR_MAX_DEPTH`, rule references chained past
/// `GRAMMAR_MAX_REF_DEPTH`, and a grammar whose `StackEstimate` (the
/// stacks one parse expands to at one position) passes
/// `ASK_GRAMMAR_MAX_STACKS`. That bounds the stacks llama.cpp builds at
/// init and on `reset()` for one parse; it does not bound the stacks an
/// ambiguous grammar keeps for several parses at once (see
/// `StackEstimate`). Everything else malformed is left to llama.cpp's
/// parser, which returns an error for it.
pub fn precheck_grammar(grammar: &str) -> Result<(), String> {
    measure_grammar(grammar).map(|_| ())
}

/// What an item of a sequence is, for the parse-stack estimate.
#[derive(Clone, Debug)]
enum GrammarKind {
    /// A literal character, a class, `.` or a token: one stack position.
    Term,
    /// `""`: nothing.
    Empty,
    Ref(String),
    Group(Vec<Vec<GrammarItem>>),
}

#[derive(Clone, Debug)]
struct GrammarItem {
    kind: GrammarKind,
    /// `?`, `*` or `{0,n}`: the item may be skipped.
    optional: bool,
    /// How many copies llama.cpp writes out (`{m,n}`: n, `*` / `+`: 2).
    copies: u64,
}

/// One sequence being measured: a rule's body or a group's.
struct GrammarFrame {
    /// The alternatives already closed by a `|`.
    closed: u64,
    /// The sequence being read.
    seq: u64,
    /// The last item's size, which a repetition after it multiplies.
    last: u64,
    alternatives: usize,
    /// The same sequences as items, for the parse-stack estimate.
    closed_items: Vec<Vec<GrammarItem>>,
    items: Vec<GrammarItem>,
}

impl GrammarFrame {
    fn new() -> Self {
        GrammarFrame {
            closed: 0,
            seq: 0,
            last: 0,
            alternatives: 1,
            closed_items: Vec::new(),
            items: Vec::new(),
        }
    }

    fn total(&self) -> u64 {
        self.closed.saturating_add(self.seq)
    }

    fn item(&mut self, size: u64, kind: GrammarKind) {
        self.seq = self.seq.saturating_add(size);
        self.last = size;
        self.items.push(GrammarItem { kind, optional: false, copies: 1 });
    }

    /// `S` repeated: llama.cpp writes out `copies` of it, each with up to
    /// three elements of rule bookkeeping (`handle_repetitions`).
    fn repeat(&mut self, copies: u64, optional: bool) {
        let grown = self.last.saturating_add(3).saturating_mul(copies.max(1));
        self.seq = self.seq.saturating_sub(self.last).saturating_add(grown);
        self.last = grown;
        if let Some(last) = self.items.last_mut() {
            last.optional |= optional;
            last.copies = last.copies.saturating_mul(copies.max(1));
        }
    }

    /// `|`: the sequence read so far is one alternative.
    fn next_alternative(&mut self) {
        self.closed = self.total();
        self.seq = 0;
        self.last = 0;
        self.alternatives += 1;
        self.closed_items.push(std::mem::take(&mut self.items));
    }

    /// Every alternative, the one being read included.
    fn into_alternatives(mut self) -> Vec<Vec<GrammarItem>> {
        self.closed_items.push(self.items);
        self.closed_items
    }
}

/// An upper estimate of the parse stacks llama.cpp holds at once.
///
/// `llama_grammar_advance_stack` expands a position into one stack per
/// distinct way the next character can be reached: through every
/// alternative of a referenced rule, and past every item that can be
/// skipped. So the stacks at one position are the "starts" of the rest of
/// its sequence: the starts of each item up to and including the first one
/// that cannot be skipped, plus one for running off the end into the
/// parent. A skippable item repeated `n` times counts its starts `n`
/// times. Starts follow references to named rules (memoised; a rule met
/// again while it is being costed counts once). The estimate is the
/// largest such count over every position of every sequence.
///
/// What it does not cover: running off the end of a rule adds the
/// parent's continuation, so one parse can hold up to the reference
/// depth times the estimate (the depth is capped too); and an ambiguous
/// grammar keeps several parses alive at once, which this does not
/// multiply in. The turn's deadline is what bounds that, between steps.
struct StackEstimate<'a> {
    rules: &'a std::collections::HashMap<String, Vec<Vec<GrammarItem>>>,
    nullable: std::collections::HashSet<String>,
    /// Per rule: its starts and the longest reference chain below it.
    memo: std::collections::HashMap<String, (u64, usize)>,
    busy: std::collections::HashSet<String>,
    max_stacks: u64,
}

impl<'a> StackEstimate<'a> {
    fn new(rules: &'a std::collections::HashMap<String, Vec<Vec<GrammarItem>>>) -> Self {
        // Which rules can match nothing: a fixpoint, at most one round per rule.
        let mut nullable = std::collections::HashSet::new();
        loop {
            let found: Vec<String> = rules
                .iter()
                .filter(|(name, alts)| {
                    !nullable.contains(*name) && alts.iter().any(|s| Self::seq_nullable(s, &nullable))
                })
                .map(|(name, _)| name.clone())
                .collect();
            if found.is_empty() {
                break;
            }
            nullable.extend(found);
        }
        StackEstimate {
            rules,
            nullable,
            memo: std::collections::HashMap::new(),
            busy: std::collections::HashSet::new(),
            max_stacks: 0,
        }
    }

    fn kind_nullable(kind: &GrammarKind, nullable: &std::collections::HashSet<String>) -> bool {
        match kind {
            GrammarKind::Term => false,
            GrammarKind::Empty => true,
            GrammarKind::Ref(name) => nullable.contains(name),
            GrammarKind::Group(alts) => alts.iter().any(|s| Self::seq_nullable(s, nullable)),
        }
    }

    fn seq_nullable(seq: &[GrammarItem], nullable: &std::collections::HashSet<String>) -> bool {
        seq.iter().all(|it| it.optional || Self::kind_nullable(&it.kind, nullable))
    }

    /// The starts of a whole rule, and the reference chain below it.
    fn rule(&mut self, name: &str) -> Result<(u64, usize), String> {
        if let Some(&known) = self.memo.get(name) {
            return Ok(known);
        }
        let Some(alts) = self.rules.get(name) else {
            // Undefined: llama.cpp refuses it.
            return Ok((1, 0));
        };
        if !self.busy.insert(name.to_string()) {
            return Ok((1, 0));
        }
        let (starts, depth) = self.alternatives(alts)?;
        self.busy.remove(name);
        let depth = depth + 1;
        if depth > GRAMMAR_MAX_REF_DEPTH {
            return Err(format!("rule references chain deeper than {GRAMMAR_MAX_REF_DEPTH}"));
        }
        self.memo.insert(name.to_string(), (starts, depth));
        Ok((starts, depth))
    }

    fn alternatives(&mut self, alts: &[Vec<GrammarItem>]) -> Result<(u64, usize), String> {
        let mut starts = 0u64;
        let mut depth = 0usize;
        for seq in alts {
            let (s, d) = self.sequence(seq)?;
            starts = starts.saturating_add(s);
            depth = depth.max(d);
        }
        Ok((starts, depth))
    }

    /// The starts of `seq` from its first item, recording the largest
    /// count at any of its positions.
    fn sequence(&mut self, seq: &[GrammarItem]) -> Result<(u64, usize), String> {
        let mut rest = 1u64; // running off the end into the parent
        let mut depth = 0usize;
        for item in seq.iter().rev() {
            let (own, d) = match &item.kind {
                GrammarKind::Term => (1, 0),
                GrammarKind::Empty => (0, 0),
                GrammarKind::Ref(name) => self.rule(name)?,
                GrammarKind::Group(alts) => self.alternatives(alts)?,
            };
            depth = depth.max(d);
            let inner_nullable = Self::kind_nullable(&item.kind, &self.nullable);
            let own = if inner_nullable { own.saturating_mul(item.copies) } else { own };
            rest = if item.optional || inner_nullable { own.saturating_add(rest) } else { own };
            self.max_stacks = self.max_stacks.max(rest);
            if self.max_stacks > ASK_GRAMMAR_MAX_STACKS {
                return Err(format!(
                    "grammar can hold more than {ASK_GRAMMAR_MAX_STACKS} parse stacks at once"
                ));
            }
        }
        Ok((rest, depth))
    }
}

/// `precheck_grammar`, returning an upper estimate of the elements the
/// grammar expands to in llama.cpp's parser. Literals and character classes
/// count a byte as an element (an escape or a range is fewer), a rule name
/// or a token one; a group's size is counted wherever it is repeated, so
/// nested repetitions multiply through (llama.cpp makes a group a rule of
/// its own and references it, so the true size is usually smaller).
pub(crate) fn measure_grammar(grammar: &str) -> Result<u64, String> {
    grammar_measures(grammar).map(|(size, _)| size)
}

/// `measure_grammar`'s checks, returning the size and the
/// `StackEstimate`.
fn grammar_measures(grammar: &str) -> Result<(u64, u64), String> {
    if grammar.trim().is_empty() {
        return Err("empty grammar".into());
    }
    if grammar.len() > ASK_GRAMMAR_MAX_BYTES {
        return Err(format!(
            "grammar is {} bytes; the limit is {ASK_GRAMMAR_MAX_BYTES}",
            grammar.len()
        ));
    }
    if grammar.contains('\0') {
        return Err("grammar contains a NUL byte".into());
    }
    let has_root = grammar.lines().any(|line| {
        line.trim_start()
            .strip_prefix("root")
            .is_some_and(|rest| rest.trim_start().starts_with("::="))
    });
    if !has_root {
        return Err("grammar has no `root ::=` rule".into());
    }

    #[derive(PartialEq)]
    enum At {
        Code,
        Literal,
        Class,
        Comment,
    }
    let bytes = grammar.as_bytes();
    let mut at = At::Code;
    let mut i = 0;
    // Elements in the rules already closed, the frames open now (the rule
    // being read, then its groups), the rules and groups seen, and the
    // length of the literal or class being read.
    let mut done: u64 = 0;
    let mut frames = vec![GrammarFrame::new()];
    let mut rules = 0usize;
    let mut run: u64 = 0;
    // The rules read so far as items, and the name of the one being read
    // (none before the first `::=`).
    let mut named: std::collections::HashMap<String, Vec<Vec<GrammarItem>>> =
        std::collections::HashMap::new();
    let mut rule_name: Option<String> = None;
    let too_many = |rules: usize| -> Result<(), String> {
        if rules > GRAMMAR_MAX_RULES {
            return Err(format!("grammar has more than {GRAMMAR_MAX_RULES} rules and groups"));
        }
        Ok(())
    };
    let too_wide = |f: &GrammarFrame| -> Result<(), String> {
        if f.alternatives > GRAMMAR_MAX_ALTERNATIVES {
            return Err(format!(
                "a rule or group has {} alternatives; the limit is {GRAMMAR_MAX_ALTERNATIVES}",
                f.alternatives
            ));
        }
        Ok(())
    };
    // Close the innermost group into the item it is in its parent.
    let close_group = |frames: &mut Vec<GrammarFrame>| -> Result<(), String> {
        let group = frames.pop().expect("a group frame");
        too_wide(&group)?;
        let size = group.total().saturating_add(1);
        let alts = group.into_alternatives();
        frames
            .last_mut()
            .expect("the rule's frame")
            .item(size, GrammarKind::Group(alts));
        Ok(())
    };
    let check_size = |done: u64, frames: &[GrammarFrame]| -> Result<(), String> {
        let size = frames.iter().fold(done, |sum, f| sum.saturating_add(f.total()));
        if size > ASK_GRAMMAR_MAX_ELEMENTS {
            return Err(format!(
                "grammar expands to more than {ASK_GRAMMAR_MAX_ELEMENTS} elements"
            ));
        }
        Ok(())
    };
    while i < bytes.len() {
        let c = bytes[i];
        match at {
            At::Literal | At::Class => {
                if c == b'\\' {
                    run += 1;
                    i += 2;
                    continue;
                }
                if (at == At::Literal && c == b'"') || (at == At::Class && c == b']') {
                    let kind = if run == 0 && at == At::Literal {
                        GrammarKind::Empty
                    } else {
                        GrammarKind::Term
                    };
                    at = At::Code;
                    frames.last_mut().expect("a frame").item(run, kind);
                    check_size(done, &frames)?;
                } else {
                    run += 1;
                }
            }
            At::Comment => {
                if c == b'\n' || c == b'\r' {
                    at = At::Code;
                }
            }
            At::Code => match c {
                b'"' => {
                    at = At::Literal;
                    run = 0;
                }
                b'[' => {
                    at = At::Class;
                    run = 0;
                }
                b'#' => at = At::Comment,
                b'(' => {
                    // llama.cpp makes a rule of every group: counted here,
                    // not only when the next named rule starts.
                    rules += 1;
                    too_many(rules)?;
                    if frames.len() > GRAMMAR_MAX_DEPTH {
                        return Err(format!("groups nest deeper than {GRAMMAR_MAX_DEPTH}"));
                    }
                    frames.push(GrammarFrame::new());
                }
                b')' => {
                    // A stray `)` is llama.cpp's to refuse.
                    if frames.len() > 1 {
                        close_group(&mut frames)?;
                        check_size(done, &frames)?;
                    }
                }
                b'|' => {
                    let f = frames.last_mut().expect("a frame");
                    f.next_alternative();
                    too_wide(f)?;
                }
                b'.' => frames.last_mut().expect("a frame").item(1, GrammarKind::Term),
                b'*' | b'+' | b'?' => {
                    frames
                        .last_mut()
                        .expect("a frame")
                        .repeat(if c == b'?' { 1 } else { 2 }, c != b'+');
                    check_size(done, &frames)?;
                }
                c if c.is_ascii_alphanumeric() || c == b'_' || c == b'-' => {
                    let start = i;
                    while i < bytes.len()
                        && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_' || bytes[i] == b'-')
                    {
                        i += 1;
                    }
                    let mut k = i;
                    while k < bytes.len() && (bytes[k] == b' ' || bytes[k] == b'\t') {
                        k += 1;
                    }
                    if bytes[k..].starts_with(b"::=") {
                        // A new rule: the one before it is finished.
                        while frames.len() > 1 {
                            close_group(&mut frames)?;
                        }
                        let rule = frames.pop().expect("the rule's frame");
                        too_wide(&rule)?;
                        done = done.saturating_add(rule.total());
                        if let Some(name) = rule_name.take() {
                            named.entry(name).or_default().extend(rule.into_alternatives());
                        }
                        rule_name = Some(grammar[start..i].to_string());
                        frames.push(GrammarFrame::new());
                        rules += 1;
                        too_many(rules)?;
                        i = k + 3;
                    } else {
                        debug_assert!(i > start);
                        frames
                            .last_mut()
                            .expect("a frame")
                            .item(1, GrammarKind::Ref(grammar[start..i].to_string()));
                    }
                    continue;
                }
                b'{' => {
                    let close = grammar[i..]
                        .find('}')
                        .map(|k| i + k)
                        .ok_or_else(|| "a `{` is never closed".to_string())?;
                    let inner = &grammar[i + 1..close];
                    let (lo, hi) = match inner.split_once(',') {
                        Some((lo, hi)) => (lo.trim(), Some(hi.trim())),
                        None => (inner.trim(), None),
                    };
                    let number = |s: &str| -> Result<u64, String> {
                        if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
                            return Err(format!("`{{{inner}}}` is not a repetition"));
                        }
                        s.parse::<u64>()
                            .ok()
                            .filter(|&n| n <= GRAMMAR_MAX_REPEAT)
                            .ok_or_else(|| format!("`{{{inner}}}` repeats too often"))
                    };
                    let min = number(lo)?;
                    // `{m}` is m copies, `{m,}` m and one more rule, `{m,n}` n.
                    let copies = match hi {
                        None => min,
                        Some(h) if h.is_empty() => min + 1,
                        Some(h) => {
                            let max = number(h)?;
                            if max < min {
                                return Err(format!(
                                    "`{{{inner}}}`: the maximum is below the minimum"
                                ));
                            }
                            max
                        }
                    };
                    frames.last_mut().expect("a frame").repeat(copies, min == 0);
                    check_size(done, &frames)?;
                    i = close;
                }
                _ => {}
            },
        }
        i += 1;
    }
    // An unclosed literal or group is llama.cpp's to refuse; its size
    // still counts.
    if at == At::Literal || at == At::Class {
        frames.last_mut().expect("a frame").item(run, GrammarKind::Term);
    }
    while frames.len() > 1 {
        close_group(&mut frames)?;
    }
    too_wide(&frames[0])?;
    too_many(rules)?;
    check_size(done, &frames)?;
    let rule = frames.pop().expect("the rule's frame");
    let size = done.saturating_add(rule.total());
    if let Some(name) = rule_name.take() {
        named.entry(name).or_default().extend(rule.into_alternatives());
    }

    let mut stacks = StackEstimate::new(&named);
    let mut names: Vec<&String> = named.keys().collect();
    names.sort();
    for name in names {
        stacks.rule(name)?;
    }
    Ok((size, stacks.max_stacks))
}

/// The system turn up to the user's content, ChatML as `chat_prompt`
/// builds it. Static from turn to turn: this is what the worker keeps.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub(crate) fn ask_prompt_head(prefix: &str) -> String {
    let prefix = prefix.trim();
    let mut head = String::with_capacity(ASK_SYSTEM_PROMPT.len() + prefix.len() + 64);
    head.push_str("<|im_start|>system\n");
    head.push_str(ASK_SYSTEM_PROMPT);
    if !prefix.is_empty() {
        head.push_str("\n\n");
        head.push_str(prefix);
    }
    head.push_str("\n\n/no_think<|im_end|>\n<|im_start|>user\n");
    head
}

/// The turn's own part: context, question, and the non-thinking assistant
/// turn `chat_prompt` uses.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub(crate) fn ask_prompt_tail(context: &str, question: &str) -> String {
    let context = context.trim();
    let mut tail = String::with_capacity(context.len() + question.len() + 96);
    if !context.is_empty() {
        tail.push_str(context);
        tail.push_str("\n\n");
    }
    tail.push_str("Question: ");
    tail.push_str(question.trim());
    tail.push_str("<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n");
    tail
}

/// Answer one Ask turn with the resident model.
///
/// One model call a turn, no tool loop (DESIGN 5.5). The grammar is checked
/// before anything else, so a malformed one is an `Err` even with no model.
/// Takes the engine mutex only to clone the worker handle, like `generate`.
pub fn ask(handle: &CoachHandle, req: &AskRequest) -> Result<AskOutcome, String> {
    if let Some(grammar) = req.grammar.as_deref() {
        precheck_grammar(grammar).map_err(|e| format!("{ASK_GRAMMAR_ERROR}: {e}"))?;
    }
    if req.question.trim().is_empty() {
        return Err("an ask needs a question".into());
    }
    let deadline = std::time::Instant::now() + req.deadline();
    let ticket = cancel::register(req.generation_id)?;
    if ticket.is_cancelled() {
        return Ok(AskOutcome::Cancelled);
    }

    #[cfg(feature = "coach-llm")]
    {
        let worker = { handle.lock()?.llm.clone() };
        let Some(worker) = worker else {
            return Ok(AskOutcome::NoModel);
        };
        let stop = AskStop { cancel: ticket.flag().clone(), deadline };
        match worker.ask(req, &stop) {
            Ok(a) => Ok(ask_outcome(a.end, a.text, a.prefix_cached, a.prompt_ms, a.total_ms)),
            Err(llm::AskError::Cancelled) => Ok(AskOutcome::Cancelled),
            Err(llm::AskError::Expired) => Ok(AskOutcome::TimedOut),
            Err(llm::AskError::WorkerGone) => {
                handle.status().clear_residency("inference thread is gone");
                Ok(AskOutcome::NoModel)
            }
            Err(llm::AskError::Failed(e)) => Err(e),
        }
    }
    #[cfg(not(feature = "coach-llm"))]
    {
        let _ = (handle, ticket, deadline);
        Ok(AskOutcome::NoModel)
    }
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
        // The Ask panel's rule-made answer lives in TypeScript, beside the
        // tools; there is nothing here to fall back to.
        GenKind::Ask => return Err(ASK_NOT_THROUGH_GENERATE.to_string()),
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

// -----------------------------------------------------------------
// Thread priority (lowered once, at spawn — never restored). The LLM worker
// and the Take's pitch pass (`timing.rs`) both run below normal.
// -----------------------------------------------------------------

#[cfg(windows)]
pub fn lower_current_thread_priority() {
    use windows_sys::Win32::System::Threading::{
        GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_BELOW_NORMAL,
    };
    // SAFETY: `GetCurrentThread` returns a pseudo-handle that needs no
    // close, and `SetThreadPriority` only mutates this thread's
    // scheduling class.
    let ok =
        unsafe { SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL) } != 0;
    if !ok {
        eprintln!("[yames] could not lower a background thread's priority");
    }
}

#[cfg(unix)]
pub fn lower_current_thread_priority() {
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
        eprintln!("[yames] could not lower a background thread's priority");
    }
}

#[cfg(not(any(windows, unix)))]
pub fn lower_current_thread_priority() {}

#[cfg(feature = "coach-llm")]
mod llm {
    use std::collections::HashMap;
    use std::path::{Path, PathBuf};
    use std::sync::mpsc::{channel, sync_channel, Receiver, RecvTimeoutError, Sender, SyncSender};
    use std::time::{Duration, Instant};

    use llama_cpp_2::context::params::LlamaContextParams;
    use llama_cpp_2::context::LlamaContext;
    use llama_cpp_2::llama_backend::LlamaBackend;
    use llama_cpp_2::llama_batch::LlamaBatch;
    use llama_cpp_2::model::params::LlamaModelParams;
    use llama_cpp_2::model::LlamaModel;
    use llama_cpp_2::sampling::LlamaSampler;
    use llama_cpp_2::token::data::LlamaTokenData;
    use llama_cpp_2::token::data_array::LlamaTokenDataArray;
    use llama_cpp_2::token::LlamaToken;

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
    ///
    /// `YAMES_LLM_THREADS` overrides it. T04b deliverable 3 asks for a
    /// measured answer to "how many threads?" rather than an assumed one,
    /// and that measurement needs to sweep counts on one binary; the same
    /// override then lets a user on unusual hardware check our rule
    /// against their own machine. Out-of-range values are ignored rather
    /// than clamped silently, so a typo does not quietly change the
    /// number a benchmark is attributing to the rule.
    fn inference_threads() -> i32 {
        let default = super::threads_from_physical(physical_cores());
        match std::env::var("YAMES_LLM_THREADS") {
            Ok(raw) => match raw.trim().parse::<i32>() {
                Ok(n) if n >= 1 && n <= 256 => n,
                _ => {
                    eprintln!("[coach] YAMES_LLM_THREADS={raw:?} is not a thread count — ignoring");
                    default
                }
            },
            Err(_) => default,
        }
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
        super::chat_prompt(context)
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

    /// Why an Ask job produced no answer. `Cancelled` is its own result,
    /// never an error: the player pressed Stop, or the turn timed out.
    #[derive(Debug)]
    pub enum AskError {
        Cancelled,
        /// The turn's deadline passed (`AskRequest::deadline_ms`).
        Expired,
        WorkerGone,
        Failed(String),
    }

    impl From<super::Halt> for AskError {
        fn from(h: super::Halt) -> Self {
            match h {
                super::Halt::Cancelled => AskError::Cancelled,
                super::Halt::Expired => AskError::Expired,
            }
        }
    }

    /// One Ask job's result, before `super::ask` shapes it for the caller.
    #[derive(Debug)]
    pub struct AskGenerated {
        pub text: String,
        /// Kept for a tokens/second figure, as `Generated::tokens`.
        #[allow(dead_code)]
        pub tokens: usize,
        pub end: super::AskEnd,
        pub prefix_cached: bool,
        pub prompt_ms: u32,
        pub total_ms: u32,
    }

    /// What the worker needs for an Ask job, built on the caller's thread.
    struct AskJob {
        /// `super::ask_prompt_head`: the part the prefix cache keeps.
        head: String,
        /// `super::ask_prompt_tail`: decoded every turn.
        tail: String,
        /// The context alone, to hold it to its budget in tokens.
        context: String,
        mode: super::AskMode,
        grammar: Option<String>,
    }

    /// The prompt is decoded this many tokens at a time so a cancel lands
    /// between chunks rather than after the whole prompt (DESIGN 9.4).
    pub(super) const ASK_DECODE_CHUNK: usize = 256;

    /// How often a caller waiting on a queued or running Ask looks at its
    /// cancel flag. The worker checks the same flag per chunk and per token;
    /// this is what lets a cancel return at once even while another kind's
    /// generation still holds the worker.
    const ASK_CANCEL_POLL: Duration = Duration::from_millis(20);

    /// Under a grammar, this many whitespace-only tokens in a row end the
    /// answer: the grammar's `ws` should be bounded, and when the caller's
    /// is not, this is the bound (DESIGN 9.4, "whitespace bounded").
    pub(super) const ASK_MAX_WHITESPACE_RUN: usize = 6;

    /// The sequence that holds the Ask kind's static prefix between turns.
    /// Sequence 0 is the one every generation decodes into.
    const ASK_PREFIX_SEQ: i32 = 1;

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
        /// One Ask turn. `stop` is the caller's flag on the cancel board and
        /// the turn's deadline, read before the job starts, between prompt
        /// chunks and per token.
        Ask {
            job: AskJob,
            stop: super::AskStop,
            reply: SyncSender<Result<AskGenerated, AskError>>,
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

        /// One Ask turn. Waits for the answer, but looks at `stop` every
        /// `ASK_CANCEL_POLL` while it does, so a cancelled or expired turn
        /// returns at once even when the job is still queued behind another
        /// kind's generation; the worker then skips it when it gets there.
        pub fn ask(
            &self,
            req: &super::AskRequest,
            stop: &super::AskStop,
        ) -> Result<AskGenerated, AskError> {
            let (reply_tx, reply_rx) = sync_channel::<Result<AskGenerated, AskError>>(1);
            let jobs = self.jobs.as_ref().ok_or(AskError::WorkerGone)?;
            jobs.send(Job::Ask {
                job: AskJob {
                    head: super::ask_prompt_head(&req.prefix),
                    tail: super::ask_prompt_tail(&req.context, &req.question),
                    context: req.context.clone(),
                    mode: req.mode,
                    grammar: req.grammar.clone(),
                },
                stop: stop.clone(),
                reply: reply_tx,
            })
            .map_err(|_| AskError::WorkerGone)?;
            loop {
                match reply_rx.recv_timeout(ASK_CANCEL_POLL) {
                    Ok(result) => return result,
                    Err(RecvTimeoutError::Timeout) => {
                        if let Some(halt) = stop.check() {
                            return Err(halt.into());
                        }
                    }
                    Err(RecvTimeoutError::Disconnected) => return Err(AskError::WorkerGone),
                }
            }
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
            // Two sequences in ONE unified cache of `CONTEXT_SIZE` cells:
            // sequence 0 is where every generation runs, as before; sequence
            // 1 holds the Ask kind's static prefix between turns
            // (`AskPrefix`). Unified, each sequence may still use the whole
            // window (`n_ctx_seq == n_ctx`), the KV buffer is the same size
            // as with one sequence, and copying the prefix into sequence 0
            // is a bookkeeping operation on shared cells, not a data copy.
            let ctx_params = LlamaContextParams::default()
                .with_n_ctx(std::num::NonZero::new(CONTEXT_SIZE))
                .with_n_batch(CONTEXT_SIZE)
                .with_n_seq_max(2)
                .with_kv_unified(true)
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
            // What `infer` believes is currently evaluated into the KV
            // cells of this context, so the next call can skip re-evaluating
            // the shared head. Declared beside `ctx` because it describes
            // that context's cache: rebuilding the context on a model swap
            // drops both together.
            let mut resident: Vec<LlamaToken> = Vec::new();
            // The Ask kind's cached prefix and compiled grammars. Both
            // belong to this context and this model: rebuilt with them on a
            // swap, gone with the thread on an unload.
            let mut ask_prefix = AskPrefix::default();
            let mut grammars = GrammarCache::default();

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
                        let out = infer(
                            &model,
                            &mut ctx,
                            &mut batch,
                            &mut resident,
                            &mut ask_prefix,
                            &context,
                            max_tokens,
                        );
                        let _ = reply.send(out);
                    }
                    Job::Ask { job, stop, reply } => {
                        let out = infer_ask(
                            &model,
                            &mut ctx,
                            &mut batch,
                            &mut resident,
                            &mut ask_prefix,
                            &mut grammars,
                            &job,
                            &stop,
                        );
                        // The caller may have stopped waiting (cancelled
                        // while queued); a send to nobody is fine.
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
                    // The grammars hold the old model's vocabulary by raw
                    // pointer, which the borrow checker cannot see: they go
                    // first, explicitly, with the context.
                    drop(grammars);
                    drop(ask_prefix);
                    drop(ctx);
                    model = new_model;
                }
                // Job channel closed — the worker was dropped.
                None => return,
            }
        }
    }

    /// Escape hatch for the KV prefix reuse below, in the same spirit as
    /// `YAMES_LLM_GPU_LAYERS`: set `YAMES_LLM_NO_PREFIX_CACHE=1` to force
    /// full prompt evaluation on every call. It exists so the T04b
    /// speed-up can be re-measured A/B on any machine rather than taken
    /// on faith from a number in a PR, and so a suspected cache bug can
    /// be ruled in or out without a rebuild.
    fn prefix_cache_disabled() -> bool {
        static DISABLED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
        *DISABLED.get_or_init(|| {
            matches!(
                std::env::var("YAMES_LLM_NO_PREFIX_CACHE").as_deref(),
                Ok("1") | Ok("true")
            )
        })
    }

    /// One generation against the resident context.
    fn infer(
        model: &LlamaModel,
        ctx: &mut LlamaContext<'_>,
        batch: &mut LlamaBatch,
        resident: &mut Vec<LlamaToken>,
        ask_prefix: &mut AskPrefix,
        context: &str,
        max_tokens: usize,
    ) -> Result<Generated, String> {
        let prompt = build_prompt(context);
        let tokens = model
            .str_to_token(&prompt, llama_cpp_2::model::AddBos::Always)
            .map_err(|e| format!("Tokenization failed: {e}"))?;

        if tokens.len() + max_tokens >= CONTEXT_SIZE as usize {
            return Err("Prompt too long for context window".into());
        }
        // `- 1` below would wrap; `AddBos::Always` makes this unreachable.
        if tokens.is_empty() {
            return Err("Tokenizer produced an empty prompt".into());
        }
        // The Ask kind's prefix sits in sequence 1 of the same cache. If it
        // and this generation might not both fit, the prefix goes (the next
        // Ask decodes it again); this generation never loses room to it.
        ask_prefix.make_room(ctx, tokens.len() + max_tokens);

        // T04b: reuse the KV cells the previous call already evaluated.
        //
        // `build_prompt` puts a byte-identical ChatML system block in
        // front of every prompt — SYSTEM_PROMPT is a 553-char constant —
        // and only `{context}` varies. Re-evaluating that prefix on every
        // call is the cost that made the CPU path unusable: a rephrase
        // emits ~17 tokens but was paying full prompt evaluation each
        // time.
        //
        // Matching on *tokens* rather than trusting the string prefix is
        // deliberate: BPE can merge across the prefix/context boundary,
        // so the tokenisation of the fixed text is not guaranteed to be
        // stable when what follows it changes. A longest-common-prefix
        // scan is correct whatever the tokeniser does, and opportunistically
        // reuses more than the system block when two calls in a session
        // happen to share a longer head.
        //
        // Capped at `len - 1` so at least one token is always decoded:
        // llama.cpp needs a non-empty batch, and the final prompt token
        // is the one carrying the logits the sampler reads.
        let mut keep = 0usize;
        if !prefix_cache_disabled() {
            while keep < resident.len() && keep < tokens.len() - 1 && resident[keep] == tokens[keep]
            {
                keep += 1;
            }
        }

        // Drop every cell from `keep` onward — the diverging tail of the
        // last prompt plus everything it generated. `clear_kv_cache_seq`
        // rather than `clear_kv_cache()`: the latter is
        // `llama_memory_clear(mem, true)`, which also zeroes the KV *data*
        // buffer — 576 MiB for Qwen3-4B at n_ctx 4096, and on a Vulkan
        // build that is a device-memory wipe on every single generation.
        // Dropping the cells is all we need; stale bytes behind
        // unreferenced cells are never read.
        //
        // The error case is an out-of-range sequence id, which `Some(0)`
        // cannot be. If it ever does fail the cache is in an unknown
        // state, so forget what we thought was resident.
        if let Err(e) = ctx.clear_kv_cache_seq(Some(0), Some(keep as u32), None) {
            resident.clear();
            return Err(format!("KV cache reset failed: {e}"));
        }

        batch.clear();
        for (i, &token) in tokens.iter().enumerate().skip(keep) {
            let is_last = i == tokens.len() - 1;
            batch
                .add(token, i as i32, &[0], is_last)
                .map_err(|e| format!("Batch add failed: {e}"))?;
        }

        // From here the KV holds `tokens[..]` (and, once the loop below
        // runs, the sampled tail). Record the prompt now so that a decode
        // failure leaves `resident` describing no more than what is
        // actually there.
        resident.clear();
        if let Err(e) = ctx.decode(batch) {
            return Err(format!("Decode failed: {e}"));
        }
        resident.extend_from_slice(&tokens);

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
    // The Ask kind
    // -----------------------------------------------------------------

    /// The Ask kind's static prefix, decoded once into `ASK_PREFIX_SEQ`
    /// and kept there between turns.
    ///
    /// The `resident` longest-common-prefix reuse in `infer` already skips
    /// a shared head between two consecutive calls, but it lives in
    /// sequence 0, so one greeting or report between two questions costs
    /// the next question the whole prefix again (some 900 tokens of tool
    /// list, seconds on a CPU). A sequence of its own survives that. The
    /// key is the tokens, not the string, for the reason `infer` gives.
    #[derive(Default)]
    pub(super) struct AskPrefix {
        tokens: Option<Vec<LlamaToken>>,
    }

    impl AskPrefix {
        fn len(&self) -> usize {
            self.tokens.as_ref().map_or(0, Vec::len)
        }

        fn holds(&self, head: &[LlamaToken]) -> bool {
            self.tokens.as_deref() == Some(head)
        }

        /// Drop the cached prefix, cells and all.
        fn forget(&mut self, ctx: &mut LlamaContext<'_>) {
            if self.tokens.take().is_some() {
                // A whole-sequence removal cannot fail (llama.cpp only
                // refuses partial ones); the `Result` is the id conversion.
                let _ = ctx.clear_kv_cache_seq(Some(ASK_PREFIX_SEQ as u32), None, None);
            }
        }

        /// Make sure `need` more cells fit beside the cached prefix.
        fn make_room(&mut self, ctx: &mut LlamaContext<'_>, need: usize) {
            if self.len() > 0 && self.len() + need >= CONTEXT_SIZE as usize {
                self.forget(ctx);
            }
        }
    }

    /// Compiled grammars, one per distinct string, at most
    /// `GRAMMAR_CACHE_MAX`. A sampler is taken out for a generation and put
    /// back only if it ended healthy: one whose `accept` threw has an empty
    /// stack inside llama.cpp, and the next `apply` on it would abort.
    ///
    /// "Compiled once": `LlamaSampler::grammar` parses and checks the GBNF
    /// (and reports a bad one) once per string. Reuse goes through
    /// `LlamaSampler::reset`, the only way back to the start state the
    /// crate offers at 0.1.146 (it has no `clone`); llama.cpp's reset
    /// re-reads the rules from the string it kept, which for the grammars
    /// the registry writes costs well under a millisecond.
    #[derive(Default)]
    pub(super) struct GrammarCache {
        /// Each sampler with its grammar's `measure_grammar` size.
        compiled: HashMap<String, (LlamaSampler, u64)>,
    }

    const GRAMMAR_CACHE_MAX: usize = 8;
    /// The cache's total, in `measure_grammar` elements: four grammars at
    /// the per-grammar cap, about 3 MB of parsed rules held at the most.
    /// Every grammar in it is parsed again on its next `reset()`, so this
    /// also bounds what a reuse can allocate.
    pub(super) const GRAMMAR_CACHE_MAX_ELEMENTS: u64 = 4 * super::ASK_GRAMMAR_MAX_ELEMENTS;

    impl GrammarCache {
        /// The sampler for `source` and its size: the cached one reset to
        /// the start, or a new one compiled.
        pub(super) fn take(
            &mut self,
            model: &LlamaModel,
            source: &str,
        ) -> Result<(LlamaSampler, u64), String> {
            if let Some((mut sampler, size)) = self.compiled.remove(source) {
                sampler.reset();
                return Ok((sampler, size));
            }
            let size = super::measure_grammar(source)?;
            let sampler = LlamaSampler::grammar(model, source, "root").map_err(|e| match e {
                llama_cpp_2::GrammarError::RootNotFound => "no `root` rule".to_string(),
                llama_cpp_2::GrammarError::NullGrammar => {
                    "llama.cpp could not parse it (see the log for where)".to_string()
                }
                other => other.to_string(),
            })?;
            Ok((sampler, size))
        }

        /// Keep a healthy sampler for the next turn. Past
        /// `GRAMMAR_CACHE_MAX` grammars, or `GRAMMAR_CACHE_MAX_ELEMENTS` in
        /// all, the others are dropped first.
        pub(super) fn put_back(&mut self, source: String, sampler: LlamaSampler, size: u64) {
            self.compiled.remove(&source);
            if self.compiled.len() >= GRAMMAR_CACHE_MAX
                || self.total().saturating_add(size) > GRAMMAR_CACHE_MAX_ELEMENTS
            {
                self.compiled.clear();
            }
            self.compiled.insert(source, (sampler, size));
        }

        /// The sizes of the grammars held, in `measure_grammar` elements.
        pub(super) fn total(&self) -> u64 {
            self.compiled.values().map(|(_, size)| size).sum()
        }

        #[cfg(test)]
        pub(super) fn len(&self) -> usize {
            self.compiled.len()
        }
    }

    /// One sampling step's verdict.
    #[derive(Debug, PartialEq)]
    pub(super) enum Step {
        Token(LlamaToken),
        /// End of generation, allowed here (by the grammar, if any).
        End,
        /// Nothing can be sampled. `poisoned` when the grammar's state
        /// inside llama.cpp is no longer safe to use.
        DeadEnd { why: String, poisoned: bool },
    }

    fn candidates(logits: &[f32]) -> LlamaTokenDataArray {
        LlamaTokenDataArray::from_iter(
            logits
                .iter()
                .enumerate()
                .map(|(i, &l)| LlamaTokenData::new(LlamaToken::new(i as i32), l, 0.0)),
            false,
        )
    }

    /// Whether the grammar, in its current state, lets `token` come next.
    fn grammar_allows(grammar: &LlamaSampler, token: LlamaToken) -> bool {
        let mut one = LlamaTokenDataArray::new(vec![LlamaTokenData::new(token, 1.0, 0.0)], false);
        one.apply_sampler(grammar);
        one.data.first().is_some_and(|d| d.logit().is_finite())
    }

    /// Pick the next token from `logits`, under `grammar` if there is one,
    /// without ever letting llama.cpp throw or abort across the FFI.
    ///
    /// Two places in llama.cpp's grammar code end the process rather than
    /// return an error: `llama_grammar_accept_impl` calls `GGML_ABORT` when
    /// it is handed an end-of-generation token the grammar does not allow
    /// yet, and `llama_grammar_reject_candidates` asserts on an empty stack,
    /// which is the state an `accept` leaves behind when it throws. And
    /// `llama_sampler_sample` (what `LlamaSampler::sample` calls) runs
    /// `accept` with no `try` around it, so a rejected token there is a C++
    /// exception unwinding into Rust: an abort. So, with a grammar:
    ///
    ///   1. never `sample` with the grammar in the chain: apply it to a
    ///      candidate array (`apply` neither throws nor aborts while the
    ///      stack is non-empty), then let `chain` pick;
    ///   2. every pick is re-checked against the grammar, and a pick it
    ///      does not allow is a dead end, not an `accept`;
    ///   3. an end-of-generation pick ends the answer and is never handed
    ///      to `accept` at all (that is the abort above);
    ///   4. everything else goes through `try_accept`, the crate's wrapper
    ///      that catches the exception; a caught one poisons the grammar.
    ///
    /// When the grammar is complete it rejects every token but
    /// end-of-generation, so 1 and 3 end the answer; if the model gives
    /// end-of-generation no weight at all, 1 finds nothing allowed and it is
    /// a dead end. Either way the process lives: the fuzz test holds this.
    ///
    /// The fast path is llama.cpp's own (`common_sampler_sample`): pick
    /// without the grammar, and only if the grammar refuses that pick,
    /// apply it to the whole vocabulary and pick again. Most tokens of a
    /// choice are forced and the model agrees with the grammar, so most
    /// steps cost one candidate's check rather than 150,000.
    pub(super) fn sample_step(
        model: &LlamaModel,
        logits: &[f32],
        chain: &mut LlamaSampler,
        grammar: Option<&mut LlamaSampler>,
    ) -> Step {
        let mut free = candidates(logits);
        free.apply_sampler(chain);
        let Some(first) = free.selected_token() else {
            return Step::DeadEnd {
                why: "the sampler picked nothing".into(),
                poisoned: false,
            };
        };
        let Some(grammar) = grammar else {
            return if model.is_eog_token(first) {
                Step::End
            } else {
                Step::Token(first)
            };
        };

        let token = if grammar_allows(grammar, first) {
            first
        } else {
            let mut held = candidates(logits);
            held.apply_sampler(grammar);
            if !held.data.iter().any(|d| d.logit().is_finite()) {
                return Step::DeadEnd {
                    why: "the grammar allows no token the model can give".into(),
                    poisoned: false,
                };
            }
            held.apply_sampler(chain);
            match held.selected_token() {
                Some(t) if grammar_allows(grammar, t) => t,
                _ => {
                    return Step::DeadEnd {
                        why: "the sampler picked a token the grammar refuses".into(),
                        poisoned: false,
                    }
                }
            }
        };

        if model.is_eog_token(token) {
            return Step::End;
        }
        match grammar.try_accept(token) {
            Ok(()) => Step::Token(token),
            Err(e) => Step::DeadEnd {
                why: format!("the grammar refused an allowed token ({e})"),
                poisoned: true,
            },
        }
    }

    /// Decode `tokens` into `seq` from position `start`, `ASK_DECODE_CHUNK`
    /// at a time, looking at `stop` before each chunk. Logits only for
    /// the last token, and only when `logits_last`.
    fn decode_chunks(
        ctx: &mut LlamaContext<'_>,
        batch: &mut LlamaBatch,
        tokens: &[LlamaToken],
        start: usize,
        seq: i32,
        logits_last: bool,
        stop: &super::AskStop,
    ) -> Result<(), AskError> {
        for (c, chunk) in tokens.chunks(ASK_DECODE_CHUNK).enumerate() {
            if let Some(halt) = stop.check() {
                return Err(halt.into());
            }
            batch.clear();
            for (j, &token) in chunk.iter().enumerate() {
                let i = c * ASK_DECODE_CHUNK + j;
                let last = logits_last && i + 1 == tokens.len();
                batch
                    .add(token, (start + i) as i32, &[seq], last)
                    .map_err(|e| AskError::Failed(format!("Batch add failed: {e}")))?;
            }
            ctx.decode(batch)
                .map_err(|e| AskError::Failed(format!("Decode failed: {e}")))?;
        }
        Ok(())
    }

    fn millis(since: Instant) -> u32 {
        since.elapsed().as_millis().min(u32::MAX as u128) as u32
    }

    /// One Ask turn against the resident context.
    #[allow(clippy::too_many_arguments)]
    fn infer_ask(
        model: &LlamaModel,
        ctx: &mut LlamaContext<'_>,
        batch: &mut LlamaBatch,
        resident: &mut Vec<LlamaToken>,
        prefix: &mut AskPrefix,
        grammars: &mut GrammarCache,
        job: &AskJob,
        stop: &super::AskStop,
    ) -> Result<AskGenerated, AskError> {
        let started = Instant::now();
        // Cancelled or expired while it was queued: nothing touched.
        if let Some(halt) = stop.check() {
            return Err(halt.into());
        }
        let failed = |what: &str, e: &dyn std::fmt::Display| AskError::Failed(format!("{what}: {e}"));

        let head = model
            .str_to_token(&job.head, llama_cpp_2::model::AddBos::Always)
            .map_err(|e| failed("Tokenization failed", &e))?;
        let tail = model
            .str_to_token(&job.tail, llama_cpp_2::model::AddBos::Never)
            .map_err(|e| failed("Tokenization failed", &e))?;
        let context_tokens = model
            .str_to_token(&job.context, llama_cpp_2::model::AddBos::Never)
            .map_err(|e| failed("Tokenization failed", &e))?
            .len();
        if context_tokens > super::ASK_CONTEXT_MAX_TOKENS {
            return Err(AskError::Failed(format!(
                "the context is {context_tokens} tokens; an ask allows {}",
                super::ASK_CONTEXT_MAX_TOKENS
            )));
        }
        let max_tokens = job.mode.max_tokens();
        if tail.is_empty() || head.len() + tail.len() + max_tokens >= CONTEXT_SIZE as usize {
            return Err(AskError::Failed("Prompt too long for context window".into()));
        }

        // The grammar before any decoding, so a bad one costs nothing.
        let (mut grammar, grammar_size) = match job.grammar.as_deref() {
            Some(source) => {
                let (g, size) = grammars.take(model, source).map_err(|e| {
                    AskError::Failed(format!("{}: {e}", super::ASK_GRAMMAR_ERROR))
                })?;
                (Some(g), size)
            }
            None => (None, 0),
        };

        // Sequence 0 is rebuilt for this turn whatever happens, so its
        // cells are freed first: a long report left there must not crowd
        // out the prefix's decode below. `resident` stays empty until the
        // whole prompt is in, so a cancel or a failure below leaves the next
        // `infer` re-deciding from nothing rather than trusting cells that
        // were never filled.
        resident.clear();
        ctx.clear_kv_cache_seq(Some(0), None, None)
            .map_err(|e| failed("KV cache reset failed", &e))?;

        // The static prefix: decoded into its own sequence unless it is
        // already there. `YAMES_LLM_NO_PREFIX_CACHE=1` turns this off too,
        // so the saving can be measured A/B on one binary.
        let prefix_cached = !prefix_cache_disabled() && prefix.holds(&head);
        if !prefix_cached {
            prefix.forget(ctx);
            if let Err(e) = decode_chunks(ctx, batch, &head, 0, ASK_PREFIX_SEQ, false, stop) {
                // Half a prefix in sequence 1 is no prefix at all.
                let _ = ctx.clear_kv_cache_seq(Some(ASK_PREFIX_SEQ as u32), None, None);
                return Err(e);
            }
            prefix.tokens = Some(head.clone());
        }

        // Sequence 0 becomes the prefix plus this turn.
        if let Err(e) = ctx.copy_kv_cache_seq(ASK_PREFIX_SEQ, 0, None, None) {
            prefix.forget(ctx);
            return Err(failed("KV cache copy failed", &e));
        }
        decode_chunks(ctx, batch, &tail, head.len(), 0, true, stop)?;
        resident.extend_from_slice(&head);
        resident.extend_from_slice(&tail);
        let prompt_ms = millis(started);

        // A choice wants the model's best pick under the grammar, every
        // time; prose keeps the coach's usual temperature (ROADMAP 0.3).
        let mut chain = match job.mode {
            super::AskMode::Choice => LlamaSampler::greedy(),
            super::AskMode::Prose => LlamaSampler::chain_simple([
                LlamaSampler::temp(0.7),
                LlamaSampler::top_p(0.9, 1),
                LlamaSampler::dist(42),
            ]),
        };

        let mut decoder = encoding_rs::UTF_8.new_decoder();
        let mut text = String::new();
        let mut produced = 0usize;
        // Until the model ends it, an answer that stops is a truncated one.
        let mut end = super::AskEnd::Truncated(super::TruncatedBy::Budget);
        let mut whitespace_run = 0usize;
        let mut poisoned: Option<String> = None;
        let position = head.len() + tail.len();

        for _ in 0..max_tokens {
            // Per token: the player's cancel and the turn's deadline. One
            // `sample_step` between two checks is not interruptible (see
            // `measure_grammar` for what bounds it).
            if let Some(halt) = stop.check() {
                // The grammar is mid-answer; `take` resets it next time.
                if let (Some(source), Some(g)) = (job.grammar.clone(), grammar.take()) {
                    grammars.put_back(source, g, grammar_size);
                }
                return Err(halt.into());
            }
            let logits = ctx.get_logits_ith(batch.n_tokens() - 1);
            let token = match sample_step(model, logits, &mut chain, grammar.as_mut()) {
                Step::Token(t) => t,
                Step::End => {
                    end = super::AskEnd::Finished;
                    break;
                }
                // The grammar's state in llama.cpp is broken: llama.cpp
                // allowed a token and then refused it. Reported as the
                // grammar's error, since only a grammar construct can
                // bring that about.
                Step::DeadEnd { why, poisoned: true } => {
                    poisoned = Some(why);
                    break;
                }
                // A valid grammar the model cannot continue under: an
                // outcome, not the caller's bug.
                Step::DeadEnd { why, poisoned: false } => {
                    end = super::AskEnd::DeadEnd(why);
                    break;
                }
            };
            produced += 1;
            let piece = model
                .token_to_piece(token, &mut decoder, false, None)
                .map_err(|e| failed("Token decode failed", &e))?;
            if grammar.is_some() && !piece.is_empty() && piece.trim().is_empty() {
                whitespace_run += 1;
            } else {
                whitespace_run = 0;
            }
            text.push_str(&piece);
            if whitespace_run >= ASK_MAX_WHITESPACE_RUN {
                end = super::AskEnd::Truncated(super::TruncatedBy::Whitespace);
                break;
            }

            batch.clear();
            batch
                .add(token, (position + produced - 1) as i32, &[0], true)
                .map_err(|e| failed("Batch add failed", &e))?;
            ctx.decode(batch).map_err(|e| failed("Decode failed", &e))?;
        }

        if let (Some(source), Some(g)) = (job.grammar.clone(), grammar.take()) {
            if poisoned.is_none() {
                grammars.put_back(source, g, grammar_size);
            }
        }
        if let Some(why) = poisoned {
            return Err(AskError::Failed(format!("{}: {why}", super::ASK_GRAMMAR_ERROR)));
        }

        Ok(AskGenerated {
            text: super::strip_think(&text),
            tokens: produced,
            end,
            prefix_cached,
            prompt_ms,
            total_ms: millis(started),
        })
    }

    use super::lower_current_thread_priority;
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
// The Ask kind, without a model (every build)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod ask_tests {
    use super::*;

    /// The registry's generated grammar (`scripts/coach-blocks.mjs`): the
    /// shape every Ask grammar will have.
    const COACH_ANSWER_GBNF: &str = include_str!("../../src/coach/blocks/coach-answer.gbnf");

    /// Leg c3a: the six existing kinds go to the model exactly as before.
    /// Pinned byte for byte, system text included: a change here changes
    /// what every shipped coach line is generated from, and must be made
    /// on purpose, not as a side effect of the Ask kind.
    #[test]
    fn the_existing_kinds_prompt_is_byte_identical() {
        let expected = "<|im_start|>system\n\
You are a practice coach for a metronome app. You help musicians improve their timing and rhythm.\n\
\n\
Rules:\n\
- Keep responses concise (1-3 sentences max)\n\
- Only discuss timing, rhythm, practice, and the session data you're given\n\
- Be encouraging but honest about areas to improve\n\
- Never make up data \u{2014} only reference metrics provided to you\n\
- Use natural, conversational language like a supportive instructor\n\
- When commenting on timing: \"early\" means ahead of the beat, \"late\" means behind\n\
- Reference specific beats or patterns when the data supports it\n\
\n\
/no_think<|im_end|>\n\
<|im_start|>user\n\
Accuracy: 82\nUser asks: hello?<|im_end|>\n\
<|im_start|>assistant\n\
<think>\n\n</think>\n\n";
        assert_eq!(chat_prompt("Accuracy: 82\nUser asks: hello?"), expected);
        // And the context goes in verbatim: no trimming, no escaping.
        assert!(chat_prompt("  x\n").contains("<|im_start|>user\n  x\n<|im_end|>"));
    }

    #[test]
    fn the_existing_kinds_keep_their_budgets() {
        for kind in [GenKind::Tip, GenKind::Greeting, GenKind::Drill] {
            assert_eq!(kind.max_tokens(), 64, "{kind:?}");
            assert!(kind.is_rephrase());
        }
        for kind in [GenKind::Report, GenKind::Summary, GenKind::Chat] {
            assert_eq!(kind.max_tokens(), 256, "{kind:?}");
            assert!(!kind.is_rephrase());
        }
        assert!(!GenKind::Ask.is_rephrase());
        assert_eq!(AskMode::Choice.max_tokens(), 48);
        assert_eq!(AskMode::Prose.max_tokens(), 96);
    }

    #[test]
    fn generate_refuses_the_ask_kind() {
        let handle = create_shared_engine();
        assert_eq!(
            generate(&handle, GenKind::Ask, "User asks: hi").unwrap_err(),
            ASK_NOT_THROUGH_GENERATE
        );
        // `coach_generate` deserialises it like any other kind.
        let kind: GenKind = serde_json::from_str("\"ask\"").unwrap();
        assert_eq!(kind, GenKind::Ask);
    }

    #[test]
    fn the_ask_prompt_puts_its_own_rules_before_the_callers_prefix() {
        let head = ask_prompt_head("  TOOLS: open_step  ");
        assert!(head.starts_with("<|im_start|>system\nYou answer one question inside Yames"));
        assert!(head.contains("nothing else\n\nTOOLS: open_step\n\n/no_think<|im_end|>\n"));
        assert!(head.ends_with("<|im_start|>user\n"));
        // The head is all that varies with the prefix: it is the cache key.
        assert_eq!(ask_prompt_head("p"), ask_prompt_head("p"));

        let tail = ask_prompt_tail("Step 7 open\n", " why? ");
        assert_eq!(
            tail,
            "Step 7 open\n\nQuestion: why?<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
        );
        assert!(ask_prompt_tail("", "why?").starts_with("Question: why?"));
    }

    #[test]
    fn a_request_and_its_outcomes_have_the_wire_shape_the_frontend_uses() {
        let req: AskRequest = serde_json::from_str(
            r#"{"generationId":7,"mode":"choice","prefix":"p","context":"c","question":"q","grammar":"root ::= \"x\""}"#,
        )
        .unwrap();
        assert_eq!(req.generation_id, 7);
        assert_eq!(req.mode, AskMode::Choice);
        assert_eq!(req.grammar.as_deref(), Some("root ::= \"x\""));
        let no_grammar: AskRequest = serde_json::from_str(
            r#"{"generationId":8,"mode":"prose","prefix":"","context":"","question":"q"}"#,
        )
        .unwrap();
        assert_eq!(no_grammar.grammar, None);
        assert_eq!(no_grammar.deadline_ms, None);
        assert_eq!(no_grammar.deadline(), std::time::Duration::from_millis(8_000));
        let timed: AskRequest = serde_json::from_str(
            r#"{"generationId":9,"mode":"prose","prefix":"","context":"","question":"q","deadlineMs":2500}"#,
        )
        .unwrap();
        assert_eq!(timed.deadline(), std::time::Duration::from_millis(2_500));
        let greedy = AskRequest { deadline_ms: Some(u32::MAX), ..timed };
        assert_eq!(greedy.deadline(), std::time::Duration::from_millis(ASK_MAX_DEADLINE_MS as u64));

        let answered = AskOutcome::Answered {
            text: "{}".into(),
            prefix_cached: false,
            prompt_ms: 3,
            total_ms: 9,
        };
        assert_eq!(
            serde_json::to_value(&answered).unwrap(),
            serde_json::json!({"status":"answered","text":"{}","prefixCached":false,"promptMs":3,"totalMs":9})
        );
        let truncated = AskOutcome::Truncated {
            text: "{\"to".into(),
            by: TruncatedBy::Budget,
            prefix_cached: true,
            prompt_ms: 3,
            total_ms: 9,
        };
        assert_eq!(
            serde_json::to_value(&truncated).unwrap(),
            serde_json::json!({"status":"truncated","text":"{\"to","by":"budget","prefixCached":true,"promptMs":3,"totalMs":9})
        );
        assert_eq!(
            serde_json::to_value(AskOutcome::DeadEnd { why: "w".into() }).unwrap(),
            serde_json::json!({"status":"deadEnd","why":"w"})
        );
        assert_eq!(
            serde_json::to_value(AskOutcome::Cancelled).unwrap(),
            serde_json::json!({"status":"cancelled"})
        );
        assert_eq!(
            serde_json::to_value(AskOutcome::TimedOut).unwrap(),
            serde_json::json!({"status":"timedOut"})
        );
        assert_eq!(
            serde_json::to_value(AskOutcome::NoModel).unwrap(),
            serde_json::json!({"status":"noModel"})
        );
    }

    /// Findings 4 and 5 of the c3a review: only an answer the model ended
    /// is `answered`; a cut-off one is `truncated` (budget or whitespace
    /// guard) and a valid grammar's dead end is `deadEnd`, never a
    /// `grammar:` error.
    #[test]
    fn how_a_generation_ended_decides_its_outcome() {
        let shaped = |end| ask_outcome(end, "{\"tool\":".into(), true, 1, 2);
        assert_eq!(
            shaped(AskEnd::Finished),
            AskOutcome::Answered { text: "{\"tool\":".into(), prefix_cached: true, prompt_ms: 1, total_ms: 2 }
        );
        for by in [TruncatedBy::Budget, TruncatedBy::Whitespace] {
            assert_eq!(
                shaped(AskEnd::Truncated(by)),
                AskOutcome::Truncated {
                    text: "{\"tool\":".into(),
                    by,
                    prefix_cached: true,
                    prompt_ms: 1,
                    total_ms: 2
                }
            );
        }
        assert_eq!(
            shaped(AskEnd::DeadEnd("the grammar allows no token".into())),
            AskOutcome::DeadEnd { why: "the grammar allows no token".into() }
        );
    }

    /// Finding 2: a turn stops on the player's cancel or on its deadline,
    /// and says which; the cancel wins when both hold.
    #[test]
    fn an_ask_stops_on_a_cancel_or_its_deadline() {
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::time::{Duration, Instant};
        let flag = std::sync::Arc::new(AtomicBool::new(false));
        let live = AskStop { cancel: flag.clone(), deadline: Instant::now() + Duration::from_secs(60) };
        assert_eq!(live.check(), None);
        let past = AskStop { cancel: flag.clone(), deadline: Instant::now() };
        assert_eq!(past.check(), Some(Halt::Expired));
        flag.store(true, Ordering::Release);
        assert_eq!(live.check(), Some(Halt::Cancelled));
        assert_eq!(past.check(), Some(Halt::Cancelled));
    }

    fn request(id: u64, grammar: Option<&str>) -> AskRequest {
        AskRequest {
            generation_id: id,
            mode: AskMode::Choice,
            prefix: "Tools: open_step".into(),
            context: "Screen: Today".into(),
            question: "where was I?".into(),
            grammar: grammar.map(str::to_string),
            deadline_ms: None,
        }
    }

    #[test]
    fn with_no_model_an_ask_says_so_and_is_not_an_error() {
        let handle = create_shared_engine();
        assert_eq!(ask(&handle, &request(9_001, None)), Ok(AskOutcome::NoModel));
        assert_eq!(
            ask(&handle, &request(9_002, Some(COACH_ANSWER_GBNF))),
            Ok(AskOutcome::NoModel)
        );
    }

    #[test]
    fn a_malformed_grammar_is_an_error_even_with_no_model() {
        let handle = create_shared_engine();
        let err = ask(&handle, &request(9_010, Some("root ::= \"a\"{5,2}"))).unwrap_err();
        assert!(err.starts_with("grammar: "), "{err}");
        let err = ask(&handle, &request(9_011, Some("answer ::= \"a\""))).unwrap_err();
        assert!(err.starts_with("grammar: "), "{err}");
        let mut empty = request(9_012, None);
        empty.question = "  ".into();
        assert!(ask(&handle, &empty).is_err());
    }

    #[test]
    fn the_cancel_board() {
        // Live: flagged, and the ticket sees it.
        let ticket = cancel::register(9_100).unwrap();
        assert!(!ticket.is_cancelled());
        assert!(cancel_generation(9_100));
        assert!(ticket.is_cancelled());
        // One id, one generation at a time.
        assert!(cancel::register(9_100).is_err());
        drop(ticket);
        // Gone from the board once its call returned...
        let again = cancel::register(9_100).unwrap();
        assert!(!again.is_cancelled());
        drop(again);

        // ...and a cancel that beats its own ask is remembered.
        assert!(!cancel_generation(9_101));
        let early = cancel::register(9_101).unwrap();
        assert!(early.is_cancelled());
        drop(early);
        // Only once: the next generation with that id starts clean.
        assert!(!cancel::register(9_101).unwrap().is_cancelled());

        // `ask` itself: cancelled before it starts, it says so.
        let handle = create_shared_engine();
        cancel_generation(9_200);
        assert_eq!(ask(&handle, &request(9_200, None)), Ok(AskOutcome::Cancelled));

        // The early list is bounded. (Last in this test, and no other test
        // leaves an early cancel waiting, so the flood evicts nobody's.)
        for id in 20_000..20_100 {
            cancel_generation(id);
        }
        assert!(!cancel::register(20_000).unwrap().is_cancelled());
        assert!(cancel::register(20_099).unwrap().is_cancelled());
    }

    #[test]
    fn precheck_accepts_the_registry_grammar() {
        assert_eq!(precheck_grammar(COACH_ANSWER_GBNF), Ok(()));
        assert_eq!(precheck_grammar("root ::= \"a\"{2,5} [x]{0,3} \"b\"{4} \"c\"{1,}"), Ok(()));
        // Braces where they are text, not repetitions.
        assert_eq!(precheck_grammar("root ::= \"{5,2}\" [{}] # {9,1}\n"), Ok(()));
        assert_eq!(precheck_grammar("root ::= \"\\\"{5,2}\""), Ok(()));
    }

    #[test]
    fn precheck_refuses_what_would_hang_or_cannot_be_a_grammar() {
        for bad in [
            "",
            "   ",
            "answer ::= \"a\"",
            "root ::= \"a\"{5,2}",
            "root ::= x\nx ::= [a-z]{3,1}",
            "root ::= \"a\"{2001}",
            "root ::= \"a\"{99999999999999999999999}",
            "root ::= \"a\"{",
            "root ::= \"a\"{x}",
            "root ::= \"a\"{,3}",
            "root ::= \"a\0\"",
        ] {
            assert!(precheck_grammar(bad).is_err(), "accepted {bad:?}");
        }
        let huge = format!("root ::= \"{}\"", "a".repeat(ASK_GRAMMAR_MAX_BYTES));
        assert!(precheck_grammar(&huge).is_err());
    }

    /// Finding 1 of the c3a review: a grammar inside every textual limit
    /// that llama.cpp would expand to tens of millions of elements.
    #[test]
    fn precheck_bounds_what_a_grammar_expands_to() {
        // The reviewer's: just under 32 KB of literal, 1,999 times.
        let literal = "a".repeat(ASK_GRAMMAR_MAX_BYTES - 32);
        let reviewer = format!("root ::= \"{literal}\"{{1999}}");
        assert!(reviewer.len() <= ASK_GRAMMAR_MAX_BYTES);
        let err = precheck_grammar(&reviewer).unwrap_err();
        assert!(err.contains("expands"), "{err}");
        // Each repetition small, nested ones multiplied through.
        let nested = "root ::= ((\"ab\"{100}){100}){100}";
        assert!(precheck_grammar(nested).unwrap_err().contains("expands"));
        let nested_class = "root ::= (([a-z]{50} \"-\")* ){1000}";
        assert!(precheck_grammar(nested_class).is_err());
        // Across rules too: each one small, the total not.
        let mut many = String::from("root ::= r0\n");
        for i in 0..200 {
            many.push_str(&format!("r{i} ::= \"{}\"{{1000}}\n", "x".repeat(10)));
        }
        assert!(precheck_grammar(&many).unwrap_err().contains("expands"));

        // What tool grammars look like passes, with room to spare.
        let answer = measure_grammar(COACH_ANSWER_GBNF).unwrap();
        assert!(answer < ASK_GRAMMAR_MAX_ELEMENTS / 10, "the answer grammar measures {answer}");
        let modest = measure_grammar("root ::= ([a-z]{1,10} \",\"?){1,10}").unwrap();
        assert!(modest < 1_000, "{modest}");
        // The estimate is from above: a literal and its repetition.
        assert!(measure_grammar("root ::= \"abcd\"{10}").unwrap() >= 40);
    }

    /// Finding 2: the bounds on rules, alternatives and nesting that keep
    /// one sampling step's work to what a tool grammar needs.
    #[test]
    fn precheck_bounds_rules_alternatives_and_depth() {
        let wide = format!(
            "root ::= {}",
            (0..=GRAMMAR_MAX_ALTERNATIVES).map(|i| format!("\"w{i}\"")).collect::<Vec<_>>().join(" | ")
        );
        assert!(precheck_grammar(&wide).unwrap_err().contains("alternatives"));
        let wide_group = format!(
            "root ::= \"x\" ({})",
            (0..=GRAMMAR_MAX_ALTERNATIVES).map(|i| format!("\"w{i}\"")).collect::<Vec<_>>().join(" | ")
        );
        assert!(precheck_grammar(&wide_group).unwrap_err().contains("alternatives"));
        let just_wide = format!(
            "root ::= {}",
            (0..GRAMMAR_MAX_ALTERNATIVES).map(|i| format!("\"w{i}\"")).collect::<Vec<_>>().join(" | ")
        );
        assert_eq!(precheck_grammar(&just_wide), Ok(()));

        let deep = format!(
            "root ::= {}\"x\"{}",
            "(".repeat(GRAMMAR_MAX_DEPTH + 1),
            ")".repeat(GRAMMAR_MAX_DEPTH + 1)
        );
        assert!(precheck_grammar(&deep).unwrap_err().contains("nest"));
        let shallow = format!(
            "root ::= {}\"x\"{}",
            "(".repeat(GRAMMAR_MAX_DEPTH - 1),
            ")".repeat(GRAMMAR_MAX_DEPTH - 1)
        );
        assert_eq!(precheck_grammar(&shallow), Ok(()));

        let mut rules = String::from("root ::= r0\n");
        for i in 0..GRAMMAR_MAX_RULES {
            rules.push_str(&format!("r{i} ::= \"x\"\n"));
        }
        assert!(precheck_grammar(&rules).unwrap_err().contains("rules"));
    }

    /// The re-read's first point: groups in one rule count as rules when
    /// they open, not only when the next named rule starts, and at the end.
    #[test]
    fn groups_count_as_rules_inside_one_rule() {
        let groups = format!("root ::= {}", "(\"a\")".repeat(6_000));
        assert!(groups.len() <= ASK_GRAMMAR_MAX_BYTES);
        assert!(precheck_grammar(&groups).unwrap_err().contains("rules"), "accepted");
        // At the limit, it passes.
        let fits = format!("root ::= {}", "(\"a\")".repeat(GRAMMAR_MAX_RULES - 1));
        assert_eq!(precheck_grammar(&fits), Ok(()));
    }

    /// The re-read's second point: optional references chained through
    /// named rules expand to 4^12 parse stacks at grammar init, with no
    /// parenthesis anywhere.
    #[test]
    fn precheck_bounds_the_parse_stacks() {
        let mut chain = String::new();
        for r in 0..12 {
            let next = if r == 0 { "r1".to_string() } else { format!("r{}", r + 1) };
            let name = if r == 0 { "root".to_string() } else { format!("r{r}") };
            chain.push_str(&format!("{name} ::= {next}? {next}? {next}? {next}?\n"));
        }
        chain.push_str("r12 ::= \"x\"\n");
        assert!(chain.len() < 600, "{}", chain.len());
        let err = precheck_grammar(&chain).unwrap_err();
        assert!(err.contains("parse stacks"), "{err}");

        // The answer grammar passes with room.
        let (_, answer) = grammar_measures(COACH_ANSWER_GBNF).unwrap();
        eprintln!("[precheck] coach-answer.gbnf: {answer} parse stacks at most");
        assert!(answer <= ASK_GRAMMAR_MAX_STACKS / 8, "the answer grammar estimates {answer}");

        // Deep but nothing skippable: one stack at each step.
        let mut deep = String::from("root ::= r1 \"x\"\n");
        for r in 1..40 {
            deep.push_str(&format!("r{r} ::= r{} \"y\"\n", r + 1));
        }
        deep.push_str("r40 ::= \"z\"\n");
        let (_, stacks) = grammar_measures(&deep).unwrap();
        assert!(stacks <= 2, "{stacks}");

        // A reference chain past the cap is refused, nullable or not.
        let mut deeper = String::from("root ::= r1\n");
        for r in 1..=GRAMMAR_MAX_REF_DEPTH {
            deeper.push_str(&format!("r{r} ::= r{} \"y\"\n", r + 1));
        }
        deeper.push_str(&format!("r{} ::= \"z\"\n", GRAMMAR_MAX_REF_DEPTH + 1));
        assert!(precheck_grammar(&deeper).unwrap_err().contains("chain"));

        // Recursion is costed once, not followed forever.
        assert_eq!(precheck_grammar("root ::= \"(\" root? \")\" | \"x\""), Ok(()));
    }

    /// Leg c3b1a: the choice grammar generated from the tool registry
    /// (`src/coach/ask/grammar.ts`; `grammar.test.ts` keeps this fixture equal
    /// to what it generates) passes every bound the worker checks: size,
    /// expanded elements, rules, alternatives, depth and parse stacks.
    #[test]
    fn the_generated_choice_grammar_passes_the_precheck() {
        const CHOICE_GBNF: &str = include_str!("../../src/coach/ask/choice-grammar.gbnf");
        assert_eq!(precheck_grammar(CHOICE_GBNF), Ok(()));
        let (elements, stacks) = grammar_measures(CHOICE_GBNF).unwrap();
        eprintln!("[precheck] choice-grammar.gbnf: {} bytes, {elements} elements, {stacks} parse stacks at most", CHOICE_GBNF.len());
        assert!(elements <= ASK_GRAMMAR_MAX_ELEMENTS / 2, "{elements}");
        assert!(stacks <= ASK_GRAMMAR_MAX_STACKS / 2, "{stacks}");
    }

    /// Pure-Rust half of the fuzz: whatever bytes arrive, the precheck
    /// returns, it never panics. The llama.cpp half is in `llm_tests`.
    #[test]
    fn precheck_never_panics_on_mutated_grammars() {
        let mut rng = 0x9E37_79B9_7F4A_7C15_u64;
        let mut next = move || {
            rng ^= rng << 13;
            rng ^= rng >> 7;
            rng ^= rng << 17;
            rng
        };
        let seed = COACH_ANSWER_GBNF.as_bytes();
        const ALPHABET: &[u8] = b"{}[]()\"\\#|*+?,0123456789:=root \n\t-^.";
        for _ in 0..5_000 {
            let mut bytes = seed.to_vec();
            for _ in 0..(1 + next() % 8) {
                let at = (next() as usize) % bytes.len().max(1);
                match next() % 3 {
                    0 => bytes[at] = ALPHABET[(next() as usize) % ALPHABET.len()],
                    1 => bytes.insert(at, ALPHABET[(next() as usize) % ALPHABET.len()]),
                    _ => {
                        let end = (at + (next() as usize) % 40).min(bytes.len());
                        bytes.drain(at..end);
                    }
                }
            }
            let text = String::from_utf8_lossy(&bytes);
            let _ = precheck_grammar(&text);
        }
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
///     node scripts/rust-test.mjs --features coach-llm --lib
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
    ///     node scripts/rust-test.mjs \
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
        //
        // Each run varies the numbers. That is not cosmetic: since T04b
        // the worker reuses the KV cells its previous prompt already
        // evaluated, so a benchmark that sent one fixed string would
        // re-decode a single token and report a number no user will ever
        // see. Varying the tail leaves exactly what production shares —
        // the fixed ChatML system block — and measures the real saving.
        let rephrase = |i: usize| {
            format!(
                "Rephrase this practice-coach observation for a player of guitar. \
                 Preserve every number; keep it to one sentence.\n\n\
                 Original: \"{}% — your kick is drifting {} ms early. \
                 Lock the right foot to the click.\"",
                70 + i,
                3 + i,
            )
        };
        let chat = |i: usize| {
            format!(
                "Current session data:\nScore: {}\nAccuracy: {}\nSignedDev: -{}.2\n\
                 Longest clean streak: {}\nInstrument: guitar\n\n\
                 User asks: how was my timing?\nAnswer concisely based only on the data above.",
                70 + i,
                84 + i,
                4 + i,
                15 + i,
            )
        };

        let shapes: [(&str, &dyn Fn(usize) -> String, usize, usize); 2] = [
            ("rephrase", &rephrase, super::REPHRASE_MAX_TOKENS, 10),
            ("chat", &chat, super::CHAT_MAX_TOKENS, 5),
        ];
        for (label, prompt, budget, runs) in shapes {
            // One warm-up outside the sample: the first call after load
            // pays for cold weights (mmap page-in) and, on a GPU build,
            // shader pipeline creation. Users pay it once per launch; it
            // would otherwise dominate a 5-sample p95.
            // `runs` — one past the last sampled index, so the warm-up is
            // a distinct prompt (it must not seed the KV cache with a
            // prompt the timed runs would then reuse in full).
            let _ = worker.generate_measured(&prompt(runs), budget);

            let mut times = Vec::with_capacity(runs);
            let mut tokens = 0usize;
            for run in 0..runs {
                let started = std::time::Instant::now();
                let (out, n) = worker
                    .generate_measured(&prompt(run), budget)
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

    // -----------------------------------------------------------------
    // The Ask kind: the grammar fuzz (a vocabulary is enough) and the
    // worker with a real model.
    // -----------------------------------------------------------------

    use super::llm::{sample_step, GrammarCache, Step};
    use super::{ask, cancel_generation, AskMode, AskOutcome, AskRequest};
    use llama_cpp_2::llama_backend::LlamaBackend;
    use llama_cpp_2::model::params::LlamaModelParams;
    use llama_cpp_2::model::LlamaModel;
    use llama_cpp_2::sampling::LlamaSampler;
    use llama_cpp_2::token::LlamaToken;

    const COACH_ANSWER_GBNF: &str = include_str!("../../src/coach/blocks/coach-answer.gbnf");

    /// A choice grammar the shape c3b will generate: one object, an id
    /// from a closed list, whitespace bounded.
    const CHOICE_GBNF: &str = r#"root ::= "{" ws "\"tool\":" ws tool ws "}"
tool ::= "\"open_step\"" | "\"show_card\"" | "\"none\""
ws ::= " "?
"#;

    /// The model's vocabulary and nothing else: what the grammar code
    /// needs. `YAMES_TEST_VOCAB_GGUF` (a `ggml-vocab-*.gguf` from
    /// llama.cpp's `models/`) or, failing that, `YAMES_TEST_GGUF`. Model
    /// first in the tuple: it must drop before the backend.
    fn vocab() -> Option<(LlamaModel, LlamaBackend)> {
        let raw = std::env::var("YAMES_TEST_VOCAB_GGUF")
            .or_else(|_| std::env::var("YAMES_TEST_GGUF"))
            .ok()?;
        let backend = LlamaBackend::init().expect("backend");
        let params = LlamaModelParams::default().with_vocab_only(true);
        let model = LlamaModel::load_from_file(&backend, &raw, &params).expect("vocab load");
        Some((model, backend))
    }

    const VOCAB_VARS: &str = "YAMES_TEST_VOCAB_GGUF or YAMES_TEST_GGUF";

    /// A test that needs a model and has none passes without testing
    /// anything, so it says so on a line of its own. Written to the stderr
    /// handle rather than through `eprintln!`, which the test harness
    /// captures and hides for a passing test: this line shows in every run.
    /// The command that runs them with the model is in
    /// `plans/coach/progress/c3a.md`.
    fn skipped(test: &str, needs: &str) {
        use std::io::Write;
        let _ = writeln!(std::io::stderr(), "SKIPPED: no model: {test} (set {needs})");
    }

    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0
        }
        fn logit(&mut self) -> f32 {
            (self.next() % 2_000) as f32 / 100.0 - 10.0
        }
    }

    fn mutate(seed: &str, rng: &mut Rng) -> String {
        const ALPHABET: &[u8] = b"{}[]()\"\\#|*+?,0123456789:=root \n\t-^.";
        let mut bytes = seed.as_bytes().to_vec();
        for _ in 0..(1 + rng.next() % 6) {
            let at = (rng.next() as usize) % bytes.len().max(1);
            match rng.next() % 3 {
                0 => bytes[at] = ALPHABET[(rng.next() as usize) % ALPHABET.len()],
                1 => bytes.insert(at, ALPHABET[(rng.next() as usize) % ALPHABET.len()]),
                _ => {
                    let end = (at + (rng.next() as usize) % 24).min(bytes.len());
                    bytes.drain(at..end);
                }
            }
        }
        String::from_utf8_lossy(&bytes).into_owned()
    }

    /// Drive `sample_step` under `grammar` with logits from `logits_for`
    /// until it ends, for at most `steps`. Returns the text and how it
    /// ended. This is the worker's loop minus the model.
    fn drive(
        model: &LlamaModel,
        grammar: &mut LlamaSampler,
        chain: &mut LlamaSampler,
        steps: usize,
        mut logits_for: impl FnMut(usize) -> Vec<f32>,
    ) -> (String, Option<Step>) {
        let mut decoder = encoding_rs::UTF_8.new_decoder();
        let mut text = String::new();
        for i in 0..steps {
            let logits = logits_for(i);
            match sample_step(model, &logits, chain, Some(&mut *grammar)) {
                Step::Token(t) => {
                    text.push_str(&model.token_to_piece(t, &mut decoder, false, None).unwrap_or_default());
                }
                end => return (text, Some(end)),
            }
        }
        (text, None)
    }

    /// DESIGN 9.4 / 11: "a fuzz test that a completed grammar cannot abort
    /// the process", and a malformed grammar is an error returned, never a
    /// panic or an abort. If this test fails the way it is guarding
    /// against, the test binary dies; any other ending is a pass.
    #[test]
    fn grammar_fuzz_malformed_is_an_error_and_nothing_aborts() {
        let _guard = BACKEND_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let Some((model, _backend)) = vocab() else {
            skipped("grammar_fuzz_malformed_is_an_error_and_nothing_aborts", VOCAB_VARS);
            return;
        };
        let mut cache = GrammarCache::default();
        let n_vocab = model.n_vocab() as usize;

        // Malformed in ways the precheck lets through and llama.cpp's
        // parser must refuse.
        for bad in [
            "root ::= \"a",
            "root ::= [a-",
            "root ::= undefined",
            "root ::= root \"a\"",
            "root ::= x\nx ::= x? \"a\"",
            "root ::= ((\"a\")",
            "root ::= \"\\x0\"",
            "root",
        ] {
            assert!(cache.take(&model, bad).is_err(), "compiled {bad:?}");
        }

        // Shapes llama.cpp accepts that look as if they could loop: a
        // nullable item under a star, an empty alternative, everything
        // optional. Sampled under, with noise, until they end.
        let mut rng = Rng(0x2545_F491_4F6C_DD1D);
        let mut chain = LlamaSampler::greedy();
        for odd in [
            "root ::= (\"a\"?)* \"b\"",
            "root ::= (\"a\"*)* \"b\"",
            "root ::= \"a\" |",
            "root ::= x*\nx ::= y?\ny ::= \" \"?",
            "root ::= [ \\t\\n]* \"}\"",
        ] {
            if let Ok((mut grammar, _)) = cache.take(&model, odd) {
                let _ = drive(&model, &mut grammar, &mut chain, 64, |_| {
                    (0..n_vocab).map(|_| rng.logit()).collect()
                });
            }
        }

        // Mutations: each one either compiles or is an error; whatever
        // compiles is then sampled under for a few steps of noise.
        let mut rng = Rng(0x2545_F491_4F6C_DD1D);
        let mut compiled = 0usize;
        let mut chain = LlamaSampler::greedy();
        for i in 0..1_500 {
            let seed = if i % 10 == 0 { COACH_ANSWER_GBNF } else { CHOICE_GBNF };
            let text = mutate(seed, &mut rng);
            let Ok((mut grammar, _)) = cache.take(&model, &text) else {
                continue;
            };
            compiled += 1;
            let _ = drive(&model, &mut grammar, &mut chain, 12, |_| {
                (0..n_vocab).map(|_| rng.logit()).collect()
            });
        }
        eprintln!("[fuzz] 1500 mutated grammars, {compiled} compiled and were sampled under");
        assert!(compiled > 0, "no mutation compiled; the fuzz sampled nothing");
    }

    #[test]
    fn a_completed_grammar_cannot_abort_the_process() {
        let _guard = BACKEND_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let Some((model, _backend)) = vocab() else {
            skipped("a_completed_grammar_cannot_abort_the_process", VOCAB_VARS);
            return;
        };
        let n_vocab = model.n_vocab() as usize;
        let eog: Vec<usize> =
            (0..n_vocab).filter(|&i| model.is_eog_token(LlamaToken::new(i as i32))).collect();
        assert!(!eog.is_empty(), "this vocabulary has no end-of-generation token");
        let mut cache = GrammarCache::default();
        let mut rng = Rng(0xDEAD_BEEF_CAFE_F00D);
        let answers = ["{\"tool\":\"open_step\"}", "{\"tool\":\"show_card\"}", "{\"tool\":\"none\"}"];
        let accepted = |text: &str| {
            let squeezed: String = text.chars().filter(|c| *c != ' ').collect();
            answers.contains(&squeezed.as_str())
        };

        for round in 0..200 {
            let (mut grammar, _) = cache.take(&model, CHOICE_GBNF).expect("the choice grammar compiles");
            let mut chain = if round % 2 == 0 {
                LlamaSampler::greedy()
            } else {
                LlamaSampler::chain_simple([
                    LlamaSampler::temp(0.7),
                    LlamaSampler::top_p(0.9, 1),
                    LlamaSampler::dist(round as u32),
                ])
            };
            // Noise until the grammar completes: the only way out is
            // end-of-generation, which `sample_step` never hands to
            // `accept` (that is llama.cpp's GGML_ABORT).
            let (text, end) = drive(&model, &mut grammar, &mut chain, 400, |_| {
                (0..n_vocab).map(|_| rng.logit()).collect()
            });
            assert_eq!(end, Some(Step::End), "round {round}: {text:?}");
            assert!(accepted(&text), "round {round}: the grammar let through {text:?}");

            // Now push past the end: the model wants a word, and
            // end-of-generation has no weight at all. A dead end, not an
            // abort, and not a token.
            let favourite = (rng.next() as usize) % n_vocab;
            let hostile = |_| {
                let mut l: Vec<f32> = (0..n_vocab).map(|_| rng.logit()).collect();
                for &e in &eog {
                    l[e] = f32::NEG_INFINITY;
                }
                if !eog.contains(&favourite) {
                    l[favourite] = 100.0;
                }
                l
            };
            let (more, end) = drive(&model, &mut grammar, &mut chain, 5, hostile);
            assert!(more.is_empty(), "round {round}: sampled {more:?} past a completed grammar");
            assert!(
                matches!(end, Some(Step::DeadEnd { poisoned: false, .. })),
                "round {round}: {end:?}"
            );

            // And `accept` itself, past the end, is a caught error.
            let word = (0..n_vocab).find(|&i| !eog.contains(&i)).unwrap();
            assert!(grammar.try_accept(LlamaToken::new(word as i32)).is_err());
            // A poisoned sampler is never put back; a reset one starts over.
            drop(grammar);
        }
        let (mut again, size) = cache.take(&model, CHOICE_GBNF).unwrap();
        let mut chain = LlamaSampler::greedy();
        let (text, end) = drive(&model, &mut again, &mut chain, 400, |_| {
            (0..n_vocab).map(|_| rng.logit()).collect()
        });
        assert_eq!(end, Some(Step::End));
        assert!(accepted(&text), "{text:?}");
        cache.put_back(CHOICE_GBNF.to_string(), again, size);
        assert_eq!(cache.len(), 1);
        // Reused, it starts from the beginning again.
        let (mut reused, _) = cache.take(&model, CHOICE_GBNF).unwrap();
        let (text, end) = drive(&model, &mut reused, &mut chain, 400, |_| {
            (0..n_vocab).map(|_| rng.logit()).collect()
        });
        assert_eq!(end, Some(Step::End));
        assert!(accepted(&text), "{text:?}");
    }

    /// Finding 1 of the c3a review: what the cache keeps is bounded in
    /// total, not only in count, since every grammar in it is parsed again
    /// on its next reuse; and a grammar past the size cap never compiles.
    #[test]
    fn the_grammar_cache_holds_a_bounded_total() {
        let _guard = BACKEND_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let Some((model, _backend)) = vocab() else {
            skipped("the_grammar_cache_holds_a_bounded_total", VOCAB_VARS);
            return;
        };
        let reviewer = format!("root ::= \"{}\"{{1999}}", "a".repeat(super::ASK_GRAMMAR_MAX_BYTES - 32));
        let mut cache = GrammarCache::default();
        assert!(cache.take(&model, &reviewer).unwrap_err().contains("expands"));

        // Seven rules of 1,999 repetitions each (llama.cpp refuses 2,000):
        // about 84,000 elements, under the per-grammar cap, so five of them
        // overflow the total.
        let big = |n: usize| {
            let mut g = format!("root ::= \"g{n}\" r0 r1 r2 r3 r4 r5 r6\n");
            for r in 0..7 {
                g.push_str(&format!("r{r} ::= [a-z]{{1999}}\n"));
            }
            g
        };
        for n in 0..6 {
            let source = big(n);
            let (sampler, size) = cache.take(&model, &source).expect("a big grammar under the cap compiles");
            assert!(size > super::ASK_GRAMMAR_MAX_ELEMENTS / 2, "{size}");
            cache.put_back(source, sampler, size);
            assert!(
                cache.total() <= super::llm::GRAMMAR_CACHE_MAX_ELEMENTS,
                "after {n}: {} held",
                cache.total()
            );
        }
        assert!(cache.len() < 5, "{} big grammars held", cache.len());
        // And small ones still share it.
        let (sampler, size) = cache.take(&model, CHOICE_GBNF).unwrap();
        cache.put_back(CHOICE_GBNF.to_string(), sampler, size);
        assert!(cache.len() >= 2);
    }

    /// A static prefix the size DESIGN 5.5 budgets (system text and an
    /// intent list, about 900 tokens).
    fn tool_list() -> String {
        let mut s = String::from(
            "Choose the one tool that answers the player's question. Reply with one JSON object.\n\nTools:\n",
        );
        for i in 0..60 {
            s.push_str(&format!(
                "- tool_{i}: opens screen number {i} of the practice app and shows the player where it is, with a way back\n"
            ));
        }
        s
    }

    fn ask_req(id: u64, mode: AskMode, prefix: &str, question: &str, grammar: Option<&str>) -> AskRequest {
        AskRequest {
            generation_id: id,
            mode,
            prefix: prefix.to_string(),
            context: "Screen: Today. The player has one Path open: Alternate Picking, Step 7.".into(),
            question: question.to_string(),
            grammar: grammar.map(str::to_string),
            // Generous: a busy test machine must not turn these into
            // timeouts. The deadline has its own test.
            deadline_ms: Some(super::ASK_MAX_DEADLINE_MS),
        }
    }

    /// The text of an answer, complete (`true`) or truncated (`false`),
    /// with whether the prefix was cached and the two timings.
    fn answered(out: &Result<AskOutcome, String>) -> (&str, bool, bool, u32, u32) {
        match out {
            Ok(AskOutcome::Answered { text, prefix_cached, prompt_ms, total_ms }) => {
                (text.as_str(), true, *prefix_cached, *prompt_ms, *total_ms)
            }
            Ok(AskOutcome::Truncated { text, prefix_cached, prompt_ms, total_ms, .. }) => {
                (text.as_str(), false, *prefix_cached, *prompt_ms, *total_ms)
            }
            other => panic!("not an answer: {other:?}"),
        }
    }

    fn loaded() -> Option<std::sync::Arc<super::CoachHandle>> {
        let raw = std::env::var("YAMES_TEST_GGUF").ok()?;
        let handle = create_shared_engine();
        let family = Some(crate::models::CURRENT_BRAIN_FAMILY);
        assert_eq!(load_model(&handle, std::path::Path::new(&raw), family, "test"), Ok(true));
        Some(handle)
    }

    /// The choice under its grammar, the prefix kept across turns and
    /// across another kind's generation, and the saving measured.
    #[test]
    fn ask_choice_under_a_grammar_with_the_prefix_cached() {
        let _guard = BACKEND_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let Some(handle) = loaded() else {
            skipped("ask_choice_under_a_grammar_with_the_prefix_cached", "YAMES_TEST_GGUF");
            return;
        };
        let prefix = tool_list();
        let questions = [
            "where was I?",
            "show me my last card",
            "what should I practise now?",
            "open the step I was on",
            "nothing, thanks",
            "take me back",
        ];

        let first = ask(&handle, &ask_req(50_000, AskMode::Choice, &prefix, questions[0], Some(CHOICE_GBNF)));
        let (text, finished, cached, uncached_ms, _) = answered(&first);
        assert!(!cached, "the first turn cannot have a cached prefix");
        let squeezed: String = text.chars().filter(|c| *c != ' ').collect();
        assert!(
            ["{\"tool\":\"open_step\"}", "{\"tool\":\"show_card\"}", "{\"tool\":\"none\"}"]
                .contains(&squeezed.as_str()),
            "the grammar let through {text:?}"
        );
        assert!(finished, "a complete choice ends itself: {text:?}");

        let mut cached_ms = Vec::new();
        for (i, q) in questions.iter().enumerate().skip(1) {
            let out = ask(&handle, &ask_req(50_000 + i as u64, AskMode::Choice, &prefix, q, Some(CHOICE_GBNF)));
            let (text, _, cached, prompt_ms, total_ms) = answered(&out);
            assert!(cached, "turn {i} decoded the prefix again");
            eprintln!("[ask] turn {i}: prompt {prompt_ms} ms, total {total_ms} ms, {text:?}");
            cached_ms.push(prompt_ms);
            if i == 2 {
                // Another kind between two questions: sequence 0 is
                // rewritten, sequence 1 keeps the prefix.
                let chat = super::generate(&handle, GenKind::Chat, "User asks: hello?").unwrap();
                assert!(!chat.trim().is_empty());
            }
        }
        cached_ms.sort_unstable();
        let median = cached_ms[cached_ms.len() / 2];
        // The first turn above paid for cold weights too. The fair
        // comparison is a warm worker meeting a prefix of the same size it
        // has not seen: three of those.
        let mut warm_uncached = Vec::new();
        for v in 0..3u64 {
            let other = format!("(variant {v}) {prefix}");
            let out = ask(&handle, &ask_req(50_200 + v, AskMode::Choice, &other, questions[1], Some(CHOICE_GBNF)));
            let (_, _, cached, prompt_ms, _) = answered(&out);
            assert!(!cached, "a prefix never seen was taken as cached");
            warm_uncached.push(prompt_ms);
        }
        warm_uncached.sort_unstable();
        let warm = warm_uncached[1];
        eprintln!(
            "[ask] prefix cache: time to first token {median} ms cached (median of {}), \
             {warm} ms uncached on a warm worker (median of 3), {uncached_ms} ms on the cold first turn; \
             backend={}",
            cached_ms.len(),
            super::llm::BACKEND
        );
        assert!(median < warm, "the cached prefix saved nothing");

        // A different prefix is a different cache entry.
        let other = ask(&handle, &ask_req(50_100, AskMode::Choice, "Tools: none at all.", "hi", Some(CHOICE_GBNF)));
        assert!(!answered(&other).2, "a new prefix was taken for the old one");
        unload_model(&handle).unwrap();
    }

    #[test]
    fn ask_prose_bad_grammars_and_budgets() {
        let _guard = BACKEND_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let Some(handle) = loaded() else {
            skipped("ask_prose_bad_grammars_and_budgets", "YAMES_TEST_GGUF");
            return;
        };
        let out = ask(&handle, &ask_req(51_000, AskMode::Prose, "Answer in plain words.", "how do I relax my picking hand?", None));
        let (text, _, _, _, total_ms) = answered(&out);
        assert!(!text.trim().is_empty());
        assert!(!text.contains("<think>"), "{text:?}");
        eprintln!("[ask] prose in {total_ms} ms: {text:?}");

        // Through the precheck, refused by llama.cpp: an error, and the
        // worker carries on.
        let err = ask(&handle, &ask_req(51_001, AskMode::Choice, "p", "q", Some("root ::= \"a"))).unwrap_err();
        assert!(err.starts_with("grammar: "), "{err}");
        let err = ask(&handle, &ask_req(51_002, AskMode::Choice, "p", "q", Some("root ::= root \"a\""))).unwrap_err();
        assert!(err.starts_with("grammar: "), "{err}");

        // The context is held to its budget.
        let mut long = ask_req(51_003, AskMode::Choice, "p", "q", Some(CHOICE_GBNF));
        long.context = "the player practised alternate picking at ninety ".repeat(60);
        let err = ask(&handle, &long).unwrap_err();
        assert!(err.contains("context"), "{err}");

        // An unbounded `ws` is bounded by the worker, and an answer it cut
        // off says so (finding 5): never `answered`.
        let loose = "root ::= \"{\" ws \"}\"\nws ::= [ \\t\\n]*\n";
        let out = ask(&handle, &ask_req(51_004, AskMode::Choice, "Reply with {} padded with as many spaces as you like.", "go", Some(loose)));
        let (text, complete, _, _, _) = answered(&out);
        assert!(text.starts_with('{'), "{text:?}");
        if complete {
            assert!(text.trim_end().ends_with('}'), "answered but incomplete: {text:?}");
        } else {
            assert!(
                matches!(out, Ok(AskOutcome::Truncated { by: super::TruncatedBy::Whitespace, .. })),
                "{out:?}"
            );
        }

        // Out of budget is `truncated` too. A long answer asked for, three
        // tries: at least one of them must run past 96 tokens.
        let mut cut = 0;
        for (i, q) in [
            "write a long essay, at least five hundred words, on how to practise alternate picking",
            "list forty different exercises for the picking hand, each with a paragraph",
            "explain everything about metronome practice in great detail, step by step",
        ]
        .iter()
        .enumerate()
        {
            let out = ask(&handle, &ask_req(51_010 + i as u64, AskMode::Prose, "Answer at length.", q, None));
            match out {
                Ok(AskOutcome::Truncated { ref text, by: super::TruncatedBy::Budget, .. }) => {
                    assert!(!text.trim().is_empty());
                    cut += 1;
                }
                Ok(AskOutcome::Answered { .. }) => {}
                other => panic!("{other:?}"),
            }
        }
        assert!(cut > 0, "no long answer ran out of budget; the truncated status was not seen");

        let still = ask(&handle, &ask_req(51_005, AskMode::Choice, "p", "q", Some(CHOICE_GBNF)));
        answered(&still);
        unload_model(&handle).unwrap();
    }

    /// Cancel: while queued behind another kind, while running, and the
    /// worker answering normally straight after.
    #[test]
    fn ask_cancel_queued_and_running() {
        let _guard = BACKEND_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let Some(handle) = loaded() else {
            skipped("ask_cancel_queued_and_running", "YAMES_TEST_GGUF");
            return;
        };
        let prefix = tool_list();

        // Running: a prose answer, cancelled as soon as it has started.
        let mut cancelled_running = 0;
        for round in 0..5u64 {
            let id = 52_000 + round;
            let h = handle.clone();
            let p = prefix.clone();
            let running = std::thread::spawn(move || {
                ask(&h, &ask_req(id, AskMode::Prose, &p, "tell me everything about practice", None))
            });
            std::thread::sleep(std::time::Duration::from_millis(20 + round * 40));
            let flagged = cancel_generation(id);
            let started = std::time::Instant::now();
            let out = running.join().unwrap();
            eprintln!("[ask] cancel round {round}: flagged={flagged} out={:?} returned {:?} after the cancel", out.as_ref().map(|o| matches!(o, AskOutcome::Cancelled)), started.elapsed());
            match out {
                Ok(AskOutcome::Cancelled) => {
                    assert!(flagged);
                    assert!(started.elapsed() < std::time::Duration::from_millis(1_500));
                    cancelled_running += 1;
                }
                // Finished in the instant between the flag and the end.
                Ok(AskOutcome::Answered { .. } | AskOutcome::Truncated { .. }) => {}
                other => panic!("round {round}: {other:?}"),
            }
        }
        assert!(cancelled_running > 0, "every answer finished before its cancel; nothing was tested");

        // Queued: a long chat holds the worker; the ask behind it is
        // cancelled and returns without waiting for the chat.
        let h = handle.clone();
        let chat = std::thread::spawn(move || {
            super::generate(&h, GenKind::Chat, "User asks: tell me a long story about timing?")
        });
        std::thread::sleep(std::time::Duration::from_millis(50));
        let h = handle.clone();
        let p = prefix.clone();
        let queued = std::thread::spawn(move || {
            ask(&h, &ask_req(52_100, AskMode::Choice, &p, "where was I?", Some(CHOICE_GBNF)))
        });
        std::thread::sleep(std::time::Duration::from_millis(30));
        let started = std::time::Instant::now();
        cancel_generation(52_100);
        assert_eq!(queued.join().unwrap(), Ok(AskOutcome::Cancelled));
        let waited = started.elapsed();
        eprintln!("[ask] a queued cancel returned after {waited:?}");
        assert!(waited < std::time::Duration::from_millis(500), "{waited:?}");
        assert!(chat.join().unwrap().is_ok());

        // And the next turn is an ordinary one.
        let after = ask(&handle, &ask_req(52_200, AskMode::Choice, &prefix, "where was I?", Some(CHOICE_GBNF)));
        answered(&after);

        // The deadline (finding 2): already past, the turn never starts;
        // 50 ms into a prefix that has to be decoded, it stops between two
        // chunks and says `timedOut`, not `cancelled`.
        let mut late = ask_req(52_300, AskMode::Choice, &prefix, "where was I?", Some(CHOICE_GBNF));
        late.deadline_ms = Some(0);
        assert_eq!(ask(&handle, &late), Ok(AskOutcome::TimedOut));
        let mut short = ask_req(52_301, AskMode::Prose, &format!("(timed) {prefix}"), "tell me everything", None);
        short.deadline_ms = Some(50);
        let started = std::time::Instant::now();
        assert_eq!(ask(&handle, &short), Ok(AskOutcome::TimedOut));
        let waited = started.elapsed();
        eprintln!("[ask] a 50 ms deadline returned after {waited:?}");
        assert!(waited < std::time::Duration::from_millis(1_000), "{waited:?}");
        // The half-decoded prefix was dropped, and the worker answers.
        let next = ask(&handle, &ask_req(52_302, AskMode::Choice, &prefix, "where was I?", Some(CHOICE_GBNF)));
        answered(&next);
        unload_model(&handle).unwrap();
    }
}

// ---------------------------------------------------------------------------
// Rephrase-latency routing (T04b) — runs on every build
// ---------------------------------------------------------------------------

#[cfg(test)]
mod latency_tests {
    use super::{latency, TIP_LLM_BUDGET_MS};

    /// The samples are process-global, so these cases cannot run in
    /// parallel with each other.
    static SERIAL: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn guard() -> std::sync::MutexGuard<'static, ()> {
        let g = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        latency::reset();
        g
    }

    #[test]
    fn no_samples_means_no_opinion() {
        let _g = guard();
        assert_eq!(latency::rephrase_p50_ms(), None);
    }

    #[test]
    fn median_not_mean_so_one_slow_call_does_not_dominate() {
        let _g = guard();
        for ms in [1_000, 1_100, 1_200, 1_300, 30_000] {
            latency::record_rephrase_ms(ms);
        }
        // A mean would be 6.9 s and would wrongly banish tips to
        // templates for the rest of the session on one hiccup.
        assert_eq!(latency::rephrase_p50_ms(), Some(1_200));
    }

    #[test]
    fn only_the_last_five_count_so_the_machine_can_get_faster() {
        let _g = guard();
        // A slow start (e.g. weights still paging in) must age out.
        for ms in [9_000, 9_000, 9_000, 9_000, 9_000] {
            latency::record_rephrase_ms(ms);
        }
        assert_eq!(latency::rephrase_p50_ms(), Some(9_000));
        for ms in [800, 900, 1_000, 1_100, 1_200] {
            latency::record_rephrase_ms(ms);
        }
        assert_eq!(latency::rephrase_p50_ms(), Some(1_000));
    }

    #[test]
    fn the_measured_cpu_number_is_over_budget_and_the_gpu_one_is_not() {
        let _g = guard();
        // Measured on the owner's laptop, Qwen3-4B Q4_K_M (see the T04b
        // PR): 3.83 s with no GPU offload, 0.31 s on the RTX 3080.
        for _ in 0..3 {
            latency::record_rephrase_ms(3_830);
        }
        assert!(latency::rephrase_p50_ms().unwrap() > TIP_LLM_BUDGET_MS);

        latency::reset();
        for _ in 0..3 {
            latency::record_rephrase_ms(310);
        }
        assert!(latency::rephrase_p50_ms().unwrap() <= TIP_LLM_BUDGET_MS);
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
