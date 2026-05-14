/**
 * math-game.js - 数学小游戏模块
 */

const MathGame = (function() {
  var currentGame = null;
  var currentLevel = 1;
  var currentQuestion = null;
  var score = 0;
  var questionCount = 0;
  var correctCount = 0;
  var levelCorrectCount = 0;
  var TOTAL_QUESTIONS = 10;
  var QUESTIONS_PER_LEVEL = 5;
  var MAX_LEVEL = 20;
  var timer = null;

  // ===== 工具函数 =====
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = a[i];
      a[i] = a[j];
      a[j] = temp;
    }
    return a;
  }

  // ===== 读取进度 =====
  function getGameProgress(gameType) {
    var p = GameStorage.getProgress();
    return p[gameType] || { unlockedLevel: 1, stars: {}, highestLevel: 1 };
  }

  // ===== 保存关卡星级 =====
  function saveLevelStars(gameType, level, stars) {
    var p = GameStorage.getProgress();
    var prev = p[gameType].stars[level] || 0;
    if (stars > prev) {
      p[gameType].stars[level] = stars;
    }
    if (level >= p[gameType].highestLevel) {
      p[gameType].highestLevel = level + 1;
      p[gameType].unlockedLevel = Math.max(p[gameType].unlockedLevel, level + 1);
    }
    GameStorage.saveProgress(p);
  }

  // ===== 速算挑战 =====
  function generateSpeedMath() {
    var ops = ['+', '-'];
    var op = ops[randInt(0, 1)];
    var a, b, answer;

    if (op === '+') {
      a = randInt(10, 99);
      b = randInt(10, 99);
      answer = a + b;
    } else {
      a = randInt(20, 99);
      b = randInt(10, a - 10);
      answer = a - b;
    }

    var q = a + ' ' + op + ' ' + b + ' = ?';
    var options = shuffle([answer, answer + randInt(5, 15), answer - randInt(5, 15), answer + randInt(-15, -5)]).filter(function(x, i, arr) {
      return arr.indexOf(x) === i && x >= 0;
    }).slice(0, 4);

    if (options.length < 4) {
      var extra = [];
      for (var i = 0; i < 10 && options.length < 4; i++) {
        var x = answer + randInt(-20, 20);
        if (x >= 0 && options.indexOf(x) === -1) options.push(x);
      }
    }

    return { type: 'speed', q: q, options: options, answer: answer };
  }

  // ===== 找规律 =====
  function generatePattern() {
    var patternTypes = [
      // 等差数列
      function() {
        var start = randInt(1, 20);
        var diff = randInt(2, 9);
        var seq = [];
        for (var i = 0; i < 4; i++) seq.push(start + i * diff);
        var missingIdx = randInt(1, 3);
        var answer = seq[missingIdx];
        seq[missingIdx] = '（ ）';
        var q = seq.join(', ');
        var options = shuffle([answer, answer + diff, answer - diff, answer + randInt(1, 10)]).slice(0, 4);
        return { type: 'pattern', q: q, options: options, answer: answer };
      },
      // 倍数数列
      function() {
        var start = randInt(1, 5);
        var mul = randInt(2, 3);
        var seq = [];
        for (var i = 0; i < 4; i++) seq.push(start * Math.pow(mul, i));
        var missingIdx = randInt(1, 3);
        var answer = seq[missingIdx];
        seq[missingIdx] = '（ ）';
        var q = seq.join(', ');
        options = shuffle([answer, answer * mul, seq[missingIdx - 1] * mul, answer + randInt(1, 10)]).slice(0, 4);
        return { type: 'pattern', q: q, options: options, answer: answer };
      },
      // 平方数列
      function() {
        var start = randInt(1, 5);
        var seq = [];
        for (var i = 0; i < 4; i++) seq.push(Math.pow(start + i, 2));
        var missingIdx = randInt(1, 3);
        var answer = seq[missingIdx];
        seq[missingIdx] = '（ ）';
        var q = seq.join(', ');
        var options = shuffle([answer, Math.pow(start + missingIdx + 1, 2), Math.pow(start + missingIdx - 1, 2), answer + randInt(2, 8)]).slice(0, 4);
        return { type: 'pattern', q: q, options: options, answer: answer };
      }
    ];

    return patternTypes[randInt(0, patternTypes.length - 1)]();
  }

  // ===== 凑24点 =====
  function generate24Points() {
    var numbers = [];
    for (var i = 0; i < 4; i++) numbers.push(randInt(1, 9));

    var answerStr = tryFind24(numbers);
    if (!answerStr) {
      answerStr = numbers.join(', ');
    }

    var q = '用以下数字算出24: ' + numbers.join(', ');
    var fakeAnswers = [
      '(' + numbers[0] + '+' + numbers[1] + ')+(' + numbers[2] + '+' + numbers[3] + ')',
      numbers[0] + '×' + numbers[1] + '×' + numbers[2] + '÷' + numbers[3],
      '(' + numbers[0] + '+' + numbers[1] + ')×' + numbers[2] + '-' + numbers[3]
    ];

    return {
      type: '24points',
      q: q,
      options: shuffle([answerStr].concat(fakeAnswers.slice(0, 3))),
      answer: answerStr,
      numbers: numbers
    };
  }

  function tryFind24(nums) {
    var permutations = getPermutations(nums);
    var operators = ['+', '-', '*', '/'];

    for (var p = 0; p < permutations.length; p++) {
      var perm = permutations[p];
      for (var o1 = 0; o1 < operators.length; o1++) {
        for (var o2 = 0; o2 < operators.length; o2++) {
          for (var o3 = 0; o3 < operators.length; o3++) {
            var exprs = [
              '((a' + operators[o1] + 'b)' + operators[o2] + 'c)' + operators[o3] + 'd',
              '(a' + operators[o1] + '(b' + operators[o2] + 'c))' + operators[o3] + 'd',
              '(a' + operators[o1] + 'b)' + operators[o2] + '(c' + operators[o3] + 'd)',
              'a' + operators[o1] + '((b' + operators[o2] + 'c)' + operators[o3] + 'd)',
              'a' + operators[o1] + '(b' + operators[o2] + '(c' + operators[o3] + 'd))'
            ];

            for (var e = 0; e < exprs.length; e++) {
              try {
                var result = evaluateExpr(exprs[e], perm[0], perm[1], perm[2], perm[3]);
                if (Math.abs(result - 24) < 0.0001) {
                  return exprs[e].replace(/a/g, perm[0]).replace(/b/g, perm[1]).replace(/c/g, perm[2]).replace(/d/g, perm[3]);
                }
              } catch (err) {}
            }
          }
        }
      }
    }
    return null;
  }

  function evaluateExpr(expr, a, b, c, d) {
    var evalFn = new Function('a', 'b', 'c', 'd', 'return ' + expr);
    return evalFn(a, b, c, d);
  }

  function getPermutations(arr) {
    if (arr.length <= 1) return [arr];
    var result = [];
    for (var i = 0; i < arr.length; i++) {
      var rest = arr.slice(0, i).concat(arr.slice(i + 1));
      var permRest = getPermutations(rest);
      for (var j = 0; j < permRest.length; j++) {
        result.push([arr[i]].concat(permRest[j]));
      }
    }
    return result;
  }

  // ===== 生成题目 =====
  function generateQuestion() {
    if (currentGame === 'speed') return generateSpeedMath();
    if (currentGame === 'pattern') return generatePattern();
    if (currentGame === '24points') return generate24Points();
    return generateSpeedMath();
  }

  // ===== 渲染关卡选择界面 =====
  function renderLevelSelect() {
    var gameInfo = {
      'speed': { name: '速算挑战', icon: '＋－', color: '#E3F2FD' },
      'pattern': { name: '找规律', icon: '◎', color: '#FFF3E0' },
      '24points': { name: '凑24点', icon: '✦', color: '#E8F5E9' }
    };
    var info = gameInfo[currentGame] || { name: '', icon: '', color: '' };
    var progress = getGameProgress(currentGame);

    // 只返回内部内容，不包含外层math-screen div
    return '<div class="top-bar">' +
      '<button class="btn-back" onclick="MathGame.showMenu()">‹</button>' +
      '<h3>' + info.name + '</h3>' +
      '<div></div>' +
    '</div>' +
    '<div class="subject-progress" style="padding:8px 0 16px;text-align:center;">' +
      '<span style="color:#666;">最高关卡: ' + progress.highestLevel + ' | 已通关: ' + Object.keys(progress.stars).length + ' 关</span>' +
    '</div>' +
    '<div class="level-grid" id="math-level-grid"></div>' +
    '<div id="math-game-area" style="display:none"></div>';
  }

  // ===== 渲染关卡按钮 =====
  function renderLevelButtons() {
    var progress = getGameProgress(currentGame);
    var unlocked = progress.unlockedLevel || 1;
    var stars = progress.stars || {};
    var grid = document.getElementById('math-level-grid');
    if (!grid) return;

    var html = '';
    for (var i = 1; i <= MAX_LEVEL; i++) {
      var levelStars = stars[i] || 0;
      var starStr = '';
      for (var s = 0; s < 3; s++) {
        starStr += s < levelStars ? '★' : '☆';
      }
      var isLocked = i > unlocked;
      var isCompleted = levelStars > 0;
      var btnClass = isLocked ? 'level-btn locked' : (isCompleted ? 'level-btn completed' : 'level-btn');
      var content = isLocked ? '<span class="lock-icon">🔒</span>' : '<span>' + i + '</span><span class="level-stars">' + starStr + '</span>';
      html += '<button class="' + btnClass + '" onclick="' + (isLocked ? '' : 'MathGame.startLevel(' + i + ')') + '">' + content + '</button>';
    }
    grid.innerHTML = html;
  }

  // ===== 渲染游戏界面 =====
  function renderGameArea() {
    var gameTitle = {
      'speed': '速算挑战',
      'pattern': '找规律',
      '24points': '凑24点'
    };

    var progress = (questionCount - 1) % QUESTIONS_PER_LEVEL + 1;
    var html = '<div class="math-game-header">' +
      '<button class="btn-back" onclick="MathGame.confirmExit()" style="background:none;border:none;font-size:32px;cursor:pointer;padding:0;">‹</button>' +
      '<div class="level-info">关卡' + currentLevel + ' - ' + progress + '/' + QUESTIONS_PER_LEVEL + '</div>' +
      '<div class="math-score">' + score + '</div>' +
    '</div>' +
    '<div class="progress-bar" style="margin:10px 16px;">' +
      '<div class="fill" style="width:' + ((progress - 1) / QUESTIONS_PER_LEVEL * 100) + '%"></div>' +
    '</div>';

    // 凑24点特殊布局
    if (currentGame === '24points' && currentQuestion && currentQuestion.numbers) {
      html += '<div class="question-card fade-in">' +
        '<div class="question-text" style="font-size:24px;">用以下数字算出24:</div>' +
        '<div style="display:flex;justify-content:center;gap:16px;margin-top:16px;font-size:48px;font-weight:bold;">' +
        currentQuestion.numbers.map(function(n) { return '<span>' + n + '</span>'; }).join('') +
        '</div>' +
      '</div>';
    } else {
      html += '<div class="question-card fade-in">' +
        '<div class="question-text" style="font-size:32px;">' + (currentQuestion ? currentQuestion.q : '') + '</div>' +
      '</div>';
    }

    html += '<div class="options" id="math-options">';
    if (currentQuestion && currentQuestion.options) {
      currentQuestion.options.forEach(function(opt, idx) {
        html += '<button class="option-btn fade-in" onclick="MathGame.checkAnswer(\'' + opt + '\')" style="animation-delay:' + (idx * 0.1) + 's">' + opt + '</button>';
      });
    }
    html += '</div>';

    return html;
  }

  // ===== 渲染关卡完成 =====
  function renderLevelComplete() {
    var stars = levelCorrectCount >= QUESTIONS_PER_LEVEL * 0.8 ? 3 : (levelCorrectCount >= QUESTIONS_PER_LEVEL * 0.5 ? 2 : 1);
    var starsStr = '';
    for (var i = 0; i < 3; i++) starsStr += i < stars ? '★' : '☆';
    var msg = stars >= 3 ? '太厉害了！' : (stars >= 2 ? '不错，继续加油！' : '再试一次吧！');

    // 保存星级
    saveLevelStars(currentGame, currentLevel, stars);

    return '<div class="question-card fade-in" style="text-align:center;">' +
      '<h2>过关啦！</h2>' +
      '<div style="font-size:48px;margin:20px 0;">' + starsStr + '</div>' +
      '<p style="font-size:20px;">第 ' + currentLevel + ' 关 完成！</p>' +
      '<p style="color:#666;">' + msg + '</p>' +
      '<div style="margin-top:20px;">' +
        '<button class="modal-btn" onclick="MathGame.nextLevel()">下一关</button>' +
        '<button class="modal-btn secondary" onclick="MathGame.backToLevels()" style="margin-top:8px;">返回关卡</button>' +
      '</div>' +
    '</div>';
  }

  // ===== 渲染游戏结束 =====
  function renderResult() {
    var totalStars = 0;
    var progress = getGameProgress(currentGame);
    for (var i = 1; i <= MAX_LEVEL; i++) {
      if (progress.stars[i]) totalStars += progress.stars[i];
    }
    var msg = correctCount >= TOTAL_QUESTIONS * 0.8 ? '太厉害了！' : (correctCount >= TOTAL_QUESTIONS * 0.5 ? '不错，继续加油！' : '再试一次吧！');

    return '<div class="question-card fade-in" style="text-align:center;">' +
      '<h2>本轮结束！</h2>' +
      '<p style="font-size:20px;">总得分: ' + score + '</p>' +
      '<p>答对: ' + correctCount + ' / ' + TOTAL_QUESTIONS + '</p>' +
      '<p style="color:#666;">' + msg + '</p>' +
      '<div style="margin-top:20px;">' +
        '<button class="modal-btn" onclick="MathGame.retryGame()">再来一局</button>' +
        '<button class="modal-btn secondary" onclick="MathGame.backToLevels()" style="margin-top:8px;">返回关卡</button>' +
      '</div>' +
    '</div>';
  }

  // ===== 渲染退出确认 =====
  function renderExitConfirm() {
    return '<div class="question-card fade-in" style="text-align:center;">' +
      '<h2>确定退出？</h2>' +
      '<p style="color:#666;">当前进度将不会保存</p>' +
      '<div style="margin-top:20px;">' +
        '<button class="modal-btn" onclick="MathGame.backToLevels()">确定退出</button>' +
        '<button class="modal-btn secondary" onclick="MathGame.resumeGame()" style="margin-top:8px;">继续答题</button>' +
      '</div>' +
    '</div>';
  }

  // ===== 公开接口 =====
  return {
    showMenu: function() {
      try {
        GameStorage.addLog('info', 'MathGame.showMenu called');
        currentGame = null;
        var container = document.querySelector('.container');
        if (!container) {
          GameStorage.addLog('error', 'container not found');
          return;
        }
        var existing = document.getElementById('math-screen');
        GameStorage.addLog('info', 'math-screen existing: ' + !!existing);
        if (existing) {
          existing.className = 'screen active';
          existing.innerHTML = renderMathMenu();
          GameStorage.addLog('info', 'math-screen innerHTML replaced');
        } else {
          var wrapper = document.createElement('div');
          wrapper.innerHTML = renderMathMenu();
          container.appendChild(wrapper.firstElementChild);
          GameStorage.addLog('info', 'math-screen created and appended');
        }
        // 确保其他屏幕隐藏
        document.querySelectorAll('.screen').forEach(function(s) {
          if (s.id !== 'math-screen') s.classList.remove('active');
        });
        GameStorage.addLog('info', 'MathGame.showMenu done');
      } catch(e) {
        GameStorage.addLog('error', 'MathGame.showMenu error: ' + e.message);
        console.error('[MathGame.showMenu] error:', e);
      }
    },

    showLevelSelect: function(gameType) {
      currentGame = gameType;
      currentLevel = 1;
      questionCount = 0;
      correctCount = 0;
      score = 0;
      levelCorrectCount = 0;

      var existing = document.getElementById('math-screen');
      if (!existing) {
        var mathDiv = document.createElement('div');
        mathDiv.id = 'math-screen';
        mathDiv.className = 'screen active';
        document.querySelector('.container').appendChild(mathDiv);
      }

      // 重置到关卡选择界面
      var screen = document.getElementById('math-screen');
      screen.className = 'screen active';
      screen.innerHTML = renderLevelSelect();

      setTimeout(function() { renderLevelButtons(); }, 50);
    },

    startLevel: function(level) {
      currentLevel = level;
      questionCount = 0;
      correctCount = 0;
      score = 0;
      levelCorrectCount = 0;

      currentQuestion = generateQuestion();
      document.getElementById('math-game-area').style.display = 'block';
      document.getElementById('math-game-area').innerHTML = renderGameArea();
      document.getElementById('math-level-grid').style.display = 'none';
    },

    nextLevel: function() {
      currentLevel++;
      questionCount = 0;
      correctCount = 0;
      levelCorrectCount = 0;

      currentQuestion = generateQuestion();
      document.getElementById('math-game-area').innerHTML = renderGameArea();
    },

    resumeGame: function() {
      document.getElementById('math-game-area').innerHTML = renderGameArea();
    },

    retryGame: function() {
      questionCount = 0;
      correctCount = 0;
      score = 0;
      levelCorrectCount = 0;
      currentQuestion = generateQuestion();
      document.getElementById('math-game-area').innerHTML = renderGameArea();
    },

    backToLevels: function() {
      document.getElementById('math-game-area').style.display = 'none';
      document.getElementById('math-level-grid').style.display = '';
      renderLevelButtons();
    },

    confirmExit: function() {
      document.getElementById('math-game-area').innerHTML = renderExitConfirm();
    },

    checkAnswer: function(selected) {
      var correct = false;
      var answer = currentQuestion ? currentQuestion.answer : '';

      if (String(selected) === String(answer)) {
        correct = true;
      } else if (currentGame === '24points') {
        correct = String(selected).indexOf('24') !== -1 || selected === answer;
      }

      if (correct) {
        correctCount++;
        levelCorrectCount++;
        score += currentGame === '24points' ? 20 : 10;
        App.playCorrectSound();
      } else {
        App.playWrongSound();
      }

      questionCount++;

      // 检查关卡完成（每5题）
      var progress = (questionCount - 1) % QUESTIONS_PER_LEVEL + 1;
      if (questionCount > 0 && questionCount % QUESTIONS_PER_LEVEL === 0) {
        // 关卡完成
        if (questionCount >= TOTAL_QUESTIONS) {
          document.getElementById('math-game-area').innerHTML = renderResult();
        } else {
          document.getElementById('math-game-area').innerHTML = renderLevelComplete();
        }
      } else if (questionCount >= TOTAL_QUESTIONS) {
        document.getElementById('math-game-area').innerHTML = renderResult();
      } else {
        currentQuestion = generateQuestion();
        document.getElementById('math-game-area').innerHTML = renderGameArea();
      }
    },

    getHtml: function() {
      return renderMathMenu();
    }
  };

  // ===== 渲染主菜单 =====
  function renderMathMenu() {
    return '<div id="math-screen" class="screen">' +
      '<div class="top-bar">' +
        '<button class="btn-back" onclick="App.showScreen(\'home-screen\')">‹</button>' +
        '<h3>数学小游戏</h3>' +
        '<div></div>' +
      '</div>' +
      '<div class="math-menu" id="math-menu">' +
        '<div class="subject-card fade-in" onclick="MathGame.showLevelSelect(\'speed\')">' +
          '<div class="subject-icon" style="background:#E3F2FD;font-size:28px;">＋－</div>' +
          '<div class="subject-info"><h3>速算挑战</h3><p>两位数加减法，考验你的速度！</p></div>' +
          '<div>›</div>' +
        '</div>' +
        '<div class="subject-card fade-in" onclick="MathGame.showLevelSelect(\'pattern\')">' +
          '<div class="subject-icon" style="background:#FFF3E0;font-size:28px;">◎</div>' +
          '<div class="subject-info"><h3>找规律</h3><p>发现数字的奥秘，填出答案！</p></div>' +
          '<div>›</div>' +
        '</div>' +
        '<div class="subject-card fade-in" onclick="MathGame.showLevelSelect(\'24points\')">' +
          '<div class="subject-icon" style="background:#E8F5E9;font-size:28px;">✦</div>' +
          '<div class="subject-info"><h3>凑24点</h3><p>用四个数字计算24点！</p></div>' +
          '<div>›</div>' +
        '</div>' +
      '</div>' +
      '<div id="math-game-area" style="display:none"></div>' +
    '</div>';
  }
})();

// 页面加载后注入数学游戏HTML
document.addEventListener('DOMContentLoaded', function() {
  var container = document.querySelector('.container');
  if (container) {
    var existing = document.getElementById('math-screen');
    if (!existing) {
      var mathDiv = document.createElement('div');
      mathDiv.innerHTML = MathGame.getHtml();
      container.appendChild(mathDiv.firstElementChild);
    }
  }
});