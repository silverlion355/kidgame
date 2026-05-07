# 萌娃闯关 - Android 版

## 方案一：用 Android Studio（当前项目）

1. 用 Android Studio 打开 `kidgame-android` 目录
2. 等待 Gradle Sync 完成（首次会下载 Gradle）
3. 连接手机（开启 USB 调试）或启动模拟器
4. 点击 ▶ Run 按钮

生成的 APK 在：`app/build/outputs/apk/debug/app-debug.apk`

---

## 方案二：用 Capacitor（更简单，推荐）

如果你有 Node.js 环境：

```bash
# 安装 Capacitor
npm install -g @capacitor/core @capacitor/cli

# 初始化项目
cd kidgame
npx cap init kidgame com.kidgame.app --web-dir=.

# 添加 Android
npx cap add android

# 同步文件
npx cap sync

# 用 Android Studio 打开并运行
npx cap open android
```

Capacitor 会自动把 HTML/CSS/JS 打包进 Android 项目。

---

## 方案三：直接安装（如果有 APK）

如果你已经有编译好的 `app-debug.apk`，直接传到手机安装：
```bash
adb install app-debug.apk
```

## 游戏说明

- 题库已扩充：成语 100 条、古诗 50 首、英语 100 个
- 有音效：答对/答错有提示音，背景有轻音乐
- 玩法：
  - 成语：填字游戏（画＿添足）
  - 古诗：填词游戏（夜来＿＿声）
  - 英语：翻译游戏（中英互译）

