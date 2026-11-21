# Tool eval: chain rules-first (8b shipped)

Chain rules-first: the rules (router, then Path search) answer; the model only where they said none. The model's answer used on 190 items. Outcomes from 8b shipped. A turn the rules answered counts 0 ms.

| lang | n | right | right tool | right args | wrong actions | asked (which) | yours | none | cards | no answer | median ms | p90 ms | prefix cached |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en | 36 | 78% | 22/24 (92%) | 21/24 (88%) | 1 (3%) | 2/4 | 3/4 | 2/4 | 0/0 | 0 | 460 | 1290 | 21/21 |
| es | 36 | 58% | 17/24 (71%) | 15/24 (63%) | 5 (14%) | 1/4 | 3/4 | 2/4 | 0/0 | 0 | 892 | 1441 | 26/26 |
| de | 36 | 64% | 20/24 (83%) | 17/24 (71%) | 3 (8%) | 0/4 | 3/4 | 3/4 | 0/0 | 0 | 929 | 1333 | 30/30 |
| fr | 12 | 75% | 8/8 (100%) | 7/8 (88%) | 0 (0%) | 1/1 | 1/1 | 0/2 | 0/0 | 0 | 904 | 1208 | 9/9 |
| it | 12 | 67% | 7/8 (88%) | 6/8 (75%) | 0 (0%) | 1/1 | 1/1 | 0/2 | 0/0 | 0 | 865 | 1225 | 8/8 |
| pt-BR | 12 | 83% | 8/8 (100%) | 7/8 (88%) | 0 (0%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 874 | 1278 | 11/11 |
| nl | 12 | 42% | 5/8 (63%) | 4/8 (50%) | 0 (0%) | 1/1 | 0/1 | 0/2 | 0/0 | 0 | 442 | 1064 | 8/8 |
| pl | 12 | 50% | 6/8 (75%) | 5/8 (63%) | 2 (17%) | 1/1 | 0/1 | 0/2 | 0/0 | 0 | 739 | 1046 | 8/8 |
| tr | 12 | 42% | 4/8 (50%) | 3/8 (38%) | 1 (8%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 569 | 1232 | 9/9 |
| ru | 12 | 83% | 7/8 (88%) | 7/8 (88%) | 0 (0%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 781 | 1157 | 10/10 |
| vi | 12 | 50% | 4/8 (50%) | 4/8 (50%) | 2 (17%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 556 | 949 | 11/11 |
| ja | 12 | 75% | 7/8 (88%) | 6/8 (75%) | 0 (0%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 486 | 1070 | 8/8 |
| ko | 12 | 58% | 5/8 (63%) | 5/8 (63%) | 1 (8%) | 1/1 | 1/1 | 0/2 | 0/0 | 0 | 405 | 973 | 8/8 |
| zh-CN | 12 | 58% | 7/8 (88%) | 6/8 (75%) | 2 (17%) | 0/1 | 1/1 | 0/2 | 0/0 | 0 | 477 | 996 | 11/11 |
| zh-TW | 12 | 75% | 7/8 (88%) | 7/8 (88%) | 1 (8%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 563 | 1062 | 12/12 |
| all | 252 | 65% | 134/168 (80%) | 120/168 (71%) | 18 (7%) | 11/24 | 19/24 | 13/36 | 0/0 | 0 | 757 | 1232 | 190/190 |

## Tool eval: chain rules-first (8b shipped): the most common errors

1. **expected none, chose call set_setting** (11)
   - en-036 "slower": expected `none`, chose `call set_setting {"key":"coachSuggestions","value":"slower"}`
   - es-033 "mas lento": expected `none`, chose `call set_setting {"key":"coachSuggestions","value":"true"}`
   - fr-012 "plus vite": expected `none`, chose `call set_setting {"key":"coachSuggestions","value":"true"}`
2. **expected none, chose yours** (11)
   - en-033 "slower": expected `none`, chose `yours`
   - es-034 "abre los ajustes": expected `none`, chose `yours`
   - de-033 "oeffne mal die pfade": expected `none`, chose `yours`
3. **expected call set_tempo, chose call set_tempo** (8)
   - en-020 "bit quicker": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm":95,"direction":"faster"}`
   - es-019 "un poquito mas lento": expected `call set_tempo {"direction":"slower"}`, chose `call set_tempo {"bpm":70,"direction":"slower"}`
   - de-017 "n bisschen langsamer pls": expected `call set_tempo {"direction":"slower"}`, chose `call set_tempo {"bpm":75,"direction":"slower"}`
4. **expected yours, chose call set_setting** (4)
   - en-030 "turn grading off for me": expected `yours`, chose `call set_setting {"key":"practiceView","value":"noGrading"}`
   - es-029 "no me califiques hoy, solo quiero tocar": expected `yours`, chose `call set_setting {"key":"practiceView","value":"no grading"}`
   - nl-010 "neem mij even op dan luister ik later terug": expected `yours`, chose `call set_setting {"key":"countIn","value":"true"}`
5. **expected call start_today, chose call go_to** (2)
   - es-003 "empieza por la segunda parte": expected `call start_today {"at":2}`, chose `call go_to {"screen":"today"}`
   - de-003 "ich steig bei teil 2 ein": expected `call start_today {"at":2}`, chose `call go_to {"screen":"paths"}`
6. **expected which, chose call open_step** (2)
   - en-026 "open the chug step": expected `which`, chose `call open_step {"path":"Rhythm Foundations","step":3}`
   - es-026 "quiero ver lo de sweep": expected `which`, chose `call open_step {"path":"Fundamentos del ritmo","step":3}`
7. **expected which, chose call show_chord** (2)
   - es-028 "quiero ver los arpegios": expected `which`, chose `call show_chord {"chord":"Am7"}`
   - tr-009 "akorları aç": expected `which`, chose `call show_chord {"chord":"Am7"}`
8. **expected which, chose call show_scale** (2)
   - es-027 "ábreme dos octavas": expected `which`, chose `call show_scale {"root":"A","scale":"major","position":"rootOn6"}`
   - de-028 "zeig mir sweeps": expected `which`, chose `call show_scale {"root":"A","scale":"major","position":"open"}`
9. **expected which, chose call open_path** (2)
   - de-026 "oeffne mal den moll-blues": expected `which`, chose `call open_path {"path":"moll-blues"}`
   - zh-CN-009 "打开节奏那个": expected `which`, chose `call open_path {"path":"节奏基础"}`
10. **expected call load_jam, chose which** (2)
   - nl-005 "laad blues in a ff": expected `call load_jam {"jam":"blues in A"}`, chose `which`
   - ko-003 "slow rock 불러와": expected `call load_jam {"jam":"slow rock"}`, chose `which`
