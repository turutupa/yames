# Tool eval: chain rules-first (4b shipped)

Chain rules-first: the rules (router, then Path search) answer; the model only where they said none. The model's answer used on 190 items. Outcomes from 4b shipped. A turn the rules answered counts 0 ms.

| lang | n | right | right tool | right args | wrong actions | asked (which) | yours | none | cards | no answer | median ms | p90 ms | prefix cached |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en | 36 | 67% | 20/24 (83%) | 16/24 (67%) | 0 (0%) | 3/4 | 3/4 | 2/4 | 0/0 | 0 | 389 | 751 | 21/21 |
| es | 36 | 58% | 19/24 (79%) | 14/24 (58%) | 6 (17%) | 1/4 | 3/4 | 3/4 | 0/0 | 0 | 434 | 810 | 26/26 |
| de | 36 | 61% | 20/24 (83%) | 16/24 (67%) | 4 (11%) | 1/4 | 1/4 | 4/4 | 0/0 | 1 (unread 1) | 454 | 835 | 30/30 |
| fr | 12 | 50% | 6/8 (75%) | 3/8 (38%) | 2 (17%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 522 | 844 | 9/9 |
| it | 12 | 75% | 7/8 (88%) | 6/8 (75%) | 0 (0%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 507 | 801 | 8/8 |
| pt-BR | 12 | 58% | 7/8 (88%) | 4/8 (50%) | 0 (0%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 608 | 1142 | 11/11 |
| nl | 12 | 50% | 5/8 (63%) | 4/8 (50%) | 1 (8%) | 1/1 | 0/1 | 1/2 | 0/0 | 0 | 486 | 921 | 8/8 |
| pl | 12 | 50% | 4/8 (50%) | 4/8 (50%) | 2 (17%) | 1/1 | 0/1 | 1/2 | 0/0 | 0 | 266 | 630 | 8/8 |
| tr | 12 | 42% | 5/8 (63%) | 3/8 (38%) | 1 (8%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 624 | 962 | 9/9 |
| ru | 12 | 50% | 7/8 (88%) | 5/8 (63%) | 2 (17%) | 1/1 | 0/1 | 0/2 | 0/0 | 1 (truncated 1) | 592 | 927 | 10/10 |
| vi | 12 | 50% | 5/8 (63%) | 5/8 (63%) | 4 (33%) | 1/1 | 0/1 | 0/2 | 0/0 | 0 | 595 | 781 | 11/11 |
| ja | 12 | 75% | 7/8 (88%) | 6/8 (75%) | 0 (0%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 494 | 823 | 8/8 |
| ko | 12 | 67% | 5/8 (63%) | 4/8 (50%) | 0 (0%) | 1/1 | 1/1 | 2/2 | 0/0 | 0 | 297 | 784 | 8/8 |
| zh-CN | 12 | 42% | 6/8 (75%) | 4/8 (50%) | 2 (17%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 581 | 888 | 11/11 |
| zh-TW | 12 | 50% | 7/8 (88%) | 5/8 (63%) | 3 (25%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 349 | 558 | 12/12 |
| all | 252 | 58% | 130/168 (77%) | 99/168 (59%) | 27 (11%) | 14/24 | 13/24 | 20/36 | 0/0 | 2 (unread 1, truncated 1) | 508 | 835 | 190/190 |

## Tool eval: chain rules-first (4b shipped): the most common errors

1. **expected call set_tempo, chose call set_tempo** (15)
   - en-017 "slow it down a bit man": expected `call set_tempo {"direction":"slower"}`, chose `call set_tempo {"bpm":90,"direction":"slower"}`
   - en-020 "bit quicker": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm":100,"direction":"faster"}`
   - es-015 "subele a 120 porfa": expected `call set_tempo {"bpm":120}`, chose `call set_tempo {"bpm":120,"direction":"faster"}`
2. **expected none, chose call set_setting** (12)
   - en-034 "lol rough day at work, hands are fried": expected `none`, chose `call set_setting {"key":"practiceView","value":"focus"}`
   - en-036 "slower": expected `none`, chose `call set_setting {"key":"coachVoice","value":"slower"}`
   - es-033 "mas lento": expected `none`, chose `call set_setting {"key":"theme","value":"dark"}`
3. **expected yours, chose call set_setting** (9)
   - en-030 "turn grading off for me": expected `yours`, chose `call set_setting {"key":"practiceView","value":"none"}`
   - es-029 "no me califiques hoy, solo quiero tocar": expected `yours`, chose `call set_setting {"key":"coachVoice","value":"none"}`
   - de-030 "nimm mich bitte auf waehrend ich spiele": expected `yours`, chose `call set_setting {"key":"practiceView","value":"on"}`
4. **expected call show_scale, chose call show_scale** (4)
   - es-021 "muéstrame la pentatónica menor de la": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor","position":"rootOn5"}`
   - fr-007 "montre moi la pentatonique mineure en la sur le manche": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor","position":"rootOn5"}`
   - ru-008 "покажи Am пентатонику": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"phrygian","position":"open"}`
5. **expected which, chose call show_scale** (4)
   - es-026 "quiero ver lo de sweep": expected `which`, chose `call show_scale {"root":"A","scale":"naturalMinor","position":"rootOn5"}`
   - es-027 "ábreme dos octavas": expected `which`, chose `call show_scale {"root":"A","scale":"major","position":"open"}`
   - es-028 "quiero ver los arpegios": expected `which`, chose `call show_scale {"root":"A","scale":"augmentedScale","position":"open"}`
6. **expected call swap_part, chose call swap_part** (4)
   - en-005 "swap the first one for something diferent": expected `call swap_part {"at":1,"choice":"different"}`, chose `call swap_part {"at":1,"choice":"different","to":"2"}`
   - es-004 "la parte 3 me queda facil, ponme algo mas dificil": expected `call swap_part {"at":3,"choice":"harder"}`, chose `call swap_part {"at":3,"choice":"harder","to":"none"}`
   - de-004 "teil 3 bitte schwerer": expected `call swap_part {"at":3,"choice":"harder"}`, chose `call swap_part {"at":3,"choice":"harder","to":"none"}`
7. **expected call follow_path, chose call set_focus** (3)
   - en-006 "i wanna follow tapping": expected `call follow_path {"path":"tapping"}`, chose `call set_focus {"path":"Tapping"}`
   - fr-008 "j'aimerais suivre le legato aussi": expected `call follow_path {"path":"legato"}`, chose `call set_focus {"path":"Bases du rythme"}`
   - zh-CN-005 "我想学点放克，把放克线条加进来吧": expected `call follow_path {"path":"放克线条"}`, chose `call set_focus {"path":"放克"}`
8. **expected call click_subdivision, chose call set_setting** (3)
   - es-011 "quiero que haga tresillos, 3 clics por pulso": expected `call click_subdivision {"subdivision":3}`, chose `call set_setting {"key":"countIn","value":"3"}`
   - it-006 "dividi il battito in 3": expected `call click_subdivision {"subdivision":3}`, chose `call set_setting {"key":"countIn","value":"3"}`
   - pl-003 "daj po 3 kliki na uderzenie": expected `call click_subdivision {"subdivision":3}`, chose `call set_setting {"key":"countIn","value":"3"}`
9. **expected call set_setting, chose call set_setting** (3)
   - fr-005 "mets l'appli en portugais du bresil": expected `call set_setting {"key":"language","value":"pt-BR"}`, chose `call set_setting {"key":"language","value":"portuguese"}`
   - tr-004 "dili ingilizceye cevir": expected `call set_setting {"key":"language","value":"en"}`, chose `call set_setting {"key":"language","value":"english"}`
   - zh-TW-004 "教練不要一直給我建議了": expected `call set_setting {"key":"coachSuggestions","value":"off"}`, chose `call set_setting {"key":"coachSuggestions","value":"none"}`
10. **expected call follow_path, chose call set_goal** (2)
   - pl-008 "zacznij obserwować tapping": expected `call follow_path {"path":"tapping"}`, chose `call set_goal {"text":"obserwować tapping"}`
   - zh-TW-005 "想開始練經典搖滾": expected `call follow_path {"path":"經典搖滾"}`, chose `call set_goal {"text":"開始練習經典搖滾"}`
