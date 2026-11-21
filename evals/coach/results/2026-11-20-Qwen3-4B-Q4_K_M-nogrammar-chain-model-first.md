# Tool eval: chain model-first (4b nogrammar)

Chain model-first: the model answers; the rules only where it said none or gave no answer. The model's answer used on 198 items. Outcomes from 4b nogrammar. 

| lang | n | right | right tool | right args | wrong actions | asked (which) | yours | none | cards | no answer | median ms | p90 ms | prefix cached |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en | 36 | 31% | 17/24 (71%) | 9/24 (38%) | 2 (6%) | 0/4 | 0/4 | 2/4 | 0/0 | 0 | 445 | 704 | 35/36 |
| es | 36 | 31% | 18/24 (75%) | 8/24 (33%) | 2 (6%) | 0/4 | 1/4 | 2/4 | 0/0 | 0 | 537 | 861 | 36/36 |
| de | 36 | 39% | 18/24 (75%) | 10/24 (42%) | 3 (8%) | 1/4 | 0/4 | 3/4 | 0/0 | 0 | 584 | 891 | 36/36 |
| fr | 12 | 33% | 4/8 (50%) | 2/8 (25%) | 1 (8%) | 0/1 | 0/1 | 2/2 | 0/0 | 0 | 476 | 594 | 12/12 |
| it | 12 | 42% | 6/8 (75%) | 4/8 (50%) | 1 (8%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 514 | 572 | 12/12 |
| pt-BR | 12 | 50% | 4/8 (50%) | 3/8 (38%) | 0 (0%) | 0/1 | 1/1 | 2/2 | 0/0 | 0 | 404 | 569 | 12/12 |
| nl | 12 | 42% | 7/8 (88%) | 4/8 (50%) | 0 (0%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 383 | 678 | 12/12 |
| pl | 12 | 42% | 5/8 (63%) | 4/8 (50%) | 2 (17%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 397 | 782 | 12/12 |
| tr | 12 | 33% | 4/8 (50%) | 3/8 (38%) | 0 (0%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 597 | 1336 | 12/12 |
| ru | 12 | 17% | 6/8 (75%) | 2/8 (25%) | 1 (8%) | 0/1 | 0/1 | 0/2 | 0/0 | 0 | 647 | 854 | 12/12 |
| vi | 12 | 42% | 6/8 (75%) | 4/8 (50%) | 2 (17%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 574 | 783 | 12/12 |
| ja | 12 | 58% | 8/8 (100%) | 6/8 (75%) | 1 (8%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 531 | 804 | 12/12 |
| ko | 12 | 42% | 5/8 (63%) | 3/8 (38%) | 0 (0%) | 1/1 | 0/1 | 1/2 | 0/0 | 0 | 612 | 907 | 12/12 |
| zh-CN | 12 | 33% | 5/8 (63%) | 3/8 (38%) | 1 (8%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 591 | 997 | 12/12 |
| zh-TW | 12 | 33% | 6/8 (75%) | 3/8 (38%) | 3 (25%) | 0/1 | 0/1 | 1/2 | 0/0 | 0 | 589 | 827 | 12/12 |
| all | 252 | 37% | 119/168 (71%) | 68/168 (40%) | 19 (8%) | 2/24 | 2/24 | 20/36 | 0/0 | 0 | 531 | 877 | 251/252 |

## Tool eval: chain model-first (4b nogrammar): the most common errors

1. **expected call set_tempo, chose call set_tempo** (15)
   - en-017 "slow it down a bit man": expected `call set_tempo {"direction":"slower"}`, chose `call set_tempo {"bpm":90,"direction":"slower"}`
   - en-020 "bit quicker": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm?#":100,"direction?=slower|faster":"faster","at?#":90}`
   - es-015 "subele a 120 porfa": expected `call set_tempo {"bpm":120}`, chose `call set_tempo {"bpm":120,"direction":"faster"}`
2. **expected yours, chose call set_setting** (14)
   - en-029 "mute my mic": expected `yours`, chose `call set_setting {"key":"devices","value":"mute"}`
   - en-030 "turn grading off for me": expected `yours`, chose `call set_setting {"key":"grading","value":"off"}`
   - en-031 "wipe all my old takes": expected `yours`, chose `call set_setting {"key":"keepTakes","value":"none"}`
3. **expected none, chose call set_tempo** (11)
   - en-033 "slower": expected `none`, chose `call set_tempo {"bpm?#":80,"direction?":"slower"}`
   - en-036 "slower": expected `none`, chose `call set_tempo {"bpm?#":"slower"}`
   - es-033 "mas lento": expected `none`, chose `call set_tempo {"bpm?#":"none","direction?":"slower","at?#":"none"}`
4. **expected call show_scale, chose call show_scale** (6)
   - es-021 "muéstrame la pentatónica menor de la": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor","position?":"rootOn5"}`
   - de-019 "a moll pentatonik anzeigen": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor","position":"rootOn5"}`
   - fr-007 "montre moi la pentatonique mineure en la sur le manche": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor","position":"rootOn5"}`
5. **expected call set_setting, chose none** (6)
   - en-019 "turn the count in on": expected `call set_setting {"key":"countIn","value":"on"}`, chose `none`
   - fr-005 "mets l'appli en portugais du bresil": expected `call set_setting {"key":"language","value":"pt-BR"}`, chose `none`
   - pt-BR-005 "liga a contagem ai": expected `call set_setting {"key":"countIn","value":"on"}`, chose `none`
6. **expected call test_out, chose call test_out** (6)
   - en-010 "can i test out of this one": expected `call test_out {"path":"blues and pentatonics","step":2}`, chose `call test_out {"exercise":"The box in other keys","path":"Blues and Pentatonics","query":"this one"}`
   - es-009 "creo que ya domino este paso, quiero hacer la prueba para saltarlo": expected `call test_out {"path":"púa alterna","step":4}`, chose `call test_out {"exercise":"Step 4","path":"Púa alterna","query":"Corcheas y semicorcheas en un compás"}`
   - de-009 "ich will diesen schritt hier austesten": expected `call test_out {"path":"rhythmus-grundlagen","step":4}`, chose `call test_out {"exercise":"Rhythmus-Grundlagen","path":"Rhythmus-Grundlagen","step":"4"}`
7. **expected call set_tempo, chose none** (5)
   - de-010 "stell auf 90 bpm": expected `call set_tempo {"bpm":90}`, chose `none`
   - de-017 "n bisschen langsamer pls": expected `call set_tempo {"direction":"slower"}`, chose `none`
   - pt-BR-002 "sobe pra 110": expected `call set_tempo {"bpm":110}`, chose `none`
8. **expected call show_chord, chose call show_chord** (5)
   - en-021 "whats an F#m7 look like": expected `call show_chord {"chord":"F#m7"}`, chose `call show_chord {"chord":"F#m7","shape?#":""}`
   - es-020 "como se toca el la menor séptima": expected `call show_chord {"chord":"Am7"}`, chose `call show_chord {"chord":"Am7","shape?#":1}`
   - vi-006 "hợp âm Dm bấm sao vậy, vẽ cho mình coi": expected `call show_chord {"chord":"Dm"}`, chose `call show_chord {"chord":"Dm","shape?#":1}`
9. **expected call start_today, chose call start_today** (5)
   - en-002 "ok lets get going, start from the second part pls": expected `call start_today {"at":2}`, chose `call start_today {"at#":2}`
   - es-003 "empieza por la segunda parte": expected `call start_today {"at":2}`, chose `call start_today {"at?#":2}`
   - it-008 "parti direttamente dalla seconda parte": expected `call start_today {"at":2}`, chose `call start_today {"at#":2}`
10. **expected yours, chose none** (5)
   - es-029 "no me califiques hoy, solo quiero tocar": expected `yours`, chose `none`
   - de-032 "gib mir einfach ne eins fuer den schritt": expected `yours`, chose `none`
   - nl-010 "neem mij even op dan luister ik later terug": expected `yours`, chose `none`
