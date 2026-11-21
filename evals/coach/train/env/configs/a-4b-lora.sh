# A: Qwen3-4B LoRA r 16 (alpha 32), 2 epochs, measured merged at the app's Q4_K_M.
V="$HOME/scratch/yames-c3d"
KIND=lora
BASE="$V/weights/Qwen3-4B"
TRAIN_ARGS="--epochs 2 --batch-size 8 --max-len 2048 --lora-r 16 --lora-alpha 32 --lr 2e-4 --grad-checkpointing --save-every 50 --log-every 10"
QUANTS="Q4_K_M"
HELDOUT=yes
