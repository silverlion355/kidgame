const fs = require('fs');

// Read JSON data
const idioms = JSON.parse(fs.readFileSync('data/idioms.json', 'utf8')).items;
const poems = JSON.parse(fs.readFileSync('data/poems.json', 'utf8')).items;
const english = JSON.parse(fs.readFileSync('data/english.json', 'utf8')).items;

let js = 'const DataManager = (function () {\n\n';

// Inline data as JS arrays
js += '  const IDIOMS_DATA = ' + JSON.stringify(idioms) + ';\n\n';
js += '  const POEMS_DATA = ' + JSON.stringify(poems) + ';\n\n';
js += '  const ENGLISH_DATA = ' + JSON.stringify(english) + ';\n\n';

js += '  let idiomsData = [];\n';
js += '  let poemsData = [];\n';
js += '  let englishData = [];\n';
js += '  let loaded = false;\n\n';

js += '  function loadAll() {\n';
js += '    if (loaded) return { idioms: idiomsData, poems: poemsData, english: englishData };\n';
js += '    idiomsData = IDIOMS_DATA.map(function(item, idx) { item._index = idx; return item; });\n';
js += '    poemsData = POEMS_DATA.map(function(item, idx) { item._index = idx; return item; });\n';
js += '    englishData = ENGLISH_DATA.map(function(item, idx) { item._index = idx; return item; });\n';
js += '    loaded = true;\n';
js += '    return { idioms: idiomsData, poems: poemsData, english: englishData };\n';
js += '  }\n\n';

js += '  function getDifficultyRange(level) {\n';
js += '    if (level <= 10) return [1, 2];\n';
js += '    if (level <= 30) return [2, 3];\n';
js += '    if (level <= 60) return [3, 4];\n';
js += '    return [4, 5];\n';
js += '  }\n\n';

js += '  function generateQuestions(subject, level, count) {\n';
js += '    count = count || 5;\n';
js += '    var data = getDataBySubject(subject);\n';
js += '    if (!data.length) return [];\n';
js += '    var range = getDifficultyRange(level);\n';
js += '    var minDiff = range[0], maxDiff = range[1];\n';
js += '    var pool = data.filter(function(item) { return item.difficulty >= minDiff && item.difficulty <= maxDiff; });\n';
js += '    var source = pool.length >= count ? pool : data;\n';
js += '    var questions = [];\n';
js += '    var usedIndices = new Set();\n';
js += '    for (var i = 0; i < count; i++) {\n';
js += '      var item = pickRandom(source, usedIndices);\n';
js += '      if (!item) break;\n';
js += '      usedIndices.add(item._index);\n';
js += '      var q = buildQuestion(subject, item, data);\n';
js += '      if (q) questions.push(q);\n';
js += '    }\n';
js += '    return questions;\n';
js += '  }\n\n';

js += '  function getDataBySubject(subject) {\n';
js += '    switch (subject) {\n';
js += '      case "idiom": return idiomsData;\n';
js += '      case "poem": return poemsData;\n';
js += '      case "english": return englishData;\n';
js += '      default: return [];\n';
js += '    }\n';
js += '  }\n\n';

js += '  function pickRandom(arr, exclude) {\n';
js += '    if (arr.length <= exclude.size) return null;\n';
js += '    var tries = 0;\n';
js += '    while (tries < 50) {\n';
js += '      var idx = Math.floor(Math.random() * arr.length);\n';
js += '      if (!exclude.has(arr[idx]._index)) return arr[idx];\n';
js += '      tries++;\n';
js += '    }\n';
js += '    return arr[Math.floor(Math.random() * arr.length)];\n';
js += '  }\n\n';

js += '  function buildQuestion(subject, item, allData) {\n';
js += '    switch (subject) {\n';
js += '      case "idiom": return buildIdiomQuestion(item, allData);\n';
js += '      case "poem": return buildPoemQuestion(item, allData);\n';
js += '      case "english": return buildEnglishQuestion(item, allData);\n';
js += '      default: return null;\n';
js += '    }\n';
js += '  }\n\n';

