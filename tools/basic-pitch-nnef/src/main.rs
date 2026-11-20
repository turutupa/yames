//! `nmp.onnx` -> `nmp.nnef.tar`, then the archive is read back the way the
//! app reads it and both are run on the same windows: the largest difference
//! is printed and the tool fails above `TOLERANCE`.
//!
//! What it does to the graph, all of it inside tract: fixes the input to
//! `[1, 43844, 1]` (the file leaves the batch open), keeps only the note and
//! onset outputs (the contour head is never read), types and declutters it.
//! Nothing is retrained or re-quantised; the weights are the file's.
//!
//! The bytes are not identical from run to run (tar mtimes and the order in
//! which tract numbers some intermediate names), the graph is.

use tract_onnx::prelude::*;
use tract_onnx::tract_core::internal::bail;

const WINDOW: usize = 43_844;
const OUT_NOTE: &str = "StatefulPartitionedCall:1";
const OUT_ONSET: &str = "StatefulPartitionedCall:2";
const TOLERANCE: f32 = 1e-4;

fn main() -> TractResult<()> {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../src-tauri/models/basic-pitch");
    let mut args = std::env::args().skip(1);
    let onnx_path = args.next().map(std::path::PathBuf::from).unwrap_or_else(|| root.join("nmp.onnx"));
    let nnef_path = args.next().map(std::path::PathBuf::from).unwrap_or_else(|| root.join("nmp.nnef.tar"));

    let onnx = tract_onnx::onnx()
        .model_for_path(&onnx_path)?
        .with_input_fact(0, f32::fact([1, WINDOW, 1]).into())?
        .with_outputs_by_name([OUT_NOTE, OUT_ONSET])?
        .into_typed()?
        .into_decluttered()?;
    let file = std::fs::File::create(&nnef_path)?;
    tract_nnef::nnef().write_to_tar(&onnx, file)?;
    eprintln!("wrote {} ({} bytes)", nnef_path.display(), std::fs::metadata(&nnef_path)?.len());

    // read back exactly as `src-tauri/src/detect/model.rs` does
    let bytes = std::fs::read(&nnef_path)?;
    let nnef = tract_nnef::nnef().model_for_read(&mut std::io::Cursor::new(bytes))?.into_optimized()?.into_runnable()?;
    let reference = tract_onnx::onnx()
        .model_for_path(&onnx_path)?
        .with_input_fact(0, f32::fact([1, WINDOW, 1]).into())?
        .with_outputs_by_name([OUT_NOTE, OUT_ONSET])?
        .into_optimized()?
        .into_runnable()?;

    // a few windows that make the model answer: harmonic tones, a chord,
    // noise, silence
    let mut worst = 0.0f32;
    let mut seed = 0x2545_f491_u32;
    for case in 0..5 {
        let window: Vec<f32> = (0..WINDOW)
            .map(|i| {
                let t = i as f32 / 22_050.0;
                let tone = |f: f32| (1..=5).map(|h| (std::f32::consts::TAU * f * h as f32 * t).sin() / h as f32).sum::<f32>();
                seed ^= seed << 13;
                seed ^= seed >> 17;
                seed ^= seed << 5;
                let noise = seed as f32 / u32::MAX as f32 - 0.5;
                match case {
                    0 => 0.3 * tone(220.0) * (-2.0 * t).exp(),
                    1 => 0.2 * (tone(196.0) + tone(246.94) + tone(293.66)) * (-1.5 * t).exp(),
                    2 => 0.3 * tone(82.41) * if t > 0.7 { (-3.0 * (t - 0.7)).exp() } else { 0.0 },
                    3 => 0.1 * noise,
                    _ => 0.0,
                }
            })
            .collect();
        let input = || -> TractResult<TValue> { Ok(Tensor::from_shape(&[1, WINDOW, 1], &window)?.into()) };
        let a = nnef.run(tvec!(input()?))?;
        let b = reference.run(tvec!(input()?))?;
        if a.len() != 2 || b.len() != 2 {
            bail!("expected two outputs, got {} and {}", a.len(), b.len());
        }
        for k in 0..2 {
            let (x, y) = (a[k].try_as_plain_ram()?, b[k].try_as_plain_ram()?);
            let (x, y) = (x.as_slice::<f32>()?, y.as_slice::<f32>()?);
            if x.len() != 172 * 88 || y.len() != x.len() {
                bail!("output {k}: {} and {} values, not {}", x.len(), y.len(), 172 * 88);
            }
            worst = x.iter().zip(y).map(|(p, q)| (p - q).abs()).fold(worst, f32::max);
        }
    }
    println!("NNEF vs ONNX (both on tract): max abs diff {worst:e} over 5 windows x 2 outputs");
    if worst > TOLERANCE {
        bail!("the archive does not reproduce the ONNX file (tolerance {TOLERANCE:e})");
    }
    Ok(())
}
