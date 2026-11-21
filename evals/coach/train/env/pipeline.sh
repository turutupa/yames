#!/usr/bin/env bash
# Leg c3d2: one candidate from the training data to its RESULT.md, with no agent watching.
#
#   bash pipeline.sh <candidate> <config>
#
# <config> is a bash file (configs/*.sh) setting:
#   KIND        lora | full | stock         (stock: no training, GGUF= is measured as it is)
#   BASE        HF weights dir              (lora / full)
#   TRAIN_ARGS  train_lora.py flags         (--full-finetune, --epochs, --max-len, --save-every, ...)
#   QUANTS      e.g. "Q8_0 Q4_K_M"          (each snapshot is validated at each; the FIRST is the one
#                                            selected on validation and measured on the held-out set)
#   GGUF        stock only: the file
#   HELDOUT     yes | no                    (no for the trial: a trial model never sees the held-out set)
#
# Everything goes to $RUNS/<candidate>/ (RUNS defaults to ~/scratch/yames-c3d/runs):
#   data/       train + validation rendered (--check --with-grammar), lengths.json
#   train/      train_lora.py's output: final model or adapter, epoch-<k>/ snapshots, ckpt-a|b
#   merged/     LoRA snapshots folded into their base (bf16 HF)
#   gguf/       <snapshot>-<quant>.gguf
#   val/        <snapshot>-<quant>/{requests,outcomes}.jsonl, val.json (exact match under the grammar)
#   SELECTED    "<snapshot>-<quant> <gguf>": the best validation exact match at the first quant
#   heldout/    alone/, chain-rules-first/, chain-model-first/ (scripts/coach-eval.mjs), COUNT
#   RESULT.md   tabulate.mjs, with the stock rows beside it
#   STATUS      one line per stage: started / done / skipped / failed, with its log
#   logs/       one log per stage
# Every stage is skipped when its output exists, so a re-submitted job continues where the last
# one stopped (training itself resumes from its last checkpoint: --resume, --save-every).
set -Eeuo pipefail

cand="${1:?candidate name}"
config="${2:?config file}"
E="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODE="$(cd "$E/../../../.." && pwd)"
V="${YAMES_C3D_ROOT:-$HOME/scratch/yames-c3d}"
RUNS="${RUNS:-$V/runs}"
PY="$V/venv/bin/python"
BIN="${COACH_EVAL_BIN:-$HOME/scratch/yames-c3b-results/coach-eval-cuda}"
R="$RUNS/$cand"
KIND="" BASE="" TRAIN_ARGS="" QUANTS="Q4_K_M" GGUF="" HELDOUT="yes"
# shellcheck disable=SC1090
source "$config"
mkdir -p "$R/logs" "$R/data"
export YAMES_LLM_GPU_LAYERS=99
export HF_HUB_OFFLINE=1
export PYTORCH_CUDA_ALLOC_CONF="${PYTORCH_CUDA_ALLOC_CONF:-expandable_segments:True}"

CUR="setup"
LOG="$R/logs/setup.log"
status() { echo "$(date -Iseconds) $*" >> "$R/STATUS"; }
trap 'status "failed $CUR (exit $?) log $LOG"' ERR
begin() { CUR="$1"; LOG="$R/logs/$1.log"; status "started $1 log $LOG"; }
done_() { status "done $CUR"; }
skip() { status "skipped $1 (output exists)"; }

status "pipeline $cand config $config code $CODE ($(git -C "$CODE" rev-parse --short HEAD 2>/dev/null || echo no-git)) bin $BIN host $(uname -n) load $(cut -d' ' -f1 /proc/loadavg)"
cp "$config" "$R/config.sh"

# 1. Render (the app's prompt code of $CODE).
render() {  # <in> <out>
  if [ -s "$2" ]; then skip "render $(basename "$2")"; return; fi
  begin "render-$(basename "$2" .rendered.jsonl)"
  node "$CODE/scripts/coach-train.mjs" render --in "$1" --out "$2.tmp" --check --with-grammar > "$LOG" 2>&1
  mv "$2.tmp" "$2"
  done_
}
VAL="$R/data/validation.rendered.jsonl"
TRAIN="$R/data/train.rendered.jsonl"
render "$CODE/evals/coach/train/validation.jsonl" "$VAL"