// buildIdiomQuestion
js += '  function buildIdiomQuestion(item, allData) {\n';
js += '    var types = ["meaning", "fillBlank", "guess"];\n';
js += '    var type = types[Math.floor(Math.random() * types.length)];\n';
js += '    if (type === "meaning") {\n';
js += '      var wrongs = pickWrongsByTag(item, allData, "word", 3);\n';
js += '      return { type: "choice", q: "\\u300c" + item.meaning + "\\u300d\\n\\n这个释义对应的成语是？", options: shuffle([item.word].concat(wrongs)), answer: item.word, idiomId: item.id };\n';
js += '    } else if (type === "fillBlank") {\n';
js += '      var sentence = item.example.replace(item.word, "（ ？ ）");\n';
js += '      var wrongs2 = pickWrongsByTag(item, allData, "word", 3);\n';
js += '      return { type: "choice", q: "\\u300c" + sentence + "\\u300d\\n\\n句中括号里应该填哪个成语？", options: shuffle([item.word].concat(wrongs2)), answer: item.word, idiomId: item.id };\n';
js += '    } else {\n';
js += '      var desc = generateIdiomDesc(item);\n';
js += '      var wrongs3 = pickWrongsByTag(item, allData, "word", 3);\n';
js += '      return { type: "choice", q: "【看图猜成语】\\n" + desc + "\\n\\n这个画面描述的是哪个成语？", options: shuffle([item.word].concat(wrongs3)), answer: item.word, idiomId: item.id };\n';
js += '    }\n';
js += '  }\n\n';

// generateIdiomDesc
js += '  function generateIdiomDesc(item) {\n';
js += '    var descs = {};\n';
var descMap = {
  '画龙点睛': '一条龙已经画好，有人在上面点上眼睛，龙立刻活了过来',
  '守株待兔': '一个农夫站在树旁，等着兔子撞树',
  '亡羊补牢': '羊圈破了个洞，牧羊人正在修补',
  '井底之蛙': '一只青蛙坐在井底，抬头只能看到一小片天',
  '狐假虎威': '狐狸走在老虎前面，百兽见了都害怕',
  '刻舟求剑': '船上的人在水面刻记号，想找回掉进水里的剑',
  '掩耳盗铃': '一个人捂住自己的耳朵去偷铃铛',
  '对牛弹琴': '一个人对着牛弹琴，牛毫无反应',
  '胸有成竹': '一个人心里想着竹子，准备画画',
  '班门弄斧': '一个小木匠在鲁班门前炫耀斧头技艺',
  '一箭双雕': '一支箭射出去，同时射中两只雕',
  '杯弓蛇影': '一个人喝酒时，看到杯子里有蛇的影子',
  '破釜沉舟': '把锅砸碎，把船凿沉，决心决一死战',
  '卧薪尝胆': '一个人睡在柴草上，每天尝苦胆',
  '指鹿为马': '上朝时指着鹿说这是马，大臣不敢反驳',
  '刮目相看': '一个人换了新眼光，惊讶地看着老朋友',
  '唇亡齿寒': '嘴唇没了，牙齿就会感到寒冷',
  '负荆请罪': '一个人光着上身，背着荆条来请罪',
  '纸上谈兵': '一个人在纸上讨论兵法，从不上战场',
  '三顾茅庐': '一个人三次去茅草屋拜访隐居的智者',
  '望梅止渴': '士兵们听到前面有梅子，流着口水不渴了',
  '鹤立鸡群': '一只白鹤站在鸡群中，显得特别高',
  '画蛇添足': '一个人给画好的蛇添上脚，反而输了',
  '叶公好龙': '一个人说喜欢龙，真龙来了却吓跑了',
  '鸡飞蛋打': '鸡飞走了，蛋也打碎了，什么都没得到',
  '悬梁刺股': '一个人把头发系在房梁上，用锥子刺大腿',
  '闻鸡起舞': '听到鸡叫就起床练剑',
  '四面楚歌': '被敌人包围，听到四面都是楚国的歌声',
  '东山再起': '失败后重新崛起，回到山头',
  '鞠躬尽瘁': '一个人恭敬谨慎，耗尽全部心力'
};
Object.keys(descMap).forEach(function(key) {
  js += '    descs["' + key + '"] = "' + descMap[key] + '";\n';
});
js += '    return descs[item.word] || "与「" + item.meaning + "」相关的画面";\n';
js += '  }\n\n';

