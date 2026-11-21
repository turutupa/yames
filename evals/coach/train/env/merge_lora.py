"""A train_lora.py adapter folded into its base: peft merge_and_unload -> bf16 safetensors + tokenizer.

    python -I merge_lora.py --base <HF base dir> --adapter <adapter dir> --out <merged dir>

The eval binary loads one GGUF, so a LoRA candidate is measured as this merged model converted
(convert.sh full). Shipping the adapter beside the stock GGUF is a different artifact: its
equivalence with the merged model is c3d3's to measure.
"""
import argparse
import os
import shutil

import torch


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base", required=True)
    p.add_argument("--adapter", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    model = AutoModelForCausalLM.from_pretrained(a.base, dtype=torch.bfloat16)
    model = PeftModel.from_pretrained(model, a.adapter)
    model = model.merge_and_unload()
    model.config.use_cache = True
    os.makedirs(a.out, exist_ok=True)
    model.save_pretrained(a.out, safe_serialization=True)
    AutoTokenizer.from_pretrained(a.base).save_pretrained(a.out)
    gen = os.path.join(a.base, "generation_config.json")
    if os.path.exists(gen):
        shutil.copyfile(gen, os.path.join(a.out, "generation_config.json"))
    print(f"merged {a.adapter} into {a.base} -> {a.out}", flush=True)


if __name__ == "__main__":
    main()
