# Tool eval: chain rules-first (8b plain)

Chain rules-first: the rules (router, then Path search) answer; the model only where they said none. The model's answer used on 190 items. Outcomes from 8b plain. A turn the rules answered counts 0 ms.

| lang | n | right | right tool | right args | wrong actions | asked (which) | yours | none | cards | no answer | median ms | p90 ms | prefix cached |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en | 36 | 69% | 21/24 (88%) | 17/24 (71%) | 3 (8%) | 3/4 | 3/4 | 2/4 | 0/0 | 0 | 415 | 1131 | 21/21 |
| es | 36 | 58% | 18/24 (75%) | 15/24 (63%) | 6 (17%) | 1/4 | 3/4 | 2/4 | 0/0 | 0 | 628 | 1155 | 26/26 |
| de | 36 | 69% | 20/24 (83%) | 18/24 (75%) | 3 (8%) | 0/4 | 4/4 | 3/4 | 0/0 | 0 | 470 | 1024 | 30/30 |
| fr | 12 | 58% | 8/8 (100%) | 5/8 (63%) | 0 (0%) | 1/1 | 1/1 | 0/2 | 0/0 | 0 | 1074 | 1298 | 9/9 |
| it | 12 | 58% | 6/8 (75%) | 5/8 (63%) | 1 (8%) | 1/1 | 1/1 | 0/2 | 0/0 | 0 | 840 | 1167 | 8/8 |
| pt-BR | 12 | 83% | 8/8 (100%) | 7/8 (88%) | 0 (0%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 1064 | 1258 | 11/11 |
| nl | 12 | 42% | 5/8 (63%) | 4/8 (50%) | 1 (8%) | 1/1 | 0/1 | 0/2 | 0/0 | 0 | 475 | 1246 | 8/8 |
| pl | 12 | 42% | 5/8 (63%) | 4/8 (50%) | 0 (0%) | 1/1 | 0/1 | 0/2 | 0/0 | 0 | 846 | 1536 | 8/8 |
| tr | 12 | 42% | 4/8 (50%) | 3/8 (38%) | 1 (8%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 815 | 1464 | 9/9 |
| ru | 12 | 75% | 6/8 (75%) | 6/8 (75%) | 1 (8%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 776 | 1101 | 10/10 |
| vi | 12 | 33% | 3/8 (38%) | 2/8 (25%) | 4 (33%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 726 | 970 | 11/11 |
| ja | 12 | 67% | 6/8 (75%) | 5/8 (63%) | 1 (8%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 721 | 1087 | 8/8 |
| ko | 12 | 58% | 5/8 (63%) | 4/8 (50%) | 1 (8%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 467 | 1175 | 8/8 |
| zh-CN | 12 | 67% | 8/8 (100%) | 6/8 (75%) | 2 (17%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 834 | 1432 | 11/11 |
| zh-TW | 12 | 58% | 6/8 (75%) | 5/8 (63%) | 2 (17%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 837 | 1083 | 12/12 |
| all | 252 | 61% | 129/168 (77%) | 106/168 (63%) | 26 (10%) | 12/24 | 20/24 | 15/36 | 0/0 | 0 | 727 | 1199 | 190/190 |

## Tool eval: chain rules-first (8b plain): the most common errors

1. **expected call set_tempo, chose call set_tempo** (16)
   - en-017 "slow it down a bit man": expected `call set_tempo {"direction":"slower"}`, chose `call set_tempo {"bpm":90,"direction":"slower"}`
   - en-020 "bit quicker": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm":90,"direction":"faster"}`
   - es-015 "subele a 120 porfa": expected `call set_tempo {"bpm":120}`, chose `call set_tempo {"bpm":120,"direction":"faster"}`
2. **expected none, chose call set_setting** (11)
   - en-036 "slower": expected `none`, chose `call set_setting {"key":"coachSuggestions","value":"slower"}`
   - es-033 "mas lento": expected `none`, chose `call set_setting {"key":"bandVolume","value":"0.5"}`
   - fr-012 "plus vite": expected `none`, chose `call set_setting {"key":"coachSuggestions","value":"true"}`
3. **expected none, chose yours** (9)
   - en-033 "slower": expected `none`, chose `yours`
   - es-034 "abre los ajustes": expected `none`, chose `yours`
   - de-033 "oeffne mal die pfade": expected `none`, chose `yours`
4. **expected call start_today, chose call go_to** (5)
   - en-002 "ok lets get going, start from the second part pls": expected `call start_today {"at":2}`, chose `call go_to {"screen":"today"}`
   - es-003 "empieza por la segunda parte": expected `call start_today {"at":2}`, chose `call go_to {"screen":"today"}`
   - de-003 "ich steig bei teil 2 ein": expected `call start_today {"at":2}`, chose `call go_to {"screen":"paths"}`
5. **expected call follow_path, chose call follow_path** (3)
   - en-006 "i wanna follow tapping": expected `call follow_path {"path":"tapping"}`, chose `call follow_path {"path":"Tapping","level":"beginner"}`
   - en-007 "follow funk lines but start at the intermediate level": expected `call follow_path {"path":"funk lines","level":"intermediate"}`, chose `call follow_path {"path":"Funk 90","level":"intermediate"}`
   - fr-008 "j'aimerais suivre le legato aussi": expected `call follow_path {"path":"legato"}`, chose `call follow_path {"path":"Legato","level":"?"}`
6. **expected yours, chose call set_setting** (3)
   - en-030 "turn grading off for me": expected `yours`, chose `call set_setting {"key":"practiceView","value":"none"}`
   - es-029 "no me califiques hoy, solo quiero tocar": expected `yours`, chose `call set_setting {"key":"practiceView","value":"none"}`
   - pl-010 "wyłącz ocenianie, nie chcę być oceniany": expected `yours`, chose `call set_setting {"key":"practiceView","value":"none"}`
7. **expected call set_focus, chose call go_to** (2)
   - es-005 "hoy solo quiero pua alterna": expected `call set_focus {"path":"pua alterna"}`, chose `call go_to {"screen":"paths"}`
   - de-005 "plan heute nur aus wechselschlag": expected `call set_focus {"path":"wechselschlag"}`, chose `call go_to {"screen":"paths"}`
8. **expected which, chose call go_to** (2)
   - es-026 "quiero ver lo de sweep": expected `which`, chose `call go_to {"screen":"paths"}`
   - zh-TW-009 "開節奏那個": expected `which`, chose `call go_to {"screen":"beat"}`
9. **expected which, chose call show_chord** (2)
   - es-028 "quiero ver los arpegios": expected `which`, chose `call show_chord {"chord":"Am7"}`
   - tr-009 "akorları aç": expected `which`, chose `call show_chord {"chord":"Am7"}`
10. **expected which, chose call show_scale** (2)
   - es-027 "ábreme dos octavas": expected `which`, chose `call show_scale {"root":"A","scale":"major","position":"open"}`
   - de-028 "zeig mir sweeps": expected `which`, chose `call show_scale {"root":"A","scale":"major","position":"open"}`
