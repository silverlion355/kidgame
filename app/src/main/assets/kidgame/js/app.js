/**
 * app.js - main logic and game interaction
 */

// ===== 全局异常兜底（A4）：任何 JS 报错不再静默白屏，记录日志并提示用户 =====
(function installGlobalErrorGuard() {
  function ensureBanner(msg) {
    try {
      var box = document.getElementById('error-banner');
      if (!box) {
        box = document.createElement('div');
        box.id = 'error-banner';
        box.setAttribute('style',
          'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#c0392b;color:#fff;' +
          'font-size:13px;line-height:1.4;padding:8px 12px;text-align:center;box-shadow:0 -2px 8px rgba(0,0,0,.3);');
        if (document.body) document.body.appendChild(box);
      }
      if (box) box.textContent = '⚠️ 程序出现小问题（' + msg + '）。如页面异常，请返回首页或重启应用。';
    } catch (_) {}
  }
  window.addEventListener('error', function (e) {
    try {
      var msg = (e && e.message) ? e.message : '未知错误';
      var stack = (e && e.error && e.error.stack) ? e.error.stack.substring(0, 200) : '';
      if (window.GameStorage) GameStorage.addLog('error', '[window.onerror] ' + msg + ' ' + stack);
      ensureBanner(msg.substring(0, 40));
    } catch (_) {}
  });
  window.addEventListener('unhandledrejection', function (e) {
    try {
      var msg = (e && e.reason) ? (e.reason.message || String(e.reason)) : 'Promise 错误';
      if (window.GameStorage) GameStorage.addLog('error', '[unhandledrejection] ' + msg);
      ensureBanner(msg.substring(0, 40));
    } catch (_) {}
  });
})();

