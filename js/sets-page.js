/* ============================================
   SETS-PAGE.JS — FIXED
   Safe ModeToggle usage + guard
   ============================================ */

if (typeof window._setsPageInit === 'undefined') {
  window._setsPageInit = true;

  window._setsState = {
    type : 'pyq',
    sets : [],
    mode : 'exam'
  };

  // ── Safe mode getter ──
  function _getSafeMode() {
    try {
      // Try ModeToggle first
      if (typeof ModeToggle !== 'undefined' && ModeToggle.getMode) {
        return ModeToggle.getMode();
      }
    } catch (e) {}

    // Fallback: read from localStorage directly
    try {
      var raw = localStorage.getItem('mts_settings');
      if (raw) {
        var obj = JSON.parse(raw);
        return obj.mode || 'exam';
      }
    } catch (e) {}

    return 'exam';
  }

  // ── Init ──
  async function _setsInit() {
    var state = window._setsState;

    // ✅ FIXED — Read type from body attribute
    state.type = document.body.getAttribute('data-page-type') || 'pyq';

    console.log('[SetsPage] ✅ Page type detected:', state.type);

    // Apply theme safely
    try {
      var raw = localStorage.getItem('mts_settings');
      var theme = 'dark';
      if (raw) {
        var obj = JSON.parse(raw);
        theme = obj.theme || 'dark';
      }
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Init ModeToggle safely
    try {
      if (typeof ModeToggle !== 'undefined' && ModeToggle.init) {
        ModeToggle.init();
        state.mode = ModeToggle.getMode();

        ModeToggle.onChange(function(newMode) {
          state.mode = newMode;
          _setsUpdateModeBadge(newMode);
        });
      } else {
        state.mode = _getSafeMode();
        console.warn('[SetsPage] ModeToggle not available, using fallback');
      }
    } catch (e) {
      state.mode = _getSafeMode();
      console.warn('[SetsPage] ModeToggle error:', e);
    }

    // Update badge
    _setsUpdateModeBadge(state.mode);

    // Load sets
    await _setsLoad();

    // Save last seen
    try {
      if (typeof Storage !== 'undefined' && Storage.setLastSeen) {
        Storage.setLastSeen(state.type);
      }
    } catch (e) {}
  }

  // ── Load sets ──
  async function _setsLoad() {
    var state = window._setsState;

    try {
      var sets;
      if (state.type === 'pyq') {
        sets = await ManifestLoader.getPYQSets();
      } else {
        sets = await ManifestLoader.getPracticeSets();
      }

      state.sets = sets || [];

      console.log('[SetsPage] ✅ Loaded', state.sets.length,
        'sets for type:', state.type);

      _setEl(
        'headerSub',
        state.sets.length +
        ' set' + (state.sets.length !== 1 ? 's' : '') +
        ' available'
      );

      _setsRender(state.sets);

    } catch (err) {
      console.error('[SetsPage] ❌ Load error:', err);
      _setsRenderError();
    }
  }

  // ── Render sets ──
  function _setsRender(sets) {
    var container = document.getElementById('setsList');
    if (!container) return;

    if (!sets || sets.length === 0) {
      _setsRenderEmpty(container);
      return;
    }

    container.innerHTML = '';

    for (var i = 0; i < sets.length; i++) {
      (function(set, index) {
        var progress = null;
        try {
          if (typeof Storage !== 'undefined' && Storage.getSetProgress) {
            progress = Storage.getSetProgress(set.id);
          }
        } catch (e) {}

        var card = _setsCreateCard(set, index + 1, progress);
        container.appendChild(card);

        setTimeout(function() {
          card.style.opacity   = '1';
          card.style.transform = 'translateY(0)';
        }, index * 80);

      })(sets[i], i);
    }
  }

  // ── Create card ──
  function _setsCreateCard(set, number, progress) {
    var state       = window._setsState;
    var card        = document.createElement('div');
    var isCompleted = progress && progress.attempted;
    var timeLabel   = ManifestLoader.getTimeLabel(set);
    var subLabel    = _setsGetSubLabel(set);
    var diffBadge   = _setsGetDiffBadge(set.difficulty);
    var modeLabel   = state.mode === 'exam' ? '🎯 Exam' : '📖 Read';

    card.className =
      'set-card set-card--' + state.type +
      (isCompleted ? ' set-card--completed' : '');

    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label',
      _escape(set.name) + ', ' +
      set.totalQuestions + ' questions, ' +
      timeLabel
    );

    card.style.opacity    = '0';
    card.style.transform  = 'translateY(16px)';
    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

    // Progress section
    var progressHTML = '';
    if (isCompleted && progress) {
      var pct   = progress.bestPercentage || 0;
      var color = pct >= 80
        ? 'var(--grad-success)'
        : pct >= 50
          ? 'var(--grad-warning)'
          : 'var(--grad-danger)';

      progressHTML =
        '<div class="set-card__progress">' +
          '<div class="set-card__progress-row">' +
            '<span class="set-card__progress-label">Best Score</span>' +
            '<span class="set-card__progress-score">' +
              (progress.bestScore || 0) + '/' + (set.totalQuestions || 0) +
              ' (' + pct + '%)' +
            '</span>' +
          '</div>' +
          '<div class="progress-bar" role="progressbar" ' +
            'aria-valuenow="' + pct + '" ' +
            'aria-valuemin="0" aria-valuemax="100">' +
            '<div class="progress-bar__fill" ' +
              'style="width:' + pct + '%;' +
              'background:' + color + ';">' +
            '</div>' +
          '</div>' +
        '</div>';
    }

    // Optional tags
    var yearHTML = set.year
      ? '<span class="set-card__meta-item">' +
          '<span>📅</span><span>' + _escape(set.year) + '</span>' +
        '</span>'
      : '';

    var topicHTML = set.topic
      ? '<span class="set-card__meta-item">' +
          '<span>📚</span><span>' + _escape(set.topic) + '</span>' +
        '</span>'
      : '';

    card.innerHTML =
      // Top row
      '<div class="set-card__top">' +
        '<div class="set-card__left">' +
          '<div class="set-card__number">' + number + '</div>' +
          '<div class="set-card__info">' +
            '<div class="set-card__name">' + _escape(set.name) + '</div>' +
            '<div class="set-card__sub">'  + _escape(subLabel) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="set-card__status">' +
          (isCompleted
            ? '<span class="badge badge--success">✓ Done</span>'
            : '<span class="badge badge--primary">New</span>'
          ) +
        '</div>' +
      '</div>' +

      // Meta row
      '<div class="set-card__meta">' +
        '<span class="set-card__meta-item">' +
          '<span>❓</span>' +
          '<span>' + (set.totalQuestions || 0) + ' Qs</span>' +
        '</span>' +
        '<span class="set-card__meta-item">' +
          '<span>⏱️</span>' +
          '<span>' + timeLabel + '</span>' +
        '</span>' +
        '<span class="set-card__meta-item">' + diffBadge + '</span>' +
        yearHTML +
        topicHTML +
      '</div>' +

      // Progress bar
      progressHTML +

      // Footer
      '<div class="set-card__footer">' +
        '<span class="set-card__action">' +
          (isCompleted ? 'Retry Set' : 'Start Set') +
          '<span class="set-card__action-arrow">→</span>' +
        '</span>' +
        '<span class="set-card__best">' +
          (isCompleted
            ? 'Attempts: <strong>' + (progress.attempts || 1) + '</strong>'
            : 'Mode: <strong>' + modeLabel + '</strong>'
          ) +
        '</span>' +
      '</div>';

    // Click handler
    card.addEventListener('click', function() {
      _setsStart(set);
    });

    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        _setsStart(set);
      }
    });

    return card;
  }

  // ── Start quiz ──
  function _setsStart(set) {
    var state  = window._setsState;
    var mode   = _getSafeMode();
    
    // ✅ Now using state.type which is correctly set from data-page-type
    var params =
      'setId=' + encodeURIComponent(set.id) +
      '&type='  + encodeURIComponent(state.type) +
      '&mode='  + encodeURIComponent(mode);

    console.log('[SetsPage] 🚀 Starting quiz:', params);

    _setsShowToast('Loading ' + set.name + '...');

    setTimeout(function() {
      window.location.href = 'quiz.html?' + params;
    }, 300);
  }

  // ── Update mode badge ──
  function _setsUpdateModeBadge(mode) {
    var emoji = document.getElementById('modeEmoji');
    var label = document.getElementById('modeLabel');
    if (emoji) emoji.textContent = mode === 'exam' ? '🎯' : '📖';
    if (label) label.textContent = mode === 'exam' ? 'Exam' : 'Read';
  }

  // ── Sub label ──
  function _setsGetSubLabel(set) {
    var parts = [];
    if (set.year)  parts.push(set.year);
    if (set.shift) parts.push(set.shift + ' Shift');
    if (set.topic) parts.push(set.topic);
    return parts.length > 0 ? parts.join(' · ') : 'Practice Set';
  }

  // ── Difficulty badge ──
  function _setsGetDiffBadge(difficulty) {
    var d = difficulty || 'medium';
    var map = {
      easy:   'badge--easy',
      medium: 'badge--medium',
      hard:   'badge--hard'
    };
    var label = d.charAt(0).toUpperCase() + d.slice(1);
    var cls   = map[d] || 'badge--medium';
    return '<span class="badge ' + cls + '">' + label + '</span>';
  }

  // ── Empty state ──
  function _setsRenderEmpty(container) {
    container.innerHTML =
      '<div class="empty-state" role="status">' +
        '<div class="empty-state__icon">📭</div>' +
        '<h3 class="empty-state__title">No Sets Available</h3>' +
        '<p class="empty-state__text">' +
          'Add question sets to manifest.json to see them here.' +
        '</p>' +
      '</div>';
  }

  // ── Error state ──
  function _setsRenderError() {
    var container = document.getElementById('setsList');
    if (!container) return;

    container.innerHTML =
      '<div class="error-state" role="alert">' +
        '<div class="error-state__icon">⚠️</div>' +
        '<h3 class="error-state__title">Failed to Load Sets</h3>' +
        '<p class="error-state__text">' +
          'Could not load manifest.json. ' +
          'Make sure you are running on a server, not file://.' +
        '</p>' +
        '<button ' +
          'class="btn btn--ghost btn--sm" ' +
          'onclick="window.location.reload()">' +
          '🔄 Retry' +
        '</button>' +
      '</div>';

    _setEl('headerSub', 'Error loading sets');
  }

  // ── Helpers ──
  function _setEl(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function _escape(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _setsShowToast(message) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function() {
      toast.classList.remove('show');
    }, 2000);
  }

  // ── Boot ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _setsInit);
  } else {
    _setsInit();
  }

} // end guard