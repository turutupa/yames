package com.yames.metronome

import android.graphics.Color
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Light status and navigation bar icons from the first frame: the default
    // theme, and most of the others, are dark. The no-argument form follows
    // the *system's* dark mode instead, and a phone in light mode drew dark
    // icons on the app's black. A light theme switches them through the
    // yames-mobile plugin's `setLightSystemBars` once the webview has loaded.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)
  }
}
