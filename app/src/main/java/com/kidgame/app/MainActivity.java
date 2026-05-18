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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        Log.d(TAG, "Creating activity...");
        Log.d(TAG, "Manufacturer: " + Build.MANUFACTURER);
        Log.d(TAG, "Model: " + Build.MODEL);

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
        // Check if TTS engine is available
        Intent checkIntent = new Intent(TextToSpeech.Engine.ACTION_CHECK_TTS_DATA);
        PackageManager pm = getPackageManager();
        var resolveInfos = pm.queryIntentServices(checkIntent, 0);

        if (resolveInfos == null || resolveInfos.isEmpty()) {
            Log.w(TAG, "No TTS engine found on system");
            // Notify JS that TTS is not available
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (webView != null) {
                        webView.evaluateJavascript("if(window.onAndroidTTSFailed) window.onAndroidTTSFailed();", null);
                        // Prompt user to install TTS engine
                        showTTSInstallDialog();
                    }
                }
            }, 1000);
            return;
        }

        Log.d(TAG, "Found " + resolveInfos.size() + " TTS engine(s)");
        for (var info : resolveInfos) {
            Log.d(TAG, "TTS Engine: " + info.serviceInfo.packageName);
        }

        // Initialize TTS
        initTTS();
    }

    private void showTTSInstallDialog() {
        new AlertDialog.Builder(this)
            .setTitle("语音功能需要设置")
            .setMessage("检测到您的手机未安装语音引擎或未正确配置。\n\n是否跳转到系统设置进行配置？")
            .setPositiveButton("去设置", new android.content.DialogInterface.OnClickListener() {
                @Override
                public void onClick(android.content.DialogInterface dialog, int which) {
                    openTTSSettings();
                }
            })
            .setNegativeButton("暂不设置", null)
            .show();
    }

    private void openTTSSettings() {
        try {
            // Try Xiaomi-specific TTS settings
            Intent intent = new Intent("com.android.settings.TTS_TEXT_TO_SPEECH");
            intent.setPackage("com.android.settings");
            if (intent.resolveActivity(getPackageManager()) != null) {
                startActivity(intent);
            } else {
                // Fallback to generic TTS settings
                Intent genericIntent = new Intent(TextToSpeech.Engine.ACTION_CHECK_TTS_DATA);
                startActivity(genericIntent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to open TTS settings: " + e.getMessage());
            Toast.makeText(this, "请手动到设置中开启语音功能", Toast.LENGTH_LONG).show();
        }
    }

    private void initTTS() {
        Log.d(TAG, "Initializing TTS...");

        // Initialize Android TTS
        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                Log.d(TAG, "TTS init status: " + status);
                if (status == TextToSpeech.SUCCESS) {
                    ttsReady = true;

                    // 检查是否设置了引擎（特别是小米）
                    String currentEngine = tts.getDefaultEngine();
                    Log.d(TAG, "Default TTS engine: " + currentEngine);

                    // 添加系统返回键和手势支持（Android 13+）
                    getOnBackPressedDispatcher().addCallback(MainActivity.this, new OnBackPressedCallback(true) {
                        @Override
                        public void handleOnBackPressed() {
                            Log.d(TAG, "Back pressed, webView.canGoBack=" + webView.canGoBack());
                            try {
                                if (webView.canGoBack()) {
                                    webView.goBack();
                                } else {
                                    // 通知JS处理返回
                                    webView.evaluateJavascript("if(window.onNativeBack) window.onNativeBack(); else finish();", null);
                                }
                            } catch (Exception e) {
                                Log.e(TAG, "Back handling error: " + e.getMessage());
                                finish();
                            }
                        }
                    });

                    // 设置UtteranceProgressListener来监听语音状态（Android 14+ deprecated）
                    try {
                        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                            @Override
                            public void onStart(String utteranceId) {
                                Log.d(TAG, "TTS started: " + utteranceId);
                            }

                            @Override
                            public void onDone(String utteranceId) {
                                Log.d(TAG, "TTS completed: " + utteranceId);
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
                    } catch (Exception e) {
                        Log.w(TAG, "setOnUtteranceProgressListener not available: " + e.getMessage());
                    }

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
                    // 提示用户设置TTS
                    showTTSInstallDialog();
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
        public String debug() {
            return "TTSEngine{ready=" + ttsReady + ", tts=" + (tts != null) + "}";
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