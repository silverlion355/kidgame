/**
 * storage.js - localStorage 封装
 * 负责用户数据、进度、设置的本地持久化
 */

const GameStorage = (function () {
  const PREFIX = 'kidgame_';
  const MAX_LOGS = 100;

  function key(name) { return PREFIX + name; }

  function get(name) {
    try {
      const v = localStorage.getItem(key(name));
      return v ? JSON.parse(v) : null;
    } catch (e) { return null; }
  }

  function set(name, value) {
    try {
      localStorage.setItem(key(name), JSON.stringify(value));
      return true;
    } catch (e) { return false; }
  }

  function remove(name) {
    localStorage.removeItem(key(name));
  }

  // ========== 用户进度 ==========

  // 默认进度结构（所有科目都在此登记，避免老设备旧数据缺字段导致崩溃）
  function getDefaultProgress() {
    return {
      idiom: { unlockedLevel: 1, stars: {}, highestLevel: 1 },
      poem: { unlockedLevel: 1, stars: {}, highestLevel: 1 },
      english: { unlockedLevel: 1, stars: {}, highestLevel: 1 },
      hanzi: { unlockedLevel: 1, stars: {}, highestLevel: 1 },
      speed: { unlockedLevel: 1, stars: {}, highestLevel: 1 },
      pattern: { unlockedLevel: 1, stars: {}, highestLevel: 1 },
      points24: { unlockedLevel: 1, stars: {}, highestLevel: 1 },
      multtable: { unlockedLevel: 1, stars: {}, highestLevel: 1 },
      coins: 100,
      hints: 3,
      lastLoginDate: null,
      streak: 0
    };
  }

  // 读取进度：将本地存储的旧数据与新默认结构做“字段补齐”合并，
  // 确保任何新增科目（如 hanzi）都不会因缺失而读取 .stars 崩溃。
  function getProgress() {
    var def = getDefaultProgress();
    var stored = get('progress');
    if (!stored || typeof stored !== 'object') return def;
    var SUBJECTS = ['idiom', 'poem', 'english', 'hanzi', 'speed', 'pattern', 'points24', 'multtable'];
    SUBJECTS.forEach(function(s) {
      if (!stored[s] || typeof stored[s] !== 'object') {
        stored[s] = { unlockedLevel: 1, stars: {}, highestLevel: 1 };
      } else {
        if (stored[s].unlockedLevel == null) stored[s].unlockedLevel = 1;
        if (!stored[s].stars || typeof stored[s].stars !== 'object') stored[s].stars = {};
        if (stored[s].highestLevel == null) stored[s].highestLevel = 1;
      }
    });
    if (stored.coins == null) stored.coins = 100;
    if (stored.hints == null) stored.hints = 3;
    if (stored.streak == null) stored.streak = 0;
    if (stored.lastLoginDate == null) stored.lastLoginDate = null;
    return stored;
  }

  function saveProgress(progress) {
    set('progress', progress);
  }

  // 保存某关的星级（只升不降）
  function saveLevelStars(subject, level, stars) {
    const p = getProgress();
    const prev = p[subject].stars[level] || 0;
    if (stars > prev) {
      p[subject].stars[level] = stars;
    }
    if (level >= p[subject].highestLevel) {
      p[subject].highestLevel = level + 1;
      p[subject].unlockedLevel = Math.max(p[subject].unlockedLevel, level + 1);
    }
    saveProgress(p);
    return p;
  }

  // ========== 错题本 ==========

  function getWrongBook() {
    return get('wrongBook') || { idiom: [], poem: [], english: [], hanzi: [] };
  }

  function addWrong(subject, itemId) {
    const wb = getWrongBook();
    if (!wb[subject].includes(itemId)) {
      wb[subject].push(itemId);
      set('wrongBook', wb);
    }
  }

  function removeWrong(subject, itemId) {
    const wb = getWrongBook();
    wb[subject] = wb[subject].filter(id => id !== itemId);
    set('wrongBook', wb);
  }

  // ========== 登录奖励 ==========

  function checkDailyReward() {
    const p = getProgress();
    const today = new Date().toDateString();
    if (p.lastLoginDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (p.lastLoginDate === yesterday.toDateString()) {
        p.streak = (p.streak || 0) + 1;
      } else {
        p.streak = 1;
      }
      p.lastLoginDate = today;
      p.coins += 10 + Math.min(p.streak, 7) * 5;
      saveProgress(p);
      return { claimed: true, coins: 10 + Math.min(p.streak, 7) * 5, streak: p.streak };
    }
    return { claimed: false, streak: p.streak || 0 };
  }

  // ========== 提示卡 ==========

  function useHint() {
    const p = getProgress();
    if (p.hints > 0) {
      p.hints--;
      saveProgress(p);
      return true;
    }
    return false;
  }

  function addHints(count) {
    const p = getProgress();
    p.hints += count;
    saveProgress(p);
  }

  // ========== 金币 ==========

  function addCoins(amount) {
    const p = getProgress();
    p.coins += amount;
    saveProgress(p);
  }

  function spendCoins(amount) {
    const p = getProgress();
    if (p.coins >= amount) {
      p.coins -= amount;
      saveProgress(p);
      return true;
    }
    return false;
  }

  // ========== 商店 ==========

  function getShop() {
    return get('shop') || { gifts: [], freeTimeBalance: 0 };
  }

  function saveShop(shop) {
    set('shop', shop);
  }

  function buyGift(giftId) {
    const shop = getShop();
    if (!shop.gifts.includes(giftId)) {
      shop.gifts.push(giftId);
      saveShop(shop);
      return true;
    }
    return false; // already owned
  }

  function hasGift(giftId) {
    const shop = getShop();
    return shop.gifts.includes(giftId);
  }

  function getOwnedGifts() {
    const shop = getShop();
    return shop.gifts || [];
  }

  function addFreeTime(minutes) {
    const shop = getShop();
    shop.freeTimeBalance = (shop.freeTimeBalance || 0) + minutes;
    saveShop(shop);
  }

  function getFreeTimeBalance() {
    const shop = getShop();
    return shop.freeTimeBalance || 0;
  }

  function useFreeTime(minutes) {
    const shop = getShop();
    const balance = shop.freeTimeBalance || 0;
    if (minutes > balance) return false;
    shop.freeTimeBalance = balance - minutes;
    saveShop(shop);
    return true;
  }

  // ===== 日志系统 =====
  function addLog(type, msg, data) {
    try {
      var logs = get('logs') || [];
      var entry = {
        time: data && data.time ? data.time : new Date().toISOString(),
        type: type,
        msg: msg,
        data: data || null
      };
      // If data.time was passed (from Java), use it as-is; otherwise use now()
      logs.unshift(entry);
      if (logs.length > MAX_LOGS) logs = logs.slice(0, MAX_LOGS);
      set('logs', logs);
      // 同时输出到console
      console.log('[KidGame][' + type + '] ' + msg, data || '');
    } catch (e) {}
  }

  function getLogs() {
    return get('logs') || [];
  }

  function clearLogs() {
    remove('logs');
  }

  return {
    getProgress, saveProgress, saveLevelStars,
    getWrongBook, addWrong, removeWrong,
    checkDailyReward, useHint, addHints,
    addCoins, spendCoins,
    getShop, saveShop, buyGift, hasGift, getOwnedGifts,
    addFreeTime, getFreeTimeBalance, useFreeTime,
    get, set, remove,
    addLog, getLogs, clearLogs
  };
})();
