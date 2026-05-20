/* ============================================
   STORAGE.JS — LocalStorage Abstraction Layer
   ============================================ */

const Storage = (() => {

  // ── Keys ──
  const KEYS = {
    RESULTS:   'mts_results',
    SETTINGS:  'mts_settings',
    PROGRESS:  'mts_progress',
    BOOKMARKS: 'mts_bookmarks',
    LAST_SEEN: 'mts_last_seen'
  };

  // ── Defaults ──
  const DEFAULTS = {
    settings: {
      mode:  'exam',
      theme: 'dark'
    },
    results:   [],
    progress:  {},
    bookmarks: []
  };

  // ── Safe JSON parse ──
  function safeGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn(`[Storage] Failed to get "${key}":`, e);
      return fallback;
    }
  }

  // ── Safe JSON stringify + set ──
  function safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn(`[Storage] Failed to set "${key}":`, e);
      return false;
    }
  }

  // ─────────────────────────────────
  // SETTINGS
  // ─────────────────────────────────

  function getSettings() {
    return {
      ...DEFAULTS.settings,
      ...safeGet(KEYS.SETTINGS, {})
    };
  }

  function saveSettings(partial) {
    const current = getSettings();
    return safeSet(KEYS.SETTINGS, { ...current, ...partial });
  }

  function getMode() {
    return getSettings().mode;
  }

  function setMode(mode) {
    return saveSettings({ mode });
  }

  function getTheme() {
    return getSettings().theme;
  }

  function setTheme(theme) {
    return saveSettings({ theme });
  }

  // ─────────────────────────────────
  // RESULTS
  // ─────────────────────────────────

  function getResults() {
    return safeGet(KEYS.RESULTS, []);
  }

  function saveResult(result) {
    const results = getResults();

    const entry = {
      id:          generateId(),
      setId:       result.setId       || '',
      setName:     result.setName     || '',
      type:        result.type        || 'practice',
      mode:        result.mode        || 'exam',
      score:       result.score       || 0,
      total:       result.total       || 0,
      percentage:  result.percentage  || 0,
      timeTaken:   result.timeTaken   || 0,
      date:        new Date().toISOString(),
      dateDisplay: formatDate(new Date()),
      answers:     result.answers     || []
    };

    results.unshift(entry); // newest first

    // Keep only last 100 results
    if (results.length > 100) results.splice(100);

    safeSet(KEYS.RESULTS, results);
    return entry;
  }

  function getResultById(id) {
    return getResults().find(r => r.id === id) || null;
  }

  function getResultsByType(type) {
    return getResults().filter(r => r.type === type);
  }

  function getResultsBySetId(setId) {
    return getResults().filter(r => r.setId === setId);
  }

  function getLatestResult(setId) {
    return getResults().find(r => r.setId === setId) || null;
  }

  function clearResults() {
    return safeSet(KEYS.RESULTS, []);
  }

  function deleteResult(id) {
    const results = getResults().filter(r => r.id !== id);
    return safeSet(KEYS.RESULTS, results);
  }

  // ─────────────────────────────────
  // PROGRESS
  // ─────────────────────────────────

  function getProgress() {
    return safeGet(KEYS.PROGRESS, {});
  }

  function getSetProgress(setId) {
    const progress = getProgress();
    return progress[setId] || {
      attempted: false,
      bestScore: 0,
      bestPercentage: 0,
      attempts: 0,
      lastDate: null
    };
  }

  function updateSetProgress(setId, result) {
    const progress = getProgress();
    const current  = getSetProgress(setId);

    const best = (result.percentage >= (current.bestPercentage || 0));

    progress[setId] = {
      attempted:       true,
      bestScore:       best ? result.score       : current.bestScore,
      bestPercentage:  best ? result.percentage  : current.bestPercentage,
      attempts:        (current.attempts || 0) + 1,
      lastDate:        new Date().toISOString()
    };

    return safeSet(KEYS.PROGRESS, progress);
  }

  // ─────────────────────────────────
  // BOOKMARKS
  // ─────────────────────────────────

  function getBookmarks() {
    return safeGet(KEYS.BOOKMARKS, []);
  }

  function toggleBookmark(questionKey) {
    const bookmarks = getBookmarks();
    const idx = bookmarks.indexOf(questionKey);

    if (idx === -1) {
      bookmarks.push(questionKey);
    } else {
      bookmarks.splice(idx, 1);
    }

    safeSet(KEYS.BOOKMARKS, bookmarks);
    return idx === -1; // true = added
  }

  function isBookmarked(questionKey) {
    return getBookmarks().includes(questionKey);
  }

  // ─────────────────────────────────
  // LAST SEEN
  // ─────────────────────────────────

  function setLastSeen(page) {
    safeSet(KEYS.LAST_SEEN, { page, time: Date.now() });
  }

  function getLastSeen() {
    return safeGet(KEYS.LAST_SEEN, null);
  }

  // ─────────────────────────────────
  // STATS (Computed)
  // ─────────────────────────────────

  function getStats() {
    const results  = getResults();
    const progress = getProgress();

    const totalAttempts  = results.length;
    const avgPercentage  = totalAttempts > 0
      ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / totalAttempts)
      : 0;

    const setsCompleted  = Object.keys(progress)
      .filter(k => progress[k].attempted).length;

    const bestScore = results.length > 0
      ? Math.max(...results.map(r => r.percentage))
      : 0;

    return {
      totalAttempts,
      avgPercentage,
      setsCompleted,
      bestScore
    };
  }

  // ─────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-IN', {
      day:   '2-digit',
      month: 'short',
      year:  'numeric'
    });
  }

  function clearAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }

  function exportData() {
    return {
      results:   getResults(),
      progress:  getProgress(),
      settings:  getSettings(),
      bookmarks: getBookmarks(),
      exported:  new Date().toISOString()
    };
  }

  // ── Public API ──
  return {
    // Settings
    getSettings, saveSettings,
    getMode, setMode,
    getTheme, setTheme,

    // Results
    getResults, saveResult,
    getResultById,
    getResultsByType,
    getResultsBySetId,
    getLatestResult,
    clearResults,
    deleteResult,

    // Progress
    getProgress,
    getSetProgress,
    updateSetProgress,

    // Bookmarks
    getBookmarks,
    toggleBookmark,
    isBookmarked,

    // Last Seen
    setLastSeen, getLastSeen,

    // Stats
    getStats,

    // Utility
    clearAll, exportData,
    generateId, formatDate,

    KEYS
  };

})();