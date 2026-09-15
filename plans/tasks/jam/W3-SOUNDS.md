# W3 — the kits: the sounds a band needs, synthesised

Branch: `jam/w3-sounds`, from `jam`. Your area is `generate_sounds.py`,
`src-tauri/sounds/` (new files only; never modify an existing WAV), and a new
`src-tauri/sounds/KITS.md`. You do not edit any `.rs` file: the engine worker
owns `engine.rs` and will wire your files in after you both land, from the
map you write in `KITS.md`. Read `plans/tasks/jam/BRIEF.md` first, then
`plans/JAM_MODE.md` §4.1 and §6.

## What to build

Everything is synthesised in `generate_sounds.py`, the way every sound in
the app is today. Read the whole file first: the drum and snare kits there
were tuned over several rounds by ear, and the comments in
`src-tauri/src/engine.rs` around `DRUM_BODY` and the snare kit explain what
went wrong the first times (a "shy" snare, a side-stick that read as a
woodblock, an accent with no mid-band energy on a laptop speaker). Do not
repeat those mistakes.

### Four kits

Each kit is a set of mono 16-bit 44.1 kHz WAVs, one per voice, named
`kit_<kit>_<voice>.wav`:

| voice | what it is | duration |
|---|---|---|
| kick | the kick, with body | 120–180 ms |
| snare_hi | snare struck hard (accent) | 150–220 ms |
| snare_lo | snare struck soft (hit and ghost, gain does the rest) | 120–180 ms |
| hat | closed hi-hat | 50–70 ms |
| hat_open | open hi-hat, a longer metallic wash | 220–350 ms |
| ride | ride cymbal ping, some wash | 250–400 ms |
| rim | rim click / side-stick, short and mid-forward | 40–60 ms |
| crash | crash | 400–700 ms |

Kits:

- **room** — what the app's Drum kit already sounds like, a little roomier:
  kick with body, medium snare, real-ish hats. Start from `gen_drum`,
  `gen_hihat`, `gen_crash` and the snare generator; add the missing voices.
- **tight** — dry and punchy, short decays, the hats crisp. The kit you
  practise funk and 16ths to.
- **brushes** — soft transients, noise-based snare with a longer, breathy
  tail, no sharp kick click, ride rather than hat-forward. For swing and
  bossa.
- **electronic** — 808-style: long sine kick with pitch drop, clap-like
  snare (short noise bursts), thin closed hat, an open hat that is a
  filtered noise tail.

### Rules that matter

- Every accent voice must be audibly louder than its hit voice on a small
  speaker: mid band (1–4 kHz) energy, not only low end. The engine's test
  `every_accent_is_louder_than_its_beat_on_a_small_speaker` shows the
  measurement; reproduce it in Python for your files and print the numbers.
- Peak-normalise each file to 0.9. No clipping anywhere; check every file.
- Total size: keep the eight files of a kit under ~600 KB combined (they are
  embedded in the binary with `include_bytes!`).
- Deterministic: seed `random` at the top of each generator so a rebuild
  produces the same bytes.
- Do not touch the existing files (`click_*`, `wood_*`, `beep_*`, `drum_*`,
  `snare_*`, `chime_*`) or the code paths that generate them; add new
  functions and a new section of `main`.

### `src-tauri/sounds/KITS.md`

A table for the engine worker: kit → voice → filename, the measured peak,
duration, and the small-speaker accent margin for snare_hi vs snare_lo and
kick vs hat. One paragraph per kit on what it is for.

## Gates

`python generate_sounds.py` regenerates everything and the pre-existing
files come out byte-identical (verify with `git status` — nothing already
tracked may change). Your measurement script prints the numbers in KITS.md.
Then the gates in BRIEF.md still pass (you changed no code they cover, but
run them).

## Report

As in BRIEF.md, plus the KITS.md table inline.
