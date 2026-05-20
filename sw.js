/* ============================================
   SW.JS — Service Worker
   Caching strategies for offline support
   ============================================ */

const CACHE_VERSION  = 'v1.0.0';
const CACHE_SHELL    = `mts-shell-${CACHE_VERSION}`;
const CACHE_DATA     = `mts-data-${CACHE_VERSION}`;
const CACHE_DYNAMIC  = `mts-dynamic-${CACHE_VERSION}`;

// ── App Shell files (Cache First) ──
const SHELL_FILES = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './css/root.css',
  './css/home.css',
  './css/sets.css',
  './css/quiz.css',
  './css/results.css',
  './js/app.js',
  './js/pwa.js',
  './js/storage.js',
  './js/manifest-loader.js',
  './js/mode-toggle.js',
  './js/quiz-engine.js',
  './js/timer.js',
  './js/results-manager.js',
  './pages/pyq.html',
  './pages/practice.html',
  './pages/quiz.html',
  './pages/results.html',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

// ── Question data files (Stale While Revalidate) ──
const DATA_PATTERNS = [
  /\/data\/pyq\//,
  /\/data\/practice\//
];

// ── Font patterns (Cache First) ──
const FONT_PATTERNS = [
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/
];

/* ─────────────────────────────────────────
   INSTALL — Cache app shell
───────────────────────────────────────── */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');

  event.waitUntil(
    caches.open(CACHE_SHELL)
      .then(cache => {
        console.log('[SW] Caching app shell...');
        // Add files one by one so one failure doesn't break all
        return Promise.allSettled(
          SHELL_FILES.map(file =>
            cache.add(file).catch(err =>
              console.warn(`[SW] Failed to cache: ${file}`, err)
            )
          )
        );
      })
      .then(() => {
        console.log('[SW] Shell cached');
        return self.skipWaiting();
      })
  );
});

/* ─────────────────────────────────────────
   ACTIVATE — Clean old caches
───────────────────────────────────────── */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');

  const validCaches = [CACHE_SHELL, CACHE_DATA, CACHE_DYNAMIC];

  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => !validCaches.includes(key))
            .map(key => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ─────────────────────────────────────────
   FETCH — Route requests
───────────────────────────────────────── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET & chrome-extension requests
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // ── Route to strategy ──

  // 1. Font files → Cache First
  if (FONT_PATTERNS.some(p => p.test(request.url))) {
    event.respondWith(_cacheFirst(request, CACHE_SHELL));
    return;
  }

  // 2. Question JSON data → Stale While Revalidate
  if (DATA_PATTERNS.some(p => p.test(request.url))) {
    event.respondWith(_staleWhileRevalidate(request, CACHE_DATA));
    return;
  }

  // 3. manifest.json → Network First (check for new sets)
  if (request.url.includes('manifest.json')) {
    event.respondWith(_networkFirst(request, CACHE_SHELL));
    return;
  }

  // 4. App Shell (HTML, CSS, JS) → Cache First
  if (
    request.destination === 'document' ||
    request.destination === 'style'    ||
    request.destination === 'script'   ||
    request.destination === 'image'
  ) {
    event.respondWith(_cacheFirst(request, CACHE_SHELL));
    return;
  }

  // 5. Everything else → Network with dynamic cache fallback
  event.respondWith(_networkWithDynamicCache(request));
});

/* ─────────────────────────────────────────
   STRATEGIES
───────────────────────────────────────── */

// Cache First → good for static assets
async function _cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return _offlineFallback(request);
  }
}

// Network First → good for manifest / dynamic content
async function _networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return _offlineFallback(request);
  }
}

// Stale While Revalidate → serve cache instantly, update in background
async function _staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Fetch in background
  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Return cached immediately, or wait for network
  return cached || fetchPromise || _offlineFallback(request);
}

// Network with dynamic cache
async function _networkWithDynamicCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_DYNAMIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return _offlineFallback(request);
  }
}

// Offline fallback
async function _offlineFallback(request) {
  if (request.destination === 'document') {
    const cached = await caches.match('./offline.html');
    return cached || new Response(
      '<h1>Offline</h1><p>Please check your connection.</p>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
  return new Response('Offline', { status: 503 });
}

/* ─────────────────────────────────────────
   MESSAGE — Handle skip waiting
───────────────────────────────────────── */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: CACHE_VERSION });
  }
});