"""Two bench runs side by side: `python -m tools.ml.scripts.compare <base dir> <cand dir> [--all]`.

Prints the note-model metrics (group|chain|kind|metric) that moved, in points,
and a per-chain summary of the cells the note model is trained for.
"""
import json
import sys

base, cand = (json.load(open(f"{d}/results.json"))["metrics"] for d in sys.argv[1:3])
GATED = ("verifier_yes", "verifier_no", "verifier_unsure", "verifier_caught", "final_right", "final_wrong", "final_caught", "verifier_scatter_ms")
rows = []
for k in sorted(set(base) | set(cand)):
    g, chain, kind, metric = k.split("|")
    if metric not in GATED:
        continue
    b, c = base.get(k, {}).get("value"), cand.get(k, {}).get("value")
    if b is None or c is None or abs(b - c) < (1e-9 if "--all" in sys.argv else 0.005):
        continue
    rows.append((k, b, c, cand[k].get("n")))
print(f"{len(rows)} note-model metrics moved")
if "--all" in sys.argv or "--rows" in sys.argv:
    for k, b, c, n in rows:
        print(f"  {k:55s} {b:8.3f} -> {c:8.3f}  (n={n})")
if "--gs" in sys.argv:  # a `run --dir` over real recordings (GuitarSet): pooled and per chain
    for ch in ["all"] + sorted({k.split("|")[1] for k in base} - {"all"}):
        pick = [f"good|{ch}|picked|verifier_yes", f"good|{ch}|picked|verifier_no", f"good|{ch}|chord_tone|verifier_yes", f"good|{ch}|chord_tone|verifier_no",
                f"omitted|{ch}|all|verifier_caught", f"omitted|{ch}|all|verifier_yes", f"wrong|{ch}|all|verifier_caught", f"wrong|{ch}|all|verifier_yes", f"wrong|{ch}|all|final_right"]
        print(ch.ljust(15) + "  ".join(f"{k.split('|', 1)[0][:4]}.{k.split('|')[2][:6]}.{k.split('|')[3][9:] or k.split('|')[3]} {100 * base[k]['value']:.1f}>{100 * cand[k]['value']:.1f}" for k in pick if k in base and k in cand))
    sys.exit(0)
if "--line" in sys.argv:  # the cells that decide, pooled over chains
    pick = ["good|all|chord_tone|verifier_yes", "good|all|slide_to|verifier_yes", "good|all|palm_mute|verifier_yes", "good|all|harmonic|verifier_yes", "good|all|pull|verifier_yes",
            "good|all|bend_release|verifier_yes", "good|all|picked|verifier_yes", "omitted|all|all|verifier_caught", "omitted|all|all|verifier_yes", "omitted|all|chord_tone|verifier_yes",
            "dead|all|chord_tone|verifier_yes", "wrong|all|all|verifier_caught", "wrong|all|all|verifier_yes", "wrong|all|all|final_right", "weak|all|hammer|verifier_yes"]
    print("  ".join(f"{k.split('|', 1)[0][:4]}.{k.split('|')[2][:6]}.{k.split('|')[3][9:] or k.split('|')[3]} {100 * base[k]['value']:.0f}>{100 * cand[k]['value']:.0f}" for k in pick if k in base and k in cand))
    sys.exit(0)
if "--brief" in sys.argv:  # pooled over chains only, one line
    pooled = [(k.split("|", 2)[2].replace("|all|", "|") if False else k, b, c) for k, b, c, n in rows if k.split("|")[1] == "all"]
    print("; ".join(f"{k.replace('|all|', '|')} {b * (1 if 'ms' in k else 100):.0f}>{c * (1 if 'ms' in k else 100):.0f}" for k, b, c in pooled))
    sys.exit(0)
chains = ["all", "di", "di_gain", "laptop_mic", "phone_mic", "phone_agc", "laptop_noisy", "laptop_reverb"]
CELLS = [("good", "chord_tone", "verifier_yes"), ("good", "chord_tone", "verifier_no"), ("good", "slide_to", "verifier_yes"), ("good", "palm_mute", "verifier_yes"),
         ("good", "palm_mute", "verifier_no"), ("good", "harmonic", "verifier_yes"), ("good", "pull", "verifier_yes"), ("good", "all", "verifier_yes"), ("good", "all", "verifier_no"),
         ("omitted", "all", "verifier_caught"), ("omitted", "all", "verifier_yes"), ("wrong", "all", "verifier_caught"), ("wrong", "all", "verifier_yes"), ("wrong", "all", "final_right"),
         ("dead", "chord_tone", "verifier_yes"), ("weak", "all", "verifier_yes"), ("good", "all", "final_right"), ("good", "all", "final_wrong")]
print("cell (base>cand, %)".ljust(34) + " ".join(c[:9].rjust(9) for c in chains))
for g, kind, metric in CELLS:
    cells = []
    for ch in chains:
        k = f"{g}|{ch}|{kind}|{metric}"
        b, c = base.get(k, {}).get("value"), cand.get(k, {}).get("value")
        cells.append("-".rjust(9) if b is None or c is None else f"{100 * b:.0f}>{100 * c:.0f}".rjust(9))
    print(f"{g}|{kind}|{metric}".ljust(34) + " ".join(cells))
