package com.yames.metronome.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * The reason the click survives the screen turning off.
 *
 * Android will freeze or kill a backgrounded process within minutes, and its
 * audio thread with it — M00 saw the emulator keep playing for eighty seconds
 * and was explicit that an emulator does not do real Doze, app-standby
 * buckets, or an OEM battery manager. A `mediaPlayback` foreground service is
 * the contract that says "this process is making a sound the user asked for",
 * and the notification is the price the platform charges for it.
 *
 * It renders nothing. The metronome is still rendered by the engine's audio
 * callback exactly as it is on a laptop; this class only keeps the process
 * alive and puts a row in the shade with a way to stop.
 *
 * Every string it shows arrives from the frontend already translated. Nothing
 * here composes text a musician reads.
 */
class ClickService : Service() {
    companion object {
        const val ACTION_START = "com.yames.metronome.mobile.START"
        const val ACTION_STOP = "com.yames.metronome.mobile.STOP"

        const val EXTRA_TITLE = "title"
        const val EXTRA_BODY = "body"
        const val EXTRA_STOP_LABEL = "stopLabel"
        const val EXTRA_CHANNEL_NAME = "channelName"

        private const val CHANNEL_ID = "yames.playback"
        private const val NOTIFICATION_ID = 1

        /**
         * Called when the user taps Stop in the shade. Set by the plugin while
         * it is loaded; a plain field rather than a broadcast because there is
         * exactly one activity and one plugin instance in this process, and a
         * receiver would be three more moving parts for the same hop.
         */
        @Volatile
        @JvmStatic
        var onStopRequested: (() -> Unit)? = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            onStopRequested?.invoke()
            stopForegroundAndSelf()
            return START_NOT_STICKY
        }

        val title = intent?.getStringExtra(EXTRA_TITLE).orEmpty()
        val body = intent?.getStringExtra(EXTRA_BODY).orEmpty()
        val stopLabel = intent?.getStringExtra(EXTRA_STOP_LABEL).orEmpty()
        val channelName = intent?.getStringExtra(EXTRA_CHANNEL_NAME).orEmpty()

        createChannel(channelName)
        val type =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            } else {
                0
            }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(title, body, stopLabel), type)

        // Not sticky: if the system does take the process anyway, it must not
        // come back as a service with a notification and no metronome behind
        // it. The user pressing play is the only thing that starts this.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
    }

    private fun stopForegroundAndSelf() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun createChannel(channelName: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        // IMPORTANCE_LOW: a row in the shade, never a heads-up card and never
        // a sound of its own. The app is already making the only sound that
        // should be coming out of it.
        val channel = NotificationChannel(CHANNEL_ID, channelName, NotificationManager.IMPORTANCE_LOW)
        channel.setShowBadge(false)
        channel.setSound(null, null)
        channel.enableVibration(false)
        manager.createNotificationChannel(channel)
    }

    private fun notification(title: String, body: String, stopLabel: String): Notification {
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val contentIntent =
            launch?.let {
                PendingIntent.getActivity(
                    this,
                    0,
                    it,
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                )
            }

        val stopIntent =
            PendingIntent.getService(
                this,
                1,
                Intent(this, ClickService::class.java).setAction(ACTION_STOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            // The Yames mark, redrawn as a flat monochrome glyph: a
            // notification's small icon keeps only the alpha channel, so the
            // launcher icon cannot be reused (it would arrive as a white
            // square). See res/drawable/ic_stat_yames.xml.
            .setSmallIcon(R.drawable.ic_stat_yames)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(contentIntent)
            .addAction(0, stopLabel, stopIntent)
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
