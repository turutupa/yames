package com.yames.metronome.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
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
    ],
)
class YamesMobilePlugin(private val activity: Activity) : Plugin(activity) {
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

    /** Kept so the permission callback can finish the play the user asked for. */
    private var pendingStart: BackgroundAudioArgs? = null

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
            emit(JSObject().put("event", "audio_interrupted").put("kind", kind))
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

    override fun load(webView: WebView) {
        activity.runOnUiThread {
            (activity as? AppCompatActivity)?.onBackPressedDispatcher?.addCallback(backCallback)
        }
        ClickService.onStopRequested = {
            emit(JSObject().put("event", "stop_requested"))
        }
    }

    override fun onDestroy() {
        ClickService.onStopRequested = null
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
            return
        }

        // Ask for the notification permission the first time and only the
        // first time: once the user has answered, `getPermissionState` stops
        // returning PROMPT and playback proceeds either way. A denied prompt
        // costs the row in the shade, not the click.
        val needsPrompt =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                getPermissionState("notifications") == PermissionState.PROMPT
        if (needsPrompt) {
            pendingStart = args
            requestPermissionForAlias("notifications", invoke, "notificationPermissionResult")
            return
        }

        startPlayback(args)
        invoke.resolve()
    }

    @PermissionCallback
    fun notificationPermissionResult(invoke: Invoke) {
        pendingStart?.let { startPlayback(it) }
        pendingStart = null
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
        invoke.resolve()
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------

    private fun emit(payload: JSObject) {
        events?.send(payload)
    }

    private fun startPlayback(args: BackgroundAudioArgs) {
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
    }
}
