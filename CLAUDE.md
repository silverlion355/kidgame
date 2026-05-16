# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

- **Local build**: Requires Java 17 and Android SDK. Run `./gradlew assembleDebug` from project root (Java 17 needed, Gradle 7.5)
- **GitHub Actions build**: Push to `main` branch triggers automatic APK build via `.github/workflows/build-apk.yml`
- **Download built APK**: GitHub Actions uploads artifact as `kidgame-debug-apk` (available at `https://github.com/silverlion355/kidgame/actions`)

## Architecture

### Hybrid Android/WebView App
This is a hybrid Android app where the core functionality is implemented in HTML/JavaScript bundled in `app/src/main/assets/kidgame/`, loaded into a WebView.

**Entry point chain**: `MainActivity.java` → `index.html` → `js/app.js`

### Native Integration (Java → JavaScript)
`MainActivity.java` provides native Android features via JavaScript interfaces:
- **AndroidTTS**: Text-to-speech via `TTSEngine` class (`speak(text, lang)`, `stop()`, `isAvailable()`)
- **AndroidBridge**: Native callbacks (`finish()`)
- **DebugLog**: Debug logging interface

WebView notifies JavaScript when TTS is ready via `window.onAndroidTTSReady` callback.

### Key Assets
- `assets/kidgame/index.html` - Main HTML entry
- `assets/kidgame/js/app.js` - Core game logic
- `assets/kidgame/js/data-manager.js` - Data handling
- `assets/kidgame/data/*.json` - Content data (english.json, poems.json, gifts.json, idioms.json)
- `assets/kidgame/css/style.css` - Styling

### Version Info
- `app/build.gradle`: `versionCode 8`, `versionName "1.12"` - Increment on release
- Package: `com.kidgame.app`

## Workflow Notes
- APK is built on GitHub Actions (no local build environment available in sandbox)
- After pushing changes, check Actions tab for build status
- Download APK from Actions → run → Artifacts