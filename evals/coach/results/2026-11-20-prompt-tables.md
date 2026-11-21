# The choice prompt revised (leg c3bp): old -> new

Shipped arm only (grammar narrowed to the situation, the tools' notes), deadline 8 s, prefix cache on, all
layers on the GPU (GB10, CUDA, the frozen `coach-eval-cuda`), 252 items (168 calls, 24 which, 24 yours,
36 none). **old** = c3b2m's runs (its branch's registry). **base** = the `coach` branch today with the old
prompt (the registry has moved since: `click_subdivision` gained `at`), run here so that new is compared
with the same world. **r1** = this leg's first revision (every value listed, "only if the player said it",
set_tempo's bpm / direction exclusive in the grammar, set_setting's values, the Paths the words name);
**r2** = the second (the undo's guards `at` hidden from the prompt; the which line pointed at "Paths these
words name", the none line at "Tools here"). Two measured revisions, each measured once. Chain = rules
first, the model only where the rules said `none` (as the app would run it). Times are this machine's
with another leg's training sharing the GPU: base, r1 and r2 ran about twice as slow as old did, so
compare latency across base / r1 / r2 only.

## What it shows

- **The arguments half is fixed, as predicted.** Right arguments, chain: 4B 97 -> 114 / 115 of 168
  (57.7% -> 68.5%), 8B 117 -> 131 / 134 (69.6% -> 79.8%). Right tool, chain: 4B 76.2% -> 81.5% / 81.0%,
  8B 79.8% -> 84.5% / 86.9%; the 8B alone reaches 94.0% (158/168, r2).
- **Wrong actions went UP, not down**: chain 4B 28 -> 31 -> 41 of 252, 8B 19 -> 26 -> 39 (7.5% -> 10.3% ->
  15.5%). A malformed call used to be refused by the runner (an invented `coachVoice none`, a `bpm` beside a
  `direction`, an `at` that did not match): no action. Every fix that makes a call well formed lets the
  model's wrong DECISION run: "mute my mic" (yours) -> `set_setting countIn off`; "slower" on a screen
  without a tempo (none) -> `set_setting countIn on`; "sube a 120" -> `set_tempo direction faster` (the
  grammar now makes it choose, and it chooses the word over the number). r2 removed the last accidental
  refusals (the `at` guard) and its two lines did not make either model ask: `which` asked alone 0 and 2
  of 24.
- **Per language, chain, meets both (>= 90% right tool, < 2% wrong)**: 8B 2 (base) -> 3 (r1: fr, pt-BR,
  ru) -> 0 (r2); 4B 1 -> 1 -> 0.
- **What a prompt can no longer fix (the case for the trained router)**: in r2's chain the wrong actions
  are decisions, not arguments: 8B 39 = which 11, yours 10, none 4, another tool 5, other arguments 9 (7
  of them set_tempo's word-over-number choice); 4B 41 = which 9, another tool 11, other arguments 14, none
  4, yours 3. Listing the titles that match did not teach "ask": both models open one of them, or go to
  the Paths screen.
- Run-to-run noise: base and old are the same prompt on nearly the same registry and differ by up to 13
  unreadable outputs (4B base: twelve texts that start mid-string, `</s>。"}}`, not seen in any other run;
  not investigated), so a difference of two or three items is not a finding.

## What it costs in tokens (estimateTokens, the budget's own measure)

| | old | r2 |
|---|---|---|
| prefix (static, decoded once and kept) | 848 | 1072 (`CHOICE_PREFIX_TOKENS` 900 -> 1100) |
| context, mean / max per turn | 177.2 / 251 | 181.7 / 251 (61 of 252 turns carry a `Paths these words name` line, about 18 tokens each) |
| per turn with the prefix cache | 177 + question | 182 + question |
| per turn without it (first turn, or `YAMES_LLM_NO_PREFIX_CACHE=1`) | 1025 + question | 1254 + question |

## Qwen3 4B Q4_K_M, model alone

| run | right tool | right args | wrong action | asked (which) | yours | none | no answer | median | p90 |
|---|---|---|---|---|---|---|---|---|---|
| old (c3b2m) | 139/168 (82.7%) | 99/168 (58.9%) | 37/252 (14.7%) | 4/24 | 2/24 | 20/36 | 2 (unread 1, truncated 1) | 0.61 s | 0.89 s |
| base (coach today, old prompt) | 137/168 (81.5%) | 96/168 (57.1%) | 38/252 (15.1%) | 2/24 | 1/24 | 20/36 | 13 (unread 12, truncated 1) | 1.08 s | 2.03 s |
| r1 (c3bp revision 1) | 144/168 (85.7%) | 116/168 (69.0%) | 54/252 (21.4%) | 0/24 | 1/24 | 23/36 | 1 (truncated 1) | 1.04 s | 1.73 s |
| r2 (c3bp revision 2, final) | 144/168 (85.7%) | 116/168 (69.0%) | 65/252 (25.8%) | 0/24 | 0/24 | 19/36 | 0 | 1.36 s | 2.08 s |

Wrong actions by what was expected / by the tool chosen:

- old (c3b2m): expected which 12, another tool 12, other arguments 8, none 3, yours 2; chosen show_scale 10, go_to 8, show_chord 5, set_goal 4, set_focus 3, open_path 2, play_exercise 1, start_today 1, open_step 1, set_minutes 1, load_preset 1
- base (coach today, old prompt): expected which 12, another tool 13, other arguments 7, none 4, yours 2; chosen show_scale 10, set_goal 7, go_to 6, show_chord 6, open_step 2, set_focus 2, play_exercise 1, start_today 1, open_path 1, set_minutes 1, load_jam 1
- r1 (c3bp revision 1): expected which 21, another tool 16, other arguments 10, none 2, yours 5; chosen go_to 20, open_path 6, set_setting 6, set_tempo 5, show_chord 5, set_goal 5, start_today 2, show_scale 2, play_exercise 1, set_focus 1, set_minutes 1
- r2 (c3bp revision 2, final): expected which 21, another tool 17, other arguments 16, none 4, yours 7; chosen go_to 20, set_tempo 11, set_setting 10, set_goal 6, open_path 5, show_scale 3, start_today 2, show_chord 2, play_exercise 1, open_settings 1, open_step 1, set_focus 1, set_minutes 1, load_preset 1

## Qwen3 4B Q4_K_M, chain rules-first

| run | right tool | right args | wrong action | asked (which) | yours | none | no answer | median | p90 |
|---|---|---|---|---|---|---|---|---|---|
| old (c3b2m) | 130/168 (77.4%) | 99/168 (58.9%) | 27/252 (10.7%) | 14/24 | 13/24 | 20/36 | 2 (unread 1, truncated 1) | 0.51 s | 0.83 s |
| base (coach today, old prompt) | 128/168 (76.2%) | 97/168 (57.7%) | 28/252 (11.1%) | 12/24 | 12/24 | 20/36 | 10 (unread 9, truncated 1) | 0.90 s | 1.83 s |
| r1 (c3bp revision 1) | 137/168 (81.5%) | 114/168 (67.9%) | 31/252 (12.3%) | 11/24 | 12/24 | 23/36 | 1 (truncated 1) | 0.83 s | 1.63 s |
| r2 (c3bp revision 2, final) | 136/168 (81.0%) | 115/168 (68.5%) | 41/252 (16.3%) | 11/24 | 11/24 | 19/36 | 0 | 1.23 s | 1.93 s |

Wrong actions by what was expected / by the tool chosen:

- old (c3b2m): expected which 7, another tool 10, other arguments 6, none 3, yours 1; chosen show_scale 9, go_to 5, set_goal 4, set_focus 3, show_chord 3, start_today 1, open_path 1, set_minutes 1
- base (coach today, old prompt): expected which 8, another tool 10, other arguments 5, none 4, yours 1; chosen show_scale 9, set_goal 7, go_to 4, show_chord 3, set_focus 2, start_today 1, open_step 1, set_minutes 1
- r1 (c3bp revision 1): expected which 9, another tool 9, other arguments 8, none 2, yours 3; chosen go_to 7, set_tempo 5, show_chord 4, set_goal 4, set_setting 4, start_today 2, show_scale 2, open_path 1, set_focus 1, set_minutes 1
- r2 (c3bp revision 2, final): expected which 9, another tool 11, other arguments 14, none 4, yours 3; chosen set_tempo 10, go_to 8, set_setting 7, set_goal 6, show_scale 3, start_today 2, show_chord 2, open_step 1, set_focus 1, set_minutes 1

## Qwen3 8B Q4_K_M, model alone

| run | right tool | right args | wrong action | asked (which) | yours | none | no answer | median | p90 |
|---|---|---|---|---|---|---|---|---|---|
| old (c3b2m) | 141/168 (83.9%) | 122/168 (72.6%) | 34/252 (13.5%) | 0/24 | 11/24 | 13/36 | 0 | 0.93 s | 1.31 s |
| base (coach today, old prompt) | 141/168 (83.9%) | 118/168 (70.2%) | 36/252 (14.3%) | 0/24 | 10/24 | 12/36 | 0 | 2.33 s | 3.27 s |
| r1 (c3bp revision 1) | 155/168 (92.3%) | 142/168 (84.5%) | 39/252 (15.5%) | 1/24 | 9/24 | 14/36 | 0 | 2.24 s | 3.18 s |
| r2 (c3bp revision 2, final) | 158/168 (94.0%) | 143/168 (85.1%) | 55/252 (21.8%) | 2/24 | 2/24 | 16/36 | 0 | 2.33 s | 3.14 s |

Wrong actions by what was expected / by the tool chosen:

- old (c3b2m): expected which 17, another tool 9, other arguments 3, none 1, yours 4; chosen open_step 8, show_chord 7, go_to 4, show_scale 4, open_path 3, set_setting 3, set_goal 2, load_jam 1, set_minutes 1, swap_part 1
- base (coach today, old prompt): expected which 18, another tool 10, other arguments 3, none 1, yours 4; chosen open_step 8, show_chord 7, go_to 4, show_scale 4, open_path 3, set_setting 3, set_goal 3, load_jam 1, set_minutes 1, open_settings 1, swap_part 1
- r1 (c3bp revision 1): expected which 21, another tool 4, other arguments 5, none 2, yours 7; chosen open_path 12, go_to 7, set_setting 6, set_tempo 4, set_goal 2, show_scale 2, load_jam 2, follow_path 1, open_step 1, show_chord 1, set_minutes 1
- r2 (c3bp revision 2, final): expected which 22, another tool 6, other arguments 9, none 4, yours 14; chosen set_setting 14, open_path 12, set_tempo 7, go_to 6, open_step 3, swap_part 2, set_goal 2, show_chord 2, show_scale 2, load_jam 2, follow_path 1, test_out 1, set_minutes 1

## Qwen3 8B Q4_K_M, chain rules-first

| run | right tool | right args | wrong action | asked (which) | yours | none | no answer | median | p90 |
|---|---|---|---|---|---|---|---|---|---|
| old (c3b2m) | 134/168 (79.8%) | 120/168 (71.4%) | 18/252 (7.1%) | 11/24 | 19/24 | 13/36 | 0 | 0.76 s | 1.23 s |
| base (coach today, old prompt) | 134/168 (79.8%) | 117/168 (69.6%) | 19/252 (7.5%) | 11/24 | 19/24 | 12/36 | 0 | 1.97 s | 3.09 s |
| r1 (c3bp revision 1) | 142/168 (84.5%) | 131/168 (78.0%) | 26/252 (10.3%) | 11/24 | 17/24 | 14/36 | 0 | 1.97 s | 2.89 s |
| r2 (c3bp revision 2, final) | 146/168 (86.9%) | 134/168 (79.8%) | 39/252 (15.5%) | 12/24 | 12/24 | 16/36 | 0 | 2.06 s | 2.98 s |

Wrong actions by what was expected / by the tool chosen:

- old (c3b2m): expected which 8, another tool 5, other arguments 2, none 1, yours 2; chosen go_to 4, show_scale 3, open_step 2, set_goal 2, show_chord 2, load_jam 1, set_setting 1, set_minutes 1, swap_part 1, open_path 1
- base (coach today, old prompt): expected which 8, another tool 6, other arguments 2, none 1, yours 2; chosen go_to 4, set_goal 3, show_scale 3, open_step 2, show_chord 2, load_jam 1, set_setting 1, set_minutes 1, swap_part 1, open_path 1
- r1 (c3bp revision 1): expected which 10, another tool 4, other arguments 5, none 2, yours 5; chosen go_to 5, set_tempo 4, open_path 4, set_setting 4, set_goal 2, show_scale 2, load_jam 2, follow_path 1, show_chord 1, set_minutes 1
- r2 (c3bp revision 2, final): expected which 11, another tool 5, other arguments 9, none 4, yours 10; chosen set_setting 10, set_tempo 7, go_to 5, open_path 3, swap_part 2, set_goal 2, show_chord 2, show_scale 2, load_jam 2, open_step 1, follow_path 1, test_out 1, set_minutes 1

## Qwen3 4B Q4_K_M, model alone: per language (old -> base -> r1 -> r2)

| lang | right tool | right args | wrong action | median | p90 | meets both (>= 90%, < 2%) |
|---|---|---|---|---|---|---|
| en | 21/24 -> 21/24 -> 22/24 -> 22/24 | 14/24 -> 13/24 -> 20/24 -> 19/24 | 2/36 -> 3/36 -> 4/36 -> 5/36 | 0.64 s -> 1.82 s -> 0.99 s -> 1.58 s | 0.92 s -> 2.56 s -> 1.90 s -> 2.21 s | no -> no -> no -> no |
| es | 19/24 -> 19/24 -> 18/24 -> 17/24 | 12/24 -> 11/24 -> 12/24 -> 10/24 | 7/36 -> 8/36 -> 13/36 -> 15/36 | 0.54 s -> 1.07 s -> 0.73 s -> 1.30 s | 0.97 s -> 1.59 s -> 1.16 s -> 2.42 s | no -> no -> no -> no |
| de | 21/24 -> 20/24 -> 23/24 -> 22/24 | 15/24 -> 15/24 -> 17/24 -> 17/24 | 6/36 -> 6/36 -> 7/36 -> 8/36 | 0.53 s -> 0.98 s -> 0.95 s -> 1.59 s | 0.83 s -> 2.41 s -> 1.63 s -> 2.56 s | no -> no -> no -> no |
| fr | 5/8 -> 5/8 -> 6/8 -> 6/8 | 2/8 -> 2/8 -> 5/8 -> 4/8 | 3/12 -> 3/12 -> 4/12 -> 5/12 | 0.65 s -> 0.96 s -> 1.01 s -> 1.17 s | 0.84 s -> 1.40 s -> 1.19 s -> 1.60 s | no -> no -> no -> no |
| it | 6/8 -> 6/8 -> 5/8 -> 5/8 | 5/8 -> 5/8 -> 3/8 -> 4/8 | 1/12 -> 1/12 -> 2/12 -> 4/12 | 0.57 s -> 0.82 s -> 0.98 s -> 0.76 s | 0.80 s -> 1.65 s -> 1.31 s -> 0.97 s | no -> no -> no -> no |
| pt-BR | 7/8 -> 8/8 -> 8/8 -> 8/8 | 4/8 -> 5/8 -> 6/8 -> 6/8 | 1/12 -> 1/12 -> 1/12 -> 2/12 | 0.63 s -> 1.00 s -> 1.18 s -> 1.10 s | 1.14 s -> 1.52 s -> 1.67 s -> 1.33 s | no -> no -> no -> no |
| nl | 7/8 -> 7/8 -> 8/8 -> 8/8 | 6/8 -> 6/8 -> 8/8 -> 7/8 | 1/12 -> 1/12 -> 1/12 -> 2/12 | 0.59 s -> 0.90 s -> 1.40 s -> 0.92 s | 0.92 s -> 1.39 s -> 1.71 s -> 1.19 s | no -> no -> no -> no |
| pl | 5/8 -> 4/8 -> 5/8 -> 5/8 | 5/8 -> 4/8 -> 3/8 -> 4/8 | 2/12 -> 2/12 -> 4/12 -> 5/12 | 0.51 s -> 0.67 s -> 1.61 s -> 1.34 s | 0.69 s -> 1.30 s -> 2.03 s -> 1.78 s | no -> no -> no -> no |
| tr | 7/8 -> 7/8 -> 8/8 -> 8/8 | 4/8 -> 4/8 -> 5/8 -> 6/8 | 1/12 -> 1/12 -> 1/12 -> 1/12 | 0.67 s -> 0.96 s -> 1.51 s -> 1.87 s | 0.96 s -> 1.30 s -> 2.88 s -> 2.67 s | no -> no -> no -> no |
| ru | 7/8 -> 6/8 -> 7/8 -> 8/8 | 5/8 -> 4/8 -> 7/8 -> 7/8 | 2/12 -> 2/12 -> 2/12 -> 3/12 | 0.60 s -> 0.85 s -> 1.63 s -> 1.56 s | 0.93 s -> 2.31 s -> 1.90 s -> 1.89 s | no -> no -> no -> no |
| vi | 6/8 -> 6/8 -> 6/8 -> 7/8 | 6/8 -> 6/8 -> 4/8 -> 5/8 | 4/12 -> 4/12 -> 5/12 -> 5/12 | 0.66 s -> 0.82 s -> 1.23 s -> 1.36 s | 0.83 s -> 1.16 s -> 1.85 s -> 1.71 s | no -> no -> no -> no |
| ja | 8/8 -> 8/8 -> 7/8 -> 7/8 | 7/8 -> 7/8 -> 7/8 -> 7/8 | 2/12 -> 1/12 -> 3/12 -> 3/12 | 0.56 s -> 0.82 s -> 0.87 s -> 1.32 s | 0.82 s -> 1.47 s -> 1.12 s -> 1.61 s | no -> no -> no -> no |
| ko | 7/8 -> 7/8 -> 7/8 -> 7/8 | 5/8 -> 5/8 -> 6/8 -> 7/8 | 0/12 -> 0/12 -> 1/12 -> 1/12 | 0.65 s -> 1.07 s -> 0.82 s -> 1.32 s | 0.88 s -> 3.77 s -> 1.17 s -> 1.90 s | no -> no -> no -> no |
| zh-CN | 6/8 -> 6/8 -> 7/8 -> 7/8 | 4/8 -> 4/8 -> 7/8 -> 7/8 | 2/12 -> 2/12 -> 1/12 -> 1/12 | 0.62 s -> 1.44 s -> 0.91 s -> 1.36 s | 0.89 s -> 2.60 s -> 1.44 s -> 1.87 s | no -> no -> no -> no |
| zh-TW | 7/8 -> 7/8 -> 7/8 -> 7/8 | 5/8 -> 5/8 -> 6/8 -> 6/8 | 3/12 -> 3/12 -> 5/12 -> 5/12 | 0.35 s -> 1.66 s -> 0.97 s -> 1.42 s | 0.56 s -> 1.92 s -> 1.13 s -> 1.75 s | no -> no -> no -> no |
| all | 139/168 -> 137/168 -> 144/168 -> 144/168 | 99/168 -> 96/168 -> 116/168 -> 116/168 | 37/252 -> 38/252 -> 54/252 -> 65/252 | 0.61 s -> 1.08 s -> 1.04 s -> 1.36 s | 0.89 s -> 2.03 s -> 1.73 s -> 2.08 s | no -> no -> no -> no |

## Qwen3 4B Q4_K_M, chain rules-first: per language (old -> base -> r1 -> r2)

| lang | right tool | right args | wrong action | median | p90 | meets both (>= 90%, < 2%) |
|---|---|---|---|---|---|---|
| en | 20/24 -> 20/24 -> 21/24 -> 21/24 | 16/24 -> 15/24 -> 20/24 -> 20/24 | 0/36 -> 1/36 -> 0/36 -> 0/36 | 0.39 s -> 1.14 s -> 0.35 s -> 0.65 s | 0.75 s -> 2.43 s -> 1.46 s -> 2.03 s | no -> no -> no -> no |
| es | 19/24 -> 19/24 -> 19/24 -> 17/24 | 14/24 -> 13/24 -> 14/24 -> 12/24 | 6/36 -> 6/36 -> 8/36 -> 10/36 | 0.43 s -> 0.98 s -> 0.69 s -> 1.17 s | 0.81 s -> 1.28 s -> 1.14 s -> 2.09 s | no -> no -> no -> no |
| de | 20/24 -> 19/24 -> 22/24 -> 21/24 | 16/24 -> 17/24 -> 17/24 -> 17/24 | 4/36 -> 4/36 -> 6/36 -> 7/36 | 0.45 s -> 0.90 s -> 0.94 s -> 1.40 s | 0.83 s -> 2.41 s -> 1.63 s -> 2.56 s | no -> no -> no -> no |
| fr | 6/8 -> 6/8 -> 7/8 -> 7/8 | 3/8 -> 3/8 -> 6/8 -> 5/8 | 2/12 -> 2/12 -> 2/12 -> 3/12 | 0.52 s -> 0.81 s -> 0.81 s -> 1.13 s | 0.84 s -> 1.26 s -> 1.19 s -> 1.60 s | no -> no -> no -> no |
| it | 7/8 -> 7/8 -> 6/8 -> 6/8 | 6/8 -> 6/8 -> 4/8 -> 5/8 | 0/12 -> 0/12 -> 0/12 -> 2/12 | 0.51 s -> 0.71 s -> 0.82 s -> 0.69 s | 0.80 s -> 1.39 s -> 1.31 s -> 0.92 s | no -> no -> no -> no |
| pt-BR | 7/8 -> 8/8 -> 8/8 -> 8/8 | 4/8 -> 5/8 -> 6/8 -> 6/8 | 0/12 -> 0/12 -> 0/12 -> 1/12 | 0.61 s -> 0.96 s -> 1.06 s -> 1.10 s | 1.14 s -> 1.52 s -> 1.67 s -> 1.33 s | no -> yes -> yes -> no |
| nl | 5/8 -> 5/8 -> 6/8 -> 6/8 | 4/8 -> 4/8 -> 6/8 -> 5/8 | 1/12 -> 1/12 -> 0/12 -> 1/12 | 0.49 s -> 0.76 s -> 1.28 s -> 0.82 s | 0.92 s -> 1.39 s -> 1.71 s -> 1.19 s | no -> no -> no -> no |
| pl | 4/8 -> 3/8 -> 4/8 -> 4/8 | 4/8 -> 3/8 -> 2/8 -> 3/8 | 2/12 -> 2/12 -> 3/12 -> 4/12 | 0.27 s -> 0.34 s -> 1.44 s -> 1.19 s | 0.63 s -> 1.30 s -> 1.91 s -> 1.78 s | no -> no -> no -> no |
| tr | 5/8 -> 5/8 -> 6/8 -> 6/8 | 3/8 -> 3/8 -> 4/8 -> 5/8 | 1/12 -> 1/12 -> 1/12 -> 1/12 | 0.62 s -> 0.80 s -> 1.47 s -> 1.42 s | 0.96 s -> 1.16 s -> 2.42 s -> 2.67 s | no -> no -> no -> no |
| ru | 7/8 -> 6/8 -> 7/8 -> 8/8 | 5/8 -> 4/8 -> 7/8 -> 8/8 | 2/12 -> 2/12 -> 1/12 -> 1/12 | 0.59 s -> 0.85 s -> 1.60 s -> 1.46 s | 0.93 s -> 2.31 s -> 1.80 s -> 1.75 s | no -> no -> no -> no |
| vi | 5/8 -> 5/8 -> 5/8 -> 6/8 | 5/8 -> 5/8 -> 4/8 -> 4/8 | 4/12 -> 4/12 -> 4/12 -> 5/12 | 0.59 s -> 0.78 s -> 1.22 s -> 1.32 s | 0.78 s -> 1.07 s -> 1.68 s -> 1.65 s | no -> no -> no -> no |
| ja | 7/8 -> 7/8 -> 7/8 -> 7/8 | 6/8 -> 6/8 -> 7/8 -> 7/8 | 0/12 -> 0/12 -> 0/12 -> 0/12 | 0.49 s -> 0.76 s -> 0.80 s -> 1.20 s | 0.82 s -> 1.47 s -> 1.06 s -> 1.61 s | no -> no -> no -> no |
| ko | 5/8 -> 5/8 -> 5/8 -> 5/8 | 4/8 -> 4/8 -> 4/8 -> 5/8 | 0/12 -> 0/12 -> 0/12 -> 0/12 | 0.30 s -> 0.59 s -> 0.38 s -> 0.62 s | 0.78 s -> 1.58 s -> 1.17 s -> 1.90 s | no -> no -> no -> no |
| zh-CN | 6/8 -> 6/8 -> 7/8 -> 7/8 | 4/8 -> 4/8 -> 7/8 -> 7/8 | 2/12 -> 2/12 -> 1/12 -> 1/12 | 0.58 s -> 1.35 s -> 0.80 s -> 1.34 s | 0.89 s -> 2.60 s -> 1.44 s -> 1.87 s | no -> no -> no -> no |
| zh-TW | 7/8 -> 7/8 -> 7/8 -> 7/8 | 5/8 -> 5/8 -> 6/8 -> 6/8 | 3/12 -> 3/12 -> 5/12 -> 5/12 | 0.35 s -> 1.66 s -> 0.97 s -> 1.42 s | 0.56 s -> 1.92 s -> 1.13 s -> 1.75 s | no -> no -> no -> no |
| all | 130/168 -> 128/168 -> 137/168 -> 136/168 | 99/168 -> 97/168 -> 114/168 -> 115/168 | 27/252 -> 28/252 -> 31/252 -> 41/252 | 0.51 s -> 0.90 s -> 0.83 s -> 1.23 s | 0.83 s -> 1.83 s -> 1.63 s -> 1.93 s | no -> no -> no -> no |

## Qwen3 8B Q4_K_M, model alone: per language (old -> base -> r1 -> r2)

| lang | right tool | right args | wrong action | median | p90 | meets both (>= 90%, < 2%) |
|---|---|---|---|---|---|---|
| en | 23/24 -> 23/24 -> 24/24 -> 24/24 | 22/24 -> 20/24 -> 24/24 -> 23/24 | 4/36 -> 5/36 -> 4/36 -> 6/36 | 1.03 s -> 1.95 s -> 2.21 s -> 2.44 s | 1.36 s -> 3.00 s -> 2.92 s -> 3.15 s | no -> no -> no -> no |
| es | 18/24 -> 18/24 -> 21/24 -> 21/24 | 14/24 -> 14/24 -> 17/24 -> 16/24 | 6/36 -> 7/36 -> 11/36 -> 13/36 | 1.03 s -> 2.30 s -> 2.24 s -> 2.35 s | 1.55 s -> 3.41 s -> 3.49 s -> 3.15 s | no -> no -> no -> no |
| de | 20/24 -> 20/24 -> 22/24 -> 22/24 | 16/24 -> 16/24 -> 20/24 -> 20/24 | 5/36 -> 5/36 -> 6/36 -> 6/36 | 0.94 s -> 2.41 s -> 2.33 s -> 2.08 s | 1.40 s -> 3.24 s -> 2.89 s -> 3.01 s | no -> no -> no -> no |
| fr | 7/8 -> 7/8 -> 8/8 -> 8/8 | 6/8 -> 6/8 -> 7/8 -> 7/8 | 2/12 -> 2/12 -> 1/12 -> 2/12 | 1.05 s -> 2.69 s -> 2.48 s -> 2.25 s | 1.33 s -> 3.64 s -> 3.39 s -> 3.07 s | no -> no -> no -> no |
| it | 6/8 -> 6/8 -> 7/8 -> 7/8 | 5/8 -> 5/8 -> 7/8 -> 7/8 | 2/12 -> 2/12 -> 1/12 -> 2/12 | 1.01 s -> 2.37 s -> 1.97 s -> 2.32 s | 1.36 s -> 3.29 s -> 2.87 s -> 3.54 s | no -> no -> no -> no |
| pt-BR | 8/8 -> 8/8 -> 8/8 -> 8/8 | 7/8 -> 7/8 -> 7/8 -> 7/8 | 1/12 -> 1/12 -> 1/12 -> 3/12 | 0.88 s -> 2.50 s -> 1.58 s -> 2.26 s | 1.28 s -> 3.27 s -> 1.97 s -> 2.92 s | no -> no -> no -> no |
| nl | 6/8 -> 6/8 -> 8/8 -> 8/8 | 4/8 -> 4/8 -> 7/8 -> 7/8 | 0/12 -> 0/12 -> 4/12 -> 4/12 | 0.84 s -> 2.39 s -> 1.40 s -> 2.14 s | 1.06 s -> 2.81 s -> 1.84 s -> 2.95 s | no -> no -> no -> no |
| pl | 7/8 -> 7/8 -> 8/8 -> 8/8 | 6/8 -> 5/8 -> 6/8 -> 6/8 | 3/12 -> 3/12 -> 3/12 -> 3/12 | 0.85 s -> 2.44 s -> 2.48 s -> 2.36 s | 1.08 s -> 3.41 s -> 3.37 s -> 3.28 s | no -> no -> no -> no |
| tr | 6/8 -> 6/8 -> 6/8 -> 7/8 | 5/8 -> 5/8 -> 6/8 -> 7/8 | 1/12 -> 1/12 -> 1/12 -> 2/12 | 0.94 s -> 2.43 s -> 2.17 s -> 2.42 s | 1.23 s -> 3.59 s -> 3.60 s -> 3.55 s | no -> no -> no -> no |
| ru | 7/8 -> 7/8 -> 8/8 -> 8/8 | 7/8 -> 7/8 -> 8/8 -> 8/8 | 1/12 -> 1/12 -> 1/12 -> 3/12 | 0.83 s -> 2.17 s -> 2.50 s -> 2.35 s | 1.16 s -> 2.75 s -> 3.28 s -> 3.19 s | no -> no -> no -> no |
| vi | 5/8 -> 5/8 -> 6/8 -> 8/8 | 5/8 -> 5/8 -> 5/8 -> 7/8 | 2/12 -> 2/12 -> 2/12 -> 2/12 | 0.67 s -> 2.04 s -> 2.35 s -> 2.12 s | 1.04 s -> 2.97 s -> 3.03 s -> 2.70 s | no -> no -> no -> no |
| ja | 7/8 -> 7/8 -> 8/8 -> 8/8 | 6/8 -> 6/8 -> 8/8 -> 8/8 | 2/12 -> 2/12 -> 1/12 -> 2/12 | 0.65 s -> 2.26 s -> 2.09 s -> 2.33 s | 1.07 s -> 3.15 s -> 3.20 s -> 2.77 s | no -> no -> no -> no |
| ko | 7/8 -> 7/8 -> 7/8 -> 6/8 | 6/8 -> 5/8 -> 7/8 -> 6/8 | 2/12 -> 2/12 -> 0/12 -> 2/12 | 0.78 s -> 2.24 s -> 2.44 s -> 2.25 s | 0.98 s -> 3.13 s -> 3.16 s -> 3.01 s | no -> no -> no -> no |
| zh-CN | 7/8 -> 7/8 -> 7/8 -> 7/8 | 6/8 -> 6/8 -> 7/8 -> 7/8 | 2/12 -> 2/12 -> 1/12 -> 2/12 | 0.56 s -> 1.94 s -> 2.38 s -> 2.08 s | 1.00 s -> 2.45 s -> 2.83 s -> 3.18 s | no -> no -> no -> no |
| zh-TW | 7/8 -> 7/8 -> 7/8 -> 8/8 | 7/8 -> 7/8 -> 6/8 -> 7/8 | 1/12 -> 1/12 -> 2/12 -> 3/12 | 0.56 s -> 2.04 s -> 2.41 s -> 2.40 s | 1.06 s -> 2.56 s -> 2.67 s -> 2.52 s | no -> no -> no -> no |
| all | 141/168 -> 141/168 -> 155/168 -> 158/168 | 122/168 -> 118/168 -> 142/168 -> 143/168 | 34/252 -> 36/252 -> 39/252 -> 55/252 | 0.93 s -> 2.33 s -> 2.24 s -> 2.33 s | 1.31 s -> 3.27 s -> 3.18 s -> 3.14 s | no -> no -> no -> no |

## Qwen3 8B Q4_K_M, chain rules-first: per language (old -> base -> r1 -> r2)

| lang | right tool | right args | wrong action | median | p90 | meets both (>= 90%, < 2%) |
|---|---|---|---|---|---|---|
| en | 22/24 -> 22/24 -> 22/24 -> 22/24 | 21/24 -> 20/24 -> 22/24 -> 22/24 | 1/36 -> 1/36 -> 1/36 -> 3/36 | 0.46 s -> 0.94 s -> 0.91 s -> 0.95 s | 1.29 s -> 2.69 s -> 2.34 s -> 2.98 s | no -> no -> no -> no |
| es | 17/24 -> 17/24 -> 19/24 -> 19/24 | 15/24 -> 15/24 -> 17/24 -> 16/24 | 5/36 -> 6/36 -> 9/36 -> 11/36 | 0.89 s -> 2.01 s -> 1.92 s -> 1.97 s | 1.44 s -> 3.25 s -> 3.49 s -> 3.02 s | no -> no -> no -> no |
| de | 20/24 -> 20/24 -> 22/24 -> 22/24 | 17/24 -> 17/24 -> 20/24 -> 20/24 | 3/36 -> 3/36 -> 5/36 -> 5/36 | 0.93 s -> 2.11 s -> 2.13 s -> 2.04 s | 1.33 s -> 3.18 s -> 2.89 s -> 3.01 s | no -> no -> no -> no |
| fr | 8/8 -> 8/8 -> 8/8 -> 8/8 | 7/8 -> 7/8 -> 7/8 -> 7/8 | 0/12 -> 0/12 -> 0/12 -> 1/12 | 0.90 s -> 2.00 s -> 2.39 s -> 1.98 s | 1.21 s -> 3.31 s -> 3.39 s -> 2.50 s | yes -> yes -> yes -> no |
| it | 7/8 -> 7/8 -> 7/8 -> 7/8 | 6/8 -> 6/8 -> 7/8 -> 7/8 | 0/12 -> 0/12 -> 0/12 -> 0/12 | 0.86 s -> 2.00 s -> 1.41 s -> 1.94 s | 1.23 s -> 2.97 s -> 2.87 s -> 3.54 s | no -> no -> no -> no |
| pt-BR | 8/8 -> 8/8 -> 8/8 -> 8/8 | 7/8 -> 7/8 -> 7/8 -> 7/8 | 0/12 -> 0/12 -> 0/12 -> 2/12 | 0.87 s -> 2.45 s -> 1.49 s -> 2.26 s | 1.28 s -> 3.27 s -> 1.97 s -> 2.92 s | yes -> yes -> yes -> no |
| nl | 5/8 -> 5/8 -> 6/8 -> 6/8 | 4/8 -> 4/8 -> 5/8 -> 5/8 | 0/12 -> 0/12 -> 3/12 -> 3/12 | 0.44 s -> 0.97 s -> 1.16 s -> 1.97 s | 1.06 s -> 2.81 s -> 1.84 s -> 2.95 s | no -> no -> no -> no |
| pl | 6/8 -> 6/8 -> 7/8 -> 7/8 | 5/8 -> 4/8 -> 5/8 -> 5/8 | 2/12 -> 2/12 -> 2/12 -> 2/12 | 0.74 s -> 2.22 s -> 1.87 s -> 1.91 s | 1.05 s -> 3.41 s -> 3.10 s -> 2.72 s | no -> no -> no -> no |
| tr | 4/8 -> 4/8 -> 4/8 -> 5/8 | 3/8 -> 3/8 -> 4/8 -> 5/8 | 1/12 -> 1/12 -> 1/12 -> 2/12 | 0.57 s -> 1.87 s -> 1.86 s -> 2.10 s | 1.23 s -> 3.59 s -> 3.60 s -> 3.55 s | no -> no -> no -> no |
| ru | 7/8 -> 7/8 -> 8/8 -> 8/8 | 7/8 -> 7/8 -> 8/8 -> 8/8 | 0/12 -> 0/12 -> 0/12 -> 2/12 | 0.78 s -> 1.98 s -> 2.27 s -> 2.34 s | 1.16 s -> 2.75 s -> 3.19 s -> 2.71 s | no -> no -> yes -> no |
| vi | 4/8 -> 4/8 -> 5/8 -> 7/8 | 4/8 -> 4/8 -> 4/8 -> 6/8 | 2/12 -> 2/12 -> 2/12 -> 2/12 | 0.56 s -> 1.96 s -> 2.20 s -> 1.98 s | 0.95 s -> 2.40 s -> 2.76 s -> 2.52 s | no -> no -> no -> no |
| ja | 7/8 -> 7/8 -> 7/8 -> 7/8 | 6/8 -> 6/8 -> 7/8 -> 7/8 | 0/12 -> 0/12 -> 0/12 -> 0/12 | 0.49 s -> 1.90 s -> 1.96 s -> 1.97 s | 1.07 s -> 3.15 s -> 3.20 s -> 2.52 s | no -> no -> no -> no |
| ko | 5/8 -> 5/8 -> 5/8 -> 5/8 | 5/8 -> 4/8 -> 5/8 -> 5/8 | 1/12 -> 1/12 -> 0/12 -> 1/12 | 0.41 s -> 1.08 s -> 1.01 s -> 1.07 s | 0.97 s -> 3.13 s -> 3.16 s -> 3.01 s | no -> no -> no -> no |
| zh-CN | 7/8 -> 7/8 -> 7/8 -> 7/8 | 6/8 -> 6/8 -> 7/8 -> 7/8 | 2/12 -> 2/12 -> 1/12 -> 2/12 | 0.48 s -> 1.91 s -> 2.09 s -> 2.07 s | 1.00 s -> 2.45 s -> 2.83 s -> 3.18 s | no -> no -> no -> no |
| zh-TW | 7/8 -> 7/8 -> 7/8 -> 8/8 | 7/8 -> 7/8 -> 6/8 -> 7/8 | 1/12 -> 1/12 -> 2/12 -> 3/12 | 0.56 s -> 2.04 s -> 2.41 s -> 2.40 s | 1.06 s -> 2.56 s -> 2.67 s -> 2.52 s | no -> no -> no -> no |
| all | 134/168 -> 134/168 -> 142/168 -> 146/168 | 120/168 -> 117/168 -> 131/168 -> 134/168 | 18/252 -> 19/252 -> 26/252 -> 39/252 | 0.76 s -> 1.97 s -> 1.97 s -> 2.06 s | 1.23 s -> 3.09 s -> 2.89 s -> 2.98 s | no -> no -> no -> no |

## Qwen3 4B Q4_K_M, r2, model alone: the common errors


1. **expected yours, chose call set_setting** (21)
   - en-029 "mute my mic": expected `yours`, chose `call set_setting {"key":"bandVolume","value":"0"}`
   - en-030 "turn grading off for me": expected `yours`, chose `call set_setting {"key":"countIn","value":"off"}`
   - en-031 "wipe all my old takes": expected `yours`, chose `call set_setting {"key":"countIn","value":"off"}`
2. **expected call set_tempo, chose call set_tempo** (11)
   - es-010 "ponlo a 90": expected `call set_tempo {"bpm":90}`, chose `call set_tempo {"direction":"slower"}`
   - es-015 "subele a 120 porfa": expected `call set_tempo {"bpm":120}`, chose `call set_tempo {"direction":"faster"}`
   - de-010 "stell auf 90 bpm": expected `call set_tempo {"bpm":90}`, chose `call set_tempo {"direction":"slower"}`
3. **expected which, chose call go_to** (11)
   - en-028 "open the rhythm path": expected `which`, chose `call go_to {"screen":"paths"}`
   - es-025 "abre acordes": expected `which`, chose `call go_to {"screen":"paths"}`
   - es-026 "quiero ver lo de sweep": expected `which`, chose `call go_to {"screen":"paths"}`
4. **expected none, chose call set_setting** (11)
   - en-036 "slower": expected `none`, chose `call set_setting {"key":"countIn","value":"off"}`
   - es-033 "mas lento": expected `none`, chose `call set_setting {"key":"countIn","value":"on"}`
   - fr-012 "plus vite": expected `none`, chose `call set_setting {"key":"countIn","value":"on"}`
5. **expected call swap_part, chose call swap_part** (6)
   - en-004 "make part 3 harder": expected `call swap_part {"at":3,"choice":"harder"}`, chose `call swap_part {"at":3,"choice":"harder","to":"different"}`
   - en-005 "swap the first one for something diferent": expected `call swap_part {"at":1,"choice":"different"}`, chose `call swap_part {"at":1,"choice":"different","to":"Blues in A"}`
   - es-004 "la parte 3 me queda facil, ponme algo mas dificil": expected `call swap_part {"at":3,"choice":"harder"}`, chose `call swap_part {"at":3,"choice":"harder","to":"different"}`
6. **expected call open_path, chose call go_to** (5)
   - es-007 "abre fundamentos del ritmo": expected `call open_path {"path":"fundamentos del ritmo"}`, chose `call go_to {"screen":"paths"}`
   - de-008 "oeffne mal blues und pentatonik": expected `call open_path {"path":"blues und pentatonik"}`, chose `call go_to {"screen":"paths"}`
   - fr-004 "ouvre moi le tapping": expected `call open_path {"path":"tapping"}`, chose `call go_to {"screen":"paths"}`
7. **expected which, chose call open_path** (5)
   - en-025 "open picking": expected `which`, chose `call open_path {"path":"Alternate Picking"}`
   - fr-009 "ouvre accords": expected `which`, chose `call open_path {"path":"Les accords d'une tonalité"}`
   - nl-009 "open picking": expected `which`, chose `call open_path {"path":"Alternate picking"}`
8. **expected call click_subdivision, chose call set_setting** (4)
   - en-014 "make the click play three to a beat": expected `call click_subdivision {"subdivision":3}`, chose `call set_setting {"key":"countIn","value":"on"}`
   - es-011 "quiero que haga tresillos, 3 clics por pulso": expected `call click_subdivision {"subdivision":3}`, chose `call set_setting {"key":"countIn","value":"on"}`
   - it-006 "dividi il battito in 3": expected `call click_subdivision {"subdivision":3}`, chose `call set_setting {"key":"countIn","value":"on"}`
9. **expected call play_exercise, chose call play_exercise** (4)
   - en-011 "play the low E riff": expected `call play_exercise {"exercise":"the low E riff"}`, chose `call play_exercise {"exercise":"low E riff","path":"Alternate Picking","bpm":80}`
   - es-023 "toca el riff en mi grave": expected `call play_exercise {"exercise":"el riff en mi grave"}`, chose `call play_exercise {"exercise":"riff","path":"Fundamentos del ritmo","bpm":60}`
   - de-023 "spiel jetzt das riff auf der tiefen e-saite": expected `call play_exercise {"exercise":"das riff auf der tiefen e-saite"}`, chose `call play_exercise {"exercise":"riff","path":"Rhythmus-Grundlagen","bpm":80}`
10. **expected call set_setting, chose call set_setting** (3)
   - es-018 "activa la cuenta atrás": expected `call set_setting {"key":"countIn","value":"on"}`, chose `call set_setting {"key":"countIn","value":"off"}`
   - de-021 "einzähler an": expected `call set_setting {"key":"countIn","value":"on"}`, chose `call set_setting {"key":"countIn","value":"off"}`
   - vi-008 "đổi qua tab đi, nhìn runway chóng mặt": expected `call set_setting {"key":"practiceView","value":"tab"}`, chose `call set_setting {"key":"practiceView","value":"runway"}`


## Qwen3 4B Q4_K_M, r2, chain rules-first: the common errors


1. **expected yours, chose call set_setting** (13)
   - en-030 "turn grading off for me": expected `yours`, chose `call set_setting {"key":"countIn","value":"off"}`
   - es-029 "no me califiques hoy, solo quiero tocar": expected `yours`, chose `call set_setting {"key":"coachVoice","value":"off"}`
   - es-030 "grábame mientras toco": expected `yours`, chose `call set_setting {"key":"bandVolume","value":"auto"}`
2. **expected none, chose call set_setting** (11)
   - en-036 "slower": expected `none`, chose `call set_setting {"key":"countIn","value":"off"}`
   - es-033 "mas lento": expected `none`, chose `call set_setting {"key":"countIn","value":"on"}`
   - fr-012 "plus vite": expected `none`, chose `call set_setting {"key":"countIn","value":"on"}`
3. **expected call set_tempo, chose call set_tempo** (10)
   - es-010 "ponlo a 90": expected `call set_tempo {"bpm":90}`, chose `call set_tempo {"direction":"slower"}`
   - es-015 "subele a 120 porfa": expected `call set_tempo {"bpm":120}`, chose `call set_tempo {"direction":"faster"}`
   - de-010 "stell auf 90 bpm": expected `call set_tempo {"bpm":90}`, chose `call set_tempo {"direction":"slower"}`
4. **expected which, chose call go_to** (4)
   - es-026 "quiero ver lo de sweep": expected `which`, chose `call go_to {"screen":"paths"}`
   - es-028 "quiero ver los arpegios": expected `which`, chose `call go_to {"screen":"paths"}`
   - zh-CN-009 "打开节奏那个": expected `which`, chose `call go_to {"screen":"paths"}`
5. **expected call swap_part, chose call swap_part** (4)
   - en-005 "swap the first one for something diferent": expected `call swap_part {"at":1,"choice":"different"}`, chose `call swap_part {"at":1,"choice":"different","to":"Blues in A"}`
   - es-004 "la parte 3 me queda facil, ponme algo mas dificil": expected `call swap_part {"at":3,"choice":"harder"}`, chose `call swap_part {"at":3,"choice":"harder","to":"different"}`
   - de-004 "teil 3 bitte schwerer": expected `call swap_part {"at":3,"choice":"harder"}`, chose `call swap_part {"at":3,"choice":"harder","to":"none"}`
6. **expected call click_subdivision, chose call set_setting** (3)
   - es-011 "quiero que haga tresillos, 3 clics por pulso": expected `call click_subdivision {"subdivision":3}`, chose `call set_setting {"key":"countIn","value":"on"}`
   - it-006 "dividi il battito in 3": expected `call click_subdivision {"subdivision":3}`, chose `call set_setting {"key":"countIn","value":"on"}`
   - pl-003 "daj po 3 kliki na uderzenie": expected `call click_subdivision {"subdivision":3}`, chose `call set_setting {"key":"countIn","value":"on"}`
7. **expected call follow_path, chose call start_today** (2)
   - es-006 "quiero empezar con legato": expected `call follow_path {"path":"legato"}`, chose `call start_today {}`
   - zh-TW-005 "想開始練經典搖滾": expected `call follow_path {"path":"經典搖滾"}`, chose `call start_today {"at":1}`
8. **expected call set_goal, chose call set_goal** (2)
   - es-022 "mi meta es tocar Master of Puppets a toda velocidad para junio": expected `call set_goal {"text":"tocar Master of Puppets a toda velocidad para junio"}`, chose `call set_goal {"text":"mi meta es tocar Master of Puppets a toda velocidad para jun"}`
   - de-022 "mein ziel: master of puppets bis juni im vollen tempo spielen": expected `call set_goal {"text":"master of puppets bis juni im vollen tempo spielen"}`, chose `call set_goal {"text":"mein ziel: master of puppets bis juni im vollen tempo spieln"}`
9. **expected none, chose call go_to** (2)
   - ru-011 "спасибо, на сегодня все, пойду пиво пить": expected `none`, chose `call go_to {"screen":"today"}`
   - zh-TW-011 "好啦謝謝，我先去吃飯": expected `none`, chose `call go_to {"screen":"settings"}`
10. **expected which, chose call show_scale** (2)
   - es-027 "ábreme dos octavas": expected `which`, chose `call show_scale {"root":"Ab","scale":"major","position":"open"}`
   - de-028 "zeig mir sweeps": expected `which`, chose `call show_scale {"root":"A","scale":"blues","position":"open"}`


## Qwen3 8B Q4_K_M, r2, model alone: the common errors


1. **expected yours, chose call set_setting** (17)
   - en-029 "mute my mic": expected `yours`, chose `call set_setting {"key":"bandVolume","value":"0"}`
   - en-030 "turn grading off for me": expected `yours`, chose `call set_setting {"key":"coachSuggestions","value":"off"}`
   - es-029 "no me califiques hoy, solo quiero tocar": expected `yours`, chose `call set_setting {"key":"coachSuggestions","value":"off"}`
2. **expected which, chose call open_path** (12)
   - en-025 "open picking": expected `which`, chose `call open_path {"path":"Alternate Picking"}`
   - en-028 "open the rhythm path": expected `which`, chose `call open_path {"path":"Rhythm Foundations"}`
   - es-025 "abre acordes": expected `which`, chose `call open_path {"path":"Acordes de una tonalidad"}`
3. **expected none, chose call set_setting** (11)
   - en-036 "slower": expected `none`, chose `call set_setting {"key":"countIn","value":"on"}`
   - es-033 "mas lento": expected `none`, chose `call set_setting {"key":"bandVolume","value":"auto"}`
   - fr-012 "plus vite": expected `none`, chose `call set_setting {"key":"countIn","value":"off"}`
4. **expected call set_tempo, chose call set_tempo** (7)
   - es-015 "subele a 120 porfa": expected `call set_tempo {"bpm":120}`, chose `call set_tempo {"direction":"faster"}`
   - fr-002 "passe a 85 stp": expected `call set_tempo {"bpm":85}`, chose `call set_tempo {"direction":"slower"}`
   - pt-BR-002 "sobe pra 110": expected `call set_tempo {"bpm":110}`, chose `call set_tempo {"direction":"faster"}`
5. **expected none, chose yours** (7)
   - en-033 "slower": expected `none`, chose `yours`
   - es-034 "abre los ajustes": expected `none`, chose `yours`
   - de-033 "oeffne mal die pfade": expected `none`, chose `yours`
6. **expected which, chose call go_to** (3)
   - es-026 "quiero ver lo de sweep": expected `which`, chose `call go_to {"screen":"paths"}`
   - es-028 "quiero ver los arpegios": expected `which`, chose `call go_to {"screen":"paths"}`
   - de-027 "ich will legato machen": expected `which`, chose `call go_to {"screen":"paths"}`
7. **expected which, chose call open_step** (3)
   - en-026 "open the chug step": expected `which`, chose `call open_step {"path":"Blues and Pentatonics","step":3}`
   - de-025 "mach akkorde auf": expected `which`, chose `call open_step {"path":"Akkorde in einer Tonart","step":1}`
   - pl-009 "otworz akordy": expected `which`, chose `call open_step {"path":"Akordy w tonacji","step":1}`
8. **expected call find_edge, chose call find_edge** (3)
   - en-012 "find my edge on four fingers one string": expected `call find_edge {"exercise":"four fingers one string"}`, chose `call find_edge {"exercise":"Even eighths on one string","path":"Alternate Picking"}`
   - es-017 "encuentra mi limite en ráfagas que crecen": expected `call find_edge {"exercise":"ráfagas que crecen","path":"púa alterna"}`, chose `call find_edge {"exercise":"ráfagas que crecen","path":"Fundamentos del ritmo"}`
   - de-024 "find meine grenze bei vier finger eine saite": expected `call find_edge {"exercise":"vier finger eine saite"}`, chose `call find_edge {"exercise":"vier finger eine saite","path":"Blues und Pentatonik"}`
9. **expected call play_exercise, chose call play_exercise** (3)
   - es-023 "toca el riff en mi grave": expected `call play_exercise {"exercise":"el riff en mi grave"}`, chose `call play_exercise {"exercise":"riff","path":"Blues y pentatónicas"}`
   - de-023 "spiel jetzt das riff auf der tiefen e-saite": expected `call play_exercise {"exercise":"das riff auf der tiefen e-saite"}`, chose `call play_exercise {"exercise":"riff","path":"Blues und Pentatonik"}`
   - pl-006 "chce pograc melodie na strunie D": expected `call play_exercise {"exercise":"melodia na strunie D","path":"alternate picking"}`, chose `call play_exercise {"exercise":"melodie","path":"Alternate picking"}`
10. **expected which, chose call show_scale** (2)
   - es-027 "ábreme dos octavas": expected `which`, chose `call show_scale {"root":"A","scale":"major","position":"rootOn6"}`
   - de-028 "zeig mir sweeps": expected `which`, chose `call show_scale {"root":"A","scale":"major","position":"open"}`


## Qwen3 8B Q4_K_M, r2, chain rules-first: the common errors


1. **expected none, chose call set_setting** (11)
   - en-036 "slower": expected `none`, chose `call set_setting {"key":"countIn","value":"on"}`
   - es-033 "mas lento": expected `none`, chose `call set_setting {"key":"bandVolume","value":"auto"}`
   - fr-012 "plus vite": expected `none`, chose `call set_setting {"key":"countIn","value":"off"}`
2. **expected yours, chose call set_setting** (9)
   - en-030 "turn grading off for me": expected `yours`, chose `call set_setting {"key":"coachSuggestions","value":"off"}`
   - es-029 "no me califiques hoy, solo quiero tocar": expected `yours`, chose `call set_setting {"key":"coachSuggestions","value":"off"}`
   - es-030 "grábame mientras toco": expected `yours`, chose `call set_setting {"key":"countIn","value":"on"}`
3. **expected call set_tempo, chose call set_tempo** (7)
   - es-015 "subele a 120 porfa": expected `call set_tempo {"bpm":120}`, chose `call set_tempo {"direction":"faster"}`
   - fr-002 "passe a 85 stp": expected `call set_tempo {"bpm":85}`, chose `call set_tempo {"direction":"slower"}`
   - pt-BR-002 "sobe pra 110": expected `call set_tempo {"bpm":110}`, chose `call set_tempo {"direction":"faster"}`
4. **expected none, chose yours** (7)
   - en-033 "slower": expected `none`, chose `yours`
   - es-034 "abre los ajustes": expected `none`, chose `yours`
   - de-033 "oeffne mal die pfade": expected `none`, chose `yours`
5. **expected which, chose call go_to** (3)
   - es-026 "quiero ver lo de sweep": expected `which`, chose `call go_to {"screen":"paths"}`
   - es-028 "quiero ver los arpegios": expected `which`, chose `call go_to {"screen":"paths"}`
   - de-027 "ich will legato machen": expected `which`, chose `call go_to {"screen":"paths"}`
6. **expected which, chose call open_path** (3)
   - de-026 "oeffne mal den moll-blues": expected `which`, chose `call open_path {"path":"Blues und Pentatonik"}`
   - zh-CN-009 "打开节奏那个": expected `which`, chose `call open_path {"path":"节奏基础"}`
   - zh-TW-009 "開節奏那個": expected `which`, chose `call open_path {"path":"節奏基礎"}`
7. **expected which, chose call show_scale** (2)
   - es-027 "ábreme dos octavas": expected `which`, chose `call show_scale {"root":"A","scale":"major","position":"rootOn6"}`
   - de-028 "zeig mir sweeps": expected `which`, chose `call show_scale {"root":"A","scale":"major","position":"open"}`
8. **expected yours, chose call load_jam** (2)
   - de-030 "nimm mich bitte auf waehrend ich spiele": expected `yours`, chose `call load_jam {"jam":"Blues in A"}`
   - nl-010 "neem mij even op dan luister ik later terug": expected `yours`, chose `call load_jam {"jam":"Blues in A"}`
9. **expected call start_today, chose call swap_part** (2)
   - es-003 "empieza por la segunda parte": expected `call start_today {"at":2}`, chose `call swap_part {"at":2,"choice":"different"}`
   - it-008 "parti direttamente dalla seconda parte": expected `call start_today {"at":2}`, chose `call swap_part {"at":1,"choice":"different","to":"2"}`
10. **expected call load_jam, chose which** (2)
   - nl-005 "laad blues in a ff": expected `call load_jam {"jam":"blues in A"}`, chose `which`
   - ko-003 "slow rock 불러와": expected `call load_jam {"jam":"slow rock"}`, chose `which`


