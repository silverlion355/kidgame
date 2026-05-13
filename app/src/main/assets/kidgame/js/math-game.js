/**
 * math-game.js - 数学小游戏模块
 */

const MathGame = (function() {
  var currentGame = null;
  var currentQuestion = null;
  var score = 0;
  var questionCount = 0;
  var correctCount = 0;
  var timer = null;
  var timeLeft = 0;
  var TOTAL_QUESTIONS = 10;

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
        seq[missingIdx] = '?';
        var q = seq.join(', ') + '  ( ? )';
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
        seq[missingIdx] = '?';
        var q = seq.join(', ') + '  ( ? )';
        var options = shuffle([answer, answer * mul, seq[missingIdx - 1] * mul, answer + randInt(1, 10)]).slice(0, 4);
        return { type: 'pattern', q: q, options: options, answer: answer };
      },
      // 平方数列
      function() {
        var start = randInt(1, 5);
        var seq = [];
        for (var i = 0; i < 4; i++) seq.push(Math.pow(start + i, 2));
        var missingIdx = randInt(1, 3);
        var answer = seq[missingIdx];
        seq[missingIdx] = '?';
        var q = seq.join(', ') + '  ( ? )';
        var options = shuffle([answer, Math.pow(start + missingIdx + 1, 2), Math.pow(start + missingIdx - 1, 2), answer + randInt(2, 8)]).slice(0, 4);
        return { type: 'pattern', q: q, options: options, answer: answer };
      }
    ];

    return patternTypes[randInt(0, patternTypes.length - 1)]();
  }

  // ===== 凑24点 =====
  function generate24Points() {
    // 生成4个1-9的数
    var numbers = [];
    for (var i = 0; i < 4; i++) numbers.push(randInt(1, 9));

    // 尝试找到能得到24的组合
    var answerStr = tryFind24(numbers);
    if (!answerStr) {
      // 没找到24，就用显示数字
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

  // ===== 随机选择游戏 =====
  function generateRandomGame() {
    var games = ['speed', 'pattern', '24points'];
    var game = games[randInt(0, games.length - 1)];
    currentGame = game;
    questionCount = 0;
    correctCount = 0;
    score = 0;

    if (game === 'speed') return generateSpeedMath();
    if (game === 'pattern') return generatePattern();
    if (game === '24points') return generate24Points();
  }

  // ===== 渲染界面 =====
  function renderMathScreen() {
    var gameName = {
      'speed': '速算挑战',
      'pattern': '找规律',
      '24points': '凑24点'
    };

    var html = '<div id="math-screen" class="screen">' +
      '<div class="top-bar">' +
        '<button class="btn-back" onclick="App.showScreen(\'home-screen\')">‹</button>' +
        '<h3>数学小游戏</h3>' +
        '<div></div>' +
      '</div>' +
      '<div class="math-menu" id="math-menu">' +
        '<div class="subject-card fade-in" onclick="MathGame.startGame(\'speed\')">' +
          '<div class="subject-icon" style="background:#E3F2FD">🧮</div>' +
          '<div class="subject-info"><h3>速算挑战</h3><p>两位数加减法，考验你的速度！</p></div>' +
          '<div>›</div>' +
        '</div>' +
        '<div class="subject-card fade-in" onclick="MathGame.startGame(\'pattern\')">' +
          '<div class="subject-icon" style="background:#FFF3E0">🔍</div>' +
          '<div class="subject-info"><h3>找规律</h3><p>发现数字的奥秘，填出答案！</p></div>' +
          '<div>›</div>' +
        '</div>' +
        '<div class="subject-card fade-in" onclick="MathGame.startGame(\'24points\')">' +
          '<div class="subject-icon" style="background:#E8F5E9">🎯</div>' +
          '<div class="subject-info"><h3>凑24点</h3><p>用四个数字计算24点！</p></div>' +
          '<div>›</div>' +
        '</div>' +
      '</div>' +
      '<div id="math-game-area" style="display:none"></div>' +
    '</div>';
    return html;
  }

  function renderGameArea(question) {
    var gameTitle = {
      'speed': '速算挑战',
      'pattern': '找规律',
      '24points': '凑24点'
    };

    var html = '<div style="padding:16px;">' +
      '<button onclick="App.showScreen(\'home-screen\')" style="background:#f0f0f0;border:1px solid #ddd;padding:8px 16px;border-radius:8px;cursor:pointer;">‹ 返回</button>' +
    '</div>' +
    '<div class="math-game-header">' +
      '<div class="level-info">第' + questionCount + '题</div>' +
      '<div class="math-score">得分: ' + score + '</div>' +
    '</div>' +
    '<div class="question-card fade-in">' +
      '<div class="question-text" style="font-size:32px;">' + question.q + '</div>' +
    '</div>' +
    '<div class="options" id="math-options">';

    question.options.forEach(function(opt, idx) {
      html += '<button class="option-btn fade-in" onclick="MathGame.checkAnswer(\'' + opt + '\')" style="animation-delay:' + (idx * 0.1) + 's">' + opt + '</button>';
    });

    html += '</div>';

    if (currentGame === 'speed') {
      html += '<div style="text-align:center;margin-top:20px;color:#666;">答对 ' + correctCount + ' / ' + TOTAL_QUESTIONS + ' 题</div>';
    }

    return html;
  }

  function renderResult() {
    var stars = correctCount >= TOTAL_QUESTIONS * 0.8 ? '⭐⭐⭐' : (correctCount >= TOTAL_QUESTIONS * 0.5 ? '⭐⭐' : '⭐');
    var msg = correctCount >= TOTAL_QUESTIONS * 0.8 ? '太厉害了！' : (correctCount >= TOTAL_QUESTIONS * 0.5 ? '不错，继续加油！' : '再试一次吧！');

    return '<div class="question-card fade-in" style="text-align:center;">' +
      '<h2>🎉 本轮结束！</h2>' +
      '<div style="font-size:48px;margin:20px 0;">' + stars + '</div>' +
      '<p style="font-size:20px;">得分: ' + score + '</p>' +
      '<p>答对: ' + correctCount + ' / ' + TOTAL_QUESTIONS + '</p>' +
      '<p style="color:#666;">' + msg + '</p>' +
      '<div style="margin-top:20px;">' +
        '<button class="modal-btn" onclick="MathGame.startGame(currentGame)">再来一局</button>' +
        '<button class="modal-btn secondary" onclick="MathGame.showMenu()" style="margin-top:8px;">返回选择</button>' +
      '</div>' +
    '</div>';
  }

  function generateQuestion() {
    if (currentGame === 'speed') return generateSpeedMath();
    if (currentGame === 'pattern') return generatePattern();
    if (currentGame === '24points') return generate24Points();
    return generateSpeedMath();
  }

  // ===== 公开接口 =====
  return {
    showMenu: function() {
      document.getElementById('math-game-area').style.display = 'none';
      document.getElementById('math-menu').style.display = 'block';
      document.getElementById('math-screen').classList.add('active');
      currentGame = null;
      questionCount = 0;
      correctCount = 0;
      score = 0;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },

    startGame: function(type) {
      currentGame = type;
      questionCount = 0;
      correctCount = 0;
      score = 0;

      document.getElementById('math-menu').style.display = 'none';
      document.getElementById('math-game-area').style.display = 'block';

      currentQuestion = generateQuestion();
      document.getElementById('math-game-area').innerHTML = renderGameArea(currentQuestion);
    },

    // 生成题目
    generateQuestion: function() {
      if (currentGame === 'speed') return generateSpeedMath();
      if (currentGame === 'pattern') return generatePattern();
      if (currentGame === '24points') return generate24Points();
      return generateSpeedMath();
    },

    nextQuestion: function() {
      questionCount++;
      currentQuestion = generateQuestion();
      document.getElementById('math-game-area').innerHTML = renderGameArea(currentQuestion);
    },

    checkAnswer: function(selected) {
      var correct = false;
      var answer = currentQuestion ? currentQuestion.answer : '';
      // 简单比较
      if (String(selected) === String(answer)) {
        correct = true;
      } else if (currentGame === '24points') {
        // 24点特殊处理
        correct = String(selected).indexOf('24') !== -1 || selected === answer;
      }

      if (correct) {
        correctCount++;
        score += currentGame === '24points' ? 20 : 10;
        App.playCorrectSound();
      } else {
        App.playWrongSound();
      }

      if (questionCount >= TOTAL_QUESTIONS) {
        document.getElementById('math-game-area').innerHTML = renderResult();
      } else {
        MathGame.nextQuestion();
      }
    },

    getHtml: function() {
      return renderMathScreen();
    }
  };
})();

// 页面加载后注入数学游戏HTML
document.addEventListener('DOMContentLoaded', function() {
  console.log('[MathGame] DOMContentLoaded fired');
  var container = document.querySelector('.container');
  console.log('[MathGame] container:', container);
  if (container) {
    var existing = document.getElementById('math-screen');
    console.log('[MathGame] existing math-screen:', existing);
    if (!existing) {
      var mathDiv = document.createElement('div');
      mathDiv.innerHTML = MathGame.getHtml();
      var el = mathDiv.firstElementChild;
      console.log('[MathGame] injecting element:', el ? el.id : 'null');
      container.appendChild(el);
    } else {
      console.log('[MathGame] math-screen already exists');
    }
  } else {
    console.error('[MathGame] container not found!');
  }
});
