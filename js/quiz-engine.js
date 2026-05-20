/* ============================================
   QUIZ-ENGINE.JS — SCROLL + SWIPE FIX
   Replace full file with this version
   ============================================ */

const QuizEngine = (() => {

  // ── State ──
  let _setConfig    = null;
  let _questions    = [];
  let _answers      = {};
  let _currentIndex = 0;
  let _mode         = 'exam';
  let _type         = 'pyq';
  let _isSubmitted  = false;
  let _isReviewMode = false;
  let _startTime    = null;

  // ── Swipe state ──
  let _touchStartX  = 0;
  let _touchStartY  = 0;
  let _touchEndX    = 0;
  let _touchEndY    = 0;
  const SWIPE_MIN   = 50;  // minimum px to count as swipe
  const SWIPE_MAX_Y = 80;  // max vertical movement allowed

  // ── Init ──
  async function init() {
    console.log('[QuizEngine] Initializing...');

    // Apply theme
    try {
      var raw   = localStorage.getItem('mts_settings');
      var theme = 'dark';
      if (raw) {
        var obj = JSON.parse(raw);
        theme   = obj.theme || 'dark';
      }
      document.documentElement.setAttribute('data-theme', theme);
    } catch(e) {}

    // Parse URL params
    const params = new URLSearchParams(window.location.search);
    const setId  = params.get('setId');
    const type   = params.get('type') || 'pyq';
    const mode   = params.get('mode') || _getSavedMode();

    _type = type;
    _mode = mode;

    if (!setId) {
      _showError('No set specified. Please go back and select a set.');
      return;
    }

    // Load set config
    try {
      _setConfig = await ManifestLoader.getSetById(setId);
      if (!_setConfig) throw new Error('Set not found: ' + setId);
    } catch (err) {
      _showError('Could not load set configuration: ' + err.message);
      return;
    }

    document.title = _setConfig.name + ' — MTS Prep';

    // Load questions
    try {
      _questions = await ManifestLoader.loadQuestions(_setConfig);
      if (_questions.length === 0) throw new Error('No questions in set');
    } catch (err) {
      _showError('Could not load questions: ' + err.message);
      return;
    }

    // Setup
    _setupHeader();
    _setupTimer();
    _setupNavGrid();
    _setupControls();
    _setupSwipe();
    _renderQuestion(0);
    _showQuizArea();

    _startTime = Date.now();

    if (_mode === 'exam') Timer.start();

    console.log('[QuizEngine] Ready:', _questions.length, 'questions');
  }

  // ── Get saved mode ──
  function _getSavedMode() {
    try {
      var raw = localStorage.getItem('mts_settings');
      if (!raw) return 'exam';
      return JSON.parse(raw).mode || 'exam';
    } catch(e) { return 'exam'; }
  }

  // ─────────────────────────────────────────
  // SETUP
  // ─────────────────────────────────────────

  function _setupHeader() {
    _setEl('quizSetName', _setConfig.name);
    _setEl('quizMeta',
      _questions.length + ' Questions · ' +
      (_mode === 'exam' ? '🎯 Exam Mode' : '📖 Read Mode')
    );
  }

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
      Timer.hide();
    }
  }

  function _setupNavGrid() {
    const grid = document.getElementById('navGrid');
    if (!grid) return;
    grid.innerHTML = '';

    _questions.forEach(function(_, index) {
      const dot = document.createElement('button');
      dot.className   = 'nav-dot';
      dot.textContent = index + 1;
      dot.setAttribute('role', 'listitem');
      dot.setAttribute('aria-label', 'Go to question ' + (index + 1));
      dot.dataset.index = index;
      dot.addEventListener('click', function() {
        _goTo(index);
      });
      grid.appendChild(dot);
    });

    _updateNavGrid();
  }

  function _setupControls() {
    var prevBtn = document.getElementById('prevBtn');
    var nextBtn = document.getElementById('nextBtn');
    if (prevBtn) prevBtn.addEventListener('click', _prevQuestion);
    if (nextBtn) nextBtn.addEventListener('click', _nextQuestion);

    var submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.addEventListener('click', _handleSubmitClick);

    var confirmSubmit = document.getElementById('confirmSubmitBtn');
    var confirmCancel = document.getElementById('confirmCancelBtn');
    if (confirmSubmit) confirmSubmit.addEventListener('click', _submitQuiz);
    if (confirmCancel) confirmCancel.addEventListener('click', _hideConfirm);

    var reviewBtn = document.getElementById('reviewBtn');
    var retryBtn  = document.getElementById('retryBtn');
    var homeBtn   = document.getElementById('homeBtn');
    if (reviewBtn) reviewBtn.addEventListener('click', _enterReviewMode);
    if (retryBtn)  retryBtn.addEventListener('click',  _retryQuiz);
    if (homeBtn)   homeBtn.addEventListener('click',   _goHome);

    var bookmarkBtn = document.getElementById('bookmarkBtn');
    if (bookmarkBtn) bookmarkBtn.addEventListener('click', _toggleBookmark);

    var backBtn = document.getElementById('backBtn');
    if (backBtn) backBtn.addEventListener('click', _handleBack);

    document.addEventListener('keydown', _handleKeyboard);
  }

  // ─────────────────────────────────────────
  // SWIPE GESTURE SETUP
  // ─────────────────────────────────────────

  function _setupSwipe() {
    var quizMain = document.getElementById('quizMain');
    if (!quizMain) return;

    // Touch start
    quizMain.addEventListener('touchstart', function(e) {
      _touchStartX = e.changedTouches[0].screenX;
      _touchStartY = e.changedTouches[0].screenY;
      _touchEndX   = _touchStartX;
      _touchEndY   = _touchStartY;
    }, { passive: true });

    // Touch move — track position
    quizMain.addEventListener('touchmove', function(e) {
      _touchEndX = e.changedTouches[0].screenX;
      _touchEndY = e.changedTouches[0].screenY;
    }, { passive: true });

    // Touch end — detect swipe
    quizMain.addEventListener('touchend', function(e) {
      _touchEndX = e.changedTouches[0].screenX;
      _touchEndY = e.changedTouches[0].screenY;
      _handleSwipe();
    }, { passive: true });
  }

  // ── Handle swipe direction ──
  function _handleSwipe() {
    var deltaX = _touchEndX - _touchStartX;
    var deltaY = _touchEndY - _touchStartY;

    // Must be mostly horizontal
    if (Math.abs(deltaY) > SWIPE_MAX_Y) return;

    // Must meet minimum distance
    if (Math.abs(deltaX) < SWIPE_MIN) return;

    if (deltaX < 0) {
      // Swipe LEFT → next question
      if (_currentIndex < _questions.length - 1) {
        _nextQuestion();
        _showSwipeHint('next');
      }
    } else {
      // Swipe RIGHT → previous question
      if (_currentIndex > 0) {
        _prevQuestion();
        _showSwipeHint('prev');
      }
    }
  }

  // ── Show swipe visual hint ──
  function _showSwipeHint(direction) {
    var hint = document.getElementById('swipeHint');
    if (!hint) return;

    hint.textContent  = direction === 'next' ? '→' : '←';
    hint.className    = 'swipe-hint swipe-hint--show';

    clearTimeout(hint._timer);
    hint._timer = setTimeout(function() {
      hint.className = 'swipe-hint';
    }, 600);
  }

  // ─────────────────────────────────────────
  // QUESTION RENDERING
  // ─────────────────────────────────────────

  function _renderQuestion(index) {
    if (index < 0 || index >= _questions.length) return;

    _currentIndex = index;
    const q       = _questions[index];
    const selected = _answers[index];

    // Animate card slide
    _animateQuestionCard(index);

    _setEl('qNumBadge', index + 1);
    _setEl('qNumText',  'Question ' + (index + 1) + ' of ' + _questions.length);
    _setEl('subjectBadge', q.subject || 'General');
    _setEl('questionText', q.question || '');

    _renderOptions(q, selected);
    _renderExplanation(q, selected);

    _updateNavGrid();
    _updateNavButtons();
    _updateProgress();
    _updateSubmitButton();
    _updateBookmarkBtn(index);

    // ── FIXED SCROLL ──
    // Scroll so question card is visible below sticky header
    _scrollToQuestion();
  }

  // ── Scroll to question card properly ──
  function _scrollToQuestion() {
    requestAnimationFrame(function() {
      var header     = document.querySelector('.quiz-header');
      var card       = document.getElementById('questionCard');
      if (!card) return;

      var headerH    = header ? header.offsetHeight : 0;
      var cardTop    = card.getBoundingClientRect().top;
      var scrollTop  = window.pageYOffset || document.documentElement.scrollTop;

      // Extra padding so it feels comfortable (16px gap below header)
      var targetY    = scrollTop + cardTop - headerH - 16;

      // Only scroll if card is not already visible
      var windowH    = window.innerHeight;
      var cardBottom = card.getBoundingClientRect().bottom;

      var isVisible  = (cardTop >= headerH) &&
                       (cardBottom <= windowH - 80);

      if (!isVisible) {
        window.scrollTo({
          top:      Math.max(0, targetY),
          behavior: 'smooth'
        });
      }
    });
  }

  // ── Animate card transition ──
  function _animateQuestionCard(newIndex) {
    var card = document.getElementById('questionCard');
    if (!card) return;

    // Determine direction
    var direction = newIndex >= _currentIndex ? 'right' : 'left';

    // Slide out
    card.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
    card.style.opacity    = '0';
    card.style.transform  = direction === 'right'
      ? 'translateX(-20px)'
      : 'translateX(20px)';

    setTimeout(function() {
      // Slide in from opposite side
      card.style.transition = 'none';
      card.style.transform  = direction === 'right'
        ? 'translateX(20px)'
        : 'translateX(-20px)';

      requestAnimationFrame(function() {
        card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        card.style.opacity    = '1';
        card.style.transform  = 'translateX(0)';
      });
    }, 150);
  }

  // ── Render options ──
  function _renderOptions(question, selectedKey) {
    const list = document.getElementById('optionsList');
    if (!list) return;

    list.innerHTML = '';
    var keys = ['A', 'B', 'C', 'D'];

    keys.forEach(function(key) {
      var text = question.options && question.options[key];
      if (!text) return;

      var li = document.createElement('li');
      li.className = 'option-item';
      li.setAttribute('role', 'radio');
      li.setAttribute('aria-checked', key === selectedKey ? 'true' : 'false');
      li.setAttribute('tabindex', '0');
      li.setAttribute('aria-label', 'Option ' + key + ': ' + text);

      if (_isSubmitted || _isReviewMode) {
        li.classList.add('option-item--disabled');
        if (key === question.correctAnswer) {
          li.classList.add('option-item--correct');
        } else if (key === selectedKey && key !== question.correctAnswer) {
          li.classList.add('option-item--wrong');
        }
      } else {
        if (key === selectedKey) {
          li.classList.add('option-item--selected');
        }
      }

      var feedbackIcon = '';
      if (_isSubmitted || _isReviewMode) {
        if (key === question.correctAnswer) {
          feedbackIcon = '<span class="option-item__feedback">✅</span>';
        } else if (key === selectedKey) {
          feedbackIcon = '<span class="option-item__feedback">❌</span>';
        }
      }

      li.innerHTML =
        '<div class="option-key">' + key + '</div>' +
        '<span class="option-text">' + _escape(text) + '</span>' +
        feedbackIcon;

      if (!_isSubmitted && !_isReviewMode) {
        li.addEventListener('click', function() {
          _selectOption(key);
        });
        li.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            _selectOption(key);
          }
        });
      }

      list.appendChild(li);
    });
  }

  // ── Select option ──
  function _selectOption(key) {
    if (_isSubmitted || _isReviewMode) return;

    var q = _questions[_currentIndex];
    _answers[_currentIndex] = key;

    if (_mode === 'read') {
      _renderOptions(q, key);
      _renderExplanation(q, key);
      // Disable all options after selection in read mode
      document.querySelectorAll('.option-item').forEach(function(el) {
        el.classList.add('option-item--disabled');
        var optKey = el.querySelector('.option-key');
        if (optKey && optKey.textContent.trim() === q.correctAnswer) {
          el.classList.add('option-item--correct');
        }
      });
    } else {
      _renderOptions(q, key);
    }

    _updateNavGrid();
    _updateProgress();
    _updateSubmitButton();
  }

  // ── Render explanation ──
  function _renderExplanation(question, selectedKey) {
    var card = document.getElementById('explanationCard');
    var text = document.getElementById('explanationText');
    if (!card || !text) return;

    var show =
      (_mode === 'read' && selectedKey) ||
      (_isSubmitted || _isReviewMode);

    if (show && question.explanation) {
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

  function _updateNavGrid() {
    var dots = document.querySelectorAll('.nav-dot');
    dots.forEach(function(dot, index) {
      dot.className = 'nav-dot';

      if (index === _currentIndex) {
        dot.classList.add('nav-dot--current');
        dot.setAttribute('aria-current', 'true');
      } else {
        dot.removeAttribute('aria-current');
      }

      if (_answers[index] !== undefined) {
        if (_isSubmitted || _isReviewMode) {
          var correct = _answers[index] === _questions[index].correctAnswer;
          dot.classList.add(correct ? 'nav-dot--correct' : 'nav-dot--wrong');
        } else {
          dot.classList.add('nav-dot--answered');
        }
      }
    });
  }

  function _updateNavButtons() {
    var prevBtn = document.getElementById('prevBtn');
    var nextBtn = document.getElementById('nextBtn');
    if (prevBtn) prevBtn.disabled = (_currentIndex === 0);
    if (nextBtn) nextBtn.disabled = (_currentIndex === _questions.length - 1);
  }

  function _updateProgress() {
    var answered = Object.keys(_answers).length;
    var total    = _questions.length;
    var pct      = Math.round(((_currentIndex + 1) / total) * 100);

    var fill = document.getElementById('progressFill');
    if (fill) fill.style.width = pct + '%';

    _setEl('progressCount',    'Q ' + (_currentIndex + 1) + ' of ' + total);
    _setEl('progressAnswered', answered + ' Answered');
  }

  function _updateSubmitButton() {
    var btn     = document.getElementById('submitBtn');
    if (!btn) return;

    var answered = Object.keys(_answers).length;
    var total    = _questions.length;
    var allDone  = (answered === total);

    if (_isReviewMode) {
      btn.textContent = '🏠 Go Home';
      btn.className   = 'btn btn--ghost btn--full quiz-actions__submit';
      return;
    }

    if (allDone) {
      btn.textContent = '✅ Submit (' + answered + '/' + total + ')';
      btn.className   = 'btn btn--submit-ready btn--full quiz-actions__submit';
    } else {
      btn.textContent = 'Submit (' + answered + '/' + total + ' answered)';
      btn.className   = 'btn btn--submit btn--full quiz-actions__submit';
    }
  }

  // ─────────────────────────────────────────
  // BOOKMARK
  // ─────────────────────────────────────────

  function _toggleBookmark() {
    try {
      var key   = _setConfig.id + '-q' + _currentIndex;
      var added = Storage.toggleBookmark(key);
      _updateBookmarkBtn(_currentIndex);
      _showToast(added ? '🔖 Bookmarked!' : '🗑️ Removed');
    } catch(e) {}
  }

  function _updateBookmarkBtn(index) {
    var btn = document.getElementById('bookmarkBtn');
    if (!btn) return;
    try {
      var key    = _setConfig.id + '-q' + index;
      var marked = Storage.isBookmarked(key);
      btn.classList.toggle('bookmark-btn--active', marked);
      btn.setAttribute('aria-label',
        marked ? 'Remove bookmark' : 'Bookmark this question'
      );
    } catch(e) {}
  }

  // ─────────────────────────────────────────
  // TIMER
  // ─────────────────────────────────────────

  function _onTimerTick(remaining, total) {}

  function _onTimerWarning(remaining) {
    _showToast('⚠️ ' + Timer.formatTime(remaining) + ' remaining!');
  }

  function _onTimerDanger(remaining) {}

  function _onTimerExpire() {
    _showToast('⏰ Time is up! Submitting...');
    setTimeout(_submitQuiz, 1500);
  }

  // ─────────────────────────────────────────
  // SUBMIT
  // ─────────────────────────────────────────

  function _handleSubmitClick() {
    if (_isReviewMode) { _goHome(); return; }
    if (_isSubmitted) return;
    _showConfirm();
  }

  function _showConfirm() {
    var answered = Object.keys(_answers).length;
    var total    = _questions.length;
    _setEl('confirmAnswered', answered);
    _setEl('confirmSkipped',  total - answered);
    _setEl('confirmTotal',    total);

    var overlay = document.getElementById('confirmOverlay');
    if (overlay) overlay.classList.add('show');
    if (_mode === 'exam') Timer.pause();
  }

  function _hideConfirm() {
    var overlay = document.getElementById('confirmOverlay');
    if (overlay) overlay.classList.remove('show');
    if (_mode === 'exam') Timer.resume();
  }

  function _submitQuiz() {
    if (_isSubmitted) return;
    _isSubmitted = true;
    Timer.stop();
    _hideConfirm();

    var result = _calculateResult();

    try {
      Storage.saveResult(result);
      Storage.updateSetProgress(_setConfig.id, result);
    } catch(e) {}

    _showResult(result);
    _updateNavGrid();
  }

  function _calculateResult() {
    var correct = 0, wrong = 0, skipped = 0;

    var answerDetails = _questions.map(function(q, index) {
      var selected = _answers[index];
      if (!selected) {
        skipped++;
        return {
          qId: q.id || index,
          selected: null,
          correct: q.correctAnswer,
          isCorrect: false,
          skipped: true
        };
      }
      var isCorrect = (selected === q.correctAnswer);
      if (isCorrect) correct++; else wrong++;
      return {
        qId: q.id || index,
        selected: selected,
        correct: q.correctAnswer,
        isCorrect: isCorrect,
        skipped: false
      };
    });

    var total      = _questions.length;
    var percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

    return {
      setId:     _setConfig.id,
      setName:   _setConfig.name,
      type:      _type,
      mode:      _mode,
      score:     correct,
      total:     total,
      correct:   correct,
      wrong:     wrong,
      skipped:   skipped,
      percentage: percentage,
      timeTaken: Timer.getElapsed(),
      answers:   answerDetails
    };
  }

  function _showResult(result) {
    var circle = document.getElementById('scoreCircle');
    if (circle) circle.style.setProperty('--pct', result.percentage);

    _setEl('scoreValue', result.correct + '/' + result.total);
    _setEl('scorePct',   result.percentage + '%');

    var grade = _getGrade(result.percentage);
    _setEl('resultTitle', grade.label);
    _setEl('resultSub',   grade.sub);

    _setEl('statCorrect', result.correct);
    _setEl('statWrong',   result.wrong);
    _setEl('statSkipped', result.skipped);

    var timeEl = document.getElementById('timeTakenEl');
    if (timeEl) {
      timeEl.textContent = _mode === 'exam'
        ? '⏱️ Time taken: ' + Timer.formatTime(result.timeTaken)
        : '📖 Completed in Read Mode';
    }

    var overlay = document.getElementById('resultOverlay');
    if (overlay) {
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }
  }

  function _getGrade(pct) {
    if (pct >= 90) return { label: '🏆 Excellent!',  sub: 'Outstanding performance!' };
    if (pct >= 75) return { label: '🎯 Great Job!',  sub: 'You did really well!' };
    if (pct >= 60) return { label: '👍 Good Work!',  sub: 'Above average score!' };
    if (pct >= 40) return { label: '📚 Keep Going!', sub: 'Practice more to improve.' };
    return               { label: '💪 Keep Trying!', sub: 'Review and try again.' };
  }

  // ─────────────────────────────────────────
  // REVIEW MODE
  // ─────────────────────────────────────────

  function _enterReviewMode() {
    _isReviewMode = true;

    var overlay = document.getElementById('resultOverlay');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';

    _updateSubmitButton();
    _renderQuestion(_currentIndex);
    _showToast('📋 Review mode — tap any question');
  }

  function _retryQuiz() { window.location.reload(); }
  function _goHome()    { window.location.href = '../index.html'; }

  // ─────────────────────────────────────────
  // BACK BUTTON
  // ─────────────────────────────────────────

  function _handleBack() {
    if (_isSubmitted || _isReviewMode) {
      window.history.back();
      return;
    }
    var answered = Object.keys(_answers).length;
    if (answered > 0) {
      var ok = confirm(
        'You have answered ' + answered + ' question(s).\n' +
        'Exit? Progress will be lost.'
      );
      if (!ok) return;
    }
    Timer.stop();
    window.history.back();
  }

  // ─────────────────────────────────────────
  // KEYBOARD
  // ─────────────────────────────────────────

  function _handleKeyboard(e) {
    if (e.target.tagName === 'INPUT') return;

    var confirmOpen = document.getElementById('confirmOverlay');
    var resultOpen  = document.getElementById('resultOverlay');

    if (confirmOpen && confirmOpen.classList.contains('show')) return;
    if (resultOpen  && resultOpen.classList.contains('show'))  return;

    switch(e.key) {
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

  function _showError(msg) {
    _setElVisible('loadingState', false);
    _setElVisible('quizArea',     false);
    _setElVisible('errorState',   true);
    _setEl('errorMsg', msg);
  }

  function _setEl(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function _setElVisible(id, visible) {
    var el = document.getElementById(id);
    if (!el) return;
    if (visible) el.classList.remove('hidden');
    else         el.classList.add('hidden');
  }

  function _escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _showToast(msg) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function() {
      toast.classList.remove('show');
    }, 2500);
  }

  return { init: init };

})();

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', QuizEngine.init);
} else {
  QuizEngine.init();
}