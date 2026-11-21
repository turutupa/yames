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
    p.add_argument("--lora-dropout", type=float, default=0.0,
                   help="0 = no dropout kernel at all (measurably faster on the GB10)")
    p.add_argument("--lora-cast-input", action="store_true",
                   help="let peft cast each LoRA input to the adapter's fp32 (its default; slow here: a "
                        "full copy of every activation per adapted layer). Off: autocast runs it in bf16")
    p.add_argument("--target-modules", default="q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj")
    p.add_argument("--lr", type=float, default=None, help="default 2e-4 LoRA, 1e-5 full")
    p.add_argument("--weight-decay", type=float, default=0.0)
    p.add_argument("--warmup-steps", type=int, default=None, help="default 3%% of the steps")
    p.add_argument("--steps", type=int, default=None, help="optimizer steps; default = epochs over the data")
    p.add_argument("--epochs", type=float, default=1.0)
    p.add_argument("--batch-size", type=int, default=8, help="sequences per micro-batch")
    p.add_argument("--grad-accum", type=int, default=1)
    p.add_argument("--max-len", type=int, default=1024,
                   help="tokens; a longer row is DROPPED and counted (never trained half), unless --cut-prompts")
    p.add_argument("--cut-prompts", action="store_true",
                   help="the old behaviour (timing runs): cut a long prompt from the left instead of dropping the row")
    p.add_argument("--mask-padding", action="store_true",
                   help="pass an attention mask when a batch is padded. Off by default: padding is on the right, so "
                        "under causal attention no real token can see a pad and the mask changes nothing but the "
                        "kernel (with one, SDPA leaves its fast causal path: 8.3 s a step, c3denv)")
    p.add_argument("--resume", action="store_true",
                   help="continue from <out>/ckpt-latest.json (written every --save-every steps): weights being "
                        "trained, optimizer, schedule, the batch order and the logged history")
    p.add_argument("--epoch-snapshots", action="store_true",
                   help="at the end of every epoch but the last: the validation loss, and the model as it is then "
                        "in <out>/epoch-<k> (an adapter, or bf16 weights + tokenizer)")
    p.add_argument("--seed", type=int, default=1234)
    p.add_argument("--grad-checkpointing", action="store_true")
    p.add_argument("--master-fp32", action=argparse.BooleanOptionalAction, default=True,
                   help="full fine-tune: fp32 weights + bf16 autocast (default); --no-master-fp32 = pure bf16")
    p.add_argument("--fixed-len", action="store_true",
                   help="pad every batch to --max-len (needs a mask: slow; for timing prefer rows longer "
                        "than --max-len, which are cut to exactly --max-len and need no padding)")
    p.add_argument("--no-group-by-length", action="store_true", help="plain shuffled batches")
    p.add_argument("--no-eos", action="store_true")
    p.add_argument("--log-every", type=int, default=10)
    p.add_argument("--no-save", action="store_true", help="timing runs: train, report, save nothing")
    p.add_argument("--save-every", type=int, default=0,
                   help="every n steps, a resumable checkpoint in <out>/ckpt-a or ckpt-b (alternating, so a "
                        "stop during a save leaves the other one whole) and <out>/ckpt-latest.json; see --resume")
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


def encode(rows, tok, max_len, add_eos, cut_prompts=False):
    out, cut, dropped = [], 0, 0
    eos = [tok.eos_token_id] if add_eos and tok.eos_token_id is not None else []
    for r in rows:
        p = tok(r["prompt"], add_special_tokens=False)["input_ids"]
        c = tok(r["completion"], add_special_tokens=False)["input_ids"] + eos
        if len(c) >= max_len or (len(p) + len(c) > max_len and not cut_prompts):
            dropped += 1
            continue
        if len(p) + len(c) > max_len:
            p = p[len(p) + len(c) - max_len:]
            cut += 1
        out.append((p + c, [-100] * len(p) + c))
    return out, cut, dropped


def batches(data, bs, rng, group_by_length):
    """Endless shuffled batches. With group_by_length, rows of similar length share a
    batch (sorted within windows of 64 batches, then the batches shuffled), so little
    is padded: a padded batch needs an attention mask, and with a mask SDPA leaves its
    fast causal kernel (measured: 0.6B, 8 x 1024 padded, 8.4 s a step)."""
    while True:
        idx = list(range(len(data)))
        rng.shuffle(idx)
        if group_by_length:
            win = bs * 64
            idx = [j for w in range(0, len(idx), win) for j in sorted(idx[w:w + win], key=lambda k: len(data[k][0]))]
        chunks = [idx[i:i + bs] for i in range(0, len(idx) - bs + 1, bs)]
        rng.shuffle(chunks)
        for c in chunks:
            yield [data[j] for j in c]


