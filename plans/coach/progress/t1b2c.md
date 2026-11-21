# Leg t1b2c: the review fixes of t1b2b (typed commands)

Branch `coach-t1b2b` (t1b2b's own worktree), on top of `bd21d78e`. Brief: the review
`/tmp/coach-orch/t1b2b-review.md` (MERGE AFTER FIXES, six findings). Logs in `/tmp/coach-t1b2b/c-*`.

Status: fixes done, `coach` merged in (no conflicts), gates below.

## Per finding

1. **HIGH, a leftover as a Path name (ja, and the same shape in ko, zh).** Two guards, both in `router.ts`:
   - **The root (the review's (b)):** in a table with `noSpaces`, a `go` tool whose call carries a name the
     app resolves by title (`path`, `query`, `exercise`, `jam`, `preset`: in practice `open_path` and
     `open_step` with a Path) is never a `call`: `pressNamedGo` turns it into a one-choice "Which one?"
     (a press). Why (b) and not "only if it resolves": "て" and "る" DO resolve (they sit inside
     "はじめてのコードとストラム" and "ネックを知る"), so resolution is the problem, not the guard; and the
     router is pure and cannot see the packs. Screens and sections are closed words and still go at once
     ("コースを開けて" opens the Paths screen). The cost: "ブルースを開いて" is now a press, not at once.
     The choice's label is `coachTools.choice.path` / `coachTools.chip.openStep` (existing keys, no new strings).
   - **Also (a):** `query()` returns null for a one-character name without spaces, so "開ける" / "能打开路线"
     fall through to the model instead of offering a nonsense chip "る" / "能".
   - ja `verbs.open` gained `開けて`, `開ける` (the review's ask).
   - Tables re-read for the same shape; `notCommand` gained: ja `くと ると のが たび 固ま 落ち 重い 割れ`;
     ko `볼까 갈까 칠까 열까 을까 놨 두면 느려 빨라 어려워 버튼 멈춰 때마다 끊겨 끊어 재밌 재미 편해`
     (not `어렵`: it is inside the swap choice "더 어렵게"); zh-CN `可以 就 卡住 闪退 视频`; zh-TW
     `可以 就 卡住 閃退 影片`.
   - Near-misses added (ordinary sentences with a screen's or a Path's word; how many routed to a call
     before the fix): ja +14 (8), ko +13 incl. three for finding 6 (9), zh-CN +12 (6), zh-TW +12 (6).
     nearMissNone now: ja 54, ko 49, zh-CN 48, zh-TW 48 (from 40, 36, 36, 36). The near-miss test now lists
     every wrong line at once.
   - Tests: `commandTables.test.ts` "without spaces, no navigation by a typed name runs at once: one press";
     the dozen-commands test expects the one press for `open_path` in no-spaces tables; `askTyped.test.ts`
     "ja: 'コースを開けて' opens the Paths screen; a verb's stem with a kana left over opens no Path"
     (against the real ja packs, and showing "て" and "る" do resolve).
2. **notFound swallowed the sentence.** `askTools.runTypedCall` (new; `runAskCall` shares its writer): a typed
   call that carries a name and comes back `notFound` with no choices writes nothing and returns false;
   `answerTyped` goes on to the next answerer and the model. A refusal about a number ("no Step 7 there")
   still answers. Test: `askTyped.test.ts` "a command whose typed name names nothing … goes on to the model".
3. **IME Enter.** `AskPanel.tsx`: the Enter also needs `keyCode !== 229`. Test: `AskPanel.test.tsx` "the
   Enter that commits an IME composition sends nothing, even after compositionend" (also: two fast Enters
   send once). Plus "with a model ready, a typed command is done, not handed to the model; a question still is".
4. **Run-together titles.** `resolve.titleMatch`: an unspaced part also matches the title with its spaces
   taken out. Tests: `resolve.test.ts` four rows; `askTyped.test.ts` seven `it.each` rows (ja, ko, zh-CN,
   zh-TW) that route, resolve against the real localized title, and press.
5. **The slot.** `answerTyped`: `try { nextAnswerer(said) === true } catch { false }`; the test file resets the
   slot in `afterEach`. Test: "a slot that throws, or answers with a Promise, has not answered".
6. **ko "3단계".** Not the table: the bare fallback in `parseBare` (number + a place's unit = a place) is off
   without spaces, where "3단계" is a count as often as a place. With a verb it is still the place
   ("7단계 열어줘"), which dropping `#단계` from the table would have lost. ko's bare "7단계" command line
   moved out; "3단계", "3단계만 더", "3단계 남았어" are near-misses. Test: `router.test.ts` ordinalPlaces test.

Every new test failed on the code before the fix (55 failures, `/tmp/coach-t1b2b/c-before.log`) and passes after.

## Open points

- An async next answerer is "not answered", so if it also writes turns later the model answers too. c2b1b:
  keep the card answerer synchronous (the type says `boolean`).
- In no-spaces languages every Path opened by name is a press now. If the owner wants "ブルースを開いて" at
  once, the next step is a router that is handed the titles (resolve before routing), not a looser guard.
- Native reads still wanted for the added near-misses and `notCommand` words (ja, ko, zh).
