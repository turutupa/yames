//! Practice Coach — LLM inference engine.
//!
//! When built with the `coach-llm` feature, loads a GGUF model from disk and
//! runs text generation for coaching comments, mini-reports, session summaries,
//! and chat Q&A. Without the feature, generates template-based responses.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

static VARIANT_COUNTER: AtomicU32 = AtomicU32::new(0);

/// Thread-safe handle to the coach engine.
pub type SharedCoachEngine = Arc<Mutex<CoachEngine>>;

pub fn create_shared_engine() -> SharedCoachEngine {
    Arc::new(Mutex::new(CoachEngine::new()))
}

// ---------------------------------------------------------------------------
// Template-based engine (always available)
// ---------------------------------------------------------------------------

pub struct CoachEngine {
    #[cfg(feature = "coach-llm")]
    model: Option<LlmModel>,
    loaded: bool,
}

impl CoachEngine {
    pub fn new() -> Self {
        CoachEngine {
            #[cfg(feature = "coach-llm")]
            model: None,
            loaded: false,
        }
    }

    pub fn is_loaded(&self) -> bool {
        self.loaded
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

/// Load the GGUF model from the brain directory.
pub fn load_model(engine: &mut CoachEngine, model_path: &std::path::Path) -> Result<bool, String> {
    if !model_path.exists() {
        return Ok(false);
    }

    #[cfg(feature = "coach-llm")]
    {
        let llm = LlmModel::load(model_path)?;
        engine.model = Some(llm);
        engine.loaded = true;
        return Ok(true);
    }

    #[cfg(not(feature = "coach-llm"))]
    {
        // Mark as loaded so template-based mode activates
        let _ = model_path;
        engine.loaded = true;
        Ok(true)
    }
}

/// Generate a coaching comment from structured DSP data.
///
/// On the `coach-llm` path `engine.model` is the actual LLM handle.
/// On the default (no-LLM) path the engine carries no state but the
/// parameter is kept symmetric so callers don't have to feature-gate
/// the call site — the underscore prefix silences the unused-var
/// warning in that build.
#[cfg_attr(not(feature = "coach-llm"), allow(unused_variables))]
pub fn generate(engine: &CoachEngine, context: &str) -> Result<String, String> {
    #[cfg(feature = "coach-llm")]
    if let Some(ref model) = engine.model {
        return model.generate(context);
    }

    // Template-based fallback
    generate_template(context)
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
fn generate_template(context: &str) -> Result<String, String> {
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

    let is_summary = context.contains("ended their practice session");
    let is_chat = context.contains("User asks:");
    // The JS side sends greetings as a `"Rephrase this practice-coach
    // greeting..."` prompt with the rendered template embedded under
    // `Original: "..."`. Match on that stable phrase so we recognise
    // greetings regardless of whether the player has a preset, history,
    // or is on the cold path.
    let is_greeting = context.contains("practice-coach greeting");
    // Real-time tips also arrive as a `"Rephrase this practice-coach
    // observation..."` prompt with the gatekeeper-filled template
    // under `Original: "..."`. Without this branch the rephrase falls
    // through to `format_mini_report` — and since the rephrase prompt
    // carries neither `Score:` nor `Accuracy:` fields, both extracts
    // return 0 and the coach-tip lands as a hard-coded "Score 0 —
    // right in the pocket. Ease the tempo down…" no matter what the
    // gatekeeper actually said. We treat the template-fallback path
    // for rephrases the same way as greetings: return the Original
    // verbatim (the JS template is fully shippable without LLM help).
    let is_rephrase_observation = context.contains("Rephrase this practice-coach observation");

    if is_chat {
        // Extract the question
        let question = context
            .lines()
            .find(|l| l.starts_with("User asks:"))
            .map(|l| l.trim_start_matches("User asks:").trim())
            .unwrap_or("");

        return Ok(format_chat_response(question, accuracy, deviation));
    }

    if is_greeting {
        return Ok(format_greeting(context));
    }

    if is_rephrase_observation {
        return Ok(format_rephrase_observation(context));
    }

    if is_summary {
        return Ok(format_session_summary(accuracy, deviation, streak));
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
    use llama_cpp_2::context::params::LlamaContextParams;
    use llama_cpp_2::llama_backend::LlamaBackend;
    use llama_cpp_2::llama_batch::LlamaBatch;
    use llama_cpp_2::model::params::LlamaModelParams;
    use llama_cpp_2::model::LlamaModel;
    use llama_cpp_2::sampling::LlamaSampler;

    const MAX_TOKENS: usize = 256;
    const CONTEXT_SIZE: u32 = 2048;

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

    /// True when this build has a GPU backend linked in.
    const HAS_GPU_BACKEND: bool =
        cfg!(feature = "coach-llm-metal") || cfg!(feature = "coach-llm-vulkan");

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
        match std::env::var("YAMES_LLM_GPU_LAYERS") {
            Ok(raw) => raw.trim().parse::<u32>().unwrap_or_else(|_| {
                eprintln!("[coach] YAMES_LLM_GPU_LAYERS={raw:?} is not a number — ignoring");
                if HAS_GPU_BACKEND {
                    ALL_GPU_LAYERS
                } else {
                    0
                }
            }),
            // No GPU backend linked in means there is nothing to offload to;
            // asking for layers would only produce a confusing warning.
            Err(_) if !HAS_GPU_BACKEND => 0,
            Err(_) => ALL_GPU_LAYERS,
        }
    }

    /// Inference thread count (ROADMAP §3: `max(1, physical_cores - 2)`).
    ///
    /// `available_parallelism` reports *logical* CPUs and there is no portable
    /// physical-core source in std, so halve it as an SMT proxy — the rule's
    /// intent is to leave headroom for the audio callback and the UI, and
    /// over-reserving is the safe direction to err in.
    fn inference_threads() -> i32 {
        let logical = std::thread::available_parallelism()
            .map(std::num::NonZeroUsize::get)
            .unwrap_or(4);
        let physical = (logical / 2).max(1);
        physical.saturating_sub(2).max(1).min(i32::MAX as usize) as i32
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

    pub struct LlmModel {
        backend: LlamaBackend,
        model: LlamaModel,
        n_threads: i32,
    }

    impl LlmModel {
        pub fn load(path: &std::path::Path) -> Result<Self, String> {
            let backend =
                LlamaBackend::init().map_err(|e| format!("Failed to init llama backend: {e}"))?;

            let requested = requested_gpu_layers();
            let n_threads = inference_threads();
            eprintln!(
                "[coach] loading model (backend={BACKEND}, n_gpu_layers={requested}, n_threads={n_threads})"
            );

            // GPU first, always. A Vulkan/Metal build on a machine with no
            // usable device normally still loads — llama.cpp reports zero
            // offloadable devices and keeps every layer on the CPU — but a
            // broken driver can fail the load outright, so retry on the CPU
            // rather than leaving the user with a dead brain.
            let model = match load_model_file(&backend, path, requested) {
                Ok(model) => model,
                Err(gpu_err) if requested != 0 => {
                    eprintln!(
                        "[coach] GPU load failed ({gpu_err}) — retrying with n_gpu_layers = 0"
                    );
                    load_model_file(&backend, path, 0)?
                }
                Err(e) => return Err(e),
            };

            Ok(LlmModel {
                backend,
                model,
                n_threads,
            })
        }

        pub fn generate(&self, context: &str) -> Result<String, String> {
            self.generate_with_limit(context, MAX_TOKENS)
        }

        pub fn generate_with_limit(
            &self,
            context: &str,
            max_tokens: usize,
        ) -> Result<String, String> {
            let prompt = format!(
                "<|system|>\n{}<|end|>\n<|user|>\n{context}<|end|>\n<|assistant|>\n",
                super::SYSTEM_PROMPT,
            );

            let ctx_params = LlamaContextParams::default()
                .with_n_ctx(std::num::NonZero::new(CONTEXT_SIZE))
                .with_n_threads(self.n_threads)
                .with_n_threads_batch(self.n_threads);
            let mut ctx = self
                .model
                .new_context(&self.backend, ctx_params)
                .map_err(|e| format!("Context creation failed: {e}"))?;

            let tokens = self
                .model
                .str_to_token(&prompt, llama_cpp_2::model::AddBos::Always)
                .map_err(|e| format!("Tokenization failed: {e}"))?;

            if tokens.len() >= CONTEXT_SIZE as usize {
                return Err("Prompt too long for context window".into());
            }

            let mut batch = LlamaBatch::new(CONTEXT_SIZE as usize, 1);
            for (i, &token) in tokens.iter().enumerate() {
                let is_last = i == tokens.len() - 1;
                batch
                    .add(token, i as i32, &[0], is_last)
                    .map_err(|e| format!("Batch add failed: {e}"))?;
            }

            ctx.decode(&mut batch)
                .map_err(|e| format!("Decode failed: {e}"))?;

            let mut output_tokens = Vec::new();
            let mut sampler = LlamaSampler::chain_simple([
                LlamaSampler::temp(0.7),
                LlamaSampler::top_p(0.9, 1),
                LlamaSampler::dist(42),
            ]);

            for _ in 0..max_tokens {
                let logits_id = batch.n_tokens() - 1;
                let token = sampler.sample(&ctx, logits_id);

                if self.model.is_eog_token(token) {
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

                ctx.decode(&mut batch)
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
                let piece = self
                    .model
                    .token_to_piece(*token, &mut decoder, false, None)
                    .map_err(|e| format!("Token decode failed: {e}"))?;
                result.push_str(&piece);
            }

            Ok(result.trim().to_string())
        }
    }
}

#[cfg(feature = "coach-llm")]
use llm::LlmModel;

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
    use super::llm::LlmModel;

    #[test]
    fn loads_gguf_and_generates_tokens() {
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

        let model = LlmModel::load(&path).expect("model load failed");

        let started = std::time::Instant::now();
        let out = model
            .generate_with_limit("Accuracy: 82\nSignedDev: -4.1\nSay hello.", max_tokens)
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
    }
}
