; Yames — NSIS installer hooks.
;
; One job: make sure installing Yames does not TAKE OVER anybody's Guitar Pro
; or MusicXML files. `plans/tasks/songs/W19-FRICTION.md`: "Do not make Yames
; the DEFAULT app for any type; it is offered in Open with."
;
; Tauri's own `APP_ASSOCIATE` macro — which `bundle.fileAssociations` inserts
; into the install section, just before these hooks run — does four things:
;
;   1. backs up whatever owned `.gp5` into `.gp5\<ProgID>_backup`
;   2. writes our ProgID as the DEFAULT value of `.gp5`      <- the problem
;   3. creates the ProgID, its icon and its `shell\open\command`
;   4. gives it the text "Open with Yames"
;
; Three and four are exactly what we want and are left alone. Two is what
; would make a guitarist who installed a metronome find that double-clicking
; their tabs no longer opens Guitar Pro — so this undoes it, putting back the
; value the macro just saved, and registers the ProgID under `OpenWithProgids`
; instead. That is the key Windows reads to build the "Open with" list, so
; Yames appears there, with its icon, and nothing else changes.
;
; The uninstaller's `APP_UNASSOCIATE` reads the same `_backup` value and writes
; it back as the default, so leaving the backup in place (rather than deleting
; it) keeps uninstall correct: it restores the same value this hook restored.
;
; `SHCTX` is the install context Tauri already chose — per-user or
; per-machine — so this writes wherever the associations themselves went.

!macro YAMES_OFFER_NOT_OWN EXT PROGID
  ; Put back whoever owned this extension before Yames arrived. Empty when
  ; nothing did, which is the same as having no default.
  ReadRegStr $R9 SHCTX "Software\Classes\.${EXT}" "${PROGID}_backup"
  WriteRegStr SHCTX "Software\Classes\.${EXT}" "" "$R9"
  ; ...and put Yames in the "Open with" list instead. The value is empty by
  ; design: Windows reads the NAME of the value, not its contents.
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${PROGID}" ""
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; The five Guitar Pro extensions, then the two MusicXML ones. The ProgIDs
  ; are the `name` field of each entry in `bundle.fileAssociations`; keep the
  ; two lists in step.
  !insertmacro YAMES_OFFER_NOT_OWN "gp"       "YamesGuitarProTab"
  !insertmacro YAMES_OFFER_NOT_OWN "gp3"      "YamesGuitarProTab"
  !insertmacro YAMES_OFFER_NOT_OWN "gp4"      "YamesGuitarProTab"
  !insertmacro YAMES_OFFER_NOT_OWN "gp5"      "YamesGuitarProTab"
  !insertmacro YAMES_OFFER_NOT_OWN "gpx"      "YamesGuitarProTab"
  !insertmacro YAMES_OFFER_NOT_OWN "musicxml" "YamesMusicXml"
  !insertmacro YAMES_OFFER_NOT_OWN "mxl"      "YamesMusicXmlZip"
  ; Tell the shell the association table moved, so Explorer's "Open with"
  ; list is right without a sign-out.
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0x1000, i 0, i 0)"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; `APP_UNASSOCIATE` has restored the default and deleted the ProgID key by
  ; the time this runs; the one thing it does not know about is the
  ; `OpenWithProgids` entry above, which would otherwise be left behind
  ; pointing at a ProgID that no longer exists.
  DeleteRegValue SHCTX "Software\Classes\.gp\OpenWithProgids"       "YamesGuitarProTab"
  DeleteRegValue SHCTX "Software\Classes\.gp3\OpenWithProgids"      "YamesGuitarProTab"
  DeleteRegValue SHCTX "Software\Classes\.gp4\OpenWithProgids"      "YamesGuitarProTab"
  DeleteRegValue SHCTX "Software\Classes\.gp5\OpenWithProgids"      "YamesGuitarProTab"
  DeleteRegValue SHCTX "Software\Classes\.gpx\OpenWithProgids"      "YamesGuitarProTab"
  DeleteRegValue SHCTX "Software\Classes\.musicxml\OpenWithProgids" "YamesMusicXml"
  DeleteRegValue SHCTX "Software\Classes\.mxl\OpenWithProgids"      "YamesMusicXmlZip"
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0x1000, i 0, i 0)"
!macroend