// buildPoemQuestion
js += '  function buildPoemQuestion(item, allData) {\n';
js += '    var types = ["fillVerse", "author", "dynasty"];\n';
js += '    var type = types[Math.floor(Math.random() * types.length)];\n';
js += '    if (type === "fillVerse") {\n';
js += '      var verseIdx = Math.floor(Math.random() * item.content.length);\n';
js += '      var verse = item.content[verseIdx];\n';
js += '      var qText, answer;\n';
js += '      if (Math.random() > 0.5 || verseIdx === item.content.length - 1) {\n';
js += '        qText = item.title + "（" + item.author + "）\\n\\u300c" + verse.substring(1) + "\\u300d的前一句是？";\n';
js += '        answer = verse;\n';
js += '      } else {\n';
js += '        qText = item.title + "（" + item.author + "）\\n\\u300c" + verse + "\\u300d的下一句是？";\n';
js += '        answer = item.content[verseIdx + 1];\n';
js += '      }\n';
js += '      var wrongs = pickWrongPoemVerses(item, allData, 3);\n';
js += '      return { type: "choice", q: qText, options: shuffle([answer].concat(wrongs)), answer: answer, poemId: item.id };\n';
js += '    } else if (type === "author") {\n';
js += '      var wrongs2 = pickWrongAuthors(item, allData, 3);\n';
js += '      return { type: "choice", q: "\\u300c" + item.title + "\\u300d\\n这首诗的作者是谁？", options: shuffle([item.author].concat(wrongs2)), answer: item.author, poemId: item.id };\n';
js += '    } else {\n';
js += '      var wrongs3 = pickWrongDynasties(item, allData, 3);\n';
js += '      return { type: "choice", q: "\\u300c" + item.title + "\\u300d（" + item.author + "）\\n作者属于哪个朝代？", options: shuffle([item.dynasty].concat(wrongs3)), answer: item.dynasty, poemId: item.id };\n';
js += '    }\n';
js += '  }\n\n';

// pickWrongPoemVerses
js += '  function pickWrongPoemVerses(currentItem, allData, count) {\n';
js += '    var verses = [];\n';
js += '    var allVerses = allData.filter(function(i) { return i._index !== currentItem._index; }).reduce(function(arr, i) { return arr.concat(i.content); }, []);\n';
js += '    var used = new Set();\n';
js += '    while (verses.length < count && verses.length < allVerses.length) {\n';
js += '      var v = allVerses[Math.floor(Math.random() * allVerses.length)];\n';
js += '      if (!used.has(v)) { verses.push(v); used.add(v); }\n';
js += '    }\n';
js += '    return verses;\n';
js += '  }\n\n';

// pickWrongAuthors
js += '  function pickWrongAuthors(currentItem, allData, count) {\n';
js += '    var pool = allData.filter(function(i) { return i.author !== currentItem.author; });\n';
js += '    var authors = {};\n';
js += '    pool.forEach(function(i) { authors[i.author] = true; });\n';
js += '    return shuffle(Object.keys(authors)).slice(0, count);\n';
js += '  }\n\n';

