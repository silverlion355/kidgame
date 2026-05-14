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
import android.widget.Toast;
import android.os.Handler;
import android.os.Looper;

import java.util.HashMap;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "KidGameTTS";
    private WebView webView;
    private TextToSpeech tts;
    private boolean ttsReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        Log.d(TAG, "Creating activity...");

        // Setup WebView first
        webView = findViewById(R.id.webview);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        // 允许访问内容
        settings.setAllowContentAccess(true);

        // 设置WebView语音支持
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Add JavaScript interface for TTS
        webView.addJavascriptInterface(new TTSEngine(), "AndroidTTS");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                Log.d(TAG, "Page loaded: " + url);
                // 页面加载完成后，如果TTS已经就绪，通知页面
                if (ttsReady) {
                    notifyTTSReady();
                }
            }
        });

        // Load the kidgame HTML file from assets
        webView.loadUrl("file:///android_asset/kidgame/index.html");

        // Initialize Android TTS
        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                Log.d(TAG, "TTS init status: " + status);
                if (status == TextToSpeech.SUCCESS) {
                    ttsReady = true;

                    // 设置UtteranceProgressListener来监听语音状态
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override
                        public void onStart(String utteranceId) {
                            Log.d(TAG, "TTS started: " + utteranceId);
                        }

                        @Override
                        public void onDone(String utteranceId) {
                            Log.d(TAG, "TTS completed: " + utteranceId);
                            // 通知JS语音播放完成
                            final String id = utteranceId;
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    webView.evaluateJavascript("if(window.onTTSComplete) window.onTTSComplete('" + id + "');", null);
                                }
                            });
                        }

                        @Override
                        public void onError(String utteranceId) {
                            Log.e(TAG, "TTS error: " + utteranceId);
                        }
                    });

                    // 测试语音是否可用
                    int enResult = tts.isLanguageAvailable(Locale.US);
                    int zhResult = tts.isLanguageAvailable(Locale.CHINA);
                    Log.d(TAG, "English availability: " + enResult + " (LANG_AVAILABLE=" + TextToSpeech.LANG_AVAILABLE + ")");
                    Log.d(TAG, "Chinese availability: " + zhResult);

                    // 通知页面TTS已就绪
                    notifyTTSReady();

                    // 如果需要，可以在这里进行一次测试朗读
                    Log.d(TAG, "TTS is ready! Speaking test...");
                    // 简短测试
                    tts.speak("ready", TextToSpeech.QUEUE_FLUSH, null, "tts-test");
                    tts.stop(); // 立即停止测试
                } else {
                    Log.e(TAG, "TTS init failed with status: " + status);
                    notifyTTSFailed();
                }
            }
        });
    }

    private void notifyTTSReady() {
        if (webView != null) {
            webView.post(new Runnable() {
                @Override
                public void run() {
                    webView.evaluateJavascript("if(window.onAndroidTTSReady) window.onAndroidTTSReady();", null);
                }
            });
        }
    }

    private void notifyTTSFailed() {
        if (webView != null) {
            webView.post(new Runnable() {
                @Override
                public void run() {
                    webView.evaluateJavascript("if(window.onAndroidTTSFailed) window.onAndroidTTSFailed();", null);
                }
            });
        }
    }

    // JavaScript interface for TTS
    private class TTSEngine {
        @JavascriptInterface
        public boolean isAvailable() {
            Log.d(TAG, "isAvailable called, returning: " + ttsReady);
            return ttsReady;
        }

        @JavascriptInterface
        public void speak(String text, String lang) {
            Log.d(TAG, "speak called: text='" + text + "', lang='" + lang + "', ttsReady=" + ttsReady);
            if (!ttsReady) {
                Log.w(TAG, "TTS not ready, cannot speak");
                return;
            }
            if (text == null || text.isEmpty()) {
                Log.w(TAG, "Empty text, cannot speak");
                return;
            }

            try {
                Locale locale;
                if (lang != null && lang.toLowerCase().startsWith("en")) {
                    locale = Locale.US;
                } else {
                    locale = Locale.CHINA;
                }

                // 检查语言是否可用
                int avail = tts.isLanguageAvailable(locale);
                Log.d(TAG, "Language " + locale + " availability: " + avail);

                if (avail >= TextToSpeech.LANG_AVAILABLE) {
                    tts.setLanguage(locale);
                } else if (avail >= TextToSpeech.LANG_COUNTRY_AVAILABLE) {
                    // 尝试使用可用的变体
                    tts.setLanguage(locale);
                } else {
                    // 语言不可用，尝试默认
                    Log.w(TAG, "Language not available, using default");
                    tts.setLanguage(Locale.getDefault());
                }

                // 使用QUEUE_FLUSH确保新语音会打断旧语音
                HashMap<String, String> params = new HashMap<>();
                params.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "tts-" + System.currentTimeMillis());
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, params);

                Log.d(TAG, "Speaking: " + text);
            } catch (Exception e) {
                Log.e(TAG, "Error speaking: " + e.getMessage(), e);
            }
        }

        @JavascriptInterface
        public void stop() {
            if (tts != null) {
                tts.stop();
                Log.d(TAG, "TTS stopped");
            }
        }

        @JavascriptInterface
        public void test() {
            Log.d(TAG, "Test method called");
            if (ttsReady) {
                speak("测试", "zh-CN");
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