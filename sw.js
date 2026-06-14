'use strict';

const CACHE = 'hex-realms-v9';
const ASSETS = [
  '.',
  'index.html',
  'manifest.json',
  'icon.svg',
  'css/style.css',
  'js/constants.js',
  'js/hex.js',
  'js/sprites.js',
  'js/audio.js',
  'js/mapgen.js',
  'js/realmaps.js',
  'js/custommaps.js',
  'js/game.js',
  'js/renderer.js',
  'js/ai.js',
  'js/haptics.js',
  'js/save.js',
  'js/mapeditor.js',
  'js/main.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
