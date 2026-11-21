# Tool eval: chain rules-first (4b nogrammar)

Chain rules-first: the rules (router, then Path search) answer; the model only where they said none. The model's answer used on 190 items. Outcomes from 4b nogrammar. A turn the rules answered counts 0 ms.

| lang | n | right | right tool | right args | wrong actions | asked (which) | yours | none | cards | no answer | median ms | p90 ms | prefix cached |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en | 36 | 47% | 17/24 (71%) | 11/24 (46%) | 0 (0%) | 2/4 | 3/4 | 1/4 | 0/0 | 5 (unread 5) | 266 | 556 | 21/21 |
| es | 36 | 42% | 18/24 (75%) | 9/24 (38%) | 1 (3%) | 1/4 | 3/4 | 2/4 | 0/0 | 2 (unread 2) | 336 | 678 | 26/26 |
| de | 36 | 47% | 17/24 (71%) | 12/24 (50%) | 2 (6%) | 1/4 | 1/4 | 3/4 | 0/0 | 5 (unread 5) | 533 | 877 | 30/30 |
| fr | 12 | 50% | 5/8 (63%) | 3/8 (38%) | 1 (8%) | 1/1 | 1/1 | 1/2 | 0/0 | 2 (unread 2) | 399 | 594 | 9/9 |
| it | 12 | 67% | 7/8 (88%) | 5/8 (63%) | 0 (0%) | 1/1 | 1/1 | 1/2 | 0/0 | 1 (unread 1) | 347 | 572 | 8/8 |
| pt-BR | 12 | 50% | 4/8 (50%) | 3/8 (38%) | 0 (0%) | 1/1 | 1/1 | 1/2 | 0/0 | 4 (unread 4) | 404 | 569 | 11/11 |
| nl | 12 | 33% | 5/8 (63%) | 2/8 (25%) | 0 (0%) | 1/1 | 0/1 | 1/2 | 0/0 | 1 (unread 1) | 276 | 678 | 8/8 |
| pl | 12 | 42% | 4/8 (50%) | 3/8 (38%) | 2 (17%) | 1/1 | 0/1 | 1/2 | 0/0 | 0 | 251 | 570 | 8/8 |
| tr | 12 | 33% | 3/8 (38%) | 2/8 (25%) | 0 (0%) | 0/1 | 1/1 | 1/2 | 0/0 | 2 (unread 2) | 555 | 1336 | 9/9 |
| ru | 12 | 33% | 6/8 (75%) | 3/8 (38%) | 1 (8%) | 1/1 | 0/1 | 0/2 | 0/0 | 2 (unread 2) | 631 | 854 | 10/10 |
| vi | 12 | 25% | 5/8 (63%) | 3/8 (38%) | 2 (17%) | 0/1 | 0/1 | 0/2 | 0/0 | 2 (unread 2) | 562 | 783 | 11/11 |
| ja | 12 | 67% | 7/8 (88%) | 5/8 (63%) | 0 (0%) | 1/1 | 1/1 | 1/2 | 0/0 | 0 | 526 | 804 | 8/8 |
| ko | 12 | 42% | 4/8 (50%) | 2/8 (25%) | 0 (0%) | 1/1 | 1/1 | 1/2 | 0/0 | 2 (unread 2) | 498 | 907 | 8/8 |
| zh-CN | 12 | 33% | 5/8 (63%) | 3/8 (38%) | 1 (8%) | 0/1 | 0/1 | 1/2 | 0/0 | 2 (unread 2) | 552 | 997 | 11/11 |
| zh-TW | 12 | 25% | 6/8 (75%) | 3/8 (38%) | 3 (25%) | 0/1 | 0/1 | 0/2 | 0/0 | 2 (unread 2) | 589 | 827 | 12/12 |
| all | 252 | 43% | 113/168 (67%) | 69/168 (41%) | 13 (5%) | 12/24 | 13/24 | 15/36 | 0/0 | 32 (unread 32) | 470 | 830 | 190/190 |

## Tool eval: chain rules-first (4b nogrammar): the most common errors

1. **expected call set_tempo, chose call set_tempo** (13)
   - en-017 "slow it down a bit man": expected `call set_tempo {"direction":"slower"}`, chose `call set_tempo {"bpm":90,"direction":"slower"}`
   - en-020 "bit quicker": expected `call set_tempo {"direction":"faster"}`, chose `call set_tempo {"bpm?#":100,"direction?=slower|faster":"faster","at?#":90}`
   - es-015 "subele a 120 porfa": expected `call set_tempo {"bpm":120}`, chose `call set_tempo {"bpm":120,"direction":"faster"}`
