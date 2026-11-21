"""Profiles training steps (LoRA, no padding) and prints the top CUDA kernels by time,
to see where a step's seconds go. usage: profile_step.py <model dir> [batch] [len] [--ckpt]"""
import sys
import time

import torch
from peft import LoraConfig, get_peft_model
from torch.profiler import ProfilerActivity, profile
from transformers import AutoModelForCausalLM

path = sys.argv[1]
bs = int(sys.argv[2]) if len(sys.argv) > 2 else 8
T = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
model = AutoModelForCausalLM.from_pretrained(path, dtype=torch.bfloat16, attn_implementation="sdpa").cuda()
model.config.use_cache = False
if "--ckpt" in sys.argv:
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    model.enable_input_require_grads()
drop = 0.0 if "--no-dropout" in sys.argv else 0.05
model = get_peft_model(model, LoraConfig(r=16, lora_alpha=32, lora_dropout=drop, task_type="CAUSAL_LM",
                                         target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]))
if "--no-cast" in sys.argv:
    for m in model.modules():
        if hasattr(m, "cast_input_dtype_enabled") or hasattr(m, "lora_A"):
            m.cast_input_dtype_enabled = False
print("attn impl", model.get_base_model().config._attn_implementation, "dropout", drop, "no-cast", "--no-cast" in sys.argv)
if "--compile" in sys.argv:
    for layer in model.get_base_model().model.layers:
        layer.compile()
    print("decoder layers compiled")
ids = torch.randint(0, 150000, (bs, T), device="cuda")


def step():
    with torch.autocast("cuda", dtype=torch.bfloat16):
        h = model.get_base_model().model(input_ids=ids).last_hidden_state
        loss = model.get_base_model().lm_head(h[:, -32:]).float().logsumexp(-1).mean()
    loss.backward()


t = time.time()
for _ in range(2):
    step()
torch.cuda.synchronize()
print(f"warm-up (2 steps, incl. any compile) {time.time() - t:.1f} s")
torch.cuda.synchronize()
torch.cuda.reset_peak_memory_stats()
t = time.time()
for _ in range(3):
    step()
torch.cuda.synchronize()
print(f"{(time.time() - t) / 3:.3f} s/step fwd+bwd, batch {bs} x {T}, peak {torch.cuda.max_memory_allocated() / 2**30:.2f} GiB")
with profile(activities=[ProfilerActivity.CUDA]) as prof:
    step()
    torch.cuda.synchronize()
print(prof.key_averages().table(sort_by="cuda_time_total", row_limit=15, max_name_column_width=70))