const App = (function () {
  var currentSubject = null;
  var currentLevel = 1;
  var currentQuestions = [];
  var currentQIndex = 0;
  var hearts = 3;
  var correctCount = 0;
  var startTime = 0;
  var score = 0;
  var streak = 0;
  var maxStreak = 0;
  var countdownTimer = null;
  var countdownValue = 30;
  var TOTAL_QUESTIONS = 5; // 保持不变
  var MAX_HEARTS = 3; // 保持不变
  var isSoundEnabled = true;
  var isSpeechSupported = !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
var _androidTtsKnownUnavailable = false; // 缓存TTS不可用状态，避免重复检查
var _ttsInitialized = false; // TTS是否已完成初始化尝试

// 监听Android TTS初始化完成事件（由Java端主动调用）
// 监听Android TTS初始化成功事件
window.onAndroidTTSReady = function() {
  console.log('[onAndroidTTSReady] TTS initialized successfully');
  _androidTtsKnownUnavailable = false;
  _ttsInitialized = true;
  GameStorage.addLog('info', 'AndroidTTS ready!');
  if (_pendingSpeak) {
    var ps = _pendingSpeak;
    _pendingSpeak = null;
    speakWithAndroidTTS(ps.text, ps.lang);
  }
};

// 处理原生返回键/手势：逐级返回上一级，首页才退出应用
window.onNativeBack = function() {
  console.log('[onNativeBack] called');
  GameStorage.addLog('info', 'Native back pressed');
  try {
    // 数学模块内部用自身视图切换（不进共享屏幕栈）：手势返回交给 MathGame 逐级返回，
    // 实现「游戏内 → 子关卡选择 → 数学主菜单 → 首页」的逐级返回，而不是直接回首页。
    if (currentScreenId === 'math-screen' && typeof MathGame !== 'undefined' && MathGame.goBack) {
      MathGame.goBack();
      return;
    }
    App.goBack();
  } catch(e) {
    // 发生异常时不要直接退出应用，仅记录，避免“返回即闪退”
    console.error('[onNativeBack] error:', e);
    GameStorage.addLog('error', '[onNativeBack] failed: ' + (e && e.message ? e.message : e));
  }
};

// 监听Android TTS初始化失败事件
window.onAndroidTTSFailed = function() {
  console.error('[onAndroidTTSFailed] TTS initialization failed!');
  _androidTtsKnownUnavailable = true;
  _ttsInitialized = true;
};

function checkAndroidTTS() {
  try {
    if (!window.AndroidTTS) {
      GameStorage.addLog('info', 'checkAndroidTTS: window.AndroidTTS is undefined');
      return false;
    }
    GameStorage.addLog('info', 'checkAndroidTTS: AndroidTTS exists, calling isAvailable()');
    var rawResult = window.AndroidTTS.isAvailable && window.AndroidTTS.isAvailable();
    GameStorage.addLog('info', 'checkAndroidTTS: isAvailable raw result=' + rawResult);

    // 解析字符串格式 "ready=true, tts=true" 或 "ready=false, tts=false"
    // 注意：字符串永远truthy，所以必须解析内容来判断
    // 解析字符串格式 "ready=true, tts=true" 或 "ready=false, tts=false"
    // 注意：字符串永远truthy，必须解析内容
    var isReady = (typeof rawResult === 'string') && rawResult.indexOf('ready=true') !== -1;
    var available = isReady;
    GameStorage.addLog('info', 'checkAndroidTTS: available=' + available + ' (isReady=' + isReady + ')');
    // Also get detailed debug info from native
    if (window.AndroidTTS && window.AndroidTTS.debug) {
      var debugInfo = window.AndroidTTS.debug();
      GameStorage.addLog('info', 'checkAndroidTTS: AndroidTTS.debug()=' + debugInfo);
    }
    return available;
  } catch(e) {
    GameStorage.addLog('error', 'checkAndroidTTS exception: ' + e.message);
    return false;
  }
}

  var TOTAL_QUESTIONS = 5;
  var MAX_HEARTS = 3;

  var currentTotalQuestions = 5;

  // ===== Audio Manager (Web Audio API) =====
  var audioCtx = null;
  
  function getAudioCtx() {
    if (!isSoundEnabled) return null;
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function toggleSound() {
    isSoundEnabled = !isSoundEnabled;
    var btn = document.getElementById('sound-toggle');
    if (btn) btn.textContent = isSoundEnabled ? '🔊' : '🔇';
    if (!isSoundEnabled) stopBgMusic();
    else startBgMusic();
  }
  
  function playCorrectSound() {
    try {
      var ctx = getAudioCtx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(783.99, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}
  }
  
  function playWrongSound() {
    try {
      var ctx = getAudioCtx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(392.00, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(261.63, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}
  }
  
  var bgMusicInterval = null;
  var isBgMusicPlaying = false;
  var melodyNotes = [523.25, 587.33, 659.25, 698.46, 783.99, 698.46, 659.25, 587.33];
  var noteIdx = 0;
  
  function playBgNote() {
    try {
      var ctx = getAudioCtx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(melodyNotes[noteIdx % melodyNotes.length], ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.8);
      noteIdx++;
    } catch(e) {}
  }
  
  function startBgMusic() {
    if (isBgMusicPlaying) return;
    try {
      isBgMusicPlaying = true;
      playBgNote();
      bgMusicInterval = setInterval(playBgNote, 900);
    } catch(e) {
      console.warn('[startBgMusic] error:', e);
      GameStorage.addLog('warn', '[startBgMusic] FAIL: ' + e.message);
    }
  }
  
  function stopBgMusic() {
    isBgMusicPlaying = false;
    if (bgMusicInterval) {
      clearInterval(bgMusicInterval);
      bgMusicInterval = null;
    }
  }

  // 汉字拼音标注辅助函数
  function addPinyinToText(text) {
    if (!text || typeof PinyinDict === 'undefined') return text;
    // 保留 HTML 标签，只对纯文本添加拼音
    var result = '';
    var inTag = false;
    var tagContent = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '<') { inTag = true; tagContent = ch; continue; }
      if (ch === '>') { inTag = false; tagContent += ch; result += tagContent; tagContent = ''; continue; }
      if (inTag) { tagContent += ch; continue; }
      // 检查是否是汉字
      if (/[一-龥]/.test(ch)) {
        var py = PinyinDict.getPinyin(ch);
        if (py) {
          result += '<ruby><rb>' + ch + '</rb><rt>' + py + '</rt></ruby>';
        } else {
          result += ch;
        }
      } else {
        result += ch;
      }
    }
    return result;
  }

  // ===== init =====
  function init() {
    console.log('[init] Starting app initialization...');
    try {
      console.log('[init] Step 1: Loading data...');
      DataManager.loadAll();
      console.log('[init] Step 2: Updating UI...');
      updateHomeUI();
      console.log('[init] Step 3: Checking reward...');
      checkReward();
      console.log('[init] Step 4: Starting music...');
      startBgMusic();
      console.log('[init] Step 5: Initializing shop...');
      initShop();
      console.log('[init] App initialized successfully');
    } catch(e) {
      console.error('[init] Error during initialization:', e);
      GameStorage.addLog('error', '[init] FAIL: ' + e.message + ' ' + (e.stack ? e.stack.substring(0, 300) : ''));
      alert('初始化失败: ' + e.message);
    }
  }

  function updateHomeUI() {
    var p = GameStorage.getProgress();
    document.getElementById('home-coins').textContent = p.coins;
    document.getElementById('home-hints').textContent = p.hints;
    updateFreeTimeDisplay();
    updateGiftsDisplay();
    updateMultiplierDisplay();

    ['idiom', 'poem', 'english', 'hanzi'].forEach(function(sub) {
      var prog = p[sub] || { unlockedLevel: 1, stars: {}, highestLevel: 1 };
      var stars = calcTotalStars(prog.stars || {});
      var starStr = renderStars(stars, (prog.highestLevel || 1) * 5);
      document.getElementById(sub + '-stars').textContent = starStr;
      document.getElementById(sub + '-level').textContent = '第' + (prog.highestLevel || 1) + '关';
    });
  }

  // 显示当前得分倍数
  function updateMultiplierDisplay() {
    var mult = getScoreMultiplier();
    var multEl = document.getElementById('home-multiplier');
    if (multEl) {
      if (mult > 1) {
        multEl.textContent = '×' + mult.toFixed(1);
        multEl.style.display = '';
      } else {
        multEl.style.display = 'none';
      }
    }
  }

  function calcTotalStars(starsObj) {
    return Object.keys(starsObj).reduce(function(s, k) { return s + starsObj[k]; }, 0);
  }

  function renderStars(count, total) {
    var s = '';
    for (var i = 0; i < 5 && i < total; i++) {
      s += i < count ? '★' : '☆';
    }
    return s;
  }

  // ===== 轻量吐司提示（无模态，自动消失） =====
  function showToast(text) {
    try {
      var t = document.createElement('div');
      t.textContent = text;
      t.setAttribute('style',
        'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:99998;' +
        'background:rgba(0,0,0,.82);color:#fff;font-size:14px;padding:10px 16px;border-radius:10px;' +
        'max-width:80%;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.3);');
      if (document.body) document.body.appendChild(t);
      setTimeout(function() { if (t && t.parentNode) t.parentNode.removeChild(t); }, 2600);
    } catch (_) {}
  }

  // ===== daily reward =====
  function checkReward() {
    try {
      var r = GameStorage.checkDailyReward();
      if (r.claimed) {
        var rt = document.getElementById('reward-text');
        var rp = document.getElementById('reward-popup');
        if (rt) {
          rt.textContent = '🎁 每日登录奖励：+' + r.coins + ' 金币（连续登录 ' + r.streak + ' 天）';
        }
        if (rp) {
          rp.classList.add('active');
        } else {
          // 弹窗元素缺失时，用吐司兜底，确保用户知道金币来源
          showToast('🎁 每日登录奖励 +' + r.coins + ' 金币（连续登录 ' + r.streak + ' 天）');
        }
      }
    } catch (e) {
      console.error('[checkReward] error:', e);
      if (window.GameStorage) GameStorage.addLog('error', '[checkReward] ' + e.message);
    }
  }

  function closeReward() {
    document.getElementById('reward-popup').classList.remove('active');
    updateHomeUI();
  }

  // ===== screen switch (with back-stack) =====
  // screenStack 记录前进历史（不含当前屏与首页根），用于手势/返回键逐级回退
  var screenStack = [];
  var currentScreenId = 'home-screen';

  function showScreen(id, isBack) {
    // 前进导航时，把当前屏压入历史栈（首页是根，不进栈中部；回到首页清空栈）
    if (currentScreenId && currentScreenId !== id && !isBack) {
      screenStack.push(currentScreenId);
    }
    if (id === 'home-screen') {
      screenStack = [];
    }
    currentScreenId = id;
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    document.getElementById(id).classList.add('active');
    if (id !== 'quiz-screen' && id !== 'home-screen') {
      stopBgMusic();
    }
  }

  // 返回上一级：有历史则回退，无历史（已在首页）则退出应用
  function goBack() {
    if (screenStack.length > 0) {
      var prev = screenStack.pop();
      console.log('[goBack] pop -> ' + prev + ' (stack len ' + screenStack.length + ')');
      showScreen(prev, true);
      // 某些子页返回后需要刷新首页状态
      if (prev === 'home-screen') updateHomeUI();
    } else {
      console.log('[goBack] at root, finish app');
      try {
        if (window.AndroidBridge && window.AndroidBridge.finish) {
          window.AndroidBridge.finish();
        }
      } catch(e) {
        console.log('[goBack] finish failed', e);
      }
    }
  }

  // ===== level selection =====
  function goToLevels(subject) {
    currentSubject = subject;
    var names = { idiom: '成语乐园', poem: '古诗天地', english: '英语世界', hanzi: '汉字乐园' };
    var totalLevels = DataManager.getTotalLevels(subject);
    document.getElementById('levels-title').textContent = (names[subject] || '选择关卡') + '（共' + totalLevels + '关）';
    renderLevelGrid();
    showScreen('levels-screen');
  }

  function renderLevelGrid() {
    var p = GameStorage.getProgress();
    var prog = p[currentSubject] || { unlockedLevel: 1, stars: {}, highestLevel: 1 };
    var unlocked = prog.unlockedLevel || 1;
    var stars = prog.stars || {};
    var totalLevels = DataManager.getTotalLevels(currentSubject);
    var grid = document.getElementById('levels-grid');
    grid.innerHTML = '';

    for (var i = 1; i <= totalLevels; i++) {
      var btn = document.createElement('button');
      btn.className = 'level-btn';
      var starCount = stars[i] || 0;
      var starStr = '★'.repeat(starCount) + '☆'.repeat(3 - starCount);
      if (i > unlocked) {
        btn.classList.add('locked');
        btn.innerHTML = '<span class="lock-icon">🔒</span>';
      } else {
        if (starCount > 0) btn.classList.add('completed');
        btn.innerHTML = '<span>' + i + '</span><span class="level-stars">' + starStr + '</span>';
        (function(lvl) {
          btn.onclick = function() { startLevel(lvl); };
        })(i);
      }
      grid.appendChild(btn);
    }
  }

  // ===== start level =====
  function startLevel(level) {
    // 初始化分数、连击、倒计时
    score = 0;
    streak = 0;
    maxStreak = 0;
    countdownValue = 30;
    updateScoreUI();
    updateStreakUI();
    updateCountdownUI();
    currentLevel = level;
    currentQIndex = 0;
    hearts = MAX_HEARTS;
    correctCount = 0;
    startTime = Date.now();
    showScreen('quiz-screen');
    document.getElementById('quiz-level-info').textContent =
      getSubjectName(currentSubject) + ' · 第' + level + '关';
    updateHearts();
    updateQuizHints();
    currentTotalQuestions = (currentSubject === 'hanzi') ? 10 : 5;
    currentQuestions = DataManager.generateQuestions(currentSubject, level, currentTotalQuestions);
    if (!currentQuestions.length) {
      alert('题库数据加载中，请稍后再试');
      showScreen('home-screen');
      return;
    }
    showQuestion();
    // 重置倒计时
    countdownValue = 30;
    updateCountdownUI();
  }

  function getSubjectName(sub) {
    return { idiom: '成语乐园', poem: '古诗天地', english: '英语世界', hanzi: '汉字乐园' }[sub] || '';
  }

  // ===== show question =====
  function showQuestion() {
    var q = currentQuestions[currentQIndex];
    if (!q) { finishLevel(); return; }
    var card = document.getElementById('question-card');
    card.classList.remove('fade-in');
    void card.offsetWidth;
    card.classList.add('fade-in');
    // 处理题目文本：先构建 qText，再统一替换 {{BLANK:n}}
    var qText = q.q;

    // 诗词题目：显示两句 + 答案词变成田字格
    if (currentSubject === 'poem') {
      var poemItem = DataManager.getDataBySubject('poem').find(function(d) { return d.id === q.poemId; });
      if (poemItem && poemItem.content) {
        for (var i = 0; i < poemItem.content.length; i++) {
          if (poemItem.content[i].indexOf(q.answer) !== -1) {
            var lines = [];
            lines.push(poemItem.content[i]);
            if (i + 1 < poemItem.content.length) {
              lines.push(poemItem.content[i + 1]);
            } else if (i - 1 >= 0) {
              lines.unshift(poemItem.content[i - 1]);
            }
            // 把答案词替换成田字格
            var answerLen = q.answer.length;
            var tianziHtml = '';
            for (var t = 0; t < answerLen; t++) {
              tianziHtml += '<span class="tianzi-cell"></span>';
            }
            var displayLines = lines.map(function(line) {
              return line.replace(q.answer, tianziHtml);
            });
            qText = displayLines.join('<br>');
            break;
          }
        }
      }
    }

    // 统一替换 {{BLANK:n}} 为田字方格（诗词两句中的空缺也要替换）
    qText = qText.replace(/{{BLANK:(\d+)}}/g, function(match, len) {
      var html = '';
      for (var i = 0; i < parseInt(len); i++) {
        html += '<span class="tianzi-cell"></span>';
      }
      return html;
    });

    // 成语和诗词添加拼音标注
    if (currentSubject === 'idiom' || currentSubject === 'poem') {
      qText = addPinyinToText(qText);
    }
    // 英语题目如果有中文也添加拼音
    else if (currentSubject === 'english' && q.q && /[一-龥]/.test(q.q)) {
      qText = addPinyinToText(qText);
    }

    document.getElementById('question-text').innerHTML = qText;

    // Show speaker button for English/idiom/poem questions
    var speakerBtn = document.getElementById("speaker-btn");
    // 始终显示喇叭按钮
    if (speakerBtn) {
      speakerBtn.style.display = 'block';
      speakerBtn.style.visibility = 'visible';
      speakerBtn.style.opacity = '1';
      console.log('[showQuestion] speaker button displayed');
    }

    var progress = (currentQIndex / currentTotalQuestions) * 100;
    document.getElementById('quiz-progress').style.width = progress + '%';
    var optionsC = document.getElementById('options-container');
    optionsC.style.display = 'flex';
    optionsC.innerHTML = '';
    var labels = ['A', 'B', 'C', 'D'];
    q.options.forEach(function(opt, i) {
      var btn = document.createElement('button');
      btn.className = 'option-btn slide-in';
      btn.style.animationDelay = (i * 0.1) + 's';
      btn.innerHTML = '<span class="option-label">' + labels[i] + '</span><span>' + opt + '</span>';
      (function(b, chosen, correct, question) {
        b.onclick = function() { selectOption(b, chosen, correct, question); };
      })(btn, opt, q.answer, q);
      optionsC.appendChild(btn);
    });
  }

  // ===== speak question =====
  var _voiceList = [];
  var _voicesLoaded = false;
  var _currentUtter = null;
  var _speakTimeout = null;

  // 初始化语音列表
  function _loadVoices() {
    try {
      _voiceList = window.speechSynthesis.getVoices();
      if (_voiceList.length > 0) _voicesLoaded = true;
    } catch(e) {}
  }
  if (isSpeechSupported && window.speechSynthesis) {
    try {
      window.speechSynthesis.onvoiceschanged = _loadVoices;
      _loadVoices();
    } catch(e) { isSpeechSupported = false; }
  }

  // 等待语音列表加载
  function _waitForVoices(callback) {
    if (_voicesLoaded && _voiceList.length > 0) { callback(); return; }
    // 重试最多 20 次（2 秒）
    var attempts = 0;
    function tryAgain() {
      attempts++;
      _loadVoices();
      if ((_voicesLoaded && _voiceList.length > 0) || attempts > 20) { callback(); return; }
      setTimeout(tryAgain, 100);
    }
    tryAgain();
  }

  function speakQuestion() {
    try {
      GameStorage.addLog('info', '[speakQuestion] subject=' + currentSubject);
      var q = currentQuestions[currentQIndex];
      if (!q) { GameStorage.addLog('warn', 'speakQuestion: no current question'); return; }

      // 获取要朗读的文本
      var text = '';
      var lang = 'zh-CN';
      try {
        if (currentSubject === 'idiom') {
          var idiomItem = DataManager.getDataBySubject('idiom').find(function(d) { return d.id === q.idiomId; });
          if (idiomItem) text = idiomItem.word;
          lang = 'zh-CN';
        } else if (currentSubject === 'poem') {
          var poemItem = DataManager.getDataBySubject('poem').find(function(d) { return d.id === q.poemId; });
          if (poemItem) {
            for (var i = 0; i < poemItem.content.length; i++) {
              if (poemItem.content[i].indexOf(q.answer) !== -1) {
                text = poemItem.content[i];
                break;
              }
            }
            if (!text) text = poemItem.content[0];
          }
          lang = 'zh-CN';
        } else if (currentSubject === 'english') {
          var engItem = DataManager.getDataBySubject('english').find(function(d) { return d.id === q.englishId; });
          if (engItem) text = engItem.word; // 朗读英文单词，而不是中文释义
          lang = 'en';
          if (!text) text = q.q || q.answer;
        } else if (currentSubject === 'hanzi') {
          var hItem = DataManager.getDataBySubject('hanzi').find(function(d) { return d.id === q.hanziId; });
          if (hItem) text = hItem.word;
          lang = 'zh-CN';
          if (!text) text = q.char || q.q;
        }
      } catch(e) { GameStorage.addLog('error', 'speakQuestion build text: ' + e.message); }
      if (!text) text = q.q || '';
      GameStorage.addLog('info', '[speakQuestion] text=' + text + ' lang=' + lang);

      // 优先原生 TTS：直接调用 speak，Java 端未就绪会自动排队补播；
      // 安卓 WebView 的 Web Speech 基本静音，仅作为极端兜底；任何异常都不向用户抛错。
      if (window.AndroidTTS) {
        speakWithAndroidTTS(text, lang);
      } else if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
        speakWithWebSpeech(text, lang);
      } else {
        GameStorage.addLog('warn', 'speakQuestion: no TTS available, silent');
        showSpeakerUnavailable(text);
      }

      // 启动倒计时
      try { startCountdown(); } catch(e) {}
    } catch(e) {
      // 兜底：朗读相关任何异常都不要冒泡成“报错”红条，影响答题
      GameStorage.addLog('error', 'speakQuestion exception: ' + (e && e.message ? e.message : e));
    }
  }

  // 朗读不可用时给温和提示（显示读音文本），而不是报错或弹窗
  function showSpeakerUnavailable(text) {
    try {
      var btn = document.getElementById('speaker-btn');
      if (!btn) return;
      var old = btn.textContent;
      var tip = text ? ('🔊 ' + text) : '🔇 暂不可读';
      btn.textContent = tip;
      setTimeout(function() { try { btn.textContent = old; } catch(e) {} }, 1800);
    } catch(e) {}
  }

  var _pendingSpeak = null;
  var _speakRetryTimer = null;

  function _doSpeakQuestion() {
    if (!_pendingSpeak) return;
    var text = _pendingSpeak.text;
    var lang = _pendingSpeak.lang;

    // 清除之前的重试定时器
    if (_speakRetryTimer) { clearTimeout(_speakRetryTimer); _speakRetryTimer = null; }

    if (window.AndroidTTS) {
      // 原生 TTS 存在即直接调用（Java 端排队补播），不再检查 isAvailable
      speakWithAndroidTTS(text, lang);
    } else {
      // 安卓接口尚未注入：短暂重试后仍无则回退 Web Speech
      if (_pendingSpeak.retries < 5) {
        _pendingSpeak.retries++;
        console.log("[speakQuestion] AndroidTTS not injected, retry " + _pendingSpeak.retries + "/5 in 300ms");
        _speakRetryTimer = setTimeout(function() {
          _doSpeakQuestion();
        }, 300);
      } else {
        console.warn("[speakQuestion] AndroidTTS unavailable after retries, trying Web Speech");
        speakWithWebSpeech(text, lang);
      }
    }
  }

  // Android 原生 TTS
  var _androidTtsRetryCount = 0;
  var _maxAndroidTtsRetries = 3;

  function speakWithAndroidTTS(text, lang) {
    if (!text) { GameStorage.addLog('warn', 'speakWithAndroidTTS: empty text'); fallbackToPrompt(''); return; }
    lang = lang || 'zh-CN';
    GameStorage.addLog('info', 'AndroidTTS speak: "' + text.substring(0, 20) + '" lang=' + lang);
    try {
      if (!window.AndroidTTS) {
        GameStorage.addLog('warn', 'AndroidTTS not found, fallback to Web Speech');
        speakWithWebSpeech(text, lang);
        return;
      }
      window.AndroidTTS.speak(text, lang);
      GameStorage.addLog('info', 'AndroidTTS.speak() called OK');
      _androidTtsRetryCount = 0;
    } catch(e) {
      GameStorage.addLog('error', 'AndroidTTS error: ' + e.message);
      if (_androidTtsRetryCount < _maxAndroidTtsRetries) {
        _androidTtsRetryCount++;
        setTimeout(function() { speakWithAndroidTTS(text, lang); }, 300);
      } else {
        GameStorage.addLog('warn', 'AndroidTTS retries exhausted, fallback to Web Speech');
        _androidTtsRetryCount = 0;
        speakWithWebSpeech(text, lang);
      }
    }
  }

  function speakWithWebSpeech(text, lang) {
    if (!text) { fallbackToPrompt(''); return; }
    GameStorage.addLog('info', 'speakWithWebSpeech: "' + text.substring(0, 20) + '" lang=' + lang);

    // 检查浏览器是否支持Web Speech API
    if (!window.SpeechSynthesisUtterance) {
      GameStorage.addLog('error', 'SpeechSynthesisUtterance not supported');
      fallbackToPrompt(text);
      return;
    }

    // 清除之前的超时
    if (_speakTimeout) { clearTimeout(_speakTimeout); _speakTimeout = null; }

    // 等待语音列表加载完成后播放
    _waitForVoices(function() {
      GameStorage.addLog('info', 'WebSpeech: ' + _voiceList.length + ' voices, trying "' + text.substring(0, 20) + '" lang=' + lang);
      try {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        _currentUtter = null;

        var utter = new SpeechSynthesisUtterance(text);
        utter.lang = lang || 'zh-CN';
        utter.rate = 0.9;
        utter.volume = 1.0;

        // 显式选择对应语言的语音
        if (lang && lang.startsWith('en') && _voiceList.length > 0) {
          var enVoice = _voiceList.find(function(v) { return v.lang.startsWith('en'); });
          if (enVoice) {
            utter.voice = enVoice;
            console.log("[speakWithWebSpeech] Using English voice:", enVoice.name);
          } else {
            console.warn("[speakWithWebSpeech] No English voice found! Available:", _voiceList.map(function(v) { return v.lang; }));
          }
        } else if (_voiceList.length === 0) {
          console.warn("[speakWithWebSpeech] No voices available! Speech may not work.");
        }

        var hasStarted = false;
        utter.onstart = function() {
          hasStarted = true;
          GameStorage.addLog('info', 'WebSpeech started');
        };
        utter.onend = function() {
          GameStorage.addLog('info', 'WebSpeech ended');
          _currentUtter = null;
        };
        utter.onerror = function(e) {
          var err = e.error || (e.type === 'error' ? 'error' : 'unknown');
          GameStorage.addLog('error', 'WebSpeech error: ' + err);
          _currentUtter = null;
          if (err !== 'interrupted' && err !== 'canceled') {
            fallbackToPrompt(text);
          }
        };

        _currentUtter = utter;
        if (window.speechSynthesis && window.speechSynthesis.paused) window.speechSynthesis.resume();
        if (window.speechSynthesis) {
          window.speechSynthesis.speak(utter);
          GameStorage.addLog('info', 'WebSpeech.speak() called');
        } else {
          GameStorage.addLog('error', 'speechSynthesis not available');
          fallbackToPrompt(text);
          return;
        }

        _speakTimeout = setTimeout(function() {
          if (_currentUtter === utter && !hasStarted) {
            GameStorage.addLog('warn', 'WebSpeech timeout');
            try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch(ex) {}
            _currentUtter = null;
            _speakTimeout = null;
            fallbackToPrompt(text);
          }
        }, 3000);
      } catch(e) {
        GameStorage.addLog('error', 'speakWithWebSpeech exception: ' + e.message);
        _currentUtter = null;
        fallbackToPrompt(text);
      }
    });
  }

  function fallbackToPrompt(text) {
    // 播放提示音（Web Audio API）
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch(e) {
      console.warn('Web Audio not supported:', e);
    }

    // 高亮文字
    var qEl = document.getElementById('question-text');
    if (qEl) {
      qEl.style.transition = 'color 0.3s, transform 0.3s';
      qEl.style.color = '#FF6B6B';
      qEl.style.transform = 'scale(1.05)';
      setTimeout(function() {
        qEl.style.color = '';
        qEl.style.transform = '';
      }, 800);
    }

    console.log('[发音提示] ' + text);
  }

  

  function selectOption(btn, chosen, correct, question) {
    var delay = 600;
    // 高亮所有按钮（含正确答案），失败也不影响后续流程
    try {
      var allBtns = document.querySelectorAll('.option-btn');
      allBtns.forEach(function(b) {
        b.classList.add('disabled');
        var span = b.querySelector('span:last-child');
        if (span && span.textContent === correct) {
          b.classList.add('correct');
        }
      });
    } catch(e) { GameStorage.addLog('error', 'selectOption highlight: ' + e.message); }

    if (chosen === correct) {
      try {
        btn.classList.add('correct');
        correctCount++;
        // 更新分数和连击
        score += 10 * (streak + 1); // 连击加成
        streak++;
        if (streak > maxStreak) maxStreak = streak;
        updateScoreUI();
        updateStreakUI();
        playStreakSound(); // 连击音效
        var itemId = question.idiomId || question.poemId || question.englishId || question.hanziId;
        if (itemId) GameStorage.removeWrong(currentSubject, itemId);
        playCorrectSound();
      } catch(e) { GameStorage.addLog('error', 'selectOption correct effects: ' + e.message); }
    } else {
      try {
        btn.classList.add('wrong');
        btn.classList.add('shake');
        hearts--;
        // 重置连击
        streak = 0;
        updateStreakUI();
        updateHearts();
        var itemId2 = question.idiomId || question.poemId || question.englishId || question.hanziId;
        if (itemId2) GameStorage.addWrong(currentSubject, itemId2);
        playWrongSound();
      } catch(e) { GameStorage.addLog('error', 'selectOption wrong effects: ' + e.message); }
      if (hearts <= 0) delay = 800;
    }
    // 关键：无论上面的附加逻辑是否异常，都必须进入下一题，避免“答完一题卡住”
    try {
      if (hearts <= 0) {
        setTimeout(function() { failLevel(); }, delay);
      } else {
        setTimeout(nextQuestion, delay);
      }
    } catch(e) { GameStorage.addLog('error', 'selectOption schedule: ' + e.message); }
  }

  function nextQuestion() {
    // 清除倒计时（防御性，避免异常阻断进入下一题）
    try { clearCountdown(); } catch(e) {}
    currentQIndex++;
    if (currentQIndex >= currentTotalQuestions || currentQIndex >= currentQuestions.length) {
      finishLevel();
    } else {
      showQuestion();
    }
  }

  // ===== update UI =====
  function updateHearts() {
    var h = '';
    for (var i = 0; i < MAX_HEARTS; i++) {
      h += i < hearts ? '❤️' : '🤍';
    }
    document.getElementById('hearts').innerHTML = h;
  }

  function updateQuizHints() {
    var p = GameStorage.getProgress();
    document.getElementById('quiz-hints').textContent = p.hints;
  }

  // ===== use hint =====
  function useHint() {
    if (!GameStorage.useHint()) {
      alert('提示卡不足！');
      return;
    }
    updateQuizHints();
    var q = currentQuestions[currentQIndex];
    var btns = document.querySelectorAll('.option-btn:not(.correct):not(.wrong)');
    var wrongBtns = Array.from(btns).filter(function(b) {
      return b.querySelector('span:last-child').textContent !== q.answer;
    });
    if (wrongBtns.length > 0) {
      var toRemove = wrongBtns[Math.floor(Math.random() * wrongBtns.length)];
      toRemove.style.opacity = '0.3';
      toRemove.style.pointerEvents = 'none';
    }
    var btn = document.getElementById('hint-btn');
    var p2 = GameStorage.getProgress();
    if (p2.hints <= 0) btn.disabled = true;
  }

  // ===== pass / fail =====
  function finishLevel() {
    // 清除倒计时
    clearCountdown();
    var elapsed = (Date.now() - startTime) / 1000;
    var pct = correctCount / currentTotalQuestions;
    var stars = 1;
    if (pct >= 1 && elapsed < 60) stars = 3;
    else if (pct >= 0.8) stars = 2;
    else if (pct >= 0.6) stars = 1;
    else { failLevel(); return; }
    var baseCoins = stars * 10;
    // 计算礼物倍数：每个小礼物增加0.1倍，最高2倍
    var multiplier = getScoreMultiplier();
    var coins = Math.round(baseCoins * multiplier);
    // 仅在首次通关或星级提升时发放金币，避免重玩已过关卡反复刷币
    var prevStars = 0;
    var prog = GameStorage.getProgress();
    if (prog[currentSubject] && prog[currentSubject].stars[currentLevel]) {
      prevStars = prog[currentSubject].stars[currentLevel];
    }
    var awardCoins = (stars > prevStars) ? coins : 0;
    if (awardCoins > 0) {
      GameStorage.addCoins(awardCoins);
    }
    GameStorage.saveLevelStars(currentSubject, currentLevel, stars);
    showResult(stars, awardCoins, multiplier, true);
  }

  function failLevel() {
    // 清除倒计时
    clearCountdown();
    showResult(0, 0, 1, false);
  }

  // 计算得分倍数：基于拥有的小礼物数量
  function getScoreMultiplier() {
    var gifts = GameStorage.getOwnedGifts();
    var count = gifts.length;
    if (count === 0) return 1;
    // 每增加一个小礼物，倍数+0.1，最多+1.0（2倍）
    var bonus = Math.min(count * 0.1, 1.0);
    return 1 + bonus;
  }

  function showResult(stars, coins, multiplier, success) {
    var modal = document.getElementById('result-modal');
    var title = document.getElementById('result-title');
    var starsEl = document.getElementById('result-stars');
    var msg = document.getElementById('result-msg');
    var nextBtn = modal.querySelector('.modal-btn:not(.secondary)');
    var homeBtn = modal.querySelector('.modal-btn.secondary:last-child');
    if (success) {
      title.textContent = '🎉 恭喜过关！';
      starsEl.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      // 显示倍数信息
      var multText = '';
      if (multiplier > 1) {
        multText = ' (×' + multiplier.toFixed(1) + ')';
      }
      if (coins > 0) {
        msg.textContent = '获得 ' + coins + ' 金币！' + multText + '继续加油！';
      } else {
        msg.textContent = '已通关此关，金币不变～挑战更高星级可再得奖励！';
      }
      if (nextBtn) nextBtn.style.display = '';
      if (homeBtn) homeBtn.style.display = '';
      createConfetti();
    } else {
      title.textContent = '😢 闯关失败';
      starsEl.textContent = '💪';
      msg.textContent = '别灰心，再试一次吧！';
      if (nextBtn) nextBtn.style.display = 'none';
      if (homeBtn) homeBtn.style.display = '';
    }
    modal.classList.add('active');
  }

  function createConfetti() {
    var colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A29BFE', '#FF8A80', '#80CBC4'];
    var container = document.createElement('div');
    container.className = 'confetti-container';
    for (var i = 0; i < 50; i++) {
      var c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.animationDelay = Math.random() * 1.5 + 's';
      c.style.width = (6 + Math.random() * 8) + 'px';
      c.style.height = (6 + Math.random() * 8) + 'px';
      container.appendChild(c);
    }
    document.body.appendChild(container);
    setTimeout(function() {
      container.remove();
    }, 3000);
  }

  function nextLevel() {
    document.getElementById('result-modal').classList.remove('active');
    startLevel(currentLevel + 1);
  }

  function retryLevel() {
    document.getElementById('result-modal').classList.remove('active');
    startLevel(currentLevel);
  }

  function confirmQuit() {
    console.log('[confirmQuit] called, currentQIndex:', currentQIndex);
    try {
      // 清除倒计时
      try { clearCountdown(); } catch(e) {}
      // 强制返回首页（走统一切换，保持返回栈同步）
      showScreen('home-screen');
      updateHomeUI();
      // 重置游戏状态
      currentQuestions = [];
      currentQIndex = 0;
    } catch(e) {
      console.error('[confirmQuit] error:', e);
      alert('返回失败: ' + e.message);
    }
  }
  // ===== 错题本 =====
  function showWrongBook() {
    showScreen('wrongbook-screen');
    renderWrongBook();
  }

  // ===== 数学游戏入口 =====
  function goToMathGame() {
    console.log('[goToMathGame] called, MathGame:', typeof MathGame);
    GameStorage.addLog('info', '点击数学游戏入口');
    var mathScreen = document.getElementById('math-screen');
    console.log('[goToMathGame] math-screen:', mathScreen);
    GameStorage.addLog('info', 'math-screen exists: ' + !!mathScreen);

    if (mathScreen) {
      showScreen('math-screen');
      MathGame.showMenu();
    } else {
      GameStorage.addLog('warn', 'math-screen not found in DOM');
      var container = document.querySelector('.container');
      if (container) {
        var mathDiv = document.createElement('div');
        mathDiv.id = 'math-screen';
        mathDiv.className = 'screen';
        container.appendChild(mathDiv);
        GameStorage.addLog('info', 'math-screen div created');
        showScreen('math-screen');
        MathGame.showMenu();
      } else {
        GameStorage.addLog('error', 'Cannot create math-screen - container not found');
        alert('数学游戏加载失败，请重启应用');
      }
    }
  }

  function renderWrongBook() {
    var wb = GameStorage.getWrongBook();
    var container = document.getElementById('wrongbook-content');
    container.innerHTML = '';
    var subjectNames = { idiom: '成语', poem: '古诗', english: '英语', hanzi: '汉字' };
    var hasAny = false;
    ['idiom', 'poem', 'english', 'hanzi'].forEach(function(sub) {
      if (wb[sub].length === 0) return;
      hasAny = true;
      var title = document.createElement('h3');
      title.style.cssText = 'margin:16px 0 8px;font-size:16px;';
      title.textContent = subjectNames[sub] + '（' + wb[sub].length + '题）';
      container.appendChild(title);
      var data = DataManager.getDataBySubject(sub);
      wb[sub].forEach(function(id) {
        var item = data.find(function(d) { return d.id === id; });
        if (!item) return;
        var div = document.createElement('div');
        div.className = 'wrong-item fade-in';
        var info = '';
        if (sub === 'idiom') info = item.word + ' — ' + item.meaning;
        else if (sub === 'poem') info = item.title + '（' + item.author + '）';
        else if (sub === 'english') info = item.word + ' — ' + item.meaning_cn;
        else if (sub === 'hanzi') info = item.word + ' — ' + item.meaning;
        div.innerHTML = '<div class="info"><h4>' + subjectNames[sub] + '</h4><p>' + info + '</p></div>' +
          '<button class="remove-btn" onclick="App.removeWrong(\'' + sub + '\',\'' + id + '\',this)">✕</button>';
        container.appendChild(div);
      });
    });
    if (!hasAny) {
      container.innerHTML = '<div class="empty-state"><div class="icon">📖</div><p>还没有错题哦～<br>继续加油吧！</p></div>';
    }
  }

  function removeWrong(subject, id, btn) {
    GameStorage.removeWrong(subject, id);
    var item = btn.closest('.wrong-item');
    item.style.transition = 'opacity 0.3s';
    item.style.opacity = '0';
    setTimeout(function() { renderWrongBook(); }, 300);
  }



  // ===== 商店 =====

  function showShop() {
    console.log('[showShop] called');
    showScreen('shop-screen');
    console.log('[showShop] after showScreen');
    setTimeout(function() {
      console.log('[showShop] timeout - rendering shop');
      var container = document.getElementById('shop-items');
      console.log('[showShop] container:', container ? 'found' : 'NOT FOUND');
      if (!container) {
        console.log('[showShop] ERROR: shop-items container not found!');
        return;
      }
      renderShop();
      console.log('[showShop] after renderShop');
      updateShopCoins();
      updateShopFreeTime();
      console.log('[showShop] done');
    }, 100);
  }

  function hideShop() {
    showScreen('home-screen');
    updateHomeUI();
  }

  function goHome() {
    document.getElementById('result-modal').classList.remove('active');
    showScreen('home-screen');
    updateHomeUI();
  }

  function updateShopCoins() {
    var p = GameStorage.getProgress();
    var el = document.getElementById('shop-coins');
    if (el) el.textContent = p.coins;
  }

  function updateShopFreeTime() {
    var balance = GameStorage.getFreeTimeBalance();
    var el = document.getElementById('shop-free-time-balance');
    if (el) el.textContent = '余额：' + balance + ' 分钟';
    // 更新使用按钮状态
    var useBtn = document.getElementById('use-free-time-btn');
    if (useBtn) useBtn.style.display = balance > 0 ? 'block' : 'none';
  }

  function buyFreeTime() {
    if (!confirm('确认花费 100 🪙 兑换 1 分钟休闲时间吗？')) {
      return;
    }
    if (GameStorage.spendCoins(100)) {
      GameStorage.addFreeTime(1);
      updateShopCoins();
      updateShopFreeTime();
      alert('兑换成功！获得1分钟休闲时间 🎉');
    } else {
      alert('金币不足！需要100金币才能兑换1分钟休闲时间。');
    }
  }

  function showUseFreeTimeModal() {
    var balance = GameStorage.getFreeTimeBalance();
    if (balance <= 0) {
      alert('没有可用的休闲时间！');
      return;
    }
    var modal = document.getElementById('use-free-time-modal');
    var balEl = document.getElementById('modal-balance');
    if (balEl) balEl.textContent = balance;
    var input = document.getElementById('use-minutes-input');
    if (input) input.value = '';
    if (modal) modal.classList.add('active');
  }

  function closeUseFreeTimeModal() {
    var modal = document.getElementById('use-free-time-modal');
    if (modal) modal.classList.remove('active');
  }

  function confirmUseFreeTime() {
    var input = document.getElementById('use-minutes-input');
    var minutes = parseInt(input.value) || 0;
    var balance = GameStorage.getFreeTimeBalance();
    if (minutes <= 0) {
      alert('请输入有效的分钟数！');
      return;
    }
    if (minutes > balance) {
      alert('余额不足！当前余额：' + balance + ' 分钟');
      return;
    }
    if (GameStorage.useFreeTime(minutes)) {
      closeUseFreeTimeModal();
      updateShopFreeTime();
      updateFreeTimeDisplay();
      alert('已使用 ' + minutes + ' 分钟休闲时间！⏰');
    }
  }

  function useFreeTimeQuick(minutes) {
    var balance = GameStorage.getFreeTimeBalance();
    if (minutes === 999) minutes = balance; // "全部"按钮
    if (minutes > balance) {
      alert('余额不足！当前余额：' + balance + ' 分钟');
      return;
    }
    if (GameStorage.useFreeTime(minutes)) {
      closeUseFreeTimeModal();
      updateShopFreeTime();
      updateFreeTimeDisplay();
      alert('已使用 ' + minutes + ' 分钟休闲时间！⏰');
    }
  }

  function buyGift(itemId) {
    console.log('[buyGift] called with itemId:', itemId);
    if (typeof DebugLog !== 'undefined') DebugLog.log('[buyGift] start, itemId=' + itemId);
    var gifts = getGiftsInline();
    var gift = gifts.find(function(g) { return g.id === itemId; });
    console.log('[buyGift] found gift:', gift);
    if (!gift) {
      alert('礼物不存在！');
      return;
    }
    if (GameStorage.hasGift(itemId)) {
      alert('你已经拥有这个礼物了！');
      return;
    }
    console.log('[buyGift] showing confirm dialog...');
    var confirmed = confirm('确认花费 ' + gift.price + ' 🪙 购买 ' + gift.name + ' 吗？');
    console.log('[buyGift] confirm result:', confirmed);
    if (!confirmed) {
      console.log('[buyGift] user cancelled');
      return;
    }
    console.log('[buyGift] proceeding with purchase...');
    if (GameStorage.spendCoins(gift.price)) {
      GameStorage.buyGift(itemId);
      updateShopCoins();
      renderShop();
      updateGiftsDisplay();
      alert('购买成功！获得 ' + gift.name + ' 🎉');
    } else {
      alert('金币不足！' + gift.name + '需要 ' + gift.price + ' 金币。');
    }
  }

  function getGiftsInline() {
    return [
      { id: 'gift_001', name: '小星星', icon: '<span class="gift-icon" style="color:#FFD700">&#x2B50;</span>', price: 50, desc: '闪闪发光的小星星' },
      { id: 'gift_002', name: '小花朵', icon: '<span class="gift-icon" style="color:#FF69B4">&#x1F338;</span>', price: 80, desc: '一朵美丽的花朵' },
      { id: 'gift_003', name: '小皇冠', icon: '<span class="gift-icon" style="color:#FFD700">&#x1F451;</span>', price: 120, desc: '小小国王的皇冠' },
      { id: 'gift_004', name: '小火箭', icon: '<span class="gift-icon" style="color:#FF4444">&#x1F680;</span>', price: 150, desc: '嗖——飞上天啦' },
      { id: 'gift_005', name: '小蛋糕', icon: '<span class="gift-icon" style="color:#FFB6C1">&#x1F382;</span>', price: 100, desc: '香甜可口的小蛋糕' },
      { id: 'gift_006', name: '小气球', icon: '<span class="gift-icon" style="color:#87CEEB">&#x1F388;</span>', price: 60, desc: '五颜六色的小气球' },
      { id: 'gift_007', name: '小奖杯', icon: '<span class="gift-icon" style="color:#FFD700">&#x1F3C6;</span>', price: 200, desc: '你是第一名！' },
      { id: 'gift_008', name: '小礼物盒', icon: '<span class="gift-icon" style="color:#E91E63">&#x1F381;</span>', price: 180, desc: '里面藏着惊喜哦' },
      { id: 'gift_009', name: '小彩虹', icon: '<span class="gift-icon" style="color:#9400D3">&#x1F308;</span>', price: 160, desc: '雨后的美丽彩虹' },
      { id: 'gift_010', name: '小月亮', icon: '<span class="gift-icon" style="color:#FFFACD">&#x1F319;</span>', price: 140, desc: '晚上陪你睡觉' },
      { id: 'gift_011', name: '小太阳', icon: '<span class="gift-icon" style="color:#FFD700">☀️</span>', price: 70, desc: '暖暖的小太阳' },
      { id: 'gift_012', name: '小铃铛', icon: '<span class="gift-icon" style="color:#FFA500">🔔</span>', price: 90, desc: '叮铃叮铃响' },
      { id: 'gift_013', name: '小爱心', icon: '<span class="gift-icon" style="color:#FF69B4">💖</span>', price: 110, desc: '满满的爱意' },
      { id: 'gift_014', name: '小糖果', icon: '<span class="gift-icon" style="color:#FFB6C1">🍬</span>', price: 65, desc: '甜甜的糖果' },
      { id: 'gift_015', name: '小冰激凌', icon: '<span class="gift-icon" style="color:#87CEFA">🍦</span>', price: 95, desc: '夏天的最爱' },
      { id: 'gift_016', name: '小苹果', icon: '<span class="gift-icon" style="color:#FF4500">🍎</span>', price: 75, desc: '每天一个苹果' },
      { id: 'gift_017', name: '小香蕉', icon: '<span class="gift-icon" style="color:#FFD700">🍌</span>', price: 85, desc: '弯弯的香蕉' },
      { id: 'gift_018', name: '小葡萄', icon: '<span class="gift-icon" style="color:#9370DB">🍇</span>', price: 130, desc: '串串紫葡萄' },
      { id: 'gift_019', name: '小西瓜', icon: '<span class="gift-icon" style="color:#FF6347">🍉</span>', price: 140, desc: '清凉一夏' },
      { id: 'gift_020', name: '小草莓', icon: '<span class="gift-icon" style="color:#FF1493">🍓</span>', price: 120, desc: '红红的草莓' },
      { id: 'gift_021', name: '小汽车', icon: '<span class="gift-icon" style="color:#1E90FF">🚗</span>', price: 160, desc: '嘟嘟出发啦' },
      { id: 'gift_022', name: '小飞机', icon: '<span class="gift-icon" style="color:#00BFFF">✈️</span>', price: 180, desc: '飞向蓝天' },
      { id: 'gift_023', name: '小火车', icon: '<span class="gift-icon" style="color:#CD5C5C">🚂</span>', price: 200, desc: '轰隆轰隆' },
      { id: 'gift_024', name: '小帆船', icon: '<span class="gift-icon" style="color:#20B2AA">⛵</span>', price: 150, desc: '扬帆远航' },
      { id: 'gift_025', name: '小自行车', icon: '<span class="gift-icon" style="color:#FF8C00">🚲</span>', price: 170, desc: '叮铃出发' },
      { id: 'gift_026', name: '小恐龙', icon: '<span class="gift-icon" style="color:#6B8E23">🦕</span>', price: 220, desc: '远古的朋友' },
      { id: 'gift_027', name: '小熊猫', icon: '<span class="gift-icon" style="color:#708090">🐼</span>', price: 240, desc: '圆滚滚真可爱' },
      { id: 'gift_028', name: '小兔子', icon: '<span class="gift-icon" style="color:#FFC0CB">🐰</span>', price: 130, desc: '长耳朵蹦蹦跳' },
      { id: 'gift_029', name: '小老虎', icon: '<span class="gift-icon" style="color:#FFA500">🐯</span>', price: 210, desc: '森林之王' },
      { id: 'gift_030', name: '小狮子', icon: '<span class="gift-icon" style="color:#DAA520">🦁</span>', price: 230, desc: '威风的鬃毛' },
      { id: 'gift_031', name: '小大象', icon: '<span class="gift-icon" style="color:#A9A9A9">🐘</span>', price: 250, desc: '长长的鼻子' },
      { id: 'gift_032', name: '小猴子', icon: '<span class="gift-icon" style="color:#D2691E">🐵</span>', price: 190, desc: '机灵的小猴' },
      { id: 'gift_033', name: '小青蛙', icon: '<span class="gift-icon" style="color:#32CD32">🐸</span>', price: 110, desc: '呱呱呱' },
      { id: 'gift_034', name: '小企鹅', icon: '<span class="gift-icon" style="color:#4682B4">🐧</span>', price: 200, desc: '南极的小家伙' },
      { id: 'gift_035', name: '小海豚', icon: '<span class="gift-icon" style="color:#1E90FF">🐬</span>', price: 260, desc: '聪明的小海豚' },
      { id: 'gift_036', name: '小章鱼', icon: '<span class="gift-icon" style="color:#BA55D3">🐙</span>', price: 240, desc: '八只小脚' },
      { id: 'gift_037', name: '小蝴蝶', icon: '<span class="gift-icon" style="color:#FF69B4">🦋</span>', price: 150, desc: '翩翩起舞' },
      { id: 'gift_038', name: '小蜜蜂', icon: '<span class="gift-icon" style="color:#FFD700">🐝</span>', price: 100, desc: '勤劳的小蜜蜂' },
      { id: 'gift_039', name: '小亮星', icon: '<span class="gift-icon" style="color:#FFD700">🌟</span>', price: 160, desc: '闪亮的小星' },
      { id: 'gift_040', name: '小音符', icon: '<span class="gift-icon" style="color:#9370DB">🎵</span>', price: 90, desc: '叮咚音符' },
      { id: 'gift_041', name: '小吉他', icon: '<span class="gift-icon" style="color:#CD5C5C">🎸</span>', price: 200, desc: '弹起小吉他' },
      { id: 'gift_042', name: '小鼓', icon: '<span class="gift-icon" style="color:#B22222">🥁</span>', price: 180, desc: '咚咚锵' },
      { id: 'gift_043', name: '小画笔', icon: '<span class="gift-icon" style="color:#4169E1">🖌️</span>', price: 120, desc: '画出小世界' },
      { id: 'gift_044', name: '小书本', icon: '<span class="gift-icon" style="color:#8B4513">📚</span>', price: 140, desc: '爱看书的宝宝' },
      { id: 'gift_045', name: '小铅笔', icon: '<span class="gift-icon" style="color:#FFA500">✏️</span>', price: 60, desc: '写写画画' },
      { id: 'gift_046', name: '小宝石', icon: '<span class="gift-icon" style="color:#00CED1">💎</span>', price: 300, desc: '闪亮的宝石' },
      { id: 'gift_047', name: '小钥匙', icon: '<span class="gift-icon" style="color:#FFD700">🔑</span>', price: 110, desc: '打开宝藏箱' },
      { id: 'gift_048', name: '小魔法棒', icon: '<span class="gift-icon" style="color:#9400D3">🪄</span>', price: 280, desc: '变出小惊喜' },
      { id: 'gift_049', name: '小城堡', icon: '<span class="gift-icon" style="color:#C0C0C0">🏰</span>', price: 350, desc: '公主的城堡' },
      { id: 'gift_050', name: '小烟花', icon: '<span class="gift-icon" style="color:#FF4500">🎆</span>', price: 320, desc: '庆祝时刻' }
    ];
  }

  function renderShop() {
    var container = document.getElementById('shop-items');
    console.log('[renderShop] container:', container ? 'found' : 'NOT FOUND');
    if (!container) return;
    renderShopWithData(getGiftsInline(), container);
  }

  function renderShopWithData(gifts, container) {
    if (!container) container = document.getElementById('shop-items');
    if (!container) return;
    var owned = GameStorage.getOwnedGifts();
    var totalBonus = owned.length * 0.1;
    container.innerHTML = '';
    // 显示倍数加成信息
    if (owned.length > 0) {
      var bonusDiv = document.createElement('div');
      bonusDiv.className = 'shop-bonus-info';
      bonusDiv.style.cssText = 'background:#e8f5e9;padding:10px 15px;border-radius:8px;margin-bottom:15px;text-align:center;font-size:14px;color:#2e7d32;';
      bonusDiv.innerHTML = '🎁 已拥有 ' + owned.length + ' 个小礼物<br>得分倍数：×' + (1 + Math.min(totalBonus, 1.0)).toFixed(1);
      container.appendChild(bonusDiv);
    }
    gifts.forEach(function(gift) {
      var isOwned = GameStorage.hasGift(gift.id);
      console.log('[renderShopWithData] processing gift:', gift.id, gift.name, 'isOwned:', isOwned);
      var div = document.createElement('div');
      div.className = 'shop-item' + (isOwned ? ' owned' : '');

      var iconDiv = document.createElement('div');
      iconDiv.className = 'shop-item-icon';
      iconDiv.innerHTML = gift.icon;
      div.appendChild(iconDiv);

      var infoDiv = document.createElement('div');
      infoDiv.className = 'shop-item-info';
      infoDiv.innerHTML = '<h4>' + gift.name + '</h4><p>' + gift.desc + '</p>';
      div.appendChild(infoDiv);

      var priceDiv = document.createElement('div');
      priceDiv.className = 'shop-item-price';
      if (isOwned) {
        priceDiv.innerHTML = '<span class="owned-badge">已拥有</span>';
      } else {
        priceDiv.innerHTML = gift.price + ' 🪙<br><span style="color:#4caf50;font-size:12px;">+0.1倍得分</span>';
      }
      div.appendChild(priceDiv);

      if (!isOwned) {
        div.style.cursor = 'pointer';
        var clickHandler = function(e) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[shop click] clicked gift:', gift.id, gift.name);
          App.buyGift(gift.id);
        };
        // Add click to the main div
        div.addEventListener('click', clickHandler);
        // Also add click to child elements to ensure bubbling works
        iconDiv.addEventListener('click', clickHandler);
        infoDiv.addEventListener('click', clickHandler);
        priceDiv.addEventListener('click', clickHandler);
        console.log('[shop] attached click listeners to gift:', gift.id, gift.name);
      } else {
        console.log('[shop] gift already owned, skipping click:', gift.id);
      }

      container.appendChild(div);
    });
    console.log('[shop] renderShopWithData done, rendered', gifts.length, 'gifts');
  }

  function updateGiftsDisplay() {
    var container = document.getElementById('gifts-display');
    if (!container) return;
    var owned = GameStorage.getOwnedGifts();
    if (!owned.length) {
      container.innerHTML = '';
      return;
    }
    renderGiftsWithData(getGiftsInline(), container, owned);
  }

  function renderGiftsWithData(gifts, container, owned) {
    container.innerHTML = '<h3 style="margin:12px 0 8px;font-size:14px;color:#777;">我的礼物 🎁</h3>';
    var wrap = document.createElement('div');
    wrap.className = 'gifts-wrap';
    owned.forEach(function(id) {
      var gift = gifts.find(function(g) { return g.id === id; });
      if (!gift) return;
      var span = document.createElement('span');
      span.className = 'gift-icon';
      span.innerHTML = gift.icon;
      span.title = gift.name;
      wrap.appendChild(span);
    });
    container.appendChild(wrap);
  }

  function updateFreeTimeDisplay() {
    var el = document.getElementById('free-time-display');
    if (!el) return;
    var balance = GameStorage.getFreeTimeBalance();
    if (balance > 0) {
      el.textContent = '⏰ ' + balance + '分钟';
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  }

  function initShop() {
    updateGiftsDisplay();
    updateShopFreeTime();
  }


  // ===== 更新分数UI =====
  function updateScoreUI() {
    var el = document.getElementById('quiz-score');
    if (el) el.textContent = score;
  }

  // ===== 更新连击UI =====
  function updateStreakUI() {
    var el = document.getElementById('quiz-streak');
    if (el) el.textContent = streak;
  }

  // ===== 倒计时 =====
  function startCountdown() {
    clearCountdown();
    countdownValue = 30;
    updateCountdownUI();
    countdownTimer = setInterval(function() {
      countdownValue--;
      updateCountdownUI();
      var el = document.getElementById('quiz-countdown');
      if (el && countdownValue <= 10) el.parentElement.classList.add('warning');
      if (countdownValue <= 0) {
        clearCountdown();
        hearts--;
        streak = 0;
        updateHearts();
        updateStreakUI();
        if (hearts <= 0) {
          setTimeout(function() { failLevel(); }, 500);
        } else {
          setTimeout(nextQuestion, 500);
        }
      }
    }, 1000);
  }

  function clearCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    var el = document.getElementById('quiz-countdown');
    if (el) el.parentElement.classList.remove('warning');
  }

  function updateCountdownUI() {
    var el = document.getElementById('quiz-countdown');
    if (el) el.textContent = countdownValue;
  }

  // ===== 连击音效 =====
  function playStreakSound() {
    if (!isSoundEnabled || streak < 2) return;
    try {
      var ctx = getAudioCtx();
      if (!ctx) return;
      var freq = streak >= 5 ? 1046.50 : streak >= 3 ? 783.99 : 659.25;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch(e) {
      console.warn('Streak sound error:', e);
    }
  }

  // ===== 调试日志 =====
  function showDebugLog() {
    var logs = GameStorage.getLogs();
    var content = document.getElementById('debuglog-content');
    if (content) {
      if (logs.length === 0) {
        content.innerHTML = '<div style="color:#666;text-align:center;padding:40px;">暂无日志</div>';
      } else {
        content.innerHTML = logs.map(function(l) {
          var color = l.type === 'error' ? 'red' : l.type === 'warn' ? 'orange' : '#333';
          var dataStr = l.data ? '<div style="color:#888;font-size:11px;">' + JSON.stringify(l.data) + '</div>' : '';
          return '<div style="color:' + color + ';border-bottom:1px solid #eee;padding:8px 0;">[' + l.time + '] [' + l.type + '] ' + escapeHtml(l.msg) + dataStr + '</div>';
        }).join('');
      }
    }
    showScreen('debuglog-screen');
  }

  function hideDebugLog() {
    showScreen('home-screen');
  }

  function clearDebugLog() {
    GameStorage.clearLogs();
    var content = document.getElementById('debuglog-content');
    if (content) content.innerHTML = '<div style="color:#666;text-align:center;padding:40px;">日志已清空</div>';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ===== public API =====
  return {
    init: init,
    showScreen: showScreen,
    goBack: goBack,
    goToLevels: goToLevels,
    startLevel: startLevel,
    retryLevel: retryLevel,
    nextLevel: nextLevel,
    confirmQuit: confirmQuit,
    useHint: useHint,
    showWrongBook: showWrongBook,
    removeWrong: removeWrong,
    closeReward: closeReward,
    toggleSound: toggleSound,
    speakQuestion: speakQuestion,
    showShop: showShop,
    hideShop: hideShop,
    goHome: goHome,
    updateGiftsDisplay: updateGiftsDisplay,
    initShop: initShop,
    buyGift: buyGift,
    buyFreeTime: buyFreeTime,
    showUseFreeTimeModal: showUseFreeTimeModal,
    closeUseFreeTimeModal: closeUseFreeTimeModal,
    confirmUseFreeTime: confirmUseFreeTime,
    useFreeTimeQuick: useFreeTimeQuick,
    updateShopFreeTime: updateShopFreeTime,
    showDebugLog: showDebugLog,
    hideDebugLog: hideDebugLog,
    clearDebugLog: clearDebugLog,
    goToMathGame: goToMathGame,
    playCorrectSound: playCorrectSound,
    playWrongSound: playWrongSound,
    getScoreMultiplier: getScoreMultiplier
  };
})();

document.addEventListener('DOMContentLoaded', function() {
  console.log('[DOMContentLoaded] Event fired, calling App.init()...');
  try {
    App.init();
  } catch(e) {
    console.error('[DOMContentLoaded] Uncaught exception in App.init():', e);
    GameStorage.addLog('error', '[DOMContentLoaded] FATAL: ' + e.message + ' ' + (e.stack ? e.stack.substring(0, 300) : ''));
  }
});