// pickWrongDynasties
js += '  function pickWrongDynasties(currentItem, allData, count) {\n';
js += '    var pool = allData.filter(function(i) { return i.dynasty !== currentItem.dynasty; });\n';
js += '    var dynasties = {};\n';
js += '    pool.forEach(function(i) { dynasties[i.dynasty] = true; });\n';
js += '    return shuffle(Object.keys(dynasties)).slice(0, count);\n';
js += '  }\n\n';

// buildEnglishQuestion
js += '  function buildEnglishQuestion(item, allData) {\n';
js += '    var types = ["meaning", "guess", "spell"];\n';
js += '    var type = types[Math.floor(Math.random() * types.length)];\n';
js += '    if (type === "meaning") {\n';
js += '      var wrongs = pickWrongsByTag(item, allData, "word", 3);\n';
js += '      return { type: "choice", q: "\\u300c" + item.meaning_cn + "\\u300d\\n\\n这个意思对应的英文单词是？", options: shuffle([item.word].concat(wrongs)), answer: item.word, englishId: item.id };\n';
js += '    } else if (type === "guess") {\n';
js += '      var wrongs2 = pickWrongsByTag(item, allData, "meaning_cn", 3);\n';
js += '      return { type: "choice", q: "单词\\u300c" + item.word + "\\u300d\\n它的中文意思是？", options: shuffle([item.meaning_cn].concat(wrongs2)), answer: item.meaning_cn, englishId: item.id };\n';
js += '    } else {\n';
js += '      return { type: "spell", q: "请拼写这个单词：\\n\\u300c" + item.meaning_cn + "\\u300d", hint: item.word[0] + "_".repeat(item.word.length - 1), answer: item.word.toLowerCase(), englishId: item.id };\n';
js += '    }\n';
js += '  }\n\n';

// pickWrongsByTag
js += '  function pickWrongsByTag(item, allData, field, count) {\n';
js += '    var tagMatches = allData.filter(function(i) {\n';
js += '      return i._index !== item._index && i.difficulty >= item.difficulty - 1 && i.difficulty <= item.difficulty + 1 && i.tags.some(function(t) { return item.tags.indexOf(t) >= 0; });\n';
js += '    });\n';
js += '    var pool = tagMatches.length >= count ? tagMatches : allData.filter(function(i) {\n';
js += '      return i._index !== item._index && i.difficulty >= item.difficulty - 1 && i.difficulty <= item.difficulty + 1;\n';
js += '    });\n';
js += '    if (pool.length < count) { pool = allData.filter(function(i) { return i._index !== item._index; }); }\n';
js += '    var wrongs = [];\n';
js += '    var used = new Set();\n';
js += '    while (wrongs.length < count && wrongs.length < pool.length) {\n';
js += '      var pick = pool[Math.floor(Math.random() * pool.length)];\n';
js += '      var val = pick[field];\n';
js += '      if (!used.has(val) && val !== item[field]) { wrongs.push(val); used.add(val); }\n';
js += '    }\n';
js += '    return wrongs;\n';
js += '  }\n\n';

// shuffle
js += '  function shuffle(arr) {\n';
js += '    var a = arr.slice();\n';
js += '    for (var i = a.length - 1; i > 0; i--) {\n';
js += '      var j = Math.floor(Math.random() * (i + 1));\n';
js += '      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;\n';
js += '    }\n';
js += '    return a;\n';
js += '  }\n\n';

// getTotalLevels
js += '  function getTotalLevels(subject) {\n';
js += '    var data = getDataBySubject(subject);\n';
js += '    if (!data.length) return 0;\n';
js += '    var maxDiff = Math.max.apply(null, data.map(function(i) { return i.difficulty; }));\n';
js += '    return maxDiff * 10;\n';
js += '  }\n\n';

js += '  return { loadAll: loadAll, generateQuestions: generateQuestions, getTotalLevels: getTotalLevels, getDataBySubject: getDataBySubject, shuffle: shuffle };\n';
js += '})();\n';

fs.writeFileSync('js/data-manager.js', js, 'utf8');
console.log('data-manager.js built successfully!');
