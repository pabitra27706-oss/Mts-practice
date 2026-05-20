/* ============================================
   APP.JS — Home Page Logic (FIXED)
   Loads stats, handles theme & mode toggle
   ============================================ */

(function() {

  // ── Apply theme instantly before render ──
  function applyTheme(theme) {
    document.documentElement.setAttribute(
      'data-theme', theme || 'dark'
    );

    var icon = document.getElementById('themeIcon');
    if (icon) {
      icon.textContent = (theme === 'light') ? '☀️' : '🌙';
    }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.content = (theme === 'light') ? '#f8fafc' : '#6366f1';
    }
  }

  // ── Read theme from localStorage directly ──
  function getTheme() {
    try {
      var raw = localStorage.getItem('mts_settings');
      if (!raw) return 'dark';
      var obj = JSON.parse(raw);
      return obj.theme || 'dark';
    } catch (e) {
      return 'dark';
    }
  }

  // ── Save theme ──
  function saveTheme(theme) {
    try {
      var raw = localStorage.getItem('mts_settings');
      var obj = {};
      try { if (raw) obj = JSON.parse(raw); } catch(e) {}
      obj.theme = theme;
      localStorage.setItem('mts_settings', JSON.stringify(obj));
    } catch (e) {}
  }

  // ── Set element text ──
  function setEl(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // ── Show toast ──
  function showToast(msg) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function() {
      toast.classList.remove('show');
    }, 2000);
  }

  // ── Animate number from 0 to target ──
  function animateNumber(el, target) {
    if (!el) return;
    var current  = 0;
    var duration = 800;
    var steps    = 30;
    var step     = Math.ceil(target / steps);
    var interval = Math.floor(duration / steps);

    var timer = setInterval(function() {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      el.textContent = current;
    }, interval);
  }

  // ── Bind theme toggle button ──
  function bindThemeToggle() {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;

    btn.addEventListener('click', function() {
      var current = getTheme();
      var next    = current === 'dark' ? 'light' : 'dark';
      saveTheme(next);
      applyTheme(next);
      showToast(next === 'dark' ? '🌙 Dark mode' : '☀️ Light mode');
    });
  }

  // ── Bind mode toggle buttons ──
  function bindModeToggle() {
    var examBtn = document.getElementById('examModeBtn');
    var readBtn = document.getElementById('readModeBtn');

    if (!examBtn || !readBtn) {
      console.warn('[App] Mode toggle buttons not found');
      return;
    }

    // Apply current mode to buttons on load
    updateModeButtons(getCurrentMode());

    examBtn.addEventListener('click', function() {
      setCurrentMode('exam');
      updateModeButtons('exam');
      updateModeIndicator('exam');
      showToast('🎯 Exam Mode — Timer active');
    });

    readBtn.addEventListener('click', function() {
      setCurrentMode('read');
      updateModeButtons('read');
      updateModeIndicator('read');
      showToast('📖 Read Mode — No timer');
    });
  }

  // ── Get mode from localStorage ──
  function getCurrentMode() {
    try {
      var raw = localStorage.getItem('mts_settings');
      if (!raw) return 'exam';
      var obj = JSON.parse(raw);
      return obj.mode || 'exam';
    } catch (e) {
      return 'exam';
    }
  }

  // ── Save mode ──
  function setCurrentMode(mode) {
    try {
      var raw = localStorage.getItem('mts_settings');
      var obj = {};
      try { if (raw) obj = JSON.parse(raw); } catch(e) {}
      obj.mode = mode;
      localStorage.setItem('mts_settings', JSON.stringify(obj));
    } catch (e) {}
  }

  // ── Update toggle button visuals ──
  function updateModeButtons(mode) {
    var examBtn = document.getElementById('examModeBtn');
    var readBtn = document.getElementById('readModeBtn');
    var isExam  = (mode === 'exam');

    if (examBtn) {
      if (isExam) {
        examBtn.classList.add('mode-toggle__btn--active');
      } else {
        examBtn.classList.remove('mode-toggle__btn--active');
      }
      examBtn.setAttribute('aria-pressed', isExam ? 'true' : 'false');
    }

    if (readBtn) {
      if (!isExam) {
        readBtn.classList.add('mode-toggle__btn--active');
      } else {
        readBtn.classList.remove('mode-toggle__btn--active');
      }
      readBtn.setAttribute('aria-pressed', isExam ? 'false' : 'true');
    }
  }

  // ── Update mode indicator bar ──
  function updateModeIndicator(mode) {
    var indicator = document.getElementById('modeIndicator');
    var dot       = document.getElementById('modeDot');
    var text      = document.getElementById('modeText');
    var isExam    = (mode === 'exam');

    if (!indicator) return;

    indicator.className =
      'mode-indicator mode-indicator--' + mode;

    if (dot) {
      dot.style.background = isExam
        ? 'var(--primary)'
        : 'var(--success)';
      dot.style.boxShadow = isExam
        ? '0 0 8px var(--primary)'
        : '0 0 8px var(--success)';
    }

    if (text) {
      text.textContent = isExam
        ? '🎯 Exam Mode — Timer active, answers hidden until submit'
        : '📖 Read Mode — No timer, instant answer reveal';
    }
  }

  // ── Load manifest stats ──
  async function loadManifestStats() {
    try {
      var summary = await ManifestLoader.getSummary();

      console.log('[App] Manifest summary:', summary);

      // Hero stats — animate numbers
      var setsEl = document.getElementById('totalSets');
      var qsEl   = document.getElementById('totalQuestions');

      if (setsEl) animateNumber(setsEl, summary.totalSets);
      if (qsEl)   animateNumber(qsEl,   summary.totalQuestions);

      // PYQ card meta
      setEl(
        'pyqSetCount',
        summary.pyqSets +
        ' Set' + (summary.pyqSets !== 1 ? 's' : '')
      );
      setEl('pyqQCount', summary.pyqQuestions + ' Questions');

      // Practice card meta
      setEl(
        'practiceSetCount',
        summary.practiceSets +
        ' Set' + (summary.practiceSets !== 1 ? 's' : '')
      );
      setEl('practiceQCount', summary.practiceQuestions + ' Questions');

    } catch (err) {
      console.error('[App] Failed to load manifest stats:', err);

      // Show fallback values
      setEl('totalSets',       '0');
      setEl('totalQuestions',  '0');
      setEl('pyqSetCount',     '0 Sets');
      setEl('pyqQCount',       '0 Questions');
      setEl('practiceSetCount','0 Sets');
      setEl('practiceQCount',  '0 Questions');
    }
  }

  // ── Load result stats from localStorage ──
  function loadResultStats() {
    try {
      // Get results array directly
      var raw     = localStorage.getItem('mts_results');
      var results = [];
      try { if (raw) results = JSON.parse(raw); } catch(e) {}

      var totalAttempts = results.length;

      // Animate attempts number
      var attemptsEl = document.getElementById('totalAttempts');
      if (attemptsEl) animateNumber(attemptsEl, totalAttempts);

      // Results card count
      var countEl = document.getElementById('resultCount');
      if (countEl) countEl.textContent = totalAttempts;

      // Results subtext
      if (totalAttempts === 0) {
        setEl('resultsSubtext', 'No attempts yet — start practicing!');
      } else {
        var latest = results[0];
        setEl(
          'resultsSubtext',
          'Last: ' + (latest.setName || 'Unknown') +
          ' · '    + (latest.percentage || 0) + '%' +
          ' · '    + (latest.dateDisplay || '')
        );
      }

    } catch (err) {
      console.error('[App] Failed to load result stats:', err);
      setEl('totalAttempts', '0');
      setEl('resultCount',   '0');
    }
  }

  // ── Main init ──
  async function init() {
    console.log('[App] Starting home page init...');

    // 1. Apply theme immediately
    var theme = getTheme();
    applyTheme(theme);

    // 2. Bind theme toggle
    bindThemeToggle();

    // 3. Bind mode toggle buttons
    bindModeToggle();

    // 4. Apply mode indicator
    var mode = getCurrentMode();
    updateModeIndicator(mode);

    // 5. Load manifest stats (async)
    await loadManifestStats();

    // 6. Load result stats (sync from localStorage)
    loadResultStats();

    console.log('[App] Home page ready');
  }

  // ── Boot ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());