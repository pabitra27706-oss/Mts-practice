/* ============================================
   TIMER.JS
   Countdown timer — reads time from manifest
   ============================================ */

const Timer = (() => {
  
  // ── State ──
  let _totalSeconds = 0;
  let _remainingSeconds = 0;
  let _intervalId = null;
  let _isRunning = false;
  let _isPaused = false;
  let _startTime = null;
  let _callbacks = {
    onTick: null,
    onWarning: null,
    onDanger: null,
    onExpire: null
  };
  
  // Thresholds
  const WARNING_THRESHOLD = 0.25; // 25% time left
  const DANGER_THRESHOLD = 0.10; // 10% time left
  
  // ── Init with seconds ──
  function init(totalSeconds, callbacks = {}) {
    _totalSeconds = totalSeconds;
    _remainingSeconds = totalSeconds;
    _isRunning = false;
    _isPaused = false;
    _startTime = null;
    _intervalId = null;
    
    // Merge callbacks
    _callbacks = {
      onTick: callbacks.onTick || null,
      onWarning: callbacks.onWarning || null,
      onDanger: callbacks.onDanger || null,
      onExpire: callbacks.onExpire || null
    };
    
    // Render initial display
    _render(_remainingSeconds);
    
    console.log(`[Timer] Initialized: ${totalSeconds}s`);
  }
  
  // ── Start ──
  function start() {
    if (_isRunning) return;
    if (_remainingSeconds <= 0) return;
    
    _isRunning = true;
    _isPaused = false;
    _startTime = Date.now();
    
    _intervalId = setInterval(_tick, 1000);
    console.log('[Timer] Started');
  }
  
  // ── Pause ──
  function pause() {
    if (!_isRunning || _isPaused) return;
    _isPaused = true;
    _isRunning = false;
    clearInterval(_intervalId);
    console.log('[Timer] Paused');
  }
  
  // ── Resume ──
  function resume() {
    if (_isRunning || !_isPaused) return;
    _isPaused = false;
    start();
    console.log('[Timer] Resumed');
  }
  
  // ── Stop ──
  function stop() {
    clearInterval(_intervalId);
    _isRunning = false;
    _isPaused = false;
    console.log('[Timer] Stopped');
  }
  
  // ── Reset ──
  function reset() {
    stop();
    _remainingSeconds = _totalSeconds;
    _render(_remainingSeconds);
    _resetTimerStyle();
    console.log('[Timer] Reset');
  }
  
  // ── Tick ──
  function _tick() {
    _remainingSeconds--;
    
    // Render
    _render(_remainingSeconds);
    
    // Callbacks
    if (_callbacks.onTick) {
      _callbacks.onTick(_remainingSeconds, _totalSeconds);
    }
    
    // Warning threshold
    const ratio = _remainingSeconds / _totalSeconds;
    
    if (ratio <= DANGER_THRESHOLD) {
      _setTimerState('danger');
      if (_callbacks.onDanger) _callbacks.onDanger(_remainingSeconds);
    } else if (ratio <= WARNING_THRESHOLD) {
      _setTimerState('warning');
      if (_callbacks.onWarning) _callbacks.onWarning(_remainingSeconds);
    }
    
    // Expired
    if (_remainingSeconds <= 0) {
      stop();
      if (_callbacks.onExpire) _callbacks.onExpire();
    }
  }
  
  // ── Render time to display ──
  function _render(seconds) {
    const display = document.getElementById('timerDisplay');
    if (!display) return;
    
    display.textContent = formatTime(seconds);
  }
  
  // ── Set timer visual state ──
  function _setTimerState(state) {
    const el = document.getElementById('timerEl');
    if (!el) return;
    
    el.className = `timer timer--${state}`;
  }
  
  // ── Reset timer style ──
  function _resetTimerStyle() {
    const el = document.getElementById('timerEl');
    if (el) el.className = 'timer';
  }
  
  // ── Format seconds → MM:SS ──
  function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  
  // ── Get elapsed seconds ──
  function getElapsed() {
    return _totalSeconds - _remainingSeconds;
  }
  
  // ── Get remaining seconds ──
  function getRemaining() {
    return _remainingSeconds;
  }
  
  // ── Is running ──
  function isRunning() {
    return _isRunning;
  }
  
  // ── Show / Hide timer ──
  function show() {
    const el = document.getElementById('timerEl');
    const rd = document.getElementById('readBadge');
    if (el) el.classList.remove('hidden');
    if (rd) rd.classList.add('hidden');
  }
  
  function hide() {
    const el = document.getElementById('timerEl');
    const rd = document.getElementById('readBadge');
    if (el) el.classList.add('hidden');
    if (rd) rd.classList.remove('hidden');
  }
  
  // ── Public API ──
  return {
    init,
    start,
    pause,
    resume,
    stop,
    reset,
    formatTime,
    getElapsed,
    getRemaining,
    isRunning,
    show,
    hide
  };
  
})();