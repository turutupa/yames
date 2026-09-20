//! Who asks for the camera, and how often.
//!
//! `W21-CAMERA.md` item 5. Three webviews, three answers, and only one of them
//! is code:
//!
//! * **Windows / WebView2** is this file. WebView2 asks for a camera the way a
//!   browser does — its own bar, per origin, and by default it asks again the
//!   next time. Yames has already asked, in its own words, in a dialog the
//!   player answered before `getUserMedia` was ever called
//!   (`CameraIntroDialog.tsx`); a second prompt from the webview is the app
//!   asking twice and looking like a web page while it does it. So the request
//!   is answered here from the consent that was already given, and it is saved
//!   in the profile so it is answered once and not once per launch.
//!
//! * **macOS / WKWebView** needs no code: the system asks, once, with the
//!   sentence in `src-tauri/Info.plist`, and remembers the answer itself in
//!   System Settings → Privacy & Security → Camera. A missing
//!   `NSCameraUsageDescription` is not a refusal there — it is a kill — which
//!   is why that file exists and says so at the top.
//!
//! * **Linux / WebKitGTK** varies by build. Some ask through the portal, some
//!   have no `MediaRecorder` for video at all, and the frontend detects that
//!   and hides the switch behind a sentence (`songs/camera/support.ts`). There
//!   is nothing useful to do from Rust in either case.
//!
//! ## The microphone is refused here, on purpose
//!
//! The webview never opens a microphone: a take's sound is the engine's,
//! recorded through cpal on its own threads (`take.rs`), sample-exact against
//! the click. That is a promise made in the take's dialog and in this repo's
//! documentation, and everywhere else it is kept by there being no code that
//! would break it. Here it is kept by the platform: a microphone request from
//! this webview is DENIED before it reaches the user, so a future change that
//! reached for one would fail visibly rather than quietly open a second
//! recording of the room.
//!
//! Everything else is left exactly alone — the handler sets no state for a
//! kind it does not name — so WebView2 goes on asking about geolocation,
//! notifications and the rest the way it always did.

#[cfg(target_os = "windows")]
mod windows_impl {
    use tauri::{Manager, Runtime};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2PermissionRequestedEventArgs, ICoreWebView2PermissionRequestedEventArgs3,
        COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW, COREWEBVIEW2_PERMISSION_STATE_DENY,
    };
    use webview2_com::PermissionRequestedEventHandler;
    use windows::core::Interface;

    /// Answer the camera prompt ourselves, once, for the app's own windows.
    ///
    /// Failing is not worth refusing to start over: without this the player
    /// gets WebView2's own prompt, which is one prompt too many but still a
    /// working camera. So every step is a `let ... else` back to a log line.
    pub fn install<R: Runtime>(app: &tauri::AppHandle<R>) {
        for label in ["main"] {
            let Some(window) = app.get_webview_window(label) else {
                continue;
            };
            let result = window.with_webview(|webview| unsafe {
                let controller = webview.controller();
                let Ok(core) = controller.CoreWebView2() else {
                    eprintln!("[camera] no WebView2 to answer the camera prompt on");
                    return;
                };
                let mut token = Default::default();
                let handler = PermissionRequestedEventHandler::create(Box::new(
                    |_sender, args: Option<ICoreWebView2PermissionRequestedEventArgs>| {
                        let Some(args) = args else {
                            return Ok(());
                        };
                        // An out-parameter, the way COM asks for everything.
                        let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                        args.PermissionKind(&mut kind)?;

                        // Setting the state IS the answer: WebView2 shows its
                        // own bar only for a request the handler left at
                        // `DEFAULT`, so answering here is what replaces the
                        // prompt rather than adding to it.
                        if kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA {
                            args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                            // ...and remembered, so it is answered once rather
                            // than once per launch. Only on a runtime new
                            // enough to have the interface; an older one simply
                            // answers it again next time, which is silent and
                            // is what happened before this file existed.
                            if let Ok(saves) =
                                args.cast::<ICoreWebView2PermissionRequestedEventArgs3>()
                            {
                                let _ = saves.SetSavesInProfile(true);
                            }
                        } else if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                            // See this module's header. The webview has no code
                            // that opens a microphone and must not grow one by
                            // accident.
                            args.SetState(COREWEBVIEW2_PERMISSION_STATE_DENY)?;
                        }
                        Ok(())
                    },
                ));
                if core.add_PermissionRequested(&handler, &mut token).is_err() {
                    eprintln!("[camera] could not take over the camera prompt");
                }
            });
            if let Err(e) = result {
                eprintln!("[camera] could not reach the webview: {e}");
            }
        }
    }
}

/// Take over the camera prompt where the platform lets us. A no-op everywhere
/// but Windows — see the header for what the other two do instead.
#[cfg(target_os = "windows")]
pub fn install<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    windows_impl::install(app);
}

#[cfg(not(target_os = "windows"))]
pub fn install<R: tauri::Runtime>(_app: &tauri::AppHandle<R>) {}
