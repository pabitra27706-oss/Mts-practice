/* ============================================
   PWA.JS — FIXED Install Prompt
   Works on Chrome, Edge, iOS Safari, Firefox
   ============================================ */

(function() {

  var _deferredPrompt = null;
  var _isInstalled    = false;
  var _isIOS          = false;
  var _isStandalone   = false;

  // ── Init ──
  function init() {
    _detectPlatform();
    _registerServiceWorker();
    _listenInstallPrompt();
    _handleOnlineOffline();
    _checkAndShowInstallBanner();
  }

  // ── Detect platform ──
  function _detectPlatform() {
    var ua = window.navigator.userAgent.toLowerCase();

    // Detect iOS
    _isIOS = /iphone|ipad|ipod/.test(ua) &&
             !window.MSStream;

    // Detect standalone (already installed)
    _isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.indexOf('android-app://') === 0;

    if (_isStandalone) {
      _isInstalled = true;
      document.body.classList.add('pwa-installed');
      console.log('[PWA] Already installed');
    }

    console.log('[PWA] Platform — iOS:', _isIOS,
      '| Standalone:', _isStandalone);
  }

  // ── Get base path ──
  function _getBasePath() {
    var path = window.location.pathname;

    if (path.indexOf('/pages/') !== -1) {
      return path.substring(0, path.indexOf('/pages/') + 1)
        .replace(/pages\/$/, '');
    }

    if (path.lastIndexOf('/') !== path.length - 1) {
      path = path.substring(0, path.lastIndexOf('/') + 1);
    }

    return path;
  }

  // ── Register Service Worker ──
  async function _registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.log('[PWA] SW not supported');
      return;
    }

    try {
      var swPath  = _getBasePath() + 'sw.js';
      var swScope = _getBasePath();

      console.log('[PWA] Registering SW:', swPath, 'scope:', swScope);

      var reg = await navigator.serviceWorker.register(swPath, {
        scope: swScope
      });

      console.log('[PWA] SW registered ✅, scope:', reg.scope);

      // Listen for updates
      reg.addEventListener('updatefound', function() {
        var newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', function() {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            _showUpdateToast();
          }
        });
      });

    } catch (err) {
      console.error('[PWA] SW registration failed:', err);
    }
  }

  // ── Listen for install prompt (Android/Chrome/Edge) ──
  function _listenInstallPrompt() {
    window.addEventListener('beforeinstallprompt', function(e) {
      console.log('[PWA] beforeinstallprompt fired ✅');

      // Prevent automatic prompt
      e.preventDefault();
      _deferredPrompt = e;

      // Show our custom install banner
      _showInstallBanner();
    });

    // Fired when app gets installed
    window.addEventListener('appinstalled', function() {
      console.log('[PWA] App installed ✅');
      _isInstalled    = true;
      _deferredPrompt = null;
      _hideInstallBanner();
      _showStatusToast('🎉 App installed successfully!', 'success');
    });
  }

  // ── Check & decide to show banner ──
  function _checkAndShowInstallBanner() {
    // Don't show if already installed
    if (_isInstalled) return;

    // Don't show if user dismissed recently
    var dismissed = localStorage.getItem('mts_install_dismissed');
    if (dismissed) {
      var dismissTime = parseInt(dismissed, 10);
      var daysSince   = (Date.now() - dismissTime) / (1000 * 60 * 60 * 24);
      // Show again after 3 days
      if (daysSince < 3) {
        console.log('[PWA] Install dismissed', daysSince.toFixed(1), 'days ago');
        return;
      }
    }

    // iOS Safari — show iOS-specific banner
    if (_isIOS && !_isStandalone) {
      // Wait a bit so it doesn't block initial load
      setTimeout(_showIOSInstallBanner, 2000);
      return;
    }

    // Chrome/Edge/Android — wait for beforeinstallprompt
    // If it doesn't fire within 3 sec, show manual instructions
    setTimeout(function() {
      if (!_deferredPrompt && !_isInstalled && !_isIOS) {
        console.log('[PWA] beforeinstallprompt did not fire');
        // Still show banner with manual instructions
        _showManualInstallBanner();
      }
    }, 3000);
  }

  // ── Show install banner (Chrome/Edge with deferred prompt) ──
  function _showInstallBanner() {
    var banner = document.getElementById('installBanner');
    if (!banner) {
      console.warn('[PWA] installBanner element not found');
      return;
    }

    banner.classList.remove('hidden');

    // Update text for native install
    var title = banner.querySelector('.install-banner__title');
    var sub   = banner.querySelector('.install-banner__sub');
    if (title) title.textContent = 'Install MTS Prep';
    if (sub)   sub.textContent   = 'Use offline, faster access';

    _bindInstallButtons(promptInstall);
  }

  // ── Show iOS install banner ──
  function _showIOSInstallBanner() {
    var banner = document.getElementById('installBanner');
    if (!banner) return;

    banner.classList.remove('hidden');

    // Update content for iOS
    var icon  = banner.querySelector('.install-banner__icon');
    var title = banner.querySelector('.install-banner__title');
    var sub   = banner.querySelector('.install-banner__sub');
    var btn   = banner.querySelector('#installBtn');

    if (icon)  icon.textContent  = '📱';
    if (title) title.textContent = 'Install on iPhone';
    if (sub)   sub.textContent   = 'Tap Share → Add to Home Screen';
    if (btn) {
      btn.textContent = 'How?';
      btn.onclick     = _showIOSInstructions;
    }

    _bindCloseButton();
  }

  // ── Show manual install banner (browsers without prompt) ──
  function _showManualInstallBanner() {
    var banner = document.getElementById('installBanner');
    if (!banner) return;

    banner.classList.remove('hidden');

    var icon  = banner.querySelector('.install-banner__icon');
    var title = banner.querySelector('.install-banner__title');
    var sub   = banner.querySelector('.install-banner__sub');
    var btn   = banner.querySelector('#installBtn');

    if (icon)  icon.textContent  = '📲';
    if (title) title.textContent = 'Install MTS Prep';
    if (sub)   sub.textContent   = 'Get the app for offline access';
    if (btn) {
      btn.textContent = 'Install';
      btn.onclick     = _showManualInstructions;
    }

    _bindCloseButton();
  }

  // ── Bind install + close buttons ──
  function _bindInstallButtons(installAction) {
    var installBtn = document.getElementById('installBtn');
    if (installBtn) {
      // Remove old listeners by cloning
      var newBtn = installBtn.cloneNode(true);
      installBtn.parentNode.replaceChild(newBtn, installBtn);
      newBtn.addEventListener('click', installAction);
    }
    _bindCloseButton();
  }

  function _bindCloseButton() {
    var closeBtn = document.getElementById('installClose');
    if (!closeBtn) return;

    var newBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newBtn, closeBtn);

    newBtn.addEventListener('click', function() {
      _hideInstallBanner();
      // Save dismiss time
      localStorage.setItem(
        'mts_install_dismissed',
        Date.now().toString()
      );
      _showStatusToast(
        'You can install later from browser menu',
        'info'
      );
    });
  }

  // ── Hide install banner ──
  function _hideInstallBanner() {
    var banner = document.getElementById('installBanner');
    if (banner) banner.classList.add('hidden');
  }

  // ── Prompt install (Chrome/Edge) ──
  async function promptInstall() {
    if (!_deferredPrompt) {
      console.warn('[PWA] No deferred prompt available');
      _showManualInstructions();
      return;
    }

    try {
      _deferredPrompt.prompt();
      var result = await _deferredPrompt.userChoice;

      console.log('[PWA] Install outcome:', result.outcome);

      if (result.outcome === 'accepted') {
        _showStatusToast('🎉 Installing...', 'success');
      }

      _deferredPrompt = null;
      _hideInstallBanner();

    } catch (err) {
      console.error('[PWA] Install prompt error:', err);
      _showManualInstructions();
    }
  }

  // ── Show iOS install instructions modal ──
  function _showIOSInstructions() {
    _showInstructionsModal({
      title: '📱 Install on iPhone',
      steps: [
        { icon: '⬇️',
          text: 'Tap the <strong>Share</strong> button at the bottom of Safari' },
        { icon: '📋',
          text: 'Scroll down and tap <strong>Add to Home Screen</strong>' },
        { icon: '✅',
          text: 'Tap <strong>Add</strong> in the top right' },
        { icon: '🎉',
          text: 'Open MTS Prep from your home screen!' }
      ]
    });
  }

  // ── Show manual install instructions ──
  function _showManualInstructions() {
    var ua = navigator.userAgent.toLowerCase();
    var isFirefox = ua.indexOf('firefox') !== -1;
    var isChrome  = ua.indexOf('chrome') !== -1;
    var isEdge    = ua.indexOf('edg/') !== -1;

    var steps;

    if (isFirefox) {
      steps = [
        { icon: '⋮',  text: 'Tap the <strong>menu</strong> button (three dots)' },
        { icon: '📲', text: 'Select <strong>Install</strong> or <strong>Add to Home Screen</strong>' },
        { icon: '✅', text: 'Confirm installation' }
      ];
    } else if (isEdge) {
      steps = [
        { icon: '⋯',  text: 'Tap the <strong>menu</strong> (three dots)' },
        { icon: '📱', text: 'Tap <strong>Apps</strong> → <strong>Install this site</strong>' },
        { icon: '✅', text: 'Confirm to install' }
      ];
    } else {
      steps = [
        { icon: '⋮',  text: 'Tap the <strong>menu</strong> button (three dots)' },
        { icon: '📲', text: 'Tap <strong>Install app</strong> or <strong>Add to Home Screen</strong>' },
        { icon: '✅', text: 'Tap <strong>Install</strong> to confirm' }
      ];
    }

    _showInstructionsModal({
      title: '📲 Install MTS Prep',
      steps: steps
    });
  }

  // ── Show instructions modal ──
  function _showInstructionsModal(config) {
    // Remove any existing modal
    var existing = document.getElementById('installModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id        = 'installModal';
    modal.className = 'install-modal';
    modal.setAttribute('role',       'dialog');
    modal.setAttribute('aria-modal', 'true');

    var stepsHTML = '';
    for (var i = 0; i < config.steps.length; i++) {
      var step = config.steps[i];
      stepsHTML +=
        '<div class="install-step">' +
          '<div class="install-step__num">' + (i + 1) + '</div>' +
          '<div class="install-step__icon">' + step.icon + '</div>' +
          '<div class="install-step__text">' + step.text + '</div>' +
        '</div>';
    }

    modal.innerHTML =
      '<div class="install-modal__backdrop"></div>' +
      '<div class="install-modal__dialog">' +
        '<button class="install-modal__close" aria-label="Close">✕</button>' +
        '<h2 class="install-modal__title">' + config.title + '</h2>' +
        '<div class="install-modal__steps">' + stepsHTML + '</div>' +
        '<div class="install-modal__benefit">' +
          '<strong>Why install?</strong><br>' +
          '✓ Works offline<br>' +
          '✓ Faster loading<br>' +
          '✓ App-like experience<br>' +
          '✓ Home screen access' +
        '</div>' +
        '<button class="btn btn--primary btn--full install-modal__btn">' +
          'Got it!' +
        '</button>' +
      '</div>';

    document.body.appendChild(modal);

    // Animate in
    requestAnimationFrame(function() {
      modal.classList.add('install-modal--show');
    });

    // Close handlers
    var closeBtn   = modal.querySelector('.install-modal__close');
    var gotItBtn   = modal.querySelector('.install-modal__btn');
    var backdrop   = modal.querySelector('.install-modal__backdrop');

    function closeModal() {
      modal.classList.remove('install-modal--show');
      setTimeout(function() {
        modal.remove();
      }, 300);
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (gotItBtn) gotItBtn.addEventListener('click', closeModal);
    if (backdrop) backdrop.addEventListener('click', closeModal);
  }

  // ── Online / Offline ──
  function _handleOnlineOffline() {
    window.addEventListener('online', function() {
      document.body.classList.remove('offline');
      _showStatusToast('✅ Back online', 'success');
    });

    window.addEventListener('offline', function() {
      document.body.classList.add('offline');
      _showStatusToast('📴 Offline — cached content available', 'warning');
    });

    if (!navigator.onLine) {
      document.body.classList.add('offline');
    }
  }

  // ── Update toast ──
  function _showUpdateToast() {
    var toast = document.getElementById('toast');
    if (!toast) return;

    toast.innerHTML =
      '🔄 New version available! ' +
      '<button onclick="window.location.reload()" style="' +
        'margin-left:8px;' +
        'background:var(--primary);' +
        'color:#fff;' +
        'border:none;' +
        'padding:4px 12px;' +
        'border-radius:999px;' +
        'font-size:0.75rem;' +
        'cursor:pointer;' +
        'font-weight:600;">' +
      'Update</button>';
    toast.classList.add('show');
  }

  // ── Status toast ──
  function _showStatusToast(msg, type) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function() {
      toast.classList.remove('show');
    }, 3000);
  }

  // ── Public API ──
  window.PWA = {
    init:           init,
    promptInstall:  promptInstall,
    isInstalled:    function() { return _isInstalled; },
    showInstructions: _showManualInstructions
  };

  // ── Auto init ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());