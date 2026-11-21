"""Fine-tune a Qwen3 base on {"prompt", "completion"} JSONL: a LoRA (default) or all weights.

Plain PyTorch + transformers + peft (no trl). The loss is taken on the completion
tokens only (the prompt's labels are -100). The prompt is used as given: it must
already be in the chat format the app sends (c3d1 writes it so), e.g. the output
of `apply_chat_template(..., add_generation_prompt=True, enable_thinking=False)`.
The tokenizer's EOS (Qwen3: <|im_end|>) is appended to every completion unless
--no-eos, so the model learns to stop.

Logs loss, steps/s, tokens/s and peak GPU memory; writes metrics.json beside the
output. A LoRA saves adapter_model.safetensors + adapter_config.json (input to
llama.cpp's convert_lora_to_gguf.py); --full-finetune saves the whole model in
bf16 with its tokenizer (input to convert_hf_to_gguf.py).
"""
import argparse
import json
import math
import os
import random
import sys
import time

import torch


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model", required=True, help="HF safetensors directory of the base")
    p.add_argument("--data", required=True, help="training JSONL of {prompt, completion}")
    p.add_argument("--eval-data", help="optional JSONL; its completion loss is logged at the end")
    p.add_argument("--out", required=True, help="output directory (adapter or full model)")
    p.add_argument("--full-finetune", action="store_true", help="train all weights instead of a LoRA")
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=float, default=32)
    p.add_argument("--lora-dropout", type=float, default=0.05)
    p.add_argument("--target-modules", default="q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj")
    p.add_argument("--lr", type=float, default=None, help="default 2e-4 LoRA, 1e-5 full")
    p.add_argument("--weight-decay", type=float, default=0.0)
    p.add_argument("--warmup-steps", type=int, default=None, help="default 3%% of the steps")
    p.add_argument("--steps", type=int, default=None, help="optimizer steps; default = epochs over the data")
    p.add_argument("--epochs", type=float, default=1.0)
    p.add_argument("--batch-size", type=int, default=8, help="sequences per micro-batch")
    p.add_argument("--grad-accum", type=int, default=1)
    p.add_argument("--max-len", type=int, default=1024, help="tokens; longer prompts are cut from the left")
    p.add_argument("--seed", type=int, default=1234)
    p.add_argument("--grad-checkpointing", action="store_true")
    p.add_argument("--master-fp32", action=argparse.BooleanOptionalAction, default=True,
                   help="full fine-tune: fp32 weights + bf16 autocast (default); --no-master-fp32 = pure bf16")
    p.add_argument("--fixed-len", action="store_true",
                   help="pad every batch to --max-len (timing runs: a stated, constant shape)")
    p.add_argument("--no-eos", action="store_true")
    p.add_argument("--log-every", type=int, default=10)
    p.add_argument("--no-save", action="store_true", help="timing runs: train, report, save nothing")
    return p.parse_args()


