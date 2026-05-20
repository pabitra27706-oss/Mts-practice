/* ============================================
   QUIZ-ENGINE.JS
   Core quiz logic — loads questions, handles
   answers, scoring, review & result saving
   ============================================ */

const QuizEngine = (() => {

  // ── State ──
  let _setConfig      = null;
  let _questions      = [];
  let _answers        = {};   // { qIndex: 'A' | 'B' | 'C' | 'D' }
  let _currentIndex   = 0;
  let _mode           = 'exam';
  let _type           = 'pyq';
  let _isSubmitted    = false;
  let _isReviewMode   = false;
  let _startTime      = null;

  // ── Init ──
  async function init() {
    console.log('[QuizEngine] Initializing...');

    // Apply saved theme
    const theme = Storage.getTheme();
    document.documentElement.setAttribute('data-theme', theme || 'dark');

    // Parse URL params
    const params  = new URLSearchParams(window.location.search);
    const setId   = params.get('setId');
    const type    = params.get('type')  || 'pyq';
    const mode    = params.get('mode')  || Storage.getMode();

    _type = type;
    _mode = mode;

    if (!setId) {
      _showError('No set specified. Please go back and select a set.');
      return;
    }

    // Load set config from manifest
    try {
      _setConfig = await ManifestLoader.getSetById(setId);
      if (!_setConfig) throw new Error('Set not found in manifest');
    } catch (err) {
      _showError('Could not load set configuration.');
      return;
    }

    // Update page title
    document.title = `${_setConfig.name} — MTS Prep`;

    // Load questions
    try {
      _questions = await ManifestLoader.loadQuestions(_setConfig);
      if (_questions.length === 0) throw new Error('No questions found');
    } catch (err) {
      _showError(`Could not load questions: ${err.message}`);
      return;
    }

    // Setup UI
    _setupHeader();
    _setupTimer();
    _setupNavGrid();
    _setupControls();
    _renderQuestion(0);

    // Show quiz area
    _showQuizArea();

    // Record start time
    _startTime = Date.now();

    // Start timer (exam mode only)
    if (_mode === 'exam') {
      Timer.start();
    }

    console.log(`[QuizEngine] Ready: ${_questions.length} questions, mode: ${_mode}`);
  }

  // ─────────────────────────────────────────
  // SETUP
  // ─────────────────────────────────────────

  // ── Setup header info ──
  function _setupHeader() {
    _setEl('quizSetName', _setConfig.name);

    const sub = [
      `${_questions.length} Questions`,
      _mode === 'exam' ? '🎯 Exam Mode' : '📖 Read Mode'
    ].join(' · ');

    _setEl('quizMeta', sub);
  }

  // ── Setup timer (from manifest config) ──
  function _setupTimer() {
    const seconds = _setConfig.timeInSeconds || 1500;

    if (_mode === 'exam') {
      Timer.init(seconds, {
        onTick:    _onTimerTick,
        onWarning: _onTimerWarning,
        onDanger:  _onTimerDanger,
        onExpire:  _onTimerExpire
      });
      Timer.show();
    } else {
      // Read mode — hide timer, show read badge
      Timer.hide();
    }
  }

  // ── Build navigator grid ──
  function _setupNavGrid() {
    const grid = document.getElementById('navGrid');
    if (!grid) return;

    grid.innerHTML = '';

    _questions.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.className        = 'nav-dot';
      dot.textContent      = index + 1;
      dot.setAttribute('role', 'listitem');
      dot.setAttribute('aria-label', `Go to question ${index + 1}`);
      dot.dataset.index    = index;

      dot.addEventListener('click', () => {
        _goTo(index);
      });

      grid.appendChild(dot);
    });

    _updateNavGrid();
  }

  // ── Setup control buttons ──
  function _setupControls() {
    // Prev / Next
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    if (prevBtn) prevBtn.addEventListener('click', _prevQuestion);
    if (nextBtn) nextBtn.addEventListener('click', _nextQuestion);

    // Submit button
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.addEventListener('click', _handleSubmitClick);

    // Confirm dialog
    const confirmSubmit = document.getElementById('confirmSubmitBtn');
    const confirmCancel = document.getElementById('confirmCancelBtn');

    if (confirmSubmit) confirmSubmit.addEventListener('click', _submitQuiz);
    if (confirmCancel) confirmCancel.addEventListener('click', _hideConfirm);

    // Result buttons
    const reviewBtn = document.getElementById('reviewBtn');
    const retryBtn  = document.getElementById('retryBtn');
    const homeBtn   = document.getElementById('homeBtn');

    if (reviewBtn) reviewBtn.addEventListener('click', _enterReviewMode);
    if (retryBtn)  retryBtn.addEventListener('click',  _retryQuiz);
    if (homeBtn)   homeBtn.addEventListener('click',   _goHome);

    // Bookmark button
    const bookmarkBtn = document.getElementById('bookmarkBtn');
    if (bookmarkBtn) bookmarkBtn.addEventListener('click', _toggleBookmark);

    // Back button
    const backBtn = document.getElementById('backBtn');
    if (backBtn) backBtn.addEventListener('click', _handleBack);

    // Keyboard navigation
    document.addEventListener('keydown', _handleKeyboard);
  }

  // ─────────────────────────────────────────
  // QUESTION RENDERING
  // ─────────────────────────────────────────

  // ── Render question at index ──
  function _renderQuestion(index) {
    if (index < 0 || index >= _questions.length) return;

    _currentIndex = index;
    const q       = _questions[index];
    const selected = _answers[index];

    // Animate card
    const card = document.getElementById('questionCard');
    if (card) {
      card.style.opacity   = '0';
      card.style.transform = 'translateX(20px)';
      setTimeout(() => {
        card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        card.style.opacity    = '1';
        card.style.transform  = 'translateX(0)';
      }, 50);
    }

    // Question number
    _setEl('qNumBadge', index + 1);
    _setEl('qNumText',  `Question ${index + 1} of ${_questions.length}`);

    // Subject badge
    _setEl('subjectBadge', q.subject || 'General');

    // Question text
    _setEl('questionText', q.question || '');

    // Options
    _renderOptions(q, selected);

    // Explanation (read mode, if answered)
    _renderExplanation(q, selected);

    // Update nav
    _updateNavGrid();
    _updateNavButtons();
    _updateProgress();
    _updateSubmitButton();
    _updateBookmarkBtn(index);

    // Scroll to top of question
    const qCard = document.getElementById('questionCard');
    if (qCard) qCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Render answer options ──
  function _renderOptions(question, selectedKey) {
    const list = document.getElementById('optionsList');
    if (!list) return;

    list.innerHTML = '';

    const optionKeys = ['A', 'B', 'C', 'D'];

    optionKeys.forEach(key => {
      const text = question.options?.[key];
      if (!text) return;

      const li = document.createElement('li');
      li.className = 'option-item';
      li.setAttribute('role', 'radio');
      li.setAttribute('aria-checked', key === selectedKey ? 'true' : 'false');
      li.setAttribute('aria-label', `Option ${key}: ${text}`);
      li.setAttribute('tabindex', '0');

      // Apply state classes
      if (_isSubmitted || _isReviewMode) {
        // After submit — show correct / wrong
        li.classList.add('option-item--disabled');

        if (key === question.correctAnswer) {
          li.classList.add('option-item--correct');
        } else if (key === selectedKey && key !== question.correctAnswer) {
          li.classList.add('option-item--wrong');
        }
      } else {
        // Before submit
        if (key === selectedKey) {
          li.classList.add('option-item--selected');
        }
      }

      // Feedback icon (review mode)
      let feedbackIcon = '';
      if (_isSubmitted || _isReviewMode) {
        if (key === question.correctAnswer) {
          feedbackIcon = `<span class="option-item__feedback" aria-hidden="true">✅</span>`;
        } else if (key === selectedKey) {
          feedbackIcon = `<span class="option-item__feedback" aria-hidden="true">❌</span>`;
        }
      }

      li.innerHTML = `
        <div class="option-key" aria-hidden="true">${key}</div>
        <span class="option-text">${_escape(text)}</span>
        ${feedbackIcon}
      `;

      // Click handler (only before submit)
      if (!_isSubmitted && !_isReviewMode) {
        li.addEventListener('click', () => _selectOption(key));
        li.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            _selectOption(key);
          }
        });
      }

      list.appendChild(li);
    });
  }

  // ── Select an option ──
  function _selectOption(key) {
    if (_isSubmitted || _isReviewMode) return;

    const q = _questions[_currentIndex];

    _answers[_currentIndex] = key;

    // Read mode — instant feedback
    if (_mode === 'read') {
      _renderOptions(q, key);
      _renderExplanation(q, key);
      // Mark options as disabled after selection in read mode
      document.querySelectorAll('.option-item').forEach(el => {
        el.classList.add('option-item--disabled');
        if (!el.classList.contains('option-item--correct') &&
            !el.classList.contains('option-item--wrong')) {
          // Show correct answer
          const optKey = el.querySelector('.option-key')?.textContent;
          if (optKey === q.correctAnswer) {
            el.classList.add('option-item--correct');
          }
        }
      });
    } else {
      // Exam mode — just highlight selected
      _renderOptions(q, key);
    }

    _updateNavGrid();
    _updateProgress();
    _updateSubmitButton();
  }

  // ── Render explanation ──
  function _renderExplanation(question, selectedKey) {
    const card = document.getElementById('explanationCard');
    const text  = document.getElementById('explanationText');

    if (!card || !text) return;

    const shouldShow =
      (_mode === 'read' && selectedKey) ||
      (_isSubmitted || _isReviewMode);

    if (shouldShow && question.explanation) {
      text.textContent = question.explanation;
      card.classList.add('visible');
    } else {
      card.classList.remove('visible');
    }
  }

  // ─────────────────────────────────────────
  // NAVIGATION
  // ─────────────────────────────────────────

  function _nextQuestion() {
    if (_currentIndex < _questions.length - 1) {
      _renderQuestion(_currentIndex + 1);
    }
  }

  function _prevQuestion() {
    if (_currentIndex > 0) {
      _renderQuestion(_currentIndex - 1);
    }
  }

  function _goTo(index) {
    if (index >= 0 && index < _questions.length) {
      _renderQuestion(index);
    }
  }

  // ── Update nav grid dots ──
  function _updateNavGrid() {
    const dots = document.querySelectorAll('.nav-dot');

    dots.forEach((dot, index) => {
      dot.className = 'nav-dot';

      if (index === _currentIndex) {
        dot.classList.add('nav-dot--current');
        dot.setAttribute('aria-current', 'true');
      } else {
        dot.removeAttribute('aria-current');
      }

      if (_answers[index] !== undefined) {
        if (_isSubmitted || _isReviewMode) {
          const q       = _questions[index];
          const correct = _answers[index] === q.correctAnswer;
          dot.classList.add(correct ? 'nav-dot--correct' : 'nav-dot--wrong');
        } else {
          dot.classList.add('nav-dot--answered');
        }
      }
    });
  }

  // ── Update prev/next buttons ──
  function _updateNavButtons() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    if (prevBtn) prevBtn.disabled = _currentIndex === 0;
    if (nextBtn) nextBtn.disabled = _currentIndex === _questions.length - 1;
  }

  // ── Update progress bar ──
  function _updateProgress() {
    const answered = Object.keys(_answers).length;
    const total    = _questions.length;
    const pct      = Math.round(((_currentIndex + 1) / total) * 100);

    const fill = document.getElementById('progressFill');
    if (fill) fill.style.width = `${pct}%`;

    _setEl('progressCount',    `Q ${_currentIndex + 1} of ${total}`);
    _setEl('progressAnswered', `${answered} Answered`);
  }

  // ── Update submit button ──
  function _updateSubmitButton() {
    const btn      = document.getElementById('submitBtn');
    if (!btn) return;

    const answered = Object.keys(_answers).length;
    const total    = _questions.length;
    const allDone  = answered === total;

    if (_isReviewMode) {
      btn.textContent = '🏠 Go Home';
      btn.className   = 'btn btn--ghost btn--full quiz-actions__submit';
      return;
    }

    if (allDone) {
      btn.textContent = `✅ Submit (${answered}/${total})`;
      btn.className   = 'btn btn--submit-ready btn--full quiz-actions__submit';
    } else {
      btn.textContent = `Submit (${answered}/${total} answered)`;
      btn.className   = 'btn btn--submit btn--full quiz-actions__submit';
    }
  }

  // ─────────────────────────────────────────
  // BOOKMARK
  // ─────────────────────────────────────────

  function _toggleBookmark() {
    const key   = `${_setConfig.id}-q${_currentIndex}`;
    const added = Storage.toggleBookmark(key);
    _updateBookmarkBtn(_currentIndex);
    _showToast(added ? '🔖 Bookmarked!' : '🗑️ Bookmark removed');
  }

  function _updateBookmarkBtn(index) {
    const btn = document.getElementById('bookmarkBtn');
    if (!btn) return;

    const key       = `${_setConfig.id}-q${index}`;
    const marked    = Storage.isBookmarked(key);

    btn.classList.toggle('bookmark-btn--active', marked);
    btn.setAttribute('aria-label', marked ? 'Remove bookmark' : 'Bookmark this question');
    btn.title = marked ? 'Remove bookmark' : 'Bookmark';
  }

  // ─────────────────────────────────────────
  // TIMER CALLBACKS
  // ─────────────────────────────────────────

  function _onTimerTick(remaining, total) {
    // Optional: update anything on each tick
  }

  function _onTimerWarning(remaining) {
    _showToast(`⚠️ ${Timer.formatTime(remaining)} remaining!`);
  }

  function _onTimerDanger(remaining) {
    // Danger state handled by timer CSS
  }

  function _onTimerExpire() {
    _showToast('⏰ Time is up! Submitting...');
    setTimeout(_submitQuiz, 1500);
  }

  // ─────────────────────────────────────────
  // SUBMIT
  // ─────────────────────────────────────────

  // ── Submit button click ──
  function _handleSubmitClick() {
    if (_isReviewMode) {
      _goHome();
      return;
    }

    if (_isSubmitted) return;

    // Show confirm dialog
    _showConfirm();
  }

  // ── Show confirm dialog ──
  function _showConfirm() {
    const answered = Object.keys(_answers).length;
    const total    = _questions.length;
    const skipped  = total - answered;

    _setEl('confirmAnswered', answered);
    _setEl('confirmSkipped',  skipped);
    _setEl('confirmTotal',    total);

    const overlay = document.getElementById('confirmOverlay');
    if (overlay) overlay.classList.add('show');

    // Pause timer while confirming
    if (_mode === 'exam') Timer.pause();
  }

  // ── Hide confirm dialog ──
  function _hideConfirm() {
    const overlay = document.getElementById('confirmOverlay');
    if (overlay) overlay.classList.remove('show');

    // Resume timer
    if (_mode === 'exam') Timer.resume();
  }

  // ── Submit quiz ──
  function _submitQuiz() {
    if (_isSubmitted) return;

    _isSubmitted = true;
    Timer.stop();

    _hideConfirm();

    // Calculate score
    const result = _calculateResult();

    // Save to storage
    Storage.saveResult(result);
    Storage.updateSetProgress(_setConfig.id, result);

    // Show result overlay
    _showResult(result);

    // Update nav grid to show correct/wrong
    _updateNavGrid();

    console.log('[QuizEngine] Submitted:', result);
  }

  // ── Calculate result ──
  function _calculateResult() {
    let correct  = 0;
    let wrong    = 0;
    let skipped  = 0;

    const answerDetails = _questions.map((q, index) => {
      const selected = _answers[index];

      if (!selected) {
        skipped++;
        return {
          qId:      q.id || index,
          selected: null,
          correct:  q.correctAnswer,
          isCorrect: false,
          skipped:  true
        };
      }

      const isCorrect = selected === q.correctAnswer;
      if (isCorrect) correct++;
      else           wrong++;

      return {
        qId:       q.id || index,
        selected,
        correct:   q.correctAnswer,
        isCorrect,
        skipped:   false
      };
    });

    const total      = _questions.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    const elapsed    = Timer.getElapsed();

    return {
      setId:      _setConfig.id,
      setName:    _setConfig.name,
      type:       _type,
      mode:       _mode,
      score:      correct,
      total,
      correct,
      wrong,
      skipped,
      percentage,
      timeTaken:  elapsed,
      answers:    answerDetails
    };
  }

  // ── Show result overlay ──
  function _showResult(result) {
    // Score circle
    const circle = document.getElementById('scoreCircle');
    if (circle) circle.style.setProperty('--pct', result.percentage);

    _setEl('scoreValue',  `${result.correct}/${result.total}`);
    _setEl('scorePct',    `${result.percentage}%`);

    // Grade label
    const grade = _getGradeLabel(result.percentage);
    _setEl('resultTitle', grade.label);
    _setEl('resultSub',   grade.sub);

    // Stats
    _setEl('statCorrect', result.correct);
    _setEl('statWrong',   result.wrong);
    _setEl('statSkipped', result.skipped);

    // Time taken
    const timeEl = document.getElementById('timeTakenEl');
    if (timeEl) {
      if (_mode === 'exam') {
        timeEl.textContent = `⏱️ Time taken: ${Timer.formatTime(result.timeTaken)}`;
      } else {
        timeEl.textContent = '📖 Completed in Read Mode';
      }
    }

    // Show overlay
    const overlay = document.getElementById('resultOverlay');
    if (overlay) {
      overlay.classList.add('show');
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    }
  }

  // ── Grade label by percentage ──
  function _getGradeLabel(pct) {
    if (pct >= 90) return { label: '🏆 Excellent!',    sub: 'Outstanding performance!' };
    if (pct >= 75) return { label: '🎯 Great Job!',    sub: 'You did really well!' };
    if (pct >= 60) return { label: '👍 Good Work!',    sub: 'Above average score!' };
    if (pct >= 40) return { label: '📚 Keep Going!',   sub: 'Practice more to improve.' };
    return               { label: '💪 Keep Trying!',   sub: 'Review answers and try again.' };
  }

  // ─────────────────────────────────────────
  // REVIEW MODE
  // ─────────────────────────────────────────

  function _enterReviewMode() {
    _isReviewMode = true;

    // Hide result overlay
    const overlay = document.getElementById('resultOverlay');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';

    // Update submit button
    _updateSubmitButton();

    // Re-render current question with review styles
    _renderQuestion(_currentIndex);

    // Update legend to show correct/wrong
    const legend = document.getElementById('legendCurrent');
    if (legend) {
      legend.innerHTML = `
        <div class="nav-legend__dot"
          style="background:rgba(16,185,129,0.3);border:1.5px solid var(--success);">
        </div>
        <span>Correct</span>
      `;
    }

    // Add wrong legend
    const legendWrong = document.createElement('div');
    legendWrong.className = 'nav-legend__item';
    legendWrong.innerHTML = `
      <div class="nav-legend__dot"
        style="background:rgba(239,68,68,0.2);border:1.5px solid var(--danger);">
      </div>
      <span>Wrong</span>
    `;
    const navLegend = document.querySelector('.nav-legend');
    if (navLegend) navLegend.appendChild(legendWrong);

    _showToast('📋 Review mode — tap any question');
  }

  // ─────────────────────────────────────────
  // RESULT ACTIONS
  // ─────────────────────────────────────────

  function _retryQuiz() {
    // Reload page with same params
    window.location.reload();
  }

  function _goHome() {
    window.location.href = '../index.html';
  }

  // ─────────────────────────────────────────
  // BACK BUTTON
  // ─────────────────────────────────────────

  function _handleBack() {
    if (_isSubmitted || _isReviewMode) {
      window.history.back();
      return;
    }

    // If quiz in progress — confirm exit
    const answered = Object.keys(_answers).length;
    if (answered > 0) {
      const confirmed = confirm(
        `You have answered ${answered} question(s).\nAre you sure you want to exit? Progress will be lost.`
      );
      if (!confirmed) return;
    }

    Timer.stop();
    window.history.back();
  }

  // ─────────────────────────────────────────
  // KEYBOARD NAVIGATION
  // ─────────────────────────────────────────

  function _handleKeyboard(e) {
    // Don't interfere with dialogs or inputs
    if (e.target.tagName === 'INPUT') return;
    if (document.getElementById('confirmOverlay')?.classList.contains('show')) return;
    if (document.getElementById('resultOverlay')?.classList.contains('show')) return;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        _nextQuestion();
        break;

      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        _prevQuestion();
        break;

      case '1': case 'a': case 'A':
        if (!_isSubmitted && !_isReviewMode) _selectOption('A');
        break;
      case '2': case 'b': case 'B':
        if (!_isSubmitted && !_isReviewMode) _selectOption('B');
        break;
      case '3': case 'c': case 'C':
        if (!_isSubmitted && !_isReviewMode) _selectOption('C');
        break;
      case '4': case 'd': case 'D':
        if (!_isSubmitted && !_isReviewMode) _selectOption('D');
        break;

      case 'Enter':
        if (!_isSubmitted) _handleSubmitClick();
        break;

      case 'Escape':
        _hideConfirm();
        break;
    }
  }

  // ─────────────────────────────────────────
  // UI HELPERS
  // ─────────────────────────────────────────

  function _showQuizArea() {
    _setElVisible('loadingState', false);
    _setElVisible('errorState',   false);
    _setElVisible('quizArea',     true);
  }

  function _showError(message) {
    _setElVisible('loadingState', false);
    _setElVisible('quizArea',     false);
    _setElVisible('errorState',   true);
    _setEl('errorMsg', message);
  }

  function _setEl(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function _setElVisible(id, visible) {
    const el = document.getElementById(id);
    if (!el) return;
    if (visible) el.classList.remove('hidden');
    else         el.classList.add('hidden');
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
  document.addEventListener('DOMContentLoaded', QuizEngine.init);
} else {
  QuizEngine.init();
}