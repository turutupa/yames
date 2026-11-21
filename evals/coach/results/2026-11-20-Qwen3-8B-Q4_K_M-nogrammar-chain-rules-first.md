# Tool eval: chain rules-first (8b nogrammar)

Chain rules-first: the rules (router, then Path search) answer; the model only where they said none. The model's answer used on 190 items. Outcomes from 8b nogrammar. A turn the rules answered counts 0 ms.

| lang | n | right | right tool | right args | wrong actions | asked (which) | yours | none | cards | no answer | median ms | p90 ms | prefix cached |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en | 36 | 78% | 22/24 (92%) | 21/24 (88%) | 0 (0%) | 2/4 | 3/4 | 2/4 | 0/0 | 0 | 447 | 1019 | 21/21 |
| es | 36 | 58% | 17/24 (71%) | 15/24 (63%) | 4 (11%) | 1/4 | 3/4 | 2/4 | 0/0 | 0 | 891 | 1477 | 26/26 |
| de | 36 | 64% | 20/24 (83%) | 17/24 (71%) | 3 (8%) | 0/4 | 3/4 | 3/4 | 0/0 | 0 | 825 | 1222 | 30/30 |
| fr | 12 | 67% | 8/8 (100%) | 6/8 (75%) | 0 (0%) | 1/1 | 1/1 | 0/2 | 0/0 | 0 | 844 | 1220 | 9/9 |
| it | 12 | 67% | 7/8 (88%) | 6/8 (75%) | 1 (8%) | 1/1 | 1/1 | 0/2 | 0/0 | 0 | 859 | 1203 | 8/8 |
| pt-BR | 12 | 83% | 8/8 (100%) | 7/8 (88%) | 0 (0%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 1005 | 1409 | 11/11 |
| nl | 12 | 42% | 5/8 (63%) | 4/8 (50%) | 0 (0%) | 1/1 | 0/1 | 0/2 | 0/0 | 0 | 390 | 925 | 8/8 |
| pl | 12 | 50% | 6/8 (75%) | 5/8 (63%) | 1 (8%) | 1/1 | 0/1 | 0/2 | 0/0 | 0 | 595 | 1044 | 8/8 |
| tr | 12 | 42% | 4/8 (50%) | 3/8 (38%) | 1 (8%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 722 | 1368 | 9/9 |
| ru | 12 | 75% | 7/8 (88%) | 6/8 (75%) | 0 (0%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 843 | 1104 | 10/10 |
| vi | 12 | 50% | 4/8 (50%) | 4/8 (50%) | 2 (17%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 875 | 1037 | 11/11 |
| ja | 12 | 75% | 7/8 (88%) | 6/8 (75%) | 0 (0%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 782 | 1311 | 8/8 |
| ko | 12 | 50% | 5/8 (63%) | 4/8 (50%) | 1 (8%) | 1/1 | 1/1 | 0/2 | 0/0 | 0 | 802 | 1307 | 8/8 |
| zh-CN | 12 | 58% | 7/8 (88%) | 6/8 (75%) | 2 (17%) | 0/1 | 1/1 | 0/2 | 0/0 | 0 | 800 | 1074 | 11/11 |
| zh-TW | 12 | 75% | 7/8 (88%) | 7/8 (88%) | 1 (8%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 917 | 1092 | 12/12 |
| all | 252 | 63% | 134/168 (80%) | 117/168 (70%) | 16 (6%) | 11/24 | 19/24 | 13/36 | 0/0 | 0 | 802 | 1222 | 190/190 |

## Tool eval: chain rules-first (8b nogrammar): the most common errors

1. **expected none, chose call set_tempo** (13)
   - en-033 "slower": expected `none`, chose `call set_tempo {"direction":"slower"}`
   - en-036 "slower": expected `none`, chose `call set_tempo {"direction":"slower"}`
   - es-033 "mas lento": expected `none`, chose `call set_tempo {"direction":"slower"}`
2. **expected call set_tempo, chose call set_tempo** (9)
   - en-020 "bit quicker": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm":"95","direction":"faster"}`
   - es-019 "un poquito mas lento": expected `call set_tempo {"direction":"slower"}`, chose `call set_tempo {"bpm":"70","direction":"slower"}`
   - de-017 "n bisschen langsamer pls": expected `call set_tempo {"direction":"slower"}`, chose `call set_tempo {"bpm":"72","direction":"slower"}`
3. **expected none, chose yours** (6)
   - fr-011 "merci c'etait cool": expected `none`, chose `yours`
   - it-011 "grazie mille, sei un mito": expected `none`, chose `yours`
   - nl-011 "haha top bedankt joh": expected `none`, chose `yours`
4. **expected yours, chose call set_setting** (4)
   - en-030 "turn grading off for me": expected `yours`, chose `call set_setting {"key":"grading","value":"off"}`
   - es-029 "no me califiques hoy, solo quiero tocar": expected `yours`, chose `call set_setting {"key":"grading","value":"off"}`
   - nl-010 "neem mij even op dan luister ik later terug": expected `yours`, chose `call set_setting {"key":"recording","value":"on"}`
5. **expected call show_scale, chose call show_scale** (3)
   - fr-007 "montre moi la pentatonique mineure en la sur le manche": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"La","scale":"minorPentatonic"}`
   - ru-008 "покажи Am пентатонику": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"minor","position":"open"}`
   - zh-CN-007 "顺便给我看下 A 小调五声音阶": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor"}`
6. **expected call start_today, chose call go_to** (2)
   - es-003 "empieza por la segunda parte": expected `call start_today {"at":2}`, chose `call go_to {"screen":"today"}`
   - de-003 "ich steig bei teil 2 ein": expected `call start_today {"at":2}`, chose `call go_to {"screen":"paths"}`
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
