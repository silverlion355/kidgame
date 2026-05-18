# Proguard rules for kidgame app
# Add rules below as needed

# Keep TextToSpeech service
-keep class android.speech.tts.** { *; }

# Keep WebView JavaScript interfaces
-keep class com.kidgame.app.MainActivity$* { *; }

# Keep all JavaScript interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}