snaps=()   # "<name> <hf dir or adapter dir>"
if [ "$KIND" != "stock" ]; then
  render "$CODE/evals/coach/train/train.jsonl" "$TRAIN"

  # 2. Real token lengths.
  if [ -s "$R/data/lengths.json" ]; then skip lengths; else
    begin lengths
    "$PY" -I "$E/token_lengths.py" "$BASE" "$R/data/lengths.json" "$TRAIN" "$VAL" > "$LOG" 2>&1
    done_
  fi

  # 3. Train (resumes from the last checkpoint).
  if [ -s "$R/train/metrics.json" ]; then skip train; else
    begin train
    # shellcheck disable=SC2086
    "$PY" -I "$E/train_lora.py" --model "$BASE" --data "$TRAIN" --eval-data "$VAL" --out "$R/train" \
      --resume --epoch-snapshots $TRAIN_ARGS >> "$LOG" 2>&1
    done_
  fi
  for d in "$R"/train/epoch-*; do
    if [ -d "$d" ]; then snaps+=("$(basename "$d") $d"); fi
  done
  snaps+=("final $R/train")

  # 4. Merge (LoRA) and convert.
  mkdir -p "$R/merged" "$R/gguf"
  for s in "${snaps[@]}"; do
    name="${s%% *}" src="${s#* }"
    hf="$src"
    if [ "$KIND" = "lora" ]; then
      hf="$R/merged/$name"
      if [ -e "$hf/MERGED" ]; then skip "merge $name"; else
        begin "merge-$name"
        "$PY" -I "$E/merge_lora.py" --base "$BASE" --adapter "$src" --out "$hf" > "$LOG" 2>&1
        date -Iseconds > "$hf/MERGED"
        done_
      fi
    fi
    for q in $QUANTS; do
      out="$R/gguf/$name-$(echo "$q" | tr 'A-Z' 'a-z').gguf"
      if [ -s "$out" ]; then skip "gguf $name $q"; continue; fi
      begin "gguf-$name-$q"
      bash "$E/convert.sh" full "$hf" "$out.tmp.gguf" "$q" > "$LOG" 2>&1
      mv "$out.tmp.gguf" "$out"
      done_
    done
  done
fi

# 5. Validation exact match under the grammar (every snapshot, every quant).
ggufs=()   # "<label> <file>"
if [ "$KIND" = "stock" ]; then
  ggufs+=("stock-$(basename "$GGUF" .gguf | tr 'A-Z' 'a-z') $GGUF")
else
  for s in "${snaps[@]}"; do
    name="${s%% *}"
    for q in $QUANTS; do
      ggufs+=("$name-$(echo "$q" | tr 'A-Z' 'a-z') $R/gguf/$name-$(echo "$q" | tr 'A-Z' 'a-z').gguf")
    done
  done
fi
mkdir -p "$R/val"
for g in "${ggufs[@]}"; do
  label="${g%% *}" file="${g#* }"
  d="$R/val/$label"
  if [ -s "$d/val.json" ]; then skip "val $label"; continue; fi
  begin "val-$label"
  mkdir -p "$d"
  "$PY" -I "$E/val_match.py" requests "$VAL" "$d/requests.jsonl" > "$LOG" 2>&1
  "$BIN" --gguf "$file" --requests "$d/requests.jsonl" --outcomes "$d/outcomes.jsonl" >> "$LOG" 2>&1
  "$PY" -I "$E/val_match.py" score "$VAL" "$d/outcomes.jsonl" "$d/val.json" "$cand $label" >> "$LOG" 2>&1
  tail -n 1 "$LOG" >> "$R/STATUS"
  done_
done

# 6. Select on validation only: the best exact match at the first quant (a tie goes to the later snapshot).
if [ -s "$R/SELECTED" ]; then skip select; else
  begin select
  first="$(echo "$QUANTS" | awk '{print tolower($1)}')"
  best="" best_em="-1"
  for g in "${ggufs[@]}"; do
    label="${g%% *}" file="${g#* }"
    case "$label" in *"-$first"|stock-*) ;; *) continue ;; esac
    em="$("$PY" -I "$E/val_match.py" em "$R/val/$label/val.json" 2>> "$LOG")"
    echo "$label $em" >> "$LOG"
    if awk -v a="$em" -v b="$best_em" 'BEGIN{exit !(a >= b)}'; then best="$label $file" best_em="$em"; fi
  done
  echo "$best" > "$R/SELECTED"
  status "selected $best (validation exact match $best_em)"
  done_
fi
sel_file="$(cut -d' ' -f2 "$R/SELECTED")"

# 7. The held-out set: ONCE per finished candidate (COUNT records every run of it).
if [ "$HELDOUT" = "yes" ]; then
  mkdir -p "$R/heldout"
  if [ -s "$R/heldout/alone/results.json" ]; then skip "heldout alone"; else
    begin heldout-alone
    echo "$(date -Iseconds) $sel_file" >> "$R/heldout/COUNT"
    node "$CODE/scripts/coach-eval.mjs" model --bin "$BIN" --gguf "$sel_file" --out "$R/heldout/alone" --grammar situation --prompt notes > "$LOG" 2>&1
    tail -n 1 "$LOG" >> "$R/STATUS"
    done_
  fi
  for order in rules-first model-first; do
    if [ -s "$R/heldout/chain-$order/results.json" ]; then skip "chain $order"; continue; fi
    begin "heldout-chain-$order"
    node "$CODE/scripts/coach-eval.mjs" chain --out "$R/heldout/chain-$order" --outcomes "$R/heldout/alone/outcomes.jsonl" --order "$order" --label "$cand" > "$LOG" 2>&1
    done_
  done
fi

# 8. RESULT.md (always rewritten: the stock rows may have arrived since).
begin tabulate
node "$E/tabulate.mjs" "$R" > "$LOG" 2>&1
done_
status "pipeline $cand finished"
