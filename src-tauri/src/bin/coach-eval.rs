//! The tool eval's model half (DESIGN C3b; leg c3b1a): generate only.
//!
//!   coach-eval --gguf <model.gguf> --requests <requests.jsonl> --outcomes <outcomes.jsonl>
//!
//! Reads one `coach::AskRequest` per line (as `scripts/coach-eval.mjs`
//! writes them: the request plus the item's `id`), loads the model the way the
//! app's selector does (`load_model`), runs each request through the same Ask
//! path as the `coach_ask` command (`coach::ask`: its grammar precheck, its
//! deadline, the cached prefix), and writes one outcome per line: the
//! `AskOutcome` as the webview gets it (`status`, `text`, `promptMs`,
//! `totalMs`, `prefixCached`) plus `id`, or `{"status":"error","error":...}`
//! for a request Rust refused. Scoring is the script's.
//!
//! Needs `--features coach-llm` (or a GPU backend); without it the binary
//! says so and exits 2. The CPU build is what the smoke run uses.

use std::process::ExitCode;

#[cfg(not(feature = "coach-llm"))]
fn main() -> ExitCode {
    eprintln!("coach-eval: this build has no LLM; build with --features coach-llm");
    ExitCode::from(2)
}

#[cfg(feature = "coach-llm")]
fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("coach-eval: {e}");
            ExitCode::from(2)
        }
    }
}

#[cfg(feature = "coach-llm")]
fn run() -> Result<(), String> {
    use std::io::{BufRead, Write};
    use std::time::Instant;
    use yames_lib::probe::{ask, create_shared_engine, load_model, AskRequest, CURRENT_BRAIN_FAMILY};

    let mut gguf = None;
    let mut requests = None;
    let mut outcomes = None;
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        match a.as_str() {
            "--gguf" => gguf = args.next(),
            "--requests" => requests = args.next(),
            "--outcomes" => outcomes = args.next(),
            other => return Err(format!("unknown argument {other}")),
        }
    }
    let (Some(gguf), Some(requests), Some(outcomes)) = (gguf, requests, outcomes) else {
        return Err("usage: coach-eval --gguf <file> --requests <jsonl> --outcomes <jsonl>".into());
    };

    let engine = create_shared_engine();
    let started = Instant::now();
    // A bare GGUF has no `model.json` beside it: the family is asserted, as the probe does.
    if !load_model(&engine, std::path::Path::new(&gguf), Some(CURRENT_BRAIN_FAMILY), "eval model")? {
        return Err(format!("the model did not load: {gguf}"));
    }
    eprintln!("[coach-eval] loaded {gguf} in {:.1} s", started.elapsed().as_secs_f64());

    let input = std::fs::File::open(&requests).map_err(|e| format!("{requests}: {e}"))?;
    let mut out = std::io::BufWriter::new(std::fs::File::create(&outcomes).map_err(|e| format!("{outcomes}: {e}"))?);
    let mut n = 0usize;
    for line in std::io::BufReader::new(input).lines() {
        let line = line.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        let value: serde_json::Value = serde_json::from_str(&line).map_err(|e| format!("request {n}: {e}"))?;
        let id = value.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let req: AskRequest = serde_json::from_value(value).map_err(|e| format!("request {id}: {e}"))?;
        let mut outcome = match ask(&engine, &req) {
            Ok(o) => serde_json::to_value(&o).map_err(|e| e.to_string())?,
            Err(e) => serde_json::json!({ "status": "error", "error": e }),
        };
        if let Some(map) = outcome.as_object_mut() {
            map.insert("id".into(), serde_json::Value::String(id.clone()));
        }
        writeln!(out, "{outcome}").map_err(|e| e.to_string())?;
        out.flush().map_err(|e| e.to_string())?;
        n += 1;
        eprintln!("[coach-eval] {n} {id}: {}", outcome.get("status").and_then(|s| s.as_str()).unwrap_or("?"));
    }
    eprintln!("[coach-eval] {n} requests in {:.1} s", started.elapsed().as_secs_f64());
    Ok(())
}
