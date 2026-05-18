package com.kidgame.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.app.AlertDialog;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;
import androidx.appcompat.app.AppCompatActivity;
import android.widget.Toast;
import android.os.Handler;
import android.os.Looper;
import androidx.activity.OnBackPressedCallback;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import java.util.HashMap;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "KidGameTTS";
    private static final int REQUEST_RECORD_AUDIO = 1001;
    private WebView webView;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private boolean permissionRequested = false;

    // Helper: send log to JS GameStorage so user can see in app debug log
    private void jsLog(String level, String tag, String msg) {
        final String fullMsg = msg.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n");
        if (webView != null) {
            webView.post(new Runnable() {
                @Override
                public void run() {
                    String js = "GameStorage.addLog('" + level + "', '[Native:" + tag + "] " + fullMsg + "');";
                    if (webView != null) {
                        webView.evaluateJavascript(js, null);
                    }
                }
            });
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        Log.d(TAG, "Creating activity...");
        Log.d(TAG, "Manufacturer: " + Build.MANUFACTURER);
        Log.d(TAG, "Model: " + Build.MODEL);
        jsLog("info", "Activity", "onCreate: Manufacturer=" + Build.MANUFACTURER + " Model=" + Build.MODEL);

        // Check and request RECORD_AUDIO permission (especially for Xiaomi)
        checkAndRequestPermissions();

        // Setup WebView first
        webView = findViewById(R.id.webview);

        // 添加JS调试日志接口
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void log(String msg) {
                Log.d(TAG, "[JS-LOG] " + msg);
            }
        }, "DebugLog");

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        Log.d(TAG, "About to add AndroidTTS interface");
        // Add JavaScript interface for TTS
        webView.addJavascriptInterface(new TTSEngine(), "AndroidTTS");
        Log.d(TAG, "AndroidTTS interface added");

        // 添加NativeLogger：Java端日志同时写入GameStorage供JS查看
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void log(String level, String tag, String msg) {
                // 写入GameStorage供用户在app内查看
                String fullMsg = "[" + tag + "] " + msg;
                Log.d(tag, msg); // 同时写Android日志
            }
        }, "NativeLogger");

        // Add bridge interface for JS to call native methods
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void finish() {
                Log.d(TAG, "finish() called from JS");
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        MainActivity.this.finish();
                    }
                });
            }
        }, "AndroidBridge");

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

        // Enable JavaScript dialogs (alert, confirm, prompt)
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView view, String url, String message, android.webkit.JsResult result) {
                Log.d(TAG, "[JS Alert] " + message);
                new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton("确定", null)
                    .setOnDismissListener(new android.content.DialogInterface.OnDismissListener() {
                        @Override
                        public void onDismiss(android.content.DialogInterface dialog) {
                            result.confirm();
                        }
                    })
                    .create()
                    .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, android.webkit.JsResult result) {
                Log.d(TAG, "[JS Confirm] " + message);
                new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton("确定", new android.content.DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(android.content.DialogInterface dialog, int which) {
                            result.confirm();
                        }
                    })
                    .setNegativeButton("取消", new android.content.DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(android.content.DialogInterface dialog, int which) {
                            result.cancel();
                        }
                    })
                    .create()
                    .show();
                return true;
            }
        });

        // Load the kidgame HTML file from assets
        webView.loadUrl("file:///android_asset/kidgame/index.html");

        // Check TTS engine availability before initializing
        checkAndInitTTS();
    }

    private void checkAndRequestPermissions() {
        // Xiaomi/Redmi devices require RECORD_AUDIO for TTS
        boolean isXiaomi = Build.MANUFACTURER.toLowerCase().contains("xiaomi") ||
                          Build.MANUFACTURER.toLowerCase().contains("redmi");

        if (isXiaomi || Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                Log.d(TAG, "Requesting RECORD_AUDIO permission (Xiaomi device detected)");
                requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_RECORD_AUDIO);
                permissionRequested = true;
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_RECORD_AUDIO) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Log.d(TAG, "RECORD_AUDIO permission granted");
            } else {
                Log.w(TAG, "RECORD_AUDIO permission denied");
            }
            // Re-check TTS after permission result
            checkAndInitTTS();
        }
    }

    private void checkAndInitTTS() {
        jsLog("info", "TTS", "checkAndInitTTS called");
        Log.d(TAG, "checkAndInitTTS called");

        // Avoid multiple simultaneous init attempts
        if (tts != null && ttsReady) {
            jsLog("info", "TTS", "TTS already initialized (tts=" + (tts!=null) + ", ready=" + ttsReady + "), skipping");
            Log.d(TAG, "TTS already initialized, skipping");
            return;
        }

        // Check if TTS engine is available
        Intent checkIntent = new Intent(TextToSpeech.Engine.ACTION_CHECK_TTS_DATA);
        PackageManager pm = getPackageManager();
        java.util.List<android.content.pm.ResolveInfo> resolveInfos = pm.queryIntentServices(checkIntent, 0);

        int engineCount = (resolveInfos == null) ? 0 : resolveInfos.size();
        jsLog("info", "TTS", "queryIntentServices returned " + engineCount + " engines");
        Log.d(TAG, "checkAndInitTTS: queryIntentServices returned " + engineCount + " engines");

        if (resolveInfos == null || resolveInfos.isEmpty()) {
            jsLog("warn", "TTS", "No TTS engine found on system!");
            Log.w(TAG, "No TTS engine found on system");
            // Notify JS that TTS is not available
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (webView != null) {
                        jsLog("info", "TTS", "calling onAndroidTTSFailed + showTTSInstallDialog");
                        webView.evaluateJavascript("if(window.onAndroidTTSFailed) window.onAndroidTTSFailed();", null);
                        // Prompt user to install TTS engine
                        showTTSInstallDialog();
                    }
                }
            }, 1000);
            return;
        }

        StringBuilder engineInfo = new StringBuilder("Found " + resolveInfos.size() + " TTS engine(s): ");
        for (android.content.pm.ResolveInfo info : resolveInfos) {
            engineInfo.append(info.serviceInfo.packageName).append("; ");
            Log.d(TAG, "TTS Engine: " + info.serviceInfo.packageName);
        }
        jsLog("info", "TTS", engineInfo.toString());
        Log.d(TAG, engineInfo.toString());

        // Initialize TTS
        jsLog("info", "TTS", "Calling initTTS...");
        Log.d(TAG, "Calling initTTS...");
        initTTS();

        // Fallback: if TTS not ready after 5 seconds, mark as failed
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!ttsReady) {
                    Log.w(TAG, "TTS init timeout - still not ready after 5s, notifying failed");
                    notifyTTSFailed();
                }
            }
        }, 5000);
    }

    private void showTTSInstallDialog() {
        jsLog("info", "TTS", "showTTSInstallDialog: showing dialog to user");
        Log.d(TAG, "showTTSInstallDialog called");
        new AlertDialog.Builder(this)
            .setTitle("语音功能需要设置")
            .setMessage("检测到您的手机未安装语音引擎或未正确配置。\n\n请在设置中下载并启用中文语音包。")
            .setPositiveButton("去设置", new android.content.DialogInterface.OnClickListener() {
                @Override
                public void onClick(android.content.DialogInterface dialog, int which) {
                    jsLog("info", "TTS", "user clicked 去设置, calling openTTSSettings");
                    openTTSSettings();
                }
            })
            .setNegativeButton("暂不设置", new android.content.DialogInterface.OnClickListener() {
                @Override
                public void onClick(android.content.DialogInterface dialog, int which) {
                    jsLog("info", "TTS", "user clicked 暂不设置");
                }
            })
            .show();
    }

    private void openTTSSettings() {
        jsLog("info", "TTS", "openTTSSettings: trying to open TTS settings...");
        Log.d(TAG, "openTTSSettings called");
        String manufacturer = Build.MANUFACTURER.toLowerCase();
        boolean settingsOpened = false;

        // Try multiple approaches
        String[] intents = {
            "com.android.settings.TTS_TEXT_TO_SPEECH",  // Xiaomi specific
            TextToSpeech.Engine.ACTION_CHECK_TTS_DATA,   // Generic
            "android.settings.TTS_SETTINGS",               // Standard
            "android.intent.action.TTS_SETTINGS"          // Alternative standard
        };

        for (String action : intents) {
            try {
                jsLog("info", "TTS", "openTTSSettings: trying intent: " + action);
                Log.d(TAG, "Trying intent: " + action);
                Intent intent = new Intent(action);
                if (action.equals("com.android.settings.TTS_TEXT_TO_SPEECH")) {
                    intent.setPackage("com.android.settings");
                }
                if (intent.resolveActivity(getPackageManager()) != null) {
                    startActivity(intent);
                    settingsOpened = true;
                    jsLog("info", "TTS", "openTTSSettings: SUCCESS with intent: " + action);
                    Log.d(TAG, "Successfully opened settings with: " + action);
                    break;
                } else {
                    jsLog("info", "TTS", "openTTSSettings: no activity for: " + action);
                }
            } catch (Exception e) {
                jsLog("warn", "TTS", "openTTSSettings: intent " + action + " failed: " + e.getMessage());
                Log.w(TAG, "Intent " + action + " failed: " + e.getMessage());
            }
        }

        if (!settingsOpened) {
            jsLog("error", "TTS", "openTTSSettings: ALL intents failed! Telling user to manually set.");
            Toast.makeText(this, "无法自动打开TTS设置，请手动到 设置→更多设置→辅助功能→语音 开启", Toast.LENGTH_LONG).show();
        }
    }

    private void initTTS() {
        jsLog("info", "TTS", "initTTS: creating TextToSpeech instance");
        Log.d(TAG, "initTTS called - creating TextToSpeech instance");
        ttsReady = false; // Reset state

        // Initialize Android TTS
        try {
            tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
                @Override
                public void onInit(int status) {
                    jsLog("info", "TTS", "onInit callback: status=" + status + " (SUCCESS=" + TextToSpeech.SUCCESS + ")");
                    Log.d(TAG, "onInit callback: status=" + status + " (SUCCESS=" + TextToSpeech.SUCCESS + ")");
                    if (status == TextToSpeech.SUCCESS) {
                        ttsReady = true;
                        jsLog("info", "TTS", "onInit: SUCCESS! ttsReady=true");
                        Log.d(TAG, "TTS initialized successfully, ttsReady=true");

                        // 检查是否设置了引擎（特别是小米）
                        String currentEngine = tts.getDefaultEngine();
                        jsLog("info", "TTS", "Default TTS engine: " + currentEngine);
                        Log.d(TAG, "Default TTS engine: " + currentEngine);

                        // 测试语音是否可用
                        int enResult = tts.isLanguageAvailable(Locale.US);
                        int zhResult = tts.isLanguageAvailable(Locale.CHINA);
                        jsLog("info", "TTS", "English availability: " + enResult + ", Chinese availability: " + zhResult);
                        Log.d(TAG, "English availability: " + enResult + " (LANG_AVAILABLE=" + TextToSpeech.LANG_AVAILABLE + ")");
                        Log.d(TAG, "Chinese availability: " + zhResult);

                        // 通知页面TTS已就绪
                        notifyTTSReady();

                        // 测试朗读
                        jsLog("info", "TTS", "TTS ready! Speaking test 'ready'...");
                        Log.d(TAG, "TTS is ready! Speaking test...");
                        tts.speak("ready", TextToSpeech.QUEUE_FLUSH, null, "tts-test");
                        tts.stop(); // 立即停止测试
                    } else {
                        jsLog("error", "TTS", "onInit: FAILED with status=" + status);
                        Log.e(TAG, "TTS init failed with status: " + status);
                        notifyTTSFailed();
                        // 提示用户设置TTS
                        showTTSInstallDialog();
                    }
                }
            });
            jsLog("info", "TTS", "TextToSpeech constructor called, waiting for onInit...");
        } catch (Exception e) {
            jsLog("error", "TTS", "TextToSpeech constructor threw: " + e.getMessage());
            Log.e(TAG, "TextToSpeech constructor threw: " + e.getMessage());
            notifyTTSFailed();
        }
    }

    private void notifyTTSReady() {
        jsLog("info", "TTS", "notifyTTSReady: calling window.onAndroidTTSReady()");
        Log.d(TAG, "notifyTTSReady called");
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
        jsLog("error", "TTS", "notifyTTSFailed called - TTS init failed!");
        Log.e(TAG, "notifyTTSFailed called");
        if (webView != null) {
            webView.post(new Runnable() {
                @Override
                public void run() {
                    jsLog("info", "TTS", "calling window.onAndroidTTSFailed()");
                    webView.evaluateJavascript("if(window.onAndroidTTSFailed) window.onAndroidTTSFailed();", null);
                }
            });
        }
    }

    // JavaScript interface for TTS
    private class TTSEngine {
        @JavascriptInterface
        public String isAvailable() {
            String debugInfo = "ready=" + ttsReady + ", tts=" + (tts != null);
            Log.d(TAG, "isAvailable called, " + debugInfo);
            return debugInfo;
        }

        @JavascriptInterface
        public String debug() {
            String info = "TTSEngine{ready=" + ttsReady + ", tts=" + (tts != null) + "}";
            Log.d(TAG, "debug: " + info);
            return info;
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
                jsLog("info", "TTS", "speak: '" + text.substring(0, Math.min(20, text.length())) + "'");
            } catch (Exception e) {
                Log.e(TAG, "Error speaking: " + e.getMessage(), e);
                jsLog("error", "TTS", "speak error: " + e.getMessage());
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