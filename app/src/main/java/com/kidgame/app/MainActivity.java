package com.kidgame.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;
import androidx.appcompat.app.AppCompatActivity;

import java.util.HashMap;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private TextToSpeech tts;
    private boolean ttsReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Initialize Android TTS
        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                if (status == TextToSpeech.SUCCESS) {
                    ttsReady = true;
                    Log.d("KidGameTTS", "TTS initialized successfully");
                } else {
                    Log.e("KidGameTTS", "TTS initialization failed: " + status);
                }
            }
        });

        webView = findViewById(R.id.webview);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // Add JavaScript interface for TTS
        webView.addJavascriptInterface(new TTSEngine(), "AndroidTTS");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }
        });

        // Load the kidgame HTML file from assets
        webView.loadUrl("file:///android_asset/kidgame/index.html");
    }

    // JavaScript interface for TTS
    private class TTSEngine {
        @JavascriptInterface
        public boolean isAvailable() {
            return ttsReady;
        }

        @JavascriptInterface
        public void speak(String text, String lang) {
            if (!ttsReady || text == null || text.isEmpty()) return;
            Locale locale = lang != null && lang.startsWith("en") ? Locale.ENGLISH : Locale.SIMPLIFIED_CHINESE;
            tts.setLanguage(locale);
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "kidgame-utterance");
            Log.d("KidGameTTS", "Speaking: " + text + " (lang=" + lang + ")");
        }

        @JavascriptInterface
        public void stop() {
            if (tts != null) {
                tts.stop();
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.onDestroy();
    }
}
