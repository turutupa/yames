"""Real token lengths of rendered rows (prompt + completion + EOS), with the Qwen3 tokenizer.

    python -I token_lengths.py <tokenizer dir> <out.json> <rendered.jsonl>...

Prints and writes the distribution per file and the longest row, so --max-len can be set above
every row (train_lora.py drops a longer row rather than train half of it).
"""
import json
import sys


def main():
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    from transformers import AutoTokenizer

    tok = AutoTokenizer.from_pretrained(sys.argv[1])
    out = {}
    for path in sys.argv[3:]:
        lens, comp, longest = [], [], None
        with open(path, encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                r = json.loads(line)
                p = len(tok(r["prompt"], add_special_tokens=False)["input_ids"])
                c = len(tok(r["completion"], add_special_tokens=False)["input_ids"]) + 1
                lens.append(p + c)
                comp.append(c)
                if longest is None or p + c > longest[1]:
                    longest = (r["id"], p + c)
        s = sorted(lens)
        q = lambda f: s[min(len(s) - 1, int(f * len(s)))]
        out[path] = {"rows": len(s), "min": s[0], "p50": q(0.5), "p90": q(0.9), "p99": q(0.99), "max": s[-1],
                     "mean": sum(s) / len(s), "longest_id": longest[0], "completion_max": max(comp),
                     "completion_mean": sum(comp) / len(comp)}
        print(path, json.dumps(out[path]), flush=True)
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)


if __name__ == "__main__":
    main()
