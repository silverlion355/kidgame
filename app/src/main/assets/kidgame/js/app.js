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
  var isSoundEnabled = true;

  var TOTAL_QUESTIONS = 5;
  var MAX_HEARTS = 3;

  // ===== Audio Manager =====
  var audioCtx = null;
  
  function getAudioCtx() {
    if (!isSoundEnabled) return null;
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }
  
  function playCorrectSound() {
    try {
      var ctx = getAudioCtx();
      if (!ctx) return;
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
      if (!ctx) return;
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
      if (!ctx) return;
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
    DataManager.loadAll().then(function() {
      updateHomeUI();
      checkReward();
      startBgMusic();
    }).catch(function(e) {
      console.error('初始化失败:', e);
      updateHomeUI();
    });
  }

  function updateHomeUI() {
    var p = GameStorage.getProgress();
    document.getElementById('home-coins').textContent = p.coins;
    document.getElementById('home-hints').textContent = p.hints;

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
      btn.className = 'level-btn fade-in';
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
  }

  function getSubjectName(sub) {
    return { idiom: '成语乐园', poem: '古诗天地', english: '英语世界' }[sub] || '';
  }

  // ===== show question =====
  function formatQuestionText(text, subject) {
    // Only add pinyin for Chinese subjects
    if (subject === 'idiom' || subject === 'poem') {
      // Remove content in brackets first (like [q3])
      var cleanText = text.replace(/\[.*?\]/g, '').trim();
      return PinyinDict.toPinyinHtml(cleanText);
    }
    return text;
  }

  function showQuestion() {
    var q = currentQuestions[currentQIndex];
    if (!q) { finishLevel(); return; }
    var card = document.getElementById('question-card');
    card.classList.remove('fade-in');
    void card.offsetWidth;
    card.classList.add('fade-in');
    document.getElementById('question-text').innerHTML = formatQuestionText(q.q, currentSubject);

    var speakerBtn = document.getElementById('speaker-btn');
    if (speakerBtn) {
      speakerBtn.style.display = (currentSubject === 'english' || currentSubject === 'poem' || currentSubject === 'idiom') ? 'block' : 'none';
    }

    var progress = (currentQIndex / TOTAL_QUESTIONS) * 100;
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
      var itemId = question.idiomId || question.poemId || question.englishId;
      if (itemId) GameStorage.removeWrong(currentSubject, itemId);
      playCorrectSound();
      setTimeout(nextQuestion, 600);
    } else {
      btn.classList.add('wrong');
      btn.classList.add('shake');
      hearts--;
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
    showResult(0, 0, false);
  }

  function showResult(stars, coins, success) {
    var modal = document.getElementById('result-modal');
    var title = document.getElementById('result-title');
    var starsEl = document.getElementById('result-stars');
    var msg = document.getElementById('result-msg');
    if (success) {
      title.textContent = '🎉 恭喜过关！';
      starsEl.textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
      msg.textContent = '获得 ' + coins + ' 金币！继续加油！';
      createConfetti();
    } else {
      title.textContent = '😢 闯关失败';
      starsEl.textContent = '💪';
      msg.textContent = '别灰心，再试一次吧！';
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
    if (currentQIndex > 0) {
      if (!confirm('确定要退出吗？当前进度会丢失。')) return;
    }
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

  // ===== speak question =====
  var currentUtter = null;

  function speakQuestion() {
    if (!('speechSynthesis' in window)) return;
    var q = currentQuestions[currentQIndex];
    if (!q) return;

    // 取消当前播放
    try { window.speechSynthesis.cancel(); } catch(e) {}

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
      var engItem = DataManager.getDataBySubject('english').find(function(d) { return d.id === q.englishId; });
      if (engItem) {
        text = engItem.word;
      }
      lang = 'en-US';
    }
    if (!text) text = q.q;

    // 获取语音列表，如果为空则等待加载后播放
    var voices = [];
    try { voices = window.speechSynthesis.getVoices(); } catch(e) {}

    if (voices.length === 0 && 'onvoiceschanged' in window.speechSynthesis) {
      // 语音尚未加载，等待后重试
      var retryCount = 0;
      var maxRetries = 10;
      var checkVoices = function() {
        try { voices = window.speechSynthesis.getVoices(); } catch(e) {}
        if (voices.length > 0 || retryCount >= maxRetries) {
          doSpeak(text, lang, voices);
        } else {
          retryCount++;
          setTimeout(checkVoices, 100);
        }
      };
      window.speechSynthesis.onvoiceschanged = function() {
        try { voices = window.speechSynthesis.getVoices(); } catch(e) {}
        if (voices.length > 0) {
          doSpeak(text, lang, voices);
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
      // 触发一次获取
      try { window.speechSynthesis.getVoices(); } catch(e) {}
      setTimeout(checkVoices, 100);
    } else {
      doSpeak(text, lang, voices);
    }
  }

  function doSpeak(text, lang, voices) {
    try {
      var utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;
      utter.rate = 0.9;
      utter.volume = 1.0;

      // 选择合适的语音
      if (voices && voices.length > 0) {
        var targetVoice = voices.find(function(v) { return v.lang === lang; });
        if (!targetVoice) {
          targetVoice = voices.find(function(v) { return v.lang.startsWith(lang.split('-')[0]); });
        }
        if (targetVoice) utter.voice = targetVoice;
      }

      utter.onend = function() { currentUtter = null; };
      utter.onerror = function(e) {
        currentUtter = null;
        if (e.error && e.error !== 'interrupted' && e.error !== 'canceled') {
          // 尝试用默认语音重新播放
          try {
            window.speechSynthesis.cancel();
            var utter2 = new SpeechSynthesisUtterance(text);
            utter2.lang = lang;
            utter2.rate = 0.9;
            utter2.volume = 1.0;
            window.speechSynthesis.speak(utter2);
          } catch(ex) {}
        }
      };

      currentUtter = utter;
      window.speechSynthesis.speak(utter);
    } catch(e) {
      currentUtter = null;
    }
  }

  // ===== sound toggle =====
  function toggleSound() {
    isSoundEnabled = !isSoundEnabled;
    var btn = document.getElementById('sound-toggle');
    if (btn) btn.textContent = isSoundEnabled ? '🔊' : '🔇';
    if (!isSoundEnabled) stopBgMusic();
    else startBgMusic();
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
    speakQuestion: speakQuestion
  };
})();

document.addEventListener('DOMContentLoaded', function() { App.init(); });
