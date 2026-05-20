/* ============================================
   RESULTS-MANAGER.JS
   Load, filter, display all results history
   ============================================ */

const ResultsManager = (() => {

  // ── State ──
  let _allResults     = [];
  let _filtered       = [];
  let _activeFilter   = 'all';
  let _activeResult   = null;

  // ── Init ──
  function init() {
    console.log('[ResultsManager] Initializing...');

    // Apply theme
    const theme = Storage.getTheme();
    document.documentElement.setAttribute('data-theme', theme || 'dark');

    // Bind theme toggle
    _bindThemeToggle();

    // Load results
    _allResults = Storage.getResults();

    // Update overview stats
    _renderStats();

    // Update filter counts
    _updateFilterCounts();

    // Render list
    _applyFilter('all');

    // Bind filter tabs
    _bindFilters();

    // Bind clear button
    _bindClear();

    // Bind detail panel close
    _bindDetailPanel();

    // Update header
    _setEl('headerSub',
      _allResults.length === 0
        ? 'No attempts yet'
        : `${_allResults.length} attempt${_allResults.length !== 1 ? 's' : ''}`
    );

    console.log('[ResultsManager] Ready');
  }

  // ─────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────

  function _renderStats() {
    const stats = Storage.getStats();

    _setEl('statAttempts', stats.totalAttempts  || '0');
    _setEl('statAvg',      `${stats.avgPercentage || 0}%`);
    _setEl('statBest',     `${stats.bestScore    || 0}%`);
    _setEl('statSets',     stats.setsCompleted   || '0');
  }

  // ─────────────────────────────────────────
  // FILTER
  // ─────────────────────────────────────────

  function _bindFilters() {
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        _applyFilter(tab.dataset.filter);
      });
    });
  }

  function _applyFilter(filter) {
    _activeFilter = filter;

    // Update tab UI
    document.querySelectorAll('.filter-tab').forEach(tab => {
      const isActive = tab.dataset.filter === filter;
      tab.classList.toggle('filter-tab--active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });

    // Filter results
    if (filter === 'all') {
      _filtered = [..._allResults];
    } else {
      _filtered = _allResults.filter(r => r.type === filter);
    }

    // Render
    _renderList(_filtered);
  }

  function _updateFilterCounts() {
    const pyqCount      = _allResults.filter(r => r.type === 'pyq').length;
    const practiceCount = _allResults.filter(r => r.type === 'practice').length;

    _setEl('countAll',      _allResults.length);
    _setEl('countPyq',      pyqCount);
    _setEl('countPractice', practiceCount);
  }

  // ─────────────────────────────────────────
  // RENDER LIST
  // ─────────────────────────────────────────

  function _renderList(results) {
    const container = document.getElementById('resultsList');
    if (!container) return;

    container.innerHTML = '';

    if (results.length === 0) {
      _renderEmpty(container);
      return;
    }

    results.forEach((result, index) => {
      const card = _createResultCard(result);
      card.style.opacity   = '0';
      card.style.transform = 'translateY(12px)';
      container.appendChild(card);

      setTimeout(() => {
        card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        card.style.opacity    = '1';
        card.style.transform  = 'translateY(0)';
      }, index * 60);
    });
  }

  // ── Create result card ──
  function _createResultCard(result) {
    const card = document.createElement('div');
    card.className = `result-card result-card--${result.type}`;
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label',
      `${result.setName}, ${result.percentage}%, ${result.dateDisplay}`
    );

    const pctClass  = _getPctClass(result.percentage);
    const modeLabel = result.mode === 'exam' ? '🎯 Exam' : '📖 Read';
    const typeLabel = result.type === 'pyq'  ? '📋 PYQ'  : '✏️ Practice';
    const timeLabel = result.timeTaken
      ? _formatTime(result.timeTaken)
      : '—';

    const progressColor = _getProgressColor(result.percentage);

    card.innerHTML = `
      <!-- Top Section -->
      <div class="result-card__top">
        <div class="result-card__left">

          <!-- Icon -->
          <div class="result-card__icon" aria-hidden="true">
            ${result.type === 'pyq' ? '📋' : '✏️'}
          </div>

          <!-- Info -->
          <div class="result-card__info">
            <div class="result-card__name">${_escape(result.setName)}</div>
            <div class="result-card__meta">
              <span class="result-card__meta-item">
                <span aria-hidden="true">📅</span>
                ${result.dateDisplay || '—'}
              </span>
              <span class="result-card__meta-item">
                ${modeLabel}
              </span>
              ${result.mode === 'exam' && result.timeTaken
                ? `<span class="result-card__meta-item">
                    <span aria-hidden="true">⏱️</span>
                    ${timeLabel}
                   </span>`
                : ''
              }
            </div>
          </div>
        </div>

        <!-- Score -->
        <div class="result-card__score">
          <span class="result-card__pct ${pctClass}" aria-label="${result.percentage}%">
            ${result.percentage}%
          </span>
          <span class="result-card__fraction">
            ${result.score}/${result.total}
          </span>
        </div>
      </div>

      <!-- Bottom Section -->
      <div class="result-card__bottom">

        <!-- Progress Bar -->
        <div class="result-card__progress"
          role="progressbar"
          aria-valuenow="${result.percentage}"
          aria-valuemin="0"
          aria-valuemax="100">
          <div
            class="result-card__progress-fill"
            style="width:${result.percentage}%;background:${progressColor};">
          </div>
        </div>

        <!-- Footer Row -->
        <div class="result-card__footer-row">
          <div class="result-card__stats" aria-label="Score breakdown">
            <span class="result-card__stat result-card__stat--correct">
              ✅ ${result.correct ?? result.score}
            </span>
            <span class="result-card__stat result-card__stat--wrong">
              ❌ ${result.wrong ?? (result.total - result.score - (result.skipped || 0))}
            </span>
            <span class="result-card__stat result-card__stat--skipped">
              ⏭️ ${result.skipped ?? 0}
            </span>
          </div>
          <span class="result-card__view" aria-hidden="true">
            Details ›
          </span>
        </div>
      </div>
    `;

    // Click → show detail panel
    card.addEventListener('click', () => _showDetail(result));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        _showDetail(result);
      }
    });

    return card;
  }

  // ── Empty state ──
  function _renderEmpty(container) {
    container.innerHTML = `
      <div class="results-empty" role="status">
        <div class="results-empty__icon" aria-hidden="true">
          ${_activeFilter === 'all' ? '📊' : _activeFilter === 'pyq' ? '📋' : '✏️'}
        </div>
        <h3 class="results-empty__title">
          ${_activeFilter === 'all' ? 'No Results Yet' : `No ${_activeFilter.toUpperCase()} Results`}
        </h3>
        <p class="results-empty__text">
          ${_activeFilter === 'all'
            ? 'Complete a quiz to see your results here!'
            : `Complete a ${_activeFilter === 'pyq' ? 'PYQ' : 'Practice'} set to see results.`
          }
        </p>
        <a
          href="${_activeFilter === 'practice' ? 'practice.html' : 'pyq.html'}"
          class="btn btn--primary btn--sm">
          Start Practicing →
        </a>
      </div>
    `;
  }

  // ─────────────────────────────────────────
  // DETAIL PANEL
  // ─────────────────────────────────────────

  function _showDetail(result) {
    _activeResult = result;

    // Build detail content
    const body = document.getElementById('detailBody');
    if (!body) return;

    const modeLabel = result.mode === 'exam' ? '🎯 Exam Mode' : '📖 Read Mode';
    const typeLabel = result.type === 'pyq'  ? '📋 PYQ'       : '✏️ Practice';
    const timeLabel = result.timeTaken ? _formatTime(result.timeTaken) : null;

    body.innerHTML = `

      <!-- Score Display -->
      <div class="detail-score">
        <div
          class="detail-score__circle"
          style="--pct:${result.percentage}"
          aria-hidden="true">
          <span class="detail-score__val">${result.score}/${result.total}</span>
          <span class="detail-score__pct">${result.percentage}%</span>
        </div>
        <div class="detail-score__info">
          <div class="detail-score__name">${_escape(result.setName)}</div>
          <div class="detail-score__tags">
            <span class="badge badge--primary">${typeLabel}</span>
            <span class="badge ${result.mode === 'exam' ? 'badge--warning' : 'badge--success'}">
              ${modeLabel}
            </span>
          </div>
          <div style="margin-top:var(--space-2);font-size:var(--text-xs);color:var(--text-muted);">
            📅 ${result.dateDisplay || '—'}
            ${timeLabel ? ` · ⏱️ ${timeLabel}` : ''}
          </div>
        </div>
      </div>

      <!-- Stats -->
      <div class="detail-stats" aria-label="Score breakdown">
        <div class="detail-stat detail-stat--correct">
          <span class="detail-stat__val">${result.correct ?? result.score}</span>
          <span class="detail-stat__label">✅ Correct</span>
        </div>
        <div class="detail-stat detail-stat--wrong">
          <span class="detail-stat__val">
            ${result.wrong ?? (result.total - result.score - (result.skipped || 0))}
          </span>
          <span class="detail-stat__label">❌ Wrong</span>
        </div>
        <div class="detail-stat detail-stat--skipped">
          <span class="detail-stat__val">${result.skipped ?? 0}</span>
          <span class="detail-stat__label">⏭️ Skipped</span>
        </div>
      </div>

      <!-- Answer Review -->
      ${result.answers && result.answers.length > 0
        ? `<div>
            <div class="detail-answers__title">Answer Summary</div>
            <div class="detail-answers__list">
              ${result.answers.map((ans, i) => _buildAnswerRow(ans, i)).join('')}
            </div>
           </div>`
        : ''
      }

      <!-- Actions -->
      <div class="detail-actions">
        <button
          class="btn btn--ghost btn--full"
          id="detailDeleteBtn"
          aria-label="Delete this result">
          🗑️ Delete This Result
        </button>
      </div>
    `;

    // Bind delete
    const deleteBtn = document.getElementById('detailDeleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => _deleteResult(result.id));
    }

    // Show panel
    const panel = document.getElementById('detailPanel');
    if (panel) {
      panel.classList.add('show');
      document.body.style.overflow = 'hidden';
    }
  }

  // ── Build answer review row ──
  function _buildAnswerRow(ans, index) {
    let cls    = '';
    let icon   = '';
    let detail = '';

    if (ans.skipped) {
      cls    = 'detail-answer-row--skipped';
      icon   = '⏭️';
      detail = `Skipped · Correct: <strong>${ans.correct}</strong>`;
    } else if (ans.isCorrect) {
      cls    = 'detail-answer-row--correct';
      icon   = '✅';
      detail = `Selected: <strong>${ans.selected}</strong> ✓`;
    } else {
      cls    = 'detail-answer-row--wrong';
      icon   = '❌';
      detail = `Selected: <strong>${ans.selected}</strong>
                · Correct: <strong>${ans.correct}</strong>`;
    }

    return `
      <div class="detail-answer-row ${cls}" role="listitem">
        <div class="detail-answer-row__num">${index + 1}</div>
        <div class="detail-answer-row__info">
          <div class="detail-answer-row__selected">${detail}</div>
        </div>
        <span class="detail-answer-row__icon" aria-hidden="true">${icon}</span>
      </div>
    `;
  }

  // ── Bind detail panel close ──
  function _bindDetailPanel() {
    const closeBtn = document.getElementById('detailClose');
    const panel    = document.getElementById('detailPanel');

    if (closeBtn) {
      closeBtn.addEventListener('click', _closeDetail);
    }

    // Click backdrop to close
    if (panel) {
      panel.addEventListener('click', (e) => {
        if (e.target === panel) _closeDetail();
      });
    }

    // ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') _closeDetail();
    });
  }

  function _closeDetail() {
    const panel = document.getElementById('detailPanel');
    if (panel) panel.classList.remove('show');
    document.body.style.overflow = '';
    _activeResult = null;
  }

  // ─────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────

  function _deleteResult(id) {
    Storage.deleteResult(id);
    _closeDetail();

    // Reload
    _allResults = Storage.getResults();
    _renderStats();
    _updateFilterCounts();
    _applyFilter(_activeFilter);

    _setEl('headerSub',
      `${_allResults.length} attempt${_allResults.length !== 1 ? 's' : ''}`
    );

    _showToast('🗑️ Result deleted');
  }

  // ─────────────────────────────────────────
  // CLEAR ALL
  // ─────────────────────────────────────────

  function _bindClear() {
    const clearBtn     = document.getElementById('clearBtn');
    const confirmDialog = document.getElementById('clearConfirm');
    const cancelBtn    = document.getElementById('clearCancelBtn');
    const confirmBtn   = document.getElementById('clearConfirmBtn');

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (_allResults.length === 0) {
          _showToast('No results to clear');
          return;
        }
        if (confirmDialog) confirmDialog.classList.add('show');
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (confirmDialog) confirmDialog.classList.remove('show');
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        Storage.clearResults();

        _allResults = [];
        _filtered   = [];

        _renderStats();
        _updateFilterCounts();
        _renderList([]);

        _setEl('headerSub', 'No attempts yet');

        if (confirmDialog) confirmDialog.classList.remove('show');

        _showToast('✅ All results cleared');
      });
    }

    // Click backdrop
    if (confirmDialog) {
      confirmDialog.addEventListener('click', (e) => {
        if (e.target === confirmDialog) {
          confirmDialog.classList.remove('show');
        }
      });
    }
  }

  // ─────────────────────────────────────────
  // THEME
  // ─────────────────────────────────────────

  function _bindThemeToggle() {
    const btn  = document.getElementById('themeToggle');
    const icon = document.getElementById('themeIcon');

    if (!btn) return;

    // Apply current
    const current = Storage.getTheme();
    if (icon) icon.textContent = current === 'light' ? '☀️' : '🌙';

    btn.addEventListener('click', () => {
      const next = Storage.getTheme() === 'dark' ? 'light' : 'dark';
      Storage.setTheme(next);
      document.documentElement.setAttribute('data-theme', next);
      if (icon) icon.textContent = next === 'light' ? '☀️' : '🌙';
      _showToast(next === 'dark' ? '🌙 Dark mode' : '☀️ Light mode');
    });
  }

  // ─────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────

  function _getPctClass(pct) {
    if (pct >= 70) return 'result-card__pct--high';
    if (pct >= 40) return 'result-card__pct--mid';
    return 'result-card__pct--low';
  }

  function _getProgressColor(pct) {
    if (pct >= 70) return 'var(--grad-success)';
    if (pct >= 40) return 'var(--grad-warning)';
    return 'var(--grad-danger)';
  }

  function _formatTime(seconds) {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function _setEl(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function _escape(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // ── Public API ──
  return { init };

})();

// ── Boot ──
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ResultsManager.init);
} else {
  ResultsManager.init();
}