import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

/**
 * The one version string, read from `src-tauri/tauri.conf.json`.
 *
 * `tauri.properties` is written by the Tauri CLI during a build and is git-
 * ignored, so it is absent whenever gradle is driven on its own (Android
 * Studio sync, `./gradlew tasks`, a CI step that syncs before it builds) and
 * the defaults below would silently ship "1.0" / versionCode 1. Reading the
 * config the whole project already versions from removes that failure mode:
 * package.json, Cargo.toml and tauri.conf.json carry the same string, and
 * this is the file gradle can see from here.
 */
val yamesVersionName: String = run {
    tauriProperties.getProperty("tauri.android.versionName")
        ?: run {
            val conf = file("../../../tauri.conf.json")
            if (conf.exists()) {
                Regex("\"version\"\\s*:\\s*\"([^\"]+)\"")
                    .find(conf.readText())?.groupValues?.get(1)
            } else {
                null
            }
        }
        ?: "0.0.0"
}

/**
 * Play accepts a build only if its versionCode is strictly greater than every
 * code already uploaded, and it can never be reused — so it has to come from
 * the version string rather than from a counter somebody has to remember to
 * bump. major*10000 + minor*100 + patch (1.0.4 -> 10004) is monotonic for any
 * release where minor and patch stay under 100, reads back to a human, and
 * leaves room for four more digits of major before it would ever approach
 * Play's 2100000000 ceiling.
 */
val yamesVersionCode: Int = run {
    val parts = yamesVersionName.substringBefore('-').split('.')
    val major = parts.getOrNull(0)?.toIntOrNull() ?: 0
    val minor = parts.getOrNull(1)?.toIntOrNull() ?: 0
    val patch = parts.getOrNull(2)?.toIntOrNull() ?: 0
    require(minor < 100 && patch < 100) {
        "versionCode scheme needs minor and patch below 100, got $yamesVersionName"
    }
    major * 10000 + minor * 100 + patch
}

/**
 * The test channel (`YAMES_CHANNEL=beta`, set only by .github/workflows/beta.yml).
 *
 * A beta is `X.Y.Z-beta.N`, where X.Y.Z is the minor after the current stable
 * and N is the workflow's run number, so every build is a new N. Its
 * versionCode is the stable code of X.Y.Z times 10000, plus N:
 *
 *     1.3.0-beta.57  ->  10300 * 10000 + 57  =  103000057
 *
 * That increases with every run (N always does, and X.Y.Z never goes down),
 * stays far above every stable code there will be for years (1.2.2 is
 * 10202), and is below Play's 2100000000 ceiling for any major under 21.
 * The two channels never update into each other anyway: betas are signed
 * with the test key, stable with the upload key.
 *
 * With the variable unset nothing below changes: stable's code, name and
 * manifest are exactly what they were.
 */
val yamesChannel: String = System.getenv("YAMES_CHANNEL")?.trim()?.lowercase().orEmpty()
val isBetaBuild: Boolean = yamesChannel == "beta"

val yamesBetaVersionName: String? =
    if (isBetaBuild) System.getenv("YAMES_VERSION")?.trim()?.takeIf { it.isNotEmpty() } ?: yamesVersionName else null

val yamesBetaVersionCode: Int? = if (!isBetaBuild) null else run {
    val name = yamesBetaVersionName!!
    val n = Regex("-beta\\.(\\d+)$").find(name)?.groupValues?.get(1)?.toIntOrNull()
    require(n != null && n in 1..9999) {
        "YAMES_CHANNEL=beta needs a version X.Y.Z-beta.N with N in 1..9999, got $name"
    }
    val parts = name.substringBefore('-').split('.')
    val base = (parts.getOrNull(0)?.toIntOrNull() ?: 0) * 10000 +
        (parts.getOrNull(1)?.toIntOrNull() ?: 0) * 100 +
        (parts.getOrNull(2)?.toIntOrNull() ?: 0)
    val code = base.toLong() * 10000 + n
    require(code in 10203..2_100_000_000L) { "beta versionCode $code is out of range" }
    code.toInt()
}

/**
 * Release signing, entirely from the environment — nothing about the upload
 * key lives in the repo, not the keystore, not a path to it, not a password.
 * CI decodes `ANDROID_KEYSTORE_BASE64` into a temp file and exports these
 * four; locally you export the same four against your own keystore.
 *
 * If they are absent the release build still runs and produces an *unsigned*
 * APK/AAB, which is what a contributor building from a clone should get. A
 * missing keystore is not a build failure; it is just not a shippable
 * artifact, and the file name says so (`app-universal-release-unsigned.apk`).
 */
val keystorePath: String? = System.getenv("ANDROID_KEYSTORE_PATH")?.takeIf { it.isNotBlank() }
val keystorePassword: String? = System.getenv("ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias: String? = System.getenv("ANDROID_KEY_ALIAS")?.takeIf { it.isNotBlank() }
val releaseKeyPassword: String? = System.getenv("ANDROID_KEY_PASSWORD")
val hasReleaseSigning: Boolean =
    keystorePath != null && keystorePassword != null && releaseKeyAlias != null && releaseKeyPassword != null

android {
    compileSdk = 36
    namespace = "com.yames.metronome"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.yames.metronome"
        minSdk = 24
        targetSdk = 36
        versionCode = yamesBetaVersionCode ?: yamesVersionCode
        versionName = yamesBetaVersionName ?: yamesVersionName
    }
    // A test build only: REQUEST_INSTALL_PACKAGES, so it can install the next
    // beta it downloads. Merged on top of src/main for both build types; a
    // stable or Play build never reads this file.
    if (isBetaBuild) {
        sourceSets.getByName("release").manifest.srcFile("src/beta/AndroidManifest.xml")
        sourceSets.getByName("debug").manifest.srcFile("src/beta/AndroidManifest.xml")
    }
    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(keystorePath!!)
                storePassword = keystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
                // v2 is the whole signature. v1 (the old JAR scheme) exists for
                // Android 6 and earlier, which minSdk 24 already excludes, and
                // asking for it here produced an APK that `apksigner verify`
                // still reported as "v1 scheme: false" — AGP knows it is not
                // needed. Said out loud rather than left as a flag that reads
                // as true and is not.
                enableV1Signing = false
                enableV2Signing = true
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = true
            // R8 strips unreached resources as well as unreached code. Safe for
            // the web half: everything the WebView loads lives in `assets/`,
            // which the resource shrinker does not touch — only `res/` is in
            // scope, and what Yames keeps there is the launcher icon, the
            // notification icon and two strings, all referenced from code or
            // the manifest.
            isShrinkResources = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")