package com.yames.metronome.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import app.tauri.plugin.Channel
import app.tauri.plugin.JSObject
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * The in-app update of a TEST build (the `beta` channel): read the feed,
 * download the APK into the cache, open the system installer on it.
 *
 * Every entry point first asks [isTestBuild]. Only the beta build's manifest
 * declares `REQUEST_INSTALL_PACKAGES` (it is merged in from
 * `gen/android/app/src/beta/AndroidManifest.xml` when gradle runs with
 * `YAMES_CHANNEL=beta`), so on the stable APK and the Play bundle all three
 * refuse before they touch the network. Play's policy is about the
 * permission, and the permission is simply not in those builds.
 *
 * The installer does the real checking: it refuses an APK whose signature is
 * not the installed one's, and one whose versionCode is not higher. What is
 * checked here is what the installer cannot know — that the file is the one
 * the feed described (sha256, size) — plus the package name and versionCode,
 * so a mismatch is reported in words rather than as the installer's generic
 * "App not installed".
 */
internal class BetaUpdate(private val activity: Activity) {
    private companion object {
        const val TAG = "YamesBeta"
        const val APK_DIR = "beta-update"
        const val APK_NAME = "yames-beta.apk"
        const val FEED_LIMIT = 64 * 1024
        const val TIMEOUT_MS = 15_000
    }

    private val apkFile: File
        get() = File(File(activity.cacheDir, APK_DIR), APK_NAME)

    /** Whether this package asks for REQUEST_INSTALL_PACKAGES at all. */
    fun isTestBuild(): Boolean =
        try {
            val info = packageInfo(PackageManager.GET_PERMISSIONS)
            info.requestedPermissions?.contains(Manifest.permission.REQUEST_INSTALL_PACKAGES) == true
        } catch (e: Exception) {
            false
        }

    /** Android 8+ asks per app; before that the global "unknown sources" switch decides at install time. */
    fun canInstall(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.packageManager.canRequestPackageInstalls()
        } else {
            true
        }

    fun installedVersionCode(): Long = versionCodeOf(packageInfo(0))

    /** GET the feed, return it with what is installed. Blocking: call off the main thread. */
    fun probe(url: String): JSObject {
        requireHttps(url)
        val text = httpGet(url).use { conn ->
            conn.inputStream.use { input ->
                val bytes = input.readBytesLimited(FEED_LIMIT)
                String(bytes, Charsets.UTF_8)
            }
        }
        val feed = JSONObject(text)
        val result = JSObject()
        result.put("installedVersionCode", installedVersionCode())
        result.put("installedVersionName", packageInfo(0).versionName ?: "")
        result.put("canInstall", canInstall())
        result.put("version", feed.optString("version", ""))
        result.put("versionCode", feed.optLong("versionCode", 0))
        result.put("url", feed.optString("url", ""))
        result.put("sha256", feed.optString("sha256", "").lowercase())
        result.put("size", feed.optLong("size", 0))
        result.put("notes", feed.optString("notes", ""))
        return result
    }

    /** Download, verify, keep. Blocking: call off the main thread. */
    fun download(url: String, sha256: String, size: Long, versionCode: Long, progress: Channel?): JSObject {
        requireHttps(url)
        val expected = sha256.trim().lowercase()
        require(Regex("^[0-9a-f]{64}$").matches(expected)) { "the feed gave no usable sha256" }

        val dir = apkFile.parentFile!!
        dir.mkdirs()
        // One APK at a time: whatever an earlier attempt left is stale.
        dir.listFiles()?.forEach { it.delete() }
        val part = File(dir, "$APK_NAME.part")

        val digest = MessageDigest.getInstance("SHA-256")
        var received = 0L
        httpGet(url).use { conn ->
            val total = if (size > 0) size else conn.contentLengthLong
            var lastSent = 0L
            var lastPercent = -1
            conn.inputStream.use { input ->
                FileOutputStream(part).use { out ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        out.write(buffer, 0, n)
                        digest.update(buffer, 0, n)
                        received += n
                        if (size > 0 && received > size) {
                            throw IllegalStateException("the download is larger than the feed said")
                        }
                        val percent = if (total > 0) ((received * 100) / total).toInt() else -1
                        val now = System.currentTimeMillis()
                        if (percent != lastPercent && now - lastSent >= 150) {
                            lastSent = now
                            lastPercent = percent
                            progress?.send(JSObject().put("received", received).put("total", total))
                        }
                    }
                }
            }
            progress?.send(JSObject().put("received", received).put("total", total))
        }

