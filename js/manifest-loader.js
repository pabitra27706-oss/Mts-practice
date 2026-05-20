/* ============================================
   MANIFEST-LOADER.JS — FIXED
   Reads manifest.json → exposes set configs
   ============================================ */

const ManifestLoader = (() => {
  
  let _manifest = null;
  let _loading = false;
  let _callbacks = [];
  
  // ── Detect base URL (absolute) ──
  function getBaseURL() {
    const loc = window.location;
    const path = loc.pathname;
    
    // Remove filename and /pages/ if present
    let base = path;
    
    // If we are inside /pages/ subfolder
    if (base.includes('/pages/')) {
      base = base.substring(0, base.indexOf('/pages/'));
    } else {
      // Remove filename if any
      base = base.substring(0, base.lastIndexOf('/'));
    }
    
    // Make sure it ends with /
    if (!base.endsWith('/')) base += '/';
    
    // Return full absolute base
    return loc.origin + base;
  }
  
  // ── Load manifest.json ──
  async function load() {
    if (_manifest) return _manifest;
    
    if (_loading) {
      return new Promise(resolve => _callbacks.push(resolve));
    }
    
    _loading = true;
    
    try {
      const base = getBaseURL();
      const url = base + 'manifest.json';
      
      console.log('[ManifestLoader] Fetching:', url);
      
      const response = await fetch(url, { cache: 'no-cache' });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch manifest: HTTP ${response.status}`);
      }
      
      _manifest = await response.json();
      
      _callbacks.forEach(cb => cb(_manifest));
      _callbacks = [];
      _loading = false;
      
      console.log('[ManifestLoader] Loaded successfully');
      return _manifest;
      
    } catch (err) {
      _loading = false;
      console.error('[ManifestLoader] Error:', err);
      throw err;
    }
  }
  
  // ── Get PYQ sets ──
  async function getPYQSets() {
    const m = await load();
    return (m.question_sets && m.question_sets.pyq) ? m.question_sets.pyq : [];
  }
  
  // ── Get Practice sets ──
  async function getPracticeSets() {
    const m = await load();
    return (m.question_sets && m.question_sets.practice) ? m.question_sets.practice : [];
  }
  
  // ── Get set by ID ──
  async function getSetById(id) {
    const m = await load();
    const pyq = (m.question_sets && m.question_sets.pyq) || [];
    const prac = (m.question_sets && m.question_sets.practice) || [];
    const all = pyq.concat(prac);
    return all.find(function(s) { return s.id === id; }) || null;
  }
  
  // ── Get app config ──
  async function getAppConfig() {
    const m = await load();
    return m.appConfig || {};
  }
  
  // ── Get default mode ──
  async function getDefaultMode() {
    const cfg = await getAppConfig();
    return cfg.defaultMode || 'exam';
  }
  
  // ── Get summary stats ──
  async function getSummary() {
    const m = await load();
    const pyq = (m.question_sets && m.question_sets.pyq) || [];
    const prac = (m.question_sets && m.question_sets.practice) || [];
    
    var pyqQ = 0;
    var pracQ = 0;
    
    pyq.forEach(function(s) { pyqQ += (s.totalQuestions || 0); });
    prac.forEach(function(s) { pracQ += (s.totalQuestions || 0); });
    
    return {
      totalSets: pyq.length + prac.length,
      totalQuestions: pyqQ + pracQ,
      pyqSets: pyq.length,
      practiceSets: prac.length,
      pyqQuestions: pyqQ,
      practiceQuestions: pracQ
    };
  }
  
  // ── Load question JSON ──
  async function loadQuestions(setConfig) {
    const base = getBaseURL();
    
    // setConfig.file is like "data/pyq/pyq-set-1.json"
    // strip any leading "./" or "/"
    var filePath = setConfig.file.replace(/^\.?\//, '');
    var url = base + filePath;
    
    console.log('[ManifestLoader] Loading questions from:', url);
    
    try {
      const response = await fetch(url, { cache: 'default' });
      
      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ' for ' + url);
      }
      
      const data = await response.json();
      
      if (!data.questions || data.questions.length === 0) {
        throw new Error('No questions found in ' + url);
      }
      
      console.log('[ManifestLoader] Loaded', data.questions.length, 'questions');
      return data.questions;
      
    } catch (err) {
      console.error('[ManifestLoader] loadQuestions error:', err);
      throw err;
    }
  }
  
  // ── Format time ──
  function formatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    if (s === 0) return m + ' min';
    return m + ':' + (s < 10 ? '0' + s : s) + ' min';
  }
  
  // ── Get time label for a set ──
  function getTimeLabel(setConfig) {
    return formatTime(setConfig.timeInSeconds || 1500);
  }
  
  // ── Public API ──
  return {
    load,
    getBaseURL,
    getPYQSets,
    getPracticeSets,
    getSetById,
    getAppConfig,
    getDefaultMode,
    getSummary,
    loadQuestions,
    formatTime,
    getTimeLabel
  };
  
})();