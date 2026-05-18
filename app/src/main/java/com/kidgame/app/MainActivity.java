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
            jsLog("info", "TTS", "TTS already initialized, skipping");
            return;
        }

        PackageManager pm = getPackageManager();

        // Method 1: Get all installed apps and check which have TTS service in manifest
        // This is the most reliable way on customized Android like HyperOS
        jsLog("info", "TTS", "=== Enumerating ALL installed apps for TTS services ===");
        try {
            Intent ttsServiceIntent = new Intent();
            ttsServiceIntent.setAction("android.speech.tts.TextToSpeechService");
            java.util.List<android.content.pm.ResolveInfo> allServices = pm.queryIntentServices(ttsServiceIntent, PackageManager.GET_RESOLVED_FILTER);
            int allCount = (allServices == null) ? 0 : allServices.size();
            jsLog("info", "TTS", "query(TextToSpeechService, GET_RESOLVED_FILTER) returned " + allCount + " services");
            for (android.content.pm.ResolveInfo ri : allServices) {
                jsLog("info", "TTS", "  TTS Service: pkg=" + ri.serviceInfo.packageName + " name=" + ri.serviceInfo.name);
                Log.d(TAG, "  TTS Service: " + ri.serviceInfo.packageName);
            }

            // Also try TTS_SERVICE
            Intent ttsServiceIntent2 = new Intent(TextToSpeech.Engine.ACTION_CHECK_TTS_DATA);
            java.util.List<android.content.pm.ResolveInfo> allServices2 = pm.queryIntentServices(ttsServiceIntent2, PackageManager.GET_RESOLVED_FILTER);
            int allCount2 = (allServices2 == null) ? 0 : allServices2.size();
            jsLog("info", "TTS", "query(ACTION_CHECK_TTS_DATA, GET_RESOLVED_FILTER) returned " + allCount2 + " services");
            for (android.content.pm.ResolveInfo ri : allServices2) {
                jsLog("info", "TTS", "  TTS Engine: pkg=" + ri.serviceInfo.packageName + " name=" + ri.serviceInfo.name);
                Log.d(TAG, "  TTS Engine: " + ri.serviceInfo.packageName);
            }

            // Try getting DEFAULT engine
            if (tts != null) {
                String defaultEngine = tts.getDefaultEngine();
                jsLog("info", "TTS", "getDefaultEngine=" + defaultEngine);
            }
        } catch (Exception e) {
            jsLog("warn", "TTS", "enumerate error: " + e.getMessage());
            Log.e(TAG, "enumerate error: " + e.getMessage());
        }

        // Method 2: Try to get default engine name before init
        jsLog("info", "TTS", "=== Trying to get default TTS engine ===");
        try {
            Intent checkIntent = new Intent(TextToSpeech.Engine.ACTION_CHECK_TTS_DATA);
            checkIntent.addCategory(Intent.CATEGORY_DEFAULT);
            android.content.pm.ResolveInfo ri = pm.resolveActivity(checkIntent, PackageManager.MATCH_DEFAULT_ONLY);
            if (ri != null) {
                jsLog("info", "TTS", "resolveActivity(ACTION_CHECK_TTS_DATA) resolved to: " + ri.activityInfo.packageName);
            } else {
                jsLog("info", "TTS", "resolveActivity(ACTION_CHECK_TTS_DATA) returned null");
            }
        } catch (Exception e) {
            jsLog("warn", "TTS", "resolveActivity error: " + e.getMessage());
        }

        // Initialize TTS
        jsLog("info", "TTS", "Calling initTTS...");
        initTTS();

        // Fallback: if TTS not ready after 5 seconds, mark as failed
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!ttsReady) {
                    jsLog("warn", "TTS", "TTS init timeout - still not ready after 5s! tts=" + (tts!=null) + ", calling notifyTTSFailed");
                    Log.w(TAG, "TTS init timeout - still not ready after 5s, tts=" + (tts!=null) + ", notifying failed");
                    notifyTTSFailed();
                } else {
                    jsLog("info", "TTS", "TTS init timeout check: already ready, skipping");
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
        boolean settingsOpened = false;

        // Try ACTION_CHECK_TTS_DATA first - this opens the TTS settings/install page
        try {
            Intent checkIntent = new Intent(TextToSpeech.Engine.ACTION_CHECK_TTS_DATA);
            jsLog("info", "TTS", "openTTSSettings: trying ACTION_CHECK_TTS_DATA");
            if (checkIntent.resolveActivity(getPackageManager()) != null) {
                startActivity(checkIntent);
                settingsOpened = true;
                jsLog("info", "TTS", "openTTSSettings: SUCCESS with ACTION_CHECK_TTS_DATA");
                Log.d(TAG, "Successfully opened ACTION_CHECK_TTS_DATA");
            } else {
                jsLog("info", "TTS", "openTTSSettings: no activity for ACTION_CHECK_TTS_DATA");
            }
        } catch (Exception e) {
            jsLog("warn", "TTS", "openTTSSettings: ACTION_CHECK_TTS_DATA failed: " + e.getMessage());
        }

        // If not opened yet, try Xiaomi-specific TTS settings activity
        if (!settingsOpened) {
            try {
                jsLog("info", "TTS", "openTTSSettings: trying Xiaomi TextSettingsActivity");
                Intent xiaomiIntent = new Intent();
                xiaomiIntent.setClassName("com.android.settings", "com.android.settings.TextSettingsActivity");
                if (xiaomiIntent.resolveActivity(getPackageManager()) != null) {
                    startActivity(xiaomiIntent);
                    settingsOpened = true;
                    jsLog("info", "TTS", "openTTSSettings: SUCCESS with Xiaomi TextSettingsActivity");
                    Log.d(TAG, "Successfully opened Xiaomi TextSettingsActivity");
                } else {
                    jsLog("info", "TTS", "openTTSSettings: no activity for Xiaomi TextSettingsActivity");
                }
            } catch (Exception e) {
                jsLog("warn", "TTS", "openTTSSettings: Xiaomi TextSettingsActivity failed: " + e.getMessage());
            }
        }

        // Try to open app info for the default TTS engine
        if (!settingsOpened) {
            try {
                jsLog("info", "TTS", "openTTSSettings: trying to open app info for Google TTS");
                Intent appInfoIntent = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                appInfoIntent.setData(android.net.Uri.parse("package:com.google.android.tts"));
                if (appInfoIntent.resolveActivity(getPackageManager()) != null) {
                    startActivity(appInfoIntent);
                    settingsOpened = true;
                    jsLog("info", "TTS", "openTTSSettings: SUCCESS with Google TTS app info");
                }
            } catch (Exception e) {
                jsLog("warn", "TTS", "openTTSSettings: Google TTS app info failed: " + e.getMessage());
            }
        }

        // Last resort: open general settings
        if (!settingsOpened) {
            try {
                jsLog("info", "TTS", "openTTSSettings: last resort - opening general settings");
                Intent generalIntent = new Intent(android.provider.Settings.ACTION_SETTINGS);
                startActivity(generalIntent);
                settingsOpened = true;
            } catch (Exception e) {
                jsLog("error", "TTS", "openTTSSettings: even general settings failed");
            }
        }

        if (!settingsOpened) {
            Toast.makeText(this, "无法打开TTS设置，请手动到 设置→辅助功能→语音 开启", Toast.LENGTH_LONG).show();
        }
    }

    private void initTTS() {
        jsLog("info", "TTS", "initTTS: creating TextToSpeech instance");
        Log.d(TAG, "initTTS called - creating TextToSpeech instance");
        ttsReady = false; // Reset state

        // Initialize Android TTS
        try {
            jsLog("info", "TTS", "initTTS: BEFORE new TextToSpeech()");
            Log.d(TAG, "initTTS: BEFORE new TextToSpeech()");
            tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
                @Override
                public void onInit(int status) {
                    jsLog("info", "TTS", "initTTS: AFTER new TextToSpeech() - onInit called with status=" + status);
                    Log.d(TAG, "initTTS: AFTER new TextToSpeech() - onInit called with status=" + status);
                    if (status == TextToSpeech.SUCCESS) {
                        // 首先检查默认引擎
                        String currentEngine = tts.getDefaultEngine();
                        jsLog("info", "TTS", "Default TTS engine: " + currentEngine);
                        Log.d(TAG, "Default TTS engine: " + currentEngine);

                        // 检查中文是否可用（澎湃OS可能没有预装中文语音包）
                        int zhResult = tts.isLanguageAvailable(Locale.CHINA);
                        jsLog("info", "TTS", "isLanguageAvailable(CHINA)=" + zhResult + " LANG_AVAILABLE=" + TextToSpeech.LANG_AVAILABLE + " LANG_MISSING_DATA=" + TextToSpeech.LANG_MISSING_DATA + " LANG_NOT_SUPPORTED=" + TextToSpeech.LANG_NOT_SUPPORTED);
                        Log.d(TAG, "Chinese availability: " + zhResult);

                        // 关键：用setLanguage检查，如果返回LANG_MISSING_DATA需要下载语音包
                        int setLangResult = tts.setLanguage(Locale.CHINA);
                        jsLog("info", "TTS", "setLanguage(CHINA) result=" + setLangResult + " (" +
                            (setLangResult == TextToSpeech.LANG_AVAILABLE ? "LANG_AVAILABLE" :
                             setLangResult == TextToSpeech.LANG_COUNTRY_AVAILABLE ? "LANG_COUNTRY_AVAILABLE" :
                             setLangResult == TextToSpeech.LANG_MISSING_DATA ? "LANG_MISSING_DATA ⚠️ 需要下载语音包" :
                             setLangResult == TextToSpeech.LANG_NOT_SUPPORTED ? "LANG_NOT_SUPPORTED" : "UNKNOWN") + ")");

                        if (setLangResult == TextToSpeech.LANG_MISSING_DATA) {
                            // 语音包缺失，引导用户下载
                            jsLog("warn", "TTS", "LANG_MISSING_DATA: 中文语音包未安装，跳转下载...");
                            ttsReady = false;
                            showTTSInstallDialog();
                            return;
                        } else if (setLangResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                            jsLog("warn", "TTS", "LANG_NOT_SUPPORTED: 当前引擎不支持中文");
                            ttsReady = false;
                            showTTSInstallDialog();
                            return;
                        } else {
                            // 语言可用，标记就绪
                            ttsReady = true;
                            jsLog("info", "TTS", "onInit: SUCCESS! ttsReady=true, TTS is ready to speak");
                            Log.d(TAG, "TTS initialized successfully, ttsReady=true");
                            notifyTTSReady();
                            jsLog("info", "TTS", "Speaking test '你好，这是小米澎湃OS的TTS测试'...");
                            tts.speak("你好，这是小米澎湃OS的TTS测试", TextToSpeech.QUEUE_FLUSH, null, "tts-test");
                            return;
                        }
                    } else {
                        jsLog("error", "TTS", "onInit: FAILED with status=" + status + " (ERROR=-1)");
                        Log.e(TAG, "TTS init failed with status: " + status);
                        ttsReady = false;
                        notifyTTSFailed();
                        showTTSInstallDialog();
                    }
                }
            });
            jsLog("info", "TTS", "initTTS: TextToSpeech constructor called, waiting for onInit...");
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