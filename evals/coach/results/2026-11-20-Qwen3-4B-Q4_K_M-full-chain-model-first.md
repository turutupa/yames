# Tool eval: chain model-first (4b full)

Chain model-first: the model answers; the rules only where it said none or gave no answer. The model's answer used on 233 items. Outcomes from 4b full. 

| lang | n | right | right tool | right args | wrong actions | asked (which) | yours | none | cards | no answer | median ms | p90 ms | prefix cached |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en | 36 | 44% | 21/24 (88%) | 14/24 (58%) | 2 (6%) | 1/4 | 0/4 | 1/4 | 0/0 | 0 | 692 | 1015 | 35/36 |
| es | 36 | 42% | 19/24 (79%) | 12/24 (50%) | 7 (19%) | 0/4 | 1/4 | 2/4 | 0/0 | 0 | 659 | 1064 | 36/36 |
| de | 36 | 53% | 21/24 (88%) | 15/24 (63%) | 6 (17%) | 1/4 | 0/4 | 3/4 | 0/0 | 0 | 695 | 1029 | 36/36 |
| fr | 12 | 25% | 5/8 (63%) | 2/8 (25%) | 3 (25%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 724 | 829 | 12/12 |
| it | 12 | 50% | 6/8 (75%) | 5/8 (63%) | 1 (8%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 556 | 707 | 12/12 |
| pt-BR | 12 | 50% | 7/8 (88%) | 4/8 (50%) | 1 (8%) | 0/1 | 1/1 | 1/2 | 0/0 | 0 | 690 | 1168 | 12/12 |
| nl | 12 | 58% | 7/8 (88%) | 6/8 (75%) | 1 (8%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 619 | 905 | 12/12 |
| pl | 12 | 50% | 5/8 (63%) | 5/8 (63%) | 2 (17%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 567 | 765 | 12/12 |
| tr | 12 | 42% | 7/8 (88%) | 4/8 (50%) | 1 (8%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 706 | 1111 | 12/12 |
| ru | 12 | 42% | 7/8 (88%) | 5/8 (63%) | 2 (17%) | 0/1 | 0/1 | 0/2 | 0/0 | 0 | 612 | 913 | 12/12 |
| vi | 12 | 58% | 6/8 (75%) | 6/8 (75%) | 4 (33%) | 1/1 | 0/1 | 0/2 | 0/0 | 0 | 573 | 782 | 12/12 |
| ja | 12 | 67% | 8/8 (100%) | 7/8 (88%) | 2 (17%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 546 | 767 | 12/12 |
| ko | 12 | 58% | 7/8 (88%) | 5/8 (63%) | 0 (0%) | 1/1 | 0/1 | 1/2 | 0/0 | 0 | 603 | 857 | 12/12 |
| zh-CN | 12 | 42% | 6/8 (75%) | 4/8 (50%) | 2 (17%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 607 | 983 | 12/12 |
| zh-TW | 12 | 42% | 7/8 (88%) | 5/8 (63%) | 3 (25%) | 0/1 | 0/1 | 0/2 | 0/0 | 0 | 651 | 821 | 12/12 |
| all | 252 | 48% | 139/168 (83%) | 99/168 (59%) | 37 (15%) | 4/24 | 2/24 | 15/36 | 0/0 | 0 | 661 | 983 | 251/252 |

## Tool eval: chain model-first (4b full): the most common errors

1. **expected call set_tempo, chose call set_tempo** (18)
   - en-013 "faster": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm":120,"direction":"faster"}`
   - en-017 "slow it down a bit man": expected `call set_tempo {"direction":"slower"}`, chose `call set_tempo {"bpm":90,"direction":"slower"}`
   - en-020 "bit quicker": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm":100,"direction":"faster"}`
2. **expected yours, chose call set_setting** (18)
   - en-029 "mute my mic": expected `yours`, chose `call set_setting {"key":"coachVoice","value":"none"}`
   - en-030 "turn grading off for me": expected `yours`, chose `call set_setting {"key":"practiceView","value":"none"}`
   - en-031 "wipe all my old takes": expected `yours`, chose `call set_setting {"key":"countIn","value":"0"}`
3. **expected none, chose call set_tempo** (13)
   - en-033 "slower": expected `none`, chose `call set_tempo {"bpm":80,"direction":"slower"}`
   - en-036 "slower": expected `none`, chose `call set_tempo {"bpm":60,"direction":"slower"}`
   - es-033 "mas lento": expected `none`, chose `call set_tempo {"bpm":60,"direction":"slower"}`
4. **expected call swap_part, chose call swap_part** (6)
   - en-004 "make part 3 harder": expected `call swap_part {"at":3,"choice":"harder"}`, chose `call swap_part {"at":3,"choice":"harder","to":"different"}`
   - en-005 "swap the first one for something diferent": expected `call swap_part {"at":1,"choice":"different"}`, chose `call swap_part {"at":1,"choice":"different","to":"2"}`
   - es-004 "la parte 3 me queda facil, ponme algo mas dificil": expected `call swap_part {"at":3,"choice":"harder"}`, chose `call swap_part {"at":3,"choice":"harder","to":"none"}`
5. **expected call show_scale, chose call show_scale** (5)
   - es-021 "muéstrame la pentatónica menor de la": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor","position":"rootOn5"}`
   - de-019 "a moll pentatonik anzeigen": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor","position":"rootOn5"}`
   - fr-007 "montre moi la pentatonique mineure en la sur le manche": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor","position":"rootOn5"}`
6. **expected which, chose call open_step** (5)
   - en-026 "open the chug step": expected `which`, chose `call open_step {"step":1}`
   - es-025 "abre acordes": expected `which`, chose `call open_step {"step":1,"query":"acordes"}`
   - fr-009 "ouvre accords": expected `which`, chose `call open_step {"step":1,"query":"accords"}`
7. **expected which, chose call go_to** (4)
   - en-028 "open the rhythm path": expected `which`, chose `call go_to {"screen":"paths"}`
   - ja-009 "ピッキング開いて": expected `which`, chose `call go_to {"screen":"paths"}`
   - zh-CN-009 "打开节奏那个": expected `which`, chose `call go_to {"screen":"paths"}`
8. **expected which, chose call show_scale** (4)
   - es-026 "quiero ver lo de sweep": expected `which`, chose `call show_scale {"root":"A","scale":"naturalMinor","position":"rootOn5"}`
   - es-027 "ábreme dos octavas": expected `which`, chose `call show_scale {"root":"A","scale":"major","position":"open"}`
   - es-028 "quiero ver los arpegios": expected `which`, chose `call show_scale {"root":"A","scale":"augmentedScale","position":"open"}`
9. **expected which, chose call open_path** (4)
   - en-025 "open picking": expected `which`, chose `call open_path {"path":"open picking"}`
   - de-026 "oeffne mal den moll-blues": expected `which`, chose `call open_path {"path":"Moll-Blues"}`
   - it-009 "apri il picking": expected `which`, chose `call open_path {"path":"Alternate picking"}`
10. **expected call set_setting, chose call set_setting** (4)
   - fr-005 "mets l'appli en portugais du bresil": expected `call set_setting {"key":"language","value":"pt-BR"}`, chose `call set_setting {"key":"language","value":"portuguese"}`
   - tr-004 "dili ingilizceye cevir": expected `call set_setting {"key":"language","value":"en"}`, chose `call set_setting {"key":"language","value":"english"}`
   - ko-006 "언어 일본어로 바꿔줘": expected `call set_setting {"key":"language","value":"ja"}`, chose `call set_setting {"key":"language","value":"japanese"}`