        try {
            if (size > 0 && received != size) {
                throw IllegalStateException("the download is $received bytes, the feed said $size")
            }
            val actual = digest.digest().joinToString("") { "%02x".format(it) }
            if (actual != expected) {
                throw IllegalStateException("the download does not match its sha256")
            }
            val archive = archiveInfo(part)
                ?: throw IllegalStateException("the download is not an Android package")
            if (archive.packageName != activity.packageName) {
                throw IllegalStateException("the download is a different app (${archive.packageName})")
            }
            val code = versionCodeOf(archive)
            if (versionCode > 0 && code != versionCode) {
                throw IllegalStateException("the download is build $code, the feed said $versionCode")
            }
            if (code <= installedVersionCode()) {
                throw IllegalStateException("the download is not newer than this build")
            }
            if (!part.renameTo(apkFile)) throw IllegalStateException("could not keep the download")
        } catch (e: Exception) {
            part.delete()
            throw e
        }
        Log.i(TAG, "beta APK downloaded and verified: $received bytes")
        return JSObject().put("bytes", received)
    }

    /**
     * Open the installer, or the setting that allows it. Main thread.
     *
     * `needsPermission` means the user was sent to "Install unknown apps" for
     * Yames; they come back and press Update again (the APK is still in the
     * cache, so that second press does not download it twice).
     */
    fun install(): JSObject {
        val file = apkFile
        if (!file.exists()) throw IllegalStateException("there is no downloaded update")
        // Android 8+: per-app "Install unknown apps". Before that the global
        // switch is asked about by the installer itself.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()) {
            val intent =
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
            return JSObject().put("started", false).put("needsPermission", true)
        }
        // `${applicationId}.fileprovider` is the provider every Tauri Android
        // app declares (`gen/android/app/src/main/AndroidManifest.xml`), and
        // its `cache-path` covers `cacheDir/beta-update/`.
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
        val intent =
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(intent)
        return JSObject().put("started", true).put("needsPermission", false)
    }

    /** Is a verified APK already waiting in the cache? */
    fun hasDownload(): Boolean = apkFile.exists()

    // -----------------------------------------------------------------------

    private fun requireHttps(url: String) {
        // Only the GitHub release feed is ever passed in; anything that is not
        // https is refused rather than fetched.
        require(Uri.parse(url).scheme == "https") { "only https addresses can be fetched" }
    }

    private fun httpGet(url: String): HttpURLConnection {
        // GitHub answers a release download with a redirect to its asset host;
        // HttpURLConnection follows https -> https on its own.
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.instanceFollowRedirects = true
        conn.connectTimeout = TIMEOUT_MS
        conn.readTimeout = TIMEOUT_MS
        conn.useCaches = false
        conn.setRequestProperty("Accept", "application/octet-stream, application/json")
        val status = conn.responseCode
        if (status !in 200..299) {
            conn.disconnect()
            throw IllegalStateException("the server answered $status")
        }
        return conn
    }

    private inline fun <T> HttpURLConnection.use(block: (HttpURLConnection) -> T): T =
        try {
            block(this)
        } finally {
            disconnect()
        }

    private fun java.io.InputStream.readBytesLimited(limit: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(8 * 1024)
        while (true) {
            val n = read(buffer)
            if (n < 0) break
            out.write(buffer, 0, n)
            if (out.size() > limit) throw IllegalStateException("the feed is larger than expected")
        }
        return out.toByteArray()
    }

    @Suppress("DEPRECATION")
    private fun packageInfo(flags: Int): PackageInfo =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.packageManager.getPackageInfo(
                activity.packageName,
                PackageManager.PackageInfoFlags.of(flags.toLong()),
            )
        } else {
            activity.packageManager.getPackageInfo(activity.packageName, flags)
        }

    @Suppress("DEPRECATION")
    private fun archiveInfo(file: File): PackageInfo? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.packageManager.getPackageArchiveInfo(file.path, PackageManager.PackageInfoFlags.of(0))
        } else {
            activity.packageManager.getPackageArchiveInfo(file.path, 0)
        }

    @Suppress("DEPRECATION")
    private fun versionCodeOf(info: PackageInfo): Long =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()
}
