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
import java.util.List;
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

        // === New approach: use getEngines() to discover available TTS engines ===
        jsLog("info", "TTS", "=== Scanning TTS engines via getEngines() ===");
        jsLog("info", "TTS", "Creating temporary TTS to enumerate engines...");

        final String[] selectedEngine = {null};
        final boolean[] done = {false};

        TextToSpeech tempTts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                jsLog("info", "TTS", "Temp TTS onInit: status=" + status);
                if (status == TextToSpeech.SUCCESS) {
                    String def = tempTts.getDefaultEngine();
                    jsLog("info", "TTS", "Temp TTS default engine: " + def);
                    List<TextToSpeech.EngineInfo> el = tempTts.getEngines();
                    jsLog("info", "TTS", "getEngines() returned " + (el == null ? "null" : el.size()) + " engines");
                    if (el != null) {
                        for (TextToSpeech.EngineInfo ei : el) {
                            jsLog("info", "TTS", "  Engine: name=" + ei.name + " label=" + ei.label + " enabled=" + ei.enabled);
                        }
                        // Priority: Google TTS > non-Xiaomi enabled > first available
                        String preferred = null;
                        for (TextToSpeech.EngineInfo ei : el) {
                            if (ei.name != null && ei.name.contains("com.google.android.tts")) {
                                preferred = ei.name;
                                jsLog("info", "TTS", "Selected: Google TTS = " + preferred);
                                break;
                            }
                        }
                        if (preferred == null) {
                            for (TextToSpeech.EngineInfo ei : el) {
                                if (ei.name != null && ei.enabled && !ei.name.contains("xiaomi") && !ei.name.contains("mibrain")) {
                                    preferred = ei.name;
                                    jsLog("info", "TTS", "Selected: non-Xiaomi enabled = " + preferred);
                                    break;
                                }
                            }
                        }
                        if (preferred == null && !el.isEmpty()) {
                            preferred = el.get(0).name;
                            jsLog("info", "TTS", "Selected: first available = " + preferred);
                        }
                        selectedEngine[0] = preferred;
                    }
                    tempTts.shutdown();
                } else {
                    jsLog("error", "TTS", "Temp TTS FAILED status=" + status);
                    tempTts.shutdown();
                }
                done[0] = true;
                // Now init real TTS
                initTTSWithEngine(selectedEngine[0]);
            }
        });

        // Wait up to 3s for temp TTS
        long deadline = System.currentTimeMillis() + 3000;
        while (!done[0] && System.currentTimeMillis() < deadline) {
            try { Thread.sleep(100); } catch (InterruptedException ie) {}
        }
        if (!done[0]) {
            jsLog("warn", "TTS", "Temp TTS init timeout, initTTSWithEngine(null)");
            initTTSWithEngine(null);
        }

        // Safety timeout (8s total)
        final Handler safetyHandler = new Handler(Looper.getMainLooper());
        safetyHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!ttsReady) {
                    jsLog("warn", "TTS", "TTS safety timeout - not ready after 8s!");
                    notifyTTSFailed();
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
                    jsLog("error", "TTS", "onInit FAILED status=" + status);
                    notifyTTSFailed();
                    showTTSInstallDialog();
                    return;
                }
                String engine = tts.getDefaultEngine();
                jsLog("info", "TTS", "Engine used: " + engine);
                int langResult = tts.setLanguage(Locale.CHINA);
                jsLog("info", "TTS", "setLanguage(CHINA)=" + langResult + " (" +
                    (langResult == TextToSpeech.LANG_AVAILABLE ? "LANG_AVAILABLE" :
                     langResult == TextToSpeech.LANG_COUNTRY_AVAILABLE ? "LANG_COUNTRY_AVAILABLE" :
                     langResult == TextToSpeech.LANG_MISSING_DATA ? "LANG_MISSING_DATA" :
                     langResult == TextToSpeech.LANG_NOT_SUPPORTED ? "LANG_NOT_SUPPORTED" : "UNKNOWN") + ")");
                if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                    ttsReady = false;
                    jsLog("warn", "TTS", "TTS engine does not support Chinese");
                    showTTSInstallDialog();
                    return;
                }
                ttsReady = true;
                jsLog("info", "TTS", "TTS SUCCESS! ttsReady=true engine=" + engine);
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
            jsLog("error", "TTS", "initTTSWithEngine exception: " + e.getMessage());
            notifyTTSFailed();
            showTTSInstallDialog();
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
            if (!ttsReady || text == null || text.isEmpty()) return;

            try {
                Locale locale;
                if (lang != null && lang.toLowerCase().startsWith("en")) {
                    locale = Locale.US;
                } else {
                    locale = Locale.CHINA;
                }

                int avail = tts.isLanguageAvailable(locale);
                if (avail >= TextToSpeech.LANG_AVAILABLE) {
                    tts.setLanguage(locale);
                } else {
                    tts.setLanguage(Locale.getDefault());
                }

                HashMap<String, String> params = new HashMap<>();
                params.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "tts-" + System.currentTimeMillis());
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, params);
                jsLog("info", "TTS", "speak: " + text.substring(0, Math.min(20, text.length())));
            } catch (Exception e) {
                jsLog("error", "TTS", "speak error: " + e.getMessage());
            }
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