def collate(items, pad_id, fixed_len, device, mask_padding=False):
    n = fixed_len or max(len(x) for x, _ in items)
    ids = torch.full((len(items), n), pad_id, dtype=torch.long)
    lab = torch.full((len(items), n), -100, dtype=torch.long)
    att = torch.zeros((len(items), n), dtype=torch.long)
    for i, (x, y) in enumerate(items):
        ids[i, : len(x)] = torch.tensor(x)
        lab[i, : len(y)] = torch.tensor(y)
        att[i, : len(x)] = 1
    # No padding in the batch: no mask, so attention runs as plain causal (fast path).
    # Padding is on the right and every pad's label is -100: under causal attention a real
    # token never sees a pad, so the mask is needed only when asked for (--mask-padding).
    mask = None if (bool(att.all()) or not mask_padding) else att.to(device)
    return ids.to(device), lab.to(device), mask, int(att.sum())


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
def eval_loss(model, data, bs, pad_id, device, mask_padding=False):
    model.eval()
    tot, n = 0.0, 0
    for i in range(0, len(data), bs):
        ids, lab, att, _ = collate(data[i:i + bs], pad_id, None, device, mask_padding)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            loss = completion_loss(model, ids, att, lab)
        k = int((lab[:, 1:] != -100).sum())
        tot += float(loss) * k
        n += k
    model.train()
    return tot / max(n, 1)


def trained_state(model):
    """The weights being trained, by name (a LoRA's adapters, or every weight of a full run)."""
    return {n: p.detach() for n, p in model.named_parameters() if p.requires_grad}


def save_checkpoint(out, step, model, opt, sched, extra):
    """A resumable checkpoint in the slot the last one did not use, then the pointer to it,
    replaced atomically: a job stopped mid-save still has the previous checkpoint whole."""
    latest = os.path.join(out, "ckpt-latest.json")
    prev = None
    if os.path.exists(latest):
        with open(latest, encoding="utf-8") as f:
            prev = json.load(f).get("slot")
    slot = "ckpt-b" if prev == "ckpt-a" else "ckpt-a"
    d = os.path.join(out, slot)
    os.makedirs(d, exist_ok=True)
    torch.save(trained_state(model), os.path.join(d, "trained.pt"))
    torch.save({"opt": opt.state_dict(), "sched": sched.state_dict(),
                "torch_rng": torch.get_rng_state(), "cuda_rng": torch.cuda.get_rng_state_all()},
               os.path.join(d, "optim.pt"))
    with open(os.path.join(d, "extra.json"), "w", encoding="utf-8") as f:
        json.dump({**extra, "step": step}, f)
    tmp = latest + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"slot": slot, "step": step}, f)
    os.replace(tmp, latest)
    print(f"checkpoint {d} at step {step}", flush=True)


def load_checkpoint(out, model, opt, sched):
    latest = os.path.join(out, "ckpt-latest.json")
    if not os.path.exists(latest):
        return None
    with open(latest, encoding="utf-8") as f:
        slot = json.load(f)["slot"]
    d = os.path.join(out, slot)
    state = torch.load(os.path.join(d, "trained.pt"), map_location="cpu")
    params = dict(model.named_parameters())
    for n, v in state.items():
        params[n].data.copy_(v.to(params[n].device, params[n].dtype))
    o = torch.load(os.path.join(d, "optim.pt"), map_location="cpu", weights_only=False)
    opt.load_state_dict(o["opt"])
    sched.load_state_dict(o["sched"])
    torch.set_rng_state(o["torch_rng"])
    torch.cuda.set_rng_state_all(o["cuda_rng"])
    with open(os.path.join(d, "extra.json"), encoding="utf-8") as f:
        extra = json.load(f)
    print(f"resumed from {d} at step {extra['step']}", flush=True)
    return extra