2. **expected none, chose call set_tempo** (11)
   - en-033 "slower": expected `none`, chose `call set_tempo {"bpm?#":80,"direction?":"slower"}`
   - en-036 "slower": expected `none`, chose `call set_tempo {"bpm?#":"slower"}`
   - es-033 "mas lento": expected `none`, chose `call set_tempo {"bpm?#":"none","direction?":"slower","at?#":"none"}`
3. **expected call test_out, chose call test_out** (6)
   - en-010 "can i test out of this one": expected `call test_out {"path":"blues and pentatonics","step":2}`, chose `call test_out {"exercise":"The box in other keys","path":"Blues and Pentatonics","query":"this one"}`
   - es-009 "creo que ya domino este paso, quiero hacer la prueba para saltarlo": expected `call test_out {"path":"púa alterna","step":4}`, chose `call test_out {"exercise":"Step 4","path":"Púa alterna","query":"Corcheas y semicorcheas en un compás"}`
   - de-009 "ich will diesen schritt hier austesten": expected `call test_out {"path":"rhythmus-grundlagen","step":4}`, chose `call test_out {"exercise":"Rhythmus-Grundlagen","path":"Rhythmus-Grundlagen","step":"4"}`
4. **expected call show_scale, chose call show_scale** (5)
   - es-021 "muéstrame la pentatónica menor de la": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor","position?":"rootOn5"}`
   - fr-007 "montre moi la pentatonique mineure en la sur le manche": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"naturalMinor","position":"rootOn5"}`
   - nl-008 "laat a mineur pentatoniek zien op de hals": expected `call show_scale {"root":"A","scale":"minorPentatonic"}`, chose `call show_scale {"root":"A","scale":"minor","position":"rootOn5"}`
5. **expected call set_setting, chose noAnswer unread** (5)
   - en-019 "turn the count in on": expected `call set_setting {"key":"countIn","value":"on"}`, chose `noAnswer unread`
   - fr-005 "mets l'appli en portugais du bresil": expected `call set_setting {"key":"language","value":"pt-BR"}`, chose `noAnswer unread`
   - tr-004 "dili ingilizceye cevir": expected `call set_setting {"key":"language","value":"en"}`, chose `noAnswer unread`
6. **expected call set_tempo, chose noAnswer unread** (5)
   - de-010 "stell auf 90 bpm": expected `call set_tempo {"bpm":90}`, chose `noAnswer unread`
   - de-017 "n bisschen langsamer pls": expected `call set_tempo {"direction":"slower"}`, chose `noAnswer unread`
   - pt-BR-002 "sobe pra 110": expected `call set_tempo {"bpm":110}`, chose `noAnswer unread`
7. **expected call show_chord, chose call show_chord** (5)
   - en-021 "whats an F#m7 look like": expected `call show_chord {"chord":"F#m7"}`, chose `call show_chord {"chord":"F#m7","shape?#":""}`
   - es-020 "como se toca el la menor séptima": expected `call show_chord {"chord":"Am7"}`, chose `call show_chord {"chord":"Am7","shape?#":1}`
   - vi-006 "hợp âm Dm bấm sao vậy, vẽ cho mình coi": expected `call show_chord {"chord":"Dm"}`, chose `call show_chord {"chord":"Dm","shape?#":1}`
8. **expected call start_today, chose call start_today** (5)
   - en-002 "ok lets get going, start from the second part pls": expected `call start_today {"at":2}`, chose `call start_today {"at#":2}`
   - es-003 "empieza por la segunda parte": expected `call start_today {"at":2}`, chose `call start_today {"at?#":2}`
   - it-008 "parti direttamente dalla seconda parte": expected `call start_today {"at":2}`, chose `call start_today {"at#":2}`
9. **expected none, chose noAnswer unread** (5)
   - en-034 "lol rough day at work, hands are fried": expected `none`, chose `noAnswer unread`
   - fr-012 "plus vite": expected `none`, chose `noAnswer unread`
   - pt-BR-012 "mais devagar": expected `none`, chose `noAnswer unread`
10. **expected yours, chose call set_setting** (5)
   - en-030 "turn grading off for me": expected `yours`, chose `call set_setting {"key":"grading","value":"off"}`
   - de-030 "nimm mich bitte auf waehrend ich spiele": expected `yours`, chose `call set_setting {"key":"practiceView","value":"on"}`
   - de-031 "loesch alle meine takes": expected `yours`, chose `call set_setting {"key":"keepTakes","value":"none"}`
