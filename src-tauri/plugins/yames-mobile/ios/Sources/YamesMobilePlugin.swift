import AVFoundation
import Tauri
import UIKit
import WebKit

/// The iPhone half of the `yames-mobile` plugin.
///
/// Same five commands and the same `audio_interrupted` event as the Android
/// half in `../../android` — the frontend (`src/mobile/native.ts`,
/// `useAndroidNative.ts`) is shared and does not branch on which phone it is
/// running on. What each command *means* is different, because the two systems
/// take a metronome away from you in different ways:
///
/// * Android needs a foreground service or the process is frozen minutes after
///   the screen goes off. iOS needs an `AVAudioSession` in the `.playback`
///   category plus the `audio` background mode, and then keeps the app running
///   for exactly as long as it is making sound. So `setBackgroundAudio` here is
///   "activate the audio session", and the notification text Android puts in
///   the shade has nowhere to go — iOS's equivalent row is the Now Playing
///   control, which needs remote-command handlers Yames has no buttons for.
/// * `.playback` is also what makes the click ignore the ring/silent switch.
///   A metronome that goes quiet because the phone is on silent is a metronome
///   you cannot trust on a music stand.
/// * There is no Back gesture on iOS, so `setBackIntercept` exists and does
///   nothing. It has to exist: the shared frontend calls it.
///
/// Nothing in this file touches the audio thread or knows what tempo is
/// playing. It asks the system for the right to make a sound, keeps the screen
/// awake, and reports when something took the sound away.
class YamesMobilePlugin: Plugin {
  /// The one way back to the webview, opened once at startup by
  /// `setEventChannel`. Every event below is a tagged message through it.
  private var events: Channel?

  /// Whether `AVAudioSession` is currently activated by us.
  private var sessionActive = false

  /// What the metronome wants: 48 kHz, and a buffer short enough that the
  /// click lands where the eye expects it. These are *preferred* values —
  /// iOS is free to give something else, and what it actually granted is
  /// logged so a device run can be read after the fact.
  private static let preferredSampleRate = 48000.0
  private static let preferredBufferDuration = 0.005

  override init() {
    super.init()
    // Before anything opens an output stream. The engine's cpal stream is
    // built during Tauri's setup, and an AudioUnit takes the session's format
    // as it finds it — so the category and the two preferred values are set
    // here, at plugin construction, rather than on the first press of play.
    configureSession()
    observeSystem()
  }

  override func load(webview: WKWebView) {
    // The category can be reset by the system across a media-services reset,
    // so re-assert it once the webview exists too. Setting it twice is free.
    configureSession()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    deactivateSession()
  }

  // -----------------------------------------------------------------------
  // Commands
  // -----------------------------------------------------------------------

  @objc public func setBackgroundAudio(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(BackgroundAudioArgs.self)
    if args.active {
      activateSession()
    } else {
      deactivateSession()
    }
    invoke.resolve()
  }

