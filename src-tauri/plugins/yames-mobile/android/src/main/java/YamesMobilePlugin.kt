package com.yames.metronome.mobile

import android.Manifest
import android.app.Activity
import android.content.ComponentCallbacks2
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class BackgroundAudioArgs {
    var active: Boolean = false
    var title: String = ""
    var body: String = ""
    var stopLabel: String = ""
    var channelName: String = ""
}

@InvokeArg
class ToggleArgs {
    var active: Boolean = false
}

@InvokeArg
class OpenUrlArgs {
    var url: String = ""
}

@InvokeArg
class EventChannelArgs {
    lateinit var channel: Channel
}

/**
 * The Android half of the `yames-mobile` plugin.
 *
 * Five commands and three events, and every one of them is here because the
 * M00 spike found the app losing the beat without it. See the Rust half
 * (`src/lib.rs`) for the whole list and the reasoning.
 *
 * Nothing in this file runs on the audio thread, touches the engine, or knows
 * what tempo is playing. It keeps the process alive, it asks the system for
 * the right to make a sound, it keeps the screen on, and it answers Back.
 */
@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications"),
        // M7: the Session is graded from the guitar, through the built-in mic,
        // a USB-C interface or a headset-jack adapter. Asked for when the
        // first-run input step or a Session first opens the input, never at
        // launch.
        Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone"),
    ],
)
class YamesMobilePlugin(private val activity: Activity) : Plugin(activity) {
    private companion object {
        const val TAG = "YamesMobile"
        const val PREFS = "yames_mobile"
        const val PREF_ASKED_NOTIFICATIONS = "asked_notifications"
        const val NOTIFICATIONS_REQUEST_CODE = 0x7a01
    }

    private val audioManager: AudioManager
        get() = activity.getSystemService(Activity.AUDIO_SERVICE) as AudioManager

    private var focusRequest: AudioFocusRequest? = null
    private var holdingFocus = false

    /**
     * The one way back to the webview. Opened once at startup by
     * `set_event_channel`; every event below is a tagged message through it.
     */
    @Volatile
    private var events: Channel? = null

    /** Whether the app has something open that Back should close first. */
    @Volatile
    private var backIntercept = false

    /** Whether the click service is running (a Take or the metronome is playing). */
    private var playing = false

    /** Between `onResume` and `onStop`: the activity is on the screen. */
    private var onScreen = false

    /**
     * Set when the app went to the background with the click running and
     * Android 13+ had not yet been asked about notifications: the one moment
     * the shade row was actually needed and could not be shown. The question
     * is put the next time the click stops with the app on screen, never
     * during first run and never while a Take or the metronome is playing.
     */
    private var notificationWasNeeded = false

    /**
     * The last system-bar insets measured, kept because they are measured
     * before the webview asks for them.
     *
     * The first layout pass happens while the page is still loading, so the
     * one event that matters most — the one that tells the app where the
     * status bar and the gesture bar are before it draws anything — would be
     * sent into a channel that does not exist yet. `setEventChannel` replays
     * this.
     */
    @Volatile
    private var lastInsets: JSObject? = null

    private val focusListener =
        AudioManager.OnAudioFocusChangeListener { change ->
            // Three kinds, not the four the brief sketched. A phone call does
            // not arrive as its own signal: the dialer takes transient focus
            // like any other app, and telling the two apart would mean asking
            // for READ_PHONE_STATE — a permission a metronome has no business
            // holding, to draw a distinction the frontend does not act on.
            val kind =
                when (change) {
                    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
                    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK,
                    -> "focus_lost"
                    AudioManager.AUDIOFOCUS_GAIN -> "focus_gained"
                    AudioManager.AUDIOFOCUS_LOSS -> "focus_lost_permanently"
                    else -> return@OnAudioFocusChangeListener
                }
            // Loud on purpose: audio focus is the one thing here that cannot
            // be reproduced from the app's own side, so when a phone does
            // something surprising this line is the whole diagnosis.
            Log.i(TAG, "audio focus change $change -> $kind")
            emit(JSObject().put("event", "audio_interrupted").put("kind", kind))
        }

