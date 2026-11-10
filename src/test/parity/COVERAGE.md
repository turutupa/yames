# Parity coverage

Which rows of `plans/revamp/TOOLS_PARITY.md` the parity suite pins, against today's
code. Tests carry their row id at the start of their name where they pin one row;
the files that freeze lists pin whole tables at once. Update this list in the same
commit as the test.

**Behaviour** means the test drives the real window (or the real hook) and checks
the command sent, the value saved or what is on screen. **Frozen** means a name-level
freeze: the id, key or string is still there and still read and written, but the
behaviour behind it is not exercised.

## The files

| File | What it pins |
|---|---|
| `src/test/parity/surface.test.ts` (P1) | Frozen: 144 commands, 28+28 events, 42 action ids with defaults, settings keys, tools, themes, sounds, locales, hints, Zen styles, meters, tour stops, SQLite tables, file associations, window labels, where data lives |
| `src/test/parity/localeKeys.test.ts` (P2) | Frozen: the 1,910 English keys |
| `src/test/parity/savedFormats.test.tsx` (P3) | Behaviour: v1.2.2 settings fixtures load through today's readers and survive a launch |
| `src/test/parity/rustState.test.ts`, `src-tauri/tests/parity_store.rs` (P4) | `persist_state` and startup restore; the section 4.5 migrations; a real v4 `practice.db` |
| `src/hooks/useActionDispatcher.parity.test.tsx` (P5) | Behaviour: all 42 actions in all 11 situations |
| `src-tauri/tests/parity_midi.rs`, `src/hooks/useMidi.test.ts`, `src/hooks/useKeybindings.test.ts` (P6) | MIDI parsing, learn, conflicts; the keymap merge, reset, conflict |
| `src/containers/metronome/MetronomeView.parity.test.tsx` (P7) | Behaviour: the Metronome and Ramp up controls |
| `src/containers/settings/settingsSurface.test.tsx` (P8) | Behaviour: Settings rows write their key and read it back |
| `src/containers/main-window/shell.parity.test.tsx` | Behaviour: `app_ready`, first-run detection, reaching every tool, `setView`, keys and pedals, Zen and the widget |
| `src/containers/main-window/shellRows.parity.test.tsx` | Behaviour: the rail, Settings over a tool, Escape, the coach card, keyboard ownership, the audio notice, the onboarding nudges |
| `src/containers/onboarding/helpAndTour.parity.test.tsx` | Behaviour: the header's overflow, Help, the shortcuts sheet, the tour |
| `src/hooks/useSession.parity.test.tsx` | Behaviour: `useSession`'s order of calls |
| `src/test/parity/doors.test.ts` | Static: who may call `saveSession`, `getFinalSessionReport`, `startTake`, `stopTake`, `setActiveTab`, `saveAttempt`, `app_ready` |

## Rows covered

### Shell-adjacent (the revamp's front door)

| Area | Rows | Count |
|---|---|---:|
| SHL | 01, 02, 03, 04, 05, 06, 07, 08, 09, 12, 13, 14, 15, 17, 18, 21, 23, 26, 27, 28, 29, 30, 31, 32, 39 | 25 |
| KEY | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 12, 13, 14, 15, 17 | 15 |
| HK | 01 to 42 (dispatcher table, behaviour; surface, frozen) | 42 |
| ONB | 01, 02, 03, 04, 17, 19, 20, 21, 22, 28; 23 frozen (hint ids) | 11 |
| SYS | 07, 17, 23, 24, 25, 26, 29, 30, 32, 33; 06 frozen (file associations) | 11 |
| COA | 01, 07, 08, 53, 61, 114 | 6 |
| SK | 01 to 92 frozen (each key still read or written under its name, in its store); the Rust-read ones also through `persist_state` and startup | 92 |

### Tools

| Area | Rows | Count |
|---|---|---:|
| MET | 01, 02, 03, 04, 08, 09, 10, 12, 13, 15, 16, 17, 18, 20, 23, 25, 27, 30, 31, 32, 41, 44, 49, 51; 26 frozen (sound ids) | 25 |
| RMP | 02, 03, 09, 17, 18, 23, 32, 33, 34, 37 | 10 |
| PRS | 23, 24, 25, 26 | 4 |
| SET | 01, 40, 59, 70 | 4 |
| JAM / JTK | JAM-83, JTK-33 (static), JTK-69 | 3 |
| SNG / SNR | SNG-27, SNR-85 (static), SNR-96 | 3 |

### Settings and the rest

| Area | Rows | Count |
|---|---|---:|
| STG | 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15 (brain, scoring mode, stance, voice), 17, 21, 22, 23 | 16 |
| THM | 01, 04, 05, 08, 09; 02 frozen (13 ids) | 6 |
| I18 | 01; 02 and 04 frozen (locales, English keys) | 3 |
| MID | 01, 02, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14 | 12 |
| WID | 01, 03, 04, 16 | 4 |
| ZEN | 01; 04 frozen (7 styles) | 2 |

**Total: 294 rows.** 193 are pinned by behaviour, 2 by a static door check (JTK-33,
SNR-85), and 99 by a frozen list only (the 92 SK keys, ONB-23, SYS-06, MET-26, THM-02,
I18-02, I18-04, ZEN-04).

## Known gaps, pinned as `it.fails`

Flip each to `it` when the product is fixed.

| Row | Test | What is wrong today |
|---|---|---|
| ONB-19 | `helpAndTour.parity.test.tsx` "the Drill stop shows the Drill's own key" | The tour's Drill stop names `tab-2`, which is Setlist since the renumbering (section 6.1 item 8) |

## Pinned as they are, on purpose

- Count-in: the on-screen Play arms it, Space does not (MET-31, MET-32; section 3.1 item 8).
- `toggle-sidebar` is ignored on the Setlist, `toggle-coach` on the Setlist and Songs (section 6.1 item 14), in the dispatcher table.
- `fullscreen` is ignored on Settings, so Escape there only ever leaves Settings.
- A one-time hint card takes the first Escape before the header's overflow does (ONB-23).

## Not yet covered, shell-adjacent

SHL-10 (library auto-close under 620 px: needs `test:layout`), SHL-11, SHL-16, SHL-19,
SHL-20, SHL-22, SHL-24, SHL-25, SHL-33 to SHL-43; KEY-11, KEY-16; ONB-05 to ONB-16,
ONB-18, ONB-24 to ONB-27, ONB-29, ONB-30; ZEN-02 to ZEN-22 beyond opening and closing;
WID-02, WID-05 to WID-15.
