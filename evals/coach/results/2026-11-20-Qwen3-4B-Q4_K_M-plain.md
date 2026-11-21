# Tool eval: Qwen3-4B-Q4_K_M.gguf (grammar situation, prompt names)

Grammar: the tools possible in the situation. Prompt: tool names and arguments only (no descriptions). Only `answered` is an answer.

| lang | n | right | right tool | right args | wrong actions | asked (which) | yours | none | cards | no answer | median ms | p90 ms | prefix cached |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en | 36 | 47% | 20/24 (83%) | 12/24 (50%) | 4 (11%) | 2/4 | 0/4 | 3/4 | 0/0 | 0 | 652 | 876 | 35/36 |
| es | 36 | 36% | 16/24 (67%) | 9/24 (38%) | 12 (33%) | 0/4 | 1/4 | 3/4 | 0/0 | 0 | 574 | 868 | 36/36 |
| de | 36 | 56% | 21/24 (88%) | 15/24 (63%) | 5 (14%) | 0/4 | 1/4 | 4/4 | 0/0 | 0 | 620 | 1128 | 36/36 |
| fr | 12 | 33% | 7/8 (88%) | 2/8 (25%) | 3 (25%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 552 | 860 | 12/12 |
| it | 12 | 42% | 5/8 (63%) | 4/8 (50%) | 1 (8%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 604 | 1002 | 12/12 |
| pt-BR | 12 | 50% | 7/8 (88%) | 4/8 (50%) | 2 (17%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 637 | 1313 | 12/12 |
| nl | 12 | 67% | 7/8 (88%) | 6/8 (75%) | 1 (8%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 608 | 926 | 12/12 |
| pl | 12 | 67% | 6/8 (75%) | 6/8 (75%) | 3 (25%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 539 | 595 | 12/12 |
| tr | 12 | 42% | 8/8 (100%) | 4/8 (50%) | 1 (8%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 728 | 952 | 12/12 |
| ru | 12 | 50% | 6/8 (75%) | 5/8 (63%) | 2 (17%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 617 | 748 | 12/12 |
| vi | 12 | 50% | 5/8 (63%) | 5/8 (63%) | 5 (42%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 366 | 433 | 12/12 |
| ja | 12 | 58% | 7/8 (88%) | 6/8 (75%) | 2 (17%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 329 | 573 | 12/12 |
| ko | 12 | 58% | 7/8 (88%) | 5/8 (63%) | 1 (8%) | 0/1 | 0/1 | 2/2 | 0/0 | 0 | 372 | 600 | 12/12 |
| zh-CN | 12 | 50% | 7/8 (88%) | 5/8 (63%) | 3 (25%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 319 | 822 | 12/12 |
| zh-TW | 12 | 42% | 6/8 (75%) | 4/8 (50%) | 4 (33%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 328 | 554 | 12/12 |
| all | 252 | 49% | 135/168 (80%) | 92/168 (55%) | 49 (19%) | 2/24 | 6/24 | 23/36 | 0/0 | 0 | 563 | 868 | 251/252 |

## Tool eval: Qwen3-4B-Q4_K_M.gguf (grammar situation, prompt names): the most common errors

1. **expected call set_tempo, chose call set_tempo** (17)
   - en-013 "faster": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm":120,"direction":"faster"}`
   - en-017 "slow it down a bit man": expected `call set_tempo {"direction":"slower"}`, chose `call set_tempo {"bpm":90,"direction":"slower"}`
   - en-020 "bit quicker": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm":100,"direction":"faster"}`
2. **expected yours, chose call set_setting** (14)
   - en-029 "mute my mic": expected `yours`, chose `call set_setting {"key":"coachVoice","value":"none"}`
   - en-030 "turn grading off for me": expected `yours`, chose `call set_setting {"key":"coachVoice","value":"none"}`
   - en-031 "wipe all my old takes": expected `yours`, chose `call set_setting {"key":"countIn","value":"none"}`
3. **expected none, chose call set_setting** (11)
   - en-036 "slower": expected `none`, chose `call set_setting {"key":"theme","value":"dark"}`
   - es-033 "mas lento": expected `none`, chose `call set_setting {"key":"theme","value":"dark"}`
   - fr-012 "plus vite": expected `none`, chose `call set_setting {"key":"coachVoice","value":"none"}`
4. **expected call set_setting, chose call set_setting** (6)
   - es-018 "activa la cuenta atrás": expected `call set_setting {"key":"countIn","value":"on"}`, chose `call set_setting {"key":"countIn","value":"true"}`
   - de-021 "einzähler an": expected `call set_setting {"key":"countIn","value":"on"}`, chose `call set_setting {"key":"countIn","value":"none"}`
   - fr-005 "mets l'appli en portugais du bresil": expected `call set_setting {"key":"language","value":"pt-BR"}`, chose `call set_setting {"key":"language","value":"portuguese"}`
5. **expected which, chose call go_to** (5)
   - en-028 "open the rhythm path": expected `which`, chose `call go_to {"screen":"paths"}`
   - ja-009 "ピッキング開いて": expected `which`, chose `call go_to {"screen":"paths"}`
   - ko-009 "피킹 열어줘": expected `which`, chose `call go_to {"screen":"paths"}`
6. **expected call swap_part, chose call swap_part** (5)
   - en-005 "swap the first one for something diferent": expected `call swap_part {"at":1,"choice":"different"}`, chose `call swap_part {"at":1,"choice":"different","to":"2"}`
   - es-004 "la parte 3 me queda facil, ponme algo mas dificil": expected `call swap_part {"at":3,"choice":"harder"}`, chose `call swap_part {"at":3,"choice":"harder","to":"different"}`
   - de-004 "teil 3 bitte schwerer": expected `call swap_part {"at":3,"choice":"harder"}`, chose `call swap_part {"at":3,"choice":"harder","to":"3"}`
7. **expected call follow_path, chose call set_goal** (4)
   - en-006 "i wanna follow tapping": expected `call follow_path {"path":"tapping"}`, chose `call set_goal {"text":"follow tapping"}`
   - pl-008 "zacznij obserwować tapping": expected `call follow_path {"path":"tapping"}`, chose `call set_goal {"text":"obserwować tapping"}`
   - zh-CN-005 "我想学点放克，把放克线条加进来吧": expected `call follow_path {"path":"放克线条"}`, chose `call set_goal {"text":"学习放克线条"}`
8. **expected which, chose call open_path** (4)
   - en-025 "open picking": expected `which`, chose `call open_path {"path":"open picking"}`
   - de-026 "oeffne mal den moll-blues": expected `which`, chose `call open_path {"path":"Moll-Blues"}`
   - it-009 "apri il picking": expected `which`, chose `call open_path {"path":"Alternate picking"}`
9. **expected call show_scale, chose call show_scale** (3)
   - es-021 "muéstrame la pentatónica menor de la": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor","position":"rootOn5"}`
   - fr-007 "montre moi la pentatonique mineure en la sur le manche": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor","position":"rootOn5"}`
   - zh-CN-007 "顺便给我看下 A 小调五声音阶": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor"}`
10. **expected call start_today, chose call go_to** (3)
   - es-003 "empieza por la segunda parte": expected `call start_today {"at":2}`, chose `call go_to {"screen":"today"}`
   - vi-001 "bat dau tu phan 2 di": expected `call start_today {"at":2}`, chose `call go_to {"screen":"today"}`
   - ja-002 "2つ目のパートから始めたいです": expected `call start_today {"at":2}`, chose `call go_to {"screen":"today"}`
