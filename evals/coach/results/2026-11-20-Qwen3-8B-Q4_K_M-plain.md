# Tool eval: Qwen3-8B-Q4_K_M.gguf (grammar situation, prompt names)

Grammar: the tools possible in the situation. Prompt: tool names and arguments only (no descriptions). Only `answered` is an answer.

| lang | n | right | right tool | right args | wrong actions | asked (which) | yours | none | cards | no answer | median ms | p90 ms | prefix cached |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en | 36 | 50% | 22/24 (92%) | 15/24 (63%) | 9 (25%) | 1/4 | 0/4 | 2/4 | 0/0 | 0 | 959 | 1221 | 35/36 |
| es | 36 | 50% | 20/24 (83%) | 14/24 (58%) | 7 (19%) | 0/4 | 2/4 | 2/4 | 0/0 | 0 | 816 | 1155 | 36/36 |
| de | 36 | 64% | 20/24 (83%) | 17/24 (71%) | 5 (14%) | 0/4 | 3/4 | 3/4 | 0/0 | 0 | 510 | 1143 | 36/36 |
| fr | 12 | 50% | 8/8 (100%) | 5/8 (63%) | 1 (8%) | 0/1 | 1/1 | 0/2 | 0/0 | 0 | 1074 | 1298 | 12/12 |
| it | 12 | 42% | 6/8 (75%) | 5/8 (63%) | 3 (25%) | 0/1 | 0/1 | 0/2 | 0/0 | 0 | 932 | 1167 | 12/12 |
| pt-BR | 12 | 75% | 8/8 (100%) | 7/8 (88%) | 1 (8%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 1064 | 1258 | 12/12 |
| nl | 12 | 33% | 6/8 (75%) | 4/8 (50%) | 2 (17%) | 0/1 | 0/1 | 0/2 | 0/0 | 0 | 936 | 1246 | 12/12 |
| pl | 12 | 42% | 6/8 (75%) | 5/8 (63%) | 1 (8%) | 0/1 | 0/1 | 0/2 | 0/0 | 0 | 909 | 1536 | 12/12 |
| tr | 12 | 50% | 6/8 (75%) | 5/8 (63%) | 1 (8%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 1034 | 1464 | 12/12 |
| ru | 12 | 67% | 6/8 (75%) | 6/8 (75%) | 2 (17%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 880 | 1101 | 12/12 |
| vi | 12 | 42% | 4/8 (50%) | 3/8 (38%) | 4 (33%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 727 | 1181 | 12/12 |
| ja | 12 | 67% | 6/8 (75%) | 5/8 (63%) | 1 (8%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 845 | 1087 | 12/12 |
| ko | 12 | 58% | 7/8 (88%) | 5/8 (63%) | 1 (8%) | 1/1 | 0/1 | 1/2 | 0/0 | 0 | 890 | 1175 | 12/12 |
| zh-CN | 12 | 67% | 8/8 (100%) | 6/8 (75%) | 2 (17%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 897 | 1432 | 12/12 |
| zh-TW | 12 | 58% | 6/8 (75%) | 5/8 (63%) | 2 (17%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 837 | 1083 | 12/12 |
| all | 252 | 54% | 139/168 (83%) | 107/168 (64%) | 42 (17%) | 3/24 | 12/24 | 15/36 | 0/0 | 0 | 890 | 1221 | 251/252 |

## Tool eval: Qwen3-8B-Q4_K_M.gguf (grammar situation, prompt names): the most common errors

1. **expected call set_tempo, chose call set_tempo** (17)
   - en-017 "slow it down a bit man": expected `call set_tempo {"direction":"slower"}`, chose `call set_tempo {"bpm":90,"direction":"slower"}`
   - en-020 "bit quicker": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm":90,"direction":"faster"}`
   - es-013 "mas rapido": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm":120,"direction":"faster"}`
2. **expected none, chose call set_setting** (11)
   - en-036 "slower": expected `none`, chose `call set_setting {"key":"coachSuggestions","value":"slower"}`
   - es-033 "mas lento": expected `none`, chose `call set_setting {"key":"bandVolume","value":"0.5"}`
   - fr-012 "plus vite": expected `none`, chose `call set_setting {"key":"coachSuggestions","value":"true"}`
3. **expected none, chose yours** (9)
   - en-033 "slower": expected `none`, chose `yours`
   - es-034 "abre los ajustes": expected `none`, chose `yours`
   - de-033 "oeffne mal die pfade": expected `none`, chose `yours`
4. **expected which, chose call show_chord** (8)
   - es-025 "abre acordes": expected `which`, chose `call show_chord {"chord":"Am7"}`
   - es-028 "quiero ver los arpegios": expected `which`, chose `call show_chord {"chord":"Am7"}`
   - de-025 "mach akkorde auf": expected `which`, chose `call show_chord {"chord":"Am7"}`
5. **expected yours, chose call set_setting** (8)
   - en-030 "turn grading off for me": expected `yours`, chose `call set_setting {"key":"practiceView","value":"none"}`
   - en-031 "wipe all my old takes": expected `yours`, chose `call set_setting {"key":"practiceView","value":"none"}`
   - es-029 "no me califiques hoy, solo quiero tocar": expected `yours`, chose `call set_setting {"key":"practiceView","value":"none"}`
6. **expected which, chose call open_path** (6)
   - en-025 "open picking": expected `which`, chose `call open_path {"path":"open picking"}`
   - en-028 "open the rhythm path": expected `which`, chose `call open_path {"path":"Rhythm Foundations"}`
   - de-026 "oeffne mal den moll-blues": expected `which`, chose `call open_path {"path":"moll-blues"}`
7. **expected call start_today, chose call go_to** (5)
   - en-002 "ok lets get going, start from the second part pls": expected `call start_today {"at":2}`, chose `call go_to {"screen":"today"}`
   - es-003 "empieza por la segunda parte": expected `call start_today {"at":2}`, chose `call go_to {"screen":"today"}`
   - de-003 "ich steig bei teil 2 ein": expected `call start_today {"at":2}`, chose `call go_to {"screen":"paths"}`
8. **expected call play_exercise, chose call play_exercise** (4)
   - en-011 "play the low E riff": expected `call play_exercise {"exercise":"the low E riff"}`, chose `call play_exercise {"exercise":"low E riff","path":"Alternate Picking","bpm":80}`
   - es-023 "toca el riff en mi grave": expected `call play_exercise {"exercise":"el riff en mi grave"}`, chose `call play_exercise {"exercise":"riff","path":"mi grave"}`
   - de-023 "spiel jetzt das riff auf der tiefen e-saite": expected `call play_exercise {"exercise":"das riff auf der tiefen e-saite"}`, chose `call play_exercise {"exercise":"riff","path":"Blues in A","bpm":80}`
9. **expected call follow_path, chose call follow_path** (3)
   - en-006 "i wanna follow tapping": expected `call follow_path {"path":"tapping"}`, chose `call follow_path {"path":"Tapping","level":"beginner"}`
   - en-007 "follow funk lines but start at the intermediate level": expected `call follow_path {"path":"funk lines","level":"intermediate"}`, chose `call follow_path {"path":"Funk 90","level":"intermediate"}`
   - fr-008 "j'aimerais suivre le legato aussi": expected `call follow_path {"path":"legato"}`, chose `call follow_path {"path":"Legato","level":"?"}`
10. **expected call set_setting, chose none** (3)
   - es-016 "quiero el tema ceniza": expected `call set_setting {"key":"theme","value":"ash"}`, chose `none`
   - nl-006 "thema naar velvet graag": expected `call set_setting {"key":"theme","value":"velvet"}`, chose `none`
   - ru-005 "поставь тему айвори, глаза болят от темной": expected `call set_setting {"key":"theme","value":"ivory"}`, chose `none`