    /**
     * A USB interface, a jack adapter or headphones in or out (M7).
     *
     * Android reroutes on its own and, on the fast path, closes the streams
     * it rerouted: the Rust side reopens those itself (`android_route.rs`).
     * What this adds is the LIST: the input picker and the first-run step
     * show what is plugged in now, without the player reopening a screen.
     * Registered with a main-looper handler; it is called once with every
     * device present when it registers, which is harmless — a refresh.
     */
    private val deviceCallback =
        object : AudioDeviceCallback() {
            override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) {
                emit(JSObject().put("event", "audio_devices_changed"))
            }

            override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) {
                emit(JSObject().put("event", "audio_devices_changed"))
            }
        }

    private val backCallback =
        object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // M00: Back finished the activity mid-click and the process
                // was gone. A metronome on a music stand must not be one
                // stray edge-swipe from silence.
                if (backIntercept) {
                    emit(JSObject().put("event", "back_pressed"))
                } else {
                    activity.moveTaskToBack(true)
                }
            }
        }

    /**
     * What the system says when it wants memory back.
     *
     * The honest signal for "the band may go now". A decoded backing band is
     * tens of megabytes of samples, and the biggest background process is the
     * first one Android kills — so the app is told when its UI is gone
     * (`TRIM_MEMORY_UI_HIDDEN` and above) and when the phone is short while
     * the app is still on screen (`RUNNING_LOW` / `RUNNING_CRITICAL`). What to
     * do about it is the frontend's call, in `src/mobile/bandMemory.ts`;
     * nothing here knows what a jam is.
     */
    private val memoryCallbacks =
        object : ComponentCallbacks2 {
            override fun onTrimMemory(level: Int) {
                emit(JSObject().put("event", "memory_trim").put("level", level))
            }

            override fun onConfigurationChanged(newConfig: Configuration) {}

            @Deprecated("Superseded by onTrimMemory, and still called on older phones")
            override fun onLowMemory() {
                emit(
                    JSObject()
                        .put("event", "memory_trim")
                        .put("level", ComponentCallbacks2.TRIM_MEMORY_COMPLETE),
                )
            }
        }

    override fun load(webView: WebView) {
        activity.runOnUiThread {
            (activity as? AppCompatActivity)?.onBackPressedDispatcher?.addCallback(backCallback)
            watchWindowInsets()
        }
        activity.registerComponentCallbacks(memoryCallbacks)
        audioManager.registerAudioDeviceCallback(deviceCallback, Handler(Looper.getMainLooper()))
        ClickService.onStopRequested = {
            emit(JSObject().put("event", "stop_requested"))
        }
    }

    /**
     * On screen / off screen, straight from the activity's own lifecycle.
     *
     * `onStop` and not `onPause`: a permission dialog over the app pauses it
     * without hiding it, and a band let go for a dialog that closes a second
     * later would be a re-decode nobody asked for. `onStop` is the activity
     * really being gone from the screen.
     */
    override fun onResume() {
        onScreen = true
        emit(JSObject().put("event", "app_visible").put("visible", true))
    }

    override fun onStop() {
        onScreen = false
        if (playing && notificationsUnasked()) notificationWasNeeded = true
        emit(JSObject().put("event", "app_visible").put("visible", false))
    }

    override fun onDestroy() {
        ClickService.onStopRequested = null
        activity.unregisterComponentCallbacks(memoryCallbacks)
        audioManager.unregisterAudioDeviceCallback(deviceCallback)
        abandonFocus()
        stopService()
    }

    // -----------------------------------------------------------------------
    // Commands
    // -----------------------------------------------------------------------

    @Command
    fun setBackgroundAudio(invoke: Invoke) {
        val args = invoke.parseArgs(BackgroundAudioArgs::class.java)
        if (!args.active) {
            abandonFocus()
            stopService()
            invoke.resolve()
            maybeAskForNotifications()
            return
        }

        // No permission prompt here. It used to be asked on the first play,
        // which put a system dialog over the player's first Take. The service
        // runs and the click plays without the permission; what is missing
        // is only the row in the shade, and that is asked for once it has
        // been needed (see `notificationWasNeeded`).
        startPlayback(args)
        invoke.resolve()
    }

    /** Android 13+, never granted, and this app has not put the question yet. */
    private fun notificationsUnasked(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }
        return !activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
            .getBoolean(PREF_ASKED_NOTIFICATIONS, false)
    }

    /**
     * The notification question, at a calm moment: the click has just stopped,
     * the app is on screen, and the shade row was needed earlier (the app went
     * to the background mid-click). Asked once; the answer does not matter to
     * the click, so nothing waits on it.
     */
    private fun maybeAskForNotifications() {
        if (!notificationWasNeeded || playing || !onScreen || !notificationsUnasked()) return
        notificationWasNeeded = false
        activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE).edit()
            .putBoolean(PREF_ASKED_NOTIFICATIONS, true).apply()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                NOTIFICATIONS_REQUEST_CODE,
            )
        }
    }

    /**
     * Ask for the microphone, once, and say whether it is allowed.
     *
     * Resolves `{ granted }`. Already granted: no prompt. Denied for good
     * (the user ticked "don't ask again", or said no twice on Android 11+):
     * the system shows nothing and this answers `false`, and the input step
     * says where in Android's settings to allow it.
     */
    @Command
    fun requestMicrophone(invoke: Invoke) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            resolveMicrophone(invoke)
            return
        }
        requestPermissionForAlias("microphone", invoke, "microphonePermissionResult")
    }

    @PermissionCallback
    fun microphonePermissionResult(invoke: Invoke) {
        resolveMicrophone(invoke)
    }

    private fun resolveMicrophone(invoke: Invoke) {
        val result = JSObject()
        result.put("granted", getPermissionState("microphone") == PermissionState.GRANTED)
        invoke.resolve(result)
    }

    /**
     * `active`: the app's theme is light, so the status and navigation bar
     * icons are drawn dark. `MainActivity` starts them light (most themes,
     * and the default, are dark); this follows the theme the user picked.
     */
    @Command
    fun setLightSystemBars(invoke: Invoke) {
        val light = invoke.parseArgs(ToggleArgs::class.java).active
        activity.runOnUiThread {
            val controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
            controller.isAppearanceLightStatusBars = light
            controller.isAppearanceLightNavigationBars = light
        }
        invoke.resolve()
    }

    @Command
    fun keepAwake(invoke: Invoke) {
        val args = invoke.parseArgs(ToggleArgs::class.java)
        activity.runOnUiThread {
            if (args.active) {
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
        invoke.resolve()
    }

    @Command
    fun openUrl(invoke: Invoke) {
        val args = invoke.parseArgs(OpenUrlArgs::class.java)
        val uri = Uri.parse(args.url)
        // Only the web. Every caller is an About or support link, and an app
        // that hands any string it is given to `ACTION_VIEW` is an app that
        // can be talked into launching something else.
        if (uri.scheme != "https" && uri.scheme != "http") {
            invoke.reject("only http and https links can be opened")
            return
        }
        val intent = Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            activity.startActivity(intent)
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("no app on this phone can open that link", e)
        }
    }

    @Command
    fun setBackIntercept(invoke: Invoke) {
        backIntercept = invoke.parseArgs(ToggleArgs::class.java).active
        invoke.resolve()
    }

    @Command
    fun setEventChannel(invoke: Invoke) {
        events = invoke.parseArgs(EventChannelArgs::class.java).channel
        // The bars were measured before this channel existed; the app cannot
        // lay itself out until it knows about them, so they go first.
        lastInsets?.let { emit(it) }
        activity.runOnUiThread { ViewCompat.requestApplyInsets(activity.window.decorView) }
        invoke.resolve()
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------

    private fun emit(payload: JSObject) {
        events?.send(payload)
    }

    /**
     * Tell the app where the status bar and the gesture bar actually are.
     *
     * The activity is edge-to-edge, so the webview is laid out behind both
     * system bars — and the CSS answer to that, `env(safe-area-inset-*)`, is
     * not the one it looks like. Those values describe the **display cutout**,
     * not the system bars: on the emulator `safe-area-inset-top` is the
     * camera cut-out's 128px and `safe-area-inset-bottom` is **0**, which is
     * why the gesture pill sat straight on top of the tab labels. Nothing the
     * web side can read would have told it otherwise.
     *
     * So the measurement comes from here, where the real numbers are, in CSS
     * pixels — the unit the stylesheet thinks in, which on a webview laid out
     * at `width=device-width, initial-scale=1` is the density-independent
     * pixel. `systemBars()` is the status and navigation bars;
     * `displayCutout()` is unioned in so a notch that is taller than the
     * status bar still gets cleared.
     *
     * Sent on every change rather than once: the keyboard, and a system-bar
     * mode the user changes in Android's own settings, both move these.
     */
    private fun watchWindowInsets() {
        val decor = activity.window.decorView
        ViewCompat.setOnApplyWindowInsetsListener(decor) { view, insets ->
            val bars =
                insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
                )
            val density = activity.resources.displayMetrics.density.toDouble()
            val payload = JSObject()
            payload.put("event", "window_insets")
            payload.put("top", bars.top / density)
            payload.put("right", bars.right / density)
            payload.put("bottom", bars.bottom / density)
            payload.put("left", bars.left / density)
            lastInsets = payload
            emit(payload)
            // Not consumed, and the decor view's own handling still runs:
            // this listener is here to read, not to change how the window
            // lays itself out.
            ViewCompat.onApplyWindowInsets(view, insets)
        }
        ViewCompat.requestApplyInsets(decor)
    }

    private fun startPlayback(args: BackgroundAudioArgs) {
        playing = true
        requestFocus()
        val intent =
            Intent(activity, ClickService::class.java)
                .setAction(ClickService.ACTION_START)
                .putExtra(ClickService.EXTRA_TITLE, args.title)
                .putExtra(ClickService.EXTRA_BODY, args.body)
                .putExtra(ClickService.EXTRA_STOP_LABEL, args.stopLabel)
                .putExtra(ClickService.EXTRA_CHANNEL_NAME, args.channelName)
        // A second start with new extras is how the notification's text is
        // updated when the tempo changes — the service is already running and
        // `startForeground` replaces the row rather than adding one.
        ContextCompat.startForegroundService(activity, intent)
    }

    private fun stopService() {
        playing = false
        activity.stopService(Intent(activity, ClickService::class.java))
    }

    private fun requestFocus() {
        if (holdingFocus) return
        val result =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val attributes =
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                val request =
                    AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(attributes)
                        // Yames has one volume and no duck: a metronome at
                        // half volume under a navigation prompt is a metronome
                        // you cannot play to. Pause, then come back.
                        .setWillPauseWhenDucked(true)
                        .setOnAudioFocusChangeListener(focusListener)
                        .build()
                focusRequest = request
                audioManager.requestAudioFocus(request)
            } else {
                @Suppress("DEPRECATION")
                audioManager.requestAudioFocus(
                    focusListener,
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN,
                )
            }
        holdingFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        Log.i(TAG, "audio focus requested, granted=$holdingFocus")
    }

    private fun abandonFocus() {
        if (!holdingFocus) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
            focusRequest = null
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(focusListener)
        }
        holdingFocus = false
        Log.i(TAG, "audio focus abandoned")
    }
}
