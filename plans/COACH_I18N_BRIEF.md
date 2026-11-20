# Translating the coach's app strings (UI locales)

For every coach leg that adds or changes strings in `src/locales/*/*.json`. Hand this file, whole, to each
translation helper. Packs (`src/paths/packs/i18n/`) have their own brief, `plans/paths/I18N_BRIEF.md`;
this one agrees with it (voice, digits, note names, no "!") and covers the app's own strings.

## The files

- Fifteen locales, one folder each under `src/locales/`: `en` (the source) `de es fr it ja ko nl pl
  pt-BR ru tr vi zh-CN zh-TW`. Each holds the same thirteen namespace files (`coach coachBlocks common
  drill jam metronome onboarding session setlist settings shell songs zen`). A key's full path is its name
  inside the file (`session.json` → `session.why.climb`); the file name is not part of the key.
- **Keys never change.** A rename of a word is a change of values only (`session.bar.*` keeps its name).
- **Placeholders** are `{{name}}`, copied byte for byte; every one English uses must be in the
  translation, none added. `{{count}}` drives plurals: English writes `key` / `key_other` (or `_one`);
  pl and ru add `_few` and `_many`, ja ko vi zh need only one form (keeping English's forms costs nothing).
- **The gate**: `src/test/i18n.locales.test.ts` fails on a missing or extra key or a placeholder that
  drifted, per key; `src/test/parity/localeKeys.test.ts` fails when a key disappears. Neither reads what
  a value says: that is the reviewer's job (below).
- Edit in place, surgically: the new key goes where English has it, the file's order and formatting stay
  as they are (other legs edit the same files and must merge cleanly). Never rewrite a whole file.

## Glossary (what the locale files already say: reuse it, do not coin a second word)

| | Take | Step | Path | Session | Exercise | Today | pass mark | clean tempo | rung |
|---|---|---|---|---|---|---|---|---|---|
| de | Take | Schritt | Pfad | Session | Übung | Heute | Messlatte (chip: Latte) | sauberes Tempo | Stufe |
| es | toma | paso | ruta | sesión | ejercicio | Hoy | listón | tempo limpio | peldaño |
| fr | prise | étape | parcours | séance | exercice | Aujourd'hui | seuil | tempo propre | cran |
| it | take (f.) | tappa | percorso | sessione | esercizio | Oggi | asticella | tempo pulito | gradino |
| ja | テイク | ステップ | コース | セッション | 課題 | 今日 | 合格ライン | クリーンテンポ | 段階 |
| ko | 테이크 | 단계 | 코스 | 세션 | 과제 | 오늘 | 통과 기준 (chip: 기준) | 클린 템포 | 단계 |
| nl | take | stap | leerpad | sessie | oefening | Vandaag | lat | schoon tempo | trede |
| pl | podejście | krok | ścieżka | sesja | ćwiczenie | Dzisiaj | poprzeczka | czyste tempo | szczebel |
| pt-BR | tomada | etapa | trilha | sessão | exercício | Hoje | meta | andamento limpo | degrau |
| ru | дубль | шаг | курс | сессия | упражнение | Сегодня | планка | чистый темп | ступень |
| tr | deneme | adım | yol | oturum | alıştırma | Bugün | çıta | temiz tempo | basamak |
| vi | lượt | bước | lộ trình | buổi tập | bài | Hôm nay | mức đạt (chip: mức) | tempo sạch | nấc |
| zh-CN | 这一遍 / 遍 | 步 | 路线 | 这次练习 | 练习 | 今天 | 及格线 | 干净速度 | 档 |
| zh-TW | 這一遍 / 遍 | 步 | 路線 | 這次練習 | 練習 | 今天 | 及格線 | 乾淨速度 | 檔 |

| | bar (music) | round (of the tune) | the coach | Ask | graded / not graded | Listen(ing) | early / late |
|---|---|---|---|---|---|---|---|
| de | Takt | Durchgang | der Coach | fragen | bewertet / nicht bewertet | hört zu | früh / spät |
| es | compás | vuelta | el coach | preguntar | evaluada / sin evaluar | escuchando | pronto / tarde |
| fr | mesure | passage | le coach | demander | évaluée / non évalué | à l'écoute | en avance / en retard |
| it | battuta | giro | il coach | chiedi | valutata / non valutato | in ascolto | in anticipo / in ritardo |
| ja | 小節 | 回目 | コーチ | 聞く | 採点あり / 採点なし | 聴いています | 走り / 遅れ |
| ko | 마디 | 번째 | 코치 | 묻기 | 채점 / 채점 안 함 | 듣는 중 | 빠름 / 늦음 |
| nl | maat | keer | de coach | vraag | beoordeeld / niet beoordeeld | luistert | vroeg / laat |
| pl | takt | raz | trener | zapytaj | z oceną / bez oceny | słucham | za wcześnie / za późno |
| pt-BR | compasso | vez | o coach | perguntar | com avaliação / sem avaliação | ouvindo | adiantado / atrasado |
| ru | такт | раз | тренер | спросить | с оценкой / без оценки | слушаю | рано / поздно |
| tr | ölçü | geçiş | koç | sor | değerlendirmeli / değerlendirilmedi | dinliyor | erken / geç |
| vi | ô nhịp | vòng (not lượt: that is a Take) | huấn luyện viên | hỏi | chấm điểm / không chấm điểm | đang nghe | sớm / trễ |
| zh-CN | 小节 | 轮 (not 遍: that is a Take) | 教练 | 问 | 评分 / 未评分 | 正在聆听 | 偏早 / 偏晚 |
| zh-TW | 小節 | 輪 (not 遍: that is a Take) | 教練 | 問 | 評分 / 未評分 | 正在聆聽 | 偏早 / 偏晚 |

Notes: **pass mark** is the threshold a Take must reach (the minimum to pass); **bar** is only ever a
bar of music. No locale may use its bar-of-music word for the threshold, or its threshold word for a bar.
Where the table gives two words (Take in pt-BR, the coach in es, "take"/"kayıt" in tr), the first is the
one the Session screens use: write that one. zh uses 练习 for both Session and Exercise; say 这次练习 for
the Session and 这个练习 for the Exercise. "Listen" as a button (the tools' Listen, DESIGN 7) takes the
verb's imperative or the locale's button form (de Anhören, es Escuchar, fr Écouter, …), not "Listening".

## The coach's voice (DESIGN §2), as rules

1. **One or two sentences, one idea.** Never a paragraph; never two ideas joined by "and also".
2. **An instruction is an order**: imperative, the locale's button form for a button. "Count the held E,
   then come in." Not a description of where things tend to go wrong.
3. **Numbers only when measured, and with their base**: "97% right notes (of 58 I could pitch)". Keep
   every number as a placeholder or a digit; never turn one into words or add one English lacks.
4. **Says where and which way, never why**: which bar, which round, early or late. A translation must not
   explain a cause the English does not state.
5. **Counts the way a player counts**: "the tune's first bar, on two rounds of three", not bar numbers
   of the repeated Take. Keep "round" (the glossary's word) distinct from "Take".
6. **First person about its limits, once**: the coach is "I" (de ich, fr je, ja no subject or 私 only if
   the file already does, ru я, vi tôi, zh 我). Answer first, the limit last.
7. **Praise is specific or absent; a pass is not oversold.** No "great", "awesome", "perfect", no
   exclamation mark (no "!" or "！" anywhere), no emoji. "Passed at 90" stays that plain.
8. **Address** as the locale file already does: de du, es tú, fr tu, it tu, nl je, pl ty (prefer
   forms without a gendered past where a neutral one reads naturally), pt-BR você, ru вы (lowercase,
   "-те" imperatives), tr sen, ja です/ます, ko 해요체, vi bạn, zh 你.
9. Keep "BPM", note names as letters (A B C D E F G, # and b; never Do-Re-Mi, never German H), and
   product words capitalised where the locale file capitalises them.

## What a translator must never add

A reason for a mistake ("because you rushed", "your hand tensed"); any claim about **pick direction,
muting, posture, tension, which hand, fingering, tone or feel** (the coach cannot hear them; English
only ever names them as "yours to watch"); a suggestion to turn on the microphone or grading; "check
your tuning" or anything about tuning; a promise the English does not make ("you'll get it next time").
If English hedges ("I couldn't tell"), the translation hedges the same way and says no more.

## Layout facts

- German and Russian run 20 to 35% longer than English; chips wrap to two lines and that is allowed.
  Nothing is `nowrap` except a number with its unit: keep "85 %" / "{{bar}}%" glued to its unit the way
  the locale file already writes it (de and fr put a space before %, tr writes %{{bar}}).
- **The order shown during a Take is at most 48 characters in every language** (count the placeholder as
  its longest value, e.g. "{{bpm}}" as 3). Shorten the wording, never the meaning; if it cannot fit, say
  so in the return line instead of truncating.
- A chip label (result chips, the Take's kicker) stays as short as English's +50% at most.

## How a helper returns its work

- The leg's prompt names the files and keys. Either edit the locale files in place with the Edit tool
  (values only, nothing reordered), or, if the prompt asks for it, write one JSON fragment per locale to
  `/tmp/coach-<leg>/i18n/<locale>.json`: `{ "<full.dotted.key>": "<value>", ... }` with the keys in the
  English order, plural forms included. Valid JSON, UTF-8.
- End with one line per locale: the locale, the number of strings, any key you were unsure about and why.
  Do not run git, npm, bun or tests; do not edit any file the prompt does not name.

## How the leg checks it

1. `npx vitest run src/test/i18n.locales.test.ts src/test/parity/localeKeys.test.ts` (keys, plurals,
   placeholders), then the full suite; `JSON.parse` of every touched file is implied by the first.
2. Read every changed value yourself: the glossary's words, no "!" / "！", no banned claim, no added
   reason, the 48-character order, the same term for the same thing across all the leg's keys.
3. For de and ru, the layout scenes of the screens the strings appear on (`npm run test:layout`, the
   specs the leg file names).