  @objc public func keepAwake(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ToggleArgs.self)
    DispatchQueue.main.async {
      UIApplication.shared.isIdleTimerDisabled = args.active
    }
    invoke.resolve()
  }

  @objc public func openUrl(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(OpenUrlArgs.self)
    guard let url = URL(string: args.url), let scheme = url.scheme?.lowercased(),
      scheme == "https" || scheme == "http"
    else {
      // Same rule as the Android half: every caller is an About or support
      // link, and an app that hands any string it is given to the system is
      // an app that can be talked into opening something else.
      invoke.reject("only http and https links can be opened")
      return
    }
    DispatchQueue.main.async {
      UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
    invoke.resolve()
  }

  /// Deliberately a no-op. iOS has no Back gesture; the command exists so the
  /// shared frontend does not have to know that.
  @objc public func setBackIntercept(_ invoke: Invoke) throws {
    _ = try invoke.parseArgs(ToggleArgs.self)
    invoke.resolve()
  }

  @objc public func setEventChannel(_ invoke: Invoke) throws {
    events = try invoke.parseArgs(EventChannelArgs.self).channel
    invoke.resolve()
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private func emit(_ payload: JSObject) {
    events?.send(payload)
  }

  private func interrupted(_ kind: String) {
    // Loud on purpose, exactly as on Android: an interruption is the one
    // thing here that cannot be reproduced from the app's own side, so on a
    // device this line is the whole diagnosis.
    NSLog("[YamesMobile] audio interrupted -> %@", kind)
    emit(["event": "audio_interrupted", "kind": kind])
  }

  /// `.playback` / `.default`: the click is media, it ignores the silent
  /// switch, and it does not duck or mix with anything else by default.
  private func configureSession() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playback, mode: .default, options: [])
      try session.setPreferredSampleRate(Self.preferredSampleRate)
      try session.setPreferredIOBufferDuration(Self.preferredBufferDuration)
    } catch {
      NSLog("[YamesMobile] could not configure the audio session: %@", "\(error)")
    }
  }

  private func activateSession() {
    guard !sessionActive else { return }
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setActive(true, options: [])
      sessionActive = true
      // asked-vs-granted, the way the Android half prints its Oboe modes:
      // iOS honours neither value on demand, and on a device this is the
      // only place the real numbers appear.
      NSLog(
        "[YamesMobile] audio session active; asked %.0f Hz / %.1f ms, got %.0f Hz / %.2f ms",
        Self.preferredSampleRate, Self.preferredBufferDuration * 1000,
        session.sampleRate, session.ioBufferDuration * 1000)
    } catch {
      NSLog("[YamesMobile] could not activate the audio session: %@", "\(error)")
    }
  }

  private func deactivateSession() {
    guard sessionActive else { return }
    sessionActive = false
    do {
      // `.notifyOthersOnDeactivation` so whatever stood aside for the
      // metronome — a podcast, a backing track in another app — is told it
      // can come back.
      try AVAudioSession.sharedInstance().setActive(
        false, options: [.notifyOthersOnDeactivation])
    } catch {
      NSLog("[YamesMobile] could not deactivate the audio session: %@", "\(error)")
    }
  }

  private func observeSystem() {
    let centre = NotificationCenter.default
    centre.addObserver(
      self, selector: #selector(handleInterruption(_:)),
      name: AVAudioSession.interruptionNotification, object: nil)
    centre.addObserver(
      self, selector: #selector(handleRouteChange(_:)),
      name: AVAudioSession.routeChangeNotification, object: nil)
  }

  /// A call, a timer, Siri. The same two kinds the Android half reports from
  /// audio focus, so the frontend handler is shared and unchanged.
  @objc private func handleInterruption(_ note: Notification) {
    guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
      let type = AVAudioSession.InterruptionType(rawValue: raw)
    else { return }

    switch type {
    case .began:
      // iOS has already stopped our audio by the time this arrives.
      sessionActive = false
      interrupted("focus_lost")
    case .ended:
      let options = AVAudioSession.InterruptionOptions(
        rawValue: note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
      guard options.contains(.shouldResume) else {
        // The system says do not resume — a call still in progress, or
        // another app that took over. Stay paused; the frontend keeps its
        // "the pause was ours" flag and the user's next press of play
        // clears it.
        NSLog("[YamesMobile] interruption ended without shouldResume; staying paused")
        return
      }
      activateSession()
      interrupted("focus_gained")
    @unknown default:
      break
    }
  }

  /// Headphones pulled out of the socket, or a Bluetooth device walking away.
  /// Pause — which is what every music app does, and what a player expects.
  @objc private func handleRouteChange(_ note: Notification) {
    guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
      let reason = AVAudioSession.RouteChangeReason(rawValue: raw)
    else { return }
    if reason == .oldDeviceUnavailable {
      interrupted("focus_lost")
    }
  }
}

// ---------------------------------------------------------------------------
// Argument types — the same JSON the Kotlin half parses, so the Rust half has
// one payload shape for both phones.
// ---------------------------------------------------------------------------

struct BackgroundAudioArgs: Decodable {
  let active: Bool
  /// Android puts these in the notification shade. iOS has nowhere to put
  /// them, and decodes them only so the two halves take the same payload.
  var title: String?
  var body: String?
  var stopLabel: String?
  var channelName: String?
}

struct ToggleArgs: Decodable {
  let active: Bool
}

struct OpenUrlArgs: Decodable {
  let url: String
}

struct EventChannelArgs: Decodable {
  let channel: Channel
}

@_cdecl("init_plugin_yames_mobile")
func initPlugin() -> Plugin {
  return YamesMobilePlugin()
}
