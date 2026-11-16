// Waylands Path service worker: cache everything for offline use. Bump VERSION on every release.
const VERSION = 'waylands-path-v4.3';
const ASSETS = ['./', './index.html', './style.css', './manifest.webmanifest', './version.json', './js/bez.js', './js/trace.js', './js/svgin.js', './js/laser.js', './js/app.js', './js/tools2.js', './js/tools4.js', './js/worker.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
// Network first (so updates show straight away), cache as the offline fallback.
self.addEventListener('fetch', e => { const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  if (req.mode === 'navigate') caches.keys().then(keys => keys.filter(k => k !== VERSION).forEach(k => caches.delete(k))); // tidy caches an old worker re-filled late
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html')))); });