def save_model(model, tok, a, path):
    """The model as it is now: an adapter, or the full model in bf16 (without touching the
    fp32 master copy being trained) with its tokenizer and generation config."""
    os.makedirs(path, exist_ok=True)
    if a.full_finetune:
        # Tied weights (the 0.6B's embeddings and LM head) stay one tensor, as save_pretrained expects.
        cast, sd = {}, {}
        for k, v in model.state_dict().items():
            key = (v.data_ptr(), tuple(v.shape))
            if key not in cast:
                cast[key] = v.detach().to(torch.bfloat16)
            sd[k] = cast[key]
        model.config.use_cache = True
        model.save_pretrained(path, state_dict=sd, safe_serialization=True)
        model.config.use_cache = False
        tok.save_pretrained(path)
        gen = os.path.join(a.model, "generation_config.json")
        if os.path.exists(gen):
            with open(gen, encoding="utf-8") as f, open(os.path.join(path, "generation_config.json"), "w", encoding="utf-8") as g:
                g.write(f.read())
    else:
        model.save_pretrained(path, safe_serialization=True)


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
    data, cut, dropped = encode(rows, tok, a.max_len, not a.no_eos, a.cut_prompts)
    lens = sorted(len(x) for x, _ in data)
    print(f"data {len(rows)} rows, {len(data)} used, {cut} prompts cut from the left, {dropped} dropped "
          f"(longer than max-len {a.max_len}); tokens/row median {lens[len(lens) // 2]} max {lens[-1]}", flush=True)
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
        if not a.lora_cast_input:
            for m in model.modules():
                if hasattr(m, "lora_A"):
                    m.cast_input_dtype_enabled = False
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

    load_start = os.getloadavg()[0]
    print(f"load average at start {load_start:.1f} (the GB10's memory is shared with the CPU: a busy box "
          f"slows every memory-bound kernel)", flush=True)
    rng = random.Random(a.seed)
    it = batches(data, a.batch_size, rng, not a.no_group_by_length)
    ev_data = None
    if a.eval_data:
        ev_data, _, ev_dropped = encode(load_jsonl(a.eval_data), tok, a.max_len, not a.no_eos, a.cut_prompts)
        print(f"eval data {len(ev_data)} rows used, {ev_dropped} dropped (longer than max-len)", flush=True)
    # Epoch k (k < epochs) ends at this step; the last epoch ends at `steps`.
    per_epoch = len(data) / per_step
    epoch_ends = {max(1, math.ceil(k * per_epoch)): k for k in range(1, math.ceil(a.epochs)) if math.ceil(k * per_epoch) < steps}
    history, epoch_evals, start, resumed_from = [], [], 1, None
    if a.resume:
        extra = load_checkpoint(a.out, model, opt, sched)
        if extra:
            history, epoch_evals = extra.get("history", []), extra.get("epoch_evals", [])
            start, resumed_from = extra["step"] + 1, extra["step"]
            for _ in range(extra["step"] * a.grad_accum):  # the same batch order as an unbroken run
                next(it)
    torch.cuda.reset_peak_memory_stats()
    t0 = time.time()
    t_win, tok_win, loss_win = time.time(), 0, []
    t_first = None
    for step in range(start, steps + 1):
        for _ in range(a.grad_accum):
            ids, lab, att, real = collate(next(it), pad_id, a.max_len if a.fixed_len else None, dev, a.mask_padding)
            with torch.autocast("cuda", dtype=torch.bfloat16):
                loss = completion_loss(model, ids, att, lab) / a.grad_accum
            loss.backward()
            loss_win.append(float(loss.detach()) * a.grad_accum)
            tok_win += real
        torch.nn.utils.clip_grad_norm_(trainable, 1.0)
        opt.step()
        sched.step()
        opt.zero_grad(set_to_none=True)
        if step == start:
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
        p0 = time.time()
        if step in epoch_ends and not any(e["step"] == step for e in epoch_evals):
            k = epoch_ends[step]
            rec = {"epoch": k, "step": step, "train_loss_window": history[-1]["loss"] if history else None}
            if ev_data:
                rec["eval_loss"] = eval_loss(model, ev_data, a.batch_size, pad_id, dev, a.mask_padding)
            if a.epoch_snapshots and not a.no_save:
                save_model(model, tok, a, os.path.join(a.out, f"epoch-{k}"))
                rec["snapshot"] = os.path.join(a.out, f"epoch-{k}")
            epoch_evals.append(rec)
            print("epoch_end " + json.dumps(rec), flush=True)
        if a.save_every and not a.no_save and step % a.save_every == 0 and step < steps:
            os.makedirs(a.out, exist_ok=True)
            save_checkpoint(a.out, step, model, opt, sched, {"history": history, "epoch_evals": epoch_evals})
        paused = time.time() - p0
        t_win += paused  # an eval or a save is not training time
        t0 += paused
    torch.cuda.synchronize()
    total = time.time() - t0
    steady = (total - t_first) / max(1, steps - start)
    metrics = {
        "mode": "full" if a.full_finetune else "lora", "model": a.model, "rows": len(data), "steps": steps,
        "batch_size": a.batch_size, "grad_accum": a.grad_accum, "max_len": a.max_len, "fixed_len": a.fixed_len,
        "grad_checkpointing": a.grad_checkpointing, "lr": lr, "lora_r": a.lora_r, "lora_alpha": a.lora_alpha,
        "lora_dropout": a.lora_dropout, "lora_cast_input": a.lora_cast_input,
        "trainable_params": n_train, "seconds_total": total, "seconds_first_step": t_first,
        "seconds_per_step_steady": steady,
        "peak_alloc_gib": torch.cuda.max_memory_allocated() / 2**30,
        "peak_reserved_gib": torch.cuda.max_memory_reserved() / 2**30,
        "final_loss": history[-1]["loss"] if history else None, "history": history,
        "torch": torch.__version__, "device": torch.cuda.get_device_name(0),
        "load_avg_start": load_start, "load_avg_end": os.getloadavg()[0],
        "rows_in": len(rows), "rows_dropped_too_long": dropped, "prompts_cut": cut,
        "tokens_per_row_median": lens[len(lens) // 2], "tokens_per_row_max": lens[-1],
        "epochs": a.epochs, "mask_padding": a.mask_padding, "resumed_from_step": resumed_from,
        "epoch_evals": epoch_evals,
        "note": "a resumed run's timing and peak memory cover only the part after the resume",
    }
    if ev_data:
        metrics["eval_loss"] = eval_loss(model, ev_data, a.batch_size, pad_id, dev, a.mask_padding)
        epoch_evals.append({"epoch": math.ceil(a.epochs) if not a.steps else None, "step": steps,
                            "eval_loss": metrics["eval_loss"], "snapshot": a.out})
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
