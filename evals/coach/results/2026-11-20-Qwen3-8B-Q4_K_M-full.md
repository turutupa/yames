# Tool eval: Qwen3-8B-Q4_K_M.gguf (grammar full, prompt notes)

Grammar: every player tool. Prompt: each tool's description (as the app sends it). Only `answered` is an answer.

| lang | n | right | right tool | right args | wrong actions | asked (which) | yours | none | cards | no answer | median ms | p90 ms | prefix cached |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en | 36 | 69% | 23/24 (96%) | 22/24 (92%) | 4 (11%) | 0/4 | 1/4 | 2/4 | 0/0 | 0 | 1048 | 1414 | 35/36 |
| es | 36 | 50% | 18/24 (75%) | 14/24 (58%) | 6 (17%) | 0/4 | 2/4 | 2/4 | 0/0 | 0 | 992 | 1479 | 36/36 |
| de | 36 | 58% | 20/24 (83%) | 16/24 (67%) | 5 (14%) | 0/4 | 2/4 | 3/4 | 0/0 | 0 | 1004 | 1300 | 36/36 |
| fr | 12 | 58% | 7/8 (88%) | 6/8 (75%) | 2 (17%) | 0/1 | 1/1 | 0/2 | 0/0 | 0 | 929 | 1290 | 12/12 |
| it | 12 | 42% | 6/8 (75%) | 5/8 (63%) | 2 (17%) | 0/1 | 0/1 | 0/2 | 0/0 | 0 | 905 | 1379 | 12/12 |
| pt-BR | 12 | 75% | 8/8 (100%) | 7/8 (88%) | 1 (8%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 987 | 1388 | 12/12 |
| nl | 12 | 33% | 6/8 (75%) | 4/8 (50%) | 0 (0%) | 0/1 | 0/1 | 0/2 | 0/0 | 0 | 838 | 1193 | 12/12 |
| pl | 12 | 50% | 7/8 (88%) | 6/8 (75%) | 3 (25%) | 0/1 | 0/1 | 0/2 | 0/0 | 0 | 824 | 994 | 12/12 |
| tr | 12 | 50% | 6/8 (75%) | 5/8 (63%) | 1 (8%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 938 | 1485 | 12/12 |
| ru | 12 | 75% | 7/8 (88%) | 7/8 (88%) | 1 (8%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 977 | 1097 | 12/12 |
| vi | 12 | 58% | 5/8 (63%) | 5/8 (63%) | 2 (17%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 928 | 1096 | 12/12 |
| ja | 12 | 58% | 7/8 (88%) | 6/8 (75%) | 2 (17%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 980 | 1390 | 12/12 |
| ko | 12 | 50% | 7/8 (88%) | 6/8 (75%) | 2 (17%) | 0/1 | 0/1 | 0/2 | 0/0 | 0 | 936 | 1048 | 12/12 |
| zh-CN | 12 | 58% | 7/8 (88%) | 6/8 (75%) | 2 (17%) | 0/1 | 1/1 | 0/2 | 0/0 | 0 | 846 | 1060 | 12/12 |
| zh-TW | 12 | 75% | 7/8 (88%) | 7/8 (88%) | 1 (8%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 864 | 1020 | 12/12 |
| all | 252 | 58% | 141/168 (84%) | 122/168 (73%) | 34 (13%) | 0/24 | 11/24 | 13/36 | 0/0 | 0 | 965 | 1337 | 251/252 |

## Tool eval: Qwen3-8B-Q4_K_M.gguf (grammar full, prompt notes): the most common errors

1. **expected none, chose call set_tempo** (13)
   - en-033 "slower": expected `none`, chose `call set_tempo {"direction":"slower"}`
   - en-036 "slower": expected `none`, chose `call set_tempo {"direction":"slower"}`
   - es-033 "mas lento": expected `none`, chose `call set_tempo {"direction":"slower"}`
2. **expected yours, chose call set_setting** (11)
   - en-029 "mute my mic": expected `yours`, chose `call set_setting {"key":"bandVolume","value":"0"}`
   - en-030 "turn grading off for me": expected `yours`, chose `call set_setting {"key":"practiceView","value":"noGrading"}`
   - es-029 "no me califiques hoy, solo quiero tocar": expected `yours`, chose `call set_setting {"key":"practiceView","value":"no grading"}`
3. **expected call set_tempo, chose call set_tempo** (9)
   - en-020 "bit quicker": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm":95,"direction":"faster"}`
   - es-013 "mas rapido": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm":120,"direction":"faster"}`
   - es-019 "un poquito mas lento": expected `call set_tempo {"direction":"slower"}`, chose `call set_tempo {"bpm":70,"direction":"slower"}`
4. **expected which, chose call show_chord** (7)
   - es-025 "abre acordes": expected `which`, chose `call show_chord {"chord":"Am7"}`
   - es-028 "quiero ver los arpegios": expected `which`, chose `call show_chord {"chord":"Am7"}`
   - de-025 "mach akkorde auf": expected `which`, chose `call show_chord {"chord":"Am7"}`
5. **expected which, chose call open_path** (6)
   - en-025 "open picking": expected `which`, chose `call open_path {"path":"open picking"}`
   - en-028 "open the rhythm path": expected `which`, chose `call open_path {"path":"Rhythm Foundations"}`
   - de-026 "oeffne mal den moll-blues": expected `which`, chose `call open_path {"path":"moll-blues"}`
6. **expected none, chose yours** (6)
   - fr-011 "merci c'etait cool": expected `none`, chose `yours`
   - it-011 "grazie mille, sei un mito": expected `none`, chose `yours`
   - nl-011 "haha top bedankt joh": expected `none`, chose `yours`
7. **expected call open_path, chose call open_step** (4)
   - en-008 "open triads": expected `call open_path {"path":"triads"}`, chose `call open_step {"path":"Rhythm Foundations","step":3}`
   - fr-004 "ouvre moi le tapping": expected `call open_path {"path":"tapping"}`, chose `call open_step {"path":"Legato","step":1}`
   - it-005 "apri tapping": expected `call open_path {"path":"tapping"}`, chose `call open_step {"path":"Alternate picking","step":1}`
8. **expected which, chose call open_step** (4)
   - en-026 "open the chug step": expected `which`, chose `call open_step {"path":"Rhythm Foundations","step":3}`
   - es-026 "quiero ver lo de sweep": expected `which`, chose `call open_step {"path":"Fundamentos del ritmo","step":3}`
   - fr-009 "ouvre accords": expected `which`, chose `call open_step {"path":"Bases du rythme","step":1}`
9. **expected call set_setting, chose none** (3)
   - es-018 "activa la cuenta atrás": expected `call set_setting {"key":"countIn","value":"on"}`, chose `none`
   - nl-006 "thema naar velvet graag": expected `call set_setting {"key":"theme","value":"velvet"}`, chose `none`
   - ru-005 "поставь тему айвори, глаза болят от темной": expected `call set_setting {"key":"theme","value":"ivory"}`, chose `none`
10. **expected call show_scale, chose call show_scale** (2)
   - de-019 "a moll pentatonik anzeigen": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor"}`
   - zh-CN-007 "顺便给我看下 A 小调五声音阶": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor"}`
