# Tool eval: chain rules-first (4b plain)

Chain rules-first: the rules (router, then Path search) answer; the model only where they said none. The model's answer used on 190 items. Outcomes from 4b plain. A turn the rules answered counts 0 ms.

| lang | n | right | right tool | right args | wrong actions | asked (which) | yours | none | cards | no answer | median ms | p90 ms | prefix cached |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en | 36 | 72% | 20/24 (83%) | 16/24 (67%) | 1 (3%) | 4/4 | 3/4 | 3/4 | 0/0 | 0 | 253 | 735 | 21/21 |
| es | 36 | 53% | 17/24 (71%) | 12/24 (50%) | 8 (22%) | 1/4 | 3/4 | 3/4 | 0/0 | 0 | 488 | 817 | 26/26 |
| de | 36 | 61% | 20/24 (83%) | 16/24 (67%) | 4 (11%) | 0/4 | 2/4 | 4/4 | 0/0 | 0 | 566 | 1128 | 30/30 |
| fr | 12 | 50% | 7/8 (88%) | 3/8 (38%) | 1 (8%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 550 | 860 | 9/9 |
| it | 12 | 67% | 6/8 (75%) | 5/8 (63%) | 0 (0%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 517 | 641 | 8/8 |
| pt-BR | 12 | 58% | 7/8 (88%) | 4/8 (50%) | 1 (8%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 637 | 1313 | 11/11 |
| nl | 12 | 58% | 5/8 (63%) | 4/8 (50%) | 1 (8%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 317 | 926 | 8/8 |
| pl | 12 | 67% | 5/8 (63%) | 5/8 (63%) | 2 (17%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 312 | 595 | 8/8 |
| tr | 12 | 42% | 6/8 (75%) | 3/8 (38%) | 1 (8%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 638 | 952 | 9/9 |
| ru | 12 | 58% | 6/8 (75%) | 5/8 (63%) | 1 (8%) | 1/1 | 0/1 | 1/2 | 0/0 | 0 | 615 | 748 | 10/10 |
| vi | 12 | 42% | 4/8 (50%) | 4/8 (50%) | 5 (42%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 332 | 433 | 11/11 |
| ja | 12 | 67% | 6/8 (75%) | 5/8 (63%) | 1 (8%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 269 | 484 | 8/8 |
| ko | 12 | 67% | 5/8 (63%) | 4/8 (50%) | 0 (0%) | 1/1 | 1/1 | 2/2 | 0/0 | 0 | 217 | 532 | 8/8 |
| zh-CN | 12 | 50% | 7/8 (88%) | 5/8 (63%) | 3 (25%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 301 | 822 | 11/11 |
| zh-TW | 12 | 42% | 6/8 (75%) | 4/8 (50%) | 4 (33%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 328 | 554 | 12/12 |
| all | 252 | 58% | 127/168 (76%) | 95/168 (57%) | 33 (13%) | 13/24 | 16/24 | 23/36 | 0/0 | 0 | 433 | 817 | 190/190 |

## Tool eval: chain rules-first (4b plain): the most common errors

1. **expected call set_tempo, chose call set_tempo** (14)
   - en-017 "slow it down a bit man": expected `call set_tempo {"direction":"slower"}`, chose `call set_tempo {"bpm":90,"direction":"slower"}`
   - en-020 "bit quicker": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm":100,"direction":"faster"}`
   - es-019 "un poquito mas lento": expected `call set_tempo {"direction":"slower"}`, chose `call set_tempo {"bpm":70,"direction":"slower"}`
2. **expected none, chose call set_setting** (11)
   - en-036 "slower": expected `none`, chose `call set_setting {"key":"theme","value":"dark"}`
   - es-033 "mas lento": expected `none`, chose `call set_setting {"key":"theme","value":"dark"}`
   - fr-012 "plus vite": expected `none`, chose `call set_setting {"key":"coachVoice","value":"none"}`
3. **expected yours, chose call set_setting** (6)
   - en-030 "turn grading off for me": expected `yours`, chose `call set_setting {"key":"coachVoice","value":"none"}`
   - es-029 "no me califiques hoy, solo quiero tocar": expected `yours`, chose `call set_setting {"key":"coachVoice","value":"none"}`
   - de-031 "loesch alle meine takes": expected `yours`, chose `call set_setting {"key":"countIn","value":"none"}`
4. **expected call follow_path, chose call set_goal** (4)
   - en-006 "i wanna follow tapping": expected `call follow_path {"path":"tapping"}`, chose `call set_goal {"text":"follow tapping"}`
   - pl-008 "zacznij obserwować tapping": expected `call follow_path {"path":"tapping"}`, chose `call set_goal {"text":"obserwować tapping"}`
   - zh-CN-005 "我想学点放克，把放克线条加进来吧": expected `call follow_path {"path":"放克线条"}`, chose `call set_goal {"text":"学习放克线条"}`
5. **expected call set_setting, chose call set_setting** (4)
   - es-018 "activa la cuenta atrás": expected `call set_setting {"key":"countIn","value":"on"}`, chose `call set_setting {"key":"countIn","value":"true"}`
   - fr-005 "mets l'appli en portugais du bresil": expected `call set_setting {"key":"language","value":"pt-BR"}`, chose `call set_setting {"key":"language","value":"portuguese"}`
   - tr-004 "dili ingilizceye cevir": expected `call set_setting {"key":"language","value":"en"}`, chose `call set_setting {"key":"language","value":"english"}`
6. **expected call swap_part, chose call swap_part** (4)
   - en-005 "swap the first one for something diferent": expected `call swap_part {"at":1,"choice":"different"}`, chose `call swap_part {"at":1,"choice":"different","to":"2"}`
   - es-004 "la parte 3 me queda facil, ponme algo mas dificil": expected `call swap_part {"at":3,"choice":"harder"}`, chose `call swap_part {"at":3,"choice":"harder","to":"different"}`
   - de-004 "teil 3 bitte schwerer": expected `call swap_part {"at":3,"choice":"harder"}`, chose `call swap_part {"at":3,"choice":"harder","to":"3"}`
7. **expected call show_scale, chose call show_scale** (3)
   - es-021 "muéstrame la pentatónica menor de la": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor","position":"rootOn5"}`
   - fr-007 "montre moi la pentatonique mineure en la sur le manche": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor","position":"rootOn5"}`
   - zh-CN-007 "顺便给我看下 A 小调五声音阶": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor"}`
8. **expected call start_today, chose call go_to** (3)
   - es-003 "empieza por la segunda parte": expected `call start_today {"at":2}`, chose `call go_to {"screen":"today"}`
   - vi-001 "bat dau tu phan 2 di": expected `call start_today {"at":2}`, chose `call go_to {"screen":"today"}`
   - ja-002 "2つ目のパートから始めたいです": expected `call start_today {"at":2}`, chose `call go_to {"screen":"today"}`
9. **expected which, chose call show_scale** (3)
   - es-027 "ábreme dos octavas": expected `which`, chose `call show_scale {"root":"A","scale":"major","position":"open"}`
   - es-028 "quiero ver los arpegios": expected `which`, chose `call show_scale {"root":"A","scale":"augmentedScale","position":"open"}`
   - de-028 "zeig mir sweeps": expected `which`, chose `call show_scale {"root":"A","scale":"naturalMinor","position":"rootOn5"}`
10. **expected call follow_path, chose call follow_path** (3)
   - en-007 "follow funk lines but start at the intermediate level": expected `call follow_path {"path":"funk lines","level":"intermediate"}`, chose `call follow_path {"path":"Funk 90","level":"intermediate"}`
   - de-006 "ich will legato auch folgen": expected `call follow_path {"path":"legato"}`, chose `call follow_path {"path":"Rhythmus-Grundlagen","level":"legato"}`
   - fr-008 "j'aimerais suivre le legato aussi": expected `call follow_path {"path":"legato"}`, chose `call follow_path {"path":"Bases du rythme","level":"legato"}`