def load_jsonl(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for i, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            if not isinstance(r.get("prompt"), str) or not isinstance(r.get("completion"), str):
                raise SystemExit(f"{path}:{i + 1}: needs string 'prompt' and 'completion'")
            rows.append(r)
    return rows


def encode(rows, tok, max_len, add_eos):
    out, cut, dropped = [], 0, 0
    eos = [tok.eos_token_id] if add_eos and tok.eos_token_id is not None else []
    for r in rows:
        p = tok(r["prompt"], add_special_tokens=False)["input_ids"]
        c = tok(r["completion"], add_special_tokens=False)["input_ids"] + eos
        if len(c) >= max_len:
            dropped += 1
            continue
        if len(p) + len(c) > max_len:
            p = p[len(p) + len(c) - max_len:]
            cut += 1
        out.append((p + c, [-100] * len(p) + c))
    return out, cut, dropped


def batches(data, bs, rng):
    while True:
        idx = list(range(len(data)))
        rng.shuffle(idx)
        for i in range(0, len(idx) - bs + 1, bs):
            yield [data[j] for j in idx[i:i + bs]]


def collate(items, pad_id, fixed_len, device):
    n = fixed_len or max(len(x) for x, _ in items)
    ids = torch.full((len(items), n), pad_id, dtype=torch.long)
    lab = torch.full((len(items), n), -100, dtype=torch.long)
    att = torch.zeros((len(items), n), dtype=torch.long)
    for i, (x, y) in enumerate(items):
        ids[i, : len(x)] = torch.tensor(x)
        lab[i, : len(y)] = torch.tensor(y)
        att[i, : len(x)] = 1
    return ids.to(device), lab.to(device), att.to(device)


def completion_loss(model, ids, att, lab):
    """Cross-entropy on the completion tokens only, with the LM head applied to those
    positions alone. Qwen3's vocabulary is 151,936: the full logits of a batch of 8 x 1024
    are 5 GB in fp32, while the completions are a few dozen tokens a row."""
    hf = model.get_base_model() if hasattr(model, "get_base_model") else model
    h = hf.model(input_ids=ids, attention_mask=att).last_hidden_state
    mask = lab[:, 1:] != -100
    logits = hf.lm_head(h[:, :-1][mask]).float()
    return torch.nn.functional.cross_entropy(logits, lab[:, 1:][mask])


@torch.no_grad()
def eval_loss(model, data, bs, pad_id, device):
    model.eval()
    tot, n = 0.0, 0
    for i in range(0, len(data), bs):
        ids, lab, att = collate(data[i:i + bs], pad_id, None, device)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            loss = completion_loss(model, ids, att, lab)
        k = int((lab[:, 1:] != -100).sum())
        tot += float(loss) * k
        n += k
    model.train()
    return tot / max(n, 1)


def main():
    a = parse_args()
    from transformers import AutoModelForCausalLM, AutoTokenizer

    random.seed(a.seed)
    torch.manual_seed(a.seed)
    torch.cuda.manual_seed_all(a.seed)
    if not torch.cuda.is_available():
        raise SystemExit("no CUDA device")
    dev = torch.device("cuda")
    lr = a.lr if a.lr is not None else (1e-5 if a.full_finetune else 2e-4)

    tok = AutoTokenizer.from_pretrained(a.model)
    pad_id = tok.pad_token_id if tok.pad_token_id is not None else tok.eos_token_id
    rows = load_jsonl(a.data)
    data, cut, dropped = encode(rows, tok, a.max_len, not a.no_eos)
    lens = sorted(len(x) for x, _ in data)
    print(f"data {len(rows)} rows, {len(data)} used, {cut} prompts cut from the left, {dropped} dropped "
          f"(completion >= max-len); tokens/row median {lens[len(lens) // 2]} max {lens[-1]}", flush=True)
    if len(data) < a.batch_size:
        raise SystemExit("fewer rows than one batch")

    load_dtype = torch.float32 if (a.full_finetune and a.master_fp32) else torch.bfloat16
    model = AutoModelForCausalLM.from_pretrained(a.model, dtype=load_dtype, attn_implementation="sdpa")
    model.config.use_cache = False
    if a.grad_checkpointing:
        model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    if a.full_finetune:
        trainable = [p for p in model.parameters()]
    else:
        from peft import LoraConfig, get_peft_model
        cfg = LoraConfig(r=a.lora_r, lora_alpha=a.lora_alpha, lora_dropout=a.lora_dropout, bias="none",
                         target_modules=[m.strip() for m in a.target_modules.split(",") if m.strip()],
                         task_type="CAUSAL_LM")
        if a.grad_checkpointing:
            model.enable_input_require_grads()
        model = get_peft_model(model, cfg)
        model.print_trainable_parameters()
        trainable = [p for p in model.parameters() if p.requires_grad]
    model.to(dev)
    model.train()
    n_train = sum(p.numel() for p in trainable)

    per_step = a.batch_size * a.grad_accum
    steps = a.steps or max(1, math.ceil(a.epochs * len(data) / per_step))
    warm = a.warmup_steps if a.warmup_steps is not None else max(1, int(0.03 * steps))
    opt = torch.optim.AdamW(trainable, lr=lr, weight_decay=a.weight_decay, betas=(0.9, 0.999), eps=1e-8)
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda s: (s + 1) / warm if s < warm else 0.5 * (1 + math.cos(math.pi * (s - warm) / max(1, steps - warm))))
    print(f"mode {'full' if a.full_finetune else 'lora'} trainable {n_train / 1e6:.2f}M lr {lr} steps {steps} "
          f"warmup {warm} batch {a.batch_size}x{a.grad_accum} max_len {a.max_len} fixed_len {a.fixed_len} "
          f"grad_ckpt {a.grad_checkpointing} load_dtype {load_dtype} seed {a.seed}", flush=True)

    rng = random.Random(a.seed)
    it = batches(data, a.batch_size, rng)
    torch.cuda.reset_peak_memory_stats()
    t0 = time.time()
    t_win, tok_win, loss_win = time.time(), 0, []
    history = []
    t_first = None
    for step in range(1, steps + 1):
        for _ in range(a.grad_accum):
            ids, lab, att = collate(next(it), pad_id, a.max_len if a.fixed_len else None, dev)
            with torch.autocast("cuda", dtype=torch.bfloat16):
                loss = completion_loss(model, ids, att, lab) / a.grad_accum
            loss.backward()
            loss_win.append(float(loss.detach()) * a.grad_accum)
            tok_win += int(att.sum())
        torch.nn.utils.clip_grad_norm_(trainable, 1.0)
        opt.step()
        sched.step()
        opt.zero_grad(set_to_none=True)
        if step == 1:
            torch.cuda.synchronize()
            t_first = time.time() - t0
        if step % a.log_every == 0 or step == steps:
            torch.cuda.synchronize()
            dt = time.time() - t_win
            n = len(loss_win) // a.grad_accum
            rec = {"step": step, "loss": sum(loss_win) / len(loss_win), "lr": sched.get_last_lr()[0],
                   "steps_per_s": n / dt, "tokens_per_s": tok_win / dt,
                   "peak_alloc_gib": torch.cuda.max_memory_allocated() / 2**30,
                   "peak_reserved_gib": torch.cuda.max_memory_reserved() / 2**30}
            history.append(rec)
            print(json.dumps({k: round(v, 5) if isinstance(v, float) else v for k, v in rec.items()}), flush=True)
            t_win, tok_win, loss_win = time.time(), 0, []
    torch.cuda.synchronize()
    total = time.time() - t0
    steady = (total - t_first) / max(1, steps - 1)
    metrics = {
        "mode": "full" if a.full_finetune else "lora", "model": a.model, "rows": len(data), "steps": steps,
        "batch_size": a.batch_size, "grad_accum": a.grad_accum, "max_len": a.max_len, "fixed_len": a.fixed_len,
        "grad_checkpointing": a.grad_checkpointing, "lr": lr, "lora_r": a.lora_r, "lora_alpha": a.lora_alpha,
        "trainable_params": n_train, "seconds_total": total, "seconds_first_step": t_first,
        "seconds_per_step_steady": steady,
        "peak_alloc_gib": torch.cuda.max_memory_allocated() / 2**30,
        "peak_reserved_gib": torch.cuda.max_memory_reserved() / 2**30,
        "final_loss": history[-1]["loss"] if history else None, "history": history,
        "torch": torch.__version__, "device": torch.cuda.get_device_name(0),
    }
    if a.eval_data:
        ev, _, _ = encode(load_jsonl(a.eval_data), tok, a.max_len, not a.no_eos)
        metrics["eval_loss"] = eval_loss(model, ev, a.batch_size, pad_id, dev)
        print(f"eval_loss {metrics['eval_loss']:.4f}", flush=True)
    print(f"done: {steps} steps in {total:.1f}s, steady {steady:.3f} s/step, first step {t_first:.1f}s, "
          f"peak alloc {metrics['peak_alloc_gib']:.2f} GiB, reserved {metrics['peak_reserved_gib']:.2f} GiB", flush=True)

    os.makedirs(a.out, exist_ok=True)
    if not a.no_save:
        if a.full_finetune:
            model.to(torch.bfloat16)
            model.config.use_cache = True
            model.save_pretrained(a.out, safe_serialization=True)
            tok.save_pretrained(a.out)
            gen = os.path.join(a.model, "generation_config.json")
            if os.path.exists(gen):
                with open(gen, encoding="utf-8") as f, open(os.path.join(a.out, "generation_config.json"), "w", encoding="utf-8") as g:
                    g.write(f.read())
        else:
            model.save_pretrained(a.out, safe_serialization=True)
    with open(os.path.join(a.out, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
