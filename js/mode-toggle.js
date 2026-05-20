/* ============================================
   MODE-TOGGLE.JS — FIXED
   Self contained, no external dependencies
   at declaration time
   ============================================ */

var ModeToggle = (function() {
  
  var MODES = {
    EXAM: 'exam',
    READ: 'read'
  };
  
  var _currentMode = 'exam';
  var _listeners = [];
  var _initialized = false;
  
  // ── Safe storage read ──
  function _getStoredMode() {
    try {
      var raw = localStorage.getItem('mts_settings');
      if (!raw) return 'exam';
      var obj = JSON.parse(raw);
      return obj.mode || 'exam';
    } catch (e) {
      return 'exam';
    }
  }
  
  // ── Safe storage write ──
  function _saveMode(mode) {
    try {
      var raw = localStorage.getItem('mts_settings');
      var obj = {};
      if (raw) {
        try { obj = JSON.parse(raw); } catch (e) {}
      }
      obj.mode = mode;
      localStorage.setItem('mts_settings', JSON.stringify(obj));
    } catch (e) {
      console.warn('[ModeToggle] Could not save mode:', e);
    }
  }
  
  // ── Init ──
  function init() {
    if (_initialized) {
      // Already initialized — just re-apply to DOM
      _applyMode(_currentMode, false);
      _bindButtons();
      return;
    }
    
    _initialized = true;
    _currentMode = _getStoredMode();
    _applyMode(_currentMode, false);
    _bindButtons();
    
    console.log('[ModeToggle] Initialized, mode:', _currentMode);
  }
  
  // ── Bind toggle buttons ──
  function _bindButtons() {
    var examBtn = document.getElementById('examModeBtn');
    var readBtn = document.getElementById('readModeBtn');
    
    if (examBtn) {
      // Remove old listeners by cloning
      var newExam = examBtn.cloneNode(true);
      examBtn.parentNode.replaceChild(newExam, examBtn);
      newExam.addEventListener('click', function() {
        setMode(MODES.EXAM);
      });
    }
    
    if (readBtn) {
      var newRead = readBtn.cloneNode(true);
      readBtn.parentNode.replaceChild(newRead, readBtn);
      newRead.addEventListener('click', function() {
        setMode(MODES.READ);
      });
    }
    
    // Any button with data-mode-toggle attribute
    var toggleBtns = document.querySelectorAll('[data-mode-toggle]');
    for (var i = 0; i < toggleBtns.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          var target = btn.getAttribute('data-mode-toggle');
          if (target) {
            setMode(target);
          } else {
            toggle();
          }
        });
      })(toggleBtns[i]);
    }
  }
  
  // ── Set mode ──
  function setMode(mode) {
    if (mode !== MODES.EXAM && mode !== MODES.READ) {
      console.warn('[ModeToggle] Invalid mode:', mode);
      return;
    }
    
    var changed = (_currentMode !== mode);
    _currentMode = mode;
    _saveMode(mode);
    _applyMode(mode, changed);
    
    if (changed) {
      for (var i = 0; i < _listeners.length; i++) {
        try { _listeners[i](mode); } catch (e) {}
      }
    }
  }
  
  // ── Toggle ──
  function toggle() {
    setMode(_currentMode === MODES.EXAM ? MODES.READ : MODES.EXAM);
  }
  
  // ── Apply mode to DOM ──
  function _applyMode(mode, animate) {
    var isExam = (mode === MODES.EXAM);
    
    // Set body data attribute
    document.body.setAttribute('data-mode', mode);
    
    // Update toggle buttons
    _updateButtons(mode);
    
    // Update mode indicator (home page)
    _updateIndicator(mode);
    
    // Toast on change
    if (animate) {
      var msg = isExam ?
        '🎯 Exam Mode — Timer active' :
        '📖 Read Mode — No timer';
      _showToast(msg);
    }
  }
  
  // ── Update toggle button states ──
  function _updateButtons(mode) {
    var isExam = (mode === MODES.EXAM);
    
    // Re-query after possible clone
    var examBtn = document.getElementById('examModeBtn');
    var readBtn = document.getElementById('readModeBtn');
    
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
  
  // ── Update mode indicator (home page only) ──
  function _updateIndicator(mode) {
    var indicator = document.getElementById('modeIndicator');
    var dot = document.getElementById('modeDot');
    var text = document.getElementById('modeText');
    
    if (!indicator) return;
    
    var isExam = (mode === MODES.EXAM);
    
    indicator.className = 'mode-indicator mode-indicator--' + mode;
    
    if (dot) {
      dot.style.background = isExam ?
        'var(--primary)' :
        'var(--success)';
      dot.style.boxShadow = isExam ?
        '0 0 8px var(--primary)' :
        '0 0 8px var(--success)';
    }
    
    if (text) {
      text.textContent = isExam ?
        '🎯 Exam Mode — Timer active, answers hidden until submit' :
        '📖 Read Mode — No timer, instant answer reveal';
    }
  }
  
  // ── Get current mode ──
  function getMode() {
    return _currentMode;
  }
  
  // ── Check modes ──
  function isExamMode() {
    return _currentMode === MODES.EXAM;
  }
  
  function isReadMode() {
    return _currentMode === MODES.READ;
  }
  
  // ── Subscribe to changes ──
  function onChange(fn) {
    if (typeof fn === 'function') {
      _listeners.push(fn);
    }
    return function() {
      _listeners = _listeners.filter(function(l) { return l !== fn; });
    };
  }
  
  // ── Toast (self-contained) ──
  function _showToast(message) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._modeTimer);
    toast._modeTimer = setTimeout(function() {
      toast.classList.remove('show');
    }, 2500);
  }
  
  // ── Auto init when DOM ready ──
  function _autoInit() {
    // Read initial mode and apply to DOM silently
    _currentMode = _getStoredMode();
    document.body.setAttribute('data-mode', _currentMode);
  }
  
  // Apply mode to body immediately (before full init)
  if (document.body) {
    _autoInit();
  } else {
    document.addEventListener('DOMContentLoaded', _autoInit);
  }
  
  // ── Public API ──
  return {
    init: init,
    setMode: setMode,
    toggle: toggle,
    getMode: getMode,
    isExamMode: isExamMode,
    isReadMode: isReadMode,
    onChange: onChange,
    MODES: MODES
  };
  
}());