/* ============================================
   PYQ-PAGE.JS — Dedicated PYQ handler
   ============================================ */

(function() {
  'use strict';
  
  var state = {
    type: 'pyq',
    sets: [],
    mode: 'exam'
  };
  
  function getSafeMode() {
    try {
      if (typeof ModeToggle !== 'undefined' && ModeToggle.getMode) {
        return ModeToggle.getMode();
      }
    } catch (e) {}
    
    try {
      var raw = localStorage.getItem('mts_settings');
      if (raw) {
        return JSON.parse(raw).mode || 'exam';
      }
    } catch (e) {}
    
    return 'exam';
  }
  
  async function init() {
    // Apply theme
    try {
      var raw = localStorage.getItem('mts_settings');
      var theme = raw ? (JSON.parse(raw).theme || 'dark') : 'dark';
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    
    // Init mode toggle
    try {
      if (typeof ModeToggle !== 'undefined' && ModeToggle.init) {
        ModeToggle.init();
        state.mode = ModeToggle.getMode();
        ModeToggle.onChange(function(newMode) {
          state.mode = newMode;
          updateModeBadge(newMode);
        });
      } else {
        state.mode = getSafeMode();
      }
    } catch (e) {
      state.mode = getSafeMode();
    }
    
    updateModeBadge(state.mode);
    await loadSets();
  }
  
  async function loadSets() {
    try {
      var sets = await ManifestLoader.getPYQSets();
      state.sets = sets || [];
      
      var el = document.getElementById('headerSub');
      if (el) {
        el.textContent = state.sets.length + ' set' +
          (state.sets.length !== 1 ? 's' : '') + ' available';
      }
      
      renderSets(state.sets);
    } catch (err) {
      renderError();
    }
  }
  
  function renderSets(sets) {
    var container = document.getElementById('setsList');
    if (!container) return;
    
    if (!sets || sets.length === 0) {
      renderEmpty(container);
      return;
    }
    
    container.innerHTML = '';
    
    sets.forEach(function(set, index) {
      var progress = null;
      try {
        if (typeof Storage !== 'undefined' && Storage.getSetProgress) {
          progress = Storage.getSetProgress(set.id);
        }
      } catch (e) {}
      
      var card = createCard(set, index + 1, progress);
      container.appendChild(card);
      
      setTimeout(function() {
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, index * 80);
    });
  }
  
  function createCard(set, number, progress) {
    var card = document.createElement('div');
    var isCompleted = progress && progress.attempted;
    var timeLabel = ManifestLoader.getTimeLabel(set);
    
    card.className = 'set-card set-card--pyq' +
      (isCompleted ? ' set-card--completed' : '');
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.style.opacity = '0';
    card.style.transform = 'translateY(16px)';
    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    
    var progressHTML = '';
    if (isCompleted && progress) {
      var pct = progress.bestPercentage || 0;
      var color = pct >= 80 ? 'var(--grad-success)' :
        pct >= 50 ? 'var(--grad-warning)' : 'var(--grad-danger)';
      progressHTML =
        '<div class="set-card__progress">' +
        '<div class="set-card__progress-row">' +
        '<span class="set-card__progress-label">Best Score</span>' +
        '<span class="set-card__progress-score">' +
        (progress.bestScore || 0) + '/' + set.totalQuestions +
        ' (' + pct + '%)' +
        '</span>' +
        '</div>' +
        '<div class="progress-bar">' +
        '<div class="progress-bar__fill" style="width:' + pct + '%;background:' + color + '"></div>' +
        '</div>' +
        '</div>';
    }
    
    var yearHTML = set.year ?
      '<span class="set-card__meta-item"><span>📅</span><span>' +
      set.year + '</span></span>' : '';
    
    var shiftHTML = set.shift ?
      '<span class="set-card__meta-item"><span>🕐</span><span>' +
      set.shift + '</span></span>' : '';
    
    card.innerHTML =
      '<div class="set-card__top">' +
      '<div class="set-card__left">' +
      '<div class="set-card__number">' + number + '</div>' +
      '<div class="set-card__info">' +
      '<div class="set-card__name">' + set.name + '</div>' +
      '<div class="set-card__sub">' +
      (set.year || '') + (set.shift ? ' · ' + set.shift + ' Shift' : '') +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="set-card__status">' +
      (isCompleted ?
        '<span class="badge badge--success">✓ Done</span>' :
        '<span class="badge badge--primary">New</span>') +
      '</div>' +
      '</div>' +
      '<div class="set-card__meta">' +
      '<span class="set-card__meta-item"><span>❓</span><span>' +
      set.totalQuestions + ' Qs</span></span>' +
      '<span class="set-card__meta-item"><span>⏱️</span><span>' +
      timeLabel + '</span></span>' +
      '<span class="badge badge--' + (set.difficulty || 'medium') + '">' +
      (set.difficulty || 'medium') + '</span>' +
      yearHTML + shiftHTML +
      '</div>' +
      progressHTML +
      '<div class="set-card__footer">' +
      '<span class="set-card__action">' +
      (isCompleted ? 'Retry Set' : 'Start Set') +
      '<span class="set-card__action-arrow">→</span>' +
      '</span>' +
      '<span class="set-card__best">' +
      (isCompleted ?
        'Attempts: <strong>' + (progress.attempts || 1) + '</strong>' :
        'Mode: <strong>' + (state.mode === 'exam' ? '🎯 Exam' : '📖 Read') + '</strong>') +
      '</span>' +
      '</div>';
    
    card.addEventListener('click', function() {
      startQuiz(set);
    });
    
    return card;
  }
  
  function startQuiz(set) {
    var mode = getSafeMode();
    var params = 'setId=' + set.id + '&type=pyq&mode=' + mode;
    
    var toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = 'Loading ' + set.name + '...';
      toast.classList.add('show');
      setTimeout(function() {
        toast.classList.remove('show');
      }, 2000);
    }
    
    setTimeout(function() {
      window.location.href = 'quiz.html?' + params;
    }, 300);
  }
  
  function updateModeBadge(mode) {
    var emoji = document.getElementById('modeEmoji');
    var label = document.getElementById('modeLabel');
    if (emoji) emoji.textContent = mode === 'exam' ? '🎯' : '📖';
    if (label) label.textContent = mode === 'exam' ? 'Exam' : 'Read';
  }
  
  function renderEmpty(container) {
    container.innerHTML =
      '<div class="empty-state">' +
      '<div class="empty-state__icon">📭</div>' +
      '<h3>No PYQ Sets Available</h3>' +
      '<p>Check back soon for previous year questions!</p>' +
      '</div>';
  }
  
  function renderError() {
    var container = document.getElementById('setsList');
    if (!container) return;
    container.innerHTML =
      '<div class="error-state">' +
      '<div class="error-state__icon">⚠️</div>' +
      '<h3>Failed to Load Sets</h3>' +
      '<button class="btn btn--ghost btn--sm" onclick="location.reload()">🔄 Retry</button>' +
      '</div>';
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();