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
import android.media.AudioManager;
import androidx.appcompat.app.AppCompatActivity;
import android.widget.Toast;
import android.os.Handler;
import android.os.Looper;
import androidx.activity.OnBackPressedCallback;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "KidGameTTS";
    private static final int REQUEST_RECORD_AUDIO = 1001;
    private WebView webView;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private boolean permissionRequested = false;
    private boolean ttsInitAttempted = false; // 防止重复初始化尝试
    private boolean ttsInitInProgress = false; // 防止安全超时触发重复initTTSWithEngine
    private List<String[]> pendingSpeaks = new ArrayList<>(); // 未就绪时排队，就绪后补播

    // Helper: send log to JS GameStorage so user can see in app debug log
    private void jsLog(String level, String tag, String msg) {
        final String fullMsg = msg.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n");
        final String fullTag = tag.replace("\\", "\\\\").replace("'", "\\'");
        if (webView != null) {
            webView.post(new Runnable() {
                @Override
                public void run() {
                    // Pass real timestamp from Java side so logs are in chronological order
                    String js = "GameStorage.addLog('" + level + "', '[Native:" + fullTag + "] " + fullMsg + "', {time: new Date().toISOString()});";
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

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Add JavaScript interface for TTS
        webView.addJavascriptInterface(new TTSEngine(), "AndroidTTS");

        // === System info logging (after WebView is ready) ===
        logSystemInfo();

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

    private void logSystemInfo() {
        Log.d(TAG, "logSystemInfo: Manufacturer=" + Build.MANUFACTURER);
        jsLog("info", "System", "=== SYSTEM INFO ===");
        jsLog("info", "System", "Build.MANUFACTURER=" + Build.MANUFACTURER);
        jsLog("info", "System", "Build.BRAND=" + Build.BRAND);
        jsLog("info", "System", "Build.MODEL=" + Build.MODEL);
        jsLog("info", "System", "Build.DEVICE=" + Build.DEVICE);
        jsLog("info", "System", "Build.PRODUCT=" + Build.PRODUCT);
        jsLog("info", "System", "Build.ID=" + Build.ID);
        jsLog("info", "System", "Build.VERSION.RELEASE=" + Build.VERSION.RELEASE);
        jsLog("info", "System", "Build.VERSION.SDK_INT=" + Build.VERSION.SDK_INT);
        jsLog("info", "System", "Build.VERSION.SECURITY_PATCH=" + Build.VERSION.SECURITY_PATCH);
        jsLog("info", "System", "System.getProperty('os.version')=" + System.getProperty("os.version"));
        jsLog("info", "System", "System.getProperty('java.vendor')=" + System.getProperty("java.vendor"));
        jsLog("info", "System", "System.getProperty('java.version')=" + System.getProperty("java.version"));
        jsLog("info", "System", "=== END SYSTEM INFO ===");

        jsLog("info", "System", "=== TTS-RELATED PACKAGES ===");
        try {
            PackageManager pm = getPackageManager();
            java.util.List<android.content.pm.ApplicationInfo> installedApps = pm.getInstalledApplications(PackageManager.GET_META_DATA);
            for (android.content.pm.ApplicationInfo app : installedApps) {
                String pkgName = app.packageName.toLowerCase();
                if (pkgName.contains("tts") || pkgName.contains("speech") || pkgName.contains("voice") ||
                    (pkgName.contains("xiaomi") && pkgName.contains("speech")) ||
                    (pkgName.contains("google") && (pkgName.contains("tts") || pkgName.contains("speech"))) ||
                    (pkgName.contains("miui") && pkgName.contains("speech"))) {
                    android.content.pm.PackageInfo pi = pm.getPackageInfo(app.packageName, 0);
                    jsLog("info", "System", "  Possible TTS app: " + app.packageName + " (version=" + pi.versionName + ")");
                }
            }
            jsLog("info", "System", "=== END TTS PACKAGES ===");
        } catch (Exception e) {
            jsLog("warn", "System", "Error listing TTS packages: " + e.getMessage());
        }
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

        // 防止重复初始化
        if (ttsInitAttempted) {
            jsLog("warn", "TTS", "TTS init already attempted, skipping duplicate call");
            return;
        }
        ttsInitAttempted = true;
        ttsInitInProgress = true;

        if (tts != null && ttsReady) {
            jsLog("info", "TTS", "TTS already initialized, skipping");
            return;
        }

        PackageManager pm = getPackageManager();

        // Get all TTS service declarations
        jsLog("info", "TTS", "=== Enumerating TTS services ===");
        try {
            Intent ttsServiceIntent = new Intent();
            ttsServiceIntent.setAction("android.speech.tts.TextToSpeechService");
            List<android.content.pm.ResolveInfo> allServices = pm.queryIntentServices(ttsServiceIntent, PackageManager.GET_RESOLVED_FILTER);
            int allCount = (allServices == null) ? 0 : allServices.size();
            jsLog("info", "TTS", "query(TextToSpeechService) returned " + allCount + " services");
            for (android.content.pm.ResolveInfo ri : allServices) {
                jsLog("info", "TTS", "  TTS Service: pkg=" + ri.serviceInfo.packageName + " svc=" + ri.serviceInfo.name);
            }
        } catch (Exception e) {
            jsLog("warn", "TTS", "queryIntentServices error: " + e.getMessage());
        }

        // Read default TTS engine from system settings
        jsLog("info", "TTS", "=== Default TTS engine info ===");
        try {
            String defaultEngine = android.provider.Settings.Secure.getString(getContentResolver(), android.provider.Settings.Secure.TTS_DEFAULT_SYNTH);
            jsLog("info", "TTS", "TTS_DEFAULT_SYNTH=" + defaultEngine);
            String defaultLocale = android.provider.Settings.Secure.getString(getContentResolver(), "tts_default_locale");
            jsLog("info", "TTS", "tts_default_locale=" + defaultLocale);
            String speechRateStr = android.provider.Settings.Secure.getString(getContentResolver(), "tts_default_speech_rate");
            jsLog("info", "TTS", "tts_default_speech_rate=" + speechRateStr);
        } catch (Exception e) {
            jsLog("warn", "TTS", "Settings query error: " + e.getMessage());
        }

        // Check ACTION_CHECK_TTS_DATA
        try {
            Intent checkIntent = new Intent(TextToSpeech.Engine.ACTION_CHECK_TTS_DATA);
            android.content.pm.ResolveInfo ri = pm.resolveActivity(checkIntent, PackageManager.MATCH_DEFAULT_ONLY);
            if (ri != null) {
                jsLog("info", "TTS", "ACTION_CHECK_TTS_DATA resolves to: " + ri.activityInfo.packageName);
            } else {
                jsLog("info", "TTS", "ACTION_CHECK_TTS_DATA: no default activity");
            }
        } catch (Exception e) {
            jsLog("warn", "TTS", "resolveActivity error: " + e.getMessage());
        }

        // === Async approach: use getEngines() via a temp TTS, then init real TTS ===
        // NOTE: We cannot use blocking Thread.sleep on the main thread — it blocks the
        // Looper and prevents TextToSpeech.OnInitListener callbacks from firing.
        // Instead we post a delayed check and call initTTSWithEngine from onInit itself.

        jsLog("info", "TTS", "=== Scanning TTS engines via async getEngines() ===");
        final String[] selectedEngine = {null};
        final TextToSpeech[] tempTtsHolder = {null};

        final TextToSpeech.OnInitListener scanListener = new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                jsLog("info", "TTS", "Temp TTS onInit: status=" + status);
                if (status == TextToSpeech.SUCCESS) {
                    TextToSpeech tt = tempTtsHolder[0];
                    String def = tt.getDefaultEngine();
                    jsLog("info", "TTS", "Temp TTS default engine: " + def);
                    List<TextToSpeech.EngineInfo> el = tt.getEngines();
                    jsLog("info", "TTS", "getEngines() returned " + (el == null ? "null" : el.size()) + " engines");
                    if (el != null) {
                        for (TextToSpeech.EngineInfo ei : el) {
                            jsLog("info", "TTS", "  Engine: name=" + ei.name + " label=" + ei.label);
                        }
                    // 优先使用系统默认引擎（用户已在系统设置里配置，通常已装好语音包）
                    String defEngine = tt.getDefaultEngine();
                    jsLog("info", "TTS", "Temp TTS default engine: " + defEngine);
                    if (defEngine != null && !defEngine.isEmpty()) {
                        selectedEngine[0] = defEngine;
                        jsLog("info", "TTS", "Selected: system default = " + defEngine);
                    } else {
                        // 回退：Google TTS > 非小米 > 首个可用
                        for (TextToSpeech.EngineInfo ei : el) {
                            if (ei.name != null && ei.name.contains("com.google.android.tts")) {
                                selectedEngine[0] = ei.name;
                                jsLog("info", "TTS", "Selected: Google TTS = " + ei.name);
                                break;
                            }
                        }
                        if (selectedEngine[0] == null) {
                            for (TextToSpeech.EngineInfo ei : el) {
                                if (ei.name != null && !ei.name.contains("xiaomi") && !ei.name.contains("mibrain")) {
                                    selectedEngine[0] = ei.name;
                                    jsLog("info", "TTS", "Selected: non-Xiaomi = " + ei.name);
                                    break;
                                }
                            }
                        }
                        if (selectedEngine[0] == null && !el.isEmpty()) {
                            selectedEngine[0] = el.get(0).name;
                            jsLog("info", "TTS", "Selected: first available = " + el.get(0).name);
                        }
                    }
                    }
                    try { tempTtsHolder[0].shutdown(); } catch (Exception e) {}
                } else {
                    jsLog("error", "TTS", "Temp TTS FAILED status=" + status);
                    try { tempTtsHolder[0].shutdown(); } catch (Exception e) {}
                }
                ttsInitInProgress = false;
                initTTSWithEngine(selectedEngine[0]);
            }
        };

        // Create temp TTS on this thread. onInit fires back on the main thread's looper
        // (which is why blocking the main thread would deadlock).
        jsLog("info", "TTS", "Creating temp TTS to enumerate engines...");
        tempTtsHolder[0] = new TextToSpeech(this, scanListener);

        // Safety timeout — only fire if ttsInitInProgress is still true (not already completed/failed)
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!ttsReady && ttsInitInProgress) {
                    jsLog("warn", "TTS", "TTS safety timeout — temp TTS never responded, trying system default");
                    ttsInitInProgress = false; // 防止重复触发
                    initTTSWithEngine(null);
                }
            }
        }, 8000);
    }

    private void initTTSWithEngine(String engineName) {
        jsLog("info", "TTS", "initTTSWithEngine(" + (engineName == null ? "null (system default)" : engineName) + ")");
        ttsReady = false;

        TextToSpeech.OnInitListener listener = new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                jsLog("info", "TTS", "onInit: status=" + status + ", engine=" + (tts != null ? tts.getDefaultEngine() : "null"));
                if (status != TextToSpeech.SUCCESS) {
                    ttsInitInProgress = false;
                    jsLog("error", "TTS", "onInit FAILED status=" + status);
                    notifyTTSFailed();
                    return;
                }
                String engine = tts.getDefaultEngine();
                jsLog("info", "TTS", "Engine used: " + engine);
                tts.setSpeechRate(1.0f);
                tts.setPitch(1.0f);
                int langResult = tts.setLanguage(Locale.SIMPLIFIED_CHINESE);
                jsLog("info", "TTS", "setLanguage(SIMPLIFIED_CHINESE)=" + langResult + " (" +
                    (langResult == TextToSpeech.LANG_AVAILABLE ? "LANG_AVAILABLE" :
                     langResult == TextToSpeech.LANG_COUNTRY_AVAILABLE ? "LANG_COUNTRY_AVAILABLE" :
                     langResult == TextToSpeech.LANG_MISSING_DATA ? "LANG_MISSING_DATA" :
                     langResult == TextToSpeech.LANG_NOT_SUPPORTED ? "LANG_NOT_SUPPORTED" : "UNKNOWN") + ")");
                if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                    // 语音包缺失：仍标记就绪并补播排队请求，同时引导用户安装语音包
                    ttsReady = true;
                    ttsInitInProgress = false;
                    jsLog("warn", "TTS", "Chinese voice data missing -> prompt install");
                    flushPendingSpeaks();
                    notifyTTSReady();
                    promptInstallTtsData();
                    return;
                }
                ttsReady = true;
                ttsInitInProgress = false;
                jsLog("info", "TTS", "TTS SUCCESS! ttsReady=true engine=" + engine);
                flushPendingSpeaks();
                notifyTTSReady();
            }
        };

        try {
            if (engineName != null) {
                tts = new TextToSpeech(this, listener, engineName);
                jsLog("info", "TTS", "Created TTS with engine: " + engineName);
            } else {
                tts = new TextToSpeech(this, listener);
                jsLog("info", "TTS", "Created TTS with system default engine");
            }
        } catch (Exception e) {
            ttsInitInProgress = false;
            jsLog("error", "TTS", "initTTSWithEngine exception: " + e.getMessage());
            notifyTTSFailed();
        }
    }

    private void notifyTTSReady() {
        jsLog("info", "TTS", "notifyTTSReady");
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
        jsLog("error", "TTS", "notifyTTSFailed called");
        if (webView != null) {
            webView.post(new Runnable() {
                @Override
                public void run() {
                    webView.evaluateJavascript("if(window.onAndroidTTSFailed) window.onAndroidTTSFailed();", null);
                }
            });
        }
    }

    // TTS 就绪后补播排队请求
    private void flushPendingSpeaks() {
        if (pendingSpeaks.isEmpty()) return;
        jsLog("info", "TTS", "flushing " + pendingSpeaks.size() + " pending speaks");
        List<String[]> todo = new ArrayList<>(pendingSpeaks);
        pendingSpeaks.clear();
        for (String[] item : todo) {
            speakText(item[0], item[1]);
        }
    }

    // 真正执行发音：内部类 TTSEngine 与补播逻辑 flushPendingSpeaks 共用
    private void speakText(String text, String lang) {
        try {
            Locale locale = (lang != null && lang.toLowerCase().startsWith("en"))
                    ? Locale.US : Locale.SIMPLIFIED_CHINESE;
            int avail = tts.isLanguageAvailable(locale);
            if (avail >= TextToSpeech.LANG_AVAILABLE) {
                tts.setLanguage(locale);
            } else {
                tts.setLanguage(Locale.getDefault());
            }
            tts.setSpeechRate(1.0f);
            tts.setPitch(1.0f);
            HashMap<String, String> params = new HashMap<>();
            params.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "tts-" + System.currentTimeMillis());
            // 路由到音乐流，避免被系统/机型静音策略吞掉
            params.put(TextToSpeech.Engine.KEY_PARAM_STREAM, String.valueOf(AudioManager.STREAM_MUSIC));
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, params);
            jsLog("info", "TTS", "speak: " + text.substring(0, Math.min(20, text.length())));
        } catch (Exception e) {
            jsLog("error", "TTS", "speak error: " + e.getMessage());
        }
    }

    // 引导用户安装中文语音包（小米等机型常因缺语音包而静音）
    private void promptInstallTtsData() {
        try {
            Intent install = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
            install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(install);
            Toast.makeText(MainActivity.this, "请安装中文语音包后重试发音", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            jsLog("warn", "TTS", "cannot launch install TTS data: " + e.getMessage());
        }
    }

    // JavaScript interface for TTS
    private class TTSEngine {
        @JavascriptInterface
        public String isAvailable() {
            return "ready=" + ttsReady + ", tts=" + (tts != null);
        }

        @JavascriptInterface
        public String debug() {
            return "TTSEngine{ready=" + ttsReady + ", tts=" + (tts != null) + "}";
        }

        @JavascriptInterface
        public void speak(String text, String lang) {
            if (text == null || text.isEmpty()) return;
            // 未就绪：排队，待 TTS 初始化完成后补播（修复小米等机型首点无声音）
            if (!ttsReady || tts == null) {
                pendingSpeaks.add(new String[]{text, lang});
                jsLog("warn", "TTS", "speak queued (not ready): " + text.substring(0, Math.min(20, text.length())));
                if (tts == null && !ttsInitAttempted) {
                    checkAndInitTTS();
                }
                return;
            }
            speakText(text, lang);
        }

        @JavascriptInterface
        public void stop() {
            if (tts != null) tts.stop();
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