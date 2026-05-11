/**
 * app.js - main logic and game interaction
 */

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
  var isSpeechSupported = ("speechSynthesis" in window) && ("SpeechSynthesisUtterance" in window);
var isAndroidTTSAvailable = !!(window.AndroidTTS && window.AndroidTTS.isAvailable && window.AndroidTTS.isAvailable());

  var TOTAL_QUESTIONS = 5;
  var MAX_HEARTS = 3;

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
    isBgMusicPlaying = true;
    playBgNote();
    bgMusicInterval = setInterval(playBgNote, 900);
  }
  
  function stopBgMusic() {
    isBgMusicPlaying = false;
    if (bgMusicInterval) {
      clearInterval(bgMusicInterval);
      bgMusicInterval = null;
    }
  }

  // ===== init =====
  function init() {
    DataManager.loadAll();
    updateHomeUI();
    checkReward();
    startBgMusic();
    initShop();
  }

  function updateHomeUI() {
    var p = GameStorage.getProgress();
    document.getElementById('home-coins').textContent = p.coins;
    document.getElementById('home-hints').textContent = p.hints;
    updateFreeTimeDisplay();

    ['idiom', 'poem', 'english'].forEach(function(sub) {
      var stars = calcTotalStars(p[sub].stars);
      var starStr = renderStars(stars, p[sub].highestLevel * 5);
      document.getElementById(sub + '-stars').textContent = starStr;
      document.getElementById(sub + '-level').textContent = '第' + p[sub].highestLevel + '关';
    });
  }

  function calcTotalStars(starsObj) {
    return Object.keys(starsObj).reduce(function(s, k) { return s + starsObj[k]; }, 0);
  }

  function renderStars(count, total) {
    var s = '';
    for (var i = 0; i < 5 && i < total; i++) {
      s += i < count ? '⭐' : '☆';
    }
    return s;
  }

  // ===== daily reward =====
  function checkReward() {
    var r = GameStorage.checkDailyReward();
    if (r.claimed) {
      document.getElementById('reward-text').textContent =
        '获得 ' + r.coins + ' 金币（连续登录 ' + r.streak + ' 天）';
      document.getElementById('reward-popup').classList.add('active');
    }
  }

  function closeReward() {
    document.getElementById('reward-popup').classList.remove('active');
    updateHomeUI();
  }

  // ===== screen switch =====
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    document.getElementById(id).classList.add('active');
    if (id !== 'quiz-screen' && id !== 'home-screen') {
      stopBgMusic();
    }
  }

  // ===== level selection =====
  function goToLevels(subject) {
    currentSubject = subject;
    var names = { idiom: '成语乐园', poem: '古诗天地', english: '英语世界' };
    var totalLevels = DataManager.getTotalLevels(subject);
    document.getElementById('levels-title').textContent = (names[subject] || '选择关卡') + '（共' + totalLevels + '关）';
    renderLevelGrid();
    showScreen('levels-screen');
  }

  function renderLevelGrid() {
    var p = GameStorage.getProgress();
    var unlocked = p[currentSubject].unlockedLevel || 1;
    var stars = p[currentSubject].stars || {};
    var totalLevels = DataManager.getTotalLevels(currentSubject);
    var grid = document.getElementById('levels-grid');
    grid.innerHTML = '';

    for (var i = 1; i <= totalLevels; i++) {
      var btn = document.createElement('button');
      btn.className = 'level-btn';
      var starCount = stars[i] || 0;
      var starStr = '⭐'.repeat(starCount) + '☆'.repeat(3 - starCount);
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
    currentQuestions = DataManager.generateQuestions(currentSubject, level, TOTAL_QUESTIONS);
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
    return { idiom: '成语乐园', poem: '古诗天地', english: '英语世界' }[sub] || '';
  }

  // ===== show question =====
  // 汉字拼音标注辅助函数
  function addPinyinToText(text) {
    if (!text || typeof PinyinDict === 'undefined') return text;
    // 对连续汉字添加拼音
    return text.replace(/[一-龥]+/g, function(match) {
      return PinyinDict.toPinyinHtml ? PinyinDict.toPinyinHtml(match) : match;
    });
  }

  function showQuestion() {
    var q = currentQuestions[currentQIndex];
    if (!q) { finishLevel(); return; }
    var card = document.getElementById('question-card');
    card.classList.remove('fade-in');
    void card.offsetWidth;
    card.classList.add('fade-in');
    // 处理题目文本：先构建 qText，再统一替换 {{BLANK:n}}
    var qText = q.q;

    // 诗词题目：显示两句（当前句和下一句）
    if (currentSubject === 'poem') {
      var poemItem = DataManager.getDataBySubject('poem').find(function(d) { return d.id === q.poemId; });
      if (poemItem && poemItem.content) {
        for (var i = 0; i < poemItem.content.length; i++) {
          if (poemItem.content[i].indexOf(q.answer) !== -1) {
            var lines = [poemItem.content[i]];
            // 添加下一句（如果有）
            if (i + 1 < poemItem.content.length) {
              lines.push(poemItem.content[i + 1]);
            } else if (i - 1 >= 0) {
              // 如果是最后一句，显示前一句和当前句
              lines.unshift(poemItem.content[i - 1]);
            }
            qText = lines.join('<br>');
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

    // 成语和诗词添加拼音标注（拼音只在非空白的汉字上显示）
    if (currentSubject === 'idiom' || currentSubject === 'poem') {
      qText = addPinyinToText(qText);
    }
    // 英语题目如果是中文也添加拼音
    else if (currentSubject === 'english' && q.q && /[一-龥]/.test(q.q)) {
      qText = addPinyinToText(qText);
    }

    document.getElementById('question-text').innerHTML = qText;

    // Show speaker button for English/idiom/poem questions
    var speakerBtn = document.getElementById("speaker-btn");
      if (speakerBtn) {
        // 始终显示喇叭按钮（用户反馈看不到）
        speakerBtn.style.display = 'block';
      }

    var progress = (currentQIndex / TOTAL_QUESTIONS) * 100;
    document.getElementById('quiz-progress').style.width = progress + '%';
    var optionsC = document.getElementById('options-container');
    optionsC.style.display = 'flex';
    optionsC.style.flexDirection = 'column';
    optionsC.innerHTML = '';
    var labels = ['A', 'B', 'C', 'D'];

    // 使用两列布局：每两个选项一行
    for (var i = 0; i < q.options.length; i += 2) {
      var rowDiv = document.createElement('div');
      rowDiv.className = 'options-row';

      // 第一个选项
      var opt1 = q.options[i];
      var btn1 = document.createElement('button');
      btn1.className = 'option-btn slide-in';
      btn1.style.animationDelay = (i * 0.1) + 's';
      btn1.innerHTML = '<span class="option-label">' + labels[i] + '</span><span>' + opt1 + '</span>';
      (function(b, chosen, correct, question) {
        b.onclick = function() { selectOption(b, chosen, correct, question); };
      })(btn1, opt1, q.answer, q);
      rowDiv.appendChild(btn1);

      // 第二个选项（如果存在）
      if (i + 1 < q.options.length) {
        var opt2 = q.options[i + 1];
        var btn2 = document.createElement('button');
        btn2.className = 'option-btn slide-in';
        btn2.style.animationDelay = ((i + 1) * 0.1) + 's';
        btn2.innerHTML = '<span class="option-label">' + labels[i + 1] + '</span><span>' + opt2 + '</span>';
        (function(b, chosen, correct, question) {
          b.onclick = function() { selectOption(b, chosen, correct, question); };
        })(btn2, opt2, q.answer, q);
        rowDiv.appendChild(btn2);
      }

      optionsC.appendChild(rowDiv);
    }
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
  if (isSpeechSupported) {
    window.speechSynthesis.onvoiceschanged = _loadVoices;
    _loadVoices();
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
    console.log("[speakQuestion] currentSubject:", currentSubject, "Q:", currentQuestions[currentQIndex]);
    var q = currentQuestions[currentQIndex];
    if (!q) return;

    // 获取要朗读的文本
    var text = '';
    var lang = 'zh-CN';
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
      // 英语题目：读中文释义，避免英文语音问题
      var engItem = DataManager.getDataBySubject('english').find(function(d) { return d.id === q.englishId; });
      if (engItem) text = engItem.meaning_cn || engItem.word;
      lang = 'zh-CN';
      if (!text) text = q.q || q.answer;
    }
    if (!text) text = q.q;

    // 优先使用 Android 原生 TTS，否则回退到 Web Speech API
    if (isAndroidTTSAvailable) {
      speakWithAndroidTTS(text, lang);
    } else {
      speakWithWebSpeech(text, lang);
    }

    // 启动倒计时
    startCountdown();
  }

  // Android 原生 TTS
  function speakWithAndroidTTS(text, lang) {
    if (!text) { fallbackToPrompt(''); return; }
    console.log("[speakWithAndroidTTS] text:", text, "lang:", lang);
    try {
      window.AndroidTTS.speak(text, lang || 'zh-CN');
      console.log('[speakWithAndroidTTS] speak called');
    } catch(e) {
      console.error('[speakWithAndroidTTS] error:', e);
      // 回退到 Web Speech API
      speakWithWebSpeech(text, lang);
    }
  }

  function speakWithWebSpeech(text, lang) {
    if (!text) { fallbackToPrompt(''); return; }
    console.log("[speakWithWebSpeech] text:", text, "lang:", lang);

    // 清除之前的超时
    if (_speakTimeout) { clearTimeout(_speakTimeout); _speakTimeout = null; }

    // 等待语音列表加载完成后播放
    _waitForVoices(function() {
      console.log("[speakWithWebSpeech] Available voices:", _voiceList.map(v => v.name + '(' + v.lang + ')'));

      try {
        // 先取消当前播放，清理状态
        window.speechSynthesis.cancel();
        _currentUtter = null;

        var utter = new SpeechSynthesisUtterance(text);
        utter.lang = lang || 'zh-CN';
        utter.rate = 0.8;
        utter.volume = 1.0;

        // 显式选择对应语言的语音
        if (lang && lang.startsWith('en')) {
          var enVoice = _voiceList.find(function(v) { return v.lang.startsWith('en'); });
          if (enVoice) {
            utter.voice = enVoice;
            console.log("[speakWithWebSpeech] Using English voice:", enVoice.name);
          } else {
            console.warn("[speakWithWebSpeech] No English voice found! Available:", _voiceList.map(function(v) { return v.lang; }));
          }
        }

        var hasStarted = false;
        utter.onstart = function() {
          hasStarted = true;
          console.log('[speakWithWebSpeech] started');
        };
        utter.onend = function() {
          console.log('[speakWithWebSpeech] ended');
          _currentUtter = null;
        };
        utter.onerror = function(e) {
          console.error('[speakWithWebSpeech] error:', e.error || e);
          _currentUtter = null;
          // 如果是 interrupted 或 canceled，不用 fallback
          if (e.error && e.error !== 'interrupted' && e.error !== 'canceled') {
            fallbackToPrompt(text);
          }
        };

        _currentUtter = utter;
        // 确保语音合成恢复（某些浏览器需要）
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        window.speechSynthesis.speak(utter);
        console.log('[speakWithWebSpeech] speak called');

        // 超时保护：如果 3 秒后还没开始播放，重置状态
        _speakTimeout = setTimeout(function() {
          if (_currentUtter === utter && !hasStarted) {
            console.warn('[speakWithWebSpeech] Timeout: speech did not start, resetting');
            try { window.speechSynthesis.cancel(); } catch(ex) {}
            _currentUtter = null;
            _speakTimeout = null;
          }
        }, 3000);
      } catch(e) {
        console.error('[speakWithWebSpeech] exception:', e);
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
    var allBtns = document.querySelectorAll('.option-btn');
    allBtns.forEach(function(b) {
      b.classList.add('disabled');
      var span = b.querySelector('span:last-child');
      if (span && span.textContent === correct) {
        b.classList.add('correct');
      }
    });
    if (chosen === correct) {
      btn.classList.add('correct');
      correctCount++;
      // 更新分数和连击
      score += 10 * (streak + 1); // 连击加成
      streak++;
      if (streak > maxStreak) maxStreak = streak;
      updateScoreUI();
      updateStreakUI();
      playStreakSound(); // 连击音效
      var itemId = question.idiomId || question.poemId || question.englishId;
      if (itemId) GameStorage.removeWrong(currentSubject, itemId);
      playCorrectSound();
      setTimeout(nextQuestion, 600);
    } else {
      btn.classList.add('wrong');
      btn.classList.add('shake');
      hearts--;
      // 重置连击
      streak = 0;
      updateStreakUI();
      updateHearts();
      var itemId2 = question.idiomId || question.poemId || question.englishId;
      if (itemId2) GameStorage.addWrong(currentSubject, itemId2);
      playWrongSound();
      if (hearts <= 0) {
        setTimeout(function() { failLevel(); }, 800);
      } else {
        setTimeout(nextQuestion, 800);
      }
    }
  }

  function nextQuestion() {
    // 清除倒计时
    clearCountdown();
    currentQIndex++;
    if (currentQIndex >= TOTAL_QUESTIONS || currentQIndex >= currentQuestions.length) {
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
    var pct = correctCount / TOTAL_QUESTIONS;
    var stars = 1;
    if (pct >= 1 && elapsed < 60) stars = 3;
    else if (pct >= 0.8) stars = 2;
    else if (pct >= 0.6) stars = 1;
    else { failLevel(); return; }
    var coins = stars * 10;
    GameStorage.addCoins(coins);
    GameStorage.saveLevelStars(currentSubject, currentLevel, stars);
    showResult(stars, coins, true);
  }

  function failLevel() {
    // 清除倒计时
    clearCountdown();
    showResult(0, 0, false);
  }

  function showResult(stars, coins, success) {
    var modal = document.getElementById('result-modal');
    var title = document.getElementById('result-title');
    var starsEl = document.getElementById('result-stars');
    var msg = document.getElementById('result-msg');
    var nextBtn = modal.querySelector('.modal-btn:not(.secondary)');
    var homeBtn = modal.querySelector('.modal-btn.secondary:last-child');
    if (success) {
      title.textContent = '🎉 恭喜过关！';
      starsEl.textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
      msg.textContent = '获得 ' + coins + ' 金币！继续加油！';
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
    // 直接返回首页
    try { clearCountdown(); } catch(e) {}
    showScreen('home-screen');
    updateHomeUI();
  }

  // ===== wrong book =====
  function showWrongBook() {
    showScreen('wrongbook-screen');
    renderWrongBook();
  }

  function renderWrongBook() {
    var wb = GameStorage.getWrongBook();
    var container = document.getElementById('wrongbook-content');
    container.innerHTML = '';
    var subjectNames = { idiom: '成语', poem: '古诗', english: '英语' };
    var hasAny = false;
    ['idiom', 'poem', 'english'].forEach(function(sub) {
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
    showScreen('shop-screen');
    setTimeout(function() {
      renderShop();
      updateShopCoins();
      updateShopFreeTime();
    }, 50);
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
    var gifts = getGiftsInline();
    var gift = gifts.find(function(g) { return g.id === itemId; });
    if (!gift) return;
    if (GameStorage.hasGift(itemId)) {
      alert('你已经拥有这个礼物了！');
      return;
    }
    if (!confirm('确认花费 ' + gift.price + ' 🪙 购买 ' + gift.icon + ' ' + gift.name + ' 吗？')) {
      return;
    }
    if (GameStorage.spendCoins(gift.price)) {
      GameStorage.buyGift(itemId);
      updateShopCoins();
      renderShop();
      updateGiftsDisplay();
      alert('购买成功！获得 ' + gift.icon + ' ' + gift.name + ' 🎉');
    } else {
      alert('金币不足！' + gift.name + '需要 ' + gift.price + ' 金币。');
    }
  }

  function getGiftsInline() {
    return [
      { id: 'gift_001', name: '小星星', icon: '⭐', price: 50, desc: '闪闪发光的小星星' },
      { id: 'gift_002', name: '小花朵', icon: '🌸', price: 80, desc: '一朵美丽的花朵' },
      { id: 'gift_003', name: '小皇冠', icon: '👑', price: 120, desc: '小小国王的皇冠' },
      { id: 'gift_004', name: '小火箭', icon: '🚀', price: 150, desc: '嗖——飞上天啦' },
      { id: 'gift_005', name: '小蛋糕', icon: '🎂', price: 100, desc: '香甜可口的小蛋糕' },
      { id: 'gift_006', name: '小气球', icon: '🎈', price: 60, desc: '五颜六色的小气球' },
      { id: 'gift_007', name: '小奖杯', icon: '🏆', price: 200, desc: '你是第一名！' },
      { id: 'gift_008', name: '小礼物盒', icon: '🎁', price: 180, desc: '里面藏着惊喜哦' },
      { id: 'gift_009', name: '小彩虹', icon: '🌈', price: 160, desc: '雨后的美丽彩虹' },
      { id: 'gift_010', name: '小月亮', icon: '🌙', price: 140, desc: '晚上陪你睡觉' }
    ];
  }

  function renderShop() {
    var container = document.getElementById('shop-items');
    if (!container) return;
    renderShopWithData(getGiftsInline(), container);
  }

  function renderShopWithData(gifts, container) {
    if (!container) container = document.getElementById('shop-items');
    if (!container) return;
    var owned = GameStorage.getOwnedGifts();
    container.innerHTML = '';
    gifts.forEach(function(gift) {
      var owned = GameStorage.hasGift(gift.id);
      var div = document.createElement('div');
      div.className = 'shop-item ' + (owned ? 'owned' : '');
      div.innerHTML =
        '<div class="shop-item-icon">' + gift.icon + '</div>' +
        '<div class="shop-item-info">' +
          '<h4>' + gift.name + '</h4>' +
          '<p>' + gift.desc + '</p>' +
        '</div>' +
        '<div class="shop-item-price">' +
          (owned ? '<span class="owned-badge">已拥有</span>' : gift.price + ' 🪙') +
        '</div>';
      if (!owned) {
        (function(g) {
          div.onclick = function() { buyGift(g.id); };
        })(gift);
      }
      container.appendChild(div);
    });
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
      span.textContent = gift.icon;
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

  // ===== public API =====
  return {
    init: init,
    showScreen: showScreen,
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
    buyFreeTime: buyFreeTime,
    showUseFreeTimeModal: showUseFreeTimeModal,
    closeUseFreeTimeModal: closeUseFreeTimeModal,
    confirmUseFreeTime: confirmUseFreeTime,
    useFreeTimeQuick: useFreeTimeQuick,
    updateShopFreeTime: updateShopFreeTime
  };
})();

document.addEventListener('DOMContentLoaded', function() { App.init(); });
