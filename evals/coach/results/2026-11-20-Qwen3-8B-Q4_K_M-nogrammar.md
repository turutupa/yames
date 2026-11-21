# Tool eval: Qwen3-8B-Q4_K_M.gguf (grammar none, prompt notes)

Grammar: none (the raw answer parsed strictly; anything else is no answer). Prompt: each tool's description (as the app sends it). Only `answered` is an answer.

| lang | n | right | right tool | right args | wrong actions | asked (which) | yours | none | cards | no answer | median ms | p90 ms | prefix cached |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en | 36 | 69% | 23/24 (96%) | 22/24 (92%) | 1 (3%) | 0/4 | 1/4 | 2/4 | 0/0 | 0 | 741 | 1052 | 35/36 |
| es | 36 | 50% | 18/24 (75%) | 14/24 (58%) | 5 (14%) | 0/4 | 2/4 | 2/4 | 0/0 | 0 | 1022 | 1509 | 36/36 |
| de | 36 | 58% | 20/24 (83%) | 16/24 (67%) | 5 (14%) | 0/4 | 2/4 | 3/4 | 0/0 | 0 | 940 | 1228 | 36/36 |
| fr | 12 | 50% | 7/8 (88%) | 5/8 (63%) | 0 (0%) | 0/1 | 1/1 | 0/2 | 0/0 | 0 | 1088 | 1388 | 12/12 |
| it | 12 | 42% | 6/8 (75%) | 5/8 (63%) | 2 (17%) | 0/1 | 0/1 | 0/2 | 0/0 | 0 | 986 | 1378 | 12/12 |
| pt-BR | 12 | 75% | 8/8 (100%) | 7/8 (88%) | 1 (8%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 1059 | 1409 | 12/12 |
| nl | 12 | 33% | 6/8 (75%) | 4/8 (50%) | 0 (0%) | 0/1 | 0/1 | 0/2 | 0/0 | 0 | 725 | 925 | 12/12 |
| pl | 12 | 50% | 7/8 (88%) | 6/8 (75%) | 2 (17%) | 0/1 | 0/1 | 0/2 | 0/0 | 0 | 768 | 1044 | 12/12 |
| tr | 12 | 50% | 6/8 (75%) | 5/8 (63%) | 1 (8%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 815 | 1368 | 12/12 |
| ru | 12 | 67% | 7/8 (88%) | 6/8 (75%) | 1 (8%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 927 | 1110 | 12/12 |
| vi | 12 | 58% | 5/8 (63%) | 5/8 (63%) | 2 (17%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 887 | 1244 | 12/12 |
| ja | 12 | 58% | 7/8 (88%) | 6/8 (75%) | 0 (0%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 934 | 1589 | 12/12 |
| ko | 12 | 42% | 7/8 (88%) | 5/8 (63%) | 1 (8%) | 0/1 | 0/1 | 0/2 | 0/0 | 0 | 1040 | 1307 | 12/12 |
| zh-CN | 12 | 58% | 7/8 (88%) | 6/8 (75%) | 2 (17%) | 0/1 | 1/1 | 0/2 | 0/0 | 0 | 802 | 1302 | 12/12 |
| zh-TW | 12 | 75% | 7/8 (88%) | 7/8 (88%) | 1 (8%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 917 | 1092 | 12/12 |
| all | 252 | 57% | 141/168 (84%) | 119/168 (71%) | 24 (10%) | 0/24 | 11/24 | 13/36 | 0/0 | 0 | 917 | 1311 | 251/252 |

## Tool eval: Qwen3-8B-Q4_K_M.gguf (grammar none, prompt notes): the most common errors

1. **expected none, chose call set_tempo** (13)
   - en-033 "slower": expected `none`, chose `call set_tempo {"direction":"slower"}`
   - en-036 "slower": expected `none`, chose `call set_tempo {"direction":"slower"}`
   - es-033 "mas lento": expected `none`, chose `call set_tempo {"direction":"slower"}`
2. **expected yours, chose call set_setting** (11)
   - en-029 "mute my mic": expected `yours`, chose `call set_setting {"key":"bandVolume","value":0}`
   - en-030 "turn grading off for me": expected `yours`, chose `call set_setting {"key":"grading","value":"off"}`
   - es-029 "no me califiques hoy, solo quiero tocar": expected `yours`, chose `call set_setting {"key":"grading","value":"off"}`
3. **expected call set_tempo, chose call set_tempo** (10)
   - en-020 "bit quicker": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm":"95","direction":"faster"}`
   - es-013 "mas rapido": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm":"100","direction":"faster"}`
   - es-019 "un poquito mas lento": expected `call set_tempo {"direction":"slower"}`, chose `call set_tempo {"bpm":"70","direction":"slower"}`
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
7. **expected call show_scale, chose call show_scale** (4)
   - de-019 "a moll pentatonik anzeigen": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor"}`
   - fr-007 "montre moi la pentatonique mineure en la sur le manche": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"La","scale":"minorPentatonic"}`
   - ru-008 "покажи Am пентатонику": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"minor","position":"open"}`
8. **expected call open_path, chose call open_step** (4)
   - en-008 "open triads": expected `call open_path {"path":"triads"}`, chose `call open_step {"path":"Rhythm Foundations","step":"triads"}`
   - fr-004 "ouvre moi le tapping": expected `call open_path {"path":"tapping"}`, chose `call open_step {"path":"Legato","step":"tapping"}`
   - it-005 "apri tapping": expected `call open_path {"path":"tapping"}`, chose `call open_step {"path":"Alternate picking","step":"tapping"}`
9. **expected which, chose call open_step** (4)
   - en-026 "open the chug step": expected `which`, chose `call open_step {"path":"Rhythm Foundations","step":"chug"}`
   - es-026 "quiero ver lo de sweep": expected `which`, chose `call open_step {"path":"Fundamentos del ritmo","step":"sweep"}`
   - fr-009 "ouvre accords": expected `which`, chose `call open_step {"path":"Bases du rythme","step":"accords"}`
10. **expected call set_setting, chose none** (3)
   - es-018 "activa la cuenta atrás": expected `call set_setting {"key":"countIn","value":"on"}`, chose `none`
   - nl-006 "thema naar velvet graag": expected `call set_setting {"key":"theme","value":"velvet"}`, chose `none`
   - ru-005 "поставь тему айвори, глаза болят от темной": expected `call set_setting {"key":"theme","value":"ivory"}`, chose `none`
